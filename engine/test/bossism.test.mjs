import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { AGENTS } from "../src/agent-roster.mjs";
import { applyRevision, cleared, dependents, masterGate, ownerOverride, preflight, productionGraph, recordDecision, releaseDecision, reviewRun, revisionPlan, understand, windowNeeds } from "../src/bossism.mjs";
import { MESSAGES, msg, say } from "../src/messages.mjs";

const USA = new URL("../../productions/ramesh-babu/USA/", import.meta.url);
/** A read-only store over the finished Ramesh Babu film. */
const usaStore = { get: async (/** @type {string} */ k) => (existsSync(new URL(k, USA)) ? readFileSync(new URL(k, USA), "utf8") : null), put: async () => { throw new Error("read only"); } };
const usaFilm = { id: "ramesh-usa", topic: "Ramesh Babu", durationSeconds: 2700, versionId: "en-US", formatId: null };

function memoryStore(/** @type {Record<string, string>} */ files = {}) {
  const m = new Map(Object.entries(files));
  return { m, get: async (/** @type {string} */ k) => m.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } };
}

test("every message exists in English and Bengali and fills its parameters", () => {
  const params = new Proxy({}, { get: (_t, k) => `«${String(k)}»` });
  for (const [code, entry] of Object.entries(MESSAGES)) {
    const en = entry.en(params);
    const bn = entry.bn(params);
    assert.ok(en.length > 3 && bn.length > 3, code);
    assert.notEqual(en, bn, `${code} has no Bengali translation`);
    assert.ok(/[ঀ-৿]/.test(bn), `${code}: the Bengali text has no Bengali letters`);
    assert.ok(!/undefined/.test(en + bn), code);
    // Every parameter English uses, Bengali uses too, so no number or name is lost in translation.
    for (const p of en.match(/«\w+»/g) ?? []) assert.ok(bn.includes(p), `${code}: Bengali drops ${p}`);
  }
  assert.equal(say({ code: "no.such.code" }), "no.such.code", "an unknown code is shown, never hidden");
  assert.deepEqual(Object.keys(msg("job.done")), ["code", "params", "en", "bn"]);
});

test("the production graph names real roles, and the chained stages run in film order", () => {
  const graph = productionGraph(understand({ film: usaFilm }));
  const ids = new Set(AGENTS.map((a) => a.id));
  for (const n of graph.nodes) for (const r of n.roles) assert.ok(ids.has(r), `${n.id} names an unknown role ${r}`);
  assert.equal(graph.nodes.filter((n) => n.base === "s5").length, 6, "45 minutes plans six chapters");
  const s5c2 = graph.nodes.find((n) => n.id === "s5:C2");
  assert.deepEqual(s5c2?.after.find((e) => e.id === "s5:C1"), { id: "s5:C1", kind: "order" }, "a chapter is written after the one before it");
  assert.equal(graph.nodes.find((n) => n.id === "edit:C3")?.parallelSafe, true, "edit chapters are independent");
  assert.equal(graph.nodes.find((n) => n.id === "media:C3")?.parallelSafe, false, "media keeps film order for the no-repeat rule");
  assert.deepEqual(productionGraph(understand({ system: "voice" })), { system: "voice", wired: false, nodes: [] });
});

test("redoing a chapter makes stale only what reads it", () => {
  const graph = productionGraph(understand({ film: usaFilm }), ["C1", "C2"]);
  const stale = dependents(graph, ["s5:C1"]);
  assert.ok(stale.includes("qa") && stale.includes("viewer") && stale.includes("media:C2") && stale.includes("s7") && stale.includes("originality"));
  assert.ok(!stale.includes("s5:C2"), "the next chapter only follows on in order; it is not rewritten");
  assert.ok(!stale.includes("research") && !stale.includes("s4") && !stale.includes("market"));
  assert.deepEqual(dependents(graph, ["s7"]), ["s7", "originality"]);
  assert.deepEqual(dependents(graph, ["edit:C2"]), ["edit:C2", "s6", "s7", "originality"]);
});

test("preflight refuses what cannot work and names every lowered quality", () => {
  const graph = productionGraph(understand({ film: { ...usaFilm, durationSeconds: 600 } }));
  const base = { researchDesk: true, mediaProviders: 9, youtube: true, autoRender: true, minutes: 10 };
  const none = preflight(graph, { ...base, brain: { connected: false } });
  assert.equal(none.ok, false);
  assert.deepEqual(none.blockers.map((b) => b.code), ["plan.noBrain"]);
  assert.equal(none.stages.find((s) => s.id === "s01")?.status, "blocked");

  const local = { connected: true, kind: "local", model: "qwen3:32b", seesPictures: false, searchesWeb: false, contextTokens: 65536 };
  const ok = preflight(graph, { ...base, brain: local, youtube: false });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.degradations.map((d) => d.code), ["plan.desk", "plan.blind", "plan.noMarket"], "nothing is lowered silently");
  assert.equal(ok.stages.find((s) => s.id === "market")?.status, "skipped");
  assert.equal(ok.stages.find((s) => s.id === "media:C1")?.status, "degraded");
  assert.equal(ok.window?.qa, "whole");
  const research = ok.stages.find((s) => s.id === "research");
  assert.ok(research?.agents.available.some((a) => a.id === "research-primary-source"));
  assert.ok(research?.agents.unavailable.length === 0);
  assert.ok(preflight(graph, { ...base, brain: local, researchDesk: false }).blockers.some((b) => b.code === "plan.noResearch"));

  const long = productionGraph(understand({ film: { ...usaFilm } }));
  const small = preflight(long, { ...base, minutes: 45, brain: { ...local, contextTokens: 32768 } });
  assert.deepEqual(small.blockers.map((b) => b.code), ["plan.windowSmall"], "a 45-minute film does not fit a 32k window, and says so before anything is spent");
  const split = preflight(long, { ...base, minutes: 45, brain: { ...local, contextTokens: 131072 } });
  assert.equal(split.ok, true);
  assert.equal(split.window?.qa, "per-chapter");
  assert.ok(split.degradations.some((d) => d.code === "plan.qaPerChapter"));
  const needs = windowNeeds(45);
  assert.ok(needs.qaWhole > 131072 && needs.perChapter <= 131072, `${needs.qaWhole} / ${needs.perChapter}`);
  assert.equal(preflight(long, { ...base, minutes: 45, brain: { connected: true, kind: "claude", model: "claude-opus-5-5" } }).window, null, "a hosted brain's window is not guessed");
});

test("the finished Ramesh Babu film: the script passes every gate it can, and release is blocked for what was never checked", async () => {
  const review = await reviewRun({ store: usaStore, film: usaFilm });
  const v = Object.fromEntries(review.gates.map((g) => [g.id, g.verdict]));
  assert.equal(v.claims, "pass");
  assert.deepEqual(review.gates.find((g) => g.id === "claims")?.evidence, { ledger: 73, citations: 409 });
  assert.equal(v.script, "pass");
  assert.equal(review.gates.find((g) => g.id === "script")?.evidence.scenes, 270, "the gate ran the checks itself");
  assert.equal(v.research, "block", "this film was written by hand: no research file and no source desk");
  assert.ok(review.gates.find((g) => g.id === "research")?.findings.some((f) => f.code === "research.unchecked"));
  assert.equal(v.visual, "block", "no footage was searched");
  assert.equal(review.release.allowed, false);
  assert.deepEqual(review.release.blockedBy, ["research", "visual"]);
  assert.match(review.release.message.bn, /রিসার্চ, ছবি/, "the Bengali message names the gates in Bengali");
  assert.match(review.release.message.en, /Research, Pictures/);
});

/** A small finished run in memory, for the gates' findings. */
function smallRun(/** @type {Record<string, string>} */ over = {}) {
  const line = (/** @type {number} */ n, /** @type {string} */ claims) => `**SC000${n}** | 0:00:0${(n - 1) * 5}-0:00:${n === 2 ? "10" : "05"} | C1 | beat | E | ${claims} | NARR: x | W 1/1 | SHOTS: (1) R3 mill | LOOK: LOOK-M`;
  return memoryStore({
    "s3-chapters.json": JSON.stringify([{ id: "C1", title: "A", start: "0:00:00", end: "0:00:10", firstScene: "SC0001", lastScene: "SC0002", brief: "b" }]),
    "s2.md": "| ID | Claim |\n|---|---|\n| **C01** | The mill opened |\n| **C02** | It closed |",
    "s5-C1.md": [line(1, "C01"), line(2, "C02, C07")].join("\n"),
    "research.json": JSON.stringify({ facts: Array.from({ length: 8 }, (_, i) => ({ id: `F0${i}`, claim: i < 2 ? "The mill opened in the year" : `fact number ${i} about the old town mill`, value: i === 1 ? "1802" : "1790", sources: ["https://a.org/1"] })) }),
    "sources-check.json": JSON.stringify({ summary: { sites: 3, facts: { kept: 8, unconfirmed: 4 } } }),
    "viewer.json": JSON.stringify({ stayScore: 4, why: "slow start", leaves: [{ viewer: "the 19-year-old", scene: "SC0001", reason: "nothing happens" }] }),
    "media-C1.json": JSON.stringify({ shots: [
      { scene: "SC0001", shot: 1, status: "found", review: "fit", description: "mill", pick: { id: "wikimedia:1", source: "wikimedia", title: "Mill", sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Mill.jpg", licence: { licenseId: "CC-BY", licenseUrl: "https://creativecommons.org/licenses/by/2.0", creator: "Ann" } } },
      { scene: "SC0002", shot: 1, status: "found", description: "wheel", pick: { id: "x:2", source: "x", sourcePageUrl: "https://x/2", licence: { licenseId: "CC-BY-SA" } } },
      { scene: "SC0002", shot: 2, status: "missing", description: "the mill's last miller", query: "miller 1921" },
    ] }),
    "s7.md": "## S7\n**Final title: THE MILL**",
    ...over,
  });
}

test("each gate reads the evidence and sends defects to the stage that made them", async () => {
  const film = { id: "f1", topic: "The old mill", durationSeconds: 10, versionId: "en-US", formatId: null };
  const review = await reviewRun({ store: smallRun(), film });
  const find = (/** @type {string} */ code) => review.gates.flatMap((g) => g.findings).filter((f) => f.code === code);
  assert.deepEqual(find("claims.unknown").map((f) => [f.severity, f.target]), [["block", "s5:C1"]], "a scene citing a claim the ledger lacks is an unsupported claim");
  assert.match(String(find("claims.unknown")[0].note), /SC0002:C07/);
  assert.deepEqual(find("research.fewSites").map((f) => f.severity), ["revise"]);
  assert.deepEqual(find("research.unconfirmed").map((f) => f.target), ["research"]);
  assert.match(find("research.contradiction")[0].message.en, /F00, F01 make the same claim with different values/);
  assert.deepEqual(find("story.lowStay").map((f) => f.target), ["s5:C1"]);
  assert.match(String(find("story.lowStay")[0].note), /the 19-year-old leaves \(nothing happens\)/);
  assert.deepEqual(find("visual.missing").map((f) => f.severity), ["revise"], "one of three shots missing is a revision, not a block");
  assert.equal(find("visual.unreviewed").length, 1, "a pick nobody looked at is said");
  assert.deepEqual(find("rights.unlicensed").map((f) => f.severity), ["block"], "a share-alike picture is never released");
  assert.equal(find("rights.credit").length, 1, "a CC BY picture whose credit is missing from the description blocks release");
  assert.ok(find("packaging.title").length, "an all-caps title");
  const decision = releaseDecision(review.gates);
  assert.deepEqual(find("script.errors").map((f) => f.target), ["s5:C1"], "the gate re-ran the scene checks itself, and these test lines are not valid scenes");
  assert.deepEqual(decision.blockedBy, ["research", "claims", "script", "rights"]);
  assert.equal(decision.allowed, false);
});

test("revision is bounded, carries the notes, and withdraws the gaps of the stages it redoes", async () => {
  const film = { id: "f1", topic: "The old mill", durationSeconds: 10, versionId: "en-US", formatId: null };
  const review = await reviewRun({ store: smallRun(), film });
  const graph = productionGraph(understand({ film }), ["C1"]);
  const plan = revisionPlan(review, graph, { round: 1, maxRevisions: 1 });
  assert.ok(plan);
  assert.deepEqual(plan.targets.sort(), ["research", "s5:C1", "s7"]);
  assert.ok(plan.stages.includes("s2") && plan.stages.includes("qa") && plan.stages.includes("media:C1"));
  assert.match(plan.notes["s5:C1"], /C07[\s\S]*cold panel[\s\S]*No licensed picture fits/);
  assert.equal(revisionPlan(review, graph, { round: 2, maxRevisions: 1 }), null, "the limit stops endless revising");

  const state = { status: "done-with-gaps", gaps: ["research: a", "C1 media: b", "kept"], stages: { s01: { status: "done" }, research: { status: "done", gaps: ["research: a"] }, "media:C1": { status: "done", gaps: ["C1 media: b"] } } };
  applyRevision(state, plan);
  assert.deepEqual(Object.keys(state.stages), ["s01"]);
  assert.deepEqual(state.gaps, ["kept"]);
  assert.equal(state.revisions, 1);
  assert.equal(/** @type {any} */ (state).revisionNotes.research.length > 0, true);
});

test("the rendered master is measured before release", () => {
  const good = { durationSeconds: 600, narratedScenes: 60, voicedScenes: 60, master: { integratedLufs: -14.3, truePeakDbtp: -1.4, black: [] }, warnings: ["M02: no music file, 30 s from 10.0 s play without music."] };
  assert.equal(masterGate(good, { measuredSeconds: 600.2 }).verdict, "pass");
  assert.deepEqual(masterGate(good).findings.map((f) => f.severity), ["note"], "a missing music cue is said, not blocking");
  assert.equal(masterGate(null).verdict, "block");
  const codes = (/** @type {any} */ r, /** @type {any} */ o) => masterGate(r, o).findings.filter((f) => f.severity === "block").map((f) => f.code);
  assert.deepEqual(codes({ ...good, master: { integratedLufs: -19, truePeakDbtp: 0.2, black: [] } }), ["master.loudness", "master.peak"]);
  assert.deepEqual(codes({ ...good, voicedScenes: 58 }), ["master.voice"], "a film missing narration is not released");
  assert.deepEqual(codes(good, { measuredSeconds: 540 }), ["master.duration"], "a master shorter than the film is caught");
  assert.deepEqual(codes({ ...good, warnings: ["SC0012-1: clip could not be downloaded (404); a text card stands in."] }), ["master.warnings"]);
  assert.deepEqual(codes({ ...good, master: null }), ["master.missing"]);
});

test("a gate with nothing to judge never passes", async () => {
  const review = await reviewRun({ store: memoryStore({}), film: { id: "empty", topic: "x", durationSeconds: 600, versionId: "en-US", formatId: null } });
  const v = Object.fromEntries(review.gates.map((g) => [g.id, g.verdict]));
  assert.deepEqual(v, { research: "block", claims: "block", script: "block", story: "block", visual: "block", rights: "pass", packaging: "block" }, "rights passes only because no picture is used at all, and pictures blocks for that");
});

test("decisions are recorded; the owner can release a blocked film only with a reason given after the review", async () => {
  const store = memoryStore();
  const review = { at: "2026-01-01T00:00:00.000Z", film: "f", gates: [{ id: "visual", verdict: /** @type {const} */ ("block"), critical: false, findings: [], evidence: {} }], release: releaseDecision([{ id: "visual", verdict: "block", critical: false, findings: [], evidence: {} }]) };
  assert.equal(cleared(review, []).ok, false);
  const short = await ownerOverride(store, review, "ok");
  assert.equal(short.ok, false);
  const done = await ownerOverride(store, review, "These shots are my own footage, added after the run.");
  assert.ok(done.ok);
  const decisions = JSON.parse(String(store.m.get("decisions.json")));
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].actor, "owner");
  assert.match(decisions[0].message.bn, /মালিক প্রকাশের অনুমতি দিয়েছেন/);
  assert.deepEqual(cleared(review, decisions), { ok: true, by: "owner" });
  const later = { ...review, at: "2099-01-01T00:00:00.000Z" };
  assert.equal(cleared(later, decisions).ok, false, "an approval does not carry over to a newer review");
  await recordDecision(store, { actor: "bossism", action: "review", message: msg("release.allowed") });
  assert.equal(JSON.parse(String(store.m.get("decisions.json"))).length, 2, "the record is only added to");
});
