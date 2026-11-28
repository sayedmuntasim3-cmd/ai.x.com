import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildTimeline } from "../engine/src/timeline.mjs";
import { OWN_MEDIA_LICENCE, OWN_MEDIA_MATCH_FLOOR, applyOwnPictures, ownPictureFolder } from "./own-pictures.mjs";
import { PLACEMENT_FILE, ownFilesIn, placeOwnFolder, placementFolder, planShots, readOwnPlacement } from "./own-place.mjs";
import { mediaDuration, renderFilm, run } from "./render-film.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

/** A unit vector that leans towards one axis: cos(a, b) is then easy to read. */
function vec(/** @type {Record<number, number>} */ parts) {
  const v = [0, 0, 0, 0];
  for (const [i, x] of Object.entries(parts)) v[Number(i)] = x;
  const len = Math.hypot(...v) || 1;
  return v.map((x) => x / len);
}

const PLAN = {
  shots: [
    { id: "SC0001-1", type: "live-video", rung: "R2", start: 0, end: 4, subject: "a street of shops" },
    { id: "SC0001-2", type: "photo-2.5D", rung: "R2", start: 4, end: 8, subject: "a man at a counter" },
    { id: "SC0001-3", type: "card", rung: "R1", start: 8, end: 10, subject: "a title card" },
    { id: "SC0002-1", type: "photo-designed", rung: "R2", start: 10, end: 14, subject: "a harbour at dawn" },
  ],
};

test("the picture shots of a plan carry the words heard over them; a designed card is left out", () => {
  const words = [
    { text: "this", start: 0.1, end: 0.4 },
    { text: "street", start: 0.5, end: 0.9 },
    { text: "of", start: 1.0, end: 1.2 },
    { text: "shops", start: 1.3, end: 1.8 },
    { text: "he", start: 11.0, end: 11.4 },
  ];
  const shots = planShots(PLAN, words);
  assert.deepEqual(shots.map((s) => s.id), ["SC0001-1", "SC0001-2", "SC0002-1"]);
  assert.match(shots[0].text, /this street of shops/);
  assert.equal(shots[1].text, "a man at a counter", "no words over it: the shot's own subject is used");
  assert.match(shots[2].text, /\bhe\b/, "the words over it are used, never the plan's subject");
  // No shot type at all (the plan's older shape) is still a picture shot; only an R1 card is not.
  assert.deepEqual(planShots({ shots: [{ id: "SC0003-1", start: 0, end: 2, subject: "x" }] }, []).map((s) => s.id), ["SC0003-1"]);
  assert.deepEqual(planShots(null, []), []);
});

test("the runner's own files are read in order; a file named after a shot is not one of them", () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-place-"));
  try {
    for (const f of ["own-2.mp4", "own-1.jpg", "SC0012-1.jpg", "notes.txt", "own-10.webp", "own-3.gif"]) writeFileSync(join(dir, f), "x");
    assert.deepEqual(ownFilesIn(dir).map((f) => [f.file, f.kind]), [["own-1.jpg", "image"], ["own-10.webp", "image"], ["own-2.mp4", "video"]]);
    assert.deepEqual(ownFilesIn(join(dir, "missing")), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("each own file is placed where its words fit, never twice in a row, and a below-floor match is not placed", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-place-"));
  try {
    for (const f of ["own-1.jpg", "own-2.mp4", "own-3.jpg"]) writeFileSync(join(dir, f), "x");
    // own-1 fits SC0001-1 best (and could sit on SC0001-2 too), own-2 fits SC0001-2, own-3 fits nothing.
    const images = {
      "own-1.jpg": vec({ 0: 1 }),
      "own-2.mp4": vec({ 1: 1 }),
      "own-3.jpg": vec({ 0: 0.12, 3: 1 }),
    };
    const texts = [vec({ 0: 1, 2: 0.05 }), vec({ 1: 1 }), vec({ 2: 1 })];
    const got = await placeOwnFolder({ dir, plan: PLAN, words: [], embed: async () => ({ images, texts, seconds: 0.1 }) });
    assert.deepEqual(got.placed.map((p) => [p.shotId, p.file]), [["SC0001-1", "own-1.jpg"], ["SC0001-2", "own-2.mp4"]]);
    const files = got.placed.map((p) => p.file);
    assert.equal(new Set(files).size, files.length, "the same file is never on two shots");
    assert.equal(got.placed.some((p) => p.score < OWN_MEDIA_MATCH_FLOOR), false, "nothing under the floor is placed");
    assert.ok(got.notes.some((n) => n.includes("own-3.jpg") && n.includes(String(OWN_MEDIA_MATCH_FLOOR))), "the file that fits nothing is said");
    // The decision is on disk, with the creator's licence on every entry.
    const journal = JSON.parse(readFileSync(join(dir, PLACEMENT_FILE), "utf8"));
    assert.deepEqual(journal.placed.map((/** @type {any} */ p) => [p.shotId, p.file, p.kind]), [["SC0001-1", "own-1.jpg", "image"], ["SC0001-2", "own-2.mp4", "video"]]);
    assert.deepEqual(readOwnPlacement(dir).map((p) => p.licence), [OWN_MEDIA_LICENCE, OWN_MEDIA_LICENCE]);
    // The render's own folder shape: the file path is resolved, the licence carried.
    const folder = placementFolder(dir);
    assert.deepEqual(Object.keys(folder.shots).sort(), ["SC0001-1", "SC0001-2"]);
    assert.equal(folder.shots["SC0001-2"].kind, "video");
    assert.equal(folder.shots["SC0001-2"].file, join(dir, "own-2.mp4"));
    assert.equal(folder.shots["SC0001-1"].licence, OWN_MEDIA_LICENCE);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("one own file that fits everything is used, but never on two shots in a row", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-place-"));
  try {
    writeFileSync(join(dir, "own-1.jpg"), "x");
    const plan = { shots: [1, 2, 3, 4].map((n) => ({ id: `SC0001-${n}`, type: "live-video", rung: "R2", start: (n - 1) * 3, end: n * 3, subject: "a lighthouse" })) };
    const got = await placeOwnFolder({ dir, plan, embed: async () => ({ images: { "own-1.jpg": vec({ 0: 1 }) }, texts: [vec({ 0: 0.9, 1: 0.4 }), vec({ 0: 0.9, 2: 0.4 }), vec({ 0: 0.9, 3: 0.4 }), vec({ 0: 0.9, 1: 0.4 })], seconds: 0 }) });
    // The file that fits is used; it is never put on two shots that sit next to each other.
    const ids = got.placed.map((p) => Number(p.shotId.slice(-1)));
    assert.ok(ids.length >= 1, "the file that fits is used");
    for (let i = 1; i < ids.length; i += 1) assert.notEqual(ids[i], ids[i - 1] + 1, `shots ${ids[i - 1]} and ${ids[i]} are neighbours and share one file`);
    assert.deepEqual(got.placed.map((p) => p.file), ids.map(() => "own-1.jpg"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the eyes failing, no words to match, or a missing file never stops a film; it is said plainly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-place-"));
  try {
    assert.deepEqual((await placeOwnFolder({ dir, plan: PLAN })).placed, [], "no files: nothing to do, no notes");
    writeFileSync(join(dir, "own-1.jpg"), "x");
    const blind = await placeOwnFolder({ dir, plan: PLAN, embed: async () => { throw new Error("torch is not installed"); } });
    assert.deepEqual(blind.placed, []);
    assert.ok(blind.notes.some((n) => n.includes("torch is not installed")), "the reason the files were not placed is said");
    const noWords = await placeOwnFolder({ dir, plan: { shots: [] }, embed: async () => ({ images: {}, texts: [], seconds: 0 }) });
    assert.deepEqual(noWords.placed, []);
    assert.ok(noWords.notes.some((n) => /name no words/.test(n)));
    // A placement that names a file which is gone is caught when the film is rendered.
    writeFileSync(join(dir, PLACEMENT_FILE), JSON.stringify({ placed: [{ shotId: "SC0001-1", file: "own-9.jpg", kind: "image" }] }));
    const gone = placementFolder(dir);
    assert.deepEqual(gone.shots, {});
    assert.ok(gone.notes.some((n) => n.includes("own-9.jpg")), "a missing file is named, never silently used");
    writeFileSync(join(dir, PLACEMENT_FILE), "not json");
    assert.deepEqual(readOwnPlacement(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const MD = [1, 2].map((n) => `**SC000${n}** | 0:00:0${(n - 1) * 2}-0:00:0${n * 2} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card "CARD ${n}" | FX: FX-COUNTER | LOOK: L`).join("\n");

test("a voice film's own media is applied through the usual --pictures path and its rights are the creator's", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-place-"));
  try {
    const pictures = join(dir, "own");
    mkdirSync(pictures);
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x20a040:s=480x270", "-frames:v", "1", join(pictures, "own-1.png")]);
    writeFileSync(join(pictures, PLACEMENT_FILE), JSON.stringify({ placed: [{ shotId: "SC0001-1", file: "own-1.png", kind: "image", score: 0.31 }] }));
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: MD }], width: 320, height: 180, fps: 10 });
    const placed = placementFolder(pictures);
    const own = applyOwnPictures(timeline, { ...ownPictureFolder(pictures), shots: { ...placed.shots, ...ownPictureFolder(pictures).shots } });
    assert.deepEqual(own.applied, ["SC0001-1"], "the creator's file replaced the card it was placed on");
    assert.deepEqual(own.ownMedia, ["SC0001-1"]);
    assert.equal(timeline.video[0].licence, OWN_MEDIA_LICENCE);
    const out = join(dir, "film.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out });
    assert.ok(Math.abs((await mediaDuration(out)) - 4) < 0.2);
    assert.ok(report.licences.some((l) => l.licence === "Your own media, creator confirmed rights"), "the rights report says the creator's own media");
    assert.ok(timeline.notes.some((n) => n.includes("Your own media, creator confirmed rights")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
