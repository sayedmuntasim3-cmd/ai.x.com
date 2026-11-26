// M1: metadata only (no video download). Uses the Worker's /api/ideas (YouTube Data API search).
// Usage: node tools/research/collect.mjs  -> docs/research/data/reference-videos.json
import { writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const CHANNELS = (process.env.CH ?? "Ruhi Çenet|DW Documentary|Johnny Harris|LEMMiNO|Fern|MagnatesMedia|National Geographic|Kurzgesagt|Veritasium|Real Stories|Mark Felton Productions|Historia Civilis|Business Casual|Wendover Productions|Vox|Cleo Abram|Yarnhub|Alex O'Connor|Fall of Civilizations|Overly Sarcastic Productions").split("|");
const QS = (process.env.QS ?? "documentary").split("|");
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const out = [];
for (const ch of CHANNELS) {
  for (const months of [6, 12]) {
    const r = await fetch(`${BASE}/api/ideas?${new URLSearchParams({ q: `${ch} ${QS[0]}`, months: String(months) })}`);
    if (!r.ok) { console.error(ch, r.status); continue; }
    const j = await r.json();
    for (const p of j.picks) if (norm(p.channelTitle).includes(norm(ch)) || norm(ch).includes(norm(p.channelTitle))) out.push({ ...p, wanted: ch, checked: new Date().toISOString().slice(0, 10), url: `https://youtu.be/${p.id}` });
  }
}
import { existsSync, readFileSync } from "node:fs";
const FILE = new URL("../../docs/research/data/reference-videos.json", import.meta.url);
const prev = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : [];
const seen = new Map([...prev, ...out].map((v) => [v.id, v]));
writeFileSync(new URL("../../docs/research/data/reference-videos.json", import.meta.url), JSON.stringify([...seen.values()], null, 1));
console.log(seen.size, "videos;", new Set([...seen.values()].map((v) => v.channelTitle)).size, "channels");
