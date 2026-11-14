/**
 * The three language versions of a Zupona film: Arabic for viewers with an
 * Islamic outlook, American English, and Bangla. Each version is written for
 * its own audience from the same research or premise, never translated line
 * by line, and versions never share a script, a voice or on-screen text.
 */
import { scriptShares, toLocalDigits } from "./text-scripts.mjs";

/**
 * @typedef {"ar" | "en-US" | "bn-BD"} VersionId
 * @typedef {"none" | "no-instruments" | "score"} MusicPolicy
 * @typedef {{
 *   id: VersionId, name: string, nativeName: string, audience: string, locale: string,
 *   direction: "rtl" | "ltr", script: "arabic" | "latin" | "bengali",
 *   numberingSystem: "arab" | "latn" | "beng", register: string, currency: string,
 *   currencyDisplay: "symbol" | "name",
 *   narrationWpm: { min: number, target: number, max: number },
 *   defaultMusic: MusicPolicy, visualRules: "islamic" | "standard",
 *   fonts: { display: string, text: string, quran: string },
 *   complexShaping: boolean,
 * }} FilmVersion
 */

/** @type {Readonly<Record<VersionId, FilmVersion>>} */
export const VERSIONS = Object.freeze({
  ar: {
    id: "ar",
    name: "Arabic",
    nativeName: "العربية",
    audience: "Arabic-speaking viewers with an Islamic outlook",
    locale: "ar",
    direction: "rtl",
    script: "arabic",
    numberingSystem: "arab",
    register: "Modern Standard Arabic (fusha) for narration, so one version reaches the whole Arab world",
    currency: "USD",
    currencyDisplay: "name",
    // A planning value; the narrator's own recording is measured and wins.
    narrationWpm: { min: 105, target: 120, max: 135 },
    // Many viewers avoid instrumental music: sound design and vocal-only nasheed at most.
    defaultMusic: "no-instruments",
    visualRules: "islamic",
    fonts: { display: "Amiri", text: "Noto Naskh Arabic", quran: "Amiri Quran" },
    complexShaping: true,
  },
  "en-US": {
    id: "en-US",
    name: "English (USA)",
    nativeName: "English",
    audience: "viewers in the United States",
    locale: "en-US",
    direction: "ltr",
    script: "latin",
    numberingSystem: "latn",
    register: "American English, American spelling and references",
    currency: "USD",
    currencyDisplay: "symbol",
    narrationWpm: { min: 140, target: 150, max: 160 },
    defaultMusic: "score",
    visualRules: "standard",
    fonts: { display: "Archivo", text: "IBM Plex Sans", quran: "Amiri Quran" },
    complexShaping: false,
  },
  "bn-BD": {
    id: "bn-BD",
    name: "Bangla",
    nativeName: "বাংলা",
    audience: "viewers in Bangladesh",
    locale: "bn-BD",
    direction: "ltr",
    script: "bengali",
    numberingSystem: "beng",
    register: "natural spoken Bangladeshi Bangla (pramito cholito), Bangladeshi vocabulary",
    currency: "BDT",
    currencyDisplay: "symbol",
    narrationWpm: { min: 115, target: 125, max: 135 },
    defaultMusic: "score",
    visualRules: "standard",
    fonts: { display: "Hind Siliguri", text: "Noto Sans Bengali", quran: "Amiri Quran" },
    complexShaping: true,
  },
});

/** @type {readonly VersionId[]} */
export const VERSION_IDS = Object.freeze(/** @type {VersionId[]} */ (Object.keys(VERSIONS)));

/**
 * @param {string} id
 * @returns {FilmVersion | null}
 */
export function getVersion(id) {
  return Object.hasOwn(VERSIONS, id) ? VERSIONS[/** @type {VersionId} */ (id)] : null;
}

/** @param {string} id */
function requireVersion(id) {
  const version = getVersion(id);
  if (!version) throw new Error("Unknown version \"" + id + "\". Use one of: " + VERSION_IDS.join(", ") + ".");
  return version;
}

/**
 * A number the way the version's viewers write it: ١٬٢٣٤ in Arabic,
 * 1,234 in English, ১,২৩৪ (lakh grouping) in Bangla.
 * @param {number} value
 * @param {string} versionId
 */
export function formatNumber(value, versionId) {
  const version = requireVersion(versionId);
  return new Intl.NumberFormat(version.locale, { numberingSystem: version.numberingSystem, maximumFractionDigits: 2 }).format(value);
}

/**
 * A whole-unit money amount in the version's currency (or another currency
 * when the story needs it): $4,500,000, ৪৫,০০,০০০৳, ٥٠ دولار أمريكي.
 * @param {number} amount
 * @param {string} versionId
 * @param {string} [currency]
 */
export function formatMoney(amount, versionId, currency) {
  const version = requireVersion(versionId);
  return new Intl.NumberFormat(version.locale, {
    numberingSystem: version.numberingSystem,
    style: "currency",
    currency: currency ?? version.currency,
    currencyDisplay: version.currencyDisplay,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Rewrite 0-9 in a text with the version's digits (for on-screen text).
 * @param {string} text
 * @param {string} versionId
 */
export function localDigits(text, versionId) {
  return toLocalDigits(text, requireVersion(versionId).numberingSystem);
}

/**
 * How many narration words fit in a stretch of film, at the narrator's
 * measured pace when known, otherwise the version's planning pace.
 * @param {number} seconds
 * @param {string} versionId
 * @param {number} [measuredWpm]
 */
export function narrationWordBudget(seconds, versionId, measuredWpm) {
  const version = requireVersion(versionId);
  const wpm = Number.isFinite(measuredWpm) && Number(measuredWpm) > 0 ? Number(measuredWpm) : version.narrationWpm.target;
  return Math.max(0, Math.round((Math.max(0, seconds) / 60) * wpm));
}

/**
 * Check that a version's narration is written only in its own script, so an
 * English line never reaches the Bangla voice and the reverse. Quoted Quran
 * text in Arabic is allowed in on-screen text when allowArabicQuotes is set.
 * @param {string} text
 * @param {string} versionId
 * @param {{ allowArabicQuotes?: boolean }} [options]
 */
export function checkVersionPurity(text, versionId, options = {}) {
  const version = requireVersion(versionId);
  const shares = scriptShares(text);
  /** @type {string[]} */
  const problems = [];
  if (shares.letters === 0) problems.push("The text has no letters.");
  // Quoted ayat in Arabic are left out of the share when they are allowed.
  const quoted = options.allowArabicQuotes && version.script !== "arabic" ? shares.arabic : 0;
  const own = quoted < 1 ? shares[version.script] / (1 - quoted) : 0;
  const minimum = version.script === "latin" ? 0.98 : 0.9;
  if (shares.letters && own < minimum) problems.push(`Only ${Math.round(own * 100)}% of the letters are in the ${version.script} script (at least ${minimum * 100}% expected).`);
  if (version.script !== "bengali" && shares.bengali > 0) problems.push("Bangla letters appear in the " + version.name + " version.");
  if (version.script !== "latin" && shares.latin > 0.1) problems.push("English letters make up " + Math.round(shares.latin * 100) + "% of the " + version.name + " version.");
  if (version.script !== "arabic" && shares.arabic > 0 && !options.allowArabicQuotes) problems.push("Arabic letters appear in the " + version.name + " version.");
  return { ok: problems.length === 0, shares, problems };
}
