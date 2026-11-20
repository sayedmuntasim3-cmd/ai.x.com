/**
 * Ayah times marked by a person (the reviewer taps once when the first ayah
 * begins and once at the end of each ayah while listening). A marked end is a
 * confirmed end: the cut may fall there and the ayah text is shown on it.
 * The recitation itself is never changed; only where the film cuts and when
 * the verbatim text appears.
 */

/** @typedef {{ start: number, ends: number[], by: string }} AyahMarks */

/**
 * Check marks against the located ayat and the recording.
 * @param {unknown} raw @param {number} ayatCount @param {number} totalSeconds
 * @returns {{ ok: true, marks: AyahMarks } | { ok: false, error: string }}
 */
export function checkMarks(raw, ayatCount, totalSeconds) {
  const m = /** @type {any} */ (raw);
  const start = Number(m?.start);
  const ends = Array.isArray(m?.ends) ? m.ends.map(Number) : [];
  const by = String(m?.by ?? "").replace(/[^\p{L}\p{M} .'-]/gu, "").trim().slice(0, 80);
  if (!by) return { ok: false, error: "Say who marked the ayat (the reviewer's name)." };
  if (!Number.isFinite(start) || start < 0) return { ok: false, error: "Mark where the first ayah begins." };
  if (ends.length !== ayatCount) return { ok: false, error: `Mark the end of every ayah: ${ayatCount} expected, ${ends.length} given.` };
  const all = [start, ...ends];
  for (let i = 0; i < all.length; i += 1) {
    if (!Number.isFinite(all[i]) || all[i] > totalSeconds + 0.5) return { ok: false, error: `Mark ${i + 1} is outside the recording.` };
    if (i > 0 && all[i] - all[i - 1] < 0.4) return { ok: false, error: `Mark ${i + 1} is not after mark ${i}: tap again in order.` };
  }
  return { ok: true, marks: { start: Math.round(start * 1000) / 1000, ends: ends.map((/** @type {number} */ e) => Math.round(e * 1000) / 1000), by } };
}

/**
 * Lay the marks on a located recitation: every ayah gets the marked start and
 * end and becomes sure; an opening phrase (isti'adha, basmala) ends where the
 * first ayah begins.
 * @template {{ ayat: any[], markers?: any[], timing?: string | null, messages?: any[] }} L
 * @param {L} location @param {AyahMarks} marks @returns {L}
 */
export function applyMarks(location, marks) {
  const ayat = location.ayat.map((a, k) => ({
    ...a,
    start: k === 0 ? marks.start : marks.ends[k - 1],
    end: marks.ends[k],
    timing: "marked",
    sure: true,
    onPause: true,
    joined: false,
    confidence: 1,
  }));
  const markers = (location.markers ?? []).map((x) => (x.start < marks.start ? { ...x, end: Math.min(x.end, marks.start) } : x));
  return { ...location, ayat, markers, timing: "marked", markedBy: marks.by };
}
