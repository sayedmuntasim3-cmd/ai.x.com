import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FORMATS, ayahOnScreen, filmText, wordTimesConfident } from "./quran-render.mjs";
import { ayahOffset, parseTanzilText } from "../engine/src/quran-meaning.mjs";

const data = new URL("../engine/data/quran/", import.meta.url);
const uthmani = parseTanzilText(readFileSync(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8")).ayat;
const surahNames = JSON.parse(readFileSync(new URL("surah-names.json", data), "utf8"));
const pickthall = JSON.parse(readFileSync(new URL("pickthall-1930.json", data), "utf8")).ayat;
const texts = { uthmani, simple: [], pickthall };
const F = FORMATS["1080p"];

const ayahWords = (surah, ayah) => ayahOnScreen(uthmani[ayahOffset(surah, ayah)], surah, ayah).split(/\s+/).filter(Boolean);
const planFor = (surah, ayah, words) => ({ scenes: [{ kind: "ayah", surah, ayah, start: 0, end: 8, spokenStart: 0.5, spokenEnd: 6.5, endSure: true, ...(words ? { words } : {}) }] });
const timed = (n, score = 0.9) => Array.from({ length: n }, (_, i) => ({ text: `w${i}`, start: 0.5 + i, end: 1.3 + i, score }));
const dialogues = (ass, style) => ass.split("\n").filter((l) => l.startsWith("Dialogue:") && l.includes(`,${style},`));

test("the .ass has real newlines, not literal backslash-n", () => {
  const ass = filmText(planFor(93, 3), uthmani, surahNames, { format: F, total: 12 }, texts);
  assert.ok(ass.split("\n").length > 10);
  assert.ok(!ass.includes("\\n"), "no literal \\n in the file");
  assert.ok(ass.startsWith("[Script Info]\n"));
});

test("highlight: one Dialogue per ayah, \\kf count = word count", () => {
  const n = ayahWords(93, 3).length;
  assert.ok(n > 1);
  const ass = filmText(planFor(93, 3, timed(n)), uthmani, surahNames, { format: F, total: 12, translation: "none", highlight: "word" }, texts);
  const d = dialogues(ass, "Ayah");
  assert.equal(d.length, 1, "exactly one Dialogue for the ayah");
  assert.equal((d[0].match(/\\kf\d+/g) ?? []).length, n);
  assert.ok(!ass.includes("AyahHighlighted"));
  assert.match(ass, /Style: Ayah,Amiri Quran,\d+,&H0060C8F0,&H00F0ECE4,/, "gold primary, soft white secondary");
});

test("no karaoke when word times are missing or not confident", () => {
  const n = ayahWords(93, 3).length;
  for (const words of [undefined, [], timed(n, 0.3)]) {
    const ass = filmText(planFor(93, 3, words), uthmani, surahNames, { format: F, total: 12, highlight: "word" }, texts);
    assert.equal(dialogues(ass, "Ayah").length, 1);
    assert.ok(!/\\kf?\d/.test(ass));
  }
  assert.equal(wordTimesConfident({ words: timed(2, 0.2) }), false);
  assert.equal(wordTimesConfident({ words: timed(2) }), true);
});

test("Pickthall line for 93:1 and the credit line", () => {
  assert.equal(pickthall[ayahOffset(93, 1)], "By the morning hours");
  const ass = filmText(planFor(93, 1), uthmani, surahNames, { format: F, total: 12, translation: "pickthall", highlight: "none" }, texts);
  assert.equal(dialogues(ass, "Meaning").length, 1);
  assert.ok(ass.includes("By the morning hours"));
  assert.ok(ass.includes("Quran text: Tanzil.net"));
  assert.ok(ass.includes("Translation: M. M. Pickthall (1930)"));
  const off = filmText(planFor(93, 1), uthmani, surahNames, { format: F, total: 12, translation: "none" }, texts);
  assert.equal(dialogues(off, "Meaning").length, 0);
  assert.ok(!off.includes("Pickthall"));
});
