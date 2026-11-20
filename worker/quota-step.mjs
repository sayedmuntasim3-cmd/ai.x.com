/**
 * The film Workflow's step wrapper. A stage that stops on Gemini's free daily limit does not
 * end the film: the Workflow sleeps until the quota resets and runs the stage again, at most
 * `maxNights` times. Any other permanent stop ends the film as before. Kept apart from
 * worker/index.mjs (which imports cloudflare:workflows) so Node tests can run it with a fake step.
 */
import { dailyLimitWait } from "./gemini.mjs";

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
    for (let night = 0; ; night += 1) {
      try {
        return await o.step.do(night ? `${base}:after-wait-${night}` : base, o.options, async () => {
          try {
            return await fn();
          } catch (error) {
            const reason = o.permanent(error);
            throw reason ? o.stop(reason) : error;
          }
        });
      } catch (error) {
        const wait = dailyLimitWait(error, now());
        if (wait === null || night >= maxNights) throw error;
        o.log?.(`${base}: free daily quota used up; sleeping ${Math.round(wait / 60000)} min`);
        await o.step.sleep(`${base}:wait-${night + 1}`, wait);
      }
    }
  };
}
