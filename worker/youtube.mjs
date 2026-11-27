/**
 * YouTube Data API v3 for the topic radar: search a niche, read the videos'
 * views and lengths and their channels' averages, rank the outliers.
 * Needs the secret YOUTUBE_API_KEY (free; 10,000 quota units a day: one radar
 * search costs about 102 units, so about 90 searches a day).
 */
import { isoSeconds, rankOutliers } from "../engine/src/topic-radar.mjs";

const API = "https://www.googleapis.com/youtube/v3";

/**
 * @param {{ apiKey: string, query: string, months?: number, language?: string, fetch?: typeof fetch, now?: number }} o
 * @returns {Promise<import("../engine/src/topic-radar.mjs").RadarPick[]>}
 */
export async function findOutliers(o) {
  const get = o.fetch ?? fetch;
  const now = o.now ?? Date.now();
  const call = async (/** @type {string} */ path, /** @type {Record<string, string>} */ params) => {
    const url = `${API}/${path}?${new URLSearchParams({ ...params, key: o.apiKey })}`;
    const res = await get(url);
    if (!res.ok) {
      const why = res.status === 403 ? "the YouTube key is wrong, not enabled for the Data API, or out of quota for today" : `YouTube answered ${res.status}`;
      throw new Error(`Topic radar: ${why}.`);
    }
    return /** @type {any} */ (await res.json());
  };
  const after = new Date(now - (o.months ?? 12) * 30 * 86_400_000).toISOString();
  // Long-form only (medium is 4-20 min, long is over 20), most viewed first.
  const searches = await Promise.all(["medium", "long"].map((videoDuration) => call("search", {
    part: "snippet", type: "video", q: o.query.slice(0, 200), order: "viewCount", maxResults: "25",
    publishedAfter: after, videoDuration, relevanceLanguage: o.language ?? "en", safeSearch: "moderate",
  })));
  const ids = [...new Set(searches.flatMap((s) => (s.items ?? []).map((/** @type {any} */ i) => i.id?.videoId)).filter(Boolean))];
  if (!ids.length) return [];
  const videos = await call("videos", { part: "snippet,statistics,contentDetails", id: ids.slice(0, 50).join(",") });
  const list = (videos.items ?? []).map((/** @type {any} */ v) => ({
    id: v.id, title: v.snippet?.title ?? "", channelId: v.snippet?.channelId ?? "", channelTitle: v.snippet?.channelTitle ?? "",
    publishedAt: v.snippet?.publishedAt ?? new Date(now).toISOString(), views: Number(v.statistics?.viewCount ?? 0), durationSeconds: isoSeconds(v.contentDetails?.duration ?? ""),
  }));
  const channelIds = [...new Set(list.map((/** @type {any} */ v) => v.channelId).filter(Boolean))];
  const channels = await call("channels", { part: "statistics", id: channelIds.slice(0, 50).join(",") });
  const stats = (channels.items ?? []).map((/** @type {any} */ c) => ({ id: c.id, subscribers: Number(c.statistics?.subscriberCount ?? 0), views: Number(c.statistics?.viewCount ?? 0), videos: Number(c.statistics?.videoCount ?? 0) }));
  return rankOutliers(list, stats, { now });
}

const DAY = 86_400_000;

/** @param {string} text */
async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The radar behind GET /api/ideas: checks the request, answers from a one-day
 * cache when the same search was made today (each search costs about 102 of
 * the 10,000 daily quota units), otherwise asks YouTube.
 * @param {{ apiKey?: string, query: unknown, months?: unknown, language?: unknown, cache?: { get(key: string): Promise<string | null>, put(key: string, text: string): Promise<void> }, fetch?: typeof fetch, now?: number }} o
 * @returns {Promise<{ ok: true, query: string, months: number, picks: import("../engine/src/topic-radar.mjs").RadarPick[], cached: boolean, at: string } | { ok: false, status: number, error: string }>}
 */
export async function radarSearch(o) {
  if (!o.apiKey) return { ok: false, status: 503, error: "Connect YouTube first: the YOUTUBE_API_KEY secret (docs/CONNECT.md)." };
  const query = typeof o.query === "string" ? o.query.trim().replace(/\s+/g, " ") : "";
  if (query.length < 2 || query.length > 200) return { ok: false, status: 400, error: "Give a niche of 2 to 200 characters, e.g. \"motivation life story\"." };
  const months = Math.round(Number(o.months ?? 12));
  if (!(months >= 1 && months <= 60)) return { ok: false, status: 400, error: "Months must be 1 to 60." };
  const language = typeof o.language === "string" && /^[a-z]{2}$/.test(o.language) ? o.language : "en";
  const now = o.now ?? Date.now();
  const key = `radar/${await sha256(`${query.toLowerCase()}|${months}|${language}`)}.json`;
  if (o.cache) {
    const hit = await o.cache.get(key).catch(() => null);
    if (hit) {
      try {
        const c = JSON.parse(hit);
        if (Array.isArray(c.picks) && now - Date.parse(c.at) < DAY) return { ok: true, query, months, picks: c.picks, cached: true, at: c.at };
      } catch { /* a broken cache entry is simply searched again */ }
    }
  }
  /** @type {import("../engine/src/topic-radar.mjs").RadarPick[]} */
  let picks;
  try {
    picks = await findOutliers({ apiKey: o.apiKey, query, months, language, fetch: o.fetch, now });
  } catch (error) {
    // Only our own messages go back to the page; anything else could carry a URL with the key.
    const message = error instanceof Error && error.message.startsWith("Topic radar:") ? error.message : "Topic radar: YouTube could not be reached. Try again in a minute.";
    return { ok: false, status: 502, error: message };
  }
  const at = new Date(now).toISOString();
  if (o.cache) await o.cache.put(key, JSON.stringify({ query, months, language, at, picks })).catch(() => {});
  return { ok: true, query, months, picks, cached: false, at };
}

/**
 * Chapters from a description: lines that start with a timestamp, the first at 0:00, at least three.
 * @param {string} description
 * @returns {{ at: number, title: string }[]}
 */
export function parseChapters(description) {
  const list = [];
  for (const line of String(description ?? "").split(/\r?\n/)) {
    const m = line.trim().match(/^[-•\s]*\(?(\d{1,2}(?::\d{2}){1,2})\)?[\s\-–—:.]*(.+)$/);
    if (!m) continue;
    const p = m[1].split(":").map(Number);
    const at = p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
    list.push({ at, title: m[2].trim().slice(0, 120) });
  }
  return list.length >= 3 && list[0].at === 0 ? list : [];
}

/**
 * Read-only metadata for videos by id, or for a channel's latest uploads by @handle (videos.list / channels.list / playlistItems.list).
 * @param {{ apiKey?: string, ids?: unknown, handle?: unknown, max?: unknown, pageToken?: unknown, fetch?: typeof fetch }} o
 * @returns {Promise<{ ok: true, channel?: { id: string, title: string }, videos: object[], nextPageToken?: string } | { ok: false, status: number, error: string }>}
 */
export async function videoDetails(o) {
  if (!o.apiKey) return { ok: false, status: 503, error: "Connect YouTube first: the YOUTUBE_API_KEY secret (docs/CONNECT.md)." };
  const get = o.fetch ?? fetch;
  const call = async (/** @type {string} */ path, /** @type {Record<string, string>} */ params) => {
    const res = await get(`${API}/${path}?${new URLSearchParams({ ...params, key: o.apiKey ?? "" })}`);
    if (!res.ok) throw new Error(`Video details: YouTube answered ${res.status}.`);
    return /** @type {any} */ (await res.json());
  };
  try {
    let ids = typeof o.ids === "string" ? o.ids.split(",").map((s) => s.trim()).filter(Boolean) : [];
    /** @type {{ id: string, title: string } | undefined} */
    let channel;
    /** @type {string | undefined} */
    let nextPageToken;
    if (!ids.length && typeof o.handle === "string") {
      if (!/^@?[\w.\-]{2,60}$/.test(o.handle)) return { ok: false, status: 400, error: "Give a channel handle like @lemmino." };
      const c = await call("channels", { part: "snippet,contentDetails", forHandle: o.handle.startsWith("@") ? o.handle : `@${o.handle}` });
      const item = c.items?.[0];
      if (!item) return { ok: false, status: 404, error: "No channel with that handle." };
      channel = { id: item.id, title: item.snippet?.title ?? "" };
      const max = Math.min(50, Math.max(1, Math.round(Number(o.max ?? 25))));
      // pageToken walks the uploads playlist (1 quota unit per 50 videos); the answer's nextPageToken says where to continue.
      const pl = await call("playlistItems", { part: "contentDetails", playlistId: item.contentDetails?.relatedPlaylists?.uploads ?? "", maxResults: String(max), ...(typeof o.pageToken === "string" && /^[\w-]{1,200}$/.test(o.pageToken) ? { pageToken: o.pageToken } : {}) });
      nextPageToken = typeof pl.nextPageToken === "string" ? pl.nextPageToken : undefined;
      ids = (pl.items ?? []).map((/** @type {any} */ i) => i.contentDetails?.videoId).filter(Boolean);
    }
    if (!ids.length) return { ok: false, status: 400, error: "Give ids (comma separated, up to 50) or a channel handle." };
    if (ids.length > 50 || ids.some((i) => !/^[\w-]{11}$/.test(i))) return { ok: false, status: 400, error: "Ids must be 11-character video ids, at most 50." };
    const v = await call("videos", { part: "snippet,contentDetails,statistics", id: ids.join(",") });
    const videos = (v.items ?? []).map((/** @type {any} */ x) => ({
      id: x.id, title: x.snippet?.title ?? "", channelId: x.snippet?.channelId ?? "", channelTitle: x.snippet?.channelTitle ?? "",
      publishedAt: x.snippet?.publishedAt ?? "", views: Number(x.statistics?.viewCount ?? 0), likes: Number(x.statistics?.likeCount ?? 0), comments: Number(x.statistics?.commentCount ?? 0),
      durationSeconds: isoSeconds(x.contentDetails?.duration ?? ""), chapters: parseChapters(x.snippet?.description ?? ""),
      descriptionOpening: String(x.snippet?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 300),
      thumbnail: x.snippet?.thumbnails?.maxres?.url ?? x.snippet?.thumbnails?.high?.url ?? "", tags: (x.snippet?.tags ?? []).slice(0, 15),
    }));
    return channel ? { ok: true, channel, videos, ...(nextPageToken ? { nextPageToken } : {}) } : { ok: true, videos };
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Video details:") ? error.message : "Video details: YouTube could not be reached. Try again in a minute.";
    return { ok: false, status: 502, error: message };
  }
}
