/**
 * Voice film, on the owner's machine:
 *   node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>]
 *        [--transcript <json|srt|vtt>] [--stt faster-whisper|pocketsphinx] [--model small.en]
 *        [--surah 93] [--ayat 1-11] [--passage "93, 94:1-8"] [--opening auto|none|basmala|istiadha|both] [--closing auto|none|sadaqa]
 *        [--adab strict|nature|people-distant]
 *        [--script <the words as written, .txt>] [--topic "what the film is about"] [--media] [--tighten on|off]
 *        [--marks marks.json]   (Quran: the reviewer's ayah times {start, ends[], by}; they become confirmed ends)
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
import { planVoiceVisuals, quranVisualAdabGuard, voiceScore, withMusic } from "../engine/src/voice-visuals.mjs";
import { DESIGNED_TYPES, GENRE_RHYTHM, directEdit, planBeats, planShots, worldBrief } from "../engine/src/shot-plan.mjs";
import { calibratedDoctrine, emptyLedger, ledgerGenre, parseLedger, rhythmFrom } from "../engine/src/craft-memory.mjs";
import { mediaProviders } from "../engine/src/film-media.mjs";
import { brainFromEnv } from "../worker/brain.mjs";
import { groqModel } from "../worker/groq.mjs";

import { planVoice } from "../engine/src/voice-plan.mjs";
import { ayahEndsOf } from "../engine/src/voice-master.mjs";
import { masterFile } from "./voice-master.mjs";
import { applyTighten, planTighten, remapWords } from "../engine/src/voice-tighten.mjs";
import { encodeWav24 } from "../engine/src/wav.mjs";
import { applyMarks, checkMarks } from "../engine/src/quran-marks.mjs";

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
 * @param {{ out: string, understanding: any, media?: boolean, topic?: string, quranIndex?: any, adab?: "strict" | "nature" | "people-distant", brain?: import("../engine/src/film-run.mjs").Model | null, ledger?: import("../engine/src/craft-memory.mjs").Ledger | null, ledgerFile?: string, filmId?: string }} o
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
  // The Director pass first (beats.json): the world, the genre and a beat sheet; the picture plan is told the world.
  const director = await planBeats({ brain, scenes: u.scenes, structure: u.structure, topic: o.topic });
  await writeFile(join(o.out, "beats.json"), JSON.stringify({ world: director.world, genre: director.genre, language: director.language, beats: director.beats, findings: director.findings, brainFindings: director.brainFindings }, null, 1));
  const r = await planVoiceVisuals({ brain, scenes: u.scenes, structure: u.structure, topic: o.topic, worldNote: worldBrief(director.world), providers: o.media ? mediaProviders({ pexelsKey: process.env.PEXELS_API_KEY || undefined, pixabayKey: process.env.PIXABAY_API_KEY || (process.env.ZUPONA_STOCK_RELAY ? "relay" : undefined), smithsonianKey: process.env.SMITHSONIAN_API_KEY || undefined, fetch: stockRelayFetch(process.env.ZUPONA_STOCK_RELAY) }) : [], reachable: o.media ? fileReachable : undefined, concurrency: Number(process.env.ZUPONA_MEDIA_CONCURRENCY) || 1 });
  await writeFile(join(o.out, "pictures.md"), r.markdown + "\n");
  // The shot plan (shots.json): every shot typed, re-cut to the genre's rhythm, designed moments on the voice's own lines.
  // The Craft Ledger: the targets earlier films taught for this genre (never looser than the house), read by the
  // shot plan here and by the renderer's critic through craft-targets.json.
  const doctrine = calibratedDoctrine(o.ledger ?? emptyLedger(), ledgerGenre(director.genre));
  const rhythm = rhythmFrom(doctrine, GENRE_RHYTHM[/** @type {keyof typeof GENRE_RHYTHM} */ (director.genre)] ?? GENRE_RHYTHM.documentary);
  await writeFile(join(o.out, "craft-targets.json"), JSON.stringify({ ...doctrine, rhythm, filmId: o.filmId ?? basename(o.out), ...(o.ledgerFile ? { ledgerFile: o.ledgerFile } : {}) }, null, 1));
  const plan = planShots({ markdown: r.markdown, scenes: u.scenes, beats: director.beats, world: director.world, genre: director.genre, topic: o.topic, structure: u.structure, rhythm });
  const lens = plan.shots.map((x) => x.seconds).sort((a, b) => a - b);
  const designed = plan.shots.filter((x) => DESIGNED_TYPES.includes(x.type));
  const planMessages = [
    msg("craft.read", { films: doctrine.films, genre: doctrine.genre, learned: Object.values(doctrine.targets).filter((t) => t.source === "learned").length, lo: rhythm.median[0], hi: rhythm.median[1], max: rhythm.max }),
    msg("voice.shotPlan", { shots: plan.shots.length, designed: designed.length, kinds: [...new Set(designed.map((x) => x.type))].join(", ") || "—", median: lens[Math.floor(lens.length / 2)] ?? 0, problems: plan.findings.length }),
    msg("voice.hook", { score: plan.hook.score, beats: plan.hook.beats, titleAt: plan.hook.titleAt === null ? null : Math.round(plan.hook.titleAt), designed: plan.hook.designed }),
  ];
  await writeFile(join(o.out, "shots.json"), JSON.stringify({ genre: director.genre, world: director.world, hook: plan.hook, shots: plan.shots, findings: plan.findings }, null, 1));
  // The run folder the renderer reads (render/render-film.mjs --run <out> --one-track <recording> --words words.json).
  await writeFile(join(o.out, "s3-chapters.json"), JSON.stringify([{ id: "C1", title: o.topic ?? "" }]));
  // A quiet score under a narration (never under a recitation): s4.md is the cue plan the free score composes.
  const score = voiceScore(u.scenes, { kind: "narration" });
  if (score) await writeFile(join(o.out, "s4.md"), score.s4);
  const s5 = score ? withMusic(plan.markdown, score.cueOf) : plan.markdown;
  await writeFile(join(o.out, "s5-C1.md"), s5 + "\n");
  // The Edit Director stage on the voiceover chapter (edit-C1.json, the file the renderer reads).
  const cut = await directEdit({ markdown: s5, chapter: "C1", genre: director.genre, brain, code: plan.edit });
  await writeFile(join(o.out, "edit-C1.json"), JSON.stringify(cut.edit, null, 1));
  planMessages.push(msg("voice.edit", { answered: cut.answered, calls: cut.calls, transitions: cut.stats.transitions, punchIns: cut.stats.punchIns, hits: cut.stats.hits, dropped: cut.stats.dropped }));
  if (cut.stopped) planMessages.push(msg("voice.brainStopped", { reason: cut.stopped }));
  if (r.chapterMedia) await writeFile(join(o.out, "media-C1.json"), JSON.stringify(r.chapterMedia, null, 1));
  await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "narration", plan: r.plan, findings: r.findings, media: r.media, changedByBrain: r.changedByBrain }, null, 1));
  return { ok: r.findings.length === 0 && director.findings.length === 0 && plan.findings.length === 0, messages: [...director.messages, ...r.messages, ...planMessages], problems: [...director.findings.map((f) => `${f.beat}: ${f.code} (${f.detail})`), ...r.findings.map((f) => f.detail), ...plan.findings.map((f) => `${f.shot}: ${f.code} (${f.detail})`)], gaps: [] };
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
    let step2 = { words: [], language: null };
    if (args.transcript || args.stt) {
      step2 = await words({ out, totalSeconds: step1.report.durationSeconds, sttWav: step1.sttWav, transcript: str(args.transcript), remap, slice, stt: typeof args.stt === "string" ? args.stt : undefined, model: typeof args.model === "string" ? args.model : undefined, language: typeof args.language === "string" ? args.language : hasGiven || args.kind === "quran" ? "ar" : undefined, script: str(args.script) });
      for (const m of step2.messages) console.log("- " + m[lang]);
      if (!step2.check.ok) process.exit(1);
    }
    // With a given passage the text is aligned to the audio when Python can run it (--python, or ZUPONA_PYTHON).
    const python = typeof args.python === "string" ? args.python : process.env.ZUPONA_PYTHON;
    const marks = typeof args.marks === "string" ? JSON.parse(await readFile(resolve(args.marks), "utf8")) : null;
    const about = { sttWav: step1.sttWav, given: hasGiven ? given : null, opening: args.opening, closing: args.closing, python, marks };
    const step3 = await understand({ out, transcript: step2, totalSeconds: step1.report.durationSeconds, kind: /** @type {any} */ (hasGiven ? "quran" : args.kind), ...about });
    for (const m of step3.messages) console.log("- " + m[lang]);
    for (const p of step3.problems) console.log("! " + p);
    if (!step3.ok) process.exit(/** @type {any} */ (step3).question ? 3 : 1);
    let understanding = step3;
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
    const step4 = await pictures({ out, understanding, brain: vb.model, ledger: read?.ledger ?? null, ledgerFile: args["ledger-record"] === "off" ? undefined : ledgerPath, filmId: typeof args["film-id"] === "string" ? args["film-id"] : undefined, media: args.media === true, topic: typeof args.topic === "string" ? args.topic : undefined, adab });
    for (const m of step4.messages) console.log("- " + m[lang]);
    for (const p of [...step4.problems, ...step4.gaps]) console.log("! " + p);
    if (!step4.ok) process.exit(1);
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
