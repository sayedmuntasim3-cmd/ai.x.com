#!/usr/bin/env node
/**
 * The daily "Gemini watches winning films" job (free: the Worker's own Gemini key, 20 requests a day per model).
 *
 *   node local/youtube-watch.mjs            watch up to 15 new films, recompute the medians, rewrite
 *                                           engine/src/watch-measured.mjs (+ the studio copy) and docs/research/YOUTUBE_WATCH_MEASURED.md
 *   node local/youtube-watch.mjs --print    only print the next candidates (no network)
 *
 * Auth to the Worker: GitHub's OIDC token of youtube-watch.yml (no stored secret), or STUDIO_TOKEN in the environment.
 * Candidates: 1M+ English rows of docs/research/data/*.json, best channels first. A 429 from the Worker ends the day.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { measuredModuleText, summarizeWatches, targetsFromSummary, MIN_FILMS_FOR_TARGETS } from "../engine/src/youtube-watch.mjs";

export const DAILY_MAX = 15;
export const AUDIENCE = "zupona-youtube-watch";
/** Best channels first (the owner's list), then everything else by views. */
export const CHANNEL_ORDER = Object.freeze(["Plainly Difficult", "Storified", "ColdFusion", "Real Engineering", "Practical Engineering", "Documentary Overload"]);

/** A title that is plainly English: mostly ASCII letters, no other script. @param {string} t */
/** Titles about money, not engineering (the niche is fixed: Engineering Disasters & Megaprojects). */
export const OFF_NICHE = /\b(ftx|ponzi|bank(s|ing)?|fraud|bitcoin|crypto|stocks?|ipo|investors?|billion|profits?|economy|economic|netflix|evergrande|scandal)\b/i;

export const looksEnglish = (t) => {
  const letters = [...String(t)].filter((c) => /\p{L}/u.test(c));
  return letters.length >= 8 && letters.filter((c) => /[A-Za-z]/.test(c)).length / letters.length >= 0.95;
};

/**
 * The next films to watch: 1M+ views, English title, 8 to 45 minutes, not watched yet, best channels first.
 * @param {any[]} rows rows with id, title, views, durationSeconds and channel or channelTitle
 * @param {Set<string>} watched @param {number} max
 */
export function pickCandidates(rows, watched, max = DAILY_MAX) {
  /** @type {Map<string, any>} */ const byId = new Map();
  for (const r of rows) {
    const channel = r.channel ?? r.channelTitle ?? "";
    if (!r?.id || watched.has(r.id) || byId.has(r.id)) continue;
    if (!(r.views >= 1_000_000) || !(r.durationSeconds >= 480 && r.durationSeconds <= 2700) || !looksEnglish(r.title) || OFF_NICHE.test(r.title)) continue;
    byId.set(r.id, { id: r.id, title: r.title, channel, views: r.views, durationSeconds: r.durationSeconds });
  }
  const rank = (/** @type {string} */ c) => { const i = CHANNEL_ORDER.indexOf(c); return i < 0 ? CHANNEL_ORDER.length : i; };
  return [...byId.values()].sort((a, b) => rank(a.channel) - rank(b.channel) || b.views - a.views).slice(0, max);
}

const pct = (/** @type {number | null} */ v) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);
/** The measured numbers as a markdown table, every line tagged measured. @param {ReturnType<typeof summarizeWatches>} s @param {any[]} records */
export function measuredMarkdown(s, records) {
  const rows = [...records].sort((a, b) => a.videoId.localeCompare(b.videoId)).map((r) => `| ${r.videoId} | ${Math.round(r.lengthSeconds / 60)} min | ${Math.round(r.wordsPerMinute)} | ${r.avgShotSeconds.toFixed(1)} | ${r.firstNumberAtSec}s | ${r.firstStakeAtSec}s | ${pct(r.shares.mapsDiagramsAnimation)} | ${r.revealsSec.length} |`);
  return [
    "# What Gemini measured by watching winning films [measured]",
    "",
    `Written by \`local/youtube-watch.mjs\` (daily). Gemini watched **${s.n}** films (video input, public YouTube URLs). The platform uses these numbers as targets only from ${MIN_FILMS_FOR_TARGETS} films on (\`engine/src/watch-measured.mjs\`). These are the model's counts, not exact frame counts: use them as medians, not as law.`,
    "",
    "| Measure [measured] | Number |", "|---|---|",
    `| Films watched | ${s.n} |`,
    `| Length, median | ${s.lengthMinutes} min |`,
    `| Words per minute (25th / median / 75th) | ${s.wpm.p25} / ${s.wpm.median} / ${s.wpm.p75} |`,
    `| Seconds per shot (25th / median / 75th) | ${s.shotSeconds.p25} / ${s.shotSeconds.median} / ${s.shotSeconds.p75} |`,
    `| First number spoken at, median | ${s.firstNumberAtSec} s |`,
    `| First stake clear at, median | ${s.firstStakeAtSec} s |`,
    `| Maps, diagrams, animation share (25th / median / 75th) | ${pct(s.graphicsShare.p25)} / ${pct(s.graphicsShare.median)} / ${pct(s.graphicsShare.p75)} |`,
    `| Share of footage: archive / on-screen text / talking heads / stock | ${pct(s.shares.archive)} / ${pct(s.shares.onScreenText)} / ${pct(s.shares.talkingHeads)} / ${pct(s.shares.stock)} |`,
    `| Gap between chapter turns, median | ${s.chapterGapSeconds} s |`,
    `| Gap between reveals, median | ${s.revealGapSeconds} s |`,
    `| First / last reveal at (share of the length) | ${pct(s.firstRevealAtFraction)} / ${pct(s.lastRevealAtFraction)} |`,
    "", `Targets in force: ${s.n >= MIN_FILMS_FOR_TARGETS ? "```" + JSON.stringify(targetsFromSummary(s)) + "```" : `none yet (${s.n} of ${MIN_FILMS_FOR_TARGETS} films)`}`,
    "", "## Per film", "", "| Video id | Length | wpm | s/shot | First number | First stake | Graphics | Reveals |", "|---|---|---|---|---|---|---|---|", ...rows, "",
  ].join("\n");
}

async function oidc() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return "";
  const res = await fetch(`${url}&audience=${AUDIENCE}`, { headers: { authorization: `Bearer ${bearer}` } });
  return res.ok ? String((await res.json())?.value ?? "") : "";
}

async function main() {
  const rows = ["docs/research/data/first-video-search-2026-11-28.json", "docs/research/data/engineering-reference-videos.json"].flatMap((f) => JSON.parse(readFileSync(f, "utf8")));
  const site = process.env.SITE || "https://ai-x-com.sayedmuntasim3.workers.dev";
  const token = process.env.STUDIO_TOKEN || (await oidc());
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const listed = process.argv.includes("--print") ? { watched: [] } : await (await fetch(`${site}/api/youtube-watch`, { headers })).json();
  if (!Array.isArray(listed.watched)) { console.error("The Worker did not list the watched films:", JSON.stringify(listed).slice(0, 200)); process.exit(1); }
  const next = pickCandidates(rows, new Set(listed.watched));
  if (process.argv.includes("--print")) { console.log(next.map((c) => `${c.id}  ${c.channel}  ${c.title}`).join("\n")); return; }
  let done = 0, failed = 0, stopped = listed.stoppedToday === true;
  for (const c of stopped ? [] : next) {
    const res = await fetch(`${site}/api/youtube-watch`, { method: "POST", headers, body: JSON.stringify({ videoId: c.id }) });
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) { console.log(`Quota used up after ${done} films; stopped for the day.`); stopped = true; break; }
    if (res.ok) { done++; console.log(`watched ${c.id} (${c.channel}) wpm=${body.record?.wordsPerMinute}`); } else { failed++; console.log(`skipped ${c.id}: ${res.status} ${body.error ?? ""}`.slice(0, 240)); if (failed >= 3 && !done) { console.log("Three failures in a row; stopping for today."); break; } }
  }
  const all = await (await fetch(`${site}/api/youtube-watch?all=1`, { headers })).json();
  const records = Array.isArray(all.records) ? all.records : [];
  const summary = summarizeWatches(records);
  if (!summary.n) { console.log("No measured films yet; data files unchanged."); return; }
  writeFileSync("engine/src/watch-measured.mjs", measuredModuleText({ n: summary.n, updated: new Date().toISOString().slice(0, 10), summary }));
  mkdirSync("public/studio/engine", { recursive: true });
  copyFileSync("engine/src/watch-measured.mjs", "public/studio/engine/watch-measured.mjs");
  writeFileSync("docs/research/YOUTUBE_WATCH_MEASURED.md", measuredMarkdown(summary, records));
  console.log(`Today: ${done} new films. Total measured: ${summary.n}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(String(e?.message ?? e)); process.exit(1); });
