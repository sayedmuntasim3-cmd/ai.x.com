/**
 * The Shorts and the Facebook cut of the S7 publishing pack, cut from the
 * rendered film: each brief's exact time range, rebuilt vertical (9:16 for
 * Shorts, 4:5 for Facebook) with the full frame centred over a blurred fill,
 * its own hook on screen for the first seconds, and the film's captions
 * burned in large, so it works with the sound off.
 */
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { toSeconds } from "../engine/src/scene-lines.mjs";
import { toSrt } from "../engine/src/timeline.mjs";
import { run } from "./render-film.mjs";

/**
 * @typedef {{ id: string, start: number, end: number, width: number, height: number, hook: string }} CutBrief
 * @typedef {import("../engine/src/timeline.mjs").Caption} Caption
 */

/** Longest cut made; YouTube Shorts take up to three minutes. */
export const MAX_CUT_SECONDS = 180;

/**
 * Read the Shorts / Facebook table of S7 (rows "| SH-01 | 9:16 ... | 0:00:00–0:00:58 ... | "hook" | ... |").
 * @param {string} s7
 * @returns {CutBrief[]}
 */
export function cutBriefs(s7) {
  /** @type {CutBrief[]} */
  const out = [];
  for (const line of s7.split("\n")) {
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (!/^(SH|FB)-\d{1,2}$/.test(cells[0] ?? "")) continue;
    const range = /(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*[–-]\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/.exec(cells.slice(1).join(" | "));
    if (!range) continue;
    const start = toSeconds(range[1]);
    const end = Math.min(toSeconds(range[2]), start + MAX_CUT_SECONDS);
    if (!(end > start)) continue;
    const format = cells[1] ?? "";
    const square = /\b1:1\b/.test(format) && !/4:5/.test(format);
    const [width, height] = /9:16/.test(format) || cells[0].startsWith("SH") ? [1080, 1920] : square ? [1080, 1080] : [1080, 1350];
    const hookCell = cells.find((c, i) => i > 1 && /["“]/.test(c)) ?? "";
    out.push({ id: cells[0], start, end, width, height, hook: /["“]([^"”]{2,120})["”]/.exec(hookCell)?.[1]?.trim() ?? "" });
  }
  return out;
}

/**
 * The captions inside [start, end), shifted to start at zero.
 * @param {Caption[]} captions @param {number} start @param {number} end
 */
export function captionsFor(captions, start, end) {
  return captions.filter((c) => c.end > start && c.start < end).map((c) => ({ start: Math.max(0, c.start - start), end: Math.min(end, c.end) - start, text: c.text }));
}

/**
 * @param {{ film: string, briefs: CutBrief[], captions: Caption[], outBase: string, workDir?: string, font?: string, ffmpeg?: string }} o
 * @returns {Promise<{ id: string, file: string, seconds: number, width: number, height: number }[]>}
 */
export async function renderCuts(o) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const esc = (/** @type {string} */ p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  const out = [];
  for (const b of o.briefs) {
    const seconds = b.end - b.start;
    const srt = `${o.outBase}.${b.id}.srt`;
    writeFileSync(srt, toSrt(captionsFor(o.captions, b.start, b.end)));
    const hookFile = o.workDir ? join(o.workDir, `cut.${b.id}.hook.txt`) : `${o.outBase}.${b.id}.hook.txt`;
    writeFileSync(hookFile, wrap(b.hook, 22).join("\n"));
    const W = b.width;
    const H = b.height;
    const size = Math.round(W * 0.075);
    // SRT captions are drawn in a 288-line script space, so size and margin are shares of the frame height.
    const subSize = Math.round(288 * (H / W >= 1.5 ? 0.034 : 0.045));
    const graph = [
      `[0:v]split[a][b]`,
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.18[bg]`,
      `[b]scale=${W}:-2[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1` +
        (b.hook && o.font ? `,drawtext=fontfile='${esc(o.font)}':textfile='${esc(hookFile)}':text_align=C:fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size * 0.15)}:borderw=${Math.round(size / 12)}:bordercolor=black:x=(w-text_w)/2:y=h*0.1:enable='lt(t,3.5)'` : "") +
        `,subtitles='${esc(srt)}':force_style='FontName=DejaVu Sans,Bold=1,Fontsize=${subSize},PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,Alignment=2,MarginV=${Math.round(288 * 0.14)}'[v]`,
    ].join(";");
    const file = `${o.outBase}.${b.id}.mp4`;
    const args = (/** @type {string} */ g) => ["-v", "error", "-y", "-ss", b.start.toFixed(3), "-t", seconds.toFixed(3), "-i", o.film, "-filter_complex", g, "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", "8000k", "-bufsize", "16000k", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", file + ".part.mp4"];
    // Centred hook lines need ffmpeg 6.1+; older builds get the block centred instead.
    try { await run(ffmpeg, args(graph)); } catch { await run(ffmpeg, args(graph.replace(":text_align=C", ""))); }
    renameSync(file + ".part.mp4", file);
    out.push({ id: b.id, file, seconds, width: W, height: H });
  }
  return out;
}

/** @param {string} text @param {number} n */
function wrap(text, n) {
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > n) { lines.push(line); line = w; } else line = line ? line + " " + w : w;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}
