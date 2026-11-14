/**
 * Media for a recitation film: a licensed asset for every shot of the
 * director's list, or a stated gap. Real video first, then photographs
 * (moved gently by the renderer); generated footage is never searched for
 * here (it is off unless the owner turns it on, and it is paid).
 * Every candidate is checked before use, and a rejected one says why:
 *  - licence: free for a monetised film (classifyLicense; the item page
 *    check for archive items);
 *  - adab: title, tags and description through the words that would bring
 *    people, faces, animals (by level), depictions (paintings, statues,
 *    icons), music, or generated pictures;
 *  - relevance: the title names what the shot asks for (an olive grove for
 *    "olive grove", not a book scan that mentions olives somewhere);
 *  - quality: at least 1920 pixels wide; a video at least as long as it
 *    must hold, or 8 s;
 *  - no asset twice in one film (the refrain uses its motif, not its file).
 * A frame check by a face and person detector is a second net, run where
 * the machine has one (local/media/detect.py); its miss rate is stated
 * there. The manifest lists origin, author, licence and where each asset is
 * used; the credits are written for the video description.
 */
import { classifyLicense } from "./documentary-media-fetch.mjs";
import { allowedAt } from "./quran-director.mjs";
import { msg } from "./messages.mjs";

/** Providers that carry nature, sky, sea and landscape (art and history archives are left out: they show people and depictions). */
export const QURAN_PROVIDERS = Object.freeze(["pexels", "pixabay", "wikimedia", "nasa", "openverse"]);

export const MEDIA_RULES = Object.freeze({ minWidth: 1920, minVideoSeconds: 8, perQuery: 12, maxSlowdown: 1.5 });

/** Reverent landscapes for the last rung: real nature, nothing living, nothing made. */
export const LANDSCAPES = Object.freeze(["mountains", "sea", "clouds", "forest", "desert", "sky", "river", "waterfall", "lake", "valley", "sunrise", "sunset", "canyon", "glacier", "dunes"]);
/** For the unseen: only the widest, quietest nature. */
const SYMBOL_LANDSCAPES = Object.freeze(["sky", "clouds", "sunrise", "horizon", "lake", "sea"]);

/**
 * The phrases to search for one shot, in order: its own picture, its
 * family, the plain nouns of both, then reverent landscapes.
 * @param {{ motif: string, look: string[], symbolic?: boolean }} s @param {import("./quran-director.mjs").AdabLevel} level
 * @returns {{ q: string, rung: "own" | "family" | "nouns" | "landscape" }[]}
 */
export function searchLadder(s, level) {
  /** @type {{ q: string, rung: "own" | "family" | "nouns" | "landscape" }[]} */
  const out = [];
  const add = (/** @type {string} */ q, /** @type {"own" | "family" | "nouns" | "landscape"} */ rung) => { if (q && allowedAt(q, level) && !out.some((x) => x.q === q)) out.push({ q, rung }); };
  add(s.motif, "own");
  for (const l of s.look) add(l, "family");
  for (const phrase of [s.motif, ...s.look]) for (const w of phrase.toLowerCase().split(/[^a-z]+/)) if (w.length > 3 && !DESCRIBING.has(w)) add(w, "nouns");
  for (const l of s.symbolic ? SYMBOL_LANDSCAPES : LANDSCAPES) add(l, "landscape");
  return out;
}

/** Words in a title or tags that rule a picture out under the Quran, whatever the level. */
const NEVER = /\b(paintings?|painted|oil on canvas|artworks?|pd-art|engravings?|lithographs?|watercolou?rs?|museum|portraits?|people|men|women|illustration|drawing|mosaic|icon|fresco|statue|sculpture|idol|cartoon|anime|cgi|3d render|rendering|ai[- ]generated|generated|midjourney|dall-?e|stable diffusion|music|musician|concert|dance|dancing|guitar|church|cathedral|temple|cross|crucifix|christmas|halloween|logo|trademark|text overlay|watermark|alcohol|wine|beer|bikini|swimsuit|selfie|model posing|prophet|angel|jesus|god|book|page|scan|map|diagram|chart|poster|screenshot|album|band|song|music video|trailer|mars|rover|martian|coffee|cup|mug|food|meal|car|cars|truck|street|traffic|buildings?|architecture|palace|castle|tower|skyscrapers?|skyline|cityscape|city|downtown|monument|louvre|room|interior|indoor|window sill|office|kitchen|restaurant|shop|store|bedroom|laptop|phone)\b/i;

/** Describing words in a search phrase: the picture must show the rest. */
const DESCRIBING = new Set(["a", "an", "the", "of", "in", "on", "at", "over", "with", "and", "by", "from", "through", "into", "after", "soft", "calm", "vast", "gentle", "still", "bright", "golden", "old", "green", "dark", "deep", "first", "ancient", "empty", "endless", "balanced", "abandoned", "rough", "bare", "clear", "open", "flowing", "sheltering", "symbol", "aerial", "breaking", "drifting", "reflecting", "spring", "stone"]);

/** @param {string} w */
const stem = (w) => w.toLowerCase().replace(/ies$/, "y").replace(/([^s])s$/, "$1");

/**
 * Does the title (and description) name what the phrase asks for? Every
 * word of the phrase that names a thing must be there (plural or not);
 * when the phrase is only describing words, one of them is enough.
 * @param {string} phrase @param {string} words
 */
export function relevant(phrase, words) {
  const have = new Set(words.toLowerCase().split(/[^a-z]+/).filter(Boolean).map(stem));
  const tokens = phrase.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const things = tokens.filter((t) => !DESCRIBING.has(t));
  if (!things.length) return tokens.some((t) => have.has(stem(t)));
  return things.every((t) => have.has(stem(t)));
}

/**
 * @typedef {import("./documentary-media-fetch.mjs").MediaResult} MediaResult
 * @typedef {import("./documentary-media-fetch.mjs").MediaProvider} MediaProvider
 * @typedef {{ id: string, why: string }} Rejection
 * @typedef {{ shot: string, ayah: string, start: number, end: number, status: "found" | "gap", kind: "video" | "image" | null, query: string | null, rung?: "own" | "family" | "nouns" | "landscape", asset: Asset | null, rejected: Rejection[], tried: string[] }} ShotMedia
 * @typedef {{ id: string, source: string, kind: "video" | "image", title: string, url: string, page: string, author: string | null, licence: string, licenceName: string, licenceUrl: string | null, attribution: boolean, width: number | null, height: number | null, seconds: number | null }} Asset
 */

/**
 * Why a candidate may not be used for this shot, or null when it may.
 * @param {MediaResult} r @param {{ seconds: number, level: import("./quran-director.mjs").AdabLevel, used: Set<string>, query?: string }} o
 * @param {{ verify?: (c: any) => Promise<boolean> | boolean, inspect?: (r: MediaResult, query?: string) => Promise<string | null> | string | null }} [checks]
 */
export async function rejectWhy(r, o, checks = {}) {
  if (o.used.has(r.id)) return "already used in this film (no asset twice)";
  const rights = classifyLicense(r);
  if (!rights.allowed) return "licence: " + rights.reason;
  const words = [r.title ?? "", /** @type {any} */ (r).tags?.join?.(" ") ?? "", /** @type {any} */ (r).description ?? ""].join(" ");
  // Relevance is judged on the title and description; categories only refuse (they name every place and date).
  const named = [r.title ?? "", /** @type {any} */ (r).description ?? ""].join(" ");
  const never = NEVER.exec(words);
  if (never) return `adab: "${never[0]}" in its title or tags`;
  if (!allowedAt(words, o.level)) return `adab: shows people or animals, not allowed at level ${o.level}`;
  if (o.query && !relevant(o.query, named)) return `relevance: the title does not name "${o.query}"`;
  if (!r.mediaUrl) return "no file to download";
  if (!(Number(r.width) >= MEDIA_RULES.minWidth)) return `quality: ${r.width ?? "unknown"} px wide, ${MEDIA_RULES.minWidth} needed`;
  if (r.mediaType === "video") {
    // A video must cover its whole shot (it may be slowed to two thirds of its speed, never held on a frame).
    const need = Math.round(Math.max(MEDIA_RULES.minVideoSeconds / 2, o.seconds / MEDIA_RULES.maxSlowdown) * 10) / 10;
    if (!(Number(r.durationSeconds) >= need)) return `quality: video is ${r.durationSeconds ?? "of unknown length"} s, ${need} s needed`;
  }
  if (rights.needsPageCheck) {
    const ok = checks.verify ? await checks.verify({ ...r, rights }) : false;
    if (!ok) return "licence: the item page could not confirm it is free of restrictions";
  }
  // The second net: a frame check (faces, people), where the machine has a detector.
  if (checks.inspect) { const seen = await checks.inspect(r, o.query); if (seen) return seen.includes(":") ? seen : "detector: " + seen; }
  return null;
}

/** @param {MediaResult} r @returns {Asset} */
function toAsset(r) {
  const rights = classifyLicense(r);
  return { id: r.id, source: r.source, kind: r.mediaType, title: r.title ?? "", url: /** @type {string} */ (r.mediaUrl), page: r.sourcePageUrl, author: r.creator ?? null, licence: rights.licenseId, licenceName: r.license ?? rights.reason, licenceUrl: r.licenseUrl ?? null, attribution: Boolean(r.attributionRequired) || rights.licenseId === "CC-BY" || rights.licenseId === "FREE-WITH-CREDIT", width: r.width ?? null, height: r.height ?? null, seconds: r.durationSeconds ?? null };
}

/**
 * Find media for every shot: each search phrase of the shot, video first
 * on every provider that has video, then images.
 * @param {{ shots: import("./quran-director.mjs").Shot[], providers: MediaProvider[], adab?: import("./quran-director.mjs").AdabLevel,
 *   verify?: (c: any) => Promise<boolean> | boolean, inspect?: (r: MediaResult, query?: string) => Promise<string | null> | string | null, signal?: AbortSignal, log?: (line: string) => void,
 *   exclude?: string[] }} o exclude: asset ids that may not be chosen (used elsewhere in the film, or refused by the reviewer)
 */
export async function findQuranMedia(o) {
  const level = o.adab ?? "strict";
  const providers = o.providers.filter((p) => QURAN_PROVIDERS.includes(p.id));
  const used = new Set(o.exclude ?? []);
  const signal = o.signal ?? new AbortController().signal;
  /** @type {Map<string, MediaResult[]>} */
  const cache = new Map();
  /** @param {MediaProvider} p @param {string} q @param {"video" | "image"} kind */
  const search = async (p, q, kind) => {
    const key = `${p.id}|${kind}|${q}`;
    if (!cache.has(key)) {
      try { cache.set(key, (await p.search(q, kind, signal)).slice(0, MEDIA_RULES.perQuery)); }
      catch (e) { o.log?.(`${p.id} "${q}" ${kind}: ${/** @type {Error} */ (e).message}`); cache.set(key, []); }
    }
    return /** @type {MediaResult[]} */ (cache.get(key));
  };
  /** @type {ShotMedia[]} */
  const out = [];
  for (const s of o.shots) {
    // The title is written over a real picture too: no shot of the film is an empty card.
    const seconds = s.end - s.start;
    /** @type {ShotMedia} */
    const sm = { shot: s.id, ayah: s.because.ayah, start: s.start, end: s.end, status: "gap", kind: null, query: null, asset: null, rejected: [], tried: [] };
    // The search ladder: the shot's own picture, its family, the plain nouns of both, then the wider
    // family of reverent landscapes. Each rung is recorded, so the reason for the picture stays honest.
    const ladder = searchLadder(s, level);
    /** @param {MediaProvider} p @param {"video" | "image"} kind @param {string} q */
    const variants = (p, kind, q) => (p.id === "wikimedia" && kind === "image" ? [`${q} incategory:Quality_images`, q] : [q]);
    search: for (const { q, rung } of ladder) {
      for (const kind of /** @type {const} */ (["video", "image"])) {
        for (const p of providers.filter((x) => x.kinds.includes(kind))) {
          for (const v of variants(p, kind, q)) {
            sm.tried.push(`${p.id}:${kind}:${v}`);
            for (const r of await search(p, v, kind)) {
              const why = await rejectWhy(r, { seconds, level, used, query: q }, { verify: o.verify, inspect: o.inspect });
              if (why) { if (sm.rejected.length < 60 && !sm.rejected.some((x) => x.id === r.id)) sm.rejected.push({ id: r.id, why }); continue; }
              used.add(r.id);
              Object.assign(sm, { status: "found", kind, query: q, rung, asset: toAsset(r) });
              break search;
            }
          }
        }
      }
    }
    out.push(sm);
  }
  const found = out.filter((x) => x.status === "found");
  const stats = { shots: out.length, found: found.length, video: found.filter((x) => x.kind === "video").length, image: found.filter((x) => x.kind === "image").length, gaps: out.length - found.length };
  return { shots: out, stats, manifest: mediaManifest(out), messages: [msg("quran.media", stats)] };
}

/** The asset manifest: each asset once, with origin, author, licence and where it is used. @param {ShotMedia[]} shots */
export function mediaManifest(shots) {
  /** @type {Map<string, Asset & { usedIn: { shot: string, ayah: string, start: number, end: number }[] }>} */
  const byId = new Map();
  for (const s of shots) {
    if (!s.asset) continue;
    const entry = byId.get(s.asset.id) ?? { ...s.asset, usedIn: [] };
    entry.usedIn.push({ shot: s.shot, ayah: s.ayah, start: s.start, end: s.end });
    byId.set(s.asset.id, entry);
  }
  return { assets: [...byId.values()], gaps: shots.filter((s) => s.status === "gap").map((s) => ({ shot: s.shot, ayah: s.ayah, tried: s.tried.length, rejected: summarize(s.rejected) })) };
}

/** The reasons a shot found nothing, counted. @param {Rejection[]} rejected */
function summarize(rejected) {
  /** @type {Record<string, number>} */
  const n = {};
  for (const r of rejected) { const k = r.why.split(":")[0]; n[k] = (n[k] ?? 0) + 1; }
  return n;
}

/**
 * Credits for the video description: the Quran text, the reciter's
 * recording, the translation if shown, the font, and every asset that
 * asks for (or deserves) a credit.
 * @param {ReturnType<typeof mediaManifest>} manifest @param {{ reciter?: string, translationShown?: boolean }} [o]
 */
export function creditsText(manifest, o = {}) {
  const lines = ["Quran text: Tanzil.net (Tanzil Quran Text, Uthmani 1.1, CC BY 3.0) - https://tanzil.net", "Arabic typeface: Amiri Quran (SIL Open Font License 1.1)"];
  if (o.reciter) lines.push(`Recitation: ${o.reciter}`);
  if (o.translationShown) lines.push("Translation of the meaning: M. M. Pickthall, The Meaning of the Glorious Koran (1930), public domain");
  lines.push("", "Footage and photographs:");
  for (const a of manifest.assets) lines.push(`- "${a.title || a.id}"${a.author ? ` by ${a.author}` : ""}, ${a.licenceName}${a.licenceUrl ? ` (${a.licenceUrl})` : ""}, ${a.page}`);
  return lines.join("\n");
}

/** The media plan as a table a person can check. @param {Awaited<ReturnType<typeof findQuranMedia>>} m */
export function mediaTable(m) {
  const lines = [`${m.stats.found} of ${m.stats.shots} shots have an asset (${m.stats.video} video, ${m.stats.image} photo); ${m.stats.gaps} gaps.`, "", "| Shot | Ayah | Asset | Licence | Why others were refused |", "|---|---|---|---|---|"];
  for (const s of m.shots) {
    const why = Object.entries(summarize(s.rejected)).map(([k, v]) => `${k} ${v}`).join(", ");
    lines.push(`| ${s.shot} | ${s.ayah} | ${s.asset ? `${s.kind}: [${s.asset.title.slice(0, 50)}](${s.asset.page})` : "gap"} | ${s.asset ? s.asset.licenceName : ""} | ${why} |`);
  }
  return lines.join("\n");
}
