// Simulated: no request leaves the machine; the live check needs the key.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGeminiModel, PHASE0_MODEL } from "./gemini-check.mjs";

const reply = (/** @type {number} */ status, /** @type {any} */ body) => /** @type {typeof fetch} */ (async (url, init) => {
  assert.equal(String(url), `https://generativelanguage.googleapis.com/v1beta/models/${PHASE0_MODEL}`, "models.get only, never generateContent");
  assert.equal(/** @type {any} */ (init?.headers)?.["x-goog-api-key"], "dummy");
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
});

test("a listed model with enough room passes and its reported limits are recorded", async () => {
  const r = await checkGeminiModel({ apiKey: "dummy", fetch: reply(200, { name: "models/gemini-3.8-flash", version: "3.8", inputTokenLimit: 1048576, outputTokenLimit: 65536, supportedGenerationMethods: ["generateContent", "countTokens"], thinking: true }) });
  assert.equal(r.ok, true);
  assert.equal(r.info?.outputTokenLimit, 65536);
});

test("missing model, refused project, bad key and small limits fail with a reason", async () => {
  assert.match((await checkGeminiModel({ apiKey: "dummy", fetch: reply(404, { error: { status: "NOT_FOUND", message: "models/gemini-3.8-flash is not found" } }) })).problems[0], /404 NOT_FOUND: the model is not available to this project/);
  assert.match((await checkGeminiModel({ apiKey: "dummy", fetch: reply(403, { error: { status: "PERMISSION_DENIED", message: "denied" } }) })).problems[0], /403 PERMISSION_DENIED/);
  assert.match((await checkGeminiModel({ apiKey: "dummy", fetch: reply(400, { error: { status: "INVALID_ARGUMENT", message: "API key not valid" } }) })).problems[0], /key or request was refused/);
  const small = await checkGeminiModel({ apiKey: "dummy", fetch: reply(200, { inputTokenLimit: 32000, outputTokenLimit: 8192, supportedGenerationMethods: ["generateContent"] }) });
  assert.equal(small.ok, false);
  assert.equal(small.problems.length, 2);
  assert.equal((await checkGeminiModel({ apiKey: "dummy", model: "../x" })).ok, false);
});
