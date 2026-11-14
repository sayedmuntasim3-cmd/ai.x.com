import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildExperimentContext, CONTEXT_FILE, MANUAL_FILE } from "./experiment-context.mjs";

const manual = readFileSync(MANUAL_FILE, "utf8");
const { text, kept, dropped } = buildExperimentContext(manual);

test("the committed Phase 0 context is exactly what the builder makes from today's manual", () => {
  assert.equal(readFileSync(CONTEXT_FILE, "utf8"), text, "run node local/experiment-context.mjs");
  assert.ok(Buffer.byteLength(text) < Buffer.byteLength(manual) * 0.8);
});

test("it keeps every section the script stages refer to", () => {
  for (const s of ["4. S0", "5. S1", "6. S2", "7. S3", "8. S4", "11. S5", "12. CHECKLISTS", "13. S6", "14. S7", "16. BANNED LIST"]) assert.ok(kept.some((k) => k.startsWith(s)), s);
  for (const marker of ["6.2 Rules", "6.4 NAMED-SUBJECT RULES", "6.5 SENSITIVE SUBJECTS", "11.1 FULL scene card", "11.3 Script rules", "NON-NEGOTIABLES"]) assert.ok(text.includes(marker), marker);
  assert.deepEqual(dropped.map((d) => d.split(" ")[0]), ["header", "17.", "18."]);
});

test("it leaves out the platform address, internal pipeline, chat protocol, growth strategy and Bangla-only material", () => {
  for (const banned of ["ai.zupona.com", "Copy everything", "Media Hunters", "squads", "ZUPONA STATE", "1M+ ENGINEERING", "10. Facebook pack", "9. Measurement plan", "7. Localisation", "1.2 Bangla standard", "Language: Bangla (bn-BD)", "(bn)", "Bangla by default", "Your first reply"]) assert.ok(!text.includes(banned), banned);
  assert.doesNotMatch(text, /api[_ ]?key|password/i);
  const bengaliLines = text.split("\n").filter((l) => /[ঀ-৿]/.test(l));
  assert.ok(bengaliLines.length <= 8, "only inline words inside multilingual rules remain");
});
