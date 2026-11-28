#!/usr/bin/env node
/**
 * The runner's side of "My films" (engine/src/edit-pack.mjs, worker/voice-api.mjs):
 *
 *   # a finished film: write its edit pack (every shot's time, words and six free pictures)
 *   node render/edit-pack.mjs --run run --film-id <id> --out run/edit-pack.json
 *
 *   # a re-make: put the pack's picks back into the run folder with the swaps applied, and write
 *   # the parts that must be rendered again (only those; the rest of the picture is reused)
 *   node render/edit-pack.mjs --pack pack.json --swaps swaps.json --out run --plan plan.json
 *
 *   # the join: the changed parts' new picture + the untouched parts of the old film, sound kept
 *   node render/edit-pack.mjs --join --pack pack.json --old old.mp4 --parts parts --changed 2,5 --out out/film.mp4
 *
 *   # the voice of a re-make: the same recording through the film's own intake, pause tightening and
 *   # mastering, so the words' saved times still sit on the same audio
 *   node render/edit-pack.mjs --master-in in.mp3 --run run --space dry
 *
 * A swap replaces a picture inside a shot; the shot's length, the voice and the score do not change,
 * so the untouched parts are exactly the old film's own frames and the old film's sound still fits.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applySwaps, buildEditPack, changedParts, mediaFromPack } from "../engine/src/edit-pack.mjs";

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const o = {};
  for (let i = 1; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) { o._ = argv[i]; continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[argv[i].slice(2)] = true;
    else { o[argv[i].slice(2)] = next; i += 1; }
  }
  return o;
}

/** @param {string} file @returns {any} */
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null);

/**
 * The run folder's own files as one edit pack.
 * @param {string} dir @param {{ filmId?: string, parts?: number }} [o]
 */
export function packFromRun(dir, o = {}) {
  const chapters = readJson(join(dir, "s3-chapters.json")) ?? [{ id: "C1", title: "" }];
  const script = chapters.map((/** @type {any} */ c) => ({ id: String(c.id ?? "C1"), title: String(c.title ?? ""), markdown: existsSync(join(dir, `s5-${c.id ?? "C1"}.md`)) ? readFileSync(join(dir, `s5-${c.id ?? "C1"}.md`), "utf8") : "" })).filter((c) => c.markdown.trim());
  /** @type {any[]} */
  const mediaShots = [];
  /** @type {any[]} */
  const rankShots = [];
  for (const f of readdirSync(dir)) {
    if (/^media-.*\.json$/.test(f)) mediaShots.push(...(readJson(join(dir, f))?.shots ?? []));
    if (/^rank-.*\.json$/.test(f)) rankShots.push(...(readJson(join(dir, f))?.shots ?? []));
  }
  const words = readJson(join(dir, "words.json"))?.words ?? [];
  const shots = readJson(join(dir, "shots.json"))?.shots ?? [];
  const seconds = readJson(join(dir, "voice-report.json"))?.durationSeconds ?? null;
  return buildEditPack({
    filmId: o.filmId,
    seconds,
    parts: o.parts ?? 8,
    chapters: script,
    media: { shots: mediaShots },
    rank: { shots: rankShots },
    words,
    score: existsSync(join(dir, "s4.md")) ? readFileSync(join(dir, "s4.md"), "utf8") : null,
    shots: Array.isArray(shots) ? shots : [],
  });
}

/**
 * The run folder a re-make renders from: the pack's script, its words and its picks with the swaps
 * applied. The voice is mastered again from the saved recording by the workflow with the same settings.
 * @param {any} pack @param {{ shotId: string, pick: any }[]} swaps @param {string} dir
 */
export function writeRunFromPack(pack, swaps, dir) {
  const next = applySwaps(pack, swaps);
  mkdirSync(dir, { recursive: true });
  const chapters = Array.isArray(next.script) && next.script.length ? next.script : [{ id: "C1", title: "", markdown: "" }];
  for (const c of chapters) writeFileSync(join(dir, `s5-${c.id || "C1"}.md`), c.markdown);
  writeFileSync(join(dir, "s3-chapters.json"), JSON.stringify(chapters.map((/** @type {any} */ c) => ({ id: c.id || "C1", title: c.title ?? "" })), null, 1));
  const media = mediaFromPack(next);
  // The renderer loads one media file per chapter and looks its pictures up by scene#shot, so every
  // chapter file gets the film's rows (a scene id belongs to exactly one chapter).
  for (const c of chapters) writeFileSync(join(dir, `media-${c.id || "C1"}.json`), JSON.stringify(media, null, 1));
  const words = Array.isArray(next.words) ? next.words : [];
  writeFileSync(join(dir, "words.json"), JSON.stringify({ words, text: words.map((/** @type {any} */ w) => w.text).join(" "), source: "edit-pack" }, null, 1));
  if (typeof next.score === "string" && next.score.trim()) writeFileSync(join(dir, "s4.md"), next.score);
  return { pack: next, media };
}

/** @param {string} bin @param {string[]} args */
function run(bin, args) {
  const r = spawnSync(bin, args, { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`${bin} exited ${r.status}`);
}

/**
 * The re-make's film: each part is either a freshly rendered part or the old film's own stretch of
 * that part (parts meet on shot boundaries, so a cut at a boundary is exact and needs no re-encode).
 * @param {{ old: string, partsDir: string, pack: any, changed: number[], out: string }} o
 */
export function joinRemake(o) {
  const all = Array.isArray(o.pack?.parts) ? o.pack.parts : [];
  if (!all.length) throw new Error("The edit pack has no render parts.");
  const dir = `${o.out}.segments`;
  mkdirSync(dir, { recursive: true });
  /** @type {string[]} */
  const files = [];
  for (const part of all) {
    const n = Number(part.index) || 0;
    const fresh = join(o.partsDir, `part-${n}.mp4`);
    if (o.changed.includes(n)) {
      // A changed part that was not drawn must stop the re-make: quietly cutting the old picture in
      // would hand back a film that looks swapped and is not.
      if (!existsSync(fresh)) throw new Error(`Part ${n} was swapped but its new picture was not rendered (${fresh} is missing).`);
      files.push(fresh);
      continue;
    }
    const seg = join(dir, `part-${n}.mp4`);
    // The old film's own frames of this part, cut by frame number and drawn again (cheap: no filters, no
    // pictures): a stream copy can only start on a keyframe, and the real film's keyframes sit on shot
    // starts a frame or two away from the plan's times, which loses or doubles frames and shifts every part after it.
    const fps = Number(o.pack?.fps) || 30;
    const first = Math.round((Number(part.start) || 0) * fps);
    const last = Math.max(first + 1, Math.round((Number(part.end) || 0) * fps));
    run("ffmpeg", ["-v", "error", "-y", "-ss", (first / fps).toFixed(6), "-i", o.old, "-frames:v", String(last - first), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(fps), "-video_track_timescale", "90000", seg]);
    files.push(seg);
  }
  const list = join(dir, "parts.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n") + "\n");
  const picture = join(dir, "picture.mp4");
  run("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c", "copy", picture]);
  // The sound is the old film's own mix: no shot's length changed, so it still fits the new picture.
  // The release gate measures the joined film again, as it does for a first cut.
  run("ffmpeg", ["-v", "error", "-y", "-i", picture, "-i", o.old, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart", o.out]);
  return { out: o.out, parts: all.length, reused: all.length - o.changed.length, rendered: o.changed.length };
}

async function main() {
  const a = parseArgs(process.argv);
  if (typeof a["master-in"] === "string") {
    // The film's own voice path, without speech-to-text or the brain: intake, the same pause
    // tightening, the same mastering. The pack's words were timed on exactly this audio.
    const { intake, master, tightenRecording } = await import("../local/voice-film.mjs");
    const out = String(a.run ?? "run");
    const step1 = await intake({ audio: a["master-in"], out });
    if (!step1.ok || !step1.report) throw new Error("The recording could not be read.");
    let voice = a["master-in"];
    const tightened = await tightenRecording({ out, analysisWav: step1.analysisWav, sttWav: /** @type {string} */ (step1.sttWav), kind: "narration" });
    if (tightened) voice = tightened.file;
    const done = await master({ audio: voice, out, kind: "narration", space: typeof a.space === "string" ? a.space : "dry", log: (line) => console.log(line) });
    if (!done.ok) throw new Error(done.blocked ?? "Mastering failed its own checks; see the report.");
    console.log(`Mastered voice: ${done.file} (use it as --one-track for the film)`);
    return;
  }
  if (a.join) {
    const pack = readJson(String(a.pack));
    const changed = String(a.changed ?? "").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
    const done = joinRemake({ old: String(a.old), partsDir: String(a.parts ?? "parts"), pack, changed, out: String(a.out) });
    console.log(`remake joined: ${done.rendered} part(s) rendered again, ${done.reused} reused; ${done.out}`);
    return;
  }
  if (typeof a.pack === "string") {
    const pack = readJson(a.pack);
    const swaps = readJson(String(a.swaps ?? ""))?.swaps ?? [];
    const plan = changedParts(pack, swaps);
    writeRunFromPack(pack, swaps, String(a.out ?? "run"));
    writeFileSync(String(a.plan ?? "plan.json"), JSON.stringify({ ...plan, swaps: swaps.map((/** @type {any} */ s) => s.shotId) }, null, 1));
    console.log(`re-make plan: ${swaps.length} swap(s) in part(s) ${plan.changed.join(", ") || "none"}; ${plan.kept.length} part(s) kept`);
    return;
  }
  const pack = packFromRun(String(a.run ?? "run"), { filmId: typeof a["film-id"] === "string" ? a["film-id"] : undefined, parts: Number(a.parts) || 8 });
  writeFileSync(String(a.out ?? "run/edit-pack.json"), JSON.stringify(pack, null, 1));
  console.log(`edit pack: ${pack.shots.length} shots, ${pack.shots.reduce((n, s) => n + s.candidates.length, 0)} candidate(s), ${pack.script.length} chapter(s)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  });
}
