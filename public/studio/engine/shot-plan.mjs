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
import { brainBatches, nounsAfterDeterminers, wordsPlan } from "./voice-visuals.mjs";
import { parseSceneLines, toSeconds } from "./scene-lines.mjs";
import { checkVoiceChapter, restoreVoiceFields } from "./voice-scenes.mjs";
import { editInstruction, editSheet, editStats, longHolds, uncoveredHolds, validateEditPlan } from "./edit-director.mjs";
import { buildTimeline } from "./timeline.mjs";

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

// ---------------------------------------------------------------------------------------------------------
// The shot plan (TRANSFORMATION.md §3.3): every shot typed from one closed vocabulary, with its subject, era,
// place, move, duration and sound cue, written into the scene lines the renderer already reads (SHOTS, SRC,
// TYPE, FX, TRANS, MOTION). Roster roles made real here: Pacing Analyst (the genre's rhythm and the hook,
// checked in code), Asset Search Strategist (each picture's queries from its subject, place and era), and the
// Visual Director's designed moments. The voice's words and times are never touched: they are checked and put back.

/** The closed vocabulary of shot types (the names render/graphics/from-shot.mjs and render-film.mjs read as v.shotType). */
export const SHOT_TYPES = Object.freeze(["live-video", "archival-video", "photo-2.5D", "photo-designed", "title", "kinetic-type", "quote", "document", "timeline"]);
/** Types that are a designed moment (a graphic on a narration beat), drawn as an R1 card. */
export const DESIGNED_TYPES = Object.freeze(["title", "kinetic-type", "quote", "document", "timeline"]);
/** Shot length by genre (seconds): the median band and the longest one picture may hold (TRANSFORMATION.md §4). */
export const GENRE_RHYTHM = Object.freeze({
  biography: { target: 4.5, median: [2.5, 6], max: 8 },
  business: { target: 4, median: [2.5, 5.5], max: 7 },
  history: { target: 5, median: [3, 6], max: 8 },
  documentary: { target: 4.5, median: [2.5, 6], max: 8 },
});
/** The hook (docs/research/VIRAL_STUDY.md, TRANSFORMATION.md §4): ≥6 visual beats in the first 30 s, the title by 0:40, a designed moment at least every 45 s. */
export const HOOK = Object.freeze({ seconds: 30, beats: 6, titleBy: 40, shotMax: 4, designEvery: 45 });
/** The sound cue under each designed moment (an Edit Director hit; kinetic type gets the renderer's own impact). */
export const DESIGN_SOUND = Object.freeze({ title: "boom", quote: "riser", document: "click", timeline: "whoosh", "kinetic-type": "impact" });

/** Words that are not a picture (what the words-only plan found for 993f09ea: "behind", "basics", "cause", "film"). */
const WEAK = /^(?:behind|basics?|cause|film|image|noise|detail|record|records|numbers?|accounts?|telling|thing|things|way|part|time|times|year|years|age|today|story|money|terms|word|words|kind|lot|end|start|first|note|reports?|later|decades?|others?|better|best|kept|same|most|next|other|whole|own|everything|nothing|something|someone|anyone|people|life|world|day|days|hand|hands)$/i;
const DOC_WORDS = /\b(?:tax bill|bill|filings?|headlines?|newspapers?|letters?|contracts?|licen[cs]es?|certificates?|receipts?|ledgers?|deeds?|invoices?|registration)\b/i;
const QUOTE_SAY = /\b(?:he|she|they|i) (?:has|have|had)? ?(?:said|says|told|recalls?|recalled|remembers?)\b|\bin (?:his|her|their) (?:own )?words\b/i;
const YEAR = /\b(1[89]\d\d|20[0-4]\d)\b/;
const STRONG = /\b(?:billionaire|millionaire|crores?|lakhs?|rolls[- ]?royce|died|broke|never|only|first|seven|every|nobody|none|no one|still|gone|stayed open)\b/i;

const clockText = (/** @type {number} */ t) => { const ms = Math.round(Math.max(0, t) * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const sec = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0"); return `${h}:${String(m).padStart(2, "0")}:${sec}`; };
const bareWord = (/** @type {string} */ w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/** Replace (or add) one field of a scene line, leaving every other field as it was. @param {string} line @param {string} k @param {string} v */
export function setField(line, k, v) {
  const re = new RegExp(`(\\|\\s${k}:\\s?)[^|]*?(?=\\s\\|\\s|$)`);
  return re.test(line) ? line.replace(re, `$1${v.replace(/\$/g, "$$$$")}`) : `${line} | ${k}: ${v}`;
}

/**
 * The scene's sentences with their spoken times (from the voice's own word times).
 * @param {VoiceScene} s @returns {{ text: string, start: number, end: number, words: number }[]}
 */
export function sentencesOf(s) {
  /** @type {{ text: string, start: number, end: number, words: number }[]} */
  const out = [];
  let cur = /** @type {import("./voice-scenes.mjs").TimedWord[]} */ ([]);
  const flush = () => { if (cur.length) out.push({ text: cur.map((w) => w.text).join(" ").trim(), start: cur[0].start, end: cur[cur.length - 1].end, words: cur.length }); cur = []; };
  for (const w of s.words) { cur.push(w); if (/[.!?]["”]?$/.test(w.text)) flush(); }
  flush();
  return out;
}

/** A short line for a card from a sentence the voice says (never new words): the sentence or one whole clause of it, at most 9 words; "" when none fits. @param {string} sentence @param {RegExp} [around] */
function cardLine(sentence, around) {
  const words = sentence.replace(/\s+/g, " ").trim().split(" ");
  if (words.length <= 9) return words.join(" ");
  // A clause (split at commas) that holds the key, if it is short enough.
  const clauses = sentence.split(/,\s*/).map((c) => c.trim()).filter((c) => c.split(" ").length >= 3);
  const hit = clauses.find((c) => (around ? around.test(c) : true) && c.split(" ").length <= 9);
  if (hit) return hit;
  // No whole clause fits a card: a cut mid-sentence reads badly, so this sentence gets no card.
  return "";
}

const FILLER_START = /^(?:in|from|even|despite|as|but|yet|within|if|when|after|before|so|then|that|this|it|there|we|our|for|on)\b/i;

/**
 * How much a card line carries: a number, a name, a strong word or a question count; a line that opens like
 * a link between sentences ("In the months after", "Despite these measures") counts less.
 * @param {string} line
 */
export function cardWeight(line) {
  const rest = line.split(" ").slice(1).join(" ");
  return (/\d/.test(line) ? 4 : 0) + (/(?:^|\s)[A-Z][a-z]/.test(rest) ? 2 : 0) + (STRONG.test(line) ? 1 : 0) + (/\?$/.test(line) ? 1 : 0) + (line.split(" ").length >= 5 ? 1 : 0) - (FILLER_START.test(line) && !/\d/.test(line) ? 2 : 0);
}

const BREAK_BEFORE = /^(?:and|but|when|because|while|which|until|after|before|where|who|so|yet|as|then)$/i;

/**
 * The best short phrase of a sentence for a card, cut only where speech breaks: at a comma, semicolon,
 * colon or dash, or before a joining word (and, but, when, because ...). 3 to 9 of the voice's own words,
 * the ones with a number, a name or a strong word first; "" when no phrase fits.
 * @param {string} sentence
 */
export function phraseLine(sentence) {
  const words = sentence.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  /** @type {string[][]} */
  const phrases = [[]];
  for (const w of words) {
    if (BREAK_BEFORE.test(w.replace(/[^A-Za-z]/g, "")) && phrases[phrases.length - 1].length) phrases.push([]);
    phrases[phrases.length - 1].push(w);
    if (/[,;:—–]$/.test(w)) phrases.push([]);
  }
  const clean = (/** @type {string[]} */ p) => p.join(" ").replace(/^[\s,;:—–-]+|[\s,;:.!?—–-]+$/g, "").replace(/^(?:and|but|so|yet|then)\s+/i, "");
  const fit = phrases.map(clean).filter((t) => { const n = t.split(" ").length; return n >= 3 && n <= 9; });
  return fit.sort((a, b) => cardWeight(b) - cardWeight(a) || Math.abs(a.split(" ").length - 6) - Math.abs(b.split(" ").length - 6))[0] ?? "";
}

/**
 * The designed moment a scene can carry, from its own words (null when it has none). Order of preference:
 * a timeline (two years said), a document (a bill, a filing, a headline), a quote (what a person said),
 * a kinetic line (a number, a name or a strong word).
 * @param {VoiceScene} s @param {any} beat @param {string} [person]
 * @returns {{ type: string, text: string, at: number, until: number, highlight?: string, paper?: boolean, items?: { year: string, label: string }[] } | null}
 */
export function designedMoment(s, beat, person = "") {
  const sentences = sentencesOf(s);
  const years = [...new Set([...s.narration.matchAll(/\b(1[89]\d\d|20[0-4]\d)\b/g)].map((m) => m[1]))];
  if (years.length >= 2) {
    // Each year with the few words the voice says after it (the label), in the order spoken.
    const items = years.map((y) => {
      const sent = sentences.find((x) => x.text.includes(y)) ?? sentences[0];
      const after = sent.text.slice(sent.text.indexOf(y) + 4).replace(/^[\s,.;:]+/, "").split(/[,.;]/)[0].trim().split(" ").slice(0, 5).join(" ");
      const before = sent.text.slice(0, sent.text.indexOf(y)).replace(/[\s,.;:]+$/, "").split(/[,.;]/).pop()?.trim().split(" ").slice(-5).join(" ") ?? "";
      return { year: y, label: after.length >= 3 ? after : before };
    });
    const first = sentences.find((x) => x.text.includes(years[0])) ?? sentences[0];
    return { type: "timeline", text: items.map((i) => `${i.year} ${i.label}`).join(" · "), at: first.start, until: s.end, items };
  }
  const doc = sentences.find((x) => DOC_WORDS.test(x.text));
  const docLine = doc ? cardLine(doc.text, DOC_WORDS) : "";
  if (doc && docLine) {
    const line = docLine;
    const key = /\b(?:billionaire \w+|tax bill|[\d,.]+ (?:rupees|crores?|lakhs?))\b/i.exec(line)?.[0] ?? DOC_WORDS.exec(line)?.[0] ?? "";
    return { type: "document", text: line, at: doc.start, until: Math.min(s.end, doc.end + 0.8), highlight: key, paper: !/headline|newspaper/i.test(doc.text) };
  }
  const said = sentences.find((x) => QUOTE_SAY.test(x.text));
  if (said && said.words <= 22) return { type: "quote", text: `“${said.text.replace(/[“”"]/g, "")}”${person ? ` — ${person}` : ""}`, at: said.start, until: Math.min(s.end, said.end + 0.6) };
  const strong = sentences.filter((x) => x.words >= 3 && cardLine(x.text, STRONG) !== "" && (STRONG.test(x.text) || /\d/.test(x.text) || (beat?.reveal && beat.reveal !== "none" && x.text.includes(String(beat.reveal).split(":")[0])))).sort((a, b) => a.words - b.words)[0];
  const strongLine = strong ? cardLine(strong.text, STRONG) : "";
  if (strong && strongLine) return { type: "kinetic-type", text: strongLine, at: strong.start, until: Math.min(s.end, strong.end + 0.5) };
  return null;
}

/** The picture type of a non-card shot: stock video for illustration, archive for the past, a photo for a named person. @param {string} rung @param {string} subject @param {any} beat @param {Set<string>} people @param {number} n */
function pictureType(rung, subject, beat, people, n) {
  const decadeStart = Number(/(\d{4})s/.exec(beat?.era ?? "")?.[1] ?? 0);
  const past = decadeStart > 0 && decadeStart < 2000;
  const person = people.has(subject.toLowerCase());
  if (rung === "R2" && person) return beat?.goal === "feel" || n % 3 === 2 ? "photo-designed" : "photo-2.5D";
  if (rung === "R2" && past) return "archival-video";
  return "live-video";
}

/** The camera move for a scene's pictures, from its emotion (alternated so two scenes in a row do not repeat). @param {string} emotion @param {string} prev */
function moveFor(emotion, prev) {
  const want = ["wonder", "triumph", "pride"].includes(emotion) ? "slow pull-out" : ["calm", "warmth", "hope"].includes(emotion) ? "slow drift" : ["struggle"].includes(emotion) ? "slow pan right" : "slow push-in";
  if (want !== prev) return want;
  return want === "slow push-in" ? "slow pan left" : want === "slow pull-out" ? "slow push-in" : "slow push-in";
}

/**
 * The shot plan of one voiceover chapter. In: the picture plan's scene lines (pictures.md), the voice's scenes,
 * the Director pass (beats.json). Out: the same scene lines with every shot re-cut to the genre's rhythm and
 * typed, designed moments on narration beats, the world in every picture's search, the shot table, the code
 * edit (sound cues and print frames for the Edit Director stage), and the findings of the code checks.
 * `rhythm` (optional) replaces the genre's rhythm: the Craft Ledger's calibrated one (craft-memory.mjs rhythmFrom), never looser.
 * @param {{ markdown: string, scenes: VoiceScene[], beats: any[], world: World, genre: string, topic?: string, structure?: Structure | null, rhythm?: { target: number, median: [number, number], max: number } }} o
 */
export function planShots(o) {
  const rhythm = o.rhythm ?? GENRE_RHYTHM[/** @type {keyof typeof GENRE_RHYTHM} */ (o.genre)] ?? GENRE_RHYTHM.documentary;
  const lines = parseSceneLines(o.markdown);
  const bySc = new Map(lines.map((l) => [l.sc, l]));
  const beatOf = (/** @type {VoiceScene} */ s) => o.beats.find((b) => s.start >= b.start - 0.01 && s.start < b.end - 0.01) ?? o.beats.at(-1) ?? null;
  const ents = o.structure?.entities ?? [];
  const people = new Set(ents.filter((e) => !e.place).map((e) => e.name.toLowerCase()));
  const lead = ents.filter((e) => !e.place).sort((a, b) => b.n - a.n)[0]?.name ?? "";
  const place = [o.world.city, o.world.country].filter(Boolean).join(", ");
  const where = o.world.city || o.world.country;

  // 1. Designed moments: the title by 0:40, then one moment at least every 45 s, each on a sentence the voice says.
  /** @type {Map<string, NonNullable<ReturnType<typeof designedMoment>>>} */
  const design = new Map();
  const title = String(o.topic ?? "").trim();
  if (title) {
    // The title lands as the hook's first claim ends: the first sentence that ends after 12 s, before 0:40.
    const s = o.scenes.find((x) => x.start >= 12 && x.start < HOOK.titleBy - 3) ?? o.scenes.find((x) => x.end > 12 && x.start < HOOK.titleBy - 3);
    if (s) design.set(s.sc, { type: "title", text: title, at: Math.max(s.start, 12), until: Math.min(s.end, Math.max(s.start, 12) + 3.5) });
  }
  let last = -Infinity, before = -Infinity, lastSc = "";
  for (const s of o.scenes) {
    if (design.has(s.sc)) { before = last; last = /** @type {any} */ (design.get(s.sc)).at; lastSc = s.sc; continue; }
    const m = designedMoment(s, beatOf(s), lead);
    // A timeline, document or quote is worth more than the kinetic line just before it: it takes that place.
    const prev = design.get(lastSc);
    if (m && m.type !== "kinetic-type" && prev?.type === "kinetic-type" && m.at - last < 12 && m.at - before >= 12) { design.delete(lastSc); last = before; }
    // A designed moment needs room: not within 12 s of the last one (15 s for a kinetic line), the gap fill below makes sure 45 s never pass without one.
    if (m && m.at - last >= (m.type === "kinetic-type" ? 15 : 12)) { design.set(s.sc, m); before = last; last = m.at; lastSc = s.sc; }
  }
  // A stretch of 45 s with no moment gets a kinetic line from a sentence said in it: the shortest whole sentence
  // or clause, else a phrase cut where the speech breaks (phraseLine). A gap that has none is passed over, never
  // the gaps after it (a 40-minute film has many), and the check below still reports it.
  const end = o.scenes.at(-1)?.end ?? 0;
  const skipped = new Set();
  for (let guard = 0; guard < 400; guard += 1) {
    const ats = [...design.values()].map((d) => d.at).sort((a, b) => a - b);
    const edges = [0, ...ats, end];
    let gapAt = -1;
    for (let i = 1; i < edges.length; i += 1) if (edges[i] - edges[i - 1] > HOOK.designEvery && !skipped.has(edges[i - 1])) { gapAt = edges[i - 1]; break; }
    if (gapAt < 0) break;
    const near = o.scenes.filter((s) => !design.has(s.sc) && s.end > gapAt + 8 && s.start < gapAt + HOOK.designEvery)
      .flatMap((s) => sentencesOf(s).filter((x) => x.start >= gapAt + 8 && x.start < gapAt + HOOK.designEvery).map((x) => ({ s, x })));
    // Two or more years said in the stretch: a timeline of them (each year with the voice's own few words beside it).
    const dated = near.flatMap(({ s, x }) => [...x.text.matchAll(/\b(1[89]\d\d|20[0-4]\d)\b/g)].map((m) => ({ s, x, year: m[1] })));
    const years = [...new Map(dated.map((d) => [d.year, d])).values()].slice(0, 5);
    if (years.length >= 2) {
      const items = years.map(({ x, year }) => {
        const after = x.text.slice(x.text.indexOf(year) + 4).replace(/^[\s,.;:]+/, "").split(/[,.;]/)[0].trim().split(" ").slice(0, 5).join(" ");
        const before = x.text.slice(0, x.text.indexOf(year)).replace(/[\s,.;:]+$/, "").split(/[,.;]/).pop()?.trim().split(" ").slice(-5).join(" ") ?? "";
        return { year, label: after.length >= 3 ? after : before };
      });
      const first = years[0];
      design.set(first.s.sc, { type: "timeline", text: items.map((i) => `${i.year} ${i.label}`).join(" · "), at: first.x.start, until: first.s.end, items });
      continue;
    }
    // Every line the stretch offers (whole sentences, clauses, phrases), the one that carries the most first.
    const pick = near.flatMap(({ s, x }) => [x.words >= 4 ? cardLine(x.text) : "", phraseLine(x.text)].filter(Boolean).map((line) => ({ s, x, line })))
      .sort((a, b) => cardWeight(b.line) - cardWeight(a.line) || a.line.split(" ").length - b.line.split(" ").length)[0];
    if (!pick) { skipped.add(gapAt); continue; }
    design.set(pick.s.sc, { type: "kinetic-type", text: pick.line, at: pick.x.start, until: Math.min(pick.s.end, pick.x.end + 0.5) });
  }

  // 2. Every scene re-cut to the rhythm: shots of the genre's length (shorter in the hook), each typed.
  /** @type {any[]} */
  const shots = [];
  const out = [];
  let prevMove = "", prevTrans = -9, prevEra = "", prevSubject = "";
  for (const [i, s] of o.scenes.entries()) {
    const line = bySc.get(s.sc);
    if (!line) continue;
    const beat = beatOf(s);
    const seconds = s.end - s.start;
    const target = s.start < HOOK.seconds ? HOOK.shotMax : rhythm.target;
    // The picture subjects the picture plan found, weak words out, the beat's own anchor and the world's street as fallbacks.
    const groups = String(line.fields.SRC ?? "").split(/;\s*/).map((g) => /\bQ1\s*["“]([^"”]+)["”]/.exec(g)?.[1]?.trim() ?? "").filter(Boolean);
    const anchor = String(line.fields.ANCHOR ?? "").trim();
    // Then the things the scene itself names ("a car rental company"), so one scene never shows one subject twice.
    const named = nounsAfterDeterminers(s.words).filter((x) => x.split(" ").length <= 4);
    let subjects = [...new Set([...groups, anchor, ...named].filter((x) => x && !WEAK.test(x) && !WEAK.test(x.split(" ").pop() ?? "")))];
    // A fragment of a longer subject ("Rolls" of "Rolls-Royce") is not a subject of its own.
    subjects = subjects.filter((x) => !subjects.some((y) => y !== x && y.toLowerCase().startsWith(x.toLowerCase())));
    const pool = where ? [`${where} street`, `${where} traffic`, `${where} market`, `${where} skyline`] : ["city street"];
    for (const p of pool) if (subjects.length < 4) subjects.push(p);
    if (subjects[0] === prevSubject && subjects.length > 1) subjects.push(/** @type {string} */ (subjects.shift()));
    const d = design.get(s.sc);
    // Cut points: the designed card where the voice says its line, pictures around it at the target length.
    /** @type {{ from: number, to: number, card: boolean }[]} */
    let parts = [];
    const cut = (/** @type {number} */ a, /** @type {number} */ b) => { const len = b - a; if (len <= 0.05) return; const n = Math.max(1, s.start < HOOK.seconds ? Math.ceil(len / target - 0.15) : Math.round(len / target), Math.ceil(len / rhythm.max)); for (let k = 0; k < n; k += 1) parts.push({ from: a + (len * k) / n, to: a + (len * (k + 1)) / n, card: false }); };
    if (d) {
      let a = Math.max(s.start, Math.min(d.at, s.end - 2.5));
      if (a - s.start < 1.2) a = s.start; // no sliver of picture before the card
      let b = Math.min(s.end, Math.max(a + 2.5, Math.min(d.until, a + 5)));
      if (s.end - b < 1.2) b = s.end;
      cut(s.start, a);
      parts.push({ from: a, to: b, card: true });
      cut(b, s.end);
    } else cut(s.start, s.end);
    const rung = /\bR2\b/.test(String(line.fields.SHOTS ?? "")) ? "R2" : "R3";
    const move = moveFor(beat?.emotion ?? "curiosity", prevMove);
    prevMove = move;
    const era = beat?.era || o.world.era || "";
    const shotText = [], src = [], types = [];
    let pic = 0;
    for (const [k, p] of parts.entries()) {
      const id = `${s.sc}-${k + 1}`;
      const time = parts.length > 1 ? `${clockText(p.from)}-${clockText(p.to)} ` : "";
      if (p.card && d) {
        const words = d.type === "document" && d.highlight ? `"${d.text}" highlight "${d.highlight}"` : `"${d.text.replace(/"/g, "'")}"`;
        shotText.push(`(${k + 1}) ${time}R1 ${d.type} card ${words}`);
        types.push(d.type);
        shots.push({ id, scene: s.sc, beat: beat?.id ?? "", start: r3(p.from), end: r3(p.to), seconds: r3(p.to - p.from), type: d.type, rung: "R1", subject: d.text, era, place, move: "graphic", sound: DESIGN_SOUND[/** @type {keyof typeof DESIGN_SOUND} */ (d.type)], ...(d.items ? { items: d.items } : {}) });
        continue;
      }
      const subject = subjects[pic % subjects.length];
      const type = pictureType(rung, subject, beat, people, pic);
      pic += 1;
      prevSubject = subject;
      // The Asset Search Strategist: the subject in its place first (and its decade for the archive), then the subject alone.
      const decadeWord = type === "archival-video" && /^\d{4}s/.test(era) ? ` ${era.slice(0, 5)}` : "";
      const q1 = people.has(subject.toLowerCase()) || !where || subject.toLowerCase().includes(where.toLowerCase()) ? subject : `${subject} ${where}${decadeWord}`;
      shotText.push(`(${k + 1}) ${time}${rung} ${subject}${era ? `, ${era}` : ""}`);
      src.push(q1 === subject ? `${subject} · Q1 "${subject}"` : `${subject} · Q1 "${q1}" Q2 "${subject}"`);
      types.push(type);
      shots.push({ id, scene: s.sc, beat: beat?.id ?? "", start: r3(p.from), end: r3(p.to), seconds: r3(p.to - p.from), type, rung, subject, era, place, move, sound: "" });
    }
    // Transitions: a flash on a jump in time or a reveal, a light leak into warmth, a whip into tension; rationed.
    const beatStart = beat && Math.abs(beat.start - s.start) < 0.01;
    let trans = "hard cut on the beat";
    if (i > 0 && beatStart && i - prevTrans >= 3) {
      if (beat.era && prevEra && beat.era !== prevEra) trans = "white flash";
      else if (["surprise", "triumph"].includes(beat.emotion)) trans = "white flash";
      else if (["warmth", "hope"].includes(beat.emotion)) trans = "light leak";
      else if (["tension", "fear"].includes(beat.emotion) && o.genre !== "history") trans = "whip pan";
      if (trans !== "hard cut on the beat") prevTrans = i;
    }
    if (beat?.era) prevEra = beat.era;
    const fx = [d?.type === "kinetic-type" || d?.type === "title" ? "FX-KINETIC" : "", d?.type === "document" && d.paper ? "FX-PAPER" : ""].filter(Boolean);
    let row = line.raw;
    row = setField(row, "SHOTS", shotText.join(" "));
    if (src.length) row = setField(row, "SRC", src.join("; "));
    row = setField(row, "TYPE", types.join("; "));
    if (fx.length) row = setField(row, "FX", fx.join(", "));
    row = setField(row, "TRANS", trans);
    row = setField(row, "MOTION", move);
    out.push(row);
  }
  const markdown = out.join("\n");
  // 3. The voice's words and times are put back, whatever happened above, and checked.
  const restored = restoreVoiceFields(markdown, o.scenes);
  const edit = codeEdit(shots, o.scenes);
  const findings = shotFindings({ markdown: restored, scenes: o.scenes, shots, world: o.world, genre: o.genre, topic: o.topic });
  return { markdown: restored, shots, edit, findings, hook: hookScore(shots, o.scenes) };
}

/**
 * The code's half of the edit: a sound cue on every designed moment, and print frames for designed photos.
 * Merged with the Edit Director's own choices and checked by validateEditPlan.
 * @param {any[]} shots @param {VoiceScene[]} scenes
 */
export function codeEdit(shots, scenes) {
  /** @type {Map<string, any>} */
  const by = new Map();
  const sceneOf = new Map(scenes.map((s) => [s.sc, s]));
  for (const sh of shots) {
    const s = sceneOf.get(sh.scene);
    if (!s) continue;
    const e = by.get(sh.scene) ?? { scene: sh.scene, punchIns: [], shakes: [], hits: [], why: "shot plan" };
    // The renderer already lands an impact on a kinetic card; the other moments get their own cue.
    if (sh.sound && sh.type !== "kinetic-type") {
      const at = Math.min(s.end - 0.35, Math.max(s.start + 0.35, sh.start + (sh.sound === "riser" ? 0 : 0.05)));
      if (at > s.start + 0.3 && at < s.end - 0.3) e.hits.push({ at: clockText(at), sound: sh.sound });
    }
    if (sh.type === "photo-designed") e.photo = { frame: "print" };
    if (e.hits.length || e.photo) by.set(sh.scene, e);
  }
  return [...by.values()];
}

/**
 * The hook in numbers, for the creator: visual beats (picture changes) in the first 30 s, when the title lands,
 * designed moments in the first minute, and a score out of 10 against the viral study's rules.
 * @param {any[]} shots @param {VoiceScene[]} scenes
 */
export function hookScore(shots, scenes) {
  const beats = shots.filter((s) => s.start < HOOK.seconds).length;
  const titleAt = shots.find((s) => s.type === "title")?.start ?? null;
  const designed = shots.filter((s) => DESIGNED_TYPES.includes(s.type) && s.start < 60).length;
  const firstWords = scenes[0]?.words[0]?.start ?? 0;
  let score = 0;
  score += Math.min(4, (beats / HOOK.beats) * 4);
  score += titleAt !== null && titleAt <= HOOK.titleBy ? 2 : 0;
  score += Math.min(2, designed);
  score += firstWords < 1.5 ? 1 : 0; // the voice starts at once: no logo, no silence
  score += shots.filter((s) => s.start < HOOK.seconds).every((s) => s.seconds <= HOOK.shotMax + 0.5) ? 1 : 0;
  return { beats, titleAt, designed, score: Math.round(score * 10) / 10, of: 10 };
}

/**
 * The code checks of a shot plan. Each finding has a code a person can read; a good plan has none.
 * @param {{ markdown: string, scenes: VoiceScene[], shots: any[], world: World, genre: string, topic?: string }} o
 */
export function shotFindings(o) {
  /** @type {{ shot: string, code: string, detail: string }[]} */
  const out = [];
  const rhythm = GENRE_RHYTHM[/** @type {keyof typeof GENRE_RHYTHM} */ (o.genre)] ?? GENRE_RHYTHM.documentary;
  for (const f of checkVoiceChapter(o.markdown, o.scenes)) out.push({ shot: f.scene ?? "-", code: f.code, detail: f.detail });
  const said = o.scenes.map((s) => s.narration).join(" ").replace(/\s+/g, " ");
  const lines = new Map(parseSceneLines(o.markdown).map((l) => [l.sc, l]));
  for (const sh of o.shots) {
    if (!SHOT_TYPES.includes(sh.type)) out.push({ shot: sh.id, code: "type-unknown", detail: `type "${sh.type}"` });
    if (sh.seconds > rhythm.max + 0.05 && !DESIGNED_TYPES.includes(sh.type)) out.push({ shot: sh.id, code: "hold-too-long", detail: `${sh.seconds} s on one picture (the ${o.genre} limit is ${rhythm.max} s)` });
    if (DESIGNED_TYPES.includes(sh.type) && sh.type !== "title") {
      // A card shows only words the voice says (the timeline's years and labels, the quote, the kinetic line).
      const parts = sh.type === "timeline" ? (sh.items ?? []).flatMap((/** @type {any} */ i) => [i.year, i.label]) : [sh.subject.replace(/^“|”(?: — .*)?$/g, "")];
      for (const p of parts) if (p && !said.includes(p)) out.push({ shot: sh.id, code: "card-words-invented", detail: `"${p}" is not in the voice` });
    }
    if (o.world.currency && o.world.currency !== "dollars" && DOLLAR.test(sh.subject) && !DOLLAR.test(said)) out.push({ shot: sh.id, code: "wrong-currency", detail: sh.subject });
    const foreign = o.world.country ? WORLDS.filter((w) => w.country !== o.world.country).flatMap((w) => [w.country, ...w.cities]).filter((n) => new RegExp(`\\b${n}\\b`, "i").test(sh.subject) && !said.includes(n)) : [];
    if (foreign.length) out.push({ shot: sh.id, code: "wrong-place", detail: foreign.join(", ") });
    if (!sh.rung || (sh.type !== "title" && !DESIGNED_TYPES.includes(sh.type) && WEAK.test(sh.subject))) out.push({ shot: sh.id, code: "weak-subject", detail: `"${sh.subject}"` });
  }
  // Every shot the scene lines carry has its type, in order.
  for (const [sc, l] of lines) {
    const n = (String(l.fields.SHOTS ?? "").match(/\(\d+\)/g) ?? []).length;
    const t = String(l.fields.TYPE ?? "").split(/;\s*/).filter(Boolean);
    if (n !== t.length) out.push({ shot: sc, code: "type-missing", detail: `${n} shots, ${t.length} types` });
  }
  // The genre's rhythm and the hook.
  const lens = o.shots.map((s) => s.seconds).sort((a, b) => a - b);
  const median = lens.length ? lens[Math.floor(lens.length / 2)] : 0;
  if (lens.length && (median < rhythm.median[0] || median > rhythm.median[1])) out.push({ shot: "-", code: "rhythm-off", detail: `median shot ${median} s (the ${o.genre} band is ${rhythm.median.join("-")} s)` });
  const film = o.scenes.at(-1)?.end ?? 0;
  const hook = hookScore(o.shots, o.scenes);
  if (film >= HOOK.seconds && hook.beats < HOOK.beats) out.push({ shot: "-", code: "hook-slow", detail: `${hook.beats} visual beats in the first 30 s (at least ${HOOK.beats})` });
  if (o.topic && film >= HOOK.titleBy && (hook.titleAt === null || hook.titleAt > HOOK.titleBy)) out.push({ shot: "-", code: "title-late", detail: hook.titleAt === null ? "no title" : `title at ${hook.titleAt} s` });
  const ats = [0, ...o.shots.filter((s) => DESIGNED_TYPES.includes(s.type)).map((s) => s.start), film];
  for (let i = 1; i < ats.length; i += 1) if (ats[i] - ats[i - 1] > HOOK.designEvery + 0.05) out.push({ shot: "-", code: "design-gap", detail: `no designed moment from ${Math.round(ats[i - 1])} s to ${Math.round(ats[i])} s` });
  return out;
}

/**
 * A free brain often times a moment from the scene's start ("0:00:02.0" in a scene at 2:27): when a time falls
 * before its scene and the same time from the scene's start falls inside it, it is read that way.
 * @param {any} x @param {{ start: number, end: number } | undefined} b
 */
function sceneClock(x, b) {
  if (!b) return x;
  const fix = (/** @type {any} */ t) => {
    const n = typeof t === "number" ? t : toSeconds(String(t));
    return Number.isFinite(n) && n < b.start && b.start + n > b.start + 0.3 && b.start + n < b.end - 0.3 ? clockText(b.start + n) : t;
  };
  return { ...x, punchIns: (x.punchIns ?? []).map(fix), shakes: (x.shakes ?? []).map(fix), hits: (x.hits ?? []).map((/** @type {any} */ h) => ({ ...h, at: fix(h?.at) })) };
}

/** The first JSON object in a reply (a fenced block or bare). @param {string} text */
function replyJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1] ?? text;
  const a = fenced.indexOf("{"), b = fenced.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try { return JSON.parse(fenced.slice(a, b + 1)); } catch { return null; }
}

/**
 * The Edit Director stage (edit-director.mjs, the same one film-run.mjs runs) on a voiceover chapter: a free
 * brain decides transitions, punch-ins, shakes, photo framing and sound hits in batches of scene lines (so a
 * free brain's limit holds; a used-up quota stops it), the code's own cues are merged in, and validateEditPlan
 * keeps only what is valid. With no brain the code's edit alone is checked and kept.
 * @param {{ markdown: string, chapter?: string, genre?: string, brain?: Model | null, code?: any[], batchChars?: number, maxCalls?: number }} o
 */
export async function directEdit(o) {
  const chapter = o.chapter ?? "C1";
  const laid = buildTimeline({ chapters: [{ id: chapter, markdown: o.markdown }], autoSound: false });
  const holds = longHolds(laid.video, new Set(laid.narration.map((n) => n.scene)));
  /** @type {any[]} */
  const brainScenes = [];
  const bounds = new Map(parseSceneLines(o.markdown).map((l) => [l.sc, { start: l.start, end: l.end }]));
  let calls = 0, answered = 0, stopped = "";
  if (o.brain) {
    const rows = editSheet(o.markdown).split("\n");
    const batches = /** @type {string[][]} */ ([[]]);
    for (const r of rows) { const b = batches[batches.length - 1]; if (b.length && b.join("\n").length + r.length > (o.batchChars ?? 7000)) batches.push([r]); else b.push(r); }
    for (const b of batches) {
      if (stopped || calls >= (o.maxCalls ?? 20) || !b.length) break;
      calls += 1;
      const scs = new Set(b.map((r) => /^SC\d+/.exec(r)?.[0]));
      try {
        const reply = await o.brain.call({ stage: "V5", system: [{ text: "You are a documentary film editor. Answer with one JSON block only.", cache: true }], messages: [{ role: "user", content: [{ text: editInstruction(chapter, b.join("\n"), `a ${o.genre ?? "documentary"} voiceover film`, holds.filter((h) => scs.has(h.scene))) }] }], maxTokens: 4000, effort: "medium" });
        const j = replyJson(String(reply.text ?? ""));
        const list = Array.isArray(j) ? j : Array.isArray(j?.scenes) ? j.scenes : [];
        if (j) answered += 1;
        for (const x of list) if (x && scs.has(x.scene)) brainScenes.push(sceneClock(x, bounds.get(x.scene)));
      } catch (e) {
        if (/** @type {any} */ (e)?.status === 429 || /** @type {any} */ (e)?.permanent) stopped = String(/** @type {any} */ (e)?.message ?? e).slice(0, 160);
      }
    }
  }
  // The code's cues first (they sit on the designed moments), then the director's additions to the same scenes.
  /** @type {Map<string, any>} */
  const merged = new Map();
  for (const c of o.code ?? []) merged.set(c.scene, { ...c, hits: [...c.hits], punchIns: [...c.punchIns], shakes: [...c.shakes] });
  for (const b of brainScenes) {
    const m = merged.get(b.scene);
    if (!m) { merged.set(b.scene, b); continue; }
    merged.set(b.scene, { ...b, ...m, transition: b.transition, punchIns: [...(b.punchIns ?? [])], shakes: [...(b.shakes ?? [])], hits: [...m.hits, ...(b.hits ?? [])], photo: { ...(b.photo ?? {}), ...(m.photo ?? {}) }, why: [m.why, b.why].filter(Boolean).join("; ") });
  }
  // Clock strings for every time (the director writes "h:mm:ss.s"; the code already does).
  const edit = validateEditPlan({ scenes: [...merged.values()] }, o.markdown, chapter);
  const left = uncoveredHolds(holds, edit);
  return { edit: { ...edit, holds: { found: holds.length, uncovered: left.map((h) => h.id) } }, stats: { ...editStats(edit), longHolds: holds.length, uncovered: left.length }, calls, answered, stopped, fromBrain: brainScenes.length };
}
