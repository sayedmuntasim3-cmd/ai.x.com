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
