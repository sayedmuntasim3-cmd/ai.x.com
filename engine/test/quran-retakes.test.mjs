import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AYAH_COUNTS, buildQuranIndex } from "../src/quran.mjs";
import { planRetakes, snapCuts, wordsOfAyat } from "../src/quran-retakes.mjs";
import { cutMap, remapWords } from "../src/voice-tighten.mjs";

// The words come from the shipped Tanzil text: no Arabic is typed by hand here.
const data = new URL("../data/quran/", import.meta.url);
const index = buildQuranIndex(JSON.parse(readFileSync(new URL("tanzil-quran-simple-1.0.2.json", data), "utf8")));

/** @param {number} ayah */
function ayahWords(ayah) {
  let offset = ayah - 1;
  for (let s = 1; s < 93; s += 1) offset += AYAH_COUNTS[s - 1];
  const entry = index.ayat[offset];
  return index.words.slice(entry.firstWord, entry.firstWord + entry.wordCount);
}

const AYAT = Array.from({ length: 11 }, (_, k) => ayahWords(k + 1));
const PASSAGE = AYAT.flat();
const AYAH_START = AYAT.map((_, k) => AYAT.slice(0, k).reduce((n, a) => n + a.length, 0));

const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;

/**
 * A recitation as the recogniser hears it: the given words, one after another,
 * each `seconds` long with `gap` of silence after it.
 * @param {string[]} tokens @param {{ at?: number, seconds?: number, gap?: number }} [o]
 */
function say(tokens, o = {}) {
  const seconds = o.seconds ?? 0.42, gap = o.gap ?? 0.12;
  let at = o.at ?? 0.4;
  return tokens.map((text) => {
    const word = { text, start: r3(at), end: r3(at + seconds) };
    at = word.end + gap;
    return word;
  });
}

/** @param {string[]} parts */
const join = (...parts) => parts.flat();

test("Ad-Duha's words come from the shipped text, not retyped", () => {
  assert.equal(PASSAGE.length, 40);
  assert.deepEqual(wordsOfAyat(index, AYAT.map((_, k) => ({ surah: 93, ayah: k + 1 }))), PASSAGE);
  assert.equal(AYAT[2].length, 5);
});

test("a clean recitation: nothing is cut", () => {
  const plan = planRetakes({ words: say(PASSAGE), expected: PASSAGE });
  assert.deepEqual(plan.cuts, []);
  assert.equal(plan.keptOrderOk, true);
  assert.equal(plan.confidence, 1);
  assert.equal(plan.removedSeconds, 0);
  assert.equal(plan.message.code, "quran.retakes");
  assert.ok(plan.message.en && plan.message.bn);
});

test("one restart in ayah 3: the earlier attempt is cut, the later take kept", () => {
  const take1 = AYAT[2].slice(0, 3);
  const before = join(AYAT[0], AYAT[1], take1);
  const words = [...say(before), ...say(AYAT[2], { at: 0.4 + before.length * 0.54 }), ...say(join(...AYAT.slice(3)), { at: 0.4 + (before.length + AYAT[2].length) * 0.54 })];
  const plan = planRetakes({ words, expected: PASSAGE });
  assert.equal(plan.cuts.length, 1);
  assert.equal(plan.cuts[0].reason, "restart");
  assert.deepEqual(plan.cuts[0].words, take1);
  // The cut runs from the first word of the failed attempt to the restart, and keeps the whole later ayah.
  assert.equal(plan.cuts[0].from, words[AYAH_START[2]].start);
  assert.equal(plan.cuts[0].to, words[AYAH_START[2] + take1.length].start);
  assert.ok(plan.cuts[0].seconds > 1);
  assert.equal(plan.keptOrderOk, true);
  assert.equal(plan.message.code, "quran.retakes");
});

test("two restarts in a row: both failed attempts are cut", () => {
  const take = AYAT[2].slice(0, 3);
  const before = join(AYAT[0], AYAT[1], take, take);
  const words = [...say(before), ...say(AYAT[2], { at: 0.4 + before.length * 0.54 }), ...say(join(...AYAT.slice(3)), { at: 0.4 + (before.length + AYAT[2].length) * 0.54 })];
  const plan = planRetakes({ words, expected: PASSAGE });
  assert.equal(plan.cuts.length, 2);
  assert.deepEqual(plan.cuts.map((c) => c.reason), ["restart", "restart"]);
  assert.equal(plan.cuts[0].from, words[AYAH_START[2]].start);
  assert.equal(plan.cuts[0].to, words[AYAH_START[2] + take.length].start);
  assert.equal(plan.cuts[1].from, words[AYAH_START[2] + take.length].start);
  assert.equal(plan.cuts[1].to, words[AYAH_START[2] + 2 * take.length].start);
  assert.equal(plan.keptOrderOk, true);
});

test("a garbled stretch of 3 words between two matched words is cut", () => {
  const at = AYAH_START[4] + 2;
  const words = [...say(PASSAGE.slice(0, at)), ...say(["ثثث", "خخخ", "ذذذ"], { at: 0.4 + at * 0.54 }), ...say(PASSAGE.slice(at), { at: 0.4 + at * 0.54 + 3 * 0.54 })];
  const plan = planRetakes({ words, expected: PASSAGE });
  assert.equal(plan.cuts.length, 1);
  assert.equal(plan.cuts[0].reason, "garbled");
  assert.deepEqual(plan.cuts[0].words, ["ثثث", "خخخ", "ذذذ"]);
  assert.equal(plan.cuts[0].from, words[at].start);
  assert.equal(plan.cuts[0].to, words[at + 3].start);
  assert.equal(plan.keptOrderOk, true);
});

test("a word cut off and said again: only the broken try is cut", () => {
  const at = AYAH_START[8];
  const broken = { text: PASSAGE[at].slice(0, 3), start: 0.4 + at * 0.54, end: r3(0.4 + at * 0.54 + 0.12) };
  const full = say([PASSAGE[at]], { at: broken.end + 0.04 });
  const words = [...say(PASSAGE.slice(0, at)), broken, ...full, ...say(PASSAGE.slice(at + 1), { at: full[0].end + 0.12 })];
  const plan = planRetakes({ words, expected: PASSAGE });
  assert.equal(plan.cuts.length, 1);
  assert.equal(plan.cuts[0].reason, "broken-word");
  assert.equal(plan.cuts[0].from, r3(broken.start));
  assert.equal(plan.cuts[0].to, r3(full[0].start));
  assert.equal(plan.keptOrderOk, true);
});

test("a recitation missing a word: no cuts, and the reviewer gets a gap message", () => {
  const missing = AYAH_START[5] + 1;
  const words = say([...PASSAGE.slice(0, missing), ...PASSAGE.slice(missing + 1)]);
  const plan = planRetakes({ words, expected: PASSAGE });
  assert.deepEqual(plan.cuts, []);
  assert.equal(plan.keptOrderOk, false);
  assert.equal(plan.message.code, "quran.retakesGap");
  assert.equal(plan.message.params.expected, 40);
  assert.ok(plan.message.en.includes("No retake was cut"));
  assert.ok(plan.message.bn);
});

test("word times move onto the cut recording with the shared clock map", () => {
  const take1 = AYAT[2].slice(0, 3);
  const before = join(AYAT[0], AYAT[1], take1);
  const words = [...say(before), ...say(AYAT[2], { at: 0.4 + before.length * 0.54 }), ...say(join(...AYAT.slice(3)), { at: 0.4 + (before.length + AYAT[2].length) * 0.54 })];
  const plan = planRetakes({ words, expected: PASSAGE });
  const map = cutMap(plan.cuts);
  const moved = remapWords(words, map);
  const removed = r3(plan.cuts.reduce((n, c) => n + c.seconds, 0));
  // The words before the cut keep their time; the words of the failed take land where the cut closes; every word
  // after the cut moves exactly the removed time. That is the clock the film and the ayah cards then use.
  words.forEach((w, k) => {
    if (w.start >= plan.cuts[0].from - 1e-6 && w.start < plan.cuts[0].to - 1e-6) {
      assert.equal(moved[k].start, plan.cuts[0].from, `word ${k} ${w.text} closes at the cut`);
      return;
    }
    const shift = w.start < plan.cuts[0].from ? 0 : removed;
    assert.equal(moved[k].start, r3(w.start - shift), `word ${k} ${w.text}`);
    assert.equal(moved[k].end, r3(w.end - shift), `word ${k} ${w.text}`);
  });
  const restartAt = words.findIndex((w) => w.start >= plan.cuts[0].to);
  assert.ok(restartAt > 0);
  assert.equal(moved[restartAt].start, r3(words[restartAt].start - removed));
  assert.ok(moved.every((w) => w.start >= 0 && w.end >= w.start));
});

test("a cut edge moves to a measured silence only inside 150 ms, and never backwards", () => {
  // Voiced words, with a short pause at 2.0-2.15 and a long one after 4 s.
  const spans = [{ start: 0.5, end: 2 }, { start: 2.15, end: 4 }, { start: 5, end: 8 }];
  const cuts = [{ from: 0.9, to: 2.25, seconds: r3(2.25 - 0.9), reason: /** @type {const} */ ("restart"), words: [] }];
  const snapped = snapCuts(cuts, spans);
  // 0.9 is deep inside a word with no silence near it: it stays, so no kept word is opened.
  assert.equal(snapped[0].from, 0.9);
  // 2.25 is 0.1 s after the pause ended: it goes back to the pause, where nothing is voiced.
  assert.equal(snapped[0].to, 2.15);
  assert.ok(snapped[0].to > snapped[0].from);
  // A cut already in a quiet place is left exactly where it is.
  assert.equal(snapCuts([{ from: 2.02, to: 2.13, seconds: 0.11, reason: /** @type {const} */ ("garbled"), words: [] }], spans)[0].to, 2.13);
});
