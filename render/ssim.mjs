/**
 * How much a re-encode changed the picture (SSIM, 0-1): the check behind any encoder, preset or bitrate
 * change. 1 is the same picture frame for frame; the studio's rule is >= 0.98 on a sample before an
 * encoding change ships, because a change a viewer can see is a change the film did not ask for.
 *
 *   node -e "import('./render/ssim.mjs').then(async m => console.log(await m.ssimOf('a.mp4','b.mp4')))"
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** The least SSIM an encoding change may have on the sample and still be called invisible. */
export const SSIM_LIMIT = 0.98;

/**
 * The "All:" figure of ffmpeg's ssim filter (0-1), or null when the text holds none.
 * @param {string} text
 */
export function parseSsim(text) {
  const m = /All:\s*([0-9]*\.?[0-9]+)/.exec(String(text ?? ""));
  return m ? Number(m[1]) : null;
}

/**
 * SSIM between two files' pictures (the first stream of each), or null when ffmpeg cannot read them.
 * @param {string} a @param {string} b @param {{ ffmpeg?: string, timeoutMs?: number }} [o]
 * @returns {Promise<number | null>}
 */
export async function ssimOf(a, b, o = {}) {
  const ffmpeg = o.ffmpeg ?? process.env.FFMPEG ?? "ffmpeg";
  try {
    const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", a, "-i", b, "-lavfi", "[0:v][1:v]ssim", "-f", "null", "-"], { maxBuffer: 1 << 24, timeout: o.timeoutMs ?? 300_000 });
    return parseSsim(stderr);
  } catch (/** @type {any} */ e) {
    // ffmpeg writes its measurement to stderr and exits 0; a failure still leaves the text to read.
    return parseSsim(e?.stderr);
  }
}

/**
 * Did this encoding change the picture a viewer could see?
 * @param {string} a @param {string} b @param {{ ffmpeg?: string, timeoutMs?: number }} [o]
 * @returns {Promise<{ ssim: number | null, ok: boolean }>}
 */
export async function keepsQuality(a, b, o = {}) {
  const ssim = await ssimOf(a, b, o);
  return { ssim, ok: ssim !== null && ssim >= SSIM_LIMIT };
}
