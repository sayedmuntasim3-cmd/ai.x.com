// Builds the reference prior from a Worker crawl (tools/research/engineering-handles.mjs).
// Usage: node tools/research/build-prior.mjs <raw.json> [thumbnail-sample.json]
//   -> engine/data/reference-prior.json (the prior) and docs/research/data/engineering-reference-videos.json (one slim row per video)
// Prints the top-15 outlier table (markdown) to stdout.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { buildPrior, buildRecords, PILLARS } from "../../engine/src/reference-prior.mjs";
const [rawFile, thumbFile = new URL("../../docs/research/data/thumbnail-sample.json", import.meta.url).pathname] = process.argv.slice(2);
if (!rawFile) { console.error("usage: build-prior.mjs <raw.json> [thumbnail-sample.json]"); process.exit(2); }
const raw = JSON.parse(readFileSync(rawFile, "utf8"));
const CORE = ["Practical Engineering", "The B1M", "Real Engineering", "Plainly Difficult", "Stewart Hicks", "Megaprojects explained", "Engineering with Rosie", "Disaster Breakdown", "Engineering Explained", "Fascinating Horror", "Mentour Pilot", "blancolirio"];
const REFERENCE = ["LEMMiNO", "Kurzgesagt – In a Nutshell", "Veritasium", "Vox", "Tom Scott plus", "WhatIf?"];
const channelFit = Object.fromEntries([...new Set(raw.map((v) => v.channelTitle))].map((c) => [c, CORE.includes(c) ? "core" : REFERENCE.includes(c) ? "reference" : "adjacent"]));
// The sample date, not today's, so a rebuild of the same crawl gives the same file.
const checked = raw.map((v) => v.checked).filter(Boolean).sort().pop() ?? new Date().toISOString().slice(0, 10);
const records = buildRecords(raw, { now: Date.parse(`${checked}T12:00:00Z`), channelFit });
// Thumbnails: hand-read sample (tags per video id, from my own look at the images), aggregated per pillar.
let thumbnails;
if (existsSync(thumbFile)) {
  const sample = JSON.parse(readFileSync(thumbFile, "utf8"));
  thumbnails = {};
  for (const p of PILLARS) {
    const rows = sample.videos.filter((s) => (records.find((r) => r.id === s.id)?.pillar ?? s.pillar) === p);
    const patterns = {};
    for (const s of rows) for (const t of s.tags) patterns[t] = (patterns[t] ?? 0) + 1;
    thumbnails[p] = { sample: rows.length, patterns: Object.fromEntries(Object.entries(patterns).sort((a, b) => b[1] - a[1])), notes: sample.notes?.[p] ?? [] };
  }
}
const prior = buildPrior(records, { builtAt: checked, thumbnails, rawVideos: raw.length });
writeFileSync(new URL("../../engine/data/reference-prior.json", import.meta.url), JSON.stringify(prior, null, 1) + "\n");
writeFileSync(new URL("../../docs/research/data/engineering-reference-videos.json", import.meta.url), JSON.stringify(records.map(({ chapterTitles, chapterStarts, ...r }) => ({ ...r, chapterTitles: chapterTitles.slice(0, 12), chapterStarts: chapterStarts.slice(0, 60) })), null, 0));
const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? Math.round(n / 1e3) + "k" : String(n));
const top = records.filter((r) => r.ageDays >= 60 && r.ageDays <= 1095).sort((a, b) => b.outlier - a.outlier).slice(0, 15);
console.log(`videos ${records.length}, channels ${prior.scope.channels}, raw read ${raw.length}; by pillar: ${PILLARS.map((p) => `${p} ${records.filter((r) => r.pillar === p).length}`).join(", ")}, unassigned core ${prior.other.unassignedCoreChannelVideos}\n`);
console.log("| # | Video | Channel | Pillar | Published | Views | /day | Min | Outlier |\n|---|---|---|---|---|---|---|---|---|");
top.forEach((r, i) => console.log(`| ${i + 1} | [${r.title.replace(/[|\[\]]/g, " ").slice(0, 70)}](https://youtu.be/${r.id}) | ${r.channel} | ${r.pillar ?? "-"} | ${r.publishedAt} | ${k(r.views)} | ${k(r.viewsPerDay)} | ${r.minutes} | ${r.outlier}x |`));
