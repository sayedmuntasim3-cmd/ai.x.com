/**
 * Topic selection engine (roadmap W7): one transparent score per candidate
 * topic, plus hard rejection rules. Every factor is 0..5 where 5 is always
 * "better for Zupona" (so competition 5 = little competition, effort 5 = low
 * effort, similarity 5 = nothing like a past film). Each factor carries a
 * one-line reason and its evidence, so a person can check every number.
 *
 * The score ranks topics; it never predicts views.
 *
 * Optional reference prior (engine/data/reference-prior.json): the title's lean toward what winners of its pillar use moves the total by at most 3 points.
 *
 * Pure functions (browser + Node). Candidate data lives in
 * docs/research/data/engineering-topics.json; `local/topic-ranking.mjs`
 * writes docs/research/TOPIC_RANKING.md from it.
 */

import { topicLean } from "./reference-prior.mjs";

/** Niche fixed by the owner on 26 Nov 2026 (CLAUDE.md). */
export const NICHE = "engineering-disasters-megaprojects";

/** Factor weights, in one place. They sum to 1. */
export const TOPIC_WEIGHTS = Object.freeze({
  demand: 0.14,       // people search / watch this subject at all
  outliers: 0.14,     // a sibling video beat its own channel's median
  competition: 0.07,  // 5 = few strong films already exist
  usAppeal: 0.12,     // an ordinary American cares (US place, US stake)
  visuals: 0.14,      // authentic free footage/photos/drawings exist (NARA, LoC, HAER, IA, agencies)
  reliability: 0.12,  // official reports / primary sources to check every fact
  advertiserFit: 0.06,// 5 = safe for ads without softening the truth
  effort: 0.04,       // 5 = cheap to research and build
  evergreen: 0.06,    // still worth watching in five years
  narrative: 0.08,    // one central question, escalation, a reveal
  similarity: 0.03,   // 5 = unlike every past Zupona film (computed)
});

export const FACTORS = Object.freeze(Object.keys(TOPIC_WEIGHTS));

/**
 * Hard floors: a topic below any of these is rejected whatever its total.
 * @type {ReadonlyArray<{ id: string, test: (t: Candidate, f: Record<string, number>) => boolean, why: string }>}
 */
export const REJECT_RULES = Object.freeze([
  { id: "off-niche", test: (t) => t.niche !== NICHE, why: "outside the fixed niche (Engineering Disasters & Megaprojects)" },
  { id: "no-authentic-visuals", test: (t, f) => f.visuals < 2, why: "too little authentic free footage: the film would need invented pictures" },
  { id: "unreliable-sources", test: (t, f) => f.reliability < 2, why: "no primary sources to check facts against: fabrication risk" },
  { id: "fabrication-risk", test: (t) => t.fabricationRisk === true, why: "the story depends on claims nobody can verify" },
  { id: "not-advertiser-safe", test: (t, f) => f.advertiserFit < 1, why: "cannot be told without graphic content" },
  { id: "repeat", test: (t, f) => f.similarity < 1, why: "nearly the same as a past Zupona film" },
]);

const STOP = new Set(["the", "a", "an", "of", "and", "in", "on", "to", "why", "how", "what", "its", "it", "is", "under", "with", "for", "us"]);

/** Lowercase content words of a topic (title + tags). @param {{title?: string, tags?: string[]}} t */
export function topicWords(t) {
  const text = `${t.title ?? ""} ${(t.tags ?? []).join(" ")}`.toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)));
}

/**
 * Similarity factor: 5 when the topic shares no words with any past film,
 * falling with the highest Jaccard overlap (0.5 overlap or more = 0).
 * @param {{title?: string, tags?: string[]}} topic @param {{title?: string, tags?: string[]}[]} pastFilms
 */
export function similarityScore(topic, pastFilms = []) {
  const a = topicWords(topic);
  let worst = 0, match = "";
  for (const p of pastFilms) {
    const b = topicWords(p);
    const inter = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size || 1;
    const j = inter / union;
    if (j > worst) { worst = j; match = p.title ?? ""; }
  }
  const value = Math.max(0, Math.round((5 - worst * 10) * 10) / 10);
  return { value, reason: worst === 0 ? "no overlap with any past film" : `overlaps ${Math.round(worst * 100)}% with "${match}"`, evidence: "computed" };
}

/**
 * @typedef {{ value: number, reason: string, evidence?: string }} Factor
 * @typedef {{ id: string, title: string, niche: string, tags?: string[], evidenceStrength?: "strong"|"medium"|"weak", fabricationRisk?: boolean, factors: Record<string, Factor> }} Candidate
 * @typedef {{ id: string, title: string, total: number, factors: Record<string, Factor>, rejected: {id: string, why: string}[], evidenceStrength: string, missing: string[], priorLean?: { pillar: string | null, score: number, points: number, reason: string } }} Scored
 */

/** Clamp a factor value to 0..5 (missing = 0, so a gap never helps). @param {unknown} v */
function clamp(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(5, Math.max(0, n)) : 0;
}

/**
 * Score one candidate. total is 0..100 (weighted mean of factors, x20).
 * Weak evidence costs 10% of the total: it must not outrank stronger proof on hope.
 * @param {Candidate} c @param {{ pastFilms?: {title?: string, tags?: string[]}[], weights?: Record<string, number>, prior?: object }} [o]
 * @returns {Scored}
 */
export function scoreTopic(c, o = {}) {
  /** @type {Record<string, number>} */
  const weights = o.weights ?? TOPIC_WEIGHTS;
  /** @type {Record<string, Factor>} */
  const factors = {};
  const missing = [];
  for (const k of FACTORS) {
    if (k === "similarity") { factors[k] = similarityScore(c, o.pastFilms); continue; }
    const f = c.factors?.[k];
    if (!f) missing.push(k);
    factors[k] = { value: clamp(f?.value), reason: f?.reason ?? "no data", evidence: f?.evidence ?? "" };
  }
  /** @type {Record<string, number>} */
  const values = Object.fromEntries(FACTORS.map((k) => [k, factors[k].value]));
  let sum = 0;
  for (const k of FACTORS) sum += (weights[k] ?? 0) * values[k];
  const strength = c.evidenceStrength ?? "weak";
  const penalty = strength === "weak" ? 0.9 : 1;
  const lean = o.prior ? topicLean(o.prior, c) : null;
  const total = Math.round((sum * 20 * penalty + (lean?.points ?? 0)) * 10) / 10;
  const rejected = REJECT_RULES.filter((r) => r.test(c, values)).map((r) => ({ id: r.id, why: r.why }));
  return { id: c.id, title: c.title, total, factors, rejected, evidenceStrength: strength, missing, ...(lean ? { priorLean: lean } : {}) };
}

/**
 * Rank candidates: accepted topics first by total (ties: id), rejected after.
 * Deterministic for the same input.
 * @param {Candidate[]} candidates @param {{ pastFilms?: {title?: string, tags?: string[]}[], weights?: Record<string, number>, prior?: object }} [o]
 */
export function rankTopics(candidates, o = {}) {
  const scored = candidates.map((c) => scoreTopic(c, o));
  const order = (/** @type {Scored} */ a, /** @type {Scored} */ b) => (b.total - a.total) || a.id.localeCompare(b.id);
  return [...scored.filter((s) => !s.rejected.length).sort(order), ...scored.filter((s) => s.rejected.length).sort(order)];
}

/**
 * Markdown table of a ranking, for docs/research/TOPIC_RANKING.md.
 * @param {Scored[]} ranked
 */
export function rankingMarkdown(ranked) {
  const short = { demand: "Dem", outliers: "Out", competition: "Comp", usAppeal: "US", visuals: "Vis", reliability: "Rel", advertiserFit: "Ads", effort: "Eff", evergreen: "Ever", narrative: "Story", similarity: "New" };
  const head = `| Rank | Topic | Total | Evidence | ${FACTORS.map((k) => short[/** @type {keyof typeof short} */ (k)]).join(" | ")} | Status |`;
  const sep = `|${" --- |".repeat(FACTORS.length + 5)}`;
  const rows = ranked.map((s, i) => `| ${s.rejected.length ? "-" : i + 1} | ${s.title} | ${s.total} | ${s.evidenceStrength} | ${FACTORS.map((k) => s.factors[k].value).join(" | ")} | ${s.rejected.length ? `rejected: ${s.rejected.map((r) => r.id).join(", ")}` : "accepted"} |`);
  return [head, sep, ...rows].join("\n");
}
