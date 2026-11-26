// M1: owner's links + channel handles through the Worker's GET /api/videos (metadata only, no downloads).
// Run: NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tools/research/by-id.mjs
import { readFileSync, writeFileSync } from "node:fs";
const BASE = process.env.WORKER ?? "https://ai-x-com.sayedmuntasim3.workers.dev";
const root = new URL("../../", import.meta.url);
const ids = [...new Set([...readFileSync(new URL("docs/YOUTUBE_BENCHMARKS.md", root), "utf8").matchAll(/youtu\.be\/([\w-]{11})/g)].map((m) => m[1]))];
const get = async (q) => { const r = await fetch(`${BASE}/api/videos?${q}`); if (!r.ok) throw new Error(`${q.slice(0, 40)} -> ${r.status}`); return r.json(); };
const checked = new Date().toISOString().slice(0, 10);
const owner = [];
for (let i = 0; i < ids.length; i += 50) owner.push(...(await get(`ids=${ids.slice(i, i + 50).join(",")}`)).videos);
const handles = [];
for (const h of ["@lemmino", "@MagnatesMedia", "@BusinessCasual", "@DWDocumentary", "@RuhiCenet"]) {
  try { const j = await get(`handle=${encodeURIComponent(h)}&max=25`); handles.push(...j.videos.map((v) => ({ ...v, handle: h }))); } catch (e) { console.error(String(e)); }
}
const stamp = (v) => ({ ...v, url: `https://youtu.be/${v.id}`, checked });
writeFileSync(new URL("docs/research/data/owner-links.json", root), JSON.stringify(owner.map(stamp), null, 1));
writeFileSync(new URL("docs/research/data/channel-uploads.json", root), JSON.stringify(handles.map(stamp), null, 1));
console.log("owner ids", ids.length, "found", owner.length, "| channel uploads", handles.length);
