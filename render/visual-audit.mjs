/**
 * The visual coverage audit of a rendered film: the picture itself is
 * measured, not the plan. Every half second the frame's detail (normalised
 * entropy of the luma) and brightness are read; a stretch of frames that is
 * dark and without detail is an empty picture (a black frame or a dark
 * placeholder card), whatever the plan says. Frozen stretches come from
 * ffmpeg's freezedetect. Every finding has its time.
 *   node render/visual-audit.mjs <film.mp4> [--out audit.json]
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

/**
 * A frame is empty when it is dark and plain (the film's dark cards measured entropy 0.48-0.63 at
 * brightness 13-25; a raw gradient 0.21-0.24 at 37-45; real pictures 0.85-0.97), or flat at any
 * brightness (a white or grey frame).
 */
export const EMPTY = Object.freeze({ maxEntropy: 0.7, maxBrightness: 60, flatEntropy: 0.35, minSeconds: 0.5 });

/** @param {string} bin @param {string[]} args @returns {Promise<string>} stderr and stdout together */
function capture(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("error", fail);
    p.on("close", () => ok(out));
  });
}

/**
 * Samples from ffmpeg's metadata print: time, entropy, brightness.
 * @param {string} text
 */
export function parseSamples(text) {
  /** @type {{ t: number, entropy: number, brightness: number }[]} */
  const out = [];
  /** @type {{ t: number, entropy: number, brightness: number } | null} */
  let cur = null;
  for (const line of text.split("\n")) {
    const f = /pts_time:([\d.]+)/.exec(line);
    if (f) { if (cur) out.push(cur); cur = { t: Number(f[1]), entropy: NaN, brightness: NaN }; continue; }
    const e = /normalized_entropy\.normal\.Y=([\d.]+)/.exec(line);
    if (e && cur) cur.entropy = Number(e[1]);
    const y = /signalstats\.YAVG=([\d.]+)/.exec(line);
    if (y && cur) cur.brightness = Number(y[1]);
  }
  if (cur) out.push(cur);
  return out.filter((s) => Number.isFinite(s.entropy) && Number.isFinite(s.brightness));
}

/**
 * Stretches of empty picture, from the samples. The fade in from black and
 * the fade out at the end are expected and are not counted.
 * @param {{ t: number, entropy: number, brightness: number }[]} samples @param {{ step: number, total: number, fadeIn?: number, fadeOut?: number }} o
 */
export function emptyStretches(samples, o) {
  /** @type {{ start: number, end: number, seconds: number, brightness: number, entropy: number }[]} */
  const out = [];
  let from = -1, sumB = 0, sumE = 0, n = 0;
  const close = (/** @type {number} */ end) => {
    const start = samples[from].t;
    if (end - start >= EMPTY.minSeconds) out.push({ start: round(start), end: round(end), seconds: round(end - start), brightness: round(sumB / n), entropy: round(sumE / n, 3) });
    from = -1; sumB = 0; sumE = 0; n = 0;
  };
  samples.forEach((s, k) => {
    const inFade = s.t < (o.fadeIn ?? 2) || s.t > o.total - (o.fadeOut ?? 3);
    const empty = !inFade && ((s.entropy < EMPTY.maxEntropy && s.brightness < EMPTY.maxBrightness) || s.entropy < EMPTY.flatEntropy);
    if (empty) { if (from < 0) from = k; sumB += s.brightness; sumE += s.entropy; n += 1; }
    else if (from >= 0) close(s.t);
  });
  if (from >= 0) close(samples[samples.length - 1].t + o.step);
  return out;
}

/** @param {number} n @param {number} [p] */
const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

/**
 * Audit a film.
 * @param {string} file @param {{ step?: number }} [o]
 */
export async function auditFilm(file, o = {}) {
  const step = o.step ?? 0.5;
  const probe = await capture("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height,r_frame_rate,codec_type", "-of", "json", file]);
  const info = JSON.parse(probe.slice(probe.indexOf("{")));
  const total = Number(info.format?.duration ?? 0);
  const video = (info.streams ?? []).find((/** @type {any} */ s) => s.codec_type === "video") ?? {};
  const text = await capture("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vf", `fps=${1 / step},scale=320:-2,entropy,signalstats,metadata=print:file=-`, "-an", "-f", "null", "-"]);
  const samples = parseSamples(text);
  const frozenLog = await capture("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-vf", "scale=320:-2,freezedetect=n=-60dB:d=2", "-an", "-f", "null", "-"]);
  const frozen = [...frozenLog.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_end: ([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
  const empty = emptyStretches(samples, { step, total });
  const covered = samples.length ? 1 - empty.reduce((n, e) => n + e.seconds, 0) / Math.max(1, total - 5) : 0;
  return { file, seconds: round(total, 3), width: video.width ?? null, height: video.height ?? null, fps: video.r_frame_rate ?? null, samples: samples.length, step, empty, frozen, coverage: round(Math.max(0, covered), 3), ok: empty.length === 0 && frozen.length === 0 && samples.length > 0 };
}

async function main() {
  const file = process.argv[2];
  if (!file) { console.error("Usage: node render/visual-audit.mjs <film.mp4> [--out audit.json]"); process.exit(2); }
  const r = await auditFilm(file);
  const outAt = process.argv.indexOf("--out");
  if (outAt > 0) await writeFile(process.argv[outAt + 1], JSON.stringify(r, null, 1));
  console.log("VISUAL-AUDIT " + JSON.stringify({ ...r, file: undefined }));
  if (!r.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
