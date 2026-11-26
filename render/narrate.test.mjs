import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { modelFiles, narrate } from "./narrate.mjs";

/** A stand-in for the Python voice worker: records the jobs, answers like kokoro_tts.py. */
function fakeWorker(fail = new Set()) {
  const jobs = /** @type {any[]} */ ([]);
  let closed = false;
  return {
    jobs,
    get closed() { return closed; },
    /** @param {any} job */
    async speak(job) {
      jobs.push(job);
      if (fail.has(job.out)) return { out: job.out, error: "boom" };
      writeFileSync(job.out, "RIFF");
      let at = 0;
      const sentences = job.sentences.map((/** @type {any} */ s) => { const m = { start: at, end: at + 2 }; at += 2 + s.pauseAfter; return m; });
      return { out: job.out, seconds: at, peak: 0.7, sentences };
    },
    close() { closed = true; },
  };
}

test("every scene without a take is narrated with the narrator's voice and the preset; captions and a report are written", async () => {
  const dir = mkdtempSync(join(tmpdir(), "narrate-"));
  writeFileSync(join(dir, "SC0002.mp3"), "kept");
  const worker = fakeWorker();
  const r = await narrate({ lines: [{ scene: "SC0001", text: "He left Seville. Why?" }, { scene: "SC0002", text: "Already recorded." }], outDir: dir, preset: "science", lexicon: [{ term: "Seville", say: "Seh-vil" }], worker });
  assert.equal(r.recorded, 1);
  assert.equal(r.kept, 1);
  assert.equal(worker.closed, true);
  assert.equal(worker.jobs.length, 1);
  assert.equal(worker.jobs[0].speed, 1);
  assert.deepEqual(worker.jobs[0].sentences.map((/** @type {any} */ s) => s.text), ["He left Seh-vil.", "Why?"]);
  const a = JSON.parse(readFileSync(join(dir, "SC0001.alignment.json"), "utf8"));
  assert.equal(a.characters.join(""), "He left Seville. Why?");
  const report = JSON.parse(readFileSync(join(dir, "narration-report.json"), "utf8"));
  assert.equal(report.narrator.id, "zupona-narrator-1");
  assert.equal(report.preset.id, "science");
  assert.ok(report.check);
});

test("a Quran film is refused before the worker says anything; a failed scene is reported, not hidden", async () => {
  const dir = mkdtempSync(join(tmpdir(), "narrate-"));
  const worker = fakeWorker();
  const q = await narrate({ lines: [{ scene: "SC0001", text: "Read." }], outDir: dir, contentType: "quran_recitation", worker });
  assert.equal(q.blocked?.code, "narrator.quran");
  assert.equal(worker.jobs.length, 0);
  assert.equal(worker.closed, true);
  assert.equal(existsSync(join(dir, "SC0001.wav")), false);
  const bad = fakeWorker(new Set([join(dir, "SC0002.wav")]));
  const r = await narrate({ lines: [{ scene: "SC0002", text: "This one fails." }, { scene: "SC0003", text: "This one works." }], outDir: dir, worker: bad });
  assert.deepEqual(r.failed, [{ scene: "SC0002", error: "boom" }]);
  assert.equal(r.recorded, 1);
});

test("model files that are missing or wrong are refused by checksum", async () => {
  const dir = mkdtempSync(join(tmpdir(), "narrate-"));
  writeFileSync(join(dir, "kokoro-v1.0.onnx"), "not the model");
  const r = await modelFiles(dir);
  assert.equal(r.ok, false);
  assert.match(r.error?.en ?? "", /kokoro-v1\.0\.onnx/);
});
