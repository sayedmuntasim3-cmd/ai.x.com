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
