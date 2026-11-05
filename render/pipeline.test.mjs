// The whole product with fakes, end to end: a topic goes in, the film run
// writes every stage (scripted model), the media step picks licensed clips
// (fake Pexels), the film page renders, and the renderer turns the run's own
// files into a real MP4 with captions, thumbnails and a Short. Each part has
// its own tests; this one checks that they fit together.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadFilmPage, renderFilmPage } from "../engine/src/film-page.mjs";
import { newFilm, runFilm } from "../engine/src/film-run.mjs";
import { buildTimeline } from "../engine/src/timeline.mjs";
import { cutBriefs, renderCuts } from "./cuts.mjs";
import { loadRunFiles, loadRunText, mediaDuration, renderFilm, run } from "./render-film.mjs";
import { renderThumbnails, thumbnailBriefs } from "./thumbnails.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const WORDS = "the river runs past the old mill while the town wakes slowly under a grey sky and the bells ring out across the square".split(" ");

/** One compact scene line, 10 s, 25 words, one stock shot and one graphics shot. @param {number} n */
function scene(n) {
  const t = (/** @type {number} */ s) => `0:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const start = (n - 1) * 10;
  return `**SC${String(n).padStart(4, "0")}** | ${t(start)}-${t(start + 10)} | C${n <= 6 ? 1 : 2} | beat | E | C01 | NARR: ${[`Mill${n}`, ...WORDS].slice(0, 25).join(" ")}. | W 25/25 | ANCHOR: "river" -> mill | SHOTS: (1) R3 old mill wheel; (2) R1 card | EV: R1 1 / R3 1 | FX: FX-KINETIC, FX-SOURCECHIP | SRC: Pexels · Q1 "old mill" | OST: "THE MILL · 1887"; chip "C01 · example.org" | MUS: M01 | SFX: SND-AMB-01 room tone | LOOK: LOOK-M`;
}

function fakeModel() {
  const reply = (/** @type {string} */ text) => ({ text, stopReason: "end_turn", usage: { input_tokens: 1000, output_tokens: 500 } });
  return {
    name: "claude-opus-5-5",
    async call(/** @type {any} */ r) {
      const stage = String(r.stage);
      if (stage === "research") return reply("```json\n" + JSON.stringify({ subject: "mill", facts: Array.from({ length: 9 }, (_, i) => ({ id: `F0${i}`, claim: "c", value: "v", sources: ["https://example.org/" + i], confidence: "high", conflict: null })), unknowns: [], doNotConfuse: [] }) + "\n```");
      if (stage === "s3") return reply("## S3\n```json\n" + JSON.stringify([
        { id: "C1", title: "A", start: "0:00:00", end: "0:01:00", firstScene: "SC0001", lastScene: "SC0006", brief: "b" },
        { id: "C2", title: "B", start: "0:01:00", end: "0:02:00", firstScene: "SC0007", lastScene: "SC0012", brief: "b" },
      ]) + "\n```");
      if (stage === "s5:C1") return reply("# C1\n" + [1, 2, 3, 4, 5, 6].map(scene).join("\n"));
      if (stage === "s5:C2") return reply("# C2\n" + [7, 8, 9, 10, 11, 12].map(scene).join("\n"));
      if (stage === "qa") return reply("```json\n" + JSON.stringify({ mustFix: [], passed: ["all"], notChecked: [] }) + "\n```");
      if (stage === "edit:C1") return reply("```json\n" + JSON.stringify({ scenes: [{ scene: "SC0003", transition: "whip", punchIns: ["0:00:22.0"], hits: [{ at: "0:00:27.0", sound: "impact" }] }] }) + "\n```");
      if (stage === "viewer") return reply("```json\n" + JSON.stringify({ stayScore: 8, why: "a clear stake", leaves: [], kept: ["the wheel"], fixes: [] }) + "\n```");
      if (stage === "edit:C2") return reply("```json\n" + JSON.stringify({ scenes: [] }) + "\n```");
      if (stage === "s7") return reply([
        "**Final title (A): The Last Day of the Old Mill**",
        "| ID | Pairs with | Image | Words | Source |", "|---|---|---|---|---|",
        "| TH-A | Title A | the wheel | LAST DAY | the SC0003 clip |",
        "| ID | Format | Source times (final film) | Own hook | Ends on |", "|---|---|---|---|---|",
        "| SH-01 | 9:16 Short, about 20 s | 0:00:10–0:00:30 (SC0002–SC0003) | \"The wheel stopped at noon.\" | card |",
      ].join("\n"));
      return reply(`## ${stage}\nok`);
    },
  };
}

test("topic in, MP4 out: run, footage, page, timeline, render, thumbnail and Short fit together", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-e2e-"));
  try {
    // 1. The run, with a fake stock provider and a channel.
    const made = newFilm({ topic: "The last day of the old mill", minutes: 2 }, "e2e");
    assert.ok(made.ok);
    /** @type {Map<string, string>} */
    const files = new Map();
    const store = { get: async (/** @type {string} */ k) => files.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { files.set(k, v); } };
    let n = 0;
    /** @type {import("../engine/src/film-media.mjs").MediaProvider} */
    const pexels = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
      return [0, 1].map(() => { n += 1; return { id: `pexels:video:${n}`, source: "pexels", mediaType: "video", title: "mill", previewUrl: null, mediaUrl: `https://videos.example/${n}.mp4`, sourcePageUrl: `https://www.pexels.com/video/${n}/`, creator: "Ana", license: "Pexels License", licenseUrl: null, durationSeconds: 6, width: 1920, height: 1080, attributionRequired: false }; });
    } };
    /** @type {any[]} */
    let channel = [];
    const state = await runFilm({ film: made.film, manual: "M", model: fakeModel(), store, media: { providers: [pexels], review: false }, channel: { load: async () => channel, save: async (l) => { channel = l; } } });
    assert.equal(state.status, "done", JSON.stringify(state.gaps));
    assert.equal(JSON.parse(String(files.get("originality.json"))).verdict, "pass");

    // 2. The page reads the same files.
    const html = renderFilmPage(/** @type {any} */ (await loadFilmPage(store)));
    assert.equal((html.match(/<article class="scene"/g) ?? []).length, 12);
    assert.ok(html.includes("Pexels License") && html.includes("pass"));

    // 3. The renderer reads the run's files as the GitHub workflow would (here from a folder).
    const runDir = join(dir, "run");
    mkdirSync(runDir);
    for (const [k, v] of files) writeFileSync(join(runDir, k), v);
    const chapters = await loadRunFiles({ dir: runDir });
    const timeline = buildTimeline({ chapters, width: 192, height: 108, fps: 10 });
    assert.equal(timeline.durationSeconds, 120);
    assert.equal(timeline.stats.clips, 12, "every stock shot has its clip");
    // The Edit Director's plan travels with the run's files into the timeline.
    const sc3 = timeline.video.find((v) => v.id === "SC0003-1");
    assert.equal(sc3?.transition, "whip");
    assert.deepEqual(sc3?.punchIns, [2]);
    assert.ok(timeline.sfx.some((e) => e.token === "AUTO-IMPACT" && e.start === 27));
    const clip = join(dir, "clip.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x180:r=10:d=6", "-pix_fmt", "yuv420p", clip]);
    const out = join(dir, "out", "film.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "work"), outFile: out, fetchClip: async () => clip, concurrency: 2 });
    assert.ok(Math.abs((await mediaDuration(out)) - 120) < 0.2);
    assert.equal(report.licences.length, 12);
    assert.match(readFileSync(join(dir, "out", "film.srt"), "utf8"), /Mill1 the river/);

    // 4. Thumbnail and Short from the run's own S7.
    const s7 = String(await loadRunText({ dir: runDir }, "s7.md"));
    const thumbs = await renderThumbnails({ briefs: thumbnailBriefs(s7), timeline, fetchClip: async () => clip, outBase: join(dir, "out", "film"), workDir: join(dir, "work") });
    assert.equal(thumbs[0].frameFrom, "SC0003");
    const cuts = await renderCuts({ film: out, briefs: cutBriefs(s7), captions: timeline.captions, outBase: join(dir, "out", "film"), workDir: join(dir, "work") });
    assert.ok(Math.abs((await mediaDuration(cuts[0].file)) - 20) < 0.2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
