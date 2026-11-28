#!/usr/bin/env node
/**
 * Before a film is blocked, fix the shots that failed (film e0b87efb: the pictures were already searched
 * and ranked, the gate sent the whole film back, and the creator was left with nothing).
 *
 * When the release gate's blocks are all about single shots — a picture that does not fit its line
 * (relevance), the same picture twice (repeats), one look in a row (variety), a flicker, a blurred, a dark
 * or an empty shot — this picks ONLY those shots again from the next-best candidates the eyes already
 * found (rank order, the same relevance floor), so only the parts holding them are rendered again.
 * At most two rounds; then the film is handed over as a clearly marked DRAFT, never as released.
 *
 *   node render/autofix.mjs --run run --report out/film.report.json --parts 8 --round 1 --out out/autofix.json
 *   node render/autofix.mjs --report out/film.report.json --merge out/autofix.json   (the rounds into the report)
 *
 * Exit codes: 0 the round changed shots (JSON written), 2 nothing to fix or nothing better left, 1 bad use.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { STANDARD } from "./critic.mjs";
import { partRange } from "./render-film.mjs";

/** Rounds of re-picking before a film is handed over as a draft. */
export const MAX_ROUNDS = 2;

/**
 * The critic's blocks a better picture can answer. Every one of them is about one shot's own picture;
 * anything else (the mix, the subtitles, the hook, the designed moments) is not fixed by a re-pick.
 */
export const SHOT_CODES = Object.freeze([
  "critic.relevance",
  "critic.repeats",
  "critic.repeatWindow",
  "critic.variety",
  "critic.flicker",
  "critic.blurred",
  "critic.dark",
  "critic.black",
  "critic.media",
  "critic.frozen",
  // Picture taste (#123) and the crew's picture agents (render/film-agents.mjs): each is one shot's own picture.
  "critic.unfilled",
  "critic.samePicture",
  "critic.logo",
  "critic.tilted",
  "critic.exposure",
  "critic.cast",
  "critic.artifact",
  "critic.glitch",
  "critic.hold",
  "critic.openBlack",
  "critic.pictureOutOfPlace",
]);

/** A shot type that needs a picture to draw (a card draws itself). Same list as the critic's. */
const PICTURED = new Set(["clip", "live-video", "archival-video", "photo-designed", "photo-2.5D"]);

/** @param {any[]} findings */
export function blocksOf(findings) {
  return (Array.isArray(findings) ? findings : []).filter((f) => f?.severity === "block");
}

/**
 * Whether every block is a shot-level one, so a re-pick can answer it. A film blocked on the mix or the
 * hook is handed over as it is: no picture change would make it pass.
 * @param {any[]} findings
 */
export function shotLevelOnly(findings) {
  const blocks = blocksOf(findings);
  return blocks.length > 0 && blocks.every((f) => SHOT_CODES.includes(String(f.code)));
}

/**
 * The shots whose own picture the critic's blocks point at, from the render's own report.
 * @param {any} report
 * @returns {Map<string, string[]>} shot id -> the codes that put it here
 */
export function failingShots(report) {
  const shots = Array.isArray(report?.shots) ? report.shots : [];
  /** @type {Map<string, string[]>} */
  const out = new Map();
  /** @param {any} id @param {string} code */
  const add = (id, code) => {
    if (id === undefined || id === null || id === "") return;
    const k = String(id);
    const had = out.get(k) ?? [];
    if (!had.includes(code)) out.set(k, [...had, code]);
  };
  for (const s of shots) {
    if (PICTURED.has(String(s.type)) && !s.url) add(s.id, "critic.media");
    if (Number.isFinite(Number(s.relevance)) && Number(s.relevance) < STANDARD.relevanceMin) add(s.id, "critic.relevance");
  }
  const picture = report?.picture ?? {};
  for (const f of picture.flicker ?? []) add(f.id, "critic.flicker");
  for (const b of picture.blurred ?? []) add(b.id, "critic.blurred");
  for (const d of picture.dark ?? []) add(d.id, "critic.dark");
  // A stretch of black the script did not ask for: the picture shots that sit over it.
  for (const b of report?.master?.black ?? []) {
    for (const s of shots) if (PICTURED.has(String(s.type)) && Number(s.start) < Number(b.end) && Number(s.end) > Number(b.start)) add(s.id, "critic.black");
  }
  // Picture taste: a picture that does not fill the frame, a burned-in logo, the later one of two copies of one picture.
  const taste = report?.taste ?? {};
  for (const u of taste.unfilled ?? []) add(u.id, "critic.unfilled");
  for (const l of taste.logos ?? []) add(l.id, "critic.logo");
  for (const r of taste.repeats ?? []) add(r.b, "critic.samePicture");
  // The crew's picture agents name the failing shot and its code themselves; only blocks are re-picked.
  for (const r of report?.agents?.results ?? []) for (const f of r.findings ?? []) if (f.severity === "block" && SHOT_CODES.includes(String(f.code))) add(f.shot, String(f.code));
  for (const f of report?.agents?.plan ?? []) if (f.severity === "block" && SHOT_CODES.includes(String(f.code))) add(f.shot, String(f.code));
  // The same picture used more than the limit, and the same picture back inside the window.
  /** @type {Map<string, any[]>} */
  const uses = new Map();
  for (const s of shots) if (s.url) uses.set(String(s.url), [...(uses.get(String(s.url)) ?? []), s]);
  for (const list of uses.values()) {
    const sorted = [...list].sort((a, b) => Number(a.start) - Number(b.start));
    for (const s of sorted.slice(STANDARD.repeatLimit)) add(s.id, "critic.repeats");
    for (let i = 1; i < sorted.length; i += 1) if (Number(sorted[i].start) - Number(sorted[i - 1].start) < STANDARD.repeatWindow) add(sorted[i].id, "critic.repeatWindow");
  }
  // One look in a row: the shots past the run limit are the ones a different shot type can break.
  let run = 0;
  let previous = "";
  for (const s of shots) {
    const type = String(s.shotType ?? "");
    run = type && type === previous ? run + 1 : 1;
    previous = type;
    if (run > STANDARD.shotTypeRun) add(s.id, "critic.variety");
  }
  return out;
}

/**
 * Re-pick the failing shots from the next-best candidates already found (run/candidates-C1.json: rank
 * order, with the eyes' own numbers). A candidate another shot already uses is not taken, and one below
 * the critic's relevance floor is not an improvement. Never a new search, never a lower floor.
 * @param {any} media media-C1.json (its shots are changed in place)
 * @param {any} candidates candidates-C1.json
 * @param {Map<string, string[]>} failing
 * @param {{ round?: number }} [o]
 * @returns {{ changed: { id: string, scene?: any, shot?: any, codes: string[], from: string | null, to: string, title: string, relevance: { before: number | null, after: number | null } }[], skipped: { id: string, codes: string[], why: string }[] }}
 */
export function repick(media, candidates, failing, o = {}) {
  const shots = Array.isArray(media?.shots) ? media.shots : [];
  /** @type {Map<string, any[]>} */
  const ranked = new Map();
  for (const c of candidates?.shots ?? []) if (c?.id) ranked.set(String(c.id), Array.isArray(c.ranked) ? c.ranked : []);
  /** @type {Set<string>} */
  const used = new Set();
  for (const s of shots) if (s.pick?.id) used.add(String(s.pick.id));
  const changed = [];
  const skipped = [];
  for (const s of shots) {
    const codes = failing.get(String(s.id));
    if (!codes?.length) continue;
    const current = s.pick?.id ? String(s.pick.id) : null;
    const beforeRelevance = Number.isFinite(Number(s.why?.relevance)) ? Number(s.why.relevance) : null;
    // A candidate this shot has already been given in an earlier round is not offered again.
    const tried = new Set([...(s.why?.autofix?.tried ?? []).map(String), ...(current ? [current] : [])]);
    const list = ranked.get(String(s.id)) ?? [];
    const next = list.find((c) => {
      const id = String(c?.pick?.id ?? c?.id ?? "");
      if (!id || tried.has(id) || used.has(id)) return false;
      if (!c?.pick?.mediaUrl) return false;
      const rel = Number(c.relevance);
      return !Number.isFinite(rel) || rel >= STANDARD.relevanceMin;
    });
    if (!next) {
      skipped.push({ id: s.id, codes, why: "no candidate left that another shot is not using and that passes the relevance floor" });
      continue;
    }
    const after = String(next.pick.id);
    used.add(after);
    s.pick = next.pick;
    s.status = "found";
    s.review = "autofix";
    s.alternates = list.filter((c) => String(c?.pick?.id) !== after).slice(0, 3).map((c) => String(c.pick.id));
    const afterRelevance = Number.isFinite(Number(next.relevance)) ? Number(next.relevance) : null;
    s.why = {
      ...(s.why ?? {}),
      by: `auto-fix round ${o.round ?? 1}: the next candidate after the quality check`,
      before: current,
      relevance: afterRelevance,
      candidates: list.length,
      autofix: { tried: [...new Set([...tried, after])] },
    };
    changed.push({ id: String(s.id), scene: s.scene, shot: s.shot, codes, from: current, to: after, title: String(next.pick.title ?? "").slice(0, 80), relevance: { before: beforeRelevance, after: afterRelevance } });
  }
  return { changed, skipped };
}

/**
 * Which render parts hold these shots: the same split the chunked render uses (whole shots, about equal
 * in frames), so only those parts are drawn again. Returns 1-based part numbers.
 * @param {any} report the render's report (its `shots` carry the frames)
 * @param {Iterable<string>} shotIds
 * @param {number} count how many parts the film was rendered in
 */
export function affectedParts(report, shotIds, count) {
  const shots = Array.isArray(report?.shots) ? report.shots : [];
  const want = new Set([...shotIds].map(String));
  const parts = new Set();
  if (!shots.length || !Number.isInteger(count) || count < 1) return [];
  const frames = shots.map((s) => ({ frames: Math.max(0, Number(s.frames) || 0) }));
  const total = frames.reduce((n, v) => n + v.frames, 0);
  // A report without frames (an older render) cannot be split exactly: the whole film is drawn again.
  if (!total) return Array.from({ length: count }, (_, i) => i + 1);
  for (let k = 0; k < count; k += 1) {
    const range = partRange(frames, k, count);
    for (let i = range.start; i < range.end; i += 1) if (want.has(String(shots[i].id))) { parts.add(k + 1); break; }
  }
  return [...parts].sort((a, b) => a - b);
}

/** The numbers a round is judged by, before and after, so the report says what a re-pick changed. @param {any} report */
export function numbersOf(report) {
  const shots = Array.isArray(report?.shots) ? report.shots : [];
  const scored = shots.filter((s) => Number.isFinite(Number(s.relevance)));
  const ok = scored.filter((s) => Number(s.relevance) >= STANDARD.relevanceMin).length;
  const m = report?.critic?.measures ?? {};
  return {
    relevance: scored.length ? Math.round((ok / scored.length) * 100) : null,
    designedPerMinute: m.designedPerMinute ?? null,
    opening: { cuts: m.cutsIn30 ?? null, moments: m.momentsIn30 ?? null },
    flicker: (report?.picture?.flicker ?? []).length,
    blurred: (report?.picture?.blurred ?? []).length,
    dark: (report?.picture?.dark ?? []).length,
    blocks: blocksOf(report?.critic?.findings).map((f) => String(f.code)),
  };
}

/**
 * The loop: fix the shots, run the gate again, at most two rounds; then say whether the film passed or
 * must be handed over as a draft. The render and the gate are given as functions, so the loop is tested
 * without a film.
 * @param {{
 *   report: any,
 *   media: any,
 *   candidates: any,
 *   parts: number,
 *   rerender: (o: { parts: number[], media: any, round: number }) => Promise<any>,
 *   rounds?: number,
 *   log?: (line: string) => void,
 * }} o
 * @returns {Promise<{ report: any, media: any, rounds: any[], passed: boolean }>}
 */
export async function autofixLoop(o) {
  const log = o.log ?? (() => {});
  const max = o.rounds ?? MAX_ROUNDS;
  let report = o.report;
  const media = o.media;
  const rounds = [];
  for (let round = 1; round <= max; round += 1) {
    const findings = report?.critic?.findings ?? [];
    if (report?.critic?.verdict !== "block") break;
    if (!shotLevelOnly(findings)) {
      rounds.push({ round, changed: [], skipped: [], stopped: "the blocks are not about single shots (the mix, the hook or the design), so a re-pick cannot answer them" });
      break;
    }
    const failing = failingShots(report);
    if (!failing.size) {
      rounds.push({ round, changed: [], skipped: [], stopped: "the report does not name the shots that failed" });
      break;
    }
    const before = numbersOf(report);
    const plan = repick(media, o.candidates, failing, { round });
    if (!plan.changed.length) {
      rounds.push({ round, changed: [], skipped: plan.skipped, before, after: before, stopped: "no better candidate was left for the failing shots" });
      break;
    }
    const parts = affectedParts(report, plan.changed.map((c) => c.id), o.parts);
    log(`Round ${round}: ${plan.changed.length} shot(s) re-picked; part(s) ${parts.join(", ")} rendered again.`);
    report = await o.rerender({ parts, media, round });
    const after = numbersOf(report);
    rounds.push({ round, changed: plan.changed, skipped: plan.skipped, parts, before, after });
    if (report?.critic?.verdict !== "block") break;
  }
  return { report, media, rounds, passed: report?.critic?.verdict !== "block" };
}

/** Add the rounds to the render's report (the gate's own file stays as it is). @param {any} report @param {any[]} rounds */
export function withRounds(report, rounds) {
  const list = Array.isArray(rounds) ? rounds : [];
  return { ...(report ?? {}), autofix: { rounds: list, roundsTried: list.filter((r) => (r.changed ?? []).length).length, changedShots: list.reduce((n, r) => n + (r.changed ?? []).length, 0) } };
}

/** The draft's own record: marked, with the plain reasons in both languages. @param {any} report @param {string} at */
export function draftRecord(report, at = new Date().toISOString()) {
  const blocks = blocksOf(report?.critic?.findings).map((f) => ({ code: String(f.code), en: String(f.en ?? f.code), bn: String(f.bn ?? f.code) }));
  return { draft: true, blocks: blocks.slice(0, 3), allBlocks: blocks.length, at };
}

/** @param {string} p */
function readJson(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

/**
 * @param {string[]} argv
 * @param {{ print?: (line: string) => void }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  const print = deps.print ?? ((/** @type {string} */ l) => console.log(l));
  const { values } = parseArgs({ args: argv, options: { run: { type: "string" }, report: { type: "string" }, parts: { type: "string" }, round: { type: "string" }, out: { type: "string" }, merge: { type: "string" } } });

  if (!values.report) { print("Give --report out/film.report.json."); return 1; }
  const report = existsSync(values.report) ? readJson(values.report) : null;
  if (!report) { print(`No report at ${values.report}.`); return 1; }

  // --merge: the rounds the rounds file holds go into the report, so the delivered report says what was tried.
  if (values.merge) {
    const rounds = existsSync(values.merge) ? (readJson(values.merge).rounds ?? []) : [];
    writeFileSync(values.report, JSON.stringify(withRounds(report, rounds), null, 1));
    print(`The report now carries ${rounds.length} auto-fix round(s).`);
    return 0;
  }

  if (!values.run) { print("Give --run run (the folder with media-C1.json and candidates-C1.json)."); return 1; }
  const mediaPath = join(values.run, "media-C1.json");
  const candidatePath = join(values.run, "candidates-C1.json");
  if (!existsSync(mediaPath) || !existsSync(candidatePath)) {
    print(`No ${existsSync(mediaPath) ? "candidates-C1.json" : "media-C1.json"} in ${values.run}: nothing to re-pick from.`);
    return 2;
  }
  // A film blocked on a mix of things: the shot-level blocks are answered here, the rest stay in the draft's reasons. Only a
  // film with no shot-level block at all is handed over as it is (a re-pick would change nothing).
  if (!blocksOf(report.critic?.findings).some((f) => SHOT_CODES.includes(String(f.code)))) {
    print("None of the gate's blocks is about a single shot; a re-pick cannot answer them.");
    return 2;
  }
  const failing = failingShots(report);
  if (!failing.size) { print("The report does not name the shots that failed."); return 2; }
  const round = Number(values.round) || 1;
  const count = Math.max(1, Number(values.parts) || 1);
  const media = readJson(mediaPath);
  const plan = repick(media, readJson(candidatePath), failing, { round });
  const parts = affectedParts(report, plan.changed.map((c) => c.id), count);
  const entry = { round, at: new Date().toISOString(), changed: plan.changed, skipped: plan.skipped, parts, before: numbersOf(report) };
  if (values.out) {
    const file = values.out;
    const kept = existsSync(file) ? (readJson(file).rounds ?? []) : [];
    writeFileSync(file, JSON.stringify({ rounds: [...kept.filter((r) => r.round !== round), entry].sort((a, b) => a.round - b.round) }, null, 1));
  }
  if (!plan.changed.length) { print("No better candidate was left for the failing shots."); return 2; }
  // The re-picked shots are written where the renderer reads them, so only those parts need drawing again.
  writeFileSync(mediaPath, JSON.stringify(media, null, 1));
  print(`Round ${round}: ${plan.changed.length} shot(s) re-picked (${plan.changed.map((c) => c.id).join(", ")}); part(s) ${parts.join(", ")}.`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
