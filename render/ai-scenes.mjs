#!/usr/bin/env node
/**
 * AI scenes with one consistent cast, for invented stories (owner's decision,
 * 4 Nov 2026). Stock footage cannot show the same person across a story; this
 * step makes the shots that need the story's people, and fills stock shots
 * that found no clip:
 *
 *   1. each invented character (S4: "CHR-01 LOOK: ...") gets one reference portrait;
 *   2. each shot gets a keyframe made from that reference, so the face, hair and
 *      clothes stay the same everywhere (or from text alone when no one is in it);
 *   3. the keyframe is animated into a short clip.
 *
 * Rules that hold whatever the script says: a character marked as a real person
 * is never generated; no real person's likeness, no child as the focus, no real
 * brand, no text in the picture. Realistic AI scenes are disclosed in YouTube
 * Studio; nothing is written on the video. A budget cap stops generation; the
 * shots left keep their cards. Everything is cached, so a stopped run resumes.
 *
 * Provider: fal.ai's queue API (one key, many models). The models are set by
 * environment variables, so better models can be swapped in without code:
 *   AI_IMAGE_MODEL  text to image   (default fal-ai/flux-pro/v1.1-ultra)
 *   AI_EDIT_MODEL   reference edit  (default fal-ai/flux-pro/kontext)
 *   AI_VIDEO_MODEL  image to video  (default fal-ai/kling-video/v2.1/standard/image-to-video)
 *
 *   FAL_KEY=... node render/ai-scenes.mjs --api <site> --id <film id> --out ai/ [--budget 15]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { lookFor } from "../engine/src/formats.mjs";
import { buildTimeline } from "../engine/src/timeline.mjs";

/** @typedef {{ token: string, look: string, real: boolean }} CastMember */
/** @typedef {import("../engine/src/timeline.mjs").VideoSegment} VideoSegment */
/** @typedef {{ id: string, scene: string, start: number, seconds: number, brief: string, tokens: string[], reason: "R9" | "no-stock" }} AiShot */
/** @typedef {{ image: string, edit: string, video: string }} AiModels */

export const DEFAULT_MODELS = Object.freeze({
  image: "fal-ai/flux-pro/v1.1-ultra",
  edit: "fal-ai/flux-pro/kontext",
  video: "fal-ai/kling-video/v2.1/standard/image-to-video",
});
/** Rough US dollars per call, to keep a film inside its budget (override with AI_PRICE_*). */
export const DEFAULT_PRICES = Object.freeze({ image: 0.06, edit: 0.04, video: 0.3 });

const STYLE = {
  cinematic: "cinematic film still, wide 2.39:1 composition with the subject inside the central band, teal shadows and warm highlights, shallow depth of field, natural motivated light, 35mm film texture",
  documentary: "documentary photograph, natural light, realistic colour, observational framing",
  archive: "period-accurate photograph, muted faded colour, soft contrast, archival look",
};
const RULES = "photorealistic, one coherent scene, no text, no captions, no signs with readable words, no watermark, no logos or brand names, not a likeness of any real or famous person, no child as the focus";

/**
 * The cast from S4: "CHR-01 LOOK: ..." lines (written for AI stories), else the
 * character table rows ("| **CHR-01** | who | type | policy | never |"). A
 * member whose type says "real" is never generated.
 * @param {string} s4
 * @returns {Map<string, CastMember>}
 */
export function castFromS4(s4) {
  /** @type {Map<string, CastMember>} */
  const cast = new Map();
  for (const line of s4.split("\n")) {
    const row = /^\s*\|\s*\**(CHR-\d{2,3})\**\s*\|(.*)$/.exec(line);
    if (row) {
      const cells = row[2].split("|").map((c) => c.replace(/\*\*/g, "").trim()).filter(Boolean);
      // The type column says who it is: a real person, or a real company or brand, is never generated.
      cast.set(row[1], { token: row[1], look: cells.slice(0, 2).join(", "), real: /\b(real|organi[sz]ation|company|brand)\b/i.test(cells[1] ?? "") });
    }
  }
  for (const line of s4.split("\n")) {
    const look = /\b(CHR-\d{2,3})\s+LOOK:\s*(.{10,400})$/.exec(line.replace(/\*\*/g, "").trim());
    if (look) cast.set(look[1], { token: look[1], look: look[2].trim(), real: cast.get(look[1])?.real ?? false });
  }
  return cast;
}

/**
 * The shots this step makes: every R9 shot, and stock shots that found no clip
 * (they would otherwise be cards). Shots of a real person are never made.
 * @param {{ video: VideoSegment[] }} timeline @param {Map<string, CastMember>} cast @param {{ fillMissing?: boolean, minSeconds?: number }} [o]
 * @returns {{ shots: AiShot[], refused: { id: string, why: string }[] }}
 */
export function selectAiShots(timeline, cast, o = {}) {
  /** @type {AiShot[]} */
  const shots = [];
  /** @type {{ id: string, why: string }[]} */
  const refused = [];
  for (const v of timeline.video) {
    const rung = /^(R\d)\b/.exec(v.brief)?.[1] ?? null;
    const reason = rung === "R9" ? "R9" : rung === "R3" && v.type === "card" && (o.fillMissing ?? true) ? "no-stock" : null;
    if (!reason) continue;
    const seconds = v.frames / 30 > 0 ? v.end - v.start : 0;
    if (seconds < (o.minSeconds ?? 1)) continue;
    const tokens = [...new Set(v.brief.match(/\bCHR-\d{2,3}\b/g) ?? [])];
    const real = tokens.find((t) => cast.get(t)?.real);
    if (real) { refused.push({ id: v.id, why: `${real} is a real person` }); continue; }
    shots.push({ id: v.id, scene: v.scene, start: v.start, seconds, brief: v.brief, tokens, reason });
  }
  return { shots, refused };
}

/** The shot's description without its codes (R3, OBJ-01, LOC-02, STK-C1-04, Pexels 123 ...). @param {string} brief */
export function cleanBrief(brief) {
  return brief
    .replace(/\b(R\d|L\d)\b/g, " ")
    .replace(/\b(OBJ|LOC|STK|CHR|MC|TH|FX|LOOK|SND|SIL)-[A-Z0-9-]+\b/g, " ")
    .replace(/\b(Pexels|Pixabay|Mixkit|Coverr|Videvo)\s*\d*\b/gi, " ")
    .replace(/\(use \d\/\d\)|use \d\/\d/gi, " ")
    .replace(/\s+([,.;])/g, "$1")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,;:.-]+|[\s,;:-]+$/g, "")
    .trim();
}

/**
 * fal.ai queue: submit, poll until done, read the result.
 * @param {string} model @param {Record<string, unknown>} input
 * @param {{ key: string, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, pollMs?: number, timeoutMs?: number, now?: () => number }} o
 */
export async function falRun(model, input, o) {
  const get = o.fetch ?? fetch;
  const sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  const auth = { authorization: `Key ${o.key}` };
  const submit = await get(`https://queue.fal.run/${model}`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(input) });
  if (!submit.ok) throw new Error(`fal ${model} refused the job (${submit.status}): ${(await submit.text()).slice(0, 200)}`);
  const job = /** @type {any} */ (await submit.json());
  const base = `https://queue.fal.run/${model.split("/").slice(0, 2).join("/")}/requests/${job.request_id}`;
  const statusUrl = job.status_url ?? `${base}/status`;
  const responseUrl = job.response_url ?? base;
  const started = now();
  for (;;) {
    const res = await get(statusUrl, { headers: auth });
    const st = /** @type {any} */ (res.ok ? await res.json() : { status: "UNKNOWN" });
    if (st.status === "COMPLETED") break;
    if (st.status === "FAILED" || st.status === "ERROR") throw new Error(`fal ${model} failed: ${JSON.stringify(st).slice(0, 200)}`);
    if (now() - started > (o.timeoutMs ?? 15 * 60_000)) throw new Error(`fal ${model} did not finish in time.`);
    await sleep(o.pollMs ?? 4000);
  }
  const out = await get(responseUrl, { headers: auth });
  if (!out.ok) throw new Error(`fal ${model} result could not be read (${out.status}).`);
  return /** @type {any} */ (await out.json());
}

/** The first media URL in a model's output (images[0], image, video, videos[0]). @param {any} output */
export function firstUrl(output) {
  const pick = output?.video?.url ?? output?.videos?.[0]?.url ?? output?.images?.[0]?.url ?? output?.image?.url ?? output?.output?.url ?? null;
  return typeof pick === "string" && /^https:\/\//.test(pick) ? pick : null;
}

/**
 * Make the cast references and the shots, inside the budget.
 * @param {{ shots: AiShot[], cast: Map<string, CastMember>, look?: "documentary" | "cinematic" | "archive", key: string, outDir: string, budgetUsd?: number, models?: Partial<AiModels>, prices?: Partial<typeof DEFAULT_PRICES>, concurrency?: number, fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, log?: (line: string) => void }} o
 */
export async function generateAiScenes(o) {
  const models = { ...DEFAULT_MODELS, ...o.models };
  const prices = { ...DEFAULT_PRICES, ...o.prices };
  const get = o.fetch ?? fetch;
  const budget = o.budgetUsd ?? 15;
  const style = STYLE[o.look ?? "cinematic"] ?? STYLE.cinematic;
  mkdirSync(o.outDir, { recursive: true });
  const recordFile = join(o.outDir, "ai-scenes.json");
  /** @type {{ models: AiModels, cast: Record<string, { prompt: string, url: string }>, shots: Record<string, { file: string, prompt: string, keyframe: string, video: string, costUsd: number }>, costUsd: number, skipped: { id: string, why: string }[] }} */
  const record = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : { models, cast: {}, shots: {}, costUsd: 0, skipped: [] };
  record.models = models;
  record.skipped = [];
  const save = () => writeFileSync(recordFile, JSON.stringify(record, null, 1));
  const run = (/** @type {string} */ model, /** @type {Record<string, unknown>} */ input) => falRun(model, input, { key: o.key, fetch: get, sleep: o.sleep });
  const spend = (/** @type {number} */ usd) => { record.costUsd = Math.round((record.costUsd + usd) * 100) / 100; };
  const shotCost = (/** @type {AiShot} */ s) => (s.tokens.length ? prices.edit : prices.image) + prices.video * Math.ceil(Math.min(s.seconds, 10) / 5);

  /** One reference portrait per character, made once and reused by every shot of that character. @param {string} token */
  async function reference(token) {
    if (record.cast[token]?.url) return record.cast[token].url;
    const member = o.cast.get(token);
    if (!member) return null;
    const prompt = `${member.look}. Character reference: one adult person, three-quarter view, face clearly visible, neutral expression, plain mid-grey background, soft even light. ${RULES}.`;
    const url = firstUrl(await run(models.image, { prompt, aspect_ratio: "3:4" }));
    spend(prices.image);
    if (!url) throw new Error(`No reference image for ${token}.`);
    record.cast[token] = { prompt, url };
    save();
    return url;
  }

  const pending = o.shots.filter((s) => !(record.shots[s.id] && existsSync(join(o.outDir, record.shots[s.id].file))));
  let next = 0;
  const worker = async () => {
    while (next < pending.length) {
      const s = pending[next];
      next += 1;
      if (record.costUsd + shotCost(s) > budget) { record.skipped.push({ id: s.id, why: `budget of $${budget} reached` }); continue; }
      try {
        const who = s.tokens.map((t) => o.cast.get(t)).filter((m) => m && !m.real);
        const scene = cleanBrief(s.brief);
        const prompt = `${scene}. ${who.map((m) => `${m?.token}: ${m?.look}`).join(" ")} ${style}. ${RULES}.`.replace(/\s+/g, " ").trim();
        const ref = who.length ? await reference(/** @type {CastMember} */ (who[0]).token) : null;
        const keyframe = ref
          ? firstUrl(await run(models.edit, { prompt: `Keep the same person as in the image: same face, hair, build and clothes. New photograph: ${prompt}`, image_url: ref }))
          : firstUrl(await run(models.image, { prompt, aspect_ratio: "16:9" }));
        spend(ref ? prices.edit : prices.image);
        if (!keyframe) throw new Error("no keyframe");
        const duration = s.seconds > 6 ? "10" : "5";
        const video = firstUrl(await run(models.video, { prompt: `${scene}. Subtle, natural motion and a slow, steady camera move; the person keeps the same face and clothes; ${RULES}.`, image_url: keyframe, duration }));
        spend(prices.video * (duration === "10" ? 2 : 1));
        if (!video) throw new Error("no video");
        const res = await get(video);
        if (!res.ok) throw new Error(`download ${res.status}`);
        const file = `${s.id}.mp4`;
        writeFileSync(join(o.outDir, file + ".part"), Buffer.from(await res.arrayBuffer()));
        renameSync(join(o.outDir, file + ".part"), join(o.outDir, file));
        record.shots[s.id] = { file, prompt, keyframe, video, costUsd: Math.round(shotCost(s) * 100) / 100 };
        save();
        o.log?.(`${s.id}: made (${s.reason}${who.length ? `, ${who.map((m) => m?.token).join(", ")}` : ""})`);
      } catch (error) {
        record.skipped.push({ id: s.id, why: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.concurrency ?? 2, pending.length || 1)) }, worker));
  save();
  return { made: Object.keys(record.shots).length, costUsd: record.costUsd, skipped: record.skipped };
}

/**
 * Put the made shots into the timeline: each becomes a clip from its local
 * file, playing as made (no push), with its licence line for the report.
 * @param {import("../engine/src/timeline.mjs").Timeline} timeline @param {string} dir
 */
export function applyAiScenes(timeline, dir) {
  const recordFile = join(dir, "ai-scenes.json");
  if (!existsSync(recordFile)) return 0;
  const record = JSON.parse(readFileSync(recordFile, "utf8"));
  let applied = 0;
  timeline.video = timeline.video.map((v) => {
    const made = record.shots?.[v.id];
    const file = made ? resolve(dir, made.file) : null;
    if (!file || !existsSync(file)) return v;
    applied += 1;
    const { split: _split, counter: _counter, ...rest } = v;
    return { ...rest, type: "clip", url: file, sourcePageUrl: null, licence: "AI-generated scene (disclosed in YouTube Studio)", motion: "none", text: "", sourceIn: 0 };
  });
  timeline.stats.clips = timeline.video.filter((v) => v.type === "clip").length;
  timeline.stats.cards = timeline.video.filter((v) => v.type === "card").length;
  return applied;
}

/** @param {unknown} v */
export const hashOf = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 12);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  const key = process.env.FAL_KEY;
  if (!key || !args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: FAL_KEY=... node render/ai-scenes.mjs (--run <folder> | --api <site> --id <film id>) --out ai/ [--budget 15]");
    process.exit(2);
  }
  const { loadRunFiles, loadRunText } = await import("./render-film.mjs");
  const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
  const film = JSON.parse((await loadRunText(from, "film.json")) ?? "{}");
  if (film.allowAi !== true) { console.log("This film does not allow AI scenes (allowAi is off); nothing to make."); process.exit(0); }
  const cast = castFromS4((await loadRunText(from, "s4.md")) ?? "");
  const timeline = buildTimeline({ chapters: await loadRunFiles(from) });
  const { shots, refused } = selectAiShots(timeline, cast);
  for (const r of refused) console.warn(`${r.id}: not made (${r.why})`);
  const env = process.env;
  const r = await generateAiScenes({
    shots, cast, key, outDir: args.out, look: lookFor(film.formatId), budgetUsd: Number(args.budget ?? env.AI_BUDGET_USD ?? 15),
    models: { ...(env.AI_IMAGE_MODEL ? { image: env.AI_IMAGE_MODEL } : {}), ...(env.AI_EDIT_MODEL ? { edit: env.AI_EDIT_MODEL } : {}), ...(env.AI_VIDEO_MODEL ? { video: env.AI_VIDEO_MODEL } : {}) },
    prices: { ...(env.AI_PRICE_IMAGE ? { image: Number(env.AI_PRICE_IMAGE) } : {}), ...(env.AI_PRICE_EDIT ? { edit: Number(env.AI_PRICE_EDIT) } : {}), ...(env.AI_PRICE_VIDEO ? { video: Number(env.AI_PRICE_VIDEO) } : {}) },
    log: (l) => console.log(l),
  });
  console.log(JSON.stringify({ ...r, wanted: shots.length, refused: refused.length }, null, 1));
}
