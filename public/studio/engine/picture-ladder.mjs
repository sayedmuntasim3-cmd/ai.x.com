/**
 * The query ladder for one shot (pure, browser + Node).
 *
 * Audit of film ccd86532 (docs/PICTURE_SUPPLY_AUDIT.md): the shot plan wrote bare keywords as queries
 * ("thin", "weight", "sang", "era"), so Pixabay answered with fog over a Finnish river and the archives with
 * nothing, and 214 of 556 shots became text cards. The film's subject was nowhere in the query.
 *
 * The ladder, most specific first:
 *   1. the shot's own queries, each anchored with the film's subject when it is a bare word
 *   2. the subject itself ("Tacoma Narrows Bridge"), with the era when known
 *   3. the engineering category of the subject ("suspension bridge collapse")
 *   4. the era with the category ("1940s suspension bridge")
 */

/** @type {[RegExp, string[]][]} */
const CATEGORIES = [
  [/\b(?:bridge|viaduct|suspension)\b/i, ["suspension bridge", "bridge collapse", "bridge construction"]],
  [/\b(?:dams?|reservoir|levee|spillway)\b/i, ["dam construction", "dam failure", "spillway flood"]],
  [/\b(?:tunnel|subway|metro)\b/i, ["tunnel construction", "tunnel boring"]],
  [/\b(?:canal|locks?|panama|suez)\b/i, ["canal construction", "ship canal locks"]],
  [/\b(?:railway|railroad|train)\b/i, ["railroad construction", "locomotive"]],
  [/\b(?:skyscraper|tower|building)\b/i, ["skyscraper construction", "steel frame building"]],
  [/\b(?:nuclear|reactor|chernobyl|power plant)\b/i, ["nuclear power plant", "reactor building"]],
  [/\b(?:refinery|oil|pipeline|rig)\b/i, ["oil refinery", "pipeline construction"]],
  [/\b(?:space|rocket|shuttle|apollo|challenger)\b/i, ["rocket launch", "spacecraft"]],
  [/\b(?:ship|titanic|vessel)\b/i, ["ocean liner", "shipyard"]]
];
const THING = /\b(bridge|dam|tunnel|canal|tower|reservoir|railway|railroad|station|plant|reactor|building|ship|rocket|shuttle|mine|pipeline|levee|viaduct)\b/i;
const FILLER = /^(the|a|an|how|why|what|when|story|of|and|in|on|at|to|from|with|fall|rise|collapse|failure|disaster|history|true|untold|inside|behind)$/i;

/**
 * The film's subject out of its title: the capitalised run that holds a thing word ("Galloping Gertie: the fall
 * of the Tacoma Narrows Bridge" -> "Tacoma Narrows Bridge"), else the part after ":" or the whole title.
 * No title (a voice film with no topic typed): the subject comes from what is said, see subjectFromTranscript.
 * @param {string} topic @param {string} [transcript]
 */
export function subjectOf(topic, transcript = "") {
  const t = String(topic ?? "").trim();
  if (!t) return subjectFromTranscript(transcript);
  const words = t.split(/\s+/);
  for (let i = 0; i < words.length; i += 1) {
    if (!THING.test(words[i] ?? "")) continue;
    let from = i;
    while (from > 0 && /^\p{Lu}/u.test(words[from - 1] ?? "") && !FILLER.test(words[from - 1] ?? "")) from -= 1;
    const phrase = words.slice(from, i + 1).map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, "")).filter(Boolean);
    if (phrase.length >= 2) return phrase.join(" ");
  }
  const cut = /:|\s[-–—]\s/.exec(t);
  const tail = cut ? t.slice(cut.index + cut[0].length).trim() : t;
  return tail.split(/\s+/).filter((w) => !FILLER.test(w)).slice(0, 4).join(" ").replace(/[^\p{L}\p{N}'\s-]/gu, "").trim();
}

/** Events and things a transcript names by their people, places or craft rather than by their own name. At least `need` of `words` must be said. */
const KNOWN_SUBJECTS = [
  { subject: "Apollo 11", words: /\b(?:apollo|armstrong|aldrin|collins|cape kennedy|saturn v|tranquility|columbia|eagle)\b/gi, need: 2, also: /\b(?:apollo|armstrong|aldrin|moon|lunar|saturn|cape (?:kennedy|canaveral))\b/i },
  { subject: "Titanic", words: /\b(?:titanic|iceberg|white star line|southampton|smith|ismay)\b/gi, need: 2, also: /\b(?:titanic|iceberg)\b/i },
  { subject: "Chernobyl", words: /\b(?:chernobyl|pripyat|reactor|rbmk)\b/gi, need: 2, also: /\bchernobyl|pripyat\b/i }
];

/** Words that may start a sentence or stand alone without naming anything. */
const SMALL = new Set(("the a an and but or so then it its he she they we you i this that these those there here in on at to of for from with by as is was were be been are not no yes if when while after before once now today tonight tomorrow yesterday one two three four five six seven eight nine ten eleven twelve first second third last next what which who whom whose how why where moment question family time day year years ").split(" ").filter(Boolean));
/** @param {string} w */
const small = (w) => SMALL.has(w.toLowerCase());

/**
 * The subject of a film from what is said in it, with no model: a known event when its people and places are named,
 * else the names and places that come back (capitalised runs that are not small words) and the year, in six words or fewer.
 * "" when nothing in the text is a name (the caller may then ask a model).
 * @param {string} text
 */
export function subjectFromTranscript(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  for (const k of KNOWN_SUBJECTS) {
    const hits = new Set((t.match(k.words) ?? []).map((w) => w.toLowerCase()));
    if (hits.size >= k.need && k.also.test(t)) return k.subject;
  }
  /** @type {Map<string, { n: number, at: number }>} */
  const runs = new Map();
  for (const m of t.matchAll(/\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*)*/gu)) {
    const words = m[0].split(/\s+/);
    // A sentence's first word is capitalised by grammar, not because it names anything.
    const starts = m.index === 0 || /[.!?]\s*$/.test(t.slice(0, m.index));
    while (words.length && small(words[0].replace(/[^\p{L}]/gu, "")) && (starts || words.length > 1)) words.shift();
    if (!words.length || (words.length === 1 && small(words[0]))) continue;
    const name = words.join(" ");
    const seen = runs.get(name);
    runs.set(name, { n: (seen?.n ?? 0) + 1, at: seen?.at ?? m.index });
  }
  const ranked = [...runs.entries()].sort((a, b) => b[1].n - a[1].n || a[1].at - b[1].at);
  /** @type {string[]} */
  const out = [];
  let count = 0;
  for (const [name] of ranked) {
    const n = name.split(" ").length;
    if (count + n > 5) continue;
    out.push(name); count += n;
  }
  const year = /\b(1[5-9]\d\d|20[0-2]\d)\b/.exec(t)?.[1];
  if (year && count < 6) out.push(year);
  return out.join(" ").trim();
}

/** The reply of a model asked for "the subject in 6 words or fewer", or "" when it is not one. @param {string} reply */
export function cleanSubject(reply) {
  const line = String(reply ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const s = line.replace(/^(?:the )?subject(?: of the film)?\s*[:\-–]\s*/i, "").replace(/^["'“”‘’`*]+|["'“”‘’`*.]+$/g, "").trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 6 || /\b(?:unknown|none|n\/a|unclear|cannot|can't|sorry)\b/i.test(s)) return "";
  return s;
}

/**
 * A query that is one common word, a number or a function word on its own ("eight", "clock", "question", "the"): an archive
 * answers it with whatever the word names (a clock, a dog, a door), so it is never sent alone. A single capitalised name is not common.
 * @param {string} q
 */
export function isBareCommon(q) {
  const tokens = String(q ?? "").trim().split(/\s+/).filter(Boolean).filter((w) => !SMALL.has(w.toLowerCase()) || /^\d+$/.test(w));
  if (!tokens.length) return true;
  if (tokens.length > 1) return false;
  const w = tokens[0].replace(/[^\p{L}\p{N}'’-]/gu, "");
  return !w || /^\d+$/.test(w) || /^\p{Ll}/u.test(w);
}

/** Engineering categories that fit the subject (and the text of the shot). @param {string} text */
export function categoriesOf(text) {
  return CATEGORIES.filter(([re]) => re.test(text)).flatMap(([, list]) => list);
}

/** The decade a text names ("1940s", "1943" -> "1940s"), or "". @param {string} text */
export function eraOf(text) {
  const y = /\b(1[5-9]\d\d|20[0-2]\d)s?\b/.exec(String(text ?? ""));
  return y ? `${y[1].slice(0, 3)}0s` : "";
}

/** @param {string} q */
const bare = (q) => q.trim().split(/\s+/).filter((w) => w.length > 2).length <= 1;

/**
 * subject: the film's subject when it is not the topic's (found from the transcript). A bare common word is never
 * sent alone: it is anchored to the subject, or dropped when there is none.
 * @param {{ queries: string[], description?: string, topic?: string, subject?: string }} shot
 * @returns {string[]} unique queries, most specific first
 */
export function queryLadder(shot) {
  const subject = String(shot.subject ?? "").trim() || subjectOf(shot.topic ?? "");
  const era = eraOf(`${shot.description ?? ""} ${shot.topic ?? ""}`);
  /** @type {string[]} */
  const out = [];
  /** @param {string | undefined} q */
  const add = (q) => {
    let s = String(q ?? "").replace(/\s+/g, " ").trim();
    // A subject found from the speech goes in every query: the archives answer a bare phrase with anything it names.
    if (s && shot.subject && subject && !s.toLowerCase().includes(subject.toLowerCase())) s = `${subject} ${s}`;
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
  };
  for (const q of shot.queries) add(subject && bare(q) && !q.toLowerCase().includes(subject.toLowerCase()) ? `${subject} ${q}` : isBareCommon(q) ? "" : q);
  if (subject) {
    add(subject);
    if (era) add(`${subject} ${era}`);
  }
  for (const c of categoriesOf(`${subject} ${shot.topic ?? ""} ${shot.description ?? ""}`).slice(0, 4)) add(c);
  if (era) for (const c of categoriesOf(`${subject} ${shot.topic ?? ""}`).slice(0, 1)) add(`${era} ${c}`);
  // The shot's own bare words last: they are what failed alone, but they can still name something.
  for (const q of shot.queries) if (!isBareCommon(q)) add(q);
  return out;
}

/** What a camera can show that a sentence names without a capital letter: [pattern, search words]. */
const FILMABLE = /** @type {[RegExp, string][]} */ ([
  [/\b(?:lift(?:ed|s)? off|launch(?:ed|es|ing)?|blast(?:ed)? off|ignition)\b/i, "launch"],
  [/\b(?:land(?:ed|ing|s)?|touch(?:ed)? down|touchdown)\b/i, "landing"],
  [/\b(?:crew|astronauts?|pilots?|team)\b/i, "crew"],
  [/\b(?:command module|capsule|cabin|cockpit|interior|inside)\b/i, "interior"],
  [/\b(?:lunar module|lander)\b/i, "lunar module"],
  [/\b(?:rocket|engines?|boosters?)\b/i, "rocket"],
  [/\b(?:collaps(?:e|ed|ing)|fell|fall|twist(?:ed|ing)?|torn|crash(?:ed)?|explo(?:de|ded|sion))\b/i, "collapse"],
  [/\b(?:factory|assembly line|workshop|plant)\b/i, "factory"],
  [/\b(?:build|built|construct(?:ed|ion)?|workers?)\b/i, "construction"],
  [/\b(?:design(?:ed|er)?|sketch(?:es|ed)?|blueprints?|drawings?)\b/i, "design"],
  [/\b(?:race|racing|track)\b/i, "racing"],
  [/\b(?:engine room|v12|v8|engine)\b/i, "engine"],
  [/\b(?:funeral|portrait|founder)\b/i, "portrait"],
]);

/** Capitalised names of a sentence (people, craft, places, events), with a leading grammar-only capital dropped. @param {string} text */
function namedRuns(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  /** @type {string[]} */
  const out = [];
  for (const m of t.matchAll(/\p{Lu}[\p{L}'’-]*(?:\s+(?:\p{Lu}[\p{L}'’-]*|\d+[A-Za-z]?|[IVX]{1,4}\b))*/gu)) {
    const words = m[0].split(/\s+/);
    const starts = m.index === 0 || /[.!?]\s*$/.test(t.slice(0, m.index));
    while (words.length && small(words[0].replace(/[^\p{L}]/gu, "")) && (starts || words.length > 1)) words.shift();
    if (!words.length || (words.length === 1 && small(words[0]))) continue;
    const name = words.join(" ");
    if (!out.some((o) => o.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out;
}

/**
 * What one sentence names: people, craft, places and events (capitalised runs), the years, and the filmable things it
 * says ("launch", "crew"). Pure code, no model, so it still works when the brain is out of tokens.
 * @param {string} sentence
 * @returns {{ names: string[], years: string[], things: string[] }}
 */
export function namesIn(sentence) {
  const s = String(sentence ?? "");
  const years = [...new Set([...s.matchAll(/\b(1[5-9]\d\d|20[0-2]\d)\b/g)].map((m) => m[1]))];
  const names = namedRuns(s).filter((n) => !/^\d+$/.test(n) && !CALENDAR_NAME.test(n));
  // Craft and places said in lower case are things to look up too.
  for (const m of s.matchAll(/\b(command module|lunar module|service module|space shuttle|assembly line|wind tunnel|test track|control room)\b/gi)) if (!names.some((n) => n.toLowerCase() === m[1].toLowerCase())) names.splice(1, 0, m[1].toLowerCase());
  const things = FILMABLE.filter(([re]) => re.test(s)).map(([, w]) => w).filter((w, i, a) => a.indexOf(w) === i);
  return { names, years, things };
}
const CALENDAR_NAME = /^(?:january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+\d+)?$/i;

/**
 * The searches of one shot, NAMES FIRST: the film's subject plus the named things of its own sentence, then the
 * brain's queries (moods) anchored to the subject, never instead of it. Without a brain only the first part exists.
 * `named` is true when the shot has something real to look up in an archive (a subject or a name), false for a pure mood shot.
 * @param {{ sentence?: string, subject?: string, queries?: string[], limit?: number }} o
 * @returns {{ queries: string[], nameCount: number, named: boolean, names: string[] }}
 */
export function namedQueries(o) {
  const subject = String(o.subject ?? "").replace(/\s+/g, " ").trim();
  const { names, years, things } = namesIn(o.sentence ?? "");
  const sub = subject.toLowerCase();
  const own = names.filter((n) => !sub.includes(n.toLowerCase()) && !n.toLowerCase().includes(sub || "\u0000"));
  /** @type {string[]} */
  const out = [];
  /** @param {string} q */
  const add = (q) => { const s = q.replace(/\s+/g, " ").trim(); if (s && !out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s); };
  const year = years[0] ?? "";
  const thing = things[0] ?? "";
  if (subject) {
    if (thing && year) add(`${subject} ${thing} ${year}`);
    if (thing && own[0]) add(`${own[0]} ${thing}${year ? ` ${year}` : ""}`);
    for (const n of own.slice(0, 4)) { add(`${subject} ${n}`); }
    if (thing) add(`${subject} ${thing}`);
    if (year) add(`${subject} ${year}`);
    for (const n of own.slice(0, 2)) if (year) add(`${n} ${year}`);
    add(subject);
  } else {
    for (const n of own.slice(0, 3)) { if (thing) add(`${n} ${thing}`); add(year ? `${n} ${year}` : n); }
  }
  // Mood words after the names, never instead of them.
  const anchor = out[0] ?? "";
  const nameCount = out.length;
  for (const q of o.queries ?? []) {
    const s = String(q ?? "").trim();
    if (!s || isBareCommon(s)) continue;
    add(subject && !s.toLowerCase().includes(sub) ? `${subject} ${s}` : s);
  }
  return { queries: out.slice(0, o.limit ?? 10), nameCount: Math.min(nameCount, o.limit ?? 10), named: Boolean(anchor), names: [...(subject ? [subject] : []), ...own] };
}
