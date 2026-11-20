/**
 * Several Gemini models behind one brain, on the same key and project, within Google's rules.
 *
 * Google gives each model its own free daily quota (measured 19 Nov 2026 on the owner's key:
 * 20 requests a day per model). A film needs more than one model's day, so it stopped. The pool
 * asks Google which models this key may use (models.list), keeps the text models that write
 * (flash first, then flash-lite, newest first; never image, audio, embedding or live models), and
 * when one model's free day is used up (or it has no free quota at all) the same request goes to
 * the next. Only when every model's day is used up does the daily-limit error reach the film,
 * which then waits for midnight Pacific as before (worker/gemini.mjs dailyLimitWait).
 *
 * One key, one Google account, one project: no extra accounts, which Google's terms forbid as a
 * way around limits. GEMINI_MODEL, when set, is tried first; GEMINI_MODELS ("a,b,c") replaces the
 * discovered list.
 */
import { GEMINI_DEFAULT, geminiModel } from "./gemini.mjs";

/** Models that never write a script: images, speech, embeddings, live audio, tools. */
const NOT_A_WRITER = /(embedding|image|imagen|tts|audio|live|vision|aqa|learnlm|gemma|robotics|computer-use|native|veo|thinking-exp)/i;

/**
 * The writing models from a models.list reply, best first: flash before flash-lite, stable before
 * preview or experimental, higher version first. Pro models are left out: no free quota.
 * @param {{ name?: string, supportedGenerationMethods?: string[] }[]} models
 */
export function rankModels(models) {
  const version = (/** @type {string} */ id) => Number(/gemini-(\d+(?:\.\d+)?)/.exec(id)?.[1] ?? 0);
  return models
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => String(m.name ?? "").replace(/^models\//, ""))
    .filter((id) => /^gemini-/.test(id) && /flash/.test(id) && !NOT_A_WRITER.test(id))
    .sort((a, b) => {
      const tier = (/** @type {string} */ id) => (/lite/.test(id) ? 1 : 0) + (/(preview|exp)/.test(id) ? 2 : 0);
      return tier(a) - tier(b) || version(b) - version(a) || a.localeCompare(b);
    });
}

/**
 * @param {{ apiKey: string, model?: string, models?: string[], webSearch?: boolean, max?: number, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void> }} o
 */
export function geminiPool(o) {
  const get = o.fetch ?? fetch;
  const first = o.model || GEMINI_DEFAULT;
  /** @type {Promise<string[]> | null} */
  let order = null;
  /** Models whose free day is used up in this run. */
  const spent = new Set();
  /** @type {Map<string, ReturnType<typeof geminiModel>>} */
  const brains = new Map();
  const brain = (/** @type {string} */ id) => {
    if (!brains.has(id)) brains.set(id, geminiModel({ apiKey: o.apiKey, model: id, ...(o.webSearch === false ? { webSearch: false } : {}), ...(o.fetch ? { fetch: o.fetch } : {}), ...(o.sleep ? { sleep: o.sleep } : {}) }));
    return /** @type {ReturnType<typeof geminiModel>} */ (brains.get(id));
  };
  const models = () => (order ??= (async () => {
    /** @type {string[]} */
    let found = [];
    if (o.models?.length) found = o.models;
    else {
      try {
        const res = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": o.apiKey } });
        if (res.ok) found = rankModels(/** @type {any} */ (await res.json()).models ?? []);
      } catch { /* no list: the configured model alone, as before */ }
    }
    return [...new Set([first, ...found])].slice(0, o.max ?? 5);
  })());
  const lead = brain(first);
  return {
    ...lead,
    name: first,
    /** @param {Parameters<typeof lead.call>[0]} req */
    async call(req) {
      /** @type {any} */
      let last = null;
      // The configured model first, with no extra request; the list is asked for only once a model's day is spent.
      const tryModel = async (/** @type {string} */ id) => {
        try {
          return { done: true, reply: await brain(id).call(req) };
        } catch (error) {
          // A used-up day or no free quota on this model: the next model takes the same request.
          if (/** @type {any} */ (error)?.status === 429 && /** @type {any} */ (error)?.permanent) { spent.add(id); last = error; return { done: false, reply: null }; }
          throw error;
        }
      };
      if (!spent.has(first)) {
        const r = await tryModel(first);
        if (r.done) return r.reply;
      }
      for (const id of await models()) {
        if (spent.has(id)) continue;
        const r = await tryModel(id);
        if (r.done) return r.reply;
      }
      throw last ?? new Error("Gemini: no model could take the request.");
    },
    /** For the report: which models the pool found and which are spent. */
    async pool() { return { models: await models(), spent: [...spent] }; },
  };
}
