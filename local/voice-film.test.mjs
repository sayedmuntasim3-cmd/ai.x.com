import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AYAH_COUNTS, buildQuranIndex } from "../engine/src/quran.mjs";
import { cutSlice, hasFfmpeg, intake, parseArgs, parseSlice, retakeRecording, sliceWords, voiceReport } from "./voice-film.mjs";

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

const quranDir = new URL("../engine/data/quran/", import.meta.url);
const quranIndex = buildQuranIndex(JSON.parse(readFileSync(new URL("tanzil-quran-simple-1.0.2.json", quranDir), "utf8")));

/** Ad-Duha's words for one ayah, from the shipped Tanzil text. @param {number} ayah */
function surah93Words(ayah) {
  let offset = ayah - 1;
  for (let s = 1; s < 93; s += 1) offset += AYAH_COUNTS[s - 1];
  const entry = quranIndex.ayat[offset];
  return quranIndex.words.slice(entry.firstWord, entry.firstWord + entry.wordCount);
}

test("retakes: a restart in ayah 3 is cut into retakes.wav and listed in retakes.json (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-retakes-"));
  const ayat = Array.from({ length: 11 }, (_, k) => surah93Words(k + 1));
  const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  // He recites ayah 1, ayah 2, then starts ayah 3, stops after three words and starts ayah 3 again.
  /** @type {{ text: string, start: number, end: number }[]} */
  const words = [];
  let at = 0.5;
  for (const token of [...ayat[0], ...ayat[1], ...ayat[2].slice(0, 3), ...ayat[2], ...ayat.slice(3).flat()]) {
    words.push({ text: token, start: r3(at), end: r3(at + 0.42) });
    at += 0.54;
  }
  // A tone burst per heard word, so the voice analysis finds the stretches the words claim.
  const rate = 16000, total = Math.ceil((words[words.length - 1].end + 0.5) * rate);
  const pcm = new Int16Array(total);
  words.forEach((w, k) => {
    const f = 180 + (k % 7) * 35;
    for (let i = Math.floor(w.start * rate); i < Math.floor(w.end * rate) && i < total; i += 1) {
      const t = i / rate, fade = Math.min(1, (t - w.start) / 0.02, (w.end - t) / 0.02);
      pcm[i] = Math.round(0.25 * 32767 * fade * Math.sin(2 * Math.PI * f * t));
    }
  });
  const buf = Buffer.alloc(44 + total * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(total * 2, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  const wav = join(dir, "recitation.wav");
  writeFileSync(wav, buf);

  const out = join(dir, "out");
  const step1 = await intake({ audio: wav, out });
  assert.equal(step1.ok, true);
  const location = { ok: true, ayat: ayat.map((_, k) => ({ surah: 93, ayah: k + 1 })) };
  const r = await retakeRecording({ out, analysisWav: /** @type {string} */ (step1.analysisWav), sttWav: /** @type {string} */ (step1.sttWav), words, location, index: quranIndex });

  assert.equal(r.cuts.length, 1);
  assert.equal(r.cuts[0].reason, "restart");
  assert.deepEqual(r.cuts[0].words, ayat[2].slice(0, 3));
  assert.ok(Math.abs(r.removedSeconds - 1.62) < 0.05, String(r.removedSeconds));
  assert.ok(r.message.en && r.message.bn);
  const saved = JSON.parse(readFileSync(join(out, "retakes.json"), "utf8"));
  assert.equal(saved.cuts.length, 1);
  assert.equal(saved.removedSeconds, r.removedSeconds);
  assert.equal(saved.confidence, 1);
  assert.equal(saved.message.code, "quran.retakes");
  // The cut file is shorter by exactly what the cuts took out, and the original is untouched.
  const secondsOf = (/** @type {string} */ f) => {
    const b = readFileSync(f);
    return b.readUInt32LE(40) / (b.readUInt16LE(22) * (b.readUInt16LE(34) / 8)) / b.readUInt32LE(24);
  };
  const file = /** @type {string} */ (r.file);
  assert.ok(Math.abs(secondsOf(wav) - secondsOf(file) - r.removedSeconds) < 0.01, `${secondsOf(wav)} - ${secondsOf(file)}`);
});

test("retakes: an unsafe passage is not cut, and the reviewer gets a gap message (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-retakes-gap-"));
  const ayat = Array.from({ length: 11 }, (_, k) => surah93Words(k + 1));
  // One word of ayah 6 is missing from what was heard: the kept words cannot hold every expected word.
  const heard = [...ayat.slice(0, 5).flat(), ...ayat[5].slice(1), ...ayat.slice(6).flat()];
  const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  /** @type {{ text: string, start: number, end: number }[]} */
  const words = heard.map((text, k) => ({ text, start: r3(0.5 + k * 0.54), end: r3(0.92 + k * 0.54) }));
  const rate = 16000, total = Math.ceil((words[words.length - 1].end + 0.5) * rate);
  const pcm = new Int16Array(total);
  for (const w of words) for (let i = Math.floor(w.start * rate); i < Math.floor(w.end * rate); i += 1) pcm[i] = Math.round(0.25 * 32767 * Math.sin(2 * Math.PI * 200 * (i / rate)));
  const buf = Buffer.alloc(44 + total * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(total * 2, 40);
  Buffer.from(pcm.buffer).copy(buf, 44);
  const wav = join(dir, "recitation.wav");
  writeFileSync(wav, buf);

  const out = join(dir, "out");
  const step1 = await intake({ audio: wav, out });
  const location = { ok: true, ayat: ayat.map((_, k) => ({ surah: 93, ayah: k + 1 })) };
  const r = await retakeRecording({ out, analysisWav: /** @type {string} */ (step1.analysisWav), sttWav: /** @type {string} */ (step1.sttWav), words, location, index: quranIndex });
  assert.equal(r.file, null);
  assert.deepEqual(r.cuts, []);
  assert.equal(r.message.code, "quran.retakesGap");
  const saved = JSON.parse(readFileSync(join(out, "retakes.json"), "utf8"));
  assert.deepEqual(saved.cuts, []);
  assert.equal(saved.message.code, "quran.retakesGap");
});
