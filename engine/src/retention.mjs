/**
 * Learning from the channel's own audience: a published film's retention
 * curve (YouTube Analytics, audienceWatchRatio by elapsedVideoTimeRatio) is
 * laid over its scenes, so each drop is tied to what was said and shown at
 * that moment. The lessons of the last films go to the writers and the Edit
 * Director of the next ones. Pure: the Worker fetches, this module reads.
 */
import { parseSceneLines } from "./scene-lines.mjs";

/**
 * @typedef {{ ratio: number, watch: number }} CurvePoint  ratio: 0..1 of the video; watch: share of viewers still watching
 * @typedef {{ scene: string, start: number, end: number, lossPct: number, perMinute: number, said: string, seen: string, trans: string, fx: string }} SceneMoment
 * @typedef {{ filmId: string, title: string, videoId: string, at: string, durationSeconds: number, at30: number | null, at60: number | null, half: number | null, end: number | null, drops: SceneMoment[], holds: SceneMoment[] }} RetentionReport
 */

/**
 * The curve from a YouTube Analytics report (rows of [ratio, watch, ...]).
 * @param {{ rows?: unknown[][] }} report
 * @returns {CurvePoint[]}
 */
export function curveFromReport(report) {
  return (Array.isArray(report?.rows) ? report.rows : [])
    .map((r) => ({ ratio: Number(r[0]), watch: Number(r[1]) }))
    .filter((p) => Number.isFinite(p.ratio) && Number.isFinite(p.watch) && p.ratio >= 0 && p.ratio <= 1)
    .sort((a, b) => a.ratio - b.ratio);
}

/**
 * The share still watching at a second of the film (linear between points).
 * @param {CurvePoint[]} curve @param {number} t @param {number} duration
 */
export function watchingAt(curve, t, duration) {
  if (!curve.length || !(duration > 0)) return null;
  const x = Math.min(1, Math.max(0, t / duration));
  let i = curve.findIndex((p) => p.ratio >= x);
  if (i < 0) return curve[curve.length - 1].watch;
  if (i === 0) return curve[0].watch;
  const a = curve[i - 1];
  const b = curve[i];
  return a.watch + ((b.watch - a.watch) * (x - a.ratio)) / Math.max(1e-9, b.ratio - a.ratio);
}

/**
 * Where viewers left, scene by scene: the scenes that lost viewers fastest
 * (over twice the film's usual rate, after the first 30 s) and the scenes
 * that held them best (or brought them back).
 * @param {{ filmId: string, title?: string, videoId: string, curve: CurvePoint[], durationSeconds: number, chapters: { markdown: string }[], at?: string }} o
 * @returns {RetentionReport}
 */
export function retentionReport(o) {
  const d = o.durationSeconds;
  const scenes = o.chapters.flatMap((c) => parseSceneLines(c.markdown)).filter((s) => s.end > s.start && s.start < d);
  const round = (/** @type {number | null} */ v) => (v === null ? null : Math.round(v * 1000) / 10);
  /** @type {SceneMoment[]} */
  const moments = scenes.map((s) => {
    const a = watchingAt(o.curve, s.start, d) ?? 0;
    const b = watchingAt(o.curve, Math.min(s.end, d), d) ?? 0;
    const loss = a - b;
    return {
      scene: s.sc, start: s.start, end: s.end, lossPct: Math.round(loss * 1000) / 10, perMinute: Math.round((loss / (s.end - s.start)) * 60 * 1000) / 10,
      said: s.wordless ? "(wordless)" : s.narration.replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").slice(0, 140),
      seen: (s.fields.SHOTS ?? "").replace(/\s+/g, " ").slice(0, 120), trans: (s.fields.TRANS ?? "").slice(0, 40), fx: (s.fields.FX ?? "").slice(0, 60),
    };
  });
  const body = moments.filter((m) => m.start >= 30);
  const rates = body.map((m) => m.perMinute).sort((a, b) => a - b);
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
  const drops = body.filter((m) => m.lossPct >= 1 && m.perMinute > Math.max(0.5, median * 2)).sort((a, b) => b.perMinute - a.perMinute).slice(0, 6);
  const holds = body.filter((m) => m.perMinute <= Math.max(0, median * 0.25)).sort((a, b) => a.perMinute - b.perMinute).slice(0, 4);
  return {
    filmId: o.filmId, title: o.title ?? "", videoId: o.videoId, at: o.at ?? new Date().toISOString(), durationSeconds: d,
    at30: round(watchingAt(o.curve, 30, d)), at60: round(watchingAt(o.curve, 60, d)), half: round(watchingAt(o.curve, d / 2, d)), end: round(watchingAt(o.curve, d * 0.98, d)),
    drops, holds,
  };
}

/**
 * The channel's lessons for the next film's writers and editor: the last
 * few films, newest first, with the moments viewers left and stayed.
 * @param {RetentionReport[]} reports
 * @param {number} [films]
 */
export function lessonsText(reports, films = 5) {
  const clock = (/** @type {number} */ s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const list = [...reports].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, films);
  if (!list.length) return "";
  const lines = list.flatMap((r) => [
    `"${r.title || r.filmId}": ${r.at30 ?? "?"}% still watching at 0:30, ${r.at60 ?? "?"}% at 1:00, ${r.half ?? "?"}% at the middle, ${r.end ?? "?"}% at the end.`,
    ...r.drops.slice(0, 4).map((m) => `  LEFT at ${clock(m.start)} (${m.perMinute}%/min): said "${m.said}"; seen ${m.seen || "?"}${m.trans ? `; ${m.trans}` : ""}`),
    ...r.holds.slice(0, 2).map((m) => `  HELD at ${clock(m.start)}: said "${m.said}"; seen ${m.seen || "?"}`),
  ]);
  return lines.join("\n");
}

/**
 * A YouTube video id from an id or any YouTube link.
 * @param {unknown} input
 */
export function videoIdOf(input) {
  const s = String(input ?? "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/.exec(s);
  return m ? m[1] : null;
}
