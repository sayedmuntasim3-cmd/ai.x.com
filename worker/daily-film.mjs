/**
 * The daily film (one voiceover documentary a day, good or bad, so the Craft Ledger learns).
 * Pure: the topic queue and the choice of the next topic. The Worker starts it once a day
 * (wrangler.jsonc triggers, worker/voice-api.mjs startDailyFilm); the runner writes the script
 * (render/daily-script.mjs), narrates it (render/daily-voice.mjs) and the voice goes through the
 * same voiceover pipeline as an uploaded voice (voice-film.yml).
 *
 * Niche (owner, 26 Nov 2026): Engineering Disasters & Megaprojects, for a US audience. Every topic
 * is a well-documented story with a long English Wikipedia article (the script's only fact source).
 * `say` is how the free narrator (Kokoro) should pronounce a hard name (engine/src/narrator.mjs lexicon).
 */

/** @typedef {{ term: string, say: string }} LexiconEntry */
/** @typedef {{ id: string, title: string, question: string, pillar: "A" | "B" | "C" | "D", wiki: string[], lexicon: LexiconEntry[] }} DailyTopic */

/** @type {readonly DailyTopic[]} */
export const DAILY_TOPICS = Object.freeze([
  { id: "tacoma-narrows-1940", title: "Galloping Gertie: the fall of the Tacoma Narrows Bridge", question: "How did a brand-new bridge, built on the best theory of its day, shake itself apart in a moderate wind?", pillar: "A", wiki: ["Tacoma Narrows Bridge (1940)", "Leon Moisseiff"], lexicon: [{ term: "Moisseiff", say: "Moy-safe" }, { term: "Farquharson", say: "Far-kerson" }] },
  { id: "st-francis-dam", title: "The St. Francis Dam: the night a dam failed Los Angeles", question: "Why did a dam that its famous builder had inspected that very day collapse before midnight?", pillar: "A", wiki: ["St. Francis Dam"], lexicon: [{ term: "Francisquito", say: "Fran-sis-keeto" }] },
  { id: "hoover-dam", title: "Hoover Dam: taming the Colorado River", question: "How did thousands of workers in the Great Depression pour a dam that still holds back Lake Mead?", pillar: "B", wiki: ["Hoover Dam"], lexicon: [] },
  { id: "panama-canal", title: "The Panama Canal: the shortcut that nearly could not be built", question: "Why did France fail at Panama, and what did the United States do differently to finish the canal?", pillar: "B", wiki: ["History of the Panama Canal"], lexicon: [{ term: "Lesseps", say: "Less-ups" }, { term: "Gatun", say: "Gah-toon" }, { term: "Culebra", say: "Koo-lay-bra" }, { term: "Goethals", say: "Go-thulls" }] },
  { id: "hyatt-regency-walkway", title: "The Hyatt Regency walkway collapse", question: "How did one small change to a steel rod turn a hotel dance into the deadliest structural failure in American history at the time?", pillar: "A", wiki: ["Hyatt Regency walkway collapse"], lexicon: [] },
  { id: "quebec-bridge", title: "The Quebec Bridge: the bridge that fell twice", question: "How did the longest cantilever bridge in the world collapse during construction, not once, but twice?", pillar: "A", wiki: ["Quebec Bridge"], lexicon: [] },
  { id: "johnstown-flood", title: "The Johnstown Flood and the South Fork Dam", question: "How did a neglected dam owned by a club of wealthy men wipe out a Pennsylvania town in under an hour?", pillar: "A", wiki: ["Johnstown Flood"], lexicon: [{ term: "Conemaugh", say: "Conna-maw" }] },
  { id: "brooklyn-bridge", title: "The Brooklyn Bridge: fourteen years over the East River", question: "How did a family of engineers build the longest suspension bridge of its time when the work crippled the men who led it?", pillar: "B", wiki: ["Brooklyn Bridge"], lexicon: [{ term: "Roebling", say: "Robe-ling" }] },
  { id: "silver-bridge", title: "The Silver Bridge: a single crack at rush hour", question: "How could one flaw smaller than a coin bring down a whole bridge across the Ohio River?", pillar: "A", wiki: ["Silver Bridge"], lexicon: [] },
  { id: "teton-dam", title: "The Teton Dam: the new dam that failed while filling", question: "Why did a brand-new earthen dam in Idaho fail the very first time its reservoir filled?", pillar: "A", wiki: ["Teton Dam"], lexicon: [{ term: "Teton", say: "Tee-ton" }] },
  { id: "i35w-bridge", title: "The I-35W bridge collapse in Minneapolis", question: "How did a busy interstate bridge that had passed its inspections fall into the Mississippi River at rush hour?", pillar: "A", wiki: ["I-35W Mississippi River bridge"], lexicon: [{ term: "I-35W", say: "I thirty-five W" }] },
  { id: "citicorp-center", title: "Citicorp Center: the skyscraper that was secretly unsafe", question: "What did engineers find in a new Manhattan tower, and how did they fix it before anyone was hurt?", pillar: "D", wiki: ["Citicorp Center engineering crisis"], lexicon: [{ term: "LeMessurier", say: "Luh-measure" }, { term: "Citicorp", say: "Citty-corp" }] },
  { id: "golden-gate-bridge", title: "The Golden Gate Bridge: spanning the strait they said could not be bridged", question: "How did engineers hang a bridge across one of the windiest, deepest harbor mouths in America?", pillar: "B", wiki: ["Golden Gate Bridge"], lexicon: [] },
  { id: "great-molasses-flood", title: "The Great Molasses Flood of Boston", question: "How did a giant tank of molasses burst and send a deadly wave through a Boston neighborhood?", pillar: "A", wiki: ["Great Molasses Flood"], lexicon: [] },
  { id: "big-dig", title: "The Big Dig: Boston's buried highway", question: "How did a plan to bury one highway become the most expensive highway project in American history?", pillar: "B", wiki: ["Big Dig"], lexicon: [] },
]);

/** @param {string} id */
export const dailyTopic = (id) => DAILY_TOPICS.find((t) => t.id === id) ?? null;

/**
 * The next topic in the queue that no earlier daily film has used; null when all are used.
 * @param {Iterable<string>} used topic ids that already have a voice (uploaded), never repeated
 */
export function nextDailyTopic(used) {
  const done = new Set(used);
  return DAILY_TOPICS.find((t) => !done.has(t.id)) ?? null;
}
