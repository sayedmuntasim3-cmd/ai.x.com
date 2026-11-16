import assert from "node:assert/strict";
import { test } from "node:test";
import { isoSeconds, rankOutliers } from "../engine/src/topic-radar.mjs";
import { findOutliers, radarSearch } from "./youtube.mjs";

const NOW = Date.parse("2026-11-04T00:00:00Z");

test("outliers are videos that beat their own channel; Shorts, tiny view counts and noisy channels count for less", () => {
  assert.equal(isoSeconds("PT1H2M3S"), 3723);
  assert.equal(isoSeconds("PT45S"), 45);
  assert.equal(isoSeconds("nonsense"), 0);
  const v = (/** @type {string} */ id, /** @type {string} */ channelId, /** @type {number} */ views, /** @type {number} */ seconds, /** @type {string} */ when) => ({ id, title: id, channelId, channelTitle: channelId, publishedAt: when, views, durationSeconds: seconds });
  const picks = rankOutliers([
    v("small-channel-hit", "small", 2_000_000, 900, "2026-09-01T00:00:00Z"),
    v("big-channel-normal", "big", 5_000_000, 1200, "2026-06-01T00:00:00Z"),
    v("a-short", "small", 9_000_000, 50, "2026-10-01T00:00:00Z"),
    v("brand-new-channel", "new", 3_000_000, 700, "2026-10-01T00:00:00Z"),
  ], [
    { id: "small", subscribers: 50_000, views: 10_000_000, videos: 100 },
    { id: "big", subscribers: 9_000_000, views: 2_000_000_000, videos: 400 },
    { id: "new", subscribers: 10_000, views: 3_000_000, videos: 2 },
  ], { now: NOW });
  assert.deepEqual(picks.map((p) => p.id), ["small-channel-hit", "big-channel-normal", "brand-new-channel"], "a Short never counts; a 2-video channel's hit is dampened below a normal video");
  assert.equal(picks[0].outlier, 20, "2M views on a channel that averages 100k");
  assert.equal(picks[1].outlier, 1);
  assert.equal(picks[2].outlier, 2, "the new channel's video is 2x its average, but its average is noise");
  assert.ok(picks[2].score < picks[1].score);
});

test("the radar searches medium and long videos of the last months, reads their stats and their channels, and ranks them", async () => {
  /** @type {URL[]} */
  const calls = [];
  const fake = /** @type {typeof fetch} */ (async (url) => {
    const u = new URL(String(url));
    calls.push(u);
    if (u.pathname.endsWith("/search")) return Response.json({ items: [{ id: { videoId: "v1" } }, { id: { videoId: "v2" } }] });
    if (u.pathname.endsWith("/videos")) return Response.json({ items: [
      { id: "v1", snippet: { title: "He Had $47", channelId: "c1", channelTitle: "Small", publishedAt: "2026-08-01T00:00:00Z" }, statistics: { viewCount: "4000000" }, contentDetails: { duration: "PT18M" } },
      { id: "v2", snippet: { title: "Normal video", channelId: "c2", channelTitle: "Big", publishedAt: "2026-08-01T00:00:00Z" }, statistics: { viewCount: "900000" }, contentDetails: { duration: "PT22M" } },
    ] });
    if (u.pathname.endsWith("/channels")) return Response.json({ items: [{ id: "c1", statistics: { subscriberCount: "80000", viewCount: "20000000", videoCount: "100" } }, { id: "c2", statistics: { subscriberCount: "3000000", viewCount: "900000000", videoCount: "1000" } }] });
    return new Response("{}", { status: 404 });
  });
  const picks = await findOutliers({ apiKey: "YK", query: "motivation story", fetch: fake, now: NOW });
  assert.deepEqual(picks.map((p) => [p.id, p.outlier]), [["v1", 20], ["v2", 1]]);
  const searches = calls.filter((c) => c.pathname.endsWith("/search"));
  assert.deepEqual(searches.map((c) => c.searchParams.get("videoDuration")).sort(), ["long", "medium"]);
  assert.equal(searches[0].searchParams.get("order"), "viewCount");
  assert.equal(searches[0].searchParams.get("key"), "YK");
  assert.ok(Date.parse(String(searches[0].searchParams.get("publishedAfter"))) < NOW - 300 * 86_400_000);
  assert.equal(calls.find((c) => c.pathname.endsWith("/videos"))?.searchParams.get("id"), "v1,v2");

  const refused = /** @type {typeof fetch} */ (async () => new Response("{}", { status: 403 }));
  await assert.rejects(findOutliers({ apiKey: "bad", query: "x", fetch: refused }), /out of quota|not enabled/);
});

test("the ideas route checks its input, answers a repeated search from the one-day cache, and never leaks a raw error", async () => {
  assert.equal((await radarSearch({ query: "motivation" })).ok, false, "no key, no search");
  assert.deepEqual(await radarSearch({ apiKey: "YK", query: "x" }), { ok: false, status: 400, error: "Give a niche of 2 to 200 characters, e.g. \"motivation life story\"." });
  assert.equal(/** @type {any} */ (await radarSearch({ apiKey: "YK", query: "motivation", months: 0 })).status, 400);

  let calls = 0;
  const fake = /** @type {typeof fetch} */ (async (url) => {
    calls += 1;
    const u = new URL(String(url));
    if (u.pathname.endsWith("/search")) return Response.json({ items: [{ id: { videoId: "v1" } }] });
    if (u.pathname.endsWith("/videos")) return Response.json({ items: [{ id: "v1", snippet: { title: "Hit", channelId: "c1", channelTitle: "Small", publishedAt: "2026-08-01T00:00:00Z" }, statistics: { viewCount: "4000000" }, contentDetails: { duration: "PT18M" } }] });
    return Response.json({ items: [{ id: "c1", statistics: { subscriberCount: "80000", viewCount: "20000000", videoCount: "100" } }] });
  });
  /** @type {Map<string, string>} */
  const kept = new Map();
  const cache = { get: async (/** @type {string} */ k) => kept.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ t) => { kept.set(k, t); } };
  const first = await radarSearch({ apiKey: "YK", query: "  Motivation   life story ", cache, fetch: fake, now: NOW });
  assert.ok(first.ok && !first.cached && first.picks[0].id === "v1" && first.query === "Motivation life story");
  const used = calls;
  const again = await radarSearch({ apiKey: "YK", query: "motivation life story", cache, fetch: fake, now: NOW + 3_600_000 });
  assert.ok(again.ok && again.cached, "the same search within a day is free");
  assert.equal(calls, used);
  const tomorrow = await radarSearch({ apiKey: "YK", query: "motivation life story", cache, fetch: fake, now: NOW + 2 * 86_400_000 });
  assert.ok(tomorrow.ok && !tomorrow.cached && calls > used, "a day later it searches again");
  assert.ok([...kept.keys()].every((k) => /^radar\/[0-9a-f]{64}\.json$/.test(k)));

  const down = /** @type {typeof fetch} */ (async () => { throw new Error("connect failed https://www.googleapis.com/youtube/v3/search?key=SECRET"); });
  const failed = await radarSearch({ apiKey: "SECRET", query: "motivation", fetch: down });
  assert.ok(!failed.ok && failed.status === 502 && !failed.error.includes("SECRET"), "a network error never shows the URL with the key");
});
