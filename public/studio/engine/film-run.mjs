/**
 * The autonomous film run: one topic in, a finished documentary blueprint
 * out (S0-S7 of the engine manual), with no chat turns and no human step.
 *
 * The model writes; this module decides what it writes next, what it is
 * given, and whether the result is good enough. Every S5 chapter is checked
 * in code (scene-lines.mjs) and repaired with exact find/replace fixes until
 * it passes or the remaining failures are recorded as GAPs. Nothing is
 * marked done because the model said so.
 *
 * Runtime-agnostic: the caller injects
 * - model.call(request) -> { text, stopReason, usage }  (worker/anthropic.mjs)
 * - store.get(key) / store.put(key, text)                (R2 in the Worker, a Map in tests)
 * - step(name, fn)                                       (Cloudflare Workflows step.do, or fn() in tests)
 * so a run survives restarts: a finished stage is never paid for twice.
 */
import { chapterMedia, createUseHistory } from "./film-media.mjs";
import { getFormat, suggestFormat } from "./formats.mjs";
import { checkOriginality, fingerprintFilm } from "./originality.mjs";
import { FICTION_LABELS, lintNarration, STORY_RULES } from "./story-mode.mjs";
import { applyFixes, checkChapter, checkFilm, parseSceneLines, toClock, toSeconds } from "./scene-lines.mjs";
import { getVersion } from "./versions.mjs";

/** Versions the run can produce today. Arabic and Bangla follow once English works end to end. */
export const RUN_VERSIONS = Object.freeze(["en-US"]);

/** US dollars per million tokens. Cache writes use the 1-hour TTL (2x input). */
export const PRICES = Object.freeze({
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 4 },
});

/**
 * @typedef {{ id: string, topic: string, durationSeconds: number, versionId: string, allowAi?: boolean, notes?: string, formatId?: string | null }} Film
 * @typedef {{ text: string, cache?: boolean, image?: string }} Block  image: an https image URL; text is ignored then
 * @typedef {{ stage: string, system: Block[], messages: { role: "user" | "assistant", content: Block[] }[], maxTokens: number, effort: string, webSearch?: { maxUses: number } }} ModelRequest
 * @typedef {{ input_tokens?: number, output_tokens?: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number }} Usage
 * @typedef {{ text: string, stopReason: string, usage: Usage, model?: string }} ModelReply
 * @typedef {{ name: string, call: (r: ModelRequest) => Promise<ModelReply> }} Model
 * @typedef {{ get: (key: string) => Promise<string | null>, put: (key: string, text: string) => Promise<void> }} Store
 * @typedef {<T>(name: string, fn: () => Promise<T>) => Promise<T>} Step
 * @typedef {{ id: string, title: string, start: string, end: string, firstScene: string, lastScene: string, brief: string }} ChapterPlan
 */

/**
 * Validate a new film request. formatId picks one of the format presets
 * (formats.mjs: motivational life story, dramatized story, history epic ...);
 * "auto" lets the topic choose; none keeps the general documentary.
 * @param {{ topic?: unknown, minutes?: unknown, versionId?: unknown, allowAi?: unknown, notes?: unknown, formatId?: unknown }} input
 * @param {string} id
 * @returns {{ ok: true, film: Film } | { ok: false, error: string }}
 */
export function newFilm(input, id) {
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const minutes = Number(input.minutes);
  const versionId = typeof input.versionId === "string" ? input.versionId : "en-US";
  if (topic.length < 3 || topic.length > 500) return { ok: false, error: "Give a topic of 3 to 500 characters." };
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 300) return { ok: false, error: "Length must be 1 to 300 minutes." };
  if (!RUN_VERSIONS.includes(versionId)) return { ok: false, error: `Only ${RUN_VERSIONS.join(", ")} can be made right now.` };
  const notes = typeof input.notes === "string" ? input.notes.trim().slice(0, 2000) : "";
  const asked = typeof input.formatId === "string" ? input.formatId.trim() : "";
  const format = asked === "auto" ? suggestFormat(topic) : asked ? getFormat(asked) : null;
  if (asked && !format) return { ok: false, error: `Unknown format "${asked}".` };
  return { ok: true, film: { id, topic, durationSeconds: Math.round(minutes * 60), versionId, allowAi: input.allowAi === true, notes, formatId: format?.id ?? null } };
}

/**
 * True when the film is an invented story (format mode "story"): no research
 * claims to prove, but realism facts, story rules and the description note.
 * @param {Film} film
 */
export function isStoryFilm(film) {
  return Boolean(film.formatId && getFormat(film.formatId)?.mode === "story");
}

/**
 * The production brief every stage receives (stable, so it is cached).
 * @param {Film} film
 */
export function filmBrief(film) {
  const v = getVersion(film.versionId);
  if (!v) throw new Error(`Unknown version "${film.versionId}".`);
  const format = film.formatId ? getFormat(film.formatId) : null;
  const story = format?.mode === "story";
  const note = FICTION_LABELS[/** @type {keyof typeof FICTION_LABELS} */ (film.versionId)] ?? FICTION_LABELS["en-US"];
  return [
    `FILM: "${film.topic}". Runtime exactly ${toClock(film.durationSeconds)}. Version ${v.name}.`,
    format ? `FORMAT: ${format.name} (${story ? "an invented story" : "a true story told from sources"}). Hook: ${format.hook} Beats: ${format.beats.join("; ")}. Visuals: ${format.visuals}. Music: ${format.music}. The genre examples (${format.examples.join(", ")}) only show the kind of film: never copy a channel's structure, wording or look; every film is written new (YouTube's inauthentic-content rule).` : "",
    film.notes ? `CLIENT NOTES: ${film.notes}` : "",
    "",
    "PIPELINE MODE (overrides the chat protocol in section 2): there are no chat turns. Write the complete stage you are asked for in one reply. Ignore the reply budget, batch sizes and the STATE block. Output only the stage itself, in markdown, with no preamble and no closing remarks.",
    "Every S5 chapter uses COMPACT scene lines (11.2) whatever the film length, because code parses and checks every line.",
    "",
    "PRODUCTION RULES (override the engine where they differ):",
    story
      ? `1. STORY MODE: the story is invented. Never name, depict or imply a real private person, and never attach an invented act to any real person, company or town; invented characters get names no famous real person has. Real-world details (prices, wages, laws, distances, jobs, era) come from the research file and the S2 realism ledger and must be exact. Never call the story true, real or "based on a true story" in narration, title, thumbnail or description. Nothing is written on the video to say it is invented; S7 ends the description with this exact line: "${note}"`
      : "1. Facts only from the research file and the S2 ledger. Where sources conflict, never pick silently: say \"reports differ\" or use wording every source supports. Quotes are paraphrased with attribution (\"he told X in 2014 that ...\"), never presented as verbatim. Unknown means unknown.",
    "2. Footage only from free stock: Pexels, Pixabay, Videvo (free licence, commercial use, never Editorial Use Only or Premium), Coverr (downloaded by hand) and Mixkit (Free Licence), plus graphics the editor builds (R1: OpenStreetMap maps credited \"© OpenStreetMap contributors\", kinetic type, counters, timelines, document-style cards rebuilt from public facts). Music and SFX only from Pixabay and Mixkit. Never social media, agency, archive or screenshot material.",
    film.allowAi ? "3. AI imagery only where the engine allows it, never a real person's likeness, disclosed in YouTube Studio's altered-or-synthetic setting; nothing written on the video." : "3. No AI imagery or AI audio (AI cap = 0 s).",
    "4. Never present a stock person's face as a real person in the story or their family; never imply it in narration. Use hands, backs, silhouettes, objects, places and typography. Minors are never named or shown.",
    "5. Cinema finish: one master grade, speed ramps, push-ins, match cuts, layered sound, deliberate silence; less-downloaded clips; no clip repeated within 10 minutes; at most 3 variants per clip. Nothing is written on the video to mark it as fiction, AI or illustration.",
    "6. Retention: a 30-second hook (four beats, fast cuts), a reset about every 3 minutes, a pattern interrupt about every 25 seconds, a midpoint turn, an 80% cliffhanger, every open loop paid.",
    "7. Written to be felt, not only understood: every chapter has one scene built to move the viewer (a loss, a sacrifice, a choice, a reunion or a reveal). Before it the music drops or goes silent and the narration slows into short sentences; the picture holds; the music swells after. Specific sensory detail beats adjectives. People want something concrete, fear something specific and pay a price for what they get. The lesson lands through what happens and is never stated. End on an image and one line the viewer repeats.",
    ...(story ? ["", "STORY RULES:", ...STORY_RULES.map((r, i) => `S${i + 1}. ${r}`)] : []),
    "",
    `VERSION LOCK: audience ${v.audience}; language ${v.register}; currency ${v.currency} (an amount that began in another currency is shown in dollars first, with the original small beneath and the conversion basis in the ledger). Narration pace ${v.narrationWpm.target} words per minute. Codes, IDs, search queries and file or grade terms stay in English. Never mention any other version.`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

/** A format example for one compact scene line (written for this module, not from any film). */
export const SCENE_LINE_EXAMPLE =
  "**SC0001** | 0:00:00-0:00:08 | C1 | HOOK B1 | E | C01, C02 | NARR: Final, speakable narration, numbers spelled out for the voice. | W 20/20 | ANCHOR: \"key word\" -> what appears on screen 0:00:02.5 | SHOTS: (1) 0:00:00-0:00:04 R3 OBJ-01 description, no face; (2) 0:00:04-0:00:08 R1 kinetic card | EV: R1 1 / R3 1 | RUNG: R3/L2 -> R1/L4 | FX: FX-KINETIC, FX-SOURCECHIP | SRC: Pexels https://www.pexels.com/video/... · Q1 \"exact query\" · Q2 \"exact query\" | MOTION: 1.08x push | TRANS: hard cut on the beat | OST: on-screen text; source chip | SFX: SND-FX-01 | MUS: M01 | LOOK: LOOK-M";

/**
 * Pull the last fenced JSON block out of a reply.
 * @param {string} text
 */
export function extractJson(text) {
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
  const raw = blocks.length ? blocks[blocks.length - 1][1] : text;
  return JSON.parse(raw);
}

/**
 * The S3 chapter plan must tile the film exactly, with contiguous scene IDs.
 * @param {unknown} plan
 * @param {number} durationSeconds
 */
export function validateChapterPlan(plan, durationSeconds) {
  /** @type {string[]} */
  const errors = [];
  if (!Array.isArray(plan) || plan.length === 0) return { ok: false, errors: ["The chapter plan is not a non-empty array."] };
  let clock = 0;
  let scene = 1;
  plan.forEach((c, i) => {
    const at = `Chapter ${i + 1}`;
    if (!c || typeof c !== "object") { errors.push(`${at} is not an object.`); return; }
    if (c.id !== `C${i + 1}`) errors.push(`${at} has id "${c.id}", expected "C${i + 1}".`);
    for (const k of ["title", "start", "end", "firstScene", "lastScene", "brief"]) if (typeof c[k] !== "string" || !c[k].trim()) errors.push(`${at} has no ${k}.`);
    const start = toSeconds(String(c.start));
    const end = toSeconds(String(c.end));
    if (start !== clock) errors.push(`${at} starts at ${c.start}, expected ${toClock(clock)}.`);
    if (!(end > start)) errors.push(`${at} ends at ${c.end}, not after its start.`);
    const first = Number(String(c.firstScene).replace(/^SC/, ""));
    const last = Number(String(c.lastScene).replace(/^SC/, ""));
    if (first !== scene) errors.push(`${at} starts at ${c.firstScene}, expected SC${String(scene).padStart(4, "0")}.`);
    if (!(last >= first)) errors.push(`${at} ends at ${c.lastScene}, before its first scene.`);
    clock = Number.isFinite(end) ? end : clock;
    scene = Number.isFinite(last) ? last + 1 : scene;
  });
  if (clock !== durationSeconds) errors.push(`The plan ends at ${toClock(clock)}, expected ${toClock(durationSeconds)}.`);
  return { ok: errors.length === 0, errors };
}

/** @param {ChapterPlan} c @param {string} versionId */
export function chapterSpec(c, versionId) {
  return {
    startSeconds: toSeconds(c.start), endSeconds: toSeconds(c.end),
    firstScene: Number(c.firstScene.replace(/^SC/, "")), lastScene: Number(c.lastScene.replace(/^SC/, "")), versionId,
  };
}

/**
 * A rough cost estimate before a run, so the owner sees the price first.
 * Based on the Ramesh Babu film (45 min: about 15k output tokens per
 * 7.5-minute chapter, thinking included at 1.5x). Real usage is logged per
 * call in run.json and replaces this estimate as the run goes.
 * @param {number} durationSeconds
 * @param {string} [model]
 */
export function estimateRun(durationSeconds, model = "claude-opus-5-5") {
  const price = PRICES[/** @type {keyof typeof PRICES} */ (model)];
  if (!price) throw new Error(`No price for ${model}.`);
  const minutes = durationSeconds / 60;
  const chapters = Math.max(1, Math.round(minutes / 7.5));
  const outPerChapter = Math.max(4000, (minutes / chapters) * 2000) * 1.5;
  const fixedOut = 6 * 12000 * 1.5; // S0-S4, QA, S6, S7
  const outputTokens = Math.round(chapters * outPerChapter * 1.2 + fixedOut); // 1.2: repairs
  const cachedIn = 30000 * (chapters + 8); // manual + brief + ledger + bibles, read from cache
  const searches = 30; // research stage: web_search max_uses
  const freshIn = Math.round(chapters * 12000 + 8 * 15000 + minutes * 3000 + searches * 10000); // stage inputs, QA reads the film, search results
  // Footage desk: about 6.3 stock shots a minute, judged six at a time from 320 px thumbnails.
  const judgeCalls = Math.ceil((minutes * 6.3) / 6);
  const judgeUsd = (judgeCalls * (30000 * price.cacheRead + 3500 * price.input + 400 * price.output)) / 1e6;
  const usd = (outputTokens * price.output + cachedIn * price.cacheRead + freshIn * price.input + 60000 * price.cacheWrite) / 1e6 + searches * 0.01 + judgeUsd;
  return { model, chapters, outputTokens, inputTokens: cachedIn + freshIn, judgeCalls, usdLow: round2(usd * 0.7), usdHigh: round2(usd * 1.5) };
}

/**
 * @param {Usage} u
 * @param {string} model
 */
export function costOf(u, model) {
  const p = PRICES[/** @type {keyof typeof PRICES} */ (model)];
  if (!p) return 0;
  return ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

/** Effort per stage: the writing and checking stages think hardest. */
export const STAGE_EFFORT = Object.freeze({ s01: "high", research: "high", s2: "medium", s3: "high", s4: "medium", s5: "high", repair: "medium", qa: "high", s6: "medium", s7: "medium" });

/**
 * Run (or resume) a film. Returns the final run state.
 * budgetUsd stops the run before any stage that starts once the money spent
 * has reached it, so a small budget is never overrun by more than one stage.
 * media (optional) adds the media step after QA: free stock footage for
 * every S5 shot, one media-C1.json ... per chapter. Without providers (no
 * PEXELS_API_KEY or PIXABAY_API_KEY) the step is left for a later resume.
 * media.review (default true) shows the model small thumbnails of each
 * shot's top candidates and keeps only a clip it says fits.
 * channel (optional) holds the fingerprints of the channel's earlier films;
 * the finished film is compared with them (originality.json) and added.
 * @param {{ film: Film, manual: string, model: Model, store: Store, step?: Step, log?: (line: string) => void, maxRepairs?: number, budgetUsd?: number, channel?: { load(): Promise<import("./originality.mjs").Fingerprint[]>, save(list: import("./originality.mjs").Fingerprint[]): Promise<void> }, media?: { providers: import("./film-media.mjs").MediaProvider[], review?: boolean, maxWaitMs?: number, timeoutMs?: number, sleep?: (ms: number) => Promise<void> } }} o
 */
export async function runFilm(o) {
  const { film, manual, model, store } = o;
  const step = o.step ?? (async (_name, fn) => fn());
  const log = o.log ?? (() => {});
  const maxRepairs = o.maxRepairs ?? 2;
  const brief = filmBrief(film);
  const system = [{ text: manual, cache: true }, { text: brief, cache: true }];

  /** @type {any} */
  const state = JSON.parse((await store.get("run.json")) ?? "null") ?? { film, model: model.name, stages: {}, usage: {}, costUsd: 0, gaps: [], status: "running" };
  const save = () => store.put("run.json", JSON.stringify(state, null, 1));

  /**
   * One model call, with continuation when the reply hits max_tokens.
   * @param {string} stage @param {Block[]} content @param {number} maxTokens @param {{ webSearch?: { maxUses: number }, effort?: string }} [extra]
   */
  async function ask(stage, content, maxTokens, extra = {}) {
    /** @type {ModelRequest["messages"]} */
    const messages = [{ role: "user", content }];
    let text = "";
    for (let part = 0; part < 4; part += 1) {
      const reply = await model.call({ stage, system, messages, maxTokens, effort: extra.effort ?? STAGE_EFFORT[/** @type {keyof typeof STAGE_EFFORT} */ (stage.split(":")[0])] ?? "medium", webSearch: extra.webSearch });
      record(stage, reply);
      if (reply.stopReason === "refusal") throw new Error(`The model declined stage ${stage}.`);
      if (reply.stopReason !== "max_tokens") return text + reply.text;
      // Cut off: keep complete lines only and ask for the rest.
      const complete = reply.text.slice(0, reply.text.lastIndexOf("\n") + 1);
      text += complete;
      messages.length = 1;
      messages.push({ role: "assistant", content: [{ text: text.slice(-6000) }] });
      messages.push({ role: "user", content: [{ text: "You reached the output limit. Continue exactly after the last complete line above. Do not repeat anything already written." }] });
      log(`${stage}: continuing after max_tokens (part ${part + 2})`);
    }
    throw new Error(`Stage ${stage} did not finish in 4 parts.`);
  }

  /** @param {string} stage @param {ModelReply} reply */
  function record(stage, reply) {
    const u = reply.usage ?? {};
    const s = (state.usage[stage] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    s.calls += 1;
    for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) s[k] += /** @type {any} */ (u)[k] ?? 0;
    state.costUsd = round2(state.costUsd + costOf(u, reply.model ?? model.name));
  }

  /**
   * Run a stage once; skip it when its output already exists.
   * @template T @param {string} id @param {() => Promise<T>} fn @returns {Promise<T>}
   */
  async function stage(id, fn) {
    if (state.stages[id]?.status === "done") return state.stages[id].result;
    if (o.budgetUsd !== undefined && state.costUsd >= o.budgetUsd) {
      state.status = "stopped-budget";
      throw new BudgetReached(`Budget of $${o.budgetUsd} reached ($${state.costUsd} spent) before ${id}.`);
    }
    log(`${id}: start`);
    const result = await step(id, async () => {
      const r = await fn();
      return r;
    });
    state.stages[id] = { status: "done", result };
    await save();
    log(`${id}: done`);
    return result;
  }

  /** @param {string} key */
  const read = async (key) => (await store.get(key)) ?? "";
  const ctx = (/** @type {string} */ label, /** @type {string} */ body) => `<${label}>\n${body}\n</${label}>`;

  await save();
  try {
    await stage("s01", async () => {
      const text = await ask("s01", [{ text: "Write S0 (section 4: intake, media math, risk scan) and S1 (section 5: beat-the-best, angle, 10 titles scored, 3 thumbnail briefs, title contract) for this film. Mark every title number PROVISIONAL until S2 confirms it." }], 24000);
      await store.put("s01.md", text);
      return { chars: text.length };
    });

    await stage("research", async () => {
      const s01 = await read("s01.md");
      const text = await ask("research", [
        { text: ctx("S0_S1", s01) },
        { text: (isStoryFilm(film)
          ? "This film is an invented story. Research on the web the real-world details it needs to feel exact: prices, wages and costs of the time and place, laws and procedures, jobs and how they are done, places, distances, customs and era details. Record conflicts between sources instead of resolving them; list famous real people the invented characters must not be confused with."
          : "Research this film's subject on the web. Find primary and reliable secondary sources; record conflicts between sources instead of resolving them; note people or things that could be confused with the subject.") + " Then output ONE fenced ```json block, and nothing after it, shaped as: {\"subject\": string, \"facts\": [{\"id\": \"F01\", \"claim\": string, \"value\": string, \"sources\": [url, ...], \"confidence\": \"high\"|\"medium\"|\"low\", \"conflict\": string|null}], \"unknowns\": [string], \"doNotConfuse\": [string]}. Every fact needs at least one source URL you actually opened or found in search results. Never invent a URL." },
      ], 32000, { webSearch: { maxUses: 30 } });
      const data = extractJson(text);
      const facts = Array.isArray(data?.facts) ? data.facts : [];
      const sourced = facts.filter((/** @type {any} */ f) => Array.isArray(f.sources) && f.sources.some((/** @type {unknown} */ u) => typeof u === "string" && /^https?:\/\//.test(u)));
      const needed = isStoryFilm(film) ? 5 : 8;
      if (sourced.length < needed) throw new Error(`Research found only ${sourced.length} sourced facts (at least ${needed} needed).`);
      if (sourced.length < facts.length) state.gaps.push(`research: ${facts.length - sourced.length} facts without a source URL were dropped.`);
      data.facts = sourced;
      await store.put("research.json", JSON.stringify(data, null, 1));
      return { facts: sourced.length };
    });

    await stage("s2", async () => {
      const text = await ask("s2", [
        { text: ctx("S0_S1", await read("s01.md")) + "\n" + ctx("RESEARCH", await read("research.json")) },
        { text: isStoryFilm(film)
          ? "Write S2 for an invented story: (a) the realism ledger, one row per real-world detail the story uses, with ID (C01...), detail, exact value, sources and chapter use, from the research file only; (b) the story bible: each invented character's name (no famous real person's name), age, want, wound, fear and the price they pay; (c) if money is involved, the money path: every jump in wealth with its cause and the exact figures, adding up."
          : "Write S2, the claim ledger (section 6), from the research file only: one row per claim with ID (C01...), claim, status (FACT, CONTESTED, QUOTE -> paraphrase, ESTIMATE, UNKNOWN), value, sources, confidence, conflicts, wording rule for narration, on-screen chip and chapter use. Currency conversions use that year's rate and today's money; values you cannot compute from the research are PENDING with the exact method." },
      ], 32000);
      await store.put("s2.md", text);
      return { claims: (text.match(/\bC\d{2,3}\b/g) ?? []).length };
    });

    const plan = await stage("s3", async () => {
      const content = [
        { text: ctx("S0_S1", await read("s01.md")) + "\n" + ctx("S2", await read("s2.md")) },
        { text: `Write S3, the story architecture (section 7): arc, chapter plan, scene allocation and clock, retention map, interrupt plan, progress motif, title-contract binding, open-loop ledger, emotion curve, music arc, Shorts candidates. Then end with ONE fenced \`\`\`json block: an array of chapters, each {"id": "C1", "title", "start": "0:00:00", "end": "h:mm:ss", "firstScene": "SC0001", "lastScene": "SC00nn", "brief": "a self-contained brief for that chapter's writer: scene count, word budget, beats with exact times and claim IDs, loops opened and paid, what it must hand to the next chapter"}. Chapters tile 0:00:00 to ${toClock(film.durationSeconds)} with no gap; scene IDs run from SC0001 with no gap. Chapters of 5 to 9 minutes; a film under 10 minutes has 1 to 3 chapters.` },
      ];
      let text = await ask("s3", content, 32000);
      let chapters = safeJson(text);
      let check = validateChapterPlan(chapters, film.durationSeconds);
      for (let i = 0; !check.ok && i < maxRepairs; i += 1) {
        log(`s3: chapter plan invalid (${check.errors.length}), repairing`);
        const fixed = await ask("repair:s3", [{ text: ctx("CHAPTER_PLAN", JSON.stringify(chapters ?? text.slice(-8000), null, 1)) }, { text: "This chapter plan fails these checks:\n- " + check.errors.join("\n- ") + `\nReturn the corrected plan as ONE fenced \`\`\`json array and nothing else. Runtime ${toClock(film.durationSeconds)}.` }], 16000);
        chapters = safeJson(fixed);
        check = validateChapterPlan(chapters, film.durationSeconds);
      }
      if (!check.ok) throw new Error("S3 chapter plan still invalid: " + check.errors.join(" "));
      await store.put("s3.md", text);
      await store.put("s3-chapters.json", JSON.stringify(chapters, null, 1));
      return { chapters: /** @type {ChapterPlan[]} */ (chapters) };
    });

    await stage("s4", async () => {
      const text = await ask("s4", [
        { text: ctx("S2", await read("s2.md")) + "\n" + ctx("S3", await read("s3.md")) },
        { text: "Write S4, the production bibles (section 8): narrator, characters and depiction policy, locations, objects, the master look and chapter trims, motion-graphics style, sound bible with tokens and search phrases, music plan per cue, pronunciation lexicon, continuity rules, and the bible summary block (8.8)." },
      ], 32000);
      await store.put("s4.md", text);
      return { chars: text.length };
    });

    // S5: one chapter at a time, each checked and repaired in code.
    const shared = ctx("S2", await read("s2.md")) + "\n" + ctx("S4", await read("s4.md"));
    let previousTail = "";
    for (const ch of plan.chapters) {
      const key = `s5-${ch.id}.md`;
      const spec = chapterSpec(ch, film.versionId);
      await stage(`s5:${ch.id}`, async () => {
        const instruction = [
          `Write stage S5 for chapter ${ch.id} "${ch.title}" only: ${ch.start}-${ch.end}, scenes ${ch.firstScene}-${ch.lastScene}, every scene in order, one compact scene line each, exactly in this shape:`,
          SCENE_LINE_EXAMPLE,
          `Rules the code will check: the first scene starts at ${ch.start} and the last ends at ${ch.end}; each scene starts where the previous one ends; scene IDs have no gap; every narrated scene has (seconds × ${(getVersion(film.versionId)?.narrationWpm.target ?? 150) / 60}) words ±10% (wordless scenes say NARR: (wordless)); the W field states written/target; every line has NARR, ANCHOR, SHOTS and LOOK; no banned phrase (section 16); footage only from the allowed sites.`,
          "Start with a header line, the word budget and the chapter's reuse log; end with one QA line.",
          ctx("CHAPTER_BRIEF", JSON.stringify(ch, null, 1)),
          previousTail ? ctx("PREVIOUS_CHAPTER_END", previousTail) : "",
        ].filter(Boolean).join("\n\n");
        let text = await ask(`s5:${ch.id}`, [{ text: shared, cache: true }, { text: instruction }], 64000);
        let check = checkChapter(text, spec);
        for (let i = 0; !check.ok && i < maxRepairs; i += 1) {
          log(`s5:${ch.id}: ${check.errors.length} failures, repair ${i + 1}`);
          text = await repairChapter(text, check.errors, ch);
          check = checkChapter(text, spec);
        }
        if (!check.ok) state.gaps.push(...check.errors.map((e) => `${ch.id} ${e.scene ?? ""} ${e.code}: ${e.detail}`.replace(/\s+/g, " ")));
        if (isStoryFilm(film) || film.formatId === "motivational-life-story") {
          // Writing that sounds machine-made or preaches loses the viewer; flag it for the QA desk and the owner.
          const narration = parseSceneLines(text).filter((s) => !s.wordless).map((s) => s.narration).join(" ");
          const lint = lintNarration(narration, film.versionId);
          state.gaps.push(...lint.problems.filter((p) => p.rule !== "version-purity").map((p) => `${ch.id} writing (${p.rule}): ${p.detail}`));
        }
        await store.put(key, text);
        return { ok: check.ok, ...check.stats };
      });
      previousTail = (await read(key)).split("\n").filter((l) => /^\s*(\*\*)?SC\d{4}/.test(l)).slice(-2).join("\n");
    }

    /**
     * Ask for exact find/replace fixes for the failures, apply them in code.
     * @param {string} text @param {{ code: string, scene?: string, detail: string }[]} errors @param {ChapterPlan} ch
     */
    async function repairChapter(text, errors, ch) {
      const structural = errors.some((e) => ["no-scenes", "scene-count", "first-scene", "last-scene", "unfinished"].includes(e.code));
      if (structural) {
        // Missing or extra scenes cannot be patched line by line: rewrite the chapter.
        return ask(`repair:${ch.id}`, [{ text: shared, cache: true }, { text: `Your chapter ${ch.id} failed these checks:\n- ${errors.map((e) => `${e.scene ?? ""} ${e.detail}`).join("\n- ")}\n\nRewrite the whole chapter so it passes, keeping every line that was right.\n\n` + ctx("CHAPTER_BRIEF", JSON.stringify(ch, null, 1)) + "\n" + ctx("YOUR_CHAPTER", text) }], 64000);
      }
      const reply = await ask(`repair:${ch.id}`, [{ text: ctx("YOUR_CHAPTER", text) }, { text: `These checks failed:\n- ${errors.map((e) => `${e.scene ?? ""} ${e.detail}`).join("\n- ")}\n\nFix only these. Return ONE fenced \`\`\`json array of {"find": exact text copied from the chapter, "replace": new text}. Keep each find short but unique (a whole NARR field with its W field is ideal). Word fixes change the narration and its W field together; facts must stay as they are.` }], 16000);
      const fixes = safeJson(reply);
      if (!Array.isArray(fixes)) return text;
      return applyFixes(text, fixes).text;
    }

    // QA over the whole film: code first, then the model's three lenses.
    await stage("qa", async () => {
      const chapters = await Promise.all(plan.chapters.map(async (c) => ({ id: c.id, markdown: await read(`s5-${c.id}.md`), spec: chapterSpec(c, film.versionId) })));
      const machine = checkFilm(chapters, { durationSeconds: film.durationSeconds });
      const reply = await ask("qa", [
        { text: ctx("S2", await read("s2.md")) + "\n" + chapters.map((c) => ctx(`S5_${c.id}`, c.markdown)).join("\n") },
        { text: "You are the QA desk. Code already checked clock, IDs, word counts, fields, banned phrases, language and sources; its findings:\n" + JSON.stringify(machine.errors.slice(0, 60)) + "\n\nMake three passes for what code cannot check: A FACTS (every statement against the S2 ledger: invented facts, silently resolved conflicts, quotes presented as verbatim, unattributed superlatives), B LANGUAGE AND RIGHTS (version lock, speakable narration, no stock face as a real person, licences), C CRAFT (hook, resets, interrupts, midpoint, cliffhanger, loops paid, hand-offs). Output ONE fenced ```json block: {\"mustFix\": [{\"lens\": \"facts|language|craft\", \"chapter\": \"C1\", \"scene\": \"SC0001\", \"issue\": string, \"find\": exact text from that chapter, \"replace\": exact replacement}], \"passed\": [string], \"notChecked\": [string]}. Each find must occur exactly once in its chapter. A word-count change must keep the scene within ±10% and update its W field." },
      ], 32000);
      const qa = safeJson(reply) ?? { mustFix: [], passed: [], notChecked: ["The QA reply was not valid JSON."] };
      /** @type {{ chapter: string, scene: string, status: string }[]} */
      const fixLog = [];
      for (const c of chapters) {
        const fixes = (qa.mustFix ?? []).filter((/** @type {any} */ f) => f.chapter === c.id);
        if (!fixes.length) continue;
        const before = checkChapter(c.markdown, c.spec);
        const { text, log: applied } = applyFixes(c.markdown, fixes);
        const after = checkChapter(text, c.spec);
        if (after.errors.length > before.errors.length) {
          // A fix that breaks the clock or the word budget is not applied.
          fixes.forEach((/** @type {any} */ f) => fixLog.push({ chapter: c.id, scene: f.scene, status: "reverted: broke a code check" }));
          continue;
        }
        await store.put(`s5-${c.id}.draft.md`, c.markdown);
        await store.put(`s5-${c.id}.md`, text);
        applied.forEach((a, i) => fixLog.push({ chapter: c.id, scene: fixes[i]?.scene, status: a.status }));
      }
      await store.put("qa.json", JSON.stringify(qa, null, 1));
      await store.put("fix-log.json", JSON.stringify(fixLog, null, 1));
      return { mustFix: (qa.mustFix ?? []).length, applied: fixLog.filter((f) => f.status === "applied").length };
    });

    // Media: free stock footage for every shot, in film order, so no clip
    // repeats within 10 minutes across chapters (earlier picks are reloaded).
    if (o.media?.providers.length) {
      const providers = o.media.providers;
      const history = createUseHistory();
      for (const c of plan.chapters) {
        const key = `media-${c.id}.json`;
        await stage(`media:${c.id}`, async () => {
          const judge = o.media?.review === false ? undefined : createFootageJudge(ask);
          const media = await chapterMedia({ chapter: c.id, markdown: await read(`s5-${c.id}.md`), providers, history, judge, maxWaitMs: o.media?.maxWaitMs, timeoutMs: o.media?.timeoutMs, sleep: o.media?.sleep });
          await store.put(key, JSON.stringify(media, null, 1));
          if (media.stats.missing) state.gaps.push(`${c.id} media: ${media.stats.missing} of ${media.stats.shots} stock shots have no fitting free clip yet (see ${key}).`);
          const unreviewed = media.shots.filter((s) => s.review === "unreviewed").length;
          if (unreviewed) state.gaps.push(`${c.id} media: ${unreviewed} picks could not be checked by eye and use the first search result.`);
          return media.stats;
        });
        const saved = await store.get(key);
        if (saved) history.load(JSON.parse(saved));
      }
    } else if (o.media) {
      state.media = "skipped: no PEXELS_API_KEY or PIXABAY_API_KEY";
    }

    await stage("s6", async () => {
      const chapters = await Promise.all(plan.chapters.map(async (c) => ({ id: c.id, markdown: await read(`s5-${c.id}.md`), spec: chapterSpec(c, film.versionId) })));
      const machine = checkFilm(chapters, { durationSeconds: film.durationSeconds });
      await store.put("film-check.json", JSON.stringify({ ok: machine.ok, errors: machine.errors, warnings: machine.warnings.length, stats: machine.stats }, null, 1));
      const text = await ask("s6", [
        { text: ctx("FILM_CHECK_BY_CODE", JSON.stringify({ ok: machine.ok, errors: machine.errors, stats: machine.stats }, null, 1)) + "\n" + ctx("QA", await read("qa.json")) + "\n" + ctx("FIX_LOG", await read("fix-log.json")) + "\n" + ctx("GAPS", JSON.stringify(state.gaps)) },
        { text: "Write S6, the whole-film QA report (section 13): one table of gates G1-G17 with PASS, FIXED or GAP and evidence, using the counts code produced (never estimate a number code gave you), the QA fixes applied by type with the total, and every remaining GAP with its action. Do not claim a check that was not run." },
      ], 16000);
      await store.put("s6.md", text);
      return { ok: machine.ok, gaps: state.gaps.length };
    });

    await stage("s7", async () => {
      const chapterTimes = plan.chapters.map((c) => `${c.start} ${c.title}`).join("\n");
      let text = await ask("s7", [
        { text: ctx("S0_S1", await read("s01.md")) + "\n" + ctx("CHAPTERS", chapterTimes) + "\n" + ctx("S6", await read("s6.md")) },
        { text: "Write S7, the publishing pack (section 14): final title matching the delivered film, 3 thumbnail briefs (free stock and typography, no real faces, no logos), description with chapters (first at 00:00, from the chapter times given), a credits block with \"© OpenStreetMap contributors\", tags, pinned comment, 3 Shorts and 1 Facebook cut with their own hooks and exact source timestamps, upload settings (no synthetic content, not made for kids, category, language) and a posting plan for this audience." + (isStoryFilm(film) ? ` This is an invented story: the title and thumbnails never say true, real or "based on a true story", and the description ends with this exact line: "${storyNote(film)}".` : "") },
      ], 16000);
      if (isStoryFilm(film)) {
        const note = storyNote(film);
        if (!text.includes(note)) text += `\n\n### Description note (required for an invented story)\n\n${note}\n`;
        const title = /\*\*Final title[^:]*:\s*([^*\n]+)\*\*/i.exec(text)?.[1] ?? "";
        if (/\b(true|real)[- ]life\b|\btrue story\b|\breal story\b|\bbased on (a )?true\b|\breally happened\b/i.test(title)) state.gaps.push(`S7: the title "${title.trim()}" claims the invented story is true; change it before upload.`);
      }
      await store.put("s7.md", text);
      return { chars: text.length };
    });

    if (o.channel) {
      const channel = o.channel;
      await stage("originality", async () => {
        const chapters = await Promise.all(plan.chapters.map((c) => read(`s5-${c.id}.md`)));
        const title = /\*\*Final title[^:]*:\s*([^*\n]+)\*\*/i.exec(await read("s7.md"))?.[1]?.trim();
        const fingerprint = fingerprintFilm({ id: film.id, topic: film.topic, title, chapters });
        const earlier = await channel.load();
        const report = checkOriginality(fingerprint, earlier);
        await store.put("originality.json", JSON.stringify({ ...report, title: fingerprint.title, titleSkeleton: fingerprint.titleSkeleton }, null, 1));
        if (report.verdict !== "pass") state.gaps.push(...report.reasons.map((r) => `originality (${report.verdict}): ${r}`));
        await channel.save([...earlier.filter((e) => e.id !== film.id), fingerprint].slice(-500));
        return { verdict: report.verdict, compared: report.compared };
      });
    }

    state.status = state.gaps.length ? "done-with-gaps" : "done";
  } catch (error) {
    if (!(error instanceof BudgetReached)) state.status = "failed";
    state.error = error instanceof Error ? error.message : String(error);
    await save();
    throw error;
  }
  await save();
  return state;
}

/**
 * The footage desk: which candidates fit each shot, judged from thumbnails.
 * `ask` is the run's model call (stage, content, maxTokens, extra) -> text.
 * @param {(stage: string, content: Block[], maxTokens: number, extra?: { effort?: string }) => Promise<string>} ask
 * @returns {import("./film-media.mjs").MediaJudge}
 */
export function createFootageJudge(ask) {
  return async (chapterId, shots) => {
    /** @type {Block[]} */
    const content = [{ text: "You are the footage desk. For each shot below, look at its candidate thumbnails and list the ones that work as documentary B-roll for exactly that shot: the right subject and setting, plausible for the place and period described. Reject a candidate that shows an identifiable face when the shot says no face, a readable brand, logo or licence plate where the shot avoids them, a watermark or burned-in text, an obviously staged stock-model look, or a clearly different country or period. Order the fitting candidates best first." }];
    for (const s of shots) {
      content.push({ text: `SHOT ${s.key}: ${s.description} (searched "${s.query}")` });
      for (const cand of s.candidates) { content.push({ text: `${s.key} candidate ${cand.index}:` }); content.push({ text: "", image: cand.previewUrl }); }
    }
    content.push({ text: "Output ONE fenced ```json object and nothing else, mapping every shot key to the candidate numbers that fit, best first, or [] when none fits. Example: {\"SC0001-1\": [2, 0], \"SC0001-2\": []}" });
    const verdict = safeJson(await ask(`media-judge:${chapterId}`, content, 2000, { effort: "low" }));
    if (!verdict || typeof verdict !== "object" || Array.isArray(verdict)) throw new Error("The footage verdict was not a JSON object.");
    return verdict;
  };
}

/** The one-line description note of an invented story, in the film's language. @param {Film} film */
export function storyNote(film) {
  return FICTION_LABELS[/** @type {keyof typeof FICTION_LABELS} */ (film.versionId)] ?? FICTION_LABELS["en-US"];
}

/** Thrown when a run stops at its budget; the run can be resumed with a higher one. */
export class BudgetReached extends Error {}

/** @param {string} text */
function safeJson(text) {
  try { return extractJson(text); } catch { return null; }
}
/** @param {number} n */
function round2(n) { return Math.round(n * 100) / 100; }
