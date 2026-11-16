import test from "node:test";
import assert from "node:assert/strict";
import { biquad, filter, frameDb, fromDb, percentile, powerDb } from "../src/voice-dsp.mjs";
import { analyzeVoice } from "../src/voice-analyze.mjs";
import { CHAIN_LIMITS, compress, declick, declip, deess, easePauses, level, planChain, runChain } from "../src/voice-chain.mjs";
import { testVoice, TEST_PHRASES } from "../src/voice-test-signal.mjs";

const RATE = 48000;
const clean = testVoice();
/** @param {(v: number, i: number) => number} fn */
const mapped = (fn) => Float32Array.from(clean, fn);
/** RMS in dB between two times. @param {ArrayLike<number>} x @param {number} from @param {number} to */
const rms = (x, from, to) => { let s = 0; const a = Math.round(from * RATE), b = Math.round(to * RATE); for (let i = a; i < b; i += 1) s += x[i] * x[i]; return powerDb(s / (b - a)); };
/** Lag (samples) at which y best matches x around `at` seconds. @param {ArrayLike<number>} x @param {ArrayLike<number>} y @param {number} at */
const lagOf = (x, y, at) => {
  const s = Math.round(at * RATE), len = RATE / 4;
  let best = -Infinity, lag = 0;
  for (let l = -40; l <= 40; l += 1) { let c = 0; for (let i = 0; i < len; i += 1) c += x[s + i] * y[s + i + l]; if (c > best) { best = c; lag = l; } }
  return lag;
};

test("plan: every setting follows the measurement, inside the profile's limits", () => {
  const quiet = planChain(analyzeVoice(clean, RATE));
  assert.equal(quiet.denoiseDb, 0);
  assert.deepEqual(quiet.hum, []);
  assert.equal(quiet.deess, null);
  assert.equal(quiet.declip, false);
  assert.ok(quiet.highpass.hz >= 60 && quiet.highpass.hz <= 85 && quiet.highpass.order === 2, JSON.stringify(quiet.highpass));

  const noisy = testVoice({ noiseDb: -48 });
  const q = planChain(analyzeVoice(noisy, RATE, { profile: "quran" })), n = planChain(analyzeVoice(noisy, RATE, { profile: "narration" }));
  assert.equal(q.denoiseDb, CHAIN_LIMITS.quran.denoiseMaxDb);
  assert.ok(n.denoiseDb > q.denoiseDb && n.denoiseDb <= CHAIN_LIMITS.narration.denoiseMaxDb);
  assert.ok(q.compressor.ratio < n.compressor.ratio && q.leveller.rangeDb < n.leveller.rangeDb);

  const hum = planChain(analyzeVoice(mapped((v, i) => v + fromDb(-50) * Math.sin((2 * Math.PI * 50 * i) / RATE)), RATE));
  assert.deepEqual(hum.hum.map((h) => h.hz), [50]);
  assert.ok(hum.hum[0].gainDb <= -6 && hum.hum[0].gainDb >= -40);
});

test("plan: tone moves are bounded, lows are never boosted, clarity is lifted only as far as the noise allows", () => {
  const boomy = planChain(analyzeVoice(filter(clean, biquad("lowshelf", 250, RATE, 0.707, 12)), RATE));
  const shelf = boomy.eq.find((b) => b.type === "lowshelf");
  assert.ok(shelf && shelf.gainDb < 0 && shelf.gainDb >= -CHAIN_LIMITS.quran.eqMaxDb, JSON.stringify(boomy.eq));
  const thin = planChain(analyzeVoice(filter(clean, biquad("lowshelf", 400, RATE, 0.707, -14)), RATE));
  assert.ok(thin.eq.every((b) => b.hz > 400 || b.gainDb <= 0), JSON.stringify(thin.eq));
  const dullSource = filter(clean, biquad("highshelf", 1500, RATE, 0.707, -8));
  const dull = planChain(analyzeVoice(dullSource, RATE));
  const lift = dull.eq.filter((b) => b.hz >= 2000 && b.gainDb > 0);
  assert.ok(lift.length > 0 && lift.every((b) => b.gainDb <= CHAIN_LIMITS.quran.eqMaxDb), JSON.stringify(dull.eq));
  const random = (/** @type {number} */ i) => Math.sin(i * 12.9898) * 43758.5453 % 1;
  const dullNoisy = planChain(analyzeVoice(Float32Array.from(dullSource, (v, i) => v + 0.006 * random(i)), RATE));
  const liftNoisy = dullNoisy.eq.filter((b) => b.hz >= 2000 && b.gainDb > 0).reduce((m, b) => Math.max(m, b.gainDb), 0);
  assert.ok(liftNoisy < Math.max(...lift.map((b) => b.gainDb)), "noisy lift " + liftNoisy);
});

test("cleanup: noise falls by about the planned amount, the voice keeps its level, length and place", () => {
  const noisy = testVoice({ noiseDb: -48 });
  const a = analyzeVoice(noisy, RATE);
  const out = runChain(noisy, RATE, a, { ...planChain(a), eq: [], leveller: { rangeDb: 0, strength: 0 }, compressor: { ...planChain(a).compressor, peakReductionDb: 0 } });
  assert.equal(out.samples.length, noisy.length);
  const drop = rms(noisy, 2.5, 2.9) - rms(out.samples, 2.5, 2.9);
  assert.ok(drop > 4 && drop < 9, "noise drop " + drop);
  assert.ok(Math.abs(rms(noisy, 3.3, 4.7) - rms(out.samples, 3.3, 4.7)) < 0.6);
  assert.ok(Math.abs(lagOf(noisy, out.samples, 3.5)) <= 3);
  assert.ok(out.messages.some((m) => m.code === "vm.did.denoise"));
});

test("cleanup: hum, clicks and clipped peaks are repaired; a clean voice is not mistaken for clicks", () => {
  const hummy = mapped((v, i) => v + fromDb(-50) * Math.sin((2 * Math.PI * 60 * i) / RATE) + fromDb(-56) * Math.sin((2 * Math.PI * 180 * i) / RATE));
  const fixed = runChain(hummy, RATE, analyzeVoice(hummy, RATE));
  assert.equal(analyzeVoice(fixed.samples, RATE).hum.hz, null);

  const spots = [50000, 120000, 170000, 200000, 300000];
  const clicky = Float32Array.from(clean);
  for (const s of spots) clicky[s] += 0.4;
  assert.equal(declick(clicky, RATE), spots.length);
  for (const s of spots) assert.ok(Math.abs(clicky[s] - clean[s]) < 0.03, "left " + Math.abs(clicky[s] - clean[s]));
  assert.equal(declick(Float32Array.from(clean), RATE), 0);
  assert.equal(declick(testVoice({ sibilantDb: -4 }), RATE), 0);

  const hot = mapped((v) => v * 3), clipped = Float32Array.from(hot, (v) => Math.max(-0.45, Math.min(0.45, v)));
  /** @param {Float32Array} y */
  const error = (y) => { let e = 0; for (let i = 0; i < y.length; i += 1) e += (y[i] - hot[i]) ** 2; return e; };
  const before = error(clipped);
  assert.ok(declip(clipped, RATE) > 20);
  assert.ok(error(clipped) < before * 0.7, "clip error " + error(clipped) / before);
});

test("tone: the de-esser softens only sharp S sounds, by no more than its limit", () => {
  const sharp = testVoice({ sibilantDb: -4 });
  const a = analyzeVoice(sharp, RATE);
  const plan = planChain(a);
  assert.ok(plan.deess && plan.deess.maxDb <= CHAIN_LIMITS.quran.deessMaxDb);
  const y = Float32Array.from(sharp);
  const did = deess(y, RATE, /** @type {NonNullable<typeof plan.deess>} */ (plan.deess));
  assert.ok(did.maxReductionDb > 1 && did.maxReductionDb <= CHAIN_LIMITS.quran.deessMaxDb + 0.1, JSON.stringify(did));
  const band = (/** @type {Float32Array} */ x) => percentile(frameDb(filter(x, biquad("highpass", 5000, RATE)), 960, 480), 0.99);
  assert.ok(band(sharp) - band(y) > 1);
  // The held note has no S: it passes untouched.
  for (let i = Math.round(3.6 * RATE); i < Math.round(4.4 * RATE); i += 97) assert.ok(Math.abs(y[i] - sharp[i]) < 1e-4);
});

test("dynamics: levels are evened gently, and a recitation keeps more of its range than a narration", () => {
  // Phrase 1 loud, phrase 3 soft: 10 dB apart.
  const uneven = mapped((v, i) => v * (i / RATE < 2.6 ? 1.6 : i / RATE > 5.4 ? 0.5 : 1));
  const gap = (/** @type {Float32Array} */ x) => rms(x, TEST_PHRASES[0].start, TEST_PHRASES[0].end) - rms(x, TEST_PHRASES[2].start, TEST_PHRASES[2].end);
  const q = runChain(uneven, RATE, analyzeVoice(uneven, RATE, { profile: "quran" }));
  const n = runChain(uneven, RATE, analyzeVoice(uneven, RATE, { profile: "narration" }));
  const before = gap(uneven);
  assert.ok(before > 9);
  assert.ok(gap(q.samples) < before - 1.5 && gap(q.samples) > before - 6, "quran gap " + gap(q.samples));
  assert.ok(gap(n.samples) < gap(q.samples) - 1.5, "narration gap " + gap(n.samples));
  assert.ok(q.did.leveller.minDb >= -CHAIN_LIMITS.quran.levelRangeDb - 0.01 && q.did.leveller.maxDb <= CHAIN_LIMITS.quran.levelRangeDb + 0.01);
  assert.equal(q.samples.length, uneven.length);
  assert.ok(Math.abs(lagOf(uneven, q.samples, 3.5)) <= 3 && Math.abs(lagOf(uneven, n.samples, 6)) <= 3);
  // A voice that is already even is left alone.
  const even = Float32Array.from(clean), flat = compress(even, RATE, planChain(analyzeVoice(clean, RATE)).compressor);
  assert.ok(flat.maxReductionDb <= 2.2, JSON.stringify(flat));
  assert.deepEqual(level(new Float32Array(RATE), RATE, null, { rangeDb: 3, strength: 0.4 }), { minDb: 0, maxDb: 0 });
});

test("narration only: pauses are dipped (never muted) with word edges untouched, and a thin voice gets a little warmth", () => {
  const noisy = testVoice({ noiseDb: -55 });
  const a = analyzeVoice(noisy, RATE, { profile: "narration" });
  const plan = planChain(a, "narration");
  assert.ok(plan.pauseEaseDb > 0 && plan.pauseEaseDb <= CHAIN_LIMITS.narration.pauseEaseMaxDb);
  assert.equal(planChain(analyzeVoice(noisy, RATE, { profile: "quran" })).pauseEaseDb, 0);
  assert.equal(planChain({ ...a, room: { rt60: 0.9, decays: 4, heavy: true, some: true } }, "narration").pauseEaseDb, 0);
  const y = Float32Array.from(noisy);
  assert.equal(easePauses(y, RATE, a.pauses.list, 6), a.pauses.list.length);
  assert.ok(Math.abs(rms(noisy, 2.6, 2.9) - rms(y, 2.6, 2.9) - 6) < 0.7, "dip " + (rms(noisy, 2.6, 2.9) - rms(y, 2.6, 2.9)));
  // Every sample of the phrases themselves is as it was.
  for (const p of TEST_PHRASES) for (let i = Math.round(p.start * RATE); i < Math.round(p.end * RATE); i += 211) assert.ok(Math.abs(y[i] - noisy[i]) <= Math.abs(noisy[i]) * 0.02 + 1e-6);
  const thin = filter(clean, biquad("peak", 250, RATE, 1, -10));
  const warm = planChain(analyzeVoice(thin, RATE, { profile: "narration" }), "narration").eq.find((b) => b.hz === 250);
  assert.ok(warm && warm.gainDb > 0 && warm.gainDb <= CHAIN_LIMITS.narration.warmthMaxDb, JSON.stringify(warm));
  assert.ok(planChain(analyzeVoice(thin, RATE, { profile: "quran" })).eq.every((b) => b.hz > 400 || b.gainDb <= 0));
});
