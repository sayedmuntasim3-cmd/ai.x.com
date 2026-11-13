import test from "node:test";
import assert from "node:assert/strict";
import { fromDb } from "../src/voice-dsp.mjs";
import { LIMITER_MAX_DB, PEAK_OVER_VOICE_DB, ayahEndsOf, limit, masterLoudness, masterReport, masterVoice, tamePeaks } from "../src/voice-master.mjs";
import { analyzeVoice } from "../src/voice-analyze.mjs";
import { planChain } from "../src/voice-chain.mjs";
import { planVoice } from "../src/voice-plan.mjs";
import { comparePitch, lagAt, proveMaster } from "../src/voice-proof.mjs";
import { trackPitch } from "../src/voice-analyze.mjs";
import { measureLoudness, truePeak } from "../src/loudness.mjs";
import { decodeWav, encodeWav24 } from "../src/wav.mjs";
import { MESSAGES } from "../src/messages.mjs";
import { testVoice } from "../src/voice-test-signal.mjs";

const RATE = 48000;
const raw = testVoice({ noiseDb: -58, levelDb: -20 });
const hall = masterVoice({ samples: raw, sampleRate: RATE, profile: "quran", preset: "mosque-hall" });
const clean = masterVoice({ samples: raw, sampleRate: RATE, profile: "quran", preset: "clean" });
/** @param {{ messages: { code: string }[] }} r */
const codes = (r) => r.messages.map((m) => m.code);

test("limiter: no sample passes the ceiling, quiet audio is untouched, nothing is delayed", () => {
  const x = Float32Array.from(raw, (v) => v * 12), copy = Float32Array.from(x);
  const did = limit([x], RATE, -3);
  assert.ok(did.maxReductionDb > 3);
  assert.ok(x.every((v) => Math.abs(v) <= fromDb(-3) + 1e-6));
  // Away from the peaks the gain has let go: the pause is the same to within half a percent.
  for (let i = Math.round(2.9 * RATE); i < Math.round(3.0 * RATE); i += 1) assert.ok(Math.abs(x[i] - copy[i]) <= Math.abs(copy[i]) * 0.005);
  assert.equal(lagAt(copy, x, Math.round(3.5 * RATE), RATE / 4, 96), 0);
  const quiet = Float32Array.from(raw);
  assert.deepEqual(limit([quiet], RATE, -1), { maxReductionDb: 0, limitedShare: 0 });
  assert.deepEqual(quiet, raw);
});

test("loudness: two passes land on -14 LUFS with true peak at or under -1 dBTP, measured", () => {
  for (const r of [hall, clean]) {
    const m = measureLoudness(r.channels, RATE);
    assert.ok(m.integrated !== null && Math.abs(m.integrated + 14) <= 0.3, "lufs " + m.integrated);
    assert.ok(20 * Math.log10(truePeak(r.channels)) <= -1 + 0.01, "true peak " + m.truePeakDb);
    assert.ok(r.master && r.master.ok && r.master.limiterMaxDb <= LIMITER_MAX_DB.quran + 1.5, JSON.stringify(r.master));
  }
  // A track whose peaks stand far above its loudness gives up loudness rather than crush them.
  const spiky = Float32Array.from(raw);
  for (let i = 30000; i < spiky.length; i += 24000) spiky[i] = 0.99;
  const m = masterLoudness([spiky], RATE, { maxLimitDb: 3 });
  assert.ok(m.shortDb > 1 && m.truePeakDb <= -0.99, JSON.stringify(m));
});

test("proof: the master keeps every sample in place and the pitch contour; the proof catches a shift, a stretch and a pitch change", () => {
  for (const r of [hall, clean]) {
    assert.ok(r.proof && r.proof.ok, JSON.stringify(r.proof));
    assert.ok(r.proof.alignment.worstMs <= 0.25 && r.proof.alignment.driftSamples <= 3);
    assert.ok(r.proof.pitch.medianCents !== null && r.proof.pitch.medianCents <= 5);
  }
  assert.equal(clean.channels[0].length, raw.length);
  assert.ok(hall.channels[0].length > raw.length && hall.proof && hall.proof.duration.extraSeconds <= hall.proof.duration.tailAllowedSeconds);
  const shifted = new Float32Array(raw.length);
  shifted.set(raw.subarray(0, raw.length - 480), 480);
  assert.equal(proveMaster(raw, [shifted], RATE).alignment.ok, false);
  assert.equal(proveMaster(raw, [raw.subarray(0, raw.length - 10)], RATE).duration.ok, false);
  // Played 3% slow (a resample): longer, drifting, and flat by half a semitone.
  const slow = new Float32Array(Math.round(raw.length * 1.03));
  for (let i = 0; i < slow.length; i += 1) { const at = i / 1.03, k = Math.floor(at); slow[i] = (raw[k] ?? 0) + ((raw[k + 1] ?? 0) - (raw[k] ?? 0)) * (at - k); }
  const bad = proveMaster(raw, [slow], RATE);
  assert.equal(bad.ok, false);
  assert.equal(bad.duration.ok, false);
  const pitched = comparePitch(trackPitch(raw.subarray(0, 4 * RATE), RATE).f0, trackPitch(slow.subarray(0, 4 * RATE), RATE).f0);
  assert.ok(pitched.medianCents !== null && pitched.medianCents > 30, JSON.stringify(pitched));
});

test("report: what was measured, done and proven, in coded messages with both languages", () => {
  for (const want of ["vm.measured", "vm.did.highpass", "vm.did.dynamics", "vm.space.reverb", "vm.master.done", "vm.proof.duration", "vm.proof.alignment", "vm.proof.pitch", "vm.proof.echoFree"]) assert.ok(codes(hall).includes(want), want);
  assert.ok(codes(clean).includes("vm.space.none") && !codes(clean).includes("vm.proof.echoFree"));
  for (const m of hall.messages) assert.ok(m.code in MESSAGES && m.bn !== m.en);
  assert.ok(hall.space && hall.space.echoFree && hall.space.rt60At500 !== null && Math.abs(hall.space.rt60At500 - hall.space.rt60) < 0.4);
  assert.ok(hall.after && hall.after.dryNoiseFloorDb < hall.before.level.noiseFloorDb - 2, "noise before " + hall.before.level.noiseFloorDb + " after " + hall.after?.dryNoiseFloorDb);
  assert.equal(hall.channels.length, 2);
  assert.equal(clean.channels.length, 1);
  // Feeling-aware send stays off for a recitation unless asked for by name: the same input gives the same master.
  const again = masterVoice({ samples: raw, sampleRate: RATE, profile: "quran", preset: "mosque-hall", feeling: [{ start: 0.5, end: 2, amount: 1 }] });
  assert.deepEqual(again.channels[0], hall.channels[0]);
  assert.equal(masterVoice({ samples: new Float32Array(1000), sampleRate: RATE }).ok, false);
});

test("output: 24-bit WAV round trip keeps the master to within one 24-bit step", () => {
  const back = decodeWav(encodeWav24(hall.channels, RATE));
  assert.equal(back.sampleRate, RATE);
  assert.equal(back.channels.length, 2);
  assert.equal(back.channels[0].length, hall.channels[0].length);
  let worst = 0;
  for (let i = 0; i < back.channels[1].length; i += 37) worst = Math.max(worst, Math.abs(back.channels[1][i] - hall.channels[1][i]));
  assert.ok(worst < 2 / 8388608, "worst " + worst);
});

test("planVoice decides what the engine runs: profile, space, and the refusals", () => {
  const quran = planVoice({ source: "own-recording", contentType: "quran_recitation", versionId: "ar", space: "grand-hall" });
  assert.deepEqual(quran.mastering, { engine: "voice-master.mjs", profile: "quran", preset: "grand-hall" });
  const step = quran.chain.find((s) => s.step === "reverb");
  assert.ok(step && step.discreteEchoes === false && step.decaySeconds === 3.8);
  assert.equal(planVoice({ source: "own-recording", contentType: "quran_recitation", versionId: "ar" }).mastering?.preset, "clean");
  assert.equal(planVoice({ source: "own-recording", contentType: "documentary", versionId: "en-US", roomReverb: true }).mastering?.preset, "warm-room");
  assert.match(String(planVoice({ source: "own-recording", contentType: "documentary", versionId: "en-US", space: "mosque-hall" }).blocked), /does not use/);
  assert.equal(planVoice({ source: "elevenlabs", contentType: "quran_recitation", versionId: "ar" }).mastering, null);
  assert.deepEqual(planVoice({ source: "elevenlabs", contentType: "documentary", versionId: "en-US" }).mastering, { engine: "voice-master.mjs", profile: "narration", preset: "dry" });
  assert.deepEqual(ayahEndsOf({ scenes: [{ kind: "title", spokenEnd: null, estimated: false }, { kind: "ayah", spokenEnd: 4.2, estimated: false }, { kind: "ayah", spokenEnd: 9, estimated: true }] }), [4.2]);
  const report = masterReport(hall);
  assert.ok(report.ok && report.proof && report.before.lufs !== null && !("samples" in report) && JSON.stringify(report).length < 20000);
});

test("narration profile: close and nearly dry, evener than a recitation, and honest about it", () => {
  const uneven = Float32Array.from(raw, (v, i) => v * (i / RATE < 2.6 ? 1.8 : i / RATE > 5.4 ? 0.6 : 1));
  const dry = masterVoice({ samples: uneven, sampleRate: RATE, profile: "narration" });
  const room = masterVoice({ samples: uneven, sampleRate: RATE, profile: "narration", preset: "warm-room" });
  const recital = masterVoice({ samples: uneven, sampleRate: RATE, profile: "quran", preset: "clean" });
  assert.ok(dry.ok && room.ok && recital.ok);
  assert.equal(dry.preset, "dry");
  assert.equal(dry.channels.length, 1);
  assert.equal(dry.channels[0].length, uneven.length);
  assert.ok(codes(dry).includes("vm.space.narration") && codes(dry).includes("vm.space.none"));
  // The room is a touch: under half a second, far under the voice, and the file grows by less than a second.
  assert.ok(room.space && room.space.rt60At500 !== null && room.space.rt60At500 < 0.6 && room.space.wetDb <= -24 && room.space.echoFree);
  assert.ok(room.proof && room.proof.duration.extraSeconds < 1);
  // Same uneven voice: the narration ends evener (phrase 1 against phrase 3) than the recitation.
  const gap = (/** @type {Float32Array} */ x) => { const e = (/** @type {number} */ a, /** @type {number} */ b) => { let s = 0; for (let i = Math.round(a * RATE); i < Math.round(b * RATE); i += 1) s += x[i] * x[i]; return 10 * Math.log10(s / ((b - a) * RATE)); }; return e(0.4, 2.2) - e(5.8, 7.4); };
  assert.ok(gap(dry.channels[0]) < gap(recital.channels[0]) - 1, `narration ${gap(dry.channels[0])} recitation ${gap(recital.channels[0])}`);
  assert.throws(() => masterVoice({ samples: uneven, sampleRate: RATE, profile: "narration", preset: "grand-hall" }), /does not use/);
});

test("narration: a generated voice gets no repair steps, and a voice for a music bed is mastered to the plan's own target", () => {
  const made = masterVoice({ samples: raw, sampleRate: RATE, profile: "narration", source: "elevenlabs", targetLufs: -15 });
  assert.ok(made.ok && made.chain && made.chain.plan.repair === false && made.chain.plan.denoiseDb === 0 && made.chain.did.clicks === 0);
  assert.ok(codes(made).includes("vm.did.generated") && !codes(made).includes("vm.did.denoise"));
  assert.ok(made.master && Math.abs(/** @type {number} */ (made.master.lufs) + 15) <= 0.3);
  const own = masterVoice({ samples: raw, sampleRate: RATE, profile: "narration" });
  assert.ok(own.chain && own.chain.plan.repair && own.chain.plan.denoiseDb > 0);
  const plan = planVoice({ source: "own-recording", contentType: "documentary", versionId: "en-US" });
  assert.equal(plan.chain.find((s) => s.step === "loudness")?.targetLufs, -15);
});

test("dynamics in stages: tall peaks are eased before the limiter, a modest voice is left alone, a bright voice is not de-essed all the time", () => {
  // Hard-consonant style spikes 24 dB above the voice.
  const spiky = Float32Array.from(raw);
  for (let i = 30000; i < spiky.length; i += 19000) for (let k = 0; k < 40; k += 1) spiky[i + k] += 0.9 * Math.sin(k * 0.9) * Math.exp(-k / 12);
  const copy = Float32Array.from(spiky);
  const eased = tamePeaks(spiky, RATE, PEAK_OVER_VOICE_DB.narration);
  assert.ok(eased.crestBeforeDb > 20 && eased.crestAfterDb <= PEAK_OVER_VOICE_DB.narration + 1.5 && eased.maxReductionDb > 4, JSON.stringify(eased));
  // A third of a second after a spike the gain has let go: the held note is the same to within a tenth of a dB.
  for (let i = Math.round(3.7 * RATE); i < Math.round(3.78 * RATE); i += 7) if (Math.abs(copy[i]) > 0.01) assert.ok(Math.abs(spiky[i] / copy[i] - 1) < 0.012);
  const modest = Float32Array.from(raw);
  assert.equal(tamePeaks(modest, RATE, PEAK_OVER_VOICE_DB.quran).maxReductionDb, 0);
  assert.deepEqual(modest, raw);
  // With a ratio, what passes the line is turned down, not stopped: 12 dB over at 4:1 comes out 3 dB over.
  const tone = Float32Array.from({ length: RATE / 2 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 300 * i) / RATE));
  limit([tone], RATE, 20 * Math.log10(0.5) - 12, { ratio: 4, kneeDb: 0.01, lookaheadMs: 1, releaseMs: 50 });
  const peak = tone.subarray(RATE / 4).reduce((m, v) => Math.max(m, Math.abs(v)), 0);
  assert.ok(Math.abs(20 * Math.log10(peak / 0.5) + 9) < 0.5, "peak moved by " + 20 * Math.log10(peak / 0.5));
  // The de-esser's line sits above what the top of this voice usually holds.
  const a = analyzeVoice(raw, RATE, { profile: "narration" });
  const bright = planChain({ ...a, sibilance: { db: -5, sharp: true, usualDb: a.level.speechDb - 8 } }, "narration");
  assert.ok(bright.deess && bright.deess.thresholdDb === Math.round((a.level.speechDb - 8) * 10) / 10 && Math.abs(bright.deess.maxDb - 1.8) < 0.11, JSON.stringify(bright.deess));
  assert.equal(planChain({ ...a, sibilance: { db: -5, sharp: true, usualDb: a.level.speechDb - 5.5 } }, "narration").deess, null);
  // The before/after numbers of the voice are read before loudness gain, with or without a space.
  assert.ok(clean.after && hall.after && Math.abs(clean.after.dryNoiseFloorDb - hall.after.dryNoiseFloorDb) < 0.01 && clean.after.dryNoiseFloorDb < clean.before.level.noiseFloorDb - 2);
});
