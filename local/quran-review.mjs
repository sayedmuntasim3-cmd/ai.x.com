/**
 * Review a recitation film scene by scene, and decide whether it may be published:
 *   node local/quran-review.mjs --run <folder> --status
 *   node local/quran-review.mjs --run <folder> --approve S001,S002 | all --by "Name"
 *   node local/quran-review.mjs --run <folder> --reject S004 --by "Name" [--note "why"]     (a dark card instead)
 *   node local/quran-review.mjs --run <folder> --replace S003 --by "Name" [--query "olive grove"] [--detect python3]
 *   node local/quran-review.mjs --run <folder> --signoff --by "Name"
 *   node local/quran-review.mjs --run <folder> --ready     (exit 0 only when it may be published; writes publish.json)
 * After a replacement, render again (render/quran-render.mjs): only the
 * changed scene is rendered anew. Every decision is kept in review.json
 * with the name and the time.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mediaProviders, verifyArchiveItem } from "../engine/src/film-media.mjs";
import { findQuranMedia, mediaManifest, mediaTable, creditsText } from "../engine/src/quran-media.mjs";
import { decide, packaging, readyToPublish, reviewSheet } from "../engine/src/quran-review.mjs";
import { detector } from "./quran-media.mjs";
import { parseArgs } from "./voice-film.mjs";

/** @param {string} f */
const readJson = (f) => readFile(f, "utf8").then((t) => JSON.parse(t), () => null);

/**
 * Find another asset for one shot: what other shots use and what this shot had are excluded.
 * @param {{ dir: string, shot: string, query?: string, detect?: string }} o
 */
export async function replaceScene(o) {
  const direction = await readJson(join(o.dir, "shots.json"));
  const media = (await readJson(join(o.dir, "media.json"))) ?? { shots: [] };
  const shot = direction.shots.find((/** @type {any} */ s) => s.id === o.shot);
  if (!shot) throw new Error(`There is no scene ${o.shot}.`);
  const exclude = [...new Set([...media.shots.map((/** @type {any} */ s) => s.asset?.id).filter(Boolean), ...(media.refusedByReviewer ?? [])])];
  const wanted = o.query ? { ...shot, motif: o.query, look: [o.query] } : shot;
  const providers = mediaProviders({ pexelsKey: process.env.PEXELS_API_KEY || undefined, pixabayKey: process.env.PIXABAY_API_KEY || undefined });
  const found = await findQuranMedia({ shots: [wanted], providers, adab: direction.adab, verify: verifyArchiveItem, inspect: o.detect ? detector(o.detect, { clip: true }) : undefined, exclude });
  const old = media.shots.find((/** @type {any} */ s) => s.shot === o.shot);
  const next = found.shots[0];
  media.refusedByReviewer = [...new Set([...(media.refusedByReviewer ?? []), ...(old?.asset ? [old.asset.id] : [])])];
  media.shots = media.shots.some((/** @type {any} */ s) => s.shot === o.shot) ? media.shots.map((/** @type {any} */ s) => (s.shot === o.shot ? next : s)) : [...media.shots, next];
  media.manifest = mediaManifest(media.shots);
  await writeFile(join(o.dir, "media.json"), JSON.stringify(media, null, 1));
  await writeFile(join(o.dir, "manifest.json"), JSON.stringify(media.manifest, null, 1));
  await writeFile(join(o.dir, "media.md"), mediaTable({ shots: media.shots, stats: { shots: media.shots.length, found: media.shots.filter((/** @type {any} */ s) => s.asset).length, video: media.shots.filter((/** @type {any} */ s) => s.kind === "video").length, image: media.shots.filter((/** @type {any} */ s) => s.kind === "image").length, gaps: media.shots.filter((/** @type {any} */ s) => !s.asset).length }, manifest: media.manifest, messages: [] }) + "\n");
  await writeFile(join(o.dir, "credits.txt"), creditsText(media.manifest) + "\n");
  return { before: old?.asset ?? null, after: next.asset, status: next.status };
}

async function main() {
  const a = /** @type {Record<string, any>} */ (parseArgs(process.argv.slice(2)));
  if (typeof a.run !== "string") { console.error("Usage: node local/quran-review.mjs --run <folder> --status | --approve ... --by name | --replace S003 --by name | --signoff --by name | --ready"); process.exit(2); }
  const dir = resolve(a.run);
  const lang = a.lang === "bn" ? "bn" : "en";
  const direction = await readJson(join(dir, "shots.json"));
  let review = reviewSheet(direction, await readJson(join(dir, "media.json")), await readJson(join(dir, "review.json")));
  const by = typeof a.by === "string" ? a.by : "";
  /** @type {any[]} */
  const said = [];
  /** @param {{ ok: boolean, review: any, message: any }} r */
  const take = (r) => { said.push(r.message); if (r.ok) review = r.review; return r.ok; };
  let failed = false;
  if (typeof a.approve === "string") {
    if (a.approve === "all") failed ||= !take(decide(review, { action: "approve-all", by }));
    else for (const shot of a.approve.split(",")) failed ||= !take(decide(review, { shot: shot.trim(), action: "approve", by }));
  }
  if (typeof a.reject === "string") for (const shot of a.reject.split(",")) failed ||= !take(decide(review, { shot: shot.trim(), action: "reject", by, note: typeof a.note === "string" ? a.note : "" }));
  if (typeof a.replace === "string") {
    if (!take(decide(review, { shot: a.replace, action: "replace", by, note: typeof a.query === "string" ? `search: ${a.query}` : "" }))) failed = true;
    else {
      const r = await replaceScene({ dir, shot: a.replace, query: typeof a.query === "string" ? a.query : undefined, detect: typeof a.detect === "string" ? a.detect : undefined });
      console.log(`${a.replace}: ${r.before?.title ?? "card"} -> ${r.after?.title ?? "no licensed asset found (a card)"}`);
      // The new picture is pending again; other scenes keep their decisions.
      review = reviewSheet(direction, await readJson(join(dir, "media.json")), review);
    }
  }
  if (a.signoff === true) failed ||= !take(decide(review, { action: "signoff", by }));
  await writeFile(join(dir, "review.json"), JSON.stringify(review, null, 1));
  for (const m of said) console.log("- " + m[lang]);
  if (a.status === true || (!a.approve && !a.reject && !a.replace && !a.signoff && !a.ready)) {
    for (const s of review.scenes) console.log(`${s.shot}  ${s.ayah.padEnd(7)} ${s.status.padEnd(9)} ${s.asset ? s.asset.title.slice(0, 50) : "card"}  [${s.because.slice(0, 60)}]`);
    console.log(review.signoff ? `Signed off by ${review.signoff.by} at ${review.signoff.at}` : "Not signed off.");
  }
  if (a.ready === true) {
    const reports = ["1080p", "4k", "9x16"].map((f) => join(dir, `render-report-${f}.json`));
    let render = null;
    for (const r of reports) render ??= await readJson(r);
    const verdict = readyToPublish(review, render);
    for (const m of verdict.why) console.log("! " + m[lang]);
    if (!verdict.ok) process.exit(1);
    const understanding = await readJson(join(dir, "understanding.json"));
    const surahNames = JSON.parse(await readFile(new URL("../engine/data/quran/surah-names.json", import.meta.url), "utf8"));
    const credits = await readFile(join(dir, "credits.txt"), "utf8").catch(() => undefined);
    const pack = packaging({ plan: understanding.quranPlan, surahNames, reciter: typeof a.reciter === "string" ? a.reciter : undefined, credits, totalSeconds: render?.seconds ?? 0 });
    await writeFile(join(dir, "publish.json"), JSON.stringify({ ready: true, signedOffBy: verdict.by, at: new Date().toISOString(), ...pack }, null, 1));
    const { msg } = await import("../engine/src/messages.mjs");
    console.log("- " + msg("quran.review.ready", { by: verdict.by })[lang]);
  }
  if (failed) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
