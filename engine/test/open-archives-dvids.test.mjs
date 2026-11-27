import test from "node:test";
import assert from "node:assert/strict";
import { searchMedia } from "../src/open-archives-lib.mjs";
import { archiveKeys } from "../src/open-archives.mjs";

const json = (/** @type {any} */ o) => new Response(JSON.stringify(o), { headers: { "content-type": "application/json" } });
const hit = (/** @type {string} */ id, /** @type {string} */ title) => ({ id, title, type: id.split(":")[0], url: `https://www.dvidshub.net/x/${id}`, thumbnail: "https://t.test/t.jpg" });
const asset = (/** @type {string} */ id, /** @type {any} */ extra = {}) => ({ results: { id, title: `T ${id}`, description: "Army engineers repair the dam.", image: `https://cdn.test/${id.replace(":", "-")}.jpg`, thumbnail: "https://t.test/t.jpg", url: `https://www.dvidshub.net/${id}`, credit: [{ name: "Jane Doe", rank: "Sgt." }], unit_name: "US Army Corps of Engineers", dimensions: { width: "4000", height: "2600" }, date: "2020-05-01T00:00:00-04:00", ...extra } });

function fakeFetch(/** @type {Record<string, any>} */ assets) {
  /** @type {string[]} */
  const urls = [];
  const fetch = async (/** @type {any} */ u) => {
    const url = String(u);
    urls.push(url);
    if (url.startsWith("https://api.dvidshub.net/search")) return json({ results: Object.keys(assets).map((id) => hit(id, id)) });
    if (url.startsWith("https://api.dvidshub.net/asset")) return json(assets[new URL(url).searchParams.get("id") ?? ""]);
    return json({});
  };
  return { fetch, urls };
}
const run = (/** @type {any} */ fetch, /** @type {any} */ env) => searchMedia({ query: "hoover dam", sources: ["dvids"], rights: "attribution", minSize: 1000, perSource: 6, limit: 10, timeoutMs: 3000 }, env, { fetch });

test("DVIDS is asked only with its key, and archiveKeys passes the key through", async () => {
  assert.equal(archiveKeys({ DVIDS_API_KEY: "k" }).DVIDS_API_KEY, "k");
  const f = fakeFetch({ "image:1": asset("image:1") });
  const res = await run(f.fetch, {});
  assert.equal(f.urls.length, 0);
  assert.equal(res.results.length, 0);
});

test("DVIDS returns full-resolution public-domain images and video frames with credit lines", async () => {
  const f = fakeFetch({ "image:1": asset("image:1"), "video:2": asset("video:2", { dimensions: undefined }) });
  const res = await run(f.fetch, { DVIDS_API_KEY: "k" });
  assert.equal(res.results.length, 2);
  const img = res.results.find((r) => r.id.includes("image"));
  assert.ok(img);
  assert.equal(img.fullUrl, "https://cdn.test/image-1.jpg");
  assert.equal(img.license.code, "us-government");
  assert.match(String(img.creator), /Sgt\. Jane Doe/);
  assert.match(String(img.creator), /Corps of Engineers/);
  assert.ok(f.urls[0]?.includes("type%5B%5D=image") && f.urls[0]?.includes("type%5B%5D=video"), f.urls[0]);
});

test("DVIDS skips items marked copyrighted or courtesy, and items without a full-size file", async () => {
  const f = fakeFetch({
    "image:1": asset("image:1", { description: "© 2019 Photographer. Used with permission." }),
    "image:2": asset("image:2", { credit: "Courtesy" }),
    "image:3": asset("image:3", { image: undefined }),
    "image:4": asset("image:4")
  });
  const res = await run(f.fetch, { DVIDS_API_KEY: "k" });
  assert.deepEqual(res.results.map((r) => r.id.split(":").slice(-2).join(":")), ["image:4"]);
});
