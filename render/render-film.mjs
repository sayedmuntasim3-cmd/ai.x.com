#!/usr/bin/env node
/**
 * Render a film run to an MP4 with ffmpeg: picture from the timeline (stock
 * clips scaled and cropped to the frame, text cards, black), narration laid
 * scene by scene, loudness to -14 LUFS, plus SubRip captions and a report.
 *
 * It runs wherever ffmpeg runs (a container, a VM or the owner's own
 * computer), not in the Worker. Every segment and audio piece is cached
 * under a hash of what makes it, so a stopped render resumes and a changed
 * scene re-renders only its own shots.
 *
 *   node render/render-film.mjs --run productions/x/USA --voice voice/ --out film.mp4
 *   node render/render-film.mjs --api https://ai.zupona.com --id <film id> --out film.mp4
 *   options: --voice <SC0001.mp3 ...> --music <M01.mp3 ...> --width 1920 --height 1080 --fps 30 --work .render --font /path/font.ttf
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTimeline, toSrt } from "../engine/src/timeline.mjs";

const SAMPLE_RATE = 48000;
const MAX_TEMPO = 1.15;
const FONT_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "C:\\Windows\\Fonts\\arialbd.ttf",
];

/**
 * Run ffmpeg or ffprobe; reject with its last lines of stderr.
 * @param {string} bin @param {string[]} args
 * @returns {Promise<string>} stdout
 */
export function run(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err = (err + d).slice(-4000); });
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok(out) : fail(new Error(`${bin} exited ${code}: ${err.split("\n").slice(-6).join("\n")}`))));
  });
}

/** @param {string} file @param {string} [ffprobe] */
export async function mediaDuration(file, ffprobe = "ffprobe") {
  const out = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number(out.trim());
}

/** @param {unknown} v */
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/**
 * Wrap card text to lines of at most n characters.
 * @param {string} text @param {number} n
 */
function wrap(text, n) {
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > n) { lines.push(line); line = w; } else line = line ? line + " " + w : w;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join("\n");
}

/**
 * Run tasks with at most `limit` at a time.
 * @template T @param {T[]} items @param {number} limit @param {(item: T, index: number) => Promise<void>} fn
 */
async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next; next += 1; await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

/**
 * Download a clip once into the cache.
 * @param {string} url @param {string} dir
 */
async function downloadClip(url, dir) {
  const file = join(dir, hash(url) + ".mp4");
  if (existsSync(file)) return file;
  let lastError;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      writeFileSync(file + ".part", Buffer.from(await res.arrayBuffer()));
      renameSync(file + ".part", file);
      return file;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastError;
}

/**
 * @typedef {import("../engine/src/timeline.mjs").Timeline} Timeline
 * @typedef {{ timeline: Timeline, workDir: string, outFile: string, voice?: Record<string, string>, music?: Record<string, string>, fetchClip?: (url: string) => Promise<string>, fontFile?: string, concurrency?: number, ffmpeg?: string, ffprobe?: string, log?: (line: string) => void }} RenderOptions
 */

/**
 * Render the timeline. Returns what was rendered and every warning.
 * @param {RenderOptions} o
 */
export async function renderFilm(o) {
  const t = o.timeline;
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const ffprobe = o.ffprobe ?? "ffprobe";
  const log = o.log ?? (() => {});
  const dirs = { clips: join(o.workDir, "clips"), segments: join(o.workDir, "segments"), audio: join(o.workDir, "audio"), cards: join(o.workDir, "cards") };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  const font = o.fontFile ?? FONT_CANDIDATES.find((f) => existsSync(f));
  /** @type {string[]} */
  const warnings = [...t.notes];
  const stats = { segmentsRendered: 0, segmentsCached: 0, audioRendered: 0, clipsFailed: 0 };
  const fetchClip = o.fetchClip ?? ((url) => downloadClip(url, dirs.clips));
  const limit = o.concurrency ?? Math.max(1, cpus().length - 1);
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(t.fps), "-video_track_timescale", "90000", "-an"];
  const frame = `scale=${t.width}:${t.height}:force_original_aspect_ratio=increase,crop=${t.width}:${t.height},fps=${t.fps},setsar=1`;
  const color = (/** @type {string} */ c) => ["-f", "lavfi", "-i", `color=c=${c}:s=${t.width}x${t.height}:r=${t.fps}`];

  // 1. Picture: one cached segment per shot, rendered in parallel.
  /** @type {string[]} */
  const segments = new Array(t.video.length);
  await pool(t.video, limit, async (v, i) => {
    const key = hash({ type: v.type, url: v.url, text: v.text, motion: v.motion, frames: v.frames, w: t.width, h: t.height, fps: t.fps, font });
    const file = join(dirs.segments, `${String(i).padStart(5, "0")}-${key}.mp4`);
    segments[i] = file;
    if (existsSync(file)) { stats.segmentsCached += 1; return; }
    /** @type {string[]} */
    let input;
    let filter;
    let type = v.type;
    if (type === "clip" && v.url) {
      try {
        input = ["-stream_loop", "-1", "-i", await fetchClip(v.url)];
        filter = v.motion === "push" ? `${frame},zoompan=z='1+0.06*on/${v.frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${t.width}x${t.height}:fps=${t.fps}` : frame;
      } catch (error) {
        stats.clipsFailed += 1;
        warnings.push(`${v.id}: clip could not be downloaded (${error instanceof Error ? error.message : error}); a text card stands in.`);
        type = "card";
      }
    }
    if (type !== "clip" || !input) {
      input = color(type === "black" ? "black" : "0x0b110e");
      filter = "null";
      if (type === "card" && v.text && font) {
        const textFile = join(dirs.cards, `${key}.txt`);
        writeFileSync(textFile, wrap(v.text, 26));
        const esc = (/** @type {string} */ p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
        filter = `drawtext=fontfile='${esc(font)}':textfile='${esc(textFile)}':fontcolor=0xe4ede7:fontsize=${Math.round(t.height * 0.065)}:line_spacing=${Math.round(t.height * 0.02)}:x=(w-text_w)/2:y=(h-text_h)/2`;
      }
    }
    await run(ffmpeg, ["-v", "error", "-y", ...input, "-frames:v", String(v.frames), "-vf", /** @type {string} */ (filter), "-threads", "2", ...enc, file + ".part.mp4"]);
    renameSync(file + ".part.mp4", file);
    stats.segmentsRendered += 1;
    if ((stats.segmentsRendered + stats.segmentsCached) % 50 === 0) log(`picture: ${stats.segmentsRendered + stats.segmentsCached}/${t.video.length}`);
  });
  const videoList = join(o.workDir, "video.txt");
  writeFileSync(videoList, segments.map((s) => `file '${resolve(s).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const videoFile = join(o.workDir, "video.mp4");
  await run(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", videoList, "-c", "copy", videoFile]);
  log("picture: joined");

  // 2. Narration: each scene's voice in its slot, sped up at most 15%, silence elsewhere.
  /** @type {{ start: number, end: number, file: string | null, scene: string | null }[]} */
  const pieces = [];
  let clock = 0;
  for (const n of [...t.narration].sort((a, b) => a.start - b.start)) {
    if (n.start > clock + 1e-6) pieces.push({ start: clock, end: n.start, file: null, scene: null });
    const end = Math.min(n.end, t.durationSeconds);
    if (end > n.start) pieces.push({ start: n.start, end, file: o.voice?.[n.scene] ?? null, scene: n.scene });
    clock = Math.max(clock, end);
  }
  if (t.durationSeconds > clock + 1e-6) pieces.push({ start: clock, end: t.durationSeconds, file: null, scene: null });
  const audioFiles = [];
  let samplesSoFar = 0;
  for (const p of pieces) {
    // Sample counts come from the running total, so the track ends exactly with the picture.
    const endSample = Math.round(p.end * SAMPLE_RATE);
    const samples = endSample - samplesSoFar;
    samplesSoFar = endSample;
    if (samples <= 0) continue;
    let tempo = 1;
    if (p.file) {
      const spoken = await mediaDuration(p.file, ffprobe);
      const slot = samples / SAMPLE_RATE;
      if (spoken > slot) {
        tempo = Math.min(MAX_TEMPO, spoken / slot);
        if (spoken / tempo > slot + 0.05) warnings.push(`${p.scene}: voice is ${spoken.toFixed(1)} s for a ${slot.toFixed(1)} s scene; ${(spoken / tempo - slot).toFixed(1)} s cut. Shorten the narration or lengthen the scene.`);
        else if (tempo > 1.01) warnings.push(`${p.scene}: voice sped up ${Math.round((tempo - 1) * 100)}% to fit its scene.`);
      }
    }
    const key = hash({ file: p.file ? resolve(p.file) : null, tempo, samples });
    const file = join(dirs.audio, `${key}.wav`);
    audioFiles.push(file);
    if (existsSync(file)) continue;
    const input = p.file ? ["-i", p.file] : ["-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`];
    const af = `${p.file && tempo > 1.001 ? `atempo=${tempo.toFixed(4)},` : ""}aresample=${SAMPLE_RATE},apad,atrim=end_sample=${samples}${p.file ? ",afade=t=out:st=" + Math.max(0, samples / SAMPLE_RATE - 0.03).toFixed(3) + ":d=0.03" : ""}`;
    await run(ffmpeg, ["-v", "error", "-y", ...input, "-af", af, "-ac", "1", "-c:a", "pcm_s16le", file + ".part.wav"]);
    renameSync(file + ".part.wav", file);
    stats.audioRendered += 1;
  }
  const audioList = join(o.workDir, "audio.txt");
  writeFileSync(audioList, audioFiles.map((f) => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const narrationFile = join(o.workDir, "narration.wav");
  await run(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", audioList, "-c", "copy", narrationFile]);
  log("narration: joined");

  // 3. Music: each cue looped to its segment, faded in and out, silence between cues.
  /** @type {string | null} */
  let musicFile = null;
  const cues = (t.music ?? []).filter((m) => o.music?.[m.cue]);
  for (const m of t.music ?? []) if (!o.music?.[m.cue]) warnings.push(`${m.cue}: no music file, ${(m.end - m.start).toFixed(0)} s from ${m.start.toFixed(1)} s play without music.`);
  if (cues.length) {
    const musicFiles = [];
    let at = 0;
    for (const m of [...cues].sort((a, b) => a.start - b.start)) {
      const start = Math.max(m.start, at);
      if (start > at + 1e-6) musicFiles.push(await audioPiece(null, Math.round(start * SAMPLE_RATE) - Math.round(at * SAMPLE_RATE)));
      const samples = Math.round(m.end * SAMPLE_RATE) - Math.round(start * SAMPLE_RATE);
      if (samples > 0) musicFiles.push(await audioPiece(/** @type {string} */ (o.music?.[m.cue]), samples, true));
      at = Math.max(at, m.end);
    }
    const tail = Math.round(t.durationSeconds * SAMPLE_RATE) - Math.round(at * SAMPLE_RATE);
    if (tail > 0) musicFiles.push(await audioPiece(null, tail));
    const musicList = join(o.workDir, "music.txt");
    writeFileSync(musicList, musicFiles.map((f) => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    musicFile = join(o.workDir, "music.wav");
    await run(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", musicList, "-c", "copy", musicFile]);
    log("music: joined");
  }

  /**
   * One music or silence piece of an exact sample count, cached.
   * @param {string | null} file @param {number} samples @param {boolean} [loop]
   */
  async function audioPiece(file, samples, loop = false) {
    const key = hash({ music: file ? resolve(file) : null, samples });
    const out = join(dirs.audio, `m-${key}.wav`);
    if (existsSync(out)) return out;
    const seconds = samples / SAMPLE_RATE;
    const input = file ? [...(loop ? ["-stream_loop", "-1"] : []), "-i", file] : ["-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=mono`];
    const fade = file ? `,afade=t=in:d=${Math.min(1, seconds / 4).toFixed(3)},afade=t=out:st=${Math.max(0, seconds - Math.min(1.5, seconds / 4)).toFixed(3)}:d=${Math.min(1.5, seconds / 4).toFixed(3)}` : "";
    await run(ffmpeg, ["-v", "error", "-y", ...input, "-af", `aresample=${SAMPLE_RATE},apad,atrim=end_sample=${samples}${fade}`, "-ac", "1", "-c:a", "pcm_s16le", out + ".part.wav"]);
    renameSync(out + ".part.wav", out);
    stats.audioRendered += 1;
    return out;
  }

  // 4. Mux: the music sits low and ducks further whenever the narrator speaks; the mix is normalised to the platform loudness.
  mkdirSync(dirname(resolve(o.outFile)), { recursive: true });
  const mix = musicFile
    ? ["-i", musicFile, "-filter_complex", "[1:a]asplit=2[voice][key];[2:a]volume=0.3[bed];[bed][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[ducked];[voice][ducked]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]", "-map", "0:v", "-map", "[a]"]
    : ["-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11"];
  await run(ffmpeg, ["-v", "error", "-y", "-i", videoFile, "-i", narrationFile, ...mix, "-c:v", "copy", "-ar", String(SAMPLE_RATE), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outFile + ".part.mp4"]);
  renameSync(o.outFile + ".part.mp4", o.outFile);
  const base = o.outFile.replace(/\.mp4$/i, "");
  writeFileSync(base + ".srt", toSrt(t.captions));
  const licences = [...new Map(t.video.filter((v) => v.type === "clip").map((v) => [v.url, { url: v.url, sourcePageUrl: v.sourcePageUrl, licence: v.licence }])).values()];
  const report = { file: basename(o.outFile), durationSeconds: t.durationSeconds, width: t.width, height: t.height, fps: t.fps, stats: { ...t.stats, ...stats }, voicedScenes: pieces.filter((p) => p.file).length, narratedScenes: t.narration.length, musicCues: { scripted: new Set((t.music ?? []).map((m) => m.cue)).size, played: new Set(cues.map((m) => m.cue)).size }, licences, warnings };
  writeFileSync(base + ".report.json", JSON.stringify(report, null, 1));
  log(`done: ${o.outFile}`);
  return report;
}

/**
 * Read a run's files from a folder (as in productions/x/USA) or the film API.
 * @param {{ dir?: string, api?: string, id?: string }} from
 */
export async function loadRunFiles(from) {
  /** @param {string} name */
  const get = async (name) => {
    if (from.dir) { const f = join(from.dir, name); return existsSync(f) ? readFileSync(f, "utf8") : null; }
    const res = await fetch(`${from.api}/api/films/${from.id}/files/${name}`);
    return res.ok ? res.text() : null;
  };
  const plan = JSON.parse((await get("s3-chapters.json")) ?? "[]");
  return Promise.all(plan.map(async (/** @type {any} */ c) => {
    const media = await get(`media-${c.id}.json`);
    return { id: c.id, markdown: (await get(`s5-${c.id}.md`)) ?? "", media: media ? JSON.parse(media) : null };
  }));
}

/** Music files named after their cue (M01.mp3 ...) in a folder. @param {string | undefined} dir */
export function musicFolder(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!dir || !existsSync(dir)) return out;
  for (const f of readdirSync(dir)) { const m = /^(M\d{2,3})\.(mp3|wav|m4a|aac|ogg|flac)$/i.exec(f); if (m) out[m[1].toUpperCase()] = join(dir, f); }
  return out;
}

/** Voice files named after their scene (SC0001.mp3, SC0001.wav ...) in a folder. @param {string | undefined} dir */
export function voiceFolder(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!dir || !existsSync(dir)) return out;
  for (const f of readdirSync(dir)) { const m = /^(SC\d{4,5})\.(mp3|wav|m4a|aac|ogg|flac)$/i.exec(f); if (m) out[m[1].toUpperCase()] = join(dir, f); }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (!args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: node render/render-film.mjs (--run <folder> | --api <site> --id <film id>) --out film.mp4 [--voice <folder>] [--music <folder>] [--width 1920 --height 1080 --fps 30 --work .render --font file.ttf]");
    process.exit(2);
  }
  const chapters = await loadRunFiles(args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id });
  const voice = voiceFolder(args.voice);
  // Captions follow the recorded voice, not the scene slot.
  /** @type {Record<string, { durationSeconds: number }>} */
  const spoken = {};
  for (const [scene, file] of Object.entries(voice)) spoken[scene] = { durationSeconds: await mediaDuration(file) };
  const timeline = buildTimeline({ chapters, voice: spoken, width: Number(args.width ?? 1920), height: Number(args.height ?? 1080), fps: Number(args.fps ?? 30) });
  const report = await renderFilm({ timeline, voice, music: musicFolder(args.music), workDir: args.work ?? ".render", outFile: args.out, fontFile: args.font, log: (l) => console.log(l) });
  console.log(JSON.stringify({ ...report, licences: report.licences.length, warnings: report.warnings.length }, null, 1));
}
