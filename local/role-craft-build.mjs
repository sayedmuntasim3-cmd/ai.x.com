#!/usr/bin/env node
/**
 * Writes engine/src/role-craft.mjs: the lines of prompts/4 (the squad runtime prompts) that the
 * voiceover film run sends to the free brain, copied word for word, grouped by role and stage.
 *   node local/role-craft-build.mjs          write the module
 *   node local/role-craft-build.mjs --check  fail when the module is out of date with prompts/4
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = readFileSync(join(ROOT, "prompts/4-zupona-squad-brains.txt"), "utf8");
const OUT = join(ROOT, "engine/src/role-craft.mjs");

/** squad number in prompts/4 -> its text */
const squads = new Map(SRC.split(/^##### (\d+)\. .*#####$/m).slice(1).reduce((acc, v, i, a) => (i % 2 === 0 ? [...acc, [Number(v), a[i + 1]]] : acc), /** @type {[number, string][]} */ ([])));
/** @param {number} n @param {string} prefix */
function line(n, prefix) {
  const hits = (squads.get(n) ?? "").split("\n").filter((l) => l.startsWith(prefix));
  if (hits.length !== 1) throw new Error(`prompts/4 squad ${n}: ${hits.length} lines start with "${prefix}"`);
  return hits[0].trimEnd();
}

/** role id -> { stages, squad, title, lines }. Stages: V3 director, V4 picture plan, V5 edit director, V6 QA audit (voice films);
 *  S4 bibles, S5 scenes, MEDIA footage judge (script films; the edit stage uses V5). */
const SPEC = [
  { id: "cinematography-visual-director", stages: ["V3", "S5"], squad: 1, title: "Visual Director (Media Hunters: Slot Interpreter, Literalness Judge)", prefixes: ["- Evidence slots are literal", "- Illustrative slots are on-mood", "- Negative-context slots never get", "- Expert panel: before ranking"] },
  { id: "story-opening-hook", stages: ["V3", "S5"], squad: 4, title: "Hook Writer (Viral Story Builders)", prefixes: ["Hook (first 30 s)", "- Real reversals from the record", "- But/therefore causality"] },
  { id: "editing-pace", stages: ["V3", "S5"], squad: 7, title: "Cadence Designer and Beat Scheduler (Timeline Composers)", prefixes: ["- Hook 15-30 events per minute", "- A pattern interrupt about every 25 s", "- A reset about every 3 min", "- Restraint before reveals"] },
  { id: "animation-motion-director", stages: ["V4", "S4", "S5"], squad: 5, title: "Parallax and Ken Burns Designer (Visual Enhancers)", prefixes: ["- Panel: a colourist, a motion designer", "- Ask of every treatment", "- Restraint is quality", "- FX-ARCHIVE", "- FX-FILM", "- Never replicas of real newspapers", "- Accessibility: text contrast"] },
  { id: "animation-kinetic-type", stages: ["V4", "S4", "S5"], squad: 5, title: "Kinetic Type Designer and Document and Evidence Designer (Visual Enhancers)", prefixes: ["- FX-KINETIC", "- FX-PAPER", "- FX-SPLIT", "- FX-COUNTER", "- FX-SOURCECHIP", "- Fonts: OFL", "- Editorial-only and CC BY-SA assets", "- Every number on screen matches"] },
  { id: "animation-map-motion", stages: ["V4", "S4", "S5"], squad: 5, title: "Map and Globe Animator (Visual Enhancers)", prefixes: ["- FX-MAP", "- Map data and tiles carry", "- Map labels in the client's language", "- Map and graphic polish"] },
  { id: "color-look-dev", stages: ["V4", "S4"], squad: 5, title: "Colourist and Archive Restorer (Visual Enhancers)", prefixes: ["- Archive treatment only on archive", "- Look token applied", "- Shot-to-shot colour delta"] },
  { id: "footage-asset-strategist", stages: ["V4", "S5"], squad: 1, title: "Query Engineer and Public-Domain Archivist (Media Hunters)", prefixes: ["- Commons: proper noun", "- Government and museum sources", "- Openverse:", "- Pexels, Pixabay, Mixkit", "- Editorial and archives"] },
  { id: "cinematography-archive-language", stages: ["V4", "S5"], squad: 1, title: "Literalness Judge (Media Hunters)", prefixes: ["- Evidence slots are literal", "- Illustrative slots are on-mood", "- Negative-context slots never get", "- Brands, logos and products"] },
  { id: "editing-cut-logic", stages: ["V5", "S5"], squad: 7, title: "Transition and Edit-Grammar Designer (Timeline Composers)", prefixes: ["- Panel: a feature documentary editor", "- Of every cut", "- Restraint before reveals", "- Vary shot size; keep screen direction", "- J-cuts and L-cuts at resets", "- Default transition is the straight cut"] },
  { id: "audience-retention", stages: ["V5", "S5"], squad: 7, title: "Cadence Designer, Beat Scheduler (Timeline Composers)", prefixes: ["- Hook 15-30 events per minute", "- A pattern interrupt about every 25 s", "- A reset about every 3 min", "- Anchor visual lands", "- Spoken numbers appear on screen", "- Nothing appears before it is named", "- 1-2 beats of VO and music out"] },
  { id: "audience-first-minute", stages: ["V6"], squad: 8, title: "Hook and Retention Auditor (Quality Checkers)", prefixes: ["- Adversarial: assume something is wrong", "- Evidence for every verdict", "- G2 Hook", "- G3 Loops"] },
  { id: "quality-timeline-qc", stages: ["V6"], squad: 8, title: "Sync and Cadence Auditor (Quality Checkers)", prefixes: ["- Measure instead of reasoning", "- G4 Cadence", "- G9 Sync", "- G10 Repetition", "- G15 Visual quality"] },
  { id: "audio-music-arc", stages: ["S4"], squad: 6, title: "Music Supervisor and Composer-Prompt Writer (Audio Engineers)", prefixes: ["- Panel: a narration director", "- Would a native listener hear a machine", "- Calm, curious, observational delivery", "- Music prompts describe mood", "- Cues change at hook out"] },
  { id: "audio-sound-effects", stages: ["S4"], squad: 6, title: "SFX Designer and Ambience Designer (Audio Engineers)", prefixes: ["- SFX tags:", "- An ambience bed under everything", "- SFX only under CC0"] },
  { id: "audio-pronunciation", stages: ["S4"], squad: 6, title: "Pronunciation Lexicographer (Audio Engineers)", prefixes: ["- Apply the lexicon to every foreign name", "- Narration text arrives with numbers spelled"] },
  { id: "audio-ducking", stages: ["S4"], squad: 6, title: "Mixer (Audio Engineers)", prefixes: ["- Music ducked under voice", "- silencedetect: unscripted gaps"] },
  { id: "footage-license", stages: ["MEDIA"], squad: 2, title: "Item-Rights Verifier, License Classifier (Rights Guards)", prefixes: ["- If any doubt survives, SKIP", "- Licence class from item-level evidence", "- Public-domain footage can still be claimed"] },
  { id: "footage-release-risk", stages: ["MEDIA"], squad: 2, title: "Privacy and Likeness Officer (Rights Guards)", prefixes: ["- Anything with a cropped watermark", "- An identifiable person in a sensitive-context slot", "- Any realistic AI likeness", "- Model release status recorded"] },
  { id: "footage-rights-gate", stages: ["MEDIA"], squad: 2, title: "Editorial Restriction Officer, Ledger Keeper (Rights Guards)", prefixes: ["- Unknown licence, NC or ND", "- Editorial-only assets in a thumbnail", "- Any file sourced from Instagram", "- Attribution text generated where required"] },
].map((s) => ({ id: s.id, stages: s.stages, squad: s.squad, title: s.title, lines: s.prefixes.map((p) => line(s.squad, p)) }));

const header = `/**
 * Role craft: the strong instructions of the squad runtime prompts (prompts/4-zupona-squad-brains.txt) that
 * the voiceover film run sends to the free brain. GENERATED by local/role-craft-build.mjs, word for word from
 * prompts/4 (a test fails when they drift). Before this module no code read prompts/4 at all
 * (docs/AGENT_AUDIT.md). The voice film asks the brain in four passes (V3 director, V4 picture plan, V5 edit director, V6 QA audit), the script film in S4, S5, the edit stage (V5) and the footage judge (MEDIA);
 * each pass gets only the roles it can act on, so the prompt stays far under Groq's 7,200-token limit.
 */
`;
const body = `export const ROLE_CRAFT = Object.freeze(${JSON.stringify(SPEC, null, 1)});

/** @typedef {"V3" | "V4" | "V5" | "V6" | "S4" | "S5" | "MEDIA"} CraftStage */

/** @param {CraftStage} stage the roles whose instructions that pass sends. */
export function roleCraftRoles(stage) {
  return ROLE_CRAFT.filter((r) => r.stages.includes(stage));
}

/**
 * The roles' own words for one pass, de-duplicated, as one prompt block.
 * @param {CraftStage} stage
 */
export function roleCraft(stage) {
  const seen = new Set();
  const out = ["ROLE CRAFT (the squad desks' own standing orders; they apply on top of the rules above):"];
  for (const r of roleCraftRoles(stage)) {
    const fresh = r.lines.filter((l) => !seen.has(l));
    for (const l of fresh) seen.add(l);
    if (fresh.length) out.push(\`[\${r.title}]\`, ...fresh);
  }
  return out.join("\\n");
}
`;
const text = header + body;
if (process.argv.includes("--check")) {
  if (readFileSync(OUT, "utf8") !== text) { console.error("engine/src/role-craft.mjs is out of date: run node local/role-craft-build.mjs"); process.exit(1); }
} else writeFileSync(OUT, text);
