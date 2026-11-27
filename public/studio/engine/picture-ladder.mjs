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
  [/\bbridge|viaduct|suspension\b/i, ["suspension bridge", "bridge collapse", "bridge construction"]],
  [/\bdams?\b|reservoir|levee|spillway/i, ["dam construction", "dam failure", "spillway flood"]],
  [/\btunnel|subway|metro\b/i, ["tunnel construction", "tunnel boring"]],
  [/\bcanal|lock\b|panama|suez/i, ["canal construction", "ship canal locks"]],
  [/\brailway|railroad|train\b/i, ["railroad construction", "locomotive"]],
  [/\bskyscraper|tower|building\b/i, ["skyscraper construction", "steel frame building"]],
  [/\bnuclear|reactor|chernobyl|power plant\b/i, ["nuclear power plant", "reactor building"]],
  [/\brefinery|oil|pipeline|rig\b/i, ["oil refinery", "pipeline construction"]],
  [/\bspace|rocket|shuttle|apollo|challenger\b/i, ["rocket launch", "spacecraft"]],
  [/\bship|titanic|vessel\b/i, ["ocean liner", "shipyard"]]
];
const THING = /\b(bridge|dam|tunnel|canal|tower|reservoir|railway|railroad|station|plant|reactor|building|ship|rocket|shuttle|mine|pipeline|levee|viaduct)\b/i;
const FILLER = /^(the|a|an|how|why|what|when|story|of|and|in|on|at|to|from|with|fall|rise|collapse|failure|disaster|history|true|untold|inside|behind)$/i;

/**
 * The film's subject out of its title: the capitalised run that holds a thing word ("Galloping Gertie: the fall
 * of the Tacoma Narrows Bridge" -> "Tacoma Narrows Bridge"), else the part after ":" or the whole title.
 * @param {string} topic
 */
export function subjectOf(topic) {
  const t = String(topic ?? "").trim();
  if (!t) return "";
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
 * @param {{ queries: string[], description?: string, topic?: string }} shot
 * @returns {string[]} unique queries, most specific first
 */
export function queryLadder(shot) {
  const subject = subjectOf(shot.topic ?? "");
  const era = eraOf(`${shot.description ?? ""} ${shot.topic ?? ""}`);
  /** @type {string[]} */
  const out = [];
  /** @param {string | undefined} q */
  const add = (q) => { const s = String(q ?? "").replace(/\s+/g, " ").trim(); if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s); };
  for (const q of shot.queries) add(subject && bare(q) && !q.toLowerCase().includes(subject.toLowerCase()) ? `${subject} ${q}` : q);
  if (subject) {
    add(subject);
    if (era) add(`${subject} ${era}`);
  }
  for (const c of categoriesOf(`${subject} ${shot.topic ?? ""} ${shot.description ?? ""}`).slice(0, 4)) add(c);
  if (era) for (const c of categoriesOf(`${subject} ${shot.topic ?? ""}`).slice(0, 1)) add(`${era} ${c}`);
  // The shot's own bare words last: they are what failed alone, but they can still name something.
  for (const q of shot.queries) add(q);
  return out;
}
