/**
 * Review of a recitation film before it may be published, and its YouTube
 * packaging from templates (never from a model).
 *
 * Every scene (shot) is shown to a person with its picture, its reason and
 * its licence; each is approved, replaced (another asset or another search)
 * or rejected (a dark card). A film is ready to publish only when every
 * scene is approved, the render's own checks passed, and a named reviewer
 * signed that the Quran text, the ayah identification and the pictures are
 * religiously correct (rule 7). The decisions are kept with who and when.
 */
import { AYAH_COUNTS } from "./quran.mjs";
import { msg } from "./messages.mjs";

/**
 * @typedef {"pending" | "approved" | "replace" | "rejected"} SceneStatus
 * @typedef {{ shot: string, ayah: string, start: number, end: number, picture: string, because: string, asset: { id: string, title: string, page: string, licence: string } | null, status: SceneStatus, note: string }} ReviewScene
 * @typedef {{ at: string, by: string, shot: string | null, action: string, note: string }} ReviewDecision
 * @typedef {{ version: 1, scenes: ReviewScene[], decisions: ReviewDecision[], signoff: { by: string, at: string, statement: string, qualification: string, contact: string } | null }} Review
 */

/** What the reviewer signs. */
export const SIGNOFF_STATEMENT = "I checked the Quran text on screen against the mushaf, the surah and ayat, the order and timing, and every picture under the rules of this film (nothing depicting Allah, a prophet, an angel or the unseen; no faces at this level); it may be published.";

/**
 * The review sheet of a film: one row per shot, pending.
 * @param {{ shots: import("./quran-director.mjs").Shot[] }} direction @param {{ shots: { shot: string, asset: any }[] } | null} media
 * @param {Review | null} [previous] decisions already taken are kept for shots whose picture did not change
 * @returns {Review}
 */
export function reviewSheet(direction, media, previous = null) {
  const assetOf = new Map((media?.shots ?? []).map((s) => [s.shot, s.asset]));
  const old = new Map((previous?.scenes ?? []).map((s) => [s.shot, s]));
  const scenes = direction.shots.map((s) => {
    const a = assetOf.get(s.id) ?? null;
    const asset = a ? { id: a.id, title: a.title, page: a.page, licence: a.licenceName ?? a.licence } : null;
    const before = old.get(s.id);
    const same = before && (before.asset?.id ?? null) === (asset?.id ?? null) && before.start === s.start && before.end === s.end;
    return { shot: s.id, ayah: s.ayah === null ? "title" : `${s.surah}:${s.ayah}`, start: s.start, end: s.end, picture: s.motif, because: `${s.because.detail} (${s.because.source})`, asset, status: /** @type {SceneStatus} */ (same ? before.status : "pending"), note: same ? before.note : "" };
  });
  // A changed picture undoes the sign-off: it was signed for other pictures.
  const changed = previous ? scenes.some((s) => { const b = old.get(s.shot); return !b || (b.asset?.id ?? null) !== (s.asset?.id ?? null); }) : true;
  return { version: 1, scenes, decisions: previous?.decisions ?? [], signoff: changed ? null : previous?.signoff ?? null };
}

/**
 * Record one decision. `by` is required: no decision is anonymous.
 * @param {Review} review @param {{ shot?: string | null, action: "approve" | "replace" | "reject" | "approve-all" | "signoff", by: string, note?: string, at?: string,
 *   qualification?: string, contact?: string }} d the sign-off needs the reviewer's qualification (e.g. "hafiz, ijazah in Hafs") and a contact
 * @returns {{ ok: boolean, review: Review, message: any }}
 */
export function decide(review, d) {
  const by = String(d.by ?? "").trim();
  if (!by) return { ok: false, review, message: msg("quran.review.noName") };
  const at = d.at ?? new Date().toISOString();
  const next = { ...review, scenes: review.scenes.map((s) => ({ ...s })), decisions: [...review.decisions, { at, by, shot: d.shot ?? null, action: d.action, note: d.note ?? "" }] };
  if (d.action === "signoff") {
    const open = next.scenes.filter((s) => s.status !== "approved" && s.status !== "rejected");
    if (open.length) return { ok: false, review, message: msg("quran.review.open", { count: open.length, shots: open.slice(0, 5).map((s) => s.shot).join(", ") }) };
    // A religious sign-off is a real person's: their name, what qualifies them, and how to reach them.
    const qualification = String(d.qualification ?? "").trim(), contact = String(d.contact ?? "").trim();
    if (!qualification || !contact) return { ok: false, review, message: msg("quran.review.identity") };
    next.signoff = { by, at, statement: SIGNOFF_STATEMENT, qualification, contact };
    return { ok: true, review: next, message: msg("quran.review.signed", { by }) };
  }
  if (d.action === "approve-all") { for (const s of next.scenes) if (s.status === "pending") s.status = "approved"; return { ok: true, review: next, message: msg("quran.review.decided", { action: "approve", count: next.scenes.length }) }; }
  const scene = next.scenes.find((s) => s.shot === d.shot);
  if (!scene) return { ok: false, review, message: msg("quran.review.noScene", { shot: d.shot ?? "" }) };
  scene.status = d.action === "approve" ? "approved" : d.action === "replace" ? "replace" : "rejected";
  scene.note = d.note ?? "";
  // Any change of a scene after the sign-off undoes it.
  if (d.action !== "approve") next.signoff = null;
  return { ok: true, review: next, message: msg("quran.review.decided", { action: d.action, count: 1 }) };
}

/**
 * May the film be published? Every scene approved (or rejected, which
 * shows a card), none waiting for a replacement, the render's checks
 * passed, and a named reviewer's sign-off on the pictures as they are.
 * @param {Review | null} review @param {{ lengthMatches: boolean, black: any[], frozen: any[], cutsInsideTheVoice: number, integratedLufs: number | null, truePeakDbtp: number | null,
 *   cards?: { start: number, end: number }[], visual?: { ok: boolean, empty: { start: number, end: number }[], frozen: { start: number, end: number }[] },
 *   audio?: { ok: boolean, offsetSeconds: number, addedSilences: any[], clippedSamples: number } } | null} render
 */
export function readyToPublish(review, render) {
  /** @type {any[]} */
  const why = [];
  if (!review) why.push(msg("quran.review.none"));
  else {
    const waiting = review.scenes.filter((s) => s.status === "pending" || s.status === "replace");
    if (waiting.length) why.push(msg("quran.review.open", { count: waiting.length, shots: waiting.slice(0, 5).map((s) => s.shot).join(", ") }));
    if (!review.signoff?.by) why.push(msg("quran.review.unsigned"));
  }
  if (!render) why.push(msg("quran.review.notRendered"));
  else {
    if (!render.lengthMatches || render.black.length || render.frozen.length || render.cutsInsideTheVoice > 0) why.push(msg("quran.review.renderFailed"));
    // Every second must have a real picture: a placeholder card or an empty stretch blocks publishing.
    if (render.cards?.length) why.push(msg("quran.review.cards", { count: render.cards.length, at: render.cards.slice(0, 4).map((c) => `${Math.floor(c.start)}-${Math.ceil(c.end)} s`).join(", ") }));
    if (render.visual && !render.visual.ok) why.push(msg("quran.review.visual", { empty: render.visual.empty.length, frozen: render.visual.frozen.length, at: [...render.visual.empty, ...render.visual.frozen].slice(0, 4).map((c) => `${Math.floor(c.start)}-${Math.ceil(c.end)} s`).join(", ") }));
    if (!render.visual || !render.audio) why.push(msg("quran.review.noAudit"));
    if (render.audio && !render.audio.ok) why.push(msg("quran.review.audio", { offset: render.audio.offsetSeconds, silences: render.audio.addedSilences.length, clipped: render.audio.clippedSamples }));
    if (render.integratedLufs !== null && Math.abs(render.integratedLufs + 14) > 1) why.push(msg("quran.review.loudness", { lufs: render.integratedLufs }));
    if (render.truePeakDbtp !== null && render.truePeakDbtp > -1) why.push(msg("quran.review.peak", { peak: render.truePeakDbtp }));
  }
  return { ok: why.length === 0, by: review?.signoff?.by ?? null, why };
}

/** @param {number} t */
const stamp = (t) => { const s = Math.max(0, Math.floor(t)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(x).padStart(2, "0")}`; };

/**
 * YouTube packaging from templates: title, description, chapters from the
 * ayah times, credits, tags, and titles in the languages whose surah names
 * are on file. Nothing is written by a model; nothing is claimed that the
 * plan does not hold.
 * @param {{ plan: { scenes: { kind: string, surah: number, ayah: number | null, start: number }[] }, surahNames: { number?: number, arabic?: string, transliteration?: string, englishMeaning?: string, banglaMeaning?: string }[], reciter?: string, credits?: string, totalSeconds: number }} o
 */
export function packaging(o) {
  const ayat = o.plan.scenes.filter((s) => s.kind === "ayah" && s.ayah !== null);
  const surahs = [...new Set(ayat.map((s) => s.surah))];
  const name = (/** @type {number} */ n) => o.surahNames.find((x) => x.number === n) ?? o.surahNames[n - 1] ?? {};
  const range = surahs.map((s) => {
    const own = ayat.filter((a) => a.surah === s).map((a) => /** @type {number} */ (a.ayah));
    const from = Math.min(...own), to = Math.max(...own);
    return { surah: s, from, to, whole: from === 1 && to === AYAH_COUNTS[s - 1] };
  });
  const label = (/** @type {(typeof range)[number]} */ r, /** @type {"latin" | "arabic" | "bangla"} */ how) => {
    const n = name(r.surah);
    const ayahs = r.whole ? "" : how === "arabic" ? ` (${r.from}-${r.to})` : ` ${r.from}-${r.to}`;
    if (how === "arabic") return `سورة ${n.arabic ?? r.surah}${ayahs}`;
    if (how === "bangla") return `সূরা ${n.transliteration ?? r.surah}${n.banglaMeaning ? ` (${n.banglaMeaning})` : ""}${ayahs ? `, আয়াত${ayahs}` : ""}`;
    return `Surah ${n.transliteration ?? r.surah}${n.englishMeaning ? ` (${n.englishMeaning})` : ""}${ayahs ? `, Ayat${ayahs}` : ""}`;
  };
  const by = o.reciter ? ` | ${o.reciter}` : "";
  const title = `${range.map((r) => label(r, "arabic")).join(" · ")} | ${range.map((r) => label(r, "latin")).join(" · ")}${by}`.slice(0, 100);
  // Chapters: YouTube needs the first at 0:00, at least three, each at least 10 s.
  /** @type {{ at: number, text: string }[]} */
  let chapters = [];
  for (const s of ayat) {
    const text = `${name(s.surah).transliteration ?? s.surah} ${s.surah}:${s.ayah}`;
    if (!chapters.length) chapters.push({ at: 0, text });
    else if (s.start - chapters[chapters.length - 1].at >= 10) chapters.push({ at: s.start, text });
  }
  if (chapters.length < 3 || o.totalSeconds < 30) chapters = [];
  const description = [
    `${range.map((r) => label(r, "latin")).join(", ")}${o.reciter ? `, recited by ${o.reciter}` : ""}.`,
    "The recitation is the only sound. The Arabic on screen is the verified Tanzil text.",
    "",
    ...(chapters.length ? ["Chapters:", ...chapters.map((c) => `${stamp(c.at)} ${c.text}`), ""] : []),
    o.credits ?? "Quran text: Tanzil.net",
  ].join("\n");
  const tags = ["Quran", "Quran recitation", "تلاوة", "القرآن الكريم", ...range.flatMap((r) => [`Surah ${name(r.surah).transliteration ?? r.surah}`, `سورة ${name(r.surah).arabic ?? ""}`])].filter((t, i, a) => t.trim() && a.indexOf(t) === i);
  const localized = { ar: range.map((r) => label(r, "arabic")).join(" · ") + by, en: range.map((r) => label(r, "latin")).join(" · ") + by, bn: range.map((r) => label(r, "bangla")).join(" · ") + by };
  return { title, description, chapters, tags, localized, missingLanguages: ["ur", "id", "tr", "ms", "fa"], note: "Titles in Urdu, Indonesian, Turkish, Malay and Persian need surah-name lists with a recorded source; not filled in." };
}
