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
