// Ranking for documentary use. A good frame for a film is large enough to fill a 1080p or 4K
// screen, actually shows the subject, fits a 16:9 frame, and comes from a source with reliable
// quality. Results are then de-duplicated and interleaved so one archive cannot fill the page.

import type { Candidate, MediaResult, Orientation } from "./types";

const STOP_WORDS = new Set(
  "a an and are as at be by for from how in into is it its of on or the their this to was were what when where which who why with within over under about after before between through during without the de la le les el los las der die das".split(
    " ",
  ),
);

export function terms(query: string) {
  return [
    ...new Set(
      query
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^\p{L}\p{N}]+/u)
        .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
    ),
  ];
}

function stem(term: string) {
  return term.length > 4 ? term.replace(/(ies|es|s|ing|ed)$/, "") : term;
}

/** Share of query terms that appear in the candidate's text, 0 to 1. */
export function termMatch(candidate: Pick<Candidate, "title" | "description" | "tags" | "creator" | "collection">, words: string[]) {
  if (!words.length) return 0.5;
  const haystack = [candidate.title, candidate.description, candidate.creator, candidate.collection, ...(candidate.tags ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  let hits = 0;
  for (const word of words) if (haystack.includes(stem(word))) hits += 1;
  return hits / words.length;
}

export function longEdge(c: Pick<Candidate, "width" | "height" | "sizeHint">) {
  if (c.width && c.height) return Math.max(c.width, c.height);
  return c.sizeHint ?? 0;
}

export function qualityLabel(c: Pick<Candidate, "width" | "height" | "sizeHint">): MediaResult["quality"] {
  if (c.width && c.height) {
    const edge = Math.max(c.width, c.height);
    return edge >= 3840 ? "4K" : edge >= 1920 ? "HD" : "SD";
  }
  // A typical size is only a guess, so it never earns the 4K label.
  if (!c.sizeHint) return "?";
  return c.sizeHint >= 1920 ? "HD" : "SD";
}

function ratio(c: Candidate) {
  if (c.width && c.height) return c.width / c.height;
  return c.aspect;
}

/** How well the image fills a frame of the wanted orientation, 0 to 1. */
function frameFit(c: Candidate, orientation: Orientation) {
  const r = ratio(c);
  if (!r || !Number.isFinite(r)) return 0.5;
  const target = orientation === "portrait" ? 9 / 16 : 16 / 9;
  const fit = Math.exp(-Math.abs(Math.log(r / target)) * 1.4);
  // With no preference, landscape still matters (films are 16:9) but square art is fine for pans.
  return orientation === "any" ? 0.4 + 0.6 * fit : fit;
}

function resolution(c: Candidate) {
  const exact = c.width && c.height ? Math.max(c.width, c.height) : 0;
  const edge = exact || c.sizeHint || 0;
  if (!edge) return 0.3;
  const score = Math.min(1, Math.max(0, Math.log2(edge / 640) / Math.log2(6000 / 640)));
  // A typical size is a guess, so it counts for less than a measured one.
  return exact ? score : score * 0.85;
}

export function scoreCandidate(
  c: Candidate,
  info: { position: number; count: number; quality: number; topicMatch: boolean; terms: string[]; orientation: Orientation },
) {
  const match = termMatch(c, info.terms);
  const rank = 1 - info.position / Math.max(info.count, 1);
  const relevance = 0.6 * match + 0.4 * rank;
  const meta = (c.creator ? 0.4 : 0) + (c.date ? 0.3 : 0) + (c.description ? 0.3 : 0);
  const score =
    0.28 * resolution(c) +
    0.27 * relevance +
    0.17 * info.quality +
    0.12 * frameFit(c, info.orientation) +
    0.08 * (c.curated ? 1 : 0) +
    0.04 * meta +
    0.04 * (info.topicMatch ? 1 : 0);
  // A result that matches none of the words is usually noise from a loose full-text index.
  return match === 0 && info.terms.length > 0 ? score * 0.72 : score;
}

function normaliseUrl(url: string) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${decodeURIComponent(u.pathname).replace(/\/(\d+px-)?/g, "/").toLowerCase()}`;
  } catch {
    return url.toLowerCase();
  }
}

/** Keys that identify the same picture reached through different sources (e.g. Commons and Openverse). */
export function imageKeys(c: Pick<Candidate, "pageUrl" | "fullUrl" | "title" | "creator">) {
  const keys = [`p:${normaliseUrl(c.pageUrl)}`, `f:${normaliseUrl(c.fullUrl)}`];
  const title = c.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (title.length >= 12 && c.creator) keys.push(`t:${title}|${c.creator.toLowerCase().trim()}`);
  return keys;
}

/** Same archive and same title: pages of one book, impressions of one print, one species. */
function family(r: Pick<MediaResult, "source" | "title">) {
  return `${r.source}|${r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;
}

/** Keeps the best-scored copy of each picture. */
export function dedupe<T extends { score: number }>(items: T[], keysOf: (item: T) => string[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    const keys = keysOf(item);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(item);
  }
  return out;
}

/**
 * Greedy interleave: each further pick from the same source costs a little, and each further pick
 * from the same family (see `family`) costs more, so the page mixes archives and subjects without
 * throwing distinct images away.
 */
export function diversify<T extends { score: number; source: string }>(
  items: T[],
  limit: number,
  options: { penalty?: number; familyOf?: (item: T) => string; familyPenalty?: number } = {},
) {
  const { penalty = 0.035, familyOf, familyPenalty = 0.07 } = options;
  const pool = [...items].sort((a, b) => b.score - a.score);
  const bySource = new Map<string, number>();
  const byFamily = new Map<string, number>();
  const out: T[] = [];
  while (out.length < limit && pool.length) {
    let best = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const item = pool[i];
      const repeats = familyOf ? (byFamily.get(familyOf(item)) ?? 0) : 0;
      const value = item.score - penalty * (bySource.get(item.source) ?? 0) - familyPenalty * repeats;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    const [pick] = pool.splice(best, 1);
    bySource.set(pick.source, (bySource.get(pick.source) ?? 0) + 1);
    if (familyOf) byFamily.set(familyOf(pick), (byFamily.get(familyOf(pick)) ?? 0) + 1);
    out.push(pick);
  }
  return out;
}

/** Combines result lists (for example batches streamed from different sources) into one ranked page. */
export function mergeResults(results: MediaResult[], limit: number) {
  return diversify(dedupe(results, imageKeys), limit, { familyOf: family });
}
