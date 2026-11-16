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
