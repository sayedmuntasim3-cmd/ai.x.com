/**
 * A Short or Reel from a finished recitation run, cut on sure ayah ends:
 *   node local/quran-short.mjs --run <folder> [--passage 12:4-6] [--out <folder>] [--list]
 * Without --passage the passage closest to 35 s is taken. The new folder holds
 * the sliced voice (mastered and the 16 kHz copy), shots, media, plan and
 * location; render it with render/quran-render.mjs --format 9:16 like any run.
 * A passage that does not start and end on sure ayah ends is refused.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { shortPassages, sliceTimeline } from "../engine/src/quran-short.mjs";
import { parseArgs } from "./voice-film.mjs";

const run = promisify(execFile);
/** @param {string} f */
const readJson = (f) => readFile(f, "utf8").then((t) => JSON.parse(t));

/** Cut a sound file between two times, exactly (no fade: the cuts sit in pauses). @param {string} input @param {string} out @param {number} from @param {number} to */
async function cutAudio(input, out, from, to) {
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-ss", String(from), "-to", String(to), "-c:a", input.endsWith(".wav") ? "pcm_s16le" : "copy", out]);
}

/**
 * @param {{ run: string, passage?: string, out?: string }} o
 */
export async function makeShort(o) {
  const dir = resolve(o.run);
  const location = await readJson(join(dir, "quran-location.json"));
  const report = await readJson(join(dir, "voice-report.json"));
  const options = shortPassages(location, report.durationSeconds);
  if (!options.length) return { ok: false, why: "No passage of 20-60 s starts and ends on sure ayah ends: the timing must be confirmed first.", options };
  let pick = options[0];
  if (o.passage) {
    const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(o.passage);
    const found = m && options.find((p) => p.surah === Number(m[1]) && p.fromAyah === Number(m[2]) && p.toAyah === Number(m[3] ?? m[2]));
    if (!found) return { ok: false, why: `${o.passage} cannot be cut on sure ayah ends within 20-60 s.`, options };
    pick = found;
  }
  const name = `short-${pick.surah}-${pick.fromAyah}-${pick.toAyah}`;
  const out = resolve(o.out ?? join(dir, name));
  await mkdir(join(out, "master"), { recursive: true });
  const { cutIn, cutOut } = pick;
  // The voice: the mastered file (the film's sound) and the 16 kHz copy (the audits' reference for pauses).
  for (const f of (await readdir(join(dir, "master"))).filter((x) => x.endsWith(".wav"))) await cutAudio(join(dir, "master", f), join(out, "master", f), cutIn, cutOut);
  await cutAudio(join(dir, "voice-16k.wav"), join(out, "voice-16k.wav"), cutIn, cutOut);
  await writeFile(join(out, "voice-report.json"), JSON.stringify({ ...report, durationSeconds: cutOut - cutIn, short: { from: dir, ...pick } }, null, 1));
  // The plan, the shots and the location, moved to start at zero.
  const understanding = await readJson(join(dir, "understanding.json"));
  const plan = understanding.quranPlan;
  plan.scenes = sliceTimeline(plan.scenes.filter((/** @type {any} */ s) => s.kind === "ayah"), cutIn, cutOut, ["spokenStart", "spokenEnd"]);
  plan.captions = sliceTimeline(plan.captions ?? [], cutIn, cutOut);
  plan.totalSeconds = cutOut - cutIn;
  await writeFile(join(out, "understanding.json"), JSON.stringify({ ...understanding, quranPlan: plan, short: pick }, null, 1));
  const shots = await readJson(join(dir, "shots.json"));
  shots.shots = sliceTimeline(shots.shots, cutIn, cutOut);
  shots.shots[0].transitionIn = { type: "fade-from-black", seconds: 1 };
  await writeFile(join(out, "shots.json"), JSON.stringify(shots, null, 1));
  const keep = new Set(shots.shots.map((/** @type {any} */ s) => s.id));
  try { const media = await readJson(join(dir, "media.json")); media.shots = media.shots.filter((/** @type {any} */ s) => keep.has(s.shot)); await writeFile(join(out, "media.json"), JSON.stringify(media, null, 1)); } catch { /* no media yet */ }
  location.ayat = sliceTimeline(location.ayat.filter((/** @type {any} */ a) => a.end > cutIn && a.start < cutOut), cutIn, cutOut);
  await writeFile(join(out, "quran-location.json"), JSON.stringify({ ...location, short: pick }, null, 1));
  return { ok: true, out, passage: pick, options: options.length };
}

async function main() {
  const a = /** @type {Record<string, any>} */ (parseArgs(process.argv.slice(2)));
  if (typeof a.run !== "string") { console.error("Usage: node local/quran-short.mjs --run <folder> [--passage 12:4-6] [--list]"); process.exit(2); }
  if (a.list === true) {
    const location = await readJson(join(resolve(a.run), "quran-location.json"));
    const report = await readJson(join(resolve(a.run), "voice-report.json"));
    for (const p of shortPassages(location, report.durationSeconds)) console.log(`${p.surah}:${p.fromAyah}-${p.toAyah}  ${p.seconds.toFixed(1)} s  (${p.cutIn.toFixed(2)}-${p.cutOut.toFixed(2)})`);
    return;
  }
  const r = await makeShort({ run: a.run, passage: typeof a.passage === "string" ? a.passage : undefined, out: typeof a.out === "string" ? a.out : undefined });
  console.log("QURAN-SHORT " + JSON.stringify(r));
  if (!r.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
