import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { analyzeRecording } from "../src/loudness.mjs";
import { editDistance, planIdea, planRecording, possibleNames, readIdea } from "../src/studio.mjs";
import { decodeWav, encodeWav16, isWav } from "../src/wav.mjs";

test("spelling mistakes are fixed and reported, real words are left alone", () => {
  assert.equal(editDistance("stroy", "story"), 1);
  const r = readIdea("a docmentary about the histroy of the store");
  assert.equal(r.fixed, "a documentary about the history of the store");
  assert.deepEqual(r.corrections, [{ from: "docmentary", to: "documentary" }, { from: "histroy", to: "history" }]);
  assert.equal(readIdea("what is realy under antartica").fixed, "what is really under antarctica");
  assert.equal(readIdea("roads and minutes").corrections.length, 0);
});

test("Bangla spelling variants and Banglish are understood", () => {
  const bn = readIdea("একটা গরিব ছেলের গলপ যে ৫০ টাকা দিয়ে কোটিপতি হলো");
  assert.deepEqual(bn.corrections, [{ from: "গলপ", to: "গল্প" }]);
  assert.equal(bn.language, "bn");
  assert.ok(bn.cues.includes("story") && bn.cues.includes("millionaire"));
  assert.equal(readIdea("ইতিহাশের সবচেয়ে বড় রহস্য").fixed, "ইতিহাসের সবচেয়ে বড় রহস্য");
  // A longer real word that starts with a cue word is not a typo.
  assert.deepEqual(readIdea("জেলা শহরের জাদুঘর").cues, []);
  const banglish = readIdea("ekta gorib chele 50 taka diye kotipoti holo golpo");
  assert.equal(banglish.language, "bn-latin");
  assert.ok(banglish.cues.includes("story"));
});

test("an idea becomes a story with beats, a description note and no label on screen", () => {
  const plan = planIdea({ text: "a poor boy starts with $50 and buys a rolls royce, a stroy" });
  assert.equal(plan.filmMode, "story");
  assert.equal(plan.format.id, "dramatized-story");
  assert.equal(plan.closestStyle?.id, "rags-to-riches");
  assert.equal(plan.durationSeconds, 600);
  assert.ok(plan.beats.length >= 8 && plan.beats[0].atSeconds === 0);
  assert.deepEqual(plan.versions.map((v) => v.id), ["ar", "en-US", "bn-BD"]);
  for (const v of plan.versions) {
    assert.equal(v.onScreenLabel, false);
    assert.ok(v.descriptionNote);
    assert.equal(v.writtenNatively, true);
  }
  assert.equal(plan.versions[0].music.policy, "no-instruments");
  assert.equal(plan.versions[2].voice.elevenlabs, "eleven_v3");
  assert.equal(plan.versions[1].voice.elevenlabs, "eleven_multilingual_v2");
  assert.equal(plan.run.humanApprovalSteps, 0);
  assert.ok(plan.rules.includes("never-real-person") && plan.rules.includes("legal-footage-only"));
});

test("factual topics become documentaries; a prophet's story is never fiction", () => {
  const science = planIdea({ text: "what is realy under antartica" });
  assert.equal(science.filmMode, "documentary");
  assert.equal(science.format.id, "big-question-science");
  assert.equal(science.versions[0].descriptionNote, null);
  const yusuf = planIdea({ text: "قصة النبي يوسف" });
  assert.equal(yusuf.filmMode, "documentary");
  assert.equal(yusuf.contentType, "islamic");
  assert.ok(yusuf.rules.includes("no-depiction") && yusuf.rules.includes("nothing-under-quran"));
  const forced = planIdea({ text: "নবীর জীবনের গল্প", mode: "story" });
  assert.equal(forced.filmMode, "documentary");
  assert.ok(forced.notices.includes("prophet-never-fiction"));
});

test("a story that names a person is flagged, and the owner can switch modes", () => {
  assert.deepEqual(possibleNames("A boy meets Elon Musk in Dhaka."), ["Elon Musk"]);
  const plan = planIdea({ text: "Elon Musk becomes a dragon rider story" });
  assert.ok(plan.notices.includes("names-in-story"));
  assert.ok(plan.needsAiVisuals);
  const doc = planIdea({ text: "a poor boy buys a rolls royce", mode: "documentary", minutes: 20 });
  assert.equal(doc.filmMode, "documentary");
  assert.equal(doc.durationSeconds, 1200);
  assert.throws(() => planIdea({ text: "   " }));
});

/** @param {number} seconds @param {number} rate @param {number} amplitude @param {number} noise */
function tone(seconds, rate, amplitude, noise) {
  const out = new Float32Array(Math.round(seconds * rate));
  let seed = 7;
  for (let n = 0; n < out.length; n += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const speaking = Math.floor(n / (rate * 0.5)) % 2 === 0;
    out[n] = (speaking ? amplitude * Math.sin((2 * Math.PI * 220 * n) / rate) : 0) + noise * (seed / 2147483648 - 0.5);
  }
  return out;
}

test("WAV files are read at their own rate and depth", () => {
  const samples = tone(1, 44100, 0.5, 0);
  const wav = encodeWav16([samples, samples], 44100);
  assert.ok(isWav(wav));
  const decoded = decodeWav(wav, { maxChannels: 2 });
  assert.equal(decoded.sampleRate, 44100);
  assert.equal(decoded.channels.length, 2);
  assert.equal(decoded.channels[0].length, 44100);
  assert.ok(Math.abs(decoded.channels[0][100] - samples[100]) < 1e-4);
  assert.throws(() => decodeWav(new ArrayBuffer(20)));
});

test("a recording gets a report and a voice plan that never alters the voice", () => {
  const rate = 48000;
  const analysis = analyzeRecording([tone(6, rate, 0.1, 0.0005)], rate);
  const plan = planRecording({ analysis, versionId: "bn-BD", contentType: "documentary" });
  assert.equal(plan.report.items[0].id, "duration");
  assert.ok(["ready", "usable", "fix-first"].includes(plan.report.verdict));
  assert.equal(plan.own.keepOriginal, true);
  assert.ok(plan.own.never?.includes("pitch shift"));
  assert.deepEqual(plan.others.map((o) => [o.versionId, o.modelId]), [["ar", "eleven_multilingual_v2"], ["en-US", "eleven_multilingual_v2"]]);
  const noisy = analyzeRecording([tone(6, 16000, 0.05, 0.2)], 16000);
  const bad = planRecording({ analysis: noisy, versionId: "en-US", contentType: "documentary" });
  assert.equal(bad.report.verdict, "fix-first");
  assert.equal(bad.report.items.find((i) => i.id === "sample-rate")?.level, "bad");
  const quran = planRecording({ analysis, versionId: "ar", contentType: "quran_recitation" });
  assert.equal(quran.own.music.policy, "none");
  assert.ok(quran.others.every((o) => o.kind === "same-recitation" && o.modelId === null));
});

test("the studio page serves an exact copy of the engine", () => {
  const src = new URL("../src/", import.meta.url);
  const copy = new URL("../../public/studio/engine/", import.meta.url);
  for (const file of readdirSync(src).filter((f) => f.endsWith(".mjs"))) {
    assert.equal(readFileSync(new URL(file, copy), "utf8"), readFileSync(new URL(file, src), "utf8"), file + " is out of date: run npm run sync");
  }
});
