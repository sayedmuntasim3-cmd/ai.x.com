import assert from "node:assert/strict";
import { test } from "node:test";
import { checkMoneyPath, FICTION_LABELS, lintNarration, planStory, usMinimumWage } from "../src/story-mode.mjs";
import { AGENTS, SQUADS, getAgent } from "../src/agent-roster.mjs";
import { GATES, planRun } from "../src/pipeline.mjs";
import { checkVersionPurity, VERSION_IDS } from "../src/versions.mjs";

test("stories carry no on-screen label, only a description note in each language", () => {
  for (const id of VERSION_IDS) assert.equal(checkVersionPurity(FICTION_LABELS[id], id).ok, true, id);
  for (const d of [45, 2700]) {
    const plan = planStory({ durationSeconds: d, versionId: "bn-BD" });
    assert.equal(plan.onScreenLabel, false);
    assert.equal(plan.descriptionNote, FICTION_LABELS["bn-BD"]);
  }
});

test("a Short hooks inside 3 seconds and ends on a line that loops back", () => {
  const plan = planStory({ durationSeconds: 45, versionId: "en-US" });
  assert.equal(plan.format, "short");
  assert.equal(plan.beats[0].atSeconds, 0);
  assert.equal(plan.beats[1].atSeconds, 3);
  assert.equal(plan.beats.at(-1).id, "loop-line");
  assert.ok(plan.beats.at(-1).atSeconds <= 45);
});

test("a long story places its twists, low point and payoff and re-hooks every 3 minutes", () => {
  const plan = planStory({ durationSeconds: 45 * 60, versionId: "bn-BD" });
  const at = Object.fromEntries(plan.beats.map((b) => [b.id, b.atSeconds]));
  assert.equal(plan.format, "long");
  assert.equal(at["cold-open"], 0);
  assert.ok(at.promise <= 30);
  assert.equal(at["first-twist"], 675);
  assert.equal(at["midpoint-reversal"], 1350);
  assert.equal(at.cliffhanger, 2160);
  assert.ok(at.payoff > at.cliffhanger && at["last-line"] > at.payoff);
  assert.equal(plan.reHooks[0], 180);
  assert.equal(plan.reHooks.length, 14);
  for (let i = 1; i < plan.beats.length; i += 1) assert.ok(plan.beats[i].atSeconds >= plan.beats[i - 1].atSeconds);
  assert.throws(() => planStory({ durationSeconds: 5, versionId: "en-US" }), /15 seconds/);
});

test("the era bible gives the right federal minimum wage for a year", () => {
  assert.equal(usMinimumWage("1985-06-01"), 3.35);
  assert.equal(usMinimumWage("1996-12-31"), 4.75);
  assert.equal(usMinimumWage("2026-10-30"), 7.25);
  assert.equal(usMinimumWage("1975-01-01"), null);
});

test("robotic narration is caught; natural narration passes", () => {
  const robotic = "His journey stands as a testament to grit. He worked hard every single day. He saved what he could save. He never gave up on it. He built a small business there. He bought a used truck later. He hired his cousin next. He made about $50,000 that year. The lesson here is simple.";
  const rules = lintNarration(robotic, "en-US").problems.map((p) => p.rule);
  for (const rule of ["robotic-phrase", "vague-money", "stated-moral", "repeated-opener"]) assert.ok(rules.includes(rule), rule);
  const natural = "Forty-seven dollars. That was everything in the coffee can. His father counted it twice, slowly, the way you count money that has to last a month. Outside, the 6:40 bus hissed past without stopping. Marcus watched it go. Nobody in that kitchen knew the bus would change their lives. But it would.";
  assert.deepEqual(lintNarration(natural, "en-US").problems, []);
  assert.ok(lintNarration("তারপর সে গেল। তারপর সে এল। তারপর সে বসল।", "bn-BD").problems.some((p) => p.rule === "and-then-chain"));
  assert.ok(lintNarration("He went home. সে বাড়ি গেল।", "en-US").problems.some((p) => p.rule === "version-purity"));
});

test("the money path flags jumps that need their own scenes", () => {
  const path = checkMoneyPath([
    { label: "coffee can", amount: 47 },
    { label: "used food truck", amount: 18000 },
    { label: "three trucks", amount: 60000 },
    { label: "Rolls-Royce Ghost", amount: 345000 },
  ]);
  assert.equal(path.ok, false);
  assert.equal(path.flags.length, 1);
  assert.match(path.flags[0], /383x jump/);
  assert.equal(checkMoneyPath([{ label: "a", amount: 10 }, { label: "b", amount: 90 }]).ok, true);
});

test("the roster has 151 unique roles in 15 squads, each with a mission and a deliverable", () => {
  assert.equal(SQUADS.length, 15);
  assert.equal(AGENTS.length, 151);
  assert.equal(new Set(AGENTS.map((a) => a.id)).size, 151);
  for (const agent of AGENTS) {
    assert.ok(agent.mission.length > 20 && agent.deliverable.length > 5, agent.id);
    assert.doesNotMatch(agent.mission + agent.deliverable, /Bangla narration|eight-chapter|human review|human approves/i, agent.id);
  }
  assert.equal(getAgent("quran-visual-adab-guard").squadId, "quran");
  assert.equal(getAgent("nope"), null);
});

test("a recitation plan has no music, no story writers and only verbatim Quran text", () => {
  const plan = planRun({ contentType: "quran_recitation", source: "own-recording", durationSeconds: 300 });
  const agents = plan.stages.flatMap((s) => s.agents);
  assert.equal(plan.humanApprovalSteps, 0);
  for (const v of VERSION_IDS) assert.equal(plan.music[v].policy, "none");
  assert.ok(!agents.includes("voice-music-supervisor"));
  assert.ok(!agents.some((id) => id.startsWith("screenplay-") || id.startsWith("research-")));
  for (const gate of ["quran-text", "quran-reference", "music-policy", "visual-adab", "voice-preservation"]) assert.ok(plan.gates.some((g) => g.id === gate), gate);
  assert.equal(plan.stages.find((s) => s.id === "voice").perVersion, false);
  assert.throws(() => planRun({ contentType: "quran_recitation", source: "elevenlabs" }), /never synthesised/);
  assert.throws(() => planRun({ contentType: "quran_recitation", needsAiVisuals: true }), /AI-generated/);
});

test("a story plan writes each version separately, labels fiction and discloses AI scenes", () => {
  const plan = planRun({ contentType: "story", needsAiVisuals: true, source: "elevenlabs", durationSeconds: 600 });
  const script = plan.stages.find((s) => s.id === "script");
  assert.equal(script.perVersion, true);
  assert.ok(script.agents.includes("versions-{lang}-writer"));
  for (const gate of ["fiction-label", "ai-disclosure", "version-purity"]) assert.ok(plan.gates.some((g) => g.id === gate), gate);
  assert.ok(plan.stages.flatMap((s) => s.agents).includes("screenplay-ai-scene-director"));
  assert.equal(plan.music.ar.policy, "no-instruments");
  assert.equal(plan.music["en-US"].policy, "score");
  assert.ok(plan.agentsUsed > 60);
});

test("a documentary plan researches every claim, and every gate has a written rule", () => {
  const plan = planRun({ contentType: "documentary", versions: ["en-US", "bn-BD"] });
  assert.ok(plan.stages.find((s) => s.id === "sources").agents.includes("research-fact-ledger"));
  assert.deepEqual(plan.versions, ["en-US", "bn-BD"]);
  for (const gate of plan.gates) assert.ok(gate.rule && gate.rule === GATES[gate.id]);
  assert.throws(() => planRun({ contentType: "documentary", versions: ["fr"] }), /Unknown version/);
});
