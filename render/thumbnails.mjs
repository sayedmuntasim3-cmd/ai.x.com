/**
 * The three thumbnails of the S7 publishing pack (TH-A, TH-B, TH-C), for
 * YouTube's Test & Compare: a frame from the film's own footage (the scene
 * the brief names when it has a clip, otherwise a different clip each),
 * graded for contrast, with the brief's words large enough to read on a
 * phone. 1280×720 JPEG, under YouTube's 2 MB limit.
 */
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { run } from "./render-film.mjs";

/**
 * @typedef {{ id: string, words: string, image: string, scenes: string[] }} ThumbnailBrief
 * @typedef {import("../engine/src/timeline.mjs").Timeline} Timeline
 */

/**
 * Read the thumbnail table of S7 (rows "| TH-A | ... |").
 * @param {string} s7
 * @returns {ThumbnailBrief[]}
 */
export function thumbnailBriefs(s7) {
  const rows = s7.split("\n").filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
  const header = rows.find((r) => r.some((c) => /^words$/i.test(c)));
  const col = (/** @type {RegExp} */ re, /** @type {number} */ fallback) => { const i = header ? header.findIndex((c) => re.test(c)) : -1; return i >= 0 ? i : fallback; };
  const words = col(/^words$/i, 3);
  const image = col(/^image$/i, 2);
  const source = col(/^source$/i, 4);
  return rows.filter((r) => /^TH-[A-Z]$/.test(r[0] ?? "")).map((r) => ({
    id: r[0],
    words: (r[words] ?? "").replace(/^["“]|["”]$/g, "").trim(),
    image: r[image] ?? "",
    scenes: [...new Set(`${r[image] ?? ""} ${r[source] ?? ""}`.match(/\bSC\d{4,5}\b/g) ?? [])],
  })).filter((b) => b.words);
}

/**
 * @param {{ briefs: ThumbnailBrief[], timeline: Timeline, fetchClip: (url: string) => Promise<string>, outBase: string, font?: string, ffmpeg?: string }} o
 * @returns {Promise<{ id: string, file: string, frameFrom: string, bytes: number }[]>}
 */
export async function renderThumbnails(o) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const clips = o.timeline.video.filter((v) => v.type === "clip" && v.url);
  const used = new Set();
  const out = [];
  mkdirSync(join(o.outBase, ".."), { recursive: true });
  for (const [k, b] of o.briefs.entries()) {
    // The scene the brief names, else a clip no other thumbnail uses, spread across the film.
    let seg = clips.find((v) => b.scenes.includes(v.scene) && !used.has(v.url));
    if (!seg && clips.length) {
      const spread = clips.filter((v) => !used.has(v.url));
      seg = spread[Math.floor(((k + 0.5) / Math.max(1, o.briefs.length)) * spread.length)] ?? spread[0];
    }
    if (seg) used.add(seg.url);
    /** @type {string[]} */
    let input;
    let from = "card";
    if (seg?.url) {
      try {
        const file = await o.fetchClip(seg.url);
        input = ["-ss", String(Math.min(2, (seg.end - seg.start) / 2).toFixed(2)), "-i", file];
        from = seg.scene;
      } catch {
        input = ["-f", "lavfi", "-i", "color=c=0x0b110e:s=1280x720"];
      }
    } else {
      input = ["-f", "lavfi", "-i", "color=c=0x0b110e:s=1280x720"];
    }
    const textFile = `${o.outBase}.${b.id}.txt`;
    const lines = wrap(b.words.toUpperCase(), 14);
    writeFileSync(textFile, lines.join("\n"));
    const longest = Math.max(...lines.map((l) => l.length));
    const size = Math.round(Math.min(150, 1100 / Math.max(6, longest) * 1.7));
    const esc = (/** @type {string} */ p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
    const filter = [
      "scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,setsar=1",
      "eq=contrast=1.18:saturation=1.15:brightness=-0.03",
      "vignette=PI/3.5",
      o.font ? `drawtext=fontfile='${esc(o.font)}':textfile='${esc(textFile)}':fontcolor=0xFFD23F:fontsize=${size}:line_spacing=${Math.round(size * 0.12)}:borderw=${Math.round(size / 14)}:bordercolor=black:x=64:y=h-text_h-64` : "null",
    ].join(",");
    const file = `${o.outBase}.${b.id}.jpg`;
    await run(ffmpeg, ["-v", "error", "-y", ...input, "-frames:v", "1", "-vf", filter, "-q:v", "3", file + ".part.jpg"]);
    renameSync(file + ".part.jpg", file);
    out.push({ id: b.id, file, frameFrom: from, bytes: existsSync(file) ? statSync(file).size : 0 });
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
  return lines.slice(0, 3);
}
