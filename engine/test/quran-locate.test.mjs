import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tokenizeArabic } from "../src/arabic.mjs";
import { MESSAGES } from "../src/messages.mjs";
import { ayahText, buildQuranIndex } from "../src/quran.mjs";
import { planQuranFilm, checkQuranFilm } from "../src/quran-film.mjs";
import {
  FIXED_PHRASES, alignByPauses, alignPassage, boundaryErrors, findSurah, heardAyat, judgeMatch, listeningClips, locateRecitation, locationToMatch,
  parsePassage, passageUnits, recitationUnits, snapToPauses,
} from "../src/quran-locate.mjs";
import { matchRecitation } from "../src/quran.mjs";
import { voiceSpans } from "../src/voice-analyze.mjs";
import { rng } from "../src/voice-dsp.mjs";
import { testVoice } from "../src/voice-test-signal.mjs";

const data = new URL("../data/quran/", import.meta.url);
const index = buildQuranIndex(JSON.parse(readFileSync(new URL("tanzil-quran-simple-1.0.2.json", data), "utf8")));
const surahNames = JSON.parse(readFileSync(new URL("surah-names.json", data), "utf8"));

/**
 * A recitation as its voiced stretches: every unit takes its letters times
 * the reciter's speed (with a natural spread), a long unit is broken into
 * breaths, and a pause follows every breath. Returns the stretches and the
 * true start and end of every unit.
 * @param {{ weight: number }[]} units
 * @param {{ seed?: number, secondsPerUnit?: number, spread?: number, breath?: number, joinAfter?: number[] }} [o]
 */
function recite(units, o = {}) {
  const random = rng(o.seed ?? 7), rate = o.secondsPerUnit ?? 0.2, breath = o.breath ?? 12;
  /** @type {{ start: number, end: number }[]} */
  const spans = [];
  /** @type {{ start: number, end: number }[]} */
  const truth = [];
  let at = 0.4;
  units.forEach((u, k) => {
    const length = u.weight * rate * (1 + (o.spread ?? 0.08) * random.gauss());
    const breaths = Math.max(1, Math.ceil(length / breath));
    const start = at;
    for (let b = 0; b < breaths; b += 1) {
      const from = at, to = at + length / breaths;
      const last = spans[spans.length - 1];
      if (last && Math.abs(last.end - from) < 1e-9) last.end = to; else spans.push({ start: from, end: to });
      at = to;
      if (b < breaths - 1) at += 0.5 + 0.3 * random.next();
    }
    truth.push({ start, end: at });
    if (!(o.joinAfter ?? []).includes(k)) at += 0.6 + 0.6 * random.next();
  });
  return { spans, truth, seconds: at + 0.5 };
}

/** The words of a passage as a recognizer writes them, each with a time inside its ayah. @param {number} surah @param {number} from @param {number} to @param {{ start: number, end: number }[]} times @param {number} [drift] */
function heardWords(surah, from, to, times, drift = 0) {
  /** @type {{ text: string, start: number, end: number }[]} */
  const words = [];
  for (let a = from; a <= to; a += 1) {
    let tokens = tokenizeArabic(ayahText(index, surah, a) ?? "");
    if (a === 1 && surah !== 1 && surah !== 9) tokens = tokens.slice(4);
    const t = times[a - from], step = (t.end - t.start) / tokens.length;
    tokens.forEach((text, i) => words.push({ text, start: t.start + i * step + drift, end: t.start + (i + 1) * step + drift }));
  }
  return words;
}

test("letter units: longer text takes longer; a madd, a doubled letter and the separated letters count for more", () => {
  const basmala = recitationUnits(FIXED_PHRASES.basmala);
  assert.ok(basmala > 15 && basmala < 40, String(basmala));
  assert.ok(recitationUnits(ayahText(index, 2, 282)) > 15 * recitationUnits(ayahText(index, 112, 1)));
  // The same letters, with and without what lengthens them.
  assert.ok(recitationUnits("جَآءَ") > recitationUnits("جَعَ") + 3, "a madd before a hamza");
  assert.ok(recitationUnits("رَبَّ") > recitationUnits("رَبَ"), "a shadda");
  assert.ok(recitationUnits("الم") >= 12, "alif lam mim: three long letters");
  assert.equal(recitationUnits("قُلْ", { stop: false }) + 3, recitationUnits("قُلْ"));
  assert.equal(recitationUnits(""), 3);
});

test("the passage a user gives: numbers, names in Latin and Arabic letters, ranges, several surahs", () => {
  assert.equal(findSurah("93", surahNames), 93);
  assert.equal(findSurah("fatiha", surahNames), 1);
  assert.equal(findSurah("Al-Faatiha", surahNames), 1);
  assert.equal(findSurah("Yusuf", surahNames), 12);
  assert.equal(findSurah("سورة الفاتحة", surahNames), 1);
  assert.equal(findSurah("البقرة", surahNames), 2);
  assert.equal(findSurah("115", surahNames), null);
  assert.equal(findSurah("no such surah", surahNames), null);
  assert.deepEqual(parsePassage({ surah: 93 }, surahNames), { ok: true, ranges: [{ surah: 93, fromAyah: 1, toAyah: 11 }] });
  assert.deepEqual(parsePassage({ surah: "2", ayat: "255-257" }, surahNames), { ok: true, ranges: [{ surah: 2, fromAyah: 255, toAyah: 257 }] });
  assert.deepEqual(parsePassage({ surah: "2", ayat: "255" }, surahNames), { ok: true, ranges: [{ surah: 2, fromAyah: 255, toAyah: 255 }] });
  assert.deepEqual(parsePassage({ surah: "93,94" }, surahNames), { ok: true, ranges: [{ surah: 93, fromAyah: 1, toAyah: 11 }, { surah: 94, fromAyah: 1, toAyah: 8 }] });
  assert.deepEqual(parsePassage({ passage: "2:255-257, 112" }, surahNames), { ok: true, ranges: [{ surah: 2, fromAyah: 255, toAyah: 257 }, { surah: 112, fromAyah: 1, toAyah: 4 }] });
  const bad = parsePassage({ surah: "93", ayat: "5-20" }, surahNames);
  assert.equal(bad.ok, false);
  assert.equal(!bad.ok && bad.message.code, "quran.badAyat");
  const none = parsePassage({ surah: "zzz" }, surahNames);
  assert.equal(!none.ok && none.message.code, "quran.badSurah");
});

test("a later surah gets its basmala as a labelled unit; the first ayah is weighed without it", () => {
  const units = passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: 11 }, { surah: 94, fromAyah: 1, toAyah: 8 }]);
  assert.equal(units.length, 20);
  assert.equal(units[11].kind, "basmala");
  assert.ok(units[0].weight < recitationUnits(FIXED_PHRASES.basmala), "93:1 is two words, lighter than the basmala Tanzil writes before it");
  assert.equal(passageUnits(index, [{ surah: 1, fromAyah: 1, toAyah: 7 }]).filter((u) => u.kind !== "ayah").length, 0);
});

test("pause-anchored alignment: ayat recited one breath each land on their own pauses, exactly", () => {
  for (const [surah, count] of [[93, 11], [78, 40], [36, 83]]) {
    const units = passageUnits(index, [{ surah, fromAyah: 1, toAyah: count }]);
    const voice = recite(units, { seed: surah, breath: 1000 });
    const r = alignByPauses({ units, spans: voice.spans });
    assert.ok(r);
    r.placed.forEach((p, k) => {
      assert.ok(Math.abs(p.start - voice.truth[k].start) < 0.002 && Math.abs(p.end - voice.truth[k].end) < 0.002, `${surah}:${k + 1} ${p.start}-${p.end} vs ${voice.truth[k].start}-${voice.truth[k].end}`);
      assert.equal(p.joined, false);
    });
    assert.equal(r.onPause, count - 1);
    assert.ok(r.fit.median < 0.15);
  }
});

test("long ayat recited in several breaths: most ends are right, and the ends called sure are right", () => {
  let right = 0, total = 0, sure = 0, sureRight = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const units = passageUnits(index, [{ surah: 12, fromAyah: 1, toAyah: 60 }]);
    const voice = recite(units, { seed, breath: 9, spread: 0.1 });
    assert.ok(voice.spans.length > 1.3 * units.length, "the test must have breaths inside ayat");
    const r = alignByPauses({ units, spans: voice.spans });
    assert.ok(r);
    r.placed.slice(0, -1).forEach((p, k) => {
      const ok = Math.abs(p.end - voice.truth[k].end) < 0.01;
      total += 1; right += ok ? 1 : 0;
      if (p.onPause && p.confidence >= 0.8) { sure += 1; sureRight += ok ? 1 : 0; }
    });
  }
  assert.ok(right / total > 0.85, `${right} of ${total} ayah ends`);
  assert.ok(sure / total > 0.25, `${sure} of ${total} called sure`);
  assert.ok(sureRight / sure > 0.97, `${sureRight} of ${sure} sure ends are right`);
});

test("two ayat in one breath share a stretch: split by their letters and marked joined, the rest unharmed", () => {
  const units = passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: 11 }]);
  const voice = recite(units, { seed: 3, breath: 1000, joinAfter: [3] });
  assert.equal(voice.spans.length, 10);
  const r = alignByPauses({ units, spans: voice.spans });
  assert.ok(r);
  assert.equal(r.joined, 1);
  assert.equal(r.placed[3].joined, true);
  assert.equal(r.placed[3].onPause, false);
  assert.ok(Math.abs(r.placed[3].end - voice.truth[3].end) < 1.5, "inside the shared breath the split is approximate");
  assert.equal(r.placed[3].end, r.placed[4].start);
  for (const k of [0, 1, 2, 5, 6, 7, 8, 9, 10]) assert.ok(Math.abs(r.placed[k].start - voice.truth[k].start) < 0.002, `ayah ${k + 1}`);
  assert.ok(Math.abs(r.placed[4].end - voice.truth[4].end) < 0.002);
});

test("the opening and closing phrases are found from the pauses, labelled, and never counted as ayat", () => {
  const ranges = [{ surah: 93, fromAyah: 1, toAyah: 11 }];
  const body = passageUnits(index, ranges);
  const fixed = (/** @type {keyof typeof FIXED_PHRASES} */ k) => ({ kind: k, weight: recitationUnits(FIXED_PHRASES[k]) });
  const cases = [
    { units: [fixed("istiadha"), fixed("basmala"), ...body], opening: ["istiadha", "basmala"], closing: [] },
    { units: [fixed("basmala"), ...body], opening: ["basmala"], closing: [] },
    { units: [...body], opening: [], closing: [] },
    { units: [fixed("istiadha"), fixed("basmala"), ...body, fixed("closing")], opening: ["istiadha", "basmala"], closing: ["closing"] },
  ];
  for (const c of cases) {
    const voice = recite(c.units, { seed: 11, breath: 1000, spread: 0.05 });
    const r = alignPassage({ index, ranges, spans: voice.spans });
    assert.ok(r);
    assert.deepEqual(r.units.filter((u) => u.kind !== "ayah").map((u) => u.kind), [...c.opening, ...c.closing]);
    const first = r.units.findIndex((u) => u.kind === "ayah");
    assert.ok(Math.abs(r.placed[first].start - voice.truth[c.opening.length].start) < 0.002);
  }
  // Said by the caller: no search.
  const voice = recite(cases[1].units, { seed: 5, breath: 1000 });
  const told = alignPassage({ index, ranges, spans: voice.spans, opening: "basmala", closing: "none" });
  assert.equal(told?.choices, 1);
  assert.equal(told?.unsure, false);
});

test("the gate: a clear recognition is accepted, a weak one becomes a question, a contradiction is not settled silently", () => {
  const times = Array.from({ length: 11 }, (_, k) => ({ start: 10 * k, end: 10 * k + 9 }));
  const clear = matchRecitation(heardWords(93, 1, 11, times), index);
  assert.equal(judgeMatch(clear).verdict, "accept");
  assert.deepEqual(judgeMatch(clear).heard, [{ surah: 93, fromAyah: 1, toAyah: 11 }]);
  assert.equal(judgeMatch(clear, [{ surah: 93, fromAyah: 1, toAyah: 11 }]).verdict, "confirmed");
  assert.equal(judgeMatch(clear, [{ surah: 94, fromAyah: 1, toAyah: 8 }]).verdict, "mismatch");
  // Half of the speech is something else: a candidate to ask about, not an answer.
  const noise = Array.from({ length: 60 }, (_, i) => ({ text: ["كلام", "اخر", "غير", "معروف"][i % 4] + "ا".repeat(i % 3), start: 200 + i, end: 200.5 + i }));
  const mixed = matchRecitation([...heardWords(93, 1, 11, times), ...noise], index);
  const j = judgeMatch(mixed);
  assert.equal(j.verdict, "candidate");
  assert.ok(j.why.includes("coverage"));
  // Nothing of the Quran.
  assert.equal(judgeMatch(matchRecitation(noise, index)).verdict, "nothing");
  assert.equal(judgeMatch(null).verdict, "nothing");
  // A refrain alone occurs in many places: never accepted on its own.
  const refrain = matchRecitation(tokenizeArabic(ayahText(index, 55, 13) ?? "").map((text, i) => ({ text, start: i, end: i + 1 })), index);
  assert.notEqual(judgeMatch(refrain).verdict, "accept");
  // With the user's passage, a weak recognition does not contradict: it just does not confirm.
  const few = matchRecitation(heardWords(93, 1, 2, times), index);
  assert.equal(judgeMatch(few, [{ surah: 93, fromAyah: 1, toAyah: 11 }]).verdict, "unconfirmed");
});

test("recognised ayah times are moved onto the measured pauses", () => {
  const spans = [{ start: 1, end: 6 }, { start: 7, end: 12 }, { start: 12.2, end: 15 }, { start: 16.5, end: 20 }];
  // The recognizer is late by up to a second; ayah 2 has a breath inside (12-12.2), which is not its end.
  const snapped = snapToPauses([{ start: 1.4, end: 6.8 }, { start: 6.8, end: 15.9 }, { start: 15.9, end: 19.2 }], spans);
  assert.deepEqual(snapped.map((s) => [s.start, s.end]), [[1, 6], [7, 15], [16.5, 20]]);
  assert.deepEqual(snapped.map((s) => s.onPause), [true, true, true]);
  // No pause anywhere near: the recognised time stays and says so.
  const one = snapToPauses([{ start: 1, end: 3.5 }, { start: 3.5, end: 6 }], [{ start: 1, end: 6 }]);
  assert.equal(one[0].end, 3.5);
  assert.equal(one[0].onPause, false);
});

test("locate: the given passage alone gives estimated times; nothing is called confirmed", () => {
  const ranges = [{ surah: 93, fromAyah: 1, toAyah: 11 }];
  const units = [{ kind: "istiadha", weight: recitationUnits(FIXED_PHRASES.istiadha) }, { kind: "basmala", weight: recitationUnits(FIXED_PHRASES.basmala) }, ...passageUnits(index, ranges)];
  const voice = recite(units, { seed: 21, breath: 1000 });
  const loc = locateRecitation({ index, surahNames, spans: voice.spans, totalSeconds: voice.seconds, given: { surah: "93" } });
  assert.equal(loc.ok, true);
  assert.equal(loc.decision, "accept");
  assert.equal(loc.source, "given");
  assert.equal(loc.timing, "estimated");
  assert.equal(loc.ayat.length, 11);
  assert.deepEqual(loc.markers.map((m) => m.type), ["istiadha", "basmala"]);
  loc.ayat.forEach((a, k) => { assert.ok(Math.abs(a.start - voice.truth[k + 2].start) < 0.002 && Math.abs(a.end - voice.truth[k + 2].end) < 0.002); assert.equal(a.timing, "estimated"); });
  const codes = loc.messages.map((m) => m.code);
  assert.ok(codes.includes("quran.given") && codes.includes("quran.estimated") && codes.includes("quran.fixed"));
  assert.ok(!codes.includes("quran.confirmed"));
  // The plan the film is built from reads it unchanged.
  const match = locationToMatch(loc, index);
  const plan = planQuranFilm({ match, index, totalSeconds: voice.seconds, surahNames });
  assert.equal(plan.ok, true);
  assert.equal(plan.scenes.filter((s) => s.kind === "ayah").length, 11);
  assert.deepEqual(checkQuranFilm(plan, index), []);
  assert.equal(plan.summary.surah, 93);
  assert.equal(plan.scenes.find((s) => s.kind === "ayah")?.text, ayahText(index, 93, 1));
});

test("locate: a recognizer alone finds the passage; times sit on the pauses, not on the recognizer's loose word times", () => {
  const units = passageUnits(index, [{ surah: 78, fromAyah: 1, toAyah: 40 }]);
  const voice = recite(units, { seed: 9, breath: 1000 });
  const words = heardWords(78, 1, 40, voice.truth, 0.35);
  const loc = locateRecitation({ index, surahNames, spans: voice.spans, totalSeconds: voice.seconds, words });
  assert.equal(loc.decision, "accept");
  assert.equal(loc.source, "recognized");
  assert.equal(loc.timing, "recognized");
  assert.deepEqual(loc.passages, [{ surah: 78, fromAyah: 1, toAyah: 40 }]);
  assert.equal(loc.ayat.length, 40);
  loc.ayat.forEach((a, k) => assert.ok(Math.abs(a.start - voice.truth[k].start) < 0.002 && Math.abs(a.end - voice.truth[k].end) < 0.002, `78:${k + 1} ${a.start}-${a.end}`));
  assert.ok(loc.ayat.slice(0, -1).every((a) => a.sure));
  const e = boundaryErrors(loc.ayat, voice.truth.map((t, k) => ({ surah: 78, ayah: k + 1, ...t })));
  assert.equal(e.within200ms, e.boundaries);
  assert.equal(e.cutsInGap, 39);
});

test("locate: given and heard together are confirmed, and the two methods are compared", () => {
  const units = passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: 11 }]);
  const voice = recite(units, { seed: 4, breath: 1000 });
  const loc = locateRecitation({ index, surahNames, spans: voice.spans, totalSeconds: voice.seconds, given: { surah: "93", ayat: "1-11" }, words: heardWords(93, 1, 11, voice.truth, -0.2), opening: "none", closing: "none" });
  assert.equal(loc.source, "given+recognized");
  assert.ok(loc.messages.some((m) => m.code === "quran.confirmed"));
  assert.deepEqual(loc.agreement, { ayat: 11, medianSeconds: 0, worstSeconds: 0 });
});

test("locate: unclear, contradictory or impossible input ends in a question, never a guess", () => {
  const units = passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: 11 }]);
  const voice = recite(units, { seed: 4, breath: 1000 });
  const base = { index, surahNames, spans: voice.spans, totalSeconds: voice.seconds };
  // Nothing given, nothing heard.
  const nothing = locateRecitation(base);
  assert.equal(nothing.ok, false);
  assert.equal(nothing.question?.code, "quran.ask.passage");
  assert.equal(nothing.ayat.length, 0);
  // A recognizer that heard gibberish.
  const gibberish = locateRecitation({ ...base, words: Array.from({ length: 30 }, (_, i) => ({ text: "كلمه" + "ا".repeat(i % 4), start: i, end: i + 1 })) });
  assert.equal(gibberish.question?.code, "quran.ask.passage");
  // A weak recognition: the candidate is named in the question, not used.
  const weak = locateRecitation({ ...base, words: [...heardWords(93, 1, 4, voice.truth), ...Array.from({ length: 30 }, (_, i) => ({ text: ["هذا", "كلام", "اخر"][i % 3] + "ا".repeat(i % 4), start: 60 + i, end: 61 + i }))] });
  assert.equal(weak.decision, "ask");
  assert.equal(weak.question?.code, "quran.ask.confirm");
  assert.match(weak.question?.en ?? "", /93:1-4/);
  assert.equal(weak.ayat.length, 0);
  // The user says one surah, the recording is clearly another.
  const other = locateRecitation({ ...base, given: { surah: "94" }, words: heardWords(93, 1, 11, voice.truth) });
  assert.equal(other.question?.code, "quran.ask.mismatch");
  assert.match(other.question?.en ?? "", /94:1-8.*93:1-11/);
  // A passage that cannot be this recording: Al-Baqarah in 70 seconds.
  const tooShort = locateRecitation({ ...base, given: { surah: "2" } });
  assert.equal(tooShort.question?.code, "quran.ask.notFit");
  // A surah that does not exist.
  assert.equal(locateRecitation({ ...base, given: { surah: "200" } }).question?.code, "quran.badSurah");
  for (const r of [nothing, gibberish, weak, other, tooShort]) for (const m of r.messages) assert.ok(m.code in MESSAGES && m.en.length > 5 && m.bn.length > 5 && m.bn !== m.en, m.code);
});

test("locate: a repeated ayah is kept and reported; a takbir is labelled; other speech gets no ayah", () => {
  const units = passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: 11 }]);
  // The reciter says ayah 5 twice.
  const order = [0, 1, 2, 3, 4, 4, 5, 6, 7, 8, 9, 10];
  const voice = recite(order.map((k) => units[k]), { seed: 8, breath: 1000 });
  /** @type {{ text: string, start: number, end: number }[]} */
  const words = [];
  order.forEach((k, n) => words.push(...heardWords(93, k + 1, k + 1, [voice.truth[n]])));
  const end = voice.truth[voice.truth.length - 1].end;
  words.push({ text: "الله", start: end + 1, end: end + 1.5 }, { text: "أكبر", start: end + 1.5, end: end + 2.2 });
  const spans = [...voice.spans, { start: end + 1, end: end + 2.2 }];
  const loc = locateRecitation({ index, surahNames, spans, totalSeconds: end + 3, words });
  assert.equal(loc.decision, "accept");
  // The ayah keeps one place in the timeline, stretched over both recitations of it.
  assert.equal(loc.ayat.length, 11);
  assert.deepEqual(loc.repeats.map((r) => [r.surah, r.ayah]), [[93, 5]]);
  assert.ok(Math.abs(loc.ayat[4].start - voice.truth[4].start) < 0.002 && Math.abs(loc.ayat[4].end - voice.truth[5].end) < 0.002, `${loc.ayat[4].start}-${loc.ayat[4].end}`);
  assert.ok(Math.abs(loc.ayat[5].start - voice.truth[6].start) < 0.002);
  assert.deepEqual(loc.markers.map((m) => m.type), ["takbir"]);
  assert.ok(loc.messages.some((m) => m.code === "quran.repeat"));
  assert.equal(loc.other.filter((x) => x.type === "other").length, 0);
  // Going back to an earlier ayah is a new place in the timeline, marked as recited again.
  const back = [...heardWords(93, 1, 6, voice.truth), ...heardWords(93, 3, 11, voice.truth.slice(0, 9)).map((w) => ({ ...w, start: w.start + 100, end: w.end + 100 }))];
  const again = locateRecitation({ index, surahNames, spans: [...voice.spans.slice(0, 6), ...voice.spans.slice(0, 9).map((s) => ({ start: s.start + 100, end: s.end + 100 }))], totalSeconds: 200, words: back });
  assert.equal(again.decision, "accept");
  assert.deepEqual(again.ayat.filter((a) => a.repeat).map((a) => a.ayah), [3, 4, 5, 6]);
});

test("listening clips: at most 24 s each, cut only in pauses, every stretch inside one clip", () => {
  const units = passageUnits(index, [{ surah: 12, fromAyah: 1, toAyah: 30 }]);
  const voice = recite(units, { seed: 2, breath: 9 });
  const clips = listeningClips(voice.spans);
  assert.equal(clips.length % 2, 0);
  for (let i = 0; i < clips.length; i += 2) {
    assert.ok(clips[i + 1] - clips[i] <= 24.5, `${clips[i]}-${clips[i + 1]}`);
    if (i > 0) assert.ok(clips[i] >= clips[i - 1] - 1e-9, "clips do not overlap");
  }
  for (const s of voice.spans) assert.ok(clips.some((c, i) => i % 2 === 0 && c <= s.start && clips[i + 1] >= s.end), `stretch ${s.start}-${s.end} is whole inside a clip`);
  assert.deepEqual(listeningClips([]), []);
});

test("voice stretches from a signal: the phrases of a test voice come back within 60 ms", () => {
  const phrases = [{ start: 0.5, end: 2.5, held: false }, { start: 3.3, end: 5.6, held: true }, { start: 6.5, end: 8.2, held: false }, { start: 8.9, end: 11.4, held: false }];
  const v = voiceSpans(testVoice({ seconds: 12, phrases, noiseDb: -70, sampleRate: 16000 }), 16000);
  assert.equal(v.spans.length, phrases.length);
  v.spans.forEach((s, k) => assert.ok(Math.abs(s.start - phrases[k].start) < 0.06 && Math.abs(s.end - phrases[k].end) < 0.06, `${s.start}-${s.end}`));
  assert.ok(Math.abs(v.seconds - 12) < 0.001);
});

test("one ayah heard in two pieces, with a word heard twice, is one recitation, not a repeat (al-Husary, 10:24, on the runner)", () => {
  const piece = (/** @type {number} */ ayah, /** @type {number} */ words, /** @type {number} */ start, /** @type {number} */ end, /** @type {boolean} */ first, /** @type {boolean} */ last) => ({ surah: 10, ayah, start, end, matchedWords: words, ayahWords: ayah === 24 ? 43 : 11, hasFirstWord: first, hasLastWord: last, complete: first && last });
  const seg = (/** @type {any[]} */ ayat) => ({ surah: 10, fromAyah: ayat[0].ayah, toAyah: ayat[ayat.length - 1].ayah, matchedWords: 0, confidence: 0.9, from: 0, to: 0, start: null, end: null, ayat, ambiguous: false, alternatives: [] });
  const match = { isQuran: true, coverage: 1, words: 0, markers: [], segments: [seg([piece(23, 11, 853, 906, true, true), piece(24, 19, 906.5, 947, true, false)]), seg([piece(24, 26, 955.7, 1019, false, true), piece(25, 11, 1019.8, 1039, true, true)])] };
  const heard = heardAyat(/** @type {any} */ (match));
  assert.deepEqual(heard.map((a) => a.ayah), [23, 24, 25]);
  assert.deepEqual([heard[1].start, heard[1].end, heard[1].matchedWords], [906.5, 1019, 45]);
  // The same ayah recited again later, from its first word, stays a repeat.
  const again = { ...match, segments: [seg([piece(24, 43, 906.5, 1019, true, true)]), seg([piece(24, 43, 1100, 1200, true, true)])] };
  assert.equal(heardAyat(/** @type {any} */ (again)).length, 2);
});
