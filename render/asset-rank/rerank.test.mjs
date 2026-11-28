import test from "node:test";
import assert from "node:assert/strict";
import { CANDIDATE_CAP, MIN_VIDEO_WIDTH, SCALE_PROMPTS, VIDEO_EDGE, beatAt, capCandidates, chooseSequence, colourDistance, decisiveByText, hamming, historicEra, namesOtherCountry, offPrompts, placePrompts, planChapterSearches, refusal, scaleOf, scoreOf, sequenceBonus, shotPrompts, shotQueries, shotSearches, tagHits, textRank, worldQueries } from "./rerank.mjs";

const INDIA = { country: "India", city: "Bengaluru", demonym: "Indian", currency: "rupees", era: "2010s–2020s" };

test("eyes: the shot is described in its world, and the world's opposites are named", () => {
  const beat = { start: 0, end: 8, place: "Bengaluru, India", era: "2010s", words: "A Rolls-Royce joins a rental fleet." };
  const p = shotPrompts({ query: "Rolls-Royce" }, beat, INDIA);
  assert.deepEqual(p, ["a photo of Rolls-Royce in Bengaluru, India", "Bengaluru, India: A Rolls-Royce joins a rental fleet."]);
  const off = offPrompts(INDIA).map((x) => x.text);
  for (const want of ["US dollar banknotes", "an abstract background", "an old film strip", "a blonde white European person", "a photo taken in South America, the Amazon rainforest"]) assert.ok(off.includes(want), want);
  assert.ok(!off.includes("Indian rupee banknotes"), "the film's own money is never off");
  assert.equal(placePrompts(INDIA)[0], "a photo taken in India");
  assert.ok(!placePrompts(INDIA).includes("a photo taken in South Asia"), "the film's own region is not a rival");
  assert.deepEqual(offPrompts({}).map((x) => x.why), Array(8).fill("generic"), "no country named: only the generic ones");
});

test("eyes: searches name the country; the world pool uses the topic words", () => {
  assert.deepEqual(shotQueries({ query: "barber", queries: ["barber", "chair"] }, INDIA), ["barber India", "barber", "chair India", "chair"]);
  assert.deepEqual(worldQueries(INDIA, ["shop", "barber"]), ["Bengaluru", "Bengaluru street", "India city", "India people", "shop India", "barber India"]);
  assert.deepEqual(worldQueries({}, ["shop"]), []);
});

test("eyes: historic eras and the beat of a shot", () => {
  assert.equal(historicEra("1880s–1890s"), true);
  assert.equal(historicEra("2010s–2020s"), false);
  assert.equal(historicEra(""), false);
  const beats = [{ start: 0, end: 5 }, { start: 5, end: 12 }];
  assert.equal(beatAt(beats, 4, 11), beats[1]);
  assert.equal(beatAt([], 0, 1), null);
});

test("eyes: an off-world picture loses to an on-topic one even when it matches the words a little better", () => {
  // rows: 0-1 the shot, 2 dollars (off), 3-4 place (India first), 5-6 quality, 7-8 watermark, 9-10 era.
  const at = { pos: [0, 1], off: [{ row: 2, why: "money: not rupees", text: "US dollar banknotes" }], place: [3, 4], quality: [5, 6], watermark: [7, 8], era: [9, 10] };
  const dollars = scoreOf([0.27, 0.27, 0.33, 0.2, 0.24, 0.25, 0.2, 0.1, 0.2, 0.1, 0.2], at, { kind: "video", historic: false });
  const rupees = scoreOf([0.25, 0.25, 0.18, 0.26, 0.2, 0.25, 0.2, 0.1, 0.2, 0.1, 0.2], at, { kind: "video", historic: false });
  assert.match(dollars.offWhy, /money/);
  assert.equal(rupees.offWhy, "");
  assert.ok(rupees.total > dollars.total, `${rupees.total} > ${dollars.total}`);
  const still = scoreOf([0.25, 0.25, 0.18, 0.26, 0.2, 0.25, 0.2, 0.1, 0.2, 0.1, 0.2], at, { kind: "image", historic: false });
  assert.ok(rupees.total > still.total, "video wins a tie");
});

test("eyes: hard filters (licence, size, frame, watermark, another country's tags)", () => {
  const ok = { mediaType: "video", width: 1920, height: 1080, title: "street, bengaluru, india", rights: { allowed: true, licenseId: "PIXABAY" } };
  const seen = { watermark: 0.1 };
  assert.equal(refusal(ok, seen, INDIA), "");
  assert.equal(refusal({ ...ok, rights: { allowed: true, licenseId: "CC-BY-SA" } }, seen), "licence");
  assert.equal(refusal({ ...ok, width: 1280, height: 720 }, seen), "too small");
  assert.equal(refusal({ ...ok, mediaType: "image", width: 1600, height: 1067 }, seen), "");
  assert.equal(refusal({ ...ok, width: null }, seen), "size unknown");
  assert.equal(refusal({ ...ok, width: 2160, height: 3840 }, seen), "not landscape");
  assert.equal(refusal(ok, { watermark: 0.95 }), "watermark");
  assert.equal(refusal(ok, null), "thumbnail not seen");
  assert.equal(refusal({ ...ok, title: "haircut, barber shop, vietnam, hair salon" }, seen, INDIA), "another country");
  assert.equal(namesOtherCountry("money, currency, rupees, bank, pakistan", INDIA), "Pakistan");
  assert.equal(namesOtherCountry("rupee, indian, india, money", INDIA), "");
  assert.equal(namesOtherCountry("barber, vietnam", {}), "", "no world: nothing refused for a country");
});

test("eyes: the sequence never repeats a clip or a near copy within the window", () => {
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  const shots = [
    { start: 0, ranked: [{ c: a, total: 3, phash: "ffffffffffffffff" }, { c: b, total: 2, phash: "0000000000000000" }] },
    { start: 10, ranked: [{ c: a, total: 3, phash: "ffffffffffffffff" }, { c, total: 2.5, phash: "fffffffffffffff0" }, { c: b, total: 2, phash: "0000000000000000" }] },
    { start: 700, ranked: [{ c: a, total: 3, phash: "ffffffffffffffff" }] },
  ];
  const picks = chooseSequence(shots, 600);
  assert.deepEqual(picks.map((p) => p?.c.id), ["a", "b", "a"], "c is a near copy of a (4 bits); a may return after 10 minutes");
  assert.equal(hamming("ffffffffffffffff", "fffffffffffffff0"), 4);
});

test("cut: colour continues and scale changes between neighbours", () => {
  const warm = [30, 0.4, 0.5], warmAgain = [35, 0.42, 0.52], blue = [220, 0.5, 0.5];
  assert.ok(colourDistance(warm, warmAgain) < colourDistance(warm, blue));
  assert.equal(colourDistance(null, warm), 0.5, "a picture with no measured colour is neutral");
  const a = { id: "a" }, b = { id: "b" }, c = { id: "c" };
  const picks = chooseSequence([
    { start: 0, ranked: [{ c: a, total: 5, col: warm, scale: "wide" }] },
    { start: 6, ranked: [{ c: b, total: 5.05, col: blue, scale: "wide" }, { c: c, total: 5, col: warmAgain, scale: "medium" }] },
  ], 600);
  assert.equal(picks[1].c.id, "c", "0.05 of raw score is not worth a jump across the colour wheel and two wide frames in a row");
  assert.ok(picks[1].sequence.colour > 0.2);
  assert.ok(picks[1].sequence.scale > 0);
  assert.ok(picks[1].sequence.colourDistance < colourDistance(warm, blue));
});

test("cut: the three scales are read from the pictures, not guessed", () => {
  assert.equal(SCALE_PROMPTS.length, 3);
  assert.equal(scaleOf([0.1, 0.3, 0.2], [0, 1, 2]), "medium");
  assert.equal(scaleOf([0.31, 0.3, 0.2], [0, 1, 2]), "wide");
  assert.equal(scaleOf(undefined, [0, 1, 2]), "");
  assert.deepEqual(sequenceBonus({ scale: "wide" }, { scale: "close" }, false), { colour: 0, scale: 0.12, era: 0 });
});

test("cut: a modern colour picture is pushed out of a historical scene", () => {
  const modern = { id: "modern" }, period = { id: "period" };
  const ranked = [{ c: modern, total: 5.2, era: 0.3 }, { c: period, total: 5, era: 0.75 }];
  const pick = chooseSequence([{ start: 0, historic: true, ranked }], 600)[0];
  assert.equal(pick.c.id, "period", "0.2 of raw score does not buy out-of-era footage in a 1947 scene");
  assert.equal(pick.sequence.total, 5, "the period pick carries no era penalty itself");
  const now = chooseSequence([{ start: 0, historic: false, ranked }], 600);
  assert.equal(now[0].c.id, "modern", "in a present-day scene the era bonus is not applied");
});

test("sentence: a shot is searched from the words heard over it, widened to their sentence", async () => {
  const { shotSentence, sentenceQueries, parseQueryLines, planMediaShots, writeQueries } = await import("./rerank.mjs");
  const words = [["Its", 0, 0.3], ["buyer", 0.3, 0.6], ["cuts", 0.6, 0.9], ["hair,", 0.9, 1.2], ["in", 1.3, 1.4], ["2025", 1.4, 1.9], ["he", 1.9, 2], ["still", 2, 2.2], ["does.", 2.2, 2.5], ["Next.", 2.6, 3]].map(([text, start, end]) => ({ text: String(text), start: Number(start), end: Number(end) }));
  assert.deepEqual(shotSentence(words, 0, 1.25), { heard: "Its buyer cuts hair,", sentence: "Its buyer cuts hair, in 2025 he still does." });
  assert.deepEqual(shotSentence(words, 5, 6), { heard: "", sentence: "" });
  assert.deepEqual(sentenceQueries("Its buyer cuts hair,", INDIA), ["cuts hair", "hair", "cuts", "buyer"].slice(0, 3));
  assert.deepEqual(sentenceQueries("So this film gives neither.", INDIA), ["Bengaluru street"]);
  const lines = parseQueryLines("SC0002-1 | Clipper Cutting Hair ; barber hands close ; \"hair salon\"\nnoise\nSC0003-2: rupee notes");
  assert.deepEqual(lines.get("SC0002-1"), ["clipper cutting hair", "barber hands close", "hair salon"]);
  assert.deepEqual(lines.get("SC0003-2"), ["rupee notes"]);
  // Only picture shots are searched, numbered as the renderer reads them.
  const plan = { shots: [{ id: "SC0001-1", scene: "SC0001", start: 0, end: 1.25, type: "live-video", subject: "hair" }, { id: "SC0001-2", scene: "SC0001", start: 1.25, end: 2.5, type: "kinetic-type" }, { id: "SC0001-3", scene: "SC0001", start: 2.5, end: 3, type: "photo-2.5D" }] };
  const shots = planMediaShots(plan, words);
  assert.deepEqual(shots.map((s) => [s.scene, s.shot, s.heard]), [["SC0001", 1, "Its buyer cuts hair,"], ["SC0001", 3, "Next."]]);
  // The brain's lines are used where it answered; code writes the rest.
  const brain = { call: async () => ({ text: "SC0001-1 | clipper cutting hair ; barber hands" }) };
  const w = await writeQueries({ brain, shots, world: INDIA });
  assert.deepEqual(w.queries.get("SC0001-1"), { queries: ["clipper cutting hair", "barber hands"], by: "brain" });
  assert.equal(w.queries.get("SC0001-3")?.by, "words");
  const dead = await writeQueries({ brain: { call: async () => { throw new Error("429"); } }, shots, world: INDIA });
  assert.equal(dead.answered, 0);
  assert.equal(dead.queries.get("SC0001-1")?.by, "words");
});

test("critic: the eyes' answer is read strictly; a failed look is unknown, never a pass", async () => {
  const { parseFit, judgePicture, pictureQuestion } = await import("../critic.mjs");
  assert.deepEqual(parseFit('```json\n{"fits": false, "sees": "a waterfall", "why": "not a barber"}\n```'), { fits: false, sees: "a waterfall", why: "not a barber" });
  assert.equal(parseFit("yes it fits"), null);
  assert.equal(parseFit('{"fits": "yes"}'), null);
  assert.match(pictureQuestion("Pink notes fall.", INDIA), /Bengaluru, India.*rupees/s);
  assert.equal((await judgePicture(async () => { throw new Error("Groq eyes 429"); }, { sentence: "x", imageUrl: "u" })).fits, null);
  assert.equal((await judgePicture(async () => '{"fits": true, "sees": "notes"}', { sentence: "x", imageUrl: "u" })).fits, true);
});

test("eyes: tags count the shot's own words; a picture that looks off-world is refused outright", () => {
  assert.equal(tagHits("barber, barbershop, hairstyle, hand", ["barber hands scissors"]), 2);
  assert.equal(tagHits("money, currency, australian", ["rupee notes"]), 0);
  assert.equal(namesOtherCountry("money, currency, cash, australian", INDIA), "Australia");
  assert.equal(namesOtherCountry("bogotá, drone, city", INDIA), "Colombia");
  const c = { mediaType: "video", width: 1920, height: 1080, title: "money", rights: { allowed: true, licenseId: "PIXABAY" } };
  assert.equal(refusal(c, { watermark: 0.1, offBy: 0.01 }, INDIA), "off-world");
  assert.equal(refusal(c, { watermark: 0.1, offBy: -0.02 }, INDIA), "");
});

test("eyes: green screens, cartoons and weddings are not footage unless the shot asked for them", async () => {
  const { notFootage } = await import("./rerank.mjs");
  assert.equal(notFootage("scissors, green screen, cut", ["barber scissors"]), "not footage");
  assert.equal(notFootage("wedding, telugu wedding, hands", ["first bill"]), "not footage");
  assert.equal(notFootage("wedding, bride", ["indian wedding hall"]), "");
  assert.equal(notFootage("barber, chair, salon", ["barber chair"]), "");
});

test("records: every pick is classed A-E; CGI and AI are never evidence", async () => {
  const { recordClass } = await import("./rerank.mjs");
  assert.equal(recordClass({ source: "pixabay", title: "rolls royce 3d, black, car, rendering" }, false), "D");
  assert.equal(recordClass({ source: "pixabay", title: "barber, chair" }, false), "B");
  assert.equal(recordClass({ source: "wikimedia", title: "Brigade Road 1950" }, true), "A");
  assert.equal(recordClass({ source: "ai", title: "x" }, false), "E");
});

test("gaps: a shot with no right picture becomes a card of its own words; the rest of the line is kept", async () => {
  const { markGaps } = await import("./rerank.mjs");
  const line = '**SC0005** | 0:00:27.010-0:00:32.490 | C1 | NARR: x | SHOTS: (1) 0:00:27.010-0:00:30.580 R1 document card "Follow the tax bill." (2) 0:00:30.580-0:00:32.490 R2 Ramesh shop sign, 2010s | SRC: a | TYPE: document; live-video | FX: FX-PAPER | TRANS: hard cut';
  const out = markGaps(line + "\nSC0006 | same", [{ scene: "SC0005", shot: 2, text: "is Ramesh Babu." }]);
  const [a, b] = out.split("\n");
  assert.match(a, /\(2\) 0:00:30\.580-0:00:32\.490 R1 kinetic-type card "is Ramesh Babu\." \| SRC/);
  assert.match(a, /\(1\) 0:00:27\.010-0:00:30\.580 R1 document card "Follow the tax bill\."/);
  assert.match(a, /TYPE: document; kinetic-type \|/);
  assert.match(a, /FX: FX-KINETIC FX-PAPER/);
  assert.equal(b, "SC0006 | same");
  assert.match(markGaps(line.replace("**SC0005**", "SC0005"), [{ scene: "SC0005", shot: 2, text: "x" }]), /\(2\) \S+ R1 kinetic-type card "x"/);
});

test("P0: an unknown person is never shown for a line about the film's own man or his family", async () => {
  const { strangerAsSubject } = await import("./rerank.mjs");
  assert.equal(strangerAsSubject("is Ramesh Babu. His name", "man, coffee, think, pause"), "stranger as the subject");
  assert.equal(strangerAsSubject("His mother was left with the household", "clothing, woman, fashion, shop"), "stranger as the subject");
  assert.equal(strangerAsSubject("he was still cutting hair", "barber, hand, scissors, comb"), "");
  assert.equal(strangerAsSubject("Bengaluru, India.", "man, street"), "");
  assert.equal(strangerAsSubject("his shop on a busy road", "street, people, man, market"), "");
});

test("taste: a picture is used once in the whole film, and crops of one mosaic are one picture", async () => {
  const { sameMosaic } = await import("./rerank.mjs");
  assert.equal(sameMosaic("Apollo 11 Lunar Panorama AS11-40-5878", "Apollo 11 lunar panorama crop 2"), true);
  assert.equal(sameMosaic("Apollo 11 Lunar Panorama", "Saturn V on the pad"), false);
  const a = { id: "a", title: "Moon panorama, Tranquility Base" }, b = { id: "b", title: "Moon panorama (detail), Tranquility Base" }, c = { id: "c", title: "Crew walkout" };
  const shots = [
    { start: 0, ranked: [{ c: a, total: 3, phash: "ffffffffffffffff" }] },
    { start: 5000, ranked: [{ c: b, total: 3, phash: "0f0f0f0f0f0f0f0f" }, { c, total: 1, phash: "00000000ffffffff" }] },
  ];
  assert.deepEqual(chooseSequence(shots).map((p) => p?.c.id), ["a", "c"], "even 5000 s later, and with a different hash, the same mosaic does not return");
});

test("taste: a broadcaster's footage is refused for its logo", () => {
  const ok = { mediaType: "video", width: 1920, height: 1080, rights: { allowed: true, licenseId: "PDM-1.0" } };
  assert.equal(refusal({ ...ok, title: "KQED_20190720_030000_Moon landing" }, { watermark: 0 }), "broadcast logo");
  assert.equal(refusal({ ...ok, title: "CNN Special: Apollo 11" }, { watermark: 0 }), "broadcast logo");
  assert.equal(refusal({ ...ok, title: "Apollo 11 launch, NASA" }, { watermark: 0 }), "");
});

/** A candidate as the providers hand it over: licence and size known before any picture is fetched. */
const candidate = (id, o = {}) => ({
  id, source: "pixabay", mediaType: "video", title: "street", previewUrl: `https://cdn.example/${id}.jpg`,
  width: 1920, height: 1080, rights: { allowed: true, licenseId: "PIXABAY" }, ...o,
});

test("speed: the pool is capped before any download, and what a thumbnail could not fix goes first", () => {
  const shot = { id: "SC0001-1", heard: "Rupee notes on a counter.", sentence: "Rupee notes on a counter.", queries: ["rupee notes", "cash counter", "indian money"] };
  const keeper = candidate("keep", { title: "rupee, notes, money, counter" });
  const list = [
    candidate("portrait", { title: "rupee notes", width: 2160, height: 3840 }),
    candidate("small", { title: "rupee notes", width: 1280, height: 720 }),
    candidate("licence", { title: "rupee notes", rights: { allowed: true, licenseId: "CC-BY-SA" } }),
    candidate("pakistan", { title: "money, currency, rupees, pakistan" }),
    candidate("green", { title: "scissors, green screen, cut" }),
    candidate("nopreview", { title: "rupee notes", previewUrl: null }),
    keeper,
    candidate("dupe", { ...keeper }),
    candidate("still", { title: "rupee, notes, counter", mediaType: "image", width: 2400, height: 1600 }),
    candidate("weak", { title: "sky, clouds" }),
  ];
  const kept = capCandidates(list, shot, INDIA, 60);
  assert.deepEqual(kept.map((c) => c.id), ["keep", "still", "weak"], "only what a picture could still change is downloaded, best text match first, footage before stills");
  assert.equal(capCandidates(list, shot, INDIA, 0).length, 3, "a cap of 0 never caps, it only refuses");
  // The cap holds the shot's best, never more.
  const many = Array.from({ length: 120 }, (_, i) => candidate(`c${i}`, { title: i % 3 === 0 ? "rupee notes" : "sky" }));
  assert.equal(capCandidates(many, shot, INDIA).length, CANDIDATE_CAP);
  assert.equal(capCandidates(many, shot, INDIA, 20).length, 20);
  assert.equal(capCandidates([], shot, INDIA).length, 0);
  assert.deepEqual(textRank({ title: "rupee, notes, money", mediaType: "video", width: 1920, height: 1080 }, shot.queries), [3, 1, 1920, 1080]);
});

test("speed: one clip that carries all three searches settles the shot without a look", () => {
  const shot = { id: "SC0002-1", heard: "Cash counter.", sentence: "Cash counter.", queries: ["rupee notes", "cash counter", "indian money"] };
  const strong = candidate("strong", { title: "rupee, notes, cash, counter, indian, money" });
  const others = [candidate("a", { title: "rupee notes" }), candidate("b", { title: "money, cash" })];
  const d = decisiveByText([strong, ...others], shot, INDIA);
  assert.equal(d?.pick.id, "strong");
  assert.equal(d?.tags, 3);
  assert.deepEqual(d?.shortlist.map((c) => c.id), ["strong", "a", "b"], "the next two stay as the critic's alternative");
  // Never when another clip names the words as well: only the eyes can choose between them.
  assert.equal(decisiveByText([strong, candidate("tie", { title: "rupee, notes, counter" })], shot, INDIA), null);
  // Never a still, never under full HD, never a named shot's off-subject clip, never one clip alone.
  assert.equal(decisiveByText([{ ...strong, mediaType: "image" }, ...others], shot, INDIA), null);
  assert.equal(decisiveByText([{ ...strong, width: MIN_VIDEO_WIDTH - 1 }, ...others], shot, INDIA), null);
  assert.equal(decisiveByText([strong], shot, INDIA), null);
  const named = { ...shot, named: true, names: ["Apollo"] };
  assert.equal(decisiveByText([strong, ...others], named, INDIA), null);
  assert.equal(decisiveByText([candidate("apollo", { title: "apollo, rupee, notes, cash, counter" }), ...others], named, INDIA)?.pick.id, "apollo");
  assert.equal(decisiveByText([strong, ...others], { ...shot, queries: ["notes"] }, INDIA), null, "two words is not decisive");
  assert.equal(decisiveByText([strong, ...others], {}, INDIA), null);
});

test("speed: a chapter's searches are planned once, and a query two shots share is asked once", () => {
  const a = { id: "SC0001-1", queries: ["rupee notes", "cash counter"] };
  const b = { id: "SC0001-2", queries: ["rupee notes", "indian money"] };
  const c = { id: "SC0001-3", named: true, nameCount: 1, names: ["Apollo"], queries: ["apollo 11", "moon", "rocket"] };
  const plan = planChapterSearches([a, b, c], INDIA, () => false);
  const keys = plan.map((p) => `${p.kind}|${p.group}|${p.query}`);
  assert.equal(new Set(keys).size, keys.length, "no query is asked twice");
  assert.deepEqual(keys, [
    // a shot's own words: the country first, then bare, video before stills (the best search alone for stills)
    // ("indian money" already names India, so it is not asked twice with the country)
    "video|stock|rupee notes India", "video|stock|rupee notes", "video|stock|cash counter India", "video|stock|cash counter", "image|stock|rupee notes India",
    "video|stock|indian money",
    // a named shot asks the archives first, then stock for its mood
    "video|archives|apollo 11", "image|archives|apollo 11", "video|stock|moon", "video|stock|rocket", "image|stock|apollo 11",
  ].filter((k, i, all) => all.indexOf(k) === i));
  // A historical scene asks the archives on its own words too.
  const old = planChapterSearches([a], INDIA, () => true).map((p) => `${p.kind}|${p.group}|${p.query}`);
  assert.ok(old.includes("video|archives|rupee notes India") && old.includes("image|archives|cash counter"));
  assert.deepEqual(shotSearches({ id: "x", queries: [] }, INDIA, false), []);
  assert.equal(planChapterSearches([{ id: "x", queries: [] }], INDIA, () => false).length, 0);
});

/** A small deterministic film: the same 40 shots and their candidates on every run and machine. */
function film(shots = 40, seed = 20261128) {
  const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const WORDS = ["rupee", "notes", "cash", "counter", "indian", "money", "bank", "street", "hands", "shop", "till", "ledger", "paper", "market", "traffic", "sky", "clouds", "rain"];
  const out = [];
  for (let n = 0; n < shots; n += 1) {
    const words = [WORDS[n % WORDS.length], WORDS[(n * 3 + 1) % WORDS.length], WORDS[(n * 5 + 2) % WORDS.length]];
    const queries = words.map((w, i) => `${w} ${WORDS[(n + i + 6) % WORDS.length]}`);
    const shot = { id: `SC${String(n + 1).padStart(4, "0")}-1`, start: n * 4, end: n * 4 + 4, heard: `${queries[0]}.`, sentence: `${queries[0]}.`, queries };
    // 180-250 candidates a shot, as measured (199-253 in the 38 s Apollo film); the words a search matched
    // predict what CLIP would see, with noise, so the text match is a real signal and not a perfect one.
    const candidates = [];
    const count = 180 + Math.floor(rnd() * 70);
    // About a third of the shots have one clip whose tags carry all six words (the decisive case); the rest
    // of the pool is ordinary noise, so most shots still need the eyes.
    const planted = rnd() < 0.35 ? `${words.join(", ")}, ${queries.join(", ").replace(/ /g, ", ")}` : "";
    for (let i = 0; i < count; i += 1) {
      const tags = WORDS.filter(() => rnd() < 0.12);
      const title = (planted && i === 0 ? planted : tags.join(", ")) || "sky";
      const video = rnd() < 0.72;
      const c = candidate(`s${n}c${i}`, { title, mediaType: video ? "video" : "image", width: video ? 1920 : 2400, height: video ? 1080 : 1600 });
      const hits = textRank(c, queries)[0];
      const relevance = 0.16 + 0.03 * hits + rnd() * 0.05;
      candidates.push({ c, total: Math.round((10 * relevance + (video ? VIDEO_EDGE : 0) + rnd() * 0.05) * 1000) / 1000 });
    }
    out.push({ shot, candidates });
  }
  return out;
}

test("speed: on a 40-shot fixture the top pick is unchanged for at least 90% of shots", (t) => {
  const shots = film();
  let same = 0, decided = 0, decidedSame = 0, biggest = 0;
  for (const { shot, candidates } of shots) {
    const oldRanked = [...candidates].sort((a, b) => b.total - a.total);
    const before = chooseSequence([{ start: shot.start, ranked: oldRanked }])[0];
    const capped = capCandidates(candidates.map((x) => x.c), shot, INDIA); // what the new pass downloads
    const keep = new Set(capped.map((c) => c.id));
    const after = candidates.filter((x) => keep.has(x.c.id)).sort((a, b) => b.total - a.total);
    biggest = Math.max(biggest, capped.length);
    const d = decisiveByText(capped, shot, INDIA);
    if (d) decided += 1;
    const pick = d ? d.pick.id : chooseSequence([{ start: shot.start, ranked: after }])[0]?.c.id;
    if (pick === before?.c.id) { same += 1; if (d) decidedSame += 1; }
  }
  assert.ok(decided > 0, "some shots must be settled by their words alone");
  assert.ok(biggest <= 60, `no shot offers more than the cap (the biggest pool was ${biggest})`);
  const rate = same / shots.length;
  t.diagnostic(`top pick unchanged on ${Math.round(rate * 100)}% (${same}/${shots.length}); ${decided} settled by their words, ${decidedSame} of them kept the old pick; biggest pool ${biggest}`);
  assert.ok(rate >= 0.9, `the top pick is unchanged on ${Math.round(rate * 100)}% of the fixture's shots (${same}/${shots.length}); ${decided} were settled by their words, ${decidedSame} of those kept the old pick`);
});

test("speed: a thumbnail embedded before is never downloaded again (the cache is read before any fetch)", async () => {
  const { spawnSync } = await import("node:child_process");
  const { createHash } = await import("node:crypto");
  const { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  if (spawnSync("python3", ["-V"], { stdio: "ignore" }).status !== 0) return; // no python here: the JS side is tested above
  const dir = mkdtempSync(join(tmpdir(), "rank-cache-"));
  try {
    const cache = join(dir, "cache");
    mkdirSync(join(cache, "emb"), { recursive: true });
    const seen = "https://cdn.example/already-looked-at.jpg";
    const unseen = "https://cdn.example/new.jpg";
    const tag = "deadbeef";
    const hash = createHash("sha1").update(seen).digest("hex");
    writeFileSync(join(cache, "emb", `${hash}-${tag}.npy`), "fake embedding");
    writeFileSync(join(cache, "emb", `${hash}-${tag}.json`), JSON.stringify({ phash: "ffffffffffffffff", w: 1920, h: 1080, col: [30, 0.4, 0.5] }));
    const req = join(dir, "req.json");
    const ans = join(dir, "ans.json");
    writeFileSync(req, JSON.stringify({ urls: [seen, unseen], cache, tag }));
    const r = spawnSync("python3", [new URL("./rank.py", import.meta.url).pathname, "pending", req, ans], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(readFileSync(ans, "utf8"));
    assert.deepEqual(out.cached, [seen], "an embedded picture needs no download");
    assert.deepEqual(out.pending, [unseen]);
    // A different model's cache is a different embedding: the same URL is looked at again.
    writeFileSync(req, JSON.stringify({ urls: [seen], cache, tag: "0therm0d" }));
    spawnSync("python3", [new URL("./rank.py", import.meta.url).pathname, "pending", req, ans], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(readFileSync(ans, "utf8")).pending, [seen]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
