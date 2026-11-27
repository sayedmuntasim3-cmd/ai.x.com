import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanTitle, buildPrior, buildRecords, freshnessWeight, lengthPlan, pillarOf, scoreTitle, titleFormulas, weightedQuantiles, winnersYoungerThan, PILLARS } from "../src/reference-prior.mjs";

const NOW = Date.parse("2026-11-27T12:00:00Z");
const day = (d) => new Date(NOW - d * 86_400_000).toISOString();
/** A channel of 8 settled videos around 100k views, plus the ones under test. */
const channel = (extra) => [
  ...Array.from({ length: 8 }, (_, i) => ({ id: `base${i}`.padEnd(11, "x"), title: `Tunnel number ${i}`, channelTitle: "C", publishedAt: day(100 + i * 30), views: 100_000, durationSeconds: 900, chapters: [], tags: [] })),
  ...extra,
];

test("pillars come from title words, in a fixed order", () => {
  assert.equal(pillarOf({ title: "Why the bridge collapsed" }), "disasters");
  assert.equal(pillarOf({ title: "The unsolved mystery of the lost tunnel" }), "mysteries");
  assert.equal(pillarOf({ title: "Building the longest tunnel" }), "megaprojects");
  assert.equal(pillarOf({ title: "How the power grid works" }), "hidden-infrastructure");
  assert.equal(pillarOf({ title: "My cat photos" }), null);
});

test("title formulas are named, multi-label, and never empty", () => {
  assert.deepEqual(titleFormulas("Plain words here"), ["plain-statement"]);
  const f = titleFormulas("Why Did the $5 Billion Dam Fail?");
  for (const n of ["question", "how-why-what-opener", "why-it-failed", "number-or-money"]) assert.ok(f.includes(n), n);
});

test("a trailing channel tag is branding, not a title formula", () => {
  assert.equal(cleanTitle("Eastern Airlines 212 | Fascinating Horror", "Fascinating Horror"), "Eastern Airlines 212");
  assert.equal(cleanTitle("Why X: the story | Other", "Fascinating Horror"), "Why X: the story | Other");
});

test("weighted quantiles and freshness weights", () => {
  assert.deepEqual(weightedQuantiles([{ x: 1, w: 1 }, { x: 2, w: 1 }, { x: 3, w: 1 }], [0.5, 1]), [2, 3]);
  assert.deepEqual(weightedQuantiles([{ x: 5, w: 0 }], [0.5]), [0]);
  assert.deepEqual([5, 30, 200, 1500, 3000].map(freshnessWeight), [0, 0.5, 1, 0.35, 0.15]);
});

test("records: outlier is against the channel's own median, short and unsettled videos are handled", () => {
  const raw = channel([
    { id: "winner00001", title: "Why the dam collapsed", channelTitle: "C", publishedAt: day(200), views: 400_000, durationSeconds: 1200, chapters: [{ at: 0, title: "a" }, { at: 60, title: "b" }, { at: 300, title: "c" }], tags: [], descriptionOpening: "x" },
    { id: "short000001", title: "Dam fail short", channelTitle: "C", publishedAt: day(200), views: 9_000_000, durationSeconds: 50, chapters: [], tags: [] },
    { id: "offniche001", title: "My cat photos", channelTitle: "C", publishedAt: day(200), views: 5, durationSeconds: 900, chapters: [], tags: [] },
  ]);
  const recs = buildRecords(raw, { now: NOW, channelFit: { C: "adjacent" } });
  const w = recs.find((r) => r.id === "winner00001");
  assert.equal(w.outlier, 4);
  assert.equal(w.pillar, "disasters");
  assert.equal(w.chapters, 3);
  assert.ok(w.weight > 0);
  assert.ok(!recs.some((r) => r.id === "short000001"), "shorts are out");
  assert.ok(!recs.some((r) => r.id === "offniche001"), "an adjacent channel's off-niche video is out");
  assert.equal(buildRecords(raw, { now: NOW, channelFit: { C: "core" } }).some((r) => r.id === "offniche001"), true, "a core channel's video stays");
  assert.deepEqual(buildRecords([], { now: NOW }), []);
});

test("the prior has the four pillars, an honest preamble, and no crash on an empty pillar", () => {
  const raw = channel(Array.from({ length: 12 }, (_, i) => ({ id: `fail${i}`.padEnd(11, "x"), title: `Why bridge ${i} collapsed?`, channelTitle: "C", publishedAt: day(120 + i), views: i < 6 ? 400_000 : 90_000, durationSeconds: 1000 + i * 60, chapters: [], tags: [] })));
  const prior = buildPrior(buildRecords(raw, { now: NOW }), { builtAt: "2026-11-27", rawVideos: raw.length });
  assert.deepEqual(Object.keys(prior.pillars), [...PILLARS]);
  assert.ok(prior.honesty.some((h) => /first 30 seconds/.test(h)) && prior.honesty.some((h) => /retention/.test(h)));
  assert.equal(prior.pillars.mysteries.all.n, 0);
  assert.equal(lengthPlan(prior, "mysteries"), null);
  assert.equal(scoreTitle(prior, "x", "mysteries").score, 1);
  assert.ok(lengthPlan(prior, "disasters").minutes.mid > 10);
  assert.equal(winnersYoungerThan(prior, "disasters", 400) <= 1, true);
});

test("the committed prior file is sane and the readers work on it", () => {
  const prior = JSON.parse(readFileSync(new URL("../data/reference-prior.json", import.meta.url), "utf8"));
  assert.equal(prior.version, 1);
  assert.ok(prior.scope.videos >= 500 && prior.scope.videos <= 1000, `video count ${prior.scope.videos}`);
  assert.ok(prior.honesty.some((h) => /first 30 seconds/.test(h)));
  for (const p of PILLARS) {
    const d = prior.pillars[p];
    assert.ok(d.all.n > 0 && d.thumbnails.sample >= 10, p);
    assert.ok(d.all.minutes.p25 <= d.all.minutes.p50 && d.all.minutes.p50 <= d.all.minutes.p75, p);
    const plan = lengthPlan(prior, p);
    assert.ok(plan.minutes.low <= plan.minutes.mid && plan.minutes.mid <= plan.minutes.high, p);
  }
  const s = scoreTitle(prior, "Why Did the Tacoma Narrows Bridge Collapse?");
  assert.equal(s.pillar, "disasters");
  assert.ok(s.score > 0 && s.formulas.includes("question"));
  assert.equal(scoreTitle(prior, "my cat photos"), null);
});
