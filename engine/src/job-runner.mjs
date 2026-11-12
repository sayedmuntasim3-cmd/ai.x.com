/**
 * A worker: claim a job it can do, run it while heart-beating, save
 * checkpoints, finish, fail or hand it back, and claim the next.
 *
 * The handler gets an AbortSignal that fires when the job must stop: the
 * lease was lost (another worker took over), the owner cancelled it, the
 * attempt ran past its limit, or this worker is shutting down. On shutdown
 * the job is released (no failure counted) so another worker continues at
 * once; a lost or cancelled job is never completed by this worker.
 * Runtime-agnostic: the queue is jobs.mjs over any store.
 */

/** @typedef {import("./jobs.mjs").Job} Job */
/** @typedef {import("./jobs.mjs").WorkerProfile} WorkerProfile */
/**
 * @typedef {{
 *   job: Job, signal: AbortSignal, lease: string,
 *   checkpoint: (data: any, stage?: string) => Promise<void>,
 *   progress: (stage: string, done: number, total: number) => void,
 *   log: (line: string) => void,
 * }} JobContext
 * @typedef {(job: Job, ctx: JobContext) => Promise<any>} Handler
 */

/** An error a retry cannot fix (bad input, missing file): the job stops instead of retrying. */
export class PermanentError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = "PermanentError"; this.permanent = message; }
}

/** @param {number} ms @param {AbortSignal} [signal] */
const pause = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve(undefined);
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); resolve(undefined); }, { once: true });
});

/**
 * Run one job to its end (done, failed, released or lost).
 * @param {ReturnType<typeof import("./jobs.mjs").createQueue>} queue
 * @param {{ job: Job, token: string }} claimed
 * @param {Handler} handler
 * @param {{ shutdown?: AbortSignal, log?: (line: string) => void, heartbeatMs?: number }} [o]
 * @returns {Promise<"done" | "failed" | "retry" | "released" | "lost" | "cancelled" | "timeout">}
 */
export async function runClaimed(queue, claimed, handler, o = {}) {
  const { job, token } = claimed;
  const log = o.log ?? (() => {});
  const stop = new AbortController();
  /** @type {string | null} */
  let why = null;
  const halt = (/** @type {string} */ reason) => { if (!why) { why = reason; stop.abort(new Error(reason)); } };
  const onShutdown = () => halt("shutdown");
  o.shutdown?.addEventListener("abort", onShutdown, { once: true });
  if (o.shutdown?.aborted) halt("shutdown");
  /** @type {{ stage: string, done: number, total: number } | null} */
  let progress = null;
  const beat = async () => {
    const r = await queue.heartbeat(job.id, token, progress).catch(() => null);
    // A network hiccup is not a lost lease: the next beat tries again before the lease runs out.
    if (r && !r.ok) halt(r.reason);
  };
  const every = o.heartbeatMs ?? Math.max(200, Math.floor(job.leaseMs / 3));
  const timer = setInterval(() => { beat(); }, every);
  try {
    const result = await handler(job, {
      job,
      signal: stop.signal,
      // The lease proves this worker holds the job (the studio's film files are open only to it).
      lease: token,
      checkpoint: async (data, stage) => {
        const r = await queue.checkpoint(job.id, token, data, stage);
        if (!r.ok) { halt(r.reason); throw new Error(`The job was ${r.reason}.`); }
      },
      progress: (stage, done, total) => { progress = { stage, done, total }; },
      log,
    });
    if (why) return finishStopped();
    const r = await queue.complete(job.id, token, result);
    if (!r.ok) { log(`${job.id}: finished, but the job was ${r.reason} meanwhile; the result is not recorded`); return /** @type {any} */ (r.reason); }
    return "done";
  } catch (error) {
    if (why) return finishStopped();
    const message = error instanceof Error ? error.message : String(error);
    const permanent = Boolean(/** @type {any} */ (error)?.permanent);
    const r = await queue.fail(job.id, token, { message, permanent });
    if (!r.ok) return /** @type {any} */ (r.reason);
    return r.job.state === "failed" ? "failed" : "retry";
  } finally {
    clearInterval(timer);
    o.shutdown?.removeEventListener("abort", onShutdown);
  }

  /** The job was stopped from outside: hand it back on shutdown, otherwise let it go. */
  async function finishStopped() {
    if (why === "shutdown") {
      const r = await queue.release(job.id, token).catch(() => null);
      log(`${job.id}: released for another worker`);
      return r?.ok ? "released" : "lost";
    }
    log(`${job.id}: stopped (${why})`);
    return /** @type {any} */ (why);
  }
}

/**
 * Work until shutdown: register, claim what this worker can do, run it,
 * repeat. Idle polling slows down gradually (up to maxPollMs) and speeds up
 * again when work arrives.
 * @param {{ queue: ReturnType<typeof import("./jobs.mjs").createQueue>, worker: WorkerProfile, handlers: Record<string, Handler>,
 *   shutdown?: AbortSignal, pollMs?: number, maxPollMs?: number, once?: boolean, log?: (line: string) => void, heartbeatMs?: number }} o
 */
export async function runWorker(o) {
  const log = o.log ?? (() => {});
  const profile = { ...o.worker, kinds: o.worker.kinds.filter((k) => k in o.handlers) };
  const base = o.pollMs ?? 5000;
  let wait = base;
  /** @type {string[]} */
  const outcomes = [];
  while (!o.shutdown?.aborted) {
    await o.queue.registerWorker(profile).catch(() => {});
    const claimed = await o.queue.claim(profile).catch((/** @type {unknown} */ error) => { log(`claim failed: ${error instanceof Error ? error.message : error}`); return null; });
    if (!claimed) {
      if (o.once) break;
      await pause(wait, o.shutdown);
      wait = Math.min(o.maxPollMs ?? base * 6, Math.round(wait * 1.5));
      continue;
    }
    wait = base;
    log(`${claimed.job.id}: ${claimed.job.kind} claimed (attempt ${claimed.job.attempts})`);
    const outcome = await runClaimed(o.queue, claimed, o.handlers[claimed.job.kind], { shutdown: o.shutdown, log, heartbeatMs: o.heartbeatMs });
    log(`${claimed.job.id}: ${outcome}`);
    outcomes.push(outcome);
    if (o.once) break;
  }
  return outcomes;
}
