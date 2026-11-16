/**
 * The cloud studio's job queue, seen from one of the owner's machines: the
 * same interface as engine/src/jobs.mjs createQueue, over HTTP
 * (worker/jobs-api.mjs), so engine/src/job-runner.mjs runs unchanged.
 * Network errors and 5xx answers are retried a bounded number of times with
 * growing waits; a wrong token stops the worker at once with the reason.
 */

/**
 * @param {{ api: string, token: string, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, attempts?: number }} o
 */
export function remoteQueue(o) {
  const base = o.api.replace(/\/+$/, "");
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const attempts = o.attempts ?? 5;

  /** @param {string} path @param {RequestInit} [init] */
  async function call(path, init = {}) {
    for (let i = 1; ; i += 1) {
      try {
        const res = await get(`${base}${path}`, { ...init, headers: { authorization: `Bearer ${o.token}`, ...(init.body && typeof init.body === "string" && !(init.headers && "content-type" in init.headers) ? { "content-type": "application/json" } : {}), ...(init.headers ?? {}) } });
        if (res.status === 401 || res.status === 503) {
          const why = await res.json().catch(() => ({}));
          throw Object.assign(new Error(`The studio refused this worker: ${why.error ?? res.status}`), { permanent: true });
        }
        if (res.status >= 500 && i < attempts) { await sleep(Math.min(30_000, 1000 * 2 ** i)); continue; }
        return res;
      } catch (error) {
        if (/** @type {any} */ (error)?.permanent || i >= attempts) throw error;
        await sleep(Math.min(30_000, 1000 * 2 ** i));
      }
    }
  }
  /** @param {string} path @param {any} body */
  const post = async (path, body) => {
    const res = await call(path, { method: "POST", body: JSON.stringify(body) });
    return { status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
  };
  /** @param {string} id @param {string} verb @param {any} body */
  const held = async (id, verb, body) => {
    const r = await post(`/api/worker/jobs/${encodeURIComponent(id)}/${verb}`, body);
    return r.data?.ok ? { ok: /** @type {const} */ (true), job: r.data.job } : { ok: /** @type {const} */ (false), reason: r.data?.reason ?? `http ${r.status}`, job: null };
  };

  return {
    defaults: { leaseMs: 120_000 },
    /** @param {import("../engine/src/jobs.mjs").WorkerProfile} profile */
    async registerWorker(profile) { await post("/api/worker/register", { profile }); },
    /** @param {import("../engine/src/jobs.mjs").WorkerProfile} profile */
    async claim(profile) {
      const r = await post("/api/worker/claim", { profile });
      return r.status === 200 && r.data?.job ? /** @type {{ job: import("../engine/src/jobs.mjs").Job, token: string }} */ (r.data) : null;
    },
    /** @param {string} id @param {string} token @param {any} [progress] */
    heartbeat: (id, token, progress = null) => held(id, "heartbeat", { token, progress }),
    /** @param {string} id @param {string} token @param {any} data @param {string} [stage] */
    checkpoint: (id, token, data, stage) => held(id, "checkpoint", { token, data, stage }),
    /** @param {string} id @param {string} token @param {any} result */
    complete: (id, token, result) => held(id, "complete", { token, result }),
    /** @param {string} id @param {string} token @param {{ message: string, permanent?: boolean }} error */
    fail: (id, token, error) => held(id, "fail", { token, error }),
    /** @param {string} id @param {string} token */
    release: (id, token) => held(id, "release", { token }),

    /**
     * A film's files in the studio, for the job this worker holds (engine/src/film-run.mjs Store).
     * @param {string} filmId @param {string} jobId @param {string} lease
     */
    filmStore(filmId, jobId, lease) {
      const headers = { "x-job": jobId, "x-lease": lease };
      const at = (/** @type {string} */ name) => `/api/worker/films/${filmId}/files/${name.split("/").map(encodeURIComponent).join("/")}`;
      return {
        /** @param {string} name */
        async get(name) {
          const res = await call(at(name), { headers });
          if (res.status === 404) return null;
          if (!res.ok) throw new Error(`Reading ${name}: the studio answered ${res.status}.`);
          return res.text();
        },
        /** @param {string} name @param {string} text */
        async put(name, text) {
          const res = await call(at(name), { method: "PUT", body: text, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
          if (!res.ok) throw new Error(`Saving ${name}: the studio answered ${res.status}.`);
        },
        async list() {
          const res = await call(`/api/worker/films/${filmId}/files`, { headers });
          if (!res.ok) throw new Error(`Listing the film's files: the studio answered ${res.status}.`);
          return /** @type {string[]} */ ((await res.json()).files);
        },
      };
    },

    /** The channel's fingerprints for the originality check (engine/src/film-run.mjs channel). @param {string} jobId @param {string} lease */
    channel(jobId, lease) {
      const headers = { "x-job": jobId, "x-lease": lease };
      return {
        async load() {
          const res = await call("/api/worker/channel/fingerprints.json", { headers });
          return res.ok ? res.json() : [];
        },
        /** @param {any[]} list */
        async save(list) {
          await call("/api/worker/channel/fingerprints.json", { method: "PUT", body: JSON.stringify(list), headers: { ...headers, "content-type": "application/json" } });
        },
      };
    },
  };
}
