/**
 * Placing the creator's own photos and clips on the shots their words match.
 *
 * The runner downloads the files the creator added to a voice film (R2
 * voice/<id>/own/, render/voice-runner.mjs `own`) into one folder, and this
 * module decides which shot each file belongs on: the eyes (OpenCLIP, the same
 * model and cache as render/asset-rank) embed every own file and every shot's
 * own sentence, and placeOwnMedia (render/own-pictures.mjs) does the matching.
 * Nothing here guesses: a file whose best match is below the floor is not
 * placed, and the return says so.
 *
 *   node render/own-place.mjs --pictures run/own --run run [--words run/words.json] [--python python3]
 *
 * The decision is written next to the files as placement.json, which
 * render/render-film.mjs reads in its --pictures path (applyOwnPictures), so
 * the render parts never need the model and every part places the same files
 * on the same shots.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { shotSentence } from "./asset-rank/rerank.mjs";
import { OWN_MEDIA_LICENCE, OWN_MEDIA_MATCH_FLOOR, ownPictureFolder, placeOwnMedia } from "./own-pictures.mjs";

const run = promisify(execFile);

/** The shot types that show a searched picture or clip (a designed card is drawn, never a photo). */
export const PICTURE_SHOT_TYPES = Object.freeze(["live-video", "archival-video", "photo-2.5D", "photo-designed"]);
/** The file the placement decision is written as, inside the pictures folder. */
export const PLACEMENT_FILE = "placement.json";
/** A file the runner downloaded from R2: own-<n>.<ext> (one per file the creator added). */
const OWN_FILE = /^own-(\d{1,3})\.([a-z0-9]{2,5})$/i;
const IMAGE_EXT = /^(jpe?g|png|webp)$/i;
const VIDEO_EXT = /^(mp4|mov|m4v|webm|mkv)$/i;

/**
 * The picture shots of the film's plan (run/shots.json), each with the words heard over it. A designed
 * card (rung R1, a title, a quote) is left out: the creator's photo replaces a picture, not a card.
 * @param {any} plan @param {{ text: string, start: number, end: number }[]} words
 * @returns {{ id: string, text: string, start: number, end: number }[]}
 */
export function planShots(plan, words = []) {
  const list = Array.isArray(plan?.shots) ? plan.shots : [];
  /** @type {{ id: string, text: string, start: number, end: number }[]} */
  const out = [];
  for (const s of list) {
    if (!s?.id || s?.rung === "R1") continue;
    if (s?.type && !PICTURE_SHOT_TYPES.includes(String(s.type))) continue;
    const start = Number(s.start);
    const end = Number(s.end);
    const heard = Array.isArray(words) && words.length && Number.isFinite(start) && Number.isFinite(end) ? shotSentence(words, start, end) : { heard: "", sentence: "" };
    // The words heard over this shot are the honest text to match a picture against (the wider sentence is
    // context for a search, and would pull a neighbour shot's subject in); a very short line borrows it.
    const own = String(heard.heard ?? "").trim();
    const wide = String(heard.sentence ?? "").trim();
    const text = String((own.split(/\s+/).filter(Boolean).length >= 3 ? own : wide || own) || s.subject || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ id: String(s.id), text, start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : 0 });
  }
  return out;
}

/**
 * The files the runner downloaded, as own-1.jpg ... (a file already named after a shot, SC0012-1.jpg,
 * is the owner's committed picture and is left to ownPictureFolder).
 * @param {string | undefined} dir
 * @returns {{ file: string, kind: "image" | "video", index: number }[]}
 */
export function ownFilesIn(dir) {
  /** @type {{ file: string, kind: "image" | "video", index: number }[]} */
  const out = [];
  if (!dir || !existsSync(dir)) return out;
  for (const f of readdirSync(dir).sort()) {
    const m = OWN_FILE.exec(f);
    if (!m) continue;
    const ext = m[2].toLowerCase();
    const kind = IMAGE_EXT.test(ext) ? "image" : VIDEO_EXT.test(ext) ? "video" : null;
    if (kind && statSync(join(dir, f)).size > 0) out.push({ file: f, kind, index: Number(m[1]) });
  }
  return out;
}

/** The placement decided for this pictures folder, or [] when the runner has not decided one. @param {string | undefined} dir */
export function readOwnPlacement(dir) {
  if (!dir) return [];
  const file = join(dir, PLACEMENT_FILE);
  if (!existsSync(file)) return [];
  try {
    const got = JSON.parse(readFileSync(file, "utf8"));
    const placed = Array.isArray(got?.placed) ? got.placed : [];
    return placed
      .filter((/** @type {any} */ p) => p && typeof p.shotId === "string" && typeof p.file === "string")
      .map((/** @type {any} */ p) => ({ shotId: p.shotId, file: p.file, kind: p.kind === "video" ? "video" : "image", score: Number(p.score) || 0, licence: String(p.licence ?? OWN_MEDIA_LICENCE) }));
  } catch {
    return [];
  }
}

/**
 * The pictures folder the render reads (the same shape ownPictureFolder gives, one entry per shot), from the
 * placement decision. A file named after a shot is the owner's committed picture and wins over this.
 * @param {string} dir
 * @returns {{ shots: Record<string, { file: string, kind: "image" | "video", licence: string }>, notes: string[] }}
 */
export function placementFolder(dir) {
  /** @type {Record<string, { file: string, kind: "image" | "video", licence: string }>} */
  const shots = {};
  /** @type {string[]} */
  const notes = [];
  for (const p of readOwnPlacement(dir)) {
    const path = join(dir, p.file);
    if (!existsSync(path)) { notes.push(`own media: ${p.file} is named in placement.json but is not in ${dir}; it was not used.`); continue; }
    shots[p.shotId] = { file: path, kind: p.kind, licence: p.licence };
  }
  return { shots, notes };
}

/**
 * A still of a clip, so the eyes can look at it: the frame 1 s in (CLIP reads pictures, and a clip's
 * first frame is often black). null when ffmpeg is not on this machine.
 * @param {string} file @param {string} into
 */
async function clipStill(file, into) {
  const out = join(into, "still.jpg");
  try {
    await run("ffmpeg", ["-v", "error", "-y", "-ss", "1", "-i", file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", out], { timeout: 120_000 });
  } catch {
    try {
      await run("ffmpeg", ["-v", "error", "-y", "-i", file, "-frames:v", "1", "-vf", "scale=512:-2", "-q:v", "4", out], { timeout: 120_000 });
    } catch {
      return null;
    }
  }
  return existsSync(out) && statSync(out).size > 0 ? out : null;
}

/**
 * The OpenCLIP embeddings of the own files and of the shot sentences, from the eyes (render/asset-rank/rank.py,
 * the same model and cache as the picture ranking). Real vectors, never invented: a file the eyes could not
 * read (an odd mode, an unreadable clip) simply has none and is not placed.
 * @param {{ dir: string, files: { file: string, kind: "image" | "video" }[], texts: string[], python?: string, cache?: string, timeoutMs?: number, log?: (line: string) => void }} o
 * @returns {Promise<{ images: Record<string, number[] | null>, texts: (number[] | null)[], seconds: number }>}
 */
export async function clipEmbeddings(o) {
  const python = o.python ?? process.env.ZUPONA_RANK_PYTHON ?? process.env.ZUPONA_PYTHON ?? "python3";
  const cache = o.cache ?? process.env.ZUPONA_RANK_CACHE ?? join(homedir(), ".cache", "zupona", "asset-rank");
  mkdirSync(cache, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), "zupona-own-"));
  try {
    /** @type {{ id: string, url: string }[]} */
    const images = [];
    for (const [i, f] of o.files.entries()) {
      const id = `own-${i + 1}`;
      const path = resolve(o.dir, f.file);
      if (f.kind === "image") { images.push({ id, url: pathToFileURL(path).href }); continue; }
      const still = await clipStill(path, work);
      if (still) images.push({ id, url: pathToFileURL(still).href });
      else o.log?.(`own media: ${f.file} has no still to look at (is ffmpeg installed?), so it was not scored.`);
    }
    if (!images.length) return { images: {}, texts: [], seconds: 0 };
    const reqFile = join(work, "req.json");
    const ansFile = join(work, "ans.json");
    writeFileSync(reqFile, JSON.stringify({ texts: o.texts, images, cache, vectors: true, budget_seconds: 240, fetch_budget_seconds: 60 }));
    const script = new URL("./asset-rank/rank.py", import.meta.url).pathname;
    const t0 = Date.now();
    await run(python, [script, "score", reqFile, ansFile], { maxBuffer: 1 << 26, timeout: o.timeoutMs ?? 900_000 });
    if (!existsSync(ansFile)) throw new Error("the eyes wrote no answer");
    const ans = JSON.parse(readFileSync(ansFile, "utf8"));
    // The ids follow the position in `files` (own-1 is the first file), so a clip with no still simply has none.
    /** @type {Record<string, number[] | null>} */
    const got = {};
    for (const [i, f] of o.files.entries()) {
      const v = ans?.vectors?.[`own-${i + 1}`];
      got[f.file] = Array.isArray(v) && v.length ? v : null;
    }
    const texts = o.texts.map((_, i) => (Array.isArray(ans?.textVectors?.[i]) && ans.textVectors[i].length ? ans.textVectors[i] : null));
    return { images: got, texts, seconds: Math.round((Date.now() - t0) / 100) / 10 };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/**
 * Decide which shot each own file belongs on, and write it as placement.json in the pictures folder.
 * A file whose best match is under the floor is not placed; the same file never sits on two shots in a
 * row; every file that matches somewhere is used at least once (placeOwnMedia, render/own-pictures.mjs).
 * @param {{ dir: string, plan?: any, words?: any[], python?: string, cache?: string, log?: (line: string) => void, embed?: typeof clipEmbeddings }} o
 * @returns {Promise<{ shots: Record<string, { file: string, kind: "image" | "video", licence: string, score: number }>, placed: { shotId: string, file: string, kind: string, score: number }[], notes: string[], seconds: number }>}
 */
export async function placeOwnFolder(o) {
  /** @type {string[]} */
  const notes = [];
  const files = ownFilesIn(o.dir);
  if (!files.length) return { shots: {}, placed: [], notes, seconds: 0 };
  const shots = planShots(o.plan, o.words ?? []);
  if (!shots.length) {
    notes.push(`own media: this film's shots name no words to match, so the ${files.length} file(s) the creator added were not placed.`);
    return { shots: {}, placed: [], notes, seconds: 0 };
  }
  let emb;
  try {
    emb = await (o.embed ?? clipEmbeddings)({ dir: o.dir, files, texts: shots.map((s) => s.text), python: o.python, cache: o.cache, log: o.log });
  } catch (e) {
    notes.push(`own media: the eyes could not look at the creator's files (${String(e instanceof Error ? e.message : e).slice(0, 240)}), so they were not placed.`);
    return { shots: {}, placed: [], notes, seconds: 0 };
  }
  const known = files.filter((f) => Array.isArray(emb.images[f.file]) && emb.images[f.file]?.length);
  const missing = files.filter((f) => !known.includes(f));
  for (const f of missing) notes.push(`own media: ${f.file} could not be read, so it was not placed.`);
  if (!known.length || !emb.texts.some(Boolean)) {
    notes.push("own media: the eyes gave no embeddings for the creator's files or the shots, so nothing was placed.");
    return { shots: {}, placed: [], notes, seconds: emb.seconds };
  }
  const result = placeOwnMedia(
    shots.map((s, i) => ({ id: s.id, embedding: emb.texts[i] ?? null })),
    known.map((f) => ({ id: f.file, embedding: emb.images[f.file] ?? null })),
    { floor: OWN_MEDIA_MATCH_FLOOR },
  );
  /** @type {Record<string, { file: string, kind: "image" | "video", licence: string, score: number }>} */
  const byId = {};
  /** @type {{ shotId: string, file: string, kind: string, score: number }[]} */
  const placed = [];
  for (const a of result.assignments) {
    const f = known.find((x) => x.file === a.ownId);
    if (!f) continue;
    byId[a.shotId] = { file: f.file, kind: f.kind, licence: OWN_MEDIA_LICENCE, score: a.score };
    placed.push({ shotId: a.shotId, file: f.file, kind: f.kind, score: a.score });
  }
  for (const f of known) {
    if (!placed.some((p) => p.file === f.file)) notes.push(`own media: ${f.file} matches no shot above the floor (${OWN_MEDIA_MATCH_FLOOR}), so no shot uses it.`);
  }
  if (placed.length) notes.push(`${placed.length} shot${placed.length > 1 ? "s use" : " uses"} the creator's own media: ${placed.map((p) => `${p.shotId} ← ${p.file}`).join(", ")}.`);
  mkdirSync(o.dir, { recursive: true });
  writeFileSync(join(o.dir, PLACEMENT_FILE), JSON.stringify({ at: new Date().toISOString(), floor: OWN_MEDIA_MATCH_FLOOR, seconds: emb.seconds, placed }, null, 1));
  return { shots: byId, placed, notes, seconds: emb.seconds };
}

async function main() {
  /** @type {Record<string, string | boolean>} */
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) if (argv[i].startsWith("--")) a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  if (typeof a.pictures !== "string" || typeof a.run !== "string") {
    console.error("Usage: node render/own-place.mjs --pictures <folder with the creator's files> --run <run folder> [--words <words.json>] [--python <python with open_clip>]");
    process.exit(2);
  }
  const readJson = (/** @type {string} */ f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);
  const plan = readJson(join(a.run, "shots.json"));
  const words = readJson(typeof a.words === "string" ? a.words : join(a.run, "words.json"))?.words ?? [];
  const got = await placeOwnFolder({
    dir: a.pictures,
    plan,
    words,
    python: typeof a.python === "string" ? a.python : undefined,
    log: (line) => console.log(line),
  });
  for (const n of got.notes) console.log(n);
  console.log(`own media: ${got.placed.length} placed in ${got.seconds} s${got.placed.length ? ` (${got.placed.map((p) => `${p.shotId} ← ${p.file}`).join(", ")})` : ""}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1); });
