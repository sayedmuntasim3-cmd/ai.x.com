/**
 * Zupona AI Studio on Cloudflare: the static site (public/) plus the film
 * API. A film is a durable Workflow, so a 45-minute run of many long model
 * calls survives restarts and never pays twice for a finished stage.
 *
 * Routes
 *   GET  /api/health                 what is connected (no secrets shown)
 *   GET  /api/estimate?minutes=45    cost estimate before a run
 *   POST /api/films                  { topic, minutes, versionId?, notes? } -> { id }   (Bearer STUDIO_TOKEN)
 *   GET  /api/films                  my films, newest first   (Bearer STUDIO_TOKEN)
 *   GET  /api/films/:id              run state: stages, usage, cost, gaps
 *   GET  /api/films/:id/files/:name  one output file (s5-C1.md, qa.json, ...)
 *   GET  /api/films/:id/page         the readable page: script, shots with clips and licences, sources, cost
 *   POST /api/films/:id/scenes/:sc   { instruction } -> re-make one scene, checked in code, with fresh footage   (Bearer STUDIO_TOKEN)
 *   POST /api/films/:id/render       start the GitHub render (MP4, Shorts, thumbnails)   (Bearer STUDIO_TOKEN)
 *
 * Needs (set by the owner when Cloudflare is connected):
 *   secrets ANTHROPIC_API_KEY, STUDIO_TOKEN; R2 bucket FILMS; Workflow FILM_RUN.
 *   Optional vars: MODEL (default claude-opus-5-5), BUDGET_USD (default 60).
 *   Optional secrets PEXELS_API_KEY, PIXABAY_API_KEY: the media step (free
 *   stock footage per shot, media-C1.json ...). Without them it is skipped.
 *   Optional GITHUB_TOKEN secret + GITHUB_REPO and SITE_URL vars: a finished
 *   film starts the "Render a film" GitHub workflow by itself (render.json).
 */
import { WorkflowEntrypoint } from "cloudflare:workers";
import { mediaProviders } from "../engine/src/film-media.mjs";
import { estimateRun, newFilm, runFilm } from "../engine/src/film-run.mjs";
import { loadFilmPage, PAGE_CSP, renderFilmPage } from "../engine/src/film-page.mjs";
import { remakeScene } from "../engine/src/scene-remake.mjs";
import MANUAL from "../prompts/1-zupona-master-engine-full.txt";
import { anthropicModel } from "./anthropic.mjs";
import { dispatchRender } from "./github.mjs";
import { listFilms } from "./films.mjs";

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

export class FilmRunWorkflow extends WorkflowEntrypoint {
  /** @param {any} event @param {any} step */
  async run(event, step) {
    const /** @type {any} */ env = this.env;
    const film = event.payload.film;
    const model = anthropicModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL || "claude-opus-5-5" });
    const budget = Number(env.BUDGET_USD);
    await runFilm({
      film,
      manual: MANUAL,
      model,
      store: r2Store(env.FILMS, film.id),
      budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : 60,
      media: { providers: mediaProviders({ pexelsKey: env.PEXELS_API_KEY, pixabayKey: env.PIXABAY_API_KEY }) },
      channel: {
        // One channel per deployment for now; a per-client channel key comes with client accounts.
        load: async () => { const obj = await env.FILMS.get("channel/fingerprints.json"); return obj ? JSON.parse(await obj.text()) : []; },
        save: async (list) => { await env.FILMS.put("channel/fingerprints.json", JSON.stringify(list)); },
      },
      log: (line) => console.log(`[${film.id}] ${line}`),
      step: (name, fn) => step.do(name, { retries: { limit: 2, delay: "1 minute", backoff: "exponential" }, timeout: "30 minutes" }, fn),
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
        return json({ claude: Boolean(env.ANTHROPIC_API_KEY), storage: Boolean(env.FILMS), workflow: Boolean(env.FILM_RUN), token: Boolean(env.STUDIO_TOKEN), pexels: Boolean(env.PEXELS_API_KEY), pixabay: Boolean(env.PIXABAY_API_KEY), github: Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO), model: env.MODEL || "claude-opus-5-5" });
      }
      if (url.pathname === "/api/estimate" && request.method === "GET") {
        const minutes = Number(url.searchParams.get("minutes") ?? "45");
        if (!(minutes >= 1 && minutes <= 300)) return json({ error: "Length must be 1 to 300 minutes." }, 400);
        return json(estimateRun(Math.round(minutes * 60), env.MODEL || "claude-opus-5-5"));
      }
      if (url.pathname === "/api/films" && request.method === "GET") {
        if (!env.FILMS || !env.STUDIO_TOKEN) return json({ error: "The studio is not connected yet." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        return json({ films: await listFilms(env.FILMS) });
      }
      if (url.pathname === "/api/films" && request.method === "POST") {
        if (!env.ANTHROPIC_API_KEY || !env.FILMS || !env.FILM_RUN) return json({ error: "The studio is not connected yet (Claude API key, R2 bucket or Workflow missing)." }, 503);
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
        if (!env.ANTHROPIC_API_KEY || !env.FILMS) return json({ error: "The studio is not connected yet (Claude API key or R2 bucket missing)." }, 503);
        if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first, so nobody else can spend your credits." }, 503);
        if (!sameToken((request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""), env.STUDIO_TOKEN)) return json({ error: "Wrong studio token." }, 401);
        const body = /** @type {any} */ (await request.json().catch(() => null));
        const result = await remakeScene({
          store: r2Store(env.FILMS, remake[1]),
          model: anthropicModel({ apiKey: env.ANTHROPIC_API_KEY, model: env.MODEL || "claude-opus-5-5" }),
          manual: MANUAL,
          scene: remake[2],
          instruction: typeof body?.instruction === "string" ? body.instruction : "",
          providers: mediaProviders({ pexelsKey: env.PEXELS_API_KEY, pixabayKey: env.PIXABAY_API_KEY }),
        });
        return json(result, result.ok ? 200 : 422);
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
      const page = /^\/api\/films\/([0-9a-f-]{36})\/page$/.exec(url.pathname);
      if (page && request.method === "GET") {
        if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
        const data = await loadFilmPage(r2Store(env.FILMS, page[1]));
        if (!data) return json({ error: "Not found." }, 404);
        return new Response(renderFilmPage(data), {
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
        /** @type {unknown} */
        let workflow = null;
        try { workflow = await (await env.FILM_RUN.get(m[1])).status(); } catch { workflow = null; }
        return json({ run: JSON.parse(run), workflow });
      }
      return json({ error: "Not found." }, 404);
    } catch (error) {
      console.error(error);
      return json({ error: "Something went wrong on the server." }, 500);
    }
  },
};
