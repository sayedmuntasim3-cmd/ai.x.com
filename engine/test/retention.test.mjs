import assert from "node:assert/strict";
import { test } from "node:test";
import { curveFromReport, lessonsText, retentionReport, videoIdOf, watchingAt } from "../src/retention.mjs";

const line = (/** @type {number} */ n, /** @type {number} */ a, /** @type {number} */ b, /** @type {string} */ narr, shots = "R3 a street") => `**SC${String(n).padStart(4, "0")}** | 0:${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}-0:${String(Math.floor(b / 60)).padStart(2, "0")}:${String(b % 60).padStart(2, "0")} | C1 | b | E | C01 | NARR: ${narr} | W 5/5 | ANCHOR: x | SHOTS: (1) ${shots} | LOOK: L`;

test("a retention curve laid over the scenes shows where viewers left and what was on screen", () => {
  const md = [
    line(1, 0, 30, "At nine he lost his father."),
    line(2, 30, 60, "He cut hair before school."),
    line(3, 60, 90, "The salon law of nineteen seventy-two set fees by district.", "R1 card \"Section 14(b)\""),
    line(4, 90, 120, "Then the Rolls-Royce arrived."),
  ].join("\n");
  // 100 points: steady loss, a cliff during the law scene, a flat stretch for the car.
  const rows = Array.from({ length: 101 }, (_, i) => {
    const t = i * 1.2;
    const watch = t < 60 ? 1 - t * 0.004 : t < 90 ? 0.76 - (t - 60) * 0.012 : 0.4 - (t - 90) * 0.0005;
    return [i / 100, watch, 0.5];
  });
  const curve = curveFromReport({ rows });
  assert.equal(curve.length, 101);
  assert.ok(Math.abs((watchingAt(curve, 30, 120) ?? 0) - 0.88) < 0.01);
  const r = retentionReport({ filmId: "f", title: "The Barber", videoId: "abcdefghijk", curve, durationSeconds: 120, chapters: [{ markdown: md }], at: "2026-11-05T00:00:00Z" });
  assert.equal(r.at30, 88);
  assert.deepEqual(r.drops.map((d) => d.scene), ["SC0003"], "the law scene lost viewers three times faster");
  assert.ok(r.drops[0].seen.includes("Section 14(b)"));
  assert.deepEqual(r.holds.map((h) => h.scene), ["SC0004"]);
  const text = lessonsText([r]);
  assert.match(text, /"The Barber": 88% still watching at 0:30/);
  assert.match(text, /LEFT at 1:00 .*said "The salon law of nineteen seventy-two/);
  assert.match(text, /HELD at 1:30: said "Then the Rolls-Royce arrived."/);
  assert.equal(lessonsText([]), "");
});

test("a video id is read from any YouTube link", () => {
  for (const s of ["dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10", "https://youtu.be/dQw4w9WgXcQ", "https://youtube.com/shorts/dQw4w9WgXcQ"]) assert.equal(videoIdOf(s), "dQw4w9WgXcQ", s);
  assert.equal(videoIdOf("not a video"), null);
});
