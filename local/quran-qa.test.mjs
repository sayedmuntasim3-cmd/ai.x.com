import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { degrade, qaTable } from "./quran-qa.mjs";
import { hasFfmpeg } from "./voice-film.mjs";

const ffmpeg = await hasFfmpeg();

test("the QA table shows the decision, the timing and the errors against the truth", () => {
  const md = qaTable([{ label: "phone-yusuf40-given", l: { seconds: 780.2, decision: "accept", passages: [{ surah: 12, fromAyah: 1, toAyah: 40 }], timing: "estimated", ayat: new Array(40), truth: { within200ms: 76, boundaries: 78, cutsInGap: 39, cuts: 39, medianSeconds: 0.01, worstSeconds: 0.32 }, recognition: null } },
    { label: "real-heard", l: { seconds: 146, decision: "ask", question: { code: "quran.ask.passage" }, passages: [], ayat: [], truth: null, recognition: { coverage: 0, quality: 0 } } }]);
  assert.match(md, /\| phone-yusuf40-given \| 780 \| accept \| 12:1-40 \| estimated \| 40 \| 76\/78 \| 39\/39 \| 0\.01 \/ 0\.32 \|/);
  assert.match(md, /\| real-heard \| 146 \| ask \(quran\.ask\.passage\) \|/);
});

test("a degraded copy keeps the length, so the clean copy's truth still holds (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "quran-qa-"));
  const src = join(dir, "v.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=300:duration=6", src]);
  for (const [kind, ext] of [["phone", "mp3"], ["mosque", "wav"]]) {
    const out = await degrade(/** @type {any} */ (kind), src, join(dir, `x.${ext}`));
    const seconds = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString());
    // Only the end may grow (MP3 frames, the echo tail); the start is not moved, so ayah times hold.
    assert.ok(seconds >= 5.95 && seconds < 6.5, `${kind}: ${seconds}`);
  }
  await assert.rejects(degrade(/** @type {any} */ ("radio"), src, join(dir, "y.wav")), /phone or mosque/);
});
