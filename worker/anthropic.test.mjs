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

/** A fake Message Batches API: a batch ends after `polls` status checks; results come as JSONL. */
function fakeBatches(/** @type {{ polls?: number, result?: any }} */ o = {}) {
  /** @type {{ method: string, url: string, body?: any }[]} */
  const calls = [];
  /** @type {Map<string, { checks: number, params: any }>} */
  const batches = new Map();
  let n = 0;
  const batchObject = (/** @type {string} */ id, /** @type {boolean} */ ended) => ({ id, type: "message_batch", processing_status: ended ? "ended" : "in_progress", request_counts: { processing: ended ? 0 : 1, succeeded: ended ? 1 : 0, errored: 0, canceled: 0, expired: 0 }, created_at: "2026-11-05T00:00:00Z", expires_at: "2026-11-06T00:00:00Z", ended_at: ended ? "2026-11-05T00:05:00Z" : null, cancel_initiated_at: null, archived_at: null, results_url: ended ? `https://api.anthropic.com/v1/messages/batches/${id}/results` : null });
  const f = /** @type {typeof fetch} */ (async (url, init) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url: u, ...(body ? { body } : {}) });
    if (method === "POST" && /\/v1\/messages\/batches(\?|$)/.test(u)) {
      n += 1;
      const id = `msgbatch_${n}`;
      batches.set(id, { checks: 0, params: body.requests[0].params });
      return Response.json(batchObject(id, false));
    }
    const results = /\/batches\/(msgbatch_\d+)\/results/.exec(u);
    if (results) {
      const r = o.result ?? { type: "succeeded", message: { id: "msg", type: "message", role: "assistant", model: "claude-opus-5-5", content: [{ type: "text", text: "Batch answer." }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } };
      return new Response(JSON.stringify({ custom_id: "r", result: r }) + "\n", { headers: { "content-type": "application/binary" } });
    }
    const status = /\/batches\/(msgbatch_\d+)(\?|$)/.exec(u);
    if (status) {
      const b = batches.get(status[1]);
      if (!b) return Response.json({ type: "error", error: { type: "not_found_error", message: "no" } }, { status: 404 });
      b.checks += 1;
      return Response.json(batchObject(status[1], b.checks > (o.polls ?? 1)));
    }
    return new Response("{}", { status: 404 });
  });
  return { f, calls };
}

test("half-price mode: one batch per call, stored before waiting, never paid twice, counted at half price", async () => {
  const { anthropicBatchModel, savingModel } = await import("./anthropic.mjs");
  const { costOf } = await import("../engine/src/film-run.mjs");
  /** @type {Map<string, string>} */
  const kept = new Map();
  const store = { get: async (/** @type {string} */ k) => kept.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { kept.set(k, v); } };
  const api = fakeBatches({ polls: 2 });
  /** @type {number[]} */
  const waits = [];
  const model = anthropicBatchModel({ apiKey: "test", fetch: api.f, maxRetries: 0, store, sleep: async (ms) => { waits.push(ms); } });
  const req = { stage: "s2", system: [{ text: "MANUAL", cache: true }], messages: [{ role: /** @type {const} */ ("user"), content: [{ text: "Write S2" }] }], maxTokens: 32000, effort: "medium" };
  const out = await model.call(req);
  assert.equal(out.text, "Batch answer.");
  assert.equal(waits.length, 2, "it waits while the batch runs");
  const create = api.calls.find((c) => c.method === "POST");
  assert.equal(create?.body.requests.length, 1);
  const params = create?.body.requests[0].params;
  assert.equal(params.model, "claude-opus-5-5");
  assert.deepEqual(params.output_config, { effort: "medium" });
  assert.ok(!("fallbacks" in params) && !("stream" in params), "batches take no fallbacks and no streaming");
  assert.deepEqual(params.system[0].cache_control, { type: "ephemeral", ttl: "1h" });
  assert.equal(out.usage.output_tokens, 1000);
  assert.equal(costOf(out.usage, "claude-opus-5-5"), costOf({ ...out.usage, batch: 0 }, "claude-opus-5-5") / 2, "billed at half price");
  assert.equal([...kept.keys()].filter((k) => k.startsWith("batches/")).length, 1, "the batch id is kept with the film");

  // A retried step: the same request polls the same batch and counts nothing twice.
  const posts = api.calls.filter((c) => c.method === "POST").length;
  const again = await model.call(req);
  assert.equal(again.text, "Batch answer.");
  assert.equal(api.calls.filter((c) => c.method === "POST").length, posts, "no second batch is bought");
  assert.equal(again.usage.output_tokens, 0, "the result was already counted");

  // The footage desk stays on the fast API.
  /** @type {string[]} */
  const routed = [];
  const both = savingModel({ name: "fast", call: async (r) => { routed.push(`fast:${r.stage}`); return { text: "", stopReason: "end_turn", usage: {} }; } }, { name: "claude-opus-5-5", call: async (r) => { routed.push(`batch:${r.stage}`); return { text: "", stopReason: "end_turn", usage: {} }; } });
  await both.call({ ...req, stage: "media-judge:C1" });
  await both.call({ ...req, stage: "s5:C1" });
  assert.deepEqual(routed, ["fast:media-judge:C1", "batch:s5:C1"]);
});

test("half-price mode: an expired batch is bought again on retry; a rejected request stops the film", async () => {
  const { anthropicBatchModel, permanentError } = await import("./anthropic.mjs");
  /** @type {Map<string, string>} */
  const kept = new Map();
  const store = { get: async (/** @type {string} */ k) => kept.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { kept.set(k, v); } };
  const req = { stage: "s3", system: [{ text: "M" }], messages: [{ role: /** @type {const} */ ("user"), content: [{ text: "x" }] }], maxTokens: 1000, effort: "high" };
  const expired = fakeBatches({ result: { type: "expired" } });
  await assert.rejects(anthropicBatchModel({ apiKey: "t", fetch: expired.f, maxRetries: 0, store, sleep: async () => {} }).call(req), /expired/);
  assert.ok([...kept.values()].every((v) => v === "null"), "the expired batch is forgotten, so the retry submits a new one");
  const rejected = fakeBatches({ result: { type: "errored", error: { type: "error", error: { type: "invalid_request_error", message: "prompt is too long" } } } });
  const error = await anthropicBatchModel({ apiKey: "t", fetch: rejected.f, maxRetries: 0, store, sleep: async () => {} }).call(req).catch((e) => e);
  assert.match(String(permanentError(error)), /rejected the request \(400\).*prompt is too long/);
});
