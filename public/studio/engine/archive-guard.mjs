/**
 * Two small guards the open archives share (browser + Node, no dependencies):
 *  - a gate for the Library of Congress: one request at a time, spaced apart, backed off on 429/503
 *    (Retry-After honoured, up to 3 tries) and answered from memory when the same query comes again;
 *  - a relevance check: a result is kept only if its text holds a main term of the query.
 */

const STOP = new Set(["the", "and", "for", "with", "from", "into", "over", "near", "that", "this", "its", "of", "in", "on", "at", "a", "an", "to", "by"]);

/** The query's main words: lower case, 3+ letters, stop words removed. @param {string} query */
export function mainTerms(query) {
  return [...new Set(String(query).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w)))];
}

/**
 * True when the text holds at least one main term of the query as a whole word.
 * A query with no usable term keeps everything (nothing to check against).
 * @param {string} query @param {...(string | undefined | null)} texts
 */
export function isRelevant(query, ...texts) {
  const terms = mainTerms(query);
  if (!terms.length) return true;
  const words = new Set(texts.filter(Boolean).join(" ").toLowerCase().split(/[^\p{L}\p{N}]+/u));
  return terms.some((t) => words.has(t) || words.has(`${t}s`) || (t.endsWith("s") && words.has(t.slice(0, -1))));
}

/**
 * @param {{ spacingMs?: number, tries?: number, maxWaitMs?: number, sleep?: (ms: number) => Promise<void>, now?: () => number }} [o]
 */
export function createGate(o = {}) {
  const spacingMs = o.spacingMs ?? 3000;
  const tries = o.tries ?? 3;
  const maxWaitMs = o.maxWaitMs ?? 30_000;
  const sleep = o.sleep ?? ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  /** @type {Map<string, Promise<any>>} */
  const cache = new Map();
  let tail = Promise.resolve();
  let lastStart = -Infinity;
  /** @param {any} e */
  const limited = (e) => e?.status === 429 || e?.status === 503 || e?.status === "rate_limited";
  /** @param {any} e @param {number} attempt */
  const waitFor = (e, attempt) => Math.min(maxWaitMs, Math.max(Number(e?.retryAfterMs) || 0, spacingMs * 2 ** attempt));

  /**
   * Run fn (one HTTP call) through the gate. The same key within the run is answered from memory;
   * a failure is not remembered.
   * @template T @param {string} key @param {() => Promise<T>} fn @returns {Promise<T>}
   */
  function run(key, fn) {
    const hit = cache.get(key);
    if (hit) return hit;
    const job = tail.then(async () => {
      for (let attempt = 0; ; attempt += 1) {
        const wait = lastStart + spacingMs - now();
        if (wait > 0) await sleep(wait);
        lastStart = now();
        try { return await fn(); } catch (e) {
          if (!limited(e) || attempt + 1 >= tries) throw e;
          await sleep(waitFor(e, attempt));
          lastStart = now();
        }
      }
    });
    tail = job.then(() => {}, () => {});
    cache.set(key, job);
    job.catch(() => cache.delete(key));
    return job;
  }
  return { run };
}

/** One gate for the whole process: the film runner and the archive search share LoC's allowance. */
export const locGate = createGate();
