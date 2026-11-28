import test from "node:test";
import assert from "node:assert/strict";
import { buildDigest, classifyLog, digestMarkdown, topFixes, FAILURE_CAUSES } from "../src/health-digest.mjs";

const now = new Date("2026-11-29T20:00:00Z");
const run = (o) => ({ workflow: "voice-film.yml", product: "voiceover", id: "r1", status: "completed", conclusion: "success", createdAt: "2026-11-29T10:30:00Z", jobs: [], ...o });

test("classifyLog names the cause, the gate's BLOCK lines, brain requests and provider failures", () => {
  const log = ["BLOCK: 3 black frames", "BLOCK: no title card", "- Free brain calls: 41 (llama 30, qwen 11)", "Library of Congress answered 429 challenge", "groq: day used up"].join("\n");
  const c = classifyLog(log);
  assert.deepEqual(c.blocks, ["3 black frames", "no title card"]);
  assert.equal(c.brainCalls, 41);
  assert.ok(c.causes.includes("gate-block") && c.causes.includes("groq-daily") && c.causes.includes("loc-challenge"));
  assert.deepEqual(c.providerFailures, { "Library of Congress": 1 });
});

test("every failure cause carries a fix an agent can act on", () => {
  for (const c of FAILURE_CAUSES) assert.ok(c.fix.length > 30 && c.text.length > 10, c.code);
});

test("digest: counts the window only, per product, with minutes per stage", () => {
  const d = buildDigest({
    now,
    runs: [
      run({ id: "a", jobs: [{ name: "film", minutes: 90 }] }),
      run({ id: "b", conclusion: "failure", jobs: [{ name: "film", minutes: 30 }], log: classifyLog("BLOCK: black frame\ngroq: day used up") }),
      run({ id: "old", createdAt: "2026-11-20T10:00:00Z" }),
      run({ id: "c", workflow: "daily-film.yml", product: "daily-script", status: "in_progress", conclusion: null }),
    ],
    ideaFilms: [{ id: "i1", topic: "Tay Bridge", status: "done", createdAt: "2026-11-29T09:00:00Z" }, { id: "i0", status: "done", createdAt: "2026-11-01T00:00:00Z" }],
  });
  assert.equal(d.films.voiceover.total, 2);
  assert.equal(d.films.voiceover.passed, 1);
  assert.equal(d.films.voiceover.failed, 1);
  assert.equal(d.films.dailyScript.running, 1);
  assert.equal(d.films.idea.total, 1);
  assert.deepEqual(d.stageMinutes["voiceover: film"], { n: 2, average: 60, longest: 90 });
  assert.deepEqual(d.blockReasons, [{ reason: "black frame", count: 1 }]);
  assert.equal(d.topFixes.length >= 1 && d.topFixes.length <= 3, true);
  assert.match(d.topFixes[0], /daily limit/);
  assert.match(digestMarkdown(d), /3 things to fix first/);
});

test("an empty day is the first thing to fix, never 'all fine'", () => {
  const d = buildDigest({ now, runs: [], ideaFilms: [] });
  assert.match(d.topFixes[0], /No film started/);
});

test("a quiet good day points at raising craft", () => {
  const d = buildDigest({ now, runs: [run({})] });
  assert.match(topFixes(d)[0], /Raise the bar|raise craft/);
});
