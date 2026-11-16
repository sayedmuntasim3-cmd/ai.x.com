// Turns a written film idea into a short image search.

import { terms } from "./rank";

// Words that make an idea read well but make a poor image search.
const FILLER = new Set(
  "documentary film story stories life lives secret forgotten brutal quietly beautiful beauty fragility journey rise fall how why what people built build keep keeps single great last first one through across inside day days told edge matter matters think thousand trillions km years year our us we they them that could would should hold hunt turns turn moment more than race useful supports support born dies die make makes alive travelled standing see seen busiest world world's her his its raising mother father".split(
    " ",
  ),
);

/** Turns a written idea into a short search: proper names first, then the first content words. */
export function visualQuery(text: string) {
  const clean = text.replace(/[“”"]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  // Capitalised runs that do not start a sentence: "Silk Road", "Mughal Empire", "New Orleans".
  const proper: string[] = [];
  for (const sentence of clean.split(/[.!?]+\s*/)) {
    let run: string[] = [];
    const flush = () => {
      if (run.length) proper.push(run.join(" "));
      run = [];
    };
    sentence.split(" ").forEach((word, i) => {
      const bare = word.replace(/[^\p{L}'-]/gu, "");
      if (i > 0 && /^\p{Lu}/u.test(bare)) run.push(bare);
      else flush();
      if (/[,;:]$/.test(word)) flush();
    });
    flush();
  }
  const words = terms(clean).filter((w) => !FILLER.has(w) && !/^\d/.test(w));
  const picked: string[] = [];
  for (const name of proper) if (picked.join(" ").split(" ").length < 3) picked.push(name);
  for (const w of words) {
    if (picked.join(" ").split(" ").length >= 3) break;
    if (!picked.some((p) => p.toLowerCase().includes(w))) picked.push(w);
  }
  return picked.join(" ").slice(0, 80);
}

/** The idea's words that are worth searching for, in order. */
export function contentWords(text: string) {
  return terms(text).filter((w) => !FILLER.has(w) && !/^\d/.test(w));
}
