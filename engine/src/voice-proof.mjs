/**
 * Proof, in code, that mastering changed the sound and nothing else: the same
 * number of samples (only a reverb tail after the last word may be added),
 * the voice at the same place in time from start to end (cross-correlation),
 * and the same pitch contour (so no pitch shift, auto-tune or time-stretch
 * can hide in the chain). Run on every master; the report carries the numbers.
 */
import { median, round } from "./voice-dsp.mjs";
import { trackPitch } from "./voice-analyze.mjs";
import { msg } from "./messages.mjs";

/**
 * Where `after` sits against `before` around one moment: the lag (samples,
 * positive = later) with the highest correlation inside +-2 ms.
 * @param {ArrayLike<number>} before @param {ArrayLike<number>} after @param {number} start @param {number} length @param {number} reach
 */
export function lagAt(before, after, start, length, reach) {
  let best = -Infinity, lag = 0, energy = 0;
  for (let i = 0; i < length; i += 1) energy += before[start + i] * before[start + i];
  if (energy < length * 1e-9) return null;
  for (let l = -reach; l <= reach; l += 1) {
    let c = 0;
    for (let i = 0; i < length; i += 1) { const at = start + i + l; if (at >= 0 && at < after.length) c += before[start + i] * after[at]; }
    if (c > best) { best = c; lag = l; }
  }
  return lag;
}

/**
 * Compare two pitch tracks frame by frame (frames voiced in both).
 * @param {Float32Array} a @param {Float32Array} b
 */
export function comparePitch(a, b) {
  /** @type {number[]} */
  const cents = [];
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0, m = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    if (!a[i] || !b[i]) continue;
    const x = Math.log2(a[i]), y = Math.log2(b[i]);
    cents.push(Math.abs(y - x) * 1200);
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y; m += 1;
  }
  if (m < 20) return { frames: m, correlation: null, medianCents: null, within20Cents: null };
  const cov = sab - (sa * sb) / m, va = saa - (sa * sa) / m, vb = sbb - (sb * sb) / m;
  // A voice held on one note has no contour to correlate; the cents then carry the proof alone.
  const correlation = va > 1e-6 && vb > 1e-6 ? round(cov / Math.sqrt(va * vb), 4) : null;
  return { frames: m, correlation, medianCents: round(median(cents), 2), within20Cents: round(cents.filter((c) => c <= 20).length / m, 4) };
}

/**
 * @param {Float32Array} original the mono recording as it came in
 * @param {Float32Array[]} mastered one or two channels
 * @param {number} sampleRate
 * @param {{ tailAllowedSeconds?: number, phrases?: { start: number, end: number }[] }} [o]
 */
export function proveMaster(original, mastered, sampleRate, o = {}) {
  const n = original.length, length = mastered[0].length;
  const extraSeconds = round((length - n) / sampleRate, 3);
  const tailAllowed = o.tailAllowedSeconds ?? 0;
  const duration = { ok: length >= n && extraSeconds <= tailAllowed + 1e-9, originalSamples: n, masteredSamples: length, extraSeconds, tailAllowedSeconds: round(tailAllowed, 3) };

  const mid = new Float32Array(n);
  for (let i = 0; i < Math.min(n, length); i += 1) mid[i] = mastered.length > 1 ? (mastered[0][i] + mastered[1][i]) / 2 : mastered[0][i];

  // Start, middle and end of the voiced part: equal lags mean nothing was stretched or slid.
  const window = Math.min(Math.round(sampleRate * 0.5), Math.floor(n / 4)), reach = Math.round(sampleRate * 0.002);
  const phrases = o.phrases && o.phrases.length ? o.phrases : [{ start: 0, end: n / sampleRate }];
  /** @type {number[]} */
  const lags = [];
  for (const share of [0, 0.5, 1]) {
    const p = phrases[Math.round(share * (phrases.length - 1))];
    const centre = Math.round(((p.start + p.end) / 2) * sampleRate);
    const lag = lagAt(original, mid, Math.max(0, Math.min(n - window, centre - Math.floor(window / 2))), window, reach);
    if (lag !== null) lags.push(lag);
  }
  const worst = lags.reduce((m, l) => Math.max(m, Math.abs(l)), 0), spread = lags.length ? Math.max(...lags) - Math.min(...lags) : 0;
  // Minimum-phase filters move phases by a few samples; a quarter of a millisecond is the bound, and it must not drift.
  const alignment = { ok: lags.length > 0 && worst <= Math.round(sampleRate * 0.00025) && spread <= 3, lagsSamples: lags, worstMs: round((worst / sampleRate) * 1000, 3), driftSamples: spread };

  const compared = comparePitch(trackPitch(original, sampleRate).f0, trackPitch(mid, sampleRate).f0);
  const pitch = { ...compared, ok: compared.medianCents === null ? null : compared.medianCents <= 5 && (compared.within20Cents ?? 0) >= 0.9 && (compared.correlation === null || compared.correlation >= 0.98) };

  const messages = [
    msg(duration.ok ? "vm.proof.duration" : "vm.proof.durationFailed", { samples: n, extra: extraSeconds }),
    msg(alignment.ok ? "vm.proof.alignment" : "vm.proof.alignmentFailed", { ms: alignment.worstMs, drift: spread }),
    pitch.ok === null ? msg("vm.proof.pitchUnknown") : msg(pitch.ok ? "vm.proof.pitch" : "vm.proof.pitchFailed", { cents: compared.medianCents ?? 0, share: Math.round((compared.within20Cents ?? 0) * 100), correlation: compared.correlation ?? "n/a" }),
  ];
  return { ok: duration.ok && alignment.ok && pitch.ok !== false, duration, alignment, pitch, messages };
}
