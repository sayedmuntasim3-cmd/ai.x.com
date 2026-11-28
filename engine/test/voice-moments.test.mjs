import assert from "node:assert/strict";
import { test } from "node:test";
import { understandVoice } from "../src/voice-understand.mjs";
import { planBeats, planShots } from "../src/shot-plan.mjs";
import { planVoiceVisuals } from "../src/voice-visuals.mjs";
import { buildTimeline } from "../src/timeline.mjs";
import { MOMENT_GAP, MOMENTS_PER_MINUTE, insideSafeArea, planMoments, sentenceWords } from "../src/voice-moments.mjs";
import { designedMoments } from "../../render/critic.mjs";

// The words of the Apollo 11 voice film e0b87efb, which the critic blocked on 28 Nov 2026 ("Only 0 designed
// moments a minute; the house style needs 1.2", "the first 30 s has 9 shots and 0 designed moments", "title
// missing"). "At 9:32 on a July morning in 1969", "Cape Kennedy", the three names, "400,000 people" and a direct
// quote are all said here; the sentences carry the length a real narration has, so each moment has room.
const APOLLO = [
  "At 9:32 on the morning of July 16, 1969, the countdown at Cape Kennedy finally reached zero.",
  "The giant rocket stood on the pad for hours while the ground crews worked.",
  "Neil Armstrong climbed in first, and the whole world watched the door close behind him.",
  "Buzz Aldrin followed him into the capsule and strapped himself into the seat beside him.",
  "Michael Collins took the third seat and checked the instruments one last time.",
  "400,000 people worked on that rocket for almost a decade before the launch.",
  "Now the engines lit and the ground shook under the weight of the machine.",
  "It was the most powerful machine that had ever carried people into the sky.",
  "He said, “That's one small step for man, one giant leap for mankind.”",
].join(" ");

/** The words with the times a narration has: 0.4 s a word, a second of silence at every full stop. */
function timed(text, rate = 0.4, stop = 1) {
  let at = 0;
  return text.split(" ").filter(Boolean).map((w) => {
    const word = { text: w, start: Math.round(at * 1000) / 1000, end: Math.round((at + rate - 0.04) * 1000) / 1000 };
    at += /[.!?][”']?$/.test(w) ? rate - 0.04 + stop : rate;
    return word;
  });
}

const words = timed(APOLLO);
const seconds = words[words.length - 1].end;

test("Apollo 11: a lower third for each man the voice names, a counter for 400,000 people, the date and place, a quote, the title", () => {
  const r = planMoments({ words, topic: "Apollo 11", seconds });
  const lowers = r.moments.filter((m) => m.type === "lowerThird").map((m) => m.text);
  for (const n of ["Neil Armstrong", "Buzz Aldrin", "Michael Collins"]) assert.ok(lowers.includes(n), `${n} is missing (got ${lowers.join(", ")})`);
  const counter = r.moments.find((m) => m.type === "counter");
  assert.equal(counter?.text, "400,000 people", "the counter shows the number and what it counts");
  assert.equal(counter?.kind, "count");
  assert.ok(Math.abs(counter.start - words.find((w) => w.text.startsWith("400,000")).start) < 0.001, "on the word's own time");
  // A date and a place joined only because both are in the words.
  const date = r.moments.find((m) => m.kind === "datePlace");
  assert.equal(date?.text, "July 16, 1969 · Cape Kennedy");
  assert.ok(APOLLO.includes("July 16, 1969") && APOLLO.includes("Cape Kennedy"));
  assert.equal(r.moments.find((m) => m.type === "title")?.text, "Apollo 11");
  assert.match(r.moments.find((m) => m.type === "quote")?.text ?? "", /^“That's one small step for man, one giant leap for mankind\.”$/);
  // Something designed inside the first 30 s, and the pacing the house needs.
  assert.ok(r.moments.some((m) => m.start < 30 && (m.kind === "kinetic-type" || m.type === "title" || m.type === "kinetic-type")), JSON.stringify(r.moments.map((m) => [m.text, m.start])));
  assert.ok(r.moments.find((m) => m.type === "title").start < 40, "the title lands before 0:40");
  assert.ok(r.perMinute >= MOMENTS_PER_MINUTE, `${r.perMinute} a minute`);
  assert.ok(r.enough);
});

test("every moment is the voice's own words: nothing is typed for it", () => {
  const r = planMoments({ words, topic: "Apollo 11", seconds });
  for (const m of r.moments.filter((x) => x.type !== "title")) {
    const phrases = m.type === "quote" ? [m.text.replace(/^“|”[^”]*$/g, "").replace(/”$/, "")] : m.text.split(" · ");
    for (const p of phrases) assert.ok(APOLLO.includes(p), `"${p}" (from "${m.text}") is not in the voice`);
  }
});

test("no moment from a sentence start: The, Now, It", () => {
  const r = planMoments({ words, seconds });
  assert.ok(r.moments.length > 0);
  for (const m of r.moments) for (const bad of ["The", "Now", "It"]) assert.ok(!new RegExp(`^${bad}\\b`).test(m.text), `${bad} became a moment: "${m.text}"`);
  assert.ok(!r.moments.some((m) => ["The", "Now", "It"].includes(m.text)));
});

test("pacing and the safe area: 4 s apart, one a sentence, nothing in the caption band", () => {
  const r = planMoments({ words, topic: "Apollo 11", seconds });
  const sentences = sentenceWords(words);
  const sentenceOf = (/** @type {number} */ at) => sentences.findIndex((s) => at >= s.start - 0.001 && at < s.end + 0.001);
  const used = new Set();
  for (const [i, m] of r.moments.entries()) {
    assert.ok(insideSafeArea(m), `${m.text} draws outside the safe area`);
    const sc = sentenceOf(m.start);
    assert.ok(sc >= 0, `${m.text} is not inside a sentence`);
    assert.ok(!used.has(sc), `two moments in sentence ${sc}`);
    used.add(sc);
    if (i > 0) assert.ok(m.start - r.moments[i - 1].start >= MOMENT_GAP - 0.001, `${r.moments[i - 1].text} and ${m.text} are within ${MOMENT_GAP} s`);
  }
});

test("no title without a topic or a subject: the film says so instead", () => {
  const plain = timed("The river rose in the spring and the water filled the valley below. The town waited all night for the morning.");
  const r = planMoments({ words: plain, seconds: plain[plain.length - 1].end });
  assert.equal(r.title, null);
  assert.ok(!r.moments.some((m) => m.type === "title"));
  // With a topic the title is the user's own words.
  const withTopic = planMoments({ words: plain, topic: "The night the river rose", seconds: plain[plain.length - 1].end });
  assert.equal(withTopic.moments.find((m) => m.type === "title")?.text, "The night the river rose");
});

test("money, a percentage and a year with an event are worth a card", () => {
  const text = "The bill for the whole night came to $5,000 dollars before the crews went home. Only 3 percent of the fuel was left in the tank when the pumps stopped. In 1940 the bridge opened to traffic after nineteen months of hard work on the deck.";
  const w = timed(text);
  const r = planMoments({ words: w, seconds: w[w.length - 1].end });
  const money = r.moments.find((m) => m.kind === "money");
  assert.equal(money?.text, "$5,000 dollars");
  assert.equal(money?.type, "counter");
  assert.equal(r.moments.find((m) => m.kind === "percent")?.text, "3 percent");
  const year = r.moments.find((m) => m.kind === "year");
  assert.ok(year && year.type === "kinetic-type" && year.text.startsWith("1940"), year?.text);
});

/** The film as the pipeline plans it (no media: the pictures stay cards), with and without the moments. */
async function planned(moments = []) {
  const u = understandVoice({ transcript: { words }, totalSeconds: seconds + 1 });
  const scenes = /** @type {NonNullable<typeof u.scenes>} */ (u.scenes);
  const beats = await planBeats({ scenes, structure: u.structure, topic: "Apollo 11" });
  const pics = await planVoiceVisuals({ scenes, structure: u.structure, topic: "Apollo 11" });
  const plan = planShots({ markdown: pics.markdown, scenes, beats: beats.beats, world: beats.world, genre: beats.genre, topic: "Apollo 11", structure: u.structure, moments });
  const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: plan.markdown }], autoSound: false });
  return { plan, timeline };
}

test("the shot plan seats the moments on the voice's lines and the critic counts them", async () => {
  const moments = planMoments({ words, topic: "Apollo 11", seconds });
  const without = await planned([]);
  const withMoments = await planned(moments.moments);
  const t = withMoments.timeline;
  // The critic's own count on the planned timeline: at least 1.2 a minute (the e0b87efb block).
  const designed = designedMoments(t.video);
  const perMinute = (designed.length * 60) / t.durationSeconds;
  assert.ok(perMinute >= 1.2, `${designed.length} designed moments in ${t.durationSeconds} s (${perMinute.toFixed(2)} a minute)`);
  assert.ok(designed.some((v) => v.start < 30), "a designed moment in the first 30 s");
  // The templates the words chose reach the renderer as their own shot types.
  assert.ok(t.video.some((v) => v.shotType === "lowerThird" && v.text === "Neil Armstrong"));
  assert.ok(t.video.some((v) => v.shotType === "counter" && v.counter && v.text === "400,000 people"));
  assert.ok(t.video.some((v) => v.shotType === "kinetic-type" && v.text === "July 16, 1969 · Cape Kennedy"));
  assert.ok(t.video.some((v) => v.shotType === "quote" && /one small step/.test(v.text)));
  // The plan it already had is kept: the quote and its pictures stay, and only more shots are added. (A
  // kinetic line of the same sentence gives way to a person's lower third; that is the house's own preference.)
  const kept = new Set(without.plan.shots.map((s) => s.type).filter((t) => t !== "kinetic-type"));
  for (const type of kept) assert.ok(withMoments.plan.shots.some((s) => s.type === type), `${type} was lost`);
  assert.ok(withMoments.plan.shots.length > without.plan.shots.length);
  assert.equal(withMoments.plan.shots.filter((s) => s.type === "title").length, 1, "one title");
  // The codewords and the voice's own words survive the extra cards.
  assert.equal(moments.moments.filter((m) => m.type === "title").length, 1);
  assert.match(withMoments.plan.markdown, /NARR: At 9:32 on the morning of July 16, 1969/);
});
