import assert from "node:assert/strict";
import { test } from "node:test";
import { runFilm } from "../src/film-run.mjs";
import { checkChapter, parseSceneLines, toSeconds } from "../src/scene-lines.mjs";
import { LIMIT, splitFilmRun } from "./fixtures/split-brain.mjs";

test("a 12-minute film finishes on a brain that limits one prompt: every call under the limit, the merged chapters pass code", async () => {
  const args = splitFilmRun();
  const { model, store } = args;
  const state = await runFilm(args);

  assert.ok(state.status.startsWith("done"), JSON.stringify(state.gaps));
  // The only gaps are craft notes about the scripted lines, not broken stages.
  for (const gap of state.gaps) assert.match(String(gap), /^(hook \(hook-vague\)|C[12] edit: \d+ shots? hold)/, String(gap));
  assert.equal(JSON.parse(String(store.m.get("film-check.json"))).ok, true, "the whole film passes its code checks");

  // Every prompt fit the brain's limit (the fixture brain refuses one that does not).
  assert.ok(model.sent.every((s) => s.tokens <= LIMIT));
  assert.ok(model.sent.length > 8, "the stages really were split into parts");
  const stages = new Set(model.sent.map((s) => s.stage.split(":")[0]));
  for (const stage of ["s01", "s2", "s3", "s4", "s5", "qa", "edit", "s6", "s7"]) assert.ok(stages.has(stage), `${stage} ran`);
  assert.ok(model.sent.some((s) => s.stage.startsWith("s5:C1:")) && model.sent.some((s) => s.stage.startsWith("s5:C2:")), "each chapter was written in scene groups");
  assert.ok(model.sent.some((s) => s.stage === "s4:3"), "the bibles were written in groups");
  assert.ok(model.sent.filter((s) => s.stage.split(":")[0] === "s2").length > 1, "the ledger was written in fact groups");

  // The merged parts are the stage's own output, in its format, and pass the stage's own checks.
  const chapters = JSON.parse(String(store.m.get("s3-chapters.json")));
  assert.equal(chapters.length, 2);
  for (const c of chapters) {
    const markdown = String(store.m.get(`s5-${c.id}.md`));
    const spec = { startSeconds: toSeconds(c.start), endSeconds: toSeconds(c.end), firstScene: Number(c.firstScene.slice(2)), lastScene: Number(c.lastScene.slice(2)), versionId: "en-US" };
    const check = checkChapter(markdown, spec);
    assert.deepEqual(check.errors, [], `${c.id}: ${check.errors.map((e) => `${e.code} ${e.detail}`).join(" | ")}`);
    assert.equal(parseSceneLines(markdown).length, 36, `${c.id} has every scene, each written once`);
  }
  assert.match(String(store.m.get("s4.md")), /## Narrator[\s\S]*## Master look[\s\S]*## Sound bible[\s\S]*## WRITER PACK/, "the bibles merge in order");
  assert.match(String(store.m.get("s2.md")), /C01 \| The span twisted/);
  assert.match(String(store.m.get("s7.md")), /\*\*Final title: /);
});
