/**
 * What a voiceover film asks of the free Groq brain, measured before it runs: requests and prompt tokens per
 * stage, from the REAL prompt builders (the stage system prompts with their role craft, the real batchers,
 * the real scene skeleton and edit sheet) and a synthetic transcript of a given length.
 *
 * The free key allows about 1,000 requests a day and 8,000 tokens a minute, per model (worker/groq.mjs).
 * A 40-minute film must finish inside that, so this answers two questions in numbers:
 *   - how many calls the film makes (a day's 1,000 per model must hold, with the retries of a busy minute),
 *   - how many tokens each call carries (a burst of calls must not pass 8,000 in one minute on one model).
 * Nothing here touches the network or the disk, and no brain is called: the estimator runs the code-only
 * paths (the words' own beats and picture plan) to build the same prompts a real film would send.
 */
import { DIRECTOR_SYSTEM, planBeats, planShots, qaSheet, QA_SYSTEM } from "./shot-plan.mjs";
import { brainBatches, planVoiceVisuals, VOICE_VISUALS_SYSTEM } from "./voice-visuals.mjs";
import { voiceStructure } from "./voice-understand.mjs";
import { voiceSkeleton } from "./voice-scenes.mjs";
import { editInstruction, editSheet } from "./edit-director.mjs";
import { roleCraft } from "./role-craft.mjs";

/** Models the free key runs, each with its own 1,000 requests a day and 8,000 tokens a minute. */
export const BRAIN_MODELS = 3;
/** The day's requests on one free model (worker/groq.mjs: measured 20 Nov 2026). */
export const FREE_REQUESTS_PER_DAY = 1000;
/** Characters per token for the estimate: rounded down from the measured 4.27, so the count errs on the large side. */
const CHARS_PER_TOKEN = 4;
/** A narration read at a documentary's pace: about 2.4 words a second (144 a minute). */
const WORDS_PER_SECOND = 2.4;
/** Scenes the scene splitter makes from a steady narration (voice-scenes.mjs: target 8 s, max 14 s). */
export const SCENES_PER_MINUTE = 7.5;

/** A documentary paraphrase of one sentence; the synthetic transcript is cut from it. */
const NARRATION = ("The engineers knew the ground was soft and still they poured the first concrete in nineteen sixty three because the city had run out of time and the money was already promised to the contractor Ramesh Babu who walked the site every morning").split(" ");

/**
 * A synthetic transcript: scenes that tile the film, each with timed words, as understanding.json holds them.
 * @param {number} minutes @param {number} scenesPerMinute
 */
export function syntheticScenes(minutes, scenesPerMinute = SCENES_PER_MINUTE) {
  const sceneSeconds = 60 / scenesPerMinute;
  const count = Math.max(1, Math.round(minutes * scenesPerMinute));
  const total = minutes * 60;
  /** @type {{ id: number, sc: string, start: number, end: number, from: number, to: number, words: { text: string, start: number, end: number }[], narration: string }[]} */
  const scenes = [];
  for (let n = 0; n < count; n += 1) {
    const start = Math.round(((total * n) / count) * 1000) / 1000;
    const end = Math.round(((total * (n + 1)) / count) * 1000) / 1000;
    const wordsWanted = Math.max(4, Math.round(sceneSeconds * WORDS_PER_SECOND));
    /** @type {string[]} */
    const texts = [];
    for (let i = 0; i < wordsWanted; i += 1) texts.push(NARRATION[(n * 7 + i) % NARRATION.length]);
    const narration = texts.join(" ").replace(/\s+/g, " ").trim();
    const words = texts.map((text, i) => ({
      text,
      start: Math.round((start + (sceneSeconds * i) / texts.length) * 1000) / 1000,
      end: Math.round((start + (sceneSeconds * (i + 1)) / texts.length) * 1000) / 1000,
    }));
    scenes.push({ id: n + 1, sc: "SC" + String(n + 1).padStart(4, "0"), start, end, from: 0, to: words.length - 1, words, narration });
  }
  return scenes;
}

/** Prompt tokens of one call's parts, the way the estimator counts them. @param {string[]} parts */
const tokensOf = (parts) => Math.ceil(parts.reduce((n, p) => n + String(p ?? "").length, 0) / CHARS_PER_TOKEN);

/** The picture-plan brief exactly as planVoiceVisuals builds it. @param {any} o */
function visualsBrief(o) {
  const s = o.structure;
  return (o.topic ? `The film is about: ${o.topic}. ` : "") + (o.worldNote ? `${o.worldNote} ` : "") + `Topic words: ${s.topicWords.map((/** @type {any} */ t) => t.word).join(", ")}. Names: ${s.entities.map((/** @type {any} */ e) => e.name).join(", ") || "none"}. Dates: ${s.dates.map((/** @type {any} */ d) => d.text).join("; ") || "none"}.`;
}

/**
 * The brain's bill for one film, stage by stage.
 * @param {{ minutes?: number, scenesPerMinute?: number, topic?: string }} [o]
 * @returns {Promise<{ minutes: number, scenesPerMinute: number, scenes: number, seconds: number, stages: { stage: string, name: string, calls: number, tokens: number, largestCall: number }[], requests: number, tokens: number, averageTokensPerMinute: number, models: number, requestsPerModel: number, budget: { requestsPerDay: number, tokensPerMinute: number, dayFits: boolean, burstFits: boolean } }>}
 */
export async function estimateBrainBudget(o = {}) {
  const minutes = Math.max(1, Number(o.minutes) || 40);
  const scenesPerMinute = Math.max(0.5, Number(o.scenesPerMinute) || SCENES_PER_MINUTE);
  const topic = String(o.topic ?? "The bridge a city built on soft ground");
  const scenes = syntheticScenes(minutes, scenesPerMinute);
  const structure = voiceStructure(scenes);
  const seconds = scenes[scenes.length - 1].end;

  // V3 Director: the beats from the words' own plan, so the brief and the batches are the real ones.
  const director = await planBeats({ scenes, structure, topic });
  const line3 = (/** @type {any} */ s) => `${s.sc} | ${s.start.toFixed(1)}-${s.end.toFixed(1)} | ${s.narration}`;
  const sceneOf = new Map(scenes.map((s) => [s.sc, s]));
  const batches3 = brainBatches(scenes, structure, (sc) => line3(sceneOf.get(sc)).length, 9000);
  const brief3 = `World: ${director.world.city ? director.world.city + ", " : ""}${director.world.country || "as the voice says"}; era ${director.world.era || "as the voice says"}; money in ${director.world.currency || "the voice's currency"}; people: ${director.world.demonym || "as the voice says"}. Genre: ${director.genre}. Visual language: ${director.language}. The film is about: ${topic}.`;
  const system3 = [DIRECTOR_SYSTEM, roleCraft("V3")].join("\n\n");
  const v3 = batches3.map((batch) => tokensOf([system3, `${brief3}\n\n${batch.map(line3).join("\n")}`]));

  // V4 pictures: the skeleton the stage sends, batched by the same function and size.
  const skeleton = voiceSkeleton(scenes, "C1").split("\n").map((l) => l.replace("| SHOTS: TODO", "| SHOTS: TODO | SRC: TODO")).join("\n");
  const lineOf = new Map(skeleton.split("\n").map((l) => [/SC\d{4,5}/.exec(l)?.[0] ?? "", l]));
  const batches4 = brainBatches(scenes, structure, (sc) => (lineOf.get(sc) ?? "").length, 14000);
  const brief4 = visualsBrief({ topic, structure });
  const system4 = [VOICE_VISUALS_SYSTEM, roleCraft("V4")].join("\n\n");
  const v4 = batches4.map((batch) => tokensOf([system4, `${brief4}\n\n${batch.map((/** @type {any} */ s) => lineOf.get(s.sc)).join("\n")}`]));

  // The code-only picture plan and shot plan: the scene lines the Edit Director and the QA pass read, plus the world briefing.
  const planned = await planVoiceVisuals({ scenes, structure, topic, brain: null });
  const plan = planShots({ markdown: planned.markdown, scenes, beats: director.beats, world: director.world, genre: director.genre, topic, structure });

  // V5 Edit: the edit sheet the stage sends, batched at the same 7,000 characters.
  const system5 = `You are a documentary film editor. Answer with one JSON block only.\n\n${roleCraft("V5")}`;
  const rows = editSheet(plan.markdown).split("\n");
  /** @type {string[][]} */
  const batches5 = [[]];
  for (const row of rows) {
    const last = batches5[batches5.length - 1];
    if (last.length && last.join("\n").length + row.length > 7000) batches5.push([row]);
    else last.push(row);
  }
  const v5 = batches5.filter((b) => b.length).map((batch) => tokensOf([system5, editInstruction("C1", batch.join("\n"), `a ${director.genre} voiceover film`, [])]));

  // V6 QA: one call over the compact sheet.
  const v6 = [tokensOf([QA_SYSTEM, qaSheet({ shots: plan.shots, scenes, hook: plan.hook })])];

  /** @type {{ stage: string, name: string, calls: number, tokens: number, largestCall: number }[]} */
  const stages = [
    { stage: "V3", name: "Director (beats)", calls: v3.length, tokens: v3.reduce((a, b) => a + b, 0), largestCall: Math.max(0, ...v3) },
    { stage: "V4", name: "Picture plan", calls: v4.length, tokens: v4.reduce((a, b) => a + b, 0), largestCall: Math.max(0, ...v4) },
    { stage: "V5", name: "Edit Director", calls: v5.length, tokens: v5.reduce((a, b) => a + b, 0), largestCall: Math.max(0, ...v5) },
    { stage: "V6", name: "QA audit", calls: v6.length, tokens: v6.reduce((a, b) => a + b, 0), largestCall: Math.max(0, ...v6) },
  ];
  const requests = stages.reduce((n, s) => n + s.calls, 0);
  const tokens = stages.reduce((n, s) => n + s.tokens, 0);
  const largest = Math.max(0, ...stages.map((s) => s.largestCall));
  return {
    minutes,
    scenesPerMinute,
    scenes: scenes.length,
    seconds,
    stages,
    requests,
    tokens,
    averageTokensPerMinute: Math.ceil(tokens / minutes),
    models: BRAIN_MODELS,
    requestsPerModel: Math.ceil(requests / BRAIN_MODELS),
    budget: {
      requestsPerDay: FREE_REQUESTS_PER_DAY,
      tokensPerMinute: 8000,
      // A day holds when the busiest model's share (with retries) stays inside its 1,000 requests.
      dayFits: Math.ceil((requests * 1.5) / BRAIN_MODELS) < FREE_REQUESTS_PER_DAY,
      // A burst holds when no single call is over the minute; the runner's bucket then spaces the calls.
      burstFits: largest <= 8000,
    },
  };
}
