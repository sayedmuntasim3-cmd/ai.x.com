import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { folderStore, main, slug } from "./run-film.mjs";

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
