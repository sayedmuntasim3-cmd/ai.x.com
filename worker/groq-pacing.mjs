/**
 * The free Groq key's two limits, kept in code: about 1,000 requests a day and 8,000 tokens a minute, per
 * model (measured on the owner's key, 20 Nov 2026; the header of worker/groq.mjs has the detail).
 *
 * A 40-minute voiceover film asks the brain for a few dozen calls in one burst, and the minute's tokens are
 * the wall it hits first: one picture-plan batch is about 4,000 prompt tokens, so two of them in one minute
 * would already be over 8,000. The pacing therefore lives where the calls are made (the runner and the local
 * film run), not in a Worker request: a Worker forgets the previous request, so it cannot keep a minute's
 * budget, and it should not sleep on the runner's behalf.
 *
 * Nothing here touches the network: fetch, the clock and sleep are injected by the caller, so a fake clock
 * proves the pacing in tests.
 */

/** Prompt tokens the free key allows in one minute, per model. */
export const GROQ_TOKENS_PER_MINUTE = 8000;
/** Requests the free key allows in one day, per model. */
export const GROQ_REQUESTS_PER_DAY = 1000;
/** How many times one model is tried on a busy minute before the next model takes the call. */
export const GROQ_RETRIES_PER_MODEL = 3;
/** The wait when Groq's answer carries no reset header: one minute window, plus a second of margin. */
export const GROQ_RETRY_WAIT_MS = 61_000;

/**
 * A duration as Groq writes it in its headers ("2", "2.5s", "1m30s", "150ms", "1h2m3s") in milliseconds.
 * A bare number is seconds (Retry-After's own unit). 0 when it is not a duration.
 * @param {unknown} value
 * @returns {number}
 */
export function durationMs(value) {
  const text = String(value ?? "").trim();
  if (!text) return 0;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  let total = 0;
  let seen = false;
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)\s*(ms|s|m|h)/gi)) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    total += unit === "ms" ? n : unit === "s" ? n * 1000 : unit === "m" ? n * 60_000 : n * 3_600_000;
    seen = true;
  }
  return seen ? Math.round(total) : 0;
}

/** One header off a Response (or a plain object), lower-cased either way. @param {any} headers @param {string} name */
const header = (headers, name) => {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name);
  const hit = Object.keys(headers).find((k) => k.toLowerCase() === name);
  return hit ? headers[hit] : null;
};

/**
 * How long Groq asks the caller to wait: Retry-After (seconds or an HTTP date) first, then the per-minute
 * window headers (x-ratelimit-reset-tokens, x-ratelimit-reset-requests). 0 when it says nothing.
 * @param {any} headers
 * @param {number} [now] epoch milliseconds
 */
export function retryAfterMs(headers, now = Date.now()) {
  const retry = header(headers, "retry-after");
  if (retry) {
    const ms = durationMs(retry);
    if (ms) return ms;
    const date = Date.parse(String(retry));
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }
  for (const name of ["x-ratelimit-reset-tokens", "x-ratelimit-reset-requests"]) {
    const ms = durationMs(header(headers, name));
    if (ms) return ms;
  }
  return 0;
}

/**
 * When the day's quota comes back: the wait Groq names in its answer ("Please try again in 1h2m3s"), else its
 * reset header, else nothing (0). Groq's day is a rolling 24-hour window for these free models, so a body
 * that names no time really means "about a day".
 * @param {string} body @param {any} [headers] @param {number} [now]
 */
export function dailyResetMs(body, headers, now = Date.now()) {
  const said = /try again in\s+([\dhms.\s]+)/i.exec(String(body ?? ""))?.[1];
  const named = durationMs(said);
  if (named) return named;
  const reset = retryAfterMs(headers, now);
  if (reset) return reset;
  return 24 * 3_600_000;
}

/**
 * A wait as a person reads it: "2 min 5 s", "about a day". @param {number} ms
 */
export function waitText(ms) {
  const sec = Math.round(Math.max(0, Number(ms) || 0) / 1000);
  if (!sec) return "";
  if (sec >= 86_400) return "about a day";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h ? `${h} h` : "", m ? `${m} min` : "", s && !h ? `${s} s` : ""].filter(Boolean).join(" ");
}

/**
 * A sliding one-minute token window for each model, on the caller's clock. `waitMs` says how long to wait
 * before a prompt of that size fits under the minute; `spend` records what a call really used (the brain
 * reports its prompt tokens, so the bookkeeping is measured, not guessed).
 * @param {{ tokensPerMinute?: number, now?: () => number }} [o]
 */
export function tokenBucket(o = {}) {
  const perMinute = o.tokensPerMinute ?? GROQ_TOKENS_PER_MINUTE;
  const now = o.now ?? (() => Date.now());
  /** @type {Map<string, { at: number, tokens: number }[]>} */
  const spent = new Map();
  const live = (/** @type {string} */ model, /** @type {number} */ t) => (spent.get(model) ?? []).filter((x) => t - x.at < 60_000);
  return {
    tokensPerMinute: perMinute,
    /** Tokens this model has used in the last minute. @param {string} model */
    used(model) {
      return live(model, now()).reduce((n, x) => n + x.tokens, 0);
    },
    /**
     * Milliseconds to wait before `tokens` fit in this model's minute (0 when they fit now). A prompt larger
     * than the whole minute cannot be helped by waiting: 0 is returned and the call is left to Groq's answer.
     * @param {string} model @param {number} tokens
     */
    waitMs(model, tokens) {
      if (tokens >= perMinute) return 0;
      const t = now();
      const list = live(model, t);
      let total = list.reduce((n, x) => n + x.tokens, 0);
      if (total + tokens <= perMinute) return 0;
      for (const x of list) {
        total -= x.tokens;
        if (total + tokens <= perMinute) return Math.max(0, 60_000 - (t - x.at));
      }
      return 60_000;
    },
    /** Record a call's tokens at the current time. @param {string} model @param {number} tokens */
    spend(model, tokens) {
      const t = now();
      const list = live(model, t);
      list.push({ at: t, tokens: Math.max(0, Math.round(tokens)) });
      spent.set(model, list);
    },
  };
}

/**
 * The prompt's tokens the way worker/groq.mjs counts them (about 3.8 characters a token, 8 per message), so
 * the runner's bucket is filled with the same measure the Worker's limit uses. @param {{ system?: { text: string, image?: string }[], messages?: { role: string, content: { text: string, image?: string }[] }[] }} req
 */
export function promptTokensOf(req) {
  const blocks = [...(req.system ?? []), ...(req.messages ?? []).flatMap((m) => m.content ?? [])].filter((b) => b && !b.image);
  return Math.ceil((blocks.reduce((n, b) => n + String(b.text ?? "").length + 8, 0)) / 3.8);
}
