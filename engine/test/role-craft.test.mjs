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
  for (const stage of /** @type {const} */ (["V3", "V4", "V5", "V6", "MEDIA"])) assert.ok(roleCraft(stage).length / 3.8 < GROQ_PROMPT_LIMIT / 4, `${stage}: ${roleCraft(stage).length} chars`);
});

test("V6 QA audit: the Quality Checkers' words are in the prompt; findings are parsed, gated and scene-checked", async () => {
  const { auditVoiceFilm, QA_SYSTEM, qaSheet } = await import("../src/shot-plan.mjs");
  const b = await planBeats({ scenes, structure: u.structure, topic });
  const pics = await planVoiceVisuals({ scenes, structure: u.structure, topic });
  const plan = planShots({ markdown: pics.markdown, scenes, beats: b.beats, world: b.world, genre: b.genre, topic, structure: u.structure });
  for (const r of roleCraftRoles("V6")) for (const l of r.lines) assert.ok(QA_SYSTEM.includes(l), l.slice(0, 40));
  const sc = scenes[1].sc;
  const reply = [`FINDING | GATE: G2 | SCENE: ${sc} | DEFECT: the title card comes at 41 s | FIX: move it into the first 15 s`, "FINDING | GATE: G99 | SCENE: - | DEFECT: not a real gate", `FINDING | GATE: G4 | SCENE: SC9999 | DEFECT: no interrupt for 90 s`, "chatter"].join("\n");
  /** @type {any[]} */ const seen = [];
  const brain = /** @type {any} */ ({ call: async (/** @type {any} */ r) => { seen.push(r); return { text: reply, stopReason: "end_turn", usage: {} }; } });
  const r = await auditVoiceFilm({ brain, shots: plan.shots, scenes, hook: plan.hook });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].stage, "V6");
  assert.ok(seen[0].system[0].text.includes("Adversarial: assume something is wrong"));
  assert.ok(seen[0].messages[0].content[0].text.includes("HOOK (first 60 s"));
  assert.deepEqual(r.findings.map((f) => [f.code, f.shot]), [["qa-G2", sc], ["qa-G4", "-"]]);
  assert.match(r.findings[0].detail, /Fix: move it/);
  assert.equal((await auditVoiceFilm({ brain: null, shots: plan.shots, scenes, hook: plan.hook })).called, 0);
  assert.ok(qaSheet({ shots: plan.shots, scenes, hook: plan.hook }).length < 8000);
  const quota = /** @type {any} */ ({ call: async () => { throw Object.assign(new Error("daily quota"), { status: 429 }); } });
  assert.match((await auditVoiceFilm({ brain: quota, shots: plan.shots, scenes, hook: plan.hook })).stopped, /quota/);
});

test("rights, audio, map and kinetic desks are wired into their stages", () => {
  const stagesOf = (id) => ROLE_CRAFT.find((r) => r.id === id)?.stages ?? [];
  assert.ok(stagesOf("footage-rights-gate").includes("MEDIA") && stagesOf("footage-license").includes("MEDIA"));
  assert.ok(stagesOf("audio-music-arc").includes("S4") && stagesOf("audio-sound-effects").includes("S4"));
  for (const id of ["animation-kinetic-type", "animation-map-motion"]) for (const s of ["V4", "S4", "S5"]) assert.ok(stagesOf(id).includes(s), `${id} ${s}`);
  assert.match(roleCraft("MEDIA"), /Unknown licence, NC or ND/);
  assert.match(roleCraft("V4"), /Map data and tiles carry their own licences/);
  assert.match(roleCraft("V4"), /FX-SPLIT/);
  assert.match(roleCraft("S4"), /SFX tags/);
});
