import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { remakeScene } from "../src/scene-remake.mjs";

const USA = new URL("../../productions/ramesh-babu/USA/", import.meta.url);
function usaStore(status = "done") {
  const m = new Map(readdirSync(USA).map((f) => [f, readFileSync(new URL(f, USA), "utf8")]));
  m.set("run.json", JSON.stringify({ film: { id: "f", topic: "Ramesh Babu", durationSeconds: 2700, versionId: "en-US" }, status, costUsd: 7, usage: {}, gaps: [], stages: {} }));
  return { m, get: async (/** @type {string} */ k) => m.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } };
}
const sc3 = (/** @type {Map<string, string>} */ m) => /** @type {string} */ (m.get("s5-C1.md")?.split("\n").find((l) => l.startsWith("**SC0003**")));
/** @param {(r: any) => string} answer */
function model(answer) {
  /** @type {any[]} */
  const calls = [];
  return { calls, name: "claude-opus-5-5", async call(/** @type {any} */ r) { calls.push(r); return { text: answer(r), stopReason: "end_turn", usage: { input_tokens: 3000, output_tokens: 400, cache_read_input_tokens: 30000 } }; } };
}

test("one scene is rewritten, checked in code and saved; the rest of the film is untouched", async () => {
  const store = usaStore();
  const before = store.m.get("s5-C1.md") ?? "";
  const old = sc3(store.m);
  const m = model((r) => {
    assert.match(r.messages[0].content[1].text, /The owner asks: "Make the tax line sharper\."/);
    assert.ok(r.messages[0].content[1].text.includes(old), "the model sees the scene as it is now");
    return "```text\n" + old.replace("only the first bill", "only the opening bill") + "\n```";
  });
  const r = await remakeScene({ store, model: m, manual: "MANUAL", scene: "sc0003", instruction: "Make the tax line sharper." });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(r.chapter, "C1");
  assert.ok(sc3(store.m).includes("only the opening bill"));
  const after = store.m.get("s5-C1.md") ?? "";
  assert.equal(after.split("\n").filter((l, i) => l !== before.split("\n")[i]).length, 1, "exactly one line changed");
  const run = JSON.parse(store.m.get("run.json") ?? "{}");
  assert.equal(run.usage["remake:SC0003"].calls, 1);
  assert.ok(run.costUsd > 7 && r.costUsd > 0);
  assert.equal(JSON.parse(store.m.get("remakes.json") ?? "[]")[0].before, old);
});

test("a re-make that breaks the clock is repaired once, then refused, and the scene stays as it was", async () => {
  const store = usaStore();
  const old = sc3(store.m);
  const m = model(() => "```text\n" + old.replace("| 0:00:15-0:00:22 |", "| 0:00:15-0:00:25 |") + "\n```");
  const r = await remakeScene({ store, model: m, manual: "M", scene: "SC0003", instruction: "Longer please." });
  assert.equal(r.ok, false);
  assert.equal(m.calls.length, 2, "one repair attempt, with the failures shown");
  assert.match(m.calls[1].messages[0].content[1].text, /failed these checks/);
  assert.equal(sc3(store.m), old);
  assert.ok(JSON.parse(store.m.get("run.json") ?? "{}").costUsd > 7, "the attempt's cost is still counted");
});

test("unknown scenes and running films are refused before any model call", async () => {
  const m = model(() => "");
  for (const [scene, status, msg] of [["SC9999", "done", /not in this film/], ["SC0003", "running", /still being made/], ["12", "done", /scene ID/]]) {
    const r = await remakeScene({ store: usaStore(status), model: m, manual: "M", scene, instruction: "anything" });
    assert.equal(r.ok, false);
    assert.match(r.ok ? "" : r.error, msg);
  }
  assert.equal(m.calls.length, 0);
});

test("the re-made scene gets fresh footage that does not repeat any other pick within 10 minutes", async () => {
  const store = usaStore();
  const old = sc3(store.m);
  const row = (/** @type {string} */ scene, /** @type {number} */ shot, /** @type {string} */ id, /** @type {number} */ start) => ({ scene, shot, start, end: start + 2, rung: "R3", description: "", queries: ["q"], status: "found", query: "q", alternates: [], trace: [], pick: { id, source: "pexels", mediaUrl: "https://v/" + id, previewUrl: null, sourcePageUrl: "https://p/" + id, creator: null, durationSeconds: 5, width: 1920, height: 1080, licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: "" } } });
  store.m.set("media-C1.json", JSON.stringify({ chapter: "C1", providers: ["pexels"], repeatWindowSeconds: 600, stats: { shots: 2, found: 2, missing: 0, noQuery: 0 }, shots: [row("SC0002", 1, "pexels:video:A", 8), row("SC0003", 1, "pexels:video:OLD", 15)] }));
  /** @type {import("../src/film-media.mjs").MediaProvider} */
  const pexels = { id: "pexels", layer: 2, kinds: ["video"], cacheTtlSeconds: 0, rate: { capacity: 100, windowSeconds: 60 }, async search() {
    return ["A", "B"].map((n) => ({ id: `pexels:video:${n}`, source: "pexels", mediaType: "video", title: n, previewUrl: null, mediaUrl: `https://v/${n}`, sourcePageUrl: `https://p/${n}`, creator: null, license: "Pexels License", licenseUrl: null, durationSeconds: 5, width: 1920, height: 1080, attributionRequired: false }));
  } };
  const r = await remakeScene({ store, model: model(() => "```text\n" + old + "\n```"), manual: "M", scene: "SC0003", instruction: "Same words, new footage.", providers: [pexels], review: false });
  assert.ok(r.ok && r.media && r.media.found >= 1, JSON.stringify(r));
  const media = JSON.parse(store.m.get("media-C1.json") ?? "{}");
  assert.equal(media.shots.find((/** @type {any} */ s) => s.scene === "SC0002").pick.id, "pexels:video:A", "other scenes keep their clips");
  const mine = media.shots.filter((/** @type {any} */ s) => s.scene === "SC0003");
  assert.ok(mine.length >= 1 && mine.every((/** @type {any} */ s) => s.pick?.id !== "pexels:video:A" && s.pick?.id !== "pexels:video:OLD"));
  assert.equal(media.stats.shots, media.shots.length);
});
