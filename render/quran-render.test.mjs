import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { FORMATS, ayahOnScreen, clipArgs, filmText, finalArgs, joinPlan, moveFilter } from "./quran-render.mjs";
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
