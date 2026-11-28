/**
 * The GitHub runner's side of a voiceover film (worker/voice-api.mjs,
 * .github/workflows/voice-film.yml). It never holds the studio key: it uses
 * the ticket the Worker gave this one recording.
 *
 *   node render/voice-runner.mjs fetch --out in.mp3
 *   node render/voice-runner.mjs progress --stage words [--params '{"count":123}'] [--error "..."]
 *   node render/voice-runner.mjs summary --run voice-run [--stages pictures]   (intake, words, understand, master, pictures, from the run's files)
 *   node render/voice-runner.mjs deliver --file out/film.mp4 --report out/film.report.json [--review]
 *
 * Environment: SITE (https://...), VOICE_ID, VOICE_TICKET; RUN_URL (optional, the Actions run page);
 * VOICE_SELFTEST=1 sends nothing (the workflow's self-test).
 */
import { createWriteStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { msg } from "../engine/src/messages.mjs";

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
export async function send(c, path, body, method = "POST") {
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
 * The Craft Ledger through the Worker (R2 channel/craft-ledger.json). Without a report: read it to `out` for
 * the next shot plan. With a report: record the finished film's critic measures under this recording's id.
 * Only the critic's verdict and measures travel, never the timeline or licences.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c
 * @param {{ out?: string, report?: any, genre?: string }} o
 */
export async function ledger(c, o) {
  if (o.report) {
    const critic = o.report?.critic ?? null;
    return send(c, "/ledger", { report: { critic: critic ? { verdict: critic.verdict, measures: critic.measures } : null, durationSeconds: o.report?.durationSeconds ?? null }, ...(o.genre ? { genre: o.genre } : {}) });
  }
  const get = c.fetch ?? fetch;
  const res = await get(endpoint(c, "/ledger"));
  if (!res.ok) throw new Error(`GET /ledger failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const got = /** @type {any} */ (await res.json());
  const text = JSON.stringify({ version: got.version, films: got.films ?? [] }, null, 1);
  if (o.out) writeFileSync(o.out, text + "\n");
  return { films: (got.films ?? []).length };
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
  // A recitation's failed takes (local/voice-film.mjs --retakes) are cut before this: say how many and how long.
  const retakes = read("retakes.json");
  if (words) out.push({ stage: "words", params: { count: (words.words ?? []).length, ...(retakes ? { retakes: (retakes.cuts ?? []).length, retakeSeconds: Math.round((retakes.removedSeconds ?? 0) * 10) / 10 } : {}) } });
  const u = read("understanding.json");
  // A recitation's scenes are its ayat (quranPlan.scenes); a narration's are its own scenes.
  if (u) out.push({ stage: "understand", params: { scenes: (u.scenes ?? u.quranPlan?.scenes ?? []).length } });
  if (existsSync(join(dir, "master"))) out.push({ stage: "master", params: {} });
  const pics = read("pictures.json");
  // Narration: media.found shots got a licensed picture or clip. Quran: the media step runs later (quran-media.mjs).
  if (pics && pics.kind !== "quran") out.push({ stage: "pictures", params: { assets: Number(pics.media?.found ?? 0) } });
  // Quran: the adab-guarded media step writes manifest.json (each asset once); before it runs, nothing is reported.
  const manifest = read("manifest.json");
  if (pics?.kind === "quran" && manifest) out.push({ stage: "pictures", params: { assets: (manifest.assets ?? []).length } });
  return out;
}

/**
 * Upload the finished film in pieces, then say it is done.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {string} file @param {{ seconds: number | null, review: boolean, report?: any }} o
 */
export async function deliver(c, file, o) {
  const bytes = statSync(file).size;
  await send(c, "/progress", { stage: "deliver" });
  const parts = await uploadParts(c, file, await send(c, "/film", { bytes }), "/film/parts");
  await send(c, "/film/complete", { parts, seconds: o.seconds });
  const minutes = o.seconds ? Math.max(1, Math.round(o.seconds / 60)) : 0;
  await send(c, "/progress", { stage: "done", params: { minutes, ...(o.review ? { review: 1 } : {}) }, ...(o.report ? { report: o.report } : {}) });
}

/**
 * Send a file in the pieces an opened upload asked for; returns the parts for "complete".
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {string} file @param {{ partSize?: number, parts: number }} opened @param {string} path
 */
async function uploadParts(c, file, opened, path) {
  const bytes = statSync(file).size;
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
        const res = await get(endpoint(c, `${path}/${n}`), { method: "PUT", body: buf }).catch(() => null);
        if (res?.ok) done = await res.json();
        else await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
      if (!done) throw new Error(`piece ${n} of ${file} could not be sent`);
      parts.push({ partNumber: done.partNumber, etag: done.etag });
    }
  } finally { await fh.close(); }
  return parts;
}

/**
 * The daily film's narration goes up as the recording; "complete" starts voice-film.yml for it (the Worker).
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {string} file
 */
export async function sendVoice(c, file) {
  const parts = await uploadParts(c, file, await send(c, "/voice", { bytes: statSync(file).size }), "/parts");
  return send(c, "/complete", { parts });
}

/**
 * The free brain through the Worker (POST /api/voice/:id/brain: Groq only, the Worker's own key), as a model for
 * local/voice-film.mjs and render/asset-rank/rerank.mjs. A prompt too big for Groq comes back as an error with
 * tooLarge (the caller splits its batch); every call's prompt tokens are logged. Text only and no web search, said in its capabilities, so every stage
 * takes its own path (canSee/canSearch). A busy minute is waited out; a used-up day stops with the brains' words.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c
 * @param {{ sleep?: (ms: number) => Promise<void>, waitMs?: number, log?: (line: string) => void }} [o]
 */
export function workerBrain(c, o = {}) {
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const calls = /** @type {{ stage: string, model: string, seconds: number, tokens?: number }[]} */ ([]);
  return {
    name: "zupona-free-brain (Groq, through the Worker)",
    capabilities: { vision: false, webSearch: false },
    calls,
    /** @param {any} req */
    async call(req) {
      const body = { req: { stage: req.stage, system: req.system, messages: req.messages, maxTokens: req.maxTokens } };
      let last = "";
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const t0 = Date.now();
        try {
          const r = await send(c, "/brain", body);
          calls.push({ stage: String(req.stage ?? ""), model: String(r.model ?? "?"), seconds: Math.round((Date.now() - t0) / 1000), tokens: Number(r.tokens) || 0 });
          o.log?.(`free brain ${req.stage}: ${r.tokens ?? "?"} prompt tokens, ${r.model}`);
          return { text: String(r.text ?? ""), stopReason: r.stopReason ?? "end_turn", model: r.model, usage: r.usage ?? { input_tokens: 0, output_tokens: 0 } };
        } catch (e) {
          last = e instanceof Error ? e.message : String(e);
          if (/ 413 /.test(last)) throw Object.assign(new Error(`The prompt is too big for the free brain: ${last.slice(0, 300)}`), { status: 413, tooLarge: true });
          if (/day used up|per day|PerDay|RESOURCE_EXHAUSTED|daily/i.test(last) && !/busy/i.test(last)) throw Object.assign(new Error(`The free brains' daily limit is used up: ${last.slice(0, 300)}`), { status: 429, daily: true });
          if (!/ 429 /.test(last)) throw Object.assign(new Error(last.slice(0, 300)), { status: 400 });
          o.log?.(`free brain busy (${req.stage}); waiting a minute`);
          await sleep(o.waitMs ?? 61_000);
        }
      }
      throw Object.assign(new Error(`The free brain stayed busy: ${last.slice(0, 300)}`), { status: 503 });
    },
  };
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  // The workflow's self-test (voice-film.yml, selftest: yes) has no studio recording: nothing is sent.
  if (process.env.VOICE_SELFTEST === "1") { console.log(`self-test, not sent to the studio: ${a._}${a.stage ? ` ${a.stage}` : ""}${a.error ? `: ${a.error}` : ""}`); return; }
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
    const only = typeof a.stages === "string" ? a.stages.split(",") : null;
    for (const s of summarizeRun(String(a.run))) if (!only || only.includes(s.stage)) await send(c, "/progress", s);
  } else if (a._ === "ledger") {
    // node render/voice-runner.mjs ledger --out run/craft-ledger.json            (read, before the shot plan)
    // node render/voice-runner.mjs ledger --report out/film.report.json --run run   (record, after the gate)
    if (typeof a.report === "string") {
      const report = JSON.parse(readFileSync(a.report, "utf8"));
      const targets = typeof a.run === "string" && existsSync(join(a.run, "craft-targets.json")) ? JSON.parse(readFileSync(join(a.run, "craft-targets.json"), "utf8")) : null;
      const done = await ledger(c, { report, genre: targets?.genre ?? report?.critic?.craft?.genre });
      if (done.note) { const m = msg(done.note.code, done.note.params ?? {}); console.log(`${m.en}\n${m.bn}`); }
    } else {
      const done = await ledger(c, { out: String(a.out) });
      console.log(`craft ledger: ${done.films} film(s) read`);
    }
  } else if (a._ === "voice") {
    // node render/voice-runner.mjs voice --file narration.mp3   (the daily film's narration; the Worker starts the film)
    const r = await sendVoice(c, String(a.file));
    console.log(`voice sent; the voiceover film is ${r.status ?? "started"}${r.run?.actionsUrl ? ` (${r.run.actionsUrl})` : ""}`);
  } else if (a._ === "deliver") {
    const report = typeof a.report === "string" && existsSync(a.report) ? JSON.parse(readFileSync(a.report, "utf8")) : null;
    // Quran: the located ayat, so the studio can ask the reviewer for one tap at each ayah end.
    const located = typeof a.run === "string" && existsSync(join(a.run, "quran-location.json")) ? JSON.parse(readFileSync(join(a.run, "quran-location.json"), "utf8")) : null;
    const ayat = located?.ayat?.map((/** @type {any} */ x) => ({ ref: `${x.surah}:${x.ayah}`, start: x.start, end: x.end, sure: Boolean(x.sure) }));
    if (ayat && !report) {
      await deliver(c, String(a.file), { seconds: Number(a.seconds) || null, review: a.review === true, report: { ayat, timing: located.timing ?? null } });
      console.log("delivered");
      return;
    }
    const small = report ? { durationSeconds: report.durationSeconds ?? null, width: report.width ?? null, height: report.height ?? null, stats: report.stats ?? null, warnings: (report.warnings ?? []).slice(0, 20) } : undefined;
    await deliver(c, String(a.file), { seconds: report?.durationSeconds ?? (Number(a.seconds) || null), review: a.review === true, report: small });
    console.log("delivered");
  } else throw new Error("Use fetch, progress, summary or deliver.");
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
