import test from "node:test";
import assert from "node:assert/strict";
import { handleYoutubeWatch, STOP_KEY, WATCH_PREFIX, pacificDay, isQuotaAnswer } from "./youtube-watch-api.mjs";

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
const sameToken = (a, b) => a === b;
const bucket = () => {
  const m = new Map();
  return { m, put: async (k, v) => { m.set(k, v); }, get: async (k) => (m.has(k) ? { text: async () => m.get(k) } : null), list: async ({ prefix }) => ({ objects: [...m.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }) };
};
const answer = { lengthSeconds: 900, hookText: "In 1986 a reactor exploded and nobody told the town", firstNumberAtSec: 5, firstStakeAtSec: 12, wordsPerMinute: 150, avgShotSeconds: 4, shares: { archive: 0.3, mapsDiagramsAnimation: 0.2, onScreenText: 0.1, talkingHeads: 0.2, stock: 0.2 }, chapterTurnsSec: [60, 200], revealsSec: [300], musicStyle: "strings", ending: "It closes on who pays." };
const gem = (obj) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }));
const call = (env, method, body, fetch, token = "key") => handleYoutubeWatch(new Request("https://x/api/youtube-watch", { method, headers: { authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined }), env, new URL("https://x/api/youtube-watch"), { sameToken, json, fetch, now: () => Date.parse("2026-11-28T20:00:00Z") });
const mkEnv = () => ({ FILMS: bucket(), STUDIO_TOKEN: "key", GEMINI_API_KEY: "g" });

test("a good answer is stored under research/youtube-watch/<id>.json and not asked twice", async () => {
  const env = mkEnv(); let calls = 0;
  const f = async () => { calls++; return gem(answer); };
  const r = await call(env, "POST", { videoId: "rj-G_gmFWtE" }, f);
  assert.equal(r.status, 200);
  assert.ok(env.FILMS.m.has(`${WATCH_PREFIX}rj-G_gmFWtE.json`));
  const again = await (await call(env, "POST", { videoId: "rj-G_gmFWtE" }, f)).json();
  assert.equal(again.cached, true);
  assert.equal(calls, 1);
  const all = await (await call(env, "GET", null, f)).json();
  assert.deepEqual(all.watched, ["rj-G_gmFWtE"]);
});

test("a bad answer is refused and not stored", async () => {
  const env = mkEnv();
  const r = await call(env, "POST", { videoId: "rj-G_gmFWtE" }, async () => gem({ ...answer, wordsPerMinute: 5 }));
  assert.equal(r.status, 422);
  assert.equal([...env.FILMS.m.keys()].length, 0);
});

test("quota on both models stops the day: no retry loop, later calls refused without asking Google", async () => {
  const env = mkEnv(); let calls = 0;
  const f = async () => { calls++; return new Response("{}", { status: 429 }); };
  const r = await call(env, "POST", { videoId: "rj-G_gmFWtE" }, f);
  assert.equal(r.status, 429);
  assert.equal(calls, 2);
  assert.equal(JSON.parse(env.FILMS.m.get(STOP_KEY)).day, "2026-11-28");
  const r2 = await call(env, "POST", { videoId: "AAAAAAAAAAA" }, f);
  assert.equal(r2.status, 429);
  assert.equal(calls, 2);
});

test("the first model out of quota falls through to the second; wrong key and bad id are refused", async () => {
  const env = mkEnv(); let n = 0;
  const r = await call(env, "POST", { videoId: "rj-G_gmFWtE" }, async () => (n++ === 0 ? new Response("RESOURCE_EXHAUSTED", { status: 429 }) : gem(answer)));
  assert.equal(r.status, 200);
  assert.equal((await call(env, "POST", { videoId: "x" }, null)).status, 400);
  assert.equal((await call(env, "POST", { videoId: "rj-G_gmFWtE" }, null, "nope")).status, 401);
  assert.equal(await handleYoutubeWatch(new Request("https://x/api/other"), env, new URL("https://x/api/other"), { sameToken, json }), null);
});

test("pacificDay and isQuotaAnswer", () => {
  assert.equal(pacificDay(Date.parse("2026-11-28T03:00:00Z")), "2026-11-27");
  assert.equal(isQuotaAnswer(200, "ok"), false);
  assert.equal(isQuotaAnswer(400, "Quota exceeded"), true);
});

test("a retired model (404) falls through to the next; all retired is a clear 502, not a quota stop", async () => {
  const env = mkEnv(); let n = 0;
  const ok = await call(env, "POST", { videoId: "rj-G_gmFWtE" }, async () => (n++ === 0 ? new Response("{}", { status: 404 }) : gem(answer)));
  assert.equal(ok.status, 200);
  const env2 = mkEnv();
  const bad = await call(env2, "POST", { videoId: "rj-G_gmFWtE" }, async () => new Response("{}", { status: 404 }));
  assert.equal(bad.status, 502);
  assert.equal(env2.FILMS.m.has(STOP_KEY), false);
});
