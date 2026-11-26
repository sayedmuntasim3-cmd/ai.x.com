import assert from "node:assert/strict";
import { test } from "node:test";
import { understandVoice } from "../src/voice-understand.mjs";
import { beatFindings, filmGenre, filmWorld, parseBeatLine, planBeats, worldBrief } from "../src/shot-plan.mjs";

// A Bengaluru life story told in rupees, as the first minutes of film 993f09ea are (words written for the test).
const text = "In 1979 a nine year old boy in Bengaluru lost his father. His mother worked as a cook to pay the school fees. " +
  "Ramesh Babu took over the family barber shop on Brigade Road when he was thirteen. Money was so short the family ate one meal a day. " +
  "In 1993 he bought his first car, a Maruti van, for one lakh rupees. He rented it out while he cut hair by day. " +
  "Today Ramesh Tours runs more than four hundred cars, among them a Rolls-Royce worth three crore rupees. And he still cuts hair at seventy five rupees.";
let t = 0;
const words = text.split(" ").map((w) => { const x = { text: w, start: t, end: t + 0.38 }; t += /[.!?]$/.test(w) ? 0.9 : 0.42; return x; });
const u = understandVoice({ transcript: { words }, totalSeconds: t + 1 });
const scenes = /** @type {NonNullable<typeof u.scenes>} */ (u.scenes);
const topic = "Ramesh Babu - From Barber to Rolls-Royce";

test("the world comes from the voice: India, Bengaluru, rupees, Indian people, the right era", () => {
  const w = filmWorld({ scenes, topic });
  assert.equal(w.country, "India");
  assert.equal(w.city, "Bengaluru");
  assert.equal(w.currency, "rupees");
  assert.equal(w.demonym, "Indian");
  assert.equal(w.era, "1970s–1990s");
  assert.equal(filmGenre(w, u.structure, topic), "biography");
  assert.match(worldBrief(w), /Bengaluru, India.*rupees.*Indian/);
});

test("no brain: beats tile every scene in order with the voice's words and times, and hold the world", async () => {
  const r = await planBeats({ scenes, structure: u.structure, topic });
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings));
  assert.equal(r.beats.map((b) => b.words).join(" "), scenes.map((s) => s.narration).join(" "));
  assert.equal(r.beats[0].start, scenes[0].start);
  assert.equal(r.beats.at(-1).end, scenes.at(-1)?.end);
  for (const b of r.beats) { assert.match(b.place, /India/); assert.ok(["understand", "feel"].includes(b.goal)); }
  assert.ok(r.beats.some((b) => b.emotion === "sorrow" || b.emotion === "struggle"));
  assert.ok(r.beats.some((b) => b.rung === "R2"));
});

test("a brain's generic, foreign and dollar beats are found, then repaired in code to 0 findings", async () => {
  const s = scenes.map((x) => x.sc);
  const reply = [
    `BEAT | ${s[0]}-${s[1]} | GOAL: feel | EMOTION: sorrow | REVEAL: his father died | RUNG: R2 | VISUAL: abstract film strip background, a sad man | PLACE: Amazon river, Brazil | ERA: 1979 | PEOPLE: random people`,
    `BEAT | ${s[2]} | GOAL: understand | EMOTION: hope | REVEAL: a car for $1500 | RUNG: R2 | VISUAL: a Maruti van bought for $1500 on a Bengaluru street | PLACE: Bengaluru, India | ERA: 1993 | PEOPLE: Ramesh Babu`,
    `BEAT | ${s[3]} | GOAL: astonish | EMOTION: joy | RUNG: R9 | VISUAL: fleet of cars | PLACE: | ERA: | PEOPLE:`,
    "Here are your beats!",
  ].join("\n");
  const brain = { name: "fake", capabilities: { vision: false }, call: async () => ({ text: reply, stopReason: "end_turn", usage: {} }) };
  const r = await planBeats({ scenes, structure: u.structure, topic, brain });
  const codes = new Set(r.brainFindings.map((f) => f.code));
  for (const c of ["generic-visual", "wrong-place", "wrong-currency", "goal-unknown", "emotion-unknown", "rung-unknown", "place-missing"]) assert.ok(codes.has(c), c);
  assert.equal(r.findings.length, 0, JSON.stringify(r.findings));
  assert.equal(r.beats[0].by, "brain");
  assert.doesNotMatch(JSON.stringify(r.beats), /Amazon|Brazil|abstract|film strip|\$|random/i);
  assert.match(r.beats[1].visual, /rupees/);
  assert.equal(r.beats.map((b) => b.words).join(" "), scenes.map((x) => x.narration).join(" "));
  assert.ok(r.brainUsed);
});

test("a used-up quota stops the brain; the rest of the beats come from the words", async () => {
  let calls = 0;
  const brain = { name: "q", capabilities: { vision: false }, call: async () => { calls += 1; throw Object.assign(new Error("429 daily limit"), { status: 429 }); } };
  const r = await planBeats({ scenes, structure: u.structure, topic, brain, batchChars: 200 });
  assert.equal(calls, 1);
  assert.ok(r.beats.every((b) => b.by === "words"));
  assert.ok(r.messages.some((m) => /quota/.test(m.en)));
});

test("a beat line is read field by field; people on screen must be the voice's people", () => {
  assert.deepEqual(parseBeatLine("BEAT | SC0002-SC0004 | GOAL: feel | EMOTION: hope")?.fields, { GOAL: "feel", EMOTION: "hope" });
  assert.equal(parseBeatLine("nothing here"), null);
  const w = filmWorld({ scenes, topic });
  const f = beatFindings({ goal: "feel", emotion: "hope", rung: "R3", visual: "a crowd of workers", place: "Bengaluru, India", era: "1990s", people: "workers", words: "He hired drivers." }, w);
  assert.ok(f.some((x) => x.code === "people-unplaced"));
});

// ---- the shot plan (M2) ----
import { planVoiceVisuals } from "../src/voice-visuals.mjs";
import { DESIGNED_TYPES, SHOT_TYPES, directEdit, hookScore, planShots, shotFindings } from "../src/shot-plan.mjs";
import { buildTimeline } from "../src/timeline.mjs";
import { parseSceneLines } from "../src/scene-lines.mjs";

const shotPlanOf = async () => {
  const b = await planBeats({ scenes, structure: u.structure, topic });
  const pics = await planVoiceVisuals({ scenes, structure: u.structure, topic });
  return { b, pics, plan: planShots({ markdown: pics.markdown, scenes, beats: b.beats, world: b.world, genre: b.genre, topic, structure: u.structure }) };
};

test("shot plan: every shot typed from the closed vocabulary, the hook and the title in time, 0 code-check failures", async () => {
  const { plan } = await shotPlanOf();
  assert.deepEqual(plan.findings, []);
  assert.ok(plan.shots.every((s) => SHOT_TYPES.includes(s.type)));
  assert.ok(plan.hook.beats >= 6, `${plan.hook.beats} beats in the first 30 s`);
  const title = plan.shots.find((s) => s.type === "title");
  assert.ok(title && title.start <= 40 && title.subject === topic);
  // Cards show only the voice's words; pictures carry the world's place and the beat's era.
  for (const s of plan.shots.filter((x) => DESIGNED_TYPES.includes(x.type) && x.type !== "title" && x.type !== "timeline")) assert.ok(text.includes(s.subject.replace(/^“|”(?: — .*)?$/g, "")), s.subject);
  assert.ok(plan.shots.filter((s) => s.rung !== "R1").every((s) => s.place === "Bengaluru, India" && s.era));
  // The scene lines keep the voice's words and times, and carry one TYPE per shot.
  for (const l of parseSceneLines(plan.markdown)) {
    const sc = /** @type {any} */ (scenes.find((s) => s.sc === l.sc));
    assert.equal(l.narration, sc.narration);
    assert.equal((l.fields.SHOTS.match(/\(\d+\)/g) ?? []).length, l.fields.TYPE.split(/;\s*/).length);
  }
  // The world is in the searches: "Q1 "<subject> Bengaluru"".
  assert.match(plan.markdown, /Q1 "[^"]+ Bengaluru[^"]*"/);
});

test("shot plan: the renderer's timeline reads TYPE as v.shotType, and a timeline card gets the timeline template", async () => {
  const { plan } = await shotPlanOf();
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: plan.markdown }], autoSound: false });
  assert.ok(t.video.filter((v) => v.type !== "black").every((v) => v.shotType && SHOT_TYPES.includes(v.shotType)));
  assert.ok(t.video.some((v) => v.shotType === "title" && v.type === "card"));
  const md = "**SC0001** | 0:00:00-0:00:06 | C1 | NARR: In 1979 he lost his father, and in 1993 he bought a van. | SHOTS: (1) R1 timeline card \"1979 he lost his father · 1993 he bought a van\" | TYPE: timeline";
  const v = buildTimeline({ chapters: [{ id: "C1", markdown: md }], autoSound: false }).video[0];
  assert.equal(v.shotType, "timeline");
  assert.deepEqual(v.graphic, { template: "timeline", data: { items: [{ year: "1979", label: "he lost his father" }, { year: "1993", label: "he bought a van" }], active: 1 } });
});

test("shot plan code checks: unknown type, invented card words, a long hold, a missing TYPE, changed words, a slow hook", async () => {
  const { b, plan } = await shotPlanOf();
  const shots = plan.shots.map((s) => ({ ...s }));
  shots[0].type = "slideshow";
  const card = shots.findIndex((s) => s.type === "kinetic-type");
  shots[card].subject = "He became a billionaire overnight";
  const pic = shots.findIndex((s) => s.rung !== "R1");
  shots[pic].seconds = 12;
  const md = plan.markdown.replace(/ \| TYPE: [^|]*/, "").replace("lost his father", "lost his dad");
  const codes = new Set(shotFindings({ markdown: md, scenes, shots, world: b.world, genre: b.genre, topic }).map((f) => f.code));
  for (const c of ["type-unknown", "card-words-invented", "hold-too-long", "type-missing", "words-changed"]) assert.ok(codes.has(c), c);
  const slow = [{ id: "x", start: 0, end: 30, seconds: 30, type: "live-video" }];
  assert.equal(hookScore(slow, scenes).beats, 1);
  assert.ok(shotFindings({ markdown: plan.markdown, scenes, shots: slow, world: b.world, genre: b.genre, topic }).some((f) => f.code === "hook-slow"));
});

test("Edit Director on a voiceover chapter: scene-relative times repaired, code cues kept, a used-up quota stops it", async () => {
  const { plan } = await shotPlanOf();
  const lines = parseSceneLines(plan.markdown);
  const late = /** @type {any} */ (lines.find((l) => l.start > 8 && l.end - l.start > 3));
  let calls = 0;
  const brain = /** @type {any} */ ({ call: async () => { calls += 1; return { text: "```json\n" + JSON.stringify({ scenes: [{ scene: late.sc, punchIns: ["0:00:01.5"], hits: [{ at: "0:00:01.5", sound: "impact" }], transition: "spin" }] }) + "\n```" }; } });
  const r = await directEdit({ markdown: plan.markdown, brain, code: plan.edit, genre: "biography" });
  assert.equal(r.answered, calls);
  const e = r.edit.scenes.find((s) => s.scene === late.sc);
  assert.ok(e && Math.abs(e.punchIns[0] - (late.start + 1.5)) < 0.01, JSON.stringify(e));
  assert.ok(r.edit.problems.some((p) => /spin/.test(p)));
  // Every code cue on a designed moment (not kinetic: the renderer lands its own impact) is in the edit.
  for (const c of plan.edit.filter((x) => x.hits.length)) assert.ok(r.edit.scenes.some((s) => s.scene === c.scene && s.hits.length), c.scene);
  const quota = /** @type {any} */ ({ call: async () => { throw Object.assign(new Error("429 day over"), { status: 429 }); } });
  const q = await directEdit({ markdown: plan.markdown, brain: quota, code: plan.edit, batchChars: 400 });
  assert.equal(q.calls, 1);
  assert.match(q.stopped, /429/);
});
