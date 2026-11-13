/**
 * Licensed media for every shot of a recitation film's shot list:
 *   node local/quran-media.mjs --run <voice-film output folder> [--adab strict|nature|people-distant]
 *        [--detect <python with opencv-python-headless>] [--reciter "name"]
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

/**
 * A frame check through local/media/detect.py: a reason when faces or people are seen.
 * @param {string} python
 * @returns {(r: import("../engine/src/documentary-media-fetch.mjs").MediaResult) => Promise<string | null>}
 */
export function detector(python) {
  const script = new URL("./media/detect.py", import.meta.url).pathname;
  return async (r) => {
    const target = r.mediaType === "video" ? r.mediaUrl : r.previewUrl ?? r.mediaUrl;
    if (!target) return null;
    try {
      const { stdout } = await run(python, ["-I", script, target, "--frames", "5"], { maxBuffer: 1 << 22, timeout: 300_000 });
      const item = JSON.parse(stdout).items[0];
      return item.flag ? `${item.faces} face(s), ${item.people} person(s) in ${item.frames} frame(s)` : null;
    } catch (e) {
      // A frame that cannot be read is not passed as clean.
      return "the frames could not be checked (" + String(/** @type {Error} */ (e).message).split("\n")[0].slice(0, 80) + ")";
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
  const m = await findQuranMedia({ shots: direction.shots, providers, adab, verify: verifyArchiveItem, inspect: typeof args.detect === "string" ? detector(args.detect) : undefined, log: (l) => console.error("  " + l) });
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
