/**
 * Voice film, on the owner's machine:
 *   node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>]
 *        [--transcript <json|srt|vtt>] [--stt faster-whisper|pocketsphinx] [--model small.en]
 *        [--script <the words as written, .txt>] [--topic "what the film is about"] [--media]
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
 * (understanding.json).
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
import { planVoiceVisuals, quranVisualAdabGuard } from "../engine/src/voice-visuals.mjs";
import { mediaProviders } from "../engine/src/film-media.mjs";

const run = promisify(execFile);

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
 * Run local/stt/transcribe.py on the 16 kHz copy. Python and the engine's
 * package must be installed on this machine (pip install faster-whisper).
 * @param {{ wav: string, out: string, engine: string, model?: string, language?: string, python?: string }} o
 */
export async function speechToText(o) {
  const script = new URL("./stt/transcribe.py", import.meta.url).pathname;
  const args = ["-I", script, o.wav, "--engine", o.engine, "--out", o.out];
  if (o.model) args.push("--model", o.model);
  if (o.language) args.push("--language", o.language);
  await run(o.python ?? "python3", args, { maxBuffer: 1 << 24, timeout: 6 * 3600 * 1000 });
  return normalizeTranscript(await readFile(o.out, "utf8"));
}

/**
 * Step 2: the timed words, checked against the recording.
 * @param {{ out: string, totalSeconds: number, sttWav?: string, transcript?: string, stt?: string, model?: string, language?: string, script?: string }} o
 */
export async function words(o) {
  let t;
  if (o.transcript) t = normalizeTranscript(await readFile(o.transcript, "utf8"), { name: o.transcript });
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

/** The Tanzil index and surah names, read once. */
export async function loadQuran() {
  const dir = new URL("../engine/data/quran/", import.meta.url);
  const index = buildQuranIndex(JSON.parse(await readFile(new URL("tanzil-quran-simple-1.0.2.json", dir), "utf8")));
  const surahNames = JSON.parse(await readFile(new URL("surah-names.json", dir), "utf8"));
  return { index, surahNames };
}

/**
 * Step 3: understand the voice and save understanding.json.
 * @param {{ out: string, transcript: any, totalSeconds: number, kind: "auto" | "narration" | "quran" }} o
 */
export async function understand(o) {
  const needQuran = o.kind !== "narration";
  const q = needQuran ? await loadQuran() : null;
  const u = understandVoice({ transcript: o.transcript, totalSeconds: o.totalSeconds, kind: o.kind, quranIndex: q?.index ?? null, surahNames: q?.surahNames ?? [] });
  await writeFile(join(o.out, "understanding.json"), JSON.stringify({ ...u, match: undefined }, null, 1));
  return u;
}

/**
 * Step 4. No writer model is called from here yet: the plan comes from each
 * scene's own words (planVoiceVisuals takes any brain when one is given).
 * @param {{ out: string, understanding: any, media?: boolean, topic?: string, quranIndex?: any }} o
 */
export async function pictures(o) {
  const u = o.understanding;
  if (u.kind === "quran") {
    const guard = quranVisualAdabGuard({ plan: u.quranPlan, index: o.quranIndex ?? (await loadQuran()).index });
    await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "quran", guard }, null, 1));
    return { ok: guard.ok, messages: guard.messages, problems: guard.problems, gaps: guard.gaps };
  }
  const r = await planVoiceVisuals({ scenes: u.scenes, structure: u.structure, topic: o.topic, providers: o.media ? mediaProviders({}) : [] });
  await writeFile(join(o.out, "pictures.md"), r.markdown + "\n");
  // The run folder the renderer reads (render/render-film.mjs --run <out> --one-track <recording> --words words.json).
  await writeFile(join(o.out, "s3-chapters.json"), JSON.stringify([{ id: "C1", title: o.topic ?? "" }]));
  await writeFile(join(o.out, "s5-C1.md"), r.markdown + "\n");
  if (r.chapterMedia) await writeFile(join(o.out, "media-C1.json"), JSON.stringify(r.chapterMedia, null, 1));
  await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "narration", plan: r.plan, findings: r.findings, media: r.media, changedByBrain: r.changedByBrain }, null, 1));
  return { ok: r.findings.length === 0, messages: r.messages, problems: r.findings.map((f) => f.detail), gaps: [] };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.audio !== "string") {
    console.error("Usage: node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>]");
    process.exit(2);
  }
  const out = resolve(typeof args.out === "string" ? args.out : join("voice-runs", basename(args.audio).replace(/\.[^.]+$/, "")));
  const lang = args.lang === "bn" ? "bn" : "en";
  const step1 = await intake({ audio: resolve(args.audio), out });
  for (const m of step1.messages) console.log("- " + m[lang]);
  if (!step1.ok || !step1.report) process.exit(1);
  /** @param {string | boolean | undefined} x */
  const str = (x) => (typeof x === "string" ? resolve(x) : undefined);
  if (args.transcript || args.stt) {
    const step2 = await words({ out, totalSeconds: step1.report.durationSeconds, sttWav: step1.sttWav, transcript: str(args.transcript), stt: typeof args.stt === "string" ? args.stt : undefined, model: typeof args.model === "string" ? args.model : undefined, language: typeof args.language === "string" ? args.language : undefined, script: str(args.script) });
    for (const m of step2.messages) console.log("- " + m[lang]);
    if (!step2.check.ok) process.exit(1);
    const step3 = await understand({ out, transcript: step2, totalSeconds: step1.report.durationSeconds, kind: /** @type {any} */ (args.kind) });
    for (const m of step3.messages) console.log("- " + m[lang]);
    for (const p of step3.problems) console.log("! " + p);
    if (!step3.ok) process.exit(1);
    const step4 = await pictures({ out, understanding: step3, media: args.media === true, topic: typeof args.topic === "string" ? args.topic : undefined });
    for (const m of step4.messages) console.log("- " + m[lang]);
    for (const p of [...step4.problems, ...step4.gaps]) console.log("! " + p);
    if (!step4.ok) process.exit(1);
  }
  console.log(`Saved in ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message_?.en ?? e.message); process.exit(1); });
