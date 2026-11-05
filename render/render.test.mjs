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
    const amb = join(dir, "SND-AMB-01.wav");
    const hit = join(dir, "SND-FX-05.wav");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "anoisesrc=d=1:a=0.3", amb]);
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=f=1200:d=0.2", hit]);
    const md = [
      `**SC0001** | 0:00:00-0:00:04 | C1 | b | E | C01 | NARR: The mill opens at dawn. | W 5/5 | ANCHOR: x | SHOTS: (1) 0:00:00-0:00:04 R3 mill | MOTION: 1.05x push | MUS: M01 in at 0:00:00 | LOOK: L`,
      `**SC0002** | 0:00:04-0:00:08 | C1 | b | E | C01 | NARR: By noon the wheel has stopped for good. | W 8/8 | ANCHOR: x | SHOTS: (1) R3 river; (2) R1 card "1887" | OST: "THE LAST DAY" | MUS: M01 | LOOK: L`,
      `**SC0003** | 0:00:08-0:00:10 | C1 | b | E | — | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 cut to black | MUS: M01 drops out with the black | SFX: SND-AMB-01 room tone; SND-FX-05 snip on cut 1; SND-FX-99 missing | LOOK: L`,
    ].join("\n");
    const pick = (/** @type {string} */ scene) => ({ scene, shot: 1, start: 0, end: 4, rung: "R3", description: "", queries: ["q"], status: "found", query: "q", alternates: [], trace: [], pick: { id: scene, source: "pexels", mediaUrl: "https://videos.example/" + scene + ".mp4", previewUrl: null, sourcePageUrl: "https://www.pexels.com/video/" + scene, creator: null, durationSeconds: 2, width: 640, height: 360, licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: "" } } });
    const media = { chapter: "C1", providers: ["pexels"], repeatWindowSeconds: 600, stats: { shots: 2, found: 2, missing: 0, noQuery: 0 }, shots: [pick("SC0001"), pick("SC0002")] };
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md, media: /** @type {any} */ (media) }], width: 320, height: 180, fps: 15 });
    const out = join(dir, "out", "film.mp4");
    /** @type {string[]} */
    const fetched = [];
    const options = { timeline, workDir: join(dir, "work"), outFile: out, voice: { SC0001: voice1, SC0002: voice2 }, music: { M01: m01 }, sfx: { "SND-AMB-01": amb, "SND-FX-05": hit }, fetchClip: async (/** @type {string} */ url) => { fetched.push(url); return clip; }, concurrency: 2 };
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
    assert.ok(silent > -60 && silent < -25, `the black now holds only the scripted room tone and snip, quietly (${silent} dB)`);
    assert.deepEqual(report.soundEffects, { scripted: 3, played: 2 });
    assert.ok(report.warnings.some((w) => w.includes("SND-FX-99")), "a missing effect is reported");
    assert.deepEqual(timeline.sfx.map((e) => [e.token, e.kind, e.start]), [["SND-AMB-01", "bed", 8], ["SND-FX-05", "hit", 8], ["SND-FX-99", "hit", 8]]);
    assert.match(readFileSync(join(dir, "out", "film.srt"), "utf8"), /^1\n00:00:00,000 --> 00:00:04,000\nThe mill opens at dawn\.\n/);
    assert.ok(existsSync(join(dir, "out", "film.report.json")));
    assert.ok(report.master && report.master.integratedLufs !== null && report.master.truePeakDbtp !== null, "the master's loudness is measured, not assumed");
    assert.ok(Math.abs(/** @type {number} */ (report.master.integratedLufs) + 14) <= 1, `the master is -14 LUFS within 1 LU (${report.master.integratedLufs})`);
    assert.ok(/** @type {number} */ (report.master.truePeakDbtp) <= -1, `true peak at or below -1 dBTP (${report.master.truePeakDbtp})`);
    assert.equal(report.master.black.length, 1, "the scripted black is measured");
    assert.ok(!report.warnings.some((w) => w.startsWith("Black picture")), "scripted black is not a defect");

    const again = await renderFilm(options);
    assert.equal(again.stats.segmentsRendered, 0, "a second render reuses every segment");
    assert.equal(again.stats.audioRendered, 0);
    assert.equal(readdirSync(join(dir, "work", "segments")).length, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("run files are read from the film API the same way as from a folder", async () => {
  const { createServer } = await import("node:http");
  const { loadRunFiles } = await import("./render-film.mjs");
  const usa = new URL("../productions/ramesh-babu/USA/", import.meta.url);
  const id = "11111111-2222-3333-4444-555555555555";
  /** @type {string[]} */
  const asked = [];
  const server = createServer((req, res) => {
    asked.push(String(req.url));
    const m = new RegExp(`^/api/films/${id}/files/([a-z0-9.-]+)$`, "i").exec(String(req.url));
    const file = m ? new URL(m[1], usa) : null;
    if (!file || !existsSync(file)) { res.writeHead(404).end("{}"); return; }
    res.writeHead(200).end(readFileSync(file));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(null)));
  try {
    const port = /** @type {import("node:net").AddressInfo} */ (server.address()).port;
    const fromApi = await loadRunFiles({ api: `http://127.0.0.1:${port}`, id });
    const fromDir = await loadRunFiles({ dir: new URL(".", usa).pathname });
    assert.equal(fromApi.length, 6);
    assert.deepEqual(fromApi, fromDir);
    assert.ok(asked.includes(`/api/films/${id}/files/media-C1.json`), "footage picks are asked for too");
  } finally {
    server.close();
  }
});

test("the three S7 thumbnail briefs become 1280×720 JPEGs from the named scene's clip", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const { renderThumbnails, thumbnailBriefs } = await import("./thumbnails.mjs");
  const briefs = thumbnailBriefs(readFileSync(new URL("../productions/ramesh-babu/USA/s7.md", import.meta.url), "utf8"));
  assert.deepEqual(briefs.map((b) => [b.id, b.words, b.scenes]), [["TH-A", "HE KEPT THIS", ["SC0227"]], ["TH-B", "PLUS TAX", ["SC0204"]], ["TH-C", "1 DAY =", ["SC0221", "SC0225"]]]);
  const dir = mkdtempSync(join(tmpdir(), "zupona-thumb-"));
  try {
    const clip = join(dir, "clip.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=1920x1080:r=25:d=3", "-pix_fmt", "yuv420p", clip]);
    const seg = (/** @type {string} */ scene, /** @type {string} */ url) => ({ id: scene + "-1", scene, shot: 1, start: 0, end: 4, frames: 120, type: "clip", url, sourcePageUrl: null, licence: null, motion: "none", text: "", title: "", chip: "", brief: "" });
    const timeline = /** @type {any} */ ({ video: [seg("SC0001", "https://v/1"), seg("SC0227", "https://v/227"), seg("SC0300", "https://v/300")] });
    /** @type {string[]} */
    const fetched = [];
    const thumbs = await renderThumbnails({ briefs, timeline, fetchClip: async (url) => { fetched.push(url); return clip; }, outBase: join(dir, "film"), font: ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => existsSync(f)) });
    assert.equal(thumbs[0].frameFrom, "SC0227", "TH-A uses the scene it names");
    assert.equal(new Set(thumbs.map((t) => t.frameFrom)).size, 3, "each thumbnail uses a different clip");
    for (const t of thumbs) {
      assert.ok(t.bytes > 10000 && t.bytes < 2 * 1024 * 1024, `${t.id} is under YouTube's 2 MB limit`);
      assert.equal((await run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", t.file])).trim(), "1280,720");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the S7 Shorts and Facebook cut are read and cut vertical with hook and captions", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const { cutBriefs, captionsFor, renderCuts } = await import("./cuts.mjs");
  const briefs = cutBriefs(readFileSync(new URL("../productions/ramesh-babu/USA/s7.md", import.meta.url), "utf8"));
  assert.deepEqual(briefs.map((b) => [b.id, b.start, b.end, `${b.width}x${b.height}`]), [["SH-01", 0, 58, "1080x1920"], ["SH-02", 2230, 2270, "1080x1920"], ["SH-03", 225, 275, "1080x1920"], ["FB-01", 2150, 2240, "1080x1350"]]);
  assert.equal(briefs[0].hook, "He bought a Rolls-Royce. He still cuts hair.");
  assert.deepEqual(captionsFor([{ start: 0, end: 2, text: "a" }, { start: 2, end: 5, text: "b" }, { start: 9, end: 10, text: "c" }], 3, 8), [{ start: 0, end: 2, text: "b" }]);
  const dir = mkdtempSync(join(tmpdir(), "zupona-cuts-"));
  try {
    const film = join(dir, "film.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30:d=6", "-f", "lavfi", "-i", "sine=d=6", "-shortest", "-pix_fmt", "yuv420p", "-c:a", "aac", film]);
    const cuts = await renderCuts({ film, briefs: [{ ...briefs[0], start: 1, end: 4 }, { ...briefs[3], start: 2, end: 5 }], captions: [{ start: 0, end: 6, text: "Its buyer cuts hair." }], outBase: join(dir, "film"), font: ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => existsSync(f)) });
    for (const [c, size] of [[cuts[0], "1080,1920"], [cuts[1], "1080,1350"]]) {
      assert.equal((await run("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", c.file])).trim(), size);
      assert.ok(Math.abs((await mediaDuration(c.file)) - 3) < 0.15, `${c.id} is the brief's length`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("counter cards run up to quantities, never to years, ranges or decimals", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const { counterParts } = await import("./render-film.mjs");
  assert.deepEqual(counterParts("$20,000 a year"), { before: "$", value: 20000, after: " a year" });
  assert.deepEqual(counterParts("400 cars"), { before: "", value: 400, after: " cars" });
  for (const t of ["Year 2011", "500–750 haircuts", "1.5 million", "no number", "50% off"].slice(0, 4)) assert.equal(counterParts(t), null, t);
  assert.deepEqual(counterParts("50% more"), { before: "", value: 50, after: "%% more" }, "a literal % is escaped for drawtext");
  const md = `**SC0001** | 0:00:00-0:00:03 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card | FX: FX-COUNTER | OST: "$20,000 a year" | LOOK: L`;
  const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md }], width: 320, height: 180, fps: 10 });
  assert.equal(timeline.video[0].counter, true);
  const dir = mkdtempSync(join(tmpdir(), "zupona-counter-"));
  try {
    const out = join(dir, "c.mp4");
    await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out });
    assert.ok(Math.abs((await mediaDuration(out)) - 3) < 0.15);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the cinematic look frames every shot 2.39:1 with black bars; the documentary look has none", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-look-"));
  try {
    const clip = join(dir, "clip.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=white:s=640x360:r=10:d=3", "-pix_fmt", "yuv420p", clip]);
    const md = `**SC0001** | 0:00:00-0:00:02 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R3 street | LOOK: L`;
    const media = { shots: [{ scene: "SC0001", shot: 1, status: "found", pick: { mediaUrl: "https://v/1", sourcePageUrl: "p", durationSeconds: 3, licence: { name: "Pexels License" } } }] };
    /** @param {string} look */
    const topBand = async (look) => {
      const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md, media: /** @type {any} */ (media) }], width: 320, height: 180, fps: 10, look: /** @type {any} */ (look) });
      const out = join(dir, `${look}.mp4`);
      await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out, fetchClip: async () => clip });
      const p = spawnSync("ffmpeg", ["-v", "info", "-ss", "1", "-i", out, "-frames:v", "1", "-vf", "crop=iw:8:0:0,signalstats,metadata=print:key=lavfi.signalstats.YAVG", "-f", "null", "-"], { encoding: "utf8" });
      return Number(/YAVG=([\d.]+)/.exec(p.stderr)?.[1] ?? -1);
    };
    const cinematic = await topBand("cinematic");
    const documentary = await topBand("documentary");
    assert.ok(cinematic >= 0 && cinematic < 25, `the top band is black in the cinematic look (${cinematic})`);
    assert.ok(documentary > 150, `the picture reaches the top in the documentary look (${documentary})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Shorts captions light up the word being spoken (ASS), shifted to the cut's own clock", async () => {
  const { captionsFor, toAss } = await import("./cuts.mjs");
  const captions = [{ start: 9, end: 12, text: "He still cuts hair.", words: [{ text: "He", start: 9, end: 9.3 }, { text: "still", start: 9.4, end: 9.9 }, { text: "cuts", start: 10, end: 10.5 }, { text: "hair.", start: 10.6, end: 11.2 }] }];
  const own = captionsFor(captions, 8, 11);
  assert.deepEqual(own[0].words?.map((w) => [w.text, w.start]), [["He", 1], ["still", 1.4], ["cuts", 2], ["hair.", 2.6]]);
  assert.equal(own[0].end, 3, "the line is cut at the end of the Short");
  const ass = toAss(own, { width: 1080, height: 1920 });
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  assert.match(ass, /Dialogue: 0,0:00:01\.40,0:00:02\.00,Cap,,0,0,0,,He \{\\c&H0000D7FF&\}still\{\\c&H00FFFFFF&\} cuts hair\./);
  assert.equal((ass.match(/^Dialogue:/gm) ?? []).length, 4, "one event per word");
  assert.doesNotMatch(toAss([{ start: 0, end: 1, text: "a {\\b1}b" }], { width: 1080, height: 1920 }), /\{\\b1\}/, "override codes in the text are neutralised");
});

test("an archive photograph moves like footage: framed over its own blur, pushed, pulled or panned", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-still-"));
  try {
    const photo = join(dir, "portrait.jpg");
    // A tall picture with detail, so a move shows up between the first and last frame.
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=600x900:d=1", "-frames:v", "1", photo]);
    const md = "**SC0001** | 0:00:00-0:00:03 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R2 the launch pad, 1969 | SRC: Commons · Q1 \"launch pad\" | LOOK: L";
    const media = { chapter: "C1", shots: [{ scene: "SC0001", shot: 1, status: "found", pick: { id: "wikimedia:1", source: "wikimedia", kind: "image", mediaUrl: "https://upload.wikimedia.org/x/1920px-pad.jpg", sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Pad.jpg", durationSeconds: null, licence: { licenseId: "PUBLIC-DOMAIN", name: "Commons public-domain file" } } }] };
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md, media }], width: 320, height: 180, fps: 10 });
    assert.equal(timeline.video[0].still, true);
    assert.equal(timeline.video[0].motion, "push");
    const out = join(dir, "still.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out, fetchClip: async () => photo });
    assert.equal(report.stats.clipsFailed, 0);
    assert.ok(Math.abs((await mediaDuration(out)) - 3) < 0.15);
    const frameAt = (/** @type {number} */ s) => spawnSync("ffmpeg", ["-v", "error", "-ss", String(s), "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout;
    const first = frameAt(0.1);
    const last = frameAt(2.8);
    let diff = 0;
    for (let k = 0; k < first.length; k += 1) diff += Math.abs(first[k] - last[k]);
    assert.ok(first.length > 0 && diff / first.length > 2, `the picture moves (${(diff / first.length).toFixed(1)})`);
    assert.ok(!report.warnings.some((w) => w.startsWith("Black picture")), report.warnings.join("\n"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("kinetic type rises in line by line; a landscape photo keeps the Ken Burns move", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-kinetic-"));
  try {
    const wide = join(dir, "wide.jpg");
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=1200x700:d=1", "-frames:v", "1", wide]);
    const md = [
      "**SC0001** | 0:00:00-0:00:03 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 kinetic card \"THE TAX AFTER IT NEARLY BROKE HIM, HE SAID\" | FX: FX-KINETIC | LOOK: L",
      "**SC0002** | 0:00:03-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R2 the harbour, 1920 | SRC: Commons · Q1 \"harbour 1920\" | LOOK: L",
    ].join("\n");
    const media = { chapter: "C1", shots: [{ scene: "SC0002", shot: 1, status: "found", pick: { id: "w:2", source: "wikimedia", kind: "image", mediaUrl: "https://upload.wikimedia.org/x/harbour.jpg", sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Harbour.jpg", durationSeconds: null, licence: { licenseId: "PUBLIC-DOMAIN", name: "PD" } } }] };
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md, media }], width: 320, height: 180, fps: 10 });
    assert.equal(timeline.video[0].kinetic, true);
    const out = join(dir, "k.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out, fetchClip: async () => wide });
    assert.equal(report.stats.clipsFailed, 0, report.warnings.join("\n"));
    const bright = (/** @type {number} */ s) => { const f = spawnSync("ffmpeg", ["-v", "error", "-ss", String(s), "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout; let n = 0; for (const b of f) if (b > 160) n += 1; return n; };
    const early = bright(0.2);
    const late = bright(1.8);
    assert.ok(late > early * 1.4, `more lines are on screen later (${early} -> ${late})`);
    const frameAt = (/** @type {number} */ s) => spawnSync("ffmpeg", ["-v", "error", "-ss", String(s), "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout;
    const a = frameAt(3.2);
    const b = frameAt(5.8);
    let diff = 0;
    for (let k = 0; k < a.length; k += 1) diff += Math.abs(a[k] - b[k]);
    assert.ok(diff / a.length > 2, "the landscape photo moves");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a whip pan moves from the last frame of the shot before; the film keeps its exact length", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-whip-"));
  try {
    const md = [
      "**SC0001** | 0:00:00-0:00:02 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card \"BEFORE\" | LOOK: L",
      "**SC0002** | 0:00:02-0:00:04 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card \"AFTER\" | TRANS: whip pan | LOOK: L",
      "**SC0003** | 0:00:04-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 card \"FLASH\" | TRANS: white flash | LOOK: L",
    ].join("\n");
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md }], width: 320, height: 180, fps: 10 });
    const out = join(dir, "t.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out });
    assert.equal(report.stats.transitions, 1);
    assert.ok(Math.abs((await mediaDuration(out)) - 6) < 0.15, "a transition never shifts the clock");
    const mean = (/** @type {number} */ s) => { const f = spawnSync("ffmpeg", ["-v", "error", "-ss", String(s), "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]).stdout; let n = 0; for (const b of f) n += b; return n / f.length; };
    assert.ok(mean(4.02) > 120, `the flash starts white (${mean(4.02).toFixed(0)})`);
    assert.ok(mean(5) < 60, "and settles into the card");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a thumbnail can come from an archive photograph (one frame, nothing to seek into)", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const { renderThumbnails } = await import("./thumbnails.mjs");
  const dir = mkdtempSync(join(tmpdir(), "zupona-thumb-"));
  try {
    const photo = join(dir, "p.jpg");
    await run("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=900x1200:d=1", "-frames:v", "1", photo]);
    const timeline = /** @type {any} */ ({ video: [{ id: "SC0001-1", scene: "SC0001", type: "clip", url: "https://upload.wikimedia.org/x.jpg", still: true, start: 0, end: 4 }] });
    const font = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"].find((f) => existsSync(f));
    const made = await renderThumbnails({ briefs: [{ id: "TH-A", words: "He bought a Rolls-Royce with $50", image: "SC0001", scenes: ["SC0001"] }], timeline, fetchClip: async () => photo, outBase: join(dir, "film"), workDir: dir, font });
    assert.equal(made[0].frameFrom, "SC0001");
    assert.ok(made[0].bytes > 10_000 && made[0].bytes < 2_000_000, `a real JPEG under YouTube's 2 MB (${made[0].bytes})`);
    const size = (await run("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", made[0].file])).trim();
    assert.equal(size, "1280,720");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("maps: Natural Earth shapes decode, a place finds its country, and a map shot renders with its pin at the centre", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const { countries, countryAt, mapSvg } = await import("./maps.mjs");
  assert.ok(countries().length > 200);
  assert.equal(countryAt(77.59, 12.97)?.name, "India");
  assert.equal(countryAt(31.23, 30.04)?.name, "Egypt");
  assert.equal(countryAt(-98, 39)?.name, "United States of America");
  assert.equal(countryAt(-30, 0), null, "the open Atlantic is no country");
  const svg = mapSvg({ lat: 12.97, lon: 77.59, width: 640, height: 360 });
  assert.match(svg, /stroke="#bef264"/, "the place's country is lit");
  const dir = mkdtempSync(join(tmpdir(), "zupona-map-"));
  try {
    const md = "**SC0001** | 0:00:00-0:00:03 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 FX-MAP Bengaluru (12.97, 77.59) | LOOK: L";
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md }], width: 320, height: 180, fps: 10 });
    const out = join(dir, "map.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out });
    assert.ok(!report.warnings.some((w) => /map could not/.test(w)), report.warnings.join("\n"));
    assert.ok(Math.abs((await mediaDuration(out)) - 3) < 0.15);
    const rgb = spawnSync("ffmpeg", ["-v", "error", "-ss", "1.5", "-i", out, "-frames:v", "1", "-vf", "crop=4:4:158:88", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout;
    const g = rgb[1];
    assert.ok(g > 150 && g > rgb[2] + 40, `the pin (lime) sits at the centre (rgb ${rgb[0]},${rgb[1]},${rgb[2]})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a route map draws its line from the first place to the second over time", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-route-"));
  try {
    const md = "**SC0001** | 0:00:00-0:00:04 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 FX-MAP route Mumbai (19.07, 72.88) to London (51.51, -0.13) | LOOK: L";
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: md }], width: 320, height: 180, fps: 10 });
    assert.deepEqual(timeline.video[0].map?.to, { lat: 51.51, lon: -0.13, label: "London" });
    const out = join(dir, "route.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out });
    assert.ok(!report.warnings.some((w) => /could not be drawn/.test(w)), report.warnings.join("\n"));
    assert.ok(Math.abs((await mediaDuration(out)) - 4) < 0.15);
    const lit = (/** @type {number} */ s) => { const f = spawnSync("ffmpeg", ["-v", "error", "-ss", String(s), "-i", out, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]).stdout; let n = 0; for (let k = 0; k < f.length; k += 3) if (f[k + 1] > 180 && f[k] > 150) n += 1; return n; };
    assert.ok(lit(3.6) > lit(0.15) + 40, `the line is longer later (${lit(0.15)} -> ${lit(3.6)})`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
