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
import { fitAdjust, planFit } from "../../engine/src/shot-fit.mjs";
import { MIN_FILLED, NEAR_COPY_BITS, contentBox, logoSource } from "../picture-taste.mjs";
import { FREE_LICENCES, REPEAT_WINDOW_SECONDS, internetArchiveProvider, nasaProvider, pixabayProvider, pexelsProvider, toPick, verifyArchiveItem, wikimediaProvider } from "../../engine/src/film-media.mjs";
import { createRateLimiter, fetchShotMedia } from "../../engine/src/documentary-media-fetch.mjs";
import { chooseByWords, judgePicture } from "../critic.mjs";
import { namedQueries, subjectOf } from "../../engine/src/picture-ladder.mjs";
import { mainTerms } from "../../engine/src/archive-guard.mjs";
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
/** A shot about a named thing: a relevant archive picture gains, generic stock loses (CLIP similarities sit near 0.15-0.35, so 10·relevance moves about 1.5). */
export const ARCHIVE_NAMED_EDGE = 2;
export const STOCK_NAMED_COST = 3;
/** The sources that are real archives, not stock. */
export const STOCK_SOURCES = Object.freeze(["pixabay", "pexels"]);

/**
 * For a shot that names something: is this candidate about it? An archive record must hold the name in its title;
 * a stock clip must carry one of the name words in its tags (a mining truck is not Apollo 11).
 * @param {{ source?: string, title?: string | null }} c @param {string[]} names
 */
export function aboutNames(c, names) {
  const words = [...new Set(names.flatMap((n) => mainTerms(n)))];
  if (!words.length) return true;
  const title = String(c.title ?? "").toLowerCase();
  return words.some((w) => new RegExp(`(^|[^\\p{L}\\p{N}])${w}(s|es)?($|[^\\p{L}\\p{N}])`, "u").test(title));
}

/**
 * What kind of record a pick is (owner's rule, 26 Nov 2026): A authentic historical, B authentic present-day,
 * C reconstruction, D CGI, E AI. Only A and B may stand as evidence; C-E are illustration and must be shown as such.
 * @param {{ source?: string, title?: string | null }} c @param {boolean} historic
 * @returns {"A" | "B" | "C" | "D" | "E"}
 */
export function recordClass(c, historic) {
  const tags = String(c.title ?? "").toLowerCase();
  if (/\b(ai[- ]generated|generative ai|midjourney|stable diffusion|dall-?e)\b/.test(tags) || /^(ai|fal|generated)$/.test(String(c.source ?? ""))) return "E";
  if (/\b(3d|render(ing)?|cgi|animation|animated|computer graphics|motion graphics)\b/.test(tags)) return "D";
  if (/\b(reenactment|re-enactment|reconstruction|costume|actor|staged)\b/.test(tags)) return "C";
  return historic && ["wikimedia", "nasa", "internet-archive", "loc", "smithsonian", "met", "artic"].includes(String(c.source ?? "")) ? "A" : "B";
}

/** A card's words: the line heard, cut to what one card can hold. @param {string} text */
export function cardText(text) {
  const t = String(text).replace(/\s+/g, " ").replace(/^[,;:\s]+|[,;:\s]+$/g, "").trim();
  return t.length <= 70 ? t : `${t.slice(0, 67).replace(/\s+\S*$/, "")}…`;
}

/**
 * Turn the named shots of a scene plan (s5-C1.md) into kinetic-type cards: the shot's text, its TYPE entry,
 * and the scene's FX. Other shots and fields are left exactly as they were.
 * @param {string} markdown @param {{ scene: string, shot: number, text: string }[]} gaps
 */
export function markGaps(markdown, gaps) {
  return markdown.split("\n").map((line) => {
    const sc = /^\W*(SC\d{4,5})\b/.exec(line)?.[1];
    const mine = gaps.filter((g) => g.scene === sc);
    if (!mine.length) return line;
    let out = line;
    for (const g of mine) {
      const card = `R1 kinetic-type card "${cardText(g.text).replace(/"/g, "'")}"`;
      out = out.replace(new RegExp(`(\\(${g.shot}\\)\\s+(?:\\d+:\\d\\d:\\d\\d(?:\\.\\d+)?-\\d+:\\d\\d:\\d\\d(?:\\.\\d+)?\\s+)?)(.*?)(?=\\s\\(${g.shot + 1}\\)\\s|\\s\\|\\s)`), (_m, head) => head + card);
      out = out.replace(/(\|\s*TYPE:\s*)([^|]*?)(\s*(?:\||$))/, (_m, a, types, z) => {
        const list = types.split(/;\s*/);
        if (list.length >= g.shot) list[g.shot - 1] = "kinetic-type";
        return a + list.join("; ") + z;
      });
    }
    if (/\|\s*FX:/.test(out)) { if (!/FX-KINETIC/.test(out)) out = out.replace(/(\|\s*FX:\s*)/, "$1FX-KINETIC "); }
    else out = out.replace(/(\|\s*TYPE:[^|]*)/, "$1 | FX: FX-KINETIC");
    return out;
  }).join("\n");
}

/** A line about the film's own person or family (postmortem P0: an unknown face shown as the real man). */
const ABOUT_SUBJECT = /\b(he|him|his|she|her|name|named|father|mother|son|wife|family|buyer|owner)\b/i;
/** Tags that show one person's face or figure (hands and tools are fine). */
const A_PERSON = /\b(man|woman|person|portrait|face|boy|girl|businessman|businesswoman|male|female|guy|lady|model|selfie|thinking|thoughtful)\b/i;

/** "stranger as the subject" when the line is about the film's person and the tags show a person who is not him. @param {string} heard @param {string | null | undefined} title */
export function strangerAsSubject(heard, title) {
  return ABOUT_SUBJECT.test(heard) && A_PERSON.test(String(title ?? "")) && !/\b(crowd|people|street|market|traffic)\b/i.test(String(title ?? "")) ? "stranger as the subject" : "";
}

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
 * The most candidates one shot may offer the eyes. Measured on the 38 s Apollo film (run 46093217850):
 * 2193 candidates over 12 shots (199-253 per shot) and 270 s of looking. A shot needs the few dozen that
 * pass the gates, not every result a search returned; the rest are refused anyway (licence, size, frame,
 * another country's tags, a green screen). 40 keeps the same top pick as looking at all of them on the
 * 40-shot fixture (40/40 at 40, 30 and 25; 39/40 at 20: render/asset-rank/rerank.test.mjs), and takes
 * the download and embedding from 225 candidates a shot to 40.
 */
export const CANDIDATE_CAP = 40;
/** Even a thin search keeps this many, so the critic still has somewhere to send a pick back to. */
export const CANDIDATE_FLOOR = 12;

/**
 * A candidate as the shot's own words see it, before any picture: the tags that name the search, then
 * footage before stills, then the bigger frame. Pure; used to order and to cap the pool.
 * @param {{ title?: string | null, mediaType?: string, width?: number | null, height?: number | null }} c @param {string[]} queries
 */
export function textRank(c, queries) {
  return [tagHits(c.title, queries), c.mediaType === "video" ? 1 : 0, Number(c.width) || 0, Number(c.height) || 0];
}

/** @param {number[]} a @param {number[]} b */
function descending(a, b) {
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}

/**
 * The candidates worth a thumbnail, chosen without one: what a download could never fix is dropped first
 * (licence, unknown or small size, portrait frame, another country's tags, green screen, wedding, a stranger
 * as the subject of a line about the film's own man, off-subject stock for a named shot), then the rest are
 * ordered by the shot's own words in their tags, video before stills, bigger before smaller, and only `cap`
 * are kept. A cap of 0 or less turns capping off (the old behaviour: look at everything).
 * @param {any[]} list @param {any} shot @param {World} world @param {number} [cap]
 */
export function capCandidates(list, shot, world = {}, cap = CANDIDATE_CAP) {
  const queries = shot?.queries ?? (shot?.query ? [shot.query] : []);
  const heard = `${shot?.heard ?? ""} ${shot?.sentence ?? ""}`;
  const named = Boolean(shot?.named);
  /** @type {{ c: any, key: number[] }[]} */
  const kept = [];
  const seen = new Set();
  for (const c of Array.isArray(list) ? list : []) {
    if (!c?.id || !c.previewUrl || seen.has(c.id)) continue;
    // Nothing a thumbnail could fix: the same gates the pick passes later, before the download.
    if (refusal(c, null, world) !== "thumbnail not seen") continue;
    if (notFootage(c.title, queries) || strangerAsSubject(heard, c.title)) continue;
    if (named && STOCK_SOURCES.includes(String(c.source)) && !aboutNames(c, shot?.names ?? [])) continue;
    seen.add(c.id);
    kept.push({ c, key: textRank(c, queries) });
  }
  kept.sort((a, b) => descending(a.key, b.key));
  const keep = Number.isFinite(cap) && cap > 0 ? Math.max(CANDIDATE_FLOOR, cap) : kept.length;
  return kept.slice(0, keep).map((x) => x.c);
}

/** Three of the shot's own search words in a clip's tags is a clear statement of what it shows. */
export const TEXT_DECISIVE_TAGS = 3;

/**
 * When one clip carries all three of the shot's words and no other candidate comes close, the eyes have
 * nothing to add: the pick is the text match, and it is not downloaded or embedded. Deliberately narrow:
 * it must be the only candidate at that tag count, it must be footage at full HD, and a named shot's pick
 * must still be about the name. Returns the shortlist (best first, at most three) or null.
 * @param {any[]} capped @param {any} shot @param {World} world
 * @returns {{ pick: any, tags: number, shortlist: any[] } | null}
 */
export function decisiveByText(capped, shot, world = {}) {
  if (!Array.isArray(capped) || capped.length < 2) return null;
  const queries = shot?.queries ?? (shot?.query ? [shot.query] : []);
  const ranked = capped.map((c) => ({ c, key: textRank(c, queries) })).sort((a, b) => descending(a.key, b.key));
  const best = ranked[0];
  const tags = best.key[0];
  if (tags < TEXT_DECISIVE_TAGS) return null;
  if (ranked[1].key[0] >= tags) return null; // a second clip names the words as well: let the eyes decide
  if (best.c.mediaType !== "video" || (Number(best.c.width) || 0) < MIN_VIDEO_WIDTH) return null;
  if (shot?.named && !aboutNames(best.c, shot?.names ?? [])) return null;
  if (namesOtherCountry(best.c.title, world)) return null;
  return { pick: best.c, tags, shortlist: ranked.slice(0, 3).map((x) => x.c) };
}

/**
 * Every search one chapter needs, each query once: the shots of a chapter that ask the same thing share
 * one answer, and nothing is asked twice. Pure (no network), so a test can hold the whole plan.
 * @param {any[]} shots @param {World} world @param {Map<any, boolean> | ((s: any) => boolean)} historicOf
 * @returns {{ query: string, kind: "video" | "image", group: "stock" | "archives" }[]}
 */
export function planChapterSearches(shots, world, historicOf) {
  const historic = typeof historicOf === "function" ? historicOf : (/** @type {any} */ s) => Boolean(historicOf?.get?.(s));
  /** @type {Map<string, { query: string, kind: "video" | "image", group: "stock" | "archives" }>} */
  const out = new Map();
  const add = (query, kind, group) => {
    const q = String(query ?? "").trim();
    if (q.length < 2) return;
    const k = `${kind}|${group}|${q}`;
    if (!out.has(k)) out.set(k, { query: q, kind, group });
  };
  for (const s of shots) {
    for (const x of shotSearches(s, world, historic(s))) add(x.query, x.kind, x.group);
  }
  return [...out.values()];
}

/**
 * The searches one shot asks for, in order and without the results: the shot's own words on stock video
 * (and on the archives when the scene is historical), stills from its best search, and for a named shot the
 * names on the archives first. The pool fallback needs the results, so it stays with the caller.
 * @param {any} s @param {World} world @param {boolean} historic
 * @returns {{ query: string, kind: "video" | "image", group: "stock" | "archives" }[]}
 */
export function shotSearches(s, world, historic) {
  const qs = s.named ? (s.queries ?? []).slice(0, 10) : shotQueries(s, world);
  /** @type {{ query: string, kind: "video" | "image", group: "stock" | "archives" }[]} */
  const out = [];
  if (s.named) {
    for (const q of qs.slice(0, Math.min(5, s.nameCount || 5))) {
      out.push({ query: q, kind: "video", group: "archives" });
      out.push({ query: q, kind: "image", group: "archives" });
    }
    for (const q of qs.slice(s.nameCount || 5)) out.push({ query: q, kind: "video", group: "stock" });
    if (qs[0]) out.push({ query: qs[0], kind: "image", group: "stock" });
  } else {
    for (const q of qs) {
      out.push({ query: q, kind: "video", group: "stock" });
      if (historic) {
        out.push({ query: q, kind: "video", group: "archives" });
        out.push({ query: q, kind: "image", group: "archives" });
      }
    }
    if (qs[0]) out.push({ query: qs[0], kind: "image", group: "stock" });
  }
  return out;
}

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
  // A broadcaster's footage carries the station's logo in a corner (the first two shots of film e0b87efb): never shown.
  if (logoSource(/** @type {any} */ (c))) return "broadcast logo";
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
 * What the candidate's own frame shows before it is chosen (the 64x36 gray tile rank.py keeps): a black or empty frame, or a
 * picture that sits small inside a black or white border. The same tests the critic runs on the finished film (picture-taste.mjs:
 * the clean box under MIN_FILLED), so a shot is not chosen to fail the gate later. Empty text = fine, or no tile to look at.
 * @param {{ gray?: string | null } | null | undefined} img
 */
export function frameFault(img) {
  if (!img?.gray) return "";
  const gray = new Uint8Array(Buffer.from(img.gray, "base64"));
  const w = 64, h = 36;
  if (gray.length !== w * h) return "";
  let sum = 0, sq = 0;
  for (const g of gray) { sum += g; sq += g * g; }
  const mean = sum / gray.length, sd = Math.sqrt(Math.max(0, sq / gray.length - mean * mean));
  if (mean < 14 && sd < 12) return "frame: black";
  if (sd < 3 && (mean < 30 || mean > 235)) return "frame: empty";
  const box = contentBox(gray, w, h, { floor: 0.15 });
  if (box.trimmed && box.w * box.h < MIN_FILLED) return `frame: fills ${Math.round(box.w * box.h * 100)}%`;
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
 * Crops and near copies of one stitched panorama are one picture: both titles say panorama / mosaic and open with the same two words.
 * @param {string | null | undefined} a @param {string | null | undefined} b
 */
export function sameMosaic(a, b) {
  const MOSAIC = /\b(?:panorama|panoramic|mosaic|stitched|pan)\b/i;
  if (!a || !b || !MOSAIC.test(a) || !MOSAIC.test(b)) return false;
  const head = (/** @type {string} */ t) => t.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
  return head(a) === head(b);
}

/**
 * Choose in film order (a picture is used at most once in the whole film, whatever the window): the best-scoring candidate not used, and not a near copy of a pick, within the
 * repeat window; colour, scale and era of the shot before it settle the near-ties. @template {{ id: string }} C
 * @param {{ start: number, historic?: boolean, ranked: { c: C, total: number, phash?: string, col?: number[] | null, scale?: string, era?: number }[] }[]} shots @param {number} [windowSeconds]
 * @returns {({ c: C, total: number, phash?: string, sequence?: { colour: number, scale: number, era: number, total: number, colourDistance: number | null, at: string } } | null)[]}
 */
export function chooseSequence(shots, windowSeconds = Infinity) {
  /** @type {{ id: string, at: number, phash?: string, title?: string }[]} */
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
      if (near.some((u) => u.id === x.c.id || (u.phash && x.phash && hamming(u.phash, x.phash) <= Math.max(DUPLICATE_BITS, NEAR_COPY_BITS)) || sameMosaic(u.title, /** @type {any} */ (x.c).title))) continue;
      const extra = sequenceBonus(prev, x, Boolean(s.historic));
      const total = x.total + extra.colour + extra.scale + extra.era;
      if (total > best) { best = total; pick = x; note = extra; }
    }
    if (pick) {
      const previous = prev;
      used.push({ id: pick.c.id, at: s.start, phash: pick.phash, title: /** @type {any} */ (pick.c).title });
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
  const words = wordsFile?.words ?? [];
  /** @type {{ calls: number, answered: number, by: Record<string, number> } | null} */
  let written = null;
  if (shotPlan?.shots?.length && wordsFile?.words?.length) {
    media.shots = planMediaShots(shotPlan, wordsFile.words);
    const w = await writeQueries({ brain: o.brain ?? null, shots: media.shots, world, topic: o.topic ?? beatsFile.topic, log });
    for (const m of media.shots) { const q = /** @type {any} */ (w.queries.get(m.id)); m.queries = q.queries; m.query = q.queries[0] ?? null; m.queriesBy = q.by; }
    written = { calls: w.calls, answered: w.answered, by: { brain: media.shots.filter((/** @type {any} */ m) => m.queriesBy === "brain").length, words: media.shots.filter((/** @type {any} */ m) => m.queriesBy === "words").length } };
    // Named things first, in code, after the brain: the film's subject plus the names of the shot's own sentence; the brain's moods follow.
    const subject = subjectOf(o.topic ?? beatsFile.topic ?? "", words.map((x) => x.text).join(" "));
    for (const m of media.shots) {
      const n = namedQueries({ sentence: m.sentence || m.heard, subject, queries: m.queries });
      if (n.queries.length) { m.queries = n.queries; m.query = n.queries[0]; }
      m.named = n.named; m.names = n.names; m.nameCount = n.nameCount;
    }
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
  /** @type {Map<any, boolean>} */
  const historicOf = new Map(shots.map((/** @type {any} */ s) => [s, historicEra(beatAt(beats, s.start, s.end)?.era || world.era)]));
  /** @type {Map<any, any[]>} */
  const candidatesOf = new Map();
  /** @param {any} s */
  const searchShot = async (s) => {
    const beat = beatAt(beats, s.start, s.end);
    const historic = Boolean(historicOf.get(s));
    const qs = s.named ? s.queries.slice(0, 10) : shotQueries(s, world);
    const lists = [];
    if (s.named) {
      // A named shot: the real archives first (video, then stills) on the names; stock only for the brain's mood queries,
      // and for the names too when the archives hold fewer than three relevant records.
      const names = qs.slice(0, Math.min(5, s.nameCount || 5));
      const arch = (await Promise.all(names.flatMap((q) => [search(q, "video", archives), search(q, "image", archives)]))).flat();
      const relevant = arch.filter((c) => c && aboutNames(c, s.names ?? []));
      lists.push(Promise.resolve(arch));
      const mood = qs.slice(s.nameCount || 5);
      for (const q of relevant.length >= 3 ? mood : qs) lists.push(search(q, "video", stock));
      if (relevant.length < 3 && qs[0]) lists.push(search(qs[0], "image", stock));
    } else {
    // Video first: every search on stock video; stills only from the best search; archives only for real history.
    for (const q of qs) {
      lists.push(search(q, "video", stock));
      if (historic) {
        lists.push(search(q, "video", archives));
        lists.push(search(q, "image", archives));
      }
    }
    if (qs[0]) lists.push(search(qs[0], "image", stock));
    }
    let all = (await Promise.all(lists)).flat();
    // The film's place pool only when the shot's own searches found little: a generic street must not outbid the sentence.
    if (!s.named && new Set(all.map((c) => c?.id)).size < 40) all = all.concat((await Promise.all(pool.map((q) => search(q, "video", stock)))).flat());
    // A named shot keeps its plan pick only when that pick is about the name.
    if (s.pick && (!s.named || aboutNames({ source: s.pick.source, title: s.pick.title }, s.names ?? []))) all.push({ ...s.pick, mediaType: s.pick.kind, rights: { allowed: true, licenseId: s.pick.licence?.licenseId } });
    /** @type {Map<string, any>} */
    const byId = new Map();
    for (const c of all) if (c?.id && c.previewUrl && !byId.has(c.id)) byId.set(c.id, c);
    candidatesOf.set(s, [...byId.values()]);
  };
  // One chapter's searches are planned once and asked in parallel: a query two shots share is searched
  // once (the memo below is keyed by query and providers), and the rate limiter stays the only brake.
  const searchConcurrency = Math.max(1, Number(env.ZUPONA_SEARCH_CONCURRENCY) || 12);
  const planned = planChapterSearches(shots, world, historicOf);
  const queue = [...planned];
  await Promise.all(Array.from({ length: Math.min(searchConcurrency, Math.max(1, planned.length)) }, async () => {
    for (let p = queue.shift(); p; p = queue.shift()) await search(p.query, p.kind, p.group === "archives" ? archives : stock);
  }));
  const preSearchSeconds = (Date.now() - t0) / 1000;
  // Shots are gathered several at a time (their searches are already in hand): one after another took an hour on 463 shots.
  const todoShots = [...shots];
  await Promise.all(Array.from({ length: Math.max(1, Number(env.ZUPONA_SEARCH_CONCURRENCY) || 8) }, async () => { for (let s = todoShots.shift(); s; s = todoShots.shift()) await searchShot(s); }));
  const searchSeconds = (Date.now() - t0) / 1000;
  const empty = shots.filter((/** @type {any} */ s) => !(candidatesOf.get(s) ?? []).length).length;
  if (empty) log(`Searches: ${empty} shot(s) found no candidate at all (a provider refused or timed out); their plan pick stays.`);
  // Cap before any download: the eyes look at the shot's best candidates, not at every result a search
  // returned (measured: 199-253 per shot, 2193 in a 38 s film). ZUPONA_CANDIDATE_CAP=0 looks at all of them.
  const cap = Number(env.ZUPONA_CANDIDATE_CAP ?? CANDIDATE_CAP);
  let offered = 0, cappedAway = 0;
  for (const s of shots) {
    const all = candidatesOf.get(s) ?? [];
    const kept = capCandidates(all, s, world, cap);
    offered += all.length;
    cappedAway += all.length - kept.length;
    candidatesOf.set(s, kept);
  }
  if (cappedAway) log(`Candidates: ${offered} found, ${offered - cappedAway} kept for the eyes (${cappedAway} refused before a download: licence, size, frame, another country, green screen; the rest beyond the cap of ${cap > 0 ? Math.max(CANDIDATE_FLOOR, cap) : "off"}).`);

  // One text list for the whole film; each shot's own prompts are appended.
  const texts = [];
  const row = (/** @type {string} */ t) => { const i = texts.indexOf(t); if (i >= 0) return i; texts.push(t); return texts.length - 1; };
  const off = offPrompts(world).map((x) => ({ ...x, row: row(x.text) }));
  const shared = { off, place: placePrompts(world).map(row), quality: QUALITY.map(row), watermark: WATERMARK.map(row), era: ERA.map(row), scale: SCALE_PROMPTS.map(row) };
  const atOf = new Map(shots.map((/** @type {any} */ s) => [s, { ...shared, pos: shotPrompts(s, beatAt(beats, s.start, s.end), world).map(row) }]));
  // When the shot's own words already name one clip, that shot is not sent to the eyes at all: nothing of
  // it is downloaded or embedded, and its best three are scored by their tags alone.
  /** @type {Map<any, { pick: any, tags: number, shortlist: any[] }>} */
  const textPicks = new Map();
  if (String(env.ZUPONA_TEXT_DECISIVE ?? "on").toLowerCase() !== "off") {
    for (const s of shots) { const d = decisiveByText(candidatesOf.get(s) ?? [], s, world); if (d) textPicks.set(s, d); }
  }
  const images = [];
  const seenImg = new Set();
  for (const [s, list] of candidatesOf) {
    if (textPicks.has(s)) continue;
    for (const c of list) if (!seenImg.has(c.id)) { seenImg.add(c.id); images.push({ id: c.id, url: c.previewUrl }); }
  }
  if (textPicks.size) log(`Eyes: ${textPicks.size} of ${shots.length} shot(s) are decided by their own words (one clip carries all three searches, nothing else comes close); they are not looked at.`);

  const python = o.python ?? env.ZUPONA_RANK_PYTHON ?? env.ZUPONA_PYTHON ?? "python3";
  const dir = await mkdtemp(join(tmpdir(), "asset-rank-"));
  const budget = Math.max(60, Number(env.ZUPONA_RANK_BUDGET) || 1500);
  await writeFile(join(dir, "req.json"), JSON.stringify({
    texts, images, cache: env.ZUPONA_RANK_CACHE || undefined, budget_seconds: budget,
    // Parallel thumbnail downloads with their own time limit, and the embedding batch size.
    fetch_workers: Math.max(1, Number(env.ZUPONA_FETCH_WORKERS) || 24),
    fetch_budget_seconds: Math.max(30, Number(env.ZUPONA_FETCH_BUDGET) || Math.min(300, Math.round(budget * 0.4))),
    embed_batch: Math.max(8, Number(env.ZUPONA_EMBED_BATCH) || 64),
  }));
  const script = new URL("./rank.py", import.meta.url).pathname;
  const t1 = Date.now();
  try {
    await run(python, [script, "score", join(dir, "req.json"), join(dir, "ans.json")], { maxBuffer: 1 << 26, timeout: (budget + 900) * 1000 });
  } catch (/** @type {any} */ e) {
    // The first lines of a failed run are only Hugging Face notices; the cause is at the end (film ccd86532 lost it to a 200-character cut).
    const err = String(e?.stderr ?? "").trim().split("\n").filter((l) => !/unauthenticated|HF_TOKEN|huggingface/i.test(l)).slice(-6).join(" | ");
    throw new Error(`rank.py ${e?.killed ? `was stopped after ${Math.round((Date.now() - t1) / 1000)} s (${e?.signal ?? "timeout"})` : `exited with code ${e?.code ?? "?"}`}: ${err || "no error text"}`);
  }
  const ans = await readJson(join(dir, "ans.json"));
  const seeSeconds = (Date.now() - t1) / 1000;

  // The shot's own sentence first, in story order (engine/src/shot-fit.mjs): launch lines get launch pictures, the Moon only when the words reach it.
  const fitOf = planFit(shots);
  const plan = shots.map((/** @type {any} */ s) => {
    const beat = beatAt(beats, s.start, s.end);
    const historic = historicEra(beat?.era || world.era);
    const refused = /** @type {Record<string, number>} */ ({});
    /** @type {any[]} */
    const lastResort = [];
    const ranked = [];
    for (const c of candidatesOf.get(s) ?? []) {
      const sim = ans.sim[c.id];
      const decided = textPicks.get(s) ?? null;
      const byText = !sim && Boolean(decided?.shortlist.some((x) => x.id === c.id));
      // A text-decided shot's shortlist is scored by its tags: no thumbnail was looked at, so watermark and
      // off-world are unknown (never failed), and the critic's eyes still see the pick itself. No relevance
      // number is written: 0 would read as a weak picture to the critic and the contact sheet; absent is unknown.
      const score = sim ? scoreOf(sim, atOf.get(s), { kind: c.mediaType, historic }) : byText ? { total: 0, place: 0.5, quality: 0.5, era: 0.5, watermark: 0, offBy: -1, offWhy: "", by: "text" } : null;
      const stock = STOCK_SOURCES.includes(String(c.source));
      const aboutIt = !s.named || aboutNames(c, s.names ?? []);
      const why = (s.named && !aboutIt && stock ? "off-subject" : "") || refusal(c, score, world) || frameFault(ans.images?.[c.id]) || notFootage(c.title, s.queries ?? [s.query ?? ""]) || strangerAsSubject(`${s.heard ?? ""} ${s.sentence ?? ""}`, c.title);
      const tags = tagHits(c.title, s.queries ?? [s.query ?? ""]);
      const fit = fitAdjust(/** @type {any} */ (fitOf.get(s)), `${c.title ?? ""} ${(c.tags ?? []).join?.(" ") ?? ""}`);
      const row = { c, total: (/** @type {any} */ (score)?.total ?? 0) + TAG_BONUS * tags + fit + (s.named ? (stock ? -STOCK_NAMED_COST : aboutIt ? ARCHIVE_NAMED_EDGE : 0) : 0), score: { .../** @type {any} */ (score), tags, fit, stage: fitOf.get(s)?.stage ?? null }, phash: ans.images[c.id]?.phash, col: ans.images[c.id]?.col ?? null, scale: scaleOf(sim, atOf.get(s).scale), era: /** @type {any} */ (score)?.era };
      if (why) { refused[why] = (refused[why] ?? 0) + 1; if ((why === "off-world" || why.startsWith("frame:")) && score) lastResort.push(row); continue; }
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

  // The other candidates, kept (render/autofix.mjs): a film blocked on a shot's own picture is re-picked from
  // these in the same rank order, without searching again and without a lower relevance floor.
  const candidateShots = plan.map((p) => ({
    id: p.s.id,
    ranked: p.ranked.slice(0, 8).map((x) => {
      const c = /** @type {any} */ (x.c);
      const pick = c.licence ? { ...c, kind: c.mediaType } : toPick(c);
      delete pick.rights; delete pick.mediaType; delete pick.layer;
      return { id: String(c.id), title: String(c.title ?? "").slice(0, 120), total: Math.round(x.total * 1000) / 1000, relevance: Number.isFinite(Number(x.score?.relevance)) ? Number(x.score.relevance) : null, pick };
    }),
  }));
  await writeFile(join(o.run, "candidates-C1.json"), JSON.stringify({ chapter: media.chapter ?? "C1", at: new Date().toISOString(), shots: candidateShots }, null, 1));
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
      s.review = textPicks.has(p.s) ? "text" : "eyes";
      s.alternates = p.ranked.filter((x) => x.c.id !== c.id).slice(0, 3).map((x) => x.c.id);
      const critic = verdicts.get(`${s.id}|${c.id}`) ?? null;
      s.why = { by: `OpenCLIP ${ans.model}`, ...pick.score, scale: pick.scale ?? null, provider: c.source, licence: s.pick.licence?.licenseId ?? null, candidates: p.seen, passed: p.ranked.length, refused: p.refused, sequence: pick.sequence ?? null, before, critic, repicks: repicks.get(p) ?? 0, record: recordClass(c, p.historic), textMatch: textPicks.has(p.s) };
      if (critic?.fits === false) s.review = "critic-miss";
    }
    report.push({ scene: s.scene, shot: s.shot, start: s.start, sentence: s.sentence ?? null, queries: s.queries ?? [], before, after: s.pick?.id ?? null, kind: s.pick?.kind ?? null, scale: pick?.scale ?? null, sequence: pick?.sequence ?? null, why: s.why ?? null, // The candidates keep their own picture and licence: "My films" offers them as swaps, and only a
      // free-licence clip with a picture may be offered (engine/src/edit-pack.mjs checks it again).
      top: p.ranked.slice(0, 5).map((x) => ({ id: x.c.id, title: String(x.c.title ?? "").slice(0, 60), previewUrl: x.c.previewUrl ?? null, mediaUrl: x.c.mediaUrl ?? null, source: x.c.source ?? null, sourcePageUrl: x.c.sourcePageUrl ?? null, kind: x.c.mediaType ?? x.c.kind ?? null, licence: x.c.rights?.licenseId ?? x.c.licence?.licenseId ?? (typeof x.c.licence === "string" ? x.c.licence : null), ...x.score })) });
  });
  // No off-topic fallback: a named shot with no relevant pick of its own holds the nearest strong pick of the film, never a random picture.
  // The same for any shot no picture fits (owner's rule: never a card of white text on empty black): it holds the nearest strong pick, moving.
  const strong = plan.map((p, i) => ({ s: p.s, pick: chosen[i] })).filter((x) => x.pick && (!x.s.named || aboutNames(/** @type {any} */ (x.pick).c, x.s.names ?? [])));
  for (let i = 0; i < plan.length; i += 1) {
    const s = plan[i].s;
    if (chosen[i] || !strong.length) continue;
    const near = [...strong].sort((a, b) => Math.abs(a.s.start - s.start) - Math.abs(b.s.start - s.start))[0];
    s.pick = { .../** @type {any} */ (near.s.pick) };
    s.status = "found"; s.review = "held"; s.held = true; s.reused = near.s.pick?.id;
    s.why = { by: "held: no picture fits this shot, the nearest strong pick is held", provider: near.s.pick?.source ?? null };
    log(`Held: ${s.id} found nothing relevant for ${(s.names ?? []).slice(0, 2).join(" / ")}; it holds ${near.s.id}.`);
  }
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
    records: Object.fromEntries(["A", "B", "C", "D", "E"].map((k) => [k, picks.filter((r) => r.why?.record === k).length])),
    candidates: { found: offered, total: images.length, perShotMin: Math.min(...plan.map((p) => p.seen)), perShotMax: Math.max(...plan.map((p) => p.seen)), cap: cap > 0 ? Math.max(CANDIDATE_FLOOR, cap) : null, dropped: cappedAway },
    images: { computed: ans.computed, cached: ans.cached, unseen: ans.unseen ?? 0 },
    // The shots whose pick needed no look, and the searches: how many one chapter asked, and how many were
    // distinct (a query two shots share is one search).
    textDecided: textPicks.size,
    searchPlan: { planned: planned.length },
    seconds: {
      search: Math.round(searchSeconds), presearch: Math.round(preSearchSeconds), see: Math.round(seeSeconds), look: Math.round(lookSeconds),
      fetch: ans.timings?.fetch ?? null, embed: ans.timings?.embed ?? null, total: Math.round((Date.now() - t0) / 1000),
    },
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
  // A shot no right picture was found for becomes a designed line of its own words (owner's rule: a
  // marked gap or a card, never an unrelated photo). The plan files say so, so the renderer draws a card.
  const gaps = plan.filter((p, i) => !chosen[i] && p.s.heard && p.s.review !== "held").map((p) => ({ scene: p.s.scene, shot: p.s.shot, text: p.s.heard }));
  if (gaps.length) {
    const s5 = join(o.run, "s5-C1.md");
    if (existsSync(s5)) await writeFile(s5, markGaps(await readFile(s5, "utf8"), gaps));
    if (shotPlan?.shots) {
      for (const g of gaps) { const x = shotPlan.shots.find((/** @type {any} */ y) => y.id === `${g.scene}-${g.shot}`); if (x) { x.type = "kinetic-type"; x.subject = cardText(g.text); x.gap = "no picture showed the line"; } }
      await writeFile(join(o.run, "shots.json"), JSON.stringify(shotPlan, null, 1));
    }
    for (const g of gaps) { const m = media.shots.find((/** @type {any} */ y) => y.scene === g.scene && y.shot === g.shot); if (m) { m.status = "gap-card"; delete m.pick; } }
    log(`Gaps: ${gaps.length} shot(s) had no picture that shows the line; each is now a designed card of its own words (${gaps.map((g) => `${g.scene}-${g.shot}`).join(", ")}).`);
  }
  summary.gapCards = gaps.length;
  await writeFile(mediaPath, JSON.stringify(media, null, 1));
  await writeFile(join(o.run, "rank-C1.json"), JSON.stringify({ summary, shots: report }, null, 1));
  log(`Eyes: ${summary.picked}/${summary.shots} shots chosen from ${summary.candidates.total} looked-at candidates (${summary.candidates.perShotMin}-${summary.candidates.perShotMax} per shot; ${summary.candidates.found} found, ${summary.candidates.dropped} refused before a download); ${summary.textDecided} decided by their own words without a look; video ${summary.video}/${summary.picked}; ${summary.flaggedOff} still look off-world; ${summary.images.unseen} thumbnails could not be fetched; ${summary.seconds.total} s (search ${summary.seconds.search} s, download ${summary.seconds.fetch ?? "-"} s, embed ${summary.seconds.embed ?? "-"} s, seeing ${summary.seconds.see} s).`);
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
    console.log(`::warning::The eyes could not rank the pictures (${String(e?.message ?? e).slice(0, 700)}); the plan's picks stay.`);
  });
}
