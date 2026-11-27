// Read-only probe: three fixed queries on loc, dvids, europeana, nasa from the runner's network.
// Prints counts and 3 titles each. Keys come from the environment; nothing is written or sent anywhere else.
import { searchMedia } from "../engine/src/open-archives-lib.mjs";
import { locProvider } from "../engine/src/film-media.mjs";
import { locGate } from "../engine/src/archive-guard.mjs";

const env = Object.fromEntries(["DVIDS_API_KEY", "EUROPEANA_API_KEY"].map((k) => [k, process.env[k] ?? ""]).filter(([, v]) => v));
for (const query of ["Tacoma Narrows Bridge", "Hoover Dam", "Teton Dam"]) {
  console.log(`\n== ${query}`);
  // The raw answer of loc.gov, through the same queue, so the log shows what LoC really says.
  try {
    const u = `https://www.loc.gov/photos/?q=${encodeURIComponent(query)}&fo=json&c=3`;
    const raw = await locGate.run(`probe:${u}`, async () => {
      const res = await fetch(u, { headers: { "user-agent": "ZuponaAI-MediaSearch/1.0 (https://ai.zupona.com; documentary image research)" }, signal: AbortSignal.timeout(15000) });
      return { status: res.status, type: res.headers.get("content-type"), retryAfter: res.headers.get("retry-after"), head: (await res.text()).slice(0, 120).replace(/\s+/g, " ") };
    });
    console.log(`loc RAW: status ${raw.status}, ${raw.type}, retry-after ${raw.retryAfter ?? "none"}, starts: ${raw.head}`);
  } catch (e) { console.log(`loc RAW: failed ${e instanceof Error ? e.message : e}`); }
  for (const source of ["loc", "dvids", "europeana", "nasa"]) {
    try {
      const r = await searchMedia({ query, sources: [source], rights: "attribution", minSize: 1000, perSource: 10, limit: 20, timeoutMs: 20000 }, env);
      const s = r.sources[0];
      console.log(`${source}: ${r.results.length} results (status ${s?.status}${s?.error ? `, ${s.error}` : ""})`);
      for (const x of r.results.slice(0, 3)) console.log(`   - ${x.title} | ${x.license.label} | ${x.pageUrl}`);
    } catch (e) { console.log(`${source}: failed ${e instanceof Error ? e.message : e}`); }
  }
  try {
    const r = await locProvider().search(query, "image", AbortSignal.timeout(20000));
    console.log(`loc (film runner provider): ${r.length} results`);
    for (const x of r.slice(0, 3)) console.log(`   - ${x.title}`);
  } catch (e) { console.log(`loc (film runner provider): failed ${e instanceof Error ? e.message : e}`); }
}
