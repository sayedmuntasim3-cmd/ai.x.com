/**
 * Arabic text normalisation for matching speech-recognition output against
 * the Quran text. It exists for matching only: text shown on screen always
 * comes from the Tanzil file verbatim and is never rebuilt from these words.
 */

// Harakat, tanwin, shadda, sukun, the superscript (dagger) alef, Quranic
// annotation marks (small high letters, waqf, sajdah and end-of-ayah signs)
// and tatweel.
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Letter forms that speech recognition and spelling conventions use interchangeably. */
const LETTERS = new Map([
  ["آ", "ا"], // alef with madda
  ["أ", "ا"], // alef with hamza above
  ["إ", "ا"], // alef with hamza below
  ["ٱ", "ا"], // alef wasla
  ["ى", "ي"], // alef maqsura
  ["ة", "ه"], // ta marbuta
  ["ؤ", "و"], // waw with hamza
  ["ئ", "ي"], // ya with hamza
  ["ک", "ك"], // keheh (Persian kaf)
  ["ی", "ي"], // Farsi yeh
  ["ۀ", "ه"], // heh with yeh above
]);

/**
 * Lower-case-equivalent form of Arabic text: no diacritics or Quranic marks,
 * unified letter variants, only Arabic letters and single spaces.
 * @param {string} text
 */
export function normalizeArabic(text) {
  let out = "";
  for (const ch of String(text ?? "").normalize("NFC").replace(MARKS, "")) {
    const mapped = LETTERS.get(ch) ?? ch;
    out += /[ء-غف-ي]/.test(mapped) ? mapped : " ";
  }
  return out.replace(/\s+/g, " ").trim();
}

/** @param {string} text */
export function tokenizeArabic(text) {
  const normalized = normalizeArabic(text);
  return normalized ? normalized.split(" ") : [];
}

/**
 * Similarity of two words from 0 to 1 (1 minus the edit distance over the
 * longer length), so one wrong letter in a long word still counts as close.
 * @param {string} a
 * @param {string} b
 */
export function wordSimilarity(a, b) {
  if (a === b) return 1;
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return 0;
  let previous = new Array(m + 1);
  let current = new Array(m + 1);
  for (let j = 0; j <= m; j += 1) previous[j] = j;
  for (let i = 1; i <= n; i += 1) {
    current[0] = i;
    for (let j = 1; j <= m; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  return 1 - previous[m] / Math.max(n, m);
}
