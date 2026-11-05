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
 * @typedef {{ id: string, scene: string, shot: number, start: number, end: number, frames: number, type: "clip" | "card" | "black", url: string | null, sourcePageUrl: string | null, licence: string | null, motion: "push" | "none", text: string, title: string, chip: string, brief: string, sourceIn?: number, counter?: boolean, style?: "plain" | "paper", kinetic?: boolean, split?: string[], fadeIn?: number, fadeOut?: number, speed?: number, chapterTitle?: string, still?: boolean, transition?: Transition, map?: { lat: number, lon: number, label: string, to?: { lat: number, lon: number, label: string } } }} VideoSegment
 * @typedef {"whip" | "slide" | "zoom" | "flash"} Transition
 *   text: a card's own words; title: on-screen text laid over the scene's first clip; chip: the source chip shown with the scene's first shot;
 *   counter: the card's number counts up (FX-COUNTER) before it settles on the text as written;
 *   style: "paper" for FX-PAPER cards (document look); kinetic: text moves in (FX-KINETIC);
 *   split: the panels of an FX-SPLIT card ("A / B"), shown side by side, often two versions sources disagree on;
 *   fadeIn / fadeOut: seconds of dip through black at a chapter break or a written dissolve or fade;
 *   speed: below 1 for slow motion written in MOTION; chapterTitle: shown on a chapter's first shot;
 *   sourceIn: where in the clip the shot starts (the steady middle, never the clip's first frames when it is long enough)
 * @typedef {{ scene: string, start: number, end: number, text: string, placeholders: string[] }} NarrationItem
 * @typedef {{ text: string, start: number, end: number }} TimedWord
 * @typedef {{ start: number, end: number, text: string, words?: TimedWord[] }} Caption
 *   words: when each word is spoken (from the voice's own timings, or estimated), for word-by-word captions
 * @typedef {"documentary" | "cinematic" | "archive"} FilmLook
 *   documentary: a gentle grade; cinematic: a teal-and-warm grade and 2.39:1 bars (stories, motivation); archive: a faded warm grade (history)
 * @typedef {{ cue: string, start: number, end: number }} MusicSegment
 * @typedef {{ token: string, kind: "bed" | "hit", scene: string, start: number, end: number }} SoundEvent
 *   bed: ambience under the whole scene; hit: a one-shot from start (end is the scene's end)
 * @typedef {{ width: number, height: number, fps: number, durationSeconds: number, frames: number, video: VideoSegment[], narration: NarrationItem[], captions: Caption[], music: MusicSegment[], sfx: SoundEvent[], look: FilmLook, notes: string[], stats: { clips: number, cards: number, black: number, scenes: number } }} Timeline
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
 * The panels of a split card, from the shot's own description: "a / b" in one
 * quote, "a" / "b" as quotes, or two columns (options, cards) "a" and "b".
 * Source notes in brackets are dropped. Two or three panels, else null.
 * @param {string} text
 * @returns {string[] | null}
 */
export function splitPanels(text) {
  const clean = (/** @type {string} */ p) => p.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const Q = `["“]([^"”]{2,80})["”]`;
  const slashed = new RegExp(`${Q}\\s*\\/\\s*${Q}(?:\\s*\\/\\s*${Q})?`).exec(text);
  if (slashed) return slashed.slice(1).filter(Boolean).map(clean);
  const named = new RegExp(`\\btwo (?:\\w+ )?(?:columns|options|panels|cards)\\b[^"“]*${Q}\\s*(?:and|,|\\/)\\s*${Q}`, "i").exec(text);
  if (named) return [named[1], named[2]].map(clean);
  const one = quotes(text).find((q) => / \/ /.test(q));
  if (!one) return null;
  const parts = one.split(/\s+\/\s+/).map(clean).filter(Boolean);
  return parts.length >= 2 && parts.length <= 3 ? parts : null;
}

/** Quoted texts with at least one letter or digit, in order. @param {string} text */
function quotes(text) {
  return [...text.matchAll(/["“]([^"”]{1,160})["”]/g)].map((m) => m[1].trim()).filter((q) => /[\p{L}\p{N}]/u.test(q));
}

/**
 * The source chip of a scene's on-screen text: chip "C03 · cartoq.com 2025".
 * @param {string} ost
 */
export function sourceChip(ost) {
  return /\bchips?\s+["“]([^"”]{2,80})["”]/i.exec(ost)?.[1]?.trim() ?? "";
}

/** The most a voice is sped up to fit its scene (the renderer and the captions use the same rule). */
export const MAX_VOICE_TEMPO = 1.15;

/**
 * Words with their times from an ElevenLabs alignment (one time per
 * character), shifted to the scene's start and scaled by the speed-up.
 * @param {{ characters?: string[], character_start_times_seconds?: number[], character_end_times_seconds?: number[] } | null | undefined} alignment
 * @param {number} [offset] @param {number} [tempo]
 * @returns {TimedWord[]}
 */
export function wordsFromAlignment(alignment, offset = 0, tempo = 1) {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.character_start_times_seconds ?? [];
  const ends = alignment?.character_end_times_seconds ?? [];
  /** @type {TimedWord[]} */
  const words = [];
  /** @type {TimedWord | null} */
  let word = null;
  let inTag = false;
  for (let i = 0; i < chars.length; i += 1) {
    // ElevenLabs v3 delivery tags ("[softly]") are performance, not words: they never reach the captions.
    if (chars[i] === "[") { inTag = true; if (word) words.push(word); word = null; continue; }
    if (inTag) { if (chars[i] === "]") inTag = false; continue; }
    if (/\s/.test(chars[i])) { if (word) words.push(word); word = null; continue; }
    if (!word) word = { text: "", start: Number(starts[i]), end: Number(ends[i]) };
    word.text += chars[i];
    word.end = Number(ends[i]);
  }
  if (word) words.push(word);
  return words.filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end)).map((w) => ({ text: w.text, start: round3(offset + w.start / tempo), end: round3(offset + w.end / tempo) }));
}

/**
 * Caption lines from timed words: at most maxChars, broken at sentence ends
 * once half full, each line ending where the next begins when the gap is short.
 * @param {TimedWord[]} words @param {number} [maxChars]
 * @returns {Caption[]}
 */
export function captionsFromWords(words, maxChars = 42) {
  /** @type {Caption[]} */
  const out = [];
  /** @type {TimedWord[]} */
  let line = [];
  const joined = () => line.map((w) => w.text).join(" ");
  const flush = () => { if (line.length) out.push({ start: line[0].start, end: line[line.length - 1].end, text: joined(), words: line }); line = []; };
  for (const w of words) {
    if (line.length && (joined() + " " + w.text).length > maxChars) flush();
    line.push(w);
    if (/[.!?]["”']?$/.test(w.text) && joined().length >= maxChars / 2) flush();
  }
  flush();
  for (let i = 0; i < out.length - 1; i += 1) if (out[i + 1].start - out[i].end < 0.3) out[i].end = out[i + 1].start;
  return out;
}

/**
 * Split narration into caption lines of at most maxChars, timed by length
 * (each word gets a share of its line by its length).
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
    const text = l.replace(/\u00a0/g, " ");
    const parts = text.split(" ");
    const letters = parts.reduce((n, w) => n + w.length + 1, 0);
    let at = s;
    const words = parts.map((w) => { const from = at; at += ((t - s) * (w.length + 1)) / letters; return { text: w, start: round3(from), end: round3(at) }; });
    return { start: round3(s), end: round3(t), text, words };
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
 * Read a place from an FX-MAP shot: "(12.97, 77.59)", "12.97°N 77.59°E" or
 * "lat 12.97 lon 77.59", with the name written before it or in quotes.
 * @param {string} text
 * @returns {{ lat: number, lon: number, label: string } | null}
 */
export function mapPlace(text) {
  return mapPlaces(text)[0] ?? null;
}

/**
 * Every place written in a map shot, in order, each with the words before it
 * as its name: "FX-MAP route Mumbai (19.07, 72.88) to London (51.51, -0.13)".
 * @param {string} text
 * @returns {{ lat: number, lon: number, label: string }[]}
 */
export function mapPlaces(text) {
  const t = String(text ?? "");
  const re = /(\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])[,;\s]+(\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])|\(\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*\)|\blat(?:itude)?\s*(-?\d{1,2}(?:\.\d+)?)[,;\s]+lon(?:gitude)?\s*(-?\d{1,3}(?:\.\d+)?)/gi;
  /** @type {{ lat: number, lon: number, label: string }[]} */
  const out = [];
  let last = 0;
  const quotes = [...t.matchAll(/["“]([^"”]{2,60})["”]/g)].map((m) => m[1]);
  for (const m of t.matchAll(re)) {
    const lat = m[1] !== undefined ? Number(m[1]) * (/s/i.test(m[2]) ? -1 : 1) : m[5] !== undefined ? Number(m[5]) : Number(m[7]);
    const lon = m[1] !== undefined ? Number(m[3]) * (/w/i.test(m[4]) ? -1 : 1) : m[5] !== undefined ? Number(m[6]) : Number(m[8]);
    const before = t.slice(last, m.index).replace(/^R\d\s+/, "").replace(/\bFX-MAP\b|\bmap\b|\bpin\b|\blocator\b|\broute\b|\bjourney\b|\bfrom\b|\bto\b|\bon\b|->|→|[-:–]/gi, " ").replace(/\b(?:LOC|OBJ|CHR)-\d+\b/g, " ").replace(/["“”]/g, " ").replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");
    last = (m.index ?? 0) + m[0].length;
    if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) continue;
    const label = (quotes[out.length] && out.length === 0 && !before ? quotes[0] : before.split(/\s+/).slice(-4).join(" ") || quotes[out.length] || "").replace(/^[,\s]+|[,\s]+$/g, "");
    out.push({ lat, lon, label: label.slice(0, 40) });
  }
  return out;
}

/**
 * A route between the first two places of a map shot, when the shot says it
 * travels (route, to, a flight, a voyage, an arrow).
 * @param {string} text
 */
export function mapRoute(text) {
  const places = mapPlaces(text);
  if (places.length < 2 || !/\broute\b|\bto\b|->|→|\bjourney\b|\bflight\b|\bvoyage\b|\bpath\b|\bline\b/i.test(String(text))) return null;
  return { from: places[0], to: places[1] };
}

/**
 * The transition a scene's TRANS field asks for into its first shot, when it
 * is not a cut or a dip: a whip pan, a slide, a zoom through, or a white flash.
 * @param {string} trans
 * @returns {Transition | null}
 */
export function transitionFor(trans) {
  const t = String(trans ?? "").toLowerCase();
  if (/\b(whip|swish)\b/.test(t)) return "whip";
  if (/\bzoom[- ]?(through|transition|cut|in transition)\b|\bpunch[- ]?in transition\b/.test(t)) return "zoom";
  if (/\b(slide|push) (transition|left|right|across)\b|\bslide\b/.test(t)) return "slide";
  if (/\b(white )?flash\b|\bflash[- ]?cut\b/.test(t)) return "flash";
  return null;
}

/** Seconds of the dip through black at a chapter break, and at a written dissolve or fade. */
export const CHAPTER_DIP = 0.4;
export const SCENE_DIP = 0.25;

/**
 * Slow motion written in a scene's MOTION field ("slow motion", "0.5x",
 * "half speed"); 1 when there is none. Speed ramps and push-ins are not
 * slow motion.
 * @param {string} motion
 */
export function slowMotion(motion) {
  const factor = /\b(0?\.\d+)\s*[x×]\s*(?:speed|slow)?|\b(\d{2})\s*%\s*speed\b/i.exec(motion);
  if (factor) {
    const v = factor[1] ? Number(factor[1]) : Number(factor[2]) / 100;
    if (v >= 0.25 && v < 1) return v;
  }
  if (/\bhalf[- ]speed\b/i.test(motion)) return 0.5;
  if (/\bslow[- ]?(motion|mo)\b/i.test(motion)) return 0.6;
  return 1;
}

/**
 * @param {{ chapters: { id: string, markdown: string, media?: ChapterMedia | null, title?: string }[], width?: number, height?: number, fps?: number, voice?: Record<string, { durationSeconds: number, alignment?: Parameters<typeof wordsFromAlignment>[0] }>, look?: FilmLook }} o
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

  for (const [chapterIndex, chapter] of o.chapters.entries()) {
    const picks = new Map((chapter.media?.shots ?? []).map((s) => [`${s.scene}#${s.shot}`, s]));
    let chapterStart = chapterIndex > 0;
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
      const speed = slowMotion(s.fields.MOTION ?? "");
      // A chapter break dips through black; so does a dissolve or fade the script writes into this scene.
      const dip = chapterStart ? CHAPTER_DIP : /\b(cross[- ]?)?dissolve\b|\bdip\b|\bfade (to|from|in|out)\b/i.test(s.fields.TRANS ?? "") ? SCENE_DIP : 0;
      let first = true;
      for (const shot of shots) {
        const start = shot.start ?? s.start;
        const end = shot.end ?? s.end;
        const frames = frameAt(end) - frameAt(start);
        if (frames <= 0) continue;
        const rung = /^(R\d)\b/.exec(shot.text)?.[1] ?? null;
        const row = picks.get(`${s.sc}#${shot.index}`);
        /** @type {Omit<VideoSegment, "type" | "url" | "sourcePageUrl" | "licence" | "motion" | "text"> & Partial<VideoSegment>} */
        const base = { ...look, id: `${s.sc}-${shot.index}`, scene: s.sc, shot: shot.index, start: frameAt(start) / fps, end: frameAt(end) / fps, frames, brief: shot.text.slice(0, 240), title: "", chip: first ? chip : "" };
        const lead = first;
        first = false;
        if (lead && dip) {
          const previous = video[video.length - 1];
          if (previous && previous.type !== "black") previous.fadeOut = Math.min(dip, previous.frames / fps / 3);
          base.fadeIn = Math.min(dip, frames / fps / 3);
        }
        // A whip, slide, zoom or flash into the scene (never on top of a dip).
        const into = lead && !dip ? transitionFor(s.fields.TRANS ?? "") : null;
        if (into && video.length) base.transition = into;
        if (lead && chapterStart && chapter.title) base.chapterTitle = `${chapter.id.replace(/^C/, "Chapter ")} · ${chapter.title}`;
        if (lead) chapterStart = false;
        if (rung === "R1") {
          const black = /\bcut to black\b|\bblack (frame|card|hold)\b|^R1\s+[\d.]+\s*s\s+black/i.test(shot.text);
          const panels = !black && /FX-SPLIT|split card|two columns/i.test(`${fx} ${shot.text}`) ? splitPanels(shot.text) : null;
          let words = black ? "" : cardText(shot.text, ost);
          if (panels) {
            // The heading is the quote marked header, question or title, else the first quote that is not a panel.
            const marked = /\b(?:header|question|title|heading)\s*["“]([^"”]{2,80})["”]/i.exec(shot.text)?.[1];
            words = marked ?? quotes(shot.text).find((q) => !q.includes(" / ") && !panels.some((p) => q.includes(p) || p.includes(q))) ?? "";
          }
          // A map shot with the place's coordinates becomes an animated map; without them it stays a card.
          const isMap = !black && !panels && /FX-MAP|\bmap\b|\blocator\b/i.test(`${fx} ${shot.text}`);
          const route = isMap ? mapRoute(shot.text) : null;
          const place = route ? { ...route.from, to: route.to } : isMap ? mapPlace(shot.text) : null;
          video.push({ ...base, type: black ? "black" : "card", url: null, sourcePageUrl: null, licence: null, motion: "none", text: words, counter: !panels && !place && /COUNTER/i.test(fx) && /\d/.test(words), ...(panels ? { split: panels } : {}), ...(place ? { map: place } : {}) });
        } else if (row?.pick?.mediaUrl) {
          const clipSeconds = Number(row.pick.durationSeconds) || 0;
          const shotSeconds = frames / fps;
          const sourceIn = clipSeconds > shotSeconds ? Math.round(Math.min(3, (clipSeconds - shotSeconds) / 2) * 100) / 100 : 0;
          // A still photograph (an archive picture) always moves: the renderer gives it a slow push, pull or pan.
          const still = row.pick.kind === "image";
          video.push({ ...base, sourceIn: still ? 0 : sourceIn, ...(speed < 1 && !still ? { speed } : {}), ...(still ? { still: true } : {}), type: "clip", url: row.pick.mediaUrl, sourcePageUrl: row.pick.sourcePageUrl, licence: row.pick.licence?.name ?? row.pick.licence?.licenseId ?? null, motion: push || still ? "push" : "none", text: "", title: lead ? cardText("", ost) : "" });
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
        const alignment = o.voice?.[s.sc]?.alignment;
        const end = spoken ? Math.min(s.end, s.start + spoken) : s.end;
        const placeholders = s.narration.match(PLACEHOLDER) ?? [];
        if (placeholders.length) notes.push(`${s.sc}: narration still has ${placeholders.join(", ")}; resolve the number before recording.`);
        narration.push({ scene: s.sc, start: s.start, end: s.end, text: s.narration, placeholders });
        if (alignment) {
          // The voice's own timings: captions land on the word, sped up exactly as the renderer speeds the voice.
          const tempo = spoken && spoken > s.seconds ? Math.min(MAX_VOICE_TEMPO, spoken / s.seconds) : 1;
          const words = wordsFromAlignment(alignment, s.start, tempo).filter((w) => w.start < s.end).map((w) => ({ ...w, end: Math.min(w.end, s.end) }));
          captions.push(...(words.length ? captionsFromWords(words) : captionLines(s.narration, s.start, end)));
        } else captions.push(...captionLines(s.narration, s.start, end));
      }
    }
  }
  const frames = video.reduce((n, v) => n + v.frames, 0);
  return {
    width, height, fps, durationSeconds: frames / fps, frames, video, narration, captions, music, sfx, look: o.look ?? "documentary", notes,
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
