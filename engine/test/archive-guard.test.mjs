import test from "node:test";
import assert from "node:assert/strict";
import { createGate, isRelevant, mainTerms } from "../src/archive-guard.mjs";

const clock = () => { let t = 0; const sleeps = []; return { sleeps, now: () => t, sleep: async (ms) => { sleeps.push(ms); t += ms; } }; };

test("the gate spaces requests, one at a time", async () => {
  const c = clock();
  const gate = createGate({ spacingMs: 3000, ...c });
  const starts = [];
  await Promise.all(["a", "b", "c"].map((k) => gate.run(k, async () => { starts.push(c.now()); return k; })));
  assert.deepEqual(starts, [0, 3000, 6000]);
});

test("429 backs off (Retry-After honoured), tries 3 times, then gives up", async () => {
  const c = clock();
  const gate = createGate({ spacingMs: 1000, ...c });
  let calls = 0;
  const out = await gate.run("q", async () => { calls += 1; if (calls < 3) throw Object.assign(new Error("x"), { status: 429, retryAfterMs: 5000 }); return "ok"; });
  assert.equal(out, "ok");
  assert.equal(calls, 3);
  assert.ok(c.sleeps.includes(5000));
  let n = 0;
  await assert.rejects(gate.run("z", async () => { n += 1; throw Object.assign(new Error("x"), { status: "rate_limited" }); }));
  assert.equal(n, 3);
  await assert.rejects(gate.run("e", async () => { throw Object.assign(new Error("x"), { status: 404 }); }));
});

test("the same query is answered from memory; failures are not remembered", async () => {
  const gate = createGate({ spacingMs: 0, ...clock() });
  let calls = 0;
  await gate.run("k", async () => { calls += 1; return 1; });
  await gate.run("k", async () => { calls += 1; return 2; });
  assert.equal(calls, 1);
  await assert.rejects(gate.run("bad", async () => { throw new Error("boom"); }));
  assert.equal(await gate.run("bad", async () => "fine"), "fine");
});

test("relevance: a main query term must be in the text", () => {
  assert.deepEqual(mainTerms("The Hoover Dam"), ["hoover", "dam"]);
  assert.equal(isRelevant("Hoover Dam", "Saturn Apollo Program", "A NASA technician at KSC"), false);
  assert.equal(isRelevant("Hoover Dam", "Aerial of Hoover Dam, Nevada"), true);
  assert.equal(isRelevant("levees", "A levee breach"), true);
  assert.equal(isRelevant("a", "anything"), true);
});
