import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { groqMessages, groqModel, promptTokens, withGroq, GROQ_PROMPT_LIMIT } from "./groq.mjs";
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
