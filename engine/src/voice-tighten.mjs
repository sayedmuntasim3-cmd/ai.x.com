/**
 * Tighten a voice recording: long silences (a stop, a lost place, a pause to turn a page) are
 * shortened so no second of the film is dead air. Cuts fall only inside measured silence (the
 * voiced stretches of voice-analyze.mjs), never inside a word, and keep a natural pause on each
 * side; joins are crossfaded so the room tone runs on without a click.
 *
 * Quran recitation is a protected mode: the natural pauses of a recitation (waqf, breath, the
 * reciter's rhythm) are never touched; only an unusually long stop is shortened, never below a
 * full pause, and every cut is listed for the reviewer. No word, letter or breath of recitation
 * is removed, and the ayah ends (which sit on pauses) stay on a pause. Pure module.
 */

/**
 * @typedef {{ start: number, end: number }} Span
 * @typedef {{ from: number, to: number, seconds: number, gap: number, at: "start" | "pause" | "end" }} Cut
 */

/** What counts as too long, and what is kept: seconds. */
export const TIGHTEN = Object.freeze({
  narration: { longPause: 1.2, keep: 0.7, edgeMax: 0.6, edgeKeep: 0.3 },
  quran: { longPause: 3.5, keep: 1.8, edgeMax: 1.5, edgeKeep: 0.6 },
});

/**
 * The cuts that shorten a recording's long silences, and the clock map from old to new time.
 * @param {{ spans: Span[], totalSeconds: number, kind: "narration" | "quran" }} o
 */
export function planTighten({ spans, totalSeconds, kind }) {
  const rule = TIGHTEN[kind];
  /** @type {Cut[]} */
  const cuts = [];
  const voiced = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  if (voiced.length) {
    const first = voiced[0];
    if (first.start > rule.edgeMax) cuts.push({ from: 0, to: r3(first.start - rule.edgeKeep), seconds: r3(first.start - rule.edgeKeep), gap: r3(first.start), at: "start" });
    for (let i = 1; i < voiced.length; i += 1) {
      const gap = voiced[i].start - voiced[i - 1].end;
      if (gap <= rule.longPause) continue;
      const from = voiced[i - 1].end + rule.keep / 2;
      const to = voiced[i].start - rule.keep / 2;
      cuts.push({ from: r3(from), to: r3(to), seconds: r3(to - from), gap: r3(gap), at: "pause" });
    }
    const last = voiced[voiced.length - 1];
    if (totalSeconds - last.end > rule.edgeMax) cuts.push({ from: r3(last.end + rule.edgeKeep), to: r3(totalSeconds), seconds: r3(totalSeconds - last.end - rule.edgeKeep), gap: r3(totalSeconds - last.end), at: "end" });
  }
  const removed = r3(cuts.reduce((a, c) => a + c.seconds, 0));
  return { kind, rule, cuts, removedSeconds: removed, newSeconds: r3(totalSeconds - removed), map: cutMap(cuts) };
}

/**
 * Old time to new time for a list of cuts (any cuts, not only tighten's): a
 * time inside a cut lands where the cut closes. Shared with the retake cuts of
 * quran-retakes.mjs, so both kinds of cut move word times the same way.
 * @param {{ from: number, to: number }[]} cuts
 * @returns {(t: number) => number}
 */
export function cutMap(cuts) {
  const list = [...cuts].sort((a, b) => a.from - b.from);
  /** @param {number} t */
  return (t) => {
    let shift = 0;
    for (const c of list) {
      const seconds = c.to - c.from;
      if (t >= c.to) shift += seconds;
      else if (t > c.from) return r3(c.from - shift);
      else break;
    }
    return r3(t - shift);
  };
}

/**
 * The recording with the cuts taken out, each join crossfaded over `fadeMs` (equal power), so the
 * room tone runs on. Channels in, channels out; the input is never changed.
 * @param {Float32Array[]} channels @param {number} sampleRate @param {Cut[]} cuts @param {number} [fadeMs]
 */
export function applyTighten(channels, sampleRate, cuts, fadeMs = 15) {
  const fade = Math.max(1, Math.round((fadeMs / 1000) * sampleRate));
  const n = channels[0].length;
  /** @type {[number, number][]} kept sample ranges */
  const keep = [];
  let at = 0;
  for (const c of [...cuts].sort((a, b) => a.from - b.from)) {
    const from = Math.min(n, Math.round(c.from * sampleRate));
    const to = Math.min(n, Math.round(c.to * sampleRate));
    if (from > at) keep.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < n) keep.push([at, n]);
  // Each later piece starts `fade` samples early (inside the cut silence) and overlaps the last one,
  // so the result is exactly as long as the kept time and the clock map stays exact.
  const total = keep.reduce((a, [s, e]) => a + (e - s), 0);
  return channels.map((x) => {
    const out = new Float32Array(total);
    let w = 0;
    keep.forEach(([s, e], k) => {
      const head = k > 0 ? Math.min(fade, s, w) : 0;
      for (let i = s - head; i < e; i += 1) {
        const j = i - (s - head);
        if (j < head) {
          const g = j / head;
          const p = w - head + j;
          out[p] = out[p] * Math.cos((g * Math.PI) / 2) + x[i] * Math.sin((g * Math.PI) / 2);
        } else out[w + j - head] = x[i];
      }
      w += e - s;
    });
    return out;
  });
}

/**
 * Words timed on the original recording, moved onto the tightened one.
 * @template {{ start: number, end: number }} W
 * @param {W[]} words @param {(t: number) => number} map
 * @returns {W[]}
 */
export function remapWords(words, map) {
  return words.map((w) => ({ ...w, start: map(w.start), end: Math.max(map(w.start), map(w.end)) }));
}

/** @param {number} n */
function r3(n) { return Math.round(n * 1000) / 1000; }
