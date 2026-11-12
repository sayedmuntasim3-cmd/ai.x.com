import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chapterMedia, createUseHistory, mediaProviders, pexelsProvider, pixabayProvider, stockShots } from "../src/film-media.mjs";

const USA_C1 = readFileSync(new URL("../../productions/ramesh-babu/USA/s5-C1.md", import.meta.url), "utf8");

/** A fetch that answers like Pexels and Pixabay, with no network and no key. */
function fakeFetch(/** @type {{ status?: number, perQuery?: number }} */ o = {}) {
  /** @type {{ url: string, headers: any }[]} */
  const calls = [];
  /** @param {string} url @param {any} [init] */
  const f = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    if (o.status) return new Response("{}", { status: o.status, headers: { "retry-after": "30" } });
    const q = new URL(url).searchParams.get(url.includes("pexels") ? "query" : "q") ?? "";
    const n = o.perQuery ?? 2;
    const seed = [...q].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    if (url.startsWith("https://api.pexels.com/videos/")) {
      return Response.json({ videos: Array.from({ length: n }, (_, i) => ({ id: seed * 10 + i, url: `https://www.pexels.com/video/x-${seed * 10 + i}/`, image: "https://images.pexels.com/p.jpg", duration: 12, user: { name: "Ana" }, width: 3840, height: 2160, video_files: [{ link: `https://videos.pexels.com/${seed}-${i}-4k.mp4`, file_type: "video/mp4", width: 3840, height: 2160 }, { link: `https://videos.pexels.com/${seed}-${i}-hd.mp4`, file_type: "video/mp4", width: 1920, height: 1080 }] })) });
    }
    if (url.startsWith("https://pixabay.com/api/videos/")) {
      return Response.json({ hits: Array.from({ length: n }, (_, i) => ({ id: seed * 10 + i, pageURL: `https://pixabay.com/videos/y-${seed * 10 + i}/`, duration: 9, user: "Ben", tags: q, videos: { large: { url: `https://cdn.pixabay.com/${seed}-${i}.mp4`, width: 1920, height: 1080, thumbnail: "t.jpg" } } })) });
    }
    return Response.json({});
  };
  return { f, calls };
}

test("stock shots carry their own film times and their own query group", () => {
  const shots = stockShots(USA_C1);
  assert.ok(shots.length > 40);
  const [razor, emblem, aerial] = shots;
  assert.deepEqual([razor.scene, razor.start, razor.end, razor.queries[0]], ["SC0001", 0, 3, "straight razor leather strop close"]);
  assert.equal(emblem.queries[0], "luxury car emblem macro");
  assert.equal(aerial.queries[0], "bangalore city aerial", "the clip number in the SRC link ties the shot to its group");
  assert.equal(aerial.start, 5);
  assert.ok(!shots.some((s) => s.rung === "R1"), "graphics shots need no footage");
});

test("Pexels and Pixabay results map to licensed candidates; keys go only where they belong", async () => {
  const { f, calls } = fakeFetch();
  const signal = AbortSignal.timeout(1000);
  const px = await pexelsProvider({ apiKey: "PX", fetch: f }).search("old mill", "video", signal);
  assert.equal(px[0].mediaUrl?.endsWith("-hd.mp4"), true, "the HD file is preferred over 4K");
  assert.equal(px[0].license, "Pexels License");
  assert.equal(calls[0].headers.Authorization, "PX");
  const pb = await pixabayProvider({ apiKey: "PB", fetch: f }).search("old mill", "video", signal);
  assert.equal(pb[0].source, "pixabay");
  assert.ok(calls[1].url.includes("key=PB") && !calls[0].url.includes("PB"));
  assert.deepEqual(mediaProviders({ pixabayKey: "PB" }).map((p) => p.id), ["wikimedia", "nasa", "loc", "met", "artic", "openverse", "pixabay"], "the free archives need no key");
  assert.deepEqual(mediaProviders({ archives: false }), []);
});

test("a chapter gets a free clip per shot, with its licence record, and never repeats one within 10 minutes", async () => {
  const { f } = fakeFetch({ perQuery: 3 });
  const providers = mediaProviders({ pexelsKey: "PX", pixabayKey: "PB", fetch: f });
  const media = await chapterMedia({ chapter: "C1", markdown: USA_C1, providers, sleep: async () => {} });
  assert.equal(media.stats.shots, stockShots(USA_C1).length);
  assert.ok(media.stats.found > 30, JSON.stringify(media.stats));
  for (const s of media.shots.filter((x) => x.pick)) {
    assert.ok(["PEXELS", "PIXABAY"].includes(s.pick?.licence.licenseId ?? ""));
    assert.ok(s.pick?.licence.sourcePageUrl.startsWith("https://"));
  }
  const picks = media.shots.filter((s) => s.pick).map((s) => ({ id: s.pick?.id, at: s.start }));
  for (const a of picks) for (const b of picks) if (a !== b && a.id === b.id) assert.ok(Math.abs(a.at - b.at) >= 600, `${a.id} repeats within 10 minutes`);
});

test("a clip may come back after 10 minutes; non-free and rate-limited results are never picked", async () => {
  const md = [0, 300, 700].map((t, i) => `**SC000${i + 1}** | 0:${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}-0:${String(Math.floor((t + 10) / 60)).padStart(2, "0")}:${String((t + 10) % 60).padStart(2, "0")} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R3 mill; (2) R1 kinetic card | SRC: Pexels · Q1 "old mill" | LOOK: L`).join("\n");
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const stock = { id: "stock", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    return [
      { id: "nc:1", source: "other", mediaType: "video", title: "", previewUrl: null, mediaUrl: "https://x/nc.mp4", sourcePageUrl: "https://x/nc", creator: null, license: "CC BY-NC 4.0", licenseUrl: null, durationSeconds: 5, width: 1920, height: 1080, attributionRequired: true },
      { id: "pexels:video:7", source: "pexels", mediaType: "video", title: "", previewUrl: null, mediaUrl: "https://x/7.mp4", sourcePageUrl: "https://www.pexels.com/video/7/", creator: "Ana", license: "Pexels License", licenseUrl: null, durationSeconds: 5, width: 1920, height: 1080, attributionRequired: false },
    ];
  } };
  const media = await chapterMedia({ chapter: "C1", markdown: md, providers: [stock], history: createUseHistory() });
  assert.deepEqual(media.shots.map((s) => s.status), ["found", "missing", "found"], "the only free clip is blocked at 5:00 and free again at 11:40");
  assert.ok(media.shots.every((s) => s.pick?.id !== "nc:1"));

  const limited = fakeFetch({ status: 429 });
  const none = await chapterMedia({ chapter: "C1", markdown: md, providers: mediaProviders({ pexelsKey: "PX", fetch: limited.f, archives: false }), sleep: async () => {} });
  assert.equal(none.stats.found, 0);
  assert.equal(none.shots[0].trace[0].outcome, "rate_limited");
  assert.equal(limited.calls.length, 1, "after a 429 the provider is closed instead of hammered");
});

test("with a judge, only a clip it says fits is used; nothing fitting means no clip, and a failed judge falls back", async () => {
  const md = [0, 20, 40].map((t, i) => `**SC000${i + 1}** | 0:00:${String(t).padStart(2, "0")}-0:00:${String(t + 10).padStart(2, "0")} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R3 old mill wheel turning | SRC: Pexels · Q1 "old mill" | LOOK: L`).join("\n");
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const stock = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    return [1, 2, 3].map((n) => ({ id: `pexels:video:${n}`, source: "pexels", mediaType: "video", title: `clip ${n}`, previewUrl: `https://images.pexels.com/${n}.jpg?w=320`, mediaUrl: `https://v/${n}.mp4`, sourcePageUrl: `https://www.pexels.com/video/${n}/`, creator: null, license: "Pexels License", licenseUrl: null, durationSeconds: 8, width: 1920, height: 1080, attributionRequired: false }));
  } };
  /** @type {any[]} */
  const asked = [];
  const media = await chapterMedia({ chapter: "C1", markdown: md, providers: [stock], judge: async (chapter, shots) => {
    asked.push({ chapter, keys: shots.map((s) => s.key), n: shots[0].candidates.length, desc: shots[0].description });
    // Shot 1 and 2 both like clip 2 best; shot 3 sees nothing that fits.
    return { "SC0001-1": [1, 0], "SC0002-1": [1, 2], "SC0003-1": [] };
  } });
  assert.deepEqual(asked, [{ chapter: "C1", keys: ["SC0001-1", "SC0002-1", "SC0003-1"], n: 3, desc: "R3 old mill wheel turning" }], "one batched request");
  assert.deepEqual(media.shots.map((s) => [s.pick?.id ?? null, s.review]), [["pexels:video:2", "fit"], ["pexels:video:3", "fit"], [null, "none-fit"]], "the judge's order is kept, the 10-minute rule still applies, and a misfit is never used");
  assert.equal(media.stats.missing, 1);

  const fallback = await chapterMedia({ chapter: "C1", markdown: md, providers: [stock], judge: async () => { throw new Error("image fetch failed"); } });
  assert.deepEqual(fallback.shots.map((s) => [s.pick?.id, s.review]), [["pexels:video:1", "unreviewed"], ["pexels:video:2", "unreviewed"], ["pexels:video:3", "unreviewed"]]);
});

test("Pexels previews are asked for at 320 px, so the judge's images stay cheap", async () => {
  const f = /** @type {any} */ (async () => Response.json({ videos: [{ id: 5, url: "https://www.pexels.com/video/5/", image: "https://images.pexels.com/videos/5/pictures/preview-0.jpg?auto=compress&cs=tinysrgb&fit=crop&h=630&w=1200", video_files: [{ link: "https://v/5.mp4", file_type: "video/mp4", width: 1920, height: 1080 }] }] }));
  const [r] = await pexelsProvider({ apiKey: "k", fetch: f }).search("x", "video", AbortSignal.timeout(1000));
  const u = new URL(String(r.previewUrl));
  assert.equal(u.searchParams.get("w"), "320");
  assert.equal(u.searchParams.get("h"), null);
});

// Shaped like the real Commons and NASA answers (the APIs are not reachable from the build sandbox).
const COMMONS = { batchcomplete: true, query: { pages: [
  { pageid: 11, ns: 6, title: "File:Apollo 11 launch.jpg", index: 2, imageinfo: [{ size: 1, width: 3000, height: 2000, thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Apollo_11_launch.jpg/1920px-Apollo_11_launch.jpg", url: "https://upload.wikimedia.org/wikipedia/commons/a/ab/Apollo_11_launch.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Apollo_11_launch.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "Public domain" }, License: { value: "pd" }, Artist: { value: "<a href=\"//nasa.gov\">NASA</a>" }, Restrictions: { value: "" } } }] },
  { pageid: 12, ns: 6, title: "File:Crowd at the launch.jpg", index: 1, imageinfo: [{ size: 1, width: 4000, height: 3000, thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Crowd.jpg/1920px-Crowd.jpg", url: "https://upload.wikimedia.org/c.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Crowd_at_the_launch.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC BY 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0" }, Artist: { value: "Jane Roe" }, AttributionRequired: { value: "true" }, Restrictions: { value: "personality" } } }] },
  { pageid: 13, ns: 6, title: "File:Rocket model.jpg", index: 3, imageinfo: [{ size: 1, width: 2400, height: 1600, thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/Rocket.jpg/1920px-Rocket.jpg", url: "https://upload.wikimedia.org/e.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Rocket_model.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC BY-SA 4.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0" }, Artist: { value: "John Doe" }, AttributionRequired: { value: "true" }, Restrictions: { value: "" } } }] },
  { pageid: 14, ns: 6, title: "File:Saturn V on the pad.jpg", index: 4, imageinfo: [{ size: 1, width: 2800, height: 2100, thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/SaturnV.jpg/1920px-SaturnV.jpg", url: "https://upload.wikimedia.org/s.jpg", descriptionurl: "https://commons.wikimedia.org/wiki/File:Saturn_V_on_the_pad.jpg", mime: "image/jpeg", extmetadata: { LicenseShortName: { value: "CC BY 2.0" }, LicenseUrl: { value: "https://creativecommons.org/licenses/by/2.0" }, Artist: { value: "Ann Lee" }, AttributionRequired: { value: "true" }, Restrictions: { value: "" } } }] },
] } };
const NASA = { collection: { items: [
  { href: "https://images-assets.nasa.gov/image/as11-40-5903/collection.json", data: [{ nasa_id: "as11-40-5903", media_type: "image", title: "Buzz Aldrin on the Moon", center: "JSC", description: "Astronaut on the lunar surface." }], links: [{ href: "https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~thumb.jpg", rel: "preview", render: "image" }] },
  { href: "https://images-assets.nasa.gov/image/esa-1/collection.json", data: [{ nasa_id: "esa-1", media_type: "image", title: "Comet", secondary_creator: "ESA/Rosetta", description: "Image courtesy of ESA." }], links: [{ href: "https://images-assets.nasa.gov/image/esa-1/esa-1~thumb.jpg", rel: "preview" }] },
] } };

test("free archives: Commons and NASA results carry their own rights; share-alike, restricted and third-party items are refused", async () => {
  /** @type {{ url: string, headers: any }[]} */
  const calls = [];
  const f = /** @type {any} */ (async (/** @type {string} */ url, /** @type {any} */ init) => { calls.push({ url, headers: init?.headers ?? {} }); return Response.json(url.includes("wikimedia") ? COMMONS : NASA); });
  const { wikimediaProvider, nasaProvider, verifyArchiveItem } = await import("../src/film-media.mjs");
  const { classifyLicense } = await import("../src/documentary-media-fetch.mjs");
  const commons = await wikimediaProvider({ fetch: f }).search("apollo 11 launch", "image", AbortSignal.timeout(1000));
  assert.deepEqual(commons.map((c) => c.id), ["wikimedia:12", "wikimedia:11", "wikimedia:13", "wikimedia:14"], "search order kept");
  assert.match(calls[0].url, /filetype%3Abitmap/);
  assert.match(String(calls[0].headers["user-agent"]), /^ZuponaStudio/, "Commons is told who is asking");
  const pd = commons[1];
  assert.equal(pd.mediaUrl, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Apollo_11_launch.jpg/1920px-Apollo_11_launch.jpg");
  assert.equal(pd.previewUrl, "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Apollo_11_launch.jpg/320px-Apollo_11_launch.jpg", "the judge sees a 320 px preview");
  assert.equal(pd.creator, "NASA", "HTML is stripped from the author");
  const verdict = async (/** @type {any} */ c) => { const rights = classifyLicense(c); return rights.allowed && (await verifyArchiveItem({ ...c, layer: 1, rights })); };
  assert.deepEqual(await Promise.all(commons.map(verdict)), [false, true, false, true], "personality-restricted and share-alike files are refused; public domain and CC BY pass");
  assert.equal(classifyLicense(commons[3]).licenseId, "CC-BY");
  const nasa = await nasaProvider({ fetch: f }).search("moon landing", "image", AbortSignal.timeout(1000));
  assert.equal(nasa[0].mediaUrl, "https://images-assets.nasa.gov/image/as11-40-5903/as11-40-5903~large.jpg");
  assert.equal(nasa[0].sourcePageUrl, "https://images.nasa.gov/details/as11-40-5903");
  assert.deepEqual(await Promise.all(nasa.map(verdict)), [true, false], "an ESA-credited picture is not NASA's to give");
});

test("an evidence shot (R2) takes a real archive photo first; a stock shot still prefers moving footage", async () => {
  const md = [
    "**SC0001** | 0:00:00-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R2 Apollo 11 launch, July 1969 | SRC: Commons · Q1 \"apollo 11 launch\" | LOOK: L",
    "**SC0002** | 0:00:06-0:00:12 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R3 a crowd on a beach at dawn | SRC: Pexels · Q1 \"crowd beach dawn\" | LOOK: L",
  ].join("\n");
  const f = /** @type {any} */ (async (/** @type {string} */ url) => Response.json(url.includes("wikimedia") ? COMMONS : url.includes("nasa") ? { collection: { items: [] } } : { videos: [{ id: 5, url: "https://www.pexels.com/video/5/", image: "https://images.pexels.com/5.jpg", duration: 9, user: { name: "Ana" }, video_files: [{ link: "https://v/5-hd.mp4", file_type: "video/mp4", width: 1920, height: 1080 }] }] }));
  const { mediaProviders: providersFor } = await import("../src/film-media.mjs");
  const media = await chapterMedia({ chapter: "C1", markdown: md, providers: providersFor({ pexelsKey: "PX", fetch: f }), sleep: async () => {} });
  const [evidence, stockShot] = media.shots;
  assert.equal(evidence.pick?.source, "wikimedia");
  assert.equal(evidence.pick?.kind, "image");
  assert.equal(evidence.pick?.licence.licenseId, "PUBLIC-DOMAIN");
  assert.equal(stockShot.pick?.id, "pexels:video:5");
  assert.equal(stockShot.pick?.kind, "video");
});

// Fixtures shaped like each archive's real API (the build sandbox cannot reach them; the first real run must confirm).
const LOC_SEARCH = { results: [
  { id: "http://www.loc.gov/item/2017659512/", title: "Brooklyn Bridge, New York, 1883", url: "https://www.loc.gov/item/2017659512/", image_url: ["https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c10200/3c10272_150px.jpg#h=150&w=200", "https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c10200/3c10272r.jpg#h=480&w=640", "https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c10200/3c10272v.jpg#h=1536&w=2048"] },
  { id: "http://www.loc.gov/item/2016800001/", title: "A studio portrait", url: "https://www.loc.gov/item/2016800001/", image_url: ["https://tile.loc.gov/x_150px.jpg#h=150&w=110"] },
  { id: "http://www.loc.gov/item/no-pictures/", title: "Text only" },
] };
const LOC_ITEMS = {
  "https://www.loc.gov/item/2017659512/?fo=json": { item: { rights_advisory: ["No known restrictions on publication."], contributor_names: ["Currier & Ives."] } },
  "https://www.loc.gov/item/2016800001/?fo=json": { item: { rights_advisory: ["Rights status not evaluated. For general information see ..."] } },
};
const MET_SEARCH = { total: 3, objectIDs: [436535, 11417, 999] };
const MET_OBJECTS = {
  436535: { objectID: 436535, isPublicDomain: true, primaryImage: "https://images.metmuseum.org/CRDImages/ep/original/DT1502.jpg", primaryImageSmall: "https://images.metmuseum.org/CRDImages/ep/web-large/DT1502.jpg", title: "Wheat Field with Cypresses", objectDate: "1889", artistDisplayName: "Vincent van Gogh", objectURL: "https://www.metmuseum.org/art/collection/search/436535" },
  11417: { objectID: 11417, isPublicDomain: false, primaryImage: "", title: "A later painting" },
};
const ARTIC = { config: { iiif_url: "https://www.artic.edu/iiif/2" }, data: [
  { id: 27992, title: "A Sunday on La Grande Jatte — 1884", image_id: "2d484387-2509-5e8e-2c43-22f9981972eb", artist_title: "Georges Seurat", date_display: "1884–86", is_public_domain: true },
  { id: 100, title: "Modern work", image_id: "abc", is_public_domain: false },
] };
const OPENVERSE = { results: [
  { id: "f1", title: "Harbour at dawn", url: "https://live.staticflickr.com/1/harbour_b.jpg", thumbnail: "https://api.openverse.org/v1/images/f1/thumb/", foreign_landing_url: "https://www.flickr.com/photos/ann/1", creator: "Ann", license: "by", license_version: "2.0", license_url: "https://creativecommons.org/licenses/by/2.0/", source: "flickr", filetype: "jpg", width: 2048, height: 1365, mature: false },
  { id: "f2", title: "Share-alike harbour", url: "https://x/2.jpg", license: "by-sa", license_version: "2.0", source: "flickr" },
  { id: "f3", title: "Commons copy", url: "https://x/3.jpg", license: "cc0", source: "wikimedia" },
  { id: "f4", title: "Old map", url: "https://x/4.png", license: "pdm", license_version: "1.0", license_url: "https://creativecommons.org/publicdomain/mark/1.0/", source: "flickr", filetype: "png", width: 3000, height: 2000 },
  { id: "f5", title: "An animation", url: "https://x/5.gif", license: "cc0", source: "flickr", filetype: "gif" },
] };
const SMITHSONIAN = { response: { rows: [
  { id: "edanmdm-nasm_A19610048000", title: "Wright Flyer", content: { descriptiveNonRepeating: { title: { content: "1903 Wright Flyer" }, record_link: "https://airandspace.si.edu/collection/id/nasm_A19610048000", data_source: "National Air and Space Museum", online_media: { media: [{ type: "Images", content: "https://ids.si.edu/ids/deliveryService?id=NASM-A19610048000-NASM2018-02858", thumbnail: "https://ids.si.edu/ids/deliveryService?id=NASM-A19610048000-NASM2018-02858&max=150", usage: { access: "CC0" } }] } }, freetext: { name: [{ label: "Manufacturer", content: "Wright Brothers" }] } } },
  { id: "edanmdm-restricted", title: "Restricted", content: { descriptiveNonRepeating: { online_media: { media: [{ type: "Images", content: "https://ids.si.edu/ids/deliveryService?id=R", usage: { access: "Usage conditions apply" } }] } } } },
] } };

/** A fetch that answers like the five newer archives. @param {string} url */
async function archiveFetch(url) {
  if (url.startsWith("https://www.loc.gov/photos/")) return Response.json(LOC_SEARCH);
  if (url.startsWith("https://www.loc.gov/item/")) { const body = /** @type {any} */ (LOC_ITEMS)[url]; return body ? Response.json(body) : new Response("no", { status: 404 }); }
  if (url.includes("metmuseum.org/public/collection/v1.1/search")) return Response.json(MET_SEARCH);
  const met = /\/objects\/(\d+)$/.exec(url);
  if (met) { const body = /** @type {any} */ (MET_OBJECTS)[met[1]]; return body ? Response.json(body) : new Response("gone", { status: 404 }); }
  if (url.startsWith("https://api.artic.edu/")) return Response.json(ARTIC);
  if (url.startsWith("https://api.openverse.org/")) return Response.json(OPENVERSE);
  if (url.startsWith("https://api.si.edu/")) return Response.json(SMITHSONIAN);
  return Response.json({});
}

test("more legal sources: the Library of Congress, the Met, the Art Institute, Openverse and the Smithsonian keep only free items", async () => {
  const { locProvider, metProvider, articProvider, openverseProvider, smithsonianProvider, verifyArchiveItem } = await import("../src/film-media.mjs");
  const { classifyLicense } = await import("../src/documentary-media-fetch.mjs");
  const f = /** @type {any} */ (archiveFetch);
  const sig = AbortSignal.timeout(1000);
  const verdict = async (/** @type {any} */ c) => { const rights = classifyLicense(c); return rights.allowed && (await verifyArchiveItem({ ...c, layer: 1, rights })) ? rights.licenseId : "refused"; };

  const loc = await locProvider({ fetch: f }).search("brooklyn bridge", "image", sig);
  assert.deepEqual(loc.map((c) => c.id), ["loc:item/2017659512"], "an item whose rights are not evaluated is dropped");
  assert.equal(loc[0].mediaUrl, "https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c10200/3c10272v.jpg", "the largest rendition");
  assert.equal(loc[0].previewUrl, "https://tile.loc.gov/storage-services/service/pnp/cph/3c10000/3c10200/3c10272r.jpg", "a preview near 320 px for the footage desk");
  assert.equal(loc[0].width, 2048);
  assert.equal(await verdict(loc[0]), "PUBLIC-DOMAIN");

  const met = await metProvider({ fetch: f }).search("wheat field", "image", sig);
  assert.deepEqual(met.map((c) => c.id), ["met:436535"], "not public domain or gone: refused");
  assert.equal(met[0].creator, "Vincent van Gogh");
  assert.equal(await verdict(met[0]), "CC0-1.0");

  const artic = await articProvider({ fetch: f }).search("grande jatte", "image", sig);
  assert.deepEqual(artic.map((c) => c.id), ["artic:27992"]);
  assert.equal(artic[0].mediaUrl, "https://www.artic.edu/iiif/2/2d484387-2509-5e8e-2c43-22f9981972eb/full/1686,/0/default.jpg");
  assert.equal(await verdict(artic[0]), "CC0-1.0");

  const ov = await openverseProvider({ fetch: f }).search("harbour", "image", sig);
  assert.deepEqual(ov.map((c) => c.id), ["openverse:f1", "openverse:f4"], "share-alike, a Commons copy and a GIF are left out");
  assert.deepEqual(await Promise.all(ov.map(verdict)), ["CC-BY", "PDM-1.0"]);
  assert.equal(ov[0].attributionRequired, true);

  const si = await smithsonianProvider({ apiKey: "K", fetch: f }).search("wright flyer", "image", sig);
  assert.deepEqual(si.map((c) => c.id), ["smithsonian:edanmdm-nasm_A19610048000"], "only CC0 pictures");
  assert.equal(si[0].mediaUrl, "https://ids.si.edu/ids/deliveryService?id=NASM-A19610048000-NASM2018-02858&max=1920");
  assert.equal(await verdict(si[0]), "CC0-1.0");
  for (const p of [locProvider({ fetch: f }), metProvider({ fetch: f }), articProvider({ fetch: f }), openverseProvider({ fetch: f })]) assert.deepEqual(await p.search("x", "video", sig), [], `${p.id} has no video`);

  // The run's provider list: every keyless archive, the Smithsonian only with its key.
  const ids = (/** @type {any} */ k) => mediaProviders({ fetch: f, ...k }).map((p) => p.id);
  assert.deepEqual(ids({}), ["wikimedia", "nasa", "loc", "met", "artic", "openverse"]);
  assert.ok(ids({ smithsonianKey: "K" }).includes("smithsonian"));
});

test("an evidence shot can be filled from a museum, and the description credits it", async () => {
  const md = "**SC0001** | 0:00:00-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R2 Wheat Field with Cypresses, Van Gogh, 1889 | SRC: Met · Q1 \"wheat field cypresses\" | LOOK: L";
  const media = await chapterMedia({ chapter: "C1", markdown: md, providers: mediaProviders({ fetch: /** @type {any} */ (async (/** @type {string} */ url) => (url.includes("wikimedia") || url.includes("nasa") || url.includes("loc.gov") || url.includes("artic") || url.includes("openverse") ? Response.json({}) : archiveFetch(url))) }), sleep: async () => {} });
  assert.equal(media.shots[0].pick?.id, "met:436535");
  assert.equal(media.shots[0].pick?.licence.licenseId, "CC0-1.0");
  const { pictureCredits } = await import("../src/film-run.mjs");
  assert.equal(pictureCredits([media]), "\"Wheat Field with Cypresses, 1889\" by Vincent van Gogh, CC0, via The Metropolitan Museum of Art: https://www.metmuseum.org/art/collection/search/436535");
});

test("one picture the judge cannot open costs only its own shot's review; museum archives are searched for evidence shots only", async () => {
  const md = [0, 20, 40].map((t, i) => `**SC000${i + 1}** | 0:00:${String(t).padStart(2, "0")}-0:00:${String(t + 10).padStart(2, "0")} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R3 old mill wheel turning | SRC: Pexels · Q1 "old mill" | LOOK: L`).join("\n");
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const stock = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    return [1, 2, 3].map((n) => ({ id: `pexels:video:${n}`, source: "pexels", mediaType: "video", title: `clip ${n}`, previewUrl: `https://images.pexels.com/${n}.jpg?w=320`, mediaUrl: `https://v/${n}.mp4`, sourcePageUrl: `https://www.pexels.com/video/${n}/`, creator: null, license: "Pexels License", licenseUrl: null, durationSeconds: 8, width: 1920, height: 1080, attributionRequired: false }));
  } };
  let calls = 0;
  const media = await chapterMedia({ chapter: "C1", markdown: md, providers: [stock], judge: async (_c, shots) => {
    calls += 1;
    if (shots.some((s) => s.key === "SC0002-1")) throw new Error("could not fetch an image");
    return Object.fromEntries(shots.map((s) => [s.key, [0, 1, 2]]));
  } });
  assert.deepEqual(media.shots.map((s) => s.review), ["fit", "unreviewed", "fit"]);
  assert.equal(calls, 4, "one batch, then shot by shot");

  /** @type {string[]} */
  const searched = [];
  const museum = /** @type {import("../src/film-media.mjs").MediaProvider} */ ({ id: "met", layer: 1, kinds: ["image"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search(/** @type {string} */ q) { searched.push(q); return []; } });
  const both = [
    "**SC0001** | 0:00:00-0:00:06 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R2 a painted harvest, 1889 | SRC: Met · Q1 \"wheat field painting\" | LOOK: L",
    "**SC0002** | 0:00:06-0:00:12 | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R3 a crowd on a beach | SRC: Pexels · Q1 \"crowd beach dawn\" | LOOK: L",
  ].join("\n");
  await chapterMedia({ chapter: "C1", markdown: both, providers: [museum], sleep: async () => {} });
  assert.deepEqual(searched, ["wheat field painting"], "the B-roll shot never searches the museum");
});
