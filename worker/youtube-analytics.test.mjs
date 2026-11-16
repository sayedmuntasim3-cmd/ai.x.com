import assert from "node:assert/strict";
import { test } from "node:test";
import { authUrl, learnFromVideo, signState, verifyState } from "./youtube-analytics.mjs";

test("the sign-in state is signed with the studio token and expires", async () => {
  const s = await signState("secret", 1000);
  assert.ok(await verifyState("secret", s, 2000));
  assert.ok(!(await verifyState("other", s, 2000)), "another deployment's state is refused");
  assert.ok(!(await verifyState("secret", s, 1000 + 16 * 60 * 1000)), "an old one too");
  assert.ok(!(await verifyState("secret", s.replace(/.$/, (c) => (c === "0" ? "1" : "0")), 2000)), "a changed one too");
  const u = new URL(authUrl({ clientId: "cid", redirectUri: "https://ai.example/api/youtube/callback", state: s }));
  assert.equal(u.searchParams.get("scope"), "https://www.googleapis.com/auth/yt-analytics.readonly", "read-only, nothing else");
  assert.equal(u.searchParams.get("access_type"), "offline");
});

test("a published film's retention is fetched, tied to its scenes and added to the channel's lessons", async () => {
  /** @type {Map<string, string>} */
  const film = new Map([
    ["film.json", JSON.stringify({ id: "f1", topic: "The barber", durationSeconds: 120 })],
    ["s3-chapters.json", JSON.stringify([{ id: "C1" }])],
    ["s5-C1.md", [0, 30, 60, 90].map((a, i) => `**SC000${i + 1}** | 0:0${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}-0:0${Math.floor((a + 30) / 60)}:${String((a + 30) % 60).padStart(2, "0")} | C1 | b | E | C01 | NARR: Line ${i + 1}. | W 2/2 | ANCHOR: x | SHOTS: (1) R3 x | LOOK: L`).join("\n")],
    ["s7.md", "**Final title: The Barber Who Owns 400 Cars**"],
  ]);
  /** @type {Map<string, string>} */
  const channel = new Map();
  const store = (/** @type {Map<string, string>} */ m) => ({ get: async (/** @type {string} */ k) => m.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } });
  /** @type {string[]} */
  const asked = [];
  const fake = /** @type {typeof fetch} */ (async (url, init) => {
    asked.push(String(url));
    if (String(url).startsWith("https://oauth2.googleapis.com/token")) { assert.match(String(init?.body), /grant_type=refresh_token/); return Response.json({ access_token: "AT" }); }
    assert.equal(/** @type {any} */ (init?.headers).authorization, "Bearer AT");
    return Response.json({ rows: Array.from({ length: 101 }, (_, i) => [i / 100, i < 50 ? 1 - i * 0.002 : 0.9 - (i - 50) * 0.01, 0.5]) });
  });
  const missing = await learnFromVideo({ store: store(film), channel: store(channel), filmId: "f1", video: "https://youtu.be/dQw4w9WgXcQ", clientId: "c", clientSecret: "s", fetch: fake });
  assert.equal(missing.ok, false, "not connected yet");
  channel.set("channel/youtube-oauth.json", JSON.stringify({ refreshToken: "RT" }));
  const r = await learnFromVideo({ store: store(film), channel: store(channel), filmId: "f1", video: "https://youtu.be/dQw4w9WgXcQ", clientId: "c", clientSecret: "s", fetch: fake, today: "2026-11-05" });
  assert.ok(r.ok, JSON.stringify(r));
  assert.ok(asked[1].includes("filters=video%3D%3DdQw4w9WgXcQ") && asked[1].includes("dimensions=elapsedVideoTimeRatio"));
  const saved = JSON.parse(String(film.get("retention.json")));
  assert.equal(saved.title, "The Barber Who Owns 400 Cars");
  assert.deepEqual([saved.at30, saved.at60], [95, 90]);
  assert.deepEqual(r.ok && r.report.at60, 90);
  assert.equal(JSON.parse(String(channel.get("channel/lessons.json"))).length, 1);
  await learnFromVideo({ store: store(film), channel: store(channel), filmId: "f1", video: "dQw4w9WgXcQ", clientId: "c", clientSecret: "s", fetch: fake });
  assert.equal(JSON.parse(String(channel.get("channel/lessons.json"))).length, 1, "learning from the same film again replaces its lessons");
});
