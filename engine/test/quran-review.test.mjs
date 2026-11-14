import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { MESSAGES } from "../src/messages.mjs";
import { decide, packaging, readyToPublish, reviewSheet } from "../src/quran-review.mjs";

const surahNames = JSON.parse(readFileSync(new URL("../data/quran/surah-names.json", import.meta.url), "utf8"));
/** @param {string} id @param {number} ayah @param {number} start @param {number} end */
const shot = (id, ayah, start, end) => ({ id, surah: 93, ayah, start, end, motif: "dawn", because: { detail: "x", source: "y" } });
const direction = /** @type {any} */ ({ shots: [shot("S001", 1, 0, 8), shot("S002", 3, 8, 20), shot("S003", 5, 20, 30)] });
const media = { shots: [{ shot: "S001", asset: { id: "w:1", title: "Dawn", page: "p", licenceName: "CC0" } }, { shot: "S002", asset: { id: "w:2", title: "Valley", page: "p", licenceName: "CC BY 4.0" } }, { shot: "S003", asset: null }] };
const goodRender = { lengthMatches: true, black: [], frozen: [], cutsInsideTheVoice: 0, integratedLufs: -14, truePeakDbtp: -1.5, cards: [], visual: { ok: true, empty: [], frozen: [] }, audio: { ok: true, offsetSeconds: 0, addedSilences: [], clippedSamples: 0 } };

test("Q6 exit: a film cannot be marked ready without every scene approved and a reviewer's name", () => {
  let review = reviewSheet(direction, media);
  assert.deepEqual(review.scenes.map((s) => s.status), ["pending", "pending", "pending"]);
  assert.equal(readyToPublish(review, goodRender).ok, false);
  // No anonymous decision.
  assert.equal(decide(review, { shot: "S001", action: "approve", by: " " }).ok, false);
  review = decide(review, { action: "approve-all", by: "Reviewer A" }).review;
  // Approved but not signed: still not ready.
  const unsigned = readyToPublish(review, goodRender);
  assert.equal(unsigned.ok, false);
  assert.deepEqual(unsigned.why.map((m) => m.code), ["quran.review.unsigned"]);
  // A sign-off without a name is refused.
  assert.equal(decide(review, { action: "signoff", by: "" }).ok, false);
  // A name alone is not enough for a religious sign-off.
  assert.equal(decide(review, { action: "signoff", by: "Reviewer A" }).message.code, "quran.review.identity");
  review = decide(review, { action: "signoff", by: "Reviewer A", qualification: "hafiz, ijazah in Hafs", contact: "a@example.org" }).review;
  assert.equal(review.signoff?.qualification, "hafiz, ijazah in Hafs");
  const ready = readyToPublish(review, goodRender);
  assert.equal(ready.ok, true);
  assert.equal(ready.by, "Reviewer A");
  // The render's own checks still count.
  assert.deepEqual(readyToPublish(review, { ...goodRender, frozen: [{ start: 3, end: 7 }] }).why.map((m) => m.code), ["quran.review.renderFailed"]);
  assert.deepEqual(readyToPublish(review, { ...goodRender, integratedLufs: -10 }).why.map((m) => m.code), ["quran.review.loudness"]);
  assert.deepEqual(readyToPublish(review, null).why.map((m) => m.code), ["quran.review.notRendered"]);
  // Every second needs a real picture: a placeholder card or an empty stretch blocks publishing, with its time.
  const carded = readyToPublish(review, { ...goodRender, cards: [{ start: 82.2, end: 106.9 }] });
  assert.deepEqual(carded.why.map((m) => m.code), ["quran.review.cards"]);
  assert.match(carded.why[0].en, /82-107 s/);
  assert.deepEqual(readyToPublish(review, { ...goodRender, visual: { ok: false, empty: [{ start: 2, end: 7.5 }], frozen: [] } }).why.map((m) => m.code), ["quran.review.visual"]);
  assert.deepEqual(readyToPublish(review, { ...goodRender, audio: { ok: false, offsetSeconds: 0, addedSilences: [{ start: 40, end: 41.2 }], clippedSamples: 0 } }).why.map((m) => m.code), ["quran.review.audio"]);
  const { visual, ...old } = goodRender;
  assert.deepEqual(readyToPublish(review, old).why.map((m) => m.code), ["quran.review.noAudit"]);
  for (const m of [...unsigned.why, ...readyToPublish(null, null).why]) assert.ok(m.code in MESSAGES && m.bn !== m.en);
});

test("replacing a scene keeps the other decisions, sets that scene pending and undoes the sign-off", () => {
  let review = decide(reviewSheet(direction, media), { action: "approve-all", by: "R" }).review;
  review = decide(review, { action: "signoff", by: "R", qualification: "q", contact: "c" }).review;
  assert.ok(review.signoff);
  const replaced = decide(review, { shot: "S002", action: "replace", by: "R", note: "search: olive grove" });
  assert.equal(replaced.review.signoff, null);
  // The new asset arrives: the sheet is rebuilt from the new media and the old review.
  const newMedia = { shots: media.shots.map((s) => (s.shot === "S002" ? { shot: "S002", asset: { id: "w:9", title: "Olive grove", page: "p", licenceName: "CC0" } } : s)) };
  const again = reviewSheet(direction, newMedia, replaced.review);
  assert.deepEqual(again.scenes.map((s) => s.status), ["approved", "pending", "approved"]);
  assert.equal(again.signoff, null);
  assert.equal(again.decisions.length, 3, "every decision is kept with its name");
  // Signing with a scene still open is refused, and says which.
  const early = decide(again, { action: "signoff", by: "R" });
  assert.equal(early.ok, false);
  assert.match(early.message.en, /S002/);
});

test("packaging: title, chapters from ayah times, tags and localized titles from the surah-name list", () => {
  const plan = { scenes: [{ kind: "title", surah: 93, ayah: null, start: 0 }, ...Array.from({ length: 11 }, (_, k) => ({ kind: "ayah", surah: 93, ayah: k + 1, start: 3 + k * 13 }))] };
  const p = packaging({ plan, surahNames, reciter: "Qari X", totalSeconds: 150, credits: "Quran text: Tanzil.net" });
  assert.match(p.title, /^سورة الضحى \| Surah Ad-Dhuhaa \(The Morning Hours\) \| Qari X$/);
  assert.ok(p.title.length <= 100);
  assert.equal(p.chapters[0].at, 0);
  assert.ok(p.chapters.length >= 3 && p.chapters.every((c, i) => i === 0 || c.at - p.chapters[i - 1].at >= 10));
  assert.match(p.description, /\n0:00 Ad-Dhuhaa 93:1\n/);
  assert.match(p.description, /Quran text: Tanzil\.net/);
  assert.match(p.localized.bn, /^সূরা Ad-Dhuhaa/);
  assert.ok(p.tags.includes("Surah Ad-Dhuhaa"));
  assert.deepEqual(p.missingLanguages, ["ur", "id", "tr", "ms", "fa"]);
  // Part of a surah: the ayah range is in the title.
  const part = packaging({ plan: { scenes: plan.scenes.slice(0, 6) }, surahNames, totalSeconds: 70 });
  assert.match(part.title, /سورة الضحى \(1-5\) \| Surah Ad-Dhuhaa \(The Morning Hours\), Ayat 1-5/);
});

test("the publish decision is PASS, WARNING or FAIL: doubtful pictures and unconfirmed ayah ends need a person; unverified verse timing blocks", () => {
  const direction = { shots: [{ id: "S001", surah: 95, ayah: 1, start: 0, end: 9, motif: "olive grove", because: { detail: "the olive", source: "Tanzil" } }, { id: "S002", surah: 95, ayah: 2, start: 9, end: 18, motif: "mountain", because: { detail: "Mount Sinai", source: "Tanzil" } }] };
  const media = { shots: [{ shot: "S001", asset: { id: "a", title: "olives", page: "p", licence: "CC0" }, check: /** @type {const} */ ("PASS") }, { shot: "S002", asset: { id: "b", title: "Sinai hut", page: "p", licence: "CC0" }, check: /** @type {const} */ ("WARNING"), doubts: ['title: "hut" in its title or tags'] }] };
  let review = reviewSheet(/** @type {any} */ (direction), media);
  assert.equal(review.scenes[1].check, "WARNING");
  const sureAll = { ayat: [{ sure: true }, { sure: true }, { sure: true }] };
  let v = readyToPublish(review, goodRender, sureAll);
  assert.equal(v.status, "WARNING");
  assert.ok(v.warn.some((m) => m.code === "quran.review.flagged" && /S002/.test(m.en)));
  // A finished render with no review is never PASS; a broken one is FAIL whatever the review says.
  assert.equal(readyToPublish(null, goodRender).status, "WARNING");
  assert.equal(readyToPublish(review, { ...goodRender, cards: [{ start: 0, end: 4 }] }).status, "FAIL");
  // Verse timing: fewer than half the ends confirmed blocks (the Ad-Duha case); some unconfirmed asks a person.
  assert.ok(readyToPublish(review, goodRender, { ayat: [{ sure: false }, { sure: false }, { sure: true }] }).fail.some((m) => m.code === "quran.review.timing"));
  assert.ok(readyToPublish(review, goodRender, { ayat: [{ sure: true }, { sure: false }, { sure: true }, { sure: true }] }).warn.some((m) => m.code === "quran.review.timingPartly"));
  for (const shot of ["S001", "S002"]) review = decide(review, { shot, action: "approve", by: "Editor" }).review;
  review = decide(review, { action: "signoff", by: "Hafiz A", qualification: "hafiz, ijazah in Hafs", contact: "a@example.org" }).review;
  v = readyToPublish(review, goodRender, sureAll);
  assert.equal(v.status, "PASS");
  assert.equal(v.ok, true);
});
