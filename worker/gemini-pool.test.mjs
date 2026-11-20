import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiPool, rankModels } from "./gemini-pool.mjs";

const daily = JSON.stringify({ error: { code: 429, message: "quota", details: [
  { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "20" }] },
  { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "25000s" },
] } });
const ok = (/** @type {string} */ model) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: `written by ${model}` }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } })}\n\n`;

test("the writing models are found and ranked: flash before lite, stable before preview, never image or audio models", () => {
  const list = [
    { name: "models/gemini-3.8-flash-lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.5-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.8-flash-preview", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.8-flash-image", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-3.8-pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-9", supportedGenerationMethods: ["embedContent"] },
  ];
  assert.deepEqual(rankModels(list), ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.8-flash-lite", "gemini-3.8-flash-preview"]);
});

test("when one model's free day is used up, the same request goes to the next model; the film never sees it", async () => {
  const calls = /** @type {string[]} */ ([]);
  const fetch = async (/** @type {string} */ url) => {
    if (url.includes("/models?")) return new Response(JSON.stringify({ models: [{ name: "models/gemini-a-flash", supportedGenerationMethods: ["generateContent"] }, { name: "models/gemini-b-flash-lite", supportedGenerationMethods: ["generateContent"] }] }));
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)?.[1] ?? "");
    calls.push(model);
    return model === "gemini-a-flash" ? new Response(daily, { status: 429 }) : new Response(ok(model));
  };
  const pool = geminiPool({ apiKey: "k", model: "gemini-a-flash", fetch: /** @type {any} */ (fetch), sleep: async () => {} });
  const r = await pool.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "hi" }] }], maxTokens: 100 });
  assert.match(r.text, /gemini-b-flash-lite/);
  await pool.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "again" }] }], maxTokens: 100 });
  assert.deepEqual(calls, ["gemini-a-flash", "gemini-b-flash-lite", "gemini-b-flash-lite"], "a spent model is not asked again in this run");
  assert.deepEqual((await pool.pool()).spent, ["gemini-a-flash"]);
});

test("when every model's day is used up, the daily-limit error reaches the film (which then waits for midnight)", async () => {
  const fetch = async (/** @type {string} */ url) => url.includes("/models?") ? new Response(JSON.stringify({ models: [{ name: "models/gemini-b-flash", supportedGenerationMethods: ["generateContent"] }] })) : new Response(daily, { status: 429 });
  const pool = geminiPool({ apiKey: "k", model: "gemini-a-flash", fetch: /** @type {any} */ (fetch), sleep: async () => {} });
  await assert.rejects(pool.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "hi" }] }], maxTokens: 100 }), (e) => /** @type {any} */ (e).status === 429 && /daily limit/i.test(/** @type {any} */ (e).permanent));
});

test("a busy model hands over after two busy answers, and one call never makes more than its budget of requests", async () => {
  const busy = JSON.stringify({ error: { code: 429, message: "Resource has been exhausted (e.g. check quota).", status: "RESOURCE_EXHAUSTED" } });
  let requests = 0;
  const fetch = async (/** @type {string} */ url) => {
    requests += 1;
    if (url.includes("/models?")) return new Response(JSON.stringify({ models: ["a", "b", "c", "d", "e"].map((x) => ({ name: `models/gemini-${x}-flash`, supportedGenerationMethods: ["generateContent"] })) }));
    return url.includes("gemini-e-flash") ? new Response(ok("gemini-e-flash")) : url.includes("gemini-a-flash") ? new Response(daily, { status: 429 }) : new Response(busy, { status: 429 });
  };
  const pool = geminiPool({ apiKey: "k", model: "gemini-a-flash", fetch: /** @type {any} */ (fetch), sleep: async () => {} });
  const r = await pool.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "hi" }] }], maxTokens: 100 });
  assert.match(r.text, /gemini-e-flash/);
  assert.ok(requests <= 12, `${requests} requests: each busy model is asked twice at most`);

  const allBusy = async (/** @type {string} */ url) => url.includes("/models?") ? new Response(JSON.stringify({ models: [{ name: "models/gemini-b-flash", supportedGenerationMethods: ["generateContent"] }] })) : new Response(busy, { status: 429 });
  const p2 = geminiPool({ apiKey: "k", model: "gemini-b-flash", fetch: /** @type {any} */ (allBusy), sleep: async () => {} });
  await assert.rejects(p2.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "hi" }] }], maxTokens: 100 }), (e) => /tried gemini-b-flash \(busy\)$/.test(/** @type {any} */ (e).message), "a busy model is not asked again in the same call");
});
