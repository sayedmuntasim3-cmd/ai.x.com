#!/usr/bin/env node
/**
 * Exact-match copy check (Phase 0, C4): the longest runs of identical words
 * between a film's narration and the pages its research used. Any run of
 * --min words (12 by default) or more is reported with the quote and the
 * page, so copied sentences from sources are found in code, not by eye.
 *
 * Pages: the research desk's corpus (research-corpus.json) when there is
 * one, and every page research.json cites, opened again (public hosts only).
 * What it cannot see: other creators' videos (no transcripts are used).
 *
 *   node local/copy-check.mjs --run films/<slug> [--min 12] [--no-fetch]
 *
 * Writes copy-check.json in the film folder.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { readPage } from "../engine/src/research-desk.mjs";
import { parseSceneLines } from "../engine/src/scene-lines.mjs";
import { guardedFetch } from "./run-film.mjs";

export const COPY_MIN_WORDS = 12;

/** Lowercased words, apostrophes unified. @param {string} text */
export function words(text) {
  return String(text ?? "").toLowerCase().normalize("NFKC").replace(/[‘’]/g, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
}

/**
 * Every maximal run of at least min identical words shared by the narration
 * and one source, longest first.
 * @param {string} narration @param {{ url: string, text: string }[]} sources @param {number} [min]
 * @returns {{ words: number, quote: string, url: string }[]}
 */
export function sharedRuns(narration, sources, min = COPY_MIN_WORDS) {
  const a = words(narration);
  /** @type {{ words: number, quote: string, url: string }[]} */
  const found = [];
  for (const s of sources) {
    const b = words(s.text);
    if (b.length < min || a.length < min) continue;
    /** @type {Map<string, number[]>} */
    const index = new Map();
    for (let j = 0; j + min <= b.length; j += 1) {
      const key = b.slice(j, j + min).join(" ");
      const list = index.get(key);
      if (list) list.push(j); else index.set(key, [j]);
    }
    for (let i = 0; i + min <= a.length;) {
      const starts = index.get(a.slice(i, i + min).join(" "));
      if (!starts) { i += 1; continue; }
      let best = 0;
      for (const j of starts) {
        let n = min;
        while (i + n < a.length && j + n < b.length && a[i + n] === b[j + n]) n += 1;
        best = Math.max(best, n);
      }
      found.push({ words: best, quote: a.slice(i, i + best).join(" "), url: s.url });
      i += best;
    }
  }
  return found.sort((x, y) => y.words - x.words);
}

/** The finished script's narration (s5-<chapter>.md; drafts left out). @param {string} dir */
export function filmNarration(dir) {
  const files = readdirSync(dir).filter((f) => /^s5-[^.]+\.md$/.test(f)).sort();
  return files.map((f) => parseSceneLines(readFileSync(join(dir, f), "utf8")).map((s) => s.narration).join(" ")).join(" ");
}

/**
 * @param {string} dir @param {{ min?: number, fetch?: typeof fetch | null }} [o] fetch null: corpus only
 */
export async function copyCheck(dir, o = {}) {
  const min = o.min ?? COPY_MIN_WORDS;
  const narration = filmNarration(dir);
  /** @type {{ url: string, text: string }[]} */
  const sources = [];
  const corpusFile = join(dir, "research-corpus.json");
  if (existsSync(corpusFile)) for (const d of JSON.parse(readFileSync(corpusFile, "utf8")).docs ?? []) sources.push({ url: String(d.url), text: String(d.text ?? "") });
  const researchFile = join(dir, "research.json");
  const cited = existsSync(researchFile) ? [...new Set((JSON.parse(readFileSync(researchFile, "utf8")).facts ?? []).flatMap((/** @type {any} */ f) => (Array.isArray(f.sources) ? f.sources : [])).map(String))] : [];
  let opened = 0;
  /** @type {string[]} */
  const unread = [];
  if (o.fetch !== null) {
    const get = guardedFetch(o.fetch ?? fetch);
    for (const url of cited.filter((u) => !sources.some((s) => s.url === u))) {
      const page = await readPage(get, url);
      if (page) { sources.push({ url, text: page.text }); opened += 1; } else unread.push(url);
    }
  }
  const runs = sharedRuns(narration, sources, min);
  return { min, narrationWords: words(narration).length, sources: sources.length, pagesOpened: opened, pagesUnread: unread, flagged: runs.length, longest: runs[0]?.words ?? 0, runs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { run: { type: "string" }, min: { type: "string" }, "no-fetch": { type: "boolean" } } });
  if (!values.run) { console.error("Give the film folder: --run films/<slug>"); process.exit(1); }
  const dir = resolve(values.run);
  const result = await copyCheck(dir, { min: values.min ? Number(values.min) : undefined, fetch: values["no-fetch"] ? null : undefined });
  writeFileSync(join(dir, "copy-check.json"), JSON.stringify(result, null, 1));
  console.log(`${result.narrationWords} narration words against ${result.sources} pages (${result.pagesUnread.length} could not be read): ${result.flagged} run(s) of ${result.min}+ identical words; longest ${result.longest}.`);
  for (const r of result.runs.slice(0, 20)) console.log(`  ${r.words} words, ${r.url}\n    "${r.quote}"`);
}
