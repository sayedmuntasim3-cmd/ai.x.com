/**
 * The story critic: a script is read before anyone narrates it, and a script
 * that is a generic, logic-free chatbot story never reaches the narrator.
 *
 * Code checks what code can check, the same way every time:
 *   - a causal chain in every act (chapter): why, what happened, the consequence;
 *   - one central question, asked early and answered by the end;
 *   - every number, name and quote it states is in the research sources;
 *     anything that is not is invented, and invented facts are a hard fail;
 *   - no padding: repeated passages (word n-grams), near-duplicate sentences,
 *     cliches and hedges.
 *
 * A free brain may help where code is blind, but only by quoting the script:
 * a chain link or an answer code missed counts when the brain copies the
 * exact sentence that holds it, and a logic gap counts when it names an exact
 * sentence. A brain that invents a sentence is ignored. The brain pass needs
 * neither search nor sight (canSearch / canSee), so any brain can run it;
 * nothing here assumes Claude.
 *
 * Pure module (browser + Node): no I/O. render/daily-script.mjs runs it before
 * the daily film's narration; bossism's script gate runs it on idea films.
 */
import { msg } from "./messages.mjs";
import { BANNED_EN } from "./scene-lines.mjs";

/**
 * @typedef {{ id: string, text: string }} Act one chapter's spoken narration
 * @typedef {{ code: string, severity: "block" | "revise", chapter: string | null, message: import("./messages.mjs").Message & { en: string, bn: string }, note: string, items: string[] }} CriticFinding
 * @typedef {{ chapters: { chapter: string, why?: string | null, what?: string | null, consequence?: string | null, gaps?: { sentence: string, problem: string }[] }[], answer?: string | null }} BrainRead
 */

/** Thresholds, in one place so they are visible and tested. */
export const CRITIC_LIMITS = Object.freeze({
  /** Words of a passage that, said twice, is padding. */
  ngram: 8,
  /** A repeated passage this long fails alone; shorter ones fail from this many on. */
  longRepeat: 14,
  repeatedPassages: 3,
  /** Two sentences sharing this share of their content words say the same thing. */
  similarity: 0.75,
  minContentWords: 6,
  nearDuplicates: 2,
  /** Cliches allowed in the whole script; hedges allowed per 1,000 words. */
  cliches: 1,
  hedgesPer1000: 4,
  /** A narrated number within this share of a source number counts only when hedged ("about forty"). */
  approx: 0.1,
  /** The central question is asked in the first act, or within this share of the words. */
  openingShare: 0.25,
  /** Share of the question's key words the ending must speak to. */
  answerCover: 0.5,
  /** Rewrite rounds a failing script gets before the film stops. */
  maxRounds: 2,
});

const CLICHES = Object.freeze([
  ...BANNED_EN,
  "it's worth noting", "it is worth noting", "it is important to note", "it's important to note", "needless to say",
  "in today's world", "in the annals of history", "stands as a testament", "a testament to", "serves as a reminder",
  "a stark reminder", "a cautionary tale", "the rest is history", "only time will tell", "sent shockwaves",
  "changed forever", "would never be the same", "nothing could have prepared", "like never before", "game-changer",
  "game changer", "delve", "tapestry", "at the end of the day", "in conclusion", "when all is said and done",
  "a perfect storm", "against all odds", "the stuff of legend", "a rollercoaster", "the world watched in horror",
  "a story of", "this is a story about", "one thing is certain", "make no mistake", "it goes without saying",
]);
const HEDGES = Object.freeze([
  "perhaps", "arguably", "it could be said", "some might say", "one might say", "it seems", "it seemed", "in a way",
  "somewhat", "kind of", "sort of", "more or less", "to some extent", "in some ways", "it is possible that",
  "possibly", "presumably", "it may be that", "seemingly",
]);

/** Why it happened: cause, need, motive. */
const WHY = /\b(because|due to|caused|cause[sd]? by|causes?|the reason|reasons?|why|in order to|so that|was meant to|were meant to|was designed to|to save|to cut|needed|wanted|driven by|thanks to|owing to|since (?:the|it|they|he|she|its|their)|blamed|explains?|explained)\b/i;
/** What it led to. */
const CONSEQUENCE = /\b(as a result|so (?:the|it|they|that|he|she|its|their|engineers|builders|nobody|no one)|therefore|meant|led to|leading to|resulted in|the result|forcing|forced|consequently|in the end|from then on|ever since|afterwards?|that is why|this is why|which is why|left (?:the|them|it|him|her)|never again|changed (?:the|how)|became)\b/i;
/** Something happened: a past-tense verb. */
const EVENT = /\b(\w{3,}ed|began|built|broke|fell|rose|came|went|made|took|gave|saw|grew|tore|shook|ran|stood|sank|struck|split|swung|won|lost|paid|chose|drove|told|found|knew|thought|brought|spent|held|left|met|sent|set|cut|hit|led|read|became|was|were|had)\b/i;
const HEDGED_NUMBER = /\b(about|around|nearly|almost|roughly|some|more than|over|under|less than|approximately|close to|just over|just under|up to|at least|at most)\s*$/i;

const STOP = new Set("a an the and or but if then so of to in on at by for with from into onto over under as is are was were be been being it its it's this that these those there their they them he she his her him we our you your i not no nor do did does done can could would should will shall may might must have has had what which who whom whose when where why how all any each every some such than too very just also only even still yet more most much many few one about after before again against between through during above below up down out off own same other both".split(" "));

const MONTHS = "january february march april may june july august september october november december monday tuesday wednesday thursday friday saturday sunday";
const COMMON_PROPER = new Set(`${MONTHS} i america american americans english god mr mrs ms dr sir st us u.s`.split(" "));
/**
 * Common geography: a place every viewer knows is not an invented fact, so it is a soft finding (revise), never
 * a hard block. People, firms and quotes stay hard blocks. Words of US states, regions, countries, oceans,
 * big rivers and big cities.
 */
const GEOGRAPHY = new Set(`alabama alaska arizona arkansas california colorado connecticut delaware florida georgia hawaii idaho illinois indiana iowa kansas kentucky louisiana maine maryland massachusetts michigan minnesota mississippi missouri montana nebraska nevada hampshire jersey mexico york carolina dakota ohio oklahoma oregon pennsylvania rhode island tennessee texas utah vermont virginia washington wisconsin wyoming
north south east west northern southern eastern western northwest northeast southwest southeast midwest midwestern pacific atlantic gulf arctic coast coastal great plains lakes rockies rocky appalachian appalachia new england sound bay valley canyon
canada canadian mexican britain british england scotland ireland france french germany german italy italian spain spanish china chinese japan japanese india indian russia russian soviet europe european asia asian africa african australia egypt brazil netherlands dutch switzerland swiss sweden norway
mississippi missouri hudson columbia colorado ohio potomac thames rhine danube nile amazon yangtze
chicago boston seattle portland francisco angeles los san philadelphia detroit houston dallas miami atlanta denver tacoma london paris berlin tokyo rome moscow`.split(/\s+/));

/** @param {string} t */
export const normalize = (t) => String(t).toLowerCase().replace(/[’‘]/g, "'").replace(/[‐-―-]/g, " ").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
/** The sentences of a text. @param {string} t */
export const sentencesOf = (t) => String(t).replace(/\s+/g, " ").split(/(?<=[.!?…])["”’]?\s+(?=["“‘]?[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
/** @param {string} t */
const words = (t) => normalize(t).split(" ").filter(Boolean);
/** A word's stem, crudely: enough to match "collapse" with "collapsed". @param {string} w */
const stem = (w) => w.replace(/'s$/, "").replace(/(ing|ed|es|s|ly)$/, "").slice(0, 7);
/** @param {string} t */
const contentWords = (t) => words(t).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

const UNITS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
const ORDINALS = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };
/** @param {string} w */
const numberWord = (w) => w in UNITS || w in TENS || w in SCALES || w === "hundred" || w === "point" || (w.endsWith("ies") && w.slice(0, -3) + "y" in TENS);

/**
 * One run of spoken number words as a value: "two thousand eight hundred" is 2800,
 * "nineteen forty" is the year 1940, "nineteen thirties" the decade 1930,
 * "four point five" is 4.5, "forty two" is 42.
 * @param {string[]} run
 * @returns {number}
 */
export function spokenValue(run) {
  const r = run.map((w) => (w.endsWith("ies") && w.slice(0, -3) + "y" in TENS ? w.slice(0, -3) + "y" : w));
  const v = (/** @type {string} */ w) => (w in UNITS ? UNITS[/** @type {keyof typeof UNITS} */ (w)] : w in TENS ? TENS[/** @type {keyof typeof TENS} */ (w)] : NaN);
  // A year said in two halves: "nineteen forty", "nineteen thirty eight", "eighteen ninety".
  if (r.length >= 2 && v(r[0]) >= 11 && v(r[0]) <= 20 && !r.includes("hundred") && !r.some((w) => w in SCALES)) {
    const rest = r.slice(1).reduce((n, w) => n + v(w), 0);
    if (rest >= 10 && rest < 100 && (r.length === 2 || (r[1] in TENS && v(r[2]) < 10))) return v(r[0]) * 100 + rest;
  }
  const at = r.indexOf("point");
  if (at > 0) {
    /** @type {number} */
    const whole = spokenValue(r.slice(0, at));
    const frac = r.slice(at + 1).map(v).filter((x) => x < 10).join("");
    return frac ? Number(`${whole}.${frac}`) : whole;
  }
  let total = 0;
  let current = 0;
  for (const w of r) {
    if (w === "hundred") current = (current || 1) * 100;
    else if (w in SCALES) { total += (current || 1) * SCALES[/** @type {keyof typeof SCALES} */ (w)]; current = 0; }
    else if (Number.isFinite(v(w))) current += v(w);
  }
  return total + current;
}

/**
 * A clock time said in words: an hour of one to twelve, then minutes of ten to fifty-nine ("one thirty",
 * "eleven forty-five"). Eleven and twelve need a sign that it is a clock (a.m., p.m., o'clock, "in the
 * morning"), because "twelve fifty" could also be a year. Returns null for anything else.
 * @param {string[]} ws @param {string} after the text right after the run
 * @returns {{ hour: number, minute: number } | null}
 */
export function clockTime(ws, after = "") {
  if (ws.length < 2 || ws.length > 3 || !(ws[0] in UNITS)) return null;
  const hour = UNITS[/** @type {keyof typeof UNITS} */ (ws[0])];
  if (!(hour >= 1 && hour <= 12)) return null;
  const rest = ws.slice(1);
  if (rest.some((w) => w === "hundred" || w in SCALES || w === "and" || w === "point")) return null;
  const minute = rest.reduce((n, w) => n + (w in UNITS ? UNITS[/** @type {keyof typeof UNITS} */ (w)] : w in TENS ? TENS[/** @type {keyof typeof TENS} */ (w)] : NaN), 0);
  if (!(minute >= 10 && minute <= 59)) return null;
  if (hour >= 11 && !/^\s*(?:[ap]\.?\s?m\b|o'clock|in the (?:morning|evening|afternoon))/i.test(after)) return null;
  return { hour, minute };
}

/**
 * The numbers a text states, with the words before each (to see "about").
 * Digits ("1,940", "4.5", "1940s") and spoken runs; ordinals count as their value.
 * @param {string} text
 * @returns {{ value: number, said: string, before: string }[]}
 */
export function numbersIn(text) {
  /** @type {{ value: number, said: string, before: string }[]} */
  const out = [];
  const t = String(text).replace(/[’‘]/g, "'").replace(/\b([Aa]) (hundred|thousand|million|billion)\b/g, "one $2").replace(/(\d),(\d{3})/g, "$1$2").replace(/(\d),(\d{3})/g, "$1$2");
  for (const m of t.matchAll(/(?<![A-Za-z])\d+(?:\.\d+)?/g)) {
    out.push({ value: Number(m[0]), said: m[0], before: t.slice(Math.max(0, m.index - 30), m.index) });
  }
  const tokens = [...t.toLowerCase().matchAll(/[a-z]+/g)];
  /** @type {RegExpMatchArray[]} */
  let run = [];
  const flush = () => {
    while (run.length && (run.at(-1)?.[0] === "point")) run.pop();
    if (run.length) {
      const first = /** @type {number} */ (run[0].index);
      const ws = run.map((x) => x[0]);
      const last = run.at(-1);
      const after = t.slice((last?.index ?? 0) + String(last?.[0]).length, (last?.index ?? 0) + String(last?.[0]).length + 24);
      const clock = clockTime(ws, after);
      if (clock) {
        // "One thirty a.m." is the clock time 1:30 the source writes as digits: two numbers, never thirty-one.
        out.push({ value: clock.hour, said: ws[0], before: t.slice(Math.max(0, first - 30), first) });
        out.push({ value: clock.minute, said: ws.slice(1).join(" "), before: `${ws[0]} ` });
      } else out.push({ value: spokenValue(ws), said: ws.join(" "), before: t.slice(Math.max(0, first - 30), first) });
    }
    run = [];
  };
  for (const tok of tokens) {
    const w = tok[0];
    // "and" inside a number ("one hundred and twenty") keeps the run going.
    if (numberWord(w) || (w === "and" && run.length && run.at(-1)?.[0] === "hundred")) run.push(tok);
    else if (w in ORDINALS) {
      // "seventh", "thirty-first", "nineteen fortieth" is not spoken; a tens word before an ordinal adds to it.
      const ord = ORDINALS[/** @type {keyof typeof ORDINALS} */ (w)];
      const tens = run.length > 0 && String(run.at(-1)?.[0]) in TENS && ord < 10;
      const start = tens ? /** @type {number} */ (run[0].index) : /** @type {number} */ (tok.index);
      const value = tens ? spokenValue(run.map((x) => x[0])) + ord : ord;
      const said = tens ? `${run.map((x) => x[0]).join(" ")} ${w}` : w;
      if (!tens) flush();
      out.push({ value, said, before: t.slice(Math.max(0, start - 30), start) });
      run = [];
    } else flush();
  }
  flush();
  return out.filter((n) => Number.isFinite(n.value) && n.said);
}

/**
 * A narrated number that matters: a year, a measure, a count over twelve, or any digit.
 * "One bridge" or "two lanes" is speech, not a claim worth a source check.
 * @param {{ value: number, said: string }} n
 */
const checkable = (n) => n.value > 12 || !Number.isInteger(n.value);

/**
 * Exact sentences a brain copied, found in the text (case, spacing and punctuation ignored).
 * @param {string | null | undefined} quoted @param {string} text
 */
function inText(quoted, text) {
  const q = normalize(quoted ?? "");
  return q.length >= 12 && normalize(text).includes(q);
}

/**
 * The central question: the opening's question sentence that best matches the
 * planned question (or the first real question when none was planned).
 * @param {Act[]} acts @param {string | null | undefined} planned
 */
export function centralQuestion(acts, planned) {
  const all = acts.map((a) => a.text).join(" ");
  const total = words(all).length;
  const openingWords = Math.max(acts.length > 1 ? words(acts[0].text).length : 0, Math.round(total * CRITIC_LIMITS.openingShare));
  /** @type {string[]} */
  const opening = [];
  let seen = 0;
  for (const s of sentencesOf(all)) {
    if (seen > openingWords) break;
    seen += words(s).length;
    if (/\?["”’]?$/.test(s) && contentWords(s).length >= 3) opening.push(s);
  }
  if (!opening.length) return null;
  if (!planned) return opening[0];
  const want = new Set(contentWords(planned));
  const score = (/** @type {string} */ s) => contentWords(s).filter((w) => want.has(w)).length / Math.max(1, want.size);
  const best = opening.reduce((a, b) => (score(b) > score(a) ? b : a));
  // A question that shares nothing with the planned one is not the film's question.
  return score(best) >= 0.3 || !want.size ? best : null;
}

/**
 * Does the ending speak to the question, in statements that give a cause?
 * @param {Act[]} acts @param {string} question
 */
function answered(acts, question) {
  const total = words(acts.map((a) => a.text).join(" ")).length;
  const endWords = Math.max(acts.length > 1 ? words(acts.at(-1)?.text ?? "").length : 0, Math.round(total * CRITIC_LIMITS.openingShare));
  const tail = sentencesOf(acts.map((a) => a.text).join(" ")).reverse();
  /** @type {string[]} */
  const ending = [];
  let seen = 0;
  for (const s of tail) {
    if (seen > endWords) break;
    seen += words(s).length;
    if (!/\?["”’]?$/.test(s)) ending.push(s);
  }
  const key = [...new Set(contentWords(question))];
  const said = new Set(contentWords(ending.join(" ")));
  const cover = key.filter((w) => said.has(w)).length / Math.max(1, key.length);
  const causal = ending.some((s) => WHY.test(s) || /\b(answer|explain|the truth|it was not|it wasn't)\b/i.test(s));
  return { ok: cover >= CRITIC_LIMITS.answerCover && causal, cover: Math.round(cover * 100), causal };
}

/**
 * Passages said twice: word n-grams that recur, merged into passages.
 * Restating the central question is not padding, so question sentences are left out.
 * @param {Act[]} acts
 */
export function repeatedPassages(acts) {
  /** @type {{ w: string, act: string, name: boolean }[]} */
  const seq = [];
  for (const a of acts) for (const s of sentencesOf(a.text)) {
    if (/\?["”’]?$/.test(s)) { seq.push({ w: "\u0000", act: a.id, name: false }); continue; }
    for (const t of capsOf(s)) seq.push({ w: t.w, act: a.id, name: t.name });
  }
  const n = CRITIC_LIMITS.ngram;
  /** @type {Map<string, number[]>} */
  const at = new Map();
  for (let i = 0; i + n <= seq.length; i += 1) {
    const g = seq.slice(i, i + n);
    if (g.some((x) => x.w === "\u0000")) continue;
    // An official name said again ("the Board of Water and Power Commissioners") is a name, not padding.
    if (isNameSpan(g)) continue;
    const k = g.map((x) => x.w).join(" ");
    if (!at.has(k)) at.set(k, []);
    /** @type {number[]} */ (at.get(k)).push(i);
  }
  /** Positions that start a repeat of an earlier passage. */
  const starts = new Set();
  for (const pos of at.values()) for (let j = 1; j < pos.length; j += 1) if (pos[j] - pos[0] >= n) starts.add(pos[j]);
  /** @type {{ text: string, words: number, act: string }[]} */
  const out = [];
  const sorted = [...starts].sort((x, y) => x - y);
  for (let k = 0; k < sorted.length; k += 1) {
    const begin = sorted[k];
    while (k + 1 < sorted.length && sorted[k + 1] === sorted[k] + 1) k += 1;
    const len = sorted[k] - begin + n;
    out.push({ text: seq.slice(begin, begin + len).map((x) => x.w).join(" "), words: len, act: seq[begin].act });
  }
  return out;
}

/** Small words inside an official name ("Board of Water and Power Commissioners"). */
const NAME_JOINERS = new Set(["of", "and", "the", "for", "de", "del", "la", "du", "von", "van", "on", "at", "in", "to", "&"]);

/**
 * A sentence's words, lowercased as `words` makes them, each with whether it was written with a capital
 * and whether it sits inside a proper name (a run of capitalised words with small joiners, three capitals or more).
 * Tokens match `words(s)` one for one.
 * @param {string} s
 * @returns {{ w: string, cap: boolean, first: boolean, name: boolean }[]}
 */
function capsOf(s) {
  const raw = String(s).replace(/[’‘]/g, "'").replace(/[‐-―-]/g, " ").replace(/[^A-Za-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const low = words(s);
  const toks = low.map((w, i) => ({ w, cap: /^[A-Z]/.test(raw[i] ?? ""), first: i === 0, name: false }));
  for (let i = 0; i < toks.length;) {
    if (!toks[i].cap) { i += 1; continue; }
    let j = i;
    let capCount = 0;
    while (j < toks.length && (toks[j].cap || (NAME_JOINERS.has(toks[j].w) && toks[j + 1]?.cap))) { if (toks[j].cap) capCount += 1; j += 1; }
    if (capCount >= 3) for (let k = i; k < j; k += 1) toks[k].name = true;
    i = j;
  }
  return toks;
}

/**
 * A span dominated by a proper name: four or more of its words sit inside one (the few common words
 * around it are not a passage worth cutting).
 * @param {{ name?: boolean }[]} g
 */
function isNameSpan(g) {
  return g.filter((x) => x.name).length >= 4;
}

/**
 * The numbers a text states that no source does, each with its sentence.
 * @param {string} text @param {{ known: number[], knownSet: Set<number> }} ctx
 * @returns {{ said: string, sentence: string }[]}
 */
export function inventedNumbersIn(text, ctx) {
  const { known, knownSet } = ctx;
  /** @type {{ said: string, sentence: string }[]} */
  const bad = [];
  for (const s of sentencesOf(text)) for (const n of numbersIn(s)) {
    if (!checkable(n) || knownSet.has(n.value)) continue;
    // A lone scale word ("the billion") points back at a number; it states no new one.
    if (n.said in { thousand: 1, million: 1, billion: 1, trillion: 1 }) continue;
    // "Nineteen eighty-nine or ninety-one": a year said short, next to a full year.
    if (n.value < 100 && !/\d/.test(n.said) && numbersIn(s).some((y) => y.value >= 1000 && y.value < 2100) && (knownSet.has(1900 + n.value) || knownSet.has(2000 + n.value))) continue;
    // "The sixties" is a decade: the sources say 1960s.
    if (/ies$/.test(n.said) && n.value < 100 && (knownSet.has(1900 + n.value) || knownSet.has(1800 + n.value))) continue;
    if (HEDGED_NUMBER.test(n.before) && known.some((k) => k && Math.abs(k - n.value) / Math.abs(k) <= CRITIC_LIMITS.approx)) continue;
    bad.push({ said: n.said, sentence: s });
  }
  return bad;
}

/**
 * Sentences that say the same thing in other words: most of their content words shared.
 * @param {Act[]} acts
 */
export function nearDuplicates(acts) {
  const list = acts.flatMap((a) => sentencesOf(a.text).filter((s) => !/\?["”’]?$/.test(s)).map((s) => ({ s, act: a.id, set: new Set(contentWords(s)) })));
  /** @type {{ a: string, b: string, act: string, score: number }[]} */
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].set.size < CRITIC_LIMITS.minContentWords) continue;
    for (let j = i + 1; j < list.length; j += 1) {
      if (list[j].set.size < CRITIC_LIMITS.minContentWords) continue;
      let both = 0;
      for (const w of list[i].set) if (list[j].set.has(w)) both += 1;
      const score = both / (list[i].set.size + list[j].set.size - both);
      if (score >= CRITIC_LIMITS.similarity) out.push({ a: list[i].s, b: list[j].s, act: list[j].act, score: Math.round(score * 100) / 100 });
    }
  }
  return out;
}

/** @param {string} text @param {readonly string[]} list */
function phrasesIn(text, list) {
  const t = ` ${normalize(text)} `;
  /** @type {string[]} */
  const out = [];
  for (const p of list) {
    const k = ` ${normalize(p)} `;
    let from = 0;
    for (;;) {
      const i = t.indexOf(k, from);
      if (i < 0) break;
      out.push(p);
      from = i + k.length - 1;
    }
  }
  return out;
}

/**
 * The prompt of the free-brain pass over the acts code found weak. The brain
 * copies sentences; it never writes new ones, so code can check every answer.
 * @param {Act[]} acts the acts to read @param {string | null} question
 */
export function brainPrompt(acts, question) {
  return {
    system: "You are a strict story editor of documentary narration. You never rewrite and never praise. You only copy exact sentences from the narration you are given, or answer null when no sentence does the job. You answer with one JSON object and nothing else.",
    prompt: [
      question ? `THE FILM'S CENTRAL QUESTION: ${question}` : "",
      ...acts.map((a) => `ACT ${a.id}:\n${a.text}`),
      "",
      "For every act, copy the exact sentence that gives WHY (the cause, need or motive behind what happens), the exact sentence that tells WHAT happened, and the exact sentence that gives the CONSEQUENCE (what it led to). Use null when the act has none. List logic gaps: an exact sentence whose event has no stated cause, or a claim that does not follow from what came before, with a one-line problem.",
      question ? "Also copy the exact sentence of the LAST act that answers the central question, or null." : "",
      'Answer: {"chapters":[{"chapter":"<act id>","why":string|null,"what":string|null,"consequence":string|null,"gaps":[{"sentence":string,"problem":string}]}],"answer":string|null}',
    ].filter(Boolean).join("\n\n"),
  };
}

/**
 * The brain's reply, read leniently: the first JSON object in it, or null.
 * @param {string} text @returns {BrainRead | null}
 */
export function parseBrainRead(text) {
  const m = /\{[\s\S]*\}/.exec(String(text ?? ""));
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return j && Array.isArray(j.chapters) ? j : null;
  } catch {
    return null;
  }
}

/**
 * Read a script before it is narrated.
 * @param {{ acts: Act[], sources?: string[] | null, question?: string | null, title?: string, brain?: BrainRead | null }} o
 *   sources: the research text the facts must come from; null for an invented story (no fact checks)
 * @returns {{ ok: boolean, findings: CriticFinding[], stats: Record<string, any> }}
 */
export function critiqueScript(o) {
  const acts = o.acts.filter((a) => a.text.trim());
  /** @type {CriticFinding[]} */
  const findings = [];
  /** @param {string} code @param {"block" | "revise"} severity @param {string | null} chapter @param {string[]} items @param {string} note @param {Record<string, any>} [p] */
  const add = (code, severity, chapter, items, note, p = {}) => findings.push({ code, severity, chapter, items: items.slice(0, 12), note, message: msg(code, { chapter: chapter ?? "", count: items.length, list: items.slice(0, 4).join("; "), ...p }) });
  const brain = o.brain ?? null;
  const brainAct = (/** @type {string} */ id) => brain?.chapters.find((c) => String(c.chapter) === String(id));
  const totalWords = acts.reduce((n, a) => n + words(a.text).length, 0);

  // 1. The causal chain, act by act.
  for (const a of acts) {
    const ss = sentencesOf(a.text);
    const b = brainAct(a.id);
    const link = (/** @type {RegExp} */ re, /** @type {string | null | undefined} */ said) => ss.some((s) => re.test(s)) || inText(said, a.text);
    if (!link(WHY, b?.why)) add("critique.noWhy", "revise", a.id, [], `Act ${a.id} tells what happened but never why: no sentence gives the cause, the need or the motive. Add the documented reason (from the SOURCE) before the event, in plain words ("because ...", "the reason was ...").`);
    if (!ss.some((s) => !/\?["”’]?$/.test(s) && EVENT.test(s)) && !inText(b?.what, a.text)) add("critique.noEvent", "revise", a.id, [], `Act ${a.id} never says what happened: it has no plain statement of an event. Tell the documented event itself.`);
    if (!link(CONSEQUENCE, b?.consequence)) add("critique.noConsequence", "revise", a.id, [], `Act ${a.id} never says what the events led to. End the act with the documented consequence ("as a result ...", "which meant ...").`);
    for (const g of b?.gaps ?? []) if (inText(g?.sentence, a.text) && g.problem) add("critique.logic", "revise", a.id, [`"${String(g.sentence).slice(0, 140)}": ${String(g.problem).slice(0, 160)}`], `A story editor found a logic gap in act ${a.id}: "${g.sentence}" (${g.problem}). Give the cause or the step that is missing, from the SOURCE, or cut the sentence.`);
  }

  // 2. One central question, asked early and answered by the end.
  const question = acts.length ? centralQuestion(acts, o.question) : null;
  let answer = null;
  if (!question) add("critique.noQuestion", "revise", acts[0]?.id ?? null, [], `The opening never asks the film's central question${o.question ? ` (${o.question})` : ""}. Ask it in plain words within the first minute, as a question.`);
  else {
    answer = answered(acts, question);
    if (!answer.ok && !inText(brain?.answer, acts.at(-1)?.text ?? "")) add("critique.unanswered", "revise", acts.at(-1)?.id ?? null, [question], `The film asks "${question}" but the ending never answers it (${answer.cover}% of its key words come back${answer.causal ? "" : ", and no ending sentence gives a cause"}). The last act must answer it plainly, with the documented cause.`, { question });
  }

  // 3. Facts: every number, name and quote is in the sources. Not in the sources means invented.
  /** @type {Record<string, any>} */
  const factStats = {};
  if (o.sources) {
    const source = o.sources.join("\n\n");
    const nsource = ` ${normalize(source)} `;
    const known = numbersIn(source).map((n) => n.value);
    const knownSet = new Set(known);
    const title = new Set(words(o.title ?? ""));
    for (const a of acts) {
      // Quotes: words in quotation marks must be in a source, word for word.
      const quotes = [...a.text.matchAll(/["“]([^"”]{6,}?)["”]/g)].map((m) => m[1].trim()).filter((q) => words(q).length >= 3);
      const invented = quotes.filter((q) => !nsource.includes(` ${normalize(q)} `));
      if (invented.length) add("critique.inventedQuote", "block", a.id, invented.map((q) => `"${q.slice(0, 120)}"`), `These quotes in act ${a.id} are not in any source, word for word: ${invented.map((q) => `"${q.slice(0, 100)}"`).join("; ")}. Never put words in anyone's mouth: report only what the SOURCE records, in your own words and without quotation marks.`);
      // Numbers: each one the act states is in the sources (a hedged "about forty" may round a source number).
      const bad = inventedNumbersIn(a.text, { known, knownSet }).map((f) => `${f.said} ("${f.sentence.slice(0, 90)}")`);
      if (bad.length) add("critique.inventedNumber", "block", a.id, bad, `These numbers in act ${a.id} are not in the sources: ${bad.slice(0, 8).join("; ")}. Use only numbers the SOURCE gives, or cut the sentence.`);
      // Names: capitalised words inside a sentence that no source has.
      const unknown = new Set();
      const places = new Set();
      for (const s of sentencesOf(a.text)) {
        const ws = s.replace(/["“”‘’]/g, " ").split(/\s+/).filter(Boolean);
        ws.forEach((w, i) => {
          const bare = w.replace(/^[^A-Za-z]+|[^A-Za-z.]+$/g, "").replace(/\.$/, "").replace(/'s$/, "");
          if (i === 0 || !/^[A-Z][A-Za-z.'-]+$/.test(bare)) return;
          const k = bare.toLowerCase();
          if (COMMON_PROPER.has(k) || title.has(k) || nsource.includes(` ${normalize(bare)} `)) return;
          (GEOGRAPHY.has(k) ? places : unknown).add(bare);
        });
      }
      if (unknown.size) add("critique.unsourcedName", "block", a.id, [...unknown], `These names in act ${a.id} are in no source: ${[...unknown].slice(0, 10).join(", ")}. Name only people, firms, places and things the SOURCE names.`);
      if (places.size) add("critique.unsourcedPlace", "revise", a.id, [...places], `These places in act ${a.id} are common geography but in no source: ${[...places].slice(0, 10).join(", ")}. Keep a place only where the SOURCE supports it.`);
    }
    factStats.sourceNumbers = knownSet.size;
  }

  // 4. Padding: passages said twice, sentences that say the same thing, cliches and hedges.
  const repeats = repeatedPassages(acts);
  const twins = nearDuplicates(acts);
  const long = repeats.filter((r) => r.words >= CRITIC_LIMITS.longRepeat);
  if (long.length || repeats.length >= CRITIC_LIMITS.repeatedPassages || twins.length >= CRITIC_LIMITS.nearDuplicates) {
    const items = [...repeats.map((r) => `${r.act}: "${r.text.slice(0, 100)}" (${r.words} words said again)`), ...twins.map((t) => `${t.act}: "${t.b.slice(0, 80)}" repeats "${t.a.slice(0, 80)}"`)];
    add("critique.repetition", "revise", repeats[0]?.act ?? twins[0]?.act ?? null, items, `The script repeats itself: ${items.slice(0, 6).join("; ")}. Cut every repeat and say something new from the SOURCE instead; never restate an earlier part.`);
  }
  const cliches = acts.flatMap((a) => phrasesIn(a.text, CLICHES).map((p) => `${a.id}: ${p}`));
  const hedges = acts.flatMap((a) => phrasesIn(a.text, HEDGES).map((p) => `${a.id}: ${p}`));
  const hedgeRate = totalWords ? (hedges.length * 1000) / totalWords : 0;
  if (cliches.length > CRITIC_LIMITS.cliches || hedgeRate > CRITIC_LIMITS.hedgesPer1000) {
    const items = [...cliches, ...(hedgeRate > CRITIC_LIMITS.hedgesPer1000 ? hedges : [])];
    add("critique.filler", "revise", (cliches[0] ?? hedges[0] ?? "").split(":")[0] || null, items, `Filler a viewer hears as a chatbot: ${items.slice(0, 10).join(", ")}. Replace each with a concrete documented detail, or cut it.`);
  }

  return {
    ok: findings.length === 0,
    findings,
    stats: { acts: acts.length, words: totalWords, question, answer, repeats: repeats.length, nearDuplicates: twins.length, cliches: cliches.length, hedges: hedges.length, brain: Boolean(brain), ...factStats },
  };
}

/**
 * The acts a rewrite must redo, with the notes for each: a finding with no
 * act goes to the first one (the opening) or, for an answer, the last.
 * @param {CriticFinding[]} findings @param {Act[]} acts
 * @returns {Map<string, string[]>}
 */
export function rewriteNotes(findings, acts) {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const f of findings) {
    const id = f.chapter ?? (f.code === "critique.unanswered" ? acts.at(-1)?.id : acts[0]?.id);
    if (!id) continue;
    if (!out.has(id)) out.set(id, []);
    /** @type {string[]} */ (out.get(id)).push(f.note);
  }
  return out;
}

/** The most a deterministic repair may take out of a script before it counts as a failed script. */
export const REPAIR_MAX_SHARE = 0.1;

/**
 * Never stop a film for a fixable line. After the rewrite rounds, code does the rest: a sentence that holds a
 * number no source has is dropped; the second copy of a repeated passage of eight words or more is dropped
 * (official names are not repeats). Questions are never dropped. If more than a tenth of the words would go,
 * nothing is changed and `ok` is false: that script is bad, not fixable.
 * @param {Act[]} acts @param {{ sources: string[] }} o
 * @returns {{ ok: boolean, acts: Act[], removed: { act: string, sentence: string, why: "number" | "repeat" }[], share: number }}
 */
export function repairScript(acts, o) {
  const source = o.sources.join("\n\n");
  const known = numbersIn(source).map((n) => n.value);
  const ctx = { known, knownSet: new Set(known) };
  const n = CRITIC_LIMITS.ngram;
  /** @type {{ act: string, sentence: string, why: "number" | "repeat" }[]} */
  const removed = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const total = acts.reduce((t, a) => t + words(a.text).length, 0);
  const fixed = acts.map((a) => {
    // Sentences are kept or dropped one by one; a paragraph break stays where a sentence before it was kept.
    const paragraphs = String(a.text).split(/\n{2,}/).map((p) => sentencesOf(p).filter((s) => {
      const isQuestion = /\?["”’]?$/.test(s);
      if (!isQuestion && inventedNumbersIn(s, ctx).length) { removed.push({ act: a.id, sentence: s, why: "number" }); return false; }
      if (isQuestion) return true;
      const toks = capsOf(s);
      /** @type {string[]} */
      const grams = [];
      for (let i = 0; i + n <= toks.length; i += 1) {
        const g = toks.slice(i, i + n);
        if (!isNameSpan(g)) grams.push(g.map((x) => x.w).join(" "));
      }
      if (grams.some((g) => seen.has(g))) { removed.push({ act: a.id, sentence: s, why: "repeat" }); return false; }
      for (const g of grams) seen.add(g);
      return true;
    }).join(" ")).filter(Boolean);
    return { ...a, text: paragraphs.join("\n\n") };
  });
  const gone = removed.reduce((t, r) => t + words(r.sentence).length, 0);
  const share = total ? gone / total : 0;
  if (share > REPAIR_MAX_SHARE) return { ok: false, acts, removed: [], share };
  return { ok: true, acts: fixed, removed, share };
}
