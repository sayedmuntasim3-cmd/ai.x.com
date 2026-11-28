import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { blurAndFlicker, chapterMusic, critique, cutsPerMinute, designedMoments, designedStill, hookReport, measurePicture, parsePicture, STANDARD, subtitleFit, verdictOf } from "./critic.mjs";

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

test("v2: a held minute and a montage minute are measured from the cut times", () => {
  const held = timeline([{ start: 0, end: 60 }, { start: 60, end: 120 }, { start: 120, end: 125 }]);
  const perMinute = cutsPerMinute(held.video);
  assert.deepEqual(perMinute.map((m) => m.cuts), [0, 1, 1], "the cut at 120 s belongs to the third minute");
  assert.equal(perMinute[2].full, false, "the last minute is partial, so its silence is not a held minute");
  const r = critique(held, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 });
  assert.ok(r.findings.some((f) => f.code === "critic.deadMinute"), "a full minute with no cut is called out");
  assert.equal(r.measures.deadMinutes, 1);

  const burst = timeline(Array.from({ length: 60 }, (_, i) => ({ start: i * 1.2, end: (i + 1) * 1.2 })));
  const rb = critique(burst, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 });
  assert.ok(rb.findings.some((f) => f.code === "critic.frenetic" && f.severity === "block"), "a minute of 49 cuts is a block, not an edit");
});

test("v2: a run of one shot type is reported as one look", () => {
  const video = Array.from({ length: 8 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6, shotType: "document" }));
  const r = critique(timeline(video), {}, {});
  assert.ok(r.findings.some((f) => f.code === "critic.variety"), "eight document cards in a row are one look");
  assert.equal(r.measures.longestTypeRun, 8);
});

test("v2: every chapter turn must be marked by a new cue or a riser that lands on it", () => {
  const video = [
    { start: 0, end: 60, type: "clip", chapterTitle: "Chapter 1 · The shop" },
    { start: 60, end: 120, type: "clip", chapterTitle: "Chapter 2 · The debt" },
    { start: 120, end: 240, type: "clip", chapterTitle: "Chapter 3 · America" },
  ];
  const music = [{ cue: "M01", start: 0, end: 60 }, { cue: "M02", start: 60, end: 120 }, { cue: "M02", start: 120, end: 240 }];
  const sfx = [{ token: "AUTO-RISER", kind: "hit", scene: "SC1", start: 58.4, end: 60 }];
  const t = { width: 1920, height: 1080, fps: 30, durationSeconds: 240, video, narration: [], music, sfx };
  const score = chapterMusic(t);
  assert.equal(score.turns, 3);
  assert.deepEqual(score.unmarked.map((u) => u.at), [120], "the third chapter has the same cue and no riser");
  assert.equal(score.coveredShare, 1);
  const r = critique(t, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 });
  assert.ok(r.findings.some((f) => f.code === "critic.chapterMusic" && f.severity === "block"));
  // A riser on the cut marks the turn: the second chapter is not reported.
  assert.ok(!score.unmarked.some((u) => u.at === 60));
  assert.ok(!critique({ ...t, music: music.map((m) => (m.start === 120 ? { ...m, cue: "M03" } : m)), sfx: [] }, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 }).findings.some((f) => f.code === "critic.chapterMusic"));
});

test("v2: the hook is scored from the picture and the words, and a weak opening is sent back", () => {
  const shots = Array.from({ length: 8 }, (_, i) => ({ start: i * 3, end: (i + 1) * 3, type: "clip" }));
  const strong = timeline(shots, { narration: [{ scene: "SC1", start: 0, end: 12, text: "At nineteen he had forty-seven dollars." }] });
  strong.video[3].counter = true;
  strong.video[6].title = "The Barber of Memphis";
  const good = hookReport(strong);
  assert.ok(good.score >= 9, `a hook with 8 beats, an early title and a short first sentence scores ${good.score}`);
  assert.equal(good.titleAt, 18);
  assert.equal(good.firstSentenceWords, 6);

  const slow = timeline(Array.from({ length: 5 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6, type: "clip" })),
    { narration: [{ scene: "SC1", start: 0, end: 30, text: "This is the story of a man who worked very hard for many years and then everything changed for him in a way nobody expected at all." }] });
  slow.durationSeconds = 300;
  slow.video.push({ start: 30, end: 300, type: "clip" });
  const weak = hookReport(slow);
  assert.ok(weak.score < 5, `a slow, wordy opening scores ${weak.score}`);
  const r = critique(slow, { master: { integratedLufs: -14, truePeakDbtp: -2, loudnessRangeLu: 8, black: [] } }, { channels: 2 });
  assert.ok(r.findings.some((f) => f.code === "critic.hook"), "a weak hook is a finding, not a footnote");
  assert.equal(r.measures.hookScore, weak.score);
});

test("a blurred shot and a brightness jump inside a shot are measured, not declared", () => {
  const text = [
    "frame:0 pts:0 pts_time:0", "lavfi.blur=4.5", "lavfi.signalstats.YAVG=80",
    "frame:1 pts:1 pts_time:0.5", "lavfi.blur=5.1", "lavfi.signalstats.YAVG=82",
    "frame:2 pts:2 pts_time:1", "lavfi.blur=5.0", "lavfi.signalstats.YAVG=140",
    "frame:4 pts:4 pts_time:2", "lavfi.blur=34.0", "lavfi.signalstats.YAVG=60",
    "frame:5 pts:5 pts_time:2.5", "lavfi.blur=33.1", "lavfi.signalstats.YAVG=61",
  ].join("\n");
  const samples = parsePicture(text);
  assert.equal(samples.length, 5);
  const video = [{ id: "SC1-1", start: 0, end: 2, type: "clip" }, { id: "SC1-2", start: 2, end: 4, type: "clip" }, { id: "SC1-3", start: 4, end: 5, type: "black" }];
  const r = blurAndFlicker(samples, video);
  assert.deepEqual(r.blurred.map((b) => b.id), ["SC1-2"], "the box-blurred shot is the blurred one");
  assert.ok(r.blurred[0].value > STANDARD.blurMax);
  assert.deepEqual(r.flicker.map((f) => Math.round(f.at)), [1], "a cut into a dark scene is not flicker; a jump inside a shot is");
  assert.equal(r.shots, 2, "black is not a shot the critic measures");
});

test("the picture of a rendered film is measured: a blurred second shot is found in the file", async () => {
  const probe = spawnSync("ffprobe", ["-version"]);
  if (probe.error || probe.status !== 0) return;
  const dir = mkdtempSync(join(tmpdir(), "blur-"));
  try {
    const film = join(dir, "film.mp4");
    const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=10:duration=4",
      "-filter_complex", "[0:v]split[a][b];[a]trim=start=0:end=2,setpts=PTS-STARTPTS[s];[b]trim=start=2:end=4,setpts=PTS-STARTPTS,boxblur=10:2[bl];[s][bl]concat=n=2:v=1:a=0",
      "-pix_fmt", "yuv420p", film]);
    assert.equal(made.status, 0, String(made.stderr));
    const timeline = { video: [{ id: "SC1-1", start: 0, end: 2, type: "clip" }, { id: "SC1-2", start: 2, end: 4, type: "clip" }] };
    const r = await measurePicture(film, timeline);
    assert.deepEqual(r.blurred.map((b) => b.id), ["SC1-2"]);
    assert.ok(r.blurred[0].value > STANDARD.blurMax);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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

/** The codes a nearly-good film earns, so a new check can be read on its own. */
function codesOf(extra, evidence = {}) {
  const shots = Array.from({ length: 30 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6 }));
  const t = timeline(shots, extra);
  const r = critique(t, { master: { integratedLufs: -14.2, truePeakDbtp: -1.4, loudnessRangeLu: 8, black: [] } }, { channels: 2, ...evidence });
  return { codes: r.findings.map((f) => f.code), findings: r.findings, measures: r.measures };
}

test("a narrated scene whose voice never reached the film blocks, and the critic names it", () => {
  const narration = [{ scene: "SC1", start: 0, end: 6, text: "The mill opens at dawn." }, { scene: "SC2", start: 6, end: 12, text: "By noon the wheel had stopped." }];
  const missing = codesOf({ narration }, { voiced: ["SC1"] });
  assert.ok(missing.codes.includes("critic.narration"), "a silent scene is a defect");
  assert.equal(missing.measures.narrationCoverage, 0.5);
  assert.match(missing.findings.find((f) => f.code === "critic.narration").en, /SC2/);
  const whole = codesOf({ narration }, { voiced: ["SC1", "SC2"] });
  assert.ok(!whole.codes.includes("critic.narration"), "every narrated scene voiced: no finding");
  assert.equal(whole.measures.narrationCoverage, 1);
});

test("a number placeholder is never spoken or shown: one left in the film blocks", () => {
  const narration = [{ scene: "SC1", start: 0, end: 6, text: "It cost about [C12 low] dollars." }];
  const r = codesOf({ narration });
  assert.ok(r.codes.includes("critic.unresolved"));
  assert.match(r.findings.find((f) => f.code === "critic.unresolved").en, /\[C12 low\]/);
  const clean = codesOf({ narration: [{ scene: "SC1", start: 0, end: 6, text: "It cost about one dollar and fifteen cents." }] });
  assert.ok(!clean.codes.includes("critic.unresolved"));
});

test("subtitles: a hole over the speech blocks, captions that overlap or run past the end block too", () => {
  const narration = [{ scene: "SC1", start: 0, end: 30, text: "words" }];
  const holey = codesOf({ narration, captions: [{ start: 0, end: 5, text: "a" }, { start: 20, end: 30, text: "b" }] });
  assert.ok(holey.codes.includes("critic.subtitles"));
  assert.ok(holey.measures.subtitles.maxGap >= 14, `gap ${holey.measures.subtitles.maxGap}`);
  const tight = codesOf({ narration, captions: [{ start: 0, end: 15, text: "a" }, { start: 15, end: 30, text: "b" }] });
  assert.ok(!tight.codes.includes("critic.subtitles"), "a covered stretch of speech passes");
  const overlap = codesOf({ narration, captions: [{ start: 0, end: 20, text: "a" }, { start: 5, end: 30, text: "b" }] });
  assert.ok(overlap.codes.includes("critic.subtitleTime"));
  assert.equal(subtitleFit(narration, [], 30).coverage, 0);
});

test("footage reused inside ten minutes is a loop; a shot with no media and a lost transition are named", () => {
  const loop = codesOf({ video: timeline(Array.from({ length: 30 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6 }))).video.map((v, i) => (i === 10 ? { ...v, url: "https://cdn/1.mp4" } : v)) });
  assert.ok(loop.codes.includes("critic.repeatWindow"));
  assert.ok(loop.measures.repeatsInWindow >= 1);
  const hole = codesOf({ video: timeline(Array.from({ length: 30 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6, url: i === 3 ? null : undefined }))).video });
  assert.ok(hole.codes.includes("critic.media"));
  const edits = [{ chapter: "C1", scenes: [{ scene: "SC3", transition: "whip" }, { scene: "SC4", transition: "slide" }] }];
  const lost = codesOf({}, { edits });
  assert.ok(lost.codes.includes("critic.transition"));
  assert.deepEqual([lost.measures.transitionsRequired, lost.measures.transitionsMissing], [2, 2]);
  const kept = codesOf({ video: timeline(Array.from({ length: 30 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6, ...(i === 2 ? { transition: "whip" } : {}), ...(i === 3 ? { transition: "slide" } : {}) }))).video }, { edits });
  assert.ok(!kept.codes.includes("critic.transition"), "what the editor asked for is in the film");
});

test("a still's own soft backdrop is design, not a blurred copy; a dark shot is unusable picture", () => {
  const text = [
    "frame:0 pts_time:0", "lavfi.blur=34.0", "lavfi.signalstats.YAVG=120",
    "frame:2 pts_time:1", "lavfi.blur=33.0", "lavfi.signalstats.YAVG=118",
    "frame:4 pts_time:2", "lavfi.blur=5.0", "lavfi.signalstats.YAVG=6",
    "frame:6 pts_time:3", "lavfi.blur=4.8", "lavfi.signalstats.YAVG=7",
  ].join("\n");
  const video = [{ id: "SC1-1", start: 0, end: 2, type: "clip", still: true }, { id: "SC1-2", start: 2, end: 4, type: "clip" }];
  const r = blurAndFlicker(parsePicture(text), video);
  assert.deepEqual(r.blurred, [], "a photograph framed over its own blur is not a blurred copy");
  assert.deepEqual(r.blurredDesigned.map((b) => b.id), ["SC1-1"]);
  assert.deepEqual(r.dark.map((d) => d.id), ["SC1-2"], "an almost black footage shot is named");
  assert.ok(designedStill({ type: "card", counter: true }));
  assert.ok(!designedStill({ type: "clip" }));
});

test("a cut is not a flicker: a jump on a shot's own edge is the next picture", () => {
  const text = [
    "frame:0 pts_time:0", "lavfi.blur=5", "lavfi.signalstats.YAVG=80",
    "frame:2 pts_time:1", "lavfi.blur=5", "lavfi.signalstats.YAVG=82",
    "frame:4 pts_time:1.8", "lavfi.blur=5", "lavfi.signalstats.YAVG=150",
    "frame:5 pts_time:2.5", "lavfi.blur=5", "lavfi.signalstats.YAVG=60",
    "frame:8 pts_time:4", "lavfi.blur=5", "lavfi.signalstats.YAVG=160",
  ].join("\n");
  const video = [{ id: "SC1-1", start: 0, end: 2, type: "clip" }, { id: "SC1-2", start: 2, end: 6, type: "clip" }];
  const r = blurAndFlicker(parsePicture(text), video);
  assert.deepEqual(r.flicker.map((f) => f.id), ["SC1-2"], "only the jump well inside a shot counts");
});

test("the Craft Ledger's targets add notes and a craft index, never a block", async () => {
  const { calibratedDoctrine, emptyLedger } = await import("../engine/src/craft-memory.mjs");
  const shots = [];
  for (let i = 0; i < 30; i += 1) shots.push({ start: i * 6, end: (i + 1) * 6, type: "clip" });
  const video = shots.map((s, i) => (i % 5 === 2 ? { ...s, counter: true } : s));
  const sfx = video.filter((v) => v.counter).map((v) => ({ token: "AUTO-IMPACT", kind: "hit", scene: v.scene, start: v.start + 0.1, end: v.start + 1.2 }));
  const master = { master: { integratedLufs: -14.2, truePeakDbtp: -1.4, loudnessRangeLu: 8, black: [] } };
  const plain = critique(timeline(video, { sfx }), master, { channels: 2 });
  assert.equal(plain.craft, undefined, "no targets, no craft section");
  const r = critique(timeline(video, { sfx }), master, { channels: 2, craft: { ...calibratedDoctrine(emptyLedger(), "history"), filmId: "f1" } });
  assert.equal(r.verdict, "pass", "craft notes never block");
  assert.ok(r.craft && r.craft.index > 0 && r.craft.index < 100, `index ${r.craft?.index}`);
  assert.equal(r.craft.filmId, "f1");
  assert.equal(r.craft.genre, "history");
  const notes = r.findings.filter((f) => f.code === "craft.below");
  assert.ok(notes.length >= 1 && notes.every((f) => f.severity === "note" && f.en.length > 10 && f.bn.length > 10));
  assert.ok(notes.some((f) => /cuts in the first 30 s/.test(f.en)), "5 cuts against the history target of 6");
});

test("a short film is a note for a voice film (the owner's recording sets its length) and a block for an idea or script film", () => {
  const shots = Array.from({ length: 6 }, (_, i) => ({ start: i * 6, end: (i + 1) * 6 }));
  const master = { master: { integratedLufs: -14.2, truePeakDbtp: -1.4, loudnessRangeLu: 8, black: [] } };
  const severity = (/** @type {any} */ evidence) => critique(timeline(shots, {}), master, { channels: 2, ...evidence }).findings.find((f) => f.code === "critic.short")?.severity;
  assert.equal(severity({}), "block", "a script film of 36 s is still too short");
  assert.equal(severity({ voiceFilm: true }), "note", "a voice film of 36 s is the owner's choice");
});

test("voice-film captions are held through the pauses, so the speech between sentences is not left without a caption", async () => {
  const { captionsForVoice, captionsFromWords } = await import("../engine/src/timeline.mjs");
  // Three sentences of a 38 s recording, a 2 s pause after each (the shape of film e0b87efb: 13% of the speech had no caption).
  const words = [];
  for (const [from, to] of [[0.4, 9], [11, 21], [23, 36.6]]) for (let t = from, n = 0; t < to; t += (to - from) / 10, n += 1) words.push({ text: n === 9 ? "end." : "word", start: t, end: t + (to - from) / 10 - 0.05 });
  const narration = [{ scene: "SC1", start: 0, end: 10, text: "a" }, { scene: "SC2", start: 10, end: 22, text: "b" }, { scene: "SC3", start: 22, end: 38, text: "c" }];
  const bare = subtitleFit(narration, captionsFromWords(words), 38);
  const held = subtitleFit(narration, captionsForVoice(words, 38), 38);
  assert.ok(held.coverage > 0.97, `held coverage ${held.coverage}`);
  assert.ok(held.coverage > bare.coverage, "holding the captions adds coverage");
  assert.ok(held.maxGap < 1, `longest hole ${held.maxGap} s`);
  assert.equal(held.overlap, 0);
});
