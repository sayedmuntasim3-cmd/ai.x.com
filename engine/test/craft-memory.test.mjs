import test from "node:test";
import assert from "node:assert/strict";
import {
  DOCTRINE,
  GENRES,
  LEDGER_VERSION,
  MAX_FILMS,
  MIN_FILMS,
  AUDIENCE,
  addAudience,
  addRecord,
  audienceFromRetention,
  audienceHolds,
  calibratedDoctrine,
  craftIndex,
  doctrineFor,
  emptyLedger,
  evidenceFor,
  fit,
  ledgerJson,
  measuresFromReport,
  mergeLedgers,
  parseLedger,
  recordFromReport,
  targetFor,
} from "../src/craft-memory.mjs";

/** The measures a passing house-standard film has. */
const HOUSE = {
  movingShare: 0.65,
  designedPerMinute: 1.4,
  avgShot: 4,
  narrationCoverage: 0.98,
  cutsIn30: 6,
  longestShot: 8,
  cueCoverage: 0.8,
  subtitleGap: 3,
};

/**
 * @param {Record<string, number>} [measures]
 * @param {string} [verdict]
 */
const report = (measures = HOUSE, verdict = "pass") => {
  // The critic nests the subtitle measures; a flat subtitleGap is never real.
  const { subtitleGap, ...rest } = measures;
  return { critic: { verdict, measures: { seconds: 1800, ...rest, subtitles: { maxGap: subtitleGap } } } };
};

/**
 * @param {string} filmId
 * @param {Record<string, number>} [measures]
 * @param {{ genre?: string, at?: string, verdict?: string }} [o]
 */
function rec(filmId, measures = HOUSE, o = {}) {
  const made = recordFromReport({
    filmId,
    report: report(measures, o.verdict ?? "pass"),
    genre: o.genre ?? "history",
    at: o.at ?? "2026-11-01T00:00:00Z",
  });
  assert.equal(made.ok, true);
  return /** @type {any} */ (made).record;
}

/** A ledger of passing films of one genre, one film a day. */
function ledgerOf(count, measures = HOUSE, genre = "history") {
  let ledger = emptyLedger();
  for (let i = 0; i < count; i += 1) {
    ledger = addRecord(ledger, rec(`film-${i}`, measures, { genre, at: `2026-11-0${i + 1}T00:00:00Z` })).ledger;
  }
  return ledger;
}

// --- the house standard ------------------------------------------------

test("the doctrine answers for every genre and falls back to default", () => {
  const fromDefault = doctrineFor("default");
  assert.equal(fromDefault.movingShare, 0.65);
  assert.deepEqual(fromDefault.avgShot, [2.5, 6]);
  // A genre overrides only what it names, and keeps the rest of the house rule.
  const history = doctrineFor("history");
  assert.equal(history.movingShare, 0.7);
  assert.equal(history.narrationCoverage, 0.98);
  // An unknown genre is never a crash: it is the default.
  assert.deepEqual(doctrineFor("cooking"), fromDefault);
  assert.deepEqual(doctrineFor(undefined), fromDefault);
  // A caller cannot change the doctrine by editing what it was handed.
  history.movingShare = 0.1;
  assert.equal(doctrineFor("history").movingShare, 0.7);
  assert.ok(GENRES.includes("biography") && !GENRES.includes("default"));
});

// --- reading a finished film -------------------------------------------

test("a critic report becomes measures, and silence stays null", () => {
  const full = measuresFromReport(report());
  assert.equal(full.verdict, "pass");
  assert.equal(full.seconds, 1800);
  assert.equal(full.measures.movingShare, 0.65);
  assert.equal(full.measures.subtitleGap, 3);
  const bare = measuresFromReport({ critic: { measures: { avgShot: 4 } } });
  assert.equal(bare.verdict, "unknown");
  assert.equal(bare.measures.avgShot, 4);
  assert.equal(bare.measures.designedPerMinute, null);
  assert.equal(bare.seconds, null);
});

test("a film without an id, a time or any measure is refused", () => {
  assert.equal(recordFromReport({ filmId: "", report: report(), at: "2026-11-01T00:00:00Z" }).ok, false);
  assert.equal(recordFromReport({ filmId: "x", report: report(), at: "not a time" }).ok, false);
  const empty = recordFromReport({ filmId: "x", report: { critic: { verdict: "pass" } }, at: "2026-11-01T00:00:00Z" });
  assert.equal(empty.ok, false);
  assert.deepEqual(/** @type {any} */ (empty).notes.map((/** @type {any} */ n) => n.code), ["craft.noMeasures"]);
});

test("an unknown genre is filed under default, and says so", () => {
  const made = recordFromReport({ filmId: "x", report: report(), genre: "Cookery", at: "2026-11-01T00:00:00Z" });
  assert.equal(made.ok, true);
  const record = /** @type {any} */ (made).record;
  assert.equal(record.genre, "default");
  assert.equal(record.at, "2026-11-01T00:00:00.000Z");
  assert.equal(record.version, LEDGER_VERSION);
  assert.deepEqual(/** @type {any} */ (made).notes.map((/** @type {any} */ n) => n.code), ["craft.unknownGenre"]);
});

// --- keeping the ledger ------------------------------------------------

test("a film is kept once, and a newer reading of it wins", () => {
  let ledger = emptyLedger();
  assert.equal(addRecord(ledger, rec("a")).added, "new");
  ledger = addRecord(ledger, rec("a")).ledger;
  const newer = rec("a", { ...HOUSE, movingShare: 0.9 }, { at: "2026-12-01T00:00:00Z" });
  const replaced = addRecord(ledger, newer);
  assert.equal(replaced.added, "replaced");
  assert.equal(replaced.ledger.films.length, 1);
  assert.equal(replaced.ledger.films[0].measures.movingShare, 0.9);
  // An older reading of the same film never overwrites the newer one.
  const older = rec("a", { ...HOUSE, movingShare: 0.2 }, { at: "2026-01-01T00:00:00Z" });
  const ignored = addRecord(replaced.ledger, older);
  assert.equal(ignored.added, "older");
  assert.equal(ignored.ledger.films[0].measures.movingShare, 0.9);
});

test("the ledger is capped, and the oldest film goes first", () => {
  let ledger = emptyLedger();
  for (let i = 0; i < 5; i += 1) ledger = addRecord(ledger, rec(`f${i}`, HOUSE, { at: `2026-11-0${i + 1}T00:00:00Z` })).ledger;
  const capped = addRecord(ledger, rec("f5", HOUSE, { at: "2026-11-06T00:00:00Z" }), { maxFilms: 3 });
  assert.equal(capped.ledger.films.length, 3);
  assert.deepEqual(capped.dropped, ["f0", "f1", "f2"]);
  assert.deepEqual(capped.ledger.films.map((f) => f.filmId), ["f3", "f4", "f5"]);
  assert.equal(MAX_FILMS, 200);
});

test("only passing films of the same genre are evidence", () => {
  let ledger = ledgerOf(2);
  ledger = addRecord(ledger, rec("failed", HOUSE, { at: "2026-11-03T00:00:00Z", verdict: "block" })).ledger;
  ledger = addRecord(ledger, rec("science-1", HOUSE, { genre: "science", at: "2026-11-04T00:00:00Z" })).ledger;
  assert.deepEqual(evidenceFor(ledger, "history", "movingShare").map((e) => e.filmId), ["film-0", "film-1"]);
  assert.deepEqual(evidenceFor(ledger, "motivation", "movingShare"), []);
});

// --- learning without learning down -----------------------------------

test("two films are an accident: the house standard still rules", () => {
  const ledger = ledgerOf(2);
  const target = targetFor(ledger, "history", "movingShare");
  assert.equal(target.source, "doctrine");
  assert.equal(target.value, 0.7);
  assert.equal(target.films, 2);
  assert.equal(MIN_FILMS, 3);
});

test("a learned minimum follows the films but never past the doctrine's floor", () => {
  const better = targetFor(ledgerOf(3, { ...HOUSE, movingShare: 0.84 }), "history", "movingShare");
  assert.equal(better.source, "learned");
  assert.equal(better.value, 0.84);

  // Three lazy films would drag the target down to 0.31; the floor is 85% of 0.7.
  const lazy = targetFor(ledgerOf(3, { ...HOUSE, movingShare: 0.31 }), "history", "movingShare");
  assert.equal(lazy.source, "learned");
  assert.equal(lazy.value, 0.595);
  assert.ok(lazy.value >= 0.7 * 0.85 - 1e-9);
});

test("a learned maximum tightens, but not past 25% beyond the house rule", () => {
  const wild = targetFor(ledgerOf(3, { ...HOUSE, longestShot: 14 }), "history", "longestShot");
  assert.equal(wild.source, "learned");
  // history allows 9 s, so a 14 s habit may tighten it only to 9 × 1.25.
  assert.equal(wild.value, 11.3);
  const tight = targetFor(ledgerOf(3, { ...HOUSE, longestShot: 5 }), "history", "longestShot");
  assert.equal(tight.value, 5);
});

test("a learned band keeps the house width and moves to where the films sit", () => {
  // history's house band is 3–7 s (width 4); these films cut at 8, 9 and 10 s,
  // so the band moves to 9 with the house width — same rhythm, this channel's pace.
  let ledger = emptyLedger();
  [8, 9, 10].forEach((avgShot, i) => {
    ledger = addRecord(ledger, rec(`b${i}`, { ...HOUSE, avgShot }, { at: `2026-11-0${i + 1}T00:00:00Z` })).ledger;
  });
  const band = targetFor(ledger, "history", "avgShot");
  assert.equal(band.source, "learned");
  assert.deepEqual(band.value, [7, 11]);
  const [lo, hi] = /** @type {any} */ (band.value);
  assert.equal(hi - lo, 4, "the learned band keeps the house width");
});

test("every metric gets a target, and the counts are the ledger's own", () => {
  const doctrine = calibratedDoctrine(ledgerOf(4), "history");
  assert.equal(doctrine.genre, "history");
  assert.equal(doctrine.films, 4);
  assert.equal(doctrine.passing, 4);
  assert.equal(Object.keys(doctrine.targets).length, 8);
  assert.equal(doctrine.targets.avgShot.kind, "band");
  assert.equal(calibratedDoctrine(emptyLedger(), "unknown-genre").genre, "default");
});

// --- one number for a film's craft ------------------------------------

test("a film on the house standard scores 100; a far film scores low", () => {
  const targets = calibratedDoctrine(emptyLedger(), "default");
  assert.equal(craftIndex(HOUSE, targets), 100);
  const weak = craftIndex({ ...HOUSE, movingShare: 0.2 }, targets);
  assert.ok(weak < 95 && weak > 0);
  // Nothing measured is not a perfect film.
  assert.equal(craftIndex(/** @type {any} */ ({}), targets), 0);
});

test("fit is 1 inside a band and falls away by the band's own width", () => {
  const band = /** @type {any} */ ({ kind: "band", value: [3, 7] });
  assert.equal(fit(5, band), 1);
  assert.equal(fit(9, band), 0.5);
  assert.equal(fit(3, band), 1);
  assert.equal(fit(1, band), 0.5);
  assert.equal(fit(80, /** @type {any} */ ({ kind: "max", value: 8 })), 0.1);
  assert.equal(fit(0.4, /** @type {any} */ ({ kind: "min", value: 0.8 })), 0.5);
});

// --- storage -----------------------------------------------------------

test("a corrupt or newer ledger never stops a film", () => {
  const broken = parseLedger("{not json");
  assert.equal(broken.ledger.films.length, 0);
  assert.equal(broken.notes[0].code, "craft.badJson");
  assert.equal(parseLedger("").ledger.films.length, 0);
  const future = parseLedger(JSON.stringify({ version: LEDGER_VERSION + 5, films: [] }));
  assert.equal(future.ledger.films.length, 0);
  assert.equal(future.notes[0].code, "craft.newerLedger");
});

test("a ledger survives a round trip, and a bad record is skipped alone", () => {
  const ledger = ledgerOf(3);
  const again = parseLedger(ledgerJson(ledger));
  assert.deepEqual(again.ledger, ledger);
  assert.deepEqual(again.notes, []);
  const dirty = parseLedger(JSON.stringify({
    version: LEDGER_VERSION,
    films: [{ filmId: "", at: "2026-11-01T00:00:00Z" }, { filmId: "ok", at: "2026-11-02T00:00:00Z", genre: "history", verdict: "pass", measures: { movingShare: 0.7, bogus: "x" } }],
  }));
  assert.equal(dirty.ledger.films.length, 1);
  assert.equal(dirty.ledger.films[0].filmId, "ok");
  assert.equal(dirty.ledger.films[0].measures.movingShare, 0.7);
  assert.equal(dirty.notes.filter((n) => n.code === "craft.badRecord").length, 1);
});

test("two machines' ledgers merge, the newest reading of a film winning", () => {
  const a = ledgerOf(2);
  const b = addRecord(emptyLedger(), rec("film-0", { ...HOUSE, movingShare: 0.9 }, { at: "2026-12-05T00:00:00Z" })).ledger;
  const merged = mergeLedgers(a, b);
  assert.equal(merged.films.length, 2);
  assert.equal(merged.films.find((f) => f.filmId === "film-0")?.measures.movingShare, 0.9);
});

test("the doctrine is data a reader can check, not a magic number", () => {
  assert.ok(Object.isFrozen(DOCTRINE));
  for (const genre of Object.keys(DOCTRINE)) {
    const rule = DOCTRINE[/** @type {keyof typeof DOCTRINE} */ (genre)];
    assert.ok(Number(rule.movingShare) > 0 && Number(rule.movingShare) <= 1, `${genre} moving share`);
    const band = rule.avgShot;
    assert.ok(Array.isArray(band) && band[0] > 1 && band[1] > band[0], `${genre} shot band`);
  }
});

// --- the audience -------------------------------------------------------

test("a published film's retention becomes its audience, and a film the audience held is evidence", () => {
  let ledger = addRecord(emptyLedger(), rec("held", HOUSE, { verdict: "review", at: "2026-11-02T00:00:00Z" })).ledger;
  const curve = { videoId: "abc12345678", at30: 71.4, half: 44.2, end: 31.8, at: "2026-11-10T00:00:00Z", drops: [{ scene: "SC0007", start: 61.2, perMinute: 4.1, said: "the gears" }], holds: [{ scene: "SC0004", start: 30.1, said: "the size of a shoebox" }] };
  const audience = audienceFromRetention(curve, "2026-11-10T00:00:00Z");
  assert.equal(audience?.at30, 71.4);
  assert.equal(audienceHolds(audience), true);
  const made = addAudience(ledger, { filmId: "held", retention: curve, at: "2026-11-10T00:00:00Z" });
  assert.equal(made.ok, true);
  ledger = made.ledger;
  assert.equal(ledger.films[0].verdict, "pass", "the audience earned the cautious review a pass");
  assert.equal(ledger.films[0].audience?.drops[0].scene, "SC0007");
  assert.deepEqual(evidenceFor(ledger, "history", "designedPerMinute").map((e) => e.filmId), ["held"]);
});

test("a film nobody watched teaches nothing, and a blocked film is never evidence", () => {
  let ledger = addRecord(emptyLedger(), rec("thin", HOUSE, { verdict: "review", at: "2026-11-02T00:00:00Z" })).ledger;
  ledger = addAudience(ledger, { filmId: "thin", retention: { at30: 18, end: 3 }, at: "2026-11-10T00:00:00Z" }).ledger;
  assert.equal(ledger.films[0].verdict, "review");
  assert.deepEqual(evidenceFor(ledger, "history", "designedPerMinute"), []);
  let blocked = addRecord(emptyLedger(), rec("bad", HOUSE, { verdict: "block", at: "2026-11-03T00:00:00Z" })).ledger;
  blocked = addAudience(blocked, { filmId: "bad", retention: { at30: 90, end: 60 }, at: "2026-11-10T00:00:00Z" }).ledger;
  assert.equal(blocked.films[0].verdict, "block", "a block is a defect the audience cannot excuse");
  assert.deepEqual(evidenceFor(blocked, "history", "designedPerMinute"), []);
});

test("an audience survives a re-measure and a shelf-to-shelf write", () => {
  let ledger = addRecord(emptyLedger(), rec("film-a", HOUSE, { at: "2026-11-02T00:00:00Z" })).ledger;
  ledger = addAudience(ledger, { filmId: "film-a", retention: { at30: 64, half: 40, end: 28 }, at: "2026-11-10T00:00:00Z" }).ledger;
  // The film is measured again later: the curve belongs to the published cut and stays.
  ledger = addRecord(ledger, rec("film-a", HOUSE, { at: "2026-11-20T00:00:00Z" })).ledger;
  assert.equal(ledger.films[0].audience?.at30, 64);
  const reread = parseLedger(ledgerJson(ledger)).ledger;
  assert.equal(reread.films[0].audience?.end, 28);
  assert.equal(addAudience(ledger, { filmId: "missing", retention: { at30: 50, end: 30 } }).ok, false);
});

test("the shot plan's rhythm only gets tighter from the ledger", async () => {
  const { rhythmFrom, ledgerGenre, calibratedDoctrine, craftReport } = await import("../src/craft-memory.mjs");
  assert.equal(ledgerGenre("documentary"), "default");
  assert.equal(ledgerGenre("History"), "history");
  const plan = { target: 4.5, median: /** @type {[number, number]} */ ([2.5, 6]), max: 8 };
  assert.deepEqual(rhythmFrom(null, plan), { ...plan, from: "plan" });
  // History doctrine (3-7 s, 9 s longest) over a 2.5-6 s plan: the overlap 3-6, the plan's own 8 s cap.
  const house = rhythmFrom(calibratedDoctrine(emptyLedger(), "history"), plan);
  assert.deepEqual(house, { target: 4.5, median: [3, 6], max: 8, from: "doctrine" });
  // Three passing films that cut fast teach a tighter band and a shorter hold.
  let ledger = emptyLedger();
  for (let i = 0; i < 3; i += 1) {
    ledger = addRecord(ledger, { version: 1, filmId: `f${i}`, genre: "history", at: `2026-11-2${i}T00:00:00Z`, seconds: 180, verdict: "pass", measures: { movingShare: 0.8, designedPerMinute: 2, avgShot: 3, narrationCoverage: 1, cutsIn30: 9, longestShot: 6, cueCoverage: 0.9, subtitleGap: 2 } }).ledger;
  }
  const learned = rhythmFrom(calibratedDoctrine(ledger, "history"), plan);
  assert.equal(learned.from, "learned");
  assert.ok(learned.median[0] >= plan.median[0] && learned.median[1] <= plan.median[1]);
  assert.ok(learned.max <= plan.max && learned.max >= learned.median[1]);
  assert.ok(learned.target >= learned.median[0] && learned.target <= learned.median[1]);
  // A sloppy ledger (slow films) never loosens the plan.
  let slow = emptyLedger();
  for (let i = 0; i < 3; i += 1) slow = addRecord(slow, { version: 1, filmId: `s${i}`, genre: "history", at: `2026-11-2${i}T00:00:00Z`, seconds: 180, verdict: "pass", measures: { movingShare: 0.5, designedPerMinute: 0.6, avgShot: 11, narrationCoverage: 0.9, cutsIn30: 2, longestShot: 19, cueCoverage: 0.5, subtitleGap: 7 } }).ledger;
  const loose = rhythmFrom(calibratedDoctrine(slow, "history"), plan);
  assert.ok(loose.median[1] <= plan.median[1] && loose.max <= plan.max);
  const rep = craftReport({ movingShare: 0.8, designedPerMinute: 2, avgShot: 3, narrationCoverage: 1, cutsIn30: 9, longestShot: 6, cueCoverage: 0.9, subtitles: { maxGap: 2 } }, calibratedDoctrine(ledger, "history"));
  assert.equal(rep.index, 100);
  assert.deepEqual(rep.below, []);
  assert.equal(rep.films, 3);
});
