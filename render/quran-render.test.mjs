import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { FORMATS, ayahFontSize, ayahOnScreen, clipArgs, fetchAsset, filmText, finalArgs, joinPlan, moveFilter } from "./quran-render.mjs";
import { ayahOffset, parseTanzilText } from "../engine/src/quran-meaning.mjs";

const data = new URL("../engine/data/quran/", import.meta.url);
const uthmani = parseTanzilText(readFileSync(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8")).ayat;
const surahNames = JSON.parse(readFileSync(new URL("surah-names.json", data), "utf8"));
let ffmpeg = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { ffmpeg = false; }

const shots = [
  { start: 0, end: 6, transitionIn: { type: "fade-from-black", seconds: 2 }, move: "slow push in" },
  { start: 6, end: 15, transitionIn: { type: "dissolve", seconds: 1.2 }, move: "slow drift left" },
  { start: 15, end: 18, transitionIn: { type: "dissolve", seconds: 1.6 }, move: "slow pull out" },
];

test("dissolves are centred on the cuts and the film is exactly as long as the voice", () => {
  const segs = joinPlan(shots, 20);
  assert.deepEqual(segs.map((s) => s.dissolveIn), [0, 1.2, 1.6]);
  assert.deepEqual(segs.map((s) => s.offset), [0, 5.4, 14.2], "each dissolve starts half its length before the cut");
  assert.deepEqual(segs.map((s) => s.from), [0, 5.4, 14.2]);
  // A dissolve never takes more than a third of a short shot.
  assert.equal(joinPlan([shots[0], { ...shots[1], end: 7.5 }, { ...shots[2], start: 7.5 }], 20)[1].dissolveIn, 0.5);
  assert.equal(segs[2].end, 20, "the last shot holds to the end of the voice (the tail)");
  const shown = segs.reduce((n, s) => n + s.length, 0) - segs.reduce((n, s) => n + s.dissolveIn, 0);
  assert.ok(Math.abs(shown - 20) < 1e-9);
});

test("moves are slow, eased and grow with the length of the shot", () => {
  const f = FORMATS["1080p"];
  assert.match(moveFilter("slow push in", 10, f), /eval=frame/);
  assert.match(moveFilter("slow push in", 10, f), /1\+0\.075\*/);
  assert.match(moveFilter("slow push in", 200, f), /1\+0\.14\*/, "at most 14%");
  assert.match(moveFilter("slow drift left", 10, f), /crop=1920:1080:x='\(in_w-1920\)\*\(1-/);
  const a = clipArgs({ length: 8 }, { move: "aerial glide" }, null, f, "/tmp/x.mp4");
  assert.ok(a.join(" ").includes("gradients="), "a shot without an asset is a slow moving dark card");
  const v = clipArgs({ length: 8 }, { move: "slow push in" }, { kind: "video", url: "https://x/v.webm", seconds: 120 }, f, "/tmp/x.mp4");
  assert.equal(v[v.indexOf("-ss") + 1], "12", "a video starts a tenth in");
});

test("the Arabic on screen is the verified text; the basmala written before ayah 1 is not shown as part of it", () => {
  const line = uthmani[ayahOffset(95, 1)];
  assert.match(line.replace(/[\u064B-\u065F]/g, ""), /^بسم /, "Tanzil writes it before 95:1 (here with a shadda on the ba)");
  const fig = ayahOnScreen(line, 95, 1);
  assert.equal(fig, line.split(/\s+/).slice(4).join(" "), "the four words of the basmala are taken off, nothing else");
  assert.ok(line.endsWith(fig), "what is shown is a verbatim part of the Tanzil line");
  assert.equal(ayahOnScreen(uthmani[0], 1, 1), uthmani[0], "in Al-Fatiha the basmala is ayah 1");
  const plan = { scenes: [{ kind: "ayah", surah: 95, ayah: 1, start: 0, end: 5, spokenStart: 0.5, spokenEnd: 4.5 }, { kind: "ayah", surah: 95, ayah: 2, start: 5, end: 9, spokenStart: 5.4, spokenEnd: 8.6 }] };
  const ass = filmText(plan, uthmani, surahNames, { format: FORMATS["1080p"], total: 10, reciter: "the owner" });
  assert.match(ass, /Style: Ayah,Amiri Quran,70,.*,-1$/m, "automatic text direction for Arabic");
  assert.ok(ass.includes(`${fig} ﴿١﴾`));
  assert.match(ass, /سورة التين/, "a recording without a title scene gets the surah's name over its first seconds");
  assert.match(ass, /Recited by the owner/);
  assert.match(ass, /Quran text: Tanzil\.net/);
  assert.match(ass, /Dialogue: 0,0:00:00\.50,0:00:04\.90,Ayah/);
  assert.doesNotMatch(filmText(plan, uthmani, surahNames, { format: FORMATS["1080p"], total: 10, showAyat: false }), /,Ayah,/);
  // An ayah whose end (or the end before it) is not confirmed is not written on screen.
  const unsure = { scenes: [{ ...plan.scenes[0], endSure: false }, plan.scenes[1]] };
  const t = filmText(unsure, uthmani, surahNames, { format: FORMATS["1080p"], total: 10 });
  assert.equal((t.match(/,Ayah,/g) ?? []).length, 0);
  assert.match(t, /2 ayah text\(s\) not shown/);
});

test("the final pass: one xfade per cut, fade in and out, the recitation as the only sound", () => {
  const segs = joinPlan(shots, 20);
  const a = finalArgs(segs, ["a.mp4", "b.mp4", "c.mp4"], { audio: "voice.wav", ass: "/t/text.ass", total: 20, out: "film.mp4", format: FORMATS["1080p"] });
  const graph = a[a.indexOf("-filter_complex") + 1];
  assert.equal((graph.match(/xfade=transition=fade/g) ?? []).length, 2);
  assert.match(graph, /xfade=transition=fade:duration=1\.2:offset=5\.4/);
  assert.match(graph, /fade=t=in:st=0:d=2,fade=t=out:st=17:d=3,ass=/);
  assert.deepEqual(a.slice(a.indexOf("-map"), a.indexOf("-map") + 4), ["-map", "[v]", "-map", "3:a:0"]);
  assert.ok(!a.join(" ").match(/amix|atempo|asetrate|rubberband/), "nothing is mixed under or done to the voice");
  assert.equal(a[a.indexOf("-t") + 1], "20");
});

test("a short film renders: length of the voice, no frozen card, Arabic drawn (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const { run } = await import("./render-film.mjs");
  const dir = mkdtempSync(join(tmpdir(), "quran-render-"));
  const f = { ...FORMATS["1080p"], width: 640, height: 360, fontSize: 30, titleSize: 50, margin: 20 };
  const segs = joinPlan(shots, 20);
  const clips = [];
  for (const s of segs) { const c = join(dir, `c${s.index}.mp4`); await run("ffmpeg", clipArgs(s, shots[s.index], null, f, c)); clips.push(c); }
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=20", "-ac", "2", join(dir, "voice.wav")]);
  const plan = { scenes: [{ kind: "ayah", surah: 95, ayah: 1, start: 0, end: 6, spokenStart: 0.5, spokenEnd: 5.5 }, { kind: "ayah", surah: 95, ayah: 2, start: 6, end: 20, spokenStart: 6.5, spokenEnd: 14 }] };
  const assFile = join(dir, "t.ass");
  (await import("node:fs")).writeFileSync(assFile, filmText(plan, uthmani, surahNames, { format: f, total: 20 }));
  const out = join(dir, "film.mp4");
  await run("ffmpeg", finalArgs(segs, clips, { audio: join(dir, "voice.wav"), ass: assFile, total: 20, out, format: f }));
  assert.ok(existsSync(out));
  const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
  assert.ok(Math.abs(seconds - 20) < 0.1, String(seconds));
  const frozen = String(spawnSync("ffmpeg", ["-nostats", "-hide_banner", "-i", out, "-vf", "freezedetect=n=-60dB:d=3", "-an", "-f", "null", "-"]).stderr);
  assert.doesNotMatch(frozen, /freeze_start/);
});

test("an asset is fetched once with a named client, retried after 429 and server errors, and reused; a refusal is not retried", async () => {
  const { createServer } = await import("node:http");
  let hits = 0;
  /** @type {string[]} */
  const agents = [];
  const server = createServer((req, res) => {
    hits += 1;
    agents.push(String(req.headers["user-agent"]));
    if (req.url === "/gone.jpg") { res.writeHead(404); res.end(); return; }
    if (hits === 1) { res.writeHead(429, { "retry-after": "1" }); res.end(); return; }
    if (hits === 2) { res.writeHead(503); res.end(); return; }
    res.writeHead(200, { "content-type": "image/jpeg" }); res.end("JPEGDATA");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(null)));
  const port = /** @type {any} */ (server.address()).port;
  const folder = mkdtempSync(join(tmpdir(), "assets-"));
  /** @type {number[]} */
  const waits = [];
  const wait = async (/** @type {number} */ ms) => { waits.push(ms); };
  try {
    const file = await fetchAsset(`http://127.0.0.1:${port}/a/photo.jpg`, folder, { wait });
    assert.equal(readFileSync(file, "utf8"), "JPEGDATA");
    assert.match(file, /\.jpg$/);
    assert.deepEqual(waits, [1000, 10000]);
    assert.ok(agents.every((a) => a.startsWith("ZuponaStudio/")));
    // Reused: no new request.
    assert.equal(await fetchAsset(`http://127.0.0.1:${port}/a/photo.jpg`, folder, { wait }), file);
    assert.equal(hits, 3);
    await assert.rejects(fetchAsset(`http://127.0.0.1:${port}/gone.jpg`, folder, { wait }), /404/);
    assert.equal(hits, 4);
    // A local file is used as it is.
    assert.equal(await fetchAsset("/tmp/x.jpg", folder), "/tmp/x.jpg");
  } finally { server.close(); }
});

test("the Arabic is written large for a short ayah and smaller for a long one, within three lines and never below the smallest size", () => {
  const short = ayahOnScreen(uthmani[ayahOffset(67, 1)], 67, 1);
  const kursi = uthmani[ayahOffset(2, 255)];
  const debt = uthmani[ayahOffset(2, 282)];
  for (const f of Object.values(FORMATS)) {
    assert.equal(ayahFontSize(short, f).size, f.maxFontSize);
    const k = ayahFontSize(kursi, f);
    assert.ok(k.size <= f.maxFontSize && k.size >= f.fontSize);
    // The longest ayah of the Quran stays at the smallest size and wraps.
    const d = ayahFontSize(debt, f);
    assert.equal(d.size, f.fontSize);
    assert.ok(d.lines > 3);
  }
  // The size is written into the ayah's line of the subtitles.
  const ass = filmText({ scenes: [{ kind: "title", surah: 67, ayah: null, start: 0, end: 2 }, { kind: "ayah", surah: 67, ayah: 1, start: 2, end: 9, spokenStart: 2, spokenEnd: 9, endSure: true }] }, uthmani, [], { format: FORMATS["1080p"], total: 20 });
  assert.match(ass, /\\fs112\}تَبَٰرَكَ/);
});
