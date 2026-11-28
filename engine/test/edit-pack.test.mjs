import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySwaps,
  buildEditPack,
  candidateOf,
  candidatesFor,
  changedParts,
  checkEditPack,
  checkSwaps,
  EDIT_PACK_VERSION,
  MAX_CANDIDATES,
  mediaFromPack,
  packParts,
  partOfShot,
  shotRows,
  wordsIn,
} from "../src/edit-pack.mjs";

/** The words of a two-shot scene, as the speech-to-text step writes them (run/words.json). */
const WORDS = [
  { text: "The", start: 0.2, end: 0.4 },
  { text: "tower", start: 0.4, end: 0.9 },
  { text: "fell", start: 0.9, end: 1.3 },
  { text: "in", start: 1.4, end: 1.5 },
  { text: "four", start: 1.5, end: 1.9 },
  { text: "months.", start: 1.9, end: 2.4 },
  { text: "Nobody", start: 3.1, end: 3.6 },
  { text: "expected", start: 3.6, end: 4.1 },
  { text: "it.", start: 4.1, end: 4.5 },
];

/** One media-C1.json and its rank-C1.json, as the run leaves them. */
function run() {
  const pick = { id: "pexels:video:1", source: "pexels", kind: "video", mediaUrl: "https://videos.pexels.com/1.mp4", previewUrl: "https://images.pexels.com/1.jpg", sourcePageUrl: "https://www.pexels.com/video/1/", creator: "Ana", licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: "Ana", sourcePageUrl: "https://www.pexels.com/video/1/" } };
  const media = {
    chapter: "C1",
    shots: [
      { scene: "SC0001", shot: 1, start: 0, end: 3, status: "found", query: "tacoma narrows bridge", pick, alternates: ["pexels:video:2", "pexels:video:3"], trace: [] },
      { scene: "SC0001", shot: 2, start: 3, end: 6, status: "missing", query: null, pick: null, alternates: [], trace: [] },
    ],
  };
  const rank = {
    shots: [
      {
        scene: "SC0001",
        shot: 1,
        start: 0,
        sentence: "The tower fell in four months.",
        after: "pexels:video:1",
        top: [
          { id: "pexels:video:1", title: "Bridge", previewUrl: "https://images.pexels.com/1.jpg", source: "pexels", mediaUrl: "https://videos.pexels.com/1.mp4", sourcePageUrl: "https://www.pexels.com/video/1/" },
          { id: "pixabay:image:9", title: "Cable", previewUrl: "https://cdn.pixabay.com/9.jpg", source: "pixabay", mediaUrl: "https://cdn.pixabay.com/9.jpg" },
          { id: "wikimedia:file:7", title: "Collapse", previewUrl: "https://upload.wikimedia.org/7.jpg", source: "wikimedia" },
        ],
      },
      {
        scene: "SC0001",
        shot: 2,
        start: 3,
        sentence: "Nobody expected it.",
        top: [{ id: "nasa:image:4", title: "Wind", previewUrl: "https://images-assets.nasa.gov/4.jpg", source: "nasa", mediaUrl: "https://images-assets.nasa.gov/4.jpg", licence: "US-GOV-PD" }],
      },
    ],
  };
  return { media, rank };
}

test("the edit pack writes every shot with its time, its words and its six candidates", () => {
  const { media, rank } = run();
  const pack = buildEditPack({
    filmId: "11111111-2222-3333-4444-555555555555",
    seconds: 6,
    parts: 2,
    chapters: [{ id: "C1", title: "The fall", markdown: "SC0001 0:00-0:06 A bridge.\nSHOTS: R3 the deck; R1 a card\n" }],
    media,
    rank,
    words: WORDS,
    score: "S4 plan",
  });
  assert.equal(pack.version, EDIT_PACK_VERSION);
  assert.equal(pack.shots.length, 2);
  const first = pack.shots[0];
  assert.equal(first.id, "SC0001-1");
  assert.equal(first.start, 0);
  assert.equal(first.end, 3);
  assert.equal(first.words, "The tower fell in four months.");
  assert.equal(first.pick.id, "pexels:video:1");
  assert.equal(first.pick.licence, "PEXELS");
  assert.ok(first.candidates.length >= 3);
  assert.equal(first.candidates[0].id, "pexels:video:1", "the pick heads its own list");
  assert.ok(first.candidates.some((c) => c.id === "pixabay:image:9"));
  // A rank row that carries no licence takes the shot's own licence (the film's licence class).
  assert.equal(first.candidates.find((c) => c.id === "pixabay:image:9").licence, "PEXELS");
  // No pick, but the words and the alternative are there: a person can still swap this shot in.
  const second = pack.shots[1];
  assert.equal(second.words, "Nobody expected it.");
  assert.equal(second.pick, null);
  assert.equal(second.candidates[0].id, "nasa:image:4");
  assert.equal(second.candidates[0].licence, "US-GOV-PD", "a candidate of a shot with no pick carries its own licence");
  assert.equal(pack.script.length, 1);
  assert.equal(pack.score, "S4 plan");
  assert.equal(pack.parts.length, 2);
});

test("a candidate with no licence of its own is offered only when the shot's pick lends one", () => {
  // rank-C1.json rows written before the licence travelled with them carry none: a shot without a
  // pick cannot vouch for the licence, so nothing is offered (the gate must never guess a licence).
  const bare = candidatesFor({ pick: null, candidateRows: [{ id: "pixabay:image:1", previewUrl: "https://cdn.pixabay.com/1.jpg" }] });
  assert.deepEqual(bare, []);
  const lent = candidatesFor({ pick: null, candidateRows: [{ id: "pexels:video:2", previewUrl: "https://images.pexels.com/2.jpg", licence: "PEXELS" }] });
  assert.equal(lent.length, 1);
});

test("a shot's candidates are at most six, free-licence, and safe to link", () => {
  const rows = [
    { id: "a", source: "pexels", licence: "PEXELS", mediaUrl: "https://x.test/a.mp4", previewUrl: "https://x.test/a.jpg" },
    { id: "junk", source: "pexels", licence: "PEXELS", mediaUrl: "javascript:alert(1)", previewUrl: "javascript:alert(1)" },
    { id: "paid", source: "getty", licence: "RIGHTS-MANAGED", mediaUrl: "https://x.test/p.mp4" },
  ];
  for (let i = 0; i < 9; i += 1) rows.push({ id: `p${i}`, source: "pixabay", licence: "PIXABAY", mediaUrl: `https://x.test/${i}.mp4` });
  const list = candidatesFor({ pick: null, candidateRows: rows });
  assert.equal(list.length, MAX_CANDIDATES);
  assert.ok(!list.some((c) => c.id === "junk"), "a javascript: URL is never offered");
  assert.ok(!list.some((c) => c.id === "paid"), "a licence that is not on the film's free list is never offered");
  assert.equal(candidateOf({ id: "x", previewUrl: "javascript:alert(1)" }).thumbnailUrl, null);
});

test("the words heard over a shot come from their own times", () => {
  assert.equal(wordsIn(WORDS, 0, 3), "The tower fell in four months.");
  assert.equal(wordsIn(WORDS, 3, 6), "Nobody expected it.");
  assert.equal(wordsIn(WORDS, 20, 30), "");
  assert.equal(wordsIn(undefined, 0, 3), "");
});

test("parts are whole runs of shots, as the renderer splits them", () => {
  const shots = [0, 1, 2, 3].map((i) => ({ id: `SC0001-${i + 1}`, start: i * 10, end: i * 10 + 10 }));
  const two = packParts(shots, 2, 30);
  assert.deepEqual(two.map((p) => p.shots), [["SC0001-1", "SC0001-2"], ["SC0001-3", "SC0001-4"]]);
  assert.deepEqual(two.map((p) => p.index), [1, 2]);
  assert.equal(two[1].start, 20);
  const one = packParts(shots, 1, 30);
  assert.equal(one.length, 1);
  assert.equal(one[0].shots.length, 4);
  // 8 parts over 4 shots: a part with no shot is kept (the renderer writes only its report).
  const eight = packParts(shots, 8, 30);
  assert.equal(eight.length, 8);
  assert.equal(eight.reduce((n, p) => n + p.shots.length, 0), 4);
});

test("a swap touches only the parts that hold the swapped shot", () => {
  const { media, rank } = run();
  const pack = buildEditPack({ media, rank, words: WORDS, parts: 2, chapters: [{ id: "C1", markdown: "SHOTS: R3 a; R3 b\n" }] });
  assert.equal(partOfShot(pack, "SC0001-2"), 2);
  const plan = changedParts(pack, [{ shotId: "SC0001-2" }]);
  assert.deepEqual(plan.changed, [2]);
  assert.deepEqual(plan.kept, [1]);
  assert.equal(plan.all, false);
  assert.deepEqual(changedParts(pack, [{ shotId: "SC0001-1" }, { shotId: "SC0001-2" }]).changed, [1, 2]);
  // A pack without parts renders everything again: nothing is guessed.
  const bare = { ...pack, parts: [] };
  assert.equal(changedParts(bare, [{ shotId: "SC0001-1" }]).all, true);
});

test("swaps are checked against this film's own pack: auth-agnostic, unknown shots refused", () => {
  const { media, rank } = run();
  const pack = buildEditPack({ media, rank, words: WORDS, parts: 2 });
  const ok = checkSwaps({ swaps: [{ shotId: "SC0001-2", candidate: { id: "pixabay:image:9", source: "pixabay", licence: "PIXABAY", mediaUrl: "https://cdn.pixabay.com/9.jpg", previewUrl: "https://cdn.pixabay.com/9.jpg" } }] }, pack);
  assert.equal(ok.ok, true);
  assert.equal(/** @type {any} */ (ok).value.swaps[0].shotId, "SC0001-2");
  assert.match(/** @type {any} */ (checkSwaps({ swaps: [{ shotId: "SC9999-1", candidateId: "pexels:video:1" }] }, pack)).error, /Unknown shot/);
  assert.match(/** @type {any} */ (checkSwaps({ swaps: [] }, pack)).error, /at least one/);
  assert.match(/** @type {any} */ (checkSwaps({}, pack)).error, /Send swaps/);
  assert.match(/** @type {any} */ (checkSwaps({ swaps: [{ shotId: "SC0001-1", candidateId: "nope:1" }] }, pack)).error, /not one of/);
  assert.match(/** @type {any} */ (checkSwaps({ swaps: [{ shotId: "SC0001-1", candidate: { id: "x:1", licence: "CC-BY-NC", mediaUrl: "https://x.test/a.mp4" } }] }, pack)).error, /free-licence/);
  assert.match(/** @type {any} */ (checkSwaps({ swaps: [{ shotId: "SC0001-1", candidate: { id: "x:1", licence: "PEXELS" } }] }, pack)).error, /no clip address/);
  const twice = checkSwaps({ swaps: [{ shotId: "SC0001-1", candidateId: "pexels:video:1" }, { shotId: "SC0001-1", candidateId: "pexels:video:1" }] }, pack);
  assert.match(/** @type {any} */ (twice).error, /twice/);
  const byId = checkSwaps({ swaps: [{ shotId: "SC0001-1", candidateId: "pexels:video:1" }] }, pack);
  assert.equal(/** @type {any} */ (byId).value.swaps[0].pick.mediaUrl, "https://videos.pexels.com/1.mp4");
  assert.match(/** @type {any} */ (checkSwaps({ swaps: [{ shotId: "SC0001-1", candidateId: "pexels:video:1" }] }, null)).error, /no edit pack/);
});

test("applying swaps changes the picks and keeps the old one offered", () => {
  const { media, rank } = run();
  const pack = buildEditPack({ media, rank, words: WORDS, parts: 2 });
  const swap = { shotId: "SC0001-1", pick: candidateOf({ id: "pixabay:image:9", source: "pixabay", licence: "PIXABAY", mediaUrl: "https://cdn.pixabay.com/9.jpg" }) };
  const next = applySwaps(pack, [swap], "2026-11-28T10:00:00.000Z");
  const shot = next.shots.find((s) => s.id === "SC0001-1");
  assert.equal(shot.pick.id, "pixabay:image:9");
  assert.equal(shot.swapped, true);
  assert.equal(shot.candidates[0].id, "pixabay:image:9");
  assert.ok(shot.candidates.some((c) => c.id === "pexels:video:1"), "the old pick can be put back");
  assert.equal(next.swappedAt, "2026-11-28T10:00:00.000Z");
  assert.equal(pack.shots[0].pick.id, "pexels:video:1", "the pack that was read is not changed");
});

test("the re-make's media rows carry the new picture and its licence", () => {
  const { media, rank } = run();
  const pack = buildEditPack({ media, rank, words: WORDS, parts: 2 });
  const rows = mediaFromPack(pack);
  assert.equal(rows.shots.length, 2);
  assert.equal(rows.shots[0].pick.id, "pexels:video:1");
  assert.equal(rows.shots[0].pick.licence.licenseId, "PEXELS");
  assert.equal(rows.shots[1].status, "missing");
});

test("a pack the runner sends is checked once before the studio stores it", () => {
  const { media, rank } = run();
  const pack = buildEditPack({ media, rank, words: WORDS, parts: 2 });
  assert.equal(checkEditPack(pack, 2000).ok, true);
  assert.match(/** @type {any} */ (checkEditPack({ ...pack, version: 99 }, 2000)).error, /version/);
  assert.match(/** @type {any} */ (checkEditPack({ ...pack, shots: [] }, 2000)).error, /no shots/);
  assert.match(/** @type {any} */ (checkEditPack({ ...pack, parts: [] }, 2000)).error, /render parts/);
  assert.match(/** @type {any} */ (checkEditPack({ ...pack, script: [{ markdown: 5 }] }, 2000)).error, /markdown/);
  assert.match(/** @type {any} */ (checkEditPack(pack, 9 * 1024 * 1024)).error, /limit/);
  assert.match(/** @type {any} */ (checkEditPack({ ...pack, shots: [{ id: "SC0001-1", start: 5, end: 5 }] }, 2000)).error, /time range/);
});

test("a pack built from the shot plan alone still lists its shots", () => {
  const pack = buildEditPack({ shots: [{ id: "SC0001-1", scene: "SC0001", shot: 1, start: 0, end: 4, text: "a card" }], parts: 1, chapters: [] });
  assert.equal(pack.shots.length, 1);
  assert.equal(pack.shots[0].words, "a card", "the shot plan's own words stand in when the run kept no word times");
  assert.equal(pack.shots[0].candidates.length, 0);
  assert.equal(pack.seconds, 4);
  assert.deepEqual(shotRows({ media: null, rank: null }), []);
});

test("a picture with no kind written is a still, never footage (a looped photograph never ends)", async () => {
  const { isImageUrl } = await import("../src/film-media.mjs");
  const { candidateOf, mediaFromPack } = await import("../src/edit-pack.mjs");
  const { buildTimeline } = await import("../src/timeline.mjs");
  assert.equal(isImageUrl("https://thumb.wikimedia.org/a/1280px-Apollo.jpg?utm_source=x"), true);
  assert.equal(isImageUrl("https://videos.pexels.com/5.mp4"), false);
  assert.equal(candidateOf({ id: "w:1", licence: "CC0-1.0", mediaUrl: "https://x.test/a.jpg" })?.kind, "image");
  assert.equal(candidateOf({ id: "p:1", licence: "PEXELS", mediaUrl: "https://x.test/a.mp4" })?.kind, null);
  const pack = { shots: [{ id: "SC0001-1", scene: "SC0001", index: 1, start: 0, end: 4, pick: { id: "w:1", source: "w", licence: "CC0-1.0", thumbnailUrl: "https://x.test/t.jpg", mediaUrl: "https://x.test/a.jpg", sourcePageUrl: null, title: "" } }] };
  assert.equal(mediaFromPack(pack).shots[0].pick.kind, "image");
  const md = `**SC0001** | 0:00:00-0:00:04 | C1 | b | E | C01 | NARR: One. | W 1/1 | ANCHOR: x | SHOTS: (1) R3 a photo | LOOK: L`;
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md, media: { chapter: "C1", providers: [], repeatWindowSeconds: 600, stats: {}, shots: [{ scene: "SC0001", shot: 1, start: 0, end: 4, status: "found", pick: { id: "w:1", source: "w", mediaUrl: "https://x.test/a.jpg", previewUrl: "https://x.test/t.jpg", sourcePageUrl: null, licence: { licenseId: "CC0-1.0" } } }] } }] });
  assert.equal(t.video.find((v) => v.type === "clip")?.still, true, "no kind, a .jpg address: a still");
});
