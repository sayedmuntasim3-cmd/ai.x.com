/**
 * Voice mode: the owner uploads a finished voiceover and the film is built on
 * it, in sync. Transcription gives every word a start and end. This module
 * cuts the words into scenes in code, so the voice and the picture can never
 * drift, and then checks what a model wrote for each scene against them:
 * - scene times come from the words, never from the model;
 * - NARR of every scene is the transcript's words, exactly, none added, none
 *   dropped, none reordered;
 * - the scenes run from 0 to the end of the recording with no gap or overlap.
 */
import { parseSceneLines, toClock } from "./scene-lines.mjs";

/** @typedef {{ text: string, start: number, end: number }} TimedWord */
/** @typedef {{ id: number, sc: string, start: number, end: number, from: number, to: number, words: TimedWord[], narration: string }} VoiceScene */
/** @typedef {{ code: string, scene: string | null, detail: string }} Finding */

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;
/** @param {string} w */
const sentenceEnd = (w) => /[.!?…؟।]["”')\]]*$/.test(w);
/** Words compared without case, punctuation or spacing differences. @param {string} s */
const key = (s) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Cut timed words into scenes at sentence ends, each between minSeconds and
 * maxSeconds long (a very long sentence is cut at its longest pause). A scene
 * starts where the previous one ends, in the middle of the pause between them.
 * @param {TimedWord[]} words
 * @param {number} totalSeconds length of the recording
 * @param {{ minSeconds?: number, targetSeconds?: number, maxSeconds?: number }} [o]
 * @returns {VoiceScene[]}
 */
export function splitVoiceScenes(words, totalSeconds, o = {}) {
  const min = o.minSeconds ?? 4;
  const target = o.targetSeconds ?? 8;
  const max = o.maxSeconds ?? 14;
  const clean = (Array.isArray(words) ? words : []).filter((w) => w && String(w.text).trim() && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start);
  if (!clean.length || !(totalSeconds > 0)) return [];
  /** @type {number[]} index after which a scene ends */
  const ends = [];
  let from = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const length = clean[i].end - clean[from].start;
    const last = i === clean.length - 1;
    if (last) { ends.push(i); break; }
    if (length >= min && sentenceEnd(clean[i].text) && (length >= target || clean[i + 1].start - clean[i].end >= 0.35)) { ends.push(i); from = i + 1; continue; }
    if (length >= max) {
      // No sentence end in time: cut at the longest pause in the scene, never in the middle of a word.
      let best = -1;
      let gap = -1;
      for (let k = from; k < i; k += 1) {
        const g = clean[k + 1].start - clean[k].end;
        if (g >= gap && clean[k].end - clean[from].start >= min) { gap = g; best = k; }
      }
      const cut = best >= 0 ? best : i;
      ends.push(cut);
      from = cut + 1;
      i = cut;
    }
  }
  // A tail shorter than min joins the scene before it.
  if (ends.length > 1) {
    const lastFrom = ends[ends.length - 2] + 1;
    if (clean[clean.length - 1].end - clean[lastFrom].start < min / 2) ends.splice(ends.length - 2, 1);
  }
  /** @type {VoiceScene[]} */
  const scenes = [];
  let begin = 0;
  ends.forEach((last, n) => {
    const first = begin;
    const start = n === 0 ? 0 : r3((clean[first - 1].end + clean[first].start) / 2);
    const end = n === ends.length - 1 ? r3(totalSeconds) : r3((clean[last].end + clean[last + 1].start) / 2);
    const slice = clean.slice(first, last + 1);
    scenes.push({ id: n + 1, sc: "SC" + String(n + 1).padStart(4, "0"), start, end: Math.max(end, r3(clean[last].end)), from: first, to: last, words: slice, narration: slice.map((w) => w.text).join(" ") });
    begin = last + 1;
  });
  // Make sure no scene starts before the previous one ends.
  for (let i = 1; i < scenes.length; i += 1) scenes[i].start = scenes[i - 1].end;
  return scenes;
}

/** @param {number} s */
function clock(s) {
  const whole = Math.floor(s);
  const ms = Math.round((s - whole) * 1000);
  return toClock(whole) + (ms ? "." + String(ms).padStart(3, "0") : "");
}

/**
 * The chapter skeleton the model fills in: times and NARR are final, the rest
 * (beat, claims, anchor, shots, look) are left for the model to write.
 * @param {VoiceScene[]} scenes @param {string} [chapter]
 */
export function voiceSkeleton(scenes, chapter = "C1") {
  return scenes
    .map((s) => `**${s.sc}** | ${clock(s.start)}-${clock(s.end)} | ${chapter} | BEAT | SLOT | CLAIMS | NARR: ${s.narration} | W ${s.words.length}/${s.words.length} | ANCHOR: TODO | SHOTS: TODO | LOOK: TODO`)
    .join("\n");
}

/**
 * Check a chapter the model wrote against the voice. A model may write the
 * shots, effects and look; it may not touch the times or the words.
 * @param {string} markdown @param {VoiceScene[]} scenes
 * @returns {Finding[]}
 */
export function checkVoiceChapter(markdown, scenes) {
  /** @type {Finding[]} */
  const out = [];
  const written = parseSceneLines(markdown);
  const byId = new Map(written.map((w) => [w.sc, w]));
  for (const s of scenes) {
    const w = byId.get(s.sc);
    if (!w) { out.push({ code: "scene-missing", scene: s.sc, detail: `${s.sc} is missing: the voice has ${s.words.length} words there.` }); continue; }
    if (Math.abs(w.start - s.start) > 0.01 || Math.abs(w.end - s.end) > 0.01) out.push({ code: "time-changed", scene: s.sc, detail: `${s.sc} must run ${clock(s.start)}-${clock(s.end)} (the voice's own timing), not ${clock(w.start)}-${clock(w.end)}.` });
    const want = s.words.map((x) => key(x.text)).filter(Boolean);
    const got = w.narration.replace(/\[[^\]]*\]/g, " ").split(/\s+/).map(key).filter(Boolean);
    if (want.join(" ") !== got.join(" ")) out.push({ code: "words-changed", scene: s.sc, detail: `${s.sc}: NARR must be the voiceover's words exactly: "${s.narration.slice(0, 80)}${s.narration.length > 80 ? "…" : ""}".` });
    if (/TODO/.test(w.raw)) out.push({ code: "unfinished", scene: s.sc, detail: `${s.sc} still has TODO fields.` });
  }
  for (const w of written) if (!scenes.some((s) => s.sc === w.sc)) out.push({ code: "scene-extra", scene: w.sc, detail: `${w.sc} is not a scene of this voiceover.` });
  return out;
}

/**
 * Put the voice's own times and words back into every line the model wrote,
 * so a model slip in time or wording is repaired in code, not argued about.
 * Lines that do not exist are left alone (they are reported by the check).
 * @param {string} markdown @param {VoiceScene[]} scenes
 */
export function restoreVoiceFields(markdown, scenes) {
  const by = new Map(scenes.map((s) => [s.sc, s]));
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const m = /^(\s*(?:\*\*)?(SC\d{4,5})(?:\*\*)?\s*\|\s*)(\d+:\d{2}:\d{2}(?:\.\d+)?\s*[-–]\s*\d+:\d{2}:\d{2}(?:\.\d+)?)(\s*\|.*)$/.exec(line);
      const s = m ? by.get(m[2]) : null;
      if (!m || !s) return line;
      const rest = m[4].replace(/NARR:\s?.*?(?=\s\|\sW\s|\s\|\s[A-Z][A-Z0-9]*(?: [A-Z0-9]+)?:|$)/, `NARR: ${s.narration}`);
      return `${m[1]}${clock(s.start)}-${clock(s.end)}${rest}`;
    })
    .join("\n");
}

/**
 * Captions from the recording's own word times.
 * @param {VoiceScene[]} scenes @param {number} [maxChars]
 */
export function voiceCaptions(scenes, maxChars = 42) {
  /** @type {{ start: number, end: number, text: string }[]} */
  const out = [];
  /** @type {TimedWord[]} */
  let line = [];
  const flush = () => { if (line.length) out.push({ start: line[0].start, end: line[line.length - 1].end, text: line.map((w) => w.text).join(" ") }); line = []; };
  for (const w of scenes.flatMap((s) => s.words)) {
    if (line.length && (line.map((x) => x.text).join(" ") + " " + w.text).length > maxChars) flush();
    line.push(w);
    if (sentenceEnd(w.text)) flush();
  }
  flush();
  return out;
}
