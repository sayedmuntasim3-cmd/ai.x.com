import test from "node:test";
import assert from "node:assert/strict";
import { archiveKeys } from "../src/open-archives.mjs";
import { searchMedia } from "../src/open-archives-lib.mjs";

const json = (/** @type {any} */ o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });

test("API keys are trimmed: a secret pasted with a trailing tab/newline still works", async () => {
  assert.equal(archiveKeys({ DVIDS_API_KEY: "key-abc\t\n", EUROPEANA_API_KEY: " \n" }).DVIDS_API_KEY, "key-abc");
  assert.equal("EUROPEANA_API_KEY" in archiveKeys({ EUROPEANA_API_KEY: " \n" }), false);
  /** @type {string[]} */
  const urls = [];
  const fetch = async (/** @type {any} */ u) => { urls.push(String(u)); return json({ results: [] }); };
  await searchMedia({ query: "hoover dam", sources: ["dvids"], rights: "attribution", minSize: 0, perSource: 4, limit: 5, timeoutMs: 3000 }, { DVIDS_API_KEY: "key-abc\t\n" }, { fetch });
  assert.equal(new URL(urls[0] ?? "").searchParams.get("api_key"), "key-abc");
});

test("NASA: an item that only mentions the terms in its description ('85 Hoover Dams') is dropped; the title must carry them", async () => {
  const item = (id, title, description) => ({ data: [{ nasa_id: id, title, description, media_type: "image" }], links: [{ rel: "canonical", href: `https://a.test/${id}.jpg` }] });
  const fetch = async () => json({ collection: { items: [
    item("a", "Saturn Apollo Program", "The Saturn V engines produced as much power as 85 Hoover Dams."),
    item("iss057e055571", "iss057e055571", "Teton Dam region seen from the ISS"),
    item("c", "Hoover Dam at dusk", "Colorado River")
  ] } });
  const res = await searchMedia({ query: "Hoover Dam", sources: ["nasa"], rights: "attribution", minSize: 0, perSource: 6, limit: 10, timeoutMs: 3000 }, {}, { fetch });
  assert.deepEqual(res.results.map((r) => r.title), ["Hoover Dam at dusk"]);
  const teton = await searchMedia({ query: "Teton Dam", sources: ["nasa"], rights: "attribution", minSize: 0, perSource: 6, limit: 10, timeoutMs: 3000 }, {}, { fetch });
  assert.deepEqual(teton.results, []);
});

test("LoC: Retry-After of ~18 minutes opens the breaker; the next query answers at once with 'rate limited until'", async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return new Response("<title>Just a moment...</title>", { status: 429, headers: { "retry-after": "1129", "content-type": "text/html" } }); };
  const ask = (q) => searchMedia({ query: q, sources: ["loc"], rights: "attribution", minSize: 0, perSource: 4, limit: 5, timeoutMs: 3000 }, {}, { fetch });
  const first = await ask("hoover dam");
  assert.match(String(first.sources[0]?.error), /rate limited until/);
  const t0 = Date.now();
  const second = await ask("teton dam");
  assert.ok(Date.now() - t0 < 1000, "no waiting");
  assert.match(String(second.sources[0]?.error), /rate limited until/);
  assert.equal(calls, 1, "LoC was asked once, then left alone");
});
