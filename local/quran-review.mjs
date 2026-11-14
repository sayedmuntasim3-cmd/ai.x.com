/**
 * Review a recitation film scene by scene, and decide whether it may be published:
 *   node local/quran-review.mjs --run <folder> --status
 *   node local/quran-review.mjs --run <folder> --approve S001,S002 | all --by "Name"
 *   node local/quran-review.mjs --run <folder> --reject S004 --by "Name" [--note "why"]     (a dark card instead)
 *   node local/quran-review.mjs --run <folder> --replace S003 --by "Name" [--query "olive grove"] [--detect python3]
 *   node local/quran-review.mjs --run <folder> --signoff --by "Name" --qualification "hafiz, ijazah in Hafs" --contact "email or phone"
 *   node local/quran-review.mjs --run <folder> --rights --by "Name" --reciter "..." --source "..." --permission "..."   (the recording's rights)
 *   node local/quran-review.mjs --run <folder> --html [--lang bn]   (review.html: real frames, ayah, picture, source, licence, checks, refusals)
 *   node local/quran-review.mjs --run <folder> --ready     (exit 0 only when it may be published; writes publish.json)
 * After a replacement, render again (render/quran-render.mjs): only the
 * changed scene is rendered anew. Every decision is kept in review.json
 * with the name and the time.
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { mediaProviders, verifyArchiveItem } from "../engine/src/film-media.mjs";
import { findQuranMedia, mediaManifest, mediaTable, creditsText } from "../engine/src/quran-media.mjs";
import { decide, packaging, readyToPublish, reviewPage, reviewSheet } from "../engine/src/quran-review.mjs";
import { detector } from "./quran-media.mjs";
import { parseArgs } from "./voice-film.mjs";

const run = promisify(execFile);
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
  if (a.rights === true) failed ||= !take(decide(review, { action: "rights", by, reciter: typeof a.reciter === "string" ? a.reciter : "", source: typeof a.source === "string" ? a.source : "", permission: typeof a.permission === "string" ? a.permission : "" }));
  if (a.signoff === true) failed ||= !take(decide(review, { action: "signoff", by, qualification: typeof a.qualification === "string" ? a.qualification : "", contact: typeof a.contact === "string" ? a.contact : "" }));
  await writeFile(join(dir, "review.json"), JSON.stringify(review, null, 1));
  for (const m of said) console.log("- " + m[lang]);
  if (a.status === true || (!a.approve && !a.reject && !a.replace && !a.signoff && !a.ready && !a.rights && !a.html)) {
    for (const s of review.scenes) console.log(`${s.shot}  ${s.ayah.padEnd(7)} ${s.status.padEnd(9)} ${(s.check ?? "").padEnd(8)}${s.asset ? s.asset.title.slice(0, 50) : "card"}  [${s.because.slice(0, 60)}]${s.check === "WARNING" ? "  doubts: " + (s.doubts ?? []).join("; ") : ""}`);
    console.log(review.signoff ? `Signed off by ${review.signoff.by} (${review.signoff.qualification}; ${review.signoff.contact}) at ${review.signoff.at}` : "Not signed off.");
  }
  if (a.ready === true) {
    const { verdicts, reports } = await judge(dir, review);
    for (const v of verdicts) { console.log(`${v.format}: ${v.status}`); for (const m of v.fail) console.log("  FAIL " + m[lang]); for (const m of v.warn) console.log("  WARNING " + m[lang]); }
    const verdict = verdicts.find((v) => v.status === "FAIL") ?? verdicts.find((v) => v.status === "WARNING") ?? verdicts[0];
    const render = reports[0]?.report ?? null;
    if (!verdict.ok) process.exit(1);
    const understanding = await readJson(join(dir, "understanding.json"));
    const surahNames = JSON.parse(await readFile(new URL("../engine/data/quran/surah-names.json", import.meta.url), "utf8"));
    const credits = await readFile(join(dir, "credits.txt"), "utf8").catch(() => undefined);
    const pack = packaging({ plan: understanding.quranPlan, surahNames, reciter: typeof a.reciter === "string" ? a.reciter : undefined, credits, totalSeconds: render?.seconds ?? 0 });
    await writeFile(join(dir, "publish.json"), JSON.stringify({ ready: true, signedOffBy: verdict.by, at: new Date().toISOString(), ...pack }, null, 1));
    const { msg } = await import("../engine/src/messages.mjs");
    console.log("- " + msg("quran.review.ready", { by: verdict.by })[lang]);
  }
  if (a.html === true) {
    const { verdicts, reports } = await judge(dir, review);
    // The real frames: the middle of each scene, from the first rendered film found.
    const film = reports.map((r) => r.report?.file).find((f) => typeof f === "string");
    /** @type {Record<string, string>} */
    const frames = {};
    if (film) {
      await mkdir(join(dir, "review"), { recursive: true });
      for (const s of review.scenes) {
        const out = join(dir, "review", `${s.shot}.jpg`);
        try { await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String((s.start + s.end) / 2), "-i", film, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", out]); frames[s.shot] = `review/${s.shot}.jpg`; } catch { /* no frame: the page says so */ }
      }
    }
    const page = reviewPage({ run: a.run, review, verdicts, media: await readJson(join(dir, "media.json")), meaning: await readJson(join(dir, "meaning.json")), location: await readJson(join(dir, "quran-location.json")), frames, lang: lang === "bn" ? "bn" : "en" });
    await writeFile(join(dir, "review.html"), page);
    console.log(`Review page: ${join(dir, "review.html")} (${Object.keys(frames).length} of ${review.scenes.length} scenes with a rendered frame)`);
  }
  if (failed) process.exit(1);
}

/**
 * Every rendered format judged against the review and the ayah timing; the worst decides
 * (a 4K master with a flaw is not saved by a clean 1080p).
 * @param {string} dir @param {any} review
 */
async function judge(dir, review) {
  const location = await readJson(join(dir, "quran-location.json"));
  /** @type {{ format: string, report: any }[]} */
  const reports = [];
  for (const f of ["1080p", "4k", "9x16"]) { const report = await readJson(join(dir, `render-report-${f}.json`)); if (report) reports.push({ format: f, report }); }
  const verdicts = (reports.length ? reports : [{ format: "none", report: null }]).map((r) => ({ format: r.format, ...readyToPublish(review, r.report, location) }));
  return { verdicts, reports };
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
