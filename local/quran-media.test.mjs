import assert from "node:assert/strict";
import { test } from "node:test";
import { frameVerdict, hamming } from "./quran-media.mjs";

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
