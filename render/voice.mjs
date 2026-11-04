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
 *   options: --api <site> --id <film id> instead of --run; --version en-US; --concurrency 2
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSceneLines } from "../engine/src/scene-lines.mjs";
import { ELEVENLABS_MODELS } from "../engine/src/voice-plan.mjs";
import { loadRunFiles } from "./render-film.mjs";

const PLACEHOLDER = /\$?\[C\d{2,3}[^\]]*\]/;

/**
 * @typedef {{ scene: string, text: string, previous: string, next: string }} VoiceLine
 * @typedef {{ apiKey: string, voiceId: string, versionId?: string, outDir: string, lines: VoiceLine[], fetch?: typeof fetch, concurrency?: number, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void }} VoiceOptions
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
    lines.push({ scene: s.sc, text: s.narration, previous: scenes[i - 1]?.narration.slice(-300) ?? "", next: scenes[i + 1]?.narration.slice(0, 300) ?? "" });
  });
  return { lines, skipped };
}

/**
 * Record every line that has no file yet. Returns what was recorded, kept and failed.
 * @param {VoiceOptions} o
 */
export async function recordVoice(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = o.log ?? (() => {});
  const model = ELEVENLABS_MODELS[/** @type {keyof typeof ELEVENLABS_MODELS} */ (o.versionId ?? "en-US")] ?? ELEVENLABS_MODELS["en-US"];
  mkdirSync(o.outDir, { recursive: true });
  const result = { recorded: 0, kept: 0, failed: /** @type {{ scene: string, error: string }[]} */ ([]), characters: 0 };
  let next = 0;
  const worker = async () => {
    while (next < o.lines.length) {
      const line = o.lines[next];
      next += 1;
      const file = join(o.outDir, `${line.scene}.mp3`);
      if (["mp3", "wav", "m4a", "flac"].some((ext) => existsSync(join(o.outDir, `${line.scene}.${ext}`)))) { result.kept += 1; continue; }
      try {
        const data = await speak(line);
        writeFileSync(file + ".part", Buffer.from(data.audio_base64, "base64"));
        renameSync(file + ".part", file);
        if (data.alignment) writeFileSync(join(o.outDir, `${line.scene}.alignment.json`), JSON.stringify(data.alignment));
        result.recorded += 1;
        result.characters += line.text.length;
        if (result.recorded % 20 === 0) log(`voice: ${result.recorded} recorded`);
      } catch (error) {
        result.failed.push({ scene: line.scene, error: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  /** @param {VoiceLine} line @returns {Promise<{ audio_base64: string, alignment?: unknown }>} */
  async function speak(line) {
    const body = JSON.stringify({ text: line.text, model_id: model.modelId, previous_text: model.stitching ? line.previous || undefined : undefined, next_text: model.stitching ? line.next || undefined : undefined, voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true } });
    for (let attempt = 0; ; attempt += 1) {
      const res = await get(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(o.voiceId)}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", headers: { "xi-api-key": o.apiKey, "content-type": "application/json" }, body });
      if (res.ok) return /** @type {any} */ (await res.json());
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
    console.error("Usage: ELEVENLABS_API_KEY=... node render/voice.mjs (--run <folder> | --api <site> --id <film id>) --voice-id <ElevenLabs voice id> --out voice/ [--version en-US] [--concurrency 2]");
    process.exit(2);
  }
  const chapters = await loadRunFiles(args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id });
  const { lines, skipped } = voiceLines(chapters);
  for (const s of skipped) console.warn(`${s.scene}: not recorded (${s.reason})`);
  const r = await recordVoice({ apiKey, voiceId: args["voice-id"], versionId: args.version, outDir: args.out, lines, concurrency: Number(args.concurrency ?? 2), log: (l) => console.log(l) });
  console.log(JSON.stringify({ ...r, skipped: skipped.length }, null, 1));
  if (r.failed.length) process.exit(1);
}
