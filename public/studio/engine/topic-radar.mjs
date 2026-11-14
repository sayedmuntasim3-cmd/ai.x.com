/**
 * Topic radar: find topics with proven demand before writing. A video that
 * earns many times its channel's usual views (an "outlier") shows a topic the
 * audience wants, independent of the channel's size. The radar ranks such
 * videos for a niche, so the owner picks a topic with demand and the engine
 * writes its own, better film on it (never a copy of the video).
 *
 * Pure functions; the YouTube Data API calls live in worker/youtube.mjs.
 */

/**
 * @typedef {{ id: string, title: string, channelId: string, channelTitle: string, publishedAt: string, views: number, durationSeconds: number }} RadarVideo
 * @typedef {{ id: string, subscribers: number, views: number, videos: number }} RadarChannel
 * @typedef {RadarVideo & { channelAverage: number, outlier: number, perDay: number, score: number }} RadarPick
 */

/**
 * ISO 8601 duration ("PT1H2M3S") in seconds.
 * @param {string} iso
 */
export function isoSeconds(iso) {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(String(iso ?? ""));
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 86400) + (Number(m[2] ?? 0) * 3600) + (Number(m[3] ?? 0) * 60) + Number(m[4] ?? 0);
}

/**
 * Rank videos by how far they beat their own channel, weighted by fresh demand.
 * - outlier = views / the channel's average views per video;
 * - perDay = views per day since publishing (demand that is still alive);
 * - score = outlier, dampened for tiny channels whose average is noise, times a gentle freshness bonus.
 * Shorts (under 3 minutes) are left out unless asked for.
 * @param {RadarVideo[]} videos @param {RadarChannel[]} channels
 * @param {{ now?: number, minSeconds?: number, minViews?: number, limit?: number }} [o]
 * @returns {RadarPick[]}
 */
export function rankOutliers(videos, channels, o = {}) {
  const now = o.now ?? Date.now();
  const byId = new Map(channels.map((c) => [c.id, c]));
  /** @type {RadarPick[]} */
  const picks = [];
  for (const v of videos) {
    if (v.durationSeconds < (o.minSeconds ?? 180)) continue;
    if (v.views < (o.minViews ?? 10000)) continue;
    const c = byId.get(v.channelId);
    if (!c || !(c.videos > 0)) continue;
    const channelAverage = Math.max(1, c.views / c.videos);
    const outlier = v.views / channelAverage;
    const days = Math.max(1, (now - Date.parse(v.publishedAt)) / 86_400_000);
    const perDay = v.views / days;
    // A channel with a handful of videos has a noisy average: its outliers count for less.
    const confidence = Math.min(1, Math.log10(1 + c.videos) / 1.5);
    const freshness = 1 + 0.5 * Math.min(1, 365 / days);
    picks.push({ ...v, channelAverage: Math.round(channelAverage), outlier: Math.round(outlier * 10) / 10, perDay: Math.round(perDay), score: Math.round(outlier * confidence * freshness * 10) / 10 });
  }
  return picks.sort((a, b) => b.score - a.score).slice(0, o.limit ?? 20);
}
