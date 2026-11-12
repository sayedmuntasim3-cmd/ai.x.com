/**
 * The film run's model, backed by the Claude API through the official SDK.
 * Streams every request (chapters run to tens of thousands of tokens),
 * caches the manual and the brief for an hour, resumes server-side web
 * search when it pauses, falls back server-side when a request is declined,
 * and retries 429 / 5xx / overloaded errors through the SDK.
 */
import Anthropic from "@anthropic-ai/sdk";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** @param {{ text: string, cache?: boolean, image?: string }} b */
function block(b) {
  if (b.image) return { type: "image", source: { type: "url", url: b.image } };
  return b.cache ? { type: "text", text: b.text, cache_control: { type: "ephemeral", ttl: "1h" } } : { type: "text", text: b.text };
}

/**
 * baseURL (optional) sends the calls through a gateway such as Cloudflare AI
 * Gateway (https://gateway.ai.cloudflare.com/v1/<account>/<gateway>/anthropic)
 * for request logs and analytics; the API key still goes to Anthropic.
 * @param {{ apiKey: string, model?: string, maxRetries?: number, fetch?: typeof fetch, baseURL?: string }} o
 * @returns {import("../engine/src/film-run.mjs").Model}
 */
export function anthropicModel({ apiKey, model = "claude-opus-5-5", maxRetries = 4, fetch, baseURL }) {
  const client = new Anthropic({ apiKey, maxRetries, timeout: 40 * 60 * 1000, ...(fetch ? { fetch } : {}), ...(baseURL ? { baseURL } : {}) });
  return {
    name: model,
    async call(req) {
      /** @type {any[]} */
      const messages = req.messages.map((m) => ({ role: m.role, content: m.content.map(block) }));
      const tools = req.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: req.webSearch.maxUses }] : undefined;
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0 };
      let text = "";
      let stopReason = "end_turn";
      let served = model;
      // A paused server-side search resumes by sending the paused turn back as is.
      for (let part = 0; part < 6; part += 1) {
        /** @type {any} */
        const params = {
          model,
          max_tokens: req.maxTokens,
          system: req.system.map(block),
          messages,
          thinking: { type: "adaptive" },
          output_config: { effort: req.effort },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        };
        if (tools) params.tools = tools;
        const message = await client.beta.messages.stream(params).finalMessage();
        for (const k of /** @type {(keyof typeof usage)[]} */ (Object.keys(usage))) if (k !== "web_search_requests") usage[k] += Number(/** @type {any} */ (message.usage)?.[k] ?? 0);
        // Searches are billed per request, apart from tokens.
        usage.web_search_requests += Number(/** @type {any} */ (message.usage)?.server_tool_use?.web_search_requests ?? 0);
        served = message.model ?? served;
        stopReason = message.stop_reason ?? "end_turn";
        text += message.content.filter((/** @type {any} */ b) => b.type === "text").map((/** @type {any} */ b) => b.text).join("");
        if (stopReason !== "pause_turn") break;
        messages.push({ role: "assistant", content: message.content });
      }
      return { text, stopReason, usage, model: served };
    },
  };
}

/** @param {string} text */
async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Half-price mode: every call goes through the Message Batches API, which
 * bills every token at 50%. Same model, same prompts, same quality; slower,
 * because a batch usually ends within minutes to an hour (at most 24 hours).
 * Each call is a batch of one request, keyed by a hash of the request:
 * - the batch id is stored before waiting, so a retried or resumed step
 *   polls the same batch instead of paying for a second one;
 * - a result is counted once; replaying it later returns zero usage;
 * - an expired or canceled batch is forgotten so the retry submits again,
 *   and a request the API rejects fails with status 400 (not retried).
 * Server-side fallbacks are not available in batches; a declined request
 * stops the stage with the reason, like any refusal.
 * @param {{ apiKey: string, model?: string, maxRetries?: number, fetch?: typeof fetch, baseURL?: string, store: { get(key: string): Promise<string | null>, put(key: string, text: string): Promise<void> }, pollMs?: number, sleep?: (ms: number) => Promise<void> }} o
 * @returns {import("../engine/src/film-run.mjs").Model}
 */
export function anthropicBatchModel(o) {
  const model = o.model ?? "claude-opus-5-5";
  const client = new Anthropic({ apiKey: o.apiKey, maxRetries: o.maxRetries ?? 4, ...(o.fetch ? { fetch: o.fetch } : {}), ...(o.baseURL ? { baseURL: o.baseURL } : {}) });
  const sleep = o.sleep ?? ((/** @type {number} */ ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const pollMs = o.pollMs ?? 30_000;
  return {
    name: model,
    async call(req) {
      /** @type {any[]} */
      const messages = req.messages.map((m) => ({ role: m.role, content: m.content.map(block) }));
      const tools = req.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: req.webSearch.maxUses }] : undefined;
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, web_search_requests: 0, batch: 1 };
      let text = "";
      let stopReason = "end_turn";
      let served = model;
      for (let part = 0; part < 6; part += 1) {
        /** @type {any} */
        const params = { model, max_tokens: req.maxTokens, system: req.system.map(block), messages, thinking: { type: "adaptive" }, output_config: { effort: req.effort } };
        if (tools) params.tools = tools;
        const key = `batches/${await sha256(JSON.stringify(params))}.json`;
        /** @type {{ id: string, stage: string, at: string, counted?: boolean } | null} */
        let record = JSON.parse((await o.store.get(key)) ?? "null");
        if (!record) {
          const created = await client.messages.batches.create({ requests: [{ custom_id: "r", params }] });
          record = { id: created.id, stage: req.stage, at: new Date().toISOString() };
          await o.store.put(key, JSON.stringify(record));
        }
        for (;;) {
          const batch = await client.messages.batches.retrieve(record.id);
          if (batch.processing_status === "ended") break;
          await sleep(pollMs);
        }
        /** @type {any} */
        let result = null;
        for await (const r of await client.messages.batches.results(record.id)) if (r.custom_id === "r") result = r.result;
        if (!result || result.type !== "succeeded") {
          await o.store.put(key, "null");
          const detail = String(result?.error?.error?.message ?? result?.error?.message ?? "");
          const invalid = result?.type === "errored" && /invalid_request/.test(JSON.stringify(result.error ?? {}));
          throw Object.assign(new Error(`The batch request ${result?.type ?? "returned nothing"}${detail ? `: ${detail}` : ""}.`), invalid ? { status: 400 } : {});
        }
        const message = result.message;
        if (!record.counted) {
          for (const k of /** @type {const} */ (["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"])) usage[k] += Number(message.usage?.[k] ?? 0);
          usage.web_search_requests += Number(message.usage?.server_tool_use?.web_search_requests ?? 0);
          await o.store.put(key, JSON.stringify({ ...record, counted: true }));
        }
        served = message.model ?? served;
        stopReason = message.stop_reason ?? "end_turn";
        text += (message.content ?? []).filter((/** @type {any} */ b) => b.type === "text").map((/** @type {any} */ b) => b.text).join("");
        if (stopReason !== "pause_turn") break;
        messages.push({ role: "assistant", content: message.content });
      }
      return { text, stopReason, usage, model: served };
    },
  };
}

/**
 * Half-price mode for the film's writing stages; the footage desk's many
 * small look-at-thumbnails calls stay on the fast API, so the media step
 * does not wait for a batch per six shots.
 * @param {import("../engine/src/film-run.mjs").Model} fast
 * @param {import("../engine/src/film-run.mjs").Model} batch
 * @returns {import("../engine/src/film-run.mjs").Model}
 */
export function savingModel(fast, batch) {
  return { name: batch.name, call: (req) => (req.stage.startsWith("media-judge") ? fast.call(req) : batch.call(req)) };
}

/**
 * An API error that the same request will hit again (wrong key, no access,
 * unknown model, a request the API rejects): retrying it only costs time.
 * Returns the owner-readable reason, or null for errors worth retrying
 * (network, 408, 409, 429, 5xx, overloaded).
 * @param {unknown} error
 */
export function permanentError(error) {
  const status = Number(/** @type {any} */ (error)?.status);
  const raw = error instanceof Error ? error.message : String(error);
  if (status === 401) return "The Claude API key is wrong or revoked (401). Set ANTHROPIC_API_KEY again, then resume the film.";
  if (status === 403) return "The Claude API key has no access to this model or feature (403). Check the key's workspace, then resume the film.";
  if (status === 404) return `The model was not found (404). Check the MODEL setting, then resume the film. ${raw}`.slice(0, 500);
  if (status === 400 || status === 413 || status === 422) return `The Claude API rejected the request (${status}): ${raw}`.slice(0, 500);
  if (/^The model declined stage /.test(raw)) return raw;
  return null;
}
