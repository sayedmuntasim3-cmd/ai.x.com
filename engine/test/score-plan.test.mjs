import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAllowed, scorePlan } from "../src/score-plan.mjs";
import { musicPlanFor } from "../src/voice-plan.mjs";

test("a cue's brief sets mood, mode, tempo and parts; the instrument named first wins", () => {
  const tense = scorePlan({ cue: "M01", brief: "Tense pulse, low string ostinato, sub hits", bpm: 120 });
  assert.deepEqual([tense.mood, tense.mode, tense.bpm], ["tense", "minor", 120]);
  assert.equal(tense.layers.pulse && tense.layers.low && tense.layers.hits, true);
  const marimba = scorePlan({ cue: "M07", brief: "Clockwork marimba or felt-piano ostinato", bpm: 96 });
  assert.equal(marimba.layers.pluck, "marimba");
  const guitar = scorePlan({ cue: "M05", brief: "Acoustic guitar and light percussion", bpm: 92 });
  assert.deepEqual([guitar.mode, guitar.layers.pluck, guitar.layers.perc], ["major", "guitar", true]);
  const sparse = scorePlan({ cue: "M03", brief: "Sparse felt piano and cello", bpm: null });
  assert.equal(sparse.layers.sparse, true);
  assert.equal(sparse.bpm, 76, "no tempo written: the mood's own");
  assert.deepEqual(scorePlan({ cue: "M03", brief: "x", bpm: null }).root, scorePlan({ cue: "M03", brief: "y", bpm: null }).root, "the same cue keeps its key");
});

test("no synthesised score where the film's music policy forbids instruments", () => {
  assert.equal(scoreAllowed(musicPlanFor({ contentType: "documentary", versionId: "en-US" })), true);
  assert.equal(scoreAllowed(musicPlanFor({ contentType: "quran_recitation", versionId: "ar" })), false);
  assert.equal(scoreAllowed(musicPlanFor({ contentType: "islamic", versionId: "en-US" })), false);
  assert.equal(scoreAllowed(musicPlanFor({ contentType: "documentary", versionId: "ar" })), false);
});
