#!/usr/bin/env node
/**
 * The contact sheets of M6: one frame per shot, a sheet per chapter, so the
 * cut can be judged as a whole instead of shot by shot, and every weak shot
 * is named with its reason, its owner (M3 re-pick or M4 re-make) and its
 * round.
 *
 *   node render/contact-sheet.mjs --film out/<id>.mp4 --timeline out/<id>.timeline.json \
 *        [--run films/<folder>] [--out out/<id>] [--cols 6] [--tile 400x225] [--font <ttf>]
 *
 * Each tile carries the shot id, its TYPE and its relevance score (from the
 * media files' `why`), and a weak shot is framed in red. The sheets and the
 * weak-shot list are written next to the film (`<out>.sheet-C1.jpg`,
 * `<out>.sheets.json`, `<out>.returns.json`); the return rounds are capped at
 * two, after which the shot is escalated to the Boss instead of bounced again.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { say } from "../engine/src/messages.mjs";
import { run } from "./render-film.mjs";

/** The house rules of the sheets: the same relevance floor the critic blocks on, and the return cap. */
export const HOUSE = Object.freeze({
  /** Below this CLIP relevance a shot is a wrong picture, whatever else it scores. */
  relevance: 0.25,
  /** One clip used more times than this in a film is a visible repeat. */
  repeatLimit: 3,
  /** A chapter that is more than this share stills is a slideshow, not a cut. */
  stillShare: 0.55,
  /** A shot under this many seconds cannot be read. */
  shortShot: 1,
  /** A weak shot is sent back at most this many times; after that the Boss decides. */
  maxReturns: 2,
  /** Tile and sheet layout: 16:9 tiles (an even height, as 4:2:0 frames need) with a caption bar under each, six to a row. */
  tile: [400, 224],
  bar: 28,
  cols: 6,
  margin: 6,
  padding: 6,
});

/** Moving picture types, as the critic counts them: footage, or a still with a designed move. */
const MOVING = new Set(["clip", "live-video", "archival-video", "photo-designed", "photo-2.5D"]);

/** @param {number} n @param {number} [digits] */
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * The chapters of a rendered timeline. A chapter opens on the shot that carries
 * `chapterTitle` (the renderer writes "Chapter 3 · The deal"), and an unmarked
 * timeline is one chapter.
 * @param {any[]} video
 * @returns {{ id: string, title: string | null, from: number, to: number, shots: any[] }[]}
 */
export function chaptersOf(video) {
  /** @type {{ id: string, title: string | null, from: number, to: number, shots: any[] }[]} */
  const out = [];
  for (const v of video ?? []) {
    if (v.type === "black") continue;
    if (v.chapterTitle || !out.length) {
      const m = /Chapter\s+(\d+)/i.exec(String(v.chapterTitle ?? ""));
      out.push({
        id: m ? `C${m[1]}` : `C${out.length + 1}`,
        title: String(v.chapterTitle ?? "").replace(/^Chapter\s+\d+\s*·\s*/i, "").trim() || null,
        from: Number(v.start) || 0,
        to: Number(v.end) || 0,
        shots: [],
      });
    }
    const c = out[out.length - 1];
    c.to = Math.max(c.to, Number(v.end) || 0);
    c.shots.push(v);
  }
  return out;
}

/**
 * The eyes' scores, keyed by the timeline's shot id (`SC0012-1`), from the
 * media files (`media-C1.json`, whose shots carry `why`).
 * @param {{ shots?: any[] }[]} mediaChapters
 * @returns {Map<string, { status: string, kind: string | null, source: string | null, relevance: number | null, total: number | null, offWhy: string, by: string | null }>}
 */
export function scoreMap(mediaChapters) {
  /** @type {Map<string, any>} */
  const map = new Map();
  for (const ch of mediaChapters ?? []) {
    for (const s of ch?.shots ?? []) {
      if (s?.scene === undefined || s?.shot === undefined) continue;
      const why = s.why ?? {};
      map.set(`${s.scene}-${s.shot}`, {
        status: s.status ?? (s.pick ? "found" : "missing"),
        kind: s.pick?.kind ?? null,
        source: s.pick?.source ?? null,
        relevance: Number.isFinite(Number(why.relevance)) ? Number(why.relevance) : null,
        total: Number.isFinite(Number(why.total)) ? Number(why.total) : null,
        offWhy: String(why.offWhy ?? ""),
        by: why.by ? String(why.by) : null,
      });
    }
  }
  return map;
}

/** The words on a tile: the shot id, what it is, and the score when it has one. */
export function labelOf(s) {
  const kind = s.type === "card" ? "card" : String(s.shotType ?? s.type ?? "shot");
  const score = typeof s.score === "number" ? s.score.toFixed(2) : "—";
  return `${s.id} · ${kind} · ${score}`;
}

/**
 * The sheets, as data: per chapter every shot with the frame time, the type and
 * the score, and the reasons it is weak (each naming the mission it goes back to).
 * @param {any} timeline
 * @param {Map<string, any>} [scores]
 */
export function planSheets(timeline, scores = new Map()) {
  const video = timeline?.video ?? [];
  /** @type {Map<string, number>} */
  const uses = new Map();
  for (const v of video) if (v.url) uses.set(String(v.url), (uses.get(String(v.url)) ?? 0) + 1);
  const chapters = chaptersOf(video).map((c) => {
    const shots = c.shots.map((v) => {
      const sc = scores.get(String(v.id)) ?? {};
      /** @type {{ code: string, to: "M3" | "M4", params: Record<string, any> }[]} */
      const reasons = [];
      if (typeof sc.relevance === "number" && sc.relevance < HOUSE.relevance) {
        reasons.push({ code: "sheet.relevance", to: "M3", params: { shot: v.id, score: round(sc.relevance, 3), floor: HOUSE.relevance } });
      }
      if (sc.offWhy) reasons.push({ code: "sheet.offWorld", to: "M3", params: { shot: v.id, why: String(sc.offWhy).slice(0, 120) } });
      const times = uses.get(String(v.url)) ?? 0;
      if (times > HOUSE.repeatLimit) reasons.push({ code: "sheet.repeat", to: "M3", params: { shot: v.id, times, limit: HOUSE.repeatLimit } });
      if (v.type === "card") {
        // A card standing in for footage the eyes could not find, and an empty card, are two different faults.
        if (sc.status === "missing") reasons.push({ code: "sheet.missing", to: "M3", params: { shot: v.id } });
        else if (!v.counter && !v.kinetic && !v.chart && !v.map && !v.chapterTitle && !String(v.text ?? "").trim()) {
          reasons.push({ code: "sheet.card", to: "M4", params: { shot: v.id } });
        }
      }
      const seconds = round((Number(v.end) || 0) - (Number(v.start) || 0));
      if (seconds < HOUSE.shortShot) reasons.push({ code: "sheet.short", to: "M4", params: { shot: v.id, value: seconds } });
      const at = round((Number(v.start) + Number(v.end)) / 2, 3);
      return {
        id: String(v.id), scene: v.scene, shot: v.shot, type: v.type, shotType: v.shotType ?? null,
        start: round(Number(v.start)), end: round(Number(v.end)), at, label: labelOf({ id: v.id, type: v.type, shotType: v.shotType, score: sc.relevance ?? null }),
        score: typeof sc.relevance === "number" ? sc.relevance : null, kind: sc.kind ?? null, source: sc.source ?? null, reasons,
      };
    });
    const total = shots.reduce((n, s) => n + (s.end - s.start), 0);
    const still = c.shots.filter((v) => !MOVING.has(String(v.type))).reduce((n, v) => n + (Number(v.end) - Number(v.start)), 0);
    const stillShare = total ? still / total : 0;
    /** @type {{ code: string, to: "M3" | "M4", params: Record<string, any> }[]} */
    const reasons = [];
    if (total && stillShare > HOUSE.stillShare) {
      reasons.push({ code: "sheet.still", to: "M3", params: { chapter: c.id, value: round(stillShare * 100, 0), floor: round(HOUSE.stillShare * 100, 0) } });
    }
    return { id: c.id, title: c.title, from: round(c.from), to: round(c.to), seconds: round(c.to - c.from), stillShare: round(stillShare, 3), shots, reasons };
  });
  return { seconds: round(Number(timeline?.durationSeconds) || 0), chapters };
}

/**
 * Every weak shot, flat, with the chapter it sits in.
 * @param {ReturnType<typeof planSheets>} plan
 */
export function weakShots(plan) {
  /** @type {{ id: string, chapter: string, to: "M3" | "M4", label: string, at: number, reasons: any[] }[]} */
  const out = [];
  for (const c of plan.chapters) {
    for (const r of c.reasons) out.push({ id: c.id, chapter: c.id, to: r.to, label: `${c.id} (chapter)`, at: c.from, reasons: [r] });
    for (const s of c.shots) {
      if (!s.reasons.length) continue;
      out.push({
        id: s.id, chapter: c.id, to: s.reasons.some((r) => r.to === "M4") ? "M4" : "M3",
        label: s.label, at: s.at, reasons: s.reasons,
      });
    }
  }
  return out;
}

/**
 * The round a weak shot is in, and whether it has already been bounced twice.
 * @param {{ ids?: string[] }[]} history the rounds already run (ids sent back)
 * @param {ReturnType<typeof weakShots>} weak
 */
export function planReturn(history, weak) {
  /** @type {Map<string, number>} */
  const seen = new Map();
  for (const r of history ?? []) for (const id of new Set(r.ids ?? [])) seen.set(id, (seen.get(id) ?? 0) + 1);
  /** @type {(ReturnType<typeof weakShots>[number] & { round: number })[]} */
  const send = [];
  /** @type {(ReturnType<typeof weakShots>[number] & { round: number })[]} */
  const escalate = [];
  for (const w of weak) {
    const round = (seen.get(w.id) ?? 0) + 1;
    if (round > HOUSE.maxReturns) escalate.push({ ...w, round });
    else send.push({ ...w, round });
  }
  return { send, escalate, round: (history?.length ?? 0) + 1 };
}

/** The tile filter: the frame fitted and centred, a caption bar under it, a red frame when weak. */
function tileFilter({ width, height, bar, weak, font }) {
  const parts = [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=0x0b110e`,
    "setsar=1",
  ];
  if (weak) parts.push(`drawbox=x=0:y=0:w=${width}:h=${height}:color=0xD32F2F:t=3`);
  parts.push(`pad=${width}:${height + bar}:0:0:color=0x111111`);
  return parts.join(",");
}

/**
 * Draw the sheets: one frame per shot, from the rendered film, at the shot's
 * midpoint, assembled into a grid per chapter.
 * @param {{
 *   film: string, plan: ReturnType<typeof planSheets>, outBase: string,
 *   cols?: number, tile?: [number, number], font?: string | null, workDir?: string,
 *   ffmpeg?: string, log?: (line: string) => void, weak?: ReturnType<typeof weakShots>,
 * }} o
 * @returns {Promise<{ chapter: string, file: string, shots: number, weak: number }[]>}
 */
export async function renderSheets(o) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const [width, height] = o.tile ?? HOUSE.tile;
  const cols = o.cols ?? HOUSE.cols;
  const bar = HOUSE.bar;
  const { margin, padding } = HOUSE;
  const weakIds = new Set((o.weak ?? weakShots(o.plan)).map((w) => w.id));
  const work = o.workDir ?? join(dirname(o.outBase), ".sheets");
  mkdirSync(work, { recursive: true });
  const esc = (/** @type {string} */ p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
  /** @type {{ chapter: string, file: string, shots: number, weak: number }[]} */
  const out = [];
  for (const c of o.plan.chapters) {
    if (!c.shots.length) continue;
    const dir = join(work, c.id);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    const rows = Math.ceil(c.shots.length / cols);
    const count = rows * cols;
    for (let k = 0; k < count; k += 1) {
      const file = join(dir, `tile-${String(k + 1).padStart(3, "0")}.jpg`);
      const s = c.shots[k];
      if (!s) {
        // An unfinished last row is a plain dark tile, so no chapter's frame is drawn twice to fill it.
        await run(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `color=c=0x111111:s=${width}x${height + bar}`, "-frames:v", "1", "-q:v", "4", file]);
        continue;
      }
      const weak = weakIds.has(s.id) || (s.reasons?.length ?? 0) > 0;
      const filter = [tileFilter({ width, height, bar, weak, font: o.font ?? null })];
      if (o.font) {
        const text = join(dir, `label-${String(k + 1).padStart(3, "0")}.txt`);
        writeFileSync(text, s.label);
        filter.push(`drawtext=expansion=none:fontfile='${esc(o.font)}':textfile='${esc(text)}':fontcolor=${weak ? "0xFF8A80" : "0xFFFFFF"}:fontsize=${Math.round(bar * 0.5)}:x=${Math.round(bar * 0.25)}:y=${height + Math.round(bar * 0.22)}`);
      }
      await run(ffmpeg, ["-v", "error", "-y", "-ss", s.at.toFixed(3), "-i", o.film, "-frames:v", "1", "-vf", filter.join(","), "-q:v", "3", file]);
    }
    const file = `${o.outBase}.sheet-${c.id}.jpg`;
    await run(ffmpeg, [
      "-v", "error", "-y", "-framerate", "1", "-i", join(dir, "tile-%03d.jpg"),
      "-vf", `tile=${cols}x${rows}:margin=${margin}:padding=${padding}:color=0x171717`,
      "-frames:v", "1", "-q:v", "3", file + ".part.jpg",
    ]);
    renameSync(file + ".part.jpg", file);
    out.push({ chapter: c.id, file, shots: c.shots.length, weak: c.shots.filter((s) => weakIds.has(s.id)).length });
    o.log?.(`sheet ${c.id}: ${c.shots.length} shots (${out[out.length - 1].weak} weak) -> ${basename(file)}`);
  }
  rmSync(work, { recursive: true, force: true });
  return out;
}

/** Both languages of one finding, for the log and the console. */
export function sayFinding(f) {
  return f.reasons.map((/** @type {any} */ r) => `${say({ code: r.code, params: r.params }, "en")}\n${say({ code: r.code, params: r.params }, "bn")}`).join("\n");
}

/** The media files of a run folder, as `scoreMap` wants them. @param {string} dir */
export function readMedia(dir) {
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^media-.*\.json$/i.test(f))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      film: { type: "string" }, timeline: { type: "string" }, run: { type: "string" }, out: { type: "string" },
      cols: { type: "string" }, tile: { type: "string" }, font: { type: "string" },
    },
  });
  if (!values.film || !values.timeline) {
    console.error("Usage: node render/contact-sheet.mjs --film out/<id>.mp4 --timeline out/<id>.timeline.json [--run films/<folder>] [--out out/<id>] [--cols 6] [--tile 400x225] [--font <ttf>]");
    process.exit(2);
  }
  const timeline = JSON.parse(readFileSync(values.timeline, "utf8"));
  const plan = planSheets(timeline, scoreMap(readMedia(values.run ?? "")));
  const weak = weakShots(plan);
  const outBase = values.out ?? values.film.replace(/\.mp4$/i, "");
  const tile = values.tile ? /** @type {[number, number]} */ (values.tile.split("x").map(Number)) : undefined;
  const font = values.font ?? ["render/assets/fonts/Inter-Bold.ttf", "assets/fonts/Inter-Bold.ttf"].find((f) => existsSync(f)) ?? null;
  const sheets = await renderSheets({ film: values.film, plan, outBase, cols: values.cols ? Number(values.cols) : undefined, tile, font, weak, log: (l) => console.log(l) });
  // The rounds already run, so a shot that keeps failing is escalated rather than bounced forever.
  const returnsFile = `${outBase}.returns.json`;
  const history = existsSync(returnsFile) ? JSON.parse(readFileSync(returnsFile, "utf8")) : { rounds: [] };
  const ret = planReturn(history.rounds, weak);
  history.rounds.push({ round: ret.round, at: new Date().toISOString(), ids: ret.send.map((w) => w.id) });
  for (const w of ret.send) console.log(`\nROUND ${w.round} -> ${w.to}: ${w.label}\n${sayFinding(w)}`);
  for (const w of ret.escalate) console.log(`\nESCALATE (round ${w.round}, already sent back ${HOUSE.maxReturns} times) -> ${w.label}\n${say({ code: "sheet.escalate", params: { shot: w.id, rounds: HOUSE.maxReturns } }, "en")}\n${say({ code: "sheet.escalate", params: { shot: w.id, rounds: HOUSE.maxReturns } }, "bn")}`);
  writeFileSync(returnsFile, JSON.stringify({ film: basename(values.film), rounds: history.rounds, pending: ret.send, escalated: ret.escalate }, null, 1));
  writeFileSync(`${outBase}.sheets.json`, JSON.stringify({ film: basename(values.film), at: new Date().toISOString(), sheets, plan, weak, returnPlan: { round: ret.round, send: ret.send, escalate: ret.escalate } }, null, 1));
  const m3 = weak.filter((w) => w.to === "M3").length;
  const m4 = weak.filter((w) => w.to === "M4").length;
  const summary = { code: "sheet.summary", params: { sheets: sheets.length, shots: plan.chapters.reduce((n, c) => n + c.shots.length, 0), weak: weak.length, m3, m4, round: ret.round, escalated: ret.escalate.length } };
  console.log(`\n${say(summary, "en")}\n${say(summary, "bn")}`);
  if (ret.escalate.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
}
