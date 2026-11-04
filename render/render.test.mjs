import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildTimeline } from "../engine/src/timeline.mjs";
import { mediaDuration, renderFilm, run } from "./render-film.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

test("a film renders to MP4 with picture, voice in its slots, captions and a report, and re-renders from cache", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-render-"));
  try {
    // Two-second stock clips stand in for downloads; the 4-second shot loops its clip.
    const clip = join(dir, "clip.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=640x360:r=25:d=2", "-pix_fmt", "yuv420p", clip]);
    const voice1 = join(dir, "SC0001.wav");
    const voice2 = join(dir, "SC0002.wav");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=440:d=2", voice1]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=330:d=6", voice2]);
    const m01 = join(dir, "M01.wav");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=220:d=3", m01]);
    const md = [
      `**SC0001** | 0:00:00-0:00:04 | C1 | b | E | C01 | NARR: The mill opens at dawn. | W 5/5 | ANCHOR: x | SHOTS: (1) 0:00:00-0:00:04 R3 mill | MOTION: 1.05x push | MUS: M01 in at 0:00:00 | LOOK: L`,
      `**SC0002** | 0:00:04-0:00:08 | C1 | b | E | C01 | NARR: By noon the wheel has stopped for good. | W 8/8 | ANCHOR: x | SHOTS: (1) R3 river; (2) R1 card "1887" | OST: "THE LAST DAY" | MUS: M01 | LOOK: L`,
      `**SC0003** | 0:00:08-0:00:10 | C1 | b | E | — | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 cut to black | MUS: M01 drops out with the black | LOOK: L`,
    ].join("\n");
    const pick = (/** @type {string} */ scene) => ({ scene, shot: 1, start: 0, end: 4, rung: "R3", description: "", queries: ["q"], status: "found", query: "q", alternates: [], trace: [], pick: { id: scene, source: "pexels", mediaUrl: "https://videos.example/" + scene + ".mp4", previewUrl: null, sourcePageUrl: "https://www.pexels.com/video/" + scene, creator: null, durationSeconds: 2, width: 640, height: 360, licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: "" } } });
    const media = { chapter: "C1", providers: ["pexels"], repeatWindowSeconds: 600, stats: { shots: 2, found: 2, missing: 0, noQuery: 0 }, shots: [pick("SC0001"), pick("SC0002")] };
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md, media: /** @type {any} */ (media) }], width: 320, height: 180, fps: 15 });
    const out = join(dir, "out", "film.mp4");
    /** @type {string[]} */
    const fetched = [];
    const options = { timeline, workDir: join(dir, "work"), outFile: out, voice: { SC0001: voice1, SC0002: voice2 }, music: { M01: m01 }, fetchClip: async (/** @type {string} */ url) => { fetched.push(url); return clip; }, concurrency: 2 };
    const report = await renderFilm(options);

    assert.ok(Math.abs((await mediaDuration(out)) - 10) < 0.1, "the film is exactly as long as the timeline");
    const streams = (await run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "csv=p=0", out])).trim().split("\n").sort();
    assert.deepEqual(streams, ["audio", "video,320,180"]);
    assert.equal(report.stats.segmentsRendered, 4, "clip, clip, card, black");
    assert.equal(report.voicedScenes, 2);
    assert.ok(report.warnings.some((w) => w.startsWith("SC0002: voice is 6.0 s for a 4.0 s scene")), report.warnings.join("\n"));
    assert.equal(report.licences.length, 2);
    assert.deepEqual(report.musicCues, { scripted: 1, played: 1 });
    assert.deepEqual(timeline.music, [{ cue: "M01", start: 0, end: 8 }], "one cue across two scenes, silent with the black");
    const level = async (/** @type {number} */ from, /** @type {number} */ to) => Number(/mean_volume: (-?[\d.]+) dB/.exec(await new Promise((ok) => { const p = spawnSync("ffmpeg", ["-v", "info", "-ss", String(from), "-t", String(to - from), "-i", out, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" }); ok(p.stderr); }))?.[1] ?? -99);
    const musicOnly = await level(2.5, 3.5);
    const silent = await level(8.6, 9.6);
    assert.ok(musicOnly > -40, `music plays where nobody speaks (${musicOnly} dB)`);
    assert.ok(silent < -60, `the black is silent (${silent} dB)`);
    assert.match(readFileSync(join(dir, "out", "film.srt"), "utf8"), /^1\n00:00:00,000 --> 00:00:04,000\nThe mill opens at dawn\.\n/);
    assert.ok(existsSync(join(dir, "out", "film.report.json")));

    const again = await renderFilm(options);
    assert.equal(again.stats.segmentsRendered, 0, "a second render reuses every segment");
    assert.equal(again.stats.audioRendered, 0);
    assert.equal(readdirSync(join(dir, "work", "segments")).length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
