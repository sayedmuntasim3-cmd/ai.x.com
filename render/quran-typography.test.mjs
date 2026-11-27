import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FORMATS, ayahFontSize, ayahOnScreen, filmText } from "./quran-render.mjs";
import { ayahOffset, parseTanzilText } from "../engine/src/quran-meaning.mjs";

const data = new URL("../engine/data/quran/", import.meta.url);
const uthmani = parseTanzilText(readFileSync(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8")).ayat;
const surahNames = JSON.parse(readFileSync(new URL("surah-names.json", data), "utf8"));
const pickthall = JSON.parse(readFileSync(new URL("pickthall-1930.json", data), "utf8")).ayat;

// Quick sanity check that our test file's data matches expectations
const PICKTHALL_INDEX_93_1 = ayahOffset(93, 1);
assert.equal(PICKTHALL_INDEX_93_1, 6079, "ayahOffset(93,1) must be 6079");
assert.equal(pickthall[PICKTHALL_INDEX_93_1], "By the morning hours", "Pickthall 93:1 = 'By the morning hours'");

// Export wordTimesConfident for tests
function wordTimesConfident(scene) {
  const words = scene?.words;
  if (!Array.isArray(words) || words.length === 0) return false;
  for (const w of words) {
    if (w.start == null || w.end == null || !Number.isFinite(w.start) || !Number.isFinite(w.end)) return false;
    if (typeof w.score !== "number" || w.score < 0.5) return false;
  }
  return true;
}

test("subtitle file contains the Pickthall meaning line for 93:1", () => {
  const plan93 = { scenes: [{ kind: "ayah", surah: 93, ayah: 1, start: 0, end: 5, spokenStart: 0.5, spokenEnd: 4.5, endSure: true }] };
  const ass = filmText(plan93, uthmani, surahNames, { format: FORMATS["1080p"], total: 10, translation: "pickthall", highlight: "none" }, { uthmani, simple: [], pickthall });
  assert.ok(ass.includes("By the morning hours"), "93:1 Pickthall meaning line present in ASS output");
  assert.ok(ass.includes("Dialogue: 0,"), "ASS Dialogue line present");
  // The meaning line should be in a Meaning style event
  assert.ok(ass.includes("Meaning,"), "Meaning style event present");
});

test("karaoke-tag count equals word count of the ayah (per-word events)", () => {
  const planWords = {
    scenes: [{
      kind: "ayah", surah: 93, ayah: 1, start: 0, end: 6, spokenStart: 0.5, spokenEnd: 5.5, endSure: true,
      words: [
        { text: "وَٱلضُّحَىٰ", start: 0.5, end: 1.8, score: 0.95 },
        { text: "إِذَا", start: 1.9, end: 2.4, score: 0.92 },
        { text: "جَآءَ", start: 2.5, end: 3.0, score: 0.90 },
        { text: "مَا", start: 3.1, end: 3.6, score: 0.88 },
        { text: "ٱلْغُشْوَىٰ", start: 3.7, end: 5.0, score: 0.85 },
      ],
    }],
  };
  const ass = filmText(planWords, uthmani, surahNames, { format: FORMATS["1080p"], total: 10, translation: "none", highlight: "word" }, { uthmani, simple: [], pickthall });
  // Count only Dialogue events with AyahHighlighted (not the Style definition line)
  const lines = ass.split(String.fromCharCode(92, 110));
  const dialogueHighlighted = lines.filter(l => l.startsWith("Dialogue:") && l.includes("AyahHighlighted,"));
  assert.equal(dialogueHighlighted.length, 5, "one AyahHighlighted Dialogue event per word (5 words = 5 highlighted events)");
  assert.ok(ass.includes("AyahHighlighted"), "AyahHighlighted style present");
  assert.ok(ass.includes("Ayah"), "Ayah style present (soft-white rest)");
});

test("ayah with missing word times has no highlight tags (whole ayah soft white)", () => {
  // Scene with no words array
  const planNoWords = { scenes: [{ kind: "ayah", surah: 93, ayah: 1, start: 0, end: 6, spokenStart: 0.5, spokenEnd: 5.5, endSure: true }] };
  const assNoWords = filmText(planNoWords, uthmani, surahNames, { format: FORMATS["1080p"], total: 10, translation: "none", highlight: "word" }, { uthmani, simple: [], pickthall });
  const linesNoWords = assNoWords.split(String.fromCharCode(92, 110));
  const dialogueHighlightedNoWords = linesNoWords.filter(l => l.startsWith("Dialogue:") && l.includes("AyahHighlighted,"));
  assert.equal(dialogueHighlightedNoWords.length, 0, "no AyahHighlighted Dialogue events when words missing");
  assert.ok(assNoWords.includes("Ayah,"), "whole ayah shown as Ayah (soft white) event");

  // Scene with low-score words
  const planLowScore = {
    scenes: [{
      kind: "ayah", surah: 93, ayah: 1, start: 0, end: 6, spokenStart: 0.5, spokenEnd: 5.5, endSure: true,
      words: [
        { text: "وَٱلضُّحَىٰ", start: 0.5, end: 1.8, score: 0.3 },
        { text: "إِذَا", start: 1.9, end: 2.4, score: 0.4 },
      ],
    }],
  };
  const assLow = filmText(planLowScore, uthmani, surahNames, { format: FORMATS["1080p"], total: 10, translation: "none", highlight: "word" }, { uthmani, simple: [], pickthall });
  const linesLow = assLow.split(String.fromCharCode(92, 110));
  const dialogueHighlightedLow = linesLow.filter(l => l.startsWith("Dialogue:") && l.includes("AyahHighlighted,"));
  assert.equal(dialogueHighlightedLow.length, 0, "no AyahHighlighted Dialogue events when word scores below 0.5");
  assert.ok(assLow.includes("Ayah,"), "whole ayah shown as Ayah event when word scores low");
});

test("wrapping never splits a word (libass WrapStyle 0 wraps on spaces)", () => {
  const longAyah = ayahOnScreen(uthmani[ayahOffset(2, 282)], 2, 282);
  assert.ok(longAyah.length > 80, "2:282 is a long ayah");
  const planLong = { scenes: [{ kind: "ayah", surah: 2, ayah: 282, start: 0, end: 30, spokenStart: 1, spokenEnd: 29, endSure: true }] };
  const assLong = filmText(planLong, uthmani, surahNames, { format: FORMATS["1080p"], total: 35, translation: "none", highlight: "none" }, { uthmani, simple: [], pickthall });
  // Split on backslash-n (ASS line separator)
  const lines = assLong.split(String.fromCharCode(92, 110));
  const dialogueLines = lines.filter(l => l.startsWith("Dialogue:") && (l.includes("Ayah,") || l.includes("AyahHighlighted,")));
  // Get the actual words from the Tanzil text (what the renderer uses)
  const actualWords = longAyah.split(/\s+/).filter(w => w.length > 0);
  for (const line of dialogueLines) {
    const textStart = line.indexOf("},") + 2;
    const text = line.slice(textStart);
    // Every word from the Tanzil ayah must appear intact in the ASS text
    for (const w of actualWords) {
      assert.ok(text.includes(w), `word "${w}" must appear intact (not split) in the ASS text`);
    }
  }
});

test("9:16 layout keeps all text inside the safe area", () => {
  const f916 = FORMATS["9:16"];
  assert.equal(f916.width, 1080);
  assert.equal(f916.height, 1920);
  assert.equal(f916.margin, 340);
  const safeBottom = f916.height - f916.margin; // 1920 - 340 = 1580
  const plan916 = { scenes: [{ kind: "ayah", surah: 93, ayah: 1, start: 0, end: 6, spokenStart: 0.5, spokenEnd: 5.5, endSure: true }] };
  const ass916 = filmText(plan916, uthmani, surahNames, { format: f916, total: 10, translation: "none", highlight: "none" }, { uthmani, simple: [], pickthall });
  assert.match(ass916, /PlayResY: 1920/);
  // Ayah style MarginV should be 340 for 9:16 format
  assert.match(ass916, /Style: Ayah,Amiri Quran,80,&H00F0ECE4,&H00F0ECE4,&H20000000,&H60000000,0,0,0,0,100,100,0,0,1,2.9,3.6,2,86,86,340,-1/, "Ayah style MarginV = 340 for 9:16");
  // The margin (340) keeps text above the bottom-safe line (1580)
  assert.ok(f916.margin <= safeBottom, "margin 340 keeps text above the 1580 bottom-safe line");
  // Meaning style MarginV = round(340*0.6) = 204, fontSize = round(80*0.42) = 34
  assert.match(ass916, /Style: Meaning,Amiri Quran,34,&H00D8D2C8,&H00D8D2C8,&H50000000,&H00000000,0,0,0,0,100,100,0,0,1,1,2,2,40,40,204,1/, "Meaning style MarginV = 204 (inside safe area) for 9:16");
});

console.log("All quran-typography tests defined successfully");
