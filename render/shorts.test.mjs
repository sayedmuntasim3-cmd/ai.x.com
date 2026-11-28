import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { captionsAss, findFont, quranAss, renderShort, SHORTS, shortFilter } from "./shorts.mjs";
import { run } from "./render-film.mjs";

/** ffmpeg and ffprobe on this machine? */
function hasFfmpeg() {
  try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); execFileSync("ffprobe", ["-version"], { stdio: "ignore" }); return true; } catch { return false; }
}

const WORDS = [
  { text: "In", start: 0.2, end: 0.4 }, { text: "1974", start: 0.45, end: 0.9 }, { text: "the", start: 0.95, end: 1.1 },
  { text: "dam", start: 1.15, end: 1.4 }, { text: "cracked.", start: 1.45, end: 1.9 }, { text: "Why", start: 2.2, end: 2.5 },
  { text: "did", start: 2.55, end: 2.7 }, { text: "nobody", start: 2.75, end: 3.1 }, { text: "listen?", start: 3.15, end: 3.6 },
];

test("a Short is turned upright, captioned, hooked and closed", () => {
  const crop = shortFilter({ mode: "crop", seconds: 40, ass: "/tmp/x.ass", hookFile: "/tmp/x.hook.txt", fontFile: "/tmp/font.ttf" });
  assert.match(crop, /crop=/);
  assert.doesNotMatch(crop, /gblur/, "a centre crop does not blur a fill behind the frame");
  const blurred = shortFilter({ mode: "blurred", seconds: 40, ass: "/tmp/x.ass" });
  assert.match(blurred, /gblur=sigma=28/);
  assert.match(blurred, /overlay=\(W-w\)\/2:\(H-h\)\/2/);
  assert.match(blurred, /subtitles='\/tmp\/x\.ass'/);
  // The hook is on screen for the first two seconds only, the closing line for the last two.
  assert.match(crop, /enable='lt\(t,2\)'/);
  assert.match(crop, /Full film on the channel/);
  assert.match(crop, /enable='gte\(t,38\)'/);
  assert.match(shortFilter({ mode: "crop", seconds: 10, fontFile: "/tmp/font.ttf" }), /gte\(t,8\)/);
  assert.equal(SHORTS.width, 1080);
  assert.equal(SHORTS.height, 1920);
});

test("captions are 2 to 4 words at a time, the word being said lit up, in the lower-middle", () => {
  const ass = captionsAss(WORDS, { start: 0 });
  assert.match(ass, /PlayResX: 1080/);
  assert.match(ass, /PlayResY: 1920/);
  assert.match(ass, /Style: Cap,Inter,\d+,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1/);
  assert.match(ass, /,\d+,1$/m, "MarginV is the last style field");
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  assert.ok(events.length > 0);
  for (const e of events) {
    const words = e.split(",,").at(-1).replace(/\{[^}]*\}/g, "").split(" ").filter(Boolean);
    assert.ok(words.length >= 2 && words.length <= 4, `a caption of ${words.length} words: ${e}`);
  }
  assert.match(ass, /\\c&H0000D7FF&/, "the current word is highlighted");
  // Times start at zero: a Short's clock begins with the Short.
  assert.match(events[0], /Dialogue: 0,0:00:00\.\d\d/);
  const margin = Number(/(\d+),1$/.exec(ass.split("\n").find((l) => l.startsWith("Style: Cap,")) ?? "")?.[1]);
  assert.ok(margin > 1920 * 0.2 && margin < 1920 * 0.32, `the caption band sits in the lower-middle safe area, not on the edge (${margin})`);
});

test("a recitation shows the Arabic ayah and its Pickthall line, never chopped words", () => {
  const arabic = "وَٱلضُّحَىٰ";
  const english = "By the morning hours";
  const ass = quranAss([
    { surah: 93, ayah: 1, start: 0.5, end: 3.2, arabic, english },
    { surah: 93, ayah: 2, start: 3.4, end: 6, arabic: "وَٱلَّيْلِ إِذَا سَجَىٰ", english: "And by the night when it is stillest," },
  ], { width: 1080, height: 1920 });
  const events = ass.split("\n").filter((l) => l.startsWith("Dialogue:"));
  assert.equal(events.length, 4, "one Arabic line and one English line per ayah");
  assert.ok(ass.includes(arabic), "the ayah is the shipped text, verbatim");
  assert.match(ass, /\uFD3F١\uFD3E/, "the ayah number is in ornate brackets");
  assert.ok(events.some((e) => e.includes(english)));
  assert.ok(events.some((e) => e.includes("And by the night when it is stillest,")));
  assert.match(ass, /Style: Ayah,Amiri Quran/);
  assert.match(ass, /Dialogue: 0,0:00:00\.50,0:00:03\.20,Ayah/);
  // No word captions: the Quran's words are not chopped into 2-4 word lines.
  assert.equal(ass.split("\n").filter((l) => l.startsWith("Dialogue:") && l.includes("Cap,")).length, 0);
});

test("one 10-second Short is rendered 1080×1920, at -14 LUFS and no louder than -1 dBTP", async (t) => {
  if (!hasFfmpeg()) return t.skip("ffmpeg is not installed");
  const dir = mkdtempSync(join(tmpdir(), "shorts-"));
  try {
    const film = join(dir, "film.mp4");
    execFileSync("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30:duration=10",
      "-f", "lavfi", "-i", "sine=frequency=220:sample_rate=48000:duration=10",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", film,
    ]);
    const ass = join(dir, "short-1.ass");
    writeFileSync(ass, captionsAss(WORDS, { start: 0 }));
    const fontFile = findFont();
    const out = join(dir, "short-1.mp4");
    const r = await renderShort({
      film, start: 0, end: 10, out, id: "short-1", hook: "In 1974 the dam cracked",
      mode: "blurred", ass, workDir: dir, fontFile, fontDir: fontFile ? dirname(fontFile) : undefined,
    });
    assert.ok(existsSync(out));
    const [w, h] = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", out]).toString().trim().split("x").map(Number);
    assert.equal(w, 1080);
    assert.equal(h, 1920);
    const seconds = Number(await run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", out]));
    assert.ok(seconds > 9.4 && seconds < 10.6, `the Short is ${seconds} s, the stretch was 10 s`);
    assert.ok(r.lufs !== null && Math.abs(r.lufs + 14) <= 1, `loudness ${r.lufs} LUFS`);
    assert.ok(r.peak !== null && r.peak <= -1, `true peak ${r.peak} dBTP`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
