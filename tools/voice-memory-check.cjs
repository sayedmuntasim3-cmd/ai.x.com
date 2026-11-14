#!/usr/bin/env node
// Measures how much memory the studio's voice check really uses on long
// recordings, in a real browser, so "phones do not crash" is a measurement
// and not a promise. Needs ffmpeg and Playwright's Chromium (preinstalled in
// the cloud sessions; elsewhere: npx playwright install chromium).
//
//   node tools/voice-memory-check.cjs [minutes=10]
//
// For each case it prints the browser's peak resident memory over its
// baseline (all Chromium processes, so the Web Worker is included), the
// result and any page error. deviceMemory is what the page is told the
// device has (navigator.deviceMemory), which sets its decoding budget.
// It runs desktop Chromium, not an Android phone: the numbers show the
// page's own use, not a given phone's limit.
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, execSync } = require("node:child_process");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..", "public");
const minutes = Number(process.argv[2] ?? 10);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zupona-voice-"));
const seconds = String(Math.round(minutes * 60));
const ff = (...args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args]);
ff("-f", "lavfi", "-i", `sine=frequency=220:sample_rate=48000:duration=${seconds}`, "-f", "lavfi", "-i", `anoisesrc=color=pink:amplitude=0.02:sample_rate=48000:duration=${seconds}`,
  "-filter_complex", "[0][1]amix=inputs=2:normalize=0,volume='if(lt(mod(t,6),4),0.6,0.05)':eval=frame,aformat=channel_layouts=stereo", "-c:a", "pcm_s16le", path.join(dir, "voice.wav"));
ff("-i", path.join(dir, "voice.wav"), "-c:a", "libmp3lame", "-b:a", "128k", path.join(dir, "voice.mp3"));
ff("-i", path.join(dir, "voice.wav"), "-c:a", "aac", "-b:a", "96k", path.join(dir, "voice.m4a"));

const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) { res.writeHead(404); return res.end("{}"); }
  let p = path.join(root, decodeURIComponent(u.pathname));
  if (p.endsWith(path.sep) || p.endsWith("/")) p = path.join(p, "index.html");
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
const rssMb = () => {
  try {
    return Math.round(execSync("ps -eo rss=,args=").toString().split("\n").filter((l) => /pw-browsers|chrom|headless_shell/i.test(l) && !/node /.test(l)).reduce((a, l) => a + Number(l.trim().split(/\s+/)[0]), 0) / 1024);
  } catch {
    return NaN;
  }
};

async function check(browser, port, file, deviceMemory) {
  const ctx = await browser.newContext();
  await ctx.addInitScript((gb) => Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => gb }), deviceMemory);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/studio/`, { waitUntil: "networkidle" });
  await page.click("[data-lang=en]").catch(() => {});
  const before = rssMb();
  let peak = before;
  const timer = setInterval(() => { peak = Math.max(peak, rssMb()); }, 150);
  await page.setInputFiles("#file", file);
  await page.waitForFunction(() => {
    const s = document.querySelector("#voice-status")?.textContent || "";
    const e = document.querySelector("#voice-error");
    return s.includes("✓") || (e && !e.hidden);
  }, null, { timeout: 600000 });
  clearInterval(timer);
  const status = (await page.textContent("#voice-status")) || (await page.$eval("#voice-error", (e) => e.textContent));
  await ctx.close();
  return `${path.basename(file).padEnd(10)} device ${String(deviceMemory).padStart(3)} GB  +${String(peak - before).padStart(4)} MB peak  ${status.slice(0, 110)}${errors.length ? `  PAGE ERRORS: ${errors.join("; ")}` : ""}`;
}

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  try {
    console.log(`${minutes}-minute recordings: WAV ${Math.round(fs.statSync(path.join(dir, "voice.wav")).size / 1048576)} MB`);
    for (const [name, gb] of [["voice.wav", 2], ["voice.mp3", 0.5], ["voice.mp3", 8], ["voice.m4a", 0.5], ["voice.m4a", 8]]) console.log(await check(browser, port, path.join(dir, name), gb));
  } finally {
    await browser.close();
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
