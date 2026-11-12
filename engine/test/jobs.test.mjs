import assert from "node:assert/strict";
import { test } from "node:test";
import { deviceProfile, renderNeed } from "../src/device-profile.mjs";
import { PermanentError, runClaimed, runWorker } from "../src/job-runner.mjs";
import { backoff, canRun, createQueue, memoryJobStore } from "../src/jobs.mjs";
import { say } from "../src/messages.mjs";

function setup(/** @type {Partial<import("../src/jobs.mjs").Job>} */ _ = {}) {
  let t = 1_000_000;
  let n = 0;
  const store = memoryJobStore();
  const queue = createQueue({ store, now: () => t, newId: () => `id${(n += 1)}`, defaults: { leaseMs: 1000, backoffMs: 100, maxBackoffMs: 1000 } });
  return { store, queue, advance: (/** @type {number} */ ms) => { t += ms; }, now: () => t };
}
const pc = { id: "pc", name: "Home PC", kinds: ["film", "render"], capabilities: ["web", "ffmpeg", "render:720p", "render:1080p", "brain"], resources: { memoryMb: 16384, cpus: 8, contextTokens: 131072 } };
const phone = { id: "phone", name: "Phone", kinds: ["film", "render"], capabilities: ["web"], resources: { memoryMb: 3072, cpus: 8 } };

test("only an eligible worker claims a job, and exactly one wins it", async () => {
  const { queue } = setup();
  const job = await queue.enqueue({ kind: "render", requires: { capabilities: ["ffmpeg", "render:1080p"] }, title: "Film A" });
  assert.equal(await queue.claim(phone), null, "a phone never takes a render");
  const [a, b] = await Promise.all([queue.claim(pc), queue.claim({ ...pc, id: "pc2" })]);
  assert.ok((a === null) !== (b === null), "two workers racing: one claim");
  const won = /** @type {any} */ (a ?? b);
  assert.equal(won.job.id, job.id);
  assert.equal((await queue.get(job.id))?.state, "running");
  assert.equal(canRun({ ...job, requires: { minContextTokens: 200000 } }, pc), false, "a brain whose window is too small does not take the film");
});

test("a worker that stops answering loses the job, and another continues from its checkpoint", async () => {
  const { queue, advance } = setup();
  const job = await queue.enqueue({ kind: "film", requires: { capabilities: ["brain"] } });
  const first = /** @type {any} */ (await queue.claim(pc));
  assert.ok((await queue.checkpoint(job.id, first.token, { stage: "s3" }, "s3")).ok);
  advance(500);
  assert.ok((await queue.heartbeat(job.id, first.token, { stage: "s4", done: 4, total: 15 })).ok);
  assert.equal(await queue.claim({ ...pc, id: "laptop", name: "Laptop" }), null, "a live lease is not taken");
  advance(1100);
  const second = /** @type {any} */ (await queue.claim({ ...pc, id: "laptop", name: "Laptop" }));
  assert.ok(second, "a vanished worker's job is taken over at once, without a backoff");
  assert.ok(second);
  assert.deepEqual(second.job.checkpoint, { stage: "s3" });
  assert.equal(second.job.failures, 1);
  assert.equal(second.job.attempts, 2);
  const events = second.job.history.map((/** @type {any} */ h) => h.event);
  assert.deepEqual(events, ["queued", "claimed", "checkpoint", "lost", "claimed"]);
  assert.equal(say(second.job.history.at(-1).message), "pc stopped answering; Laptop continues from the last checkpoint.");
  assert.match(say(second.job.history.at(-1).message, "bn"), /শেষ চেকপয়েন্ট থেকে/);
  const stale = await queue.heartbeat(job.id, first.token);
  assert.deepEqual([stale.ok, stale.ok ? "" : stale.reason], [false, "lost"], "the old worker is told to stop");
  assert.equal((await queue.complete(job.id, first.token, { x: 1 })).ok, false, "and cannot complete the job");
  assert.ok((await queue.complete(job.id, second.token, { done: true })).ok);
  assert.equal((await queue.get(job.id))?.state, "done");
});

test("failures are retried with growing waits up to a limit; a permanent error stops at once", async () => {
  const { queue, advance } = setup();
  const job = await queue.enqueue({ kind: "render", maxFailures: 3 });
  const waits = [];
  for (let i = 0; i < 3; i += 1) {
    const c = /** @type {any} */ (await queue.claim(pc));
    assert.ok(c, `attempt ${i + 1}`);
    const r = await queue.fail(job.id, c.token, { message: "ffmpeg exited 1." });
    waits.push(r.job?.notBefore);
    advance(5000);
  }
  const done = await queue.get(job.id);
  assert.equal(done?.state, "failed");
  assert.equal(done?.failures, 3);
  assert.match(say(/** @type {any} */ (done).history.at(-1).message), /Stopped after 3 failed attempts: ffmpeg exited 1\. Finished work is kept/);
  assert.deepEqual([backoff(1, { backoffMs: 100, maxBackoffMs: 1000 }), backoff(2, { backoffMs: 100, maxBackoffMs: 1000 }), backoff(9, { backoffMs: 100, maxBackoffMs: 1000 })], [100, 200, 1000]);
  assert.equal(await queue.claim(pc), null, "a stopped job waits for the owner");
  assert.ok(await queue.retry(job.id));
  assert.ok(await queue.claim(pc), "the owner queued it again");

  const bad = await queue.enqueue({ kind: "film" });
  const c = /** @type {any} */ (await queue.claim(pc));
  assert.equal(c.job.id, bad.id);
  await queue.fail(bad.id, c.token, { message: "The film folder is missing.", permanent: true });
  assert.equal((await queue.get(bad.id))?.state, "failed");
  assert.equal((await queue.get(bad.id))?.failures, 1, "no retries for what a retry cannot fix");
});

test("an attempt past its time limit is stopped and counted; the owner can cancel; a shutdown hands the job back", async () => {
  const { queue, advance } = setup();
  const job = await queue.enqueue({ kind: "render", timeoutMs: 3000 });
  const c = /** @type {any} */ (await queue.claim(pc));
  for (let i = 0; i < 3; i += 1) { advance(900); assert.ok((await queue.heartbeat(job.id, c.token)).ok); }
  advance(900);
  const late = await queue.heartbeat(job.id, c.token);
  assert.equal(late.ok ? "" : late.reason, "timeout");
  assert.equal((await queue.get(job.id))?.failures, 1);

  advance(1000);
  const again = /** @type {any} */ (await queue.claim(pc));
  await queue.cancel(job.id);
  const told = await queue.heartbeat(job.id, again.token);
  assert.equal(told.ok ? "" : told.reason, "cancelled");
  assert.equal(await queue.claim(pc), null);

  const other = await queue.enqueue({ kind: "film" });
  const held = /** @type {any} */ (await queue.claim(pc));
  await queue.release(other.id, held.token);
  const back = await queue.get(other.id);
  assert.deepEqual([back?.state, back?.failures], ["queued", 0], "a graceful stop is not a failure");
  assert.ok(await queue.claim({ ...pc, id: "laptop" }), "and another worker can take it at once");
});

test("health lists live workers, and jobs nothing connected can do, with what they need", async () => {
  const { queue, advance } = setup();
  await queue.registerWorker(phone);
  await queue.enqueue({ kind: "render", requires: { capabilities: ["ffmpeg", "render:1080p"] } });
  let h = await queue.health();
  assert.equal(h.workers[0].alive, true);
  assert.equal(h.waiting.length, 1);
  assert.equal(h.waiting[0].message.en, "No connected worker can do this job yet; it needs: ffmpeg, render:1080p.");
  assert.match(h.waiting[0].message.bn, /সংযুক্ত কোনো ওয়ার্কার এখনো কাজটি করতে পারে না/);
  await queue.registerWorker(pc);
  h = await queue.health();
  assert.equal(h.waiting.length, 0);
  advance(10_000);
  h = await queue.health();
  assert.deepEqual(h.workers.map((w) => w.alive), [false, false], "workers not seen for three leases count as gone");
});

test("the runner heart-beats, checkpoints, completes; a lost lease stops the handler; shutdown releases", async () => {
  const store = memoryJobStore();
  const queue = createQueue({ store, defaults: { leaseMs: 600, backoffMs: 10, maxBackoffMs: 10 } });
  const job = await queue.enqueue({ kind: "count", input: { to: 5 } });
  const handlers = {
    count: async (/** @type {any} */ j, /** @type {any} */ ctx) => {
      for (let i = j.checkpoint?.at ?? 0; i < j.input.to; i += 1) {
        await new Promise((r) => setTimeout(r, 120));
        if (ctx.signal.aborted) throw new Error("stopped");
        await ctx.checkpoint({ at: i + 1 });
        ctx.progress("count", i + 1, j.input.to);
      }
      return { counted: j.input.to };
    },
  };
  const out = await runWorker({ queue, worker: { id: "w1", kinds: ["count"], capabilities: [] }, handlers, once: true, heartbeatMs: 100 });
  assert.deepEqual(out, ["done"]);
  const done = await queue.get(job.id);
  assert.deepEqual(done?.result, { counted: 5 });
  assert.ok(done?.history.some((h) => h.event === "done"));

  const job2 = await queue.enqueue({ kind: "count", input: { to: 50 } });
  const shutdown = new AbortController();
  setTimeout(() => shutdown.abort(), 300);
  assert.deepEqual(await runWorker({ queue, worker: { id: "w1", kinds: ["count"], capabilities: [] }, handlers, shutdown: shutdown.signal, heartbeatMs: 100 }), ["released"]);
  const back = await queue.get(job2.id);
  assert.equal(back?.state, "queued");
  assert.ok(Number(back?.checkpoint?.at) >= 1, "its checkpoint stays for the next worker");

  const job3 = await queue.enqueue({ kind: "boom" });
  const c = /** @type {any} */ (await queue.claim({ id: "w2", kinds: ["boom", "count"], capabilities: [] }));
  assert.equal(c.job.id, job2.id, "the released job is first in line");
  await queue.release(job2.id, c.token);
  await queue.cancel(job2.id);
  const c3 = /** @type {any} */ (await queue.claim({ id: "w2", kinds: ["boom"], capabilities: [] }));
  assert.equal(c3.job.id, job3.id);
  assert.equal(await runClaimed(queue, c3, async () => { throw new PermanentError("The input file is not a film folder."); }), "failed");
  assert.equal((await queue.get(job3.id))?.error?.permanent, true);
});

test("the device profile matches work to the machine; quality is never lowered to fit", () => {
  const phoneProfile = deviceProfile({ memoryMb: 3072, cpus: 8, ffmpeg: false });
  assert.deepEqual([phoneProfile.tier, phoneProfile.capabilities], ["low", ["web"]]);
  const laptop = deviceProfile({ memoryMb: 8192, cpus: 4, ffmpeg: true });
  assert.deepEqual(laptop.capabilities, ["web", "ffmpeg", "render:1080p", "render:720p"]);
  assert.equal(laptop.concurrency, 2);
  const tower = deviceProfile({ memoryMb: 65536, cpus: 16, ffmpeg: true, gpu: true, brain: { kind: "local", contextTokens: 131072 } });
  assert.ok(tower.capabilities.includes("render:2160p") && tower.capabilities.includes("brain:local") && tower.capabilities.includes("gpu"));
  assert.deepEqual([tower.tier, tower.concurrency, tower.resources.contextTokens], ["high", 4, 131072]);
  const old = deviceProfile({ memoryMb: 2048, cpus: 2, ffmpeg: true });
  assert.deepEqual([old.maxRenderHeight, old.concurrency], [720, 1]);
  assert.equal(renderNeed("1920x1080"), "render:1080p");
  assert.equal(renderNeed("1280x720"), "render:720p");
  assert.throws(() => renderNeed("big"), /Bad resolution/);
});
