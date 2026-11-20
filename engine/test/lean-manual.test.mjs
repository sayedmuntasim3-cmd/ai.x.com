import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leanManual, manualSections, STAGE_SECTIONS } from "../src/lean-manual.mjs";

const MANUAL = readFileSync(new URL("../../prompts/1-zupona-master-engine-full.txt", import.meta.url), "utf8");

test("the manual splits into its numbered sections and nothing is lost", () => {
  const s = manualSections(MANUAL);
  for (const k of ["head", "NN", "0", "1", "6", "11", "12", "16", "18"]) assert.ok(s.has(k), k);
  assert.equal([...s.values()].join("\n").replace(/\s+/g, ""), MANUAL.replace(/\s+/g, ""));
});

test("every stage keeps the non-negotiables, language and banned list, and its own section; an unknown stage gets everything", () => {
  for (const stage of Object.keys(STAGE_SECTIONS)) {
    const lean = leanManual(MANUAL, `${stage}:C1`);
    assert.ok(lean.length < MANUAL.length * 0.5, `${stage}: ${lean.length}`);
    assert.match(lean, /NON-NEGOTIABLES/);
    assert.match(lean, /16\. BANNED LIST/);
  }
  assert.match(leanManual(MANUAL, "s5:C2"), /11\. S5 — SCRIPT AND SCENE MANIFEST/);
  assert.match(leanManual(MANUAL, "s2"), /6\. S2 — CLAIM LEDGER/);
  assert.equal(leanManual(MANUAL, "something-new"), MANUAL);
  assert.equal(leanManual("no banners here", "s5"), "no banners here");
});
