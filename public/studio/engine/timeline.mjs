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
 * @typedef {{ id: string, scene: string, shot: number, start: number, end: number, frames: number, type: "clip" | "card" | "black", url: string | null, sourcePageUrl: string | null, licence: string | null, motion: "push" | "none", text: string, title: string, chip: string, brief: string, sourceIn?: number, counter?: boolean, style?: "plain" | "paper", kinetic?: boolean }} VideoSegment
 *   text: a card's own words; title: on-screen text laid over the scene's first clip; chip: the source chip shown with the scene's first shot;
 *   counter: the card's number counts up (FX-COUNTER) before it settles on the text as written;
 *   style: "paper" for FX-PAPER cards (document look); kinetic: text moves in (FX-KINETIC);
 *   sourceIn: where in the clip the shot starts (the steady middle, never the clip's first frames when it is long enough)
 * @typedef {{ scene: string, start: number, end: number, text: string, placeholders: string[] }} NarrationItem
 * @typedef {{ start: number, end: number, text: string }} Caption
 * @typedef {{ cue: string, start: number, end: number }} MusicSegment
 * @typedef {{ token: string, kind: "bed" | "hit", scene: string, start: number, end: number }} SoundEvent
 *   bed: ambience under the whole scene; hit: a one-shot from start (end is the scene's end)
 * @typedef {{ width: number, height: number, fps: number, durationSeconds: number, frames: number, video: VideoSegment[], narration: NarrationItem[], captions: Caption[], music: MusicSegment[], sfx: SoundEvent[], notes: string[], stats: { clips: number, cards: number, black: number, scenes: number } }} Timeline
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
 * The source chip of a scene's on-screen text: chip "C03 · cartoq.com 2025".
 * @param {string} ost
 */
export function sourceChip(ost) {
  return /\bchips?\s+["“]([^"”]{2,80})["”]/i.exec(ost)?.[1]?.trim() ?? "";
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
 * The music under each scene, from its MUS field: the first cue ID (M01 ...)
 * plays; "in at" and "stop at" / "out at" times move its edges; a field that
 * names no cue, or says it drops out, is silence.
 * @param {string} mus @param {number} start @param {number} end
 * @returns {MusicSegment | null}
 */
export function sceneMusic(mus, start, end) {
  const cue = /\b(M\d{2,3})\b/.exec(mus)?.[1] ?? null;
  if (!cue || /^\s*(none|silence|no music)\b/i.test(mus) || /\bdrops? out\b/i.test(mus)) return null;
  const at = (/** @type {RegExp} */ re) => { const m = re.exec(mus); const t = m ? toSeconds(m[1]) : NaN; return Number.isFinite(t) ? clamp(t, start, end) : null; };
  const from = at(/\bin at (\d+:\d{2}:\d{2}(?:\.\d+)?)/i) ?? start;
  const to = at(/\b(?:stop|out|ends?) at (\d+:\d{2}:\d{2}(?:\.\d+)?)/i) ?? end;
  return to > from ? { cue, start: from, end: to } : null;
}

/**
 * The sounds of one scene from its SFX field ("SND-FX-05 snip on cut 1;
 * SND-AMB-02 street wash; SND-FX-06 thud on \"put up\""). Ambience (AMB) lies
 * under the whole scene; effects (FX, DES) land on the cut or word they name,
 * else at the scene's start. "All sound out" adds nothing.
 * @param {string} field @param {{ sc: string, start: number, end: number, narration: string }} scene @param {number[]} shotStarts start of shot 1, 2 ...
 * @returns {SoundEvent[]}
 */
export function sceneSounds(field, scene, shotStarts) {
  /** @type {SoundEvent[]} */
  const out = [];
  const words = scene.narration.toLowerCase().split(/\s+/).filter(Boolean);
  for (const item of field.split(/;\s*/)) {
    const token = /\bSND-(AMB|FX|DES)-\d{2,3}\b/.exec(item);
    if (!token) continue;
    if (token[1] === "AMB") { out.push({ token: token[0], kind: "bed", scene: scene.sc, start: scene.start, end: scene.end }); continue; }
    let at = scene.start;
    const cut = /\bon cut (\d+)/i.exec(item);
    const word = /\bon ["“]([^"”]+)["”]/i.exec(item);
    if (cut && shotStarts[Number(cut[1]) - 1] !== undefined) at = shotStarts[Number(cut[1]) - 1];
    else if (word && words.length) {
      const first = word[1].toLowerCase().split(/\s+/)[0].replace(/[^\p{L}\p{N}']/gu, "");
      const i = words.findIndex((w) => w.replace(/[^\p{L}\p{N}']/gu, "") === first);
      if (i >= 0) at = scene.start + ((scene.end - scene.start) * i) / words.length;
    }
    out.push({ token: token[0], kind: "hit", scene: scene.sc, start: Math.round(at * 1000) / 1000, end: scene.end });
  }
  return out;
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
  /** @type {MusicSegment[]} */
  const music = [];
  /** @type {SoundEvent[]} */
  const sfx = [];
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
      const chip = sourceChip(ost);
      const fx = s.fields.FX ?? "";
      const look = { style: /** @type {"plain" | "paper"} */ (/FX-PAPER/i.test(fx) ? "paper" : "plain"), kinetic: /FX-KINETIC/i.test(fx) };
      let first = true;
      for (const shot of shots) {
        const start = shot.start ?? s.start;
        const end = shot.end ?? s.end;
        const frames = frameAt(end) - frameAt(start);
        if (frames <= 0) continue;
        const rung = /^(R\d)\b/.exec(shot.text)?.[1] ?? null;
        const row = picks.get(`${s.sc}#${shot.index}`);
        const base = { ...look, id: `${s.sc}-${shot.index}`, scene: s.sc, shot: shot.index, start: frameAt(start) / fps, end: frameAt(end) / fps, frames, brief: shot.text.slice(0, 240), title: "", chip: first ? chip : "" };
        const lead = first;
        first = false;
        if (rung === "R1") {
          const black = /\bcut to black\b|\bblack (frame|card|hold)\b|^R1\s+[\d.]+\s*s\s+black/i.test(shot.text);
          const words = black ? "" : cardText(shot.text, ost);
          video.push({ ...base, type: black ? "black" : "card", url: null, sourcePageUrl: null, licence: null, motion: "none", text: words, counter: /COUNTER/i.test(s.fields.FX ?? "") && /\d/.test(words) });
        } else if (row?.pick?.mediaUrl) {
          const clipSeconds = Number(row.pick.durationSeconds) || 0;
          const shotSeconds = frames / fps;
          const sourceIn = clipSeconds > shotSeconds ? Math.round(Math.min(3, (clipSeconds - shotSeconds) / 2) * 100) / 100 : 0;
          video.push({ ...base, sourceIn, type: "clip", url: row.pick.mediaUrl, sourcePageUrl: row.pick.sourcePageUrl, licence: row.pick.licence?.name ?? row.pick.licence?.licenseId ?? null, motion: push ? "push" : "none", text: "", title: lead ? cardText("", ost) : "" });
        } else {
          notes.push(`${base.id}: no clip picked, a text card stands in.`);
          video.push({ ...base, type: "card", url: null, sourcePageUrl: null, licence: null, motion: "none", text: cardText(shot.text, ost) });
        }
      }

      sfx.push(...sceneSounds(s.fields.SFX ?? "", s, shots.map((x) => x.start ?? s.start)));

      const cue = sceneMusic(s.fields.MUS ?? "", s.start, s.end);
      if (cue) {
        const last = music[music.length - 1];
        // The same cue across touching scenes is one continuous segment.
        if (last && last.cue === cue.cue && Math.abs(last.end - cue.start) < 0.001) last.end = cue.end;
        else music.push(cue);
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
    width, height, fps, durationSeconds: frames / fps, frames, video, narration, captions, music, sfx, notes,
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
