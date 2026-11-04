/**
 * The media step of a film run: for every stock shot in an S5 chapter,
 * search Pexels and Pixabay with the scene's own queries (through
 * fetchShotMedia, so rate limits, timeouts and the licence filter are the
 * shared ones), keep only free-licence items with their licence record, and
 * never use one clip twice within 10 minutes of film time. The result is one
 * media-C1.json ... per chapter.
 *
 * Pure ES module with injected fetch, so it runs in the Worker and in Node
 * tests with fakes alike.
 */
import { createRateLimiter, fetchShotMedia, ProviderError } from "./documentary-media-fetch.mjs";
import { parseSceneLines, toSeconds } from "./scene-lines.mjs";

/** No clip may appear twice within this many seconds of film time. */
export const REPEAT_WINDOW_SECONDS = 600;

/** Licences a pick may carry: free for commercial use, no item-page check needed. */
export const FREE_LICENCES = Object.freeze(["PEXELS", "PIXABAY", "CC0-1.0"]);

/**
 * @typedef {import("./documentary-media-fetch.mjs").MediaProvider} MediaProvider
 * @typedef {import("./documentary-media-fetch.mjs").MediaResult} MediaResult
 * @typedef {import("./documentary-media-fetch.mjs").MediaKind} MediaKind
 * @typedef {{ scene: string, shot: number, start: number, end: number, rung: string | null, description: string, queries: string[] }} StockShot
 * @typedef {{ licenseId: string, name: string, licenseUrl: string | null, attributionRequired: boolean, creator: string | null, sourcePageUrl: string }} LicenceRecord
 * @typedef {{ id: string, source: string, mediaUrl: string | null, previewUrl: string | null, sourcePageUrl: string, creator: string | null, durationSeconds: number | null, width: number | null, height: number | null, licence: LicenceRecord }} MediaPick
 * @typedef {StockShot & { status: "found" | "missing" | "no-query", query: string | null, pick: MediaPick | null, alternates: string[], review?: "fit" | "none-fit" | "unreviewed", trace: { query: string, provider: string, outcome: string, returned: number, allowed: number }[] }} ShotMedia
 * @typedef {{ chapter: string, providers: string[], repeatWindowSeconds: number, shots: ShotMedia[], stats: { shots: number, found: number, missing: number, noQuery: number } }} ChapterMedia
 * @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike
 */

/** Words that can tie a shot to its query group (codes like OBJ-01, R3 and site names do not count). */
const IGNORED = new Set(["pexels", "pixabay", "mixkit", "coverr", "videvo", "free", "the", "and", "with", "use", "close", "shot", "same", "https", "www", "com", "video"]);
/** @param {string} text */
function wordSet(text) {
  return new Set(text.replace(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+\b/g, " ").toLowerCase().split(/[^a-z0-9]+/).filter((w) => (w.length >= 3 || /^\d{5,}$/.test(w)) && !IGNORED.has(w)));
}

/** @param {string} t "0:00:07.4" */
const clock = (t) => toSeconds(t);

/**
 * The shots of one SHOTS field, "(1) ...; (2) ...", in order. Shot numbers in
 * media-C1.json are positions in this list, starting at 1.
 * @param {string} field
 */
export function shotParts(field) {
  return field.split(/\(\d+\)\s*/).map((p) => p.trim().replace(/;$/, "").trim()).filter(Boolean);
}

/**
 * The stock shots of a chapter, with their film times and search queries.
 * Graphics shots (rung R1) need no footage and are left out. Queries come
 * from the SRC field (Q1 "...", Q2 "..."), which holds one group per subject
 * separated by ";" (`comb Pixabay · Q1 "..." · Q2 "..."; chair ...`). Each
 * shot takes the group sharing the most words (or the clip number) with its
 * description; with no overlap, the group in the same position when the
 * counts match, otherwise all of the scene's queries.
 * @param {string} markdown
 * @returns {StockShot[]}
 */
export function stockShots(markdown) {
  /** @type {StockShot[]} */
  const out = [];
  for (const s of parseSceneLines(markdown)) {
    const shots = shotParts(s.fields.SHOTS ?? "");
    /** @type {{ start: number, end: number, rung: string | null, description: string, index: number }[]} */
    const stock = [];
    shots.forEach((text, i) => {
      const time = /^(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*[-–]\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*/.exec(text);
      const rest = time ? text.slice(time[0].length) : text;
      const rung = /^(R\d)\b/.exec(rest)?.[1] ?? null;
      if (rung === "R1") return;
      const start = time ? clock(time[1]) : s.start;
      const end = time ? clock(time[2]) : s.end;
      stock.push({ start: Number.isFinite(start) ? start : s.start, end: Number.isFinite(end) ? end : s.end, rung, description: rest.slice(0, 200), index: i + 1 });
    });
    if (!stock.length) continue;
    const groups = (s.fields.SRC ?? "").split(/;\s*/)
      .map((text) => ({ words: wordSet(text), queries: [...text.matchAll(/\bQ\d+\s*["“]([^"”]+)["”]/g)].map((m) => m[1].trim()).filter(Boolean) }))
      .filter((g) => g.queries.length);
    const all = [...new Set(groups.flatMap((g) => g.queries))];
    stock.forEach((shot, i) => {
      const words = wordSet(shot.description);
      let best = null;
      let bestScore = 0;
      for (const g of groups) {
        const score = [...words].filter((w) => g.words.has(w)).reduce((n, w) => n + (/^\d+$/.test(w) ? 5 : 1), 0); // a clip number is decisive
        if (score > bestScore) { best = g; bestScore = score; }
      }
      const queries = best ? best.queries : groups.length === stock.length ? groups[i].queries : all;
      out.push({ scene: s.sc, shot: shot.index, start: shot.start, end: shot.end, rung: shot.rung, description: shot.description, queries });
    });
  }
  return out;
}

/**
 * Clip use across the whole film, by film time, so a clip is never repeated
 * within the window. Earlier chapters' picks are loaded first on a resume.
 */
export function createUseHistory(windowSeconds = REPEAT_WINDOW_SECONDS) {
  /** @type {Map<string, number[]>} */
  const uses = new Map();
  return {
    /** @param {string} id @param {number} at */
    add(id, at) { uses.set(id, [...(uses.get(id) ?? []), at]); },
    /** @param {string} id @param {number} at */
    blocked(id, at) { return (uses.get(id) ?? []).some((t) => Math.abs(t - at) < windowSeconds); },
    /** @param {ChapterMedia} media */
    load(media) { for (const s of media.shots ?? []) if (s.pick) this.add(s.pick.id, s.start); },
  };
}

/**
 * Shots shown to the judge in one request, and candidates per shot.
 */
export const JUDGE_BATCH = 6;
export const JUDGE_POOL = 4;

/**
 * @typedef {{ key: string, description: string, query: string, candidates: { index: number, previewUrl: string, title: string }[] }} JudgeShot
 * @typedef {(chapter: string, shots: JudgeShot[]) => Promise<Record<string, number[]>>} MediaJudge
 *   returns, per shot key, the candidate indices that fit the shot, best first ([] = none fits)
 */

/** @param {import("./documentary-media-fetch.mjs").MediaCandidate} c @returns {MediaPick} */
function toPick(c) {
  return {
    id: c.id, source: c.source, mediaUrl: c.mediaUrl, previewUrl: c.previewUrl, sourcePageUrl: c.sourcePageUrl,
    creator: c.creator, durationSeconds: c.durationSeconds, width: c.width, height: c.height,
    licence: { licenseId: c.rights.licenseId, name: c.rights.reason, licenseUrl: c.licenseUrl, attributionRequired: c.attributionRequired, creator: c.creator, sourcePageUrl: c.sourcePageUrl },
  };
}

/**
 * Find footage for every stock shot of one chapter. With a judge, the top
 * candidates of each shot are shown to it (as small thumbnails, in batches)
 * and only a clip it says fits is used; a shot where nothing fits gets no
 * clip rather than the wrong one. If the judge fails, the first free clip is
 * used and the shot is marked unreviewed, so the run never stops here.
 * @param {{ chapter: string, markdown: string, providers: MediaProvider[], history?: ReturnType<typeof createUseHistory>, limiter?: ReturnType<typeof createRateLimiter>, kind?: MediaKind, maxWaitMs?: number, timeoutMs?: number, sleep?: (ms: number) => Promise<void>, judge?: MediaJudge }} o
 * @returns {Promise<ChapterMedia>}
 */
export async function chapterMedia(o) {
  const history = o.history ?? createUseHistory();
  const limiter = o.limiter ?? createRateLimiter();
  const kind = o.kind ?? "video";
  /** @type {ShotMedia[]} */
  const shots = [];
  /** @type {Map<ShotMedia, import("./documentary-media-fetch.mjs").MediaCandidate[]>} */
  const pools = new Map();
  for (const shot of stockShots(o.markdown)) {
    /** @type {ShotMedia} */
    const row = { ...shot, status: shot.queries.length ? "missing" : "no-query", query: null, pick: null, alternates: [], trace: [] };
    for (const query of shot.queries) {
      const found = await fetchShotMedia(
        { shotId: `${shot.scene}-${shot.shot}`, query, kind },
        { providers: o.providers, limiter, used: { has: (id) => history.blocked(id, shot.start) }, minCandidates: 1, maxWaitMs: o.maxWaitMs, timeoutMs: o.timeoutMs, sleep: o.sleep },
      );
      row.trace.push(...found.trace.map((t) => ({ query, ...t })));
      const free = found.candidates.filter((c) => c.rights.allowed && !c.rights.needsPageCheck && FREE_LICENCES.includes(c.rights.licenseId));
      if (!free.length) continue;
      row.query = query;
      if (o.judge) { pools.set(row, free); break; }
      const [best, ...rest] = free;
      row.status = "found";
      row.pick = toPick(best);
      row.alternates = rest.slice(0, 3).map((c) => c.id);
      history.add(best.id, shot.start);
      break;
    }
    shots.push(row);
  }

  if (o.judge && pools.size) {
    // Ask the judge, batch by batch; a failed batch falls back to search order.
    const rows = [...pools.keys()];
    /** @type {Map<ShotMedia, number[] | null>} */
    const verdicts = new Map();
    for (let i = 0; i < rows.length; i += JUDGE_BATCH) {
      const batch = rows.slice(i, i + JUDGE_BATCH);
      const asked = batch.map((row) => ({ row, shot: { key: `${row.scene}-${row.shot}`, description: row.description, query: row.query ?? "", candidates: (pools.get(row) ?? []).slice(0, JUDGE_POOL).map((c, index) => ({ index, previewUrl: c.previewUrl ?? "", title: c.title })).filter((c) => c.previewUrl) } })).filter((x) => x.shot.candidates.length);
      /** @type {Record<string, number[]> | null} */
      let answer = null;
      try { answer = asked.length ? await o.judge(o.chapter, asked.map((x) => x.shot)) : null; } catch { answer = null; }
      for (const { row, shot } of asked) {
        const order = answer?.[shot.key];
        verdicts.set(row, Array.isArray(order) ? order.filter((n) => Number.isInteger(n) && n >= 0 && n < shot.candidates.length) : null);
      }
    }
    // Commit picks in film order, so the 10-minute rule holds within the chapter too.
    for (const row of rows) {
      const pool = pools.get(row) ?? [];
      const verdict = verdicts.get(row) ?? null;
      const order = verdict === null ? pool.map((_, n) => n) : verdict;
      const chosen = order.map((n) => pool[n]).find((c) => c && !history.blocked(c.id, row.start));
      row.review = verdict === null ? "unreviewed" : chosen ? "fit" : "none-fit";
      if (!chosen) continue;
      row.status = "found";
      row.pick = toPick(chosen);
      row.alternates = order.map((n) => pool[n]).filter((c) => c && c.id !== chosen.id).slice(0, 3).map((c) => c.id);
      history.add(chosen.id, row.start);
    }
  }
  return {
    chapter: o.chapter,
    providers: o.providers.map((p) => p.id),
    repeatWindowSeconds: REPEAT_WINDOW_SECONDS,
    shots,
    stats: {
      shots: shots.length,
      found: shots.filter((s) => s.status === "found").length,
      missing: shots.filter((s) => s.status === "missing").length,
      noQuery: shots.filter((s) => s.status === "no-query").length,
    },
  };
}

/**
 * Turn an HTTP failure into the ProviderError fetchShotMedia understands.
 * @param {Response} res
 */
function httpError(res) {
  if (res.status === 429) {
    const after = Number(res.headers.get("retry-after"));
    return new ProviderError("rate_limited", Number.isFinite(after) && after > 0 ? after * 1000 : 60_000);
  }
  if (res.status === 401 || res.status === 403) return new ProviderError("auth_error");
  return new ProviderError("unavailable");
}

/**
 * A 320 px wide Pexels preview: enough for the judge to see the shot, at a
 * small fraction of the image tokens of the full-size one.
 * @param {unknown} url
 */
function smallPexels(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "images.pexels.com") { u.searchParams.set("auto", "compress"); u.searchParams.set("cs", "tinysrgb"); u.searchParams.set("w", "320"); u.searchParams.delete("h"); u.searchParams.delete("fit"); }
    return u.href;
  } catch {
    return null;
  }
}

/**
 * Pexels search (videos and photos). Pexels License: free, no attribution
 * required. Limit: 200 requests per hour by default.
 * @param {{ apiKey: string, fetch?: FetchLike, perPage?: number }} o
 * @returns {MediaProvider}
 */
export function pexelsProvider(o) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const perPage = o.perPage ?? 15;
  return {
    id: "pexels", layer: 2, kinds: ["video", "image"], cacheTtlSeconds: 86_400, rate: { capacity: 200, windowSeconds: 3600 },
    async search(query, kind, signal) {
      const base = kind === "video" ? "https://api.pexels.com/videos/search" : "https://api.pexels.com/v1/search";
      const res = await get(`${base}?query=${encodeURIComponent(query)}&per_page=${perPage}&orientation=landscape`, { headers: { Authorization: o.apiKey }, signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      const common = { source: "pexels", license: "Pexels License", licenseUrl: "https://www.pexels.com/license/", attributionRequired: false };
      if (kind === "video") {
        return (data.videos ?? []).map((/** @type {any} */ v) => {
          const files = (v.video_files ?? []).filter((/** @type {any} */ f) => f.link && (f.file_type ?? "video/mp4") === "video/mp4");
          const file = files.filter((/** @type {any} */ f) => (f.width ?? 0) <= 1920).sort((/** @type {any} */ a, /** @type {any} */ b) => (b.width ?? 0) - (a.width ?? 0))[0] ?? files[0];
          return { ...common, id: `pexels:video:${v.id}`, mediaType: "video", title: query, previewUrl: smallPexels(v.image), mediaUrl: file?.link ?? null, sourcePageUrl: v.url ?? `https://www.pexels.com/video/${v.id}/`, creator: v.user?.name ?? null, durationSeconds: v.duration ?? null, width: file?.width ?? v.width ?? null, height: file?.height ?? v.height ?? null };
        });
      }
      return (data.photos ?? []).map((/** @type {any} */ p) => ({ ...common, id: `pexels:photo:${p.id}`, mediaType: "image", title: p.alt || query, previewUrl: p.src?.medium ?? null, mediaUrl: p.src?.original ?? null, sourcePageUrl: p.url ?? `https://www.pexels.com/photo/${p.id}/`, creator: p.photographer ?? null, durationSeconds: null, width: p.width ?? null, height: p.height ?? null }));
    },
  };
}

/**
 * Pixabay search (videos and photos). Pixabay Content License: free, no
 * attribution required. Limit: 100 requests per 60 seconds.
 * @param {{ apiKey: string, fetch?: FetchLike, perPage?: number }} o
 * @returns {MediaProvider}
 */
export function pixabayProvider(o) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const perPage = o.perPage ?? 20;
  return {
    id: "pixabay", layer: 2, kinds: ["video", "image"], cacheTtlSeconds: 86_400, rate: { capacity: 100, windowSeconds: 60 },
    async search(query, kind, signal) {
      const base = kind === "video" ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/";
      const extra = kind === "video" ? "" : "&image_type=photo&orientation=horizontal";
      const res = await get(`${base}?key=${encodeURIComponent(o.apiKey)}&q=${encodeURIComponent(query.slice(0, 100))}&per_page=${perPage}&safesearch=true${extra}`, { signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      const common = { source: "pixabay", license: "Pixabay Content License", licenseUrl: "https://pixabay.com/service/license-summary/", attributionRequired: false };
      if (kind === "video") {
        return (data.hits ?? []).map((/** @type {any} */ h) => {
          const thumb = h.videos?.tiny?.thumbnail || h.videos?.small?.thumbnail || null;
          const file = h.videos?.large?.url ? h.videos.large : h.videos?.medium?.url ? h.videos.medium : h.videos?.small ?? null;
          return { ...common, id: `pixabay:video:${h.id}`, mediaType: "video", title: h.tags || query, previewUrl: thumb ?? file?.thumbnail ?? null, mediaUrl: file?.url || null, sourcePageUrl: h.pageURL ?? `https://pixabay.com/videos/id-${h.id}/`, creator: h.user ?? null, durationSeconds: h.duration ?? null, width: file?.width || null, height: file?.height || null };
        });
      }
      return (data.hits ?? []).map((/** @type {any} */ h) => ({ ...common, id: `pixabay:photo:${h.id}`, mediaType: "image", title: h.tags || query, previewUrl: h.previewURL ?? null, mediaUrl: h.largeImageURL ?? null, sourcePageUrl: h.pageURL ?? `https://pixabay.com/photos/id-${h.id}/`, creator: h.user ?? null, durationSeconds: null, width: h.imageWidth ?? null, height: h.imageHeight ?? null }));
    },
  };
}

/**
 * The providers a run can use, from whichever keys are set.
 * @param {{ pexelsKey?: string, pixabayKey?: string, fetch?: FetchLike }} keys
 * @returns {MediaProvider[]}
 */
export function mediaProviders(keys) {
  /** @type {MediaProvider[]} */
  const out = [];
  if (keys.pexelsKey) out.push(pexelsProvider({ apiKey: keys.pexelsKey, fetch: keys.fetch }));
  if (keys.pixabayKey) out.push(pixabayProvider({ apiKey: keys.pixabayKey, fetch: keys.fetch }));
  return out;
}
