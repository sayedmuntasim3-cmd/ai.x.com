import { test } from "node:test";
import assert from "node:assert/strict";
import { TIGHTEN, applyTighten, planTighten, remapWords } from "../src/voice-tighten.mjs";

const spans = [{ start: 1.5, end: 4 }, { start: 4.8, end: 7 }, { start: 11, end: 14 }, { start: 14.6, end: 16 }];

test("a narration's long pauses become short ones; short pauses, words and breaths are never touched", () => {
  const p = planTighten({ spans, totalSeconds: 18, kind: "narration" });
  assert.deepEqual(p.cuts.map((c) => c.at), ["start", "pause", "end"]);
  const pause = p.cuts[1];
  assert.equal(pause.gap, 4);
  assert.equal(Math.round((pause.to - pause.from) * 1000) / 1000, 4 - TIGHTEN.narration.keep, "the 4 s stop keeps 0.7 s");
  assert.equal(p.map(11), 6.5, "the next word moves up by what was cut before it");
  assert.equal(p.map(4.8), 3.6, "the 0.8 s pause stays");
  for (const c of p.cuts) for (const s of spans) assert.ok(c.to <= s.start || c.from >= s.end, "no cut inside a voiced stretch");
  assert.deepEqual(remapWords([{ start: 11, end: 11.4, text: "x" }], p.map), [{ start: 6.5, end: 6.9, text: "x" }]);
});

test("a recitation keeps every natural pause; only an unusual stop is shortened, never below a full pause", () => {
  const recitation = [{ start: 0.4, end: 6 }, { start: 8.4, end: 14 }, { start: 21, end: 26 }];
  const p = planTighten({ spans: recitation, totalSeconds: 26.5, kind: "quran" });
  assert.equal(p.cuts.length, 1, "the 2.4 s waqf stays; the 7 s stop is shortened");
  assert.equal(p.cuts[0].gap, 7);
  assert.equal(Math.round((p.cuts[0].gap - p.cuts[0].seconds) * 10) / 10, TIGHTEN.quran.keep);
});

test("the tightened audio is exactly as long as the kept time, with the join crossfaded", () => {
  const sr = 1000;
  const x = new Float32Array(10 * sr).fill(0.5);
  const [out] = applyTighten([x], sr, [{ from: 2, to: 5, seconds: 3, gap: 4, at: "pause" }]);
  assert.equal(out.length, 7 * sr);
  assert.ok(out.every((v) => Math.abs(v - 0.5) < 0.21), "no click at the join");
});
