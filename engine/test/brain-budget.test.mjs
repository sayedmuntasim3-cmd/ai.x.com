import assert from "node:assert/strict";
import { test } from "node:test";
import { BRAIN_MODELS, estimateBrainBudget, FREE_REQUESTS_PER_DAY, SCENES_PER_MINUTE, syntheticScenes } from "../src/brain-budget.mjs";

test("the synthetic transcript tiles the film: every scene follows the one before, its words inside it", () => {
  const scenes = syntheticScenes(10, SCENES_PER_MINUTE);
  assert.equal(scenes.length, 75);
  assert.equal(scenes[0].start, 0);
  assert.equal(scenes.at(-1)?.end, 600);
  for (const [i, s] of scenes.entries()) {
    assert.ok(s.narration && s.words.length >= 4, `${s.sc} has words`);
    assert.ok(s.end > s.start);
    assert.ok(s.words[0].start >= s.start - 0.01 && s.words.at(-1).end <= s.end + 0.01, `${s.sc} words inside the scene`);
    if (i) assert.equal(s.start, scenes[i - 1].end);
  }
});

test("the estimator counts every stage from the real prompt builders, and a longer film asks for more", async () => {
  const ten = await estimateBrainBudget({ minutes: 10, scenesPerMinute: SCENES_PER_MINUTE });
  assert.equal(ten.scenes, 75);
  assert.deepEqual(ten.stages.map((s) => s.stage), ["V3", "V4", "V5", "V6"]);
  for (const s of ten.stages) {
    assert.ok(s.calls >= 1, `${s.stage} calls`);
    assert.ok(s.tokens >= s.calls * 200, `${s.stage} tokens ${s.tokens}`);
    assert.ok(s.largestCall <= s.tokens);
  }
  assert.equal(ten.requests, ten.stages.reduce((n, s) => n + s.calls, 0));
  assert.equal(ten.tokens, ten.stages.reduce((n, s) => n + s.tokens, 0));
  // The real systems carry the manual's role craft: no call is a one-liner.
  assert.ok(ten.stages[0].largestCall > 1000, "the Director prompt holds the system and a batch of scene lines");

  const twenty = await estimateBrainBudget({ minutes: 20 });
  const forty = await estimateBrainBudget({ minutes: 40 });
  assert.ok(twenty.requests > ten.requests);
  assert.ok(forty.requests > twenty.requests);
  assert.ok(forty.scenes > twenty.scenes);
});

test("a 40-minute film stays under the free key's 3 × 1,000 requests and never sends a prompt over the minute", async () => {
  const b = await estimateBrainBudget({ minutes: 40 });
  assert.equal(b.models, BRAIN_MODELS);
  assert.ok(b.requests < BRAIN_MODELS * FREE_REQUESTS_PER_DAY, `${b.requests} requests against ${BRAIN_MODELS * FREE_REQUESTS_PER_DAY}`);
  assert.ok(b.requestsPerModel < FREE_REQUESTS_PER_DAY, `${b.requestsPerModel} requests on the busiest model`);
  assert.ok(b.budget.dayFits);
  assert.ok(b.budget.burstFits);
  for (const s of b.stages) assert.ok(s.largestCall <= 8000, `${s.stage} sends ${s.largestCall} tokens in one prompt`);
  // 60 minutes must hold too: friends upload long films.
  const hour = await estimateBrainBudget({ minutes: 60 });
  assert.ok(hour.requests < BRAIN_MODELS * FREE_REQUESTS_PER_DAY, `${hour.requests} requests`);
});
