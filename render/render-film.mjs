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
import { cutBriefs, renderCuts } from "./cuts.mjs";
import { renderThumbnails, thumbnailBriefs } from "./thumbnails.mjs";

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

/**
 * The number a counter card runs up to, with the words around it; null when
 * there is no whole number to count (decimals and ranges stay static).
 * @param {string} text
 */
export function counterParts(text) {
  const m = /^([^\d]*?)(\d{1,3}(?:,\d{3})+|\d+)(?![\d.]\d)(.*)$/s.exec(text);
  if (!m || /^\s*[–-]\s*\d/.test(m[3])) return null;
  const value = Number(m[2].replace(/,/g, ""));
  if (!Number.isSafeInteger(value) || value < 2) return null;
  if (!m[2].includes(",") && value >= 1500 && value <= 2100) return null; // a year, not a quantity
  return { before: m[1].replace(/%/g, "%%"), value, after: m[3].split("\n")[0].replace(/%/g, "%%").slice(0, 40) };
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

  // The house look: one gentle grade and light grain on every picture, so clips from many sources read as one film.
  const LOOK = "eq=contrast=1.06:saturation=0.92:gamma=0.98,noise=alls=5:allf=t";
  const CARD_BG = (/** @type {number} */ frames) => `vignette=PI/4,noise=alls=7:allf=t,fade=t=in:st=0:d=${Math.min(0.25, frames / t.fps / 4).toFixed(3)}`;
  const mono = FONT_CANDIDATES.map((f) => f.replace("DejaVuSans-Bold", "DejaVuSansMono")).find((f) => existsSync(f) && /Mono/.test(f)) ?? font;
  const escPath = (/** @type {string} */ p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  /**
   * A drawtext filter reading its words from a file (no escaping of the text itself), fading in.
   * @param {string} words @param {string} key @param {string} style
   */
  const text = (words, key, style) => {
    const file = join(dirs.cards, `${hash({ words, key })}.txt`);
    writeFileSync(file, words);
    return `drawtext=textfile='${escPath(file)}':${style}:alpha='min(1,t/0.35)'`;
  };

  // 1. Picture: one cached segment per shot, rendered in parallel.
  /** @type {string[]} */
  const segments = new Array(t.video.length);
  await pool(t.video, limit, async (v, i) => {
    const key = hash({ v: 2, in: v.sourceIn ?? 0, counter: Boolean(v.counter), type: v.type, url: v.url, text: v.text, title: v.title, chip: v.chip, motion: v.motion, frames: v.frames, w: t.width, h: t.height, fps: t.fps, font });
    const file = join(dirs.segments, `${String(i).padStart(5, "0")}-${key}.mp4`);
    segments[i] = file;
    if (existsSync(file)) { stats.segmentsCached += 1; return; }
    /** @type {string[]} */
    let input = [];
    /** @type {string[]} */
    const chain = [];
    let type = v.type;
    if (type === "clip" && v.url) {
      try {
        input = [...(v.sourceIn ? ["-ss", String(v.sourceIn)] : []), "-stream_loop", "-1", "-i", await fetchClip(v.url)];
        chain.push(frame);
        if (v.motion === "push") chain.push(`zoompan=z='1+0.06*on/${v.frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${t.width}x${t.height}:fps=${t.fps}`);
        chain.push(LOOK);
      } catch (error) {
        stats.clipsFailed += 1;
        warnings.push(`${v.id}: clip could not be downloaded (${error instanceof Error ? error.message : error}); a text card stands in.`);
        type = "card";
      }
    }
    const H = t.height;
    if (type !== "clip" || !input.length) {
      input = color(type === "black" ? "black" : "0x0b110e");
      if (type === "card") {
        chain.push(CARD_BG(v.frames));
        const cardStyle = `fontfile='${escPath(font ?? "")}':fontcolor=0xe4ede7:fontsize=${Math.round(H * 0.065)}:line_spacing=${Math.round(H * 0.02)}:x=(w-text_w)/2:y=(h-text_h)/2`;
        const count = v.counter ? counterParts(v.text) : null;
        if (v.text && font && count) {
          // The number runs up for the first part of the shot, then the text settles exactly as written.
          const runFor = Math.min(1.2, (v.frames / t.fps) * 0.6).toFixed(2);
          chain.push(text(`${count.before}%{eif:min(${count.value},${count.value}*t/${runFor}):d}${count.after}`, "count", `${cardStyle}:expansion=normal:enable='lt(t,${runFor})'`));
          chain.push(text(wrap(v.text, 26), "card", `${cardStyle}:enable='gte(t,${runFor})'`));
        } else if (v.text && font) chain.push(text(wrap(v.text, 26), "card", cardStyle));
      }
    }
    // A title over the scene's first clip, as a lower third; the source chip with the scene's first shot.
    if (type === "clip" && v.title && font) chain.push(text(wrap(v.title, 34), "title", `fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.052)}:line_spacing=${Math.round(H * 0.012)}:box=1:boxcolor=black@0.45:boxborderw=${Math.round(H * 0.018)}:x=w*0.06:y=h*0.72`));
    if (v.chip && type !== "black" && mono) chain.push(text(v.chip, "chip", `fontfile='${escPath(mono)}':fontcolor=0xdbe7df:fontsize=${Math.max(10, Math.round(H * 0.026))}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.01)}:x=w*0.06:y=h*0.9`));
    await run(ffmpeg, ["-v", "error", "-y", ...input, "-frames:v", String(v.frames), "-vf", chain.length ? chain.join(",") : "null", "-threads", "2", ...enc, file + ".part.mp4"]);
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

/**
 * One text file of a run (s7.md ...), from a folder or the film API; null when missing.
 * @param {{ dir?: string, api?: string, id?: string }} from @param {string} name
 */
export async function loadRunText(from, name) {
  if (from.dir) { const f = join(from.dir, name); return existsSync(f) ? readFileSync(f, "utf8") : null; }
  const res = await fetch(`${from.api}/api/films/${from.id}/files/${name}`);
  return res.ok ? res.text() : null;
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
  const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
  const chapters = await loadRunFiles(from);
  const voice = voiceFolder(args.voice);
  // Captions follow the recorded voice, not the scene slot.
  /** @type {Record<string, { durationSeconds: number }>} */
  const spoken = {};
  for (const [scene, file] of Object.entries(voice)) spoken[scene] = { durationSeconds: await mediaDuration(file) };
  const timeline = buildTimeline({ chapters, voice: spoken, width: Number(args.width ?? 1920), height: Number(args.height ?? 1080), fps: Number(args.fps ?? 30) });
  const workDir = args.work ?? ".render";
  const report = await renderFilm({ timeline, voice, music: musicFolder(args.music), workDir, outFile: args.out, fontFile: args.font, log: (l) => console.log(l) });
  // The three A/B thumbnails from the S7 briefs, next to the film.
  const s7 = await loadRunText(from, "s7.md");
  if (s7) {
    const clipsDir = join(workDir, "clips");
    mkdirSync(clipsDir, { recursive: true });
    const font = args.font ?? FONT_CANDIDATES.find((f) => existsSync(f));
    const base = args.out.replace(/\.mp4$/i, "");
    const thumbs = await renderThumbnails({ briefs: thumbnailBriefs(s7), timeline, fetchClip: (url) => downloadClip(url, clipsDir), outBase: base, font });
    console.log(`thumbnails: ${thumbs.map((t) => t.id).join(", ")}`);
    // The Shorts and the Facebook cut, vertical, with their hooks and burned-in captions.
    const cuts = await renderCuts({ film: args.out, briefs: cutBriefs(s7).filter((b) => b.end <= timeline.durationSeconds), captions: timeline.captions, outBase: base, font });
    console.log(`cuts: ${cuts.map((c) => c.id).join(", ")}`);
    writeFileSync(base + ".report.json", JSON.stringify({ ...report, thumbnails: thumbs.map((t) => ({ id: t.id, file: basename(t.file), frameFrom: t.frameFrom, bytes: t.bytes })), cuts: cuts.map((c) => ({ id: c.id, file: basename(c.file), seconds: c.seconds, size: `${c.width}x${c.height}` })) }, null, 1));
  }
  console.log(JSON.stringify({ ...report, licences: report.licences.length, warnings: report.warnings.length }, null, 1));
}
