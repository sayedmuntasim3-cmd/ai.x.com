/**
 * The space of the voice mastering engine: a reverb whose impulse responses
 * are synthesised in code (seeded noise, so licence-free and identical on
 * every machine), convolved by FFT, with the send automated from the
 * recording's own acoustics and the tail ducked under the voice.
 *
 * Owner decision, 13 Nov 2026: a recitation may get a smooth hall or mosque
 * style reverb. It is a dense decaying tail, never a repeat: `echoFree`
 * checks every impulse response before it is used, and an echo or delay that
 * repeats syllables stays forbidden (voice-plan.mjs NEVER_DONE_TO_A_VOICE).
 * Narration stays close and nearly dry.
 */
import { biquad, clamp, filter, frameDb, fromDb, makeFft, powerDb, rng, round, stftProcess } from "./voice-dsp.mjs";
import { msg } from "./messages.mjs";

/** @typedef {import("./voice-analyze.mjs").VoiceAnalysis} VoiceAnalysis */
/**
 * @typedef {{
 *   rt60: number, preDelayMs: number, wetDb: number, bassRatio: number, highRatio: number,
 *   highCutHz: number, lowCutHz: number, buildMs: number, earlyDb: number, duckDb: number, bloomDb: number,
 * }} Space
 */

/**
 * The spaces on offer. rt60 is the mid-frequency decay time; bass decays a
 * little longer and treble much faster, as in a real hall (air and carpet
 * absorb the highs). wetDb is the tail's energy against the voice. These are
 * targets, not fixed presets: `planSpace` adapts them to the recording.
 * @type {Readonly<Record<string, Readonly<Space> | null>>}
 */
export const SPACES = Object.freeze({
  clean: null,
  dry: null,
  "mosque-hall": Object.freeze({ rt60: 2.4, preDelayMs: 30, wetDb: -14, bassRatio: 1.15, highRatio: 0.45, highCutHz: 8000, lowCutHz: 180, buildMs: 60, earlyDb: -7, duckDb: 3, bloomDb: 2.5 }),
  "grand-hall": Object.freeze({ rt60: 3.8, preDelayMs: 45, wetDb: -12.5, bassRatio: 1.2, highRatio: 0.4, highCutHz: 7000, lowCutHz: 200, buildMs: 90, earlyDb: -9, duckDb: 4, bloomDb: 3 }),
  "warm-room": Object.freeze({ rt60: 0.4, preDelayMs: 8, wetDb: -24, bassRatio: 1.05, highRatio: 0.6, highCutHz: 9000, lowCutHz: 150, buildMs: 10, earlyDb: -3, duckDb: 0, bloomDb: 0 }),
});

/** Which spaces each profile may use; the first is its default. */
export const PROFILE_SPACES = Object.freeze({
  quran: Object.freeze(["mosque-hall", "clean", "grand-hall"]),
  narration: Object.freeze(["dry", "warm-room"]),
});

/**
 * The space for this recording: the preset, adapted to what was measured.
 * A recording that already carries a room gets less added reverb; a reciter
 * who pauses briefly gets a shorter tail, so it has fallen about 20 dB before
 * the next phrase starts.
 * @param {VoiceAnalysis} a @param {string} preset
 */
export function planSpace(a, preset) {
  const base = SPACES[preset];
  if (base === undefined) throw new Error("Unknown space \"" + preset + "\". Known: " + Object.keys(SPACES).join(", ") + ".");
  if (!PROFILE_SPACES[a.profile].includes(preset)) throw new Error("The " + a.profile + " profile does not use the space \"" + preset + "\" (it uses " + PROFILE_SPACES[a.profile].join(", ") + ").");
  if (base === null) return { preset, space: null, loweredDb: 0, shortened: false, messages: [msg("vm.space.none")] };
  const messages = [];
  const loweredDb = a.room.rt60 !== null && a.room.rt60 >= 0.4 ? round(clamp((a.room.rt60 - 0.3) * 6, 0, 6), 1) : 0;
  const pause = a.pauses.medianSeconds;
  const rt60 = pause === null ? base.rt60 : round(Math.min(base.rt60, Math.max(0.6 * base.rt60, 3 * pause)), 2);
  /** @type {Space} */
  const space = { ...base, rt60, wetDb: base.wetDb - loweredDb };
  messages.push(msg("vm.space.reverb", { preset, rt: rt60, pre: space.preDelayMs, wet: space.wetDb }));
  if (loweredDb > 0) messages.push(msg("vm.space.lowered", { db: loweredDb, rt: a.room.rt60 ?? 0 }));
  if (rt60 < base.rt60) messages.push(msg("vm.space.shortened", { rt: rt60, wanted: base.rt60, pause: pause ?? 0 }));
  return { preset, space, loweredDb, shortened: rt60 < base.rt60, messages };
}

/** Decay time at one frequency. @param {Space} s @param {number} hz */
export function decayAt(s, hz) {
  /** @param {number} a @param {number} b @param {number} lo @param {number} hi */
  const mix = (a, b, lo, hi) => a + (b - a) * clamp(Math.log(hz / lo) / Math.log(hi / lo), 0, 1);
  if (hz <= 500) return s.rt60 * mix(s.bassRatio, 1, 125, 500);
  if (hz <= 2000) return s.rt60;
  if (hz <= 8000) return s.rt60 * mix(1, s.highRatio, 2000, 8000);
  return s.rt60 * mix(s.highRatio, s.highRatio * 0.7, 8000, 16000);
}

/**
 * One channel's impulse response: a pre-delay, a handful of weak early
 * reflections, and a dense noise tail that fades in smoothly and whose every
 * frequency decays at its own rate. Unit energy, so wetDb means the same for
 * every space. Different seeds give the two ears different (uncorrelated)
 * tails, which is what makes the space wide.
 * @param {Space} s @param {number} sampleRate @param {number} seed
 */
export function synthesizeImpulse(s, sampleRate, seed) {
  const random = rng(seed);
  const pre = Math.round((s.preDelayMs / 1000) * sampleRate);
  const length = Math.ceil(s.rt60 * s.bassRatio * 1.1 * sampleRate);
  const noise = new Float32Array(length);
  for (let i = 0; i < length; i += 1) noise[i] = random.gauss();
  const size = sampleRate >= 32000 ? 1024 : 512, hop = size / 4;
  const rates = new Float64Array(size / 2 + 1);
  for (let k = 0; k <= size / 2; k += 1) rates[k] = -3 / decayAt(s, Math.max(20, (k * sampleRate) / size));
  const tail = stftProcess(noise, size, hop, (re, im, frame) => {
    const t = Math.max(0, hop - size + frame * hop + size / 2) / sampleRate;
    for (let k = 0; k <= size / 2; k += 1) {
      const g = Math.pow(10, rates[k] * t);
      re[k] *= g; im[k] *= g;
      if (k > 0 && k < size / 2) { re[size - k] *= g; im[size - k] *= g; }
    }
  });
  const build = (s.buildMs / 1000 / 3) * sampleRate, fade = Math.round(length * 0.1);
  let lateEnergy = 0;
  for (let i = 0; i < length; i += 1) {
    tail[i] *= (1 - Math.exp(-i / build)) * (i > length - fade ? (length - i) / fade : 1);
    lateEnergy += tail[i] * tail[i];
  }
  // Early reflections: 18 weak taps inside the first 80 ms, where the ear fuses them with the voice.
  const early = new Float32Array(length);
  let earlyEnergy = 0;
  for (let k = 0; k < 18; k += 1) {
    const t = 0.005 + 0.075 * Math.pow(random.next(), 0.7);
    const at = Math.round(t * sampleRate), amp = ((random.next() < 0.5 ? -1 : 1) * (0.5 + 0.5 * random.next())) / Math.sqrt(t);
    if (at + 1 < length) { early[at - 1] += amp * 0.25; early[at] += amp * 0.5; early[at + 1] += amp * 0.25; }
  }
  for (let i = 0; i < length; i += 1) earlyEnergy += early[i] * early[i];
  const earlyGain = Math.sqrt((lateEnergy * Math.pow(10, s.earlyDb / 10)) / (earlyEnergy + 1e-30));
  const ir = new Float32Array(pre + length);
  for (let i = 0; i < length; i += 1) ir[pre + i] = tail[i] + early[i] * earlyGain;
  filter(ir, [biquad("highpass", s.lowCutHz, sampleRate), biquad("lowpass", s.highCutHz, sampleRate)], ir);
  let energy = 0;
  for (let i = 0; i < ir.length; i += 1) energy += ir[i] * ir[i];
  const norm = 1 / Math.sqrt(energy);
  for (let i = 0; i < ir.length; i += 1) ir[i] *= norm;
  return ir;
}

/**
 * Proof that an impulse response is a reverb and not an echo: later than
 * 50 ms after the voice (earlier sound fuses with it, the precedence effect)
 * no 5 ms slice holds a dominant share of the energy (no slap-back), and once
 * the tail has peaked its level never climbs back up (no late repeat).
 * @param {Float32Array} ir @param {number} sampleRate
 */
export function echoFree(ir, sampleRate) {
  const slice = Math.round(sampleRate * 0.005);
  const fine = frameDb(ir, slice, slice);
  let total = 0;
  for (let i = 0; i < ir.length; i += 1) total += ir[i] * ir[i];
  const totalDb = powerDb(total / slice);
  let strongestSliceDb = -200;
  for (let i = 10; i < fine.length; i += 1) strongestSliceDb = Math.max(strongestSliceDb, fine[i] - totalDb);
  // 60 ms windows for the tail's envelope (long enough that the noise's own flutter is not taken for a repeat).
  const win = Math.round(sampleRate * 0.06);
  const env = frameDb(ir, win, Math.round(win / 3));
  let peakAt = 0;
  for (let i = 0; i < env.length; i += 1) if (env[i] > env[peakAt]) peakAt = i;
  let lowest = env[peakAt], worstRiseDb = 0;
  for (let i = peakAt; i < env.length && env[i] > env[peakAt] - 45; i += 1) {
    lowest = Math.min(lowest, env[i]);
    worstRiseDb = Math.max(worstRiseDb, env[i] - lowest);
  }
  return { ok: strongestSliceDb <= -10 && worstRiseDb <= 4, strongestSliceDb: round(strongestSliceDb, 1), worstRiseDb: round(worstRiseDb, 1) };
}

/**
 * Decay time of an impulse response (Schroeder integration, fitted from -5
 * to -35 dB, stated as the time to fall 60 dB), whole or around one frequency.
 * @param {Float32Array} ir @param {number} sampleRate @param {number} [bandHz]
 */
export function measureDecay(ir, sampleRate, bandHz) {
  const x = bandHz ? filter(ir, [biquad("bandpass", bandHz, sampleRate, 1.4), biquad("bandpass", bandHz, sampleRate, 1.4)]) : ir;
  const step = Math.round(sampleRate * 0.005);
  const points = Math.floor(x.length / step);
  const curve = new Float64Array(points);
  let sum = 0;
  for (let p = points - 1; p >= 0; p -= 1) { for (let i = p * step; i < (p + 1) * step; i += 1) sum += x[i] * x[i]; curve[p] = sum; }
  let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
  for (let p = 0; p < points; p += 1) {
    const level = powerDb(curve[p] / curve[0]);
    if (level > -5) continue;
    if (level < -35) break;
    const t = (p * step) / sampleRate;
    sx += t; sy += level; sxx += t * t; sxy += t * level; m += 1;
  }
  if (m < 3) return null;
  return round(-60 / ((m * sxy - sx * sy) / (m * sxx - sx * sx)), 2);
}

/**
 * Convolve one signal with several impulse responses of equal length
 * (overlap-add with one large FFT per block; the input's FFT is shared).
 * Output i is `x.length + ir.length - 1` long and starts at the same sample
 * as the input: the reverb adds no delay beyond its own pre-delay.
 * @param {Float32Array} x @param {Float32Array[]} irs
 */
export function convolve(x, irs) {
  const taps = irs[0].length;
  let size = 1024;
  while (size < 2 * taps) size *= 2;
  const block = size - taps + 1, run = makeFft(size);
  const spectra = irs.map((ir) => { const re = new Float64Array(size), im = new Float64Array(size); re.set(ir); run(re, im); return { re, im }; });
  const out = irs.map(() => new Float32Array(x.length + taps - 1));
  const xr = new Float64Array(size), xi = new Float64Array(size), yr = new Float64Array(size), yi = new Float64Array(size);
  for (let start = 0; start < x.length; start += block) {
    const count = Math.min(block, x.length - start);
    xr.fill(0); xi.fill(0);
    let any = false;
    for (let i = 0; i < count; i += 1) { xr[i] = x[start + i]; if (xr[i] !== 0) any = true; }
    if (!any) continue;
    run(xr, xi);
    for (let c = 0; c < irs.length; c += 1) {
      const h = spectra[c], o = out[c];
      for (let k = 0; k < size; k += 1) { yr[k] = xr[k] * h.re[k] - xi[k] * h.im[k]; yi[k] = xr[k] * h.im[k] + xi[k] * h.re[k]; }
      run(yr, yi, true);
      const end = Math.min(size, o.length - start);
      for (let i = 0; i < end; i += 1) o[start + i] += yr[i];
    }
  }
  return out;
}

/**
 * How much of the voice is sent into the reverb, in dB over time (one value
 * per 10 ms), from the recording's own shape: the last half second of a
 * phrase before a real pause blooms, so the tail fills the pause; a long held
 * note opens up after its first 0.4 s; quick articulation stays at the base
 * level. Ayah ends, when the understanding layer knows them, bloom fully.
 * Everything is bounded to 0..bloomDb. The meaning-aware offset (at most
 * +-1.5 dB) is applied only when `meaningAware` is true; it is off by default
 * and stays off for the Quran until the owner approves it by ear.
 * @param {VoiceAnalysis} a @param {Space} s
 * @param {{ ayahEnds?: number[], meaningAware?: boolean, feeling?: { start: number, end: number, amount: number }[] }} [o]
 */
export function sendAutomation(a, s, o = {}) {
  const frames = Math.ceil(a.seconds * 100) + 1;
  const send = new Float32Array(frames);
  /** Rise from `from` to `to`, then hold until `until`. @param {number} from @param {number} to @param {number} peak @param {number} until */
  const ramp = (from, to, peak, until) => {
    const f0 = Math.max(0, Math.round(from * 100)), f1 = Math.min(frames - 1, Math.round(to * 100));
    for (let f = f0; f <= f1; f += 1) send[f] = Math.max(send[f], (peak * (f - f0 + 1)) / (f1 - f0 + 1));
    for (let f = f1 + 1; f <= Math.min(frames - 1, Math.round(until * 100)); f += 1) send[f] = Math.max(send[f], peak);
  };
  // The hold runs 0.3 s into the pause, so the last syllable is fully sent.
  for (const p of a.pauses.list) if (p.start > 0.3 && p.end - p.start >= 0.4) ramp(p.start - 0.5, p.start, s.bloomDb * 0.8, p.start + 0.3);
  for (const end of o.ayahEnds ?? []) ramp(end - 0.5, end, s.bloomDb, end + 0.3);
  for (const note of a.sustained.list) if (note.end - note.start >= 0.9) ramp(note.start + 0.4, note.start + 0.9, s.bloomDb * 0.6, note.end);
  if (o.meaningAware) {
    for (const f of o.feeling ?? []) {
      const add = clamp(f.amount, -1, 1) * 1.5;
      for (let i = Math.max(0, Math.round(f.start * 100)); i < Math.min(frames, Math.round(f.end * 100)); i += 1) send[i] += add;
    }
  }
  // Smooth over about 100 ms so no change of send is ever heard as a step.
  let y = send[0];
  for (let f = 0; f < frames; f += 1) { y += (send[f] - y) * 0.1; send[f] = y; }
  for (let f = frames - 1, z = send[frames - 1]; f >= 0; f -= 1) { z += (send[f] - z) * 0.3; send[f] = clamp(z, o.meaningAware ? -1.5 : 0, s.bloomDb + (o.meaningAware ? 1.5 : 0)); }
  return send;
}

/**
 * Add the space to a finished dry voice. Returns stereo: the voice in the
 * centre of both channels, the tail different in each. The first
 * `dry.length` samples are aligned with the input; only the tail after the
 * last word makes the result longer.
 * @param {Float32Array} dry @param {number} sampleRate @param {VoiceAnalysis} a @param {Space} s
 * @param {Parameters<typeof sendAutomation>[2]} [o]
 */
export function applyReverb(dry, sampleRate, a, s, o = {}) {
  const hop = Math.round(sampleRate * 0.01);
  const irs = [synthesizeImpulse(s, sampleRate, 0x5a11), synthesizeImpulse(s, sampleRate, 0xc0de)];
  const checks = irs.map((ir) => echoFree(ir, sampleRate));
  if (!checks.every((c) => c.ok)) throw new Error("The synthesised impulse response failed the echo-free check; it is not used.");
  const automation = sendAutomation(a, s, o);
  const send = new Float32Array(dry.length);
  for (let i = 0; i < dry.length; i += 1) {
    const at = i / hop, f = Math.min(automation.length - 2, Math.floor(at));
    send[i] = dry[i] * fromDb(automation[f] + (automation[f + 1] - automation[f]) * (at - f));
  }
  const [left, right] = convolve(send, irs);
  // Duck the tail under the voice, let it rise in the pauses.
  const levels = frameDb(dry, hop * 2, hop);
  let top = -200;
  for (let i = 0; i < levels.length; i += 1) top = Math.max(top, levels[i]);
  const wet = fromDb(s.wetDb), down = 1 - Math.exp(-1 / (0.04 * sampleRate)), up = 1 - Math.exp(-1 / (0.25 * sampleRate));
  let duck = 0, deepest = 0;
  const fade = Math.round(sampleRate * 0.05), total = left.length;
  for (let i = 0; i < total; i += 1) {
    const f = Math.floor(i / hop);
    const voice = f < levels.length ? clamp((levels[f] - (top - 30)) / 15, 0, 1) : 0;
    duck += (voice - duck) * (voice > duck ? down : up);
    if (duck > deepest) deepest = duck;
    const g = wet * fromDb(-s.duckDb * duck) * (i > total - fade ? (total - i) / fade : 1);
    const d = i < dry.length ? dry[i] : 0;
    left[i] = d + left[i] * g;
    right[i] = d + right[i] * g;
  }
  let sendMax = 0;
  for (let f = 0; f < automation.length; f += 1) sendMax = Math.max(sendMax, automation[f]);
  return {
    left, right,
    info: {
      rt60: measureDecay(irs[0], sampleRate), rt60At500: measureDecay(irs[0], sampleRate, 500), rt60At4000: measureDecay(irs[0], sampleRate, 4000),
      echoFree: checks[0].ok && checks[1].ok, strongestSliceDb: Math.max(checks[0].strongestSliceDb, checks[1].strongestSliceDb), worstRiseDb: Math.max(checks[0].worstRiseDb, checks[1].worstRiseDb),
      preDelayMs: s.preDelayMs, wetDb: s.wetDb, duckDb: round(s.duckDb * deepest, 1), sendMaxDb: round(sendMax, 1), tailSeconds: round((total - dry.length) / sampleRate, 2),
    },
  };
}
