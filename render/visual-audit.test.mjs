import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { auditFilm, emptyStretches, parseSamples } from "./visual-audit.mjs";

let ffmpeg = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { ffmpeg = false; }

test("dark and plain stretches are found with their times; the opening and closing fades are not counted", () => {
  const text = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((t) => `frame:${t} pts:${t} pts_time:${t}\nlavfi.entropy.normalized_entropy.normal.Y=${t >= 4 && t <= 6 ? 0.57 : 0.97}\nlavfi.signalstats.YAVG=${t >= 4 && t <= 6 ? 14 : 100}`).join("\n");
  const samples = parseSamples(text);
  assert.equal(samples.length, 10);
  assert.deepEqual(emptyStretches(samples, { step: 1, total: 10, fadeIn: 0.5, fadeOut: 0.5 }).map((e) => [e.start, e.end]), [[4, 7]]);
  // A dark night sky full of stars has detail: it is not empty.
  const night = parseSamples("pts_time:3\nlavfi.entropy.normalized_entropy.normal.Y=0.85\nlavfi.signalstats.YAVG=20");
  assert.deepEqual(emptyStretches(night, { step: 1, total: 10, fadeIn: 0, fadeOut: 0 }), []);
});

test("a rendered film with a dark card in the middle is caught at the right time (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "audit-"));
  const out = join(dir, "f.mp4");
  // 4 s of a detailed moving test picture, 4 s of a dark gradient card, 4 s of the picture again.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:d=4", "-f", "lavfi", "-i", "gradients=s=320x180:c0=0x10151c:c1=0x232d3a:speed=0.01:d=4", "-f", "lavfi", "-i", "testsrc2=s=320x180:d=4",
    "-filter_complex", "[0][1][2]concat=n=3:v=1:a=0,format=yuv420p", "-r", "25", out]);
  const r = await auditFilm(out);
  assert.equal(r.ok, false);
  assert.equal(r.empty.length, 1);
  assert.ok(Math.abs(r.empty[0].start - 4) <= 0.5 && Math.abs(r.empty[0].end - 8) <= 0.5, JSON.stringify(r.empty));
});
