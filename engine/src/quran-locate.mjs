/**
 * Where a recitation is in the Quran, and when each ayah is recited.
 *
 * The Quran is a closed text, so this is retrieval plus alignment, never
 * dictation. Two sources of evidence, used alone or together:
 *  - the surah and ayat the user gives (authoritative for WHAT is recited);
 *  - a recognizer's words with times (matchRecitation finds the passage).
 * WHEN each ayah is recited always rests on the measured pauses of the
 * recording (10 ms steps), which are far more exact than any recognizer's
 * word times: with a recognizer, each ayah end is moved onto the pause next
 * to it; without one, the known text is laid over the pauses by dynamic
 * programming, with the expected length of each ayah taken from its letters.
 * That second result is marked "estimated" until a recognizer confirms it.
 *
 * Nothing here invents an identification. When the evidence is weak, or the
 * given passage and the recording disagree, the answer is a question for the
 * user (decision "ask"), not a guess.
 */
import { AYAH_COUNTS, ayahText, matchRecitation } from "./quran.mjs";
import { normalizeArabic, tokenizeArabic, wordSimilarity } from "./arabic.mjs";
import { msg } from "./messages.mjs";

/**
 * @typedef {{ start: number, end: number }} Span
 * @typedef {{ surah: number, fromAyah: number, toAyah: number }} AyahRange
 * @typedef {"istiadha" | "basmala" | "closing" | "takbir"} FixedKind
 * @typedef {{ kind: "ayah" | FixedKind, surah: number | null, ayah: number | null, weight: number }} Unit
 * @typedef {{ start: number, end: number, from: number, to: number, speechSeconds: number, expectedSeconds: number, joined: boolean, onPause: boolean, pauseAfter: number | null, confidence: number }} Placed
 * @typedef {{ surah: number, ayah: number, start: number, end: number, timing: "recognized" | "estimated", onPause: boolean, joined: boolean, confidence: number, sure: boolean, repeat: boolean, heardShare: number | null }} LocatedAyah
 * @typedef {{ type: FixedKind, start: number, end: number, timing: "recognized" | "estimated" }} LocatedMarker
 * @typedef {import("./messages.mjs").Message} Message
 */

/**
 * Phrases a reciter says that are not ayat. They are labelled in the
 * timeline and never matched or shown as Quran text. The wording here is
 * used only to estimate how long each takes; the basmala shown on screen
 * always comes from the verified text (1:1), never from this list.
 */
export const FIXED_PHRASES = Object.freeze({
  istiadha: "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ",
  basmala: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
  closing: "صَدَقَ اللَّهُ الْعَظِيمُ",
  takbir: "اللَّهُ أَكْبَرُ",
});

// How sure the recognizer's result must be before it is taken without asking.
export const GATE = Object.freeze({
  /** Share of the recognised words that are Quran (or a fixed phrase). */
  coverage: 0.75,
  /** Share of the words of the heard ayat that were actually recognised. */
  quality: 0.7,
  /** Lowest confidence of any matched stretch. */
  segment: 0.6,
  /** Below these there is not even a candidate to ask about. */
  candidateCoverage: 0.3,
  candidateQuality: 0.5,
  /** With a given passage: the share of it that must be heard, and how much may be heard outside it. */
  inside: 0.6,
  outside: 0.1,
  contradiction: 0.5,
  /** Recitation speed in letter units per second of voice: outside this the given passage cannot be this recording. */
  slowest: 1,
  fastest: 12,
  /** Median error of ayah length against the expected length (natural log). */
  fit: 0.5,
  /** An estimated ayah end is sure when the next best place for it costs this much more (confidence), and it sits on a pause. */
  sure: 0.8,
  /** A recognised ayah end is sure when it sits on a pause and at least this share of the ayah's words was heard. */
  sureHeard: 0.5,
});

const HARAKAT = "\u064E\u064F\u0650";
const TANWIN = "\u064B\u064C\u064D";
const SUKUN = "\u0652";
const SHADDA = "\u0651";
const DAGGER = "\u0670";
const MADDA = "\u0653";
const MARK = /[\u064B-\u0653\u0670]/;
const LETTER = /[\u0621-\u063A\u0641-\u064A\u0671]/;
const LONG = "اوىي";
const HAMZA = "ءأإؤئ";

/**
 * What each part of the text adds to the time it takes to recite, in units
 * of one vowelled letter. Fitted by least squares on the voiced length of
 * 184 single-ayah recordings of one reciter (surahs 8 and 12) and checked on
 * 44 of another (surah 10): the length of an ayah is then predicted to
 * within about 11% and 12% (one standard deviation), against 15% and 14%
 * from the letter count alone. The separated letters that open some surahs
 * were not in the fit; they are counted by the rule that each is held like
 * a long madd.
 */
export const UNIT_WEIGHTS = Object.freeze({ vowel: 1, long: 0.2, shadda: 1.4, sukun: 0.6, tanwin: 2.3, madd: 5, separated: 4, word: 1.4, stop: 3 });

/**
 * How long a text takes to recite, in letter units, read from the vowel
 * marks of the verified text: vowelled letters, long vowels, doubled and
 * closing consonants, tanwin, a long vowel held before a hamza (madd), the
 * number of words, and the stop at the end. A measure for timing only.
 * @param {string} text @param {{ stop?: boolean }} [o]
 */
export function recitationUnits(text, o = {}) {
  const w = UNIT_WEIGHTS;
  /** @type {{ ch: string, marks: string }[][]} */
  const words = [];
  for (const word of String(text ?? "").normalize("NFC").split(/\s+/)) {
    /** @type {{ ch: string, marks: string }[]} */
    const letters = [];
    for (const ch of word) {
      if (LETTER.test(ch)) letters.push({ ch, marks: "" });
      else if (MARK.test(ch) && letters.length) letters[letters.length - 1].marks += ch;
    }
    if (letters.length) words.push(letters);
  }
  let units = 0;
  words.forEach((letters, n) => {
    units += w.word;
    if (letters.every((l) => !l.marks)) { units += w.separated * letters.length; return; }
    letters.forEach((l, i) => {
      const has = (/** @type {string} */ set) => [...l.marks].some((m) => set.includes(m));
      // The letter after a long vowel, in this word or the next: a hamza there makes it a madd.
      const next = letters[i + 1] ?? words[n + 1]?.[0];
      const beforeHamza = Boolean(next && HAMZA.includes(next.ch));
      if (l.ch === "آ") { units += w.vowel + w.long + w.madd; return; }
      if (!l.marks) { if (LONG.includes(l.ch) && i > 0) units += w.long + (beforeHamza ? w.madd : 0); return; }
      if (has(HARAKAT) || has(TANWIN)) units += w.vowel;
      if (has(TANWIN)) units += w.tanwin;
      if (has(SHADDA)) units += w.shadda;
      if (has(SUKUN)) units += w.sukun;
      if (has(DAGGER)) units += w.long + (beforeHamza ? w.madd : 0);
      if (has(MADDA)) units += w.madd;
    });
  });
  return Math.round((units + (o.stop === false ? 0 : w.stop)) * 100) / 100;
}

/** @param {string} s */
const nameKey = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[^a-z]/g, "").replace(/^(aali|aal|ash|adh|al|an|ar|as|at|ad|az)(?=[a-z]{3})/, "").replace(/aa/g, "a").replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/(.)\1/g, "$1");

/**
 * The surah a user means: a number 1 to 114, or a name in Latin or Arabic letters.
 * @param {unknown} value @param {{ number?: number, arabic?: string, transliteration?: string }[]} [surahNames]
 * @returns {number | null}
 */
export function findSurah(value, surahNames = []) {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) { const n = Number(text); return n >= 1 && n <= 114 ? n : null; }
  const key = nameKey(text);
  const arabic = normalizeArabic(text).replace(/^(سوره )?(ال)?/, "");
  /** @type {number[]} */
  const hits = [];
  surahNames.forEach((n, i) => {
    const number = n.number ?? i + 1;
    if ((key && nameKey(n.transliteration ?? "") === key) || (arabic && normalizeArabic(n.arabic ?? "").replace(/^ال/, "") === arabic)) hits.push(number);
  });
  return hits.length === 1 ? hits[0] : null;
}

/**
 * What the user gave, as ayah ranges. Accepted: `{ surah: 93 }` (the whole
 * surah), `{ surah: "Ad-Dhuha", ayat: "1-11" }`, `{ surah: "93,94" }`,
 * `{ passage: "2:255-257, 112" }`.
 * @param {{ surah?: unknown, ayat?: unknown, passage?: unknown } | null | undefined} given
 * @param {{ number?: number, arabic?: string, transliteration?: string }[]} [surahNames]
 * @returns {{ ok: true, ranges: AyahRange[] } | { ok: false, message: Message }}
 */
export function parsePassage(given, surahNames = []) {
  /** @type {{ surah: string, ayat: string }[]} */
  const parts = [];
  const text = (/** @type {unknown} */ v) => (v === undefined || v === null || v === true || v === false ? "" : String(v).trim());
  if (text(given?.passage)) for (const p of text(given?.passage).split(/[,;،]/)) { const [s, a = ""] = p.split(":"); if (s.trim()) parts.push({ surah: s.trim(), ayat: a.trim() }); }
  else if (text(given?.surah)) {
    const surahs = text(given?.surah).split(/[,;،]/).map((s) => s.trim()).filter(Boolean);
    surahs.forEach((s) => parts.push({ surah: s, ayat: surahs.length === 1 ? text(given?.ayat) : "" }));
  }
  if (!parts.length) return { ok: false, message: msg("quran.badSurah", { value: text(given?.surah) || text(given?.ayat) }) };
  /** @type {AyahRange[]} */
  const ranges = [];
  for (const p of parts) {
    const surah = findSurah(p.surah, surahNames);
    if (!surah) return { ok: false, message: msg("quran.badSurah", { value: p.surah }) };
    const count = AYAH_COUNTS[surah - 1];
    let fromAyah = 1, toAyah = count;
    if (p.ayat) {
      const m = /^(\d+)\s*(?:(?:-|–|to|:)\s*(\d+))?$/.exec(p.ayat);
      fromAyah = m ? Number(m[1]) : 0;
      toAyah = m ? Number(m[2] ?? m[1]) : 0;
      if (!m || fromAyah < 1 || toAyah < fromAyah || toAyah > count) return { ok: false, message: msg("quran.badAyat", { surah, count, value: p.ayat }) };
    }
    ranges.push({ surah, fromAyah, toAyah });
  }
  return { ok: true, ranges };
}

/** @param {AyahRange[]} ranges */
const rangesText = (ranges) => ranges.map((r) => `${r.surah}:${r.fromAyah}${r.toAyah > r.fromAyah ? "-" + r.toAyah : ""}`).join(", ");

/** The words of an ayah as recited after the surah's opening basmala (which Tanzil writes into ayah 1). @param {import("./quran.mjs").QuranIndex} index @param {number} surah @param {number} ayah */
function recitedText(index, surah, ayah) {
  const text = ayahText(index, surah, ayah) ?? "";
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.split(/\s+/);
  return tokenizeArabic(words.slice(0, 4).join(" ")).join(" ") === "بسم الله الرحمن الرحيم" ? words.slice(4).join(" ") : text;
}

/** @param {FixedKind} kind @returns {Unit} */
const fixedUnit = (kind) => ({ kind, surah: null, ayah: null, weight: recitationUnits(FIXED_PHRASES[kind]) });

/**
 * The ayat of the ranges as units to place, with a basmala before every
 * later surah that is recited from its first ayah.
 * @param {import("./quran.mjs").QuranIndex} index @param {AyahRange[]} ranges
 * @returns {Unit[]}
 */
export function passageUnits(index, ranges) {
  /** @type {Unit[]} */
  const units = [];
  ranges.forEach((r, n) => {
    if (n > 0 && r.fromAyah === 1 && r.surah !== 1 && r.surah !== 9) units.push(fixedUnit("basmala"));
    for (let a = r.fromAyah; a <= r.toAyah; a += 1) units.push({ kind: "ayah", surah: r.surah, ayah: a, weight: recitationUnits(recitedText(index, r.surah, a)) });
  });
  return units;
}

/** @param {number[]} values */
function medianOf(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}
const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;

// Dynamic programming costs (all in the same unit: about one standard deviation squared).
export const ALIGN_COSTS = Object.freeze({
  lengthShare: 0.12, // an ayah's length varies by about an eighth of what its letters predict (measured: 11 to 12%) ...
  lengthSeconds: 0.3, // ... plus a part that grows with the square root of its length
  innerPause: 0, // a pause inside an ayah costs nothing: a long ayah is recited in several breaths
  shortEnd: 0.5, // an ayah end on a gap much shorter than the usual pause
  join: 3, // an ayah end with no gap at all
});

/**
 * Lay units (ayat and fixed phrases, in order) over the speech stretches of
 * a recording. Every unit takes one or more whole stretches; ayah ends go on
 * the gaps between stretches, longer pauses preferred, so that each unit's
 * voiced time is close to what its letters predict at the recording's own
 * speed. Units recited in one breath share a stretch and are split inside it
 * by their letters (`joined`). Each end also gets a confidence: how much
 * worse the best layout is that puts this end on any other gap.
 * @param {{ units: { weight: number }[], spans: Span[], costs?: Partial<typeof ALIGN_COSTS> }} o
 * @returns {{ placed: Placed[], cost: number, secondsPerUnit: number, usualPause: number, fit: { median: number, worst: number }, onPause: number, joined: number } | null}
 */
export function alignByPauses({ units, spans, costs }) {
  const { lengthShare: LENGTH_SHARE, lengthSeconds: LENGTH_SECONDS, innerPause: INNER_PAUSE, shortEnd: SHORT_END, join: JOIN } = { ...ALIGN_COSTS, ...costs };
  const K = units.length, P = spans.length;
  if (!K || !P) return null;
  const S = new Float64Array(P + 1), W = new Float64Array(K + 1);
  for (let j = 0; j < P; j += 1) S[j + 1] = S[j] + Math.max(0.01, spans[j].end - spans[j].start);
  for (let k = 0; k < K; k += 1) W[k + 1] = W[k] + Math.max(0.5, units[k].weight);
  const gap = new Float64Array(P);
  for (let j = 1; j < P; j += 1) gap[j] = Math.max(0, spans[j].start - spans[j - 1].end);
  const real = Array.from(gap.subarray(1)).filter((g) => g >= 0.3);
  const usualPause = real.length ? medianOf(real) : P > 1 ? Math.max(0.3, medianOf(Array.from(gap.subarray(1)))) : 0.5;
  // Cost of the pauses left inside units (prefix sums), and of ending a unit on gap j.
  const inner = new Float64Array(P + 1), endCost = new Float64Array(P + 1);
  for (let j = 1; j < P; j += 1) {
    inner[j] = inner[j - 1] + INNER_PAUSE * Math.min(2.5, gap[j] / usualPause);
    endCost[j] = SHORT_END * Math.max(0, 1 - gap[j] / usualPause);
  }
  inner[P] = inner[P - 1];
  const rate = S[P] / W[K];
  const maxJoin = Math.min(K, Math.max(3, Math.ceil(K / P) + 2));
  /** Units a..b-1 on stretches i..j-1. @param {number} a @param {number} b @param {number} i @param {number} j */
  const stretch = (a, b, i, j) => {
    const d = S[j] - S[i], e = rate * (W[b] - W[a]);
    return ((d - e) * (d - e)) / (LENGTH_SHARE * LENGTH_SHARE * e * e + LENGTH_SECONDS * e) + inner[j - 1] - inner[i] + JOIN * (b - a - 1) + endCost[j < P ? j : 0];
  };
  const at = (/** @type {number} */ k, /** @type {number} */ j) => k * (P + 1) + j;
  const F = new Float64Array((K + 1) * (P + 1)).fill(Infinity), B = new Float64Array((K + 1) * (P + 1)).fill(Infinity);
  const fromUnit = new Int32Array((K + 1) * (P + 1)).fill(-1), fromSpan = new Int32Array((K + 1) * (P + 1)).fill(-1);
  F[at(0, 0)] = 0;
  for (let b = 1; b <= K; b += 1) {
    for (let a = b - 1; a >= Math.max(0, b - maxJoin); a -= 1) {
      const limit = 3 * rate * (W[b] - W[a]) + 3;
      for (let j = 1; j <= P; j += 1) {
        for (let i = j - 1; i >= 0 && S[j] - S[i] <= limit; i -= 1) {
          const before = F[at(a, i)];
          if (before === Infinity) continue;
          const c = before + stretch(a, b, i, j);
          if (c < F[at(b, j)]) { F[at(b, j)] = c; fromUnit[at(b, j)] = a; fromSpan[at(b, j)] = i; }
        }
      }
    }
  }
  // When the lengths are far off (a wrong passage), no layout survives the search window: lay it out by letters alone.
  if (F[at(K, P)] === Infinity) return proportional(units, spans, S, W, rate, usualPause);
  B[at(K, P)] = 0;
  for (let a = K - 1; a >= 0; a -= 1) {
    for (let b = a + 1; b <= Math.min(K, a + maxJoin); b += 1) {
      const limit = 3 * rate * (W[b] - W[a]) + 3;
      for (let i = P - 1; i >= 0; i -= 1) {
        for (let j = i + 1; j <= P && S[j] - S[i] <= limit; j += 1) {
          const after = B[at(b, j)];
          if (after === Infinity) continue;
          const c = after + stretch(a, b, i, j);
          if (c < B[at(a, i)]) B[at(a, i)] = c;
        }
      }
    }
  }
  const best = F[at(K, P)];
  /** @type {Placed[]} */
  const placed = new Array(K);
  for (let b = K, j = P; b > 0;) {
    const a = fromUnit[at(b, j)], i = fromSpan[at(b, j)];
    // Confidence of the end of this group (unit b-1), which sits on gap j.
    let margin = Infinity;
    if (b < K) for (let q = 1; q < P; q += 1) if (q !== j) margin = Math.min(margin, F[at(b, q)] + B[at(b, q)] - best);
    const confidence = b === K ? 1 : r3(1 - Math.exp(-Math.max(0, margin) / 2));
    const group = splitStretch(spans, S, W, a, b, i, j);
    group.forEach((g, n) => {
      const last = n === group.length - 1;
      const e = rate * (W[a + n + 1] - W[a + n]);
      placed[a + n] = { start: r3(g.start), end: r3(g.end), from: i, to: j, speechSeconds: r3(g.speech), expectedSeconds: r3(e), joined: !last, onPause: last && (j === P || gap[j] >= 0.3), pauseAfter: last && j < P ? r3(gap[j]) : last ? null : 0, confidence: last ? confidence : 0.2 };
    });
    b = a; j = i;
  }
  return summarize(placed, best, rate, usualPause);
}

/**
 * Units a..b-1 share stretches i..j-1: split the voiced time by letters.
 * @param {Span[]} spans @param {Float64Array} S @param {Float64Array} W @param {number} a @param {number} b @param {number} i @param {number} j
 */
function splitStretch(spans, S, W, a, b, i, j) {
  const total = S[j] - S[i], weight = W[b] - W[a];
  /** Recording time at which `voiced` seconds of this stretch have passed. @param {number} voiced */
  const timeAt = (voiced) => {
    for (let q = i; q < j; q += 1) if (S[q + 1] - S[i] >= voiced - 1e-9) return Math.min(spans[q].end, spans[q].start + (voiced - (S[q] - S[i])));
    return spans[j - 1].end;
  };
  /** @type {{ start: number, end: number, speech: number }[]} */
  const out = [];
  let start = spans[i].start;
  for (let k = a; k < b; k += 1) {
    const share = (total * (W[k + 1] - W[a])) / weight;
    const end = k === b - 1 ? spans[j - 1].end : timeAt(share);
    out.push({ start, end, speech: (total * (W[k + 1] - W[k])) / weight });
    start = end;
  }
  return out;
}

/** @param {{ weight: number }[]} units @param {Span[]} spans @param {Float64Array} S @param {Float64Array} W @param {number} rate @param {number} usualPause */
function proportional(units, spans, S, W, rate, usualPause) {
  const group = splitStretch(spans, S, W, 0, units.length, 0, spans.length);
  const placed = group.map((g, n) => ({ start: r3(g.start), end: r3(g.end), from: 0, to: spans.length, speechSeconds: r3(g.speech), expectedSeconds: r3(rate * (W[n + 1] - W[n])), joined: n < group.length - 1, onPause: n === group.length - 1, pauseAfter: n === group.length - 1 ? null : 0, confidence: n === group.length - 1 ? 1 : 0 }));
  return summarize(placed, Infinity, rate, usualPause);
}

/** @param {Placed[]} placed @param {number} cost @param {number} rate @param {number} usualPause */
function summarize(placed, cost, rate, usualPause) {
  // Fit is judged per breath group: units that share a stretch were split by their letters, so they say nothing.
  /** @type {number[]} */
  const errors = [];
  let speech = 0, expected = 0;
  for (const p of placed) {
    speech += p.speechSeconds; expected += p.expectedSeconds;
    if (!p.joined) { errors.push(Math.abs(Math.log(Math.max(speech, 0.01) / Math.max(expected, 0.01)))); speech = 0; expected = 0; }
  }
  const ends = placed.slice(0, -1);
  return { placed, cost: cost === Infinity ? Infinity : r3(cost), secondsPerUnit: rate, usualPause: r3(usualPause), fit: { median: r3(medianOf(errors)), worst: r3(Math.max(0, ...errors)) }, onPause: ends.filter((p) => p.onPause).length, joined: ends.filter((p) => p.joined).length };
}

/**
 * The given passage laid over the pauses, with the opening (isti'adha,
 * basmala) and closing (sadaqa Allahu al-'azim) tried both ways unless the
 * caller says which were recited.
 * @param {{ index: import("./quran.mjs").QuranIndex, ranges: AyahRange[], spans: Span[], opening?: "auto" | "none" | "basmala" | "istiadha" | "both", closing?: "auto" | "none" | "sadaqa", costs?: Partial<typeof ALIGN_COSTS> }} o
 */
export function alignPassage({ index, ranges, spans, opening = "auto", closing = "auto", costs }) {
  const body = passageUnits(index, ranges);
  const first = ranges[0];
  const ownBasmala = first.fromAyah === 1 && (first.surah === 1 || first.surah === 9);
  // What a recording usually opens with, as a cost for the less usual choices when nobody said which it was.
  /** @type {{ kinds: FixedKind[], prior: number }[]} */
  const openings = opening === "none" ? [{ kinds: [], prior: 0 }] : opening === "basmala" ? [{ kinds: ["basmala"], prior: 0 }] : opening === "istiadha" ? [{ kinds: ["istiadha"], prior: 0 }] : opening === "both" ? [{ kinds: ["istiadha", "basmala"], prior: 0 }]
    : ownBasmala ? [{ kinds: ["istiadha"], prior: 0 }, { kinds: [], prior: 0.5 }]
      : first.fromAyah === 1 ? [{ kinds: ["istiadha", "basmala"], prior: 0 }, { kinds: ["basmala"], prior: 0.5 }, { kinds: [], prior: 1 }]
        : [{ kinds: ["istiadha"], prior: 0 }, { kinds: ["istiadha", "basmala"], prior: 0.5 }, { kinds: [], prior: 0.5 }];
  /** @type {{ kinds: FixedKind[], prior: number }[]} */
  const closings = closing === "none" ? [{ kinds: [], prior: 0 }] : closing === "sadaqa" ? [{ kinds: ["closing"], prior: 0 }] : [{ kinds: [], prior: 0 }, { kinds: ["closing"], prior: 0.75 }];
  /** @type {{ units: Unit[], result: NonNullable<ReturnType<typeof alignByPauses>>, score: number }[]} */
  const tries = [];
  for (const o of openings) for (const c of closings) {
    const units = [...o.kinds.map(fixedUnit), ...body, ...c.kinds.map(fixedUnit)];
    const result = alignByPauses({ units, spans, costs });
    // The closing words are said after the reciter has stopped: never in the same breath as the last ayah.
    const closingJoined = Boolean(result && c.kinds.length && result.placed[units.length - 2]?.joined);
    if (result) tries.push({ units, result, score: result.cost + o.prior + c.prior + (closingJoined ? 10 : 0) });
  }
  if (!tries.length) return null;
  tries.sort((a, b) => a.score - b.score);
  const best = tries[0];
  return { units: best.units, ...best.result, choices: tries.length, unsure: tries.length > 1 && tries[1].score - best.score < 1.5 };
}

/**
 * The ayat a recognizer heard, in the order they were recited. When the
 * matcher returns one ayah in two pieces (the first without its last word,
 * the second without its first), they are one recitation of it, not a repeat.
 * @param {import("./quran.mjs").RecitationMatch | null | undefined} match
 */
export function heardAyat(match) {
  /** @type {{ surah: number, ayah: number, start: number | null, end: number | null, matchedWords: number, ayahWords: number, complete: boolean, hasFirstWord: boolean, hasLastWord: boolean, ambiguous: boolean, confidence: number }[]} */
  const out = [];
  for (const seg of match?.segments ?? []) {
    for (const a of seg.ayat) {
      const last = out[out.length - 1];
      if (last && last.surah === a.surah && last.ayah === a.ayah && !last.hasLastWord && !a.hasFirstWord && last.matchedWords + a.matchedWords <= a.ayahWords) {
        last.end = a.end ?? last.end;
        last.matchedWords += a.matchedWords;
        last.hasLastWord = a.hasLastWord;
        last.complete = last.hasFirstWord && a.hasLastWord;
        last.confidence = Math.min(last.confidence, seg.confidence);
        continue;
      }
      out.push({ surah: a.surah, ayah: a.ayah, start: a.start, end: a.end, matchedWords: a.matchedWords, ayahWords: a.ayahWords, complete: a.complete, hasFirstWord: a.hasFirstWord, hasLastWord: a.hasLastWord, ambiguous: seg.ambiguous, confidence: seg.confidence });
    }
  }
  return out;
}

/** The recognizer's words as matching tokens with their times. @param {{ text: string, start?: number, end?: number }[]} words */
function timedTokens(words) {
  /** @type {{ text: string, start: number | null, end: number | null }[]} */
  const tokens = [];
  for (const w of words) for (const t of tokenizeArabic(w?.text ?? "")) tokens.push({ text: t, start: Number.isFinite(w.start) ? Number(w.start) : null, end: Number.isFinite(w.end) ? Number(w.end) : null });
  return tokens;
}

/** The matching words of one ayah. @param {import("./quran.mjs").QuranIndex} index @param {number} surah @param {number} ayah */
function ayahWords(index, surah, ayah) {
  let offset = ayah - 1;
  for (let s = 1; s < surah; s += 1) offset += AYAH_COUNTS[s - 1];
  const e = index.ayat[offset];
  return e ? index.words.slice(e.firstWord, e.firstWord + e.wordCount) : [];
}

/** How many of `said` occur, in order, in `text` (close spellings count). @param {string[]} said @param {string[]} text */
function inOrder(said, text) {
  const row = new Array(text.length + 1).fill(0);
  for (const s of said) {
    let diagonal = 0;
    for (let j = 1; j <= text.length; j += 1) {
      const up = row[j];
      row[j] = wordSimilarity(s, text[j - 1]) >= 0.75 ? diagonal + 1 : Math.max(row[j], row[j - 1]);
      diagonal = up;
    }
  }
  return row[text.length];
}

/**
 * Words said again. The matcher follows the text forward, so when a reciter
 * repeats an ayah or its last words, the extra words fall between two ayat
 * and belong to neither. Here each such run is compared with the ayah before
 * and the ayah after: when it is that ayah's own words, the ayah's time is
 * stretched over it (the picture stays on the ayah while it is repeated) and
 * the repeat is reported.
 * @param {ReturnType<typeof heardAyat>} heard @param {{ text: string, start: number | null, end: number | null }[]} tokens @param {import("./quran.mjs").QuranIndex} index
 * @returns {{ surah: number, ayah: number, start: number, end: number, words: number }[]}
 */
export function absorbRepeats(heard, tokens, index) {
  /** @type {{ surah: number, ayah: number, start: number, end: number, words: number }[]} */
  const repeats = [];
  for (let k = 0; k + 1 < heard.length; k += 1) {
    const a = heard[k], b = heard[k + 1];
    if (a.end === null || b.start === null || b.start <= a.end) continue;
    const from = a.end, to = b.start;
    const run = tokens.filter((t) => t.start !== null && t.end !== null && t.start >= from - 1e-6 && t.end <= to + 1e-6);
    if (run.length < 2) continue;
    const said = run.map((t) => t.text);
    const asA = inOrder(said, ayahWords(index, a.surah, a.ayah)), asB = inOrder(said, ayahWords(index, b.surah, b.ayah));
    if (Math.max(asA, asB) < 0.7 * said.length) continue;
    const start = /** @type {number} */ (run[0].start), end = /** @type {number} */ (run[run.length - 1].end);
    if (asB > asA) { b.start = start; repeats.push({ surah: b.surah, ayah: b.ayah, start, end, words: run.length }); }
    else { a.end = end; repeats.push({ surah: a.surah, ayah: a.ayah, start, end, words: run.length }); }
  }
  return repeats;
}

/** @param {{ surah: number, ayah: number }[]} ayat @returns {AyahRange[]} */
export function toRanges(ayat) {
  /** @type {AyahRange[]} */
  const ranges = [];
  for (const a of ayat) {
    const last = ranges[ranges.length - 1];
    if (last && last.surah === a.surah && a.ayah >= last.fromAyah && a.ayah <= last.toAyah + 1) last.toAyah = Math.max(last.toAyah, a.ayah);
    else ranges.push({ surah: a.surah, fromAyah: a.ayah, toAyah: a.ayah });
  }
  return ranges;
}

/**
 * The gate: is the recognizer's result sure enough to use without asking,
 * and does it agree with what the user gave?
 * @param {import("./quran.mjs").RecitationMatch | null | undefined} match
 * @param {AyahRange[] | null} [given]
 * @returns {{ verdict: "accept" | "confirmed" | "unconfirmed" | "candidate" | "mismatch" | "nothing", heard: AyahRange[], coverage: number, quality: number, why: string[] }}
 */
export function judgeMatch(match, given = null) {
  const heard = heardAyat(match);
  const coverage = match?.coverage ?? 0;
  const matched = heard.reduce((n, a) => n + a.matchedWords, 0), expected = heard.reduce((n, a) => n + a.ayahWords, 0);
  const quality = expected ? r3(matched / expected) : 0;
  const ranges = toRanges(heard);
  /** @type {string[]} */
  const why = [];
  if (coverage < GATE.coverage) why.push("coverage");
  if (quality < GATE.quality) why.push("quality");
  if (heard.some((a) => a.confidence < GATE.segment)) why.push("weak");
  if (heard.some((a) => a.ambiguous)) why.push("ambiguous");
  const strong = heard.length > 0 && why.length === 0;
  const candidate = heard.length > 0 && coverage >= GATE.candidateCoverage && quality >= GATE.candidateQuality;
  if (!given) return { verdict: strong ? "accept" : candidate ? "candidate" : "nothing", heard: ranges, coverage, quality, why };
  const isGiven = (/** @type {{ surah: number, ayah: number }} */ a) => given.some((r) => r.surah === a.surah && a.ayah >= r.fromAyah && a.ayah <= r.toAyah);
  const givenCount = given.reduce((n, r) => n + r.toAyah - r.fromAyah + 1, 0);
  const insideSet = new Set(heard.filter(isGiven).map((a) => a.surah + ":" + a.ayah));
  const outside = heard.filter((a) => !isGiven(a));
  const inside = insideSet.size / givenCount, outsideShare = heard.length ? outside.length / heard.length : 0;
  if (inside >= GATE.inside && outsideShare <= GATE.outside) return { verdict: "confirmed", heard: ranges, coverage, quality, why };
  // A clear recognition of another passage contradicts the user; a refrain that occurs in several places does not.
  if (candidate && outsideShare > GATE.contradiction && outside.some((a) => !a.ambiguous)) return { verdict: "mismatch", heard: ranges, coverage, quality, why };
  return { verdict: "unconfirmed", heard: ranges, coverage, quality, why };
}

/**
 * Move recognised ayah times onto the measured pauses. A recognizer's word
 * times are loose (a held note may be given to the wrong side); the gaps in
 * the voice are exact. Each ayah end goes to the start of the gap that best
 * fits the place the recognizer points to, and the next ayah starts where
 * that gap ends. With no gap near, the recognised time stays (`onPause` false).
 * @param {{ start: number | null, end: number | null }[]} items in recited order
 * @param {Span[]} spans
 * @param {number} [reach] seconds
 * @returns {{ start: number, end: number, onPause: boolean, pauseAfter: number | null }[]}
 */
export function snapToPauses(items, spans, reach = 1.2) {
  /** @type {Span[]} */
  const gaps = [];
  for (let j = 1; j < spans.length; j += 1) if (spans[j].start > spans[j - 1].end) gaps.push({ start: spans[j - 1].end, end: spans[j].start });
  const first = spans[0]?.start ?? 0, last = spans[spans.length - 1]?.end ?? 0;
  const out = items.map((it) => ({ start: it.start ?? 0, end: it.end ?? it.start ?? 0, onPause: false, pauseAfter: /** @type {number | null} */ (null) }));
  for (let k = 0; k + 1 < out.length; k += 1) {
    const a = out[k], b = out[k + 1];
    if (b.start < a.start) continue; // the recitation went back: these two are not neighbours in time
    const point = (a.end + Math.max(a.end, b.start)) / 2;
    let best = null, bestScore = -Infinity;
    for (const g of gaps) {
      if (g.end < point - reach) continue;
      if (g.start > point + reach) break;
      const off = point < g.start ? g.start - point : point > g.end ? point - g.end : 0;
      const score = Math.min(2, g.end - g.start) - 1.5 * off;
      if (score > bestScore) { bestScore = score; best = g; }
    }
    if (best && best.start > a.start && best.end < (out[k + 1].end || Infinity)) { a.end = best.start; b.start = best.end; a.onPause = best.end - best.start >= 0.3; a.pauseAfter = r3(best.end - best.start); }
  }
  // The outer edges go to the nearest edge of a voiced stretch.
  if (out.length) {
    const head = out[0], tail = out[out.length - 1];
    let s = head.start, e = tail.end;
    for (const sp of spans) { if (Math.abs(sp.start - head.start) <= reach && sp.start < head.end && Math.abs(sp.start - head.start) < Math.abs(s - head.start) + (s === head.start ? reach : 0)) s = sp.start; }
    for (const sp of spans) { if (Math.abs(sp.end - tail.end) <= reach && sp.end > tail.start && Math.abs(sp.end - tail.end) < Math.abs(e - tail.end) + (e === tail.end ? reach : 0)) e = sp.end; }
    head.start = Math.max(first, s); tail.end = Math.min(last || e, e); tail.onPause = true;
  }
  return out.map((o) => ({ ...o, start: r3(o.start), end: r3(Math.max(o.start, o.end)) }));
}

/**
 * The stretches a recognizer should listen to, one after another: voiced
 * stretches grouped into clips of at most `maxSeconds`, cut only in pauses,
 * so no word is split where a 30 s listening window ends. Returned flat
 * (start, end, start, end, ...) in seconds.
 * @param {Span[]} spans @param {number} [maxSeconds] @param {number} [pad]
 */
export function listeningClips(spans, maxSeconds = 24, pad = 0.15) {
  /** @type {number[]} */
  const clips = [];
  let from = -1, to = 0;
  spans.forEach((s, k) => {
    if (from >= 0 && s.end - from > maxSeconds) { clips.push(r3(from), r3(Math.min(to + pad, s.start))); from = -1; }
    if (from < 0) from = Math.max(k > 0 ? spans[k - 1].end : 0, s.start - pad);
    to = s.end;
  });
  if (from >= 0) clips.push(r3(from), r3(to + pad));
  return clips;
}

/**
 * Speech the recognizer wrote down that is neither an ayah nor a known
 * phrase: a takbir is labelled; anything else is reported as not Quran.
 * @param {{ text: string, start?: number, end?: number }[]} words @param {import("./quran.mjs").RecitationMatch} match
 */
export function otherSpeech(words, match) {
  const tokens = timedTokens(words);
  const used = new Uint8Array(tokens.length);
  for (const s of [...match.segments, ...match.markers]) used.fill(1, s.from, s.to);
  /** @type {{ type: "takbir" | "other", words: number, start: number | null, end: number | null }[]} */
  const out = [];
  for (let i = 0; i < tokens.length;) {
    if (used[i]) { i += 1; continue; }
    let j = i;
    while (j < tokens.length && !used[j]) j += 1;
    const run = tokens.slice(i, j).map((t) => t.text).join(" ");
    out.push({ type: /^(الله اكبر ?)+$/.test(run + " ") ? "takbir" : "other", words: j - i, start: tokens[i].start, end: tokens[j - 1].end });
    i = j;
  }
  return out;
}

/**
 * Find the passage and the time of every ayah.
 * @param {{ index: import("./quran.mjs").QuranIndex, spans: Span[], totalSeconds: number, given?: { surah?: unknown, ayat?: unknown, passage?: unknown } | null,
 *   words?: { text: string, start?: number, end?: number }[] | null, surahNames?: { number?: number, arabic?: string, transliteration?: string }[],
 *   opening?: "auto" | "none" | "basmala" | "istiadha" | "both", closing?: "auto" | "none" | "sadaqa" }} o
 */
export function locateRecitation(o) {
  const spans = (o.spans ?? []).filter((s) => s.end > s.start);
  /** @type {Message[]} */
  const messages = [];
  /** @param {Message} question @param {Partial<ReturnType<typeof result>>} [more] */
  const ask = (question, more = {}) => ({ ...result(), ...more, ok: false, decision: /** @type {"ask"} */ ("ask"), question, messages: [...messages, question] });
  const result = () => ({ ok: true, decision: /** @type {"accept" | "ask"} */ ("accept"), source: /** @type {"given" | "recognized" | "given+recognized" | null} */ (null), timing: /** @type {"recognized" | "estimated" | null} */ (null), passages: /** @type {AyahRange[]} */ ([]), heard: /** @type {AyahRange[]} */ ([]), ayat: /** @type {LocatedAyah[]} */ ([]), markers: /** @type {LocatedMarker[]} */ ([]), other: /** @type {ReturnType<typeof otherSpeech>} */ ([]), repeats: /** @type {{ surah: number, ayah: number, start: number }[]} */ ([]), fit: /** @type {{ unitsPerSecond: number, median: number, worst: number, onPause: number, ends: number, joined: number, openingUnsure: boolean } | null} */ (null), agreement: /** @type {{ ayat: number, medianSeconds: number, worstSeconds: number } | null} */ (null), recognition: /** @type {{ coverage: number, quality: number, why: string[] } | null} */ (null), question: /** @type {Message | null} */ (null), messages });

  const hasGiven = Boolean(o.given && [o.given.surah, o.given.passage].some((v) => v !== undefined && v !== null && v !== false && String(v).trim() !== ""));
  /** @type {AyahRange[] | null} */
  let given = null;
  if (hasGiven) {
    const parsed = parsePassage(o.given, o.surahNames ?? []);
    if (!parsed.ok) return ask(parsed.message);
    given = parsed.ranges;
    messages.push(msg("quran.given", { passage: rangesText(given) }));
  }
  const words = (o.words ?? []).filter((w) => w && String(w.text ?? "").trim());
  const match = words.length ? matchRecitation(words, o.index) : null;
  const verdict = match ? judgeMatch(match, given) : null;
  const recognition = verdict ? { coverage: verdict.coverage, quality: verdict.quality, why: verdict.why } : null;
  if (verdict && verdict.heard.length) messages.push(msg("quran.heard", { passage: rangesText(verdict.heard), coverage: Math.round(verdict.coverage * 100), quality: Math.round(verdict.quality * 100) }));

  if (!given) {
    if (!verdict || verdict.verdict === "nothing") return ask(msg("quran.ask.passage"), { recognition });
    if (verdict.verdict === "candidate") return ask(msg("quran.ask.confirm", { passage: rangesText(verdict.heard), why: verdict.why.join(",") }), { recognition, heard: verdict.heard });
  } else if (verdict?.verdict === "mismatch") {
    return ask(msg("quran.ask.mismatch", { given: rangesText(given), heard: rangesText(verdict.heard) }), { recognition, heard: verdict.heard, passages: given });
  }
  if (!spans.length) return ask(msg("quran.ask.passage"), { recognition });

  // The given passage over the pauses: the timing when no recognizer confirms, and a second opinion when one does.
  const estimate = given ? alignPassage({ index: o.index, ranges: given, spans, opening: o.opening, closing: o.closing }) : null;
  const useHeard = Boolean(match && verdict && (verdict.verdict === "accept" || verdict.verdict === "confirmed"));
  const out = result();
  out.recognition = recognition;
  out.heard = verdict?.heard ?? [];

  if (useHeard && match && verdict) {
    const heard = heardAyat(match).filter((a) => a.start !== null && a.end !== null);
    if (!heard.length) return ask(msg("quran.ask.times"), { recognition, heard: verdict.heard });
    for (const r of absorbRepeats(heard, timedTokens(words), o.index)) out.repeats.push({ surah: r.surah, ayah: r.ayah, start: r3(r.start) });
    const snapped = snapToPauses(heard, spans);
    /** @type {Set<string>} */
    const seen = new Set();
    out.ayat = heard.map((a, k) => {
      const key = a.surah + ":" + a.ayah, repeat = seen.has(key);
      seen.add(key);
      if (repeat) out.repeats.push({ surah: a.surah, ayah: a.ayah, start: snapped[k].start });
      const share = Math.min(1, a.matchedWords / Math.max(1, a.ayahWords));
      return { surah: a.surah, ayah: a.ayah, start: snapped[k].start, end: snapped[k].end, timing: /** @type {"recognized"} */ ("recognized"), onPause: snapped[k].onPause, joined: !snapped[k].onPause, confidence: r3(share * a.confidence), sure: snapped[k].onPause && share >= GATE.sureHeard, repeat, heardShare: r3(share) };
    });
    out.markers = match.markers.filter((m) => m.start !== null && m.end !== null).map((m) => ({ type: m.type, start: r3(/** @type {number} */ (m.start)), end: r3(/** @type {number} */ (m.end)), timing: /** @type {"recognized"} */ ("recognized") }));
    out.other = otherSpeech(words, match);
    for (const x of out.other) if (x.type === "takbir" && x.start !== null && x.end !== null) out.markers.push({ type: "takbir", start: r3(x.start), end: r3(x.end), timing: "recognized" });
    out.source = given ? "given+recognized" : "recognized";
    out.timing = "recognized";
    out.passages = given ?? verdict.heard;
    if (given) messages.push(msg("quran.confirmed"));
    const ends = out.ayat.length - 1;
    messages.push(msg("quran.timed", { sure: out.ayat.slice(0, -1).filter((a) => a.sure).length, total: ends }));
    if (estimate) {
      // How far the two methods are from each other, ayah end by ayah end (first recitation of each ayah).
      /** @type {number[]} */
      const diffs = [];
      estimate.units.forEach((u, k) => {
        if (u.kind !== "ayah") return;
        const h = out.ayat.find((a) => a.surah === u.surah && a.ayah === u.ayah && !a.repeat);
        if (h) diffs.push(Math.abs(h.end - estimate.placed[k].end));
      });
      if (diffs.length) out.agreement = { ayat: diffs.length, medianSeconds: r3(medianOf(diffs)), worstSeconds: r3(Math.max(...diffs)) };
    }
  } else if (given && estimate) {
    const unitsPerSecond = r3(1 / estimate.secondsPerUnit);
    const ends = estimate.units.length - 1;
    out.fit = { unitsPerSecond, median: estimate.fit.median, worst: estimate.fit.worst, onPause: estimate.onPause, ends, joined: estimate.joined, openingUnsure: estimate.unsure };
    const why = unitsPerSecond < GATE.slowest ? "slow" : unitsPerSecond > GATE.fastest ? "fast" : estimate.fit.median > GATE.fit ? "lengths" : null;
    if (why) return ask(msg("quran.ask.notFit", { passage: rangesText(given), why }), { recognition, passages: given, fit: out.fit, heard: out.heard });
    estimate.units.forEach((u, k) => {
      const p = estimate.placed[k];
      if (u.kind === "ayah") out.ayat.push({ surah: /** @type {number} */ (u.surah), ayah: /** @type {number} */ (u.ayah), start: p.start, end: p.end, timing: "estimated", onPause: p.onPause, joined: p.joined, confidence: p.confidence, sure: p.onPause && p.confidence >= GATE.sure, repeat: false, heardShare: null });
      else out.markers.push({ type: u.kind, start: p.start, end: p.end, timing: "estimated" });
    });
    out.source = "given";
    out.timing = "estimated";
    out.passages = given;
    if (match) messages.push(msg("quran.unconfirmed"));
    const ayahEnds = out.ayat.slice(0, -1);
    messages.push(msg("quran.estimated", { sure: ayahEnds.filter((a) => a.sure).length, total: ayahEnds.length }));
    if (estimate.unsure) messages.push(msg("quran.openingUnsure"));
  } else {
    return ask(msg("quran.ask.passage"), { recognition });
  }
  for (const m of out.markers) messages.push(msg("quran.fixed", { phrase: m.type, start: m.start, end: m.end }));
  for (const r of out.repeats) messages.push(msg("quran.repeat", { surah: r.surah, ayah: r.ayah, start: r.start }));
  const stray = out.other.filter((x) => x.type === "other");
  if (stray.length) messages.push(msg("quran.other", { words: stray.reduce((n, x) => n + x.words, 0), start: stray[0].start ?? 0 }));
  const joined = out.ayat.slice(0, -1).filter((a) => a.joined).length;
  if (joined) messages.push(msg("quran.joined", { count: joined }));
  return out;
}

/**
 * The location as the match that planQuranFilm reads, so the film plan,
 * its checks and its captions work unchanged.
 * @param {ReturnType<typeof locateRecitation>} location @param {import("./quran.mjs").QuranIndex} index
 * @returns {import("./quran.mjs").RecitationMatch}
 */
export function locationToMatch(location, index) {
  /** @type {import("./quran.mjs").RecitationSegment[]} */
  const segments = [];
  let words = 0;
  location.ayat.forEach((a, k) => {
    const entry = index.ayat.find((e) => e.surah === a.surah && e.ayah === a.ayah);
    const count = entry?.wordCount ?? 1;
    words += count;
    const timing = { surah: a.surah, ayah: a.ayah, start: a.start, end: a.end, matchedWords: count, ayahWords: count, hasFirstWord: true, hasLastWord: true, complete: true };
    const last = segments[segments.length - 1];
    if (last && last.surah === a.surah && a.ayah === last.toAyah + 1) { last.ayat.push(timing); last.toAyah = a.ayah; last.end = a.end; last.matchedWords += count; last.to = k + 1; }
    else segments.push({ surah: a.surah, fromAyah: a.ayah, toAyah: a.ayah, matchedWords: count, confidence: 1, from: k, to: k + 1, start: a.start, end: a.end, ayat: [timing], ambiguous: false, alternatives: [] });
  });
  /** @type {import("./quran.mjs").RecitationMarker[]} */
  const markers = [];
  for (const m of location.markers) if (m.type !== "takbir") markers.push({ type: m.type, from: 0, to: 0, start: m.start, end: m.end });
  return { isQuran: location.ok && segments.length > 0, coverage: location.recognition?.coverage ?? 1, words, segments, markers };
}

/**
 * How far placed ayat are from the truth (a recording built by joining
 * single-ayah files, where each ayah's first and last voiced moment is known).
 * @param {{ surah: number, ayah: number, start: number, end: number }[]} ayat
 * @param {{ surah: number, ayah: number, start: number, end: number }[]} truth
 */
export function boundaryErrors(ayat, truth) {
  /** @type {number[]} */
  const errors = [];
  let cutsInGap = 0, cuts = 0, missing = 0;
  truth.forEach((t, k) => {
    const a = ayat.find((x) => x.surah === t.surah && x.ayah === t.ayah);
    if (!a) { missing += 1; return; }
    if (k > 0) errors.push(Math.abs(a.start - t.start));
    if (k < truth.length - 1) errors.push(Math.abs(a.end - t.end));
    const next = truth[k + 1], b = next ? ayat.find((x) => x.surah === next.surah && x.ayah === next.ayah) : null;
    if (next && b) { cuts += 1; const cut = (a.end + b.start) / 2; if (cut >= t.end - 0.05 && cut <= next.start + 0.05) cutsInGap += 1; }
  });
  const sorted = [...errors].sort((x, y) => x - y);
  return { ayat: truth.length, missing, boundaries: errors.length, medianSeconds: r3(medianOf(errors)), p90Seconds: r3(sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))] : 0), worstSeconds: r3(sorted.length ? sorted[sorted.length - 1] : 0), within200ms: errors.filter((e) => e <= 0.2).length, cuts, cutsInGap };
}
