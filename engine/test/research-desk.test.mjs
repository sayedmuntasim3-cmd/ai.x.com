import assert from "node:assert/strict";
import { test } from "node:test";
import { bindToCorpus, corpusBudget, corpusText, excerpt, gatherCorpus, publicUrl, readableText, researchProviders, wikipediaProvider } from "../src/research-desk.mjs";

const ARTICLE = [
  "Automobili Lamborghini S.p.A. is an Italian manufacturer of luxury sports cars based in Sant'Agata Bolognese.",
  "The company was founded in 1963 by Ferruccio Lamborghini, who had made his fortune building tractors.",
  "Unrelated paragraph about the weather in the region and nothing else of note at all for this film.",
  "In 1998 the company was bought by Audi AG, a subsidiary of the Volkswagen Group.",
  "References",
  "Smith, J. (2001). Lamborghini.",
].join("\n");

/**
 * A fake web: the Wikipedia API plus two cited pages (one of them gone).
 * @param {string[]} [log]
 */
function fakeWeb(log = []) {
  return /** @type {typeof fetch} */ (async (input, init) => {
    const url = new URL(String(input));
    log.push(url.href);
    assert.match(String(/** @type {any} */ (init?.headers)?.["user-agent"]), /ZuponaStudio/, "every request names the client, as Wikimedia asks");
    if (url.hostname === "en.wikipedia.org") {
      const p = url.searchParams;
      if (p.get("list") === "search") {
        const q = String(p.get("srsearch"));
        return Response.json({ query: { search: q.includes("Audi") ? [{ title: "Audi", snippet: "<span>Audi</span> AG" }] : [{ title: "Lamborghini", snippet: "Italian <b>maker</b>" }, { title: "Ferruccio Lamborghini" }] } });
      }
      const title = String(p.get("titles"));
      if (title === "Ferruccio Lamborghini") return Response.json({ query: { pages: [{ title, missing: true }] } });
      return Response.json({ query: { pages: [{ title, extract: title === "Audi" ? "Audi AG is a German automotive manufacturer of luxury vehicles headquartered in Ingolstadt, Bavaria, and a member of the Volkswagen Group." : ARTICLE, extlinks: [{ url: "https://www.example-museum.org/history" }, { url: "//gone.example.com/page" }, { url: "http://localhost:8080/admin" }, { url: "https://archive.org/details/x" }] }] } });
    }
    if (url.hostname === "www.example-museum.org") return new Response(`<html><head><title>Museum history</title><script>var x=1</script></head><body><nav>Menu</nav><p>The first car, the 350 GT, was shown in 1963 at the Turin Motor Show.</p><p>${"More history of the factory and its workers. ".repeat(10)}</p></body></html>`, { headers: { "content-type": "text/html; charset=utf-8" } });
    return new Response("gone", { status: 404 });
  });
}

test("the desk searches Wikipedia, reads the articles and opens the pages they cite, one request at a time", async () => {
  /** @type {string[]} */
  const log = [];
  const fetch = fakeWeb(log);
  const { docs, trace } = await gatherCorpus({ queries: ["Lamborghini history", "Lamborghini Audi 1998", "Lamborghini history"], providers: researchProviders({ fetch }), fetch });
  assert.deepEqual(docs.map((d) => [d.id, d.title, d.provider]), [["D1", "Lamborghini", "wikipedia"], ["D2", "Audi", "wikipedia"], ["D3", "Museum history", "reference"]]);
  assert.equal(docs[2].via, "https://en.wikipedia.org/wiki/Lamborghini", "a reference remembers the article that cited it");
  assert.ok(!docs[0].text.includes("Smith, J."), "the article's own reference list is not read as facts");
  assert.ok(docs[2].text.includes("350 GT") && !docs[2].text.includes("var x") && !docs[2].text.includes("Menu"), "scripts and navigation are removed");
  assert.equal(trace.length, 2, "a repeated query is searched once");
  assert.ok(!log.some((u) => u.includes("localhost")), "a cited link into a private network is never opened");
  assert.ok(!log.some((u) => u.includes("archive.org")), "catalogue and mirror sites are skipped");
  assert.ok(log.some((u) => u.includes("gone.example.com")), "protocol-relative links are opened over https");
});

test("a failed search is recorded and the others still run", async () => {
  const fetch = fakeWeb();
  const broken = { id: "broken", async search() { throw new Error("down"); } };
  const { docs, trace } = await gatherCorpus({ queries: ["Lamborghini"], providers: [broken, wikipediaProvider({ fetch })], fetch, limits: { references: 0 } });
  assert.equal(docs.length, 1);
  assert.deepEqual(trace.map((t) => [t.provider, t.outcome]), [["broken", "failed: down"], ["wikipedia", "ok"]]);
});

test("facts are bound to the corpus: ids become URLs, anything else is dropped", () => {
  const docs = [{ id: "D1", url: "https://en.wikipedia.org/wiki/Lamborghini", title: "L", site: "en.wikipedia.org", provider: "wikipedia", text: "t" }, { id: "D2", url: "https://www.example-museum.org/history", title: "M", site: "example-museum.org", provider: "reference", text: "t" }];
  const { research, outside } = bindToCorpus({ subject: "Lamborghini", facts: [
    { id: "F01", claim: "founded", value: "1963", sources: ["D1", "[d2]", "D1"] },
    { id: "F02", claim: "bought by Audi", value: "1998", sources: ["https://www.example-museum.org/history"] },
    { id: "F03", claim: "invented", value: "2001", sources: ["https://made-up.example/page", "D9"] },
    { id: "F04", claim: "no sources", value: "x" },
  ] }, docs);
  assert.deepEqual(research.facts.map((/** @type {any} */ f) => [f.id, f.sources]), [
    ["F01", ["https://en.wikipedia.org/wiki/Lamborghini", "https://www.example-museum.org/history"]],
    ["F02", ["https://www.example-museum.org/history"]],
  ]);
  assert.equal(outside, 2);
  assert.equal(research.subject, "Lamborghini");
  assert.match(corpusText(docs), /^\[D1\] L\nURL: https:\/\/en\.wikipedia\.org\/wiki\/Lamborghini\nt/);
});

test("excerpts keep the opening and the paragraphs about the subject, in order", () => {
  const text = ["Opening paragraph that says what the subject is, long enough to count here.", ...Array.from({ length: 30 }, (_, i) => `Filler paragraph number ${i} about nothing in particular at all, padding.`), "Ferruccio Lamborghini founded the company in 1963 after a dispute about a clutch."].join("\n");
  const out = excerpt(text, ["Ferruccio Lamborghini clutch"], 400);
  assert.ok(out.startsWith("Opening paragraph"));
  assert.ok(out.includes("dispute about a clutch"));
  assert.ok(out.length <= 400);
  assert.equal(excerpt("short", ["x"], 100), "short");
});

test("helpers: public URLs only, readable text with case kept, the corpus fits the brain's window", () => {
  for (const bad of ["http://localhost/x", "http://127.0.0.1/", "http://10.0.0.2/", "http://192.168.1.1/", "http://172.20.0.1/", "http://printer.local/", "file:///etc/passwd", "ftp://x.org/", "not a url"]) assert.equal(publicUrl(bad), false, bad);
  assert.equal(publicUrl("https://www.loc.gov/item/1/"), true);
  assert.equal(readableText("<p>Hello <b>World</b> &amp; co</p><p>Next</p>"), "Hello World & co\nNext");
  assert.equal(corpusBudget(undefined), 60_000);
  assert.equal(corpusBudget(8192), 12_000, "a tiny window still gets a minimum corpus");
  assert.ok(corpusBudget(131_072) > corpusBudget(32_768));
  assert.equal(corpusBudget(1_000_000), 150_000);
});

test("strict Wikipedia (fairness rule): 429 is retried twice with Retry-After capped at 10 s, then reported; default is one try", async () => {
  /** @type {number[]} */
  const slept = [];
  let n = 0;
  const busy = /** @type {typeof fetch} */ (async () => { n += 1; return n < 3 ? new Response("busy", { status: 429, headers: { "retry-after": "60" } }) : Response.json({ query: { search: [{ title: "Tenerife airport disaster", snippet: "x" }] } }); });
  const strict = wikipediaProvider({ fetch: busy, strict: true, sleep: async (ms) => { slept.push(ms); } });
  assert.equal((await strict.search("Tenerife", 1)).length, 1);
  assert.deepEqual(slept, [10_000, 10_000]);
  let m = 0;
  const always = /** @type {typeof fetch} */ (async () => { m += 1; return new Response("busy", { status: 429 }); });
  await assert.rejects(wikipediaProvider({ fetch: always, strict: true, sleep: async () => {} }).search("x", 1), /Wikipedia 429/);
  assert.equal(m, 3, "one try and two retries, never more");
  let d = 0;
  await assert.rejects(wikipediaProvider({ fetch: /** @type {typeof fetch} */ (async () => { d += 1; return new Response("busy", { status: 429 }); }) }).search("x", 1), /Wikipedia 429/);
  assert.equal(d, 1, "the default is unchanged: no retry");
});

test("a provider read that fails is written in the trace, not swallowed", async () => {
  const provider = { id: "p", search: async () => [{ title: "A", url: "https://example.org/a" }], read: async () => { throw new Error("Wikipedia 429"); } };
  const { docs, trace } = await gatherCorpus({ queries: ["q"], providers: [provider], fetch: /** @type {typeof fetch} */ (async () => new Response("")) });
  assert.equal(docs.length, 0);
  assert.deepEqual(trace.map((t) => t.outcome), ["ok", "read failed: Wikipedia 429"]);
});
