import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ROLE_CRAFT, roleCraft, roleCraftRoles } from "../src/role-craft.mjs";
import { understandVoice } from "../src/voice-understand.mjs";
import { directEdit, planBeats, planShots } from "../src/shot-plan.mjs";
import { planVoiceVisuals } from "../src/voice-visuals.mjs";
import { AGENTS, ROLE_STATUS } from "../src/agent-roster.mjs";
import { GROQ_PROMPT_LIMIT } from "../../worker/groq.mjs";

const SQUADS = readFileSync(new URL("../../prompts/4-zupona-squad-brains.txt", import.meta.url), "utf8");

const text = "In 1940 a new bridge opened over the Tacoma Narrows in Washington. Four months later a moderate wind twisted its steel deck apart. " +
  "Engineers had trusted a theory that left out the wind. The bridge fell into the water on a November morning in 1940, and the film of it still teaches every student. " +
  "Today the replacement bridge stands in the same strait, built after years of wind tunnel tests.";
let t = 0;
const words = text.split(" ").map((w) => { const x = { text: w, start: t, end: t + 0.38 }; t += /[.!?]$/.test(w) ? 0.9 : 0.42; return x; });
const u = understandVoice({ transcript: { words }, totalSeconds: t + 1 });
const scenes = /** @type {NonNullable<typeof u.scenes>} */ (u.scenes);
const topic = "Tacoma Narrows Bridge collapse 1940";

/** A brain that records every system and user prompt it is sent and answers nothing useful. */
function spy() {
  /** @type {{ stage: string, system: string, user: string }[]} */
  const seen = [];
  return { seen, brain: /** @type {any} */ ({ name: "spy", call: async (/** @type {any} */ r) => { seen.push({ stage: r.stage, system: r.system.map((/** @type {any} */ b) => b.text).join("\n"), user: r.messages.map((/** @type {any} */ m) => m.content.map((/** @type {any} */ b) => b.text).join("\n")).join("\n") }); return { text: "", stopReason: "end_turn", usage: {} }; } }) };
}

test("every craft line is copied word for word from prompts/4 (no drift, no rewording)", () => {
  assert.ok(ROLE_CRAFT.length >= 8);
  for (const r of ROLE_CRAFT) {
    assert.ok(r.lines.length > 0, r.id);
    for (const l of r.lines) assert.ok(SQUADS.includes(l), `${r.id}: ${l.slice(0, 60)}`);
  }
});

test("every craft role is a real roster role and its status says the run sends its words", () => {
  const ids = new Set(AGENTS.map((a) => a.id));
  for (const r of ROLE_CRAFT) {
    assert.ok(ids.has(r.id), r.id);
    assert.match(ROLE_STATUS[r.id][1], /role-craft\.mjs/, `${r.id}: ROLE_STATUS must say the squad prompt is sent`);
  }
});

test("V3 director pass sends the Visual Director, Hook Writer and Cadence roles' own words", async () => {
  const { seen, brain } = spy();
  await planBeats({ scenes, structure: u.structure, topic, brain });
  assert.ok(seen.length > 0);
  for (const s of seen) {
    assert.equal(s.stage, "V3");
    for (const r of roleCraftRoles("V3")) for (const l of r.lines) assert.ok(s.system.includes(l), `${r.id}: ${l.slice(0, 50)}`);
    assert.match(s.system, /Evidence slots are literal/);
    assert.match(s.system, /Hook \(first 30 s\)/);
  }
});

test("V4 picture pass sends the motion, colour, archive and query roles' own words", async () => {
  const { seen, brain } = spy();
  await planVoiceVisuals({ scenes, structure: u.structure, topic, brain });
  assert.ok(seen.length > 0);
  for (const s of seen) {
    assert.equal(s.stage, "V4");
    for (const r of roleCraftRoles("V4")) for (const l of r.lines) assert.ok(s.system.includes(l), `${r.id}: ${l.slice(0, 50)}`);
    assert.match(s.system, /Restraint is quality/);
    assert.match(s.system, /FX-FILM/);
    assert.match(s.system, /Pexels, Pixabay, Mixkit/);
  }
});

test("V5 edit pass sends the edit-grammar and cadence roles' own words", async () => {
  const b = await planBeats({ scenes, structure: u.structure, topic });
  const pics = await planVoiceVisuals({ scenes, structure: u.structure, topic });
  const plan = planShots({ markdown: pics.markdown, scenes, beats: b.beats, world: b.world, genre: b.genre, topic, structure: u.structure });
  const { seen, brain } = spy();
  await directEdit({ markdown: plan.markdown, brain, code: plan.edit, genre: b.genre });
  assert.ok(seen.length > 0);
  for (const s of seen) {
    assert.equal(s.stage, "V5");
    for (const r of roleCraftRoles("V5")) for (const l of r.lines) assert.ok(s.system.includes(l), `${r.id}: ${l.slice(0, 50)}`);
    assert.match(s.system, /Default transition is the straight cut/);
  }
});

test("the craft stays small enough for the free Groq brain: each pass's standing prompt is a fraction of its 7,200-token limit", () => {
  for (const stage of /** @type {const} */ (["V3", "V4", "V5"])) assert.ok(roleCraft(stage).length / 3.8 < GROQ_PROMPT_LIMIT / 4, `${stage}: ${roleCraft(stage).length} chars`);
});
