import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deliver } from "./voice-runner.mjs";

const ID = "11111111-2222-3333-4444-555555555555";

/** A Worker that answers every call, and remembers what the runner said. */
function fakeWorker() {
  /** @type {{ path: string, method: string, body: any }[]} */
  const calls = [];
  const fetch = async (/** @type {any} */ input, /** @type {any} */ init = {}) => {
    const url = new URL(String(input));
    const method = String(init.method ?? "GET");
    let body = null;
    try { body = init.body && typeof init.body === "string" ? JSON.parse(init.body) : null; } catch { body = null; }
    calls.push({ path: url.pathname, method, body });
    if (/\/film\/parts\/\d+$/.test(url.pathname)) return Response.json({ partNumber: 1, etag: "e1" });
    if (url.pathname.endsWith("/film")) return Response.json({ partSize: 1 << 20, parts: 1 });
    return Response.json({ ok: true });
  };
  return { calls, fetch };
}

/** @param {any} calls @param {string} suffix */
const callTo = (calls, suffix) => calls.find((c) => c.path.endsWith(suffix) && c.method === "POST");

test("a draft is delivered marked, with the critic's plain reasons in both languages", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-runner-"));
  const file = join(dir, "film.mp4");
  writeFileSync(file, Buffer.alloc(4096, 1));
  const w = fakeWorker();
  const blocks = [
    { code: "critic.relevance", en: "42% of the shots are relevant to the words; 80% is the floor.", bn: "শটের ৪২% কথার সঙ্গে প্রাসঙ্গিক।" },
    { code: "critic.designed", en: "0.4 designed moments a minute; 1.2 is the floor.", bn: "প্রতি মিনিটে ০.৪টি ডিজাইন করা মুহূর্ত।" },
  ];
  await deliver({ site: "https://ai.example.com", id: ID, ticket: "ticket", fetch: w.fetch }, file, { seconds: 2400, review: false, draft: true, blocks });

  const opened = callTo(w.calls, "/film");
  assert.ok(opened, "the film upload was opened");
  assert.deepEqual(opened.body, { bytes: 4096, draft: true, blocks });
  const done = callTo(w.calls, "/progress");
  assert.ok(done);
  const finished = w.calls.filter((c) => c.path.endsWith("/progress") && c.body?.stage === "done");
  assert.equal(finished.length, 1);
  assert.equal(finished[0].body.params.draft, 1, "the studio is told it is a draft");
  assert.equal(finished[0].body.params.minutes, 40);
});

test("a released film is delivered exactly as before: no draft, no reasons", async () => {
  const dir = mkdtempSync(join(tmpdir(), "voice-runner-"));
  const file = join(dir, "film.mp4");
  writeFileSync(file, Buffer.alloc(2048, 2));
  const w = fakeWorker();
  await deliver({ site: "https://ai.example.com", id: ID, ticket: "ticket", fetch: w.fetch }, file, { seconds: 600, review: false });
  const opened = callTo(w.calls, "/film");
  assert.deepEqual(opened?.body, { bytes: 2048 });
  const finished = w.calls.filter((c) => c.path.endsWith("/progress") && c.body?.stage === "done");
  assert.equal("draft" in (finished[0].body.params ?? {}), false);
});
