import assert from "node:assert/strict";
import { test } from "node:test";
import { FORMATS, getFormat, suggestFormat } from "../src/formats.mjs";

test("every format preset is complete and unique", () => {
  assert.equal(new Set(FORMATS.map((f) => f.id)).size, FORMATS.length);
  assert.ok(FORMATS.length >= 15);
  for (const f of FORMATS) {
    assert.ok(f.hook && f.beats.length && f.visuals && f.music && f.examples.length, f.id);
    assert.ok(f.minutes[0] >= 1 && f.minutes[0] <= f.minutes[1], f.id);
  }
  assert.equal(getFormat("nope"), null);
});

test("topics are routed to a sensible format", () => {
  assert.equal(suggestFormat("When a B-17 tail fell with a gunner inside").id, "true-story-reenactment");
  assert.equal(suggestFormat("$50 দিয়ে শুরু করে রোলস রয়েস কিনলো").id, "rags-to-riches");
  assert.equal(suggestFormat("The world's highest security prison").id, "place-nobody-can-visit");
  assert.equal(suggestFormat("Which rich country goes bankrupt first?").id, "money-explainer");
  assert.equal(suggestFormat("Midway from the Japanese perspective").id, "other-side");
  assert.equal(suggestFormat("a boy who never gave up").id, "motivational-life-story");
});

test("every viral documentary type has a format, a Bangla name and a look; topics find their format", async () => {
  const { FORMATS: all, suggestFormat: suggest, lookFor } = await import("../src/formats.mjs");
  assert.ok(all.length >= 25);
  for (const f of all) assert.ok(/[ঀ-৿]/.test(f.bn), `${f.id} has a Bangla name`);
  const cases = [
    ["Apollo 13: the mission that almost failed", "space-mission"],
    ["The Battle of Stalingrad", "war-battle"],
    ["The cold case that was solved 30 years later", "true-crime-case"],
    ["Stranded on a raft in the Pacific", "survival-story"],
    ["Chernobyl minute by minute", "disaster-minute-by-minute"],
    ["How the pyramids were built", "ancient-civilization"],
    ["The rise and fall of a startup worth billions", "company-rise-fall"],
    ["Why does 95% of Egypt live on the Nile?", "geography-why"],
    ["Messi: the boy who was too small", "sports-legend"],
    ["The life of Nikola Tesla", "biography"],
  ];
  for (const [topic, id] of cases) assert.equal(suggest(topic).id, id, topic);
  assert.equal(lookFor("war-battle"), "archive");
  assert.equal(lookFor("survival-story"), "cinematic");
});
