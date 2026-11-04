/**
 * Recognise which surah and ayat a recording recites, from its transcript.
 *
 * The owner uploads their own recitation; speech recognition turns it into
 * words (with times when available); this module aligns those words against
 * the Tanzil Quran text and returns the surah, the ayah range and, for each
 * ayah, where it starts and ends in the recording. Visuals, captions and cuts
 * are then planned per ayah. The Quran text itself is never generated: what
 * is shown on screen is the Tanzil text, verbatim, looked up by surah:ayah.
 */
import { tokenizeArabic, wordSimilarity } from "./arabic.mjs";

/** Ayat per surah in the Hafs (Kufan) count that Tanzil uses: 6,236 in total. */
export const AYAH_COUNTS = Object.freeze([
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
]);
export const TOTAL_AYAT = 6236;

const BASMALA = ["بسم", "الله", "الرحمن", "الرحيم"];
const CLOSING = ["صدق", "الله", "العظيم"];
// A phrase that occurs more often than this tells the matcher nothing about where it is.
const MAX_TRIGRAM_OCCURRENCES = 40;
// Allowed drift (in words) between hits of one passage, for skipped or added words.
const BAND = 6;
// Hits further apart than this in the transcript start a new passage.
const GAP = 40;
const PAD = 12;
const MAX_WINDOW = 1500;
const MIN_SIMILARITY = 0.75;

/**
 * @typedef {{ surah: number, ayah: number, text: string, firstWord: number, wordCount: number }} AyahEntry
 * @typedef {{ ayat: AyahEntry[], words: string[], wordAyah: Int32Array, trigrams: Map<string, number[]> }} QuranIndex
 * @typedef {{ text: string, start?: number, end?: number }} TimedWord
 * @typedef {{ surah: number, ayah: number, start: number | null, end: number | null, matchedWords: number, ayahWords: number, hasFirstWord: boolean, hasLastWord: boolean, complete: boolean }} AyahTiming
 * @typedef {{ surah: number, fromAyah: number, toAyah: number }} AyahRange
 * @typedef {{ surah: number, fromAyah: number, toAyah: number, matchedWords: number, confidence: number, from: number, to: number, start: number | null, end: number | null, ayat: AyahTiming[], ambiguous: boolean, alternatives: AyahRange[] }} RecitationSegment
 * @typedef {{ type: "istiadha" | "basmala" | "closing", from: number, to: number, start: number | null, end: number | null }} RecitationMarker
 * @typedef {{ isQuran: boolean, coverage: number, words: number, segments: RecitationSegment[], markers: RecitationMarker[] }} RecitationMatch
 */

/**
 * Index the 6,236 ayat of the Tanzil text, given in mushaf order, for matching.
 * Tanzil writes the basmala at the start of the first ayah of every surah
 * except Al-Fatiha (where it is ayah 1) and At-Tawbah (which has none). It is
 * not part of that ayah, so it is left out of the matching words and treated
 * as a marker instead.
 * @param {string[]} ayahTexts
 * @returns {QuranIndex}
 */
export function buildQuranIndex(ayahTexts) {
  if (!Array.isArray(ayahTexts) || ayahTexts.length !== TOTAL_AYAT) {
    throw new Error("The Quran text must have exactly " + TOTAL_AYAT + " ayat in mushaf order.");
  }
  /** @type {AyahEntry[]} */
  const ayat = [];
  /** @type {string[]} */
  const words = [];
  /** @type {number[]} */
  const owner = [];
  let k = 0;
  for (let surah = 1; surah <= 114; surah += 1) {
    for (let ayah = 1; ayah <= AYAH_COUNTS[surah - 1]; ayah += 1) {
      const text = String(ayahTexts[k]);
      k += 1;
      let tokens = tokenizeArabic(text);
      if (ayah === 1 && surah !== 1 && surah !== 9 && startsWith(tokens, 0, BASMALA)) tokens = tokens.slice(BASMALA.length);
      ayat.push({ surah, ayah, text, firstWord: words.length, wordCount: tokens.length });
      for (const token of tokens) {
        words.push(token);
        owner.push(ayat.length - 1);
      }
    }
  }
  /** @type {Map<string, number[]>} */
  const trigrams = new Map();
  for (let i = 0; i + 2 < words.length; i += 1) {
    const key = words[i] + " " + words[i + 1] + " " + words[i + 2];
    const list = trigrams.get(key);
    if (list) list.push(i);
    else trigrams.set(key, [i]);
  }
  return { ayat, words, wordAyah: Int32Array.from(owner), trigrams };
}

/**
 * The verbatim Tanzil text of one ayah, or null when the reference does not exist.
 * @param {QuranIndex} index
 * @param {number} surah
 * @param {number} ayah
 */
export function ayahText(index, surah, ayah) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return null;
  if (!Number.isInteger(ayah) || ayah < 1 || ayah > AYAH_COUNTS[surah - 1]) return null;
  let offset = 0;
  for (let s = 1; s < surah; s += 1) offset += AYAH_COUNTS[s - 1];
  return index.ayat[offset + ayah - 1].text;
}

/**
 * Find the Quran passages recited in a transcript. Pass plain text, or the
 * recogniser's words with start/end seconds to also get the time of every
 * ayah. Speech-recognition slips (a dropped word, one wrong letter, spelling
 * variants) are tolerated; the isti'adha, a basmala between surahs and the
 * closing "sadaqa Allahu al-azim" are reported as markers, not as ayat.
 * @param {string | TimedWord[]} input
 * @param {QuranIndex} index
 * @param {{ minWords?: number }} [options]
 * @returns {RecitationMatch}
 */
export function matchRecitation(input, index, options = {}) {
  const minWords = options.minWords ?? 3;
  const { tokens, times } = toTokens(input);
  const used = new Uint8Array(tokens.length);
  const tried = new Uint8Array(tokens.length);
  const markers = findMarkers(tokens, times, used);
  /** @type {RecitationSegment[]} */
  let segments = [];

  for (let round = 0; round < 400; round += 1) {
    const seed = findSeed(tokens, used, tried, index);
    if (!seed) break;
    const pairs = alignAround(tokens, used, index, seed);
    const matched = pairs.filter((p) => p.sim >= MIN_SIMILARITY);
    if (matched.length < minWords) {
      for (let t = seed.tFrom; t < seed.tTo; t += 1) tried[t] = 1;
      continue;
    }
    const from = matched[0].t;
    const to = matched[matched.length - 1].t + 1;
    for (let t = from; t < to; t += 1) used[t] = 1;
    segments.push(...toSegments(matched, index, times));
  }

  segments = mergeAdjacent(segments.sort((a, b) => a.from - b.from));
  const covered = used.reduce((sum, value) => sum + value, 0);
  const coverage = tokens.length ? round3(covered / tokens.length) : 0;
  const best = segments.reduce((max, s) => Math.max(max, s.confidence), 0);
  return {
    isQuran: segments.length > 0 && coverage >= 0.6 && best >= 0.6,
    coverage,
    words: tokens.length,
    segments,
    markers,
  };
}

/** @param {string | TimedWord[]} input */
function toTokens(input) {
  if (typeof input === "string") return { tokens: tokenizeArabic(input), times: null };
  /** @type {string[]} */
  const tokens = [];
  /** @type {{ start: number | null, end: number | null }[]} */
  const times = [];
  for (const word of Array.isArray(input) ? input : []) {
    for (const token of tokenizeArabic(word?.text ?? "")) {
      tokens.push(token);
      times.push({
        start: Number.isFinite(word.start) ? Number(word.start) : null,
        end: Number.isFinite(word.end) ? Number(word.end) : null,
      });
    }
  }
  return { tokens, times };
}

/**
 * @param {string[]} tokens
 * @param {number} at
 * @param {string[]} phrase
 */
function startsWith(tokens, at, phrase) {
  for (let i = 0; i < phrase.length; i += 1) if (tokens[at + i] !== phrase[i]) return false;
  return true;
}

/**
 * @param {string[]} tokens
 * @param {{ start: number | null, end: number | null }[] | null} times
 * @param {Uint8Array} used
 * @returns {RecitationMarker[]}
 */
function findMarkers(tokens, times, used) {
  /** @type {RecitationMarker[]} */
  const markers = [];
  /**
   * @param {RecitationMarker["type"]} type
   * @param {number} from
   * @param {number} to
   */
  const mark = (type, from, to) => {
    for (let t = from; t < to; t += 1) used[t] = 1;
    markers.push({ type, from, to, start: times?.[from]?.start ?? null, end: times?.[to - 1]?.end ?? null });
  };
  for (let t = 0; t < tokens.length; t += 1) {
    if (tokens[t] === "اعوذ" && tokens[t + 1] === "بالله") {
      // "a'udhu billahi (as-sami'i al-'alim) mina sh-shaytani r-rajim": ends at "ar-rajim".
      let end = -1;
      for (let k = t + 2; k < Math.min(tokens.length, t + 9); k += 1) {
        if (tokens[k] === "الرجيم") {
          end = k + 1;
          break;
        }
      }
      if (end > 0) {
        mark("istiadha", t, end);
        t = end - 1;
        continue;
      }
    }
    if (startsWith(tokens, t, BASMALA)) {
      // Before Al-Fatiha the basmala is its first ayah, and in An-Naml 27:30 it is inside an ayah.
      const opensFatiha = tokens[t + 4] === "الحمد" && tokens[t + 5] === "لله";
      const insideAnNaml = tokens[t - 1] === "وانه";
      if (!opensFatiha && !insideAnNaml) {
        mark("basmala", t, t + BASMALA.length);
        t += BASMALA.length - 1;
        continue;
      }
    }
    if (startsWith(tokens, t, CLOSING)) {
      mark("closing", t, t + CLOSING.length);
      t += CLOSING.length - 1;
    }
  }
  return markers;
}

/**
 * The strongest run of exact three-word matches that lie on one diagonal
 * (transcript position against Quran position), ignoring words already used.
 * @param {string[]} tokens
 * @param {Uint8Array} used
 * @param {Uint8Array} tried
 * @param {QuranIndex} index
 */
function findSeed(tokens, used, tried, index) {
  /** @type {{ t: number, c: number }[]} */
  const hits = [];
  for (let t = 0; t + 2 < tokens.length; t += 1) {
    if (used[t] || used[t + 1] || used[t + 2] || tried[t]) continue;
    const list = index.trigrams.get(tokens[t] + " " + tokens[t + 1] + " " + tokens[t + 2]);
    if (!list || list.length > MAX_TRIGRAM_OCCURRENCES) continue;
    for (const c of list) hits.push({ t, c });
  }
  if (hits.length === 0) return null;
  hits.sort((x, y) => x.c - x.t - (y.c - y.t) || x.t - y.t);
  let best = { count: 0, lo: 0, hi: 0 };
  let lo = 0;
  for (let hi = 0; hi < hits.length; hi += 1) {
    const diagonal = hits[hi].c - hits[hi].t;
    while (hits[lo].c - hits[lo].t < diagonal - BAND) lo += 1;
    if (hi - lo + 1 > best.count) best = { count: hi - lo + 1, lo, hi };
  }
  const band = hits.slice(best.lo, best.hi + 1).sort((x, y) => x.t - y.t);
  /** @type {{ t: number, c: number }[][]} */
  const clusters = [[band[0]]];
  for (let k = 1; k < band.length; k += 1) {
    if (band[k].t - band[k - 1].t > GAP) clusters.push([]);
    clusters[clusters.length - 1].push(band[k]);
  }
  const cluster = clusters.reduce((a, b) => (b.length > a.length ? b : a));
  const seed = { tFrom: Infinity, tTo: -Infinity, cFrom: Infinity, cTo: -Infinity };
  for (const hit of cluster) {
    seed.tFrom = Math.min(seed.tFrom, hit.t);
    seed.tTo = Math.max(seed.tTo, hit.t + 3);
    seed.cFrom = Math.min(seed.cFrom, hit.c);
    seed.cTo = Math.max(seed.cTo, hit.c + 3);
  }
  return seed;
}

/**
 * Local (Smith-Waterman) word alignment of the unused transcript run around a
 * seed against the Quran words around it. Returns aligned pairs in order.
 * @param {string[]} tokens
 * @param {Uint8Array} used
 * @param {QuranIndex} index
 * @param {{ tFrom: number, tTo: number, cFrom: number, cTo: number }} seed
 * @returns {{ t: number, c: number, sim: number }[]}
 */
function alignAround(tokens, used, index, seed) {
  let t0 = seed.tFrom;
  while (t0 > 0 && !used[t0 - 1] && seed.tFrom - t0 < PAD) t0 -= 1;
  let t1 = seed.tFrom;
  while (t1 < tokens.length && !used[t1] && t1 < seed.tTo + PAD) t1 += 1;
  t1 = Math.min(t1, t0 + MAX_WINDOW);
  const c0 = Math.max(0, seed.cFrom - 2 * PAD);
  const c1 = Math.min(index.words.length, seed.cTo + 2 * PAD, c0 + MAX_WINDOW + 4 * PAD);
  const n = t1 - t0;
  const m = c1 - c0;
  if (n <= 0 || m <= 0) return [];

  const MATCH = 20;
  const MISMATCH = -10;
  const GAP_COST = 8;
  const width = m + 1;
  const score = new Int32Array((n + 1) * width);
  const move = new Uint8Array((n + 1) * width); // 1 diagonal, 2 up (skip transcript word), 3 left (skip Quran word)
  const sims = new Float32Array((n + 1) * width);
  let bestScore = 0;
  let bestAt = 0;
  for (let i = 1; i <= n; i += 1) {
    const a = tokens[t0 + i - 1];
    for (let j = 1; j <= m; j += 1) {
      const b = index.words[c0 + j - 1];
      const sim = closeEnough(a, b) ? wordSimilarity(a, b) : 0;
      const diagonal = score[(i - 1) * width + j - 1] + (sim >= MIN_SIMILARITY ? Math.round(MATCH * sim) : MISMATCH);
      const up = score[(i - 1) * width + j] - GAP_COST;
      const left = score[i * width + j - 1] - GAP_COST;
      let value = 0;
      let step = 0;
      if (diagonal > value) { value = diagonal; step = 1; }
      if (up > value) { value = up; step = 2; }
      if (left > value) { value = left; step = 3; }
      const at = i * width + j;
      score[at] = value;
      move[at] = step;
      sims[at] = sim;
      if (value > bestScore) { bestScore = value; bestAt = at; }
    }
  }
  /** @type {{ t: number, c: number, sim: number }[]} */
  const pairs = [];
  let at = bestAt;
  while (at > 0 && score[at] > 0) {
    const i = Math.floor(at / width);
    const j = at % width;
    const step = move[at];
    if (step === 1) {
      pairs.push({ t: t0 + i - 1, c: c0 + j - 1, sim: sims[at] });
      at = (i - 1) * width + j - 1;
    } else if (step === 2) {
      at = (i - 1) * width + j;
    } else if (step === 3) {
      at = i * width + j - 1;
    } else {
      break;
    }
  }
  return pairs.reverse();
}

/**
 * Cheap filter before the edit distance: words whose lengths differ by more
 * than a quarter cannot reach the similarity threshold.
 * @param {string} a
 * @param {string} b
 */
function closeEnough(a, b) {
  if (a === b) return true;
  return Math.abs(a.length - b.length) <= Math.max(a.length, b.length) * (1 - MIN_SIMILARITY);
}

/**
 * Turn matched word pairs into one segment per surah, with per-ayah timing.
 * @param {{ t: number, c: number, sim: number }[]} matched
 * @param {QuranIndex} index
 * @param {{ start: number | null, end: number | null }[] | null} times
 * @returns {RecitationSegment[]}
 */
function toSegments(matched, index, times) {
  /** @type {Map<number, { t: number, c: number, sim: number }[]>} */
  const byAyah = new Map();
  for (const pair of matched) {
    const ayahIndex = index.wordAyah[pair.c];
    const list = byAyah.get(ayahIndex);
    if (list) list.push(pair);
    else byAyah.set(ayahIndex, [pair]);
  }
  const cFrom = matched[0].c;
  const cTo = matched[matched.length - 1].c + 1;
  /** @type {Map<number, { timings: AyahTiming[], pairs: { t: number, c: number, sim: number }[] }>} */
  const bySurah = new Map();
  for (const [ayahIndex, pairs] of [...byAyah.entries()].sort((a, b) => a[0] - b[0])) {
    const entry = index.ayat[ayahIndex];
    const starts = pairs.map((p) => times?.[p.t]?.start).filter((v) => typeof v === "number");
    const ends = pairs.map((p) => times?.[p.t]?.end).filter((v) => typeof v === "number");
    // An ayah is complete when the aligned span reaches both its first and its last word.
    const hasFirstWord = entry.firstWord >= cFrom;
    const hasLastWord = entry.firstWord + entry.wordCount - 1 < cTo;
    /** @type {AyahTiming} */
    const timing = {
      surah: entry.surah,
      ayah: entry.ayah,
      start: starts.length ? starts.reduce((a, b) => Math.min(a, b)) : null,
      end: ends.length ? ends.reduce((a, b) => Math.max(a, b)) : null,
      matchedWords: pairs.length,
      ayahWords: entry.wordCount,
      hasFirstWord,
      hasLastWord,
      complete: hasFirstWord && hasLastWord,
    };
    const group = bySurah.get(entry.surah) ?? { timings: [], pairs: [] };
    group.timings.push(timing);
    group.pairs.push(...pairs);
    bySurah.set(entry.surah, group);
  }
  return [...bySurah.entries()].map(([surah, group]) => {
    const tSpan = group.pairs[group.pairs.length - 1].t - group.pairs[0].t + 1;
    const cSpan = group.pairs[group.pairs.length - 1].c - group.pairs[0].c + 1;
    const from = group.pairs[0].t;
    const to = group.pairs[group.pairs.length - 1].t + 1;
    return {
      surah,
      fromAyah: group.timings[0].ayah,
      toAyah: group.timings[group.timings.length - 1].ayah,
      matchedWords: group.pairs.length,
      confidence: round3(group.pairs.reduce((sum, p) => sum + p.sim, 0) / Math.max(tSpan, cSpan)),
      from,
      to,
      start: group.timings[0].start,
      end: group.timings[group.timings.length - 1].end,
      ayat: group.timings,
      ...placesOf(group.pairs[0].c, group.pairs[group.pairs.length - 1].c + 1, index),
    };
  });
}

/**
 * Some passages occur word for word in more than one place (refrains such as
 * "fa-bi-ayyi ala'i rabbikuma tukadhdhiban", repeated 31 times in Ar-Rahman).
 * The words on screen are the same wherever they occur, but the surah:ayah
 * reference is not, so every place is listed and the segment is marked
 * ambiguous instead of guessing.
 * @param {number} cFrom
 * @param {number} cTo
 * @param {QuranIndex} index
 * @returns {{ ambiguous: boolean, alternatives: AyahRange[] }}
 */
function placesOf(cFrom, cTo, index) {
  const length = cTo - cFrom;
  if (length < 3) return { ambiguous: false, alternatives: [] };
  const starts = index.trigrams.get(index.words[cFrom] + " " + index.words[cFrom + 1] + " " + index.words[cFrom + 2]) ?? [];
  /** @type {AyahRange[]} */
  const alternatives = [];
  for (const start of starts) {
    if (start + length > index.words.length) continue;
    let same = true;
    for (let k = 3; k < length && same; k += 1) same = index.words[start + k] === index.words[cFrom + k];
    if (!same) continue;
    const first = index.ayat[index.wordAyah[start]];
    const last = index.ayat[index.wordAyah[start + length - 1]];
    alternatives.push({ surah: first.surah, fromAyah: first.ayah, toAyah: last.surah === first.surah ? last.ayah : AYAH_COUNTS[first.surah - 1] });
  }
  return alternatives.length > 1 ? { ambiguous: true, alternatives } : { ambiguous: false, alternatives: [] };
}

/**
 * Join pieces of one continuous recitation that were aligned in separate
 * rounds (long passages are aligned a window at a time).
 * @param {RecitationSegment[]} segments
 */
function mergeAdjacent(segments) {
  /** @type {RecitationSegment[]} */
  const out = [];
  for (const segment of segments) {
    const last = out[out.length - 1];
    const continues = last && last.surah === segment.surah && segment.from - last.to <= 2 && segment.fromAyah >= last.toAyah && segment.fromAyah <= last.toAyah + 1;
    if (!continues) {
      out.push({ ...segment, ayat: [...segment.ayat] });
      continue;
    }
    for (const timing of segment.ayat) {
      const existing = last.ayat.find((a) => a.ayah === timing.ayah);
      if (existing) {
        existing.matchedWords += timing.matchedWords;
        existing.start = minOrNull(existing.start, timing.start);
        existing.end = maxOrNull(existing.end, timing.end);
        existing.hasFirstWord = existing.hasFirstWord || timing.hasFirstWord;
        existing.hasLastWord = existing.hasLastWord || timing.hasLastWord;
        existing.complete = existing.hasFirstWord && existing.hasLastWord;
      } else {
        last.ayat.push({ ...timing });
      }
    }
    const words = last.matchedWords + segment.matchedWords;
    last.confidence = round3((last.confidence * last.matchedWords + segment.confidence * segment.matchedWords) / words);
    last.matchedWords = words;
    // A continuous passage is unique as soon as one of its pieces is.
    last.ambiguous = last.ambiguous && segment.ambiguous;
    if (!last.ambiguous) last.alternatives = [];
    last.toAyah = segment.toAyah;
    last.to = segment.to;
    last.end = segment.end ?? last.end;
  }
  return out;
}

/** @param {number | null} a @param {number | null} b */
function minOrNull(a, b) {
  return a === null ? b : b === null ? a : Math.min(a, b);
}

/** @param {number | null} a @param {number | null} b */
function maxOrNull(a, b) {
  return a === null ? b : b === null ? a : Math.max(a, b);
}

/** @param {number} n */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}
