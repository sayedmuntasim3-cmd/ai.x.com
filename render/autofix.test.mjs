import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MAX_ROUNDS, affectedParts, autofixLoop, draftRecord, failingShots, main, repick, shotLevelOnly, withRounds } from "./autofix.mjs";

const pick = (/** @type {string} */ id) => ({ id, source: "pixabay", kind: "video", title: `picture ${id}`, mediaUrl: `https://cdn.example/${id}.mp4`, previewUrl: `https://cdn.example/${id}.jpg`, sourcePageUrl: `https://example.com/${id}`, creator: null, durationSeconds: 6, width: 1920, height: 1080, licence: { licenseId: "pixabay" } });

/** A shot as the render's report carries it. */
const shot = (/** @type {number} */ n, /** @type {number} */ relevance) => ({ id: `C1-${n}`, scene: "C1", shot: n, start: (n - 1) * 3, end: n * 3, frames: 90, type: "clip", url: `https://cdn.example/a${n}.mp4`, relevance, shotType: "wide" });

/**
 * Four shots, two of them below the relevance floor: the same shape as film e0b87efb (relevance 42%).
 * @param {{ relevance?: number[] }} [o]
 */
function fixture(o = {}) {
  const rel = o.relevance ?? [0.1, 0.1, 0.9, 0.9];
  const report = {
    durationSeconds: 12,
    shots: rel.map((r, i) => shot(i + 1, r)),
    picture: { flicker: [], blurred: [], dark: [] },
    critic: { verdict: "block", findings: [{ code: "critic.relevance", severity: "block", en: "42% of the shots are relevant to the words; 80% is the floor.", bn: "শটের ৪২% কথার সঙ্গে প্রাসঙ্গিক; ন্যূনতম ৮০% দরকার।" }], measures: { designedPerMinute: 0.4, cutsIn30: 1, momentsIn30: 0 } },
  };
  const media = { chapter: "C1", shots: rel.map((_, i) => ({ id: `C1-${i + 1}`, scene: "C1", shot: i + 1, start: i * 3, end: (i + 1) * 3, status: "found", pick: pick(`a${i + 1}`), why: { relevance: rel[i] } })) };
  const candidates = { chapter: "C1", shots: rel.map((_, i) => ({ id: `C1-${i + 1}`, ranked: [`a${i + 1}`, `b${i + 1}`, `c${i + 1}`, `d${i + 1}`].map((id, k) => ({ id, title: `picture ${id}`, relevance: k === 3 ? 0.1 : 0.4, pick: pick(id) })) })) };
  return { report, media, candidates };
}

test("only shot-level blocks are re-picked; the mix or the hook is not a picture problem", () => {
  assert.equal(shotLevelOnly([{ code: "critic.relevance", severity: "block" }]), true);
  assert.equal(shotLevelOnly([{ code: "critic.relevance", severity: "block" }, { code: "critic.flicker", severity: "block" }]), true);
  assert.equal(shotLevelOnly([{ code: "critic.relevance", severity: "block" }, { code: "critic.loudness", severity: "block" }]), false);
  assert.equal(shotLevelOnly([{ code: "critic.relevance", severity: "warn" }]), false, "a warn is not a block");
  assert.equal(shotLevelOnly([]), false);
});

test("the failing shots are the ones the report points at, by id", () => {
  const { report } = fixture();
  const failing = failingShots(report);
  assert.deepEqual([...failing.keys()], ["C1-1", "C1-2"]);
  assert.deepEqual(failing.get("C1-1"), ["critic.relevance"]);
  // A flicker and an empty shot are found too, from the picture's own evidence.
  const more = { shots: [{ id: "C1-7", type: "clip", url: null }], picture: { flicker: [{ id: "C1-8", at: 4 }], blurred: [], dark: [{ id: "C1-9" }] } };
  const f2 = failingShots(more);
  assert.deepEqual([...f2.keys()].sort(), ["C1-7", "C1-8", "C1-9"]);
  assert.deepEqual(f2.get("C1-7"), ["critic.media"]);
});

test("the next candidate is taken in rank order, never one another shot uses, never below the relevance floor", () => {
  const { media, candidates } = fixture();
  const plan = repick(media, candidates, new Map([["C1-1", ["critic.relevance"]]]), { round: 1 });
  assert.equal(plan.changed.length, 1);
  assert.equal(plan.changed[0].from, "a1");
  assert.equal(plan.changed[0].to, "b1");
  assert.equal(media.shots[0].pick.id, "b1");
  assert.equal(media.shots[0].review, "autofix");
  // The candidate below the floor (d1) is never reached, even in a later round.
  repick(media, candidates, new Map([["C1-1", ["critic.relevance"]]]), { round: 2 });
  assert.equal(media.shots[0].pick.id, "c1");
  const third = repick(media, candidates, new Map([["C1-1", ["critic.relevance"]]]), { round: 3 });
  assert.equal(third.changed.length, 0, "d1 is below the floor; nothing lower is used");
  assert.match(third.skipped[0].why, /relevance floor/);
});

test("only the parts holding a changed shot are drawn again", () => {
  const report = { shots: Array.from({ length: 8 }, (_, i) => ({ id: `C1-${i + 1}`, frames: 90 })) };
  assert.deepEqual(affectedParts(report, ["C1-4"], 8), [4]);
  assert.deepEqual(affectedParts(report, ["C1-1", "C1-8"], 4), [1, 4]);
  assert.deepEqual(affectedParts(report, ["C1-4"], 2), [1]);
  assert.deepEqual(affectedParts({}, ["C1-4"], 8), []);
});

test("the loop picks the next candidate and stops after two rounds", async () => {
  const { report, media, candidates } = fixture();
  /** @type {number[][]} */
  const drawn = [];
  let gates = 0;
  const result = await autofixLoop({
    report,
    media,
    candidates,
    parts: 4,
    // The film is drawn again after each round and still fails (the same share), so round 2 must happen.
    rerender: async ({ parts }) => {
      drawn.push(parts);
      gates += 1;
      return JSON.parse(JSON.stringify(report));
    },
  });
  assert.equal(MAX_ROUNDS, 2);
  assert.equal(result.rounds.length, 2, "two rounds, then the film is handed over");
  assert.equal(gates, 2);
  assert.deepEqual(result.rounds[0].changed.map((c) => c.to), ["b1", "b2"]);
  assert.deepEqual(result.rounds[1].changed.map((c) => c.to), ["c1", "c2"]);
  assert.equal(result.rounds[0].before.relevance, 50);
  assert.equal(result.rounds[1].after.relevance, 50);
  assert.deepEqual(result.rounds[0].parts, [1, 2], "both shots sit in the first half of a 4-part film");
  assert.deepEqual(drawn, [[1, 2], [1, 2]]);
  assert.equal(result.passed, false, "still blocked after the rounds: a draft");
  const draft = draftRecord(result.report);
  assert.equal(draft.draft, true);
  assert.equal(draft.blocks.length, 1);
  assert.match(draft.blocks[0].en, /relevant to the words/);
  assert.match(draft.blocks[0].bn, /প্রাসঙ্গিক/);
});

test("a passing film is untouched and nothing is drawn again", async () => {
  const { report, media, candidates } = fixture({ relevance: [0.9, 0.9, 0.9, 0.9] });
  report.critic = { verdict: "pass", findings: [], measures: report.critic.measures };
  let drawn = 0;
  const result = await autofixLoop({ report, media, candidates, parts: 4, rerender: async () => { drawn += 1; return report; } });
  assert.deepEqual(result.rounds, []);
  assert.equal(result.passed, true);
  assert.equal(drawn, 0);
  assert.equal(media.shots[0].pick.id, "a1");
});

test("a film blocked on the mix is not re-picked: the loop stops and says why", async () => {
  const { report, media, candidates } = fixture();
  report.critic.findings = [{ code: "critic.loudness", severity: "block", en: "The mix is flat.", bn: "মিক্স সমতল।" }];
  let drawn = 0;
  const result = await autofixLoop({ report, media, candidates, parts: 4, rerender: async () => { drawn += 1; return report; } });
  assert.equal(drawn, 0);
  assert.equal(result.rounds.length, 1);
  assert.match(result.rounds[0].stopped, /not about single shots/);
});

test("a fixture run writes round 1, round 2 and a draft with reasons into the report JSON", async () => {
  const dir = mkdtempSync(join(tmpdir(), "autofix-"));
  const { report, media, candidates } = fixture();
  writeFileSync(join(dir, "media-C1.json"), JSON.stringify(media));
  writeFileSync(join(dir, "candidates-C1.json"), JSON.stringify(candidates));
  writeFileSync(join(dir, "film.report.json"), JSON.stringify(report));
  const lines = [];
  const print = (/** @type {string} */ l) => lines.push(l);

  const one = await main(["--run", dir, "--report", join(dir, "film.report.json"), "--parts", "4", "--round", "1", "--out", join(dir, "autofix.json")], { print });
  assert.equal(one, 0);
  assert.match(lines[0], /Round 1: 2 shot\(s\) re-picked/);
  const afterOne = JSON.parse(readFileSync(join(dir, "media-C1.json"), "utf8"));
  assert.equal(afterOne.shots[0].pick.id, "b1");

  // The film is drawn again and still fails: the second round re-picks the shots once more.
  const two = await main(["--run", dir, "--report", join(dir, "film.report.json"), "--parts", "4", "--round", "2", "--out", join(dir, "autofix.json")], { print });
  assert.equal(two, 0);
  const afterTwo = JSON.parse(readFileSync(join(dir, "media-C1.json"), "utf8"));
  assert.equal(afterTwo.shots[0].pick.id, "c1");

  const log = JSON.parse(readFileSync(join(dir, "autofix.json"), "utf8"));
  assert.deepEqual(log.rounds.map((/** @type {any} */ r) => r.round), [1, 2]);
  assert.equal(log.rounds[0].changed[0].relevance.after, 0.4);
  assert.deepEqual(log.rounds[1].parts, [1, 2]);

  const merged = await main(["--report", join(dir, "film.report.json"), "--merge", join(dir, "autofix.json")], { print });
  assert.equal(merged, 0);
  const final = JSON.parse(readFileSync(join(dir, "film.report.json"), "utf8"));
  assert.equal(final.autofix.roundsTried, 2);
  assert.equal(final.autofix.changedShots, 4);
  assert.equal(final.critic.verdict, "block", "a draft is still a block: nothing was relabelled");
  const draft = draftRecord(final);
  assert.deepEqual(draft.blocks.map((/** @type {any} */ b) => b.code), ["critic.relevance"]);

  // A report the loop cannot help with changes nothing on disk.
  const before = readFileSync(join(dir, "media-C1.json"), "utf8");
  writeFileSync(join(dir, "film.report.json"), JSON.stringify({ ...report, critic: { ...report.critic, findings: [{ code: "critic.loudness", severity: "block", en: "flat", bn: "সমতল" }] } }));
  assert.equal(await main(["--run", dir, "--report", join(dir, "film.report.json"), "--parts", "4", "--round", "1"], { print }), 2);
  assert.equal(readFileSync(join(dir, "media-C1.json"), "utf8"), before);
  assert.equal(existsSync(join(dir, "autofix.json")), true);
});

test("the report keeps the rounds even when none were needed", () => {
  const merged = withRounds({ critic: { verdict: "pass" } }, []);
  assert.deepEqual(merged.autofix, { rounds: [], roundsTried: 0, changedShots: 0 });
  assert.equal(merged.critic.verdict, "pass");
});

test("a black stretch names the picture shots over it, and a film with one non-shot block is still fixed for its shot blocks", () => {
  const report = { shots: [{ id: "S1", type: "clip", start: 0, end: 10, url: "a" }, { id: "S2", type: "clip", start: 10, end: 20, url: "b" }, { id: "S3", type: "card", start: 20, end: 24 }], master: { black: [{ start: 15.1, end: 18.6, duration: 3.5 }] } };
  assert.deepEqual([...failingShots(report).entries()], [["S2", ["critic.black"]]]);
  assert.equal(shotLevelOnly([{ severity: "block", code: "critic.cues" }, { severity: "block", code: "critic.black" }]), false, "mixed blocks are not shot-level only");
});
