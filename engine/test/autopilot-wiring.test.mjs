import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

// Autopilot guards (docs/AUTOPILOT.md): the knowledge the platform learned must be read by the machine at film
// time, and the product must not depend on Claude. If one of these fails, a refactor orphaned a finding or
// made a paid brain a default: fix the code, never the test.
const root = new URL("../../", import.meta.url);
const read = (f) => readFileSync(new URL(f, root), "utf8");

test("research findings are read by product code, not only documented", () => {
  const consumers = [
    ["engine/src/role-craft.mjs (squad prompts)", "engine/src/film-run.mjs", /from "\.\/role-craft\.mjs"/],
    ["engine/src/role-craft.mjs (squad prompts)", "engine/src/shot-plan.mjs", /from "\.\/role-craft\.mjs"/],
    ["engine/src/role-craft.mjs (squad prompts)", "engine/src/voice-visuals.mjs", /from "\.\/role-craft\.mjs"/],
    ["engine/data/reference-prior.json (packaging prior)", "worker/index.mjs", /engine\/data\/reference-prior\.json/],
    ["engine/src/reference-prior.mjs", "engine/src/film-run.mjs", /from "\.\/reference-prior\.mjs"/],
    ["engine/src/craft-memory.mjs (doctrine and ledger)", "worker/voice-api.mjs", /engine\/src\/craft-memory\.mjs/],
    ["engine/src/health-digest.mjs", "local/health-digest.mjs", /engine\/src\/health-digest\.mjs/],
    ["engine/src/reference-bar.mjs", "local/bar-check.mjs", /engine\/src\/reference-bar\.mjs/],
  ];
  for (const [what, file, pattern] of consumers) assert.ok(pattern.test(read(file)), `${file} must read ${what}`);
});

test("the Worker serves the daily report and the workflow that feeds it exists", () => {
  assert.match(read("worker/index.mjs"), /handleHealthReport/);
  const wf = read(".github/workflows/health-digest.yml");
  assert.match(wf, /cron:/);
  assert.match(wf, /id-token: write/);
});

test("no paid brain is ever the default", () => {
  const brain = read("worker/brain.mjs");
  assert.match(brain, /The paid brain \(claude\) is never chosen unless BRAIN names/);
  assert.match(read("local/voice-film.mjs"), /BRAIN=claude is refused here/);
  assert.ok(!/ANTHROPIC_API_KEY/.test(read(".github/workflows/daily-film.yml")), "the daily film must not need an Anthropic key");
});

test("the handbook and its prompt exist and carry the hard rules", () => {
  assert.ok(existsSync(new URL("docs/AUTOPILOT.md", root)));
  const prompt = read("docs/AUTOPILOT_PROMPT.txt");
  for (const rule of [/never lower/i, /landing page/i, /paid/i, /force-push/i, /health report/i, /ONE problem|single most important/i]) assert.match(prompt, rule);
});
