/**
 * Narrate a film with the free Zupona narrator (engine/src/narrator.mjs): no account, no fee.
 * Writes narration/<scene>.wav and <scene>.alignment.json, the same files the ElevenLabs path
 * writes, so render-film.mjs uses them unchanged; scenes that already have a take are kept.
 *
 *   node render/narrate.mjs (--run <folder> | --api <site> --id <film id> | --text "...") --out narration/
 *        [--preset cinematic|historical|science|nature|investigative|islamic-calm] [--models <dir>] [--python python3]
 *
 * Needs: python3 with kokoro-onnx and soundfile, and the two model files in --models (or
 * KOKORO_DIR), checked against their SHA-256 before use. Quran recitation, Arabic and any line
 * with Arabic text are refused, never voiced.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { DELIVERY_PRESETS, ZUPONA_NARRATOR, getPreset, narrationCheck, planNarration, presetFor, sentenceAlignment } from "../engine/src/narrator.mjs";
import { getVersion } from "../engine/src/versions.mjs";
import { msg } from "../engine/src/messages.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** @param {string} file */
export function sha256(file) {
  return new Promise((ok, fail) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("error", fail).on("end", () => ok(h.digest("hex")));
  });
}

/**
 * The model files, checked; null names the first one that is missing or wrong.
 * @param {string} dir
 */
export async function modelFiles(dir) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, f] of Object.entries(ZUPONA_NARRATOR.files)) {
    const file = join(dir, f.name);
    if (!existsSync(file) || (await sha256(file)) !== f.sha256) return { ok: false, error: msg("narrator.missingFile", { file: f.name }) };
    out[key] = file;
  }
  return { ok: true, model: out.model, voices: out.voices };
}

/**
 * The voice worker as a function: send one job, get its result line back, in order.
 * @param {{ python: string, model: string, voices: string }} o
 */
export function kokoroWorker(o) {
  const child = spawn(o.python, [join(HERE, "kokoro_tts.py"), o.model, o.voices], { stdio: ["pipe", "pipe", "inherit"] });
  const lines = createInterface({ input: /** @type {import("node:stream").Readable} */ (child.stdout) })[Symbol.asyncIterator]();
  return {
    /** @param {object} job @returns {Promise<any>} */
    async speak(job) {
      /** @type {import("node:stream").Writable} */ (child.stdin).write(JSON.stringify(job) + "\n");
      const next = await lines.next();
      if (next.done) throw new Error("the voice worker stopped (is kokoro-onnx installed?)");
      return JSON.parse(next.value);
    },
    close() { /** @type {import("node:stream").Writable} */ (child.stdin).end(); },
  };
}

/**
 * Narrate every scene that has no take yet. Returns the report it also writes.
 * @param {{ lines: { scene: string, text: string }[], outDir: string, versionId?: string, contentType?: string, preset?: string, lexicon?: { term: string, say: string }[], worker: { speak: (job: object) => Promise<any>, close: () => void }, log?: (l: string) => void }} o
 */
export async function narrate(o) {
  const log = o.log ?? (() => {});
  const preset = getPreset(o.preset) ?? presetFor({ contentType: o.contentType });
  const plan = planNarration({ lines: o.lines, versionId: o.versionId, contentType: o.contentType, preset, lexicon: o.lexicon });
  mkdirSync(o.outDir, { recursive: true });
  const report = { narrator: { id: ZUPONA_NARRATOR.id, engine: ZUPONA_NARRATOR.engine, license: ZUPONA_NARRATOR.license, voice: ZUPONA_NARRATOR.voice }, preset: plan.preset, blocked: plan.blocked, refused: plan.refused, recorded: 0, kept: 0, failed: /** @type {{ scene: string, error: string }[]} */ ([]), takes: /** @type {{ scene: string, seconds: number, words: number, peak: number }[]} */ ([]), check: /** @type {ReturnType<typeof narrationCheck> | null} */ (null), captions: "sentence edges measured, words spread inside a sentence" };
  if (!plan.ok) { o.worker.close(); writeFileSync(join(o.outDir, "narration-report.json"), JSON.stringify(report, null, 1)); return report; }
  try {
    for (const job of plan.jobs) {
      if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].some((ext) => existsSync(join(o.outDir, `${job.scene}.${ext}`)))) { report.kept += 1; continue; }
      const out = join(o.outDir, `${job.scene}.wav`);
      const r = await o.worker.speak({ out, voice: ZUPONA_NARRATOR.voice, speed: plan.preset.speed, lang: ZUPONA_NARRATOR.phonemes, sentences: job.sentences.map((s) => ({ text: s.said, pauseAfter: s.pauseAfter })) });
      if (r.error) { report.failed.push({ scene: job.scene, error: r.error }); continue; }
      const alignment = sentenceAlignment(job, r.sentences);
      if (alignment) writeFileSync(join(o.outDir, `${job.scene}.alignment.json`), JSON.stringify(alignment));
      report.takes.push({ scene: job.scene, seconds: r.seconds, words: job.text.split(/\s+/).filter(Boolean).length, peak: r.peak });
      report.recorded += 1;
      if (report.recorded % 20 === 0) log(`narrator: ${report.recorded} scenes`);
    }
  } finally {
    o.worker.close();
  }
  const band = getVersion(o.versionId ?? "en-US")?.narrationWpm ?? { min: 140, max: 160 };
  report.check = narrationCheck(report.takes, band);
  writeFileSync(join(o.outDir, "narration-report.json"), JSON.stringify(report, null, 1));
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (!args.out || !(args.run || (args.api && args.id) || args.text) || (args.preset && !getPreset(args.preset))) {
    console.error(`Usage: node render/narrate.mjs (--run <folder> | --api <site> --id <film id> | --text "...") --out narration/ [--preset ${Object.keys(DELIVERY_PRESETS).join("|")}] [--models <dir>] [--python python3]`);
    process.exit(2);
  }
  const files = await modelFiles(args.models ?? process.env.KOKORO_DIR ?? join(homedir(), ".cache", "zupona", "kokoro"));
  if (!files.ok) { console.error(files.error?.en); process.exit(2); }
  /** @type {{ scene: string, text: string }[]} */
  let lines = [{ scene: "SAMPLE", text: String(args.text ?? "") }];
  /** @type {{ term: string, say: string }[]} */
  let lexicon = [];
  let film = /** @type {any} */ ({});
  if (!args.text) {
    const { loadRunFiles, loadRunText } = await import("./render-film.mjs");
    const { voiceLines, parseLexicon } = await import("./voice.mjs");
    const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
    const v = voiceLines(await loadRunFiles(from));
    for (const s of v.skipped) console.warn(`${s.scene}: not narrated (${s.reason})`);
    lines = v.lines;
    lexicon = parseLexicon((await loadRunText(from, "s4.md")) ?? "");
    film = JSON.parse((await loadRunText(from, "film.json")) ?? (await loadRunText(from, "run.json")) ?? "{}");
    film = film.film ?? film;
  }
  const worker = kokoroWorker({ python: args.python ?? "python3", model: /** @type {string} */ (files.model), voices: /** @type {string} */ (files.voices) });
  const r = await narrate({ lines, outDir: args.out, versionId: film.versionId ?? "en-US", contentType: film.contentType ?? "documentary", preset: args.preset ?? film.voicePreset, lexicon, worker, log: (l) => console.log(l) });
  if (r.blocked) { console.error(r.blocked.en); process.exit(1); }
  for (const x of r.refused) console.warn(`${x.scene}: ${x.reason.en}`);
  console.log(JSON.stringify({ preset: r.preset.id, recorded: r.recorded, kept: r.kept, failed: r.failed, refused: r.refused.length, check: r.check }, null, 1));
  if (r.failed.length) process.exit(1);
}
