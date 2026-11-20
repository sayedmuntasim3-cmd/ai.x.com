import { useEffect, useState } from "react";
import { CheckIcon } from "./icons";

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
type VoiceView = { id: string; status: string; progress: Progress[]; download?: string; run?: { runUrl?: string } | null; kind?: string };

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

export function VoiceFilm({ open, fileName, voiceUrl, topic }: { open: boolean; fileName: string; voiceUrl: string; topic: string }) {
  const [key, setKey] = useState("");
  const [askKey, setAskKey] = useState(false);
  const [quran, setQuran] = useState(false);
  const [surah, setSurah] = useState("");
  const [reciter, setReciter] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [film, setFilm] = useState<VoiceView | null>(null);

  useEffect(() => {
    if (!open) return;
    const saved = readStore(KEY_STORE);
    setKey(saved);
    setAskKey(!saved);
    setError("");
    const last = rememberedFor(fileName);
    setFilm(last ? { id: last, status: "queued", progress: [] } : null);
  }, [open, fileName]);

  // Follow the film while the sheet is open.
  useEffect(() => {
    if (!open || !film?.id) return;
    const studioKey = readStore(KEY_STORE);
    if (!studioKey) return;
    let stop = false;
    let timer = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/voice/${film.id}`, { cache: "no-store", headers: { authorization: `Bearer ${studioKey}` } });
        if (res.ok) {
          const data = (await res.json()) as VoiceView;
          if (!stop) setFilm(data);
          if (["done", "awaiting-review", "failed"].includes(data.status)) return;
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
  }, [open, film?.id]);

  const start = async () => {
    const studioKey = key.trim();
    if (!studioKey) {
      setAskKey(true);
      setError("Enter your studio key to start.");
      return;
    }
    if (quran && !(Number(surah) >= 1 && Number(surah) <= 114)) {
      setError("Say which surah is recited (1-114). A recitation is never guessed.");
      return;
    }
    setBusy(true);
    setError("");
    setSent(0);
    try {
      const blob = await (await fetch(voiceUrl)).blob();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${studioKey}` },
        body: JSON.stringify({ fileName, bytes: blob.size, kind: quran ? "quran" : "narration", topic, ...(quran ? { surah: Number(surah), reciter } : {}) }),
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
      remember(fileName, data.id);
      setFilm(view.id ? view : { id: data.id, status: "uploaded", progress: [] });
      if (!done.ok && view.error) setError(view.error);
    } catch (e) {
      setError(e instanceof Error && e.message ? `The upload stopped: ${e.message}` : "No connection. Check your internet and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (film) {
    const finished = film.status === "done" || film.status === "awaiting-review";
    const stopped = film.status === "failed";
    const last = film.progress.at(-1);
    return (
      <div className="mt-6 rounded-2xl border border-line bg-canvas/50 p-4" aria-live="polite">
        <p className={`${eyebrow} flex items-center gap-1.5`}>
          {finished ? <CheckIcon size={16} /> : <span className="inline-block size-2 animate-pulse rounded-full bg-brand" />}
          {STATUS[film.status] ?? film.status}
        </p>
        {!finished && !stopped && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
            You can close this and come back: the film keeps being made. A 40-minute voiceover takes a few hours on the free machines.
          </p>
        )}
        {film.progress.filter((p) => p.ok).length > 0 && (
          <ol className="mt-3 space-y-1.5 text-[14px] text-ink">
            {film.progress
              .filter((p) => p.ok)
              .slice(-6)
              .map((p) => (
                <li key={p.at + p.stage} className="flex items-start gap-2">
                  <CheckIcon size={15} className="mt-[3px] shrink-0 text-brand-ink" /> {p.message.en}
                </li>
              ))}
          </ol>
        )}
        {stopped && last && <p className="mt-3 text-[14px] text-[#c2410c]">{last.message.en}</p>}
        {film.status === "awaiting-review" && (
          <p className="mt-3 text-[13px] text-muted">A Quran film is never published before a qualified scholar has reviewed the text, the timing and every picture.</p>
        )}
        {error && <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          {film.download ? (
            <a href={film.download} className="inline-flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-medium text-canvas transition hover:opacity-90">
              Download the film
            </a>
          ) : (
            <span className="inline-flex h-11 items-center justify-center rounded-full bg-sunken text-[14px] font-medium text-muted">Film not ready yet</span>
          )}
          <button
            type="button"
            onClick={() => {
              remember(fileName, "");
              setFilm(null);
            }}
            className="inline-flex h-11 items-center justify-center rounded-full border border-line-strong text-[14px] font-medium text-ink transition hover:border-ink/40"
          >
            {stopped ? "Try again" : "Make another"}
          </button>
        </div>
      </div>
    );
  }

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
      <label className="mt-4 flex items-center gap-3 text-[14px] text-ink">
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
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-4 flex h-[56px] w-full items-center justify-center rounded-2xl bg-brand-gradient px-4 text-[16px] font-semibold text-white shadow-cta transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? (sent > 0 ? `Uploading… ${sent}%` : "Starting…") : "Make my film"}
      </button>
      <p className="mt-2 text-[12.5px] text-muted">Your recording stays private. Its words are the script: nothing in them is changed.</p>
      {error && (
        <p role="alert" className="mt-3 text-[14px] text-[#c2410c]">
          {error}
        </p>
      )}
    </div>
  );
}
