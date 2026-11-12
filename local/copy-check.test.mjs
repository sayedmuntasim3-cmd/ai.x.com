import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { copyCheck, sharedRuns, words } from "./copy-check.mjs";

const SOURCE = "At 17:06 local time the KLM aircraft began its takeoff roll in thick fog while the Pan Am aircraft was still taxiing on the same runway toward the exit.";

test("a sentence copied from a source is found with its length, quote and page; short shared phrases are not", () => {
  const narration = "Fog rolled in. The KLM aircraft began its takeoff roll in thick fog while the Pan Am aircraft was still taxiing on the same runway. Nobody saw it.";
  const runs = sharedRuns(narration, [{ url: "https://example.org/report", text: SOURCE }]);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].words, 22);
  assert.equal(runs[0].url, "https://example.org/report");
  assert.match(runs[0].quote, /^the klm aircraft began its takeoff roll/);
  // 11 shared words in a row: below the default 12, not flagged.
  assert.equal(sharedRuns("the klm aircraft began its takeoff roll in thick fog while, then silence", [{ url: "u", text: SOURCE }]).length, 0);
  assert.equal(sharedRuns("the klm aircraft began its takeoff roll in thick fog while, then", [{ url: "u", text: SOURCE }], 8).length, 1);
});

test("punctuation, case and curly apostrophes do not hide a copy", () => {
  assert.deepEqual(words("Pan Am’s CREW—“no!”"), ["pan", "am's", "crew", "no"]);
  const copied = "Pan Am’s crew: still taxiing, on the same runway toward the exit, as the KLM aircraft began its takeoff roll in thick fog.";
  assert.ok(sharedRuns(copied, [{ url: "u", text: "pan am's crew still taxiing on the same runway toward the exit as the klm aircraft began" }])[0].words >= 12);
});

test("copyCheck reads the finished chapters (not drafts) and the research corpus; with no fetch it opens nothing", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-copy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const line = (/** @type {number} */ n, /** @type {string} */ narr) => `SC${String(n).padStart(4, "0")} | 0:00:00-0:00:10 | NARR: ${narr}`;
  writeFileSync(join(dir, "s5-C1.md"), line(1, "The KLM aircraft began its takeoff roll in thick fog while the Pan Am aircraft was still taxiing on the same runway."));
  writeFileSync(join(dir, "s5-C1.draft.md"), line(1, "A draft line that must not be read at all, copied or not, because it is a draft."));
  writeFileSync(join(dir, "research-corpus.json"), JSON.stringify({ docs: [{ id: "D1", url: "https://www.loc.gov/item/1/?fo=json", text: SOURCE }] }));
  writeFileSync(join(dir, "research.json"), JSON.stringify({ facts: [{ sources: ["https://www.loc.gov/item/1/?fo=json", "https://example.org/never-opened"] }] }));
  const r = await copyCheck(dir, { fetch: null });
  assert.equal(r.sources, 1);
  assert.equal(r.pagesOpened, 0);
  assert.equal(r.flagged, 1);
  assert.equal(r.longest, 22);
});
