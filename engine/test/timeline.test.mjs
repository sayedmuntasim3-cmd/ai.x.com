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
