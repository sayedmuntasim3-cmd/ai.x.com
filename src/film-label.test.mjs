import { test } from "node:test";
import assert from "node:assert/strict";
import { DRAFT_LABEL, cardOf, draftReasons, isDraft } from "./film-label.mjs";

const reasons = [
  { code: "critic.relevance", en: "42% of the shots are relevant to the words; 80% is the floor.", bn: "শটের ৪২% কথার সঙ্গে প্রাসঙ্গিক।" },
  { code: "critic.designed", en: "The film has 0.4 designed moments a minute; 1.2 is the floor.", bn: "প্রতি মিনিটে ডিজাইন করা মুহূর্ত ০.৪টি।" },
];

test("a draft maps to the draft label and its plain reasons", () => {
  const film = { id: "a", status: "draft", draft: true, blocks: reasons, film: { bytes: 10, seconds: 2400 } };
  const card = cardOf(film);
  assert.equal(card.draft, true);
  assert.equal(card.label, DRAFT_LABEL);
  assert.equal(card.label, "Draft — did not pass the quality check");
  assert.deepEqual(card.reasons, [reasons[0].en, reasons[1].en]);
  assert.equal(card.download, "Download draft");
  assert.equal(card.canDownload, true);
  assert.equal(card.canRetry, true, "a draft can be started again");
  assert.equal(isDraft(film), true);
});

test("at most three reasons are shown, and only English ones", () => {
  const many = { draft: true, blocks: [...reasons, { code: "x", en: "third", bn: "তৃতীয়" }, { code: "y", en: "fourth", bn: "চতুর্থ" }] };
  assert.deepEqual(draftReasons(many), [reasons[0].en, reasons[1].en, "third"]);
  assert.deepEqual(draftReasons({ draft: true, blocks: [{ code: "x", en: "  ", bn: "কিছু" }, "a plain sentence"] }), ["a plain sentence"]);
});

test("a released film keeps today's words: no draft label, the film download", () => {
  const card = cardOf({ id: "b", status: "done", film: { bytes: 10, seconds: 1200 }, progress: [] });
  assert.equal(card.draft, false);
  assert.equal(card.label, "");
  assert.deepEqual(card.reasons, []);
  assert.equal(card.download, "Download");
  assert.equal(card.canRetry, false);
});

test("a stopped film can be started again and shows no draft label", () => {
  const card = cardOf({ id: "c", status: "failed", progress: [] });
  assert.equal(card.draft, false);
  assert.equal(card.canRetry, true);
  assert.equal(card.canDownload, false);
});
