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
import { editInstruction, editSheet, editStats, longHolds, uncoveredHolds, validateEditPlan } from "./edit-director.mjs";
import { buildTimeline } from "./timeline.mjs";
import { chapterMedia, createUseHistory } from "./film-media.mjs";
import { getFormat, lookFor, suggestFormat } from "./formats.mjs";
import { checkOriginality, fingerprintFilm } from "./originality.mjs";
import { FICTION_LABELS, lintNarration, STORY_RULES } from "./story-mode.mjs";
import { applyFixes, checkChapter, checkFilm, hookFindings, parseSceneLines, toClock, toSeconds } from "./scene-lines.mjs";
import { bindToCorpus, corpusBudget, corpusText, gatherCorpus, queryInstruction, writeInstruction } from "./research-desk.mjs";
import { checkSources, sourceGaps } from "./source-check.mjs";
import { getVersion } from "./versions.mjs";

/** Versions the run can produce today. Arabic and Bangla follow once English works end to end. */
export const RUN_VERSIONS = Object.freeze(["en-US"]);

/**
 * US dollars per million tokens. Cache writes use the 1-hour TTL (2x input).
 * The older Opus models are here because a declined request is re-run on one
 * of them server-side (fallbacks), and that call is billed at its own price.
 */
export const PRICES = Object.freeze({
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 4 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 10 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 10 },
  // Gemini's free tier costs nothing (its daily limits apply instead).
  "gemini-2.5-flash": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

/** US dollars per web search (server tool). */
export const WEB_SEARCH_USD = 0.01;

/**
 * @typedef {{ id: string, topic: string, durationSeconds: number, versionId: string, allowAi?: boolean, notes?: string, formatId?: string | null, saving?: boolean }} Film
 * @typedef {{ text: string, cache?: boolean, image?: string }} Block  image: an https image URL; text is ignored then
 * @typedef {{ stage: string, system: Block[], messages: { role: "user" | "assistant", content: Block[] }[], maxTokens: number, effort: string, webSearch?: { maxUses: number } }} ModelRequest
 * @typedef {{ input_tokens?: number, output_tokens?: number, cache_read_input_tokens?: number, cache_creation_input_tokens?: number, web_search_requests?: number, batch?: number }} Usage
 * @typedef {{ text: string, stopReason: string, usage: Usage, model?: string }} ModelReply
 * @typedef {{ vision?: boolean, webSearch?: boolean, contextTokens?: number, maxOutputTokens?: number }} Capabilities  what the brain can do; a missing field means yes (the Claude API can do all of it)
 * @typedef {{ input: number, output: number, cacheRead: number, cacheWrite: number }} Price  US dollars per million tokens
 * @typedef {{ name: string, call: (r: ModelRequest) => Promise<ModelReply>, capabilities?: Capabilities, price?: Price }} Model  price: the brain's own price (a local brain is free); without it PRICES is used
 * @typedef {{ get: (key: string) => Promise<string | null>, put: (key: string, text: string) => Promise<void> }} Store
 * @typedef {<T>(name: string, fn: () => Promise<T>) => Promise<T>} Step
 * @typedef {{ id: string, title: string, start: string, end: string, firstScene: string, lastScene: string, brief: string }} ChapterPlan
 */

/**
 * Validate a new film request. formatId picks one of the format presets
 * (formats.mjs: motivational life story, dramatized story, history epic ...);
 * "auto" lets the topic choose; none keeps the general documentary.
 * @param {{ topic?: unknown, minutes?: unknown, versionId?: unknown, allowAi?: unknown, notes?: unknown, formatId?: unknown, saving?: unknown }} input
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
  // Invented stories use AI scenes with one cast unless the owner turns them off (owner's decision, 4 Nov 2026).
  const allowAi = typeof input.allowAi === "boolean" ? input.allowAi : format?.mode === "story";
  // Half-price mode (Batch API): same model and quality, slower; the owner chooses per film.
  const saving = input.saving === true;
  return { ok: true, film: { id, topic, durationSeconds: Math.round(minutes * 60), versionId, allowAi, notes, formatId: format?.id ?? null, saving } };
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
    "2. Pictures only from sources the media step licenses item by item. Real archive pictures come first for evidence: R2 public-domain, CC0 and CC BY photographs, documents, paintings and video from Wikimedia Commons, NASA, the Library of Congress, the Smithsonian, the Met, the Art Institute of Chicago and Openverse, showing the actual people, places, objects and events; write those shots as R2 with an exact, searchable description (who or what, where, when: 'Apollo 11 launch, Kennedy Space Center, July 1969'), and the photo is animated in the edit. Never a share-alike, non-commercial or restricted file. Then footage from free stock: Pexels, Pixabay, Videvo (free licence, commercial use, never Editorial Use Only or Premium), Coverr (downloaded by hand) and Mixkit (Free Licence), plus graphics the editor builds (R1: OpenStreetMap maps credited \"© OpenStreetMap contributors\", kinetic type, counters, timelines, document-style cards rebuilt from public facts). Music and SFX only from Pixabay and Mixkit. Never social media, agency, archive or screenshot material.",
    film.allowAi && story
      ? "3. AI SCENES (R9) carry the story's people: one consistent cast from the S4 bible. Every shot of a character is an R9 shot that names its token (CHR-01) and describes, in one concrete sentence, the action, the place, the light and the camera. Places and objects may still come from stock (R3). Never a real person's likeness, a child as the focus, a real brand, gore or nudity. The film is disclosed in YouTube Studio's altered-or-synthetic setting; nothing is written on the video."
      : film.allowAi ? "3. AI imagery only where the engine allows it, never a real person's likeness, disclosed in YouTube Studio's altered-or-synthetic setting; nothing written on the video." : "3. No AI imagery or AI audio (AI cap = 0 s).",
    "4. Never present a stock person's face as a real person in the story or their family; never imply it in narration. Use hands, backs, silhouettes, objects, places and typography. Minors are never named or shown.",
    "5. Cinema finish: one master grade, speed ramps, push-ins, match cuts, layered sound, deliberate silence; less-downloaded clips; no clip repeated within 10 minutes; at most 3 variants per clip. Nothing is written on the video to mark it as fiction, AI or illustration.",
    "5b. What the renderer draws (write these exact words so the edit happens): TRANS: 'hard cut' or 'match cut' (most scenes, on the beat), 'whip pan' (energy between scenes), 'slide' (a calm move between related scenes), 'zoom-through transition' (into a detail or a place), 'white flash' (a reveal or a jump in time), 'glitch' (a twist, a lie exposed, a system breaking), 'light leak' (a warm, hopeful moment), 'dissolve' (a dip through black as time passes); use a named transition at most every few scenes. FX: FX-KINETIC (the key line rises in, line by line), FX-COUNTER (a number counts up), FX-SPLIT (two sources side by side), FX-PAPER (a document card; add 'highlight \"the key words\"' and a highlighter sweeps them), FX-HIGHLIGHT (the card's key line is underlined as it lands), FX-CHART with its title and data, like 'R1 FX-CHART \"Revenue, $ billions\" 2019: 1.2; 2020: 3.4; 2021: 8.9' (bars grow one after another; numbers only from the ledger), FX-MAP with the place and its coordinates in brackets, like 'R1 FX-MAP Bengaluru (12.97, 77.59)' (an animated map: the country lit, a pin, the name); a journey is 'R1 FX-MAP route Mumbai (19.07, 72.88) to London (51.51, -0.13)' (the line draws itself from the first place to the second). R2 archive photographs are animated automatically (push in, pull out or pan; portraits float in parallax), so describe the real subject exactly: who or what, where, when.",
    "6. Retention: a 30-second hook (four beats, fast cuts), a reset about every 3 minutes, a pattern interrupt about every 25 seconds, a midpoint turn, an 80% cliffhanger, every open loop paid.",
    "7. Written to be felt, not only understood: every chapter has one scene built to move the viewer (a loss, a sacrifice, a choice, a reunion or a reveal). Before it the music drops or goes silent and the narration slows into short sentences; the picture holds; the music swells after. Specific sensory detail beats adjectives. People want something concrete, fear something specific and pay a price for what they get. The lesson lands through what happens and is never stated. End on an image and one line the viewer repeats.",
    ...(lookFor(film.formatId) === "cinematic" ? ["8. Performance: every scene line adds DELIVERY: one to three ElevenLabs v3 tags in square brackets for the narrator, matching the scene's emotion ([softly], [serious], [warm], [whispers], [sighs], [hopeful], [excited], [pause]). They direct the voice and are never read aloud; they never count toward W."] : []),
    ...(story ? ["", "STORY RULES:", ...STORY_RULES.map((r, i) => `S${i + 1}. ${r}`)] : []),
    "",
    `VERSION LOCK: audience ${v.audience}; language ${v.register}; currency ${v.currency} (an amount that began in another currency is shown in dollars first, with the original small beneath and the conversion basis in the ledger). Narration pace ${v.narrationWpm.target} words per minute. Codes, IDs, search queries and file or grade terms stay in English. Never mention any other version.`,
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");
}

/** A format example for one compact scene line (written for this module, not from any film). */
export const SCENE_LINE_EXAMPLE =
  "**SC0001** | 0:00:00-0:00:08 | C1 | HOOK B1 | E | C01, C02 | NARR: Final, speakable narration, numbers spelled out for the voice. | W 20/20 | ANCHOR: \"key word\" -> what appears on screen 0:00:02.5 | SHOTS: (1) 0:00:00-0:00:04 R3 OBJ-01 description, no face; (2) 0:00:04-0:00:08 R1 kinetic card | EV: R1 1 / R3 1 | RUNG: R3/L2 -> R1/L4 | FX: FX-KINETIC, FX-SOURCECHIP | SRC: Pexels https://www.pexels.com/video/... · Q1 \"exact query\" · Q2 \"exact query\" | MOTION: 1.08x push | TRANS: hard cut on the beat | OST: on-screen text; source chip | SFX: SND-FX-01 | MUS: M01 | LOOK: LOOK-M";

/** How much of the film the viewer panel reads: the opening, where most viewers decide. */
export const VIEWER_SECONDS = 120;

/** The viewer panel's own system prompt: no production manual, no plan, no rules; just the audience. */
export const VIEWER_SYSTEM = "You are a panel of five real YouTube viewers in the US and the UK, scrolling on phones and TVs in the evening: a 28-year-old who watches business and success stories, a 41-year-old mother who watches true stories, a 55-year-old history fan, a sceptic who checks claims in the comments, and a 19-year-old who leaves after 10 seconds unless something grabs him. You have never seen how this film was made. You only react to what you would hear and see. Be blunt and specific; praise only what earns it.";

/**
 * What the viewer panel is shown: the film's opening as the audience meets it
 * (what is said, what is on screen), nothing of the plan behind it.
 * @param {Film} film @param {import("./scene-lines.mjs").SceneLine[]} scenes
 */
export function viewerInstruction(film, scenes) {
  const lines = scenes.map((s) => `${s.sc} ${toClock(s.start)} | SAID: ${s.wordless ? "(nothing; picture and sound only)" : s.narration} | SEEN: ${(s.fields.SHOTS ?? "").replace(/\s+/g, " ").slice(0, 260)}${s.fields.OST ? ` | ON SCREEN: ${s.fields.OST.slice(0, 120)}` : ""}`);
  return [
    `This is the opening of a ${Math.round(film.durationSeconds / 60)}-minute documentary you just clicked on ("${film.topic}"). Read it as you would watch it.`,
    lines.join("\n"),
    "Answer as the panel. Where would each of you leave, and why? What is confusing, slow, vague, unbelievable or repeated? What made you stay? Then give the writer exact fixes for the worst moments only (at most 6): change the said words (keep about the same number of words so the timing holds, keep every fact as it is, never invent one), never the scene ids or times.",
    "Output ONE fenced ```json block: {\"stayScore\": 0-10 (how many of you would still be watching at 2:00, times two), \"why\": \"one sentence\", \"leaves\": [{\"viewer\": \"the 19-year-old\", \"scene\": \"SC0003\", \"reason\": \"...\"}], \"kept\": [\"what worked\"], \"fixes\": [{\"scene\": \"SC0002\", \"find\": \"exact words copied from SAID\", \"replace\": \"new words\", \"why\": \"...\"}]}",
  ].join("\n\n");
}

/** How S2 treats the source desk's marks (research facts carry check.status when code opened their pages). */
export const CHECKED_FACTS = " Facts may carry check.status, set by code that opened their source pages: verified (a page shows the number), opened (a page opened; nothing numeric to look for), unconfirmed (the pages opened but none shows the number: never write it as FACT; give it as REPORTED or ESTIMATE with the source named, or leave it out) and unreachable (no page could be read: attribute it to its source). A number whose check.sites is 1 rests on one site: name that site when it is said.";

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
 * A brain with its own price (a local brain is free) passes itself; a model
 * with no price of its own and none in PRICES is estimated at the highest
 * listed price, never $0. A brain that cannot search the web pays for no
 * searches (the code research desk reads free sources), and one that cannot
 * see has no footage desk.
 * @param {number} durationSeconds
 * @param {string} [model]
 * @param {{ price?: Price, capabilities?: Capabilities }} [brain]
 */
export function estimateRun(durationSeconds, model = "claude-opus-5-5", brain = {}) {
  const price = brain.price ?? PRICES[/** @type {keyof typeof PRICES} */ (model)] ?? highestPrice();
  const sees = brain.capabilities?.vision !== false;
  const searchesWeb = brain.capabilities?.webSearch !== false;
  const minutes = durationSeconds / 60;
  const chapters = Math.max(1, Math.round(minutes / 7.5));
  const outPerChapter = Math.max(4000, (minutes / chapters) * 2000) * 1.5;
  const fixedOut = 6 * 12000 * 1.5 + 4000 * 1.5; // S0-S4, QA, S6, S7, and the viewer panel
  // Edit Director: one call per chapter, about 3k tokens out (with thinking) from a short scene sheet.
  const outputTokens = Math.round(chapters * outPerChapter * 1.2 + fixedOut + chapters * 3000 * 1.5); // 1.2: repairs
  const cachedIn = 30000 * (chapters * 2 + 8); // manual + brief + ledger + bibles, read from cache (S5 and the edit per chapter)
  const searches = searchesWeb ? 30 : 0; // research stage: web_search max_uses
  const freshIn = Math.round(chapters * 12000 + minutes * 600 + 8 * 15000 + minutes * 3000 + searches * 10000); // stage inputs, edit sheets, QA reads the film, search results
  // Footage desk: about 6.3 stock shots a minute, judged six at a time from 320 px thumbnails.
  const judgeCalls = sees ? Math.ceil((minutes * 6.3) / 6) : 0;
  const judgeUsd = (judgeCalls * (30000 * price.cacheRead + 3500 * price.input + 400 * price.output)) / 1e6;
  const tokenUsd = (outputTokens * price.output + cachedIn * price.cacheRead + freshIn * price.input + 60000 * price.cacheWrite) / 1e6;
  const usd = tokenUsd + searches * WEB_SEARCH_USD + judgeUsd;
  // Half-price mode: the writing stages go through the Batch API (50% of every token); the footage desk stays fast.
  const saving = tokenUsd * 0.5 + searches * WEB_SEARCH_USD + judgeUsd;
  return { model, chapters, outputTokens, inputTokens: cachedIn + freshIn, judgeCalls, usdLow: round2(usd * 0.7), usdHigh: round2(usd * 1.5), savingUsdLow: round2(saving * 0.7), savingUsdHigh: round2(saving * 1.5) };
}

/**
 * What a call cost. A model with no listed price is charged at the highest
 * listed price, so the budget is never under-counted.
 * A brain that states its own price (worker/local-brain.mjs) is charged at it.
 * @param {Usage} u
 * @param {string} model
 * @param {Price} [ownPrice]
 */
export function costOf(u, model, ownPrice) {
  const p = ownPrice ?? PRICES[/** @type {keyof typeof PRICES} */ (model)] ?? highestPrice();
  // The Batch API (half-price mode) bills every token at 50%.
  const tokens = ((u.input_tokens ?? 0) * p.input + (u.output_tokens ?? 0) * p.output + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
  return tokens * (u.batch ? 0.5 : 1) + (u.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

/** The highest listed price, for a model with no price of its own. @returns {Price} */
function highestPrice() {
  return Object.values(PRICES).reduce((a, b) => (b.output > a.output ? b : a));
}

/** Effort per stage: the writing and checking stages think hardest. */
export const STAGE_EFFORT = Object.freeze({ s01: "high", research: "high", s2: "medium", s3: "high", s4: "medium", s5: "high", repair: "medium", qa: "high", viewer: "medium", edit: "medium", s6: "medium", s7: "medium" });

/**
 * Run (or resume) a film. Returns the final run state.
 * budgetUsd stops the run before any stage that starts once the money spent
 * has reached it, so a small budget is never overrun by more than one stage.
 * media (optional) adds the media step after QA: free stock footage for
 * every S5 shot, one media-C1.json ... per chapter. Without providers (no
 * PEXELS_API_KEY or PIXABAY_API_KEY) the step is left for a later resume.
 * media.review (default true) shows the model small thumbnails of each
 * shot's top candidates and keeps only a clip it says fits.
 * sources (optional, { fetch }) adds the source desk after research: every
 * cited page is opened in code, facts whose pages are all gone are dropped,
 * and each fact is marked verified, opened, unconfirmed or unreachable.
 * viewers (default true) adds the viewer panel after QA: a cold read of the
 * first two minutes in its own context, whose fixes are kept only when every
 * code check still passes; a low stay score is a gap.
 * edit (default true) adds the Edit Director after QA: one call per chapter
 * that writes edit-C1.json ... (transitions, punch-ins, shakes, sound hits),
 * checked in code; edit: false leaves the edit to the script alone.
 * channel (optional) holds the fingerprints of the channel's earlier films;
 * the finished film is compared with them (originality.json) and added.
 * research (needed for a brain that cannot search the web) is the code
 * research desk: the brain lists searches, code opens free sources
 * (research-desk.mjs) and the brain writes from that corpus only.
 * @param {{ film: Film, research?: { providers: import("./research-desk.mjs").ResearchProvider[], fetch: import("./research-desk.mjs").FetchLike }, manual: string, model: Model, store: Store, step?: Step, log?: (line: string) => void, maxRepairs?: number, budgetUsd?: number, edit?: boolean, viewers?: boolean, lessons?: { load(): Promise<string> }, market?: { find(topic: string): Promise<{ title: string, channelTitle: string, views: number, outlier: number, durationSeconds: number }[]> }, sources?: { fetch: (url: string, init?: RequestInit) => Promise<Response> }, channel?: { load(): Promise<import("./originality.mjs").Fingerprint[]>, save(list: import("./originality.mjs").Fingerprint[]): Promise<void> }, media?: { providers: import("./film-media.mjs").MediaProvider[], review?: boolean, maxWaitMs?: number, timeoutMs?: number, sleep?: (ms: number) => Promise<void> } }} o
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
  // A failed or budget-stopped run that is started again resumes: finished stages are kept, the rest runs.
  // A revision sent back by Bossism is not a resume; both keep every finished stage.
  if (state.status !== "running") { if (state.status !== "revising") state.resumes = (state.resumes ?? 0) + 1; state.status = "running"; }
  delete state.error;
  delete state.lastError;
  const save = () => store.put("run.json", JSON.stringify(state, null, 1));

  /**
   * One model call, with continuation when the reply hits max_tokens.
   * @param {string} stage @param {Block[]} content @param {number} maxTokens @param {{ webSearch?: { maxUses: number }, effort?: string, system?: Block[] }} [extra]
   */
  async function ask(stage, content, maxTokens, extra = {}) {
    // Work sent back by Bossism carries its notes to the stage that redoes it (research also to its search plan).
    const noteKey = Object.keys(state.revisionNotes ?? {}).find((k) => stage === k || stage.startsWith(`${k}-`));
    const notes = noteKey ? state.revisionNotes[noteKey] : "";
    /** @type {ModelRequest["messages"]} */
    const messages = [{ role: "user", content: notes ? [...content, { text: `REVISION NOTES: this stage's earlier output was sent back by the review because it failed these checks. Fix every point; keep everything else that was right.\n\n${notes}` }] : content }];
    let text = "";
    for (let part = 0; part < 4; part += 1) {
      const reply = await model.call({ stage, system: extra.system ?? system, messages, maxTokens, effort: extra.effort ?? STAGE_EFFORT[/** @type {keyof typeof STAGE_EFFORT} */ (stage.split(":")[0])] ?? "medium", webSearch: extra.webSearch });
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

  /**
   * What the stage now running has spent. It is applied to the run state
   * once, from the step's own result, so a Workflow step replayed from its
   * stored result keeps its cost and gaps instead of losing them.
   * @type {{ costUsd: number, usage: Record<string, any> } | null}
   */
  let pending = null;

  /** @param {string} stage @param {ModelReply} reply */
  function record(stage, reply) {
    const u = reply.usage ?? {};
    const book = pending ?? { costUsd: 0, usage: state.usage };
    const s = (book.usage[stage] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    s.calls += 1;
    for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens", "web_search_requests"]) if (/** @type {any} */ (u)[k] || s[k] !== undefined) s[k] = (s[k] ?? 0) + (/** @type {any} */ (u)[k] ?? 0);
    if (reply.model && reply.model !== model.name) s.servedBy = reply.model;
    const cost = costOf(u, reply.model ?? model.name, model.price);
    if (pending) pending.costUsd += cost;
    else state.costUsd = round2(state.costUsd + cost);
  }

  /** Add a stage's spending to the run state. @param {{ costUsd: number, usage: Record<string, any> } | null | undefined} spent */
  function mergeSpent(spent) {
    if (!spent) return;
    for (const [key, u] of Object.entries(spent.usage)) {
      const s = (state.usage[key] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
      for (const [k, v] of Object.entries(u)) {
        if (typeof v === "number") s[k] = (s[k] ?? 0) + v;
        else s[k] = v;
      }
    }
    state.costUsd = round2(state.costUsd + spent.costUsd);
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
    const out = await step(id, async () => {
      const before = state.gaps.length;
      pending = { costUsd: 0, usage: {} };
      try {
        const result = await fn();
        const gaps = state.gaps.splice(before);
        return { result, gaps, spent: pending };
      } catch (error) {
        // A failed attempt's gaps go (the retry reports its own); its spending stays, because it was spent.
        state.gaps.splice(before);
        mergeSpent(pending);
        // Shown in the studio while the step is retried, so a wrong key or an outage is visible at once.
        state.lastError = { stage: id, message: error instanceof Error ? error.message.slice(0, 500) : String(error), at: new Date().toISOString() };
        await save().catch(() => {});
        throw error;
      } finally {
        pending = null;
      }
    });
    mergeSpent(out.spent);
    state.gaps.push(...out.gaps);
    const result = out.result;
    delete state.lastError;
    // The stage's own gaps are kept with it, so a revision that redoes the stage withdraws exactly them.
    state.stages[id] = { status: "done", result, gaps: out.gaps };
    await save();
    log(`${id}: done`);
    return result;
  }

  /** @param {string} key */
  const read = async (key) => (await store.get(key)) ?? "";
  const ctx = (/** @type {string} */ label, /** @type {string} */ body) => `<${label}>\n${body}\n</${label}>`;

  await save();
  try {
    // What the channel's own published films taught: where its viewers left and where they stayed.
    const lessons = o.lessons ? await o.lessons.load().catch(() => "") : "";
    const learned = lessons ? "\n\n" + ctx("CHANNEL_LESSONS", lessons) + "\nCHANNEL_LESSONS is our own audience's retention on recent films (LEFT: where viewers left fast; HELD: where they stayed). Avoid the patterns that lost them and use the ones that held them; never copy a line." : "";

    // The market desk: what already works on this topic on YouTube (titles that beat their own channels).
    if (o.market) {
      const market = o.market;
      await stage("market", async () => {
        /** @type {any[]} */
        let picks = [];
        try { picks = await market.find(film.topic); } catch (error) { state.market = `skipped: ${error instanceof Error ? error.message.slice(0, 200) : error}`; }
        await store.put("market.json", JSON.stringify({ topic: film.topic, picks: picks.slice(0, 12) }, null, 1));
        return { picks: Math.min(12, picks.length) };
      });
    }
    let marketTitles = /** @type {string[]} */ ([]);
    const proven = () => {
      const data = safeParse(marketText);
      const picks = Array.isArray(data?.picks) ? data.picks : [];
      marketTitles = picks.map((/** @type {any} */ p) => String(p.title ?? "")).filter(Boolean);
      return picks.length ? ctx("PROVEN_DEMAND", picks.map((/** @type {any} */ p) => `"${p.title}" (${p.channelTitle}): ${Number(p.views).toLocaleString("en-US")} views, ${p.outlier}x its channel's average, ${Math.round(Number(p.durationSeconds) / 60)} min`).join("\n")) : "";
    };
    const marketText = await read("market.json");

    await stage("s01", async () => {
      const demand = proven();
      const text = await ask("s01", [...(demand ? [{ text: demand }] : []), { text: "Write S0 (section 4: intake, media math, risk scan) and S1 (section 5: beat-the-best, angle, 10 titles scored, 3 thumbnail briefs, title contract) for this film. Mark every title number PROVISIONAL until S2 confirms it."  + (demand ? " PROVEN_DEMAND lists real videos on this topic that beat their own channels: study why they won (the promise, the stake, the specific detail) and beat them with a better angle; never reuse their wording or structure." : "") }], 24000);
      await store.put("s01.md", text);
      return { chars: text.length };
    });

    /**
     * Research for a brain that cannot search: the brain chooses what to look
     * up, code opens the pages, the brain writes from them, code keeps only
     * facts that cite the opened pages.
     * @param {string} s01
     */
    const deskResearch = async (s01) => {
      if (!o.research?.providers.length) throw new Error(`The brain ${model.name} cannot search the web, and this run has no research desk. Give the run research providers (research-desk.mjs).`);
      const story = isStoryFilm(film);
      // The desk's two calls need the brief, not the whole production manual, so a small window has room for the pages.
      const deskSystem = [{ text: brief, cache: true }];
      const asked = safeJson(await ask("research-plan", [{ text: ctx("S0_S1", s01) }, { text: queryInstruction(story) }], 4000, { system: deskSystem }));
      const listed = Array.isArray(asked?.queries) ? asked.queries.map(String).filter(Boolean) : [];
      const queries = listed.length ? listed : [film.topic];
      const { docs, trace } = await gatherCorpus({ queries, providers: o.research.providers, fetch: o.research.fetch, limits: { corpusChars: corpusBudget(model.capabilities?.contextTokens) } });
      await store.put("research-corpus.json", JSON.stringify({ queries, trace, docs }, null, 1));
      if (!docs.length) throw new Error(`The research desk opened no readable pages (searched: ${queries.join("; ").slice(0, 300)}).`);
      const text = await ask("research", [{ text: ctx("S0_S1", s01) }, { text: ctx("CORPUS", corpusText(docs)) }, { text: writeInstruction(story) }], 16000, { system: deskSystem });
      const bound = bindToCorpus(extractJson(text), docs);
      if (bound.outside) state.gaps.push(`research: ${bound.outside} fact${bound.outside > 1 ? "s" : ""} cited no page the research desk opened and ${bound.outside > 1 ? "were" : "was"} dropped.`);
      const sites = new Set(docs.map((d) => d.site)).size;
      bound.research.desk = { queries, documents: docs.length, sites, providers: [...new Set(docs.map((d) => d.provider))] };
      return bound.research;
    };

    await stage("research", async () => {
      const s01 = await read("s01.md");
      const data = canSearch(model) ? extractJson(await ask("research", [
        { text: ctx("S0_S1", s01) },
        { text: (isStoryFilm(film)
          ? "This film is an invented story. Research on the web the real-world details it needs to feel exact: prices, wages and costs of the time and place, laws and procedures, jobs and how they are done, places, distances, customs and era details. Record conflicts between sources instead of resolving them; list famous real people the invented characters must not be confused with."
          : "Research this film's subject on the web. Find primary and reliable secondary sources; record conflicts between sources instead of resolving them; note people or things that could be confused with the subject.") + " Then output ONE fenced ```json block, and nothing after it, shaped as: {\"subject\": string, \"facts\": [{\"id\": \"F01\", \"claim\": string, \"value\": string, \"sources\": [url, ...], \"confidence\": \"high\"|\"medium\"|\"low\", \"conflict\": string|null}], \"unknowns\": [string], \"doNotConfuse\": [string]}. Every fact needs at least one source URL you actually opened or found in search results. Never invent a URL." },
      ], 32000, { webSearch: { maxUses: 30 } })) : await deskResearch(s01);
      const facts = Array.isArray(data?.facts) ? data.facts : [];
      const sourced = facts.filter((/** @type {any} */ f) => Array.isArray(f.sources) && f.sources.some((/** @type {unknown} */ u) => typeof u === "string" && /^https?:\/\//.test(u)));
      const needed = isStoryFilm(film) ? 5 : 8;
      if (sourced.length < needed) throw new Error(`Research found only ${sourced.length} sourced facts (at least ${needed} needed).`);
      if (sourced.length < facts.length) state.gaps.push(`research: ${facts.length - sourced.length} facts without a source URL were dropped.`);
      data.facts = sourced;
      await store.put("research.json", JSON.stringify(data, null, 1));
      return { facts: sourced.length };
    });

    // The source desk: code opens every page the research cites (a model can cite a page that does not exist).
    if (o.sources) {
      const sources = o.sources;
      await stage("sources", async () => {
        const r = await checkSources(JSON.parse(await read("research.json")), { fetch: sources.fetch });
        await store.put("research.json", JSON.stringify(r.research, null, 1));
        await store.put("sources-check.json", JSON.stringify({ summary: r.summary, dropped: r.dropped }, null, 1));
        state.gaps.push(...sourceGaps(r));
        return r.summary.facts;
      });
    }

    await stage("s2", async () => {
      const text = await ask("s2", [
        { text: ctx("S0_S1", await read("s01.md")) + "\n" + ctx("RESEARCH", await read("research.json")) },
        { text: isStoryFilm(film)
          ? "Write S2 for an invented story: (a) the realism ledger, one row per real-world detail the story uses, with ID (C01...), detail, exact value, sources and chapter use, from the research file only; (b) the story bible: each invented character's name (no famous real person's name), age, want, wound, fear and the price they pay; (c) if money is involved, the money path: every jump in wealth with its cause and the exact figures, adding up." + CHECKED_FACTS
          : "Write S2, the claim ledger (section 6), from the research file only: one row per claim with ID (C01...), claim, status (FACT, CONTESTED, QUOTE -> paraphrase, ESTIMATE, UNKNOWN), value, sources, confidence, conflicts, wording rule for narration, on-screen chip and chapter use. Currency conversions use that year's rate and today's money; values you cannot compute from the research are PENDING with the exact method." + CHECKED_FACTS },
      ], 32000);
      await store.put("s2.md", text);
      return { claims: (text.match(/\bC\d{2,3}\b/g) ?? []).length };
    });

    const plan = await stage("s3", async () => {
      const content = [
        { text: ctx("S0_S1", await read("s01.md")) + "\n" + ctx("S2", await read("s2.md")) },
        { text: `Write S3, the story architecture (section 7): arc, chapter plan, scene allocation and clock, retention map, interrupt plan, progress motif, title-contract binding, open-loop ledger, emotion curve, music arc, Shorts candidates. Then end with ONE fenced \`\`\`json block: an array of chapters, each {"id": "C1", "title", "start": "0:00:00", "end": "h:mm:ss", "firstScene": "SC0001", "lastScene": "SC00nn", "brief": "a self-contained brief for that chapter's writer: scene count, word budget, beats with exact times and claim IDs, loops opened and paid, what it must hand to the next chapter"}. Chapters tile 0:00:00 to ${toClock(film.durationSeconds)} with no gap; scene IDs run from SC0001 with no gap. Chapters of 5 to 9 minutes; a film under 10 minutes has 1 to 3 chapters.` + learned },
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
        { text: "Write S4, the production bibles (section 8): narrator, characters and depiction policy, locations, objects, the master look and chapter trims, motion-graphics style, sound bible with tokens and search phrases, music plan per cue, pronunciation lexicon (a table | Term | Narrator says | Note |, listing only names and words an American narrator would get wrong, each respelled in full, like 'ruh-MAYSH BAH-boo'; the voice reads every listed term as respelled), continuity rules, and the bible summary block (8.8)." + (film.allowAi && isStoryFilm(film) ? " For every invented character add one line, on its own: `CHR-01 LOOK: <age, build, skin tone, face, hair, clothes, era and place>`. Every AI prompt repeats it word for word, so the character looks the same in every scene; mark each invented character's type as Invented." : "") },
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
          learned,
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
      // Craft that code can measure: the hook, and how much of each chapter is planned text cards rather than pictures.
      const hook = hookFindings(parseSceneLines(chapters[0]?.markdown ?? ""));
      const mix = chapters.map((c) => {
        const t = buildTimeline({ chapters: [{ id: c.id, markdown: c.markdown }], autoSound: false });
        const cards = t.video.filter((v) => v.type === "card" && /^R1\b/.test(v.brief)).reduce((n, v) => n + v.end - v.start, 0);
        return { chapter: c.id, cardShare: t.durationSeconds ? Math.round((cards / t.durationSeconds) * 100) : 0 };
      });
      const craft = [...hook, ...mix.filter((m) => m.cardShare > 40).map((m) => ({ code: "card-heavy", detail: `${m.chapter}: ${m.cardShare}% of the time is text cards; swap some for real pictures (R2 archive, R3 footage) so the eye has something to see.` }))];
      const s2 = await read("s2.md");
      /**
       * One QA request over some chapters, with the code findings that concern them.
       * @param {string} name @param {typeof chapters} part
       */
      const qaAsk = (name, part) => {
        const whole = part.length === chapters.length;
        const scenes = new Set(part.flatMap((c) => parseSceneLines(c.markdown).map((x) => x.sc)));
        const errors = whole ? machine.errors : machine.errors.filter((e) => !e.scene || scenes.has(e.scene));
        const partCraft = whole ? craft : craft.filter((x) => (x.code === "card-heavy" ? part.some((c) => x.detail.startsWith(`${c.id}:`)) : part[0]?.id === chapters[0]?.id));
        return ask(name, [
          { text: ctx("S2", s2) + "\n" + part.map((c) => ctx(`S5_${c.id}`, c.markdown)).join("\n") },
          { text: "You are the QA desk. Code already checked clock, IDs, word counts, fields, banned phrases, language and sources; its findings:\n" + JSON.stringify(errors.slice(0, 60)) + (partCraft.length ? "\nCode also measured these craft problems; fix each in pass C:\n" + JSON.stringify(partCraft) : "") + "\n\nMake three passes for what code cannot check: A FACTS (every statement against the S2 ledger: invented facts, silently resolved conflicts, quotes presented as verbatim, unattributed superlatives), B LANGUAGE AND RIGHTS (version lock, speakable narration, no stock face as a real person, licences), C CRAFT (hook, resets, interrupts, midpoint, cliffhanger, loops paid, hand-offs). Output ONE fenced ```json block: {\"mustFix\": [{\"lens\": \"facts|language|craft\", \"chapter\": \"C1\", \"scene\": \"SC0001\", \"issue\": string, \"find\": exact text from that chapter, \"replace\": exact replacement}], \"passed\": [string], \"notChecked\": [string]}. Each find must occur exactly once in its chapter. A word-count change must keep the scene within ±10% and update its W field." },
        ], 32000);
      };
      // A brain whose window cannot hold the whole film reads it chapter by chapter, and the run says so.
      const window = model.capabilities?.contextTokens;
      const reserve = Math.min(32000, model.capabilities?.maxOutputTokens ?? 8192);
      const tokensFor = (/** @type {typeof chapters} */ part) => Math.ceil((manual.length + brief.length + s2.length + part.reduce((n, c) => n + c.markdown.length, 0) + 6000) / 3.2) + reserve;
      const perChapter = Boolean(window) && chapters.length > 1 && tokensFor(chapters) > /** @type {number} */ (window);
      /** @type {any} */
      let qa;
      if (!perChapter) qa = safeJson(await qaAsk("qa", chapters)) ?? { mustFix: [], passed: [], notChecked: ["The QA reply was not valid JSON."] };
      else {
        qa = { mode: "per-chapter", mustFix: [], passed: [], notChecked: [`The model did not compare chapters with each other: the brain's window (${window} tokens) holds one chapter at a time, so QA read each chapter on its own. Code still checked the clock and the open loops across the whole film.`] };
        for (const c of chapters) {
          const part = safeJson(await qaAsk(`qa:${c.id}`, [c]));
          if (!part) { qa.notChecked.push(`${c.id}: the QA reply was not valid JSON.`); continue; }
          qa.mustFix.push(...(Array.isArray(part.mustFix) ? part.mustFix : []).map((/** @type {any} */ f) => ({ ...f, chapter: c.id })));
          qa.passed.push(...(Array.isArray(part.passed) ? part.passed : []).map((/** @type {any} */ x) => `${c.id}: ${x}`));
          qa.notChecked.push(...(Array.isArray(part.notChecked) ? part.notChecked : []).map((/** @type {any} */ x) => `${c.id}: ${x}`));
        }
        state.qaMode = "per-chapter";
      }
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
      // The hook is checked again after the fixes; what is still wrong is a gap the owner sees.
      const hookLeft = hookFindings(parseSceneLines((await read(`s5-${plan.chapters[0]?.id}.md`)) || chapters[0]?.markdown || ""));
      state.gaps.push(...hookLeft.map((h) => `hook (${h.code}): ${h.detail}`));
      qa.codeCraft = { hook: hook.map((h) => h.code), hookLeft: hookLeft.map((h) => h.code), cardShare: mix };
      await store.put("qa.json", JSON.stringify(qa, null, 1));
      await store.put("fix-log.json", JSON.stringify(fixLog, null, 1));
      return { mustFix: (qa.mustFix ?? []).length, applied: fixLog.filter((f) => f.status === "applied").length };
    });

    // The viewer panel: a cold read of the first two minutes by people who never saw the rules or the
    // plan, as the audience meets it; their fixes are applied only when every code check still passes.
    if (o.viewers !== false) {
      await stage("viewer", async () => {
        const first = plan.chapters[0];
        const key = `s5-${first.id}.md`;
        const markdown = await read(key);
        const opening = parseSceneLines(markdown).filter((s) => s.start < VIEWER_SECONDS);
        const reply = await ask("viewer", [{ text: viewerInstruction(film, opening) }], 12000, { system: [{ text: VIEWER_SYSTEM }] });
        const panel = safeJson(reply);
        if (!panel || typeof panel !== "object") {
          state.gaps.push("viewer panel: the reply was not valid JSON; the opening was not test-read.");
          return { ok: false };
        }
        const spec = chapterSpec(first, film.versionId);
        const fixes = (Array.isArray(panel.fixes) ? panel.fixes : []).filter((/** @type {any} */ f) => f && typeof f.find === "string" && typeof f.replace === "string");
        let applied = 0;
        if (fixes.length) {
          const before = checkChapter(markdown, spec);
          const { text, log: done } = applyFixes(markdown, fixes);
          const after = checkChapter(text, spec);
          const hookBefore = hookFindings(parseSceneLines(markdown)).length;
          const hookAfter = hookFindings(parseSceneLines(text)).length;
          // A fix that breaks the clock, the word budget or the hook is not applied.
          if (after.errors.length <= before.errors.length && hookAfter <= hookBefore) {
            await store.put(`s5-${first.id}.viewer-draft.md`, markdown);
            await store.put(key, text);
            applied = done.filter((d) => d.status === "applied").length;
          } else panel.reverted = "the fixes broke a code check and were not applied";
        }
        const stay = Number(panel.stayScore);
        if (Number.isFinite(stay) && stay < 6) state.gaps.push(`viewer panel: the opening scored ${stay}/10 for staying to watch (${String(panel.why ?? "").slice(0, 160)}).`);
        await store.put("viewer.json", JSON.stringify({ ...panel, applied }, null, 1));
        return { stayScore: Number.isFinite(stay) ? stay : null, fixes: fixes.length, applied };
      });
    }

    // The Edit Director: the edit on top of the script, per chapter, checked in code.
    if (o.edit !== false) {
      for (const c of plan.chapters) {
        await stage(`edit:${c.id}`, async () => {
          const markdown = await read(`s5-${c.id}.md`);
          const format = film.formatId ? getFormat(film.formatId) : null;
          const style = format ? `${format.name} (${lookFor(film.formatId)} look)` : "a general documentary";
          // Code measures where one picture holds too long; the director is told, and what it leaves uncovered is a gap.
          const laid = buildTimeline({ chapters: [{ id: c.id, markdown }], autoSound: false });
          const holds = longHolds(laid.video, new Set(laid.narration.map((n) => n.scene)));
          const reply = await ask(`edit:${c.id}`, [{ text: editInstruction(c.id, editSheet(markdown), style, holds) + learned }], 16000);
          const parsed = safeJson(reply);
          const edit = validateEditPlan(parsed, markdown, c.id);
          if (parsed === null) state.gaps.push(`${c.id} edit: the Edit Director's reply was not valid JSON; this chapter's edit follows the script alone.`);
          const left = uncoveredHolds(holds, edit);
          if (left.length) state.gaps.push(`${c.id} edit: ${left.length} shot${left.length > 1 ? "s hold" : " holds"} one picture too long with no move (${left.slice(0, 8).map((h) => `${h.id} ${h.seconds} s`).join(", ")}${left.length > 8 ? " ..." : ""}).`);
          await store.put(`edit-${c.id}.json`, JSON.stringify({ ...edit, holds: { found: holds.length, uncovered: left.map((h) => h.id) } }, null, 1));
          return { ...editStats(edit), longHolds: holds.length, uncovered: left.length };
        });
      }
    }

    // Media: free stock footage for every shot, in film order, so no clip
    // repeats within 10 minutes across chapters (earlier picks are reloaded).
    if (o.media?.providers.length) {
      const providers = o.media.providers;
      const history = createUseHistory();
      for (const c of plan.chapters) {
        const key = `media-${c.id}.json`;
        await stage(`media:${c.id}`, async () => {
          // A brain that cannot see pictures would judge blind: skip the desk and say so.
          const judge = o.media?.review === false || !canSee(model) ? undefined : createFootageJudge(ask);
          const media = await chapterMedia({ chapter: c.id, markdown: await read(`s5-${c.id}.md`), providers, history, judge, maxWaitMs: o.media?.maxWaitMs, timeoutMs: o.media?.timeoutMs, sleep: o.media?.sleep });
          await store.put(key, JSON.stringify(media, null, 1));
          if (media.stats.missing) state.gaps.push(`${c.id} media: ${media.stats.missing} of ${media.stats.shots} stock shots have no fitting free clip yet (see ${key}).`);
          const blind = !judge && o.media?.review !== false;
          const unreviewed = media.shots.filter((s) => s.review === "unreviewed" || (blind && s.status === "found")).length;
          if (unreviewed) state.gaps.push(`${c.id} media: ${unreviewed} picks could not be checked by eye and use the first search result${canSee(model) ? "" : " (the brain cannot see pictures)"}.`);
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
      // Credits for the archive pictures the film uses, built from their licence records, never from memory.
      const credits = pictureCredits((await Promise.all(plan.chapters.map((c) => read(`media-${c.id}.json`)))).filter(Boolean).map((t) => JSON.parse(t)));
      let text = await ask("s7", [
        { text: (proven() ? proven() + "\nPROVEN_DEMAND shows titles that won on this topic: learn their promise, never their wording.\n" : "") + ctx("S0_S1", await read("s01.md")) + "\n" + ctx("CHAPTERS", chapterTimes) + "\n" + ctx("S6", await read("s6.md")) + (credits ? "\n" + ctx("PICTURE_CREDITS", credits) + "\nThe description's credits block includes every PICTURE_CREDITS line exactly as written (the CC BY licences require it)." : "") },
        { text: "Write S7, the publishing pack (section 14): final title matching the delivered film, written on one line as **Final title: ...**, 3 thumbnail briefs (free stock and typography, no real faces, no logos), description with chapters (first at 00:00, from the chapter times given), a credits block with \"© OpenStreetMap contributors\", tags, pinned comment, 3 Shorts and 1 Facebook cut with their own hooks and exact source timestamps, upload settings (" + (film.allowAi ? "altered or synthetic content: Yes when the film has realistic AI scenes" : "no synthetic content") + ", not made for kids, category, language) and a posting plan for this audience." + (isStoryFilm(film) ? ` This is an invented story: the title and thumbnails never say true, real or "based on a true story", and the description ends with this exact line: "${storyNote(film)}".` : "") + "\n\n" + PACKAGING_RULES },
      ], 16000);
      if (credits && !credits.split("\n").every((line) => text.includes(line))) text += `\n\n### Picture credits (required by the licences)\n\n${credits}\n`;
      const title = (/\*\*Final title[^:]*:\s*([^*\n]+)\*\*/i.exec(text)?.[1] ?? "").trim();
      state.gaps.push(...titleProblems(title).map((p) => `S7: ${p}`));
      // Never an existing video's title: the closest proven title on this topic must stay clearly different.
      proven();
      const close = marketTitles.find((m) => titleTooClose(title, m));
      if (title && close) state.gaps.push(`S7: the title "${title}" is too close to an existing video, "${close}"; write a title of your own.`);
      if (isStoryFilm(film)) {
        const note = storyNote(film);
        if (!text.includes(note)) text += `\n\n### Description note (required for an invented story)\n\n${note}\n`;
        if (/\b(true|real)[- ]life\b|\btrue story\b|\breal story\b|\bbased on (a )?true\b|\breally happened\b/i.test(title)) state.gaps.push(`S7: the title "${title}" claims the invented story is true; change it before upload.`);
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
    state.error = (error instanceof Error ? error.message : String(error)).replace(/^NonRetryableError:\s*/, "");
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

/**
 * The packaging desk's rules (from the Viral SEO & Thumbnails squad brief,
 * prompts/4), given to S7 because packaging decides whether anyone clicks.
 */
export const PACKAGING_RULES = [
  "PACKAGING RULES (the packaging desk; they win over style):",
  "- Title: 3 to 8 words, at most 70 characters, the famous entity or the stake early, a concrete number or stake from the ledger, at most one all-caps word, no emoji; it promises exactly what the film pays off in its first minute and by the end. Never an existing video's wording.",
  "- Never call a named living person or an existing company a scam, fraud, criminal, thief, cheat, liar, killer or evil in the title, thumbnail, Shorts or narration, with or without a question mark, unless a court or regulator found it; describe the documented record instead.",
  "- Thumbnails (three, for YouTube's Test & Compare, which judges watch time): one dominant subject, one high-contrast cue, 0 to 3 words that add to the title and never repeat it, readable at 168x94 px; only imagery the film contains; no editorial-only images, logos, trade dress, fake news layouts or realistic AI depictions of real people.",
  "- Description: two hook lines, a summary, chapters (first at 00:00, at least three, each at least 10 s), sources by domain and title. Money films add 'Educational, not investment advice'; health films add 'Not medical advice'.",
  "- Before you finish, ask: would a stranger scrolling on a phone understand the promise in under a second, and could anyone call it misleading? If so, change it.",
].join("\n");

const DEFAMATORY = /\b(scam(?:mer)?s?|fraud(?:ster)?s?|criminals?|thie(?:f|ves)|cheats?|liars?|killers?|evil|crooks?|con ?(?:man|men|artist))\b/i;

/**
 * Code checks of the final title (the parts that can be measured).
 * @param {string} title
 * @returns {string[]} problems, empty when fine
 */
export function titleProblems(title) {
  if (!title) return ["no line '**Final title: ...**' was found; the title cannot be checked."];
  /** @type {string[]} */
  const out = [];
  if (title.length > 70) out.push(`the title is ${title.length} characters; YouTube cuts titles at about 70 on most screens.`);
  const words = title.split(/\s+/).filter(Boolean).length;
  if (words > 12) out.push(`the title has ${words} words; packaging works best at 3 to 8.`);
  const caps = title.split(/\s+/).filter((w) => /^[A-Z]{3,}[!?.,:]*$/.test(w)).length;
  if (caps > 1) out.push(`the title has ${caps} all-caps words; use at most one.`);
  const hit = DEFAMATORY.exec(title);
  if (hit) out.push(`the title says "${hit[1]}": allowed only about a court or regulator finding; check the named-subject rule before upload.`);
  return out;
}

/** @type {Record<string, string>} */
const ARCHIVE_NAMES = { wikimedia: "Wikimedia Commons", nasa: "NASA", loc: "the Library of Congress", smithsonian: "Smithsonian Open Access", met: "The Metropolitan Museum of Art", artic: "the Art Institute of Chicago", openverse: "Openverse" };

/**
 * The credit lines for every archive picture a film uses (Commons, NASA, the
 * Library of Congress, the Smithsonian, the Met, the Art Institute, Openverse),
 * one per item, from its licence record. CC BY items must be credited; public
 * domain items are credited too, as good practice. Stock (Pexels, Pixabay)
 * needs no credit.
 * @param {{ shots?: { pick?: any }[] }[]} chapters media-C1.json ... contents
 */
export function pictureCredits(chapters) {
  /** @type {Map<string, string>} */
  const lines = new Map();
  for (const ch of chapters) {
    for (const shot of ch.shots ?? []) {
      const p = shot.pick;
      if (!p || !ARCHIVE_NAMES[p.source] || lines.has(p.id)) continue;
      const what = p.title ? `"${String(p.title).slice(0, 120)}"` : "Picture";
      const who = p.licence?.creator || p.creator;
      const id = p.licence?.licenseId;
      const licence = id === "CC-BY" ? `CC BY${p.licence?.licenseUrl ? ` (${p.licence.licenseUrl})` : ""}` : p.source === "nasa" ? "courtesy of NASA" : p.source === "loc" ? "no known restrictions on publication" : id === "CC0-1.0" ? "CC0" : "public domain";
      lines.set(p.id, `${what}${who ? ` by ${String(who).slice(0, 80)}` : ""}, ${licence}, via ${ARCHIVE_NAMES[p.source]}: ${p.sourcePageUrl}`);
    }
  }
  return [...lines.values()].join("\n");
}

/** The one-line description note of an invented story, in the film's language. @param {Film} film */
export function storyNote(film) {
  return FICTION_LABELS[/** @type {keyof typeof FICTION_LABELS} */ (film.versionId)] ?? FICTION_LABELS["en-US"];
}

/** Thrown when a run stops at its budget; the run can be resumed with a higher one. */
export class BudgetReached extends Error {}

/**
 * True when the brain can look at pictures. A model without capabilities
 * (the Claude API) can; a brain that says vision: false cannot.
 * @param {Model} model
 */
export function canSee(model) {
  return model.capabilities?.vision !== false;
}

/**
 * True when the brain searches the web by itself during a request.
 * @param {Model} model
 */
export function canSearch(model) {
  return model.capabilities?.webSearch !== false;
}

const TITLE_STOP = new Set(["the", "a", "an", "of", "and", "to", "in", "on", "for", "how", "why", "what", "who", "this", "that", "is", "was", "his", "her", "their", "from", "with", "by", "at"]);

/**
 * Two titles too alike to call ours: most of the words of the shorter one
 * are in the other (case, punctuation and small words ignored).
 * @param {string} a @param {string} b
 */
export function titleTooClose(a, b) {
  const words = (/** @type {string} */ t) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 1 && !TITLE_STOP.has(w)));
  const x = words(a);
  const y = words(b);
  if (x.size < 2 || y.size < 2) return false;
  const shared = [...x].filter((w) => y.has(w)).length;
  return shared / Math.min(x.size, y.size) >= 0.75;
}

/** @param {string} text */
function safeParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

/** @param {string} text */
function safeJson(text) {
  try { return extractJson(text); } catch { return null; }
}
/** @param {number} n */
function round2(n) { return Math.round(n * 100) / 100; }
