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
