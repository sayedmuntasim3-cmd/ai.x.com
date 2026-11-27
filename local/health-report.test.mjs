// Simulated: no request leaves the machine. The live run is .github/workflows/health-report.yml.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReport, issuePlan, readRun, readSources, readSite, runLine, sourceProblems, ISSUE_TITLE } from "./health-report.mjs";

/** A healthy platform: every archive on, both runs green, both addresses answering. */
function healthy(extra = {}) {
  return {
    sources: { ok: true, rows: [{ id: "europeana", name: "Europeana", enabled: true }, { id: "dvids", name: "DVIDS", enabled: true }] },
    runs: [
      { file: "daily-film.yml", label: "Daily film", status: "completed", conclusion: "success", url: "https://github.com/o/r/actions/runs/1", createdAt: "2026-11-27T10:23:00Z" },
      { file: "voice-film.yml", label: "Voice film", status: "completed", conclusion: "success", url: "https://github.com/o/r/actions/runs/2", createdAt: "2026-11-27T11:00:00Z" },
    ],
    sites: [{ url: "https://ai-x-com.sayedmuntasim3.workers.dev/", ok: true, status: 200 }, { url: "https://ai-x-com.sayedmuntasim3.workers.dev/studio/", ok: true, status: 200 }],
    now: new Date("2026-11-27T06:17:00Z"),
    ...extra,
  };
}

test("when everything is fine the issue says so, carries one Bangla line, and is closed", () => {
  const report = buildReport(healthy());
  assert.equal(report.ok, true);
  assert.equal(report.title, ISSUE_TITLE);
  assert.deepEqual(report.problems, []);
  assert.match(report.body, /## Everything is fine/);
  assert.match(report.body, /2 of 2 archives ready to search/);
  assert.match(report.body, /last finished successfully/);
  assert.match(report.body, /\*\*বাংলায়:\*\* সব ঠিক আছে/);
  assert.match(report.body, /Checked 2026-11-27 06:17 UTC/);
  // A green day closes the issue it opened yesterday, and invents no issue when there is none.
  assert.equal(issuePlan({ exists: true, ok: true }), "close");
  assert.equal(issuePlan({ exists: false, ok: true }), "none");
});

test("an archive switched off or missing its key is named, and the issue is opened", () => {
  const report = buildReport(healthy({
    sources: {
      ok: true,
      rows: [
        { id: "europeana", name: "Europeana", enabled: true },
        { id: "dvids", name: "DVIDS", enabled: true, needsKey: true, signup: "https://api.dvidshub.net" },
        { id: "nara", name: "US National Archives", enabled: false },
      ],
    },
  }));
  assert.equal(report.ok, false);
  assert.equal(report.problems.length, 2);
  assert.match(report.problems.join("\n"), /\*\*DVIDS\*\* is on but needs its key \(ask for one at https:\/\/api\.dvidshub\.net\)/);
  assert.match(report.problems.join("\n"), /\*\*US National Archives\*\* is switched off/);
  assert.match(report.body, /1 of 3 archives ready to search, 2 not usable yet/);
  assert.match(report.summaryBn, /২টি সমস্যা/);
  assert.equal(issuePlan({ exists: false, ok: false }), "create");
  assert.equal(issuePlan({ exists: true, ok: false }), "update");
});

test("the archive list failing, a failed run, a run that never happened and a dead site are all problems", () => {
  const broken = buildReport({
    sources: { ok: false, rows: [], error: "HTTP 500" },
    runs: [
      { file: "daily-film.yml", label: "Daily film", status: "completed", conclusion: "failure", url: "https://github.com/o/r/actions/runs/9", createdAt: "2026-11-27T10:23:00Z" },
      { file: "voice-film.yml", label: "Voice film" },
    ],
    sites: [{ url: "https://example.test/", status: 503, ok: false }, { url: "https://example.test/studio/", ok: false, error: "fetch failed" }],
    now: new Date("2026-11-27T06:17:00Z"),
  });
  assert.equal(broken.ok, false);
  assert.equal(broken.problems.length, 5);
  const text = broken.problems.join("\n");
  assert.match(text, /The archive list did not answer: HTTP 500/);
  assert.match(text, /Daily film\*\* last finished \*\*failure\*\*/);
  assert.match(text, /Voice film\*\* has never run/);
  assert.match(text, /answers 503/);
  assert.match(text, /does not answer \(fetch failed\)/);
  assert.match(broken.body, /## What is broken/);
});

test("a run still going is not counted as broken, and one line per run keeps the reader oriented", () => {
  assert.deepEqual(runLine({ file: "x", label: "X", status: "in_progress", conclusion: null, url: "u" }), { ok: true, text: "is still in_progress — u." });
  const queued = buildReport(healthy({ runs: [{ file: "daily-film.yml", label: "Daily film", status: "queued" }, healthy().runs[1]] }));
  assert.equal(queued.ok, true);
});

test("the archive list endpoint is read from the Worker and a broken answer is named, not thrown", async () => {
  const good = /** @type {typeof fetch} */ (async (url) => {
    assert.equal(String(url), "https://site.test/api/media/sources");
    return new Response(JSON.stringify({ sources: [{ id: "loc", name: "Library of Congress", enabled: true }] }), { status: 200 });
  });
  assert.deepEqual(await readSources({ site: "https://site.test", fetch: good }), { ok: true, rows: [{ id: "loc", name: "Library of Congress", enabled: true }] });
  const bad = /** @type {typeof fetch} */ (async () => new Response("nope", { status: 502 }));
  assert.deepEqual(await readSources({ site: "https://site.test", fetch: bad }), { ok: false, rows: [], error: "HTTP 502" });
  const empty = /** @type {typeof fetch} */ (async () => new Response(JSON.stringify({ sources: [] }), { status: 200 }));
  assert.equal((await readSources({ site: "https://site.test", fetch: empty })).error, "the answer held no archives");
  const offline = /** @type {typeof fetch} */ (async () => { throw new Error("fetch failed"); });
  assert.equal((await readSources({ site: "https://site.test", fetch: offline })).error, "fetch failed");
});

test("the latest run comes from the workflow's own file, and the token goes in a header only", async () => {
  const seen = /** @type {{ url: string, auth?: string }[]} */ ([]);
  const fake = /** @type {typeof fetch} */ (async (url, init) => {
    seen.push({ url: String(url), auth: /** @type {any} */ (init?.headers)?.authorization });
    return new Response(JSON.stringify({ workflow_runs: [{ status: "completed", conclusion: "success", html_url: "https://github.com/o/r/actions/runs/7", created_at: "2026-11-27T10:23:00Z" }] }), { status: 200 });
  });
  const run = await readRun({ repo: "o/r", file: "daily-film.yml", fetch: fake, token: "dummy-token" });
  assert.equal(seen[0].url, "https://api.github.com/repos/o/r/actions/workflows/daily-film.yml/runs?per_page=1");
  assert.equal(seen[0].auth, "Bearer dummy-token");
  assert.deepEqual(Object.keys(run ?? {}).sort(), ["conclusion", "createdAt", "file", "status", "url"]);
  // Nothing from the token may reach the text the issue shows.
  const report = buildReport(healthy({ runs: [{ file: "daily-film.yml", label: "Daily film", ...run }] }));
  assert.equal(JSON.stringify(report).includes("dummy-token"), false);
  // A workflow that never ran answers null, not a crash.
  const none = /** @type {typeof fetch} */ (async () => new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 }));
  assert.equal(await readRun({ repo: "o/r", file: "voice-film.yml", fetch: none }), null);
});

test("the site check wants a 200 and records what it actually got", async () => {
  const ok = /** @type {typeof fetch} */ (async (url) => { assert.equal(String(url), "https://site.test/studio/"); return new Response("", { status: 200 }); });
  assert.deepEqual(await readSite({ url: "https://site.test/studio/", fetch: ok }), { url: "https://site.test/studio/", status: 200, ok: true });
  const down = /** @type {typeof fetch} */ (async () => new Response("", { status: 500 }));
  assert.equal((await readSite({ url: "https://site.test/", fetch: down })).ok, false);
});

test("a missing archive list is one problem, not an empty success", () => {
  assert.equal(sourceProblems({ ok: true, rows: [] }).length, 0);
  assert.match(sourceProblems({ ok: false, rows: [] }).at(0)?.text ?? "", /did not answer: unknown reason/);
});
