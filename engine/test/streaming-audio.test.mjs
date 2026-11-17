import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRecording, createRecordingAnalyzer, measureLoudness } from "../src/loudness.mjs";
import { decodeWav, encodeWav16, measureWavFile, wavLayout } from "../src/wav.mjs";

const RATE = 48000;

/** A deterministic voice-like signal: bursts of noisy tone, pauses, a clipped stretch, a DC tilt. */
function voiceLike(seconds, seed = 7, channels = 2) {
  let s = seed;
  const rand = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const n = Math.round(seconds * RATE);
  return Array.from({ length: channels }, (_, c) => {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i += 1) {
      const t = i / RATE;
      const talking = Math.sin(t * 1.7 + c) > -0.3;
      const tone = Math.sin(2 * Math.PI * (180 + 40 * c) * t) * 0.35 + Math.sin(2 * Math.PI * 1300 * t) * 0.08;
      x[i] = (talking ? tone : 0) + rand() * 0.01 + 0.002;
      if (t > 2 && t < 2.01) x[i] = 1;
    }
    return x;
  });
}

/** Feed an analyzer in pieces of these sizes (repeated). */
function chunked(/** @type {Float32Array[]} */ channels, /** @type {number[]} */ sizes) {
  const a = createRecordingAnalyzer(RATE, channels.length);
  let at = 0;
  for (let k = 0; at < channels[0].length; k += 1) {
    const n = sizes[k % sizes.length];
    a.push(channels.map((x) => x.subarray(at, Math.min(x.length, at + n))));
    at += n;
  }
  return a.finish();
}

test("measured in pieces, a recording gives exactly the result of measuring it whole", () => {
  const stereo = voiceLike(6.3);
  const whole = analyzeRecording(stereo, RATE);
  for (const sizes of [[1], [7], [13, 4801, 2], [4096], [RATE * 2], [stereo[0].length]]) assert.deepEqual(chunked(stereo, sizes), whole, `pieces of ${sizes.join(", ")}`);
  const mono = voiceLike(3.1, 11, 1);
  assert.deepEqual(chunked(mono, [999, 3]), analyzeRecording(mono, RATE));
  assert.ok(whole.clippedRuns >= 1 && whole.snrDb !== null && whole.integrated !== null, "the test signal exercises every measure");
});

test("the streaming loudness equals the EBU R128 measurement it replaces", () => {
  for (const signal of [voiceLike(5.2), voiceLike(4, 3, 1)]) {
    const a = analyzeRecording(signal, RATE);
    const m = measureLoudness(signal, RATE);
    for (const k of /** @type {const} */ (["integrated", "momentaryMax", "shortTermMax", "samplePeakDb", "truePeakDb", "durationSeconds", "gatedShare"])) assert.equal(a[k], m[k], k);
  }
});

test("a WAV file is measured slice by slice without ever holding it whole", async () => {
  const stereo = voiceLike(4.4);
  const file = encodeWav16(stereo, RATE);
  const bytes = new Uint8Array(file);
  /** @type {number[]} */
  const reads = [];
  /** @type {number[]} */
  const progress = [];
  const { analysis, layout } = await measureWavFile({
    size: bytes.byteLength,
    read: async (start, end) => { reads.push(end - start); return bytes.slice(start, end).buffer; },
    analyzer: (rate, channels) => createRecordingAnalyzer(rate, channels),
    sliceBytes: 100_001,
    onProgress: (done, total) => progress.push(Math.round((done / total) * 100)),
  });
  const decoded = decodeWav(file);
  assert.deepEqual(analysis, analyzeRecording(decoded.channels, decoded.sampleRate), "the same result as decoding the whole file");
  assert.equal(layout.frameBytes, 4);
  assert.ok(Math.max(...reads) <= 100_001 && reads.slice(1).every((n, i, all) => i === all.length - 1 || n % 4 === 0), "slices hold whole frames and stay small");
  assert.equal(progress.at(-1), 100);
  assert.ok(reads.length > 5);
});

test("a recorder's unfinished WAV (no data size) is read to the end of the file", async () => {
  const file = new Uint8Array(encodeWav16(voiceLike(1, 5, 1), RATE));
  const v = new DataView(file.buffer);
  const layout = wavLayout(file.buffer);
  v.setUint32(layout.dataStart - 4, 0, true);
  assert.equal(wavLayout(file.buffer).dataSize, null);
  const { analysis } = await measureWavFile({ size: file.byteLength, read: async (a, b) => file.slice(a, b).buffer, analyzer: (r, c) => createRecordingAnalyzer(r, c) });
  assert.equal(analysis.durationSeconds, 1);
  assert.throws(() => createRecordingAnalyzer(RATE, 1).finish(), /No audio/);
  assert.throws(() => createRecordingAnalyzer(RATE, 2).push([new Float32Array(3)]), /Expected 2 channels/);
});
