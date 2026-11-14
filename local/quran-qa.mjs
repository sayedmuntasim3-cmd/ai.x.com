/**
 * QA of recitation recognition and timing on several kinds of recording
 * (stage Q7). Automated measurements only; the religious and visual review
 * by a person is a separate sheet (docs/QURAN_REVIEW_SHEET.md).
 *
 *   node local/quran-qa.mjs --degrade phone|mosque --audio <in> --out <file>
 *       a copy that sounds like a phone (300-3400 Hz, 8 kHz, noise, 24 kbit/s MP3)
 *       or a mosque (three echoes and a long tail, low hall noise); the ayah
 *       times do not move, so the truth of the clean copy still holds.
 *   node local/quran-qa.mjs --table <runs folder>
 *       the table of every quran-location.json under the folder, as markdown.
 */
import { execFile } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "./voice-film.mjs";

const run = promisify(execFile);

/** ffmpeg filters for each kind of recording. */
export const DEGRADE = Object.freeze({
  phone: { filter: "[0:a]aformat=channel_layouts=mono,highpass=f=300,lowpass=f=3400,aresample=8000[v];anoisesrc=color=white:amplitude=0.006:sample_rate=8000[n];[v][n]amix=inputs=2:duration=first:normalize=0[a]", codec: ["-c:a", "libmp3lame", "-b:a", "24k"] },
  mosque: { filter: "[0:a]aformat=channel_layouts=mono,aresample=44100,aecho=0.8:0.6:45|110|230|420:0.45|0.3|0.2|0.12,lowpass=f=9000[v];anoisesrc=color=pink:amplitude=0.004:sample_rate=44100[n];[v][n]amix=inputs=2:duration=first:normalize=0[a]", codec: ["-c:a", "pcm_s16le"] },
});

/** @param {keyof typeof DEGRADE} kind @param {string} input @param {string} out */
export async function degrade(kind, input, out) {
  const d = DEGRADE[kind];
  if (!d) throw new Error(`--degrade must be ${Object.keys(DEGRADE).join(" or ")}.`);
  await run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-filter_complex", d.filter, "-map", "[a]", ...d.codec, out]);
  return out;
}

/**
 * One row per run: what was decided, how far the ayah ends are from the truth.
 * @param {{ label: string, l: any }[]} runs
 */
export function qaTable(runs) {
  const lines = ["| Run | Seconds | Decision | Passage | Timing | Ayat | Ends within 0.2 s | Cuts in the true gap | Median / worst error (s) | Recognition (coverage, quality) |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const { label, l } of runs) {
    const t = l.truth;
    const passage = (l.passages ?? []).map((/** @type {any} */ r) => `${r.surah}:${r.fromAyah}-${r.toAyah}`).join(",");
    lines.push(`| ${label} | ${Math.round(l.seconds ?? 0)} | ${l.decision}${l.question ? ` (${l.question.code})` : ""} | ${passage} | ${l.timing ?? ""} | ${(l.ayat ?? []).length} | ${t ? `${t.within200ms}/${t.boundaries}` : ""} | ${t ? `${t.cutsInGap}/${t.cuts}` : ""} | ${t ? `${t.medianSeconds} / ${t.worstSeconds}` : ""} | ${l.recognition ? `${Math.round(l.recognition.coverage * 100)}%, ${Math.round(l.recognition.quality * 100)}%` : ""} |`);
  }
  return lines.join("\n");
}

async function main() {
  const a = /** @type {Record<string, any>} */ (parseArgs(process.argv.slice(2)));
  if (typeof a.degrade === "string") { console.log(await degrade(a.degrade, resolve(a.audio), resolve(a.out))); return; }
  if (typeof a.table === "string") {
    const dir = resolve(a.table);
    /** @type {{ label: string, l: any }[]} */
    const runs = [];
    for (const name of (await readdir(dir)).sort()) {
      try { runs.push({ label: name, l: JSON.parse(await readFile(join(dir, name, "quran-location.json"), "utf8")) }); } catch { /* not a run */ }
    }
    const md = qaTable(runs);
    if (typeof a.out === "string") await writeFile(resolve(a.out), md + "\n");
    console.log(md);
    return;
  }
  console.error("Usage: node local/quran-qa.mjs --degrade phone|mosque --audio <in> --out <file> | --table <runs folder>");
  process.exit(2);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
