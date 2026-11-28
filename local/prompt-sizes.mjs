#!/usr/bin/env node
/**
 * The prompt-size table of a 12-minute film (task I1): how large each stage's request is with the whole
 * production manual, with the lean manual the Worker cuts it to, and — after splitting — the largest part
 * the brain was actually sent. No API key, no network: the fixture brain answers every stage.
 *
 *   node local/prompt-sizes.mjs
 *
 * A stage whose lean request is over GROQ_PROMPT_LIMIT (7,200 tokens) cannot run on free Groq as one call;
 * before splitting it went to Gemini, whose free key allows 20 requests a day.
 */
import { readFileSync } from "node:fs";
import { filmBrief, ROLE_CRAFT_STAGES, runFilm, splitBrief } from "../engine/src/film-run.mjs";
import { leanManual, splitManual } from "../engine/src/lean-manual.mjs";
import { GROQ_PROMPT_LIMIT, textTokens } from "../engine/src/film-split.mjs";
import { roleCraft } from "../engine/src/role-craft.mjs";
import { splitFilmRun } from "../engine/test/fixtures/split-brain.mjs";

const MANUAL = readFileSync(new URL("../prompts/1-zupona-master-engine-full.txt", import.meta.url), "utf8");
const args = splitFilmRun();
const brief = filmBrief(args.film);
const state = await runFilm(args);

/** @param {string} stage */
const craft = (stage) => {
  const key = /** @type {Record<string, any>} */ (ROLE_CRAFT_STAGES)[stage.split(":")[0]];
  return key ? textTokens(roleCraft(key)) : 0;
};
/** @param {string} stage */
const fixed = (stage) => ({
  whole: textTokens(MANUAL) + textTokens(brief) + craft(stage),
  lean: textTokens(leanManual(MANUAL, stage)) + textTokens(brief) + craft(stage),
  part: textTokens(splitManual(MANUAL, stage)) + textTokens(splitBrief(args.film)) + craft(stage),
});

const rows = new Map();
for (const call of args.model.sent) {
  const stage = call.stage.split(":")[0];
  const row = rows.get(stage) ?? { calls: 0, largest: 0, total: 0 };
  row.calls += 1;
  row.largest = Math.max(row.largest, call.tokens);
  row.total += call.tokens;
  rows.set(stage, row);
}

const pad = (/** @type {string | number} */ v, /** @type {number} */ n) => String(v).padEnd(n);
console.log(`A 12-minute film ("${args.film.topic}"), ${args.film.durationSeconds / 60} min, ${Object.keys(state.stages).length} stages.`);
console.log(`Groq's limit: ${GROQ_PROMPT_LIMIT} prompt tokens a request (estimate: 3.8 characters a token).\n`);
console.log(pad("stage", 14) + pad("whole manual", 14) + pad("lean manual", 13) + pad("today + material", 17) + pad("calls", 7) + pad("largest part", 14) + "over limit?");
for (const [stage, row] of rows) {
  const f = fixed(stage);
  // The stage's own material, as the parts carried it: every part is its fixed prompt plus its share.
  const material = Math.max(0, row.total - row.calls * f.part);
  const today = f.lean + material;
  const over = today > GROQ_PROMPT_LIMIT ? "yes (split)" : "no";
  console.log(pad(stage, 14) + pad(f.whole, 14) + pad(f.lean, 13) + pad(today, 17) + pad(row.calls, 7) + pad(row.largest, 14) + over);
}
console.log(`\nLargest prompt sent: ${Math.max(...args.model.sent.map((c) => c.tokens))} tokens. All under the limit: ${args.model.sent.every((c) => c.tokens <= GROQ_PROMPT_LIMIT)}.`);
console.log(`Run status: ${state.status}${state.gaps.length ? ` (${state.gaps.length} gaps)` : ""}.`);
