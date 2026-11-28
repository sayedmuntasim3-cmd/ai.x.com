import { test } from "node:test";
import assert from "node:assert/strict";
import { alternativesFor, candidateFromSearch, clock, dropSwap, filterShots, packCheck, remakeState, setSwap, shotList, swapOf, swapPlan } from "../src/shot-swap.mjs";

/** A pack as the studio stores it (engine/src/edit-pack.mjs writes this shape). */
const PACK = {
  version: 1,
  filmId: "11111111-2222-3333-4444-555555555555",
  createdAt: "2026-11-28T09:00:00.000Z",
  seconds: 20,
  fps: 30,
  shots: [
    {
      id: "SC0001-1",
      scene: "SC0001",
      index: 1,
      start: 0,
      end: 10,
      words: "The tower fell in four months.",
      pick: { id: "pexels:video:1", source: "pexels", licence: "PEXELS", thumbnailUrl: "https://images.pexels.com/1.jpg", mediaUrl: "https://videos.pexels.com/1.mp4", sourcePageUrl: "https://www.pexels.com/video/1/", title: "Bridge" },
      candidates: [
        { id: "pexels:video:1", source: "pexels", licence: "PEXELS", thumbnailUrl: "https://images.pexels.com/1.jpg", mediaUrl: "https://videos.pexels.com/1.mp4", sourcePageUrl: null, title: "Bridge" },
        { id: "pixabay:image:9", source: "pixabay", licence: "PIXABAY", thumbnailUrl: "https://cdn.pixabay.com/9.jpg", mediaUrl: "https://cdn.pixabay.com/9.jpg", sourcePageUrl: null, title: "Cable" },
      ],
    },
    {
      id: "SC0001-2",
      scene: "SC0001",
      index: 2,
      start: 10,
      end: 20,
      words: "Nobody expected it.",
      pick: null,
      candidates: [{ id: "nasa:image:4", source: "nasa", licence: "US-GOV-PD", thumbnailUrl: "https://images-assets.nasa.gov/4.jpg", mediaUrl: "https://images-assets.nasa.gov/4.jpg", sourcePageUrl: null, title: "Wind" }],
    },
  ],
  parts: [
    { index: 1, start: 0, end: 10, shots: ["SC0001-1"] },
    { index: 2, start: 10, end: 20, shots: ["SC0001-2"] },
  ],
};

test("the shot list shows time, words and the picture the film used", () => {
  const list = shotList(PACK);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0], { id: "SC0001-1", start: 0, end: 10, time: "0:00", span: "10s", words: "The tower fell in four months.", thumbnail: "https://images.pexels.com/1.jpg", source: "pexels", licence: "PEXELS", candidates: 2 });
  assert.equal(list[1].thumbnail, null, "a shot with no picture says so, it shows nothing broken");
  assert.equal(shotList({}).length, 0);
  assert.equal(clock(0), "0:00");
  assert.equal(clock(62), "1:02");
  assert.equal(clock(3725), "1:02:05");
  assert.equal(clock(-4), "0:00");
  // A javascript: thumbnail from a bad record is dropped, never rendered.
  assert.equal(shotList({ shots: [{ id: "A-1", start: 0, end: 1, pick: { id: "x", thumbnailUrl: "javascript:alert(1)" } }] })[0].thumbnail, null);
});

test("searching the shot list by its words", () => {
  const list = shotList(PACK);
  assert.equal(filterShots(list, "tower").length, 1);
  assert.equal(filterShots(list, "TOWER")[0].id, "SC0001-1");
  assert.equal(filterShots(list, "nobody").length, 1);
  assert.equal(filterShots(list, "").length, 2);
  assert.equal(filterShots(list, "   ").length, 2);
  assert.equal(filterShots(list, "SC0001-2").length, 1, "the shot's own id finds it too");
  assert.equal(filterShots(list, "submarine").length, 0);
});

test("a shot's alternatives mark the one the film already uses", () => {
  const alts = alternativesFor(PACK, "SC0001-1");
  assert.equal(alts.length, 2);
  assert.equal(alts[0].current, true);
  assert.equal(alts[1].current, false);
  assert.deepEqual(alternativesFor(PACK, "SC9999-1"), []);
  // A non-free licence is never offered, even if a pack somehow carries one.
  const bad = alternativesFor({ shots: [{ id: "A-1", candidates: [{ id: "x", licence: "CC-BY-NC", mediaUrl: "https://x.test/a.mp4" }] }] }, "A-1");
  assert.deepEqual(bad, []);
});

test("picking and un-picking swaps keeps one swap per shot", () => {
  const one = setSwap([], "SC0001-1", { id: "pixabay:image:9", licence: "PIXABAY", mediaUrl: "https://cdn.pixabay.com/9.jpg" });
  assert.equal(one.length, 1);
  const replaced = setSwap(one, "SC0001-1", { id: "pexels:video:2", licence: "PEXELS", mediaUrl: "https://videos.pexels.com/2.mp4" });
  assert.equal(replaced.length, 1, "a second pick replaces the first");
  assert.equal(replaced[0].candidate.id, "pexels:video:2");
  const two = setSwap(replaced, "SC0001-2", { id: "nasa:image:4", licence: "US-GOV-PD", mediaUrl: "https://images-assets.nasa.gov/4.jpg" });
  assert.deepEqual(two.map((s) => s.shotId), ["SC0001-1", "SC0001-2"]);
  assert.equal(swapOf(two, "SC0001-2").candidate.id, "nasa:image:4");
  assert.equal(dropSwap(two, "SC0001-2").length, 1);
  assert.deepEqual(dropSwap(undefined, "x"), []);
});

test("the plan says how much of the film is rendered again", () => {
  const swaps = [{ shotId: "SC0001-2", candidate: { id: "nasa:image:4" } }];
  const plan = swapPlan(PACK, swaps);
  assert.equal(plan.count, 1);
  assert.deepEqual(plan.parts, [2]);
  assert.equal(plan.text, "1 shot changes · 1 of 2 parts rendered again");
  const both = swapPlan(PACK, [...swaps, { shotId: "SC0001-1", candidate: { id: "pixabay:image:9" } }]);
  assert.deepEqual(both.parts, [1, 2]);
  assert.equal(both.text, "2 shots change · 2 of 2 parts rendered again");
  assert.equal(swapPlan(PACK, []).text, "");
  assert.equal(swapPlan({}, [{ shotId: "A-1" }]).total, 0);
});

test("the re-make state follows the same steps as the first cut", () => {
  assert.deepEqual(remakeState(null), { kind: "none" });
  const queued = remakeState({ status: "queued", swaps: 1, progress: [{ stage: "swaps", ok: true, message: { en: "Re-making with 1 new picture." } }] });
  assert.equal(queued.kind, "remaking");
  assert.match(queued.stage, /Re-making/);
  assert.equal(remakeState({ status: "running", swaps: 1, progress: [{ stage: "render", ok: true, message: { en: "Making the film." } }] }).kind, "working");
  assert.equal(remakeState({ status: "done", progress: [] }).kind, "done");
  const failed = remakeState({ status: "failed", progress: [{ stage: "render", ok: false, message: { en: "Stopped at render: ffmpeg exited 1" } }] });
  assert.equal(failed.kind, "failed");
  assert.match(failed.why, /ffmpeg/);
  assert.equal(remakeState({ status: "running", progress: [] }).kind, "first-cut");
});

test("a search result becomes a candidate only when the film may use it", () => {
  const c = candidateFromSearch({ id: "pexels:video:5", source: "pexels", previewUrl: "https://images.pexels.com/5.jpg", mediaUrl: "https://videos.pexels.com/5.mp4", sourcePageUrl: "https://www.pexels.com/video/5/", title: "Truck", licence: { licenseId: "PEXELS", name: "Pexels License" } });
  assert.equal(c.id, "pexels:video:5");
  assert.equal(c.licence, "PEXELS");
  assert.equal(c.thumbnailUrl, "https://images.pexels.com/5.jpg");
  assert.equal(candidateFromSearch({ id: "x", licence: { licenseId: "CC-BY-NC" }, mediaUrl: "https://x.test/a.mp4" }), null);
  assert.equal(candidateFromSearch({ id: "x", mediaUrl: "https://x.test/a.mp4" }), null, "no licence, no offer");
  assert.equal(candidateFromSearch({ id: "x", licence: "PEXELS", mediaUrl: "javascript:alert(1)", previewUrl: "javascript:alert(1)" }), null);
  assert.equal(candidateFromSearch(null), null);
});

test("a pack of another version is refused with words, not half-read", () => {
  assert.equal(packCheck(PACK, 1).ok, true);
  const newer = packCheck({ ...PACK, version: 2 }, 1);
  assert.equal(newer.ok, false);
  assert.match(newer.error, /newer studio/);
  assert.equal(packCheck({ version: 1, shots: [] }, 1).ok, false);
  assert.equal(packCheck(null, 1).ok, false);
});

test("a result as /api/media/search really answers (license.code, fullUrl, pageUrl) becomes a candidate", () => {
  const real = { id: "wikipedia:Saturn V|File:Apollo 11 Launch.jpg", source: "wikipedia", title: "Saturn V", pageUrl: "https://commons.wikimedia.org/wiki/File:Apollo_11_Launch.jpg", thumbnailUrl: "https://thumb.test/t.jpg", previewUrl: "https://thumb.test/p.jpg", fullUrl: "https://upload.test/full.jpg", license: { code: "public-domain", label: "Public domain" } };
  const c = candidateFromSearch(real);
  assert.equal(c?.licence, "PUBLIC-DOMAIN");
  assert.equal(c?.mediaUrl, "https://thumb.test/p.jpg", "the CDN preview, not the rate-limited original");
  assert.equal(c?.kind, "image");
  assert.equal(c?.sourcePageUrl, real.pageUrl);
  assert.equal(candidateFromSearch({ ...real, license: { code: "cc0" } })?.licence, "CC0-1.0");
  assert.equal(candidateFromSearch({ ...real, license: { code: "us-government" } })?.licence, "US-GOV-PD");
  assert.equal(candidateFromSearch({ ...real, license: { code: "cc-by-sa" } }), null, "share-alike is not offered");
});
