import assert from "node:assert/strict";
import { test } from "node:test";
import { listFilms } from "./films.mjs";

test("my films are listed newest first with status and spend, across pages", async () => {
  const a = "aaaaaaaa-0000-0000-0000-000000000000";
  const b = "bbbbbbbb-0000-0000-0000-000000000000";
  /** @type {Record<string, string>} */
  const objects = {
    [`films/${a}/film.json`]: JSON.stringify({ topic: "Old film", durationSeconds: 600, createdAt: "2026-11-01T10:00:00Z" }),
    [`films/${a}/run.json`]: JSON.stringify({ film: { topic: "Old film", durationSeconds: 600 }, status: "done", costUsd: 5.2 }),
    [`films/${b}/film.json`]: JSON.stringify({ topic: "New film", durationSeconds: 2700, createdAt: "2026-11-04T10:00:00Z" }),
  };
  const pages = [{ delimitedPrefixes: [`films/${a}/`], truncated: true, cursor: "c1" }, { delimitedPrefixes: [`films/${b}/`, "channel/"], truncated: false }];
  const bucket = {
    list: async (/** @type {any} */ o) => { assert.equal(o.prefix, "films/"); return /** @type {any} */ (pages.shift()); },
    get: async (/** @type {string} */ k) => (k in objects ? { text: async () => objects[k] } : null),
  };
  const films = await listFilms(bucket);
  assert.deepEqual(films, [
    { id: b, topic: "New film", minutes: 45, status: "queued", costUsd: 0, createdAt: "2026-11-04T10:00:00Z" },
    { id: a, topic: "Old film", minutes: 10, status: "done", costUsd: 5.2, createdAt: "2026-11-01T10:00:00Z" },
  ]);
});
