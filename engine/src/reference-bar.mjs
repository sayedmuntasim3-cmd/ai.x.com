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
 * into the script/shot prompts is listed as a TODO in docs/AUTOPILOT.md because those files are owned by other workers).
 */

/**
 * @typedef {{ id: string, rule: number, label: string, measure: string, op: "<=" | ">=", limit: number, unit: string, status: "measured" | "floor" }} BarRule
 */

/** @type {readonly BarRule[]} */
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
  return ["REFERENCE_BAR (what a Zupona film must beat; numbers, not views):", ...REFERENCE_BAR.map((r) => `- ${r.label} (${r.status === "measured" ? "from the reference films" : "our craft floor"}).`)].join("\n");
}

/**
 * HOOK for the practice-film scorecard (docs/research/FIRST_VIDEO_PLAN.md section 6: 14 measures scored 0-2, pass 22 of 30).
 * When that scorecard lands as data, put its rows here and read them in local/bar-check.mjs; until then it is null
 * and nothing depends on it. TODO(autopilot): see docs/AUTOPILOT.md, "Wire the practice-film scorecard".
 * @type {null | { passMark: number, outOf: number, measures: { id: string, label: string }[] }}
 */
export const PRACTICE_SCORECARD = null;
