import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { hasFfmpeg, intake, parseArgs, voiceReport } from "./voice-film.mjs";

const ffmpeg = await hasFfmpeg();

test("arguments: kind is checked", () => {
  assert.deepEqual(parseArgs(["--audio", "a.mp3"]), { audio: "a.mp3", kind: "auto" });
  assert.equal(parseArgs(["--audio", "a.mp3", "--kind", "quran"]).kind, "quran");
  assert.throws(() => parseArgs(["--kind", "song"]), /narration, quran or auto/);
});

test("voice report: problems become coded messages in both languages", () => {
  const r = voiceReport(/** @type {any} */ ({ durationSeconds: 0.5, integrated: -45, truePeakDb: -0.1, samplePeakDb: -0.1, clippedSamples: 40, clippedRuns: 3, silenceShare: 0.2, snrDb: 12, noiseFloorDb: -60, dcOffset: 0 }), { sampleRate: 22050, channelCount: 1 });
  const codes = r.messages.map((m) => m.code);
  assert.deepEqual(codes, ["voice.ready", "voice.short", "voice.clipping", "voice.noisy", "voice.quiet", "voice.lowRate"]);
  assert.equal(r.ok, false);
  for (const m of r.messages) assert.ok(m.en && m.bn);
});

test("intake: an MP3 becomes two WAV copies and a report (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-intake-"));
  const mp3 = join(dir, "tone.mp3");
  // 2 s of tone (lavfi sine peaks at 1/8, -18 dBFS), then 1 s of silence, stereo 44.1 kHz.
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=2", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono:d=1", "-filter_complex", "[0][1]concat=n=2:v=0:a=1,pan=stereo|c0=c0|c1=c0", "-b:a", "128k", mp3]);
  const r = await intake({ audio: mp3, out: join(dir, "out") });
  assert.equal(r.ok, true);
  assert.ok(r.report && Math.abs(r.report.durationSeconds - 3) < 0.1, String(r.report?.durationSeconds));
  assert.equal(r.report?.channels, 2);
  assert.equal(r.report?.sampleRate, 44100);
  assert.ok(r.report?.integratedLufs !== null && r.report.integratedLufs < -15 && r.report.integratedLufs > -30);
  assert.equal(r.report?.clippedRuns, 0);
  const stt = readFileSync(/** @type {string} */ (r.sttWav));
  assert.equal(stt.readUInt16LE(22), 1, "mono");
  assert.equal(stt.readUInt32LE(24), 16000, "16 kHz");
  assert.ok(JSON.parse(readFileSync(join(dir, "out", "voice-report.json"), "utf8")).messages.length >= 1);
});

test("intake: a file that is not audio is refused with a message", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-intake-"));
  const bad = join(dir, "notes.mp3");
  execFileSync("sh", ["-c", `printf 'not audio' > '${bad}'`]);
  await assert.rejects(intake({ audio: bad, out: join(dir, "out") }), (e) => /** @type {any} */ (e).message_?.code === "voice.unreadable");
});
