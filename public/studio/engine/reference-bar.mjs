/**
 * The reference bar as data: the ten measurable rules a Zupona film must beat (docs/research/REFERENCE_SCORECARD.md
 * section 5, "The bar"), turned from prose into numbers a program can read. Before this file the bar lived only
 * in that markdown; no code read it.
 *
 * Advisory, not a gate: it reports pass / fail / unknown per rule and never blocks a film, and it never lowers
 * anything (the release gate and the critic keep their own thresholds). A rule whose measure is missing is
 * "unknown", never "pass". Honest status per rule (said in the scorecard): `measured` = the limit comes from
 * the ten reference films' metadata; `floor` = a craft floor we hold ourselves to, not derived from them.
 *
 * Readers: `local/bar-check.mjs` (the daily scorecard, advisory) and `barBrief()` (text for a prompt; wiring it
 * into the script and shot prompts happened on 28 Nov 2026: film-run filmBrief, render/daily-script.mjs, VOICE_VISUALS_SYSTEM, DIRECTOR_SYSTEM).
 */

/**
 * @typedef {{ id: string, rule: number, label: string, measure: string, op: "<=" | ">=", limit: number, unit: string, status: "measured" | "floor" }} BarRule
 */

/** @type {readonly BarRule[]} */
import { applyMeasured } from "./youtube-watch.mjs";
import { WATCH_MEASURED } from "./watch-measured.mjs";

export const REFERENCE_BAR = Object.freeze([
  { id: "firstMinuteCut", rule: 1, label: "a cut at least every 6 s in the first minute", measure: "firstMinuteMaxShot", op: "<=", limit: 6, unit: "s", status: "floor" },
  { id: "first3MaxShot", rule: 1, label: "no shot longer than 6 s in the first 3 minutes", measure: "first3MaxShot", op: "<=", limit: 6, unit: "s", status: "floor" },
  { id: "mapBefore90", rule: 2, label: "a map, cutaway or diagram before 1:30", measure: "firstGraphicAt", op: "<=", limit: 90, unit: "s", status: "measured" },
  { id: "promiseBefore30", rule: 3, label: "the title's promise is spoken before 0:30", measure: "promiseAt", op: "<=", limit: 30, unit: "s", status: "measured" },
  { id: "answerBy150", rule: 3, label: "the promise is answered by 2:30", measure: "answerAt", op: "<=", limit: 150, unit: "s", status: "measured" },
  { id: "stakeIn180", rule: 4, label: "one sourced stake (count, date or cost) in the first 3 minutes", measure: "sourcedStakeAt", op: "<=", limit: 180, unit: "s", status: "measured" },
  { id: "chapterSpacingMax", rule: 5, label: "a chapter at least every 4 minutes", measure: "longestChapterMinutes", op: "<=", limit: 4, unit: "min", status: "measured" },
  { id: "sourceChips3min", rule: 6, label: "every archive shot in the first 3 minutes shows its source", measure: "archiveShotsWithSourceShare", op: ">=", limit: 1, unit: "share", status: "floor" },
  { id: "realShare3min", rule: 7, label: "at least half of the first 3 minutes is real or marked material, not generic stock", measure: "realMaterialShareFirst3", op: ">=", limit: 0.5, unit: "share", status: "floor" },
  { id: "noRepeatedPicture", rule: 7, label: "no picture repeats", measure: "repeatedPictures", op: "<=", limit: 0, unit: "pictures", status: "floor" },
  { id: "silenceMax", rule: 8, label: "no silence over 0.8 s in the narration", measure: "longestSilence", op: "<=", limit: 0.8, unit: "s", status: "floor" },
  { id: "loudnessLow", rule: 8, label: "loudness at least -15 LUFS (target -14 ±1)", measure: "integratedLufs", op: ">=", limit: -15, unit: "LUFS", status: "floor" },
  { id: "loudnessHigh", rule: 8, label: "loudness at most -13 LUFS (target -14 ±1)", measure: "integratedLufs", op: "<=", limit: -13, unit: "LUFS", status: "floor" },
  { id: "endingSources", rule: 9, label: "the last 30 s names at least 3 sources", measure: "endingSourceCount", op: ">=", limit: 3, unit: "sources", status: "measured" },
  { id: "descriptionSources", rule: 10, label: "the description lists the sources", measure: "descriptionHasSources", op: ">=", limit: 1, unit: "bool", status: "measured" },
]);

/**
 * Judge one film's measures against the bar.
 * @param {Record<string, number | boolean | null | undefined>} measures a flat object of the measure names above
 * @returns {{ id: string, rule: number, label: string, result: "pass" | "fail" | "unknown", value: number | null, limit: number, unit: string, status: string }[]}
 */
export function checkBar(measures) {
  return REFERENCE_BAR.map((r) => {
    const raw = measures?.[r.measure];
    const value = typeof raw === "boolean" ? Number(raw) : typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    const result = value === null ? "unknown" : (r.op === "<=" ? value <= r.limit : value >= r.limit) ? "pass" : "fail";
    return { id: r.id, rule: r.rule, label: r.label, result, value, limit: r.limit, unit: r.unit, status: r.status };
  });
}

/**
 * The measures a finished film's own reports already carry. Anything not in the reports stays out (so the rule reads "unknown").
 * @param {any} report an `out/<id>.report.json`
 */
export function barMeasuresFromReport(report) {
  const m = report?.critic?.measures ?? report?.measures ?? {};
  /** @type {Record<string, number>} */
  const out = {};
  const put = (/** @type {string} */ k, /** @type {unknown} */ v) => { if (v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))) out[k] = Number(v); };
  put("longestSilence", m.longestSilence ?? report?.audio?.longestSilence);
  put("integratedLufs", m.integratedLufs ?? report?.audio?.integratedLufs ?? report?.audio?.lufs);
  put("firstMinuteMaxShot", m.firstMinuteMaxShot);
  put("first3MaxShot", m.first3MaxShot);
  put("firstGraphicAt", m.firstGraphicAt);
  put("repeatedPictures", m.repeatedPictures);
  return out;
}

/** The scorecard line count a free agent should see: pass, fail, unknown. @param {ReturnType<typeof checkBar>} rows */
export function barSummary(rows) {
  const n = (/** @type {string} */ r) => rows.filter((x) => x.result === r).length;
  return { pass: n("pass"), fail: n("fail"), unknown: n("unknown"), total: rows.length };
}

/** The bar as plain lines for a prompt (the numbers a script and a shot plan should aim for). */
export function barBrief() {
  const t = PRACTICE_TARGETS;
  return [
    "REFERENCE_BAR (what a Zupona film must beat; numbers, not views):",
    ...REFERENCE_BAR.map((r) => `- ${r.label} (${r.status === "measured" ? "from the reference films" : "our craft floor"}).`),
    "PRACTICE_TARGETS (numbers to write and plan to; advisory, never a reason to invent a fact):",
    `- Length ${t.lengthMinutes[0]}-${t.lengthMinutes[1]} minutes for a first film; narration ${t.wpm[0]}-${t.wpm[1]} words a minute.`,
    `- Hook: the title's promise and one sourced number or date are spoken before 0:${t.hookBySeconds}; a question the film answers is asked by ${t.questionBySeconds / 60}:00. No "welcome", no logo, no sponsor in the first 10 minutes.`,
    `- Shots: a new picture every ${t.shotSeconds[0]}-${t.shotSeconds[1]} s on average, never longer than ${t.maxShotSeconds} s in the first 3 minutes; a new fact, question or image at least every ${t.newBeatSeconds} s, so write a fact or a question into every ${t.newBeatSeconds} s of narration.`,
    `- Graphics: a map, diagram or counter before 1:30, at least ${t.graphicsPerChapter} per chapter, about ${Math.round(t.graphicsShare[0] * 100)}-${Math.round(t.graphicsShare[1] * 100)}% of the shots; each one explains, none decorates.`,
    `- Shape: the reveal (the turn that answers the question) lands at ${Math.round(t.revealAt[0] * 100)}-${Math.round(t.revealAt[1] * 100)}% of the length; a chapter turn by ${t.firstChapterTurnBySeconds} s, then about every ${t.chapterMinutesTypical} minutes (never over ${t.chapterMinutesMax}); the last ${t.endingSeconds} s answers the title's question in one sentence and names at least ${t.endingSources} sources.`,
  ].join("\n");
}

/**
 * Numeric targets for a finished film, set 28 Nov 2026 from `docs/research/FIRST_VIDEO_PLAN.md` (sections 5 and 6, the 15
 * practice points) and the ten-film bar above. HONEST STATUS: the planned inside-the-film measurement of 40 winning
 * videos (docs/research/YOUTUBE_WATCH.md) was blocked (YouTube answers this container's watch-page requests with a
 * CAPTCHA), so no number here was measured inside a winning film. `source` says where each number comes from:
 * "bar" = the reference bar, "plan" = FIRST_VIDEO_PLAN (an estimate there too), "radar" = sourced from the 467-video
 * title/length study, "estimate" = our own opinion, "measured" = counted from public metadata of the reference films (chapter timestamps, lengths). Replace an estimate when a real measurement lands.
 */
const BASE_TARGETS = {
  lengthMinutes: /** @type {[number, number]} */ ([14, 16]), // plan section 5; radar: 1M+ median 21 min, small-channel hits 8-14 min
  wpm: /** @type {[number, number]} */ ([140, 165]), // estimate: ordinary documentary narration
  hookBySeconds: 30, // bar rule 3, plan point 1
  questionBySeconds: 180, // plan point 12
  shotSeconds: /** @type {[number, number]} */ ([3, 7]), // estimate; the cut-rate floor is bar rule 1
  maxShotSeconds: 6, // bar rule 1
  newBeatSeconds: 20, // plan point 8 (15-20 s; a 30 s stretch with nothing new fails)
  graphicBySeconds: 90, // bar rule 2
  graphicsPerChapter: 1, // plan point 6
  graphicsShare: /** @type {[number, number]} */ ([0.1, 0.3]), // estimate
  revealAt: /** @type {[number, number]} */ ([0.5, 0.7]), // plan point 12 ("about 60%")
  chapterMinutesMax: 4, // bar rule 5
  chapterMinutesTypical: 2.6, // MEASURED from chapter timestamps of 172 reference films with 1M+ views (median minutes per chapter; docs/research/YOUTUBE_WATCH.md)
  firstChapterTurnBySeconds: 70, // MEASURED, same 172 films: the median second chapter starts at 69 s
  endingSeconds: 30, // plan point 13
  endingSources: 3, // bar rule 9
};

/** The numbers a film aims for: the base above, with the numbers Gemini measured in winning films laid over them once 20+ films are in (watch-measured.mjs, rewritten daily). */
export const PRACTICE_TARGETS = Object.freeze(applyMeasured(BASE_TARGETS, WATCH_MEASURED));

const NUMBER_WORDS = /\b(\d[\d,.]*|(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)(?:[- ](?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand|million))*)\b/i;
/** A sentence that carries something new: a number, a date, or a question. @param {string} text */
const isBeat = (text) => /\?/.test(text) || NUMBER_WORDS.test(text);

/**
 * The scorecard's measures from a finished film's timeline (pure; anything the timeline cannot show stays out, so the
 * check reads "unknown", never "pass").
 * @param {any} timeline
 * @returns {Record<string, number>}
 */
export function practiceMeasures(timeline) {
  /** @type {Record<string, number>} */
  const out = {};
  const video = (timeline?.video ?? []).filter((/** @type {any} */ v) => v.type !== "black");
  const narr = (timeline?.narration ?? []).map((/** @type {any} */ n) => ({ start: Number(n.start), end: Number(n.end), text: String(n.text ?? "").replace(/\[[^\]]*\]/g, "").trim() })).filter((/** @type {any} */ n) => n.text && Number.isFinite(n.start));
  const seconds = Number(timeline?.durationSeconds);
  if (Number.isFinite(seconds) && seconds > 0) out.lengthMinutes = Math.round((seconds / 60) * 10) / 10;
  if (video.length && out.lengthMinutes) {
    out.avgShotSeconds = Math.round((seconds / video.length) * 10) / 10;
    const gfx = video.filter((/** @type {any} */ v) => v.map || v.chart || v.counter || v.graphic || v.kinetic).length;
    out.graphicsShare = Math.round((gfx / video.length) * 1000) / 1000;
    const first = video.find((/** @type {any} */ v) => v.map || v.chart || v.counter || v.graphic);
    if (first) out.firstGraphicAt = Math.round(Number(first.start) * 10) / 10;
  }
  if (narr.length) {
    const words = narr.reduce((/** @type {number} */ n, /** @type {any} */ x) => n + x.text.split(/\s+/).filter(Boolean).length, 0);
    const span = Math.max(...narr.map((/** @type {any} */ x) => x.end || x.start)) - Math.min(...narr.map((/** @type {any} */ x) => x.start));
    if (span > 30) out.wpm = Math.round(words / (span / 60));
    const firstBeat = narr.find((/** @type {any} */ x) => NUMBER_WORDS.test(x.text));
    if (firstBeat) out.firstNumberAt = Math.round(firstBeat.start * 10) / 10;
    const q = narr.find((/** @type {any} */ x) => x.text.includes("?"));
    if (q) out.firstQuestionAt = Math.round(q.start * 10) / 10;
    // The longest stretch of narration with no number, date or question in it.
    const marks = [0, ...narr.filter((/** @type {any} */ x) => isBeat(x.text)).map((/** @type {any} */ x) => x.start), Number.isFinite(seconds) ? seconds : narr[narr.length - 1].end];
    let gap = 0;
    for (let i = 1; i < marks.length; i++) gap = Math.max(gap, marks[i] - marks[i - 1]);
    out.longestWithoutNewBeat = Math.round(gap);
  }
  return out;
}

/** The scorecard rows: measure name, direction, limit(s), label. @type {readonly { id: string, measure: string, label: string, lo?: number, hi?: number }[]} */
const PRACTICE_ROWS = Object.freeze([
  { id: "length", measure: "lengthMinutes", label: "length in minutes", lo: PRACTICE_TARGETS.lengthMinutes[0] - 2, hi: 21 },
  { id: "wpm", measure: "wpm", label: "narration words a minute", lo: PRACTICE_TARGETS.wpm[0], hi: PRACTICE_TARGETS.wpm[1] },
  { id: "avgShot", measure: "avgShotSeconds", label: "average seconds per shot", lo: PRACTICE_TARGETS.shotSeconds[0], hi: PRACTICE_TARGETS.shotSeconds[1] },
  { id: "graphicsShare", measure: "graphicsShare", label: "share of shots that are maps, charts or counters", lo: PRACTICE_TARGETS.graphicsShare[0], hi: PRACTICE_TARGETS.graphicsShare[1] },
  { id: "firstGraphic", measure: "firstGraphicAt", label: "first map or diagram at (seconds)", hi: PRACTICE_TARGETS.graphicBySeconds },
  { id: "firstNumber", measure: "firstNumberAt", label: "first number or date spoken at (seconds)", hi: PRACTICE_TARGETS.hookBySeconds },
  { id: "firstQuestion", measure: "firstQuestionAt", label: "first question asked at (seconds)", hi: PRACTICE_TARGETS.questionBySeconds },
  { id: "newBeat", measure: "longestWithoutNewBeat", label: "longest narration without a number, date or question (seconds)", hi: 30 },
]);

/**
 * Judge a finished film against the practice targets. Advisory: "unknown" when the measure is missing; never a block.
 * @param {Record<string, number>} measures from practiceMeasures
 */
export function practiceCheck(measures) {
  return PRACTICE_ROWS.map((r) => {
    const v = measures?.[r.measure];
    const value = typeof v === "number" && Number.isFinite(v) ? v : null;
    const ok = value === null ? null : (r.lo === undefined || value >= r.lo) && (r.hi === undefined || value <= r.hi);
    return { id: r.id, label: r.label, value, lo: r.lo ?? null, hi: r.hi ?? null, result: /** @type {"pass" | "fail" | "unknown"} */ (ok === null ? "unknown" : ok ? "pass" : "fail") };
  });
}

/**
 * The practice-film scorecard (docs/research/FIRST_VIDEO_PLAN.md section 6: 15 points scored 0-2 by the Boss, pass 22 of 30,
 * a 0 on points 1, 4 or 14 fails the film). The Boss scores the rows by eye; `targets` are the numbers a program can
 * check (practiceCheck), advisory only.
 * @type {{ passMark: number, outOf: number, measures: { id: string, label: string }[], targets: typeof PRACTICE_TARGETS }}
 */
export const PRACTICE_SCORECARD = Object.freeze({
  passMark: 22,
  outOf: 30,
  measures: [
    { id: "hookPromise", label: "Hook promise: the title's promise and a sourced number in the first 30 s" },
    { id: "coldOpen", label: "Cold open: the first frame is a real picture, no logo, no welcome" },
    { id: "cutRate", label: "Cut rate: a cut at least every 6 s in the first minute" },
    { id: "pictureRelevance", label: "Picture relevance: every scene shows what the narration says" },
    { id: "pictureVariety", label: "Picture variety: no repeats, half real material in the first 3 minutes" },
    { id: "graphics", label: "Graphics: a map or diagram by 1:30 and one per chapter" },
    { id: "motion", label: "Motion: varied zoom and pan, no same move twice in a row" },
    { id: "pacing", label: "Pacing: a new fact, question or image every 15-20 s" },
    { id: "narration", label: "Narration: natural pace, no silence over 0.8 s, names pronounced" },
    { id: "sound", label: "Sound: music 12 dB under speech, -14 LUFS, effects on key beats" },
    { id: "captions", label: "Captions and source chips: every archive shot carries its source" },
    { id: "storyShape", label: "Story shape: a question in the first 3 minutes, the reveal at about 60%" },
    { id: "ending", label: "Ending: the last 30 s answers the question and names 3 sources" },
    { id: "accuracy", label: "Accuracy: every claim traces to the ledger" },
    { id: "packaging", label: "Packaging: title, thumbnail and chapters match the film" },
  ],
  targets: PRACTICE_TARGETS,
});
