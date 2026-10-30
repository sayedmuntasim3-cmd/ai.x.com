/**
 * Understand what the owner gave before any agent writes a word: a Quran
 * recitation, an Islamic talk, a true-story documentary topic, a story idea
 * or a finished script; in which language; and, for an idea, the money
 * figures and goals it contains. These are deterministic rules that run
 * first and guard the model-based intake agents; they never ask the owner.
 */
import { normalizeArabic } from "./arabic.mjs";
import { scriptShares, toAsciiDigits } from "./text-scripts.mjs";

/**
 * @typedef {"recitation" | "documentary" | "story" | "own-script"} InputMode
 * @typedef {import("./voice-plan.mjs").ContentType} ContentType
 * @typedef {import("./quran.mjs").RecitationMatch} RecitationMatch
 */

/**
 * The input's main language from its letters: "ar", "bn", "en" (any Latin
 * text), "mixed" when no script has 60% of the letters, or "unknown".
 * @param {string} text
 */
export function detectLanguage(text) {
  const shares = scriptShares(text);
  if (shares.letters === 0) return { language: "unknown", shares };
  /** @type {[string, number][]} */
  const ranked = [["ar", shares.arabic], ["bn", shares.bengali], ["en", shares.latin]];
  ranked.sort((a, b) => b[1] - a[1]);
  return { language: ranked[0][1] >= 0.6 ? ranked[0][0] : "mixed", shares };
}

// Bangla "য়" has a precomposed and a decomposed form; NFC picks one, so every
// Bangla pattern below is normalised the same way as the text it is matched against.
/** @param {string} s */
const nfc = (s) => s.normalize("NFC");

const ISLAMIC_TERMS = {
  arabic: ["الله", "القران", "النبي", "رسول", "صلي الله عليه وسلم", "الاسلام", "الصلاه", "الجنه", "حديث", "سبحانه", "تعالي", "سوره", "ايه", "مسلم", "الدعاء", "الايمان", "حلال"],
  bengali: ["আল্লাহ", "নবী", "নবি", "রাসূল", "রাসুল", "কুরআন", "কোরআন", "হাদিস", "হাদীস", "ইসলাম", "নামাজ", "নামায", "সালাত", "জান্নাত", "সূরা", "সুরা", "আয়াত", "মসজিদ", "রমজান", "মুসলিম", "মুসলমান", "দোয়া", "ঈমান", "হালাল"].map(nfc),
  latin: ["allah", "quran", "qur'an", "koran", "prophet", "muhammad", "hadith", "islam", "salah", "surah", "ayah", "mosque", "ramadan", "sunnah", "muslim"],
};

const FACT_CUES = {
  latin: [/\btrue stor(y|ies)\b/i, /\breal(-| )(life|story)\b/i, /\bdocumentar(y|ies)\b/i, /\bbiograph(y|ies)\b/i, /\bbased on (facts|a true)\b/i, /\bhistory of\b/i, /\blife of\b/i],
  bengali: ["সত্য ঘটনা", "সত্যি ঘটনা", "বাস্তব ঘটনা", "ডকুমেন্টারি", "জীবনী", "ইতিহাস"].map(nfc),
  arabic: ["قصه حقيقيه", "وثائقي", "واقعيه", "سيره", "تاريخ"],
};

const STORY_CUES = {
  latin: [/\bstor(y|ies)\b/i, /\bmovie\b/i, /\bfilm\b/i, /\bfiction(al)?\b/i, /\bimagine\b/i, /\bonce upon\b/i, /\btale\b/i],
  bengali: ["গল্প", "মুভি", "সিনেমা", "কাহিনী", "কাহিনি", "কাল্পনিক", "ফিল্ম"].map(nfc),
  arabic: ["قصه", "فيلم", "خيال", "خياليه", "حكايه"],
};

// Prophets and Companions: their stories come from the Quran, hadith and sira,
// so they are told from sources, never labelled as fiction, and never depicted.
const PROPHETIC_CUES = {
  latin: [/\bprophets?\b/i, /\bcompanions? of the prophet\b/i, /\bsahab(a|i|ah)\b/i],
  bengali: ["নবী", "নবি", "রাসূল", "রাসুল", "সাহাবী", "সাহাবি", "সাহাবা", "পয়গম্বর"].map((s) => s.normalize("NFC")),
  arabic: ["النبي", "نبي", "الانبياء", "رسول", "الصحابه", "صحابي"],
};

// Imagery stock footage cannot supply; the story needs labelled AI visuals.
const FANTASY_CUES = {
  latin: [/\bdragons?\b/i, /\bmagic(al)?\b/i, /\bwizards?\b/i, /\baliens?\b/i, /\bmonsters?\b/i, /\bunicorns?\b/i, /\bsuperpowers?\b/i, /\bfair(y|ies)\b/i],
  bengali: ["ড্রাগন", "জাদু", "যাদু", "এলিয়েন", "দানব", "পরী"].map(nfc),
  arabic: ["تنين", "سحر", "ساحر", "فضائي", "وحش"],
};

/**
 * @param {string} text
 * @param {{ latin: (RegExp | string)[], bengali: string[], arabic: string[] }} cues
 */
function findCues(text, cues) {
  const arabic = " " + normalizeArabic(text) + " ";
  /** @type {string[]} */
  const found = [];
  for (const cue of cues.latin) {
    const hit = typeof cue === "string" ? text.toLowerCase().includes(cue) : cue.test(text);
    if (hit) found.push(String(cue));
  }
  for (const cue of cues.bengali) if (text.includes(cue)) found.push(cue);
  for (const cue of cues.arabic) if (arabic.includes(" " + cue + " ") || arabic.includes(" ال" + cue + " ")) found.push(cue);
  return found;
}

/**
 * Decide what kind of film the input asks for. A recitation is recognised
 * from the Quran match; otherwise true-story cues mean a researched
 * documentary, a long text is kept as the owner's own script, and a short
 * idea becomes an original story (labelled as fiction). Islamic content and
 * fantasy imagery are flagged separately because they change the rules.
 * @param {{ text?: string, recitation?: RecitationMatch | null }} input
 */
export function classifyInput({ text = "", recitation = null }) {
  const clean = String(text).normalize("NFC");
  const { language, shares } = detectLanguage(clean);
  const words = clean.split(/\s+/).filter(Boolean).length;
  /** @type {string[]} */
  const reasons = [];

  const quoted = (recitation?.segments ?? []).filter((s) => s.matchedWords >= 5 && !s.ambiguous);
  if (recitation?.isQuran) {
    reasons.push(`The recording is Quran recitation (${Math.round(recitation.coverage * 100)}% of its words match the Tanzil text).`);
    return result("recitation", "quran_recitation", true, false, "high");
  }

  const islamicTerms = [...new Set([
    ...ISLAMIC_TERMS.latin.filter((t) => new RegExp("\\b" + t.replace("'", "'?") + "\\b", "i").test(clean)),
    ...ISLAMIC_TERMS.bengali.filter((t) => clean.includes(t)),
    ...ISLAMIC_TERMS.arabic.filter((t) => (" " + normalizeArabic(clean) + " ").includes(" " + t + " ")),
  ])];
  const islamic = islamicTerms.length >= 2 || quoted.length > 0;
  if (islamicTerms.length >= 2) reasons.push("Islamic terms: " + islamicTerms.slice(0, 5).join(", ") + ".");
  if (quoted.length) reasons.push(`It quotes ${quoted.length} Quran passage${quoted.length === 1 ? "" : "s"}, which are shown verbatim and never put under music.`);

  const fantasy = findCues(clean, FANTASY_CUES);
  if (fantasy.length) reasons.push("Imagery stock footage cannot show (" + fantasy.slice(0, 3).join(", ") + "): labelled AI visuals are needed.");
  const fact = findCues(clean, FACT_CUES);
  const story = findCues(clean, STORY_CUES);
  const prophetic = findCues(clean, PROPHETIC_CUES);

  if (islamic && prophetic.length) {
    reasons.push("It is about a prophet or a Companion, so it is told from the Quran, hadith and sira with sources, never as fiction, and no one is depicted.");
    return result("documentary", "islamic", true, false, "high");
  }
  if (fact.length) {
    reasons.push("It asks for a true story (" + fact.slice(0, 2).join(", ") + "), so every claim is researched and sourced.");
    return result("documentary", islamic ? "islamic" : "documentary", islamic, fantasy.length > 0, "high");
  }
  if (words >= 150 && !story.length) {
    reasons.push(`It is a ${words}-word text, so it is treated as the owner's own script: the words are kept and their claims are checked.`);
    return result("own-script", islamic ? "islamic" : "documentary", islamic, fantasy.length > 0, "medium");
  }
  if (story.length || fantasy.length) reasons.push("It asks for a story, so an original story is written and labelled as fiction.");
  else reasons.push("It is a short idea with no sign of being a true story, so it becomes an original story labelled as fiction.");
  return result("story", islamic ? "islamic" : "story", islamic, fantasy.length > 0, story.length || fantasy.length ? "high" : "low");

  /**
   * @param {InputMode} mode
   * @param {ContentType} contentType
   * @param {boolean} isIslamic
   * @param {boolean} needsAiVisuals
   * @param {"high" | "medium" | "low"} confidence
   */
  function result(mode, contentType, isIslamic, needsAiVisuals, confidence) {
    return {
      mode,
      contentType,
      islamic: isIslamic,
      needsAiVisuals,
      needsResearch: mode === "documentary" || mode === "own-script",
      fictionLabel: mode === "story",
      language,
      shares,
      words,
      confidence,
      reasons,
    };
  }
}

/** @param {string} source */
const re = (source) => new RegExp(nfc(source), "i");

/** @type {[RegExp, number][]} */
const MULTIPLIERS = [
  [re("^(k|thousand|হাজার|الف)$"), 1e3],
  [re("^(lakh|lac|লাখ|লক্ষ)$"), 1e5],
  [re("^(m|mn|million|মিলিয়ন|مليون)$"), 1e6],
  [re("^(crore|কোটি)$"), 1e7],
  [re("^(b|bn|billion|বিলিয়ন|مليار)$"), 1e9],
];

// Prefix matches, so Bangla and Arabic case endings ("টাকায়", "دولارات") still count.
/** @type {[RegExp, string][]} */
const CURRENCIES = [
  [re("^(\\$|usd|dollar|bucks|ডলার|دولار)"), "USD"],
  [re("^(৳|bdt|taka|tk|টাকা)"), "BDT"],
  [re("^(ريال|sar)"), "SAR"],
  [re("^(درهم|aed)"), "AED"],
  [re("^(جنيه|egp)"), "EGP"],
];

/** @type {[string, RegExp[]][]} */
const GOALS = [
  ["rolls-royce", [re("rolls[\\s-]?royce"), re("রোলস\\s?রয়েস"), re("رولز\\s?رويس")]],
  ["billionaire", [re("billionaire"), re("বিলিয়নিয়ার"), re("ملياردير")]],
  ["millionaire", [re("millionaire"), re("মিলিয়নিয়ার"), re("مليونير")]],
  ["bus company", [re("\\bbus (company|business|fleet)\\b"), re("বাসের ব্যবসা|বাস কোম্পানি|বাসের কোম্পানি"), re("شركة حافلات|حافلات")]],
];

const NUMBER = "(\\d{1,3}(?:,\\d{2,3})+|\\d+(?:\\.\\d+)?)";
const SCALE = nfc("(k|thousand|lakh|lac|m|mn|million|crore|b|bn|billion|হাজার|লাখ|লক্ষ|মিলিয়ন|কোটি|বিলিয়ন|الف|مليون|مليار)");
const UNIT = nfc("(\\$|usd|dollars?|bucks|ডলার[\\u0980-\\u09FF]*|دولار[\\u0600-\\u06FF]*|৳|bdt|taka|tk|টাকা[\\u0980-\\u09FF]*|ريال|sar|درهم|aed|جنيه|egp)");

/**
 * Money figures and goals in a story idea, in any of the three languages
 * and with any digits ("$50", "৫০ ডলার", "٥٠ دولار", "2 কোটি টাকা").
 * @param {string} text
 */
export function extractPremise(text) {
  const clean = toAsciiDigits(String(text ?? "").normalize("NFC")).replace(/\s+/g, " ").trim();
  /** @type {{ value: number, currency: string, raw: string }[]} */
  const amounts = [];
  const patterns = [
    new RegExp("(\\$|৳)\\s?" + NUMBER + "(?:\\s?" + SCALE + ")?(?![\\p{L}\\p{M}\\d])", "giu"),
    new RegExp(NUMBER + "(?:\\s?" + SCALE + ")?\\s?" + UNIT + "(?![\\p{L}\\p{M}])", "giu"),
  ];
  const seen = new Set();
  for (const [index, pattern] of patterns.entries()) {
    for (const match of clean.matchAll(pattern)) {
      if (seen.has(match.index)) continue;
      seen.add(match.index);
      const [unit, number, scale] = index === 0 ? [match[1], match[2], match[3]] : [match[3], match[1], match[2]];
      const multiplier = scale ? MULTIPLIERS.find(([pattern]) => pattern.test(scale))?.[1] ?? 1 : 1;
      const currency = CURRENCIES.find(([pattern]) => pattern.test(unit))?.[1] ?? "unknown";
      amounts.push({ value: Number(number.replace(/,/g, "")) * multiplier, currency, raw: match[0].trim() });
    }
  }
  amounts.sort((a, b) => clean.indexOf(a.raw) - clean.indexOf(b.raw));
  const goals = GOALS.filter(([, patterns]) => patterns.some((pattern) => pattern.test(clean))).map(([goal]) => goal);
  return { text: clean, amounts, goals };
}
