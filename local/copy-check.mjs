#!/usr/bin/env node
/**
 * Exact-match copy check (Phase 0, C4): the longest runs of identical words
 * between a film's narration and the pages its research used. Any run of
 * --min words (12 by default) or more is reported with the quote and the
 * page, so copied sentences from sources are found in code, not by eye.
 *
 * Two more signals, also code: close paraphrase (a narration sentence of 8+
 * words whose word trigrams are at least half found in one page: copying
 * with small edits), and source-order dependence (most matched sentences
 * come from one page, in that page's own order: the script retells one
 * source instead of building its own structure).
 *
 * Pages: the research desk's corpus (research-corpus.json) when there is
 * one, and every page research.json cites, opened again (public hosts only).
 *
 * What it cannot detect: paraphrase with different words (synonyms,
 * reordered clauses), translation, ideas or structure taken from other
 * creators' videos (no transcripts are used, by rule), or a source the
 * research never opened. Those are judged by the readers and the AI critic.
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
import { parseSceneLines, splitSentences } from "../engine/src/scene-lines.mjs";
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

export const PARAPHRASE = Object.freeze({ minWords: 8, share: 0.5 });

/** Word trigrams of a text. @param {string[]} w */
const trigrams = (w) => { const out = new Set(); for (let i = 0; i + 3 <= w.length; i += 1) out.add(w.slice(i, i + 3).join(" ")); return out; };

/**
 * Close paraphrase and source-order dependence.
 * @param {string} narration @param {{ url: string, text: string }[]} sources
 */
export function paraphraseSignals(narration, sources) {
  const pages = sources.map((s) => {
    const w = words(s.text);
    /** @type {Map<string, number[]>} positions of each trigram */
    const at = new Map();
    for (let i = 0; i + 3 <= w.length; i += 1) { const k = w.slice(i, i + 3).join(" "); const l = at.get(k); if (l) l.push(i); else at.set(k, [i]); }
    return { url: s.url, at };
  });
  const sentences = splitSentences(narration).map((s) => (typeof s === "string" ? s : String(/** @type {any} */ (s).text ?? ""))).filter((s) => words(s).length >= PARAPHRASE.minWords);
  /** @type {{ sentence: string, url: string, share: number, position: number }[]} */
  const matched = [];
  for (const sentence of sentences) {
    const grams = [...trigrams(words(sentence))];
    let best = { url: "", share: 0, position: -1 };
    for (const p of pages) {
      const hits = grams.filter((g) => p.at.has(g));
      const share = grams.length ? hits.length / grams.length : 0;
      // Where in the page the sentence sits: trigrams that occur once there place it; common phrases do not.
      const unique = hits.map((g) => /** @type {number[]} */ (p.at.get(g))).filter((l) => l.length === 1).map((l) => l[0]);
      const place = unique.length ? unique : hits.map((g) => /** @type {number[]} */ (p.at.get(g))[0]);
      if (share > best.share) best = { url: p.url, share, position: median(place) };
    }
    if (best.share >= 0.25) matched.push({ sentence, ...best });
  }
  const close = matched.filter((m) => m.share >= PARAPHRASE.share).map((m) => ({ ...m, share: Math.round(m.share * 100) / 100 }));
  // Source-order dependence: the page most sentences lean on, and how much of that lean follows its order.
  /** @type {Map<string, number[]>} */
  const byPage = new Map();
  for (const m of matched) { const l = byPage.get(m.url) ?? []; l.push(m.position); byPage.set(m.url, l); }
  const [topUrl, positions] = [...byPage.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? ["", []];
  const inOrder = longestIncreasing(positions);
  return {
    sentences: sentences.length,
    closeParaphrase: close,
    order: { url: topUrl, sentences: positions.length, shareOfScript: sentences.length ? Math.round((positions.length / sentences.length) * 100) / 100 : 0, inSourceOrder: positions.length ? Math.round((inOrder / positions.length) * 100) / 100 : 0,
      flagged: sentences.length >= 10 && positions.length / sentences.length >= 0.4 && inOrder / Math.max(1, positions.length) >= 0.8 },
  };
}

/** @param {number[]} a */
function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : -1; }

/** Length of the longest strictly increasing subsequence. @param {number[]} a */
function longestIncreasing(a) {
  /** @type {number[]} */
  const tails = [];
  for (const x of a) { let lo = 0, hi = tails.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (tails[mid] < x) lo = mid + 1; else hi = mid; } tails[lo] = x; }
  return tails.length;
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
  const signals = paraphraseSignals(narration, sources);
  return { min, narrationWords: words(narration).length, sources: sources.length, pagesOpened: opened, pagesUnread: unread, flagged: runs.length, longest: runs[0]?.words ?? 0, runs, ...signals,
    cannotDetect: "paraphrase with different words, translation, structure or ideas from other creators' videos, sources the research never opened" };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { run: { type: "string" }, min: { type: "string" }, "no-fetch": { type: "boolean" } } });
  if (!values.run) { console.error("Give the film folder: --run films/<slug>"); process.exit(1); }
  const dir = resolve(values.run);
  const result = await copyCheck(dir, { min: values.min ? Number(values.min) : undefined, fetch: values["no-fetch"] ? null : undefined });
  writeFileSync(join(dir, "copy-check.json"), JSON.stringify(result, null, 1));
  console.log(`${result.narrationWords} narration words against ${result.sources} pages (${result.pagesUnread.length} could not be read): ${result.flagged} run(s) of ${result.min}+ identical words; longest ${result.longest}.`);
  for (const r of result.runs.slice(0, 20)) console.log(`  ${r.words} words, ${r.url}\n    "${r.quote}"`);
  console.log(`Close paraphrase: ${result.closeParaphrase.length} of ${result.sentences} sentences (half or more of their word trigrams in one page).`);
  for (const p of result.closeParaphrase.slice(0, 10)) console.log(`  ${Math.round(p.share * 100)}% ${p.url}\n    "${p.sentence}"`);
  console.log(`Source order: ${Math.round(result.order.shareOfScript * 100)}% of sentences lean on ${result.order.url || "no page"}, ${Math.round(result.order.inSourceOrder * 100)}% of those in its order${result.order.flagged ? " (FLAGGED: the script retells one source)" : ""}.`);
  console.log(`Cannot detect: ${result.cannotDetect}.`);
}
