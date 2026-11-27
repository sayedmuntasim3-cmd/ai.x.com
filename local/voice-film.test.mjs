import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cutSlice, hasFfmpeg, intake, parseArgs, parseSlice, pictures, resumeState, runSignature, sliceWords, voiceReport } from "./voice-film.mjs";

const ffmpeg = await hasFfmpeg();

test("a re-run reads the stages the earlier run finished, and never asks the brain for them again", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-resume-"));
  const about = { audio: "a.mp3", bytes: 1000, topic: "The bridge", kind: "narration", slice: null, media: false };
  assert.equal(runSignature(about), runSignature({ ...about, somethingElse: 1 }), "only the fingerprint fields count");
  assert.equal((await resumeState(dir, about)).matches, false, "a folder with no run.json reuses nothing");
  writeFileSync(join(dir, "run.json"), JSON.stringify({ version: 1, signature: runSignature({ ...about, bytes: 2000 }), about: { ...about, bytes: 2000 } }));
  assert.equal((await resumeState(dir, about)).matches, false, "another recording's folder is not reused");

  const { syntheticScenes } = await import("../engine/src/brain-budget.mjs");
  const { voiceStructure } = await import("../engine/src/voice-understand.mjs");
  const { planVoiceVisuals } = await import("../engine/src/voice-visuals.mjs");
  const { planBeats, planShots } = await import("../engine/src/shot-plan.mjs");
  const scenes = syntheticScenes(1, 4);
  const structure = voiceStructure(scenes);
  const director = await planBeats({ scenes, structure, topic: about.topic });
  const r = await planVoiceVisuals({ scenes, structure, topic: about.topic, brain: null });
  const plan = planShots({ markdown: r.markdown, scenes, beats: director.beats, world: director.world, genre: director.genre, topic: about.topic, structure });
  writeFileSync(join(dir, "run.json"), JSON.stringify({ version: 1, signature: runSignature(about), about }));
  writeFileSync(join(dir, "understanding.json"), JSON.stringify({ ok: true, kind: "narration", language: "en", scenes, structure }));
  writeFileSync(join(dir, "beats.json"), JSON.stringify({ world: director.world, genre: director.genre, language: director.language, beats: director.beats, findings: director.findings, brainFindings: [] }));
  writeFileSync(join(dir, "pictures.md"), r.markdown + "\n");
  writeFileSync(join(dir, "pictures.json"), JSON.stringify({ kind: "narration", plan: r.plan, findings: [], media: null, changedByBrain: [] }));
  writeFileSync(join(dir, "shots.json"), JSON.stringify({ genre: director.genre, world: director.world, hook: plan.hook, shots: plan.shots, findings: [] }));
  writeFileSync(join(dir, "edit-C1.json"), JSON.stringify({ scenes: plan.edit }));

  const state = await resumeState(dir, about);
  assert.equal(state.matches, true);
  assert.deepEqual(state.stages, ["understanding", "beats", "pictures", "shots", "edit"]);

  // The brain throws if it is asked at all: a resumed run must not make one call.
  const brain = { name: "must-not-be-asked", capabilities: { vision: false, webSearch: false }, call: async () => { throw new Error("the brain must not be asked again"); } };
  const again = await pictures({ out: dir, understanding: state.understanding, brain, resume: state, topic: about.topic });
  assert.equal(again.ok, true);
  assert.ok(again.messages.some((m) => m.code === "voice.resumed"));

  // A plan with an unfinished line (TODO) is not trusted: it is planned again.
  writeFileSync(join(dir, "pictures.md"), r.markdown.replace("ANCHOR:", "ANCHOR: TODO") + "\n");
  assert.equal((await resumeState(dir, about)).pictures, null);
});

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
