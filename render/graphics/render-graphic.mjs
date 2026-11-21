// Renders one Zupona template to video, frame-exact: Playwright opens the template page, seeks it to each
// frame's time and photographs it; the frames go straight into ffmpeg. Opaque templates become H.264 MP4;
// alpha ones (a lower third over footage) become ProRes 4444 .mov with a real alpha channel.
// Playwright is optional: when it is missing, graphicsAvailable() is false and the film keeps its ffmpeg cards.
import { spawn } from "node:child_process";
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
 *   seconds?: number, frames?: number, alpha?: boolean, ffmpeg?: string, browser?: any, scale?: number }} o
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
  const done = new Promise((res, rej) => { ff.on("error", rej); ff.on("close", (c) => (c === 0 ? res(null) : rej(new Error(`ffmpeg graphic encode failed: ${err.slice(-400)}`)))); });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: o.scale ?? 1 });
  try {
    const p = await ctx.newPage();
    await p.setContent(html, { waitUntil: "load" });
    await p.evaluate(() => document.fonts.ready);
    for (let i = 0; i < frames; i += 1) {
      await p.evaluate((t) => /** @type {any} */ (window).__seek(t), i / fps);
      const shot = await p.screenshot(alpha ? { type: "png", omitBackground: true } : { type: "jpeg", quality: 94 });
      if (!ff.stdin.write(shot)) await new Promise((r) => ff.stdin.once("drain", r));
    }
  } finally {
    ff.stdin.end();
    await ctx.close();
    if (!o.browser) await browser.close();
  }
  await done;
  return { out: o.out, frames, alpha };
}

// CLI: node render/graphics/render-graphic.mjs <template> '<json data>' out.mp4 [seconds]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , template, data, out, secs] = process.argv;
  renderGraphic({ template: /** @type {any} */ (template), data: JSON.parse(data), out, seconds: secs ? Number(secs) : undefined })
    .then((r) => console.log(JSON.stringify(r)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
