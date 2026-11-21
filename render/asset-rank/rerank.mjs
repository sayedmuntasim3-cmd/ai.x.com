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
import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { FREE_LICENCES, REPEAT_WINDOW_SECONDS, pixabayProvider, pexelsProvider, toPick, verifyArchiveItem, wikimediaProvider } from "../../engine/src/film-media.mjs";
import { createRateLimiter, fetchShotMedia } from "../../engine/src/documentary-media-fetch.mjs";

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
const GENERIC_OFF = Object.freeze(["an abstract background", "an old film strip", "a computer animation of particles and light", "planets and stars in outer space", "a cartoon illustration", "a waterfall in a tropical jungle"]);
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
  if (beat?.words) out.push(`${place ? place + ": " : ""}${beat.words}`.slice(0, 300));
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
  return "";
}

/**
 * Choose in film order: the best-scoring candidate not used, and not a near copy of a pick, within the
 * repeat window. @template {{ id: string }} C
 * @param {{ start: number, ranked: { c: C, total: number, phash?: string }[] }[]} shots @param {number} [windowSeconds]
 * @returns {({ c: C, total: number, phash?: string } | null)[]}
 */
export function chooseSequence(shots, windowSeconds = REPEAT_WINDOW_SECONDS) {
  /** @type {{ id: string, at: number, phash?: string }[]} */
  const used = [];
  return shots.map((s) => {
    const near = used.filter((u) => Math.abs(u.at - s.start) < windowSeconds);
    const pick = s.ranked.find((x) => !near.some((u) => u.id === x.c.id || (u.phash && x.phash && hamming(u.phash, x.phash) <= DUPLICATE_BITS))) ?? null;
    if (pick) used.push({ id: pick.c.id, at: s.start, phash: pick.phash });
    return pick;
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
 * The whole pass over one run folder. @param {{ run: string, python?: string, env?: Record<string, string | undefined>, log?: (s: string) => void, sheet?: boolean }} o
 */
export async function rerankRun(o) {
  const t0 = Date.now();
  const env = o.env ?? process.env;
  const log = o.log ?? ((s) => console.log(s));
  const mediaPath = join(o.run, "media-C1.json");
  const media = await readJson(mediaPath);
  const beatsFile = await readJsonOr(join(o.run, "beats.json"), { world: {}, beats: [] });
  /** @type {World} */
  const world = beatsFile.world ?? {};
  /** @type {Beat[]} */
  const beats = beatsFile.beats ?? [];
  const understanding = await readJsonOr(join(o.run, "understanding.json"), {});
  const topicWords = (understanding?.structure?.topicWords ?? []).map((/** @type {any} */ t) => t.word).filter((/** @type {string} */ w) => w.length > 2);

  const get = relayFetch(env.ZUPONA_STOCK_RELAY);
  const pixKey = env.PIXABAY_API_KEY || (env.ZUPONA_STOCK_RELAY ? "relay" : "");
  const stock = [
    ...(pixKey ? [pixabayProvider({ apiKey: pixKey, fetch: get, perPage: 50 })] : []),
    ...(env.PEXELS_API_KEY ? [pexelsProvider({ apiKey: env.PEXELS_API_KEY, perPage: 40 })] : []),
  ];
  // Real photographs of the named thing (R2): Commons reports width, licence and restrictions with the search.
  const archives = [wikimediaProvider({ perPage: 30 })];
  const limiter = createRateLimiter();
  /** @type {Map<string, Promise<any[]>>} */
  const searched = new Map();
  /** @param {string} query @param {"video" | "image"} kind @param {any[]} providers */
  const search = (query, kind, providers) => {
    const k = `${kind}|${providers.map((p) => p.id).join(",")}|${query}`;
    if (!searched.has(k)) searched.set(k, fetchShotMedia({ shotId: k, query, kind }, { providers, limiter, verifyItem: verifyArchiveItem, minCandidates: 999 }).then((r) => r.candidates).catch(() => []));
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
    for (const q of qs) {
      lists.push(search(q, "video", stock));
      if (s.rung === "R2" || historic) lists.push(search(q, "image", archives));
      lists.push(search(q, "image", stock));
    }
    for (const q of pool) lists.push(search(q, "video", stock));
    const all = (await Promise.all(lists)).flat();
    if (s.pick) all.push({ ...s.pick, mediaType: s.pick.kind, rights: { allowed: true, licenseId: s.pick.licence?.licenseId } });
    /** @type {Map<string, any>} */
    const byId = new Map();
    for (const c of all) if (c?.id && c.previewUrl && !byId.has(c.id)) byId.set(c.id, c);
    candidatesOf.set(s, [...byId.values()]);
  }
  const searchSeconds = (Date.now() - t0) / 1000;

  // One text list for the whole film; each shot's own prompts are appended.
  const texts = [];
  const row = (/** @type {string} */ t) => { const i = texts.indexOf(t); if (i >= 0) return i; texts.push(t); return texts.length - 1; };
  const off = offPrompts(world).map((x) => ({ ...x, row: row(x.text) }));
  const shared = { off, place: placePrompts(world).map(row), quality: QUALITY.map(row), watermark: WATERMARK.map(row), era: ERA.map(row) };
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
    const ranked = [];
    for (const c of candidatesOf.get(s) ?? []) {
      const sim = ans.sim[c.id];
      const score = sim ? scoreOf(sim, atOf.get(s), { kind: c.mediaType, historic }) : null;
      const why = refusal(c, score, world);
      if (why) { refused[why] = (refused[why] ?? 0) + 1; continue; }
      ranked.push({ c, total: /** @type {any} */ (score).total, score, phash: ans.images[c.id]?.phash });
    }
    ranked.sort((a, b) => b.total - a.total);
    return { s, start: s.start, ranked, refused, seen: (candidatesOf.get(s) ?? []).length };
  });
  const chosen = chooseSequence(plan);

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
      s.why = { by: `OpenCLIP ${ans.model}`, ...pick.score, provider: c.source, licence: s.pick.licence?.licenseId ?? null, candidates: p.seen, passed: p.ranked.length, refused: p.refused, before };
    }
    report.push({ scene: s.scene, shot: s.shot, start: s.start, before, after: s.pick?.id ?? null, kind: s.pick?.kind ?? null, why: s.why ?? null, top: p.ranked.slice(0, 5).map((x) => ({ id: x.c.id, title: String(x.c.title ?? "").slice(0, 60), ...x.score })) });
  });
  const picks = report.filter((r) => r.after);
  const summary = {
    model: ans.model, world, shots: report.length, picked: picks.length,
    video: picks.filter((r) => r.kind === "video").length,
    flaggedOff: picks.filter((r) => r.why?.offWhy).length,
    candidates: { total: images.length, perShotMin: Math.min(...plan.map((p) => p.seen)), perShotMax: Math.max(...plan.map((p) => p.seen)) },
    images: { computed: ans.computed, cached: ans.cached, unseen: ans.unseen ?? 0 },
    seconds: { search: Math.round(searchSeconds), see: Math.round(seeSeconds), total: Math.round((Date.now() - t0) / 1000) },
  };
  await writeFile(mediaPath, JSON.stringify(media, null, 1));
  await writeFile(join(o.run, "rank-C1.json"), JSON.stringify({ summary, shots: report }, null, 1));
  log(`Eyes: ${summary.picked}/${summary.shots} shots chosen by OpenCLIP from ${summary.candidates.total} candidates (${summary.candidates.perShotMin}-${summary.candidates.perShotMax} per shot); video ${summary.video}/${summary.picked}; ${summary.flaggedOff} still look off-world; ${summary.images.unseen} thumbnails could not be fetched; ${summary.seconds.total} s (search ${summary.seconds.search} s, seeing ${summary.seconds.see} s).`);
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
  rerankRun({ run: a.run, python: typeof a.python === "string" ? a.python : undefined, sheet: a.sheet === true }).catch((e) => {
    // The plan's own picks stay: the film is never stopped by the eyes.
    console.log(`::warning::The eyes could not rank the pictures (${String(e?.message ?? e).slice(0, 200)}); the plan's picks stay.`);
  });
}
