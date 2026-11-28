import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";
import { OWN_MEDIA_ACCEPT, validateOwnMediaFiles } from "./own-media.mjs";
import { alternativesFor, candidateFromSearch, dropSwap, filterShots, packCheck, remakeState, setSwap, shotList, swapOf, swapPlan } from "./shot-swap.mjs";
import { DRAFT_LABEL, cardOf } from "./film-label.mjs";

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
type VoiceView = { id: string; status: string; progress: Progress[]; createdAt?: string; topic?: string; fileName?: string; film?: { bytes: number; seconds: number | null } | null; draft?: boolean; blocks?: { code: string; en: string; bn: string }[]; download?: string; listen?: string; run?: { runUrl?: string } | null; kind?: string; report?: { ayat?: { ref: string }[] } | null };

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
  draft: DRAFT_LABEL,
  "awaiting-review": "Ready for the scholar's review",
  failed: "Stopped",
};

/**
 * The statuses that mean "busy, come back": a dropped connection, a slow upload (408), Cloudflare or the
 * studio saying "too many" (429), or a momentary server error. A 400 or 409 will not get better by waiting.
 */
const RETRY_STATUS = [408, 429, 500, 502, 503, 504];
const WAITS_MS = [1500, 3000, 6000, 12000, 24000];

/** Send one piece, waiting and trying again when the studio is busy (408/429/5xx) or the line drops. */
async function putPart(url: string, key: string, body: Blob, onWait?: (ms: number, why: string) => void) {
  let last = "";
  for (let attempt = 0; attempt <= WAITS_MS.length; attempt += 1) {
    let wait = WAITS_MS[attempt] ?? WAITS_MS[WAITS_MS.length - 1];
    try {
      const res = await fetch(url, { method: "PUT", headers: { authorization: `Bearer ${key}` }, body });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data as { partNumber: number; etag: string };
      last = String(data.error ?? res.status);
      if (!RETRY_STATUS.includes(res.status)) break;
      // The studio says how long to wait (Retry-After, in seconds); otherwise a longer pause each time.
      const after = Number(res.headers.get("retry-after"));
      if (Number.isFinite(after) && after > 0) wait = Math.min(60_000, after * 1000);
    } catch {
      last = "No connection.";
    }
    if (attempt === WAITS_MS.length) break;
    onWait?.(wait, last);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(last);
}

/**
 * Where an upload was left, so a reloaded page sends only the pieces that are missing and keeps the same
 * film (the recording is not uploaded twice). The studio key is never written here.
 */
type Pending = { id: string; sig: string; partSize: number; parts: number; etags: Record<number, string> };
const PENDING_STORE = "zupona:voice-upload";
function readPending(sig: string): Pending | null {
  try {
    const got = JSON.parse(readStore(PENDING_STORE) || "null") as Pending | null;
    return got && got.sig === sig && got.id ? { ...got, etags: got.etags ?? {} } : null;
  } catch {
    return null;
  }
}
function writePending(p: Pending) {
  writeStore(PENDING_STORE, JSON.stringify(p));
}
function clearPending() {
  writeStore(PENDING_STORE, "");
}

/** The five plain steps the viewer sees; each stage the film machine reports belongs to one of them. */
const STEPS = ["Listening", "Finding pictures", "Editing", "Quality check", "Ready"];
const STEP_OF: Record<string, number> = { script: 0, narrate: 0, uploaded: 0, marked: 0, queued: 0, started: 0, intake: 0, words: 0, understand: 0, master: 0, pictures: 1, render: 2, check: 3, deliver: 4, done: 4 };
// A draft is finished work too (nothing is still being made): it is held back from "released", not from the page.
const FINISHED = ["done", "awaiting-review", "draft"];

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
  const [ownSent, setOwnSent] = useState(0);

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
  // The film whose shots are open for a swap (E1), or null.
  const [swapping, setSwapping] = useState(false);

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
          if (["done", "awaiting-review", "draft", "failed"].includes(data.status)) {
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
    const chosen = validateOwnMediaFiles(ownFiles) as { ok: boolean; error?: string };
    if (!chosen.ok) {
      setError(String(chosen.error ?? "Those files cannot be used."));
      return;
    }
    setBusy(true);
    setError("");
    setSent(0);
    setOwnSent(0);
    try {
      const blob = await (await fetch(voiceUrl)).blob();
      // The same recording picked again continues its upload instead of starting a second film.
      const sig = `${fileName}:${blob.size}`;
      const studioKey = readStore(KEY_STORE);
      let upload = readPending(sig);
      const open = async () => {
        const res = await withKey((k) =>
          fetch("/api/voice", {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${k}` },
            body: JSON.stringify({ fileName, bytes: blob.size, kind: quran ? "quran" : "narration", topic, ...(quran ? { surah: Number(surah), reciter } : {}) }),
          }),
        );
        if (!res) return null; // the visitor chose "Not now" or gave a wrong key three times
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.id) {
          setError(String(data.error ?? "The studio could not take the recording. Try again in a minute."));
          return null;
        }
        const next: Pending = { id: String(data.id), sig, partSize: Number(data.partSize), parts: Number(data.parts), etags: {} };
        writePending(next);
        remember(fileName, next.id);
        return next;
      };
      if (!upload) upload = await open();
      if (!upload) return;
      /** The pieces already sent are skipped; each new one is remembered as soon as it lands. */
      const sendAll = async (p: Pending) => {
        const sentParts: { partNumber: number; etag: string }[] = [];
        for (let n = 1; n <= p.parts; n += 1) {
          const known = p.etags[n];
          if (known) {
            sentParts.push({ partNumber: n, etag: known });
            setSent(Math.round((n / p.parts) * 100));
            continue;
          }
          const piece = blob.slice((n - 1) * p.partSize, n * p.partSize);
          const got = await putPart(`/api/voice/${p.id}/parts/${n}`, studioKey, piece, (_ms, why) => setError(`The studio is busy (${why}); waiting and trying again…`));
          p.etags[n] = got.etag;
          writePending(p);
          sentParts.push(got);
          setSent(Math.round((n / p.parts) * 100));
        }
        return sentParts;
      };
      let parts: { partNumber: number; etag: string }[];
      try {
        setError(upload.etags && Object.keys(upload.etags).length ? "Continuing the upload where it stopped…" : "");
        parts = await sendAll(upload);
      } catch (e) {
        // The remembered upload is gone (finished on another tab, or cleaned up): one fresh film, all pieces.
        const why = e instanceof Error ? e.message : "";
        if (!/no upload is open|409/i.test(why)) throw e;
        clearPending();
        const fresh = await open();
        if (!fresh) return;
        upload = fresh;
        parts = await sendAll(upload);
      }
      // The creator's own photos and clips go up before the film starts, so its first run already has them.
      if (!quran && ownFiles.length) await sendOwn(upload.id, studioKey);
      const done = await fetch(`/api/voice/${upload.id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
        body: JSON.stringify({ parts }),
      });
      const view = (await done.json().catch(() => ({}))) as VoiceView & { error?: string };
      clearPending();
      remember(fileName, upload.id);
      if (seconds) rememberSeconds(upload.id, seconds);
      setFilm(view.id ? view : { id: upload.id, status: "uploaded", progress: [] });
      setError(done.ok ? "" : String(view.error ?? "The studio could not start the film. Try again in a minute."));
      loadList(false);
    } catch (e) {
      // The pieces already sent stay remembered: pressing the button again continues from there.
      setError(e instanceof Error && e.message ? `The upload stopped: ${e.message} Pick the same recording and press the button again to continue.` : "No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  /** Upload one of the creator's own files in pieces: the studio takes them like the recording. */
  const sendOwn = async (id: string, studioKey: string) => {
    for (const [i, f] of ownFiles.entries()) {
      const open = await fetch(`/api/voice/${id}/own`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
        body: JSON.stringify({ fileName: f.name, bytes: f.size }),
      });
      const info = (await open.json().catch(() => ({}))) as { partSize?: number; parts?: number; error?: string };
      if (!open.ok || !info.partSize || !info.parts) throw new Error(String(info.error ?? `${f.name} could not be added.`));
      const parts: { partNumber: number; etag: string }[] = [];
      for (let n = 1; n <= info.parts; n += 1) {
        const piece = f.slice((n - 1) * info.partSize, n * info.partSize);
        parts.push(await putPart(`/api/voice/${id}/own/parts/${n}`, studioKey, piece));
      }
      const closed = await fetch(`/api/voice/${id}/own/complete`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
        body: JSON.stringify({ parts }),
      });
      if (!closed.ok) {
        const why = (await closed.json().catch(() => ({}))) as { error?: string };
        throw new Error(String(why.error ?? `${f.name} could not be added.`));
      }
      setOwnSent(Math.round(((i + 1) / ownFiles.length) * 100));
    }
  };

  /** Pick the creator's own photos and clips; checked here, before any of them is uploaded. */
  const pickOwn = (files: FileList | null) => {
    setError("");
    const all = [...ownFiles, ...Array.from(files ?? [])];
    const checked = validateOwnMediaFiles(all) as { ok: boolean; error?: string };
    if (!checked.ok) {
      setError(String(checked.error ?? "Those files cannot be used."));
      return;
    }
    setOwnFiles(all);
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
      onSwap={(v) => {
        setError("");
        setFilm(v);
        setSwapping(true);
      }}
    />
  );

  if (shown && swapping) {
    return (
      <div>
        <ShotSwapper
          film={shown}
          withKey={withKey}
          onStarted={(v) => {
            setSwapping(false);
            setFilm(v);
            setRound((r) => r + 1);
            loadList(false);
          }}
          onClose={() => setSwapping(false)}
        />
        {dialogEl}
      </div>
    );
  }

  if (shown) {
    const finished = FINISHED.includes(shown.status);
    const stopped = shown.status === "failed";
    return (
      <div>
        <div className="mt-6 rounded-2xl border border-line bg-canvas/50 p-4" aria-live="polite">
          <p className={`${eyebrow} flex items-center gap-1.5`}>
            {finished && !shown.draft ? <CheckIcon size={16} /> : stopped ? null : shown.draft ? null : <span className="inline-block size-2 animate-pulse rounded-full bg-brand" />}
            {STATUS[shown.status] ?? shown.status}
          </p>
          <Stepper film={shown} seconds={secondsOf(shown.id, shown)} />
          {shown.draft && (
            <div className="mt-3">
              {cardOf(shown).reasons.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-[14px] text-ink-2">
                  {cardOf(shown).reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[13px] leading-relaxed text-muted">This is a draft: it is yours to keep, but it is not a released film. “Try again” fixes the pictures that failed.</p>
            </div>
          )}
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
          {remakeState(shown).kind === "remaking" && (
            <p className="mt-3 rounded-xl bg-brand/10 px-3 py-2 text-[13px] leading-relaxed text-brand-ink">{remakeState(shown).stage}</p>
          )}
          {error && <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">{error}</p>}
          {finished && shown.film ? (
            <button type="button" onClick={() => setSwapping(true)} className="mt-4 flex h-11 w-full items-center justify-center rounded-full border border-line-strong text-[14px] font-medium text-ink transition hover:border-ink/40">
              Swap a shot
            </button>
          ) : null}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {shown.download ? (
              <a href={shown.download} className="inline-flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-canvas transition hover:opacity-90">
                {shown.draft ? cardOf(shown).download : "Download the film"}
              </a>
            ) : (
              <span className="inline-flex h-11 items-center justify-center rounded-full bg-sunken text-[14px] font-medium text-muted">Film not ready yet</span>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (stopped || shown.draft) void retry(shown.id);
                else {
                  if (fileName) remember(fileName, "");
                  setFilm(null);
                }
              }}
              className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium text-ink transition hover:border-ink/40 disabled:opacity-60"
            >
              {stopped || shown.draft ? (busy ? "Starting…" : "Try again") : "Make another"}
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
            </div>
          </details>
          {!quran && (
            <div className="mt-4 rounded-2xl border border-line bg-canvas/40 p-4">
              <label className="block text-[13px] font-medium text-ink">
                Add your own photos or clips (optional)
                <input
                  type="file"
                  multiple
                  accept={OWN_MEDIA_ACCEPT.join(",")}
                  onChange={(e) => {
                    pickOwn(e.target.files);
                    e.target.value = "";
                  }}
                  className="mt-2 block w-full text-[13px] text-ink-2 file:mr-3 file:rounded-xl file:border-0 file:bg-brand/10 file:px-3 file:py-2 file:text-[13px] file:font-semibold file:text-brand-ink"
                />
              </label>
              {ownFiles.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {ownFiles.map((f) => (
                    <li key={`${f.name}:${f.size}`} className="flex items-center justify-between gap-3 text-[13px] text-ink-2">
                      <span className="truncate">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => setOwnFiles((list) => list.filter((x) => !(x.name === f.name && x.size === f.size)))}
                        className="shrink-0 text-[12px] font-medium text-muted underline underline-offset-4"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Only add pictures you own or may use: the rights report records them as yours. Each one goes on the shot your words
                fit best; a picture that does not fit any shot is left out.
              </p>
            </div>
          )}
          <button
            type="button"
            onClick={start}
            disabled={busy}
            className="mt-5 flex h-[60px] w-full items-center justify-center rounded-2xl bg-brand-gradient px-4 text-[17px] font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? (ownSent > 0 && ownSent < 100 ? `Adding your files… ${ownSent}%` : sent > 0 ? `Uploading… ${sent}%` : "Starting…") : "Make my film"}
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

/** The pack's format the page can read (engine/src/edit-pack.mjs). */
const EDIT_VERSION = 1;

type ShotRow = ReturnType<typeof shotList>[number];
type Swap = { shotId: string; candidate: { id: string; source: string | null; licence: string | null; thumbnailUrl: string | null; mediaUrl: string | null; sourcePageUrl: string | null; title: string } };

/**
 * "Swap a shot": every shot of a finished film with its time and its words, six free pictures
 * for the one that is wrong, a search in the archives, and one button that re-makes only the
 * parts of the film holding the swapped shots. Phone first, in the same card style as the rest.
 */
function ShotSwapper({ film, withKey, onStarted, onClose }: { film: VoiceView; withKey: (run: (key: string) => Promise<Response>) => Promise<Response | null>; onStarted: (v: VoiceView) => void; onClose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pack, setPack] = useState<any>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [query, setQuery] = useState("");
  const [ask, setAsk] = useState("");
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [found, setFound] = useState<{ for: string; phase: "idle" | "loading" | "done" | "error"; items: ReturnType<typeof candidateFromSearch>[]; note: string }>({ for: "", phase: "idle", items: [], note: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    setPack(null);
    setError("");
    setSwaps([]);
    (async () => {
      const res = await withKey((k) => fetch(`/api/voice/${film.id}/edit?lean=1`, { cache: "no-store", headers: { authorization: `Bearer ${k}` } }));
      if (!res) return;
      const data = await res.json().catch(() => ({}));
      if (stop) return;
      if (!res.ok) {
        setError(String(data.error ?? "The shots of this film could not be read."));
        return;
      }
      const check = packCheck(data, EDIT_VERSION);
      if (!check.ok) setError(check.error);
      else setPack(data);
    })();
    return () => {
      stop = true;
    };
  }, [film.id]);

  const shots: ShotRow[] = pack ? filterShots(shotList(pack), query) : [];
  const plan = pack ? swapPlan(pack, swaps) : { count: 0, text: "" };

  /** The archives' own search (the visual library's one route), read while it streams. */
  const search = async (shotId: string, words: string) => {
    const q = words.trim().slice(0, 120);
    if (q.length < 2) {
      setFound({ for: shotId, phase: "error", items: [], note: "Write a few words to search for." });
      return;
    }
    setFound({ for: shotId, phase: "loading", items: [], note: "" });
    const params = new URLSearchParams({ q, stream: "1", per: "8", limit: "36" });
    if (film.topic) params.set("topic", film.topic);
    try {
      const res = await fetch(`/api/media/search?${params}`);
      if (!res.ok || !res.body || !(res.headers.get("content-type") ?? "").includes("ndjson")) throw new Error("The picture search is not available on this copy of the site.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const items: ReturnType<typeof candidateFromSearch>[] = [];
      const seen = new Set<string>();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl = 0;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          let event: { type?: string; results?: unknown[] } = {};
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type !== "source" || !Array.isArray(event.results)) continue;
          for (const r of event.results) {
            const c = candidateFromSearch(r);
            if (c && !seen.has(c.id)) { seen.add(c.id); items.push(c); }
          }
        }
      }
      setFound({ for: shotId, phase: "done", items: items.slice(0, 36), note: items.length ? "" : "No free picture for those words. Try other words." });
    } catch (e) {
      setFound({ for: shotId, phase: "error", items: [], note: e instanceof Error ? e.message : "The archives could not be reached." });
    }
  };

  const send = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await withKey((k) => fetch(`/api/voice/${film.id}/swaps`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${k}` }, body: JSON.stringify({ swaps: swaps.map((s) => ({ shotId: s.shotId, candidate: s.candidate })) }) }));
      if (!res) return;
      const data = (await res.json().catch(() => ({}))) as VoiceView & { error?: string };
      if (!res.ok || !data.id) {
        setError(String(data.error ?? "The film could not be re-made. Try again in a minute."));
        return;
      }
      onStarted(data);
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  const thumb = (src: string | null, alt: string) =>
    src ? <img src={src} alt={alt} loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center bg-sunken text-[10px] text-muted">No picture</span>;

  return (
    <div>
      <div className="mt-6 rounded-2xl border border-line bg-canvas/50 p-4" aria-live="polite">
        <p className={eyebrow}>Fix one picture</p>
        <h3 className="mt-1 text-[17px] font-medium text-ink">Swap a shot</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Tap a shot to see six other free pictures for it, or search the archives. Only the part of the film holding the shots you change is rendered again.
        </p>
        {!pack && !error && <p className="mt-3 text-[13.5px] text-muted">Opening the shots…</p>}
        {error && <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">{error}</p>}
        {pack && (
          <div className="mt-3">
            <label className="block">
              <span className="sr-only">Find a shot by its words</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value.slice(0, 120))}
                placeholder="Find a shot by its words"
                className="h-11 w-full rounded-2xl border border-line-strong bg-surface px-4 text-[15px] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
            </label>
            <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
              {shots.map((s) => {
                const swap = swapOf(swaps, s.id);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => { setOpen(open === s.id ? "" : s.id); setAsk(""); setFound({ for: s.id, phase: "idle", items: [], note: "" }); }} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={open === s.id}>
                      <span className="h-10 w-16 shrink-0 overflow-hidden rounded-lg border border-line">{thumb(swap ? swap.candidate.thumbnailUrl : s.thumbnail, `Shot at ${s.time}`)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[12.5px] text-muted">
                          <span className="rounded-full bg-sunken px-2 py-0.5 font-medium text-ink-2">{s.time}</span>
                          <span>{s.span}</span>
                          {swap && <span className="rounded-full bg-brand/10 px-2 py-0.5 font-medium text-brand-ink">New</span>}
                        </span>
                        <span className="mt-0.5 block truncate text-[14px] text-ink">{s.words || s.id}</span>
                      </span>
                      <span className="shrink-0 text-[12.5px] text-brand-ink">{open === s.id ? "Close" : `${s.candidates} ideas`}</span>
                    </button>
                    {open === s.id && (
                      <div className="border-t border-line bg-canvas/40 p-3">
                        {alternativesFor(pack, s.id).length ? (
                          <>
                            <p className="text-[12.5px] font-medium text-ink-2">Six free pictures for this shot</p>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                              {alternativesFor(pack, s.id).map((c) => {
                                const picked = swapOf(swaps, s.id)?.candidate.id === c.id;
                                return (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setSwaps((list) => (picked ? dropSwap(list, s.id) : setSwap(list, s.id, c)))}
                                    className={`overflow-hidden rounded-xl border text-left ${picked ? "border-brand ring-2 ring-brand/30" : c.current ? "border-line-strong" : "border-line"}`}
                                    aria-pressed={picked}
                                  >
                                    <span className="block aspect-video w-full overflow-hidden bg-sunken">{thumb(c.thumbnailUrl, c.title || c.id)}</span>
                                    <span className="block px-1.5 py-1 text-[10.5px] leading-tight text-muted">
                                      {c.current ? "In the film" : `${c.source ?? "archive"} · ${c.licence ?? ""}`}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <p className="text-[12.5px] text-muted">This shot has no saved alternatives; search the archives below.</p>
                        )}
                        <div className="mt-3 flex gap-2">
                          <input
                            value={found.for === s.id ? ask : ""}
                            onChange={(e) => { setAsk(e.target.value.slice(0, 120)); }}
                            onFocus={() => setAsk(s.words.slice(0, 120))}
                            placeholder="Search the archives (free pictures only)"
                            className="h-10 min-w-0 flex-1 rounded-xl border border-line-strong bg-surface px-3 text-[14px] text-ink outline-none focus:border-brand"
                          />
                          <button type="button" aria-label="Search the archives for this shot" onClick={() => void search(s.id, ask || s.words)} className="h-10 shrink-0 rounded-xl border border-line-strong px-3 text-[13.5px] font-medium text-ink transition hover:border-ink/40">
                            {found.for === s.id && found.phase === "loading" ? "Searching…" : "Search"}
                          </button>
                        </div>
                        {found.for === s.id && found.note && <p className="mt-1.5 text-[12.5px] text-muted">{found.note}</p>}
                        {found.for === s.id && found.items.length > 0 && (
                          <div className="mt-2 grid grid-cols-3 gap-2">
                            {found.items.filter(Boolean).map((c) => {
                              if (!c) return null;
                              const picked = swapOf(swaps, s.id)?.candidate.id === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setSwaps((list) => (picked ? dropSwap(list, s.id) : setSwap(list, s.id, c)))}
                                  className={`overflow-hidden rounded-xl border text-left ${picked ? "border-brand ring-2 ring-brand/30" : "border-line"}`}
                                  aria-pressed={picked}
                                >
                                  <span className="block aspect-video w-full overflow-hidden bg-sunken">{thumb(c.thumbnailUrl, c.title || c.id)}</span>
                                  <span className="block px-1.5 py-1 text-[10.5px] leading-tight text-muted">{c.source ?? "archive"} · {c.licence ?? ""}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {shots.length === 0 && <p className="mt-2 text-[13.5px] text-muted">No shot holds those words.</p>}
            <div className="mt-4 rounded-2xl border border-line bg-surface p-3">
              <p className="text-[13px] text-ink-2">{plan.text || "Pick a new picture for at least one shot."}</p>
              <button
                type="button"
                onClick={send}
                disabled={busy || swaps.length === 0}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-brand-gradient text-[15px] font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-60"
              >
                {busy ? "Sending…" : swaps.length ? `Re-make film (${swaps.length})` : "Re-make film"}
              </button>
              <p className="mt-2 text-center text-[12px] text-muted">The release check and the licence list run again on the new film, exactly as they did the first time.</p>
            </div>
          </div>
        )}
      </div>
      <button type="button" onClick={onClose} className="mt-3 w-full text-center text-[14px] font-medium text-brand-ink underline-offset-4 hover:underline">
        Back to the film
      </button>
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
  onSwap,
}: {
  list: VoiceView[] | null;
  hasKey: boolean;
  busy: boolean;
  activeId?: string;
  onLoad: () => void;
  onOpen: (v: VoiceView) => void;
  onRetry: (id: string) => void;
  onDownload: (id: string) => void;
  onSwap: (v: VoiceView) => void;
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
          const draft = f.draft === true;
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
                {draft && f.film ? (
                  <span className="flex shrink-0 items-center gap-2">
                    <button type="button" onClick={() => onDownload(f.id)} className="h-9 shrink-0 rounded-full bg-ink px-4 text-[13px] font-medium text-canvas transition hover:opacity-90">
                      {cardOf(f).download}
                    </button>
                    <button type="button" disabled={busy} onClick={() => onRetry(f.id)} className="h-9 shrink-0 rounded-full border border-line-strong px-3 text-[13px] font-medium text-ink transition hover:border-ink/40 disabled:opacity-60">
                      Try again
                    </button>
                  </span>
                ) : finished && f.film ? (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button type="button" onClick={() => onDownload(f.id)} className="h-9 rounded-full bg-ink px-4 text-[13px] font-medium text-canvas transition hover:opacity-90">
                      Download
                    </button>
                    <button type="button" onClick={() => onSwap(f)} className="h-9 rounded-full border border-line-strong px-4 text-[13px] font-medium text-ink transition hover:border-ink/40">
                      Swap a shot
                    </button>
                  </div>
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
              {draft && cardOf(f).reasons.length > 0 && (
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] text-ink-2">
                  {cardOf(f).reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
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
