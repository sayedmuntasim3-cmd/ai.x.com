/**
 * The pure state of the "My films" shot swap (docs/missions/NEXT_TASKS.md, E1): the list a
 * person taps, the alternatives of one shot, and the swaps waiting to be sent. No React, no
 * fetch: the page's component only renders what these return, and local/shot-swap-ui.test.mjs
 * checks them without a browser.
 */

/** @typedef {{ id: string, source: string | null, licence: string | null, thumbnailUrl: string | null, mediaUrl: string | null, sourcePageUrl: string | null, title: string }} Candidate */

/** The licences a swap may bring in (the film media step's own list, engine/src/film-media.mjs). */
/** The archives' licence codes as the pack names them. */
const ARCHIVE_LICENCES = /** @type {Record<string, string>} */ ({ cc0: "CC0-1.0", "public-domain": "PUBLIC-DOMAIN", pdm: "PDM-1.0", "us-gov": "US-GOV-PD", "us-government": "US-GOV-PD", pixabay: "PIXABAY", pexels: "PEXELS", "us-gov-pd": "US-GOV-PD", "cc-by": "CC-BY" });
export const FREE_LICENCES = Object.freeze(["PEXELS", "PIXABAY", "CC0-1.0", "PDM-1.0", "PUBLIC-DOMAIN", "US-GOV-PD", "CC-BY"]);

/** Only https pictures and clips are shown or sent (a javascript: URL must never reach the page). @param {unknown} v */
export const httpUrl = (v) => (typeof v === "string" && /^https:\/\/[^\s"'<>]+$/.test(v) ? v : null);

/** @param {unknown} v @param {number} [max] */
const text = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/** "0:07" or "1:02:03", the time a shot begins. @param {unknown} seconds */
export function clock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/**
 * One search result from /api/media/search as a candidate the swap can send. A result with no
 * free licence is not offered at all (the film could never use it).
 * @param {any} r
 * @returns {Candidate | null}
 */
export function candidateFromSearch(r) {
  if (!r || typeof r !== "object") return null;
  const id = text(r.id, 200);
  if (!id) return null;
  const licenceRaw = r.licence ?? r.license ?? null;
  // The archives' own answer carries `license: { code: "cc0" | "public-domain" | ... }` (open-archives-lib); the
  // pack and the film use the upper-case names.
  const code = typeof licenceRaw === "string" ? licenceRaw : licenceRaw?.licenseId ?? licenceRaw?.code ?? licenceRaw?.name ?? "";
  const licence = text(ARCHIVE_LICENCES[String(code).toLowerCase()] ?? code, 60) || null;
  if (!licence || !FREE_LICENCES.includes(licence)) return null;
  const mediaUrl = httpUrl(r.mediaUrl) ?? httpUrl(r.fullUrl);
  const thumbnailUrl = httpUrl(r.previewUrl) ?? httpUrl(r.thumbnailUrl) ?? mediaUrl;
  if (!mediaUrl && !thumbnailUrl) return null;
  return {
    id,
    source: text(r.source ?? id.split(":")[0] ?? "", 40) || null,
    licence,
    thumbnailUrl,
    mediaUrl,
    sourcePageUrl: httpUrl(r.sourcePageUrl) ?? httpUrl(r.pageUrl),
    title: text(r.title ?? "", 140),
  };
}

/**
 * The shot list "My films" shows: time, the words heard over it, and its picture.
 * @param {any} pack
 * @returns {{ id: string, start: number, end: number, time: string, span: string, words: string, thumbnail: string | null, source: string | null, licence: string | null, candidates: number }[]}
 */
export function shotList(pack) {
  const shots = Array.isArray(pack?.shots) ? pack.shots : [];
  return shots.map((s) => {
    const start = Number(s.start) || 0;
    const end = Number(s.end) || start;
    return {
      id: text(s.id, 40),
      start,
      end,
      time: clock(start),
      span: `${Math.max(1, Math.round(end - start))}s`,
      words: text(s.words ?? "", 400),
      thumbnail: httpUrl(s.pick?.thumbnailUrl),
      source: text(s.pick?.source ?? "", 40) || null,
      licence: text(s.pick?.licence ?? "", 60) || null,
      candidates: Array.isArray(s.candidates) ? s.candidates.length : 0,
    };
  });
}

/** The shots whose words (or id) hold the typed words; an empty search keeps all of them. @param {ReturnType<typeof shotList>} shots @param {string} query */
export function filterShots(shots, query) {
  const q = text(query, 120).toLowerCase();
  if (!q) return shots;
  return shots.filter((s) => `${s.id} ${s.words}`.toLowerCase().includes(q));
}

/**
 * The six pictures of one shot: its pick first (marked `current`), the rest offered as swaps.
 * @param {any} pack @param {string} shotId
 * @returns {(Candidate & { current: boolean })[]}
 */
export function alternativesFor(pack, shotId) {
  const shot = (Array.isArray(pack?.shots) ? pack.shots : []).find((s) => s?.id === shotId);
  if (!shot) return [];
  const currentId = text(shot.pick?.id, 200);
  return (Array.isArray(shot.candidates) ? shot.candidates : [])
    .map((c) => {
      const licence = text(c?.licence ?? "", 60) || null;
      const mediaUrl = httpUrl(c?.mediaUrl);
      const thumbnailUrl = httpUrl(c?.thumbnailUrl) ?? mediaUrl;
      if (!c?.id || !licence || !FREE_LICENCES.includes(licence) || (!mediaUrl && !thumbnailUrl)) return null;
      return {
        id: text(c.id, 200),
        source: text(c.source ?? "", 40) || null,
        licence,
        thumbnailUrl,
        mediaUrl,
        sourcePageUrl: httpUrl(c.sourcePageUrl),
        title: text(c.title ?? "", 140),
        current: text(c.id, 200) === currentId,
      };
    })
    .filter(Boolean);
}

/**
 * Add or replace the swap of one shot (a person may change their mind before sending).
 * @param {{ shotId: string, candidate: Candidate }[]} swaps @param {string} shotId @param {Candidate} candidate
 */
export function setSwap(swaps, shotId, candidate) {
  const rest = (Array.isArray(swaps) ? swaps : []).filter((s) => s?.shotId !== shotId);
  return [...rest, { shotId, candidate }].sort((a, b) => (a.shotId < b.shotId ? -1 : 1));
}

/** Remove a shot's swap. @param {{ shotId: string }[]} swaps @param {string} shotId */
export function dropSwap(swaps, shotId) {
  return (Array.isArray(swaps) ? swaps : []).filter((s) => s?.shotId !== shotId);
}

/** The swap of one shot, or null. @param {{ shotId: string }[]} swaps @param {string} shotId */
export function swapOf(swaps, shotId) {
  return (Array.isArray(swaps) ? swaps : []).find((s) => s?.shotId === shotId) ?? null;
}

/**
 * What "Re-make film" will do, in the person's own terms: how many shots change, and how much of
 * the film is rendered again (the parts holding them, from the pack's own part map).
 * @param {any} pack @param {{ shotId: string }[]} swaps
 */
export function swapPlan(pack, swaps) {
  const count = Array.isArray(swaps) ? swaps.length : 0;
  const ids = new Set((Array.isArray(swaps) ? swaps : []).map((s) => s.shotId));
  const parts = (Array.isArray(pack?.parts) ? pack.parts : [])
    .filter((p) => Array.isArray(p?.shots) && p.shots.some((id) => ids.has(id)))
    .map((p) => Number(p.index) || 0)
    .filter((n) => n > 0);
  const total = Array.isArray(pack?.parts) ? pack.parts.length : 0;
  return {
    count,
    shots: [...ids],
    parts,
    total,
    text: count === 0 ? "" : count === 1 ? `1 shot changes · ${parts.length} of ${total} parts rendered again` : `${count} shots change · ${parts.length} of ${total} parts rendered again`,
  };
}

/**
 * Where a re-make stands, for the same stepper the first film used: queued or running while the
 * machine works, failed when it stopped, done when the new film is ready.
 * @param {{ status?: string, progress?: { stage: string, ok: boolean, message: { en: string } }[], swaps?: number } | null} view
 */
export function remakeState(view) {
  if (!view) return { kind: "none" };
  const last = Array.isArray(view.progress) ? view.progress.at(-1) : undefined;
  const swapped = (view.swaps ?? 0) > 0;
  if (view.status === "failed") return { kind: "failed", why: last?.message?.en ?? "", swapped };
  if (view.status === "done" || view.status === "awaiting-review") return { kind: "done", swapped };
  if (last?.stage === "swaps") return { kind: "remaking", stage: last.message?.en ?? "", swapped };
  return { kind: swapped ? "working" : "first-cut", stage: last?.message?.en ?? "", swapped };
}

/**
 * A pack as the page reads it. An unknown version is refused with words, never half-read.
 * @param {unknown} pack
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
export function packCheck(pack, version) {
  const p = /** @type {any} */ (pack);
  if (!p || typeof p !== "object") return { ok: false, error: "The film's edit pack could not be read." };
  if (p.version !== version) return { ok: false, error: "This film's edit pack was written by a newer studio. Open it again after the site updates." };
  if (!Array.isArray(p.shots) || !p.shots.length) return { ok: false, error: "This film has no shots to show yet." };
  return { ok: true };
}
