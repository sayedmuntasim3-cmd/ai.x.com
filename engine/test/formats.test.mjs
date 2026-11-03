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
