/**
 * Idea mode: a one-line premise ("started with $50 and bought a Rolls-Royce")
 * becomes an original, movie-like story. This module holds the parts that
 * must be the same every time: the beat plan with its hooks and twists, the
 * fiction label, the realism rules and the checks that catch robotic
 * writing and money that does not add up. The writing itself is done by the
 * screenplay agents, inside these rules.
 */
import { planRetention } from "./documentary-engine-core.mjs";
import { checkVersionPurity, getVersion } from "./versions.mjs";

/** Shown on screen from 0:00, first line of the description and every Short. */
export const FICTION_LABELS = Object.freeze({
  "en-US": "A fictional story. Any resemblance to real people is coincidental.",
  "bn-BD": "এটি একটি কাল্পনিক গল্প। বাস্তবের কোনো মানুষের সঙ্গে মিল থাকলে তা কাকতালীয়।",
  ar: "قصة خيالية، وأي تشابه مع أشخاص حقيقيين محض مصادفة.",
});

/** Rules every story follows; the realism auditor and the label guard check them. */
export const STORY_RULES = Object.freeze([
  "Never call an invented story true, and keep the fiction label from 0:00, in the description and in every Short.",
  "No real private people, no real town as a crime scene, no real company as a villain, no cloned voice of a real person.",
  "Beats connect with \"but\" or \"therefore\", never \"and then\".",
  "The hero fails at least once through his own fault, and the win costs him something.",
  "Antagonists have motives a viewer can understand.",
  "Three to five very specific details per story (an exact price, a brand of shoe, a street sound), and exact figures ($47, not \"about $50\").",
  "Money adds up: wealth comes from scale, property or selling a company, and every big jump gets its own scenes.",
  "Show feelings through action; never explain the moral out loud.",
  "Every story differs in premise, structure, characters and visuals; no template channel.",
  "Photoreal AI scenes (a dragon in a real-looking street) are disclosed as altered or synthetic content.",
]);

/**
 * The start of the era bible for US stories: prices and wages a script must
 * match. Sources: US Department of Labor (minimum wage history), FRED series
 * MEHOINUSA646N (median household income, current dollars), dealer price
 * guides for 2026 Rolls-Royce prices (approximate).
 */
export const US_ERA = Object.freeze({
  federalMinimumWage: Object.freeze([
    { from: "1981-01-01", hourly: 3.35 },
    { from: "1990-04-01", hourly: 3.8 },
    { from: "1991-04-01", hourly: 4.25 },
    { from: "1996-10-01", hourly: 4.75 },
    { from: "1997-09-01", hourly: 5.15 },
    { from: "2007-07-24", hourly: 5.85 },
    { from: "2008-07-24", hourly: 6.55 },
    { from: "2009-07-24", hourly: 7.25 },
  ]),
  medianHouseholdIncome: Object.freeze({ 1984: 22420, 1990: 29940, 2024: 83730 }),
  rollsRoyce2026: Object.freeze({ Ghost: [340000, 355000], Cullinan: [432000, 432000], Phantom: [460000, null] }),
});

/**
 * Federal minimum wage on a date (ISO yyyy-mm-dd), or null before 1981.
 * @param {string} date
 */
export function usMinimumWage(date) {
  let wage = null;
  for (const step of US_ERA.federalMinimumWage) if (date >= step.from) wage = step.hourly;
  return wage;
}

/**
 * @typedef {{ id: string, atSeconds: number, purpose: string }} StoryBeat
 */

/**
 * The beat plan for a story of any length. Shorts (up to 3 minutes) open on
 * the impossible image in the first 3 seconds and end on a line that loops
 * back to the start; long stories add the 30-second promise, a twist near a
 * quarter, a reversal at the midpoint, the low point near three quarters, a
 * cliffhanger at 80% and a payoff that closes the opening loop, with a
 * re-hook (a new question before the last one closes) every 3 minutes.
 * @param {{ durationSeconds: number, versionId: string }} input
 */
export function planStory({ durationSeconds, versionId }) {
  const version = getVersion(versionId);
  if (!version) throw new Error("Unknown version \"" + versionId + "\".");
  if (!(durationSeconds >= 15)) throw new Error("A story needs at least 15 seconds.");
  const d = Math.round(durationSeconds);
  /** @param {number} share */
  const at = (share) => Math.round(d * share);
  const label = FICTION_LABELS[version.id];

  if (d <= 180) {
    return {
      format: "short",
      label,
      beats: [
        { id: "hook", atSeconds: 0, purpose: "The impossible image and one spoken question, inside 3 seconds; no intro." },
        { id: "want-and-wound", atSeconds: 3, purpose: "What he lacks and what he wants, one line each." },
        { id: "struggle", atSeconds: at(0.3), purpose: "One concrete attempt that fails by his own mistake." },
        { id: "twist", atSeconds: at(0.6), purpose: "The turn nobody expected." },
        { id: "payoff", atSeconds: at(0.85), purpose: "Answer the opening question and show what it cost." },
        { id: "loop-line", atSeconds: Math.max(at(0.95), d - 3), purpose: "A last line that leads straight back into the first frame." },
      ],
      reHooks: [],
      rules: STORY_RULES,
    };
  }

  const retention = planRetention(d);
  /** @type {StoryBeat[]} */
  const beats = [
    { id: "cold-open", atSeconds: 0, purpose: "Open on the turning point or the end state, with one question; nothing before it." },
    { id: "stakes", atSeconds: 3, purpose: "Who he is, what he lacks and what is at stake, all by 0:15." },
    { id: "promise", atSeconds: Math.min(15, retention.hookEndsAt), purpose: "Restate what the title and thumbnail promised, so the first 30 seconds keep at least 60% of viewers." },
    { id: "wound-and-want", atSeconds: retention.hookEndsAt, purpose: "The ordinary world: the parent's work and the exact thing money could not buy." },
    { id: "inciting-incident", atSeconds: at(0.12), purpose: "The event that makes standing still impossible." },
    { id: "first-twist", atSeconds: at(0.25), purpose: "A turn the viewer did not see coming; he fails through his own fault." },
    { id: "midpoint-reversal", atSeconds: retention.midpointAt, purpose: "What he believed is reversed; the goal changes shape." },
    { id: "low-point", atSeconds: at(0.75), purpose: "Everything at risk; the win will cost something real." },
    { id: "cliffhanger", atSeconds: retention.cliffhangerAt, purpose: "Leave the outcome open right before the resolution." },
    { id: "climax", atSeconds: at(0.88), purpose: "The decision only this character would make." },
    { id: "payoff", atSeconds: retention.payoffStartsAt, purpose: "Close the cold open's loop and show the price paid." },
    { id: "last-line", atSeconds: d - retention.creditsSeconds, purpose: "One quiet line the viewer repeats; never a stated moral." },
  ];
  beats.sort((a, b) => a.atSeconds - b.atSeconds);
  const reHooks = retention.beats.filter((b) => b.kind === "segment-reset").map((b) => b.atSeconds);
  return { format: "long", label, beats, reHooks, rules: STORY_RULES };
}

const ROBOTIC_PHRASES = Object.freeze([
  "stands as a testament", "a testament to", "rich tapestry", "tapestry of", "delve into", "in today's fast-paced world",
  "little did he know", "little did she know", "embark on a journey", "navigate the complexities", "a symphony of",
  "unwavering determination", "it's important to note", "in conclusion", "nestled in", "a beacon of", "in the realm of",
  "game-changer", "against all odds", "a rollercoaster of emotions", "pivotal moment", "ever-evolving", "shrouded in mystery",
]);

const STATED_MORALS = /\b(the lesson (here )?is|this teaches us|the moral of (the|this) story|what we learn from this)\b/i;

/**
 * Catch narration that sounds written by a machine or flat to the ear:
 * stock phrases (English), sentences all the same length, the same opening
 * word again and again, "and then" chains, vague money and stated morals.
 * Also checks that the narration is in the version's own script.
 * @param {string} text
 * @param {string} versionId
 */
export function lintNarration(text, versionId) {
  const version = getVersion(versionId);
  if (!version) throw new Error("Unknown version \"" + versionId + "\".");
  /** @type {{ rule: string, detail: string }[]} */
  const problems = [];
  const lower = text.toLowerCase();
  if (version.id === "en-US") {
    for (const phrase of ROBOTIC_PHRASES) if (lower.includes(phrase)) problems.push({ rule: "robotic-phrase", detail: "\"" + phrase + "\"" });
    const vague = text.match(/\b(about|around|roughly|approximately|nearly) \$\d[\d,]*/gi);
    if (vague) problems.push({ rule: "vague-money", detail: "Use the exact figure instead of " + vague.map((v) => "\"" + v + "\"").join(", ") + "." });
    if (STATED_MORALS.test(text)) problems.push({ rule: "stated-moral", detail: "Show the lesson through what happens; do not say it." });
  }
  const andThen = version.id === "en-US" ? (lower.match(/\band then\b/g) ?? []).length : version.id === "bn-BD" ? (text.match(/তারপর/g) ?? []).length : 0;
  if (andThen >= 3) problems.push({ rule: "and-then-chain", detail: `"and then" ${andThen} times: connect beats with "but" or "therefore".` });

  const sentences = text.split(/(?<=[.!?।؟])\s+/u).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 2);
  const lengths = sentences.map((s) => s.split(/\s+/).length);
  if (lengths.length >= 8) {
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length);
    if (sd / mean < 0.25) problems.push({ rule: "uniform-sentences", detail: "Every sentence is about " + Math.round(mean) + " words long; mix short and long ones." });
  }
  const openers = sentences.map((s) => s.split(/\s+/)[0].toLowerCase().replace(/[^\p{L}\p{M}]/gu, ""));
  for (let i = 2; i < openers.length; i += 1) {
    if (openers[i] && openers[i] === openers[i - 1] && openers[i] === openers[i - 2]) {
      problems.push({ rule: "repeated-opener", detail: "Three sentences in a row start with \"" + openers[i] + "\"." });
      break;
    }
  }
  const purity = checkVersionPurity(text, version.id);
  for (const problem of purity.problems) problems.push({ rule: "version-purity", detail: problem });
  return { ok: problems.length === 0, problems, sentences: sentences.length };
}

/**
 * Check that the story's money path adds up: each step's amount, in order,
 * in one currency. A jump of more than 10x between two steps needs its own
 * scenes (scale, property or selling a company), so it is flagged.
 * @param {{ label: string, amount: number }[]} steps
 */
export function checkMoneyPath(steps) {
  /** @type {string[]} */
  const flags = [];
  steps.forEach((step, i) => {
    if (!(step.amount > 0)) flags.push(`"${step.label}" has no positive amount.`);
    if (i === 0 || !(step.amount > 0) || !(steps[i - 1].amount > 0)) return;
    const ratio = step.amount / steps[i - 1].amount;
    if (ratio > 10) flags.push(`From "${steps[i - 1].label}" to "${step.label}" is a ${Math.round(ratio)}x jump: show how (scale, property or a sale).`);
  });
  return { ok: flags.length === 0, flags };
}
