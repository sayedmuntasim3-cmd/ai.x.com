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
// gemini-2.5-flash is closed to new users (Gemini 404, Nov 2026: "use models/gemini-3.8-flash").
export const GEMINI_DEFAULT = "gemini-3.8-flash";

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
      let thoughts = true;
      for (let attempt = 0; ; attempt += 1) {
        // Streamed (server-sent events), with thought summaries switched on, so bytes keep flowing
        // while the model thinks: a long silent wait was cut off as "Gemini 524" (Nov 2026).
        const sent = thoughts ? { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { includeThoughts: true } } } : body;
        const res = await get(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": o.apiKey }, body: JSON.stringify(sent) });
        if (res.ok) {
          const chunks = parseChunks(await res.text());
          const parts = chunks.flatMap((c) => c.candidates?.[0]?.content?.parts ?? []);
          const out = parts.filter((/** @type {any} */ p) => !p.thought).map((/** @type {any} */ p) => p.text ?? "").join("");
          const finish = [...chunks].reverse().map((c) => c.candidates?.[0]?.finishReason).find(Boolean);
          const blocked = chunks.some((c) => c.promptFeedback?.blockReason);
          const usage = [...chunks].reverse().map((c) => c.usageMetadata).find(Boolean) ?? {};
          const responseId = chunks.map((c) => c.responseId).find(Boolean);
          const modelVersion = chunks.map((c) => c.modelVersion).find(Boolean);
          const reason = finish === "MAX_TOKENS" ? "max_tokens" : finish === "SAFETY" || blocked ? "refusal" : "end_turn";
          return { text: out, stopReason: reason, model, ...(responseId ? { responseId: String(responseId) } : {}), ...(modelVersion ? { modelVersion: String(modelVersion) } : {}), usage: { input_tokens: usage.promptTokenCount ?? 0, output_tokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) } };
        }
        const detail = (await res.text()).slice(0, 300);
        // A model that refuses thought summaries: ask again without them (once).
        if (res.status === 400 && thoughts && /thinking|thought/i.test(detail)) { thoughts = false; continue; }
        // The free tier allows a few requests a minute: wait and try again.
        if ((res.status === 429 || res.status >= 500) && attempt < 6) { await sleep(Math.min(60_000, 5000 * 2 ** attempt)); continue; }
        throw Object.assign(new Error(`Gemini ${res.status}: ${detail}`), { status: res.status });
      }
    },
  };
}

/**
 * The reply of streamGenerateContent: server-sent events ("data: {...}" lines), or, from a
 * fake or a proxy that buffers, one JSON object or an array of them.
 * @param {string} raw
 * @returns {any[]}
 */
export function parseChunks(raw) {
  const text = raw.trim();
  if (!text) return [];
  if (/^data:/m.test(text)) {
    return text.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).filter((l) => l && l !== "[DONE]").flatMap((l) => {
      try { return [JSON.parse(l)]; } catch { return []; }
    });
  }
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : [data];
}
