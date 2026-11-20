/**
 * Groq as a second free brain (OpenAI-compatible API, the GROQ_API_KEY secret).
 *
 * Measured on the owner's key (20 Nov 2026): openai/gpt-oss-120b, openai/gpt-oss-20b and
 * qwen/qwen3.8-27b each allow 1,000 requests a day and 8,000 tokens a minute. A request whose
 * prompt is over 8,000 tokens is refused at once (413 "Request too large ... Requested 9396"; the
 * reply allowance is not counted up front), about 4.3 characters a token. So Groq takes the calls
 * whose prompt fits, with only the manual sections the stage needs (engine/src/lean-manual.mjs),
 * and Gemini keeps its few daily requests for the big ones (chapters).
 */
import { leanManual } from "../engine/src/lean-manual.mjs";

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
 * @param {{ apiKey: string, models?: string[], fetch?: typeof fetch, sleep?: (ms: number) => Promise<void> }} o
 */
export function groqModel(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const models = o.models?.length ? o.models : [...GROQ_MODELS];
  /** Models whose day is used up in this run. */
  const spent = new Set();
  return {
    name: models[0],
    capabilities: { vision: false, webSearch: false },
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
      for (const id of models) {
        if (spent.has(id)) continue;
        for (let attempt = 0; attempt < 2; attempt += 1) {
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
            return { text, stopReason: choice.finish_reason === "length" ? "max_tokens" : "end_turn", model: id, usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 } };
          }
          const raw = await res.text().catch(() => "");
          // The per-minute window: wait once when Groq says it is short; the day or a bigger wait: next model.
          if (res.status === 429) {
            const wait = Number(res.headers.get("retry-after")) * 1000;
            if (/per day|RPD|TPD/i.test(raw)) { spent.add(id); tried.push(`${id} (day used up)`); break; }
            if (attempt === 0 && wait > 0 && wait <= 65_000) { await sleep(wait + 500); continue; }
            tried.push(`${id} (busy)`);
            break;
          }
          if (res.status === 413) throw Object.assign(new Error(`Groq 413: ${raw.slice(0, 200)}`), { status: 413, tooLarge: true });
          tried.push(`${id} (${res.status})`);
          break;
        }
      }
      throw Object.assign(new Error(`Groq: no model took the request; tried ${tried.join(", ")}`), { status: 503 });
    },
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
