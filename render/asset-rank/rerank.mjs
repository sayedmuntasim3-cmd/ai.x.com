#!/usr/bin/env node
/**
 * The eyes of the asset engine (mission M3; roster: Exact Asset Finder, Scene-to-Footage Matchmaker,
 * Release & Property Risk Reviewer). After the picture plan, every stock shot of a voiceover film is
 * searched again in the film's world (beats.json: country, city, era, money, people), 50-200 free
 * candidates per shot are gathered, OpenCLIP looks at every thumbnail (rank.py, CPU, cached), and the
 * best on-topic pick is chosen in film order. Off-world pictures (another country's money or people,
 * abstract backgrounds, film strips, another continent) are pushed down; watermarks, duplicates,
 * portrait frames and anything under 1080p (video) or 1600 px (stills) are refused outright.
 *
 *   node render/asset-rank/rerank.mjs --run <run folder> [--python <python with open_clip>] [--sheet]
 *
 * Reads run/media-C1.json (the plan's picks), run/beats.json (M2's Director pass, optional) and
 * run/understanding.json (topic words). Writes media-C1.json in place (the old one is kept as
 * media-C1.before.json) with a `why` on every pick, and rank-C1.json (scores, counts, minutes).
 * Pixabay is searched with PIXABAY_API_KEY, or through ZUPONA_STOCK_RELAY (the Worker's own key).
 * Without Python or the model the old picks stay and the reason is printed: the film never stops here.
 */
import { execFile, spawn } from "node:child_process";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FREE_LICENCES, REPEAT_WINDOW_SECONDS, internetArchiveProvider, nasaProvider, pixabayProvider, pexelsProvider, toPick, verifyArchiveItem, wikimediaProvider } from "../../engine/src/film-media.mjs";
import { createRateLimiter, fetchShotMedia } from "../../engine/src/documentary-media-fetch.mjs";
import { chooseByWords, judgePicture } from "../critic.mjs";
import { groqLook, groqModel } from "../../worker/groq.mjs";

const run = promisify(execFile);

/** @typedef {{ country?: string, city?: string, demonym?: string, currency?: string, era?: string }} World */
/** @typedef {{ start: number, end: number, words?: string, place?: string, era?: string, people?: string, visual?: string }} Beat */

/** Where a country sits, so "a photo taken somewhere else" can be named. */
const REGION_OF = /** @type {Record<string, string>} */ ({
  India: "South Asia", Bangladesh: "South Asia", Pakistan: "South Asia", "Sri Lanka": "South Asia", Nepal: "South Asia",
  "United States": "North America", Canada: "North America", "United Kingdom": "Europe", France: "Europe", Germany: "Europe",
  "United Arab Emirates": "the Middle East", "Saudi Arabia": "the Middle East", Brazil: "South America", Nigeria: "Africa", Kenya: "Africa",
  China: "East Asia", Japan: "East Asia",
});
const REGIONS = Object.freeze({
  "South Asia": "a photo taken in South Asia", "North America": "a photo taken in the United States", Europe: "a photo taken in a European city",
  "South America": "a photo taken in South America, the Amazon rainforest", Africa: "a photo taken in Africa", "the Middle East": "a photo taken in the Arabian desert",
  "East Asia": "a photo taken in China or Japan",
});
/** Banknotes the film's money is not. */
const MONEY = Object.freeze({ dollars: "US dollar banknotes", euros: "euro banknotes", pounds: "British pound banknotes", rupees: "Indian rupee banknotes", taka: "Bangladeshi taka banknotes", dirhams: "UAE dirham banknotes", reais: "Brazilian real banknotes" });
/** Pictures that say nothing in any documentary (owner's judgement of film 993f09ea, 21 Nov 2026). */
const GENERIC_OFF = Object.freeze(["an abstract background", "an old film strip", "a computer animation of particles and light", "planets and stars in outer space", "a cartoon illustration", "a waterfall in a tropical jungle", "a person in front of a green screen", "a flat vector cartoon of people"]);
const QUALITY = Object.freeze(["a sharp, well lit, professional photograph", "a blurry, dark, low quality amateur photo"]);
const WATERMARK = Object.freeze(["a photo with a large watermark or logo text printed across it", "a clean photo with no text on it"]);
const ERA = Object.freeze(["an old black and white historical photograph", "a modern colour photo taken recently"]);

/** Countries and peoples a stock tag can name; a tag naming one the film is not set in refuses the picture. */
const COUNTRY_TAGS = Object.freeze({
  India: ["india", "indian", "bengaluru", "bangalore", "karnataka", "delhi", "mumbai"], Bangladesh: ["bangladesh", "bangladeshi", "dhaka"], Pakistan: ["pakistan", "pakistani", "karachi", "lahore"],
  "Sri Lanka": ["sri lanka", "colombo"], Nepal: ["nepal", "nepali", "kathmandu"], "United States": ["usa", "america", "american", "new york", "united states"],
  "United Kingdom": ["england", "british", "london", "uk"], Vietnam: ["vietnam", "vietnamese", "hanoi", "saigon"], Thailand: ["thailand", "thai", "bangkok"],
  Indonesia: ["indonesia", "bali", "jakarta"], China: ["china", "chinese", "beijing", "shanghai"], Japan: ["japan", "japanese", "tokyo"], Iran: ["iran", "iranian", "tehran"],
  Brazil: ["brazil", "brazilian", "amazon", "rio"], Mexico: ["mexico", "mexican"], "United Arab Emirates": ["dubai", "uae", "emirates", "abu dhabi"], Egypt: ["egypt", "egyptian", "cairo"],
  Turkey: ["turkey", "turkish", "istanbul"], Russia: ["russia", "russian", "moscow"], France: ["france", "french", "paris"], Italy: ["italy", "italian", "venice", "rome"],
  // Measured on film 993f09ea (26 Nov 2026): Australian notes for "rupees", a Bogotá street for Bengaluru traffic.
  Australia: ["australia", "australian", "sydney", "melbourne"], Colombia: ["colombia", "colombian", "bogot", "bogota", "medellin"], Canada: ["canada", "canadian", "toronto"],
  Spain: ["spain", "spanish", "madrid", "barcelona"], "South Korea": ["korea", "korean", "seoul"], Philippines: ["philippines", "filipino", "manila"], Malaysia: ["malaysia", "kuala lumpur"],
  Singapore: ["singapore"], "Hong Kong": ["hong kong"], Taiwan: ["taiwan", "taipei"], Peru: ["peru", "lima"], Morocco: ["morocco", "marrakech"], Kenya: ["kenya", "nairobi"], Nigeria: ["nigeria", "lagos"], "South Africa": ["south africa", "cape town"],
});

/**
 * Does a picture's title or tags name a country the film is not set in? ("haircut, barber shop, vietnam"
 * for a Bengaluru film; "money, rupees, pakistan" for Indian rupees.) Returns that country or "".
 * @param {string | null | undefined} title @param {World} world
 */
export function namesOtherCountry(title, world) {
  if (!world.country) return "";
  const words = ` ${String(title ?? "").toLowerCase().replace(/[^a-z]+/g, " ")} `;
  const own = new Set(COUNTRY_TAGS[/** @type {keyof typeof COUNTRY_TAGS} */ (world.country)] ?? []);
  for (const [country, tags] of Object.entries(COUNTRY_TAGS)) {
    if (country === world.country) continue;
    if (tags.some((t) => !own.has(t) && words.includes(` ${t} `))) return country;
  }
  return "";
}

/** Video width, still width (mission M3 hard filters) and the narrowest frame that fills 16:9 well. */
export const MIN_VIDEO_WIDTH = 1920;
export const MIN_STILL_WIDTH = 1600;
export const MIN_ASPECT = 1.3;
/** Two thumbnails this close (64-bit perceptual hash, Hamming distance) are the same picture. */
export const DUPLICATE_BITS = 8;
/** Footage first (mission M3 gate: >= 70 % video): a clip beats a still unless the still fits clearly better. */
export const VIDEO_EDGE = 0.5;
/** Above this, CLIP reads a watermark or logo across the picture: refused. */
export const WATERMARK_LIMIT = 0.8;
/** How far an off-world prompt may beat the shot's own before the picture is refused (CLIP similarity). */
export const OFF_WORLD_LIMIT = 0;

/** Is an era string historical (before 2000)? "1990s", "1880s–1890s", "1947". @param {string | undefined} era */
export function historicEra(era) {
  const years = [...String(era ?? "").matchAll(/\b(1[5-9]\d\d)s?\b/g)].map((m) => Number(m[1]));
  return years.length > 0 && Math.max(...years) < 2000;
}

/** The beat a shot sits in (largest time overlap), or null. @param {Beat[]} beats @param {number} start @param {number} end */
export function beatAt(beats, start, end) {
  let best = null, most = 0;
  for (const b of beats) {
    const o = Math.min(end, b.end) - Math.max(start, b.start);
    if (o > most) { most = o; best = b; }
  }
  return best;
}

/** "Bengaluru, India" from the beat, else the world. @param {Beat | null} beat @param {World} world */
export function placeOf(beat, world) {
  return beat?.place || [world.city, world.country].filter(Boolean).join(", ");
}

/**
 * What the shot should look like, as CLIP reads text: the subject in its place and era, and the words
 * the viewer hears over it. @param {{ query?: string | null, queries?: string[], description?: string }} shot @param {Beat | null} beat @param {World} world
 */
export function shotPrompts(shot, beat, world) {
  const subject = shot.query || shot.queries?.[0] || String(shot.description ?? "").replace(/^R\d\s*/, "");
  const place = placeOf(beat, world);
  const era = beat?.era || world.era || "";
  const where = [place, historicEra(era) ? era : ""].filter(Boolean).join(", ");
  const out = [`a photo of ${subject}${where ? ` in ${where}` : ""}`];
  // The words heard over this one shot when known (its own sentence); else the beat's words.
  const heard = /** @type {any} */ (shot).sentence || beat?.words;
  if (heard) out.push(`${place ? place + ": " : ""}${heard}`.slice(0, 300));
  return out;
}

/**
 * Pictures that are off this film's world, with the reason a person reads. Nothing country-specific is
 * added when the world names no country. @param {World} world
 * @returns {{ text: string, why: string }[]}
 */
export function offPrompts(world) {
  const out = GENERIC_OFF.map((text) => ({ text, why: "generic" }));
  if (world.currency) for (const [cur, text] of Object.entries(MONEY)) if (cur !== world.currency) out.push({ text, why: `money: not ${world.currency}` });
  const region = world.country ? REGION_OF[world.country] : undefined;
  if (region) {
    for (const [r, text] of Object.entries(REGIONS)) if (r !== region) out.push({ text, why: `place: not ${world.country}` });
    if (!["North America", "Europe"].includes(region)) out.push({ text: "a blonde white European person", why: `people: not ${world.demonym || world.country}` });
  }
  return out;
}

/** The region prompts for the place check: the film's own country first. @param {World} world */
export function placePrompts(world) {
  const region = world.country ? REGION_OF[world.country] : undefined;
  if (!world.country) return [];
  return [`a photo taken in ${world.country}`, ...Object.entries(REGIONS).filter(([r]) => r !== region).map(([, t]) => t)];
}

/** Searches for one shot: its own words in the film's country, then bare. @param {{ query?: string | null, queries?: string[] }} shot @param {World} world */
export function shotQueries(shot, world) {
  const base = [...new Set([shot.query, ...(shot.queries ?? [])].filter((q) => typeof q === "string" && q.trim().length > 1))].slice(0, 3);
  const out = [];
  for (const q of base) {
    if (world.country && !q.toLowerCase().includes(world.country.toLowerCase())) out.push(`${q} ${world.country}`);
    out.push(q);
  }
  return [...new Set(out)];
}

/** Searches every shot may draw from: the film's place and its topic words in that place. @param {World} world @param {string[]} topicWords */
export function worldQueries(world, topicWords) {
  if (!world.country) return [];
  const out = [world.city, `${world.city || world.country} street`, `${world.country} city`, `${world.country} people`].filter(Boolean);
  for (const w of topicWords.slice(0, 8)) out.push(`${w} ${world.country}`);
  return [...new Set(/** @type {string[]} */ (out))];
}

/** Picture types that are footage or a photograph (the designed cards are drawn, not searched). */
export const PICTURE_TYPES = Object.freeze(["live-video", "archival-video", "photo-2.5D", "photo-designed"]);

/**
 * The words heard over a shot, and the whole sentence they belong to (a shot that holds a fragment is
 * judged by its sentence). @param {{ text: string, start: number, end: number }[]} words @param {number} start @param {number} end
 */
export function shotSentence(words, start, end) {
  const inside = [];
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    const mid = (w.start + w.end) / 2;
    if (mid >= start && mid < end) inside.push(i);
  }
  if (!inside.length) return { heard: "", sentence: "" };
  const stop = (/** @type {number} */ i) => /[.?!]["')\]]?$/.test(words[i]?.text ?? "");
  let a = inside[0], b = inside[inside.length - 1];
  while (a > 0 && !stop(a - 1) && inside[0] - a < 25) a -= 1;
  while (b < words.length - 1 && !stop(b) && b - inside[inside.length - 1] < 25) b += 1;
  const text = (/** @type {number} */ x, /** @type {number} */ y) => words.slice(x, y + 1).map((w) => w.text).join(" ").replace(/\s+-/g, "-").replace(/\s+/g, " ").trim();
  return { heard: text(inside[0], inside[inside.length - 1]), sentence: text(a, b) };
}

/** Words that name nothing a camera can film. */
const UNFILMABLE = /^(?:the|a|an|and|or|but|so|of|to|in|on|at|by|for|with|from|as|is|was|were|be|been|are|has|have|had|he|she|it|its|his|her|they|them|their|we|our|this|that|these|those|what|who|how|when|where|which|one|most|some|any|no|not|still|only|then|now|also|just|said|says|say|accounts?|reports?|latest|first|after|before|again|about|over|under|there|here|nearly|almost|every|each|all|being|does|did|do|done|would|could|should|may|might|can|will|years?|old|new|own|way|thing|things|record|time|film|neither|none|none|hold|kept|keeps?|gives?|gave|agree|depends?|understood|happened|next)$/i;

/**
 * Searches written in code from the shot's own words, when no brain wrote them: the filmable words of
 * the line heard over it, two and one at a time. @param {string} heard @param {{ country?: string }} world
 */
export function sentenceQueries(heard, world = {}) {
  const words = String(heard).replace(/[^\p{L}\p{N}\s'-]/gu, " ").split(/\s+/).filter((w) => w.length > 2 && !UNFILMABLE.test(w) && !/^\d+$/.test(w));
  const out = [];
  if (words.length >= 2) out.push(`${words[words.length - 2]} ${words[words.length - 1]}`.toLowerCase());
  for (const w of words.slice(-3).reverse()) out.push(w.toLowerCase());
  if (!out.length && world.country) out.push(`${world.city || world.country} street`);
  return [...new Set(out)].slice(0, 3);
}

/** The picture researcher's brief: concrete, filmable searches in the film's world, one line per shot. */
export const QUERY_SYSTEM = [
  "You are the picture researcher of a documentary. For every shot you get the words the narrator says over it.",
  "Write three searches for a free stock VIDEO library (Pixabay) that would find footage showing exactly what those words say.",
  "Rules: 2 to 4 plain words each; things a camera can film (objects, places, actions, hands, streets); the film's country, city, era and money where they matter (\"rupee notes\", \"Indian street traffic\");",
  "an abstract line becomes a concrete image of its meaning (\"no filing backs that up\" -> \"hands searching files\"; \"years passed\" -> \"old clock ticking\");",
  "never a private person's name, never a word that means something else in stock libraries (\"bill\" -> \"tax bill paper\" or \"rupee notes\");",
  "a person is shown by hands, tools or from behind unless the line is about a crowd. The first search is the best one.",
  "Reply with exactly one line per shot and nothing else: ID | search one ; search two ; search three",
].join("\n");

/**
 * Read the researcher's lines into {id: [queries]}. @param {string} text
 * @returns {Map<string, string[]>}
 */
export function parseQueryLines(text) {
  const out = new Map();
  for (const line of String(text ?? "").split("\n")) {
    const m = /^\s*[*-]?\s*`?(SC\d{4,5}-\d+)`?\s*[|:]\s*(.+)$/.exec(line);
    if (!m) continue;
    const qs = m[2].split(/\s*;\s*/).map((q) => q.replace(/["`*]/g, "").trim().toLowerCase()).filter((q) => q.length > 1 && q.split(/\s+/).length <= 6);
    if (qs.length) out.set(m[1], [...new Set(qs)].slice(0, 3));
  }
  return out;
}

/**
 * The searches for every shot: the free brain writes them from each shot's own sentence and the film's
 * world (batches of 20), and code writes them from the words for any shot the brain did not answer.
 * @param {{ brain?: { call: (req: any) => Promise<{ text?: string }> } | null, shots: { id: string, heard: string, sentence: string }[], world: World, topic?: string, log?: (s: string) => void }} o
 */
export async function writeQueries(o) {
  /** @type {Map<string, string[]>} */
  const got = new Map();
  let calls = 0, answered = 0;
  const where = [o.world.city, o.world.country].filter(Boolean).join(", ");
  const brief = `Film: ${o.topic || "a documentary"}. World: ${where || "not given"}${o.world.era ? `, ${o.world.era}` : ""}${o.world.currency ? `, money in ${o.world.currency}` : ""}.`;
  if (o.brain) {
    for (let i = 0; i < o.shots.length; i += 20) {
      const batch = o.shots.slice(i, i + 20);
      calls += 1;
      try {
        const text = batch.map((s) => `${s.id} | heard: "${s.heard}"${s.sentence !== s.heard ? ` | sentence: "${s.sentence}"` : ""}`).join("\n");
        const reply = await o.brain.call({ stage: "V4", system: [{ text: QUERY_SYSTEM }], messages: [{ role: "user", content: [{ text: `${brief}\n\n${text}` }] }], maxTokens: 2400, effort: "low" });
        const lines = parseQueryLines(reply.text ?? "");
        for (const s of batch) if (lines.has(s.id)) { got.set(s.id, /** @type {string[]} */ (lines.get(s.id))); answered += 1; }
      } catch (e) {
        o.log?.(`Searches: the free brain did not answer a batch (${String(/** @type {any} */ (e)?.message ?? e).slice(0, 120)}); those shots search their own words.`);
      }
    }
  }
  /** @type {Map<string, { queries: string[], by: "brain" | "words" }>} */
  const out = new Map();
  for (const s of o.shots) {
    const brain = got.get(s.id);
    out.set(s.id, brain ? { queries: brain, by: "brain" } : { queries: sentenceQueries(s.heard || s.sentence, o.world), by: "words" });
  }
  return { queries: out, calls, answered };
}

/**
 * The media shots of the final shot plan (shots.json), so every pick lands on the shot the renderer
 * draws (scene and shot number as in s5-C1.md), each with the words heard over it.
 * @param {{ shots: { id: string, scene: string, start: number, end: number, type: string, rung?: string, subject?: string }[] }} plan
 * @param {{ text: string, start: number, end: number }[]} words
 */
export function planMediaShots(plan, words) {
  return plan.shots.filter((s) => PICTURE_TYPES.includes(s.type)).map((s) => {
    const { heard, sentence } = shotSentence(words, Number(s.start), Number(s.end));
    return { scene: s.scene, shot: Number(String(s.id).split("-").pop()), id: s.id, start: Number(s.start), end: Number(s.end), type: s.type, rung: s.rung ?? "R3", description: s.subject ?? "", heard, sentence, query: /** @type {string | null} */ (null), queries: /** @type {string[]} */ ([]), status: "planned", alternates: [], trace: [] };
  });
}

/**
 * How many of the shot's own search words a candidate's tags name (Pixabay tags are what a person
 * wrote about the clip): each one is worth TAG_BONUS, up to three. @param {string | null | undefined} title @param {string[]} queries
 */
export function tagHits(title, queries) {
  const tags = ` ${String(title ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const words = new Set(queries.flatMap((q) => q.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(" ")).filter((w) => w.length > 2 && !UNFILMABLE.test(w)));
  let n = 0;
  for (const w of words) if (tags.includes(` ${w} `) || tags.includes(` ${w}s `) || (w.endsWith("s") && tags.includes(` ${w.slice(0, -1)} `))) n += 1;
  return Math.min(3, n);
}
export const TAG_BONUS = 0.4;

/** Stock that is not documentary footage, by its tags (film 993f09ea: green-screen scissors and money). */
const NOT_FOOTAGE = /\b(green ?screen|greenscreen|chroma ?key|alpha channel|cartoon|clip ?art|vector|illustration|wedding|bride|groom)\b/i;

/** "not footage" when the tags say green screen, cartoon or a wedding the shot's own searches did not ask for. @param {string | null | undefined} title @param {string[]} queries */
export function notFootage(title, queries) {
  const m = NOT_FOOTAGE.exec(String(title ?? ""));
  if (!m) return "";
  return queries.some((q) => q.toLowerCase().includes(m[1].toLowerCase().split(" ")[0])) ? "" : "not footage";
}
/** What the critic's "this candidate shows the line" is worth: more than any CLIP difference between two candidates. */
export const FIT_BONUS = 5;
/** A still that fits still loses to a clip that fits (the film should move): half a clear CLIP difference. */
export const STILL_FIT_COST = 1;
/** Candidates the critic reads per shot and round (by their tags: about 25 tokens each). */
export const OFFER = 10;

/**
 * A small copy of a picture for the critic's eyes (320 px wide JPEG, as a data URL): a tenth of the
 * image tokens of the stock preview. Without ffmpeg or the file, the URL itself.
 * @param {string} url @returns {Promise<string>}
 */
export async function shrinkImage(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return url;
    const bytes = Buffer.from(await res.arrayBuffer());
    const jpg = await new Promise((resolve, reject) => {
      const p = spawn("ffmpeg", ["-v", "error", "-i", "pipe:0", "-vf", "scale=320:-2", "-frames:v", "1", "-q:v", "5", "-f", "mjpeg", "pipe:1"]);
      /** @type {Buffer[]} */
      const out = [];
      p.stdout.on("data", (d) => out.push(d));
      p.on("error", reject);
      p.on("close", (code) => (code === 0 && out.length ? resolve(Buffer.concat(out)) : reject(new Error(`ffmpeg ${code}`))));
      p.stdin.on("error", () => {});
      p.stdin.end(bytes);
    });
    return `data:image/jpeg;base64,${/** @type {Buffer} */ (jpg).toString("base64")}`;
  } catch {
    return url;
  }
}

/** @param {number[]} xs */
const softmax = (xs) => { const m = Math.max(...xs); const e = xs.map((x) => Math.exp(100 * (x - m))); const s = e.reduce((a, b) => a + b, 0); return e.map((x) => x / s); };

/**
 * One candidate's scores from its CLIP similarities. `at` maps each prompt group to its rows in the
 * text list. total = 10·relevance + place + 0.5·quality + 0.3·era − 10·(how far an off prompt beats
 * the shot's own) + VIDEO_EDGE for video. CLIP similarities sit near 0.15-0.35, so 0.05 of relevance is 0.5.
 * @param {number[]} sim @param {{ pos: number[], off: { row: number, why: string, text: string }[], place: number[], quality: number[], watermark: number[], era: number[] }} at @param {{ kind: string, historic: boolean }} o
 */
export function scoreOf(sim, at, o) {
  const relevance = at.pos.reduce((a, r) => a + sim[r], 0) / at.pos.length;
  let off = -1, offWhy = "", offText = "";
  for (const x of at.off) if (sim[x.row] > off) { off = sim[x.row]; offWhy = x.why; offText = x.text; }
  const place = at.place.length ? softmax(at.place.map((r) => sim[r]))[0] : 0.5;
  const quality = softmax(at.quality.map((r) => sim[r]))[0];
  const watermark = softmax(at.watermark.map((r) => sim[r]))[0];
  const eraP = softmax(at.era.map((r) => sim[r]));
  const era = o.historic ? eraP[0] : eraP[1];
  const offBy = at.off.length ? off - relevance : -1;
  const total = 10 * relevance + place + 0.5 * quality + 0.3 * era - 10 * Math.max(0, offBy + 0.03) + (o.kind === "video" ? VIDEO_EDGE : 0);
  const r = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  return { total: r(total), relevance: r(relevance), place: r(place), quality: r(quality), era: r(era), watermark: r(watermark), offBy: r(offBy), offWhy: offBy > 0 ? `${offWhy} (${offText})` : "" };
}

/** Hamming distance of two 16-hex-digit hashes. @param {string} a @param {string} b */
export function hamming(a, b) {
  let x = BigInt("0x" + a) ^ BigInt("0x" + b), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/**
 * Hard filters: free licence, size, landscape frame, watermark. Returns the reason a candidate is
 * refused, or "" when it may be chosen.
 * @param {{ mediaType: string, width: number | null, height: number | null, title?: string | null, rights: { allowed: boolean, licenseId: string } }} c @param {{ watermark: number } | null} score @param {World} [world]
 */
export function refusal(c, score, world = {}) {
  if (!c.rights?.allowed || !FREE_LICENCES.includes(c.rights.licenseId)) return "licence";
  if (!c.width || !c.height) return "size unknown";
  if (c.width < (c.mediaType === "video" ? MIN_VIDEO_WIDTH : MIN_STILL_WIDTH)) return "too small";
  if (c.width / c.height < MIN_ASPECT) return "not landscape";
  if (namesOtherCountry(c.title, world)) return "another country";
  if (!score) return "thumbnail not seen";
  if (score.watermark > WATERMARK_LIMIT) return "watermark";
  // OpenCLIP sees another world's money, place or people (or a cartoon, a green screen) more than the line:
  // refused outright, so no critic's yes on the tags can bring it back (film 993f09ea: dollars for rupees).
  if (/** @type {any} */ (score).offBy > OFF_WORLD_LIMIT) return "off-world";
  return "";
}

/**
 * The scale of a shot, as a picture reads it: a wide establishing frame, a medium frame with one subject,
 * or a close detail. Three CLIP prompts, one argmax; no second pass over the pictures.
 */
export const SCALES = Object.freeze(["wide", "medium", "close"]);
export const SCALE_PROMPTS = Object.freeze([
  "a wide establishing shot of a landscape, a city skyline or a large building",
  "a medium shot of one person or one object in its surroundings",
  "a close-up detail of hands, a face or a small object",
]);

/**
 * How different two pictures look, 0 (the same colour and light) to 1. Hue is weighted by how much
 * colour the two have, so two grey pictures differ only by their light.
 * @param {number[] | null | undefined} a [hue 0-360, chroma 0-1, light 0-1] @param {number[] | null | undefined} b
 */
export function colourDistance(a, b) {
  if (!a || !b || a.length < 3 || b.length < 3) return 0.5;
  const [h1, c1, l1] = a, [h2, c2, l2] = b;
  const dh = (Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2)) / 180) * Math.min(1, c1 + c2);
  return Math.min(1, Math.max(0, 0.5 * dh + 0.4 * Math.abs(l1 - l2) + 0.1 * Math.abs(c1 - c2)));
}

/** The scale a picture reads as (the highest of the three rows). @param {number[] | undefined} sim @param {number[]} rows */
export function scaleOf(sim, rows) {
  if (!sim || !rows?.length) return "";
  let best = -Infinity, at = "";
  rows.forEach((r, i) => { if (sim[r] > best) { best = sim[r]; at = SCALES[i]; } });
  return at;
}

/** How much the cut gains or loses by this picture following the last one (same weight in the tests). */
export const SEQUENCE = Object.freeze({ colour: 0.35, scaleSame: 0.18, scaleOther: 0.12, eraMismatch: 0.6 });

/**
 * Continuity of colour, variety of scale and agreement of era, as a small addition to a pick's score:
 * a picture close in colour to the one before it gains, two wide frames in a row lose, a modern colour
 * picture inside a historical scene loses. Small on purpose: relevance is 10x the clip similarity and
 * stays the first rule.
 * @param {{ col?: number[] | null, scale?: string } | null} prev @param {{ col?: number[] | null, scale?: string, era?: number }} x @param {boolean} historic
 */
export function sequenceBonus(prev, x, historic) {
  const out = { colour: 0, scale: 0, era: 0 };
  if (prev?.col && x.col) out.colour = SEQUENCE.colour * (1 - colourDistance(prev.col, x.col));
  if (prev?.scale && x.scale) out.scale = prev.scale === x.scale ? -SEQUENCE.scaleSame : SEQUENCE.scaleOther;
  if (historic && typeof x.era === "number" && x.era < 0.45) out.era = -SEQUENCE.eraMismatch;
  return out;
}

/**
 * Choose in film order: the best-scoring candidate not used, and not a near copy of a pick, within the
 * repeat window; colour, scale and era of the shot before it settle the near-ties. @template {{ id: string }} C
 * @param {{ start: number, historic?: boolean, ranked: { c: C, total: number, phash?: string, col?: number[] | null, scale?: string, era?: number }[] }[]} shots @param {number} [windowSeconds]
 * @returns {({ c: C, total: number, phash?: string, sequence?: { colour: number, scale: number, era: number, total: number, colourDistance: number | null, at: string } } | null)[]}
 */
export function chooseSequence(shots, windowSeconds = REPEAT_WINDOW_SECONDS) {
  /** @type {{ id: string, at: number, phash?: string }[]} */
  const used = [];
  /** @type {{ col?: number[] | null, scale?: string } | null} */
  let prev = null;
  const r3 = (/** @type {number} */ n) => Math.round(n * 1000) / 1000;
  return shots.map((s) => {
    const near = used.filter((u) => Math.abs(u.at - s.start) < windowSeconds);
    /** @type {typeof s.ranked[number] | null} */
    let pick = null;
    let best = -Infinity;
    let note = { colour: 0, scale: 0, era: 0 };
    for (const x of s.ranked) {
      if (near.some((u) => u.id === x.c.id || (u.phash && x.phash && hamming(u.phash, x.phash) <= DUPLICATE_BITS))) continue;
      const extra = sequenceBonus(prev, x, Boolean(s.historic));
      const total = x.total + extra.colour + extra.scale + extra.era;
      if (total > best) { best = total; pick = x; note = extra; }
    }
    if (pick) {
      const previous = prev;
      used.push({ id: pick.c.id, at: s.start, phash: pick.phash });
      const chosen = pick;
      prev = chosen;
      return { ...chosen, sequence: { ...note, total: r3(best), colourDistance: previous ? r3(colourDistance(previous.col, chosen.col)) : null, at: chosen.scale ?? "" } };
    }
    return null;
  });
}

/** @param {string} p */
const readJson = async (p) => JSON.parse(await readFile(p, "utf8"));
/** @param {string} p */
const readJsonOr = async (p, fallback = null) => (existsSync(p) ? readJson(p) : fallback);

/**
 * Pixabay through the studio's Worker relay (the same rule as local/voice-film.mjs stockRelayFetch).
 * @param {string | undefined} relay @returns {typeof fetch | undefined}
 */
function relayFetch(relay) {
  if (!relay) return undefined;
  return /** @type {typeof fetch} */ ((input, init) => {
    const u = new URL(String(input));
    if (u.host !== "pixabay.com" || !u.pathname.startsWith("/api/")) return fetch(input, init);
    const to = new URL(relay);
    to.searchParams.set("kind", u.pathname.startsWith("/api/videos") ? "video" : "image");
    for (const [k, v] of u.searchParams) if (k !== "key") to.searchParams.set(k, v);
    return fetch(to, init);
  });
}

/**
 * The whole pass over one run folder. With the final shot plan (shots.json) and the words (words.json),
 * every picture shot is searched from its own sentence (the free brain writes the searches, else code),
 * video first; archives only in a historical scene. After OpenCLIP chooses, the critic's eyes (`look`)
 * check every pick against its sentence; a miss is re-picked from the next candidates, at most twice.
 * @param {{ run: string, python?: string, env?: Record<string, string | undefined>, log?: (s: string) => void, sheet?: boolean, brain?: { call: (req: any) => Promise<{ text?: string }> } | null, look?: ((question: string, imageUrl: string) => Promise<string>) | null, topic?: string }} o
 */
export async function rerankRun(o) {
  const t0 = Date.now();
  const env = o.env ?? process.env;
  const log = o.log ?? ((s) => console.log(s));
  const mediaPath = join(o.run, "media-C1.json");
  const media = await readJsonOr(mediaPath, { chapter: "C1", providers: [], repeatWindowSeconds: REPEAT_WINDOW_SECONDS, shots: [] });
  const beatsFile = await readJsonOr(join(o.run, "beats.json"), { world: {}, beats: [] });
  /** @type {World} */
  const world = beatsFile.world ?? {};
  /** @type {Beat[]} */
  const beats = beatsFile.beats ?? [];
  const understanding = await readJsonOr(join(o.run, "understanding.json"), {});
  const topicWords = (understanding?.structure?.topicWords ?? []).map((/** @type {any} */ t) => t.word).filter((/** @type {string} */ w) => w.length > 2);
  // The final shot plan: the picks land on the shots the renderer draws, each searched from its own sentence.
  const shotPlan = await readJsonOr(join(o.run, "shots.json"), null);
  const wordsFile = await readJsonOr(join(o.run, "words.json"), null);
  /** @type {{ calls: number, answered: number, by: Record<string, number> } | null} */
  let written = null;
  if (shotPlan?.shots?.length && wordsFile?.words?.length) {
    media.shots = planMediaShots(shotPlan, wordsFile.words);
    const w = await writeQueries({ brain: o.brain ?? null, shots: media.shots, world, topic: o.topic ?? beatsFile.topic, log });
    for (const m of media.shots) { const q = /** @type {any} */ (w.queries.get(m.id)); m.queries = q.queries; m.query = q.queries[0] ?? null; m.queriesBy = q.by; }
    written = { calls: w.calls, answered: w.answered, by: { brain: media.shots.filter((/** @type {any} */ m) => m.queriesBy === "brain").length, words: media.shots.filter((/** @type {any} */ m) => m.queriesBy === "words").length } };
    log(`Searches: ${media.shots.length} picture shots, each from its own sentence; ${written.by.brain} written by the free brain, ${written.by.words} from the words.`);
  }

  const get = relayFetch(env.ZUPONA_STOCK_RELAY);
  const pixKey = env.PIXABAY_API_KEY || (env.ZUPONA_STOCK_RELAY ? "relay" : "");
  const stock = [
    ...(pixKey ? [pixabayProvider({ apiKey: pixKey, fetch: get, perPage: 50 })] : []),
    ...(env.PEXELS_API_KEY ? [pexelsProvider({ apiKey: env.PEXELS_API_KEY, perPage: 40 })] : []),
  ];
  // Real records of the named thing (R2): Commons and NASA report width, licence and restrictions with the
  // search; the Internet Archive adds century footage (mission M3 item 1), read of the public-domain collections only.
  const archives = [wikimediaProvider({ perPage: 30 }), nasaProvider({ perPage: 20 }), internetArchiveProvider({ perPage: 12 })];
  const limiter = createRateLimiter();
  /** @type {Map<string, Promise<any[]>>} */
  const searched = new Map();
  /** @param {string} query @param {"video" | "image"} kind @param {any[]} providers */
  const search = (query, kind, providers) => {
    const k = `${kind}|${providers.map((p) => p.id).join(",")}|${query}`;
    if (!searched.has(k)) searched.set(k, fetchShotMedia({ shotId: k, query, kind }, { providers, limiter, verifyItem: verifyArchiveItem, minCandidates: 999, maxWaitMs: 900_000 }).then((r) => r.candidates).catch(() => []));
    return /** @type {Promise<any[]>} */ (searched.get(k));
  };

  const shots = media.shots.filter((/** @type {any} */ s) => s.status !== "no-query" || s.queries?.length);
  const pool = worldQueries(world, topicWords);
  /** @type {Map<any, any[]>} */
  const candidatesOf = new Map();
  for (const s of shots) {
    const beat = beatAt(beats, s.start, s.end);
    const historic = historicEra(beat?.era || world.era);
    const qs = shotQueries(s, world);
    const lists = [];
    // Video first: every search on stock video; stills only from the best search; archives only for real history.
    for (const q of qs) {
      lists.push(search(q, "video", stock));
      if (historic) {
        lists.push(search(q, "video", archives));
        lists.push(search(q, "image", archives));
      }
    }
    if (qs[0]) lists.push(search(qs[0], "image", stock));
    let all = (await Promise.all(lists)).flat();
    // The film's place pool only when the shot's own searches found little: a generic street must not outbid the sentence.
    if (new Set(all.map((c) => c?.id)).size < 40) all = all.concat((await Promise.all(pool.map((q) => search(q, "video", stock)))).flat());
    if (s.pick) all.push({ ...s.pick, mediaType: s.pick.kind, rights: { allowed: true, licenseId: s.pick.licence?.licenseId } });
    /** @type {Map<string, any>} */
    const byId = new Map();
    for (const c of all) if (c?.id && c.previewUrl && !byId.has(c.id)) byId.set(c.id, c);
    candidatesOf.set(s, [...byId.values()]);
  }
  const searchSeconds = (Date.now() - t0) / 1000;
  const empty = shots.filter((/** @type {any} */ s) => !(candidatesOf.get(s) ?? []).length).length;
  if (empty) log(`Searches: ${empty} shot(s) found no candidate at all (a provider refused or timed out); their plan pick stays.`);

  // One text list for the whole film; each shot's own prompts are appended.
  const texts = [];
  const row = (/** @type {string} */ t) => { const i = texts.indexOf(t); if (i >= 0) return i; texts.push(t); return texts.length - 1; };
  const off = offPrompts(world).map((x) => ({ ...x, row: row(x.text) }));
  const shared = { off, place: placePrompts(world).map(row), quality: QUALITY.map(row), watermark: WATERMARK.map(row), era: ERA.map(row), scale: SCALE_PROMPTS.map(row) };
  const atOf = new Map(shots.map((/** @type {any} */ s) => [s, { ...shared, pos: shotPrompts(s, beatAt(beats, s.start, s.end), world).map(row) }]));
  const images = [];
  const seenImg = new Set();
  for (const list of candidatesOf.values()) for (const c of list) if (!seenImg.has(c.id)) { seenImg.add(c.id); images.push({ id: c.id, url: c.previewUrl }); }

  const python = o.python ?? env.ZUPONA_RANK_PYTHON ?? env.ZUPONA_PYTHON ?? "python3";
  const dir = await mkdtemp(join(tmpdir(), "asset-rank-"));
  await writeFile(join(dir, "req.json"), JSON.stringify({ texts, images, cache: env.ZUPONA_RANK_CACHE || undefined }));
  const script = new URL("./rank.py", import.meta.url).pathname;
  const t1 = Date.now();
  await run(python, [script, "score", join(dir, "req.json"), join(dir, "ans.json")], { maxBuffer: 1 << 26, timeout: 3600_000 });
  const ans = await readJson(join(dir, "ans.json"));
  const seeSeconds = (Date.now() - t1) / 1000;

  const plan = shots.map((/** @type {any} */ s) => {
    const beat = beatAt(beats, s.start, s.end);
    const historic = historicEra(beat?.era || world.era);
    const refused = /** @type {Record<string, number>} */ ({});
    /** @type {any[]} */
    const lastResort = [];
    const ranked = [];
    for (const c of candidatesOf.get(s) ?? []) {
      const sim = ans.sim[c.id];
      const score = sim ? scoreOf(sim, atOf.get(s), { kind: c.mediaType, historic }) : null;
      const why = refusal(c, score, world) || notFootage(c.title, s.queries ?? [s.query ?? ""]);
      const tags = tagHits(c.title, s.queries ?? [s.query ?? ""]);
      const row = { c, total: /** @type {any} */ (score)?.total + TAG_BONUS * tags, score: { .../** @type {any} */ (score), tags }, phash: ans.images[c.id]?.phash, col: ans.images[c.id]?.col ?? null, scale: scaleOf(sim, atOf.get(s).scale), era: /** @type {any} */ (score)?.era };
      if (why) { refused[why] = (refused[why] ?? 0) + 1; if (why === "off-world" && score) lastResort.push(row); continue; }
      ranked.push(row);
    }
    // Never an empty shot: when everything was refused as off-world, the least off-world come back, pushed down.
    if (!ranked.length) for (const x of lastResort) ranked.push({ ...x, total: x.total - FIT_BONUS });
    ranked.sort((a, b) => b.total - a.total);
    return { s, start: s.start, historic, ranked, refused, seen: (candidatesOf.get(s) ?? []).length };
  });
  // The critic, before the cut is chosen: the free brain reads each shot's best candidates by their tags
  // against the line heard over it. A candidate that does not show the line is banned for that shot; one
  // that does moves up. When none of a shot's ten fit, the next ten are offered (at most two re-picks).
  /** @type {Map<string, { fits: boolean | null, sees: string, why: string, by: string }>} */
  const verdicts = new Map();
  /** @type {Map<any, number>} */
  const repicks = new Map();
  const vkey = (/** @type {any} */ p, /** @type {any} */ x) => `${p.s.id}|${x.c.id}`;
  let asked = 0, looks = 0;
  const t2 = Date.now();
  if (o.brain) {
    for (let round = 0; round < 3; round += 1) {
      // Judged on the cut as it would be chosen now: a shot whose pick is not a confirmed fit is asked again,
      // and is offered only candidates no other shot has taken (no repeats, so a fit taken elsewhere is no help).
      const now = chooseSequence(plan);
      const taken = new Set(now.filter(Boolean).map((x) => /** @type {any} */ (x).c.id));
      const need = plan.filter((p, i) => p.s.sentence && p.ranked.length && (!now[i] || verdicts.get(vkey(p, now[i]))?.fits !== true));
      if (!need.length) break;
      // Video first: ten clips; a still only fills the ten when the shot has too few clips left.
      const offer = new Map(need.map((p) => {
        const mine = now[plan.indexOf(p)]?.c.id;
        const open = p.ranked.filter((x) => !verdicts.has(vkey(p, x)) && (x.c.id === mine || !taken.has(x.c.id)));
        const clips = open.filter((x) => x.c.mediaType === "video").slice(0, OFFER);
        return [p, clips.length >= OFFER ? clips : [...clips, ...open.filter((x) => x.c.mediaType !== "video").slice(0, OFFER - clips.length)]];
      }));
      const ask = need.filter((p) => /** @type {any[]} */ (offer.get(p)).length);
      if (!ask.length) break;
      asked += ask.length;
      const answers = await chooseByWords({ brain: o.brain, world, log, shots: ask.map((p) => ({ id: p.s.id, heard: p.s.heard, sentence: p.s.sentence, options: /** @type {any[]} */ (offer.get(p)).map((x) => String(x.c.title ?? "")) })) });
      for (const p of ask) {
        const nums = answers.get(p.s.id);
        if (!nums) continue;
        const opts = /** @type {any[]} */ (offer.get(p));
        opts.forEach((x, k) => {
          const rank = nums.indexOf(k + 1);
          verdicts.set(vkey(p, x), { fits: rank >= 0, sees: String(x.c.title ?? "").slice(0, 80), why: rank >= 0 ? `tags fit (choice ${rank + 1})` : "tags do not show the line", by: "words" });
          // The critic's own order among the ones that fit settles near-ties.
          if (rank >= 0) x.total += FIT_BONUS - 0.2 * rank - (x.c.mediaType === "video" ? 0 : STILL_FIT_COST);
        });
        // A re-pick: the shot's pick in the cut was refused, or a further ten offered (rounds two and three).
        const mine = now[plan.indexOf(p)]?.c.id;
        if (round > 0 || verdicts.get(`${p.s.id}|${mine}`)?.fits === false) repicks.set(p, (repicks.get(p) ?? 0) + 1);
        p.ranked = p.ranked.filter((x) => verdicts.get(vkey(p, x))?.fits !== false);
        p.ranked.sort((x, y) => y.total - x.total);
      }
    }
  }
  let chosen = chooseSequence(plan);

  // The critic's eyes on the cut itself (a model that sees, at 320 px): a pick it says does not show its
  // line is banned and the cut chosen again, at most twice. A used-up day leaves the rest unjudged by eye.
  /** @type {Map<string, string>} */
  const small = new Map();
  if (o.look) {
    let stopped = "";
    for (let round = 0; round < 3 && !stopped; round += 1) {
      const ask = plan.map((p, i) => ({ p, pick: chosen[i] })).filter(({ p, pick }) => pick && p.s.sentence && verdicts.get(vkey(p, pick))?.by !== "eyes");
      let again = false;
      for (const { p, pick } of ask) {
        if (stopped) break;
        const c = /** @type {any} */ (pick).c;
        if (!small.has(c.id)) small.set(c.id, await shrinkImage(c.previewUrl));
        looks += 1;
        const v = await judgePicture(/** @type {any} */ (o.look), { heard: p.s.heard, sentence: p.s.sentence, imageUrl: /** @type {string} */ (small.get(c.id)), world });
        if (v.fits === null) { if (/429|per day|TPD/i.test(v.why)) stopped = v.why; continue; }
        verdicts.set(vkey(p, pick), { ...v, by: "eyes" });
        if (v.fits === false && (repicks.get(p) ?? 0) < 2) {
          p.ranked = p.ranked.filter((x) => x.c.id !== c.id);
          repicks.set(p, (repicks.get(p) ?? 0) + 1);
          again = true;
        }
      }
      if (stopped) log(`Critic: the free eyes stopped (${stopped.slice(0, 120)}); the rest is judged by words only.`);
      if (!again) break;
      chosen = chooseSequence(plan);
    }
  }
  const lookSeconds = (Date.now() - t2) / 1000;

  await copyFile(mediaPath, join(o.run, "media-C1.before.json"));
  const report = [];
  plan.forEach((p, i) => {
    const pick = chosen[i];
    const s = p.s;
    const before = s.pick?.id ?? null;
    if (pick) {
      const c = pick.c;
      s.pick = c.licence ? { ...c, kind: c.mediaType } : toPick(c);
      delete s.pick.rights; delete s.pick.mediaType; delete s.pick.layer;
      s.status = "found";
      s.review = "eyes";
      s.alternates = p.ranked.filter((x) => x.c.id !== c.id).slice(0, 3).map((x) => x.c.id);
      const critic = verdicts.get(`${s.id}|${c.id}`) ?? null;
      s.why = { by: `OpenCLIP ${ans.model}`, ...pick.score, scale: pick.scale ?? null, provider: c.source, licence: s.pick.licence?.licenseId ?? null, candidates: p.seen, passed: p.ranked.length, refused: p.refused, sequence: pick.sequence ?? null, before, critic, repicks: repicks.get(p) ?? 0 };
      if (critic?.fits === false) s.review = "critic-miss";
    }
    report.push({ scene: s.scene, shot: s.shot, start: s.start, sentence: s.sentence ?? null, queries: s.queries ?? [], before, after: s.pick?.id ?? null, kind: s.pick?.kind ?? null, scale: pick?.scale ?? null, sequence: pick?.sequence ?? null, why: s.why ?? null, top: p.ranked.slice(0, 5).map((x) => ({ id: x.c.id, title: String(x.c.title ?? "").slice(0, 60), ...x.score })) });
  });
  const picks = report.filter((r) => r.after);
  // Continuity across the chosen picks (M3 item 5), measured on the same pass: no extra requests or passes.
  /** @type {any[]} */
  const seqPicks = chosen.filter(Boolean);
  const seqDists = seqPicks.slice(1).map((p, i) => colourDistance(seqPicks[i].col, p.col));
  const seqColour = seqDists.reduce((a, b) => a + b, 0);
  const seqColourCount = seqDists.length;
  const seqPairs = seqPicks.slice(1).map((/** @type {any} */ p, /** @type {number} */ i) => [seqPicks[i], p]).filter((/** @type {any[]} */ pair) => pair[0].scale && pair[1].scale);
  const seqVariety = seqPairs.filter((/** @type {any[]} */ pair) => pair[0].scale !== pair[1].scale).length;
  const seqVarietyCount = seqPairs.length;
  const summary = {
    model: ans.model, world, shots: report.length, picked: picks.length,
    video: picks.filter((r) => r.kind === "video").length,
    flaggedOff: picks.filter((r) => r.why?.offWhy).length,
    candidates: { total: images.length, perShotMin: Math.min(...plan.map((p) => p.seen)), perShotMax: Math.max(...plan.map((p) => p.seen)) },
    images: { computed: ans.computed, cached: ans.cached, unseen: ans.unseen ?? 0 },
    seconds: { search: Math.round(searchSeconds), see: Math.round(seeSeconds), look: Math.round(lookSeconds), total: Math.round((Date.now() - t0) / 1000) },
    searches: written,
    // The critic's numbers: how many picks it looked at, how many it sent back, and what is still a miss.
    critic: o.brain || o.look ? {
      shotsAsked: asked,
      looked: looks,
      firstRoundMisses: [...repicks.values()].filter((n) => n >= 1).length,
      repicked: [...repicks.values()].reduce((a, b) => a + b, 0),
      fits: picks.filter((r) => r.why?.critic?.fits === true).length,
      misses: picks.filter((r) => r.why?.critic?.fits === false).length,
      unknown: picks.filter((r) => !r.why?.critic || r.why.critic.fits === null).length,
    } : null,
    // The cut's own continuity (M3 item 5): mean colour change between neighbours, how often the scale
    // changes, and how many picks broke a historical scene. Measured, so the critic can read it.
    sequence: {
      colourDistanceMean: seqColour ? Math.round((seqColour / seqColourCount) * 1000) / 1000 : null,
      scaleVariety: seqVarietyCount ? Math.round((seqVariety / seqVarietyCount) * 1000) / 1000 : null,
      eraMismatch: picks.filter((r) => (r.sequence?.era ?? 0) < 0).length,
    },
  };
  await writeFile(mediaPath, JSON.stringify(media, null, 1));
  await writeFile(join(o.run, "rank-C1.json"), JSON.stringify({ summary, shots: report }, null, 1));
  log(`Eyes: ${summary.picked}/${summary.shots} shots chosen by OpenCLIP from ${summary.candidates.total} candidates (${summary.candidates.perShotMin}-${summary.candidates.perShotMax} per shot); video ${summary.video}/${summary.picked}; ${summary.flaggedOff} still look off-world; ${summary.images.unseen} thumbnails could not be fetched; ${summary.seconds.total} s (search ${summary.seconds.search} s, seeing ${summary.seconds.see} s).`);
  if (summary.critic) log(`Critic: ${summary.critic.shotsAsked} shot questions by words, ${summary.critic.looked} looks by eye; ${summary.critic.firstRoundMisses} shots sent back (${summary.critic.repicked} re-picks); now ${summary.critic.fits} fit, ${summary.critic.misses} still miss, ${summary.critic.unknown} not judged (${summary.seconds.look} s).`);
  log(`Cut: colour change between neighbours ${summary.sequence.colourDistanceMean ?? "-"} (0 = one colour, 1 = a new world); scale changes on ${summary.sequence.scaleVariety ?? "-"} of neighbouring pairs; ${summary.sequence.eraMismatch} pick(s) broke a historical scene.`);
  if (o.sheet) {
    for (const [name, which] of /** @type {const} */ ([["sheet-before.jpg", "before"], ["sheet-after.jpg", "after"]])) {
      const before = which === "before" ? await readJson(join(o.run, "media-C1.before.json")) : media;
      const tiles = before.shots.map((/** @type {any} */ s) => ({ url: s.pick?.previewUrl ?? "", label: `${s.scene}.${s.shot} ${Math.round(s.start)}s ${s.pick?.kind ?? "-"} ${s.pick?.source ?? ""}\n${String(s.pick?.title ?? "").slice(0, 46)}`, mark: which === "after" && Boolean(s.why?.offWhy) }));
      await writeFile(join(dir, "sheet.json"), JSON.stringify({ title: `${which}: ${world.city || ""} ${world.country || ""} ${world.era || ""}`.trim(), tiles, cache: env.ZUPONA_RANK_CACHE || undefined }));
      await run(python, [script, "sheet", join(dir, "sheet.json"), join(o.run, name)], { timeout: 600_000 });
    }
  }
  return summary;
}

/** @param {string[]} argv */
function args(argv) {
  /** @type {Record<string, string | boolean>} */
  const a = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const k = argv[i].slice(2);
    a[k] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
  }
  return a;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = args(process.argv.slice(2));
  if (typeof a.run !== "string") { console.error("Usage: node render/asset-rank/rerank.mjs --run <run folder> [--python <python>] [--sheet]"); process.exit(2); }
  // The free brain (Groq) writes the searches and its free eyes are the critic; without a key, code and OpenCLIP alone.
  const groq = process.env.GROQ_API_KEY && String(process.env.GROQ ?? "").toLowerCase() !== "off" ? String(process.env.GROQ_API_KEY) : "";
  rerankRun({ run: a.run, python: typeof a.python === "string" ? a.python : undefined, sheet: a.sheet === true, brain: groq ? groqModel({ apiKey: groq }) : null, look: groq ? groqLook({ apiKey: groq }) : null, topic: typeof a.topic === "string" ? a.topic : undefined }).catch((e) => {
    // The plan's own picks stay: the film is never stopped by the eyes.
    console.log(`::warning::The eyes could not rank the pictures (${String(e?.message ?? e).slice(0, 200)}); the plan's picks stay.`);
  });
}
