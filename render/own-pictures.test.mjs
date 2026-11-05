import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildTimeline } from "../engine/src/timeline.mjs";
import { applyOwnPictures, OWNER_LICENCE, ownPictureFolder } from "./own-pictures.mjs";
import { mediaDuration, renderFilm, run } from "./render-film.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const MD = [1, 2, 3].map((n) => `**SC000${n}** | 0:00:0${(n - 1) * 2}-0:00:0${n * 2} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card "CARD ${n}" | FX: FX-COUNTER | LOOK: L`).join("\n");

test("own pictures are found by shot id; other files are listed, never guessed", () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-"));
  try {
    for (const f of ["SC0002-1.jpg", "SC0002-1.png", "sc0003.MP4", "notes.txt", "SC0004-x.jpg", ".DS_Store"]) writeFileSync(join(dir, f), "x");
    const found = ownPictureFolder(dir);
    assert.deepEqual(Object.fromEntries(Object.entries(found.shots).map(([k, v]) => [k, v.kind])), { "SC0002-1": "image", "SC0003-1": "video" });
    assert.deepEqual(found.ignored.sort(), ["SC0002-1.png", "SC0004-x.jpg", "notes.txt"]);
    assert.deepEqual(ownPictureFolder(join(dir, "missing")).shots, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an owner's photo and clip replace their shots; the report says provided by the owner; a new file is rendered again", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-own-"));
  try {
    const pics = join(dir, "pictures");
    mkdirSync(pics);
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0xd02020:s=480x270", "-frames:v", "1", join(pics, "SC0002-1.png")]);
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x2040d0:s=320x180:r=10:d=3", "-pix_fmt", "yuv420p", join(pics, "SC0003.mp4")]);
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=white:s=64x64", "-frames:v", "1", join(pics, "SC0099-1.png")]);
    const make = () => {
      const t = buildTimeline({ chapters: [{ id: "C1", markdown: MD }], width: 320, height: 180, fps: 10 });
      return { t, own: applyOwnPictures(t, ownPictureFolder(pics)) };
    };
    const { t, own } = make();
    assert.deepEqual(own.applied, ["SC0002-1", "SC0003-1"]);
    assert.deepEqual(own.unknown, ["SC0099-1"]);
    assert.equal(t.video[1].still, true, "a photo moves like an archive still");
    assert.equal(t.video[1].counter, undefined, "the card it replaces is gone");
    assert.equal(t.video[2].still, false);
    assert.equal(t.stats.clips, 2);
    assert.ok(t.notes.some((n) => n.includes("provided by the owner")) && t.notes.some((n) => n.includes("SC0099-1")));

    const out = join(dir, "t.mp4");
    const report = await renderFilm({ timeline: t, workDir: join(dir, "w"), outFile: out });
    assert.ok(Math.abs((await mediaDuration(out)) - 6) < 0.15);
    assert.deepEqual(report.licences.map((l) => l.licence), [OWNER_LICENCE, OWNER_LICENCE]);
    const pixel = (/** @type {number} */ s) => [...spawnSync("ffmpeg", ["-v", "error", "-ss", String(s), "-i", out, "-vf", "crop=8:8:156:86", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout.subarray(0, 3)];
    const [r2, , b2] = pixel(3);
    assert.ok(r2 > 120 && r2 > b2 + 60, `the owner's red photo is on screen at 0:03 (${pixel(3)})`);
    const [r3, , b3] = pixel(5);
    assert.ok(b3 > 110 && b3 > r3 + 50, `the owner's blue clip at 0:05 (${pixel(5)})`);

    // The same name with a new picture is drawn again; the other shots come from the cache.
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=0x20c040:s=480x270", "-frames:v", "1", join(pics, "SC0002-1.png")]);
    const again = await renderFilm({ timeline: make().t, workDir: join(dir, "w"), outFile: join(dir, "t2.mp4") });
    assert.equal(again.stats.segmentsRendered, 1);
    assert.equal(again.stats.segmentsCached, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
