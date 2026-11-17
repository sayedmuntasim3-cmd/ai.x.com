/**
 * Machine checks for S5 chapters written as compact scene lines (engine
 * manual 11.2). A chapter from the model is never trusted on its own word:
 * its clock, scene IDs, word budget, required fields, banned phrases,
 * language purity and footage sources are counted here, in code, and every
 * failure is reported with the scene it belongs to, so a repair pass can fix
 * exactly that and nothing else.
 *
 * Line shape (one per scene, fields separated by " | "):
 * **SC0001** | 0:00:00-0:00:08 | C1 | beat | slot | claims | NARR: ... | W 18/20 | ANCHOR: ... | SHOTS: ... | EV: R1 1 / R3 3 | ... | LOOK: ...
 */
import { checkVersionPurity, getVersion } from "./versions.mjs";

/** Phrases the engine bans from English narration (manual section 16). */
export const BANNED_EN = Object.freeze([
  "in today's video", "let's dive in", "buckle up", "you won't believe", "little did they know",
  "ever wondered", "shocking truth", "mind-blowing", "the answer will shock you", "stay till the end",
  "smash that like button", "amazing", "unbelievable", "secrets",
  // The owner's rule (6 Nov 2026): a film never asks to be liked, subscribed to or commented on. It earns it.
  "like and subscribe", "hit subscribe", "don't forget to subscribe", "subscribe to the channel", "subscribe to our channel",
  "subscribe for more", "hit the bell", "ring the bell", "comment below", "let me know in the comments",
]);

/** Openings that lose a viewer in the first seconds (they announce instead of showing). */
const GENERIC_OPENERS = [/^in (this|today's) (video|film|documentary)\b/i, /^welcome\b/i, /^(hi|hello|hey)\b/i, /^today,? (we|i)('ll| will| are| want)\b/i, /^have you ever\b/i, /^imagine (a world|if)\b/i, /^this is the (story|tale) of\b/i, /^(so|okay|ok|alright|well),/i, /^throughout history\b/i, /^since the dawn of\b/i];
const NUMBER_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|dollars?|percent)\b/i;

/**
 * Code's look at the hook, the film's first 30 seconds, where most viewers
 * decide to stay: an opening that announces instead of showing, a hook with
 * no concrete number, name or place, and a first sentence too long to land.
 * @param {SceneLine[]} scenes the first chapter's scenes
 * @returns {Finding[]}
 */
export function hookFindings(scenes) {
  /** @type {Finding[]} */
  const out = [];
  const first = scenes.find((s) => !s.wordless && s.narration.trim());
  if (!first) return out;
  const opener = first.narration.replace(/\[[^\]]*\]/g, "").trim();
  if (GENERIC_OPENERS.some((re) => re.test(opener))) out.push({ code: "hook-generic-opener", scene: first.sc, detail: `The film opens with "${opener.slice(0, 50)}": open on the event, the number or the person instead.` });
  const hook = scenes.filter((s) => s.start < 30 && !s.wordless).map((s) => s.narration.replace(/\[[^\]]*\]/g, "")).join(" ");
  const named = hook.split(/(?<=[.!?])\s+/).some((sentence) => sentence.split(/\s+/).slice(1).some((w) => /^[A-Z][\p{L}'’-]{2,}/u.test(w) && !/^(I|I'm|I've|I'd)$/.test(w)));
  if (hook && !/\d/.test(hook) && !NUMBER_WORDS.test(hook) && !named) out.push({ code: "hook-vague", scene: first.sc, detail: "The first 30 seconds name no number, person or place: give the viewer one concrete detail to hold." });
  const sentence = opener.split(/(?<=[.!?])\s+/)[0] ?? "";
  if (sentence.split(/\s+/).length > 25) out.push({ code: "hook-long-sentence", scene: first.sc, detail: `The first sentence has ${sentence.split(/\s+/).length} words; a hook lands in 6 to 15.` });
  return out;
}

/** Footage hosts the production rules never allow as a source. */
export const FORBIDDEN_SOURCES = Object.freeze([
  "youtube.com", "youtu.be", "facebook.com", "fb.watch", "instagram.com", "tiktok.com", "x.com/", "twitter.com",
  "gettyimages", "shutterstock", "adobestock", "stock.adobe", "pond5", "storyblocks",
]);

/** Fields every scene line must carry. */
export const REQUIRED_FIELDS = Object.freeze(["NARR", "ANCHOR", "SHOTS", "LOOK"]);

const LINE = /^\s*(?:\*\*)?SC(\d{4,5})(?:\*\*)?\s*\|\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*[-–]\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)\s*\|(.*)$/;
const FIELD = /^([A-Z][A-Z0-9]*(?: [A-Z0-9]+)?):\s?(.*)$/s;
const PLACEHOLDER = /\$?\[C\d{2,3}[^\]]*\]/g;

/**
 * A claim tag closes each narrated sentence in a true-story film:
 * "{C01}" or "{C01, C02}" for a sentence that rests on ledger claims, "{N}"
 * for one that states nothing factual (a question, a transition, commentary).
 * Tags are never spoken: the parser removes them from the narration.
 */
const CLAIM_TAG = /\{([^{}\n]*)\}/g;

/** Words a period follows without ending a sentence. */
const ABBREVIATIONS = /(?:^|\s)(?:Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|Gen|Col|Capt|Lt|Sgt|Rev|Gov|Sen|Rep|Pres|Inc|Ltd|Co|Corp|vs|etc|approx|No|Vol|Fig|[A-Z])\.$|(?:[A-Za-z]\.){2,}$/;

/**
 * Sentences of a narration text. A boundary is ., ! or ? (with any closing
 * quote or bracket) before a space, except after an abbreviation or an initial.
 * Splitting prose is never perfect; this errs towards fewer, longer sentences.
 * @param {string} text
 */
export function splitSentences(text) {
  const out = [];
  let start = 0;
  for (const m of text.matchAll(/[.!?…]+["”’)\]]*(?=\s+\S)/g)) {
    const end = /** @type {number} */ (m.index) + m[0].length;
    if (/^\.+$/.test(m[0]) && ABBREVIATIONS.test(text.slice(start, /** @type {number} */ (m.index) + 1).trim())) continue;
    const s = text.slice(start, end).trim();
    if (s) out.push(s);
    start = end;
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * @typedef {{ text: string, tag: string | null, claims: string[], none: boolean, valid: boolean }} Sentence
 */

/**
 * A NARR text split into its sentences with their claim tags, and the
 * narration without tags (what is spoken). A tag belongs to the one sentence
 * it follows; any other sentence before it has no tag.
 * @param {string} narr
 * @returns {{ text: string, sentences: Sentence[] }}
 */
export function narrationSentences(narr) {
  /** @type {Sentence[]} */
  const sentences = [];
  const untagged = (/** @type {string} */ chunk) => { for (const s of splitSentences(chunk)) sentences.push({ text: s, tag: null, claims: [], none: false, valid: false }); };
  let at = 0;
  for (const m of narr.matchAll(CLAIM_TAG)) {
    const parts = splitSentences(narr.slice(at, m.index));
    at = /** @type {number} */ (m.index) + m[0].length;
    const last = parts.pop();
    for (const s of parts) sentences.push({ text: s, tag: null, claims: [], none: false, valid: false });
    const inner = m[1].trim();
    const none = /^N$/i.test(inner);
    const ids = inner.split(/[\s,;]+/).filter(Boolean);
    const valid = none || (ids.length > 0 && ids.every((id) => /^C\d{2,3}$/.test(id)));
    // A tag with no sentence before it (two tags in a row) tags nothing: it is reported as invalid.
    sentences.push({ text: last ?? "", tag: m[0], claims: valid && !none ? ids : [], none, valid: valid && Boolean(last) });
  }
  untagged(narr.slice(at));
  // Narration without tags is returned exactly as written.
  if (!at) return { text: narr, sentences };
  return { text: narr.replace(CLAIM_TAG, " ").replace(/\s+([.,;:!?])/g, "$1").replace(/\s+/g, " ").trim(), sentences };
}

const MONTHS = /\b(January|February|March|April|June|July|August|September|October|November|December)\b|\bMay\s+\d|\b\d{1,2}\s+May\b/;
const NUMBER_WORD_RUN = /\b(?:zero|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion|crore|lakh|percent)\b/i;

/**
 * What in a sentence is a factual signal that needs a claim: a number (digits
 * or number words; "one" alone is not counted), a month. Names need the
 * film's known entities and are read by the claims gate.
 * @param {string} text
 */
export function factualSignals(text) {
  const clean = text.replace(PLACEHOLDER, " ");
  /** @type {string[]} */
  const out = [];
  const digits = clean.match(/\d[\d,.:]*/);
  if (digits) out.push(digits[0].replace(/[.,:]+$/, ""));
  const word = NUMBER_WORD_RUN.exec(clean);
  if (word) out.push(word[0]);
  const month = MONTHS.exec(clean);
  if (month) out.push(month[0]);
  return out;
}

/**
 * Claim linkage of narrated sentences, for a true-story film: every sentence
 * carries a valid tag, and a sentence tagged {N} states no number or date.
 * The ledger itself (does the claim exist, is it resolved) is the claims gate's job.
 * @param {SceneLine[]} scenes
 * @returns {Finding[]}
 */
export function linkFindings(scenes) {
  /** @type {Finding[]} */
  const out = [];
  for (const s of scenes) {
    if (s.wordless) continue;
    for (const x of s.sentences) {
      const quote = `"${x.text.slice(0, 80)}${x.text.length > 80 ? "..." : ""}"`;
      if (!x.tag) out.push({ code: "claim-untagged", scene: s.sc, detail: `${quote} has no claim tag: end it with {C..} for the ledger claims it states, or {N} if it states nothing factual.` });
      else if (!x.valid) out.push({ code: "claim-tag-invalid", scene: s.sc, detail: `The tag ${x.tag}${x.text ? ` after ${quote}` : ""} is not {C01}, {C01, C02} or {N}, or follows no sentence.` });
      else if (x.none && factualSignals(x.text).length) out.push({ code: "claim-n-factual", scene: s.sc, detail: `${quote} is tagged {N} (nothing factual) but states ${factualSignals(x.text).join(", ")}: tag it with its ledger claim.` });
    }
  }
  return out;
}

/**
 * "1:02:03" or "0:00:07.4" to seconds.
 * @param {string} t
 */
export function toSeconds(t) {
  const parts = t.split(":").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return NaN;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

/** @param {number} s */
export function toClock(s) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Count the words a narrator will read. A dollar placeholder such as
 * "[C12 low]" is read as one number, so it counts as one word.
 * @param {string} narration
 */
export function countWords(narration) {
  const text = narration.trim();
  if (!text || /^\(wordless\)/i.test(text)) return 0;
  return text.replace(PLACEHOLDER, "N").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * @typedef {{
 *   id: number, sc: string, start: number, end: number, seconds: number,
 *   fields: Record<string, string>, positional: string[],
 *   narration: string, sentences: Sentence[], words: number, wordless: boolean, declaredTarget: number | null,
 *   r1: number, r3: number, raw: string,
 * }} SceneLine
 */

/**
 * Parse every scene line in a chapter. Lines that are not scene lines
 * (headers, tables, notes) are ignored.
 * @param {string} markdown
 * @returns {SceneLine[]}
 */
export function parseSceneLines(markdown) {
  /** @type {SceneLine[]} */
  const scenes = [];
  for (const raw of markdown.split(/\r?\n/)) {
    const m = LINE.exec(raw);
    if (!m) continue;
    const start = toSeconds(m[2]);
    const end = toSeconds(m[3]);
    /** @type {Record<string, string>} */
    const fields = {};
    /** @type {string[]} */
    const positional = [];
    for (const part of m[4].split(/\s\|\s/)) {
      const piece = part.trim();
      if (!piece) continue;
      const f = FIELD.exec(piece);
      if (f) fields[f[1]] = f[2].trim();
      else positional.push(piece);
    }
    // A scripted alternative ("· ALT if LEAD-02 fails: ...") is not read as well.
    // Claim tags are removed from what is spoken and kept per sentence.
    const { text: narration, sentences } = narrationSentences((fields.NARR ?? "").split(/\s·\s*ALT\b/)[0].trim());
    const words = countWords(narration);
    const declared = /^W\s+(\d+)\s*\/\s*([\d.]+)/.exec(positional.find((p) => /^W\s+\d/.test(p)) ?? "");
    const ev = /R1\s*(\d+)\s*\/\s*R3\s*(\d+)/.exec(fields.EV ?? "");
    scenes.push({
      id: Number(m[1]), sc: "SC" + m[1], start, end, seconds: end - start, fields, positional,
      narration, sentences: words === 0 ? [] : sentences, words, wordless: words === 0, declaredTarget: declared ? Number(declared[2]) : null,
      r1: ev ? Number(ev[1]) : 0, r3: ev ? Number(ev[2]) : 0, raw,
    });
  }
  return scenes;
}

/**
 * @typedef {{ code: string, scene?: string, detail: string }} Finding
 * @typedef {{
 *   startSeconds: number, endSeconds: number, firstScene: number, lastScene: number,
 *   versionId?: string, wpm?: number, sceneTolerance?: number, totalTolerance?: number, linkClaims?: boolean,
 * }} ChapterSpec
 */

/**
 * Check one chapter against its slot in the S3 plan.
 * @param {string} markdown
 * @param {ChapterSpec} spec
 */
export function checkChapter(markdown, spec) {
  const versionId = spec.versionId ?? "en-US";
  const version = getVersion(versionId);
  if (!version) throw new Error(`Unknown version "${versionId}".`);
  const wps = (spec.wpm ?? version.narrationWpm.target) / 60;
  const sceneTol = spec.sceneTolerance ?? 0.15;
  const totalTol = spec.totalTolerance ?? 0.05;
  /** @type {Finding[]} */
  const errors = [];
  /** @type {Finding[]} */
  const warnings = [];
  const scenes = parseSceneLines(markdown);

  if (/<!--\s*CONTINUE\s*-->/.test(markdown)) errors.push({ code: "unfinished", detail: "The chapter still ends with a CONTINUE marker." });
  if (scenes.length === 0) {
    errors.push({ code: "no-scenes", detail: "No compact scene lines were found." });
    return { ok: false, errors, warnings, scenes, stats: emptyStats() };
  }

  // IDs: contiguous, unique, inside the chapter's range.
  const expectedCount = spec.lastScene - spec.firstScene + 1;
  if (scenes[0].id !== spec.firstScene) errors.push({ code: "first-scene", scene: scenes[0].sc, detail: `Starts at ${scenes[0].sc}, expected SC${pad(spec.firstScene)}.` });
  if (scenes[scenes.length - 1].id !== spec.lastScene) errors.push({ code: "last-scene", scene: scenes[scenes.length - 1].sc, detail: `Ends at ${scenes[scenes.length - 1].sc}, expected SC${pad(spec.lastScene)}.` });
  if (scenes.length !== expectedCount) errors.push({ code: "scene-count", detail: `${scenes.length} scenes, expected ${expectedCount}.` });

  // Clock: tiles the chapter exactly.
  if (Math.abs(scenes[0].start - spec.startSeconds) > 0.05) errors.push({ code: "clock-start", scene: scenes[0].sc, detail: `Starts at ${toClock(scenes[0].start)}, expected ${toClock(spec.startSeconds)}.` });
  const last = scenes[scenes.length - 1];
  if (Math.abs(last.end - spec.endSeconds) > 0.05) errors.push({ code: "clock-end", scene: last.sc, detail: `Ends at ${toClock(last.end)}, expected ${toClock(spec.endSeconds)}.` });

  for (let i = 0; i < scenes.length; i += 1) {
    const s = scenes[i];
    if (!Number.isFinite(s.start) || !Number.isFinite(s.end) || s.end <= s.start) errors.push({ code: "clock-range", scene: s.sc, detail: "The timecode range is empty or reversed." });
    if (i > 0) {
      const p = scenes[i - 1];
      if (s.id !== p.id + 1) errors.push({ code: "scene-id", scene: s.sc, detail: `Follows ${p.sc}; IDs must be contiguous.` });
      if (Math.abs(s.start - p.end) > 0.05) errors.push({ code: "clock-gap", scene: s.sc, detail: `Starts at ${toClock(s.start)} but ${p.sc} ends at ${toClock(p.end)}.` });
    }
    for (const f of REQUIRED_FIELDS) if (!(f in s.fields)) errors.push({ code: "field-missing", scene: s.sc, detail: `No ${f} field.` });

    // Words against the scene's own time. A declared lower target is accepted
    // only when a silence inside the scene explains it (at most 30% less).
    if (!s.wordless) {
      const byTime = s.seconds * wps;
      const target = s.declaredTarget && s.declaredTarget < byTime && s.declaredTarget >= byTime * 0.7 ? s.declaredTarget : byTime;
      const off = s.words / target - 1;
      if (Math.abs(off) > sceneTol) errors.push({ code: "scene-words", scene: s.sc, detail: `${s.words} words for ${round1(s.seconds)} s (target ${Math.round(target)}, ${pct(off)}).` });
      else if (Math.abs(off) > 0.1) warnings.push({ code: "scene-words", scene: s.sc, detail: `${s.words} words for ${round1(s.seconds)} s (${pct(off)}).` });
    }

    // Banned phrases and forbidden sources.
    if (versionId === "en-US") {
      const lower = s.narration.toLowerCase();
      for (const phrase of BANNED_EN) {
        if (new RegExp(`\\b${escape(phrase)}\\b`).test(lower)) errors.push({ code: "banned-phrase", scene: s.sc, detail: `"${phrase}" in narration.` });
      }
    }
    const src = (s.fields.SRC ?? "").toLowerCase();
    for (const host of FORBIDDEN_SOURCES) if (src.includes(host)) errors.push({ code: "forbidden-source", scene: s.sc, detail: `Source names ${host}.` });
  }

  // Whole-chapter word budget and language purity.
  const narrated = scenes.filter((s) => !s.wordless);
  const narratedSeconds = narrated.reduce((a, s) => a + s.seconds, 0);
  const words = narrated.reduce((a, s) => a + s.words, 0);
  const targetWords = Math.round(narratedSeconds * wps);
  const drift = targetWords ? words / targetWords - 1 : 0;
  if (targetWords && Math.abs(drift) > totalTol) errors.push({ code: "chapter-words", detail: `${words} words vs ${targetWords} target (${pct(drift)}).` });
  const allNarration = narrated.map((s) => s.narration.replace(PLACEHOLDER, "")).join(" ");
  if (allNarration.trim()) {
    const purity = checkVersionPurity(allNarration, versionId);
    for (const p of purity.problems) errors.push({ code: "version-purity", detail: p });
  }
  // True-story films: every narrated sentence is linked to its claims, so an edit that drops a tag fails here.
  if (spec.linkClaims) errors.push(...linkFindings(scenes));

  const placeholders = [...new Set(scenes.flatMap((s) => s.raw.match(PLACEHOLDER) ?? []))];
  const stats = {
    scenes: scenes.length, words, targetWords, drift, narratedSeconds,
    wordlessSeconds: scenes.filter((s) => s.wordless).reduce((a, s) => a + s.seconds, 0),
    r1: scenes.reduce((a, s) => a + s.r1, 0), r3: scenes.reduce((a, s) => a + s.r3, 0), placeholders,
  };
  return { ok: errors.length === 0, errors, warnings, scenes, stats };
}

/**
 * Check a whole film: chapters tile the runtime with contiguous scene IDs,
 * and every loop that opens is paid.
 * @param {{ id: string, markdown: string, spec: ChapterSpec }[]} chapters
 * @param {{ durationSeconds: number }} film
 */
export function checkFilm(chapters, film) {
  /** @type {Finding[]} */
  const errors = [];
  /** @type {Finding[]} */
  const warnings = [];
  const results = chapters.map((c) => ({ id: c.id, ...checkChapter(c.markdown, c.spec) }));
  for (const r of results) {
    for (const e of r.errors) errors.push({ ...e, detail: `${r.id}: ${e.detail}` });
    for (const w of r.warnings) warnings.push({ ...w, detail: `${r.id}: ${w.detail}` });
  }
  const all = results.flatMap((r) => r.scenes);
  if (all.length) {
    if (all[0].start !== 0) errors.push({ code: "film-start", detail: `The film starts at ${toClock(all[0].start)}.` });
    if (Math.abs(all[all.length - 1].end - film.durationSeconds) > 0.05) errors.push({ code: "film-end", detail: `The film ends at ${toClock(all[all.length - 1].end)}, expected ${toClock(film.durationSeconds)}.` });
    for (let i = 1; i < all.length; i += 1) {
      if (all[i].id !== all[i - 1].id + 1 && results.some((r) => r.scenes[0] === all[i])) errors.push({ code: "film-scene-id", scene: all[i].sc, detail: `Chapter starts at ${all[i].sc} after ${all[i - 1].sc}.` });
      if (Math.abs(all[i].start - all[i - 1].end) > 0.05 && results.some((r) => r.scenes[0] === all[i])) errors.push({ code: "film-clock", scene: all[i].sc, detail: `Chapter starts at ${toClock(all[i].start)} after ${toClock(all[i - 1].end)}.` });
    }
  }
  const text = chapters.map((c) => c.markdown).join("\n");
  const opened = loopIds(text, /\bopen(?:s|ed)?\b([^.|;\n]{0,40})/gi, /\b(L\d{2})\s+open(?:s|ed)\b/gi);
  const paid = loopIds(text, /\b(?:pays?|paid)\b([^.|;\n]{0,40})/gi, /\b(L\d{2})\s+(?:paid|pays)\b/gi);
  for (const l of opened) if (!paid.has(l)) errors.push({ code: "loop-unpaid", detail: `Loop ${l} opens but is never paid.` });
  const sum = (/** @type {"words"|"targetWords"|"r1"|"r3"|"narratedSeconds"|"scenes"} */ k) => results.reduce((a, r) => a + r.stats[k], 0);
  const stats = {
    scenes: sum("scenes"), words: sum("words"), targetWords: sum("targetWords"), narratedSeconds: sum("narratedSeconds"),
    r1: sum("r1"), r3: sum("r3"), loopsOpened: [...opened].sort(), loopsPaid: [...paid].sort(),
    placeholders: [...new Set(results.flatMap((r) => r.stats.placeholders))],
    chapters: results.map((r) => ({ id: r.id, ok: r.ok, ...r.stats, errors: r.errors.length, warnings: r.warnings.length })),
  };
  return { ok: errors.length === 0, errors, warnings, stats };
}

/**
 * Apply find/replace fixes mechanically. A fix applies only when its find
 * text occurs exactly once, so a fix can never land in the wrong place.
 * @param {string} text
 * @param {{ find: string, replace: string }[]} fixes
 */
export function applyFixes(text, fixes) {
  let out = text;
  /** @type {{ find: string, status: "applied" | "not-found" | "ambiguous" | "invalid" }[]} */
  const log = [];
  for (const fix of fixes) {
    if (typeof fix?.find !== "string" || typeof fix?.replace !== "string" || !fix.find) {
      log.push({ find: String(fix?.find ?? "").slice(0, 80), status: "invalid" });
      continue;
    }
    const count = out.split(fix.find).length - 1;
    if (count === 1) {
      out = out.replace(fix.find, () => fix.replace);
      log.push({ find: fix.find.slice(0, 80), status: "applied" });
    } else log.push({ find: fix.find.slice(0, 80), status: count === 0 ? "not-found" : "ambiguous" });
  }
  return { text: out, log };
}

/**
 * Loop IDs named after a verb ("opens L01 and L02") or before it ("L01 PAID").
 * @param {string} text
 * @param {RegExp} after
 * @param {RegExp} before
 */
function loopIds(text, after, before) {
  const ids = new Set();
  for (const m of text.matchAll(after)) for (const l of m[1].matchAll(/\bL\d{2}\b/g)) ids.add(l[0]);
  for (const m of text.matchAll(before)) ids.add(m[1].toUpperCase());
  return ids;
}

function emptyStats() {
  return { scenes: 0, words: 0, targetWords: 0, drift: 0, narratedSeconds: 0, wordlessSeconds: 0, r1: 0, r3: 0, placeholders: /** @type {string[]} */ ([]) };
}
/** @param {number} n */
function pad(n) { return String(n).padStart(4, "0"); }
/** @param {number} n */
function pct(n) { return (n >= 0 ? "+" : "") + (n * 100).toFixed(1) + "%"; }
/** @param {number} n */
function round1(n) { return Math.round(n * 10) / 10; }
/** @param {string} s */
function escape(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
