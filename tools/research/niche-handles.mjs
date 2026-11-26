// M1c step 2: search quota spent (429) -> read niche channels' recent uploads via GET /api/videos?handle= (cheap). Writes data/niche-handles.json
// Run: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/niche-handles.mjs
import { writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const H = {
  "Engineering & Megaprojects": ["@RealEngineering", "@TheB1M", "@PracticalEngineeringChannel", "@Megaprojects", "@EngineeringExplained"],
  "Economics & Financial History": ["@Wendoverproductions", "@EconomicsExplained", "@PolyMatter", "@Plainly", "@CNBC"],
  "Business & Company History": ["@CNBCMakeIt", "@ColdFusion", "@BusinessCasual", "@MagnatesMedia", "@bloombergorigins"],
  "Automotive & Transport": ["@RegularCars", "@mentourpilot", "@PetersonsWorld", "@CarWow", "@Donut", "@jaysonwhite"],
  "Technology & Inventions": ["@ColdFusion", "@Veritasium", "@LowLevel", "@AsianometryChannel", "@TechnologyConnections", "@marquesbrownlee"],
  "Geography & Maps": ["@RealLifeLore", "@Geography_Now", "@Johnny_Harris", "@geowizard", "@VisualPolitik"],
  "WWII & Military": ["@mark-felton", "@TheGreatWarChannel", "@ww2tv", "@Yarnhub", "@Dunkey"],
  "Nature & Ocean": ["@BBCEarth", "@natgeo", "@NatGeoWild", "@Free.Documentary"],
};
const out = new Map();
for (const [niche, hs] of Object.entries(H)) for (const h of hs) {
  const r = await fetch(`${BASE}/api/videos?handle=${encodeURIComponent(h)}&max=50`).catch(() => null);
  if (!r || !r.ok) { console.error(niche, h, r?.status); continue; }
  for (const v of (await r.json()).videos) if (v.durationSeconds >= 600) { const o = out.get(v.id); if (o) { if (!o.niches.includes(niche)) o.niches.push(niche); } else out.set(v.id, { ...v, niches: [niche], url: `https://youtu.be/${v.id}`, checked: new Date().toISOString().slice(0, 10) }); }
}
writeFileSync(new URL("../../docs/research/data/niche-handles.json", import.meta.url), JSON.stringify([...out.values()], null, 1));
console.log(out.size, "long videos");
