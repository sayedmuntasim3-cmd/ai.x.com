import test from "node:test";
import assert from "node:assert/strict";
import { validateWatch, summarizeWatches, targetsFromSummary, applyMeasured, quantile, isVideoId, buildWatchRequest, measuredModuleText, MIN_FILMS_FOR_TARGETS } from "../src/youtube-watch.mjs";

const good = (i = 0) => ({
  lengthSeconds: 900 + i, hookText: "In 1986 a reactor exploded and nobody told the town", firstNumberAtSec: 5 + i, firstStakeAtSec: 12,
  wordsPerMinute: 150 + i, avgShotSeconds: 4 + i / 10,
  shares: { archive: 0.3, mapsDiagramsAnimation: 0.2 + i / 100, onScreenText: 0.1, talkingHeads: 0.2, stock: 0.2 },
  chapterTurnsSec: [60, 200, 400], revealsSec: [300, 600], musicStyle: "low strings", ending: "It closes on the question of who pays.",
});

test("validateWatch accepts a sound answer and rejects broken ones", () => {
  assert.equal(validateWatch(good()).ok, true);
  assert.equal(validateWatch(null).ok, false);
  assert.equal(validateWatch({ ...good(), wordsPerMinute: 900 }).ok, false);
  assert.equal(validateWatch({ ...good(), firstNumberAtSec: 5000 }).ok, false);
  assert.equal(validateWatch({ ...good(), hookText: "hi" }).ok, false);
  assert.equal(validateWatch({ ...good(), shares: { ...good().shares, stock: 0.9 } }).ok, false);
  assert.equal(validateWatch({ ...good(), revealsSec: [99999] }).ok, false);
});

test("quantile and summary medians", () => {
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);
  assert.equal(quantile([], 0.5), null);
  const s = summarizeWatches([good(0), good(2), good(4), { junk: true }]);
  assert.equal(s.n, 3);
  assert.equal(s.wpm.median, 152);
  assert.equal(s.firstNumberAtSec, 7);
  assert.equal(s.revealGapSeconds, 300);
  assert.equal(s.chapterGapSeconds, 170);
});

test("targets apply only from 20 films on, and only the measured keys", () => {
  const few = summarizeWatches(Array.from({ length: 5 }, (_, i) => good(i)));
  assert.deepEqual(targetsFromSummary(few), {});
  const many = summarizeWatches(Array.from({ length: MIN_FILMS_FOR_TARGETS }, (_, i) => good(i)));
  const t = targetsFromSummary(many);
  assert.deepEqual(t.wpm, [155, 164]);
  assert.ok(t.hookBySeconds >= 10 && t.hookBySeconds <= 30);
  assert.ok(t.graphicsShare[0] < t.graphicsShare[1]);
  const base = { wpm: [140, 165], endingSeconds: 30 };
  assert.equal(applyMeasured(base, { n: 5, targets: t }), base);
  assert.deepEqual(applyMeasured(base, { n: 20, targets: t }).wpm, [155, 164]);
  assert.equal(applyMeasured(base, { n: 20, targets: t }).endingSeconds, 30);
  assert.match(measuredModuleText({ n: 20, updated: "2026-11-28", summary: many }), /export const WATCH_MEASURED/);
});

test("the request carries the YouTube URL as video input and a JSON schema", () => {
  assert.equal(isVideoId("rj-G_gmFWtE"), true);
  assert.equal(isVideoId("short"), false);
  const r = buildWatchRequest("rj-G_gmFWtE");
  assert.equal(r.contents[0].parts[0].fileData.fileUri, "https://www.youtube.com/watch?v=rj-G_gmFWtE");
  assert.equal(r.generationConfig.responseMimeType, "application/json");
});
