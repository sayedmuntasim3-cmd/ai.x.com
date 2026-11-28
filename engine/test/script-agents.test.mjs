import assert from "node:assert/strict";
import { test } from "node:test";
import { researchFreshness, researchGeography, researchPeerReview, runScriptAgents, storyExposition } from "../src/script-agents.mjs";
import { crewMarkdown, packagingPack, runVoiceCrew } from "../src/voice-crew.mjs";

const L = (/** @type {string} */ sc, /** @type {string} */ narration, start = 0) => ({ sc, narration, start, end: start + 10 });

test("freshness: a claim true only today needs a year; a dated one passes", () => {
  const now = new Date("2026-11-28T00:00:00Z");
  assert.equal(researchFreshness([L("SC1", "It is currently the tallest dam in the world.")], { now }).length, 1);
  assert.equal(researchFreshness([L("SC1", "As of 2026 it is currently the tallest dam in the world.")], { now }).length, 0);
  assert.equal(researchFreshness([L("SC1", "The dam was finished in 1936.")], { now }).length, 0);
});

test("geography: a place in the wrong state is found with its scene; a right one is confirmed", () => {
  const r = researchGeography([L("SC1", "The launch left Cape Canaveral, Texas at dawn."), L("SC2", "Mission control sat in Houston, Texas and watched.")]);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].scene, "SC1");
  assert.equal(r.verified, 1);
});

test("peer review: a study with no named source is found; one with a source is not", () => {
  assert.equal(researchPeerReview([L("SC1", "Scientists found that the steel fatigued early.")]).length, 1);
  assert.equal(researchPeerReview([L("SC1", "Scientists at NASA found that the steel fatigued early.")]).length, 0);
});

test("exposition: long sentences, number piles and unexplained acronyms", () => {
  const f = storyExposition([L("SC1", "The XQZ unit failed. " + "word ".repeat(45).trim() + "."), L("SC2", "It had 1, 2, 3, 4, 5 parts.")]);
  assert.deepEqual(f.map((x) => x.code).sort(), ["number-pile", "sentence-too-long", "unexplained-acronym"]);
  assert.equal(storyExposition([L("SC1", "NASA and the FBI watched.")]).length, 0);
});

test("packaging: a title, chapters from the structure and the YouTube rules", () => {
  const scenes = [L("SC1", "Apollo 11 left the pad on July 16, 1969. It carried three men.", 0), L("SC2", "Four days later they landed.", 100)];
  const structure = { entities: [{ name: "Apollo 11" }], topicWords: [{ word: "moon" }], sections: [{ start: 0, opening: "Apollo 11 left the pad." }, { start: 40, opening: "The long coast." }, { start: 100, opening: "They landed." }, { start: 104, opening: "Too close." }] };
  const p = packagingPack({ topic: "Apollo 11", scenes, structure, durationSeconds: 200 });
  assert.equal(p.title, "Apollo 11");
  assert.deepEqual(p.chapters.map((c) => c.stamp), ["0:00", "0:40", "1:40"]);
  assert.match(p.description, /Chapters\n0:00 /);
  assert.equal(packagingPack({ topic: "X", scenes, structure: { sections: [{ start: 0, opening: "a" }] } }).chapters.length, 0, "under three chapters: none listed");
});

test("the crew report says which agents ran and what each found", async () => {
  const scenes = [L("SC1", "Cape Canaveral, Texas. It is currently the largest rocket.", 0)];
  const crew = await runVoiceCrew({ scenes, structure: { sections: [], entities: [] }, shots: [], topic: "Test", brain: null });
  const ids = crew.agents.map((a) => a.role);
  for (const id of ["research-freshness", "research-geography", "research-peer-review", "story-exposition", "audience-title", "audience-metadata", "audience-panel-review"]) assert.ok(ids.includes(id), id);
  assert.equal(crew.agents.find((a) => a.role === "audience-panel-review").ran, false, "no free brain, no panel, said plainly");
  assert.match(crewMarkdown(crew), /research-geography \| yes \| FAIL/);
  assert.equal(runScriptAgents(scenes).results.length, 4);
});

test("the viewer panel runs on a free brain and is reported, not applied", async () => {
  const brain = { call: async () => ({ text: '```json\n{"stayScore": 4, "why": "slow start", "leaves": [{"viewer": "the 19-year-old", "scene": "SC1", "reason": "no hook"}], "kept": ["the number"]}\n```' }) };
  const crew = await runVoiceCrew({ scenes: [L("SC1", "Hello there.", 0)], structure: { sections: [], entities: [] }, shots: [], topic: "T", brain });
  const p = crew.agents.find((a) => a.role === "audience-panel-review");
  assert.equal(p.ran, true);
  assert.equal(p.pass, false);
  assert.equal(p.found, 1);
});

test("missingCues: a designed moment with no sound gets a cue in the nearest gap between words, never inside a word", async () => {
  const { missingCues, settleSound } = await import("../src/timeline.mjs");
  const words = [];
  for (let t = 0; t < 30; t += 1.5) words.push({ text: t === 0 ? "w." : "w", start: t, end: t + 0.4 });
  const video = [{ start: 0, end: 10, type: "clip" }, { start: 10, end: 20, type: "card", kinetic: true, scene: "SC2" }];
  const cues = missingCues([], words, video);
  assert.equal(cues.length, 1);
  assert.ok(Math.abs(cues[0].start - 10) <= 1.5);
  assert.ok(!words.some((w) => w.start < cues[0].end && w.end > cues[0].start - 0.05), "in a gap, not on a word");
  assert.equal(missingCues([{ token: "AUTO-IMPACT", kind: "hit", scene: "", start: 10.5, end: 11.6 }], words, video).length, 0, "already covered");
  assert.equal(settleSound([], words, video).clear.sounds.length, 1);
});
