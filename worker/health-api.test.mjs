import test from "node:test";
import assert from "node:assert/strict";
import { DIGEST_KEY, handleHealthReport, validDigest } from "./health-api.mjs";

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const sameToken = (a, b) => a === b;
const bucket = () => {
  const m = new Map();
  return { m, put: async (k, v) => { m.set(k, v); }, get: async (k) => (m.has(k) ? { text: async () => m.get(k) } : null), list: async () => ({ delimitedPrefixes: [], truncated: false }) };
};
const digest = { generatedAt: "2026-11-29T20:00:00Z", windowHours: 24, films: { voiceover: { total: 1 }, dailyScript: { total: 0 }, idea: { total: 0 } }, topFixes: ["x"] };
const call = (env, method, body, token = "key") => handleHealthReport(new Request("https://x/api/health/report", { method, headers: { authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }), env, new URL("https://x/api/health/report"), { sameToken, json });

test("validDigest: only a digest-shaped object", () => {
  assert.equal(validDigest(digest), true);
  assert.equal(validDigest({ films: {} }), false);
  assert.equal(validDigest(null), false);
});

test("the studio key stores the digest and reads it back with the live Idea films", async () => {
  const env = { FILMS: bucket(), STUDIO_TOKEN: "key" };
  assert.equal((await call(env, "POST", digest)).status, 200);
  assert.ok(env.FILMS.m.has(DIGEST_KEY));
  const got = await (await call(env, "GET")).json();
  assert.equal(got.report.generatedAt, digest.generatedAt);
  assert.equal(got.report.films.idea.total, 0);
});

test("a wrong key is refused, a bad body is refused, other paths are not ours", async () => {
  const env = { FILMS: bucket(), STUDIO_TOKEN: "key" };
  assert.equal((await call(env, "POST", digest, "nope")).status, 401);
  assert.equal((await call(env, "GET", null, "nope")).status, 401);
  assert.equal((await call(env, "POST", { nope: 1 })).status, 400);
  assert.equal(await handleHealthReport(new Request("https://x/api/other"), env, new URL("https://x/api/other"), { sameToken, json }), null);
});

test("no digest yet: a clear note, not an error", async () => {
  const env = { FILMS: bucket(), STUDIO_TOKEN: "key" };
  const got = await (await call(env, "GET")).json();
  assert.equal(got.report, null);
  assert.match(got.note, /No daily report yet/);
});
