import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tokenizeArabic } from "../src/arabic.mjs";
import { QURAN_CREDIT, checkQuranFilm, planQuranFilm, quranSrt } from "../src/quran-film.mjs";
import { ayahText, buildQuranIndex, matchRecitation } from "../src/quran.mjs";
import { locateRecitation, locationToMatch } from "../src/quran-locate.mjs";

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

/** An ayah's words as recited (the basmala Tanzil writes before ayah 1 is not part of it). @param {number} surah @param {number} ayah */
function recited(surah, ayah) {
  const text = ayahText(index, surah, ayah) ?? "";
  const words = text.split(/\s+/);
  return ayah === 1 && surah !== 1 && surah !== 9 && tokenizeArabic(words.slice(0, 4).join(" ")).join(" ") === "بسم الله الرحمن الرحيم" ? words.slice(4).join(" ") : text;
}

/**
 * A Taraweeh-style recording: every ayah in its own voiced stretch with a
 * pause after it, and a basmala of its own between two surahs.
 * @param {{ surah: number, ayah: number | null }[]} units
 */
function reciteInStretches(units, { lead = 0.6, gap = 0.8, step = 0.55 } = {}) {
  /** @type {{ text: string, start: number, end: number }[]} */
  const words = [];
  /** @type {{ start: number, end: number }[]} */
  const spans = [];
  let at = lead;
  for (const u of units) {
    const tokens = u.ayah === null ? tokenizeArabic(ayahText(index, 1, 1) ?? "") : tokenizeArabic(recited(u.surah, u.ayah));
    const length = tokens.length * step;
    spans.push({ start: at, end: at + length });
    tokens.forEach((text, i) => words.push({ text, start: at + i * step, end: at + i * step + 0.5 }));
    at += length + gap;
  }
  return { words, spans, total: at - gap + 0.4 };
}

test("several surahs in one recording: a title card at each new surah, its basmala where it is recited", () => {
  /** @type {{ surah: number, ayah: number | null }[]} */
  const units = [];
  for (let a = 8; a <= 11; a += 1) units.push({ surah: 93, ayah: a });
  units.push({ surah: 94, ayah: null });
  for (let a = 1; a <= 8; a += 1) units.push({ surah: 94, ayah: a });
  units.push({ surah: 95, ayah: null });
  for (let a = 1; a <= 3; a += 1) units.push({ surah: 95, ayah: a });
  const v = reciteInStretches(units);
  const surahNames = Array.isArray(names) ? names : [];
  // No surah typed: the passage is the one the words give, three surahs long.
  const loc = locateRecitation({ index, surahNames, spans: v.spans, totalSeconds: v.total, words: v.words });
  assert.equal(loc.decision, "accept");
  const plan = planQuranFilm({ match: locationToMatch(loc, index), index, totalSeconds: v.total, surahNames });
  assert.equal(plan.ok, true);
  assert.deepEqual(checkQuranFilm(plan, index), []);
  assert.deepEqual(plan.summary.surahs, [93, 94, 95]);
  assert.equal(plan.summary.surah, null, "one summary surah cannot name three");
  const titles = plan.scenes.filter((s) => s.kind === "title");
  assert.deepEqual(titles.map((s) => s.surah), [93, 94, 95]);
  const basmala = ayahText(index, 1, 1);
  // Ad-Duha is recited from ayah 8: no basmala is said before it, so none is on its card.
  assert.equal(titles[0].text, "");
  assert.equal(titles[1].text, basmala, "the basmala said before Ash-Sharh is on Ash-Sharh's card");
  assert.equal(titles[2].text, basmala, "and the one before At-Tin on At-Tin's card");
  assert.equal(titles[1].label, titles[1].label.trim());
  assert.ok(/الشرح/.test(titles[1].label), titles[1].label);
  // Each card ends where its surah's first ayah begins to be spoken, so no recitation is ever covered.
  for (const t of [titles[1], titles[2]]) {
    const firstAyah = plan.scenes[plan.scenes.findIndex((s) => s === t) + 1];
    assert.equal(firstAyah.kind, "ayah");
    assert.equal(firstAyah.surah, t.surah);
    assert.equal(firstAyah.start, t.end, "the ayah's picture starts when the card ends");
    assert.ok(/** @type {number} */ (firstAyah.spokenStart) >= t.end - 0.002);
    assert.ok(t.end - t.start >= 1, `a readable card: ${t.end - t.start} s`);
  }
  // The ayah scenes are one per ayah and each holds its whole recitation.
  const ayahScenes = plan.scenes.filter((s) => s.kind === "ayah");
  assert.equal(ayahScenes.length, 15);
  for (const s of ayahScenes) assert.ok(s.start <= /** @type {number} */ (s.spokenStart) && s.end >= /** @type {number} */ (s.spokenEnd));
});

test("a passage that starts at At-Tawbah: no basmala card, because that surah has none", () => {
  const v = reciteInStretches([{ surah: 9, ayah: 1 }, { surah: 9, ayah: 2 }, { surah: 9, ayah: 3 }]);
  const plan = planQuranFilm({ match: matchRecitation(v.words, index), index, totalSeconds: v.total, surahNames: Array.isArray(names) ? names : [] });
  assert.equal(plan.ok, true);
  assert.deepEqual(checkQuranFilm(plan, index), []);
  const titles = plan.scenes.filter((s) => s.kind === "title");
  assert.deepEqual(titles.map((s) => s.surah), [9]);
  assert.equal(titles[0].text, "", "At-Tawbah opens without the basmala");
  assert.ok(!plan.scenes.some((s) => s.text === ayahText(index, 1, 1)), "the basmala is nowhere in the film");
  assert.equal(plan.scenes.find((s) => s.kind === "ayah")?.text, ayahText(index, 9, 1));
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
