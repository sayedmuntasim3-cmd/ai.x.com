/**
 * A shot fits its own sentence first, then the film's subject (pure, browser + Node).
 *
 * Owner's note on the Apollo 11 voice film (e0b87efb): while the voice said the crew sat in the capsule at launch, the screen
 * showed the Moon landing, because every search and every score carried the film's subject ("Apollo 11") and the moon pictures
 * are what "Apollo 11" mostly is. A picture must fit the words being spoken, in story order:
 *   - the sentence's time in the story (launch, flight, the Moon, the return): a picture that belongs to another stage loses
 *   - the people the sentence names: a picture that names that person wins
 * A sentence with no stage word of its own stays in the stage of the sentence before it, so the story only reaches the Moon when the words do.
 */

/** Stages of a story of a mission, in order. Words are matched whole, lower case. */
export const STAGES = Object.freeze([
  { id: "launch", words: /\b(?:launch(?:ed|es|ing|pad)?|lift-?off|countdown|rocket|saturn|pad|gantry|capsule|command module|crew|cockpit|instruments?|clock|ignition|engines?|boosters?|ascent|ascend|cape|kennedy|strapped|checklist|suit(?:ed)?|workers|engineers|technicians|families|family|400,000|mission control|trained|training|morning|dawn)\b/gi },
  { id: "flight", words: /\b(?:orbit(?:ed|ing)?|in space|coast(?:ed|ing)?|translunar|three days|journey|voyage|cruise|earthrise|weightless|spacecraft|heading for|on (?:its|their) way)\b/gi },
  { id: "moon", words: /\b(?:moon|lunar|surface|crater|tranquility|landing|landed|lands?|eagle|footprints?|boots?|flag|regolith|moonwalk|descent|touchdown|dust|magnificent desolation)\b/gi },
  { id: "return", words: /\b(?:splashdown|recovery|parachutes?|quarantine|returned|return(?:ing)? home|parade|homecoming|pacific|aircraft carrier|hornet)\b/gi },
]);

/** How much a candidate gains or loses (units of the picture score: 10 x CLIP similarity, which spans about 2). */
export const FIT = Object.freeze({ stage: 2, wrongStage: 3, name: 2 });

/** @param {string} text @returns {Record<string, number>} hits per stage */
export function stageHits(text) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const s of STAGES) out[s.id] = (String(text ?? "").match(s.words) ?? []).length;
  return out;
}

/**
 * The stage of each sentence of a film, in order: the stage with the most hits in the sentence, else the stage of the sentence before
 * (null until the first stage word).
 * @param {string[]} sentences @returns {(string | null)[]}
 */
export function storyStages(sentences) {
  /** @type {string | null} */
  let carried = null;
  return sentences.map((sentence) => {
    const hits = stageHits(sentence);
    const best = Object.entries(hits).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] > 0) carried = best[0];
    return carried;
  });
}

/** Words that start a sentence without naming anyone. */
const OPENERS = new Set("the a an and but or so then it its he she they we you i this that these those there here in on at to of for from with by as is was were be been are not no yes if when while after before once now today tonight four three two one five six seven eight nine ten first second third last next what which who how why where would could should will can did do does had has have men people many some all every each only still just also soon later earlier together".split(" "));

/** Capitalised words a sentence names (a first word counts unless it is a plain opener) ("Armstrong", "Collins"). @param {string} sentence */
export function namedPeople(sentence) {
  const out = new Set();
  const words = String(sentence ?? "").split(/\s+/);
  words.forEach((w, i) => {
    const bare = w.replace(/[^\p{L}'-]/gu, "");
    const first = i === 0 || /[.!?]["')\]]?$/.test(words[i - 1] ?? "");
    if (bare.length > 2 && /^\p{Lu}/u.test(bare) && !(first && OPENERS.has(bare.toLowerCase())) && !/^(?:Apollo|Moon|Earth|Saturn|Eagle|Columbia|July|Florida|Kennedy|Cape|NASA|God|America|American|Americans)$/.test(bare)) out.add(bare.toLowerCase());
  });
  return [...out];
}

/**
 * What a candidate's own words (title, tags) add to or take from its score for this shot, before the film's subject is counted.
 * @param {{ stage: string | null, people?: string[] }} shot @param {string} candidateText
 * @returns {number}
 */
export function fitAdjust(shot, candidateText) {
  let add = 0;
  if (shot.stage) {
    const hits = stageHits(candidateText);
    const own = hits[shot.stage] ?? 0;
    const others = Object.entries(hits).filter(([id]) => id !== shot.stage).reduce((n, [, h]) => n + h, 0);
    if (own > 0) add += FIT.stage + Math.min(own - 1, 2) * 0.5;
    else if (others > 0) add -= FIT.wrongStage;
  }
  const text = String(candidateText ?? "").toLowerCase();
  if ((shot.people ?? []).some((p) => text.includes(p))) add += FIT.name;
  return add;
}

/**
 * The stage and people of every shot, from the sentences heard over them, in film order.
 * @template {{ start: number, sentence?: string, heard?: string }} S
 * @param {S[]} shots @returns {Map<S, { stage: string | null, people: string[] }>}
 */
export function planFit(shots) {
  const order = [...shots].sort((a, b) => a.start - b.start);
  const sentences = order.map((s) => s.sentence || s.heard || "");
  // Consecutive shots share a sentence: its stage is worked out once, on its own words.
  const stages = storyStages(sentences);
  return new Map(order.map((s, i) => [s, { stage: stages[i], people: namedPeople(sentences[i]) }]));
}
