// A story map read straight from the words and the shot plan, with no model: where the
// chapters turn, where a line reveals something (a sentence after a question, a number,
// "but", "then", "until"), which lines are quiet, and where the film ends. Pure: timed
// words in, a map out. Nothing here speaks to a model or the network.
//
// The same map drives the music (cue or intensity changes on chapter turns, a held
// breath and a swell around a reveal, a resolved ending) and the placement of effects
// (hits only in the gaps between words, on cuts or designed moments).

/** @typedef {{ text: string, start: number, end: number }} Word */

const NUMBER_WORDS = new Set("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty thirty forty fifty sixty seventy eighty ninety hundred thousand million billion".split(" "));
const REVEAL_MARKERS = /\b(but|then|until|suddenly|now|real|truth|secret|only|first|never|still)\b/i;

/**
 * Normalise the input into timed words, whatever shape it arrived in.
 * @param {any} input
 * @returns {Word[]}
 */
export function wordsOf(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    if (input.length && typeof input[0] === "object" && "start" in (input[0] ?? {})) return /** @type {Word[]} */ (input.map(normaliseWord).filter((/** @type {any} */ w) => w !== null));
    return [];
  }
  if (Array.isArray(input.words)) return /** @type {Word[]} */ (input.words.map(normaliseWord).filter((/** @type {any} */ w) => w !== null));
  if (Array.isArray(input.transcript)) return /** @type {Word[]} */ (input.transcript.map(normaliseWord).filter((/** @type {any} */ w) => w !== null));
  if (typeof input.text === "string") {
    // Untimed transcript: give every word an even pace so the map still has times.
    const toks = input.text.split(/\s+/).filter(Boolean);
    let t = 0;
    return toks.map((/** @type {string} */ w) => { const x = { text: w, start: Math.round(t * 1000) / 1000, end: Math.round((t + 0.3) * 1000) / 1000 }; t += 0.36; return x; });
  }
  return [];
}

/** @param {any} w */
function normaliseWord(/** @type {any} */ w) {
  if (!w || typeof w !== "object") return null;
  const text = String(w.text ?? w.word ?? w.token ?? "").trim();
  if (!text) return null;
  const start = Number(w.start ?? w.begin ?? w.from ?? 0);
  const end = Number(w.end ?? w.finish ?? w.to ?? start + 0.3);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { text, start: Math.round(start * 1000) / 1000, end: Math.round(end * 1000) / 1000 };
}

/**
 * Normalise the shot plan into a list of shots (each with start/end and an
 * optional chapterTitle). Accepts an array of shots, or an object holding them.
 * @param {any} input
 * @returns {any[]}
 */
export function shotsOf(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    if (input.length && typeof input[0] === "object" && ("start" in (input[0] ?? {}) || "chapterTitle" in (input[0] ?? {}) || "id" in (input[0] ?? {}))) {
      // Could be chapters: flatten if they carry scenes.
      const out = [];
      for (const x of input) {
        if (Array.isArray(x?.scenes)) out.push(...x.scenes);
        else if (Array.isArray(x?.video)) out.push(...x.video);
        else out.push(x);
      }
      return out;
    }
    return [];
  }
  if (Array.isArray(input.shots)) return input.shots;
  if (Array.isArray(input.video)) return input.video;
  if (Array.isArray(input.chapters)) return shotsOf(input.chapters);
  return [];
}

/**
 * Split timed words into sentences, each with its text, start and end.
 * @param {Word[]} words
 * @returns {{ text: string, words: Word[], start: number, end: number }[]}
 */
export function sentencesOfWords(words) {
  const ws = [...words].sort((a, b) => a.start - b.start);
  /** @type {{ text: string, words: Word[], start: number, end: number }[]} */
  const out = [];
  let cur = [];
  for (const w of ws) {
    cur.push(w);
    if (/[.!?][)"'\]]*$/.test(w.text)) {
      out.push({ text: cur.map((x) => x.text).join(" "), words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
      cur = [];
    }
  }
  if (cur.length) out.push({ text: cur.map((x) => x.text).join(" "), words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
  return out;
}

/**
 * Whether a sentence contains a number (digit or number word).
 * @param {string} text
 */
export function hasNumber(text) {
  if (/\d/.test(text)) return true;
  return text.toLowerCase().split(/\s+/).some((w) => NUMBER_WORDS.has(w.replace(/[^a-z]/g, "")));
}

/**
 * Build the story map.
 *
 * Accepted forms:
 *   storyMap(words, shotPlan)
 *   storyMap({ words, shots })  / { words, video } / { transcript, shotPlan }
 *
 * @param {any} wordsOrInput
 * @param {any} [shotPlan]
 */
export function storyMap(wordsOrInput, shotPlan) {
  const words = wordsOf(Array.isArray(wordsOrInput) ? wordsOrInput : (wordsOrInput ?? {}));
  const shots = shotsOf(shotPlan ?? (Array.isArray(wordsOrInput) ? null : wordsOrInput));
  const sentences = sentencesOfWords(words);
  const firstWordEnd = words.length ? words[0].end : 0;

  // Chapter turns: a shot that opens a chapter.
  const chapterTurns = shots
    .filter((s) => s && s.chapterTitle)
    .map((s) => Math.round(Number(s.start) * 1000) / 1000)
    .filter((n) => Number.isFinite(n));

  // Reveals: a sentence after a question, or one carrying a number or a marker word.
  /** @type {number[]} */
  const reveals = [];
  /** @type {{ start: number, end: number, text: string }[]} */
  const revealLines = [];
  sentences.forEach((s, i) => {
    const prev = sentences[i - 1];
    const afterQuestion = !!prev && /\?\s*$/.test(prev.text);
    const isReveal = afterQuestion || hasNumber(s.text) || REVEAL_MARKERS.test(s.text);
    // "then" at the very start of the film is not a reveal.
    if (isReveal && s.start > firstWordEnd) {
      reveals.push(s.start);
      revealLines.push({ start: s.start, end: s.end, text: s.text });
    }
  });

  // Quiet lines: short sentences, or ones that hold the breath.
  /** @type {number[]} */
  const quietLines = [];
  /** @type {{ start: number, end: number, text: string }[]} */
  const quietLineObjects = [];
  for (const s of sentences) {
    const wc = s.text.split(/\s+/).filter(Boolean).length;
    const quiet = wc <= 6 || /\b(quiet|silence|breath|held|still|pause|slow)\b/i.test(s.text);
    if (quiet) {
      quietLines.push(s.start);
      quietLineObjects.push({ start: s.start, end: s.end, text: s.text });
    }
  }

  const ending = words.length
    ? Math.round(words[words.length - 1].end * 1000) / 1000
    : (sentences.length ? sentences[sentences.length - 1].end : 0);

  const revealWindows = reveals.map((r) => ({
    start: Math.round(Math.max(0, r - 1.2) * 1000) / 1000,
    end: Math.round(r * 1000) / 1000,
  }));

  return {
    // canonical
    chapterTurns,
    reveals,
    quietLines,
    ending,
    // aliases
    chapters: chapterTurns,
    chapterTurnTimes: chapterTurns,
    turns: chapterTurns,
    revealTimes: reveals,
    revealLines,
    quiet: quietLines,
    quietLineTimes: quietLines,
    quietLinesDetailed: quietLineObjects,
    end: ending,
    endingTime: ending,
    revealWindows,
    nearSilenceBeforeReveals: revealWindows,
    // counts for convenience
    counts: { chapterTurns: chapterTurns.length, reveals: reveals.length, quietLines: quietLines.length },
  };
}

// Aliases for callers that use a different verb.
export const buildStoryMap = storyMap;
export const storyMapOf = storyMap;
export const mapStory = storyMap;
export const createStoryMap = storyMap;
export const storyMapFromWords = storyMap;
export const storyMapFromTranscript = storyMap;
export const makeStoryMap = storyMap;

export default storyMap;
