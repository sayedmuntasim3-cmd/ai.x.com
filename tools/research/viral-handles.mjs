// M1b step 2: when YouTube search quota is spent (429), read niche channels' latest uploads through GET /api/videos?handle= (cheap).
// Run: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/viral-handles.mjs
import { writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const H = {
  space: ["@SpaceTime", "@NASA", "@scishow", "@MichioKaku", "@PBSSpaceTime", "@NASAGoddard", "@Astrum", "@TheSpaceRace"],
  nature: ["@BBCEarth", "@NatGeoWild", "@natgeo", "@BeautifulPlanet", "@Free.Documentary", "@NatureonPBS", "@Smithsonian", "@DiscoveryUK"],
  crime: ["@RealStories", "@MrBallen", "@JCSCriminalPsychology", "@Cold-Case", "@TheInfographicsShow", "@LordGrim", "@NickCrowley", "@DrewGooden"],
  business: ["@CNBC", "@WendoverProductions", "@CoffeeBreak", "@Vox", "@Cleo-Abram", "@bloombergorigins", "@AlexHormozi", "@GraphicsInsights", "@MoneyZG", "@ColdFusion", "@CNBCMakeIt", "@CNBCInternational"],
  geo: ["@CaspianReport", "@RealLifeLore", "@PolyMatter", "@VisualPolitik", "@geowizard", "@Johnny_Harris", "@VICE", "@vice", "@AlJazeeraEnglish", "@Geography_Now"],
  bio: ["@Biographics", "@BiographyChannel", "@NotJustBikes", "@AlexOConnor", "@thebiographychannel"],
  motiv: ["@AliAbdaal", "@MotivationHub", "@Motiversity", "@GaryVee", "@AlexHormozi", "@JordanBPeterson", "@TheDiaryOfACEO", "@ImpactTheory", "@AndrewHuberman"],
  history: ["@OverlySarcasticProductions", "@HistoryMatters", "@KingsAndGenerals", "@TheHistoryGuy", "@toldinstone", "@Oversimplified", "@WorldWar2Documentary", "@HistoryChannel", "@WWII", "@TheGreatWarChannel"],
};
const out = new Map();
for (const [niche, hs] of Object.entries(H)) for (const h of hs) {
  const r = await fetch(`${BASE}/api/videos?handle=${encodeURIComponent(h)}&max=50`).catch(() => null);
  if (!r || !r.ok) { console.error(h, r?.status); continue; }
  const j = await r.json();
  for (const v of j.videos) if (v.durationSeconds >= 600) out.set(v.id, { ...v, niche, handle: h, url: `https://youtu.be/${v.id}`, checked: new Date().toISOString().slice(0, 10) });
}
writeFileSync(new URL("../../docs/research/data/viral-handles.json", import.meta.url), JSON.stringify([...out.values()], null, 1));
console.log(out.size, "long videos");
