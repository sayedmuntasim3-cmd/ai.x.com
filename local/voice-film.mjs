/**
 * Voice film, on the owner's machine:
 *   node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>]
 *        [--transcript <json|srt|vtt>] [--stt faster-whisper|pocketsphinx] [--model small.en]
 *        [--surah 93] [--ayat 1-11] [--passage "93, 94:1-8"] [--opening auto|none|basmala|istiadha|both] [--closing auto|none|sadaqa]
 *        [--adab strict|nature|people-distant]
 *        [--script <the words as written, .txt>] [--topic "what the film is about"] [--media]
 * Step 1 (intake): ffmpeg reads any audio file; the original is never changed.
 * Two copies are made in the output folder: analysis.wav (the original rate
 * and channels, float, for the voice checks) and voice-16k.wav (16 kHz mono,
 * what speech-to-text listens to). The voice report holds duration,
 * loudness, true peak, clipping, silence and noise, each problem as a coded
 * message (engine/src/messages.mjs) in English and Bengali.
 * Step 2 (words): a transcript that came with the voice (--transcript), or
 * speech-to-text run here (--stt, local/stt/transcribe.py). With --script,
 * the words are the script's, exactly, timed by what was heard.
 * Step 3 (understanding): language, kind, scenes or ayat, structure
 * (understanding.json). A recitation is located first (quran-location.json):
 * the surah and ayat the user gave (--surah, --ayat) or the ones a recognizer
 * heard, each ayah end on a measured pause. Given alone, the times are
 * estimates; an unclear or contradictory recording ends in a question (exit
 * code 3), never in a guess.
 * Step 4 (pictures): a plan per scene (pictures.json, pictures.md); with
 * --media, free licensed pictures from the keyless archives (network).
 * Quran: the adab guard's problems and gaps instead.
 */
import { execFile } from "node:child_process";
import { open, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createRecordingAnalyzer } from "../engine/src/loudness.mjs";
import { measureWavFile } from "../engine/src/wav.mjs";
import { msg } from "../engine/src/messages.mjs";
import { alignScript, checkTranscript, normalizeTranscript } from "../engine/src/transcript.mjs";
import { understandVoice } from "../engine/src/voice-understand.mjs";
import { buildQuranIndex } from "../engine/src/quran.mjs";
import { locateRecitation } from "../engine/src/quran-locate.mjs";
import { meaningTable, parseTanzilText, passageMeaning, planMeanings } from "../engine/src/quran-meaning.mjs";
import { directQuranFilm, shotTable } from "../engine/src/quran-director.mjs";
import { voiceSpans } from "../engine/src/voice-analyze.mjs";
import { decodeWav } from "../engine/src/wav.mjs";
import { planVoiceVisuals, quranVisualAdabGuard } from "../engine/src/voice-visuals.mjs";
import { mediaProviders } from "../engine/src/film-media.mjs";

import { planVoice } from "../engine/src/voice-plan.mjs";
import { ayahEndsOf } from "../engine/src/voice-master.mjs";
import { masterFile } from "./voice-master.mjs";

const run = promisify(execFile);

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const o = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[a.slice(2)] = true;
    else { o[a.slice(2)] = next; i += 1; }
  }
  const kind = String(o.kind ?? "auto");
  if (!["narration", "quran", "auto"].includes(kind)) throw new Error(`--kind must be narration, quran or auto, not ${kind}.`);
  return { ...o, kind };
}

/** True when ffmpeg runs. */
export async function hasFfmpeg() {
  try { await run("ffmpeg", ["-version"]); return true; } catch { return false; }
}

/**
 * Convert any audio ffmpeg reads into WAV. mono16k: the 16 kHz mono 16-bit
 * copy for speech-to-text; otherwise 32-bit float at the original rate and
 * channels, so the checks measure the file as it is.
 * @param {string} input @param {string} output @param {{ mono16k?: boolean }} [o]
 */
export async function toWav(input, output, o = {}) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-vn", "-map", "0:a:0"];
  args.push(...(o.mono16k ? ["-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le"] : ["-c:a", "pcm_f32le"]), output);
  try { await run("ffmpeg", args, { maxBuffer: 1 << 20 }); } catch (e) {
    const error = String(/** @type {any} */ (e).stderr || /** @type {any} */ (e).message || e).trim().split("\n").pop() ?? "unknown error";
    throw Object.assign(new Error(error), { message_: msg("voice.unreadable", { error }) });
  }
  return output;
}

/** Measure a WAV file in constant memory with the studio's own analyzer. @param {string} path */
export async function measureWav(path) {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    return await measureWavFile({
      size,
      read: async (start, end) => {
        const buf = Buffer.alloc(end - start);
        const { bytesRead } = await handle.read(buf, 0, buf.length, start);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + bytesRead);
      },
      analyzer: (rate, channels) => createRecordingAnalyzer(rate, channels),
    });
  } finally { await handle.close(); }
}

/** @param {number | null | undefined} n */
const r1 = (n) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10) / 10 : null);

/**
 * The voice report: numbers plus coded messages. ok is false only when the
 * file cannot carry a film (under one second, or almost all silence).
 * @param {import("../engine/src/loudness.mjs").RecordingAnalysis} a
 * @param {{ sampleRate: number, channelCount: number }} layout
 * @param {{ file?: string, bytes?: number }} [about]
 */
export function voiceReport(a, layout, about = {}) {
  const seconds = r1(a.durationSeconds) ?? 0;
  const silence = Math.round((a.silenceShare ?? 0) * 100);
  const messages = [];
  if (seconds < 1) messages.push(msg("voice.short"));
  if (a.clippedRuns > 0) messages.push(msg("voice.clipping", { runs: a.clippedRuns }));
  if (a.snrDb !== null && a.snrDb < 20) messages.push(msg("voice.noisy", { snr: r1(a.snrDb) ?? 0 }));
  if (a.integrated !== null && a.integrated < -40) messages.push(msg("voice.quiet", { lufs: r1(a.integrated) ?? 0 }));
  if (silence >= 60) messages.push(msg("voice.silent", { silence }));
  if (layout.sampleRate < 32000) messages.push(msg("voice.lowRate", { rate: layout.sampleRate }));
  const ok = seconds >= 1 && silence < 90 && a.integrated !== null;
  messages.unshift(msg("voice.ready", { seconds, lufs: r1(a.integrated) ?? "n/a", peak: r1(a.truePeakDb) ?? "n/a", silence }));
  return {
    ok,
    file: about.file ?? null,
    bytes: about.bytes ?? null,
    durationSeconds: a.durationSeconds,
    sampleRate: layout.sampleRate,
    channels: layout.channelCount,
    integratedLufs: r1(a.integrated),
    truePeakDbtp: r1(a.truePeakDb),
    samplePeakDb: r1(a.samplePeakDb),
    clippedSamples: a.clippedSamples,
    clippedRuns: a.clippedRuns,
    silenceShare: a.silenceShare,
    snrDb: r1(a.snrDb),
    noiseFloorDb: r1(a.noiseFloorDb),
    dcOffset: a.dcOffset,
    messages,
  };
}

/**
 * Step 1 for one file: both WAV copies and the voice report.
 * @param {{ audio: string, out: string }} o
 */
export async function intake(o) {
  if (!(await hasFfmpeg())) return { ok: false, report: null, messages: [msg("voice.noFfmpeg")] };
  await mkdir(o.out, { recursive: true });
  const analysisWav = await toWav(o.audio, join(o.out, "analysis.wav"));
  const sttWav = await toWav(o.audio, join(o.out, "voice-16k.wav"), { mono16k: true });
  const { analysis, layout } = await measureWav(analysisWav);
  const report = voiceReport(analysis, layout, { file: basename(o.audio), bytes: (await stat(o.audio)).size });
  await writeFile(join(o.out, "voice-report.json"), JSON.stringify(report, null, 2));
  return { ok: report.ok, report, analysisWav, sttWav, messages: report.messages };
}

/**
 * Run local/stt/transcribe.py on the 16 kHz copy. Python and the engine's
 * package must be installed on this machine (pip install faster-whisper).
 * @param {{ wav: string, out: string, engine: string, model?: string, language?: string, python?: string, clips?: number[] }} o
 */
export async function speechToText(o) {
  const script = new URL("./stt/transcribe.py", import.meta.url).pathname;
  const args = ["-I", script, o.wav, "--engine", o.engine, "--out", o.out];
  if (o.model) args.push("--model", o.model);
  if (o.language) args.push("--language", o.language);
  if (o.clips?.length) args.push("--clips", o.clips.join(","));
  await run(o.python ?? process.env.ZUPONA_PYTHON ?? "python3", args, { maxBuffer: 1 << 24, timeout: 6 * 3600 * 1000 });
  return normalizeTranscript(await readFile(o.out, "utf8"));
}

/**
 * Step 2: the timed words, checked against the recording.
 * @param {{ out: string, totalSeconds: number, sttWav?: string, transcript?: string, stt?: string, model?: string, language?: string, script?: string }} o
 */
export async function words(o) {
  let t;
  if (o.transcript) t = normalizeTranscript(await readFile(o.transcript, "utf8"), { name: o.transcript });
  else if (o.stt && o.sttWav) t = await speechToText({ wav: o.sttWav, out: join(o.out, "heard.json"), engine: o.stt, model: o.model, language: o.language });
  else throw new Error("Give --transcript <file> or --stt faster-whisper|pocketsphinx.");
  /** @type {any} */
  let final = t;
  if (o.script) final = alignScript(await readFile(o.script, "utf8"), t);
  const check = checkTranscript(final, o.totalSeconds);
  const result = { ...final, words: check.words, check: { ok: check.ok, problems: check.problems, lowConfidenceShare: check.lowConfidenceShare }, messages: check.messages };
  await writeFile(join(o.out, "words.json"), JSON.stringify(result, null, 1));
  return result;
}

/** The texts the meaning layer reads: Uthmani (verbatim, with its notice), Simple, Pickthall. */
export async function loadQuranTexts() {
  const dir = new URL("../engine/data/quran/", import.meta.url);
  const uthmani = parseTanzilText(await readFile(new URL("tanzil-quran-uthmani-1.1.txt", dir), "utf8"));
  const simple = JSON.parse(await readFile(new URL("tanzil-quran-simple-1.0.2.json", dir), "utf8"));
  const pickthall = JSON.parse(await readFile(new URL("pickthall-1930.json", dir), "utf8"));
  return { uthmani: uthmani.ayat, notice: uthmani.notice, simple, pickthall: pickthall.ayat };
}

/** The Tanzil index and surah names, read once. */
export async function loadQuran() {
  const dir = new URL("../engine/data/quran/", import.meta.url);
  const index = buildQuranIndex(JSON.parse(await readFile(new URL("tanzil-quran-simple-1.0.2.json", dir), "utf8")));
  const surahNames = JSON.parse(await readFile(new URL("surah-names.json", dir), "utf8"));
  return { index, surahNames };
}

/** The voiced stretches of a 16 kHz mono WAV (voice-16k.wav), to 10 ms. @param {string} wav */
export async function readSpans(wav) {
  const bytes = await readFile(wav);
  const decoded = decodeWav(/** @type {ArrayBuffer} */ (bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), { maxChannels: 1 });
  return { ...voiceSpans(decoded.channels[0], decoded.sampleRate), samples: decoded.channels[0], sampleRate: decoded.sampleRate };
}

/**
 * Step 3: understand the voice and save understanding.json. With sttWav, a
 * recitation is located first (given passage, gate, times on the pauses).
 * @param {{ out: string, transcript: any, totalSeconds: number, kind: "auto" | "narration" | "quran", sttWav?: string, given?: { surah?: unknown, ayat?: unknown, passage?: unknown } | null, opening?: any, closing?: any }} o
 */
export async function understand(o) {
  const needQuran = o.kind !== "narration";
  const q = needQuran ? await loadQuran() : null;
  const hasGiven = Boolean(o.given && [o.given.surah, o.given.passage].some((v) => typeof v === "string" || typeof v === "number"));
  const arabic = /^ar/.test(String(o.transcript?.language ?? ""));
  let location = null;
  if (q && o.sttWav && (o.kind === "quran" || hasGiven || arabic)) {
    const voice = await readSpans(o.sttWav);
    location = locateRecitation({ index: q.index, surahNames: q.surahNames, spans: voice.spans, totalSeconds: voice.seconds, given: hasGiven ? o.given : null, words: o.transcript?.words ?? null, opening: o.opening, closing: o.closing });
    await writeFile(join(o.out, "quran-location.json"), JSON.stringify({ ...location, stretches: voice.spans.length, recognizer: o.transcript?.engine ? { engine: o.transcript.engine, model: o.transcript.model ?? null, modelSource: o.transcript.modelSource ?? null, modelRevision: o.transcript.modelRevision ?? null, modelLicense: o.transcript.modelLicense ?? null } : null }, null, 1));
  }
  const u = understandVoice({ transcript: o.transcript ?? { words: [] }, totalSeconds: o.totalSeconds, kind: o.kind, quranIndex: q?.index ?? null, surahNames: q?.surahNames ?? [], location });
  await writeFile(join(o.out, "understanding.json"), JSON.stringify({ ...u, match: undefined, location: undefined }, null, 1));
  return u;
}

/**
 * Step 4. No writer model is called from here yet: the plan comes from each
 * scene's own words (planVoiceVisuals takes any brain when one is given).
 * @param {{ out: string, understanding: any, media?: boolean, topic?: string, quranIndex?: any, adab?: "strict" | "nature" | "people-distant" }} o
 */
export async function pictures(o) {
  const u = o.understanding;
  if (u.kind === "quran") {
    // The meaning of each ayah from recorded sources (Tanzil Uthmani, Pickthall 1930, the literal lexicon), for the guard and for a person to check.
    const texts = await loadQuranTexts();
    const ranges = u.quranPlan.scenes.filter((/** @type {any} */ s) => s.kind === "ayah").map((/** @type {any} */ s) => ({ surah: s.surah, fromAyah: s.ayah, toAyah: s.ayah }));
    const meaning = passageMeaning(texts, ranges);
    await writeFile(join(o.out, "meaning.json"), JSON.stringify(meaning, null, 1));
    await writeFile(join(o.out, "meaning.md"), meaningTable(meaning) + "\n\n" + meaning.tafsir + "\n");
    const guard = quranVisualAdabGuard({ plan: u.quranPlan, index: o.quranIndex ?? (await loadQuran()).index, meanings: planMeanings(u.quranPlan, texts) });
    // The shot list: pictures from the meaning, cut only at ayah ends and measured pauses (shots.md is for a person to check).
    let spans = [];
    try { spans = (await readSpans(join(o.out, "voice-16k.wav"))).spans; } catch { spans = []; }
    const direction = directQuranFilm({ plan: u.quranPlan, meaning, spans, adab: o.adab ?? "strict" });
    await writeFile(join(o.out, "shots.json"), JSON.stringify(direction, null, 1));
    await writeFile(join(o.out, "shots.md"), shotTable(direction) + "\n");
    await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "quran", guard, direction: { ok: direction.ok, shots: direction.shots.length, problems: direction.problems } }, null, 1));
    return { ok: guard.ok && direction.ok, messages: [...guard.messages, ...direction.messages], problems: [...guard.problems, ...direction.problems], gaps: guard.gaps };
  }
  const r = await planVoiceVisuals({ scenes: u.scenes, structure: u.structure, topic: o.topic, providers: o.media ? mediaProviders({}) : [] });
  await writeFile(join(o.out, "pictures.md"), r.markdown + "\n");
  // The run folder the renderer reads (render/render-film.mjs --run <out> --one-track <recording> --words words.json).
  await writeFile(join(o.out, "s3-chapters.json"), JSON.stringify([{ id: "C1", title: o.topic ?? "" }]));
  await writeFile(join(o.out, "s5-C1.md"), r.markdown + "\n");
  if (r.chapterMedia) await writeFile(join(o.out, "media-C1.json"), JSON.stringify(r.chapterMedia, null, 1));
  await writeFile(join(o.out, "pictures.json"), JSON.stringify({ kind: "narration", plan: r.plan, findings: r.findings, media: r.media, changedByBrain: r.changedByBrain }, null, 1));
  return { ok: r.findings.length === 0, messages: r.messages, problems: r.findings.map((f) => f.detail), gaps: [] };
}

/**
 * Master the voice with the real engine, as planVoice decides (profile,
 * space, and the refusals: a recitation is never synthetic, a narration gets
 * no hall). The film then uses mastered.wav; the original stays untouched.
 * @param {{ audio: string, out: string, kind: "quran" | "narration", space?: string, ayahEnds?: number[], lang?: "en" | "bn", log?: (line: string) => void }} o
 */
export async function master(o) {
  const quran = o.kind === "quran";
  const plan = planVoice({ source: "own-recording", contentType: quran ? "quran_recitation" : "documentary", versionId: quran ? "ar" : "en-US", space: o.space ?? (quran ? "mosque-hall" : "dry") });
  if (plan.blocked || !plan.mastering) return { ok: false, blocked: plan.blocked, plan, file: null, seconds: 0 };
  // The plan's own loudness step sets the target (a narration that will sit over a music bed is mastered 1 LU lower).
  const loud = plan.chain.find((c) => c.step === "loudness");
  const r = await masterFile({ audio: o.audio, out: join(o.out, "master"), profile: plan.mastering.profile, presets: [plan.mastering.preset], ayahEnds: o.ayahEnds, targetLufs: typeof loud?.targetLufs === "number" ? loud.targetLufs : undefined, lang: o.lang, log: o.log });
  const done = r.results[0];
  return { ok: r.ok, blocked: null, plan, file: done.wav, seconds: done.seconds, report: done.report };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.audio !== "string") {
    console.error("Usage: node local/voice-film.mjs --audio <file> [--kind narration|quran|auto] [--out <dir>] [--master [clean|mosque-hall|grand-hall|dry|warm-room]]");
    process.exit(2);
  }
  const out = resolve(typeof args.out === "string" ? args.out : join("voice-runs", basename(args.audio).replace(/\.[^.]+$/, "")));
  const lang = args.lang === "bn" ? "bn" : "en";
  const step1 = await intake({ audio: resolve(args.audio), out });
  for (const m of step1.messages) console.log("- " + m[lang]);
  if (!step1.ok || !step1.report) process.exit(1);
  /** @param {string | boolean | undefined} x */
  const str = (x) => (typeof x === "string" ? resolve(x) : undefined);
  /** @type {string | null} */
  let mastered = null;
  const given = { surah: args.surah, ayat: args.ayat, passage: args.passage };
  const hasGiven = typeof args.surah === "string" || typeof args.passage === "string";
  if (args.transcript || args.stt || hasGiven) {
    /** @type {any} */
    let step2 = { words: [], language: null };
    if (args.transcript || args.stt) {
      step2 = await words({ out, totalSeconds: step1.report.durationSeconds, sttWav: step1.sttWav, transcript: str(args.transcript), stt: typeof args.stt === "string" ? args.stt : undefined, model: typeof args.model === "string" ? args.model : undefined, language: typeof args.language === "string" ? args.language : hasGiven || args.kind === "quran" ? "ar" : undefined, script: str(args.script) });
      for (const m of step2.messages) console.log("- " + m[lang]);
      if (!step2.check.ok) process.exit(1);
    }
    const about = { sttWav: step1.sttWav, given: hasGiven ? given : null, opening: args.opening, closing: args.closing };
    const step3 = await understand({ out, transcript: step2, totalSeconds: step1.report.durationSeconds, kind: /** @type {any} */ (hasGiven ? "quran" : args.kind), ...about });
    for (const m of step3.messages) console.log("- " + m[lang]);
    for (const p of step3.problems) console.log("! " + p);
    if (!step3.ok) process.exit(/** @type {any} */ (step3).question ? 3 : 1);
    let understanding = step3;
    if (args.master) {
      const kind = step3.kind === "quran" ? "quran" : "narration";
      const m = await master({ audio: resolve(args.audio), out, kind, space: typeof args.master === "string" ? args.master : undefined, ayahEnds: kind === "quran" ? ayahEndsOf(/** @type {any} */ (step3).quranPlan) : undefined, lang, log: (line) => console.log(line) });
      if (!m.ok) { console.error(m.blocked ?? "Mastering failed its own checks; see the report."); process.exit(1); }
      mastered = m.file;
      // Cut again on the mastered length, so the last picture holds through the reverb's tail. Word times do not move.
      understanding = await understand({ out, transcript: step2, totalSeconds: m.seconds, kind: /** @type {any} */ (hasGiven ? "quran" : args.kind), ...about });
      if (!understanding.ok) process.exit(1);
    }
    const adab = ["strict", "nature", "people-distant"].includes(String(args.adab)) ? /** @type {any} */ (args.adab) : "strict";
    const step4 = await pictures({ out, understanding, media: args.media === true, topic: typeof args.topic === "string" ? args.topic : undefined, adab });
    for (const m of step4.messages) console.log("- " + m[lang]);
    for (const p of [...step4.problems, ...step4.gaps]) console.log("! " + p);
    if (!step4.ok) process.exit(1);
  } else if (args.master) {
    if (args.kind === "auto") { console.error("--master needs --kind quran or narration when there is no transcript to tell them apart."); process.exit(2); }
    const m = await master({ audio: resolve(args.audio), out, kind: /** @type {any} */ (args.kind), space: typeof args.master === "string" ? args.master : undefined, lang, log: (line) => console.log(line) });
    if (!m.ok) { console.error(m.blocked ?? "Mastering failed its own checks; see the report."); process.exit(1); }
    mastered = m.file;
  }
  if (mastered) console.log(`Mastered voice: ${mastered} (use it as --one-track for the film)`);
  console.log(`Saved in ${out}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message_?.en ?? e.message); process.exit(1); });
