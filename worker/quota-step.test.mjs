import assert from "node:assert/strict";
import { test } from "node:test";
import { quotaAwareStep } from "./quota-step.mjs";
import { permanentError } from "./anthropic.mjs";
import { dailyLimitWait, msUntilPacificMidnight, quotaInfo } from "./gemini.mjs";

/** A Workflow stand-in: every step runs once (no retries), sleeps are recorded, not waited. */
function fakeWorkflow() {
  /** @type {string[]} */ const steps = [];
  /** @type {[string, number][]} */ const sleeps = [];
  return { steps, sleeps, step: { do: async (/** @type {string} */ name, /** @type {any} */ _o, /** @type {() => Promise<any>} */ fn) => { steps.push(name); return fn(); }, sleep: async (/** @type {string} */ name, /** @type {number} */ ms) => { sleeps.push([name, ms]); } } };
}

const DAILY = JSON.stringify({ error: { code: 429, message: "You exceeded your current quota", details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" }] }, { retryDelay: "30463s" }] } });
/** The error worker/gemini.mjs throws on a used-up day. */
const dailyError = () => Object.assign(new Error(`Gemini 429: ${quotaInfo(DAILY).summary}`), { status: 429, permanent: quotaInfo(DAILY).permanent });

test("a stage stopped by the free daily limit sleeps until the reset and runs again; the film is not ended", async () => {
  const wf = fakeWorkflow();
  let calls = 0;
  const step = quotaAwareStep({ step: wf.step, options: {}, permanent: permanentError, stop: (m) => new Error(m) });
  const out = await step("research", async () => { calls += 1; if (calls === 1) throw dailyError(); return "facts"; });
  assert.equal(out, "facts");
  assert.deepEqual(wf.steps, ["research", "research:after-wait-1"]);
  assert.deepEqual(wf.sleeps, [["research:wait-1", 30463_000 + 120_000]], "Google's own retry delay plus two minutes");
});

test("other permanent stops end the film at once, as before", async () => {
  const wf = fakeWorkflow();
  const step = quotaAwareStep({ step: wf.step, options: {}, permanent: permanentError, stop: (m) => Object.assign(new Error(m), { name: "NonRetryableError" }) });
  const bad = Object.assign(new Error("Gemini 400: bad field"), { status: 400 });
  await assert.rejects(step("s01", async () => { throw bad; }), /The Gemini API rejected the request/);
  assert.deepEqual(wf.sleeps, []);
});

test("after the last allowed night the stop goes through", async () => {
  const wf = fakeWorkflow();
  const step = quotaAwareStep({ step: wf.step, options: {}, prefix: "r1:", permanent: permanentError, stop: (m) => new Error(m), maxNights: 2 });
  await assert.rejects(step("s2", async () => { throw dailyError(); }), /free daily limit is used up/);
  assert.deepEqual(wf.steps, ["r1:s2", "r1:s2:after-wait-1", "r1:s2:after-wait-2"]);
  assert.equal(wf.sleeps.length, 2);
});

test("the wait: Google's delay when given, else the next Pacific midnight; never under a minute or over 26 hours", () => {
  assert.equal(dailyLimitWait(new Error("Gemini's free daily limit is used up (x = 20; retry in 90s)."), 0), 210_000);
  assert.equal(dailyLimitWait(new Error("something else"), 0), null);
  // 2026-11-20 07:00 UTC is 23:00 the day before in Los Angeles (PST): one hour to midnight.
  const t = Date.UTC(2026, 10, 20, 7, 0, 0);
  assert.equal(msUntilPacificMidnight(t), 3600_000);
  assert.equal(dailyLimitWait(new Error("Gemini's free daily limit is used up (x = 20)."), t), 3600_000 + 120_000);
  assert.equal(dailyLimitWait(new Error("Gemini's free daily limit is used up (x = 20; retry in 999999s)."), t), 26 * 3600_000);
});

test("Cloudflare's request limit: no retry in the same run; a long sleep, then the stage again in a fresh run", async () => {
  const wf = fakeWorkflow();
  let calls = 0;
  const stop = (/** @type {string} */ m) => Object.assign(new Error(m), { name: "NonRetryableError" });
  const step = quotaAwareStep({ step: wf.step, options: {}, permanent: permanentError, stop });
  const out = await step("s2", async () => { calls += 1; if (calls < 3) throw new Error("Too many subrequests by single Worker invocation."); return "ledger"; });
  assert.equal(out, "ledger");
  assert.deepEqual(wf.steps, ["s2", "s2:fresh-1", "s2:fresh-2"]);
  assert.deepEqual(wf.sleeps, [["s2:fresh-wait-1", 180_000], ["s2:fresh-wait-2", 180_000]]);
});

test("Cloudflare's request limit after every fresh run: the film stops with that reason", async () => {
  const wf = fakeWorkflow();
  const step = quotaAwareStep({ step: wf.step, options: {}, permanent: permanentError, stop: (m) => new Error(m) });
  await assert.rejects(step("s2", async () => { throw new Error("Too many subrequests by single Worker invocation."); }), /Too many subrequests/);
  assert.equal(wf.sleeps.length, 13);
});

test("a stage whose fetches met the limit but went on with less is run again in a fresh run", async () => {
  const { watchFetch } = await import("./quota-step.mjs");
  let n = 0;
  const g = { fetch: async () => { n += 1; if (n === 1) throw new Error("Too many subrequests by single Worker invocation."); return "page"; } };
  watchFetch(g);
  const wf = fakeWorkflow();
  const step = quotaAwareStep({ step: wf.step, options: {}, permanent: permanentError, stop: (m) => new Error(m) });
  const out = await step("sources", async () => { const r = await g.fetch().catch(() => null); return r ?? "thin"; });
  assert.equal(out, "page");
  assert.deepEqual(wf.steps, ["sources", "sources:fresh-1"]);
});

test("QUOTA_MODE=pause: a used-up free day pauses the film with its reset time instead of sleeping a day", async () => {
  const wf = fakeWorkflow();
  const stop = (/** @type {string} */ m) => Object.assign(new Error(m), { name: "NonRetryableError" });
  const step = quotaAwareStep({ step: wf.step, options: {}, permanent: permanentError, stop, pauseOnQuota: true, now: () => 0 });
  const error = await step("research", async () => { throw dailyError(); }).catch((/** @type {any} */ e) => e);
  assert.equal(error.quotaPause, true, "the run can tell a pause from a failure");
  assert.match(error.message, /^QUOTA_PAUSED \S+T\S* Gemini's free daily limit is used up/, "the reset time travels in the message a Workflow serialises");
  assert.match(error.resumeAt, /^\d{4}-\d{2}-\d{2}T/, "the reset time is kept for the studio");
  assert.equal(error.waitMs, 30463_000 + 120_000);
  assert.deepEqual(wf.sleeps, [], "no Workflow is held open for a day");
  assert.deepEqual(wf.steps, ["research"], "the failed attempt is not retried in the same run");
});
