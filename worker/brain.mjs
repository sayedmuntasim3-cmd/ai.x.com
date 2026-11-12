/**
 * The brain plug: which model writes the films, chosen from the deployment's
 * settings (Cloudflare vars and secrets, or the environment of the local
 * runner). Kept apart from worker/index.mjs so it runs and is tested in Node.
 *
 *   BRAIN           "local" | "claude" | "gemini"; unset: the first one configured, in that order
 *   local           BRAIN_URL (the owner's Ollama, llama.cpp, vLLM or LM Studio, reachable from
 *                   where the run happens), BRAIN_MODEL, optional BRAIN_KEY (secret),
 *                   BRAIN_API ("ollama" | "openai"; guessed from the URL), BRAIN_CONTEXT (tokens,
 *                   default 32768), BRAIN_MAX_OUTPUT (tokens), BRAIN_VISION ("true" when the
 *                   model can see pictures), BRAIN_PRICE_INPUT / BRAIN_PRICE_OUTPUT (US dollars per
 *                   million tokens, for a paid OpenAI-compatible service; default 0)
 *   claude          ANTHROPIC_API_KEY (secret), MODEL, ANTHROPIC_BASE_URL
 *   gemini          GEMINI_API_KEY (secret, free tier), GEMINI_MODEL
 *
 * The free brain comes first when it is set up: the owner does not want to
 * depend on paid APIs (docs/VISION.md, master list item 4). Claude and
 * Gemini are used only when their keys are set or BRAIN names them.
 */
import { anthropicModel } from "./anthropic.mjs";
import { geminiModel } from "./gemini.mjs";
import { localBrain } from "./local-brain.mjs";

/** @typedef {import("../engine/src/film-run.mjs").Model} Model */
/** @typedef {"local" | "claude" | "gemini"} BrainKind */

const KINDS = /** @type {const} */ (["local", "claude", "gemini"]);

/** @param {unknown} v */
const num = (v) => {
  const n = Number(v);
  return v !== undefined && v !== null && v !== "" && Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Which brain the settings choose, or why none can be used.
 * @param {Record<string, any>} env
 * @returns {{ ok: true, kind: BrainKind } | { ok: false, error: string }}
 */
export function chooseBrain(env) {
  const asked = String(env.BRAIN ?? "").trim().toLowerCase();
  if (asked && !KINDS.includes(/** @type {BrainKind} */ (asked))) return { ok: false, error: `BRAIN is "${asked}"; it must be local, claude or gemini.` };
  const ready = {
    local: env.BRAIN_URL && env.BRAIN_MODEL ? null : !env.BRAIN_URL ? "the local brain needs BRAIN_URL (its server address)" : "the local brain needs BRAIN_MODEL (for example qwen3:32b)",
    claude: env.ANTHROPIC_API_KEY ? null : "Claude needs the ANTHROPIC_API_KEY secret",
    gemini: env.GEMINI_API_KEY ? null : "Gemini needs the GEMINI_API_KEY secret",
  };
  if (asked) {
    const why = ready[/** @type {BrainKind} */ (asked)];
    return why ? { ok: false, error: `BRAIN is ${asked}, but ${why}.` } : { ok: true, kind: /** @type {BrainKind} */ (asked) };
  }
  for (const kind of KINDS) if (!ready[kind]) return { ok: true, kind };
  return { ok: false, error: "No brain is connected. Set up the free local brain (BRAIN_URL and BRAIN_MODEL, docs/BRAIN.md), or a GEMINI_API_KEY or ANTHROPIC_API_KEY secret." };
}

/**
 * The brain the settings choose.
 * @param {Record<string, any>} env
 * @param {{ fetch?: typeof fetch }} [o]
 * @returns {{ ok: true, kind: BrainKind, model: Model } | { ok: false, error: string }}
 */
export function brainFromEnv(env, o = {}) {
  const chosen = chooseBrain(env);
  if (!chosen.ok) return chosen;
  if (chosen.kind === "claude") return { ok: true, kind: "claude", model: anthropicModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL || "claude-opus-5-5", baseURL: env.ANTHROPIC_BASE_URL || undefined, ...(o.fetch ? { fetch: o.fetch } : {}) }) };
  if (chosen.kind === "gemini") return { ok: true, kind: "gemini", model: geminiModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined, ...(o.fetch ? { fetch: o.fetch } : {}) }) };
  const api = String(env.BRAIN_API ?? "").toLowerCase();
  const input = num(env.BRAIN_PRICE_INPUT) ?? 0;
  const output = num(env.BRAIN_PRICE_OUTPUT) ?? 0;
  return {
    ok: true,
    kind: "local",
    model: localBrain({
      url: String(env.BRAIN_URL),
      model: String(env.BRAIN_MODEL),
      api: api === "ollama" || api === "openai" ? api : undefined,
      apiKey: env.BRAIN_KEY || undefined,
      vision: String(env.BRAIN_VISION ?? "").toLowerCase() === "true",
      contextTokens: num(env.BRAIN_CONTEXT),
      maxOutputTokens: num(env.BRAIN_MAX_OUTPUT),
      price: { input, output, cacheRead: input, cacheWrite: input },
      ...(o.fetch ? { fetch: o.fetch } : {}),
    }),
  };
}

/**
 * What /api/health shows about the brain: its kind, model and what it can
 * do. Never a key, and never the local brain's address.
 * @param {Record<string, any>} env
 */
export function brainHealth(env) {
  const b = brainFromEnv(env);
  if (!b.ok) return { connected: false, error: b.error };
  const caps = b.model.capabilities ?? {};
  const free = b.model.price?.input === 0 && b.model.price?.output === 0;
  return {
    connected: true,
    kind: b.kind,
    model: b.model.name,
    seesPictures: caps.vision !== false,
    searchesWeb: caps.webSearch !== false,
    ...(caps.contextTokens ? { contextTokens: caps.contextTokens } : {}),
    pricing: b.kind === "local" ? (free ? "free (runs on your own machine)" : "metered at BRAIN_PRICE_INPUT / BRAIN_PRICE_OUTPUT") : b.kind === "gemini" ? "free tier (daily limits apply)" : "paid per token (Claude API)",
  };
}
