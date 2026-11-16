import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { joinAyat, locate, summaryLine } from "./quran-locate.mjs";
import { hasFfmpeg, loadQuran } from "./voice-film.mjs";
import { passageUnits } from "../engine/src/quran-locate.mjs";
import { encodeWav16 } from "../engine/src/wav.mjs";
import { testVoice } from "../engine/src/voice-test-signal.mjs";

const ffmpeg = await hasFfmpeg();

test("single-ayah files are joined with known times, then located from the given surah alone (ffmpeg)", { skip: !ffmpeg && "ffmpeg not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "quran-locate-"));
  const parts = join(dir, "parts");
  mkdirSync(parts);
  const { index } = await loadQuran();
  // One file per ayah of Ad-Duha: a voice-shaped test signal as long as the ayah's letters say, with silence around it.
  passageUnits(index, [{ surah: 93, fromAyah: 1, toAyah: 11 }]).forEach((u, k) => {
    const voiced = u.weight * 0.22;
    const x = testVoice({ sampleRate: 16000, seconds: voiced + 1, seed: k + 1, noiseDb: -75, phrases: [{ start: 0.4, end: 0.4 + voiced, held: false }] });
    writeFileSync(join(parts, String(k + 1).padStart(3, "0") + ".wav"), Buffer.from(encodeWav16([x], 16000)));
  });
  const joined = await joinAyat({ folder: parts, given: { surah: "93" }, out: join(dir, "set"), gap: 0.7 });
  assert.equal(joined.ayat, 11);
  const truth = JSON.parse(readFileSync(joined.truth, "utf8"));
  assert.equal(truth.ayat.length, 11);
  const r = await locate({ audio: joined.audio, out: join(dir, "run"), given: { surah: "Ad-Dhuhaa" }, opening: "none", closing: "none", truth: joined.truth });
  assert.equal(r.ok, true, JSON.stringify(r.messages.map((m) => m.en)));
  const l = /** @type {NonNullable<typeof r.location>} */ (r.location);
  assert.equal(l.timing, "estimated");
  assert.equal(l.ayat.length, 11);
  assert.ok(l.truth && l.truth.within200ms === l.truth.boundaries, JSON.stringify(l.truth));
  assert.equal(l.truth?.cutsInGap, 10);
  const line = JSON.parse(summaryLine(l, "test"));
  assert.equal(line.decision, "accept");
  assert.equal(line.passage, "93:1-11");
  // A surah that cannot be this recording ends in a question, with exit code 3 from the command.
  const wrong = await locate({ audio: joined.audio, out: join(dir, "wrong"), given: { surah: "2" } });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.location?.question?.code, "quran.ask.notFit");
  assert.ok(JSON.parse(readFileSync(join(dir, "wrong", "quran-location.json"), "utf8")).question);
});
