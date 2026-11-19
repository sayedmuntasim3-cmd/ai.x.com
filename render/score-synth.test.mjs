import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scorePlan } from "../engine/src/score-plan.mjs";
import { scoreKit, synthCue } from "./score-synth.mjs";

test("a cue plays for its length in stereo, enters and ends softly, never clips, and is the same every time", () => {
  const plan = scorePlan({ cue: "M01", brief: "Tense pulse, low string ostinato, sub hits", bpm: 120 });
  const [l, r] = synthCue(plan, 12);
  assert.equal(l.length, 12 * 48000);
  assert.equal(r.length, l.length);
  let peak = 0;
  for (const x of [l, r]) for (const v of x) peak = Math.max(peak, Math.abs(v));
  assert.ok(peak <= 0.95 && peak > 0.1, `peak ${peak}`);
  assert.ok(Math.abs(l[0]) < 1e-3 && Math.abs(l[l.length - 1]) < 1e-3, "fades in and out");
  const h = (/** @type {Float32Array} */ x) => createHash("sha256").update(Buffer.from(x.buffer)).digest("hex");
  assert.equal(h(synthCue(plan, 12)[0]), h(l));
});

test("the kit keeps tracks that exist, scores the rest, and refuses a film without instruments", () => {
  const dir = mkdtempSync(join(tmpdir(), "score-"));
  writeFileSync(join(dir, "M01.mp3"), "a chosen track");
  const cues = [{ cue: "M01", brief: "Tense pulse", bpm: 120 }, { cue: "M02", brief: "Warm nylon guitar", bpm: 80 }];
  const r = scoreKit({ cues, lengths: { M01: 20, M02: 11 }, outDir: dir, policy: { policy: "score" } });
  assert.equal(r.kept, 1);
  assert.deepEqual(r.made.map((m) => m.cue), ["M02"]);
  assert.ok(existsSync(join(dir, "M02.wav")));
  const none = scoreKit({ cues, lengths: { M01: 20 }, outDir: mkdtempSync(join(tmpdir(), "score-")), policy: { policy: "no-instruments" } });
  assert.match(none.refused ?? "", /no instruments/);
  assert.equal(none.made.length, 0);
});
