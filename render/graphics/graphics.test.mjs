import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { FONTS, COLOR, ease, brandCss, GRADE } from "./brand/brand.mjs";

test("brand: two fonts on disk, one accent, a grade pair", () => {
  for (const f of Object.values(FONTS)) for (const w of f.weights) assert.ok(existsSync(f.file(w)), f.file(w));
  assert.match(COLOR.accent, /^#[0-9A-F]{6}$/i);
  assert.ok(GRADE.warm && GRADE.cool);
  const css = brandCss();
  assert.match(css, /Zupona Display/);
  assert.match(css, /--accent:#F2A93B/);
});

test("brand: one easing family, monotone from 0 to 1", () => {
  for (const k of /** @type {const} */ (["out", "inOut"])) {
    assert.equal(ease(k, 0), 0);
    assert.ok(Math.abs(ease(k, 1) - 1) < 1e-6);
    let last = 0;
    for (let p = 0.05; p <= 1; p += 0.05) { const y = ease(k, p); assert.ok(y >= last - 1e-9); last = y; }
  }
  assert.ok(ease("out", 0.3) > 0.6, "ease-out arrives fast");
  assert.ok(Math.abs(ease("inOut", 0.5) - 0.5) < 0.02, "in-out is symmetric");
});

import { TEMPLATES, accentWord } from "./templates.mjs";
import { graphicFor } from "./from-shot.mjs";
import { counterParts } from "../render-film.mjs";
import { SAMPLES } from "./samples.mjs";

const F = { width: 1920, height: 1080, fps: 30, seconds: 4 };

test("templates: every one makes a self-contained page with a seek function and no CSS animation", () => {
  assert.equal(Object.keys(TEMPLATES).length, 7);
  for (const [name, data] of SAMPLES) {
    const html = /** @type {any} */ (TEMPLATES[name]).html(data, F);
    assert.match(html, /window\.__seek=function\(t\)/, name);
    assert.doesNotMatch(html, /@keyframes|transition:/, name);
    assert.doesNotMatch(html, /src=["']https?:|url\(https?:/, `${name} needs no network`);
  }
});

test("templates: text is escaped and never invented", () => {
  const html = TEMPLATES.kinetic.html({ text: "<script>x</script> & more" }, F);
  assert.doesNotMatch(html, /<script>x<\/script>/);
  const doc = TEMPLATES.document.html({ text: "Only these words." }, F);
  assert.doesNotMatch(doc, /class="mast"/, "no made-up masthead when none is given");
  assert.equal(accentWord("The river that built an empire"), "empire");
});

test("from-shot: the existing FX fields choose the template, everything else falls back", () => {
  assert.equal(graphicFor({ type: "card", counter: true, text: "2,300,000 people" }, { counterParts })?.data.value, 2300000);
  assert.equal(graphicFor({ type: "card", kinetic: true, text: "The empire fell" })?.template, "kinetic");
  assert.deepEqual(graphicFor({ type: "card", text: "“Veni, vidi, vici.” — Julius Caesar" })?.data, { quote: "Veni, vidi, vici.", by: "Julius Caesar" });
  assert.equal(graphicFor({ type: "card", shotType: "document", style: "paper", text: "Signed in 1215", highlight: "1215" })?.template, "document");
  assert.equal(graphicFor({ type: "card", style: "paper", text: "Signed in 1215", highlight: "1215" }), null);
  assert.equal(graphicFor({ type: "card", chapterTitle: "Chapter 2 · The Long Winter", text: "" })?.data.kicker, "Chapter 2");
  assert.notEqual(graphicFor({ type: "card", chapterTitle: "Chapter 2 · Winter", text: "The snow came early" })?.template, "chapter", "a card's own words are kept");
  assert.equal(graphicFor({ type: "card", shotType: "kinetic-type", text: "The snow came early" })?.template, "kinetic");
  assert.equal(graphicFor({ type: "card", shotType: "quote", text: "No surrender" })?.data.quote, "No surrender");
  assert.equal(graphicFor({ type: "clip", title: "Runnymede, 1215", url: "u" })?.alpha, true);
  assert.equal(graphicFor({ type: "card", text: "plain words" }), null);
  assert.equal(graphicFor({ type: "card", kinetic: true, text: "x", chart: { title: "", bars: [] } }), null);
  assert.equal(graphicFor({ type: "black" }), null);
  assert.equal(graphicFor({ type: "card", graphic: { template: "timeline", data: { items: [] } } })?.template, "timeline");
  assert.equal(graphicFor({ type: "card", graphic: { template: "nope", data: {} }, text: "a" }), null);
});

import { depthGraph, depthMoveFor } from "../depth/depth.mjs";

test("depth: every move stays inside the photo (displacement + pan < overscan margin)", () => {
  const maps = { dir: "/x", plate: /** @type {[number, number]} */ ([2150, 1210]), amount: 127 };
  for (const kind of /** @type {const} */ (["dolly", "orbit", "rack"])) for (const dir of /** @type {const} */ ([1, -1])) for (const strength of [0.35, 1, 1.4]) {
    const g = depthGraph(maps, { kind, dir, strength }, { width: 1920, height: 1080, fps: 30, frames: 150 });
    assert.ok(g.safe, `${kind} ${dir} ${strength}: ${g.amp}+${g.pan} < ${g.margin}`);
    assert.match(g.graph, /crop=1920:1080/);
    assert.match(g.graph, /t\/4\.967/, "eased over the whole shot, frame-exact");
  }
  assert.match(depthGraph(maps, { kind: "rack", dir: 1, strength: 1 }, { width: 1920, height: 1080, fps: 30, frames: 150 }).graph, /maskedmerge/);
});

test("depth: the Edit Director's move picks the camera", () => {
  assert.equal(depthMoveFor({ kind: "pan", dir: -1, amount: 0.09 }, 0).kind, "orbit");
  assert.equal(depthMoveFor({ kind: "hold", amount: 0 }, 0).kind, "rack");
  assert.deepEqual([0, 1, 2].map((i) => depthMoveFor(undefined, i).kind), ["dolly", "orbit", "rack"]);
});

// A wedged browser page or an ffmpeg that stops reading must fail the graphic in bounded time (the render then
// draws the ffmpeg card), never hang the film: the CI hang of PR #68 sat in exactly these waits.
import { renderGraphic } from "./render-graphic.mjs";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** A fake browser: `evaluate` can be made to never answer; every screenshot is 1 MB (more than a pipe holds). */
function fakeBrowser({ wedged = false } = {}) {
  const closed = { ctx: 0 };
  const page = {
    setContent: async () => {},
    evaluate: async () => (wedged ? new Promise(() => {}) : undefined),
    screenshot: async () => Buffer.alloc(1 << 20),
  };
  return { closed, browser: { newContext: async () => ({ newPage: async () => page, close: async () => { closed.ctx += 1; } }) } };
}

/** A stand-in ffmpeg: a shell script (it never reads its input, or it exits at once). @param {string} body */
function fakeFfmpeg(dir, body) {
  const f = join(dir, "ffmpeg.sh");
  writeFileSync(f, `#!/bin/sh\n${body}\n`);
  chmodSync(f, 0o755);
  return f;
}

test("graphics: a page that never answers fails in bounded time and the page is closed", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-graphic-"));
  try {
    const { browser, closed } = fakeBrowser({ wedged: true });
    const t0 = Date.now();
    await assert.rejects(renderGraphic({ template: "kinetic", data: { text: "Hoover Dam" }, out: join(dir, "g.mp4"), frames: 3, browser, ffmpeg: fakeFfmpeg(dir, "cat > /dev/null"), timeoutMs: 400 }), /did not finish in time/);
    assert.ok(Date.now() - t0 < 5_000);
    assert.equal(closed.ctx, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("graphics: an ffmpeg that stops reading (the pipe never drains) fails in bounded time", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-graphic-"));
  try {
    const { browser } = fakeBrowser();
    const t0 = Date.now();
    await assert.rejects(renderGraphic({ template: "kinetic", data: { text: "Hoover Dam" }, out: join(dir, "g.mp4"), frames: 5, browser, ffmpeg: fakeFfmpeg(dir, "exec sleep 30"), timeoutMs: 600 }), /did not finish in time/);
    assert.ok(Date.now() - t0 < 5_000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("graphics: an ffmpeg that exits at once is reported as a failed encode, never an unhandled pipe error", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-graphic-"));
  try {
    const { browser } = fakeBrowser();
    await assert.rejects(renderGraphic({ template: "kinetic", data: { text: "Hoover Dam" }, out: join(dir, "g.mp4"), frames: 5, browser, ffmpeg: fakeFfmpeg(dir, "echo broken >&2; exit 1"), timeoutMs: 5_000 }), /ffmpeg graphic encode failed: broken/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// A graphic is written to a temp file of its own, checked, then renamed: a killed or cut-off render
// never leaves a half-written graphic.mp4 that a later encode reads ("moov atom not found", PR #73's CI).
import { renderGraphicFile } from "./render-graphic.mjs";
import { readdirSync } from "node:fs";

test("graphics: ffmpeg killed mid-render leaves no file behind, final or temp", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-graphic-"));
  try {
    const { browser } = fakeBrowser();
    // Writes the start of a file to its output, then is killed.
    const ffmpeg = fakeFfmpeg(dir, 'for a; do last="$a"; done; head -c 4096 /dev/urandom > "$last"; kill -9 $$');
    const file = join(dir, "card-graphic.mp4");
    await assert.rejects(renderGraphicFile({ template: "kinetic", data: { text: "Hoover Dam" }, out: "", file, frames: 5, browser, ffmpeg, timeoutMs: 5_000 }), /ffmpeg graphic encode failed/);
    assert.deepEqual(readdirSync(dir).filter((f) => f.endsWith(".mp4")), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("graphics: an encode that ends but is not a playable video is refused and deleted (checked with ffprobe)", { timeout: 20_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-graphic-"));
  try {
    const file = join(dir, "card-graphic.mp4");
    const render = async (/** @type {any} */ o) => { writeFileSync(o.out, Buffer.alloc(2048, 7)); return { out: o.out, frames: 5, alpha: false }; };
    await assert.rejects(renderGraphicFile({ template: "kinetic", data: {}, out: "", file }, { render }), /not a playable video/);
    assert.deepEqual(readdirSync(dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("graphics: two shots with the same graphic share one render; a finished file is reused", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-graphic-"));
  try {
    const file = join(dir, "card-graphic.mp4");
    let renders = 0;
    const render = async (/** @type {any} */ o) => { renders += 1; await new Promise((r) => setTimeout(r, 50)); writeFileSync(o.out, "ok"); return { out: o.out, frames: 5, alpha: false }; };
    const probe = async () => true;
    const both = await Promise.all([renderGraphicFile({ template: "kinetic", data: {}, out: "", file }, { render, probe }), renderGraphicFile({ template: "kinetic", data: {}, out: "", file }, { render, probe })]);
    assert.deepEqual(both, [file, file]);
    assert.equal(renders, 1);
    assert.deepEqual(readdirSync(dir), ["card-graphic.mp4"]);
    await renderGraphicFile({ template: "kinetic", data: {}, out: "", file }, { render, probe });
    assert.equal(renders, 1, "the finished file is used as it is");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
