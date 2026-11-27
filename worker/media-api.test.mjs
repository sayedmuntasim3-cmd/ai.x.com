import test from "node:test";
import assert from "node:assert/strict";
import { handleMedia, searchOptions } from "./media-api.mjs";

test("the library's routes: sources list, search with cache, other paths left alone", async () => {
  const get = (path) => new Request(`https://x.test${path}`);
  const url = (r) => new URL(r.url);
  const other = get("/api/films");
  assert.equal(await handleMedia(other, url(other), {}), null);

  const src = get("/api/media/sources");
  const s = await (await handleMedia(src, url(src), {}, { cache: null })).json();
  assert.ok(s.sources.length >= 20 && s.enabled > 0, "the engine's archives are listed");

  const short = get("/api/media/search?q=a");
  assert.equal((await handleMedia(short, url(short), {}, { cache: null })).status, 400);

  /** @type {Map<string, Response>} */
  const store = new Map();
  const cache = { match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => { store.set(r.url, res); } };
  let calls = 0;
  const search = async (o) => { calls += 1; return { query: o.query, results: [{ id: "1" }], sources: [{ id: "nasa", status: "ok" }] }; };
  /** @type {Promise<unknown>[]} */
  const waits = [];
  const req = get("/api/media/search?q=panama+canal&rights=attribution");
  const one = await (await handleMedia(req, url(req), {}, { cache, search, waitUntil: (p) => waits.push(p) })).json();
  await Promise.all(waits);
  const two = await (await handleMedia(req, url(req), {}, { cache, search })).json();
  assert.deepEqual(two, one);
  assert.equal(calls, 1, "a repeated search is answered from the cache");
  assert.equal(searchOptions(new URL("https://x.test/?q=" + "a".repeat(500)), {}).query.length, 200);
});

test("an answer holding NARA results is never cached (NARA's terms)", async () => {
  const store = new Map();
  const cache = { match: async (r) => store.get(r.url)?.clone(), put: async (r, res) => { store.set(r.url, res); } };
  const search = async (o) => ({ query: o.query, results: [{ id: "nara:1", source: "nara" }], sources: [{ id: "nara", status: "ok" }] });
  const waits = [];
  const req = new Request("https://x.test/api/media/search?q=hoover+dam");
  await handleMedia(req, new URL(req.url), {}, { cache, search, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  assert.equal(store.size, 0);
});

test("LoC refused by the Worker's address is reported as runner-only, not as an error", async () => {
  const search = async (o) => ({ query: o.query, results: [], sources: [{ id: "loc", status: "error", error: "not authorised" }, { id: "nasa", status: "empty" }] });
  const req = new Request("https://x.test/api/media/search?q=hoover+dam");
  const r = await (await handleMedia(req, new URL(req.url), {}, { cache: null, search })).json();
  assert.equal(r.sources[0].status, "runner-only");
  assert.equal(r.sources[0].error, undefined);
  assert.equal(r.sources[1].status, "empty");
});
