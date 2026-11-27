import test from "node:test";
import assert from "node:assert/strict";
import { locProvider } from "../src/film-media.mjs";
import { locGate } from "../src/archive-guard.mjs";

test("the film runner's LoC provider shares one gated queue: 429 is retried once the gate waits, same query not re-asked", async () => {
  // Use a gate with no real waiting for this test.
  const real = locGate;
  let calls = 0;
  const fetch = async (/** @type {any} */ url) => {
    calls += 1;
    if (calls === 1) return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
    return new Response(JSON.stringify({ results: [] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  assert.ok(real);
  const p = locProvider({ fetch });
  const t0 = Date.now();
  const first = await p.search("tacoma narrows bridge", "image", AbortSignal.timeout(20000));
  assert.deepEqual(first, []);
  assert.equal(calls, 2, "one 429, then the retry that worked");
  await p.search("tacoma narrows bridge", "image", AbortSignal.timeout(20000));
  assert.equal(calls, 2, "the same query is answered from memory");
  assert.ok(Date.now() - t0 < 15000);
});
