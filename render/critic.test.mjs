import assert from "node:assert/strict";
import test from "node:test";
import { critique, designedMoments, STANDARD, verdictOf } from "./critic.mjs";

/** A timeline of equal shots, as the renderer builds one (only the fields the critic reads). */
function timeline(shots, extra = {}) {
  const video = shots.map((s, i) => ({ scene: `SC${i + 1}`, start: s.start, end: s.end, type: s.type ?? "clip", url: s.url ?? `https://cdn/${i}.mp4`, ...s }));
  return { width: 1920, height: 1080, fps: 30, durationSeconds: video[video.length - 1].end, video, sfx: [], narration: [], music: [], ...extra };
}

/** The owner's own 3-minute film as measured on 24 Nov: 2.9 s stock shots, no design, mono, LRA 1.9 LU. */
function ownersFilm() {
  const video = [];
  for (let i = 0; i < 62; i += 1) video.push({ scene: `SC${i}`, start: i * 2.9, end: (i + 1) * 2.9, type: "clip", url: `https://stock/${i}.mp4` });
  return { width: 1280, height: 720, fps: 30, durationSeconds: 179.8, video, sfx: [], narration: [], music: [] };
}

test("the owner's film is blocked, by name, on every count it failed", () => {
  const r = critique(ownersFilm(), { master: { integratedLufs: -14.4, truePeakDbtp: -1.4, loudnessRangeLu: 1.9, black: [] } }, { channels: 1 });
  assert.equal(r.verdict, "block");
  const codes = new Set(r.findings.map((f) => f.code));
  assert.ok(codes.has("critic.designed"), "no designed moments a minute");
  assert.ok(codes.has("critic.opening"), "no beat in the first 30 s");
  assert.ok(codes.has("critic.flat"), "a flat loudness range is a defect");
  assert.ok(codes.has("critic.mono"), "mono is called out");
  for (const f of r.findings) assert.ok(f.en.length > 10 && f.bn.length > 10, `${f.code} says why in both languages`);
});

test("a film that meets the house standard passes, with its numbers recorded", () => {
  const shots = [];
  for (let i = 0; i < 30; i += 1) shots.push({ start: i * 6, end: (i + 1) * 6, type: "clip" });
  // Six designed moments (two a minute), each with a cue within half a second.
  const video = shots.map((s, i) => (i % 5 === 2 ? { ...s, counter: true } : s));
  const sfx = video.filter((v) => v.counter).map((v) => ({ token: "AUTO-IMPACT", kind: "hit", scene: v.scene, start: v.start + 0.1, end: v.start + 1.2 }));
  const r = critique(timeline(video, { sfx }), { master: { integratedLufs: -14.2, truePeakDbtp: -1.4, loudnessRangeLu: 8, black: [] } }, { channels: 2 });
  assert.deepEqual(r.findings, []);
  assert.equal(r.verdict, "pass");
  assert.equal(r.measures.shots, 30);
  assert.equal(r.measures.avgShot, 6);
  assert.ok(r.measures.movingShare > STANDARD.movingShare);
  assert.ok(r.measures.designedPerMinute >= STANDARD.designedPerMinute);
  assert.equal(r.measures.lra, 8);
});

test("a still picture, a long shot and a stock-montage rhythm each block on their own", () => {
  const stills = timeline(Array.from({ length: 20 }, (_, i) => ({ start: i * 8, end: (i + 1) * 8, type: "card" })));
  assert.ok(critique(stills, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 }).findings.some((f) => f.code === "critic.still"));

  const long = timeline([{ start: 0, end: 40 }, ...Array.from({ length: 20 }, (_, i) => ({ start: 40 + i * 7, end: 47 + i * 7 }))]);
  assert.ok(critique(long, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 }).findings.some((f) => f.code === "critic.longShot"));

  const burst = timeline(Array.from({ length: 100 }, (_, i) => ({ start: i * 1.2, end: (i + 1) * 1.2 })));
  assert.ok(critique(burst, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 }).findings.some((f) => f.code === "critic.burst"));
});

test("irrelevant footage and a mono, clipped master block too; a warning only notes", () => {
  const shots = [];
  for (let i = 0; i < 30; i += 1) shots.push({ start: i * 6, end: (i + 1) * 6, type: "clip" });
  const video = shots.map((s, i) => (i % 5 === 2 ? { ...s, counter: true } : s));
  const sfx = video.filter((v) => v.counter).map((v) => ({ token: "AUTO-IMPACT", kind: "hit", scene: v.scene, start: v.start + 0.1, end: v.start + 1.2 }));
  const t = timeline(video, { sfx });
  const r = critique(t, { master: { integratedLufs: -12.5, truePeakDbtp: -0.3, loudnessRangeLu: 8, black: [{ start: 10, end: 12, duration: 2 }] } }, { channels: 2, relevance: Array(30).fill(0.1) });
  const codes = new Set(r.findings.map((f) => f.code));
  assert.deepEqual([...codes].sort(), ["critic.black", "critic.loudness", "critic.peak", "critic.relevance"]);
  assert.equal(verdictOf(r.findings), "block");
  assert.equal(verdictOf([{ code: "x", severity: "warn", en: "a", bn: "খ" }]), "pass");
});

test("what counts as a designed moment: a number, a kinetic line, a chart, a map, a chapter title", () => {
  const got = designedMoments([
    { start: 0, end: 3, type: "clip" },
    { start: 3, end: 6, type: "card", counter: true },
    { start: 6, end: 9, type: "card", kinetic: true },
    { start: 9, end: 12, type: "card", chart: { bars: [] } },
    { start: 12, end: 15, type: "card", chapterTitle: "Chapter 2 · The barber" },
    { start: 15, end: 18, type: "black" },
  ]);
  assert.equal(got.length, 4);
});
