/**
 * Google Gemini as the film's writer, for the free tier (GEMINI_API_KEY from
 * aistudio.google.com). Same interface as worker/anthropic.mjs: call(request)
 * -> { text, stopReason, usage, model }. Web search uses Gemini's Google
 * Search tool. Images by URL are not sent (Gemini needs the bytes), so the
 * brain says it cannot see (capabilities.vision false): the footage desk is
 * skipped on Gemini and picks keep the search order.
 *
 * webSearch false (GEMINI_SEARCH=off, for the Phase 0 experiment arm B):
 * the brain says it cannot search, so the run uses the code research desk
 * and Google Search is never sent as a tool. Each reply also carries the
 * responseId and modelVersion Google returns, as evidence of a live call.
 */
export const GEMINI_DEFAULT = "gemini-2.5-flash";

/**
 * @param {{ apiKey: string, model?: string, webSearch?: boolean, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void> }} o
 * @returns {import("../engine/src/film-run.mjs").Model}
 */
export function geminiModel(o) {
  const model = o.model || GEMINI_DEFAULT;
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  return {
    name: model,
    capabilities: { vision: false, webSearch: o.webSearch !== false },
    async call(req) {
      const text = (/** @type {{ text: string, image?: string }[]} */ blocks) => blocks.filter((b) => !b.image).map((b) => ({ text: b.text }));
      const body = {
        systemInstruction: { parts: text(req.system) },
        contents: req.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: text(m.content) })),
        generationConfig: { maxOutputTokens: Math.min(req.maxTokens, 65536) },
        ...(req.webSearch && o.webSearch !== false ? { tools: [{ google_search: {} }] } : {}),
      };
      for (let attempt = 0; ; attempt += 1) {
        const res = await get(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey }, body: JSON.stringify(body) });
        if (res.ok) {
          const data = /** @type {any} */ (await res.json());
          const cand = data.candidates?.[0];
          const out = (cand?.content?.parts ?? []).map((/** @type {any} */ p) => p.text ?? "").join("");
          const reason = cand?.finishReason === "MAX_TOKENS" ? "max_tokens" : cand?.finishReason === "SAFETY" || data.promptFeedback?.blockReason ? "refusal" : "end_turn";
          return { text: out, stopReason: reason, model, ...(data.responseId ? { responseId: String(data.responseId) } : {}), ...(data.modelVersion ? { modelVersion: String(data.modelVersion) } : {}), usage: { input_tokens: data.usageMetadata?.promptTokenCount ?? 0, output_tokens: (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0) } };
        }
        // The free tier allows a few requests a minute: wait and try again.
        if ((res.status === 429 || res.status >= 500) && attempt < 6) { await sleep(Math.min(60_000, 5000 * 2 ** attempt)); continue; }
        const err = Object.assign(new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`), { status: res.status });
        throw err;
      }
    },
  };
}
