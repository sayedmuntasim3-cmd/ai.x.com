#!/usr/bin/env node
/**
 * LIVE check of the five free research sources (not a test: it makes real
 * requests). For each source: one search, one read of the first hit, timing
 * and outcome. Prints a JSON report; nothing is stored, no key is used.
 *
 *   node local/research-sources-check.mjs [crossref,europepmc,pubmed,archive,loc]
 */
import { sourceProviders } from "../engine/src/research-sources.mjs";

const TOPICS = { crossref: "Tenerife airport disaster", europepmc: "CRISPR Cas9 genome editing", pubmed: "CRISPR Cas9 genome editing", archive: "Tenerife airport disaster", loc: "Wright brothers first flight" };
const names = process.argv[2] ?? Object.keys(TOPICS).join(",");
const { providers, unknown } = sourceProviders(names, { fetch: (url, init) => fetch(url, init) });
const report = { mode: "live", date: new Date().toISOString(), unknown, sources: /** @type {any[]} */ ([]) };
for (const p of providers) {
  const query = TOPICS[/** @type {keyof typeof TOPICS} */ (p.id)];
  const row = /** @type {any} */ ({ source: p.id, query });
  let t = Date.now();
  try {
    const hits = await p.search(query, 3);
    row.search = { outcome: "ok", ms: Date.now() - t, hits: hits.length, first: hits[0] ? { title: hits[0].title.slice(0, 90), evidence: hits[0].url, page: hits[0].meta?.canonical, kind: hits[0].meta?.kind } : null };
    if (hits[0]) {
      t = Date.now();
      const read = await p.read(hits[0]);
      row.read = read ? { outcome: "ok", ms: Date.now() - t, chars: read.text.length, start: read.text.slice(0, 160) } : { outcome: "empty", ms: Date.now() - t };
    }
  } catch (error) {
    row.error = { code: /** @type {any} */ (error)?.code ?? "error", message: error instanceof Error ? error.message : String(error), ms: Date.now() - t };
  }
  report.sources.push(row);
}
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.sources.every((s) => s.read?.outcome === "ok") && !unknown.length ? 0 : 1;
