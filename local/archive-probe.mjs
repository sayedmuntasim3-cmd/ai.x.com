// Read-only probe: three fixed queries on loc, dvids, europeana, nasa from the runner's network.
// Prints counts and 3 titles each. Keys come from the environment; nothing is written or sent anywhere else.
import { searchMedia } from "../engine/src/open-archives-lib.mjs";
import { locProvider } from "../engine/src/film-media.mjs";
import { locGate } from "../engine/src/archive-guard.mjs";

const env = Object.fromEntries(["DVIDS_API_KEY", "EUROPEANA_API_KEY"].map((k) => [k, (process.env[k] ?? "").trim()]).filter(([, v]) => v));
for (const query of ["Tacoma Narrows Bridge", "Hoover Dam", "Teton Dam"]) {
  console.log(`\n== ${query}`);
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
const until = locGate.blockedUntil();
console.log(`\nLoC gate: ${until ? `blocked until ${new Date(until).toISOString()}` : "not blocked"}`);
