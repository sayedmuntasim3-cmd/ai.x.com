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
import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mediaProviders, verifyArchiveItem } from "../engine/src/film-media.mjs";
import { creditsText, findQuranMedia, mediaTable } from "../engine/src/quran-media.mjs";
import { parseArgs } from "./voice-film.mjs";


/** Bits that differ between two 64-bit difference hashes. @param {string} a @param {string} b */
export function hamming(a, b) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** The rules the frame check applies, measured on labelled sets (docs/QURAN_DOCUMENTARY.md). */
export const VISUAL_RULES = Object.freeze({ notPhotograph: 0.2, nearDuplicateBits: 6, minRelevance: 0.5, darkBrightness: 60, plainEntropy: 0.7, walkers: 0.9, building: 0.7, manmade: 0.7 });

/** The uncertain band under each refusal: such a picture may be right, so it goes to a person (WARNING), never in silently. */
export const DOUBT_RULES = Object.freeze({ art: 0.1, relevance: 0.65, walkers: 0.6, building: 0.3, manmade: 0.35 });

/**
 * A search that asks for a building or a man-made thing (the ruins of past
 * towns, a sailing ship) expects one in the picture: that check is not applied.
 */
export const EXPECTS = Object.freeze({
  building: /\b(ruins?|towns?|city|cities|village|dwellings?|houses?|tower|palace|dam|mosque|walls?)\b/i,
  manmade: /\b(ships?|boats?|sail|sailing|dam|road|bridge|well|lamps?|ruins?)\b/i,
});

/**
 * Reasons from one detect.py result, or null when the frames pass.
 * @param {{ frames: number, faces: number, people: number, look?: any, sideways?: boolean, dhash?: string[], exposure?: { brightness: number, entropy: number } | null }} item @param {string[]} usedHashes
 * @param {string} [query] what was searched for (a search for ruins or a ship expects them)
 */
export function frameVerdict(item, usedHashes = [], query = "") {
  if (!item.frames) return "detector: no frame could be read, so it was not checked";
  // The same rule as the film's pixel audit: a dark, plain picture reads as an empty screen (the night-lights map
  // that reached a test film measured brightness 10.5, detail 0.44; photographs here 74-146 and 0.89-0.96).
  if (item.exposure && item.exposure.brightness < VISUAL_RULES.darkBrightness && item.exposure.entropy < VISUAL_RULES.plainEntropy) return `quality: too dark and plain to read on screen (brightness ${item.exposure.brightness}, detail ${item.exposure.entropy})`;
  // Faces and people: the OpenCV detectors alone are not an authority. On 68 clean landscape photos of the
  // validation set they saw "faces" in 13 (bark, rock, foliage), and every real person they found the image-text
  // model also scored at least 0.6. So they refuse only when the image-text model agrees (or there is no such
  // model on this machine); alone they send the picture to a person.
  const walkers = typeof item.look?.walkers === "number" ? item.look.walkers : null;
  if ((item.faces || item.people) && (walkers === null || walkers >= DOUBT_RULES.walkers)) return `detector: ${item.faces} face(s), ${item.people} person(s) in ${item.frames} frame(s)${walkers === null ? "" : `, people score ${Math.round(walkers * 100)}%`}`;
  if (item.look) {
    const art = item.look.painting + item.look.drawing + item.look.rendering;
    if (art >= VISUAL_RULES.notPhotograph) return `visual: looks like a painting, drawing or rendering (${Math.round(art * 100)}%), not a photograph`;
    // Measured on the 186-picture validation set (docs/QURAN_DOCUMENTARY.md): people 0.9 refuses 0.43 of the
    // pictures with people and 1 of 67 clean ones; buildings 0.7: 0.62, 1 of 67; man-made 0.7: 0.57, 0 of 67.
    // Below these, the review band (DOUBT_RULES) sends the picture to a person.
    if (typeof item.look.walkers === "number" && item.look.walkers >= VISUAL_RULES.walkers) return `adab: people seem to be in the picture (${Math.round(item.look.walkers * 100)}%), even small or far away`;
    if (typeof item.look.building === "number" && item.look.building >= VISUAL_RULES.building && !EXPECTS.building.test(query ?? "")) return `adab: a building, a monument or a city (${Math.round(item.look.building * 100)}%)`;
    if (typeof item.look.manmade === "number" && item.look.manmade >= VISUAL_RULES.manmade && !EXPECTS.manmade.test(query ?? "")) return `relevance: man-made things in the picture (${Math.round(item.look.manmade * 100)}%)`;
  }
  // Relevance: the searched thing against rooms, cities, people, text, vehicles, animals and objects.
  // Measured: a city at dawn 0.40, a fogged-out "mountain" 0.18, a sea searched as mountains 0.11; seven right pictures 0.78-0.99.
  if (item.look && typeof item.look.relevance === "number" && item.look.relevance < VISUAL_RULES.minRelevance) return `relevance: the frames do not show what was searched for (${Math.round(item.look.relevance * 100)}%)`;
  if (item.sideways) return "orientation: the picture seems to be stored on its side (its sky is at a side)";
  for (const h of item.dhash ?? []) for (const u of usedHashes) if (hamming(h, u) <= VISUAL_RULES.nearDuplicateBits) return "duplicate: nearly the same picture is already in the film";
  return null;
}

/**
 * Doubts from one detect.py result that passed frameVerdict: scores in the
 * uncertain band: such pictures may be right, so they go to a person instead
 * of being refused or passed without a look (measured: docs/QURAN_DOCUMENTARY.md).
 * @param {{ look?: any, faces?: number, people?: number }} item @param {string} [query] @returns {string[]}
 */
export function frameDoubts(item, query = "") {
  const l = item.look;
  if (!l) return [];
  /** @type {string[]} */
  const out = [];
  const pc = (/** @type {number} */ x) => Math.round(x * 100);
  if (/** @type {any} */ (item).faces || /** @type {any} */ (item).people) out.push(`adab: the face or person detector found ${/** @type {any} */ (item).faces ?? 0} face(s), ${/** @type {any} */ (item).people ?? 0} person(s); the image-text model did not agree`);
  const art = (l.painting ?? 0) + (l.drawing ?? 0) + (l.rendering ?? 0);
  if (art >= DOUBT_RULES.art) out.push(`visual: maybe not a photograph (${pc(art)}%)`);
  if (typeof l.relevance === "number" && l.relevance < DOUBT_RULES.relevance) out.push(`relevance: the frames only partly show what was searched for (${pc(l.relevance)}%)`);
  if (typeof l.walkers === "number" && l.walkers >= DOUBT_RULES.walkers) out.push(`adab: people may be in the picture (${pc(l.walkers)}%)`);
  if (typeof l.building === "number" && l.building >= DOUBT_RULES.building && !EXPECTS.building.test(query)) out.push(`adab: maybe a building (${pc(l.building)}%)`);
  if (typeof l.manmade === "number" && l.manmade >= DOUBT_RULES.manmade && !EXPECTS.manmade.test(query)) out.push(`relevance: maybe man-made things (${pc(l.manmade)}%)`);
  return out;
}

/**
 * A frame check through local/media/detect.py: faces and people, painting or
 * photograph, orientation, near-duplicates of what the film already uses.
 * @param {string} python @param {{ clip?: boolean }} [o]
 * @returns {(r: import("../engine/src/documentary-media-fetch.mjs").MediaResult, query?: string) => Promise<string | { warn: string[] } | null>}
 */
export function detector(python, o = {}) {
  const script = new URL("./media/detect.py", import.meta.url).pathname;
  /** @type {string[]} */
  const used = [];
  // One detector process for the whole film: the models load once, requests go one per line.
  /** @type {import("node:child_process").ChildProcessWithoutNullStreams | null} */
  let proc = null;
  /** @type {((line: string | null) => void)[]} */
  const waiting = [];
  let buffer = "";
  const start = () => {
    const p = spawn(python, ["-I", script, "--serve", "--frames", "5", ...(o.clip ? ["--clip"] : [])], { stdio: ["pipe", "pipe", "pipe"] });
    p.stdout.setEncoding("utf8");
    p.stdout.on("data", (/** @type {string} */ d) => {
      buffer += d;
      for (let i = buffer.indexOf("\n"); i >= 0; i = buffer.indexOf("\n")) { const line = buffer.slice(0, i); buffer = buffer.slice(i + 1); waiting.shift()?.(line); }
    });
    p.stderr.on("data", () => {});
    p.on("close", () => { proc = null; buffer = ""; for (const w of waiting.splice(0)) w(null); });
    p.unref();
    /** @type {any} */ (p.stdin).unref?.(); /** @type {any} */ (p.stdout).unref?.(); /** @type {any} */ (p.stderr).unref?.();
    return p;
  };
  /** @param {string} source @param {string | undefined} query @returns {Promise<any>} */
  const ask = (source, query) => new Promise((done, fail) => {
    proc ??= start();
    const timer = setTimeout(() => { proc?.kill(); fail(new Error("the detector did not answer in 10 minutes")); }, 600_000);
    waiting.push((line) => { clearTimeout(timer); if (line === null) fail(new Error("the detector stopped")); else done(JSON.parse(line)); });
    proc.stdin.write(JSON.stringify({ source, query }) + "\n");
  });
  return async (r, query) => {
    // The file that will be used (Commons refuses thumbnail sizes it does not list, so not the preview).
    const target = r.mediaUrl ?? r.previewUrl;
    if (!target) return null;
    try {
      const item = await ask(target, o.clip ? query : undefined);
      if (item.error) throw new Error(item.error);
      const why = frameVerdict(item, used, query ?? "");
      // A passed picture's hashes join the film, so a near-copy later is refused.
      if (!why) used.push(...(item.dhash ?? []));
      if (why) return why;
      const doubts = frameDoubts(item, query ?? "");
      return doubts.length ? { warn: doubts } : null;
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
