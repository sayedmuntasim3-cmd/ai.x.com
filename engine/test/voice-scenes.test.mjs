import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSceneLines } from "../src/scene-lines.mjs";
import { checkVoiceChapter, restoreVoiceFields, splitVoiceScenes, voiceCaptions, voiceSkeleton } from "../src/voice-scenes.mjs";

const TEXT = "He had forty dollars. That was all he owned. But he had one idea, and it would not leave him alone. So he walked into the market at dawn. The first customer laughed. The second one paid him. By night he had made two hundred dollars, and he never looked back. Ten years later he drove a Lamborghini through the same street.";
/** 0.4 s a word, a 0.5 s pause after each sentence, 1 s lead-in. */
function voice() {
  const words = [];
  let t = 1;
  for (const w of TEXT.split(" ")) { words.push({ text: w, start: t, end: t + 0.35 }); t += 0.4; if (/[.!?]$/.test(w)) t += 0.5; }
  return { words, total: t + 1 };
}

test("scenes are cut at sentence ends from the word times, with no gap, overlap or lost word", () => {
  const { words, total } = voice();
  const scenes = splitVoiceScenes(words, total, { minSeconds: 3, targetSeconds: 5, maxSeconds: 9 });
  assert.ok(scenes.length >= 3);
  assert.equal(scenes[0].start, 0);
  assert.equal(scenes.at(-1).end, Math.round(total * 1000) / 1000);
  for (let i = 1; i < scenes.length; i += 1) assert.equal(scenes[i].start, scenes[i - 1].end);
  assert.equal(scenes.flatMap((s) => s.words).map((w) => w.text).join(" "), TEXT, "every word is in exactly one scene, in order");
  for (const s of scenes) {
    assert.ok(s.start <= s.words[0].start && s.end >= s.words.at(-1).end, s.sc + " never cuts a word");
    assert.match(s.words.at(-1).text, /[.!?]$/, s.sc + " ends on a sentence end");
  }
});

test("a sentence longer than the limit is cut at its longest pause", () => {
  const words = Array.from({ length: 40 }, (_, i) => ({ text: "w" + i, start: i * 0.5 + (i >= 20 ? 1 : 0), end: i * 0.5 + 0.4 + (i >= 20 ? 1 : 0) }));
  const scenes = splitVoiceScenes(words, 22, { minSeconds: 3, targetSeconds: 6, maxSeconds: 12 });
  assert.ok(scenes.length >= 2);
  assert.equal(scenes[0].words.at(-1).text, "w19");
});

test("empty or untimed input gives no scenes", () => {
  assert.deepEqual(splitVoiceScenes([], 10), []);
  assert.deepEqual(splitVoiceScenes([{ text: "a", start: NaN, end: 1 }], 10), []);
});

test("the skeleton parses as scene lines and passes the check only once the model has filled it", () => {
  const { words, total } = voice();
  const scenes = splitVoiceScenes(words, total, { minSeconds: 3, targetSeconds: 5, maxSeconds: 9 });
  const md = voiceSkeleton(scenes);
  assert.equal(parseSceneLines(md).length, scenes.length);
  assert.ok(checkVoiceChapter(md, scenes).every((f) => f.code === "unfinished"));
  const filled = md.replaceAll("ANCHOR: TODO", "ANCHOR: a").replaceAll("SHOTS: TODO", "SHOTS: (1) R3 market").replaceAll("LOOK: TODO", "LOOK: warm");
  assert.deepEqual(checkVoiceChapter(filled, scenes), []);
});

test("changed words, changed times and missing or extra scenes are found, and code restores the voice's own", () => {
  const { words, total } = voice();
  const scenes = splitVoiceScenes(words, total, { minSeconds: 3, targetSeconds: 5, maxSeconds: 9 });
  const filled = voiceSkeleton(scenes).replaceAll("TODO", "x");
  const lines = filled.split("\n");
  lines[0] = lines[0].replace("He had forty dollars.", "He owned forty bucks.");
  lines[1] = lines[1].replace(/\|\s*\d+:\d{2}:\d{2}(\.\d+)?-/, "| 0:09:09-");
  const broken = lines.slice(0, -1).join("\n") + "\n" + lines.at(-1).replace("SC" + String(scenes.length).padStart(4, "0"), "SC9999");
  const codes = checkVoiceChapter(broken, scenes).map((f) => f.code);
  for (const c of ["words-changed", "time-changed", "scene-missing", "scene-extra"]) assert.ok(codes.includes(c), c);
  const fixed = restoreVoiceFields(lines.join("\n"), scenes);
  assert.deepEqual(checkVoiceChapter(fixed, scenes), []);
});

test("captions follow the recording's word times", () => {
  const { words, total } = voice();
  const scenes = splitVoiceScenes(words, total);
  const caps = voiceCaptions(scenes);
  assert.ok(caps.every((c) => c.text.length <= 42 && c.end > c.start));
  assert.equal(caps[0].start, words[0].start);
  assert.equal(caps.map((c) => c.text).join(" "), TEXT);
});
