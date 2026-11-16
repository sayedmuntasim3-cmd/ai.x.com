/**
 * Shorts and Reels from a recitation film: a passage of whole ayat, 20 to
 * 60 seconds, cut only at ayah ends that are sure (two methods agree) or at
 * the very start and end of the recording, in the middle of the pause. No
 * word, ayah or breath is cut; the passage's shots, pictures and text are the
 * long film's own, moved to start at zero.
 */

/** Length limits of a short, seconds (the measured median Quran Short was 32 s). */
export const SHORT = Object.freeze({ min: 20, max: 60, target: 35 });

/**
 * Passages that can stand alone: their first ayah starts at a sure end (or at
 * the recording's start) and their last ayah ends at a sure end (or at the end).
 * @param {{ ayat: { surah: number, ayah: number, start: number, end: number, sure: boolean, repeat?: boolean }[] }} location
 * @param {number} totalSeconds
 * @returns {{ surah: number, fromAyah: number, toAyah: number, cutIn: number, cutOut: number, seconds: number }[]}
 */
export function shortPassages(location, totalSeconds) {
  const ayat = location.ayat.filter((a) => !a.repeat);
  const n = ayat.length;
  // A cut between ayah k-1 and k sits in the middle of the pause after a sure end.
  const cutBefore = (/** @type {number} */ k) => (k === 0 ? 0 : ayat[k - 1].sure ? (ayat[k - 1].end + ayat[k].start) / 2 : null);
  const cutAfter = (/** @type {number} */ k) => (k === n - 1 ? totalSeconds : ayat[k].sure ? (ayat[k].end + ayat[k + 1].start) / 2 : null);
  /** @type {{ surah: number, fromAyah: number, toAyah: number, cutIn: number, cutOut: number, seconds: number }[]} */
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const cutIn = cutBefore(i);
    if (cutIn === null) continue;
    for (let j = i; j < n && ayat[j].surah === ayat[i].surah; j += 1) {
      const cutOut = cutAfter(j);
      if (cutOut === null) continue;
      const seconds = cutOut - cutIn;
      if (seconds > SHORT.max) break;
      if (seconds >= SHORT.min) out.push({ surah: ayat[i].surah, fromAyah: ayat[i].ayah, toAyah: ayat[j].ayah, cutIn: round(cutIn), cutOut: round(cutOut), seconds: round(seconds) });
    }
  }
  // Closest to the target length first, then earliest.
  return out.sort((a, b) => Math.abs(a.seconds - SHORT.target) - Math.abs(b.seconds - SHORT.target) || a.cutIn - b.cutIn);
}

/** @param {number} x */
const round = (x) => Math.round(x * 1000) / 1000;

/**
 * The part of a timeline between two cuts, moved to start at zero; items
 * that cross a cut are trimmed to it, items outside are dropped.
 * @template {{ start: number, end: number }} T
 * @param {T[]} items @param {number} from @param {number} to @param {(keyof T)[]} [alsoShift] other time fields to move (e.g. spokenStart)
 * @returns {T[]}
 */
export function sliceTimeline(items, from, to, alsoShift = []) {
  /** @type {T[]} */
  const out = [];
  for (const it of items) {
    if (it.end <= from + 0.001 || it.start >= to - 0.001) continue;
    /** @type {any} */
    const copy = { ...it, start: round(Math.max(it.start, from) - from), end: round(Math.min(it.end, to) - from) };
    for (const k of alsoShift) if (typeof copy[k] === "number") copy[k] = round(Math.min(Math.max(copy[k], from), to) - from);
    out.push(copy);
  }
  return out;
}
