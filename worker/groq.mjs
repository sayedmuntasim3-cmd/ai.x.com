/**
 * Groq as a second free brain (OpenAI-compatible API, the GROQ_API_KEY secret).
 *
 * Measured on the owner's key (20 Nov 2026): openai/gpt-oss-120b, openai/gpt-oss-20b and
 * qwen/qwen3.8-27b each allow 1,000 requests a day and 8,000 tokens a minute. A request whose
 * prompt is over 8,000 tokens is refused at once (413 "Request too large ... Requested 9396"; the
 * reply allowance is not counted up front), about 4.3 characters a token. So Groq takes the calls
 * whose prompt fits, with only the manual sections the stage needs (engine/src/lean-manual.mjs),
 * and Gemini keeps its few daily requests for the big ones (chapters).
 *
 * The pacing of those limits is worker/groq-pacing.mjs: a token bucket per model (8,000 a minute), Retry-After
 * waits (three tries on one model, then GROQ_MODELS' next), and a used-up day as a daily error with its reset
 * time. A film's runner keeps the bucket across its calls, because a Worker request cannot remember the last one.
 */
import { leanManual } from "../engine/src/lean-manual.mjs";
import { dailyResetMs, GROQ_RETRIES_PER_MODEL, GROQ_RETRY_WAIT_MS, retryAfterMs, tokenBucket } from "./groq-pacing.mjs";

export const GROQ_MODELS = Object.freeze(["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"]);
/** Prompt tokens a request may carry (8,000 a minute, less a margin for the estimate). */
export const GROQ_PROMPT_LIMIT = 7200;
/** Characters per token, rounded down from the measured 4.27 so the estimate errs on the large side. */
const CHARS_PER_TOKEN = 3.8;
const MANUAL_START = "ZUPONA DOCUMENTARY MASTER ENGINE";

/**
 * The request's text as Groq gets it: the manual cut to the stage's sections.
 * @param {{ stage?: string, system: { text: string, image?: string }[], messages: { role: string, content: { text: string, image?: string }[] }[] }} req
 */
export function groqMessages(req) {
  const join = (/** @type {{ text: string, image?: string }[]} */ blocks) => blocks.filter((b) => !b.image).map((b) => b.text).join("\n\n");
  const system = req.system.filter((b) => !b.image).map((b) => (b.text.startsWith(MANUAL_START) ? leanManual(b.text, req.stage ?? "") : b.text)).join("\n\n");
  return [{ role: "system", content: system }, ...req.messages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: join(m.content) }))];
}

/** Estimated prompt tokens. @param {{ content: string }[]} messages */
export function promptTokens(messages) {
  return Math.ceil(messages.reduce((n, m) => n + m.content.length + 8, 0) / CHARS_PER_TOKEN);
}

/**
 * @param {{ apiKey: string, models?: string[], fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, now?: () => number, bucket?: ReturnType<typeof tokenBucket>, retries?: number, pace?: boolean }} o
 */
export function groqModel(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const models = o.models?.length ? o.models : [...GROQ_MODELS];
  /** How many times one model is tried on a busy minute before the next takes the call (3). */
  const retries = Math.max(1, o.retries ?? GROQ_RETRIES_PER_MODEL);
  /** The minute's token window. A caller that makes many calls (a film's run) hands in its own, so the window spans them. */
  const bucket = o.pace === false ? null : o.bucket ?? tokenBucket({ now });
  /** Models whose day is used up in this run. */
  const spent = new Set();
  return {
    name: models[0],
    // promptLimitTokens: the film run splits any stage larger than one Groq request (engine/src/film-split.mjs).
    capabilities: { vision: false, webSearch: false, promptLimitTokens: GROQ_PROMPT_LIMIT },
    /** Whether a request fits Groq at all (no web search, prompt under the per-minute limit). @param {any} req */
    fits(req) {
      return !req.webSearch && !req.system.some((/** @type {any} */ b) => b.image) && promptTokens(groqMessages(req)) <= GROQ_PROMPT_LIMIT;
    },
    /** @param {any} req */
    async call(req) {
      const messages = groqMessages(req);
      const tokens = promptTokens(messages);
      if (req.webSearch || tokens > GROQ_PROMPT_LIMIT) throw Object.assign(new Error(`Groq: the prompt (about ${tokens} tokens) is over its ${GROQ_PROMPT_LIMIT}-token limit, or the stage needs web search.`), { status: 413, tooLarge: true });
      /** @type {string[]} */
      const tried = [];
      /** What Groq said about a used-up day, if any model said it. */
      /** @type {{ resetMs: number, text: string } | null} */
      let day = null;
      let lastRetry = 0;
      for (const id of models) {
        if (spent.has(id)) continue;
        for (let attempt = 1; attempt <= retries; attempt += 1) {
          // The minute's tokens first: a burst of calls never crosses 8,000 in one minute on one model.
          const wait = bucket?.waitMs(id, tokens) ?? 0;
          if (wait > 0) await sleep(wait + 250);
          const res = await get("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" },
            body: JSON.stringify({ model: id, messages, max_tokens: Math.min(req.maxTokens, 32768), reasoning_effort: id.startsWith("openai/") ? "low" : undefined, ...(id.startsWith("qwen/") ? { reasoning_format: "hidden" } : {}) }),
          });
          if (res.ok) {
            const data = /** @type {any} */ (await res.json());
            const choice = data.choices?.[0] ?? {};
            const text = String(choice.message?.content ?? "");
            if (!text && choice.finish_reason !== "length") { tried.push(`${id} (empty reply)`); break; }
            bucket?.spend(id, Number(data.usage?.prompt_tokens) || tokens);
            return { text, stopReason: choice.finish_reason === "length" ? "max_tokens" : "end_turn", model: id, usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 } };
          }
          const raw = await res.text().catch(() => "");
          // The minute's window (Retry-After, or x-ratelimit-reset-*): wait for it, up to three times on the
          // same model. A used-up day: that model is out for the run and the next one takes the call.
          if (res.status === 429) {
            if (/per day|RPD|TPD|per-day/i.test(raw)) {
              spent.add(id);
              if (!day) day = { resetMs: dailyResetMs(raw, res.headers, now()), text: raw.replace(/\s+/g, " ").slice(0, 200) };
              tried.push(`${id} (day used up)`);
              break;
            }
            lastRetry = retryAfterMs(res.headers, now());
            if (attempt < retries) { await sleep(Math.min(lastRetry || GROQ_RETRY_WAIT_MS, 65_000) + 500); tried.push(`${id} (busy ${attempt})`); continue; }
            tried.push(`${id} (busy)`);
            break;
          }
          if (res.status === 413) throw Object.assign(new Error(`Groq 413: ${raw.slice(0, 200)}`), { status: 413, tooLarge: true });
          tried.push(`${id} (${res.status})`);
          break;
        }
      }
      const everyDayGone = models.every((id) => spent.has(id));
      throw Object.assign(
        new Error(everyDayGone ? `Groq: the free day of every model is used up; tried ${tried.join(", ")}` : `Groq: no model took the request; tried ${tried.join(", ")}`),
        { status: 429, daily: everyDayGone, resetMs: day?.resetMs ?? 0, retryAfterMs: lastRetry, spentModels: [...spent] },
      );
    },
  };
}

/** The one free Groq model that reads pictures (measured 26 Nov 2026: input text and image, 1,000 requests a day). */
export const GROQ_EYES_MODEL = "qwen/qwen3.8-27b";

/**
 * Free eyes: one question about one picture (a public image URL), answered in text. The per-minute
 * window is waited out (up to eight times); a used-up day or any other failure throws.
 * @param {{ apiKey: string, model?: string, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void> }} o
 * @returns {(question: string, imageUrl: string) => Promise<string>}
 */
export function groqLook(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const model = o.model ?? GROQ_EYES_MODEL;
  return async (question, imageUrl) => {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const res = await get("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: 120, temperature: 0, reasoning_format: "hidden", messages: [{ role: "user", content: [{ type: "text", text: question }, { type: "image_url", image_url: { url: imageUrl } }] }] }),
      });
      if (res.ok) return String((/** @type {any} */ (await res.json())).choices?.[0]?.message?.content ?? "");
      const raw = await res.text().catch(() => "");
      if (res.status === 429 && !/per day|RPD|TPD/i.test(raw) && attempt < 8) { await sleep(Math.min(65, Number(res.headers.get("retry-after")) || 10) * 1000 + 500); continue; }
      throw Object.assign(new Error(`Groq eyes ${res.status}: ${raw.slice(0, 160)}`), { status: res.status });
    }
    throw Object.assign(new Error("Groq eyes: still busy after eight waits"), { status: 429 });
  };
}

/**
 * Gemini (or any brain) with Groq taking the calls that fit: Groq first, so Gemini's 20 requests a
 * day per model are kept for the calls only it can take; any Groq failure goes to the main brain.
 * @template {{ name: string, call: (req: any) => Promise<any> }} M
 * @param {M} main @param {ReturnType<typeof groqModel>} groq @param {{ log?: (line: string) => void }} [o]
 * @returns {M}
 */
export function withGroq(main, groq, o = {}) {
  return {
    ...main,
    // The chain is a Groq-sized brain: the film run keeps every call under Groq's limit, so Groq takes the
    // stage and Gemini is asked only when Groq cannot (engine/src/film-split.mjs).
    capabilities: { ...main.capabilities, promptLimitTokens: /** @type {any} */ (groq.capabilities)?.promptLimitTokens },
    /** @param {any} req */
    async call(req) {
      if (groq.fits(req)) {
        try {
          return await groq.call(req);
        } catch (error) {
          o.log?.(`groq: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}; the main brain takes ${req.stage ?? "the call"}`);
        }
      }
      return main.call(req);
    },
  };
}
