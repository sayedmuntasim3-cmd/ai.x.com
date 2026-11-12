import assert from "node:assert/strict";
import { test } from "node:test";
import { geminiModel } from "./gemini.mjs";

test("Gemini writes like the Claude stages: system, messages, search, cut-off and free-tier waits", async () => {
  /** @type {any[]} */
  const sent = [];
  let busy = true;
  const fake = /** @type {typeof fetch} */ (async (url, init) => {
    sent.push({ url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) });
    if (busy) { busy = false; return new Response("rate", { status: 429 }); }
    return Response.json({ candidates: [{ content: { parts: [{ text: "## S0" }] }, finishReason: "MAX_TOKENS" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3 } });
  });
  const m = geminiModel({ apiKey: "K", fetch: fake, sleep: async () => {} });
  const r = await m.call({ stage: "research", system: [{ text: "MANUAL", cache: true }], messages: [{ role: "user", content: [{ text: "go" }, { text: "", image: "https://x/1.jpg" }] }, { role: "assistant", content: [{ text: "part" }] }], maxTokens: 32000, effort: "high", webSearch: { maxUses: 30 } });
  assert.deepEqual([r.text, r.stopReason, r.usage.output_tokens], ["## S0", "max_tokens", 8]);
  assert.equal(sent.length, 2, "a 429 waits and tries again");
  assert.match(sent[1].url, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(sent[1].headers["x-goog-api-key"], "K");
  assert.deepEqual(sent[1].body.contents.map((/** @type {any} */ c) => c.role), ["user", "model"]);
  assert.deepEqual(sent[1].body.contents[0].parts, [{ text: "go" }], "images by URL are not sent");
  assert.deepEqual(sent[1].body.tools, [{ google_search: {} }]);
});

test("GEMINI_SEARCH off (Phase 0 arm B): no Google Search tool is ever sent, the brain says it cannot search; replies carry Google's response id and model version", async () => {
  /** @type {any[]} */
  const bodies = [];
  const get = /** @type {typeof fetch} */ (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({ responseId: "resp-123", modelVersion: "gemini-x-001", candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 2 } });
  });
  const off = geminiModel({ apiKey: "k", webSearch: false, fetch: get });
  assert.equal(off.capabilities?.webSearch, false);
  const reply = await off.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "q" }] }], maxTokens: 100, webSearch: { maxUses: 30 } });
  assert.equal(bodies[0].tools, undefined, "even when a stage asks for search");
  assert.equal(reply.responseId, "resp-123");
  assert.equal(reply.modelVersion, "gemini-x-001");
  const on = geminiModel({ apiKey: "k", fetch: get });
  assert.equal(on.capabilities?.webSearch, true, "the default is unchanged");
  await on.call({ system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "q" }] }], maxTokens: 100, webSearch: { maxUses: 30 } });
  assert.deepEqual(bodies[1].tools, [{ google_search: {} }]);
});
