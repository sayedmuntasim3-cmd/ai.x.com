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
 *   id: string, name: string, bn: string, minutes: [number, number], hook: string, beats: string[],
 *   visuals: string, music: string, examples: string[], mode: "documentary" | "story",
 * }} FilmFormat
 */

/** @type {readonly FilmFormat[]} */
export const FORMATS = Object.freeze([
  { id: "true-story-reenactment", name: "Re-enacted true story", bn: "সত্য ঘটনার পুনর্নির্মাণ", minutes: [12, 25], mode: "documentary",
    hook: "An unbelievable one-line premise about one named person (\"When a B-17's tail fell with the gunner still inside\").",
    beats: ["cold open at peak danger", "who the person is", "the mission or goal", "the problem", "escalation", "climax", "aftermath: what happened to them"],
    visuals: "cinematic re-enactment with one consistent cast, maps, exact dates on screen", music: "orchestral, percussive", examples: ["Yarnhub", "Simple History"] },
  { id: "rags-to-riches", name: "Rags to riches / riches to ruin", bn: "শূন্য থেকে শীর্ষে, শীর্ষ থেকে পতন", minutes: [15, 45], mode: "documentary",
    hook: "A dollar figure and a contrast (\"He had $47. Ten years later...\").",
    beats: ["the end state first", "the hard beginning", "the first break", "the big mistake", "the comeback", "the price paid", "where they are now"],
    visuals: "places, objects, money graphics, archive where licensed", music: "emotional build, silence before reveals", examples: ["MagnatesMedia", "ColdFusion"] },
  { id: "motivational-life-story", name: "Motivational real-life story", bn: "অনুপ্রেরণার সত্যিকারের জীবনকাহিনি", minutes: [10, 30], mode: "documentary",
    hook: "The moment everything was lost, before we know who they are.",
    beats: ["the low point", "the wound and the want", "failed attempts", "the turn", "the climb", "the lesson shown, never stated"],
    visuals: "intimate, hands and places, slow push-ins", music: "piano and strings", examples: ["Dhar Mann (scripted, not documentary)"] },
  { id: "place-nobody-can-visit", name: "Place nobody can visit", bn: "যেখানে কেউ যেতে পারে না", minutes: [15, 30], mode: "documentary",
    hook: "The rule that makes the place impossible (\"the most evil are kept here\").",
    beats: ["the approach", "the rules", "inside", "the people", "the shocking detail", "leaving"],
    visuals: "aerials, slow reveals, maps", music: "tension drones", examples: ["Ruhi Cenet Documentaries"] },
  { id: "deadliest-journey", name: "Deadliest or impossible journey", bn: "সবচেয়ে বিপজ্জনক যাত্রা", minutes: [40, 50], mode: "documentary",
    hook: "An extreme vehicle or route and the crew who live on it.",
    beats: ["departure", "first hardship", "breakdown", "the human cost", "arrival"],
    visuals: "observational, handheld, route map", music: "local instruments, ambience", examples: ["Deadliest Journeys"] },
  { id: "history-epic", name: "History epic (archive, colourised)", bn: "ইতিহাসের মহাকাব্য", minutes: [40, 90], mode: "documentary",
    hook: "A famous date or name, plus \"in colour\" or \"never seen\".",
    beats: ["chronological acts with chapter cards", "turning points", "the end and its legacy"],
    visuals: "restored public-domain archive, Ken Burns moves, date supers", music: "solemn strings", examples: ["Hitler in Colour", "June 6, 1944 - The Light of Dawn"] },
  { id: "history-in-minutes", name: "Whole history in N minutes", bn: "কয়েক মিনিটে পুরো ইতিহাস", minutes: [10, 20], mode: "documentary",
    hook: "The size of the promise (\"423 years in 13 minutes\").",
    beats: ["fast eras", "one surprising thread through all of them", "where it leads today"],
    visuals: "animated maps and timelines", music: "driving score", examples: ["423 Years of American History in 13 Minutes"] },
  { id: "other-side", name: "The other side of a famous event", bn: "বিখ্যাত ঘটনার অন্য দিক", minutes: [15, 30], mode: "documentary",
    hook: "A known event \"from the enemy's perspective\".",
    beats: ["what they believed", "what they missed", "the turning point", "what it cost them"],
    visuals: "re-enactment, maps", music: "restrained, tragic", examples: ["Yarnhub: Midway from the Japanese perspective"] },
  { id: "inner-circle", name: "Rise, betrayal and fall of an inner circle", bn: "ভেতরের মানুষদের উত্থান, বিশ্বাসঘাতকতা ও পতন", minutes: [40, 90], mode: "documentary",
    hook: "\"The men behind...\".",
    beats: ["one chapter per person", "alliances", "betrayal", "downfall or trial"],
    visuals: "portraits, dossier graphics, archive", music: "dark ambient", examples: ["Hitler and the Lords of Evil"] },
  { id: "dark-business-expose", name: "Dark business exposé", bn: "ব্যবসার অন্ধকার দিক", minutes: [15, 40], mode: "documentary",
    hook: "A company everyone uses, and the thing they hide.",
    beats: ["the promise", "the first crack", "the evidence", "who profits", "what happens next"],
    visuals: "documents, charts, archive", music: "pulse and drones", examples: ["Moon", "Fern", "BlackRock Is Terrifying"] },
  { id: "money-explainer", name: "Money explainer: how it really works", bn: "টাকা আসলে কীভাবে কাজ করে", minutes: [12, 25], mode: "documentary",
    hook: "A question with a number (\"Which rich country goes bankrupt first?\").",
    beats: ["the question", "how it works", "the hidden mechanism", "the stakes for the viewer", "the answer"],
    visuals: "data graphics, maps, kinetic type", music: "light, curious", examples: ["How Money Works", "OBF", "Statrys"] },
  { id: "big-question-science", name: "Big question / deep-time science", bn: "বিজ্ঞানের বড় প্রশ্ন", minutes: [15, 90], mode: "documentary",
    hook: "\"What's really under...\" or \"where did we come from?\".",
    beats: ["the question", "what we thought", "the new discovery", "eras as chapters", "what it means for us"],
    visuals: "reconstructions, NASA and science imagery, graphics", music: "awe-inspiring score", examples: ["Cleo Abram", "Lost Worlds"] },
  { id: "mystery-investigation", name: "Mystery investigation", bn: "রহস্যের অনুসন্ধান", minutes: [20, 60], mode: "documentary",
    hook: "The detail that should not exist.",
    beats: ["the case", "the evidence", "the theories", "what was missed", "the most likely answer"],
    visuals: "evidence boards, maps, archive", music: "suspense", examples: ["LEMMiNO", "MrBallen"] },
  { id: "numbered-compilation", name: "Numbered compilation", bn: "নম্বর দেওয়া সংকলন", minutes: [60, 120], mode: "documentary",
    hook: "\"7 incredible...\" built from the channel's own earlier films.",
    beats: ["ranked or themed entries", "a cliffhanger between entries"],
    visuals: "the channel's own footage", music: "per entry", examples: ["Yarnhub: 7 Incredible Tank Battles"] },
  { id: "biography", name: "Life of a legend (full biography)", bn: "কিংবদন্তির পুরো জীবনকাহিনি", minutes: [20, 60], mode: "documentary",
    hook: "The one decision that defined a whole life, before we know whose life it is.",
    beats: ["the defining moment, shown first", "where they came from", "the first ambition and the first wall", "the breakthrough", "the peak and its price", "the test or the fall", "the legacy, in what changed"],
    visuals: "real archive photographs of the person and places (public domain or CC BY), documents, slow push-ins, dates on screen", music: "piano and strings, building", examples: ["Biographics", "MagnatesMedia"] },
  { id: "company-rise-fall", name: "How a company rose and collapsed", bn: "একটা কোম্পানির উত্থান ও পতন", minutes: [15, 40], mode: "documentary",
    hook: "A valuation and a countdown (\"Worth $30 billion. Gone in 18 months.\").",
    beats: ["the collapse, first", "the founder and the idea", "hypergrowth", "the first crack", "the warnings ignored", "the fall, day by day", "who paid and what changed"],
    visuals: "counters and charts from the ledger, products and offices without logos, filings rebuilt as document cards", music: "pulsing electronic tension", examples: ["ColdFusion", "Modern MBA", "Company Man"] },
  { id: "true-crime-case", name: "True crime case file (court records only)", bn: "সত্যি অপরাধের মামলা (শুধু আদালতের নথি থেকে)", minutes: [20, 60], mode: "documentary",
    hook: "The detail the investigators missed, from the record.",
    beats: ["the night it happened", "the victim's life, with respect", "the investigation", "the break in the case", "the trial and the verdict", "what is still unknown"],
    visuals: "maps, timelines and documents rebuilt from public court records; places; never gore or victims' faces", music: "dark ambient, restrained", examples: ["Court-record documentaries"] },
  { id: "survival-story", name: "Survival against impossible odds", bn: "অসম্ভবকে জয় করে বেঁচে ফেরা", minutes: [15, 35], mode: "documentary",
    hook: "Days, distance and no rescue coming (\"76 days adrift. Nobody was looking.\").",
    beats: ["the ordinary morning", "the disaster", "the first night", "the low point", "the decision that saved them", "rescue", "life after"],
    visuals: "landscapes, weather, route map, objects of survival, archive photos where they exist", music: "tension that breaks into release", examples: ["Survival documentaries"] },
  { id: "war-battle", name: "Battle explained, move by move", bn: "যুদ্ধ, চাল থেকে চালে ব্যাখ্যা", minutes: [20, 60], mode: "documentary",
    hook: "The minutes that decided a war.",
    beats: ["the stakes", "the two sides", "the plan", "first contact", "the turning point", "the outcome", "the human cost"],
    visuals: "maps with moving fronts, archive photographs, unit counters, dates", music: "percussive orchestral", examples: ["Kings and Generals", "Epic History"] },
  { id: "geography-why", name: "Why the map looks like this", bn: "মানচিত্রটা কেন এমন", minutes: [10, 25], mode: "documentary",
    hook: "A map that makes no sense (\"Why do 95% of Egyptians live on 5% of the land?\").",
    beats: ["the puzzle on a map", "the physical cause", "the history it shaped", "the consequence today", "the twist nobody expects"],
    visuals: "maps and satellite images (NASA), data graphics, places", music: "curious, light electronic", examples: ["RealLifeLore", "Wendover Productions"] },
  { id: "space-mission", name: "Space mission story", bn: "মহাকাশ অভিযানের গল্প", minutes: [15, 50], mode: "documentary",
    hook: "Distance from home and the moment it went wrong.",
    beats: ["the goal", "the crew", "launch", "the problem", "the fix nobody had tried", "the way home", "what it changed"],
    visuals: "NASA archive photographs and film (public domain), mission maps, counters", music: "ambient orchestral", examples: ["Apollo documentaries"] },
  { id: "disaster-minute-by-minute", name: "Disaster, minute by minute", bn: "দুর্ঘটনা, মিনিট ধরে ধরে", minutes: [15, 45], mode: "documentary",
    hook: "A clock time and what nobody knew yet.",
    beats: ["the place and the people", "the warnings", "the minute it happened", "the response", "the investigation", "what changed because of it"],
    visuals: "timelines, maps, investigation reports rebuilt as documents, archive photographs; never gore", music: "low tension, silence at the moment", examples: ["Plainly Difficult", "Fascinating Horror"] },
  { id: "ancient-civilization", name: "Lost civilisation and the ancient world", bn: "হারিয়ে যাওয়া সভ্যতা ও প্রাচীন পৃথিবী", minutes: [20, 60], mode: "documentary",
    hook: "What they built, when, and with what (\"4,500 years ago, without iron tools\").",
    beats: ["the ruin today", "who they were", "what they built", "how they lived", "the decline", "what they left us"],
    visuals: "public-domain photographs of ruins and museum objects, maps, reconstructions as graphics", music: "ancient instruments, drones", examples: ["Fall of Civilizations"] },
  { id: "sports-legend", name: "Sports legend: the rise and the moment", bn: "খেলার কিংবদন্তি: উত্থান আর সেই মুহূর্ত", minutes: [15, 40], mode: "documentary",
    hook: "One moment that defined a career, told before the name.",
    beats: ["the moment", "the beginning", "the rival", "the setback", "the comeback", "the moment again, now understood", "the legacy"],
    visuals: "stadiums, crowds, equipment and data; no match footage or club logos without a licence", music: "anthem build", examples: ["Sports biographies"] },
  { id: "dramatized-story", name: "Original dramatized story (idea mode)", bn: "আইডিয়া থেকে নিজস্ব গল্প", minutes: [1, 60], mode: "story",
    hook: "The impossible image and one question inside 3 seconds.",
    beats: ["see story-mode.mjs planStory"],
    visuals: "stock, graphics and disclosed AI scenes only where stock cannot", music: "per version policy", examples: ["owner's ideas: $50 to a Rolls-Royce, the baby dragon"] },
]);

/**
 * The picture look a format is rendered in: invented stories and human
 * stories get the cinematic look (teal-and-warm grade, 2.39:1 bars), history
 * the faded archive look, everything else the documentary look.
 * @param {string | null | undefined} id
 * @returns {"documentary" | "cinematic" | "archive"}
 */
export function lookFor(id) {
  if (["dramatized-story", "motivational-life-story", "true-story-reenactment", "other-side", "rags-to-riches", "deadliest-journey", "survival-story", "sports-legend"].includes(String(id))) return "cinematic";
  if (["history-epic", "inner-circle", "history-in-minutes", "war-battle", "ancient-civilization", "biography"].includes(String(id))) return "archive";
  return "documentary";
}

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
    [/\b(apollo|nasa|astronauts?|space ?(mission|station|shuttle)|moon landing|mars rover)\b|মহাকাশ/, "space-mission"],
    [/\b(battle of|siege|invasion|war of|d-day|blitzkrieg)\b|যুদ্ধ/, "war-battle"],
    [/\b(murder|homicide|serial|trial of|case of|cold case|killer)\b|খুন|মামলা/, "true-crime-case"],
    [/\b(stranded|adrift|lost at sea|survived \d+|survival|avalanche)\b|বেঁচে ফের/, "survival-story"],
    [/\b(disaster|explosion|meltdown|tsunami|earthquake|plane crash|sinking|chernobyl|titanic)\b|দুর্ঘটনা/, "disaster-minute-by-minute"],
    [/\b(ancient|civili[sz]ation|pharaoh|pyramids?|roman empire|maya|aztec|indus valley|ruins)\b|প্রাচীন|সভ্যতা/, "ancient-civilization"],
    [/\b(rise and fall of|collapse of|went bankrupt|startup|company that|how .* lost \$?\d)\b/, "company-rise-fall"],
    [/\bwhy (is|are|does|do) .*(live|border|map|shaped|located|empty)|geography\b|মানচিত্র/, "geography-why"],
    [/\b(messi|ronaldo|sachin|kohli|jordan|federer|olympic|world cup|cricket legend|football legend)\b|ক্রিকেট|ফুটবল/, "sports-legend"],
    [/\b(life of|biography|who was|the man who|the woman who)\b|জীবনী|জীবনকাহিনি/, "biography"],
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
