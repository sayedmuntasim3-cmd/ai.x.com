import assert from "node:assert/strict";
import { test } from "node:test";
import { namedQueries, namesIn } from "../src/picture-ladder.mjs";
import { chapterMedia } from "../src/film-media.mjs";
import { aboutNames } from "../../render/asset-rank/rerank.mjs";

const APOLLO = [
  ["SC0001", "On July 16, 1969, a Saturn V rocket lifted off from Kennedy Space Center."],
  ["SC0002", "Neil Armstrong, Buzz Aldrin and Michael Collins sat inside the command module."],
  ["SC0003", "Heavy machinery shook the ground."],
];
const MOODS = ["heavy machine vibration", "factory workers assembly", "pilot hands controls"];

test("Apollo 11: every shot query carries the subject, the sentence's names come before the moods", () => {
  const [a, b, c] = APOLLO.map(([, s], i) => namedQueries({ sentence: s, subject: "Apollo 11", queries: [MOODS[i]] }));
  assert.ok(a.queries.includes("Apollo 11 launch 1969"), a.queries.join(" | "));
  assert.ok(a.queries.some((q) => /Saturn V/.test(q)) && a.queries.some((q) => /Kennedy Space Center/.test(q)));
  assert.ok(b.queries.some((q) => /Neil Armstrong/.test(q)) && b.queries.some((q) => /command module/i.test(q)));
  for (const r of [a, b, c]) {
    assert.ok(r.named);
    assert.ok(r.queries.every((q) => /Apollo 11|Saturn V|Kennedy|Armstrong|command module/i.test(q)), r.queries.join(" | "));
  }
  // The mood words come after the names, never instead of them.
  assert.ok(a.queries.indexOf("Apollo 11 heavy machine vibration") > a.queries.indexOf("Apollo 11 Saturn V"));
});

test("a sentence with no names still gets the subject", () => {
  const r = namedQueries({ sentence: "He quietly slipped away.", subject: "Ferruccio Lamborghini", queries: ["old man walking"] });
  assert.ok(r.queries.length && r.queries.every((q) => q.includes("Ferruccio Lamborghini")), r.queries.join(" | "));
  const none = namedQueries({ sentence: "It was quiet.", subject: "", queries: ["clock"] });
  assert.deepEqual(none.queries, []);
  assert.equal(none.named, false);
});

test("Lamborghini and Tacoma: the names of the sentence are searched with the subject and the year", () => {
  const l = namedQueries({ sentence: "Ferruccio Lamborghini unveiled the Miura at the Geneva Motor Show in 1966.", subject: "Lamborghini Miura" });
  assert.ok(l.queries.some((q) => /Geneva Motor Show/.test(q)) && l.queries.some((q) => /1966/.test(q)), l.queries.join(" | "));
  const t = namedQueries({ sentence: "On November 7, 1940, the Tacoma Narrows Bridge twisted and collapsed.", subject: "Tacoma Narrows Bridge" });
  assert.ok(t.queries.some((q) => /collapse/.test(q) && /1940/.test(q)), t.queries.join(" | "));
  assert.deepEqual(namesIn("Then it began.").names, []);
});

/** @param {string} id @param {string} title @param {boolean} archive */
const item = (id, title, archive, kind = "image") => ({ id, source: archive ? "nasa" : "pixabay", mediaType: kind, title, previewUrl: `https://x/${id}.jpg`, mediaUrl: `https://x/${id}`, sourcePageUrl: `https://x/${id}.html`, creator: null, license: archive ? "CC0" : "Pixabay Content License", licenseUrl: null, durationSeconds: kind === "video" ? 12 : null, width: 3000, height: 2000, attributionRequired: false });
/** @param {string} id @param {boolean} archive @param {string[]} calls @param {Record<string, any[]>} byKind */
const provider = (id, archive, calls, byKind) => ({ id, layer: archive ? 1 : 2, kinds: /** @type {("video" | "image")[]} */ (Object.keys(byKind)), cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search(/** @type {string} */ q, /** @type {"video" | "image"} */ kind) { calls.push(`${id}:${kind}:${q}`); return byKind[kind] ?? []; } });

test("a named shot searches archives before stock and takes the Apollo archive picture, not the stock truck", async () => {
  /** @type {string[]} */
  const calls = [];
  const nasa = provider("nasa", true, calls, { image: [item("n1", "Apollo 11 Saturn V launch Kennedy Space Center 1969", true)], video: [] });
  const pix = provider("pixabay", false, calls, { video: [item("p1", "mining truck heavy machine", false, "video")], image: [] });
  const md = 'SC0001 | 0:00:00-0:00:06 | launch | SHOTS: (1) R3 heavy machine | SRC: x · Q1 "heavy machine vibration"';
  const r = await chapterMedia({ chapter: "C1", markdown: md, providers: [pix, nasa], subject: "Apollo 11", wholeWord: true, heard: { SC0001: APOLLO[0][1] } });
  assert.equal(r.shots[0].pick?.id, "n1");
  const firstStock = calls.findIndex((c) => c.startsWith("pixabay"));
  assert.ok(firstStock === -1 || calls.findIndex((c) => c.startsWith("nasa")) < firstStock, calls.join("\n"));
});

test("a named shot with nothing relevant holds the chapter's strong pick, never a random picture", async () => {
  /** @type {string[]} */
  const calls = [];
  const nasa = provider("nasa", true, calls, { image: [item("n1", "Apollo 11 Saturn V launch 1969", true)] });
  const pix = provider("pixabay", false, calls, { video: [], image: [] });
  const md = [
    'SC0001 | 0:00:00-0:00:06 | launch | SHOTS: (1) R3 launch | SRC: x · Q1 "saturn launch"',
    'SC0002 | 0:00:06-0:00:12 | dark | SHOTS: (1) R3 dark | SRC: x · Q1 "quiet"',
  ].join("\n");
  const only = { ...nasa, async search(/** @type {string} */ q) { calls.push(q); return /saturn/i.test(q) ? [item("n1", "Apollo 11 Saturn V launch 1969", true)] : []; } };
  const r = await chapterMedia({ chapter: "C1", markdown: md, providers: [only, pix], subject: "Apollo 11", wholeWord: true, holdWeak: true, heard: { SC0001: APOLLO[0][1], SC0002: "It was quiet." } });
  assert.equal(r.shots[0].pick?.id, "n1");
  assert.equal(r.shots[1].pick?.id, "n1", "held, not random");
});

test("aboutNames: stock must carry a name word, an archive title must name the subject", () => {
  assert.equal(aboutNames({ source: "pixabay", title: "mining truck, heavy machine" }, ["Apollo 11", "Saturn V"]), false);
  assert.equal(aboutNames({ source: "wikimedia", title: "File:Saturn V launch.jpg" }, ["Apollo 11", "Saturn V"]), true);
});
