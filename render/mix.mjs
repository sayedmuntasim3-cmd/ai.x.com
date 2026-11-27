/**
 * The mix plan of a film's music: low under the narrator's voice, gone in
 * the breath before a designed hit, back on the cut.
 *
 * Two things are planned here, and both are measured by the critic (M6):
 *  - ducking: the music drops while the narrator speaks, so the words are
 *    never fought by the score;
 *  - curtains: the music leaves (with the effects that belong to the moment)
 *    for a beat before a chapter's riser lands or a flash hits, so the reveal
 *    arrives out of silence instead of on top of a wall of sound.
 *
 * The plan becomes one ffmpeg volume expression (eval=frame), so the duck is
 * smooth (a ramp, not a step) and the same numbers can be checked by tests.
 */

/** @typedef {{ start: number, end: number }} Window */
/** @typedef {{ start: number, end: number, gain: number }} GainWindow */

export const MIX = Object.freeze({
  /** The music's level under the whole film (a gain, not dB). */
  music: 0.3,
  /** What is left of it while the narrator speaks: about -10.5 dB, past the 8 dB the mission asks for. */
  duck: 0.3,
  /** Seconds the music takes to fall and to come back. */
  attack: 0.12,
  release: 0.28,
});

/** A curtain is the music out: the riser climbs into the cut, the hit lands in the hole. */
export const CURTAINS = Object.freeze({ riser: { lead: 0.08, tail: 0.3 }, boom: { lead: 0.35, tail: 0.12 } });

/**
 * Merge windows that touch or are closer than `gap` seconds, so one duck is one
 * ramp instead of a stutter, and the expression stays short.
 * @param {Window[]} windows @param {number} [gap]
 * @returns {Window[]}
 */
export function mergeWindows(windows, gap = 0.12) {
  const sorted = windows.filter((w) => w.end > w.start).map((w) => ({ start: Math.max(0, w.start), end: Math.max(0, w.end) })).sort((a, b) => a.start - b.start);
  /** @type {Window[]} */
  const out = [];
  for (const w of sorted) {
    const last = out[out.length - 1];
    if (last && w.start <= last.end + gap) last.end = Math.max(last.end, w.end);
    else out.push({ ...w });
  }
  return out;
}

/**
 * The stretches where the narrator speaks: the music ducks under each.
 * @param {{ start: number, end: number, file: string | null }[]} pieces
 * @returns {Window[]}
 */
export function voiceWindows(pieces) {
  return mergeWindows(pieces.filter((p) => p.file).map((p) => ({ start: p.start, end: p.end })), 0.3);
}

/**
 * Where the music leaves completely before a designed moment: a riser into a
 * chapter's first shot (the cut is at the end of the riser) and a flash's boom.
 * @param {{ token: string, start: number, end: number, kind?: string }[]} sounds
 * @returns {Window[]}
 */
export function curtainWindows(sounds) {
  /** @type {Window[]} */
  const out = [];
  for (const s of sounds) {
    if (s.kind === "bed") continue;
    if (s.token === "AUTO-RISER") out.push({ start: s.start - CURTAINS.riser.lead, end: s.end + CURTAINS.riser.tail });
    else if (s.token === "AUTO-BOOM") out.push({ start: s.start - CURTAINS.boom.lead, end: s.end + CURTAINS.boom.tail });
  }
  return mergeWindows(out, 0.2);
}

/**
 * Every window the music's gain changes in, as absolute gains.
 * A curtain wins over a duck: the music is out, wherever a voice happens to be.
 * @param {{ voice?: Window[], curtains?: Window[], music?: number, duck?: number }} p
 * @returns {GainWindow[]}
 */
export function gainPlan(p = {}) {
  const music = p.music ?? MIX.music;
  const duck = p.duck ?? MIX.duck;
  /** @type {GainWindow[]} */
  const out = (p.voice ?? []).map((w) => ({ ...w, gain: music * duck }));
  for (const w of p.curtains ?? []) out.push({ ...w, gain: 0 });
  return out.sort((a, b) => a.start - b.start);
}

/**
 * The music's gain through the film, as an ffmpeg expression for
 * `volume=...:eval=frame`. Ramps in and out of every window.
 * @param {GainWindow[]} plan @param {{ music?: number, attack?: number, release?: number }} [o]
 * @returns {string}
 */
export function musicGainExpression(plan, o = {}) {
  const music = o.music ?? MIX.music;
  const attack = o.attack ?? MIX.attack;
  const release = o.release ?? MIX.release;
  if (!plan.length) return String(music);
  const r = (/** @type {number} */ n) => String(Math.round(n * 10000) / 10000);
  let expr = String(music);
  for (const w of plan) {
    const target = Math.max(0, Math.min(music, w.gain));
    if (music <= 0 || target >= music) continue;
    const depth = Math.round((1 - target / music) * 10000) / 10000;
    expr += `*(1-${depth}*clip((t-${r(w.start)})/${r(attack)},0,1)*clip((${r(w.end + release)}-t)/${r(release)},0,1))`;
  }
  return expr;
}

/**
 * The same gain in JavaScript, sample by sample, so a test can prove the plan
 * does what the expression says (the expression is the renderer's copy of this).
 * @param {number} t @param {GainWindow[]} plan @param {{ music?: number, attack?: number, release?: number }} [o]
 */
export function musicGainAt(t, plan, o = {}) {
  const music = o.music ?? MIX.music;
  const attack = o.attack ?? MIX.attack;
  const release = o.release ?? MIX.release;
  let gain = music;
  for (const w of plan) {
    const target = Math.max(0, Math.min(music, w.gain));
    if (target >= music) continue;
    const down = Math.min(1, Math.max(0, (t - w.start) / attack));
    const up = Math.min(1, Math.max(0, (w.end + release - t) / release));
    gain *= 1 - (1 - target / music) * down * up;
  }
  return gain;
}

/**
 * Whether the music follows the cut (M5): a chapter's turn is marked by a new
 * cue, or by a riser that lands on it, and the score covers most of the film.
 * Measured, not assumed, so the report can say where it does not.
 * @param {{ music?: { cue: string, start: number, end: number }[], video?: { start: number, chapterTitle?: string }[], sfx?: { token: string, start: number, end: number }[] }} t
 * @returns {{ cues: number, coveredShare: number, turns: { at: number, marked: boolean }[], unmarked: number[] }}
 */
export function scoreReport(t = {}) {
  const music = [...(t.music ?? [])].sort((a, b) => a.start - b.start);
  const total = Math.max(0, ...music.map((m) => m.end), ...(t.video ?? []).map((v) => v.start));
  const covered = music.reduce((n, m) => n + Math.max(0, m.end - m.start), 0);
  // A mark is a new cue (or the same cue re-entering after a gap): a segment boundary inside one cue is not a change.
  const changes = music.filter((m, i) => i === 0 || m.cue !== music[i - 1].cue || m.start - music[i - 1].end > 0.5).map((m) => m.start);
  // A riser ends on its moment, so its start is its landing time minus its own length.
  const landings = (t.sfx ?? []).filter((s) => s.token === "AUTO-RISER").map((s) => s.end);
  const turns = (t.video ?? []).filter((v) => v.chapterTitle).map((v) => v.start).map((at) => ({
    at,
    marked: changes.some((c) => Math.abs(c - at) < 1.5) || landings.some((l) => Math.abs(l - at) < 1.5),
  }));
  return {
    cues: music.length,
    coveredShare: total ? Math.round((covered / total) * 100) / 100 : 0,
    turns,
    unmarked: turns.filter((x) => !x.marked).map((x) => x.at),
  };
}

/** How fast the room empties into a breath and comes back out of it. */
export const SILENCE = Object.freeze({ ramp: 0.15 });

/**
 * A steady level with holes in it, as an ffmpeg expression for
 * `volume=...:eval=frame`: the ambience of a scene, emptied for the breath
 * before a reveal. Windows are film seconds; `offset` is where the piece
 * itself starts, so the expression counts from the piece's own first sample.
 * @param {Window[]} windows @param {number} [level] @param {{ offset?: number, ramp?: number }} [o]
 * @returns {string}
 */
export function quietExpression(windows, level = 1, o = {}) {
  const offset = o.offset ?? 0;
  const ramp = o.ramp ?? SILENCE.ramp;
  const r = (/** @type {number} */ n) => String(Math.round(n * 10000) / 10000);
  let expr = String(level);
  for (const w of windows) {
    const a = Math.max(0, w.start - offset);
    const b = Math.max(0, w.end - offset);
    if (b - a <= 0) continue;
    // Down into the hole on the way in, back out of it after the hit.
    expr += `*(1-clip((t-${r(a)})/${r(ramp)},0,1)*clip((${r(b + ramp)}-t)/${r(ramp)},0,1))`;
  }
  return expr;
}

/** The narration's loudness arc: each chapter opens close and soft, and the voice comes up to its full level. */
export const RIDE = Object.freeze({ openDb: -7, rampMax: 40, sectionMax: 150, rampShare: 0.4, minChapter: 20, maxChapters: 200 });

/**
 * The fader ridden by hand, as an ffmpeg expression for the narration's `volume=...:eval=frame`.
 * A narrator held at one level makes a 1.3 LU wall (film ccd86532, 27 Nov); an editor lets every chapter
 * open softer and lifts the voice into it, which gives the film a loudness range without a compressor.
 * Chapters are `[start, end)` in film seconds; the opening dips to `openDb` and climbs to 0 dB over
 * min(rampMax, rampShare of the chapter). Returns "1" when there is nothing to ride.
 * @param {Window[]} chapters @param {{ openDb?: number, rampMax?: number, rampShare?: number, minChapter?: number, maxChapters?: number }} [o]
 * @returns {string}
 */
export function voiceRideExpression(chapters, o = {}) {
  const openDb = o.openDb ?? RIDE.openDb;
  const rampMax = o.rampMax ?? RIDE.rampMax;
  const rampShare = o.rampShare ?? RIDE.rampShare;
  const minChapter = o.minChapter ?? RIDE.minChapter;
  const max = o.maxChapters ?? RIDE.maxChapters;
  const r = (/** @type {number} */ n) => String(Math.round(n * 1000) / 1000);
  const terms = chapters
    .filter((c) => c.end - c.start >= minChapter)
    .slice(0, max)
    .map((c) => {
      const ramp = Math.max(1, Math.min(rampMax, (c.end - c.start) * rampShare));
      return `between(t,${r(c.start)},${r(c.end)})*${openDb}*(1-clip((t-${r(c.start)})/${r(ramp)},0,1))`;
    });
  if (!terms.length) return "1";
  return `pow(10,(${terms.join("+")})/20)`;
}

/**
 * The same ride in JavaScript, in dB at second t, so a test proves the expression's intent.
 * @param {number} t @param {Window[]} chapters @param {Parameters<typeof voiceRideExpression>[1]} [o]
 */
export function voiceRideDbAt(t, chapters, o = {}) {
  const openDb = o.openDb ?? RIDE.openDb;
  const rampMax = o.rampMax ?? RIDE.rampMax;
  const rampShare = o.rampShare ?? RIDE.rampShare;
  const minChapter = o.minChapter ?? RIDE.minChapter;
  let db = 0;
  for (const c of chapters.filter((x) => x.end - x.start >= minChapter).slice(0, o.maxChapters ?? RIDE.maxChapters)) {
    if (t < c.start || t > c.end) continue;
    const ramp = Math.max(1, Math.min(rampMax, (c.end - c.start) * rampShare));
    db += openDb * (1 - Math.min(1, Math.max(0, (t - c.start) / ramp)));
  }
  return db;
}

/** Chapter windows from a timeline's video shots: a chapter runs from its titled shot to the next titled shot (or the end). @param {{ start: number, end: number, chapterTitle?: string }[]} video @returns {Window[]} */
export function chapterWindows(video) {
  const shots = [...(video ?? [])].sort((a, b) => a.start - b.start);
  const marks = shots.filter((v) => v.chapterTitle).map((v) => v.start);
  const end = shots.length ? Math.max(...shots.map((v) => v.end)) : 0;
  return marks.map((start, i) => ({ start, end: i + 1 < marks.length ? marks[i + 1] : end }));
}

/**
 * The sections the fader rides: the chapters when the film has titled ones, otherwise the score's cues
 * (a voice film has one chapter and about a cue every four minutes); any section longer than `sectionMax`
 * is cut into equal parts, so the voice comes up out of a soft opening at least every two and a half minutes.
 * @param {{ video?: { start: number, end: number, chapterTitle?: string }[], music?: { cue: string, start: number, end: number }[], durationSeconds?: number }} t
 * @param {{ sectionMax?: number }} [o]
 * @returns {Window[]}
 */
export function rideSections(t, o = {}) {
  const sectionMax = o.sectionMax ?? RIDE.sectionMax;
  const total = Number(t.durationSeconds) || Math.max(0, ...(t.video ?? []).map((v) => v.end));
  let base = chapterWindows(t.video ?? []);
  if (base.length < 2) {
    const cues = [...(t.music ?? [])].sort((a, b) => a.start - b.start);
    const marks = cues.filter((m, i) => i === 0 || m.cue !== cues[i - 1].cue).map((m) => m.start);
    if (!marks.length || marks[0] > 0) marks.unshift(0);
    base = marks.map((start, i) => ({ start, end: i + 1 < marks.length ? marks[i + 1] : total }));
  }
  /** @type {Window[]} */
  const out = [];
  for (const w of base) {
    const len = w.end - w.start;
    const parts = Math.max(1, Math.ceil(len / sectionMax));
    for (let i = 0; i < parts; i += 1) out.push({ start: w.start + (len * i) / parts, end: w.start + (len * (i + 1)) / parts });
  }
  return out.filter((w) => w.end > w.start);
}

/** The quietest point of the plan, in dB below the music's own level; 0 when nothing ducks. */
export function deepestDuckDb(plan, o = {}) {
  const music = o.music ?? MIX.music;
  const lowest = plan.reduce((g, w) => Math.min(g, Math.max(0, Math.min(music, w.gain))), music);
  if (lowest >= music) return 0;
  // A curtain is not "very quiet", it is gone: report it as full silence, not as -Infinity.
  return lowest <= 0 ? -60 : Math.round(20 * Math.log10(lowest / music) * 10) / 10;
}
