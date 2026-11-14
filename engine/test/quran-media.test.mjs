import assert from "node:assert/strict";
import { test } from "node:test";
import { MESSAGES } from "../src/messages.mjs";
import { creditsText, findQuranMedia, mediaTable, rejectWhy, relevant, searchLadder } from "../src/quran-media.mjs";

/** @param {Partial<import("../src/documentary-media-fetch.mjs").MediaResult> & { id: string }} r @returns {import("../src/documentary-media-fetch.mjs").MediaResult} */
const result = (r) => ({ source: "pexels", mediaType: "video", title: "olive grove at sunrise", previewUrl: null, mediaUrl: "https://x/v.mp4", sourcePageUrl: "https://x/page", creator: "A. Filmer", license: "Pexels License", licenseUrl: null, durationSeconds: 20, width: 3840, height: 2160, attributionRequired: false, ...r });

/** A provider that answers from a table: query → results. @param {string} id @param {Record<string, any[]>} table @param {("video" | "image")[]} [kinds] */
const provider = (id, table, kinds = ["video", "image"]) => ({ id, layer: /** @type {1} */ (1), kinds, cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 1 }, async search(/** @type {string} */ q, /** @type {"video" | "image"} */ kind) { return (table[q] ?? []).filter((r) => r.mediaType === kind); } });

/** @param {string} id @param {string} motif @param {string[]} look @param {number} start @param {number} end */
const shot = (id, motif, look, start, end) => ({ id, scene: "Q", kind: /** @type {const} */ ("ayah"), surah: 95, ayah: 1, part: 1, parts: 1, start, end, look, motif, move: "slow push in", mood: "calm", brightness: /** @type {const} */ ("mid"), symbolic: false, refrain: null, transitionIn: { type: /** @type {const} */ ("dissolve"), seconds: 1 }, because: { ayah: "95:1", from: /** @type {const} */ ("arabic-word"), detail: "the olive", source: "Tanzil" }, notes: [] });

test("a candidate is refused for its licence, its words, its size, its length or for being used before, and says why", async () => {
  const o = { seconds: 10, level: /** @type {const} */ ("strict"), used: new Set(["pexels:used"]) };
  assert.equal(await rejectWhy(result({ id: "pexels:ok" }), o), null);
  assert.match(String(await rejectWhy(result({ id: "pexels:used" }), o)), /no asset twice/);
  assert.match(String(await rejectWhy(result({ id: "w:1", source: "wikimedia", license: "CC BY-SA 4.0" }), o)), /^licence: Share-alike/);
  assert.match(String(await rejectWhy(result({ id: "p:2", title: "oil painting of an olive tree" }), o)), /^adab: "painting"/);
  assert.match(String(await rejectWhy(result({ id: "p:3", title: "farmer picking olives, man smiling" }), o)), /^adab: shows people/);
  assert.match(String(await rejectWhy(result({ id: "p:4", title: "camels in the desert" }), o)), /level strict/);
  assert.match(String(await rejectWhy(result({ id: "w:6", title: "Cour Napoléon at night - Louvre" }), o)), /^adab: "Louvre"/);
  assert.match(String(await rejectWhy(result({ id: "w:7", title: "Hikers below the glacier" }), o)), /^adab: shows people/);
  assert.equal(await rejectWhy(result({ id: "p:4", title: "camels in the desert" }), { ...o, level: "nature" }), null);
  assert.match(String(await rejectWhy(result({ id: "p:5", width: 1280 }), o)), /^quality: 1280 px/);
  assert.match(String(await rejectWhy(result({ id: "p:6", durationSeconds: 4 }), o)), /^quality: video is 4 s, 6.7 s needed/);
  assert.match(String(await rejectWhy(result({ id: "p:7", title: "AI generated landscape" }), o)), /^adab/);
  // An archive item whose page cannot be checked is not used.
  const nasa = result({ id: "nasa:1", source: "nasa", license: "NASA", title: "Earth from orbit" });
  assert.match(String(await rejectWhy(nasa, o)), /item page could not confirm/);
  assert.equal(await rejectWhy(nasa, o, { verify: () => true }), null);
  // The frame check refuses what the words missed.
  assert.equal(await rejectWhy(result({ id: "p:8" }), o, { inspect: () => "2 faces in 5 frames" }), "detector: 2 faces in 5 frames");
});

test("video first, then photographs; no asset twice; a shot with nothing usable is a gap with its reasons", async () => {
  const p = provider("pexels", {
    "olive grove": [result({ id: "pexels:v1", title: "olive grove" }), result({ id: "pexels:i1", mediaType: "image", title: "olive grove", durationSeconds: null })],
    "olive tree": [result({ id: "pexels:v1", title: "olive grove" }), result({ id: "pexels:i2", mediaType: "image", title: "olive tree", durationSeconds: null })],
    "fig tree": [result({ id: "pexels:v9", title: "fig tree", width: 1280 }), result({ id: "pexels:v10", title: "fig tree painting" })],
  });
  const m = await findQuranMedia({ shots: [shot("S001", "olive grove", ["olive grove"], 0, 9), shot("S002", "olive tree", ["olive tree"], 9, 18), shot("S003", "fig tree", ["fig tree"], 18, 27)], providers: [p, provider("met", {})] });
  assert.deepEqual(m.shots.map((s) => [s.shot, s.status, s.kind, s.asset?.id ?? null]), [["S001", "found", "video", "pexels:v1"], ["S002", "found", "image", "pexels:i2"], ["S003", "gap", null, null]]);
  assert.ok(m.shots[1].rejected.some((r) => r.id === "pexels:v1" && /no asset twice/.test(r.why)));
  assert.deepEqual(m.manifest.gaps.map((g) => g.shot), ["S003"]);
  assert.deepEqual(m.manifest.gaps[0].rejected, { quality: 1, adab: 1 });
  assert.ok(m.shots.every((s) => s.tried.every((t) => !t.startsWith("met:"))), "art archives are not searched for a recitation");
  assert.deepEqual(m.stats, { shots: 3, found: 2, video: 1, image: 1, gaps: 1 });
  for (const x of m.messages) assert.ok(x.code in MESSAGES && x.bn !== x.en);
  assert.match(mediaTable(m), /\| S003 \| 95:1 \| gap \|/);
});

test("the manifest and credits: every asset with origin, author, licence and where it is used", async () => {
  const p = provider("wikimedia", { "sea": [result({ id: "wikimedia:7", source: "wikimedia", title: "Waves on the sea", license: "CC BY 4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0", creator: "R. Sea" })] });
  const m = await findQuranMedia({ shots: [shot("S001", "sea", ["sea"], 0, 10)], providers: [p], verify: () => true });
  const a = m.manifest.assets[0];
  assert.equal(a.licence, "CC-BY");
  assert.equal(a.attribution, true);
  assert.deepEqual(a.usedIn, [{ shot: "S001", ayah: "95:1", start: 0, end: 10 }]);
  const credits = creditsText(m.manifest, { reciter: "the owner" });
  assert.match(credits, /Quran text: Tanzil\.net/);
  assert.match(credits, /Amiri Quran/);
  assert.match(credits, /"Waves on the sea" by R\. Sea, CC BY 4\.0 \(https:\/\/creativecommons\.org\/licenses\/by\/4\.0\)/);
  assert.doesNotMatch(credits, /Pickthall/, "the translation is credited only when it is shown");
});

test("relevance: the title must name what the shot asks for", async () => {
  assert.equal(relevant("olive grove", "Olive groves near Jaén"), true);
  assert.equal(relevant("soft morning light", "Morning Light Over Orvieto"), true);
  assert.equal(relevant("balanced landscape", "MSL Sol 740"), false);
  assert.equal(relevant("calm sea at dawn", "The dawn of American history in Europe"), false);
  assert.equal(relevant("calm sea at dawn", "Dawn over a calm sea, Oman"), true);
  const o = { seconds: 10, level: /** @type {const} */ ("strict"), used: new Set(), query: "olive grove" };
  assert.match(String(await rejectWhy(result({ id: "p:9", title: "Pure white snow" }), o)), /^relevance/);
  assert.match(String(await rejectWhy(result({ id: "p:10", title: "olive grove (1912) book page scan" }), o)), /^adab: "book"/);
  // A landscape painting whose title does not say so is refused by its categories (seen on the runner).
  assert.match(String(await rejectWhy(/** @type {any} */ ({ ...result({ id: "w:11", title: "Olive grove near Tivoli" }), tags: ["Landscape paintings in the Louvre", "Oil on canvas"] }), o)), /^adab: "paintings"/);
});

test("the search ladder: own picture, family, plain nouns, then reverent landscapes; a video must cover its shot", async () => {
  const ladder = searchLadder({ motif: "calm sea at dawn", look: ["calm sea at dawn", "still lake at dusk"] }, "strict");
  assert.deepEqual(ladder.slice(0, 5).map((x) => `${x.rung}:${x.q}`), ["own:calm sea at dawn", "family:still lake at dusk", "nouns:dawn", "nouns:lake", "nouns:dusk"]);
  assert.ok(ladder.some((x) => x.rung === "landscape" && x.q === "mountains"));
  assert.ok(searchLadder({ motif: "bees", look: ["bees"] }, "strict").every((x) => x.q !== "bees"), "a living thing is not searched for at the strict level");
  assert.ok(searchLadder({ motif: "x", look: [], symbolic: true }, "strict").filter((x) => x.rung === "landscape").every((x) => ["sky", "clouds", "sunrise", "horizon", "lake", "sea"].includes(x.q)));
  // A 40 s shot needs at least 26.7 s of video (slowed to two thirds at most); 14.5 s is refused.
  const o = { seconds: 40, level: /** @type {const} */ ("strict"), used: new Set(), query: "forest" };
  assert.match(String(await rejectWhy(result({ id: "p:20", title: "forest from the mountain", durationSeconds: 14.5 }), o)), /26\.7 s needed/);
  // When the shot's own words find nothing, a landscape is found, and the rung says so.
  const p = provider("pexels", { mountains: [result({ id: "pexels:m1", title: "mountains at sunrise" })] });
  const m = await findQuranMedia({ shots: [shot("S001", "fig tree", ["fig tree"], 0, 9)], providers: [p] });
  assert.equal(m.shots[0].status, "found");
  assert.equal(m.shots[0].rung, "landscape");
  assert.equal(m.shots[0].query, "mountains");
});
