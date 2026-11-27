import assert from "node:assert/strict";
import { test } from "node:test";
import { categoriesOf, eraOf, queryLadder, subjectOf } from "../src/picture-ladder.mjs";
import { chapterMedia, createUseHistory } from "../src/film-media.mjs";

const TOPIC = "Galloping Gertie: the fall of the Tacoma Narrows Bridge";

test("the subject, era and category come out of the film's title and the shot", () => {
  assert.equal(subjectOf(TOPIC), "Tacoma Narrows Bridge");
  assert.equal(subjectOf("Hoover Dam"), "Hoover Dam");
  assert.equal(eraOf("R3 thin, 1943"), "1940s");
  assert.equal(eraOf("no year"), "");
  assert.ok(categoriesOf("Tacoma Narrows Bridge").includes("suspension bridge"));
});

test("the ladder anchors a bare keyword to the subject and descends: subject, era, category, bare word last", () => {
  const ladder = queryLadder({ queries: ["thin"], description: "R3 thin, 1940s", topic: TOPIC });
  assert.equal(ladder[0], "Tacoma Narrows Bridge thin");
  assert.deepEqual(ladder.slice(1, 3), ["Tacoma Narrows Bridge", "Tacoma Narrows Bridge 1940s"]);
  assert.ok(ladder.includes("suspension bridge") && ladder.includes("1940s suspension bridge"));
  assert.equal(ladder.at(-1), "thin");
  // A query that already names the subject, or has several words, is not changed; without a topic nothing changes.
  assert.equal(queryLadder({ queries: ["Tacoma Narrows collapse"], topic: TOPIC })[0], "Tacoma Narrows collapse");
  assert.deepEqual(queryLadder({ queries: ["thin"] }), ["thin"]);
});

const row = (id, from, to, shots, q) => `**${id}** | 0:00:${String(from).padStart(2, "0")}-0:00:${String(to).padStart(2, "0")} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: ${shots} | SRC: Pixabay · Q1 "${q}" | LOOK: L`;
/** A provider that only knows the category "suspension bridge". */
const provider = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search(/** @type {string} */ q) {
  if (!/suspension bridge/i.test(q)) return [];
  return [{ id: `pexels:video:${q.length}`, source: "pexels", mediaType: "video", title: "Suspension bridge in wind", previewUrl: null, mediaUrl: "https://v/b.mp4", sourcePageUrl: "https://www.pexels.com/video/1/", creator: "Ana", license: "Pexels License", licenseUrl: null, durationSeconds: 8, width: 1920, height: 1080, attributionRequired: false }];
} };

test("a bare keyword that finds nothing alone finds the subject's category; a shot with nothing at all holds a strong picture, and says so", async () => {
  const md = [row("SC0001", 0, 8, "(1) R3 thin", "thin"), row("SC0002", 8, 16, "(1) R3 sang", "sang")].join("\n");
  const without = await chapterMedia({ chapter: "C1", markdown: md, providers: [provider], history: createUseHistory() });
  assert.deepEqual(without.shots.map((s) => s.status), ["missing", "missing"], "before: the bare words find nothing, two text cards");
  const withTopic = await chapterMedia({ chapter: "C1", markdown: md, providers: [provider], history: createUseHistory(), topic: TOPIC });
  assert.equal(withTopic.shots[0].status, "found");
  assert.equal(withTopic.shots[0].query, "suspension bridge");
  // The second shot is blocked by the 10-minute rule (same clip id): with holdWeak it takes the nearest strong pick, reported as reused.
  const held = await chapterMedia({ chapter: "C1", markdown: md, providers: [provider], history: createUseHistory(), topic: TOPIC, holdWeak: true });
  assert.ok(held.shots.every((s) => s.status === "found"));
  const reused = held.shots.filter((s) => s.reused);
  assert.equal(reused.length, held.stats.reused);
  for (const r of reused) assert.ok(r.trace.some((t) => t.provider === "held" && t.outcome === "reused"));
});
