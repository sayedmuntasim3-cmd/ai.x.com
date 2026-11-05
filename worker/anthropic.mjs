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
