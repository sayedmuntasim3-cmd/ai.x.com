#!/usr/bin/env node
/**
 * Record a film's narration with ElevenLabs, one file per narrated scene
 * (SC0001.mp3 ...), ready for render-film.mjs --voice. The text of the
 * neighbouring scenes is sent as context so the read flows across cuts.
 * A scene whose narration still holds an unresolved number ("[C12 low]") is
 * not recorded: the voice must never read a placeholder. Files that exist
 * are kept, so a stopped recording resumes and the owner's own takes
 * (recorded by hand under the same names) are never overwritten.
 *
 *   ELEVENLABS_API_KEY=... node render/voice.mjs --run <folder> --voice-id <id> --out voice/
 *   options: --api <site> --id <film id> instead of --run; --version en-US; --model eleven_v3; --concurrency 2
 *   Stories and motivation films are read with ElevenLabs v3 and each scene's DELIVERY tags.
 *   Hard names are read as S4's pronunciation lexicon spells them; captions still show the names as written.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSceneLines } from "../engine/src/scene-lines.mjs";
import { ELEVENLABS_MODELS } from "../engine/src/voice-plan.mjs";
import { lookFor } from "../engine/src/formats.mjs";
import { loadRunFiles, loadRunText } from "./render-film.mjs";

const PLACEHOLDER = /\$?\[C\d{2,3}[^\]]*\]/;

/**
 * @typedef {{ term: string, say: string }} LexiconEntry
 * @typedef {{ characters: string[], character_start_times_seconds: number[], character_end_times_seconds: number[] }} Alignment
 * @typedef {{ scene: string, text: string, previous: string, next: string, delivery?: string }} VoiceLine
 *   delivery: the scene's DELIVERY field, performance direction for ElevenLabs v3 ("[softly] [serious]"); never read aloud by v2
 * @typedef {{ apiKey: string, voiceId: string, versionId?: string, modelId?: string, outDir: string, lines: VoiceLine[], lexicon?: LexiconEntry[], fetch?: typeof fetch, concurrency?: number, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void }} VoiceOptions
 */

/**
 * The lines to record, in film order, each with its neighbours as context.
 * @param {{ markdown: string }[]} chapters
 * @returns {{ lines: VoiceLine[], skipped: { scene: string, reason: string }[] }}
 */
export function voiceLines(chapters) {
  const scenes = chapters.flatMap((c) => parseSceneLines(c.markdown)).filter((s) => !s.wordless);
  /** @type {VoiceLine[]} */
  const lines = [];
  /** @type {{ scene: string, reason: string }[]} */
  const skipped = [];
  scenes.forEach((s, i) => {
    if (PLACEHOLDER.test(s.narration)) { skipped.push({ scene: s.sc, reason: `unresolved number ${s.narration.match(PLACEHOLDER)?.[0]}` }); return; }
    lines.push({ scene: s.sc, text: s.narration, previous: scenes[i - 1]?.narration.slice(-300) ?? "", next: scenes[i + 1]?.narration.slice(0, 300) ?? "", ...(s.fields.DELIVERY ? { delivery: s.fields.DELIVERY } : {}) });
  });
  return { lines, skipped };
}

/** ElevenLabs v3: the expressive model that reads [bracketed] delivery tags as performance. */
export const V3 = "eleven_v3";

/**
 * The v3 performance tags for a scene: bracketed tags as written in DELIVERY
 * ("[softly] [serious]"), or its plain words made into tags ("quiet, slow" ->
 * "[quiet] [slow]"). At most three; anything that is not a short direction is dropped.
 * @param {string | undefined} delivery
 */
export function deliveryTags(delivery) {
  const text = String(delivery ?? "").trim();
  if (!text) return "";
  const bracketed = [...text.matchAll(/\[([^\]\[]{2,30})\]/g)].map((m) => m[1].trim());
  const words = bracketed.length ? bracketed : text.split(/[,;/]+/).map((w) => w.trim()).filter((w) => /^[\p{L} -]{2,30}$/u.test(w));
  return words.slice(0, 3).map((w) => `[${w.toLowerCase()}]`).join(" ");
}

/**
 * The S4 pronunciation lexicon (section 8.6, a table "| Term | Narrator says |
 * Note |"), as the narrator should say each term. Entries read "as written",
 * and ones whose spelling would drop words of the term (a respelling of only
 * its first word), are left out, so nothing is ever cut from the narration.
 * @param {string} s4
 * @returns {LexiconEntry[]}
 */
export function parseLexicon(s4) {
  const text = String(s4 ?? "");
  const at = text.search(/^#{2,4}[^\n]*pronunciation lexicon/im);
  if (at < 0) return [];
  /** @type {LexiconEntry[]} */
  const out = [];
  for (const line of text.slice(at).split("\n").slice(1)) {
    if (/^#{1,4}\s/.test(line)) break;
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || /^-+$/.test(cells[1].replace(/:/g, "")) || /^term\b/i.test(cells[1])) continue;
    const say = cells[2].replace(/\*\*[^*]*\*\*/g, "").replace(/\([^)]*\)/g, "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim();
    if (!say || /^as written$/i.test(say)) continue;
    const terms = cells[1].split(/\s*,\s*/).filter(Boolean);
    const says = say.split(/\s*,\s*/).filter(Boolean);
    terms.forEach((term, i) => {
      const s = says.length === terms.length ? says[i] : terms.length === 1 ? say : "";
      if (!s || !/^[\p{L}\p{N}][\p{L}\p{N} .'&-]*$/u.test(term)) return;
      if (s.split(" ").length < term.split(" ").length) return;
      out.push({ term, say: s });
    });
  }
  return out;
}

/**
 * Put the lexicon's spellings into a line for the voice, and remember where,
 * so the voice's timings can be mapped back to the words as written.
 * @param {string} text @param {LexiconEntry[]} lexicon
 * @returns {{ text: string, spans: { start: number, end: number, original: string }[] }}
 */
export function applyLexicon(text, lexicon) {
  if (!lexicon.length) return { text, spans: [] };
  const sorted = [...lexicon].sort((a, b) => b.term.length - a.term.length);
  const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${sorted.map((e) => esc(e.term)).join("|")})(?![\\p{L}\\p{N}])`, "gu");
  const say = new Map(sorted.map((e) => [e.term, e.say]));
  /** @type {{ start: number, end: number, original: string }[]} */
  const spans = [];
  let out = "";
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += text.slice(last, m.index);
    const s = say.get(m[1]) ?? m[1];
    spans.push({ start: out.length, end: out.length + s.length, original: m[1] });
    out += s;
    last = (m.index ?? 0) + m[1].length;
  }
  return { text: out + text.slice(last), spans };
}

/**
 * The voice's timings with each respelled name turned back into the name as
 * written (its time spread over the name's letters), so captions show
 * "Ramesh Babu", not "ruh-MAYSH BAH-boo". Null when the timings do not match
 * the text that was sent (then captions are estimated instead).
 * @param {Alignment} alignment @param {string} sent @param {{ start: number, end: number, original: string }[]} spans offsets in the text sent
 * @returns {Alignment | null}
 */
export function restoreAlignment(alignment, sent, spans) {
  const chars = alignment?.characters ?? [];
  if (!spans.length) return alignment;
  if (chars.join("") !== sent) return null;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  /** @type {Alignment} */
  const out = { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] };
  let i = 0;
  for (const span of [...spans].sort((a, b) => a.start - b.start)) {
    for (; i < span.start; i += 1) { out.characters.push(chars[i]); out.character_start_times_seconds.push(starts[i]); out.character_end_times_seconds.push(ends[i]); }
    const t0 = Number(starts[span.start]);
    const t1 = Number(ends[span.end - 1]);
    const n = span.original.length;
    [...span.original].forEach((c, k) => { out.characters.push(c); out.character_start_times_seconds.push(t0 + ((t1 - t0) * k) / n); out.character_end_times_seconds.push(t0 + ((t1 - t0) * (k + 1)) / n); });
    i = span.end;
  }
  for (; i < chars.length; i += 1) { out.characters.push(chars[i]); out.character_start_times_seconds.push(starts[i]); out.character_end_times_seconds.push(ends[i]); }
  return out;
}

/**
 * Record every line that has no file yet. Returns what was recorded, kept and failed.
 * @param {VoiceOptions} o
 */
export async function recordVoice(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => {});
  const versionModel = ELEVENLABS_MODELS[/** @type {keyof typeof ELEVENLABS_MODELS} */ (o.versionId ?? "en-US")] ?? ELEVENLABS_MODELS["en-US"];
  // v3 has no request stitching; its delivery tags carry the performance instead.
  const model = o.modelId && o.modelId !== versionModel.modelId ? { modelId: o.modelId, maxCharacters: o.modelId === V3 ? 3000 : 10000, stitching: o.modelId !== V3 } : versionModel;
  mkdirSync(o.outDir, { recursive: true });
  const result = { recorded: 0, kept: 0, failed: /** @type {{ scene: string, error: string }[]} */ ([]), characters: 0 };
  let next = 0;
  const worker = async () => {
    while (next < o.lines.length) {
      const line = o.lines[next];
      next += 1;
      const file = join(o.outDir, `${line.scene}.mp3`);
      if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].some((ext) => existsSync(join(o.outDir, `${line.scene}.${ext}`)))) { result.kept += 1; continue; }
      try {
        const data = await speak(line);
        writeFileSync(file + ".part", Buffer.from(data.audio_base64, "base64"));
        renameSync(file + ".part", file);
        // Timings are saved against the words as written (respelled names mapped back), or not at all.
        const timings = data.alignment ? restoreAlignment(/** @type {Alignment} */ (data.alignment), data.sent, data.spans) : null;
        if (timings) writeFileSync(join(o.outDir, `${line.scene}.alignment.json`), JSON.stringify(timings));
        result.recorded += 1;
        result.characters += line.text.length;
        if (result.recorded % 20 === 0) log(`voice: ${result.recorded} recorded`);
      } catch (error) {
        result.failed.push({ scene: line.scene, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  const lexicon = o.lexicon ?? [];
  /** @param {VoiceLine} line @returns {Promise<{ audio_base64: string, alignment?: unknown, sent: string, spans: { start: number, end: number, original: string }[] }>} */
  async function speak(line) {
    const tags = model.modelId === V3 ? deliveryTags(line.delivery) : "";
    const said = applyLexicon(line.text, lexicon);
    const prefix = tags ? `${tags} ` : "";
    const sent = prefix + said.text;
    const spans = said.spans.map((s) => ({ ...s, start: s.start + prefix.length, end: s.end + prefix.length }));
    const body = JSON.stringify({ text: sent, model_id: model.modelId, previous_text: model.stitching ? applyLexicon(line.previous, lexicon).text || undefined : undefined, next_text: model.stitching ? applyLexicon(line.next, lexicon).text || undefined : undefined, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true } });
    const headers = { "xi-api-key": o.apiKey, "content-type": "application/json" };
    const base = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(o.voiceId)}`;
    for (let attempt = 0; ; attempt += 1) {
      const res = await get(`${base}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers, body });
      if (res.ok) return { .../** @type {any} */ (await res.json()), sent, spans };
      // A model that cannot return timings still records the line; its captions are then estimated.
      if ([400, 404, 422].includes(res.status) && model.modelId === V3) {
        const plain = await get(`${base}?output_format=mp3_44100_128`, { method: "POST", headers, body });
        if (plain.ok) return { audio_base64: Buffer.from(await plain.arrayBuffer()).toString("base64"), sent, spans };
        throw new Error(`ElevenLabs ${plain.status}: ${(await plain.text()).slice(0, 200)}`);
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= 4) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const after = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : 2000 * 2 ** attempt);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? 2, o.lines.length || 1)) }, worker));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !args["voice-id"] || !args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: ELEVENLABS_API_KEY=... node render/voice.mjs (--run <folder> | --api <site> --id <film id>) --voice-id <ElevenLabs voice id> --out voice/ [--version en-US] [--model eleven_v3] [--concurrency 2]");
    process.exit(2);
  }
  const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
  const chapters = await loadRunFiles(from);
  const { lines, skipped } = voiceLines(chapters);
  for (const s of skipped) console.warn(`${s.scene}: not recorded (${s.reason})`);
  // Stories and motivation read with v3 and its delivery tags (owner's decision, 4 Nov 2026); documentaries keep the version's model.
  const film = JSON.parse((await loadRunText(from, "film.json")) ?? (await loadRunText(from, "run.json")) ?? "{}");
  const modelId = args.model ?? (lookFor(film.formatId ?? film.film?.formatId) === "cinematic" ? V3 : undefined);
  if (modelId) console.log(`voice model: ${modelId}`);
  // S4's pronunciation lexicon: hard names are read as it spells them.
  const lexicon = parseLexicon((await loadRunText(from, "s4.md")) ?? "");
  if (lexicon.length) console.log(`pronunciation lexicon: ${lexicon.length} names`);
  const r = await recordVoice({ apiKey, voiceId: args["voice-id"], versionId: args.version, modelId, outDir: args.out, lines, lexicon, concurrency: Number(args.concurrency ?? 2), log: (l) => console.log(l) });
  console.log(JSON.stringify({ ...r, skipped: skipped.length }, null, 1));
  if (r.failed.length) process.exit(1);
}
