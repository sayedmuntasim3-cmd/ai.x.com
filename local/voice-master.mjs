#!/usr/bin/env node
/**
 * The voice mastering engine from the command line.
 *
 *   node local/voice-master.mjs --audio <file> --profile quran|narration
 *        [--preset clean|mosque-hall|grand-hall|dry|warm-room|all] [--out <dir>]
 *        [--from <s> --to <s>] [--understanding <understanding.json>] [--lang bn|en]
 *
 * ffmpeg only reads the file (to 48 kHz mono float) and writes the AAC copy;
 * all processing is the pure-JS engine in engine/src/voice-master.mjs. The
 * original file is never changed. Each preset gives <name>.wav (48 kHz
 * 24-bit), <name>.m4a (AAC) and <name>.report.json; `--preset all` makes the
 * listening pack: the original excerpt plus every space of the profile.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ayahEndsOf, masterReport, masterVoice } from "../engine/src/voice-master.mjs";
import { PROFILE_SPACES } from "../engine/src/voice-reverb.mjs";
import { truePeak } from "../engine/src/loudness.mjs";
import { pcm24, wav24Header } from "../engine/src/wav.mjs";
import { msg } from "../engine/src/messages.mjs";

const run = promisify(execFile);
export const MASTER_RATE = 48000;

/**
 * Any audio ffmpeg reads, as 48 kHz float samples (mono unless channels is 2).
 * @param {string} file @param {{ from?: number, to?: number, channels?: 1 | 2 }} [o]
 * @returns {Promise<Float32Array[]>}
 */
export async function decodeAudio(file, o = {}) {
  const channels = o.channels ?? 1;
  const cut = [...(o.from ? ["-ss", String(o.from)] : []), ...(o.to ? ["-to", String(o.to)] : [])];
  const raw = file + "." + process.pid + ".f32";
  try {
    await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...cut, "-i", file, "-vn", "-map", "0:a:0", "-ac", String(channels), "-ar", String(MASTER_RATE), "-f", "f32le", raw], { maxBuffer: 1 << 20 });
    const bytes = await readFile(raw);
    const all = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length - (bytes.length % (4 * channels))));
    if (channels === 1) return [all];
    const left = new Float32Array(all.length / 2), right = new Float32Array(all.length / 2);
    for (let i = 0; i < left.length; i += 1) { left[i] = all[2 * i]; right[i] = all[2 * i + 1]; }
    return [left, right];
  } catch (e) {
    const error = String(/** @type {any} */ (e).stderr || /** @type {any} */ (e).message || e).trim().split("\n").pop() ?? "unknown error";
    throw Object.assign(new Error(error), { message_: msg("voice.unreadable", { error }) });
  } finally { await rm(raw, { force: true }); }
}

/** Write a 24-bit WAV piece by piece. @param {string} path @param {Float32Array[]} channels @param {number} sampleRate */
export async function writeWav24(path, channels, sampleRate) {
  const handle = await open(path, "w");
  try {
    const frames = channels[0].length;
    await handle.write(wav24Header(frames, channels.length, sampleRate));
    for (let from = 0; from < frames; from += 1 << 20) await handle.write(pcm24(channels, from, Math.min(frames, from + (1 << 20))));
  } finally { await handle.close(); }
}

/** The AAC copy, and the true peak it really has once decoded again. @param {string} wav @param {string} m4a */
export async function writeAac(wav, m4a) {
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", m4a], { maxBuffer: 1 << 20 });
  const back = await decodeAudio(m4a, { channels: 2 });
  return Math.round(20 * Math.log10(truePeak(back) + 1e-12) * 100) / 100;
}

/**
 * Master one file with one or more presets.
 * @param {{ audio: string, out: string, profile: "quran" | "narration", presets: string[], from?: number, to?: number, ayahEnds?: number[], keepOriginal?: boolean, aac?: boolean, log?: (line: string) => void, lang?: "en" | "bn" }} o
 */
export async function masterFile(o) {
  const log = o.log ?? (() => {}), lang = o.lang ?? "en";
  await mkdir(o.out, { recursive: true });
  const [samples] = await decodeAudio(o.audio, { from: o.from, to: o.to });
  /** @type {{ preset: string, ok: boolean, wav: string | null, m4a: string | null, report: string, seconds: number, lufs: number | null, truePeakDb: number | null, aacTruePeakDb: number | null }[]} */
  const results = [];
  if (o.keepOriginal) {
    // The untouched excerpt, for a fair before/after by ear (it is quieter: nothing was done to it).
    await writeWav24(join(o.out, "0-original.wav"), [samples, samples], MASTER_RATE);
    if (o.aac !== false) await writeAac(join(o.out, "0-original.wav"), join(o.out, "0-original.m4a"));
  }
  let n = 0;
  for (const preset of o.presets) {
    n += 1;
    const name = (o.presets.length > 1 ? n + "-" : "") + preset;
    const started = Date.now();
    const r = masterVoice({ samples, sampleRate: MASTER_RATE, profile: o.profile, preset, ayahEnds: o.ayahEnds });
    const report = masterReport(r);
    log(`== ${preset} (${((Date.now() - started) / 1000).toFixed(1)} s) ==`);
    // The measurement is the same for every preset: print it once.
    for (const m of n === 1 ? r.messages : r.messages.filter((x) => !r.before.messages.includes(x))) log("- " + m[lang]);
    let wav = null, m4a = null, aacTruePeakDb = null;
    if (r.channels.length) {
      wav = join(o.out, name + ".wav");
      // A voice without added space is mono; it is written to both channels so every player and platform reads the same loudness.
      await writeWav24(wav, r.channels.length === 1 ? [r.channels[0], r.channels[0]] : r.channels, MASTER_RATE);
      if (o.aac !== false) { m4a = join(o.out, name + ".m4a"); aacTruePeakDb = await writeAac(wav, m4a); }
    }
    const reportFile = join(o.out, name + ".report.json");
    await writeFile(reportFile, JSON.stringify({ file: basename(o.audio), excerpt: o.from || o.to ? { from: o.from ?? 0, to: o.to ?? null } : null, ...report, aacTruePeakDb }, null, 1));
    results.push({ preset, ok: r.ok, wav, m4a, report: reportFile, seconds: r.after?.seconds ?? 0, lufs: r.master?.lufs ?? null, truePeakDb: r.master?.truePeakDb ?? null, aacTruePeakDb });
  }
  return { ok: results.every((r) => r.ok), seconds: samples.length / MASTER_RATE, results };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[a.slice(2)] = true; else { o[a.slice(2)] = next; i += 1; }
  }
  const profile = String(o.profile ?? "quran");
  if (profile !== "quran" && profile !== "narration") throw new Error(`--profile must be quran or narration, not ${profile}.`);
  const spaces = PROFILE_SPACES[profile];
  const preset = String(o.preset ?? spaces[0]);
  if (preset !== "all" && !spaces.includes(preset)) throw new Error(`--preset for ${profile} must be one of ${spaces.join(", ")} or all, not ${preset}.`);
  // The pack plays from the plainest to the largest space.
  const order = ["clean", "dry", "warm-room", "mosque-hall", "grand-hall"];
  return { ...o, profile: /** @type {"quran" | "narration"} */ (profile), presets: preset === "all" ? order.filter((p) => spaces.includes(p)) : [preset], pack: preset === "all" };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.audio !== "string") {
    console.error("Usage: node local/voice-master.mjs --audio <file> --profile quran|narration [--preset <name>|all] [--out <dir>] [--from <s> --to <s>] [--understanding <understanding.json>] [--lang bn|en]");
    process.exit(2);
  }
  const out = resolve(typeof args.out === "string" ? args.out : join("voice-masters", basename(args.audio).replace(/\.[^.]+$/, "")));
  const num = (/** @type {string | boolean | undefined} */ x) => (typeof x === "string" && Number.isFinite(Number(x)) ? Number(x) : undefined);
  const ayahEnds = typeof args.understanding === "string" ? ayahEndsOf(JSON.parse(await readFile(resolve(args.understanding), "utf8")).quranPlan) : undefined;
  const r = await masterFile({ audio: resolve(args.audio), out, profile: args.profile, presets: args.presets, from: num(args.from), to: num(args.to), ayahEnds, keepOriginal: args.pack, lang: args.lang === "bn" ? "bn" : "en", log: (line) => console.log(line) });
  for (const x of r.results) console.log(`${x.ok ? "OK " : "FAILED "} ${x.preset}: ${x.lufs} LUFS, true peak ${x.truePeakDb} dBTP (AAC ${x.aacTruePeakDb} dBTP) -> ${x.wav}`);
  console.log(`Saved in ${out}`);
  if (!r.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message_?.en ?? e.message); process.exit(1); });
