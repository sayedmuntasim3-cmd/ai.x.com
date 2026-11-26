/**
 * The Craft Ledger: the platform's own taste, written down and learned from
 * its own films.
 *
 * Every other film tool is stateless — it judges each new film with the same
 * fixed rules it had on day one. A channel that renders fifty films learns
 * something a competitor cannot download: which rhythm, which share of moving
 * picture, which cadence of designed moments this audience actually rewards.
 * This module is that memory.
 *
 * - `recordFromReport` reads the critic's measures out of a finished film's
 *   report (no media, no model call, a few hundred bytes per film).
 * - `addRecord` keeps one compact record per film, newest wins, capped.
 * - `calibratedDoctrine` turns the films that *passed* into numeric targets:
 *   the median the audience accepted, never outside the house envelope, and
 *   never allowed to drift below the doctrine's floor (a channel must not learn
 *   its way down to mediocre).
 * - `craftIndex` scores any film's measures against those targets, 0–100.
 *
 * Pure and deterministic: no clock, no network, no files. The caller supplies
 * `at` and the ledger text. Nothing here throws on bad input; problems come
 * back as codes the CLI turns into en+bn messages.
 */

/** Bump only when an old ledger can no longer be read. */
export const LEDGER_VERSION = 1;

/** How many films one ledger keeps. Older films are dropped first. */
export const MAX_FILMS = 200;

/**
 * How a metric is judged.
 * - `band`  a range: too short is a montage, too long is a slideshow.
 * - `min`   at least this much.
 * - `max`   at most this much.
 * @typedef {"band" | "min" | "max"} MetricKind
 */

/**
 * @typedef {object} MetricSpec
 * @property {MetricKind} kind
 * @property {number} weight how much it counts in the craft index
 * @property {string} en
 * @property {string} bn
 * @property {[number, number]} envelope the hard limit a learned target may never leave
 * @property {number} [digits] rounding for reported values
 */

/**
 * The measures the critic already produces, and what each one is worth.
 * @type {Readonly<Record<string, MetricSpec>>}
 */
export const METRICS = Object.freeze({
  movingShare: { kind: "min", weight: 3, digits: 3, envelope: [0.4, 0.95], en: "moving picture share", bn: "নড়াচড়া করা ছবির অংশ" },
  designedPerMinute: { kind: "min", weight: 3, digits: 2, envelope: [0.6, 4], en: "designed moments a minute", bn: "মিনিটে ডিজাইন করা মুহূর্ত" },
  avgShot: { kind: "band", weight: 2, digits: 2, envelope: [1.2, 12], en: "average shot length", bn: "গড় শট দৈর্ঘ্য" },
  narrationCoverage: { kind: "min", weight: 2, digits: 3, envelope: [0.8, 1], en: "narration over the film", bn: "ফিল্মের উপর কথনের অংশ" },
  cutsIn30: { kind: "min", weight: 2, digits: 0, envelope: [2, 14], en: "cuts in the first 30 s", bn: "প্রথম ৩০ সেকেন্ডে কাট" },
  longestShot: { kind: "max", weight: 1, digits: 1, envelope: [4, 20], en: "longest shot", bn: "সবচেয়ে লম্বা শট" },
  cueCoverage: { kind: "min", weight: 1, digits: 3, envelope: [0.5, 1], en: "sound cues on designed moments", bn: "ডিজাইন করা মুহূর্তে শব্দের কিউ" },
  subtitleGap: { kind: "max", weight: 1, digits: 1, envelope: [1, 8], en: "largest subtitle gap", bn: "সবচেয়ে বড় সাবটাইটেল ফাঁক" },
});

/** @typedef {keyof typeof METRICS} MetricKey */
/** @typedef {Record<MetricKey, number | null>} Measures */

/**
 * The house standard per genre, before any film of this channel is measured.
 * These are craft, not data: a history film breathes longer than a motivation
 * film, and a science film needs a graphic sooner.
 * @type {Readonly<Record<string, Readonly<Partial<Record<MetricKey, number | [number, number]>>>>>}
 */
export const DOCTRINE = Object.freeze({
  "default": {
    movingShare: 0.65,
    designedPerMinute: 1.4,
    avgShot: [2.5, 6],
    narrationCoverage: 0.98,
    cutsIn30: 6,
    longestShot: 8,
    cueCoverage: 0.8,
    subtitleGap: 3,
  },
  history: {
    movingShare: 0.7,
    designedPerMinute: 1.2,
    avgShot: [3, 7],
    narrationCoverage: 0.98,
    cutsIn30: 6,
    longestShot: 9,
    cueCoverage: 0.8,
    subtitleGap: 3,
  },
  biography: {
    movingShare: 0.7,
    designedPerMinute: 1.5,
    avgShot: [2.5, 6],
    narrationCoverage: 0.98,
    cutsIn30: 6,
    longestShot: 8,
    cueCoverage: 0.8,
    subtitleGap: 3,
  },
  science: {
    movingShare: 0.75,
    designedPerMinute: 1.8,
    avgShot: [2.5, 5.5],
    narrationCoverage: 0.98,
    cutsIn30: 7,
    longestShot: 8,
    cueCoverage: 0.85,
    subtitleGap: 3,
  },
  motivation: {
    movingShare: 0.8,
    designedPerMinute: 2,
    avgShot: [2, 4.5],
    narrationCoverage: 0.99,
    cutsIn30: 8,
    longestShot: 6,
    cueCoverage: 0.85,
    subtitleGap: 3,
  },
});

/** The genres the doctrine knows by name. */
export const GENRES = Object.freeze(Object.keys(DOCTRINE).filter((g) => g !== "default"));

/**
 * A learned target may not relax past this share of the house standard: the
 * doctrine is the floor, the films only say how far above it this channel
 * really is. Without this a channel slowly learns its own worst habits.
 */
export const RELAX = Object.freeze({ min: 0.85, max: 1.25, band: 0.5 });

/** Films below this count do not move a target: three films are an accident. */
export const MIN_FILMS = 3;

/** @typedef {"pass" | "review" | "block" | "unknown"} Verdict */
/**
 * @typedef {object} FilmRecord
 * @property {number} version
 * @property {string} filmId
 * @property {string} genre
 * @property {string} at ISO time the film was measured
 * @property {number} seconds
 * @property {Verdict} verdict
 * @property {Measures} measures
 */
/** @typedef {{ version: number, films: FilmRecord[] }} Ledger */
/** @typedef {{ code: string, params?: Record<string, string | number> }} Note */

const round = (/** @type {number} */ v, /** @type {number} */ d) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

/**
 * The genre's house standard, with `default` filling every gap.
 * @param {string} genre
 * @returns {Record<MetricKey, number | [number, number]>}
 */
export function doctrineFor(genre) {
  const key = Object.prototype.hasOwnProperty.call(DOCTRINE, genre) ? genre : "default";
  return /** @type {Record<MetricKey, number | [number, number]>} */ ({ ...DOCTRINE.default, ...DOCTRINE[key] });
}

/**
 * The critic's measures, read out of a finished film's report. Anything
 * missing comes back as `null` and is simply not learned from.
 * @param {any} report a `<film>.report.json`, or an object with `critic.measures`
 * @returns {{ measures: Measures, seconds: number | null, verdict: Verdict }}
 */
export function measuresFromReport(report) {
  const m = report?.critic?.measures ?? report?.measures ?? {};
  /** @param {unknown} v */
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  const measures = {
    movingShare: num(m.movingShare),
    designedPerMinute: num(m.designedPerMinute),
    avgShot: num(m.avgShot),
    narrationCoverage: num(m.narrationCoverage),
    cutsIn30: num(m.cutsIn30),
    longestShot: num(m.longestShot),
    cueCoverage: num(m.cueCoverage),
    subtitleGap: num(m.subtitles?.maxGap),
  };
  const verdict = report?.critic?.verdict;
  return {
    measures,
    seconds: num(m.seconds ?? report?.durationSeconds),
    verdict: verdict === "pass" || verdict === "review" || verdict === "block" ? verdict : "unknown",
  };
}

/**
 * One film, as the ledger keeps it. A film with no usable measure is refused:
 * a record of nothing teaches nothing.
 * @param {object} o
 * @param {string} o.filmId
 * @param {any} o.report
 * @param {string} [o.genre]
 * @param {string} o.at ISO time
 * @returns {{ ok: true, record: FilmRecord, notes: Note[] } | { ok: false, notes: Note[] }}
 */
export function recordFromReport({ filmId, report, genre, at }) {
  /** @type {Note[]} */
  const notes = [];
  const id = String(filmId ?? "").trim();
  if (!id) return { ok: false, notes: [{ code: "craft.noFilmId" }] };
  if (!Number.isFinite(Date.parse(String(at)))) return { ok: false, notes: [{ code: "craft.noTime" }] };
  const asked = String(genre ?? "default").trim().toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(DOCTRINE, asked);
  if (!known) notes.push({ code: "craft.unknownGenre", params: { genre: asked } });
  const { measures, seconds, verdict } = measuresFromReport(report);
  const usable = /** @type {MetricKey[]} */ (Object.keys(measures)).filter((k) => measures[/** @type {MetricKey} */ (k)] !== null);
  if (!usable.length) return { ok: false, notes: [{ code: "craft.noMeasures", params: { filmId: id } }] };
  if (seconds === null) notes.push({ code: "craft.noDuration", params: { filmId: id } });
  return {
    ok: true,
    notes,
    record: {
      version: LEDGER_VERSION,
      filmId: id,
      genre: known ? asked : "default",
      at: new Date(String(at)).toISOString(),
      seconds: seconds ?? 0,
      verdict,
      measures,
    },
  };
}

/** @returns {Ledger} */
export function emptyLedger() {
  return { version: LEDGER_VERSION, films: [] };
}

/**
 * Add or replace one film's record. Pure: a new ledger comes back.
 * - the same `filmId` keeps only the newer `at`, so a re-render corrects the
 *   film instead of counting it twice;
 * - the cap drops the oldest films, never the ones just learned from.
 * @param {Ledger} ledger
 * @param {FilmRecord} record
 * @param {{ maxFilms?: number }} [o]
 * @returns {{ ledger: Ledger, added: "new" | "replaced" | "older", dropped: string[] }}
 */
export function addRecord(ledger, record, o = {}) {
  const maxFilms = Number.isFinite(o.maxFilms) ? /** @type {number} */ (o.maxFilms) : MAX_FILMS;
  const films = (Array.isArray(ledger?.films) ? ledger.films : []).slice();
  const at = films.findIndex((f) => f.filmId === record.filmId);
  let added = /** @type {"new" | "replaced" | "older"} */ ("new");
  if (at >= 0) {
    if (Date.parse(films[at].at) > Date.parse(record.at)) return { ledger: { version: LEDGER_VERSION, films }, added: "older", dropped: [] };
    films[at] = record;
    added = "replaced";
  } else films.push(record);
  films.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.filmId.localeCompare(b.filmId));
  /** @type {string[]} */
  const dropped = [];
  while (films.length > maxFilms) {
    const gone = films.shift();
    if (gone) dropped.push(gone.filmId);
  }
  return { ledger: { version: LEDGER_VERSION, films }, added, dropped };
}

/** @param {number[]} sorted */
function quantile(sorted, /** @type {number} */ q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * The films the ledger may learn from: the same genre that passed, that
 * actually measured this metric.
 * @param {Ledger} ledger
 * @param {string} genre
 * @param {MetricKey} metric
 */
export function evidenceFor(ledger, genre, metric) {
  const films = (Array.isArray(ledger?.films) ? ledger.films : []).filter((f) => f.genre === genre && f.verdict === "pass");
  return films
    .map((f) => ({ filmId: f.filmId, at: f.at, value: Number(f.measures?.[metric]) }))
    .filter((f) => Number.isFinite(f.value))
    .map((f) => ({ ...f, value: round(f.value, METRICS[metric].digits ?? 2) }));
}

/**
 * @typedef {object} Target
 * @property {MetricKind} kind
 * @property {number | [number, number]} value what the film should reach
 * @property {number | [number, number]} house the doctrine's own number
 * @property {number} films how many passing films are behind the target
 * @property {"learned" | "doctrine"} source
 */

/**
 * One metric's target for this genre: learned from passing films when there
 * are enough of them, otherwise the house standard. A learned target is always
 * pulled back inside the metric's envelope and never relaxed past the
 * doctrine's floor, so no single odd film can redefine the house standard.
 * @param {Ledger} ledger
 * @param {string} genre
 * @param {MetricKey} metric
 * @param {{ minFilms?: number }} [o]
 * @returns {Target}
 */
export function targetFor(ledger, genre, metric, o = {}) {
  const spec = METRICS[metric];
  const house = doctrineFor(genre)[metric];
  const minFilms = Number.isFinite(o.minFilms) ? /** @type {number} */ (o.minFilms) : MIN_FILMS;
  const values = evidenceFor(ledger, genre, metric).map((e) => e.value).sort((a, b) => a - b);
  const films = values.length;
  const [envLo, envHi] = spec.envelope;
  const clamp = (/** @type {number} */ v) => Math.min(envHi, Math.max(envLo, v));
  if (films < minFilms) {
    return { kind: spec.kind, value: house, house, films, source: "doctrine" };
  }
  const d = spec.digits ?? 2;
  if (spec.kind === "band") {
    // The band keeps the house width and moves its centre to where this
    // channel's films actually land, but no further than RELAX.band past the
    // house band: pacing may be learned, a slideshow may not.
    const [houseLo, houseHi] = /** @type {[number, number]} */ (house);
    const half = Math.max((houseHi - houseLo) / 2, 1e-6);
    const centre = Math.min(houseHi * (1 + RELAX.band), Math.max(houseLo * (1 - RELAX.band), quantile(values, 0.5)));
    let lo = clamp(centre - half);
    let hi = clamp(centre + half);
    if (hi - lo < half) {
      if (lo - envLo >= envHi - hi) lo = clamp(hi - half);
      else hi = clamp(lo + half);
    }
    return { kind: "band", value: /** @type {[number, number]} */ ([round(lo, d), round(hi, d)]), house, films, source: "learned" };
  }
  const median = quantile(values, 0.5);
  if (spec.kind === "min") {
    const floor = Math.max(envLo, Number(house) * RELAX.min);
    return { kind: "min", value: round(clamp(Math.max(median, floor)), d), house, films, source: "learned" };
  }
  const ceiling = Math.min(envHi, Number(house) * RELAX.max);
  return { kind: "max", value: round(clamp(Math.min(median, ceiling)), d), house, films, source: "learned" };
}

/**
 * Every target for one genre, plus what the ledger knows.
 * @param {Ledger} ledger
 * @param {string} genre
 * @param {{ minFilms?: number }} [o]
 * @returns {{ genre: string, films: number, passing: number, targets: Record<MetricKey, Target> }}
 */
export function calibratedDoctrine(ledger, genre, o = {}) {
  const g = Object.prototype.hasOwnProperty.call(DOCTRINE, genre) ? genre : "default";
  const films = (Array.isArray(ledger?.films) ? ledger.films : []).filter((f) => f.genre === g);
  /** @type {Record<string, Target>} */
  const targets = {};
  for (const metric of Object.keys(METRICS)) targets[metric] = targetFor(ledger, g, /** @type {MetricKey} */ (metric), o);
  return {
    genre: g,
    films: films.length,
    passing: films.filter((f) => f.verdict === "pass").length,
    targets: /** @type {Record<MetricKey, Target>} */ (targets),
  };
}

/**
 * How close one measure is to its target, 0 to 1.
 * Inside a band is 1; outside it falls away one band-width per unit of error,
 * so 3 s past a 3–6 s band is as wrong as 3 s short of it.
 * @param {number} value
 * @param {Target} target
 */
export function fit(value, target) {
  if (!Number.isFinite(value)) return 0;
  if (target.kind === "band") {
    const [lo, hi] = /** @type {[number, number]} */ (target.value);
    const width = Math.max(hi - lo, 1e-6);
    if (value >= lo && value <= hi) return 1;
    return Math.max(0, 1 - (value < lo ? lo - value : value - hi) / width);
  }
  const want = Number(target.value);
  if (target.kind === "min") return want <= 0 ? 1 : Math.min(1, value / want);
  return value <= 0 ? 1 : Math.min(1, want / value);
}

/**
 * One number for a film's craft, 0–100, weighted by what matters.
 * It is a comparison with this channel's own standard, not a verdict on taste.
 * @param {Measures} measures
 * @param {{ targets: Record<MetricKey, Target> }} doctrine
 */
export function craftIndex(measures, doctrine) {
  let weighted = 0;
  let total = 0;
  for (const [key, spec] of Object.entries(METRICS)) {
    const value = measures[/** @type {MetricKey} */ (key)];
    if (value === null || value === undefined) continue;
    const target = doctrine.targets[/** @type {MetricKey} */ (key)];
    if (!target) continue;
    weighted += fit(Number(value), target) * spec.weight;
    total += spec.weight;
  }
  return total ? round((weighted / total) * 100, 1) : 0;
}

/**
 * Read a ledger from text. A corrupt or future ledger comes back empty with a
 * note instead of throwing: a bad file must never stop a film.
 * @param {string} text
 * @returns {{ ledger: Ledger, notes: Note[] }}
 */
export function parseLedger(text) {
  /** @type {Note[]} */
  const notes = [];
  let raw;
  try {
    raw = JSON.parse(String(text ?? ""));
  } catch {
    return { ledger: emptyLedger(), notes: [{ code: "craft.badJson" }] };
  }
  if (!raw || typeof raw !== "object") return { ledger: emptyLedger(), notes: [{ code: "craft.badJson" }] };
  if (Number(raw.version) > LEDGER_VERSION) return { ledger: emptyLedger(), notes: [{ code: "craft.newerLedger", params: { version: Number(raw.version) } }] };
  /** @type {FilmRecord[]} */
  const films = [];
  for (const f of Array.isArray(raw.films) ? raw.films : []) {
    const id = String(f?.filmId ?? "").trim();
    const at = Date.parse(String(f?.at));
    if (!id || !Number.isFinite(at)) {
      notes.push({ code: "craft.badRecord", params: { filmId: id || "?" } });
      continue;
    }
    /** @type {Measures} */
    const measures = {
      movingShare: null,
      designedPerMinute: null,
      avgShot: null,
      narrationCoverage: null,
      cutsIn30: null,
      longestShot: null,
      cueCoverage: null,
      subtitleGap: null,
    };
    for (const key of /** @type {MetricKey[]} */ (Object.keys(METRICS))) {
      const v = f?.measures?.[key];
      measures[key] = typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    films.push({
      version: LEDGER_VERSION,
      filmId: id,
      genre: Object.prototype.hasOwnProperty.call(DOCTRINE, String(f?.genre)) ? String(f.genre) : "default",
      at: new Date(at).toISOString(),
      seconds: Number.isFinite(Number(f?.seconds)) ? Number(f.seconds) : 0,
      verdict: ["pass", "review", "block", "unknown"].includes(String(f?.verdict)) ? /** @type {Verdict} */ (String(f.verdict)) : "unknown",
      measures,
    });
  }
  films.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.filmId.localeCompare(b.filmId));
  return { ledger: { version: LEDGER_VERSION, films }, notes };
}

/**
 * The ledger as text, stable order, no formatting drift between writers.
 * @param {Ledger} ledger
 */
export function ledgerJson(ledger) {
  return `${JSON.stringify({ version: LEDGER_VERSION, films: Array.isArray(ledger?.films) ? ledger.films : [] }, null, 1)}\n`;
}

/**
 * Two ledgers into one (a film measured on the owner's machine and on a
 * runner), newest record per film winning.
 * @param {Ledger} a
 * @param {Ledger} b
 * @param {{ maxFilms?: number }} [o]
 */
export function mergeLedgers(a, b, o = {}) {
  /** @type {Ledger} */
  let out = emptyLedger();
  for (const film of [...(a?.films ?? []), ...(b?.films ?? [])]) out = addRecord(out, film, o).ledger;
  return out;
}
