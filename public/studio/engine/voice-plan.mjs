/**
 * What happens to a voice before it reaches the film, and what music may sit
 * under it. The owner's own recording is cleaned, never changed: no pitch or
 * formant shift, no auto-tune, no speed change, no re-synthesis, and the
 * untouched original is always kept. A cloned ElevenLabs voice is used as
 * delivered: its repair steps stay off, only tone, level and loudness are set. The Quran is never synthesised, and nothing
 * (music, nasheed, nature sounds) is ever laid under a recitation.
 *
 * OWNER DECISION, 13 Nov 2026: a recitation MAY get a smooth hall / mosque
 * style reverb, like the best recitation videos (what the owner calls
 * "echo"). It is a reverb only: a dense, decaying tail made in code
 * (voice-reverb.mjs), checked to hold no discrete repeat. An echo or delay
 * that repeats syllables stays forbidden. English documentary narration stays
 * close, warm and nearly dry (a touch of room at most). The real chain is
 * voice-master.mjs; this file keeps the rules and the plan.
 */
import { getVersion } from "./versions.mjs";
import { PROFILE_SPACES, SPACES } from "./voice-reverb.mjs";

/**
 * @typedef {"quran_recitation" | "islamic" | "documentary" | "story"} ContentType
 * @typedef {"own-recording" | "elevenlabs"} VoiceSource
 * @typedef {import("./loudness.mjs").RecordingAnalysis} RecordingAnalysis
 * @typedef {{
 *   policy: "none" | "no-instruments" | "score", reason: string,
 *   bedBelowVoiceLu: number | null, bedRangeLu: [number, number] | null,
 *   ducking: { method: string, depthDb: number, leadMs: number, holdGapsUnderMs: number, releaseMs: number } | null,
 *   silentUnderQuran: true, natureSounds: boolean,
 * }} MusicPlan
 * @typedef {{ step: string, [setting: string]: unknown }} ChainStep
 */

/** Changes the platform never makes to anyone's voice. */
export const NEVER_DONE_TO_A_VOICE = Object.freeze([
  "pitch shift",
  "formant shift",
  "auto-tune or pitch correction",
  "speed change or time-stretch",
  "voice conversion or re-synthesis (speech-to-speech, dubbing, generative enhancers)",
  "echo or delay that repeats syllables",
]);

/**
 * What a recitation may get since the owner's decision of 13 Nov 2026: a
 * smooth reverb tail, never a repeat. voice-reverb.mjs `echoFree` proves it
 * on every impulse response before it is used.
 */
export const ALLOWED_SPACE = Object.freeze({
  quran: "smooth hall or mosque reverb (dense decaying tail, pre-delay, no discrete echo); nothing else is added",
  narration: "close and nearly dry; a short warm room at most",
  decidedOn: "2026-11-13",
});

/** YouTube turns uploads louder than this down; -1 dBTP leaves room for its encoder. */
export const MASTER = Object.freeze({ targetLufs: -14, ceilingDbtp: -1, lowBitrateCeilingDbtp: -2 });

/**
 * Which ElevenLabs model reads each version, from ElevenLabs' published
 * language lists (Oct 2026): Multilingual v2 is the most stable for long
 * narration in English and Arabic; only v3 lists Bengali, and v3 has no
 * request stitching, so its chunks are shorter and checked one by one.
 */
export const ELEVENLABS_MODELS = Object.freeze({
  "en-US": { modelId: "eleven_multilingual_v2", maxCharacters: 10000, stitching: true },
  ar: { modelId: "eleven_multilingual_v2", maxCharacters: 10000, stitching: true },
  "bn-BD": { modelId: "eleven_v3", maxCharacters: 3000, stitching: false },
});

/**
 * Which music, if any, may sit under the voice.
 * @param {{ contentType: ContentType, versionId: string }} input
 * @returns {MusicPlan}
 */
export function musicPlanFor({ contentType, versionId }) {
  const version = getVersion(versionId);
  if (!version) throw new Error("Unknown version \"" + versionId + "\".");
  if (contentType === "quran_recitation") {
    return {
      policy: "none",
      reason: "Nothing is laid under Quran recitation: no music, nasheed, humming or nature sounds, and no option to add them.",
      bedBelowVoiceLu: null,
      bedRangeLu: null,
      ducking: null,
      silentUnderQuran: true,
      natureSounds: false,
    };
  }
  // A fixed low bed with gain automation from voice detection; a side-chain
  // compressor would pump on every breath of a long narration.
  const ducking = { method: "offline gain automation from voice activity", depthDb: 8, leadMs: 150, holdGapsUnderMs: 1000, releaseMs: 650 };
  if (contentType === "islamic" || version.defaultMusic === "no-instruments") {
    return {
      policy: "no-instruments",
      reason: "Islamic content and the Arabic version use sound design or vocal-only nasheed, never instruments, and fall silent under any Quran quotation.",
      bedBelowVoiceLu: 22,
      bedRangeLu: [16, 30],
      ducking,
      silentUnderQuran: true,
      natureSounds: false,
    };
  }
  return {
    policy: "score",
    reason: "A licensed score sits well under the narration and dips further while anyone speaks.",
    bedBelowVoiceLu: 20,
    bedRangeLu: [14, 30],
    ducking,
    silentUnderQuran: true,
    natureSounds: true,
  };
}

/**
 * The processing plan for one voice track, built from its measured analysis.
 * Returns blocked (with the reason) instead of a plan when the request must
 * not be carried out, such as a synthetic voice for Quran recitation.
 * `space` names the reverb of the real engine (voice-reverb.mjs SPACES); the
 * returned `mastering` is what voice-master.mjs then runs, so this plan is
 * carried out, not only described.
 * @param {{ source: VoiceSource, contentType: ContentType, versionId: string, analysis?: RecordingAnalysis | null, roomReverb?: boolean, space?: string }} input
 */
export function planVoice({ source, contentType, versionId, analysis = null, roomReverb = false, space }) {
  const music = musicPlanFor({ contentType, versionId });
  const quran = contentType === "quran_recitation";
  if (quran && source !== "own-recording") {
    return { blocked: "Quran recitation is never synthesised or voice-cloned; upload a recitation recorded by a person.", chain: [], music, warnings: [], mastering: null };
  }
  const profile = masterProfileFor(contentType);
  const preset = space ?? (roomReverb && source === "own-recording" ? (quran ? "mosque-hall" : "warm-room") : quran ? "clean" : "dry");
  if (!PROFILE_SPACES[profile].includes(preset)) {
    return { blocked: "The " + profile + " profile does not use the space \"" + preset + "\"; it uses " + PROFILE_SPACES[profile].join(", ") + ".", chain: [], music, warnings: [], mastering: null };
  }
  const room = SPACES[preset];
  /** @type {string[]} */
  const warnings = [...(analysis?.problems ?? [])];
  /** @type {ChainStep[]} */
  const chain = [];

  if (source === "own-recording") {
    // Repair first (offset, clipping, noise), then tone and dynamics, then level.
    if (analysis && Math.abs(analysis.dcOffset) > 0.001) chain.push({ step: "dc-removal" });
    if (analysis && analysis.clippedRuns > 0) chain.push({ step: "de-clip", note: "restores clipped peaks only" });
    const snr = analysis?.snrDb ?? null;
    // Heavy noise reduction is what makes a voice sound robotic or underwater, so it is never used.
    let strength = snr === null || snr >= 35 ? "off" : snr >= 25 ? "light" : "medium";
    if (quran && strength === "medium") strength = "light";
    if (strength !== "off") chain.push({ step: "noise-reduction", strength, maxReductionDb: strength === "light" ? 6 : 10 });
    if (snr !== null && snr < 20) warnings.push(quran ? "Noise is high, but recitation only gets light noise reduction so no letter is smeared; a quieter re-recording would sound better." : "Noise is high; it is reduced moderately, never removed aggressively, so the voice stays natural.");
    chain.push({ step: "high-pass", hz: 80, slopeDbPerOctave: 12 });
    chain.push(quran
      ? { step: "compressor", ratio: 1.5, thresholdDb: -20, attackMs: 20, releaseMs: 250, note: "gentle, so the reciter's dynamics and elongations stay intact" }
      : { step: "compressor", ratio: 3, thresholdDb: -22, attackMs: 10, releaseMs: 100, targetReductionDb: [3, 6] });
    chain.push({ step: "de-ess", rangeHz: [5000, 9000], maxReductionDb: 4 });
    if (room) chain.push({ step: "reverb", preset, decaySeconds: room.rt60, preDelayMs: room.preDelayMs, wetDb: room.wetDb, discreteEchoes: false, note: "a smooth tail made in code and checked to hold no repeat; shortened or lowered to fit the recording" });
  } else {
    const model = ELEVENLABS_MODELS[/** @type {keyof typeof ELEVENLABS_MODELS} */ (versionId)];
    chain.push({
      step: "elevenlabs-tts",
      ...model,
      outputFormat: "wav_48000",
      chunking: "split at paragraph ends; fixed seed and voice settings; " + (model.stitching ? "chain previous and next request ids" : "regenerate any chunk that sounds out of place and join at pauses"),
    });
  }

  const voiceTarget = music.policy === "none" ? MASTER.targetLufs : MASTER.targetLufs - 1;
  const gainDb = typeof analysis?.integrated === "number" ? Math.round((voiceTarget - analysis.integrated) * 100) / 100 : null;
  chain.push({ step: "loudness", targetLufs: voiceTarget, gainDb, scope: "the whole stitched track at once, never chunk by chunk" });
  chain.push({ step: "true-peak-limiter", ceilingDbtp: MASTER.ceilingDbtp, lookaheadMs: 5, oversampling: 4 });
  if (gainDb !== null && gainDb > 24) warnings.push("The recording needs more than 24 dB of gain, which also raises its noise.");

  return {
    blocked: null,
    source,
    contentType,
    versionId,
    never: NEVER_DONE_TO_A_VOICE,
    keepOriginal: true,
    mastering: { engine: "voice-master.mjs", profile, preset },
    voiceIsolator: quran ? "never" : "opt-in only, with a before/after comparison",
    chain,
    music,
    master: MASTER,
    editing: quran
      ? { cutAt: "the end of an ayah or a permitted stop (waqf) only", timing: "never sped up, slowed, looped or reordered" }
      : { cutAt: "sentence ends and breaths", timing: "pauses between sentences are trimmed or extended; the voice is never sped up or slowed" },
    warnings,
  };
}

/**
 * Which mastering profile a kind of content gets: a recitation its own,
 * everything else the close, nearly dry narration profile.
 * @param {ContentType} contentType @returns {"quran" | "narration"}
 */
export function masterProfileFor(contentType) {
  return contentType === "quran_recitation" ? "quran" : "narration";
}

/**
 * The narrator's real speaking pace, natural pauses included, so scripts are
 * written to fit the voice that will read them rather than a generic figure.
 * @param {{ words: number, durationSeconds: number }} input
 */
export function narratorPace({ words, durationSeconds }) {
  if (!(words > 0) || !(durationSeconds > 0)) return null;
  return Math.round(words / (durationSeconds / 60));
}
