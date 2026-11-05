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
 *   options: --voice <SC0001.mp3 ...> --music <M01.mp3 ...> --sfx <SND-FX-01.mp3 ...> --width 1920 --height 1080 --fps 30 --work .render --font /path/font.ttf
 */
import { mapSvg, routeSvgs } from "./maps.mjs";
import { synthSounds } from "./sfx-synth.mjs";

/** Levels of the synthesised edit sounds in the effects mix. */
const AUTO_GAIN = { "AUTO-WHOOSH": 0.32, "AUTO-IMPACT": 0.42, "AUTO-BOOM": 0.45, "AUTO-RISER": 0.3, "AUTO-CLICK": 0.22, "AUTO-GLITCH": 0.28 };
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lookFor } from "../engine/src/formats.mjs";
import { buildTimeline, MAX_VOICE_TEMPO, toSrt } from "../engine/src/timeline.mjs";
import { cutBriefs, renderCuts } from "./cuts.mjs";
import { renderThumbnails, thumbnailBriefs } from "./thumbnails.mjs";

const SAMPLE_RATE = 48000;
const MAX_TEMPO = MAX_VOICE_TEMPO;
const SERIF_CANDIDATES = [
  "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
  "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
  "C:\\Windows\\Fonts\\georgiab.ttf",
];
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

/**
 * Measure a finished master instead of assuming it: integrated loudness and
 * true peak (EBU R128) and stretches of black picture of 1.5 s or more
 * (deliberate dips are shorter; a card with text is never "black").
 * @param {string} file @param {string} [ffmpeg]
 * @returns {Promise<{ integratedLufs: number | null, truePeakDbtp: number | null, loudnessRangeLu: number | null, black: { start: number, end: number, duration: number }[] }>}
 */
export function measureMaster(file, ffmpeg = "ffmpeg") {
  return new Promise((ok, fail) => {
    const p = spawn(ffmpeg, ["-nostats", "-hide_banner", "-i", file, "-filter_complex", "[0:a]ebur128=peak=true:framelog=quiet[a];[0:v]scale=160:-2,blackdetect=d=1.5:pix_th=0.05:pic_th=0.999[v]", "-map", "[v]", "-map", "[a]", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    /** @type {string[]} */
    const kept = [];
    let rest = "";
    p.stderr.on("data", (d) => {
      const lines = (rest + d).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (/black_start|^\s+(I|Peak|LRA):/.test(l)) kept.push(l);
    });
    p.on("error", fail);
    p.on("close", (code) => {
      if (rest && /black_start|^\s+(I|Peak|LRA):/.test(rest)) kept.push(rest);
      if (code !== 0) { fail(new Error(`${ffmpeg} exited ${code} while measuring the master`)); return; }
      const last = (/** @type {RegExp} */ re) => { const hits = kept.map((l) => re.exec(l)).filter(Boolean); const v = hits.length ? Number(/** @type {RegExpExecArray} */ (hits[hits.length - 1])[1]) : NaN; return Number.isFinite(v) ? v : null; };
      const black = kept.map((l) => /black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/.exec(l)).filter(Boolean).map((m) => ({ start: Number(/** @type {RegExpExecArray} */ (m)[1]), end: Number(/** @type {RegExpExecArray} */ (m)[2]), duration: Number(/** @type {RegExpExecArray} */ (m)[3]) }));
      ok({ integratedLufs: last(/^\s+I:\s+(-?[\d.]+) LUFS/), truePeakDbtp: last(/^\s+Peak:\s+(-?[\d.]+) dBFS/), loudnessRangeLu: last(/^\s+LRA:\s+(-?[\d.]+) LU/), black });
    });
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
 * @typedef {{ timeline: Timeline, workDir: string, outFile: string, voice?: Record<string, string>, music?: Record<string, string>, sfx?: Record<string, string>, fetchClip?: (url: string) => Promise<string>, fontFile?: string, concurrency?: number, ffmpeg?: string, ffprobe?: string, log?: (line: string) => void }} RenderOptions
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
  const stats = { segmentsRendered: 0, segmentsCached: 0, audioRendered: 0, clipsFailed: 0, transitions: 0 };
  const fetchClip = o.fetchClip ?? ((url) => downloadClip(url, dirs.clips));
  const limit = o.concurrency ?? Math.max(1, cpus().length - 1);
  // Quality-led encoding with a ceiling: about 6 Mbit/s at 1080p30 (scaled by frame size and rate),
  // so a 45-minute film stays near 2 GB at worst and far below it for calm footage.
  const ceiling = Math.max(400, Math.round((6000 * t.width * t.height * t.fps) / (1920 * 1080 * 30)));
  const enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", `${ceiling}k`, "-bufsize", `${ceiling * 2}k`, "-pix_fmt", "yuv420p", "-r", String(t.fps), "-video_track_timescale", "90000", "-an"];
  const frame = `scale=${t.width}:${t.height}:force_original_aspect_ratio=increase,crop=${t.width}:${t.height},fps=${t.fps},setsar=1`;
  const color = (/** @type {string} */ c) => ["-f", "lavfi", "-i", `color=c=${c}:s=${t.width}x${t.height}:r=${t.fps}`];

  // The house look: one gentle grade on every picture, so clips from many sources read as one film.
  // No synthetic grain: random grain on every frame cannot be compressed (a 45-minute film grew past
  // 1.5 GB at 360p) and YouTube's own encoder smears it away anyway.
  // Per format: documentary (gentle), cinematic (teal shadows, warm highlights; 2.39:1 bars), archive (faded and warm).
  const LOOKS = {
    documentary: "eq=contrast=1.06:saturation=0.92:gamma=0.98",
    cinematic: "eq=contrast=1.12:saturation=1.06:gamma=0.97,colorbalance=rs=-0.05:gs=-0.01:bs=0.06:rh=0.07:gh=0.02:bh=-0.06,vignette=PI/5",
    archive: "eq=contrast=1.08:saturation=0.7:gamma=0.97,colorbalance=rh=0.06:gh=0.03:bh=-0.05,vignette=PI/4.5",
  };
  const filmLook = t.look ?? "documentary";
  const LOOK = LOOKS[filmLook] ?? LOOKS.documentary;
  // Cinematic films are framed 2.39:1 with black bars, on every shot, so the frame never jumps.
  const bar = filmLook === "cinematic" ? Math.max(0, Math.round((t.height - t.width / 2.39) / 2)) : 0;
  const BARS = bar ? `drawbox=x=0:y=0:w=iw:h=${bar}:color=black:t=fill,drawbox=x=0:y=ih-${bar}:w=iw:h=${bar}:color=black:t=fill` : "";
  const CARD_BG = (/** @type {number} */ frames) => `vignette=PI/4,fade=t=in:st=0:d=${Math.min(0.25, frames / t.fps / 4).toFixed(3)}`;
  const mono = FONT_CANDIDATES.map((f) => f.replace("DejaVuSans-Bold", "DejaVuSansMono")).find((f) => existsSync(f) && /Mono/.test(f)) ?? font;
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
  const text = (words, key, style) => `drawtext=textfile='${escPath(writeText(words, key))}':${style}:alpha='min(1,t/0.35)'`;
  const serif = SERIF_CANDIDATES.find((f) => existsSync(f)) ?? font;
  // Kinetic type rises 4% of the frame while it fades in (FX-KINETIC); otherwise it stays put.
  const rise = (/** @type {boolean | undefined} */ kinetic, /** @type {string} */ y) => (kinetic ? `y='${y}+h*0.04*(1-min(1,t/0.45))'` : `y=${y}`);

  // 1. Picture: one cached segment per shot, rendered in parallel.
  /** @type {string[]} */
  const segments = new Array(t.video.length);
  await pool(t.video, limit, async (v, i) => {
    // v: bump whenever the way a shot is drawn changes, so cached shots from an older look are redone.
    const key = hash({ v: 8, map: v.map ?? null, transition: v.transition === "flash" ? "flash" : null, still: Boolean(v.still), look: filmLook, fadeIn: v.fadeIn ?? 0, fadeOut: v.fadeOut ?? 0, speed: v.speed ?? 1, chapterTitle: v.chapterTitle ?? "", split: v.split ?? null, style: v.style ?? "plain", kinetic: Boolean(v.kinetic), in: v.sourceIn ?? 0, counter: Boolean(v.counter), type: v.type, url: v.url, text: v.text, title: v.title, chip: v.chip, motion: v.motion, frames: v.frames, w: t.width, h: t.height, fps: t.fps, font });
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
        const [pw, ph] = (await run(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", src])).trim().split(",").map(Number);
        const plateKey = hash({ still: v.url, w: W, h: H });
        if (pw > 0 && ph > 0 && pw / ph < (W / H) * 0.8) {
          // A portrait or square photograph: 2.5D parallax. The sharp picture grows and drifts one way,
          // its blurred copy behind it the other way, so the photo seems to float in depth.
          const bg = join(dirs.cards, `${plateKey}-bg.png`);
          const fg = join(dirs.cards, `${plateKey}-fg.png`);
          const bw = Math.round(W * 1.2 / 2) * 2;
          const bh = Math.round(H * 1.2 / 2) * 2;
          if (!existsSync(bg)) await run(ffmpeg, ["-v", "error", "-y", "-i", src, "-frames:v", "1", "-vf", `scale=${bw}:${bh}:force_original_aspect_ratio=increase,crop=${bw}:${bh},boxblur=26:2,eq=brightness=-0.09:saturation=0.75,setsar=1`, bg]);
          if (!existsSync(fg)) await run(ffmpeg, ["-v", "error", "-y", "-i", src, "-frames:v", "1", "-vf", `scale=-2:${Math.round(H * 0.86 / 2) * 2},setsar=1`, fg]);
          input = ["-loop", "1", "-framerate", String(t.fps), "-i", bg, "-loop", "1", "-framerate", String(t.fps), "-i", fg];
          complex = true;
          const dir = i % 2 ? -1 : 1;
          chain.push(
            `[0]zoompan=z='1+0.05*on/${n}':x='iw/2-(iw/zoom/2)+${dir}*iw*0.03*on/${n}':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=${t.fps}[pbg];` +
            `[1]scale=w='trunc(iw*(1+0.07*n/${n})/2)*2':h=-2:eval=frame[pfg];` +
            `[pbg][pfg]overlay=x='(W-w)/2-${dir}*W*0.025*n/${n}':y='(H-h)/2'`,
            "setsar=1", LOOK,
          );
        } else {
          // A landscape photograph: framed over a blurred copy of itself, then moved slowly
          // (push in, pull out or pan, in turn) so it lives on screen like footage.
          const plate = join(dirs.cards, `${plateKey}.png`);
          if (!existsSync(plate)) {
            const W2 = W * 2;
            const H2 = H * 2;
            await run(ffmpeg, ["-v", "error", "-y", "-i", src, "-frames:v", "1", "-vf", `split=2[bg][fg];[bg]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},boxblur=30:2,eq=brightness=-0.07:saturation=0.8[bgb];[fg]scale=${W2}:${H2}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`, plate]);
          }
          input = ["-loop", "1", "-framerate", String(t.fps), "-i", plate];
          const moves = [
            `zoompan=z='1+0.09*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
            `zoompan=z='1.09-0.09*on/${n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,
            `zoompan=z='1.08':x='(iw-iw/zoom)*on/${n}':y='ih/2-(ih/zoom/2)'`,
          ];
          chain.push(`${moves[i % moves.length]}:d=1:s=${W}x${H}:fps=${t.fps}`, "setsar=1", LOOK);
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
        const label = (/** @type {string} */ words, /** @type {number} */ x, /** @type {number} */ y, /** @type {string} */ from, /** @type {string} */ name) => (words && font ? `drawtext=textfile='${escPath(writeText(words.toUpperCase(), name))}':fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.04)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.012)}:x=${Math.min(W - Math.round(W * 0.25), x + Math.round(H * 0.04))}:y=${Math.max(Math.round(H * 0.04), y - Math.round(H * 0.09))}:alpha='min(1,max(0,(t-${from})/0.4))'` : "");
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
        if (v.map.label && font) chain.push(`drawtext=textfile='${escPath(writeText(v.map.label.toUpperCase(), "map-label"))}':fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.045)}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.014)}:x=w/2+${Math.round(H * 0.06)}:y=h/2-${Math.round(H * 0.1)}:alpha='min(1,max(0,(t-0.35)/0.4))'`);
        mapped = true;
      } catch (error) {
        warnings.push(`${v.id}: the map could not be drawn (${error instanceof Error ? error.message : error}); a text card stands in.`);
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
            chain.push(text(wrap(panel, n === 2 ? 18 : 12), `panel${k}`, `fontfile='${face}':text_align=C:fontcolor=${muted}:fontsize=${Math.round(H * (n === 2 ? 0.055 : 0.045))}:line_spacing=${Math.round(H * 0.015)}:x=${col}:${rise(v.kinetic, "h*0.59-text_h/2")}`));
          });
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
            chain.push(`drawtext=textfile='${escPath(writeText(line, `kinetic-${k}`))}':fontfile='${escPath((paper ? serif : font) ?? "")}':fontcolor=${paper ? "0x1d1a16" : "0xe4ede7"}:fontsize=${size}:x=(w-text_w)/2:y='${y}':alpha='min(1,max(0,(t-${at})/0.35))'`);
          });
        } else if (v.text && font) chain.push(text(wrap(v.text, 26), "card", cardStyle));
      }
    }
    // A title over the scene's first clip, as a lower third; the source chip with the scene's first shot.
    if (type === "clip" && v.title && font) chain.push(text(wrap(v.title, 34), "title", `fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.052)}:line_spacing=${Math.round(H * 0.012)}:box=1:boxcolor=black@0.45:boxborderw=${Math.round(H * 0.018)}:x=w*0.06:${rise(v.kinetic, "h*0.72")}`));
    if (BARS) chain.push(BARS);
    if (v.chip && type !== "black" && mono) chain.push(text(v.chip, "chip", `fontfile='${escPath(mono)}':fontcolor=0xdbe7df:fontsize=${Math.max(10, Math.round(H * 0.026))}:box=1:boxcolor=black@0.55:boxborderw=${Math.round(H * 0.01)}:x=w*0.06:y=h*0.9`));
    // A chapter opens with its number and title, top left, for about three seconds.
    if (v.chapterTitle && font && mono && type !== "black") {
      const show = Math.min(3.2, (v.frames / t.fps) * 0.8);
      const fadeAlpha = `alpha='min(1,max(0,(t-0.3)/0.4))*min(1,max(0,(${show.toFixed(2)}-t)/0.5))'`;
      const [label, ...rest] = v.chapterTitle.split(" · ");
      const top = Math.max(bar, 0) + Math.round(H * 0.07);
      chain.push(`drawtext=textfile='${escPath(writeText(label.toUpperCase(), "chapter-label"))}':fontfile='${escPath(mono)}':fontcolor=0xdbe7df:fontsize=${Math.max(10, Math.round(H * 0.024))}:x=w*0.06:y=${top}:${fadeAlpha}`);
      chain.push(`drawtext=textfile='${escPath(writeText(wrap(rest.join(" · "), 30), "chapter-title"))}':fontfile='${escPath(font)}':fontcolor=white:fontsize=${Math.round(H * 0.05)}:x=w*0.06:y=${top + Math.round(H * 0.04)}:shadowcolor=black@0.6:shadowx=2:shadowy=2:${fadeAlpha}`);
    }
    // Dips through black at chapter breaks and written dissolves: the shot fades out, the next fades in.
    const seconds = v.frames / t.fps;
    if (v.fadeIn) chain.push(`fade=t=in:st=0:d=${v.fadeIn.toFixed(3)}`);
    // A white flash into the scene: the first fifth of a second comes up from white.
    if (v.transition === "flash" && !v.fadeIn) chain.push(`fade=t=in:st=0:d=${Math.min(0.2, seconds / 4).toFixed(3)}:color=white`);
    if (v.fadeOut) chain.push(`fade=t=out:st=${Math.max(0, seconds - v.fadeOut).toFixed(3)}:d=${v.fadeOut.toFixed(3)}`);
    const vf = chain.length ? chain.join(",") : "null";
    const encode = (/** @type {string} */ f) => run(ffmpeg, ["-v", "error", "-y", ...input, "-frames:v", String(v.frames), complex ? "-filter_complex" : "-vf", f, "-threads", "2", ...enc, file + ".part.mp4"]);
    // Centred lines (text_align) need ffmpeg 6.1+; older builds centre the block instead.
    try { await encode(vf); } catch (error) { if (!vf.includes("text_align")) throw error; await encode(vf.replaceAll(":text_align=C", "")); }
    renameSync(file + ".part.mp4", file);
    stats.segmentsRendered += 1;
    if ((stats.segmentsRendered + stats.segmentsCached) % 50 === 0) log(`picture: ${stats.segmentsRendered + stats.segmentsCached}/${t.video.length}`);
  });
  // 1b. Transitions that need the shot before: a whip, a slide or a zoom from its last frame into this shot.
  // The shot keeps its length (the move happens over its first frames), so the film's clock never shifts.
  const XFADE = { whip: ["slideleft", 0.25], slide: ["smoothleft", 0.4], zoom: ["zoomin", 0.35] };
  for (let i = 1; i < t.video.length; i += 1) {
    const v = t.video[i];
    const kind = v.transition && v.transition !== "flash" ? XFADE[v.transition] : null;
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

  // 4. Sound effects: per scene, its ambience looped low under the whole scene and its one-shots at their moments.
  /** @type {string | null} */
  let sfxFile = null;
  // The edit's own sound design is synthesised here (free, nobody's copyright); a file the owner gives wins.
  const sfxFiles = (t.sfx ?? []).some((e) => e.token.startsWith("AUTO-")) ? { ...(await synthSounds(join(dirs.audio, "synth"), ffmpeg)), ...(o.sfx ?? {}) } : { ...(o.sfx ?? {}) };
  const sounds = (t.sfx ?? []).filter((e) => sfxFiles[e.token]);
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
    const key = hash({ sfx: events.map((e) => [e.token, resolve(String(sfxFiles[e.token])), e.kind, Math.round((e.start - start) * 1000)]), samples });
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
      if (e.kind === "bed") { inputs.push("-stream_loop", "-1", "-i", file); chains.push(`[${i}:a]aresample=${SAMPLE_RATE},pan=mono|c0=c0,volume=0.12[s${i}]`); }
      else { const ms = Math.max(0, Math.round((e.start - start) * 1000)); inputs.push("-i", file); chains.push(`[${i}:a]aresample=${SAMPLE_RATE},pan=mono|c0=c0,volume=${gain},adelay=${ms}:all=1[s${i}]`); }
    });
    const graph = `${chains.join(";")};${events.map((_, i) => `[s${i}]`).join("")}amix=inputs=${events.length}:normalize=0:duration=longest,apad,atrim=end_sample=${samples}[out]`;
    await run(ffmpeg, ["-v", "error", "-y", ...inputs, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-c:a", "pcm_s16le", out + ".part.wav"]);
    renameSync(out + ".part.wav", out);
    stats.audioRendered += 1;
    return out;
  }

  // 5. Mux: the music sits low and ducks further whenever the narrator speaks; the mix is normalised to the platform loudness.
  mkdirSync(dirname(resolve(o.outFile)), { recursive: true });
  // Inputs: 0 picture, 1 voice, then music and effects when present.
  const extra = [musicFile, sfxFile].filter((f) => f !== null);
  const musicIn = musicFile ? 2 : -1;
  const sfxIn = sfxFile ? (musicFile ? 3 : 2) : -1;
  const parts = [];
  const layers = ["[voice]"];
  if (musicIn > 0) {
    parts.push(`[1:a]asplit=2[voice][key]`, `[${musicIn}:a]volume=0.3[bed]`, `[bed][key]sidechaincompress=threshold=0.02:ratio=10:attack=15:release=350[ducked]`);
    layers.push("[ducked]");
  } else parts.push(`[1:a]anull[voice]`);
  if (sfxIn > 0) layers.push(`[${sfxIn}:a]`);
  parts.push(`${layers.join("")}amix=inputs=${layers.length}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`);
  const mix = extra.length
    ? [...extra.flatMap((f) => ["-i", /** @type {string} */ (f)]), "-filter_complex", parts.join(";"), "-map", "0:v", "-map", "[a]"]
    : ["-map", "0:v", "-map", "1:a", "-af", "loudnorm=I=-14:TP=-1.5:LRA=11"];
  const mux = (/** @type {string[]} */ m) => run(ffmpeg, ["-v", "error", "-y", "-i", videoFile, "-i", narrationFile, ...m, "-c:v", "copy", "-ar", String(SAMPLE_RATE), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.outFile + ".part.mp4"]);
  // Loudness normalisation needs sound and at least 3 s; on pure digital silence it yields NaN and the encoder stops.
  const anySound = pieces.some((p) => p.file) || extra.length > 0;
  const plain = ["-map", "0:v", "-map", "1:a"];
  if (!anySound || t.durationSeconds < 3) await mux(plain);
  else {
    try { await mux(mix); } catch (error) {
      if (!/NaN|Inf/.test(String(error))) throw error;
      warnings.push("Loudness normalisation failed on this soundtrack (near-silent); the mix was written without it.");
      await mux(extra.length ? [...extra.flatMap((f) => ["-i", /** @type {string} */ (f)]), "-filter_complex", parts.join(";").replace(",loudnorm=I=-14:TP=-1.5:LRA=11", ""), "-map", "0:v", "-map", "[a]"] : plain);
    }
  }
  renameSync(o.outFile + ".part.mp4", o.outFile);
  // 6. Check the master itself: the loudness target and black picture are measured, not assumed.
  /** @type {Awaited<ReturnType<typeof measureMaster>> | null} */
  let master = null;
  try { master = await measureMaster(o.outFile, ffmpeg); } catch (error) { warnings.push(`The master could not be measured: ${error instanceof Error ? error.message : error}`); }
  if (master) {
    const normalised = anySound && t.durationSeconds >= 3;
    if (normalised && master.integratedLufs !== null && Math.abs(master.integratedLufs + 14) > 1) warnings.push(`Master loudness is ${master.integratedLufs} LUFS; the target is -14 LUFS within 1 LU.`);
    if (master.truePeakDbtp !== null && master.truePeakDbtp > -1) warnings.push(`Master true peak is ${master.truePeakDbtp} dBTP; the limit is -1 dBTP.`);
    // Black the script asks for (a black segment) is intended; any other black stretch is a defect to look at.
    const scripted = t.video.filter((v) => v.type === "black");
    const covered = (/** @type {{ start: number, end: number, duration: number }} */ b) => scripted.reduce((sum, v) => sum + Math.max(0, Math.min(v.end, b.end) - Math.max(v.start, b.start)), 0) >= b.duration - 0.5;
    for (const b of master.black) if (!covered(b)) warnings.push(`Black picture for ${b.duration.toFixed(1)} s from ${b.start.toFixed(1)} s that the script does not ask for.`);
  }
  const base = o.outFile.replace(/\.mp4$/i, "");
  writeFileSync(base + ".srt", toSrt(t.captions));
  const licences = [...new Map(t.video.filter((v) => v.type === "clip").map((v) => [v.url, { url: v.url, sourcePageUrl: v.sourcePageUrl, licence: v.licence }])).values()];
  const report = { file: basename(o.outFile), durationSeconds: t.durationSeconds, width: t.width, height: t.height, fps: t.fps, stats: { ...t.stats, ...stats }, voicedScenes: pieces.filter((p) => p.file).length, narratedScenes: t.narration.length, musicCues: { scripted: new Set((t.music ?? []).map((m) => m.cue)).size, played: new Set(cues.map((m) => m.cue)).size }, soundEffects: { scripted: new Set((t.sfx ?? []).map((e) => e.token)).size, played: new Set(sounds.map((e) => e.token)).size }, master, licences, warnings };
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
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (!args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: node render/render-film.mjs (--run <folder> | --api <site> --id <film id>) --out film.mp4 [--voice <folder>] [--music <folder>] [--sfx <folder>] [--look documentary|cinematic|archive] [--ai <folder>] [--width 1920 --height 1080 --fps 30 --work .render --font file.ttf]");
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
  const timeline = buildTimeline({ chapters, voice: spoken, look, width: Number(args.width ?? 1920), height: Number(args.height ?? 1080), fps: Number(args.fps ?? 30) });
  console.log(`look: ${look}`);
  // AI scenes made by ai-scenes.mjs replace their cards (stories with one cast).
  let aiShots = 0;
  if (args.ai) {
    const { applyAiScenes } = await import("./ai-scenes.mjs");
    aiShots = applyAiScenes(timeline, args.ai);
    if (aiShots) console.log(`AI scenes: ${aiShots}`);
  }
  const workDir = args.work ?? ".render";
  const report = await renderFilm({ timeline, voice, music: musicFolder(args.music), sfx: sfxFolder(args.sfx), workDir, outFile: args.out, fontFile: args.font, log: (l) => console.log(l) });
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
  console.log(JSON.stringify({ ...report, licences: report.licences.length, warnings: report.warnings.length }, null, 1));
}
