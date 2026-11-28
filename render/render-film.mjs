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
 *   chunked: --part 3/8 renders the picture of part 3 of 8; --join p1.mp4,...,p8.mp4 joins them and mixes the sound once
 *   options: --voice <SC0001.mp3 ...> --music <M01.mp3 ...> --sfx <SND-FX-01.mp3 ...> --width 1920 --height 1080 --fps 30 --work .render --font /path/font.ttf
 */
import { mapSvg, routeSvgs } from "./maps.mjs";
import { synthSounds } from "./sfx-synth.mjs";
import { graphicFor } from "./graphics/from-shot.mjs";
import { renderGraphicFile, loadPlaywright } from "./graphics/render-graphic.mjs";
import { depthMaps, depthMoveFor, renderDepthShot } from "./depth/depth.mjs";

/** Levels of the synthesised edit sounds in the effects mix. */
const AUTO_GAIN = { "AUTO-WHOOSH": 0.32, "AUTO-IMPACT": 0.42, "AUTO-BOOM": 0.45, "AUTO-RISER": 0.3, "AUTO-CLICK": 0.22, "AUTO-GLITCH": 0.28 };
/** Where each designed sound sits between the speakers (left, right gains): placed, never all in the centre. */
const SFX_PAN = { "AUTO-WHOOSH": [0.9, 0.66], "AUTO-CLICK": [0.62, 0.9], "AUTO-GLITCH": [0.5, 0.92], "AUTO-IMPACT": [0.8, 0.8], "AUTO-BOOM": [1, 1], "AUTO-RISER": [0.78, 0.78] };
import { curtainWindows, deepestDuckDb, gainPlan, musicGainExpression, quietExpression, scoreReport, voiceWindows } from "./mix.mjs";
import { critique, designedMoments, measureFilm, measurePicture } from "./critic.mjs";
import { measureTaste, prepareStill } from "./picture-taste.mjs";
import { attachMoments, momentSounds, planMoments } from "../engine/src/voice-moments.mjs";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lookFor } from "../engine/src/formats.mjs";
import { breathWindows, buildTimeline, MAX_VOICE_TEMPO, toSrt } from "../engine/src/timeline.mjs";
import { easeExpr, moveFilter, profileFor } from "../engine/src/motion.mjs";
import { parseSceneLines } from "../engine/src/scene-lines.mjs";
import { cutBriefs, renderCuts } from "./cuts.mjs";
import { renderThumbnails, thumbnailBriefs } from "./thumbnails.mjs";

const SAMPLE_RATE = 48000;
const MAX_TEMPO = MAX_VOICE_TEMPO;
// The house faces travel with the film (render/assets/fonts, both SIL OFL): Fraunces for display type and
// Inter for text, so a card looks the same on a runner with no system fonts as it does on the owner's
// computer. A missing system font is only ever a last resort now; before, a render machine without
// fonts drew its cards in the system's own face or not at all.
const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "assets", "fonts");
const SERIF_CANDIDATES = [
  join(FONT_DIR, "Fraunces-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
  "C:\\Windows\\Fonts\\georgiab.ttf",
];
const FONT_CANDIDATES = [
  join(FONT_DIR, "Inter-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "C:\\Windows\\Fonts\\arialbd.ttf",
];
const MONO_CANDIDATES = [
  join(FONT_DIR, "JetBrainsMono-Bold.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
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

/**
 * Measure a finished master instead of assuming it: integrated loudness and
 * true peak (EBU R128), stretches of black picture of 1.5 s or more
 * (deliberate dips are shorter; a card with text is never "black") and
 * stretches of frozen picture of 2 s or more (a still that pretends to move).
 * @param {string} file @param {string} [ffmpeg]
 * @returns {Promise<{ integratedLufs: number | null, truePeakDbtp: number | null, loudnessRangeLu: number | null, black: { start: number, end: number, duration: number }[], freezes: { start: number, end: number }[] }>}
 */
export function measureMaster(file, ffmpeg = "ffmpeg") {
  return new Promise((ok, fail) => {
    const p = spawn(ffmpeg, ["-nostats", "-hide_banner", "-i", file, "-filter_complex", "[0:a]ebur128=peak=true:framelog=quiet[a];[0:v]scale=160:-2,blackdetect=d=1.5:pix_th=0.05:pic_th=0.999,freezedetect=n=-60dB:d=2[v]", "-map", "[v]", "-map", "[a]", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    /** @type {string[]} */
    const kept = [];
    let rest = "";
    p.stderr.on("data", (d) => {
      const lines = (rest + d).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (/black_start|freeze_start|freeze_end|^\s+(I|Peak|LRA):/.test(l)) kept.push(l);
    });
    p.on("error", fail);
    p.on("close", (code) => {
      if (rest && /black_start|freeze_start|freeze_end|^\s+(I|Peak|LRA):/.test(rest)) kept.push(rest);
      if (code !== 0) { fail(new Error(`${ffmpeg} exited ${code} while measuring the master`)); return; }
      const last = (/** @type {RegExp} */ re) => { const hits = kept.map((l) => re.exec(l)).filter(Boolean); const v = hits.length ? Number(/** @type {RegExpExecArray} */ (hits[hits.length - 1])[1]) : NaN; return Number.isFinite(v) ? v : null; };
      const black = kept.map((l) => /black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/.exec(l)).filter(Boolean).map((m) => ({ start: Number(/** @type {RegExpExecArray} */ (m)[1]), end: Number(/** @type {RegExpExecArray} */ (m)[2]), duration: Number(/** @type {RegExpExecArray} */ (m)[3]) }));
      const freezeStarts = kept.map((l) => /freeze_start:\s*([\d.]+)/.exec(l)).filter(Boolean).map((m) => Number(/** @type {RegExpExecArray} */ (m)[1]));
      const freezeEnds = kept.map((l) => /freeze_end:\s*([\d.]+)/.exec(l)).filter(Boolean).map((m) => Number(/** @type {RegExpExecArray} */ (m)[1]));
      const freezes = freezeStarts.map((start, i) => ({ start, end: freezeEnds[i] ?? start }));
      ok({ integratedLufs: last(/^\s+I:\s+(-?[\d.]+) LUFS/), truePeakDbtp: last(/^\s+Peak:\s+(-?[\d.]+) dBFS/), loudnessRangeLu: last(/^\s+LRA:\s+(-?[\d.]+) LU/), black, freezes });
    });
  });
}

/** @param {string} file @param {string} [ffprobe] */
export async function mediaDuration(file, ffprobe = "ffprobe") {
  const out = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]);
  return Number(out.trim());
}

/**
 * A picture's own shape (width / height), read before it is placed. A photo
 * whose shape is already the frame's should fill the frame; one that is very
 * tall or very wide needs a plate behind it.
 * @param {string} file @param {string} [ffprobe]
 */
export async function pictureAspect(file, ffprobe = "ffprobe") {
  try {
    const out = await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", file]);
    const [w, h] = out.trim().split("x").map(Number);
    return w > 0 && h > 0 ? w / h : null;
  } catch {
    return null;
  }
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
  // The counter's text is expanded by drawtext (its number is %{eif:...}), where a backslash makes the next character literal.
  const lit = (/** @type {string} */ s) => s.replace(/[\\%]/g, "\\$&");
  return { before: lit(m[1]), value, after: lit(m[3].split("\n")[0].slice(0, 40)) };
}

/** @param {unknown} v */
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/**
 * Wrap card text to lines of at most n characters, balanced: the narrowest width that needs no
 * more lines than the greedy wrap, so no line ends with one lonely word ("his mother leased / it"
 * becomes "his mother / leased it"). Text that needs more than four lines is never cut: the width
 * grows until it fits in four.
 * @param {string} text @param {number} n
 */
export function wrap(text, n) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const greedy = (/** @type {number} */ width) => {
    const lines = [];
    let line = "";
    for (const w of words) {
      if (line && (line + " " + w).length > width) { lines.push(line); line = w; } else line = line ? line + " " + w : w;
    }
    if (line) lines.push(line);
    return lines;
  };
  let width = n;
  while (greedy(width).length > 4) width += 2;
  let best = greedy(width);
  const longest = Math.max(...words.map((w) => w.length));
  for (let w = width - 1; w >= longest; w -= 1) {
    const l = greedy(w);
    if (l.length > best.length) break;
    best = l;
  }
  return best.join("\n");
}

/**
 * Run a command and return its stdout as bytes (a raw frame to measure).
 * @param {string} bin @param {string[]} args
 * @returns {Promise<Buffer>}
 */
function runBytes(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const out = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(`${bin} exited ${code}: ${err}`))));
  });
}

/** Ease out (cubic): fast start, soft landing, as a motion designer keys a grow. @param {number} x */
const easeOut = (x) => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

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
  // AI scenes and other local clips are used where they are.
  if (!/^https?:\/\//i.test(url)) {
    const local = url.startsWith("file://") ? fileURLToPath(url) : url;
    if (existsSync(local)) return local;
    throw new Error(`Local clip not found: ${local}`);
  }
  // Pictures keep their extension, so ffmpeg reads them as images.
  const ext = /\.(jpe?g|png|webp|tiff?)(?:$|[?#])/i.exec(new URL(url).pathname)?.[1]?.toLowerCase() ?? "mp4";
  const file = join(dir, hash(url) + "." + ext);
  if (existsSync(file)) return file;
  return politely(new URL(url).host, async () => {
    if (existsSync(file)) return file;
    let lastError;
    for (let attempt = 0; attempt < DOWNLOAD_ATTEMPTS; attempt += 1) {
      try {
        const res = await fetch(url, { redirect: "follow", headers: { "user-agent": DOWNLOAD_UA }, signal: AbortSignal.timeout(180_000) });
        if (!res.ok) {
          const err = /** @type {Error & { wait?: number }} */ (new Error(`HTTP ${res.status} for ${url}`));
          // A busy archive (429, 503) says how long to wait; otherwise wait longer each time.
          if (res.status === 429 || res.status === 503) err.wait = retryAfterSeconds(res.headers.get("retry-after")) ?? Math.min(120, 5 * 2 ** attempt);
          else if (res.status === 404 || res.status === 410) { lastError = err; break; }
          throw err;
        }
        // An archive master of several GB (seen: 3.6 GB) takes many minutes and cannot be held: a text card stands in at once.
        const bytes = Number(res.headers.get("content-length"));
        if (bytes > MAX_CLIP_BYTES) { await res.body?.cancel(); lastError = new Error(`the file is ${Math.round(bytes / 1e6)} MB, over the ${MAX_CLIP_BYTES / 1e6} MB limit`); break; }
        writeFileSync(file + ".part", Buffer.from(await res.arrayBuffer()));
        renameSync(file + ".part", file);
        return file;
      } catch (error) {
        lastError = error;
        const wait = /** @type {any} */ (error)?.wait ?? 2 ** attempt;
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
    }
    throw lastError;
  });
}

/** Archives ask for a User-Agent that names the tool (Wikimedia answers 429 to anonymous bulk downloads). */
const DOWNLOAD_UA = "ZuponaStudio/1.0 (documentary renderer; https://github.com/sayedmuntasim3-cmd/ai.x.com)";
const DOWNLOAD_ATTEMPTS = 7;
/** Larger clips are skipped (a text card stands in): one shot never needs more. */
const MAX_CLIP_BYTES = 400e6;
/** Hosts that throttle bulk downloads get one download at a time, with a short gap. */
const POLITE_HOSTS = /(^|\.)(wikimedia\.org|wikipedia\.org|loc\.gov|si\.edu|artic\.edu|archive\.org)$/i;
const POLITE_GAP_MS = 400;
/** @type {Map<string, Promise<unknown>>} */
const hostQueues = new Map();

/**
 * Run fn for host; for a throttling archive, one at a time per host.
 * @template T @param {string} host @param {() => Promise<T>} fn @returns {Promise<T>}
 */
export function politely(host, fn) {
  if (!POLITE_HOSTS.test(host)) return fn();
  const before = hostQueues.get(host) ?? Promise.resolve();
  const run = before.then(fn, fn);
  hostQueues.set(host, run.then(() => new Promise((r) => setTimeout(r, POLITE_GAP_MS)), () => new Promise((r) => setTimeout(r, POLITE_GAP_MS))));
  return run;
}

/** Seconds from a Retry-After header (a number of seconds or an HTTP date), capped at 5 minutes. @param {string | null} v */
export function retryAfterSeconds(v, now = Date.now()) {
  if (!v) return null;
  const n = Number(v);
  const s = Number.isFinite(n) ? n : (Date.parse(v) - now) / 1000;
  return Number.isFinite(s) && s >= 0 ? Math.min(300, Math.ceil(s)) : null;
}

/**
 * @typedef {import("../engine/src/timeline.mjs").Timeline} Timeline
 * oneTrack: the voice system's path: one recording is the whole narration, laid from 0:00, never sped up,
 *   slowed, cut or re-ordered (the timeline was built on its own word times); per-scene voice is ignored.
 * @typedef {{ timeline: Timeline, workDir: string, outFile: string, oneTrack?: { file: string }, voice?: Record<string, string>, music?: Record<string, string>, sfx?: Record<string, string>, fetchClip?: (url: string) => Promise<string>, fontFile?: string, concurrency?: number, ffmpeg?: string, ffprobe?: string, log?: (line: string) => void, part?: { index: number, count: number }, joinParts?: string[], edits?: any[], craft?: any }} RenderOptions
 *   edits: the Edit Director's plans (edit-C1.json ...), so the critic can say whether what the editor asked for reached the film.
 */

/**
 * The Edit Director's moves on one shot as one zoompan filter: each punch-in
 * pushes the frame 12% in over a tenth of a second and holds to the end of the
 * shot (two add up); a shake is 0.4 s of decaying jitter with a little zoom,
 * so the frame's edge never shows. "" when the shot has neither.
 * @param {{ frames: number, punchIns?: number[], shakes?: number[] }} v @param {number} width @param {number} height @param {number} fps
 */
export function editMotion(v, width, height, fps) {
  const { punches, shakes } = editFrames(v, fps);
  if (!punches.length && !shakes.length) return "";
  const ramp = Math.max(1, Math.round(fps * 0.1));
  const decay = Math.max(2, Math.round(fps * 0.4));
  const punch = punches.map((p) => `clip((on-${p})/${ramp},0,1)`).join("+") || "0";
  const shake = shakes.map((s) => `clip(1-(on-${s})/${decay},0,1)*gte(on,${s})`).join("+") || "0";
  return `zoompan=z='1+0.12*(${punch})+0.05*(${shake})':x='iw/2-(iw/zoom/2)+iw*0.012*(${shake})*sin(on*1.9)':y='ih/2-(ih/zoom/2)+ih*0.012*(${shake})*cos(on*2.3)':d=1:s=${width}x${height}:fps=${fps}`;
}

/** The frames of a shot's punch-ins and shakes that fall inside it. @param {{ frames: number, punchIns?: number[], shakes?: number[] }} v @param {number} fps */
function editFrames(v, fps) {
  const at = (/** @type {number[] | undefined} */ list) => (list ?? []).map((s) => Math.round(s * fps)).filter((f) => f >= 0 && f < v.frames);
  return { punches: at(v.punchIns), shakes: at(v.shakes) };
}
/** @param {{ frames: number, punchIns?: number[], shakes?: number[] }} v @param {number} fps */
function editMotionCount(v, fps) {
  const f = editFrames(v, fps);
  return { punchIns: f.punches.length, shakes: f.shakes.length };
}

/** Where a focus zoom heads, as a share of the free width and height. */
const FOCUS = { left: [0, 0.5], right: [1, 0.5], top: [0.5, 0], bottom: [0.5, 1], center: [0.5, 0.5] };

/**
 * How a still photo moves: a focus zoom pushes 16% toward the part the Edit
 * Director names (the face, the document's line, the crowd on the left); a
 * print drifts in gently; otherwise push, pull and pan take turns.
 * @param {string | undefined} focus @param {boolean} print @param {number} i @param {number} n frames
 * @param {import("../engine/src/motion.mjs").Move} [move]
 */
export function stillMove(focus, print, i, n, move) {
  const f = focus ? FOCUS[/** @type {keyof typeof FOCUS} */ (focus)] : null;
  if (f) return `zoompan=z='1+${print ? 0.1 : 0.16}*${easeExpr("inOut", n)}':x='(iw-iw/zoom)*${f[0]}':y='(ih-ih/zoom)*${f[1]}'`;
  if (print) return `zoompan=z='1.02+0.05*${easeExpr("inOut", n)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`;
  // The move decided for the scene (engine/src/motion.mjs), eased; older timelines without one keep the rota.
  if (move) return moveFilter(move, n);
  const moves = [
    `zoompan=z='1+0.09*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `zoompan=z='1.09-0.09*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
    `zoompan=z='1.08':x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)'`,
  ];
  return moves[i % moves.length];
}

/**
 * A light leak into the scene: a warm glow sweeps across the frame and fades,
 * over its first 0.7 s (added light, like film exposed at the edge).
 * @param {number} seconds the shot's length
 */
export function lightLeak(seconds) {
  const d = Math.min(0.7, seconds / 3).toFixed(3);
  const glow = `exp(-(pow(X-W*(-0.3+1.6*T/${d}),2)+pow((Y-H*0.38)*1.3,2))/pow(W*0.38,2))*190*sin(PI*min(T,${d})/${d})`;
  return ["format=gbrp", `geq=r='min(255,r(X,Y)+${glow})':g='min(255,g(X,Y)+0.62*${glow})':b='min(255,b(X,Y)+0.22*${glow})':enable='lt(t,${d})'`, "format=yuv420p"];
}

/**
 * A glitch transition drawn in the shot itself: three short bursts of torn
 * colour channels (rgbashift) under digital noise, over its first 0.3 s.
 * @param {number} seconds the shot's length @param {number} height
 */
export function glitchIn(seconds, height) {
  const d = Math.min(0.3, seconds / 3);
  const s = Math.max(2, Math.round(height * 0.012));
  const a = (d / 3).toFixed(3);
  const b = ((2 * d) / 3).toFixed(3);
  const e = d.toFixed(3);
  return [
    `rgbashift=rh=-${s}:bh=${s}:enable='lt(t,${a})'`,
    `rgbashift=rh=${s}:gv=${Math.ceil(s / 2)}:bh=-${s}:enable='between(t,${a},${b})'`,
    `rgbashift=rh=-${2 * s}:bv=${s}:enable='between(t,${b},${e})'`,
    `noise=alls=48:allf=t:enable='lt(t,${e})'`,
  ];
}

/** The transitions drawn from the previous shot's last frame (step 1b). */
const XFADE = Object.freeze({ whip: ["slideleft", 0.25], slide: ["smoothleft", 0.4], zoom: ["zoomin", 0.35] });

/**
 * One part of a chunked render: a run of whole shots, the parts about equal in frames. Parts meet on shot
 * boundaries, so joining their pictures with concat (-c copy) gives the same stream as one render.
 * @param {{ frames: number }[]} video @param {number} index (0-based) @param {number} count
 * @returns {{ start: number, end: number, frames: number }}
 */
export function partRange(video, index, count) {
  if (!Number.isInteger(count) || count < 1 || !Number.isInteger(index) || index < 0 || index >= count) throw new Error(`Part ${index + 1}/${count} is not a valid part.`);
  const total = video.reduce((n, v) => n + v.frames, 0);
  // Part k starts at the first shot whose start reaches k/count of the film.
  const startOf = (/** @type {number} */ k) => {
    if (k === 0) return 0;
    if (k >= count) return video.length;
    let frames = 0;
    for (let i = 0; i < video.length; i += 1) { if (frames >= (total * k) / count) return i; frames += video[i].frames; }
    return video.length;
  };
  const start = startOf(index);
  const end = Math.max(start, startOf(index + 1));
  return { start, end, frames: video.slice(start, end).reduce((n, v) => n + v.frames, 0) };
}

/**
 * The one gain step that brings a measured master to -14 LUFS, or null when it is within 0.5 LU (or unmeasured).
 * A limiter is added only when the gain would lift the true peak above -1.2 dBTP.
 * @param {{ integratedLufs: number | null, truePeakDbtp: number | null }} master
 * @returns {{ gain: number, af: string } | null}
 */
export function loudnessFix(master) {
  if (master.integratedLufs === null || !Number.isFinite(master.integratedLufs) || Math.abs(master.integratedLufs + 14) <= 0.5) return null;
  const gain = Math.round((-14 - master.integratedLufs) * 100) / 100;
  const peak = (master.truePeakDbtp ?? -99) + gain;
  return { gain, af: peak > -1.2 ? `volume=${gain}dB,alimiter=limit=${Math.pow(10, -1.5 / 20).toFixed(4)}:level=disabled` : `volume=${gain}dB` };
}

/**
 * Render the timeline. Returns what was rendered and every warning.
 * With `part`, only that part's picture is rendered to outFile (no sound): a chunked render's job.
 * With `joinParts`, the parts' pictures are joined (no shot rendered) and the sound is mixed once over the
 * whole film, so loudness is measured and set on the whole, exactly as in one render.
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
  const stats = { segmentsRendered: 0, segmentsCached: 0, audioRendered: 0, clipsFailed: 0, transitions: 0, designedShots: 0, depthShots: 0 };
  // A card is a designed graphic (M4), drawn by a real browser. When that browser is missing the render
  // used to fall back to the plain ffmpeg card without saying so, which is how a whole film came out as
  // text on a dark screen with no motion design at all. Say it in the report, and stop when asked.
  if (o.graphics !== false && !loadPlaywright()) {
    const designed = t.video.filter((v) => graphicFor(v, { counterParts })).length;
    if (designed) {
      const why = `${designed} of ${t.video.length} shots are designed graphics, but Playwright is not installed, so they render as plain text cards: run "npm ci && npx playwright install --with-deps chromium".`;
      if (o.requireGraphics) throw new Error(why);
      warnings.push(why);
    }
  }
  const fetchClip = o.fetchClip ?? ((url) => downloadClip(url, dirs.clips));
  const limit = o.concurrency ?? Math.max(1, cpus().length - 1);
  // Quality-led encoding with a ceiling: about 6 Mbit/s at 1080p30 (scaled by frame size and rate),
  // so a 45-minute film stays near 2 GB at worst and far below it for calm footage.
  const ceiling = Math.max(400, Math.round((6000 * t.width * t.height * t.fps) / (1920 * 1080 * 30)));
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", `${ceiling}k`, "-bufsize", `${ceiling * 2}k`, "-pix_fmt", "yuv420p", "-r", String(t.fps), "-video_track_timescale", "90000", "-an"];
  const frame = `scale=${t.width}:${t.height}:force_original_aspect_ratio=increase,crop=${t.width}:${t.height},fps=${t.fps},setsar=1`;
  const color = (/** @type {string} */ c) => ["-f", "lavfi", "-i", `color=c=${c}:s=${t.width}x${t.height}:r=${t.fps}`];

  // The house look: one gentle grade on every picture, so clips from many sources read as one film.
  // One gentle grade on every picture so old film and new scans sit together (owner's note on film e0b87efb): a slight contrast
  // and saturation pull, a small black-level lift (never crushed) and a very light FIXED grain (the same pattern every frame,
  // so it compresses: random grain on every frame made a 45-minute film grow past 1.5 GB at 360p).
  // Per format: documentary (gentle), cinematic (teal shadows, warm highlights; 2.39:1 bars), archive (faded and warm).
  const LOOKS = {
    documentary: "eq=contrast=1.05:saturation=0.9:gamma=0.98,curves=all='0/0.012 1/0.99',noise=alls=3:allf=u",
    cinematic: "eq=contrast=1.12:saturation=1.06:gamma=0.97,colorbalance=rs=-0.05:gs=-0.01:bs=0.06:rh=0.07:gh=0.02:bh=-0.06,vignette=PI/5",
    archive: "eq=contrast=1.08:saturation=0.7:gamma=0.97,colorbalance=rh=0.06:gh=0.03:bh=-0.05,vignette=PI/4.5",
  };
  const filmLook = t.look ?? "documentary";
  const LOOK = LOOKS[filmLook] ?? LOOKS.documentary;
  // Cinematic films are framed 2.39:1 with black bars, on every shot, so the frame never jumps.
  const bar = filmLook === "cinematic" ? Math.max(0, Math.round((t.height - t.width / 2.39) / 2)) : 0;
  const BARS = bar ? `drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill,drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill` : "";
  const CARD_BG = (/** @type {number} */ frames) => `vignette=PI/4,fade=t=in:st=0:d=${Math.min(0.25, frames / t.fps / 4).toFixed(3)}`;
  const mono = MONO_CANDIDATES.find((f) => existsSync(f)) ?? font;
  const escPath = (/** @type {string} */ p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  /**
   * A drawtext filter reading its words from a file (no escaping of the text itself), fading in.
   * @param {string} words @param {string} key @param {string} style
   */
  const writeText = (/** @type {string} */ words, /** @type {string} */ key) => {
    const file = join(dirs.cards, `${hash({ words, key })}.txt`);
    writeFileSync(file, words);
    return file;
  };
  const text = (words, key, style) => `drawtext=expansion=none:textfile='${escPath(writeText(words, key))}':${style}:alpha='min(1,t/0.35)'`;
  /** @type {Map<string, number>} */
  const measured = new Map();
  /**
   * The drawn width of one line in pixels, measured by drawing it once, so a
   * highlighter or an underline fits the words exactly.
   * @param {string} words @param {string} face @param {number} size
   */
  const measureText = async (words, face, size) => {
    const key = hash({ words, face, size });
    const known = measured.get(key);
    if (known !== undefined) return known;
    const w = Math.ceil((size * words.length * 0.9 + 40) / 2) * 2;
    const h = Math.ceil(size * 1.6 / 2) * 2;
    const raw = await runBytes(ffmpeg, ["-v", "error", "-f", "lavfi", "-i", `color=c=black:s=${w}x${h}`, "-vf", `drawtext=expansion=none:textfile='${escPath(writeText(words, "measure"))}':fontfile='${escPath(face)}':fontsize=${size}:fontcolor=white:x=10:y=${Math.round(size * 0.2)}`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"]);
    let min = w;
    let max = -1;
    for (let i = 0; i < raw.length; i += 1) if (raw[i] > 60) { const x = i % w; if (x < min) min = x; if (x > max) max = x; }
    const width = max >= min ? max - min + 1 : Math.round(size * words.length * 0.55);
    measured.set(key, width);
    return width;
  };
  /** Animated boxes are keyed frame by frame through sendcmd (drawbox has no time variable). @param {string[]} lines */
  const commands = (lines) => {
    const file = join(dirs.cards, `${hash(lines)}.cmd`);
    writeFileSync(file, lines.join("\n") + "\n");
    return `sendcmd=f='${escPath(file)}'`;
  };
  const serif = SERIF_CANDIDATES.find((f) => existsSync(f)) ?? font;
  // Kinetic type rises 4% of the frame while it fades in (FX-KINETIC); otherwise it stays put.
  const rise = (/** @type {boolean | undefined} */ kinetic, /** @type {string} */ y) => (kinetic ? `y='${y}+h*0.04*(1-min(1,t/0.45))'` : `y=${y}`);

  // 1. Picture: one cached segment per shot, rendered in parallel.
  /** @type {string[]} */
  const segments = new Array(t.video.length);
  const range = o.part ? partRange(t.video, o.part.index, o.part.count) : { start: 0, end: t.video.length, frames: 0 };
  // A part's first shot that opens with a move from the shot before needs that shot too (its last frame), and
  // that one the shot before it when it also opens with a move: the chain is redone so the frames are the same.
  const needsBefore = (/** @type {number} */ i) => i > 0 && i < t.video.length && Boolean(t.video[i].transition && t.video[i].transition !== "flash" && XFADE[/** @type {keyof typeof XFADE} */ (t.video[i].transition)]) && t.video[i - 1].type !== "black";
  let first = range.start;
  while (first > 0 && needsBefore(first)) first -= 1;
  // M4: designed graphics (Playwright) and the depth camera (Depth Anything V2 small); either one switches
  // itself off with one warning when its tools are missing, and the shot keeps its ffmpeg drawing.
  const pw = o.graphics === false ? null : loadPlaywright();
  let graphicsOn = Boolean(pw);
  let depthOn = o.depth !== false;
  /** @type {Promise<any> | null} */
  let browser = null;
  try {
  await pool(o.joinParts ? [] : t.video, limit, async (v, i) => {
    if (i < first || i >= range.end) return;
    // v: bump whenever the way a shot is drawn changes, so cached shots from an older look are redone.
    // The Edit Director's moves join the key only when a shot has them, so every other cached shot stays valid.
    const moves = { ...(v.punchIns?.length || v.shakes?.length ? { punchIns: v.punchIns ?? [], shakes: v.shakes ?? [] } : {}), ...(v.fileHash ? { file: v.fileHash } : {}), ...(v.chart ? { chart: v.chart } : {}), ...(v.highlight ? { highlight: v.highlight } : {}), ...(v.still && v.frame ? { frame: v.frame } : {}), ...(v.still && v.focus ? { focus: v.focus } : {}), ...(v.moment ? { moment: [v.moment.template, v.moment.data, Math.round((v.moment.at - v.start) * 100), Math.round(v.moment.seconds * 100), 2] } : {}), ...(v.still && v.move ? { move: [v.move.kind, v.move.amount, v.move.dir, v.move.ease, v.move.why.startsWith("reduced")] } : {}) };
    const graphic = graphicsOn && v.type === "card" ? graphicFor(v, { counterParts }) : null;
    const designed = graphic && !graphic.alpha ? graphic : null;
    // The look of an M4 shot joins the key only for shots it draws, so every other cached shot stays valid.
    const m4 = { ...(designed ? { graphic: [designed.template, designed.data, 1] } : {}), ...(depthOn && v.still && v.frame !== "print" && v.shotType !== "photo-designed" ? { depth: 1 } : {}) };
    const key = hash({ v: 14, ...moves, ...m4, map: v.map ?? null, transition: v.transition === "flash" || v.transition === "glitch" || v.transition === "leak" ? v.transition : null, still: Boolean(v.still), look: filmLook, fadeIn: v.fadeIn ?? 0, fadeOut: v.fadeOut ?? 0, speed: v.speed ?? 1, chapterTitle: v.chapterTitle ?? "", split: v.split ?? null, style: v.style ?? "plain", kinetic: Boolean(v.kinetic), in: v.sourceIn ?? 0, counter: Boolean(v.counter), type: v.type, url: v.url, text: v.text, title: v.title, chip: v.chip, motion: v.motion, frames: v.frames, w: t.width, h: t.height, fps: t.fps, font });
    const file = join(dirs.segments, `${String(i).padStart(5, "0")}-${key}.mp4`);
    segments[i] = file;
    if (existsSync(file)) { stats.segmentsCached += 1; return; }
    /** @type {string[]} */
    let input = [];
    /** @type {string[]} */
    const chain = [];
    let type = v.type;
    // Two inputs (a parallax photo) need a filter graph instead of a simple filter chain.
    let complex = false;
    if (type === "clip" && v.url && v.still) {
      try {
        // A photograph: framed once over a blurred copy of itself (so a portrait or odd shape fills the frame),
        // then moved slowly (push in, pull out or pan, in turn) so it lives on screen like footage.
        const src = await fetchClip(v.url);
        const n = v.frames;
        const W = t.width;
        const H = t.height;
        const plateKey = hash({ still: v.url, w: W, h: H });
        // Full frame, always (owner's note on film e0b87efb: small pictures in black, in tilted white borders): the picture's real
        // content box is cut out (no black, no white border, no jagged mosaic edge), then framed by its shape: a camera's crop
        // toward the subject, a slow pan across a panorama or down a portrait; a blurred copy only for a picture too small to
        // fill the frame. No print frame: an archive picture is never a polaroid.
        const shot = await prepareStill({ src, dir: dirs.cards, key: plateKey, width: W, height: H, frames: n, index: i, ffmpeg });
        const counts = /** @type {any} */ (stats);
        counts.stillFrames = { ...(counts.stillFrames ?? {}), [shot.mode]: (counts.stillFrames?.[shot.mode] ?? 0) + 1 };
        // A photograph as a real camera move through its depth (dolly, orbit or rack focus). "photo-designed"
        // and prints keep the designed photo-on-a-desk below; a flat picture or a missing tool falls through too.
        let deep = false;
        if (m4.depth && shot.mode === "cover" && !shot.trimmed) {
          try {
            const maps = await depthMaps({ src, dir: join(dirs.cards, `${plateKey}-depth`), width: W, height: H });
            if (maps) {
              const mv = depthMoveFor(v.move, i);
              const shot = join(dirs.cards, `${hash({ plateKey, mv, n, fps: t.fps, v: 1 })}-depth.mp4`);
              if (!existsSync(shot)) await renderDepthShot({ maps, move: mv, width: W, height: H, fps: t.fps, frames: n, out: shot + ".part.mp4", ffmpeg }).then(() => renameSync(shot + ".part.mp4", shot));
              input = ["-i", shot];
              chain.push("setsar=1", LOOK);
              deep = true;
              stats.depthShots += 1;
            }
          } catch (error) {
            depthOn = false;
            warnings.push(`depth camera off for this render (${error instanceof Error ? error.message.slice(0, 160) : error}); photos keep the still move.`);
          }
        }
        if (deep) {
          // drawn above
        } else {
          input = ["-loop", "1", "-framerate", String(t.fps), "-i", shot.plate];
          if (shot.filter) chain.push(shot.filter, "setsar=1", LOOK);
          else chain.push(`${stillMove(v.focus, false, i, n, v.move)}:d=1:s=${W}x${H}:fps=${t.fps}`, "setsar=1", LOOK);
        }
      } catch (error) {
        stats.clipsFailed += 1;
        warnings.push(`${v.id}: picture could not be downloaded (${error instanceof Error ? error.message : error}); a text card stands in.`);
        type = "card";
      }
    } else if (type === "clip" && v.url) {
      try {
        input = [...(v.sourceIn ? ["-ss", String(v.sourceIn)] : []), "-stream_loop", "-1", "-i", await fetchClip(v.url)];
        // Slow motion written in the script stretches the clip before it is framed.
        if (v.speed && v.speed < 1) chain.push(`setpts=PTS/${v.speed}`);
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
    let mapped = false;
    if (type === "card" && v.map?.to) {
      try {
        // A route: the line draws itself from the first place to the second, then the second name appears.
        const W = t.width;
        const key = hash({ route: v.map, w: W, h: H, v: 1 });
        const basePng = join(dirs.cards, `${key}-base.png`);
        const linePng = join(dirs.cards, `${key}-line.png`);
        const r = routeSvgs({ from: v.map, to: v.map.to, width: W, height: H });
        if (!existsSync(basePng) || !existsSync(linePng)) {
          writeFileSync(basePng.replace(/\.png$/, ".svg"), r.base);
          writeFileSync(linePng.replace(/\.png$/, ".svg"), r.line);
          await run(ffmpeg, ["-v", "error", "-y", "-i", basePng.replace(/\.png$/, ".svg"), "-frames:v", "1", basePng]);
          await run(ffmpeg, ["-v", "error", "-y", "-i", linePng.replace(/\.png$/, ".svg"), "-frames:v", "1", "-pix_fmt", "rgba", linePng]);
        }
        const [ax, ay] = r.a.map((n) => Math.round(n));
        const [bx, by] = r.b.map((n) => Math.round(n));
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = Math.max(1, dx * dx + dy * dy);
        const draw = Math.max(0.8, Math.min(2.4, (v.frames / t.fps) * 0.6)).toFixed(2);
        input = ["-loop", "1", "-framerate", String(t.fps), "-i", basePng, "-loop", "1", "-framerate", String(t.fps), "-i", linePng];
        complex = true;
        chain.push(`[1]format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*lte(((X-${ax})*${dx}+(Y-${ay})*${dy})/${len2},T/${draw})'[rl];[0]format=rgba[rb];[rb][rl]overlay=format=auto,format=yuv420p`, "setsar=1", LOOK);
        const label = (/** @type {string} */ words, /** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ from, /** @type {string} */ name) => (words && font ? `drawtext=expansion=none:textfile='${escPath(writeText(words.toUpperCase(), name))}':fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.048)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.012)}:x=${Math.min(W - Math.round(W * 0.25), x + Math.round(H * 0.04))}:y=${Math.max(Math.round(H * 0.04), y - Math.round(H * 0.09))}:alpha='min(1,max(0,(t-${from})/0.4))'` : "");
        chain.push(...[label(v.map.label, ax, ay, "0.15", "route-from"), label(v.map.to.label, bx, by, draw, "route-to")].filter(Boolean));
        mapped = true;
      } catch (error) {
        warnings.push(`${v.id}: the route map could not be drawn (${error instanceof Error ? error.message : error}); a text card stands in.`);
      }
    } else if (type === "card" && v.map) {
      try {
        // An animated map: the place's country lit, a pin at the centre, a slow push-in and the place's name.
        const png = join(dirs.cards, `${hash({ map: v.map, w: t.width, h: t.height, v: 1 })}.png`);
        if (!existsSync(png)) {
          const svg = png.replace(/\.png$/, ".svg");
          writeFileSync(svg, mapSvg({ lat: v.map.lat, lon: v.map.lon, width: t.width * 2, height: t.height * 2 }));
          await run(ffmpeg, ["-v", "error", "-y", "-i", svg, "-frames:v", "1", png]);
        }
        input = ["-loop", "1", "-framerate", String(t.fps), "-i", png];
        chain.push(`zoompan=z='1+0.14*on/${v.frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${t.width}x${t.height}:fps=${t.fps}`, "setsar=1", LOOK);
        if (v.map.label && font) chain.push(`drawtext=expansion=none:textfile='${escPath(writeText(v.map.label.toUpperCase(), "map-label"))}':fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.052)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.014)}:x=w/2+${Math.round(H * 0.06)}:y=h/2-${Math.round(H * 0.1)}:alpha='min(1,max(0,(t-0.35)/0.4))'`);
        mapped = true;
      } catch (error) {
        warnings.push(`${v.id}: the map could not be drawn (${error instanceof Error ? error.message : error}); a text card stands in.`);
      }
    }
    if (designed && type === "card" && !mapped) {
      try {
        const shot = join(dirs.cards, `${hash({ g: designed, n: v.frames, w: t.width, h: t.height, fps: t.fps, v: 1 })}-graphic.mp4`);
        if (!existsSync(shot)) {
          if (!browser) {
            browser = pw.chromium.launch();
            // A browser that cannot start (a missing system library, a broken install) is handled where it
            // is awaited: one fallback to the ffmpeg card, never an unhandled rejection that loses the film.
            browser.catch(() => {});
          }
          // A temp file of its own, checked, then renamed: a cut-off render never leaves a broken graphic behind.
          await renderGraphicFile({ template: designed.template, data: designed.data, width: t.width, height: t.height, fps: t.fps, frames: v.frames, file: shot, out: "", ffmpeg, ffprobe, browser: await browser });
        }
        input = ["-i", shot];
        chain.push("setsar=1");
        mapped = true;
        stats.designedShots += 1;
      } catch (error) {
        graphicsOn = false;
        warnings.push(`designed graphics off for this render (${error instanceof Error ? error.message.slice(0, 160) : error}); cards keep the ffmpeg drawing.`);
      }
    }
    if ((type !== "clip" || !input.length) && !mapped) {
      const paper = type === "card" && v.style === "paper";
      input = color(type === "black" ? "black" : paper ? "0xefe6d2" : "0x0b110e");
      if (type === "card") {
        chain.push(CARD_BG(v.frames));
        const cardStyle = `fontfile='${escPath((paper ? serif : font) ?? "")}':fontcolor=${paper ? "0x1d1a16" : "0xe4ede7"}:fontsize=${Math.round(H * 0.065)}:line_spacing=${Math.round(H * 0.02)}:x=(w-text_w)/2:${rise(v.kinetic, "(h-text_h)/2")}`;
        const count = v.counter ? counterParts(v.text) : null;
        if (v.split?.length && font) {
          // Side by side, neither emphasised: a heading on top, the panels in columns with thin dividers.
          const n = v.split.length;
          const ink = paper ? "0x1d1a16" : "0xe4ede7";
          const muted = paper ? "0x4a443c" : "0xb8c2bb";
          const face = escPath((paper ? serif : font) ?? "");
          if (v.text) chain.push(text(wrap(v.text, 30), "heading", `fontfile='${face}':fontcolor=${ink}:fontsize=${Math.round(H * 0.06)}:x=(w-text_w)/2:${rise(v.kinetic, "h*0.16")}`));
          for (let k = 1; k < n; k += 1) chain.push(`drawbox=x=iw*${(k / n).toFixed(4)}-1:y=ih*0.36:w=2:h=ih*0.46:color=${muted}@0.6:t=fill`);
          v.split.forEach((panel, k) => {
            const col = `w*${(k / n).toFixed(4)}+(w/${n}-text_w)/2`;
            chain.push(text(wrap(panel, n === 2 ? 18 : 12), `panel${k}`, `fontfile='${face}':text_align=C:fontcolor=${muted}:fontsize=${Math.round(H * (n === 2 ? 0.06 : 0.054))}:line_spacing=${Math.round(H * 0.015)}:x=${col}:${rise(v.kinetic, "h*0.59-text_h/2")}`));
          });
        } else if (v.chart && font) {
          // An animated bar chart: bars grow from the baseline one after another, eased, their values land on top.
          const W = t.width;
          const ink = paper ? "0x1d1a16" : "0xe4ede7";
          const muted = paper ? "0x4a443c" : "0xb8c2bb";
          const accent = paper ? "0x8c3b2a" : "0xe8b04a";
          const face = escPath((paper ? serif : font) ?? "");
          const bars = v.chart.bars;
          const max = Math.max(...bars.map((b) => b.value)) || 1;
          const left = W * 0.16;
          const slot = (W * 0.68) / bars.length;
          const bw = Math.round(slot * 0.56);
          // Inside the frame's safe area: under the cinematic bars, with room for a punch-in.
          const titleLines = v.text ? wrap(v.text, 34).split("\n").length : 0;
          const titleY = Math.round(Math.max(H * 0.12, bar + H * 0.05));
          const titleBottom = titleY + Math.round(titleLines * H * 0.07);
          const base = Math.round(Math.min(H * 0.8, H - bar - H * 0.15));
          const room = Math.round(Math.max(H * 0.18, Math.min(H * 0.44, base - titleBottom - H * 0.1)));
          const grow = Math.min(0.9, (v.frames / t.fps) * 0.3);
          const stagger = Math.min(0.15, (v.frames / t.fps) * 0.05);
          const steps = Math.max(2, Math.round(grow * t.fps));
          /** @type {string[]} */
          const cmds = [];
          /** @type {string[]} */
          const boxes = [];
          /** @type {string[]} */
          const labels = [];
          bars.forEach((b, k) => {
            const full = Math.max(2, Math.round((room * b.value) / max));
            const x = Math.round(left + slot * k + (slot - bw) / 2);
            const from = 0.25 + stagger * k;
            boxes.push(`drawbox@bar${k}=x=${x}:y=${base}:w=${bw}:h=1:color=${accent}:t=fill`);
            for (let f = 0; f <= steps; f += 1) {
              const hgt = Math.max(1, Math.round(full * easeOut(f / steps)));
              cmds.push(`${(from + f / t.fps).toFixed(3)} drawbox@bar${k} y ${base - hgt};`, `${(from + f / t.fps).toFixed(3)} drawbox@bar${k} h ${hgt};`);
            }
            const cx = x + bw / 2;
            labels.push(`drawtext=expansion=none:textfile='${escPath(writeText(b.label, `bar-label-${k}`))}':fontfile='${face}':fontcolor=${muted}:fontsize=${Math.round(H * 0.044)}:x=${Math.round(cx)}-text_w/2:y=${base + Math.round(H * 0.025)}:alpha='min(1,t/0.35)'`);
            labels.push(`drawtext=expansion=none:textfile='${escPath(writeText(b.text, `bar-value-${k}`))}':fontfile='${face}':fontcolor=${ink}:fontsize=${Math.round(H * 0.05)}:x=${Math.round(cx)}-text_w/2:y=${base - full - Math.round(H * 0.065)}:alpha='min(1,max(0,(t-${(from + grow * 0.8).toFixed(3)})/0.25))'`);
          });
          if (v.text) chain.push(text(wrap(v.text, 34), "chart-title", `fontfile='${face}':fontcolor=${ink}:fontsize=${Math.round(H * 0.055)}:x=(w-text_w)/2:${rise(v.kinetic, String(titleY))}`));
          chain.push(commands(cmds), ...boxes, `drawbox=x=${Math.round(left)}:y=${base}:w=${Math.round(W * 0.68)}:h=${Math.max(2, Math.round(H * 0.004))}:color=${muted}:t=fill`, ...labels);
        } else if (v.text && font && v.highlight) {
          // A highlighter sweeps the key words on a document (a marker band behind them); on a dark card an underline draws itself.
          const W = t.width;
          const face = (paper ? serif : font) ?? "";
          const size = Math.round(H * 0.065);
          const lineH = Math.round(size * 1.32);
          const lines = wrap(v.text, 26).split("\n");
          const norm = (/** @type {string} */ w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
          const whole = v.highlight.trim().toLowerCase() === v.text.trim().toLowerCase();
          const wanted = new Set(v.highlight.split(/\s+/).map(norm).filter((w) => w.length >= 2));
          const top = Math.round((H - lines.length * lineH) / 2);
          /** @type {string[]} */
          const cmds = [];
          /** @type {string[]} */
          const bands = [];
          let at = 0.45;
          const sweep = Math.min(0.55, (v.frames / t.fps) * 0.2);
          const steps = Math.max(2, Math.round(sweep * t.fps));
          for (const [k, line] of lines.entries()) {
            // Only the marked words: from the first to the last of them on this line, measured where they are drawn.
            const words = line.split(" ");
            const hits = words.map((w, i) => (whole || wanted.has(norm(w)) ? i : -1)).filter((i) => i >= 0);
            if (!hits.length) continue;
            const [i, j] = [hits[0], hits[hits.length - 1]];
            const y = top + k * lineH;
            const pad = Math.round(size * 0.18);
            const lineW = await measureText(line, face, size);
            const end = await measureText(words.slice(0, j + 1).join(" "), face, size);
            const span = await measureText(words.slice(i, j + 1).join(" "), face, size);
            const full = span + 2 * pad;
            const x0 = Math.round((W - lineW) / 2 + end - span - pad);
            const [y0, bh, c] = paper ? [y - Math.round(size * 0.12), Math.round(size * 1.24), "0xffd84a@0.72"] : [y + Math.round(size * 1.08), Math.max(3, Math.round(size * 0.09)), "0xe8b04a"];
            bands.push(`drawbox@hl${k}=x=-100:y=${y0}:w=1:h=${bh}:color=${c}:t=fill`);
            for (let f = 0; f <= steps; f += 1) {
              const when = (at + f / t.fps).toFixed(3);
              if (f === 0) cmds.push(`${when} drawbox@hl${k} x ${x0};`);
              cmds.push(`${when} drawbox@hl${k} w ${Math.max(1, Math.round(full * easeOut(f / steps)))};`);
            }
            at += sweep + 0.1;
          }
          if (bands.length) chain.push(commands(cmds), ...bands);
          lines.forEach((line, k) => chain.push(`drawtext=expansion=none:textfile='${escPath(writeText(line, `hl-line-${k}`))}':fontfile='${escPath(face)}':fontcolor=${paper ? "0x1d1a16" : "0xe4ede7"}:fontsize=${size}:x=(w-text_w)/2:${rise(v.kinetic, String(top + k * lineH))}:alpha='min(1,t/0.35)'`));
        } else if (v.text && font && count) {
          // The number runs up for the first part of the shot, then the text settles exactly as written.
          const runFor = Math.min(1.2, (v.frames / t.fps) * 0.6).toFixed(2);
          chain.push(text(`${count.before}%{eif:min(${count.value},${count.value}*t/${runFor}):d}${count.after}`, "count", `${cardStyle}:expansion=normal:enable='lt(t,${runFor})'`));
          chain.push(text(wrap(v.text, 26), "card", `${cardStyle}:enable='gte(t,${runFor})'`));
        } else if (v.text && font && v.kinetic && wrap(v.text, 26).includes("\n")) {
          // Kinetic type, line by line: each line rises in after the one before it.
          const lines = wrap(v.text, 26).split("\n");
          const size = Math.round(H * 0.065);
          const lineH = Math.round(size * 1.32);
          const step = Math.min(0.35, (v.frames / t.fps) * 0.5 / lines.length);
          lines.forEach((line, k) => {
            const at = (k * step).toFixed(3);
            const y = `(h-${lines.length * lineH})/2+${k * lineH}+h*0.04*(1-min(1,max(0,t-${at})/0.45))`;
            chain.push(`drawtext=expansion=none:textfile='${escPath(writeText(line, `kinetic-${k}`))}':fontfile='${escPath((paper ? serif : font) ?? "")}':fontcolor=${paper ? "0x1d1a16" : "0xe4ede7"}:fontsize=${size}:x=(w-text_w)/2:y='${y}':alpha='min(1,max(0,(t-${at})/0.35))'`);
          });
        } else if (v.text && font) chain.push(text(wrap(v.text, 26), "card", cardStyle));
      }
    }
    // The Edit Director's punch-ins and camera shakes move the picture (titles, chips and bars stay put).
    const motion = type === "black" ? "" : editMotion(v, t.width, t.height, t.fps);
    if (motion) chain.push(motion);
    // A title over the scene's first clip, as a lower third; the source chip with the scene's first shot.
    if (type === "clip" && v.title && font) chain.push(text(wrap(v.title, 34), "title", `fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.058)}:line_spacing=${Math.round(H * 0.012)}:box=1:boxcolor=black@0.45:boxborderw=${Math.round(H * 0.018)}:x=w*0.06:${rise(v.kinetic, "h*0.85-text_h")}`));
    if (BARS) chain.push(BARS);
    if (v.chip && type !== "black" && mono) chain.push(text(v.chip, "chip", `fontfile='${escPath(mono)}':fontcolor=0xdbe7df:fontsize=${Math.max(10, Math.round(H * 0.034))}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.01)}:x=w*0.06:y=h*0.9`));
    // A chapter opens with its number and title, top left, for about three seconds.
    if (v.chapterTitle && font && mono && type !== "black" && designed?.template !== "chapter") {
      const show = Math.min(3.2, (v.frames / t.fps) * 0.8);
      const fadeAlpha = `alpha='min(1,max(0,(t-0.3)/0.4))*min(1,max(0,(${show.toFixed(2)}-t)/0.5))'`;
      const [label, ...rest] = v.chapterTitle.split(" · ");
      const top = Math.max(bar, 0) + Math.round(H * 0.07);
      chain.push(`drawtext=expansion=none:textfile='${escPath(writeText(label.toUpperCase(), "chapter-label"))}':fontfile='${escPath(mono)}':fontcolor=0xdbe7df:fontsize=${Math.max(10, Math.round(H * 0.032))}:x=w*0.06:y=${top}:${fadeAlpha}`);
      chain.push(`drawtext=expansion=none:textfile='${escPath(writeText(wrap(rest.join(" · "), 30), "chapter-title"))}':fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.06)}:x=w*0.06:y=${top + Math.round(H * 0.05)}:shadowcolor=black@0.6:shadowx=2:shadowy=2:${fadeAlpha}`);
    }
    // Dips through black at chapter breaks and written dissolves: the shot fades out, the next fades in.
    const seconds = v.frames / t.fps;
    if (v.fadeIn) chain.push(`fade=t=in:st=0:d=${v.fadeIn.toFixed(3)}`);
    // A white flash into the scene: the first fifth of a second comes up from white.
    if (v.transition === "flash" && !v.fadeIn) chain.push(`fade=t=in:st=0:d=${Math.min(0.2, seconds / 4).toFixed(3)}:color=white`);
    // A glitch into the scene: colour channels torn apart and digital noise for its first few frames.
    if (v.transition === "glitch" && !v.fadeIn) chain.push(...glitchIn(seconds, t.height));
    if (v.transition === "leak" && !v.fadeIn) chain.push(...lightLeak(seconds));
    if (v.fadeOut) chain.push(`fade=t=out:st=${Math.max(0, seconds - v.fadeOut).toFixed(3)}:d=${v.fadeOut.toFixed(3)}`);
    const vf = chain.length ? chain.join(",") : "null";
    const encode = (/** @type {string} */ f) => run(ffmpeg, ["-v", "error", "-y", ...input, "-frames:v", String(v.frames), complex ? "-filter_complex" : "-vf", f, "-threads", "2", ...enc, file + ".part.mp4"]);
    // Centred lines (text_align) need ffmpeg 6.1+; older builds centre the block instead.
    try { await encode(vf); } catch (error) { if (!vf.includes("text_align")) throw error; await encode(vf.replaceAll(":text_align=C", "")); }
    // A designed moment (engine/src/voice-moments.mjs): its graphic is drawn with alpha by the browser and laid over the finished
    // picture at its own time. When it cannot be drawn the shot is kept plain, the moment leaves the film's record, and it says so.
    if (v.moment && type === "clip") {
      try {
        if (!graphicsOn || !pw) throw new Error("the graphics browser is off");
        const m = v.moment;
        const frames = Math.max(1, Math.round(m.seconds * t.fps));
        const mov = join(dirs.cards, `${hash({ g: [m.template, m.data], n: frames, w: t.width, h: t.height, fps: t.fps, a: 1, v: 1 })}-moment.mov`);
        if (!existsSync(mov)) {
          if (!browser) { browser = pw.chromium.launch(); browser.catch(() => {}); }
          await renderGraphicFile({ template: m.template, data: m.data, width: t.width, height: t.height, fps: t.fps, frames, alpha: true, file: mov, out: "", ffmpeg, ffprobe, browser: await browser });
        }
        const delay = Math.max(0, m.at - v.start).toFixed(3);
        const over = file + ".moment.mp4";
        await run(ffmpeg, ["-v", "error", "-y", "-i", file + ".part.mp4", "-i", mov, "-filter_complex", `[1:v]format=yuva444p10le,setpts=PTS-STARTPTS+${delay}/TB[m];[0:v]format=yuv420p[b];[b][m]overlay=eof_action=pass:format=auto,format=yuv420p[o]`, "-map", "[o]", "-frames:v", String(v.frames), "-threads", "2", ...enc, over]);
        renameSync(over, file + ".part.mp4");
        stats.momentsDrawn = (stats.momentsDrawn ?? 0) + 1;
      } catch (error) {
        warnings.push(`${v.id}: the ${v.moment.kind} moment could not be drawn (${error instanceof Error ? error.message.slice(0, 160) : error}); the picture stays plain.`);
        v.moment.failed = true;
        // Not kept under the moment's own name: a later run must try the overlay again, not reuse a plain picture.
        segments[i] = file.replace(/\.mp4$/, "-plain.mp4");
      }
    }
    renameSync(file + ".part.mp4", segments[i]);
    stats.segmentsRendered += 1;
    if ((stats.segmentsRendered + stats.segmentsCached) % 50 === 0) log(`picture: ${stats.segmentsRendered + stats.segmentsCached}/${t.video.length}`);
  });
  } finally {
  // On every path (a failed shot included) the browser is closed, so no Chromium outlives the render.
  // A browser that never started was already reported (designed graphics off); closing it must not throw again.
  // The close is bounded: a wedged browser is left to the process exit, never a hang of the render.
  if (browser) {
    /** @type {any} */ let timer;
    await Promise.race([browser.then((b) => b.close(), () => {}), new Promise((r) => { timer = setTimeout(r, 15_000); })]).catch(() => {});
    clearTimeout(timer);
  }
  }
  // 1b. Transitions that need the shot before: a whip, a slide or a zoom from its last frame into this shot.
  // The shot keeps its length (the move happens over its first frames), so the film's clock never shifts.
  for (let i = Math.max(1, first); i < (o.joinParts ? 0 : range.end); i += 1) {
    const v = t.video[i];
    const kind = v.transition && v.transition !== "flash" ? XFADE[/** @type {keyof typeof XFADE} */ (v.transition)] : null;
    if (!kind || t.video[i - 1].type === "black") continue;
    const [name, wanted] = kind;
    const duration = Math.min(Number(wanted), v.frames / t.fps / 3);
    const out = segments[i].replace(/\.mp4$/, `-${v.transition}-${hash({ from: segments[i - 1], d: duration })}.mp4`);
    if (!existsSync(out)) {
      const last = out.replace(/\.mp4$/, "-from.png");
      await run(ffmpeg, ["-v", "error", "-y", "-sseof", "-0.12", "-i", segments[i - 1], "-frames:v", "1", "-update", "1", last]);
      await run(ffmpeg, ["-v", "error", "-y", "-loop", "1", "-framerate", String(t.fps), "-t", duration.toFixed(3), "-i", last, "-i", segments[i], "-filter_complex", `[0]fps=${t.fps},format=yuv420p,setsar=1,settb=AVTB[a];[1]fps=${t.fps},format=yuv420p,setsar=1,settb=AVTB[b];[a][b]xfade=transition=${name}:duration=${duration.toFixed(3)}:offset=0${v.transition === "whip" ? `,gblur=sigma=18:sigmaV=0.01:enable='lt(t,${duration.toFixed(3)})'` : ""}[v]`, "-map", "[v]", "-frames:v", String(v.frames), "-threads", "2", ...enc, out + ".part.mp4"]);
      renameSync(out + ".part.mp4", out);
      stats.transitions += 1;
    }
    segments[i] = out;
  }
  // A part with no shot (a film with fewer, longer shots than parts) writes only its report: the join skips it.
  if (o.part && range.start >= range.end) {
    const report = { part: o.part.index + 1, of: o.part.count, shots: [range.start, range.end], frames: 0, empty: true, stats, warnings };
    writeFileSync(o.outFile.replace(/\.mp4$/i, "") + ".part.json", JSON.stringify(report, null, 1));
    log(`picture: part ${o.part.index + 1}/${o.part.count} has no shot (nothing to render)`);
    return /** @type {any} */ (report);
  }
  const videoList = join(o.workDir, "video.txt");
  const pictures = o.joinParts ?? segments.slice(range.start, range.end);
  writeFileSync(videoList, pictures.map((s) => `file '${resolve(s).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
  const videoFile = o.part ? o.outFile : join(o.workDir, "video.mp4");
  await run(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", videoList, "-c", "copy", videoFile]);
  if (o.part) {
    // A part is picture only: the join mixes the sound once over the whole film.
    const report = { part: o.part.index + 1, of: o.part.count, shots: [range.start, range.end], frames: range.frames, stats, warnings };
    writeFileSync(o.outFile.replace(/\.mp4$/i, "") + ".part.json", JSON.stringify(report, null, 1));
    log(`picture: part ${o.part.index + 1}/${o.part.count} (shots ${range.start}-${range.end - 1}, ${range.frames} frames)`);
    return /** @type {any} */ (report);
  }
  log(o.joinParts ? `picture: ${o.joinParts.length} parts joined` : "picture: joined");

  // 2. Narration: each scene's voice in its slot, sped up at most 15%, silence elsewhere.
  //    One-track films (the voice system): the recording itself, untouched in time.
  /** @type {{ start: number, end: number, file: string | null, scene: string | null }[]} */
  const pieces = [];
  let clock = 0;
  const narrationFile = join(o.workDir, "narration.wav");
  if (o.oneTrack) {
    const spoken = await mediaDuration(o.oneTrack.file, ffprobe);
    if (spoken > t.durationSeconds + 0.05) warnings.push(`The voice is ${spoken.toFixed(2)} s but the film is ${t.durationSeconds.toFixed(2)} s: its end would be cut. The scenes must be built on this recording.`);
    const samples = Math.round(t.durationSeconds * SAMPLE_RATE);
    await run(ffmpeg, ["-v", "error", "-y", "-i", o.oneTrack.file, "-vn", "-af", `aresample=${SAMPLE_RATE},apad,atrim=end_sample=${samples}`, "-ac", "1", "-c:a", "pcm_s16le", narrationFile]);
    pieces.push({ start: 0, end: t.durationSeconds, file: o.oneTrack.file, scene: "voice" });
    log("narration: the one voice track");
  }
  for (const n of o.oneTrack ? [] : [...t.narration].sort((a, b) => a.start - b.start)) {
    if (n.start > clock + 1e-6) pieces.push({ start: clock, end: n.start, file: null, scene: null });
    const end = Math.min(n.end, t.durationSeconds);
    if (end > n.start) pieces.push({ start: n.start, end, file: o.voice?.[n.scene] ?? null, scene: n.scene });
    clock = Math.max(clock, end);
  }
  if (!o.oneTrack && t.durationSeconds > clock + 1e-6) pieces.push({ start: clock, end: t.durationSeconds, file: null, scene: null });
  const audioFiles = [];
  let samplesSoFar = 0;
  for (const p of o.oneTrack ? [] : pieces) {
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
  if (!o.oneTrack) {
    const audioList = join(o.workDir, "audio.txt");
    writeFileSync(audioList, audioFiles.map((f) => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    await run(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", audioList, "-c", "copy", narrationFile]);
    log("narration: joined");
  }

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
    const input = file ? [...(loop ? ["-stream_loop", "-1"] : []), "-i", file] : ["-f", "lavfi", "-i", `anullsrc=r=${SAMPLE_RATE}:cl=stereo`];
    const fade = file ? `,afade=t=in:d=${Math.min(1, seconds / 4).toFixed(3)},afade=t=out:st=${Math.max(0, seconds - Math.min(1.5, seconds / 4)).toFixed(3)}:d=${Math.min(1.5, seconds / 4).toFixed(3)}` : "";
    await run(ffmpeg, ["-v", "error", "-y", ...input, "-af", `aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,apad,atrim=end_sample=${samples}${fade}`, "-ac", "2", "-c:a", "pcm_s16le", out + ".part.wav"]);
    renameSync(out + ".part.wav", out);
    stats.audioRendered += 1;
    return out;
  }

  // 4. Sound effects: per scene, its ambience looped low under the whole scene and its one-shots at their moments.
  /** @type {string | null} */
  let sfxFile = null;
  // The edit's own sound design is synthesised here (free, nobody's copyright); a file the owner gives wins.
  const needsSynth = (t.sfx ?? []).some((e) => e.token.startsWith("AUTO-") || (e.kind === "bed" && !o.sfx?.[e.token]));
  const synth = needsSynth ? await synthSounds(join(dirs.audio, "synth"), ffmpeg) : {};
  const sfxFiles = { ...synth, ...(o.sfx ?? {}) };
  // An ambience the script asks for without a recording becomes synthesised room tone, never dead silence.
  const roomTone = [...new Set((t.sfx ?? []).filter((e) => e.kind === "bed" && !o.sfx?.[e.token]).map((e) => e.token))];
  for (const token of roomTone) sfxFiles[token] = synth["AUTO-ROOM"];
  if (roomTone.length) warnings.push(`Ambience without a recording, played as synthesised room tone: ${roomTone.sort().join(", ")}.`);
  const sounds = (t.sfx ?? []).filter((e) => sfxFiles[e.token]);
  // The room empties before a reveal (the music's own holes are the curtains): the hit lands in a silence.
  const silences = breathWindows(sounds);
  const missingSfx = new Set((t.sfx ?? []).filter((e) => !sfxFiles[e.token]).map((e) => e.token));
  if (missingSfx.size && sounds.length) warnings.push(`Sound effects without a file: ${[...missingSfx].sort().join(", ")}.`);
  if (sounds.length) {
    // One span per scene, from its earliest sound to the scene's end; one-shots sit at their offset inside it.
    /** @type {Map<string, { start: number, end: number, events: typeof sounds }>} */
    const byScene = new Map();
    for (const e of sounds) {
      const sc = byScene.get(e.scene) ?? { start: e.start, end: e.end, events: [] };
      sc.start = Math.min(sc.start, e.start);
      sc.end = Math.max(sc.end, e.end);
      sc.events.push(e);
      byScene.set(e.scene, sc);
    }
    const spans = [...byScene.values()].sort((a, b) => a.start - b.start);
    const pieces = [];
    let at = 0;
    for (const span of spans) {
      // Nothing may ring past the end of the film (a boom under the last shot is cut at the last frame).
      const end = Math.min(span.end, t.durationSeconds);
      const start = Math.max(span.start, at);
      if (start >= end) continue;
      if (start > at + 1e-6) pieces.push(await audioPiece(null, Math.round(start * SAMPLE_RATE) - Math.round(at * SAMPLE_RATE)));
      const samples = Math.round(end * SAMPLE_RATE) - Math.round(start * SAMPLE_RATE);
      if (samples > 0) pieces.push(await scenePiece(span.events, start, samples));
      at = Math.max(at, end);
    }
    const tail = Math.round(t.durationSeconds * SAMPLE_RATE) - Math.round(at * SAMPLE_RATE);
    if (tail > 0) pieces.push(await audioPiece(null, tail));
    const sfxList = join(o.workDir, "sfx.txt");
    writeFileSync(sfxList, pieces.map((f) => `file '${resolve(f).replace(/'/g, "'\\''")}'`).join("\n") + "\n");
    sfxFile = join(o.workDir, "sfx.wav");
    await run(ffmpeg, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", sfxList, "-c", "copy", sfxFile]);
    log("sound effects: joined");
  }

  /**
   * One scene's sound: beds looped at a low level, one-shots delayed to their moment, exactly `samples` long.
   * @param {typeof sounds} events @param {number} start @param {number} samples
   */
  async function scenePiece(events, start, samples) {
    const key = hash({ sfx: events.map((e) => [e.token, resolve(String(sfxFiles[e.token])), e.kind, Math.round((e.start - start) * 1000)]), quiet: silences.map((w) => [w.start, w.end]), samples });
    const out = join(dirs.audio, `s-${key}.wav`);
    if (existsSync(out)) return out;
    /** @type {string[]} */
    const inputs = [];
    /** @type {string[]} */
    const chains = [];
    events.forEach((e, i) => {
      const file = /** @type {string} */ (sfxFiles[e.token]);
      // Synthesised edit sounds sit a little lower than the script's own effects, so they support rather than shout.
      const gain = AUTO_GAIN[/** @type {keyof typeof AUTO_GAIN} */ (e.token)] ?? 0.45;
      if (e.kind === "bed") {
        // The bed runs at a low level, and goes quiet where the film holds its breath before a reveal.
        inputs.push("-stream_loop", "-1", "-i", file);
        chains.push(`[${i}:a]aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,volume='${quietExpression(silences, 0.12, { offset: start })}':eval=frame[s${i}]`);
      }
      else {
        const ms = Math.max(0, Math.round((e.start - start) * 1000));
        const [l, r] = SFX_PAN[/** @type {keyof typeof SFX_PAN} */ (e.token)] ?? [1, 1];
        inputs.push("-i", file);
        chains.push(`[${i}:a]aresample=${SAMPLE_RATE},aformat=channel_layouts=stereo,pan=stereo|c0=${l}*c0|c1=${r}*c1,volume=${gain},adelay=${ms}:all=1[s${i}]`);
      }
    });
    const graph = `${chains.join(";")};${events.map((_, i) => `[s${i}]`).join("")}amix=inputs=${events.length}:normalize=0:duration=longest,apad,atrim=end_sample=${samples}[out]`;
    await run(ffmpeg, ["-v", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "2", "-c:a", "pcm_s16le", out + ".part.wav"]);
    renameSync(out + ".part.wav", out);
    stats.audioRendered += 1;
    return out;
  }

  // 5. Mux, in stereo: the voice is centred, the music ducks under every spoken piece and leaves for the
  //    breath before a designed reveal, the effects sit where an editor put them. The mix is normalised to
  //    the platform loudness with a wide loudness range kept (a film is not a flat wall of sound).
  mkdirSync(dirname(resolve(o.outFile)), { recursive: true });
  // Inputs: 0 picture, 1 voice, then music and effects when present.
  const extra = [musicFile, sfxFile].filter((f) => f !== null);
  const musicIn = musicFile ? 2 : -1;
  const sfxIn = sfxFile ? (musicFile ? 3 : 2) : -1;
  const duckPlan = gainPlan({ voice: voiceWindows(pieces), curtains: curtainWindows(sounds) });
  // The duck is what the voice does to the music; the curtains are separate holes in the plan.
  const duckDb = deepestDuckDb(duckPlan.filter((w) => w.gain > 0));
  // Does the score follow the cut? A chapter's turn is marked by a new cue or a riser; where neither is,
  // the music is not following the story there, and the report says so.
  const score = scoreReport({ music: t.music, video: t.video, sfx: t.sfx });
  if (score.unmarked.length) warnings.push(`Music does not mark ${score.unmarked.length} chapter turn(s) at ${score.unmarked.map((x) => `${x.toFixed(1)} s`).join(", ")}: no new cue and no riser.`);
  const parts = [];
  const layers = [];
  if (musicIn > 0) {
    parts.push(`[1:a]aformat=channel_layouts=stereo,asplit=2[voice][key]`);
    parts.push(`[${musicIn}:a]aformat=channel_layouts=stereo,volume='${musicGainExpression(duckPlan)}':eval=frame[bed]`);
    parts.push(`[bed][key]sidechaincompress=threshold=0.03:ratio=12:attack=8:release=320:makeup=1[ducked]`);
    layers.push("[voice]", "[ducked]");
  } else { parts.push(`[1:a]aformat=channel_layouts=stereo[voice]`); layers.push("[voice]"); }
  if (sfxIn > 0) { parts.push(`[${sfxIn}:a]aformat=channel_layouts=stereo[fx]`); layers.push("[fx]"); }
  parts.push(`${layers.join("")}amix=inputs=${layers.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=15[a]`);
  const mix = extra.length
    ? [...extra.flatMap((f) => ["-i", /** @type {string} */ (f)]), "-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[a]"]
    : ["-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-14:TP=-1.5:LRA=15"];
  const mux = (/** @type {string[]} */ m) => run(ffmpeg, ["-v", "error", "-y", "-i", videoFile, "-i", narrationFile, ...m, "-c:v", "copy", "-ar", String(SAMPLE_RATE), "-ac", "2", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outFile + ".part.mp4"]);
  // Loudness normalisation needs sound and at least 3 s; on pure digital silence it yields NaN and the encoder stops.
  const anySound = pieces.some((p) => p.file) || extra.length > 0;
  const plain = ["-map", "0:v", "-map", "1:a"];
  if (!anySound || t.durationSeconds < 3) await mux(plain);
  else {
    try { await mux(mix); } catch (error) {
      if (!/NaN|Inf/.test(String(error))) throw error;
      warnings.push("Loudness normalisation failed on this soundtrack (near-silent); the mix was written without it.");
      await mux(extra.length ? [...extra.flatMap((f) => ["-i", /** @type {string} */ (f)]), "-filter_complex", parts.join(";").replace(",loudnorm=I=-14:TP=-1.5:LRA=15", ""), "-map", "0:v", "-map", "[a]"] : plain);
    }
  }
  renameSync(o.outFile + ".part.mp4", o.outFile);
  // 6. Check the master itself: the loudness target and black picture are measured, not assumed.
  /** @type {Awaited<ReturnType<typeof measureMaster>> | null} */
  let master = null;
  try { master = await measureMaster(o.outFile, ffmpeg); } catch (error) { warnings.push(`The master could not be measured: ${error instanceof Error ? error.message : error}`); }
  // One-pass loudnorm can land off target on short or quiet material (a rough own-voice take came out at -15.3 LUFS):
  // a measured master more than 0.5 LU away gets one exact gain step on the audio only (the picture is copied), with a
  // limiter only when the gain would lift the true peak above -1 dBTP; then it is measured again.
  // The correction is measured, not assumed: each pass copies the picture, lifts or drops only the audio, and
  // measures the master again. A limiter-led pass can land a little short of the target (the slice report's
  // -18.2 LUFS against -14), so up to three passes are taken until the master is within 0.5 LU; the last
  // measurement is what the report and the gate see, and every pass is logged with its number.
  if (master && anySound && t.durationSeconds >= 3) {
    for (let pass = 1; pass <= 3; pass += 1) {
      const fix = loudnessFix(master);
      if (!fix) break;
      const { gain, af } = fix;
      try {
        await run(ffmpeg, ["-v", "error", "-y", "-i", o.outFile, "-map", "0", "-c:v", "copy", "-c:s", "copy", "-af", af, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outFile + ".gain.mp4"]);
        renameSync(o.outFile + ".gain.mp4", o.outFile);
        master = await measureMaster(o.outFile, ffmpeg);
        log(`master: loudness pass ${pass} moved ${gain > 0 ? "+" : ""}${gain} dB to ${master.integratedLufs} LUFS (target -14)`);
      } catch (error) { warnings.push(`The loudness correction failed: ${error instanceof Error ? error.message : error}`); break; }
    }
  }
  if (master) {
    const normalised = anySound && t.durationSeconds >= 3;
    if (normalised && master.integratedLufs !== null && Math.abs(master.integratedLufs + 14) > 1) warnings.push(`Master loudness is ${master.integratedLufs} LUFS; the target is -14 LUFS within 1 LU.`);
    if (master.truePeakDbtp !== null && master.truePeakDbtp > -1) warnings.push(`Master true peak is ${master.truePeakDbtp} dBTP; the limit is -1 dBTP.`);
    // Black the script asks for (a black segment) is intended; any other black stretch is a defect to look at.
    const scripted = t.video.filter((v) => v.type === "black");
    const covered = (/** @type {{ start: number, end: number, duration: number }} */ b) => scripted.reduce((sum, v) => sum + Math.max(0, Math.min(v.end, b.end) - Math.max(v.start, b.start)), 0) >= b.duration - 0.5;
    for (const b of master.black) if (!covered(b)) warnings.push(`Black picture for ${b.duration.toFixed(1)} s from ${b.start.toFixed(1)} s that the script does not ask for.`);
  }
  // 7. The critic (M6): the film is measured against the house standard, and its verdict travels with the
  //    report, so the release gate blocks a film that is complete but not good.
  /** @type {number | null} */
  let channels = null;
  try { channels = (await measureFilm(o.outFile, { ffmpeg, ffprobe, freezes: false })).channels; } catch { /* the report says null */ }
  const mixed = master ? { ...master, channels } : null;
  // Blurred copies and flicker are measured on the picture itself, one pass at two frames a second.
  /** @type {{ blurred: any[], blurredDesigned?: any[], flicker: any[], dark?: any[] } | null} */
  let picture = null;
  try { picture = await measurePicture(o.outFile, t, { ffmpeg }); } catch { /* the report says null */ }
  // Picture taste: how much of each shot is picture, the same picture twice, a burned-in logo, text on empty black.
  /** @type {Awaited<ReturnType<typeof measureTaste>> | null} */
  let taste = null;
  try { taste = await measureTaste(o.outFile, t, { ffmpeg }); } catch (error) { warnings.push(`Picture taste could not be measured (${error instanceof Error ? error.message.slice(0, 120) : error}).`); }
  // The eyes' per-shot relevance (M3) reaches the gate too, not only the `why` field of a media file.
  // The critic also reads which scenes really carry a voice (a single recording voices them all) and the edit plans,
  // so a scene that lost its narration or a transition the editor asked for cannot pass unnoticed.
  const critic = critique(t, { master: mixed, durationSeconds: t.durationSeconds, fps: t.fps, width: t.width, height: t.height }, { channels, freezes: mixed?.freezes ?? [], relevance: t.video.map((v) => (Number.isFinite(v.relevance) ? /** @type {number} */ (v.relevance) : NaN)), ...(o.oneTrack ? {} : { voiced: pieces.filter((p) => p.file && p.scene).map((p) => /** @type {string} */ (p.scene)) }), edits: o.edits ?? [], ...(o.craft ? { craft: o.craft } : {}), ...(o.oneTrack ? { voiceFilm: true } : {}), ...(taste ? { taste } : {}), ...(picture ? { blurred: picture.blurred, blurredDesigned: picture.blurredDesigned ?? [], flicker: picture.flicker, dark: picture.dark ?? [] } : {}) });
  if (critic.verdict === "block") for (const f of critic.findings.filter((x) => x.severity === "block")) warnings.push(`Critic: ${f.en}`);
  const base = o.outFile.replace(/\.mp4$/i, "");
  writeFileSync(base + ".srt", toSrt(t.captions));
  const licences = [...new Map(t.video.filter((v) => v.type === "clip").map((v) => [v.url, { url: v.url, sourcePageUrl: v.sourcePageUrl, licence: v.licence }])).values()];
  // What the Edit Director's plan put on screen (punch-ins and shakes drawn, glitches into scenes).
  const edit = { punchIns: t.video.reduce((n, v) => n + (v.type === "black" ? 0 : editMotionCount(v, t.fps).punchIns), 0), shakes: t.video.reduce((n, v) => n + (v.type === "black" ? 0 : editMotionCount(v, t.fps).shakes), 0), glitches: t.video.filter((v) => v.transition === "glitch" && !v.fadeIn).length };
  // The film's own shots: id, where it sits, how many frames, and the eyes' relevance. A film that is blocked can
  // then name the shots that failed and the parts that hold them (render/autofix.mjs), instead of being sent back whole.
  const shots = t.video.map((v) => ({
    id: String(v.id), scene: v.scene, shot: v.shot, start: v.start, end: v.end, frames: v.frames, type: v.type, url: v.url ?? null,
    ...(Number.isFinite(v.relevance) ? { relevance: v.relevance } : {}), ...(v.shotType ? { shotType: v.shotType } : {}),
    ...(v.still ? { still: true } : {}), ...(v.chapterTitle ? { chapterTitle: v.chapterTitle } : {}),
  }));
  const report = { file: basename(o.outFile), durationSeconds: t.durationSeconds, width: t.width, height: t.height, fps: t.fps, stats: { ...t.stats, ...stats, edit }, shots, // One recording (the voice system) voices every scene: it is laid from 0:00 under the whole film.
    score,
    voicedScenes: o.oneTrack ? t.narration.length : pieces.filter((p) => p.file).length, narratedScenes: t.narration.length, ...(o.oneTrack ? { oneTrack: basename(o.oneTrack.file) } : {}), musicCues: { scripted: new Set((t.music ?? []).map((m) => m.cue)).size, played: new Set(cues.map((m) => m.cue)).size }, soundEffects: { scripted: new Set((t.sfx ?? []).map((e) => e.token)).size, played: new Set(sounds.map((e) => e.token)).size }, mix: { stereo: true, channels, duckDb, curtains: duckPlan.filter((w) => w.gain === 0).length, music: musicFile !== null, effects: sfxFile !== null }, master: mixed, critic, licences, ...(t.timing ? { timing: t.timing } : {}), ...(t.motion ? { motion: t.motion } : {}), warnings };
  // Where the picture flickers or is blurred, by shot: a count alone cannot be fixed (film ccd86532 reported 13 and no place).
  if (picture) {
    const at = (/** @type {{ id: string }} */ f) => { const v = t.video.find((/** @type {any} */ x) => String(x.id) === String(f.id)); return v ? { shotType: v.shotType, type: v.type, still: Boolean(v.still), url: v.url, chapterTitle: v.chapterTitle } : {}; };
    /** @type {any} */ (report).picture = { samples: picture.samples, flicker: picture.flicker.slice(0, 60).map((f) => ({ ...f, ...at(f) })), blurred: picture.blurred.slice(0, 40).map((b) => ({ ...b, ...at(b) })), dark: (picture.dark ?? []).slice(0, 40).map((d) => ({ ...d, ...at(d) })) };
  }
  if (taste) /** @type {any} */ (report).taste = taste;
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
    // The Edit Director's plan (edit-C1.json); without it the edit follows the script alone.
    const edit = await get(`edit-${c.id}.json`);
    return { id: c.id, title: typeof c.title === "string" ? c.title : "", markdown: (await get(`s5-${c.id}.md`)) ?? "", media: media ? JSON.parse(media) : null, edit: edit ? JSON.parse(edit) : null };
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

/** Sound-effect files named after their token (SND-FX-01.mp3, SND-AMB-02.wav ...) in a folder. @param {string | undefined} dir */
export function sfxFolder(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  if (!dir || !existsSync(dir)) return out;
  for (const f of readdirSync(dir)) { const m = /^(SND-(?:AMB|FX|DES)-\d{2,3})\.(mp3|wav|m4a|aac|ogg|flac)$/i.exec(f); if (m) out[m[1].toUpperCase()] = join(dir, f); }
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
  // --no-graphics draws the cards with ffmpeg instead of a browser: for a machine with no Chromium.
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (!args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: node render/render-film.mjs (--run <folder> | --api <site> --id <film id>) --out film.mp4 [--voice <folder> | --one-track <recording> --words <words.json>] [--music <folder>] [--sfx <folder>] [--look documentary|cinematic|archive] [--timing voice|script] [--motion reduced|calm|balanced|dynamic] [--ai <folder>] [--pictures <folder>] [--part i/N | --join part1.mp4,part2.mp4,...] [--width 1920 --height 1080 --fps 30 --work .render --font file.ttf] [--require-graphics]");
    process.exit(2);
  }
  const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
  const chapters = await loadRunFiles(from);
  const voice = voiceFolder(args.voice);
  // Captions follow the recorded voice, not the scene slot.
  /** @type {Record<string, { durationSeconds: number, alignment?: any }>} */
  const spoken = {};
  for (const [scene, file] of Object.entries(voice)) {
    // ElevenLabs takes come with their character timings (SC0001.alignment.json), so captions land on the word.
    const timings = file.replace(/\.[a-z0-9]+$/i, ".alignment.json");
    spoken[scene] = { durationSeconds: await mediaDuration(file), ...(existsSync(timings) ? { alignment: JSON.parse(readFileSync(timings, "utf8")) } : {}) };
  }
  // The film's format decides its look (cinematic for stories and motivation, archive for history); --look overrides.
  const filmInfo = JSON.parse((await loadRunText(from, "film.json")) ?? (await loadRunText(from, "run.json")) ?? "{}");
  const look = /** @type {"documentary" | "cinematic" | "archive"} */ (["documentary", "cinematic", "archive"].includes(args.look) ? args.look : lookFor(filmInfo.formatId ?? filmInfo.film?.formatId));
  // The voice system: one recording is the whole narration; captions come from its own word times.
  const oneTrack = typeof args["one-track"] === "string" ? { file: args["one-track"] } : undefined;
  // Scenes follow the takes (no take sped up or cut); --timing script keeps the script's times.
  const timeline = buildTimeline({ chapters, voice: oneTrack ? {} : spoken, look, width: Number(args.width ?? 1920), height: Number(args.height ?? 1080), fps: Number(args.fps ?? 30), fitVoice: args.timing !== "script", motionProfile: profileFor({ formatId: filmInfo.formatId ?? filmInfo.film?.formatId, contentType: filmInfo.contentType ?? filmInfo.film?.contentType, topic: filmInfo.topic ?? filmInfo.film?.topic, text: chapters.flatMap((c) => parseSceneLines(c.markdown).map((sc) => sc.narration)).join(" ") }), motionLevel: args.motion ?? filmInfo.motionLevel ?? filmInfo.film?.motionLevel });
  if (timeline.timing) console.log(`timing: ${timeline.timing.plannedSeconds} s planned, ${timeline.timing.fittedSeconds} s fitted to the voice (${timeline.timing.stretched} scenes longer, ${timeline.timing.shortened} shorter)`);
  console.log(`look: ${look}`);
  if (oneTrack && typeof args.words === "string") {
    const { captionsForVoice } = await import("../engine/src/timeline.mjs");
    timeline.captions = captionsForVoice(JSON.parse(readFileSync(args.words, "utf8")).words, timeline.durationSeconds);
  }
  // AI scenes made by ai-scenes.mjs replace their cards (stories with one cast).
  let aiShots = 0;
  if (args.ai) {
    const { applyAiScenes } = await import("./ai-scenes.mjs");
    aiShots = applyAiScenes(timeline, args.ai);
    if (aiShots) console.log(`AI scenes: ${aiShots}`);
  }
  // The owner's own pictures (pictures/<film id>/SC0012-1.jpg ...) replace their shots, after AI scenes.
  if (args.pictures) {
    const { applyOwnPictures, downloadPictureLinks, ownPictureFolder } = await import("./own-pictures.mjs");
    const { parseLinksFile } = await import("../engine/src/picture-links.mjs");
    // Links the owner pasted in the studio (pictures.json) and in a committed links.txt; the committed file wins on a clash.
    const pasted = JSON.parse((await loadRunText(from, "pictures.json")) ?? "{}");
    const listed = existsSync(join(args.pictures, "links.txt")) ? parseLinksFile(readFileSync(join(args.pictures, "links.txt"), "utf8")) : { links: {}, bad: [] };
    for (const b of listed.bad) console.warn(`links.txt: not understood: ${b}`);
    const links = { ...pasted, ...listed.links };
    if (Object.keys(links).length) {
      const got = await downloadPictureLinks(links, args.pictures);
      console.log(`picture links: ${got.saved.length} downloaded, ${got.kept.length} already here, ${got.skipped.length} replaced by committed files`);
      for (const f of got.failed) timeline.notes.push(`pictures: the link for ${f.shot} could not be used (${f.why}); the shot keeps its own picture.`);
    }
    const own = applyOwnPictures(timeline, ownPictureFolder(args.pictures));
    if (own.applied.length) console.log(`own pictures: ${own.applied.length}`);
  }
  // Designed moments for a voice film, found in its words (engine/src/voice-moments.mjs): names, big numbers, dates, places,
  // quotes and a title, laid over the existing pictures. The brain's own designed shots are kept and the plan fills the gaps.
  if (oneTrack && typeof args.words === "string" && !process.argv.includes("--no-moments")) {
    if (!loadPlaywright() || process.argv.includes("--no-graphics")) {
      timeline.notes.push("moments: no graphics browser on this machine, so the words' own designed moments were not planned.");
    } else {
      const spoken = JSON.parse(readFileSync(args.words, "utf8")).words ?? [];
      const brain = designedMoments(timeline.video);
      const plan = planMoments({ words: spoken, duration: timeline.durationSeconds, topic: filmInfo.topic ?? filmInfo.film?.topic, existing: brain.map((v) => ({ start: Number(v.start), end: Number(v.end) })), hasTitle: timeline.video.some((v) => v.chapterTitle || v.shotType === "title") });
      const fitted = attachMoments(timeline.video, plan.moments);
      timeline.sfx.push(...momentSounds(fitted.placed));
      timeline.sfx.sort((a, b) => a.start - b.start);
      // timeline.moments is the film report's record of every moment: what the words gave, where it went, what was dropped and why.
      timeline.moments = { brainPlanned: brain.length, placed: fitted.placed, dropped: fitted.dropped, skipped: plan.skipped, stats: plan.stats };
      console.log(`moments: ${fitted.placed.length} placed from the words (${fitted.placed.map((p) => p.kind).join(", ") || "none"}), ${brain.length} already planned, ${fitted.dropped.length + plan.skipped.length} left out`);
    }
  }
  // The Craft Ledger's targets for this film (written by local/voice-film.mjs): the critic notes each measure short of them.
  const craftFile = args.run ? join(args.run, "craft-targets.json") : null;
  const craft = craftFile && existsSync(craftFile) ? JSON.parse(readFileSync(craftFile, "utf8")) : null;
  const workDir = args.work ?? ".render";
  // Chunked render: --part i/N renders that part's picture only; --join a.mp4,b.mp4,... joins the parts and mixes the sound.
  const partArg = typeof args.part === "string" ? /^(\d+)\/(\d+)$/.exec(args.part) : null;
  if (args.part && !partArg) throw new Error(`--part must look like 2/8, not "${args.part}".`);
  const part = partArg ? { index: Number(partArg[1]) - 1, count: Number(partArg[2]) } : undefined;
  const joinParts = typeof args.join === "string" ? args.join.split(",").map((f) => f.trim()).filter(Boolean) : undefined;
  const report = await renderFilm({ timeline, oneTrack, voice: oneTrack ? {} : voice, music: musicFolder(args.music), sfx: sfxFolder(args.sfx), workDir, outFile: args.out, fontFile: args.font, requireGraphics: process.argv.includes("--require-graphics"), ...(process.argv.includes("--no-graphics") ? { graphics: false } : {}), edits: chapters.map((c) => c.edit).filter(Boolean), ...(craft ? { craft } : {}), log: (l) => console.log(l), ...(part ? { part } : {}), ...(joinParts ? { joinParts } : {}) });
  if (part) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
  // M6: the timeline (shot times, types, scene ids) is written next to the film, so the contact sheets
  // and the weak-shot loop are drawn from what was actually rendered, not from a second reading of the script.
  writeFileSync(args.out.replace(/\.mp4$/i, "") + ".timeline.json", JSON.stringify(timeline));
  // The three A/B thumbnails from the S7 briefs, next to the film.
  const s7 = await loadRunText(from, "s7.md");
  if (s7) {
    const clipsDir = join(workDir, "clips");
    mkdirSync(clipsDir, { recursive: true });
    const font = args.font ?? FONT_CANDIDATES.find((f) => existsSync(f));
    const base = args.out.replace(/\.mp4$/i, "");
    const thumbs = await renderThumbnails({ briefs: thumbnailBriefs(s7), timeline, fetchClip: (url) => downloadClip(url, clipsDir), outBase: base, workDir, font });
    console.log(`thumbnails: ${thumbs.map((t) => t.id).join(", ")}`);
    // The Shorts and the Facebook cut, vertical, with their hooks and burned-in captions.
    const cuts = await renderCuts({ film: args.out, briefs: cutBriefs(s7).filter((b) => b.end <= timeline.durationSeconds), captions: timeline.captions, outBase: base, workDir, font });
    console.log(`cuts: ${cuts.map((c) => c.id).join(", ")}`);
    if (aiShots) report.warnings.unshift(`This film has ${aiShots} realistic AI scenes: when uploading, set "Altered or synthetic content" to Yes in YouTube Studio (nothing is written on the video).`);
    writeFileSync(base + ".report.json", JSON.stringify({ ...report, aiShots, thumbnails: thumbs.map((t) => ({ id: t.id, file: basename(t.file), frameFrom: t.frameFrom, bytes: t.bytes })), cuts: cuts.map((c) => ({ id: c.id, file: basename(c.file), seconds: c.seconds, size: `${c.width}x${c.height}` })) }, null, 1));
  }
  // A local film teaches the ledger it read (craft-targets.json names it); a studio film is recorded by the Worker.
  if (craft?.ledgerFile && report.critic) {
    const { recordFilm } = await import("../local/craft-memory.mjs");
    for (const line of recordFilm({ file: craft.ledgerFile, filmId: craft.filmId ?? basename(args.out).replace(/\.mp4$/i, ""), report, genre: craft.genre })) console.log(line);
  }
  console.log(JSON.stringify({ ...report, licences: report.licences.length, warnings: report.warnings.length }, null, 1));
}
