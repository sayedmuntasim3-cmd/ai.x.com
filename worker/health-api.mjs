/**
 * The daily health report over HTTP (free; docs/AUTOPILOT.md).
 *
 *   POST /api/health/report   the digest from .github/workflows/health-digest.yml
 *                             (GitHub's OIDC token of that workflow on main, or Bearer STUDIO_TOKEN)
 *   GET  /api/health/report   the stored digest, with today's Idea films read live from R2   (Bearer STUDIO_TOKEN)
 *
 * The digest is one JSON in R2 (channel/health-digest.json). Nothing secret is in it: film ids, counts,
 * minutes, block reasons. The studio shows it under "My films".
 */
import { buildDigest } from "../engine/src/health-digest.mjs";
import { listFilms } from "./films.mjs";
import { checkGithubOidc } from "./github-oidc.mjs";

export const DIGEST_KEY = "channel/health-digest.json";
export const AUDIENCE = "zupona-health";
const MAX_BYTES = 200_000;

/** @param {unknown} body A digest is a plain object with a time and the film counts. */
export function validDigest(body) {
  const d = /** @type {any} */ (body);
  return Boolean(d && typeof d === "object" && typeof d.generatedAt === "string" && Number.isFinite(Date.parse(d.generatedAt)) && d.films && typeof d.films === "object" && Array.isArray(d.topFixes));
}

/**
 * @param {Request} request @param {any} env @param {URL} url
 * @param {{ sameToken: (a: string, b: string) => boolean, json: (b: any, s?: number) => Response, fetch?: typeof fetch, now?: () => number }} deps
 * @returns {Promise<Response | null>}
 */
export async function handleHealthReport(request, env, url, deps) {
  if (url.pathname !== "/api/health/report") return null;
  const { sameToken, json } = deps;
  if (!env.FILMS) return json({ error: "Storage is not connected yet." }, 503);
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const owner = Boolean(env.STUDIO_TOKEN) && sameToken(bearer, env.STUDIO_TOKEN);
  if (request.method === "POST") {
    const scheduled = !owner && bearer.split(".").length === 3 && env.GITHUB_REPO && (await checkGithubOidc(bearer, { repo: env.GITHUB_REPO, workflow: "health-digest.yml", audience: AUDIENCE, now: deps.now?.() ?? Date.now(), fetch: deps.fetch }));
    if (!owner && !scheduled) return json({ error: "Wrong studio token." }, 401);
    const text = await request.text();
    if (text.length > MAX_BYTES) return json({ error: "The digest is too large." }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: "The digest is not JSON." }, 400); }
    if (!validDigest(body)) return json({ error: "That is not a health digest." }, 400);
    await env.FILMS.put(DIGEST_KEY, JSON.stringify(body));
    return json({ ok: true, generatedAt: body.generatedAt });
  }
  if (request.method === "GET") {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    const stored = await env.FILMS.get(DIGEST_KEY).then((o) => (o ? o.text() : null)).then((t) => (t ? JSON.parse(t) : null)).catch(() => null);
    const films = await listFilms(env.FILMS).catch(() => []);
    const idea = buildDigest({ runs: [], ideaFilms: films.map((f) => ({ id: f.id, topic: f.topic, status: f.status, createdAt: f.createdAt, minutes: f.minutes })), now: new Date(deps.now?.() ?? Date.now()) }).films.idea;
    if (!stored) return json({ report: null, idea, note: "No daily report yet: .github/workflows/health-digest.yml has not run, or could not reach the Worker." });
    return json({ report: { ...stored, films: { ...stored.films, idea } } });
  }
  return json({ error: "Use GET or POST." }, 405);
}
