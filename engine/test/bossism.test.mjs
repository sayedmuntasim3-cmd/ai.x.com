import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { AGENTS } from "../src/agent-roster.mjs";
import { applyRevision, cleared, dependents, GATES_VERSION, masterGate, ownerOverride, parseLedger, preflight, productionGraph, recordDecision, releaseDecision, reviewRun, revisionPlan, understand, windowNeeds } from "../src/bossism.mjs";
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

test("the finished Ramesh Babu film: its unresolved number markers block release, with the rest of what was never checked", async () => {
  const review = await reviewRun({ store: usaStore, film: usaFilm });
  const v = Object.fromEntries(review.gates.map((g) => [g.id, g.verdict]));
  const claims = /** @type {any} */ (review.gates.find((g) => g.id === "claims"));
  assert.equal(v.claims, "block", "43 markers such as [C12 low] would be read aloud or shown on screen");
  assert.deepEqual(claims.evidence, { ledger: 73, citations: 409, markers: 43, evidenceChecked: false });
  const placeholders = claims.findings.filter((/** @type {any} */ f) => f.code === "claims.placeholder");
  assert.deepEqual(placeholders.map((/** @type {any} */ f) => f.target), ["s5:C1", "s5:C2", "s5:C4", "s5:C5", "s5:C6"]);
  assert.match(placeholders[0].message.en, /SC0030 \[C12 low\]/);
  const noEvidence = claims.findings.filter((/** @type {any} */ f) => f.code === "claims.noEvidence");
  assert.deepEqual(noEvidence.map((/** @type {any} */ f) => f.target), ["s5:C5"], "C41 cites no page, and C42 is derived from it");
  assert.match(noEvidence[0].message.en, /SC0189:C41.*SC0198:C42/);
  assert.ok(!claims.findings.some((/** @type {any} */ f) => f.code !== "claims.placeholder" && /:C(09|35|65|66)\b/.test(f.message.en)), "UNKNOWN claims narrated as unknown are not defects");
  assert.equal(v.script, "pass");
  assert.equal(review.gates.find((g) => g.id === "script")?.evidence.scenes, 270, "the gate ran the checks itself");
  assert.equal(v.research, "block", "this film was written by hand: no research file and no source desk");
  assert.ok(review.gates.find((g) => g.id === "research")?.findings.some((f) => f.code === "research.unchecked"));
  assert.equal(v.visual, "block", "no footage was searched");
  assert.equal(review.release.allowed, false);
  assert.deepEqual(review.release.blockedBy, ["research", "claims", "visual"]);
  assert.equal(review.gatesVersion, GATES_VERSION);
  assert.match(review.release.message.bn, /রিসার্চ, দাবি, ছবি/, "the Bengali message names the gates in Bengali");
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
  const review = { at: "2026-01-01T00:00:00.000Z", film: "f", gatesVersion: GATES_VERSION, gates: [{ id: "visual", verdict: /** @type {const} */ ("block"), critical: false, findings: [], evidence: {} }], release: releaseDecision([{ id: "visual", verdict: "block", critical: false, findings: [], evidence: {} }]) };
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

// ---------------------------------------------------------------- the claims gate: unresolved and unsupported claims block release

const FACTUAL = { id: "f2", topic: "The old mill", durationSeconds: 10, versionId: "en-US", formatId: null };
const STORY = { ...FACTUAL, id: "f3", formatId: "dramatized-story" };
const PAGE = "https://www.example.org/mill/";

/**
 * A run with one chapter of two scenes, for the claims gate only.
 * @param {{ ledger?: string[], header?: string, narr?: [string, string], claims?: [string, string], ost?: [string, string], research?: any, check?: any, files?: Record<string, string> }} o
 */
function claimRun(o = {}) {
  const narr = o.narr ?? ["The mill opened in 1790.", "It closed."];
  const claims = o.claims ?? ["C01", "C02"];
  const ost = o.ost ?? ["", ""];
  const line = (/** @type {number} */ i) => `**SC000${i + 1}** | 0:00:0${i * 5}-0:00:${i ? "10" : "05"} | C1 | beat | E | ${claims[i]} | NARR: ${narr[i]} | W 1/1 | SHOTS: (1) R3 mill | OST: ${ost[i]} | LOOK: LOOK-M`;
  const ledger = o.ledger ?? [`| **C01** | The mill opened in 1790 | FACT | 1790 | ${PAGE} | high |`, `| **C02** | It closed in 1921 | FACT | 1921 | ${PAGE} | medium |`];
  const research = o.research ?? { facts: [{ id: "F01", claim: "The mill opened", value: "1790", sources: ["http://example.org/mill"], check: { status: "verified" } }] };
  return memoryStore({
    "s3-chapters.json": JSON.stringify([{ id: "C1", title: "A", start: "0:00:00", end: "0:00:10", firstScene: "SC0001", lastScene: "SC0002", brief: "b" }]),
    "s2.md": [o.header ?? "| ID | Claim | Status | Value | Sources | Conf. |", "|---|---|---|---|---|---|", ...ledger].join("\n"),
    "s5-C1.md": [line(0), line(1)].join("\n"),
    "research.json": JSON.stringify(research),
    "sources-check.json": JSON.stringify(o.check ?? { summary: { sites: 5, facts: { kept: 1, unconfirmed: 0 } } }),
    ...(o.files ?? {}),
  });
}

/** @param {any} store @param {any} [film] */
async function claimsGate(store, film = FACTUAL) {
  const review = await reviewRun({ store, film });
  const gate = /** @type {any} */ (review.gates.find((g) => g.id === "claims"));
  return { review, gate, codes: gate.findings.map((/** @type {any} */ f) => f.code) };
}

test("claims gate: a resolved claim with a page the source desk confirmed passes, the URL compared without www, scheme or trailing slash", async () => {
  const { gate, review } = await claimsGate(claimRun());
  assert.deepEqual(gate.findings, []);
  assert.equal(gate.verdict, "pass");
  assert.deepEqual(gate.evidence, { ledger: 2, citations: 2, markers: 0, evidenceChecked: true });
  assert.ok(!review.release.blockedBy.includes("claims"));
});

test("claims gate: an unresolved marker in narration or on screen blocks release, and the release flow cannot pass it", async () => {
  const store = claimRun({ narr: ["The mill cost about [C01 low] dollars.", "It closed."], ost: ["", "chip $[C02]"] });
  const { gate, review, codes } = await claimsGate(store);
  assert.deepEqual(codes, ["claims.placeholder"]);
  assert.equal(gate.verdict, "block");
  assert.match(gate.findings[0].message.en, /2 unresolved markers.*SC0001 \[C01 low\]; SC0002 \$\[C02\]/);
  assert.match(gate.findings[0].message.bn, /অমীমাংসিত চিহ্ন/);
  assert.ok(review.release.blockedBy.includes("claims"));
  assert.equal(review.release.allowed, false);
  assert.equal(cleared(review, []).ok, false, "a blocked review clears nothing in the normal flow");
  const plan = revisionPlan(review, productionGraph(understand({ film: FACTUAL }), ["C1"]), { round: 1 });
  assert.ok(plan?.targets.includes("s5:C1"), "the chapter goes back to its writer with the note");
  assert.match(String(plan?.notes["s5:C1"]), /never guess a value/);
});

test("claims gate: editing markers block; delivery tags and ordinary brackets do not", async () => {
  for (const marker of ["[TBD]", "[VERIFY date]", "[citation needed]", "[TODO: source]", "[XX]"]) {
    const { codes } = await claimsGate(claimRun({ narr: [`The mill opened in ${marker}.`, "It closed."] }));
    assert.deepEqual(codes, ["claims.placeholder"], marker);
  }
  const { codes } = await claimsGate(claimRun({ narr: ["[softly] The mill opened in 1790.", "It closed [sic]."] }));
  assert.deepEqual(codes, [], "ElevenLabs delivery tags and [sic] are not unresolved markers");
});

test("claims gate: missing evidence blocks: no source, a page the research did not keep, an UNSUPPORTED status", async () => {
  const cases = [
    ["| **C02** | It closed in 1921 | FACT | 1921 | a book, somewhere | medium |", "no page and no research fact"],
    ["| **C02** | It closed in 1921 | FACT | 1921 | https://gone.example.com/page | medium |", "a page the source desk dropped or the research never had"],
    [`| **C02** | It closed in 1921 | UNSUPPORTED | 1921 | ${PAGE} | medium |`, "a status that says it is unsupported"],
  ];
  for (const [row, why] of cases) {
    const { codes, gate } = await claimsGate(claimRun({ ledger: [`| **C01** | The mill opened in 1790 | FACT | 1790 | ${PAGE} | high |`, row] }));
    assert.deepEqual(codes, ["claims.noEvidence"], why);
    assert.match(gate.findings[0].message.en, /SC0002:C02/);
  }
  const byFact = await claimsGate(claimRun({ ledger: [`| **C01** | The mill opened | FACT | 1790 | F01 | high |`, `| **C02** | It closed | FACT | 1921 | ${PAGE} | medium |`] }));
  assert.deepEqual(byFact.codes, [], "a research fact ID is evidence too");
});

test("claims gate: a FACT no opened page confirms blocks; the same claim attributed or contested passes", async () => {
  const research = { facts: [{ id: "F01", claim: "The mill opened", value: "1790", sources: [PAGE], check: { status: "unconfirmed" } }, { id: "F02", claim: "x", value: "1", sources: ["https://other.example.org/a"], check: { status: "unreachable" } }] };
  const fact = await claimsGate(claimRun({ research }));
  assert.deepEqual(fact.codes, ["claims.unverified"]);
  assert.match(fact.gate.findings[0].message.en, /SC0001:C01, SC0002:C02/);
  for (const status of ["FACT (attributed)", "CONTESTED", "ESTIMATE", "QUOTE → paraphrase"]) {
    const ledger = [`| **C01** | The mill opened in 1790 | ${status} | 1790 | ${PAGE} | high |`, `| **C02** | It closed | ${status} | 1921 | ${PAGE} | medium |`];
    assert.deepEqual((await claimsGate(claimRun({ research, ledger }))).codes, [], status);
  }
  const mixed = { facts: [...research.facts, { id: "F03", claim: "y", value: "1790", sources: [PAGE], check: { status: "opened" } }] };
  assert.deepEqual((await claimsGate(claimRun({ research: mixed }))).codes, [], "one opened page that supports it is enough");
  const noDesk = await claimsGate(claimRun({ research, check: null, files: { "sources-check.json": "null" } }));
  assert.ok(!noDesk.codes.includes("claims.unverified"), "without the source desk the research gate blocks instead (research.unchecked)");
  assert.ok(noDesk.review.gates.find((g) => g.id === "research")?.findings.some((f) => f.code === "research.unchecked"));
});

test("claims gate: a bare FACT rated low confidence blocks; partial or other ratings do not", async () => {
  const at = (/** @type {string} */ conf, /** @type {string} */ status = "FACT") => claimRun({ ledger: [`| **C01** | The mill opened | ${status} | 1790 | ${PAGE} | ${conf} |`, `| **C02** | It closed | FACT | 1921 | ${PAGE} | high |`] });
  assert.deepEqual((await claimsGate(at("low"))).codes, ["claims.lowConfidence"]);
  assert.deepEqual((await claimsGate(at("none"))).codes, ["claims.lowConfidence"]);
  assert.deepEqual((await claimsGate(at("medium (event); low (year)"))).codes, []);
  assert.deepEqual((await claimsGate(at("low", "ESTIMATE"))).codes, [], "an estimate is narrated as an estimate");
});

test("claims gate: an UNKNOWN claim narrated as unknown passes; columns are found by their headers", async () => {
  const ledger = [`| **C01** | The mill opened in 1790 | FACT | 1790 | ${PAGE} | high |`, "| **C02** | Why it closed | UNKNOWN | — | — | none |"];
  assert.deepEqual((await claimsGate(claimRun({ ledger, narr: ["The mill opened in 1790.", "Why it closed, nobody recorded."] }))).codes, []);
  const reordered = await claimsGate(claimRun({ header: "| ID | Sources | Value | Type | Claim | Confidence |", ledger: [`| **C01** | ${PAGE} | 1790 | FACT | opened | high |`, `| **C02** | ${PAGE} | 1921 | FACT | closed | low |`] }));
  assert.deepEqual(reordered.codes, ["claims.lowConfidence"], "the confidence column is read wherever it is");
});

test("claims gate: a derived value needs every row it is derived from; a cycle is not evidence", async () => {
  const base = `| **C01** | The mill opened in 1790 | FACT | 1790 | ${PAGE} | high |`;
  const derived = (/** @type {string} */ src) => [base, `| **C02** | Its price in today's dollars | ESTIMATE | $3 | ${src} | medium |`, "| **C03** | A rumour | FACT | 7 | heard it | low |", "| **C04** | Loop | ESTIMATE | 1 | Basis C05 | medium |", "| **C05** | Loop | ESTIMATE | 1 | Basis C04 | medium |"];
  assert.deepEqual((await claimsGate(claimRun({ ledger: derived("Basis C01") }))).codes, []);
  assert.deepEqual((await claimsGate(claimRun({ ledger: derived("Basis C01, C03") }))).codes, ["claims.noEvidence"], "one unsupported basis is enough to fail");
  assert.deepEqual((await claimsGate(claimRun({ ledger: derived("Basis C04") }))).codes, ["claims.noEvidence"], "C04 and C05 only cite each other");
});

test("claims gate: removing a marker does not resolve the claim; only a value in the ledger does", async () => {
  const draft = `**SC0001** | 0:00:00-0:00:05 | C1 | beat | E | C01 | NARR: The mill opened in 1790. | W 1/1 | SHOTS: (1) R3 mill | OST:  | LOOK: LOOK-M\n**SC0002** | 0:00:05-0:00:10 | C1 | beat | E | C02 | NARR: It cost about [C02 low] cents. | W 1/1 | SHOTS: (1) R3 mill | OST:  | LOOK: LOOK-M`;
  const pending = [`| **C01** | The mill opened in 1790 | FACT | 1790 | ${PAGE} | high |`, `| **C02** | Its cost in today's money | ESTIMATE | ₹5; USD PENDING | ${PAGE} | medium |`];
  const guessed = await claimsGate(claimRun({ ledger: pending, narr: ["The mill opened in 1790.", "It cost about six cents."], files: { "s5-C1.draft.md": draft } }));
  assert.deepEqual(guessed.codes, ["claims.markerResolved"]);
  assert.match(guessed.gate.findings[0].message.en, /SC0002 \[C02 low\] -> "six"/);
  const viewer = await claimsGate(claimRun({ ledger: pending, narr: ["The mill opened in 1790.", "It cost about 6 cents."], files: { "s5-C1.viewer-draft.md": draft } }));
  assert.deepEqual(viewer.codes, ["claims.markerResolved"], "the viewer panel's fixes are checked the same way");
  const resolved = [pending[0], `| **C02** | Its cost in today's money | ESTIMATE | about 6 cents | ${PAGE} | medium |`];
  assert.deepEqual((await claimsGate(claimRun({ ledger: resolved, narr: ["The mill opened in 1790.", "It cost about six cents."], files: { "s5-C1.draft.md": draft } }))).codes, [], "the ledger has the value: a legitimate resolution");
  assert.deepEqual((await claimsGate(claimRun({ ledger: pending, narr: ["The mill opened in 1790.", "It cost very little."], files: { "s5-C1.draft.md": draft } }))).codes, [], "the number was removed, not guessed");
});

test("claims gate: an invented story needs no evidence for its claims, but never ships a marker", async () => {
  const ledger = ["| **C01** | A wage of the time | 3 shillings | none |", "| **C02** | The town | real | none |"];
  const clean = await claimsGate(claimRun({ header: "| ID | Detail | Value | Sources |", ledger }), STORY);
  assert.deepEqual(clean.codes, []);
  const marked = await claimsGate(claimRun({ header: "| ID | Detail | Value | Sources |", ledger, narr: ["He earned [C01] a week.", "It rained."] }), STORY);
  assert.deepEqual(marked.codes, ["claims.placeholder"]);
});

test("a review made by older gates clears nothing, and cannot be approved until the film is reviewed again", async () => {
  const old = { at: "2026-01-01T00:00:00.000Z", film: "f", gates: [], release: releaseDecision([]) };
  assert.equal(old.release.allowed, true, "the old gates had allowed it");
  assert.deepEqual(cleared(old, []), { ok: false, by: null, stale: true });
  const decisions = [{ actor: "owner", action: "release-override", at: "2026-02-01T00:00:00.000Z" }];
  assert.equal(cleared(old, decisions).ok, false, "an earlier approval does not carry over either");
  const refused = await ownerOverride(memoryStore(), old, "I checked every number myself before release.");
  assert.equal(refused.ok, false);
  assert.equal(cleared({ ...old, gatesVersion: GATES_VERSION }, []).ok, true);
});

test("the ledger parser keeps statuses, values, confidence and sources apart", () => {
  const rows = parseLedger(["| ID | Claim | Type | Value / data | Sources (from research) | Conf. |", "|---|---|---|---|---|---|", `| **C01** | a | FACT (attributed) | 5 | ${PAGE} · fred.stlouisfed.org/series/AEXINUS, F07 | low |`, "| C02 | b | CONTESTED (year) | 2010 vs 2011 | Basis C01 | medium |", "not a row"].join("\n"));
  assert.deepEqual([...rows.keys()], ["C01", "C02"]);
  const c1 = /** @type {any} */ (rows.get("C01"));
  assert.equal(c1.kind, "attributed");
  assert.equal(c1.lowConfidence, true);
  assert.deepEqual(c1.urls, [PAGE, "https://fred.stlouisfed.org/series/AEXINUS"]);
  assert.deepEqual(c1.facts, ["F07"]);
  assert.equal(rows.get("C02")?.kind, "hedged");
  assert.deepEqual(rows.get("C02")?.refs, ["C01"]);
  assert.equal(parseLedger(null).size, 0);
  const words = parseLedger("| ID | Status |\n|---|---|\n| C01 | FACT (year unknown) |\n| C02 | Unknown |\n| C03 | PENDING |");
  assert.deepEqual([...words.values()].map((r) => r.kind), ["fact", "unknown", "unresolved"], "the status word comes first");
});
