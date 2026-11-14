import assert from "node:assert/strict";
import { test } from "node:test";
import { frameDoubts, frameVerdict, hamming } from "./quran-media.mjs";

const clean = { frames: 5, faces: 0, people: 0, look: { photograph: 0.99, painting: 0.005, drawing: 0.003, rendering: 0.002 }, sideways: false, dhash: ["f0f0f0f0f0f0f0f0"] };

test("the frame check refuses faces, paintings, sideways pictures, near-copies and unread files, each with its reason", () => {
  assert.equal(frameVerdict(clean), null);
  assert.match(String(frameVerdict({ ...clean, frames: 0 })), /not checked/);
  assert.match(String(frameVerdict({ ...clean, faces: 2 })), /^detector: 2 face/);
  // Measured: photographs scored at most 0.04 here, nine of ten paintings 0.26 or more.
  assert.match(String(frameVerdict({ ...clean, look: { photograph: 0.7, painting: 0.26, drawing: 0.02, rendering: 0.02 } })), /^visual: looks like a painting/);
  assert.match(String(frameVerdict({ ...clean, sideways: true })), /^orientation/);
  assert.match(String(frameVerdict({ ...clean, look: { ...clean.look, relevance: 0.18 } })), /^relevance: the frames do not show/);
  assert.equal(frameVerdict({ ...clean, look: { ...clean.look, relevance: 0.78 } }), null);
  assert.match(String(frameVerdict({ ...clean, dhash: ["f0f0f0f0f0f0f0f1"] }, ["f0f0f0f0f0f0f0f0"])), /^duplicate/);
  assert.equal(frameVerdict({ ...clean, dhash: ["0f0f0f0f0f0f0f0f"] }, ["f0f0f0f0f0f0f0f0"]), null);
  assert.equal(hamming("ff", "0f"), 4);
  assert.match(String(frameVerdict({ ...clean, exposure: { brightness: 10.5, entropy: 0.44 } })), /^quality: too dark and plain/);
  assert.equal(frameVerdict({ ...clean, exposure: { brightness: 74, entropy: 0.89 } }), null);
});

test("the frame check refuses small walking figures, buildings and man-made things the face detector misses", () => {
  // The values measured on the pictures that reached the runner films (docs/QURAN_DOCUMENTARY.md).
  const seen = (/** @type {object} */ x) => frameVerdict({ ...clean, look: { ...clean.look, relevance: 0.9, walkers: 0.1, building: 0, manmade: 0, ...x } });
  assert.equal(seen({}), null);
  assert.match(String(seen({ walkers: 0.99 })), /^adab: people seem to be in the picture/);
  assert.equal(seen({ walkers: 0.8 }), null);
  assert.match(String(seen({ building: 1 })), /^adab: a building/);
  assert.match(String(seen({ manmade: 1 })), /^relevance: man-made things/);
  assert.equal(seen({ manmade: 0.45 }), null);
  // Results from before this check (no such fields) are judged as before.
  assert.equal(frameVerdict(clean), null);
});

test("scores in the uncertain band are doubts for a person, not refusals and not silent passes", () => {
  const look = { ...clean.look, relevance: 0.9, walkers: 0.1, building: 0, manmade: 0 };
  assert.deepEqual(frameDoubts({ look }), []);
  // Measured: a clean "shadowed path" scored walkers 0.80, a driftwood post man-made 0.45.
  assert.deepEqual(frameDoubts({ look: { ...look, walkers: 0.8 } }), ["adab: people may be in the picture (80%)"]);
  assert.deepEqual(frameDoubts({ look: { ...look, manmade: 0.45 } }), ["relevance: maybe man-made things (45%)"]);
  assert.match(frameDoubts({ look: { ...look, relevance: 0.55 } })[0], /^relevance: the frames only partly/);
  assert.deepEqual(frameDoubts({}), []);
});

test("the validation measure counts refusals and reviews per category against a person's labels", async () => {
  const { evaluate } = await import("./media/visual-eval.mjs");
  const look = (/** @type {object} */ x) => ({ painting: 0, drawing: 0, rendering: 0, walkers: 0, building: 0, manmade: 0, ...x });
  const items = [
    { n: 1, look: look({ walkers: 0.95 }) }, { n: 2, look: look({ walkers: 0.7 }) }, { n: 3, look: look({ walkers: 0.95 }) },
    { n: 4, look: look({ building: 1 }) }, { n: 5, look: look({}) }, { n: 6, look: null },
  ];
  const r = evaluate(items, { 1: ["people"], 2: ["people"], 3: [], 4: ["building"], 5: [], 6: ["people"] });
  assert.equal(r.pictures, 5);
  assert.deepEqual([r.people.refused.tp, r.people.refused.fp, r.people.refused.fn], [1, 1, 1]);
  assert.deepEqual([r.people.refusedOrReviewed.tp, r.people.refusedOrReviewed.fn], [2, 0]);
  assert.deepEqual(r.people.refused.falsePositives, [3]);
  assert.equal(r.building.refused.recall, 1);
});

test("the face and person detectors refuse only when the image-text model agrees; alone they send the picture to a person", () => {
  const look = { ...clean.look, relevance: 0.9, walkers: 0.05, building: 0, manmade: 0 };
  // Measured: "faces" in bark and rock on 13 of 68 clean landscapes, where the people score stayed low.
  assert.equal(frameVerdict({ ...clean, faces: 1, look }), null);
  assert.match(frameDoubts({ faces: 1, look })[0], /^adab: the face or person detector found 1 face/);
  assert.match(String(frameVerdict({ ...clean, faces: 1, look: { ...look, walkers: 0.7 } })), /^detector: 1 face\(s\), 0 person\(s\) in 5 frame\(s\), people score 70%/);
  // Without the image-text model the detectors decide alone, as before.
  assert.match(String(frameVerdict({ ...clean, faces: 1 })), /^detector: 1 face/);
});
