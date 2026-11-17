/**
 * Pickthall's translation, ayah by ayah, from Project Gutenberg eBook #16955
 * ("Three translations of the Koran side by side", public domain in the USA;
 * Pickthall's "The Meaning of the Glorious Koran" was published in 1930 and
 * he died in 1936). Only the "P:" lines are kept, word for word; line breaks
 * inside a verse become spaces. Nothing is reworded.
 *   node scripts/extract-pickthall.mjs <pg16955.txt> > engine/data/quran/pickthall-1930.json
 */
import { readFileSync } from "node:fs";
import { AYAH_COUNTS } from "../engine/src/quran.mjs";

const text = readFileSync(process.argv[2], "utf8").replace(/\r/g, "");
/** @type {Map<string, string>} */
const found = new Map();
/** @type {string[]} */
const fixedLabels = [];
// Four verse labels are misprinted in this file ("0.033" for 017.033, "039.04" for 039.046, ...):
// a label that does not follow on from the one before is read from its place; each is listed.
const verse = /^(\d{1,3})\.(\d{1,3})\n([\s\S]*?)(?=\n\d{1,3}\.\d{1,3}\n|\n-{20,}|\*\*\* END)/gm;
let last = { s: 0, a: 0 };
for (const m of text.matchAll(verse)) {
  let s = Number(m[1]);
  const a = Number(m[2]);
  const follows = (s === last.s && a === last.a + 1) || (s === last.s + 1 && a === 1);
  let at = a;
  if (!follows && a === last.a + 1) s = last.s;
  else if (!follows && s === last.s && m[2].length < 3) at = last.a + 1;
  if (s !== Number(m[1]) || at !== a) fixedLabels.push(`${m[1]}.${m[2]} read as ${s}:${at}`);
  last = { s, a: at };
  const p = /(?:^|\n)P: ([\s\S]*?)(?=\n\n|\n[YS]: |$)/.exec(m[3]);
  if (p) found.set(`${s}:${at}`, p[1].replace(/\s*\n\s*/g, " ").trim());
}
/** @type {string[]} */
const ayat = [];
/** @type {string[]} */
const missing = [];
for (let s = 1; s <= 114; s += 1) for (let a = 1; a <= AYAH_COUNTS[s - 1]; a += 1) {
  const t = found.get(`${s}:${a}`);
  if (t === undefined) missing.push(`${s}:${a}`);
  ayat.push(t ?? "");
}
if (missing.length) { console.error(`missing: ${missing.join(" ")}`); process.exit(1); }
process.stdout.write(JSON.stringify({
  name: "The Meaning of the Glorious Koran",
  translator: "Marmaduke William Pickthall (1875-1936)",
  published: 1930,
  language: "en",
  source: "Project Gutenberg eBook #16955, Three translations of the Koran (Al-Qur'an) side by side, release 2005, updated 2020-12-12, https://www.gutenberg.org/ebooks/16955",
  licence: "Public domain: in the USA (Gutenberg's statement; published 1930) and in countries of life + 70 years or less (the translator died in 1936). The Project Gutenberg name and licence are not used.",
  labelsFixed: fixedLabels,
  mayShow: "Yes, as a translation of the meaning, credited to Pickthall; it is not the Quran itself.",
  ayat,
}, null, 0) + "\n");
