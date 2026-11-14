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
 * @typedef {{ shot: string, ayah: string, start: number, end: number, picture: string, because: string, asset: { id: string, title: string, page: string, licence: string } | null, status: SceneStatus, note: string, check?: "PASS" | "WARNING", doubts?: string[] }} ReviewScene
 * @typedef {{ at: string, by: string, shot: string | null, action: string, note: string }} ReviewDecision
 * @typedef {{ reciter: string, source: string, permission: string, by: string, at: string }} RecordingRights who recites, where the recording comes from, and the permission to publish it (commercial use included)
 * @typedef {{ version: 1, scenes: ReviewScene[], decisions: ReviewDecision[], signoff: { by: string, at: string, statement: string, qualification: string, contact: string } | null, recording?: RecordingRights | null }} Review
 */

/** What the reviewer signs. */
export const SIGNOFF_STATEMENT = "I checked the Quran text on screen against the mushaf, the surah and ayat, the order and timing, and every picture under the rules of this film (nothing depicting Allah, a prophet, an angel or the unseen; no faces at this level); it may be published.";

/**
 * The review sheet of a film: one row per shot, pending.
 * @param {{ shots: import("./quran-director.mjs").Shot[] }} direction @param {{ shots: { shot: string, asset: any, check?: "PASS" | "WARNING", doubts?: string[] }[] } | null} media
 * @param {Review | null} [previous] decisions already taken are kept for shots whose picture did not change
 * @returns {Review}
 */
export function reviewSheet(direction, media, previous = null) {
  const assetOf = new Map((media?.shots ?? []).map((s) => [s.shot, s.asset]));
  const mediaOf = new Map((media?.shots ?? []).map((s) => [s.shot, s]));
  const old = new Map((previous?.scenes ?? []).map((s) => [s.shot, s]));
  const scenes = direction.shots.map((s) => {
    const a = assetOf.get(s.id) ?? null;
    const asset = a ? { id: a.id, title: a.title, page: a.page, licence: a.licenceName ?? a.licence } : null;
    const before = old.get(s.id);
    const same = before && (before.asset?.id ?? null) === (asset?.id ?? null) && before.start === s.start && before.end === s.end;
    return { shot: s.id, ayah: s.ayah === null ? "title" : `${s.surah}:${s.ayah}`, start: s.start, end: s.end, picture: s.motif, because: `${s.because.detail} (${s.because.source})`, asset, status: /** @type {SceneStatus} */ (same ? before.status : "pending"), note: same ? before.note : "",
      ...(mediaOf.get(s.id)?.check ? { check: mediaOf.get(s.id)?.check, doubts: mediaOf.get(s.id)?.doubts ?? [] } : {}) };
  });
  // A changed picture undoes the sign-off: it was signed for other pictures.
  const changed = previous ? scenes.some((s) => { const b = old.get(s.shot); return !b || (b.asset?.id ?? null) !== (s.asset?.id ?? null); }) : true;
  return { version: 1, scenes, decisions: previous?.decisions ?? [], signoff: changed ? null : previous?.signoff ?? null, recording: previous?.recording ?? null };
}

/**
 * Record one decision. `by` is required: no decision is anonymous.
 * @param {Review} review @param {{ shot?: string | null, action: "approve" | "replace" | "reject" | "approve-all" | "signoff" | "rights", by: string, note?: string, at?: string,
 *   qualification?: string, contact?: string, reciter?: string, source?: string, permission?: string }} d the sign-off needs the reviewer's qualification (e.g. "hafiz, ijazah in Hafs") and a contact
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
  if (d.action === "rights") {
    // The recording itself: who recites, where it comes from, and the permission to publish it. All three, written down.
    const reciter = String(d.reciter ?? "").trim(), source = String(d.source ?? "").trim(), permission = String(d.permission ?? "").trim();
    if (!reciter || !source || !permission) return { ok: false, review, message: msg("quran.review.rightsMissing") };
    next.recording = { reciter, source, permission, by, at };
    return { ok: true, review: next, message: msg("quran.review.rights", { reciter }) };
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
 * May the film be published? Three answers, as a production review gives them:
 * FAIL a critical problem (the render's checks, an empty or placeholder
 * second, the sound, verse timing not verified): publishing is blocked;
 * WARNING nothing critical, but a person must still look, listen or sign
 * (open scenes, doubtful pictures, unconfirmed ayah ends, no sign-off);
 * PASS every automatic check passed and every human step is done.
 * A finished render alone is never PASS.
 * @param {Review | null} review @param {{ lengthMatches: boolean, black: any[], frozen: any[], cutsInsideTheVoice: number, integratedLufs: number | null, truePeakDbtp: number | null,
 *   cards?: { start: number, end: number }[], visual?: { ok: boolean, empty: { start: number, end: number }[], frozen: { start: number, end: number }[] },
 *   audio?: { ok: boolean, offsetSeconds: number, addedSilences: any[], clippedSamples: number } } | null} render
 * @param {{ ayat: { sure?: boolean }[] } | null} [location] the ayah timing (quran-location.json)
 * @returns {{ ok: boolean, status: "PASS" | "WARNING" | "FAIL", by: string | null, why: any[], fail: any[], warn: any[] }}
 */
export function readyToPublish(review, render, location = null) {
  /** @type {any[]} */
  const fail = [];
  /** @type {any[]} */
  const warn = [];
  if (!review) warn.push(msg("quran.review.none"));
  else {
    const waiting = review.scenes.filter((s) => s.status === "pending" || s.status === "replace");
    if (waiting.length) warn.push(msg("quran.review.open", { count: waiting.length, shots: waiting.slice(0, 5).map((s) => s.shot).join(", ") }));
    const flagged = review.scenes.filter((s) => s.check === "WARNING" && s.status !== "approved" && s.status !== "rejected");
    if (flagged.length) warn.push(msg("quran.review.flagged", { count: flagged.length, shots: flagged.slice(0, 5).map((s) => `${s.shot} (${(s.doubts ?? []).join("; ")})`).join(", ") }));
    if (!review.signoff?.by) warn.push(msg("quran.review.unsigned"));
    if (!review.recording) warn.push(msg("quran.review.noRights"));
  }
  if (location?.ayat?.length) {
    // The ends between ayat; the last one is the end of the voice.
    const ends = location.ayat.slice(0, -1);
    const sure = ends.filter((a) => a.sure).length;
    if (ends.length && sure * 2 < ends.length) fail.push(msg("quran.review.timing", { sure, total: ends.length }));
    else if (sure < ends.length) warn.push(msg("quran.review.timingPartly", { sure, total: ends.length }));
  }
  if (!render) fail.push(msg("quran.review.notRendered"));
  else {
    if (!render.lengthMatches || render.black.length || render.frozen.length || render.cutsInsideTheVoice > 0) fail.push(msg("quran.review.renderFailed"));
    // Every second must have a real picture: a placeholder card or an empty stretch blocks publishing.
    if (render.cards?.length) fail.push(msg("quran.review.cards", { count: render.cards.length, at: render.cards.slice(0, 4).map((c) => `${Math.floor(c.start)}-${Math.ceil(c.end)} s`).join(", ") }));
    if (render.visual && !render.visual.ok) fail.push(msg("quran.review.visual", { empty: render.visual.empty.length, frozen: render.visual.frozen.length, at: [...render.visual.empty, ...render.visual.frozen].slice(0, 4).map((c) => `${Math.floor(c.start)}-${Math.ceil(c.end)} s`).join(", ") }));
    if (!render.visual || !render.audio) fail.push(msg("quran.review.noAudit"));
    if (render.audio && !render.audio.ok) fail.push(msg("quran.review.audio", { offset: render.audio.offsetSeconds, silences: render.audio.addedSilences.length, clipped: render.audio.clippedSamples }));
    if (render.integratedLufs !== null && Math.abs(render.integratedLufs + 14) > 1) fail.push(msg("quran.review.loudness", { lufs: render.integratedLufs }));
    if (render.truePeakDbtp !== null && render.truePeakDbtp > -1) fail.push(msg("quran.review.peak", { peak: render.truePeakDbtp }));
  }
  const status = fail.length ? "FAIL" : warn.length ? "WARNING" : "PASS";
  return { ok: status === "PASS", status, by: review?.signoff?.by ?? null, why: [...fail, ...warn], fail, warn };
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

/**
 * The ayah as recited: Tanzil writes the basmala before ayah 1 of every surah
 * but al-Fatiha and at-Tawba; it is not part of that ayah (the renderer does the same).
 * @param {string} text @param {number} surah @param {number} ayah
 */
export function withoutOpeningBasmala(text, surah, ayah) {
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.split(/\s+/);
  const bare = words.slice(0, 4).join(" ").replace(/[\u064B-\u0670\u065F\u06D6-\u06ED]/g, "").replace(/\u0671/g, "\u0627");
  return bare === "بسم الله الرحمن الرحيم" ? words.slice(4).join(" ") : text;
}

/** @param {unknown} x */
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

/**
 * The review page: one self-contained HTML file a scholar and an editor can
 * open without the studio. Each scene shows the real frame from the rendered
 * film, what is recited (the Arabic, and the meaning for the reviewer only),
 * the picture with its source and licence, why it was chosen, what the
 * automatic checks said, what was refused and why, and the commands to decide.
 * @param {{ run: string, review: Review, verdicts: { format: string, status: string, fail: any[], warn: any[] }[],
 *   media: { shots: { shot: string, check?: string, doubts?: string[], rejected?: { id: string, why: string }[] }[] } | null,
 *   meaning: { ayat: { surah: number, ayah: number, uthmani: string, translation?: { text: string } | null }[] } | null,
 *   location: { ayat: { surah: number, ayah: number, sure?: boolean }[] } | null,
 *   frames: Record<string, string>, lang?: "en" | "bn" }} o frames: shot id → image path relative to the page
 * @returns {string}
 */
export function reviewPage(o) {
  const lang = o.lang ?? "en";
  const L = (/** @type {string} */ k) => esc(msg(`quran.page.${k}`)[lang]);
  const said = (/** @type {any} */ m) => esc(m[lang]);
  const mediaOf = new Map((o.media?.shots ?? []).map((s) => [s.shot, s]));
  const ayahOf = new Map((o.meaning?.ayat ?? []).map((a) => [`${a.surah}:${a.ayah}`, a]));
  const sureOf = new Map((o.location?.ayat ?? []).map((a, i, all) => [`${a.surah}:${a.ayah}`, i === all.length - 1 || a.sure !== false]));
  const worst = o.verdicts.find((v) => v.status === "FAIL") ?? o.verdicts.find((v) => v.status === "WARNING") ?? o.verdicts[0];
  const badge = (/** @type {string} */ s) => `<span class="b ${esc(s)}">${esc(s)}</span>`;
  const cmd = (/** @type {string} */ args) => `<code>node local/quran-review.mjs --run ${esc(o.run)} ${esc(args)}</code>`;
  const r = o.review;
  const head = `<section class="sum"><h2>${L("decision")}: ${badge(worst?.status ?? "FAIL")}</h2>${o.verdicts.map((v) => `<p><b>${esc(v.format)}</b> ${badge(v.status)}</p><ul>${v.fail.map((m) => `<li class="FAIL">${said(m)}</li>`).join("")}${v.warn.map((m) => `<li class="WARNING">${said(m)}</li>`).join("")}</ul>`).join("")}
<p><b>${L("recording")}:</b> ${r.recording ? `${esc(r.recording.reciter)}; ${esc(r.recording.source)}; ${esc(r.recording.permission)} (${esc(r.recording.by)}, ${esc(r.recording.at)})` : `<span class="WARNING">${L("none")}</span> ${cmd('--rights --by "Name" --reciter "..." --source "..." --permission "..."')}`}</p>
<p><b>${L("signoff")}:</b> ${r.signoff ? `${esc(r.signoff.by)} (${esc(r.signoff.qualification)}; ${esc(r.signoff.contact)}) ${esc(r.signoff.at)}` : `<span class="WARNING">${L("none")}</span> ${cmd('--signoff --by "Name" --qualification "..." --contact "..."')}`}</p></section>`;
  const rows = r.scenes.map((s) => {
    const m = mediaOf.get(s.shot);
    const a = ayahOf.get(s.ayah);
    const text = a ? esc(withoutOpeningBasmala(a.uthmani, a.surah, a.ayah)) : "";
    const refused = (m?.rejected ?? []).slice(0, 8).map((x) => `<li>${esc(x.id)}: ${esc(x.why)}</li>`).join("");
    const check = s.check ?? m?.check ?? "";
    return `<article id="${esc(s.shot)}"><div class="f">${o.frames[s.shot] ? `<img src="${esc(o.frames[s.shot])}" alt="${esc(s.shot)}" loading="lazy">` : `<p class="WARNING">${L("noFrame")}</p>`}</div>
<div class="t"><h3>${esc(s.shot)} · ${esc(s.ayah)} · ${s.start.toFixed(1)}-${s.end.toFixed(1)} s ${check ? badge(check) : ""}</h3>
${text ? `<p><b>${L("said")}:</b></p><p class="ar" dir="rtl" lang="ar">${text}</p>${sureOf.get(s.ayah) === false ? `<p class="WARNING">${L("unsure")}</p>` : ""}` : ""}
${a?.translation?.text ? `<p class="mn"><b>${L("meaning")}:</b> ${esc(a.translation.text)}</p>` : ""}
<p><b>${L("picture")}:</b> ${s.asset ? `<a href="${esc(s.asset.page)}">${esc(s.asset.title)}</a> (${esc(s.asset.licence)})` : `<span class="FAIL">card</span>`}</p>
<p><b>${L("why")}:</b> ${esc(s.picture)} - ${esc(s.because)}</p>
${s.doubts?.length ? `<p class="WARNING"><b>${L("check")}:</b> ${esc(s.doubts.join("; "))}</p>` : ""}
${refused ? `<details><summary>${L("refused")} (${m?.rejected?.length ?? 0})</summary><ul>${refused}</ul></details>` : ""}
<p><b>${L("status")}:</b> ${esc(s.status)}${s.note ? ` (${esc(s.note)})` : ""}</p>
<p class="c">${cmd(`--approve ${s.shot} --by "Name"`)}<br>${cmd(`--reject ${s.shot} --by "Name" --note "why"`)}<br>${cmd(`--replace ${s.shot} --by "Name" --query "..."`)}</p></div></article>`;
  }).join("\n");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${L("title")}</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1d1b;--mut:#666;--line:#ddd;--pass:#1f7a3a;--warn:#9a6700;--fail:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#eceae4;--mut:#aaa;--line:#333;--pass:#5fc27e;--warn:#e3b341;--fail:#ff7b72}}
body{background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;margin:0 auto;max-width:1100px;padding:16px}
article{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:16px;border-top:1px solid var(--line);padding:16px 0}
@media (max-width:700px){article{grid-template-columns:1fr}}img{width:100%;border-radius:6px}.ar{font:26px/1.9 "Amiri Quran","Amiri",serif}
.mn,.c{color:var(--mut)}code{font-size:12px;word-break:break-all}.b{padding:1px 8px;border-radius:9px;font-size:12px;border:1px solid}
.PASS{color:var(--pass)}.WARNING{color:var(--warn)}.FAIL{color:var(--fail)}h3{margin:0 0 8px}</style></head>
<body><h1>${L("title")}</h1><p>${L("intro")}</p>${head}\n${rows}</body></html>`;
}
