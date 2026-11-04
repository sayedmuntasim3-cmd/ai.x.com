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
 * @param {{ apiKey: string, model?: string, maxRetries?: number, fetch?: typeof fetch }} o
 * @returns {import("../engine/src/film-run.mjs").Model}
 */
export function anthropicModel({ apiKey, model = "claude-opus-5-5", maxRetries = 4, fetch }) {
  const client = new Anthropic({ apiKey, maxRetries, timeout: 40 * 60 * 1000, ...(fetch ? { fetch } : {}) });
  return {
    name: model,
    async call(req) {
      /** @type {any[]} */
      const messages = req.messages.map((m) => ({ role: m.role, content: m.content.map(block) }));
      const tools = req.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: req.webSearch.maxUses }] : undefined;
      const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
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
        for (const k of /** @type {(keyof typeof usage)[]} */ (Object.keys(usage))) usage[k] += Number(/** @type {any} */ (message.usage)?.[k] ?? 0);
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
