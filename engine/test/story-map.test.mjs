import assert from "node:assert/strict";
import { test } from "node:test";
import { storyMap } from "../src/story-map.mjs";

const SPEECH = "At 9:32 on a July morning in 1969, Apollo 11 lifted off from Cape Kennedy with the whole world watching from below. " +
  "Neil Armstrong, a quiet test pilot from Ohio, was the commander of the mission and the first to leave the ship. " +
  "Buzz Aldrin, an engineer who had studied orbits for years, would walk beside him on the dusty grey ground. " +
  "Michael Collins would circle alone above them, waiting in the dark for the call to bring them home. " +
  "More than 400,000 people had worked to make this day possible, from engineers to seamstresses to cooks. " +
  "Four days later, the world held its breath as the Eagle came down. Now it was real. The Eagle touched down.";

function timed(text) {
  let t = 0.3;
  return text.split(" ").map((w) => { const x = { text: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.3) * 100) / 100 }; t += /[.!?]$/.test(w) ? 0.75 : /,$/.test(w) ? 0.5 : 0.36; return x; });
}

const words = timed(SPEECH);

test("the story map finds chapter turns, reveals, quiet lines and an ending", () => {
  const shots = [{ start: 0, chapterTitle: "One" }, { start: 10, chapterTitle: "Two" }];
  const m = storyMap(words, shots);
  assert.ok(Array.isArray(m.chapterTurns));
  assert.equal(m.chapterTurns.length, 2);
  assert.ok(m.reveals.length >= 2, "numbers and markers are reveals");
  assert.ok(m.quietLines.length >= 1, "short lines are quiet");
  assert.equal(typeof m.ending, "number");
  assert.ok(m.ending > 0);
});

test("no hit inside a word: keepOffSpeech is re-exported via timeline", async () => {
  const { keepOffSpeech } = await import("../src/timeline.mjs");
  const sounds = [{ token: "AUTO-IMPACT", kind: "hit", scene: "S", start: 1.6, end: 2.7 }];
  const ws = [{ text: "He", start: 1, end: 1.3 }, { text: "kept", start: 1.35, end: 1.8 }];
  const r = keepOffSpeech(sounds, ws);
  const vowel = (w) => [w.start + 0.15 * (w.end - w.start), w.start + 0.75 * (w.end - w.start)];
  assert.ok(r.sounds.every((s) => ws.every((w) => { const [a, b] = vowel(w); return s.start <= a || s.start >= b; })));
});
