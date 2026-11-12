import assert from "node:assert/strict";
import { test } from "node:test";
import { brainFromEnv, brainHealth, chooseBrain } from "./brain.mjs";

test("the free brain comes first; the paid brain (Claude) runs only when BRAIN names it, never by itself", () => {
  const all = { BRAIN_URL: "http://localhost:11434", BRAIN_MODEL: "qwen3:32b", ANTHROPIC_API_KEY: "sk", GEMINI_API_KEY: "g" };
  assert.deepEqual(chooseBrain(all), { ok: true, kind: "local" });
  assert.deepEqual(chooseBrain({ ...all, BRAIN: "claude" }), { ok: true, kind: "claude" });
  assert.deepEqual(chooseBrain({ ...all, BRAIN: "Gemini" }), { ok: true, kind: "gemini" });
  assert.deepEqual(chooseBrain({ ANTHROPIC_API_KEY: "sk", GEMINI_API_KEY: "g" }), { ok: true, kind: "gemini" }, "with both keys and no BRAIN, the free brain runs, not the paid one");
  const paidOnly = chooseBrain({ ANTHROPIC_API_KEY: "sk" });
  assert.equal(paidOnly.ok, false, "a paid key alone never starts spending");
  assert.match(String(/** @type {any} */ (paidOnly).error), /never chosen automatically: set BRAIN=claude/);
  assert.deepEqual(chooseBrain({ ANTHROPIC_API_KEY: "sk", BRAIN: "claude" }), { ok: true, kind: "claude" });
  assert.deepEqual(chooseBrain({ GEMINI_API_KEY: "g" }), { ok: true, kind: "gemini" });
});

test("a brain that is asked for but not set up says what is missing", () => {
  assert.match(String(/** @type {any} */ (chooseBrain({})).error), /No brain is connected.*BRAIN_URL and BRAIN_MODEL/);
  assert.match(String(/** @type {any} */ (chooseBrain({ BRAIN: "local", BRAIN_URL: "http://h" })).error), /BRAIN_MODEL/);
  assert.match(String(/** @type {any} */ (chooseBrain({ BRAIN: "claude", GEMINI_API_KEY: "g" })).error), /ANTHROPIC_API_KEY/);
  assert.match(String(/** @type {any} */ (chooseBrain({ BRAIN: "gpt" })).error), /must be local, claude or gemini/);
  assert.deepEqual(chooseBrain({ BRAIN_URL: "http://h" }).ok, false, "a URL without a model is not a brain");
});

test("the local brain is built from the settings: window, vision, price, wire format", async () => {
  /** @type {any[]} */
  const sent = [];
  const fetch = /** @type {typeof globalThis.fetch} */ (async (url, init) => { sent.push({ url: String(url), body: JSON.parse(String(init?.body)) }); return Response.json({ message: { content: "ok" }, done_reason: "stop" }); });
  const b = brainFromEnv({ BRAIN_URL: "http://192.168.1.20:11434", BRAIN_MODEL: "gemma3:27b", BRAIN_CONTEXT: "131072", BRAIN_VISION: "TRUE", BRAIN_KEY: "" }, { fetch });
  assert.ok(b.ok);
  assert.equal(b.kind, "local");
  assert.deepEqual(b.model.capabilities, { vision: true, webSearch: false, contextTokens: 131072, maxOutputTokens: 8192 });
  assert.deepEqual(b.model.price, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  await b.model.call({ stage: "s2", system: [{ text: "M" }], messages: [{ role: "user", content: [{ text: "go" }] }], maxTokens: 1000, effort: "medium" });
  assert.equal(sent[0].url, "http://192.168.1.20:11434/api/chat");
  assert.equal(sent[0].body.options.num_ctx, 131072);

  const paid = brainFromEnv({ BRAIN_URL: "https://api.example.com/v1", BRAIN_MODEL: "big", BRAIN_PRICE_INPUT: "0.5", BRAIN_PRICE_OUTPUT: "1.5" });
  assert.ok(paid.ok);
  assert.deepEqual(paid.model.price, { input: 0.5, output: 1.5, cacheRead: 0.5, cacheWrite: 0.5 }, "a paid service is metered so the budget stop works");
  assert.equal(brainHealth({ BRAIN_URL: "https://api.example.com/v1", BRAIN_MODEL: "big", BRAIN_PRICE_OUTPUT: "1.5" }).pricing, "metered at BRAIN_PRICE_INPUT / BRAIN_PRICE_OUTPUT");
});

test("health shows the brain without its address or any key", () => {
  const h = brainHealth({ BRAIN_URL: "https://brain.secret-tunnel.example", BRAIN_MODEL: "qwen3:32b", BRAIN_KEY: "k3y", ANTHROPIC_API_KEY: "sk-ant" });
  assert.deepEqual(h, { connected: true, kind: "local", model: "qwen3:32b", seesPictures: false, searchesWeb: false, contextTokens: 32768, maxOutputTokens: 8192, pricing: "free (runs on your own machine)" });
  assert.ok(!JSON.stringify(h).includes("secret-tunnel") && !JSON.stringify(h).includes("k3y") && !JSON.stringify(h).includes("sk-ant"));
  assert.deepEqual(brainHealth({ GEMINI_API_KEY: "g" }), { connected: true, kind: "gemini", model: "gemini-2.5-flash", seesPictures: false, searchesWeb: true, pricing: "free tier (daily limits apply)" });
  assert.equal(brainHealth({ ANTHROPIC_API_KEY: "sk", BRAIN: "claude" }).seesPictures, true);
  assert.equal(brainHealth({ ANTHROPIC_API_KEY: "sk" }).connected, false, "a paid key alone connects nothing");
  assert.equal(brainHealth({}).connected, false);
});
