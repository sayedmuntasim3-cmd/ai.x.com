/**
 * The free score: what each music cue of the S4 plan should sound like, read from its own brief
 * ("Tense pulse, low string ostinato, sub hits; 120", "Sparse felt piano and cello; 68").
 * render/score-synth.mjs plays the plan into an original instrumental track, so a film without a
 * paid music service never plays its wordless scenes in dead silence. The music is made by our
 * own code from scratch: nobody else's recording, so no licence to track and nothing for a
 * content-ID system to match.
 *
 * Never for a film whose music policy is not "score" (Quran recitation: nothing under it; Islamic
 * content and the Arabic version: no instruments). Pure module.
 */

/**
 * @typedef {"tense" | "sad" | "warm" | "wonder" | "driving" | "neutral"} Mood
 * @typedef {"guitar" | "piano" | "marimba" | "pizzicato"} Pluck
 * @typedef {{ cue: string, brief: string, bpm: number | null }} MusicCue
 * @typedef {{ cue: string, mood: Mood, mode: "minor" | "major" | "dorian", root: number, bpm: number,
 *   chords: [number, "m" | "M"][], layers: { pad: boolean, low: boolean, pulse: boolean, pluck: Pluck | null, perc: boolean, hits: boolean, sparse: boolean },
 *   intensity: number, why: string }} ScorePlan
 *   root: MIDI note of the key's tonic in the low register; chords: [semitones above the root, quality], two bars each
 */

const MOODS = /** @type {[Mood, RegExp][]} */ ([
  ["tense", /\b(tens(e|ion)|suspense|dark|ominous|thriller|danger|trailer|threat|dread|menac)/i],
  ["sad", /\b(sad|melanch|grief|loss|sorrow|somber|sombre|elegy|lament|tragic|mourn)/i],
  ["driving", /\b(driving|road|chase|energ|momentum|clockwork|ticking|race|run)/i],
  ["wonder", /\b(wonder|awe|epic|majestic|soar|vast|discover|inspir|triumph|heroic|space)/i],
  ["warm", /\b(warm|hope|gentle|tender|nostalg|morning|home|bright|light|uplift)/i],
]);

const DEFAULT_BPM = /** @type {Record<Mood, number>} */ ({ tense: 96, sad: 64, driving: 104, wonder: 72, warm: 80, neutral: 76 });

/** Chord cycles per mode, as [semitones above the tonic, quality]: four chords, two bars each. */
const CYCLES = /** @type {Record<"minor" | "major" | "dorian", [number, "m" | "M"][][]>} */ ({
  minor: [[[0, "m"], [8, "M"], [3, "M"], [10, "M"]], [[0, "m"], [5, "m"], [8, "M"], [7, "m"]]],
  major: [[[0, "M"], [7, "M"], [9, "m"], [5, "M"]], [[0, "M"], [5, "M"], [9, "m"], [7, "M"]]],
  dorian: [[[0, "m"], [10, "M"], [5, "M"], [0, "m"]], [[0, "m"], [3, "M"], [10, "M"], [5, "M"]]],
});

/** A stable small number from a cue id, so the same cue always gets the same key and pattern. @param {string} s */
export function seedOf(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/**
 * The plan for one cue.
 * @param {MusicCue} c
 * @returns {ScorePlan}
 */
export function scorePlan(c) {
  const brief = String(c.brief ?? "");
  const mood = MOODS.find(([, re]) => re.test(brief))?.[0] ?? "neutral";
  const mode = mood === "tense" || mood === "sad" || /\bminor\b/i.test(brief) ? "minor" : mood === "warm" || mood === "wonder" || /\bmajor\b/i.test(brief) ? "major" : "dorian";
  const seed = seedOf(c.cue);
  const roots = [40, 41, 43, 45, 46, 38]; // E2 F2 G2 A2 Bb2 D2
  const bpm = c.bpm && c.bpm >= 50 && c.bpm <= 160 ? c.bpm : DEFAULT_BPM[mood];
  // The instrument named first wins ("marimba or felt piano" is a marimba).
  const named = /** @type {[Pluck, RegExp][]} */ ([["guitar", /\b(guitar|nylon|acoustic)/i], ["piano", /\b(piano|keys)/i], ["marimba", /\b(marimba|mallet|xylophone|clockwork|celesta)/i], ["pizzicato", /\b(pizzicato|pizz|harp)/i]])
    .map(([kind, re]) => /** @type {[Pluck, number]} */ ([kind, brief.search(re)])).filter(([, at]) => at >= 0).sort((x, y) => x[1] - y[1]);
  /** @type {Pluck | null} */
  const pluck = named[0]?.[0] ?? (mood === "wonder" || mood === "warm" ? "piano" : null);
  const layers = {
    pad: true,
    low: mood === "tense" || mood === "sad" || /\b(low|drone|bass|sub|cello|strings?)\b/i.test(brief),
    pulse: mood === "tense" || mood === "driving" || /\b(pulse|ostinato|tick|step)/i.test(brief),
    pluck,
    perc: mood === "driving" || /\b(percussion|drums?|beat|ticks?)\b/i.test(brief),
    hits: /\b(hits?|impact|boom|trailer)\b/i.test(brief),
    sparse: mood === "sad" || /\b(sparse|minimal|spare|solo)\b/i.test(brief),
  };
  const intensity = mood === "tense" || mood === "driving" ? 0.8 : mood === "wonder" ? 0.7 : mood === "sad" ? 0.45 : 0.55;
  return {
    cue: c.cue, mood, mode, root: roots[seed % roots.length], bpm, chords: CYCLES[mode][(seed >>> 3) % CYCLES[mode].length],
    layers, intensity,
    why: `${mood} (${mode}) at ${bpm} bpm from "${brief.slice(0, 60)}"${pluck ? `; ${pluck}` : ""}`,
  };
}

/**
 * Whether a film may have a synthesised score at all.
 * @param {{ policy: string }} musicPlan from voice-plan.mjs musicPlanFor
 */
export function scoreAllowed(musicPlan) {
  return musicPlan.policy === "score";
}
