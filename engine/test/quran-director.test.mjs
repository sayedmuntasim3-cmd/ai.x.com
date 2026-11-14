import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AYAH_COUNTS, buildQuranIndex } from "../src/quran.mjs";
import { locateRecitation, passageUnits } from "../src/quran-locate.mjs";
import { parseTanzilText, passageMeaning } from "../src/quran-meaning.mjs";
import { planLocated } from "../src/voice-understand.mjs";
import { DIRECTION, allowedAt, checkDirection, directQuranFilm, shotTable, splitAtPauses } from "../src/quran-director.mjs";
import { rng } from "../src/voice-dsp.mjs";

const data = new URL("../data/quran/", import.meta.url);
const simple = JSON.parse(readFileSync(new URL("tanzil-quran-simple-1.0.2.json", data), "utf8"));
const index = buildQuranIndex(simple);
const surahNames = JSON.parse(readFileSync(new URL("surah-names.json", data), "utf8"));
const texts = { uthmani: parseTanzilText(readFileSync(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8")).ayat, simple, pickthall: JSON.parse(readFileSync(new URL("pickthall-1930.json", data), "utf8")).ayat };

/** A recitation of a whole surah as voiced stretches (breaths of at most `breath` seconds), located from the given surah, planned and directed. @param {number} surah @param {{ breath?: number, adab?: any, joinAfter?: number[] }} [o] */
function film(surah, o = {}) {
  const random = rng(surah);
  const units = passageUnits(index, [{ surah, fromAyah: 1, toAyah: AYAH_COUNTS[surah - 1] }]);
  /** @type {{ start: number, end: number }[]} */
  const spans = [];
  let at = 3;
  /** @type {{ start: number, end: number }[]} */
  const truth = [];
  units.forEach((u, k) => {
    const length = u.weight * 0.25;
    const begin = at;
    const breaths = Math.max(1, Math.ceil(length / (o.breath ?? 8)));
    for (let b = 0; b < breaths; b += 1) {
      const last = spans[spans.length - 1];
      if (last && Math.abs(last.end - at) < 1e-9) last.end = at + length / breaths; else spans.push({ start: at, end: at + length / breaths });
      at += length / breaths;
      if (b < breaths - 1) at += 0.45 + 0.2 * random.next();
    }
    truth.push({ start: begin, end: at });
    if (!(o.joinAfter ?? []).includes(k)) at += 0.8 + 0.4 * random.next();
  });
  // A second, independent method (the text aligned to the audio) agrees with the truth, as it does on clean recordings.
  const aligned = truth.map((t, k) => ({ surah, ayah: k + 1, start: t.start + 0.05, end: t.end - 0.1, score: 0.9, lastWordScore: 0.9, words: [{ start: t.start, end: t.start + 0.4, score: 0.9 }] }));
  const total = at + 4;
  const location = locateRecitation({ index, surahNames, spans, totalSeconds: total, given: { surah: String(surah) }, opening: "none", closing: "none", aligned });
  assert.equal(location.ok, true);
  const { plan } = planLocated(location, index, total, surahNames);
  const ranges = [{ surah, fromAyah: 1, toAyah: AYAH_COUNTS[surah - 1] }];
  return { plan, spans, direction: directQuranFilm({ plan, meaning: passageMeaning(texts, ranges), spans, adab: o.adab }) };
}

test("adab levels: people never (except from afar at people-distant), animals only from 'nature' up, faces never", () => {
  assert.equal(allowedAt("olive grove", "strict"), true);
  assert.equal(allowedAt("bees on flowers", "strict"), false);
  assert.equal(allowedAt("bees on flowers", "nature"), true);
  assert.equal(allowedAt("pilgrims", "nature"), false);
  assert.equal(allowedAt("pilgrims from afar", "people-distant"), true);
  assert.equal(allowedAt("face portrait", "people-distant"), false);
});

test("long stretches are split only at pauses, into shots of 5 to 12 s where the pauses allow it", () => {
  const pauses = [{ at: 4, length: 0.5 }, { at: 9, length: 0.6 }, { at: 15, length: 0.4 }, { at: 21, length: 0.5 }, { at: 27, length: 0.7 }];
  const cuts = splitAtPauses(0, 33, pauses);
  const edges = [0, ...cuts, 33];
  for (let i = 0; i + 1 < edges.length; i += 1) { const d = edges[i + 1] - edges[i]; assert.ok(d >= DIRECTION.minShot && d <= DIRECTION.maxShot, `${edges[i]}-${edges[i + 1]}`); }
  assert.ok(cuts.every((c) => pauses.some((p) => p.at === c)));
  assert.deepEqual(splitAtPauses(0, 30, []), [], "no pause: no cut, the shot holds");
});

test("Q3 exit, Ad-Duha: every shot has a reason; cuts only in pauses; the night and the morning come from the Arabic", () => {
  const { direction: d, spans } = film(93);
  assert.equal(d.ok, true, d.problems.join("\n"));
  assert.ok(d.shots.length >= 11);
  assert.equal(d.shots[0].transitionIn.type, "fade-from-black");
  for (const s of d.shots) assert.ok(s.because.detail && s.because.source && s.because.ayah, s.id);
  assert.deepEqual(checkDirection(d.shots, spans, "strict"), []);
  const one = d.shots.find((s) => s.ayah === 1), two = d.shots.find((s) => s.ayah === 2);
  assert.equal(one?.because.from, "arabic-word");
  assert.match(one?.because.detail ?? "", /morning light/);
  assert.match(two?.because.detail ?? "", /night/);
  assert.ok(d.shots.every((s) => s.end - s.start <= 12.5 || !d.shots.some((x) => x.ayah === s.ayah && x.parts > 1)), "a shot is long only where the ayah has no pause to cut at");
  for (let k = 1; k < d.shots.length; k += 1) if (!d.shots[k].refrain) assert.notEqual(d.shots[k].motif, d.shots[k - 1].motif, `${d.shots[k].id} repeats the picture before it`);
  const table = shotTable(d);
  assert.match(table, /\| S001 \|/);
  assert.equal(table.split("\n").filter((l) => /^\| S\d{3} /.test(l)).length, d.shots.length);
});

test("Ar-Rahman: the refrain returns to its own picture every time; the gardens of the Hereafter are only a symbol", () => {
  const { direction: d } = film(55);
  assert.equal(d.ok, true, d.problems.join("\n"));
  const refrains = d.shots.filter((s) => s.refrain);
  assert.equal(new Set(refrains.filter((s) => s.part === 1).map((s) => s.ayah)).size, 31, "the refrain is said 31 times");
  assert.equal(new Set(refrains.map((s) => s.motif)).size, 1, "one picture for the refrain");
  const gardens = d.shots.find((s) => s.ayah === 46);
  assert.equal(gardens?.symbolic, true);
  // 55:70-76 describe Paradise without naming it: the flag carries through.
  for (const a of [70, 72, 74, 76]) assert.equal(d.shots.find((s) => s.ayah === a)?.symbolic, true, `55:${a}`);
  // The sun and moon (55:5) are a literal sign, not a symbol.
  assert.equal(d.shots.find((s) => s.ayah === 5)?.symbolic, false);
});

test("an unsure ayah end is not cut at: the picture holds across it", () => {
  const { direction: d, plan } = film(93, { joinAfter: [3] });
  const unsure = plan.scenes.filter((s) => s.kind === "ayah" && s.endSure === false);
  assert.ok(unsure.length >= 1);
  for (const u of unsure) assert.ok(!d.shots.some((s) => Math.abs(s.start - u.end) < 0.002), `no cut at the end of ${u.surah}:${u.ayah}`);
  assert.ok(d.notes.some((n) => /not sure/.test(n)));
});

test("bees are named in An-Nahl but not shown at the strict level; at 'nature' they are", () => {
  const strict = film(16, { breath: 9 }).direction;
  assert.equal(strict.ok, true, strict.problems.join("\n"));
  const at68 = strict.shots.filter((s) => s.ayah === 68);
  assert.ok(at68.length && at68.every((s) => !/bee|honeycomb/i.test(s.motif)));
  assert.ok(strict.notes.some((n) => /16:68.*bees.*strict/.test(n)));
  const nature = film(16, { breath: 9, adab: "nature" }).direction;
  assert.ok(nature.shots.filter((s) => s.ayah === 68).some((s) => /bee|honeycomb/i.test(s.motif)));
});

test("checkDirection refuses a shot without a reason, a cut inside the voice and a literal Paradise", () => {
  const base = { id: "S001", scene: "Q0001", kind: /** @type {const} */ ("ayah"), surah: 1, ayah: 1, part: 1, parts: 1, look: ["sea"], motif: "sea", move: "slow push in", mood: "calm", brightness: /** @type {const} */ ("mid"), symbolic: false, refrain: null, transitionIn: { type: /** @type {const} */ ("dissolve"), seconds: 1 }, because: { ayah: "1:1", from: /** @type {const} */ ("theme"), detail: "x", source: "y" }, notes: [] };
  const spans = [{ start: 0, end: 4 }, { start: 5, end: 9 }];
  const problems = checkDirection([{ ...base, start: 0, end: 2 }, { ...base, id: "S002", start: 2, end: 9, because: { ...base.because, detail: "" } }, { ...base, id: "S003", start: 9, end: 12, symbolic: true, look: ["paradise garden"] }], spans, "strict");
  assert.ok(problems.some((p) => /S002: no reason/.test(p)));
  assert.ok(problems.some((p) => /S002: cut at 2 s is inside the voice/.test(p)));
  assert.ok(problems.some((p) => /S003: the unseen is shown literally/.test(p)));
});
