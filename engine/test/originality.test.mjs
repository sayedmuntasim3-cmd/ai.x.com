import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkOriginality, fingerprintFilm, titleSkeleton } from "../src/originality.mjs";

const USA = new URL("../../productions/ramesh-babu/USA/", import.meta.url);
const plan = JSON.parse(readFileSync(new URL("s3-chapters.json", USA), "utf8"));
const chapters = plan.map((/** @type {any} */ c) => readFileSync(new URL(`s5-${c.id}.md`, USA), "utf8"));
const usa = fingerprintFilm({ id: "usa", topic: "Ramesh Babu", title: "Why a Rolls-Royce Owner Still Cuts Hair", chapters });
const line = (/** @type {string} */ narr) => `**SC0001** | 0:00:00-0:00:30 | C1 | HOOK B1 | E | C01 | NARR: ${narr} | W 1/1 | ANCHOR: x | SHOTS: (1) R3 x | LOOK: L`;

test("a name-swapped copy of a film is a fail; an unrelated film passes", () => {
  const swapped = fingerprintFilm({ id: "copy", topic: "Arjun Rao", title: "Why a Ferrari Owner Still Waits Tables", chapters: chapters.map((t) => t.replace(/Ramesh Babu/g, "Arjun Rao").replace(/Rolls-Royce/g, "Ferrari").replace(/Bengaluru/g, "Mumbai")) });
  const copy = checkOriginality(swapped, [usa]);
  assert.equal(copy.verdict, "fail");
  assert.ok(copy.closest[0].narration > 0.8 && copy.closest[0].hook > 0.5 && copy.closest[0].sharedHookPhrases.length > 0);
  const suez = fingerprintFilm({ id: "suez", topic: "Suez", chapters: [line("The Suez Canal opened in eighteen sixty nine and changed how ships crossed between Europe and Asia.")] });
  assert.deepEqual(checkOriginality(suez, [usa]).verdict, "pass");
  assert.equal(checkOriginality(usa, [usa]).compared, 0, "a film is never compared with itself");
  assert.ok(JSON.stringify(usa).length < 20000, "a fingerprint stays small, with no full script");
});

test("a reused opening is flagged even when the rest is new; repeated title patterns ask for review", () => {
  const hook = "Bengaluru India twenty eleven by most accounts a Rolls Royce Ghost joins a rental fleet its buyer cuts hair";
  const reused = fingerprintFilm({ id: "h", topic: "Other", chapters: [line(hook.replace("Bengaluru India", "Lagos Nigeria") + " and then a completely different story follows about markets and trade")] });
  const r = checkOriginality(reused, [usa]);
  assert.notEqual(r.verdict, "pass");
  assert.ok(r.reasons.some((x) => x.includes("opening")));
  assert.equal(titleSkeleton("From Barber to Rolls-Royce"), titleSkeleton("From Waiter to Ferrari"));
  assert.notEqual(titleSkeleton("How Dubai Built an Empire"), titleSkeleton("Why the Suez Canal Still Matters"));
  const t = (/** @type {string} */ id, /** @type {string} */ title) => fingerprintFilm({ id, topic: id, title, chapters: [line(`unique words for ${id} only here ${id} ${id} story telling now`)] });
  const earlier = [t("a", "From Barber to Rolls-Royce"), t("b", "From Maid to Millionaire"), t("c", "From Driver to Billionaire")];
  const title = checkOriginality(t("d", "From Waiter to Ferrari"), earlier);
  assert.equal(title.verdict, "review");
  assert.ok(title.reasons.some((x) => x.includes("same pattern")));
});
