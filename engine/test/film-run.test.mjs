import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BudgetReached, estimateRun, newFilm, runFilm, validateChapterPlan } from "../src/film-run.mjs";
import { applyFixes, checkChapter, checkFilm, countWords, toSeconds } from "../src/scene-lines.mjs";

const USA = new URL("../../productions/ramesh-babu/USA/", import.meta.url);
const usaPlan = JSON.parse(readFileSync(new URL("s3-chapters.json", USA), "utf8"));
const usaChapters = usaPlan.map((/** @type {any} */ c) => ({
  id: c.id,
  markdown: readFileSync(new URL(`s5-${c.id}.md`, USA), "utf8"),
  spec: { startSeconds: toSeconds(c.start), endSeconds: toSeconds(c.end), firstScene: Number(c.firstScene.slice(2)), lastScene: Number(c.lastScene.slice(2)) },
}));

test("the finished USA Ramesh Babu film passes every code check", () => {
  const r = checkFilm(usaChapters, { durationSeconds: 2700 });
  assert.deepEqual(r.errors, []);
  assert.equal(r.stats.scenes, 270);
  assert.deepEqual(r.stats.loopsOpened, r.stats.loopsPaid);
  assert.ok(Math.abs(r.stats.words / r.stats.targetWords - 1) < 0.03);
});

test("a shifted timecode, a missing field and a banned phrase are caught with their scene", () => {
  const c = usaChapters[2];
  const broken = c.markdown
    .replace("**SC0100** | 0:16:10-", "**SC0100** | 0:16:12-")
    .replace(/(\*\*SC0101\*\*[^\n]*?) \| LOOK: [^\n]*/, "$1")
    .replace(/(\*\*SC0102\*\*[^\n]*?NARR: )/, "$1Buckle up. ");
  const r = checkChapter(broken, c.spec);
  const codes = r.errors.map((e) => `${e.code}:${e.scene}`);
  assert.ok(codes.includes("clock-gap:SC0100"), codes.join());
  assert.ok(codes.includes("field-missing:SC0101"), codes.join());
  assert.ok(codes.includes("banned-phrase:SC0102"), codes.join());
});

test("placeholders count as one spoken number; fixes apply only when unique", () => {
  assert.equal(countWords("About [C12 low] to [C12 high] cents."), 5);
  assert.equal(countWords("(wordless)"), 0);
  const r = applyFixes("a b a c", [{ find: "a", replace: "x" }, { find: "c", replace: "d" }, { find: "zz", replace: "y" }]);
  assert.equal(r.text, "a b a d");
  assert.deepEqual(r.log.map((l) => l.status), ["ambiguous", "applied", "not-found"]);
});

test("film requests are validated and the cost is estimated before a run", () => {
  assert.equal(newFilm({ topic: "x", minutes: 10 }, "a").ok, false);
  assert.equal(newFilm({ topic: "The Suez Canal", minutes: 10, versionId: "bn-BD" }, "a").ok, false);
  const ok = newFilm({ topic: "The Suez Canal", minutes: 45 }, "a");
  assert.ok(ok.ok && ok.film.durationSeconds === 2700);
  const e = estimateRun(2700);
  assert.equal(e.chapters, 6);
  assert.ok(e.usdLow > 0 && e.usdHigh > e.usdLow);
  assert.ok(estimateRun(2700, "claude-sonnet-5-5").usdHigh < e.usdHigh);
});

test("the chapter plan must tile the film", () => {
  const good = [
    { id: "C1", title: "A", start: "0:00:00", end: "0:01:00", firstScene: "SC0001", lastScene: "SC0006", brief: "b" },
    { id: "C2", title: "B", start: "0:01:00", end: "0:02:00", firstScene: "SC0007", lastScene: "SC0012", brief: "b" },
  ];
  assert.ok(validateChapterPlan(good, 120).ok);
  const bad = validateChapterPlan([good[0], { ...good[1], start: "0:01:05", firstScene: "SC0008" }], 120);
  assert.equal(bad.ok, false);
  assert.equal(bad.errors.length, 2);
});

// A scripted model: every stage answers as a real one would, so the whole
// run, including a repair and a cut-off reply, is exercised without an API key.
const FILLER = "the river runs past the old mill while the town wakes slowly under a grey sky and the bells ring out across the quiet square today".split(" ");
/** @param {number} n @param {number} sec */
function line(n, sec, words = 25) {
  const t = (/** @type {number} */ s) => `0:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const narr = [`Marker${n}`, ...FILLER].slice(0, words).join(" ") + ".";
  return `**SC${String(n).padStart(4, "0")}** | ${t(sec)}-${t(sec + 10)} | C${n <= 6 ? 1 : 2} | beat | E | C01 | NARR: ${narr} | W ${words}/25 | ANCHOR: "river" -> mill | SHOTS: (1) R3 mill | EV: R1 0 / R3 1 | SRC: Pexels · Q1 "old mill" | LOOK: LOOK-M`;
}
const chapter = (/** @type {number} */ first, /** @type {number} */ short = 0) =>
  Array.from({ length: 6 }, (_, i) => line(first + i, (first - 1 + i) * 10, first + i === short ? 10 : 25)).join("\n");

function scriptedModel() {
  /** @type {string[]} */
  const calls = [];
  let s4Parts = 0;
  return {
    calls,
    name: "claude-opus-5-5",
    /** @param {import("../src/film-run.mjs").ModelRequest} r */
    async call(r) {
      calls.push(r.stage);
      const usage = { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 20000 };
      const reply = (/** @type {string} */ text, stopReason = "end_turn") => ({ text, stopReason, usage });
      switch (r.stage) {
        case "s01": return reply("## S0\n## S1\nTitle A");
        case "research":
          assert.ok(r.webSearch && r.webSearch.maxUses > 0);
          return reply("```json\n" + JSON.stringify({ subject: "mill", facts: Array.from({ length: 9 }, (_, i) => ({ id: `F0${i}`, claim: "c", value: "v", sources: ["https://example.org/" + i], confidence: "high", conflict: null })), unknowns: [], doNotConfuse: [] }) + "\n```");
        case "s2": return reply("| C01 | claim |");
        case "s3": return reply("## S3\n```json\n" + JSON.stringify([
          { id: "C1", title: "A", start: "0:00:00", end: "0:01:00", firstScene: "SC0001", lastScene: "SC0006", brief: "opens L01" },
          { id: "C2", title: "B", start: "0:01:00", end: "0:02:00", firstScene: "SC0007", lastScene: "SC0012", brief: "pays L01" },
        ]) + "\n```");
        case "s4":
          s4Parts += 1;
          return s4Parts === 1 ? reply("## S4\nnarrator\npartial li", "max_tokens") : reply("sound bible\n");
        case "s5:C1": return reply("# BATCH C1\n" + chapter(1) + "\nQA S5 C1: PASS");
        case "s5:C2": return reply("# BATCH C2\n" + chapter(7, 9) + "\nQA S5 C2: PASS");
        case "repair:C2": {
          const text = r.messages[0].content[0].text;
          const bad = /NARR: (Marker9 [^|]*) \| W 10\/25/.exec(text);
          assert.ok(bad, "the repair sees the failing scene");
          return reply("```json\n" + JSON.stringify([{ find: `NARR: ${bad[1]} | W 10/25`, replace: `NARR: ${[`Marker9`, ...FILLER].slice(0, 25).join(" ")}. | W 25/25` }]) + "\n```");
        }
        case "qa": return reply("```json\n" + JSON.stringify({ mustFix: [{ lens: "facts", chapter: "C1", scene: "SC0002", issue: "x", find: "NARR: Marker2 the", replace: "NARR: Marker2 a" }], passed: ["p"], notChecked: [] }) + "\n```");
        case "s6": return reply("## S6");
        case "s7": return reply("## S7");
        default: throw new Error("unexpected stage " + r.stage);
      }
    },
  };
}

function memoryStore() {
  const m = new Map();
  return { m, get: async (/** @type {string} */ k) => m.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } };
}

test("a whole film runs S0 to S7, repairs a bad chapter, applies QA fixes and resumes for free", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f1");
  assert.ok(made.ok);
  const model = scriptedModel();
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "MANUAL", model, store });
  assert.equal(state.status, "done", JSON.stringify(state.gaps));
  assert.deepEqual(model.calls, ["s01", "research", "s2", "s3", "s4", "s4", "s5:C1", "s5:C2", "repair:C2", "qa", "s6", "s7"]);
  for (const f of ["s01.md", "research.json", "s2.md", "s3.md", "s3-chapters.json", "s4.md", "s5-C1.md", "s5-C2.md", "qa.json", "fix-log.json", "film-check.json", "s6.md", "s7.md", "run.json"]) assert.ok(store.m.has(f), f);
  assert.equal(store.m.get("s4.md"), "## S4\nnarrator\nsound bible\n", "a cut-off reply is continued after its last complete line");
  assert.ok(store.m.get("s5-C1.md").includes("NARR: Marker2 a"), "the QA fix is applied");
  assert.ok(store.m.has("s5-C1.draft.md"), "the pre-fix chapter is kept");
  assert.ok(JSON.parse(store.m.get("film-check.json")).ok);
  assert.equal(state.usage["s4"].calls, 2);
  assert.ok(state.costUsd > 0);

  const again = await runFilm({ film: made.film, manual: "MANUAL", model, store });
  assert.equal(again.status, "done");
  assert.equal(model.calls.length, 12, "a finished run makes no new model calls");
});

test("a run stops at its budget and resumes where it stopped", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f2");
  assert.ok(made.ok);
  const model = scriptedModel();
  const store = memoryStore();
  await assert.rejects(runFilm({ film: made.film, manual: "M", model, store, budgetUsd: 0.02 }), BudgetReached);
  const stopped = JSON.parse(store.m.get("run.json"));
  assert.equal(stopped.status, "stopped-budget");
  const spent = model.calls.length;
  assert.ok(spent >= 1 && spent < 12);
  const done = await runFilm({ film: made.film, manual: "M", model, store });
  assert.equal(done.status, "done");
  assert.equal(model.calls.length, 12, "nothing already paid for is asked again");
});
