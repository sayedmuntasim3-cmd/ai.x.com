/**
 * Durable jobs: a queue that survives restarts and lost workers.
 *
 * A job is claimed with a lease. The worker holding it heart-beats; when it
 * stops (a closed laptop, a killed process, a lost network), the lease runs
 * out and any eligible worker reclaims the job and continues from its last
 * checkpoint. Failures are counted and bounded, retried with exponential
 * backoff; an error that a retry cannot fix is never retried. Each attempt
 * has a time limit. Nothing is deleted: a failed or cancelled job keeps its
 * history and can be queued again by the owner.
 *
 * Every change is a compare-and-swap on a versioned store, so two workers
 * can never both win the same claim:
 *   read(key)                  -> { text, version } | null
 *   write(key, text, ifVersion) -> new version, or null when the condition fails
 *                                 (ifVersion: a version = only if unchanged;
 *                                  null = only if absent; undefined = always)
 *   list(prefix)               -> keys
 * Backends: memoryJobStore (tests, one process), the folder store in
 * local/folder-store.mjs (several processes or machines sharing a disk) and
 * R2 with conditional writes (worker/jobs-api.mjs).
 *
 * At large scale the same interface belongs on a strongly consistent store
 * with a claim index (a Durable Object, for example); listing every job to
 * claim one is fine for one owner's studio, not for millions of jobs.
 */
import { msg } from "./messages.mjs";

/** @typedef {{ read(key: string): Promise<{ text: string, version: string } | null>, write(key: string, text: string, ifVersion?: string | null): Promise<string | null>, list(prefix: string): Promise<string[]> }} JobStore */
/** @typedef {{ code: string, params?: Record<string, string | number> }} Message */
/** @typedef {{ capabilities?: string[], minMemoryMb?: number, minContextTokens?: number }} Requirements */
/** @typedef {{ id: string, name?: string, kinds: string[], capabilities: string[], resources?: { memoryMb?: number, cpus?: number, contextTokens?: number }, version?: string }} WorkerProfile */
/**
 * @typedef {{
 *   id: string, kind: string, title?: string, filmId?: string | null, input: any,
 *   requires: Requirements, priority: number,
 *   state: "queued" | "running" | "done" | "failed" | "cancelled",
 *   attempts: number, failures: number, maxFailures: number,
 *   leaseMs: number, timeoutMs: number, notBefore: number,
 *   lease: { worker: string, token: string, expiresAt: number, startedAt: number } | null,
 *   checkpoint: any, progress: { stage: string, done: number, total: number } | null,
 *   result: any, error: { message: string, permanent: boolean } | null,
 *   history: { at: string, event: string, worker?: string, message: Message }[],
 *   createdAt: number, updatedAt: number,
 * }} Job
 */

export const JOB_DEFAULTS = Object.freeze({
  /** A worker that has not heart-beaten for this long has lost the job. */
  leaseMs: 120_000,
  /** One attempt may run this long. */
  timeoutMs: 6 * 3_600_000,
  /** After this many failed attempts the job stops and waits for the owner. */
  maxFailures: 3,
  backoffMs: 30_000,
  maxBackoffMs: 30 * 60_000,
  /** History entries kept per job. */
  history: 60,
  /** A worker not seen for this many leases is counted as gone. */
  workerGraceLeases: 3,
});

const JOB = (/** @type {string} */ id) => `jobs/${id}.json`;
const WORKER = (/** @type {string} */ id) => `workers/${id}.json`;

/** An in-memory versioned store (tests, a single process). */
export function memoryJobStore() {
  /** @type {Map<string, { text: string, version: string }>} */
  const m = new Map();
  let n = 0;
  return {
    m,
    /** @param {string} key */
    async read(key) { return m.get(key) ?? null; },
    /** @param {string} key @param {string} text @param {string | null} [ifVersion] */
    async write(key, text, ifVersion) {
      const cur = m.get(key);
      if (ifVersion === null && cur) return null;
      if (typeof ifVersion === "string" && cur?.version !== ifVersion) return null;
      n += 1;
      const version = String(n);
      m.set(key, { text, version });
      return version;
    },
    /** @param {string} prefix */
    async list(prefix) { return [...m.keys()].filter((k) => k.startsWith(prefix)); },
  };
}

/**
 * Can this worker do this job? Its kind, every capability, and enough memory.
 * @param {Job} job @param {WorkerProfile} worker
 */
export function canRun(job, worker) {
  return worker.kinds.includes(job.kind) && missingFor(job, worker).length === 0
    && (worker.resources?.memoryMb ?? Infinity) >= (job.requires.minMemoryMb ?? 0)
    // A film needs a brain whose window holds its largest stage (bossism.mjs windowNeeds); a hosted brain reports none.
    && (worker.resources?.contextTokens ?? Infinity) >= (job.requires.minContextTokens ?? 0);
}

/** What a worker lacks for a job. @param {Job} job @param {WorkerProfile} worker */
export function missingFor(job, worker) {
  return (job.requires.capabilities ?? []).filter((c) => !worker.capabilities.includes(c));
}

/**
 * The wait before retrying after this many failures: doubling, capped.
 * @param {number} failures @param {{ backoffMs: number, maxBackoffMs: number }} d
 */
export function backoff(failures, d = JOB_DEFAULTS) {
  return Math.min(d.maxBackoffMs, d.backoffMs * 2 ** Math.max(0, failures - 1));
}

/**
 * @param {{ store: JobStore, now?: () => number, newId?: () => string, defaults?: Partial<typeof JOB_DEFAULTS> }} o
 */
export function createQueue(o) {
  const store = o.store;
  const now = o.now ?? (() => Date.now());
  const newId = o.newId ?? (() => crypto.randomUUID());
  const d = { ...JOB_DEFAULTS, ...(o.defaults ?? {}) };

  /** @param {Job} job @param {string} event @param {Message} message @param {string} [worker] */
  const note = (job, event, message, worker) => {
    job.history.push({ at: new Date(now()).toISOString(), event, ...(worker ? { worker } : {}), message });
    if (job.history.length > d.history) job.history.splice(0, job.history.length - d.history);
  };

  /**
   * Change one job with compare-and-swap: fn returns the new job, or null to
   * leave it as it is. A lost race reads again and retries.
   * @param {string} id @param {(job: Job) => Job | null} fn
   * @returns {Promise<Job | null>} the job as written, or null when fn declined or the job is gone
   */
  async function update(id, fn) {
    for (let tries = 0; tries < 8; tries += 1) {
      const cur = await store.read(JOB(id));
      if (!cur) return null;
      const job = /** @type {Job} */ (JSON.parse(cur.text));
      const next = fn(job);
      if (!next) return null;
      next.updatedAt = now();
      if ((await store.write(JOB(id), JSON.stringify(next), cur.version)) !== null) return next;
    }
    throw new Error(`Job ${id} kept changing under us; try again.`);
  }

  /** Expired lease or past its time limit: the failure is counted, the job queued again or stopped. @param {Job} job @param {"lost" | "timeout"} why */
  const reclaim = (job, why) => {
    const lease = /** @type {NonNullable<Job["lease"]>} */ (job.lease);
    job.failures += 1;
    note(job, why, why === "lost" ? msg("job.lost", { worker: lease.worker, attempt: job.attempts }) : msg("job.timeout", { attempt: job.attempts, minutes: Math.round(job.timeoutMs / 60000) }), lease.worker);
    job.lease = null;
    if (job.failures >= job.maxFailures) {
      job.state = "failed";
      job.error = { message: why === "lost" ? `The worker ${lease.worker} stopped answering.` : `An attempt ran past ${Math.round(job.timeoutMs / 60000)} minutes.`, permanent: false };
      note(job, "failed", msg("job.failed", { failures: job.failures, error: job.error.message }));
    } else {
      job.state = "queued";
      // A worker that vanished says nothing about the job: another may continue at once (the loss still counts,
      // so a job that keeps killing its workers stops at maxFailures). An attempt that ran too long waits first.
      job.notBefore = why === "lost" ? now() : now() + backoff(job.failures, d);
    }
    return job;
  };

  /** @param {Job} job @param {number} t */
  const expired = (job, t) => job.state === "running" && job.lease !== null && (job.lease.expiresAt <= t || t - job.lease.startedAt > job.timeoutMs);

  /** @param {string} id @param {string} token @param {(job: Job) => Job | null} fn */
  async function held(id, token, fn) {
    /** @type {"lost" | "cancelled" | "timeout" | "missing" | null} */
    let reason = null;
    const job = await update(id, (j) => {
      if (j.state === "cancelled") { reason = "cancelled"; return null; }
      if (j.state !== "running" || j.lease?.token !== token) { reason = "lost"; return null; }
      if (now() - j.lease.startedAt > j.timeoutMs) { reason = "timeout"; return reclaim(j, "timeout"); }
      return fn(j);
    });
    if (!job && !reason) reason = "missing";
    return reason ? { ok: /** @type {const} */ (false), reason, job } : { ok: /** @type {const} */ (true), job: /** @type {Job} */ (job) };
  }

  return {
    defaults: d,

    /**
     * @param {{ kind: string, input?: any, title?: string, filmId?: string | null, requires?: Requirements, priority?: number, maxFailures?: number, leaseMs?: number, timeoutMs?: number, id?: string }} spec
     * @returns {Promise<Job>}
     */
    async enqueue(spec) {
      if (!spec.kind) throw new Error("A job needs a kind.");
      const t = now();
      /** @type {Job} */
      const job = {
        id: spec.id ?? newId(), kind: spec.kind, title: spec.title, filmId: spec.filmId ?? null, input: spec.input ?? {},
        requires: { capabilities: [...(spec.requires?.capabilities ?? [])], ...(spec.requires?.minMemoryMb ? { minMemoryMb: spec.requires.minMemoryMb } : {}), ...(spec.requires?.minContextTokens ? { minContextTokens: spec.requires.minContextTokens } : {}) },
        priority: spec.priority ?? 0, state: "queued", attempts: 0, failures: 0,
        maxFailures: spec.maxFailures ?? d.maxFailures, leaseMs: spec.leaseMs ?? d.leaseMs, timeoutMs: spec.timeoutMs ?? d.timeoutMs,
        notBefore: t, lease: null, checkpoint: null, progress: null, result: null, error: null, history: [], createdAt: t, updatedAt: t,
      };
      note(job, "queued", msg("job.queued"));
      if ((await store.write(JOB(job.id), JSON.stringify(job), null)) === null) throw new Error(`A job with the id ${job.id} already exists.`);
      return job;
    },

    /** @param {string} id @returns {Promise<Job | null>} */
    async get(id) {
      const cur = await store.read(JOB(id));
      return cur ? JSON.parse(cur.text) : null;
    },

    /** @param {{ states?: Job["state"][], filmId?: string }} [f] @returns {Promise<Job[]>} */
    async list(f = {}) {
      const jobs = [];
      for (const key of await store.list("jobs/")) {
        const cur = await store.read(key);
        if (!cur) continue;
        const job = /** @type {Job} */ (JSON.parse(cur.text));
        if (f.states && !f.states.includes(job.state)) continue;
        if (f.filmId && job.filmId !== f.filmId) continue;
        jobs.push(job);
      }
      return jobs.sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt);
    },

    /**
     * Take the most urgent job this worker can do, or reclaim one whose worker
     * stopped answering. Exactly one worker wins each claim.
     * @param {WorkerProfile} worker
     * @returns {Promise<{ job: Job, token: string } | null>}
     */
    async claim(worker) {
      const t = now();
      const candidates = (await this.list({ states: ["queued", "running"] })).filter((j) => (j.state === "queued" ? j.notBefore <= t : expired(j, t)) && canRun(j, worker));
      for (const c of candidates) {
        const token = newId();
        let won = false;
        const job = await update(c.id, (j) => {
          let changed = false;
          if (j.state === "running" && expired(j, now())) { reclaim(j, j.lease && now() - j.lease.startedAt > j.timeoutMs ? "timeout" : "lost"); changed = true; }
          if (j.state !== "queued" || j.notBefore > now() || !canRun(j, worker)) {
            // Reclaimed but not claimable now (backoff, or stopped for good): keep that change; otherwise leave the job alone.
            return changed ? j : null;
          }
          const previous = [...j.history].reverse().find((h) => h.event === "lost" || h.event === "timeout")?.worker;
          j.state = "running";
          j.attempts += 1;
          j.lease = { worker: worker.id, token, expiresAt: now() + j.leaseMs, startedAt: now() };
          j.error = null;
          note(j, "claimed", previous && j.checkpoint !== null ? msg("job.reclaimed", { previous, worker: worker.name ?? worker.id }) : msg("job.claimed", { worker: worker.name ?? worker.id, attempt: j.attempts }), worker.id);
          won = true;
          return j;
        });
        if (won && job) return { job, token };
      }
      return null;
    },

    /**
     * Keep the lease and report progress. ok: false means stop working on it:
     * lost (another worker has it), cancelled, timeout or missing.
     * @param {string} id @param {string} token @param {{ stage: string, done: number, total: number } | null} [progress]
     */
    async heartbeat(id, token, progress = null) {
      return held(id, token, (j) => {
        /** @type {NonNullable<Job["lease"]>} */ (j.lease).expiresAt = now() + j.leaseMs;
        if (progress) j.progress = progress;
        return j;
      });
    },

    /** Save how far the job got; a reclaimed job starts from here. @param {string} id @param {string} token @param {any} data @param {string} [stage] */
    async checkpoint(id, token, data, stage) {
      return held(id, token, (j) => {
        j.checkpoint = data;
        /** @type {NonNullable<Job["lease"]>} */ (j.lease).expiresAt = now() + j.leaseMs;
        if (stage) note(j, "checkpoint", msg("job.checkpoint", { stage }), j.lease?.worker);
        return j;
      });
    },

    /** @param {string} id @param {string} token @param {any} result */
    async complete(id, token, result) {
      return held(id, token, (j) => {
        j.state = "done";
        j.result = result ?? null;
        j.lease = null;
        j.progress = null;
        note(j, "done", msg("job.done"));
        return j;
      });
    },

    /**
     * A failed attempt: queued again after a backoff, or stopped when the error
     * is permanent or the failures reach the limit.
     * @param {string} id @param {string} token @param {{ message: string, permanent?: boolean }} error
     */
    async fail(id, token, error) {
      return held(id, token, (j) => {
        const worker = j.lease?.worker;
        j.failures += 1;
        j.lease = null;
        j.error = { message: String(error.message ?? error).slice(0, 1000), permanent: Boolean(error.permanent) };
        if (j.error.permanent) {
          j.state = "failed";
          note(j, "failed", msg("job.failedPermanent", { error: j.error.message }), worker);
        } else if (j.failures >= j.maxFailures) {
          j.state = "failed";
          note(j, "failed", msg("job.failed", { failures: j.failures, error: j.error.message }), worker);
        } else {
          j.state = "queued";
          const wait = backoff(j.failures, d);
          j.notBefore = now() + wait;
          note(j, "retry", msg("job.retry", { attempt: j.attempts, error: j.error.message, seconds: Math.round(wait / 1000) }), worker);
        }
        return j;
      });
    },

    /** A graceful stop (the worker is shutting down): queued again at once, no failure counted. @param {string} id @param {string} token */
    async release(id, token) {
      return held(id, token, (j) => {
        const worker = j.lease?.worker ?? "";
        j.state = "queued";
        j.lease = null;
        j.notBefore = now();
        note(j, "released", msg("job.released", { worker }), worker);
        return j;
      });
    },

    /** The owner stops a job; its worker sees it at the next heartbeat. Finished work stays. @param {string} id */
    async cancel(id) {
      return update(id, (j) => {
        if (j.state === "done" || j.state === "cancelled") return null;
        j.state = "cancelled";
        j.lease = null;
        note(j, "cancelled", msg("job.cancelled"));
        return j;
      });
    },

    /** The owner queues a failed or cancelled job again, with its checkpoint and a fresh failure count. @param {string} id */
    async retry(id) {
      return update(id, (j) => {
        if (j.state !== "failed" && j.state !== "cancelled") return null;
        j.state = "queued";
        j.failures = 0;
        j.error = null;
        j.notBefore = now();
        note(j, "resumed", msg("job.resumed"));
        return j;
      });
    },

    /** A worker says it is alive and what it can do. @param {WorkerProfile} worker */
    async registerWorker(worker) {
      await store.write(WORKER(worker.id), JSON.stringify({ ...worker, lastSeen: now() }));
    },

    /**
     * The queue's health: live workers, jobs by state, and queued jobs that no
     * live worker can do (with what is missing), so nothing waits silently.
     */
    async health() {
      const t = now();
      /** @type {(WorkerProfile & { lastSeen: number, alive: boolean })[]} */
      const workers = [];
      for (const key of await store.list("workers/")) {
        const cur = await store.read(key);
        if (!cur) continue;
        const w = JSON.parse(cur.text);
        workers.push({ ...w, alive: t - w.lastSeen <= d.leaseMs * d.workerGraceLeases });
      }
      const jobs = await this.list();
      /** @type {Record<string, number>} */
      const counts = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0 };
      for (const j of jobs) counts[j.state] += 1;
      const alive = workers.filter((w) => w.alive);
      const waiting = jobs.filter((j) => j.state === "queued" && !alive.some((w) => canRun(j, w))).map((j) => {
        const needs = [...new Set([j.kind, ...(j.requires.capabilities ?? [])])].filter((n) => !alive.some((w) => w.kinds.includes(n) || w.capabilities.includes(n)));
        return { id: j.id, kind: j.kind, message: msg("job.noWorker", { needs: (needs.length ? needs : [j.kind]).join(", ") }) };
      });
      const stale = jobs.filter((j) => expired(j, t)).map((j) => j.id);
      return { at: new Date(t).toISOString(), workers, counts, waiting, stale };
    },
  };
}
