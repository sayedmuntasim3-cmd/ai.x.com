import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeArabic, tokenizeArabic, wordSimilarity } from "../src/arabic.mjs";
import { AYAH_COUNTS, TOTAL_AYAT, ayahText, buildQuranIndex, matchRecitation } from "../src/quran.mjs";

// The real Tanzil text, so every transcript below is built from the Quran
// itself rather than typed by hand.
const tanzil = JSON.parse(readFileSync(new URL("../data/quran/tanzil-quran-simple-1.0.2.json", import.meta.url), "utf8"));
const index = buildQuranIndex(tanzil);

/** Plain words of an ayah range, the way speech recognition writes them (no diacritics). */
function recite(surah, from, to) {
  const words = [];
  for (let ayah = from; ayah <= to; ayah += 1) {
    let tokens = tokenizeArabic(ayahText(index, surah, ayah));
    if (ayah === 1 && surah !== 1 && surah !== 9) tokens = tokens.slice(4);
    words.push(...tokens);
  }
  return words;
}

const ISTIADHA = "أعوذ بالله من الشيطان الرجيم";
const BASMALA = "بسم الله الرحمن الرحيم";

test("the ayah counts add up to the 6,236 ayat of the Tanzil text", () => {
  assert.equal(AYAH_COUNTS.length, 114);
  assert.equal(AYAH_COUNTS.reduce((a, b) => a + b, 0), TOTAL_AYAT);
  assert.equal(tanzil.length, TOTAL_AYAT);
  assert.throws(() => buildQuranIndex(tanzil.slice(1)), /6236 ayat/);
});

test("ayah text is returned verbatim from Tanzil and unknown references give null", () => {
  assert.equal(ayahText(index, 1, 1), tanzil[0]);
  assert.equal(ayahText(index, 114, 6), tanzil[TOTAL_AYAT - 1]);
  assert.equal(ayahText(index, 2, 287), null);
  assert.equal(ayahText(index, 115, 1), null);
  assert.equal(ayahText(index, 0, 1), null);
});

test("the basmala Tanzil writes before a surah is not counted as part of its first ayah", () => {
  const first = (surah) => index.ayat.find((a) => a.surah === surah && a.ayah === 1);
  assert.deepEqual(index.words.slice(first(1).firstWord, first(1).firstWord + 4), ["بسم", "الله", "الرحمن", "الرحيم"]);
  assert.deepEqual(index.words.slice(first(2).firstWord, first(2).firstWord + first(2).wordCount), ["الم"]);
  assert.equal(index.words[first(9).firstWord], "براءه");
  assert.equal(index.words[first(112).firstWord], "قل");
});

test("normalisation removes diacritics and unifies letter variants", () => {
  assert.equal(normalizeArabic("الرَّحْمَٰنِ"), "الرحمن");
  assert.equal(normalizeArabic("إِيَّاكَ نَعْبُدُ"), "اياك نعبد");
  assert.equal(normalizeArabic("الصَّلَاةَ"), normalizeArabic("الصلاه"));
  assert.equal(normalizeArabic("hello"), "");
  assert.ok(wordSimilarity("الضالين", "الضالمين") >= 0.75);
  assert.ok(wordSimilarity("من", "ما") < 0.75);
});

test("Al-Fatiha is recognised as surah 1, ayat 1 to 7", () => {
  const result = matchRecitation(recite(1, 1, 7).join(" "), index);
  assert.equal(result.isQuran, true);
  assert.equal(result.coverage, 1);
  assert.equal(result.segments.length, 1);
  const [segment] = result.segments;
  assert.deepEqual([segment.surah, segment.fromAyah, segment.toAyah], [1, 1, 7]);
  assert.ok(segment.confidence >= 0.99, String(segment.confidence));
  assert.ok(segment.ayat.every((a) => a.complete));
  assert.deepEqual(result.markers, []);
});

test("speech-recognition slips (a dropped word, a wrong letter, hamza forms) are tolerated", () => {
  const words = recite(1, 1, 7);
  words.splice(words.indexOf("مالك"), 1);
  words[words.lastIndexOf("الضالين")] = "الضالمين";
  const text = words.join(" ").replace("اياك نعبد", "إياك نعبد");
  const result = matchRecitation(text, index);
  assert.equal(result.isQuran, true);
  const [segment] = result.segments;
  assert.deepEqual([segment.surah, segment.fromAyah, segment.toAyah], [1, 1, 7]);
  assert.ok(segment.confidence >= 0.85, String(segment.confidence));
});

test("the isti'adha and the basmala before Al-Falaq are markers, not ayat", () => {
  const result = matchRecitation(ISTIADHA + " " + BASMALA + " " + recite(113, 1, 5).join(" "), index);
  assert.deepEqual(result.markers.map((m) => m.type), ["istiadha", "basmala"]);
  assert.equal(result.segments.length, 1);
  assert.deepEqual([result.segments[0].surah, result.segments[0].fromAyah, result.segments[0].toAyah], [113, 1, 5]);
  assert.equal(result.coverage, 1);
});

test("two surahs in one recording come back as two segments", () => {
  const text = [BASMALA, recite(112, 1, 4).join(" "), BASMALA, recite(113, 1, 5).join(" "), "صدق الله العظيم"].join(" ");
  const result = matchRecitation(text, index);
  assert.deepEqual(result.segments.map((s) => [s.surah, s.fromAyah, s.toAyah]), [[112, 1, 4], [113, 1, 5]]);
  assert.deepEqual(result.markers.map((m) => m.type), ["basmala", "basmala", "closing"]);
});

test("part of Ayat al-Kursi is placed at 2:255 and marked incomplete", () => {
  const half = recite(2, 255, 255).slice(0, 18);
  const result = matchRecitation(half.join(" "), index);
  assert.equal(result.isQuran, true);
  const [segment] = result.segments;
  assert.deepEqual([segment.surah, segment.fromAyah, segment.toAyah], [2, 255, 255]);
  assert.equal(segment.ayat[0].complete, false);
});

test("Ar-Rahman's repeated refrain does not confuse the position", () => {
  const result = matchRecitation(recite(55, 1, 25).join(" "), index);
  assert.deepEqual(result.segments.map((s) => [s.surah, s.fromAyah, s.toAyah]), [[55, 1, 25]]);
  assert.ok(result.segments[0].confidence >= 0.99);
});

test("a whole recitation of Al-Baqarah is one segment, 2:1 to 2:286, in reasonable time", () => {
  const started = Date.now();
  const result = matchRecitation(recite(2, 1, 286).join(" "), index);
  const elapsed = Date.now() - started;
  assert.deepEqual(result.segments.map((s) => [s.surah, s.fromAyah, s.toAyah]), [[2, 1, 286]]);
  assert.equal(result.segments[0].ayat.length, 286);
  assert.ok(result.segments[0].ayat.every((a) => a.complete), "every ayah is complete");
  assert.ok(elapsed < 20_000, "took " + elapsed + " ms");
});

test("word times give the start and end of every ayah", () => {
  const words = recite(1, 1, 7).map((text, i) => ({ text, start: i * 0.5, end: i * 0.5 + 0.45 }));
  const result = matchRecitation(words, index);
  const timings = result.segments[0].ayat;
  assert.equal(timings.length, 7);
  assert.equal(timings[0].start, 0);
  assert.equal(timings[1].start, 4 * 0.5);
  for (let i = 1; i < timings.length; i += 1) assert.ok(timings[i].start > timings[i - 1].end - 1e-9);
  assert.equal(result.segments[0].end, timings[6].end);
});

test("a refrain that occurs in many places is marked ambiguous and every place is listed", () => {
  const refrain = matchRecitation(recite(55, 13, 13).join(" "), index);
  assert.equal(refrain.segments.length, 1);
  assert.equal(refrain.segments[0].ambiguous, true);
  assert.equal(refrain.segments[0].alternatives.length, 31);
  assert.ok(refrain.segments[0].alternatives.every((a) => a.surah === 55));
  const woe = matchRecitation(recite(77, 15, 15).join(" "), index);
  assert.equal(woe.segments[0].ambiguous, true);
  // Ten times in Al-Mursalat, and once more at Al-Mutaffifin 83:10.
  assert.deepEqual(woe.segments[0].alternatives.map((a) => a.surah + ":" + a.fromAyah), ["77:15", "77:19", "77:24", "77:28", "77:34", "77:37", "77:40", "77:45", "77:47", "77:49", "83:10"]);
  const passage = matchRecitation(recite(55, 10, 16).join(" "), index);
  assert.equal(passage.segments[0].ambiguous, false);
  assert.deepEqual([passage.segments[0].fromAyah, passage.segments[0].toAyah], [10, 16]);
});

test("heavier recognition noise still finds Al-Mulk 67:1-30", () => {
  const words = recite(67, 1, 30);
  const noisy = [];
  words.forEach((word, i) => {
    if (i % 15 === 7) return; // dropped word
    if (i % 10 === 3 && word.length > 3) noisy.push(word.slice(0, -2) + "ي" + word.slice(-1)); // one wrong letter
    else noisy.push(word);
    if (i % 25 === 12) noisy.push("اه"); // a filler sound
  });
  const result = matchRecitation(noisy.join(" "), index);
  assert.equal(result.isQuran, true);
  assert.deepEqual(result.segments.map((s) => [s.surah, s.fromAyah, s.toAyah]), [[67, 1, 30]]);
  assert.ok(result.segments[0].confidence >= 0.75, String(result.segments[0].confidence));
});

test("a passage from the middle of a surah and surahs out of order are placed correctly", () => {
  const middle = matchRecitation(recite(2, 153, 157).join(" "), index);
  assert.deepEqual(middle.segments.map((s) => [s.surah, s.fromAyah, s.toAyah]), [[2, 153, 157]]);
  const outOfOrder = matchRecitation(recite(114, 1, 6).join(" ") + " " + BASMALA + " " + recite(113, 1, 5).join(" "), index);
  assert.deepEqual(outOfOrder.segments.map((s) => [s.surah, s.fromAyah, s.toAyah]), [[114, 1, 6], [113, 1, 5]]);
});

test("ordinary Arabic speech and Bangla text are not taken for recitation", () => {
  const arabic = matchRecitation("مرحبا بكم في هذا الفيديو عن قصة نجاح رجل بدأ من الصفر وأصبح من أغنى الناس في مدينته", index);
  assert.equal(arabic.isQuran, false);
  const bangla = matchRecitation("আজকে আমরা একজন মানুষের গল্প বলব যিনি শূন্য থেকে শুরু করেছিলেন", index);
  assert.equal(bangla.isQuran, false);
  assert.equal(bangla.words, 0);
});
