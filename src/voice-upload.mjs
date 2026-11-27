/**
 * The pure parts of the phone upload page (src/voice-film.tsx): splitting a
 * recording into pieces, retrying one piece, resuming an interrupted upload,
 * and turning a film's status into plain words in English and Bangla.
 *
 * Nothing here touches the network or the browser: the caller injects `fetch`,
 * `sleep` and `storage`, so every rule is tested without a real upload
 * (src/voice-upload.test.mjs).
 */
import { msg } from "../engine/src/messages.mjs";

/** Where the upload in flight is remembered, so a locked phone screen does not lose it. */
export const UPLOAD_STORE = "zupona:voice-upload:v1";

/** Largest recording the page takes: the same limit as the studio (worker/voice-api.mjs MAX_AUDIO_BYTES). */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/** Longest recording the page takes: two hours. */
export const MAX_UPLOAD_SECONDS = 2 * 3600;

/** A failed piece is tried again this many times before the upload stops. */
export const PART_RETRIES = 3;

/** The file types the picker offers. */
export const UPLOAD_ACCEPT = ".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4";

/**
 * The stages the film machine reports, in order. It mirrors `VOICE_STAGES` in
 * worker/voice-api.mjs; the test fails if the two ever disagree.
 */
export const VOICE_STAGES = /** @type {const} */ ([
  "script",
  "narrate",
  "uploaded",
  "marked",
  "queued",
  "started",
  "intake",
  "words",
  "understand",
  "master",
  "pictures",
  "render",
  "check",
  "deliver",
  "done",
]);

/** @param {string} code @param {Record<string, string | number>} [params] */
export function pageText(code, params = {}) {
  const m = msg(code, params);
  return { en: m.en, bn: m.bn };
}

/** @param {string} code @param {Record<string, string | number>} [params] @param {"en" | "bn"} [lang] */
export function pageSay(code, params = {}, lang = "en") {
  return msg(code, params)[lang === "bn" ? "bn" : "en"];
}

/**
 * The recording cut into the pieces the studio takes: every piece but the last
 * is `partSize` bytes (R2 asks for equal sizes) and the last holds the rest.
 * @param {number} bytes @param {number} partSize
 */
export function planParts(bytes, partSize) {
  const total = Number(bytes);
  const size = Number(partSize);
  if (!(size > 0)) throw new Error("partSize must be positive");
  if (!(total >= 0)) throw new Error("bytes must be zero or more");
  const count = Math.max(1, Math.ceil(total / size));
  return Array.from({ length: count }, (_, i) => ({
    partNumber: i + 1,
    start: i * size,
    end: Math.min(total, (i + 1) * size),
  }));
}

/**
 * How much of the recording has been sent, in whole percent.
 * @param {{ bytes: number, sentBytes: number }} o
 */
export function uploadPercent({ bytes, sentBytes }) {
  if (!(bytes > 0)) return 0;
  const pct = Math.round((Math.max(0, Math.min(bytes, Number(sentBytes) || 0)) / bytes) * 100);
  return Math.max(0, Math.min(100, pct));
}

/**
 * How far the film is, from the last stage it reported. A stage the page does
 * not know counts as the start, never as the end.
 * @param {string} stage
 */
export function stagePercent(stage) {
  const i = VOICE_STAGES.indexOf(/** @type {any} */ (stage));
  if (i < 0) return 0;
  return Math.round((i / (VOICE_STAGES.length - 1)) * 100);
}

/**
 * Time left, from how much is done and how long it took: the same pace carries on.
 * Unknown or too early to tell gives null (the page then shows no estimate).
 * @param {{ percent: number, elapsedSeconds: number }} o
 */
export function estimateLeftSeconds({ percent, elapsedSeconds }) {
  const pct = Number(percent);
  const elapsed = Number(elapsedSeconds);
  if (!Number.isFinite(pct) || !Number.isFinite(elapsed) || elapsed < 0) return null;
  if (pct >= 100) return 0;
  if (!(pct > 0)) return null;
  const total = (elapsed * 100) / pct;
  return Math.max(0, Math.round(total - elapsed));
}

/** @param {number} seconds @param {"en" | "bn"} lang */
function timeWords(seconds, lang) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes >= 60) return pageSay("voice.page.hours", { n: Math.round(minutes / 60) }, lang);
  return pageSay("voice.page.minutes", { n: minutes }, lang);
}

/**
 * "About 3 hr left." in both languages, or null when there is nothing to say.
 * @param {number | null} seconds
 */
export function leftText(seconds) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  if (seconds <= 45) return pageText("voice.page.leftSoon");
  return {
    en: pageSay("voice.page.left", { time: timeWords(seconds, "en") }, "en"),
    bn: pageSay("voice.page.left", { time: timeWords(seconds, "bn") }, "bn"),
  };
}

/** The statuses the studio reports (worker/voice-api.mjs statusOf). */
export const STATUSES = /** @type {const} */ (["uploading", "uploaded", "queued", "running", "done", "awaiting-review", "failed"]);

/**
 * A film's status in plain words, in both languages.
 * @param {string} status
 */
export function statusText(status) {
  const known = STATUSES.includes(/** @type {any} */ (status)) ? status : "running";
  return pageText(`voice.page.status.${known}`);
}

/** A finished film needs no polling: done, failed, or waiting for a scholar. */
export function isSettled(status) {
  return status === "done" || status === "awaiting-review" || status === "failed";
}

/**
 * The upload in flight, from device storage. Anything unexpected (private
 * windows, a half-written value, an older shape) gives null, never a throw.
 * @param {{ getItem(k: string): string | null } | null | undefined} storage
 * @returns {{ id: string, fileName: string, bytes: number, partSize: number, parts: number, etags: Record<string, string>, kind: string, surah: number | null, reciter: string, topic: string, createdAt: number } | null}
 */
export function readStoredUpload(storage) {
  try {
    const raw = storage?.getItem(UPLOAD_STORE);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.id !== "string" || !/^[0-9a-f-]{36}$/.test(saved.id)) return null;
    if (!Number.isInteger(saved.parts) || saved.parts < 1) return null;
    const etags = saved.etags && typeof saved.etags === "object" ? saved.etags : {};
    const clean = {};
    for (const [n, etag] of Object.entries(etags)) if (/^\d+$/.test(n) && typeof etag === "string" && etag) clean[n] = etag;
    return {
      id: saved.id,
      fileName: String(saved.fileName ?? ""),
      bytes: Number(saved.bytes) || 0,
      partSize: Number(saved.partSize) || 0,
      parts: saved.parts,
      etags: clean,
      kind: saved.kind === "quran" ? "quran" : "narration",
      surah: Number.isInteger(saved.surah) ? saved.surah : null,
      reciter: String(saved.reciter ?? ""),
      topic: String(saved.topic ?? ""),
      createdAt: Number(saved.createdAt) || 0,
    };
  } catch {
    return null;
  }
}

/** @param {{ setItem(k: string, v: string): void } | null | undefined} storage @param {any} state @returns {boolean} */
export function saveStoredUpload(storage, state) {
  try {
    storage?.setItem(UPLOAD_STORE, JSON.stringify(state));
    return Boolean(storage);
  } catch {
    return false;
  }
}

/** @param {{ removeItem(k: string): void } | null | undefined} storage */
export function clearStoredUpload(storage) {
  try {
    storage?.removeItem(UPLOAD_STORE);
  } catch {
    /* private window: there was nothing to remove */
  }
}

/** The pieces still to send, in order. @param {{ parts: number, etags: Record<string, string> }} state */
export function missingParts(state) {
  const done = Object.keys(state.etags ?? {});
  const out = [];
  for (let n = 1; n <= state.parts; n += 1) if (!done.includes(String(n))) out.push(n);
  return out;
}

/**
 * The pieces already sent, by number, in the shape `complete` wants.
 * @param {{ parts: number, etags: Record<string, string> }} state
 */
export function partList(state) {
  return Array.from({ length: state.parts }, (_, i) => ({ partNumber: i + 1, etag: state.etags[String(i + 1)] })).filter((p) => p.etag);
}

/** @param {number} ms */
const defaultSleep = (/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A failed piece, with whether sending it again could help. */
export class UploadPartError extends Error {
  /** @param {string} message @param {{ retryable?: boolean }} [o] */
  constructor(message, { retryable = true } = {}) {
    super(message);
    this.name = "UploadPartError";
    this.retryable = retryable;
  }
}

/**
 * Send one piece, tried again on a dropped connection or a server error, up to
 * `retries` times more. A refusal the server will repeat (a wrong studio key, a
 * piece of the wrong size) is not retried.
 * @param {{
 *   url: string,
 *   key: string,
 *   body: Blob,
 *   fetchImpl?: typeof fetch,
 *   retries?: number,
 *   sleep?: (ms: number) => Promise<unknown>,
 *   n?: number,
 *   onRetry?: (o: { attempt: number, tries: number, error: string }) => void,
 * }} o
 * @returns {Promise<{ partNumber: number, etag: string }>}
 */
export async function putPart(o) {
  const doFetch = o.fetchImpl ?? fetch;
  const retries = Math.max(0, Number.isInteger(o.retries) ? Number(o.retries) : PART_RETRIES);
  const sleep = o.sleep ?? defaultSleep;
  let last = "no connection";
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    let retryable = true;
    try {
      const res = await doFetch(o.url, { method: "PUT", headers: { authorization: `Bearer ${o.key}` }, body: o.body });
      const data = /** @type {any} */ (await res.json().catch(() => ({})));
      if (res.ok && data?.etag) return { partNumber: Number(data.partNumber ?? o.n ?? 0), etag: String(data.etag) };
      last = String(data?.error ?? `HTTP ${res.status}`);
      // 4xx is the server's final answer, except a timeout or "too many requests".
      retryable = !(res.status >= 400 && res.status < 500) || res.status === 408 || res.status === 429;
    } catch (error) {
      last = error instanceof Error && error.message ? error.message : "no connection";
    }
    if (!retryable) throw new UploadPartError(last, { retryable: false });
    if (attempt < retries) {
      o.onRetry?.({ attempt: attempt + 1, tries: retries, error: last });
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new UploadPartError(last);
}
