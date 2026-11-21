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
