/**
 * Gemini watches one public YouTube film and measures it (free: the owner's Gemini key, 20 requests a day per model).
 *
 *   POST /api/youtube-watch   { videoId }  -> the measured record, stored in R2 at research/youtube-watch/<videoId>.json
 *   GET  /api/youtube-watch                -> { watched: [ids], stoppedToday } ; ?all=1 adds every stored record
 *
 * Auth: Bearer STUDIO_TOKEN, or GitHub's OIDC token of .github/workflows/youtube-watch.yml on main (no stored secret).
 * Quota: the first 429 or quota answer from every model writes a stop-for-the-day marker (Pacific date, the day
 * Gemini resets on) and the route refuses until tomorrow. There is no retry loop: one request per model, at most two.
 */
import { WATCH_MODELS, buildWatchRequest, isVideoId, validateWatch } from "../engine/src/youtube-watch.mjs";
import { checkGithubOidc } from "./github-oidc.mjs";

export const WATCH_PREFIX = "research/youtube-watch/";
export const STOP_KEY = `${WATCH_PREFIX}_stop.json`;
export const AUDIENCE = "zupona-youtube-watch";

/** The Pacific calendar date of a time (Gemini's daily quota resets at midnight Pacific). @param {number} ms */
export function pacificDay(ms) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

/** @param {number} status @param {string} body */
export const isQuotaAnswer = (status, body) => status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(body);

/**
 * @param {Request} request @param {any} env @param {URL} url
 * @param {{ sameToken: (a: string, b: string) => boolean, json: (b: any, s?: number) => Response, fetch?: typeof fetch, now?: () => number }} deps
 * @returns {Promise<Response | null>}
 */
export async function handleYoutubeWatch(request, env, url, deps) {
  if (url.pathname !== "/api/youtube-watch") return null;
  const { sameToken, json } = deps;
  const get = deps.fetch ?? fetch;
  const now = deps.now?.() ?? Date.now();
  if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const owner = Boolean(env.STUDIO_TOKEN) && sameToken(bearer, env.STUDIO_TOKEN);
  const scheduled = !owner && bearer.split(".").length === 3 && env.GITHUB_REPO && (await checkGithubOidc(bearer, { repo: env.GITHUB_REPO, workflow: "youtube-watch.yml", audience: AUDIENCE, now, fetch: deps.fetch }));
  if (!owner && !scheduled) return json({ error: "Wrong studio token." }, 401);

  const today = pacificDay(now);
  const stopped = await env.FILMS.get(STOP_KEY).then((o) => (o ? o.text() : null)).then((t) => (t ? JSON.parse(t) : null)).catch(() => null);
  const stoppedToday = Boolean(stopped && stopped.day === today);

  if (request.method === "GET") {
    if (url.searchParams.get("models") === "1") {
      // Which models the key can call right now (a list request: no generation quota).
      const r = await get("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": env.GEMINI_API_KEY ?? "" } });
      const list = r.ok ? ((await r.json()).models ?? []) : [];
      return json({ models: list.filter((/** @type {any} */ m) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((/** @type {any} */ m) => String(m.name).replace(/^models\//, "")) });
    }
    const ids = [];
    let cursor;
    do {
      const page = await env.FILMS.list({ prefix: WATCH_PREFIX, cursor, limit: 1000 });
      for (const o of page.objects ?? []) { const m = /\/([A-Za-z0-9_-]{11})\.json$/.exec(o.key); if (m) ids.push(m[1]); }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    if (url.searchParams.get("all") !== "1") return json({ watched: ids, stoppedToday });
    const records = [];
    for (const id of ids) { const o = await env.FILMS.get(`${WATCH_PREFIX}${id}.json`); if (o) try { records.push(JSON.parse(await o.text())); } catch { /* skip */ } }
    return json({ watched: ids, stoppedToday, records });
  }
  if (request.method !== "POST") return json({ error: "Use GET or POST." }, 405);

  /** @type {any} */ let body;
  try { body = await request.json(); } catch { return json({ error: "Send JSON: { videoId }." }, 400); }
  const videoId = body?.videoId;
  if (!isVideoId(videoId)) return json({ error: "videoId must be an 11-character YouTube id." }, 400);
  const key = `${WATCH_PREFIX}${videoId}.json`;
  const have = await env.FILMS.get(key);
  if (have) return json({ ok: true, cached: true, record: JSON.parse(await have.text()) });
  if (stoppedToday) return json({ error: "Gemini's daily quota ran out; no more watching today.", stoppedToday: true }, 429);
  if (!env.GEMINI_API_KEY) return json({ error: "Gemini needs the GEMINI_API_KEY secret." }, 503);

  const sent = JSON.stringify(buildWatchRequest(videoId));
  let lastError = "";
  let notFound = 0;
  const models = String(env.WATCH_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  const tryModels = models.length ? models : WATCH_MODELS;
  for (const model of tryModels) {
    let res;
    try {
      res = await get(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: sent });
    } catch (e) { lastError = `${model}: network error`; continue; }
    const text = await res.text();
    if (isQuotaAnswer(res.status, text)) { lastError = `${model}: quota`; continue; } // next model has its own daily quota
    if (res.status === 404) { lastError = `${model}: not available`; notFound++; continue; } // retired model: try the next one
    if (!res.ok) return json({ error: `Gemini ${model} answered ${res.status}: ${text.slice(0, 300)}` }, 502);
    let raw;
    try { raw = JSON.parse(JSON.parse(text).candidates?.[0]?.content?.parts?.map((/** @type {any} */ p) => p.text ?? "").join("") ?? ""); } catch { return json({ error: `${model} did not return the JSON.` }, 422); }
    const checked = validateWatch(raw);
    if (!checked.ok) return json({ error: "The answer failed the check; not stored.", problems: checked.errors, model }, 422);
    const record = { videoId, watchedAt: new Date(now).toISOString(), model, source: "gemini-video", ...checked.value };
    await env.FILMS.put(key, JSON.stringify(record));
    return json({ ok: true, record });
  }
  if (notFound === tryModels.length) return json({ error: `No watch model is available (${lastError}). Set WATCH_MODELS or fix WATCH_MODELS in engine/src/youtube-watch.mjs.` }, 502);
  await env.FILMS.put(STOP_KEY, JSON.stringify({ day: today, at: new Date(now).toISOString(), why: lastError }));
  return json({ error: `Gemini quota is used up (${lastError}). Stopped for the day (Pacific).`, stoppedToday: true }, 429);
}
