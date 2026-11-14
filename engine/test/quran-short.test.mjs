import assert from "node:assert/strict";
import { test } from "node:test";
import { SHORT, shortPassages, sliceTimeline } from "../src/quran-short.mjs";

/** Ayat of 9 s with 1 s pauses; `unsure` lists the ayah numbers whose end is not sure. @param {number[]} unsure */
const located = (unsure = []) => ({ ayat: Array.from({ length: 12 }, (_, k) => ({ surah: 12, ayah: k + 1, start: k * 10 + 0.5, end: k * 10 + 9.5, sure: !unsure.includes(k + 1) })) });

test("a short starts and ends only on sure ayah ends, in the pause, 20 to 60 s long, nearest 35 s first", () => {
  const all = shortPassages(located(), 120);
  assert.ok(all.length > 0);
  for (const p of all) assert.ok(p.seconds >= SHORT.min && p.seconds <= SHORT.max);
  assert.ok(Math.abs(all[0].seconds - SHORT.target) <= 5);
  // Every cut is in the middle of a pause (x.0 s here), never inside an ayah.
  for (const p of all) for (const c of [p.cutIn, p.cutOut]) assert.ok(c === 0 || c === 120 || Math.abs(c - Math.round(c)) < 1e-9, String(c));
  // Unsure ends are never used as a cut.
  const some = shortPassages(located([3, 4, 5, 6, 7, 8]), 120);
  for (const p of some) for (const c of [p.cutIn, p.cutOut]) assert.ok(![30, 40, 50, 60, 70, 80].includes(c), `cut at ${c}`);
  assert.deepEqual(shortPassages(located([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]), 120), [], "nothing sure: no short from inside the recording");
});

test("the timeline between two cuts moves to zero; what crosses a cut is trimmed", () => {
  const items = [{ start: 0, end: 10, spokenStart: 0.5 }, { start: 10, end: 25, spokenStart: 10.5 }, { start: 25, end: 40, spokenStart: 25.5 }];
  assert.deepEqual(sliceTimeline(items, 10, 30, ["spokenStart"]), [{ start: 0, end: 15, spokenStart: 0.5 }, { start: 15, end: 20, spokenStart: 15.5 }]);
});
