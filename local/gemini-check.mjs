#!/usr/bin/env node
/**
 * Pre-run check of the Gemini model (Phase 0), before any generation:
 * models.get only (it generates nothing), to confirm the model exists for
 * this key's project and to record the limits the API itself reports.
 * The key comes from the environment (in the cloud, injected by the proxy;
 * GEMINI_API_KEY then holds a dummy). Nothing is printed of the key.
 *
 *   GEMINI_API_KEY=injected-by-proxy node local/gemini-check.mjs [--model gemini-3.8-flash]
 *
 * Exit 0 only when the model is listed, supports generateContent, and allows
 * at least 32,768 output and 128,000 input tokens.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const PHASE0_MODEL = "gemini-3.8-flash";
export const NEEDS = Object.freeze({ output: 32_768, input: 128_000 });

/**
 * @param {{ apiKey: string, model?: string, fetch?: typeof fetch }} o
 * @returns {Promise<{ ok: boolean, model: string, status: number, problems: string[], info?: Record<string, unknown> }>}
 */
export async function checkGeminiModel(o) {
  const model = o.model ?? PHASE0_MODEL;
  if (!/^[a-z0-9.-]+$/.test(model)) return { ok: false, model, status: 0, problems: [`not a model id: ${model}`] };
  const get = o.fetch ?? fetch;
  const res = await get(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, { headers: { "x-goog-api-key": o.apiKey } });
  const body = await res.text();
  if (!res.ok) {
    /** @type {any} */
    let err = {};
    try { err = JSON.parse(body).error ?? {}; } catch { /* not JSON */ }
    const why = res.status === 404 ? "the model is not available to this project" : res.status === 403 ? "this project or key may not use the model (or the API is not enabled)" : res.status === 400 ? "the key or request was refused" : res.status === 429 ? "rate limited" : "error";
    return { ok: false, model, status: res.status, problems: [`HTTP ${res.status}${err.status ? ` ${err.status}` : ""}: ${why}${err.message ? ` (${String(err.message).slice(0, 200)})` : ""}`] };
  }
  /** @type {any} */
  const m = JSON.parse(body);
  const info = { name: m.name, version: m.version, displayName: m.displayName, inputTokenLimit: m.inputTokenLimit, outputTokenLimit: m.outputTokenLimit, supportedGenerationMethods: m.supportedGenerationMethods, thinking: m.thinking };
  const problems = [];
  if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) problems.push("generateContent is not supported");
  if (!(Number(m.outputTokenLimit) >= NEEDS.output)) problems.push(`output limit ${m.outputTokenLimit} is below ${NEEDS.output}`);
  if (!(Number(m.inputTokenLimit) >= NEEDS.input)) problems.push(`input limit ${m.inputTokenLimit} is below ${NEEDS.input}`);
  return { ok: problems.length === 0, model, status: res.status, problems, info };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { model: { type: "string" } } });
  if (!process.env.GEMINI_API_KEY) { console.error("GEMINI_API_KEY is not set (in the cloud, any dummy value; the proxy adds the real key)."); process.exit(1); }
  const r = await checkGeminiModel({ apiKey: process.env.GEMINI_API_KEY, model: values.model });
  console.log(JSON.stringify({ mode: "live", date: new Date().toISOString(), ...r }, null, 2));
  process.exitCode = r.ok ? 0 : 1;
}
