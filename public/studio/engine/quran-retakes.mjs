/**
 * Quran recitation retakes: a hafiz who stumbles, repeats words to correct
 * himself, stops mid-word or starts an ayah again leaves several attempts in
 * the recording. This module finds those attempts from the recogniser's timed
 * words and the located passage's own Tanzil words, and returns the cuts that
 * keep only the LAST complete take.
 *
 * Nothing here touches the Quran text: `expected` are the index's words, read
 * from the shipped Tanzil file, and the heard words are only compared with
 * them through the existing Arabic normaliser. A cut is a pair of times; the
 * audio cutter is engine/src/voice-tighten.mjs (applyTighten), never a second
 * one.
 *
 * What is detected:
 *  - restart: the reciter jumps back to words he already recited; the earlier
 *    attempt (from where the repeated words first began to where he restarted)
 *    is the failed take;
 *  - garbled: a stretch between two matched words (2+ words or 0.6+ s) that
 *    matches no expected word;
 *  - broken-word: a word cut off and said again straight away (the fuller one
 *    is kept).
 *
 * Safety is not optional: after the cuts the kept words must hold every
 * expected word, in order, exactly once. When that fails, or fewer than 80% of
 * the expected words were matched at all, NO cut is made and the reviewer gets
 * a gap message instead.
 */

import { tokenizeArabic, wordSimilarity } from "./arabic.mjs";
import { AYAH_COUNTS } from "./quran.mjs";
import { msg } from "./messages.mjs";

/** @typedef {{ start: number, end: number }} Span */
/** @typedef {{ text: string, start: number, end: number }} HeardWord */
/** @typedef {{ from: number, to: number, seconds: number, reason: "restart" | "garbled" | "broken-word", words: string[] }} RetakeCut */

/** The rules, in one place, so a test and the reviewer read the same numbers. */
export const RETAKE = Object.freeze({
  /** A heard word counts as an expected word at this similarity (quran.mjs uses the same 0.75). */
  similarity: 0.75,
  /** How far back a heard word may match (a restart jumps back inside this window), and how far forward. */
  lookBack: 40,
  ahead: 8,
  /** Words that must match in a row before a jump back is taken as a restart, not a mishearing. */
  confirm: 2,
  /** A stretch that matches no expected word: at least this many words, or this long. */
  garbledWords: 2,
  garbledSeconds: 0.6,
  /** A broken word is this much shorter than the fuller word said straight after it, and a prefix of it. */
  brokenShare: 0.6,
  retrySeconds: 0.6,
  /** Below this share of the expected words matched, nothing is cut. */
  minConfidence: 0.8,
  /** A cut edge moves to the quietest point within this many seconds. */
  snapSeconds: 0.15,
});

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * The Tanzil words of the located ayat, in recited order: exactly the index's
 * words, never retyped. The basmala Tanzil writes into a first ayah is not in
 * the index's matching words, so it is not here either.
 * @param {{ ayat: { surah: number, ayah: number, firstWord: number, wordCount: number }[], words: string[] }} index
 * @param {{ surah: number, ayah: number }[]} ayat
 * @returns {string[]}
 */
export function wordsOfAyat(index, ayat) {
  /** @type {string[]} */
  const out = [];
  for (const a of Array.isArray(ayat) ? ayat : []) {
    let offset = (a?.ayah ?? 0) - 1;
    for (let s = 1; s < (a?.surah ?? 0); s += 1) offset += AYAH_COUNTS[s - 1];
    const entry = index?.ayat?.[offset];
    if (!entry || entry.surah !== a.surah || entry.ayah !== a.ayah) continue;
    for (let k = 0; k < entry.wordCount; k += 1) out.push(index.words[entry.firstWord + k]);
  }
  return out;
}

/**
 * The cuts that keep only the last complete take.
 * @param {{ words: HeardWord[], expected: string[] }} o words: the recogniser's words with seconds; expected: the located passage's Tanzil words, in order
 * @returns {{ cuts: RetakeCut[], keptOrderOk: boolean, confidence: number, removedSeconds: number, message: import("./messages.mjs").Message }}
 */
export function planRetakes({ words, expected }) {
  /** @type {{ text: string, token: string, start: number, end: number }[]} */
  const heard = (Array.isArray(words) ? words : []).map((w) => {
    const tokens = tokenizeArabic(w?.text ?? "");
    return { text: String(w?.text ?? ""), token: tokens[0] ?? "", start: Number(w?.start), end: Number(w?.end) };
  });
  const exp = (Array.isArray(expected) ? expected : []).flatMap((e) => tokenizeArabic(e));
  const timed = heard.map((h, i) => (h.token && Number.isFinite(h.start) && Number.isFinite(h.end) && h.end >= h.start ? i : -1)).filter((i) => i >= 0);
  if (!exp.length || !timed.length) return nothing(0, exp.length, "quran.retakesGap");

  // A broken word: a short prefix said again straight away as the fuller word. It is taken out of the
  // alignment (the fuller word is the one that should match), and its own cut is kept.
  const broken = new Uint8Array(heard.length);
  for (let k = 0; k + 1 < timed.length; k += 1) {
    const i = timed[k], j = timed[k + 1];
    const a = heard[i], b = heard[j];
    const da = a.end - a.start, db = b.end - b.start;
    if (a.token.length < 2 || db <= 0) continue;
    if (!b.token.startsWith(a.token) || a.token.length >= b.token.length) continue;
    if (da > RETAKE.brokenShare * db) continue;
    if (a.end > b.start + 0.05 || b.start - a.start > RETAKE.retrySeconds) continue;
    broken[i] = 1;
  }

  // One forward pass: each heard word finds the expected word it is closest to, following the reciter
  // (so a jump back is followed, not fought). Unmatched words are the recogniser's noise or a stumble.
  const align = new Int32Array(heard.length).fill(-1);
  let cursor = 0;
  for (const i of timed) {
    if (broken[i]) continue;
    const h = heard[i];
    const from = Math.max(0, cursor - RETAKE.lookBack);
    const to = Math.min(exp.length, cursor + RETAKE.ahead);
    let best = -1, bestScore = -Infinity;
    for (let c = from; c < to; c += 1) {
      const sim = h.token === exp[c] ? 1 : wordSimilarity(h.token, exp[c]);
      if (sim < RETAKE.similarity) continue;
      // The nearest place to where the reciter was wins, then the closer spelling.
      const score = sim - 0.01 * Math.abs(c - cursor);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best < 0) continue;
    align[i] = best;
    cursor = best + 1;
  }

  const hit = new Uint8Array(exp.length);
  for (let i = 0; i < heard.length; i += 1) if (align[i] >= 0) hit[align[i]] = 1;
  const matched = hit.reduce((n, v) => n + v, 0);
  const confidence = r3(matched / exp.length);

  /** @type {{ from: number, to: number, reason: RetakeCut["reason"], words: string[] }[]} */
  const raw = [];
  /** @param {number} iFrom @param {number} iTo @param {RetakeCut["reason"]} reason */
  const cutWords = (iFrom, iTo, reason) => {
    const from = heard[iFrom].start, to = heard[iTo].start;
    if (!(to > from)) return;
    raw.push({ from: r3(from), to: r3(to), reason, words: heard.slice(iFrom, iTo).map((h) => h.text) });
  };

  // (a) Restarts: a word matched to an expected word already recited (two or more words back), confirmed by
  // the words that follow it. The failed take runs from the first word of the earlier attempt to the restart.
  const furthest = new Int32Array(heard.length).fill(-1);
  let max = -1;
  for (let k = 0; k < heard.length; k += 1) {
    furthest[k] = max;
    if (align[k] >= 0) max = Math.max(max, align[k]);
  }
  for (let k = 0; k < heard.length; k += 1) {
    const c = align[k];
    if (c < 0 || c >= furthest[k] - 1) continue;
    let run = 0;
    while (run < RETAKE.confirm && k + run < heard.length && align[k + run] === c + run) run += 1;
    if (run < RETAKE.confirm) continue;
    // Walk back over the earlier attempt to the word that recited this same word: there the repeated stretch began.
    let j = k - 1;
    while (j > 0 && align[j - 1] >= 0 && align[j - 1] === align[j] - 1 && align[j - 1] >= c) j -= 1;
    if (align[j] !== c) continue;
    cutWords(j, k, "restart");
  }

  // (c) A word cut off and said again: the broken word's own try goes, the fuller one stays.
  for (let k = 0; k + 1 < timed.length; k += 1) {
    const i = timed[k];
    if (broken[i]) cutWords(i, timed[k + 1], "broken-word");
  }

  // (b) A garbled stretch between two matched words that matches no expected word: it is not the passage.
  // Words before the first match and after the last are left alone (the isti'adha, the basmala, the closing).
  for (let k = 0; k < heard.length; k += 1) {
    if (align[k] >= 0 || broken[k] || !heard[k].token) continue;
    let e = k;
    while (e + 1 < heard.length && align[e + 1] < 0 && !broken[e + 1]) e += 1;
    const before = k - 1, after = e + 1;
    const span = heard[e].end - heard[k].start;
    const count = e - k + 1;
    if (before >= 0 && align[before] >= 0 && after < heard.length && align[after] >= 0 && (count >= RETAKE.garbledWords || span >= RETAKE.garbledSeconds)) cutWords(k, after, "garbled");
    k = e;
  }

  /** @type {RetakeCut[]} */
  let cuts = merge(raw);

  // Safety: what is left must be the whole passage, in order, once. Otherwise no cut at all.
  const kept = heard.filter((h) => Number.isFinite(h.start) && !cuts.some((c) => h.start >= c.from - 1e-6 && h.start < c.to - 1e-6));
  const keptOrderOk = inOrderOnce(kept, exp);
  if (!keptOrderOk || confidence < RETAKE.minConfidence) return nothing(confidence, exp.length, "quran.retakesGap", matched);

  const removedSeconds = r3(cuts.reduce((n, c) => n + c.seconds, 0));
  return { cuts, keptOrderOk, confidence, removedSeconds, message: msg("quran.retakes", { count: cuts.length, seconds: removedSeconds }) };
}

/**
 * The quietest point within `reach` of each cut edge: a cut may land at a word
 * start but must never open inside a kept word, so an edge moves to the nearest
 * measured silence (the voiced stretches voice-analyze.mjs already found).
 * @param {RetakeCut[]} cuts @param {Span[]} spans @param {number} [reach]
 * @returns {RetakeCut[]}
 */
export function snapCuts(cuts, spans, reach = RETAKE.snapSeconds) {
  const voiced = (Array.isArray(spans) ? spans : []).filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  if (!voiced.length) return cuts;
  /** Quiet stretches: before the first, between each pair, after the last. */
  /** @type {Span[]} */
  const gaps = [];
  if (voiced[0].start > 0) gaps.push({ start: 0, end: voiced[0].start });
  for (let j = 1; j < voiced.length; j += 1) if (voiced[j].start > voiced[j - 1].end) gaps.push({ start: voiced[j - 1].end, end: voiced[j].start });
  gaps.push({ start: voiced[voiced.length - 1].end, end: Infinity });
  /** @param {number} t */
  const quiet = (t) => {
    let best = t, bestDistance = reach;
    for (const g of gaps) {
      // The nearest point of this gap to t; inside the gap already, it is t itself.
      const p = t < g.start ? g.start : t > g.end ? g.end : t;
      const distance = Math.abs(p - t);
      if (distance < bestDistance) { best = p; bestDistance = distance; }
    }
    return r3(best);
  };
  return cuts.map((c) => {
    const from = quiet(c.from), to = quiet(c.to);
    return to > from ? { ...c, from, to, seconds: r3(to - from) } : c;
  });
}

/**
 * Do these words hold every expected word, in order, exactly once? Words that
 * match nothing (recogniser noise) are passed over; a word that skips forward
 * means expected words are missing, a word that points back means a take was
 * kept twice.
 * @param {{ token: string }[]} kept @param {string[]} exp
 */
function inOrderOnce(kept, exp) {
  let cursor = 0;
  for (let i = 0; i < kept.length; i += 1) {
    const h = kept[i];
    if (!h.token) continue;
    const low = Math.max(0, cursor - 3), high = Math.min(exp.length, cursor + RETAKE.ahead);
    let best = -1, bestScore = -Infinity;
    for (let c = low; c < high; c += 1) {
      const sim = h.token === exp[c] ? 1 : wordSimilarity(h.token, exp[c]);
      if (sim < RETAKE.similarity) continue;
      // The nearest place to where the reciter already is wins: a word said twice in the surah is not a repeat.
      const score = sim - 0.01 * Math.abs(c - cursor);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best < 0) continue;
    if (best !== cursor) return false;
    cursor += 1;
    // Nothing of the passage may be recited again after its last word.
    if (cursor === exp.length) return !kept.slice(i + 1).some((x) => x.token && exp.some((e) => wordSimilarity(x.token, e) >= RETAKE.similarity));
  }
  return cursor === exp.length;
}

/**
 * Overlapping cuts become one; cuts that only touch stay separate (they are
 * different reasons and the reviewer should see both).
 * @param {{ from: number, to: number, reason: RetakeCut["reason"], words: string[] }[]} raw
 * @returns {RetakeCut[]}
 */
function merge(raw) {
  const sorted = [...raw].sort((a, b) => a.from - b.from || b.to - a.to);
  /** @type {{ from: number, to: number, reason: RetakeCut["reason"], words: string[] }[]} */
  const out = [];
  for (const c of sorted) {
    const last = out[out.length - 1];
    if (last && c.from < last.to - 1e-6) {
      last.to = Math.max(last.to, c.to);
      last.words = [...last.words, ...c.words];
      continue;
    }
    out.push({ ...c });
  }
  return out.map((c) => ({ from: c.from, to: c.to, seconds: r3(c.to - c.from), reason: c.reason, words: c.words }));
}

/**
 * No cuts, and the reviewer is told why.
 * @param {number} confidence @param {number} expectedCount @param {"quran.retakesGap"} code @param {number} [matched]
 */
function nothing(confidence, expectedCount, code, matched = 0) {
  return {
    cuts: /** @type {RetakeCut[]} */ ([]),
    keptOrderOk: false,
    confidence,
    removedSeconds: 0,
    message: msg(code, { matched, expected: expectedCount, confidence: Math.round(confidence * 100) }),
  };
}
