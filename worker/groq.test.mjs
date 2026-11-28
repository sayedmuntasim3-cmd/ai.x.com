import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groqMessages, groqModel, promptTokens, withGroq, GROQ_PROMPT_LIMIT } from "./groq.mjs";
import { dailyResetMs, durationMs, retryAfterMs, tokenBucket, GROQ_TOKENS_PER_MINUTE } from "./groq-pacing.mjs";
import { brainFromEnv } from "./brain.mjs";

const MANUAL = readFileSync(new URL("../prompts/1-zupona-master-engine-full.txt", import.meta.url), "utf8");
const reply = (/** @type {string} */ text, finish = "stop") => Response.json({ choices: [{ message: { content: text }, finish_reason: finish }], usage: { prompt_tokens: 100, completion_tokens: 20 } });
const req = (/** @type {string} */ stage, extra = "") => ({ stage, system: [{ text: MANUAL }, { text: "BRIEF" }], messages: [{ role: "user", content: [{ text: `do ${stage} ${extra}` }] }], maxTokens: 4000 });

test("the manual is cut to the stage's sections; a small stage fits Groq's limit, the whole manual never would", () => {
  const whole = promptTokens([{ content: MANUAL }]);
  const qa = promptTokens(groqMessages(req("qa")));
  assert.ok(whole > GROQ_PROMPT_LIMIT, `whole manual ${whole}`);
  assert.ok(qa < GROQ_PROMPT_LIMIT && qa < whole / 3, `qa ${qa}`);
  assert.match(groqMessages(req("qa"))[0].content, /S6 — WHOLE-FILM QA REPORT/);
  assert.doesNotMatch(groqMessages(req("qa"))[0].content, /S7 — PUBLISHING PACK/);
});

test("Groq answers a call that fits; one that does not fit, or needs web search, goes to the main brain", async () => {
  const calls = /** @type {string[]} */ ([]);
  const groq = groqModel({ apiKey: "k", fetch: /** @type {any} */ (async () => { calls.push("groq"); return reply("from groq"); }) });
  const main = { name: "gemini-x", call: async () => { calls.push("gemini"); return { text: "from gemini", stopReason: "end_turn" }; } };
  const brain = withGroq(main, groq);
  assert.equal((await brain.call(req("qa"))).text, "from groq");
  assert.equal((await brain.call(req("s5:C1", "x".repeat(40000)))).text, "from gemini");
  assert.equal((await brain.call({ ...req("research"), webSearch: { maxUses: 5 } })).text, "from gemini");
  assert.deepEqual(calls, ["groq", "gemini", "gemini"]);
});

test("a busy minute is waited out once; a used-up day moves to the next model; total failure falls back", async () => {
  const seen = /** @type {string[]} */ ([]);
  let n = 0;
  const fetch = async (/** @type {string} */ _u, /** @type {any} */ init) => {
    const model = JSON.parse(init.body).model;
    seen.push(model);
    n += 1;
    if (n === 1) return new Response("{}", { status: 429, headers: { "retry-after": "2" } });
    if (model === "openai/gpt-oss-120b") return new Response('{"error":{"message":"Rate limit reached on requests per day (RPD)"}}', { status: 429 });
    return reply("ok");
  };
  const slept = /** @type {number[]} */ ([]);
  const groq = groqModel({ apiKey: "k", fetch: /** @type {any} */ (fetch), sleep: async (ms) => { slept.push(ms); } });
  const r = await groq.call(req("qa"));
  assert.equal(r.model, "qwen/qwen3.8-27b");
  assert.deepEqual(seen, ["openai/gpt-oss-120b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  assert.deepEqual(slept, [2500]);
  const down = withGroq({ name: "g", call: async () => ({ text: "main", stopReason: "end_turn" }) }, groqModel({ apiKey: "k", fetch: /** @type {any} */ (async () => new Response("x", { status: 500 })) }));
  assert.equal((await down.call(req("qa"))).text, "main");
});

test("the brain plug adds Groq to Gemini when GROQ_API_KEY is set, and not with GROQ=off", async () => {
  const urls = /** @type {string[]} */ ([]);
  const fetch = async (/** @type {string} */ url) => { urls.push(url); return reply("ok"); };
  const on = brainFromEnv({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q" }, { fetch: /** @type {any} */ (fetch) });
  assert.ok(on.ok);
  if (on.ok) await on.model.call(req("qa"));
  assert.ok(urls[0].startsWith("https://api.groq.com/"));
  const off = brainFromEnv({ GEMINI_API_KEY: "g", GROQ_API_KEY: "q", GROQ: "off" });
  assert.ok(off.ok && !("fits" in off.model));
});

test("the pacing reads every wait Groq writes: Retry-After, an HTTP date, and the per-minute reset headers", () => {
  assert.equal(durationMs("2"), 2000, "a bare Retry-After is seconds");
  assert.equal(durationMs("2.5s"), 2500);
  assert.equal(durationMs("1m30s"), 90_000);
  assert.equal(durationMs("150ms"), 150);
  assert.equal(durationMs("1h2m3s"), 3_723_000);
  assert.equal(durationMs("not a time"), 0);
  const now = Date.parse("2026-11-27T10:00:00Z");
  assert.equal(retryAfterMs(new Headers({ "retry-after": "5" }), now), 5000);
  assert.equal(retryAfterMs(new Headers({ "retry-after": new Date(now + 30_000).toUTCString() }), now), 30_000);
  assert.equal(retryAfterMs(new Headers({ "x-ratelimit-reset-tokens": "7.66s" }), now), 7660);
  assert.equal(retryAfterMs(new Headers({ "x-ratelimit-reset-requests": "1m" }), now), 60_000);
  assert.equal(retryAfterMs(new Headers(), now), 0);
  assert.equal(dailyResetMs("Rate limit reached ... Please try again in 2h5m.", new Headers(), now), 7_500_000);
  assert.equal(dailyResetMs("{} the day is used up", new Headers()), 24 * 3_600_000, "no time named: about a day");
});

test("the token bucket holds a minute's 8,000 tokens per model on a fake clock", () => {
  let clock = 0;
  const bucket = tokenBucket({ now: () => clock });
  assert.equal(bucket.waitMs("a", 4000), 0);
  bucket.spend("a", 4000);
  assert.equal(bucket.waitMs("a", 4000), 0, "two batches fit the minute");
  bucket.spend("a", 4000);
  const wait = bucket.waitMs("a", 4000);
  assert.ok(wait > 0 && wait <= 60_000, `waits ${wait}`);
  assert.equal(bucket.used("a"), GROQ_TOKENS_PER_MINUTE);
  clock += wait;
  assert.equal(bucket.waitMs("a", 4000), 0, "the first batch left the window");
  assert.equal(bucket.waitMs("b", 4000), 0, "each model has its own minute");
});

test("three busy minutes on one Groq model, then the next model; a spent day on every model throws daily", async () => {
  const seen = /** @type {string[]} */ ([]);
  const slept = /** @type {number[]} */ ([]);
  let clock = 0;
  const fetch = async (/** @type {string} */ _u, /** @type {any} */ init) => {
    const model = JSON.parse(init.body).model;
    seen.push(model);
    if (model === "openai/gpt-oss-120b") return new Response("{}", { status: 429, headers: { "retry-after": "4" } });
    return reply("ok");
  };
  const groq = groqModel({ apiKey: "k", fetch: /** @type {any} */ (fetch), now: () => clock, sleep: async (/** @type {number} */ ms) => { slept.push(ms); clock += ms; } });
  const r = await groq.call(req("qa"));
  assert.equal(r.model, "qwen/qwen3.8-27b");
  assert.deepEqual(seen, ["openai/gpt-oss-120b", "openai/gpt-oss-120b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]);
  assert.deepEqual(slept, [4500, 4500]);
  const everyDay = groqModel({
    apiKey: "k",
    fetch: /** @type {any} */ (async () => new Response(JSON.stringify({ error: { message: "Rate limit reached on requests per day (RPD). Please try again in 3h." } }), { status: 429 })),
    sleep: async () => {},
  });
  await assert.rejects(everyDay.call(req("qa")), (e) => {
    const err = /** @type {any} */ (e);
    assert.equal(err.daily, true);
    assert.equal(err.status, 429);
    assert.equal(err.resetMs, 3 * 3_600_000);
    return true;
  });
});

test("groqLook: one picture question to the free eyes model; the minute window is waited out", async () => {
  const { groqLook, GROQ_EYES_MODEL } = await import("./groq.mjs");
  const sent = [];
  let n = 0;
  const fetch = async (/** @type {any} */ _u, /** @type {any} */ init) => {
    sent.push(JSON.parse(init.body));
    n += 1;
    if (n === 1) return new Response("rate limit per minute", { status: 429, headers: { "retry-after": "1" } });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"fits": true}' } }] }), { status: 200 });
  };
  const look = groqLook({ apiKey: "k", fetch: /** @type {any} */ (fetch), sleep: async () => {} });
  assert.equal(await look("Does it fit?", "https://x/a.jpg"), '{"fits": true}');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].model, GROQ_EYES_MODEL);
  assert.deepEqual(sent[1].messages[0].content[1], { type: "image_url", image_url: { url: "https://x/a.jpg" } });
  const day = groqLook({ apiKey: "k", fetch: /** @type {any} */ (async () => new Response("limit per day (RPD)", { status: 429 })), sleep: async () => {} });
  await assert.rejects(day("q", "u"), /429/);
});
