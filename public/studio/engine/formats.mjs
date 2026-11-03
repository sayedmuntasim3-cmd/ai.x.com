/**
 * Viral documentary formats the studio offers as presets, from the owner's
 * 39 example videos (Ruhi Cenet, Cleo Abram, Yarnhub, colourised history,
 * Deadliest Journeys and others) and research into what each kind of video
 * does. A preset sets the length range, the hook, the beats, the visuals and
 * the music; the agents still write an original film every time, so no two
 * videos share a template (YouTube's "inauthentic content" rule).
 * Planning guidance from genre practice, not measured numbers.
 */

/**
 * @typedef {{
 *   id: string, name: string, minutes: [number, number], hook: string, beats: string[],
 *   visuals: string, music: string, examples: string[], mode: "documentary" | "story",
 * }} FilmFormat
 */

/** @type {readonly FilmFormat[]} */
export const FORMATS = Object.freeze([
  { id: "true-story-reenactment", name: "Re-enacted true story", minutes: [12, 25], mode: "documentary",
    hook: "An unbelievable one-line premise about one named person (\"When a B-17's tail fell with the gunner still inside\").",
    beats: ["cold open at peak danger", "who the person is", "the mission or goal", "the problem", "escalation", "climax", "aftermath: what happened to them"],
    visuals: "cinematic re-enactment with one consistent cast, maps, exact dates on screen", music: "orchestral, percussive", examples: ["Yarnhub", "Simple History"] },
  { id: "rags-to-riches", name: "Rags to riches / riches to ruin", minutes: [15, 45], mode: "documentary",
    hook: "A dollar figure and a contrast (\"He had $47. Ten years later...\").",
    beats: ["the end state first", "the hard beginning", "the first break", "the big mistake", "the comeback", "the price paid", "where they are now"],
    visuals: "places, objects, money graphics, archive where licensed", music: "emotional build, silence before reveals", examples: ["MagnatesMedia", "ColdFusion"] },
  { id: "motivational-life-story", name: "Motivational real-life story", minutes: [10, 30], mode: "documentary",
    hook: "The moment everything was lost, before we know who they are.",
    beats: ["the low point", "the wound and the want", "failed attempts", "the turn", "the climb", "the lesson shown, never stated"],
    visuals: "intimate, hands and places, slow push-ins", music: "piano and strings", examples: ["Dhar Mann (scripted, not documentary)"] },
  { id: "place-nobody-can-visit", name: "Place nobody can visit", minutes: [15, 30], mode: "documentary",
    hook: "The rule that makes the place impossible (\"the most evil are kept here\").",
    beats: ["the approach", "the rules", "inside", "the people", "the shocking detail", "leaving"],
    visuals: "aerials, slow reveals, maps", music: "tension drones", examples: ["Ruhi Cenet Documentaries"] },
  { id: "deadliest-journey", name: "Deadliest or impossible journey", minutes: [40, 50], mode: "documentary",
    hook: "An extreme vehicle or route and the crew who live on it.",
    beats: ["departure", "first hardship", "breakdown", "the human cost", "arrival"],
    visuals: "observational, handheld, route map", music: "local instruments, ambience", examples: ["Deadliest Journeys"] },
  { id: "history-epic", name: "History epic (archive, colourised)", minutes: [40, 90], mode: "documentary",
    hook: "A famous date or name, plus \"in colour\" or \"never seen\".",
    beats: ["chronological acts with chapter cards", "turning points", "the end and its legacy"],
    visuals: "restored public-domain archive, Ken Burns moves, date supers", music: "solemn strings", examples: ["Hitler in Colour", "June 6, 1944 - The Light of Dawn"] },
  { id: "history-in-minutes", name: "Whole history in N minutes", minutes: [10, 20], mode: "documentary",
    hook: "The size of the promise (\"423 years in 13 minutes\").",
    beats: ["fast eras", "one surprising thread through all of them", "where it leads today"],
    visuals: "animated maps and timelines", music: "driving score", examples: ["423 Years of American History in 13 Minutes"] },
  { id: "other-side", name: "The other side of a famous event", minutes: [15, 30], mode: "documentary",
    hook: "A known event \"from the enemy's perspective\".",
    beats: ["what they believed", "what they missed", "the turning point", "what it cost them"],
    visuals: "re-enactment, maps", music: "restrained, tragic", examples: ["Yarnhub: Midway from the Japanese perspective"] },
  { id: "inner-circle", name: "Rise, betrayal and fall of an inner circle", minutes: [40, 90], mode: "documentary",
    hook: "\"The men behind...\".",
    beats: ["one chapter per person", "alliances", "betrayal", "downfall or trial"],
    visuals: "portraits, dossier graphics, archive", music: "dark ambient", examples: ["Hitler and the Lords of Evil"] },
  { id: "dark-business-expose", name: "Dark business exposé", minutes: [15, 40], mode: "documentary",
    hook: "A company everyone uses, and the thing they hide.",
    beats: ["the promise", "the first crack", "the evidence", "who profits", "what happens next"],
    visuals: "documents, charts, archive", music: "pulse and drones", examples: ["Moon", "Fern", "BlackRock Is Terrifying"] },
  { id: "money-explainer", name: "Money explainer: how it really works", minutes: [12, 25], mode: "documentary",
    hook: "A question with a number (\"Which rich country goes bankrupt first?\").",
    beats: ["the question", "how it works", "the hidden mechanism", "the stakes for the viewer", "the answer"],
    visuals: "data graphics, maps, kinetic type", music: "light, curious", examples: ["How Money Works", "OBF", "Statrys"] },
  { id: "big-question-science", name: "Big question / deep-time science", minutes: [15, 90], mode: "documentary",
    hook: "\"What's really under...\" or \"where did we come from?\".",
    beats: ["the question", "what we thought", "the new discovery", "eras as chapters", "what it means for us"],
    visuals: "reconstructions, NASA and science imagery, graphics", music: "awe-inspiring score", examples: ["Cleo Abram", "Lost Worlds"] },
  { id: "mystery-investigation", name: "Mystery investigation", minutes: [20, 60], mode: "documentary",
    hook: "The detail that should not exist.",
    beats: ["the case", "the evidence", "the theories", "what was missed", "the most likely answer"],
    visuals: "evidence boards, maps, archive", music: "suspense", examples: ["LEMMiNO", "MrBallen"] },
  { id: "numbered-compilation", name: "Numbered compilation", minutes: [60, 120], mode: "documentary",
    hook: "\"7 incredible...\" built from the channel's own earlier films.",
    beats: ["ranked or themed entries", "a cliffhanger between entries"],
    visuals: "the channel's own footage", music: "per entry", examples: ["Yarnhub: 7 Incredible Tank Battles"] },
  { id: "dramatized-story", name: "Original dramatized story (idea mode)", minutes: [1, 60], mode: "story",
    hook: "The impossible image and one question inside 3 seconds.",
    beats: ["see story-mode.mjs planStory"],
    visuals: "stock, graphics and disclosed AI scenes only where stock cannot", music: "per version policy", examples: ["owner's ideas: $50 to a Rolls-Royce, the baby dragon"] },
]);

/** @param {string} id */
export function getFormat(id) {
  return FORMATS.find((format) => format.id === id) ?? null;
}

/**
 * Suggest a format for a topic from simple cues; the intake agents refine it.
 * @param {string} text
 */
export function suggestFormat(text) {
  const t = String(text ?? "").toLowerCase();
  /** @type {[RegExp, string][]} */
  const cues = [
    [/\b(when|how) (a|an|the) .*(shot down|survived|fell|ambush)/, "true-story-reenactment"],
    [/\bfrom the .*perspective\b|\bother side\b/, "other-side"],
    [/\b(economy|inflation|interest rates?|country goes|countries|which .*country|how .*money works)\b/, "money-explainer"],
    [/\$\s?\d|rolls|billionaire|millionaire|rags|broke|টাকা|ডলার|বিলিয়নিয়ার/, "rags-to-riches"],
    [/\bprison|forbidden|closest town|cave|island nobody\b/, "place-nobody-can-visit"],
    [/\bjourney|river|road|deadliest\b/, "deadliest-journey"],
    [/\bin \d+ minutes\b|history of\b|\bentire history\b/, "history-in-minutes"],
    [/\b(19[0-4]\d|ww2|world war|in colou?r)\b/, "history-epic"],
    [/\bscam|exposed|terrifying|dark side|secret of\b/, "dark-business-expose"],
    [/\bmystery|unsolved|disappear|conspiracy\b/, "mystery-investigation"],
    [/\bunder antarctica|universe|origin|evolution|science\b/, "big-question-science"],
    [/\bmotivat|struggle|never gave up|স্ট্রাগল|মোটিভেশন\b/, "motivational-life-story"],
  ];
  for (const [re, id] of cues) if (re.test(t)) return getFormat(id);
  return getFormat("motivational-life-story");
}
