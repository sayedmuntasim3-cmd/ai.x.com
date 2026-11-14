import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRecording, gainToTarget, kWeighting, measureLoudness, truePeak } from "../src/loudness.mjs";

const RATE = 48000;

/** A 1 kHz sine with the given peak level in dBFS (0 dBFS = full-scale sine), in sections. */
function tone(sections, { frequency = 1000, phase = 0, rate = RATE } = {}) {
  const total = sections.reduce((sum, [, seconds]) => sum + Math.round(seconds * rate), 0);
  const out = new Float32Array(total);
  let n = 0;
  for (const [db, seconds] of sections) {
    const amplitude = Math.pow(10, db / 20);
    const count = Math.round(seconds * rate);
    for (let i = 0; i < count; i += 1, n += 1) out[n] = amplitude * Math.sin((2 * Math.PI * frequency * n) / rate + phase);
  }
  return out;
}
const stereo = (sections) => {
  const channel = tone(sections);
  return [channel, channel];
};
const near = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} is not within ${tolerance} of ${expected}`);

test("K-weighting at 48 kHz matches the coefficients printed in BS.1770-4", () => {
  const { shelf, highpass } = kWeighting(48000);
  const expected = [
    [shelf.b[0], 1.53512485958697], [shelf.b[1], -2.69169618940638], [shelf.b[2], 1.19839281085285],
    [shelf.a[1], -1.69065929318241], [shelf.a[2], 0.73248077421585],
    [highpass.a[1], -1.99004745483398], [highpass.a[2], 0.99007225036621],
  ];
  for (const [value, target] of expected) near(value, target, 1e-6, "coefficient");
  assert.deepEqual(highpass.b, [1, -2, 1]);
});

test("EBU Tech 3341 cases 1 and 2: stereo 1 kHz sine at -23 and -33 dBFS", () => {
  near(measureLoudness(stereo([[-23, 20]]), RATE).integrated, -23, 0.1, "case 1");
  near(measureLoudness(stereo([[-33, 20]]), RATE).integrated, -33, 0.1, "case 2");
});

test("EBU Tech 3341 cases 3 to 5: the gates ignore quiet passages", () => {
  near(measureLoudness(stereo([[-36, 10], [-23, 60], [-36, 10]]), RATE).integrated, -23, 0.1, "case 3");
  near(measureLoudness(stereo([[-72, 10], [-36, 10], [-23, 60], [-36, 10], [-72, 10]]), RATE).integrated, -23, 0.1, "case 4");
  near(measureLoudness(stereo([[-26, 20], [-20, 20.1], [-26, 20]]), RATE).integrated, -23, 0.1, "case 5");
});

test("a mono voice is measured as it plays on two speakers unless asked otherwise", () => {
  const mono = [tone([[-23, 10]])];
  near(measureLoudness(mono, RATE).integrated, -23, 0.1, "dual mono");
  near(measureLoudness(mono, RATE, { dualMono: false }).integrated, -26.01, 0.1, "single channel");
});

test("true peak finds the peak between samples that the sample peak misses", () => {
  // A quarter-sample-rate sine sampled at 45 degrees: every sample is 0.707, the wave peaks at 1.0.
  const quarter = tone([[0, 1]], { frequency: RATE / 4, phase: Math.PI / 4 });
  const result = measureLoudness([quarter, quarter], RATE);
  near(result.samplePeakDb, -3.01, 0.02, "sample peak");
  near(result.truePeakDb, 0, 0.3, "true peak");
  near(20 * Math.log10(truePeak([tone([[-6.02, 1]])])), -6.02, 0.1, "ordinary 1 kHz sine");
});

test("silence and very short clips have no loudness instead of a made-up number", () => {
  assert.equal(measureLoudness([new Float32Array(RATE)], RATE).integrated, null);
  assert.equal(measureLoudness([tone([[-20, 0.3]])], RATE).integrated, null);
  assert.throws(() => measureLoudness([], RATE), /channel/);
  assert.throws(() => measureLoudness([new Float32Array(10), new Float32Array(9)], RATE), /same length/);
});

test("the recording report finds noise, clipping and DC offset in plain words", () => {
  // Speech-like bursts over a steady noise floor: 0.5 s of tone, 0.5 s of noise only.
  const length = RATE * 6;
  const voice = new Float32Array(length);
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.02;
  for (let n = 0; n < length; n += 1) {
    const speaking = Math.floor(n / (RATE / 2)) % 2 === 0;
    voice[n] = noise() + (speaking ? 0.3 * Math.sin((2 * Math.PI * 220 * n) / RATE) : 0);
  }
  const clean = analyzeRecording([voice], RATE);
  assert.ok(clean.snrDb > 20, "snr " + clean.snrDb);
  assert.equal(clean.clippedRuns, 0);
  assert.deepEqual(clean.problems, []);

  const clipped = Float32Array.from(voice, (v, n) => (n > RATE && n < RATE + 200 ? 1 : v + 0.05));
  const bad = analyzeRecording([clipped], RATE);
  assert.equal(bad.clippedRuns, 1);
  assert.ok(bad.problems.some((p) => /clips in 1 place/.test(p)));
  assert.ok(bad.problems.some((p) => /DC offset/.test(p)));
});

test("gain to a loudness target respects the true-peak ceiling", () => {
  assert.deepEqual(gainToTarget({ integrated: -20, truePeakDb: -9 }), { gainDb: 6, needsLimiter: false, resultingLufs: -14, resultingTruePeakDb: -3 });
  const loud = gainToTarget({ integrated: -20, truePeakDb: -2 }, { targetLufs: -14, ceilingDbtp: -1 });
  assert.equal(loud.needsLimiter, true);
  assert.equal(loud.resultingTruePeakDb, -1);
  assert.equal(gainToTarget({ integrated: null, truePeakDb: -60 }).gainDb, 0);
});
