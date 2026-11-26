// M1b: viral long documentaries (10M+ views) across niches. Metadata only, no video download.
// Run: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/viral.mjs
// Step 1 /api/ideas per niche query -> candidates; step 2 /api/videos for the final ids (chapters, thumbnail, likes).
import { readFileSync, writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const D = (f) => new URL(`../../docs/research/data/${f}`, import.meta.url);
const NICHES = {
  history: ["history documentary full", "world war 2 documentary", "ancient history documentary", "empire rise and fall documentary"],
  biography: ["biography documentary life story", "rise and fall of billionaire documentary", "how he became rich documentary"],
  science: ["science explained documentary", "physics documentary", "human body documentary"],
  space: ["space documentary", "universe documentary", "mars moon nasa documentary"],
  nature: ["nature documentary", "ocean deep sea documentary", "wildlife documentary full"],
  crime: ["true crime documentary", "unsolved mystery documentary", "serial killer documentary"],
  business: ["business documentary", "how company collapsed documentary", "money economy documentary"],
  geopolitics: ["geopolitics explained documentary", "country explained geography", "war in documentary explained"],
  motivation: ["motivation documentary discipline", "self improvement documentary", "psychology documentary"],
};
const found = new Map();
for (const [niche, qs] of Object.entries(NICHES)) for (const q of qs) {
  for (const months of [60]) {
    let r;
    for (let t = 0; t < 3; t++) { r = await fetch(`${BASE}/api/ideas?${new URLSearchParams({ q, months: String(months) })}`); if (r.ok || r.status < 500) break; await new Promise((x) => setTimeout(x, 3000)); }
    if (!r.ok) { console.error(q, r.status); continue; }
    for (const p of (await r.json()).picks) if (p.views >= 8e6 && p.durationSeconds >= 600 && !found.has(p.id)) found.set(p.id, { niche, query: q });
  }
}
const ids = [...found.keys()];
const out = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await fetch(`${BASE}/api/videos?ids=${ids.slice(i, i + 50).join(",")}`);
  if (r.ok) out.push(...(await r.json()).videos.map((v) => ({ ...v, niche: found.get(v.id).niche, url: `https://youtu.be/${v.id}`, checked: new Date().toISOString().slice(0, 10) })));
}
writeFileSync(D("viral-candidates.json"), JSON.stringify(out, null, 1));
console.log(out.length, "candidates");
