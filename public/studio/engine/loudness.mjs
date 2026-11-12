/**
 * Loudness, peak and recording-quality measurement for uploaded voice and
 * final mixes, after ITU-R BS.1770-4 and EBU R128: K-weighting, 400 ms
 * blocks every 100 ms, the -70 LUFS absolute gate and the -10 LU relative
 * gate. Pure functions over Float32Array channels, so the same code runs in
 * the browser (after decodeAudioData), in a Worker and in Node tests.
 */

/**
 * @typedef {{ b: [number, number, number], a: [number, number, number] }} Biquad
 * @typedef {ArrayLike<number>} Channel
 */

/**
 * K-weighting as two biquads, a high shelf then a high pass, derived for any
 * sample rate from the analogue prototype libebur128 uses. At 48 kHz this
 * reproduces the coefficients printed in BS.1770-4.
 * @param {number} sampleRate
 * @returns {{ shelf: Biquad, highpass: Biquad }}
 */
export function kWeighting(sampleRate) {
  const f0 = 1681.974450955533;
  const gainDb = 3.999843853973347;
  const q0 = 0.7071752369554196;
  const k = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const a0 = 1 + k / q0 + k * k;
  const f1 = 38.13547087602444;
  const q1 = 0.5003270373238773;
  const k1 = Math.tan((Math.PI * f1) / sampleRate);
  const d = 1 + k1 / q1 + k1 * k1;
  return {
    shelf: {
      b: [(vh + (vb * k) / q0 + k * k) / a0, (2 * (k * k - vh)) / a0, (vh - (vb * k) / q0 + k * k) / a0],
      a: [1, (2 * (k * k - 1)) / a0, (1 - k / q0 + k * k) / a0],
    },
    highpass: { b: [1, -2, 1], a: [1, (2 * (k1 * k1 - 1)) / d, (1 - k1 / q1 + k1 * k1) / d] },
  };
}

/**
 * @typedef {{
 *   integrated: number | null, momentaryMax: number | null, shortTermMax: number | null,
 *   samplePeakDb: number, truePeakDb: number, durationSeconds: number, gatedShare: number,
 * }} LoudnessResult
 */

/**
 * Integrated loudness (LUFS), maximum momentary (400 ms) and short-term (3 s)
 * loudness, sample peak and true peak of a recording. A mono recording is
 * measured as it will play, on both speakers ("dual mono", +3 dB), unless
 * dualMono is false. Loudness values are null for clips under 400 ms or when
 * everything is below the -70 LUFS gate.
 * @param {Channel[]} channels
 * @param {number} sampleRate
 * @param {{ dualMono?: boolean, weights?: number[] }} [options]
 * @returns {LoudnessResult}
 */
export function measureLoudness(channels, sampleRate, options = {}) {
  validate(channels, sampleRate);
  const weights = options.weights ?? channels.map(() => 1);
  const monoBoost = channels.length === 1 && (options.dualMono ?? true) ? 2 : 1;
  const hop = Math.round(sampleRate * 0.1);
  const length = channels[0].length;
  const hops = Math.floor(length / hop);
  const hopEnergy = new Float64Array(hops);
  const { shelf, highpass } = kWeighting(sampleRate);

  channels.forEach((channel, c) => {
    const w = weights[c] * monoBoost;
    if (!w) return;
    // Two cascaded biquads in transposed direct form II, in double precision.
    let s1 = 0, s2 = 0, h1 = 0, h2 = 0;
    for (let h = 0; h < hops; h += 1) {
      let sum = 0;
      const end = (h + 1) * hop;
      for (let n = h * hop; n < end; n += 1) {
        const x = channel[n];
        const y1 = shelf.b[0] * x + s1;
        s1 = shelf.b[1] * x - shelf.a[1] * y1 + s2;
        s2 = shelf.b[2] * x - shelf.a[2] * y1;
        const y2 = highpass.b[0] * y1 + h1;
        h1 = highpass.b[1] * y1 - highpass.a[1] * y2 + h2;
        h2 = highpass.b[2] * y1 - highpass.a[2] * y2;
        sum += y2 * y2;
      }
      hopEnergy[h] += w * sum;
    }
  });

  /** @param {number} start @param {number} count */
  const meanSquare = (start, count) => {
    let sum = 0;
    for (let h = start; h < start + count; h += 1) sum += hopEnergy[h];
    return sum / (count * hop);
  };
  /** @param {number} z */
  const lufs = (z) => -0.691 + 10 * Math.log10(z);

  /** @type {number[]} */
  const blocks = [];
  for (let j = 0; j + 4 <= hops; j += 1) blocks.push(meanSquare(j, 4));
  let shortTermMax = null;
  for (let j = 0; j + 30 <= hops; j += 1) {
    const value = lufs(meanSquare(j, 30));
    if (shortTermMax === null || value > shortTermMax) shortTermMax = value;
  }

  const aboveAbsolute = blocks.filter((z) => z > 0 && lufs(z) > -70);
  let integrated = null;
  let gatedShare = 0;
  if (aboveAbsolute.length) {
    const relativeGate = lufs(aboveAbsolute.reduce((a, b) => a + b, 0) / aboveAbsolute.length) - 10;
    const kept = aboveAbsolute.filter((z) => lufs(z) > relativeGate);
    integrated = round2(lufs(kept.reduce((a, b) => a + b, 0) / kept.length));
    gatedShare = round2(kept.length / blocks.length);
  }
  let loudestBlock = 0;
  for (const z of blocks) if (z > loudestBlock) loudestBlock = z;
  return {
    integrated,
    momentaryMax: loudestBlock > 0 ? round2(lufs(loudestBlock)) : null,
    shortTermMax: shortTermMax === null || shortTermMax === -Infinity ? null : round2(shortTermMax),
    samplePeakDb: round2(toDb(samplePeak(channels))),
    truePeakDb: round2(toDb(truePeak(channels))),
    durationSeconds: round2(length / sampleRate),
    gatedShare,
  };
}

/** @param {Channel[]} channels */
export function samplePeak(channels) {
  let peak = 0;
  for (const channel of channels) {
    for (let n = 0; n < channel.length; n += 1) {
      const v = Math.abs(channel[n]);
      if (v > peak) peak = v;
    }
  }
  return peak;
}

const TAPS = 12;
const PHASES = 4;
/** Kaiser-windowed sinc interpolator, 12 taps for each of the 3 in-between phases of 4x oversampling. */
const INTERPOLATOR = (() => {
  const beta = 6;
  /** @param {number} x */
  const i0 = (x) => {
    let sum = 1;
    let term = 1;
    for (let k = 1; k < 30; k += 1) {
      term *= (x / (2 * k)) ** 2;
      sum += term;
    }
    return sum;
  };
  const half = TAPS / 2;
  /** @type {Float64Array[]} */
  const phases = [];
  for (let p = 1; p < PHASES; p += 1) {
    const taps = new Float64Array(TAPS);
    let total = 0;
    for (let k = 0; k < TAPS; k += 1) {
      const tau = p / PHASES - (k - half + 1); // distance from sample n + k - 5 to n + p/4
      const sinc = Math.sin(Math.PI * tau) / (Math.PI * tau);
      const window = i0(beta * Math.sqrt(Math.max(0, 1 - (tau / half) ** 2))) / i0(beta);
      taps[k] = sinc * window;
      total += taps[k];
    }
    for (let k = 0; k < TAPS; k += 1) taps[k] /= total;
    phases.push(taps);
  }
  return phases;
})();

/**
 * True peak (linear) by 4x oversampling. Only stretches within 8 dB of the
 * sample peak are interpolated, because an in-between peak far below the
 * sample peak cannot be the maximum; this keeps an hour of speech fast.
 * @param {Channel[]} channels
 */
export function truePeak(channels) {
  let peak = samplePeak(channels);
  const threshold = peak * Math.pow(10, -8 / 20);
  const half = TAPS / 2;
  for (const channel of channels) {
    const n = channel.length;
    for (let i = 0; i + 1 < n; i += 1) {
      if (Math.abs(channel[i]) < threshold && Math.abs(channel[i + 1]) < threshold) continue;
      for (const taps of INTERPOLATOR) {
        let y = 0;
        for (let k = 0; k < TAPS; k += 1) {
          const at = i + k - half + 1;
          if (at >= 0 && at < n) y += taps[k] * channel[at];
        }
        const v = Math.abs(y);
        if (v > peak) peak = v;
      }
    }
  }
  return peak;
}

/**
 * @typedef {LoudnessResult & {
 *   sampleRate: number, channels: number, noiseFloorDb: number | null, speechLevelDb: number | null,
 *   snrDb: number | null, silenceShare: number, clippedSamples: number, clippedRuns: number,
 *   dcOffset: number, problems: string[],
 * }} RecordingAnalysis
 */

/**
 * Everything the voice plan needs to know about an uploaded recording:
 * loudness and peaks, noise floor and speech level (from 50 ms frames),
 * signal-to-noise ratio, clipping and DC offset, with plain-language problems.
 * @param {Channel[]} channels
 * @param {number} sampleRate
 * @returns {RecordingAnalysis}
 */
export function analyzeRecording(channels, sampleRate) {
  const loudness = measureLoudness(channels, sampleRate);
  const length = channels[0].length;
  const frame = Math.max(1, Math.round(sampleRate * 0.05));
  /** @type {number[]} */
  const frameDb = [];
  let dcSum = 0;
  let clippedSamples = 0;
  let clippedRuns = 0;
  for (const channel of channels) {
    let run = 0;
    for (let n = 0; n < length; n += 1) {
      const v = channel[n];
      dcSum += v;
      if (Math.abs(v) >= 0.999) {
        clippedSamples += 1;
        run += 1;
        if (run === 3) clippedRuns += 1;
      } else {
        run = 0;
      }
    }
  }
  for (let start = 0; start + frame <= length; start += frame) {
    let sum = 0;
    for (const channel of channels) for (let n = start; n < start + frame; n += 1) sum += channel[n] * channel[n];
    const rms = Math.sqrt(sum / (frame * channels.length));
    frameDb.push(rms > 0 ? 20 * Math.log10(rms) : -120);
  }
  const sorted = [...frameDb].sort((a, b) => a - b);
  /** @param {number} q */
  const percentile = (q) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null);
  const noiseFloorDb = percentile(0.1);
  const speechLevelDb = percentile(0.9);
  const snrDb = noiseFloorDb === null || speechLevelDb === null ? null : round2(speechLevelDb - noiseFloorDb);
  const silenceShare = noiseFloorDb === null ? 0 : round2(frameDb.filter((db) => db < noiseFloorDb + 6).length / frameDb.length);
  const dcOffset = Math.round((dcSum / (length * channels.length || 1)) * 1e5) / 1e5;

  /** @type {string[]} */
  const problems = [];
  if (loudness.durationSeconds < 1) problems.push("The recording is shorter than one second.");
  if (clippedRuns > 0) problems.push(`The recording clips in ${clippedRuns} place${clippedRuns === 1 ? "" : "s"}: record again a little further from the microphone or with lower input gain.`);
  if (snrDb !== null && snrDb < 20) problems.push("Background noise is close to the voice level (under 20 dB apart): record in a quieter room if you can.");
  if (loudness.integrated !== null && loudness.integrated < -40) problems.push("The recording is very quiet; raising it will also raise its noise.");
  if (Math.abs(dcOffset) > 0.01) problems.push("The recording has a DC offset; it will be removed.");
  if (sampleRate < 32000) problems.push("The sample rate is below 32 kHz, so the voice will sound dull; record at 44.1 or 48 kHz if possible.");
  return {
    ...loudness,
    sampleRate,
    channels: channels.length,
    noiseFloorDb: noiseFloorDb === null ? null : round2(noiseFloorDb),
    speechLevelDb: speechLevelDb === null ? null : round2(speechLevelDb),
    snrDb,
    silenceShare,
    clippedSamples,
    clippedRuns,
    dcOffset,
    problems,
  };
}

/**
 * The gain that brings a recording to a loudness target without its true
 * peak passing the ceiling; when both cannot be met, a limiter is needed.
 * @param {{ integrated: number | null, truePeakDb: number }} measured
 * @param {{ targetLufs?: number, ceilingDbtp?: number }} [target]
 */
export function gainToTarget(measured, target = {}) {
  const targetLufs = target.targetLufs ?? -14;
  const ceilingDbtp = target.ceilingDbtp ?? -1;
  if (measured.integrated === null) return { gainDb: 0, needsLimiter: false, resultingLufs: null, resultingTruePeakDb: measured.truePeakDb };
  const gainDb = round2(targetLufs - measured.integrated);
  const peakAfter = measured.truePeakDb + gainDb;
  return {
    gainDb,
    needsLimiter: peakAfter > ceilingDbtp,
    resultingLufs: targetLufs,
    resultingTruePeakDb: round2(Math.min(peakAfter, ceilingDbtp)),
  };
}

/** @param {Channel[]} channels @param {number} sampleRate */
function validate(channels, sampleRate) {
  if (!Array.isArray(channels) || channels.length === 0) throw new Error("At least one audio channel is needed.");
  if (!(sampleRate >= 8000 && sampleRate <= 384000)) throw new Error("The sample rate must be between 8 and 384 kHz.");
  const length = channels[0].length;
  if (channels.some((c) => c.length !== length)) throw new Error("All channels must have the same length.");
}

/** @param {number} linear */
function toDb(linear) {
  return linear > 0 ? 20 * Math.log10(linear) : -Infinity;
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}
