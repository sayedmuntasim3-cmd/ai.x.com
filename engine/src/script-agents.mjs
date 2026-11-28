/**
 * The script-side agents of the crew, as free code checks (no paid API), for EVERY film:
 * research-freshness, research-geography, research-peer-review, story-exposition.
 * Each takes the film's own spoken lines ({ sc, start, narration }) and returns findings
 * { role, scene, code, severity, detail, fix }. They run on voiceover films (local/voice-film.mjs)
 * and on script films (any chapter's scenes). They never rewrite words: a finding names the scene
 * and what to re-check, so the picture and the voice stay as recorded.
 */

/** @typedef {{ sc: string, start?: number, end?: number, narration: string }} Line */
/** @typedef {{ role: string, scene: string, code: string, severity: "warn" | "block", detail: string, fix: string }} AgentFinding */

/** @param {string} t @returns {string[]} */
export function sentencesOf(t) {
  return String(t).replace(/\s+/g, " ").split(/(?<=[.!?…])["”’]?\s+(?=["“‘]?[A-Z0-9])/).map((x) => x.trim()).filter(Boolean);
}

const YEAR = /\b(1[5-9]\d\d|20[0-4]\d)\b/;

/**
 * research-freshness: a claim that is true only today ("currently", "the latest", "the largest ever",
 * "still") needs a date or a re-check before the film goes up, because the film is watched for years.
 * @param {Line[]} lines @param {{ now?: Date }} [o]
 * @returns {AgentFinding[]}
 */
export function researchFreshness(lines, o = {}) {
  const now = (o.now ?? new Date()).getUTCFullYear();
  const live = /\b(currently|right now|at the moment|today|nowadays|this year|so far|to date|up to now|the latest|the newest|still (?:the|stands|holds|operates|in use|standing)|is now|are now|remains the|the (?:largest|tallest|longest|fastest|biggest|deepest|oldest|most powerful)\b[^.]{0,40}(?:in the world|ever built|on earth|today))/i;
  /** @type {AgentFinding[]} */
  const out = [];
  for (const l of lines) for (const s of sentencesOf(l.narration)) {
    const m = live.exec(s);
    if (!m) continue;
    const years = [...s.matchAll(new RegExp(YEAR, "g"))].map((x) => Number(x[1]));
    // "As of 2024", or any recent year in the same sentence, dates the claim.
    if (years.some((y) => y >= now - 1)) continue;
    out.push({ role: "research-freshness", scene: l.sc, code: "stale-risk", severity: "warn", detail: `"${s.slice(0, 110)}" is true only for a moment ("${m[0]}")`, fix: "Add the year it was true (\"as of 2026\") or say it in the past tense, and re-check it on the day of upload." });
  }
  return out;
}

/**
 * Places the checker knows, with what each sits inside. Not a map of the world: the places an engineering
 * and space documentary names most. A pair the film says that contradicts this list is a finding; a place the
 * list does not know is only listed as "not verified".
 * @type {Readonly<Record<string, string>>}
 */
export const GAZETTEER = Object.freeze({
  "cape canaveral": "florida", "kennedy space center": "florida", "merritt island": "florida", "houston": "texas", "johnson space center": "texas",
  "cape kennedy": "florida", "huntsville": "alabama", "marshall space flight center": "alabama", "cocoa beach": "florida",
  "white sands": "new mexico", "edwards air force base": "california", "vandenberg": "california", "mojave": "california",
  "hoover dam": "nevada", "golden gate bridge": "california", "san francisco": "california", "los angeles": "california", "las vegas": "nevada",
  "chernobyl": "ukraine", "pripyat": "ukraine", "kyiv": "ukraine", "fukushima": "japan", "tokyo": "japan", "kyoto": "japan", "osaka": "japan",
  "three mile island": "pennsylvania", "harrisburg": "pennsylvania", "pittsburgh": "pennsylvania", "philadelphia": "pennsylvania",
  "new orleans": "louisiana", "baton rouge": "louisiana", "galveston": "texas", "dallas": "texas", "austin": "texas", "chicago": "illinois",
  "detroit": "michigan", "boston": "massachusetts", "seattle": "washington", "tacoma": "washington", "portland": "oregon",
  "denver": "colorado", "phoenix": "arizona", "tucson": "arizona", "atlanta": "georgia", "miami": "florida", "orlando": "florida",
  "manhattan": "new york", "brooklyn": "new york", "buffalo": "new york",
  "london": "united kingdom", "manchester": "united kingdom", "liverpool": "united kingdom", "edinburgh": "united kingdom", "belfast": "united kingdom",
  "paris": "france", "lyon": "france", "marseille": "france", "berlin": "germany", "munich": "germany", "hamburg": "germany",
  "rome": "italy", "milan": "italy", "venice": "italy", "madrid": "spain", "barcelona": "spain", "lisbon": "portugal",
  "moscow": "russia", "saint petersburg": "russia", "baikonur": "kazakhstan", "bhopal": "india", "mumbai": "india", "delhi": "india", "kolkata": "india",
  "dhaka": "bangladesh", "chittagong": "bangladesh", "karachi": "pakistan", "lahore": "pakistan", "beijing": "china", "shanghai": "china", "wuhan": "china",
  "sydney": "australia", "melbourne": "australia", "toronto": "canada", "vancouver": "canada", "montreal": "canada",
  "rio de janeiro": "brazil", "sao paulo": "brazil", "buenos aires": "argentina", "cairo": "egypt", "giza": "egypt", "lagos": "nigeria", "nairobi": "kenya",
  "istanbul": "turkey", "ankara": "turkey", "tehran": "iran", "baghdad": "iraq", "dubai": "united arab emirates", "riyadh": "saudi arabia", "mecca": "saudi arabia",
  "panama canal": "panama", "suez canal": "egypt", "channel tunnel": "united kingdom",
  "texas": "united states", "florida": "united states", "california": "united states", "nevada": "united states", "new york": "united states",
  "alabama": "united states", "louisiana": "united states", "pennsylvania": "united states", "washington": "united states", "colorado": "united states",
  "kazakhstan": "asia", "ukraine": "europe", "japan": "asia", "india": "asia", "bangladesh": "asia", "china": "asia", "france": "europe", "germany": "europe",
});

const ZONES = new Set(["united states", "united kingdom", "europe", "asia", "africa", "canada", "australia", "russia"]);
/** Everything that holds other places in the list: states, countries, regions. */
const CONTAINERS = new Set([...Object.values(GAZETTEER), ...ZONES]);
const CASED = "(?:[A-Z][a-zA-Z.'-]+(?:\\s+(?:of|de|la|the)\\s+[A-Z][a-zA-Z.'-]+|\\s+[A-Z][a-zA-Z.'-]+)*)";

/** @param {string} s */
const norm = (s) => s.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * research-geography: "Houston, Florida" or "Cape Canaveral in Texas" says one known place sits inside
 * another it does not. Places the list does not know are returned as unverified for the research desk.
 * @param {Line[]} lines
 * @returns {{ findings: AgentFinding[], unverified: { name: string, scenes: string[] }[], verified: number }}
 */
export function researchGeography(lines) {
  /** @type {AgentFinding[]} */
  const findings = [];
  let verified = 0;
  /** @type {Map<string, Set<string>>} */
  const unknown = new Map();
  const pair = new RegExp(`\\b(${CASED})\\s*(?:,|\\bin\\b|\\bof\\b|\\bnear\\b|\\bat\\b)\\s*(${CASED})`, "g");
  for (const l of lines) {
    for (const s of sentencesOf(l.narration)) {
      for (const m of s.matchAll(pair)) {
        const a = norm(m[1]), b = norm(m[2]);
        const home = GAZETTEER[a];
        if (!home || !CONTAINERS.has(b)) continue;
        // b is a state, country or region: it must be the place's own, or one above it.
        if (b === home || GAZETTEER[home] === b || (GAZETTEER[home] !== undefined && GAZETTEER[GAZETTEER[home]] === b)) { verified += 1; continue; }
        findings.push({ role: "research-geography", scene: l.sc, code: "place-contradiction", severity: "warn", detail: `"${m[0]}": ${m[1]} is usually in ${home}, not ${m[2]}`, fix: `Say "${m[1]}, ${home.replace(/\b\w/g, (c) => c.toUpperCase())}", or confirm this is a different place of the same name.` });
      }
      // Capitalised words after in / at / near are places; those the list does not know are for the desk to verify.
      for (const m of s.matchAll(new RegExp(`\\b(?:in|at|near|from|to|outside)\\s+(${CASED})`, "g"))) {
        const n = norm(m[1]);
        if (!n || GAZETTEER[n] !== undefined || ZONES.has(n) || /^(the|a|an|this|that|his|her|their|our|my|its|one|two|three)\b/.test(n)) continue;
        if (!unknown.has(m[1])) unknown.set(m[1], new Set());
        /** @type {Set<string>} */ (unknown.get(m[1])).add(l.sc);
      }
    }
  }
  const unverified = [...unknown.entries()].map(([name, set]) => ({ name, scenes: [...set] })).slice(0, 40);
  return { findings, unverified, verified };
}

/**
 * research-peer-review: a claim that a study, scientists or experts found something needs a named source in
 * the same or the neighbouring sentence (an institution, a journal, a year, a "according to X"). Without one it
 * is a finding: say who, or take the claim out.
 * @param {Line[]} lines
 * @returns {AgentFinding[]}
 */
export function researchPeerReview(lines) {
  const claim = /\b(?:studies|a study|research(?:ers)?|scientists|experts|engineers|investigators|analysts|historians|economists|doctors|physicians|a report|reports|a survey|data show(?:s)?|evidence (?:shows|suggests))\b[^.]{0,60}\b(?:show|shows|showed|found|find|finds|say|says|said|suggest|suggests|suggested|concluded|estimate|estimated|proved|prove|confirm|confirmed)\b/i;
  const named = /\b(?:according to|reported by|published in|published by|journal|university|institute|nasa|noaa|osha|ntsb|nist|asce|ieee|commission|board|agency|laboratory|laboratories|department|ministry|inquiry|court|report by|in a \d{4}|\b(?:1[89]|20)\d\d\b)/i;
  /** @type {AgentFinding[]} */
  const out = [];
  const flat = lines.flatMap((l) => sentencesOf(l.narration).map((s) => ({ sc: l.sc, s })));
  flat.forEach((x, i) => {
    if (!claim.test(x.s)) return;
    const near = [flat[i - 1]?.s, x.s, flat[i + 1]?.s].filter(Boolean).join(" ");
    if (named.test(near)) return;
    out.push({ role: "research-peer-review", scene: x.sc, code: "unnamed-source", severity: "warn", detail: `"${x.s.slice(0, 110)}" cites a study or experts but names no one`, fix: "Name the institution, the journal or the year, or cut the claim." });
  });
  return out;
}

/** Acronyms a general American audience already knows: never flagged. */
const KNOWN_ACRONYMS = new Set(["USA", "US", "UK", "UN", "EU", "TV", "DNA", "FBI", "CIA", "NASA", "NATO", "USSR", "WWII", "WWI", "CEO", "GPS", "AI", "PM", "AM", "OK", "ID", "DC", "NYC", "UFO", "SOS", "VIP", "FAQ", "PhD", "MIT", "BBC", "CNN", "NBC", "ABC", "CBS", "NFL", "NBA", "RIP", "IQ", "GDP", "COVID", "HIV", "AIDS", "DDT", "TNT", "LED", "USB", "PC", "CD", "DVD", "GMT", "UTC", "EST", "PST", "FDA", "EPA", "IRS", "OSHA", "NTSB", "FAA", "NOAA"]);

/**
 * story-exposition: a clarity pass. A sentence too long to follow by ear, an acronym used with no
 * explanation, a pile of numbers in one breath. Spoken words: the ear gets one chance.
 * @param {Line[]} lines @param {{ maxWords?: number, maxNumbers?: number }} [o]
 * @returns {AgentFinding[]}
 */
export function storyExposition(lines, o = {}) {
  const maxWords = o.maxWords ?? 38;
  const maxNumbers = o.maxNumbers ?? 4;
  /** @type {AgentFinding[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const l of lines) for (const s of sentencesOf(l.narration)) {
    const n = s.split(/\s+/).length;
    if (n > maxWords) out.push({ role: "story-exposition", scene: l.sc, code: "sentence-too-long", severity: "warn", detail: `a ${n}-word sentence ("${s.slice(0, 80)}...")`, fix: "Break it at the second comma or the 'and': one idea per breath." });
    const nums = (s.match(/\b\d[\d,.]*\b/g) ?? []).length;
    if (nums > maxNumbers) out.push({ role: "story-exposition", scene: l.sc, code: "number-pile", severity: "warn", detail: `${nums} numbers in one sentence ("${s.slice(0, 80)}...")`, fix: "Keep the one number that carries the point; give the rest on screen or in the next sentence." });
    for (const m of s.matchAll(/\b([A-Z]{2,6})\b/g)) {
      const a = m[1];
      if (KNOWN_ACRONYMS.has(a) || seen.has(a)) continue;
      seen.add(a);
      const explained = new RegExp(`\\(${a}\\)|\\b${a}\\b[^.]{0,30}\\b(?:short for|stands for|which is|known as|called)\\b|\\b(?:short for|stands for|known as|called)\\b[^.]{0,30}\\b${a}\\b`).test(s);
      if (!explained) out.push({ role: "story-exposition", scene: l.sc, code: "unexplained-acronym", severity: "warn", detail: `"${a}" is used without saying what it is`, fix: `Say what ${a} is the first time, in plain words.` });
    }
  }
  return out;
}

/**
 * Every script-side agent on one film's lines. The report says which agents ran and what each found.
 * @param {Line[]} lines @param {{ now?: Date }} [o]
 */
export function runScriptAgents(lines, o = {}) {
  const geo = researchGeography(lines);
  const results = [
    { role: "research-freshness", file: "engine/src/script-agents.mjs", findings: researchFreshness(lines, o) },
    { role: "research-geography", file: "engine/src/script-agents.mjs", findings: geo.findings, note: `${geo.verified} place pair(s) confirmed, ${geo.unverified.length} place(s) not in the list` },
    { role: "research-peer-review", file: "engine/src/script-agents.mjs", findings: researchPeerReview(lines) },
    { role: "story-exposition", file: "engine/src/script-agents.mjs", findings: storyExposition(lines) },
  ];
  return { results: results.map((r) => ({ ...r, pass: r.findings.length === 0 })), unverifiedPlaces: geo.unverified };
}
