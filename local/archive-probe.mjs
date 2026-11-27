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

// One real call per key: status only, never the key itself.
const trim = (k) => (process.env[k] ?? "").trim();
/** @param {string} name @param {string} key @param {(key: string) => Promise<Response>} call @param {(data: any) => number} [count] */
async function keyCheck(name, key, call, count) {
  if (!key) { console.log(`${name}: needs-key (secret empty)`); return; }
  try {
    const res = await call(key);
    if (res.status === 401 || res.status === 403) { console.log(`${name}: not authorised (HTTP ${res.status})`); return; }
    if (!res.ok) { console.log(`${name}: error (HTTP ${res.status})`); return; }
    if (!count) { console.log(`${name}: ok (HTTP ${res.status})`); return; }
    const n = count(await res.json());
    console.log(`${name}: ${n > 0 ? "ok" : "empty"} (HTTP ${res.status}, ${n} results)`);
  } catch (e) { console.log(`${name}: error (${e instanceof Error ? e.message : e})`); }
}
console.log("\n== key checks");
const sig = () => AbortSignal.timeout(15000);
await keyCheck("smithsonian", trim("SMITHSONIAN_API_KEY"), (k) => fetch(`https://api.si.edu/openaccess/api/v1.0/search?${new URLSearchParams({ q: "Hoover Dam", rows: "3", api_key: k })}`, { signal: sig() }), (d) => Number(d?.response?.rowCount ?? 0));
await keyCheck("pixabay", trim("PIXABAY_API_KEY"), (k) => fetch(`https://pixabay.com/api/?${new URLSearchParams({ key: k, q: "hoover dam", per_page: "3" })}`, { signal: sig() }), (d) => Number(d?.totalHits ?? 0));
await keyCheck("groq", trim("GROQ_API_KEY"), (k) => fetch("https://api.groq.com/openai/v1/models", { headers: { authorization: `Bearer ${k}` }, signal: sig() }));
