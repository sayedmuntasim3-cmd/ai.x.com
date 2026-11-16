// Free shot list, with no AI model to pay for: search the archives for the film's subject, then
// read the titles and tags that come back. Names that recur across many good results ("Akbar",
// "Taj Mahal", "Fatehpur Sikri") are what the archives actually hold pictures of, so they make the
// best searches for the chapters. Every phrase is grounded in real, openly licensed images.

import { contentWords, visualQuery } from "./query";
import { searchMedia } from "./search";
import { terms } from "./rank";
import type { MediaEnv, MediaResult } from "./types";

export type ShotPlanChapter = { title: string; start: number; end: number };
export type ShotPlanRequest = { idea: string; topic?: string; style?: string; audience?: string; chapters: ShotPlanChapter[] };
export type ShotPlanScene = { chapter: string; queries: string[] };
export type ShotPlan = { scenes: ShotPlanScene[]; source: "agent" | "open-model" | "claude" | "archives" | "keywords" };

/** Archives that answer within a couple of seconds and have descriptive titles. */
const MINING_SOURCES = [
  "wikimedia-commons",
  "nasa",
  "met",
  "artic",
  "cleveland",
  "smk",
  "mia",
  "loc",
  "wellcome",
  "inaturalist",
  "digital-commonwealth",
  "wordpress-photos",
  "europeana",
  "smithsonian",
  "unsplash",
  "pixabay",
];

// Words that appear in archive titles but say nothing about the subject.
const NOISE = new Set(
  "portrait portraits of the a an and from in on at with by for to view views image images photo photograph photographs picture print prints page folio recto verso album leaf detail details untitled study sketch drawing painting copy fragment plate fig figure no number series part side front back left right top bottom close up closeup museum collection item object scene scenes text textile design pattern circa ca early late century style school workshop attributed after manner possibly probably called known also other its his her their one two three four new old great small large little near unknown anonymous artist".split(
    " ",
  ),
);

/** Capitalised phrases in a title. `proper` is false when the phrase is one word that only starts the title. */
function phrasesIn(text: string): { phrase: string; proper: boolean }[] {
  const out: { phrase: string; proper: boolean }[] = [];
  let index = 0;
  let runStart = 0;
  // Runs of capitalised words, allowing "of"/"de"/"al" inside: "Shah Jahan", "Fort of Agra".
  const tokens = text.replace(/[“”"(),.;:!?[\]{}|/]+/g, " , ").split(/\s+/).filter(Boolean);
  let run: string[] = [];
  const flush = () => {
    while (run.length && /^(of|de|al|the|and)$/i.test(run[run.length - 1])) run.pop();
    const words = run.filter((w) => !NOISE.has(w.toLowerCase()));
    if (words.length) {
      const phrase = run.join(" ").replace(/^(The|A|An)\s+/, "");
      const multi = words.length >= 2;
      if (phrase.length >= 3 && !NOISE.has(phrase.toLowerCase()) && phrase !== phrase.toUpperCase()) out.push({ phrase, proper: multi || runStart > 0 });
    }
    run = [];
  };
  for (const token of tokens) {
    if (token === ",") {
      flush();
      index += 1;
      continue;
    }
    if (/^\p{Lu}[\p{L}'’-]+$/u.test(token) && !/^[IVXLC]+$/.test(token)) {
      if (!run.length) runStart = index;
      run.push(token);
    } else if (run.length && /^(of|de|al)$/i.test(token)) run.push(token);
    else flush();
    if (run.length >= 4) flush();
    index += 1;
  }
  flush();
  return out;
}

/** Ranks the names that recur in good results for the subject. */
export function minePhrases(results: MediaResult[], subject: string, max = 24) {
  const subjectWords = new Set(terms(subject));
  const stats = new Map<string, { label: string; weight: number; sources: Set<string>; proper: boolean }>();
  // Only results that actually match the subject teach us anything about it.
  for (const r of results.filter((x) => terms(`${x.title} ${(x.tags ?? []).join(" ")} ${x.description ?? ""}`).some((w) => subjectWords.has(w)))) {
    const found = new Set<string>();
    for (const { phrase, proper } of [...phrasesIn(r.title), ...(r.tags ?? []).filter((t) => /\p{Lu}/u.test(t)).flatMap(phrasesIn)]) {
      const key = phrase.toLowerCase();
      const words = terms(phrase);
      // Skip the subject itself and phrases made only of its words.
      if (!words.length || words.every((w) => subjectWords.has(w))) continue;
      found.add(key);
      if (!stats.has(key)) stats.set(key, { label: phrase, weight: 0, sources: new Set(), proper: false });
      if (proper) stats.get(key)!.proper = true;
    }
    for (const key of found) {
      const s = stats.get(key)!;
      s.weight += 0.4 + r.score;
      s.sources.add(r.source);
    }
  }
  return [...stats.values()]
    // A name seen in one record only is often a caption detail; two or more, or two archives, is a theme.
    .filter((s) => s.proper && (s.weight >= 2.2 || s.sources.size >= 2))
    .map((s) => ({ label: s.label, weight: s.weight * (1 + 0.25 * (s.sources.size - 1)) }))
    .sort((a, b) => b.weight - a.weight)
    // Drop a phrase contained in a stronger one ("Jahan" after "Shah Jahan").
    .filter((s, i, all) => !all.slice(0, i).some((t) => t.label.toLowerCase().includes(s.label.toLowerCase())))
    .slice(0, max)
    .map((s) => s.label);
}

/** Plan without any AI model: keywords of the idea for every chapter. */
export function keywordPlan(req: ShotPlanRequest): ShotPlan {
  const base = visualQuery(req.idea) || req.topic || "documentary";
  const used = new Set(terms(base));
  const alt = contentWords(req.idea).filter((w) => !used.has(w)).slice(0, 3).join(" ");
  return { source: "keywords", scenes: req.chapters.map((c) => ({ chapter: c.title, queries: alt ? [base, alt] : [base] })) };
}

/** Shot list from the archives themselves: free, and every search is known to have pictures. */
export async function archivePlan(req: ShotPlanRequest, env: MediaEnv = {}, deps: { fetch?: typeof fetch } = {}): Promise<ShotPlan> {
  const subject = visualQuery(req.idea) || req.topic || "";
  if (!subject || !req.chapters.length) return keywordPlan(req);
  const res = await searchMedia({ query: subject, sources: MINING_SOURCES, perSource: 20, limit: 200, minSize: 0, timeoutMs: 5000, rights: "share-alike" }, env, deps);
  const names = minePhrases(res.results, subject, req.chapters.length * 2 + 2);
  if (names.length < 2) return keywordPlan(req);

  // Opening and closing chapters return to the subject itself; the middle walks through the names.
  const last = req.chapters.length - 1;
  let next = 0;
  const take = () => names[next++ % names.length];
  const scenes = req.chapters.map((c, i) => {
    const queries = i === 0 || (i === last && last > 0) ? [subject, take()] : [take(), take()];
    return { chapter: c.title, queries: [...new Set(queries)] };
  });
  return { source: "archives", scenes };
}
