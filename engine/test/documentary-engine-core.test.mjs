import assert from "node:assert/strict";
import {
  FPS,
  RUN_ASSUMPTIONS,
  allocateLayers,
  calculateMediaNeeds,
  chooseChunkSeconds,
  chunkOptionsFor,
  estimateRun,
  planChunks,
  planRetention,
  renderMakespanSeconds,
} from "../src/documentary-engine-core.mjs";

const cases = [];
function test(name, fn) {
  try { fn(); cases.push({ name, status: "PASS" }); }
  catch (error) { cases.push({ name, status: "FAIL", error: error instanceof Error ? error.message : String(error) }); }
}
const needs = (duration) => {
  const result = calculateMediaNeeds(duration);
  assert.equal(result.ok, true, result.ok ? "" : result.error);
  return result;
};
const timeline = (seconds, shots, transitionEvery = 5) => {
  const frames = seconds * FPS;
  return Array.from({ length: shots }, (_, i) => ({
    id: "SC" + String(i + 1).padStart(4, "0"),
    startFrame: Math.round((frames * i) / shots),
    endFrame: Math.round((frames * (i + 1)) / shots),
    transitionOutFrames: i % transitionEvery === transitionEvery - 1 ? 12 : 0,
  }));
};

test("media budget matches ceil(minutes x 4.5 x 1.2) for every reference duration", () => {
  for (const [minutes, expected] of [[1, 6], [10, 54], [40, 216], [45, 243], [60, 324], [90, 486], [240, 1296], [300, 1620]]) {
    assert.equal(needs(minutes).totalUniqueMedia, expected, minutes + " min");
  }
});
test("45 minutes is exactly 243 media, not 244 from a floating-point remainder", () => {
  const result = needs(45);
  assert.equal(result.baseShots, 203); assert.equal(result.bufferShots, 40); assert.equal(result.totalUniqueMedia, 243);
});
test("3 h 27 min rounds 931.5 shots up: 932 slots, 186 buffer, 1118 media", () => {
  const result = needs({ hours: 3, minutes: 27 });
  assert.deepEqual([result.durationSeconds, result.baseShots, result.bufferShots, result.totalUniqueMedia], [12420, 932, 186, 1118]);
});
test("rejects empty, negative and over-12-hour durations with a clear message", () => {
  for (const bad of [0, -5, Number.NaN, {}, { hours: 13 }]) {
    const result = calculateMediaNeeds(bad);
    assert.equal(result.ok, false, JSON.stringify(bad)); assert.match(result.error, /duration/i);
  }
});
test("retention skeleton for 207 minutes lands every beat where planned", () => {
  const plan = planRetention(12420);
  assert.equal(plan.hookEndsAt, 30); assert.equal(plan.segmentCount, 69); assert.equal(plan.parts.length, 10);
  assert.equal(plan.patternInterruptCount, 496); assert.equal(plan.midpointAt, 6210); assert.equal(plan.cliffhangerAt, 9936);
  assert.equal(plan.parts.at(-1).endSeconds, 12420);
  for (const part of plan.parts.slice(0, -1)) assert.equal(part.endSeconds % 180, 0, "part break on a segment boundary");
});
test("retention beats are sorted and a short film has a single part", () => {
  const plan = planRetention(60);
  assert.equal(plan.parts.length, 1); assert.equal(plan.hookEndsAt, 9);
  for (let i = 1; i < plan.beats.length; i += 1) assert.ok(plan.beats[i].atSeconds >= plan.beats[i - 1].atSeconds);
});
test("layer allocation for 207 minutes closes at 1118, with variants before AI", () => {
  assert.deepEqual(allocateLayers(needs(207), { l1Usable: 560, l2Usable: 230, l4Planned: 170 }), { l1: 560, l2: 230, l3: 47, l4: 170, l5: 111 });
});
test("AI reconstruction is strictly last: no AI while real media and variants can cover the film", () => {
  assert.equal(allocateLayers(needs(45), { l1Usable: 243 * 0.55, l2Usable: 243 * 0.2, l4Planned: 243 * 0.15 }).l3, 0);
  const oneMinuteRich = allocateLayers(needs(1), { l1Usable: 6 * 0.55, l2Usable: 6 * 0.2, l4Planned: 6 * 0.15 });
  assert.deepEqual(oneMinuteRich, { l1: 3, l2: 1, l3: 1, l4: 1, l5: 0 }, "rounding no longer pushes extra shots to AI");
});
test("a topic with almost no archive coverage is still filled, by Layer 3", () => {
  const plan = allocateLayers(needs(60), { l1Usable: 20, l2Usable: 30, l4Planned: 40 });
  assert.equal(plan.l1 + plan.l2 + plan.l3 + plan.l4 + plan.l5, 324); assert.equal(plan.l5, 32); assert.equal(plan.l3, 202);
  assert.ok(plan.l3 > plan.l1 + plan.l2, "scarce topic is mostly reconstruction");
});
test("generous real coverage never adds AI or variants", () => {
  assert.deepEqual(allocateLayers(needs(10), { l1Usable: 100, l2Usable: 100, l4Planned: 10 }), { l1: 54, l2: 0, l3: 0, l4: 0, l5: 0 });
});
test("207-minute timeline splits into nearly equal ~10-minute chunks on hard cuts only", () => {
  const scenes = timeline(12420, 932);
  const result = planChunks(scenes);
  assert.equal(result.ok, true); const chunks = result.chunks;
  assert.equal(chunks.length, 21); assert.equal(chunks[0].startFrame, 0); assert.equal(chunks.at(-1).endFrame, 12420 * FPS);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  chunks.forEach((chunk, i) => {
    if (i > 0) assert.equal(chunk.startFrame, chunks[i - 1].endFrame);
    if (i < chunks.length - 1) assert.equal(byId.get(chunk.sceneIds.at(-1)).transitionOutFrames, 0, "chunk " + i + " ends on a hard cut");
    const seconds = (chunk.endFrame - chunk.startFrame) / FPS;
    assert.ok(seconds > 560 && seconds < 630, "chunk " + i + " is " + seconds + " s");
  });
});
test("10 minutes on one machine is one chunk; 40 minutes on 8 machines is 8 equal chunks", () => {
  assert.equal(planChunks(timeline(600, 45)).chunks.length, 1);
  const forty = planChunks(timeline(2400, 180), chunkOptionsFor(2400, 8)).chunks;
  assert.equal(forty.length, 8); assert.ok(forty.every((c) => Math.abs((c.endFrame - c.startFrame) / FPS - 300) <= 14));
});
test("a film just over two targets splits into two nearly equal chunks", () => {
  const result = planChunks(timeline(1260, 126, 1000), { targetChunkSeconds: 600, minChunkSeconds: 120 });
  assert.equal(result.chunks.length, 2); assert.equal(result.chunks.at(-1).endFrame, 1260 * FPS);
  assert.ok(result.chunks.every((c) => Math.abs((c.endFrame - c.startFrame) / FPS - 630) <= 10));
});
test("long films use whole waves, so no machine idles in the last one", () => {
  assert.equal(chooseChunkSeconds(12420, 20), 311);
  const chunks = planChunks(timeline(12420, 932), chunkOptionsFor(12420, 20)).chunks;
  assert.equal(chunks.length, 40);
  const span = renderMakespanSeconds(chunks.map((c) => (c.endFrame - c.startFrame) / FPS), 20);
  assert.ok(span <= 12420 / 20 + 30, "makespan " + span);
});
test("render estimate matches the real chunk plan across lengths and machine counts", () => {
  for (const machines of [1, 2, 4, 8, 20, 42]) {
    for (let d = 61; d <= 43200; d += 397) {
      const plan = planChunks(timeline(d, Math.ceil((d * 3) / 40)), chunkOptionsFor(d, machines));
      const realMinutes = (renderMakespanSeconds(plan.chunks.map((c) => (c.endFrame - c.startFrame) / FPS), machines) * FPS) / RUN_ASSUMPTIONS.renderFpsPerMachine / 60;
      const estimate = estimateRun(d, machines);
      assert.equal(estimate.chunks, plan.chunks.length, d + " s on " + machines);
      assert.ok(Math.abs(estimate.stages[3].minutes - realMinutes) <= Math.max(0.15 * realMinutes, 0.1), d + " s on " + machines + ": " + estimate.stages[3].minutes + " vs " + realMinutes.toFixed(2));
    }
  }
});
test("gaps, overlaps and empty scenes are rejected before rendering", () => {
  const gap = timeline(100, 10); gap[3] = { ...gap[3], startFrame: gap[3].startFrame + 1 };
  assert.match(planChunks(gap).error, /gap or overlap/);
  const empty = timeline(100, 10); empty[0] = { ...empty[0], endFrame: empty[0].startFrame };
  assert.match(planChunks(empty).error, /no frames/);
  assert.equal(planChunks([]).ok, false);
});
test("chunk length stays between 2 and 10 minutes", () => {
  assert.equal(chooseChunkSeconds(2400, 8), 300); assert.equal(chooseChunkSeconds(12420, 1), 592);
  assert.equal(chooseChunkSeconds(60, 30), 120); assert.equal(chooseChunkSeconds(600, 0), 600);
});
test("a 40-minute film finishes inside 30 minutes on 8 machines", () => {
  const run = estimateRun(2400, 8);
  assert.equal(run.chunks, 8); assert.ok(run.totalMinutes <= 30, "took " + run.totalMinutes);
  assert.equal(run.stages.length, 6);
});
test("fewer machines than chunks render in extra waves", () => {
  const one = estimateRun(2400, 1); const eight = estimateRun(2400, 8);
  assert.ok(one.totalMinutes > eight.totalMinutes); assert.equal(one.chunks, 4);
});

test("every retention beat stays inside the film and in story order, for every length from 1 s to 12 h", () => {
  for (let d = 1; d <= 43200; d += 1) {
    const plan = planRetention(d);
    const at = Object.fromEntries(plan.beats.filter((b) => b.kind !== "segment-reset" && b.kind !== "part-break").map((b) => [b.kind, b.atSeconds]));
    assert.ok(plan.beats.every((b) => b.atSeconds >= 0 && b.atSeconds <= d), d + ": beat outside the film");
    assert.ok(at.hook <= at.promise && at["midpoint-turn"] <= at.cliffhanger && at.cliffhanger <= at.payoff && at.payoff <= at.credits, d + ": story order");
    assert.equal(plan.segmentCount, 1 + plan.beats.filter((b) => b.kind === "segment-reset").length, d + ": segment count");
  }
});
test("a 10-minute film is split across machines instead of rendering on one", () => {
  const ten = estimateRun(600, 8);
  assert.equal(ten.chunks, planChunks(timeline(600, 45), chunkOptionsFor(600, 8)).chunks.length);
  assert.ok(ten.chunks >= 4); assert.ok(ten.stages[3].minutes < 5);
  assert.equal(estimateRun(600, 1).chunks, 1);
});
test("partial overrides and bad machine counts never produce NaN", () => {
  assert.equal(estimateRun(2400, 8, { renderFpsPerMachine: 12 }).totalMinutes, 24.8);
  const plan = allocateLayers(needs(60), { l1Usable: 20, l2Usable: 30 }, { variantMaxShare: 0.05 });
  assert.equal(plan.l1 + plan.l2 + plan.l3 + plan.l4 + plan.l5, 324);
  assert.equal(chooseChunkSeconds(2400, Number.NaN), 600); assert.ok(Number.isFinite(estimateRun(2400, Number.NaN).totalMinutes));
});
test("a numeric string counts as minutes", () => {
  assert.equal(needs("45").totalUniqueMedia, 243); assert.equal(calculateMediaNeeds("forty").ok, false); assert.equal(calculateMediaNeeds("").ok, false);
});
test("missing transition data or bad chunk lengths are rejected, and an unsplittable chunk is reported", () => {
  const scenes = timeline(2400, 180);
  assert.match(planChunks(scenes.map((scene) => ({ id: scene.id, startFrame: scene.startFrame, endFrame: scene.endFrame }))).error, /transitionOutFrames/);
  assert.match(planChunks(scenes, { targetChunkSeconds: Number.NaN }).error, /positive numbers/);
  const dissolves = planChunks(timeline(2400, 180, 1));
  assert.equal(dissolves.ok, true); assert.equal(dissolves.chunks.length, 1); assert.match(dissolves.warnings.join(" "), /too few hard cuts/); assert.match(dissolves.warnings.join(" "), /no hard cut came sooner/);
});

console.log(cases.map((item) => item.status + " " + item.name + (item.error ? " — " + item.error : "")).join("\n"));
const failures = cases.filter((item) => item.status === "FAIL");
console.log("\n" + (cases.length - failures.length) + "/" + cases.length + " documentary engine core cases passed.");
if (failures.length) process.exitCode = 1;
