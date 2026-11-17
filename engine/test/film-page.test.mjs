import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { inline, loadFilmPage, markdown, PAGE_CSP, renderFilmPage, renderScriptPage } from "../src/film-page.mjs";

const USA = new URL("../../productions/ramesh-babu/USA/", import.meta.url);
/** The finished USA film as a run's store, plus a run.json. */
function usaStore() {
  const m = new Map(readdirSync(USA).map((f) => [f, readFileSync(new URL(f, USA), "utf8")]));
  m.set("run.json", JSON.stringify({ film: { topic: "Ramesh Babu", durationSeconds: 2700, versionId: "en-US" }, status: "done", costUsd: 7.4, gaps: [], stages: { s01: { status: "done" } } }));
  return { m, get: async (/** @type {string} */ k) => m.get(k) ?? null };
}

test("model text can never inject markup, scripts or non-http links", () => {
  const evil = `<script>alert(1)</script> <img src=x onerror=alert(1)> [x](javascript:alert(1)) "quoted" **bold** https://example.org/a?b=1&c=2.`;
  const html = inline(evil);
  assert.ok(!/<script|<img|href="javascript/i.test(html), html);
  assert.ok(html.includes("&lt;img src=x onerror=alert(1)&gt;"), "raw HTML is shown as text");
  assert.ok(html.includes('<a href="https://example.org/a?b=1&amp;c=2"'), "bare URLs link, with the trailing full stop left out");
  assert.ok(html.includes("<strong>bold</strong>"));
  const block = markdown("# Title\n\n| a | b |\n|---|---|\n| <b>1</b> | `x<y` |\n\n- one\n- two\n\n```\n<script>\n```");
  assert.ok(block.includes("<h3>Title</h3>"), "headings sit below the page's own h1 and h2");
  assert.ok(block.includes("<th>a</th>") && block.includes("<td>&lt;b&gt;1&lt;/b&gt;</td>") && block.includes("<code>x&lt;y</code>"));
  assert.ok(block.includes("<ul><li>one</li><li>two</li></ul>") && block.includes("<pre><code>&lt;script&gt;</code></pre>"));
  assert.match(PAGE_CSP, /default-src 'none'/);
  assert.doesNotMatch(PAGE_CSP, /script-src/, "the page may run no script: it shares an origin with the studio token");
});

test("the USA film renders every scene, with each shot's clip and licence or the reason it has none", async () => {
  const store = usaStore();
  const plan = JSON.parse(store.m.get("s3-chapters.json"));
  store.m.set("media-C1.json", JSON.stringify({ chapter: "C1", providers: ["pexels"], repeatWindowSeconds: 600, stats: { shots: 2, found: 1, missing: 1, noQuery: 0 }, shots: [
    { scene: "SC0001", shot: 1, start: 0, end: 3, rung: "R3", description: "", queries: ["razor"], status: "found", query: "razor", alternates: ["pexels:video:2"], trace: [], pick: { id: "pexels:video:1", source: "pexels", mediaUrl: "https://videos.pexels.com/1.mp4", previewUrl: "javascript:alert(1)", sourcePageUrl: "https://www.pexels.com/video/razor-1/", creator: "Ana <i>", durationSeconds: 9, width: 1920, height: 1080, licence: { licenseId: "PEXELS", name: "Pexels License", licenseUrl: null, attributionRequired: false, creator: "Ana", sourcePageUrl: "https://www.pexels.com/video/razor-1/" } } },
    { scene: "SC0001", shot: 2, start: 3, end: 5, rung: "R3", description: "", queries: ["luxury car emblem macro"], status: "missing", query: null, alternates: [], trace: [], pick: null },
  ] }));
  store.m.set("research.json", JSON.stringify({ facts: [{ id: "F01", claim: "c", value: "v", sources: ["https://www.thehindu.com/a", "javascript:alert(1)"], confidence: "high", conflict: "Reports differ." }], unknowns: [] }));
  const data = await loadFilmPage(store);
  assert.ok(data);
  const html = renderFilmPage(data);
  assert.equal((html.match(/<article class="scene" id="SC\d{4}">/g) ?? []).length, 270);
  assert.equal(data.chapters.length, plan.length);
  assert.ok(html.includes("Pexels License") && html.includes("by Ana &lt;i&gt;") && html.includes("query “razor”"));
  assert.ok(html.includes("no free clip yet") && html.includes("searched “luxury car emblem macro”"));
  assert.ok(html.includes("graphic, built in the edit"), "R1 shots are graphics, not searched");
  assert.ok(html.includes('href="https://www.thehindu.com/a"') && html.includes("Sources differ: Reports differ."));
  assert.ok(!/javascript:/i.test(html), "unsafe URLs are dropped, not linked");
  assert.ok(html.includes('id="credits"') && html.includes("pexels.com/video/razor-1/"));
  assert.ok(html.includes("1/2") && html.includes("$7.40"));
  assert.ok(!html.includes("Video render:"), "no render line before a render is started");
  store.m.set("render.json", JSON.stringify({ ok: true, actionsUrl: "https://github.com/o/r/actions/workflows/render-film.yml", at: "2026-11-04T03:10:00.000Z" }));
  const withRender = renderFilmPage(/** @type {any} */ (await loadFilmPage(store)));
  assert.ok(withRender.includes("started on GitHub (2026-11-04 03:10 UTC)") && withRender.includes('href="https://github.com/o/r/actions/workflows/render-film.yml"'));
});

test("a run that has only started still gets a page; an unknown run gets none", async () => {
  assert.equal(await loadFilmPage({ get: async () => null }), null);
  const queued = await loadFilmPage({ get: async (k) => (k === "film.json" ? JSON.stringify({ topic: "The Suez Canal", durationSeconds: 600, versionId: "en-US" }) : null) });
  assert.ok(queued);
  const html = renderFilmPage(queued);
  assert.ok(html.includes("The Suez Canal") && html.includes("No chapter written yet.") && html.includes("Queued"));
});

test("the narration script lists every narrated scene with its file name, slot and word count", async () => {
  const store = usaStore();
  const s5 = String(store.m.get("s5-C1.md")).replace(/(\*\*SC0002\*\*[^\n]*?NARR: )/, "$1<b>It cost [C12 low] dollars.</b> ");
  store.m.set("s5-C1.md", s5);
  const html = renderScriptPage(/** @type {any} */ (await loadFilmPage(store)));
  assert.equal((html.match(/<article class="line/g) ?? []).length, 248, "every narrated scene, no wordless one");
  assert.ok(html.includes('<article class="line" id="SC0001"><p class="meta"><b>SC0001</b> · C1 · 0:00:00–0:00:08 · 8 s · 18 words</p>'));
  assert.ok(html.includes('<article class="line pending" id="SC0002">') && html.includes("do not record"), "a scene with an unresolved number is marked");
  assert.ok(html.includes("&lt;b&gt;It cost") && !html.includes("<b>It cost"), "narration is escaped");
  assert.ok(renderFilmPage(/** @type {any} */ (await loadFilmPage(store))).includes('<a href="script">'), "the film page links to it");
});
