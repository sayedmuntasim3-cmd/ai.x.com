/**
 * Zupona AI Studio on Cloudflare: the static site (public/) plus the film
 * API. A film is a durable Workflow, so a 45-minute run of many long model
 * calls survives restarts and never pays twice for a finished stage.
 *
 * Routes
 *   GET  /api/health                 what is connected (no secrets shown)
 *   GET  /api/estimate?minutes=45    cost estimate before a run
 *   GET  /api/ideas?q=niche&months=12  proven topics: videos that beat their own channel   (Bearer STUDIO_TOKEN)
 *   POST /api/films                  { topic, minutes, versionId?, notes? } -> { id }   (Bearer STUDIO_TOKEN)
 *   GET  /api/films                  my films, newest first   (Bearer STUDIO_TOKEN)
 *   GET  /api/films/:id              run state: stages, usage, cost, gaps
 *   GET  /api/films/:id/files/:name  one output file (s5-C1.md, qa.json, edit-C1.json, ...)
 *   GET  /api/films/:id/page         the readable page: script, shots with clips and licences, sources, cost
 *   GET  /api/films/:id/script       the narration script for recording it yourself (one line per scene file)
 *   POST /api/films/:id/scenes/:sc   { instruction } -> re-make one scene, checked in code, with fresh footage   (Bearer STUDIO_TOKEN)
 *   POST /api/films/:id/pictures     { shot: "SC0012-1", url } -> the owner's own picture for a shot (empty url removes it); the render downloads it   (Bearer STUDIO_TOKEN)
 *   GET  /api/youtube/connect        -> { url } Google sign-in for read-only YouTube Analytics   (Bearer STUDIO_TOKEN)
 *   GET  /api/youtube/callback       Google returns here; the refresh token is kept in R2
 *   POST /api/films/:id/retention    { video } -> learn where viewers left the published film   (Bearer STUDIO_TOKEN)
 *   POST /api/films/:id/render       start the GitHub render (MP4, Shorts, thumbnails)   (Bearer STUDIO_TOKEN)
 *   POST /api/films/:id/resume       { budgetUsd? } -> continue a failed or budget-stopped film; finished stages are kept   (Bearer STUDIO_TOKEN)
 *
 * Needs (set by the owner when Cloudflare is connected):
 *   secrets ANTHROPIC_API_KEY (or, free: GEMINI_API_KEY, optional var GEMINI_MODEL), STUDIO_TOKEN; R2 bucket FILMS; Workflow FILM_RUN.
 *   Optional vars: MODEL (default claude-opus-5-5), BUDGET_USD (default 60).
 *   Optional secrets PEXELS_API_KEY, PIXABAY_API_KEY: the media step (free
 *   stock footage per shot, media-C1.json ...). Without them it is skipped.
 *   Optional GITHUB_TOKEN secret + GITHUB_REPO and SITE_URL vars: a finished
 *   film starts the "Render a film" GitHub workflow by itself (render.json).
 *   Optional YOUTUBE_API_KEY secret: the topic radar (/api/ideas), cached a day in R2.
 *   Optional GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET secrets: YouTube Analytics retention, so new films learn from published ones.
 *   Optional SMITHSONIAN_API_KEY secret (api.data.gov): Smithsonian Open Access (CC0) in the media step.
 */
import { WorkflowEntrypoint } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { mediaProviders } from "../engine/src/film-media.mjs";
import { updatePictureLinks } from "../engine/src/picture-links.mjs";
import { estimateRun, newFilm, runFilm } from "../engine/src/film-run.mjs";
import { loadFilmPage, PAGE_CSP, renderFilmPage, renderScriptPage } from "../engine/src/film-page.mjs";
import { remakeScene } from "../engine/src/scene-remake.mjs";
import MANUAL from "../prompts/1-zupona-master-engine-full.txt";
import { anthropicBatchModel, anthropicModel, permanentError, savingModel } from "./anthropic.mjs";
import { dispatchRender } from "./github.mjs";
import { geminiModel } from "./gemini.mjs";
import { listFilms } from "./films.mjs";
import { radarSearch } from "./youtube.mjs";
import { authUrl, exchangeCode, learnFromVideo, signState, verifyState } from "./youtube-analytics.mjs";
import { lessonsText } from "../engine/src/retention.mjs";

const FILE_NAME = /^[a-z0-9][a-z0-9.-]{0,60}$/i;
const TYPES = { md: "text/markdown; charset=utf-8", json: "application/json; charset=utf-8" };

/**
 * @param {any} bucket R2 bucket
 * @param {string} id
 */
function r2Store(bucket, id) {
  return {
    /** @param {string} key */
    async get(key) {
      const obj = await bucket.get(`films/${id}/${key}`);
      return obj ? obj.text() : null;
    },
    /** @param {string} key @param {string} text */
    async put(key, text) {
      await bucket.put(`films/${id}/${key}`, text);
    },
  };
}

/**
 * The status of a film's current Workflow instance (the first run, or its latest resume).
 * @param {any} env @param {string} id
 * @returns {Promise<any>}
 */
async function currentInstance(env, id) {
  try {
    const record = JSON.parse((await r2Store(env.FILMS, id).get("workflow.json")) ?? "null");
    return await (await env.FILM_RUN.get(record?.instanceId ?? id)).status();
  } catch {
    return null;
  }
}

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": TYPES.json, "cache-control": "no-store" } });
}

/** Constant-time comparison for the studio token. @param {string} a @param {string} b */
function sameToken(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The writer: Claude when its key is set, else Google Gemini (free tier) when GEMINI_API_KEY is set. @param {any} env */
function writer(env) {
  if (env.ANTHROPIC_API_KEY) return anthropicModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL || "claude-opus-5-5", baseURL: env.ANTHROPIC_BASE_URL || undefined });
  return geminiModel({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || undefined });
}
/** @param {any} env */
const hasWriter = (env) => Boolean(env.ANTHROPIC_API_KEY || env.GEMINI_API_KEY);

export class FilmRunWorkflow extends WorkflowEntrypoint {
  /** @param {any} event @param {any} step */
  async run(event, step) {
    const /** @type {any} */ env = this.env;
    const film = event.payload.film;
    const fast = writer(env);
    // Half-price mode: the writing stages go through the Batch API; batch ids live in the film's own storage.
    const model = film.saving && env.ANTHROPIC_API_KEY ? savingModel(fast, anthropicBatchModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL || "claude-opus-5-5", baseURL: env.ANTHROPIC_BASE_URL || undefined, store: r2Store(env.FILMS, film.id) })) : fast;
    // A resume may raise the budget for this film; otherwise the deployment's BUDGET_USD applies.
    const budget = Number(event.payload.budgetUsd ?? env.BUDGET_USD);
    await runFilm({
      film,
      manual: MANUAL,
      model,
      store: r2Store(env.FILMS, film.id),
      budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : 60,
      media: { providers: mediaProviders({ pexelsKey: env.PEXELS_API_KEY, pixabayKey: env.PIXABAY_API_KEY, smithsonianKey: env.SMITHSONIAN_API_KEY }) },
      // What the channel's published films taught (where viewers left and stayed), for the writers and the editor.
      lessons: { load: async () => { const o = await env.FILMS.get("channel/lessons.json"); return o ? lessonsText(JSON.parse(await o.text())) : ""; } },
      // The source desk opens every page the research cites.
      sources: { fetch: (url, init) => fetch(url, init) },
      // The market desk: proven videos on this topic (YouTube Data API, about 102 quota units, cached a day).
      market: env.YOUTUBE_API_KEY ? {
        find: async (/** @type {string} */ topic) => {
          const cache = { get: async (/** @type {string} */ k) => { const o = await env.FILMS.get(k); return o ? o.text() : null; }, put: async (/** @type {string} */ k, /** @type {string} */ t) => { await env.FILMS.put(k, t); } };
          const r = await radarSearch({ apiKey: env.YOUTUBE_API_KEY, query: topic.slice(0, 200), months: 12, cache });
          if (!r.ok) throw new Error(r.error);
          return r.picks;
        },
      } : undefined,
      channel: {
        // One channel per deployment for now; a per-client channel key comes with client accounts.
        load: async () => { const obj = await env.FILMS.get("channel/fingerprints.json"); return obj ? JSON.parse(await obj.text()) : []; },
        save: async (list) => { await env.FILMS.put("channel/fingerprints.json", JSON.stringify(list)); },
      },
      log: (line) => console.log(`[${film.id}] ${line}`),
      // A long chapter (64k output tokens, up to four continued parts) can take well over 30 minutes; a timeout would pay for it twice.
      // In half-price mode a step can wait hours for its batch: each attempt polls for up to an hour, and a retry polls the same batch again.
      step: (name, fn) => step.do(name, film.saving ? { retries: { limit: 30, delay: "1 minute", backoff: "constant" }, timeout: "1 hour" } : { retries: { limit: 2, delay: "1 minute", backoff: "exponential" }, timeout: "1 hour" }, async () => {
        try {
          return await fn();
        } catch (error) {
          const permanent = permanentError(error);
          throw permanent ? new NonRetryableError(permanent) : error;
        }
      }),
    });
    // The finished film goes straight to the renderer when GitHub is connected.
    if (env.GITHUB_TOKEN && env.GITHUB_REPO && env.SITE_URL) {
      const result = await step.do("render", async () => dispatchRender({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, filmId: film.id, site: String(env.SITE_URL).replace(/\/$/, "") }));
      await r2Store(env.FILMS, film.id).put("render.json", JSON.stringify({ ...result, at: new Date().toISOString() }, null, 1));
    }
  }
}

export default {
  /** @param {Request} request @param {any} env */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      if (url.pathname === "/api/health") {
        return json({ claude: Boolean(env.ANTHROPIC_API_KEY), gemini: Boolean(env.GEMINI_API_KEY), storage: Boolean(env.FILMS), workflow: Boolean(env.FILM_RUN), token: Boolean(env.STUDIO_TOKEN), pexels: Boolean(env.PEXELS_API_KEY), pixabay: Boolean(env.PIXABAY_API_KEY), github: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO), youtube: Boolean(env.YOUTUBE_API_KEY), smithsonian: Boolean(env.SMITHSONIAN_API_KEY), model: env.MODEL || "claude-opus-5-5" });
      }
      if (url.pathname === "/api/estimate" && request.method === "GET") {
        const minutes = Number(url.searchParams.get("minutes") ?? "45");
        if (!(minutes >= 1 && minutes <= 300)) return json({ error: "Length must be 1 to 300 minutes." }, 400);
        return json(estimateRun(Math.round(minutes * 60), env.MODEL || "claude-opus-5-5"));
      }
      if (url.pathname === "/api/ideas" && request.method === "GET") {
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first, so nobody else can spend your YouTube quota." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const cache = env.FILMS ? {
          /** @param {string} key */
          get: async (key) => { const obj = await env.FILMS.get(key); return obj ? obj.text() : null; },
          /** @param {string} key @param {string} text */
          put: async (key, text) => { await env.FILMS.put(key, text); },
        } : undefined;
        const result = await radarSearch({ apiKey: env.YOUTUBE_API_KEY, query: url.searchParams.get("q"), months: url.searchParams.get("months") ?? undefined, language: url.searchParams.get("lang") ?? undefined, cache });
        return result.ok ? json(result) : json({ error: result.error }, result.status);
      }
      if (url.pathname === "/api/films" && request.method === "GET") {
        if (!env.FILMS || !env.STUDIO_TOKEN) return json({ error: "The studio is not connected yet." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        return json({ films: await listFilms(env.FILMS) });
      }
      if (url.pathname === "/api/films" && request.method === "POST") {
        if (!hasWriter(env) || !env.FILMS || !env.FILM_RUN) return json({ error: "The studio is not connected yet (Claude API key, R2 bucket or Workflow missing)." }, 503);
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first, so nobody else can spend your credits." }, 503);
        const auth = request.headers.get("authorization") ?? "";
        if (!sameToken(auth.replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ error: "Send JSON: { topic, minutes }." }, 400);
        const id = crypto.randomUUID();
        const made = newFilm(/** @type {any} */ (body), id);
        if (!made.ok) return json({ error: made.error }, 400);
        const store = r2Store(env.FILMS, id);
        await store.put("film.json", JSON.stringify({ ...made.film, createdAt: new Date().toISOString() }, null, 1));
        await env.FILM_RUN.create({ id, params: { film: made.film } });
        return json({ id, film: made.film, estimate: estimateRun(made.film.durationSeconds, env.MODEL || "claude-opus-5-5") }, 202);
      }
      const remake = /^\/api\/films\/([0-9a-f-]{36})\/scenes\/(SC\d{4,5})$/i.exec(url.pathname);
      if (remake && request.method === "POST") {
        if (!hasWriter(env) || !env.FILMS) return json({ error: "The studio is not connected yet (Claude API key or R2 bucket missing)." }, 503);
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first, so nobody else can spend your credits." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const body = /** @type {any} */ (await request.json().catch(() => null));
        const result = await remakeScene({
          store: r2Store(env.FILMS, remake[1]),
          model: writer(env),
          manual: MANUAL,
          scene: remake[2],
          instruction: typeof body?.instruction === "string" ? body.instruction : "",
          providers: mediaProviders({ pexelsKey: env.PEXELS_API_KEY, pixabayKey: env.PIXABAY_API_KEY, smithsonianKey: env.SMITHSONIAN_API_KEY }),
        });
        return json(result, result.ok ? 200 : 422);
      }
      if (url.pathname === "/api/youtube/connect" && request.method === "GET") {
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.FILMS) return json({ error: "Connect Google first: the GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets (docs/CONNECT.md)." }, 503);
        return json({ url: authUrl({ clientId: env.GOOGLE_CLIENT_ID, redirectUri: `${url.origin}/api/youtube/callback`, state: await signState(env.STUDIO_TOKEN) }) });
      }
      if (url.pathname === "/api/youtube/callback" && request.method === "GET") {
        const page = (/** @type {string} */ msg, /** @type {number} */ status) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>YouTube</title><p style="font:18px system-ui;margin:40px">${msg}</p>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } });
        if (!env.STUDIO_TOKEN || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.FILMS) return page("The studio is not connected to Google yet.", 503);
        if (!(await verifyState(env.STUDIO_TOKEN, url.searchParams.get("state")))) return page("This sign-in did not start from your studio, or it took longer than 15 minutes. Start again from the studio.", 400);
        const code = url.searchParams.get("code");
        if (!code) return page("Google did not give access (it was refused or cancelled).", 400);
        try {
          const tokens = await exchangeCode({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${url.origin}/api/youtube/callback`, code });
          await env.FILMS.put("channel/youtube-oauth.json", JSON.stringify({ refreshToken: tokens.refreshToken, at: new Date().toISOString() }));
          return page("YouTube Analytics is connected (read-only). You can close this tab and go back to the studio.", 200);
        } catch (error) {
          return page(error instanceof Error ? error.message.replace(/[<>&]/g, "") : "Google sign-in failed.", 502);
        }
      }
      const retention = /^\/api\/films\/([0-9a-f-]{36})\/retention$/.exec(url.pathname);
      if (retention && request.method === "POST") {
        if (!env.FILMS || !env.STUDIO_TOKEN) return json({ error: "The studio is not connected yet." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const body = /** @type {any} */ (await request.json().catch(() => null));
        const channel = { get: async (/** @type {string} */ k) => { const o = await env.FILMS.get(k); return o ? o.text() : null; }, put: async (/** @type {string} */ k, /** @type {string} */ v) => { await env.FILMS.put(k, v); } };
        const result = await learnFromVideo({ store: r2Store(env.FILMS, retention[1]), channel, filmId: retention[1], video: body?.video, clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }).catch((error) => ({ ok: /** @type {const} */ (false), status: 502, error: error instanceof Error ? error.message : String(error) }));
        return result.ok ? json(result) : json({ error: result.error }, result.status);
      }
      const pictures = /^\/api\/films\/([0-9a-f-]{36})\/pictures$/.exec(url.pathname);
      if (pictures && request.method === "POST") {
        if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const store = r2Store(env.FILMS, pictures[1]);
        if ((await store.get("film.json")) === null && (await store.get("run.json")) === null) return json({ error: "Not found." }, 404);
        const body = /** @type {any} */ (await request.json().catch(() => null));
        const result = updatePictureLinks(JSON.parse((await store.get("pictures.json")) ?? "{}"), { shot: body?.shot, url: body?.url });
        if (!result.ok) return json({ error: result.error }, 400);
        await store.put("pictures.json", JSON.stringify(result.links, null, 1));
        return json({ ok: true, shot: result.shot, removed: result.removed, count: Object.keys(result.links).length });
      }
      const render = /^\/api\/films\/([0-9a-f-]{36})\/render$/.exec(url.pathname);
      if (render && request.method === "POST") {
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: "Connect GitHub first: the GITHUB_TOKEN secret and the GITHUB_REPO var (docs/CONNECT.md)." }, 503);
        const result = await dispatchRender({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, filmId: render[1], site: url.origin });
        if (env.FILMS && result.ok) await r2Store(env.FILMS, render[1]).put("render.json", JSON.stringify({ ...result, at: new Date().toISOString() }, null, 1));
        return json(result, result.ok ? 202 : 502);
      }
      const resume = /^\/api\/films\/([0-9a-f-]{36})\/resume$/.exec(url.pathname);
      if (resume && request.method === "POST") {
        if (!hasWriter(env) || !env.FILMS || !env.FILM_RUN) return json({ error: "The studio is not connected yet (Claude API key, R2 bucket or Workflow missing)." }, 503);
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const store = r2Store(env.FILMS, resume[1]);
        const saved = JSON.parse((await store.get("film.json")) ?? "null");
        if (!saved) return json({ error: "Not found." }, 404);
        const run = JSON.parse((await store.get("run.json")) ?? "null");
        if (run?.status === "done" || run?.status === "done-with-gaps") return json({ error: "This film is finished; nothing to resume." }, 409);
        const current = await currentInstance(env, resume[1]);
        if (current && ["queued", "running", "waiting", "paused", "waitingForPause"].includes(current.status)) return json({ error: "This film is still running." }, 409);
        const body = /** @type {any} */ (await request.json().catch(() => ({})));
        const asked = Number(body?.budgetUsd);
        const budgetUsd = Number.isFinite(asked) && asked >= 1 && asked <= 500 ? asked : undefined;
        const { createdAt: _created, ...film } = saved;
        const instanceId = `${resume[1]}-r${(run?.resumes ?? 0) + 1}-${Date.now().toString(36)}`;
        await env.FILM_RUN.create({ id: instanceId, params: { film, ...(budgetUsd ? { budgetUsd } : {}) } });
        await store.put("workflow.json", JSON.stringify({ instanceId, at: new Date().toISOString() }, null, 1));
        return json({ ok: true, instanceId, budgetUsd: budgetUsd ?? null }, 202);
      }
      const page = /^\/api\/films\/([0-9a-f-]{36})\/(page|script)$/.exec(url.pathname);
      if (page && request.method === "GET") {
        if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
        const data = await loadFilmPage(r2Store(env.FILMS, page[1]));
        if (!data) return json({ error: "Not found." }, 404);
        return new Response(page[2] === "script" ? renderScriptPage(data) : renderFilmPage(data), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": PAGE_CSP, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" },
        });
      }
      const m = /^\/api\/films\/([0-9a-f-]{36})(?:\/files\/([^/]+))?$/.exec(url.pathname);
      if (m && request.method === "GET") {
        if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
        const store = r2Store(env.FILMS, m[1]);
        if (m[2]) {
          if (!FILE_NAME.test(m[2])) return json({ error: "Bad file name." }, 400);
          const text = await store.get(m[2]);
          if (text === null) return json({ error: "Not found." }, 404);
          const ext = /** @type {keyof typeof TYPES} */ (m[2].split(".").pop());
          return new Response(text, { headers: { "content-type": TYPES[ext] ?? "text/plain; charset=utf-8", "cache-control": "no-store" } });
        }
        const run = (await store.get("run.json")) ?? (await store.get("film.json"));
        if (run === null) return json({ error: "Not found." }, 404);
        return json({ run: JSON.parse(run), workflow: await currentInstance(env, m[1]) });
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  },
};
