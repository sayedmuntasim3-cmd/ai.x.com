import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIGHT_LIMITS, MIN_PICTURE_LUMA, chapterMarkdown, checkCard, clockOf, creditsMarkdown, freeLicence, madeToday, makeFilm, pickMedia, programOf, programTiming, rankPictures, readLedger, sceneTiming, secondsOf, writeRun } from "./light-studio.mjs";
import { parseSceneLines } from "../engine/src/scene-lines.mjs";

/** A card of three short scenes, the smallest thing that is still a film. */
const card = {
  id: "test-film",
  title: "The Lamp That Lit a Street",
  minutes: 1,
  titleCard: false,
  chapterTitle: "One street, one lamp",
  scenes: [
    { narration: "In eighteen eighty one a street in Newcastle had no electric light at all.", shots: ["electric lamp 1880", "Victorian street at night"], anchor: "Newcastle" },
    { narration: "A small workshop built the first lamp that could be sold, and the neighbours came out to see it burn.", shots: ["incandescent light bulb"], anchor: "workshop" },
    { narration: "Within a year the street was lit, and every city that could pay followed.", shots: ["gas lamp street"], anchor: "city" },
  ],
};

test("the clock writes and reads the same second", () => {
  assert.equal(clockOf(0), "0:00:00.0");
  assert.equal(clockOf(83.4), "0:01:23.4");
  assert.equal(secondsOf(clockOf(185.7)), 185.7);
});

test("scene times tile the film exactly", () => {
  const timing = sceneTiming(card.scenes, 60);
  assert.equal(timing[0].start, 0);
  assert.equal(timing[timing.length - 1].end, 60);
  for (let i = 1; i < timing.length; i += 1) assert.equal(timing[i].start, timing[i - 1].end);
  for (const t of timing) assert.ok(t.seconds > 0, "every scene has time");
});

test("a card becomes a chapter the engine's own checks accept", () => {
  const dir = mkdtempSync(join(tmpdir(), "light-run-"));
  const run = writeRun(card, { dir });
  assert.equal(run.scenes.length, 3);
  assert.deepEqual(run.check.errors, []);
  const film = JSON.parse(readFileSync(join(dir, "film.json"), "utf8"));
  // The words decide the length: 48 words at 150 a minute is 19.2 s, and the card's "1 minute" is a wish.
  assert.equal(film.durationSeconds, 19.2);
  assert.equal(run.short, true);
  assert.equal(film.topic, card.title);
  const plan = JSON.parse(readFileSync(join(dir, "s3-chapters.json"), "utf8"));
  assert.deepEqual(plan.map((c) => c.id), ["C1"]);
  const markdown = readFileSync(join(dir, "s5-C1.md"), "utf8");
  const parsed = parseSceneLines(markdown);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((s) => s.sc), ["SC0001", "SC0002", "SC0003"]);
  assert.equal(parsed[0].fields.ANCHOR, "Newcastle");
  assert.equal(parsed[0].fields.SHOTS, "(1) electric lamp 1880; (2) Victorian street at night");
  assert.match(markdown, /LOOK: ARCHIVE stills/);
});

test("a card that cannot make a film is refused with its reason", () => {
  assert.equal(checkCard({ title: "x", scenes: [] }).ok, false);
  assert.equal(checkCard({ title: "A real title", minutes: 0, scenes: [{}] }).ok, false);
  assert.deepEqual(checkCard(card).errors, []);
});

test("only publishable licences pass", () => {
  assert.equal(freeLicence("Public domain")?.id, "PUBLIC-DOMAIN");
  assert.equal(freeLicence("CC0")?.id, "CC0-1.0");
  assert.equal(freeLicence("CC BY 4.0")?.id, "CC-BY");
  assert.equal(freeLicence("CC BY-SA 4.0"), null, "share-alike would take the film's licence");
  assert.equal(freeLicence("CC BY-NC 4.0"), null, "non-commercial cannot be sold");
  assert.equal(freeLicence("CC BY-ND 4.0"), null);
  assert.equal(freeLicence("GFDL"), null);
  assert.equal(freeLicence(""), null);
});

test("pictures are ranked by the query's words and by a wide frame", () => {
  const ranked = rankPictures([
    { id: "a", title: "A cat", mediaUrl: "a.jpg", width: 800, height: 1200 },
    { id: "b", title: "Electric lamp in a museum", mediaUrl: "b.jpg", width: 1600, height: 900 },
    { id: "c", title: "An electric lamp", mediaUrl: "c.jpg", width: 800, height: 600 },
  ], "electric lamp");
  assert.deepEqual(ranked.map((r) => r.id), ["b", "c", "a"]);
});

test("every shot gets a free picture, none twice inside the window", async () => {
  const dir = mkdtempSync(join(tmpdir(), "light-media-"));
  const run = writeRun(card, { dir });
  const calls = [];
  const provider = {
    async search(query) {
      calls.push(query);
      return [
        { id: `x:${query}`, title: query, mediaUrl: `https://example.test/${encodeURIComponent(query)}.jpg`, sourcePageUrl: "https://commons.wikimedia.org/wiki/File:X", creator: "A. Photographer", license: "CC BY 4.0", mediaType: "image", width: 1600, height: 900 },
        { id: `unfree:${query}`, title: query, mediaUrl: "https://example.test/unfree.jpg", license: "CC BY-SA 4.0", mediaType: "image", width: 1600, height: 900 },
      ];
    },
  };
  const { media, credits } = await pickMedia(run, card, { provider, luma: async () => 90 });
  assert.equal(media.shots.length, 4, "four written shots, four pictures");
  assert.ok(calls.every((q) => q.includes("lamp") || q.includes("street") || q.includes("bulb") || q.includes("lamp") || q.includes("Victorian")), calls.join(","));
  assert.ok(media.shots.every((s) => s.pick.licence.id === "CC-BY"));
  const ids = media.shots.map((s) => s.pick.id);
  assert.equal(new Set(ids).size, ids.length, "no picture stands twice in one film");
  assert.equal(credits[0].creator, "A. Photographer");
  assert.match(creditsMarkdown(card, credits), /A\. Photographer/);
});

test("a shot with no free picture is left to a text card, not filled with an unfree one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "light-none-"));
  const run = writeRun(card, { dir });
  const provider = { async search() { return [{ id: "u", title: "u", mediaUrl: "https://example.test/u.jpg", license: "CC BY-NC 4.0", mediaType: "image" }]; } };
  const { media } = await pickMedia(run, card, { provider, luma: async () => 90 });
  assert.equal(media.shots.length, 0);
});

test("the daily cap counts what was made today, and only today", () => {
  const ledger = [
    { at: "2026-11-26T01:00:00.000Z", status: "rendered" },
    { at: "2026-11-26T02:00:00.000Z", status: "run-folder" },
    { at: "2026-11-25T23:00:00.000Z", status: "rendered" },
  ];
  const made = madeToday(ledger, new Date("2026-11-26T12:00:00.000Z"));
  assert.equal(made.length, 1);
  assert.equal(LIGHT_LIMITS.dailyFilms, 10);
});

test("the ledger is appended, never rewritten", async () => {
  const dir = mkdtempSync(join(tmpdir(), "light-ledger-"));
  const file = join(dir, "light-ledger.json");
  const provider = { async search() { return []; } };
  await makeFilm(card, { out: join(dir, "one"), render: false, provider, luma: async () => 90 });
  assert.ok(existsSync(join(dir, "one", "media-C1.json")));
  assert.ok(existsSync(join(dir, "one", "CREDITS.md")));
  assert.ok(existsSync(join(dir, "one", "film.json")));
  assert.deepEqual(readLedger(file), [], "nothing is written to the ledger by a run folder alone");
});

test("a rendered film runs the narrator and the one renderer, in that order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "light-exec-"));
  const calls = [];
  await makeFilm(card, { out: join(dir, "film"), provider: { async search() { return []; } }, luma: async () => 90, exec: async (c, a) => { calls.push(a); } });
  assert.equal(calls.length, 2);
  assert.match(calls[0].join(" "), /render\/narrate\.mjs .*--run/);
  assert.match(calls[1].join(" "), /render\/render-film\.mjs .*--voice/);
  assert.match(calls[1].join(" "), /--width 1280 --height 720/);
  assert.equal(chapterMarkdown(card, programOf(card), programTiming(programOf(card)).timing).split("\n").length, 3);
});

test("a card's designed beats become wordless cards the renderer draws, not slideshow frames", () => {
  const dir = mkdtempSync(join(tmpdir(), "light-beat-"));
  const withBeats = {
    ...card,
    titleCard: true,
    beats: [
      { after: 2, kind: "counter", text: "30 bronze gears" },
      { after: 3, kind: "kinetic", text: "The sky in a box" },
    ],
    closing: "Who paid for it still has no answer",
  };
  const run = writeRun(withBeats, { dir });
  // title + 3 scenes + 2 beats + closing
  assert.equal(run.scenes.length, 7);
  assert.equal(run.designed, 4);
  assert.deepEqual(run.check.errors, []);
  const parsed = parseSceneLines(readFileSync(join(dir, "s5-C1.md"), "utf8"));
  assert.equal(parsed[0].wordless, true, "the title card is wordless");
  assert.match(parsed[0].fields.SHOTS, /R1 kinetic card "The Lamp That Lit a Street"/);
  assert.equal(parsed[0].fields.FX, "FX-KINETIC");
  const counter = parsed.find((s) => /30 bronze gears/.test(s.raw));
  assert.equal(counter?.wordless, true);
  assert.equal(counter?.fields.FX, "FX-COUNTER");
  assert.equal(counter?.fields.OST, '"30 bronze gears"');
  assert.equal(parsed[parsed.length - 1].wordless, true, "the closing card is wordless too");
  // The cards take real seconds out of the film, and the words keep their share.
  assert.ok(run.seconds > 19.2, `the cards add time (${run.seconds})`);
});

test("a beat that cannot be drawn is refused with its reason", () => {
  const bad = { ...card, beats: [{ after: 9, kind: "counter", text: "no number here" }] };
  const errors = checkCard(bad).errors.join(" ");
  assert.match(errors, /scenes \(1-3\)/);
  assert.match(errors, /needs a number/);
});

test("a picture that is black on screen is skipped for the next free one", async () => {
  const dir = mkdtempSync(join(tmpdir(), "light-dark-"));
  const run = writeRun(card, { dir });
  const asked = [];
  const provider = {
    async search(query) {
      asked.push(query);
      return [
        // A free deep-space photograph: 8/255, a hole in the film.
        { id: `dark:${query}`, title: `${query} deep space objects`, mediaUrl: `https://example.test/dark-${encodeURIComponent(query)}.jpg`, license: "Public domain", mediaType: "image", width: 1920, height: 1280 },
        { id: `lit:${query}`, title: `${query} in a museum`, mediaUrl: `https://example.test/lit-${encodeURIComponent(query)}.jpg`, license: "Public domain", mediaType: "image", width: 1920, height: 1280 },
      ];
    },
  };
  const luma = async (url) => (url.includes("dark-") ? 8 : 110);
  const { media } = await pickMedia(run, card, { provider, luma });
  assert.equal(media.shots.length, 4);
  assert.ok(media.shots.every((s) => s.pick.id.startsWith("lit:")), media.shots.map((s) => s.pick.id).join(","));
  assert.ok(MIN_PICTURE_LUMA > 8);
});
