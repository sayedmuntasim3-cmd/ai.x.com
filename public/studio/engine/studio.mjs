/**
 * The studio's first screen, as pure functions: read an idea typed in any
 * language (spelling mistakes included) and plan the film; read a voice
 * recording's measurements and plan the voice. Runs in the browser with no
 * server and no API keys; the model-based agents refine these plans later.
 */
import { normalizeArabic } from "./arabic.mjs";
import { classifyInput, detectLanguage } from "./content-intel.mjs";
import { planRetention } from "./documentary-engine-core.mjs";
import { FORMATS, getFormat, suggestFormat } from "./formats.mjs";
import { gainToTarget } from "./loudness.mjs";
import { planRun } from "./pipeline.mjs";
import { FICTION_LABELS, planStory } from "./story-mode.mjs";
import { toAsciiDigits } from "./text-scripts.mjs";
import { VERSION_IDS, getVersion, narrationWordBudget } from "./versions.mjs";
import { ELEVENLABS_MODELS, MASTER, musicPlanFor, planVoice } from "./voice-plan.mjs";

/**
 * @typedef {import("./versions.mjs").VersionId} VersionId
 * @typedef {import("./voice-plan.mjs").ContentType} ContentType
 * @typedef {import("./loudness.mjs").RecordingAnalysis} RecordingAnalysis
 * @typedef {import("./formats.mjs").FilmFormat} FilmFormat
 * @typedef {{ from: string, to: string }} Correction
 * @typedef {"good" | "ok" | "bad" | "info"} Level
 */

// English words the classifier and the format cues look for. A typed word
// one or two letters away from one of these is read as that word.
const VOCAB = [
  "story", "stories", "movie", "film", "films", "fiction", "fictional", "imagine", "tale", "documentary", "biography",
  "history", "true", "real", "life", "prophet", "prophets", "companion", "companions", "sahaba", "dragon", "dragons",
  "magic", "magical", "wizard", "alien", "aliens", "monster", "monsters", "unicorn", "superpower", "superpowers", "fairy",
  "economy", "inflation", "interest", "country", "countries", "money", "billionaire", "millionaire", "rolls", "royce",
  "broke", "rags", "prison", "forbidden", "cave", "island", "journey", "river", "road", "deadliest", "minutes", "world",
  "war", "colour", "color", "scam", "exposed", "terrifying", "secret", "mystery", "unsolved", "disappear", "disappeared",
  "conspiracy", "universe", "origin", "evolution", "science", "antarctica", "motivation", "motivational", "struggle",
  "perspective", "survived", "ambush", "allah", "quran", "muhammad", "hadith", "islam", "islamic", "salah", "surah",
  "mosque", "ramadan", "sunnah", "muslim", "muslims", "bankrupt", "dollar", "dollars", "million", "billion", "thousand",
  "really", "under", "about", "biggest", "greatest", "world's",
];
const VOCAB_SET = new Set(VOCAB);

// Real words that sit one or two letters from a cue word; never "corrected".
const KEEP = new Set([
  "store", "stork", "storm", "stores", "storied", "fills", "align", "honey", "monkey", "rider", "rivet", "liver",
  "journal", "historic", "mastery", "universal", "sacred", "snuggle", "poison", "inland", "county", "counter",
  "broken", "broker", "brake", "brook", "roles", "minister", "master", "mobster", "fairly", "friction", "faction",
  "imaging", "colon", "sarah", "salad", "prophecy", "companies", "mission", "internet", "secrete", "monies",
  "islands", "rival", "roads", "mosques", "realm", "reals", "trues", "magi", "world's", "film's",
]);

/**
 * Words in Bangla (also typed in English letters, "Banglish") and Arabic
 * mapped to the English cue the format and fact rules understand.
 * Bangla and Arabic keys are matched on normalised spellings, so common
 * spelling variants (ী/ি, ূ/ু, শ/ষ/স, ة/ه, أ/ا) still match.
 * @type {[string, string][]}
 */
const BANGLA = [
  ["গল্প", "story"], ["কাহিনী", "story"], ["সত্য ঘটনা", "true story"], ["সত্যি ঘটনা", "true story"], ["বাস্তব", "real story"],
  ["জীবনী", "biography"], ["জীবন", "life of"], ["ইতিহাস", "history of"], ["বিশ্বযুদ্ধ", "world war"], ["যুদ্ধ", "war"],
  ["রহস্য", "mystery"], ["নিখোঁজ", "disappear"], ["ষড়যন্ত্র", "conspiracy"], ["জেল", "prison"], ["কারাগার", "prison"],
  ["গুহা", "cave"], ["দ্বীপ", "island nobody"], ["যাত্রা", "journey"], ["সফর", "journey"], ["নদী", "river"], ["রাস্তা", "road"],
  ["অর্থনীতি", "economy"], ["মুদ্রাস্ফীতি", "inflation"], ["দেশ", "country"], ["কোটিপতি", "millionaire"], ["বিলিয়নিয়ার", "billionaire"],
  ["গরিব", "broke"], ["প্রতারণা", "scam"], ["স্ক্যাম", "scam"], ["গোপন", "secret of"], ["মহাবিশ্ব", "universe"], ["বিজ্ঞান", "science"],
  ["বিবর্তন", "evolution"], ["উৎপত্তি", "origin"], ["সংগ্রাম", "struggle"], ["স্ট্রাগল", "struggle"], ["অনুপ্রেরণা", "motivation"],
  ["মোটিভেশন", "motivation"], ["ড্রাগন", "dragon"], ["জাদু", "magic"], ["যাদু", "magic"], ["এলিয়েন", "alien"], ["ডলার", "$1"], ["টাকা", "$1"],
];
/** @type {[string, string][]} */
const BANGLISH = [
  ["golpo", "story"], ["kahini", "story"], ["sotti ghotona", "true story"], ["sottho ghotona", "true story"], ["sotto ghotona", "true story"],
  ["jiboni", "biography"], ["itihas", "history of"], ["juddho", "war"], ["rohossho", "mystery"], ["rohosso", "mystery"],
  ["kotipoti", "millionaire"], ["gorib", "broke"], ["taka", "$1"], ["nobi", "prophet"], ["nabi", "prophet"], ["rasul", "prophet"],
  ["sahabi", "sahaba"], ["kuran", "quran"], ["koran", "quran"], ["hadis", "hadith"], ["namaj", "salah"], ["namaz", "salah"],
  ["jadu", "magic"], ["biggan", "science"], ["jatra", "journey"], ["dorja", "door"], ["sopno", "dream"], ["chele", "boy"], ["meye", "girl"],
];
/** @type {[string, string][]} */
const ARABIC = [
  ["قصة", "story"], ["حكاية", "story"], ["قصة حقيقية", "true story"], ["وثائقي", "documentary"], ["سيرة", "biography"],
  ["تاريخ", "history of"], ["حرب عالمية", "world war"], ["حرب", "war"], ["لغز", "mystery"], ["غموض", "mystery"], ["اختفاء", "disappear"],
  ["مؤامرة", "conspiracy"], ["سجن", "prison"], ["كهف", "cave"], ["جزيرة", "island nobody"], ["رحلة", "journey"], ["نهر", "river"],
  ["طريق", "road"], ["اقتصاد", "economy"], ["تضخم", "inflation"], ["دولة", "country"], ["مليونير", "millionaire"], ["ملياردير", "billionaire"],
  ["فقير", "broke"], ["احتيال", "scam"], ["سر", "secret of"], ["الكون", "universe"], ["علم", "science"], ["تطور", "evolution"],
  ["أصل", "origin"], ["كفاح", "struggle"], ["تحفيز", "motivation"], ["تنين", "dragon"], ["سحر", "magic"], ["دولار", "$1"],
];

const BANGLA_SUFFIXES = ["গুলোর", "গুলো", "দের", "য়ের", "ময়", "এর", "ের", "টার", "টা", "টি", "তে", "কে", "য়", "র", "ে"].map((s) => s.normalize("NFC"));

/** Bangla spellings people mix up, folded to one form for matching. @param {string} s */
function foldBangla(s) {
  return s.normalize("NFC")
    .replace(/[ীি]/g, "ি").replace(/[ূু]/g, "ু").replace(/ঈ/g, "ই").replace(/ঊ/g, "উ")
    .replace(/[শষ]/g, "স").replace(/ণ/g, "ন").replace(/য়/g, "য").replace(/[ড়ঢ়]/g, "র").replace(/ৎ/g, "ত")
    .replace(/\u09CD/g, "").replace(/\u200C|\u200D/g, "");
}

/**
 * Optimal string alignment distance (a transposition counts as one edit).
 * @param {string} a
 * @param {string} b
 */
export function editDistance(a, b) {
  const A = [...a];
  const B = [...b];
  /** @type {number[][]} */
  const d = Array.from({ length: A.length + 1 }, (_, i) => [i, ...Array(B.length).fill(0)]);
  for (let j = 1; j <= B.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= A.length; i += 1) {
    for (let j = 1; j <= B.length; j += 1) {
      const cost = A[i - 1] === B[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && A[i - 1] === B[j - 2] && A[i - 2] === B[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[A.length][B.length];
}

/**
 * The closest word in a list, when it is close enough and the only one that close.
 * @param {string} word
 * @param {readonly string[]} list
 * @param {(s: string) => string} [fold]
 */
function closest(word, list, fold = (s) => s) {
  const w = fold(word);
  const length = [...w].length;
  if (length < 4) return null;
  const limit = length >= 7 ? 2 : 1;
  let best = null;
  let bestDistance = Infinity;
  let tie = false;
  for (const candidate of list) {
    const c = fold(candidate);
    // A word that starts another ("road"/"roads", "জেল"/"জেলা") is a different word, not a typo.
    if ([...c][0] !== [...w][0] || Math.abs([...c].length - length) > limit || c.startsWith(w) || w.startsWith(c)) continue;
    const distance = editDistance(w, c);
    if (distance < bestDistance) { best = candidate; bestDistance = distance; tie = false; }
    else if (distance === bestDistance && candidate !== best) tie = true;
  }
  return best !== null && bestDistance <= limit && !tie ? { word: best, distance: bestDistance } : null;
}

const BANGLA_WORDS = [...new Set(BANGLA.flatMap(([key]) => key.split(" ")).map((s) => s.normalize("NFC")))].filter((s) => [...s].length >= 3);
const ARABIC_WORDS = [...new Set(ARABIC.flatMap(([key]) => normalizeArabic(key).split(" ")))].filter((s) => s.length >= 3);

/**
 * Read a typed idea: fix spelling mistakes in the words the planner relies
 * on (in English, Banglish, Bangla and Arabic), find the language, and list
 * the English cues its Bangla or Arabic words carry. Every change is
 * reported, so nothing is silently rewritten.
 * @param {string} text
 */
export function readIdea(text) {
  const original = String(text ?? "").normalize("NFC");
  /** @type {Correction[]} */
  const corrections = [];
  const banglishList = BANGLISH.flatMap(([key]) => key.split(" "));

  let fixed = original.replace(/[A-Za-z][A-Za-z']*/g, (token) => {
    const lower = token.toLowerCase();
    if (VOCAB_SET.has(lower) || KEEP.has(lower) || banglishList.includes(lower)) return token;
    const hit = closest(lower, VOCAB) ?? closest(lower, banglishList);
    if (!hit) return token;
    corrections.push({ from: token, to: hit.word });
    return token[0] === token[0].toUpperCase() ? hit.word[0].toUpperCase() + hit.word.slice(1) : hit.word;
  });

  fixed = fixed.replace(/[\u0980-\u09FF\u200C\u200D]+/g, (token) => {
    const suffix = BANGLA_SUFFIXES.find((x) => token.endsWith(x) && [...token].length - [...x].length >= 2) ?? "";
    const stem = suffix ? token.slice(0, -suffix.length) : token;
    /** @type {[string, string][]} */
    const splits = suffix ? [[token, ""], [stem, suffix]] : [[token, ""]];
    for (const [part, rest] of splits) {
      const same = BANGLA_WORDS.find((w) => foldBangla(w) === foldBangla(part));
      if (same === part) return token;
      if (same) { corrections.push({ from: token, to: same + rest }); return same + rest; }
    }
    const hit = closest(stem, BANGLA_WORDS, foldBangla);
    if (!hit) return token;
    corrections.push({ from: token, to: hit.word + suffix });
    return hit.word + suffix;
  });

  fixed = fixed.replace(/[\u0600-\u06FF]+/g, (token) => {
    const n = normalizeArabic(token);
    const bare = n.replace(/^(وال|بال|فال|لل|ال|و|ف|ب)(?=.{3})/, "");
    if (ARABIC_WORDS.includes(n) || ARABIC_WORDS.includes(bare)) return token;
    const hit = closest(bare, ARABIC_WORDS);
    if (!hit || bare.length < 4) return token;
    const prefix = n.slice(0, n.length - bare.length);
    corrections.push({ from: token, to: prefix + hit.word });
    return prefix + hit.word;
  });

  const lowerFixed = " " + fixed.toLowerCase().replace(/[^a-z'\s]/g, " ").replace(/\s+/g, " ") + " ";
  const foldedFixed = foldBangla(fixed);
  const banglaTokens = foldedFixed.split(/[^\u0980-\u09FF]+/).filter(Boolean);
  const foldedSuffixes = BANGLA_SUFFIXES.map(foldBangla);
  /** A Bangla key as a whole word, with a case ending, or (when long) as a word's start. @param {string} key */
  const banglaHas = (key) => {
    const k = foldBangla(key);
    if (key.includes(" ")) return foldedFixed.includes(k);
    return banglaTokens.some((t) => t === k || ([...k].length >= 5 ? t.startsWith(k) : foldedSuffixes.some((x) => t === k + x)));
  };
  const arabicFixed = " " + normalizeArabic(fixed) + " ";
  /** @type {string[]} */
  const cues = [];
  for (const [key, cue] of BANGLA) if (banglaHas(key)) cues.push(cue);
  for (const [key, cue] of ARABIC) {
    const k = normalizeArabic(key);
    if (arabicFixed.includes(" " + k + " ") || arabicFixed.includes(" ال" + k + " ") || arabicFixed.includes(" و" + k + " ")) cues.push(cue);
  }
  const banglishHits = BANGLISH.filter(([key]) => lowerFixed.includes(" " + key + " "));
  for (const [, cue] of banglishHits) cues.push(cue);

  const { language } = detectLanguage(fixed);
  const romanizedBangla = language === "en" && banglishHits.length >= 2;
  return {
    original,
    fixed,
    corrections,
    language: romanizedBangla ? "bn-latin" : language,
    cues: [...new Set(cues)],
    cueText: toAsciiDigits(fixed) + " " + [...new Set(cues)].join(" "),
  };
}

const NOT_NAMES = new Set(["I", "Allah", "Quran", "Islam", "Islamic", "Prophet", "Muslim", "Muslims", "Rolls", "Royce", "Rolls-Royce", "God", "Ramadan", "Hadith", "Sunnah", "Surah", "America", "American", "USA", "US", "Bangladesh", "Arab", "Arabic", "English", "Bangla", "World", "War", "WW2", "Antarctica", "Earth", "Moon", "Mars", "NASA", "Dhaka", "Makkah", "Madinah", "Mecca", "Medina"]);

/**
 * Capitalised words in the middle of an English sentence: possible names
 * of real people, which an invented story must never use.
 * @param {string} text
 */
export function possibleNames(text) {
  /** @type {string[]} */
  const names = [];
  for (const sentence of String(text).split(/[.!?\n]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean);
    words.forEach((word, i) => {
      const clean = word.replace(/[^A-Za-z'-]/g, "").replace(/'s$/, "");
      if (!(i > 0 && /^[A-Z][a-z]{2,}/.test(clean) && !NOT_NAMES.has(clean) && !VOCAB_SET.has(clean.toLowerCase()))) return;
      const before = words[i - 1].replace(/[^A-Za-z'-]/g, "");
      const last = names.length ? names[names.length - 1] : "";
      if (last && last.split(" ").pop() === before) names[names.length - 1] = last + " " + clean;
      else names.push(/^[A-Z][a-z]+$/.test(before) && !NOT_NAMES.has(before) ? before + " " + clean : clean);
    });
  }
  return [...new Set(names)];
}

/** Formats about real places, events and questions: never invented. */
const FACTUAL_FORMATS = ["true-story-reenactment", "place-nobody-can-visit", "deadliest-journey", "history-epic", "history-in-minutes", "other-side", "dark-business-expose", "money-explainer", "big-question-science", "mystery-investigation"];

/**
 * @param {FilmFormat} format
 * @param {number} durationSeconds
 */
function documentaryBeats(format, durationSeconds) {
  const r = planRetention(durationSeconds);
  const n = format.beats.length;
  const span = Math.max(0, r.payoffStartsAt - r.hookEndsAt);
  return {
    beats: [
      { id: "hook", atSeconds: 0, purpose: format.hook },
      ...format.beats.map((purpose, i) => ({ id: "beat-" + (i + 1), atSeconds: Math.round(r.hookEndsAt + (n > 1 ? (i * span) / (n - 1) : 0)), purpose })),
    ],
    reHooks: r.beats.filter((b) => b.kind === "segment-reset").map((b) => b.atSeconds),
    creditsSeconds: r.creditsSeconds,
  };
}

/**
 * Plan a film from a typed idea or topic: what kind of film it is, the
 * format, the story beats, and the plan for each of the three versions
 * (Arabic for an Islamic outlook, English for the USA, Bangla), each written
 * natively. No step waits for a human; the owner publishes.
 * @param {{ text: string, mode?: "auto" | "documentary" | "story", minutes?: number | null }} input
 */
export function planIdea({ text, mode = "auto", minutes = null }) {
  if (!String(text ?? "").trim()) throw new Error("Type an idea or a topic first.");
  const reading = readIdea(text);
  const auto = classifyInput({ text: reading.fixed + "\n" + reading.cues.join(" ") });
  const prophetic = auto.reasons.some((r) => r.startsWith("It is about a prophet"));
  /** @type {string[]} */
  const notices = [];

  const closestStyle = suggestFormat(reading.cueText) ?? FORMATS[0];
  let filmMode = auto.mode;
  /** @type {ContentType} */
  let contentType = auto.contentType;
  // A short topic with no story cue that fits a factual format ("what is under
  // Antarctica", "the mystery of the Bermuda Triangle") is a documentary.
  if (mode === "auto" && auto.mode === "story" && auto.confidence === "low" && FACTUAL_FORMATS.includes(closestStyle.id)) {
    filmMode = "documentary";
    contentType = auto.islamic ? "islamic" : "documentary";
    notices.push("factual-topic");
  }
  if (mode === "story" && auto.mode !== "story") {
    if (prophetic) notices.push("prophet-never-fiction");
    else { filmMode = "story"; contentType = auto.islamic ? "islamic" : "story"; }
  } else if (mode === "documentary" && auto.mode === "story") {
    filmMode = "documentary";
    contentType = auto.islamic ? "islamic" : "documentary";
  }
  const isStory = filmMode === "story";
  const names = isStory ? possibleNames(reading.fixed) : [];
  if (names.length) notices.push("names-in-story");

  const format = isStory ? getFormat("dramatized-story") ?? closestStyle : closestStyle;
  const defaultMinutes = isStory ? 10 : Math.round((2 * format.minutes[0] + format.minutes[1]) / 3);
  const chosenMinutes = Number(minutes) > 0 ? Number(minutes) : defaultMinutes;
  const durationSeconds = Math.max(15, Math.min(12 * 3600, Math.round(chosenMinutes * 60)));

  const story = isStory ? planStory({ durationSeconds, versionId: "en-US" }) : null;
  const doc = isStory ? null : documentaryBeats(format, durationSeconds);
  const beats = story ? story.beats : doc ? doc.beats : [];
  const reHooks = story ? story.reHooks : doc ? doc.reHooks : [];
  const narrationSeconds = durationSeconds - (doc ? doc.creditsSeconds : planRetention(durationSeconds).creditsSeconds);

  const versions = VERSION_IDS.map((id) => {
    const v = getVersion(id);
    if (!v) throw new Error("Unknown version " + id);
    return {
      id,
      name: v.name,
      nativeName: v.nativeName,
      audience: v.audience,
      register: v.register,
      direction: v.direction,
      fonts: v.fonts,
      currency: v.currency,
      visualRules: v.visualRules,
      narrationWords: narrationWordBudget(narrationSeconds, id),
      wordsPerMinute: v.narrationWpm.target,
      voice: { ownRecording: "cleaned only, never altered", elevenlabs: ELEVENLABS_MODELS[id].modelId },
      music: musicPlanFor({ contentType, versionId: id }),
      descriptionNote: isStory ? FICTION_LABELS[id] : null,
      onScreenLabel: false,
      writtenNatively: true,
    };
  });

  const run = planRun({ contentType, islamic: auto.islamic, needsAiVisuals: auto.needsAiVisuals, versions: VERSION_IDS, durationSeconds });
  /** @type {string[]} */
  const rules = ["legal-footage-only", "versions-native", "no-approval-step"];
  if (isStory) rules.push("no-label-on-screen", "never-real-person");
  else rules.push("every-claim-sourced");
  if (auto.islamic) rules.push("quran-verbatim", "nothing-under-quran", "no-depiction");
  if (auto.needsAiVisuals) rules.push("ai-visuals-disclosed");

  return {
    reading,
    filmMode,
    contentType,
    islamic: auto.islamic,
    needsAiVisuals: auto.needsAiVisuals,
    needsResearch: !isStory,
    confidence: mode === "auto" ? auto.confidence : "high",
    reasons: auto.reasons,
    notices,
    names,
    format: { id: format.id, name: format.name, minutes: format.minutes, hook: format.hook, beats: format.beats, visuals: format.visuals, music: format.music },
    closestStyle: isStory ? { id: closestStyle.id, name: closestStyle.name } : null,
    durationSeconds,
    beats,
    reHooks,
    versions,
    run: {
      stages: run.stages.map((s) => ({ id: s.id, title: s.title, agents: s.agents.length, perVersion: s.perVersion, gates: s.gates })),
      gates: run.gates,
      agentsUsed: run.agentsUsed,
      humanApprovalSteps: run.humanApprovalSteps,
      publishing: run.publishing,
    },
    rules,
  };
}

/**
 * Plain checks of a recording, each with a level, in the order shown.
 * @param {RecordingAnalysis} a
 * @param {{ nativeRate?: boolean, targetLufs?: number }} [options]
 */
export function recordingReport(a, options = {}) {
  const target = options.targetLufs ?? MASTER.targetLufs - 1;
  /** @type {{ id: string, value: number | null, level: Level }[]} */
  const items = [];
  items.push({ id: "duration", value: a.durationSeconds, level: a.durationSeconds < 1 ? "bad" : "good" });
  const integrated = a.integrated;
  items.push({ id: "loudness", value: integrated, level: integrated === null || integrated < -40 ? "bad" : Math.abs(integrated - target) <= 2 ? "good" : "ok" });
  items.push({ id: "true-peak", value: a.truePeakDb, level: a.truePeakDb > -1 ? "bad" : a.truePeakDb > -3 ? "ok" : "good" });
  const snr = a.snrDb;
  items.push({ id: "snr", value: snr, level: snr === null ? "info" : snr >= 25 ? "good" : snr >= 20 ? "ok" : "bad" });
  items.push({ id: "noise-floor", value: a.noiseFloorDb, level: "info" });
  items.push({ id: "clipping", value: a.clippedRuns, level: a.clippedRuns > 0 ? "bad" : "good" });
  items.push({ id: "dc-offset", value: a.dcOffset, level: Math.abs(a.dcOffset) > 0.01 ? "bad" : Math.abs(a.dcOffset) > 0.001 ? "ok" : "good" });
  items.push({ id: "sample-rate", value: a.sampleRate, level: options.nativeRate === false ? "info" : a.sampleRate >= 44100 ? "good" : a.sampleRate >= 32000 ? "ok" : "bad" });
  items.push({ id: "pauses", value: a.silenceShare, level: "info" });
  const levels = items.map((i) => i.level);
  const verdict = levels.includes("bad") ? "fix-first" : levels.includes("ok") ? "usable" : "ready";
  return { verdict, items };
}

/**
 * Everything the screen shows for an uploaded recording: the report, the
 * cleaning chain for this voice (never altered), the gain to the target,
 * and how the other two versions get their voice.
 * @param {{ analysis: RecordingAnalysis, versionId: VersionId, contentType: ContentType, nativeRate?: boolean }} input
 */
export function planRecording({ analysis, versionId, contentType, nativeRate = true }) {
  const quran = contentType === "quran_recitation";
  const targetLufs = quran ? MASTER.targetLufs : MASTER.targetLufs - 1;
  const report = recordingReport(analysis, { nativeRate, targetLufs });
  const own = planVoice({ source: "own-recording", contentType, versionId, analysis });
  const gain = gainToTarget(analysis, { targetLufs, ceilingDbtp: MASTER.ceilingDbtp });
  const others = VERSION_IDS.filter((id) => id !== versionId).map((id) => {
    if (quran) return { versionId: id, kind: /** @type {const} */ ("same-recitation"), modelId: null, blocked: null };
    const plan = planVoice({ source: "elevenlabs", contentType, versionId: id });
    return { versionId: id, kind: /** @type {const} */ ("elevenlabs"), modelId: ELEVENLABS_MODELS[id].modelId, blocked: plan.blocked };
  });
  return { report, own, gain, targetLufs, others };
}
