import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BudgetReached, estimateRun, newFilm, runFilm, validateChapterPlan } from "../src/film-run.mjs";
import { applyFixes, checkChapter, checkFilm, countWords, toSeconds } from "../src/scene-lines.mjs";
import { productionGraph, understand } from "../src/bossism.mjs";
import { superviseFilm } from "../src/supervise.mjs";

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

test("narration never asks the viewer to like, subscribe or comment", () => {
  const c = usaChapters[2];
  const asks = c.markdown.replace(/(\*\*SC0102\*\*[^\n]*?NARR: )/, "$1Like and subscribe, and let me know in the comments. ");
  const banned = checkChapter(asks, c.spec).errors.filter((e) => e.code === "banned-phrase" && e.scene === "SC0102").map((e) => e.detail);
  assert.ok(banned.some((d) => d.includes("like and subscribe")), banned.join());
  assert.ok(banned.some((d) => d.includes("let me know in the comments")), banned.join());
  // A story about a company's subscribers is not an ask.
  const story = c.markdown.replace(/(\*\*SC0102\*\*[^\n]*?NARR: )/, "$1The service had two million subscribers. ");
  assert.ok(!checkChapter(story, c.spec).errors.some((e) => e.code === "banned-phrase" && e.scene === "SC0102"));
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
        case "edit:C1":
          assert.ok(r.messages[0].content[0].text.includes("SC0002 0:00:10.0-0:00:20.0"), "the director sees the scene sheet");
          assert.ok(r.messages[0].content[0].text.includes("LONG HOLDS") && r.messages[0].content[0].text.includes("SC0001-1 0:00:00.0-0:00:10.0 (10 s)"), "and the holds code measured");
          return reply("```json\n" + JSON.stringify({ scenes: [
            { scene: "SC0001", punchIns: ["0:00:05.0"] },
            { scene: "SC0002", transition: "whip", punchIns: ["0:00:14.0"], shakes: [], hits: [{ at: "0:00:14.0", sound: "impact" }], why: "the turn" },
            { scene: "SC0003", transition: "glitch", punchIns: ["0:00:21.0"] },
            { scene: "SC0004", punchIns: ["0:00:35.0"] }, { scene: "SC0005", punchIns: ["0:00:45.0"] }, { scene: "SC0006", punchIns: ["0:00:55.0"] },
          ] }) + "\n```");
        case "viewer": {
          assert.equal(r.system.length, 1, "the panel reads without the production manual");
          assert.ok(!r.system[0].text.includes("MANUAL") && r.messages[0].content[0].text.includes("SAID: Marker1"), "it sees what is said and seen, not the plan");
          return reply("```json\n" + JSON.stringify({ stayScore: 7, why: "the mill grabs you", leaves: [{ viewer: "the 19-year-old", scene: "SC0003", reason: "slow" }], kept: ["the bells"], fixes: [{ scene: "SC0003", find: "NARR: Marker3 the", replace: "NARR: Marker3 one", why: "sharper" }] }) + "\n```");
        }
        case "edit:C2": return reply("```json\n" + JSON.stringify({ scenes: [{ scene: "SC0099", transition: "whip" }, { scene: "SC0008", shakes: ["0:01:15.0"] }] }) + "\n```");
        case "s6": return reply("## S6");
        case "s7": return reply("## S7\n**Final title: The Old Mill at Dawn**");
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
  assert.deepEqual(model.calls, ["s01", "research", "s2", "s3", "s4", "s4", "s5:C1", "s5:C2", "repair:C2", "qa", "viewer", "edit:C1", "edit:C2", "s6", "s7"]);
  for (const f of ["s01.md", "research.json", "s2.md", "s3.md", "s3-chapters.json", "s4.md", "s5-C1.md", "s5-C2.md", "qa.json", "fix-log.json", "film-check.json", "s6.md", "s7.md", "run.json"]) assert.ok(store.m.has(f), f);
  assert.equal(store.m.get("s4.md"), "## S4\nnarrator\nsound bible\n", "a cut-off reply is continued after its last complete line");
  assert.ok(store.m.get("s5-C1.md").includes("NARR: Marker2 a"), "the QA fix is applied");
  assert.ok(store.m.has("s5-C1.draft.md"), "the pre-fix chapter is kept");
  assert.ok(JSON.parse(store.m.get("film-check.json")).ok);
  assert.equal(state.usage["s4"].calls, 2);
  assert.ok(state.costUsd > 0);

  const again = await runFilm({ film: made.film, manual: "MANUAL", model, store });
  assert.equal(again.status, "done");
  assert.equal(model.calls.length, 15, "a finished run makes no new model calls");
  assert.ok(store.m.get("s5-C1.md").includes("NARR: Marker3 one"), "the viewer panel's fix is applied when the code checks still pass");
  assert.equal(JSON.parse(store.m.get("viewer.json")).applied, 1);
  // The Edit Director's plans, checked in code: the glitch right after a whip is refused, an unknown scene is dropped.
  const e1 = JSON.parse(store.m.get("edit-C1.json"));
  assert.deepEqual(e1.scenes.map((/** @type {any} */ x) => [x.scene, x.transition ?? null, x.punchIns]), [["SC0001", null, [5]], ["SC0002", "whip", [14]], ["SC0003", null, [21]], ["SC0004", null, [35]], ["SC0005", null, [45]], ["SC0006", null, [55]]]);
  assert.deepEqual(e1.holds, { found: 6, uncovered: [] }, "code found the 10-second holds of the first minute; the director covered each");
  assert.ok(e1.problems.some((/** @type {string} */ p) => p.startsWith("SC0003") && p.includes("right after another named transition")));
  const e2 = JSON.parse(store.m.get("edit-C2.json"));
  assert.deepEqual(e2.scenes.map((/** @type {any} */ x) => [x.scene, x.shakes]), [["SC0008", [75]]]);
  assert.ok(e2.problems.some((/** @type {string} */ p) => p.startsWith("SC0099")));
  assert.deepEqual(state.stages["edit:C1"].result, { scenes: 6, transitions: 1, photos: 0, punchIns: 6, shakes: 0, hits: 1, dropped: 1, longHolds: 6, uncovered: 0 });
});

test("Bossism's production graph is the run itself: every stage the run executes is a node, in an order the graph allows", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "graph-check");
  assert.ok(made.ok);
  const store = memoryStore();
  /** @type {string[]} */
  const order = [];
  await runFilm({ film: made.film, manual: "M", model: scriptedModel(), store, log: (l) => { const m = /^(\S+): start$/.exec(l); if (m) order.push(m[1]); } });
  const graph = productionGraph(understand({ film: made.film }), ["C1", "C2"]);
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  for (const id of order) assert.ok(nodes.has(id), `the run executed ${id}, which the graph does not know`);
  // Every dependency of a stage that ran, if it also ran, ran before it.
  for (const [i, id] of order.entries()) for (const dep of /** @type {any} */ (nodes.get(id)).after) {
    const at = order.indexOf(dep.id);
    assert.ok(at === -1 || at < i, `${id} ran before its dependency ${dep.id}`);
  }
  const skipped = graph.nodes.map((n) => n.id).filter((id) => !order.includes(id));
  assert.deepEqual(skipped, ["market", "sources", "media:C1", "media:C2", "originality", "review", "render", "master"], "only the stages this test does not connect are absent");
});

test("Bossism sends a weak opening back with notes, redoes only what depends on it, and stops at the revision limit", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "supervise");
  assert.ok(made.ok);
  const base = scriptedModel();
  let round = 0;
  let firstRound = 0;
  /** @type {string[]} */
  const notesSeen = [];
  const model = {
    ...base,
    async call(/** @type {import("../src/film-run.mjs").ModelRequest} */ r) {
      const reply = await base.call(r);
      if (r.stage === "s5:C1" && r.messages[0].content.some((b) => b.text?.startsWith("REVISION NOTES"))) notesSeen.push(r.messages[0].content.map((b) => b.text).join(" "));
      if (r.stage === "viewer" && round === 0) return { ...reply, text: reply.text.replace('"stayScore":7', '"stayScore":4').replace("the mill grabs you", "nothing happens for twenty seconds") };
      return reply;
    },
  };
  const store = memoryStore();
  const result = await superviseFilm({
    film: made.film, store, maxRevisions: 1,
    runOnce: async (r) => { round = r; if (r === 1) firstRound = base.calls.length; return runFilm({ film: made.film, manual: "M", model, store }); },
  });
  assert.equal(result.rounds, 1);
  assert.equal(notesSeen.length, 1, "the redone chapter was told why");
  assert.match(notesSeen[0], /cold panel of target viewers would leave the opening/);
  const redone = base.calls.slice(firstRound);
  assert.ok(firstRound > 0 && redone.length > 0);
  assert.deepEqual(redone.filter((c) => ["s01", "research", "s2", "s3", "s4", "s5:C2"].includes(c)), [], "nothing before the chapter, and not the next chapter, is paid for again");
  assert.deepEqual(redone.filter((c) => c === "s5:C1" || c === "qa" || c === "viewer"), ["s5:C1", "qa", "viewer"], "the chapter and what reads it are redone");
  assert.ok(!result.state.gaps.some((/** @type {string} */ g) => /scored 4\/10/.test(g)), "the old panel's gap is withdrawn with the stage that made it");
  assert.equal(result.state.revisions, 1);
  assert.equal(result.state.resumes ?? 0, 0, "a revision is not counted as a resume");
  const decisions = JSON.parse(store.m.get("decisions.json"));
  assert.deepEqual(decisions.map((/** @type {any} */ d) => d.action).slice(0, 3), ["release-blocked", "revise", "release-blocked"]);
  assert.equal(decisions[1].gates.story, "revise");
  assert.equal(decisions[2].gates.story, "pass", "the second review finds the opening fixed");
  const review = JSON.parse(store.m.get("review.json"));
  assert.deepEqual(review.release.blockedBy.sort(), ["research", "visual"], "still blocked for what this test never connected: the source desk and footage");
});

test("a brain whose window cannot hold the whole film gets QA chapter by chapter, and the run says so", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "qa-split");
  assert.ok(made.ok);
  const base = scriptedModel();
  /** @type {string[]} */
  const qaStages = [];
  // Chapters long enough (a production note after the scenes) that both together overflow a 32k window but one fits.
  const note = "\n\nProduction note: " + "the mill stands by the river. ".repeat(1400);
  const model = {
    ...base,
    name: "qwen3:32b",
    capabilities: { vision: false, webSearch: true, contextTokens: 32768, maxOutputTokens: 8192 },
    price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    async call(/** @type {import("../src/film-run.mjs").ModelRequest} */ r) {
      if (r.stage.startsWith("qa:")) {
        qaStages.push(r.stage);
        const c = r.stage.slice(3);
        assert.ok(r.messages[0].content[0].text.includes(`<S5_${c}>`) && !r.messages[0].content[0].text.includes(`<S5_${c === "C1" ? "C2" : "C1"}>`), "each QA call reads one chapter");
        return { text: "```json\n" + JSON.stringify({ mustFix: c === "C1" ? [{ lens: "facts", scene: "SC0002", issue: "x", find: "NARR: Marker2 the", replace: "NARR: Marker2 a" }] : [], passed: ["p"], notChecked: [] }) + "\n```", stopReason: "end_turn", usage: {} };
      }
      const reply = await base.call(r);
      return /^s5:C[12]$/.test(r.stage) ? { ...reply, text: reply.text + note } : reply;
    },
  };
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "M", model, store });
  assert.deepEqual(qaStages, ["qa:C1", "qa:C2"]);
  assert.ok(!base.calls.includes("qa"), "the whole-film QA was not sent");
  assert.equal(state.qaMode, "per-chapter");
  const qa = JSON.parse(store.m.get("qa.json"));
  assert.equal(qa.mode, "per-chapter");
  assert.match(qa.notChecked[0], /did not compare chapters with each other/, "the lowered check is written down");
  assert.deepEqual(qa.mustFix.map((/** @type {any} */ f) => f.chapter), ["C1"], "a fix keeps the chapter it was found in");
  assert.match(store.m.get("s5-C1.md"), /NARR: Marker2 a /, "and is applied");
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
  assert.ok(spent >= 1 && spent < 15);
  const done = await runFilm({ film: made.film, manual: "M", model, store });
  assert.equal(done.status, "done");
  assert.equal(model.calls.length, 15, "nothing already paid for is asked again");
});

test("the media step writes media-C1.json per chapter, never repeats a clip, and resumes without searching again", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f3");
  assert.ok(made.ok);
  let searches = 0;
  let clip = 0;
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const pexels = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    searches += 1;
    // Ten distinct free clips in total: the twelve shots of a two-minute film cannot all get one.
    return Array.from({ length: 3 }, () => { const id = (clip++ % 10) + 1; return { id: `pexels:video:${id}`, source: "pexels", mediaType: "video", title: "mill", previewUrl: null, mediaUrl: `https://videos.pexels.com/${id}.mp4`, sourcePageUrl: `https://www.pexels.com/video/${id}/`, creator: "Ana", license: "Pexels License", licenseUrl: "https://www.pexels.com/license/", durationSeconds: 10, width: 1920, height: 1080, attributionRequired: false }; });
  } };
  const model = scriptedModel();
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "M", model, store, media: { providers: [pexels] } });
  const c1 = JSON.parse(store.m.get("media-C1.json"));
  const c2 = JSON.parse(store.m.get("media-C2.json"));
  assert.equal(c1.stats.shots + c2.stats.shots, 12);
  const ids = [...c1.shots, ...c2.shots].filter((/** @type {any} */ s) => s.pick).map((/** @type {any} */ s) => s.pick.id);
  assert.equal(new Set(ids).size, ids.length, "no clip twice within 10 minutes, across chapters too");
  assert.equal(c1.shots[0].pick.licence.licenseId, "PEXELS");
  assert.equal(c1.shots[0].query, "old mill");
  assert.equal(state.status, c1.stats.missing + c2.stats.missing ? "done-with-gaps" : "done");
  assert.ok(state.stages["media:C2"].status === "done");
  const before = searches;
  await runFilm({ film: made.film, manual: "M", model, store, media: { providers: [pexels] } });
  assert.equal(searches, before, "a finished media step is not searched again");

  const noKeys = memoryStore();
  const plain = await runFilm({ film: made.film, manual: "M", model: scriptedModel(), store: noKeys, media: { providers: [] } });
  assert.equal(plain.status, "done");
  assert.match(plain.media, /no PEXELS_API_KEY/);
  assert.ok(!noKeys.m.has("media-C1.json"));
});

test("the footage desk sees the thumbnails, its verdict picks the clip, and its cost is counted", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f4");
  assert.ok(made.ok);
  let n = 0;
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const pexels = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    return [0, 1].map(() => { n += 1; return { id: `pexels:video:${n}`, source: "pexels", mediaType: "video", title: "mill", previewUrl: `https://images.pexels.com/${n}.jpg?w=320`, mediaUrl: `https://v/${n}.mp4`, sourcePageUrl: `https://www.pexels.com/video/${n}/`, creator: null, license: "Pexels License", licenseUrl: null, durationSeconds: 10, width: 1920, height: 1080, attributionRequired: false }; });
  } };
  const base = scriptedModel();
  /** @type {any[]} */
  const judged = [];
  const model = { ...base, async call(/** @type {import("../src/film-run.mjs").ModelRequest} */ r) {
    if (!r.stage.startsWith("media-judge:")) return base.call(r);
    judged.push(r);
    const keys = r.messages[0].content.map((b) => /^SHOT (\S+):/.exec(b.text)?.[1]).filter(Boolean);
    return { text: "```json\n" + JSON.stringify(Object.fromEntries(keys.map((k) => [k, [1]]))) + "\n```", stopReason: "end_turn", usage: { input_tokens: 2000, output_tokens: 50 } };
  } };
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "M", model, store, media: { providers: [pexels] } });
  assert.equal(judged.length, 2, "one batched request per chapter of six shots");
  assert.ok(judged[0].messages[0].content.some((/** @type {any} */ b) => b.image === "https://images.pexels.com/2.jpg?w=320"));
  assert.equal(judged[0].effort, "low");
  const c1 = JSON.parse(store.m.get("media-C1.json"));
  assert.deepEqual(c1.shots.map((/** @type {any} */ s) => [s.pick.id, s.review]).slice(0, 2), [["pexels:video:2", "fit"], ["pexels:video:4", "fit"]], "the second candidate, as the desk said");
  assert.equal(state.usage["media-judge:C1"].calls, 1);
  assert.equal(state.status, "done");
});

test("a brain that cannot see is never asked to judge thumbnails, and a free brain is not charged", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f4b");
  assert.ok(made.ok);
  let n = 0;
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const pexels = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    return [0, 1].map(() => { n += 1; return { id: `pexels:video:${n}`, source: "pexels", mediaType: "video", title: "mill", previewUrl: `https://images.pexels.com/${n}.jpg?w=320`, mediaUrl: `https://v/${n}.mp4`, sourcePageUrl: `https://www.pexels.com/video/${n}/`, creator: null, license: "Pexels License", licenseUrl: null, durationSeconds: 10, width: 1920, height: 1080, attributionRequired: false }; });
  } };
  const base = scriptedModel();
  const model = {
    ...base,
    name: "qwen3:32b",
    capabilities: { vision: false },
    price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    async call(/** @type {import("../src/film-run.mjs").ModelRequest} */ r) {
      if (r.stage.startsWith("media-judge:")) throw new Error("a blind brain was asked to judge pictures");
      return base.call(r);
    },
  };
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "M", model, store, media: { providers: [pexels] } });
  const c1 = JSON.parse(store.m.get("media-C1.json"));
  assert.equal(c1.shots[0].pick.id, "pexels:video:1", "the first search result is kept");
  assert.equal(c1.shots[0].review, undefined, "no desk looked at it");
  assert.ok(state.gaps.some((/** @type {string} */ g) => /could not be checked by eye .*\(the brain cannot see pictures\)/.test(g)), "the owner is told why");
  assert.ok(!Object.keys(state.usage).some((k) => k.startsWith("media-judge")));
  assert.equal(state.costUsd, 0, "a brain on the owner's machine costs nothing, so the budget is not used up");
  const free = estimateRun(2700, "qwen3:32b", { price: model.price, capabilities: { vision: false, webSearch: false } });
  assert.deepEqual([free.usdLow, free.usdHigh, free.judgeCalls], [0, 0, 0], "no tokens, searches or footage desk to pay for");
  assert.ok(estimateRun(2700, "some-unpriced-model").usdHigh >= estimateRun(2700, "claude-opus-5-5").usdHigh, "an unknown model is estimated at the highest price, never as free");
});

test("a brain that cannot search researches through the code desk: it picks the searches, code opens the pages, facts cite only them", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f4c");
  assert.ok(made.ok);
  const base = scriptedModel();
  /** @type {import("../src/film-run.mjs").ModelRequest[]} */
  const desk = [];
  const model = {
    ...base,
    name: "qwen3:32b",
    capabilities: { vision: false, webSearch: false, contextTokens: 65536 },
    price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    async call(/** @type {import("../src/film-run.mjs").ModelRequest} */ r) {
      if (r.stage === "research-plan") { desk.push(r); return { text: "```json\n{\"queries\": [\"old mill history\", \"watermill\"]}\n```", stopReason: "end_turn", usage: {} }; }
      if (r.stage === "research") {
        desk.push(r);
        assert.equal(r.webSearch, undefined, "no search tool is offered to a brain that has none");
        const facts = Array.from({ length: 9 }, (_, i) => ({ id: `F0${i}`, claim: "c", value: "v", sources: [i % 2 ? "D1" : "D2"], confidence: "high", conflict: null }));
        facts.push({ id: "F99", claim: "from memory", value: "1850", sources: ["https://invented.example/mill"], confidence: "high", conflict: null });
        return { text: "```json\n" + JSON.stringify({ subject: "mill", facts, unknowns: [], doNotConfuse: [] }) + "\n```", stopReason: "end_turn", usage: {} };
      }
      return base.call(r);
    },
  };
  /** @type {import("../src/research-desk.mjs").ResearchProvider} */
  const wiki = {
    id: "wikipedia",
    async search(q) { return [{ title: q, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(q.replace(/ /g, "_"))}` }]; },
    async read(hit) { return { title: hit.title, text: `${hit.title} is a mill that ground grain for the town from 1790 until the river was diverted in 1921.`, references: [] }; },
  };
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "THE WHOLE MANUAL", model, store, research: { providers: [wiki], fetch: /** @type {any} */ (async () => new Response("", { status: 404 })) } });
  assert.equal(state.status, "done-with-gaps");
  assert.deepEqual(desk.map((r) => r.stage), ["research-plan", "research"]);
  assert.ok(desk.every((r) => r.system.length === 1 && !r.system[0].text.includes("THE WHOLE MANUAL")), "the desk sends the brief, not the manual, so the pages fit a small window");
  assert.ok(desk[1].messages[0].content.some((b) => b.text.includes("[D1] old mill history") && b.text.includes("URL: https://en.wikipedia.org/wiki/old_mill_history")));
  const research = JSON.parse(store.m.get("research.json"));
  assert.equal(research.facts.length, 9, "the fact cited from memory is dropped");
  assert.ok(research.facts.every((/** @type {any} */ f) => f.sources.every((/** @type {string} */ u) => u.startsWith("https://en.wikipedia.org/wiki/"))));
  assert.deepEqual(research.desk, { queries: ["old mill history", "watermill"], documents: 2, sites: 1, providers: ["wikipedia"] });
  assert.ok(state.gaps.some((/** @type {string} */ g) => /1 fact cited no page the research desk opened/.test(g)));
  const corpus = JSON.parse(store.m.get("research-corpus.json"));
  assert.equal(corpus.docs.length, 2, "what the brain read is kept for the owner to audit");

  const nodesk = await runFilm({ film: { ...made.film, id: "f4d" }, manual: "M", model, store: memoryStore() }).catch((error) => error);
  assert.match(String(nodesk), /cannot search the web, and this run has no research desk/);
});

test("the finished film is compared with the channel's earlier films and added to them", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f5");
  assert.ok(made.ok);
  /** @type {any[]} */
  let saved = [];
  const channel = { load: async () => saved, save: async (/** @type {any[]} */ list) => { saved = list; } };
  const first = await runFilm({ film: made.film, manual: "M", model: scriptedModel(), store: memoryStore(), channel });
  assert.equal(first.status, "done");
  assert.equal(saved.length, 1);
  const again = newFilm({ topic: "The old mill, again", minutes: 2 }, "f6");
  assert.ok(again.ok);
  const store = memoryStore();
  const second = await runFilm({ film: again.film, manual: "M", model: scriptedModel(), store, channel });
  const report = JSON.parse(store.m.get("originality.json"));
  assert.equal(report.verdict, "fail", "the same script twice on one channel is caught");
  assert.equal(second.status, "done-with-gaps");
  assert.ok(second.gaps.some((/** @type {string} */ g) => g.startsWith("originality (fail)")));
  assert.equal(saved.length, 2);
});

test("formats: a film can be a motivational life story, an invented story or chosen by its topic", async () => {
  const { filmBrief, isStoryFilm } = await import("../src/film-run.mjs");
  const story = newFilm({ topic: "A barber's son and a borrowed suit", minutes: 12, formatId: "dramatized-story" }, "s1");
  assert.ok(story.ok && story.film.formatId === "dramatized-story" && isStoryFilm(story.film));
  const auto = newFilm({ topic: "He never gave up after losing everything", minutes: 12, formatId: "auto" }, "s2");
  assert.ok(auto.ok && auto.film.formatId === "motivational-life-story" && !isStoryFilm(auto.film));
  assert.deepEqual(newFilm({ topic: "Anything at all", minutes: 12, formatId: "cat-videos" }, "s3"), { ok: false, error: 'Unknown format "cat-videos".' });
  const plain = newFilm({ topic: "The Suez Canal", minutes: 12 }, "s4");
  assert.ok(plain.ok && plain.film.formatId === null);
  assert.equal(story.film.allowAi, true, "invented stories use AI scenes with one cast by default");
  assert.equal(plain.film.allowAi, false);
  const noAi = newFilm({ topic: "A barber's son and a borrowed suit", minutes: 12, formatId: "dramatized-story", allowAi: false }, "s5");
  assert.ok(noAi.ok && noAi.film.allowAi === false, "the owner can turn them off");

  const sb = filmBrief(story.film);
  assert.match(sb, /FORMAT: Original dramatized story/);
  assert.match(sb, /1\. STORY MODE: the story is invented/);
  assert.match(sb, /Dramatized story\. Characters and events are created for this film\./);
  assert.match(sb, /STORY RULES:\nS1\. Never call an invented story true/);
  assert.match(sb, /Nothing is written on the video/);
  assert.match(sb, /3\. AI SCENES \(R9\) carry the story's people: one consistent cast/);
  assert.match(sb, /8\. Performance: every scene line adds DELIVERY:/);
  const db = filmBrief(plain.film);
  assert.doesNotMatch(db, /STORY MODE|STORY RULES|FORMAT:/);
  assert.match(db, /1\. Facts only from the research file/);
  assert.match(filmBrief(auto.film), /FORMAT: Motivational real-life story \(a true story told from sources\)/);
});

test("an invented story gets its description note in code, and a title that claims truth is flagged", async () => {
  const made = newFilm({ topic: "The old mill's last apprentice", minutes: 2, formatId: "dramatized-story" }, "f7");
  assert.ok(made.ok);
  const base = scriptedModel();
  /** @type {string[]} */
  const asked = [];
  const model = { ...base, async call(/** @type {import("../src/film-run.mjs").ModelRequest} */ r) {
    if (r.stage === "research" || r.stage === "s2" || r.stage === "s4") asked.push(r.messages[0].content.map((b) => b.text).join(" "));
    if (r.stage === "s7") {
      asked.push(r.messages[0].content.map((b) => b.text).join(" "));
      return { text: "**Final title (A): The True Story of the Old Mill**\n## S7", stopReason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } };
    }
    return base.call(r);
  } };
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "M", model, store });
  assert.match(asked[0], /This film is an invented story\. Research on the web the real-world details/);
  assert.match(asked[1], /Write S2 for an invented story: \(a\) the realism ledger/);
  const s4Prompt = asked.find((a) => /Write S4, the production bibles/.test(a)) ?? "";
  const s7Prompt = asked.find((a) => /Write S7, the publishing pack/.test(a)) ?? "";
  assert.match(s4Prompt, /CHR-01 LOOK: <age, build, skin tone, face, hair, clothes, era and place>/, "S4 writes one look line per invented character");
  assert.match(s7Prompt, /never say true, real or "based on a true story"/);
  assert.match(s7Prompt, /altered or synthetic content: Yes when the film has realistic AI scenes/);
  const s7 = store.m.get("s7.md");
  assert.ok(s7.trimEnd().endsWith("Dramatized story. Characters and events are created for this film."), "the note is added when the model forgot it");
  assert.ok(state.gaps.some((/** @type {string} */ g) => g.startsWith('S7: the title "The True Story of the Old Mill" claims')));
  assert.ok(state.gaps.some((/** @type {string} */ g) => / writing \(/.test(g)), "machine-sounding or flat writing is flagged in story mode");
});

test("a failed film resumes where it stopped: finished stages are not paid twice and the error is visible meanwhile", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "f-resume");
  assert.ok(made.ok);
  const store = memoryStore();
  const broken = scriptedModel();
  const failing = { ...broken, call: async (/** @type {any} */ r) => { if (r.stage === "s2") throw Object.assign(new Error("401 invalid x-api-key"), { status: 401 }); return broken.call(r); } };
  await assert.rejects(runFilm({ film: made.film, manual: "MANUAL", model: failing, store }), /401/);
  const failed = JSON.parse(store.m.get("run.json"));
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /401/);
  assert.equal(failed.lastError.stage, "s2", "the studio shows which stage failed and why");
  const model = scriptedModel();
  const state = await runFilm({ film: made.film, manual: "MANUAL", model, store });
  assert.equal(state.status, "done");
  assert.equal(state.resumes, 1);
  assert.equal(state.lastError, undefined);
  assert.equal(state.error, undefined);
  assert.ok(!model.calls.includes("s01") && !model.calls.includes("research"), "S0-S1 and research were already paid for");
  assert.equal(model.calls[0], "s2");
});

test("the final title is checked in code: length, all-caps, and words that would defame a named subject", async () => {
  const { titleProblems, PACKAGING_RULES } = await import("../src/film-run.mjs");
  assert.deepEqual(titleProblems("He Bought a Rolls-Royce With $50"), []);
  assert.match(titleProblems("")[0], /no line/);
  assert.ok(titleProblems("x ".repeat(40).trim()).some((p) => /characters/.test(p)));
  assert.ok(titleProblems("The SHOCKING TRUTH About Money").some((p) => /all-caps/.test(p)));
  assert.ok(titleProblems("Is Acme Corp a Scam?").some((p) => /court or regulator/.test(p)), "a question mark is no defence");
  assert.match(PACKAGING_RULES, /Test & Compare/);
});

test("archive pictures are credited in the description from their licence records", async () => {
  const { pictureCredits } = await import("../src/film-run.mjs");
  const credits = pictureCredits([{ shots: [
    { pick: { id: "wikimedia:14", source: "wikimedia", title: "Saturn V on the pad", creator: "Ann Lee", sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Saturn_V_on_the_pad.jpg", licence: { licenseId: "CC-BY", licenseUrl: "https://creativecommons.org/licenses/by/2.0", creator: "Ann Lee" } } },
    { pick: { id: "nasa:as11", source: "nasa", title: "Buzz Aldrin on the Moon", creator: "NASA JSC", sourcePageUrl: "https://images.nasa.gov/details/as11", licence: { licenseId: "US-GOV-PD" } } },
    { pick: { id: "pexels:video:5", source: "pexels", title: "beach", sourcePageUrl: "https://www.pexels.com/video/5/", licence: { licenseId: "PEXELS" } } },
    { pick: { id: "wikimedia:14", source: "wikimedia", title: "Saturn V on the pad", sourcePageUrl: "https://commons.wikimedia.org/wiki/File:Saturn_V_on_the_pad.jpg", licence: { licenseId: "CC-BY" } } },
  ] }]).split("\n");
  assert.deepEqual(credits, [
    "\"Saturn V on the pad\" by Ann Lee, CC BY (https://creativecommons.org/licenses/by/2.0), via Wikimedia Commons: https://commons.wikimedia.org/wiki/File:Saturn_V_on_the_pad.jpg",
    "\"Buzz Aldrin on the Moon\" by NASA JSC, courtesy of NASA, via NASA: https://images.nasa.gov/details/as11",
  ], "one line per archive item, stock needs none");
});

test("saving mode is the owner's choice per film and halves the token part of the estimate", () => {
  const plain = newFilm({ topic: "The old mill", minutes: 45 }, "a");
  const cheap = newFilm({ topic: "The old mill", minutes: 45, saving: true }, "b");
  assert.ok(plain.ok && cheap.ok);
  assert.equal(plain.film.saving, false, "off unless asked for");
  assert.equal(cheap.film.saving, true);
  const e = estimateRun(45 * 60);
  assert.ok(e.savingUsdLow < e.usdLow * 0.6 && e.savingUsdLow > e.usdLow * 0.45, `${e.savingUsdLow} vs ${e.usdLow}`);
  assert.ok(e.savingUsdHigh < e.usdHigh);
});

test("the source desk runs after research: a cited page that is gone strikes its fact, and S2 is told how to treat the marks", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "src");
  assert.ok(made.ok);
  const model = scriptedModel();
  const store = memoryStore();
  /** @type {string[]} */
  const opened = [];
  const fetch = /** @type {any} */ (async (/** @type {string} */ url) => { opened.push(url); return url.endsWith("/0") ? new Response("gone", { status: 404 }) : new Response("<p>the mill</p>", { headers: { "content-type": "text/html" } }); });
  const state = await runFilm({ film: made.film, manual: "M", model, store, sources: { fetch } });
  assert.equal(opened.length, 9, "every cited page is opened once");
  const research = JSON.parse(store.m.get("research.json"));
  assert.equal(research.facts.length, 8, "the fact whose page is gone is dropped");
  assert.ok(research.facts.every((/** @type {any} */ f) => f.check.status === "opened"));
  assert.equal(JSON.parse(store.m.get("sources-check.json")).summary.facts.dropped, 1);
  assert.ok(state.gaps.some((/** @type {string} */ g) => g.includes("dropped")) && state.gaps.some((/** @type {string} */ g) => g.includes("rest on 1 site")));
  assert.equal(state.stages.sources.status, "done");
  assert.ok(model.calls.indexOf("s2") > model.calls.indexOf("research"));
});

test("the market desk: proven videos on the topic reach S1 and S7, and a title too close to one of them is a gap", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "mkt");
  assert.ok(made.ok);
  const base = scriptedModel();
  /** @type {Record<string, string>} */
  const prompts = {};
  const model = { ...base, call: async (/** @type {any} */ r) => { prompts[r.stage] = r.messages[0].content.map((/** @type {any} */ b) => b.text).join("\n"); return base.call(r); } };
  const store = memoryStore();
  const picks = [{ title: "The Old Mill at Dawn: What Happened", channelTitle: "Other", views: 2400000, outlier: 31.5, durationSeconds: 1500 }, { title: "Inside a 300-year-old mill", channelTitle: "B", views: 900000, outlier: 8, durationSeconds: 900 }];
  const state = await runFilm({ film: made.film, manual: "M", model, store, market: { find: async () => picks } });
  assert.match(prompts.s01, /PROVEN_DEMAND[\s\S]*"The Old Mill at Dawn: What Happened" \(Other\): 2,400,000 views, 31.5x/);
  assert.match(prompts.s01, /never reuse their wording/);
  assert.match(prompts.s7, /PROVEN_DEMAND/);
  assert.ok(state.gaps.some((/** @type {string} */ g) => g.includes("too close to an existing video")), "'The Old Mill at Dawn' copies a proven title");
  const { titleTooClose } = await import("../src/film-run.mjs");
  assert.equal(titleTooClose("The Barber Who Owns 400 Cars", "How a Barber Bought a Rolls-Royce"), false);
  const failing = await runFilm({ film: { ...made.film, id: "mkt2" }, manual: "M", model: scriptedModel(), store: memoryStore(), market: { find: async () => { throw new Error("quota"); } } });
  assert.equal(failing.status, "done", "a market search that fails never stops the film");
  assert.match(String(failing.market), /quota/);
});

test("the viewer panel's fix that breaks the word budget is not applied, and a low stay score is a gap", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "vw");
  assert.ok(made.ok);
  const base = scriptedModel();
  const model = { ...base, call: async (/** @type {any} */ r) => (r.stage === "viewer"
    ? { text: "```json\n" + JSON.stringify({ stayScore: 3, why: "nothing happens for a minute", leaves: [], kept: [], fixes: [{ scene: "SC0002", find: "NARR: Marker2 a river runs past the old mill while the town wakes slowly", replace: "NARR: Marker2.", why: "shorter" }] }) + "\n```", stopReason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } }
    : base.call(r)) };
  const store = memoryStore();
  const state = await runFilm({ film: made.film, manual: "M", model, store });
  const viewer = JSON.parse(store.m.get("viewer.json"));
  assert.equal(viewer.applied, 0);
  assert.match(String(viewer.reverted ?? ""), /broke a code check/);
  assert.ok(state.gaps.some((/** @type {string} */ g) => g.startsWith("viewer panel: the opening scored 3/10")));
});

test("the channel's lessons reach S3, every S5 chapter and the Edit Director", async () => {
  const made = newFilm({ topic: "The old mill", minutes: 2 }, "les");
  assert.ok(made.ok);
  const base = scriptedModel();
  /** @type {Record<string, string>} */
  const prompts = {};
  const model = { ...base, call: async (/** @type {any} */ r) => { prompts[r.stage] = r.messages[0].content.map((/** @type {any} */ b) => b.text).join("\n"); return base.call(r); } };
  await runFilm({ film: made.film, manual: "M", model, store: memoryStore(), lessons: { load: async () => "LEFT at 1:00 (4%/min): said \"the law of 1972\"" } });
  for (const st of ["s3", "s5:C1", "s5:C2", "edit:C1"]) assert.match(prompts[st], /CHANNEL_LESSONS[\s\S]*the law of 1972/, st);
  assert.ok(!/CHANNEL_LESSONS/.test(prompts.s01), "only where the film is shaped and cut");
});
