/**
 * The "edit pack" of a finished film (docs/missions/NEXT_TASKS.md, E1).
 *
 * When a film is finished the run already knows, for every shot, its time range,
 * the words heard over it, the clip it chose and the neighbours it refused. This
 * module turns that into one small JSON the studio keeps next to the film, so a
 * person can look at any shot, see six other free clips for it, and swap one.
 *
 * It also maps a swap back to the render: parts are whole runs of shots of about
 * equal length (render/render-film.mjs partRange), so a swapped shot touches the
 * one or two parts that hold it, and only those parts are rendered again.
 *
 * Pure ES module (no I/O, no network): the Worker, the runner and the studio's
 * page all read the same functions. Never a second copy of the licence rule:
 * FREE_LICENCES is the film media step's own list.
 */
import { FREE_LICENCES } from "./film-media.mjs";

/** The pack's own format number; a page that reads another number says so instead of guessing. */
export const EDIT_PACK_VERSION = 1;
/** The alternatives shown for one shot (the pick is the first of the list, so a shot has 6 in all). */
export const MAX_CANDIDATES = 6;
/** Swaps accepted in one re-make (a film is 40-120 shots; 40 is a whole chapter's worth of fixes). */
export const MAX_SWAPS = 40;
/** Largest pack the studio stores (a 40-minute film's 400 shots take about 300 KB). */
export const MAX_PACK_BYTES = 900 * 1024;
/** Parts a picture is rendered in (render-chunked.yml's default). */
export const DEFAULT_PARTS = 8;

/** @param {unknown} v */
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
/** Only https pictures and clips are linked (a javascript: URL must never reach a page). @param {unknown} v */
export const httpUrl = (v) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : null);
/** @param {unknown} v @param {number} [max] */
const text = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/**
 * One candidate as the studio shows it and the re-make renders it. Accepts the run's
 * pick record (media-C1.json: mediaUrl, previewUrl, licence object) and the ranker's
 * report row (rank-C1.json: id, title, previewUrl), because both describe one clip.
 * @param {any} raw
 * @param {string | null} [fallbackLicence] the shot's pick licence, when the row carries none
 * @returns {{ id: string, source: string | null, licence: string | null, thumbnailUrl: string | null, mediaUrl: string | null, sourcePageUrl: string | null, title: string, kind: string | null } | null}
 */
export function candidateOf(raw, fallbackLicence = null) {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id, 200);
  if (!id) return null;
  const licenceRaw = raw.licence ?? raw.license ?? null;
  const licenceId = typeof licenceRaw === "string" ? licenceRaw : licenceRaw?.licenseId ?? licenceRaw?.name ?? null;
  const licence = text(licenceId || fallbackLicence || "", 60) || null;
  return {
    id,
    source: text(raw.source ?? id.split(":")[0] ?? "", 40) || null,
    licence,
    thumbnailUrl: httpUrl(raw.previewUrl) ?? httpUrl(raw.thumbnailUrl) ?? httpUrl(raw.thumbnail) ?? null,
    mediaUrl: httpUrl(raw.mediaUrl) ?? httpUrl(raw.url) ?? null,
    sourcePageUrl: httpUrl(raw.sourcePageUrl) ?? null,
    title: text(raw.title ?? raw.description ?? "", 140),
    kind: text(raw.kind ?? "", 12) || null,
  };
}

/** A candidate the film may actually show: a clip or still with a free licence, and a picture to show it by. */
export function usableCandidate(/** @type {any} */ c) {
  return Boolean(c && c.id && c.licence && FREE_LICENCES.includes(c.licence) && (c.mediaUrl || c.thumbnailUrl));
}

/** The words spoken between two film times. @param {{ text: string, start: number, end: number }[]} words @param {number} start @param {number} end */
export function wordsIn(words, start, end) {
  if (!Array.isArray(words) || !Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) return "";
  return words
    .filter((/** @type {any} */ w) => w && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > start + 0.001 && w.start < end - 0.001)
    .map((/** @type {any} */ w) => String(w.text ?? ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The shot rows of a run, one per picture: media-C1.json's rows (times, pick, alternates) merged
 * with rank-C1.json's report (the words heard and the top candidates). Either file alone still
 * gives a pack (a film whose ranking step did not run keeps its picks).
 * @param {{ media?: any, rank?: any }} sources
 * @returns {{ scene: string, shot: number, start: number, end: number, pick: any, candidateRows: any[] }[]}
 */
export function shotRows(sources) {
  /** @type {Map<string, any>} */
  const rows = new Map();
  const key = (/** @type {any} */ scene, /** @type {any} */ shot) => `${String(scene ?? "")}#${Number(shot) || 0}`;
  const mediaShots = Array.isArray(sources.media?.shots) ? sources.media.shots : Array.isArray(sources.media) ? sources.media : [];
  for (const row of mediaShots) {
    if (!row || typeof row !== "object") continue;
    const scene = text(row.scene, 20);
    const shot = Number(row.shot) || 0;
    const start = num(row.start);
    const end = num(row.end);
    if (!scene || !Number.isFinite(start) || !Number.isFinite(end) || !( /** @type {number} */ (end) > /** @type {number} */ (start))) continue;
    rows.set(key(scene, shot), { scene, shot, start, end, pick: row.pick ?? null, candidateRows: [] });
  }
  const rankShots = Array.isArray(sources.rank?.shots) ? sources.rank.shots : [];
  for (const row of rankShots) {
    if (!row || typeof row !== "object") continue;
    const scene = text(row.scene, 20);
    const shot = Number(row.shot) || 0;
    const existing = rows.get(key(scene, shot));
    const start = num(row.start) ?? existing?.start ?? null;
    const end = num(row.end) ?? existing?.end ?? null;
    if (!scene || !Number.isFinite(start)) continue;
    const target = existing ?? { scene, shot, start, end: Number.isFinite(end) ? end : start, pick: null, candidateRows: [] };
    target.start = Number.isFinite(start) ? start : target.start;
    if (Number.isFinite(end) && end > target.start) target.end = end;
    target.candidateRows = Array.isArray(row.top) ? row.top : [];
    if (row.after) target.pickId = text(row.after, 200);
    if (row.sentence) target.sentence = text(row.sentence, 600);
    rows.set(key(scene, shot), target);
  }
  return [...rows.values()].filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start).sort((a, b) => a.start - b.start || a.shot - b.shot);
}

/**
 * The six candidates of one shot: its pick first (when it has one), then the ranker's
 * best others, then the media step's alternates by id. Only free-licence, linkable
 * candidates are kept; the pick's licence is the fallback for a row that names none.
 * @param {{ pick: any, candidateRows: any[], pickId?: string | null, alternates?: string[] }} row
 */
export function candidatesFor(row) {
  const pick = candidateOf(row.pick, null);
  const pickLicence = pick?.licence ?? null;
  const out = /** @type {any[]} */ ([]);
  const seen = new Set();
  const add = (/** @type {any} */ c) => {
    if (!c || seen.has(c.id) || !usableCandidate(c)) return;
    seen.add(c.id);
    out.push(c);
  };
  if (pick) add({ ...pick, licence: pickLicence ?? pick.licence });
  for (const raw of Array.isArray(row.candidateRows) ? row.candidateRows : []) {
    // The ranker's row carries the scores, not the licence: the shot's pick licence is the film's own licence class.
    add(candidateOf(raw, pickLicence));
    if (out.length >= MAX_CANDIDATES) break;
  }
  for (const alt of Array.isArray(row.alternates) ? row.alternates : []) {
    const id = text(alt, 200);
    if (!id) continue;
    add({ id, source: id.split(":")[0] ?? null, licence: pickLicence, thumbnailUrl: null, mediaUrl: null, sourcePageUrl: null, title: "", kind: null });
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out.slice(0, MAX_CANDIDATES);
}

/**
 * The parts of a chunked render, as shots (render/render-film.mjs partRange, by frames): part k
 * starts at the first shot whose start reaches k/count of the film. A part with no shot is kept
 * (the renderer writes only its report and the join skips it).
 * @param {{ id: string, start: number, end: number }[]} shots @param {number} count @param {number} [fps]
 * @returns {{ index: number, start: number, end: number, shots: string[] }[]}
 */
export function packParts(shots, count, fps = 30) {
  const n = Math.max(1, Math.min(16, Math.round(count) || DEFAULT_PARTS));
  const frameAt = (/** @type {number} */ t) => Math.round(t * fps);
  const frames = shots.map((s) => Math.max(0, frameAt(s.end) - frameAt(s.start)));
  const total = frames.reduce((a, b) => a + b, 0);
  /** @param {number} k */
  const startOf = (k) => {
    if (k <= 0) return 0;
    if (k >= n) return shots.length;
    if (total <= 0) return Math.min(shots.length, Math.round((shots.length * k) / n));
    let seen = 0;
    for (let i = 0; i < shots.length; i += 1) {
      if (seen >= (total * k) / n) return i;
      seen += frames[i];
    }
    return shots.length;
  };
  const out = /** @type {any[]} */ ([]);
  for (let k = 0; k < n; k += 1) {
    const from = startOf(k);
    const to = Math.max(from, startOf(k + 1));
    const held = shots.slice(from, to);
    out.push({ index: k + 1, start: held[0]?.start ?? 0, end: held.at(-1)?.end ?? held[0]?.start ?? 0, shots: held.map((s) => s.id) });
  }
  return out;
}

/**
 * The edit pack: the film's script, every shot with its time, words, pick and six
 * candidates, and which part of the render holds each shot.
 * @param {{ filmId?: string, seconds?: number | null, fps?: number, parts?: number, createdAt?: string, chapters?: { id?: string, title?: string, markdown: string }[], shots?: { id?: string, scene?: string, shot?: number, start: number, end: number, text?: string }[], media?: any, rank?: any, words?: { text: string, start: number, end: number }[], score?: string | null }} o
 */
export function buildEditPack(o) {
  const fps = Math.max(1, Math.round(o.fps ?? 30));
  const rows = shotRows({ media: o.media, rank: o.rank });
  // A run that only has the shot plan (no media rows yet) still gets a list of shots to look at.
  const planned = Array.isArray(o.shots) ? o.shots : [];
  /** @type {Map<string, any>} */
  const byKey = new Map(rows.map((r) => [`${r.scene}#${r.shot}`, r]));
  for (const s of planned) {
    if (!s || !Number.isFinite(Number(s.start)) || !Number.isFinite(Number(s.end))) continue;
    const scene = text(s.scene ?? String(s.id ?? "").split("-")[0], 20);
    const shot = Number(s.shot ?? String(s.id ?? "").split("-").pop()) || 0;
    const k = `${scene}#${shot}`;
    if (!byKey.has(k)) byKey.set(k, { scene, shot, start: Number(s.start), end: Number(s.end), pick: null, candidateRows: [], sentence: s.text });
  }
  const shots = [...byKey.values()]
    .sort((a, b) => a.start - b.start || a.shot - b.shot)
    .map((r) => {
      const id = `${r.scene}-${r.shot || 1}`;
      const candidates = candidatesFor({ ...r, alternates: [] });
      // The pick is the picture the film actually uses; a shot the media step could not fill keeps
      // none (the page says so) even though its best candidates are offered as swaps.
      const pick = r.pick ? candidateOf(r.pick, null) : null;
      return {
        id,
        scene: r.scene,
        index: r.shot || 1,
        start: Math.round(r.start * 1000) / 1000,
        end: Math.round(r.end * 1000) / 1000,
        words: wordsIn(o.words ?? [], r.start, r.end) || text(r.sentence ?? "", 600),
        pick: pick && usableCandidate(pick) ? pick : null,
        candidates: candidates.length ? candidates : pick ? [pick] : [],
      };
    });
  const chapters = (Array.isArray(o.chapters) ? o.chapters : [])
    .filter((c) => c && typeof c.markdown === "string" && c.markdown.trim())
    .slice(0, 40)
    .map((c) => ({ id: text(c.id, 20), title: text(c.title ?? "", 160), markdown: c.markdown.slice(0, 40000) }));
  // The timed words travel with the pack: the re-make needs them for the captions, and the page asks
  // for the lean copy (leanPack) so a phone never downloads them.
  const timed = (Array.isArray(o.words) ? o.words : [])
    .filter((w) => w && typeof w.text === "string" && Number.isFinite(Number(w.start)) && Number.isFinite(Number(w.end)))
    .slice(0, 20000)
    .map((w) => ({ text: String(w.text).slice(0, 60), start: Math.round(Number(w.start) * 1000) / 1000, end: Math.round(Number(w.end) * 1000) / 1000 }));
  return {
    version: EDIT_PACK_VERSION,
    filmId: text(o.filmId ?? "", 40) || null,
    createdAt: text(o.createdAt ?? new Date().toISOString(), 40),
    seconds: Number.isFinite(Number(o.seconds)) ? Math.round(Number(o.seconds) * 10) / 10 : shots.at(-1)?.end ?? null,
    fps,
    script: chapters,
    score: typeof o.score === "string" && o.score.trim() ? o.score.slice(0, 40000) : null,
    words: timed,
    shots,
    parts: packParts(shots, o.parts ?? DEFAULT_PARTS, fps),
  };
}

/**
 * The pack as the studio's page reads it: the list of shots and their alternatives, without the film's
 * own words, script and score (the re-make needs those; a phone showing thumbnails does not).
 * @param {any} pack
 */
export function leanPack(pack) {
  const { words, script, score, ...rest } = pack ?? {};
  return { ...rest, lean: true, counts: { words: Array.isArray(words) ? words.length : 0, chapters: Array.isArray(script) ? script.length : 0 } };
}

/** The shot a swap names, or null. @param {any} pack @param {string} shotId */
export function shotOf(pack, shotId) {
  const id = text(shotId, 40);
  return (Array.isArray(pack?.shots) ? pack.shots : []).find((/** @type {any} */ s) => s?.id === id) ?? null;
}

/** The part of the render holding a shot, or 0 when the pack has no parts. @param {any} pack @param {string} shotId */
export function partOfShot(pack, shotId) {
  const part = (Array.isArray(pack?.parts) ? pack.parts : []).find((/** @type {any} */ p) => Array.isArray(p?.shots) && p.shots.includes(shotId));
  return part ? Number(part.index) || 0 : 0;
}

/**
 * The parts that must be rendered again for these swaps, in order, and the parts that are kept
 * (the rest of the film's picture is reused as it is). A shot with no part (a pack written
 * without parts) makes every part changed: nothing is guessed.
 * @param {any} pack @param {{ shotId: string }[]} swaps
 * @returns {{ changed: number[], kept: number[], all: boolean }}
 */
export function changedParts(pack, swaps) {
  const allParts = (Array.isArray(pack?.parts) ? pack.parts : []).map((/** @type {any} */ p) => Number(p?.index) || 0).filter((/** @type {any} */ n) => n > 0);
  const wanted = new Set();
  let unknown = allParts.length === 0;
  for (const swap of Array.isArray(swaps) ? swaps : []) {
    const shot = shotOf(pack, swap?.shotId);
    const part = shot ? partOfShot(pack, shot.id) : 0;
    if (part) wanted.add(part);
    else unknown = true;
  }
  const changed = unknown ? [...allParts] : allParts.filter((/** @type {any} */ n) => wanted.has(n));
  return { changed, kept: allParts.filter((/** @type {any} */ n) => !wanted.has(n)), all: unknown };
}

/**
 * Check the swaps a creator sent against the pack this film saved: a known shot, a free-licence
 * candidate, no shot twice. `candidate` may be the whole candidate (a search result the person
 * picked) or `candidateId` naming one of the shot's six.
 * @param {any} body @param {any} pack
 * @returns {{ ok: true, value: { swaps: { shotId: string, pick: any }[] } } | { ok: false, error: string }}
 */
export function checkSwaps(body, pack) {
  if (!pack || !Array.isArray(pack.shots) || !pack.shots.length) return { ok: false, error: "This film has no edit pack yet; it is written when the film finishes." };
  const list = Array.isArray(body?.swaps) ? body.swaps : null;
  if (!list) return { ok: false, error: "Send swaps: [{ shotId, candidate }]." };
  if (!list.length) return { ok: false, error: "Choose at least one new picture." };
  if (list.length > MAX_SWAPS) return { ok: false, error: `At most ${MAX_SWAPS} shots can be swapped in one re-make.` };
  /** @type {{ shotId: string, pick: any }[]} */
  const swaps = [];
  const seen = new Set();
  for (const raw of list) {
    const shotId = text(raw?.shotId, 40);
    const shot = shotOf(pack, shotId);
    if (!shot) return { ok: false, error: `Unknown shot “${shotId || "?"}”: this film has no such shot.` };
    if (seen.has(shot.id)) return { ok: false, error: `Shot ${shot.id} is swapped twice; send it once.` };
    seen.add(shot.id);
    let pick = null;
    if (raw?.candidateId) {
      const fromList = (Array.isArray(shot.candidates) ? shot.candidates : []).find((/** @type {any} */ c) => c?.id === text(raw.candidateId, 200));
      if (!fromList) return { ok: false, error: `“${text(raw.candidateId, 80)}” is not one of ${shot.id}'s alternatives.` };
      pick = candidateOf(fromList, shot.pick?.licence ?? null);
    } else {
      pick = candidateOf(raw?.candidate ?? raw?.pick ?? null, shot.pick?.licence ?? null);
    }
    if (!pick) return { ok: false, error: `Shot ${shot.id} needs a picture.` };
    if (!pick.licence || !FREE_LICENCES.includes(pick.licence)) return { ok: false, error: `Only free-licence pictures can go in a film (${FREE_LICENCES.join(", ")}); “${pick.id}” has none.` };
    if (!pick.mediaUrl) return { ok: false, error: `“${pick.id}” has no clip address to render.` };
    swaps.push({ shotId: shot.id, pick });
  }
  return { ok: true, value: { swaps } };
}

/**
 * The pack with the swaps applied: the shot's pick is the new picture, it heads its candidate list,
 * and the old pick stays offered (a person may change their mind). Everything else is kept.
 * @param {any} pack @param {{ shotId: string, pick: any }[]} swaps @param {string} [at]
 */
export function applySwaps(pack, swaps, at = new Date().toISOString()) {
  const taken = new Map((Array.isArray(swaps) ? swaps : []).map((s) => [s.shotId, s.pick]));
  return {
    ...pack,
    swappedAt: text(at, 40),
    shots: (Array.isArray(pack?.shots) ? pack.shots : []).map((/** @type {any} */ shot) => {
      const pick = taken.get(shot?.id);
      if (!pick) return shot;
      const others = (Array.isArray(shot.candidates) ? shot.candidates : []).filter((/** @type {any} */ c) => c?.id && c.id !== pick.id);
      return { ...shot, pick, swapped: true, candidates: [pick, ...others].slice(0, MAX_CANDIDATES) };
    }),
  };
}

/**
 * The media-C1.json rows of a re-make: the pack's own picks, with their times, so the renderer
 * builds the same timeline with the new pictures in it.
 * @param {any} pack
 */
export function mediaFromPack(pack) {
  const shots = (Array.isArray(pack?.shots) ? pack.shots : []).map((/** @type {any} */ s) => ({
    scene: s.scene,
    shot: s.index,
    start: s.start,
    end: s.end,
    rung: null,
    description: "",
    queries: [],
    status: s.pick ? "found" : "missing",
    query: null,
    pick: s.pick
      ? {
          id: s.pick.id,
          source: s.pick.source,
          kind: s.pick.kind ?? undefined,
          mediaUrl: s.pick.mediaUrl,
          previewUrl: s.pick.thumbnailUrl,
          sourcePageUrl: s.pick.sourcePageUrl,
          licence: { licenseId: s.pick.licence, name: s.pick.licence, licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: s.pick.sourcePageUrl },
        }
      : null,
    alternates: [],
    trace: [],
  }));
  return { chapter: "C1", providers: [], repeatWindowSeconds: 600, stats: { shots: shots.length, found: shots.filter((/** @type {any} */ s) => s.pick).length, missing: shots.filter((/** @type {any} */ s) => !s.pick).length, noQuery: 0 }, shots };
}

/**
 * Whether a pack the runner sends may be stored: it is the studio's own data, but a broken
 * pack would break a page, so the shape and the size are checked here, once.
 * @param {unknown} raw @param {number} [bytes]
 */
export function checkEditPack(raw, bytes = 0) {
  const pack = /** @type {any} */ (raw);
  if (bytes > MAX_PACK_BYTES) return { ok: false, error: `The edit pack is ${Math.round(bytes / 1024)} KB; the limit is ${Math.round(MAX_PACK_BYTES / 1024)} KB.` };
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) return { ok: false, error: "The edit pack must be a JSON object." };
  if (pack.version !== EDIT_PACK_VERSION) return { ok: false, error: `The edit pack's version must be ${EDIT_PACK_VERSION}.` };
  if (!Array.isArray(pack.shots) || !pack.shots.length) return { ok: false, error: "The edit pack has no shots." };
  if (pack.shots.length > 4000) return { ok: false, error: "The edit pack has too many shots." };
  for (const [i, shot] of pack.shots.entries()) {
    if (!shot || typeof shot.id !== "string" || !shot.id) return { ok: false, error: `Shot ${i + 1} has no id.` };
    if (!Number.isFinite(Number(shot.start)) || !Number.isFinite(Number(shot.end)) || !(Number(shot.end) > Number(shot.start))) return { ok: false, error: `Shot ${shot.id} has no sensible time range.` };
  }
  const script = Array.isArray(pack.script) ? pack.script : [];
  if (script.some((/** @type {any} */ c) => !c || typeof c.markdown !== "string")) return { ok: false, error: "Every chapter of the edit pack needs its words (markdown)." };
  if (!Array.isArray(pack.parts) || !pack.parts.length) return { ok: false, error: "The edit pack needs its render parts." };
  return { ok: true, value: pack };
}
