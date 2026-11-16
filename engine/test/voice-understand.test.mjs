import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tokenizeArabic } from "../src/arabic.mjs";
import { ayahText, buildQuranIndex } from "../src/quran.mjs";
import { alignScript, normalizeTranscript } from "../src/transcript.mjs";
import { understandVoice, voiceStructure, wordsKept } from "../src/voice-understand.mjs";
import { splitVoiceScenes } from "../src/voice-scenes.mjs";

const fixture = (/** @type {string} */ name) => readFileSync(new URL("./fixtures/voice/" + name, import.meta.url), "utf8");
const truth = JSON.parse(fixture("gettysburg-truth.json"));
const aligned = alignScript(truth.sentences.join(" "), normalizeTranscript(fixture("gettysburg-pocketsphinx.json")));
const index = buildQuranIndex(JSON.parse(readFileSync(new URL("../data/quran/tanzil-quran-simple-1.0.2.json", import.meta.url), "utf8")));

test("narration: English, scenes on word times, every word kept, structure found", () => {
  const u = understandVoice({ transcript: aligned, totalSeconds: truth.totalSeconds });
  assert.equal(u.ok, true, u.problems.join("; "));
  assert.equal(u.kind, "narration");
  assert.equal(u.language, "en");
  assert.ok(u.scenes && u.scenes.length >= 5);
  assert.equal(u.scenes[0].start, 0);
  assert.equal(u.scenes[u.scenes.length - 1].end, Math.round(truth.totalSeconds * 1000) / 1000);
  assert.deepEqual(u.scenes.flatMap((s) => s.words.map((w) => w.text)), truth.sentences.join(" ").split(" "));
  assert.equal(u.wordsKept?.ok, true);
  const s = /** @type {NonNullable<typeof u.structure>} */ (u.structure);
  assert.equal(s.topicWords[0].word, "nation");
  assert.ok(s.entities.some((e) => e.name === "God"));
  assert.ok(s.dates.some((d) => d.text === "Four score and seven years ago" && d.scene === "SC0001"));
  assert.ok(s.sections.length >= 1 && s.sections[0].from === "SC0001");
  assert.ok(u.messages.some((m) => m.code === "voice.wordsKept"));
});

test("words kept: a changed, dropped or added word is caught", () => {
  const words = [{ text: "One", start: 0, end: 0.5 }, { text: "two.", start: 0.6, end: 1 }, { text: "Three", start: 5, end: 5.5 }, { text: "four.", start: 5.6, end: 6 }];
  const scenes = splitVoiceScenes(words, 7, { minSeconds: 0.5, targetSeconds: 1 });
  assert.equal(wordsKept(words, scenes).ok, true);
  const changed = structuredClone(scenes);
  changed[0].words[1].text = "too.";
  assert.match(wordsKept(words, changed).detail, /"two\." became "too\."/);
  assert.equal(wordsKept(words.slice(1), scenes).ok, false);
});

test("structure: names, places and dates from the words", () => {
  const text = "In 1863 the armies met near Gettysburg. On July 1, 1863 the battle began. Abraham Lincoln spoke there in November. Lincoln wrote it himself.";
  const words = text.split(" ").map((t, i) => ({ text: t, start: i * 0.4, end: i * 0.4 + 0.3 }));
  const s = voiceStructure(splitVoiceScenes(words, words.length * 0.4 + 1, { minSeconds: 1, targetSeconds: 2 }));
  assert.ok(s.entities.some((e) => e.name === "Abraham Lincoln"));
  assert.ok(s.places.some((p) => p.name === "Gettysburg"));
  assert.ok(s.dates.some((d) => d.text === "July 1, 1863"));
  assert.ok(s.dates.some((d) => /In 1863/i.test(d.text)));
});

test("Quran: an Arabic recitation is found by itself, with exact ayat and times", () => {
  const words = [];
  let t = 2;
  for (let ayah = 1; ayah <= 4; ayah += 1) {
    let tokens = tokenizeArabic(ayahText(index, 112, ayah));
    if (ayah === 1) tokens = tokens.slice(4);
    for (const text of tokens) { words.push({ text, start: t, end: t + 1.3 }); t += 1.4; }
    t += 2;
  }
  const u = understandVoice({ transcript: { language: "ar", words }, totalSeconds: t + 1, quranIndex: index });
  assert.equal(u.ok, true, (u.problems ?? []).join("; "));
  assert.equal(u.kind, "quran");
  assert.equal(u.quranPlan?.summary.surah, 112);
  assert.deepEqual([u.quranPlan?.summary.fromAyah, u.quranPlan?.summary.toAyah], [1, 4]);
  assert.ok(u.quranPlan?.scenes.filter((s) => s.kind === "ayah").every((s) => s.text === ayahText(index, 112, /** @type {number} */ (s.ayah))));
  assert.equal(u.quranPlan?.audio.music, false);
  assert.ok(u.messages.some((m) => m.code === "voice.quranFound"));
});

test("Quran asked for, narration given: refused, not guessed", () => {
  const u = understandVoice({ transcript: aligned, totalSeconds: truth.totalSeconds, kind: "quran", quranIndex: index });
  assert.equal(u.ok, false);
  assert.deepEqual(u.problems, ["quran-not-recognised"]);
});

test("no words: nothing is planned", () => {
  const u = understandVoice({ transcript: { words: [] }, totalSeconds: 10 });
  assert.equal(u.ok, false);
  assert.equal(u.messages[0].code, "voice.noWords");
});
