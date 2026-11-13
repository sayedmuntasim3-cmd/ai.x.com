import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeAudio, masterFile, parseArgs, MASTER_RATE } from "./voice-master.mjs";
import { hasFfmpeg, master } from "./voice-film.mjs";
import { encodeWav16 } from "../engine/src/wav.mjs";
import { measureLoudness } from "../engine/src/loudness.mjs";
import { testVoice } from "../engine/src/voice-test-signal.mjs";

test("arguments: the profile decides which spaces may be asked for", () => {
  assert.deepEqual(parseArgs(["--audio", "a.wav"]).presets, ["mosque-hall"]);
  assert.deepEqual(parseArgs(["--profile", "quran", "--preset", "all"]).presets, ["clean", "mosque-hall", "grand-hall"]);
  assert.deepEqual(parseArgs(["--profile", "narration"]).presets, ["dry"]);
  assert.throws(() => parseArgs(["--profile", "narration", "--preset", "grand-hall"]), /must be one of dry, warm-room/);
  assert.throws(() => parseArgs(["--profile", "song"]), /quran or narration/);
});

test("a file is mastered to WAV 24-bit and AAC with a report; the original is untouched", async (t) => {
  if (!(await hasFfmpeg())) return t.skip("ffmpeg is not installed");
  const dir = await mkdtemp(join(tmpdir(), "voice-master-"));
  try {
    // A 44.1 kHz source, as a phone would give: ffmpeg brings it to 48 kHz.
    const source = join(dir, "voice.wav");
    await writeFile(source, Buffer.from(encodeWav16([testVoice({ sampleRate: 44100, noiseDb: -60, levelDb: -18 })], 44100)));
    const before = await readFile(source);
    const r = await masterFile({ audio: source, out: join(dir, "out"), profile: "quran", presets: ["clean", "mosque-hall"], keepOriginal: true });
    assert.ok(r.ok, JSON.stringify(r.results));
    assert.deepEqual(await readFile(source), before);
    assert.ok(Math.abs(r.seconds - 8) < 0.01);
    for (const x of r.results) {
      assert.ok(x.wav && x.m4a && (await stat(x.m4a)).size > 10000);
      const channels = await decodeAudio(x.wav, { channels: 2 });
      const loud = measureLoudness(channels, MASTER_RATE);
      assert.ok(loud.integrated !== null && Math.abs(loud.integrated + 14) < 0.4, x.preset + " " + loud.integrated);
      assert.ok(loud.truePeakDb <= -0.95);
      // AAC moves the peaks a little; the -1 dBTP ceiling is there to absorb that.
      assert.ok(x.aacTruePeakDb !== null && x.aacTruePeakDb < 0, "AAC peak " + x.aacTruePeakDb);
      const report = JSON.parse(await readFile(x.report, "utf8"));
      assert.ok(report.ok && report.proof.ok && report.proof.alignment.ok && report.messages.every((/** @type {any} */ m) => m.en && m.bn));
      assert.equal(report.channels, x.preset === "clean" ? 1 : 2);
    }
    assert.ok((await stat(join(dir, "out", "0-original.m4a"))).size > 5000);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("the voice-film path masters through planVoice: a recitation gets its hall, a narration is refused one", async (t) => {
  if (!(await hasFfmpeg())) return t.skip("ffmpeg is not installed");
  const dir = await mkdtemp(join(tmpdir(), "voice-film-master-"));
  try {
    const source = join(dir, "voice.wav");
    await writeFile(source, Buffer.from(encodeWav16([testVoice({ noiseDb: -60, levelDb: -18 })], 48000)));
    const m = await master({ audio: source, out: dir, kind: "quran", ayahEnds: [2.2, 4.9] });
    assert.ok(m.ok && m.file && m.seconds > 8, JSON.stringify({ ...m, plan: undefined }));
    assert.deepEqual(m.plan.mastering, { engine: "voice-master.mjs", profile: "quran", preset: "mosque-hall" });
    assert.ok(m.plan.chain.some((s) => s.step === "reverb" && s.discreteEchoes === false));
    const refused = await master({ audio: source, out: dir, kind: "narration", space: "grand-hall" });
    assert.equal(refused.ok, false);
    assert.match(String(refused.blocked), /narration profile does not use/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
