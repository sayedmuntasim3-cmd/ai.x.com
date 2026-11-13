import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { normalizeArabic } from "../src/arabic.mjs";
import { AYAH_COUNTS } from "../src/quran.mjs";
import { LEXICON, MEANING_SOURCES, ayahMeaning, bareForms, literalThings, meaningTable, parseTanzilText, passageMeaning, planMeanings, themesOf } from "../src/quran-meaning.mjs";

const data = new URL("../data/quran/", import.meta.url);
const uthmaniFile = readFileSync(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8");
const uthmani = parseTanzilText(uthmaniFile);
const simple = JSON.parse(readFileSync(new URL("tanzil-quran-simple-1.0.2.json", data), "utf8"));
const pickthall = JSON.parse(readFileSync(new URL("pickthall-1930.json", data), "utf8"));
const texts = { uthmani: uthmani.ayat, simple, pickthall: pickthall.ayat };

/** The test surahs of stage Q2. */
const TEST_SURAHS = [1, 55, 93, 94, 95, 97, 112, 113, 114];

test("the Uthmani text is Tanzil 1.1, unchanged, with its notice, in mushaf order", () => {
  assert.equal(createHash("sha256").update(uthmaniFile).digest("hex"), "bf4f57b968d03f4131c070b1e285da9be0e0a108a21c910e872801ca273312c8");
  assert.equal(uthmani.ayat.length, 6236);
  assert.match(uthmani.notice, /Tanzil Quran Text \(Uthmani, Version 1\.1\)/);
  assert.match(uthmani.notice, /CHANGING IT IS NOT ALLOWED/);
  assert.equal(normalizeArabic(uthmani.ayat[0]), "بسم الله الرحمن الرحيم");
  assert.ok(/[\u0671]/.test(uthmani.ayat[0]), "Uthmani spelling: alef wasla");
  assert.throws(() => parseTanzilText(uthmaniFile.replace(/^#.*$/gm, "")), /notice/);
  assert.throws(() => parseTanzilText(uthmaniFile.replace("1|2|", "1|3|")), /out of order/);
});

test("the Uthmani and Simple texts agree ayah by ayah (letter skeleton), apart from known Uthmani spellings", () => {
  // Without vowels, alef, waw, ya and hamza, the two editions spell almost every ayah alike.
  const skeleton = (/** @type {string} */ s) => normalizeArabic(s.replace(/ٰ/g, "")).replace(/[اويء ]/g, "");
  let same = 0;
  /** @type {string[]} */
  const differ = [];
  uthmani.ayat.forEach((u, k) => { if (skeleton(u) === skeleton(simple[k])) same += 1; else differ.push(String(k)); });
  assert.ok(same >= 6150, `${same} of 6236`);
  // Each that differs still shares nearly all of its letters (al-layl written with one lam, and the like).
  for (const k of differ.map(Number)) {
    const a = skeleton(uthmani.ayat[k]), b = skeleton(simple[k]);
    assert.ok(Math.abs(a.length - b.length) <= 6, `ayah index ${k}`);
  }
});

test("Pickthall: one translation per ayah, from the public-domain Gutenberg edition, with its fixes listed", () => {
  assert.equal(pickthall.ayat.length, 6236);
  assert.equal(pickthall.published, 1930);
  assert.match(pickthall.source, /gutenberg\.org\/ebooks\/16955/);
  assert.match(pickthall.licence, /Public domain/);
  assert.equal(pickthall.labelsFixed.length, 4);
  assert.equal(pickthall.ayat[0], "In the name of Allah, the Beneficent, the Merciful.");
  assert.ok(pickthall.ayat.every((/** @type {string} */ a) => a.length > 2 && !/(^| )[YS]: /.test(a)));
  let k = 0;
  for (let s = 1; s <= 114; s += 1) k += AYAH_COUNTS[s - 1];
  assert.equal(k, pickthall.ayat.length);
});

test("word forms: conjunctions, prepositions, the article and pronoun endings come off", () => {
  assert.ok(bareForms("والتين").includes("تين"));
  assert.ok(bareForms("بالارض").includes("ارض"));
  assert.ok(bareForms("لليل").includes("ليل"));
  assert.ok(bareForms("سماواته").includes("سماوات"));
  assert.ok(!bareForms("وجني", { suffixes: false }).includes("جن"));
});

test("literal things come from the Arabic, with the word that names them", () => {
  const fig = literalThings(/** @type {string} */ (ayahMeaning(texts, 95, 1)?.simple));
  assert.deepEqual(fig.things.map((t) => t.thing), ["the fig", "the olive"]);
  assert.ok(fig.things.every((t) => t.source === "arabic-text"));
  const sun = ayahMeaning(texts, 55, 5);
  assert.deepEqual(sun?.things.map((t) => t.thing), ["sun", "moon"]);
  const bees = ayahMeaning(texts, 16, 68);
  assert.ok(bees?.things.some((t) => t.thing === "bees" && t.living), "bees are living: shown only when the owner allows animals");
  const gardens = ayahMeaning(texts, 55, 46);
  assert.ok(gardens?.things.some((t) => t.thing === "gardens" && t.symbolic), "gardens of the Hereafter are only an earthly symbol");
});

test("the unseen is flagged from the Arabic; al-jannah and al-jinnah are not confused with anything visible", () => {
  assert.deepEqual(ayahMeaning(texts, 97, 4)?.unseen, ["angels", "the Spirit"]);
  assert.deepEqual(ayahMeaning(texts, 114, 6)?.unseen, ["Paradise or the jinn"]);
  assert.equal(ayahMeaning(texts, 114, 6)?.things.length, 0);
  assert.deepEqual(ayahMeaning(texts, 55, 54)?.unseen, ["the Hereafter"], "jana (fruit) is not jinn");
  assert.ok(ayahMeaning(texts, 1, 4)?.unseen.length, "the Day of Judgment");
  assert.equal(ayahMeaning(texts, 55, 5)?.unseen.length, 0);
});

test("themes come from the translation by fixed rules, each with its reason and source", () => {
  assert.deepEqual(themesOf("Show us the straight path,").map((t) => t.theme), ["guidance"]);
  const t = ayahMeaning(texts, 94, 5)?.themes ?? [];
  assert.deepEqual(t.map((x) => x.theme), ["hardship and ease"]);
  assert.equal(t[0].source, "pickthall");
  assert.ok(t[0].because.length > 2);
  assert.deepEqual(themesOf("By the night when it is stillest").length, 0, "night is not 'nigh'");
  assert.ok(!themesOf("Wherein is every kind of fruit").some((x) => x.theme === "mercy and forgiveness"));
});

test("Q2 exit: every ayah of the test surahs has its text, translation, things or theme with a source, or a listed gap", () => {
  const ranges = TEST_SURAHS.map((s) => ({ surah: s, fromAyah: 1, toAyah: AYAH_COUNTS[s - 1] }));
  const p = passageMeaning(texts, ranges);
  assert.equal(p.ayat.length, TEST_SURAHS.reduce((n, s) => n + AYAH_COUNTS[s - 1], 0));
  for (const a of p.ayat) {
    assert.ok(a.uthmani.length > 2 && a.simple.length > 2, `${a.surah}:${a.ayah} text`);
    assert.ok(a.translation?.text, `${a.surah}:${a.ayah} translation`);
    for (const th of a.themes) assert.ok(th.source && th.because);
    for (const x of a.things) assert.equal(x.source, "arabic-text");
    assert.ok(a.things.length || a.themes.length || a.gaps.length, `${a.surah}:${a.ayah} has nothing and no gap`);
  }
  assert.equal(p.gaps.length, p.summary.gaps);
  assert.ok(p.summary.withThings >= 25 && p.summary.withThemes >= 55, JSON.stringify(p.summary));
  assert.match(p.tafsir, /No tafsir/);
  const table = meaningTable(p);
  assert.equal(table.split("\n").length, p.ayat.length + 2);
});

test("sources are recorded; the plan's ayat get Pickthall as a meaning the adab guard accepts", () => {
  for (const key of ["uthmani", "simple", "pickthall", "lexicon"]) {
    const s = /** @type {any} */ (MEANING_SOURCES)[key];
    assert.ok(s.name && s.edition && s.source && s.licence && s.mayShow, key);
  }
  assert.equal(MEANING_SOURCES.tafsir, null);
  const plan = { scenes: [{ id: "Q0001", kind: "title", surah: 95, ayah: null }, { id: "Q0002", kind: "ayah", surah: 95, ayah: 1 }] };
  const m = planMeanings(plan, texts);
  assert.deepEqual(Object.keys(m), ["Q0002"]);
  assert.equal(m.Q0002.allowsUse, true);
  assert.equal(m.Q0002.text, "By the fig and the olive,");
  // Every lexicon entry has forms and something to search for.
  for (const e of LEXICON) assert.ok(e.forms.length && e.look.length, e.thing);
});
