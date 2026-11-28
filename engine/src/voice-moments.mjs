/**
 * The designed moments a voice film already carries in its words (mission N1).
 *
 * A voice film's words are timed (words.json) but nothing in them is designed:
 * the pictures follow the sentences, and a lower third, a counter, a date card
 * or a quote card only appears when the free brain happens to plan one. When the
 * brain is out of tokens ("No writer model answered") the film gets no graphics
 * at all: film e0b87efb (a 38 s Apollo 11 narration) had 0 designed moments a
 * minute against the house's 1.2, and no title by 0:40.
 *
 * This module finds them from the timed words alone, with no model:
 *   - people: a capitalised 2-3 word name, the first mention only (a stop list
 *     keeps sentence starts like "The", "At", "Now", "It" out);
 *   - numbers worth showing: a count of 1,000 or more, money, a percentage, or a
 *     year with an event;
 *   - dates and times ("July 16, 1969", "9:32");
 *   - places (a capitalised name after in/at/from/near, or a place word such as
 *     Cape or Island);
 *   - a direct quote in the text (between quotation marks);
 *   - a title: the user's topic if given, else the subject the words name most.
 *
 * Every spelling comes from the words themselves; nothing is retyped or
 * invented. Two phrases are joined only with the house separator " · " when
 * both are in the words ("July 16, 1969 · Cape Kennedy").
 *
 * Pacing (the house's own numbers): at least 1.4 moments a minute where the
 * words allow it, at least one in the first 30 s, never two within 4 s, at most
 * one per sentence. The moments are handed to planShots (shot-plan.mjs), which
 * draws them with the existing TEMPLATES (render/graphics/templates.mjs) as R1
 * designed cards in the same shot plan: there is no second graphics system, and
 * a card that the brain already planned is never moved or replaced.
 */
/** The least time between two designed moments (the house's pacing rule). */
export const MOMENT_GAP = 4;
/** Designed moments a minute the house style needs (render/critic.mjs STANDARD.designedPerMinute). */
export const MOMENTS_PER_MINUTE = 1.4;
/** A moment must land inside the first 30 s of the film. */
export const FIRST_WINDOW = 30;

/**
 * Where a template's words sit in the frame, as fractions of its height. Captions in a
 * voice film are written as an .srt beside the film, never burned into the picture, so
 * nothing on screen covers them; the rule is kept as the safe area anyway: the band
 * under 88% of the frame is where captions live, and no moment draws there.
 */
export const SAFE_AREA = Object.freeze({ top: 0.06, bottom: 0.88, left: 0.07, right: 0.93 });
/** The vertical box each template's words occupy (from render/graphics/templates.mjs). */
export const MOMENT_AREA = Object.freeze({
  lowerThird: { top: 0.62, bottom: 0.88 },
  counter: { top: 0.2, bottom: 0.8 },
  "kinetic-type": { top: 0.25, bottom: 0.75 },
  quote: { top: 0.2, bottom: 0.8 },
  title: { top: 0.25, bottom: 0.75 },
  timeline: { top: 0.35, bottom: 0.85 },
});

/** How long each card holds on screen (seconds), between the 2.5 s the shot plan gives a card and its 5 s ceiling. */
export const CARD_SECONDS = Object.freeze({ lowerThird: 3.2, counter: 3.6, "kinetic-type": 3.4, quote: 4.2, title: 3.5, timeline: 4.5 });

/** Words that never begin a name: sentence starters, pronouns, articles, numbers as words. */
const STOP = new Set(("a an the and but or so yet for nor now then it its it's this that these those there here he she they we you i his her their our your my me us them him " +
  "at in on from near after before when while as if because although though despite during over under between within by to of with into onto about above below since until than " +
  "also just only even still again once what who whom whose which why how not no yes one two three four five six seven eight nine ten first last next another every each both all any some many most more much less few several other " +
  "said says say told tells asked asks recalled remembers according today yesterday tomorrow morning evening night day week month year years ago later soon").split(" "));
const MONTHS = /^(january|february|march|april|may|june|july|august|september|sept|october|november|december)$/i;
const DAYS = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;
/** Words that make a capitalised run a place, not a person ("Cape Kennedy", "Pearl Harbor"). */
const PLACE_WORD = new Set(("cape island islands bay gulf lake lakes mount mountain mountains river sea ocean coast valley desert forest park road street avenue city town village county state station airport base centre center port harbour harbor bridge tower square district province republic kingdom point head falls springs hill hills delta strait channel canyon plains beach").split(" "));
/** The prepositions a place is named after. */
const PREP = /^(in|at|from|near|over|outside|inside|across|through|toward|towards|to|around|above|below|onto|into|off|via)$/i;
/** A year whose sentence carries one of these said the year of an event. */
const EVENT = /\b(?:landed|lands|launch(?:ed|es)?|liftoff|lifted|built|builds|opened|opens|died|dies|war|wars|crash(?:ed|es)?|collapse[ds]?|founded|discovered|elected|arrived|arrives|signed|exploded|sank|sunk|won|wins|fell|falls|began|begins|started|starts|ended|ends|closed|split|invaded|rescued|orbited|orbits|walked|walks|spoke|speaks|declared|married|sold|bought|sailed|sails|flew|flies|docked|splashed|returned|returns|delivered|commissioned|completed|survived|killed|destroyed)\b/i;
/** Units that turn a four digit number into a quantity rather than a year. */
const UNIT = /^(people|persons|workers|men|women|miles|kilometres|kilometers|feet|metres|meters|tons|tonnes|pounds|dollars|jobs|homes|houses|years|days|hours|soldiers|passengers|cars|trucks|planes|flights|litres|liters|gallons|degrees|metres|knots|acres|hectares)$/i;
/** Numbers written with a comma group, five or more digits, money, or a percentage: a number worth showing. */
const GROUPED = /^\d{1,3}(?:\,\d{3})+$/;
const LONG = /^\d{5,}$/;
const MONEY = /^\$[\d,]+(?:\.\d+)?$/;
const PERCENT = /^\d+(?:\.\d+)?%$/;
const YEAR = /^(1[89]\d\d|20[0-4]\d)$/;
const CLOCK = /^\d{1,2}:\d{2}$/;
const QUOTE_OPEN = /^[“"„]/;
const QUOTE_CLOSE = /[”"]$/;

/** The word without the punctuation around it: "16," -> "16", "“Neil" -> "Neil". */
const bare = (/** @type {string} */ t) => String(t ?? "").replace(/^[^\p{L}\p{N}$]+|[^\p{L}\p{N}%]+$/gu, "");
/** A capitalised proper noun ("Neil", "Armstrong", "Cape"); all-caps acronyms are not names. */
const isName = (/** @type {string} */ w) => w.length > 1 && /^\p{Lu}[\p{L}'’.]*$/u.test(w) && !/^\p{Lu}{2,}$/u.test(w);
const low = (/** @type {string} */ w) => w.toLowerCase().replace(/[^a-z]/g, "");
const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;

/** @typedef {import("./voice-scenes.mjs").TimedWord} TimedWord */
/** @typedef {{ words: TimedWord[], tokens: { clean: string, raw: string, start: number, end: number }[], start: number, end: number }} Sentence */
/**
 * A moment as planned: kind is what the words gave, type is the shot type (and template) it is drawn by.
 * @typedef {{ kind: "person" | "count" | "money" | "percent" | "year" | "date" | "datePlace" | "place" | "quote" | "title",
 *   type: "lowerThird" | "counter" | "kinetic-type" | "quote" | "title", text: string, start: number, end: number,
 *   sentence: number, by?: string, area: { top: number, bottom: number } }} Moment
 */

/**
 * The sentences of a word list, each with its own words and times. Same breaks as
 * sentencesOf (a word that ends a sentence), but the words are kept so every
 * candidate can be stamped with the time it is spoken.
 * @param {TimedWord[]} words
 */
export function sentenceWords(words) {
  /** @type {{ words: TimedWord[], tokens: { clean: string, raw: string, start: number, end: number }[], start: number, end: number }[]} */
  const out = [];
  /** @type {TimedWord[]} */
  let cur = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ words: cur, tokens: cur.map((w) => ({ clean: bare(w.text), raw: w.text, start: w.start, end: w.end })), start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (const w of words) {
    cur.push(w);
    if (/[.!?]["”']?$/.test(w.text)) flush();
  }
  flush();
  return out;
}

/**
 * The people the sentence names: a capitalised run of 2 or 3 words, never a sentence
 * starter ("The", "At", "Now", "It"), never a place ("Cape Kennedy"), never a month.
 * @param {Sentence} sentence @param {number} index
 */
export function peopleIn(sentence, index) {
  /** @type {{ kind: "person", type: "lowerThird", text: string, start: number, end: number, sentence: number, area: any }[]} */
  const out = [];
  const t = sentence.tokens;
  for (let i = 0; i < t.length; i += 1) {
    if (!isName(t[i].clean) || STOP.has(low(t[i].clean)) || MONTHS.test(t[i].clean) || DAYS.test(t[i].clean)) continue;
    // After in/at/from/near it is a place's name, not a person's.
    if (i > 0 && PREP.test(t[i - 1].clean)) continue;
    if (PLACE_WORD.has(low(t[i].clean))) continue;
    // A name is one to three capitalised words in a row; a comma ends it, so a list
    // ("Neil Armstrong, Buzz Aldrin and Michael Collins") gives three names, not one run.
    const run = [t[i]];
    while (run.length < 3) {
      const next = t[i + run.length];
      if (!next || /[,;:]$/.test(run[run.length - 1].raw)) break;
      if (!isName(next.clean) || STOP.has(low(next.clean)) || MONTHS.test(next.clean) || DAYS.test(next.clean) || PLACE_WORD.has(low(next.clean))) break;
      if (/^\p{Lu}{2,}$/u.test(next.clean)) break; // an acronym is not the rest of a name
      run.push(next);
    }
    const found = run.length >= 2 ? run : null;
    if (!found) continue;
    out.push({ kind: "person", type: "lowerThird", text: found.map((x) => x.clean).join(" "), start: found[0].start, end: found[found.length - 1].end, sentence: index, area: MOMENT_AREA.lowerThird });
  }
  return out;
}

/**
 * The places the sentence names: a capitalised run after in/at/from/near, or a run that
 * carries a place word ("Cape Kennedy").
 * @param {Sentence} sentence @param {number} index
 */
export function placesIn(sentence, index) {
  /** @type {{ kind: "place", type: "kinetic-type", text: string, start: number, end: number, sentence: number, area: any }[]} */
  const out = [];
  const t = sentence.tokens;
  for (let i = 0; i < t.length; i += 1) {
    if (!isName(t[i].clean) || STOP.has(low(t[i].clean)) || MONTHS.test(t[i].clean) || DAYS.test(t[i].clean)) continue;
    const after = i > 0 && PREP.test(t[i - 1].clean);
    if (!after && !PLACE_WORD.has(low(t[i].clean))) continue;
    // A place is one to three capitalised words: "Cape Kennedy", "Cape Canaveral", "Cape Kennedy Space Center".
    const run = [t[i]];
    while (run.length < 3) {
      const next = t[i + run.length];
      if (!next || /[,;:]$/.test(run[run.length - 1].raw)) break;
      if (!isName(next.clean) || STOP.has(low(next.clean)) || MONTHS.test(next.clean)) break;
      run.push(next);
    }
    const found = run;
    if (!found) continue;
    out.push({ kind: "place", type: "kinetic-type", text: found.map((x) => x.clean).join(" "), start: found[0].start, end: found[found.length - 1].end, sentence: index, area: MOMENT_AREA["kinetic-type"] });
  }
  return out;
}

/**
 * The dates the sentence says: "July 16, 1969", "July 1969", "July 16", "9:32".
 * The words are kept exactly as spoken (a trailing comma stays inside the date).
 * @param {Sentence} sentence @param {number} index
 */
export function datesIn(sentence, index) {
  /** @type {{ kind: "date", type: "kinetic-type", text: string, start: number, end: number, sentence: number, area: any }[]} */
  const out = [];
  const t = sentence.tokens;
  for (let i = 0; i < t.length; i += 1) {
    const w = t[i].clean;
    if (MONTHS.test(w)) {
      const rest = t.slice(i + 1, i + 3);
      const day = rest[0] && /^\d{1,2},?$/.test(rest[0].clean) ? rest[0] : null;
      const year = (day ? rest[1] : rest[0]) && /^(1[89]\d\d|20[0-4]\d),?$/.test((day ? rest[1] : rest[0]).clean) ? (day ? rest[1] : rest[0]) : null;
      const used = [t[i], ...(day ? [day] : []), ...(year ? [year] : [])];
      // The date as written ("July 16, 1969"): the words keep their own commas, the last one loses its stop.
      const text = used.map((x) => x.raw).join(" ").replace(/^[“"„]/, "").replace(/[,.;:]+$/, "");
      if (day || year) out.push({ kind: "date", type: "kinetic-type", text, start: t[i].start, end: used[used.length - 1].end, sentence: index, area: MOMENT_AREA["kinetic-type"] });
      continue;
    }
    if (CLOCK.test(w)) out.push({ kind: "date", type: "kinetic-type", text: w, start: t[i].start, end: t[i].end, sentence: index, area: MOMENT_AREA["kinetic-type"] });
  }
  return out;
}

/**
 * The numbers worth showing: a count of 1,000 or more, money, a percentage (counted up by
 * the counter template), and a year whose sentence says an event happened (a kinetic line
 * with the year and the next few words, because a year counts as a year, not a quantity).
 * @param {Sentence} sentence @param {number} index
 */
export function numbersIn(sentence, index) {
  /** @type {Moment[]} */
  const out = [];
  const t = sentence.tokens;
  // What is counted, the way the voice says it: the lowercase words after the number that
  // name the quantity ("people", "miles", "million dollars"); a verb ends them ("400,000
  // people worked" keeps "people" only), so the card never carries the rest of the sentence.
  const COUNTED = /^(?:\p{Ll}[\p{L}-]*s|million|billion|thousand|hundred|people|police|staff|crew|public|percent|dollars?|euros?|pounds?|rupees?|lakhs?|crores?)$/u;
  /** The words said after the number, at most n, that name what is counted. */
  const after = (/** @type {number} */ i, /** @type {number} */ n) => {
    const picked = [];
    for (let k = i + 1; k < t.length && picked.length < n; k += 1) {
      const w = t[k].clean;
      if (!w || !COUNTED.test(w) || STOP.has(low(w))) break;
      picked.push(w);
    }
    return picked;
  };
  for (let i = 0; i < t.length; i += 1) {
    const w = t[i].clean;
    if (!w) continue;
    const tail = after(i, 2);
    const text = (/** @type {string[]} */ parts) => [w, ...parts].join(" ");
    if (MONEY.test(w)) {
      const words = after(i, 1);
      out.push({ kind: "money", type: "counter", text: text(words), start: t[i].start, end: (words.length ? t[i + words.length] : t[i]).end, sentence: index, area: MOMENT_AREA.counter });
      continue;
    }
    if (PERCENT.test(w)) {
      const words = after(i, 1);
      out.push({ kind: "percent", type: "counter", text: text(words), start: t[i].start, end: (words.length ? t[i + words.length] : t[i]).end, sentence: index, area: MOMENT_AREA.counter });
      continue;
    }
    if (/^\d+(?:\.\d+)?$/.test(w) && low(t[i + 1]?.clean ?? "") === "percent") {
      out.push({ kind: "percent", type: "counter", text: `${w} ${t[i + 1].clean}`, start: t[i].start, end: t[i + 1].end, sentence: index, area: MOMENT_AREA.counter });
      continue;
    }
    const quantity = GROUPED.test(w) || LONG.test(w) || (/^\d{1,4}$/.test(w) && UNIT.test(t[i + 1]?.clean ?? "") && Number(w) >= 1000);
    if (quantity) {
      const words = after(i, 2);
      out.push({ kind: "count", type: "counter", text: text(words), start: t[i].start, end: (words.length ? t[i + words.length] : t[i]).end, sentence: index, area: MOMENT_AREA.counter });
      continue;
    }
    if (YEAR.test(w) && EVENT.test(sentence.words.map((x) => x.text).join(" "))) {
      // The year with what the voice says happened: its own next words (an article skipped), up to four.
      const line = [w];
      for (let k = i + 1; k < t.length && line.length < 5; k += 1) {
        const nx = t[k].clean;
        if (!/^\p{L}/u.test(nx) || STOP.has(low(nx))) { if (line.length === 1 && /^(the|a|an)$/i.test(nx)) continue; break; }
        line.push(nx);
      }
      const end = t[i + line.length - 1] ?? t[i];
      out.push({ kind: "year", type: "kinetic-type", text: line.join(" "), start: t[i].start, end: end.end, sentence: index, area: MOMENT_AREA["kinetic-type"] });
    }
  }
  return out;
}

/**
 * The direct quote in the sentence: the words between quotation marks, exactly as said.
 * The speaker is named only when the sentence itself names one just before the quote.
 * @param {Sentence} sentence @param {number} index
 */
export function quotesIn(sentence, index) {
  /** @type {Moment[]} */
  const out = [];
  const t = sentence.tokens;
  let open = -1;
  for (let i = 0; i < t.length; i += 1) {
    const raw = sentence.words[i]?.text ?? "";
    if (open < 0 && QUOTE_OPEN.test(raw)) { open = i; continue; }
    if (open >= 0 && QUOTE_CLOSE.test(raw) && i > open) {
      const from = open;
      const quoted = t.slice(from, i + 1).map((x) => x.raw.replace(/^[“"„]|[”"]$/g, "")).filter(Boolean);
      open = -1;
      if (quoted.length < 3 || quoted.length > 40) continue;
      // The speaker is named only when this sentence names one before the quote ("Armstrong said, “…”").
      const before = t.slice(0, from).map((x) => x.clean).join(" ");
      const head = { words: sentence.words.slice(0, from), tokens: t.slice(0, from), start: sentence.start, end: sentence.end };
      const speaker = peopleIn(head, index).map((p) => p.text).find((n) => before.includes(n)) ?? "";
      out.push({ kind: "quote", type: "quote", text: `“${quoted.join(" ")}”${speaker ? ` — ${speaker}` : ""}`, start: t[from].start, end: t[i].end, sentence: index, area: MOMENT_AREA.quote, ...(speaker ? { by: speaker } : {}) });
    }
  }
  return out;
}

/** @param {Moment} m */
export function insideSafeArea(m) {
  const a = m.area;
  return Boolean(a) && a.top >= SAFE_AREA.top && a.bottom <= SAFE_AREA.bottom;
}

/**
 * Plan the film's designed moments from its own words.
 *
 * @param {{ words: TimedWord[], topic?: string, seconds?: number, gap?: number }} o
 *   words: the timed words (words.json); topic: the user's topic, used for the title;
 *   seconds: the film's length (default: the last word's end); gap: least seconds between two moments
 * @returns {{ moments: Moment[], candidates: number, seconds: number, perMinute: number, enough: boolean,
 *   title: Moment | null, firstAt: number | null, skipped: { text: string, why: string }[] }}
 */
export function planMoments(o) {
  const words = (o.words ?? []).filter((w) => w && typeof w.text === "string" && Number.isFinite(w.start) && Number.isFinite(w.end));
  const seconds = o.seconds && o.seconds > 0 ? o.seconds : words.at(-1)?.end ?? 0;
  const gap = o.gap ?? MOMENT_GAP;
  const sentences = sentenceWords(words);
  /** @type {Moment[]} */
  const found = [];
  for (const [i, s] of sentences.entries()) found.push(...peopleIn(s, i), ...numbersIn(s, i), ...datesIn(s, i), ...placesIn(s, i), ...quotesIn(s, i));
  // The first mention of a name is the one that carries its lower third.
  const seenNames = new Set();
  const named = found.filter((m) => m.kind !== "person" || (!seenNames.has(m.text.toLowerCase()) && seenNames.add(m.text.toLowerCase())));
  // A date and a place in the same sentence become one card, only when both are in the words.
  const merged = mergeDatePlace(named);

  /** @type {Moment[]} */
  const chosen = [];
  /** @type {{ text: string, why: string }[]} */
  const skipped = [];
  /** @param {Moment} m */
  const take = (m) => {
    if (chosen.some((x) => x.sentence === m.sentence)) { skipped.push({ text: m.text, why: "one moment a sentence" }); return false; }
    if (chosen.some((x) => Math.abs(x.start - m.start) < gap)) { skipped.push({ text: m.text, why: `within ${gap} s of another moment` }); return false; }
    if (!insideSafeArea(m)) { skipped.push({ text: m.text, why: "outside the safe area" }); return false; }
    chosen.push(m);
    return true;
  };

  // The title: the user's topic, else the subject the words name most (never invented).
  const title = titleMoment(merged, sentences, o.topic, seconds);
  if (title) take(title);
  for (const m of [...merged].sort((a, b) => a.start - b.start)) take(m);
  // At least one moment in the first 30 s: the earliest one the words offer, if the rules left none.
  if (!chosen.some((m) => m.start < FIRST_WINDOW) && merged.length) {
    const first = [...merged].sort((a, b) => a.start - b.start)[0];
    if (!chosen.includes(first)) chosen.push(first);
  }
  chosen.sort((a, b) => a.start - b.start);
  const perMinute = seconds > 0 ? Math.round(((chosen.length * 60) / seconds) * 10) / 10 : 0;
  return { moments: chosen, candidates: merged.length, seconds: r3(seconds), perMinute, enough: seconds < 20 || perMinute >= MOMENTS_PER_MINUTE, title, firstAt: chosen[0]?.start ?? null, skipped };
}

/**
 * One card for a date and a place said in the same sentence ("July 16, 1969 · Cape Kennedy"):
 * both phrases are the voice's own, joined by the house separator. A date or place alone keeps
 * its own card.
 * @param {Moment[]} moments
 */
export function mergeDatePlace(moments) {
  // The fullest date of each sentence wins ("July 16, 1969" over the clock "9:32"); the
  // others said in it are dropped, so one sentence gives one date card.
  const rank = (/** @type {Moment} */ m) => (MONTHS.test(m.text.split(" ")[0]) ? 4 : 0) + (/\d{4}/.test(m.text) ? 2 : 0) + (m.text.split(" ").length >= 3 ? 1 : 0);
  /** @type {Map<number, Moment>} */
  const best = new Map();
  for (const m of moments) {
    if (m.kind !== "date") continue;
    const cur = best.get(m.sentence);
    if (!cur || rank(m) > rank(cur)) best.set(m.sentence, m);
  }
  /** @type {Moment[]} */
  const out = [];
  const used = new Set();
  for (const m of [...moments].sort((a, b) => a.start - b.start)) {
    if (used.has(m)) continue;
    if (m.kind !== "date") { out.push(m); continue; }
    if (best.get(m.sentence) !== m) { used.add(m); continue; }
    const place = moments.find((p) => p.kind === "place" && p.sentence === m.sentence && !used.has(p));
    if (place) {
      used.add(place);
      out.push({ ...m, kind: "datePlace", text: `${m.text} · ${place.text}` });
    } else out.push(m);
  }
  return out;
}

/**
 * The film's title card: the user's topic when one was given, else the subject the words name
 * most (a person, else a place, else a date). It lands on a sentence that carries no moment of
 * its own, inside the first 40 s; with neither a topic nor a subject there is no title.
 * @param {Moment[]} moments @param {ReturnType<typeof sentenceWords>} sentences @param {string | undefined} topic @param {number} seconds
 * @returns {Moment | null}
 */
export function titleMoment(moments, sentences, topic, seconds) {
  if (sentences.length === 0) return null;
  /** @type {Record<string, number>} */
  const weight = { person: 3, place: 2, datePlace: 2, date: 1 };
  /** @type {Map<string, number>} */
  const votes = new Map();
  for (const m of moments) {
    const w = weight[m.kind] ?? 0;
    if (!w) continue;
    votes.set(m.text, (votes.get(m.text) ?? 0) + w);
  }
  const subject = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "";
  const text = String(topic ?? "").trim() || subject;
  if (!text) return null;
  // A sentence with no moment of its own, after the opening claim and before 0:36.
  const busy = new Set(moments.map((m) => m.sentence));
  const room = sentences.findIndex((s, i) => !busy.has(i) && s.start >= Math.min(6, seconds / 3) && s.start < 36);
  const at = room >= 0 ? sentences[room].start : sentences[0].start;
  return { kind: "title", type: "title", text, start: r3(at), end: r3(at + (CARD_SECONDS.title ?? 3.5)), sentence: room >= 0 ? room : 0, area: MOMENT_AREA.title };
}
