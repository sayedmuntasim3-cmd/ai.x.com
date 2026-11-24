import assert from "node:assert/strict";
import test from "node:test";
import { curtainWindows, deepestDuckDb, gainPlan, MIX, mergeWindows, musicGainAt, musicGainExpression, voiceWindows } from "./mix.mjs";

test("windows that touch merge, so one duck is one ramp", () => {
  assert.deepEqual(mergeWindows([{ start: 1, end: 2 }, { start: 2.05, end: 3 }, { start: 6, end: 7 }]), [{ start: 1, end: 3 }, { start: 6, end: 7 }]);
  assert.deepEqual(mergeWindows([{ start: 0, end: 1 }, { start: 1.5, end: 2 }], 0.6), [{ start: 0, end: 2 }]);
  assert.deepEqual(mergeWindows([]), []);
});

test("the music ducks only under the spoken pieces", () => {
  const pieces = [
    { start: 0, end: 2, file: "/v/a.wav" },
    { start: 2, end: 4, file: null },
    { start: 4, end: 6, file: "/v/b.wav" },
  ];
  assert.deepEqual(voiceWindows(pieces), [{ start: 0, end: 2 }, { start: 4, end: 6 }]);
});

test("a riser and a flash leave the music out: the reveal lands in a hole, not on a wall", () => {
  const sounds = [
    { token: "AUTO-RISER", kind: "hit", start: 9.4, end: 11 },
    { token: "AUTO-BOOM", kind: "hit", start: 20, end: 22.4 },
    { token: "AUTO-WHOOSH", kind: "hit", start: 30, end: 30.55 },
    { token: "SND-AMB-01", kind: "bed", start: 0, end: 60 },
  ];
  const w = curtainWindows(sounds);
  assert.equal(w.length, 2);
  assert.equal(w[0].start, 9.32);
  assert.equal(w[0].end, 11.3);
  assert.equal(w[1].start, 19.65);
  // A whoosh and an ambience bed never cut the music.
  assert.ok(!w.some((x) => x.start < 12 && x.start > 11));
});

test("a curtain wins over a duck where they overlap", () => {
  const plan = gainPlan({ voice: [{ start: 8, end: 12 }], curtains: [{ start: 9.32, end: 11.3 }] });
  assert.equal(plan.length, 2);
  assert.equal(plan.find((w) => w.gain === 0)?.start, 9.32);
});

test("the duck is at least 8 dB and the curtain is silent", () => {
  const plan = gainPlan({ voice: [{ start: 8, end: 12 }], curtains: [{ start: 20, end: 21 }] });
  assert.ok(deepestDuckDb(plan) <= -8, `the duck is ${deepestDuckDb(plan)} dB`);
  assert.ok(Math.abs(musicGainAt(10, plan) - MIX.music * MIX.duck) < 1e-9);
  assert.equal(musicGainAt(5, plan), MIX.music);
  assert.equal(musicGainAt(20.5, plan), 0);
  // It ramps, it does not step: a quarter of the way in the music is only part-way down.
  const early = musicGainAt(8 + MIX.attack / 4, plan);
  assert.ok(early < MIX.music && early > MIX.music * MIX.duck);
  // And it comes back after the voice.
  assert.equal(musicGainAt(12 + MIX.release + 0.01, plan), MIX.music);
});

test("the plan becomes one ffmpeg volume expression, and an empty plan is the plain level", () => {
  assert.equal(musicGainExpression([]), String(MIX.music));
  const expr = musicGainExpression(gainPlan({ voice: [{ start: 1.5, end: 3 }], curtains: [{ start: 9.32, end: 11.3 }] }));
  assert.match(expr, /^0\.3\*/);
  assert.equal((expr.match(/clip\(/g) ?? []).length, 4, "a ramp down and a ramp up for each window");
  assert.ok(!/NaN|undefined/.test(expr));
});
