import test from "node:test";
import assert from "node:assert/strict";
import { powerDb, rng } from "../src/voice-dsp.mjs";
import { analyzeVoice } from "../src/voice-analyze.mjs";
import { PROFILE_SPACES, SPACES, applyReverb, convolve, decayAt, echoFree, measureDecay, planSpace, sendAutomation, synthesizeImpulse } from "../src/voice-reverb.mjs";
import { NEVER_DONE_TO_A_VOICE, ALLOWED_SPACE } from "../src/voice-plan.mjs";
import { testVoice } from "../src/voice-test-signal.mjs";

const RATE = 48000;
const clean = testVoice();
const analysis = analyzeVoice(clean, RATE);
const hall = /** @type {import("../src/voice-reverb.mjs").Space} */ (SPACES["mosque-hall"]);
const grand = /** @type {import("../src/voice-reverb.mjs").Space} */ (SPACES["grand-hall"]);
/** @param {ArrayLike<number>} x @param {number} from @param {number} to */
const rms = (x, from, to) => { let s = 0; const a = Math.round(from * RATE), b = Math.round(to * RATE); for (let i = a; i < b; i += 1) s += x[i] * x[i]; return powerDb(s / (b - a)); };

test("the rule: reverb is allowed for recitation since 13 Nov 2026, a repeating echo never", () => {
  assert.ok(NEVER_DONE_TO_A_VOICE.includes("echo or delay that repeats syllables"));
  assert.equal(ALLOWED_SPACE.decidedOn, "2026-11-13");
  assert.deepEqual(PROFILE_SPACES.quran, ["mosque-hall", "clean", "grand-hall"]);
  assert.deepEqual(PROFILE_SPACES.narration, ["dry", "warm-room"]);
});

test("impulse: made in code, the same on every run, with the decay it was asked for", () => {
  const a = synthesizeImpulse(hall, RATE, 1), again = synthesizeImpulse(hall, RATE, 1), other = synthesizeImpulse(hall, RATE, 2);
  assert.deepEqual(a, again);
  let energy = 0, cross = 0;
  for (let i = 0; i < a.length; i += 1) { energy += a[i] * a[i]; cross += a[i] * other[i]; }
  assert.ok(Math.abs(energy - 1) < 1e-3);
  assert.ok(Math.abs(cross) < 0.1, "the two ears' tails must differ: " + cross);
  const pre = Math.round(hall.preDelayMs * 48);
  assert.ok(a.subarray(0, pre).every((v) => v === 0), "the pre-delay is silent");
  for (const s of [hall, grand]) {
    const ir = synthesizeImpulse(s, RATE, 1);
    const mid = /** @type {number} */ (measureDecay(ir, RATE, 1000)), low = /** @type {number} */ (measureDecay(ir, RATE, 250)), high = /** @type {number} */ (measureDecay(ir, RATE, 6000));
    assert.ok(Math.abs(mid - s.rt60) / s.rt60 < 0.12, "mid decay " + mid + " for " + s.rt60);
    assert.ok(low > mid * 1.02 && high < mid * 0.75, `low ${low} mid ${mid} high ${high}`);
    assert.ok(Math.abs(high - decayAt(s, 6000)) / decayAt(s, 6000) < 0.2);
  }
});

test("impulse: every space passes the echo-free check; a slap-back or a late repeat fails it", () => {
  for (const [name, s] of Object.entries(SPACES)) {
    if (!s) continue;
    for (const seed of [0x5a11, 0xc0de]) { const c = echoFree(synthesizeImpulse(s, RATE, seed), RATE); assert.ok(c.ok, name + " " + JSON.stringify(c)); }
  }
  const repeat = synthesizeImpulse(hall, RATE, 1);
  for (let i = 0; i < 2000; i += 1) repeat[Math.round(0.4 * RATE) + i] += repeat[Math.round(0.035 * RATE) + i] * 6;
  assert.equal(echoFree(repeat, RATE).ok, false);
  const slap = new Float32Array(RATE);
  slap[Math.round(0.25 * RATE)] = 1;
  assert.equal(echoFree(slap, RATE).ok, false);
});

test("convolution: equals the direct sum, across several blocks, with no added delay", () => {
  const random = rng(3);
  const x = Float32Array.from({ length: 5000 }, () => random.gauss()), h1 = Float32Array.from({ length: 700 }, () => random.gauss()), h2 = Float32Array.from({ length: 700 }, () => random.gauss());
  const [y1, y2] = convolve(x, [h1, h2]);
  assert.equal(y1.length, x.length + h1.length - 1);
  for (const [y, h] of /** @type {[Float32Array, Float32Array][]} */ ([[y1, h1], [y2, h2]])) {
    for (const n of [0, 1, 699, 700, 1500, 3333, 4999, 5300, 5698]) {
      let direct = 0;
      for (let k = Math.max(0, n - x.length + 1); k <= Math.min(h.length - 1, n); k += 1) direct += h[k] * x[n - k];
      assert.ok(Math.abs(y[n] - direct) < 1e-3, `sample ${n}: ${y[n]} vs ${direct}`);
    }
  }
});

test("plan: the space adapts to the room already recorded and to the reciter's pauses", () => {
  const plain = planSpace({ ...analysis, pauses: { ...analysis.pauses, medianSeconds: 1.5 } }, "mosque-hall");
  assert.equal(plain.space?.rt60, hall.rt60);
  assert.equal(plain.loweredDb, 0);
  const quick = planSpace({ ...analysis, pauses: { ...analysis.pauses, medianSeconds: 0.3 } }, "grand-hall");
  assert.equal(quick.space?.rt60, 0.6 * grand.rt60);
  assert.ok(quick.messages.some((m) => m.code === "vm.space.shortened"));
  const roomy = planSpace({ ...analysis, room: { rt60: 0.9, decays: 5, heavy: true, some: true } }, "mosque-hall");
  assert.ok(roomy.loweredDb > 3 && roomy.space && roomy.space.wetDb < hall.wetDb - 3);
  assert.equal(planSpace(analysis, "clean").space, null);
  assert.throws(() => planSpace({ ...analysis, profile: "narration" }, "mosque-hall"), /narration profile does not use/);
  assert.throws(() => planSpace(analysis, "stadium"), /Unknown space/);
});

test("automation: the send blooms into pauses and held notes, inside its bounds; feeling is off unless asked", () => {
  const send = sendAutomation(analysis, hall);
  const at = (/** @type {Float32Array} */ s, /** @type {number} */ t) => s[Math.round(t * 100)];
  assert.ok(Array.from(send).every((v) => v >= 0 && v <= hall.bloomDb + 1e-6));
  assert.ok(at(send, 2.2) > 1.2 && at(send, 0.6) < 0.3, `phrase end ${at(send, 2.2)} start ${at(send, 0.6)}`);
  assert.ok(at(send, 3.9) > 0.8, "held note " + at(send, 3.9));
  const ayah = sendAutomation(analysis, hall, { ayahEnds: [2.2] });
  assert.ok(at(ayah, 2.2) > at(send, 2.2));
  const feeling = [{ start: 0.45, end: 0.75, amount: 5 }];
  assert.deepEqual(sendAutomation(analysis, hall, { feeling }), send);
  const felt = sendAutomation(analysis, hall, { feeling, meaningAware: true });
  assert.ok(at(felt, 0.65) > at(send, 0.65) + 0.8 && Array.from(felt).every((v, i) => Math.abs(v - send[i]) <= 1.5 + 1e-3));
});

test("reverb: the voice stays where it was, the tail fills the pause and dies away, and the ears differ", () => {
  const out = applyReverb(clean, RATE, analysis, hall);
  assert.ok(out.info.echoFree);
  assert.equal(out.left.length, out.right.length);
  assert.ok(out.left.length > clean.length && out.info.tailSeconds > 2);
  assert.ok(Math.abs(/** @type {number} */ (out.info.rt60At500) - hall.rt60) < 0.5, JSON.stringify(out.info));
  // Nothing before the first sound plus the pre-delay.
  assert.ok(rms(out.left, 0, 0.39) < -85);
  // In the pause after the first phrase: the tail is there, well under the voice, and falling.
  const voice = rms(clean, 0.4, 2.2), early = rms(out.left, 2.4, 2.6), late = rms(out.left, 2.85, 3.05);
  assert.ok(early < voice - 8 && early > voice - 40, `voice ${voice} tail ${early}`);
  assert.ok(late < early - 2, `tail ${early} then ${late}`);
  // While the voice sounds it dominates: the mix is within 1.5 dB of the dry voice.
  assert.ok(Math.abs(rms(out.left, 3.4, 4.6) - rms(clean, 3.4, 4.6)) < 1.5);
  let diff = 0;
  for (let i = 0; i < out.left.length; i += 1) diff += (out.left[i] - out.right[i]) ** 2;
  assert.ok(diff > 0);
  // After the last word only the tail remains, and it ends in silence.
  assert.ok(rms(out.left, out.left.length / RATE - 0.05, out.left.length / RATE) < -70);
});
