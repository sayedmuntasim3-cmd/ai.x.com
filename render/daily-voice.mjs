/**
 * The daily film's voice: the free Zupona narrator (Kokoro-82M, render/narrate.mjs) reads the script
 * (render/daily-script.mjs) paragraph by paragraph, with the topic's pronunciation list, and the takes
 * are joined into one MP3, the recording the voiceover pipeline makes the film from.
 *
 *   node render/daily-voice.mjs --run run/ --topic <id> --out narration.mp3 [--python python3] [--models <dir>]
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dailyTopic } from "../worker/daily-film.mjs";
import { kokoroWorker, modelFiles, narrate } from "./narrate.mjs";
import { parseArgs } from "./voice-runner.mjs";

/** Silence between paragraphs and, longer, between parts of the film (seconds). */
export const PARAGRAPH_GAP = 0.35;
export const PART_GAP = 1.2;

/**
 * The narrator's lines (one scene a paragraph) and where each part of the film begins.
 * @param {{ chapters: { text: string }[] }} script
 */
export function scriptLines(script) {
  /** @type {{ scene: string, text: string, partStart: boolean }[]} */
  const lines = [];
  script.chapters.forEach((ch) => {
    ch.text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).forEach((text, i) => lines.push({ scene: `SC${String(lines.length + 1).padStart(4, "0")}`, text, partStart: i === 0 }));
  });
  return lines;
}

/**
 * The ffmpeg concat list: every take, with a gap of silence before each one but the first.
 * @param {{ scene: string, partStart: boolean }[]} lines @param {string} dir @param {Set<string>} [have] scenes with a take
 */
export function concatList(lines, dir, have) {
  const out = [];
  for (const [i, l] of lines.entries()) {
    if (have && !have.has(l.scene)) continue;
    if (i > 0) out.push(`file '${join(dir, l.partStart ? "gap-part.wav" : "gap.wav")}'`);
    out.push(`file '${join(dir, `${l.scene}.wav`)}'`);
  }
  return `${out.join("\n")}\n`;
}

/** @param {string[]} args */
function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr.slice(-400)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(["voice", ...process.argv.slice(2)]);
  const topic = dailyTopic(String(a.topic ?? ""));
  if (!topic || typeof a.run !== "string" || typeof a.out !== "string") { console.error("Usage: node render/daily-voice.mjs --run run/ --topic <id> --out narration.mp3"); process.exit(2); }
  const t0 = Date.now();
  const files = await modelFiles(typeof a.models === "string" ? a.models : process.env.KOKORO_DIR ?? join(homedir(), ".cache", "zupona", "kokoro"));
  if (!files.ok) { console.error(`BLOCK: ${files.error?.en}`); process.exit(1); }
  const script = JSON.parse(readFileSync(join(a.run, "script.json"), "utf8"));
  const lines = scriptLines(script);
  const dir = join(a.run, "narration");
  const worker = kokoroWorker({ python: typeof a.python === "string" ? a.python : "python3", model: /** @type {string} */ (files.model), voices: /** @type {string} */ (files.voices) });
  const r = await narrate({ lines, outDir: dir, versionId: "en-US", contentType: "documentary", lexicon: topic.lexicon, worker, log: (l) => console.log(l) });
  if (r.blocked) { console.error(`BLOCK: ${r.blocked.en}`); process.exit(1); }
  const have = new Set(r.takes.map((t) => t.scene));
  if (r.failed.length > lines.length * 0.05 || !have.size) { console.error(`BLOCK: the narrator failed on ${r.failed.length} of ${lines.length} paragraphs: ${r.failed.slice(0, 2).map((f) => f.error).join("; ")}`); process.exit(1); }
  ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(PARAGRAPH_GAP), "-c:a", "pcm_s16le", join(dir, "gap.wav")]);
  ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", String(PART_GAP), "-c:a", "pcm_s16le", join(dir, "gap-part.wav")]);
  writeFileSync(join(dir, "concat.txt"), concatList(lines, resolve(dir), have));
  ffmpeg(["-f", "concat", "-safe", "0", "-i", join(dir, "concat.txt"), "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", a.out]);
  const seconds = Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", a.out], { encoding: "utf8" }).stdout.trim());
  const report = { paragraphs: lines.length, recorded: r.recorded, failed: r.failed, seconds: Math.round(seconds), minutes: Math.round(seconds / 6) / 10, wpm: Math.round(lines.reduce((n, l) => n + l.text.split(/\s+/).filter(Boolean).length, 0) / (seconds / 60)), lexicon: topic.lexicon, check: r.check, narrateMinutes: Math.round((Date.now() - t0) / 6000) / 10 };
  writeFileSync(join(a.run, "daily-voice.json"), JSON.stringify(report, null, 1));
  console.log(`narration: ${report.minutes} min, ${report.wpm} words a minute, ${r.recorded} paragraphs, ${r.failed.length} failed, made in ${report.narrateMinutes} min`);
}
