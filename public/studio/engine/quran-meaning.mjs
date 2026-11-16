/**
 * What each ayah says that a picture may follow, from sources whose edition
 * and licence are recorded, in three layers of authority (docs/QURAN_DOCUMENTARY.md):
 *  (a) a literal lexicon, authored here and to be reviewed by a person:
 *      Arabic word forms in the verified text that name visible things and
 *      places (sky, mountains, the fig, Mount Sinai ...). Found in the
 *      Arabic itself, never in a translation.
 *  (b) themes (mercy, guidance, warning, the Hereafter ...) read from a
 *      public-domain translation (Pickthall, 1930) by fixed keyword rules;
 *      a theme chooses a mood and a family of neutral motifs, never a
 *      literal claim.
 *  (c) a model may later rank pictures inside what (a) and (b) allow; it is
 *      not used here and never writes meaning.
 * Every thing and theme carries its reason (`because`) and its source. What
 * is not found is listed as a gap, never filled. The unseen (angels, jinn,
 * the Throne, Paradise, Hell, the Last Day) is flagged so that the director
 * shows only symbols (real earthly nature) and never a literal scene.
 */
import { AYAH_COUNTS } from "./quran.mjs";
import { normalizeArabic, tokenizeArabic } from "./arabic.mjs";

/**
 * @typedef {{ name: string, edition: string, source: string, licence: string, mayShow: string }} MeaningSource
 * @typedef {{ thing: string, word: string, look: string[], living: boolean, symbolic: boolean, source: "arabic-text" }} AyahThing
 * @typedef {{ theme: string, because: string, source: string }} AyahTheme
 * @typedef {{ surah: number, ayah: number, uthmani: string, simple: string, translation: { text: string, by: string } | null, things: AyahThing[], themes: AyahTheme[], unseen: string[], gaps: string[] }} AyahMeaning
 */

/** The sources this layer reads, with their editions and licences. */
export const MEANING_SOURCES = Object.freeze({
  uthmani: Object.freeze({ name: "Tanzil Quran Text (Uthmani)", edition: "1.1", source: "https://tanzil.net/download/ (engine/data/quran/tanzil-quran-uthmani-1.1.txt, verbatim with its notice)", licence: "Creative Commons Attribution 3.0 with Tanzil's terms: verbatim copies only, credit Tanzil Project and link to tanzil.net", mayShow: "Yes, verbatim, credited \"Quran text: Tanzil.net\"" }),
  simple: Object.freeze({ name: "Tanzil Quran Text (Simple)", edition: "1.0.2", source: "engine/data/quran/tanzil-quran-simple-1.0.2.json", licence: "Creative Commons Attribution 3.0 with Tanzil's terms", mayShow: "Used for matching words; the Uthmani text is shown" }),
  pickthall: Object.freeze({ name: "The Meaning of the Glorious Koran, M. M. Pickthall", edition: "1930, Project Gutenberg eBook #16955 (2020-12-12)", source: "https://www.gutenberg.org/ebooks/16955 (engine/data/quran/pickthall-1930.json)", licence: "Public domain (USA; the translator died in 1936)", mayShow: "Yes, as a translation of the meaning, credited to Pickthall" }),
  lexicon: Object.freeze({ name: "Zupona literal lexicon", edition: "1 (13 Nov 2026)", source: "engine/src/quran-meaning.mjs LEXICON", licence: "Written for this project", mayShow: "Not shown; it chooses pictures. A person must review it." }),
  tafsir: null,
});

/** Why there is no tafsir layer yet. */
export const TAFSIR_GAP = "No tafsir with a recorded edition and a licence that allows this use is bundled yet; themes come from the translation only.";

/**
 * The literal lexicon: things the text names that a camera can show (or, if
 * `symbolic`, show only as an earthly symbol). Forms are written without
 * "al-" and without the conjunctions and prepositions that join a word
 * (wa-, fa-, bi-, ka-, li-) and without pronoun endings; they are matched on
 * the normalised Simple text. `living`: an animal, bird or insect, shown
 * only when the owner's adab level allows animals.
 * @type {readonly { thing: string, forms: string[], look: string[], living?: boolean, symbolic?: boolean }[]}
 */
export const LEXICON = Object.freeze([
  { thing: "sky", forms: ["سماء", "سماوات", "سموات"], look: ["sky", "clouds over sky", "night sky"] },
  { thing: "earth", forms: ["ارض"], look: ["earth landscape", "aerial land", "fields"] },
  { thing: "mountains", forms: ["جبال", "جبل", "رواسي"], look: ["mountains", "mountain range"] },
  { thing: "sea", forms: ["بحر", "بحرين", "بحار", "يم"], look: ["sea", "ocean waves"] },
  { thing: "water", forms: ["ماء", "مياه"], look: ["water", "flowing water"] },
  { thing: "rain", forms: ["مطر", "ودق", "غيث"], look: ["rain", "rain on leaves"] },
  { thing: "clouds", forms: ["سحاب", "غمام", "مزن", "معصرات"], look: ["clouds", "storm clouds"] },
  { thing: "wind", forms: ["ريح", "رياح"], look: ["wind over grass", "wind in trees"] },
  { thing: "lightning", forms: ["برق"], look: ["lightning"] },
  { thing: "thunder", forms: ["رعد"], look: ["thunderstorm"] },
  { thing: "night", forms: ["ليل", "ليله"], look: ["night", "night landscape"] },
  { thing: "day", forms: ["نهار"], look: ["daylight landscape"] },
  { thing: "dawn", forms: ["فجر", "صبح", "اصباح"], look: ["dawn", "sunrise"] },
  { thing: "morning light", forms: ["ضحي"], look: ["morning sunlight", "bright morning"] },
  { thing: "dusk", forms: ["شفق", "عصر"], look: ["dusk", "afternoon light"] },
  { thing: "east and west (sunrise and sunset)", forms: ["مشرق", "مشرقين", "مشارق", "مغرب", "مغربين", "مغارب"], look: ["sunrise horizon", "sunset horizon"] },
  { thing: "the town", forms: ["بلد", "بلده"], look: ["old town in a valley"] },
  { thing: "sun", forms: ["شمس"], look: ["sun", "sunlight"] },
  { thing: "moon", forms: ["قمر"], look: ["moon"] },
  { thing: "stars", forms: ["نجم", "نجوم", "كواكب", "كوكب", "مصابيح"], look: ["stars", "starry sky", "milky way"] },
  { thing: "trees", forms: ["شجر", "شجره", "اشجار"], look: ["trees", "forest"] },
  { thing: "date palms", forms: ["نخل", "نخيل", "نخله"], look: ["date palms"] },
  { thing: "fruits", forms: ["ثمرات", "ثمر", "فاكهه", "فواكه"], look: ["fruit", "orchard"] },
  { thing: "grapes", forms: ["عنب", "اعناب"], look: ["grapes", "vineyard"] },
  { thing: "pomegranates", forms: ["رمان"], look: ["pomegranate"] },
  { thing: "the fig", forms: ["تين"], look: ["fig tree", "figs"] },
  { thing: "the olive", forms: ["زيتون"], look: ["olive tree", "olive grove"] },
  { thing: "plants and crops", forms: ["نبات", "زرع", "حصيد", "سنابل", "سنبله"], look: ["wheat field", "green plants"] },
  { thing: "gardens", forms: ["جنات", "جنتين", "جنتان"], look: ["garden", "green garden with stream"], symbolic: true },
  { thing: "rivers", forms: ["نهر", "انهار"], look: ["river", "stream"] },
  { thing: "springs", forms: ["ينبوع", "ينابيع"], look: ["spring water"] },
  { thing: "light", forms: ["نور", "ضياء"], look: ["light rays", "light through clouds"] },
  { thing: "darkness", forms: ["ظلمات", "ظلمه"], look: ["darkness", "deep shadow"] },
  { thing: "shade", forms: ["ظل", "ظلال"], look: ["shade of trees"] },
  { thing: "ships", forms: ["فلك", "سفينه", "جوار"], look: ["sailing ship", "boat on sea"] },
  { thing: "iron", forms: ["حديد"], look: ["iron", "forge"] },
  { thing: "pearls and coral", forms: ["لؤلؤ", "لولو", "مرجان"], look: ["pearls", "coral reef"] },
  { thing: "milk", forms: ["لبن"], look: ["milk"] },
  { thing: "honey", forms: ["عسل"], look: ["honey"] },
  { thing: "fire", forms: ["نار"], look: ["fire", "embers"], symbolic: true },
  { thing: "bees", forms: ["نحل"], look: ["bees", "honeycomb"], living: true },
  { thing: "cattle", forms: ["انعام"], look: ["cattle grazing"], living: true },
  { thing: "camels", forms: ["ابل"], look: ["camels in desert"], living: true },
  { thing: "birds", forms: ["طير", "طيور"], look: ["birds in flight"], living: true },
  { thing: "Mount Sinai", forms: ["طور", "سينين", "سيناء"], look: ["Mount Sinai", "Sinai mountains"] },
  { thing: "Makkah", forms: ["مكه", "بكه"], look: ["Makkah", "Masjid al-Haram"] },
  { thing: "the Ka'bah", forms: ["كعبه"], look: ["Kaaba"] },
  { thing: "Safa and Marwa", forms: ["صفا", "مروه"], look: ["Safa and Marwa"] },
  { thing: "Egypt", forms: ["مصر"], look: ["Egypt landscape", "Nile"] },
  { thing: "Saba", forms: ["سبا"], look: ["Marib dam ruins", "Yemen landscape"] },
  { thing: "ruins of past towns", forms: ["قري", "قريه", "مساكن", "اثار"], look: ["ancient ruins", "abandoned stone town"] },
]);

/** Words in the Arabic that name the unseen: never shown, only as an earthly symbol. */
// "al-jannah" (Paradise) and "al-jinnah" (the jinn, 114:6) are written alike: unseen either way.
const UNSEEN_FORMS = new Map([
  ["جنه", "Paradise or the jinn"], ["ملائكه", "angels"], ["ملائكت", "angels"], ["ملكين", "angels"], ["جن", "jinn"], ["جان", "jinn"], ["عرش", "the Throne"], ["كرسي", "the Footstool"],
  ["جهنم", "Hell"], ["جحيم", "Hell"], ["سعير", "Hell"], ["فردوس", "Paradise"], ["اخره", "the Hereafter"], ["قيامه", "the Day of Resurrection"], ["ساعه", "the Hour"], ["غيب", "the unseen"], ["روح", "the Spirit"],
].map(([form, name]) => [normalizeArabic(form), name]));

/** Themes from the translation: fixed keyword rules, each with its mood, motifs and whether it is unseen. */
export const THEMES = Object.freeze([
  { theme: "the Hereafter", words: /\b(day of (judgment|resurrection|decision|reckoning)|the judgment\b|the hereafter|the hour\b|resurrect|raised again|the garden|gardens underneath which|paradise|the fire\b|hell|doom of|the last day)/i, unseen: true, mood: "solemn", motifs: ["vast empty landscape", "dawn over horizon", "still water"] },
  { theme: "mercy and forgiveness", words: /\b(merciful|mercy|forgiv|forgiving|pardon|relent|clement|kindness)/i, mood: "warm", motifs: ["soft morning light", "rain on leaves", "gentle stream"] },
  { theme: "guidance", words: /\b(guid|straight path|right path|right way|the light\b|lead(s)? (them|you) out of darkness)/i, mood: "hopeful", motifs: ["path through landscape", "light through clouds", "sunrise road"] },
  { theme: "patience", words: /\b(patien|steadfast|endur|persever)/i, mood: "calm", motifs: ["mountain in mist", "old tree", "still lake"] },
  { theme: "gratitude for His favours", words: /\b(thank|grateful|gratitude|favours? of|bount(y|ies) of)/i, mood: "warm", motifs: ["harvest field", "fruit on tree", "golden light"] },
  { theme: "worship and prayer", words: /\b(worship|prayer|prostrat|bow down|glorif|praise|remembrance of allah|remember allah|hallow)/i, mood: "reverent", motifs: ["empty prayer hall", "mosque at dawn", "minaret silhouette"] },
  { theme: "the oneness of God", words: /\b(no god save|there is no god|is one god|allah is one|ascribe(s)? (no )?partners?|unto him we turn|lord of the worlds|he begetteth not|the one\b|none comparable|nothing (is )?like (unto )?him)/i, mood: "majestic", motifs: ["vast sky", "mountain range", "starry sky"] },
  { theme: "the majesty of God", words: /\b(wisest|mighty|almighty|all-?knowing|knower|hearer|seer|sovereign|majesty|exalted|eternally besought|most high|glorious|owner of the day)/i, mood: "majestic", motifs: ["vast sky", "mountain at dawn", "sea horizon"] },
  { theme: "God's care and nearness", words: /\b(forsaken|forsake|hate thee|content|console|found thee|shelter|near unto|answer the prayer|watcheth over|with you wheresoever)/i, mood: "warm", motifs: ["soft morning light", "sheltering tree", "calm valley"] },
  { theme: "faith and good deeds", words: /\b(believe(th)? and do good|good works|righteous|do good|doers of good|believers)/i, mood: "hopeful", motifs: ["green field in sun", "fruit tree", "clear stream"] },
  { theme: "creation and signs", words: /\b(created|creation|heavens and the earth|portents?|signs? for|made the night|the earth (have|hath) we|spread out|sent down water)/i, mood: "majestic", motifs: ["aerial landscape", "night sky", "ocean"] },
  { theme: "provision", words: /\b(provision|provideth|sustenance|bounty|crops|harvest|pasture|cattle|rain)/i, mood: "warm", motifs: ["fields", "orchard", "rain on fields"] },
  { theme: "warning", words: /\b(warn|warner|beware|doom|punish|chastisement|wrath|torment|woe unto|destroyed|perish)/i, mood: "solemn", motifs: ["storm clouds", "rough sea", "bare desert"] },
  { theme: "past nations", words: /\b(pharaoh|'ad\b|thamud|folk of (noah|lot|pharaoh|aad|thamud|midian)|generations before|townships?|cities (which|that) we|people of the cave|midian|tubb)/i, mood: "solemn", motifs: ["ancient ruins", "stone desert town", "wind over ruins"] },
  { theme: "the prophets and their stories", words: /\b(noah|abraham|ishmael|isaac|jacob|joseph|moses|aaron|david|solomon|jonah|job|zachariah|john|jesus|mary|lot|hud|salih|shu'eyb|messenger|prophet)/i, noPeople: true, mood: "reflective", motifs: ["desert landscape", "old stone path", "night sky"] },
  { theme: "revelation and the Book", words: /\b(scripture|revealed|revelation|the quran|the koran|this lecture|verses of|recite|the book\b|reminder)/i, mood: "reverent", motifs: ["light on open landscape", "dawn", "calm sea"] },
  { theme: "law and conduct", words: /\b(lawful|unlawful|forbidden|divorce|inheritance|bequest|fast(ing)?\b|pilgrimage|debt|witness(es)?|orphan|wedlock|retaliation|alms|spend of)/i, mood: "calm", motifs: ["balanced landscape", "still water", "stone architecture"] },
  { theme: "trust and refuge in God", words: /\b(seek refuge|refuge in|put (your|their) trust|trust in allah|sufficeth|protector|helper)/i, mood: "calm", motifs: ["shelter of rock", "harbour at dusk", "tree shade"] },
  { theme: "hardship and ease", words: /\b(ease|hardship|relief|burden|distress|affliction)/i, mood: "hopeful", motifs: ["dawn after night", "light after storm", "path out of valley"] },
]);

/** The ayat of the Uthmani file, verbatim, and its notice. @param {string} text */
export function parseTanzilText(text) {
  /** @type {string[]} */
  const ayat = [];
  /** @type {string[]} */
  const notice = [];
  let expected = { s: 1, a: 1 };
  for (const line of String(text).replace(/\r/g, "").split("\n")) {
    if (line.startsWith("#")) { notice.push(line); continue; }
    const m = /^(\d+)\|(\d+)\|(.*)$/.exec(line);
    if (!m) continue;
    const s = Number(m[1]), a = Number(m[2]);
    if (s !== expected.s || a !== expected.a) throw new Error(`The Quran text is out of order at ${s}:${a} (expected ${expected.s}:${expected.a}).`);
    ayat.push(m[3]);
    expected = a < AYAH_COUNTS[s - 1] ? { s, a: a + 1 } : { s: s + 1, a: 1 };
  }
  if (ayat.length !== 6236) throw new Error(`The Quran text must have 6236 ayat, it has ${ayat.length}.`);
  if (!notice.some((l) => /Tanzil/.test(l)) || !notice.some((l) => /CHANGING IT IS NOT ALLOWED/i.test(l))) throw new Error("The Tanzil notice is missing: the text may not be used without it.");
  return { ayat, notice: notice.join("\n") };
}

/** @param {number} surah @param {number} ayah */
export function ayahOffset(surah, ayah) {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1 || ayah > AYAH_COUNTS[surah - 1]) return -1;
  let k = ayah - 1;
  for (let s = 1; s < surah; s += 1) k += AYAH_COUNTS[s - 1];
  return k;
}

const PREFIXES = ["و", "ف"];
const PARTICLES = ["ب", "ك", "ل"];
const SUFFIXES = ["هما", "هم", "هن", "ها", "كم", "نا", "ه", "ك", "ي"];

/** Every bare form a written word may stand for (clitics and the article taken off). @param {string} token @param {{ suffixes?: boolean }} [o] */
export function bareForms(token, o = {}) {
  /** @type {Set<string>} */
  const out = new Set();
  /** @param {string} w */
  const add = (w) => {
    if (w.length < 2) return;
    out.add(w);
    if (w.length > 3 && w.endsWith("ا")) out.add(w.slice(0, -1)); // tanwin written with alef
    if (o.suffixes !== false) for (const s of SUFFIXES) if (w.length - s.length >= 2 && w.endsWith(s)) out.add(w.slice(0, -s.length));
  };
  /** @param {string} w */
  const article = (w) => {
    add(w);
    if (w.startsWith("ال")) add(w.slice(2));
  };
  /** @param {string} w */
  const particle = (w) => {
    article(w);
    for (const p of PARTICLES) if (w.startsWith(p) && w.length > 2) {
      const rest = w.slice(1);
      article(rest);
      if (p === "ل" && rest.startsWith("ل")) add(rest.slice(1)); // li + al- is written "ll"
    }
  };
  particle(token);
  for (const p of PREFIXES) if (token.startsWith(p) && token.length > 2) particle(token.slice(1));
  return [...out];
}

/** @type {Map<string, (typeof LEXICON)[number]>} */
const BY_FORM = new Map();
for (const entry of LEXICON) for (const f of entry.forms) BY_FORM.set(normalizeArabic(f), entry);

/** The visible things an ayah names, from its own Arabic. @param {string} simpleText */
export function literalThings(simpleText) {
  /** @type {AyahThing[]} */
  const things = [];
  /** @type {string[]} */
  const unseen = [];
  for (const token of tokenizeArabic(simpleText)) {
    const forms = bareForms(token);
    const entry = forms.map((f) => BY_FORM.get(f)).find(Boolean);
    if (entry && !things.some((t) => t.thing === entry.thing)) things.push({ thing: entry.thing, word: token, look: [...entry.look], living: Boolean(entry.living), symbolic: Boolean(entry.symbolic), source: "arabic-text" });
    // A word that names a visible thing ("jannah", a garden) is not read again as an unseen one ("jinn").
    // Pronoun endings are taken off only when four letters remain ("jana", fruit, is not "jinn").
    const hidden = entry ? null : forms.filter((f) => f.length >= 4 || bareForms(token, { suffixes: false }).includes(f)).map((f) => UNSEEN_FORMS.get(f)).find(Boolean);
    if (hidden && !unseen.includes(hidden)) unseen.push(hidden);
  }
  return { things, unseen };
}

/** Themes of an ayah from its translation. @param {string} translation */
export function themesOf(translation) {
  /** @type {AyahTheme[]} */
  const themes = [];
  for (const t of THEMES) {
    const m = t.words.exec(translation);
    if (m) themes.push({ theme: t.theme, because: m[0], source: "pickthall" });
  }
  return themes;
}

/**
 * The meaning layer for one ayah.
 * @param {{ uthmani: string[], simple: string[], pickthall: string[] }} texts @param {number} surah @param {number} ayah
 * @returns {AyahMeaning | null}
 */
export function ayahMeaning(texts, surah, ayah) {
  const k = ayahOffset(surah, ayah);
  if (k < 0) return null;
  let simple = texts.simple[k];
  // Tanzil writes the opening basmala into the first ayah; it is not part of that ayah's meaning.
  if (ayah === 1 && surah !== 1 && surah !== 9) { const w = String(simple).split(/\s+/); if (tokenizeArabic(w.slice(0, 4).join(" ")).join(" ") === "بسم الله الرحمن الرحيم") simple = w.slice(4).join(" "); }
  const { things, unseen } = literalThings(simple);
  const translation = texts.pickthall[k] ? { text: texts.pickthall[k], by: "pickthall" } : null;
  const themes = translation ? themesOf(translation.text) : [];
  if (themes.some((t) => t.theme === "the Hereafter") && !unseen.length) unseen.push("the Hereafter");
  /** @type {string[]} */
  const gaps = [];
  if (!translation) gaps.push("translation");
  if (!things.length && !themes.length) gaps.push("no visible thing in the Arabic and no theme in the translation: neutral reverent motifs only");
  return { surah, ayah, uthmani: texts.uthmani[k], simple: texts.simple[k], translation, things, themes, unseen, gaps };
}

/**
 * The meaning layer for passages, with the gaps listed and counted.
 * @param {{ uthmani: string[], simple: string[], pickthall: string[] }} texts @param {{ surah: number, fromAyah: number, toAyah: number }[]} ranges
 */
export function passageMeaning(texts, ranges) {
  /** @type {AyahMeaning[]} */
  const ayat = [];
  for (const r of ranges) for (let a = r.fromAyah; a <= r.toAyah; a += 1) { const m = ayahMeaning(texts, r.surah, a); if (m) ayat.push(m); }
  const withThings = ayat.filter((a) => a.things.length).length, withThemes = ayat.filter((a) => a.themes.length).length;
  const gaps = ayat.filter((a) => a.gaps.length).map((a) => ({ surah: a.surah, ayah: a.ayah, gaps: a.gaps }));
  return { ayat, summary: { ayat: ayat.length, withThings, withThemes, unseen: ayat.filter((a) => a.unseen.length).length, gaps: gaps.length }, gaps, tafsir: TAFSIR_GAP, sources: MEANING_SOURCES };
}

/**
 * What the adab guard reads for each ayah scene of a plan: the translation,
 * its source and licence (public domain: may be used).
 * @param {{ scenes: { id: string, kind: string, surah: number, ayah: number | null }[] }} plan @param {{ uthmani: string[], simple: string[], pickthall: string[] }} texts
 */
export function planMeanings(plan, texts) {
  /** @type {Record<string, { text: string, source: string, licence: string, allowsUse: boolean }>} */
  const out = {};
  for (const s of plan.scenes) {
    if (s.kind !== "ayah" || s.ayah === null) continue;
    const k = ayahOffset(s.surah, s.ayah);
    if (k >= 0 && texts.pickthall[k]) out[s.id] = { text: texts.pickthall[k], source: MEANING_SOURCES.pickthall.name, licence: MEANING_SOURCES.pickthall.licence, allowsUse: true };
  }
  return out;
}

/** A table a person can read and check: ayah, Arabic, translation, things, themes, unseen, gaps. @param {ReturnType<typeof passageMeaning>} p */
export function meaningTable(p) {
  const cell = (/** @type {string} */ s) => s.replace(/\|/g, "/");
  const lines = ["| Ayah | Arabic (Tanzil Uthmani) | Pickthall (1930) | Things (from the Arabic) | Themes (from the translation) | Unseen | Gaps |", "|---|---|---|---|---|---|---|"];
  for (const a of p.ayat) {
    lines.push(`| ${a.surah}:${a.ayah} | ${cell(a.uthmani)} | ${cell(a.translation?.text ?? "")} | ${a.things.map((t) => `${t.thing} (${t.word}${t.living ? ", living" : ""}${t.symbolic ? ", symbolic" : ""})`).join("; ")} | ${a.themes.map((t) => `${t.theme} ("${t.because}")`).join("; ")} | ${a.unseen.join(", ")} | ${a.gaps.join("; ")} |`);
  }
  return lines.join("\n");
}
