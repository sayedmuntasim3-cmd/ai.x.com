import test from "node:test";
import assert from "node:assert/strict";
import { biquad, fft, filter, fromDb, percentile, responseDb, rng, stftProcess } from "../src/voice-dsp.mjs";
import { analyzeVoice, loudnessRange, targetCurve, trackPitch } from "../src/voice-analyze.mjs";
import { testVoice } from "../src/voice-test-signal.mjs";
import { MESSAGES } from "../src/messages.mjs";

const RATE = 48000;
const clean = testVoice();
const base = analyzeVoice(clean, RATE);
/** @param {(v: number, i: number) => number} fn */
const mapped = (fn) => Float32Array.from(clean, fn);
/** @param {{ messages: { code: string }[] }} a */
const codes = (a) => a.messages.map((m) => m.code);

test("dsp: FFT finds a tone and inverts exactly; filters have the cookbook response", () => {
  const n = 1024, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i += 1) re[i] = Math.sin((2 * Math.PI * 37 * i) / n);
  const copy = re.slice();
  fft(re, im);
  assert.ok(Math.abs(Math.hypot(re[37], im[37]) - n / 2) < 1e-6);
  fft(re, im, true);
  assert.ok(re.every((v, i) => Math.abs(v - copy[i]) < 1e-9));
  assert.ok(Math.abs(responseDb(biquad("highpass", 80, RATE), 80, RATE) + 3.01) < 0.05);
  assert.ok(Math.abs(responseDb(biquad("peak", 1000, RATE, 1.4, 4), 1000, RATE) - 4) < 0.01);
  assert.ok(Math.abs(responseDb(biquad("highshelf", 8000, RATE, 0.707, -3), 20000, RATE) + 3) < 0.2);
  assert.ok(responseDb(biquad("notch", 50, RATE, 30), 50, RATE) < -60);
  assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3);
});

test("dsp: an untouched STFT round trip gives back the same samples at the same place", () => {
  const x = clean.subarray(20000, 60000);
  const y = stftProcess(x, 2048, 512, () => {});
  assert.equal(y.length, x.length);
  let worst = 0;
  for (let i = 0; i < x.length; i += 1) worst = Math.max(worst, Math.abs(y[i] - x[i]));
  assert.ok(worst < 1e-5, "worst error " + worst);
});

test("pitch: a steady tone and the test voice are tracked to the right note", () => {
  const tone = new Float32Array(RATE);
  for (let i = 0; i < tone.length; i += 1) tone[i] = 0.3 * Math.sin((2 * Math.PI * 150 * i) / RATE) + 0.15 * Math.sin((2 * Math.PI * 300 * i) / RATE);
  const voiced = Array.from(trackPitch(tone, RATE).f0).filter(Boolean);
  assert.ok(voiced.length > 40 && voiced.every((v) => Math.abs(v - 150) < 1));
  assert.ok(base.pitch && Math.abs(base.pitch.medianHz - 120) < 12, JSON.stringify(base.pitch));
});

test("analyzer: a clean voice reads clean, with its pauses and its held note", () => {
  assert.ok(base.level.snrDb > 50, "snr " + base.level.snrDb);
  assert.equal(base.pauses.count, 2);
  assert.ok(base.sustained.list.some((s) => s.start < 3.4 && s.end > 4.6), JSON.stringify(base.sustained.list));
  assert.equal(base.hum.hz, null);
  assert.equal(base.clipping.runs, 0);
  assert.equal(base.plosives.count, 0);
  assert.equal(base.sibilance.sharp, false);
  assert.ok(base.room.rt60 !== null && base.room.rt60 < 0.4, "room " + base.room.rt60);
  assert.ok(codes(base).includes("vm.noise.low") && codes(base).includes("vm.room.dry"));
  assert.ok(base.loudness.integrated !== null && base.loudness.truePeakDb <= -11);
  for (const m of base.messages) { assert.ok(m.code in MESSAGES); assert.ok(m.en.length > 5 && m.bn.length > 5 && m.bn !== m.en); }
});

test("analyzer: noise is measured close to what was added", () => {
  const a = analyzeVoice(testVoice({ noiseDb: -50 }), RATE);
  // Speech is about -27 dBFS RMS here, so -50 dBFS noise sits about 23 dB under it.
  assert.ok(Math.abs(a.level.noiseFloorDb + 50) < 2, "floor " + a.level.noiseFloorDb);
  assert.ok(a.level.snrDb > 15 && a.level.snrDb < 32, "snr " + a.level.snrDb);
  assert.ok(codes(a).some((c) => c === "vm.noise.high" || c === "vm.noise.some"));
});

test("analyzer: mains hum is found at 50 Hz and at 60 Hz, with its harmonics", () => {
  for (const hz of [50, 60]) {
    const a = analyzeVoice(mapped((v, i) => v + fromDb(-52) * Math.sin((2 * Math.PI * hz * i) / RATE) + fromDb(-58) * Math.sin((2 * Math.PI * 3 * hz * i) / RATE)), RATE);
    assert.equal(a.hum.hz, hz);
    assert.deepEqual(a.hum.harmonics.map((h) => h.hz), [hz, 3 * hz]);
  }
});

test("analyzer: clipping, DC, breath pops and sharp S sounds are each caught", () => {
  const clipped = analyzeVoice(mapped((v) => Math.max(-0.12, Math.min(0.12, v)) * 6), RATE);
  assert.ok(clipped.clipping.runs > 20 && codes(clipped).includes("vm.clipped"));
  const dc = analyzeVoice(mapped((v) => v + 0.02), RATE);
  assert.ok(Math.abs(dc.dcOffset - 0.02) < 0.002 && codes(dc).includes("vm.dc"));
  const pops = analyzeVoice(mapped((v, i) => {
    let add = 0;
    for (const at of [0.42, 3.12, 5.82]) { const t = i / RATE - at; if (t >= 0 && t < 0.08) add += 0.25 * Math.sin(2 * Math.PI * 38 * t) * Math.exp(-t * 40); }
    return v + add;
  }), RATE);
  assert.equal(pops.plosives.count, 3);
  const sharp = analyzeVoice(testVoice({ sibilantDb: -4 }), RATE);
  assert.ok(sharp.sibilance.sharp && sharp.sibilance.db > base.sibilance.db + 10 && codes(sharp).includes("vm.sibilance"));
});

test("analyzer: tonal balance is judged against the profile's target curve", () => {
  assert.equal(targetCurve("quran").length, 8);
  assert.ok(targetCurve("narration")[5] > targetCurve("quran")[5]);
  const boomy = analyzeVoice(filter(clean, biquad("lowshelf", 250, RATE, 0.707, 10)), RATE);
  const dull = analyzeVoice(filter(clean, biquad("highshelf", 2500, RATE, 0.707, -12)), RATE);
  assert.ok(boomy.tone.bands[0].deviationDb > base.tone.bands[0].deviationDb + 7);
  assert.ok(dull.tone.bands[5].deviationDb < base.tone.bands[5].deviationDb - 8);
});

test("analyzer: a room already in the recording is measured and called what it is", () => {
  // The voice through a 1.2 s exponentially decaying noise tail (one big FFT).
  const size = 1 << 19, random = rng(7);
  const ar = new Float64Array(size), ai = new Float64Array(size), br = new Float64Array(size), bi = new Float64Array(size);
  ar.set(clean);
  br[0] = 1;
  for (let i = 1; i < 1.5 * RATE; i += 1) br[i] = 0.011 * random.gauss() * Math.pow(10, (-3 * i) / (1.2 * RATE));
  fft(ar, ai); fft(br, bi);
  for (let k = 0; k < size; k += 1) { const r = ar[k] * br[k] - ai[k] * bi[k]; ai[k] = ar[k] * bi[k] + ai[k] * br[k]; ar[k] = r; }
  fft(ar, ai, true);
  const wet = analyzeVoice(Float32Array.from(ar.subarray(0, clean.length)), RATE);
  assert.ok(wet.room.rt60 !== null && wet.room.rt60 > 0.7 && wet.room.rt60 < 1.7, "rt60 " + wet.room.rt60);
  assert.ok(codes(wet).includes("vm.room.heavy"));
});

test("analyzer: loudness range follows the level changes of the recording", () => {
  const steady = new Float32Array(RATE * 12), stepped = new Float32Array(RATE * 12);
  for (let i = 0; i < steady.length; i += 1) { const s = Math.sin((2 * Math.PI * 440 * i) / RATE); steady[i] = 0.1 * s; stepped[i] = (i < steady.length / 2 ? 0.1 : 0.0316) * s; }
  assert.ok(/** @type {number} */ (loudnessRange(steady, RATE)) < 0.5);
  const lra = /** @type {number} */ (loudnessRange(stepped, RATE));
  assert.ok(lra > 8 && lra < 11, "lra " + lra);
});
