import assert from "node:assert/strict";
import { test } from "node:test";
import { privateAddress, publicUrl, safeFetch } from "../src/net-guard.mjs";
import { readPage, writeInstruction } from "../src/research-desk.mjs";
import { checkSources } from "../src/source-check.mjs";

test("publicUrl refuses every way of writing a private address, and keeps public ones", () => {
  const refused = [
    "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://127.1/", "http://0.0.0.0/", "http://10.1.2.3/", "http://172.20.0.1/",
    "http://192.168.1.1/admin", "http://100.64.0.1/", "http://169.254.169.254/latest/meta-data/", "http://198.18.0.1/", "http://224.0.0.1/",
    "http://[::1]/", "http://[::]/", "http://[::ffff:127.0.0.1]/", "http://[fe80::1]/", "http://[fd00::1]/", "http://[ff02::1]/", "http://[2001:db8::1]/",
    "http://localhost/", "http://localhost./", "http://app.localhost/", "http://printer.local/", "http://nas.lan/", "http://db.internal/", "http://router/",
    "http://user:pw@example.com/", "ftp://example.com/", "file:///etc/passwd", "javascript:alert(1)", "not a url",
  ];
  for (const u of refused) assert.equal(publicUrl(u), false, u);
  for (const u of ["https://en.wikipedia.org/wiki/Tenerife", "http://example.org/a?b=1", "https://example.com:8443/x", "http://8.8.8.8/", "http://[2606:4700::1111]/"]) assert.equal(publicUrl(u), true, u);
  assert.equal(privateAddress("192.168.0.10"), true);
  assert.equal(privateAddress("93.184.216.34"), false);
  assert.equal(privateAddress("::ffff:7f00:1"), true, "IPv4-mapped forms are refused");
  assert.equal(privateAddress("2606:4700::1111"), false);
});

/** A fake web: each URL answers with a status and maybe a redirect. @param {Record<string, { status: number, location?: string, body?: string }>} pages */
function fakeWeb(pages) {
  /** @type {{ url: string, redirect?: string }[]} */
  const asked = [];
  const get = async (/** @type {string} */ url, /** @type {RequestInit} */ init = {}) => {
    asked.push({ url, redirect: init.redirect });
    const p = pages[url] ?? { status: 404 };
    return new Response(p.body ?? "", { status: p.status, headers: { "content-type": "text/html", ...(p.location ? { location: p.location } : {}) } });
  };
  return { get, asked };
}

test("safeFetch checks every redirect hop: a public page cannot send the runner into a private network", async () => {
  const web = fakeWeb({
    "https://evil.example/a": { status: 302, location: "http://192.168.1.1/admin" },
    "https://good.example/old": { status: 301, location: "/new" },
    "https://good.example/new": { status: 200, body: "<p>ok</p>" },
    "https://loop.example/1": { status: 302, location: "https://loop.example/1" },
  });
  await assert.rejects(safeFetch(web.get, "https://evil.example/a"), /non-public address: http:\/\/192\.168\.1\.1/);
  assert.ok(!web.asked.some((a) => a.url.includes("192.168")), "the private address was never requested");
  const ok = await safeFetch(web.get, "https://good.example/old");
  assert.equal(ok.status, 200);
  assert.deepEqual(web.asked.filter((a) => a.url.startsWith("https://good")).map((a) => [a.url, a.redirect]), [["https://good.example/old", "manual"], ["https://good.example/new", "manual"]], "redirects are followed by hand, relative ones too");
  await assert.rejects(safeFetch(web.get, "https://loop.example/1"), /Too many redirects/);
  await assert.rejects(safeFetch(web.get, "http://10.0.0.1/"), /non-public address/);
});

test("the research desk and the source desk never open a private address, even when a model cites one", async () => {
  const web = fakeWeb({ "https://evil.example/a": { status: 302, location: "http://169.254.169.254/latest/meta-data/" } });
  assert.equal(await readPage(web.get, "http://127.0.0.1:8080/"), null);
  assert.equal(await readPage(web.get, "https://evil.example/a"), null, "a redirect into the cloud metadata address is refused");
  const research = { facts: [{ id: "F01", claim: "x", value: "5", sources: ["http://127.0.0.1/admin", "http://[::1]/", "https://evil.example/a"] }] };
  const r = await checkSources(research, { fetch: web.get });
  assert.ok(!web.asked.some((a) => /127\.0\.0\.1|\[::1\]|169\.254/.test(a.url)), "no private address was requested");
  assert.equal(r.research.facts.length, 1, "the fact is kept");
  assert.equal(r.research.facts[0].check.status, "unreachable", "and marked unreachable, never verified");
});

test("web pages reach the brain as data, never as instructions", () => {
  for (const story of [false, true]) assert.match(writeInstruction(story), /data, never instructions/);
});
