/**
 * The free brain plug: an open-weight model the owner runs himself, with the
 * same interface as worker/anthropic.mjs and worker/gemini.mjs:
 * call(request) -> { text, stopReason, usage, model }.
 *
 * Two wire formats cover the usual local servers:
 * - "ollama": Ollama's native /api/chat. Used for Ollama because it is the
 *   only Ollama endpoint that accepts the context size per request
 *   (options.num_ctx); its OpenAI-compatible endpoint ignores it and
 *   silently truncates a long prompt to the model's default window.
 * - "openai": POST {url}/chat/completions, the OpenAI-compatible API served
 *   by llama.cpp (llama-server), vLLM, LM Studio, LocalAI and others.
 *
 * What a local brain cannot do, and how the film run is told:
 * - no server-side web search (capabilities.webSearch is false), so the
 *   research stage uses the code research desk (engine/src/research-desk.mjs);
 * - images only when the owner says the model can see (vision: true);
 *   otherwise the footage desk is skipped instead of judging blind;
 * - a fixed context window: a request that does not fit is refused with a
 *   reason the owner can act on, never truncated.
 *
 * Cost: the brain is priced at zero by default because it runs on the
 * owner's own machine. A paid OpenAI-compatible service must be given its
 * real price (BRAIN_PRICE_INPUT / BRAIN_PRICE_OUTPUT), or the budget stop
 * cannot see what it spends.
 */

/** @typedef {import("../engine/src/film-run.mjs").Model} Model */
/** @typedef {import("../engine/src/film-run.mjs").ModelRequest} ModelRequest */
/** @typedef {{ input: number, output: number, cacheRead: number, cacheWrite: number }} Price */

/** @type {Readonly<Price>} */
export const FREE_PRICE = Object.freeze({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });

export const LOCAL_DEFAULTS = Object.freeze({
  /** Tokens the model's window holds (prompt and reply together). */
  contextTokens: 32768,
  /** The most a reply may be; the run continues a cut-off reply by itself. */
  maxOutputTokens: 8192,
  /** A long chapter on a home machine is slow; an hour per call. */
  timeoutMs: 60 * 60 * 1000,
  /** Tokens an image costs in the window (a 320 px thumbnail is far less on most vision models). */
  imageTokens: 800,
  /** A reply shorter than this would be useless; refuse instead. */
  minReplyTokens: 1024,
});

/**
 * A deliberately high token estimate (about 3.2 characters per token for
 * English prose and markdown), so a request that is close to the window is
 * refused rather than cut off by the server.
 * @param {string} text
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 3.2);
}

/**
 * Remove the model's reasoning from its answer: <think>...</think> blocks
 * (Qwen3, DeepSeek-R1, QwQ and others put them in the content). A reply
 * cut off while still thinking has no answer yet.
 * @param {string} text
 */
export function stripThinking(text) {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = out.indexOf("<think>");
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/^\s+/, "");
}

/**
 * Which wire format a URL most likely speaks: Ollama on its usual port
 * without a /v1 path, OpenAI-compatible otherwise.
 * @param {string} url
 * @returns {"ollama" | "openai"}
 */
export function detectApi(url) {
  try {
    const u = new URL(url);
    return u.port === "11434" && !/\/v1\/?$/.test(u.pathname) ? "ollama" : "openai";
  } catch {
    return "openai";
  }
}

/**
 * An error the same request will hit again, with the owner-readable reason
 * (worker/anthropic.mjs permanentError returns it, so the Workflow does not
 * retry it).
 * @param {string} reason @param {number} [status]
 */
function permanent(reason, status) {
  return Object.assign(new Error(reason), { permanent: reason, ...(status ? { status } : {}) });
}

/** @param {ArrayBuffer} buf */
function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * @param {{
 *   url: string, model: string, api?: "ollama" | "openai", apiKey?: string,
 *   vision?: boolean, contextTokens?: number, maxOutputTokens?: number,
 *   timeoutMs?: number, price?: Price, fetch?: typeof fetch,
 *   sleep?: (ms: number) => Promise<void>, maxAttempts?: number
 * }} o
 * @returns {Model}
 */
export function localBrain(o) {
  if (!o.url) throw new Error("The local brain needs its server address (BRAIN_URL).");
  if (!o.model) throw new Error("The local brain needs a model name (BRAIN_MODEL), for example qwen3:32b.");
  const base = o.url.replace(/\/+$/, "");
  const api = o.api ?? detectApi(base);
  const vision = o.vision === true;
  const contextTokens = Math.max(4096, Math.floor(o.contextTokens ?? LOCAL_DEFAULTS.contextTokens));
  const maxOutputTokens = Math.max(LOCAL_DEFAULTS.minReplyTokens, Math.floor(o.maxOutputTokens ?? LOCAL_DEFAULTS.maxOutputTokens));
  const timeoutMs = o.timeoutMs ?? LOCAL_DEFAULTS.timeoutMs;
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const maxAttempts = o.maxAttempts ?? 6;

  /**
   * One message's text, with each image replaced by a numbered marker when
   * the images travel apart from the text (Ollama attaches them to the message).
   * @param {{ text: string, image?: string }[]} blocks @param {string[]} images
   */
  const flatten = (blocks, images) => blocks.map((b) => {
    if (!b.image) return b.text;
    if (!vision) return "";
    images.push(b.image);
    return `[image ${images.length}]`;
  }).filter(Boolean).join("\n\n");

  /** @param {ModelRequest} req */
  function budget(req) {
    const chars = [...req.system.map((b) => b.text), ...req.messages.flatMap((m) => m.content.map((b) => (b.image ? "" : b.text)))].join("\n\n");
    const images = vision ? req.messages.reduce((n, m) => n + m.content.filter((b) => b.image).length, 0) : 0;
    const input = estimateTokens(chars) + images * LOCAL_DEFAULTS.imageTokens + 64 * (req.messages.length + 1);
    const room = contextTokens - input;
    const out = Math.min(req.maxTokens, maxOutputTokens, room);
    if (out < Math.min(LOCAL_DEFAULTS.minReplyTokens, req.maxTokens)) {
      throw permanent(`Stage ${req.stage} needs about ${input.toLocaleString("en-US")} tokens of input, and the brain's window is ${contextTokens.toLocaleString("en-US")} tokens, which leaves no room for the reply. Use a model with a longer context and raise BRAIN_CONTEXT (with Ollama the window is set per request from BRAIN_CONTEXT; it needs the memory for it), then resume the film.`, 413);
    }
    return { input, out };
  }

  /** @param {Response} res */
  async function failure(res) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 404 && /not found|pull/i.test(body)) return permanent(`The brain has no model "${o.model}" (${body}). With Ollama run: ollama pull ${o.model}. Then resume the film.`, 404);
    if (res.status === 401 || res.status === 403) return permanent(`The brain server refused the key (${res.status}). Check BRAIN_KEY, then resume the film.`, res.status);
    if (res.status === 404) return permanent(`The brain server has no ${api === "ollama" ? "/api/chat" : "/chat/completions"} at ${base} (404). Check BRAIN_URL${api === "openai" ? " (an OpenAI-compatible server usually ends in /v1)" : ""}, then resume the film.`, 404);
    if (res.status === 400 || res.status === 413 || res.status === 422) return permanent(`The brain server rejected the request (${res.status}): ${body}`, res.status);
    return Object.assign(new Error(`Brain server ${res.status}: ${body}`), { status: res.status });
  }

  /** @param {string} path @param {unknown} body */
  async function post(path, body) {
    /** @type {Record<string, string>} */
    const headers = { "content-type": "application/json" };
    if (o.apiKey) headers.authorization = `Bearer ${o.apiKey}`;
    for (let attempt = 1; ; attempt += 1) {
      /** @type {Response} */
      let res;
      try {
        res = await get(`${base}${path}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
      } catch (error) {
        // The machine is asleep, restarting or out of reach: wait and try again.
        if (attempt < maxAttempts) { await sleep(Math.min(60_000, 2000 * 2 ** attempt)); continue; }
        throw new Error(`The brain at ${base} could not be reached: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (res.ok) return /** @type {any} */ (await res.json());
      // Busy (another request is loading the model) or a gateway hiccup: wait and try again.
      if ((res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxAttempts) {
        const after = Number(res.headers.get("retry-after"));
        await res.body?.cancel().catch(() => {});
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(120_000, after * 1000) : Math.min(60_000, 2000 * 2 ** attempt));
        continue;
      }
      throw await failure(res);
    }
  }

  /** @param {string} url */
  async function imageData(url) {
    const res = await get(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Image ${url} returned ${res.status}.`);
    return toBase64(await res.arrayBuffer());
  }

  return {
    name: o.model,
    capabilities: { vision, webSearch: false, contextTokens, maxOutputTokens },
    price: o.price ?? FREE_PRICE,
    async call(req) {
      const { out } = budget(req);
      const system = req.system.map((b) => b.text).join("\n\n");
      if (api === "ollama") {
        /** @type {any[]} */
        const messages = [{ role: "system", content: system }];
        for (const m of req.messages) {
          /** @type {string[]} */
          const urls = [];
          const content = flatten(m.content, urls);
          messages.push(urls.length ? { role: m.role, content, images: await Promise.all(urls.map(imageData)) } : { role: m.role, content });
        }
        const data = await post("/api/chat", { model: o.model, messages, stream: false, options: { num_ctx: contextTokens, num_predict: out } });
        const text = stripThinking(String(data?.message?.content ?? ""));
        return {
          text,
          stopReason: data?.done_reason === "length" ? "max_tokens" : "end_turn",
          usage: { input_tokens: Number(data?.prompt_eval_count ?? 0), output_tokens: Number(data?.eval_count ?? 0) },
          model: String(data?.model ?? o.model),
        };
      }
      /** @type {any[]} */
      const messages = [{ role: "system", content: system }];
      for (const m of req.messages) {
        const hasImages = vision && m.content.some((b) => b.image);
        messages.push({
          role: m.role,
          content: hasImages
            ? m.content.filter((b) => b.image || b.text).map((b) => (b.image ? { type: "image_url", image_url: { url: b.image } } : { type: "text", text: b.text }))
            : flatten(m.content, []),
        });
      }
      const data = await post("/chat/completions", { model: o.model, messages, max_tokens: out, stream: false });
      const choice = data?.choices?.[0];
      const text = stripThinking(String(choice?.message?.content ?? ""));
      const finish = String(choice?.finish_reason ?? "stop");
      return {
        text,
        stopReason: finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end_turn",
        usage: { input_tokens: Number(data?.usage?.prompt_tokens ?? 0), output_tokens: Number(data?.usage?.completion_tokens ?? 0) },
        model: String(data?.model ?? o.model),
      };
    },
  };
}
