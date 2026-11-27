/**
 * The three Shorts of a film, chosen in code from the film's own words (no
 * model call): a stretch of 30 to 55 s that opens on a strong sentence (a
 * number, a name, a question, a surprise) and closes on a full stop, never
 * inside a sentence, never twice over the same seconds, and spread across the
 * film so the three Shorts are three different moments.
 *
 * A recitation is chosen from whole ayat only: the cut sits in the middle of
 * the measured pause after an ayah whose end two methods agree on, and never
 * inside an ayah (the rule of engine/src/quran-short.mjs, reused here).
 */

import { shortPassages } from "./quran-short.mjs";

/** @typedef {{ text: string, start: number, end: number, confidence?: number | null }} Word */
/** @typedef {{ text: string, start: number, end: number, words: Word[] }} Sentence */
/** @typedef {{ id: string, start: number, end: number, seconds: number, hook: string, score: number, opensWith: string, closesWith: string }} ShortPick */
/** @typedef {{ id: string, start: number, end: number, seconds: number, hook: string, surah: number, fromAyah: number, toAyah: number }} QuranPick */

/** Length limits and how many, from the task: a Short is 30 to 55 s. */
export const SHORT_LIMITS = Object.freeze({ min: 30, max: 55, target: 42, count: 3 });

/** A pause this long between words ends a sentence when the transcript has no punctuation. */
export const SENTENCE_PAUSE = 0.7;

/** Words that stop a thumb: a turn, a surprise, a stake. Matched on whole words, lower case. */
export const HOOK_WORDS = Object.freeze([
  "but", "however", "suddenly", "then", "never", "only", "secret", "hidden", "buried", "collapsed",
  "crash", "fire", "flood", "disaster", "warning", "failed", "failure", "error", "mistake", "banned",
  "billion", "million", "thousand", "hundred", "percent", "first", "last", "largest", "biggest",
  "deadliest", "worst", "best", "fastest", "deepest", "tallest", "longest", "oldest", "discovered",
  "forgotten", "abandoned", "survived", "died", "killed", "lost", "found", "stole", "lied", "refused",
]);

/** Number words count as numbers to a viewer's ear. */
export const NUMBER_WORDS = Object.freeze([
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred", "thousand",
  "million", "billion", "trillion", "half", "double", "triple", "twice", "dozen",
]);

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;

/** The words of a transcript, whatever shape the file came in. @param {any} raw @returns {Word[]} */
export function wordsOf(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.words) ? raw.words : [];
  /** @type {Word[]} */
  const out = [];
  for (const w of list) {
    const text = String(w?.text ?? w?.word ?? "").trim();
    const start = Number(w?.start);
    const end = Number(w?.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end < start) continue;
    out.push({ text, start: r3(start), end: r3(end), confidence: typeof w?.confidence === "number" ? w.confidence : null });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Whether a word ends its sentence: a full stop, a question or an exclamation. @param {string} text */
export function endsSentence(text) {
  return /[.!?…]["'”’)\]]*$/.test(String(text).trim());
}

/**
 * The transcript as sentences: on its punctuation, and on a long pause when the
 * transcript has none (speech-to-text usually carries no full stops).
 * @param {Word[]} words @param {{ pause?: number }} [o]
 * @returns {Sentence[]}
 */
export function sentences(words, o = {}) {
  const pause = o.pause ?? SENTENCE_PAUSE;
  /** @type {Sentence[]} */
  const out = [];
  /** @type {Word[]} */
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    const text = cur.map((w) => w.text).join(" ").replace(/\s+([,.;:!?])/g, "$1");
    out.push({ text, start: cur[0].start, end: cur[cur.length - 1].end, words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (endsSentence(w.text) || !next || next.start - w.end >= pause) flush();
  });
  flush();
  return out;
}

/**
 * How strongly a sentence opens a Short: a question, a number, a named thing or
 * a surprise word. Weak openers ("and so then...") lose a little.
 * @param {string} text
 */
export function hookScore(text) {
  const clean = String(text).trim();
  if (!clean) return 0;
  const words = clean.replace(/[^\p{L}\p{N}'’-]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  let score = 0;
  if (/\?/.test(clean)) score += 3;
  if (/\d/.test(clean)) score += 2.5;
  if (words.some((w) => NUMBER_WORDS.includes(w.toLowerCase()))) score += 1.5;
  // A capital inside the sentence is a name (the first word's capital is just grammar).
  if (words.slice(1).some((w) => /^[A-Z][a-z]/.test(w))) score += 1.5;
  const hooks = words.filter((w) => HOOK_WORDS.includes(w.toLowerCase().replace(/[^\p{L}]/gu, ""))).length;
  score += Math.min(3, hooks * 0.75);
  if (/^(and|so|then|but|also|well|okay|now)\b/i.test(clean)) score -= 0.75;
  if (words.length < 4) score -= 1;
  return Math.round(score * 100) / 100;
}

/** The words of a sentence a viewer would notice: numbers, names, hooks. @param {string} text */
export function strongWords(text) {
  const words = String(text).replace(/[^\p{L}\p{N}'’-]+/gu, " ").trim().split(/\s+/).filter(Boolean);
  return words.filter((w, i) => /\d/.test(w) || NUMBER_WORDS.includes(w.toLowerCase()) || HOOK_WORDS.includes(w.toLowerCase().replace(/[^\p{L}]/gu, "")) || (i > 0 && /^[A-Z][a-z]/.test(w)) || w.endsWith("?"));
}

/**
 * The line held on screen for the first seconds: the opening sentence's first
 * clause, at most `max` characters, cut at a word, never mid-word.
 * @param {string} text @param {number} [max]
 */
export function hookText(text, max = 64) {
  const clean = String(text).trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean.replace(/[.!?…]+$/, "");
  const cut = clean.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return (at > 24 ? cut.slice(0, at) : clean.slice(0, max)).replace(/[,;:.\s]+$/, "");
}

/**
 * Candidate stretches: every run of whole sentences 30 to 55 s long.
 * @param {Sentence[]} sents @param {{ min?: number, max?: number, target?: number }} [o]
 */
export function candidates(sents, o = {}) {
  const min = o.min ?? SHORT_LIMITS.min;
  const max = o.max ?? SHORT_LIMITS.max;
  const target = o.target ?? SHORT_LIMITS.target;
  /** @type {(ShortPick & { index: number, last: number, opensWith: string, closesWith: string })[]} */
  const out = [];
  for (let i = 0; i < sents.length; i += 1) {
    for (let j = i; j < sents.length; j += 1) {
      const seconds = sents[j].end - sents[i].start;
      if (seconds > max) break;
      if (seconds < min) continue;
      const hook = hookScore(sents[i].text);
      const punch = sents.slice(i, j + 1).reduce((n, s) => n + strongWords(s.text).length, 0);
      const fit = 1 - Math.abs(seconds - target) / target;
      out.push({
        id: "",
        index: i,
        last: j,
        start: r3(sents[i].start),
        end: r3(sents[j].end),
        seconds: r3(seconds),
        hook: hookText(sents[i].text),
        score: r3(hook + Math.min(3, punch * 0.3) + fit * 2),
        opensWith: sents[i].text,
        closesWith: sents[j].text,
      });
    }
  }
  return out;
}

/**
 * Choose up to `count` candidates that do not overlap, one from each stretch of
 * the film first (so the three Shorts are three different moments), then the
 * best of what is left.
 * @template {{ start: number, end: number }} T
 * @param {T[]} cands @param {{ count?: number, total: number }} o
 */
function spread(cands, o) {
  const count = o.count ?? SHORT_LIMITS.count;
  const total = Math.max(o.total, 0.001);
  const bucket = (/** @type {T} */ c) => Math.min(count - 1, Math.max(0, Math.floor((c.start / total) * count)));
  const free = (/** @type {T} */ c, /** @type {T[]} */ chosen) => chosen.every((x) => c.end <= x.start + 1e-6 || c.start >= x.end - 1e-6);
  /** @type {T[]} */
  const chosen = [];
  /** @type {T[]} */
  const sorted = [...cands].sort((a, b) => (/** @type {any} */ (b).score ?? 0) - (/** @type {any} */ (a).score ?? 0));
  for (let b = 0; b < count; b += 1) {
    const pick = sorted.find((c) => bucket(c) === b && free(c, chosen));
    if (pick) chosen.push(pick);
  }
  // The rest of the film's thirds, then any gap at all: a three-Short set beats two.
  for (const c of sorted) {
    if (chosen.length >= count) break;
    if (chosen.includes(c) || !free(c, chosen)) continue;
    chosen.push(c);
  }
  return chosen.sort((a, b) => a.start - b.start);
}

/**
 * The Shorts of a spoken film.
 * @param {Word[] | { words: Word[] }} words
 * @param {{ count?: number, min?: number, max?: number, target?: number, duration?: number, pause?: number }} [o]
 * @returns {ShortPick[]}
 */
export function pickVoiceShorts(words, o = {}) {
  const list = wordsOf(words);
  if (!list.length) return [];
  const sents = sentences(list, { pause: o.pause });
  const total = o.duration && o.duration > 0 ? o.duration : (sents[sents.length - 1]?.end ?? 0);
  const all = candidates(sents, o);
  if (!all.length) return [];
  const chosen = spread(all, { count: o.count ?? SHORT_LIMITS.count, total });
  return chosen.map((c, k) => ({
    id: `short-${k + 1}`,
    start: c.start,
    end: c.end,
    seconds: c.seconds,
    hook: c.hook,
    score: c.score,
    opensWith: c.opensWith,
    closesWith: c.closesWith,
  }));
}

/**
 * The Shorts of a recitation: whole ayat only, cut in the measured pause
 * between two ayat (the same rule that cuts the long recitation film).
 * @param {{ ayat: { surah: number, ayah: number, start: number, end: number, sure: boolean, repeat?: boolean }[] }} location
 * @param {number} totalSeconds
 * @param {{ count?: number, min?: number, max?: number, target?: number }} [o]
 * @returns {QuranPick[]}
 */
export function pickQuranShorts(location, totalSeconds, o = {}) {
  const count = o.count ?? SHORT_LIMITS.count;
  const min = o.min ?? SHORT_LIMITS.min;
  const max = o.max ?? SHORT_LIMITS.max;
  const target = o.target ?? SHORT_LIMITS.target;
  const all = shortPassages(location, totalSeconds).filter((p) => p.seconds >= min && p.seconds <= max);
  const ranked = all
    .map((p) => ({ ...p, score: Math.round((1 - Math.abs(p.seconds - target) / target) * 100) / 100 }))
    .sort((a, b) => b.score - a.score || a.cutIn - b.cutIn);
  const chosen = spread(ranked.map((p) => ({ ...p, start: p.cutIn, end: p.cutOut })), { count, total: totalSeconds });
  return chosen.map((p, k) => ({
    id: `short-${k + 1}`,
    start: p.cutIn,
    end: p.cutOut,
    seconds: p.seconds,
    hook: `Surah ${p.surah}, ${p.fromAyah === p.toAyah ? `ayah ${p.fromAyah}` : `ayat ${p.fromAyah}–${p.toAyah}`}`,
    surah: p.surah,
    fromAyah: p.fromAyah,
    toAyah: p.toAyah,
  }));
}

/**
 * Captions in the Shorts' own style: 2 to 4 words at a time (never one word
 * alone when the words allow it, never more than four), broken at sentence
 * ends and when a line would sit too long.
 * @param {Word[]} words @param {{ min?: number, max?: number, maxSeconds?: number }} [o]
 * @returns {{ start: number, end: number, text: string, words: Word[] }[]}
 */
export function captionChunks(words, o = {}) {
  const min = o.min ?? 2;
  const max = o.max ?? 4;
  const maxSeconds = o.maxSeconds ?? 3.2;
  const list = wordsOf(words);
  /** @type {Word[][]} */
  const chunks = [];
  /** @type {Word[]} */
  let cur = [];
  for (const w of list) {
    if (cur.length) {
      const long = w.end - cur[0].start > maxSeconds;
      const full = cur.length >= max;
      const afterStop = endsSentence(cur[cur.length - 1].text) && cur.length >= min;
      if (full || long || afterStop) { chunks.push(cur); cur = []; }
    }
    cur.push(w);
  }
  if (cur.length) chunks.push(cur);
  // Rebalance: a chunk of one word is moved next to its neighbour, never left alone on screen.
  for (let k = 0; k < chunks.length; k += 1) {
    if (chunks[k].length >= min) continue;
    const prev = chunks[k - 1];
    const next = chunks[k + 1];
    const moved = prev && prev.length > min ? prev.pop() : undefined;
    if (moved) chunks[k] = [moved, ...chunks[k]];
    else if (next && next.length < max) { chunks[k] = [...chunks[k], ...next]; chunks.splice(k + 1, 1); k -= 1; }
  }
  return chunks.filter((c) => c.length).map((c) => ({
    start: c[0].start,
    // A word with no measurable length still gets a frame of screen time.
    end: r3(Math.max(c[c.length - 1].end, c[0].start + 0.1)),
    text: c.map((w) => w.text).join(" "),
    words: c,
  }));
}

/**
 * How a 16:9 film is turned upright for one stretch: a card (words, a map, a
 * chart) is information spread across the frame, so the whole frame is kept and
 * the space above and below is filled with a blurred copy; a filmed subject is
 * normally centred, so it is centre-cropped and enlarged.
 * @param {{ type?: string, subject?: string, focus?: string }[]} shots the shots the stretch covers
 */
export function reframeMode(shots) {
  const informative = /^(card|chart|map|title|text|graphic|diagram)$/i;
  const central = /^(centre|center)$/i;
  const covered = shots.filter((s) => informative.test(String(s.type ?? "")) || /chart|map|diagram|title card|graphic/i.test(String(s.subject ?? "")));
  if (covered.length && !covered.every((s) => central.test(String(s.focus ?? "")))) return "blurred";
  return "crop";
}
