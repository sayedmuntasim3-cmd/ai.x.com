import { useEffect, useRef, useState } from "react";
import { CheckIcon, DownloadIcon } from "./icons";
import {
  clearStoredUpload,
  estimateLeftSeconds,
  isSettled,
  leftText,
  missingParts,
  pageSay,
  partList,
  putPart,
  readStoredUpload,
  saveStoredUpload,
  stagePercent,
  statusText,
  uploadPercent,
  VOICE_STAGES,
} from "./voice-upload.mjs";

/**
 * Voice → Video: the creator's own recording goes up in pieces to the studio
 * (private, behind the studio key, worker/voice-api.mjs), a film machine turns
 * it into a film, and the progress is followed here — on a phone as well as on
 * a desktop. The words of the recording are the script; nothing in them is
 * changed.
 *
 * An upload that the phone interrupted (a locked screen, a dropped connection)
 * is remembered by its upload id in localStorage, so pressing the button again
 * sends only the pieces that never arrived.
 */

const KEY_STORE = "zupona:studio-key";
const VOICE_STORE = "zupona:voice-films";
/** How often the status card asks the studio how the film is doing. */
const POLL_MS = 20000;
const eyebrow = "text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-ink";

type Progress = { at: string; stage: string; ok: boolean; message: { en: string; bn: string } };
type VoiceView = {
  id: string;
  status: string;
  createdAt?: string;
  progress: Progress[];
  download?: string;
  listen?: string;
  topic?: string;
  fileName?: string;
  kind?: string;
  film?: { bytes: number; seconds: number | null } | null;
  run?: { actionsUrl?: string } | null;
  report?: { ayat?: { ref: string }[] } | null;
};

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
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
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

/** How many bytes one piece holds. */
function pieceBytes(state: { bytes: number; partSize: number }, n: number) {
  return Math.max(0, Math.min(state.partSize, state.bytes - (n - 1) * state.partSize));
}

/** The estimate is honest only when some work is behind us and the film is not finished. */
function estimateFor(film: VoiceView, percent: number) {
  if (isSettled(film.status) || !film.createdAt) return null;
  const elapsed = (Date.now() - Date.parse(film.createdAt)) / 1000;
  return leftText(estimateLeftSeconds({ percent, elapsedSeconds: elapsed }));
}

export function VoiceFilm({
  open,
  fileName,
  voiceUrl,
  topic,
  kind,
  surah,
  reciter,
}: {
  open: boolean;
  fileName: string;
  voiceUrl: string;
  topic: string;
  kind: "narration" | "quran";
  surah: number | null;
  reciter: string;
}) {
  const [key, setKey] = useState("");
  const [askKey, setAskKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [film, setFilm] = useState<VoiceView | null>(null);
  const [pending, setPending] = useState<ReturnType<typeof readStoredUpload>>(null);
  // Bumped when a stopped film is started again, so following it resumes.
  const [round, setRound] = useState(0);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const saved = readStore(KEY_STORE);
    setKey(saved);
    setAskKey(!saved);
    setError("");
    setNote("");
    const resume = readStoredUpload(storage());
    setPending(resume && resume.fileName === fileName && resume.bytes > 0 ? resume : null);
    const last = rememberedFor(fileName);
    setFilm(last ? { id: last, status: "queued", progress: [] } : null);
  }, [open, fileName]);

  // Follow the film while the sheet is open, every 20 s, and stop when it is settled.
  useEffect(() => {
    if (!open || !film?.id) return;
    const studioKey = readStore(KEY_STORE);
    if (!studioKey) return;
    stopRef.current = false;
    let timer = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/voice/${film.id}`, { cache: "no-store", headers: { authorization: `Bearer ${studioKey}` } });
        if (res.ok) {
          const data = (await res.json()) as VoiceView;
          if (!stopRef.current) setFilm(data);
          if (isSettled(data.status)) return;
        } else if (res.status === 404) {
          if (!stopRef.current) setFilm(null);
          return;
        } else if (res.status === 401) {
          if (!stopRef.current) {
            writeStore(KEY_STORE, "");
            setAskKey(true);
            setError(pageSay("voice.page.myFilmsFailed"));
          }
          return;
        }
      } catch {
        /* offline for a moment: try again on the next round */
      }
      if (!stopRef.current) timer = window.setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopRef.current = true;
      window.clearTimeout(timer);
    };
  }, [open, film?.id, round]);

  /**
   * Send every piece that is not on the studio yet, one at a time, remembering
   * each piece's etag: an interrupted upload continues where it stopped.
   */
  const sendParts = async (start: NonNullable<ReturnType<typeof readStoredUpload>>, studioKey: string) => {
    const blob = await (await fetch(voiceUrl)).blob();
    const state = { ...start, etags: { ...start.etags } };
    let sentBytes = 0;
    for (let n = 1; n <= state.parts; n += 1) {
      if (state.etags[String(n)]) {
        sentBytes += pieceBytes(state, n);
        setSent(uploadPercent({ bytes: state.bytes, sentBytes }));
        continue;
      }
      const from = (n - 1) * state.partSize;
      const piece = blob.slice(from, Math.min(state.bytes, from + state.partSize));
      const part = await putPart({
        url: `/api/voice/${state.id}/parts/${n}`,
        key: studioKey,
        body: piece,
        n,
        onRetry: ({ attempt, tries, error: why }) => setNote(pageSay("voice.page.partRetry", { n, attempt, tries, error: why })),
      });
      state.etags[String(n)] = part.etag;
      saveStoredUpload(storage(), { ...state, updatedAt: Date.now() });
      sentBytes += pieceBytes(state, n);
      setSent(uploadPercent({ bytes: state.bytes, sentBytes }));
      setNote("");
    }
    setPending(state);
    const done = await fetch(`/api/voice/${state.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
      body: JSON.stringify({ parts: partList(state) }),
    });
    const view = (await done.json().catch(() => ({}))) as VoiceView & { error?: string };
    if (!done.ok) {
      setError(String(view.error ?? pageSay("voice.page.uploadStopped", { error: `HTTP ${done.status}` })));
      return false;
    }
    clearStoredUpload(storage());
    setPending(null);
    setSent(100);
    remember(fileName, state.id);
    setFilm(view.id ? view : { id: state.id, status: "uploaded", progress: [] });
    setRound((r) => r + 1);
    return true;
  };

  /** Start a new upload: the studio opens the multipart upload, then the pieces go up. */
  const start = async () => {
    const studioKey = key.trim();
    if (!studioKey) {
      setAskKey(true);
      setError("Enter your studio key to start.");
      return;
    }
    if (kind === "quran" && !(Number(surah) >= 1 && Number(surah) <= 114)) {
      setError("Say which surah is recited (1-114). A recitation is never guessed.");
      return;
    }
    setBusy(true);
    setError("");
    setNote("");
    setSent(0);
    try {
      const blob = await (await fetch(voiceUrl)).blob();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
        body: JSON.stringify({
          fileName,
          bytes: blob.size,
          kind,
          topic,
          ...(kind === "quran" ? { surah: Number(surah), reciter } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        writeStore(KEY_STORE, "");
        setAskKey(true);
        setError("That studio key is not right. Check it and try again.");
        return;
      }
      if (!res.ok || !data.id) {
        setError(String(data.error ?? "The studio could not take the recording. Try again in a minute."));
        return;
      }
      writeStore(KEY_STORE, studioKey);
      setAskKey(false);
      const state = {
        id: String(data.id),
        fileName,
        bytes: blob.size,
        partSize: Number(data.partSize),
        parts: Number(data.parts),
        etags: {} as Record<string, string>,
        kind,
        surah: kind === "quran" ? Number(surah) : null,
        reciter,
        topic,
        createdAt: Date.now(),
      };
      saveStoredUpload(storage(), state);
      setPending(state);
      await sendParts(state, studioKey);
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : "no connection";
      setError(pageSay("voice.page.uploadStopped", { error: why }));
    } finally {
      setBusy(false);
    }
  };

  /** Carry on an upload the phone interrupted; nothing already sent goes up twice. */
  const resumeUpload = async () => {
    const studioKey = key.trim() || readStore(KEY_STORE);
    if (!studioKey) {
      setAskKey(true);
      setError("Enter your studio key to start.");
      return;
    }
    const state = pending ?? readStoredUpload(storage());
    if (!state) return;
    setBusy(true);
    setError("");
    setNote("");
    setSent(uploadPercent({ bytes: state.bytes, sentBytes: state.bytes - missingParts(state).reduce((n, i) => n + pieceBytes(state, i), 0) }));
    try {
      await sendParts(state, studioKey);
    } catch (e) {
      const why = e instanceof Error && e.message ? e.message : "no connection";
      setError(pageSay("voice.page.uploadStopped", { error: why }));
    } finally {
      setBusy(false);
    }
  };

  /** A stopped film starts again from the recording already saved: nothing is uploaded twice. */
  const retryFilm = async () => {
    if (!film) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/voice/${film.id}/retry`, { method: "POST", headers: { authorization: `Bearer ${readStore(KEY_STORE)}` } });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.id) {
        setFilm(data as VoiceView);
        setRound((r) => r + 1);
      } else setError(String(data.error ?? "The film could not be started again. Try again in a minute."));
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------ status card ------------------------------ */

  if (film) {
    const finished = film.status === "done" || film.status === "awaiting-review";
    const stopped = film.status === "failed";
    const last = film.progress.at(-1);
    const lastOk = film.progress.filter((p) => p.ok).at(-1);
    const status = statusText(film.status);
    const stage = lastOk?.message ?? last?.message ?? status;
    const percent = finished ? 100 : stagePercent(lastOk?.stage ?? (film.status === "queued" ? "queued" : "uploaded"));
    const step = Math.max(1, VOICE_STAGES.indexOf(lastOk?.stage ?? "queued") + 1);
    const left = estimateFor(film, percent);
    return (
      <div className="mt-6 rounded-2xl border border-line bg-canvas/50 p-4" aria-live="polite">
        <p className={`${eyebrow} flex items-center gap-1.5`}>
          {finished ? <CheckIcon size={16} /> : <span className="inline-block size-2 animate-pulse rounded-full bg-brand" />}
          {status.en}
        </p>
        <p className="mt-0.5 text-[12.5px] text-muted" lang="bn">
          {status.bn}
        </p>

        {!finished && !stopped && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            You can close this and come back: the film keeps being made. A 40-minute voiceover takes a few hours on the free machines.
          </p>
        )}

        {!finished && !stopped && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between gap-3 text-[13px] tabular-nums text-muted">
              <span>{pageSay("voice.page.stage", { n: step, total: VOICE_STAGES.length, percent })}</span>
              <span>{percent}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-labelledby="voice-status">
              <span className="block h-full rounded-full bg-brand-gradient transition-[width] duration-500" style={{ width: `${percent}%` }} />
            </div>
            {left && (
              <p className="mt-1.5 text-[13px] text-muted">
                {left.en} <span lang="bn">{left.bn}</span>
              </p>
            )}
          </div>
        )}

        <p id="voice-status" className="mt-3 text-[14px] leading-relaxed text-ink">
          {stage.en}
        </p>
        <p className="text-[13px] leading-relaxed text-muted" lang="bn">
          {stage.bn}
        </p>

        {film.progress.filter((p) => p.ok).length > 1 && (
          <ol className="mt-3 space-y-1.5 text-[13.5px] text-ink-2">
            {film.progress
              .filter((p) => p.ok)
              .slice(-4, -1)
              .reverse()
              .map((p) => (
                <li key={p.at + p.stage} className="flex items-start gap-2">
                  <CheckIcon size={14} className="mt-[3px] shrink-0 text-brand-ink" /> {p.message.en}
                </li>
              ))}
          </ol>
        )}

        {stopped && last && (
          <div className="mt-3 rounded-xl bg-sunken p-3">
            <p className="text-[14px] leading-relaxed text-ink">{last.message.en}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted" lang="bn">
              {last.message.bn}
            </p>
          </div>
        )}

        {film.status === "awaiting-review" && (
          <p className="mt-3 text-[13px] text-muted">A Quran film is never published before a qualified scholar has reviewed the text, the timing and every picture.</p>
        )}
        {film.status === "awaiting-review" && film.listen && film.report?.ayat?.length ? (
          <AyahMarker
            listen={film.listen}
            refs={film.report.ayat.map((a) => a.ref)}
            onSend={async (marks) => {
              const res = await fetch(`/api/voice/${film.id}/marks`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${readStore(KEY_STORE)}` }, body: JSON.stringify(marks) });
              const data = await res.json().catch(() => ({}));
              if (!res.ok || !data.id) return String(data.error ?? "The marks could not be saved. Try again.");
              setFilm(data as VoiceView);
              setRound((r) => r + 1);
              return "";
            }}
          />
        ) : null}

        {error && <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3">
          {film.download ? (
            <a href={film.download} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-ink text-[14px] font-medium text-canvas transition hover:opacity-90">
              <DownloadIcon size={16} /> {pageSay("voice.page.download")}
            </a>
          ) : (
            <span className="inline-flex h-11 items-center justify-center rounded-full bg-sunken text-[14px] font-medium text-muted">{pageSay("voice.page.notReady")}</span>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              if (!stopped) {
                remember(fileName, "");
                setFilm(null);
                return;
              }
              await retryFilm();
            }}
            className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium text-ink transition hover:border-ink/40 disabled:opacity-60"
          >
            {stopped ? (busy ? "Starting…" : "Try again") : "Make another"}
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------- the form ------------------------------- */

  const resumePercent = pending ? uploadPercent({ bytes: pending.bytes, sentBytes: pending.bytes - missingParts(pending).reduce((n, i) => n + pieceBytes(pending, i), 0) }) : 0;

  return (
    <div className="mt-6">
      {askKey && (
        <label className="block">
          <span className="text-[14px] font-medium text-ink">Studio key</span>
          <input
            type="password"
            autoComplete="current-password"
            autoCapitalize="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError("");
            }}
            className="mt-2 h-12 w-full rounded-2xl border border-line bg-canvas/50 px-4 text-[16px] text-ink outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
          <span className="mt-1.5 block text-[12.5px] text-muted">Asked once, then saved on this device.</span>
        </label>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded-xl bg-sunken p-2.5">
          <dt className="text-muted">Kind</dt>
          <dd className="mt-0.5 font-medium text-ink">{pageSay(kind === "quran" ? "voice.page.kindQuran" : "voice.page.kindNarration")}</dd>
        </div>
        <div className="rounded-xl bg-sunken p-2.5">
          <dt className="text-muted">{kind === "quran" ? "Surah / reciter" : "Topic"}</dt>
          <dd className="mt-0.5 truncate font-medium text-ink">
            {kind === "quran" ? `${surah ?? "—"}${reciter ? ` · ${reciter}` : ""}` : topic || "From the file's own name"}
          </dd>
        </div>
      </dl>

      {kind === "quran" && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          The reciter's own voice only, the exact Uthmani text, no music, and a scholar's review before anything is published.
        </p>
      )}

      {(busy || sent > 0) && (
        <div className="mt-4" role="status" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3 text-[13px] tabular-nums text-muted">
            <span>{pageSay("voice.page.status.uploading")}</span>
            <span>{pageSay("voice.page.sent", { percent: sent })}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={sent} aria-valuemin={0} aria-valuemax={100} aria-label={pageSay("voice.page.sent", { percent: sent })}>
            <span className="block h-full rounded-full bg-brand-gradient transition-[width] duration-300" style={{ width: `${sent}%` }} />
          </div>
          {note && <p className="mt-1.5 text-[13px] text-muted">{note}</p>}
        </div>
      )}

      {pending && !busy && missingParts(pending).length > 0 ? (
        <button
          type="button"
          onClick={resumeUpload}
          className="mt-4 flex h-[56px] w-full items-center justify-center rounded-2xl bg-brand-gradient px-4 text-[15px] font-semibold text-white shadow-cta transition hover:brightness-110 sm:text-[16px]"
        >
          {pageSay("voice.page.resume", { percent: resumePercent })}
        </button>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={busy}
          className="mt-4 flex h-[56px] w-full items-center justify-center rounded-2xl bg-brand-gradient px-4 text-[16px] font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? (sent > 0 ? pageSay("voice.page.sent", { percent: sent }) : "Starting…") : "Make my film"}
        </button>
      )}
      <p className="mt-2 text-[12.5px] text-muted">Your recording stays private. Its words are the script: nothing in them is changed.</p>
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------ My films ------------------------------ */

/**
 * The creator's own films, newest first (GET /api/voice). It needs the studio
 * key that was asked for once; without one it says what to expect and asks for
 * nothing more.
 */
export function MyFilms() {
  const [films, setFilms] = useState<VoiceView[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      const studioKey = readStore(KEY_STORE);
      if (!studioKey) {
        if (live) setFilms([]);
        return;
      }
      try {
        const res = await fetch("/api/voice", { cache: "no-store", headers: { authorization: `Bearer ${studioKey}` } });
        if (!res.ok) {
          if (live) {
            setFilms([]);
            setError(pageSay("voice.page.myFilmsFailed"));
          }
          return;
        }
        const data = (await res.json()) as { films?: VoiceView[] };
        if (live) {
          setFilms(Array.isArray(data.films) ? data.films : []);
          setError("");
        }
      } catch {
        if (live) {
          setFilms([]);
          setError(pageSay("voice.page.myFilmsFailed"));
        }
      }
    };
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!films || films.length === 0) {
    return (
      <div className="mt-6">
        <p className={eyebrow}>{pageSay("voice.page.myFilms")}</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{error || pageSay("voice.page.myFilmsEmpty")}</p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <p className={eyebrow}>{pageSay("voice.page.myFilms")}</p>
      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-2xl border border-line">
        {films.slice(0, 10).map((f) => {
          const status = statusText(f.status);
          const name = f.topic || f.fileName || f.id.slice(0, 8);
          return (
            <li key={f.id} className="flex items-center gap-3 bg-canvas/40 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ink">{name}</p>
                <p className="text-[12.5px] text-muted">
                  {status.en}
                  {f.createdAt ? ` · ${new Date(f.createdAt).toLocaleDateString()}` : ""}
                </p>
              </div>
              {f.download ? (
                <a href={f.download} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-ink px-3 text-[13px] font-medium text-canvas transition hover:opacity-90">
                  <DownloadIcon size={15} /> Download
                </a>
              ) : (
                <span className="shrink-0 text-[12.5px] text-muted">{statusText(f.status).en === statusText("failed").en ? "Stopped" : "In progress"}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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
