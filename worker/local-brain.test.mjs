import assert from "node:assert/strict";
import { test } from "node:test";
import { permanentError } from "./anthropic.mjs";
import { detectApi, estimateTokens, FREE_PRICE, localBrain, stripThinking } from "./local-brain.mjs";

const noSleep = async () => {};

/**
 * A fake server that answers each POST with the next reply.
 * @param {((body: any, url: string) => Response)[]} replies
 */
function fakeServer(replies) {
  /** @type {{ url: string, headers: any, body: any }[]} */
  const sent = [];
  let i = 0;
  const fetch = /** @type {typeof globalThis.fetch} */ (async (url, init) => {
    if (!init || init.method !== "POST") return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    const body = JSON.parse(String(init.body));
    sent.push({ url: String(url), headers: init.headers, body });
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return reply(body, String(url));
  });
  return { sent, fetch };
}

test("Ollama: native /api/chat with the window set per request, thinking removed, usage counted", async () => {
  const { sent, fetch } = fakeServer([
    () => Response.json({ model: "qwen3:32b", message: { role: "assistant", content: "<think>plan the scene</think>\n## S0\nIntake." }, done_reason: "stop", prompt_eval_count: 1200, eval_count: 90 }),
  ]);
  const brain = localBrain({ url: "http://localhost:11434/", model: "qwen3:32b", contextTokens: 65536, fetch, sleep: noSleep });
  const r = await brain.call({ stage: "s01", system: [{ text: "MANUAL", cache: true }, { text: "BRIEF", cache: true }], messages: [{ role: "user", content: [{ text: "Write S0." }] }], maxTokens: 24000, effort: "high" });
  assert.equal(sent[0].url, "http://localhost:11434/api/chat");
  assert.deepEqual(sent[0].body.messages, [{ role: "system", content: "MANUAL\n\nBRIEF" }, { role: "user", content: "Write S0." }]);
  assert.equal(sent[0].body.options.num_ctx, 65536, "Ollama's window is set on every request, so a long prompt is never cut silently");
  assert.equal(sent[0].body.options.num_predict, 8192, "the reply is capped at the brain's output limit; the run continues it");
  assert.equal(sent[0].body.stream, false);
  assert.deepEqual([r.text, r.stopReason, r.usage.input_tokens, r.usage.output_tokens], ["## S0\nIntake.", "end_turn", 1200, 90]);
  assert.deepEqual(brain.capabilities, { vision: false, webSearch: false, contextTokens: 65536 });
  assert.deepEqual(brain.price, FREE_PRICE, "a brain on the owner's machine costs nothing per token");
});

test("OpenAI-compatible: /chat/completions, key sent, cut-off reply reported as max_tokens", async () => {
  const { sent, fetch } = fakeServer([
    () => Response.json({ model: "llama-3.3-70b", choices: [{ message: { content: "Part one" }, finish_reason: "length" }], usage: { prompt_tokens: 50, completion_tokens: 4000 } }),
  ]);
  const brain = localBrain({ url: "http://127.0.0.1:8080/v1/", model: "llama-3.3-70b", apiKey: "secret", fetch, sleep: noSleep });
  const r = await brain.call({ stage: "s5:C1", system: [{ text: "M" }], messages: [{ role: "user", content: [{ text: "a" }, { text: "b" }] }, { role: "assistant", content: [{ text: "c" }] }], maxTokens: 64000, effort: "high" });
  assert.equal(sent[0].url, "http://127.0.0.1:8080/v1/chat/completions");
  assert.equal(sent[0].headers.authorization, "Bearer secret");
  assert.deepEqual(sent[0].body.messages, [{ role: "system", content: "M" }, { role: "user", content: "a\n\nb" }, { role: "assistant", content: "c" }]);
  assert.deepEqual([r.text, r.stopReason, r.usage.output_tokens], ["Part one", "max_tokens", 4000]);
});

test("a request that does not fit the window is refused with the reason, never truncated", async () => {
  const { sent, fetch } = fakeServer([() => Response.json({})]);
  const brain = localBrain({ url: "http://localhost:11434", model: "llama3.2:3b", contextTokens: 8192, fetch, sleep: noSleep });
  const manual = "x".repeat(73_000); // the full production manual is about this long
  await assert.rejects(
    brain.call({ stage: "s01", system: [{ text: manual }], messages: [{ role: "user", content: [{ text: "go" }] }], maxTokens: 24000, effort: "high" }),
    (error) => {
      const reason = permanentError(error);
      assert.ok(reason, "the Workflow must not retry a request that can never fit");
      assert.match(String(reason), /Stage s01 needs about [\d,]+ tokens of input, and the brain's window is 8,192 tokens/);
      assert.match(String(reason), /BRAIN_CONTEXT/);
      return true;
    },
  );
  assert.equal(sent.length, 0, "nothing is sent to the server");
});

test("a short request in a big window is sent whole, with the reply limit lowered to what fits", async () => {
  const { sent, fetch } = fakeServer([() => Response.json({ choices: [{ message: { content: "ok" }, finish_reason: "stop" }] })]);
  const brain = localBrain({ url: "http://h/v1", model: "m", contextTokens: 12_000, maxOutputTokens: 16_000, fetch, sleep: noSleep });
  await brain.call({ stage: "qa", system: [{ text: "y".repeat(16_000) }], messages: [{ role: "user", content: [{ text: "go" }] }], maxTokens: 16_000, effort: "high" });
  const input = estimateTokens("y".repeat(16_000) + "\n\ngo") + 128;
  assert.equal(sent[0].body.max_tokens, 12_000 - input);
});

test("a busy or sleeping machine is waited for; a missing model is a permanent error with the fix", async () => {
  let calls = 0;
  const fetch = /** @type {typeof globalThis.fetch} */ (async () => {
    calls += 1;
    if (calls === 1) throw new TypeError("fetch failed");
    if (calls === 2) return new Response("loading", { status: 503, headers: { "retry-after": "1" } });
    return Response.json({ message: { content: "done" }, done_reason: "stop" });
  });
  /** @type {number[]} */
  const waits = [];
  const brain = localBrain({ url: "http://localhost:11434", model: "m", fetch, sleep: async (ms) => { waits.push(ms); } });
  const r = await brain.call({ stage: "s2", system: [{ text: "M" }], messages: [{ role: "user", content: [{ text: "go" }] }], maxTokens: 2000, effort: "medium" });
  assert.equal(r.text, "done");
  assert.equal(calls, 3);
  assert.equal(waits[1], 1000, "Retry-After is honoured");

  const missing = localBrain({ url: "http://localhost:11434", model: "qwen3:32b", fetch: /** @type {any} */ (async () => new Response('{"error":"model \\"qwen3:32b\\" not found, try pulling it first"}', { status: 404 })), sleep: noSleep });
  await assert.rejects(missing.call({ stage: "s2", system: [{ text: "M" }], messages: [{ role: "user", content: [{ text: "go" }] }], maxTokens: 2000, effort: "medium" }), (error) => {
    assert.match(String(permanentError(error)), /ollama pull qwen3:32b/);
    return true;
  });
});

test("vision: images reach a seeing brain in order (Ollama as numbered attachments, OpenAI inline); a blind brain gets none", async () => {
  const content = [{ text: "SC0001-1 candidate 0:" }, { text: "", image: "https://img/a.jpg" }, { text: "SC0001-1 candidate 1:" }, { text: "", image: "https://img/b.jpg" }];
  const req = { stage: "media-judge:C1", system: [{ text: "M" }], messages: [{ role: /** @type {const} */ ("user"), content }], maxTokens: 2000, effort: "low" };

  const ollama = fakeServer([() => Response.json({ message: { content: "{}" }, done_reason: "stop" })]);
  await localBrain({ url: "http://localhost:11434", model: "qwen2.5vl", vision: true, fetch: ollama.fetch, sleep: noSleep }).call(req);
  const msg = ollama.sent[0].body.messages[1];
  assert.equal(msg.content, "SC0001-1 candidate 0:\n\n[image 1]\n\nSC0001-1 candidate 1:\n\n[image 2]", "each image keeps its place as a marker");
  assert.equal(msg.images.length, 2);
  assert.equal(msg.images[0], "AQID", "image bytes are sent as base64");

  const openai = fakeServer([() => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] })]);
  await localBrain({ url: "http://h/v1", model: "vl", vision: true, fetch: openai.fetch, sleep: noSleep }).call(req);
  assert.deepEqual(openai.sent[0].body.messages[1].content.map((/** @type {any} */ p) => p.type), ["text", "image_url", "text", "image_url"]);

  const blind = fakeServer([() => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] })]);
  const brain = localBrain({ url: "http://h/v1", model: "text-only", fetch: blind.fetch, sleep: noSleep });
  await brain.call(req);
  assert.equal(blind.sent[0].body.messages[1].content, "SC0001-1 candidate 0:\n\nSC0001-1 candidate 1:");
  assert.equal(brain.capabilities?.vision, false);
});

test("helpers: thinking removal, API detection, required settings", () => {
  assert.equal(stripThinking("<think>a</think>\n\nanswer <think>b</think>end"), "answer end");
  assert.equal(stripThinking("<think>cut off while thinking"), "", "no answer yet");
  assert.equal(detectApi("http://localhost:11434"), "ollama");
  assert.equal(detectApi("http://localhost:11434/v1"), "openai");
  assert.equal(detectApi("http://localhost:8080/v1"), "openai");
  assert.equal(detectApi("https://brain.example.com"), "openai");
  assert.throws(() => localBrain({ url: "", model: "m" }), /BRAIN_URL/);
  assert.throws(() => localBrain({ url: "http://h", model: "" }), /BRAIN_MODEL/);
});
