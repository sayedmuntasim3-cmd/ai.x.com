/**
 * The visual library's API (the landing's Library section, brought in from PR #4):
 *   GET /api/media/sources            every archive and whether it is switched on
 *   GET /api/media/search?q=...       ranked open-licence pictures from every archive (JSON)
 *   GET /api/media/search?q=...&stream=1   the same, one NDJSON line per archive as it answers
 * Query: q, topic, rights (no-attribution|attribution|share-alike), orientation, min, sources, per, limit.
 * The archives, licence rules and ranking are the engine's own (engine/src/open-archives-lib.mjs),
 * the same code the film's footage search uses: no second copy. Results are cached at the edge
 * for half an hour, so a repeated search costs no requests to the archives.
 */
import { searchMedia, sourceStates, streamMedia } from "../engine/src/open-archives-lib.mjs";

const CACHE_SECONDS = 1800;

/** @param {unknown} body @param {number} [status] @param {Record<string, string>} [headers] */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

/** NARA's terms forbid caching its results: an answer holding any is never stored. @param {string} text */
const noStore = (text) => /"source":"nara"/.test(text);

/** Only the string values of the Worker environment (vars and secrets), never bindings. @param {Record<string, unknown>} env */
function stringEnv(env) {
  return /** @type {Record<string, string>} */ (Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === "string")));
}

/** @param {URL} url @param {Record<string, string>} env */
export function searchOptions(url, env) {
  const p = url.searchParams;
  const num = (/** @type {string} */ key) => (p.has(key) ? Number(p.get(key)) : undefined);
  return {
    query: (p.get("q") ?? "").slice(0, 200),
    topic: p.get("topic") ?? undefined,
    rights: p.get("rights") ?? env.MEDIA_DEFAULT_RIGHTS ?? undefined,
    orientation: p.get("orientation") ?? undefined,
    minSize: num("min"),
    sources: p.get("sources")?.split(",").map((s) => s.trim()).filter(Boolean),
    perSource: num("per"),
    limit: num("limit"),
  };
}

/**
 * loc.gov refuses Cloudflare Worker addresses ("not authorised" in a few ms) but answers the film runner
 * (GitHub Actions, film-media.mjs). Report that honestly as "runner-only", not as a broken archive.
 * @param {any} node
 */
export function markRunnerOnly(node) {
  if (Array.isArray(node)) { node.forEach(markRunnerOnly); return node; }
  if (node && typeof node === "object") {
    if (node.id === "loc" && node.status === "error" && /not authorised/i.test(String(node.error ?? ""))) {
      node.status = "runner-only";
      node.error = undefined;
      node.note = "Library of Congress blocks Worker addresses; films fetch it from the runner.";
    } else for (const v of Object.values(node)) markRunnerOnly(v);
  }
  return node;
}

/** @param {string} line */
const runnerOnlyLine = (line) => { try { return JSON.stringify(markRunnerOnly(JSON.parse(line))); } catch { return line; } };

/**
 * The media routes, or null for any other path.
 * @param {Request} request @param {URL} url @param {Record<string, unknown>} env
 * @param {{ cache?: { match(r: Request): Promise<Response | undefined>, put(r: Request, res: Response): Promise<void> } | null, waitUntil?: (p: Promise<unknown>) => void, search?: typeof searchMedia, stream?: typeof streamMedia }} [deps]
 * @returns {Promise<Response | null>}
 */
export async function handleMedia(request, url, env, deps = {}) {
  if (!url.pathname.startsWith("/api/media/") || request.method !== "GET") return null;
  const menv = stringEnv(env);

  if (url.pathname === "/api/media/sources") {
    const sources = sourceStates(menv).map((/** @type {any} */ s) => ({ id: s.id, name: s.name, homepage: s.homepage, group: s.group, holds: s.holds, scale: s.scale, topics: s.topics, enabled: s.enabled, needsKey: s.missingKeys.length > 0, signup: s.missingKeys.length ? s.signup : undefined }));
    return json({ sources, enabled: sources.filter((s) => s.enabled).length }, 200, { "cache-control": "public, max-age=300" });
  }

  if (url.pathname !== "/api/media/search") return null;
  const options = searchOptions(url, menv);
  if (options.query.trim().length < 2) return json({ error: "Add a search query with ?q=" }, 400);
  const stream = url.searchParams.get("stream") === "1";

  // One cache entry per distinct search.
  const key = new URL("/api/media/search/__cache", url.origin);
  key.searchParams.set("v", "1");
  key.searchParams.set("s", stream ? "1" : "0");
  for (const [k, v] of Object.entries(options)) if (v !== undefined) key.searchParams.set(k, Array.isArray(v) ? [...v].sort().join(",") : String(v));
  const cacheKey = new Request(key.toString());
  const cache = deps.cache === undefined ? /** @type {any} */ (globalThis).caches?.default ?? null : deps.cache;
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

  const headers = { "cache-control": `public, max-age=${CACHE_SECONDS}`, "x-content-type-options": "nosniff" };
  const keep = (/** @type {string} */ body, /** @type {string} */ type) => {
    if (cache && deps.waitUntil) deps.waitUntil(cache.put(cacheKey, new Response(body, { headers: { "content-type": type, ...headers } })));
  };
  if (!stream) {
    const result = markRunnerOnly(await (deps.search ?? searchMedia)(/** @type {any} */ (options), menv));
    const body = JSON.stringify(result);
    if (result.sources?.some((/** @type {any} */ s) => s.status === "ok" || s.status === "empty") && !noStore(body)) keep(body, "application/json; charset=utf-8");
    return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", ...headers } });
  }
  let pending = "";
  const relabel = new TransformStream({
    transform(chunk, c) {
      pending += new TextDecoder().decode(chunk, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const l of lines) c.enqueue(new TextEncoder().encode(`${runnerOnlyLine(l)}\n`));
    },
    flush(c) { if (pending) c.enqueue(new TextEncoder().encode(runnerOnlyLine(pending))); }
  });
  const [toClient, toCache] = /** @type {ReadableStream} */ ((deps.stream ?? streamMedia)(/** @type {any} */ (options), menv)).pipeThrough(relabel).tee();
  if (cache && deps.waitUntil) {
    deps.waitUntil(new Response(toCache).text().then((text) => { if (/"status":"(ok|empty)"/.test(text) && !noStore(text)) keep(text, "application/x-ndjson; charset=utf-8"); }));
  } else {
    toCache.cancel().catch(() => {});
  }
  return new Response(toClient, { headers: { "content-type": "application/x-ndjson; charset=utf-8", ...headers } });
}
