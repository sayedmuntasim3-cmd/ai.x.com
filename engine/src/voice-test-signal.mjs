/**
 * Test signals shaped like a voice, made in code so no recording with an
 * unclear licence is ever needed to test the mastering engine. This is a
 * buzz through formant filters with phrases, pauses, one held note and
 * S-like noise bursts: it is not speech and never stands in for a recitation.
 */
import { biquad, filter, fromDb, rng } from "./voice-dsp.mjs";

/** Default phrase layout in seconds; the second phrase is one held note. */
export const TEST_PHRASES = Object.freeze([
  Object.freeze({ start: 0.4, end: 2.2, held: false }),
  Object.freeze({ start: 3.1, end: 4.9, held: true }),
  Object.freeze({ start: 5.8, end: 7.4, held: false }),
]);

/**
 * @param {{ sampleRate?: number, seconds?: number, f0?: number, seed?: number, noiseDb?: number, levelDb?: number,
 *   sibilantDb?: number, phrases?: readonly { start: number, end: number, held: boolean }[] }} [o]
 */
export function testVoice(o = {}) {
  const sampleRate = o.sampleRate ?? 48000, seconds = o.seconds ?? 8, f0 = o.f0 ?? 120;
  const phrases = o.phrases ?? TEST_PHRASES;
  const n = Math.round(sampleRate * seconds);
  const random = rng(o.seed ?? 1);
  const buzz = new Float32Array(n), hiss = new Float32Array(n), env = new Float32Array(n);
  for (const p of phrases) {
    const from = Math.round(p.start * sampleRate), to = Math.min(n, Math.round(p.end * sampleRate));
    for (let i = from; i < to; i += 1) {
      const t = (i - from) / sampleRate, left = (to - i) / sampleRate;
      const edge = Math.min(1, t / 0.03) * Math.min(1, left / 0.06);
      // Syllables at about 4 per second, except on the held note.
      env[i] = edge * (p.held ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(Math.PI * 4 * t)));
    }
    // An S-like burst opens each ordinary phrase.
    if (!p.held) for (let i = from; i < Math.min(n, from + Math.round(0.09 * sampleRate)); i += 1) hiss[i] = random.gauss() * Math.sin((Math.PI * (i - from)) / (0.09 * sampleRate));
  }
  const harmonics = Math.floor(7000 / (f0 * 1.3));
  let phase = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const held = phrases.some((p) => p.held && t >= p.start && t < p.end);
    const semitones = held ? 0.15 * Math.sin(2 * Math.PI * 5 * t) : 2.5 * Math.sin(2 * Math.PI * 0.31 * t) + 0.3 * Math.sin(2 * Math.PI * 5 * t);
    phase += (2 * Math.PI * f0 * Math.pow(2, semitones / 12)) / sampleRate;
    if (env[i] === 0) continue;
    let s = 0;
    for (let h = 1; h <= harmonics; h += 1) s += Math.sin(h * phase) / h;
    buzz[i] = s * env[i];
  }
  const voice = filter(buzz, [biquad("peak", 600, sampleRate, 3, 10), biquad("peak", 1150, sampleRate, 4, 8), biquad("peak", 2600, sampleRate, 5, 6), biquad("lowpass", 4500, sampleRate)]);
  const ess = filter(hiss, [biquad("highpass", 5500, sampleRate), biquad("lowpass", 9500, sampleRate)]);
  let peak = 1e-9;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(voice[i]));
  const gain = fromDb(o.levelDb ?? -12) / peak, essGain = fromDb((o.levelDb ?? -12) + (o.sibilantDb ?? -22)), noise = fromDb(o.noiseDb ?? -90);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = voice[i] * gain + ess[i] * essGain + random.gauss() * noise;
  return out;
}
