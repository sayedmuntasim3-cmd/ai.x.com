import { test } from "node:test";
import assert from "node:assert/strict";
import { DELIVERY_PRESETS, ZUPONA_NARRATOR, narrationCheck, planNarration, presetFor, sayWithLexicon, sentenceAlignment, splitSentences } from "../src/narrator.mjs";

test("sentences split where a sentence ends, never after a title, an initial or U.S., and join back exactly", () => {
  const text = "Dr. Lee met J. R. Smith in the U.S. Army. What drove them? Spices… A house in St. Louis cost $3.5 million.";
  const parts = splitSentences(text);
  assert.deepEqual(parts.map((s) => s.trim()), ["Dr. Lee met J. R. Smith in the U.S. Army.", "What drove them?", "Spices…", "A house in St. Louis cost $3.5 million."]);
  assert.equal(parts.join(""), text);
  assert.deepEqual(splitSentences("No ending punctuation"), ["No ending punctuation"]);
});

test("the lexicon respells whole names only, longest first", () => {
  const lex = [{ term: "Seville", say: "Seh-vil" }, { term: "Sanlúcar de Barrameda", say: "San Lookar day Barra-mayda" }, { term: "Barrameda", say: "x" }];
  assert.equal(sayWithLexicon("From Sanlúcar de Barrameda to Seville, not Sevilleans.", lex), "From San Lookar day Barra-mayda to Seh-vil, not Sevilleans.");
});

test("a documentary plan: one job per scene, preset pauses after each sentence, a longer one after a question", () => {
  const p = DELIVERY_PRESETS.investigative;
  const plan = planNarration({ lines: [{ scene: "SC0001", text: "Who built it? Nobody knows. Yet it stands." }, { scene: "SC0002", text: "   " }], preset: p });
  assert.equal(plan.ok, true);
  assert.equal(plan.jobs.length, 1);
  assert.deepEqual(plan.jobs[0].sentences.map((s) => s.pauseAfter), [p.questionPause, p.sentencePause, p.endPause]);
  assert.equal(plan.jobs[0].sentences.map((s) => s.text).join(""), "Who built it? Nobody knows. Yet it stands.");
});

test("Quran recitation and Arabic are never voiced by the machine; a line with Arabic text is refused, the rest go on", () => {
  const quran = planNarration({ lines: [{ scene: "SC0001", text: "Read." }], contentType: "quran_recitation" });
  assert.equal(quran.ok, false);
  assert.equal(quran.blocked?.code, "narrator.quran");
  assert.ok(quran.blocked?.bn);
  const ar = planNarration({ lines: [{ scene: "SC0001", text: "Read." }], versionId: "ar" });
  assert.equal(ar.blocked?.code, "narrator.language");
  const mixed = planNarration({ lines: [{ scene: "SC0001", text: "The verse says: بِسْمِ اللَّهِ." }, { scene: "SC0002", text: "Then the city grew." }], contentType: "islamic" });
  assert.deepEqual(mixed.refused.map((r) => [r.scene, r.reason.code]), [["SC0001", "narrator.arabicLine"]]);
  assert.deepEqual(mixed.jobs.map((j) => j.scene), ["SC0002"]);
  assert.equal(mixed.preset.id, "islamic-calm");
});

test("caption timings are exact at sentence edges and spell the line as written, not as respelled", () => {
  const plan = planNarration({ lines: [{ scene: "SC0001", text: "To Seville. Home." }], lexicon: [{ term: "Seville", say: "Seh-vil" }] });
  const job = plan.jobs[0];
  assert.equal(job.sentences[0].said, "To Seh-vil.");
  const a = sentenceAlignment(job, [{ start: 0, end: 1 }, { start: 1.5, end: 2 }]);
  assert.ok(a);
  assert.equal(a.characters.join(""), "To Seville. Home.");
  const homeAt = "To Seville. ".length;
  assert.equal(a.character_start_times_seconds[homeAt], 1.5);
  assert.equal(a.character_end_times_seconds[homeAt - 2], 1);
  assert.equal(a.character_end_times_seconds.at(-1), 2);
  assert.equal(sentenceAlignment(job, [{ start: 0, end: 1 }]), null);
});

test("the check flags a pace outside the version's band and a clipped peak", () => {
  const band = { min: 140, max: 160 };
  assert.equal(narrationCheck([{ seconds: 60, words: 150, peak: 0.8 }], band).ok, true);
  const slow = narrationCheck([{ seconds: 60, words: 100, peak: 1 }], band);
  assert.deepEqual(slow.problems.map((p) => p.code), ["narrator.pace", "narrator.clipped"]);
});

test("one narrator identity: a fixed blend of licensed voice styles, English only, model files pinned by checksum", () => {
  assert.deepEqual(ZUPONA_NARRATOR.versions, ["en-US"]);
  assert.equal(ZUPONA_NARRATOR.voice.reduce((a, [, w]) => a + w, 0), 1);
  for (const f of Object.values(ZUPONA_NARRATOR.files)) assert.match(f.sha256, /^[0-9a-f]{64}$/);
  assert.equal(presetFor({ contentType: "documentary" }).id, "cinematic");
  assert.equal(presetFor({ contentType: "documentary", preset: "nature" }).id, "nature");
  assert.equal(presetFor({ contentType: "story", preset: "nonsense" }).id, "cinematic");
});
