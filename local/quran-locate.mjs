/**
 * Which surah and ayat a recitation is, and when each ayah is recited:
 *   node local/quran-locate.mjs --audio <file> [--surah 93] [--ayat 1-11] [--passage "93, 94:1-8"]
 *        [--stt faster-whisper --model tarteel-ai/whisper-base-ar-quran | --transcript words.json]
 *        [--opening auto|none|basmala|istiadha|both] [--closing auto|none|sadaqa]
 *        [--truth truth.json] [--out <dir>] [--lang bn] [--python <python with faster-whisper>]
 * With --surah / --ayat and no recognizer the ayah times are estimated from
 * the measured pauses; with a recognizer they are confirmed, or the passage
 * is found without being given. A weak or contradictory result ends in a
 * question (exit code 3), never in a guess. Saved: quran-location.json.
 *
 * Test audio with known ayah times, built by joining single-ayah files:
 *   node local/quran-locate.mjs --join <folder> --surah 36 [--ayat 1-12] [--gap 0.6] --out <dir>
 * The folder's audio files are taken in name order, one per ayah. Each is
 * trimmed to its own voice and joined with --gap seconds of silence (without
 * --gap the files are joined whole). Saved: joined.wav, truth.json.
 *
 * Fetching such files for a test (curl; an archive.org item, original audio
 * files in name order; the item's licence mark is printed and saved):
 *   node local/quran-locate.mjs --fetch <item> [--prefix 010] [--count 45] --out <folder>
 * Test audio is never committed and never used in a film.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { boundaryErrors, listeningClips, locateRecitation, parsePassage } from "../engine/src/quran-locate.mjs";
import { normalizeTranscript } from "../engine/src/transcript.mjs";
import { encodeWav16 } from "../engine/src/wav.mjs";
import { alignText, intake, loadQuran, parseArgs, readSpans, speechToText, toWav } from "./voice-film.mjs";

export { readSpans };

const run = promisify(execFile);

/**
 * Download the original audio files of an archive.org item, in name order.
 * @param {{ item: string, out: string, prefix?: string, count?: number }} o
 */
export async function fetchItem(o) {
  const curl = (/** @type {string[]} */ args) => run("curl", ["-sSfL", "--retry", "3", ...args], { maxBuffer: 1 << 26 });
  const meta = JSON.parse((await curl([`https://archive.org/metadata/${o.item}`])).stdout);
  const names = /** @type {{ name: string, source?: string }[]} */ (meta.files ?? []).filter((f) => f.source === "original" && /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name) && (!o.prefix || f.name.startsWith(o.prefix)))
    .map((f) => f.name).sort((a, b) => a.localeCompare(b, "en", { numeric: true })).slice(0, o.count ?? Infinity);
  if (!names.length) throw new Error(`No audio files in ${o.item}.`);
  await mkdir(o.out, { recursive: true });
  for (const name of names) await curl(["-o", join(o.out, name.replace(/[^\w.-]+/g, "_")), `https://archive.org/download/${o.item}/${encodeURIComponent(name)}`]);
  const about = { item: o.item, url: `https://archive.org/details/${o.item}`, title: meta.metadata?.title ?? null, creator: meta.metadata?.creator ?? null, licence: meta.metadata?.licenseurl ?? null, files: names.length };
  await writeFile(join(o.out, "source.json"), JSON.stringify(about, null, 1));
  return about;
}

/** The recognizer for recitation: Whisper base fine-tuned on Quran recitation by Tarteel AI (Apache-2.0 on its model page). */
export const QURAN_MODEL = "tarteel-ai/whisper-base-ar-quran";

/**
 * @param {{ audio: string, out: string, given?: { surah?: unknown, ayat?: unknown, passage?: unknown } | null, transcript?: string, stt?: string, model?: string,
 *   python?: string, opening?: any, closing?: any, truth?: string, sttWav?: string, align?: boolean }} o
 */
export async function locate(o) {
  let sttWav = o.sttWav;
  if (!sttWav) {
    const step1 = await intake({ audio: o.audio, out: o.out });
    if (!step1.ok || !step1.sttWav) return { ok: false, location: null, messages: step1.messages };
    sttWav = step1.sttWav;
  }
  const voice = await readSpans(sttWav);
  const { index, surahNames } = await loadQuran();
  /** @type {any} */
  let heard = null;
  await mkdir(o.out, { recursive: true });
  const heardFile = o.transcript ?? (o.stt ? join(o.out, "heard.json") : null);
  if (o.transcript) heard = normalizeTranscript(await readFile(o.transcript, "utf8"), { name: o.transcript });
  else if (o.stt) heard = await speechToText({ wav: sttWav, out: join(o.out, "heard.json"), engine: o.stt, model: o.model ?? QURAN_MODEL, language: "ar", python: o.python, clips: listeningClips(voice.spans) });
  // The runner's own record of the model: where it came from, which revision, which licence.
  /** @type {any} */
  let raw = {};
  try { raw = heardFile ? JSON.parse(await readFile(heardFile, "utf8")) : {}; } catch { raw = {}; }
  const hasGiven = Boolean(o.given && [o.given.surah, o.given.passage].some((v) => typeof v === "string" || typeof v === "number"));
  const aligned = hasGiven && o.python && o.align !== false ? await alignText({ index, given: o.given, surahNames, wav: sttWav, out: o.out, python: o.python }) : null;
  const location = locateRecitation({ index, surahNames, spans: voice.spans, totalSeconds: voice.seconds, given: o.given ?? null, words: heard?.words ?? null, opening: o.opening, closing: o.closing, aligned });
  const truth = o.truth ? JSON.parse(await readFile(o.truth, "utf8")) : null;
  const errors = truth && location.ayat.length ? boundaryErrors(location.ayat, truth.ayat) : null;
  const saved = { ...location, seconds: voice.seconds, stretches: voice.spans.length, recognizer: heard ? { engine: raw.engine ?? heard.engine ?? null, model: raw.model ?? heard.model ?? null, modelSource: raw.modelSource ?? null, modelRevision: raw.modelRevision ?? null, modelLicense: raw.modelLicense ?? null, words: heard.words?.length ?? 0 } : null, truth: errors };
  await writeFile(join(o.out, "quran-location.json"), JSON.stringify(saved, null, 1));
  return { ok: location.ok, location: saved, messages: location.messages };
}

/**
 * Join single-ayah files into one recording whose ayah times are known.
 * @param {{ folder: string, given: { surah?: unknown, ayat?: unknown, passage?: unknown }, out: string, gap?: number | null }} o
 */
export async function joinAyat(o) {
  const parsed = parsePassage(o.given);
  if (!parsed.ok) throw new Error(parsed.message.code);
  const wanted = parsed.ranges.flatMap((r) => Array.from({ length: r.toAyah - r.fromAyah + 1 }, (_, i) => ({ surah: r.surah, ayah: r.fromAyah + i })));
  const files = (await readdir(o.folder)).filter((f) => /\.(mp3|wav|m4a|ogg|flac)$/i.test(f)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (files.length < wanted.length) throw new Error(`${wanted.length} ayat were asked for but the folder has ${files.length} audio files.`);
  await mkdir(o.out, { recursive: true });
  const rate = 16000;
  /** @type {Float32Array[]} */
  const parts = [];
  /** @type {{ surah: number, ayah: number, start: number, end: number, file: string }[]} */
  const ayat = [];
  let at = 0;
  for (let k = 0; k < wanted.length; k += 1) {
    const wav = await toWav(join(o.folder, files[k]), join(o.out, "part.wav"), { mono16k: true });
    const v = await readSpans(wav);
    if (!v.spans.length) throw new Error(`No voice in ${files[k]}.`);
    const first = v.spans[0].start, last = v.spans[v.spans.length - 1].end;
    if (typeof o.gap === "number") {
      // Keep 50 ms around the voice, then silence up to the asked gap.
      const from = Math.max(0, Math.round((first - 0.05) * rate)), to = Math.min(v.samples.length, Math.round((last + 0.05) * rate));
      parts.push(v.samples.subarray(from, to), new Float32Array(Math.round(Math.max(0, o.gap - 0.1) * rate)));
      ayat.push({ ...wanted[k], start: at + (first - from / rate), end: at + (last - from / rate), file: files[k] });
      at += (to - from) / rate + Math.round(Math.max(0, o.gap - 0.1) * rate) / rate;
    } else {
      parts.push(v.samples);
      ayat.push({ ...wanted[k], start: at + first, end: at + last, file: files[k] });
      at += v.samples.length / rate;
    }
  }
  const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) { all.set(p, offset); offset += p.length; }
  const audio = join(o.out, "joined.wav");
  await writeFile(audio, Buffer.from(encodeWav16([all], rate)));
  const round = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  const truth = { seconds: round(all.length / rate), gap: o.gap ?? null, ayat: ayat.map((a) => ({ ...a, start: round(a.start), end: round(a.end) })) };
  await writeFile(join(o.out, "truth.json"), JSON.stringify(truth, null, 1));
  return { audio, truth: join(o.out, "truth.json"), seconds: truth.seconds, ayat: ayat.length };
}

/** One line a workflow log can carry. @param {NonNullable<Awaited<ReturnType<typeof locate>>["location"]>} l @param {string} name */
export function summaryLine(l, name) {
  const range = (/** @type {{ surah: number, fromAyah: number, toAyah: number }[]} */ rs) => rs.map((r) => `${r.surah}:${r.fromAyah}-${r.toAyah}`).join(",");
  return JSON.stringify({ label: name, seconds: Math.round(l.seconds), stretches: l.stretches, decision: l.decision, question: l.question?.code ?? null, source: l.source, timing: l.timing, passage: range(l.passages), heard: range(l.heard), ayat: l.ayat.length,
    onPause: l.ayat.slice(0, -1).filter((a) => a.onPause).length, markers: l.markers.map((m) => m.type), repeats: l.repeats.length, other: l.other.filter((x) => x.type === "other").reduce((n, x) => n + x.words, 0),
    recognition: l.recognition, fit: l.fit, agreement: l.agreement, alignment: l.alignment ?? null, sure: l.ayat.slice(0, -1).filter((a) => a.sure).length, model: l.recognizer?.model ?? null, licence: l.recognizer?.modelLicense ?? null, truth: l.truth });
}

async function main() {
  const args = /** @type {Record<string, any>} */ (parseArgs(process.argv.slice(2)));
  const given = { surah: args.surah, ayat: args.ayat, passage: args.passage };
  const str = (/** @type {unknown} */ x) => (typeof x === "string" ? x : undefined);
  if (typeof args.fetch === "string") {
    const about = await fetchItem({ item: args.fetch, out: resolve(str(args.out) ?? args.fetch), prefix: str(args.prefix), count: typeof args.count === "string" ? Number(args.count) : undefined });
    console.log("QURAN-SOURCE " + JSON.stringify(about));
    if (!about.licence) { console.error("This item carries no licence mark: not used."); process.exit(1); }
    return;
  }
  if (typeof args.join === "string") {
    const out = resolve(str(args.out) ?? "quran-join");
    const r = await joinAyat({ folder: resolve(args.join), given, out, gap: typeof args.gap === "string" ? Number(args.gap) : null });
    console.log(`Joined ${r.ayat} ayat, ${r.seconds} s: ${r.audio} (truth: ${r.truth})`);
    return;
  }
  if (typeof args.audio !== "string") {
    console.error("Usage: node local/quran-locate.mjs --audio <file> [--surah 93] [--ayat 1-11] [--stt faster-whisper] [--out <dir>]");
    process.exit(2);
  }
  const out = resolve(str(args.out) ?? join("voice-runs", basename(args.audio).replace(/\.[^.]+$/, "")));
  const lang = args.lang === "bn" ? "bn" : "en";
  const r = await locate({ audio: resolve(args.audio), out, given, transcript: str(args.transcript) && resolve(args.transcript), stt: str(args.stt), model: str(args.model), python: str(args.python) ?? process.env.ZUPONA_PYTHON, align: args["no-align"] !== true, opening: str(args.opening), closing: str(args.closing), truth: str(args.truth) && resolve(args.truth) });
  for (const m of r.messages) console.log("- " + m[lang]);
  if (r.location) {
    for (const a of r.location.ayat) console.log(`  ${a.surah}:${a.ayah}  ${a.start.toFixed(2)} - ${a.end.toFixed(2)} s  ${a.timing}${a.onPause ? "" : ", no pause"}${a.repeat ? ", again" : ""}  (${a.confidence})`);
    console.log("QURAN-LOCATE " + summaryLine(r.location, str(args.label) ?? basename(args.audio)));
  }
  console.log(`Saved in ${out}`);
  if (!r.ok) process.exit(r.location?.decision === "ask" ? 3 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message_?.en ?? e.message); process.exit(1); });
