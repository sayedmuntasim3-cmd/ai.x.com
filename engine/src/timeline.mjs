/**
 * The edit decision list of a film: which picture is on screen at every
 * frame, where each scene's narration sits, and the captions. Built from the
 * S5 scene lines and the media step's picks, so the render needs no model.
 *
 * Shots tile each scene exactly (gaps are closed by holding the previous
 * shot, overlaps are trimmed), and times are snapped to whole frames, so a
 * 45-minute film never drifts by a frame however many cuts it has.
 */
import { shotParts } from "./film-media.mjs";
import { parseSceneLines, toSeconds } from "./scene-lines.mjs";

/**
 * @typedef {import("./film-media.mjs").ChapterMedia} ChapterMedia
 * @typedef {{ id: string, scene: string, shot: number, start: number, end: number, frames: number, type: "clip" | "card" | "black", url: string | null, sourcePageUrl: string | null, licence: string | null, motion: "push" | "none", text: string, brief: string }} VideoSegment
 * @typedef {{ scene: string, start: number, end: number, text: string, placeholders: string[] }} NarrationItem
 * @typedef {{ start: number, end: number, text: string }} Caption
 * @typedef {{ width: number, height: number, fps: number, durationSeconds: number, frames: number, video: VideoSegment[], narration: NarrationItem[], captions: Caption[], notes: string[], stats: { clips: number, cards: number, black: number, scenes: number } }} Timeline
 */

const TIME = /^(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*[-–]\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*/;
const PLACEHOLDER = /\$?\[C\d{2,3}[^\]]*\]/g;

/**
 * The words a graphics card shows: the first quoted text of the on-screen
 * text field, else of the shot description, else nothing.
 * @param {string} shotText @param {string} ost
 */
export function cardText(shotText, ost) {
  const quoted = (/** @type {string} */ s) => /["“]([^"”]{2,80})["”]/.exec(s)?.[1]?.trim() ?? "";
  return quoted(ost) || quoted(shotText);
}

/**
 * Split narration into caption lines of at most maxChars, timed by length.
 * @param {string} text @param {number} start @param {number} end @param {number} [maxChars]
 * @returns {Caption[]}
 */
export function captionLines(text, start, end, maxChars = 42) {
  const words = text.replace(PLACEHOLDER, (m) => m.replace(/\s+/g, " ")).split(/\s+/).filter(Boolean);
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const w of words) {
    if (line && (line + " " + w).length > maxChars) { lines.push(line); line = w; }
    else line = line ? line + " " + w : w;
    // A sentence end is a natural caption break once the line is half full.
    if (/[.!?]$/.test(w) && line.length >= maxChars / 2) { lines.push(line); line = ""; }
  }
  if (line) lines.push(line);
  const total = lines.reduce((n, l) => n + l.length, 0) || 1;
  let t = start;
  return lines.map((l, i) => {
    const s = t;
    t = i === lines.length - 1 ? end : t + ((end - start) * l.length) / total;
    return { start: round3(s), end: round3(t), text: l.replace(/ /g, " ") };
  });
}

/**
 * @param {{ chapters: { id: string, markdown: string, media?: ChapterMedia | null }[], width?: number, height?: number, fps?: number, voice?: Record<string, { durationSeconds: number }> }} o
 * @returns {Timeline}
 */
export function buildTimeline(o) {
  const width = o.width ?? 1920;
  const height = o.height ?? 1080;
  const fps = o.fps ?? 30;
  const frameAt = (/** @type {number} */ t) => Math.round(t * fps);
  /** @type {VideoSegment[]} */
  const video = [];
  /** @type {NarrationItem[]} */
  const narration = [];
  /** @type {Caption[]} */
  const captions = [];
  /** @type {string[]} */
  const notes = [];
  let scenes = 0;
  let filmEnd = 0;

  for (const chapter of o.chapters) {
    const picks = new Map((chapter.media?.shots ?? []).map((s) => [`${s.scene}#${s.shot}`, s]));
    for (const s of parseSceneLines(chapter.markdown)) {
      scenes += 1;
      if (!(s.end > s.start)) { notes.push(`${s.sc}: no duration, skipped.`); continue; }
      if (s.start > filmEnd + 0.001) notes.push(`${s.sc}: ${round3(s.start - filmEnd)} s gap before it, held on the previous shot.`);
      filmEnd = Math.max(filmEnd, s.end);

      // Shot times: explicit ranges are kept (clamped to the scene); untimed shots share what is left.
      const parts = shotParts(s.fields.SHOTS ?? "");
      if (!parts.length) parts.push("R1 (no shot written)");
      /** @type {{ text: string, index: number, start: number | null, end: number | null }[]} */
      const shots = parts.map((text, k) => {
        const m = TIME.exec(text);
        const a = m ? toSeconds(m[1]) : NaN;
        const b = m ? toSeconds(m[2]) : NaN;
        return { text: m ? text.slice(m[0].length) : text, index: k + 1, start: Number.isFinite(a) ? clamp(a, s.start, s.end) : null, end: Number.isFinite(b) ? clamp(b, s.start, s.end) : null };
      });
      for (let k = 0; k < shots.length; k += 1) {
        if (shots[k].start !== null) continue;
        let j = k;
        while (j < shots.length && shots[j].start === null) j += 1;
        const from = k === 0 ? s.start : shots[k - 1].end ?? s.start;
        const to = j < shots.length ? shots[j].start ?? s.end : s.end;
        const step = (to - from) / (j - k);
        for (let x = k; x < j; x += 1) { shots[x].start = from + step * (x - k); shots[x].end = from + step * (x - k + 1); }
      }
      shots.sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
      shots[0].start = s.start;
      for (let k = 0; k < shots.length; k += 1) {
        const next = k + 1 < shots.length ? shots[k + 1].start ?? s.end : s.end;
        shots[k].end = next; // closes gaps and trims overlaps
      }

      const ost = s.fields.OST ?? "";
      const push = /push|zoom in|push-in/i.test(s.fields.MOTION ?? "");
      for (const shot of shots) {
        const start = shot.start ?? s.start;
        const end = shot.end ?? s.end;
        const frames = frameAt(end) - frameAt(start);
        if (frames <= 0) continue;
        const rung = /^(R\d)\b/.exec(shot.text)?.[1] ?? null;
        const row = picks.get(`${s.sc}#${shot.index}`);
        const base = { id: `${s.sc}-${shot.index}`, scene: s.sc, shot: shot.index, start: frameAt(start) / fps, end: frameAt(end) / fps, frames, brief: shot.text.slice(0, 240) };
        if (rung === "R1") {
          const black = /\bcut to black\b|\bblack (frame|card|hold)\b|^R1\s+[\d.]+\s*s\s+black/i.test(shot.text);
          video.push({ ...base, type: black ? "black" : "card", url: null, sourcePageUrl: null, licence: null, motion: "none", text: black ? "" : cardText(shot.text, ost) });
        } else if (row?.pick?.mediaUrl) {
          video.push({ ...base, type: "clip", url: row.pick.mediaUrl, sourcePageUrl: row.pick.sourcePageUrl, licence: row.pick.licence?.name ?? row.pick.licence?.licenseId ?? null, motion: push ? "push" : "none", text: "" });
        } else {
          notes.push(`${base.id}: no clip picked, a text card stands in.`);
          video.push({ ...base, type: "card", url: null, sourcePageUrl: null, licence: null, motion: "none", text: cardText(shot.text, ost) });
        }
      }

      if (!s.wordless) {
        const spoken = o.voice?.[s.sc]?.durationSeconds;
        const end = spoken ? Math.min(s.end, s.start + spoken) : s.end;
        const placeholders = s.narration.match(PLACEHOLDER) ?? [];
        if (placeholders.length) notes.push(`${s.sc}: narration still has ${placeholders.join(", ")}; resolve the number before recording.`);
        narration.push({ scene: s.sc, start: s.start, end: s.end, text: s.narration, placeholders });
        captions.push(...captionLines(s.narration, s.start, end));
      }
    }
  }
  const frames = video.reduce((n, v) => n + v.frames, 0);
  return {
    width, height, fps, durationSeconds: frames / fps, frames, video, narration, captions, notes,
    stats: { clips: video.filter((v) => v.type === "clip").length, cards: video.filter((v) => v.type === "card").length, black: video.filter((v) => v.type === "black").length, scenes },
  };
}

/**
 * SubRip captions, the format YouTube accepts on upload.
 * @param {Caption[]} captions
 */
export function toSrt(captions) {
  const ts = (/** @type {number} */ t) => {
    const ms = Math.round(t * 1000);
    const p = (/** @type {number} */ n, /** @type {number} */ w) => String(n).padStart(w, "0");
    return `${p(Math.floor(ms / 3600000), 2)}:${p(Math.floor(ms / 60000) % 60, 2)}:${p(Math.floor(ms / 1000) % 60, 2)},${p(ms % 1000, 3)}`;
  };
  return captions.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
}

/** @param {number} v @param {number} lo @param {number} hi */
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
/** @param {number} n */
function round3(n) { return Math.round(n * 1000) / 1000; }
