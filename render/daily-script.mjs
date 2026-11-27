/**
 * The daily film's script: a ~5,500-6,000-word American English documentary narration about one
 * engineering topic (worker/daily-film.mjs), written by the free brain through the Worker
 * (POST /api/voice/:id/brain: Groq first, then the Gemini pool, with the Worker's own keys).
 *
 *   node render/daily-script.mjs --topic <id> --out run/   (SITE, VOICE_ID, VOICE_TICKET from the workflow)
 *
 * Facts: the English Wikipedia article(s) of the topic are the only fact source; every chapter is
 * written from its own part of that text, with no invented quotes (no quotation marks at all).
 * One central question opens the film, every chapter escalates it, the last answers it.
 * When a brain's daily limit is used up the run stops and says so: nothing is padded or invented.
 * Before anything is narrated the story critic (engine/src/story-critic.mjs) reads the script: a
 * failing part goes back to the brain with the findings (CRITIC_LIMITS.maxRounds rewrites), and a
 * script that still fails stops the film with the reason. It is never narrated.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CRITIC_LIMITS, brainPrompt, critiqueScript, parseBrainRead, repairScript, REPAIR_MAX_SHARE, rewriteNotes } from "../engine/src/story-critic.mjs";
import { msg } from "../engine/src/messages.mjs";
import { dailyTopic } from "../worker/daily-film.mjs";
import { GROQ_MODELS } from "../worker/groq.mjs";
import { parseArgs, send } from "./voice-runner.mjs";

/** The film's length in words (about 40 minutes at the narrator's ~145 words a minute). */
export const TARGET_WORDS = 5800;
export const CHAPTERS = 8;
/** A source this short is shown whole to every chapter; a longer one is split across the chapters. */
const WHOLE_SOURCE_CHARS = 18000;
/** Groq allows 8,000 tokens a minute (worker/groq.mjs): one chapter call a minute keeps under it. */
export const CALL_GAP_MS = 62_000;
const DROP = /^(see also|references|notes|external links|further reading|bibliography|sources|citations|footnotes|gallery|works cited)$/i;

/** @param {string} text */
export const wordCount = (text) => (text.match(/[A-Za-z0-9'’-]+/g) ?? []).length;

/**
 * An article's plain text as sections, without the reference lists.
 * @param {string} text the extract (== Heading == lines)
 * @returns {{ heading: string, text: string }[]}
 */
export function splitSections(text) {
  /** @type {{ heading: string, text: string, level: number }[]} */
  const out = [{ heading: "Introduction", text: "", level: 1 }];
  let dropping = 0;
  for (const line of text.split("\n")) {
    const h = /^(={2,})\s*(.*?)\s*={2,}\s*$/.exec(line);
    if (h) {
      const level = h[1].length;
      if (dropping && level > dropping) continue;
      dropping = DROP.test(h[2]) ? level : 0;
      if (!dropping) out.push({ heading: h[2], text: "", level });
      continue;
    }
    if (!dropping) out[out.length - 1].text += `${line}\n`;
  }
  return out.map((s) => ({ heading: s.heading, text: s.text.replace(/\n{3,}/g, "\n\n").trim() })).filter((s) => s.text.length > 40);
}

/**
 * Which part of the source each chapter is written from: the whole source when it is short,
 * else the sections in order, split by size, each chapter also seeing the introduction.
 * @param {{ heading: string, text: string }[]} sections @param {number} n
 * @returns {string[]}
 */
export function chapterSources(sections, n) {
  const all = sections.map((s) => `## ${s.heading}\n${s.text}`).join("\n\n");
  if (all.length <= WHOLE_SOURCE_CHARS) return Array.from({ length: n }, () => all);
  const intro = `## ${sections[0].heading}\n${sections[0].text}`.slice(0, 2500);
  const rest = sections.slice(1);
  const total = rest.reduce((a, s) => a + s.text.length, 0) || 1;
  /** @type {string[][]} */
  const groups = Array.from({ length: n }, () => []);
  let seen = 0;
  for (const s of rest) {
    const k = Math.min(n - 1, Math.floor(((seen + s.text.length / 2) / total) * n));
    groups[k].push(`## ${s.heading}\n${s.text}`);
    seen += s.text.length;
  }
  // A chapter with no section of its own borrows its neighbour's, so no chapter is written from nothing.
  return groups.map((g, i) => {
    const own = g.length ? g : groups[i - 1]?.length ? groups[i - 1] : groups[i + 1] ?? [];
    return `${intro}\n\n${own.join("\n\n")}`.slice(0, WHOLE_SOURCE_CHARS);
  });
}

/**
 * Narration as the narrator reads it: no headings, lists, markdown, stage directions or quotation marks.
 * @param {string} text
 */
export function cleanNarration(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(#|chapter\s+\d+\b|\*\*chapter|\[.*\]$|\(.*\)$|title:)/i.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, "").replace(/\*\*?|__|`/g, "").replace(/[“”"]/g, "").replace(/^narrator:\s*/i, ""))
    .join("\n\n")
    .trim();
}

/**
 * A reply cut off by its token limit ends at its last whole sentence, never mid-word.
 * @param {string} text @param {string} [stopReason]
 */
export function trimToSentence(text, stopReason) {
  if (stopReason !== "max_tokens") return text;
  const end = Math.max(text.lastIndexOf(". "), text.lastIndexOf(".\n"), text.lastIndexOf("? "), text.lastIndexOf("! "));
  return end > text.length * 0.5 ? text.slice(0, end + 1) : text;
}

/**
 * The outline's chapter lines ("1. Title: what it reveals"), or a plain arc when the brain's lines cannot be read.
 * @param {string} text @param {number} n
 */
export function parseOutline(text, n) {
  const lines = text.split("\n").map((l) => /^\s*(?:chapter\s*)?(\d{1,2})[.):\-\s]+\s*(.+)$/i.exec(l.replace(/\*\*/g, ""))).filter(Boolean);
  /** @type {{ title: string, beat: string }[]} */
  const got = [];
  for (const m of /** @type {RegExpExecArray[]} */ (lines)) {
    const [title, ...beat] = m[2].split(/\s+[—–-]\s+|:\s+/);
    if (Number(m[1]) === got.length + 1 && got.length < n) got.push({ title: title.trim(), beat: beat.join(": ").trim() || title.trim() });
  }
  if (got.length === n) return got;
  const arc = ["Cold open: the moment it all went wrong or came true, and the central question", "The people, the place and the need", "The design and the bold idea behind it", "Building it: the work, the risks, the warnings", "Signs of trouble or the hardest obstacle", "The turning point", "The investigation and what the evidence showed", "The answer to the central question and what engineers changed"];
  return Array.from({ length: n }, (_, i) => ({ title: `Part ${i + 1}`, beat: arc[Math.min(i, arc.length - 1)] }));
}

export const FACT_SYSTEM = "You are a strict fact-checker for a documentary narration. You compare each sentence of the narration with the SOURCE text. A sentence passes only if the SOURCE states or directly implies it; scene-setting color fails when it adds events, deaths, injuries, times, numbers, names or quotes. You answer only with the failing sentences, copied exactly, one per line, or NONE.";

/** @param {string} t */
const sentences = (t) => t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
/** @param {string} t */
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Cut the sentences the fact pass listed (matched loosely: case, spacing and punctuation ignored).
 * A list that would cut over a third of the part is not trusted: nothing is cut, and it is reported.
 * @param {string} text @param {string} listed the fact pass's reply, one sentence a line, or NONE
 */
export function cutSentences(text, listed) {
  const flagged = new Set(listed.split("\n").map((l) => norm(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ""))).filter((l) => l.length > 15));
  if (!flagged.size) return { text, removed: [] };
  const all = text.split(/\n\s*\n/).map(sentences);
  const removed = all.flat().filter((x) => flagged.has(norm(x)));
  if (removed.length > all.flat().length / 3) return { text, removed: [] };
  const kept = all.map((p) => p.filter((x) => !flagged.has(norm(x))).join(" ")).filter(Boolean);
  return { text: kept.join("\n\n"), removed };
}

/** @param {{ title: string, question: string }} topic */
export function systemPrompt(topic) {
  return [
    "You write the spoken narration of a long-form documentary for ordinary American viewers, in the niche Engineering Disasters & Megaprojects.",
    `The film: ${topic.title}. Its one central question: ${topic.question}`,
    "Rules you never break:",
    "- Use only facts stated in the SOURCE text you are given. Never invent a name, number, date, place, cause or event. If the source is unsure or sources disagree, say so plainly.",
    "- No quotation marks and no invented quotes. Never put words in anyone's mouth; report what someone said in your own words, only when the source records it.",
    "- Write for the ear: plain words, short and medium sentences, one idea at a time. Explain every engineering idea with an everyday comparison.",
    "- Write numbers and years as they are spoken (nineteen forty, forty-two miles an hour, two thousand eight hundred feet).",
    "- No headings, lists, markdown, scene directions, music cues or the word chapter. Only the words the narrator says, in paragraphs.",
    "- Keep the central question alive: each part raises the stakes; give the viewer a reason to keep watching, without hype and without promising anything the film does not deliver.",
  ].join("\n");
}

/** Each Groq model has its own 8,000-token minute (worker/groq.mjs); a call is counted at its prompt plus most of its reply. */
export const LANE_TOKENS_PER_MINUTE = 7000;

/**
 * Three free models, each with its own minute: a call goes to the model that has room now, so three
 * calls run at once instead of one every 62 seconds. A model that answers "busy" rests a while;
 * a model whose day is used up is out until tomorrow.
 * @param {{ models?: readonly string[], now?: () => number, sleep?: (ms: number) => Promise<void>, perMinute?: number }} [o]
 */
export function makeLanes(o = {}) {
  const models = [...(o.models ?? GROQ_MODELS)];
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const perMinute = o.perMinute ?? LANE_TOKENS_PER_MINUTE;
  /** @type {Map<string, { at: number, tokens: number }[]>} */
  const used = new Map(models.map((m) => [m, []]));
  /** @type {Map<string, number>} */
  const restUntil = new Map();
  /** @type {Set<string>} */
  const spent = new Set();
  const load = (/** @type {string} */ m) => { const t = now(); const list = (used.get(m) ?? []).filter((x) => t - x.at < 60_000); used.set(m, list); return list.reduce((n, x) => n + x.tokens, 0); };
  return {
    models,
    spent,
    /** @param {number} tokens @returns {Promise<string>} the model to call */
    async acquire(tokens) {
      const need = Math.min(tokens, perMinute);
      for (;;) {
        const live = models.filter((m) => !spent.has(m));
        if (!live.length) throw new Error("every free model's day is used up");
        const t = now();
        const ready = live.filter((m) => (restUntil.get(m) ?? 0) <= t && load(m) + need <= perMinute);
        if (ready.length) {
          // The emptiest minute first, so the three share the work.
          const m = ready.reduce((a, b) => (load(b) < load(a) ? b : a));
          /** @type {{ at: number, tokens: number }[]} */ (used.get(m)).push({ at: t, tokens: need });
          return m;
        }
        // Wait until the earliest moment a model has room (a window slides out, or a rest ends).
        const when = live.map((m) => {
          const rest = restUntil.get(m) ?? 0;
          let sum = load(m);
          let free = t;
          for (const x of used.get(m) ?? []) { if (sum + need <= perMinute) break; sum -= x.tokens; free = x.at + 60_000; }
          return Math.max(rest, free);
        });
        await sleep(Math.max(500, Math.min(...when) - t + 200));
      }
    },
    /** A model said it is busy: rest it. @param {string} m @param {number} [ms] */
    rest(m, ms = 20_000) { restUntil.set(m, now() + ms); },
    /** A model's day is used up. @param {string} m */
    spend(m) { spent.add(m); },
  };
}

/**
 * One brain call on the lane that has room: the model is named to the Worker, which asks only that model.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {{ system: string, prompt: string, maxTokens: number }} body
 * @param {{ calls: { model: string, words: number, seconds: number }[], lanes: ReturnType<typeof makeLanes> }} state
 */
async function laneCall(c, body, state) {
  const lanes = state.lanes;
  const tokens = Math.ceil((body.system.length + body.prompt.length) / 3.8) + Math.ceil(body.maxTokens * 0.6);
  let last = "";
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    let model;
    try { model = await lanes.acquire(tokens); } catch (e) { throw new Error(`The free brains' daily limit is used up: ${last.slice(0, 300) || (e instanceof Error ? e.message : String(e))}`); }
    const t0 = Date.now();
    try {
      const r = await send(c, "/brain", { ...body, model });
      const text = String(r.text ?? "");
      state.calls.push({ model: String(r.model ?? model), words: wordCount(text), seconds: Math.round((Date.now() - t0) / 1000) });
      if (text.trim()) return { text, model: String(r.model ?? model), stopReason: r.stopReason };
      last = "empty reply";
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      if (/day used up|per day|RPD|TPD|PerDay/i.test(last) && !/busy/i.test(last)) { lanes.spend(model); continue; }
      if (/ 4\d\d /.test(last) && !/ 429 /.test(last) && !/ 413 /.test(last)) throw new Error(`The brain refused the request: ${last.slice(0, 400)}`);
      lanes.rest(model);
    }
  }
  throw new Error(`The free brain did not answer after 12 tries: ${last.slice(0, 400)}`);
}

/**
 * One brain call through the Worker, paced for Groq's minute limit, retried while the brain is only busy.
 * Stops with the brain's own reason when a daily limit is used up.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {{ system: string, prompt: string, maxTokens: number }} body
 * @param {{ calls: { model: string, words: number, seconds: number }[], last: number, sleep?: (ms: number) => Promise<void>, gapMs?: number }} state
 */
export async function brainCall(c, body, state) {
  if (state.lanes) return laneCall(c, body, state);
  const sleep = state.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const gap = state.gapMs ?? CALL_GAP_MS;
  let last = "";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const wait = state.last + gap - Date.now();
    if (wait > 0) await sleep(wait);
    const t0 = Date.now();
    state.last = t0;
    try {
      const r = await send(c, "/brain", body);
      const text = String(r.text ?? "");
      state.calls.push({ model: String(r.model ?? "?"), words: wordCount(text), seconds: Math.round((Date.now() - t0) / 1000) });
      if (text.trim()) return { text, model: String(r.model ?? "?"), stopReason: r.stopReason };
      last = "empty reply";
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
      // Every free brain's day is used up: waiting will not help today.
      if (/day used up|per day|RPD|TPD|PerDay|daily|RESOURCE_EXHAUSTED/i.test(last) && !/busy/i.test(last)) throw new Error(`The free brains' daily limit is used up: ${last.slice(0, 400)}`);
      if (/ 4\d\d /.test(last) && !/ 429 /.test(last)) throw new Error(`The brain refused the request: ${last.slice(0, 400)}`);
    }
  }
  throw new Error(`The free brain did not answer after 4 tries: ${last.slice(0, 400)}`);
}

/**
 * One article's plain text. Wikimedia asks automated clients for a contact in the user agent and
 * answers 429 when a shared address asks too often: waited and tried again, then the run stops.
 * @param {string} title @param {typeof fetch} [get] @param {(ms: number) => Promise<void>} [sleep]
 */
export async function wikiText(title, get = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms))) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&exsectionformat=wiki&redirects=1&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  let last = "";
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await get(url, { headers: { "user-agent": "ZuponaStudio/1.0 (https://github.com/sayedmuntasim3-cmd/ai.x.com; daily documentary script)" } }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }));
    if (res.ok) {
      const page = (/** @type {any} */ (await /** @type {Response} */ (res).json())).query?.pages?.[0];
      if (!page?.extract) throw new Error(`Wikipedia has no article "${title}"`);
      return { title: String(page.title), url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, "_"))}`, text: String(page.extract) };
    }
    last = `${res.status}`;
    if (res.status && res.status !== 429 && res.status < 500) break;
    await sleep(15_000 * attempt);
  }
  throw new Error(`Wikipedia did not give the article "${title}" (${last}), so the script has no fact source.`);
}

/**
 * Write the whole script.
 * @param {{ c: { site: string, id: string, ticket: string, fetch?: typeof fetch }, topic: import("../worker/daily-film.mjs").DailyTopic, out: string, log?: (l: string) => void, get?: typeof fetch, sleep?: (ms: number) => Promise<void>, gapMs?: number, critic?: boolean, maxRounds?: number }} o
 *   critic false: skip the story critic (tests of the writing only); maxRounds: rewrites before the film stops
 */
export async function writeScript(o) {
  const log = o.log ?? console.log;
  const t0 = Date.now();
  const articles = [];
  for (const t of o.topic.wiki) articles.push(await wikiText(t, o.get, o.sleep));
  const sections = articles.flatMap((a) => splitSections(a.text));
  const sourceChars = sections.reduce((n, s) => n + s.text.length, 0);
  log(`source: ${articles.map((a) => a.url).join(", ")} (${sourceChars} characters, ${sections.length} sections)`);
  if (sourceChars < 6000) throw new Error(`The source is too short (${sourceChars} characters) to write a 40-minute film from facts only.`);
  const sources = chapterSources(sections, CHAPTERS);
  const state = { calls: /** @type {{ model: string, words: number, seconds: number }[]} */ ([]), last: 0, sleep: o.sleep, gapMs: o.gapMs, lanes: o.gapMs === undefined && !o.sleep ? makeLanes() : null };
  const system = systemPrompt(o.topic);

  const headings = sections.map((s) => s.heading).join("; ");
  const outlineText = (await brainCall(o.c, { system, maxTokens: 1200, prompt: `SOURCE (introduction and the list of sections):\n${sections[0].text.slice(0, 5000)}\n\nSections: ${headings}\n\nPlan the film in exactly ${CHAPTERS} parts that escalate the central question: part 1 opens cold on the most dramatic documented moment and asks the question; the middle parts build the story in time order and raise the stakes; part ${CHAPTERS} answers the question plainly and says what engineers changed because of it. Answer with exactly ${CHAPTERS} lines and nothing else, each: number. short title: what this part reveals and the new question it leaves.` }, state)).text;
  const outline = parseOutline(outlineText, CHAPTERS);
  log(`outline: ${outline.map((p, i) => `${i + 1}. ${p.title}`).join(" | ")}`);

  /** @type {{ title: string, beat: string, text: string, words: number }[]} */
  const chapters = [];
  let factChanges = 0;
  /** @type {string[]} */
  const unsupported = [];
  /** @param {number} i */
  const writePart = async (i) => {
    // Each part's length follows what is left, so a long part is balanced by shorter ones after it; parts written at once share the target evenly.
    const sofar = chapters.reduce((n, ch) => n + (ch?.words ?? 0), 0);
    const want = state.lanes ? Math.round(TARGET_WORDS / CHAPTERS) : Math.min(1000, Math.max(450, Math.round((TARGET_WORDS - sofar) / (CHAPTERS - i))));
    const plan = outline.map((p, k) => `${k + 1}. ${p.title}: ${p.beat}${k === i ? "   <- THIS PART" : ""}`).join("\n");
    const before = state.lanes ? "" : chapters.at(-1)?.text.slice(-700) ?? "";
    const job = i === 0 ? "Open cold on the most dramatic documented moment, then ask the central question in plain words within the first minute." : i === CHAPTERS - 1 ? "Answer the central question plainly, show what the investigations found and what engineers changed, and end on a quiet, memorable last line." : "Continue the story from where the last part ended; add new facts only, never repeat earlier parts; end with a question or a turn that makes the viewer want the next part.";
    const prompt = `SOURCE:\n${sources[i]}\n\nTHE FILM'S PLAN:\n${plan}\n\n${before ? `The previous part ended with:\n...${before}\n\n` : ""}Write part ${i + 1} of ${CHAPTERS} now: ${want} words (between ${want - 60} and ${want + 60}; never more than ${want + 100}). ${job}`;
    const r = await brainCall(o.c, { system, prompt, maxTokens: Math.round(want * 1.9) + 300 }, state);
    let text = cleanNarration(trimToSentence(r.text, r.stopReason));
    // Too short: one more call continues the same part (never padding: new facts from the same source).
    if (wordCount(text) < want * 0.8) {
      const more = await brainCall(o.c, { system, maxTokens: 1800, prompt: `SOURCE:\n${sources[i]}\n\nThis is part ${i + 1} of ${CHAPTERS} so far:\n${text}\n\nContinue this part seamlessly for about ${want - wordCount(text)} more words, with facts from the SOURCE not used yet. Do not repeat or summarize what is already written. ${i === CHAPTERS - 1 ? "End on a quiet, memorable last line." : ""}` }, state);
      text = `${text}\n\n${cleanNarration(trimToSentence(more.text, more.stopReason))}`;
    }
    // The fact pass: the brain lists the part's sentences its own source does not support; they are cut.
    const flagged = await brainCall(o.c, { system: FACT_SYSTEM, maxTokens: 4000, prompt: `SOURCE:\n${sources[i]}\n\nNARRATION:\n${text}\n\nList every sentence of the NARRATION that states something the SOURCE does not support: an event, death, injury, time, number, name or cause the SOURCE does not give, or that contradicts it. Copy each such sentence exactly, one per line. If every sentence is supported, answer NONE.` }, state);
    const cut = cutSentences(text, flagged.text);
    factChanges += cut.removed.length;
    unsupported.push(...cut.removed);
    text = cut.text;
    chapters[i] = { title: outline[i].title, beat: outline[i].beat, text, words: wordCount(text) };
    log(`part ${i + 1}/${CHAPTERS}: ${wordCount(text)} words (${r.model})`);
  };
  if (state.lanes) {
    // Three models, three minutes: the parts are written at once (each from the film's plan and its own source).
    const queue = Array.from({ length: CHAPTERS }, (_, i) => i);
    await Promise.all(Array.from({ length: Math.min(state.lanes.models.length, CHAPTERS) }, async () => { for (let i = queue.shift(); i !== undefined; i = queue.shift()) await writePart(i); }));
  } else for (let i = 0; i < CHAPTERS; i += 1) await writePart(i);
  mkdirSync(o.out, { recursive: true });
  const critic = o.critic === false ? null : await storyCritic({ ...o, log, chapters, sources, whole: sections.map((s) => s.text).join("\n\n"), system, state });
  const words = chapters.reduce((n, ch) => n + ch.words, 0);
  const script = { topic: o.topic.id, title: o.topic.title, question: o.topic.question, sources: articles.map((a) => ({ title: a.title, url: a.url, license: "CC BY-SA 4.0 (facts paraphrased)" })), words, chapters, calls: state.calls, models: [...new Set(state.calls.map((x) => x.model))], factCheck: { sentencesCut: factChanges, cut: unsupported, how: "each part checked against its own source by the same free brain; flagged sentences are cut (not a human fact-check)" }, ...(critic ? { critic: critic.summary } : {}), minutes: Math.round((Date.now() - t0) / 6000) / 10, notes: words < 5500 ? [`The script is ${words} words, under the 5,500-word target; it is kept (a film every day, good or bad).`] : [] };
  writeFileSync(join(o.out, "script.json"), JSON.stringify(script, null, 1));
  writeFileSync(join(o.out, "script.md"), `# ${script.title}\n\n${chapters.map((ch) => ch.text).join("\n\n")}\n`);
  return script;
}

/** Findings code can repair itself by dropping a sentence. */
const FIXABLE = new Set(["critique.inventedNumber", "critique.repetition"]);

/** Findings about the chain of an act, which a brain may rescue by quoting the sentence code missed. */
const CHAIN = new Set(["critique.noWhy", "critique.noEvent", "critique.noConsequence", "critique.unanswered"]);

/**
 * The story critic before narration: code reads the whole script against the whole source; the free
 * brain reads only the acts code found weak (it can rescue a link only by copying a real sentence).
 * A failing part is rewritten with its findings and fact-checked again, at most maxRounds times;
 * a script that still fails stops the film (the error is its reason). critic.json keeps every round.
 * @param {Parameters<typeof writeScript>[0] & { log: (l: string) => void, chapters: { title: string, beat: string, text: string, words: number }[], sources: string[], whole: string, system: string, state: any }} o
 */
async function storyCritic(o) {
  const max = o.maxRounds ?? CRITIC_LIMITS.maxRounds;
  /** @type {any[]} */
  const rounds = [];
  const save = (/** @type {boolean} */ ok) => writeFileSync(join(o.out, "critic.json"), JSON.stringify({ ok, maxRounds: max, rounds }, null, 1));
  for (let round = 0; ; round += 1) {
    const acts = o.chapters.map((ch, i) => ({ id: `C${i + 1}`, text: ch.text }));
    const base = { acts, sources: [o.whole], question: o.topic.question, title: o.topic.title };
    let review = critiqueScript(base);
    /** @type {import("../engine/src/story-critic.mjs").BrainRead | undefined} */
    let brainRead;
    const weak = [...new Set(review.findings.filter((f) => CHAIN.has(f.code) && f.chapter).map((f) => /** @type {string} */ (f.chapter)))];
    if (weak.length) {
      /** @type {import("../engine/src/story-critic.mjs").BrainRead} */
      const brain = { chapters: [], answer: null };
      brainRead = brain;
      const reads = await Promise.all(weak.map(async (id) => {
        const p = brainPrompt(acts.filter((a) => a.id === id), id === acts.at(-1)?.id ? o.topic.question : null);
        return { id, read: parseBrainRead((await brainCall(o.c, { system: p.system, prompt: p.prompt, maxTokens: 1500 }, o.state)).text) };
      }));
      for (const { id, read } of reads) {
        if (!read) continue;
        brain.chapters.push(...read.chapters.map((c) => ({ ...c, chapter: id })));
        if (read.answer) brain.answer = read.answer;
      }
      review = critiqueScript({ ...base, brain });
    }
    rounds.push({ round, ok: review.ok, brainRead: weak, findings: review.findings.map((f) => ({ code: f.code, severity: f.severity, chapter: f.chapter, message: f.message, items: f.items })), stats: review.stats });
    const codes = [...new Set(review.findings.map((f) => f.code.replace("critique.", "")))].join(", ");
    // Never stop a film for a fixable line: when only an invented number or a repeat is left (or the rewrites
    // are used up), code drops those sentences itself; it refuses only when more than a tenth of the words would go.
    if (!review.ok && (round >= max || review.findings.every((f) => FIXABLE.has(f.code)))) {
      const fx = repairScript(acts, { sources: [o.whole] });
      if (fx.ok && fx.removed.length) {
        const again = critiqueScript({ ...base, acts: fx.acts, ...(brainRead ? { brain: brainRead } : {}) });
        if (again.ok) {
          fx.acts.forEach((a, i) => { o.chapters[i] = { ...o.chapters[i], text: a.text, words: wordCount(a.text) }; });
          rounds.push({ round, repaired: true, share: Math.round(fx.share * 1000) / 10, removed: fx.removed.map((r) => ({ act: r.act, why: r.why, sentence: r.sentence.slice(0, 200) })), ok: true });
          save(true);
          o.log(`story critic: ${fx.removed.length} sentence(s) dropped by code (${fx.removed.filter((r) => r.why === "number").length} with a number no source has, ${fx.removed.filter((r) => r.why === "repeat").length} repeated), ${(fx.share * 100).toFixed(1)}% of the words; the script passes.`);
          return { summary: { ok: true, rounds: round + 1, repaired: fx.removed.length } };
        }
        o.log(`story critic: dropping ${fx.removed.length} sentence(s) was not enough (${again.findings.map((f) => f.code.replace("critique.", "")).join(", ")} remain).`);
      } else if (!fx.ok) o.log(`story critic: a repair would take ${(fx.share * 100).toFixed(1)}% of the words (over ${REPAIR_MAX_SHARE * 100}%); it is not a fixable script.`);
    }
    if (review.ok) {
      save(true);
      o.log(msg("critique.passed", { round }).en);
      return { summary: { ok: true, rounds: round + 1 } };
    }
    if (round >= max) {
      save(false);
      writeFileSync(join(o.out, "script-rejected.md"), `# ${o.topic.title} (rejected by the story critic; not narrated)\n\n${o.chapters.map((ch) => ch.text).join("\n\n")}\n`);
      throw new Error(`${msg("critique.stopped", { max, codes }).en} ${review.findings.slice(0, 6).map((f) => f.message.en).join(" ")}`.slice(0, 1200));
    }
    const notes = rewriteNotes(review.findings, acts);
    o.log(msg("critique.rewrite", { count: notes.size, round: round + 1, max, codes }).en);
    await Promise.all([...notes].map(async ([id, list]) => {
      const i = Number(id.slice(1)) - 1;
      const ch = o.chapters[i];
      const r = await brainCall(o.c, { system: o.system, maxTokens: Math.round(ch.words * 1.9) + 300, prompt: `SOURCE:\n${o.sources[i]}\n\nTHIS IS PART ${i + 1} OF ${o.chapters.length}:\n${ch.text}\n\nA story editor sent this part back. Fix every point below; keep everything else that was right and keep about ${ch.words} words. Use only facts the SOURCE states.\n- ${list.join("\n- ")}\n\nAnswer with the whole rewritten part only.` }, o.state);
      let text = cleanNarration(trimToSentence(r.text, r.stopReason));
      const flagged = await brainCall(o.c, { system: FACT_SYSTEM, maxTokens: 4000, prompt: `SOURCE:\n${o.sources[i]}\n\nNARRATION:\n${text}\n\nList every sentence of the NARRATION that states something the SOURCE does not support: an event, death, injury, time, number, name or cause the SOURCE does not give, or that contradicts it. Copy each such sentence exactly, one per line. If every sentence is supported, answer NONE.` }, o.state);
      text = cutSentences(text, flagged.text).text;
      o.chapters[i] = { ...ch, text, words: wordCount(text) };
    }));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(["write", ...process.argv.slice(2)]);
  const topic = dailyTopic(String(a.topic ?? ""));
  if (!topic || typeof a.out !== "string") { console.error("Usage: node render/daily-script.mjs --topic <id from worker/daily-film.mjs> --out run/"); process.exit(2); }
  const c = { site: String(process.env.SITE ?? ""), id: String(process.env.VOICE_ID ?? ""), ticket: String(process.env.VOICE_TICKET ?? "") };
  try {
    const s = await writeScript({ c, topic, out: a.out });
    console.log(`script: ${s.words} words, ${s.chapters.length} parts, ${s.calls.length} brain calls (${s.models.join(", ")}), ${s.minutes} min`);
    await send(c, "/progress", { stage: "script", params: { words: s.words, chapters: s.chapters.length, source: "Wikipedia" } });
  } catch (e) {
    console.error(`BLOCK: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
}
