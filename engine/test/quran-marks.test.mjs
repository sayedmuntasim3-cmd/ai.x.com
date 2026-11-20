import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AYAH_COUNTS, buildQuranIndex } from "../src/quran.mjs";
import { locateRecitation, passageUnits } from "../src/quran-locate.mjs";
import { planLocated } from "../src/voice-understand.mjs";
import { applyMarks, checkMarks } from "../src/quran-marks.mjs";

const data = new URL("../data/quran/", import.meta.url);
const index = buildQuranIndex(JSON.parse(readFileSync(new URL("tanzil-quran-simple-1.0.2.json", data), "utf8")));
const surahNames = JSON.parse(readFileSync(new URL("surah-names.json", data), "utf8"));

/** Ad-Duha as voiced stretches, located from the given surah alone: the machine's ends are estimates, never sure. */
function duha() {
  const units = passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: AYAH_COUNTS[92] }]);
  const spans = [];
  const truth = [];
  let at = 2;
  for (const u of units) { const len = u.weight * 0.25; spans.push({ start: at, end: at + len }); truth.push({ start: at, end: at + len }); at += len + 1; }
  const total = at + 3;
  return { location: locateRecitation({ index, surahNames, spans, totalSeconds: total, given: { surah: "93" }, opening: "none", closing: "none" }), truth, total };
}

test("without marks the ayah ends of Ad-Duha are not sure, so their text would stay hidden", () => {
  const { location, total } = duha();
  assert.equal(location.ok, true);
  const { plan } = planLocated(location, index, total, surahNames);
  assert.ok(plan.scenes.filter((s) => s.kind === "ayah").some((s) => s.endSure === false));
});

test("the reviewer's taps become confirmed ayah times: every end is sure and the scenes follow the taps", () => {
  const { location, truth, total } = duha();
  const raw = { start: truth[0].start, ends: truth.map((t) => t.end + 0.3), by: "Reviewer Name" };
  const checked = checkMarks(raw, location.ayat.length, total);
  assert.ok(checked.ok, JSON.stringify(checked));
  const marked = applyMarks(location, /** @type {any} */ (checked).marks);
  const { plan } = planLocated(marked, index, total, surahNames);
  const ayat = plan.scenes.filter((s) => s.kind === "ayah");
  assert.equal(ayat.length, 11);
  assert.ok(ayat.slice(0, -1).every((s) => s.endSure === true), "every marked end is sure");
  assert.equal(ayat[0].spokenStart, truth[0].start);
  const m = /** @type {any} */ (checked).marks;
  assert.equal(ayat[2].spokenEnd, m.ends[2]);
  assert.equal(ayat[3].spokenStart, m.ends[2], "the next ayah begins at the tap");
  assert.equal(marked.markedBy, "Reviewer Name");
});

test("marks are checked: count, order, inside the recording, a name", () => {
  assert.match(/** @type {any} */ (checkMarks({ start: 1, ends: [2, 3], by: "A" }, 3, 60)).error, /3 expected, 2 given/);
  assert.match(/** @type {any} */ (checkMarks({ start: 1, ends: [5, 4, 9], by: "A" }, 3, 60)).error, /not after/);
  assert.match(/** @type {any} */ (checkMarks({ start: 1, ends: [5, 9, 90], by: "A" }, 3, 60)).error, /outside/);
  assert.match(/** @type {any} */ (checkMarks({ start: 1, ends: [5, 9, 20] }, 3, 60)).error, /who marked/);
  assert.equal(checkMarks({ start: 1, ends: [5, 9, 20], by: "Hafiz <b>X</b>" }, 3, 60).ok, true);
});
