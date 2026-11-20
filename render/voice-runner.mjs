/**
 * The GitHub runner's side of a voiceover film (worker/voice-api.mjs,
 * .github/workflows/voice-film.yml). It never holds the studio key: it uses
 * the ticket the Worker gave this one recording.
 *
 *   node render/voice-runner.mjs fetch --out in.mp3
 *   node render/voice-runner.mjs progress --stage words [--params '{"count":123}'] [--error "..."]
 *   node render/voice-runner.mjs summary --run voice-run      (intake, words, understand, master, pictures, from the run's files)
 *   node render/voice-runner.mjs deliver --file out/film.mp4 --report out/film.report.json [--review]
 *
 * Environment: SITE (https://...), VOICE_ID, VOICE_TICKET; RUN_URL (optional, the Actions run page).
 */
import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/** Must match PART_SIZE in worker/voice-api.mjs (the Worker says it again when an upload opens). */
const PART_SIZE = 16 * 1024 * 1024;

/** @param {string[]} argv */
export function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const o = { _: argv[0] ?? "" };
  for (let i = 1; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) o[argv[i].slice(2)] = true;
    else { o[argv[i].slice(2)] = next; i += 1; }
  }
  return o;
}

/** @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {string} path */
const endpoint = (c, path) => `${c.site}/api/voice/${c.id}${path}${path.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(c.ticket)}`;

/**
 * POST JSON to the Worker, retried a few times on a network error or a 5xx.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {string} path @param {unknown} body @param {string} [method]
 */
async function send(c, path, body, method = "POST") {
  const get = c.fetch ?? fetch;
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const res = await get(endpoint(c, path), { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const text = await res.text();
      if (res.ok) return JSON.parse(text || "{}");
      last = `${res.status} ${text.slice(0, 300)}`;
      if (res.status < 500) break;
    } catch (e) { last = e instanceof Error ? e.message : String(e); }
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
  throw new Error(`${method} ${path} failed: ${last}`);
}

/**
 * What the run folder says, as the stages the creator sees.
 * @param {string} dir
 * @returns {Array<{ stage: string, params: Record<string, string | number> }>}
 */
export function summarizeRun(dir) {
  const read = (/** @type {string} */ f) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : null);
  /** @type {Array<{ stage: string, params: Record<string, string | number> }>} */
  const out = [];
  const report = read("voice-report.json");
  if (report) out.push({ stage: "intake", params: { minutes: Math.round((report.durationSeconds / 60) * 10) / 10, lufs: Math.round((report.integratedLufs ?? report.lufs ?? 0) * 10) / 10 } });
  const words = read("words.json");
  if (words) out.push({ stage: "words", params: { count: (words.words ?? []).length } });
  const u = read("understanding.json");
  if (u) out.push({ stage: "understand", params: { scenes: (u.scenes ?? u.quranPlan?.ayat ?? []).length } });
  if (existsSync(join(dir, "master"))) out.push({ stage: "master", params: {} });
  const pics = read("pictures.json");
  // Narration: media.found shots got a licensed picture or clip. Quran: the media step runs later (quran-media.mjs).
  if (pics && pics.kind !== "quran") out.push({ stage: "pictures", params: { assets: Number(pics.media?.found ?? 0) } });
  return out;
}

/**
 * Upload the finished film in pieces, then say it is done.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {string} file @param {{ seconds: number | null, review: boolean, report?: any }} o
 */
export async function deliver(c, file, o) {
  const bytes = statSync(file).size;
  await send(c, "/progress", { stage: "deliver" });
  const opened = await send(c, "/film", { bytes });
  const size = Number(opened.partSize) || PART_SIZE;
  const fh = await open(file, "r");
  const parts = [];
  try {
    for (let n = 1; n <= opened.parts; n += 1) {
      const length = Math.min(size, bytes - (n - 1) * size);
      const buf = Buffer.alloc(length);
      await fh.read(buf, 0, length, (n - 1) * size);
      const get = c.fetch ?? fetch;
      let done = null;
      for (let attempt = 1; attempt <= 4 && !done; attempt += 1) {
        const res = await get(endpoint(c, `/film/parts/${n}`), { method: "PUT", body: buf }).catch(() => null);
        if (res?.ok) done = await res.json();
        else await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
      if (!done) throw new Error(`piece ${n} of the film could not be sent`);
      parts.push({ partNumber: done.partNumber, etag: done.etag });
    }
  } finally { await fh.close(); }
  await send(c, "/film/complete", { parts, seconds: o.seconds });
  const minutes = o.seconds ? Math.max(1, Math.round(o.seconds / 60)) : 0;
  await send(c, "/progress", { stage: "done", params: { minutes, ...(o.review ? { review: 1 } : {}) }, ...(o.report ? { report: o.report } : {}) });
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const c = { site: String(process.env.SITE ?? ""), id: String(process.env.VOICE_ID ?? ""), ticket: String(process.env.VOICE_TICKET ?? "") };
  if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(c.site) || !/^[0-9a-f-]{36}$/.test(c.id) || !c.ticket) throw new Error("Set SITE, VOICE_ID and VOICE_TICKET.");
  const runUrl = process.env.RUN_URL || undefined;
  if (a._ === "fetch") {
    const res = await fetch(endpoint(c, "/audio"));
    if (!res.ok || !res.body) throw new Error(`The recording could not be fetched: ${res.status} ${await res.text()}`);
    await pipeline(Readable.fromWeb(/** @type {any} */ (res.body)), createWriteStream(String(a.out)));
    console.log(`fetched ${statSync(String(a.out)).size} bytes`);
  } else if (a._ === "progress") {
    await send(c, "/progress", { stage: a.stage, params: typeof a.params === "string" ? JSON.parse(a.params) : {}, ...(typeof a.error === "string" ? { error: a.error } : {}), runUrl });
  } else if (a._ === "summary") {
    for (const s of summarizeRun(String(a.run))) await send(c, "/progress", s);
  } else if (a._ === "deliver") {
    const report = typeof a.report === "string" && existsSync(a.report) ? JSON.parse(readFileSync(a.report, "utf8")) : null;
    const small = report ? { durationSeconds: report.durationSeconds ?? null, width: report.width ?? null, height: report.height ?? null, stats: report.stats ?? null, warnings: (report.warnings ?? []).slice(0, 20) } : undefined;
    await deliver(c, String(a.file), { seconds: report?.durationSeconds ?? (Number(a.seconds) || null), review: a.review === true, report: small });
    console.log("delivered");
  } else throw new Error("Use fetch, progress, summary or deliver.");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
