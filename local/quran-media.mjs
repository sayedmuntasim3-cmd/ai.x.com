/**
 * Licensed media for every shot of a recitation film's shot list:
 *   node local/quran-media.mjs --run <voice-film output folder> [--adab strict|nature|people-distant]
 *        [--detect <python with opencv-python-headless>] [--clip] [--reciter "name"]
 * Reads shots.json; searches the keyless archives (Wikimedia Commons, NASA,
 * Openverse) and Pexels / Pixabay when their free keys are set in the
 * environment (PEXELS_API_KEY, PIXABAY_API_KEY; never printed). Video first,
 * then photographs. With --detect, each chosen asset's frames go through
 * local/media/detect.py (faces, people) and a flagged one is replaced.
 * Saved: media.json (every shot: the asset or the gap, and every refusal
 * with its reason), media.md, manifest.json, credits.txt. Downloads nothing
 * but what the detector needs to look at.
 */
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { mediaProviders, verifyArchiveItem } from "../engine/src/film-media.mjs";
import { creditsText, findQuranMedia, mediaTable } from "../engine/src/quran-media.mjs";
import { parseArgs } from "./voice-film.mjs";

const run = promisify(execFile);

/** Bits that differ between two 64-bit difference hashes. @param {string} a @param {string} b */
export function hamming(a, b) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** The rules the frame check applies, measured on labelled sets (docs/QURAN_DOCUMENTARY.md). */
export const VISUAL_RULES = Object.freeze({ notPhotograph: 0.2, nearDuplicateBits: 6 });

/**
 * Reasons from one detect.py result, or null when the frames pass.
 * @param {{ frames: number, faces: number, people: number, look?: any, sideways?: boolean, dhash?: string[] }} item @param {string[]} usedHashes
 */
export function frameVerdict(item, usedHashes = []) {
  if (!item.frames) return "detector: no frame could be read, so it was not checked";
  if (item.faces || item.people) return `detector: ${item.faces} face(s), ${item.people} person(s) in ${item.frames} frame(s)`;
  if (item.look) {
    const art = item.look.painting + item.look.drawing + item.look.rendering;
    if (art >= VISUAL_RULES.notPhotograph) return `visual: looks like a painting, drawing or rendering (${Math.round(art * 100)}%), not a photograph`;
  }
  if (item.sideways) return "orientation: the picture seems to be stored on its side (its sky is at a side)";
  for (const h of item.dhash ?? []) for (const u of usedHashes) if (hamming(h, u) <= VISUAL_RULES.nearDuplicateBits) return "duplicate: nearly the same picture is already in the film";
  return null;
}

/**
 * A frame check through local/media/detect.py: faces and people, painting or
 * photograph, orientation, near-duplicates of what the film already uses.
 * @param {string} python @param {{ clip?: boolean }} [o]
 * @returns {(r: import("../engine/src/documentary-media-fetch.mjs").MediaResult, query?: string) => Promise<string | null>}
 */
export function detector(python, o = {}) {
  const script = new URL("./media/detect.py", import.meta.url).pathname;
  /** @type {string[]} */
  const used = [];
  return async (r, query) => {
    // The file that will be used (Commons refuses thumbnail sizes it does not list, so not the preview).
    const target = r.mediaUrl ?? r.previewUrl;
    if (!target) return null;
    try {
      const args = ["-I", script, target, "--frames", "5", ...(o.clip ? ["--clip", ...(query ? ["--query", query] : [])] : [])];
      const { stdout } = await run(python, args, { maxBuffer: 1 << 22, timeout: 600_000 });
      const item = JSON.parse(stdout).items[0];
      const why = frameVerdict(item, used);
      // A passed picture's hashes join the film, so a near-copy later is refused.
      if (!why) used.push(...(item.dhash ?? []));
      return why;
    } catch (e) {
      // A frame that cannot be read is not passed as clean.
      return "detector: the frames could not be checked (" + String(/** @type {Error} */ (e).message).split("\n")[0].slice(0, 80) + ")";
    }
  };
}

async function main() {
  const args = /** @type {Record<string, any>} */ (parseArgs(process.argv.slice(2)));
  if (typeof args.run !== "string") { console.error("Usage: node local/quran-media.mjs --run <folder with shots.json> [--adab strict] [--detect python3]"); process.exit(2); }
  const dir = resolve(args.run);
  const direction = JSON.parse(await readFile(join(dir, "shots.json"), "utf8"));
  const adab = ["strict", "nature", "people-distant"].includes(String(args.adab)) ? args.adab : direction.adab ?? "strict";
  const providers = mediaProviders({ pexelsKey: process.env.PEXELS_API_KEY || undefined, pixabayKey: process.env.PIXABAY_API_KEY || undefined });
  const m = await findQuranMedia({ shots: direction.shots, providers, adab, verify: verifyArchiveItem, inspect: typeof args.detect === "string" ? detector(args.detect, { clip: args.clip === true }) : undefined, log: (l) => console.error("  " + l) });
  await writeFile(join(dir, "media.json"), JSON.stringify(m, null, 1));
  await writeFile(join(dir, "manifest.json"), JSON.stringify(m.manifest, null, 1));
  await writeFile(join(dir, "media.md"), mediaTable(m) + "\n");
  await writeFile(join(dir, "credits.txt"), creditsText(m.manifest, { reciter: typeof args.reciter === "string" ? args.reciter : undefined }) + "\n");
  const lang = args.lang === "bn" ? "bn" : "en";
  for (const x of m.messages) console.log("- " + x[lang]);
  /** @type {Record<string, number>} */
  const refused = {};
  for (const s of m.shots) for (const r of s.rejected) { const k = r.why.split(":")[0]; refused[k] = (refused[k] ?? 0) + 1; }
  console.log("QURAN-MEDIA " + JSON.stringify({ providers: providers.map((p) => p.id), adab, detector: typeof args.detect === "string", ...m.stats, refused, sources: m.manifest.assets.reduce((/** @type {Record<string, number>} */ n, a) => { n[a.source] = (n[a.source] ?? 0) + 1; return n; }, {}) }));
  console.log(`Saved in ${dir}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
