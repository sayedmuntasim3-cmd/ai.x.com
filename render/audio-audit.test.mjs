import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { addedSilences, auditAudio, bestLag, silences } from "./audio-audit.mjs";

let ffmpeg = true;
try { execFileSync("ffmpeg", ["-version"], { stdio: "ignore" }); } catch { ffmpeg = false; }

test("silences, added silences and the offset between two envelopes", () => {
  const env = new Float32Array(500).fill(-20);
  env.fill(-90, 100, 160);
  assert.deepEqual(silences(env), [{ start: 1, end: 1.6 }]);
  assert.deepEqual(addedSilences([{ start: 1, end: 1.6 }, { start: 3, end: 3.5 }], [{ start: 0.95, end: 1.62 }]), [{ start: 3, end: 3.5 }]);
  const a = new Float32Array(1000).map((_, i) => (Math.sin(i / 7) > 0.3 ? -10 : -60));
  const b = new Float32Array(1000).map((_, i) => a[Math.max(0, i - 12)]);
  assert.equal(bestLag(a, b), 12);
});

test("a film whose sound has a gap cut into it, or is late, fails the audit (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "audio-audit-"));
  const voice = join(dir, "voice.wav"), good = join(dir, "good.mp4"), gap = join(dir, "gap.mp4");
  // A voice-like signal: a tone that comes and goes every half second, with one real pause at 3-3.6 s.
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=220:d=8", "-af", "volume='if(between(t,3,3.6),0,0.5+0.4*sin(2*PI*2*t))':eval=frame", "-ac", "2", voice]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=160x90:d=8", "-i", voice, "-shortest", "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k", good]);
  // The same, with 1 s of silence put over 5-6 s (an edit that cut the voice).
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", good, "-c:v", "copy", "-af", "volume='if(between(t,5,6),0,1)':eval=frame", "-c:a", "aac", "-b:a", "192k", gap]);
  const ok = await auditAudio(good, voice);
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.offsetSeconds, 0);
  const bad = await auditAudio(gap, voice);
  assert.equal(bad.ok, false);
  assert.equal(bad.addedSilences.length, 1);
  assert.ok(Math.abs(bad.addedSilences[0].start - 5) < 0.1);
});
