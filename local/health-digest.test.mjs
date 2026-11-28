import test from "node:test";
import assert from "node:assert/strict";
import { collectRuns, minutesBetween, toRecord } from "./health-digest.mjs";

test("minutesBetween: tenths of a minute, null when a time is missing", () => {
  assert.equal(minutesBetween("2026-11-29T10:00:00Z", "2026-11-29T11:30:00Z"), 90);
  assert.equal(minutesBetween(null, "2026-11-29T11:30:00Z"), null);
});

test("toRecord: the voice id from the run title, job minutes, the log read", () => {
  const r = toRecord({ file: "voice-film.yml", product: "voiceover" }, { id: 9, display_title: "Voiceover film 123e4567-e89b-12d3-a456-426614174000", status: "completed", conclusion: "failure", created_at: "2026-11-29T10:00:00Z", html_url: "u" }, [{ name: "film", started_at: "2026-11-29T10:00:00Z", completed_at: "2026-11-29T10:12:00Z" }], "BLOCK: black frames\nFree brain calls: 7 (x 7)");
  assert.equal(r.id, "123e4567-e89b-12d3-a456-426614174000");
  assert.equal(r.jobs[0].minutes, 12);
  assert.deepEqual(r.log.blocks, ["black frames"]);
  assert.equal(r.log.brainCalls, 7);
});

test("collectRuns walks runs, jobs and logs through the API (fake fetch)", async () => {
  const seen = [];
  const fake = async (url) => {
    seen.push(String(url));
    const u = String(url);
    const json = (b) => ({ ok: true, json: async () => b, text: async () => "" });
    if (u.includes("/workflows/voice-film.yml/runs")) return json({ workflow_runs: [{ id: 1, display_title: "Voiceover film abc", status: "completed", conclusion: "success", created_at: "2026-11-29T10:00:00Z", html_url: "h" }] });
    if (u.includes("/workflows/daily-film.yml/runs")) return json({ workflow_runs: [] });
    if (u.includes("/runs/1/jobs")) return json({ jobs: [{ id: 5, name: "film", started_at: "2026-11-29T10:00:00Z", completed_at: "2026-11-29T10:30:00Z" }] });
    if (u.includes("/jobs/5/logs")) return { ok: true, text: async () => "Free brain calls: 3 (m 3)" };
    return { ok: false };
  };
  const runs = await collectRuns({ repo: "o/r", token: "t", fetch: fake, now: new Date("2026-11-29T20:00:00Z") });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].log.brainCalls, 3);
  assert.ok(seen.some((u) => u.includes("created=%3E%3D2026-11-28")));
});
