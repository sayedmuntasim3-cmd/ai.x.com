import assert from "node:assert/strict";
import { test } from "node:test";
import { PACE, SAFE, attachMoments, findCandidates, momentSounds, planMoments, subjectOf } from "../src/voice-moments.mjs";

// The Apollo 11 narration (38 s): the phrases the first run's words had, spoken at a calm pace.
const SPEECH = "At 9:32 on a July morning in 1969, Apollo 11 lifted off from Cape Kennedy with the whole world watching from below. " +
  "Neil Armstrong, a quiet test pilot from Ohio, was the commander of the mission and the first to leave the ship. " +
  "Buzz Aldrin, an engineer who had studied orbits for years, would walk beside him on the dusty grey ground. " +
  "Michael Collins would circle alone above them, waiting in the dark for the call to bring them home. " +
  "More than 400,000 people had worked to make this day possible, from engineers to seamstresses to cooks. " +
  "Four days later, the world held its breath as the Eagle came down. Now it was real. The Eagle touched down.";
function timed(text) {
  let t = 0.3;
  return text.split(" ").map((w) => { const x = { text: w, start: Math.round(t * 100) / 100, end: Math.round((t + 0.3) * 100) / 100 }; t += /[.!?]$/.test(w) ? 0.75 : /,$/.test(w) ? 0.5 : 0.36; return x; });
}
const words = timed(SPEECH);
const film = words[words.length - 1].end + 1;

test("finds the three astronauts, the 400,000 and the time, spelled exactly as spoken", () => {
  const c = findCandidates(words);
  const names = c.filter((x) => x.kind === "lowerThird").map((x) => x.data.name);
  assert.deepEqual(names, ["Neil Armstrong", "Buzz Aldrin", "Michael Collins"]);
  const counter = c.find((x) => x.kind === "counter");
  assert.equal(counter.data.value, 400000);
  assert.equal(counter.data.after, "people");
  assert.match(c.find((x) => x.kind === "date" && /9:32/.test(x.data.text)).data.text, /^9:32 on a July morning in 1969$/);
  assert.ok(c.some((x) => x.kind === "place" && x.data.text === "Cape Kennedy"));
});

test("no moment for The, Now, It or a sentence starter", () => {
  const plan = planMoments({ words, duration: film, topic: "Apollo 11" });
  const shown = JSON.stringify(plan.moments.map((m) => m.data));
  for (const w of ["The", "Now", "It", "Four"]) assert.ok(!new RegExp(`"(?:name|text|title)":"${w}\\b`).test(shown), w);
  assert.ok(!findCandidates(timed("The Eagle landed. Now It began. He said hello.")).some((x) => x.kind === "lowerThird" && /^(The|Now|It|He)$/.test(x.data.name)));
});

test("the plan keeps the pace: one in the first 30 s, 4 s apart, one a sentence, calm, in the safe area, a title by 40 s", () => {
  const { moments, stats } = planMoments({ words, duration: film, topic: "Apollo 11" });
  assert.ok(moments.some((m) => m.kind === "lowerThird" && m.data.name === "Neil Armstrong"));
  assert.ok(moments.some((m) => m.kind === "counter" && m.data.value === 400000));
  assert.ok(moments.filter((m) => m.at < 30).length >= 1);
  assert.ok(stats.perMinute >= 1.4, String(stats.perMinute));
  for (let i = 1; i < moments.length; i += 1) assert.ok(moments[i].at - moments[i - 1].at >= PACE.gap - 0.01, `${moments[i - 1].id} -> ${moments[i].id}`);
  assert.equal(new Set(moments.filter((m) => m.sentence >= 0).map((m) => m.sentence)).size, moments.filter((m) => m.sentence >= 0).length);
  const title = moments.find((m) => m.kind === "title");
  assert.ok(title && title.at <= PACE.titleBy && title.data.title === "Apollo 11");
  for (const m of moments) { assert.ok(m.at + m.seconds <= film); if (m.kind === "lowerThird") assert.ok(m.data.lift / 100 >= SAFE.bottom); assert.equal(m.data.compact, true); }
});

test("the brain's own plan is kept and the gaps are filled around it", () => {
  const { moments } = planMoments({ words, duration: film, topic: "Apollo 11", existing: [{ start: 9, end: 12.5 }], hasTitle: true });
  assert.ok(!moments.some((m) => m.kind === "title"));
  for (const m of moments) assert.ok(m.at + m.seconds <= 9 - 0.3 || m.at >= 12.5 + 0.3, `${m.id} at ${m.at}`);
});

test("no topic: the subject is the name said as 'Word number'; a quote is carded with who said it", () => {
  assert.equal(subjectOf(words), "Apollo 11");
  assert.equal(subjectOf(words, "Apollo 11: the first steps on the Moon and everything that came after them"), "Apollo 11");
  const q = findCandidates(timed("Armstrong said it. “That is one small step for man, one giant leap for mankind.” Then silence."));
  assert.equal(q.find((x) => x.kind === "quote").data.quote, "That is one small step for man, one giant leap for mankind.");
});

test("attached to the pictures it counts as designed moments, 1.2 a minute or more", async () => {
  const { designedMoments, hookReport } = await import("../../render/critic.mjs");
  const { moments } = planMoments({ words, duration: film, topic: "Apollo 11" });
  const video = Array.from({ length: Math.floor(film / 5) }, (_, i) => ({ id: `S${i}`, type: "clip", start: i * 5, end: (i + 1) * 5 }));
  const { placed } = attachMoments(video, moments);
  assert.ok(placed.length >= 4, JSON.stringify(placed));
  assert.ok((designedMoments(video).length * 60) / film >= 1.2);
  assert.ok(hookReport({ video, narration: [] }).titleAt !== null);
  assert.equal(momentSounds(placed).length, placed.length);
});

test("a moment never lands on a designed card, and never runs past its shot", () => {
  const video = [{ id: "A", type: "card", start: 0, end: 6, counter: true }, { id: "B", type: "clip", start: 6, end: 8 }];
  const r = attachMoments(video, [{ id: "M1", kind: "lowerThird", template: "lowerThird", data: {}, at: 2, seconds: 3.6, sentence: 0, tier: "A", source: "words" }, { id: "M2", kind: "lowerThird", template: "lowerThird", data: {}, at: 6.2, seconds: 3.6, sentence: 1, tier: "A", source: "words" }]);
  assert.equal(r.placed.length, 0);
  assert.equal(r.dropped.length, 2);
});

test("a capitalised pair after 'at' or 'in' is a place, not a man's name card", () => {
  const ws = timed("The bridge at Tacoma Narrows collapsed in November of that year, while Leon Moisseiff watched the deck twist in the wind.");
  const c = findCandidates(ws);
  assert.deepEqual(c.filter((x) => x.kind === "lowerThird").map((x) => x.data.name), ["Leon Moisseiff"]);
  assert.ok(c.some((x) => x.kind === "place" && x.data.text === "Tacoma Narrows"));
});
