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
