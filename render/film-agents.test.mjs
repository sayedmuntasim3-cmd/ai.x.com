import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_LIMITS, agentsOfFrames, castOf, frameDiff, inkOf, lumaStats, neonShare, storyPlace, tiltOf, grayOfRgb } from "./film-agents.mjs";

const W = 96, H = 54;
/** A busy colour picture (deterministic texture) with a base tint. */
function picture(seed = 1, tint = [1, 1, 1], base = 60, span = 140) {
  const rgb = new Uint8Array(W * H * 3);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < W * H; i += 1) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = base + (s % span);
    rgb[i * 3] = Math.min(255, v * tint[0]); rgb[i * 3 + 1] = Math.min(255, v * tint[1]); rgb[i * 3 + 2] = Math.min(255, v * tint[2]);
  }
  return rgb;
}
const solid = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => { const x = new Uint8Array(W * H * 3); for (let i = 0; i < W * H; i += 1) { x[i * 3] = r; x[i * 3 + 1] = g; x[i * 3 + 2] = b; } return x; };
/** A picture rotated by `deg` on black, as a polaroid dropped on a table. */
function tilted(deg, seed = 3) {
  const src = picture(seed);
  const out = new Uint8Array(W * H * 3);
  const a = (deg * Math.PI) / 180, cx = W / 2, cy = H / 2, hw = 28, hh = 18;
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const dx = x - cx, dy = y - cy;
    const u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(u) < hw && Math.abs(v) < hh) { const i = y * W + x; out[i * 3] = src[i * 3]; out[i * 3 + 1] = src[i * 3 + 1]; out[i * 3 + 2] = src[i * 3 + 2]; }
  }
  return out;
}

/** A film: shots of 4 s each at 2 fps, each shot's frames made by `make(shotIndex, frameIndex)`. */
function film(n, make, extra = (/** @type {number} */ i) => ({})) {
  const video = Array.from({ length: n }, (_, i) => ({ id: `S${i + 1}`, start: i * 4, end: (i + 1) * 4, type: "clip", url: `u${i}`, ...extra(i) }));
  const frames = [];
  for (let i = 0; i < n; i += 1) for (let k = 0; k < 8; k += 1) frames.push(make(i, k));
  return agentsOfFrames(video, frames.length, (i) => ({ rgb: frames[i], w: W, h: H }), 2);
}
const role = (/** @type {any} */ r, /** @type {string} */ id) => r.results.find((/** @type {any} */ x) => x.role === id);
const clean = (/** @type {number} */ i) => picture(10 + i, [1.05, 1, 0.95]);

test("a clean film passes every picture agent", () => {
  const r = film(6, (i) => clean(i));
  for (const x of r.results) assert.deepEqual(x.findings.filter((f) => f.severity === "block"), [], x.role);
});

test("a tilted polaroid on black is found by composition, with the shot number", () => {
  const r = film(6, (i) => (i === 2 ? tilted(12) : clean(i)));
  const c = role(r, "cinematography-composition");
  assert.equal(c.pass, false);
  assert.equal(c.findings[0].shot, "S3");
  assert.match(c.findings[0].reason, /tilted/);
  assert.equal(tiltOf(grayOfRgb(tilted(0)), W, H).tilted, false, "a straight picture on black is not tilted");
});

test("a burnt-out shot fails exposure", () => {
  const r = film(6, (i) => (i === 4 ? solid(252, 252, 252) : clean(i)));
  const e = role(r, "color-exposure");
  assert.equal(e.pass, false);
  assert.equal(e.findings[0].shot, "S5");
});

test("a shot with another colour cast than the film fails white balance", () => {
  const r = film(7, (i) => (i === 3 ? picture(50, [0.5, 1, 1.6]) : clean(i)));
  const w = role(r, "color-white-balance");
  assert.ok(w.findings.some((f) => f.shot === "S4"), JSON.stringify(w.findings));
  assert.equal(castOf(solid(5, 5, 5)), null);
});

test("neon over-saturation and posterised pictures fail the artifact check", () => {
  const neon = new Uint8Array(W * H * 3); for (let i = 0; i < W * H; i += 1) { neon[i * 3] = i % 2 ? 255 : 0; neon[i * 3 + 1] = 0; neon[i * 3 + 2] = i % 2 ? 0 : 255; }
  assert.ok(neonShare(neon) > AGENT_LIMITS.neonShare);
  const r = film(6, (i) => (i === 1 ? neon : clean(i)));
  assert.ok(role(r, "color-artifact-check").findings.some((f) => f.shot === "S2" && f.severity === "block"));
  const poster = picture(8); for (let i = 0; i < poster.length; i += 1) poster[i] = Math.round(poster[i] / 64) * 64;
  assert.ok(lumaStats(poster).levels < AGENT_LIMITS.posterLevels);
});

test("a one-frame glitch inside a shot is found by the artifact QC", () => {
  const base = picture(30);
  const r = film(5, (i, k) => (i === 2 && k === 4 ? solid(255, 255, 255) : i === 2 ? base : clean(i)));
  const q = role(r, "quality-artifact-qc");
  assert.equal(q.pass, false);
  assert.equal(q.findings[0].shot, "S3");
  assert.ok(frameDiff(base, solid(255, 255, 255)) > 40);
});

test("one still held far too long, and a harsh cut, fail continuity", () => {
  const r = film(5, (i) => (i === 1 ? picture(60, [1, 1, 1], 0, 40) : i === 2 ? picture(61, [1, 1, 1], 180, 70) : clean(i)), (i) => (i === 3 ? { still: true, end: 4 * 3 + 14 } : {}));
  const c = role(r, "editing-continuity-match");
  assert.ok(c.findings.some((f) => f.code === "critic.hold" && f.shot === "S4"), JSON.stringify(c.findings));
  assert.ok(c.findings.some((f) => f.code === "critic.gradeJump" && f.shot === "S3"), JSON.stringify(c.findings));
});

test("an opening on black fails intro/outro", () => {
  const r = film(5, (i) => (i === 0 ? solid(2, 2, 2) : clean(i)));
  const o = role(r, "editing-intro-outro");
  assert.equal(o.pass, false);
  assert.equal(o.findings[0].shot, "S1");
});

test("a designed card with nothing drawn fails the diagram builder; real text passes", () => {
  const text = solid(10, 10, 10); for (let y = 20; y < 30; y += 1) for (let x = 20; x < 76; x += 1) { const i = (y * W + x) * 3; text[i] = text[i + 1] = text[i + 2] = 240; }
  const r = film(5, (i) => (i === 1 ? solid(10, 10, 10) : i === 2 ? text : clean(i)), (i) => (i === 1 || i === 2 ? { kinetic: true } : {}));
  const d = role(r, "animation-diagram-builder");
  assert.deepEqual(d.findings.map((f) => f.shot), ["S2"]);
  assert.ok(inkOf(text, W, H).ink > 0.05);
});

test("storyPlace: a Moon picture on the launch lines belongs to the landing", () => {
  const lines = [
    { start: 0, end: 30, narration: "The Saturn V stood on the pad. Ignition. The engines lit and the rocket began to rise." },
    { start: 30, end: 120, narration: "Four days later the lander touched down. The astronauts walked on the Moon and left their footprints in the lunar dust." },
  ];
  const shots = [
    { id: "S1", start: 5, end: 15, subject: "Moon surface crater", type: "clip", rung: "R3" },
    { id: "S2", start: 15, end: 25, subject: "Saturn V rocket launch", type: "clip", rung: "R2" },
    { id: "S3", start: 90, end: 100, subject: "Moon surface crater", type: "clip", rung: "R3" },
  ];
  const far = lines.concat([{ start: 400, end: 430, narration: "Years later the Moon was visited again." }]);
  const r = storyPlace(shots, far, { far: 60, near: 5 });
  assert.deepEqual(r.findings.map((f) => f.shot), ["S1"]);
  assert.equal(r.pass, false);
});

test("the critic blocks on a crew finding, and the auto-fix loop re-picks exactly that shot", async () => {
  const { critique } = await import("./critic.mjs");
  const { failingShots, shotLevelOnly } = await import("./autofix.mjs");
  const r = film(6, (i) => (i === 2 ? tilted(12) : clean(i)));
  const video = Array.from({ length: 6 }, (_, i) => ({ id: `S${i + 1}`, start: i * 4, end: (i + 1) * 4, type: "clip", url: `u${i}` }));
  const timeline = { video, durationSeconds: 24, fps: 30, width: 1920, height: 1080, narration: [], captions: [], music: [], sfx: [] };
  const plan = [{ role: "cinematography-visual-metaphor", shot: "S5", code: "critic.pictureOutOfPlace", severity: "block", reason: "the Moon picture sits on the launch lines" }];
  const c = critique(timeline, { durationSeconds: 24 }, { voiceFilm: true, agents: { results: r.results, plan } });
  const codes = c.findings.filter((f) => f.severity === "block").map((f) => f.code);
  assert.ok(codes.includes("critic.tilted") && codes.includes("critic.pictureOutOfPlace"), codes.join(","));
  const failing = failingShots({ shots: video, agents: { results: r.results, plan } });
  assert.deepEqual([...failing.get("S3") ?? []], ["critic.tilted"]);
  assert.deepEqual([...failing.get("S5") ?? []], ["critic.pictureOutOfPlace"]);
  assert.equal(shotLevelOnly([{ severity: "block", code: "critic.tilted" }, { severity: "block", code: "critic.unfilled" }]), true);
  // taste blocks (#123) are re-picked too now
  assert.deepEqual([...failingShots({ shots: video, taste: { unfilled: [{ id: "S1", filled: 0.4 }], logos: [{ id: "S2" }], repeats: [{ a: "S3", b: "S4" }] } }).keys()].sort(), ["S1", "S2", "S4"]);
});
