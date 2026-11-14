/**
 * Understand a voice before any picture is chosen: its language, what it is
 * (Quran recitation or narration), its exact words with times, and its
 * structure (topic words, sections, named people and things, places, dates),
 * all in code from the timed words. Nothing here changes a word.
 * - Quran: matchRecitation finds the exact ayat with per-ayah times, and
 *   planQuranFilm / checkQuranFilm make and check the ayah-by-ayah plan.
 *   When a location is given (locateRecitation: the user's surah and ayat,
 *   the gate, times on the measured pauses), the plan is built from it, and
 *   its question, if it has one, is passed on instead of a plan.
 * - Narration: classifyInput says what kind of film it is, splitVoiceScenes
 *   cuts scenes on the word times, and the words of the scenes are proven to
 *   be the transcript's words, in order, none added or dropped.
 */
import { classifyInput, detectLanguage } from "./content-intel.mjs";
import { msg } from "./messages.mjs";
import { matchRecitation } from "./quran.mjs";
import { checkQuranFilm, planQuranFilm } from "./quran-film.mjs";
import { locationToMatch } from "./quran-locate.mjs";
import { splitVoiceScenes } from "./voice-scenes.mjs";

/** @typedef {{ text: string, start: number, end: number, confidence?: number | null }} Word */
/** @typedef {import("./voice-scenes.mjs").VoiceScene} VoiceScene */

/** Words compared without case or punctuation. @param {string} s */
const key = (s) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Proof that the scenes hold exactly the transcript's words.
 * @param {Word[]} words @param {VoiceScene[]} scenes
 * @returns {{ ok: boolean, detail: string }}
 */
export function wordsKept(words, scenes) {
  const want = words.map((w) => w.text);
  const got = scenes.flatMap((s) => s.words.map((w) => w.text));
  if (want.length !== got.length) return { ok: false, detail: `${want.length} words spoken, ${got.length} in the scenes.` };
  for (let i = 0; i < want.length; i += 1) if (want[i] !== got[i]) return { ok: false, detail: `word ${i + 1}: "${want[i]}" became "${got[i]}".` };
  for (const s of scenes) if (s.narration !== s.words.map((w) => w.text).join(" ")) return { ok: false, detail: `${s.sc}: NARR is not its words.` };
  return { ok: true, detail: `${want.length} words, unchanged and in order.` };
}

const STOP = new Set(("a an the and or but nor so yet for of to in on at by from with without into onto over under up down out off about above below than then that this these those there here it its it's is are was were be been being am do does did done have has had having i me my we us our you your he him his she her they them their what which who whom whose when where why how all any both each few more most other some such no not only own same too very can will just should would could may might must shall as if because while until again further once also even ever still rather far little long great new"
).split(" "));

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December";
const DATE_PATTERNS = [
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{3,4})?\\b`, "g"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${MONTHS})(?:,?\\s+\\d{3,4})?\\b`, "g"),
  /\b(?:in|by|since|until|of|from|to|around|about|circa)\s+(1\d{3}|20\d{2})s?\b/gi,
  /\b(?:1\d{3}|20\d{2})s\b/g,
  /\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty-first|\d{1,2}(?:st|nd|rd|th))\s+century\b/gi,
  /\b(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a hundred|hundred|thousand|score|\d+)[\s-]+(?:and\s+)?)+(?:years?|decades?|centuries)\s+ago\b/gi,
];
const PLACE_CUES = /^(?:in|at|near|from|across|to|into|through|outside|inside|around|toward|towards)$/i;

/**
 * The structure of a narration, for the picture plan.
 * @param {VoiceScene[]} scenes
 * @param {{ sectionPauseSeconds?: number, sectionSeconds?: number }} [o]
 */
export function voiceStructure(scenes, o = {}) {
  const pause = o.sectionPauseSeconds ?? 1.2;
  const longest = o.sectionSeconds ?? 90;
  const words = scenes.flatMap((s) => s.words.map((w) => ({ ...w, sc: s.sc })));
  const count = (/** @type {typeof words} */ ws) => {
    /** @type {Map<string, number>} */
    const m = new Map();
    for (const w of ws) { const k = key(w.text); if (k.length >= 3 && !STOP.has(k) && !/^\d+$/.test(k)) m.set(k, (m.get(k) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const topicWords = count(words).slice(0, 10).map(([word, n]) => ({ word, n }));

  // Sections: a long pause between scenes, or a section grown too long, starts a new one.
  /** @type {{ id: string, from: string, to: string, start: number, end: number, keywords: string[], opening: string }[]} */
  const sections = [];
  /** @type {VoiceScene[]} */
  let cur = [];
  const close = () => {
    if (!cur.length) return;
    const ws = cur.flatMap((s) => s.words.map((w) => ({ ...w, sc: s.sc })));
    const first = cur[0].narration.split(/(?<=[.!?])\s/)[0];
    sections.push({ id: "P" + (sections.length + 1), from: cur[0].sc, to: cur[cur.length - 1].sc, start: cur[0].start, end: cur[cur.length - 1].end, keywords: count(ws).slice(0, 4).map(([k]) => k), opening: first.length > 120 ? first.slice(0, 117) + "…" : first });
    cur = [];
  };
  scenes.forEach((s, i) => {
    const prev = scenes[i - 1];
    const gap = prev ? s.words[0].start - prev.words[prev.words.length - 1].end : 0;
    if (cur.length && (gap >= pause || s.end - cur[0].start > longest)) close();
    cur.push(s);
  });
  close();

  // Named things: capitalised words, joined into names ("Abraham Lincoln"), not counted at a sentence start unless seen elsewhere capitalised.
  /** @type {Map<string, { name: string, scenes: Set<string>, n: number, place: boolean, startOnly: boolean }>} */
  const names = new Map();
  for (let i = 0; i < words.length; i += 1) {
    const isCap = (/** @type {number} */ k) => k < words.length && /^[\p{Lu}]/u.test(words[k].text.replace(/^["“'(]/, "")) && !STOP.has(key(words[k].text)) && key(words[k].text).length > 1;
    if (!isCap(i)) continue;
    let j = i;
    while (j + 1 < words.length && isCap(j + 1) && !/[.!?,;:]$/.test(words[j].text)) j += 1;
    const name = words.slice(i, j + 1).map((w) => w.text.replace(/^["“'(]+|[^\p{L}\p{N}]+$/gu, "")).join(" ");
    const atStart = i === 0 || /[.!?]["”')]*$/.test(words[i - 1].text);
    const place = i > 0 && PLACE_CUES.test(key(words[i - 1].text));
    const e = names.get(name) ?? { name, scenes: new Set(), n: 0, place: false, startOnly: true };
    e.n += 1; e.scenes.add(words[i].sc); e.place ||= place; e.startOnly &&= atStart;
    names.set(name, e);
    i = j;
  }
  // A sentence's first word is capitalised anyway: it counts as a name when it is two or more
  // capitalised words, or part of a name seen elsewhere. Months and weekdays are dates, not names.
  const all = [...names.values()];
  const calendar = new RegExp(`^(?:${MONTHS}|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$`);
  const entities = all
    .filter((e) => !calendar.test(e.name) && (!e.startOnly || e.name.includes(" ") || all.some((x) => x !== e && x.name.split(" ").includes(e.name)))).sort((a, b) => b.n - a.n).map((e) => ({ name: e.name, n: e.n, scenes: [...e.scenes], place: e.place }));
  const places = entities.filter((e) => e.place).map((e) => ({ name: e.name, scenes: e.scenes, basis: "named after a place word (in, at, near...): a guess to check" }));

  // Dates and spans of time, with the scene that says them.
  /** @type {{ text: string, scene: string }[]} */
  const dates = [];
  for (const s of scenes) for (const re of DATE_PATTERNS) for (const m of s.narration.matchAll(re)) if (!dates.some((d) => d.scene === s.sc && d.text.includes(m[0]))) dates.push({ text: m[0], scene: s.sc });

  return { topicWords, sections, entities, places, dates, words: words.length, seconds: scenes.length ? scenes[scenes.length - 1].end : 0 };
}

/**
 * The film plan of a located recitation. An ayah end that is not sure is
 * marked on its scene and listed for review: nothing may be cut there.
 * @param {ReturnType<typeof import("./quran-locate.mjs").locateRecitation>} location
 * @param {import("./quran.mjs").QuranIndex} index @param {number} totalSeconds @param {any[]} surahNames
 */
export function planLocated(location, index, totalSeconds, surahNames) {
  const match = locationToMatch(location, index);
  const plan = planQuranFilm({ match, index, totalSeconds, surahNames });
  plan.timing = location.timing ?? undefined;
  plan.source = location.source ?? undefined;
  const ayahScenes = plan.scenes.filter((s) => s.kind === "ayah");
  location.ayat.forEach((a, k) => {
    const scene = ayahScenes[k];
    if (!scene || k === location.ayat.length - 1) return;
    scene.endSure = a.sure;
    if (!a.sure) { const note = a.joined ? "No pause at the end of this ayah: the cut point is approximate." : "The end of this ayah is not sure: confirm it before cutting here."; scene.needsReview.push(note); plan.review.push(`${scene.id} (${a.surah}:${a.ayah}): ${note}`); }
  });
  return { match, plan };
}

/**
 * @param {{ transcript: { language?: string | null, words: Word[] }, totalSeconds: number, kind?: "auto" | "narration" | "quran", quranIndex?: import("./quran.mjs").QuranIndex | null, surahNames?: any[], sceneOptions?: { minSeconds?: number, targetSeconds?: number, maxSeconds?: number },
 *   location?: ReturnType<typeof import("./quran-locate.mjs").locateRecitation> | null }} o
 */
export function understandVoice(o) {
  const words = (o.transcript?.words ?? []).filter((w) => w && String(w.text).trim());
  const total = o.totalSeconds;
  const messages = [];
  /** @type {string[]} */
  const problems = [];
  const text = words.map((w) => w.text).join(" ");
  const detected = detectLanguage(text).language;
  const language = detected === "unknown" && o.transcript?.language ? String(o.transcript.language) : detected;
  const location = o.location ?? null;
  if (location && (location.ok || o.kind === "quran" || location.passages.length || location.heard.length)) {
    if (!o.quranIndex) throw new Error("The Quran index is needed to plan a recitation.");
    // A question (which surah? does it fit?) stops here: the caller asks it; nothing is planned on a guess.
    if (!location.ok) return { ok: false, kind: "quran", language: language === "unknown" ? "ar" : language, location, question: location.question, messages: location.messages, problems: ["quran-question: " + (location.question?.code ?? "")] };
    const { match, plan } = planLocated(location, o.quranIndex, total, o.surahNames ?? []);
    problems.push(...checkQuranFilm(plan, o.quranIndex));
    messages.push(msg("voice.kind", { kind: "quran", language: "ar" }), ...location.messages);
    return { ok: plan.ok && !problems.length, kind: "quran", language: "ar", classification: classifyInput({ text, recitation: match }), match, location, quranPlan: plan, messages, problems };
  }
  if (!words.length) return { ok: false, kind: null, language, messages: [msg("voice.noWords")], problems: ["no-words"] };

  const kind = o.kind ?? "auto";
  const tryQuran = kind === "quran" || (kind === "auto" && (language === "ar" || /^ar/.test(String(o.transcript?.language ?? ""))));
  if (tryQuran) {
    if (!o.quranIndex) throw new Error("The Quran index is needed to recognise a recitation.");
    const match = matchRecitation(words, o.quranIndex);
    if (match.isQuran) {
      const plan = planQuranFilm({ match, index: o.quranIndex, totalSeconds: total, surahNames: o.surahNames ?? [] });
      problems.push(...checkQuranFilm(plan, o.quranIndex));
      const sum = plan.summary;
      messages.push(msg("voice.kind", { kind: "quran", language }));
      if (plan.ok) messages.push(msg("voice.quranFound", { surah: sum.surah ?? "several", from: sum.fromAyah ?? "?", to: sum.toAyah ?? "?", coverage: Math.round(match.coverage * 100) }));
      return { ok: plan.ok && !problems.length, kind: "quran", language, classification: classifyInput({ text, recitation: match }), match, quranPlan: plan, messages, problems };
    }
    if (kind === "quran") return { ok: false, kind: "quran", language, match, messages: [msg("voice.quranNotFound")], problems: ["quran-not-recognised"] };
  }

  const classification = classifyInput({ text });
  const scenes = splitVoiceScenes(words, total, o.sceneOptions);
  const kept = wordsKept(words, scenes);
  if (!kept.ok) problems.push("words-changed: " + kept.detail);
  let at = 0;
  for (const s of scenes) { if (Math.abs(s.start - at) > 0.002) problems.push(`${s.sc} starts at ${s.start}, the previous scene ends at ${at}.`); at = s.end; }
  if (scenes.length && Math.abs(at - total) > 0.002) problems.push(`The scenes end at ${at}, the recording at ${total}.`);
  messages.push(msg("voice.kind", { kind: "narration", language }), msg("voice.scenes", { count: scenes.length }));
  if (kept.ok) messages.push(msg("voice.wordsKept"));
  return { ok: !problems.length && scenes.length > 0, kind: "narration", language, classification, scenes, structure: voiceStructure(scenes), wordsKept: kept, messages, problems };
}
