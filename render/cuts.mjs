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
  const shift = (/** @type {number} */ t) => Math.round((Math.min(end, Math.max(start, t)) - start) * 1000) / 1000;
  return captions.filter((c) => c.end > start && c.start < end).map((c) => ({
    start: shift(c.start), end: shift(c.end), text: c.text,
    ...(c.words ? { words: c.words.filter((w) => w.end > start && w.start < end).map((w) => ({ text: w.text, start: shift(w.start), end: shift(w.end) })) } : {}),
  }));
}

/**
 * Word-by-word captions in ASS (libass): each line stays up while it is
 * spoken and the word being said lights up, the style viral Shorts use so
 * they work with the sound off. Sizes are in the frame's own pixels.
 * @param {Caption[]} captions @param {{ width: number, height: number, font?: string }} frame
 */
export function toAss(captions, frame) {
  const { width: W, height: H } = frame;
  const size = Math.round(H * (H / W >= 1.5 ? 0.036 : 0.045));
  const time = (/** @type {number} */ t) => {
    const cs = Math.max(0, Math.round(t * 100));
    return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };
  // Braces and backslashes would start ASS override codes; they never come from narration, but are neutralised anyway.
  const clean = (/** @type {string} */ t) => t.replace(/[{}]/g, "").replace(/\\/g, "/");
  const HIGHLIGHT = "&H0000D7FF&"; // ASS colours are BGR: this is #FFD700
  /** @type {string[]} */
  const events = [];
  for (const c of captions) {
    const words = c.words?.length ? c.words : [{ text: c.text, start: c.start, end: c.end }];
    words.forEach((w, i) => {
      const from = i === 0 ? c.start : w.start;
      const to = i + 1 < words.length ? words[i + 1].start : c.end;
      if (!(to > from)) return;
      const line = words.map((x, k) => (k === i && words.length > 1 ? `{\\c${HIGHLIGHT}}${clean(x.text)}{\\c&H00FFFFFF&}` : clean(x.text))).join(" ");
      events.push(`Dialogue: 0,${time(from)},${time(to)},Cap,,0,0,0,,${line}`);
    });
  }
  return [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Cap,${frame.font ?? "DejaVu Sans"},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(size / 14))},2,2,${Math.round(W * 0.07)},${Math.round(W * 0.07)},${Math.round(H * 0.14)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
    "",
  ].join("\n");
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
    const own = captionsFor(o.captions, b.start, b.end);
    writeFileSync(srt, toSrt(own));
    const ass = o.workDir ? join(o.workDir, `cut.${b.id}.ass`) : `${o.outBase}.${b.id}.ass`;
    const hookFile = o.workDir ? join(o.workDir, `cut.${b.id}.hook.txt`) : `${o.outBase}.${b.id}.hook.txt`;
    writeFileSync(hookFile, wrap(b.hook, 22).join("\n"));
    const W = b.width;
    const H = b.height;
    const size = Math.round(W * 0.075);
    writeFileSync(ass, toAss(own, { width: W, height: H }));
    const graph = [
      `[0:v]split[a][b]`,
      `[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.18[bg]`,
      `[b]scale=${W}:-2[fg]`,
      `[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1` +
        (b.hook && o.font ? `,drawtext=fontfile='${esc(o.font)}':textfile='${esc(hookFile)}':text_align=C:fontcolor=white:fontsize=${size}:line_spacing=${Math.round(size * 0.15)}:borderw=${Math.round(size / 12)}:bordercolor=black:x=(w-text_w)/2:y=h*0.1:enable='lt(t,3.5)'` : "") +
        `,subtitles='${esc(ass)}'[v]`,
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
