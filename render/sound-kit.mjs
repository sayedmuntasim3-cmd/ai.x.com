#!/usr/bin/env node
/**
 * Fetch a film's sound effects automatically: every token of the S4 sound
 * bible (SND-AMB-01, SND-FX-05 ...) is searched on Freesound with its own
 * search phrases, and only CC0 (public-domain) sounds are taken, each with
 * its licence record in sound-kit.json. Ambience must run long enough to
 * loop; effects must be short. Files that already exist are kept, so the
 * owner's own choices always win and a stopped fetch resumes.
 *
 *   FREESOUND_API_KEY=... node render/sound-kit.mjs --run <folder> --out sfx/
 *   FREESOUND_API_KEY=... node render/sound-kit.mjs --api <site> --id <film id> --out sfx/
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadRunText } from "./render-film.mjs";

/** @typedef {{ token: string, name: string, phrases: string[] }} SoundEntry */
/** @typedef {{ token: string, phrase: string, id: number, name: string, creator: string, pageUrl: string, license: string, durationSeconds: number }} SoundRecord */

const CC0 = /publicdomain\/zero|creative commons 0|^cc0$/i;
/** Duration windows: ambience long enough to loop, effects short. */
const DURATION = { AMB: "[8 TO 180]", FX: "[0.1 TO 8]", DES: "[0.2 TO 12]" };

/**
 * The sound bible of S4 (rows "| SND-FX-05 | Scissors snip | "scissors snip close," "barber scissors" | ... |").
 * @param {string} s4
 * @returns {SoundEntry[]}
 */
export function soundBible(s4) {
  /** @type {SoundEntry[]} */
  const out = [];
  for (const line of s4.split("\n")) {
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    if (!/^SND-(AMB|FX|DES)-\d{2,3}$/.test(cells[0] ?? "")) continue;
    const phrases = [...(cells[2] ?? "").matchAll(/["“]([^"”]+?)[,.]?["”]/g)].map((m) => m[1].trim()).filter(Boolean);
    out.push({ token: cells[0], name: cells[1] ?? "", phrases: phrases.length ? phrases : [cells[1] ?? ""].filter(Boolean) });
  }
  return out;
}

/**
 * @param {{ entries: SoundEntry[], apiKey: string, outDir: string, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void }} o
 */
export async function fetchSoundKit(o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  mkdirSync(o.outDir, { recursive: true });
  const recordFile = join(o.outDir, "sound-kit.json");
  /** @type {SoundRecord[]} */
  const records = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : [];
  const result = { fetched: 0, kept: 0, notFound: /** @type {string[]} */ ([]) };
  /** @param {string} url */
  const call = async (url) => {
    for (let attempt = 0; ; attempt += 1) {
      const res = await get(url);
      if (res.status !== 429 || attempt >= 3) return res;
      await sleep(2000 * 2 ** attempt);
    }
  };
  for (const e of o.entries) {
    if (["mp3", "wav", "ogg", "flac", "m4a"].some((x) => existsSync(join(o.outDir, `${e.token}.${x}`)))) { result.kept += 1; continue; }
    const kind = /** @type {keyof typeof DURATION} */ (e.token.split("-")[1]);
    let done = false;
    for (const phrase of e.phrases) {
      const filter = `license:"Creative Commons 0" duration:${DURATION[kind]}`;
      const res = await call(`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(phrase)}&filter=${encodeURIComponent(filter)}&fields=id,name,license,duration,previews,username,url&page_size=5&sort=score&token=${encodeURIComponent(o.apiKey)}`);
      if (res.status === 401 || res.status === 403) throw new Error("Freesound refused the API key.");
      if (!res.ok) continue;
      const data = /** @type {any} */ (await res.json());
      // The filter asks for CC0; the licence of each result is checked again before it is used.
      const hit = (data.results ?? []).find((/** @type {any} */ r) => CC0.test(String(r.license ?? "")) && r.previews?.["preview-hq-mp3"]);
      if (!hit) continue;
      const audio = await call(hit.previews["preview-hq-mp3"]);
      if (!audio.ok) continue;
      const file = join(o.outDir, `${e.token}.mp3`);
      writeFileSync(file + ".part", Buffer.from(await audio.arrayBuffer()));
      renameSync(file + ".part", file);
      records.push({ token: e.token, phrase, id: hit.id, name: hit.name, creator: hit.username, pageUrl: hit.url, license: hit.license, durationSeconds: hit.duration });
      result.fetched += 1;
      done = true;
      o.log?.(`${e.token}: ${hit.name} (CC0, ${hit.username})`);
      await sleep(1100); // Freesound allows 60 requests a minute
      break;
    }
    if (!done) result.notFound.push(e.token);
  }
  writeFileSync(recordFile, JSON.stringify(records, null, 1));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  const apiKey = process.env.FREESOUND_API_KEY;
  if (!apiKey || !args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: FREESOUND_API_KEY=... node render/sound-kit.mjs (--run <folder> | --api <site> --id <film id>) --out sfx/");
    process.exit(2);
  }
  const s4 = await loadRunText(args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id }, "s4.md");
  if (!s4) { console.error("No s4.md in this run."); process.exit(1); }
  const r = await fetchSoundKit({ entries: soundBible(s4), apiKey, outDir: args.out, log: (l) => console.log(l) });
  console.log(JSON.stringify(r, null, 1));
}
