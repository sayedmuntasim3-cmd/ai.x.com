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

/**
 * Licences a pick may carry: free for commercial use. Public-domain, NASA and
 * CC BY items come from archives whose search result carries the file's own
 * rights metadata, checked item by item (verifyArchiveItem); CC BY needs the
 * credit that the run writes into the description.
 */
export const FREE_LICENCES = Object.freeze(["PEXELS", "PIXABAY", "CC0-1.0", "PDM-1.0", "PUBLIC-DOMAIN", "US-GOV-PD", "CC-BY"]);

/**
 * Archives: real, historical, scientific and museum pictures, free for
 * commercial use. All but the Smithsonian are searched without a key.
 */
export const ARCHIVE_SOURCES = Object.freeze(["wikimedia", "nasa", "loc", "smithsonian", "met", "artic", "openverse"]);

/**
 * Archives of historical evidence and museum objects: searched for evidence
 * shots (R2) only. A B-roll shot ("a crowd on a beach at dawn") gains nothing
 * from them, and every search there costs requests a Worker step has few of.
 */
export const EVIDENCE_SOURCES = Object.freeze(["loc", "smithsonian", "met", "artic"]);

/**
 * The item-level rights check of an archive result. Commons returns the file
 * page's own metadata with the search, so a file with any restriction
 * (personality rights, trademark, insignia ...) is refused here; NASA items
 * credited to a third party were already refused by classifyLicense.
 * @param {import("./documentary-media-fetch.mjs").MediaCandidate} c
 */
export async function verifyArchiveItem(c) {
  if (c.source === "wikimedia") return !c.restrictions;
  // NASA: third-party credits refused by classifyLicense. The Library of Congress, the Met, the
  // Art Institute and the Smithsonian: each provider keeps only items whose own record says
  // "no known restrictions", public domain or CC0. Openverse: CC0, PDM and CC BY only, as the source states them.
  if (["nasa", "loc", "smithsonian", "met", "artic", "openverse"].includes(c.source)) return c.rights.allowed && !c.restrictions;
  return false;
}

/**
 * @typedef {import("./documentary-media-fetch.mjs").MediaProvider} MediaProvider
 * @typedef {import("./documentary-media-fetch.mjs").MediaResult} MediaResult
 * @typedef {import("./documentary-media-fetch.mjs").MediaKind} MediaKind
 * @typedef {{ scene: string, shot: number, start: number, end: number, rung: string | null, description: string, queries: string[] }} StockShot
 * @typedef {{ licenseId: string, name: string, licenseUrl: string | null, attributionRequired: boolean, creator: string | null, sourcePageUrl: string }} LicenceRecord
 * @typedef {{ id: string, source: string, kind?: MediaKind, title?: string, mediaUrl: string | null, previewUrl: string | null, sourcePageUrl: string, creator: string | null, durationSeconds: number | null, width: number | null, height: number | null, licence: LicenceRecord }} MediaPick
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
    id: c.id, source: c.source, kind: c.mediaType, title: c.title, mediaUrl: c.mediaUrl, previewUrl: c.previewUrl, sourcePageUrl: c.sourcePageUrl,
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
  const archives = o.providers.filter((p) => ARCHIVE_SOURCES.includes(p.id));
  const stock = o.providers.filter((p) => !ARCHIVE_SOURCES.includes(p.id));
  /**
   * Where to look, in order. Evidence shots (R2) want the real thing, so
   * archive photos come first; other shots want moving stock footage, then
   * archive video, then a still photo animated in the edit.
   * @param {string | null} rung
   * @returns {{ kind: MediaKind, providers: MediaProvider[] }[]}
   */
  const plan = (rung) => {
    if (o.kind) return [{ kind: o.kind, providers: o.providers }];
    const steps = rung === "R2"
      ? [{ kind: /** @type {MediaKind} */ ("image"), providers: o.providers }, { kind: /** @type {MediaKind} */ ("video"), providers: o.providers }]
      : [{ kind: /** @type {MediaKind} */ ("video"), providers: stock }, { kind: /** @type {MediaKind} */ ("video"), providers: archives }, { kind: /** @type {MediaKind} */ ("image"), providers: o.providers.filter((p) => !EVIDENCE_SOURCES.includes(p.id)) }];
    return steps.filter((s) => s.providers.some((p) => p.kinds.includes(s.kind)));
  };
  /** @type {ShotMedia[]} */
  const shots = [];
  /** @type {Map<ShotMedia, import("./documentary-media-fetch.mjs").MediaCandidate[]>} */
  const pools = new Map();
  for (const shot of stockShots(o.markdown)) {
    /** @type {ShotMedia} */
    const row = { ...shot, status: shot.queries.length ? "missing" : "no-query", query: null, pick: null, alternates: [], trace: [] };
    search: for (const step of plan(shot.rung)) for (const query of shot.queries) {
      const found = await fetchShotMedia(
        { shotId: `${shot.scene}-${shot.shot}`, query, kind: step.kind },
        { providers: step.providers, limiter, used: { has: (id) => history.blocked(id, shot.start) }, verifyItem: verifyArchiveItem, minCandidates: 1, maxWaitMs: o.maxWaitMs, timeoutMs: o.timeoutMs, sleep: o.sleep },
      );
      row.trace.push(...found.trace.map((t) => ({ query, ...t })));
      // Every candidate here passed its item-level rights check inside fetchShotMedia.
      const free = found.candidates.filter((c) => c.rights.allowed && FREE_LICENCES.includes(c.rights.licenseId));
      if (!free.length) continue;
      row.query = query;
      if (o.judge) { pools.set(row, free); break search; }
      const [best, ...rest] = free;
      row.status = "found";
      row.pick = toPick(best);
      row.alternates = rest.slice(0, 3).map((c) => c.id);
      history.add(best.id, shot.start);
      break search;
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
      // One picture the judge cannot open fails the whole batch: ask shot by shot, so only that shot goes unreviewed.
      if (answer === null && asked.length > 1) {
        answer = {};
        for (const x of asked) {
          try { Object.assign(answer, await o.judge(o.chapter, [x.shot])); } catch { /* this shot stays unreviewed */ }
        }
      }
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

/** @param {unknown} html */
function plain(html) {
  return typeof html === "string" ? html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, " ").trim() : "";
}

/** Commons asks every client to say who it is. */
const COMMONS_UA = "ZuponaStudio/1.0 (documentary media search; https://github.com/sayedmuntasim3-cmd/ai.x.com)";

/**
 * Wikimedia Commons: real photographs of people, places and events, maps and
 * historical documents, plus some video. No key. Each result carries its file
 * page's rights metadata (licence, author, restrictions), so the item check
 * needs no second request. Images come as 1920 px renditions.
 * @param {{ fetch?: FetchLike, perPage?: number }} [o]
 * @returns {MediaProvider}
 */
export function wikimediaProvider(o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const perPage = o.perPage ?? 20;
  return {
    id: "wikimedia", layer: 1, kinds: ["image", "video"], cacheTtlSeconds: 86_400, rate: { capacity: 60, windowSeconds: 60 },
    async search(query, kind, signal) {
      const params = new URLSearchParams({
        action: "query", format: "json", formatversion: "2", generator: "search", gsrnamespace: "6", gsrlimit: String(perPage),
        gsrsearch: `${query.slice(0, 200)} filetype:${kind === "video" ? "video" : "bitmap"}`,
        prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1920",
        iiextmetadatafilter: "LicenseShortName|License|LicenseUrl|Artist|Credit|AttributionRequired|Restrictions|ImageDescription|ObjectName",
      });
      const res = await get(`https://commons.wikimedia.org/w/api.php?${params}`, { headers: { "user-agent": COMMONS_UA, "api-user-agent": COMMONS_UA }, signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      const pages = Array.isArray(data?.query?.pages) ? data.query.pages : Object.values(data?.query?.pages ?? {});
      return pages.sort((/** @type {any} */ a, /** @type {any} */ b) => (a.index ?? 0) - (b.index ?? 0)).flatMap((/** @type {any} */ p) => {
        const info = p.imageinfo?.[0];
        if (!info) return [];
        const meta = info.extmetadata ?? {};
        const isVideo = /^video\//.test(info.mime ?? "");
        if ((kind === "video") !== isVideo || !(isVideo || /^image\/(jpeg|png|webp|tiff)$/.test(info.mime ?? ""))) return [];
        const thumb = typeof info.thumburl === "string" ? info.thumburl : null;
        const small = thumb ? thumb.replace(/\/(\d+)px-/, "/320px-") : null;
        const title = plain(meta.ObjectName?.value) || String(p.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "");
        return [{
          id: `wikimedia:${p.pageid}`, source: "wikimedia", mediaType: kind, title,
          previewUrl: small, mediaUrl: isVideo ? info.url ?? null : thumb ?? info.url ?? null,
          sourcePageUrl: info.descriptionurl ?? `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(p.title ?? ""))}`,
          creator: plain(meta.Artist?.value) || plain(meta.Credit?.value) || null,
          license: plain(meta.LicenseShortName?.value) || plain(meta.License?.value) || null,
          licenseUrl: plain(meta.LicenseUrl?.value) || null,
          attributionRequired: String(meta.AttributionRequired?.value ?? "").toLowerCase() === "true",
          restrictions: plain(meta.Restrictions?.value) || null,
          durationSeconds: isVideo && Number.isFinite(Number(info.duration)) ? Number(info.duration) : null,
          width: info.width ?? null, height: info.height ?? null,
        }];
      });
    },
  };
}

/**
 * NASA Image and Video Library: space, Earth, aviation and science. No key.
 * NASA's own media is not copyrighted in the US (no endorsement may be
 * implied); items credited to anyone else are refused by classifyLicense.
 * @param {{ fetch?: FetchLike, perPage?: number }} [o]
 * @returns {MediaProvider}
 */
export function nasaProvider(o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const perPage = o.perPage ?? 20;
  return {
    id: "nasa", layer: 1, kinds: ["image", "video"], cacheTtlSeconds: 86_400, rate: { capacity: 60, windowSeconds: 60 },
    async search(query, kind, signal) {
      const res = await get(`https://images-api.nasa.gov/search?${new URLSearchParams({ q: query.slice(0, 200), media_type: kind, page_size: String(perPage) })}`, { signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      return (data?.collection?.items ?? []).flatMap((/** @type {any} */ item) => {
        const d = item.data?.[0];
        if (!d?.nasa_id || d.media_type !== kind) return [];
        const id = String(d.nasa_id);
        const preview = (item.links ?? []).find((/** @type {any} */ l) => l.rel === "preview")?.href ?? null;
        const folder = `https://images-assets.nasa.gov/${kind}/${encodeURIComponent(id)}/${encodeURIComponent(id)}`;
        // The credit fields go into the licence text, so a third-party credit is caught by classifyLicense.
        const credit = [d.center, d.photographer, d.secondary_creator, plain(d.description).slice(0, 400)].filter(Boolean).join(" · ");
        return [{
          id: `nasa:${id}`, source: "nasa", mediaType: kind, title: plain(d.title) || id,
          previewUrl: preview, mediaUrl: kind === "video" ? `${folder}~orig.mp4` : `${folder}~large.jpg`,
          sourcePageUrl: `https://images.nasa.gov/details/${encodeURIComponent(id)}`,
          creator: d.photographer || d.secondary_creator || `NASA${d.center ? ` ${d.center}` : ""}`,
          license: `NASA media. ${credit}`, licenseUrl: "https://www.nasa.gov/nasa-brand-center/images-and-media/",
          attributionRequired: false, durationSeconds: null, width: null, height: null,
        }];
      });
    },
  };
}

/** Fetch JSON, or null on any failure (a detail request that fails drops one item, never the search). @param {FetchLike} get @param {string} url @param {RequestInit} init */
async function jsonOrNull(get, url, init) {
  try { const r = await get(url, init); return r.ok ? /** @type {any} */ (await r.json()) : null; } catch { return null; }
}
/** @param {unknown} v */
const str = (v) => (Array.isArray(v) ? v.map(String).join(" ") : typeof v === "string" ? v : "");

/**
 * Library of Congress (loc.gov photos): American history in photographs,
 * prints and documents. No key. Only items whose own record says "No known
 * restrictions on publication" are kept; the item record is read for each
 * of the first few results (the search result does not carry it).
 * @param {{ fetch?: FetchLike, perPage?: number, details?: number }} [o]
 * @returns {MediaProvider}
 */
export function locProvider(o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  return {
    id: "loc", layer: 1, kinds: ["image"], cacheTtlSeconds: 86_400, rate: { capacity: 20, windowSeconds: 10 },
    async search(query, kind, signal) {
      if (kind !== "image") return [];
      const res = await get(`https://www.loc.gov/photos/?${new URLSearchParams({ q: query.slice(0, 200), fo: "json", c: String(o.perPage ?? 20), fa: "online-format:image" })}`, { headers: { "user-agent": COMMONS_UA }, signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      const hits = (Array.isArray(data?.results) ? data.results : []).filter((/** @type {any} */ r) => typeof r?.id === "string" && Array.isArray(r.image_url) && r.image_url.length).slice(0, o.details ?? 4);
      const items = await Promise.all(hits.map((/** @type {any} */ r) => jsonOrNull(get, `${r.id.replace(/^http:/, "https:").replace(/\/?$/, "/")}?fo=json`, { headers: { "user-agent": COMMONS_UA }, signal })));
      return hits.flatMap((/** @type {any} */ r, /** @type {number} */ i) => {
        const item = items[i]?.item;
        const advisory = str(item?.rights_advisory).trim();
        if (!/^no known restrictions on publication/i.test(advisory)) return [];
        // Renditions carry their size in the hash (…_150px.jpg#h=150&w=118); the largest is the picture, one near 320 px the preview.
        const sized = r.image_url.map((/** @type {string} */ u) => ({ url: u.split("#")[0], w: Number(/[#&]w=(\d+)/.exec(u)?.[1] ?? 0), h: Number(/[#&]h=(\d+)/.exec(u)?.[1] ?? 0) })).filter((/** @type {any} */ x) => /^https?:\/\//.test(x.url));
        if (!sized.length) return [];
        const big = sized.reduce((/** @type {any} */ a, /** @type {any} */ b) => (b.w > a.w ? b : a));
        const preview = sized.filter((/** @type {any} */ x) => x.w >= 300).sort((/** @type {any} */ a, /** @type {any} */ b) => a.w - b.w)[0] ?? big;
        const page = String(r.url ?? r.id).replace(/^http:/, "https:");
        return [{
          id: `loc:${r.id.replace(/^https?:\/\/www\.loc\.gov\//, "").replace(/\/$/, "")}`, source: "loc", mediaType: "image", title: plain(r.title) || query,
          previewUrl: preview.url.replace(/^http:/, "https:"), mediaUrl: big.url.replace(/^http:/, "https:"), sourcePageUrl: page,
          creator: str(item?.contributor_names ?? r.contributor).slice(0, 120) || null,
          license: `Library of Congress: ${advisory.slice(0, 160)}`, licenseUrl: "https://www.loc.gov/legal/understanding-copyright/",
          attributionRequired: false, durationSeconds: null, width: big.w || null, height: big.h || null,
        }];
      });
    },
  };
}

/**
 * Smithsonian Open Access: museum objects, history, science and nature,
 * CC0 only. Needs a free api.data.gov key (SMITHSONIAN_API_KEY).
 * @param {{ apiKey: string, fetch?: FetchLike, perPage?: number }} o
 * @returns {MediaProvider}
 */
export function smithsonianProvider(o) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  return {
    id: "smithsonian", layer: 1, kinds: ["image"], cacheTtlSeconds: 86_400, rate: { capacity: 30, windowSeconds: 60 },
    async search(query, kind, signal) {
      if (kind !== "image") return [];
      const q = `${query.slice(0, 200)} AND online_media_type:"Images" AND media_usage:"CC0"`;
      const res = await get(`https://api.si.edu/openaccess/api/v1.0/search?${new URLSearchParams({ q, rows: String(o.perPage ?? 20), api_key: o.apiKey })}`, { signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      return (Array.isArray(data?.response?.rows) ? data.response.rows : []).flatMap((/** @type {any} */ row) => {
        const d = row?.content?.descriptiveNonRepeating ?? {};
        // Every picture of the record states its own usage; only CC0 ones are taken.
        const m = (d.online_media?.media ?? []).find((/** @type {any} */ x) => x?.type === "Images" && String(x?.usage?.access ?? "").toUpperCase() === "CC0" && typeof x.content === "string");
        if (!m) return [];
        const hi = (m.resources ?? []).find((/** @type {any} */ r) => /high-resolution jpeg/i.test(String(r?.label)) && typeof r.url === "string")?.url;
        const ids = (/** @type {string} */ u, /** @type {number} */ max) => (/deliveryService/.test(u) ? `${u}${u.includes("?") ? "&" : "?"}max=${max}` : u);
        return [{
          id: `smithsonian:${row.id ?? d.record_ID ?? m.idsId}`, source: "smithsonian", mediaType: "image", title: plain(d.title?.content ?? row.title) || query,
          previewUrl: m.thumbnail ?? ids(m.content, 320), mediaUrl: hi ?? ids(m.content, 1920), sourcePageUrl: d.record_link ?? d.guid ?? "https://www.si.edu/openaccess",
          creator: plain(row?.content?.freetext?.name?.[0]?.content) || plain(d.data_source) || null,
          license: "CC0 (Smithsonian Open Access)", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          attributionRequired: false, durationSeconds: null, width: null, height: null,
        }];
      });
    },
  };
}

/**
 * The Metropolitan Museum of Art (Open Access): public-domain objects, CC0.
 * No key. The search returns ids only, so the first few objects are read.
 * @param {{ fetch?: FetchLike, details?: number }} [o]
 * @returns {MediaProvider}
 */
export function metProvider(o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const base = "https://collectionapi.metmuseum.org/public/collection/v1";
  // The v1 search endpoint was retired on 2026-10-01 (410 Gone); v1.1 is Elastic-backed and paginated. Objects stay on v1.
  const searchBase = "https://collectionapi.metmuseum.org/public/collection/v1.1";
  return {
    id: "met", layer: 1, kinds: ["image"], cacheTtlSeconds: 86_400, rate: { capacity: 60, windowSeconds: 1 },
    async search(query, kind, signal) {
      if (kind !== "image") return [];
      const res = await get(`${searchBase}/search?${new URLSearchParams({ hasImages: "true", q: query.slice(0, 200), limit: String(Math.max(o.details ?? 4, 1) * 2), offset: "0" })}`, { signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      const ids = (Array.isArray(data?.objectIDs) ? data.objectIDs : []).slice(0, o.details ?? 4);
      const objects = await Promise.all(ids.map((/** @type {number} */ id) => jsonOrNull(get, `${base}/objects/${id}`, { signal })));
      return objects.flatMap((/** @type {any} */ x) => {
        if (!x || x.isPublicDomain !== true || typeof x.primaryImage !== "string" || !x.primaryImage) return [];
        return [{
          id: `met:${x.objectID}`, source: "met", mediaType: "image", title: [plain(x.title), plain(x.objectDate)].filter(Boolean).join(", ") || query,
          previewUrl: x.primaryImageSmall || null, mediaUrl: x.primaryImage, sourcePageUrl: x.objectURL || `https://www.metmuseum.org/art/collection/search/${x.objectID}`,
          creator: plain(x.artistDisplayName) || null, license: "CC0 (The Met Open Access, public-domain object)", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          attributionRequired: false, durationSeconds: null, width: null, height: null,
        }];
      });
    },
  };
}

/**
 * The Art Institute of Chicago: public-domain artworks, images released as
 * CC0, served through IIIF. No key.
 * @param {{ fetch?: FetchLike, perPage?: number }} [o]
 * @returns {MediaProvider}
 */
export function articProvider(o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  return {
    id: "artic", layer: 1, kinds: ["image"], cacheTtlSeconds: 86_400, rate: { capacity: 60, windowSeconds: 60 },
    async search(query, kind, signal) {
      if (kind !== "image") return [];
      const params = new URLSearchParams({ q: query.slice(0, 200), "query[term][is_public_domain]": "true", limit: String(o.perPage ?? 20), fields: "id,title,image_id,artist_title,date_display,is_public_domain,thumbnail" });
      const res = await get(`https://api.artic.edu/api/v1/artworks/search?${params}`, { headers: { "AIC-User-Agent": COMMONS_UA }, signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      const iiif = typeof data?.config?.iiif_url === "string" ? data.config.iiif_url : "https://www.artic.edu/iiif/2";
      return (Array.isArray(data?.data) ? data.data : []).flatMap((/** @type {any} */ a) => {
        if (a?.is_public_domain !== true || !a.image_id) return [];
        return [{
          id: `artic:${a.id}`, source: "artic", mediaType: "image", title: [plain(a.title), plain(a.date_display)].filter(Boolean).join(", ") || query,
          previewUrl: `${iiif}/${a.image_id}/full/400,/0/default.jpg`, mediaUrl: `${iiif}/${a.image_id}/full/1686,/0/default.jpg`, sourcePageUrl: `https://www.artic.edu/artworks/${a.id}`,
          creator: plain(a.artist_title) || null, license: "CC0 (Art Institute of Chicago, public-domain artwork)", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          attributionRequired: false, durationSeconds: null, width: null, height: null,
        }];
      });
    },
  };
}

/** Openverse also indexes these; they are searched directly, with their own rights metadata. */
const OPENVERSE_SKIP = new Set(["wikimedia", "nasa", "smithsonian", "met", "artic"]);

/**
 * Openverse: openly licensed images from many collections (Flickr, museums,
 * libraries), CC0, Public Domain Mark and CC BY only (never share-alike,
 * non-commercial or no-derivatives). No key; anonymous use is rate-limited,
 * so a busy Openverse is skipped. The licence is as the source states it.
 * @param {{ fetch?: FetchLike, perPage?: number }} [o]
 * @returns {MediaProvider}
 */
export function openverseProvider(o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  return {
    id: "openverse", layer: 1, kinds: ["image"], cacheTtlSeconds: 86_400, rate: { capacity: 20, windowSeconds: 60 },
    async search(query, kind, signal) {
      if (kind !== "image") return [];
      const params = new URLSearchParams({ q: query.slice(0, 200), license: "cc0,pdm,by", page_size: String(o.perPage ?? 20), mature: "false" });
      const res = await get(`https://api.openverse.org/v1/images/?${params}`, { headers: { "user-agent": COMMONS_UA }, signal });
      if (!res.ok) throw httpError(res);
      const data = /** @type {any} */ (await res.json());
      return (Array.isArray(data?.results) ? data.results : []).flatMap((/** @type {any} */ r) => {
        if (!r?.id || typeof r.url !== "string" || r.mature === true || OPENVERSE_SKIP.has(String(r.source))) return [];
        if (r.filetype && !/^(jpe?g|png|webp)$/i.test(String(r.filetype))) return [];
        const lic = String(r.license ?? "").toLowerCase();
        const license = lic === "cc0" ? "CC0 1.0" : lic === "pdm" ? "Public Domain Mark 1.0" : lic === "by" ? `CC BY ${r.license_version ?? ""}`.trim() : null;
        if (!license) return [];
        return [{
          id: `openverse:${r.id}`, source: "openverse", mediaType: "image", title: plain(r.title) || query,
          previewUrl: typeof r.thumbnail === "string" ? r.thumbnail : null, mediaUrl: r.url, sourcePageUrl: r.foreign_landing_url ?? `https://openverse.org/image/${r.id}`,
          creator: plain(r.creator) || null, license, licenseUrl: r.license_url ?? null, attributionRequired: lic === "by",
          durationSeconds: null, width: Number(r.width) || null, height: Number(r.height) || null,
        }];
      });
    },
  };
}

/**
 * The providers a run can use: the free archives (no key; the Smithsonian
 * with its free key) and whichever stock keys are set.
 * @param {{ pexelsKey?: string, pixabayKey?: string, smithsonianKey?: string, fetch?: FetchLike, archives?: boolean }} keys
 * @returns {MediaProvider[]}
 */
export function mediaProviders(keys) {
  /** @type {MediaProvider[]} */
  const out = [];
  if (keys.archives !== false) {
    out.push(wikimediaProvider({ fetch: keys.fetch }), nasaProvider({ fetch: keys.fetch }), locProvider({ fetch: keys.fetch }), metProvider({ fetch: keys.fetch }), articProvider({ fetch: keys.fetch }), openverseProvider({ fetch: keys.fetch }));
    if (keys.smithsonianKey) out.push(smithsonianProvider({ apiKey: keys.smithsonianKey, fetch: keys.fetch }));
  }
  if (keys.pexelsKey) out.push(pexelsProvider({ apiKey: keys.pexelsKey, fetch: keys.fetch }));
  if (keys.pixabayKey) out.push(pixabayProvider({ apiKey: keys.pixabayKey, fetch: keys.fetch }));
  return out;
}
