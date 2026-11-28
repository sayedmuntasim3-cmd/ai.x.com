import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REFERENCE_BAR, PRACTICE_SCORECARD, barBrief, barMeasuresFromReport, barSummary, checkBar } from "../src/reference-bar.mjs";

test("a missing measure is unknown, never pass", () => {
  const rows = checkBar({});
  assert.ok(rows.every((r) => r.result === "unknown"));
  assert.equal(barSummary(rows).total, REFERENCE_BAR.length);
});

test("limits are applied in the right direction", () => {
  const rows = Object.fromEntries(checkBar({ firstMinuteMaxShot: 5.9, first3MaxShot: 7, firstGraphicAt: 120, integratedLufs: -14, longestSilence: 0.5, repeatedPictures: 0, descriptionHasSources: true }).map((r) => [r.id, r.result]));
  assert.equal(rows.firstMinuteCut, "pass");
  assert.equal(rows.first3MaxShot, "fail");
  assert.equal(rows.mapBefore90, "fail");
  assert.equal(rows.loudnessLow, "pass");
  assert.equal(rows.loudnessHigh, "pass");
  assert.equal(rows.silenceMax, "pass");
  assert.equal(rows.noRepeatedPicture, "pass");
  assert.equal(rows.descriptionSources, "pass");
  assert.equal(checkBar({ integratedLufs: -15.3 }).find((r) => r.id === "loudnessLow").result, "fail");
});

test("every rule number of the scorecard's bar (1-10) is covered, and every id is unique", () => {
  assert.deepEqual([...new Set(REFERENCE_BAR.map((r) => r.rule))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(REFERENCE_BAR.map((r) => r.id)).size, REFERENCE_BAR.length);
});

test("the data still matches the document it came from (REFERENCE_SCORECARD.md section 5)", () => {
  const doc = readFileSync(new URL("../../docs/research/REFERENCE_SCORECARD.md", import.meta.url), "utf8");
  const bar = doc.slice(doc.indexOf("## 5. The bar"), doc.indexOf("## 6. What is still unverified"));
  for (const phrase of ["every 6 s", "before 1:30", "before 0:30", "2:30", "first 3 min", "-14 LUFS", "0.8 s", "at least 3 sources", "50%"]) assert.ok(bar.includes(phrase), phrase);
});

test("reports feed the checker only what they carry; the brief names every rule; the scorecard hook is empty until wired", () => {
  assert.deepEqual(barMeasuresFromReport({ audio: { integratedLufs: -14.2, longestSilence: 0.4 } }), { longestSilence: 0.4, integratedLufs: -14.2 });
  assert.deepEqual(barMeasuresFromReport(null), {});
  for (const r of REFERENCE_BAR) assert.ok(barBrief().includes(r.label));
  assert.equal(PRACTICE_SCORECARD, null);
});
