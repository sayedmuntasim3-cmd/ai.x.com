import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHARS_PER_TOKEN, chunkLines, claimDigest, factGroups, GROQ_PROMPT_LIMIT, mergeJson, mergeParts, promptTokens, sceneClock, sceneGroups, sectionFrom, textTokens } from "../src/film-split.mjs";
import { splitManual, manualSections } from "../src/lean-manual.mjs";
import { filmBrief, splitBrief } from "../src/film-run.mjs";

const MANUAL = readFileSync(new URL("../../prompts/1-zupona-master-engine-full.txt", import.meta.url), "utf8");

test("the estimate follows the Worker's (3.8 characters a token) and counts text, not pictures", () => {
  assert.equal(CHARS_PER_TOKEN, 3.8);
  assert.equal(textTokens("x".repeat(38)), 10);
  assert.equal(promptTokens([{ text: "x".repeat(38) }, { text: "", image: "https://x/a.jpg" }]), 12);
  assert.equal(GROQ_PROMPT_LIMIT, 7200);
});

test("a long text is split at line boundaries, nothing is lost, and every chunk fits", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line ${i} ${"y".repeat(30)}`);
  const text = lines.join("\n");
  const chunks = chunkLines(text, 400);
  assert.ok(chunks.length > 1);
  for (const chunk of chunks) assert.ok(chunk.length <= 400, `${chunk.length}`);
  assert.equal(chunks.join("\n"), text, "the same lines in the same order");
  // A single line longer than the budget is cut at a space, never dropped.
  const long = chunkLines("a".repeat(100) + " " + "b".repeat(100), 50);
  assert.ok(long.every((c) => c.length <= 50));
  assert.equal(long.join("").replace(/\s+/g, ""), "a".repeat(100) + "b".repeat(100), "every character is kept");
});

test("a chapter splits into scene groups that tile it exactly, with a clock for every scene", () => {
  assert.deepEqual(sceneGroups(1, 12, 5), [{ first: 1, last: 5 }, { first: 6, last: 10 }, { first: 11, last: 12 }]);
  assert.deepEqual(sceneGroups(1, 3, 10), [{ first: 1, last: 3 }]);
  assert.equal(sceneClock(0, 60, 1, 6, 1), "0:00:00-0:00:10");
  assert.equal(sceneClock(0, 60, 1, 6, 6), "0:00:50-0:01:00");
  assert.equal(sceneClock(360, 720, 37, 72, 72), "0:11:50-0:12:00");
});

test("research facts are grouped whole: every fact in one group, none cut in half", () => {
  const facts = Array.from({ length: 9 }, (_, i) => ({ id: `F0${i}`, claim: `c${i}`, value: "v".repeat(80), sources: [`https://e.org/${i}`] }));
  const groups = factGroups(JSON.stringify({ subject: "s", facts, unknowns: [] }), 500);
  assert.ok(groups.length > 1);
  assert.deepEqual(groups.flatMap((g) => g.facts.map((f) => f.id)), facts.map((f) => f.id));
  for (const g of groups) assert.ok(JSON.parse(g.text).facts.length > 0);
  assert.deepEqual(factGroups("not json", 100), [{ facts: [], text: "not json" }]);
});

test("the ledger digest keeps every claim and drops the evidence columns", () => {
  const s2 = ["| ID | Claim | Status | Value | Sources | Confidence | Chapter use |", "| --- | --- | --- | --- | --- | --- | --- |", "| C01 | The bridge fell | FACT | 1940 | https://e.org/a | high | C1 |", "| C02 | Winds of 42 mph | FACT | 42 | https://e.org/b | high | C2 |"].join("\n");
  const chunks = claimDigest(s2, 2000);
  assert.equal(chunks.length, 1);
  assert.match(chunks[0], /C01 \| The bridge fell \| FACT \| 1940 \|/);
  assert.doesNotMatch(chunks[0], /e\.org/);
  assert.match(chunks[0], /C02/);
});

test("a named block is taken from a stage's output, and merging keeps order without repeats", () => {
  const md = "## S4\nnarrator\n## WRITER PACK\nvoice: warm\nlook: cold\n## Appendix\nx";
  assert.match(sectionFrom(md, /writer pack/i), /voice: warm/);
  assert.doesNotMatch(sectionFrom(md, /writer pack/i), /Appendix/);
  assert.equal(sectionFrom(md, /nothing/i), "");
  assert.equal(mergeParts(["a\nb", "b\nc", ""]).replace(/\n+/g, "\n"), "a\nb\nc", "the repeated line is not printed twice");
  assert.deepEqual(mergeJson([{ mustFix: [{ x: 1 }], passed: ["a"] }, { mustFix: [{ x: 2 }], notChecked: ["b"] }], "object"), { mustFix: [{ x: 1 }, { x: 2 }], passed: ["a"], notChecked: ["b"] });
  assert.deepEqual(mergeJson([[{ scenes: "C1" }], [{ scenes: "C2" }]], "array"), [{ scenes: "C1" }, { scenes: "C2" }]);
});

test("a split part's manual, short brief and role craft leave room inside Groq's limit", () => {
  // The whole manual would never fit; the stage's own sections must, or splitting cannot work.
  assert.ok(textTokens(MANUAL) > GROQ_PROMPT_LIMIT);
  assert.ok(manualSections(MANUAL).size >= 10, "the manual has its banner sections");
  for (const stage of ["s01", "s2", "s3", "s4", "s5", "qa", "s6", "s7", "edit"]) {
    assert.ok(textTokens(splitManual(MANUAL, stage)) + textTokens(splitBrief({ id: "x", topic: "Tacoma Narrows", durationSeconds: 720, versionId: "en-US" })) < GROQ_PROMPT_LIMIT * 0.75, `${stage} manual`);
  }
  const film = { id: "x", topic: "Why the Tacoma Narrows Bridge fell", durationSeconds: 720, versionId: "en-US" };
  const short = splitBrief(film);
  assert.ok(short.length > 0 && short.length < filmBrief(film).length / 3);
  assert.match(short, /FILM: "Why the Tacoma Narrows Bridge fell".*Runtime exactly 0:12:00/);
  assert.match(short, /VERSION LOCK/);
  assert.match(short, /Facts only from the research file/);
});
