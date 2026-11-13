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
});
