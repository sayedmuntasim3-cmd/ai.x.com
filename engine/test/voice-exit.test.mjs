// Exit check of the voice system (docs/VOICE_SYSTEM.md): a real public-domain
// English recording (LibriVox, Gettysburg Address) through steps 2-4 with the
// transcript faster-whisper really produced for it (recorded fixture).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { alignScript, checkTranscript, normalizeTranscript } from "../src/transcript.mjs";
import { understandVoice } from "../src/voice-understand.mjs";
import { planVoiceVisuals } from "../src/voice-visuals.mjs";

const fixture = (/** @type {string} */ name) => readFileSync(new URL("./fixtures/voice/" + name, import.meta.url), "utf8");
const raw = fixture("gettysburg-librivox-whisper.json");
const heard = normalizeTranscript(raw);
const total = JSON.parse(raw).durationSeconds;
const script = JSON.parse(fixture("gettysburg-truth.json")).sentences.join(" ");

test("real Whisper transcript: words as heard become the film's words, unchanged", async () => {
  assert.equal(heard.engine, "faster-whisper");
  assert.equal(heard.model, "small.en");
  const c = checkTranscript(heard, total);
  assert.equal(c.ok, true);
  const u = understandVoice({ transcript: { ...heard, words: c.words }, totalSeconds: total });
  assert.equal(u.ok, true, (u.problems ?? []).join("; "));
  assert.equal(u.kind, "narration");
  assert.equal(u.language, "en");
  const scenes = /** @type {NonNullable<typeof u.scenes>} */ (u.scenes);
  const p = await planVoiceVisuals({ scenes, structure: u.structure, topic: "Gettysburg Address 1863" });
  assert.deepEqual(p.findings, []);
  assert.deepEqual(p.plan.flatMap((s) => s.narration.split(" ")), heard.words.map((w) => w.text), "every heard word, in order, nothing added or dropped");
  assert.equal(p.plan[p.plan.length - 1].end, total);
});

test("real Whisper transcript + the written text: the words are the text's, timed by the recording", async () => {
  const a = alignScript(script, heard);
  assert.deepEqual(a.words.map((w) => w.text), script.split(" "));
  assert.ok(a.alignment.matchShare > 0.9, String(a.alignment.matchShare));
  // "IV SCORE" was heard for "Four score": the text wins, and its time is the recording's.
  assert.equal(a.words[0].text, "Four");
  assert.ok(Math.abs(a.words[0].start - 22.6) < 0.5, String(a.words[0].start));
  const at = (/** @type {string} */ w, /** @type {number} */ from = 0) => a.words.findIndex((x, i) => i >= from && x.text === w);
  assert.ok(Math.abs(a.words[at("Now")].start - 38.3) < 0.01);
  assert.ok(Math.abs(a.words[at("earth.")].end - 147.1) < 0.01);
  const u = understandVoice({ transcript: a, totalSeconds: total });
  assert.equal(u.ok, true);
  const p = await planVoiceVisuals({ scenes: /** @type {any} */ (u.scenes), structure: u.structure, topic: "Gettysburg Address 1863" });
  assert.deepEqual(p.findings, []);
  assert.equal(p.plan.map((s) => s.narration).join(" "), script);
  assert.ok(u.structure?.dates.some((d) => d.text === "Four score and seven years ago"));
});
