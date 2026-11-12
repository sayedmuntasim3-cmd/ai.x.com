/**
 * Voice film, on the owner's machine:
 *   node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>]
 * Step 1 (intake): ffmpeg reads any audio file; the original is never changed.
 * Two copies are made in the output folder: analysis.wav (the original rate
 * and channels, float, for the voice checks) and voice-16k.wav (16 kHz mono,
 * what speech-to-text listens to). The voice report holds duration,
 * loudness, true peak, clipping, silence and noise, each problem as a coded
 * message (engine/src/messages.mjs) in English and Bengali.
 */
import { execFile } from "node:child_process";
import { open, mkdir, writeFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRecordingAnalyzer } from "../engine/src/loudness.mjs";
import { measureWavFile } from "../engine/src/wav.mjs";
import { msg } from "../engine/src/messages.mjs";

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
  if (!step1.ok) process.exit(1);
  console.log(`Saved in ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message_?.en ?? e.message); process.exit(1); });
