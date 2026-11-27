// M1c: top long videos per owner niche (12 niches), metadata only. Run:
// NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/niches.mjs
// /api/ideas (search, 100 quota units per call) -> candidates; /api/videos -> final facts. Writes data/niche-candidates.json
import { writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const ROUND = process.argv[2] ?? "1";
const NICHES1 = {
  "History & Civilizations": ["ancient civilizations documentary", "history of rome documentary full", "history of empire documentary"],
  "Disasters & Mysteries": ["disaster documentary", "unsolved mystery documentary", "titanic chernobyl documentary"],
  "Science": ["science documentary", "physics explained documentary"],
  "Engineering & Megaprojects": ["engineering megaprojects documentary", "how it was built documentary"],
  "Economics & Financial History": ["financial crisis documentary", "history of money economics documentary"],
  "Business & Company History": ["company history documentary", "rise and fall of company documentary"],
  "Automotive & Transport": ["history of cars documentary", "aviation train ship documentary"],
  "WWII & Military": ["world war 2 documentary", "military history documentary"],
  "Space & Astronomy": ["space documentary", "nasa apollo documentary"],
  "Technology & Inventions": ["history of technology inventions documentary", "history of computers internet documentary"],
  "Nature & Ocean": ["nature documentary", "ocean documentary"],
  "Geography & Maps": ["geography explained documentary", "maps country explained"],
};
const NICHES2 = {
  "History & Civilizations": ["egypt pyramids documentary", "viking ancient greece history explained", "fall of rome history documentary"],
  "Disasters & Mysteries": ["plane crash investigation documentary", "bermuda triangle mystery documentary", "nuclear disaster documentary"],
  "Science": ["black holes documentary", "quantum physics documentary"],
  "Engineering & Megaprojects": ["how skyscrapers dams bridges are built", "megastructures documentary", "construction mega project explained"],
  "Economics & Financial History": ["great depression documentary", "2008 financial crisis explained", "history of banking inflation documentary", "bitcoin crypto documentary"],
  "Business & Company History": ["apple steve jobs documentary", "amazon walmart tesla history documentary", "how brand became billion dollar documentary"],
  "Automotive & Transport": ["how cars are made documentary", "boeing airbus airplane documentary", "history of ford tesla ferrari documentary", "titanic cruise ship railway documentary"],
  "WWII & Military": ["d-day pearl harbor documentary", "us navy air force documentary"],
  "Space & Astronomy": ["james webb telescope documentary", "apollo moon landing documentary"],
  "Technology & Inventions": ["history of the internet documentary", "artificial intelligence documentary", "how the iphone microchip was invented", "inventors inventions that changed the world"],
  "Nature & Ocean": ["planet earth blue planet documentary", "sharks whales deep sea documentary"],
  "Geography & Maps": ["why countries are shaped how they are map explained", "geography now country explained", "cities of the world documentary"],
};
const NICHES = ROUND === "2" ? NICHES2 : NICHES1;
const found = new Map();
for (const [niche, qs] of Object.entries(NICHES)) for (const q of qs) {
  let r;
  for (let t = 0; t < 3; t++) { r = await fetch(`${BASE}/api/ideas?${new URLSearchParams({ q, months: "60" })}`); if (r.ok || r.status < 500) break; await new Promise((x) => setTimeout(x, 3000)); }
  if (!r.ok) { console.error(niche, "|", q, r.status); continue; }
  for (const p of (await r.json()).picks) if (p.views >= 5e6 && p.durationSeconds >= 600) { const o = found.get(p.id); if (!o) found.set(p.id, { niches: [niche] }); else if (!o.niches.includes(niche)) o.niches.push(niche); }
  console.error(niche, "|", q, "->", found.size);
}
const ids = [...found.keys()], out = [];
for (let i = 0; i < ids.length; i += 50) {
  const r = await fetch(`${BASE}/api/videos?ids=${ids.slice(i, i + 50).join(",")}`);
  if (r.ok) out.push(...(await r.json()).videos.map((v) => ({ ...v, niches: found.get(v.id).niches, url: `https://youtu.be/${v.id}`, checked: new Date().toISOString().slice(0, 10) })));
}
writeFileSync(new URL(`../../docs/research/data/niche-candidates${ROUND === "1" ? "" : ROUND}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log(out.length, "videos");
