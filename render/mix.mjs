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

/** The quietest point of the plan, in dB below the music's own level; 0 when nothing ducks. */
export function deepestDuckDb(plan, o = {}) {
  const music = o.music ?? MIX.music;
  const lowest = plan.reduce((g, w) => Math.min(g, Math.max(0, Math.min(music, w.gain))), music);
  if (lowest >= music) return 0;
  // A curtain is not "very quiet", it is gone: report it as full silence, not as -Infinity.
  return lowest <= 0 ? -60 : Math.round(20 * Math.log10(lowest / music) * 10) / 10;
}
