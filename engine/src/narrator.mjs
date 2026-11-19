/**
 * The Zupona narrator: the studio's own free voice for American English documentaries.
 *
 * Engine: Kokoro-82M v1.0 (Apache-2.0 weights, runs on a CPU, no account, no per-character fee),
 * through kokoro-onnx (MIT). The narrator is one fixed blend of three of its stock voice styles,
 * so it sounds like no single stock voice and imitates no real person or company voice.
 * Measured on 19 Nov 2026 (docs/VOICE_SYSTEM.md, "Free narrator"): every word of a 76-word
 * documentary passage heard back by Whisper small.en; 0.3 s of CPU per second of speech.
 *
 * What it never does: speak Arabic, speak Quran text (recitation is always a human recording),
 * or stand in for the owner's own voice. Those lines are refused, with the reason, before any
 * sound is made. Pure module: no I/O; render/narrate.mjs runs it.
 */
import { msg } from "./messages.mjs";

/**
 * @typedef {"cinematic" | "historical" | "science" | "nature" | "investigative" | "islamic-calm"} PresetId
 * @typedef {{ id: PresetId, name: string, speed: number, sentencePause: number, questionPause: number, endPause: number, use: string }} DeliveryPreset
 * @typedef {{ term: string, say: string }} LexiconEntry
 * @typedef {{ text: string, said: string, pauseAfter: number }} NarrationSentence
 * @typedef {{ scene: string, text: string, sentences: NarrationSentence[] }} NarrationJob
 * @typedef {{ characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[] }} Alignment
 */

export const ZUPONA_NARRATOR = Object.freeze({
  id: "zupona-narrator-1",
  name: "Zupona Narrator",
  engine: "Kokoro-82M v1.0 via kokoro-onnx 0.6",
  license: "Apache-2.0 (model and voice styles); kokoro-onnx MIT",
  versions: Object.freeze(["en-US"]),
  phonemes: "en-us",
  /** Weighted blend of Kokoro voice styles: a warm low American voice carrying most of the identity. */
  voice: Object.freeze([["am_michael", 0.6], ["am_fenrir", 0.25], ["bm_george", 0.15]]),
  /** The files narrate.mjs checks before use (release model-files-v1.0 of kokoro-onnx). */
  files: Object.freeze({
    model: { name: "kokoro-v1.0.onnx", sha256: "7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5" },
    voices: { name: "voices-v1.0.bin", sha256: "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d" },
  }),
});

/**
 * Delivery presets: one narrator, controlled variations. Speed is Kokoro's rate factor; pauses
 * are seconds of silence after a sentence. Calibrated so "cinematic" lands inside the en-US
 * band of 140-160 spoken words a minute (engine/src/versions.mjs) with its pauses included.
 * @type {Readonly<Record<PresetId, DeliveryPreset>>}
 */
export const DELIVERY_PRESETS = Object.freeze({
  cinematic: { id: "cinematic", name: "Cinematic documentary", speed: 0.92, sentencePause: 0.5, questionPause: 0.75, endPause: 0.15, use: "default for documentaries and stories" },
  historical: { id: "historical", name: "Historical storytelling", speed: 0.93, sentencePause: 0.55, questionPause: 0.8, endPause: 0.15, use: "history, biography, archives" },
  science: { id: "science", name: "Science and education", speed: 1, sentencePause: 0.42, questionPause: 0.6, endPause: 0.12, use: "explainers, space, technology" },
  nature: { id: "nature", name: "Nature and wildlife", speed: 0.95, sentencePause: 0.7, questionPause: 0.85, endPause: 0.2, use: "nature, wildlife, landscapes" },
  investigative: { id: "investigative", name: "Investigative and mystery", speed: 0.96, sentencePause: 0.48, questionPause: 0.95, endPause: 0.15, use: "true crime, mysteries, unsolved questions" },
  "islamic-calm": { id: "islamic-calm", name: "Calm Islamic education (English)", speed: 0.96, sentencePause: 0.75, questionPause: 0.85, endPause: 0.2, use: "English Islamic history and education; never Quran recitation" },
});

/** @param {string | undefined | null} id */
export function getPreset(id) {
  return id && Object.hasOwn(DELIVERY_PRESETS, id) ? DELIVERY_PRESETS[/** @type {PresetId} */ (id)] : null;
}

/**
 * The preset a film gets when nobody chose one: Islamic education is calm, the rest cinematic.
 * @param {{ contentType?: string, preset?: string }} film
 */
export function presetFor(film) {
  return getPreset(film.preset) ?? (film.contentType === "islamic" ? DELIVERY_PRESETS["islamic-calm"] : DELIVERY_PRESETS.cinematic);
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const ABBREVIATION = /(?:^|[\s(])(?:Mr|Mrs|Ms|Dr|St|Mt|Ft|Jr|Sr|Prof|Gen|Col|Capt|Lt|Sgt|Rev|Gov|Sen|Rep|vs|etc|approx|No|Vol|ca|c|e\.g|i\.e|a\.m|p\.m|U\.S|U\.K|[A-Z])\.$/;

/**
 * Sentences of a narration line, keeping every character (whitespace stays on the left part),
 * so the pieces join back to the line exactly. "Dr. Lee", "U.S." and "J. R. R." do not split.
 * @param {string} text
 * @returns {string[]}
 */
export function splitSentences(text) {
  /** @type {string[]} */
  const out = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?…]+["”’)\]]*(\s+)(?=["“‘(\[]?[\p{Lu}\p{N}])/gu)) {
    const end = (m.index ?? 0) + m[0].length - m[1].length;
    if (ABBREVIATION.test(text.slice(Math.max(start, end - 12), end))) continue;
    out.push(text.slice(start, end + m[1].length));
    start = end + m[1].length;
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.trim());
}

/**
 * Hard names spelled the way the lexicon says them (S4's pronunciation lexicon).
 * @param {string} text @param {LexiconEntry[]} lexicon
 */
export function sayWithLexicon(text, lexicon) {
  if (!lexicon.length) return text;
  const sorted = [...lexicon].sort((a, b) => b.term.length - a.term.length);
  const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map((e) => esc(e.term)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const say = new Map(sorted.map((e) => [e.term, e.say]));
  return text.replace(re, (m) => say.get(m) ?? m);
}

/**
 * What the narrator will say, scene by scene, or why it will not.
 * @param {{ lines: { scene: string, text: string }[], versionId?: string, contentType?: string, preset?: DeliveryPreset, lexicon?: LexiconEntry[] }} input
 * @returns {{ ok: boolean, blocked: ReturnType<typeof msg> | null, preset: DeliveryPreset, jobs: NarrationJob[], refused: { scene: string, reason: ReturnType<typeof msg> }[] }}
 */
export function planNarration({ lines, versionId = "en-US", contentType = "documentary", preset, lexicon = [] }) {
  const p = preset ?? presetFor({ contentType });
  if (contentType === "quran_recitation") return { ok: false, blocked: msg("narrator.quran"), preset: p, jobs: [], refused: [] };
  if (!ZUPONA_NARRATOR.versions.includes(versionId)) return { ok: false, blocked: msg("narrator.language", { version: versionId }), preset: p, jobs: [], refused: [] };
  /** @type {NarrationJob[]} */
  const jobs = [];
  /** @type {{ scene: string, reason: ReturnType<typeof msg> }[]} */
  const refused = [];
  for (const line of lines) {
    if (ARABIC.test(line.text)) { refused.push({ scene: line.scene, reason: msg("narrator.arabicLine") }); continue; }
    const parts = splitSentences(line.text);
    if (!parts.length) continue;
    jobs.push({
      scene: line.scene,
      text: line.text,
      sentences: parts.map((s, i) => ({
        text: s,
        said: sayWithLexicon(s.trim(), lexicon),
        pauseAfter: i === parts.length - 1 ? p.endPause : /\?["”’)\]]*\s*$/.test(s) ? p.questionPause : p.sentencePause,
      })),
    });
  }
  return { ok: true, blocked: null, preset: p, jobs, refused };
}

/**
 * Character timings for captions from the measured sentence times: exact at every sentence
 * edge, spread evenly over the letters inside a sentence. Joins back to the line as written.
 * @param {NarrationJob} job @param {{ start: number, end: number }[]} marks
 * @returns {Alignment | null}
 */
export function sentenceAlignment(job, marks) {
  if (marks.length !== job.sentences.length) return null;
  /** @type {Alignment} */
  const out = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
  job.sentences.forEach((s, i) => {
    const chars = [...s.text];
    const { start, end } = marks[i];
    const next = marks[i + 1]?.start ?? end;
    const spoken = chars.length - (s.text.length - s.text.trimEnd().length);
    chars.forEach((c, k) => {
      const t0 = k < spoken ? start + ((end - start) * k) / spoken : end + ((next - end) * (k - spoken)) / Math.max(1, chars.length - spoken);
      const t1 = k < spoken ? start + ((end - start) * (k + 1)) / spoken : end + ((next - end) * (k + 1 - spoken)) / Math.max(1, chars.length - spoken);
      out.characters.push(c);
      out.character_start_times_seconds.push(Math.round(t0 * 1000) / 1000);
      out.character_end_times_seconds.push(Math.round(t1 * 1000) / 1000);
    });
  });
  return out;
}

/**
 * The narration's own checks: pace inside the version's band and no clipped peak.
 * @param {{ seconds: number, words: number, peak: number }[]} takes
 * @param {{ min: number, max: number }} band spoken words a minute (versions.mjs narrationWpm)
 */
export function narrationCheck(takes, band) {
  const seconds = takes.reduce((a, t) => a + t.seconds, 0);
  const words = takes.reduce((a, t) => a + t.words, 0);
  const wpm = seconds > 0 ? Math.round((words / seconds) * 600) / 10 : 0;
  const peak = takes.reduce((a, t) => Math.max(a, t.peak), 0);
  /** @type {ReturnType<typeof msg>[]} */
  const problems = [];
  if (seconds > 0 && (wpm < band.min || wpm > band.max)) problems.push(msg("narrator.pace", { wpm, min: band.min, max: band.max }));
  if (peak >= 0.999) problems.push(msg("narrator.clipped", { peak }));
  return { seconds: Math.round(seconds * 10) / 10, words, wpm, peak, ok: problems.length === 0, problems };
}
