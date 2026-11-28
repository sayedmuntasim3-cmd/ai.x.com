import assert from "node:assert/strict";
import { test } from "node:test";
import { workerBrain } from "./voice-runner.mjs";
import { GROQ_TOKENS_PER_MINUTE, promptTokensOf } from "../worker/groq-pacing.mjs";
import { estimateBrainBudget } from "../engine/src/brain-budget.mjs";

const REQ = { stage: "V4", system: [{ text: "system" }], messages: [{ role: "user", content: [{ text: "pictures for these scenes" }] }], maxTokens: 4000 };

/** A brain client with a fake clock and sleep, recording every model asked and every wait. */
function harness(fetch, extra = {}) {
  const state = { clock: 1_000_000, sleeps: /** @type {number[]} */ ([]), asked: /** @type {string[]} */ ([]) };
  const brain = workerBrain(
    { site: "https://s", id: "i", ticket: "t", fetch: /** @type {any} */ (async (/** @type {any} */ u, /** @type {any} */ init) => { state.asked.push(JSON.parse(init.body).model); return fetch(init); }) },
    { now: () => state.clock, sleep: async (/** @type {number} */ ms) => { state.sleeps.push(ms); state.clock += ms; }, log: () => {}, ...extra },
  );
  return { brain, state };
}

const ok = (/** @type {any} */ model, /** @type {number} */ tokens) => new Response(JSON.stringify({ text: "planned", model, tokens }), { status: 200 });

test("a busy minute is waited out for the time Groq names (Retry-After), then the same model answers", async () => {
  let n = 0;
  const { brain, state } = harness(() => {
    n += 1;
    if (n === 1) return new Response(JSON.stringify({ error: "rate limit per minute" }), { status: 429, headers: { "retry-after": "7" } });
    return ok("openai/gpt-oss-120b", 1200);
  });
  const r = await brain.call(REQ);
  assert.equal(r.text, "planned");
  assert.deepEqual(state.asked, ["openai/gpt-oss-120b", "openai/gpt-oss-120b"], "the same model was asked again, not the next one");
  assert.deepEqual(state.sleeps, [7500], "waited the 7 s Groq asked for, plus half a second");
  assert.equal(brain.calls.length, 1);
});

test("the per-minute reset header is used when Retry-After is absent (x-ratelimit-reset-tokens)", async () => {
  let n = 0;
  const { brain, state } = harness(() => {
    n += 1;
    if (n === 1) return new Response("{}", { status: 429, headers: { "x-ratelimit-reset-tokens": "12.5s" } });
    return ok("openai/gpt-oss-120b", 900);
  });
  await brain.call(REQ);
  assert.deepEqual(state.sleeps, [13_000]);
});

test("three busy answers on one model, then the next model in GROQ_MODELS takes the call", async () => {
  const { brain, state } = harness((/** @type {any} */ init) => {
    const model = JSON.parse(init.body).model;
    if (model === "openai/gpt-oss-120b") return new Response(JSON.stringify({ error: "rate limit reached" }), { status: 429, headers: { "retry-after": "10" } });
    return ok("qwen/qwen3.8-27b", 1100);
  });
  const r = await brain.call(REQ);
  assert.equal(r.model, "qwen/qwen3.8-27b");
  assert.deepEqual(state.asked, ["openai/gpt-oss-120b", "openai/gpt-oss-120b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  assert.deepEqual(state.sleeps, [10_500, 10_500], "two waits between the three tries");
});

test("a used-up day stops with the reset time instead of retrying forever", async () => {
  const { brain, state } = harness(() => new Response(JSON.stringify({ error: "Rate limit reached for requests per day (RPD). Please try again in 2h5m." }), { status: 429, headers: { "retry-after": "7500" } }));
  await assert.rejects(brain.call(REQ), (e) => {
    const err = /** @type {any} */ (e);
    assert.equal(err.daily, true);
    assert.equal(err.status, 429);
    assert.match(err.message, /daily limit is used up/);
    assert.equal(err.wait, "2 h 5 min");
    return true;
  });
  assert.equal(state.asked.length, 3, "each model is asked once; a spent day is never retried");
});

test("the token bucket keeps a synthetic 40-minute run under 8,000 prompt tokens a minute on every model", async () => {
  const budget = await estimateBrainBudget({ minutes: 40 });
  /** @type {{ at: number, model: string, tokens: number }[]} */
  const sent = [];
  const clock = { t: 0 };
  let reply = 0;
  const brain = workerBrain(
    {
      site: "https://s",
      id: "i",
      ticket: "t",
      fetch: /** @type {any} */ (async (/** @type {any} */ _u, /** @type {any} */ init) => {
        const body = JSON.parse(init.body);
        const tokens = promptTokensOf(body.req);
        clock.t += 15_000; // a real answer takes some seconds
        sent.push({ at: clock.t, model: body.model, tokens });
        reply += 1;
        return ok(body.model, tokens);
      }),
    },
    { now: () => clock.t, sleep: async (/** @type {number} */ ms) => { clock.t += ms; }, log: () => {} },
  );
  // Every call of a real 40-minute film, the size the estimator measured, in the order the stages make them.
  let models = 0;
  for (const stage of budget.stages) {
    for (let i = 0; i < stage.calls; i += 1) {
      const chars = Math.round((stage.tokens / stage.calls) * 3.8);
      const req = { stage: stage.stage, system: [{ text: "s".repeat(chars) }], messages: [{ role: "user", content: [{ text: "" }] }], maxTokens: 2000 };
      await brain.call(req);
      models += 1;
    }
  }
  assert.equal(sent.length, budget.requests, "one call per request the estimator counted");
  // No model ever carried more than the free minute inside any 60-second window.
  for (const model of new Set(sent.map((s) => s.model))) {
    const rows = sent.filter((s) => s.model === model);
    for (const row of rows) {
      const inMinute = rows.filter((r) => r.at > row.at - 60_000 && r.at <= row.at).reduce((n, r) => n + r.tokens, 0);
      assert.ok(inMinute <= GROQ_TOKENS_PER_MINUTE, `${model} carried ${inMinute} tokens in the minute ending at ${row.at}`);
    }
  }
  // The pacing costs wall time, not correctness: the film's calls fit inside the film's own length.
  assert.ok(clock.t < 40 * 60_000, `${models} calls took ${Math.round(clock.t / 1000)} s of paced time`);
});
