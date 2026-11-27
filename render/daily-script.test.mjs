import { test } from "node:test";
import assert from "node:assert/strict";
import { brainCall, chapterSources, cleanNarration, parseOutline, splitSections, wordCount, writeScript } from "./daily-script.mjs";
import { concatList, scriptLines } from "./daily-voice.mjs";
import { DAILY_TOPICS, nextDailyTopic } from "../worker/daily-film.mjs";

test("the topic queue: fifteen engineering topics, never repeated", () => {
  assert.equal(DAILY_TOPICS.length, 15);
  assert.equal(new Set(DAILY_TOPICS.map((t) => t.id)).size, 15);
  for (const t of DAILY_TOPICS) assert.ok(t.wiki.length && t.question.endsWith("?"), t.id);
  assert.equal(nextDailyTopic([])?.id, "tacoma-narrows-1940");
  assert.equal(nextDailyTopic(["tacoma-narrows-1940"])?.id, "st-francis-dam");
  assert.equal(nextDailyTopic(DAILY_TOPICS.map((t) => t.id)), null);
});

test("the source: reference lists dropped, sections split across the parts", () => {
  const text = `Lead text about the bridge. `.repeat(20) + `\n\n== Design ==\n${"Design facts. ".repeat(900)}\n\n=== Deck ===\n${"Deck facts. ".repeat(900)}\n\n== Collapse ==\n${"Collapse facts. ".repeat(900)}\n\n== References ==\nA ref line that is long enough to keep around here.\n\n=== Sub ===\nMore refs that should go away entirely, too.`;
  const s = splitSections(text);
  assert.deepEqual(s.map((x) => x.heading), ["Introduction", "Design", "Deck", "Collapse"]);
  const parts = chapterSources(s, 4);
  assert.equal(parts.length, 4);
  for (const p of parts) assert.match(p, /Lead text/);
  assert.match(parts[0], /Design facts/);
  assert.match(parts[3], /Collapse facts/);
  // A short source is shown whole to every part.
  const short = chapterSources(splitSections(`Lead text, long enough to keep as a section.\n== A ==\nOnly a little here, but enough to keep it.`), 3);
  assert.equal(new Set(short).size, 1);
});

test("narration is only what the narrator says: no headings, markdown or quotation marks", () => {
  const t = cleanNarration(`# Part 1\n**Chapter 1: The fall**\n\nOn November seventh the deck began to "twist".\n- A list line\n[Music swells]\n\nNarrator: The end.`);
  assert.equal(t, "On November seventh the deck began to twist.\n\nA list line\n\nThe end.");
  assert.equal(wordCount("Forty-two miles an hour, it's said."), 6);
});

test("the fact pass cuts the sentences it listed, unless it would cut most of the part", async () => {
  const { cutSentences } = await import("./daily-script.mjs");
  const text = "The deck twisted. Within seconds it fell into the water below.\n\nTubby the dog died. Nobody else did. The bridge was new.";
  const r = cutSentences(text, "- Within seconds, it fell into the water below\n");
  assert.equal(r.text, "The deck twisted.\n\nTubby the dog died. Nobody else did. The bridge was new.");
  assert.equal(r.removed.length, 1);
  assert.equal(cutSentences(text, "NONE").text, text);
  assert.equal(cutSentences(text, "The deck twisted.\nWithin seconds it fell into the water below.\nTubby the dog died.").removed.length, 0);
});

test("the outline's lines are read, else a plain escalating arc", () => {
  const o = parseOutline("1. The fall: the deck twists\n2. **The need**: a bridge for Tacoma\n3. The answer - what changed", 3);
  assert.deepEqual(o.map((x) => x.title), ["The fall", "The need", "The answer"]);
  assert.equal(o[0].beat, "the deck twists");
  assert.equal(parseOutline("nonsense", 8).length, 8);
});

test("a used-up day stops the script with the brain's reason; a busy minute is tried again", async () => {
  let n = 0;
  const busy = { site: "https://s", id: "i", ticket: "t", fetch: /** @type {any} */ (async () => (++n < 2 ? new Response('{"error":"Groq: no model took the request; tried a (busy)"}', { status: 429 }) : new Response('{"text":"ok words","model":"m"}'))) };
  const state = { calls: [], last: 0, sleep: async () => {}, gapMs: 0 };
  assert.equal((await brainCall(busy, { system: "", prompt: "p", maxTokens: 10 }, state)).text, "ok words");
  const spent = { ...busy, fetch: /** @type {any} */ (async () => new Response('{"error":"Groq: tried a (day used up); Gemini 429 GenerateRequestsPerDayPerProjectPerModel-FreeTier"}', { status: 429 })) };
  await assert.rejects(brainCall(spent, { system: "", prompt: "p", maxTokens: 10 }, state), /daily limit is used up/);
});

test("the whole script: outline, eight parts from the source, a short part continued once", async () => {
  const article = { query: { pages: [{ title: "Test Bridge", extract: `Lead about the bridge. `.repeat(40) + ["Design", "Building", "Wind", "Collapse", "Inquiry", "Cause", "Legacy", "Today"].map((h) => `\n== ${h} ==\n${`${h} facts in detail. `.repeat(300)}`).join("") }] } };
  /** @type {any[]} */
  const prompts = [];
  const fetchBrain = /** @type {any} */ (async (/** @type {string} */ u, /** @type {any} */ init) => {
    if (u.includes("/progress")) return new Response("{}");
    const b = JSON.parse(init.body);
    prompts.push(b.prompt);
    if (/List every sentence/.test(b.prompt)) return new Response(JSON.stringify({ text: /Write part|SOURCE:\n## Introduction[\s\S]*Design facts/.test(b.prompt) ? "Some drivers were thrown into the water." : "NONE", model: "groq-a" }));
    if (/Plan the film/.test(b.prompt)) return new Response(JSON.stringify({ text: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `${i}. Title ${i}: beat ${i}`).join("\n"), model: "groq-a" }));
    // Part 3 comes back short the first time: the next call continues it.
    const short = /Write part 3 of/.test(b.prompt);
    return new Response(JSON.stringify({ text: `${/Write part 1 of/.test(b.prompt) ? "Some drivers were thrown into the water. " : ""}${"The deck moved in the wind. ".repeat(short ? 30 : 130)}`, model: "groq-a" }));
  });
  const topic = { ...DAILY_TOPICS[0], wiki: ["Test Bridge"] };
  const dir = (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "daily-"));
  const s = await writeScript({ c: { site: "https://s", id: "i", ticket: "t", fetch: fetchBrain }, topic, out: dir, get: /** @type {any} */ (async () => new Response(JSON.stringify(article))), sleep: async () => {}, gapMs: 0, log: () => {} });
  assert.equal(s.chapters.length, 8);
  assert.equal(prompts.length, 18);
  assert.deepEqual(s.factCheck.cut, ["Some drivers were thrown into the water."]);
  assert.doesNotMatch(s.chapters[0].text, /thrown/);
  assert.ok(prompts.some((p) => /Continue this part seamlessly/.test(p)));
  assert.ok(s.words > 5000);
  assert.equal(s.sources[0].url, "https://en.wikipedia.org/wiki/Test_Bridge");
  const lines = scriptLines(s);
  assert.equal(lines[0].scene, "SC0001");
  assert.equal(lines.filter((l) => l.partStart).length, 8);
  const list = concatList([{ scene: "SC0001", partStart: true }, { scene: "SC0002", partStart: false }, { scene: "SC0003", partStart: true }], "/n", new Set(["SC0001", "SC0003"]));
  assert.equal(list, "file '/n/SC0001.wav'\nfile '/n/gap-part.wav'\nfile '/n/SC0003.wav'\n");
});

test("the Worker's free brain as a model: text only, a busy minute waited out, a used-up day stops", async () => {
  const { workerBrain } = await import("./voice-runner.mjs");
  let n = 0;
  const c = { site: "https://s", id: "i", ticket: "t", fetch: /** @type {any} */ (async (/** @type {string} */ u, /** @type {any} */ init) => {
    assert.match(u, /\/brain\?ticket=t$/);
    assert.equal(JSON.parse(init.body).req.stage, "voice-director");
    return ++n < 2 ? new Response('{"error":"Groq: tried a (busy)"}', { status: 429 }) : new Response('{"text":"beats","model":"openai/gpt-oss-120b"}');
  }) };
  const m = workerBrain(c, { sleep: async () => {}, waitMs: 0 });
  assert.deepEqual(m.capabilities, { vision: false, webSearch: false });
  const r = await m.call({ stage: "voice-director", system: [{ text: "s" }], messages: [{ role: "user", content: [{ text: "p" }] }], maxTokens: 100 });
  assert.equal(r.text, "beats");
  assert.equal(m.calls.length, 1);
  const spent = workerBrain({ ...c, fetch: /** @type {any} */ (async () => new Response('{"error":"Groq: tried a (day used up); Gemini RESOURCE_EXHAUSTED"}', { status: 429 })) }, { sleep: async () => {}, waitMs: 0 });
  await assert.rejects(spent.call({ stage: "x", system: [], messages: [], maxTokens: 10 }), /daily limit is used up/);
});
