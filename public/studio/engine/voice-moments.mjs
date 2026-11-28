// Designed moments for a voice film, found in the words themselves, with no model.
// A voice film whose free brain ran out of tokens still gets its people named, its big numbers counted, its dates and
// places set in type, its quotes carded and a title: the graphics are drawn from what the narrator says, spelled exactly
// as the words are spelled. Nothing is invented (no role under a name, no number the voice did not say).
//
// Pure: timed words in, a plan out. render/render-film.mjs draws the plan as overlays on the existing pictures
// (render/graphics/templates.mjs, the "compact" look) and records each moment on its shot (video[].moment), which is
// what render/critic.mjs counts as a designed moment.

/** @typedef {{ text: string, start: number, end: number }} Word */
/** @typedef {"lowerThird" | "counter" | "date" | "place" | "quote" | "title"} MomentKind */
/** @typedef {{ id: string, kind: MomentKind, template: "lowerThird" | "counter" | "kinetic" | "quote" | "chapter", data: any, at: number, seconds: number, sentence: number, tier: "A" | "B", source: string }} Moment */

/** The pacing rules (docs: the owner's house style, 1.2 designed moments a minute at least). */
export const PACE = Object.freeze({
  /** The film should carry at least this many a minute where its words allow. */
  perMinute: 1.4,
  /** One in the first 30 s, the title by 40 s. */
  first: 30,
  titleBy: 40,
  /** Never two starts closer than this (and never closer than the one before is long). */
  gap: 4,
  /** Seconds a moment stays on, by template. */
  seconds: Object.freeze({ lowerThird: 3.6, counter: 3.4, kinetic: 3.2, quote: 5, chapter: 3.6 }),
  /** A moment starts this long before the word it is about, so the graphic lands as the word is said. */
  lead: 0.2,
  /** Shortest a moment may be shown after it is fitted to a shot. */
  least: 2.2,
});

/** Captions sit in the bottom fifth of the picture: nothing designed is drawn lower than this (share of the height). */
export const SAFE = Object.freeze({ bottom: 0.2 });

const STOP = new Set(("the a an and but or so then now it its this that these those there here he she they we you i his her their our your my " +
  "at on in of to from by for with as if when while after before during since until because although though however " +
  "today tomorrow yesterday later earlier meanwhile suddenly finally first second third next last one two three four five six seven eight nine ten " +
  "yes no not what who whom whose which why how where is was are were be been being has have had do did does will would could should can may might must " +
  "once just still even only also again soon back every each all some many most more few both either neither another other such").split(" "));
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const NOT_NAME = new Set([...MONTHS, ...DAYS, "english", "french", "german", "spanish", "russian", "chinese", "japanese", "american", "british", "soviet", "european", "african", "asian", "roman", "greek", "christmas", "easter", "god", "earth", "moon", "sun", "mars", "internet"]);
/** A capitalised phrase with one of these words is a place, a thing or an organisation, never a person. */
const PLACE_WORDS = new Set(("cape mount mountain mountains lake river island islands bay sea ocean gulf strait county city town village bridge canal dam tower station harbour harbor port " +
  "valley desert forest park street road avenue square plant mine tunnel airport canyon coast beach state kingdom empire republic").split(" "));
const THING_WORDS = new Set(("space center centre agency administration company corporation program programme mission railway railroad university institute college school " +
  "hospital museum bank army navy force committee council court department ministry party church cathedral palace castle wall war battle treaty act project plan " +
  "pacific atlantic arctic antarctic north south east west new old great saint").split(" "));
const PLACE_PREP = new Set(["in", "at", "from", "near", "to", "over", "across", "outside", "inside", "around", "toward", "towards", "into", "through", "beyond", "above", "beneath"]);
const SIGNS = /[“"‘]/;
const CLOSERS = /[”"’]$/;

/** @param {string} w */
const bare = (w) => String(w ?? "").replace(/^[“"‘'(\[]+|[”"’'),;:.!?\]]+$/g, "");
/** A word that ends its clause (a comma, a full stop) so a phrase does not run on past it. @param {string} w */
const breaks = (w) => /[,;:.!?—–]["”’')]*$/.test(w) || /^[—–-]+$/.test(w);
/** @param {string} w */
const isCap = (w) => /^[A-Z][a-z]+(?:['’-][A-Za-z]+)?$/.test(bare(w));
/** @param {string} w */
const low = (w) => bare(w).toLowerCase();

const ONES = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };

/**
 * A number said in words ("four hundred thousand", "two point three million", "3.5 million", "400,000"), read from
 * words[i...]. Null when words[i] does not begin one. `used` is how many words it took.
 * @param {Word[]} ws @param {number} i
 * @returns {{ value: number, used: number, digits: boolean } | null}
 */
function numberAt(ws, i) {
  const first = bare(ws[i].text);
  if (/^\$?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(first) || /^\$?\d+(?:\.\d+)?$/.test(first)) {
    let value = Number(first.replace(/[$,]/g, ""));
    let used = 1;
    const scale = SCALE[/** @type {keyof typeof SCALE} */ (low(ws[i + 1]?.text ?? ""))];
    if (scale) { value *= scale; used = 2; }
    return { value: Math.round(value * 100) / 100, used, digits: true };
  }
  // Number words: [ones|tens [ones]] [hundred] [scale] ..., at most 12 words.
  let total = 0, chunk = 0, used = 0, saw = false;
  for (let k = i; k < Math.min(ws.length, i + 12); k += 1) {
    const w = low(ws[k].text);
    if (w === "and" && saw && k + 1 < ws.length && (w in ONES || low(ws[k + 1].text) in ONES || low(ws[k + 1].text) in TENS)) { used += 1; continue; }
    if (w in ONES) { chunk += ONES[/** @type {keyof typeof ONES} */ (w)]; saw = true; used = k - i + 1; }
    else if (w in TENS) { chunk += TENS[/** @type {keyof typeof TENS} */ (w)]; saw = true; used = k - i + 1; }
    else if (w === "hundred" && saw) { chunk = (chunk || 1) * 100; used = k - i + 1; }
    else if (w in SCALE && saw) { total += (chunk || 1) * SCALE[/** @type {keyof typeof SCALE} */ (w)]; chunk = 0; used = k - i + 1; }
    else break;
    if (breaks(ws[k].text)) break;
  }
  if (!saw) return null;
  // "two point three million"
  return { value: total + chunk, used, digits: false };
}

/**
 * Sentences by word index: a word ending in . ! ? closes its sentence.
 * @param {Word[]} ws @returns {number[]} the sentence number of each word
 */
function sentencesOf(ws) {
  let s = 0;
  return ws.map((w) => { const mine = s; if (/[.!?]["”’')]*$/.test(w.text) && !/^(?:Mr|Mrs|Ms|Dr|St|No|U\.S|a\.m|p\.m)\.$/i.test(w.text)) s += 1; return mine; });
}

/** @param {Word[]} ws @param {number} i @param {number[]} sent */
const sentenceStart = (ws, i, sent) => i === 0 || sent[i - 1] !== sent[i];

/**
 * Candidates in every kind, in word order, before any pacing. Each has `at` (the word's time), the exact words, a
 * priority (higher wins a clash) and a tier (A: always worth a graphic; B: only to reach the pace).
 * @param {Word[]} ws
 */
export function findCandidates(ws) {
  const sent = sentencesOf(ws);
  /** @type {any[]} */
  const out = [];
  const taken = new Set(); // word indexes already inside a candidate
  const span = (/** @type {number} */ a, /** @type {number} */ b) => ws.slice(a, b + 1).map((w) => bare(w.text)).join(" ");
  const claim = (/** @type {number} */ a, /** @type {number} */ b) => { for (let k = a; k <= b; k += 1) taken.add(k); };
  const free = (/** @type {number} */ a, /** @type {number} */ b) => { for (let k = a; k <= b; k += 1) if (taken.has(k)) return false; return true; };

  // 1. Quotes: “ ... ” inside one stretch of at most 40 words.
  for (let i = 0; i < ws.length; i += 1) {
    if (!SIGNS.test(ws[i].text[0] ?? "")) continue;
    for (let j = i; j < Math.min(ws.length, i + 40); j += 1) {
      if (CLOSERS.test(ws[j].text.replace(/[.,!?]+(?=["”’]$)/, "")) || /[”"]$/.test(ws[j].text)) {
        const text = ws.slice(i, j + 1).map((w) => w.text).join(" ").replace(/^[“"‘]+|[”"’]+$/g, "").trim();
        if (j - i >= 4 && free(i, j)) {
          const by = /^(?:said|says|wrote|replied|declared)$/i.test(bare(ws[j + 1]?.text ?? "")) && isCap(ws[j + 2]?.text ?? "") ? span(j + 2, isCap(ws[j + 3]?.text ?? "") ? j + 3 : j + 2) : "";
          out.push({ kind: "quote", at: ws[i].start, i, j, sentence: sent[i], priority: 90, tier: "A", data: { quote: text, ...(by ? { by } : {}) } });
          claim(i, j);
        }
        break;
      }
    }
  }

  // 2. Numbers: counts of a thousand or more, money, percent.
  for (let i = 0; i < ws.length; i += 1) {
    if (taken.has(i)) continue;
    const n = numberAt(ws, i);
    if (!n) continue;
    const j = i + n.used - 1;
    const next = low(ws[j + 1]?.text ?? ""), next2 = low(ws[j + 2]?.text ?? "");
    const percent = /%$/.test(ws[j].text) || next === "percent" || next === "per" && next2 === "cent";
    const money = /^\$/.test(bare(ws[i].text)) || /^(?:dollars?|pounds?|euros?|rupees?|yen|francs?)$/.test(next);
    const year = n.digits && n.used === 1 && /^\d{4}$/.test(bare(ws[i].text)) && n.value >= 1100 && n.value <= 2100 && !percent && !money;
    // A year is a date, not a count; a count is a thousand or more, money or a percent (whole).
    if (year) continue;
    if (!(n.value >= 1000 || (money && n.value >= 100) || (percent && Number.isInteger(n.value) && n.value >= 1))) continue;
    if (!Number.isInteger(n.value)) continue; // a fraction cannot be counted up; the date and kinetic paths do not cover it either
    if (!free(i, j)) continue;
    // The unit is what the voice says next (people, dollars, percent): up to two words, never past a break.
    /** @type {string[]} */
    const after = [];
    let end = j;
    if (percent) { after.push("percent"); end = /%$/.test(ws[j].text) ? j : next === "per" ? j + 2 : j + 1; }
    else if (money) { after.push(/^\$/.test(bare(ws[i].text)) ? "dollars" : bare(ws[j + 1].text)); end = /^\$/.test(bare(ws[i].text)) ? j : j + 1; }
    else {
      for (let k = j + 1; k < Math.min(ws.length, j + 3); k += 1) {
        if (breaks(ws[k - 1].text) || STOP.has(low(ws[k].text)) || /^\d/.test(bare(ws[k].text))) break;
        after.push(bare(ws[k].text)); end = k;
        if (breaks(ws[k].text)) break;
      }
    }
    // What comes before it in the same sentence (muted above the number): at most four words, no dangling article.
    /** @type {string[]} */
    const before = [];
    for (let k = i - 1; k >= 0 && before.length < 4 && sent[k] === sent[i] && !(breaks(ws[k].text) && before.length); k -= 1) before.unshift(bare(ws[k].text));
    while (before.length && STOP.has(low(before[0])) && /^(?:and|but|so|or|the|a|an)$/i.test(before[0])) before.shift();
    const lead = before.join(" ");
    out.push({ kind: "counter", at: ws[i].start, i, j: end, sentence: sent[i], priority: 80, tier: "A", data: { ...(lead ? { before: lead } : {}), value: n.value, ...(after.length ? { after: after.join(" ") } : {}) } });
    claim(i, end);
  }

  // 3. People: runs of capitalised words (2-3), the leading stop words trimmed off, never a place or a thing.
  for (let i = 0; i < ws.length; i += 1) {
    if (taken.has(i) || !isCap(ws[i].text)) continue;
    let j = i;
    while (j + 1 < ws.length && j - i < 3 && isCap(ws[j + 1].text) && !breaks(ws[j].text) && !taken.has(j + 1)) j += 1;
    let a = i;
    while (a <= j && (STOP.has(low(ws[a].text)) || NOT_NAME.has(low(ws[a].text)))) a += 1;
    if (j - a < 1) { i = j; continue; } // one capitalised word alone is not a name here
    const words = ws.slice(a, j + 1).map((w) => low(w.text));
    const placey = words.some((w) => PLACE_WORDS.has(w) || THING_WORDS.has(w));
    const named = words.some((w) => NOT_NAME.has(w) || STOP.has(w));
    if (!placey && !named && free(a, j) && words.length <= 3) {
      out.push({ kind: "lowerThird", at: ws[a].start, i: a, j, sentence: sent[a], priority: 60, tier: "A", data: { name: span(a, j) }, key: words.join(" ") });
      claim(a, j);
    }
    i = j;
  }

  // 4. Dates and times: "9:32", "July sixteenth, 1969", "in 1969"; the whole phrase as spoken.
  for (let i = 0; i < ws.length; i += 1) {
    const w = bare(ws[i].text);
    const isTime = /^\d{1,2}:\d{2}$/.test(w);
    const isMonth = MONTHS.includes(low(ws[i].text)) && (isCap(ws[i].text) || isTime);
    const isYear = /^(?:1[1-9]|20)\d\d$/.test(w) && !(low(ws[i + 1]?.text ?? "") === "people") && !percentNeighbour(ws, i);
    if (!(isTime || isMonth || isYear) || taken.has(i)) continue;
    // Grow over neighbouring date words in the same clause: time, month, day, year (and the few words between).
    let a = i, b = i;
    const dateish = (/** @type {number} */ k) => { const x = bare(ws[k].text); const l = x.toLowerCase(); return /^\d{1,2}:\d{2}$/.test(x) || /^(?:1[1-9]|20)\d\d$/.test(x) || MONTHS.includes(l) || /^(?:\d{1,2}(?:st|nd|rd|th)?|[a-z]+(?:th|st|nd|rd))$/.test(l) && k > 0 && (MONTHS.includes(low(ws[k - 1].text)) || /^\d{1,2}:\d{2}$/.test(bare(ws[k - 1].text))) || /^a\.?m\.?$|^p\.?m\.?$/i.test(x); };
    for (let k = i + 1; k < Math.min(ws.length, i + 8) && sent[k] === sent[i]; k += 1) { if (dateish(k)) b = k; if (breaks(ws[k - 1].text) && !dateish(k)) break; }
    for (let k = i - 1; k >= Math.max(0, i - 6) && sent[k] === sent[i] && !breaks(ws[k].text); k -= 1) if (dateish(k)) a = k;
    if (!free(a, b)) continue;
    const text = span(a, b);
    const accent = bare(ws[a].text);
    const strong = /\d{1,2}:\d{2}/.test(text) || b > a || isMonth;
    out.push({ kind: "date", at: ws[a].start, i: a, j: b, sentence: sent[a], priority: strong ? 50 : 20, tier: strong ? "A" : "B", data: { text, accent } });
    claim(a, b);
    i = b;
  }

  // 5. Places: a capitalised place phrase ("Cape Kennedy, Florida"), or a lone capitalised word after a place preposition.
  for (let i = 0; i < ws.length; i += 1) {
    if (taken.has(i) || !isCap(ws[i].text)) continue;
    const w = low(ws[i].text);
    if (STOP.has(w) || NOT_NAME.has(w)) continue;
    const prev = low(ws[i - 1]?.text ?? "");
    const prevCap = i > 0 && isCap(ws[i - 1].text) && !breaks(ws[i - 1].text);
    const keyword = PLACE_WORDS.has(w) || (i + 1 < ws.length && isCap(ws[i + 1].text) && (PLACE_WORDS.has(low(ws[i + 1].text)) || THING_WORDS.has(low(ws[i + 1].text))));
    if (!(PLACE_PREP.has(prev) || keyword) || prevCap) continue;
    let j = i;
    while (j + 1 < ws.length && j - i < 3 && isCap(ws[j + 1].text) && !STOP.has(low(ws[j + 1].text)) && !NOT_NAME.has(low(ws[j + 1].text)) && (!breaks(ws[j].text) || /,$/.test(ws[j].text))) { j += 1; if (/,$/.test(ws[j - 1].text) && j - i >= 3) break; }
    if (!free(i, j)) continue;
    out.push({ kind: "place", at: ws[i].start, i, j, sentence: sent[i], priority: keyword ? 40 : 15, tier: keyword ? "A" : "B", data: { text: span(i, j), accent: bare(ws[i].text) } });
    claim(i, j);
    i = j;
  }

  // 6. Relative time: "four days later", the weakest of all.
  for (let i = 0; i + 2 < ws.length; i += 1) {
    const n = numberAt(ws, i);
    if (!n || n.value > 99) continue;
    const j = i + n.used;
    if (/^(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|decades?)$/.test(low(ws[j]?.text ?? "")) && /^(?:later|earlier|before|ago)$/.test(low(ws[j + 1]?.text ?? "")) && free(i, j + 1)) {
      out.push({ kind: "date", at: ws[i].start, i, j: j + 1, sentence: sent[i], priority: 10, tier: "B", data: { text: span(i, j + 1), accent: bare(ws[i].text) } });
      claim(i, j + 1);
    }
  }

  return out.sort((x, y) => x.at - y.at);
}

/** @param {Word[]} ws @param {number} i a year next to "percent" is a number, not a date */
function percentNeighbour(ws, i) { return /^(?:percent|%)$/.test(low(ws[i + 1]?.text ?? "")); }

/**
 * The film's subject for a title card: the topic the user typed, else the name said most often as "Word 11" or a
 * capitalised pair (two mentions at least). Null when the words name none.
 * @param {Word[]} ws @param {string} [topic]
 */
export function subjectOf(ws, topic = "") {
  const t = String(topic ?? "").replace(/\s+/g, " ").trim();
  if (t) {
    // "Apollo 11: the first steps on the Moon" -> the card shows the part before the colon or dash when it is short enough.
    const head = t.split(/\s[-–—:|]\s|:\s/)[0].trim();
    return (t.length > 44 && head.length >= 4 ? head : t).slice(0, 60);
  }
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (let i = 0; i < ws.length; i += 1) {
    if (!isCap(ws[i].text) || STOP.has(low(ws[i].text)) || NOT_NAME.has(low(ws[i].text))) continue;
    const n = bare(ws[i + 1]?.text ?? "");
    if (/^\d{1,3}$/.test(n) && !breaks(ws[i].text)) { const k = `${bare(ws[i].text)} ${n}`; counts.set(k, (counts.get(k) ?? 0) + 1); }
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
  return best && best[1] >= 1 ? best[0] : null;
}

/** @param {any} c */
function templateOf(c) {
  switch (c.kind) {
    case "lowerThird": return /** @type {const} */ ("lowerThird");
    case "counter": return /** @type {const} */ ("counter");
    case "quote": return /** @type {const} */ ("quote");
    case "title": return /** @type {const} */ ("chapter");
    default: return /** @type {const} */ ("kinetic");
  }
}

/**
 * The designed look over footage: calm, a scrim for legibility, kept out of the caption safe area, set on the left
 * (lower thirds above the captions, numbers and lines in the upper half).
 * @param {any} c
 */
function dataOf(c) {
  const d = { ...c.data, compact: true };
  if (c.kind === "lowerThird") return { ...d, lift: SAFE.bottom * 100 + 4 };
  return d;
}

/**
 * Plan the moments of a voice film.
 * @param {{ words: Word[], duration?: number, topic?: string, existing?: { start: number, end?: number }[], hasTitle?: boolean }} o
 *   existing: the designed moments the brain already planned (their start and end seconds): they are kept and the plan fills the gaps.
 * @returns {{ moments: Moment[], skipped: { kind: string, text: string, at: number, why: string }[], stats: { perMinute: number, first30: number, subject: string | null, candidates: number } }}
 */
export function planMoments(o) {
  const ws = (o.words ?? []).filter((w) => w && typeof w.text === "string" && Number.isFinite(Number(w.start))).map((w) => ({ text: String(w.text), start: Number(w.start), end: Number(w.end ?? w.start) }));
  const film = Math.max(Number(o.duration) || 0, ws.length ? ws[ws.length - 1].end : 0);
  const minutes = Math.max(film / 60, 1e-9);
  /** @type {{ kind: string, text: string, at: number, why: string }[]} */
  const skipped = [];
  if (!ws.length || film < 8) return { moments: [], skipped, stats: { perMinute: 0, first30: 0, subject: null, candidates: 0 } };

  const existing = (o.existing ?? []).map((e) => ({ start: Number(e.start), end: Number(e.end ?? Number(e.start) + 3) })).filter((e) => Number.isFinite(e.start)).sort((a, b) => a.start - b.start);
  const all = findCandidates(ws);

  // A person is named at the first mention; one the spacing could not carry is named again at the next mention of their surname.
  /** @type {any[]} */
  const cands = [];
  const seenPeople = new Set();
  for (const c of all) {
    if (c.kind === "lowerThird") { if (seenPeople.has(c.key)) continue; seenPeople.add(c.key); }
    cands.push(c);
  }
  for (const c of all.filter((x) => x.kind === "lowerThird")) {
    const surname = c.key.split(" ").slice(-1)[0];
    for (let k = c.j + 1; k < ws.length; k += 1) {
      if (low(ws[k].text) === surname && isCap(ws[k].text) && !cands.some((x) => x.i <= k && x.j >= k)) { cands.push({ ...c, at: ws[k].start, i: k, j: k, sentence: sentencesOf(ws)[k], priority: c.priority - 5, retry: true }); }
    }
  }
  cands.sort((x, y) => x.at - y.at);

  /** How long a candidate stays on, and the room it needs before the next one starts. */
  const lenOf = (/** @type {any} */ c) => c.kind === "quote" ? Math.min(PACE.seconds.quote, Math.max(3.2, (ws[c.j].end - ws[c.i].start) + 0.8)) : PACE.seconds[templateOf(c)] ?? 3.4;
  const startOf = (/** @type {any} */ c) => Math.max(0, c.at - PACE.lead);

  /** @type {any[]} */
  const picked = [];
  /** @param {any} c @param {any[]} among */
  const fits = (c, among) => {
    const s = startOf(c), e = s + lenOf(c);
    if (s < 0.2 || e > film - 0.4) return false;
    for (const p of among) {
      const ps = startOf(p), room = Math.max(PACE.gap, lenOf(p) + 0.4), mine = Math.max(PACE.gap, lenOf(c) + 0.4);
      if (s >= ps ? s < ps + room : ps < s + mine) return false;
    }
    for (const x of existing) { if (s < x.end + 0.4 && e > x.start - 0.4) return false; if (Math.abs(s - x.start) < PACE.gap) return false; }
    return true;
  };
  const usedSentences = new Set();
  /** @param {any} c */
  const take = (c) => { picked.push(c); usedSentences.add(c.sentence); };

  // Tier A first: strongest first, so a clash keeps the stronger moment (a quote over a name over a date over a place).
  const byStrength = [...cands].filter((c) => c.tier === "A").sort((x, y) => y.priority - x.priority || x.at - y.at);
  for (const c of byStrength) {
    if (usedSentences.has(c.sentence)) { skipped.push({ kind: c.kind, text: textOf(c), at: c.at, why: "another moment already covers this sentence" }); continue; }
    if (c.retry && picked.some((p) => p.kind === "lowerThird" && p.data.name === c.data.name)) continue;
    if (!fits(c, picked)) { skipped.push({ kind: c.kind, text: textOf(c), at: c.at, why: "too close to another moment" }); continue; }
    take(c);
  }

  // The pace: below it, or nothing in the first 30 s, the weaker tier B candidates fill the gaps.
  const count = () => picked.length + existing.length;
  const firstCount = () => picked.filter((p) => startOf(p) < PACE.first).length + existing.filter((e) => e.start < PACE.first).length;
  for (const c of cands.filter((x) => x.tier === "B").sort((x, y) => y.priority - x.priority || x.at - y.at)) {
    const need = count() / minutes < PACE.perMinute || firstCount() < 1 && startOf(c) < PACE.first;
    if (!need) break;
    if (usedSentences.has(c.sentence) || !fits(c, picked)) continue;
    take(c);
  }

  // The title card by 40 s, from the topic or the found subject: in the first gap that holds it, else it takes the place of the weakest moment before 40 s.
  const subject = subjectOf(ws, o.topic);
  /** @type {any | null} */
  let title = null;
  if (subject && !o.hasTitle) {
    const t = { kind: "title", at: 0, i: -1, j: -1, sentence: -1, priority: 70, tier: "A", data: { title: subject }, len: PACE.seconds.chapter };
    const slot = (/** @type {any[]} */ among) => {
      const limit = Math.min(PACE.titleBy, film) - PACE.seconds.chapter;
      const starts = [0.4, ...among.flatMap((p) => [startOf(p) + Math.max(PACE.gap, lenOf(p) + 0.4)]), ...existing.map((e) => e.end + 0.4)].filter((s) => s <= limit).sort((a, b) => a - b);
      for (const s of starts) { const c = { ...t, at: s + PACE.lead }; if (fits(c, among)) return c; }
      return null;
    };
    title = slot(picked);
    if (!title) {
      const weakest = picked.filter((p) => startOf(p) < PACE.titleBy).sort((a, b) => a.priority - b.priority)[0];
      if (weakest) {
        const rest = picked.filter((p) => p !== weakest);
        title = slot(rest);
        if (title) { picked.splice(picked.indexOf(weakest), 1); skipped.push({ kind: weakest.kind, text: textOf(weakest), at: weakest.at, why: "the title card took its place" }); }
      }
    }
    if (title) picked.push(title);
  }

  picked.sort((a, b) => startOf(a) - startOf(b));
  /** @type {Moment[]} */
  const moments = picked.map((c, k) => ({ id: `M${String(k + 1).padStart(3, "0")}`, kind: /** @type {MomentKind} */ (c.kind), template: templateOf(c), data: dataOf(c), at: Math.round(startOf(c) * 100) / 100, seconds: Math.min(lenOf(c), Math.max(PACE.least, film - startOf(c) - 0.2)), sentence: c.sentence, tier: c.tier, source: c.kind === "title" ? (o.topic ? "topic" : "found subject") : "words" }));
  return { moments, skipped, stats: { perMinute: Math.round(((moments.length + existing.length) / minutes) * 100) / 100, first30: moments.filter((m) => m.at < PACE.first).length + existing.filter((e) => e.start < PACE.first).length, subject: subject ?? null, candidates: cands.length } };
}

/** @param {any} c */
function textOf(c) { return c.data.name ?? c.data.text ?? c.data.title ?? c.data.quote ?? `${c.data.before ?? ""} ${c.data.value ?? ""} ${c.data.after ?? ""}`.trim(); }

/**
 * Put the plan on the film's pictures. Each moment goes on the clip it falls in (video[].moment, which the renderer
 * draws and the critic counts); a moment that lands on a card, or that cannot be shown for PACE.least seconds inside its
 * shot, is dropped and said so. One moment to a shot.
 * @param {any[]} video the timeline's shots @param {Moment[]} moments
 * @returns {{ placed: { id: string, shot: string, kind: string, at: number, seconds: number }[], dropped: { id: string, kind: string, why: string }[] }}
 */
export function attachMoments(video, moments) {
  /** @type {any[]} */ const placed = [];
  /** @type {any[]} */ const dropped = [];
  const lastEnd = () => (placed.length ? placed[placed.length - 1].at + Math.max(PACE.gap, placed[placed.length - 1].seconds + 0.4) : -Infinity);
  const live = video.filter((v) => v.type !== "black");
  /** The shot's room for a moment starting at `at`: where it may start and how long it can stay, or null. @param {any} shot @param {number} at @param {number} want */
  const room = (shot, at, want) => {
    if (shot.type !== "clip" || shot.moment) return null;
    const left = Number(shot.end) - 0.15 - at;
    let from = at, seconds = Math.min(want, left);
    // A moment that would run past the cut starts earlier (a second at most), else it waits for the next shot.
    if (left < want) { const moved = Math.max(Number(shot.start) + 0.05, at - Math.min(1.2, want - left)); from = moved; seconds = Math.min(want, Number(shot.end) - 0.15 - from); }
    return seconds >= PACE.least && from >= lastEnd() - 1e-6 ? { at: from, seconds } : null;
  };
  for (const m of moments) {
    const shot = live.find((v) => Number(v.start) <= m.at + 1e-6 && m.at < Number(v.end) - 1e-6);
    if (!shot) { dropped.push({ id: m.id, kind: m.kind, why: "no picture at that time" }); continue; }
    if (shot.type !== "clip") { dropped.push({ id: m.id, kind: m.kind, why: "the shot is already a designed card" }); continue; }
    // Where it starts: in its own shot, or at the cut of the next one when that is within a second and a half.
    const next = live[live.indexOf(shot) + 1];
    const fit = room(shot, m.at, m.seconds) ?? (next && Number(next.start) - m.at <= 1.6 ? room(next, Number(next.start) + 0.05, m.seconds) : null);
    const into = fit && (room(shot, m.at, m.seconds) ? shot : next);
    if (!fit || !into) { dropped.push({ id: m.id, kind: m.kind, why: shot.moment ? "the shot already carries a moment" : "the shot is too short to show it" }); continue; }
    const at = Math.round(fit.at * 100) / 100, seconds = Math.round(fit.seconds * 100) / 100;
    into.moment = { id: m.id, kind: m.kind, template: m.template, data: m.data, at, seconds };
    placed.push({ id: m.id, shot: into.id, kind: m.kind, at, seconds });
  }
  return { placed, dropped };
}

/**
 * The soft sound under each placed moment (a click for type, a whoosh for the title), as timeline sfx entries.
 * @param {{ id: string, kind: string, at: number }[]} placed
 */
export function momentSounds(placed) {
  return placed.map((p) => {
    const token = p.kind === "title" ? "AUTO-WHOOSH" : "AUTO-CLICK";
    return { token, kind: "hit", scene: "moments", start: p.at, end: Math.round((p.at + (token === "AUTO-WHOOSH" ? 0.55 : 0.18)) * 1000) / 1000 };
  });
}
