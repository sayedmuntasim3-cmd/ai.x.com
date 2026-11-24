import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildTimeline, captionLines, toSrt, cardText } from "../src/timeline.mjs";

const USA = new URL("../../productions/ramesh-babu/USA/", import.meta.url);
const plan = JSON.parse(readFileSync(new URL("s3-chapters.json", USA), "utf8"));
const chapters = plan.map((/** @type {any} */ c) => ({ id: c.id, markdown: readFileSync(new URL(`s5-${c.id}.md`, USA), "utf8") }));

test("the 45-minute USA film becomes a frame-exact edit list with no gap or overlap", () => {
  const t = buildTimeline({ chapters });
  assert.equal(t.frames, 2700 * 30);
  assert.equal(t.stats.scenes, 270);
  let at = 0;
  for (const v of t.video) {
    assert.ok(v.frames > 0, v.id);
    assert.equal(Math.round(v.start * 30), at, `${v.id} starts where the previous shot ends`);
    at += v.frames;
  }
  assert.ok(t.video.some((v) => v.type === "black"), "a written cut to black stays black");
  assert.equal(t.video[0].text, "BENGALURU, INDIA · 2011", "a card shows the scene's on-screen text");
  assert.ok(t.captions.every((c) => c.text.length <= 42 && c.end > c.start));
});

test("untimed shots share the scene, picked clips are used, and voice length sets the captions", () => {
  const md = `**SC0001** | 0:00:00-0:00:09 | C1 | b | E | C01 | NARR: One two three. Four five six. | W 6/6 | ANCHOR: x | SHOTS: (1) R3 mill; (2) R3 river; (3) R1 card "THE MILL" | MOTION: 1.05x push | LOOK: L`;
  const media = { chapter: "C1", providers: ["pexels"], repeatWindowSeconds: 600, stats: { shots: 2, found: 1, missing: 1, noQuery: 0 }, shots: [
    { scene: "SC0001", shot: 1, start: 0, end: 3, rung: "R3", description: "", queries: ["mill"], status: "found", query: "mill", alternates: [], trace: [], why: { by: "OpenCLIP ViT-B/32", relevance: 0.41, total: 4.3 }, pick: { id: "p1", source: "pexels", mediaUrl: "https://v/1.mp4", previewUrl: null, sourcePageUrl: "https://p/1", creator: null, durationSeconds: 5, width: 1920, height: 1080, licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: "https://p/1" } } },
  ] };
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md, media: /** @type {any} */ (media) }], voice: { SC0001: { durationSeconds: 6 } } });
  assert.deepEqual(t.video.map((v) => [v.type, v.start, v.end]), [["clip", 0, 3], ["card", 3, 6], ["card", 6, 9]]);
  assert.equal(t.video[0].motion, "push");
  assert.equal(t.video[0].relevance, 0.41, "the eyes' relevance reaches the shot, so the critic can gate on it");
  assert.equal(t.video[0].sourceIn, 1, "a 5 s clip for a 3 s shot starts 1 s in, in its steady middle");
  assert.equal(t.video[2].text, "THE MILL");
  assert.ok(t.notes.some((n) => n.startsWith("SC0001-2: no clip")));
  assert.equal(t.captions[t.captions.length - 1].end, 6, "captions end when the voice ends, not the scene");
});

test("captions break at sentence ends and SRT is well formed", () => {
  const c = captionLines("This first sentence is long enough. Then a much longer sentence that has to wrap onto another line.", 0, 10);
  assert.equal(c[0].text, "This first sentence is long enough.");
  assert.ok(c.length >= 3 && c.every((l) => l.text.length <= 42));
  assert.equal(c[c.length - 1].end, 10);
  assert.equal(toSrt([{ start: 0, end: 1.5, text: "Hi" }, { start: 3661.25, end: 3662, text: "There" }]), "1\n00:00:00,000 --> 00:00:01,500\nHi\n\n2\n01:01:01,250 --> 01:01:02,000\nThere\n");
});

test("music cues follow the MUS field: in at, hard stop, drop-outs, and one segment across scenes", async () => {
  const { sceneMusic } = await import("../src/timeline.mjs");
  assert.deepEqual(sceneMusic("M01 in at 0:00:02, 120 BPM pulse", 0, 8), { cue: "M01", start: 2, end: 8 });
  assert.deepEqual(sceneMusic("M01 hard stop at 0:00:29.0, then 1 s SIL-2", 22, 30), { cue: "M01", start: 22, end: 29 });
  assert.equal(sceneMusic("M01 drops out with the black (SIL-3)", 15, 22), null);
  assert.equal(sceneMusic("none", 0, 5), null);
  assert.equal(sceneMusic("", 0, 5), null);
  const t = buildTimeline({ chapters });
  assert.deepEqual(t.music.slice(0, 3), [{ cue: "M01", start: 0, end: 15 }, { cue: "M01", start: 22, end: 29 }, { cue: "M02", start: 30, end: 75 }]);
});

test("sound effects land on their cut or word; ambience lies under the scene", async () => {
  const { sceneSounds } = await import("../src/timeline.mjs");
  const scene = { sc: "SC0004", start: 22, end: 30, narration: "He kept the shop open and put up the sign again" };
  const events = sceneSounds('SND-AMB-03 rain on glass; SND-FX-05 snip on cut 2; SND-FX-06 heavy door thud on "put up"; all sound out at the end', scene, [22, 25, 27.5]);
  assert.deepEqual(events.map((e) => [e.token, e.kind, e.start]), [["SND-AMB-03", "bed", 22], ["SND-FX-05", "hit", 25], ["SND-FX-06", "hit", 22 + (8 * 6) / 11]].map(([t, k, s]) => [t, k, Math.round(Number(s) * 1000) / 1000]));
  assert.deepEqual(sceneSounds("", scene, []), []);
});

test("split cards show both versions side by side, from the shot's own description", async () => {
  const { splitPanels } = await import("../src/timeline.mjs");
  assert.deepEqual(splitPanels('R1 split card "a relative ran it / it was leased out" in GRAY'), ["a relative ran it", "it was leased out"]);
  assert.deepEqual(splitPanels('two GRAY options in a FX-SPLIT: "a relative ran it (YourStory)" / "his mother leased it (India TV)"; no names'), ["a relative ran it", "his mother leased it"]);
  assert.deepEqual(splitPanels('header "STAFF, AS REPORTED", kinetic "ABOUT 120–300", then two columns, "about 120" and "about 300", each with its chip'), ["about 120", "about 300"]);
  assert.equal(splitPanels('R1 card "one thing"'), null);
  const t = buildTimeline({ chapters });
  const split = t.video.filter((v) => v.split);
  assert.deepEqual(split.map((v) => [v.id, v.text, v.split]), [
    ["SC0019-2", "", ["a relative ran it", "it was leased out"]],
    ["SC0027-1", "Who ran the shop?", ["a relative ran it", "his mother leased it"]],
    ["SC0144-2", "WHICH CAME FIRST?", ["COMPANY · April 12, 2004", "LUXURY CAR · 2004"]],
    ["SC0168-2", "STAFF, AS REPORTED", ["about 120", "about 300"]],
    ["SC0173-2", "HUNDREDS APART", ["INDIA TV · about 2017", "RUSHLANE · 2017"]],
  ], "every split in the USA film, with a real heading (never a stray quote such as \"; \")");
});

test("chapter breaks and written dissolves dip through black; slow motion and chapter titles come from the script", async () => {
  const { slowMotion } = await import("../src/timeline.mjs");
  const { lookFor } = await import("../src/formats.mjs");
  assert.deepEqual(["0.5x slow", "slow motion pour", "half speed", "1.08x push", "speed ramp", ""].map(slowMotion), [0.5, 0.6, 0.5, 1, 1, 1]);
  assert.deepEqual(["dramatized-story", "motivational-life-story", "history-epic", "money-explainer", null].map(lookFor), ["cinematic", "cinematic", "archive", "documentary", "documentary"]);
  const t = buildTimeline({ chapters: chapters.map((c, i) => ({ ...c, title: ["The Shop", "The Chair", "One Used Van", "The Luxury Bet", "The Ghost and the Bill", "Still at the Chair"][i] })), look: "cinematic" });
  assert.equal(t.frames, 81000, "dips and titles never change the length");
  assert.equal(t.look, "cinematic");
  assert.deepEqual(t.video.filter((v) => v.chapterTitle).map((v) => v.chapterTitle), ["Chapter 2 · The Chair", "Chapter 3 · One Used Van", "Chapter 4 · The Luxury Bet", "Chapter 5 · The Ghost and the Bill", "Chapter 6 · Still at the Chair"]);
  const c2 = t.video.findIndex((v) => v.chapterTitle === "Chapter 2 · The Chair");
  assert.ok(t.video[c2].fadeIn && t.video[c2 - 1].fadeOut, "a chapter break fades out and back in");
  assert.ok(t.video.filter((v) => v.fadeIn).length > 5, "written dissolves dip too");
  assert.ok(t.video.every((v) => !v.fadeIn || v.fadeIn <= v.frames / 30 / 3 + 1e-9), "a dip never takes more than a third of a shot");
});

test("captions land on the voice's own word timings, sped up exactly as the renderer speeds the voice", async () => {
  const { wordsFromAlignment, captionsFromWords } = await import("../src/timeline.mjs");
  const text = "The mill opens. It never stops.";
  const chars = [...text];
  const alignment = { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.1), character_end_times_seconds: chars.map((_, i) => i * 0.1 + 0.1) };
  const words = wordsFromAlignment(alignment, 10, 1);
  assert.deepEqual(words.slice(0, 2), [{ text: "The", start: 10, end: 10.3 }, { text: "mill", start: 10.4, end: 10.8 }]);
  assert.equal(words.length, 6);
  assert.deepEqual(captionsFromWords(words, 16).map((c) => c.text), ["The mill opens.", "It never stops."]);

  const md = `**SC0001** | 0:00:00-0:00:02 | C1 | b | E | C01 | NARR: ${text} | W 6/5 | ANCHOR: x | SHOTS: (1) R1 card | LOOK: L`;
  // With the script's times kept, a 3.1 s take for a 2 s scene is sped up 15% (the cap); the rest is cut, and so are its captions.
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md }], voice: { SC0001: { durationSeconds: 3.1, alignment } }, fitVoice: false });
  const all = t.captions.flatMap((c) => c.words ?? []);
  assert.equal(all[1].start, Math.round((0.4 / 1.15) * 1000) / 1000);
  assert.ok(all.every((w) => w.end <= 2), "no caption runs past its scene");
  // By default the scene follows the take: nothing sped up, nothing cut.
  const fitted = buildTimeline({ chapters: [{ id: "C1", markdown: md }], voice: { SC0001: { durationSeconds: 3.1, alignment } } });
  const heard = fitted.captions.flatMap((c) => c.words ?? []);
  assert.ok(Math.abs(fitted.durationSeconds - 3.45) <= 1 / 30, "3.1 s take + breath, to the frame");
  assert.equal(heard[1].start, 0.4);
  assert.equal(heard.length, 6);
  const estimated = buildTimeline({ chapters: [{ id: "C1", markdown: md }] });
  assert.ok(estimated.captions.every((c) => c.words && c.words.length > 0), "without timings, every word still gets an estimated time");
});

test("v3 delivery tags in a take's timings never become caption words", async () => {
  const { wordsFromAlignment } = await import("../src/timeline.mjs");
  const chars = [..."[softly] He kept it."];
  const words = wordsFromAlignment({ characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.05) });
  assert.deepEqual(words.map((w) => w.text), ["He", "kept", "it."]);
});

test("the script's transitions become whips, slides, zooms and flashes; cuts and dips stay what they are", async () => {
  const { transitionFor } = await import("../src/timeline.mjs");
  assert.equal(transitionFor("whip pan left on the beat"), "whip");
  assert.equal(transitionFor("zoom-through transition into the map"), "zoom");
  assert.equal(transitionFor("slide left"), "slide");
  assert.equal(transitionFor("white flash"), "flash");
  assert.equal(transitionFor("hard cut on the beat"), null);
  assert.equal(transitionFor("match cut from the comb teeth"), null);
  const md = [
    "**SC0001** | 0:00:00-0:00:03 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card \"ONE\" | TRANS: hard cut | LOOK: L",
    "**SC0002** | 0:00:03-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card \"TWO\" | TRANS: whip pan | LOOK: L",
    "**SC0003** | 0:00:06-0:00:09 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card \"THREE\" | TRANS: dissolve | LOOK: L",
  ].join("\n");
  const { buildTimeline: build } = await import("../src/timeline.mjs");
  const t = build({ chapters: [{ id: "C1", markdown: md }] });
  assert.deepEqual(t.video.map((v) => v.transition ?? null), [null, "whip", null], "a dissolve stays a dip, never a whip on top of it");
  assert.ok(t.video[2].fadeIn);
});

test("a map shot with coordinates becomes an animated map; without them it stays a card", async () => {
  const { buildTimeline: build, mapPlace } = await import("../src/timeline.mjs");
  assert.deepEqual(mapPlace("R1 FX-MAP Bengaluru (12.97, 77.59) pin drops"), { lat: 12.97, lon: 77.59, label: "Bengaluru" });
  assert.deepEqual(mapPlace("R1 map \"Cairo\" 30.04°N 31.23°E"), { lat: 30.04, lon: 31.23, label: "Cairo" });
  assert.deepEqual(mapPlace("R1 locator, Lima 12.05°S 77.04°W"), { lat: -12.05, lon: -77.04, label: "Lima" });
  assert.equal(mapPlace("R1 FX-MAP the old silk road"), null);
  assert.equal(mapPlace("(120, 400)"), null, "impossible coordinates are refused");
  const md = [
    "**SC0001** | 0:00:00-0:00:03 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 FX-MAP Bengaluru (12.97, 77.59) | LOOK: L",
    "**SC0002** | 0:00:03-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 FX-MAP \"the old silk road\" | LOOK: L",
  ].join("\n");
  const t = build({ chapters: [{ id: "C1", markdown: md }] });
  assert.deepEqual(t.video[0].map, { lat: 12.97, lon: 77.59, label: "Bengaluru" });
  assert.equal(t.video[1].map, undefined);
  assert.equal(t.video[1].type, "card");
});

test("a map shot that travels between two places becomes a route", async () => {
  const { mapRoute, mapPlaces } = await import("../src/timeline.mjs");
  assert.deepEqual(mapRoute("R1 FX-MAP route Mumbai (19.07, 72.88) to London (51.51, -0.13)"), { from: { lat: 19.07, lon: 72.88, label: "Mumbai" }, to: { lat: 51.51, lon: -0.13, label: "London" } });
  assert.equal(mapRoute("R1 FX-MAP Cairo (30.04, 31.23)"), null, "one place is not a route");
  assert.equal(mapPlaces("R1 FX-MAP Lima 12.05°S 77.04°W and Quito 0.18°S 78.47°W").length, 2);
});

test("the edit's sound design follows the edit: whoosh into whips, boom under flashes, impact on counters, riser into chapters, never crowded", async () => {
  const { buildTimeline: build } = await import("../src/timeline.mjs");
  const L = (/** @type {number} */ n, /** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ rest) => `**SC000${n}** | 0:00:${String(a).padStart(2, "0")}-0:00:${String(b).padStart(2, "0")} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | ${rest} | LOOK: L`;
  const c1 = [L(1, 0, 4, "SHOTS: (1) R1 card \"ONE\""), L(2, 4, 8, "SHOTS: (1) R1 card \"TWO\" | TRANS: whip pan"), L(3, 8, 9, "SHOTS: (1) R1 counter card \"400 CARS\" | FX: FX-COUNTER")].join("\n");
  const c2 = L(4, 9, 14, "SHOTS: (1) R1 card \"FOUR\" | TRANS: white flash").replace("| C1 |", "| C2 |");
  const t = build({ chapters: [{ id: "C1", markdown: c1, title: "One" }, { id: "C2", markdown: c2, title: "Two" }] });
  const auto = t.sfx.filter((e) => e.token.startsWith("AUTO-")).map((e) => [e.token, e.start, e.scene]);
  assert.deepEqual(auto, [["AUTO-WHOOSH", 3.8, "SC0001"], ["AUTO-IMPACT", 8.05, "SC0003"]], "the riser at 7.4 s and the boom at 9 s are dropped: each would land within 1.5 s of another sound");
  const quiet = build({ chapters: [{ id: "C1", markdown: c1 }], autoSound: false });
  assert.equal(quiet.sfx.filter((e) => e.token.startsWith("AUTO-")).length, 0, "it can be switched off");
});

test("a chart is drawn only from numbers the shot writes; a highlight only on words the card shows", async () => {
  const { chartData, highlightFor } = await import("../src/timeline.mjs");
  assert.deepEqual(chartData("R1 FX-CHART \"Users\" Facebook: 3,000 million; TikTok: 1,500 million")?.bars, [{ label: "Facebook", value: 3000, text: "3,000 million" }, { label: "TikTok", value: 1500, text: "1,500 million" }]);
  assert.equal(chartData("R1 FX-CHART a growth chart"), null, "no data, no chart");
  assert.equal(chartData("R1 FX-CHART \"x\" A: 1"), null, "one bar is not a chart");
  assert.equal(highlightFor("R1 FX-PAPER, highlight \"on all counts\"", "", "FX-PAPER", "Guilty on all counts"), "on all counts");
  assert.equal(highlightFor("R1 card, highlight \"not there\"", "", "", "Guilty"), "", "a phrase the card does not show is ignored");
  assert.equal(highlightFor("R1 card", "", "FX-HIGHLIGHT", "He lost everything"), "He lost everything");
});

test("scene times follow the takes: a long take borrows the spare time of its chapter, never sped up or cut", async () => {
  const { fitToVoice, VOICE_TAIL } = await import("../src/timeline.mjs");
  const line = (/** @type {string} */ sc, /** @type {string} */ a, /** @type {string} */ b, /** @type {string} */ narr) => `**${sc}** | ${a}-${b} | C1 | b | E | C01 | NARR: ${narr} | W 4/4 | ANCHOR: x | SHOTS: (1) R1 card "A"; (2) ${b === "0:00:10" ? "0:00:08-0:00:10 " : ""}R1 card "B" | LOOK: L`;
  const md = [line("SC0001", "0:00:00", "0:00:04", "One two three four."), line("SC0002", "0:00:04", "0:00:10", "Five six seven eight."), `**SC0003** | 0:00:10-0:00:13 | C1 | b | E | C01 | NARR: — | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card "C" | LOOK: L`].join("\n");
  const voice = { SC0001: { durationSeconds: 5.65 }, SC0002: { durationSeconds: 3.65 } };
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md, edit: /** @type {any} */ ({ chapter: "C1", by: "edit-director", problems: [], scenes: [{ scene: "SC0002", punchIns: [9], shakes: [], hits: [] }] }) }], voice });
  const starts = Object.fromEntries(t.narration.map((n) => [n.scene, [n.start, n.end]]));
  // SC0001 needs 6 s (5.65 + breath), 2 more than written; SC0002 needs 4 of its 6, so it gives 2. The chapter keeps its 13 s.
  assert.deepEqual(starts.SC0001, [0, 6]);
  assert.deepEqual(starts.SC0002, [6, 10]);
  assert.equal(t.durationSeconds, 13);
  assert.equal(t.timing?.stretched, 1);
  assert.equal(t.timing?.shortened, 1);
  // The wordless scene keeps its 3 s; SC0002's timed shot and the director's punch-in move with the new clock.
  assert.deepEqual(t.video.filter((v) => v.scene === "SC0003").map((v) => [v.start, v.end]), [[10, 13]]);
  const b = t.video.find((v) => v.scene === "SC0002" && v.shot === 2);
  assert.ok(b && Math.abs(b.start - (6 + (4 * 4) / 6)) < 0.04, "a timed shot keeps its place inside its scene");
  assert.ok(t.video.some((v) => v.punchIns?.length), "the director's punch-in is still placed");
  // A chapter with no spare time grows instead: the take is never cut.
  const tight = fitToVoice([[{ sc: "A", start: 0, end: 4, wordless: false }, { sc: "B", start: 4, end: 8, wordless: false }]], { A: { durationSeconds: 5 }, B: { durationSeconds: 4 } });
  assert.equal(tight.map(8), 8 + 1 + 2 * VOICE_TAIL);
  assert.equal(tight.report.grownChapters, 1);
  assert.equal(tight.map(20), 20 + 1 + 2 * VOICE_TAIL, "later chapters shift by the growth");
});

test("card text: quotes are paired in order, escaped quotes read as quotes, a source chip is the last choice", () => {
  // A long first quote once made the parser pair its closing mark with the next quote, so the writer's note showed.
  const long = "Dollar figures: rupees at that year's average rate (Federal Reserve Bank of St. Louis), then adjusted for US inflation to 2026 dollars (BLS CPI-U).";
  assert.equal(cardText("", `"${long}" (card, hold 8 s ≥ (20 ÷ 3) + 1 = 7.7 s); second line "C10 · fred.stlouisfed.org"`), long);
  assert.equal(cardText("", String.raw`"\"billionaire barber\" (headlines)" with chip "C06 · deccanchronicle.com 2016"`), "'billionaire barber' (headlines)");
  assert.equal(cardText("", `chip "C14 · rtt.co.in" then "rtt.co.in · company site"`), "rtt.co.in · company site");
  assert.equal(cardText("", `chip "C14 · rtt.co.in"`), "C14 · rtt.co.in");
  assert.equal(cardText(`R1 card "THE SHOP STAYED OPEN."`, ""), "THE SHOP STAYED OPEN.");
});

test("a disclosure label (\"Illustrative\") is a small tag on footage, never the card's headline", async () => {
  const { disclosureTag } = await import("../src/timeline.mjs");
  assert.equal(cardText("", `"+ TAX" (red); "Illustrative" under the sedan`), "+ TAX");
  assert.equal(cardText("", `"Illustrative"`), "");
  assert.equal(disclosureTag(`"+ TAX"; "Illustrative" under the sedan`), "Illustrative");
  assert.equal(disclosureTag(`"Paraphrased throughout"`), "Paraphrased throughout");
  assert.equal(disclosureTag(`"Still cutting hair · 2025"`), "");
});

test("a hit never lands on a spoken word: it moves to the gap after the word, or is left out", async () => {
  const { keepOffSpeech } = await import("../src/timeline.mjs");
  const words = [{ text: "He", start: 1, end: 1.3 }, { text: "kept", start: 1.35, end: 1.8 }, { text: "the", start: 2.2, end: 2.4 }, { text: "shop", start: 2.45, end: 2.9 }];
  const sounds = [
    { token: "AUTO-IMPACT", kind: "hit", scene: "S", start: 1.6, end: 5 },
    { token: "AUTO-BOOM", kind: "hit", scene: "S", start: 2.6, end: 5 },
    { token: "AUTO-WHOOSH", kind: "hit", scene: "S", start: 3.4, end: 5 },
    { token: "AUTO-RISER", kind: "hit", scene: "S", start: 1.2, end: 2.8 },
    { token: "SND-AMB-01", kind: "bed", scene: "S", start: 0, end: 5 },
  ];
  const r = keepOffSpeech(sounds, words);
  assert.deepEqual(r.moved.map((m) => [m.token, m.from, m.to]), [["AUTO-IMPACT", 1.6, 1.728], ["AUTO-BOOM", 2.6, 2.828]]);
  assert.equal(r.dropped.length, 0);
  assert.deepEqual(r.sounds.map((x) => [x.token, x.start]), [["AUTO-IMPACT", 1.728], ["AUTO-BOOM", 2.828], ["AUTO-WHOOSH", 3.4], ["AUTO-RISER", 1.2], ["SND-AMB-01", 0]], "the whoosh in the pause, the riser and the bed stay");
  const vowel = (w) => [w.start + 0.15 * (w.end - w.start), w.start + 0.75 * (w.end - w.start)];
  assert.ok(r.sounds.filter((x) => x.kind === "hit" && x.token !== "AUTO-RISER").every((x) => words.every((w) => { const [a, b] = vowel(w); return x.start <= a || x.start >= b; })), "no hit begins on a vowel (a riser ends on the cut, so it is exempt)");

  // Two hits inside one vowel: the first takes the release after it, the second has nowhere to go and is left out.
  const packed = keepOffSpeech([
    { token: "AUTO-IMPACT", kind: "hit", scene: "S", start: 1.6, end: 5 },
    { token: "AUTO-CLICK", kind: "hit", scene: "S", start: 1.62, end: 5 },
  ], [{ text: "He", start: 1, end: 1.3 }, { text: "kept", start: 1.35, end: 2.0 }]);
  assert.deepEqual(packed.dropped.map((d) => [d.token, d.start]), [["AUTO-CLICK", 1.62]]);
  assert.deepEqual(packed.sounds.map((s) => [s.token, s.start]), [["AUTO-IMPACT", 1.878]], "the second hit cannot share the release after the word");
});

test("ambience follows the place a shot shows, and the room empties before a reveal", async () => {
  const { AMBIENCE, ambienceFor, breathWindows } = await import("../src/timeline.mjs");
  assert.equal(ambienceFor("R3 STK-01: a crowded marketplace at noon, stalls and bicycles"), AMBIENCE.crowd);
  assert.equal(ambienceFor("R1: a bare interrogation room, one table and two chairs"), AMBIENCE.room);
  assert.equal(ambienceFor("the courtroom in Delhi, the judge's bench"), AMBIENCE.hall);
  assert.equal(ambienceFor("open sea under a grey sky, wind and spray"), AMBIENCE.wind);
  assert.equal(ambienceFor("R1 card: \"$4 BILLION\" in white type on black"), null, "nothing is guessed where no place is written");
  assert.deepEqual(breathWindows([
    { token: "AUTO-BOOM", kind: "hit", start: 20, end: 22.4 },
    { token: "AUTO-IMPACT", kind: "hit", start: 30, end: 31 },
  ]), [{ start: 19.1, end: 20 }], "a beat of held breath before the flash, nothing before an impact");

  // The ambience of a scene the script left without one comes from its own shots.
  const line = (n, a, b, rest) => `**SC000${n}** | 0:00:0${a}-0:00:0${b} | C1 | b | E | C01 | NARR: There is one street | W 0/0 | ANCHOR: x | ${rest} | LOOK: L`;
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: [line(1, 0, 3, "SHOTS: (1) R3 a crowd of pilgrims at the festival gate"), line(2, 4, 7, "SFX: SND-AMB-02 shop room tone; SHOTS: (1) R1 the room")].join("\n") }] });
  assert.deepEqual(t.sfx.filter((e) => e.kind === "bed").map((e) => [e.token, e.scene]), [["AUTO-AMB-CROWD", "SC0001"], ["SND-AMB-02", "SC0002"]], "the script's own ambience wins");
});
