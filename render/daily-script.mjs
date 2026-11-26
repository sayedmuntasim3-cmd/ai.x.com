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
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dailyTopic } from "../worker/daily-film.mjs";
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

/**
 * One brain call through the Worker, paced for Groq's minute limit, retried while the brain is only busy.
 * Stops with the brain's own reason when a daily limit is used up.
 * @param {{ site: string, id: string, ticket: string, fetch?: typeof fetch }} c @param {{ system: string, prompt: string, maxTokens: number }} body
 * @param {{ calls: { model: string, words: number, seconds: number }[], last: number, sleep?: (ms: number) => Promise<void>, gapMs?: number }} state
 */
export async function brainCall(c, body, state) {
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
 * @param {{ c: { site: string, id: string, ticket: string, fetch?: typeof fetch }, topic: import("../worker/daily-film.mjs").DailyTopic, out: string, log?: (l: string) => void, get?: typeof fetch, sleep?: (ms: number) => Promise<void>, gapMs?: number }} o
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
  const state = { calls: /** @type {{ model: string, words: number, seconds: number }[]} */ ([]), last: 0, sleep: o.sleep, gapMs: o.gapMs };
  const system = systemPrompt(o.topic);

  const headings = sections.map((s) => s.heading).join("; ");
  const outlineText = (await brainCall(o.c, { system, maxTokens: 1200, prompt: `SOURCE (introduction and the list of sections):\n${sections[0].text.slice(0, 5000)}\n\nSections: ${headings}\n\nPlan the film in exactly ${CHAPTERS} parts that escalate the central question: part 1 opens cold on the most dramatic documented moment and asks the question; the middle parts build the story in time order and raise the stakes; part ${CHAPTERS} answers the question plainly and says what engineers changed because of it. Answer with exactly ${CHAPTERS} lines and nothing else, each: number. short title: what this part reveals and the new question it leaves.` }, state)).text;
  const outline = parseOutline(outlineText, CHAPTERS);
  log(`outline: ${outline.map((p, i) => `${i + 1}. ${p.title}`).join(" | ")}`);

  /** @type {{ title: string, beat: string, text: string, words: number }[]} */
  const chapters = [];
  for (let i = 0; i < CHAPTERS; i += 1) {
    // Each part's length follows what is left, so a long part is balanced by shorter ones after it.
    const sofar = chapters.reduce((n, ch) => n + ch.words, 0);
    const want = Math.min(1000, Math.max(450, Math.round((TARGET_WORDS - sofar) / (CHAPTERS - i))));
    const plan = outline.map((p, k) => `${k + 1}. ${p.title}: ${p.beat}${k === i ? "   <- THIS PART" : ""}`).join("\n");
    const before = chapters.at(-1)?.text.slice(-700) ?? "";
    const job = i === 0 ? "Open cold on the most dramatic documented moment, then ask the central question in plain words within the first minute." : i === CHAPTERS - 1 ? "Answer the central question plainly, show what the investigations found and what engineers changed, and end on a quiet, memorable last line." : "Continue the story from where the last part ended; add new facts only, never repeat earlier parts; end with a question or a turn that makes the viewer want the next part.";
    const prompt = `SOURCE:\n${sources[i]}\n\nTHE FILM'S PLAN:\n${plan}\n\n${before ? `The previous part ended with:\n...${before}\n\n` : ""}Write part ${i + 1} of ${CHAPTERS} now: ${want} words (between ${want - 60} and ${want + 60}; never more than ${want + 100}). ${job}`;
    const r = await brainCall(o.c, { system, prompt, maxTokens: Math.round(want * 1.9) + 300 }, state);
    let text = cleanNarration(trimToSentence(r.text, r.stopReason));
    // Too short: one more call continues the same part (never padding: new facts from the same source).
    if (wordCount(text) < want * 0.8) {
      const more = await brainCall(o.c, { system, maxTokens: 1800, prompt: `SOURCE:\n${sources[i]}\n\nThis is part ${i + 1} of ${CHAPTERS} so far:\n${text}\n\nContinue this part seamlessly for about ${want - wordCount(text)} more words, with facts from the SOURCE not used yet. Do not repeat or summarize what is already written. ${i === CHAPTERS - 1 ? "End on a quiet, memorable last line." : ""}` }, state);
      text = `${text}\n\n${cleanNarration(trimToSentence(more.text, more.stopReason))}`;
    }
    chapters.push({ title: outline[i].title, beat: outline[i].beat, text, words: wordCount(text) });
    log(`part ${i + 1}/${CHAPTERS}: ${wordCount(text)} words (${r.model})`);
  }
  const words = chapters.reduce((n, ch) => n + ch.words, 0);
  const script = { topic: o.topic.id, title: o.topic.title, question: o.topic.question, sources: articles.map((a) => ({ title: a.title, url: a.url, license: "CC BY-SA 4.0 (facts paraphrased)" })), words, chapters, calls: state.calls, models: [...new Set(state.calls.map((x) => x.model))], minutes: Math.round((Date.now() - t0) / 6000) / 10, notes: words < 5500 ? [`The script is ${words} words, under the 5,500-word target; it is kept (a film every day, good or bad).`] : [] };
  mkdirSync(o.out, { recursive: true });
  writeFileSync(join(o.out, "script.json"), JSON.stringify(script, null, 1));
  writeFileSync(join(o.out, "script.md"), `# ${script.title}\n\n${chapters.map((ch) => ch.text).join("\n\n")}\n`);
  return script;
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
