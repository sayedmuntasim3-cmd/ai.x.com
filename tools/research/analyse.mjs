// M1: owner links + channel uploads -> docs/research/OWNER_LINKS_ANALYSIS.md, and fills the "to fill" rows of docs/YOUTUBE_BENCHMARKS.md
import { readFileSync, writeFileSync } from "node:fs";
const root = new URL("../../", import.meta.url);
const J = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const owner = J("docs/research/data/owner-links.json"), up = J("docs/research/data/channel-uploads.json");
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const mn = (s) => Math.round(s / 60), M = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.round(n / 1e3) + "K";
const pipe = (t) => t.replace(/\|/g, "/");
const day = owner[0]?.checked;
// 1) fill the benchmark tables
const byId = new Map(owner.map((v) => [v.id, v]));
let md = readFileSync(new URL("docs/YOUTUBE_BENCHMARKS.md", root), "utf8");
md = md.replace(/^\| (\d+) \| (https:\/\/youtu\.be\/([\w-]{11})) \|(.*)$/gm, (line, n, link, id, rest) => {
  const v = byId.get(id); if (!v || !/to fill/.test(rest)) return line;
  const cells = rest.split("|").map((c) => c.trim()).filter((c, i, a) => i < a.length - 1 || c !== "");
  const chap = v.chapters.length ? `${v.chapters.length} chapters` : "no chapters";
  const info = `${pipe(v.title).slice(0, 70)} (${pipe(v.channelTitle)})`, shape = `${mn(v.durationSeconds)} min, ${M(v.views)} views, ${chap}, ${v.publishedAt.slice(0, 10)}`;
  return cells.length === 3 ? `| ${n} | ${link} | ${info} | ${shape} | numbers only; see docs/research/OWNER_LINKS_ANALYSIS.md |` : `| ${n} | ${link} | ${info} | ${shape} (checked ${day}) |`;
});
md = md.replace(/\(not analysed yet\)/g, `(metadata measured ${day}; what-to-learn in docs/research/OWNER_LINKS_ANALYSIS.md)`).replace(/\(39 links, not analysed yet\)/, `(39 links, metadata measured ${day})`);
writeFileSync(new URL("docs/YOUTUBE_BENCHMARKS.md", root), md);
// 2) analysis doc
const groups = new Map(); for (const v of owner) (groups.get(v.channelTitle) ?? groups.set(v.channelTitle, []).get(v.channelTitle)).push(v);
const withCh = owner.filter((v) => v.chapters.length);
let o = `# The owner's ${owner.length} links, measured\n\nSource: \`GET /api/videos\` (YouTube Data API, metadata only), \`tools/research/by-id.mjs\`, checked ${day}. The owner's lists hold ${owner.length} distinct links (7 + 39 sent, not 50+).\n\n## Overall (measured)\n- Median length **${mn(med(owner.map((v) => v.durationSeconds)))} min**; median views ${M(med(owner.map((v) => v.views)))}; ${withCh.length} of ${owner.length} (${Math.round(100 * withCh.length / owner.length)}%) carry chapters in the description.\n- Under 15 min: ${owner.filter((v) => v.durationSeconds < 900).length}; 15-30 min: ${owner.filter((v) => v.durationSeconds >= 900 && v.durationSeconds < 1800).length}; over 30 min: ${owner.filter((v) => v.durationSeconds >= 1800).length}.\n- Published ${owner.map((v) => v.publishedAt).sort()[0].slice(0, 10)} to ${owner.map((v) => v.publishedAt).sort().at(-1).slice(0, 10)}; ${owner.filter((v) => v.publishedAt >= "2026-05-01").length} are from the last 6 months.\n\n## By channel (2+ links)\n| Channel | links | median min | median views | best |\n|---|---|---|---|---|\n`;
for (const [k, l] of [...groups].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length)) { l.sort((a, b) => b.views - a.views); o += `| ${pipe(k)} | ${l.length} | ${mn(med(l.map((v) => v.durationSeconds)))} | ${M(med(l.map((v) => v.views)))} | [${pipe(l[0].title).slice(0, 45)}](${l[0].url}) ${M(l[0].views)} |\n`; }
o += `\n## Missing channels, from their latest 25 uploads (measured ${day})\n| Channel | median min | median views | best / median | share with chapters | best video |\n|---|---|---|---|---|---|\n`;
const ch = new Map(); for (const v of up) (ch.get(v.channelTitle) ?? ch.set(v.channelTitle, []).get(v.channelTitle)).push(v);
for (const [k, l] of ch) { l.sort((a, b) => b.views - a.views); const m = med(l.map((v) => v.views)); o += `| ${k} | ${mn(med(l.map((v) => v.durationSeconds)))} | ${M(m)} | ${(l[0].views / m).toFixed(1)}x | ${Math.round(100 * l.filter((v) => v.chapters.length).length / l.length)}% | [${pipe(l[0].title).slice(0, 45)}](${l[0].url}) ${M(l[0].views)} (${l[0].publishedAt.slice(0, 10)}) |\n`; }
o += `\n"Latest 25 uploads" is not "last 3-6 months" for every channel: LEMMiNO uploads rarely, so its 25 reach back years (see data/channel-uploads.json for dates). MagnatesMedia and DW show 1-minute medians because their upload lists include Shorts (my reading; durations are in the data file). The RuhiCenet handle call returned 502 (YouTube side); the English channel is already in CHANNEL_COMPARISON.md.\n\n## What to learn (my reading from the numbers above, not a rule)\nFilled in REFERENCE_STANDARD.md once the screen recordings are measured.\n`;
writeFileSync(new URL("docs/research/OWNER_LINKS_ANALYSIS.md", root), o);
console.log(o.split("\n").slice(0, 28).join("\n"));
