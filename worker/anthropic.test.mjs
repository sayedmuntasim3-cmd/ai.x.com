// node --test worker/  — checks the exact request the Worker sends to the
// Claude API and the pause_turn resume, against a fake streaming endpoint.
import assert from "node:assert/strict";
import { test } from "node:test";
import { anthropicModel } from "./anthropic.mjs";

/** A minimal server-sent-events reply for one message. */
function sse(/** @type {string} */ text, /** @type {string} */ stopReason, usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 }) {
  const events = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: usage.output_tokens } }],
    ["message_stop", { type: "message_stop" }],
  ];
  return new Response(events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

test("requests stream with caching, effort, web search and fallbacks; a paused search resumes", async () => {
  /** @type {any[]} */
  const bodies = [];
  /** @type {Headers[]} */
  const headers = [];
  const replies = [sse("Part one. ", "pause_turn"), sse("Part two.", "end_turn")];
  const fakeFetch = /** @type {typeof fetch} */ (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    headers.push(new Headers(init?.headers));
    return /** @type {Response} */ (replies.shift());
  });
  const model = anthropicModel({ apiKey: "test", fetch: fakeFetch, maxRetries: 0 });
  const out = await model.call({
    stage: "research",
    system: [{ text: "MANUAL", cache: true }, { text: "BRIEF", cache: true }],
    messages: [{ role: "user", content: [{ text: "shared", cache: true }, { text: "task" }] }],
    maxTokens: 32000,
    effort: "high",
    webSearch: { maxUses: 30 },
  });
  assert.equal(out.text, "Part one. Part two.");
  assert.equal(out.stopReason, "end_turn");
  assert.equal(out.usage.input_tokens, 20);
  assert.equal(out.usage.cache_read_input_tokens, 200);
  const b = bodies[0];
  assert.equal(b.model, "claude-opus-5-5");
  assert.equal(b.stream, true);
  assert.equal(b.max_tokens, 32000);
  assert.deepEqual(b.thinking, { type: "adaptive" });
  assert.deepEqual(b.output_config, { effort: "high" });
  assert.equal(b.fallbacks, "default");
  assert.deepEqual(b.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(b.messages[0].content[1].cache_control, undefined);
  assert.deepEqual(b.tools, [{ type: "web_search_20260209", name: "web_search", max_uses: 30 }]);
  assert.ok(String(headers[0].get("anthropic-beta")).includes("server-side-fallback-2026-07-01"));
  assert.ok(!("betas" in b), "betas go in the header, not the body");
  // The resume sends the paused assistant turn back, with no extra user message.
  assert.equal(bodies[1].messages.length, 2);
  assert.equal(bodies[1].messages[1].role, "assistant");
});

test("an image block goes to the API as a URL image source", async () => {
  /** @type {any[]} */
  const bodies = [];
  const fakeFetch = /** @type {typeof fetch} */ (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); return sse("{}", "end_turn"); });
  const model = anthropicModel({ apiKey: "test", fetch: fakeFetch, maxRetries: 0 });
  await model.call({ stage: "media-judge:C1", system: [{ text: "M", cache: true }], messages: [{ role: "user", content: [{ text: "SHOT SC0001-1: mill" }, { text: "", image: "https://images.pexels.com/1.jpg?w=320" }] }], maxTokens: 2000, effort: "low" });
  assert.deepEqual(bodies[0].messages[0].content[1], { type: "image", source: { type: "url", url: "https://images.pexels.com/1.jpg?w=320" } });
});

test("errors the same request would hit again stop the film at once; outages are retried", async () => {
  const { permanentError } = await import("./anthropic.mjs");
  const err = (/** @type {number} */ status) => Object.assign(new Error(`${status} boom`), { status });
  assert.match(String(permanentError(err(401))), /API key is wrong/);
  assert.match(String(permanentError(err(403))), /no access/);
  assert.match(String(permanentError(err(404))), /model was not found/);
  assert.match(String(permanentError(err(400))), /rejected the request \(400\)/);
  for (const s of [408, 409, 429, 500, 529]) assert.equal(permanentError(err(s)), null, `${s} is retried`);
  assert.equal(permanentError(new Error("fetch failed")), null, "a network error is retried");
  assert.match(String(permanentError(new Error("The model declined stage s2."))), /declined/);
});

test("web searches are counted for the bill", async () => {
  const body = (/** @type {string} */ text) => [
    ["message_start", { type: "message_start", message: { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0, server_tool_use: { web_search_requests: 3 } } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 5, server_tool_use: { web_search_requests: 3 } } }],
    ["message_stop", { type: "message_stop" }],
  ].map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
  const fakeFetch = /** @type {typeof fetch} */ (async () => new Response(body("ok"), { headers: { "content-type": "text/event-stream" } }));
  const model = anthropicModel({ apiKey: "test", fetch: fakeFetch, maxRetries: 0 });
  const out = await model.call({ stage: "research", system: [{ text: "M" }], messages: [{ role: "user", content: [{ text: "x" }] }], maxTokens: 1000, effort: "high", webSearch: { maxUses: 5 } });
  assert.equal(out.usage.web_search_requests, 3);
  const { costOf } = await import("../engine/src/film-run.mjs");
  assert.equal(costOf({ web_search_requests: 3 }, "claude-opus-5-5"), 0.03);
  assert.ok(costOf({ output_tokens: 1e6 }, "claude-some-future-model") >= 25, "an unknown model is charged at the highest listed price, never $0");
});
