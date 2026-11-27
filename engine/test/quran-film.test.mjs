import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tokenizeArabic } from "../src/arabic.mjs";
import { QURAN_CREDIT, checkQuranFilm, planQuranFilm, quranSrt } from "../src/quran-film.mjs";
import { ayahText, buildQuranIndex, matchRecitation } from "../src/quran.mjs";
import { locateRecitation, locationToMatch } from "../src/quran-locate.mjs";
import { planLocated } from "../src/voice-understand.mjs";
import { wordTimesConfident, filmText, FORMATS } from "../../render/quran-render.mjs";

const tanzil = JSON.parse(readFileSync(new URL("../data/quran/tanzil-quran-simple-1.0.2.json", import.meta.url), "utf8"));
const names = JSON.parse(readFileSync(new URL("../data/quran/surah-names.json", import.meta.url), "utf8"));
const index = buildQuranIndex(tanzil);

/** A recitation of surah 112 with real word times: 1.4 s a word, 2 s of quiet between ayat, 3 s lead-in. */
function timedRecitation(surah, from, to, lead = 3) {
  const words = [];
  let t = lead;
  for (let ayah = from; ayah <= to; ayah += 1) {
    let tokens = tokenizeArabic(ayahText(index, surah, ayah));
    if (ayah === 1 && surah !== 1 && surah !== 9) tokens = tokens.slice(4);
    for (const text of tokens) { words.push({ text, start: t, end: t + 1.3 }); t += 1.4; }
    t += 2;
  }
  return { words, total: t + 1 };
}

test("a timed recitation becomes one scene per ayah, cut in the quiet between ayat", () => {
  const { words, total } = timedRecitation(112, 1, 4);
  const match = matchRecitation(words, index);
  const plan = planQuranFilm({ match, index, totalSeconds: total, surahNames: Array.isArray(names) ? names : [] });
  assert.equal(plan.ok, true);
  assert.equal(plan.timed, true);
  assert.deepEqual(checkQuranFilm(plan, index), []);
  const ayahScenes = plan.scenes.filter((s) => s.kind === "ayah");
  assert.deepEqual(ayahScenes.map((s) => s.ayah), [1, 2, 3, 4]);
  for (const s of ayahScenes) {
    assert.equal(s.text, ayahText(index, 112, s.ayah), "verbatim Tanzil text");
    assert.ok(s.start <= s.spokenStart && s.end >= s.spokenEnd, "the cut never falls inside a recited ayah");
  }
  assert.equal(plan.scenes[0].start, 0);
  assert.equal(plan.scenes.at(-1).end, plan.totalSeconds);
  assert.ok(Math.abs(plan.totalSeconds - total) < 0.001);
  assert.equal(plan.summary.surah, 112);
  assert.equal(plan.credit, QURAN_CREDIT);
});

test("nothing plays under the recitation and nothing is depicted", () => {
  const { words, total } = timedRecitation(112, 1, 4);
  const plan = planQuranFilm({ match: matchRecitation(words, index), index, totalSeconds: total });
  assert.deepEqual([plan.audio.music, plan.audio.soundEffects, plan.audio.ambience], [false, false, false]);
  assert.equal(plan.audio.voice, "owner-recording-untouched");
  assert.ok(plan.visuals.forbidden.some((f) => /prophet/.test(f)));
  assert.ok(plan.rules.includes("nothing-under-quran") && plan.rules.includes("no-depiction"));
});

test("the checker catches a changed text, a gap and music", () => {
  const { words, total } = timedRecitation(112, 1, 4);
  const plan = planQuranFilm({ match: matchRecitation(words, index), index, totalSeconds: total });
  const bad = structuredClone(plan);
  bad.scenes.find((s) => s.kind === "ayah").text += " x";
  bad.scenes[2].start += 0.5;
  bad.audio = { ...bad.audio, music: true };
  const problems = checkQuranFilm(bad, index);
  assert.ok(problems.some((p) => /verbatim/.test(p)));
  assert.ok(problems.some((p) => /gap or overlap/.test(p)));
  assert.ok(problems.some((p) => /under the recitation/.test(p)));
});

test("without word times the cuts are estimated by ayah length and the owner is told", () => {
  const { words, total } = timedRecitation(112, 1, 4);
  const match = matchRecitation(words.map((w) => w.text).join(" "), index);
  const plan = planQuranFilm({ match, index, totalSeconds: total });
  assert.equal(plan.ok, true);
  assert.equal(plan.timed, false);
  assert.ok(plan.review.some((r) => /estimated/.test(r)));
  assert.deepEqual(checkQuranFilm(plan, index), []);
});

test("speech that is not the Quran, or a missing length, gives no film", () => {
  const speech = matchRecitation("this is an ordinary english sentence with nothing from the book", index);
  assert.equal(planQuranFilm({ match: speech, index, totalSeconds: 60 }).ok, false);
  const { words } = timedRecitation(112, 1, 4);
  assert.equal(planQuranFilm({ match: matchRecitation(words, index), index, totalSeconds: 0 }).ok, false);
});

test("subtitles are one cue per ayah, in well-formed SRT", () => {
  const { words, total } = timedRecitation(112, 1, 4);
  const plan = planQuranFilm({ match: matchRecitation(words, index), index, totalSeconds: total });
  const srt = quranSrt(plan);
  assert.equal(srt.split("\n\n").filter(Boolean).length, 4);
  assert.match(srt, /^1\n\d\d:\d\d:\d\d,\d{3} --> \d\d:\d\d:\d\d,\d{3}\n/);
});

test("aligned per-word times flow from locateRecitation to the film plan scenes", () => {
  // An AlignedAyah carries per-word start/end/score from forced alignment.
  const aligned = [
    { surah: 112, ayah: 1, start: 3.2, end: 5.4, score: 0.94, lastWordScore: 0.92, words: [{ start: 3.2, end: 3.9, score: 0.95 }, { start: 4.0, end: 4.7, score: 0.93 }, { start: 4.8, end: 5.4, score: 0.92 }] },
    { surah: 112, ayah: 2, start: 7.6, end: 9.8, score: 0.91, lastWordScore: 0.89, words: [{ start: 7.6, end: 8.3, score: 0.93 }, { start: 8.4, end: 9.1, score: 0.90 }, { start: 9.2, end: 9.8, score: 0.89 }] },
  ];
  const location = locateRecitation({ index, surahNames: names, spans: [{ start: 3, end: 6 }, { start: 6.4, end: 8 }, { start: 8.4, end: 10.2 }, { start: 10.6, end: 12 }], totalSeconds: 15, given: { surah: 112, ayat: "1-2" }, aligned });
  assert.equal(location.ok, true);
  assert.equal(location.ayat.length, 2);
  assert.deepStrictEqual(location.ayat[0].words, aligned[0].words, "the first ayah keeps its aligned per-word times");
  assert.deepStrictEqual(location.ayat[1].words, aligned[1].words, "the second ayah keeps its aligned per-word times");
  // locationToMatch carries the words onto the match segments.
  const match = locationToMatch(location, index);
  assert.ok(Array.isArray(match.segments[0].ayat[0].words), "match segment ayat carry words");
  assert.deepStrictEqual(match.segments[0].ayat[0].words, aligned[0].words);
  // planLocated builds a film plan whose scenes carry the words.
  const { plan } = planLocated(location, index, 15, names);
  const ayahScenes = plan.scenes.filter((s) => s.kind === "ayah");
  assert.equal(ayahScenes.length, 2);
  assert.deepStrictEqual(ayahScenes[0].words, aligned[0].words, "scene 1 carries aligned words for highlight");
  assert.deepStrictEqual(ayahScenes[1].words, aligned[1].words, "scene 2 carries aligned words for highlight");
  // The renderer's wordTimesConfident sees confident per-word times.
  assert.equal(wordTimesConfident(ayahScenes[0]), true);
  // A scene with no words is not highlighted.
  assert.equal(wordTimesConfident({ kind: "ayah", words: undefined }), false);
  assert.equal(wordTimesConfident({ kind: "ayah", words: [] }), false);
  assert.equal(wordTimesConfident({ kind: "ayah", words: [{ start: 1, end: 2, score: 0.3 }] }), false);
});

test("the renderer emits one AyahHighlighted event per confident word", () => {
  // scene.words flow into filmText and produce one highlighted event per word.
  // Build a minimal Uthmani text array: surah 112 has 4 ayat; we need ayah 1 at offset.
  const offset112 = [1, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6].slice(0, 111).reduce((a, b) => a + b, 0);
  const uthmani = new Array(offset112 + 4).fill("");
  uthmani[offset112] = "قُلْ هُوَ اللَّهُ أَحَدٌ";
  uthmani[offset112 + 1] = "اللَّهُ الصَّمَدُ";
  uthmani[offset112 + 2] = "لَمْ يَلِدْ وَلَمْ يُولَدْ";
  uthmani[offset112 + 3] = "وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ";
  const plan = { scenes: [{ kind: "ayah", surah: 112, ayah: 1, start: 0, end: 6, spokenStart: 3.2, spokenEnd: 5.4, endSure: true, words: [{ start: 3.2, end: 3.9, score: 0.95 }, { start: 4.0, end: 4.7, score: 0.93 }, { start: 4.8, end: 5.4, score: 0.92 }] }] };
  const ass = filmText(plan, uthmani, names, { format: FORMATS["1080p"], total: 15, translation: "none", highlight: "word" }, { uthmani, simple: [], pickthall: [] });
  const lines = ass.split(String.fromCharCode(92, 110));
  const highlighted = lines.filter((l) => l.startsWith("Dialogue:") && l.includes("AyahHighlighted,"));
  assert.equal(highlighted.length, 3, "one AyahHighlighted event per word (3 words = 3 events)");
  for (const line of highlighted) assert.ok(line.includes("AyahHighlighted"), "highlighted event uses AyahHighlighted style");
  // Without words the whole ayah is one soft-white Ayah event, no highlight.
  const planNoWords = { scenes: [{ kind: "ayah", surah: 112, ayah: 1, start: 0, end: 6, spokenStart: 3.2, spokenEnd: 5.4, endSure: true }] };
  const assNo = filmText(planNoWords, uthmani, names, { format: FORMATS["1080p"], total: 15, translation: "none", highlight: "word" }, { uthmani, simple: [], pickthall: [] });
  const noHighlight = assNo.split(String.fromCharCode(92, 110)).filter((l) => l.startsWith("Dialogue:") && l.includes("AyahHighlighted,"));
  assert.equal(noHighlight.length, 0, "no highlight events when scene has no words");
  assert.ok(assNo.split(String.fromCharCode(92, 110)).some((l) => l.startsWith("Dialogue:") && l.includes(",Ayah,")), "whole ayah shown as soft-white Ayah event");
});
;
