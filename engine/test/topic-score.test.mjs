import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreTopic, rankTopics, similarityScore, rankingMarkdown, TOPIC_WEIGHTS, FACTORS, NICHE } from "../src/topic-score.mjs";

const f = (v) => ({ value: v, reason: "test" });
const all = (v, over = {}) => Object.fromEntries(FACTORS.filter((k) => k !== "similarity").map((k) => [k, f(over[k] ?? v)]));
const cand = (id, v, over = {}, extra = {}) => ({ id, title: id, niche: NICHE, evidenceStrength: "strong", factors: all(v, over), ...extra });

test("weights sum to 1 and cover every factor", () => {
  const sum = Object.values(TOPIC_WEIGHTS).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
  assert.equal(FACTORS.length, 11);
});

test("all-5 topic with no past films scores 100; weak evidence costs 10%", () => {
  assert.equal(scoreTopic(cand("a", 5)).total, 100);
  assert.equal(scoreTopic(cand("a", 5, {}, { evidenceStrength: "weak" })).total, 90);
});

test("hard rejections: off-niche, no visuals, unreliable, fabrication, graphic, repeat", () => {
  const ids = (c, o) => scoreTopic(c, o).rejected.map((r) => r.id);
  assert.deepEqual(ids(cand("x", 5, {}, { niche: "true-crime" })), ["off-niche"]);
  assert.deepEqual(ids(cand("x", 5, { visuals: 1 })), ["no-authentic-visuals"]);
  assert.deepEqual(ids(cand("x", 5, { reliability: 1 })), ["unreliable-sources"]);
  assert.deepEqual(ids(cand("x", 5, {}, { fabricationRisk: true })), ["fabrication-risk"]);
  assert.deepEqual(ids(cand("x", 5, { advertiserFit: 0 })), ["not-advertiser-safe"]);
  const t = { ...cand("Tacoma Narrows bridge collapse", 5), tags: ["bridge", "wind"] };
  assert.deepEqual(ids(t, { pastFilms: [{ title: "Tacoma Narrows bridge collapse", tags: ["bridge", "wind"] }] }), ["repeat"]);
});

test("a missing factor counts as 0 and is listed", () => {
  const c = cand("m", 5);
  delete c.factors.narrative;
  const s = scoreTopic(c);
  assert.deepEqual(s.missing, ["narrative"]);
  assert.ok(s.total < 100);
});

test("values are clamped to 0..5", () => {
  assert.equal(scoreTopic(cand("c", 9)).total, 100);
  assert.equal(scoreTopic(cand("c", -3)).total, scoreTopic(cand("c", 0)).total);
});

test("similarity: 5 with no overlap, lower with overlap", () => {
  assert.equal(similarityScore({ title: "Hoover Dam" }, []).value, 5);
  const s = similarityScore({ title: "Hoover Dam concrete" }, [{ title: "Hoover Dam history" }]);
  assert.ok(s.value < 5 && s.value >= 0, String(s.value));
});

test("ranking: accepted first by total, rejected last, ties by id, deterministic", () => {
  const list = [cand("b", 4), cand("a", 4), cand("z", 5, { visuals: 0 }), cand("c", 5)];
  const r = rankTopics(list).map((s) => s.id);
  assert.deepEqual(r, ["c", "a", "b", "z"]);
  assert.deepEqual(rankTopics([...list].reverse()).map((s) => s.id), r);
});

test("real data: 15 topics, weak-evidence topics 3, 6, 13, 15 rank below 1, 2, 5, 9", () => {
  const data = JSON.parse(readFileSync(new URL("../../docs/research/data/engineering-topics.json", import.meta.url), "utf8"));
  assert.equal(data.topics.length, 15);
  const ranked = rankTopics(data.topics, { pastFilms: data.pastFilms });
  const pos = (id) => ranked.findIndex((s) => s.id === id);
  for (const weak of ["tacoma-narrows", "oroville-spillway", "hoover-dam", "deep-tunnel"])
    for (const strong of ["st-francis-dam", "hyatt-walkway", "katrina-levees", "camp-century"])
      assert.ok(pos(weak) > pos(strong), `${weak} should rank below ${strong}`);
  for (const t of data.topics) for (const k of FACTORS) if (k !== "similarity") assert.ok(t.factors[k]?.reason, `${t.id}.${k} needs a reason`);
  assert.match(rankingMarkdown(ranked), /\| Rank \| Topic \| Total/);
});
