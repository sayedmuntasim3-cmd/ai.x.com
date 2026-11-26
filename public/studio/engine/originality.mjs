/**
 * Channel originality guard. YouTube enforces its "inauthentic content"
 * rule per channel: videos that are mass-produced or differ only on the
 * surface can demonetise the whole channel. Every finished film is compared
 * with the channel's earlier films on what a reviewer would notice:
 *
 * - narration phrasing (5-word shingles, MinHash estimate of overlap),
 * - the opening hook (first 30 seconds, exact shared phrases),
 * - the title pattern (names and numbers swapped out),
 * - the beat structure after the hook.
 *
 * A film keeps a compact fingerprint (no full script), so a channel of
 * hundreds of films is compared in milliseconds with no model call.
 */
import { parseSceneLines } from "./scene-lines.mjs";

const HASHES = 96;
const SHINGLE = 5;
const HOOK_SECONDS = 30;

/**
 * @typedef {{ id: string, topic: string, title: string, titleSkeleton: string, minhash: number[], shingles: number, hook: string[], beats: string[] }} Fingerprint
 * @typedef {{ id: string, topic: string, narration: number, hook: number, sharedHookPhrases: string[], sameTitlePattern: boolean, structure: number }} Comparison
 * @typedef {{ verdict: "pass" | "review" | "fail", reasons: string[], closest: Comparison[], compared: number }} OriginalityReport
 */

/** FNV-1a, 32 bit. @param {string} s @param {number} [seed] */
function fnv(s, seed = 0x811c9dc5) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** Lowercase words of narration, numbers and punctuation dropped. @param {string} text */
function words(text) {
  return text.toLowerCase().replace(/\$?\[c\d{2,3}[^\]]*\]/g, " ").replace(/[^\p{L}\p{N}' ]+/gu, " ").split(/\s+/).filter(Boolean);
}

/** @param {string[]} w @param {number} n */
function shingles(w, n = SHINGLE) {
  const out = new Set();
  for (let i = 0; i + n <= w.length; i += 1) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/**
 * A title with its names, numbers and quoted words replaced, so "From Barber
 * to Rolls-Royce" and "From Waiter to Ferrari" read as the same pattern.
 * @param {string} title
 */
export function titleSkeleton(title) {
  return title
    .replace(/["“”'‘’]/g, "")
    .replace(/\d[\d,.]*/g, "#")
    .split(/\s+/)
    .map((w, i) => (/^[A-Z][\p{L}-]*/u.test(w) && i > 0 && !/^(The|A|An|And|Of|To|From|In|On|For|With|Who|What|How|Why|His|Her|Their|This|That)$/.test(w.replace(/[^\p{L}]/gu, "")) ? "X" : w.toLowerCase()))
    .join(" ")
    .replace(/(X[\s-]*)+/g, "X ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @param {{ id: string, topic: string, title?: string, chapters: string[] }} film
 * @returns {Fingerprint}
 */
export function fingerprintFilm(film) {
  const scenes = film.chapters.flatMap((md) => parseSceneLines(md));
  const all = shingles(words(scenes.map((s) => s.narration).join(" ")));
  const minhash = Array.from({ length: HASHES }, (_, k) => {
    let min = 0xffffffff;
    for (const s of all) { const h = fnv(s, (0x811c9dc5 ^ Math.imul(k + 1, 0x9e3779b1)) >>> 0); if (h < min) min = h; }
    return min;
  });
  const hookWords = words(scenes.filter((s) => s.start < HOOK_SECONDS).map((s) => s.narration).join(" "));
  const title = film.title?.trim() || film.topic;
  return {
    id: film.id, topic: film.topic, title, titleSkeleton: titleSkeleton(title), minhash, shingles: all.size,
    hook: [...shingles(hookWords, 4)].slice(0, 400),
    beats: scenes.filter((s) => s.start >= HOOK_SECONDS).map((s) => (s.positional[1] ?? "").toUpperCase().replace(/\d+/g, "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 600),
  };
}

/** Normalised similarity of two label sequences (1 = identical). @param {string[]} a @param {string[]} b */
function sequenceSimilarity(a, b) {
  if (!a.length && !b.length) return 0;
  const n = Math.min(a.length, 400);
  const m = Math.min(b.length, 400);
  let prev = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const cur = [i];
    for (let j = 1; j <= m; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[m] / Math.max(n, m);
}

/**
 * Compare a film with the channel's earlier films.
 * @param {Fingerprint} film @param {Fingerprint[]} earlier
 * @returns {OriginalityReport}
 */
export function checkOriginality(film, earlier) {
  const others = earlier.filter((e) => e.id !== film.id);
  /** @type {Comparison[]} */
  const comparisons = others.map((e) => {
    const same = film.minhash.reduce((n, h, i) => n + (h === e.minhash[i] ? 1 : 0), 0);
    const hookSet = new Set(e.hook);
    const shared = film.hook.filter((p) => hookSet.has(p));
    return {
      id: e.id, topic: e.topic,
      narration: film.shingles && e.shingles ? round2(same / HASHES) : 0,
      hook: film.hook.length ? round2(shared.length / film.hook.length) : 0,
      sharedHookPhrases: shared.slice(0, 5),
      sameTitlePattern: film.titleSkeleton.length > 0 && film.titleSkeleton === e.titleSkeleton,
      structure: round2(sequenceSimilarity(film.beats, e.beats)),
    };
  }).sort((a, b) => b.narration - a.narration || b.hook - a.hook);
  /** @type {string[]} */
  const reasons = [];
  let verdict = /** @type {"pass" | "review" | "fail"} */ ("pass");
  const raise = (/** @type {"review" | "fail"} */ level, /** @type {string} */ why) => { reasons.push(why); if (level === "fail" || verdict === "pass") verdict = level === "fail" ? "fail" : verdict === "fail" ? "fail" : "review"; };
  for (const c of comparisons) {
    if (c.narration >= 0.25) raise("fail", `Narration overlaps "${c.topic}" by about ${Math.round(c.narration * 100)}%: the films read as one template.`);
    else if (c.narration >= 0.1) raise("review", `Narration shares about ${Math.round(c.narration * 100)}% of its phrasing with "${c.topic}".`);
    if (c.hook >= 0.4) raise("fail", `The opening repeats "${c.topic}" (${c.sharedHookPhrases.map((p) => `"${p}"`).join(", ")}).`);
    else if (c.hook >= 0.15) raise("review", `The opening shares phrases with "${c.topic}": ${c.sharedHookPhrases.map((p) => `"${p}"`).join(", ")}.`);
  }
  const titleTwins = comparisons.filter((c) => c.sameTitlePattern);
  if (titleTwins.length >= 3) raise("review", `The title follows the same pattern ("${film.titleSkeleton}") as ${titleTwins.length} earlier films.`);
  const structureTwins = comparisons.filter((c) => c.structure >= 0.95);
  if (structureTwins.length >= 3) raise("review", `The beat structure is nearly identical to ${structureTwins.length} earlier films; vary the arc.`);
  return { verdict, reasons, closest: comparisons.slice(0, 5), compared: comparisons.length };
}

/** @param {number} n */
function round2(n) { return Math.round(n * 100) / 100; }
