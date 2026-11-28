import assert from "node:assert/strict";
import { test } from "node:test";
import { categoriesOf, cleanSubject, eraOf, isBareCommon, queryLadder, subjectFromTranscript, subjectOf } from "../src/picture-ladder.mjs";
import { filmSubject } from "../src/voice-visuals.mjs";
import { chapterMedia, createUseHistory } from "../src/film-media.mjs";

const TOPIC = "Galloping Gertie: the fall of the Tacoma Narrows Bridge";

test("the subject, era and category come out of the film's title and the shot", () => {
  assert.equal(subjectOf(TOPIC), "Tacoma Narrows Bridge");
  assert.equal(subjectOf("Hoover Dam"), "Hoover Dam");
  assert.equal(eraOf("R3 thin, 1943"), "1940s");
  assert.equal(eraOf("no year"), "");
  assert.ok(categoriesOf("Tacoma Narrows Bridge").includes("suspension bridge"));
});

test("the ladder anchors a bare keyword to the subject and descends: subject, era, category; a bare common word is never sent alone", () => {
  const ladder = queryLadder({ queries: ["thin"], description: "R3 thin, 1940s", topic: TOPIC });
  assert.equal(ladder[0], "Tacoma Narrows Bridge thin");
  assert.deepEqual(ladder.slice(1, 3), ["Tacoma Narrows Bridge", "Tacoma Narrows Bridge 1940s"]);
  assert.ok(ladder.includes("suspension bridge") && ladder.includes("1940s suspension bridge"));
  assert.ok(!ladder.includes("thin"), "the bare word is dropped, not kept for last: it found dogs and clocks");
  // A query that already names the subject, or has several words, is not changed; without a topic nothing changes.
  assert.equal(queryLadder({ queries: ["Tacoma Narrows collapse"], topic: TOPIC })[0], "Tacoma Narrows collapse");
  assert.deepEqual(queryLadder({ queries: ["thin"] }), [], "no subject, nothing to anchor a bare word to");
  assert.deepEqual(queryLadder({ queries: ["Armstrong"] }), ["Armstrong"], "a capitalised name is not a bare common word");
});

const row = (id, from, to, shots, q) => `**${id}** | 0:00:${String(from).padStart(2, "0")}-0:00:${String(to).padStart(2, "0")} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: ${shots} | SRC: Pixabay · Q1 "${q}" | LOOK: L`;
/** A provider that only knows the category "suspension bridge". */
const provider = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search(/** @type {string} */ q) {
  if (!/suspension bridge/i.test(q)) return [];
  return [{ id: `pexels:video:${q.length}`, source: "pexels", mediaType: "video", title: "Suspension bridge in wind", previewUrl: null, mediaUrl: "https://v/b.mp4", sourcePageUrl: "https://www.pexels.com/video/1/", creator: "Ana", license: "Pexels License", licenseUrl: null, durationSeconds: 8, width: 1920, height: 1080, attributionRequired: false }];
} };

test("a bare keyword that finds nothing alone finds the subject's category; a shot with nothing at all holds a strong picture, and says so", async () => {
  const md = [row("SC0001", 0, 8, "(1) R3 thin", "thin"), row("SC0002", 8, 16, "(1) R3 sang", "sang")].join("\n");
  const without = await chapterMedia({ chapter: "C1", markdown: md, providers: [provider], history: createUseHistory() });
  assert.deepEqual(without.shots.map((s) => s.status), ["no-query", "no-query"], "before: the bare words are never sent alone, so nothing is searched and nothing is found (two text cards)");
  const withTopic = await chapterMedia({ chapter: "C1", markdown: md, providers: [provider], history: createUseHistory(), topic: TOPIC });
  assert.equal(withTopic.shots[0].status, "found");
  assert.equal(withTopic.shots[0].query, "suspension bridge");
  // The second shot is blocked by the 10-minute rule (same clip id): with holdWeak it takes the nearest strong pick, reported as reused.
  const held = await chapterMedia({ chapter: "C1", markdown: md, providers: [provider], history: createUseHistory(), topic: TOPIC, holdWeak: true });
  assert.ok(held.shots.every((s) => s.status === "found"));
  const reused = held.shots.filter((s) => s.reused);
  assert.equal(reused.length, held.stats.reused);
  for (const r of reused) assert.ok(r.trace.some((t) => t.provider === "held" && t.outcome === "reused"));
});

/** The words of voice film e0b87efb (38 s, no topic typed), as the evidence describes them. */
const APOLLO = "Cape Kennedy, Florida, July sixteenth, 1969. Neil Armstrong, Buzz Aldrin and Michael Collins sit atop the rocket. In eight minutes they will leave the earth. It is a question the whole world asks, and a moment it waits for, a clock ticking, a family watching, hearts racing.";

test("no topic typed: the subject comes from the words, every query carries it, and no query is a bare common word, number or function word", async () => {
  assert.equal(subjectOf("", APOLLO), "Apollo 11");
  assert.equal(subjectOf("Galloping Gertie: the fall of the Tacoma Narrows Bridge", APOLLO), "Tacoma Narrows Bridge", "a typed topic still wins");
  assert.equal(subjectFromTranscript("Ramesh Babu was a barber in Pune. Ramesh Babu bought a Rolls-Royce in 1990."), "Ramesh Babu Pune Rolls-Royce 1990", "names, places and the year when no known event fits");
  const subject = subjectFromTranscript(APOLLO);
  const bare = ["clock", "eight", "question", "family", "moment", "the", "8", "launch", "sunset"];
  for (const w of bare) assert.ok(isBareCommon(w), `"${w}" is a bare common word`);
  assert.ok(!isBareCommon("Apollo") && !isBareCommon("Cape Kennedy") && !isBareCommon("launch pad"));
  // Through the ladder: every query includes the subject, none is bare.
  const ladder = queryLadder({ queries: [...bare, "launch pad", "Armstrong"], description: "a clock on the wall", topic: "", subject });
  assert.ok(ladder.length >= bare.length);
  for (const q of ladder) { assert.match(q, /Apollo/); assert.ok(!isBareCommon(q), `"${q}" is bare`); }
  // Through the search: the providers are only ever asked those queries.
  const asked = /** @type {string[]} */ ([]);
  const spy = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search(/** @type {string} */ q) { asked.push(q); return []; } };
  const md = bare.map((w, i) => row(`SC000${i + 1}`, i * 8, i * 8 + 8, `(1) R3 ${w}`, w)).join("\n");
  await chapterMedia({ chapter: "C1", markdown: md, providers: [spy], history: createUseHistory(), subject });
  assert.ok(asked.length > 0);
  for (const q of asked) { assert.match(q, /apollo/i, `"${q}" lacks the subject`); assert.ok(!isBareCommon(q)); }
  // Without any subject a bare common word is dropped, never sent alone.
  const none = /** @type {string[]} */ ([]);
  await chapterMedia({ chapter: "C1", markdown: md, providers: [{ ...spy, async search(/** @type {string} */ q) { none.push(q); return []; } }], history: createUseHistory() });
  assert.deepEqual(none.filter(isBareCommon), []);
});

test("the subject is asked of a small free-brain call only after the names; a failing or rambling brain leaves the names", async () => {
  /** @type {any[]} */
  const calls = [];
  const brain = (/** @type {() => string} */ reply) => ({ call: async (/** @type {any} */ req) => { calls.push(req); return { text: reply(), stopReason: "end", usage: {} }; } });
  assert.deepEqual(await filmSubject({ text: APOLLO, brain: brain(() => "Apollo 11 moon launch, 1969") }), { subject: "Apollo 11 moon launch, 1969", by: "brain" });
  assert.match(calls[0].messages[0].content[0].text, /6 words or fewer/);
  assert.match(calls[0].messages[0].content[0].text, /Apollo 11/, "the names found first are given to the brain");
  assert.equal((await filmSubject({ text: APOLLO, brain: brain(() => "This recording appears to be a dramatic reading about the launch of a rocket") })).by, "names");
  assert.deepEqual(await filmSubject({ text: APOLLO, brain: { call: async () => { throw new Error("429"); } } }), { subject: "Apollo 11", by: "names" });
  assert.deepEqual(await filmSubject({ text: APOLLO }), { subject: "Apollo 11", by: "names" });
  assert.equal(cleanSubject("Subject: \"Apollo 11.\""), "Apollo 11");
});
