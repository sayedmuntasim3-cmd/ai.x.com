/**
 * The film Workflow's step wrapper. A stage that stops on Gemini's free daily limit does not
 * end the film: the Workflow sleeps until the quota resets and runs the stage again, at most
 * `maxNights` times. Any other permanent stop ends the film as before. Kept apart from
 * worker/index.mjs (which imports cloudflare:workflows) so Node tests can run it with a fake step.
 */
import { dailyLimitWait } from "./gemini.mjs";

/** The stop message for Cloudflare's per-invocation request limit; the outer loop recognises it. */
export const SUBREQUESTS = "Too many subrequests by single Worker invocation (Cloudflare's limit for one run).";
/**
 * Sleeps before each fresh run (the docs promise hibernation only for a "long sleep"). A footage stage needs
 * several runs (about 100 searches a chapter, 50 a run; settled shots are kept), so the first ones are short.
 */
export const FRESH_WAITS = Object.freeze([...Array(10).fill(3 * 60_000), 15 * 60_000, 15 * 60_000, 60 * 60_000]);
/** @param {unknown} error */
export function tooManySubrequests(error) {
  return /too many subrequests/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Set when any fetch of this run met Cloudflare's request limit. The research desk, the source desk and the
 * footage search catch failed fetches and go on with less (film 70577b9b: 2 pages "unreadable"), so a stage
 * could pass on thinner evidence; with this flag such a stage runs again in a fresh run instead.
 */
export const runLimit = { hit: false };

/** Wrap the global fetch once so a limit error anywhere sets runLimit.hit. @param {any} [g] */
export function watchFetch(g = globalThis) {
  if (g.fetch?.watched) return;
  const original = g.fetch;
  const watched = Object.assign(async (/** @type {any[]} */ ...args) => {
    try {
      return await original.apply(g, args);
    } catch (error) {
      if (tooManySubrequests(error)) runLimit.hit = true;
      throw error;
    }
  }, { watched: true });
  g.fetch = watched;
}

/**
 * @param {{
 *   step: { do: (name: string, options: any, fn: () => Promise<any>) => Promise<any>, sleep: (name: string, ms: number) => Promise<void> },
 *   options: any,
 *   prefix?: string,
 *   permanent: (error: unknown) => string | null,
 *   stop: (message: string) => Error,
 *   now?: () => number,
 *   maxNights?: number,
 *   log?: (line: string) => void,
 * }} o
 * @returns {(name: string, fn: () => Promise<any>) => Promise<any>}
 */
export function quotaAwareStep(o) {
  const now = o.now ?? (() => Date.now());
  const maxNights = o.maxNights ?? 7;
  return async (name, fn) => {
    const base = `${o.prefix ?? ""}${name}`;
    let fresh = 0;
    for (let night = 0; ; night += 1) {
      try {
        const id = [base, night ? `after-wait-${night}` : "", fresh ? `fresh-${fresh}` : ""].filter(Boolean).join(":");
        return await o.step.do(id, o.options, async () => {
          runLimit.hit = false;
          try {
            const out = await fn();
            if (runLimit.hit) throw new Error(SUBREQUESTS);
            return out;
          } catch (error) {
            // Cloudflare's per-invocation request limit: a retry in the same engine lifetime fails the same way
            // (film 70577b9b, 20 Nov 2026: s2 failed three times in four minutes), so no retry here; see below.
            if (tooManySubrequests(error)) throw o.stop(SUBREQUESTS);
            const reason = o.permanent(error);
            throw reason ? o.stop(reason) : error;
          }
        });
      } catch (error) {
        // A long sleep lets the Workflow hibernate; the stage then runs again in a new engine lifetime with a
        // fresh request count. Stages already done are not run again.
        if (tooManySubrequests(error) && fresh < FRESH_WAITS.length) {
          o.log?.(`${base}: Cloudflare's request limit for one run reached; sleeping ${FRESH_WAITS[fresh] / 60000} min for a fresh run`);
          await o.step.sleep(`${base}:fresh-wait-${fresh + 1}`, FRESH_WAITS[fresh]);
          fresh += 1;
          night -= 1;
          continue;
        }
        const wait = dailyLimitWait(error, now());
        if (wait === null || night >= maxNights) throw error;
        o.log?.(`${base}: free daily quota used up; sleeping ${Math.round(wait / 60000)} min`);
        await o.step.sleep(`${base}:wait-${night + 1}`, wait);
      }
    }
  };
}
