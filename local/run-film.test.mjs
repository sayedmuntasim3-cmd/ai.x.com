import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { callLedger, folderStore, GEMINI_MAX_CALLS, guardedFetch, main, slug } from "./run-film.mjs";

test("the local runner keeps a film in a folder, says what the brain can do, and resumes from the folder", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-local-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const out = join(dir, "films", "mill");
  /** @type {string[]} */
  const stages = [];
  /** @type {string[]} */
  const lines = [];
  const brain = {
    name: "qwen3:32b",
    capabilities: { vision: false, webSearch: false, contextTokens: 65536 },
    price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    async call(/** @type {any} */ r) { stages.push(r.stage); throw Object.assign(new Error("the machine is off"), { permanent: "the machine is off" }); },
  };
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", out], {}, { model: brain, log: (l) => lines.push(l) }), /the machine is off/);
  assert.deepEqual(stages, ["s01"], "the run started with the first stage");
  const film = JSON.parse(readFileSync(join(out, "film.json"), "utf8"));
  assert.deepEqual([film.topic, film.durationSeconds, film.id], ["The old mill", 120, "the-old-mill"]);
  assert.match(lines.join("\n"), /Brain: test qwen3:32b, window 65536 tokens, cannot see pictures, research through the code desk\./);
  assert.match(lines.join("\n"), /Cost: none \(1 chapter on your own machine\)\./);
  const run = JSON.parse(readFileSync(join(out, "run.json"), "utf8"));
  assert.equal(run.status, "failed");
  assert.match(run.error, /the machine is off/, "the reason is kept in the folder");

  lines.length = 0;
  await assert.rejects(main(["--out", out], {}, { model: brain, log: (l) => lines.push(l) }));
  assert.match(lines[0], /^Resuming "The old mill"/, "the folder alone resumes the film");
  assert.equal(JSON.parse(readFileSync(join(out, "run.json"), "utf8")).resumes, 1);
});

test("Bossism refuses a film the brain cannot hold before any model call, in the owner's language", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-preflight-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const small = { name: "llama3.2:3b", capabilities: { vision: false, webSearch: false, contextTokens: 8192, maxOutputTokens: 4096 }, price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, async call() { calls += 1; throw new Error("must not be called"); } };
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "45", "--out", join(dir, "f"), "--lang", "bn"], {}, { model: small, log: () => {} }), /ব্রেইনের উইন্ডো \(8192 টোকেন\) 45 মিনিটের ফিল্মের/);
  assert.equal(calls, 0, "nothing was spent");
  const plan = JSON.parse(readFileSync(join(dir, "f", "preflight.json"), "utf8"));
  assert.deepEqual(plan.blockers.map((/** @type {any} */ b) => b.code), ["plan.windowSmall"], "the refusal is kept with the film");
  await assert.rejects(main(["--out", join(dir, "f"), "--approve", "fine"], {}, { model: small, log: () => {} }), /no review to approve/);
});

test("without a brain or a topic the runner says what to do", async () => {
  await assert.rejects(main(["--topic", "x y z"], {}), /No brain is connected.*BRAIN_URL/);
  await assert.rejects(main([], { BRAIN_URL: "http://localhost:11434", BRAIN_MODEL: "m" }, { log: () => {} }), /Give a topic/);
});

test("the folder store keeps nested keys and refuses paths outside the film", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-store-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = folderStore(dir);
  await store.put("batches/abc.json", "{}");
  assert.equal(await store.get("batches/abc.json"), "{}");
  assert.equal(await store.get("missing.md"), null);
  await assert.rejects(store.put("../escape.txt", "x"), /Bad file key/);
  await assert.rejects(store.get("/etc/passwd"), /Bad file key/);
  assert.ok(!existsSync(join(dir, "..", "escape.txt")));
  assert.equal(slug("The Rise & Fall of Lamborghini!"), "the-rise-fall-of-lamborghini");
  assert.equal(slug("كتاب"), "كتاب", "letters of any script are kept");
  assert.equal(slug("!!!"), "film");
});

test("the local runner opens a page only when its host resolves to public addresses", async () => {
  /** @type {string[]} */
  const opened = [];
  const get = async (/** @type {string} */ url) => { opened.push(url); return new Response("ok"); };
  const dns = /** @type {Record<string, string[]>} */ ({ "public.example": ["93.184.216.34"], "rebind.example": ["93.184.216.34", "10.0.0.5"], "nas.example": ["192.168.1.20"], "none.example": [] });
  const lookup = async (/** @type {string} */ host) => (dns[host] ?? []).map((address) => ({ address }));
  const guarded = guardedFetch(get, lookup);
  assert.equal((await guarded("https://public.example/a")).status, 200);
  await assert.rejects(guarded("https://nas.example/"), /resolves to 192\.168\.1\.20/);
  await assert.rejects(guarded("https://rebind.example/"), /resolves to 10\.0\.0\.5/, "one private answer is enough to refuse");
  await assert.rejects(guarded("https://none.example/"), /resolves to nothing/);
  await assert.rejects(guarded("http://127.0.0.1/"), /non-public address/);
  assert.equal((await guarded("http://8.8.8.8/")).status, 200, "a public IP needs no lookup");
  assert.deepEqual(opened, ["https://public.example/a", "http://8.8.8.8/"]);
});

test("a paid brain never runs without a hard cap, and a STOP file stops the run before its next call", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-cost-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const paid = { name: "claude-opus-5-5", call: async () => { calls += 1; throw new Error("no call should be made"); } };
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", join(dir, "a")], {}, { model: paid, log: () => {} }), /costs money .* --budget <USD>; nothing is spent without one/);
  assert.equal(calls, 0);
  const out = join(dir, "b");
  const free = { name: "local-test", price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, call: paid.call };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "STOP"), "");
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", out], {}, { model: free, log: () => {} }), /emergency stop before s01: a STOP file/);
  assert.equal(calls, 0, "stopped before the first call");
  await assert.rejects(main(["--out", out], { ZUPONA_STOP: "1" }, { model: free, log: () => {} }), /ZUPONA_STOP=1/);
  assert.equal(calls, 0);
});

test("the request cap stops a run before the call that would pass it, counts across resumes, and every call is logged as evidence", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-cap-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let calls = 0;
  const free = { name: "local-test", price: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, call: async () => { calls += 1; return { text: "ANGLE: x", stopReason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } }; } };
  const out = join(dir, "a");
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", out, "--max-calls", "1"], {}, { model: free, log: () => {} }), /request cap of 1 is reached/);
  assert.equal(calls, 1);
  const log = readFileSync(join(out, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(log.length, 1);
  assert.equal(log[0].stage, "s01");
  assert.equal(log[0].requests, 1);
  assert.equal(log[0].manualIncluded, true, "the log says the production manual was sent");
  assert.match(log[0].sentSha256, /^[0-9a-f]{64}$/);
  assert.match(log[0].replySha256, /^[0-9a-f]{64}$/);
  // Resuming with the same cap makes no call: the count is kept in the folder.
  await assert.rejects(main(["--out", out, "--max-calls", "1"], {}, { model: free, log: () => {} }), /request cap of 1 is reached/);
  assert.equal(calls, 1);
  await assert.rejects(main(["--out", out, "--max-calls", "0"], {}, { model: free, log: () => {} }), /--max-calls must be a whole number above 0/);
});

test("Gemini is capped at 40 requests by default, retries count, and Google's response id and model version are logged", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-gem-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  /** @type {string[]} */
  const hosts = [];
  const brainFetch = /** @type {typeof fetch} */ (async (input) => {
    hosts.push(new URL(String(input)).hostname);
    return Response.json({ responseId: "r-1", modelVersion: "gemini-test-001", candidates: [{ content: { parts: [{ text: "ANGLE: x" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } });
  });
  /** @type {string[]} */
  const lines = [];
  const out = join(dir, "g");
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", out, "--max-calls", "1"], { BRAIN: "gemini", GEMINI_API_KEY: "dummy", GEMINI_SEARCH: "off" }, { brainFetch, log: (l) => lines.push(l) }), /request cap of 1/);
  assert.deepEqual(hosts, ["generativelanguage.googleapis.com"]);
  assert.ok(lines.some((l) => /research through the code desk/.test(l)), "arm B: no Google Search");
  const entry = JSON.parse(readFileSync(join(out, "calls.jsonl"), "utf8").trim());
  assert.equal(entry.responseId, "r-1");
  assert.equal(entry.modelVersion, "gemini-test-001");
  assert.equal(entry.webSearch, false);
  assert.deepEqual(entry.usage, { input_tokens: 7, output_tokens: 3 });

  const lines2 = /** @type {string[]} */ ([]);
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", join(dir, "h"), "--max-calls", "1"], { BRAIN: "gemini", GEMINI_API_KEY: "dummy" }, { brainFetch, log: (l) => lines2.push(l) }), /request cap/);
  assert.equal(GEMINI_MAX_CALLS, 40);
  const lines3 = /** @type {string[]} */ ([]);
  mkdirSync(join(dir, "i"), { recursive: true });
  writeFileSync(join(dir, "i", "STOP"), "");
  await assert.rejects(main(["--topic", "The old mill", "--minutes", "2", "--out", join(dir, "i")], { BRAIN: "gemini", GEMINI_API_KEY: "dummy" }, { brainFetch, log: (l) => lines3.push(l) }), /STOP file/);
  assert.ok(lines3.some((l) => /Request cap: 40 requests/.test(l)), "40 without --max-calls");

  // Every HTTP request counts, so the brain's own retries cannot pass the cap.
  const store = folderStore(join(dir, "j"));
  const ledger = await callLedger(store, 2);
  const f = ledger.fetch(/** @type {typeof fetch} */ (async () => new Response("busy", { status: 503 })));
  await f("https://generativelanguage.googleapis.com/a");
  await f("https://generativelanguage.googleapis.com/a");
  await assert.rejects(f("https://generativelanguage.googleapis.com/a"), /request cap of 2 is reached/);
  assert.equal(ledger.requests, 2);
  assert.match(String(ledger.halt()), /request cap of 2/);
});
