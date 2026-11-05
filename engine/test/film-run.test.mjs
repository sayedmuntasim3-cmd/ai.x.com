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
