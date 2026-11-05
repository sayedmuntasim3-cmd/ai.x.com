import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildTimeline, captionLines, toSrt } from "../src/timeline.mjs";

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
    { scene: "SC0001", shot: 1, start: 0, end: 3, rung: "R3", description: "", queries: ["mill"], status: "found", query: "mill", alternates: [], trace: [], pick: { id: "p1", source: "pexels", mediaUrl: "https://v/1.mp4", previewUrl: null, sourcePageUrl: "https://p/1", creator: null, durationSeconds: 5, width: 1920, height: 1080, licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: "https://p/1" } } },
  ] };
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md, media: /** @type {any} */ (media) }], voice: { SC0001: { durationSeconds: 6 } } });
  assert.deepEqual(t.video.map((v) => [v.type, v.start, v.end]), [["clip", 0, 3], ["card", 3, 6], ["card", 6, 9]]);
  assert.equal(t.video[0].motion, "push");
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
  // A 3.1 s take for a 2 s scene is sped up 15% (the cap); the rest is cut, and so are its captions.
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md }], voice: { SC0001: { durationSeconds: 3.1, alignment } } });
  const all = t.captions.flatMap((c) => c.words ?? []);
  assert.equal(all[1].start, Math.round((0.4 / 1.15) * 1000) / 1000);
  assert.ok(all.every((w) => w.end <= 2), "no caption runs past its scene");
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
