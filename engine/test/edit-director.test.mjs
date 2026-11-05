import assert from "node:assert/strict";
import test from "node:test";
import { editInstruction, editSheet, validateEditPlan } from "../src/edit-director.mjs";
import { buildTimeline } from "../src/timeline.mjs";

/** @param {number} n @param {number} from @param {number} to @param {string} [extra] @param {string} [shots] */
function line(n, from, to, extra = "", shots = "(1) R1 kinetic card \"The mill\"") {
  const t = (/** @type {number} */ s) => `0:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return `**SC${String(n).padStart(4, "0")}** | ${t(from)}-${t(to)} | C1 | beat | E | C01 | NARR: The river runs past the old mill while the town wakes. | W 10/10 | ANCHOR: "river" -> mill | SHOTS: ${shots} | EV: R1 1 | ${extra}LOOK: LOOK-M`;
}
const CHAPTER = [
  line(1, 0, 10),
  line(2, 10, 20, "TRANS: whip pan | ", "(1) 0:00:10-0:00:15 R1 card \"One\"; (2) 0:00:15-0:00:20 R1 card \"Two\""),
  line(3, 20, 30),
  line(4, 30, 40, "TRANS: dissolve | "),
  line(5, 40, 50),
].join("\n");

test("the director sees a short sheet of the chapter and is told the rules code enforces", () => {
  const sheet = editSheet(CHAPTER);
  assert.equal(sheet.split("\n").length, 5);
  assert.ok(sheet.startsWith("SC0001 0:00:00.0-0:00:10.0 (10 s) | NARR: The river"));
  assert.ok(sheet.includes("TRANS: whip pan"));
  const text = editInstruction("C1", sheet);
  for (const w of ["glitch", "punchIns", "shakes", "riser", "Never two named transitions in a row"]) assert.ok(text.includes(w), w);
});

test("the director's plan is checked in code: only valid, spaced, capped edits are kept", () => {
  const plan = validateEditPlan({ scenes: [
    { scene: "SC0003", transition: "glitch", punchIns: ["0:00:22.0", "0:00:23.0", "0:00:26.0", "0:00:28.0"], hits: [{ at: "0:00:22.0", sound: "impact" }, { at: "0:00:22.5", sound: "boom" }, { at: "0:00:25.0", sound: "kazoo" }] },
    { scene: "SC0002", transition: "cut", punchIns: ["0:00:09.0", 16.5] },
    { scene: "SC0005", transition: "slide", shakes: ["0:00:45.0", "0:00:46.0"] },
    { scene: "SC0004", transition: "flash" },
    { scene: "SC0001", transition: "whip" },
    { scene: "SC0042", transition: "whip" },
    { scene: "SC0005", transition: "zoom" },
    { scene: "SC0003", transition: "spin" },
  ] }, CHAPTER, "C1");
  const by = Object.fromEntries(plan.scenes.map((s) => [s.scene, s]));
  // A "cut" removes the script's whip, so the glitch right after it is allowed.
  assert.equal(by.SC0002.transition, "cut");
  assert.deepEqual(by.SC0002.punchIns, [16.5], "a time outside the scene is dropped");
  assert.equal(by.SC0003.transition, "glitch");
  assert.deepEqual(by.SC0003.punchIns, [22, 26], "two per scene, at least 2.5 s apart");
  assert.deepEqual(by.SC0003.hits, [{ at: 22, sound: "impact" }], "hits closer than 1.5 s and unknown sounds are dropped");
  assert.equal(by.SC0004, undefined, "a flash over the script's dissolve is refused");
  assert.equal(by.SC0001, undefined, "the chapter's first scene opens on its dip or the first frame");
  assert.equal(by.SC0005.transition, "slide");
  assert.deepEqual(by.SC0005.shakes, [45], "shakes are at least 2 s apart");
  for (const p of ["SC0042", "listed twice", "kazoo", "dissolve"]) assert.ok(plan.problems.some((x) => x.includes(p)), p);
  assert.ok(validateEditPlan([{ scene: "SC0003", transition: "spin" }], CHAPTER, "C1").problems[0].includes('unknown transition "spin"'));
  assert.deepEqual(validateEditPlan("no json", CHAPTER, "C1").scenes, []);
});

test("two named transitions never follow each other, counting the script's own", () => {
  const plan = validateEditPlan({ scenes: [{ scene: "SC0003", transition: "zoom" }] }, CHAPTER, "C1");
  assert.equal(plan.scenes.length, 0, "SC0002 already whips in");
  assert.ok(plan.problems[0].includes("right after another named transition"));
});

test("the timeline merges the edit: transitions, punch-ins and shakes on their shots, the director's sounds", () => {
  const edit = validateEditPlan({ scenes: [
    { scene: "SC0002", transition: "cut", punchIns: ["0:00:16.5"] },
    { scene: "SC0003", transition: "glitch", shakes: ["0:00:25.0"], hits: [{ at: "0:00:28.0", sound: "riser" }] },
    { scene: "SC0005", hits: [{ at: "0:00:44.0", sound: "whoosh" }] },
  ] }, CHAPTER, "C1");
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: CHAPTER, edit }] });
  const seg = (/** @type {string} */ id) => t.video.find((v) => v.id === id);
  assert.equal(seg("SC0002-1")?.transition, undefined, "the director's cut replaces the whip");
  assert.deepEqual(seg("SC0002-2")?.punchIns, [1.5], "seconds from the start of the shot on screen");
  assert.equal(seg("SC0003-1")?.transition, "glitch");
  assert.deepEqual(seg("SC0003-1")?.shakes, [5]);
  const at = (/** @type {string} */ token) => t.sfx.filter((e) => e.token === token).map((e) => e.start);
  assert.ok(at("AUTO-GLITCH").includes(20), "a glitch transition brings its sound");
  assert.ok(at("AUTO-IMPACT").includes(25), "a shake is an impact");
  assert.ok(at("AUTO-RISER").includes(26.4), "a riser ends on its moment");
  assert.ok(at("AUTO-WHOOSH").includes(43.8), "a whoosh leads into its moment");
  // Without an edit the script's whip stays and nothing is punched.
  const plain = buildTimeline({ chapters: [{ id: "C1", markdown: CHAPTER }] });
  assert.equal(plain.video.find((v) => v.id === "SC0002-1")?.transition, "whip");
  assert.ok(plain.video.every((v) => !v.punchIns && !v.shakes));
});

test("the edit's sounds keep the breathing room: an automatic sound near a directed hit is left out", () => {
  const edit = validateEditPlan({ scenes: [{ scene: "SC0002", hits: [{ at: "0:00:10.5", sound: "impact" }] }] }, CHAPTER, "C1");
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: CHAPTER, edit }] });
  const near = t.sfx.filter((e) => e.kind === "hit" && Math.abs(e.start - 10.5) < 1.5);
  assert.deepEqual(near.map((e) => e.token), ["AUTO-IMPACT"], "the whip's whoosh gives way to the director's impact");
});

test("the director may show a scene's photos as prints or push toward one part; unknown words are dropped", () => {
  const plan = validateEditPlan({ scenes: [
    { scene: "SC0003", photo: { frame: "print", focus: "left" } },
    { scene: "SC0005", photo: { frame: "polaroid", focus: "middle" } },
    { scene: "SC0004", transition: "leak" },
  ] }, CHAPTER, "C1");
  assert.deepEqual(plan.scenes.map((s) => [s.scene, s.photo ?? null]), [["SC0003", { frame: "print", focus: "left" }]]);
  assert.ok(plan.problems.some((p) => p.includes("polaroid")) && plan.problems.some((p) => p.includes("middle")));
  assert.ok(plan.problems.some((p) => p.startsWith("SC0004")), "a leak over the script's dissolve is refused");
  assert.ok(editInstruction("C1", "", "History epic (archive look)").includes("This film: History epic"), "the director knows the kind of film");
});

test("code measures long holds: over 6 s in the first minute, over 12 s after; wordless scenes and black are left alone", async () => {
  const { longHolds, uncoveredHolds } = await import("../src/edit-director.mjs");
  const video = [
    { id: "SC0001-1", scene: "SC0001", start: 0, end: 8, type: "clip" },
    { id: "SC0002-1", scene: "SC0002", start: 8, end: 13, type: "clip" },
    { id: "SC0003-1", scene: "SC0003", start: 13, end: 25, type: "card" },
    { id: "SC0004-1", scene: "SC0004", start: 70, end: 81, type: "clip" },
    { id: "SC0005-1", scene: "SC0005", start: 81, end: 99, type: "clip" },
    { id: "SC0006-1", scene: "SC0006", start: 99, end: 120, type: "black" },
  ];
  const holds = longHolds(video, new Set(["SC0001", "SC0002", "SC0004", "SC0005", "SC0006"]));
  assert.deepEqual(holds.map((h) => [h.id, h.seconds]), [["SC0001-1", 8], ["SC0005-1", 18]], "SC0003 is wordless, SC0004 is under 12 s after the first minute, SC0006 is black");
  const plan = { chapter: "C1", by: /** @type {const} */ ("edit-director"), problems: [], scenes: [{ scene: "SC0001", punchIns: [4], shakes: [], hits: [] }, { scene: "SC0005", punchIns: [], shakes: [], hits: [], photo: { focus: /** @type {const} */ ("left") } }] };
  assert.deepEqual(uncoveredHolds(holds, plan), []);
  assert.deepEqual(uncoveredHolds(holds, { ...plan, scenes: [] }).map((h) => h.id), ["SC0001-1", "SC0005-1"]);
});
