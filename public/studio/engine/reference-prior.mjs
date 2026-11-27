/**
 * Reference prior: what the OUTSIDE market of Engineering Disasters & Megaprojects videos looks like
 * (public metadata only: title, length, chapters, thumbnail, date, views). It is a prior for the topic engine
 * and the Craft Ledger to lean on until our own films have data. It is NOT our own films' craft
 * (that is craft-memory.mjs) and it never sees the spoken first 30 seconds or retention: those are not public.
 *
 * Pure functions, no I/O: tools/research/build-prior.mjs builds the file from a Worker crawl; `read*` functions read it.
 */

export const PRIOR_VERSION = 1;
export const PILLARS = Object.freeze(["disasters", "megaprojects", "hidden-infrastructure", "mysteries"]);
/** A video is a "winner" when it beats its own channel's median by this factor. */
export const WINNER_OUTLIER = 1.5;
export const MIN_LONG_SECONDS = 480;
const DAY = 86_400_000;

// Order matters: the first pillar that matches a title (+ tags) is the video's pillar.
const PILLAR_RULES = /** @type {[string, RegExp][]} */ ([
  ["mysteries", /\b(mystery|mysterious|unsolved|vanish\w*|disappear\w*|missing|never (found|solved)|what (really )?happened|unexplained|haunt\w*|abandoned|cover.?up|conspiracy|enigma)\b/i],
  ["disasters", /\b(collaps\w*|disaster\w*|fail(s|ed|ure|ures|ing)?|crash\w*|explo(de|ded|sion|sions)|meltdown|catastroph\w*|sink(s|ing)?|sank|sunk|burn(s|ed|ing)?|fire|flood\w*|burst|broke|broken|killed|deadly|tragedy|tragic|accident\w*|derail\w*|leak\w*|blowout|crack(s|ed)?|fell|falls?|toppl\w*|crumbl\w*|doomed|deadl(y|iest)|incident|chernobyl|challenger|titanic|cockpit|airlines?|airliner|flight|pilots?|crew|ntsb)\b/i],
  ["megaprojects", /\b(tunnel\w*|bridges?|dams?|canal\w*|mega.?projects?|skyscrapers?|tallest|largest|biggest|longest|building|built|construction|high.?speed|rail(way|road)?s?|airports?|stadiums?|rebuil\w*|expansion|space elevator|crossrail|hs2|panama|three gorges|neom|megastructures?|billion|giant|huge|world'?s)\b/i],
  ["hidden-infrastructure", /\b(how .{3,60} works?|grid|sewers?|drain\w*|water (supply|system|treatment)|power (plants?|lines?|grid)|substations?|transmission|pipelines?|cables?|aqueducts?|levees?|reservoirs?|infrastructure|hidden|underground|electric\w*|nuclear|pumps?|manholes?|traffic|concrete|asphalt|roads?|highways?|garbage|waste|spillways?|locks?|inside|city|cities|trains?|subway|metro|towers?|energy)\b/i],
]);

/**
 * @param {{ title?: string, tags?: string[] }} v
 * @returns {string | null} one of PILLARS, or null when the video is outside the niche.
 */
export function pillarOf(v) {
  const text = `${v.title ?? ""} ${(v.tags ?? []).slice(0, 8).join(" ")}`;
  for (const [pillar, re] of PILLAR_RULES) if (re.test(text)) return pillar;
  return null;
}

const FORMULAS = /** @type {[string, RegExp][]} */ ([
  ["question", /\?/],
  ["how-it-works", /^\s*how\b.*\b(works?|actually|really|is made|are made|was built|were built|built)\b/i],
  ["how-why-what-opener", /^\s*(how|why|what|where|who|when|can|could|is|are|do|does|did|will)\b/i],
  ["why-it-failed", /\b(why|how)\b.*\b(fail\w*|collaps\w*|fell|sank|exploded|crashed|went wrong|broke|burn\w*|killed)\b/i],
  ["number-or-money", /[$£€]|\b\d[\d,.]*\s?(billion|million|years?|feet|ft|miles?|meters?|tons?|people|lives|days|hours|minutes)\b|\b\d{2,}\b/i],
  ["year", /\b(1[89]\d\d|20\d\d)\b/],
  ["colon-subtitle", /[:|]| - | — /],
  ["superlative", /\b(biggest|largest|tallest|longest|deepest|worst|deadliest|most|greatest|first|only|impossible)\b/i],
  ["curiosity-gap", /\b(secret|hidden|truth|real reason|nobody|no one|never|actually|really|what happened|you (didn't|don't)|insane|crazy)\b/i],
  ["inside-or-behind", /^\s*(inside|behind|the story of|the (rise|fall|history|truth|failure|collapse)|building|the making of)\b/i],
  ["named-event", /\b(chernobyl|challenger|titanic|hindenburg|fukushima|bhopal|tacoma|oroville|banqiao|vajont|deepwater|apollo|boeing|737|concorde|hs2|crossrail|channel tunnel|panama|suez|hoover|golden gate|three gorges|big dig|brooklyn bridge|millau|burj|neom|flint)\b/i],
  ["all-caps-word", /\b[A-Z]{4,}\b/],
]);

/**
 * @param {string} title
 * @returns {string[]} the formula names the title matches (never empty: "plain-statement" when none)
 */
export function titleFormulas(title) {
  const t = String(title ?? "");
  const hits = FORMULAS.filter(([, re]) => re.test(t)).map(([n]) => n);
  return hits.length ? hits : ["plain-statement"];
}
export const FORMULA_NAMES = Object.freeze([...FORMULAS.map(([n]) => n), "plain-statement"]);

/**
 * The title without a trailing channel-name tag ("... | Fascinating Horror"), which is branding, not a formula.
 * @param {string} title @param {string} [channel]
 */
export function cleanTitle(title, channel = "") {
  const m = /^(.*\S)\s+[|\-–—]\s+([^|\-–—]{2,60})$/.exec(String(title ?? ""));
  /** @param {string} x */
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, "");
  return m && channel && (norm(channel).includes(norm(m[2])) || norm(m[2]).includes(norm(channel))) ? m[1] : String(title ?? "");
}

/**
 * Weighted quantiles.
 * @param {{ x: number, w: number }[]} items
 * @param {number[]} qs fractions 0..1
 */
export function weightedQuantiles(items, qs) {
  const a = items.filter((i) => Number.isFinite(i.x) && i.w > 0).sort((p, q) => p.x - q.x);
  const total = a.reduce((s, i) => s + i.w, 0);
  if (!a.length || total <= 0) return qs.map(() => 0);
  return qs.map((q) => { let acc = 0; for (const i of a) { acc += i.w; if (acc >= q * total - 1e-9) return i.x; } return a[a.length - 1].x; });
}
/** @param {number} n */
const r1 = (n) => Math.round(n * 10) / 10;
/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;
/** @param {number[]} xs */
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? /** @type {number} */ (s[s.length >> 1]) : 0; };

/**
 * Freshness weight: the study wants fast risers published between the last 2 months and 3 years;
 * very new videos have not settled (views/day is inflated), old classics say little about today.
 * @param {number} ageDays
 */
export function freshnessWeight(ageDays) {
  if (ageDays < 14) return 0;
  if (ageDays < 60) return 0.5;
  if (ageDays <= 1095) return 1;
  if (ageDays <= 1825) return 0.35;
  return 0.15;
}

/**
 * One slim record per video, with outlier (views vs the channel's own median of long uploads older than 60 days),
 * views per day and the weight. Only long videos of the niche are kept.
 * @param {any[]} raw rows of GET /api/videos
 * @param {{ now?: number, channelFit?: Record<string, "core" | "adjacent" | "reference"> }} [o]
 */
export function buildRecords(raw, o = {}) {
  const now = o.now ?? Date.now();
  /** @param {any} v */
  const age = (v) => Math.max(1, (now - Date.parse(v.publishedAt)) / DAY);
  const long = raw.filter((v) => v && v.id && v.durationSeconds >= MIN_LONG_SECONDS && Number.isFinite(Date.parse(v.publishedAt)) && v.views > 0);
  /** @type {Map<string, any[]>} */
  const byChannel = new Map();
  for (const v of long) { const list = byChannel.get(v.channelTitle) ?? []; list.push(v); byChannel.set(v.channelTitle, list); }
  /** @type {Map<string, { views: number, perDay: number }>} */
  const base = new Map();
  for (const [ch, vs] of byChannel) {
    const settled = vs.filter((v) => age(v) >= 60 && age(v) <= 1825);
    const pool = settled.length >= 5 ? settled : vs.filter((v) => age(v) >= 21);
    if (pool.length >= 3) base.set(ch, { views: median(pool.map((v) => v.views)), perDay: median(pool.map((v) => v.views / age(v))) });
  }
  const out = [];
  for (const v of long) {
    const b = base.get(v.channelTitle);
    if (!b || b.views <= 0) continue;
    const pillar = pillarOf(v);
    const fit = o.channelFit?.[v.channelTitle] ?? "adjacent";
    if (!pillar && fit !== "core") continue;
    const ageDays = age(v);
    const perDay = v.views / ageDays;
    const outlier = v.views / b.views;
    const riser = perDay / Math.max(1, b.perDay);
    const w = freshnessWeight(ageDays) * Math.min(4, Math.max(0.25, riser)) * (fit === "core" ? 1 : fit === "adjacent" ? 0.7 : 0.4);
    out.push({
      id: v.id, title: v.title, channel: v.channelTitle, channelFit: fit, pillar, publishedAt: String(v.publishedAt).slice(0, 10), ageDays: Math.round(ageDays),
      views: v.views, viewsPerDay: Math.round(perDay), minutes: r1(v.durationSeconds / 60), durationSeconds: v.durationSeconds,
      outlier: r3(outlier), channelMedianViews: Math.round(b.views), riser: r3(riser), weight: r3(w),
      chapters: (v.chapters ?? []).length, chapterStarts: (v.chapters ?? []).map((/** @type {{ at: number }} */ c) => c.at), chapterTitles: (v.chapters ?? []).slice(0, 40).map((/** @type {{ title: string }} */ c) => String(c.title).slice(0, 60)),
      descriptionOpening: v.descriptionOpening ?? null, thumbnail: v.thumbnail ?? "", formulas: titleFormulas(cleanTitle(v.title, v.channelTitle)),
    });
  }
  return out;
}

/**
 * @param {any[]} recs @param {readonly string[]} names @param {(r: any) => string[]} pick
 */
function shares(recs, names, pick) {
  const total = recs.reduce((s, r) => s + r.weight, 0) || 1;
  return Object.fromEntries(names.map((n) => [n, r3(recs.filter((r) => pick(r).includes(n)).reduce((s, r) => s + r.weight, 0) / total)]));
}
/** @param {any[]} recs @param {(r: any) => number} pick */
const quant = (recs, pick) => { const [p10, p25, p50, p75, p90] = weightedQuantiles(recs.map((r) => ({ x: pick(r), w: r.weight })), [0.1, 0.25, 0.5, 0.75, 0.9]); return { p10: r1(p10), p25: r1(p25), p50: r1(p50), p75: r1(p75), p90: r1(p90) }; };

/**
 * One pillar's distributions. `winners` (outlier >= WINNER_OUTLIER) next to `all` shows what the winners do differently (a lift above 1 means more common among winners).
 * @param {any[]} recs the pillar's records
 */
export function pillarSummary(recs) {
  const winners = recs.filter((r) => r.outlier >= WINNER_OUTLIER);
  /** @param {any[]} rs */
  const dist = (rs) => ({
    n: rs.length,
    titleFormulas: shares(rs, FORMULA_NAMES, (r) => r.formulas),
    titleWords: quant(rs, (r) => r.title.trim().split(/\s+/).length),
    titleChars: quant(rs, (r) => r.title.length),
    minutes: quant(rs, (r) => r.minutes),
    chapterCount: quant(rs.filter((r) => r.chapters >= 3), (r) => r.chapters),
    shareWithChapters: r3(rs.reduce((s, r) => s + (r.chapters >= 3 ? r.weight : 0), 0) / (rs.reduce((s, r) => s + r.weight, 0) || 1)),
    minutesPerChapter: quant(rs.filter((r) => r.chapters >= 3), (r) => r.minutes / r.chapters),
    firstChapterAfterSeconds: quant(rs.filter((r) => r.chapterStarts.length >= 3 && r.chapterStarts[0] === 0), (r) => r.chapterStarts[1]),
    ageDays: quant(rs, (r) => r.ageDays),
    freshness: { under2Months: r3(rs.filter((r) => r.ageDays < 60).length / (rs.length || 1)), months2to12: r3(rs.filter((r) => r.ageDays >= 60 && r.ageDays < 365).length / (rs.length || 1)), years1to3: r3(rs.filter((r) => r.ageDays >= 365 && r.ageDays <= 1095).length / (rs.length || 1)), over3Years: r3(rs.filter((r) => r.ageDays > 1095).length / (rs.length || 1)) },
  });
  const all = dist(recs);
  const win = dist(winners);
  const lift = Object.fromEntries(FORMULA_NAMES.map((n) => [n, all.titleFormulas[n] > 0.02 ? r3(win.titleFormulas[n] / all.titleFormulas[n]) : null]));
  return { all, winners: win, winnerTitleFormulaLift: lift };
}

/**
 * The whole prior.
 * @param {any[]} records from buildRecords
 * @param {{ builtAt?: string, thumbnails?: Record<string, { sample: number, patterns: Record<string, number>, notes?: string[] }>, channels?: number, rawVideos?: number, honesty?: string[] }} [o]
 */
export function buildPrior(records, o = {}) {
  const pillars = Object.fromEntries(PILLARS.map((p) => {
    const recs = records.filter((r) => r.pillar === p);
    return [p, { ...pillarSummary(recs), thumbnails: o.thumbnails?.[p] ?? null }];
  }));
  return {
    version: PRIOR_VERSION,
    builtAt: o.builtAt ?? new Date().toISOString().slice(0, 10),
    source: "YouTube Data API through the Worker (/api/videos: uploads playlists + videos.list). No search.list, no video download.",
    scope: { videos: records.length, channels: new Set(records.map((r) => r.channel)).size, rawVideosRead: o.rawVideos ?? null, winnerOutlier: WINNER_OUTLIER, minLongSeconds: MIN_LONG_SECONDS, freshness: "weight 0 under 14 days, 0.5 under 60, 1 up to 3 years, 0.35 to 5 years, 0.15 older; times the video's views/day vs its channel's median (0.25..4)" },
    honesty: o.honesty ?? ["Public metadata only: the spoken first 30 seconds and audience retention are NOT visible from outside.", "Outlier is views vs the channel's own median: it shows what the market clicked on and watched enough to recommend, not why.", "Pillars are assigned by title keywords: some videos are mislabelled; thumbnails are hand-read from a small sample.", "Nothing here promises views."],
    pillars,
    other: { unassignedCoreChannelVideos: records.filter((r) => !r.pillar).length },
  };
}

// ---------- readers (what the Craft Ledger and the topic engine call) ----------

/** @param {any} prior @param {string} pillar */
export function priorFor(prior, pillar) { return prior?.pillars?.[pillar] ?? null; }

/**
 * Target length and chapter rhythm for a pillar, from the winners when there are enough, else from all videos.
 * @param {any} prior @param {string} pillar
 * @returns {{ pillar: string, basis: "winners" | "all", n: number, minutes: { low: number, mid: number, high: number }, chapters: { low: number, mid: number, high: number } | null, minutesPerChapter: number | null } | null}
 */
export function lengthPlan(prior, pillar) {
  const p = priorFor(prior, pillar);
  if (!p || !p.all.n) return null;
  const d = p.winners.n >= 8 ? p.winners : p.all;
  const c = d.chapterCount;
  return { pillar, basis: d === p.winners ? "winners" : "all", n: d.n, minutes: { low: d.minutes.p25, mid: d.minutes.p50, high: d.minutes.p75 }, chapters: c.p50 ? { low: c.p25, mid: c.p50, high: c.p75 } : null, minutesPerChapter: d.minutesPerChapter.p50 || null };
}

/**
 * How a candidate title sits against the prior: which formulas it uses and how strongly the winners of the pillar favour each.
 * A score above 1 leans toward what winners use. It is a prior, never a prediction.
 * @param {any} prior @param {string} title @param {string} [pillar] defaults to pillarOf({title})
 * @returns {{ pillar: string | null, formulas: string[], score: number, words: number, wordsInBand: boolean, reasons: string[] } | null}
 */
export function scoreTitle(prior, title, pillar) {
  const pl = pillar ?? pillarOf({ title });
  const p = pl ? priorFor(prior, pl) : null;
  if (!p || p.all.n < 10) return pl ? { pillar: pl, formulas: titleFormulas(title), score: 1, words: title.trim().split(/\s+/).length, wordsInBand: true, reasons: ["too little data for this pillar"] } : null;
  const formulas = titleFormulas(title);
  const lifts = formulas.map((f) => p.winnerTitleFormulaLift[f]).filter((x) => typeof x === "number");
  const score = lifts.length ? r3(Math.exp(lifts.reduce((s, l) => s + Math.log(Math.max(0.2, l)), 0) / lifts.length)) : 1;
  const words = title.trim().split(/\s+/).length;
  const band = p.winners.n >= 8 ? p.winners.titleWords : p.all.titleWords;
  const wordsInBand = words >= band.p10 && words <= band.p90;
  const reasons = formulas.map((f) => `${f}: winners use it ${p.winnerTitleFormulaLift[f] ?? "n/a"}x as often as the pillar overall`);
  if (!wordsInBand) reasons.push(`${words} words is outside the pillar's usual ${band.p10}-${band.p90}`);
  return { pillar: pl, formulas, score, words, wordsInBand, reasons };
}

/**
 * Is a topic's freshness window one the market still rewards? Share of winners younger than `days`.
 * @param {any} prior @param {string} pillar @param {number} days
 */
export function winnersYoungerThan(prior, pillar, days) {
  const f = priorFor(prior, pillar)?.winners?.freshness;
  if (!f) return null;
  if (days <= 60) return f.under2Months;
  if (days <= 365) return r3(f.under2Months + f.months2to12);
  if (days <= 1095) return r3(f.under2Months + f.months2to12 + f.years1to3);
  return 1;
}

// ---------- the fastest risers of our niche, and why they rose ----------

/** Channels whose subject is not engineering disasters / megaprojects / infrastructure (history, science, finance, tech). Dropped from the riser ranking. */
export const OFF_NICHE_CHANNELS = Object.freeze(["toldinstone", "Kurzgesagt – In a Nutshell", "Veritasium", "LEMMiNO", "Vox", "Tom Scott plus", "Historia Civilis", "PolyMatter", "The Infographics Show", "New Mind", "Mark Felton Productions", "ColdFusion", "Economics Explained", "Technology Connections", "Alec Steele", "RealLifeLore", "SmarterEveryDay", "Thunderf00t", "Mustard", "Engineering Explained"]);
/** Single videos of an otherwise on-niche channel that are not about engineering disasters, megaprojects or infrastructure (games, brands, internet culture, biology). */
export const OFF_NICHE_TITLE = /\b(fallout|red bull|dead internet|mirror life|lucid|tesla|porsche|jeep|bugatti|maverick)\b/i;

/**
 * The n fastest risers: our niche only (core and adjacent channels, a pillar keyword or a core channel),
 * published 60 days to 3 years ago, ranked by views per day x outlier.
 * @param {any[]} rows records from buildRecords
 * @param {number} [n]
 */
export function topRisers(rows, n = 200) {
  return rows
    .filter((r) => r.channelFit !== "reference" && !OFF_NICHE_CHANNELS.includes(r.channel) && !OFF_NICHE_TITLE.test(r.title) && (r.pillar || r.channelFit === "core") && r.ageDays >= 60 && r.ageDays <= 1095)
    .map((r) => ({ ...r, riseScore: Math.round(r.viewsPerDay * r.outlier) }))
    .sort((a, b) => (b.riseScore - a.riseScore) || a.id.localeCompare(b.id))
    .slice(0, n);
}

/**
 * Rise patterns, in priority order: the first whose test passes names the video. Every test reads only what is visible outside
 * (title, channel, length, date, views); none can see the spoken hook or retention.
 * @type {ReadonlyArray<{ id: string, name: string, test: (r: any) => boolean, says: string }>}
 */
export const RISE_PATTERNS = Object.freeze([
  { id: "news-peg", name: "Fresh news peg", test: (r) => r.ageDays < 150 && r.riser >= 3, says: "published in the last 5 months and already running 3x or more above its channel's normal views/day: a live event or trend (the peg itself is not in the data; check the date)" },
  { id: "named-catastrophe", name: "Named catastrophe explained", test: (r) => r.formulas.includes("named-event") && r.pillar === "disasters", says: "a famous failure by name (a dam, a rocket, a plane) with a 'why' or 'what really happened' promise" },
  { id: "accident-investigation", name: "Accident investigation", test: (r) => ["Mentour Pilot", "Fascinating Horror", "Disaster Breakdown", "blancolirio"].includes(r.channel), says: "an aviation or industrial accident walked through step by step; long, serial, loyal audience" },
  { id: "why-it-failed", name: "Why it failed / collapsed", test: (r) => r.formulas.includes("why-it-failed") || (r.pillar === "disasters" && r.formulas.includes("how-why-what-opener")), says: "the title is a question about a failure: the viewer wants the cause" },
  { id: "money-megaproject", name: "Billion-dollar project", test: (r) => r.formulas.includes("number-or-money") && r.pillar === "megaprojects", says: "a project sold by its price tag or scale number, often with a 'no one uses it' or 'will it work' edge" },
  { id: "superlative-scale", name: "Biggest / longest / impossible", test: (r) => r.formulas.includes("superlative"), says: "a record or an extreme the viewer can picture in one word" },
  { id: "how-it-works", name: "How the hidden system works", test: (r) => r.formulas.includes("how-it-works") || (r.pillar === "hidden-infrastructure" && r.formulas.includes("how-why-what-opener")), says: "an everyday system (grid, sewer, road, dam) the viewer uses but never saw explained" },
  { id: "mystery-abandoned", name: "Mystery / unsolved / abandoned", test: (r) => r.pillar === "mysteries", says: "a puzzle or lost thing: an open question in the title" },
  { id: "contrarian-broken", name: "Contrarian 'it is broken' take", test: (r) => ["Adam Something", "Stewart Hicks", "City Beautiful", "Not Just Bikes", "RMTransit", "Ray Delahanty | CityNerd"].includes(r.channel), says: "an opinionated, often urban or transit angle on why something built is bad; author-led, thumbnail-led" },
  { id: "long-form", name: "Long-form event (30+ min)", test: (r) => r.minutes >= 30, says: "a feature-length film; the length itself is the promise" },
  { id: "curiosity-object", name: "Everyday-object curiosity", test: (r) => r.formulas.includes("curiosity-gap") || r.formulas.includes("plain-statement") || r.formulas.includes("question"), says: "a plain, short title about a familiar thing with a hidden catch" },
  { id: "other", name: "No visible single cause", test: () => true, says: "none of the visible signals above is decisive" },
]);

/**
 * Group videos by rise pattern: counts, medians and 3 example rows (the fastest first).
 * @param {any[]} videos rows from topRisers (with riseScore)
 */
export function risePatterns(videos) {
  /** @type {Map<string, any[]>} */
  const groups = new Map();
  for (const v of videos) {
    const p = RISE_PATTERNS.find((x) => x.test(v)) ?? RISE_PATTERNS[RISE_PATTERNS.length - 1];
    const list = groups.get(p.id) ?? [];
    list.push(v);
    groups.set(p.id, list);
  }
  return RISE_PATTERNS.filter((p) => groups.has(p.id)).map((p) => {
    const vs = /** @type {any[]} */ (groups.get(p.id)).sort((a, b) => b.riseScore - a.riseScore);
    return { id: p.id, name: p.name, says: p.says, n: vs.length, medianMinutes: r1(median(vs.map((v) => v.minutes))), medianOutlier: r3(median(vs.map((v) => v.outlier))), medianAgeDays: median(vs.map((v) => v.ageDays)), examples: vs.slice(0, 3), ids: vs.map((v) => v.id) };
  });
}

// ---------- applying the prior ----------

const PLAIN_FORMULA = /** @type {Record<string, string>} */ ({
  "how-it-works": "'How X works' / 'how X was built'", "why-it-failed": "'Why X failed/collapsed'", "how-why-what-opener": "a how/why/what opener", question: "a question", "number-or-money": "a number or money amount",
  superlative: "a superlative (biggest, longest, worst)", "curiosity-gap": "a curiosity gap (secret, hidden, what really happened)", "named-event": "a named event or place", "inside-or-behind": "'Inside ...' / 'The story of ...'", "plain-statement": "a plain statement", "colon-subtitle": "a colon subtitle", year: "a year", "all-caps-word": "one all-caps word",
});

/**
 * A short, honest briefing for the packaging step (titles and thumbnails): what the outside market of this pillar looks like.
 * It is a prior, not a rule: the packaging rules of film-run.mjs win, and nothing here sees the spoken hook or retention.
 * @param {any} prior @param {string | null | undefined} pillar
 * @returns {string} empty when there is no usable prior for the pillar
 */
export function packagingBrief(prior, pillar) {
  const p = pillar ? priorFor(prior, pillar) : null;
  if (!p || p.all.n < 20) return "";
  const d = p.winners.n >= 8 ? p.winners : p.all;
  const lifts = Object.entries(p.winnerTitleFormulaLift).filter(([n, v]) => typeof v === "number" && p.all.titleFormulas[n] >= 0.1 && Math.abs(/** @type {number} */ (v) - 1) >= 0.15).sort((a, b) => /** @type {number} */ (b[1]) - /** @type {number} */ (a[1]));
  const used = Object.entries(p.all.titleFormulas).filter(([n]) => n !== "plain-statement").sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, v]) => `${PLAIN_FORMULA[n] ?? n} ${Math.round(v * 100)}%`);
  const th = p.thumbnails && p.thumbnails.sample >= 10 ? Object.entries(p.thumbnails.patterns).slice(0, 4).map(([n, c]) => `${n} (${c}/${p.thumbnails.sample})`) : [];
  const lines = [
    `REFERENCE_PRIOR (outside market, pillar "${pillar}", ${p.all.n} videos, ${p.winners.n} winners; public metadata only, never a promise of views):`,
    `- Titles in this pillar run ${d.titleWords.p10}-${d.titleWords.p90} words (median ${d.titleWords.p50}); most used: ${used.join(", ")}.`,
    lifts.length ? `- Winners over-use: ${lifts.filter(([, v]) => /** @type {number} */ (v) > 1).slice(0, 3).map(([n, v]) => `${PLAIN_FORMULA[n] ?? n} (x${v})`).join(", ") || "nothing clear"}; under-use: ${lifts.filter(([, v]) => /** @type {number} */ (v) < 1).slice(0, 2).map(([n, v]) => `${PLAIN_FORMULA[n] ?? n} (x${v})`).join(", ") || "nothing clear"}.` : "- No title formula separates winners from the rest here.",
    th.length ? `- Thumbnails read by eye: ${th.join(", ")}.` : "",
    `- Length: middle half ${d.minutes.p25}-${d.minutes.p75} min (median ${d.minutes.p50}); winners are not longer than the rest.`,
    `Use it to choose between your own title and thumbnail ideas. The PACKAGING RULES win where they differ, and the title must still be true to the film.`,
  ];
  return lines.filter(Boolean).join("\n");
}

/**
 * How far a candidate topic's title leans toward what winners of its pillar use, as points on the 0..100 topic total
 * (at most +-3: a nudge, never enough to outrank evidence about sources, visuals or demand).
 * @param {any} prior @param {{ title?: string, tags?: string[] }} topic
 * @returns {{ pillar: string | null, score: number, points: number, reason: string } | null}
 */
export function topicLean(prior, topic) {
  const pillar = pillarOf(topic);
  const s = pillar ? scoreTitle(prior, topic.title ?? "", pillar) : null;
  if (!s || !pillar) return null;
  const points = Math.round(Math.max(-3, Math.min(3, (s.score - 1) * 6)) * 10) / 10;
  return { pillar, score: s.score, points, reason: s.reasons.slice(0, 2).join("; ") || "no clear formula" };
}
