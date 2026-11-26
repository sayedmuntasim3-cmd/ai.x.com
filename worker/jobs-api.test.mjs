import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanProfile, handleJobs } from "./jobs-api.mjs";
import { r2JobStore } from "./r2-job-store.mjs";

const CLI = fileURLToPath(new URL("../local/jobs.mjs", import.meta.url));

/** An R2 bucket with the conditional writes the queue relies on, as miniflare implements them (etag match; "*" = absent only). */
function fakeBucket() {
  /** @type {Map<string, { text: string, etag: string }>} */
  const m = new Map();
  let n = 0;
  return {
    m,
    /** @param {string} key */
    async get(key) { const o = m.get(key); return o ? { etag: o.etag, text: async () => o.text } : null; },
    /** @param {string} key @param {any} value @param {any} [opts] */
    async put(key, value, opts = {}) {
      const cur = m.get(key);
      const c = opts.onlyIf;
      if (c?.etagMatches !== undefined && (!cur || cur.etag !== c.etagMatches)) return null;
      if (c?.etagDoesNotMatch === "*" && cur) return null;
      n += 1;
      m.set(key, { text: String(value), etag: `"e${n}"` });
      return { key, etag: `"e${n}"` };
    },
    /** @param {{ prefix?: string, cursor?: string, limit?: number }} [o] */
    async list(o = {}) {
      const keys = [...m.keys()].filter((k) => k.startsWith(o.prefix ?? "")).sort();
      const start = Number(o.cursor ?? 0);
      const page = keys.slice(start, start + (o.limit ?? 1000));
      const next = start + page.length;
      return { objects: page.map((key) => ({ key })), truncated: next < keys.length, cursor: String(next) };
    },
  };
}

/** The studio's jobs API on a local port, over a fake bucket. */
async function studio() {
  const env = { FILMS: fakeBucket(), STUDIO_TOKEN: "owner-token", WORKER_TOKEN: "worker-token" };
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const request = new Request(url, { method: req.method, headers: /** @type {any} */ (req.headers), body: ["GET", "HEAD"].includes(String(req.method)) ? undefined : body });
    const out = (await handleJobs(request, env, url)) ?? new Response("{}", { status: 404 });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(undefined)));
  const api = `http://127.0.0.1:${/** @type {any} */ (server.address()).port}`;
  /** @param {string} path @param {any} [init] @param {string} [token] */
  const call = async (path, init = {}, token = "owner-token") => fetch(`${api}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  return { env, server, api, call };
}

/** @param {string} api @param {string} name */
function remoteWorker(api, name) {
  const p = spawn(process.execPath, [CLI, "work", "--api", api, "--name", name, "--kinds", "selftest", "--poll-ms", "100", "--concurrency", "1"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WORKER_TOKEN: "worker-token", BRAIN_URL: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" } });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  return { p, exited: new Promise((r) => p.on("close", (code, signal) => r({ code, signal }))), output: () => out };
}

/** @param {() => Promise<boolean>} fn @param {number} ms @param {string} what */
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (!(await fn().catch(() => false))) {
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

test("a machine at home takes the studio's job; killed mid-job, another continues from its checkpoint through the cloud", { timeout: 90_000 }, async (t) => {
  const s = await studio();
  t.after(() => s.server.close());
  // A short lease so the test does not wait two minutes: the job is written with it.
  const queued = await (await s.call("/api/jobs", { method: "POST", body: JSON.stringify({ kind: "selftest", steps: 30, stepMs: 100 }) })).json();
  const id = queued.job.id;
  const key = `queue/jobs/${id}.json`;
  const job = JSON.parse(String(s.env.FILMS.m.get(key)?.text));
  job.leaseMs = 1500;
  s.env.FILMS.m.set(key, { text: JSON.stringify(job), etag: '"seeded"' });
  const read = () => JSON.parse(String(s.env.FILMS.m.get(key)?.text));

  const a = remoteWorker(s.api, "HomePC");
  await until(async () => Number(read().checkpoint?.done) >= 5, 30_000, "a checkpoint from the first machine");
  a.p.kill("SIGKILL");
  await a.exited;
  const saved = Number(read().checkpoint.done);

  const b = remoteWorker(s.api, "Laptop");
  t.after(() => b.p.kill("SIGKILL"));
  await until(async () => read().state === "done", 40_000, "the second machine to finish");
  const done = read();
  assert.ok(done.result.resumedFrom >= saved - 1 && done.result.resumedFrom > 0, `resumed from ${done.result.resumedFrom}, saved ${saved}`);
  assert.deepEqual([done.attempts, done.failures], [2, 1]);
  assert.equal(done.history.filter((/** @type {any} */ h) => h.event === "claimed").at(-1).message.code, "job.reclaimed");

  const list = await (await s.call("/api/jobs")).json();
  assert.equal(list.jobs[0].state, "done");
  assert.equal(list.jobs[0].message.code, "job.done");
  const health = await (await s.call("/api/jobs/health")).json();
  assert.ok(health.workers.some((/** @type {any} */ w) => /^Laptop/.test(w.name)));
  b.p.kill("SIGINT");
  await b.exited;
});

test("the worker API: separate token, exact claims, film files only for the lease holder", async (t) => {
  const s = await studio();
  t.after(() => s.server.close());
  const profile = { id: "pc-1", name: "PC", kinds: ["selftest", "film"], capabilities: ["brain"], resources: { memoryMb: 16000 } };
  assert.equal((await s.call("/api/worker/claim", { method: "POST", body: JSON.stringify({ profile }) }, "owner-token")).status, 401, "the owner's token is not a worker's");
  assert.equal((await s.call("/api/jobs", {}, "worker-token")).status, 401, "a worker's token cannot list or start jobs");
  assert.equal((await s.call("/api/worker/claim", { method: "POST", body: JSON.stringify({ profile }) }, "worker-token")).status, 204, "nothing to do yet");

  // A film job, as the studio queues it.
  const filmId = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const { createQueue } = await import("../engine/src/jobs.mjs");
  const queue = createQueue({ store: r2JobStore(s.env.FILMS) });
  await queue.enqueue({ kind: "film", filmId, input: { filmId }, requires: { capabilities: ["brain"] } });
  await s.env.FILMS.put(`films/${filmId}/film.json`, "{\"topic\":\"x\"}");
  const [one, two] = await Promise.all([1, 2].map(() => s.call("/api/worker/claim", { method: "POST", body: JSON.stringify({ profile }) }, "worker-token")));
  assert.deepEqual([one.status, two.status].sort(), [200, 204], "two claims at once: one wins");
  const claimed = await (one.status === 200 ? one : two).json();

  const at = `/api/worker/films/${filmId}/files/film.json`;
  assert.equal((await s.call(at, {}, "worker-token")).status, 403, "no lease, no film");
  assert.equal((await s.call(at, { headers: { "x-job": claimed.job.id, "x-lease": "guess" } }, "worker-token")).status, 403);
  const lease = { "x-job": claimed.job.id, "x-lease": claimed.token };
  assert.equal(await (await s.call(at, { headers: lease }, "worker-token")).text(), "{\"topic\":\"x\"}");
  assert.equal((await s.call(`/api/worker/films/${filmId}/files/run.json`, { method: "PUT", body: "{\"status\":\"running\"}", headers: { ...lease, "content-type": "text/plain" } }, "worker-token")).status, 200);
  assert.equal(await s.env.FILMS.get(`films/${filmId}/run.json`).then((o) => o?.text()), "{\"status\":\"running\"}");
  assert.deepEqual((await (await s.call(`/api/worker/films/${filmId}/files`, { headers: lease }, "worker-token")).json()).files, ["film.json", "run.json"]);
  assert.equal((await s.call(`/api/worker/films/${filmId}/files/..%2Fsecret`, { headers: lease }, "worker-token")).status, 400);
  assert.equal((await s.call("/api/worker/films/11111111-2222-3333-4444-555555555555/files/film.json", { headers: lease }, "worker-token")).status, 403, "a lease opens its own film only");

  const done = await s.call(`/api/worker/jobs/${claimed.job.id}/complete`, { method: "POST", body: JSON.stringify({ token: claimed.token, result: { ok: 1 } }) }, "worker-token");
  assert.equal(done.status, 200);
  assert.equal((await s.call(at, { headers: lease }, "worker-token")).status, 403, "a finished job no longer opens the film");
  const stale = await s.call(`/api/worker/jobs/${claimed.job.id}/heartbeat`, { method: "POST", body: JSON.stringify({ token: claimed.token }) }, "worker-token");
  assert.equal(stale.status, 409);
});

test("worker profiles are cleaned; R2 writes are compare-and-swap", async () => {
  assert.equal(cleanProfile({ id: "../../x" }), null);
  assert.deepEqual(cleanProfile({ id: "pc", kinds: ["film", "<script>"], capabilities: ["render:1080p", 7], resources: { memoryMb: -3, cpus: 8 } }), { id: "pc", name: "pc", kinds: ["film"], capabilities: ["render:1080p"], resources: { memoryMb: undefined, cpus: 8, contextTokens: undefined } });
  const store = r2JobStore(fakeBucket());
  const v1 = await store.write("jobs/a.json", "1", null);
  assert.ok(v1);
  assert.equal(await store.write("jobs/a.json", "x", null), null, "create only once");
  assert.ok(await store.write("jobs/a.json", "2", v1));
  assert.equal(await store.write("jobs/a.json", "3", v1), null, "a stale version loses");
  assert.deepEqual(await store.list("jobs/"), ["jobs/a.json"]);
});
