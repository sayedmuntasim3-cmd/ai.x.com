/**
 * Voice film, on the owner's machine:
 *   node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>]
 *        [--transcript <json|srt|vtt>] [--stt faster-whisper|pocketsphinx] [--model small.en]
 *        [--surah 93] [--ayat 1-11] [--passage "93, 94:1-8"] [--opening auto|none|basmala|istiadha|both] [--closing auto|none|sadaqa]
 *        [--adab strict|nature|people-distant]
 *        [--script <the words as written, .txt>] [--topic "what the film is about"] [--media] [--tighten on|off]
 *        [--retakes on|off]
 *        [--marks marks.json]   (Quran: the reviewer's ayah times {start, ends[], by}; they become confirmed ends)
 *        [--eyes]               (with --media: after the plan, every picture shot is searched again from its own sentence,
 *                                OpenCLIP chooses, and the critic's free eyes re-pick any miss; render/asset-rank/rerank.mjs)
 *        [--slice 0:00-3:00]    (the test bench: the whole pipeline runs on that stretch of the recording only;
 *                                a --transcript is cut to it and moved to start at 0; slice.json says where it came from)
 * Step 1 (intake): ffmpeg reads any audio file; the original is never changed.
 * Two copies are made in the output folder: analysis.wav (the original rate
 * and channels, float, for the voice checks) and voice-16k.wav (16 kHz mono,
 * what speech-to-text listens to). The voice report holds duration,
 * loudness, true peak, clipping, silence and noise, each problem as a coded
 * message (engine/src/messages.mjs) in English and Bengali.
 * Step 2 (words): a transcript that came with the voice (--transcript), or
 * speech-to-text run here (--stt, local/stt/transcribe.py). With --script,
 * the words are the script's, exactly, timed by what was heard.
 * Step 3 (understanding): language, kind, scenes or ayat, structure
 * (understanding.json). A recitation is located first (quran-location.json):
 * the surah and ayat the user gave (--surah, --ayat) or the ones a recognizer
 * heard, each ayah end on a measured pause. Given alone, the times are
 * estimates; an unclear or contradictory recording ends in a question (exit
 * code 3), never in a guess.
 * Step 4 (pictures): a plan per scene (pictures.json, pictures.md); with
 * --media, free licensed pictures from the keyless archives (network).
 * Quran: the adab guard's problems and gaps instead.
 */
import { execFile } from "node:child_process";
import { open, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRecordingAnalyzer } from "../engine/src/loudness.mjs";
import { measureWavFile } from "../engine/src/wav.mjs";
import { msg } from "../engine/src/messages.mjs";
import { alignScript, checkTranscript, normalizeTranscript } from "../engine/src/transcript.mjs";
import { understandVoice } from "../engine/src/voice-understand.mjs";
import { buildQuranIndex } from "../engine/src/quran.mjs";
import { locateRecitation } from "../engine/src/quran-locate.mjs";
import { meaningTable, parseTanzilText, passageMeaning, planMeanings } from "../engine/src/quran-meaning.mjs";
import { directQuranFilm, shotTable } from "../engine/src/quran-director.mjs";
import { voiceSpans } from "../engine/src/voice-analyze.mjs";
import { decodeWav } from "../engine/src/wav.mjs";
import { planVoiceVisuals, quranVisualAdabGuard, respellNames, voiceScore, withMusic } from "../engine/src/voice-visuals.mjs";
import { DESIGNED_TYPES, GENRE_RHYTHM, auditVoiceFilm, directEdit, planBeats, planShots, worldBrief } from "../engine/src/shot-plan.mjs";
import { calibratedDoctrine, emptyLedger, ledgerGenre, parseLedger, rhythmFrom } from "../engine/src/craft-memory.mjs";
import { mediaProviders } from "../engine/src/film-media.mjs";
import { archiveKeys } from "../engine/src/open-archives.mjs";
import { brainFromEnv } from "../worker/brain.mjs";
import { groqLook, groqModel } from "../worker/groq.mjs";
import { rerankRun } from "../render/asset-rank/rerank.mjs";
import { workerBrain } from "../render/voice-runner.mjs";

import { planVoice } from "../engine/src/voice-plan.mjs";
import { ayahEndsOf } from "../engine/src/voice-master.mjs";
import { masterFile } from "./voice-master.mjs";
import { applyTighten, cutMap, planTighten, remapWords } from "../engine/src/voice-tighten.mjs";
import { planRetakes, snapCuts, wordsOfAyat } from "../engine/src/quran-retakes.mjs";
import { encodeWav24 } from "../engine/src/wav.mjs";
import { applyMarks, checkMarks } from "../engine/src/quran-marks.mjs";
import { checkVoiceChapter } from "../engine/src/voice-scenes.mjs";
import { parseSceneLines } from "../engine/src/scene-lines.mjs";

const run = promisify(execFile);

/**
 * Can this picture or clip be fetched? A ranged GET of its first bytes, with a User-Agent that names the tool (what
 * the renderer will send). Only a real image or video answer counts: a 403, an HTML page or a timeout does not.
 * @param {string} url @returns {Promise<boolean>}
 */
export async function fileReachable(url) {
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-2047", "user-agent": "ZuponaStudio/1.0 (documentary renderer; https://github.com/sayedmuntasim3-cmd/ai.x.com)" }, redirect: "follow", signal: AbortSignal.timeout(20_000) });
    await res.body?.cancel().catch(() => {});
    return (res.status === 200 || res.status === 206) && /^(image|video)\//i.test(res.headers.get("content-type") ?? "");
  } catch {
    return false;
  }
}

/**
 * Pixabay through the studio's Worker (ZUPONA_STOCK_RELAY = its /api/voice/<id>/stock?ticket=... address): the
 * GitHub runner searches free stock with the Worker's own key, which never leaves Cloudflare. Other requests go out
 * unchanged. @param {string | undefined} relay @returns {typeof fetch | undefined}
 */
export function stockRelayFetch(relay) {
  if (!relay) return undefined;
  return /** @type {typeof fetch} */ ((input, init) => {
    const u = new URL(String(input));
    if (u.host !== "pixabay.com" || !u.pathname.startsWith("/api/")) return fetch(input, init);
    const to = new URL(relay);
    to.searchParams.set("kind", u.pathname.startsWith("/api/videos") ? "video" : "image");
    for (const [k, v] of u.searchParams) if (k !== "key") to.searchParams.set(k, v);
    return fetch(to, init);
  });
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[a.slice(2)] = true;
    else { o[a.slice(2)] = next; i += 1; }
  }
  const kind = String(o.kind ?? "auto");
  if (!["narration", "quran", "auto"].includes(kind)) throw new Error(`--kind must be narration, quran or auto, not ${kind}.`);
  return { ...o, kind };
}

/** "1:30", "0:01:30" or "90" -> seconds; NaN when unreadable. @param {string} t */
function clock(t) {
  const parts = String(t).trim().split(":");
  if (!parts.length || parts.length > 3 || parts.some((x) => !/^\d+(\.\d+)?$/.test(x))) return NaN;
  return parts.reduce((acc, x) => acc * 60 + Number(x), 0);
}

/**
 * Read --slice "a-b" (for example 0:00-3:00, 90-180, 1:00:00-1:03:00).
 * @param {unknown} v @returns {{ start: number, end: number } | null}
 */
export function parseSlice(v) {
  if (v === undefined || v === false) return null;
  const m = /^\s*([\d:.]+)\s*-\s*([\d:.]+)\s*$/.exec(String(v));
  const start = m ? clock(m[1]) : NaN, end = m ? clock(m[2]) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`--slice must look like 0:00-3:00 (start before end), not ${v}.`);
  return { start, end };
}

/**
 * The words inside the slice, moved so the slice starts at 0. A word cut by an edge is dropped,
 * so no word is heard half.
 * @template {{ start: number, end: number }} W @param {W[]} words @param {{ start: number, end: number }} slice @returns {W[]}
 */
export function sliceWords(words, slice) {
  const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  return words.filter((w) => w.start >= slice.start && w.end <= slice.end).map((w) => ({ ...w, start: r3(w.start - slice.start), end: r3(w.end - slice.start) }));
}

/** A JSON file of the run folder, or null when it is missing or unreadable. @param {string} file */
async function readJson(file) {
  try { return JSON.parse(await readFile(file, "utf8")); } catch { return null; }
}

/** The fields that tie a run folder to one recording and one brief; a different one must not be reused. */
const SIGNATURE_FIELDS = /** @type {const} */ (["audio", "bytes", "topic", "kind", "slice", "media", "tighten", "transcript", "script", "stt", "model"]);

/**
 * The run folder's fingerprint: the same recording, the same brief. Files saved under another signature are not
 * reused, so a re-run with a new topic or another file can never plan on the wrong words.
 * @param {Record<string, unknown>} [about]
 */
export function runSignature(about = {}) {
  /** @type {Record<string, unknown>} */
  const picked = {};
  for (const k of SIGNATURE_FIELDS) picked[k] = about[k] ?? null;
  return JSON.stringify(picked);
}

/**
 * What a re-run may keep: every stage's own output file, checked by the same rule the stage enforces, so a film
 * that stopped on the free brain's quota continues instead of planning the finished part again (a 40-minute film's
 * words alone take hours of speech-to-text). A missing, unreadable or invalid file is simply not offered.
 * @param {string} out
 * @param {Record<string, unknown>} [about]
 * @returns {Promise<{ matches: boolean, stages: string[], words: any, understanding: any, beats: any, pictures: any, shots: any, edit: any }>}
 */
export async function resumeState(out, about = {}) {
  /** @type {{ matches: boolean, stages: string[], words: any, understanding: any, beats: any, pictures: any, shots: any, edit: any }} */
  const none = { matches: false, stages: [], words: null, understanding: null, beats: null, pictures: null, shots: null, edit: null };
  const saved = await readJson(join(out, "run.json"));
  if (!saved || saved.version !== 1 || saved.signature !== runSignature(about)) return none;

  const words = await readJson(join(out, "words.json"));
  const okWords = words && Array.isArray(words.words) && words.words.length > 0 && words.check?.ok !== false ? words : null;
  const understanding = await readJson(join(out, "understanding.json"));
  const okUnderstanding = understanding && understanding.ok === true && Array.isArray(understanding.scenes) && understanding.scenes.length ? understanding : null;
  const scenes = okUnderstanding?.scenes ?? [];

  const beats = await readJson(join(out, "beats.json"));
  const okBeats = okUnderstanding && beats && Array.isArray(beats.beats) && beats.beats.length > 0
    && Number(beats.beats[0].start) <= 0.01
    && Number(beats.beats[beats.beats.length - 1].end) >= Number(scenes[scenes.length - 1].end) - 0.5
    && beats.beats.every((/** @type {any} */ b) => b && b.goal && b.emotion && b.visual)
    ? beats : null;

  // The picture plan: one complete line per scene, the voice's words and times intact, and the media when it was asked for.
  let okPictures = null;
  const markdown = await readFile(join(out, "pictures.md"), "utf8").catch(() => null);
  if (okUnderstanding && markdown) {
    const lines = parseSceneLines(markdown);
    const complete = lines.length === scenes.length && lines.every((l) => l.fields.SHOTS && l.fields.SRC && !/TODO/.test(l.raw));
    const intact = complete && !checkVoiceChapter(markdown, scenes).some((f) => f.code === "words-changed" || f.code === "time-changed");
    const chapterMedia = about.media === true ? await readJson(join(out, "media-C1.json")) : null;
    if (intact && (about.media !== true || chapterMedia)) okPictures = { markdown, saved: await readJson(join(out, "pictures.json")), chapterMedia };
  }

  const shots = await readJson(join(out, "shots.json"));
  const okShots = okPictures && shots && Array.isArray(shots.shots) && shots.shots.length > 0 && (shots.findings ?? []).length === 0 ? shots : null;
  const edit = await readJson(join(out, "edit-C1.json"));
  const okEdit = okShots && edit && Array.isArray(edit.scenes) ? edit : null;

  /** @type {string[]} */
  const stages = [];
  if (okWords) stages.push("words");
  if (okUnderstanding) stages.push("understanding");
  if (okBeats) stages.push("beats");
  if (okPictures) stages.push("pictures");
  if (okShots) stages.push("shots");
  if (okEdit) stages.push("edit");
  return { matches: true, stages, words: okWords, understanding: okUnderstanding, beats: okBeats, pictures: okPictures, shots: okShots, edit: okEdit };
}

/**
 * Cut the slice out of the recording into slice.wav (float, original rate); the original is never changed.
 * @param {{ audio: string, out: string, slice: { start: number, end: number } }} o
 */
export async function cutSlice(o) {
  await mkdir(o.out, { recursive: true });
  const file = join(o.out, "slice.wav");
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(o.slice.start), "-to", String(o.slice.end), "-i", o.audio, "-vn", "-map", "0:a:0", "-c:a", "pcm_f32le", file], { maxBuffer: 1 << 20 });
  await writeFile(join(o.out, "slice.json"), JSON.stringify({ source: basename(o.audio), start: o.slice.start, end: o.slice.end, seconds: o.slice.end - o.slice.start }, null, 1));
  return file;
}

/**
 * The free brain for the picture plan: Groq first, then the Gemini pool (worker/brain.mjs), or Groq alone.
 * Never the paid brain: BRAIN=claude is refused here. Null when no free brain is set up.
 * @param {Record<string, string | undefined>} env @param {{ fetch?: typeof fetch }} [o]
 * @returns {{ model: import("../engine/src/film-run.mjs").Model | null, kind: string, refused?: boolean }}
 */
export function voiceBrain(env, o = {}) {
  if (String(env.BRAIN ?? "").trim().toLowerCase() === "claude") return { model: null, kind: "none", refused: true };
  const groqOn = env.GROQ_API_KEY && String(env.GROQ ?? "").toLowerCase() !== "off";
  if (env.GEMINI_API_KEY || (env.BRAIN_URL && env.BRAIN_MODEL)) {
    const b = brainFromEnv({ ...env, ANTHROPIC_API_KEY: undefined }, o);
    if (b.ok) return { model: b.model, kind: b.kind === "gemini" && groqOn ? "groq+gemini" : b.kind };
  }
  if (groqOn) return { model: /** @type {any} */ (groqModel({ apiKey: String(env.GROQ_API_KEY), ...(o.fetch ? { fetch: o.fetch } : {}) })), kind: "groq" };
  // On the GitHub runner the keys stay in the Worker: the free brain is asked through it, with this film's ticket.
  if (env.SITE && env.VOICE_ID && env.VOICE_TICKET && env.VOICE_SELFTEST !== "1" && String(env.GROQ ?? "").toLowerCase() !== "off") {
    return { model: /** @type {any} */ (workerBrain({ site: env.SITE, id: env.VOICE_ID, ticket: env.VOICE_TICKET, ...(o.fetch ? { fetch: o.fetch } : {}) }, { log: (l) => console.log(l) })), kind: "worker" };
  }
  return { model: null, kind: "none" };
}

/** True when ffmpeg runs. */
export async function hasFfmpeg() {
  try { await run("ffmpeg", ["-version"]); return true; } catch { return false; }
}

/**
 * Convert any audio ffmpeg reads into WAV. mono16k: the 16 kHz mono 16-bit
 * copy for speech-to-text; otherwise 32-bit float at the original rate and
 * channels, so the checks measure the file as it is.
 * @param {string} input @param {string} output @param {{ mono16k?: boolean }} [o]
 */
export async function toWav(input, output, o = {}) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-map", "0:a:0"];
  args.push(...(o.mono16k ? ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"] : ["-c:a", "pcm_f32le"]), output);
  try { await run("ffmpeg", args, { maxBuffer: 1 << 20 }); } catch (e) {
    const error = String(/** @type {any} */ (e).stderr || /** @type {any} */ (e).message || e).trim().split("\n").pop() ?? "unknown error";
    throw Object.assign(new Error(error), { message_: msg("voice.unreadable", { error }) });
  }
  return output;
}

/** Measure a WAV file in constant memory with the studio's own analyzer. @param {string} path */
export async function measureWav(path) {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    return await measureWavFile({
      size,
      read: async (start, end) => {
        const buf = Buffer.alloc(end - start);
        const { bytesRead } = await handle.read(buf, 0, buf.length, start);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
      },
      analyzer: (rate, channels) => createRecordingAnalyzer(rate, channels),
    });
  } finally { await handle.close(); }
}

/** @param {number | null | undefined} n */
const r1 = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/**
 * The voice report: numbers plus coded messages. ok is false only when the
 * file cannot carry a film (under one second, or almost all silence).
 * @param {import("../engine/src/loudness.mjs").RecordingAnalysis} a
 * @param {{ sampleRate: number, channelCount: number }} layout
 * @param {{ file?: string, bytes?: number }} [about]
 */
export function voiceReport(a, layout, about = {}) {
  const seconds = r1(a.durationSeconds) ?? 0;
  const silence = Math.round((a.silenceShare ?? 0) * 100);
  const messages = [];
  if (seconds < 1) messages.push(msg("voice.short"));
  if (a.clippedRuns > 0) messages.push(msg("voice.clipping", { runs: a.clippedRuns }));
  if (a.snrDb !== null && a.snrDb < 20) messages.push(msg("voice.noisy", { snr: r1(a.snrDb) ?? 0 }));
  if (a.integrated !== null && a.integrated < -40) messages.push(msg("voice.quiet", { lufs: r1(a.integrated) ?? 0 }));
  if (silence >= 60) messages.push(msg("voice.silent", { silence }));
  if (layout.sampleRate < 32000) messages.push(msg("voice.lowRate", { rate: layout.sampleRate }));
  const ok = seconds >= 1 && silence < 90 && a.integrated !== null;
  messages.unshift(msg("voice.ready", { seconds, lufs: r1(a.integrated) ?? "n/a", peak: r1(a.truePeakDb) ?? "n/a", silence }));
  return {
    ok,
    file: about.file ?? null,
    bytes: about.bytes ?? null,
    durationSeconds: a.durationSeconds,
    sampleRate: layout.sampleRate,
    channels: layout.channelCount,
    integratedLufs: r1(a.integrated),
    truePeakDbtp: r1(a.truePeakDb),
    samplePeakDb: r1(a.samplePeakDb),
    clippedSamples: a.clippedSamples,
    clippedRuns: a.clippedRuns,
    silenceShare: a.silenceShare,
    snrDb: r1(a.snrDb),
    noiseFloorDb: r1(a.noiseFloorDb),
    dcOffset: a.dcOffset,
    messages,
  };
}

/**
 * Step 1 for one file: both WAV copies and the voice report.
 * @param {{ audio: string, out: string }} o
 */
export async function intake(o) {
  if (!(await hasFfmpeg())) return { ok: false, report: null, messages: [msg("voice.noFfmpeg")] };
  await mkdir(o.out, { recursive: true });
  const analysisWav = await toWav(o.audio, join(o.out, "analysis.wav"));
  const sttWav = await toWav(o.audio, join(o.out, "voice-16k.wav"), { mono16k: true });
  const { analysis, layout } = await measureWav(analysisWav);
  const report = voiceReport(analysis, layout, { file: basename(o.audio), bytes: (await stat(o.audio)).size });
  await writeFile(join(o.out, "voice-report.json"), JSON.stringify(report, null, 2));
  return { ok: report.ok, report, analysisWav, sttWav, messages: report.messages };
}

/**
 * Take the long silences out of the recording (engine/src/voice-tighten.mjs) into tightened.wav,
 * at the original rate; the original file is never changed. Null when nothing is long enough to cut.
 * A recitation (and a recording whose kind is not known yet) keeps every natural pause.
 * @param {{ out: string, analysisWav: string, sttWav: string, kind: "narration" | "quran" }} o
 */
export async function tightenRecording(o) {
  const { spans, seconds } = await readSpans(o.sttWav);
  const plan = planTighten({ spans, totalSeconds: seconds, kind: o.kind });
  if (!plan.cuts.length) return null;
  const bytes = await readFile(o.analysisWav);
  const wav = decodeWav(/** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  const file = join(o.out, "tightened.wav");
  await writeFile(file, Buffer.from(encodeWav24(applyTighten(wav.channels, wav.sampleRate, plan.cuts), wav.sampleRate)));
  const pauses = plan.cuts.filter((c) => c.at === "pause");
  const message = msg(o.kind === "quran" ? "voice.tightenedQuran" : "voice.tightened", { count: plan.cuts.length, keep: plan.rule.keep, seconds: plan.removedSeconds });
  await writeFile(join(o.out, "tighten.json"), JSON.stringify({ kind: o.kind, rule: plan.rule, originalSeconds: seconds, newSeconds: plan.newSeconds, removedSeconds: plan.removedSeconds, cuts: plan.cuts, longestStop: Math.max(0, ...pauses.map((c) => c.gap)), message }, null, 1));
  return { file, plan, message };
}

/**
 * Take the failed takes out of a recitation (engine/src/quran-retakes.mjs) into retakes.wav, at the
 * original rate; the original never changes. A hafiz who stumbles, repeats words to correct himself or
 * starts an ayah again leaves several attempts: only the last complete take stays. The cuts go through
 * the same cutter as the long silences (applyTighten), so a join is crossfaded and nobody hears it, and
 * every edge first snaps to a measured silence so no kept word is opened. Writes retakes.json next to
 * tighten.json; when the passage cannot be laid out safely, nothing is cut and the reviewer is told.
 * @param {{ out: string, analysisWav: string, sttWav: string, words: any[], location: any, index: any }} o
 */
export async function retakeRecording(o) {
  const { spans } = await readSpans(o.sttWav);
  const expected = wordsOfAyat(o.index, o.location?.ayat ?? []);
  const plan = planRetakes({ words: o.words ?? [], expected });
  const cuts = snapCuts(plan.cuts, spans);
  const removed = Math.round(cuts.reduce((n, c) => n + c.seconds, 0) * 1000) / 1000;
  const message = plan.message.code === "quran.retakes" ? msg("quran.retakes", { count: cuts.length, seconds: removed }) : plan.message;
  if (!cuts.length) {
    await writeFile(join(o.out, "retakes.json"), JSON.stringify({ cuts: [], removedSeconds: 0, confidence: plan.confidence, keptOrderOk: plan.keptOrderOk, message }, null, 1));
    return { file: null, cuts, removedSeconds: removed, confidence: plan.confidence, message };
  }
  const bytes = await readFile(o.analysisWav);
  const wav = decodeWav(/** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)));
  const file = join(o.out, "retakes.wav");
  await writeFile(file, Buffer.from(encodeWav24(applyTighten(wav.channels, wav.sampleRate, cuts), wav.sampleRate)));
  await writeFile(join(o.out, "retakes.json"), JSON.stringify({ cuts, removedSeconds: removed, confidence: plan.confidence, keptOrderOk: plan.keptOrderOk, message }, null, 1));
  return { file, cuts, removedSeconds: removed, confidence: plan.confidence, message, map: cutMap(cuts) };
}

/**
 * Run local/stt/transcribe.py on the 16 kHz copy. Python and the engine's
 * package must be installed on this machine (pip install faster-whisper).
 * @param {{ wav: string, out: string, engine: string, model?: string, language?: string, python?: string, clips?: number[] }} o
 */
export async function speechToText(o) {
  const script = new URL("./stt/transcribe.py", import.meta.url).pathname;
  const args = ["-I", script, o.wav, "--engine", o.engine, "--out", o.out];
  if (o.model) args.push("--model", o.model);
  // ZUPONA_STT_BATCH: batched decoding (the film machine sets 8: about 7x faster at the same word error).
  if (process.env.ZUPONA_STT_BATCH) args.push("--batch", String(Number(process.env.ZUPONA_STT_BATCH) || 8));
  if (o.language) args.push("--language", o.language);
  if (o.clips?.length) args.push("--clips", o.clips.join(","));
  await run(o.python ?? process.env.ZUPONA_PYTHON ?? "python3", args, { maxBuffer: 1 << 24, timeout: 6 * 3600 * 1000 });
  return normalizeTranscript(await readFile(o.out, "utf8"));
}

/**
 * Step 2: the timed words, checked against the recording.
 * @param {{ out: string, totalSeconds: number, sttWav?: string, transcript?: string, stt?: string, model?: string, language?: string, script?: string, remap?: (t: number) => number, slice?: { start: number, end: number } | null }} o
 */
export async function words(o) {
  let t;
  if (o.transcript) {
    t = normalizeTranscript(await readFile(o.transcript, "utf8"), { name: o.transcript });
    // A transcript of the whole recording is cut to the slice first (its times are on the original).
    if (o.slice) t = { ...t, words: sliceWords(t.words, o.slice) };
    // A transcript timed on the original recording moves onto the tightened one.
    if (o.remap) t = { ...t, words: remapWords(t.words, o.remap) };
  }
  else if (o.stt && o.sttWav) t = await speechToText({ wav: o.sttWav, out: join(o.out, "heard.json"), engine: o.stt, model: o.model, language: o.language });
  else throw new Error("Give --transcript <file> or --stt faster-whisper|pocketsphinx.");
  /** @type {any} */
  let final = t;
  if (o.script) final = alignScript(await readFile(o.script, "utf8"), t);
  const check = checkTranscript(final, o.totalSeconds);
  const result = { ...final, words: check.words, check: { ok: check.ok, problems: check.problems, lowConfidenceShare: check.lowConfidenceShare }, messages: check.messages };
  await writeFile(join(o.out, "words.json"), JSON.stringify(result, null, 1));
  return result;
}

/** The texts the meaning layer reads: Uthmani (verbatim, with its notice), Simple, Pickthall. */
export async function loadQuranTexts() {
  const dir = new URL("../engine/data/quran/", import.meta.url);
  const uthmani = parseTanzilText(await readFile(new URL("tanzil-quran-uthmani-1.1.txt", dir), "utf8"));
  const simple = JSON.parse(await readFile(new URL("tanzil-quran-simple-1.0.2.json", dir), "utf8"));
  const pickthall = JSON.parse(await readFile(new URL("pickthall-1930.json", dir), "utf8"));
  return { uthmani: uthmani.ayat, notice: uthmani.notice, simple, pickthall: pickthall.ayat };
}

/** The Tanzil index and surah names, read once. */
export async function loadQuran() {
  const dir = new URL("../engine/data/quran/", import.meta.url);
  const index = buildQuranIndex(JSON.parse(await readFile(new URL("tanzil-quran-simple-1.0.2.json", dir), "utf8")));
  const surahNames = JSON.parse(await readFile(new URL("surah-names.json", dir), "utf8"));
  return { index, surahNames };
}

/** The voiced stretches of a 16 kHz mono WAV (voice-16k.wav), to 10 ms. @param {string} wav */
export async function readSpans(wav) {
  const bytes = await readFile(wav);
  const decoded = decodeWav(/** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), { maxChannels: 1 });
  return { ...voiceSpans(decoded.channels[0], decoded.sampleRate), samples: decoded.channels[0], sampleRate: decoded.sampleRate };
}

/**
 * Place the given passage's text on the audio, letter by letter
 * (local/stt/align.py; a CTC model with an open licence). Null when it
 * cannot run here; the location then has no sure ayah end.
 * @param {{ index: any, given: any, surahNames: any[], wav: string, out: string, python: string }} o
 */
export async function alignText(o) {
  const { parsePassage } = await import("../engine/src/quran-locate.mjs");
  const parsed = parsePassage(o.given, o.surahNames);
  if (!parsed.ok) return null;
  /** @type {{ surah: number, ayah: number, words: string[] }[]} */
  const passage = [];
  for (const r of parsed.ranges) for (let a = r.fromAyah; a <= r.toAyah; a += 1) {
    const e = o.index.ayat.find((/** @type {any} */ x) => x.surah === r.surah && x.ayah === a);
    passage.push({ surah: r.surah, ayah: a, words: o.index.words.slice(e.firstWord, e.firstWord + e.wordCount) });
  }
  const textFile = join(o.out, "passage-words.json"), outFile = join(o.out, "aligned.json");
  await writeFile(textFile, JSON.stringify(passage));
  try {
    await run(o.python, ["-I", new URL("./stt/align.py", import.meta.url).pathname, o.wav, "--text", textFile, "--out", outFile], { maxBuffer: 1 << 24, timeout: 3 * 3600 * 1000 });
    return JSON.parse(await readFile(outFile, "utf8")).ayat;
  } catch (e) {
    console.error("The text could not be aligned here: " + String(/** @type {Error} */ (e).message).split("\n").slice(-2).join(" ").slice(0, 200));
    return null;
  }
}

/**
 * Step 3: understand the voice and save understanding.json. With sttWav, a
 * recitation is located first (given passage, gate, times on the pauses).
 * @param {{ out: string, transcript: any, totalSeconds: number, kind: "auto" | "narration" | "quran", sttWav?: string, given?: { surah?: unknown, ayat?: unknown, passage?: unknown } | null, opening?: any, closing?: any, python?: string }} o
 */
export async function understand(o) {
  const needQuran = o.kind !== "narration";
  const q = needQuran ? await loadQuran() : null;
  const hasGiven = Boolean(o.given && [o.given.surah, o.given.passage].some((v) => typeof v === "string" || typeof v === "number"));
  const arabic = /^ar/.test(String(o.transcript?.language ?? ""));
  let location = null;
  if (q && o.sttWav && (o.kind === "quran" || hasGiven || arabic)) {
    const voice = await readSpans(o.sttWav);
    const aligned = hasGiven && o.python ? await alignText({ index: q.index, given: o.given, surahNames: q.surahNames, wav: o.sttWav, out: o.out, python: o.python }) : null;
    location = locateRecitation({ index: q.index, surahNames: q.surahNames, spans: voice.spans, totalSeconds: voice.seconds, given: hasGiven ? o.given : null, words: o.transcript?.words ?? null, opening: o.opening, closing: o.closing, aligned });
    // The reviewer's marks (taps at each ayah end) are confirmed times: they replace the machine's guesses.
    if (o.marks && location?.ok) {
      const checked = checkMarks(o.marks, location.ayat.length, o.totalSeconds);
      if (!checked.ok) throw new Error(checked.error);
      location = applyMarks(location, checked.marks);
    }
    await writeFile(join(o.out, "quran-location.json"), JSON.stringify({ ...location, stretches: voice.spans.length, recognizer: o.transcript?.engine ? { engine: o.transcript.engine, model: o.transcript.model ?? null, modelSource: o.transcript.modelSource ?? null, modelRevision: o.transcript.modelRevision ?? null, modelLicense: o.transcript.modelLicense ?? null } : null }, null, 1));
  }
  const u = understandVoice({ transcript: o.transcript ?? { words: [] }, totalSeconds: o.totalSeconds, kind: o.kind, quranIndex: q?.index ?? null, surahNames: q?.surahNames ?? [], location });
  await writeFile(join(o.out, "understanding.json"), JSON.stringify({ ...u, match: undefined, location: undefined }, null, 1));
  return u;
}

/**
 * Step 4. With a free brain (voiceBrain: Groq, then the Gemini pool) the plan is written in batches of
 * whole sections; without one, or for scenes past its quota, it comes from each scene's own words.
 * A re-run reads the stages a previous run finished from their own files (resumeState), so a film stopped on the
 * free brain's quota continues where it stopped instead of planning (and transcribing) everything again.
 * @param {{ out: string, understanding: any, media?: boolean, topic?: string, quranIndex?: any, adab?: "strict" | "nature" | "people-distant", brain?: import("../engine/src/film-run.mjs").Model | null, ledger?: import("../engine/src/craft-memory.mjs").Ledger | null, ledgerFile?: string, filmId?: string, resume?: Awaited<ReturnType<typeof resumeState>> | null }} o
 */
export async function pictures(o) {
  const u = o.understanding;
  if (u.kind === "quran") {
    // The meaning of each ayah from recorded sources (Tanzil Uthmani, Pickthall 1930, the literal lexicon), for the guard and for a person to check.
    const texts = await loadQuranTexts();
    const ranges = u.quranPlan.scenes.filter((/** @type {any} */ s) => s.kind === "ayah").map((/** @type {any} */ s) => ({ surah: s.surah, fromAyah: s.ayah, toAyah: s.ayah }));
    const meaning = passageMeaning(texts, ranges);
    await writeFile(join(o.out, "meaning.json"), JSON.stringify(meaning, null, 1));
    await writeFile(join(o.out, "meaning.md"), meaningTable(meaning) + "\n\n" + meaning.tafsir + "\n");
    const guard = quranVisualAdabGuard({ plan: u.quranPlan, index: o.quranIndex ?? (await loadQuran()).index, meanings: planMeanings(u.quranPlan, texts) });
    // The shot list: pictures from the meaning, cut only at ayah ends and measured pauses (shots.md is for a person to check).
    let spans = [];
    try { spans = (await readSpans(join(o.out, "voice-16k.wav"))).spans; } catch { spans = []; }
    const direction = directQuranFilm({ plan: u.quranPlan, meaning, spans, adab: o.adab ?? "strict" });
    await writeFile(join(o.out, "shots.json"), JSON.stringify(direction, null, 1));
    await writeFile(join(o.out, "shots.md"), shotTable(direction) + "\n");
    await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "quran", guard, direction: { ok: direction.ok, shots: direction.shots.length, problems: direction.problems } }, null, 1));
    return { ok: guard.ok && direction.ok, messages: [...guard.messages, ...direction.messages], problems: [...guard.problems, ...direction.problems], gaps: guard.gaps };
  }
  const brain = o.brain ?? null;
  const resume = o.resume ?? null;
  const kept = /** @type {string[]} */ (resume?.stages ?? []);
  /** @type {any[]} */
  const messages = kept.length ? [msg("voice.resumed", { stages: kept.join(", ") })] : [];
  // The Director pass first (beats.json): the world, the genre and a beat sheet; the picture plan is told the world.
  // A finished pass is read from its own file instead of being asked again (a re-run after the free day's quota).
  const director = resume?.beats ?? await planBeats({ brain, scenes: u.scenes, structure: u.structure, topic: o.topic });
  if (!resume?.beats) await writeFile(join(o.out, "beats.json"), JSON.stringify({ world: director.world, genre: director.genre, language: director.language, beats: director.beats, findings: director.findings, brainFindings: director.brainFindings }, null, 1));
  const r = resume?.pictures
    ? { markdown: resume.pictures.markdown, plan: resume.pictures.saved?.plan ?? [], findings: resume.pictures.saved?.findings ?? [], messages: [], brainUsed: true, changedByBrain: resume.pictures.saved?.changedByBrain ?? [], media: resume.pictures.saved?.media ?? null, chapterMedia: resume.pictures.chapterMedia ?? null }
    : await planVoiceVisuals({ brain, scenes: u.scenes, structure: u.structure, topic: o.topic, worldNote: worldBrief(director.world), providers: o.media ? mediaProviders({ pexelsKey: process.env.PEXELS_API_KEY || undefined, pixabayKey: process.env.PIXABAY_API_KEY || (process.env.ZUPONA_STOCK_RELAY ? "relay" : undefined), smithsonianKey: process.env.SMITHSONIAN_API_KEY || undefined, archiveEnv: archiveKeys(process.env), fetch: stockRelayFetch(process.env.ZUPONA_STOCK_RELAY) }) : [], reachable: o.media ? fileReachable : undefined, concurrency: Number(process.env.ZUPONA_MEDIA_CONCURRENCY) || 1 });
  if (!resume?.pictures) await writeFile(join(o.out, "pictures.md"), r.markdown + "\n");
  // The shot plan (shots.json): every shot typed, re-cut to the genre's rhythm, designed moments on the voice's own lines.
  // The Craft Ledger: the targets earlier films taught for this genre (never looser than the house), read by the
  // shot plan here and by the renderer's critic through craft-targets.json.
  const doctrine = calibratedDoctrine(o.ledger ?? emptyLedger(), ledgerGenre(director.genre));
  const rhythm = rhythmFrom(doctrine, GENRE_RHYTHM[/** @type {keyof typeof GENRE_RHYTHM} */ (director.genre)] ?? GENRE_RHYTHM.documentary);
  await writeFile(join(o.out, "craft-targets.json"), JSON.stringify({ ...doctrine, rhythm, filmId: o.filmId ?? basename(o.out), ...(o.ledgerFile ? { ledgerFile: o.ledgerFile } : {}) }, null, 1));
  const plan = resume?.shots
    ? { markdown: r.markdown, genre: resume.shots.genre ?? director.genre, world: resume.shots.world ?? director.world, hook: resume.shots.hook, shots: resume.shots.shots, findings: resume.shots.findings ?? [], edit: [] }
    : planShots({ markdown: r.markdown, scenes: u.scenes, beats: director.beats, world: director.world, genre: director.genre, topic: o.topic, structure: u.structure, rhythm });
  const lens = plan.shots.map((x) => x.seconds).sort((a, b) => a - b);
  const designed = plan.shots.filter((x) => DESIGNED_TYPES.includes(x.type));
  const planMessages = [
    msg("craft.read", { films: doctrine.films, genre: doctrine.genre, learned: Object.values(doctrine.targets).filter((t) => t.source === "learned").length, lo: rhythm.median[0], hi: rhythm.median[1], max: rhythm.max }),
    msg("voice.shotPlan", { shots: plan.shots.length, designed: designed.length, kinds: [...new Set(designed.map((x) => x.type))].join(", ") || "—", median: lens[Math.floor(lens.length / 2)] ?? 0, problems: plan.findings.length }),
    msg("voice.hook", { score: plan.hook.score, beats: plan.hook.beats, titleAt: plan.hook.titleAt === null ? null : Math.round(plan.hook.titleAt), designed: plan.hook.designed }),
  ];
  if (!resume?.shots) await writeFile(join(o.out, "shots.json"), JSON.stringify({ genre: director.genre, world: director.world, hook: plan.hook, shots: plan.shots, findings: plan.findings }, null, 1));
  // The run folder the renderer reads (render/render-film.mjs --run <out> --one-track <recording> --words words.json).
  await writeFile(join(o.out, "s3-chapters.json"), JSON.stringify([{ id: "C1", title: o.topic ?? "" }]));
  // A quiet score under a narration (never under a recitation): s4.md is the cue plan the free score composes.
  const score = voiceScore(u.scenes, { kind: "narration" });
  if (score) await writeFile(join(o.out, "s4.md"), score.s4);
  const s5 = score ? withMusic(plan.markdown, score.cueOf) : plan.markdown;
  await writeFile(join(o.out, "s5-C1.md"), s5 + "\n");
  // The Edit Director stage on the voiceover chapter (edit-C1.json, the file the renderer reads).
  const cut = resume?.edit
    ? { edit: resume.edit, stats: null, answered: 0, calls: 0, stopped: "", fromBrain: 0 }
    : await directEdit({ markdown: s5, chapter: "C1", genre: director.genre, brain, code: plan.edit });
  if (!resume?.edit) await writeFile(join(o.out, "edit-C1.json"), JSON.stringify(cut.edit, null, 1));
  if (!resume?.edit && cut.stats) planMessages.push(msg("voice.edit", { answered: cut.answered, calls: cut.calls, transitions: cut.stats.transitions, punchIns: cut.stats.punchIns, hits: cut.stats.hits, dropped: cut.stats.dropped }));
  if (cut.stopped) planMessages.push(msg("voice.brainStopped", { reason: cut.stopped }));
  // The QA squad's pass (prompts/4 squad 8) over the finished plan: its findings join the same problems list, no loop of its own.
  // A plan read from its saved file was already audited (its findings are empty, or the file would not be reused).
  const qa = resume?.shots ? { findings: [], called: 0, stopped: "" } : await auditVoiceFilm({ brain, shots: plan.shots, scenes: u.scenes, hook: plan.hook });
  if (!resume?.shots) planMessages.push(msg("voice.qa", { found: qa.findings.length, called: qa.called }));
  if (qa.stopped) planMessages.push(msg("voice.brainStopped", { reason: qa.stopped }));
  if (r.chapterMedia && !resume?.pictures) await writeFile(join(o.out, "media-C1.json"), JSON.stringify(r.chapterMedia, null, 1));
  await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "narration", plan: r.plan, findings: r.findings, media: r.media, changedByBrain: r.changedByBrain }, null, 1));
  return { ok: r.findings.length === 0 && director.findings.length === 0 && plan.findings.length === 0, messages: [...messages, ...(director.messages ?? []), ...r.messages, ...planMessages], problems: [...(director.findings ?? []).map((f) => `${f.beat}: ${f.code} (${f.detail})`), ...r.findings.map((f) => f.detail), ...qa.findings.map((f) => `${f.shot}: ${f.code} (${f.detail})`), ...plan.findings.map((f) => `${f.shot}: ${f.code} (${f.detail})`)], gaps: [] };
}

/**
 * Master the voice with the real engine, as planVoice decides (profile,
 * space, and the refusals: a recitation is never synthetic, a narration gets
 * no hall). The film then uses mastered.wav; the original stays untouched.
 * @param {{ audio: string, out: string, kind: "quran" | "narration", space?: string, ayahEnds?: number[], lang?: "en" | "bn", log?: (line: string) => void }} o
 */
export async function master(o) {
  const quran = o.kind === "quran";
  const plan = planVoice({ source: "own-recording", contentType: quran ? "quran_recitation" : "documentary", versionId: quran ? "ar" : "en-US", space: o.space ?? (quran ? "mosque-hall" : "dry") });
  if (plan.blocked || !plan.mastering) return { ok: false, blocked: plan.blocked, plan, file: null, seconds: 0 };
  // The plan's own loudness step sets the target (a narration that will sit over a music bed is mastered 1 LU lower).
  const loud = plan.chain.find((c) => c.step === "loudness");
  const r = await masterFile({ audio: o.audio, out: join(o.out, "master"), profile: plan.mastering.profile, presets: [plan.mastering.preset], ayahEnds: o.ayahEnds, targetLufs: typeof loud?.targetLufs === "number" ? loud.targetLufs : undefined, lang: o.lang, log: o.log });
  const done = r.results[0];
  return { ok: r.ok, blocked: null, plan, file: done.wav, seconds: done.seconds, report: done.report };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.audio !== "string") {
    console.error("Usage: node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>] [--master [clean|mosque-hall|grand-hall|dry|warm-room]]");
    process.exit(2);
  }
  const out = resolve(typeof args.out === "string" ? args.out : join("voice-runs", basename(args.audio).replace(/\.[^.]+$/, "")));
  const lang = args.lang === "bn" ? "bn" : "en";
  const slice = parseSlice(args.slice);
  if (slice && args.script) { console.error("--slice cannot be used with --script (the script is the whole film's words)."); process.exit(2); }
  if (slice && !(await hasFfmpeg())) { console.error(msg("voice.noFfmpeg")[lang]); process.exit(1); }
  // The test bench: from here on, the recording is the slice.
  const source = slice ? await cutSlice({ audio: resolve(args.audio), out, slice }) : resolve(args.audio);
  if (slice) console.log(`Slice ${args.slice}: ${slice.end - slice.start} s of ${basename(String(args.audio))} -> ${source}`);
  let step1 = await intake({ audio: source, out });
  for (const m of step1.messages) console.log("- " + m[lang]);
  if (!step1.ok || !step1.report) process.exit(1);
  // The run folder's fingerprint and what an earlier run already finished. A re-run of the same recording and
  // brief continues from there (a 40-minute film's speech-to-text alone takes hours); another brief starts fresh.
  const fingerprint = {
    audio: basename(source),
    bytes: (await stat(source)).size,
    topic: typeof args.topic === "string" ? args.topic : null,
    kind: args.kind,
    slice: slice ? `${slice.start}-${slice.end}` : null,
    media: args.media === true,
    tighten: args.tighten === "off" ? "off" : "on",
    transcript: typeof args.transcript === "string" ? basename(args.transcript) : null,
    script: typeof args.script === "string" ? basename(args.script) : null,
    stt: typeof args.stt === "string" ? args.stt : null,
    model: typeof args.model === "string" ? args.model : null,
  };
  await writeFile(join(out, "run.json"), JSON.stringify({ version: 1, signature: runSignature(fingerprint), about: fingerprint }, null, 1));
  const resume = await resumeState(out, fingerprint);
  // Long silences out, so the film never holds on dead air (--tighten off keeps the recording as it is).
  let voicePath = source;
  /** @type {((t: number) => number) | undefined} */
  let remap;
  if (args.tighten !== "off" && step1.analysisWav && step1.sttWav) {
    const t = await tightenRecording({ out, analysisWav: step1.analysisWav, sttWav: step1.sttWav, kind: args.kind === "narration" ? "narration" : "quran" });
    if (t) {
      console.log("- " + t.message[lang]);
      await writeFile(join(out, "voice-report-original.json"), JSON.stringify(step1.report, null, 2));
      voicePath = t.file;
      remap = t.plan.map;
      step1 = await intake({ audio: voicePath, out });
      if (!step1.ok || !step1.report) process.exit(1);
    }
  }
  /** @param {string | boolean | undefined} x */
  const str = (x) => (typeof x === "string" ? resolve(x) : undefined);
  /** @type {string | null} */
  let mastered = null;
  const given = { surah: args.surah, ayat: args.ayat, passage: args.passage };
  const hasGiven = typeof args.surah === "string" || typeof args.passage === "string";
  if (args.transcript || args.stt || hasGiven) {
    /** @type {any} */
    let step2 = resume.words ?? { words: [], language: null };
    if (resume.words) console.log(`- ${msg("voice.resumed", { stages: "words" })[lang]}`);
    else if (args.transcript || args.stt) {
      step2 = await words({ out, totalSeconds: step1.report.durationSeconds, sttWav: step1.sttWav, transcript: str(args.transcript), remap, slice, stt: typeof args.stt === "string" ? args.stt : undefined, model: typeof args.model === "string" ? args.model : undefined, language: typeof args.language === "string" ? args.language : hasGiven || args.kind === "quran" ? "ar" : undefined, script: str(args.script) });
      for (const m of step2.messages) console.log("- " + m[lang]);
      if (!step2.check.ok) process.exit(1);
    }
    // Names misheard by speech-to-text take the topic's spelling, so cards and subtitles agree ("Ramish" -> "Ramesh").
    if (typeof args.topic === "string" && step2.words?.length) {
      const fixed = respellNames(step2.words, args.topic);
      if (fixed) console.log(`- names respelled from the topic: ${fixed}`);
    }
    // With a given passage the text is aligned to the audio when Python can run it (--python, or ZUPONA_PYTHON).
    const python = typeof args.python === "string" ? args.python : process.env.ZUPONA_PYTHON;
    const marks = typeof args.marks === "string" ? JSON.parse(await readFile(resolve(args.marks), "utf8")) : null;
    const about = { sttWav: step1.sttWav, given: hasGiven ? given : null, opening: args.opening, closing: args.closing, python, marks };
    const step3 = resume.understanding ?? await understand({ out, transcript: step2, totalSeconds: step1.report.durationSeconds, kind: /** @type {any} */ (hasGiven ? "quran" : args.kind), ...about });
    for (const m of step3.messages) console.log("- " + m[lang]);
    for (const p of step3.problems) console.log("! " + p);
    if (!step3.ok) process.exit(/** @type {any} */ (step3).question ? 3 : 1);
    let understanding = step3;
    // Retakes: now that the words are timed and the passage is located, the failed takes a hafiz leaves (a
    // stumble, a restart, a word broken and said again) are cut and only the last complete take stays. The same
    // cutter joins them; every edge snaps to a measured silence. A recitation only: narration is left alone.
    if (args.retakes !== "off" && understanding.kind === "quran" && step2.words?.length) {
      const located = await readFile(join(out, "quran-location.json"), "utf8").then(JSON.parse, () => null);
      if (located?.ok && located.ayat?.length && step1.analysisWav) {
        const q = await loadQuran();
        const r = await retakeRecording({ out, analysisWav: step1.analysisWav, sttWav: /** @type {string} */ (step1.sttWav), words: step2.words, location: located, index: q.index });
        if (r.cuts.length || r.message.code === "quran.retakesGap") console.log("- " + r.message[lang]);
        if (r.file && r.map) {
          voicePath = r.file;
          // The words of a cut take are gone from the recording, so they leave the word list too (their times are
          // on the old clock); the rest move onto the cut recording with the tighten clock map.
          const keptWords = step2.words.filter((/** @type {any} */ w) => !r.cuts.some((/** @type {any} */ c) => w.start >= c.from - 1e-6 && w.start < c.to - 1e-6));
          step2 = { ...step2, words: remapWords(keptWords, r.map) };
          await writeFile(join(out, "words.json"), JSON.stringify(step2, null, 1));
          step1 = await intake({ audio: voicePath, out });
          if (!step1.ok || !step1.report) process.exit(1);
          understanding = await understand({ out, transcript: step2, totalSeconds: step1.report.durationSeconds, kind: /** @type {any} */ (understanding.kind), ...about });
          if (!understanding.ok) process.exit(/** @type {any} */ (understanding).question ? 3 : 1);
        }
      }
    }
    if (args.master) {
      const kind = step3.kind === "quran" ? "quran" : "narration";
      const m = await master({ audio: voicePath, out, kind, space: typeof args.master === "string" ? args.master : undefined, ayahEnds: kind === "quran" ? ayahEndsOf(/** @type {any} */ (step3).quranPlan) : undefined, lang, log: (line) => console.log(line) });
      if (!m.ok) { console.error(m.blocked ?? "Mastering failed its own checks; see the report."); process.exit(1); }
      mastered = m.file;
      // Cut again on the mastered length, so the last picture holds through the reverb's tail. Word times do not move.
      understanding = await understand({ out, transcript: step2, totalSeconds: m.seconds, kind: /** @type {any} */ (hasGiven ? "quran" : args.kind), ...about });
      if (!understanding.ok) process.exit(1);
    }
    const adab = ["strict", "nature", "people-distant"].includes(String(args.adab)) ? /** @type {any} */ (args.adab) : "strict";
    const vb = voiceBrain(process.env);
    if (vb.refused) console.log("- " + msg("voice.paidBrainRefused")[lang]);
    else if (vb.model) console.log(`- Brain: ${vb.kind}`);
    // The ledger (--ledger, default out/craft-ledger.json): read here; this film is added to it after the render,
    // unless --ledger-record off (the studio's runner: the Worker keeps the ledger in R2 and records it there).
    const ledgerPath = resolve(typeof args.ledger === "string" ? args.ledger : join("out", "craft-ledger.json"));
    const read = await readFile(ledgerPath, "utf8").then(parseLedger, () => null);
    for (const n of read?.notes ?? []) console.log("- " + msg(n.code, n.params ?? {})[lang]);
    // A used-up day stops here: what is finished is saved, and the next run continues from it (voice.brainDaySpent).
    let step4;
    try {
      step4 = await pictures({ out, understanding, brain: vb.model, ledger: read?.ledger ?? null, ledgerFile: args["ledger-record"] === "off" ? undefined : ledgerPath, filmId: typeof args["film-id"] === "string" ? args["film-id"] : undefined, media: args.media === true, topic: typeof args.topic === "string" ? args.topic : undefined, adab, resume });
    } catch (e) {
      if (!(/** @type {any} */ (e)?.daily)) throw e;
      const spent = msg("voice.brainDaySpent", { resets: /** @type {any} */ (e).wait ?? "" });
      console.error("- " + spent[lang]);
      console.error(`- ${spent.en}`);
      process.exit(4);
    }
    for (const m of step4.messages) console.log("- " + m[lang]);
    for (const p of [...step4.problems, ...step4.gaps]) console.log("! " + p);
    // What the free brain cost this film (measured, so a 40-minute film's need is known against the daily limits).
    const calls = /** @type {any} */ (vb.model)?.calls;
    if (Array.isArray(calls)) {
      const by = calls.reduce((/** @type {Record<string, number>} */ a, /** @type {any} */ x) => ({ ...a, [x.model]: (a[x.model] ?? 0) + 1 }), {});
      console.log(`- Free brain calls: ${calls.length} (${Object.entries(by).map(([m, n]) => `${m} ${n}`).join(", ") || "none"})`);
      await writeFile(join(out, "brain-calls.json"), JSON.stringify(calls, null, 1));
    }
    if (!step4.ok) process.exit(1);
    if (args.eyes === true && args.media === true && step3.kind !== "quran") {
      // The eyes never stop the film: without Python, OpenCLIP or the network the plan's picks stay.
      const groq = process.env.GROQ_API_KEY && String(process.env.GROQ ?? "").toLowerCase() !== "off" ? String(process.env.GROQ_API_KEY) : "";
      const t = Date.now();
      try {
        await rerankRun({ run: out, brain: vb.model, look: groq ? groqLook({ apiKey: groq }) : null, topic: typeof args.topic === "string" ? args.topic : undefined, log: (line) => console.log("- " + line) });
        console.log(`- Eyes done in ${Math.round((Date.now() - t) / 1000)} s.`);
      } catch (e) {
        console.log(`! The eyes could not rank the pictures (${String(/** @type {any} */ (e)?.message ?? e).slice(0, 200)}); the plan's picks stay.`);
      }
    }
  } else if (args.master) {
    if (args.kind === "auto") { console.error("--master needs --kind quran or narration when there is no transcript to tell them apart."); process.exit(2); }
    const m = await master({ audio: voicePath, out, kind: /** @type {any} */ (args.kind), space: typeof args.master === "string" ? args.master : undefined, lang, log: (line) => console.log(line) });
    if (!m.ok) { console.error(m.blocked ?? "Mastering failed its own checks; see the report."); process.exit(1); }
    mastered = m.file;
  }
  if (mastered) console.log(`Mastered voice: ${mastered} (use it as --one-track for the film)`);
  else if (voicePath !== source) console.log(`Tightened voice: ${voicePath} (use it as --one-track for the film; its words are timed on it)`);
  console.log(`Saved in ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message_?.en ?? e.message); process.exit(1); });
