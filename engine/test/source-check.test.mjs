import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSources, pageHasNumber, pageText, siteOf, sourceGaps, valueNumbers } from "../src/source-check.mjs";

test("numbers are looked up whole, with or without thousands commas", () => {
  assert.deepEqual(valueNumbers("$3.2 billion in 2014, about 1,500 a month."), ["3.2", "2014", "1,500"]);
  const text = pageText("<p>He cut <b>1500</b> heads a month in 2014.</p><script>var x = 99999;</script>");
  assert.ok(pageHasNumber(text, "1,500") && pageHasNumber(text, "2014"));
  assert.ok(!pageHasNumber(text, "15"), "15 is not found inside 1500");
  assert.ok(!pageHasNumber(text, "99999"), "scripts are not page text");
  assert.ok(pageHasNumber(pageText("<td>3.2 billion</td>"), "3.2") && !pageHasNumber(pageText("<td>13.25</td>"), "3.2"));
  assert.equal(siteOf("https://www.Example.com/a"), "example.com");
});

test("the source desk opens every cited page: gone pages strike facts, numbers are looked for, sites are counted", async () => {
  const pages = {
    "https://news.example/a": "<html><body>Revenue reached $3.2 billion in 2014.</body></html>",
    "https://paper.example/b": "<html><body>Revenue was about three billion dollars.</body></html>",
    "https://blocked.example/c": null,
    "https://gov.example/report.pdf": "pdf",
  };
  /** @type {string[]} */
  const asked = [];
  const f = /** @type {any} */ (async (/** @type {string} */ url) => {
    asked.push(url);
    const body = /** @type {any} */ (pages)[url];
    if (body === undefined) return new Response("not here", { status: 404, headers: { "content-type": "text/html" } });
    if (body === null) return new Response("forbidden", { status: 403 });
    if (body === "pdf") return new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    return new Response(body, { headers: { "content-type": "text/html; charset=utf-8" } });
  });
  const research = { subject: "x", facts: [
    { id: "F01", claim: "revenue", value: "$3.2 billion (2014)", sources: ["https://news.example/a", "https://paper.example/b"] },
    { id: "F02", claim: "revenue elsewhere", value: "$3.2 billion", sources: ["https://paper.example/b"] },
    { id: "F03", claim: "an invented page", value: "47 stores", sources: ["https://news.example/made-up-page"] },
    { id: "F04", claim: "blocked", value: "12 cities", sources: ["https://blocked.example/c"] },
    { id: "F05", claim: "a report", value: "1,200 jobs", sources: ["https://gov.example/report.pdf", "https://news.example/a"] },
    { id: "F06", claim: "founded by", value: "his brother", sources: ["https://paper.example/b"] },
  ] };
  const r = await checkSources(research, { fetch: f });
  assert.equal(new Set(asked).size, asked.length, "each page is opened once");
  const by = Object.fromEntries(r.research.facts.map((x) => [x.id, x.check.status]));
  assert.deepEqual(by, { F01: "verified", F02: "unconfirmed", F04: "unreachable", F05: "unconfirmed", F06: "opened" });
  assert.deepEqual(r.dropped.map((d) => d.id), ["F03"], "a fact whose only page is gone is dropped");
  assert.equal(r.research.facts[0].check.sites, 2);
  assert.deepEqual(r.summary.singleSiteNumbers, ["F02", "F04"]);
  assert.equal(r.summary.sites, 4);
  assert.deepEqual(r.summary.facts, { kept: 5, dropped: 1, verified: 1, opened: 1, unconfirmed: 2, unreachable: 1 });
  assert.match(sourceGaps(r)[0], /1 fact was dropped .* F03/);
});
