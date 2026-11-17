/**
 * The studio's job queue over HTTP, so the owner's own machines (a home PC
 * with the free brain, a laptop with ffmpeg) take work from the cloud studio.
 * Workers call out to the studio; nothing at home is exposed to the internet.
 *
 * Owner (Bearer STUDIO_TOKEN):
 *   GET  /api/jobs?film=<id>          the jobs, with their last message in English and Bengali
 *   GET  /api/jobs/health             live workers, jobs by state, work nothing connected can do
 *   POST /api/jobs                    { kind: "selftest", steps?, stepMs? } (render jobs come from the render route)
 *   POST /api/jobs/:id/cancel|retry
 * Workers (Bearer WORKER_TOKEN, a separate secret: a machine's credential cannot start films or spend money):
 *   POST /api/worker/register|claim   { profile }
 *   POST /api/worker/jobs/:id/heartbeat|checkpoint|complete|fail|release   { token, ... }
 *   GET  /api/worker/films/:film/files                 the film's file names
 *   GET|PUT /api/worker/films/:film/files/:name        one file
 *   GET|PUT /api/worker/channel/:name                  the channel's fingerprints and lessons
 *   File and channel calls carry x-job and x-lease: only a worker holding a
 *   running job for that film may read or write it.
 */
import { createQueue } from "../engine/src/jobs.mjs";
import { r2JobStore } from "./r2-job-store.mjs";

const FILM = /^[0-9a-f-]{36}$/;
const KEY = /^(batches\/)?[a-z0-9][a-z0-9.-]{0,80}$/i;
const CHANNEL = new Set(["fingerprints.json", "lessons.json"]);

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/** Constant-time comparison. @param {string} a @param {string} b */
function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** @param {Request} request */
const bearer = (request) => (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

/**
 * A worker's description of itself, kept to what the queue needs.
 * @param {any} p @returns {import("../engine/src/jobs.mjs").WorkerProfile | null}
 */
export function cleanProfile(p) {
  const id = typeof p?.id === "string" ? p.id.slice(0, 100) : "";
  if (!/^[\w.#@ -]+$/.test(id)) return null;
  const list = (/** @type {unknown} */ v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && /^[\w:.-]{1,40}$/.test(x)).slice(0, 40) : []);
  const num = (/** @type {unknown} */ v) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
  const r = p.resources ?? {};
  return {
    id,
    name: typeof p.name === "string" ? p.name.slice(0, 100) : id,
    kinds: list(p.kinds),
    capabilities: list(p.capabilities),
    resources: { memoryMb: num(r.memoryMb), cpus: num(r.cpus), contextTokens: num(r.contextTokens) },
  };
}

/** The queue on the studio's bucket. @param {any} env @param {() => number} [now] */
export function studioQueue(env, now) {
  return createQueue({ store: r2JobStore(env.FILMS), ...(now ? { now } : {}) });
}

/** A short summary of a job for the studio page. @param {import("../engine/src/jobs.mjs").Job} j */
export function summary(j) {
  const last = j.history.at(-1);
  return { id: j.id, kind: j.kind, title: j.title ?? null, filmId: j.filmId, state: j.state, attempts: j.attempts, failures: j.failures, progress: j.progress, worker: j.lease?.worker ?? null, message: last?.message ?? null, error: j.error, updatedAt: j.updatedAt };
}

/**
 * Handle a jobs or worker route; null when the path is not one.
 * @param {Request} request @param {any} env @param {URL} url @param {{ now?: () => number }} [o]
 * @returns {Promise<Response | null>}
 */
export async function handleJobs(request, env, url, o = {}) {
  const path = url.pathname;
  if (!path.startsWith("/api/jobs") && !path.startsWith("/api/worker/")) return null;
  if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
  const queue = studioQueue(env, o.now);
  const body = request.method === "POST" || request.method === "PUT" ? null : undefined;
  /** @returns {Promise<any>} */
  const read = async () => (body === undefined ? null : request.json().catch(() => null));

  if (path.startsWith("/api/jobs")) {
    if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first." }, 503);
    if (!same(bearer(request), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
    if (path === "/api/jobs" && request.method === "GET") {
      const film = url.searchParams.get("film");
      return json({ jobs: (await queue.list(film && FILM.test(film) ? { filmId: film } : {})).map(summary) });
    }
    if (path === "/api/jobs/health" && request.method === "GET") return json(await queue.health());
    if (path === "/api/jobs" && request.method === "POST") {
      const b = await read();
      if (b?.kind !== "selftest") return json({ error: "Only a self-test is queued here; films and renders are queued from their own routes." }, 400);
      const steps = Math.max(1, Math.min(1000, Number(b.steps ?? 20)));
      const job = await queue.enqueue({ kind: "selftest", title: "self-test", input: { steps, stepMs: Math.max(10, Math.min(60_000, Number(b.stepMs ?? 500))) } });
      return json({ job: summary(job) }, 202);
    }
    const act = /^\/api\/jobs\/([\w-]{1,64})\/(cancel|retry)$/.exec(path);
    if (act && request.method === "POST") {
      const done = act[2] === "cancel" ? await queue.cancel(act[1]) : await queue.retry(act[1]);
      return done ? json({ job: summary(done) }) : json({ error: `Nothing to ${act[2]}.` }, 409);
    }
    return json({ error: "Not found." }, 404);
  }

  // Worker routes.
  if (!env.WORKER_TOKEN) return json({ error: "Set the WORKER_TOKEN secret to connect your own machines (docs/ARCHITECTURE.md)." }, 503);
  if (!same(bearer(request), env.WORKER_TOKEN)) return json({ error: "Wrong worker token." }, 401);

  if ((path === "/api/worker/register" || path === "/api/worker/claim") && request.method === "POST") {
    const profile = cleanProfile((await read())?.profile);
    if (!profile) return json({ error: "Send { profile: { id, kinds, capabilities, resources } }." }, 400);
    if (path === "/api/worker/register") { await queue.registerWorker(profile); return json({ ok: true }); }
    const claimed = await queue.claim(profile);
    return claimed ? json(claimed) : new Response(null, { status: 204 });
  }

  const call = /^\/api\/worker\/jobs\/([\w-]{1,64})\/(heartbeat|checkpoint|complete|fail|release)$/.exec(path);
  if (call && request.method === "POST") {
    const b = await read();
    const token = typeof b?.token === "string" ? b.token : "";
    const [, id, verb] = call;
    const r = verb === "heartbeat" ? await queue.heartbeat(id, token, b?.progress ?? null)
      : verb === "checkpoint" ? await queue.checkpoint(id, token, b?.data ?? null, typeof b?.stage === "string" ? b.stage.slice(0, 80) : undefined)
      : verb === "complete" ? await queue.complete(id, token, b?.result ?? null)
      : verb === "fail" ? await queue.fail(id, token, { message: String(b?.error?.message ?? "failed").slice(0, 1000), permanent: Boolean(b?.error?.permanent) })
      : await queue.release(id, token);
    return json(r.ok ? { ok: true, job: r.job } : { ok: false, reason: r.reason }, r.ok ? 200 : 409);
  }

  // Film files and channel files: only for a worker holding a running job of that film.
  const files = /^\/api\/worker\/films\/([0-9a-f-]{36})\/files(?:\/(.+))?$/.exec(path);
  const channel = /^\/api\/worker\/channel\/([\w.-]+)$/.exec(path);
  if (files || channel) {
    const job = await queue.get(request.headers.get("x-job") ?? "");
    const holds = job && job.state === "running" && job.lease?.token === (request.headers.get("x-lease") ?? "") && (!files || job.filmId === files[1]);
    if (!holds) return json({ error: "This worker holds no running job for that film." }, 403);
    if (channel) {
      if (!CHANNEL.has(channel[1])) return json({ error: "Not found." }, 404);
      const key = `channel/${channel[1]}`;
      if (request.method === "GET") { const obj = await env.FILMS.get(key); return obj ? new Response(await obj.text()) : json({ error: "Not found." }, 404); }
      if (request.method === "PUT") { await env.FILMS.put(key, await request.text()); return json({ ok: true }); }
      return json({ error: "Not found." }, 404);
    }
    const film = /** @type {RegExpExecArray} */ (files)[1];
    const name = /** @type {RegExpExecArray} */ (files)[2];
    if (!name && request.method === "GET") {
      /** @type {string[]} */
      const names = [];
      let cursor;
      do {
        const page = await env.FILMS.list({ prefix: `films/${film}/`, cursor, limit: 1000 });
        for (const obj of page.objects) names.push(String(obj.key).slice(`films/${film}/`.length));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return json({ files: names.sort() });
    }
    if (!name || !KEY.test(name)) return json({ error: "Bad file name." }, 400);
    const key = `films/${film}/${name}`;
    if (request.method === "GET") { const obj = await env.FILMS.get(key); return obj ? new Response(await obj.text()) : json({ error: "Not found." }, 404); }
    if (request.method === "PUT") {
      const text = await request.text();
      if (text.length > 20_000_000) return json({ error: "Too large." }, 413);
      await env.FILMS.put(key, text);
      return json({ ok: true });
    }
  }
  return json({ error: "Not found." }, 404);
}
