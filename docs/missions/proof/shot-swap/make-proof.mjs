#!/usr/bin/env node
/**
 * The proof of "My films: swap any shot with one tap" (docs/missions/NEXT_TASKS.md, E1): the built
 * landing page at the studio key screen, at a phone's width (390 px), with every API answer mocked.
 * Nothing is sent to a real studio and no film is started: the requests are answered here.
 *
 *   node docs/missions/proof/shot-swap/make-proof.mjs
 *
 * Writes 1-shots.png, 2-alternatives.png, 3-search.png and 4-remake.png next to this file.
 * The pictures are drawn by this page (public/, built by tools/), not by a real film.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../../..");
const PUBLIC = join(ROOT, "public");
const FILM = "11111111-2222-3333-4444-555555555555";
const KEY = "studio-key-for-the-proof";

/** The page's own files, served as Cloudflare serves them. */
function serve() {
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png" };
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let file = join(PUBLIC, decodeURIComponent(url.pathname));
    if (url.pathname === "/" || url.pathname === "") file = join(PUBLIC, "index.html");
    if (!existsSync(file) || !file.startsWith(PUBLIC)) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

/** A film as the studio's list shows it. */
const view = (extra = {}) => ({
  id: FILM,
  kind: "narration",
  topic: "The Mine That Ate a Mountain",
  fileName: "the-mine.mp3",
  bytes: 4_000_000,
  createdAt: "2026-11-27T09:12:00.000Z",
  status: "done",
  progress: [{ at: "2026-11-27T20:00:00.000Z", stage: "done", ok: true, message: { en: "Film ready: 18 min. Download it below.", bn: "ফিল্ম তৈরি: ১৮ মিনিট।" } }],
  film: { bytes: 210_000_000, seconds: 1080 },
  download: "/api/voice/x/film",
  swaps: 0,
  ...extra,
});

/** The film after a swap has been accepted (still rendering the changed part). */
const remadeView = () => view({
  status: "queued",
  swaps: 1,
  progress: [
    { at: "2026-11-27T20:00:00.000Z", stage: "done", ok: true, message: { en: "Film ready: 18 min. Download it below.", bn: "ok" } },
    { at: "2026-11-28T10:00:00.000Z", stage: "queued", ok: true, message: { en: "Waiting for a free film machine.", bn: "অপেক্ষায়।" } },
    { at: "2026-11-28T10:00:01.000Z", stage: "swaps", ok: true, message: { en: "Re-making the film with 1 new picture(s): only the 1 part(s) holding them are rendered again.", bn: "১টি নতুন ছবি দিয়ে ফিল্ম আবার বানানো হচ্ছে।" } },
  ],
});

const pick = (/** @type {string} */ id, /** @type {string} */ source, /** @type {string} */ licence, /** @type {string} */ slug) => ({
  id,
  source,
  licence,
  thumbnailUrl: `mock://thumbnail/${slug}`,
  mediaUrl: `https://videos.test/${slug}.mp4`,
  sourcePageUrl: `https://www.test/${slug}`,
  title: slug.replace(/-/g, " "),
});

/** The edit pack the studio keeps next to the film (engine/src/edit-pack.mjs writes this shape). */
const PACK = {
  version: 1,
  filmId: FILM,
  createdAt: "2026-11-27T20:00:00.000Z",
  seconds: 1080,
  fps: 30,
  lean: true,
  shots: [
    { id: "SC0001-1", scene: "SC0001", index: 1, start: 0, end: 9.4, words: "In 1965 a copper mine opened on a mountain of rock and ice.", pick: { ...pick("pexels:video:1", "pexels", "PEXELS", "mine-road") }, candidates: [pick("pexels:video:1", "pexels", "PEXELS", "mine-road"), pick("pixabay:image:2", "pixabay", "PIXABAY", "aerial-pit"), pick("wikimedia:file:3", "wikimedia", "CC-BY", "excavator"), pick("nasa:image:4", "nasa", "US-GOV-PD", "ridge")] },
    { id: "SC0001-2", scene: "SC0001", index: 2, start: 9.4, end: 21.2, words: "The engineer promised the tailings would stay put.", pick: { ...pick("pexels:video:5", "pexels", "PEXELS", "truck-haul") }, candidates: [pick("pexels:video:5", "pexels", "PEXELS", "truck-haul"), pick("pexels:video:6", "pexels", "PEXELS", "dam-valley"), pick("pixabay:image:7", "pixabay", "PIXABAY", "apollo-crew"), pick("pixabay:image:8", "pixabay", "PIXABAY", "rock-face")] },
    { id: "SC0002-1", scene: "SC0002", index: 1, start: 21.2, end: 35.8, words: "Apollo 11 left the pad with three men and a promise.", pick: { ...pick("pexels:video:9", "pexels", "PEXELS", "launch-pad") }, candidates: [pick("pexels:video:9", "pexels", "PEXELS", "launch-pad"), pick("nasa:image:10", "nasa", "US-GOV-PD", "saturn-v"), pick("pixabay:image:11", "pixabay", "PIXABAY", "control-room")] },
    { id: "SC0002-2", scene: "SC0002", index: 2, start: 35.8, end: 48.1, words: "What the cameras saw next changed the country.", pick: { ...pick("pixabay:image:12", "pixabay", "PIXABAY", "mining-truck") }, candidates: [pick("pixabay:image:12", "pixabay", "PIXABAY", "mining-truck"), pick("nasa:image:13", "nasa", "US-GOV-PD", "mission-control"), pick("pexels:video:14", "pexels", "PEXELS", "rocket-plume")] },
    { id: "SC0003-1", scene: "SC0003", index: 1, start: 48.1, end: 62.7, words: "Eight hundred million tonnes of rock sat above a valley.", pick: null, candidates: [pick("pexels:video:15", "pexels", "PEXELS", "valley-fog")] },
  ],
  parts: [
    { index: 1, start: 0, end: 12.4, shots: ["SC0001-1"] },
    { index: 2, start: 12.4, end: 21.2, shots: ["SC0001-2"] },
    { index: 3, start: 21.2, end: 31.9, shots: ["SC0002-1"] },
    { index: 4, start: 31.9, end: 48.1, shots: ["SC0002-2"] },
    { index: 5, start: 48.1, end: 62.7, shots: ["SC0003-1"] },
    { index: 6, start: 62.7, end: 66, shots: [] },
    { index: 7, start: 66, end: 66, shots: [] },
    { index: 8, start: 66, end: 66, shots: [] },
  ],
};

/** The archives' own stream, as /api/media/search answers it. */
function searchStream() {
  const results = [
    { id: "pexels:video:20", source: "pexels", previewUrl: "https://images.test/r1.jpg", mediaUrl: "https://videos.test/r1.mp4", licence: { licenseId: "PEXELS", name: "Pexels License" }, title: "Rocket on the pad" },
    { id: "nasa:image:21", source: "nasa", previewUrl: "https://images.test/r2.jpg", mediaUrl: "https://images.test/r2.jpg", licence: { licenseId: "US-GOV-PD", name: "Public domain (NASA)" }, title: "Apollo 11 launch" },
    { id: "wikimedia:file:22", source: "wikimedia", previewUrl: "https://images.test/r3.jpg", mediaUrl: "https://images.test/r3.jpg", licence: { licenseId: "CC-BY", name: "CC BY 4.0" }, title: "Crawler transporter" },
    { id: "pixabay:image:23", source: "pixabay", previewUrl: "https://images.test/r4.jpg", mediaUrl: "https://images.test/r4.jpg", licence: { licenseId: "PIXABAY", name: "Pixabay Content License" }, title: "Launch tower" },
    { id: "getty:image:24", source: "getty", previewUrl: "https://images.test/r5.jpg", mediaUrl: "https://images.test/r5.jpg", licence: { licenseId: "RIGHTS-MANAGED", name: "All rights reserved" }, title: "A paid picture (never offered)" },
  ];
  return [
    { type: "start", sources: [{ id: "pexels", status: "ok" }, { id: "nasa", status: "ok" }] },
    { type: "source", report: { id: "pexels", status: "ok" }, results },
    { type: "done", tookMs: 640 },
  ].map((e) => JSON.stringify(e)).join("\n") + "\n";
}

/** A thumbnail the page can actually draw (the archives' pictures are mocked, never fetched). */
function thumbnailFor(/** @type {string} */ slug) {
  const hues = { "mine-road": ["#8a6d3b", "#d8c6a1"], "aerial-pit": ["#6b5b45", "#c9b596"], excavator: ["#2f3a40", "#b9c2c6"], ridge: ["#4b3f33", "#e2d6c3"], "truck-haul": ["#5b4a37", "#ded1bb"], "dam-valley": ["#3c4a3a", "#c8d4c2"], "apollo-crew": ["#3a3f52", "#d3d7e4"], "rock-face": ["#57524a", "#d9d4cb"], "launch-pad": ["#414a55", "#dbe3ea"], "saturn-v": ["#2c3138", "#cfd8e2"], "control-room": ["#2a2f36", "#b9c4cf"], "mining-truck": ["#4a4034", "#d6c9b4"], "mission-control": ["#33383f", "#c7d0d8"], "rocket-plume": ["#5a3b26", "#f0d9b5"], "valley-fog": ["#45514b", "#d6ded9"], r1: ["#3b4250", "#cfd6e2"], r2: ["#2c3644", "#c9d5e3"], r3: ["#4a4238", "#d9d0c2"], r4: ["#3f4a3c", "#d3ddcd"] };
  const [a, b] = hues[slug] ?? ["#444", "#ccc"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><circle cx="248" cy="46" r="22" fill="#ffffff" opacity="0.35"/><path d="M0 150 L70 96 L132 138 L196 104 L320 152 L320 180 L0 180 Z" fill="#000000" opacity="0.28"/><text x="12" y="170" font-family="sans-serif" font-size="13" fill="#ffffff" opacity="0.75">${slug}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A mocked picture's address as the page asked for it. */
const respondThumb = (/** @type {string} */ url) => {
  const slug = decodeURIComponent(url.replace("mock://thumbnail/", ""));
  return { status: 200, contentType: "image/svg+xml", body: thumbnailFor(slug) };
};

async function open(/** @type {number} */ port) {
  // A container without a display or /dev/shm: the same flags Playwright's own runners use.
  const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.addInitScript((/** @type {string} */ key) => {
    try { window.localStorage.setItem("zupona:studio-key", key); } catch { /* ignore */ }
  }, KEY);
  const page = await context.newPage();
  /** Swap what the mocked requests were met with. @type {{ swapBody?: any }} */
  const seen = {};
  let swapped = false;

  await page.route("**/api/voice", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ films: [view()] }) }));
  await page.route(`**/api/voice/${FILM}/edit**`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PACK) }));
  await page.route(`**/api/voice/${FILM}/swaps`, async (route) => {
    seen.swapBody = route.request().postDataJSON();
    swapped = true;
    const remade = view({
      status: "queued",
      swaps: 1,
      film: { bytes: 210_000_000, seconds: 1080 },
      progress: [
        { at: "2026-11-27T20:00:00.000Z", stage: "done", ok: true, message: { en: "Film ready: 18 min. Download it below.", bn: "ok" } },
        { at: "2026-11-28T10:00:00.000Z", stage: "queued", ok: true, message: { en: "Waiting for a free film machine.", bn: "অপেক্ষায়।" } },
        { at: "2026-11-28T10:00:01.000Z", stage: "swaps", ok: true, message: { en: "Re-making the film with 1 new picture(s): only the 1 part(s) holding them are rendered again.", bn: "১টি নতুন ছবি দিয়ে ফিল্ম আবার বানানো হচ্ছে।" } },
      ],
    });
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify(remade) });
  });
  await page.route(`**/api/voice/${FILM}`, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(swapped ? remadeView() : view()) }));
  await page.route("**/api/media/search**", (route) => route.fulfill({ status: 200, contentType: "application/x-ndjson; charset=utf-8", body: searchStream() }));
  await page.route("mock://thumbnail/**", (route) => {
    const r = respondThumb(route.request().url());
    return route.fulfill({ status: r.status, contentType: r.contentType, body: r.body });
  });
  await page.route("https://images.test/**", (route) => route.fulfill({ status: 200, contentType: "image/svg+xml", body: thumbnailFor(route.request().url().split("/").pop()?.replace(/\..*$/, "") ?? "r1") }));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.route("https://videos.test/**", (route) => route.abort());

  page.on("pageerror", (e) => console.error("page error:", e.message));
  page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "domcontentloaded" });
  return { browser, page, seen };
}

async function main() {
  mkdirSync(HERE, { recursive: true });
  const server = await serve();
  const address = /** @type {any} */ (server).address();
  const port = typeof address === "object" && address ? address.port : 0;
  const { browser, page, seen } = await open(port);
  try {
    // The landing page, as the owner left it: the "Idea | Voiceover" switch and the brief.
    await page.getByRole("tab", { name: /Voiceover/ }).first().click();
    // The studio key is remembered, so the films load by themselves (no key dialog in the proof).
    await page.getByRole("heading", { name: "My films" }).waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(HERE, "0-my-films.png"), fullPage: true });

    // 1. The film's shots: thumbnail, time and the words heard over each one.
    await page.getByRole("button", { name: "Swap a shot" }).first().click();
    await page.getByText("Swap a shot", { exact: true }).first().waitFor();
    await page.getByText("Apollo 11 left the pad", { exact: false }).first().waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(HERE, "1-shots.png"), fullPage: true });

    // 2. One shot's six alternatives (the wrong mining truck in an Apollo film).
    await page.getByRole("button", { name: /What the cameras saw next/ }).first().click();
    await page.getByText("Six free pictures for this shot").waitFor();
    await page.screenshot({ path: join(HERE, "2-alternatives.png"), fullPage: true });

    // 3. A search in the archives for the same shot (only free-licence results are offered).
    await page.getByPlaceholder("Search the archives (free pictures only)").fill("apollo 11 launch");
    await page.getByRole("button", { name: "Search the archives for this shot" }).click();
    await page.getByText("US-GOV-PD", { exact: false }).first().waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(HERE, "3-search.png"), fullPage: true });

    // 4. Pick one, re-make the film: only the part holding this shot is rendered again.
    const searchPanel = page.locator("div.mt-2.grid.grid-cols-3").last();
    await searchPanel.getByRole("button").first().click();
    await page.getByRole("button", { name: /Re-make film \(1\)/ }).click();
    await page.getByText(/Re-making the film with 1 new picture/).first().waitFor({ timeout: 10_000 });
    await page.screenshot({ path: join(HERE, "4-remake.png"), fullPage: true });
    console.log(`sent: ${JSON.stringify(seen.swapBody)}`);
    await page.screenshot({ path: join(HERE, "4-remake.png"), fullPage: true });
    console.log(`sent: ${JSON.stringify(seen.swapBody)}`);
  } finally {
    await browser.close();
    /** @type {any} */ (server).close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
