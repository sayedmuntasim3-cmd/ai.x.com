/**
 * Cleanup, tone and dynamics of the voice mastering engine. Every setting is
 * derived from the analyzer's measurement of this recording; a profile only
 * sets how far each step may go (a recitation is touched less than a
 * narration). Every step keeps the sample count and the timing: filters are
 * minimum phase with no delay line, the denoiser is an aligned overlap-add,
 * and gain changes are plain multiplications. Nothing here changes pitch,
 * formants or speed, and nothing is generated: samples are only filtered,
 * scaled, or (for clicks and clipped peaks, under 1.5 ms each) bridged.
 */
import { biquad, clamp, db, filter, frameDb, fromDb, hann, makeFft, percentile, powerDb, round, stftProcess } from "./voice-dsp.mjs";
import { msg } from "./messages.mjs";

/** @typedef {import("./voice-analyze.mjs").VoiceProfile} VoiceProfile */
/** @typedef {import("./voice-analyze.mjs").VoiceAnalysis} VoiceAnalysis */
/** @typedef {import("./voice-dsp.mjs").FilterType} FilterType */
/** @typedef {{ type: FilterType, hz: number, q: number, gainDb: number }} EqBand */

/**
 * How far each step may go. Recitation: lighter denoise (deep reduction
 * smears letters), smaller EQ moves, a de-esser that barely touches the S
 * and Sad sounds tajweed depends on, and more of the reciter's own dynamics.
 */
export const CHAIN_LIMITS = Object.freeze({
  quran: Object.freeze({ denoiseMaxDb: 6, eqMaxDb: 3, deessMaxDb: 3, levelRangeDb: 3, levelStrength: 0.4, ratio: 1.5, peakReductionDb: 2, attackMs: 20, releaseMs: 250 }),
  narration: Object.freeze({ denoiseMaxDb: 10, eqMaxDb: 4, deessMaxDb: 6, levelRangeDb: 5, levelStrength: 0.6, ratio: 2.5, peakReductionDb: 5, attackMs: 10, releaseMs: 120 }),
});

/**
 * The settings for this recording, from its measurement. A generated voice
 * (ElevenLabs) has no microphone, room or mains behind it, so the repair
 * steps stay off for it: what looks like noise or a click there is part of
 * what was delivered, and only tone, level and loudness are set.
 * @param {VoiceAnalysis} a @param {VoiceProfile} [profile] @param {{ source?: "own-recording" | "elevenlabs" }} [o]
 */
export function planChain(a, profile = a.profile, o = {}) {
  const limit = CHAIN_LIMITS[profile];
  const repair = o.source !== "elevenlabs";
  // The low cut sits under the lowest note the voice reaches, never inside it.
  const highpass = { hz: round(clamp(0.7 * (a.pitch?.lowHz ?? 115), 50, 100), 0), order: a.plosives.count > 0 ? 4 : 2 };
  // Narrow cuts only where hum was measured, deep enough to put each line 72 dB under the voice, never deeper than it stands out.
  const hum = !repair ? [] : a.hum.harmonics.map((h) => ({ hz: h.hz, q: round(h.hz / 2.5, 1), gainDb: -round(clamp(Math.min(h.prominenceDb + 6, h.levelDb - a.level.speechDb + 72), 6, 40), 1) }));
  const denoiseDb = repair && a.level.measuredInPauses && a.level.snrDb < 50 ? round(clamp((50 - a.level.snrDb) * 0.4, 0, limit.denoiseMaxDb), 1) : 0;

  /** @type {EqBand[]} */
  const eq = [];
  const dev = a.tone.bands.map((b) => b.deviationDb);
  // Clarity may be lifted only as far as the noise allows, and never where the recording holds nothing.
  const boostMax = clamp((a.level.snrDb - 20) / 8, 0, limit.eqMaxDb);
  /** @param {number} deviation @param {number} dead @param {boolean} cutOnly */
  const move = (deviation, dead, cutOnly) => {
    if (Math.abs(deviation) <= dead || deviation < -15) return 0;
    const g = -0.5 * (deviation - Math.sign(deviation) * dead);
    return round(g < 0 ? Math.max(g, -limit.eqMaxDb) : cutOnly ? 0 : Math.min(g, boostMax), 1);
  };
  /** @param {FilterType} type @param {number} hz @param {number} q @param {number} gainDb */
  const add = (type, hz, q, gainDb) => { if (gainDb !== 0) eq.push({ type, hz, q, gainDb }); };
  add("lowshelf", 160, 0.707, move(dev[0], 3, true));
  add("peak", 250, 1.2, move(dev[1], 1.5, true));
  add("peak", 500, 1.2, clamp(move(dev[2], 1.5, false), -2, 2));
  add("peak", 1000, 1.2, clamp(move(dev[3], 1.5, false), -2, 2));
  add("peak", 2000, 1.2, move(dev[4], 1.5, false));
  add("peak", 4000, 1.2, move(dev[5], 1.5, false));
  add("highshelf", 6500, 0.707, move(dev[6], 1.5, false));

  // The de-esser works only on S sounds that pass 14 dB under the voice, and only as far as they pass it.
  const deess = a.sibilance.db > -14 ? { thresholdDb: round(a.level.speechDb - 14, 1), maxDb: round(Math.min(limit.deessMaxDb, (a.sibilance.db + 14) * 0.6), 1), splitHz: 4500 } : null;

  return {
    profile,
    repair,
    dc: Math.abs(a.dcOffset) > 0.0005,
    declip: repair && a.clipping.runs > 0,
    highpass,
    hum,
    denoiseDb,
    eq,
    deess,
    leveller: { rangeDb: limit.levelRangeDb, strength: limit.levelStrength },
    compressor: { ratio: limit.ratio, peakReductionDb: limit.peakReductionDb, kneeDb: 6, attackMs: limit.attackMs, releaseMs: limit.releaseMs },
  };
}

/** @typedef {ReturnType<typeof planChain>} ChainPlan */

/**
 * Round off clipped peaks: each flat run is bridged with a cubic through the
 * slopes on both sides. Flat tops longer than 1.3 ms are left (they cannot be
 * guessed). The lost peak is not recovered, only made less harsh.
 * @param {Float32Array} x @param {number} sampleRate @returns {number} runs repaired
 */
export function declip(x, sampleRate) {
  let peak = 0;
  for (let i = 0; i < x.length; i += 1) peak = Math.max(peak, Math.abs(x[i]));
  const ceiling = peak * 0.9995, longest = Math.round(sampleRate * 0.0013);
  let repaired = 0;
  for (let i = 2; i < x.length - 2;) {
    if (Math.abs(x[i]) < ceiling) { i += 1; continue; }
    let j = i;
    while (j < x.length - 2 && Math.abs(x[j]) >= ceiling && x[j] * x[i] > 0) j += 1;
    const len = j - i;
    if (len >= 3 && len <= longest) {
      // Slopes are averaged over three samples so a ripple at the edge does not decide the height.
      const span = len + 1, p0 = x[i - 1], p1 = x[j];
      const m0 = ((x[i - 1] - x[Math.max(0, i - 4)]) / 3) * span, m1 = ((x[Math.min(x.length - 1, j + 3)] - x[j]) / 3) * span;
      const sign = Math.sign(x[i]);
      for (let k = i; k < j; k += 1) {
        const t = (k - i + 1) / span, t2 = t * t, t3 = t2 * t;
        const v = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
        // Never below the flat top it replaces, never more than 3.5 dB above it.
        x[k] = sign * clamp(sign * v, peak, peak * 1.5);
      }
      repaired += 1;
    }
    i = Math.max(j, i + 1);
  }
  return repaired;
}

/**
 * Remove clicks (digital ticks, crackle). Deliberately hard to trigger, so a
 * consonant is never taken for a click: the part of the signal above 6 kHz
 * must jump twelve times above its surroundings (5 ms each side), four times
 * above what this voice ever reaches up there, and be over within 1.5 ms. A
 * stop consonant's burst lasts far longer and fails the first test. The hit
 * is bridged with a smooth curve between the clean samples on both sides.
 * @param {Float32Array} x @param {number} sampleRate @returns {number} clicks removed
 */
export function declick(x, sampleRate) {
  const n = x.length, half = Math.round(sampleRate * 0.005), guard = Math.round(sampleRate * 0.001);
  const longest = Math.round(sampleRate * 0.0015), margin = Math.max(2, Math.round(sampleRate * 0.0001));
  if (n < half * 4) return 0;
  const hf = filter(x, [biquad("highpass", 6000, sampleRate, 0.541), biquad("highpass", 6000, sampleRate, 1.307)]);
  const some = new Float32Array(Math.ceil(n / 97));
  for (let i = 0; i < n; i += 1) { hf[i] = Math.abs(hf[i]); if (i % 97 === 0) some[i / 97] = hf[i]; }
  const least = Math.max(1e-4, 4 * percentile(some, 0.999));
  /** @param {number} i */
  const at = (i) => (i < 0 || i >= n ? 0 : hf[i]);
  /** @type {number[]} */
  const hits = [];
  let wide = 0, near = 0;
  for (let i = 0; i <= half; i += 1) wide += at(i);
  for (let i = 0; i <= guard; i += 1) near += at(i);
  for (let i = 0; i < n; i += 1) {
    if (hf[i] > least && hf[i] * 2 * (half - guard) > 12 * (wide - near)) hits.push(i);
    wide += at(i + half + 1) - at(i - half);
    near += at(i + guard + 1) - at(i - guard);
  }
  let removed = 0;
  for (let h = 0; h < hits.length;) {
    let g = h;
    while (g + 1 < hits.length && hits[g + 1] - hits[g] <= margin * 2) g += 1;
    const from = hits[h] - margin, to = hits[g] + margin;
    if (from > 4 && to < n - 5 && to - from <= longest) {
      const span = to - from + 2, p0 = x[from - 1], p1 = x[to + 1];
      const m0 = ((x[from - 1] - x[from - 4]) / 3) * span, m1 = ((x[to + 4] - x[to + 1]) / 3) * span;
      for (let k = from; k <= to; k += 1) {
        const t = (k - from + 1) / span, t2 = t * t, t3 = t2 * t;
        x[k] = (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1;
      }
      removed += 1;
    }
    h = g + 1;
  }
  return removed;
}

/**
 * The noise's own spectrum, read from the quieter half of the frames inside
 * the pauses (so a breath or a tail of the voice is not taken for noise).
 * @param {Float32Array} x @param {number} sampleRate @param {{ start: number, end: number }[]} pauses @param {number} size
 * @returns {Float64Array | null}
 */
export function noiseProfile(x, sampleRate, pauses, size) {
  /** @type {number[]} */
  const starts = [];
  for (const p of pauses) for (let s = Math.round((p.start + 0.1) * sampleRate); s + size <= Math.round((p.end - 0.05) * sampleRate); s += size / 2) starts.push(s);
  if (starts.length < 8) return null;
  const step = Math.max(1, Math.floor(starts.length / 300));
  const win = hann(size).map(Math.sqrt), run = makeFft(size);
  const re = new Float64Array(size), im = new Float64Array(size);
  /** @type {{ energy: number, power: Float64Array }[]} */
  const frames = [];
  for (let f = 0; f < starts.length; f += step) {
    for (let i = 0; i < size; i += 1) { re[i] = x[starts[f] + i] * win[i]; im[i] = 0; }
    run(re, im);
    const power = new Float64Array(size / 2 + 1);
    let energy = 0;
    for (let k = 0; k <= size / 2; k += 1) { power[k] = re[k] * re[k] + im[k] * im[k]; energy += power[k]; }
    frames.push({ energy, power });
  }
  frames.sort((a, b) => a.energy - b.energy);
  const keep = frames.slice(0, Math.max(4, Math.ceil(frames.length / 2)));
  const profile = new Float64Array(size / 2 + 1);
  for (const f of keep) for (let k = 0; k < profile.length; k += 1) profile[k] += f.power[k] / keep.length;
  return profile;
}

/**
 * Lower steady background noise by at most `reductionDb`. Each frequency bin
 * is turned down only while it holds little more than the measured noise; a
 * bin carrying voice passes untouched. The floor is shallow on purpose: deep
 * noise reduction is what makes a voice sound watery or robotic.
 * @param {Float32Array} x @param {number} sampleRate @param {Float64Array} profile from noiseProfile @param {number} reductionDb
 */
export function denoise(x, sampleRate, profile, reductionDb) {
  const size = (profile.length - 1) * 2, hop = size / 4;
  const floor = fromDb(-reductionDb), hold = Math.exp(-hop / (0.04 * sampleRate)), bins = profile.length;
  const last = new Float64Array(bins).fill(1), power = new Float64Array(bins);
  return stftProcess(x, size, hop, (re, im) => {
    for (let k = 0; k < bins; k += 1) power[k] = re[k] * re[k] + im[k] * im[k];
    for (let k = 0; k < bins; k += 1) {
      const p = (power[Math.max(0, k - 1)] + 2 * power[k] + power[Math.min(bins - 1, k + 1)]) / 4;
      const open = 1 - (2.5 * profile[k]) / (p + 1e-30);
      let g = Math.max(floor, open > 0 ? Math.sqrt(open) : 0);
      // Open at once for the voice, close over about 40 ms.
      if (g < last[k]) g = last[k] * hold + g * (1 - hold);
      last[k] = g;
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < bins - 1) { re[size - k] *= g; im[size - k] *= g; }
    }
  });
}

/**
 * Soften S sounds: only the part of the signal above the split frequency is
 * turned down, only while the 5-10 kHz band is above the threshold, and never
 * by more than `maxDb`. The rest of the voice passes bit for bit.
 * @param {Float32Array} x @param {number} sampleRate @param {{ thresholdDb: number, maxDb: number, splitHz: number }} o
 * @returns {{ maxReductionDb: number, activeShare: number }}
 */
export function deess(x, sampleRate, o) {
  const hp5 = biquad("highpass", 5000, sampleRate);
  const detect = filter(x, [hp5, hp5, biquad("lowpass", 10000, sampleRate)]);
  const high = filter(x, biquad("highpass", o.splitHz, sampleRate));
  const rise = 1 - Math.exp(-1 / (0.001 * sampleRate)), fall = 1 - Math.exp(-1 / (0.03 * sampleRate));
  const smoothing = 1 - Math.exp(-1 / (0.005 * sampleRate));
  let env = 0, gain = 1, deepest = 1, active = 0;
  for (let i = 0; i < x.length; i += 1) {
    const p = detect[i] * detect[i];
    env += (p - env) * (p > env ? rise : fall);
    const over = powerDb(env) - o.thresholdDb;
    const want = over > 0 ? fromDb(-Math.min(o.maxDb, over * 0.6)) : 1;
    gain += (want - gain) * smoothing;
    if (gain < 0.99) active += 1;
    if (gain < deepest) deepest = gain;
    x[i] += high[i] * (gain - 1);
  }
  return { maxReductionDb: round(-db(deepest), 1), activeShare: round(active / Math.max(1, x.length), 4) };
}

/**
 * Slow leveller: rides the level phrase by phrase toward the voice's own
 * average, by a bounded amount, holding still in pauses so noise is never
 * pumped up. It looks 300 ms ahead and behind, so it never lags a phrase.
 * @param {Float32Array} x @param {number} sampleRate @param {Uint8Array | null} active 10 ms activity flags, or null to derive them
 * @param {{ rangeDb: number, strength: number }} o
 */
export function level(x, sampleRate, active, o) {
  const hop = Math.round(sampleRate * 0.01);
  const levels = frameDb(x, hop * 2, hop);
  const frames = levels.length;
  if (frames < 10) return { minDb: 0, maxDb: 0 };
  const act = active ?? activityOf(levels);
  const power = new Float64Array(frames + 1), count = new Float64Array(frames + 1);
  /** @type {number[]} */
  const voiced = [];
  for (let f = 0; f < frames; f += 1) {
    const on = act[Math.min(act.length - 1, f)] === 1;
    power[f + 1] = power[f] + (on ? Math.pow(10, levels[f] / 10) : 0);
    count[f + 1] = count[f] + (on ? 1 : 0);
    if (on) voiced.push(levels[f]);
  }
  if (voiced.length < 10) return { minDb: 0, maxDb: 0 };
  const target = powerDb(power[frames] / count[frames]);
  const gains = new Float32Array(frames);
  let held = 0, minDb = 0, maxDb = 0;
  for (let f = 0; f < frames; f += 1) {
    const a = Math.max(0, f - 30), b = Math.min(frames, f + 31);
    const c = count[b] - count[a];
    if (c >= 10) {
      // Local level against the whole voice's level, both as mean power: a steady voice gets no gain.
      held = clamp((target - powerDb((power[b] - power[a]) / c)) * o.strength, -o.rangeDb, o.rangeDb);
    }
    gains[f] = held;
  }
  // Frames before the first voiced stretch take its gain instead of zero.
  for (let f = 0, first = gains.findIndex((g) => g !== 0); f < first; f += 1) gains[f] = gains[first];
  let g = gains[0];
  const slew = 1 - Math.exp(-1 / (0.2 * sampleRate));
  for (let i = 0; i < x.length; i += 1) {
    const want = gains[Math.min(frames - 1, Math.floor(i / hop))];
    g += (want - g) * slew;
    if (g < minDb) minDb = g;
    if (g > maxDb) maxDb = g;
    x[i] *= fromDb(g);
  }
  return { minDb: round(minDb, 1), maxDb: round(maxDb, 1) };
}

/** Activity flags from frame levels alone (voice = within 30 dB of the loud frames). @param {Float32Array} levels */
function activityOf(levels) {
  const top = percentile(levels, 0.95);
  return Uint8Array.from(levels, (v) => (v > top - 30 ? 1 : 0));
}

/**
 * Soft-knee compressor on an RMS detector. The threshold is placed from the
 * recording's own level histogram so that its loud frames (95th percentile)
 * come down by the profile's few dB; a recording that is already even is
 * compressed less, or not at all.
 * @param {Float32Array} x @param {number} sampleRate
 * @param {{ ratio: number, peakReductionDb: number, kneeDb: number, attackMs: number, releaseMs: number }} o
 */
export function compress(x, sampleRate, o) {
  const hop = Math.round(sampleRate * 0.01);
  const levels = frameDb(x, hop * 2, hop);
  const top = percentile(levels, 0.95);
  const voiced = Array.from(levels).filter((v) => v > top - 30);
  if (voiced.length < 10) return { thresholdDb: 0, wantedDb: 0, maxReductionDb: 0, meanReductionDb: 0 };
  const p95 = percentile(voiced, 0.95), p50 = percentile(voiced, 0.5);
  const wanted = round(o.peakReductionDb * clamp((p95 - p50 - 2) / 5, 0, 1), 1);
  const slope = 1 - 1 / o.ratio;
  const threshold = p95 - wanted / slope;
  if (wanted < 0.2) return { thresholdDb: round(threshold, 1), wantedDb: wanted, maxReductionDb: 0, meanReductionDb: 0 };
  const detect = 1 - Math.exp(-1 / (0.01 * sampleRate));
  const attack = 1 - Math.exp(-1 / ((o.attackMs / 1000) * sampleRate)), release = 1 - Math.exp(-1 / ((o.releaseMs / 1000) * sampleRate));
  const knee = o.kneeDb;
  let env = 0, reduction = 0, deepest = 0, total = 0, loud = 0;
  for (let i = 0; i < x.length; i += 1) {
    env += (x[i] * x[i] - env) * detect;
    const over = powerDb(env) - threshold;
    const want = over <= -knee / 2 ? 0 : over >= knee / 2 ? over * slope : (slope * (over + knee / 2) * (over + knee / 2)) / (2 * knee);
    reduction += (want - reduction) * (want > reduction ? attack : release);
    if (reduction > deepest) deepest = reduction;
    if (over > -30 - threshold + top) { total += reduction; loud += 1; }
    x[i] *= fromDb(-reduction);
  }
  return { thresholdDb: round(threshold, 1), wantedDb: wanted, maxReductionDb: round(deepest, 1), meanReductionDb: round(total / Math.max(1, loud), 1) };
}

/**
 * Run cleanup, tone and dynamics on a copy of the recording.
 * @param {Float32Array} input @param {number} sampleRate @param {VoiceAnalysis} analysis @param {ChainPlan} [plan]
 */
export function runChain(input, sampleRate, analysis, plan = planChain(analysis)) {
  let x = Float32Array.from(input);
  const messages = [];
  if (plan.dc) { let sum = 0; for (let i = 0; i < x.length; i += 1) sum += x[i]; const mean = sum / Math.max(1, x.length); for (let i = 0; i < x.length; i += 1) x[i] -= mean; }
  const declipped = plan.declip ? declip(x, sampleRate) : 0;
  if (plan.declip) messages.push(msg("vm.did.declip", { repaired: declipped, found: analysis.clipping.runs }));
  if (!plan.repair) messages.push(msg("vm.did.generated"));
  const clicks = plan.repair ? declick(x, sampleRate) : 0;
  if (clicks > 0) messages.push(msg("vm.did.declick", { count: clicks }));

  const hp = biquad("highpass", plan.highpass.hz, sampleRate);
  filter(x, plan.highpass.order === 4 ? [biquad("highpass", plan.highpass.hz, sampleRate, 0.541), biquad("highpass", plan.highpass.hz, sampleRate, 1.307)] : hp, x);
  messages.push(msg("vm.did.highpass", { hz: plan.highpass.hz, slope: plan.highpass.order * 6 }));
  if (plan.hum.length) {
    filter(x, plan.hum.map((h) => biquad("peak", h.hz, sampleRate, h.q, h.gainDb)), x);
    messages.push(msg("vm.did.hum", { hz: plan.hum.map((h) => h.hz).join(", ") }));
  }
  let denoisedDb = 0;
  if (plan.denoiseDb > 0) {
    const size = sampleRate >= 32000 ? 2048 : 1024;
    const profile = noiseProfile(x, sampleRate, analysis.pauses.list, size);
    if (profile) { x = denoise(x, sampleRate, profile, plan.denoiseDb); denoisedDb = plan.denoiseDb; messages.push(msg("vm.did.denoise", { db: plan.denoiseDb })); }
  }
  if (plan.eq.length) {
    filter(x, plan.eq.map((b) => biquad(b.type, b.hz, sampleRate, b.q, b.gainDb)), x);
    messages.push(msg("vm.did.eq", { moves: plan.eq.map((b) => (b.gainDb > 0 ? "+" : "") + b.gainDb + " dB @ " + b.hz + " Hz").join(", ") }));
  } else messages.push(msg("vm.did.eqNone"));
  const deessed = plan.deess ? deess(x, sampleRate, plan.deess) : null;
  if (deessed) messages.push(msg("vm.did.deess", { db: deessed.maxReductionDb }));
  const levelled = level(x, sampleRate, null, plan.leveller);
  const compressed = compress(x, sampleRate, plan.compressor);
  messages.push(msg("vm.did.dynamics", { down: -levelled.minDb, up: levelled.maxDb, ratio: plan.compressor.ratio, mean: compressed.meanReductionDb, max: compressed.maxReductionDb }));
  return { samples: x, plan, did: { declipped, clicks, denoisedDb, deess: deessed, leveller: levelled, compressor: compressed }, messages };
}
