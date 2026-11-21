/**
 * The Director pass of a voiceover film (TRANSFORMATION.md §3.2): a beat sheet before any picture is chosen.
 * Roster roles made real here (engine/src/agent-roster.mjs):
 * - Visual Director: visual intent per beat, evidence (R2) or illustration (R3), and missing visual beats;
 * - Emotional Arc: the emotion and the viewer goal (understand / feel) of every beat;
 * - the film's world (country, city, era, money, people), so no shot shows the wrong place or time.
 * A free brain (any model; nothing assumes Claude) may write the beats. Code fixes the vocabulary, makes the
 * beats tile the voice's scenes, takes times and words from the voice, and repairs the world in every beat:
 * the voice's country and city, rupees when the voice says rupees, the voice's people, the voice's era, and
 * never a generic stock picture (Boss, 21 Nov 2026: abstract film strips, random foreigners, the Amazon for India).
 */
import { msg } from "./messages.mjs";
import { brainBatches, wordsPlan } from "./voice-visuals.mjs";

/** @typedef {import("./voice-scenes.mjs").VoiceScene} VoiceScene */
/** @typedef {import("./film-run.mjs").Model} Model */
/** @typedef {ReturnType<typeof import("./voice-understand.mjs").voiceStructure>} Structure */

export const BEAT_GOALS = Object.freeze(["understand", "feel"]);
export const BEAT_EMOTIONS = Object.freeze(["curiosity", "tension", "wonder", "pride", "sorrow", "hope", "fear", "triumph", "calm", "surprise", "struggle", "warmth"]);

/** Countries a voice names often, with their cities, people and money. More can be added; nothing else is assumed. */
export const WORLDS = Object.freeze([
  { country: "India", demonym: "Indian", currency: "rupees", money: /\b(?:rupees?|rs\.?|inr|crores?|lakhs?)\b|₹/i, cities: ["Bengaluru", "Bangalore", "Mumbai", "Bombay", "Delhi", "New Delhi", "Chennai", "Madras", "Kolkata", "Calcutta", "Hyderabad", "Pune", "Mysuru", "Mysore", "Kochi", "Ahmedabad", "Jaipur"], words: /\b(?:india|indian|karnataka|kerala|tamil nadu|maharashtra|kannada|hindi)\b/i },
  { country: "Bangladesh", demonym: "Bangladeshi", currency: "taka", money: /\b(?:taka|tk\.?|bdt)\b|৳/i, cities: ["Dhaka", "Chittagong", "Chattogram", "Sylhet", "Khulna", "Rajshahi"], words: /\b(?:bangladesh|bangladeshi|bengali|bangla)\b/i },
  { country: "Pakistan", demonym: "Pakistani", currency: "rupees", money: /\b(?:pkr)\b/i, cities: ["Karachi", "Lahore", "Islamabad"], words: /\b(?:pakistan|pakistani|urdu)\b/i },
  { country: "United States", demonym: "American", currency: "dollars", money: /\b(?:dollars?|usd)\b|\$/i, cities: ["New York", "Los Angeles", "Chicago", "San Francisco", "Washington", "Boston", "Houston"], words: /\b(?:america|american|united states|usa)\b/i },
  { country: "United Kingdom", demonym: "British", currency: "pounds", money: /\b(?:pounds? sterling|gbp)\b|£/i, cities: ["London", "Manchester", "Birmingham", "Edinburgh"], words: /\b(?:britain|british|england|english|united kingdom)\b/i },
  { country: "United Arab Emirates", demonym: "Emirati", currency: "dirhams", money: /\b(?:dirhams?|aed)\b/i, cities: ["Dubai", "Abu Dhabi", "Sharjah"], words: /\b(?:emirates|emirati|uae)\b/i },
  { country: "Brazil", demonym: "Brazilian", currency: "reais", money: /\b(?:reais|real|brl)\b/i, cities: ["Rio de Janeiro", "São Paulo", "Manaus"], words: /\b(?:brazil|brazilian|amazon)\b/i },
]);

/** Pictures every free archive returns for any word, which tell the viewer nothing: never a beat's visual. */
const GENERIC = /\b(?:abstract|film[- ]?strips?|filmstrips?|bokeh|particles?|light leaks?|generic|random|stock (?:footage|image|photo)s?|background (?:texture|loop)|gradient|placeholder|lens flare|motion background|blurry)\b/gi;
/** Words that mean a person is on screen: a person must be one of the voice's people. */
const PERSON = /\b(?:people|person|man|men|woman|women|boy|girl|child|children|crowd|family|mother|father|son|daughter|wife|husband|cook|workers?|barbers?|customers?|drivers?|businessman|entrepreneur|portrait|faces?)\b/i;
/** Dollar words, refused in a rupee (or taka) world unless the voice itself says dollars in that beat. */
const DOLLAR = /\$\s?\d|\b(?:dollars?|usd|bucks)\b/i;
const DOLLARS = new RegExp(DOLLAR.source, "gi");

const EMOTION_WORDS = /** @type {[string, RegExp][]} */ ([
  ["sorrow", /\b(?:died|death|lost|loss|grief|cried|tears|funeral|orphan|passed away)\b/i],
  ["struggle", /\b(?:poor|poverty|hunger|hungry|debt|struggled?|hard(?:ship)?|nothing|school ?fees|could not afford|worked? (?:day and night|nights))\b/i],
  ["fear", /\b(?:afraid|fear|danger|threat|risk|warned)\b/i],
  ["tension", /\b(?:but|until|suddenly|then one day|problem|crisis|refused|fight|against)\b/i],
  ["triumph", /\b(?:won|success|successful|millionaire|billionaire|richest|fleet|empire|crore|famous|record)\b/i],
  ["pride", /\b(?:proud|honou?r|respect|legacy|own (?:company|business))\b/i],
  ["hope", /\b(?:dream|hope|chance|opportunity|decided|started|began|first)\b/i],
  ["wonder", /\b(?:imagine|incredible|amazing|rolls[- ]royce|luxury|mercedes|bmw)\b/i],
  ["warmth", /\b(?:mother|father|family|wife|children|friend|helped)\b/i],
]);

const GENRE_LANGUAGE = /** @type {Record<string, string>} */ ({
  biography: "a life told in its real places: street level in the person's own city and era, the work done with the hands, archive photos of the time, the named person only as themselves, objects that carry the story (a tool, a car, a ledger)",
  business: "money made visible: the real city's markets and offices, counters and ledgers in the local currency, the product itself, maps of growth",
  history: "evidence first: archive photos, documents and maps of the real place and year; reconstructions only labelled as such",
  documentary: "the real place and time the voice names, evidence before illustration, one clear subject per shot",
});

const key = (/** @type {string} */ s) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
const decade = (/** @type {number} */ y) => `${Math.floor(y / 10) * 10}s`;
const yearsIn = (/** @type {string} */ t) => [...t.matchAll(/\b(1[89]\d\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
const eraOf = (/** @type {number[]} */ ys) => { if (!ys.length) return ""; const a = Math.min(...ys), b = Math.max(...ys); return decade(a) === decade(b) ? decade(a) : `${decade(a)}–${decade(b)}`; };
const cityIn = (/** @type {string} */ t, /** @type {readonly string[]} */ cities) => cities.find((c) => new RegExp(`\\b${c}\\b`, "i").test(t)) ?? "";

/**
 * The film's world, from the voice's own words and the creator's topic: country, city, era, money, people.
 * The country is the one whose names, cities and money the voice says most; nothing is guessed when none is said.
 * @param {{ scenes: VoiceScene[], topic?: string }} o
 */
export function filmWorld(o) {
  const text = (o.topic ?? "") + " " + o.scenes.map((s) => s.narration).join(" ");
  const scored = WORLDS.map((w) => {
    const n = (/** @type {RegExp} */ re) => (text.match(new RegExp(re.source, "gi")) ?? []).length;
    return { w, n: n(w.words) + n(w.money) * 2 + w.cities.reduce((acc, c) => acc + n(new RegExp(`\\b${c}\\b`)) * 2, 0) };
  }).sort((a, b) => b.n - a.n);
  const top = scored[0]?.n ? scored[0].w : null;
  const cityCount = new Map();
  for (const c of top?.cities ?? []) { const n = (text.match(new RegExp(`\\b${c}\\b`, "gi")) ?? []).length; if (n) cityCount.set(c === "Bangalore" ? "Bengaluru" : c, (cityCount.get(c === "Bangalore" ? "Bengaluru" : c) ?? 0) + n); }
  const city = [...cityCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  // The money the voice says wins over the country's (a Bengaluru story told in dollars keeps dollars).
  const said = WORLDS.map((w) => ({ c: w.currency, n: (text.match(new RegExp(w.money.source, "gi")) ?? []).length })).sort((a, b) => b.n - a.n)[0];
  const currency = said?.n ? said.c : top?.currency ?? "";
  return { country: top?.country ?? "", city, demonym: top?.demonym ?? "", currency, era: eraOf(yearsIn(text)), cities: top?.cities ?? [] };
}

/** @typedef {ReturnType<typeof filmWorld>} World */

/** biography | business | history | documentary, from the topic and the voice's words. @param {World} world @param {Structure | null} structure @param {string} topic */
export function filmGenre(world, structure, topic = "") {
  const t = topic.toLowerCase();
  const words = new Set((structure?.topicWords ?? []).map((x) => x.word.toLowerCase()));
  if (/\bfrom\b.+\bto\b|\blife\b|\bstory of\b|\bbiograph/.test(t) || (structure?.entities ?? []).some((e) => !e.place && e.n >= 3)) return "biography";
  if (["company", "business", "money", "market", "crore", "profit", "billion"].some((w) => words.has(w) || t.includes(w))) return "business";
  if (/\b1[5-9]\d\d\b|\bwar\b|\bempire\b|\bhistory\b/.test(t) || world.era.startsWith("18")) return "history";
  return "documentary";
}

/** The brain's instructions. Short: the rules that matter are enforced in code. */
export const DIRECTOR_SYSTEM = [
  "You are the director of a documentary whose voiceover is already recorded. Before any picture is chosen you write the beat sheet.",
  "You get the film's world and one line per scene: SCxxxx | start-end | the words spoken.",
  "Group consecutive scenes into beats (a beat is one idea, usually 1 to 3 scenes). Cover every scene once, in order.",
  "Answer one line per beat, nothing else:",
  "BEAT | SC0001-SC0002 | GOAL: understand or feel | EMOTION: one of " + BEAT_EMOTIONS.join(", ") + " | REVEAL: the fact, number or name the viewer learns here, or none | RUNG: R2 (real evidence: a named person, place, document or date) or R3 (illustration) | VISUAL: what the viewer sees, concrete | PLACE: city, country | ERA: decade or years | PEOPLE: who is on screen",
  "The world is fixed: show its country and city, its money, its people and its era. Never another country, another currency, a generic abstract background, a film strip, or random people.",
  "Never invent facts the voice does not say.",
].join("\n");

/** One beat line of the brain. @param {string} line */
export function parseBeatLine(line) {
  const m = /^\s*BEAT\s*\|\s*(SC\d{4,5})\s*(?:[-–]\s*(SC\d{4,5}))?\s*\|(.*)$/i.exec(line);
  if (!m) return null;
  /** @type {Record<string, string>} */
  const f = {};
  for (const part of m[3].split("|")) { const kv = /^\s*([A-Z]+)\s*:\s*(.*?)\s*$/i.exec(part); if (kv) f[kv[1].toUpperCase()] = kv[2]; }
  return { from: m[1].toUpperCase(), to: (m[2] ?? m[1]).toUpperCase(), fields: f };
}

/**
 * A beat from the scenes' own words (no brain, or scenes the brain skipped). The era carries over from the
 * beat before when these scenes say no year, so a story stays in its time.
 * @param {VoiceScene[]} group @param {World} world @param {string} genre @param {Structure | null} structure @param {string} [topic] @param {string} [prevEra]
 */
export function wordsBeat(group, world, genre, structure, topic = "", prevEra = "") {
  const text = group.map((s) => s.narration).join(" ");
  const ids = new Set(group.map((s) => s.sc));
  const notPerson = new RegExp(`\\b(?:${[...world.cities, world.country || "-"].join("|")}|road|street|tours|travels|motors|nagar|lane|market|company)\\b`, "i");
  const names = (structure?.entities ?? []).filter((e) => !e.place && !notPerson.test(e.name) && e.scenes.some((sc) => ids.has(sc))).map((e) => e.name);
  const number = /(?:₹|\$|rs\.?\s?)?\b\d[\d,.]*\s*(?:crores?|lakhs?|rupees|dollars|cars|years|%|percent)?/i.exec(text)?.[0]?.trim() ?? "";
  const years = yearsIn(text);
  const emotion = EMOTION_WORDS.find(([, re]) => re.test(text))?.[0] ?? "curiosity";
  const reveal = [names[0], number].filter(Boolean).join(": ");
  const place = placeOf(text, world);
  const era = eraOf(years) || prevEra || world.era;
  const anchor = wordsPlan(group[0], structure, topic).ANCHOR;
  return {
    goal: ["sorrow", "struggle", "fear", "pride", "warmth", "triumph"].includes(emotion) ? "feel" : "understand",
    emotion,
    reveal: reveal || "none",
    rung: names.length || years.length ? "R2" : "R3",
    visual: `${place.includes(anchor) ? `${anchor} at street level` : `${anchor} in ${place || "the place the voice names"}`}${era ? `, ${era}` : ""}`,
    place,
    era,
    people: PERSON.test(text) || names.length ? peopleOf(names, world) : "",
  };
}

/** @param {string} text @param {World} world */
const placeOf = (text, world) => { const c = cityIn(text, world.cities) || world.city; return [c === "Bangalore" ? "Bengaluru" : c, world.country].filter(Boolean).join(", "); };
/** @param {string[]} names @param {World} world */
const peopleOf = (names, world) => [names.slice(0, 2).join(", "), world.demonym ? `${world.demonym} people of the time` : ""].filter(Boolean).join("; ");

/**
 * What is wrong with one beat against the world and the vocabulary. Each finding has a code a person can read.
 * @param {{ goal: string, emotion: string, rung: string, visual: string, place: string, era: string, people: string, words: string, reveal?: string }} b @param {World} world
 */
export function beatFindings(b, world) {
  /** @type {{ code: string, detail: string }[]} */
  const out = [];
  if (!BEAT_GOALS.includes(b.goal)) out.push({ code: "goal-unknown", detail: `goal "${b.goal}"` });
  if (!BEAT_EMOTIONS.includes(b.emotion)) out.push({ code: "emotion-unknown", detail: `emotion "${b.emotion}"` });
  if (!["R2", "R3"].includes(b.rung)) out.push({ code: "rung-unknown", detail: `rung "${b.rung}"` });
  const seen = `${b.visual} ${b.place} ${b.people} ${b.reveal ?? ""}`;
  const generic = seen.match(GENERIC);
  if (generic) out.push({ code: "generic-visual", detail: generic.join(", ") });
  if (world.currency && world.currency !== "dollars" && DOLLAR.test(seen) && !DOLLAR.test(b.words)) out.push({ code: "wrong-currency", detail: `dollars in a ${world.currency} film` });
  if (world.country) {
    const foreign = WORLDS.filter((w) => w.country !== world.country).flatMap((w) => [w.country, w.demonym, ...w.cities, ...(w.words.source.match(/[a-z][a-z ]+[a-z]/g) ?? [])])
      .filter((n) => n.length > 3 && new RegExp(`\\b${n}\\b`, "i").test(seen) && !new RegExp(`\\b${n}\\b`, "i").test(b.words));
    if (foreign.length) out.push({ code: "wrong-place", detail: [...new Set(foreign)].join(", ") });
    if (!new RegExp(`\\b${world.country}\\b`, "i").test(b.place)) out.push({ code: "place-missing", detail: `place "${b.place}" does not name ${world.country}` });
    if (PERSON.test(`${b.visual} ${b.people}`) && world.demonym && !new RegExp(`\\b${world.demonym}\\b`, "i").test(b.people) && !b.people.split(/[,;]/).some((p) => p.trim() && b.words.includes(p.trim()))) out.push({ code: "people-unplaced", detail: `people "${b.people}" are not ${world.demonym} or named by the voice` });
  }
  if (world.era && !b.era) out.push({ code: "era-missing", detail: "no era" });
  return out;
}

/**
 * Repair a beat in code so it holds the world: generic words out, dollars to the world's money, the place and
 * people of the world, the era. What the brain wrote well is kept.
 * @param {any} b @param {World} world @param {any} fallback the words beat of the same scenes
 */
function repairBeat(b, world, fallback) {
  const r = { ...b };
  if (!BEAT_GOALS.includes(r.goal)) r.goal = fallback.goal;
  if (!BEAT_EMOTIONS.includes(r.emotion)) r.emotion = fallback.emotion;
  if (!["R2", "R3"].includes(r.rung)) r.rung = fallback.rung;
  const clean = (/** @type {string} */ s) => s.replace(GENERIC, "").replace(/\s{2,}/g, " ").replace(/^[\s,;:]+|[\s,;:]+$/g, "");
  r.visual = clean(r.visual) || fallback.visual;
  r.people = clean(r.people);
  if (world.currency && world.currency !== "dollars" && !DOLLAR.test(r.words)) {
    // An amount the voice never said in dollars is not converted (that would invent a fact): it becomes "a price in rupees".
    for (const f of ["visual", "people", "reveal"]) r[f] = String(r[f] ?? "").replace(/\$\s?[\d,.]+(?:\s*(?:k|m|million|thousand))?/gi, `a price in ${world.currency}`).replace(DOLLARS, world.currency);
  }
  const f = beatFindings(r, world);
  if (f.some((x) => x.code === "wrong-place")) { r.visual = fallback.visual; r.place = fallback.place; r.people = fallback.people; }
  if (f.some((x) => x.code === "place-missing")) r.place = fallback.place;
  if (beatFindings(r, world).some((x) => x.code === "people-unplaced")) r.people = fallback.people || peopleOf([], world);
  if (!r.era) r.era = fallback.era;
  return r;
}

/**
 * The beat sheet of a voiceover film. With a free brain the beats come in batches of whole sections (the same
 * batches as the picture plan, so a free brain's limit holds); a used-up quota (429) stops the brain and the
 * rest is planned from the words. Whatever the brain answers, the beats end up tiling the scenes in order,
 * with the voice's own times and words, and every beat holds the world.
 * @param {{ scenes: VoiceScene[], structure?: Structure | null, topic?: string, brain?: Model | null, batchChars?: number, maxCalls?: number }} o
 */
export async function planBeats(o) {
  const scenes = o.scenes;
  const structure = o.structure ?? null;
  const world = filmWorld({ scenes, topic: o.topic });
  const genre = filmGenre(world, structure, o.topic);
  const messages = [];
  const lineOf = (/** @type {VoiceScene} */ s) => `${s.sc} | ${s.start.toFixed(1)}-${s.end.toFixed(1)} | ${s.narration}`;
  /** @type {Map<string, ReturnType<typeof parseBeatLine>>} */
  const written = new Map();
  let answered = 0, stopped = "", total = 0;
  if (o.brain) {
    const batches = brainBatches(scenes, structure, (sc) => lineOf(/** @type {VoiceScene} */ (scenes.find((s) => s.sc === sc))).length, o.batchChars ?? 9000);
    total = batches.length;
    const brief = `World: ${world.city ? world.city + ", " : ""}${world.country || "as the voice says"}; era ${world.era || "as the voice says"}; money in ${world.currency || "the voice's currency"}; people: ${world.demonym || "as the voice says"}. Genre: ${genre}. Visual language: ${GENRE_LANGUAGE[genre]}.` + (o.topic ? ` The film is about: ${o.topic}.` : "");
    for (const batch of batches) {
      if (stopped || answered >= (o.maxCalls ?? 40)) break;
      try {
        const reply = await o.brain.call({ stage: "V3", system: [{ text: DIRECTOR_SYSTEM, cache: true }], messages: [{ role: "user", content: [{ text: `${brief}\n\n${batch.map(lineOf).join("\n")}` }] }], maxTokens: Math.min(16000, 300 + batch.length * 120), effort: "medium" });
        answered += 1;
        for (const line of String(reply.text ?? "").split("\n")) { const b = parseBeatLine(line); if (b && !written.has(b.from)) written.set(b.from, b); }
      } catch (e) {
        if (/** @type {any} */ (e)?.status === 429 || /** @type {any} */ (e)?.permanent) stopped = String(/** @type {any} */ (e)?.message ?? e).slice(0, 160);
      }
    }
  }
  // Tile the scenes: a brain beat is taken only when it starts at the next uncovered scene and ends inside the film.
  const index = new Map(scenes.map((s, i) => [s.sc, i]));
  /** @type {any[]} */
  const beats = [];
  /** @type {{ beat: string, code: string, detail: string }[]} */
  const brainFindings = [];
  let fromBrain = 0;
  for (let i = 0; i < scenes.length;) {
    const w = written.get(scenes[i].sc);
    const end = w ? index.get(w.to) : undefined;
    const j = w && end !== undefined && end >= i && end - i < 6 ? end : i;
    const group = scenes.slice(i, j + 1);
    const id = `B${String(beats.length + 1).padStart(3, "0")}`;
    const fallback = wordsBeat(group, world, genre, structure, o.topic, beats.at(-1)?.era);
    const base = { id, from: group[0].sc, to: group[group.length - 1].sc, start: r3(group[0].start), end: r3(group[group.length - 1].end), words: group.map((s) => s.narration).join(" ") };
    if (w && j === end) {
      const f = w.fields;
      const raw = { ...base, goal: (f.GOAL ?? "").toLowerCase(), emotion: (f.EMOTION ?? "").toLowerCase(), reveal: f.REVEAL || "none", rung: (f.RUNG ?? "").toUpperCase(), visual: f.VISUAL ?? "", place: f.PLACE ?? "", era: f.ERA ?? "", people: f.PEOPLE ?? "", by: "brain" };
      for (const x of beatFindings(raw, world)) brainFindings.push({ beat: id, ...x });
      beats.push(repairBeat(raw, world, fallback));
      fromBrain += 1;
    } else beats.push({ ...base, ...fallback, by: "words" });
    i = j + 1;
  }
  const findings = beats.flatMap((b) => beatFindings(b, world).map((x) => ({ beat: b.id, ...x })));
  if (o.brain && (answered || stopped)) messages.push(msg("voice.beatsBrain", { done: answered, total, beats: fromBrain, of: beats.length }));
  if (stopped) messages.push(msg("voice.brainStopped", { reason: stopped }));
  if (!answered) messages.push(msg("voice.beatsWords", { beats: beats.length }));
  if (brainFindings.length) messages.push(msg("voice.beatsRepaired", { n: brainFindings.length, codes: [...new Set(brainFindings.map((f) => f.code))].join(", ") }));
  if (world.country) messages.push(msg("voice.world", { place: [world.city, world.country].filter(Boolean).join(", "), era: world.era || "—", money: world.currency || "—" }));
  return { world, genre, language: GENRE_LANGUAGE[genre], beats, findings, brainFindings, messages, brainUsed: answered > 0 };
}

/** One line for the picture plan's brief, so every shot holds the world. @param {World} world */
export function worldBrief(world) {
  if (!world.country) return "";
  return `The film's world: ${[world.city, world.country].filter(Boolean).join(", ")}${world.era ? `, ${world.era}` : ""}; money in ${world.currency}; the people on screen are ${world.demonym} or named by the voice. Every search names this place and era. Never another country, other money, generic abstract backgrounds, film strips or random people.`;
}
