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
        const raw = await res.text();
        const quota = quotaInfo(raw);
        const detail = (quota.summary || raw).slice(0, 300);
        // A model that refuses thought summaries: ask again without them (once).
        if (res.status === 400 && thoughts && /thinking|thought/i.test(raw)) { thoughts = false; continue; }
        if (res.status === 429 && quota.permanent) {
          throw Object.assign(new Error(`Gemini 429: ${detail}`), { status: 429, permanent: quota.permanent });
        }
        // The free tier allows a few requests a minute: wait as long as Google asks, and try again.
        if ((res.status === 429 || res.status >= 500) && attempt < 6) {
          await sleep(quota.retryMs ? Math.min(90_000, Math.max(2000, quota.retryMs)) : Math.min(60_000, 5000 * 2 ** attempt));
          continue;
        }
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

/**
 * What a Gemini 429 says about the quota: which limit (google.rpc.QuotaFailure), how long to
 * wait (google.rpc.RetryInfo), and whether waiting minutes can help at all. A daily limit or
 * a limit of 0 cannot be waited out inside a film step, so the step stops with the reason.
 * @param {string} raw
 * @returns {{ summary: string, retryMs: number, permanent: string }}
 */
export function quotaInfo(raw) {
  /** @type {any} */
  let data = null;
  try { data = JSON.parse(raw); } catch { return { summary: "", retryMs: 0, permanent: "" }; }
  const details = Array.isArray(data?.error?.details) ? data.error.details : [];
  const violations = details.flatMap((/** @type {any} */ d) => (Array.isArray(d?.violations) ? d.violations : [])).filter((/** @type {any} */ v) => v?.quotaId || v?.quotaMetric);
  const delay = details.map((/** @type {any} */ d) => d?.retryDelay).find((/** @type {any} */ x) => typeof x === "string");
  const retryMs = delay && /^\d+(\.\d+)?s$/.test(delay) ? Math.round(parseFloat(delay) * 1000) : 0;
  const limits = violations.map((/** @type {any} */ v) => `${v.quotaId ?? v.quotaMetric}${v.quotaValue !== undefined ? ` = ${v.quotaValue}` : ""}`);
  const summary = limits.length ? `quota ${limits.join("; ")}${delay ? `; retry in ${delay}` : ""}` : "";
  const zero = violations.some((/** @type {any} */ v) => String(v.quotaValue) === "0");
  const daily = violations.some((/** @type {any} */ v) => /PerDay/i.test(String(v.quotaId ?? "")));
  const permanent = zero
    ? `This Gemini model has no free quota for this key (${limits.join("; ")}). Choose another model with the GEMINI_MODEL variable, then resume the film.`
    : daily
      ? `Gemini's free daily limit is used up (${limits.join("; ")}${delay ? `; retry in ${delay}` : ""}). It resets at midnight Pacific time; the film waits and goes on by itself.`
      : "";
  return { summary, retryMs, permanent };
}

/** Longest wait for a daily limit: a day and two hours (the reset is at most 24 h away). */
const MAX_DAILY_WAIT_MS = 26 * 3600_000;

/**
 * How long a film should sleep before trying again, when its step stopped on Gemini's free
 * daily limit; null for any other error. Uses Google's own retry delay when the message has
 * one, else the time to the next midnight in Pacific time; two minutes are added either way.
 * @param {unknown} error
 * @param {number} now epoch milliseconds
 * @returns {number | null}
 */
export function dailyLimitWait(error, now) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (!/free daily limit is used up/.test(msg)) return null;
  const given = /retry in (\d+(?:\.\d+)?)s/.exec(msg);
  const base = given ? Math.round(parseFloat(given[1]) * 1000) : msUntilPacificMidnight(now);
  return Math.min(MAX_DAILY_WAIT_MS, Math.max(60_000, base + 120_000));
}

/** @param {number} now */
export function msUntilPacificMidnight(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  const sinceMidnight = ((Number(parts.hour) % 24) * 3600 + Number(parts.minute) * 60 + Number(parts.second)) * 1000;
  return 24 * 3600_000 - sinceMidnight;
}
