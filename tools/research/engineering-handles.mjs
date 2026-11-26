// W3: niche "Engineering Disasters & Megaprojects". Reads each channel's latest uploads through GET /api/videos?handle= (cheap, no search quota).
// Needs no key here: the proxy adds the Worker token. Run: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/engineering-handles.mjs
import { writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const H = (process.env.H ?? [
  "@PracticalEngineeringChannel", "@theb1m", "@RealEngineering", "@WendoverProductions", "@MustardChannel", "@Megaprojects", "@CityBeautiful", "@Kurzgesagt", "@Veritasium",
  "@MentourPilot", "@PetersonPilot", "@Fern", "@LemmiNO", "@VideoToolbox", "@PlainBitOfScience", "@BigThink", "@TomScottplus", "@tomscott", "@NileRed",
  "@LessonsFromTheScreenplay", "@EngineeringExplained", "@ThoughtEmporium", "@Stuff_Made_Here", "@GrandDesignsTV", "@Megastructures", "@MegaStructures", "@DisasterBreakdown",
  "@CodyCombs", "@TheInfographicsShow", "@Vox", "@Johnny_Harris", "@RealLifeLore", "@SimpleHistory", "@HistoryUncovered", "@TheB1M", "@cityNerd", "@NotJustBikes",
  "@Whang", "@ExplainingComputers", "@TheEngineeringMindset", "@Lemmino", "@MaxFosh", "@StructuralEngineeringChannel", "@Thunderf00t", "@AlecSteele", "@Sandcastles", "@BuildingTheFuture",
  "@DrBecky", "@PBSInfiniteSeries", "@SabineHossenfelder", "@Cleo-Abram", "@Polymatter", "@GeoWizard", "@Wendoverproductions", "@CNBC", "@Bloomberg", "@Business_Insider", "@BusinessInsider",
  "@FlightChops", "@AirDisasters", "@TheDisasterChannel", "@HistoryMatters", "@Primal-Space", "@SeanMUndercover", "@MegaprojectsTV", "@IndustrialRevolutionDocs", "@Engineeringfacts", "@Brick_Experiment",
  "@Dave2D", "@TheEngineerGuy", "@BrainStuff", "@TodayIFoundOut", "@ToldInStone", "@Toldinstone", "@AsianBoss", "@HowItsMade", "@ScienceChannel", "@Smithsonian", "@NatGeo"
].join(",")).split(",");
const out = new Map(); const seenCh = [];
for (const h of [...new Set(H)]) {
  const r = await fetch(`${BASE}/api/videos?handle=${encodeURIComponent(h)}&max=25`).catch(() => null);
  if (!r || !r.ok) { console.error("skip", h, r?.status); continue; }
  const j = await r.json();
  seenCh.push(j.channel.title);
  for (const v of j.videos) out.set(v.id, { ...v, handle: h, url: `https://youtu.be/${v.id}`, checked: new Date().toISOString().slice(0, 10) });
}
writeFileSync(new URL("../../docs/research/data/engineering-uploads.json", import.meta.url), JSON.stringify([...out.values()], null, 1));
console.log(out.size, "videos;", seenCh.length, "channels:", seenCh.join(" | "));
