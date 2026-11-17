import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { alignScript, checkTranscript, normalizeTranscript, parseCues } from "../src/transcript.mjs";

const fixture = (/** @type {string} */ name) => readFileSync(new URL("./fixtures/voice/" + name, import.meta.url), "utf8");
const heard = normalizeTranscript(fixture("gettysburg-pocketsphinx.json"));
const truth = JSON.parse(fixture("gettysburg-truth.json"));
const key = (/** @type {string} */ s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

test("our own transcribe.py output: engine, model and version are kept", () => {
  assert.equal(heard.engine, "pocketsphinx");
  assert.match(String(heard.modelVersion), /^pocketsphinx \d/);
  assert.equal(heard.language, "en");
  assert.equal(heard.estimated, false);
  assert.ok(heard.words.length > 200);
  assert.ok(heard.words.every((w) => w.end >= w.start && w.text));
});

test("Whisper JSON with word timestamps (leading spaces trimmed, probability kept)", () => {
  const t = normalizeTranscript({ language: "en", segments: [{ start: 0, end: 1.2, text: " Four score", words: [{ word: " Four", start: 0.0, end: 0.42, probability: 0.97 }, { word: " score", start: 0.42, end: 0.8, probability: 0.91 }] }, { start: 1.2, end: 2, text: " and seven" }] });
  assert.equal(t.engine, "whisper");
  assert.deepEqual(t.words.slice(0, 2), [{ text: "Four", start: 0, end: 0.42, confidence: 0.97 }, { text: "score", start: 0.42, end: 0.8, confidence: 0.91 }]);
  assert.equal(t.estimated, true, "a segment without words is spread and marked");
  assert.deepEqual(t.words.slice(2).map((w) => w.text), ["and", "seven"]);
});

test("ElevenLabs speech-to-text: only words, spacing and audio events left out", () => {
  const t = normalizeTranscript({ language_code: "eng", text: "Hello world.", words: [{ text: "Hello", start: 0.1, end: 0.5, type: "word", logprob: -0.05 }, { text: " ", start: 0.5, end: 0.6, type: "spacing" }, { text: "(laughs)", start: 0.6, end: 0.9, type: "audio_event" }, { text: "world.", start: 0.9, end: 1.3, type: "word", logprob: 0 }] });
  assert.equal(t.source, "elevenlabs-stt");
  assert.deepEqual(t.words.map((w) => [w.text, w.start, w.end, w.confidence]), [["Hello", 0.1, 0.5, 0.951], ["world.", 0.9, 1.3, 1]]);
});

test("ElevenLabs text-to-speech alignment: characters grouped into words", () => {
  const chars = [..."Hi there."];
  const starts = chars.map((_, i) => i * 0.1);
  const t = normalizeTranscript({ alignment: { characters: chars, character_start_times_seconds: starts, character_end_times_seconds: starts.map((s) => s + 0.1) } });
  assert.equal(t.source, "elevenlabs-alignment");
  assert.deepEqual(t.words.map((w) => [w.text, w.start, w.end]), [["Hi", 0, 0.2], ["there.", 0.3, 0.9]]);
});

test("SRT and VTT: times per line, words spread inside and marked estimated", () => {
  const srt = "1\n00:00:01,000 --> 00:00:03,000\nFour score and\n\n2\n00:00:03,500 --> 00:00:05,000\n<i>seven years ago</i>\n";
  const t = normalizeTranscript(srt);
  assert.equal(t.source, "srt");
  assert.equal(t.estimated, true);
  assert.deepEqual(t.words.map((w) => w.text), ["Four", "score", "and", "seven", "years", "ago"]);
  assert.equal(t.words[0].start, 1);
  assert.ok(t.words[2].end <= 3 && t.words[3].start === 3.5);
  const vtt = normalizeTranscript("WEBVTT\n\n00:01.000 --> 00:02.500 align:start\nHello world\n");
  assert.equal(vtt.source, "vtt");
  assert.deepEqual(vtt.words.map((w) => w.text), ["Hello", "world"]);
  assert.equal(parseCues("garbage").length, 0);
});

test("check: times are held inside the recording, words never dropped", () => {
  const t = normalizeTranscript({ engine: "x", words: [{ text: "a", start: 0, end: 1 }, { text: "b", start: 0.5, end: 9 }, { text: "c", start: 2, end: 3, confidence: 0.2 }] });
  const c = checkTranscript(t, 5);
  assert.deepEqual(c.words.map((w) => w.text), ["a", "b", "c"]);
  assert.equal(c.words[1].end, 5);
  assert.ok(c.messages.some((m) => m.code === "voice.badTimes"));
  assert.ok(c.messages.some((m) => m.code === "voice.lowConfidence"));
  assert.deepEqual(checkTranscript(normalizeTranscript({ engine: "x", words: [] }), 5).problems, ["no-words"]);
});

test("script alignment: every word is the script's, in order, none added or dropped", () => {
  const script = truth.sentences.join(" ");
  const a = alignScript(script, heard);
  assert.deepEqual(a.words.map((w) => w.text), script.split(/\s+/));
  for (let i = 1; i < a.words.length; i += 1) assert.ok(a.words[i].start >= a.words[i - 1].end - 0.001, "times only move forward at " + a.words[i].text);
  assert.ok(a.words.every((w) => w.end <= truth.totalSeconds));
  assert.equal(a.alignment.heard + a.alignment.near + a.alignment.placed, a.words.length);
});

test("script alignment times a weak recogniser's output: sentence starts land on the real ones", () => {
  // pocketsphinx heard about a quarter of these words right; the timing still has to hold.
  const a = alignScript(truth.sentences.join(" "), heard);
  let k = 0;
  const errors = truth.sentences.map((/** @type {string} */ s, /** @type {number} */ i) => {
    const e = Math.abs(a.words[k].start - truth.speechStarts[i]);
    k += s.split(/\s+/).length;
    return e;
  });
  assert.ok(errors.every((e) => e < 0.75), "every sentence within 0.75 s: " + errors.map((e) => e.toFixed(2)).join(" "));
  assert.ok(errors.filter((e) => e < 0.2).length >= 8, "most within 0.2 s: " + errors.map((e) => e.toFixed(2)).join(" "));
  assert.ok(a.alignment.matchShare > 0.15 && a.alignment.matchShare < 0.5);
  assert.equal(a.estimated, true, "a low match share is reported, not hidden");
});

test("script alignment with a perfect recogniser keeps its times exactly", () => {
  const words = "We are met on a great battle-field of that war.".split(" ").map((text, i) => ({ text: text.replace(/[.,]/g, ""), start: i * 0.5, end: i * 0.5 + 0.4, confidence: 0.99 }));
  const a = alignScript("We are met on a great battle-field of that war.", { language: "en", engine: "whisper", model: "small.en", modelVersion: null, source: "whisper-json", estimated: false, words });
  assert.deepEqual(a.words.map((w) => [w.text, w.start]), "We are met on a great battle-field of that war.".split(" ").map((t, i) => [t, i * 0.5]));
  assert.equal(a.alignment.matchShare, 1);
  assert.equal(a.estimated, false);
  assert.ok(a.words.every((w, i) => key(w.text) === key(words[i].text)));
});
