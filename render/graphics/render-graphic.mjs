// Renders one Zupona template to video, frame-exact: Playwright opens the template page, seeks it to each
// frame's time and photographs it; the frames go straight into ffmpeg. Opaque templates become H.264 MP4;
// alpha ones (a lower third over footage) become ProRes 4444 .mov with a real alpha channel.
// Playwright is optional: when it is missing, graphicsAvailable() is false and the film keeps its ffmpeg cards.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, renameSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { TEMPLATES } from "./templates.mjs";

const require = createRequire(import.meta.url);

/** @returns {any} the playwright module, or null when it is not installed. */
export function loadPlaywright() {
  try { return require("playwright"); } catch { return null; }
}

export function graphicsAvailable() {
  return Boolean(loadPlaywright());
}

/**
 * @param {{ template: import("./templates.mjs").TemplateName, data: any, out: string, width?: number, height?: number, fps?: number,
 *   seconds?: number, frames?: number, alpha?: boolean, ffmpeg?: string, browser?: any, scale?: number, timeoutMs?: number }} o
 * @returns {Promise<{ out: string, frames: number, alpha: boolean }>}
 */
export async function renderGraphic(o) {
  const tpl = TEMPLATES[o.template];
  if (!tpl) throw new Error(`unknown graphic template: ${o.template}`);
  const width = o.width ?? 1920, height = o.height ?? 1080, fps = o.fps ?? 30;
  const frames = o.frames ?? Math.round((o.seconds ?? tpl.seconds) * fps);
  const seconds = frames / fps;
  const alpha = o.alpha ?? o.template === "lowerThird";
  const html = /** @type {(d: any, f: any, a?: boolean) => string} */ (tpl.html)(o.data, { width, height, fps, seconds }, alpha);
  const pw = o.browser ? null : loadPlaywright();
  if (!o.browser && !pw) throw new Error("playwright is not installed: graphics cannot be drawn");
  const browser = o.browser ?? (await pw.chromium.launch());
  const enc = alpha
    ? ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", "-vendor", "apl0"]
    : ["-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart"];
  const ff = spawn(o.ffmpeg ?? "ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", alpha ? "png" : "mjpeg", "-i", "-", "-frames:v", String(frames), "-r", String(fps), ...enc, o.out], { stdio: ["pipe", "ignore", "pipe"] });
  let err = "";
  ff.stderr.on("data", (b) => { err += b; });
  // ffmpeg that exits early closes its stdin: the write error is reported through `done`, never thrown unhandled.
  ff.stdin.on("error", () => {});
  let exited = false;
  const done = new Promise((res, rej) => { ff.on("error", rej); ff.on("close", (c) => { exited = true; if (c === 0) res(null); else rej(new Error(`ffmpeg graphic encode failed: ${err.slice(-400)}`)); }); });
  done.catch(() => {});
  // Every wait is bounded: a wedged browser page or an ffmpeg that stopped reading fails this graphic
  // (the render falls back to the ffmpeg card) instead of hanging the whole film.
  const deadline = Date.now() + (o.timeoutMs ?? 60_000 + frames * 2_000);
  /** @template T @param {Promise<T>} p @param {string} what @returns {Promise<T>} */
  const bounded = (p, what) => {
    /** @type {any} */ let timer;
    const left = Math.max(1, deadline - Date.now());
    const late = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`graphic ${o.template}: ${what} did not finish in time`)), left); });
    return /** @type {Promise<T>} */ (Promise.race([p, late]).finally(() => clearTimeout(timer)));
  };
  const ctx = await bounded(browser.newContext({ viewport: { width, height }, deviceScaleFactor: o.scale ?? 1 }), "the browser context");
  try {
    const p = await ctx.newPage();
    await bounded(p.setContent(html, { waitUntil: "load" }), "the page");
    await bounded(p.evaluate(() => document.fonts.ready), "the fonts");
    for (let i = 0; i < frames; i += 1) {
      await bounded(p.evaluate((t) => /** @type {any} */ (window).__seek(t), i / fps), `frame ${i}`);
      const shot = await bounded(p.screenshot(alpha ? { type: "png", omitBackground: true } : { type: "jpeg", quality: 94 }), `frame ${i}`);
      if (exited) break;
      // Wait for the pipe to drain, or for ffmpeg to end: a drain that never comes must not hang.
      if (!ff.stdin.write(shot)) await bounded(new Promise((r) => { ff.stdin.once("drain", r); ff.once("close", r); }), `frame ${i} to ffmpeg`);
    }
  } catch (error) {
    if (!exited) ff.kill("SIGKILL");
    throw error;
  } finally {
    ff.stdin.end();
    // Closing a wedged context or browser is bounded too; a close that fails changes nothing for this graphic.
    await bounded(ctx.close(), "closing the page").catch(() => {});
    if (!o.browser) await bounded(browser.close(), "closing the browser").catch(() => {});
  }
  await bounded(done, "ffmpeg");
  return { out: o.out, frames, alpha };
}

// CLI: node render/graphics/render-graphic.mjs <template> '<json data>' out.mp4 [seconds]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , template, data, out, secs] = process.argv;
  renderGraphic({ template: /** @type {any} */ (template), data: JSON.parse(data), out, seconds: secs ? Number(secs) : undefined })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}

/** One render per finished file at a time: two shots with the same graphic share one render. @type {Map<string, Promise<string>>} */
const inFlight = new Map();

/**
 * Render a graphic to `file` safely: into a temp file of its own, checked with ffprobe (a video stream
 * with frames), and renamed only then. On any failure the temp file is deleted and the error thrown,
 * so a cut-off or killed render never leaves a half-written graphic under the final name.
 * @param {Parameters<typeof renderGraphic>[0] & { file: string, ffprobe?: string }} o
 * @param {{ render?: typeof renderGraphic, probe?: (file: string) => Promise<boolean> }} [deps]
 * @returns {Promise<string>} the finished file
 */
export function renderGraphicFile(o, deps = {}) {
  if (existsSync(o.file)) return Promise.resolve(o.file);
  const running = inFlight.get(o.file);
  if (running) return running;
  const job = (async () => {
    const tmp = `${o.file}.${process.pid}-${randomBytes(4).toString("hex")}.part.mp4`;
    try {
      await (deps.render ?? renderGraphic)({ ...o, out: tmp });
      if (!(await (deps.probe ?? ((f) => playable(f, o.ffprobe)))(tmp))) throw new Error(`graphic ${o.template}: the encoded file is not a playable video`);
      renameSync(tmp, o.file);
      return o.file;
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    } finally {
      inFlight.delete(o.file);
    }
  })();
  inFlight.set(o.file, job);
  return job;
}

/** ffprobe finds a video stream with at least one frame. @param {string} file @param {string} [ffprobe] @returns {Promise<boolean>} */
function playable(file, ffprobe = "ffprobe") {
  return new Promise((res) => {
    const p = spawn(ffprobe, ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (b) => { out += b; });
    const timer = setTimeout(() => p.kill("SIGKILL"), 30_000);
    p.on("error", () => { clearTimeout(timer); res(false); });
    p.on("close", (c) => { clearTimeout(timer); res(c === 0 && Number(out.trim()) > 0); });
  });
}
