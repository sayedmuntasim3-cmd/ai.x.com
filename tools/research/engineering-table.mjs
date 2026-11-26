// W3: renders the tables of docs/research/ENGINEERING_MARKET_STUDY.md from data/engineering-videos.json (+ engineering-uploads.json for channel medians).
// Run: node tools/research/engineering-table.mjs > /tmp/tables.md
import { readFileSync } from "node:fs";
const rows = JSON.parse(readFileSync(new URL("../../docs/research/data/engineering-videos.json", import.meta.url), "utf8"));
const up = JSON.parse(readFileSync(new URL("../../docs/research/data/engineering-uploads.json", import.meta.url), "utf8"));
const k = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k" : String(n);
const esc = (s) => s.replace(/\|/g, "/").replace(/\[/g, "(").replace(/\]/g, ")");
function structure(t) {
  const tags = [];
  if (/\?/.test(t)) tags.push("question");
  if (/^(how|why|what|where|who|when|can|is|are|do|does)\b/i.test(t.trim())) tags.push("how/why/what");
  if (/[$£€]|\d/.test(t)) tags.push("number/money");
  if (/[|:]| - | — /.test(t)) tags.push("subtitle");
  if (/\b[A-Z]{4,}\b/.test(t.replace(/\b(NASA|HS2|ISS|USAir)\b/g, ""))) tags.push("CAPS word");
  return tags.join(", ") || "plain statement";
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const by = new Map();
for (const r of rows) (by.get(r.channel) ?? by.set(r.channel, []).get(r.channel)).push(r);
const tier = (m) => m >= 1e6 ? "large" : m >= 2e5 ? "medium" : m >= 5e3 ? "small" : "very small";
let out = "### Channels (29)\n\n| Channel | Niche fit | Size tier (by median views of long uploads) | Long uploads in window | Median views | Videos listed |\n|---|---|---|---|---|---|\n";
for (const [c, a] of by) {
  const all = up.filter((u) => u.channel === c && u.durationSeconds >= 480);
  out += `| ${c} | ${a[0].fit} | ${tier(a[0].channelMedianViews)} | ${all.length} | ${k(a[0].channelMedianViews)} | ${a.length} |\n`;
}
out += "\n### Videos\n\nColumns: published; views; minutes; views/day (views ÷ age in days); outlier = views ÷ the channel's median of its own long uploads older than 21 days; class; likes/comments; chapters parsed from the description; title structure (automatic tags); thumbnail (my reading); angle; confidence. Checked date for every row: 2026-11-26.\n";
for (const [c, a] of by) {
  out += `\n#### ${c} (median ${k(a[0].channelMedianViews)}, ${a[0].comparableUploads} comparable uploads, fit: ${a[0].fit})\n\n| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of a.sort((x, y) => y.outlier - x.outlier))
    out += `| [${esc(r.title.slice(0, 70))}](https://youtu.be/${r.id}) \`${r.id}\` | ${r.publishedAt} | ${k(r.views)} | ${r.minutes} | ${k(r.viewsPerDay)} | ${r.outlier}× | ${r.class} | ${k(r.likes)}/${k(r.comments)} | ${r.chapters || "–"} | ${structure(r.title)} | ${esc(r.thumbnail)} | ${r.angle} | ${r.confidence} |\n`;
}
const core = rows.filter((r) => r.angle !== "off-niche");
out += "\n### Counts by class and by angle (my selection over-samples the extremes: read these as which angles appear at each extreme, not as rates)\n\n| Angle | exceptional | above | typical | under |\n|---|---|---|---|---|\n";
for (const an of [...new Set(core.map((r) => r.angle))]) out += `| ${an} | ${["exceptional", "above", "typical", "under"].map((cl) => core.filter((r) => r.angle === an && r.class === cl).length).join(" | ")} |\n`;
out += `\nVideos by class (all ${rows.length}): ` + ["exceptional", "above", "typical", "under"].map((cl) => `${cl} ${rows.filter((r) => r.class === cl).length}`).join(", ") + ".\n";
out += `\nMedian length by class (minutes): ` + ["exceptional", "above", "typical", "under"].map((cl) => `${cl} ${med(rows.filter((r) => r.class === cl).map((r) => r.minutes))}`).join(", ") + ".\n";
out += `\nShare with chapters: exceptional ${Math.round(100 * rows.filter((r) => r.class === "exceptional" && r.chapters).length / rows.filter((r) => r.class === "exceptional").length)}%, under ${Math.round(100 * rows.filter((r) => r.class === "under" && r.chapters).length / rows.filter((r) => r.class === "under").length)}%.\n`;
const q = (cl) => { const a = rows.filter((r) => r.class === cl && /\?/.test(r.title)).length; return `${cl} ${a}/${rows.filter((r) => r.class === cl).length}`; };
out += `\nTitles with a question mark: ${["exceptional", "above", "typical", "under"].map(q).join(", ")}.\n`;
console.log(out);
