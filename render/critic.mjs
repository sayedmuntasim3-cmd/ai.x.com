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
import { placeholderTokens } from "../engine/src/claim-values.mjs";
import { METRICS, craftReport } from "../engine/src/craft-memory.mjs";

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
  /**
   * A still's own soft background (a photograph framed over a blurred copy of itself, a card's backdrop) is
   * design, not a blurred copy: it is measured against this higher score and never counted in the blur share.
   */
  blurMaxDesigned: 32,
  /** A non-designed shot this dark (median luma, 0-255) is unusable picture, not a night scene. */
  darkLuma: 12,
  /** Share of the narrated scenes that must actually carry a voice in the film. */
  narrationCoverage: 0.98,
  /** Captions must cover this share of the narrated time, and never leave a hole longer than the gap. */
  subtitleCoverage: 0.95,
  subtitleGap: 3,
  /** The same footage must not return inside this window (seconds); more repeats than the limit is a loop. */
  repeatWindow: 600,
  repeatWindowMax: 3,
  /** Share of the transitions an edit plan asked for that the film may lose before it blocks. */
  transitionMiss: 0.15,
});

/** A shot that needs a picture to draw (a card draws itself). */
const PICTURED = new Set(["clip", "live-video", "archival-video", "photo-designed", "photo-2.5D"]);

/** A shot whose softness is design (a still, a card), not a blurred copy of footage. @param {any} v */
export function designedStill(v) {
  return Boolean(v.still || v.chart || v.map || v.counter || v.kinetic || v.chapterTitle || String(v.type) === "card");
}

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
 * How the captions sit on the speech: the share of narrated time a caption is on
 * screen, the longest stretch of speech with no caption, and the captions that
 * overlap another or run past the end of the film. A film whose captions drift
 * off the voice reads as broken, however good the words are.
 * @param {{ start: number, end: number }[]} narration @param {{ start: number, end: number }[]} captions @param {number} seconds
 * @returns {{ coverage: number, maxGap: number, overlap: number, beyond: number }}
 */
export function subtitleFit(narration, captions, seconds) {
  const spans = (narration ?? []).filter((n) => Number(n.end) > Number(n.start)).sort((a, b) => Number(a.start) - Number(b.start));
  const cues = (captions ?? []).filter((c) => Number(c.end) > Number(c.start)).sort((a, b) => Number(a.start) - Number(b.start));
  const totalSpeech = spans.reduce((/** @type {number} */ a, /** @type {any} */ n) => a + (Number(n.end) - Number(n.start)), 0);
  let covered = 0;
  let maxGap = 0;
  for (const s of spans) {
    const from = Number(s.start), to = Number(s.end);
    let reach = from;
    for (const c of cues) {
      const a = Math.max(Number(c.start), from), b = Math.min(Number(c.end), to);
      if (b <= a) continue;
      if (a > reach) maxGap = Math.max(maxGap, a - reach);
      if (b > reach) { covered += b - Math.max(a, reach); reach = b; }
    }
    if (to > reach) maxGap = Math.max(maxGap, to - reach);
  }
  // A caption that starts on top of the one before it, or runs past the film, is out of step.
  let overlap = 0;
  for (let i = 1; i < cues.length; i += 1) if (Number(cues[i].start) < Number(cues[i - 1].end) - 0.05) overlap += 1;
  const beyond = seconds > 0 ? cues.filter((c) => Number(c.start) < -0.01 || Number(c.end) > seconds + 0.5).length : 0;
  return { coverage: totalSpeech ? Math.min(1, covered / totalSpeech) : 1, maxGap: Math.round(maxGap * 10) / 10, overlap, beyond };
}

/**
 * Read a timeline and the render's report and return every finding.
 * @param {any} timeline
 * @param {any} report
 * @param {{ channels?: number | null, relevance?: number[] | null, freezes?: { start: number, end: number }[] | null, blurred?: { id: string, value: number }[] | null, blurredDesigned?: { id: string, value: number }[] | null, flicker?: { at: number }[] | null, dark?: { id: string, value: number }[] | null, voiced?: string[] | null, edits?: any[] | null, craft?: any }} [evidence]
 *   craft: the Craft Ledger's calibrated targets for this genre (craft-memory.mjs calibratedDoctrine): a note per
 *   measure short of its target and the craft index 0-100 in `craft`. Notes only: the floor above decides blocks.
 * @returns {{ verdict: "pass" | "block", findings: Finding[], measures: Record<string, any>, craft?: ReturnType<typeof craftReport> }}
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

  // --- the hook ---------------------------------------------------------
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

  // --- the words, the pictures and the edit -----------------------------
  const narr = Array.isArray(timeline?.narration) ? timeline.narration : [];
  const captions = Array.isArray(timeline?.captions) ? timeline.captions : [];
  // A placeholder is never spoken or shown: an unfilled one is a hole in the film.
  const tokens = [...narr.map((/** @type {any} */ n) => n.text), ...captions.map((/** @type {any} */ c) => c.text), ...video.map((/** @type {any} */ v) => v.text)]
    .flatMap((text) => placeholderTokens(String(text ?? "")));
  if (tokens.length) {
    add({ ...msg("critic.unresolved", { count: tokens.length, tokens: [...new Set(tokens)].slice(0, 4).join(", ") }), severity: "block", value: tokens.length });
  }
  // A narrated scene whose voice never reached the film is silent, however good its plan was.
  const narratedScenes = [...new Set(narr.map((/** @type {any} */ n) => n.scene).filter(Boolean).map(String))];
  const voiced = Array.isArray(evidence.voiced) ? new Set(evidence.voiced.map(String)) : null;
  const unvoiced = voiced ? narratedScenes.filter((sc) => !voiced.has(sc)) : [];
  const narrationCoverage = narratedScenes.length ? 1 - unvoiced.length / narratedScenes.length : 1;
  if (unvoiced.length) {
    add({ ...msg("critic.narration", { count: unvoiced.length, value: round(narrationCoverage * 100, 0), scenes: unvoiced.slice(0, 5).join(", ") }), severity: "block", value: round(narrationCoverage * 100, 0) });
  }
  // Subtitles: on screen over the speech, no long hole, never on top of each other or past the end.
  const subs = subtitleFit(narr, captions, seconds);
  if (narratedScenes.length && captions.length && (subs.coverage < STANDARD.subtitleCoverage || subs.maxGap > STANDARD.subtitleGap)) {
    add({ ...msg("critic.subtitles", { value: round(subs.coverage * 100, 0), gap: round(subs.maxGap, 1), min: round(STANDARD.subtitleCoverage * 100, 0), max: STANDARD.subtitleGap }), severity: "block", value: round(subs.coverage * 100, 0) });
  }
  if (subs.overlap + subs.beyond > 0) {
    add({ ...msg("critic.subtitleTime", { count: subs.overlap + subs.beyond }), severity: "block", value: subs.overlap + subs.beyond });
  }
  // The same footage returning inside the window is a loop the viewer notices.
  /** @type {Map<string, number[]>} */
  const at = new Map();
  for (const v of video) if (v.url) { const k = String(v.url); at.set(k, [...(at.get(k) ?? []), Number(v.start)]); }
  let within = 0;
  for (const starts of at.values()) {
    const s = [...starts].sort((/** @type {number} */ a, /** @type {number} */ b) => a - b);
    for (let k = 1; k < s.length; k += 1) if (s[k] - s[k - 1] < STANDARD.repeatWindow) within += 1;
  }
  if (within) {
    add({ ...msg("critic.repeatWindow", { count: within, window: STANDARD.repeatWindow }), severity: within > STANDARD.repeatWindowMax ? "block" : "warn", value: within });
  }
  // A picture shot with no media to draw is a hole, not a style.
  const holes = video.filter((/** @type {any} */ v) => PICTURED.has(String(v.type)) && !v.url);
  if (holes.length) add({ ...msg("critic.media", { count: holes.length }), severity: "block", value: holes.length });
  // What the edit plan asked for must be in the film: a transition the timeline lost is a silent change of edit.
  /** @type {{ scene: string, want: string }[]} */
  const required = [];
  for (const plan of evidence.edits ?? []) for (const s of plan?.scenes ?? []) if (s?.transition && s.transition !== "cut") required.push({ scene: String(s.scene), want: String(s.transition) });
  const lost = required.filter((r) => {
    const first = video.find((/** @type {any} */ v) => String(v.scene) === r.scene);
    return !first || String(first.transition ?? "") !== r.want;
  });
  if (lost.length) {
    add({ ...msg("critic.transition", { count: lost.length, required: required.length }), severity: lost.length / required.length > STANDARD.transitionMiss ? "block" : "warn", value: lost.length });
  }
  // A dark non-designed shot is unusable picture; a designed shot's soft backdrop is not.
  const dark = evidence.dark ?? [];
  if (dark.length) add({ ...msg("critic.dark", { count: dark.length }), severity: "warn", value: dark.length });

  const measures = {
    seconds: round(seconds, 1), shots: lengths.length, avgShot: round(avg), longestShot: round(longest),
    shortShare: round(shortShare, 3), movingShare: round(movingShare, 3), designedMoments: designed.length,
    designedPerMinute: round(perMinute, 2), cueCoverage: round(coverage, 3), firstShot: round(firstShot),
    cutsIn30: cuts30, momentsIn30: moments30, lufs: Number.isFinite(lufs) ? lufs : null,
    truePeak: Number.isFinite(peak) ? peak : null, lra: Number.isFinite(lra) ? lra : null,
    channels: Number.isFinite(channels) ? channels : null, fps,
    blurredShots: blurred.length, flicker: flickers.length,
    blurredDesigned: (evidence.blurredDesigned ?? []).length, darkShots: dark.length,
    narrationCoverage: round(narrationCoverage, 3),
    subtitles: { coverage: round(subs.coverage, 3), maxGap: round(subs.maxGap, 1), overlap: subs.overlap, beyond: subs.beyond },
    repeatsInWindow: within, missingMedia: holes.length, transitionsRequired: required.length, transitionsMissing: lost.length,
  };
  if (!evidence.craft?.targets) return { verdict: verdictOf(findings), findings, measures };
  const craft = craftReport(measures, evidence.craft);
  /** @param {any} v */
  const shown = (v) => (Array.isArray(v) ? `${v[0]}-${v[1]}` : String(v));
  for (const b of craft.below) {
    const spec = METRICS[/** @type {keyof typeof METRICS} */ (b.metric)];
    add({ ...msg("craft.below", { metricEn: spec.en, metricBn: spec.bn, value: b.value, target: shown(b.target), source: b.source }), code: "craft.below", severity: "note", value: b.value });
  }
  return { verdict: verdictOf(findings), findings, measures, craft };
}

/**
 * The question the critic's eyes answer about one shot: does this picture show what the viewer hears?
 * Strict on the film's world (another country's people, money or streets is a miss), lenient on
 * documentary craft (a clear visual metaphor for an abstract line is a fit).
 * @param {string} sentence the sentence heard over the shot @param {{ country?: string, city?: string, currency?: string, era?: string, demonym?: string }} [world] @param {string} [heard] the part of it under this picture
 */
export function pictureQuestion(sentence, world = {}, heard = "") {
  const where = [world.city, world.country].filter(Boolean).join(", ");
  const over = heard && heard !== sentence ? heard : sentence;
  return [
    `You check pictures for a documentary${where ? ` set in ${where}` : ""}${world.era ? `, ${world.era}` : ""}${world.currency ? `, money in ${world.currency}` : ""}.`,
    `The narrator says, over this picture: "${String(over).slice(0, 300)}"${over !== sentence ? ` (from the sentence: "${String(sentence).slice(0, 300)}")` : ""}`,
    "Would a viewer hearing that line accept this picture as showing it? It fits when it shows the thing, place or action said, or a clear visual image of an abstract line (a clock for time passing, hands searching files for 'no record').",
    `It does not fit when it shows something unrelated, a picture of a different thing with the same word, a non-${world.demonym || "local"} person or another country's money or streets, a cartoon, or text and logos that are not the subject.`,
    'Answer only JSON: {"fits": true or false, "sees": "what the picture shows, 10 words or fewer", "why": "8 words or fewer"}',
  ].join("\n");
}

/** The eyes' answer as data; null when it is not readable. @param {string} text */
export function parseFit(text) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ""));
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    if (typeof j.fits !== "boolean") return null;
    return { fits: j.fits, sees: String(j.sees ?? "").slice(0, 120), why: String(j.why ?? "").slice(0, 120) };
  } catch {
    return null;
  }
}

/**
 * The critic's per-shot check: the picture against its sentence, by free eyes (a model that reads
 * images). A failed or unreadable look is `fits: null` (unknown), never a pass.
 * @param {(question: string, imageUrl: string) => Promise<string>} look
 * @param {{ sentence: string, heard?: string, imageUrl: string, world?: any }} shot
 * @returns {Promise<{ fits: boolean | null, sees: string, why: string }>}
 */
export async function judgePicture(look, shot) {
  try {
    const fit = parseFit(await look(pictureQuestion(shot.sentence, shot.world, shot.heard), shot.imageUrl));
    return fit ?? { fits: null, sees: "", why: "unreadable answer" };
  } catch (e) {
    return { fits: null, sees: "", why: String(/** @type {any} */ (e)?.message ?? e).slice(0, 120) };
  }
}

/** The critic's reading of candidates by what their makers wrote about them (stock tags), for a text brain. */
export const CHOICE_SYSTEM = [
  "You check pictures for a documentary. For each shot you get the line the narrator says over it and numbered candidate clips, each described by its stock-library tags.",
  "List the numbers of the candidates a viewer hearing that line would accept as showing it: the thing, place or action said, or a clear visual image of an abstract line (a clock for time passing, hands searching files for 'no record').",
  "Refuse a candidate whose tags show something unrelated, the same word with another meaning (a 'bill' that is a bird or a person named Bill), a wedding, festival, religious rite or tourist sight the line does not speak of, people, money or streets of another country than the film's, cartoons, or abstract backgrounds.",
  "People: when tags show a person (businessman, seamstress, barber, family, portrait) and name no country, they are usually Western stock models; prefer hands, tools, places and objects, and accept such a person only when no other candidate shows the line.",
  "Reply with exactly one line per shot and nothing else: ID | numbers that fit, best first, separated by commas (or none)",
].join("\n");

/**
 * Read the critic's lines into {id: indices that fit, best first}; a shot with no line is unknown (absent).
 * @param {string} text @returns {Map<string, number[]>}
 */
export function parseChoices(text) {
  const out = new Map();
  for (const line of String(text ?? "").split("\n")) {
    const m = /^\s*[*-]?\s*`?(SC\d{4,5}-\d+)`?\s*[|:]\s*(.*)$/.exec(line);
    if (!m) continue;
    out.set(m[1], /none/i.test(m[2]) ? [] : [...new Set([...m[2].matchAll(/\d+/g)].map((x) => Number(x[0])))]);
  }
  return out;
}

/**
 * The critic on candidates' words: which of each shot's candidates show its line (batches of 8 shots).
 * @param {{ brain: { call: (req: any) => Promise<{ text?: string }> }, shots: { id: string, heard: string, sentence: string, options: string[] }[], world?: any, log?: (s: string) => void }} o
 * @returns {Promise<Map<string, number[]>>} 1-based option numbers that fit, per shot id
 */
export async function chooseByWords(o) {
  const where = [o.world?.city, o.world?.country].filter(Boolean).join(", ");
  const brief = `The film is set in ${where || "a place not given"}${o.world?.era ? `, ${o.world.era}` : ""}${o.world?.currency ? `; its money is ${o.world.currency}` : ""}${o.world?.demonym ? `; its people are ${o.world.demonym}` : ""}.`;
  /** @type {Map<string, number[]>} */
  const out = new Map();
  for (let i = 0; i < o.shots.length; i += 8) {
    const batch = o.shots.slice(i, i + 8);
    const text = batch.map((s) => [`${s.id} | line: "${s.heard}"${s.sentence && s.sentence !== s.heard ? ` (sentence: "${s.sentence}")` : ""}`, ...s.options.map((t, k) => `  ${k + 1}. ${String(t).slice(0, 110)}`)].join("\n")).join("\n");
    try {
      const reply = await o.brain.call({ stage: "V4", system: [{ text: CHOICE_SYSTEM }], messages: [{ role: "user", content: [{ text: `${brief}\n\n${text}` }] }], maxTokens: 1600, effort: "low" });
      for (const [id, nums] of parseChoices(reply.text ?? "")) if (batch.some((s) => s.id === id)) out.set(id, nums);
    } catch (e) {
      o.log?.(`Critic: the free brain did not answer a batch (${String(/** @type {any} */ (e)?.message ?? e).slice(0, 120)}); those shots stay unjudged.`);
    }
  }
  return out;
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
 * @param {{ t: number, blur: number, luma: number }[]} samples @param {any[]} video @param {{ blurMax?: number, blurMaxDesigned?: number, darkLuma?: number, flickerJump?: number }} [o]
 */
export function blurAndFlicker(samples, video, o = {}) {
  const blurMax = o.blurMax ?? STANDARD.blurMax;
  const flickerJump = o.flickerJump ?? STANDARD.flickerJump;
  const shots = (video ?? []).filter((v) => v.type !== "black");
  const blurMaxDesigned = o.blurMaxDesigned ?? STANDARD.blurMaxDesigned;
  const darkLuma = o.darkLuma ?? STANDARD.darkLuma;
  /** @type {Map<string, { id: string, start: number, end: number, designed: boolean, blur: number[], luma: { t: number, y: number }[] }>} */
  const byShot = new Map();
  for (const s of shots) byShot.set(String(s.id), { id: String(s.id), start: Number(s.start), end: Number(s.end), designed: designedStill(s), blur: [], luma: [] });
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
  /** @type {{ id: string, start: number, end: number, value: number }[]} */
  const blurredDesigned = [];
  /** @type {{ id: string, value: number }[]} */
  const dark = [];
  /** @type {{ id: string, at: number, from: number, to: number }[]} */
  const flicker = [];
  for (const acc of byShot.values()) {
    if (acc.blur.length) {
      const value = median(acc.blur);
      // A still's own soft backdrop (a photo over a blurred copy of itself) is design: it is noted, never counted as a blurred copy.
      if (Number.isFinite(value) && acc.designed) {
        if (value > blurMaxDesigned) blurredDesigned.push({ id: acc.id, start: acc.start, end: acc.end, value: round(value, 1) });
      } else if (Number.isFinite(value) && value > blurMax) blurred.push({ id: acc.id, start: acc.start, end: acc.end, value: round(value, 1) });
    }
    if (!acc.designed && acc.luma.length) {
      const y = median(acc.luma.map((l) => l.y));
      if (Number.isFinite(y) && y < darkLuma) dark.push({ id: acc.id, value: round(y, 1) });
    }
    for (let k = 1; k < acc.luma.length; k += 1) {
      // A sample taken inside a shot's last half second (or first) can be the next picture: shots are
      // cut to whole frames, and a cut is not a flicker. Only a jump with both samples well inside the
      // shot is measured, so an honest cut is never reported as flicker on playback.
      const edge = 0.5;
      if (acc.luma[k].t - acc.start < edge || acc.end - acc.luma[k].t < edge) continue;
      const jump = Math.abs(acc.luma[k].y - acc.luma[k - 1].y);
      if (jump > flickerJump) flicker.push({ id: acc.id, at: round(acc.luma[k].t, 2), from: round(acc.luma[k - 1].y, 1), to: round(acc.luma[k].y, 1) });
    }
  }
  return { blurred, blurredDesigned, flicker, dark, samples: samples.length, shots: shots.length };
}

/**
 * Measure the picture of a finished film: blur and flicker, one pass at two
 * frames a second (the samples land inside their own shot).
 * @param {string} file @param {any} timeline @param {{ ffmpeg?: string, blurMax?: number, blurMaxDesigned?: number, darkLuma?: number, flickerJump?: number }} [o]
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
