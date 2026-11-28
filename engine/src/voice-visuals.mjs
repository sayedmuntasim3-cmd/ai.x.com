/**
 * Pictures for a voice, scene by scene. The scenes' times and words are
 * fixed by the voice; a brain (any model: nothing here assumes Claude) may
 * write only ANCHOR, SHOTS, SRC (search queries) and LOOK. Whatever it
 * returns, the voice's own times and words are put back in code
 * (restoreVoiceFields) and checked (checkVoiceChapter); a scene it skipped
 * or left unfinished gets a plan from the scene's own words. Media comes from
 * the keyless free archives first (chapterMedia, licence recorded per
 * asset); only a brain that can see (canSee) judges thumbnails.
 * Quran recitation has its own rules: quranVisualAdabGuard.
 */
import { canSee } from "./film-run.mjs";
import { roleCraft } from "./role-craft.mjs";
import { chapterMedia, FREE_LICENCES } from "./film-media.mjs";
import { msg } from "./messages.mjs";
import { barBrief } from "./reference-bar.mjs";
import { parseSceneLines } from "./scene-lines.mjs";
import { checkQuranFilm, RECITATION_AUDIO } from "./quran-film.mjs";
import { checkVoiceChapter, restoreVoiceFields, voiceSkeleton } from "./voice-scenes.mjs";
import { cleanSubject, subjectFromTranscript } from "./picture-ladder.mjs";

/** @typedef {import("./voice-scenes.mjs").VoiceScene} VoiceScene */
/** @typedef {import("./film-run.mjs").Model} Model */
/** @typedef {ReturnType<typeof import("./voice-understand.mjs").voiceStructure>} Structure */

const key = (/** @type {string} */ s) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
const STOP = new Set("a an the and or but of to in on at by for from with that this these those it its is are was were be been we us our you your he she they them their his her not no can will shall have has had who which what when where how all any so as than then there here what do did does about above across against along among around into onto over under upon through throughout toward towards up down out off near past since until via within without if because while whether yet nor just too also very".split(" "));

/** The brain's instructions. Short on purpose: the rules that matter are enforced in code. */
export const VOICE_VISUALS_SYSTEM = [
  "You plan the pictures of a documentary whose voiceover is already recorded.",
  "You get one line per scene. Times and NARR are the recording's: copy them exactly, never change, add, drop or reorder a word.",
  "Replace only the TODO fields:",
  "- ANCHOR: the one thing the viewer must see in this scene.",
  "- SHOTS: (1) ...; (2) ... each shot starts with R2 (real archival evidence: a named person, place, document or date) or R3 (illustrative footage), then what is seen.",
  "- SRC: one group per shot, separated by ';', each with search queries for free archives: Q1 \"...\" Q2 \"...\" (short, concrete, in English).",
  "- LOOK: colour and movement in a few words.",
  "Never invent facts the voice does not say. Never show a person's face as if it were someone named unless the archive item is that person.",
  "Answer with the scene lines only, one per line, nothing else.",
  barBrief(),
].join("\n");

/** Words a stock archive cannot picture: reporting, hedging, counting, filler. Searching them returns random pictures. */
const VAGUE = new Set(("accounts account report reports reported reporting latest according said says say saying told tells nearly almost exchange rate rates figure figures " +
  "number numbers note notes first second third last later before after still only just also even really very much many most more less " +
  "hundred thousand million billion year years time times day days today way thing things something someone anyone everyone people person part " +
  "kind lot back called call calls once again ever never always every each other another same such own made make makes making went goes going " +
  "come came comes get got gets give gave take took taken know known knew think thought found find finds look looked looks seen want wanted " +
  "need needed began begin begins started start starts became become becomes headlines headline filing could would should might must sure " +
  "story stories question answer reason fact facts point case side end ends start version idea word words name named names hand hands follow " +
  "agrees agree depends depend ended ends leaves leave seems seem means mean shows show appears appear remains remain matters matter happens happen keeps keep puts put sets lets tells asks gives " +
  "adjusted adjust latest current currently recently today's whose while though although because however perhaps maybe likely").split(" "));

/** h:mm:ss.mmm, the form scene lines use for shot times. @param {number} t */
const clockText = (t) => { const ms = Math.round(Math.max(0, t) * 1000); const h = Math.floor(ms / 3600000); const m = Math.floor((ms % 3600000) / 60000); const sec = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0"); return `${h}:${String(m).padStart(2, "0")}:${sec}`; };

/** A word as written, without punctuation around it ("-Rice," -> "Rice"). @param {string} t */
const bare = (t) => t.replace(/['’]s\b/gu, "").replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Proper-noun phrases said in the scene ("Brigade Road", "Rolls Royce Ghost"):
 * runs of capitalised words, a lone capitalised word only when it does not
 * start a sentence. @param {{ text: string }[]} words
 */
export function namePhrases(words) {
  /** @type {string[]} */
  const out = [];
  /** @type {{ t: string, first: boolean }[]} */
  let run = [];
  const flush = () => {
    const kept = run.filter((r) => !STOP.has(key(r.t)) && !VAGUE.has(key(r.t)));
    if (kept.length >= 2 || (kept.length === 1 && !kept[0].first && kept[0].t.length > 2)) out.push(kept.map((r) => r.t).join(" "));
    run = [];
  };
  words.forEach((w, i) => {
    const t = bare(String(w.text));
    const first = i === 0 || /[.!?:]["')\]]*$/.test(String(words[i - 1].text));
    if (t && /^\p{Lu}/u.test(t) && !/^\d/.test(t)) {
      run.push({ t, first: run.length ? run[0].first : first });
      if (/[,.!?;:]["')\]]*$/.test(String(w.text))) flush();
    } else flush();
  });
  flush();
  return [...new Set(out)];
}

/**
 * The subject of the film from the owner's topic, for the fallback search:
 * after a colon or a spaced dash when there is one ("Ramesh Babu: from barber
 * to Rolls-Royce", "Ramesh Babu - From Barber to Rolls-Royce" -> barber,
 * Rolls-Royce), without small words. @param {string} topic
 */
export function topicSubjects(topic) {
  const cut = /:|\s[-–—]\s/.exec(topic);
  const tail = cut ? topic.slice(cut.index + cut[0].length) : topic;
  const words = tail.split(/\s+/).map(bare).filter(Boolean);
  // A title-case file name ("From Barber To Rolls-Royce") capitalises plain words: "Barber" would find a congressman.
  const titleCase = words.length >= 2 && words.filter((w) => /^\p{Lu}/u.test(w)).length / words.length >= 0.6;
  const plain = words.map((w) => (titleCase && /^\p{Lu}\p{Ll}+$/u.test(w) ? w.toLowerCase() : w));
  return [...new Set(plain.filter((w) => w.length >= 3 && !STOP.has(key(w)) && !VAGUE.has(key(w)) && !["from", "into", "onto"].includes(key(w))))].slice(0, 4);
}

/** Words that make a capitalised phrase a place, a firm or a thing, not a person. */
const THING_WORDS = /^(road|street|st|avenue|lane|square|city|town|village|river|lake|mountain|island|bay|park|bridge|tower|temple|church|mosque|palace|fort|station|airport|port|market|bazaar|mall|hall|museum|university|college|school|hospital|bank|company|corporation|inc|ltd|tours|travels|motors|airlines|railway|times|news|post|ghost|phantom|royce|benz|ford|valley|state|province|district|county|empire|kingdom|republic|ocean|sea|desert|canal)$/i;

const CALENDAR = /^(january|february|march|april|may|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i;

/** Words that announce a noun: "a pen", "the bundle", "his family", "one meal". */
const DETERMINERS = new Set("a an the his her their our my its this that these those one two three four five six seven eight nine ten every each some no another several many few".split(" "));
/** Endings of adjectives, adverbs and verb forms: a search on them finds random pictures. */
const NOT_A_THING = /(ly|ful|less|ous|ish|ible|able)$/;
/** Verb forms, refused only among the fallback words (after a determiner, "the building" is a thing). */
const VERB_FORM = /(ed|ing)$/;

/**
 * The things named in a scene, found without a dictionary: the last plain word
 * of a run that follows a determiner, before a small word, punctuation or the
 * end ("a small object from school" -> object; "the bundle" -> bundle).
 * @param {{ text: string }[]} words
 * @returns {string[]}
 */
export function nounsAfterDeterminers(words) {
  /** @type {string[]} */
  const out = [];
  for (let d = 0; d < words.length - 1; d += 1) {
    if (!DETERMINERS.has(key(words[d].text)) || /[.,;:!?]["')\]]*$/.test(String(words[d].text))) continue;
    let head = "";
    for (let i = d + 1; i < Math.min(words.length, d + 4); i += 1) {
      const raw = String(words[i].text);
      const t = bare(raw);
      const k = key(t);
      if (!k || STOP.has(k) || DETERMINERS.has(k) || /^\p{Lu}/u.test(t) || /^\d/.test(t)) break;
      // A filler word or a verb form ends the run; the noun before it stays ("the bundle went" -> bundle).
      if (VAGUE.has(k) || (head && /(ed|ing)$/.test(k))) break;
      head = t.toLowerCase();
      if (/[.,;:!?]["')\]]*$/.test(raw)) break;
    }
    const k = key(head);
    if (k.length >= 3 && !VAGUE.has(k) && !(NOT_A_THING.test(k) && k.length > 5)) out.push(head);
  }
  return out;
}

/**
 * A name the speech-to-text misheard, put back in the owner's spelling: a
 * phrase whose first word starts a capitalised name in the topic takes that
 * name ("Rolls Rice" with the topic "... to Rolls-Royce" -> "Rolls-Royce").
 * @param {string} phrase @param {string} topic
 */
export function topicSpelling(phrase, topic) {
  const first = key(phrase.split(/\s+/)[0] ?? "");
  if (first.length < 3) return phrase;
  for (const name of topic.match(/\p{Lu}[\p{L}\p{N}'’.-]*(?:[\s-]\p{Lu}[\p{L}\p{N}'’.-]*)*/gu) ?? []) {
    const k = key(name.split(/[\s-]/)[0]);
    if (k === first && key(name) !== key(phrase)) return name.replace(/[.,;:]+$/, "");
  }
  return phrase;
}

/** Edit distance (Levenshtein), small strings only. @param {string} a @param {string} b */
function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Put names the speech-to-text misheard back in the topic's spelling, in place,
 * so cards and subtitles never show two spellings of one person ("Ramish" when
 * the topic says "Ramesh"). Only capitalised words, same first letter, close in
 * spelling (1 letter for short names, 2 for 6+ letters). Returns how many changed.
 * @param {{ text: string }[]} words @param {string} topic
 */
export function respellNames(words, topic) {
  const names = new Map();
  for (const w of String(topic ?? "").match(/\p{Lu}[\p{L}'’]{3,}/gu) ?? []) names.set(key(w), w);
  if (!names.size) return 0;
  let changed = 0;
  for (const w of words ?? []) {
    const raw = String(w.text ?? "");
    const t = bare(raw);
    if (!/^\p{Lu}/u.test(t) || t.length < 4) continue;
    const k = key(t);
    if (names.has(k)) continue;
    for (const [nk, name] of names) {
      if (nk[0] !== k[0] || Math.abs(nk.length - k.length) > 2) continue;
      if (editDistance(k, nk) <= (nk.length >= 6 ? 2 : 1)) { w.text = raw.replace(t, name); changed++; break; }
    }
  }
  return changed;
}

/**
 * A plan from the scene's own words, for a scene the brain did not plan.
 * Each search is a short concrete thing said in the scene: a name or place
 * phrase first, then the most repeated picturable words; reporting and filler
 * words ("reports", "nearly") are never searched. The owner's topic is the
 * fallback search of every shot (its subject words, rotated), never glued in
 * front: a long query finds nothing and the archive answers with random prints.
 * A long scene gets a shot about every 6 seconds, each with its own search.
 * Names and dates said in the scene make it an evidence shot (R2).
 * @param {VoiceScene} s @param {Structure | null} structure @param {string} [topic]
 */
export function wordsPlan(s, structure, topic = "") {
  const names = (structure?.entities ?? []).filter((e) => e.scenes.includes(s.sc)).map((e) => e.name);
  const dated = (structure?.dates ?? []).some((d) => d.scene === s.sc);
  const subjects = topicSubjects(topic);
  const subjectKeys = new Set(subjects.map(key));
  /** @type {Map<string, { text: string, score: number }>} */
  const cand = new Map();
  const add = (/** @type {string} */ text, /** @type {number} */ score) => { const k = key(text); if (!k) return; const c = cand.get(k); if (c) c.score += score; else cand.set(k, { text, score }); };
  // People: a private person's name finds random portraits in the archives, so a person is the ANCHOR, never a search.
  // A person here: two or more capitalised words that are not a place, not the topic's own name, with no thing word in
  // them ("Brigade Road", "Ramesh Tours" stay), or a run of initials ("P E G O H Paul").
  const places = new Set((structure?.entities ?? []).filter((e) => e.place).map((e) => key(e.name)));
  for (const raw of namePhrases(s.words)) {
    const p = topicSpelling(raw, topic);
    const words = p.split(/\s+/);
    const fromTopic = p !== raw || key(topic).includes(key(p));
    // The topic's own subject before ":" or " - " is usually a private person ("Ramesh Babu - From Barber ...").
    const topicHead = key(topic.split(/:|\s[-–—]\s/)[0] ?? "");
    if (topicHead && key(p) === topicHead && !words.some((w) => THING_WORDS.test(w))) continue;
    // Months, weekdays and short all-capital words (a misheard sound, a channel's initials) are not pictures.
    if (words.length === 1 && (CALENDAR.test(p) || /^\p{Lu}{2,3}$/u.test(p))) continue;
    const thing = words.some((w) => THING_WORDS.test(w));
    const initials = /^(\p{Lu}\.?\s){2,}/u.test(p + " ");
    const person = initials || (words.length >= 2 && !fromTopic && !thing && !places.has(key(p)));
    if (!person) add(p, words.length > 1 ? 4 : 2.5);
  }
  // Things named in the scene (a noun after a determiner) first; other plain words only as a weak fallback.
  for (const n of nounsAfterDeterminers(s.words)) add(n, 2 + (subjectKeys.has(key(n)) ? 1.5 : 0));
  for (const w of s.words) {
    const t = bare(String(w.text));
    const k = key(t);
    if (k.length < 4 || STOP.has(k) || VAGUE.has(k) || DETERMINERS.has(k) || /^\d+$/.test(k) || /^\p{Lu}/u.test(t) || NOT_A_THING.test(k) || VERB_FORM.test(k)) continue;
    add(t.toLowerCase(), subjectKeys.has(k) ? 1.5 : 0.25);
  }
  // A word already inside a chosen phrase adds nothing of its own.
  const ranked = [...cand.values()].sort((a, b) => b.score - a.score || b.text.length - a.text.length);
  /** @type {string[]} */
  const picks = [];
  for (const c of ranked) { if (!picks.some((p) => key(p).includes(key(c.text)) || key(c.text).includes(key(p)))) picks.push(c.text); }
  const seconds = Math.max(0.1, s.end - s.start);
  const count = Math.max(1, Math.min(4, Math.round(seconds / 6), picks.length || 1));
  const subject = names[0] ?? picks[0] ?? subjects[0] ?? "landscape";
  const rung = names.length || dated ? "R2" : "R3";
  const shots = [];
  const groups = [];
  for (let i = 0; i < count; i += 1) {
    const from = s.start + (seconds * i) / count;
    const to = i === count - 1 ? s.end : s.start + (seconds * (i + 1)) / count;
    const q1 = picks[i] ?? subjects[i % Math.max(1, subjects.length)] ?? subject;
    const fallback = subjects.length ? subjects[i % subjects.length] : picks[i + 1] ?? subject;
    const q2 = key(fallback) === key(q1) ? (subjects[(i + 1) % Math.max(1, subjects.length)] ?? picks[i + 1] ?? "") : fallback;
    shots.push(count === 1 ? `(1) ${rung} ${q1}` : `(${i + 1}) ${clockText(from)}-${clockText(to)} ${rung} ${q1}`);
    groups.push(q2 && key(q2) !== key(q1) ? `${q1} · Q1 "${q1}" Q2 "${q2}"` : `${q1} · Q1 "${q1}"`);
  }
  return {
    ANCHOR: subject,
    SHOTS: shots.join(" "),
    SRC: groups.join("; "),
    LOOK: rung === "R2" ? "archival, slow push-in" : "natural light, slow drift",
  };
}

/** @param {string} line @param {Record<string, string>} f */
function fillLine(line, f) {
  let out = line;
  for (const [k, v] of Object.entries(f)) {
    const re = new RegExp(`(\\|\\s${k}:\\s?)[^|]*?(?=\\s\\|\\s|$)`);
    out = re.test(out) ? out.replace(re, `$1${v}`) : out + ` | ${k}: ${v}`;
  }
  return out;
}

/**
 * Run one brain batch; when the free brain says the prompt is too big for it (tooLarge, the Worker's 413), the
 * batch is split in half and each half asked again, down to one item. Every other error goes to the caller.
 * @template T @param {T[]} batch @param {(part: T[]) => Promise<void>} run
 * @returns {Promise<number>} the number of calls that answered
 */
export async function runFitting(batch, run) {
  try {
    await run(batch);
    return 1;
  } catch (e) {
    if (!(/** @type {any} */ (e)?.tooLarge) || batch.length < 2) throw e;
    const half = Math.ceil(batch.length / 2);
    return (await runFitting(batch.slice(0, half), run)) + (await runFitting(batch.slice(half), run));
  }
}

/**
 * The brain's work cut into batches: whole sections (structure.sections, about 90 s each) packed until a
 * batch's lines reach batchChars, so one prompt fits a free brain's limit (Groq: about 7,200 tokens).
 * @param {VoiceScene[]} scenes @param {Structure | null} structure @param {(sc: string) => number} size @param {number} [batchChars]
 * @returns {VoiceScene[][]}
 */
export function brainBatches(scenes, structure, size, batchChars = 14000) {
  const sectionOf = new Map();
  for (const sec of structure?.sections ?? []) {
    let inside = false;
    for (const s of scenes) { if (s.sc === sec.from) inside = true; if (inside) sectionOf.set(s.sc, sec.id); if (s.sc === sec.to) inside = false; }
  }
  /** @type {VoiceScene[][]} */
  const groups = [];
  for (const s of scenes) {
    const last = groups[groups.length - 1];
    if (last && (sectionOf.get(last[0].sc) ?? "") === (sectionOf.get(s.sc) ?? "")) last.push(s); else groups.push([s]);
  }
  /** @type {VoiceScene[][]} */
  const batches = [];
  let cur = /** @type {VoiceScene[]} */ ([]), chars = 0;
  for (const g of groups) {
    const n = g.reduce((acc, s) => acc + size(s.sc) + 1, 0);
    if (cur.length && chars + n > batchChars) { batches.push(cur); cur = []; chars = 0; }
    cur.push(...g); chars += n;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

/**
 * What a film with no topic typed is about, found from its own words before any picture is searched: names, places and
 * years first (no model), then one small free-brain call for "the subject in 6 words or fewer"; when that fails or answers
 * with something that is not a subject, the first result stands.
 * @param {{ text: string, brain?: Model | null }} o
 * @returns {Promise<{ subject: string, by: "names" | "brain" | "none" }>}
 */
export async function filmSubject(o) {
  const text = String(o.text ?? "").replace(/\s+/g, " ").trim();
  const names = subjectFromTranscript(text);
  if (o.brain && text) {
    try {
      const reply = await o.brain.call({ stage: "V4", system: [{ text: "You name what a recording is about. Answer with the subject only: at most 6 words, specific (the event, person or place with its year when known), no sentence, no quotes." }], messages: [{ role: "user", content: [{ text: `Names and places found in it: ${names || "none"}.\n\nTranscript:\n${text.slice(0, 4000)}\n\nThe subject in 6 words or fewer:` }] }], maxTokens: 40, effort: "low" });
      const subject = cleanSubject(reply.text ?? "");
      if (subject) return { subject, by: "brain" };
    } catch { /* the names stand */ }
  }
  return names ? { subject: names, by: "names" } : { subject: "", by: "none" };
}

/**
 * reachable: checks that a picture's file can be fetched before it is chosen (the runner can afford the request).
 * worldNote: the Director pass's world (shot-plan.mjs worldBrief), so every shot names the right place, era and money.
 * @param {{ scenes: VoiceScene[], structure?: Structure | null, topic?: string, worldNote?: string, brain?: Model | null, providers?: import("./film-media.mjs").MediaProvider[], chapter?: string, batchChars?: number, maxCalls?: number, judge?: import("./film-media.mjs").MediaJudge, reachable?: (url: string) => Promise<boolean>, concurrency?: number }} o
 */
export async function planVoiceVisuals(o) {
  const chapter = o.chapter ?? "C1";
  const scenes = o.scenes;
  const structure = o.structure ?? null;
  const messages = [];
  // No topic typed: the subject is found from the words before any picture is searched, and every query carries it.
  const found = o.topic ? { subject: "", by: /** @type {const} */ ("none") } : await filmSubject({ text: scenes.map((s) => s.narration).join(" "), brain: o.brain });
  const subject = o.topic || found.subject;
  const skeleton = voiceSkeleton(scenes, chapter).split("\n").map((l) => l.replace("| SHOTS: TODO", "| SHOTS: TODO | SRC: TODO")).join("\n");
  let written = "";
  let brainUsed = false;
  if (o.brain) {
    const brief = (subject ? `The film is about: ${subject}. ` : "") + (o.worldNote ? `${o.worldNote} ` : "") + (structure ? `Topic words: ${structure.topicWords.map((t) => t.word).join(", ")}. Names: ${structure.entities.map((e) => e.name).join(", ") || "none"}. Dates: ${structure.dates.map((d) => d.text).join("; ") || "none"}.` : "");
    const lineOf = new Map(skeleton.split("\n").map((l) => [/SC\d{4,5}/.exec(l)?.[0] ?? "", l]));
    const batches = brainBatches(scenes, structure, (sc) => (lineOf.get(sc) ?? "").length, o.batchChars);
    const maxCalls = o.maxCalls ?? 40;
    /** @type {string[]} */
    const parts = [];
    let answered = 0, stopped = "";
    for (const batch of batches) {
      if (stopped || answered >= maxCalls) break;
      try {
        answered += await runFitting(batch, async (part) => {
          const text = part.map((s) => lineOf.get(s.sc)).join("\n");
          const reply = await /** @type {Model} */ (o.brain).call({ stage: "V4", system: [{ text: `${VOICE_VISUALS_SYSTEM}\n\n${roleCraft("V4")}`, cache: true }], messages: [{ role: "user", content: [{ text: `${brief}\n\n${text}` }] }], maxTokens: Math.min(32000, 400 + part.length * 260), effort: "medium" });
          parts.push(reply.text ?? "");
        });
      } catch (e) {
        // A used-up day (429) stops the brain for the rest of the film; those scenes are planned from their own words.
        // The day being spent everywhere is different: it stops the whole film, so the saved stages resume tomorrow.
        if (/** @type {any} */ (e)?.daily) throw e;
        if (/** @type {any} */ (e)?.status === 429 || /** @type {any} */ (e)?.permanent) stopped = String(/** @type {any} */ (e)?.message ?? e).slice(0, 160);
      }
    }
    written = parts.join("\n");
    brainUsed = answered > 0;
    if (brainUsed || stopped) messages.push(msg("voice.brainBatches", { done: answered, total: batches.length }));
    if (stopped) messages.push(msg("voice.brainStopped", { reason: stopped }));
  }
  if (!brainUsed) messages.push(msg("voice.noBrain"));

  // What the brain changed of the voice is reported, then repaired in code.
  const before = written ? checkVoiceChapter(written, scenes) : [];
  const changed = before.filter((f) => f.code === "words-changed" || f.code === "time-changed").map((f) => f.scene);
  if (changed.length) messages.push(msg("voice.wordsChanged", { scenes: [...new Set(changed)].join(", ") }));
  const restored = written ? restoreVoiceFields(written, scenes) : "";
  const byId = new Map(parseSceneLines(restored).map((l) => [l.sc, l]));
  const skeletonLines = new Map(skeleton.split("\n").map((l) => [/SC\d{4,5}/.exec(l)?.[0] ?? "", l]));
  const lines = scenes.map((s) => {
    const w = byId.get(s.sc);
    const usable = w && !/TODO/.test(w.raw) && w.fields.SHOTS && w.fields.SRC;
    return usable ? w.raw : fillLine(/** @type {string} */ (skeletonLines.get(s.sc)), wordsPlan(s, structure, subject));
  });
  const markdown = lines.join("\n");
  const findings = checkVoiceChapter(markdown, scenes);
  if (findings.some((f) => f.code === "words-changed" || f.code === "time-changed")) throw new Error("Bug: the voice's words or times are not intact after restoring them.");
  if (!findings.length) messages.push(msg("voice.wordsKept"));

  /** @type {Awaited<ReturnType<typeof chapterMedia>> | null} */
  let media = null;
  /** @type {{ sc: string, start: number, end: number, narration: string, shots: string, assets: any[] }[]} */
  const plan = parseSceneLines(markdown).map((l) => {
    const s = /** @type {VoiceScene} */ (scenes.find((x) => x.sc === l.sc));
    return { sc: l.sc, start: s.start, end: s.end, narration: s.narration, shots: l.fields.SHOTS ?? "", assets: [] };
  });
  if (o.providers?.length) {
    const judge = o.brain && canSee(o.brain) ? o.judge : undefined;
    // Voiceover films: a picture must name what was searched (the archives match "car" to "Carina Nebula").
    media = await chapterMedia({ chapter, markdown, providers: o.providers, judge, wholeWord: true, reachable: o.reachable, concurrency: o.concurrency, topic: o.topic, subject: o.topic ? undefined : found.subject, holdWeak: true, heard: Object.fromEntries(scenes.map((x) => [x.sc, x.narration])) });
    for (const shot of media.shots) {
      const p = plan.find((x) => x.sc === shot.scene);
      if (!p) continue;
      if (shot.pick && !FREE_LICENCES.includes(shot.pick.licence.licenseId)) { messages.push(msg("voice.assetRefused", { source: shot.pick.source, reason: `licence ${shot.pick.licence.licenseId} is not free for commercial use` })); continue; }
      if (shot.pick) p.assets.push({ shot: shot.shot, url: shot.pick.mediaUrl, page: shot.pick.sourcePageUrl, source: shot.pick.source, title: shot.pick.title, licence: shot.pick.licence, review: shot.review ?? "unreviewed" });
    }
    for (const p of plan) if (!p.assets.length) messages.push(msg("voice.noAsset", { scene: p.sc }));
  }
  return { markdown, plan, findings, messages, brainUsed, changedByBrain: [...new Set(changed)], media: media ? media.stats : null, chapterMedia: media };
}

/** Living beings, faces and things the documented Quran rules keep off screen (titles and tags are all a non-seeing check has). */
const LIVING = /\b(?:people|person|persons|man|men|woman|women|child|children|kid|kids|boy|girl|baby|face|faces|portrait|selfie|crowd|worshipp?ers?|family|human|humans|animal|animals|bird|birds|camel|camels|horse|horses|cattle|cow|cows|sheep|goat|dog|cat|fish|insect|bee|bees|lion|wildlife|prophet|angel|statue|idol|music|musician|guitar|concert|dance|dancing)\b/i;
const AI_SOURCES = new Set(["ai", "fal", "generated", "midjourney", "dalle", "stable-diffusion"]);

/**
 * quran-visual-adab-guard: the documented picture rules for a recitation
 * film, checked in code. Problems block the render; gaps are what is
 * missing and must be shown to the owner, never filled by guessing.
 * meanings: per ayah id, { text, source, licence, allowsUse } or nothing.
 * @param {{ plan: import("./quran-film.mjs").QuranFilmPlan, index: import("./quran.mjs").QuranIndex, assets?: { scene: string, source: string, title?: string, tags?: string[], licence?: { licenseId: string } | null }[], meanings?: Record<string, { text: string, source: string, licence: string, allowsUse: boolean }> }} o
 */
export function quranVisualAdabGuard(o) {
  /** @type {string[]} */
  const problems = [...checkQuranFilm(o.plan, o.index)];
  /** @type {string[]} */
  const gaps = [];
  const messages = [];
  const audio = o.plan.audio ?? RECITATION_AUDIO;
  if (audio.music) problems.push("music is planned under the recitation");
  if (audio.soundEffects) problems.push("sound effects are planned under the recitation");
  if (audio.ambience) problems.push("ambience is planned under the recitation");
  for (const a of o.assets ?? []) {
    const words = [a.title ?? "", ...(a.tags ?? [])].join(" ");
    const hit = LIVING.exec(words);
    if (hit) problems.push(`${a.scene}: "${(a.title ?? "").slice(0, 60)}" shows ${hit[0]} (no living beings, faces or music under the Quran).`);
    if (AI_SOURCES.has(String(a.source).toLowerCase())) problems.push(`${a.scene}: AI pictures are never used with the Quran.`);
    if (!a.licence || !FREE_LICENCES.includes(a.licence.licenseId)) problems.push(`${a.scene}: the picture has no free licence on record.`);
  }
  const ayat = o.plan.scenes.filter((s) => s.kind === "ayah");
  let meaningGap = false;
  for (const s of ayat) {
    const m = o.meanings?.[s.id];
    if (!m) { meaningGap = true; continue; }
    if (!m.allowsUse || !m.licence || !m.source) { problems.push(`${s.id}: a meaning is shown from ${m.source || "an unknown source"} without a licence that allows it.`); }
  }
  if (meaningGap) { gaps.push("meaning: no licensed translation for some or all ayat; meanings are not shown and pictures cannot follow the meaning yet"); messages.push(msg("voice.meaningGap")); }
  gaps.push("pictures: titles and tags are checked, not the pictures themselves; a seeing check or the owner must look before release");
  return { ok: problems.length === 0, problems, gaps, messages };
}

/**
 * A quiet score for a narration voiceover, so a long film does not sit in silence under the voice: an opening cue,
 * steady cues about every 4 minutes (cut at a scene edge), and a closing cue. The free score
 * (render/score-synth.mjs) composes them; the renderer lays them as a low bed under the voice. Never for the Quran:
 * nothing is laid under a recitation (musicPlanFor refuses it too).
 * @param {{ sc: string, start: number, end: number }[]} scenes
 * @param {{ kind?: "narration" | "quran", everySeconds?: number }} [o]
 * @returns {{ s4: string, cueOf: Map<string, string> } | null}
 */
export function voiceScore(scenes, o = {}) {
  if (o.kind === "quran" || !scenes.length) return null;
  const every = o.everySeconds ?? 240;
  const total = scenes[scenes.length - 1].end;
  /** @type {{ cue: string, start: number, end: number, sc: string[] }[]} */
  const cues = [];
  for (const s of scenes) {
    const last = cues[cues.length - 1];
    if (!last || (s.start - last.start >= every && total - s.start >= 60)) cues.push({ cue: `M${String(cues.length + 1).padStart(2, "0")}`, start: s.start, end: s.end, sc: [s.sc] });
    else { last.end = s.end; last.sc.push(s.sc); }
  }
  const moods = (/** @type {number} */ i, /** @type {number} */ n) =>
    i === 0 ? "Calm documentary opening, soft piano over low strings, curious; 84"
      : i === n - 1 && n > 1 ? "Gentle resolve, warm strings and piano, unhurried ending; 72"
        : ["Warm understated strings and piano, steady pulse; 80", "Light reflective piano, soft pads, forward motion; 88", "Quiet tension, low strings ostinato, restrained; 92"][(i - 1) % 3];
  const clock = (/** @type {number} */ t) => `${Math.floor(t / 3600)}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const rows = cues.map((c, i) => `| ${c.cue} | C1 | ${clock(c.start)}–${clock(c.end)} | ${moods(i, cues.length)} |`);
  /** @type {Map<string, string>} */
  const cueOf = new Map();
  for (const c of cues) for (const sc of c.sc) cueOf.set(sc, c.cue);
  return { s4: ["## Music plan (voiceover: a quiet bed under the voice)", "", "| Cue | Chapter | Time | Mood |", "|---|---|---|---|", ...rows, ""].join("\n"), cueOf };
}

/** Each scene line with its music cue (MUS field), for the renderer. @param {string} markdown @param {Map<string, string>} cueOf */
export function withMusic(markdown, cueOf) {
  return markdown.split("\n").map((line) => {
    const sc = /^\*\*(SC\d{4,5})\*\*/.exec(line)?.[1];
    if (!sc || !cueOf.has(sc) || /\|\s*MUS:/.test(line)) return line;
    return `${line} | MUS: ${cueOf.get(sc)}`;
  }).join("\n");
}
