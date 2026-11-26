// M1c: "free real footage available" probe. Counts Internet Archive movie items per niche keyword inside public-domain-style sources
// (collection nasa, collection prelinger, creator National Archives). Metadata count only, nothing downloaded. Writes data/niche-footage.json
// Run: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/footage.mjs
import { writeFileSync } from "node:fs";
const SRC = '(collection:nasa OR collection:prelinger OR creator:"National Archives")';
const K = {
  "History & Civilizations": 'history OR ancient OR civilization OR revolution OR pyramid',
  "Disasters & Mysteries": 'disaster OR earthquake OR flood OR hurricane OR crash OR explosion OR fire',
  "Science": 'science OR physics OR chemistry OR biology OR laboratory OR experiment',
  "Engineering & Megaprojects": 'dam OR bridge OR tunnel OR construction OR engineering OR canal',
  "Economics & Financial History": 'depression OR bank OR economy OR stock OR wages OR industry',
  "Business & Company History": 'company OR factory OR corporation OR advertising OR salesman',
  "Automotive & Transport": 'automobile OR car OR railroad OR airplane OR aviation OR highway',
  "WWII & Military": '"world war II" OR army OR navy OR "air force" OR D-Day OR Pacific',
  "Space & Astronomy": 'apollo OR space OR moon OR shuttle OR mars OR astronaut OR telescope',
  "Technology & Inventions": 'computer OR electronics OR telephone OR radio OR television OR invention',
  "Nature & Ocean": 'ocean OR wildlife OR forest OR volcano OR animals OR "national park"',
  "Geography & Maps": 'map OR geography OR country OR city OR aerial OR earth',
};
const out = {};
for (const [n, kw] of Object.entries(K)) {
  const q = `mediatype:movies AND ${SRC} AND (${kw})`;
  const r = await fetch(`https://archive.org/advancedsearch.php?${new URLSearchParams({ q, rows: "0", output: "json" })}`);
  out[n] = r.ok ? (await r.json()).response.numFound : null;
  console.log(n, out[n]);
}
writeFileSync(new URL("../../docs/research/data/niche-footage.json", import.meta.url), JSON.stringify({ checked: new Date().toISOString().slice(0, 10), source: "archive.org advancedsearch, mediatype:movies in collections nasa, prelinger or creator National Archives", counts: out }, null, 1));
