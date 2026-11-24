import test from "node:test";
import assert from "node:assert/strict";
import { SCALE_PROMPTS, beatAt, chooseSequence, colourDistance, hamming, historicEra, namesOtherCountry, offPrompts, placePrompts, refusal, scaleOf, scoreOf, sequenceBonus, shotPrompts, shotQueries, worldQueries } from "./rerank.mjs";

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
  assert.deepEqual(offPrompts({}).map((x) => x.why), Array(6).fill("generic"), "no country named: only the generic ones");
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
