#!/usr/bin/env node
/**
 * The critic (M6): a film passes only when it is good, not when it is done.
 *
 * It measures what the owner's 3-minute film failed on, and what a
 * 40-million-view documentary cannot fail on, from the timeline and the
 * render's own report — shot rhythm, moving picture, designed moments, the
 * first 30 seconds, sound cues on the moments, relevance, repeats, stereo
 * picture of the sound and loud dynamic range — and returns `block` with a
 * plain English and Bengali reason for every miss.
 *
 *   node render/critic.mjs --report out/<id>.report.json [--film out/<id>.mp4] [--timeline timeline.json]
 *
 * The release gate reads the same verdict (`report.critic`), so a film that
 * fails here does not get published.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { msg } from "../engine/src/messages.mjs";

/**
 * The house standard. Numbers, not taste: each one is a failure the owner's
 * own 3-minute film showed, or a floor a documentary needs to feel edited.
 */
export const STANDARD = Object.freeze({
  /** A film under two minutes is a test, not a documentary. */
  minSeconds: 120,
  /** Average shot length: below 2 s is a stock montage, above 12 s is a slideshow. */
  avgShot: [2, 12],
  /** No shot may sit longer than this (a card or a black is measured apart). */
  maxShot: 20,
  /** At most this share of the film may be shots under 1.5 s (a burst of cuts). */
  shortShare: 0.3,
  /** At least this share of the film must be moving picture (footage or a designed move). */
  movingShare: 0.55,
  /** Designed moments (counter, kinetic line, chart, map, chapter title) per minute. */
  designedPerMinute: 1.2,
  /** The first shot may not be longer than this: the hook must turn early. */
  firstShotMax: 8,
  /** Cuts in the first 30 seconds. */
  first30Cuts: 3,
  /** Share of designed picture moments that must have a sound cue within 1.5 s. */
  cueCoverage: 0.7,
  /** Picture height, in pixels. */
  minHeight: 720,
  /** Integrated loudness window (LUFS) and true peak ceiling (dBTP). */
  lufs: [-15, -13],
  truePeak: -1,
  /** The loudness range must be more than a flat wall: the owner's film measured 1.9 LU. */
  lraMin: 3.5,
  /** Below this the film is a flat wall, not a mix: it is stopped, not merely noted. */
  lraBlock: 2,
  /** At least this share of a film's shots should be scored relevant when scores exist. */
  relevanceShare: 0.8,
  relevanceMin: 0.25,
  /** The same footage used more than this many times is a repeat. */
  repeatLimit: 3,
  /**
   * A shot whose median blur score (ffmpeg's `blurdetect`, higher = blurrier) is above this is a
   * blurred copy, not a soft-focus choice: a sharp test picture measures 4-5, a 10 px box blur 33.
   */
  blurMax: 20,
  /** Above this share of blurred shots the picture is out of focus as a whole, not once. */
  blurShare: 0.15,
  /** A jump of this much average luma between two samples inside one shot is a flicker. */
  flickerJump: 28,
  /** A whole minute with no cut at all is a held picture, not an edit (warn; two in a film is a pattern). */
  deadMinuteCuts: 1,
  /** More cuts than this inside one minute is a montage burst; past the hard limit it is blocked. */
  freneticCuts: 16,
  freneticBlock: 24,
  /** The same shot type this many times in a row is one look, not a varied film. */
  shotTypeRun: 5,
  shotTypeRunBlock: 9,
  /** A spoken film with a stretch this long holding no narration is dead air (warn). */
  quietSeconds: 45,
  /** The hook, scored 0-10 from the timeline's own picture and words (below warn/block, it is sent back). */
  hookWarn: 7,
  hookBlock: 4,
  /** The score must play under at least this share of the film. */
  scoreCoverShare: 0.6,
});

/** Moving picture types: real footage, or a still with a designed move. */
const MOVING = new Set(["clip", "live-video", "archival-video", "photo-designed", "photo-2.5D"]);

/** @typedef {{ code: string, severity: "block" | "warn" | "note", en: string, bn: string, value?: any }} Finding */

/** @param {Finding[]} findings */
export function verdictOf(findings) {
  return findings.some((f) => f.severity === "block") ? "block" : "pass";
}

/** @param {number} n @param {number} [digits] */
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * The moments the edit designed on purpose: numbers that count, kinetic lines,
 * charts, maps and chapter titles.
 * @param {any[]} video
 */
export function designedMoments(video) {
  return video.filter((v) => v.type !== "black" && (v.counter || v.kinetic || v.chart || v.map || v.chapterTitle));
}

/**
 * Cuts per whole minute, from the picture's own cut times: a minute with none
 * is a held picture, a minute with thirty is a burst. The last minute is
 * partial and is reported as such, so a film is not failed on its tail.
 * @param {any[]} video
 * @returns {{ minute: number, cuts: number, full: boolean }[]}
 */
export function cutsPerMinute(video) {
  const shots = (video ?? []).filter((v) => v.type !== "black" && Number.isFinite(Number(v.start)));
  if (!shots.length) return [];
  const end = Math.max(...shots.map((v) => Number(v.end)));
  const minutes = Math.max(1, Math.ceil(end / 60));
  const out = Array.from({ length: minutes }, (_, i) => ({ minute: i, cuts: 0, full: (i + 1) * 60 <= end + 0.001 }));
  for (const at of shots.map((v) => Number(v.start)).sort((a, b) => a - b).slice(1)) {
    out[Math.min(minutes - 1, Math.floor(at / 60))].cuts += 1;
  }
  return out;
}

/**
 * The hook in numbers, from the timeline itself (not from the plan): picture
 * changes in the first 30 s, when the title lands, designed moments in the
 * first minute, the length of the first spoken sentence, and whether every
 * hook shot turns before it settles. 0-10, so a weak opening is sent back.
 * @param {any} timeline
 */
export function hookReport(timeline) {
  const video = (timeline?.video ?? []).filter((/** @type {any} */ v) => v.type !== "black");
  const hook = video.filter((/** @type {any} */ v) => Number(v.start) < 30);
  const beats = hook.length;
  const titled = video.find((/** @type {any} */ v) => String(v.title ?? "").trim());
  const titleAt = titled ? round(Number(titled.start), 1) : null;
  const designed = designedMoments(video).filter((/** @type {any} */ v) => Number(v.start) < 60).length;
  const first = (timeline?.narration ?? []).find((/** @type {any} */ n) => String(n.text ?? "").replace(/\[[^\]]*\]/g, "").trim());
  const sentence = first ? String(first.text).replace(/\[[^\]]*\]/g, "").trim().split(/(?<=[.!?])\s+/)[0] : "";
  const firstSentenceWords = sentence ? sentence.split(/\s+/).filter(Boolean).length : 0;
  let score = 0;
  score += Math.min(4, (beats / 6) * 4);
  score += titleAt !== null && titleAt <= 40 ? 2 : 0;
  score += Math.min(2, designed);
  score += firstSentenceWords > 0 && firstSentenceWords <= 15 ? 1 : 0;
  score += hook.length > 0 && hook.every((/** @type {any} */ v) => Number(v.end) - Number(v.start) <= 8.5) ? 1 : 0;
  return { score: round(score, 1), beats, titleAt, designedFirstMinute: designed, firstSentenceWords };
}

/**
 * Whether the music follows the chapters: every chapter's first shot is
 * marked by a new cue within 1.5 s, or a riser that lands on it, and the
 * score plays under most of the film. Measured from the timeline's own music
 * and sound events, so the critic blocks on the real edit, not on a promise.
 * @param {any} timeline
 */
export function chapterMusic(timeline) {
  const video = (timeline?.video ?? []).filter((/** @type {any} */ v) => v.type !== "black");
  const music = [...(timeline?.music ?? [])].sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.start) - Number(b.start));
  const turns = video.filter((/** @type {any} */ v) => v.chapterTitle).map((/** @type {any} */ v) => ({ at: round(Number(v.start), 1), title: String(v.chapterTitle) }));
  // A mark is a *new* cue: the same cue continuing (or a segment boundary inside one cue) is not a change.
  const changes = music.filter((/** @type {any} */ m, /** @type {number} */ i) => i === 0 || m.cue !== music[i - 1].cue || Number(m.start) - Number(music[i - 1].end) > 0.5).map((/** @type {any} */ m) => Number(m.start));
  const landings = (timeline?.sfx ?? []).filter((/** @type {any} */ s) => s.token === "AUTO-RISER").map((/** @type {any} */ s) => Number(s.end));
  const unmarked = turns.filter((t) => !changes.some((c) => Math.abs(c - t.at) < 1.5) && !landings.some((l) => Math.abs(l - t.at) < 1.5));
  const seconds = Number(timeline?.durationSeconds ?? video[video.length - 1]?.end ?? 0);
  const covered = music.reduce((n, /** @type {any} */ m) => n + Math.max(0, Number(m.end) - Number(m.start)), 0);
  return { cues: music.length, turns: turns.length, unmarked, coveredShare: seconds ? round(covered / seconds, 2) : 0 };
}

/**
 * Read a timeline and the render's report and return every finding.
 * @param {any} timeline
 * @param {any} report
 * @param {{ channels?: number | null, relevance?: number[] | null, freezes?: { start: number, end: number }[] | null, blurred?: { id: string, value: number }[] | null, flicker?: { at: number }[] | null }} [evidence]
 * @returns {{ verdict: "pass" | "block", findings: Finding[], measures: Record<string, any> }}
 */
export function critique(timeline, report = {}, evidence = {}) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {Finding} */ f) => findings.push(f);
  const video = (timeline?.video ?? []).filter((/** @type {any} */ v) => v.type !== "black");
  const seconds = Number(timeline?.durationSeconds ?? report?.durationSeconds ?? 0);
  const fps = Number(timeline?.fps ?? report?.fps ?? 30);

  // --- rhythm -----------------------------------------------------------
  const lengths = video.map((/** @type {any} */ v) => Number(v.end) - Number(v.start)).filter((n) => n > 0);
  const total = lengths.reduce((a, b) => a + b, 0);
  const avg = lengths.length ? total / lengths.length : 0;
  const longest = lengths.length ? Math.max(...lengths) : 0;
  const shortShare = total ? lengths.filter((n) => n < 1.5).reduce((a, b) => a + b, 0) / total : 0;
  if (seconds && seconds < STANDARD.minSeconds) {
    add({ ...msg("critic.short", { value: round(seconds, 1), min: STANDARD.minSeconds }), severity: "block", value: round(seconds, 1) });
  }
  if (lengths.length && (avg < STANDARD.avgShot[0] || avg > STANDARD.avgShot[1])) {
    add({ ...msg("critic.shotLength", { value: round(avg), low: STANDARD.avgShot[0], high: STANDARD.avgShot[1] }), severity: "block", value: round(avg) });
  }
  if (longest > STANDARD.maxShot) {
    add({ ...msg("critic.longShot", { value: round(longest), max: STANDARD.maxShot }), severity: "block", value: round(longest) });
  }
  if (seconds > 60 && shortShare > STANDARD.shortShare) {
    add({ ...msg("critic.burst", { value: round(shortShare * 100, 0) }), severity: "block", value: round(shortShare * 100, 0) });
  }

  // --- picture ----------------------------------------------------------
  const moving = video.filter((/** @type {any} */ v) => MOVING.has(String(v.type)) || (v.type === "card" && v.motion === "push"));
  const movingShare = total ? moving.reduce((/** @type {number} */ a, /** @type {any} */ v) => a + (Number(v.end) - Number(v.start)), 0) / total : 0;
  if (total && movingShare < STANDARD.movingShare) {
    add({ ...msg("critic.still", { value: round(movingShare * 100, 0), min: round(STANDARD.movingShare * 100, 0) }), severity: "block", value: round(movingShare * 100, 0) });
  }
  const width = Number(timeline?.width ?? report?.width ?? 0);
  const height = Number(timeline?.height ?? report?.height ?? 0);
  if (height && height < STANDARD.minHeight) {
    add({ ...msg("critic.resolution", { width, height, min: STANDARD.minHeight }), severity: "warn", value: `${width}x${height}` });
  }

  // --- design -----------------------------------------------------------
  const designed = designedMoments(video);
  const perMinute = seconds ? (designed.length * 60) / seconds : 0;
  if (seconds >= 30 && perMinute < STANDARD.designedPerMinute) {
    add({ ...msg("critic.designed", { value: round(perMinute, 1), need: STANDARD.designedPerMinute }), severity: "block", value: round(perMinute, 1) });
  }
  const sounds = (timeline?.sfx ?? []).filter((/** @type {any} */ s) => s.kind !== "bed");
  const covered = designed.filter((/** @type {any} */ v) => sounds.some((/** @type {any} */ s) => Math.abs(Number(s.start) - Number(v.start)) <= 1.5 || (Number(s.start) <= Number(v.start) + 0.2 && Number(s.end) >= Number(v.start))));
  const coverage = designed.length ? covered.length / designed.length : 1;
  if (designed.length && coverage < STANDARD.cueCoverage) {
    add({ ...msg("critic.cues", { value: round(coverage * 100, 0), target: round(STANDARD.cueCoverage * 100, 0) }), severity: "block", value: round(coverage * 100, 0) });
  }

  // --- rhythm, minute by minute ------------------------------------------
  const minutes = cutsPerMinute(timeline?.video ?? []);
  const dead = minutes.filter((m) => m.full && m.cuts < STANDARD.deadMinuteCuts);
  if (seconds > 120 && dead.length) {
    add({ ...msg("critic.deadMinute", { count: dead.length, at: dead.slice(0, 3).map((m) => `${m.minute + 1}`).join(", ") }), severity: "warn", value: dead.length });
  }
  const busiest = minutes.reduce((top, m) => Math.max(top, m.cuts), 0);
  if (busiest > STANDARD.freneticCuts) {
    add({ ...msg("critic.frenetic", { value: busiest, max: STANDARD.freneticCuts }), severity: busiest > STANDARD.freneticBlock ? "block" : "warn", value: busiest });
  }

  // --- variety: one look is not a film ----------------------------------
  const typed = video.filter((/** @type {any} */ v) => v.shotType);
  let typeRun = 0;
  let typeRunOf = "";
  let run = 0;
  let previousType = "";
  for (const v of typed) {
    run = v.shotType === previousType ? run + 1 : 1;
    previousType = String(v.shotType);
    if (run > typeRun) { typeRun = run; typeRunOf = previousType; }
  }
  if (typed.length >= video.length * 0.6 && typeRun > STANDARD.shotTypeRun) {
    add({ ...msg("critic.variety", { count: typeRun, type: typeRunOf, max: STANDARD.shotTypeRun }), severity: typeRun > STANDARD.shotTypeRunBlock ? "block" : "warn", value: typeRun });
  }

  // --- the hook ---------------------------------------------------------
  const hook = hookReport(timeline);
  // A wordless film (a recitation) is judged on picture alone: the spoken hook needs words to measure.
  if (seconds >= 120 && hook.firstSentenceWords > 0 && hook.score < STANDARD.hookWarn) {
    add({ ...msg("critic.hook", { score: hook.score, beats: hook.beats, titleAt: hook.titleAt ?? "-", designed: hook.designedFirstMinute, words: hook.firstSentenceWords }), severity: hook.score < STANDARD.hookBlock ? "block" : "warn", value: hook.score });
  }
  const firstShot = lengths.length ? lengths[0] : 0;
  if (firstShot > STANDARD.firstShotMax) {
    add({ ...msg("critic.firstShot", { value: round(firstShot), max: STANDARD.firstShotMax }), severity: "block", value: round(firstShot) });
  }
  const cuts30 = video.filter((/** @type {any} */ v) => Number(v.end) > 0 && Number(v.end) <= 30).length;
  const moments30 = designed.filter((/** @type {any} */ v) => Number(v.start) < 30).length;
  if (seconds > 30 && (cuts30 < STANDARD.first30Cuts || moments30 < 1)) {
    add({ ...msg("critic.opening", { cuts: cuts30, moments: moments30, need: STANDARD.first30Cuts }), severity: "block", value: { cuts: cuts30, moments: moments30 } });
  }

  // --- relevance and repeats --------------------------------------------
  const scores = (evidence.relevance ?? []).filter((n) => Number.isFinite(n));
  if (scores.length && scores.length >= video.length * 0.5) {
    const weak = scores.filter((n) => n < STANDARD.relevanceMin).length;
    const share = 1 - weak / scores.length;
    if (share < STANDARD.relevanceShare) {
      add({ ...msg("critic.relevance", { value: round(share * 100, 0), floor: round(STANDARD.relevanceShare * 100, 0) }), severity: "block", value: round(share * 100, 0) });
    }
  }
  // --- the music follows the chapters -----------------------------------
  const score = chapterMusic(timeline);
  if (score.turns && seconds > 120 && score.unmarked.length) {
    add({ ...msg("critic.chapterMusic", { count: score.unmarked.length, at: score.unmarked.slice(0, 3).map((u) => `${u.at}`).join(", ") }), severity: "block", value: score.unmarked.length });
  }
  if (score.cues && seconds > 120 && score.coveredShare < STANDARD.scoreCoverShare) {
    add({ ...msg("critic.scoreGap", { value: Math.round(score.coveredShare * 100), min: Math.round(STANDARD.scoreCoverShare * 100) }), severity: "warn", value: score.coveredShare });
  }

  // --- narration: a spoken film may not go silent for a stretch ---------
  const spoken = [...(timeline?.narration ?? [])].filter((/** @type {any} */ n) => String(n.text ?? "").trim()).sort((/** @type {any} */ a, /** @type {any} */ b) => Number(a.start) - Number(b.start));
  let longestQuiet = 0;
  for (let i = 1; i < spoken.length; i += 1) longestQuiet = Math.max(longestQuiet, Number(spoken[i].start) - Number(spoken[i - 1].end));
  if (spoken.length && seconds > 120 && longestQuiet > STANDARD.quietSeconds) {
    add({ ...msg("critic.quiet", { value: round(longestQuiet, 1), max: STANDARD.quietSeconds }), severity: "warn", value: round(longestQuiet, 1) });
  }

  /** @type {Map<string, number>} */
  const uses = new Map();
  for (const v of video) if (v.url) uses.set(String(v.url), (uses.get(String(v.url)) ?? 0) + 1);
  const repeated = [...uses].filter(([, n]) => n > STANDARD.repeatLimit);
  if (repeated.length) {
    add({ ...msg("critic.repeats", { count: repeated.length, limit: STANDARD.repeatLimit }), severity: "warn", value: repeated.length });
  }

  // --- the sound --------------------------------------------------------
  const m = report?.master ?? {};
  const lufs = Number(m.integratedLufs);
  if (Number.isFinite(lufs) && (lufs < STANDARD.lufs[0] || lufs > STANDARD.lufs[1])) {
    add({ ...msg("critic.loudness", { value: lufs, low: STANDARD.lufs[0], high: STANDARD.lufs[1] }), severity: "block", value: lufs });
  }
  const peak = Number(m.truePeakDbtp);
  if (Number.isFinite(peak) && peak > STANDARD.truePeak) {
    add({ ...msg("critic.peak", { value: peak, max: STANDARD.truePeak }), severity: "block", value: peak });
  }
  const lra = Number(m.loudnessRangeLu);
  if (Number.isFinite(lra) && seconds > 60 && lra < STANDARD.lraMin) {
    add({ ...msg("critic.flat", { value: lra, min: STANDARD.lraMin }), severity: lra < STANDARD.lraBlock ? "block" : "warn", value: lra });
  }
  const channels = Number(evidence.channels);
  if (Number.isFinite(channels) && channels === 1 && seconds > 60) {
    add({ ...msg("critic.mono"), severity: "warn", value: channels });
  }
  const black = (report?.master?.black ?? []).length;
  if (black) {
    add({ ...msg("critic.black", { count: black }), severity: "block", value: black });
  }
  const freezes = (evidence.freezes ?? []).filter((f) => f.end - f.start >= 2);
  if (freezes.length) {
    add({ ...msg("critic.frozen", { count: freezes.length }), severity: "warn", value: freezes.length });
  }
  // Blurred copies and flicker, measured on the picture itself (measurePicture), not declared.
  const blurred = (evidence.blurred ?? []);
  if (blurred.length) {
    const share = video.length ? blurred.length / video.length : 0;
    add({ ...msg("critic.blurred", { count: blurred.length, share: round(share * 100, 0) }), severity: share > STANDARD.blurShare ? "block" : "warn", value: blurred.length });
  }
  const flickers = (evidence.flicker ?? []);
  if (flickers.length) {
    add({ ...msg("critic.flicker", { count: flickers.length }), severity: flickers.length > 2 ? "block" : "warn", value: flickers.length });
  }

  const measures = {
    seconds: round(seconds, 1), shots: lengths.length, avgShot: round(avg), longestShot: round(longest),
    shortShare: round(shortShare, 3), movingShare: round(movingShare, 3), designedMoments: designed.length,
    designedPerMinute: round(perMinute, 2), cueCoverage: round(coverage, 3), firstShot: round(firstShot),
    cutsIn30: cuts30, momentsIn30: moments30, lufs: Number.isFinite(lufs) ? lufs : null,
    truePeak: Number.isFinite(peak) ? peak : null, lra: Number.isFinite(lra) ? lra : null,
    channels: Number.isFinite(channels) ? channels : null, fps,
    blurredShots: blurred.length, flicker: flickers.length,
    hook, hookScore: hook.score, busiestMinute: busiest, deadMinutes: dead.length,
    longestTypeRun: typeRun, chapterTurns: score.turns, unmarkedTurns: score.unmarked.length,
    scoreCoveredShare: score.coveredShare, longestQuiet: round(longestQuiet, 1),
  };
  return { verdict: verdictOf(findings), findings, measures };
}

/**
 * Samples of the picture from ffmpeg's metadata print: time, blur score
 * (higher is blurrier) and average luma.
 * @param {string} text
 * @returns {{ t: number, blur: number, luma: number }[]}
 */
export function parsePicture(text) {
  /** @type {{ t: number, blur: number, luma: number }[]} */
  const out = [];
  /** @type {{ t: number, blur: number, luma: number } | null} */
  let cur = null;
  for (const line of text.split("\n")) {
    const f = /pts_time:([\d.]+)/.exec(line);
    if (f) { if (cur) out.push(cur); cur = { t: Number(f[1]), blur: NaN, luma: NaN }; continue; }
    const b = /lavfi\.blur=([\d.]+)/.exec(line);
    if (b && cur) cur.blur = Number(b[1]);
    const y = /signalstats\.YAVG=([\d.]+)/.exec(line);
    if (y && cur) cur.luma = Number(y[1]);
  }
  if (cur) out.push(cur);
  return out;
}

/** @param {number[]} xs */
function median(xs) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Blurred shots and flicker, from the samples and the shot times. A shot is
 * blurred when its median blur score passes the standard (a soft background is
 * not a blurred copy: the median, not the worst frame); flicker is a jump of
 * average luma inside one shot, so a cut into a dark scene is not counted.
 * @param {{ t: number, blur: number, luma: number }[]} samples @param {any[]} video @param {{ blurMax?: number, flickerJump?: number }} [o]
 */
export function blurAndFlicker(samples, video, o = {}) {
  const blurMax = o.blurMax ?? STANDARD.blurMax;
  const flickerJump = o.flickerJump ?? STANDARD.flickerJump;
  const shots = (video ?? []).filter((v) => v.type !== "black");
  /** @type {Map<string, { id: string, start: number, end: number, blur: number[], luma: { t: number, y: number }[] }>} */
  const byShot = new Map();
  for (const s of shots) byShot.set(String(s.id), { id: String(s.id), start: Number(s.start), end: Number(s.end), blur: [], luma: [] });
  for (const sample of samples) {
    const shot = shots.find((/** @type {any} */ v) => sample.t >= Number(v.start) && sample.t < Number(v.end));
    if (!shot) continue;
    const acc = byShot.get(String(shot.id));
    if (!acc) continue;
    if (Number.isFinite(sample.blur)) acc.blur.push(sample.blur);
    if (Number.isFinite(sample.luma)) acc.luma.push({ t: sample.t, y: sample.luma });
  }
  /** @type {{ id: string, start: number, end: number, value: number }[]} */
  const blurred = [];
  /** @type {{ id: string, at: number, from: number, to: number }[]} */
  const flicker = [];
  for (const acc of byShot.values()) {
    if (acc.blur.length) {
      const value = median(acc.blur);
      if (Number.isFinite(value) && value > blurMax) blurred.push({ id: acc.id, start: acc.start, end: acc.end, value: round(value, 1) });
    }
    for (let k = 1; k < acc.luma.length; k += 1) {
      const jump = Math.abs(acc.luma[k].y - acc.luma[k - 1].y);
      if (jump > flickerJump) flicker.push({ id: acc.id, at: round(acc.luma[k].t, 2), from: round(acc.luma[k - 1].y, 1), to: round(acc.luma[k].y, 1) });
    }
  }
  return { blurred, flicker, samples: samples.length, shots: shots.length };
}

/**
 * Measure the picture of a finished film: blur and flicker, one pass at two
 * frames a second (the samples land inside their own shot).
 * @param {string} file @param {any} timeline @param {{ ffmpeg?: string, blurMax?: number, flickerJump?: number }} [o]
 */
export async function measurePicture(file, timeline, o = {}) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const text = await new Promise((ok) => {
    const p = spawn(ffmpeg, ["-hide_banner", "-nostats", "-i", file, "-vf", "fps=2,scale=320:-2,blurdetect,signalstats,metadata=print:file=-", "-an", "-f", "null", "-"], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("error", () => ok(""));
    p.on("close", () => ok(out));
  });
  return blurAndFlicker(parsePicture(text), timeline?.video ?? [], o);
}

/**
 * Measure a finished file itself: its channels, frozen picture and black
 * picture, from the file (not from the plan).
 * @param {string} file @param {{ ffmpeg?: string, ffprobe?: string, freezes?: boolean }} [o]
 */
export async function measureFilm(file, o = {}) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const ffprobe = o.ffprobe ?? "ffprobe";
  const channels = await new Promise((ok) => {
    const p = spawn(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "default=nw=1:nk=1", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("error", () => ok(null));
    p.on("close", () => ok(Number(out.trim()) || null));
  });
  const freezes = o.freezes === false ? [] : await new Promise((ok) => {
    const p = spawn(ffmpeg, ["-nostats", "-hide_banner", "-i", file, "-vf", "freezedetect=n=-60dB:d=2", "-map", "0:v", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => ok([]));
    p.on("close", () => {
      const starts = [...err.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      const ends = [...err.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      ok(starts.map((start, i) => ({ start, end: ends[i] ?? start })));
    });
  });
  return { channels, freezes };
}

/** One line per finding, both languages; also the decision line. */
export function reportCritic(result) {
  const lines = result.findings.map((f) => `${f.severity.toUpperCase()} ${f.code}: ${f.en}\n${f.bn}`);
  const m = result.measures;
  lines.push(`Critic: ${result.verdict.toUpperCase()} — ${m.shots} shots, average ${m.avgShot} s, ${Math.round(m.movingShare * 100)}% moving, ${m.designedPerMinute} designed moments a minute, ${m.lufs} LUFS, LRA ${m.lra} LU, ${m.channels} channel(s).`);
  lines.push(`ক্রিটিক: ${result.verdict === "pass" ? "পাস" : "ব্লক"} — ${m.shots}টি শট, গড় ${m.avgShot} সেকেন্ড, ${Math.round(m.movingShare * 100)}% নড়ছে, মিনিটে ${m.designedPerMinute}টি ডিজাইন করা মুহূর্ত, ${m.lufs} LUFS, LRA ${m.lra} LU, ${m.channels} চ্যানেল।`);
  lines.push(`Hook ${m.hookScore}/10 — ${m.hook.beats} picture changes in the first 30 s, title ${m.hook.titleAt === null ? "none" : `at ${m.hook.titleAt} s`}, ${m.hook.designedFirstMinute} designed moment(s) in the first minute, first sentence ${m.hook.firstSentenceWords} word(s).`);
  lines.push(`হুক ${m.hookScore}/১০ — প্রথম ৩০ সেকেন্ডে ${m.hook.beats}টি ছবি-বদল, টাইটেল ${m.hook.titleAt === null ? "নেই" : `${m.hook.titleAt} সেকেন্ডে`}, প্রথম মিনিটে ${m.hook.designedFirstMinute}টি ডিজাইন করা মুহূর্ত, প্রথম বাক্য ${m.hook.firstSentenceWords} শব্দের।`);
  lines.push(`Rhythm: busiest minute ${m.busiestMinute} cuts, ${m.deadMinutes} held minute(s); music marks ${m.chapterTurns - m.unmarkedTurns} of ${m.chapterTurns} chapter turn(s), score under ${Math.round((m.scoreCoveredShare ?? 0) * 100)}% of the film; longest quiet ${m.longestQuiet} s.`);
  lines.push(`ছন্দ: ব্যস্ততম মিনিটে ${m.busiestMinute}টি কাট, ${m.deadMinutes}টি মিনিট কাট ছাড়া; মিউজিক ${m.chapterTurns}টি চ্যাপ্টার-টার্নের ${m.chapterTurns - m.unmarkedTurns}টি চিহ্নিত করেছে, স্কোর ফিল্মের ${Math.round((m.scoreCoveredShare ?? 0) * 100)}% জুড়ে; সবচেয়ে দীর্ঘ নীরবতা ${m.longestQuiet} সেকেন্ড।`);
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { report: { type: "string" }, film: { type: "string" }, timeline: { type: "string" } } });
  if (!values.report && !values.timeline) { console.error("Give --report <report.json> and/or --timeline <timeline.json>."); process.exit(2); }
  const report = values.report && existsSync(values.report) ? JSON.parse(readFileSync(values.report, "utf8")) : {};
  const timeline = values.timeline && existsSync(values.timeline) ? JSON.parse(readFileSync(values.timeline, "utf8")) : report.timeline ?? null;
  if (!timeline) { console.error("No timeline: pass --timeline or use a report that carries one."); process.exit(2); }
  const evidence = values.film && existsSync(values.film) ? await measureFilm(values.film) : {};
  const result = critique(timeline, report, evidence);
  console.log(reportCritic(result));
  if (values.report) writeFileSync(values.report.replace(/\.report\.json$/, "") + ".critic.json", JSON.stringify(result, null, 1));
  process.exit(result.verdict === "block" ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
