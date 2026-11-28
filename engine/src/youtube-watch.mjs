/**
 * "Gemini watches a film": the fixed question we ask about one public YouTube film, the check of the answer, and the
 * medians that become PRACTICE_TARGETS (pure; no network). The Worker route is worker/youtube-watch-api.mjs, the daily
 * job is .github/workflows/youtube-watch.yml + local/youtube-watch.mjs. Numbers come from the model WATCHING the video,
 * so each one is tagged measured only after validateWatch() passes; a bad answer is never stored.
 */

/** Models that accept a YouTube URL as video input, tried in this order (free tier, one request each). */
export const WATCH_MODELS = Object.freeze(["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
/** The medians replace the estimates only from this many measured films on. */
export const MIN_FILMS_FOR_TARGETS = 20;
/** @param {unknown} id */
export const isVideoId = (id) => typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
/** @param {string} id */
export const watchUrl = (id) => `https://www.youtube.com/watch?v=${id}`;

const num = (/** @type {string} */ d) => ({ type: "NUMBER", description: d });
const SHARE = (/** @type {string} */ d) => ({ type: "NUMBER", description: `${d} Fraction of the film's running time, 0 to 1.` });

/** Gemini's responseSchema for one film. */
export const WATCH_SCHEMA = Object.freeze({
  type: "OBJECT",
  required: ["lengthSeconds", "hookText", "firstNumberAtSec", "firstStakeAtSec", "wordsPerMinute", "avgShotSeconds", "shares", "chapterTurnsSec", "revealsSec", "musicStyle", "ending"],
  properties: {
    lengthSeconds: num("Total running time in seconds."),
    hookText: { type: "STRING", description: "The exact words spoken in the first 30 seconds, verbatim." },
    firstNumberAtSec: num("Second at which the narrator first says a concrete number, date or quantity."),
    firstStakeAtSec: num("Second at which the first stake is clear (deaths, money, danger, what could be lost)."),
    wordsPerMinute: num("Narration words per minute over the whole film (count what is spoken, ignore silence)."),
    avgShotSeconds: num("Average seconds per shot (cut to cut) over the whole film."),
    shares: {
      type: "OBJECT",
      required: ["archive", "mapsDiagramsAnimation", "onScreenText", "talkingHeads", "stock"],
      properties: {
        archive: SHARE("Archive or news footage and historical photos."),
        mapsDiagramsAnimation: SHARE("Maps, diagrams, charts, 3D animation and explainer graphics."),
        onScreenText: SHARE("Full-screen text, quotes, documents, counters."),
        talkingHeads: SHARE("People talking to camera or being interviewed, including the presenter."),
        stock: SHARE("Generic stock or B-roll footage."),
      },
    },
    chapterTurnsSec: { type: "ARRAY", items: { type: "NUMBER" }, description: "Seconds at which a new chapter or section begins (clear topic turns)." },
    revealsSec: { type: "ARRAY", items: { type: "NUMBER" }, description: "Seconds of the big reveals: the moments the film answers its central question or shows what really went wrong." },
    musicStyle: { type: "STRING", description: "Music in one short phrase (genre, mood, how loud against the voice)." },
    ending: { type: "STRING", description: "The last 30 seconds: what it says and how it closes, in one or two sentences." },
  },
});

/** The fixed prompt. */
export const WATCH_PROMPT = [
  "Watch this documentary film from start to end and measure it. Answer ONLY with the JSON that the schema asks for.",
  "Count, do not guess: use the timeline of the film. Seconds are from 0:00 of the film. Shares are fractions of running time and should add up to about 1 (use 0 for what is absent).",
  "hookText must be the exact words spoken in the first 30 seconds. If you cannot hear or see something, use 0 or an empty list rather than inventing it.",
].join("\n");

/** The request body for generateContent. @param {string} videoId */
export function buildWatchRequest(videoId) {
  return {
    contents: [{ role: "user", parts: [{ fileData: { fileUri: watchUrl(videoId) } }, { text: WATCH_PROMPT }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: WATCH_SCHEMA },
  };
}

const isNum = (/** @type {any} */ v) => typeof v === "number" && Number.isFinite(v);
const sec = (/** @type {any} */ v, /** @type {number} */ max) => isNum(v) && v >= 0 && v <= max;

/**
 * Check one answer. Returns the clean value (numbers only where plausible) or the list of problems.
 * @param {any} raw
 * @returns {{ ok: true, value: any } | { ok: false, errors: string[] }}
 */
export function validateWatch(raw) {
  /** @type {string[]} */
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, errors: ["not an object"] };
  const len = raw.lengthSeconds;
  if (!isNum(len) || len < 60 || len > 4 * 3600) errors.push("lengthSeconds out of range");
  const max = isNum(len) ? len + 5 : 0;
  if (typeof raw.hookText !== "string" || raw.hookText.trim().split(/\s+/).length < 5) errors.push("hookText too short");
  if (!sec(raw.firstNumberAtSec, max)) errors.push("firstNumberAtSec out of range");
  if (!sec(raw.firstStakeAtSec, max)) errors.push("firstStakeAtSec out of range");
  if (!isNum(raw.wordsPerMinute) || raw.wordsPerMinute < 60 || raw.wordsPerMinute > 260) errors.push("wordsPerMinute implausible");
  if (!isNum(raw.avgShotSeconds) || raw.avgShotSeconds < 0.5 || raw.avgShotSeconds > 60) errors.push("avgShotSeconds implausible");
  const s = raw.shares;
  const keys = ["archive", "mapsDiagramsAnimation", "onScreenText", "talkingHeads", "stock"];
  if (!s || typeof s !== "object") errors.push("shares missing");
  else {
    for (const k of keys) if (!isNum(s[k]) || s[k] < 0 || s[k] > 1) errors.push(`shares.${k} not 0..1`);
    const total = keys.reduce((a, k) => a + (isNum(s[k]) ? s[k] : 0), 0);
    if (total > 1.2) errors.push("shares add up to more than 1");
  }
  for (const k of ["chapterTurnsSec", "revealsSec"]) {
    if (!Array.isArray(raw[k]) || !raw[k].every((/** @type {any} */ v) => sec(v, max))) errors.push(`${k} must be a list of seconds inside the film`);
  }
  if (typeof raw.musicStyle !== "string") errors.push("musicStyle missing");
  if (typeof raw.ending !== "string" || raw.ending.trim().length < 5) errors.push("ending missing");
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      lengthSeconds: Math.round(raw.lengthSeconds),
      hookText: raw.hookText.trim(),
      firstNumberAtSec: raw.firstNumberAtSec,
      firstStakeAtSec: raw.firstStakeAtSec,
      wordsPerMinute: raw.wordsPerMinute,
      avgShotSeconds: raw.avgShotSeconds,
      shares: Object.fromEntries(keys.map((k) => [k, s[k]])),
      chapterTurnsSec: [...raw.chapterTurnsSec].sort((a, b) => a - b),
      revealsSec: [...raw.revealsSec].sort((a, b) => a - b),
      musicStyle: raw.musicStyle.trim(),
      ending: raw.ending.trim(),
    },
  };
}

/** @param {number[]} xs @param {number} p 0..1 */
export function quantile(xs, p) {
  const a = xs.filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const med = (/** @type {number[]} */ xs) => quantile(xs, 0.5);
const r1 = (/** @type {number | null} */ v) => (v === null ? null : Math.round(v * 10) / 10);

/**
 * The medians over validated watches (each stored record carries the validated fields).
 * @param {any[]} watches
 */
export function summarizeWatches(watches) {
  const ok = watches.filter((w) => validateWatch(w).ok);
  /** @type {(f: (w: any) => number | null) => number[]} */
  const col = (f) => /** @type {number[]} */ (ok.map(f).filter((v) => isNum(v)));
  const gaps = ok.flatMap((w) => w.chapterTurnsSec.slice(1).map((/** @type {number} */ t, /** @type {number} */ i) => t - w.chapterTurnsSec[i]));
  const revealGaps = ok.flatMap((w) => w.revealsSec.slice(1).map((/** @type {number} */ t, /** @type {number} */ i) => t - w.revealsSec[i]));
  const graphics = col((w) => w.shares.mapsDiagramsAnimation);
  return {
    n: ok.length,
    lengthMinutes: r1(med(col((w) => w.lengthSeconds / 60))),
    wpm: { p25: r1(quantile(col((w) => w.wordsPerMinute), 0.25)), median: r1(med(col((w) => w.wordsPerMinute))), p75: r1(quantile(col((w) => w.wordsPerMinute), 0.75)) },
    shotSeconds: { p25: r1(quantile(col((w) => w.avgShotSeconds), 0.25)), median: r1(med(col((w) => w.avgShotSeconds))), p75: r1(quantile(col((w) => w.avgShotSeconds), 0.75)) },
    firstNumberAtSec: r1(med(col((w) => w.firstNumberAtSec))),
    firstStakeAtSec: r1(med(col((w) => w.firstStakeAtSec))),
    graphicsShare: { p25: quantile(graphics, 0.25), median: med(graphics), p75: quantile(graphics, 0.75) },
    shares: Object.fromEntries(["archive", "mapsDiagramsAnimation", "onScreenText", "talkingHeads", "stock"].map((k) => [k, med(col((w) => w.shares[k]))])),
    chapterGapSeconds: r1(med(gaps)),
    revealGapSeconds: r1(med(revealGaps)),
    firstRevealAtFraction: med(col((w) => (w.revealsSec.length ? w.revealsSec[0] / w.lengthSeconds : null))),
    lastRevealAtFraction: med(col((w) => (w.revealsSec.length ? w.revealsSec[w.revealsSec.length - 1] / w.lengthSeconds : null))),
  };
}

const r2 = (/** @type {number | null} */ v) => (v === null ? null : Math.round(v * 100) / 100);

/**
 * The target numbers that measured data replaces, only from MIN_FILMS_FOR_TARGETS films on; {} before that.
 * @param {ReturnType<typeof summarizeWatches>} s
 */
export function targetsFromSummary(s) {
  if (!s || s.n < MIN_FILMS_FOR_TARGETS) return {};
  /** @type {Record<string, any>} */
  const t = {};
  // A range narrower than 10% of its middle is a model repeating a default (12 films all said ~142 wpm), not a measurement: skip it.
  const range = (/** @type {number | null} */ lo, /** @type {number | null} */ hi) => (lo !== null && hi !== null && hi - lo >= 0.1 * ((lo + hi) / 2) ? [lo, hi] : null);
  const wpm = range(s.wpm.p25, s.wpm.p75);
  if (wpm) t.wpm = wpm.map(Math.round);
  const shot = range(s.shotSeconds.p25, s.shotSeconds.p75);
  if (shot) t.shotSeconds = shot.map((v) => Math.round(v * 10) / 10);
  const gfx = range(r2(s.graphicsShare.p25), r2(s.graphicsShare.p75));
  if (gfx) t.graphicsShare = gfx;
  if (s.firstNumberAtSec !== null) t.hookBySeconds = Math.min(30, Math.max(10, Math.ceil(s.firstNumberAtSec)));
  const rv = range(r2(s.firstRevealAtFraction), r2(s.lastRevealAtFraction));
  if (rv) t.revealAt = rv;
  return t;
}

/**
 * The base targets with measured numbers laid over them (the file engine/src/watch-measured.mjs is rewritten daily).
 * @template T @param {T} base @param {{ n?: number, targets?: Record<string, any> } | null | undefined} measured
 * @returns {T}
 */
export function applyMeasured(base, measured) {
  if (!measured || !measured.targets || (measured.n ?? 0) < MIN_FILMS_FOR_TARGETS) return base;
  return { ...base, ...measured.targets };
}

/** The data module's text. @param {{ n: number, updated: string | null, summary: any }} m */
export function measuredModuleText(m) {
  const targets = targetsFromSummary(m.summary);
  const body = JSON.stringify({ n: m.n, updated: m.updated, targets, summary: m.summary }, null, 2);
  return `/** Written by local/youtube-watch.mjs (daily). Gemini watched n films; targets apply from ${MIN_FILMS_FOR_TARGETS} on. Do not edit by hand. */\nexport const WATCH_MEASURED = Object.freeze(${body});\n`;
}
