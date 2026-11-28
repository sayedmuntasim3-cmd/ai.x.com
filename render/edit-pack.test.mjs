import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packFromRun, writeRunFromPack } from "./edit-pack.mjs";
import { changedParts } from "../engine/src/edit-pack.mjs";

const ID = "11111111-2222-3333-4444-555555555555";

/** A run folder as local/voice-film.mjs leaves it (the files this script reads). */
function runFolder() {
  const dir = mkdtempSync(join(tmpdir(), "edit-pack-"));
  const pick = (/** @type {string} */ id) => ({
    id,
    source: "pexels",
    kind: "video",
    mediaUrl: `https://videos.test/${id.replace(/[^a-z0-9]/gi, "")}.mp4`,
    previewUrl: `https://images.test/${id.replace(/[^a-z0-9]/gi, "")}.jpg`,
    sourcePageUrl: `https://www.test/${id}`,
    licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: `https://www.test/${id}` },
  });
  writeFileSync(join(dir, "s3-chapters.json"), JSON.stringify([{ id: "C1", title: "The pit" }]));
  writeFileSync(join(dir, "s5-C1.md"), "SC0001 0:00-0:20 \nNARRATION: A mine in the desert.\nSHOTS: R3 the headframe; R3 the truck\n");
  writeFileSync(join(dir, "media-C1.json"), JSON.stringify({ chapter: "C1", shots: [
    { scene: "SC0001", shot: 1, start: 0, end: 10, status: "found", query: "headframe", pick: pick("pexels:video:1"), alternates: [], trace: [] },
    { scene: "SC0001", shot: 2, start: 10, end: 20, status: "found", query: "truck", pick: pick("pexels:video:2"), alternates: [], trace: [] },
  ] }));
  writeFileSync(join(dir, "rank-C1.json"), JSON.stringify({ shots: [
    { scene: "SC0001", shot: 1, start: 0, sentence: "A mine in the desert.", after: "pexels:video:1", top: [{ id: "pexels:video:1", previewUrl: "https://images.test/1.jpg", mediaUrl: "https://videos.test/1.mp4", licence: "PEXELS", source: "pexels" }] },
    { scene: "SC0001", shot: 2, start: 10, sentence: "A truck rolls through.", after: "pexels:video:2", top: [{ id: "pixabay:image:7", previewUrl: "https://cdn.test/7.jpg", mediaUrl: "https://cdn.test/7.mp4", licence: "PIXABAY", source: "pixabay" }] },
  ] }));
  writeFileSync(join(dir, "words.json"), JSON.stringify({ words: [
    { text: "A", start: 0.1, end: 0.2 }, { text: "mine", start: 0.2, end: 0.6 },
    { text: "A", start: 10.1, end: 10.2 }, { text: "truck", start: 10.2, end: 10.7 },
  ] }));
  writeFileSync(join(dir, "voice-report.json"), JSON.stringify({ durationSeconds: 20.4 }));
  writeFileSync(join(dir, "s4.md"), "S4 cue plan\n");
  return dir;
}

test("the pack is written from the run's own files", () => {
  const dir = runFolder();
  const pack = packFromRun(dir, { filmId: ID, parts: 2 });
  assert.equal(pack.filmId, ID);
  assert.equal(pack.seconds, 20.4);
  assert.equal(pack.shots.length, 2);
  assert.equal(pack.shots[0].words, "A mine");
  assert.equal(pack.shots[0].pick.id, "pexels:video:1");
  assert.ok(pack.shots[1].candidates.some((c) => c.id === "pixabay:image:7"));
  assert.equal(pack.script.length, 1);
  assert.ok(pack.script[0].markdown.includes("SHOTS:"));
  assert.equal(pack.score, "S4 cue plan\n");
  assert.equal(pack.words.length, 4);
  assert.equal(pack.parts.length, 2);
});

test("a re-make's run folder carries the new picture and only its own part changes", () => {
  const dir = runFolder();
  const pack = packFromRun(dir, { filmId: ID, parts: 2 });
  const swaps = [{ shotId: "SC0001-2", pick: pack.shots[1].candidates.find((c) => c.id === "pixabay:image:7") }];
  const out = mkdtempSync(join(tmpdir(), "edit-pack-run-"));
  writeRunFromPack(pack, swaps, out);
  const media = JSON.parse(readFileSync(join(out, "media-C1.json"), "utf8"));
  assert.equal(media.shots[1].pick.id, "pixabay:image:7");
  assert.equal(media.shots[1].pick.licence.licenseId, "PIXABAY");
  assert.equal(media.shots[0].pick.id, "pexels:video:1", "the other shot is untouched");
  assert.ok(readFileSync(join(out, "s5-C1.md"), "utf8").includes("SHOTS:"));
  assert.equal(JSON.parse(readFileSync(join(out, "words.json"), "utf8")).words.length, 4);
  assert.equal(readFileSync(join(out, "s4.md"), "utf8"), "S4 cue plan\n");
  assert.equal(JSON.parse(readFileSync(join(out, "s3-chapters.json"), "utf8"))[0].id, "C1");
  const plan = changedParts(pack, swaps);
  assert.deepEqual(plan.changed, [2]);
  assert.deepEqual(plan.kept, [1]);
});
