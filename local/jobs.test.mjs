import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { main } from "./jobs.mjs";

const CLI = fileURLToPath(new URL("./jobs.mjs", import.meta.url));
const quiet = { print: () => {} };

/** @param {string} dir @param {string} id */
const jobFile = (dir, id) => JSON.parse(readFileSync(join(dir, "jobs", `${id}.json`), "utf8"));

/** Wait until fn() is true (checked every 50 ms). @param {() => boolean} fn @param {number} ms */
async function until(fn, ms, what = "condition") {
  const end = Date.now() + ms;
  for (;;) {
    try { if (fn()) return; } catch { /* the file is being replaced */ }
    if (Date.now() > end) throw new Error(`Timed out waiting for ${what}.`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** A worker in its own process. @param {string} dir @param {string} name */
function worker(dir, name, extra = /** @type {string[]} */ ([])) {
  const p = spawn(process.execPath, [CLI, "work", "--queue", dir, "--name", name, "--kinds", "selftest", "--lease-ms", "1500", "--poll-ms", "100", "--concurrency", "1", ...extra], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, BRAIN_URL: "", ANTHROPIC_API_KEY: "", GEMINI_API_KEY: "" } });
  let out = "";
  p.stdout.on("data", (d) => { out += d; });
  p.stderr.on("data", (d) => { out += d; });
  const exited = new Promise((r) => p.on("close", (code, signal) => r({ code, signal })));
  return { p, exited, output: () => out };
}

test("a worker killed mid-job: another worker takes over after the lease and continues from the checkpoint", { timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-queue-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const job = await main(["add", "selftest", "--steps", "30", "--step-ms", "100", "--queue", dir, "--lease-ms", "1500"], {}, quiet);
  const a = worker(dir, "A");
  await until(() => Number(jobFile(dir, job.id).checkpoint?.done) >= 6, 20_000, "worker A's checkpoint");
  a.p.kill("SIGKILL");
  const killedAt = Number(jobFile(dir, job.id).checkpoint.done);
  assert.deepEqual(await a.exited, { code: null, signal: "SIGKILL" });

  const b = worker(dir, "B");
  t.after(() => b.p.kill("SIGKILL"));
  await until(() => jobFile(dir, job.id).state === "done", 30_000, "the job to finish on worker B");
  const done = jobFile(dir, job.id);
  assert.ok(done.result.resumedFrom >= killedAt - 1 && done.result.resumedFrom > 0, `B continued from ${done.result.resumedFrom}, A had saved ${killedAt}`);
  assert.equal(done.result.steps, 30);
  assert.deepEqual([done.attempts, done.failures], [2, 1], "the lost attempt is counted once");
  const events = done.history.map((/** @type {any} */ h) => h.event);
  assert.ok(events.includes("lost"), events.join());
  const lost = done.history.find((/** @type {any} */ h) => h.event === "lost");
  assert.match(lost.worker, /^A-/);
  const claims = done.history.filter((/** @type {any} */ h) => h.event === "claimed");
  assert.equal(claims.length, 2);
  assert.match(claims[1].worker, /^B-/);
  assert.equal(claims[1].message.code, "job.reclaimed", "the takeover is said, in both languages");
  assert.ok(!readdirSync(join(dir, "jobs")).some((f) => f.endsWith(".lock") || f.endsWith(".tmp")), "no lock or temporary file is left behind");
  b.p.kill("SIGINT");
  await b.exited;
});

test("Ctrl+C hands the running job back at once, without counting a failure", { timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-queue-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const job = await main(["add", "selftest", "--steps", "100", "--step-ms", "100", "--queue", dir], {}, quiet);
  const c = worker(dir, "C");
  await until(() => Number(jobFile(dir, job.id).checkpoint?.done) >= 3, 20_000, "a checkpoint");
  c.p.kill("SIGINT");
  const exit = /** @type {any} */ (await c.exited);
  assert.equal(exit.code, 0, c.output());
  const back = jobFile(dir, job.id);
  assert.deepEqual([back.state, back.failures, back.lease], ["queued", 0, null]);
  assert.equal(back.history.at(-1).event, "released");
  assert.match(c.output(), /handed back/);
});

test("two workers share the work and never run the same job twice", { timeout: 60_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-queue-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const jobs = [];
  for (let i = 0; i < 6; i += 1) jobs.push(await main(["add", "selftest", "--steps", "4", "--step-ms", "60", "--queue", dir], {}, quiet));
  const d = worker(dir, "D");
  const e = worker(dir, "E");
  t.after(() => { d.p.kill("SIGKILL"); e.p.kill("SIGKILL"); });
  await until(() => jobs.every((j) => jobFile(dir, j.id).state === "done"), 40_000, "all six jobs");
  const by = jobs.map((j) => jobFile(dir, j.id));
  assert.ok(by.every((j) => j.attempts === 1 && j.history.filter((/** @type {any} */ h) => h.event === "claimed").length === 1), "each job ran once");
  const workers = new Set(by.map((j) => j.history.find((/** @type {any} */ h) => h.event === "claimed").worker.split("-")[0]));
  assert.deepEqual([...workers].sort(), ["D", "E"], "both workers took jobs");
  /** @type {string[]} */
  const lines = [];
  await main(["status", "--queue", dir, "--lang", "bn"], {}, { print: (l) => lines.push(l) });
  assert.equal(lines.length, 6);
  assert.ok(lines.every((l) => /done/.test(l) && /শেষ হয়েছে।/.test(l)), lines.join("\n"));
  d.p.kill("SIGINT");
  e.p.kill("SIGINT");
  await Promise.all([d.exited, e.exited]);
});

test("a render job for a film Bossism has not cleared stops before anything is rendered", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-render-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const { handlers } = await import("./jobs.mjs");
  const job = /** @type {any} */ ({ id: "r1", kind: "render", input: { run: dir, resolution: "1280x720" }, checkpoint: null });
  const ctx = /** @type {any} */ ({ job, signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {}, log: () => {} });
  await assert.rejects(handlers({}, () => {}).render(job, ctx), (error) => {
    assert.equal(/** @type {any} */ (error).name, "PermanentError", "retrying would not help, so it is not retried");
    assert.match(String(/** @type {any} */ (error).message), /Not cleared for release[\s\S]*no review yet/);
    return true;
  });
  assert.ok(!readdirSync(dir).some((f) => f.endsWith(".mp4") || f === ".render"), "nothing was rendered");
});

test("health says which queued work nothing connected can do", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-queue-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await main(["add", "render", "--run", "films/x", "--resolution", "3840x2160", "--queue", dir], {}, quiet);
  /** @type {string[]} */
  const lines = [];
  await main(["health", "--queue", dir], {}, { print: (l) => lines.push(l) });
  assert.match(lines.join("\n"), /No connected worker can do this job yet; it needs: render, ffmpeg, render:2160p\./);
  await assert.rejects(main(["add", "render", "--queue", dir], {}, quiet), /Give the film folder/);
  await assert.rejects(main(["fly", "--queue", dir], {}, quiet), /Commands:/);
});
