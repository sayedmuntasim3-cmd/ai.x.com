import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { validateOwnMediaFiles } from "./own-media.mjs";

/**
 * Voiceover mode's "Make my film": the creator's own recording goes up in
 * pieces to the studio (private, behind the studio key, worker/voice-api.mjs),
 * a film machine turns it into a film, and the progress is followed here.
 * The words of the recording are the script; nothing in them is changed.
 */

const KEY_STORE = "zupona:studio-key";
const VOICE_STORE = "zupona:voice-films";
const eyebrow = "text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-ink";

type Progress = { at: string; stage: string; ok: boolean; message: { en: string; bn: string } };
type VoiceView = { id: string; status: string; progress: Progress[]; createdAt?: string; topic?: string; fileName?: string; film?: { bytes: number; seconds: number | null } | null; download?: string; listen?: string; run?: { runUrl?: string } | null; kind?: string; report?: { ayat?: { ref: string }[] } | null };

function readStore(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}
function writeStore(key: string, value: string) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* private window: nothing is remembered */
  }
}
function rememberedFor(fileName: string) {
  try {
    return (JSON.parse(readStore(VOICE_STORE) || "{}") as Record<string, string>)[fileName] ?? "";
  } catch {
    return "";
  }
}
function remember(fileName: string, id: string) {
  try {
    const all = JSON.parse(readStore(VOICE_STORE) || "{}") as Record<string, string>;
    all[fileName] = id;
    writeStore(VOICE_STORE, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

const STATUS: Record<string, string> = {
  uploading: "Uploading your voiceover",
  uploaded: "Voiceover received",
  queued: "Waiting for a film machine",
  running: "Making your film",
  done: "Your film is ready",
  "awaiting-review": "Ready for the scholar's review",
  failed: "Stopped",
};

/** Send one piece, retried on a dropped connection. */
async function putPart(url: string, key: string, body: Blob) {
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${key}` }, body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data as { partNumber: number; etag: string };
      last = String(data.error ?? res.status);
      if (res.status < 500) break;
    } catch {
      last = "No connection.";
    }
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error(last);
}

/** The five plain steps the viewer sees; each stage the film machine reports belongs to one of them. */
const STEPS = ["Listening", "Finding pictures", "Editing", "Quality check", "Ready"];
const STEP_OF: Record<string, number> = { script: 0, narrate: 0, uploaded: 0, marked: 0, queued: 0, started: 0, intake: 0, words: 0, understand: 0, master: 0, pictures: 1, render: 2, check: 3, deliver: 4, done: 4 };
const FINISHED = ["done", "awaiting-review"];

function stepOf(film: VoiceView) {
  if (FINISHED.includes(film.status)) return STEPS.length;
  const stage = film.progress.at(-1)?.stage ?? "";
  return STEP_OF[stage] ?? 0;
}

/** "12 min" or "1 h 05 min". */
function span(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/**
 * An honest range. Measured: a 40-minute voice takes 2-3 hours; shorter voices are scaled from that
 * (3 to 4.5 minutes of work per minute of voice, never under 10 minutes: the short end is not measured).
 */
export function estimateRange(seconds: number) {
  const m = seconds / 60;
  const lo = Math.max(10, Math.round(m * 3));
  const hi = Math.max(20, Math.round(m * 4.5));
  if (hi < 90) return `${lo}–${hi} minutes`;
  const h = (x: number) => String(Math.round((x / 60) * 2) / 2);
  return `${h(lo)}–${h(hi)} hours`;
}

const META_STORE = "zupona:voice-meta";
function rememberSeconds(id: string, seconds: number) {
  try {
    const all = JSON.parse(readStore(META_STORE) || "{}") as Record<string, number>;
    all[id] = Math.round(seconds);
    writeStore(META_STORE, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
function secondsOf(id: string, view?: VoiceView) {
  try {
    return view?.film?.seconds || (JSON.parse(readStore(META_STORE) || "{}") as Record<string, number>)[id] || 0;
  } catch {
    return 0;
  }
}

/** The plain reason a film stopped: the last step that failed. */
function whyStopped(film: VoiceView) {
  const bad = [...film.progress].reverse().find((p) => !p.ok);
  return (bad ?? film.progress.at(-1))?.message.en ?? "The film machine stopped without saying why.";
}

const KEY_WRONG = "That studio key is not right. Check it and try again.";

/** What the studio key is, asked once, in plain words. */
export function KeyDialog({ open, error, onSubmit, onCancel }: { open: boolean; error: string; onSubmit: (key: string) => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      setValue("");
      d.showModal();
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby="key-title"
      onClose={onCancel}
      className="m-auto w-[calc(100%-32px)] max-w-md rounded-[28px] border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-[#141413]/50 backdrop:backdrop-blur-[2px]"
    >
      <form
        method="dialog"
        className="p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) onSubmit(value.trim());
        }}
      >
        <p className={eyebrow}>One quick thing</p>
        <h2 id="key-title" className="mt-2 font-serif text-[26px] font-normal leading-tight text-ink">
          Enter your studio key
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
          The studio key is the private password you were given for the beta. It keeps your recordings and films yours. You type it once; this device remembers it.
        </p>
        <input
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Studio key"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-4 h-12 w-full rounded-2xl border border-line-strong bg-canvas/50 px-4 text-[16px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
        />
        {error && (
          <p role="alert" className="mt-2 text-[14px] text-[#c2410c]">
            {error}
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCancel} className="h-12 rounded-full border border-line-strong text-[15px] font-medium text-ink transition hover:border-ink/40">
            Not now
          </button>
          <button type="submit" disabled={!value.trim()} className="h-12 rounded-full bg-brand-gradient text-[15px] font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-60">
            Continue
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Stepper({ film, seconds }: { film: VoiceView; seconds: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);
  const at = stepOf(film);
  const stopped = film.status === "failed";
  const started = Date.parse(film.createdAt ?? "");
  return (
    <div>
      <ol className="mt-3 space-y-2 text-[15px]">
        {STEPS.map((name, i) => {
          const done = i < at;
          const current = i === at && !stopped;
          return (
            <li key={name} className={`flex items-center gap-2.5 ${done || current ? "text-ink" : "text-muted"}`} aria-current={current ? "step" : undefined}>
              {done ? (
                <CheckIcon size={16} className="shrink-0 text-brand-ink" />
              ) : current ? (
                <span className="mx-[5px] inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-brand" />
              ) : (
                <span className="mx-[5px] inline-block size-2.5 shrink-0 rounded-full border border-line-strong" />
              )}
              <span className={current ? "font-medium" : ""}>{name}</span>
            </li>
          );
        })}
      </ol>
      {!FINISHED.includes(film.status) && !stopped && (
        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
          {Number.isFinite(started) && <>Working for {span(now - started)}. </>}
          {seconds > 0 ? `A voice this long usually takes about ${estimateRange(seconds)}. ` : "A 40-minute voice takes about 2–3 hours. "}
          You can close this page: your film stays under “My films”.
        </p>
      )}
    </div>
  );
}

export function VoiceFilm({ fileName, voiceUrl, seconds, topic }: { fileName?: string; voiceUrl?: string; seconds?: number; topic: string }) {
  const [quran, setQuran] = useState(false);
  const [surah, setSurah] = useState("");
  const [reciter, setReciter] = useState("");
  const [ownFiles, setOwnFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [film, setFilm] = useState<VoiceView | null>(null);
  // Bumped when a stopped film is started again, so following it resumes.
  const [round, setRound] = useState(0);
  const [dialog, setDialog] = useState({ open: false, error: "" });
  const resolver = useRef<((k: string) => void) | null>(null);
  const [list, setList] = useState<VoiceView[] | null>(null);
  const [hasKey, setHasKey] = useState(false);

  const askKey = (err = "") =>
    new Promise<string>((resolve) => {
      resolver.current = resolve;
      setDialog({ open: true, error: err });
    });
  const answer = (k: string) => {
    setDialog({ open: false, error: "" });
    resolver.current?.(k);
    resolver.current = null;
  };

  /** Runs a request with the saved key; asks for it in the dialog when missing or wrong (401). */
  const withKey = async (run: (key: string) => Promise<Response>) => {
    let k = readStore(KEY_STORE);
    let err = "";
    for (let i = 0; i < 3; i += 1) {
      if (!k) {
        k = await askKey(err);
        if (!k) return null;
      }
      const res = await run(k);
      if (res.status !== 401) {
        writeStore(KEY_STORE, k);
        setHasKey(true);
        return res;
      }
      writeStore(KEY_STORE, "");
      setHasKey(false);
      k = "";
      err = KEY_WRONG;
    }
    return null;
  };

  const loadList = async (ask: boolean) => {
    const saved = readStore(KEY_STORE);
    if (!saved && !ask) return;
    try {
      const res = ask ? await withKey((k) => fetch("/api/voice", { cache: "no-store", headers: { authorization: `Bearer ${k}` } })) : await fetch("/api/voice", { cache: "no-store", headers: { authorization: `Bearer ${saved}` } });
      if (!res) return;
      if (res.status === 401) {
        writeStore(KEY_STORE, "");
        setHasKey(false);
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.films)) setList(data.films as VoiceView[]);
    } catch {
      /* offline: the list stays as it was */
    }
  };

  useEffect(() => {
    setHasKey(!!readStore(KEY_STORE));
    loadList(false);
  }, []);

  useEffect(() => {
    setError("");
    const last = fileName ? rememberedFor(fileName) : "";
    setFilm(last ? { id: last, status: "queued", progress: [] } : null);
  }, [fileName]);

  // Follow the film while it is shown.
  useEffect(() => {
    if (!film?.id) return;
    let stop = false;
    let timer = 0;
    const poll = async () => {
      const studioKey = readStore(KEY_STORE);
      if (!studioKey) return;
      try {
        const res = await fetch(`/api/voice/${film.id}`, { cache: "no-store", headers: { authorization: `Bearer ${studioKey}` } });
        if (res.ok) {
          const data = (await res.json()) as VoiceView;
          if (!stop) setFilm(data);
          if (["done", "awaiting-review", "failed"].includes(data.status)) {
            loadList(false);
            return;
          }
        } else if (res.status === 401) {
          writeStore(KEY_STORE, "");
          setHasKey(false);
          if (!stop) setError("Your studio key stopped working. Open “My films” below to enter it again.");
          return;
        } else if (res.status === 404) {
          if (!stop) setFilm(null);
          return;
        }
      } catch {
        /* offline for a moment: try again */
      }
      if (!stop) timer = window.setTimeout(poll, 10000);
    };
    poll();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [film?.id, round]);

  const start = async () => {
    if (!fileName || !voiceUrl) return;
    if (quran && !(Number(surah) >= 1 && Number(surah) <= 114)) {
      setError("Say which surah is recited (1-114). A recitation is never guessed.");
      return;
    }
    setBusy(true);
    setError("");
    setSent(0);
    try {
      const blob = await (await fetch(voiceUrl)).blob();
      const res = await withKey((k) =>
        fetch("/api/voice", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${k}` },
          body: JSON.stringify({ fileName, bytes: blob.size, kind: quran ? "quran" : "narration", topic, ...(quran ? { surah: Number(surah), reciter } : {}) }),
        }),
      );
      if (!res) return; // the visitor chose "Not now" or gave a wrong key three times
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.id) {
        setError(String(data.error ?? "The studio could not take the recording. Try again in a minute."));
        return;
      }
      const studioKey = readStore(KEY_STORE);
      const parts: { partNumber: number; etag: string }[] = [];
      for (let n = 1; n <= data.parts; n += 1) {
        const piece = blob.slice((n - 1) * data.partSize, n * data.partSize);
        parts.push(await putPart(`/api/voice/${data.id}/parts/${n}`, studioKey, piece));
        setSent(Math.round((n / data.parts) * 100));
      }
      const done = await fetch(`/api/voice/${data.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
        body: JSON.stringify({ parts }),
      });
      const view = (await done.json().catch(() => ({}))) as VoiceView & { error?: string };
      // Upload the creator's own photos and clips, piece by piece, like the recording.
      for (const f of ownFiles) {
        try {
          const buf = await f.arrayBuffer();
          const blob = new Blob([buf]);
          const opened = await fetch(`/api/voice/${data.id}/own`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
            body: JSON.stringify({ fileName: f.name, bytes: f.size }),
          });
          const info = (await opened.json().catch(() => ({}))) as { partSize?: number; parts?: number; error?: string };
          if (!opened.ok || !info.parts) { setError(String(info.error ?? "An own file could not be uploaded.")); continue; }
          const ownParts: { partNumber: number; etag: string }[] = [];
          for (let n = 1; n <= (info.parts ?? 1); n += 1) {
            const piece = blob.slice((n - 1) * (info.partSize ?? 0), n * (info.partSize ?? 0));
            ownParts.push(await putPart(`/api/voice/${data.id}/own/parts/${n}`, studioKey, piece));
          }
          await fetch(`/api/voice/${data.id}/own/complete`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
            body: JSON.stringify({ parts: ownParts }),
          });
        } catch {
          setError("An own file could not be uploaded.");
        }
      }
      remember(fileName, data.id);
      if (seconds) rememberSeconds(data.id, seconds);
      setFilm(view.id ? view : { id: data.id, status: "uploaded", progress: [] });
      if (!done.ok && view.error) setError(view.error);
      loadList(false);
    } catch (e) {
      setError(e instanceof Error && e.message ? `The upload stopped: ${e.message}` : "No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  /** A stopped film starts again from the recording already saved: nothing is uploaded twice. */
  const retry = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const res = await withKey((k) => fetch(`/api/voice/${id}/retry`, { method: "POST", headers: { authorization: `Bearer ${k}` } }));
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        setFilm(data as VoiceView);
        setRound((r) => r + 1);
        loadList(false);
      } else setError(String(data.error ?? "The film could not be started again. Try again in a minute."));
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  const download = async (id: string) => {
    const res = await withKey((k) => fetch(`/api/voice/${id}`, { cache: "no-store", headers: { authorization: `Bearer ${k}` } }));
    const data = (await res?.json().catch(() => ({}))) as VoiceView | undefined;
    if (data?.download) window.location.href = data.download;
    else setError("The film is not ready to download yet.");
  };

  const dialogEl = <KeyDialog open={dialog.open} error={dialog.error} onSubmit={answer} onCancel={() => answer("")} />;

  const shown = film;
  const myFilms = (
    <MyFilms
      list={list}
      hasKey={hasKey}
      busy={busy}
      activeId={film?.id}
      onLoad={() => loadList(true)}
      onOpen={(v) => {
        setError("");
        setFilm(v);
        setRound((r) => r + 1);
      }}
      onRetry={retry}
      onDownload={download}
    />
  );

  if (shown) {
    const finished = FINISHED.includes(shown.status);
    const stopped = shown.status === "failed";
    return (
      <div>
        <div className="mt-6 rounded-2xl border border-line bg-canvas/50 p-4" aria-live="polite">
          <p className={`${eyebrow} flex items-center gap-1.5`}>
            {finished ? <CheckIcon size={16} /> : stopped ? null : <span className="inline-block size-2 animate-pulse rounded-full bg-brand" />}
            {STATUS[shown.status] ?? shown.status}
          </p>
          <Stepper film={shown} seconds={secondsOf(shown.id, shown)} />
          {stopped && (
            <p className="mt-3 text-[14px] text-[#c2410c]">
              Why it stopped: {whyStopped(shown)}
            </p>
          )}
          {shown.status === "awaiting-review" && (
            <p className="mt-3 text-[13px] text-muted">A Quran film is never published before a qualified scholar has reviewed the text, the timing and every picture.</p>
          )}
          {shown.status === "awaiting-review" && shown.listen && shown.report?.ayat?.length ? (
            <AyahMarker
              listen={shown.listen}
              refs={shown.report.ayat.map((a) => a.ref)}
              onSend={async (marks) => {
                const res = await withKey((k) => fetch(`/api/voice/${shown.id}/marks`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k}` }, body: JSON.stringify(marks) }));
                const data = await res?.json().catch(() => ({}));
                if (!res?.ok || !data?.id) return String(data?.error ?? "The marks could not be saved. Try again.");
                setFilm(data as VoiceView);
                setRound((r) => r + 1);
                return "";
              }}
            />
          ) : null}
          {error && <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">{error}</p>}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {shown.download ? (
              <a href={shown.download} className="inline-flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-canvas transition hover:opacity-90">
                Download the film
              </a>
            ) : (
              <span className="inline-flex h-11 items-center justify-center rounded-full bg-sunken text-[14px] font-medium text-muted">Film not ready yet</span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!stopped) {
                  if (fileName) remember(fileName, "");
                  setFilm(null);
                } else void retry(shown.id);
              }}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium text-ink transition hover:border-ink/40 disabled:opacity-60"
            >
              {stopped ? (busy ? "Starting…" : "Try again") : "Make another"}
            </button>
          </div>
        </div>
        {myFilms}
        {dialogEl}
      </div>
    );
  }

  return (
    <div>
      {voiceUrl && fileName && (
        <>
          <details className="mt-5 rounded-2xl border border-line">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-[15px] font-medium text-ink-2">More options</summary>
            <div className="px-4 pb-4">
              <label className="flex items-center gap-3 text-[14px] text-ink">
                <input type="checkbox" checked={quran} onChange={(e) => setQuran(e.target.checked)} className="size-4 accent-brand" />
                This is a Quran recitation
              </label>
              {quran && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[13px] font-medium text-ink">Surah (1-114)</span>
                    <input
                      inputMode="numeric"
                      value={surah}
                      onChange={(e) => setSurah(e.target.value.replace(/\D/g, "").slice(0, 3))}
                      className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-canvas/50 px-4 text-[16px] text-ink outline-none focus:border-brand"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] font-medium text-ink">Reciter</span>
                    <input
                      value={reciter}
                      onChange={(e) => setReciter(e.target.value.slice(0, 80))}
                      className="mt-1.5 h-11 w-full rounded-2xl border border-line bg-canvas/50 px-4 text-[16px] text-ink outline-none focus:border-brand"
                    />
                  </label>
                  <p className="col-span-2 text-[12.5px] leading-relaxed text-muted">
                    The reciter's own voice only, the exact Uthmani text, no music, and a scholar's review before anything is published.
                  </p>
                </div>
              )}
              <div className="mt-4">
                <p className="text-[13px] font-medium text-ink">Add your own photos or clips (optional)</p>
                <label className="mt-2 block rounded-2xl border border-dashed border-line-strong bg-canvas/50 px-4 py-4 text-center text-[13px] text-muted">
                  <input
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.mp4,.mov"
                    className="hidden"
                    onChange={(e) => {
                      const list = Array.from(e.target.files ?? []);
                      const v = validateOwnMediaFiles(list);
                      if (!v.ok) { setError(v.error); return; }
                      setOwnFiles(list);
                      setError("");
                    }}
                  />
                  Drop or choose up to 50 files, 200 MB total (JPG, PNG, WebP, MP4, MOV)
                </label>
                {ownFiles.length > 0 && <p className="mt-2 text-[12.5px] text-ink-2">{ownFiles.length} file(s) chosen</p>}
                <p className="mt-2 text-[12px] leading-relaxed text-muted">Only add pictures you own or may use.</p>
              </div>
            </div>
          </details>
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="mt-5 flex h-[60px] w-full items-center justify-center rounded-2xl bg-brand-gradient px-4 text-[17px] font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? (sent > 0 ? `Uploading… ${sent}%` : "Starting…") : "Make my film"}
          </button>
          <p className="mt-3 text-center text-[13px] text-muted">
            Free during beta · Your recording stays private and its words are never changed.
            {seconds ? ` Expect about ${estimateRange(seconds)}.` : ""}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">
          {error}
        </p>
      )}
      {myFilms}
      {dialogEl}
    </div>
  );
}

/** "My films": every voiceover film of this studio, so the page can be closed and opened later. */
function MyFilms({
  list,
  hasKey,
  busy,
  activeId,
  onLoad,
  onOpen,
  onRetry,
  onDownload,
}: {
  list: VoiceView[] | null;
  hasKey: boolean;
  busy: boolean;
  activeId?: string;
  onLoad: () => void;
  onOpen: (v: VoiceView) => void;
  onRetry: (id: string) => void;
  onDownload: (id: string) => void;
}) {
  if (!list) {
    if (hasKey) return null;
    return (
      <button type="button" onClick={onLoad} className="mt-5 w-full text-center text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
        Already made a film? See My films
      </button>
    );
  }
  return (
    <section className="mt-6" aria-label="My films">
      <h3 className="text-[15px] font-medium text-ink">My films</h3>
      {list.length === 0 && <p className="mt-2 text-[14px] text-muted">Nothing yet. Your films will wait for you here.</p>}
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
        {list.filter((f) => f.id !== activeId).slice(0, 12).map((f) => {
          const finished = FINISHED.includes(f.status);
          const stopped = f.status === "failed";
          return (
            <li key={f.id} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-medium text-ink">{f.topic || f.fileName || "Voiceover film"}</p>
                  <p className="text-[12.5px] text-muted">
                    {STATUS[f.status] ?? f.status}
                    {f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                {finished && f.film ? (
                  <button type="button" onClick={() => onDownload(f.id)} className="h-9 shrink-0 rounded-full bg-ink px-4 text-[13px] font-medium text-canvas transition hover:opacity-90">
                    Download
                  </button>
                ) : stopped ? (
                  <button type="button" disabled={busy} onClick={() => onRetry(f.id)} className="h-9 shrink-0 rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink transition hover:border-ink/40 disabled:opacity-60">
                    Try again
                  </button>
                ) : f.id !== activeId ? (
                  <button type="button" onClick={() => onOpen(f)} className="h-9 shrink-0 rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink transition hover:border-ink/40">
                    See progress
                  </button>
                ) : null}
              </div>
              {stopped && <p className="mt-1.5 text-[13px] text-[#c2410c]">Why it stopped: {whyStopped(f)}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The reviewer listens to the recitation and taps once when the first ayah begins and once at the end of each ayah.
 * The taps become confirmed ayah times: the film is made again and the verbatim text is shown on them.
 */
function AyahMarker({ listen, refs, onSend }: { listen: string; refs: string[]; onSend: (m: { start: number; ends: number[]; by: string }) => Promise<string> }) {
  const [taps, setTaps] = useState<number[]>([]);
  const [by, setBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const done = taps.length === refs.length + 1;
  const next = taps.length === 0 ? `when ayah ${refs[0]} begins` : `at the end of ayah ${refs[taps.length - 1]}`;
  return (
    <div className="mt-4 rounded-2xl border border-line p-3">
      <p className="text-[14px] font-medium text-ink">Mark the ayat (reviewer)</p>
      <p className="mt-1 text-[12.5px] text-muted">Play the recitation and tap once when the first ayah begins, then once at the end of each ayah. The text is shown only on times a person confirmed.</p>
      <audio ref={setAudio} src={listen} controls preload="none" className="mt-2 w-full" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={done}
          onClick={() => audio && setTaps((t) => [...t, Math.round(audio.currentTime * 1000) / 1000])}
          className="h-11 rounded-full bg-ink text-[14px] font-medium text-canvas disabled:opacity-50"
        >
          {done ? "All marked" : `Tap ${next}`}
        </button>
        <button type="button" onClick={() => setTaps((t) => t.slice(0, -1))} disabled={!taps.length} className="h-11 rounded-full border border-line-strong text-[14px] text-ink disabled:opacity-50">
          Undo last tap
        </button>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">{taps.length} of {refs.length + 1} marks</p>
      {done && (
        <div className="mt-2 grid gap-2">
          <input value={by} onChange={(e) => setBy(e.target.value.slice(0, 80))} placeholder="Reviewer's name" className="h-11 rounded-2xl border border-line bg-canvas/50 px-4 text-[15px] text-ink outline-none focus:border-brand" />
          <button
            type="button"
            disabled={busy || !by.trim()}
            onClick={async () => {
              setBusy(true);
              setNote(await onSend({ start: taps[0], ends: taps.slice(1), by: by.trim() }));
              setBusy(false);
            }}
            className="h-11 rounded-full bg-brand-gradient text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Saving…" : "Make the film with these times"}
          </button>
        </div>
      )}
      {note && <p role="alert" className="mt-2 text-[13px] text-[#c2410c]">{note}</p>}
    </div>
  );
}
