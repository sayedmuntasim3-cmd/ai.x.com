import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SHORT_LIMITS, captionChunks, endsSentence, hookScore, hookText, pickQuranShorts, pickVoiceShorts,
  reframeMode, sentences, wordsOf,
} from "../src/shorts-pick.mjs";

/** A sentence spoken at a steady pace, its last word closing the sentence. @param {string} text @param {number} at */
function say(text, at) {
  const words = text.split(" ");
  return words.map((w, i) => ({ text: w, start: Math.round((at + i * 0.45) * 1000) / 1000, end: Math.round((at + i * 0.45 + 0.4) * 1000) / 1000 }));
}

const LINES = [
  "And so the day began quietly enough.",
  "The dam held the river back for forty years.",
  "In 1974 the first crack appeared in the concrete.",
  "Nobody wrote it down at the time.",
  "Why did the engineers ignore the report?",
  "A single valve had been sealed shut by mistake.",
  "The water rose three metres behind the wall.",
  "At 03:12 the sirens finally sounded.",
  "Two hundred families left their homes that night.",
  "The inquiry blamed a design that had never been tested.",
  "The valley is still empty today.",
  "A new dam stands four kilometres downstream.",
];
// Four passes over the same beats: a film of about four minutes, long enough for three Shorts that never overlap.
const FILM_LINES = [...LINES, ...LINES, ...LINES, ...LINES];
const WORDS = (() => {
  let at = 0;
  return FILM_LINES.flatMap((line) => { const words = say(line, at); at += line.split(" ").length * 0.45 + 1; return words; });
})();
const TOTAL = Math.max(0, WORDS.at(-1).end - 1);

test("the transcript is read as sentences: punctuation, or a long pause when it has none", () => {
  const sents = sentences(WORDS);
  assert.equal(sents.length, FILM_LINES.length);
  assert.equal(sents[0].text, LINES[0]);
  assert.ok(endsSentence(sents[2].words.at(-1).text));
  // Speech-to-text carries no full stops: the pause between two sentences ends them.
  const bare = WORDS.map((w) => ({ text: w.text.replace(/[.!?]$/, ""), start: w.start, end: w.end }));
  assert.equal(sentences(bare).length, FILM_LINES.length);
  // A short pause inside a sentence does not cut it.
  assert.equal(sentences([{ text: "one", start: 0, end: 0.4 }, { text: "two", start: 0.6, end: 1 }, { text: "three.", start: 1.1, end: 1.5 }]).length, 1);
});

test("three Shorts, each 30 to 55 s, opening on a sentence and closing on its full stop", () => {
  const picks = pickVoiceShorts(WORDS, { duration: TOTAL });
  assert.equal(picks.length, SHORT_LIMITS.count);
  const sents = sentences(WORDS);
  const starts = new Set(sents.map((s) => s.start));
  const ends = new Set(sents.map((s) => s.end));
  for (const p of picks) {
    assert.ok(p.seconds >= SHORT_LIMITS.min && p.seconds <= SHORT_LIMITS.max, `${p.id} is ${p.seconds} s`);
    assert.ok(starts.has(p.start), `${p.id} starts mid-sentence at ${p.start}`);
    assert.ok(ends.has(p.end), `${p.id} ends mid-sentence at ${p.end}`);
    assert.ok(endsSentence(p.closesWith), `${p.id} does not close on a full stop: ${p.closesWith}`);
    assert.ok(p.hook.length > 0 && p.hook.length <= 64);
  }
});

test("no two Shorts share a second, and they come from different parts of the film", () => {
  const picks = pickVoiceShorts(WORDS, { duration: TOTAL }).sort((a, b) => a.start - b.start);
  for (let k = 1; k < picks.length; k += 1) assert.ok(picks[k].start >= picks[k - 1].end, `${picks[k].id} overlaps ${picks[k - 1].id}`);
  const thirds = picks.map((p) => Math.min(2, Math.floor((p.start / TOTAL) * 3)));
  assert.equal(new Set(thirds).size, picks.length, "each Short comes from a different third of the film");
  assert.deepEqual(picks.map((p) => p.id), ["short-1", "short-2", "short-3"]);
});

test("the hook score prefers a question, a number or a name over filler", () => {
  const filler = hookScore("And so the day began quietly enough.");
  const question = hookScore("Why did the engineers ignore the report?");
  const number = hookScore("In 1974 the first crack appeared in the concrete.");
  const name = hookScore("The Fresnel lens bent the light into one beam.");
  assert.ok(question > filler && number > filler && name > filler);
  assert.equal(hookScore(""), 0);
  assert.equal(hookText("A short line."), "A short line");
  const long = hookText("The engineers who built the first dam in the valley never tested it before the water came", 40);
  assert.ok(long.length <= 40 && !long.endsWith(" "), long);
  // Every returned line is made of whole words from the sentence.
  for (const w of long.split(" ")) assert.ok("The engineers who built the first dam in the valley never tested it before the water came".includes(w));
});

test("with no stretch long enough there is no Short; nothing is invented", () => {
  assert.deepEqual(pickVoiceShorts([]), []);
  assert.deepEqual(pickVoiceShorts(WORDS.slice(0, 6), { duration: 2 }), []);
  const few = pickVoiceShorts(WORDS, { duration: TOTAL, count: 5 });
  assert.ok(few.length <= 5);
});

test("a recitation is cut from whole ayat only, in the pause between them", () => {
  /** Ayat of 9 s with a 1 s pause; `unsure` lists ayah numbers whose end is not sure. @param {number[]} [unsure] */
  const located = (unsure = []) => ({ ayat: Array.from({ length: 14 }, (_, k) => ({ surah: 93, ayah: k + 1, start: k * 10 + 0.5, end: k * 10 + 9.5, sure: !unsure.includes(k + 1) })) });
  const picks = pickQuranShorts(located(), 140);
  assert.equal(picks.length, 3);
  for (const p of picks) {
    assert.ok(p.seconds >= SHORT_LIMITS.min && p.seconds <= SHORT_LIMITS.max, `${p.id} is ${p.seconds} s`);
    assert.ok(Number.isInteger(p.fromAyah) && Number.isInteger(p.toAyah) && p.toAyah >= p.fromAyah);
    for (const cut of [p.start, p.end]) {
      // Never inside an ayah: the cut is in the pause, at the middle of it.
      for (const a of located().ayat) assert.ok(!(cut > a.start && cut < a.end), `${p.id} cuts inside ayah ${a.ayah} at ${cut}`);
    }
    assert.ok(p.seconds === 0 || (p.end > p.start));
  }
  const sorted = [...picks].sort((a, b) => a.start - b.start);
  for (let k = 1; k < sorted.length; k += 1) assert.ok(sorted[k].start >= sorted[k - 1].end, "passages never overlap");
  // No sure ayah end, nothing sure: no Short cut out of the middle of a recitation.
  assert.deepEqual(pickQuranShorts(located([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), 140), []);
});

test("captions come 2 to 4 words at a time, in order, never a word alone", () => {
  const chunks = captionChunks(WORDS.slice(0, 24));
  assert.ok(chunks.length > 0);
  for (const c of chunks) {
    assert.ok(c.words.length >= 1 && c.words.length <= 4, `chunk of ${c.words.length}: ${c.text}`);
    assert.equal(c.text, c.words.map((w) => w.text).join(" "));
    assert.ok(c.end > c.start);
  }
  for (let k = 1; k < chunks.length; k += 1) assert.ok(chunks[k].start >= chunks[k - 1].end - 0.001, "chunks do not overlap");
  // A single word only when the words cannot be shared (a one-word line).
  const alone = chunks.filter((c) => c.words.length === 1);
  assert.ok(alone.length <= 1, `${alone.length} one-word captions`);
  // Never longer than four words in a row, even where a sentence ends.
  assert.ok(chunks.every((c) => c.words.length <= 4));
});

test("a card keeps the whole frame; a filmed subject is centre-cropped", () => {
  assert.equal(reframeMode([{ type: "clip", subject: "a river" }]), "crop");
  assert.equal(reframeMode([{ type: "card", subject: "the timeline" }]), "blurred");
  assert.equal(reframeMode([{ type: "clip", subject: "a map of the valley" }]), "blurred");
  assert.equal(reframeMode([{ type: "chart", subject: "losses", focus: "center" }]), "crop");
  assert.equal(reframeMode([]), "crop");
});

test("the words of a transcript are read from either shape and kept in time order", () => {
  assert.equal(wordsOf({ words: WORDS }).length, WORDS.length);
  assert.equal(wordsOf(WORDS).length, WORDS.length);
  assert.deepEqual(wordsOf([{ text: "", start: 0, end: 1 }, { text: "x", start: Number.NaN, end: 1 }, { text: "y", start: 2, end: 3 }]).map((w) => w.text), ["y"]);
  const outOfOrder = wordsOf([{ text: "b", start: 2, end: 3 }, { text: "a", start: 0, end: 1 }]);
  assert.deepEqual(outOfOrder.map((w) => w.text), ["a", "b"]);
});
