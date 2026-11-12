/**
 * Bossism: the supervisor of a production. It does not write; it decides.
 *
 *   understand(request)        what is being made (idea, voice or Quran film)
 *   productionGraph(objective) the stages, what each depends on, which roles do
 *                              the work, what each needs, what may run in parallel
 *   preflight(graph, caps)     before anything is spent: can every stage run with
 *                              the brain, keys and workers connected? Blockers stop
 *                              the film; every lowered quality is named (never silent)
 *   reviewRun(store)           after a run: seven evidence gates read the run's own
 *                              files and give pass / revise / block with findings
 *   revisionPlan(review)       defective work goes back to the stage that made it,
 *                              with notes, a bounded number of times
 *   releaseDecision(review)    a film is rendered and released only when no critical
 *                              gate fails, or the owner approves it with a reason
 *   masterGate(report)         the rendered file itself is measured before release
 *
 * Every verdict comes from code reading evidence (files the stages wrote, pages
 * the source desk opened, measurements of the master), never from a model
 * saying its own work is good. Decisions are appended to decisions.json.
 */
import { AGENTS, ROLE_STATUS } from "./agent-roster.mjs";
import { FREE_LICENCES } from "./film-media.mjs";
import { chapterSpec, isStoryFilm, pictureCredits, titleProblems } from "./film-run.mjs";
import { msg } from "./messages.mjs";
import { checkFilm, factualSignals, parseSceneLines } from "./scene-lines.mjs";

/** @typedef {import("./film-run.mjs").Film} Film */
/** @typedef {import("./film-run.mjs").Store} Store */
/** @typedef {ReturnType<typeof msg>} Msg */
/** @typedef {"idea" | "voice" | "quran"} System */
/** @typedef {"brain" | "research" | "vision" | "media" | "youtube" | "render"} Need */
/**
 * @typedef {{ id: string, base: string, chapter?: string, after: { id: string, kind: "data" | "order" }[],
 *   roles: string[], needs: Need[], optional: Need[], parallelSafe: boolean }} StageNode
 * @typedef {{ system: System, wired: boolean, nodes: StageNode[] }} Graph
 * @typedef {{ code: string, severity: "block" | "revise" | "note", message: Msg, target?: string, note?: string }} Finding
 * @typedef {{ id: string, verdict: "pass" | "revise" | "block", critical: boolean, findings: Finding[], evidence: Record<string, unknown> }} Gate
 * @typedef {{ at: string, film: string, gatesVersion?: number, gates: Gate[], release: { allowed: boolean, blockedBy: string[], message: Msg } }} Review
 */

/** Thresholds, in one place so they are visible and tested. */
export const LIMITS = Object.freeze({
  minSites: 4,
  blockSites: 2,
  unconfirmedShare: 0.3,
  missingShareRevise: 0.2,
  missingShareBlock: 0.5,
  stayScore: 6,
  maxRevisions: 1,
  targetLufs: -14,
  ceilingDbtp: -1,
});

/**
 * The version of the gates. A review made by older gates cannot clear a film:
 * it is reviewed again (2: the claims gate blocks unresolved markers, guessed
 * values and claims without evidence; 3: every narrated sentence of a true-story
 * film is linked to its claims, and evidence is matched to the claim it supports).
 */
export const GATES_VERSION = 3;

/** Gates whose failure stops a release; the others ask for revision and are listed. */
export const CRITICAL_GATES = Object.freeze(["research", "claims", "script", "rights", "master"]);

/**
 * The stages of an idea film, in run order, as film-run.mjs runs them, with
 * the roles that do each job. A stage marked perChapter is repeated for C1, C2 ...
 * "order" edges keep the run order; "data" edges mean the later stage reads
 * the earlier one's output, so redoing the earlier one makes it stale.
 */
const IDEA_STAGES = Object.freeze([
  { base: "market", after: [], needs: [], optional: ["youtube"], roles: ["audience-audience-fit", "audience-title"] },
  { base: "s01", after: ["market"], needs: ["brain"], optional: [], roles: ["intake-duration-planner", "audience-audience-fit", "audience-title", "audience-thumbnail"] },
  { base: "research", after: ["s01"], needs: ["brain", "research"], optional: [], roles: ["research-primary-source", "research-counterevidence", "research-people-orgs", "screenplay-era-researcher"] },
  { base: "sources", after: ["research"], needs: [], optional: [], roles: ["research-source-diversity", "quality-hallucination"] },
  { base: "s2", after: ["research", "sources"], needs: ["brain"], optional: [], roles: ["research-fact-ledger", "research-date-check", "research-statistics", "screenplay-realism-auditor", "screenplay-money-path-auditor"] },
  { base: "s3", after: ["s2"], needs: ["brain"], optional: [], roles: ["story-chapter-arc", "story-open-loops", "story-emotional-arc", "story-ending", "audience-retention", "audience-midpoint", "screenplay-plot-architect"] },
  { base: "s4", after: ["s3"], needs: ["brain"], optional: [], roles: ["cinematography-lens-language", "cinematography-environment", "animation-motion-director", "audio-music-arc", "audio-pronunciation", "color-look-dev", "screenplay-character-designer"] },
  { base: "s5", perChapter: true, chain: "order", after: ["s2", "s3", "s4"], needs: ["brain"], optional: [], roles: ["story-narration", "story-script-coverage", "cinematography-visual-director", "footage-asset-strategist", "screenplay-scene-writer", "versions-english-writer", "versions-separation-guard"] },
  { base: "qa", after: ["s5"], needs: ["brain"], optional: [], roles: ["quality-hallucination", "quality-defamation", "quality-sensitive-context", "quality-claim-language", "quality-timeline-qc", "versions-english-reviewer", "editing-b-roll-balance"] },
  { base: "viewer", after: ["qa"], needs: ["brain"], optional: [], roles: ["audience-panel-review", "audience-first-minute"] },
  { base: "edit", perChapter: true, after: ["viewer"], needs: ["brain"], optional: [], roles: ["editing-cut-logic", "editing-pace", "cinematography-camera-motion", "animation-transition-logic"] },
  { base: "media", perChapter: true, chain: "data", after: ["viewer"], needs: [], optional: ["media", "vision"], roles: ["footage-provider-coverage", "footage-exact-match", "footage-license", "footage-metadata", "footage-duplicate-assets", "footage-scene-fit", "footage-release-risk", "cinematography-shot-variety", "editing-coverage"] },
  { base: "s6", after: ["qa", "edit", "media"], needs: ["brain"], optional: [], roles: ["quality-release-gate"] },
  { base: "s7", after: ["s6", "media"], needs: ["brain"], optional: [], roles: ["audience-title", "audience-thumbnail", "audience-metadata", "audience-platform-specs", "footage-attribution"] },
  { base: "originality", after: ["s7"], needs: [], optional: [], roles: [] },
  { base: "review", after: ["originality"], needs: [], optional: [], roles: ["footage-rights-gate", "quality-license-qc", "quality-release-gate"] },
  { base: "render", after: ["review"], needs: [], optional: ["render"], roles: ["editing-timeline-integrity", "editing-chapter-transitions", "audio-ducking", "audio-loudness", "color-color-match", "color-encode", "animation-map-motion", "animation-kinetic-type"] },
  { base: "master", after: ["render"], needs: [], optional: [], roles: ["audio-audio-qc", "editing-edit-qc", "color-final-master"] },
]);

/** Stages that only read: their work does not change when an earlier stage is redone, so they never need invalidating. */
const NOT_RERUN = new Set(["market", "review", "render", "master"]);

/**
 * What is being made.
 * @param {{ system?: System, film?: Film | null }} request
 * @returns {{ system: System, wired: boolean, film: Film | null, story: boolean, minutes: number, chapters: string[] }}
 */
export function understand(request) {
  const system = request.system ?? "idea";
  const film = request.film ?? null;
  const minutes = film ? film.durationSeconds / 60 : 0;
  // The chapter count the run will plan (film-run.mjs estimateRun uses the same rule until S3 fixes it).
  const n = film ? Math.max(1, Math.round(minutes / 7.5)) : 0;
  return { system, wired: system === "idea" && Boolean(film), film, story: film ? isStoryFilm(film) : false, minutes, chapters: Array.from({ length: n }, (_, i) => `C${i + 1}`) };
}

/**
 * The production graph: one node per stage the run executes, chapters expanded.
 * @param {ReturnType<typeof understand>} objective
 * @param {string[]} [chapters] the planned chapters once S3 has run
 * @returns {Graph}
 */
export function productionGraph(objective, chapters = objective.chapters) {
  if (objective.system !== "idea") return { system: objective.system, wired: false, nodes: [] };
  /** @type {StageNode[]} */
  const nodes = [];
  /** @param {string} base */
  const idsOf = (base) => {
    const s = IDEA_STAGES.find((x) => x.base === base);
    return s && "perChapter" in s && s.perChapter ? chapters.map((c) => `${base}:${c}`) : [base];
  };
  for (const s of IDEA_STAGES) {
    const per = "perChapter" in s && s.perChapter;
    const make = (/** @type {string | undefined} */ chapter, /** @type {number} */ i) => {
      /** @type {StageNode["after"]} */
      const after = [];
      for (const dep of s.after) {
        const depStage = IDEA_STAGES.find((x) => x.base === dep);
        const perDep = depStage && "perChapter" in depStage && depStage.perChapter;
        // A per-chapter stage after a per-chapter stage depends on the same chapter only (edit:C2 needs viewer, not edit:C1).
        if (per && perDep && chapter) after.push({ id: `${dep}:${chapter}`, kind: "data" });
        else for (const id of idsOf(dep)) after.push({ id, kind: "data" });
      }
      // Chapters of a chained stage run in film order: S5 hands each chapter the end of the previous one (order only);
      // the media step's no-repeat rule reads the earlier chapters' picks (data).
      if (per && "chain" in s && s.chain && i > 0) after.push({ id: `${s.base}:${chapters[i - 1]}`, kind: /** @type {"data" | "order"} */ (s.chain) });
      nodes.push({ id: chapter ? `${s.base}:${chapter}` : s.base, base: s.base, ...(chapter ? { chapter } : {}), after, roles: [...s.roles], needs: [.../** @type {Need[]} */ (s.needs)], optional: [.../** @type {Need[]} */ (s.optional)], parallelSafe: Boolean(per && !("chain" in s && s.chain)) });
    };
    if (per) chapters.forEach((c, i) => make(c, i));
    else make(undefined, 0);
  }
  return { system: "idea", wired: true, nodes };
}

/**
 * Every stage that reads, directly or through others, what these stages wrote.
 * Only data edges count: redoing S5 for C1 does not make C2's chapter stale.
 * @param {Graph} graph @param {string[]} ids
 */
export function dependents(graph, ids) {
  const out = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of graph.nodes) {
      if (out.has(n.id) || NOT_RERUN.has(n.base)) continue;
      if (n.after.some((e) => e.kind === "data" && out.has(e.id))) { out.add(n.id); grew = true; }
    }
  }
  return graph.nodes.map((n) => n.id).filter((id) => out.has(id));
}

/**
 * Tokens the largest stage needs, measured from the finished 45-minute
 * Ramesh Babu film: the manual (~73 KB), S2 and S4 at about 1.1 KB a minute
 * each, S5 at about 8 KB a minute, 3.2 characters a token. QA reads the whole
 * film at once unless it is split per chapter.
 * @param {number} minutes @param {{ manualChars?: number, replyTokens?: number }} [o]
 */
export function windowNeeds(minutes, o = {}) {
  const tok = (/** @type {number} */ chars) => Math.ceil(chars / 3.2);
  const base = tok(o.manualChars ?? 73_288) + 1_500;
  const reply = o.replyTokens ?? 8_192;
  const s2 = Math.max(4_000, tok(1_100 * minutes));
  const s4 = Math.max(6_000, tok(1_140 * minutes));
  const chapterMinutes = minutes / Math.max(1, Math.round(minutes / 7.5));
  const s5Chapter = base + s2 + s4 + 2_000 + reply;
  const qaWhole = base + s2 + tok(8_000 * minutes) + reply;
  const qaChapter = base + s2 + tok(8_000 * chapterMinutes) + reply;
  return { s5Chapter, qaWhole, qaChapter, whole: Math.max(s5Chapter, qaWhole), perChapter: Math.max(s5Chapter, qaChapter) };
}

/**
 * Before anything is spent: can each stage run with what is connected?
 * caps.brain is the connected brain's health (worker/brain.mjs brainHealth).
 * @param {Graph} graph
 * @param {{ brain: { connected: boolean, kind?: string, model?: string, seesPictures?: boolean, searchesWeb?: boolean, contextTokens?: number, maxOutputTokens?: number } | null,
 *   researchDesk: boolean, mediaProviders: number, youtube: boolean, autoRender: boolean, minutes: number, manualChars?: number, qaPerChapter?: boolean }} caps
 */
export function preflight(graph, caps) {
  /** @type {Msg[]} */
  const blockers = [];
  /** @type {Msg[]} */
  const degradations = [];
  if (!graph.wired) blockers.push(msg("plan.notBuilt", { system: graph.system }));
  const brain = caps.brain?.connected ? caps.brain : null;
  if (!brain) blockers.push(msg("plan.noBrain"));
  if (brain && brain.searchesWeb === false) {
    if (caps.researchDesk) degradations.push(msg("plan.desk"));
    else blockers.push(msg("plan.noResearch"));
  }
  /** @type {{ needed: number, available: number, qa: "whole" | "per-chapter" } | null} */
  let window = null;
  if (brain?.contextTokens) {
    const needs = windowNeeds(caps.minutes, { manualChars: caps.manualChars, replyTokens: Math.min(32_000, brain.maxOutputTokens ?? 8_192) });
    const whole = needs.whole <= brain.contextTokens;
    const split = caps.qaPerChapter !== false && needs.perChapter <= brain.contextTokens;
    window = { needed: whole ? needs.whole : needs.perChapter, available: brain.contextTokens, qa: whole ? "whole" : "per-chapter" };
    if (!whole && !split) blockers.push(msg("plan.windowSmall", { window: brain.contextTokens, minutes: Math.round(caps.minutes), needed: needs.perChapter }));
    else if (!whole) degradations.push(msg("plan.qaPerChapter", { window: brain.contextTokens, needed: needs.whole }));
  }
  if (brain && brain.seesPictures === false) degradations.push(msg("plan.blind"));
  if (!caps.youtube) degradations.push(msg("plan.noMarket"));
  if (caps.mediaProviders < 1) degradations.push(msg("plan.noMedia"));
  if (!caps.autoRender) degradations.push(msg("plan.noAutoRender"));

  const stages = graph.nodes.map((n) => {
    const available = [];
    const unavailable = [];
    for (const id of n.roles) {
      const agent = AGENTS.find((a) => a.id === id);
      const [status, how] = ROLE_STATUS[id] ?? ["planned", "no status recorded"];
      const row = { id, name: agent?.name ?? id, status, how };
      if (status === "code" || status === "model") available.push(row);
      else unavailable.push(row);
    }
    const missing = n.optional.filter((need) => (need === "youtube" && !caps.youtube) || (need === "media" && caps.mediaProviders < 1) || (need === "vision" && brain?.seesPictures === false) || (need === "render" && !caps.autoRender));
    const blocked = n.needs.some((need) => (need === "brain" && !brain) || (need === "research" && brain?.searchesWeb === false && !caps.researchDesk));
    const skipped = (n.base === "market" && !caps.youtube) || (n.base === "media" && caps.mediaProviders < 1) || (n.base === "render" && !caps.autoRender);
    return { id: n.id, status: blocked ? "blocked" : skipped ? "skipped" : missing.length ? "degraded" : "run", parallelSafe: n.parallelSafe, after: n.after.map((e) => e.id), agents: { available, unavailable } };
  });
  return { ok: blockers.length === 0, system: graph.system, blockers, degradations, window, stages };
}

// ---------------------------------------------------------------- review

/** @param {Store} store @param {string} key */
async function readJson(store, key) {
  const t = await store.get(key);
  if (t === null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/** @param {Finding[]} findings @param {string} id @param {Record<string, unknown>} evidence @returns {Gate} */
function gate(id, findings, evidence) {
  const verdict = findings.some((f) => f.severity === "block") ? "block" : findings.some((f) => f.severity === "revise") ? "revise" : "pass";
  return { id, verdict, critical: CRITICAL_GATES.includes(id), findings, evidence };
}

/** Normalise a claim for comparing facts: lower case, no punctuation or digits. @param {string} s */
const claimKey = (s) => String(s ?? "").toLowerCase().replace(/[\d.,%$₹€£]+/g, " ").replace(/[^\p{L}\s]/gu, " ").replace(/\s+/g, " ").trim();

/**
 * Markers that must never reach narration or the screen: claim placeholders
 * ("[C12 low]", "$[C40 high]") and editing notes ("[TBD]", "[VERIFY]" ...).
 */
export const UNRESOLVED = /\$?\[C\d{2,3}[^\]]*\]|\[(?:TBD|TBC|TODO|FIXME|VERIFY|CHECK|PENDING|CITATION NEEDED|NEEDS? SOURCE|SOURCE\?|XX+)\b[^\]]*\]/gi;

/**
 * @typedef {{ id: string, kind: "fact" | "attributed" | "hedged" | "unknown" | "unresolved", text: string, value: string,
 *   lowConfidence: boolean, urls: string[], facts: string[], refs: string[] }} LedgerRow
 */

/** A URL as a comparable key: host without www, path without a trailing slash, query kept. @param {string} url */
function urlKey(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return "";
  }
}

/**
 * The pages a ledger cell cites, with or without a scheme ("fred.stlouisfed.org/series/X" counts).
 * @param {string} text
 */
const urlsIn = (text) => (text.match(/(?:https?:\/\/|\b(?=(?:[a-z0-9-]+\.)+[a-z]{2,}\/))[^\s|<>"'`·]+/gi) ?? [])
  .map((u) => u.replace(/[).,;:»”’'\]]+$/, ""))
  .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`));

/**
 * The S2 claim ledger by ID. Columns are found by their headers (status or
 * type, value, sources, confidence), so a ledger written in another column
 * order still reads correctly. A status the code cannot classify counts as
 * FACT: the strictest reading.
 * @param {string | null} s2 @returns {Map<string, LedgerRow>}
 */
export function parseLedger(s2) {
  /** @type {Map<string, LedgerRow>} */
  const rows = new Map();
  /** @type {string[]} */
  let header = [];
  const cells = (/** @type {string} */ line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const col = (/** @type {RegExp} */ re) => header.findIndex((h) => re.test(h));
  const lines = String(s2 ?? "").split("\n");
  for (let n = 0; n < lines.length; n += 1) {
    const line = lines[n];
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[n + 1] ?? "")) { header = cells(line).map((h) => h.toLowerCase()); continue; }
    const m = /^\s*\|\s*\*{0,2}(C\d{2,3})\*{0,2}\s*\|/.exec(line);
    if (!m) continue;
    const c = cells(line);
    const at = (/** @type {number} */ i) => (i >= 0 ? c[i] ?? "" : "");
    const status = at(col(/status|type/)).toLowerCase();
    const src = col(/source/) >= 0 ? at(col(/source/)) : c.slice(1).join(" | ");
    // The status word comes first ("FACT (year unknown)" is a FACT, not an UNKNOWN).
    const kind = /^\W*unknown\b/.test(status) ? "unknown"
      : /^\W*(unsupported|unverified|pending|tbd|missing)\b/.test(status) ? "unresolved"
      : /^\W*fact\b/.test(status) && /attribut|reported|according/.test(status) ? "attributed"
      : /contested|disputed|estimate|quote|paraphrase|reported|interpretation|inferred/.test(status) ? "hedged"
      : "fact";
    rows.set(m[1], {
      id: m[1], kind, text: col(/claim|detail/) >= 0 ? at(col(/claim|detail/)) : c.slice(1).join(" "), value: at(col(/value/)),
      lowConfidence: /^\W*(very\s+)?(low|none)\W*$/i.test(at(col(/conf/))),
      urls: urlsIn(src), facts: src.match(/\bF\d{2,3}\b/g) ?? [], refs: (src.match(/\bC\d{2,3}\b/g) ?? []).filter((r) => r !== m[1]),
    });
  }
  return rows;
}

/**
 * What the research kept after the source desk: facts by ID and by the pages
 * they cite, with the desk's check of each. Null without a research file.
 * @param {any} research @param {any} check
 */
function researchEvidence(research, check) {
  const facts = Array.isArray(research?.facts) ? research.facts : null;
  if (!facts) return null;
  /** @type {Map<string, any>} */ const byId = new Map();
  /** @type {Map<string, any[]>} */ const byUrl = new Map();
  for (const fact of facts) {
    if (fact?.id) byId.set(String(fact.id), fact);
    for (const u of Array.isArray(fact?.sources) ? fact.sources : []) {
      const k = urlKey(String(u));
      if (!k) continue;
      if (!byUrl.has(k)) byUrl.set(k, []);
      /** @type {any[]} */ (byUrl.get(k)).push(fact);
    }
  }
  /**
   * The research facts behind a ledger row. Fact IDs name them exactly; a page
   * alone can be shared by facts it does not support, so pages are used only
   * when the row names no fact.
   * @param {LedgerRow} row
   */
  const matched = (row) => {
    const named = row.facts.map((id) => byId.get(id)).filter(Boolean);
    return named.length ? named : [...new Set(row.urls.flatMap((u) => byUrl.get(urlKey(u)) ?? []))];
  };
  return {
    matched,
    /**
     * "confirmed" when the source desk confirmed the facts the row rests on, "unconfirmed"
     * when it confirmed none of them, "ambiguous" when the row names only a page shared by
     * confirmed and unconfirmed facts (which one supports this claim is not known), null
     * when the desk did not run.
     * @param {LedgerRow} row
     */
    statusOf(row) {
      if (!check) return null;
      const statuses = matched(row).map((x) => x?.check?.status).filter(Boolean);
      if (!statuses.length) return null;
      const ok = statuses.map((s) => s === "verified" || s === "opened");
      if (ok.every(Boolean)) return "confirmed";
      if (!ok.some(Boolean)) return "unconfirmed";
      return row.facts.some((id) => byId.has(id)) ? "confirmed" : "ambiguous";
    },
  };
}

/**
 * Does a ledger row rest on evidence: a page or fact the research kept, or
 * other ledger rows that all do (a derived value)? Without a research file, any
 * cited page or fact counts (the research gate blocks that film anyway).
 * @param {LedgerRow} row @param {Map<string, LedgerRow>} rows @param {ReturnType<typeof researchEvidence>} evidence
 * @param {Set<string>} [path] the rows being followed (a cycle is not evidence)
 * @returns {boolean}
 */
function hasEvidence(row, rows, evidence, path = new Set()) {
  if (row.kind === "unresolved" || path.has(row.id)) return false;
  const direct = evidence ? evidence.matched(row).length > 0 : row.urls.length + row.facts.length > 0;
  if (direct) return true;
  if (!row.refs.length) return false;
  path.add(row.id);
  // A derived value is only as good as every row it is derived from.
  /** @type {boolean} */
  const ok = row.refs.every((id) => {
    const ref = rows.get(id);
    return Boolean(ref) && /** @type {LedgerRow} */ (ref).kind !== "unknown" && hasEvidence(/** @type {LedgerRow} */ (ref), rows, evidence, path);
  });
  path.delete(row.id);
  return ok;
}

/** Capitalised words that are not names. */
const NOT_NAMES = new Set(["I", "I'm", "I've", "I'd", "I'll", "OK"]);

/**
 * The capitalised words of a text, as candidate names ("Tenerife", "KLM", "Liberation").
 * The first word of a sentence is skipped when asked (it is capitalised anyway).
 * @param {string} text @param {boolean} [skipFirst]
 */
function names(text, skipFirst = false) {
  /** @type {string[]} */
  const out = [];
  for (const sentence of String(text).split(/(?<=[.!?])\s+/)) {
    const words = sentence.replace(/\$?\[[^\]]*\]/g, " ").split(/\s+/).filter(Boolean);
    words.forEach((w, i) => {
      const n = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, "").replace(/['’]s$/, "");
      if ((skipFirst && i === 0) || !/^\p{Lu}[\p{L}'’-]+$/u.test(n) || NOT_NAMES.has(n)) return;
      out.push(n);
    });
  }
  return out;
}

/**
 * Numbers a viewer reads on screen: the quoted text of on-screen text (OST) and
 * of text cards (R1 shots). Unquoted words there are production notes (fonts,
 * timings), so they are not read; claim IDs inside a chip are not numbers.
 * @param {import("./scene-lines.mjs").SceneLine} s
 */
function screenNumbers(s) {
  const shots = (s.fields.SHOTS ?? "").split(/(?=\(\d+\)\s)/).filter((x) => /\bR1\b/.test(x)).join(" ");
  const quoted = [s.fields.OST ?? "", shots].join(" ").match(/"[^"]*"|“[^”]*”/g) ?? [];
  const text = quoted.join(" ").replace(/\$?\[[^\]]*\]/g, " ").replace(/\b[A-Z]{1,6}(?:-[A-Z]{1,4})*-?\d+[a-z]?\b/g, " ");
  return (text.match(/\d[\d,.]*/g) ?? []).map((n) => n.replace(/[.,]+$/, ""));
}

const NUMBER_WORD = /^(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|crore|lakh|point|half|quarter|dozen)$/;

/**
 * The numbers a scene says or shows (narration, on-screen text, shot text),
 * without timecodes, IDs and markers: digits, and runs of number words.
 * @param {import("./scene-lines.mjs").SceneLine} s
 */
function sceneNumbers(s) {
  const text = [s.narration, s.fields.OST ?? "", s.fields.SHOTS ?? ""].join(" ")
    .replace(UNRESOLVED, " ")
    .replace(/\b\d+:\d{2}(?::\d{2})?(?:\s*-\s*\d+:\d{2}(?::\d{2})?)?/g, " ")
    .replace(/\b[A-Z]{1,6}(?:-[A-Z]{1,4})*-?\d+[a-z]?\b/g, " ")
    .replace(/\(\d+\)/g, " ");
  /** @type {Set<string>} */
  const out = new Set();
  for (const d of text.match(/\d[\d,.]*/g) ?? []) out.add(d.replace(/[.,]+$/, ""));
  let run = [];
  for (const w of text.toLowerCase().split(/[^a-z]+/)) {
    if (NUMBER_WORD.test(w)) run.push(w);
    else if (run.length) { out.add(run.join(" ")); run = []; }
  }
  if (run.length) out.add(run.join(" "));
  return out;
}

/**
 * Markers that an earlier draft of the chapter had and the final one does not,
 * replaced by a new number while the ledger still has no value for the claim.
 * Removing "[C12 low]" does not resolve C12; only a value in the ledger does.
 * @param {Store} store @param {string} chapter @param {import("./scene-lines.mjs").SceneLine[]} finalScenes
 * @param {Map<string, LedgerRow>} rows
 */
async function guessedValues(store, chapter, finalScenes, rows) {
  const final = new Map(finalScenes.map((s) => [s.sc, s]));
  /** @type {Set<string>} */
  const out = new Set();
  for (const key of [`s5-${chapter}.draft.md`, `s5-${chapter}.viewer-draft.md`]) {
    const draft = await store.get(key);
    if (!draft) continue;
    for (const before of parseSceneLines(draft)) {
      const after = final.get(before.sc);
      const markers = before.raw.match(UNRESOLVED) ?? [];
      if (!after || !markers.length) continue;
      const was = sceneNumbers(before);
      const added = [...sceneNumbers(after)].filter((n) => !was.has(n));
      if (!added.length) continue;
      for (const m of markers) {
        const id = /C\d{2,3}/.exec(m)?.[0];
        if (!id || after.raw.includes(m)) continue;
        const row = rows.get(id);
        const resolved = row && row.kind !== "unknown" && row.kind !== "unresolved" && row.value && !/pending|unknown|\btbd\b|n\/a/i.test(row.value);
        if (!resolved) out.add(`${before.sc} ${m} -> "${added.slice(0, 3).join(", ")}"`);
      }
    }
  }
  return [...out];
}

/**
 * The seven evidence gates over a finished run, from its own files.
 * @param {{ store: Store, film: Film }} o
 * @returns {Promise<Review>}
 */
export async function reviewRun({ store, film }) {
  const plan = /** @type {import("./film-run.mjs").ChapterPlan[]} */ ((await readJson(store, "s3-chapters.json")) ?? []);
  const chapterOfScene = (/** @type {string | undefined} */ sc) => {
    const n = Number(String(sc ?? "").replace(/^SC/, ""));
    return plan.find((c) => Number(c.firstScene.slice(2)) <= n && n <= Number(c.lastScene.slice(2)))?.id ?? null;
  };
  /** @type {Record<string, string | null>} */
  const chapters = {};
  for (const c of plan) chapters[c.id] = await store.get(`s5-${c.id}.md`);
  const gates = [];

  // 1. Research: enough sourced facts, opened by code, from independent sites, without silent contradictions.
  {
    /** @type {Finding[]} */
    const f = [];
    const research = await readJson(store, "research.json");
    const check = await readJson(store, "sources-check.json");
    const facts = Array.isArray(research?.facts) ? research.facts : [];
    const needed = isStoryFilm(film) ? 5 : 8;
    if (facts.length < needed) f.push({ code: "research.fewFacts", severity: "block", message: msg("research.fewFacts", { facts: facts.length, needed }), target: "research", note: `Only ${facts.length} sourced facts were found; find at least ${needed}, each from a page you can cite.` });
    const sites = Number(check?.summary?.sites ?? NaN);
    if (!check) f.push({ code: "research.unchecked", severity: "block", message: msg("research.unchecked") });
    else if (sites < LIMITS.blockSites) f.push({ code: "research.fewSites", severity: "block", message: msg("research.fewSites", { sites, needed: LIMITS.minSites }), target: "research", note: `The facts rest on ${sites} site(s). Find the same facts on independent sites (official records, reputable outlets), so no number rests on one source.` });
    else if (sites < LIMITS.minSites) f.push({ code: "research.fewSites", severity: "revise", message: msg("research.fewSites", { sites, needed: LIMITS.minSites }), target: "research", note: `The facts rest on ${sites} sites; at least ${LIMITS.minSites} independent sites are expected. Add sources from other sites for the key facts.` });
    const unconfirmed = Number(check?.summary?.facts?.unconfirmed ?? 0);
    const kept = Number(check?.summary?.facts?.kept ?? facts.length);
    if (kept && unconfirmed / kept > LIMITS.unconfirmedShare) f.push({ code: "research.unconfirmed", severity: "revise", message: msg("research.unconfirmed", { count: unconfirmed, total: kept }), target: "research", note: `${unconfirmed} of ${kept} facts state a number that none of their pages shows. Re-check those numbers against their pages, or cite the page that shows them.` });
    /** @type {Map<string, any[]>} */
    const groups = new Map();
    for (const fact of facts) {
      const k = claimKey(fact.claim);
      if (k.length < 12) continue;
      if (!groups.has(k)) groups.set(k, []);
      /** @type {any[]} */ (groups.get(k)).push(fact);
    }
    for (const same of groups.values()) {
      const values = new Set(same.map((x) => String(x.value ?? "").trim().toLowerCase()));
      if (same.length > 1 && values.size > 1 && !same.some((x) => x.conflict)) {
        const ids = same.map((x) => x.id).join(", ");
        f.push({ code: "research.contradiction", severity: "revise", message: msg("research.contradiction", { ids }), target: "research", note: `Facts ${ids} make the same claim with different values. Record the conflict between the sources instead of listing both as fact.` });
      }
    }
    gates.push(gate("research", f, { facts: facts.length, sites: Number.isFinite(sites) ? sites : null, unconfirmed, checked: Boolean(check) }));
  }

  // 2. Claims: every claim a scene cites exists in the S2 ledger and is resolved, with evidence behind it.
  // Nothing unresolved reaches narration or the screen, and removing a marker does not resolve the claim.
  {
    /** @type {Finding[]} */
    const f = [];
    const s2 = await store.get("s2.md");
    const rows = parseLedger(s2);
    const ledger = new Set(rows.keys());
    const factual = !isStoryFilm(film);
    const evidence = factual ? researchEvidence(await readJson(store, "research.json"), await readJson(store, "sources-check.json")) : null;
    let cited = 0;
    let markers = 0;
    let linked = 0;
    let commentary = 0;
    if (!s2 || !ledger.size) f.push({ code: "claims.noLedger", severity: "block", message: msg("claims.noLedger") });
    const parsed = new Map(plan.map((c) => [c.id, parseSceneLines(chapters[c.id] ?? "")]));
    // Names the film may mention without a new claim: those in the ledger and in sentences already linked to claims.
    const known = new Set([...rows.values()].flatMap((r) => names(r.text)));
    for (const scenes of parsed.values()) for (const s of scenes) for (const x of s.sentences) if (x.claims.length) for (const n of names(x.text)) known.add(n);
    for (const c of plan) {
      const scenes = /** @type {import("./scene-lines.mjs").SceneLine[]} */ (parsed.get(c.id));
      // Unresolved markers block in every film: a narrator would read "[C12 low]" aloud, a viewer would see it.
      const open = scenes.flatMap((s) => [...new Set(s.raw.match(UNRESOLVED) ?? [])].map((m) => `${s.sc} ${m}`));
      markers += open.length;
      if (open.length) {
        const list = open.slice(0, 12).join("; ");
        f.push({ code: "claims.placeholder", severity: "block", message: msg("claims.placeholder", { chapter: c.id, count: open.length, list }), target: `s5:${c.id}`, note: `These scenes still hold unresolved markers: ${list}. Replace each with the value the S2 ledger gives, written as spoken, or remove the number; never guess a value.` });
      }
      // A marker that disappeared while the ledger still has no value means a number was written without evidence.
      const guessed = await guessedValues(store, c.id, scenes, rows);
      if (guessed.length) {
        const list = guessed.slice(0, 12).join("; ");
        f.push({ code: "claims.markerResolved", severity: "block", message: msg("claims.markerResolved", { chapter: c.id, list }), target: `s5:${c.id}`, note: `In these scenes a marker was replaced by a number, but the S2 ledger has no value for its claim: ${list}. Remove the number, or say it is not known.` });
      }
      /** @type {Set<string>} */ const unknown = new Set();
      /** @type {Set<string>} */ const noEvidence = new Set();
      /** @type {Set<string>} */ const unverified = new Set();
      /** @type {Set<string>} */ const ambiguous = new Set();
      /** @type {Set<string>} */ const weak = new Set();
      /** @type {Set<string>} */ const unlinked = new Set();
      /** @type {Set<string>} */ const unlinkedFact = new Set();
      /** @type {Set<string>} */ const unknownStated = new Set();
      /** @type {Set<string>} */ const screen = new Set();
      for (const s of scenes) {
        // The scene's claims field, its on-screen source chips and every sentence tag: an ID cited anywhere is checked.
        const ids = [...new Set([...((s.positional[3] ?? "").match(/\bC\d{2,3}\b/g) ?? []), ...((s.fields.OST ?? "").replace(/\$?\[[^\]]*\]/g, " ").match(/\bC\d{2,3}\b/g) ?? []), ...s.sentences.flatMap((x) => x.claims)])];
        cited += ids.length;
        if (factual) {
          // Every narrated sentence is linked: a claim tag, or {N} for a sentence that states nothing factual.
          for (const x of s.sentences) {
            const quote = `"${x.text.slice(0, 80)}${x.text.length > 80 ? "..." : ""}"`;
            if (!x.tag || !x.valid) { unlinked.add(`${s.sc} ${x.tag && !x.valid ? `${x.tag} after ` : ""}${quote}`); continue; }
            if (x.claims.length) linked += 1;
            if (x.none) {
              commentary += 1;
              const facts = [...factualSignals(x.text), ...names(x.text, true).filter((n) => !known.has(n))];
              if (facts.length) unlinkedFact.add(`${s.sc} ${quote} states ${facts.slice(0, 3).join(", ")}`);
            }
            // A sentence resting only on UNKNOWN claims says that something is not known; it states no value.
            const rowsOf = x.claims.map((id) => rows.get(id)).filter(Boolean);
            if (rowsOf.length && rowsOf.every((r) => /** @type {LedgerRow} */ (r).kind === "unknown") && factualSignals(x.text).length) unknownStated.add(`${s.sc} "${x.text.slice(0, 80)}" (${x.claims.join(", ")})`);
          }
          // Numbers shown on screen (on-screen text, text cards) need a claim in the scene.
          if (!ids.length && screenNumbers(s).length) screen.add(`${s.sc} ${screenNumbers(s).slice(0, 3).join(", ")}`);
        }
        if (!ledger.size) continue;
        for (const id of ids) {
          const row = rows.get(id);
          if (!row) { unknown.add(`${s.sc}:${id}`); continue; }
          if (!factual || row.kind === "unknown") continue; // an UNKNOWN claim is narrated as not known
          const status = evidence ? evidence.statusOf(row) : null;
          if (!hasEvidence(row, rows, evidence)) noEvidence.add(`${s.sc}:${id}`);
          else if (row.kind === "fact" && status === "unconfirmed") unverified.add(`${s.sc}:${id}`);
          else if (row.kind === "fact" && status === "ambiguous") ambiguous.add(`${s.sc}:${id}`);
          else if (row.kind === "fact" && row.lowConfidence) weak.add(`${s.sc}:${id}`);
        }
      }
      /** @param {string} code @param {Set<string>} set @param {(ids: string) => string} note */
      const add = (code, set, note) => {
        if (!set.size) return;
        const ids = [...set].slice(0, 12).join(", ");
        f.push({ code, severity: "block", message: msg(code, { chapter: c.id, ids }), target: `s5:${c.id}`, note: note(ids) });
      };
      add("claims.unknown", unknown, (ids) => `These scenes cite claim IDs that are not in the S2 ledger: ${ids}. Cite only ledger IDs, and say only what the ledger supports; remove anything else.`);
      add("claims.noEvidence", noEvidence, (ids) => `These scenes cite claims with no evidence the research kept (no source page or fact, or a status such as UNSUPPORTED): ${ids}. Say them only with a source from the research, or cut them.`);
      add("claims.unverified", unverified, (ids) => `These scenes state claims as FACT that no page the source desk opened confirms: ${ids}. Attribute each to its source ("according to ..."), or cut it.`);
      add("claims.lowConfidence", weak, (ids) => `The ledger rates these FACT claims low confidence: ${ids}. Attribute each to its source, or cut it.`);
      add("claims.ambiguousEvidence", ambiguous, (ids) => `These FACT claims cite only a page that the research uses for several facts, some confirmed and some not, so which one supports the claim is not known: ${ids}. In S2, cite the research fact ID (F01 ...) the claim rests on.`);
      add("claims.unlinked", unlinked, (ids) => `These narrated sentences have no valid claim tag: ${ids}. End each sentence with {C..} for the ledger claims it states, or {N} if it states nothing factual.`);
      add("claims.unlinkedFact", unlinkedFact, (ids) => `These sentences are tagged {N} (nothing factual) but state a number, a date or a name the ledger does not hold: ${ids}. Tag each with its ledger claim, or remove the fact.`);
      add("claims.unknownStated", unknownStated, (ids) => `These sentences rest only on UNKNOWN claims but state a value: ${ids}. Say that it is not known, or tag the claim that gives the value.`);
      add("claims.unlinkedScreen", screen, (ids) => `These scenes show numbers on screen but cite no claim: ${ids}. Cite the claim the number comes from, or remove it.`);
    }
    gates.push(gate("claims", f, { ledger: ledger.size, citations: cited, markers, evidenceChecked: Boolean(evidence), ...(factual ? { linkedSentences: linked, commentarySentences: commentary } : {}) }));
  }

  // 3. Script: every chapter written and passing the code checks, run here again (a report file is not proof).
  {
    /** @type {Finding[]} */
    const f = [];
    for (const c of plan) if (!chapters[c.id]) f.push({ code: "script.missing", severity: "block", message: msg("script.missing", { chapter: c.id }), target: `s5:${c.id}` });
    if (!plan.length) f.push({ code: "script.missing", severity: "block", message: msg("script.missing", { chapter: "S3" }), target: "s3" });
    const written = plan.filter((c) => chapters[c.id]);
    const check = written.length === plan.length && plan.length ? checkFilm(written.map((c) => ({ id: c.id, markdown: /** @type {string} */ (chapters[c.id]), spec: chapterSpec(c, film.versionId) })), { durationSeconds: film.durationSeconds }) : null;
    /** @type {Map<string, any[]>} */
    const byChapter = new Map();
    for (const e of check?.errors ?? []) {
      const ch = chapterOfScene(e.scene) ?? plan[0]?.id ?? "C1";
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      /** @type {any[]} */ (byChapter.get(ch)).push(e);
    }
    for (const [ch, errors] of byChapter) {
      const codes = [...new Set(errors.map((e) => e.code))].join(", ");
      f.push({ code: "script.errors", severity: "block", message: msg("script.errors", { chapter: ch, count: errors.length, codes }), target: `s5:${ch}`, note: `These code checks still fail in ${ch}:\n- ${errors.slice(0, 20).map((e) => `${e.scene ?? ""} ${e.detail}`).join("\n- ")}` });
    }
    gates.push(gate("script", f, { chapters: plan.length, written: written.length, errors: check ? check.errors.length : null, scenes: check?.stats.scenes ?? null }));
  }

  // 4. Story: the opening holds a cold audience, the hook is clean, no picture holds too long.
  {
    /** @type {Finding[]} */
    const f = [];
    const first = plan[0]?.id ?? "C1";
    const viewer = await readJson(store, "viewer.json");
    const stay = Number(viewer?.stayScore);
    // A gate with nothing to judge does not pass: there is no story yet.
    if (!Object.values(chapters).some(Boolean)) f.push({ code: "story.noScript", severity: "block", message: msg("story.noScript") });
    if (!viewer) f.push({ code: "story.notRead", severity: "note", message: msg("story.notRead") });
    else if (Number.isFinite(stay) && stay < LIMITS.stayScore) {
      const leaves = (Array.isArray(viewer.leaves) ? viewer.leaves : []).slice(0, 6).map((/** @type {any} */ l) => `${l.scene}: ${l.viewer} leaves (${l.reason})`).join("; ");
      f.push({ code: "story.lowStay", severity: "revise", message: msg("story.lowStay", { score: stay, why: String(viewer.why ?? "").slice(0, 160) }), target: `s5:${first}`, note: `A cold panel of target viewers would leave the opening: ${leaves || viewer.why}. Rewrite the opening scenes so they would stay, keeping every fact and the scene times.` });
    }
    const qa = await readJson(store, "qa.json");
    const hookLeft = Array.isArray(qa?.codeCraft?.hookLeft) ? qa.codeCraft.hookLeft : [];
    if (hookLeft.length) f.push({ code: "story.hook", severity: "revise", message: msg("story.hook", { codes: hookLeft.join(", ") }), target: `s5:${first}`, note: `Code still finds these hook problems in the opening: ${hookLeft.join(", ")}. Fix them in the first scenes.` });
    for (const c of plan) {
      const edit = await readJson(store, `edit-${c.id}.json`);
      const left = Array.isArray(edit?.holds?.uncovered) ? edit.holds.uncovered : [];
      if (left.length) f.push({ code: "story.holds", severity: "revise", message: msg("story.holds", { chapter: c.id, count: left.length }), target: `edit:${c.id}`, note: `These shots still hold one picture too long with no move: ${left.slice(0, 20).join(", ")}. Give each a punch-in, a cut or a move.` });
    }
    gates.push(gate("story", f, { stayScore: Number.isFinite(stay) ? stay : null, hookLeft: hookLeft.length }));
  }

  // 5. Pictures: every shot has a fitting licensed picture; what was not checked by eye is said.
  // 6. Rights: every picture used has an acceptable licence record, and every credit it needs is in the description.
  {
    /** @type {Finding[]} */
    const visual = [];
    /** @type {Finding[]} */
    const rights = [];
    /** @type {any[]} */
    const mediaFiles = [];
    let shots = 0;
    let missing = 0;
    for (const c of plan) {
      const media = await readJson(store, `media-${c.id}.json`);
      if (!media) continue;
      mediaFiles.push(media);
      const list = Array.isArray(media.shots) ? media.shots : [];
      const miss = list.filter((/** @type {any} */ s) => s.status === "missing");
      const counted = list.filter((/** @type {any} */ s) => s.status !== "no-query").length;
      shots += counted;
      missing += miss.length;
      const share = counted ? miss.length / counted : 0;
      if (share > LIMITS.missingShareRevise) {
        const which = miss.slice(0, 12).map((/** @type {any} */ s) => `${s.scene}-${s.shot} "${String(s.description ?? "").slice(0, 80)}"`).join("; ");
        visual.push({ code: "visual.missing", severity: share > LIMITS.missingShareBlock ? "block" : "revise", message: msg("visual.missing", { chapter: c.id, missing: miss.length, shots: counted }), target: `s5:${c.id}`, note: `No licensed picture fits these shots: ${which}. Describe each so free archives or stock can show it (a real place, object or document, an exact searchable description, two different queries), or make it a graphic the editor builds.` });
      }
      const unreviewed = list.filter((/** @type {any} */ s) => s.status === "found" && s.review !== "fit").length;
      if (unreviewed) visual.push({ code: "visual.unreviewed", severity: "note", message: msg("visual.unreviewed", { chapter: c.id, count: unreviewed }) });
      const bad = list.filter((/** @type {any} */ s) => s.status === "found" && !(s.pick && FREE_LICENCES.includes(String(s.pick.licence?.licenseId ?? "")) && s.pick.sourcePageUrl));
      if (bad.length) rights.push({ code: "rights.unlicensed", severity: "block", message: msg("rights.unlicensed", { chapter: c.id, count: bad.length, ids: bad.slice(0, 8).map((/** @type {any} */ s) => `${s.scene}-${s.shot}`).join(", ") }) });
    }
    if (!mediaFiles.length) visual.push({ code: "visual.none", severity: "block", message: msg("visual.none") });
    const s7 = (await store.get("s7.md")) ?? "";
    const credits = pictureCredits(mediaFiles).split("\n").filter(Boolean);
    const uncredited = credits.filter((line) => !s7.includes(line));
    if (uncredited.length) rights.push({ code: "rights.credit", severity: "block", message: msg("rights.credit", { count: uncredited.length }), target: "s7", note: `The description must carry these picture credits exactly, as their licences require:\n${uncredited.join("\n")}` });
    const own = Object.keys((await readJson(store, "pictures.json")) ?? {}).length;
    if (own) rights.push({ code: "rights.owner", severity: "note", message: msg("rights.owner", { count: own }) });
    if (film.allowAi) rights.push({ code: "rights.ai", severity: "note", message: msg("rights.ai") });
    gates.push(gate("visual", visual, { shots, missing }));
    gates.push(gate("rights", rights, { credits: credits.length, uncredited: uncredited.length, ownPictures: own }));
  }

  // 7. Packaging: a publishing pack with a clean title, original against the channel's earlier films.
  {
    /** @type {Finding[]} */
    const f = [];
    const s7 = await store.get("s7.md");
    if (!s7) f.push({ code: "packaging.missing", severity: "block", message: msg("packaging.missing"), target: "s7" });
    else {
      const title = (/\*\*Final title[^:]*:\s*([^*\n]+)\*\*/i.exec(s7)?.[1] ?? "").trim();
      const problems = titleProblems(title);
      if (problems.length) f.push({ code: "packaging.title", severity: "revise", message: msg("packaging.title", { problems: problems.join(" ") }), target: "s7", note: `The final title has these problems: ${problems.join(" ")} Write it again.` });
    }
    const originality = await readJson(store, "originality.json");
    if (originality && originality.verdict !== "pass") f.push({ code: "packaging.originality", severity: originality.verdict === "fail" ? "block" : "note", message: msg("packaging.originality", { verdict: originality.verdict, reasons: (originality.reasons ?? []).join(" ").slice(0, 300) }) });
    gates.push(gate("packaging", f, { originality: originality?.verdict ?? null }));
  }

  return { at: new Date().toISOString(), film: film.id, gatesVersion: GATES_VERSION, gates, release: releaseDecision(gates) };
}

/**
 * May the film be rendered and released? Only when no gate blocks and no
 * critical gate still asks for revision.
 * @param {Gate[]} gates
 */
export function releaseDecision(gates) {
  const blockedBy = gates.filter((g) => g.verdict === "block" || (g.critical && g.verdict === "revise")).map((g) => g.id);
  return {
    allowed: blockedBy.length === 0,
    blockedBy,
    message: blockedBy.length ? msg("release.blocked", { gates: blockedBy.join(",") }) : msg("release.allowed"),
  };
}

/**
 * What to send back, and to which stage: the targets of findings that a
 * redo can fix, with every stage that reads their output. Null when nothing
 * can be revised or the limit is reached.
 * @param {Review} review @param {Graph} graph @param {{ round: number, maxRevisions?: number }} o
 */
export function revisionPlan(review, graph, o) {
  const max = o.maxRevisions ?? LIMITS.maxRevisions;
  if (o.round > max) return null;
  /** @type {Map<string, string[]>} */
  const notes = new Map();
  const known = new Set(graph.nodes.map((n) => n.id));
  for (const g of review.gates) for (const f of g.findings) {
    if (f.severity === "note" || !f.target || !f.note || !known.has(f.target)) continue;
    if (!notes.has(f.target)) notes.set(f.target, []);
    /** @type {string[]} */ (notes.get(f.target)).push(f.note);
  }
  if (!notes.size) return null;
  const targets = [...notes.keys()];
  return { round: o.round, max, targets, stages: dependents(graph, targets), notes: Object.fromEntries([...notes].map(([k, v]) => [k, v.join("\n\n")])) };
}

/**
 * Send the work back: the stages are forgotten in the run state (so the next
 * run redoes them), the gaps they reported are withdrawn, and the notes wait
 * for the target stages. Mutates and returns the run state.
 * @param {any} state run.json @param {NonNullable<ReturnType<typeof revisionPlan>>} plan
 */
export function applyRevision(state, plan) {
  state.revisionNotes = { ...(state.revisionNotes ?? {}), ...plan.notes };
  for (const id of plan.stages) {
    const done = state.stages?.[id];
    if (!done) continue;
    for (const g of Array.isArray(done.gaps) ? done.gaps : []) {
      const at = state.gaps.indexOf(g);
      if (at !== -1) state.gaps.splice(at, 1);
    }
    delete state.stages[id];
  }
  state.revisions = (state.revisions ?? 0) + 1;
  state.status = "revising";
  return state;
}

/**
 * The rendered master, measured: it must be measured, as long as planned,
 * within loudness and peak limits, fully voiced, with no picture or voice
 * that failed to render.
 * @param {any} report render/render-film.mjs report.json
 * @param {{ measuredSeconds?: number | null, lang?: never }} [o]
 * @returns {Gate}
 */
export function masterGate(report, o = {}) {
  /** @type {Finding[]} */
  const f = [];
  if (!report) return gate("master", [{ code: "master.missing", severity: "block", message: msg("master.missing") }], {});
  const m = report.master;
  if (!m) f.push({ code: "master.missing", severity: "block", message: msg("master.missing") });
  else {
    if (m.integratedLufs !== null && Math.abs(m.integratedLufs - LIMITS.targetLufs) > 1) f.push({ code: "master.loudness", severity: "block", message: msg("master.loudness", { lufs: m.integratedLufs, target: LIMITS.targetLufs }) });
    if (m.truePeakDbtp !== null && m.truePeakDbtp > LIMITS.ceilingDbtp) f.push({ code: "master.peak", severity: "block", message: msg("master.peak", { peak: m.truePeakDbtp, ceiling: LIMITS.ceilingDbtp }) });
  }
  if (Number(report.narratedScenes) > 0 && Number(report.voicedScenes) < Number(report.narratedScenes)) f.push({ code: "master.voice", severity: "block", message: msg("master.voice", { voiced: report.voicedScenes, narrated: report.narratedScenes }) });
  if (o.measuredSeconds !== undefined && o.measuredSeconds !== null && Math.abs(o.measuredSeconds - Number(report.durationSeconds)) > 1) f.push({ code: "master.duration", severity: "block", message: msg("master.duration", { actual: Math.round(o.measuredSeconds), expected: Math.round(Number(report.durationSeconds)) }) });
  /** @type {string[]} */
  const warnings = Array.isArray(report.warnings) ? report.warnings.map(String) : [];
  // A picture or voice that failed, black the script did not ask for, or a voice cut short is a defect; a missing music cue is not.
  const serious = warnings.filter((w) => /could not be (downloaded|drawn|measured)|Black picture|s cut\.|normalisation failed/i.test(w));
  if (serious.length) f.push({ code: "master.warnings", severity: "block", message: msg("master.warnings", { count: serious.length, first: serious[0].slice(0, 200) }) });
  else if (warnings.length) f.push({ code: "master.warnings", severity: "note", message: msg("master.warnings", { count: warnings.length, first: warnings[0].slice(0, 200) }) });
  return gate("master", f, { lufs: m?.integratedLufs ?? null, truePeak: m?.truePeakDbtp ?? null, voiced: report.voicedScenes, narrated: report.narratedScenes, warnings: warnings.length });
}

/**
 * Append one decision to the film's record (decisions.json): who decided
 * what, on which evidence. Never rewritten, only added to.
 * @param {Store} store
 * @param {{ actor: "bossism" | "owner", action: string, message: Msg, gates?: Record<string, string>, reason?: string, round?: number }} d
 */
export async function recordDecision(store, d) {
  const list = (await readJson(store, "decisions.json")) ?? [];
  const entry = { at: new Date().toISOString(), ...d };
  list.push(entry);
  await store.put("decisions.json", JSON.stringify(list, null, 1));
  return entry;
}

/** The gates as id -> verdict, for the decision record. @param {Gate[]} gates */
export function verdicts(gates) {
  return Object.fromEntries(gates.map((g) => [g.id, g.verdict]));
}

/**
 * The owner's own approval of a blocked release, for the record. It needs a
 * written reason; it does not change the review.
 * @param {Store} store @param {Review} review @param {string} reason
 */
export async function ownerOverride(store, review, reason) {
  const why = String(reason ?? "").trim();
  if (review.gatesVersion !== GATES_VERSION) return { ok: /** @type {const} */ (false), error: "This review was made by an older version of the checks. Review the film again before approving its release." };
  if (why.length < 10) return { ok: /** @type {const} */ (false), error: "Write the reason for releasing a film that failed its checks (at least 10 characters)." };
  const entry = await recordDecision(store, { actor: "owner", action: "release-override", message: msg("release.override", { gates: review.release.blockedBy.join(","), reason: why.slice(0, 500) }), gates: verdicts(review.gates), reason: why.slice(0, 500) });
  return { ok: /** @type {const} */ (true), entry };
}

/**
 * Is this film cleared for release: by its latest review, or by an owner
 * approval given after that review?
 * @param {Review | null} review @param {any[] | null} decisions
 */
export function cleared(review, decisions) {
  if (!review) return { ok: false, by: null };
  // A review by older gates clears nothing, not even with an earlier approval: the film is reviewed again.
  if (review.gatesVersion !== GATES_VERSION) return { ok: false, by: null, stale: true };
  if (review.release.allowed) return { ok: true, by: "bossism" };
  const override = (decisions ?? []).filter((d) => d.actor === "owner" && d.action === "release-override" && d.at >= review.at).pop();
  return override ? { ok: true, by: "owner" } : { ok: false, by: null };
}
