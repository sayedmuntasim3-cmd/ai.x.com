/**
 * Plan a Quran recitation film, ayah by ayah, on the owner's own recording.
 *
 * Input is what `matchRecitation` found in the recording. Output is the edit
 * list: one scene per ayah, cut only at ayah ends, in the quiet between two
 * ayat, so the recitation is never clipped. Rules kept here in code:
 * - the text on screen is the Tanzil text, verbatim, looked up by surah:ayah
 *   (never written by a model, never taken from the recogniser's spelling);
 * - nothing plays under the recitation: no music, no sound effects, no
 *   ambience; the owner's recording is the only audio and is not altered;
 * - nothing is depicted: pictures are calligraphy-style text cards and legal
 *   nature or architecture footage, never prophets, Companions, angels or God;
 * - anything the recogniser was unsure of is listed for the owner, not guessed.
 */
import { AYAH_COUNTS, ayahText } from "./quran.mjs";

/** Shown on every Quran video, as the Tanzil licence asks. */
export const QURAN_CREDIT = "Quran text: Tanzil.net";

/** What may play under a recitation: nothing but the recitation. */
export const RECITATION_AUDIO = Object.freeze({ music: false, soundEffects: false, ambience: false, voice: "owner-recording-untouched" });

/** What may be on screen under a recitation. */
export const RECITATION_VISUALS = Object.freeze({
  allowed: ["ayah text card", "surah title card", "calligraphy or geometric pattern", "legal nature, sky, desert, sea or architecture footage"],
  forbidden: ["any depiction of a prophet, Companion, angel or Allah", "people's faces", "music or rhythm-matched effects", "text that is not Tanzil's"],
});

const MIN_SCENE_SECONDS = 1.5;
// A silence longer than this between two ayat is shown to the owner: something may not have been recognised.
const LONG_GAP_SECONDS = 6;

/**
 * @typedef {{ id: string, surah: number, ayah: number | null, kind: "title" | "ayah", start: number, end: number, spokenStart: number | null, spokenEnd: number | null, text: string, label: string, complete: boolean, estimated: boolean, needsReview: string[] }} QuranScene
 * @typedef {{ start: number, end: number, text: string }} QuranCaption
 * @typedef {{ ok: boolean, timed: boolean, totalSeconds: number, scenes: QuranScene[], captions: QuranCaption[], credit: string, audio: typeof RECITATION_AUDIO, visuals: typeof RECITATION_VISUALS, rules: string[], review: string[], summary: { surah: number | null, fromAyah: number | null, toAyah: number | null, ayat: number, coverage: number } }} QuranFilmPlan
 */

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * @param {{ match: import("./quran.mjs").RecitationMatch, index: import("./quran.mjs").QuranIndex, totalSeconds: number, surahNames?: { number?: number, arabic?: string, transliteration?: string, english?: string }[] }} o
 * @returns {QuranFilmPlan}
 */
export function planQuranFilm({ match, index, totalSeconds, surahNames = [] }) {
  const rules = ["quran-verbatim", "nothing-under-quran", "no-depiction", "cut-at-ayah-ends", "credit-tanzil"];
  /** @type {string[]} */
  const review = [];
  const total = Number.isFinite(totalSeconds) && totalSeconds > 0 ? r3(totalSeconds) : 0;
  const empty = (/** @type {string} */ why) => ({ ok: false, timed: false, totalSeconds: total, scenes: [], captions: [], credit: QURAN_CREDIT, audio: RECITATION_AUDIO, visuals: RECITATION_VISUALS, rules, review: [why], summary: { surah: null, fromAyah: null, toAyah: null, ayat: 0, coverage: match?.coverage ?? 0 } });
  if (!match?.isQuran || !match.segments.length) return empty("The recording was not recognised as a Quran recitation, so no film is planned.");
  if (!total) return empty("The length of the recording is needed to plan the film.");

  const nameOf = (/** @type {number} */ s) => surahNames.find((n) => n.number === s) ?? surahNames[s - 1] ?? null;

  // Every recognised ayah, in the order it is recited.
  /** @type {{ surah: number, ayah: number, start: number | null, end: number | null, words: number, complete: boolean, ambiguous: boolean }[]} */
  const ayat = [];
  for (const seg of match.segments) {
    for (const a of seg.ayat) {
      if (!(a.surah >= 1 && a.surah <= 114) || !(a.ayah >= 1 && a.ayah <= AYAH_COUNTS[a.surah - 1])) continue;
      ayat.push({ surah: a.surah, ayah: a.ayah, start: a.start, end: a.end, words: Math.max(1, a.matchedWords), complete: a.complete, ambiguous: seg.ambiguous });
    }
    if (seg.ambiguous) review.push(`Surah ${seg.surah}:${seg.fromAyah}-${seg.toAyah} could also be ${seg.alternatives.map((x) => `${x.surah}:${x.fromAyah}-${x.toAyah}`).join(", ")}: check the recording.`);
  }
  if (!ayat.length) return empty("No ayah could be placed.");

  const timed = ayat.every((a) => a.start !== null && a.end !== null);
  // Without word times the ayat share the recording by their length. The owner is told it is an estimate.
  if (!timed) {
    review.push("The recognition gave no word times, so the cuts are estimated from ayah length: send the recording through transcription with word timings for exact cuts.");
    const opening = match.markers.length ? Math.min(total * 0.04, 6) : 0;
    const sum = ayat.reduce((n, a) => n + a.words, 0);
    let at = opening;
    for (const a of ayat) {
      const len = ((total - opening) * a.words) / sum;
      a.start = r3(at);
      a.end = r3(at + len);
      at += len;
    }
  }

  // Order check: a recitation that jumps back is real (repetition) but the owner should know.
  for (let i = 1; i < ayat.length; i += 1) {
    const p = ayat[i - 1];
    const c = ayat[i];
    if (c.start !== null && p.end !== null && c.start + 0.05 < p.end) review.push(`${c.surah}:${c.ayah} starts before ${p.surah}:${p.ayah} ends: the times overlap.`);
    if (c.start !== null && p.end !== null && c.start - p.end > LONG_GAP_SECONDS) review.push(`${r3(c.start - p.end)} s of silence or unrecognised speech between ${p.surah}:${p.ayah} and ${c.surah}:${c.ayah}.`);
  }

  // Cut points: the middle of the quiet between two ayat, so no ayah is ever clipped.
  const first = ayat[0];
  /** @type {number[]} */
  const cuts = [];
  for (let i = 0; i + 1 < ayat.length; i += 1) {
    const e = /** @type {number} */ (ayat[i].end);
    const s = /** @type {number} */ (ayat[i + 1].start);
    cuts.push(r3(Math.min(Math.max((e + s) / 2, e), Math.max(s, e))));
  }

  /** @type {QuranScene[]} */
  const scenes = [];
  const surahTitle = (/** @type {number} */ s) => {
    const n = nameOf(s);
    return n ? [n.arabic, n.transliteration].filter(Boolean).join(" · ") : `Surah ${s}`;
  };
  let sceneStart = 0;
  let previousSurah = 0;
  const basmala = match.markers.find((m) => m.type === "basmala");
  ayat.forEach((a, i) => {
    const end = i + 1 < ayat.length ? cuts[i] : total;
    const text = ayahText(index, a.surah, a.ayah) ?? "";
    /** @type {string[]} */
    const flags = [];
    if (!a.complete) flags.push("Recognition missed the first or last word of this ayah: check it against the recording.");
    if (a.ambiguous) flags.push("The passage could also be another place in the Quran.");
    if (end - sceneStart < MIN_SCENE_SECONDS) flags.push("A very short scene.");
    if (a.surah !== previousSurah) {
      // A surah's opening: a title card runs through the isti'adha and basmala, before the first ayah is spoken.
      const titleEnd = Math.min(Math.max(a.start ?? 0, MIN_SCENE_SECONDS), end);
      if (titleEnd > sceneStart + 0.5 && (a.start ?? 0) > sceneStart + 0.5) {
        const showsBasmala = a.ayah === 1 && a.surah !== 1 && a.surah !== 9 && basmala && i === 0;
        scenes.push({ id: "", surah: a.surah, ayah: null, kind: "title", start: r3(sceneStart), end: r3(titleEnd), spokenStart: null, spokenEnd: null, text: showsBasmala ? (ayahText(index, 1, 1) ?? "") : "", label: surahTitle(a.surah), complete: true, estimated: !timed, needsReview: [] });
        sceneStart = titleEnd;
      }
      previousSurah = a.surah;
    }
    scenes.push({ id: "", surah: a.surah, ayah: a.ayah, kind: "ayah", start: r3(sceneStart), end: r3(end), spokenStart: a.start, spokenEnd: a.end, text, label: `${surahTitle(a.surah)} · ${a.surah}:${a.ayah}`, complete: a.complete, estimated: !timed, needsReview: flags });
    sceneStart = end;
  });
  scenes.forEach((s, i) => { s.id = "Q" + String(i + 1).padStart(4, "0"); });
  for (const s of scenes) for (const f of s.needsReview) review.push(`${s.id} (${s.surah}:${s.ayah}): ${f}`);

  if (match.coverage < 0.9) review.push(`Only ${Math.round(match.coverage * 100)}% of the spoken words were placed in the Quran: the rest may be speech that is not the Quran, or words that were not recognised.`);

  const captions = scenes.filter((s) => s.kind === "ayah" && s.text).map((s) => ({ start: /** @type {number} */ (s.spokenStart ?? s.start), end: /** @type {number} */ (s.spokenEnd ?? s.end), text: s.text }));
  const surahs = new Set(ayat.map((a) => a.surah));
  return {
    ok: true,
    timed,
    totalSeconds: total,
    scenes,
    captions,
    credit: QURAN_CREDIT,
    audio: RECITATION_AUDIO,
    visuals: RECITATION_VISUALS,
    rules,
    review,
    summary: { surah: surahs.size === 1 ? first.surah : null, fromAyah: first.ayah, toAyah: ayat[ayat.length - 1].ayah, ayat: ayat.length, coverage: match.coverage },
  };
}

/**
 * Problems in a finished Quran plan that would break a rule. An empty list
 * means every rule holds; the render refuses to start otherwise.
 * @param {QuranFilmPlan} plan
 * @param {import("./quran.mjs").QuranIndex} index
 * @returns {string[]}
 */
export function checkQuranFilm(plan, index) {
  /** @type {string[]} */
  const problems = [];
  if (!plan.ok) return ["The plan was not made: " + (plan.review[0] ?? "no reason given")];
  let at = 0;
  for (const s of plan.scenes) {
    if (Math.abs(s.start - at) > 0.002) problems.push(`${s.id}: starts at ${s.start} but the previous scene ended at ${at} (gap or overlap).`);
    if (!(s.end > s.start)) problems.push(`${s.id}: ends before it starts.`);
    at = s.end;
    if (s.kind === "ayah") {
      if (s.text !== ayahText(index, s.surah, /** @type {number} */ (s.ayah))) problems.push(`${s.id}: the text is not the verbatim Tanzil text of ${s.surah}:${s.ayah}.`);
      if (s.spokenStart !== null && s.spokenEnd !== null && (s.start > s.spokenStart + 0.002 || s.end < s.spokenEnd - 0.002)) problems.push(`${s.id}: the cut falls inside the recited ayah.`);
    }
  }
  if (Math.abs(at - plan.totalSeconds) > 0.002) problems.push(`The scenes end at ${at}, not at the end of the recording (${plan.totalSeconds}).`);
  if (plan.audio.music || plan.audio.soundEffects || plan.audio.ambience) problems.push("Something is planned under the recitation.");
  return problems;
}

/**
 * Subtitles for the film, one cue per ayah, in SRT.
 * @param {QuranFilmPlan} plan
 */
export function quranSrt(plan) {
  const t = (/** @type {number} */ s) => {
    const ms = Math.round(s * 1000);
    const p = (/** @type {number} */ n, /** @type {number} */ w = 2) => String(n).padStart(w, "0");
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
  };
  return plan.captions.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join("\n");
}
