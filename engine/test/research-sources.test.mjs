// Replay tests: the fixtures are real responses recorded from the five APIs
// on 12 Nov 2026 (trimmed to a few records each). These tests are simulated:
// no request leaves the machine. The live check is local/research-sources-check.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gatherCorpus, corpusText, researchProviders } from "../src/research-desk.mjs";
import { archiveProvider, crossrefProvider, europePmcProvider, locProvider, plainText, pubmedProvider, RESEARCH_SOURCES, sourceClient, sourceProviders } from "../src/research-sources.mjs";

const fixture = (/** @type {string} */ name) => readFileSync(new URL(`./fixtures/research-sources/${name}`, import.meta.url), "utf8");

/** A fake clock and sleep, so rate limits and backoff are tested without waiting. */
function clock() {
  let t = 0;
  /** @type {number[]} */
  const slept = [];
  return { now: () => t, sleep: async (/** @type {number} */ ms) => { slept.push(ms); t += ms; }, slept };
}

/**
 * Replays the recorded responses by host and path.
 * @param {string[]} log
 */
function replay(log = []) {
  return /** @type {typeof fetch} */ (async (input, init) => {
    const url = new URL(String(input));
    log.push(url.href);
    assert.match(String(/** @type {any} */ (init?.headers)?.["user-agent"]), /^ZuponaStudio\/1\.0 \(.*https:\/\/github\.com\//, "the project user agent with its public contact link, nothing personal");
    const json = (/** @type {string} */ f) => new Response(fixture(f), { headers: { "content-type": "application/json" } });
    if (url.hostname === "api.crossref.org") return url.pathname === "/works" ? json("crossref-search.json") : json("crossref-work.json");
    if (url.hostname === "www.ebi.ac.uk") {
      const q = String(url.searchParams.get("query"));
      if (!q.startsWith("EXT_ID:")) { assert.match(q, /AND LANG:eng$/, "English first"); return json("europepmc-search.json"); }
      const data = JSON.parse(fixture("europepmc-search.json"));
      const id = /EXT_ID:(\S+)/.exec(q)?.[1];
      return Response.json({ resultList: { result: data.resultList.result.filter((/** @type {any} */ r) => r.id === id) } });
    }
    if (url.hostname === "eutils.ncbi.nlm.nih.gov") {
      assert.equal(url.searchParams.get("tool"), "zupona-studio");
      assert.equal(url.searchParams.get("email"), null, "no email is sent");
      if (url.pathname.endsWith("esearch.fcgi")) { assert.equal(url.searchParams.get("sort"), "relevance"); return json("pubmed-esearch.json"); }
      if (url.pathname.endsWith("esummary.fcgi")) return json("pubmed-esummary.json");
      return new Response(fixture("pubmed-efetch.txt"), { headers: { "content-type": "text/plain" } });
    }
    if (url.hostname === "archive.org") return url.pathname === "/advancedsearch.php" ? json("archive-search.json") : json("archive-metadata.json");
    if (url.hostname === "www.loc.gov") return url.pathname === "/search/" ? json("loc-search.json") : json("loc-item.json");
    return new Response("not found", { status: 404 });
  });
}

const opts = (/** @type {typeof fetch} */ f) => ({ fetch: f, ...clock() });

test("Crossref: search gives record URLs on api.crossref.org and the doi.org page; read keeps the bibliographic record and says when no abstract exists", async () => {
  const p = crossrefProvider(opts(replay()));
  const hits = await p.search("Tenerife airport disaster", 2);
  assert.equal(hits.length, 2);
  assert.equal(hits[1].url, "https://api.crossref.org/works/10.1017/s1049023x00062348");
  assert.equal(hits[1].meta?.canonical, "https://doi.org/10.1017/s1049023x00062348");
  assert.equal(hits[1].meta?.kind, "bibliographic record");
  const read = await p.read(hits[1]);
  assert.ok(read);
  assert.match(read.text, /^Source: Crossref bibliographic record/);
  assert.match(read.text, /Journal: Prehospital and Disaster Medicine/);
  assert.match(read.text, /Published: 2007-04/);
  assert.match(read.text, /Abstract: \(no abstract deposited\)/);
});

test("Europe PMC: lite search, English only; the core record is the evidence; preprints are labelled as not peer reviewed", async () => {
  const p = europePmcProvider(opts(replay()));
  const hits = await p.search("CRISPR Cas9 discovery", 2);
  assert.equal(hits.length, 2);
  assert.equal(hits[0].meta?.kind, "preprint (not peer reviewed)");
  assert.equal(hits[1].meta?.canonical, "https://europepmc.org/article/MED/42808239");
  assert.match(hits[1].url, /resultType=core/);
  const read = await p.read(hits[1]);
  assert.ok(read && read.text.includes("Abstract: ") && read.text.includes("PMID: 42808239"));
  assert.match(/** @type {any} */ (await p.read(hits[0])).text, /not peer reviewed/);
});

test("PubMed: esearch by relevance, esummary for titles, efetch abstract text as the evidence", async () => {
  const log = /** @type {string[]} */ ([]);
  const p = pubmedProvider(opts(replay(log)));
  const hits = await p.search("CRISPR Cas9 discovery", 2);
  assert.deepEqual(hits.map((h) => h.meta?.pmid), ["43003971", "42998252"]);
  assert.equal(hits[0].title, "Efficient Bioproduction of Citric Acid in Aspergillus niger.");
  assert.equal(hits[0].meta?.canonical, "https://pubmed.ncbi.nlm.nih.gov/43003971/");
  const read = await p.read(hits[0]);
  assert.match(String(read?.text), /^Source: PubMed abstract \(PMID 43003971\)\n1\. Adv Biochem Eng Biotechnol/);
  assert.equal(log.length, 3, "two calls to search, one to read");
});

test("Internet Archive: only text items are searched; metadata record is the evidence", async () => {
  const log = /** @type {string[]} */ ([]);
  const p = archiveProvider(opts(replay(log)));
  const hits = await p.search("Tenerife airport disaster", 2);
  assert.match(decodeURIComponent(log[0].replace(/\+/g, " ")), /\(Tenerife airport disaster\) AND mediatype:texts&/);
  assert.equal(hits[0].url, "https://archive.org/metadata/crs-in12675.2");
  assert.equal(hits[0].meta?.canonical, "https://archive.org/details/crs-in12675.2");
  const read = await p.read(hits[0]);
  assert.match(String(read?.text), /Title: Collision at LaGuardia Airport/);
  assert.match(String(read?.text), /Description: On the night of March 22, 2026/);
});

test("Library of Congress: only catalogued items (not collection pages); the item JSON is the evidence", async () => {
  const p = locProvider(opts(replay()));
  const hits = await p.search("Wright brothers first flight", 2);
  assert.equal(hits.length, 1, "the collection page in the results is skipped");
  assert.equal(hits[0].url, "https://www.loc.gov/item/00652085/?fo=json");
  assert.equal(hits[0].meta?.canonical, "https://www.loc.gov/item/00652085/");
  const read = await p.read(hits[0]);
  assert.match(String(read?.text), /Created or published: \[1903 Dec\. 17\]/);
  assert.match(String(read?.text), /Summary: Photograph shows the first powered, controlled, sustained flight/);
});

test("strict host: another host, http, a port, credentials or a redirect off the host are refused before or during the request", async () => {
  const calls = /** @type {string[]} */ ([]);
  const f = /** @type {typeof fetch} */ (async (input) => {
    calls.push(String(input));
    return new Response(null, { status: 302, headers: { location: "https://evil.example/steal" } });
  });
  const c = sourceClient("crossref", opts(f));
  for (const bad of ["https://example.com/works", "http://api.crossref.org/works", "https://api.crossref.org:8443/works", "https://u:p@api.crossref.org/works", "https://api.crossref.org.evil.example/works"]) {
    await assert.rejects(c.get(bad), (/** @type {any} */ e) => e.code === "host-refused", bad);
  }
  assert.equal(calls.length, 0, "nothing was requested");
  await assert.rejects(c.get("https://api.crossref.org/works?query=x"), (/** @type {any} */ e) => e.code === "host-refused");
  assert.equal(calls.length, 1, "the redirect target was never fetched, and a refusal is not retried");
});

test("rate limit: requests to one source wait for its minimum gap, and run one at a time", async () => {
  const k = clock();
  let open = 0;
  let most = 0;
  const f = /** @type {typeof fetch} */ (async () => { open += 1; most = Math.max(most, open); await Promise.resolve(); open -= 1; return Response.json({ ok: true }); });
  const c = sourceClient("loc", { fetch: f, now: k.now, sleep: k.sleep });
  await Promise.all([c.get("https://www.loc.gov/a"), c.get("https://www.loc.gov/b"), c.get("https://www.loc.gov/c")]);
  assert.equal(most, 1);
  assert.deepEqual(k.slept, [RESEARCH_SOURCES.loc.minGapMs, RESEARCH_SOURCES.loc.minGapMs]);
});

test("retries: 429 and 503 are retried with backoff (Retry-After honoured, capped); 404 is not retried; errors carry a code", async () => {
  const k = clock();
  const statuses = [429, 503, 200];
  const f = /** @type {typeof fetch} */ (async () => {
    const s = /** @type {number} */ (statuses.shift());
    return s === 200 ? Response.json({ ok: 1 }) : new Response("busy", { status: s, headers: s === 429 ? { "retry-after": "60" } : {} });
  });
  const c = sourceClient("archive", { fetch: f, now: k.now, sleep: k.sleep });
  assert.deepEqual(await c.get("https://archive.org/metadata/x"), { ok: 1 });
  // 10 s cap on Retry-After 60, then 3 s backoff on the second try (gaps below the 1 s minimum are already met).
  assert.deepEqual(k.slept, [10_000, 3_000]);

  let n = 0;
  const gone = sourceClient("archive", { fetch: /** @type {typeof fetch} */ (async () => { n += 1; return new Response("no", { status: 404 }); }), ...clock() });
  await assert.rejects(gone.get("https://archive.org/metadata/x"), (/** @type {any} */ e) => e.code === "http-404");
  assert.equal(n, 1);

  let m = 0;
  const down = sourceClient("archive", { fetch: /** @type {typeof fetch} */ (async () => { m += 1; throw new TypeError("fetch failed"); }), ...clock() });
  await assert.rejects(down.get("https://archive.org/metadata/x"), (/** @type {any} */ e) => e.code === "network");
  assert.equal(m, 3, "one try and two retries");

  const bad = sourceClient("archive", { fetch: /** @type {typeof fetch} */ (async () => new Response("<html>")), ...clock() });
  await assert.rejects(bad.get("https://archive.org/metadata/x"), (/** @type {any} */ e) => e.code === "bad-json");
});

test("names: unknown sources are reported, not guessed; the default research desk is unchanged", () => {
  const { providers, unknown } = sourceProviders("crossref, PubMed,loc,openalex,crossref", { fetch: replay() });
  assert.deepEqual(providers.map((p) => p.id), ["crossref", "pubmed", "loc"]);
  assert.deepEqual(unknown, ["openalex"]);
  assert.deepEqual(researchProviders({ fetch: replay() }).map((p) => p.id), ["wikipedia"]);
  assert.deepEqual(researchProviders({ fetch: replay(), sources: "europepmc,archive" }).map((p) => p.id), ["wikipedia", "europepmc", "archive"]);
});

test("through the research desk: each document keeps its evidence URL, page link and kind, and the brain sees them", async () => {
  const f = replay();
  const { docs, trace } = await gatherCorpus({ queries: ["Wright brothers first flight"], providers: sourceProviders("loc,crossref", { fetch: f, ...clock() }).providers, fetch: f });
  assert.deepEqual(trace.map((t) => [t.provider, t.outcome]), [["loc", "ok"], ["crossref", "ok"]]);
  const loc = docs.find((d) => d.provider === "loc");
  assert.equal(loc?.url, "https://www.loc.gov/item/00652085/?fo=json");
  assert.equal(loc?.meta?.canonical, "https://www.loc.gov/item/00652085/");
  assert.match(corpusText(docs), /Page: https:\/\/www\.loc\.gov\/item\/00652085\/ \(catalogued item/);
});

test("plainText strips JATS and HTML", () => {
  assert.equal(plainText("<jats:p>CRISPR &amp; Cas9 <i>in vivo</i></jats:p>"), "CRISPR & Cas9 in vivo");
  assert.equal(plainText(["a", "b"]), "a b");
});
