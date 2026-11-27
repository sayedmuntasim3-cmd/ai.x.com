// W3 + prior: niche "Engineering Disasters & Megaprojects". Reads each channel's uploads through GET /api/videos?handle=
// (playlistItems + videos.list, about 1 quota unit per 50 videos; NO search.list, no video download).
// Local: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/engineering-handles.mjs
// CI / outside the proxy: set STUDIO_TOKEN (sent as a Bearer header). Env: PAGES (50 videos each, default 1; needs a Worker
// that knows pageToken), OUT (default data/engineering-uploads.json), H (comma list of handles), DRY_RUN=1 (print the plan, call nothing).
import { writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
export const HANDLES = [
  "@PracticalEngineeringChannel", "@theb1m", "@RealEngineering", "@WendoverProductions", "@MustardChannel", "@CityBeautiful", "@Kurzgesagt", "@Veritasium",
  "@MentourPilot", "@Fern", "@LemmiNO", "@EngineeringExplained", "@RealLifeLore", "@NotJustBikes", "@Thunderf00t", "@Megaprojects",
  "@DisasterBreakdown", "@PlainlyDifficult", "@StewartHicks", "@FascinatingHorror", "@HalfasInteresting", "@KyleHill", "@SmarterEveryDay", "@AdamSomething",
  "@TechnologyConnections", "@RMTransit", "@MarkFeltonProductions", "@EngineeringwithRosie", "@ColdFusion", "@brendonpeterson", "@EconomicsExplained",
  "@blancolirio", "@PilotDebrief", "@TheEngineeringMindset", "@cityNerd", "@MegaProjectsExplained", "@Johnny_Harris", "@Vox",
  "@HistoriaCivilis", "@Polymatter", "@TheInfographicsShow", "@NewMind", "@Cleo-Abram", "@BuildingTheFuture", "@AirDisasters",
  "@Stuff_Made_Here", "@TomScottplus", "@Tom_Scott", "@AlecSteele", "@SandcastleToys", "@Fascinatinghorror", "@TheTrainTrackChannel",
  "@WhatIfScience", "@CodyCombs", "@HowItsMade", "@History_Uncovered", "@ToldinStone", "@TheB1M",
];
const H = [...new Set((process.env.H ? process.env.H.split(",") : HANDLES).map((h) => h.trim()).filter(Boolean))];
const PAGES = Math.max(1, Math.min(10, Number(process.env.PAGES ?? 1)));
const OUT = process.env.OUT ? new URL(process.env.OUT, `file://${process.cwd()}/`) : new URL("../../docs/research/data/engineering-uploads.json", import.meta.url);
const headers = process.env.STUDIO_TOKEN ? { authorization: `Bearer ${process.env.STUDIO_TOKEN}` } : {};
if (process.env.DRY_RUN) {
  console.log(`DRY RUN: ${H.length} channels x up to ${PAGES} page(s) of 50; about ${H.length * PAGES * 3} quota units (channels.list + playlistItems + videos.list per page). Worker ${BASE}. No call made.`);
  process.exit(0);
}
const out = new Map(); const seenCh = []; const skipped = [];
const get = async (u) => { for (let t = 0; t < 3; t++) { const r = await fetch(u, { headers }).catch(() => null); if (r && (r.ok || r.status < 500)) return r; await new Promise((x) => setTimeout(x, 2000)); } return null; };
for (const h of H) {
  let token; let title = "";
  for (let p = 0; p < PAGES; p++) {
    const r = await get(`${BASE}/api/videos?handle=${encodeURIComponent(h)}&max=50${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`);
    if (!r || !r.ok) { if (p === 0) skipped.push(`${h}:${r?.status ?? "net"}`); break; }
    const j = await r.json();
    title = j.channel.title;
    for (const v of j.videos) out.set(v.id, { ...v, handle: h, url: `https://youtu.be/${v.id}`, checked: new Date().toISOString().slice(0, 10) });
    token = j.nextPageToken;
    if (!token) break;
  }
  if (title && !seenCh.includes(title)) seenCh.push(title);
}
writeFileSync(OUT, JSON.stringify([...out.values()], null, 1));
console.log(out.size, "videos;", seenCh.length, "channels:", seenCh.join(" | "));
if (skipped.length) console.error("skipped:", skipped.join(" "));
