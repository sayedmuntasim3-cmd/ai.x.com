#!/usr/bin/env node
/**
 * Compose a film's score automatically with ElevenLabs Music (owner's
 * decision, 4 Nov 2026): one instrumental track per cue of the S4 music plan
 * (M01 ...), written from the cue's own brief (mood, instruments, tempo) and
 * as long as the cue's longest stretch in the film (the renderer loops it if
 * a stretch is longer than the 5-minute limit). Each prompt is recorded in
 * music-kit.json. Tracks that already exist are kept, so hand-picked library
 * tracks win and a stopped run resumes.
 *
 *   ELEVENLABS_API_KEY=... node render/music-kit.mjs --run <folder> --out music/
 *   ELEVENLABS_API_KEY=... node render/music-kit.mjs --api <site> --id <film id> --out music/
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTimeline } from "../engine/src/timeline.mjs";
import { loadRunFiles, loadRunText } from "./render-film.mjs";

/** ElevenLabs Music accepts 10 s to 5 minutes per track. */
export const MUSIC_MIN_MS = 10_000;
export const MUSIC_MAX_MS = 300_000;

/** @typedef {{ cue: string, brief: string, bpm: number | null }} MusicCue */
/** @typedef {{ cue: string, prompt: string, lengthMs: number, model: string, file: string }} MusicRecord */

/**
 * The S4 music plan: rows "| M01 | C1 | 0:00:00–0:00:29 | Tense pulse, low strings; 120 | ... |".
 * The mood column is found by its header ("Mood ..."), else it is the fourth column.
 * @param {string} s4
 * @returns {MusicCue[]}
 */
export function musicPlan(s4) {
  const rows = s4.split("\n").filter((l) => /^\s*\|/.test(l)).map((l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()));
  const header = rows.find((r) => /^cue$/i.test(r[0] ?? "") && r.some((c) => /mood|brief|instrument/i.test(c)));
  const moodAt = header ? header.findIndex((c) => /mood|brief|instrument/i.test(c)) : 3;
  /** @type {Map<string, MusicCue>} */
  const cues = new Map();
  for (const r of rows) {
    if (!/^M\d{2,3}$/.test(r[0] ?? "") || cues.has(r[0])) continue;
    const mood = (r[moodAt] ?? "").replace(/\*\*/g, "").trim();
    const bpm = /(?:;|,)\s*(\d{2,3})\s*(?:bpm)?\s*$/i.exec(mood);
    cues.set(r[0], { cue: r[0], brief: bpm ? mood.slice(0, bpm.index).trim() : mood, bpm: bpm ? Number(bpm[1]) : null });
  }
  return [...cues.values()];
}

/**
 * The prompt for one cue: the brief as written, made safe to lie under a voice.
 * @param {MusicCue} c @param {string} [look]
 */
export function musicPrompt(c, look = "documentary") {
  return [
    `Instrumental film score cue for a ${look === "cinematic" ? "cinematic story" : look === "archive" ? "history documentary" : "documentary"}: ${c.brief}.`,
    c.bpm ? `${c.bpm} BPM.` : "",
    "No vocals, no lyrics, no spoken words. It sits under narration: no busy lead melody in the voice range, steady dynamics, no sudden loud hits except where the brief asks for them, and a clean, natural ending.",
  ].filter(Boolean).join(" ");
}

/**
 * @param {{ cues: MusicCue[], lengths: Record<string, number>, apiKey: string, outDir: string, look?: string, endpoint?: string, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void }} o
 *   lengths: seconds each cue must cover (its longest stretch in the film)
 */
export async function composeMusicKit(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  mkdirSync(o.outDir, { recursive: true });
  const recordFile = join(o.outDir, "music-kit.json");
  /** @type {MusicRecord[]} */
  const records = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : [];
  const result = { composed: 0, kept: 0, unused: /** @type {string[]} */ ([]), failed: /** @type {{ cue: string, error: string }[]} */ ([]) };
  for (const c of o.cues) {
    if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].some((x) => existsSync(join(o.outDir, `${c.cue}.${x}`)))) { result.kept += 1; continue; }
    const seconds = o.lengths[c.cue];
    if (!seconds) { result.unused.push(c.cue); continue; }
    const lengthMs = Math.max(MUSIC_MIN_MS, Math.min(MUSIC_MAX_MS, Math.round(seconds * 1000)));
    const prompt = musicPrompt(c, o.look);
    const body = JSON.stringify({ prompt, music_length_ms: lengthMs, model_id: "music_v1", force_instrumental: true });
    try {
      let res;
      for (let attempt = 0; ; attempt += 1) {
        res = await get(o.endpoint ?? "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", { method: "POST", headers: { "xi-api-key": o.apiKey, "content-type": "application/json" }, body });
        if (res.ok || !(res.status === 429 || res.status >= 500) || attempt >= 3) break;
        await sleep(3000 * 2 ** attempt);
      }
      if (!res.ok) throw new Error(`ElevenLabs Music ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const file = join(o.outDir, `${c.cue}.mp3`);
      writeFileSync(file + ".part", Buffer.from(await res.arrayBuffer()));
      renameSync(file + ".part", file);
      records.push({ cue: c.cue, prompt, lengthMs, model: "music_v1", file: `${c.cue}.mp3` });
      result.composed += 1;
      o.log?.(`${c.cue}: ${Math.round(lengthMs / 1000)} s composed`);
    } catch (error) {
      result.failed.push({ cue: c.cue, error: error instanceof Error ? error.message : String(error) });
    }
  }
  writeFileSync(recordFile, JSON.stringify(records, null, 1));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey || !args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: ELEVENLABS_API_KEY=... node render/music-kit.mjs (--run <folder> | --api <site> --id <film id>) --out music/");
    process.exit(2);
  }
  const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
  const s4 = await loadRunText(from, "s4.md");
  if (!s4) { console.error("No s4.md in this run."); process.exit(1); }
  const { lookFor } = await import("../engine/src/formats.mjs");
  const film = JSON.parse((await loadRunText(from, "film.json")) ?? (await loadRunText(from, "run.json")) ?? "{}");
  const timeline = buildTimeline({ chapters: await loadRunFiles(from) });
  /** @type {Record<string, number>} */
  const lengths = {};
  for (const m of timeline.music) lengths[m.cue] = Math.max(lengths[m.cue] ?? 0, m.end - m.start);
  const r = await composeMusicKit({ cues: musicPlan(s4), lengths, apiKey, outDir: args.out, look: lookFor(film.formatId ?? film.film?.formatId), log: (l) => console.log(l) });
  console.log(JSON.stringify(r, null, 1));
  if (r.failed.length) process.exit(1);
}
