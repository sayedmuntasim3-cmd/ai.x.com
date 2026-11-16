import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tokenizeArabic } from "../src/arabic.mjs";
import { QURAN_CREDIT, checkQuranFilm, planQuranFilm, quranSrt } from "../src/quran-film.mjs";
import { ayahText, buildQuranIndex, matchRecitation } from "../src/quran.mjs";

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
