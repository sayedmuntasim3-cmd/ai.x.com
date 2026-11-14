import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { CategoryId, Option } from "./data";
import { ArrowUpRightIcon, CheckIcon, ChevronDownIcon, CloseIcon, CopyIcon, DownloadIcon, ImageIcon, SearchIcon } from "./icons";
import { SOURCE_GROUPS, SOURCES } from "./media/catalog";
import { mergeResults, terms } from "./media/rank";
import type { License, MediaResult, RightsLevel, SourceReport } from "./media/types";
import { Select } from "./select";

// The visual library: one search across every connected archive, streamed from /api/media/search
// (worker/index.ts). Results appear as each archive answers and are re-ranked as more arrive.

const container = "mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8";
const eyebrow = "text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-ink";
const LIMIT = 120;
const PAGE = 24;

const RIGHTS_OPTIONS: Option<RightsLevel>[] = [
  { id: "attribution", label: "Free with credit", hint: "Public domain, CC0 and CC BY. Recommended" },
  { id: "no-attribution", label: "No credit needed", hint: "Public domain and CC0 only" },
  { id: "share-alike", label: "Include share-alike", hint: "Adds CC BY-SA: edited versions must share alike" },
];

const SUGGESTIONS: Record<CategoryId, string[]> = {
  nature: ["Snow leopard", "Rainforest canopy", "Wildebeest migration"],
  ocean: ["Coral reef", "Humpback whale", "Lighthouse storm"],
  space: ["Pillars of Creation", "Saturn", "Aurora from space"],
  history: ["Mughal miniature", "Silk Road", "Steam locomotive"],
  science: ["Brain anatomy", "Microscope", "Honeybee"],
  culture: ["Night market", "Hokusai wave", "Jazz musicians"],
};

// Words that make an idea read well but make a poor image search.
const FILLER = new Set(
  "documentary film story stories life lives secret forgotten brutal quietly beautiful beauty fragility journey rise fall how why what people built build keep keeps single great last first one through across inside day days told edge matter matters think thousand trillions km years year our us we they them that could would should hold hunt turns turn moment more than race useful supports support born dies die make makes alive travelled standing see seen busiest world world's".split(
    " ",
  ),
);

/** Turns a written idea into a short search: proper names first, then the first content words. */
export function visualQuery(text: string) {
  const clean = text.replace(/[“”"]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  // Capitalised runs that do not start a sentence: "Silk Road", "Mughal Empire", "New Orleans".
  const proper: string[] = [];
  for (const sentence of clean.split(/[.!?]+\s*/)) {
    let run: string[] = [];
    const flush = () => {
      if (run.length) proper.push(run.join(" "));
      run = [];
    };
    sentence.split(" ").forEach((word, i) => {
      const bare = word.replace(/[^\p{L}'-]/gu, "");
      if (i > 0 && /^\p{Lu}/u.test(bare)) run.push(bare);
      else flush();
      if (/[,;:]$/.test(word)) flush();
    });
    flush();
  }
  const words = terms(clean).filter((w) => !FILLER.has(w) && !/^\d/.test(w));
  const picked: string[] = [];
  for (const name of proper) if (picked.join(" ").split(" ").length < 3) picked.push(name);
  for (const w of words) {
    if (picked.join(" ").split(" ").length >= 3) break;
    if (!picked.some((p) => p.toLowerCase().includes(w))) picked.push(w);
  }
  return picked.join(" ").slice(0, 80);
}

function shortLicense(l: License) {
  if (l.code === "cc-by") return "CC BY";
  if (l.code === "cc-by-sa") return "CC BY-SA";
  if (l.code === "cc0") return "CC0";
  if (l.code === "unsplash") return "Unsplash";
  if (l.code === "pixabay") return "Pixabay";
  return "Public domain";
}

function licenseNote(l: License) {
  if (l.shareAlike) return "Free to use with a credit. If you edit the image (crop, grade, animate), the edited version must be shared under the same licence.";
  if (l.attribution) return "Free to use in a commercial film, edits allowed. Put the credit line in your end titles.";
  if (l.code === "no-known-restrictions") return "The archive knows of no copyright restrictions. A credit is still good practice.";
  if (l.code === "unsplash" || l.code === "pixabay") return "Free for commercial use without a credit. Do not resell the image on its own.";
  return "Public domain: free for any use. A credit is still good practice.";
}

type Phase = "idle" | "loading" | "done" | "error";
type SourceMeta = { id: string; enabled: boolean };

export function Library({ idea, topic, request }: { idea: string; topic: CategoryId; request: { query: string; n: number } | null }) {
  const [query, setQuery] = useState("");
  const [rights, setRights] = useState<RightsLevel>("attribution");
  const [hdOnly, setHdOnly] = useState(false);
  const [landscape, setLandscape] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [results, setResults] = useState<MediaResult[]>([]);
  const [reports, setReports] = useState<Map<string, SourceReport>>(new Map());
  const [tookMs, setTookMs] = useState(0);
  const [shown, setShown] = useState(PAGE);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<MediaResult | null>(null);
  const [enabled, setEnabled] = useState<Set<string> | null>(null);
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSearch = useRef("");

  // Which archives are switched on in this deployment (some need a key).
  useEffect(() => {
    fetch("/api/media/sources")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { sources?: SourceMeta[] } | null) => {
        if (data?.sources) setEnabled(new Set(data.sources.filter((s) => s.enabled).map((s) => s.id)));
      })
      .catch(() => {});
  }, []);

  const search = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (q.length < 2) {
        inputRef.current?.focus();
        return;
      }
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      lastSearch.current = q;
      setPhase("loading");
      setError("");
      setResults([]);
      setReports(new Map());
      setShown(PAGE);
      setBroken(new Set());

      const params = new URLSearchParams({ q, topic, rights, stream: "1", per: "12", limit: String(LIMIT) });
      if (hdOnly) params.set("min", "1920");
      if (landscape) params.set("orientation", "landscape");

      try {
        const res = await fetch(`/api/media/search?${params}`, { signal: ac.signal });
        if (res.status === 429) throw new Error("Too many searches in a short time. Try again in a minute.");
        if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) {
          throw new Error("The image search is not available on this copy of the site.");
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let all: MediaResult[] = [];
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line);
            if (event.type === "start") {
              setReports(new Map((event.sources as SourceReport[]).map((s) => [s.id, s])));
            } else if (event.type === "source") {
              all = all.concat(event.results as MediaResult[]);
              setResults(mergeResults(all, LIMIT));
              setReports((prev) => new Map(prev).set(event.report.id, event.report));
            } else if (event.type === "done") {
              setTookMs(event.tookMs);
            }
          }
        }
        if (!ac.signal.aborted) setPhase("done");
      } catch (err) {
        if (ac.signal.aborted) return;
        setPhase("error");
        setError(err instanceof Error && !/JSON|fetch|network/i.test(err.message) ? err.message : "The archives could not be reached. Check your connection and try again.");
      }
    },
    [topic, rights, hdOnly, landscape],
  );

  // Re-run the current search when a filter changes.
  const filters = `${rights}|${hdOnly}|${landscape}`;
  const firstFilters = useRef(filters);
  useEffect(() => {
    if (filters === firstFilters.current) return;
    firstFilters.current = filters;
    if (lastSearch.current) search(lastSearch.current);
  }, [filters, search]);

  // "Find visuals" in the brief hands a query over from the studio.
  useEffect(() => {
    if (!request) return;
    setQuery(request.query);
    search(request.query);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => controller.current?.abort(), []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    search(query);
  };

  const fromIdea = visualQuery(idea);
  const visible = useMemo(() => results.filter((r) => !broken.has(r.id)), [results, broken]);
  const answered = [...reports.values()].filter((r) => r.status !== "pending" && r.status !== "needs-key" && r.status !== "skipped").length;
  const running = [...reports.values()].filter((r) => r.status !== "needs-key" && r.status !== "skipped").length;
  const contributing = [...reports.values()].filter((r) => r.count > 0).length;
  const connected = enabled ? SOURCES.filter((s) => enabled.has(s.id)).length : SOURCES.filter((s) => !s.keys?.length).length;

  return (
    <section id="library" aria-labelledby="library-title" className="relative z-10 mt-24 scroll-mt-6 sm:mt-32">
      <div className={container}>
        <p className={eyebrow}>Visual library</p>
        <h2 id="library-title" className="mt-3 max-w-2xl text-balance font-serif text-[36px] font-normal leading-[1.06] tracking-[-0.015em] sm:text-[52px]">
          Every frame, from the world&rsquo;s open archives
        </h2>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-ink-2 sm:text-[17px]">
          One search reaches NASA, ESA/Hubble and Webb, the Met, the Rijksmuseum, the Library of Congress, Wikimedia Commons and{" "}
          <span suppressHydrationWarning>{Math.max(0, connected - 6)}</span> more archives at once. Only images cleared for commercial films come back, ranked
          for resolution, relevance and how well they fill a 16:9 frame.
        </p>

        <form role="search" aria-label="Search the visual library" onSubmit={submit} className="mt-8">
          <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-surface p-1.5 shadow-card transition focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
            <SearchIcon size={22} className="ml-2.5 shrink-0 text-muted" />
            <label htmlFor="library-query" className="sr-only">
              Search for images
            </label>
            <input
              id="library-query"
              ref={inputRef}
              type="search"
              value={query}
              maxLength={200}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a subject, place, person or era…"
              autoComplete="off"
              enterKeyHint="search"
              className="h-12 min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted focus-visible:outline-none"
            />
            <button
              type="submit"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-brand-gradient px-4 text-[15px] font-semibold text-white shadow-cta transition hover:brightness-110 active:scale-[0.98] sm:px-5"
            >
              <span className="hidden min-[400px]:inline">Search</span>
              <SearchIcon size={18} className="min-[400px]:hidden" />
              <span className="sr-only min-[400px]:hidden">Search</span>
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {fromIdea && (
              <Chip
                onClick={() => {
                  setQuery(fromIdea);
                  search(fromIdea);
                }}
                strong
              >
                Use my idea: <span className="max-w-[12rem] truncate font-normal">{fromIdea}</span>
              </Chip>
            )}
            <Toggle pressed={hdOnly} onChange={setHdOnly}>
              HD and up
            </Toggle>
            <Toggle pressed={landscape} onChange={setLandscape}>
              Fits 16:9
            </Toggle>
            <Select
              label="Licences"
              triggerLabel={`Licences: ${RIGHTS_OPTIONS.find((o) => o.id === rights)?.label}`}
              value={rights}
              options={RIGHTS_OPTIONS}
              onChange={setRights}
              triggerClassName="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong px-3.5 text-[13.5px] font-medium text-ink-2 transition hover:border-ink/40 hover:text-ink"
            >
              {RIGHTS_OPTIONS.find((o) => o.id === rights)?.label}
              <ChevronDownIcon size={16} className="text-muted" />
            </Select>
          </div>
        </form>

        <div className={phase === "idle" ? "" : "mt-6 min-h-[28px]"} aria-live="polite">
          {phase === "loading" && (
            <div className="flex flex-wrap items-center gap-3 text-[14px] text-ink-2">
              <span className="relative h-1.5 w-32 overflow-hidden rounded-full bg-sunken">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-brand-gradient transition-[width] duration-500"
                  style={{ width: `${running ? Math.max(6, (answered / running) * 100) : 6}%` }}
                />
              </span>
              <span>
                {answered} of {running || connected} archives answered · {visible.length} images so far
              </span>
            </div>
          )}
          {phase === "done" && (
            <p className="text-[14px] text-ink-2">
              {visible.length ? (
                <>
                  <strong className="font-semibold text-ink">{visible.length} images</strong> from {contributing} archives
                  {tookMs ? ` in ${(tookMs / 1000).toFixed(1)} s` : ""}
                </>
              ) : (
                <>No openly licensed images matched “{lastSearch.current}”. Try fewer or broader words, or switch off “HD and up”.</>
              )}
            </p>
          )}
          {phase === "error" && (
            <p role="alert" className="text-[14px] text-brand-ink">
              {error}
            </p>
          )}
        </div>

        {phase === "idle" && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] text-muted">Try</span>
            {SUGGESTIONS[topic].map((s) => (
              <Chip
                key={s}
                onClick={() => {
                  setQuery(s);
                  search(s);
                }}
              >
                {s}
              </Chip>
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <>
            <ul className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4">
              {visible.slice(0, shown).map((r) => (
                <li key={r.id} className="motion-safe:animate-fade">
                  <button
                    type="button"
                    onClick={() => setSelected(r)}
                    className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-sunken text-left ring-1 ring-inset ring-line"
                  >
                    <img
                      src={r.thumbnailUrl}
                      alt={r.title}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() => setBroken((prev) => new Set(prev).add(r.id))}
                      className="size-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                    {r.quality !== "?" && (
                      <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10.5px] font-semibold tracking-wide text-white backdrop-blur-sm">
                        {r.quality}
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2.5 pt-10 text-white sm:p-3 sm:pt-12">
                      <span className="line-clamp-1 text-[13px] font-medium sm:text-[13.5px]">{r.title}</span>
                      <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-white/75 sm:text-[11.5px]">
                        <span className="truncate">{r.collection && r.collection !== r.sourceName ? r.collection : r.sourceName}</span>
                        <span className="shrink-0">{shortLicense(r.license)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {visible.length > shown && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => setShown((n) => n + PAGE)}
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-line-strong px-5 text-[15px] font-medium text-ink transition hover:border-ink/40"
                >
                  Show more <span className="text-muted">({visible.length - shown})</span>
                </button>
              </div>
            )}
          </>
        )}

        <SourceDirectory reports={reports} enabled={enabled} connected={connected} />
      </div>

      <ImageDialog item={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function Chip({ children, onClick, strong }: { children: ReactNode; onClick: () => void; strong?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-9 max-w-full items-center gap-1.5 rounded-full px-3.5 text-[13.5px] transition ${
        strong ? "bg-brand/10 font-semibold text-brand-ink hover:bg-brand/15" : "border border-line-strong font-medium text-ink-2 hover:border-ink/40 hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Toggle({ pressed, onChange, children }: { pressed: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-medium transition ${
        pressed ? "border-brand bg-brand/10 text-brand-ink" : "border-line-strong text-ink-2 hover:border-ink/40 hover:text-ink"
      }`}
    >
      {pressed && <CheckIcon size={15} />}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Source directory                                                    */
/* ------------------------------------------------------------------ */

function SourceDirectory({ reports, enabled, connected }: { reports: Map<string, SourceReport>; enabled: Set<string> | null; connected: number }) {
  // Before /api/media/sources answers, assume the sources that need no key are on.
  const isOn = (id: string) => (enabled ? enabled.has(id) : !SOURCES.find((s) => s.id === id)?.keys?.length);
  const soon = SOURCES.filter((s) => !isOn(s.id));
  const status = (id: string) => {
    const r = reports.get(id);
    if (!r) return null;
    if (r.status === "pending") return <span className="size-1.5 animate-pulse rounded-full bg-brand" aria-label="searching" />;
    if (r.count > 0) return <span className="rounded-full bg-brand/10 px-1.5 text-[11px] font-semibold tabular-nums text-brand-ink">{r.count}</span>;
    if (r.status === "empty") return <span className="text-[11px] text-muted">no match</span>;
    if (r.status === "error" || r.status === "timeout") return <span className="text-[11px] text-muted">busy</span>;
    return null;
  };

  return (
    <details className="group mt-12 rounded-[26px] border border-line bg-surface p-5 sm:p-7" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand-ink">
            <ImageIcon size={22} />
          </span>
          <span>
            <span className="block font-serif text-[24px] leading-tight text-ink">
              <span suppressHydrationWarning>{connected}</span> connected archives
            </span>
            <span className="block text-[14px] text-muted">Space agencies, museums, national libraries and photographers</span>
          </span>
        </span>
        <ChevronDownIcon size={20} className="shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
        {SOURCE_GROUPS.map((group) => {
          const items = SOURCES.filter((s) => s.group === group && isOn(s.id));
          if (!items.length) return null;
          return (
            <div key={group}>
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">{group}</p>
              <ul className="mt-2.5 space-y-2">
                {items.map((s) => (
                  <li key={s.id} className="flex items-start justify-between gap-3" title={s.holds}>
                    <span className="min-w-0">
                      <a href={s.homepage} target="_blank" rel="noopener noreferrer" className="text-[14.5px] font-medium text-ink hover:text-brand-ink">
                        {s.name}
                      </a>
                      <span className="block text-[12.5px] leading-snug text-muted">{s.scale}</span>
                    </span>
                    <span className="mt-1 shrink-0">{status(s.id)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {soon.length > 0 && (
        <p className="mt-7 border-t border-line pt-5 text-[13.5px] leading-relaxed text-muted">
          <span className="font-medium text-ink-2">Coming soon:</span> {soon.map((s) => s.name).join(", ")}
        </p>
      )}
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Image dialog                                                        */
/* ------------------------------------------------------------------ */

function ImageDialog({ item, onClose }: { item: MediaResult | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (item && !dialog.open) {
      setCopied(false);
      dialog.showModal();
    } else if (!item && dialog.open) {
      dialog.close();
    }
  }, [item]);

  const copy = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.attribution);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  // Unsplash asks to be told when a photo is downloaded for use.
  const trackDownload = () => {
    if (!item?.downloadTrackingUrl) return;
    fetch("/api/media/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: item.downloadTrackingUrl }) }).catch(() => {});
  };

  const size = item?.width && item.height ? `${item.width.toLocaleString("en")} × ${item.height.toLocaleString("en")} px` : "Size shown on the source page";

  return (
    <dialog
      ref={ref}
      aria-labelledby="image-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close();
      }}
      className="m-0 mt-auto max-h-[94dvh] w-full max-w-none overflow-hidden rounded-t-[28px] border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[#141413]/60 backdrop:backdrop-blur-[2px] open:motion-safe:animate-sheet sm:m-auto sm:max-w-3xl sm:rounded-[28px]"
    >
      {item && (
        <div className="max-h-[94dvh] overflow-y-auto">
          <div className="relative bg-[#0B0B10]">
            <img
              src={item.previewUrl}
              alt={item.title}
              referrerPolicy="no-referrer"
              className="mx-auto max-h-[58dvh] w-full object-contain"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
            >
              <CloseIcon size={20} />
            </button>
          </div>
          <div className="p-6 sm:p-7">
            <p className={eyebrow}>{item.collection && item.collection !== item.sourceName ? `${item.collection} · ${item.sourceName}` : item.sourceName}</p>
            <h2 id="image-title" className="mt-2 text-balance font-serif text-[26px] font-normal leading-[1.15] text-ink">
              {item.title}
            </h2>
            {(item.creator || item.date) && <p className="mt-1.5 text-[14.5px] text-ink-2">{[item.creator, item.date].filter(Boolean).join(" · ")}</p>}
            {item.description && item.description !== item.title && <p className="mt-3 line-clamp-4 text-[14px] leading-relaxed text-muted">{item.description}</p>}

            <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line">
              <div className="bg-surface p-4">
                <dt className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">Resolution</dt>
                <dd className="mt-1 text-[15px] font-medium text-ink">
                  {item.quality !== "?" && <span className="mr-1.5 rounded-md bg-brand/10 px-1.5 py-0.5 text-[12px] font-semibold text-brand-ink">{item.quality}</span>}
                  {size}
                </dd>
              </div>
              <div className="bg-surface p-4">
                <dt className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">Licence</dt>
                <dd className="mt-1 text-[15px] font-medium text-ink">
                  {item.license.url ? (
                    <a href={item.license.url} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-4 hover:text-brand-ink">
                      {item.license.label}
                    </a>
                  ) : (
                    item.license.label
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">{licenseNote(item.license)}</p>

            <div className="mt-5 rounded-2xl bg-sunken p-4">
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">Credit line</p>
              <p className="mt-1.5 break-words text-[14px] leading-relaxed text-ink">{item.attribution}</p>
              <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-brand-ink hover:underline">
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
                {copied ? "Copied" : "Copy credit"}
              </button>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <a
                href={item.pageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-line-strong text-[15px] font-medium text-ink transition hover:border-ink/40"
              >
                View at source <ArrowUpRightIcon size={18} />
              </a>
              <a
                href={item.fullUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={trackDownload}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-ink text-[15px] font-medium text-canvas transition hover:opacity-90"
              >
                <DownloadIcon size={18} /> Full resolution
              </a>
            </div>
            <p className="sr-only" aria-live="polite">
              {copied ? "Credit copied to clipboard" : ""}
            </p>
          </div>
        </div>
      )}
    </dialog>
  );
}
