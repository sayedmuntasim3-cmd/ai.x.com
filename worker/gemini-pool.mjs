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
 * @param {{ apiKey: string, model?: string, models?: string[], webSearch?: boolean, max?: number, budget?: number, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void> }} o
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
  // The requests of the call in progress. A Cloudflare Worker may make only 50 requests per invocation
  // (free plan): a pool that let each model retry six times on a busy answer went past it ("Too many
  // subrequests", film 94b951c2, 20 Nov 2026). So a call has a budget, a model that answers "busy" twice
  // in a row hands over to the next, and what each model answered goes into the error.
  const call = { requests: 0, busy: new Map(), tried: /** @type {string[]} */ ([]) };
  const budget = o.budget ?? 30;
  const guarded = (/** @type {string} */ id) => /** @type {typeof fetch} */ (async (url, init) => {
    if (call.requests >= budget) throw Object.assign(new Error(`Gemini pool: ${budget} requests in one call; tried ${call.tried.join(", ")}`), { status: 0 });
    call.requests += 1;
    const res = await get(url, init);
    if (res.status === 429) {
      const n = (call.busy.get(id) ?? 0) + 1;
      call.busy.set(id, n);
      // A daily or zero quota is final at once (gemini.mjs reads it); a busy answer twice is enough for this call.
      if (n >= 2) {
        const text = await res.clone().text().catch(() => "");
        if (!/PerDay|quotaValue"?\s*:\s*"?0\b/.test(text)) throw Object.assign(new Error(`Gemini ${id} is busy (429 twice)`), { status: 429, busy: true });
      }
    } else call.busy.delete(id);
    return res;
  });
  const brain = (/** @type {string} */ id) => {
    if (!brains.has(id)) brains.set(id, geminiModel({ apiKey: o.apiKey, model: id, fetch: guarded(id), ...(o.webSearch === false ? { webSearch: false } : {}), ...(o.sleep ? { sleep: o.sleep } : {}) }));
    return /** @type {ReturnType<typeof geminiModel>} */ (brains.get(id));
  };
  const models = () => (order ??= (async () => {
    /** @type {string[]} */
    let found = [];
    if (o.models?.length) found = o.models;
    else {
      try {
        call.requests += 1;
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
      call.requests = 0;
      call.busy.clear();
      call.tried = [];
      /** @type {any[]} */
      const busy = [];
      /** @type {any[]} */
      const gone = [];
      // The configured model first, with no extra request; the list is asked for only once a model's day is spent.
      const tryModel = async (/** @type {string} */ id) => {
        try {
          return { done: true, reply: await brain(id).call(req) };
        } catch (error) {
          const e = /** @type {any} */ (error);
          // A used-up day or no free quota on this model: spent for this run, the next model takes the request.
          if (e?.status === 429 && e?.permanent) { spent.add(id); last = e; call.tried.push(`${id} (day used up)`); return { done: false, reply: null }; }
          // Listed by Google but closed to this key (404 "no longer available to new users", gemini-2.5-flash,
          // film 70577b9b s7, 20 Nov 2026): never usable in this run, the next model takes the request.
          if (e?.status === 404 && id !== first) { spent.add(id); gone.push(e); call.tried.push(`${id} (not available)`); return { done: false, reply: null }; }
          // Busy right now: the next model takes the request; this one may be asked again by a later call.
          if (e?.status === 429 && e?.busy) { busy.push(e); call.tried.push(`${id} (busy)`); return { done: false, reply: null }; }
          throw error;
        }
      };
      if (!spent.has(first)) {
        const r = await tryModel(first);
        if (r.done) return r.reply;
      }
      for (const id of await models()) {
        if (spent.has(id) || busy.some((e) => e.message.includes(` ${id} `))) continue;
        const r = await tryModel(id);
        if (r.done) return r.reply;
      }
      // Every day used up: the daily-limit error, so the film waits for midnight Pacific. Otherwise busy models:
      // a retryable error naming what each model answered.
      if (last && !busy.length) throw last;
      if (busy.length) throw Object.assign(new Error(`Gemini: every model was busy or out of its day; tried ${call.tried.join(", ")}`), { status: 429 });
      throw last ?? gone[0] ?? new Error("Gemini: no model could take the request.");
    },
    /** For the report: which models the pool found and which are spent. */
    async pool() { return { models: await models(), spent: [...spent] }; },
  };
}
