// Cloudflare Worker for ai.zupona.com. Static files in ../public are served by Workers Static
// Assets before this code runs; only requests no file matches reach the Worker, so the site
// itself costs nothing extra. The Worker adds the media search API:
//
//   GET  /api/media/search?q=snow+leopard&topic=nature   ranked results from every source (JSON)
//   GET  /api/media/search?q=...&stream=1                 the same, streamed as NDJSON per source
//   GET  /api/media/sources                               every source and whether it is switched on
//   POST /api/media/track  {"url": "<downloadTrackingUrl>"} Unsplash download ping when a photo is used
//
// Query parameters: q, topic (nature|ocean|space|history|science|culture),
// rights (no-attribution|attribution|share-alike), orientation (any|landscape|portrait),
// min (smallest long edge in px), sources (comma-separated ids), per, limit.

import {
  normaliseOptions,
  searchMedia,
  sourceStates,
  streamMedia,
  type MediaEnv,
  type Orientation,
  type RightsLevel,
  type SearchOptions,
  type Topic,
} from "../src/media";

type Fetcher = { fetch(request: Request): Promise<Response> };
type RateLimiter = { limit(options: { key: string }): Promise<{ success: boolean }> };
type Env = { ASSETS: Fetcher; MEDIA_RATE_LIMITER?: RateLimiter } & Record<string, unknown>;
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };
type EdgeCache = { match(request: Request): Promise<Response | undefined>; put(request: Request, response: Response): Promise<void> };

/** Results stay fresh for half an hour; archives change slowly. */
const CACHE_SECONDS = 1800;

function edgeCache(): EdgeCache | null {
  const store = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return store?.default ?? null;
}

/** Only the string values of the Worker environment (vars and secrets), never bindings. */
function mediaEnv(env: Env): MediaEnv {
  return Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === "string")) as MediaEnv;
}

function corsHeaders(request: Request, env: MediaEnv): Record<string, string> {
  const origin = request.headers.get("Origin");
  if (!origin) return {};
  const allowed = (env.MEDIA_ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (!allowed.includes(origin) && !allowed.includes("*")) return {};
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
}

function parseOptions(url: URL, env: MediaEnv): SearchOptions {
  const p = url.searchParams;
  const num = (key: string) => (p.has(key) ? Number(p.get(key)) : undefined);
  return {
    query: p.get("q") ?? "",
    topic: (p.get("topic") ?? undefined) as Topic | undefined,
    rights: (p.get("rights") ?? env.MEDIA_DEFAULT_RIGHTS) as RightsLevel | undefined,
    orientation: (p.get("orientation") ?? undefined) as Orientation | undefined,
    minSize: num("min"),
    sources: p.get("sources")?.split(",").map((s) => s.trim()).filter(Boolean),
    perSource: num("per"),
    limit: num("limit"),
  };
}

async function search(request: Request, url: URL, env: Env, ctx: ExecutionContext, menv: MediaEnv, cors: Record<string, string>) {
  const options = parseOptions(url, menv);
  const opts = normaliseOptions(options);
  if (opts.query.length < 2) return json({ error: "Add a search query with ?q=" }, 400, cors);

  if (env.MEDIA_RATE_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.MEDIA_RATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many searches. Try again in a minute." }, 429, { ...cors, "Retry-After": "60" });
  }

  const stream = url.searchParams.get("stream") === "1";
  // One cache entry per distinct, normalised search.
  const key = new URL("/api/media/search/__cache", url.origin);
  key.searchParams.set("v", "1");
  key.searchParams.set("s", stream ? "1" : "0");
  for (const [k, v] of Object.entries(opts)) if (v !== undefined) key.searchParams.set(k, Array.isArray(v) ? [...v].sort().join(",") : String(v));
  const cacheKey = new Request(key.toString());
  const cache = edgeCache();

  const cached = await cache?.match(cacheKey);
  if (cached) {
    const headers = new Headers(cached.headers);
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    headers.set("X-Media-Cache", "hit");
    return new Response(cached.body, { status: cached.status, headers });
  }

  const headers = {
    ...cors,
    "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    "X-Media-Cache": "miss",
  };

  if (!stream) {
    const result = await searchMedia(options, menv);
    const body = JSON.stringify(result);
    const answered = result.sources.some((s) => s.status === "ok" || s.status === "empty");
    if (cache && answered) {
      ctx.waitUntil(cache.put(cacheKey, new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } })));
    }
    return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8", ...headers } });
  }

  // Stream to the visitor and keep a copy for the cache once every source has answered.
  const [toClient, toCache] = streamMedia(options, menv).tee();
  if (cache) {
    ctx.waitUntil(
      new Response(toCache).text().then((text) => {
        if (!/"status":"(ok|empty)"/.test(text)) return;
        return cache.put(cacheKey, new Response(text, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": `public, max-age=${CACHE_SECONDS}` } }));
      }),
    );
  } else {
    toCache.cancel().catch(() => {});
  }
  return new Response(toClient, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "X-Content-Type-Options": "nosniff", ...headers } });
}

async function track(request: Request, menv: MediaEnv, cors: Record<string, string>) {
  const body = (await request.json().catch(() => null)) as { url?: string } | null;
  let target: URL | null = null;
  try {
    target = body?.url ? new URL(body.url) : null;
  } catch {
    target = null;
  }
  // Only Unsplash's own download endpoint, so this cannot be used to make the Worker fetch anything else.
  if (!target || target.origin !== "https://api.unsplash.com" || !/^\/photos\/[\w-]+\/download$/.test(target.pathname)) {
    return json({ error: "Expected an Unsplash downloadTrackingUrl" }, 400, cors);
  }
  if (!menv.UNSPLASH_ACCESS_KEY) return json({ error: "Unsplash is not configured" }, 501, cors);
  const res = await fetch(target.toString(), { headers: { Authorization: `Client-ID ${menv.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } });
  return new Response(null, { status: res.ok ? 204 : 502, headers: cors });
}

async function api(request: Request, url: URL, env: Env, ctx: ExecutionContext) {
  const menv = mediaEnv(env);
  const cors = corsHeaders(request, menv);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (url.pathname === "/api/media/search" && request.method === "GET") return search(request, url, env, ctx, menv, cors);

  if (url.pathname === "/api/media/sources" && request.method === "GET") {
    const sources = sourceStates(menv).map(({ id, name, homepage, group, holds, scale, topics, enabled, missingKeys, signup }) => ({
      id,
      name,
      homepage,
      group,
      holds,
      scale,
      topics,
      enabled,
      needsKey: missingKeys.length > 0,
      signup: missingKeys.length ? signup : undefined,
    }));
    return json({ sources, enabled: sources.filter((s) => s.enabled).length }, 200, { ...cors, "Cache-Control": "public, max-age=300" });
  }

  if (url.pathname === "/api/media/track" && request.method === "POST") return track(request, menv, cors);

  return json({ error: "Not found" }, 404, cors);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/media/")) {
      try {
        return await api(request, url, env, ctx);
      } catch (err) {
        console.error("media api error", err);
        return json({ error: "Something went wrong while searching. Please try again." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
