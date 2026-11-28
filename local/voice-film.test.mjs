import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { tokenizeArabic } from "../engine/src/arabic.mjs";
import { ayahText, buildQuranIndex } from "../engine/src/quran.mjs";
import { cutSlice, hasFfmpeg, intake, parseArgs, parseSlice, sliceWords, voiceReport } from "./voice-film.mjs";

const quranIndex = buildQuranIndex(JSON.parse(readFileSync(new URL("../engine/data/quran/tanzil-quran-simple-1.0.2.json", import.meta.url), "utf8")));

/** An ayah's words as recited (the basmala before ayah 1 is not part of it). @param {number} surah @param {number} ayah */
function recited(surah, ayah) {
  const text = ayahText(quranIndex, surah, ayah) ?? "";
  const words = text.split(/\s+/);
  return ayah === 1 && surah !== 1 && surah !== 9 && tokenizeArabic(words.slice(0, 4).join(" ")).join(" ") === "بسم الله الرحمن الرحيم" ? words.slice(4).join(" ") : text;
}

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

test("slice: a-b is read in clock or seconds, and a bad one is refused", () => {
  assert.equal(parseSlice(undefined), null);
  assert.deepEqual(parseSlice("0:00-3:00"), { start: 0, end: 180 });
  assert.deepEqual(parseSlice("90-180.5"), { start: 90, end: 180.5 });
  assert.deepEqual(parseSlice("1:00:00-1:03:00"), { start: 3600, end: 3780 });
  for (const bad of ["3:00-1:00", "abc", "1:2:3:4-5", "5-5", true]) assert.throws(() => parseSlice(bad), /--slice/);
});

test("slice: only whole words inside it stay, moved to start at 0", () => {
  const w = [{ text: "a", start: 9, end: 10.2 }, { text: "b", start: 10.5, end: 11 }, { text: "c", start: 19.8, end: 20.4 }];
  assert.deepEqual(sliceWords(w, { start: 10, end: 20 }), [{ text: "b", start: 0.5, end: 1 }]);
});

test("slice: the recording is cut to the slice (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-slice-"));
  const wav = join(dir, "tone.wav");
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=6", wav]);
  const file = await cutSlice({ audio: wav, out: join(dir, "out"), slice: { start: 1, end: 3.5 } });
  const r = await intake({ audio: file, out: join(dir, "out") });
  assert.ok(r.report && Math.abs(r.report.durationSeconds - 2.5) < 0.05, String(r.report?.durationSeconds));
  assert.deepEqual(JSON.parse(readFileSync(join(dir, "out", "slice.json"), "utf8")), { source: "tone.wav", start: 1, end: 3.5, seconds: 2.5 });
});

test("a recitation with no surah typed: --kind quran --transcript finds every surah and ayah from the words alone", () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-transcript-only-"));
  // Ad-Duha 93:8-11, the basmala, Ash-Sharh 94:1-8, the basmala, At-Tin 95:1-3: what a recognizer hears, with times.
  /** @type {{ surah: number, ayah: number | null }[]} */
  const units = [];
  for (let a = 8; a <= 11; a += 1) units.push({ surah: 93, ayah: a });
  units.push({ surah: 94, ayah: null });
  for (let a = 1; a <= 8; a += 1) units.push({ surah: 94, ayah: a });
  units.push({ surah: 95, ayah: null });
  for (let a = 1; a <= 3; a += 1) units.push({ surah: 95, ayah: a });
  /** @type {{ text: string, start: number, end: number }[]} */
  const words = [];
  let at = 0.6;
  for (const u of units) {
    const tokens = u.ayah === null ? tokenizeArabic(ayahText(quranIndex, 1, 1) ?? "") : tokenizeArabic(recited(u.surah, u.ayah));
    tokens.forEach((text, i) => words.push({ text, start: Math.round((at + i * 0.55) * 1000) / 1000, end: Math.round((at + i * 0.55 + 0.5) * 1000) / 1000 }));
    at += tokens.length * 0.55 + 0.8;
  }
  const fixture = join(dir, "quran-words.json");
  writeFileSync(fixture, JSON.stringify({ language: "ar", words }));
  const out = join(dir, "run");
  execFileSync(process.execPath, ["local/voice-film.mjs", "--kind", "quran", "--transcript", fixture, "--out", out], { stdio: "pipe" });
  const location = JSON.parse(readFileSync(join(out, "quran-location.json"), "utf8"));
  assert.equal(location.ok, true);
  assert.equal(location.source, "recognized");
  assert.deepEqual(location.passages, [{ surah: 93, fromAyah: 8, toAyah: 11 }, { surah: 94, fromAyah: 1, toAyah: 8 }, { surah: 95, fromAyah: 1, toAyah: 3 }]);
  assert.equal(location.ayat.length, 15);
  const understanding = JSON.parse(readFileSync(join(out, "understanding.json"), "utf8"));
  assert.equal(understanding.kind, "quran");
  assert.deepEqual(understanding.quranPlan.summary.surahs, [93, 94, 95]);
});

test("voice brain: free brains only, Groq first", async () => {
  const { voiceBrain } = await import("./voice-film.mjs");
  assert.equal(voiceBrain({}).model, null);
  assert.equal(voiceBrain({ BRAIN: "claude", ANTHROPIC_API_KEY: "x" }).refused, true);
  assert.equal(voiceBrain({ ANTHROPIC_API_KEY: "x" }).model, null, "a Claude key alone is never used");
  assert.equal(voiceBrain({ GROQ_API_KEY: "g" }).kind, "groq");
  assert.equal(voiceBrain({ GROQ_API_KEY: "g", GEMINI_API_KEY: "k", GEMINI_MODELS: "gemini-2.5-flash" }).kind, "groq+gemini");
  assert.equal(voiceBrain({ GEMINI_API_KEY: "k", GEMINI_MODELS: "gemini-2.5-flash" }).kind, "gemini");
  // On the runner: no keys, the Worker's free brain through the film's ticket; text only, no web search.
  const w = voiceBrain({ SITE: "https://s", VOICE_ID: "i", VOICE_TICKET: "t" });
  assert.equal(w.kind, "worker");
  assert.deepEqual(/** @type {any} */ (w.model).capabilities, { vision: false, webSearch: false });
  assert.equal(voiceBrain({ SITE: "https://s", VOICE_ID: "i", VOICE_TICKET: "t", VOICE_SELFTEST: "1" }).model, null);
});
