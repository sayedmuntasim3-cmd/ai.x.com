import assert from "node:assert/strict";
import {
  ProviderError,
  classifyLicense,
  createRateLimiter,
  fetchShotMedia,
  mediaCacheKey,
  normalizeShotQuery,
} from "../src/documentary-media-fetch.mjs";

const cases = [];
async function test(name, fn) {
  try { await fn(); cases.push({ name, status: "PASS" }); }
  catch (error) { cases.push({ name, status: "FAIL", error: error instanceof Error ? error.message : String(error) }); }
}

const item = (source, id, license, extra = {}) => ({
  id: source + ":" + id, source, mediaType: "image", title: id, previewUrl: "https://x/" + id + ".jpg", mediaUrl: "https://x/" + id + ".jpg",
  sourcePageUrl: "https://x/" + id, creator: "c", license, licenseUrl: null, durationSeconds: null, width: 4000, height: 3000, attributionRequired: false, ...extra,
});
const memoryCache = () => {
  const store = new Map();
  return { store, get: async (key) => store.get(key) ?? null, put: async (key, value) => { store.set(key, value); } };
};
const provider = (id, layer, results, calls = { n: 0 }, extra = {}) => ({
  id, layer, kinds: ["image", "video"], cacheTtlSeconds: 86400, rate: { capacity: 10, windowSeconds: 60 },
  search: async () => { calls.n += 1; if (results instanceof Error) throw results; return results; }, ...extra,
});
const generated = (layer, id) => ({ ...item("zupona", id, null), layer, rights: { licenseId: "ZUPONA-PROCEDURAL", allowed: true, needsPageCheck: false, reason: "made in house" } });
const deps = (providers, extra = {}) => ({ providers, cache: memoryCache(), limiter: createRateLimiter(), sleep: async () => {}, ...extra });
const verified = { verifyItem: async () => true };

await test("licence classifier allows only clearly reusable licences", () => {
  const allowed = [
    ["pexels", "Pexels License (review current terms)"], ["pixabay", "Pixabay Content License (check current terms)"],
    ["openverse", "cc0 1.0"], ["openverse", "pdm 1.0"], ["openverse", "by 4.0"], ["wikimedia", "CC BY 4.0"], ["wikimedia", "CC-BY-4.0"],
    ["wikimedia", "Public domain"], ["wikimedia", "Copyrighted free use"], ["wikimedia", "No restrictions"], ["wikimedia", "Attribution"],
    ["europeana", "Creative Commons Attribution 4.0 International"], ["flickr", "Public Domain Mark 1.0"], ["cleveland", "CC0"],
    ["smithsonian", "Smithsonian Open Access / CC0 (search filtered to online_media_usage:CC0; verify item record)"],
    ["met", "Open Access / public domain (API marks isPublicDomain=true)"], ["artic", "Public domain artwork (API marks is_public_domain=true; verify item record)"],
    ["nasa", "NASA media usage guidelines; verify item-specific restrictions"], ["internet_archive", "http://creativecommons.org/licenses/by/4.0/"],
    ["internet_archive", "http://creativecommons.org/licenses/publicdomain/"],
  ];
  for (const [source, license] of allowed) assert.equal(classifyLicense({ source, license, licenseUrl: null }).allowed, true, source + ": " + license);
  const blocked = [
    ["openverse", "by-sa 4.0"], ["wikimedia", "CC BY-SA 3.0"], ["wikimedia", "CC BY-SA 3.0 igo"], ["flickr", "CC BY-SA 2.0"],
    ["europeana", "Creative Commons Attribution-NonCommercial 4.0"], ["internet_archive", "http://creativecommons.org/licenses/by-nc/3.0/"],
    ["internet_archive", "http://creativecommons.org/licenses/by-nd/4.0/"], ["loc", "Library of Congress rights/advisory status must be checked on the item page"],
    ["europeana", "http://rightsstatements.org/vocab/InC/1.0/"], ["dpla", null], ["wikimedia", "Check file page license"],
    ["nasa", "Image courtesy ESA"], ["nasa", "© SpaceX"],
  ];
  for (const [source, license] of blocked) assert.equal(classifyLicense({ source, license, licenseUrl: null }).allowed, false, source + ": " + license);
});
await test("only Pexels, Pixabay and Smithsonian CC0 skip the item-page check", () => {
  for (const [source, license] of [["pexels", "x"], ["pixabay", "x"], ["smithsonian", "CC0"]]) assert.equal(classifyLicense({ source, license, licenseUrl: null }).needsPageCheck, false, source);
  for (const [source, license] of [["openverse", "cc0 1.0"], ["wikimedia", "Public domain"], ["nasa", "NASA"], ["met", "public domain"]]) assert.equal(classifyLicense({ source, license, licenseUrl: null }).needsPageCheck, true, source);
});
await test("queries normalise case, spacing and Unicode forms", async () => {
  assert.equal(normalizeShotQuery("  Giza   PYRAMIDS\n dawn "), "giza pyramids dawn");
  assert.equal(await mediaCacheKey("p", "image", normalizeShotQuery("Giza  pyramids")), await mediaCacheKey("p", "image", "giza pyramids"));
  assert.notEqual(await mediaCacheKey("p", "image", "giza"), await mediaCacheKey("p", "video", "giza"));
});
await test("items needing a page check are dropped unless a verifier clears them", async () => {
  const providers = [provider("openverse", 1, [item("openverse", "1", "cc0 1.0"), item("openverse", "2", "cc0 1.0")])];
  assert.equal((await fetchShotMedia({ shotId: "s", query: "old map", kind: "image" }, deps(providers))).candidates.length, 0);
  assert.equal((await fetchShotMedia({ shotId: "s", query: "old map", kind: "image" }, deps(providers, verified))).candidates.length, 2);
  const picky = { verifyItem: async (c) => { if (c.id === "openverse:1") throw new Error("page gone"); return true; } };
  assert.deepEqual((await fetchShotMedia({ shotId: "s", query: "old map", kind: "image" }, deps(providers, picky))).candidates.map((c) => c.id), ["openverse:2"]);
});
await test("blocked licences are dropped and Layer 2 tops up Layer 1", async () => {
  const d = deps([
    provider("openverse", 1, [item("openverse", "1", "cc0 1.0"), item("openverse", "2", "by-sa 4.0")]),
    provider("pexels", 2, [item("pexels", "3", "Pexels License"), item("pexels", "4", "Pexels License")]),
  ], verified);
  const result = await fetchShotMedia({ shotId: "s1", query: "Giza pyramids", kind: "image" }, d);
  assert.equal(result.layerUsed, 2);
  assert.deepEqual(result.candidates.map((c) => c.id), ["openverse:1", "pexels:3", "pexels:4"]);
  assert.equal(result.candidates[0].layer, 1); assert.equal(result.candidates[1].rights.licenseId, "PEXELS");
});
await test("a repeated search is served from the cache without calling the provider", async () => {
  const calls = { n: 0 };
  const d = deps([provider("pexels", 2, [item("pexels", "a", "Pexels License")], calls)]);
  await fetchShotMedia({ shotId: "s1", query: "Nile felucca", kind: "image" }, d);
  const again = await fetchShotMedia({ shotId: "s2", query: "  NILE felucca ", kind: "image" }, d);
  assert.equal(calls.n, 1); assert.equal(again.trace[0].outcome, "cached");
});
await test("a corrupt cache entry or a non-array provider answer is ignored, not fatal", async () => {
  const cache = memoryCache();
  const key = await mediaCacheKey("pexels", "image", "desert");
  cache.store.set(key, JSON.stringify({ not: "an array" }));
  const d = deps([provider("pexels", 2, [item("pexels", "a", "Pexels License")])], { cache });
  assert.equal((await fetchShotMedia({ shotId: "s", query: "desert", kind: "image" }, d)).candidates.length, 1);
  const odd = await fetchShotMedia({ shotId: "s", query: "camel", kind: "image" }, deps([provider("pexels", 2, { results: [] })]));
  assert.equal(odd.trace[0].outcome, "empty");
});
await test("identical searches at the same moment share one upstream call", async () => {
  const calls = { n: 0 };
  const slow = provider("pexels", 2, [], calls, { search: async () => { calls.n += 1; await new Promise((r) => setTimeout(r, 50)); return [item("pexels", "a", "Pexels License")]; } });
  const d = deps([slow], { cache: null });
  const results = await Promise.all([1, 2, 3].map((n) => fetchShotMedia({ shotId: "s" + n, query: "desert road", kind: "image" }, d)));
  assert.equal(calls.n, 1);
  assert.ok(results.every((r) => r.candidates.length === 1));
});
await test("media already used in the film, wrong kind, no URL or low resolution are skipped", async () => {
  const d = deps([provider("pexels", 2, [
    item("pexels", "used", "Pexels License"), item("pexels", "vid", "Pexels License", { mediaType: "video" }),
    item("pexels", "nourl", "Pexels License", { mediaUrl: null }), item("pexels", "small", "Pexels License", { width: 640 }),
    item("pexels", "ok", "Pexels License"),
  ])], { used: new Set(["pexels:used"]) });
  const result = await fetchShotMedia({ shotId: "s", query: "barber shop", kind: "image" }, d);
  assert.deepEqual(result.candidates.map((c) => c.id), ["pexels:ok"]);
});
await test("empty Layers 1 and 2 fall through to the fallbacks in order", async () => {
  const order = [];
  const fallback = (layer, produce) => ({ layer, run: async () => { order.push(layer); return produce ? [generated(layer, "g" + layer)] : []; } });
  const d = deps([provider("openverse", 1, [])], { fallbacks: [fallback(4, false), fallback(5, false), fallback(3, true)] });
  const result = await fetchShotMedia({ shotId: "s", query: "grain ration chart", kind: "image" }, d);
  assert.deepEqual(order, [4, 5, 3]); assert.equal(result.layerUsed, 3);
  assert.deepEqual(result.trace.slice(1).map((t) => t.outcome), ["empty", "empty", "ok"]);
});
await test("a fallback that throws is recorded and the next fallback still runs", async () => {
  const d = deps([], { fallbacks: [{ layer: 4, run: async () => { throw new Error("no source frame"); } }, { layer: 3, run: async () => [generated(3, "ai")] }] });
  const result = await fetchShotMedia({ shotId: "s", query: "workers village", kind: "image" }, d);
  assert.equal(result.layerUsed, 3); assert.equal(result.trace[0].outcome, "unavailable");
});
await test("a provider out of quota is skipped, not waited for, and the shot is still filled", async () => {
  const limiter = createRateLimiter({ now: () => 0 });
  const p = provider("pexels", 2, [item("pexels", "a", "Pexels License")], { n: 0 }, { rate: { capacity: 1, windowSeconds: 3600 } });
  const d = deps([p], { limiter, cache: null, fallbacks: [{ layer: 4, run: async () => [generated(4, "map")] }] });
  await fetchShotMedia({ shotId: "s1", query: "first query", kind: "image" }, d);
  const second = await fetchShotMedia({ shotId: "s2", query: "second query", kind: "image" }, d);
  assert.equal(second.trace[0].outcome, "skipped_busy"); assert.equal(second.layerUsed, 4);
});
await test("skipped requests use no slot, so the provider reopens after one window", () => {
  let t = 0;
  const limiter = createRateLimiter({ now: () => t });
  let granted = 0;
  for (let i = 0; i < 1118; i += 1) if (limiter.acquire("pexels", 200, 3600, 15_000).granted) granted += 1;
  assert.ok(granted <= 205, "granted " + granted);
  t = 3600 * 1000; assert.equal(limiter.acquire("pexels", 200, 3600, 15_000).waitMs, 0);
});
await test("a 429 closes the provider for everyone, including searches already waiting", async () => {
  // Driven step by step with gates instead of timers, so the order cannot change on a busy machine.
  const gate = () => { let open; const promise = new Promise((r) => { open = r; }); return { promise, open }; };
  const until = async (check) => { while (!check()) await new Promise((r) => setImmediate(r)); };
  const firstGate = gate();
  const secondGate = gate();
  let secondWaiting = false;
  const limiter = createRateLimiter({ now: () => 0 });
  const calls = { n: 0 };
  const p = provider("pexels", 2, [], calls, { rate: { capacity: 1, windowSeconds: 10 }, search: async (q) => { calls.n += 1; if (q === "first") { await firstGate.promise; throw new ProviderError("rate_limited", 120_000); } return [item("pexels", "x", "Pexels License")]; } });
  const d = deps([p], { limiter, cache: null, sleep: () => { secondWaiting = true; return secondGate.promise; } });
  // "first" takes the only slot; "second" gets the next one and waits for it.
  const firstRun = fetchShotMedia({ shotId: "a", query: "first", kind: "image" }, d);
  await until(() => calls.n === 1);
  const secondRun = fetchShotMedia({ shotId: "b", query: "second", kind: "image" }, d);
  await until(() => secondWaiting);
  // "first" now receives the 429 while "second" is still waiting.
  firstGate.open();
  const first = await firstRun;
  secondGate.open();
  const second = await secondRun;
  assert.equal(first.trace[0].outcome, "rate_limited"); assert.equal(second.trace[0].outcome, "rate_limited"); assert.equal(calls.n, 1);
});
await test("after a 429 the provider reopens one request per slot, not all at once", () => {
  let t = 0;
  const limiter = createRateLimiter({ now: () => t });
  limiter.penalize("p", 5_000, 2, 60);
  assert.deepEqual(Array.from({ length: 4 }, () => limiter.acquire("p", 2, 60).waitMs), [5_000, 35_000, 65_000, 95_000]);
});
await test("the limiter allows a burst up to capacity, then paces", () => {
  let t = 0;
  const limiter = createRateLimiter({ now: () => t });
  assert.deepEqual(Array.from({ length: 5 }, () => limiter.acquire("p", 4, 60).waitMs), [0, 0, 0, 0, 15_000]);
  t = 30_000; assert.equal(limiter.acquire("p", 4, 60).waitMs, 0);
});
await test("a failing provider or broken cache never stops the other providers", async () => {
  const brokenCache = { get: async () => { throw new Error("kv down"); }, put: async () => { throw new Error("kv down"); } };
  const d = deps([provider("nasa", 1, new Error("boom")), provider("met", 1, [item("met", "1", "Open Access / public domain"), item("met", "2", "Open Access / public domain"), item("met", "3", "Open Access / public domain")])], { cache: brokenCache, ...verified });
  const result = await fetchShotMedia({ shotId: "s", query: "temple relief", kind: "image" }, d);
  assert.equal(result.layerUsed, 1); assert.equal(result.candidates.length, 3);
  assert.equal(result.trace.find((t) => t.provider === "nasa").outcome, "unavailable");
});
await test("a too-short query calls no provider", async () => {
  const calls = { n: 0 };
  const result = await fetchShotMedia({ shotId: "s", query: " a ", kind: "image" }, deps([provider("pexels", 2, [], calls)]));
  assert.equal(calls.n, 0); assert.equal(result.candidates.length, 0);
});

console.log(cases.map((c) => c.status + " " + c.name + (c.error ? " — " + c.error : "")).join("\n"));
const failures = cases.filter((c) => c.status === "FAIL");
console.log("\n" + (cases.length - failures.length) + "/" + cases.length + " documentary media fetch cases passed.");
if (failures.length) process.exitCode = 1;
