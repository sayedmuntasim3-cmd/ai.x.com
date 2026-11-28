import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepsQuality, parseSsim, ssimOf, SSIM_LIMIT } from "./ssim.mjs";

const FFMPEG = process.env.FFMPEG ?? "ffmpeg";

/** Is there an ffmpeg to measure with? (The CI runners and the studio have one; a bare box may not.) */
function hasFfmpeg() {
  const r = spawnSync(FFMPEG, ["-version"], { stdio: "ignore" });
  return r.status === 0;
}

test("ssim: the figure is read from ffmpeg's line, strictly", () => {
  assert.equal(parseSsim("[Parsed_ssim_0 @ 0x1] SSIM Y:0.99 U:0.98 V:0.97 All:0.987654 (12.345678)"), 0.987654);
  assert.equal(parseSsim("All:1.000000"), 1);
  assert.equal(parseSsim("no figure here"), null);
  assert.equal(parseSsim(""), null);
  assert.equal(SSIM_LIMIT, 0.98);
});

test("ssim: the same picture is 1; a changed picture is measured and called visible", { skip: !hasFfmpeg() && "ffmpeg is not installed here" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ssim-"));
  try {
    const a = join(dir, "a.mp4");
    const b = join(dir, "b.mp4");
    // Two seconds of a moving pattern, and the same at a much lower quality with a colour shift.
    execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", a]);
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", a, "-vf", "eq=brightness=0.25:saturation=0.3", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "45", "-pix_fmt", "yuv420p", b]);
    const same = await keepsQuality(a, a);
    assert.equal(same.ssim, 1);
    assert.equal(same.ok, true);
    const changed = await keepsQuality(a, b);
    assert.ok(changed.ssim !== null && changed.ssim < SSIM_LIMIT, `measured ${changed.ssim}`);
    assert.equal(changed.ok, false);
    assert.equal(await ssimOf(a, join(dir, "missing.mp4")), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ssim: a re-encode at the studio's own settings is invisible (>= 0.98)", { skip: !hasFfmpeg() && "ffmpeg is not installed here" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "ssim-"));
  try {
    const src = join(dir, "src.mp4");
    const out = join(dir, "out.mp4");
    // The studio's encoder line (render/render-film.mjs), applied to a source clip.
    execFileSync(FFMPEG, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=25:d=2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", src]);
    execFileSync(FFMPEG, ["-v", "error", "-y", "-i", src, "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-maxrate", "1500k", "-bufsize", "3000k", "-pix_fmt", "yuv420p", out]);
    const { ssim, ok } = await keepsQuality(src, out);
    assert.ok(ok, `SSIM ${ssim}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
