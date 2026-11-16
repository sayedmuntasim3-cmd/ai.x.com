/**
 * The analyzer of the voice mastering engine: everything the chain needs to
 * know about one mono recording, measured, never assumed. Noise floor and
 * SNR, mains hum, DC, clipping, breath pops, sibilance, tonal balance against
 * a target voice curve, the room already in the recording, dynamics, loudness
 * and true peak, pauses, phrases, sustained notes and the pitch track.
 *
 * Thresholds here are engineering defaults checked on synthetic signals; they
 * decide how much of each step is applied and are meant to be tuned by ear.
 */
import { biquad, clamp, filter, frameDb, median, percentile, powerDb, round, spectra } from "./voice-dsp.mjs";
import { kWeighting, measureLoudness } from "./loudness.mjs";
import { msg } from "./messages.mjs";

/** @typedef {"quran" | "narration"} VoiceProfile */
/** @typedef {{ start: number, end: number }} Span */

/** Octave bands the tone is judged in (centre frequencies, Hz). */
export const TONE_BANDS = Object.freeze([125, 250, 500, 1000, 2000, 4000, 8000, 16000]);

/**
 * Octave-band levels of average speech, dB relative to the whole, summed from
 * the third-octave long-term average speech spectrum (after Byrne et al.,
 * JASA 1994, combined male and female talkers). A broad guide, not a law:
 * corrections toward it are bounded and applied at half strength.
 */
const AVERAGE_SPEECH = Object.freeze([-8.7, -5.4, -3.6, -10.4, -15.3, -19.5, -21.4, -26.0]);

/**
 * What each profile adds to average speech to reach its target: a recitation
 * a little clearer and more open, a narration warm with more presence. These
 * offsets are this engine's starting choice, to be tuned with the owner by ear.
 */
export const TONE_OFFSETS = Object.freeze({
  quran: Object.freeze([-1, -0.5, 0, 0, 0.5, 1, 1.5, 1.5]),
  narration: Object.freeze([0.5, -1, -0.5, 0, 1, 1.5, 1.5, 2]),
});

/** The target curve of a profile, dB per band relative to the 500 Hz + 1 kHz mean. @param {VoiceProfile} profile */
export function targetCurve(profile) {
  const raw = AVERAGE_SPEECH.map((v, i) => v + TONE_OFFSETS[profile][i]);
  const ref = (raw[2] + raw[3]) / 2;
  return raw.map((v) => round(v - ref, 2));
}

/**
 * Pitch track: normalised cross-correlation on an 8 kHz copy, 60-500 Hz,
 * one value every 20 ms (0 = unvoiced). Used for sustained notes, for
 * placing the high-pass under the voice, and to prove that mastering left
 * the pitch contour alone.
 * @param {ArrayLike<number>} x @param {number} sampleRate
 */
export function trackPitch(x, sampleRate) {
  const factor = Math.max(1, Math.round(sampleRate / 8000));
  const rate = sampleRate / factor;
  const lp = biquad("lowpass", 900, sampleRate);
  const band = filter(x, [lp, lp, biquad("highpass", 50, sampleRate)]);
  const y = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < y.length; i += 1) y[i] = band[i * factor];
  const hop = Math.round(rate * 0.02), win = Math.round(rate * 0.032);
  const minLag = Math.floor(rate / 500), maxLag = Math.ceil(rate / 60);
  const frames = Math.max(0, Math.floor((y.length - win - maxLag - 1) / hop) + 1);
  const energy = new Float64Array(y.length + 1);
  for (let i = 0; i < y.length; i += 1) energy[i + 1] = energy[i] + y[i] * y[i];
  const f0 = new Float32Array(frames), clarity = new Float32Array(frames);
  const r = new Float64Array(maxLag + 2);
  for (let f = 0; f < frames; f += 1) {
    const s = f * hop;
    const e0 = energy[s + win] - energy[s];
    if (e0 < win * 1e-8) continue;
    let top = 0;
    for (let lag = minLag - 1; lag <= maxLag + 1; lag += 1) {
      let sum = 0;
      for (let n = 0; n < win; n += 1) sum += y[s + n] * y[s + n + lag];
      r[lag] = sum / Math.sqrt(e0 * (energy[s + lag + win] - energy[s + lag]) + 1e-20);
    }
    for (let lag = minLag; lag <= maxLag; lag += 1) if (r[lag] > top && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) top = r[lag];
    if (top < 0.55) continue;
    // The first strong peak, not the strongest: a peak at twice the period is the same note an octave down.
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (r[lag] >= 0.9 * top && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
        const a = r[lag - 1], b = r[lag], c = r[lag + 1];
        const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
        f0[f] = rate / (lag + clamp(shift, -0.5, 0.5));
        clarity[f] = b;
        break;
      }
    }
  }
  return { hopSeconds: hop / rate, offsetSeconds: win / 2 / rate, f0, clarity };
}

/**
 * Loudness range (EBU Tech 3342): 3 s loudness every 100 ms, gated at
 * -70 LUFS and 20 LU under the mean, 10th to 95th percentile.
 * @param {ArrayLike<number>} x @param {number} sampleRate @returns {number | null}
 */
export function loudnessRange(x, sampleRate) {
  const k = kWeighting(sampleRate);
  /** @param {{ b: number[], a: number[] }} s */
  const coefs = (s) => ({ b0: s.b[0], b1: s.b[1], b2: s.b[2], a1: s.a[1], a2: s.a[2] });
  const w = filter(x, [coefs(k.shelf), coefs(k.highpass)]);
  const hop = Math.round(sampleRate * 0.1);
  const hops = Math.floor(w.length / hop);
  if (hops < 30) return null;
  const e = new Float64Array(hops + 1);
  for (let h = 0; h < hops; h += 1) { let s = 0; for (let i = h * hop; i < (h + 1) * hop; i += 1) s += w[i] * w[i]; e[h + 1] = e[h] + s / hop; }
  /** @type {number[]} */
  const st = [];
  // A mono voice plays on both speakers, which reads 3 dB louder (the factor 2).
  for (let h = 30; h <= hops; h += 1) st.push(-0.691 + powerDb(((e[h] - e[h - 30]) / 30) * 2));
  const loud = st.filter((v) => v > -70);
  if (loud.length < 2) return null;
  const mean = powerDb(loud.reduce((s, v) => s + Math.pow(10, v / 10), 0) / loud.length);
  const kept = loud.filter((v) => v > mean - 20);
  return kept.length < 2 ? null : round(percentile(kept, 0.95) - percentile(kept, 0.1), 1);
}

/**
 * Speech activity from 10 ms frame levels: the noise floor, the speech
 * level, which frames carry voice, and the pauses between phrases.
 * @param {Float32Array} levels frame levels in dB, one per 10 ms
 */
export function findActivity(levels) {
  const n = levels.length;
  const floorGuess = Math.max(-110, percentile(levels, 0.05));
  const p95 = percentile(levels, 0.95);
  let sum = 0, count = 0;
  for (let i = 0; i < n; i += 1) if (levels[i] >= p95 - 25) { sum += Math.pow(10, levels[i] / 10); count += 1; }
  const speechDb = count ? powerDb(sum / count) : -120;
  const threshold = Math.min(Math.max(floorGuess + 10, speechDb - 30), speechDb - 12);
  const active = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) active[i] = levels[i] > threshold ? 1 : 0;
  // Close gaps under 150 ms (stop consonants), then drop blips under 50 ms.
  fillRuns(active, 0, 15, 1);
  fillRuns(active, 1, 5, 0);
  /** @type {Span[]} */
  const pauses = [];
  /** @type {Span[]} */
  const phrases = [];
  let noiseSum = 0, noiseCount = 0;
  for (let i = 0; i < n;) {
    let j = i;
    while (j < n && active[j] === active[i]) j += 1;
    if (active[i]) phrases.push({ start: i * 0.01, end: j * 0.01 });
    else {
      if (j - i >= 30) pauses.push({ start: i * 0.01, end: j * 0.01 });
      // Noise is read well inside a pause, away from the voice's own tail.
      for (let f = i + 10; f < j - 10; f += 1) { noiseSum += Math.pow(10, levels[f] / 10); noiseCount += 1; }
    }
    i = j;
  }
  const noiseFloorDb = Math.max(-100, noiseCount >= 5 ? powerDb(noiseSum / noiseCount) : floorGuess);
  // Short gaps that are not pauses belong to the phrase around them.
  /** @type {Span[]} */
  const merged = [];
  for (const p of phrases) {
    const last = merged[merged.length - 1];
    if (last && p.start - last.end < 0.3) last.end = p.end; else merged.push({ ...p });
  }
  return { active, speechDb, noiseFloorDb, measuredInPauses: noiseCount >= 5, threshold, pauses, phrases: merged };
}

/**
 * Every unbroken stretch of voice in a recording, to 10 ms: a gap of 150 ms
 * or more (a breath) separates two stretches. This is the same activity
 * reading the analysis uses, without the rest of it, for placing ayat on
 * the pauses of a long recitation.
 * @param {Float32Array} x @param {number} sampleRate
 */
export function voiceSpans(x, sampleRate) {
  const hop = Math.round(sampleRate * 0.01);
  const act = findActivity(frameDb(filter(x, biquad("highpass", 60, sampleRate)), hop * 2, hop));
  /** @type {Span[]} */
  const spans = [];
  for (let i = 0; i < act.active.length;) {
    let j = i;
    while (j < act.active.length && act.active[j] === act.active[i]) j += 1;
    if (act.active[i]) spans.push({ start: i * 0.01, end: j * 0.01 });
    i = j;
  }
  return { spans, pauses: act.pauses, speechDb: act.speechDb, noiseFloorDb: act.noiseFloorDb, seconds: x.length / sampleRate };
}

/** Turn runs of `value` shorter than `under` frames into `to`. @param {Uint8Array} a @param {number} value @param {number} under @param {number} to */
function fillRuns(a, value, under, to) {
  for (let i = 0; i < a.length;) {
    let j = i;
    while (j < a.length && a[j] === a[i]) j += 1;
    if (a[i] === value && j - i < under && i > 0 && j < a.length) a.fill(to, i, j);
    i = j;
  }
}

/**
 * Mains hum: steady narrow peaks at 50 or 60 Hz and their harmonics, read
 * from the quiet 20% of long spectra (a voice moves, hum does not).
 * A line quieter than `minLevelDb` (dBFS) is not worth a filter.
 * @param {ArrayLike<number>} x @param {number} sampleRate @param {number} [minLevelDb]
 */
export function findHum(x, sampleRate, minLevelDb = -95) {
  const size = 16384;
  /** @type {{ hz: number | null, prominenceDb: number, harmonics: { hz: number, prominenceDb: number, levelDb: number }[] }} */
  const none = { hz: null, prominenceDb: 0, harmonics: [] };
  if (x.length < size * 2) return none;
  const binHz = sampleRate / size;
  const bins = Math.ceil(520 / binHz);
  const total = Math.floor((x.length - size) / (size / 2)) + 1;
  const hop = (size / 2) * Math.max(1, Math.ceil(total / 120));
  /** @type {Float32Array[]} */
  const rows = [];
  spectra(x, size, hop, (power) => { const row = new Float32Array(bins); for (let k = 0; k < bins; k += 1) row[k] = powerDb(power[k]); rows.push(row); });
  const quiet = new Float32Array(bins);
  const column = new Float32Array(rows.length);
  for (let k = 0; k < bins; k += 1) { for (let r = 0; r < rows.length; r += 1) column[r] = rows[r][k]; quiet[k] = percentile(column, 0.2); }
  /** @param {number} hz */
  const prominence = (hz) => {
    const at = Math.round(hz / binHz);
    const peak = Math.max(quiet[at - 1], quiet[at], quiet[at + 1]);
    const around = [];
    for (let k = Math.max(2, Math.round((hz - 25) / binHz)); k <= Math.min(bins - 1, Math.round((hz + 25) / binHz)); k += 1) if (Math.abs(k - at) > 3) around.push(quiet[k]);
    // A sine of RMS level L reads L + 20 log10(size / (2 sqrt 2)) at the peak of a Hann-windowed FFT.
    return { p: peak - median(around), levelDb: peak - 20 * Math.log10(size / (2 * Math.SQRT2)) };
  };
  let best = none;
  for (const base of [50, 60]) {
    const harmonics = [];
    for (let h = 1; h * base <= 480; h += 1) { const { p, levelDb } = prominence(h * base); if (p >= 8 && levelDb >= minLevelDb) harmonics.push({ hz: h * base, prominenceDb: round(p, 1), levelDb: round(levelDb, 1) }); }
    const strongest = harmonics.slice(0, 3).reduce((m, h) => Math.max(m, h.hz <= base * 3 ? h.prominenceDb : 0), 0);
    if (strongest >= 12 && strongest > best.prominenceDb) best = { hz: base, prominenceDb: strongest, harmonics };
  }
  return best;
}

/**
 * How long the recording's own room rings: wherever loud voice stops, the
 * fall of the frame levels is fitted. The quick decays bound the room (a
 * voice can fade slowly, a room cannot decay faster than it does). Frames are
 * 20 ms long, so nothing under about 0.1 s can be told apart.
 * @param {Float32Array} levels one per 10 ms @param {number} speechDb @param {number} noiseFloorDb
 * @returns {{ rt60: number | null, decays: number }}
 */
export function estimateRoom(levels, speechDb, noiseFloorDb) {
  /** @type {number[]} */
  const times = [];
  const loud = speechDb - 6;
  for (let t0 = 0; t0 + 16 < levels.length; t0 += 1) {
    if (levels[t0] < loud) continue;
    let quietAfter = true;
    for (let k = 1; k <= 15 && quietAfter; k += 1) if (levels[t0 + k] >= loud) quietAfter = false;
    if (!quietAfter) continue;
    const top = levels[t0] - 5, bottom = Math.max(levels[t0] - 30, noiseFloorDb + 6);
    if (top - bottom < 12) continue;
    let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0, lowest = levels[t0], reached = top;
    for (let i = t0 + 1; i < levels.length; i += 1) {
      if (levels[i] > lowest + 3 && levels[i] <= top) break; // a new sound begins
      lowest = Math.min(lowest, levels[i]);
      if (levels[i] > top) continue;
      if (levels[i] < bottom) { reached = bottom; break; }
      const t = (i - t0) * 0.01;
      sx += t; sy += levels[i]; sxx += t * t; sxy += t * levels[i]; m += 1; reached = levels[i];
    }
    if (top - reached < 12) continue;
    if (m < 3) { times.push(0.1); continue; }
    const slope = (m * sxy - sx * sy) / (m * sxx - sx * sx);
    if (slope < -1) times.push(clamp(-60 / slope, 0.1, 10));
  }
  if (times.length < 2) return { rt60: null, decays: times.length };
  return { rt60: round(percentile(times, 0.25), 2), decays: times.length };
}

/**
 * Measure one mono recording and say what was found.
 * @param {Float32Array} x @param {number} sampleRate @param {{ profile?: VoiceProfile }} [options]
 */
export function analyzeVoice(x, sampleRate, options = {}) {
  const analysis = measureVoice(x, sampleRate, options);
  return { ...analysis, messages: analysisMessages(analysis) };
}

/** @typedef {ReturnType<typeof analyzeVoice>} VoiceAnalysis */

/**
 * The measurements alone.
 * @param {Float32Array} x @param {number} sampleRate @param {{ profile?: VoiceProfile }} [options]
 */
export function measureVoice(x, sampleRate, options = {}) {
  const profile = options.profile ?? "quran";
  const n = x.length;
  const seconds = n / sampleRate;
  const hop = Math.round(sampleRate * 0.01);

  let dcSum = 0, peak = 0;
  for (let i = 0; i < n; i += 1) { dcSum += x[i]; const a = Math.abs(x[i]); if (a > peak) peak = a; }
  const dcOffset = n ? dcSum / n : 0;

  // Clipping: flat runs of three or more samples at the recording's own ceiling.
  let clippedRuns = 0, clippedSamples = 0;
  if (peak > 0.5) {
    const ceiling = peak * 0.9995;
    for (let i = 0; i < n;) {
      if (Math.abs(x[i]) < ceiling) { i += 1; continue; }
      let j = i;
      while (j < n && Math.abs(x[j]) >= ceiling && x[j] * x[i] > 0) j += 1;
      if (j - i >= 3) { clippedRuns += 1; clippedSamples += j - i; }
      i = j;
    }
  }

  const voiceBand = filter(x, biquad("highpass", 60, sampleRate));
  const levels = frameDb(voiceBand, hop * 2, hop);
  const act = findActivity(levels);
  const { active, speechDb, noiseFloorDb, pauses, phrases } = act;
  const snrDb = round(speechDb - noiseFloorDb, 1);
  /** @param {number} sample */
  const isActive = (sample) => active[Math.min(active.length - 1, Math.floor(sample / hop))] === 1;
  let activeFrames = 0;
  for (let i = 0; i < active.length; i += 1) activeFrames += active[i];

  // Sibilance: how loud the 5-10 kHz band gets on S sounds, against the voice.
  const hp5 = biquad("highpass", 5000, sampleRate);
  const high = frameDb(filter(x, [hp5, hp5, biquad("lowpass", 10000, sampleRate)]), hop * 2, hop);
  /** @type {number[]} */
  const highActive = [];
  for (let i = 0; i < high.length; i += 1) if (active[i]) highActive.push(high[i]);
  const sibilanceDb = highActive.length ? round(percentile(highActive, 0.98) - speechDb, 1) : -60;
  // What that band usually holds while the voice sounds: a de-esser must sit above this, or it dulls everything.
  const sibilanceUsualDb = highActive.length ? round(percentile(highActive, 0.85), 1) : -120;

  // Tonal balance of the voiced frames in octave bands.
  const size = 4096;
  const bandPower = new Float64Array(TONE_BANDS.length);
  const binHz = sampleRate / size;
  spectra(x, size, size, (power, start) => {
    if (!isActive(start + size / 2)) return;
    for (let b = 0; b < TONE_BANDS.length; b += 1) {
      const from = Math.ceil((TONE_BANDS[b] / Math.SQRT2) / binHz), to = Math.min(size / 2, Math.floor((TONE_BANDS[b] * Math.SQRT2) / binHz));
      for (let k = from; k <= to; k += 1) bandPower[b] += power[k];
    }
  });
  const target = targetCurve(profile);
  const ref = (powerDb(bandPower[2]) + powerDb(bandPower[3])) / 2;
  const bands = TONE_BANDS.map((hz, b) => {
    const levelDb = round(powerDb(bandPower[b]) - ref, 1);
    return { hz, levelDb, targetDb: target[b], deviationDb: round(levelDb - target[b], 1) };
  });

  const pitch = trackPitch(x, sampleRate);
  /** @type {number[]} */
  const voiced = [];
  /** @type {(Span & { hz: number })[]} */
  const sustained = [];
  for (let i = 0; i < pitch.f0.length;) {
    if (!pitch.f0[i]) { i += 1; continue; }
    let j = i, gap = 0;
    const run = [];
    // A sustained note is one unbroken voiced stretch (one dropped frame allowed).
    while (j < pitch.f0.length && (pitch.f0[j] || (gap < 1 && j + 1 < pitch.f0.length && pitch.f0[j + 1]))) { if (pitch.f0[j]) { run.push(pitch.f0[j]); gap = 0; } else gap += 1; j += 1; }
    for (const v of run) voiced.push(v);
    const start = i * pitch.hopSeconds + pitch.offsetSeconds, end = j * pitch.hopSeconds + pitch.offsetSeconds;
    if (end - start >= 0.6) sustained.push({ start: round(start, 2), end: round(end, 2), hz: round(median(run), 1) });
    i = j;
  }

  // Breath pops: short bursts below the voice's lowest note (so a deep note is never taken for a pop),
  // far above that band's usual level and over within 150 ms.
  const popHz = clamp(0.6 * (voiced.length ? percentile(voiced, 0.05) : 115), 30, 70);
  const low = frameDb(filter(x, [biquad("lowpass", popHz, sampleRate, 0.541), biquad("lowpass", popHz, sampleRate, 1.307)]), hop * 2, hop);
  const lowUsual = median(low);
  let plosives = 0;
  for (let i = 0; i < low.length;) {
    if (!(low[i] > lowUsual + 15 && low[i] > speechDb - 12)) { i += 1; continue; }
    let j = i;
    while (j < low.length && low[j] > lowUsual + 15) j += 1;
    if (j - i <= 15) plosives += 1;
    i = j + 15;
  }

  const room = estimateRoom(levels, speechDb, noiseFloorDb);
  const hum = findHum(x, sampleRate, speechDb - 65);
  const loud = measureLoudness([x], sampleRate);
  const lra = loudnessRange(x, sampleRate);
  const inner = pauses.filter((p) => p.start > 0.05 && p.end < seconds - 0.05);
  const pauseSeconds = pauses.reduce((s, p) => s + p.end - p.start, 0);

  return {
    profile,
    sampleRate,
    seconds: round(seconds, 3),
    loudness: { integrated: loud.integrated, truePeakDb: loud.truePeakDb, samplePeakDb: loud.samplePeakDb, lra },
    level: { speechDb: round(speechDb, 1), noiseFloorDb: round(noiseFloorDb, 1), snrDb, measuredInPauses: act.measuredInPauses, crestDb: round(20 * Math.log10(peak + 1e-9) - speechDb, 1) },
    dcOffset: round(dcOffset, 5),
    clipping: { runs: clippedRuns, samples: clippedSamples },
    hum,
    plosives: { count: plosives, perMinute: round(plosives / Math.max(seconds / 60, 1 / 60), 1) },
    sibilance: { db: sibilanceDb, sharp: sibilanceDb > -10, usualDb: sibilanceUsualDb },
    tone: { bands },
    room: { ...room, heavy: room.rt60 !== null && room.rt60 >= 0.8, some: room.rt60 !== null && room.rt60 >= 0.4 },
    pauses: { list: pauses, count: inner.length, medianSeconds: inner.length ? round(median(inner.map((p) => p.end - p.start)), 2) : null, share: round(pauseSeconds / Math.max(seconds, 1e-9), 3) },
    phrases,
    activeShare: round(activeFrames / Math.max(1, active.length), 3),
    sustained: { list: sustained, count: sustained.length, share: round(sustained.reduce((s, p) => s + p.end - p.start, 0) / Math.max(seconds, 1e-9), 3) },
    pitch: voiced.length ? { medianHz: round(median(voiced), 1), lowHz: round(percentile(voiced, 0.05), 1), highHz: round(percentile(voiced, 0.95), 1), voicedShare: round(voiced.length / Math.max(1, pitch.f0.length), 3) } : null,
  };
}

/**
 * The report in coded messages (English and Bengali come from messages.mjs).
 * @param {ReturnType<typeof measureVoice>} a
 */
export function analysisMessages(a) {
  const out = [];
  /** @param {number | null} v */
  const show = (v) => (v === null ? "n/a" : round(v, 1));
  out.push(msg("vm.measured", { seconds: round(a.seconds, 1), lufs: show(a.loudness.integrated), peak: show(a.loudness.truePeakDb), snr: a.level.snrDb, lra: show(a.loudness.lra) }));
  if (a.seconds < 1 || a.loudness.integrated === null) out.push(msg("vm.tooShort"));
  if (!a.level.measuredInPauses) out.push(msg("vm.noise.noPauses"));
  else if (a.level.snrDb < 25) out.push(msg("vm.noise.high", { snr: a.level.snrDb }));
  else if (a.level.snrDb < 45) out.push(msg("vm.noise.some", { snr: a.level.snrDb }));
  else out.push(msg("vm.noise.low", { snr: a.level.snrDb }));
  if (a.hum.hz !== null) out.push(msg("vm.hum", { hz: a.hum.hz, db: a.hum.prominenceDb, count: a.hum.harmonics.length }));
  if (Math.abs(a.dcOffset) > 0.001) out.push(msg("vm.dc", { offset: a.dcOffset }));
  if (a.clipping.runs > 0) out.push(msg("vm.clipped", { runs: a.clipping.runs }));
  if (a.plosives.count > 0) out.push(msg("vm.plosives", { count: a.plosives.count }));
  if (a.sibilance.sharp) out.push(msg("vm.sibilance", { db: a.sibilance.db }));
  const dev = a.tone.bands.map((b) => b.deviationDb);
  const lows = (dev[0] + dev[1]) / 2, highs = (dev[5] + dev[6]) / 2;
  if (lows > 3) out.push(msg("vm.tone.boomy", { db: round(lows, 1) }));
  if (lows < -6) out.push(msg("vm.tone.thin", { db: round(-lows, 1) }));
  if (highs < -3) out.push(msg("vm.tone.dull", { db: round(-highs, 1) }));
  if (highs > 3) out.push(msg("vm.tone.bright", { db: round(highs, 1) }));
  if (Math.abs(lows) <= 3 && Math.abs(highs) <= 3) out.push(msg("vm.tone.ok"));
  if (a.room.rt60 === null) out.push(msg("vm.room.unknown"));
  else if (a.room.heavy) out.push(msg("vm.room.heavy", { rt: a.room.rt60 }));
  else if (a.room.some) out.push(msg("vm.room.some", { rt: a.room.rt60 }));
  else out.push(msg("vm.room.dry", { rt: a.room.rt60 }));
  out.push(msg("vm.shape", { pauses: a.pauses.count, median: a.pauses.medianSeconds ?? "n/a", sustained: a.sustained.count, crest: a.level.crestDb }));
  return out;
}
