/**
 * The autonomous run plan: which squads work, in which order, and which
 * automatic checks every film must pass, for each kind of input. Nobody is
 * asked anything during a run. A failed check goes back to the squad that
 * owns it; if it still fails, the element is replaced by a safe fallback
 * (the shot is dropped, the reference withheld, the music muted) instead of
 * waiting for a person. Publishing is never automatic: the owner publishes.
 */
import { getAgent } from "./agent-roster.mjs";
import { VERSION_IDS, getVersion } from "./versions.mjs";
import { musicPlanFor } from "./voice-plan.mjs";

/**
 * @typedef {import("./voice-plan.mjs").ContentType} ContentType
 * @typedef {import("./voice-plan.mjs").VoiceSource} VoiceSource
 * @typedef {{ id: string, title: string, agents: string[], perVersion: boolean, gates: string[] }} Stage
 */

/** Automatic checks; a film is finished only when all that apply pass. */
export const GATES = Object.freeze({
  rights: "Every asset has a licence record (source page, licence, credit); anything without one is replaced, never used.",
  "quran-text": "Every ayah on screen equals the Tanzil text for its reference, character for character; recognised or generated text is never shown.",
  "quran-reference": "No surah:ayah number is shown for a passage that occurs in more than one place unless the recording settles which one it is.",
  "music-policy": "Nothing under Quran recitation or quotations; no instruments where the policy is no-instruments; licensed tracks only.",
  "visual-adab": "No depiction of prophets, Companions, angels or Allah; in recitation videos also no people, AI-generated people or animals, or Paradise and Hell imagery.",
  "version-purity": "Each version's narration, captions and titles are in its own language and script only.",
  "fiction-label": "An invented story carries the fiction label from 0:00, in the description and in every Short, and is never called true.",
  "ai-disclosure": "Every photoreal AI scene is listed for YouTube's altered or synthetic content disclosure.",
  "voice-preservation": "The owner's voice is never pitch-shifted, sped up, re-synthesised or given echoes; the original is kept.",
  loudness: "The master measures -14 LUFS (within 1 LU) with true peak at or below -1 dBTP.",
  technical: "No black frames, duplicate shots, audio drift or subtitle timing errors.",
});

export const FAILURE_POLICY = Object.freeze({
  retries: 2,
  then: "replace the failing element with a safe fallback (drop the shot, withhold the reference, mute the music) and record why",
  stopsTheRun: ["Quran recitation requested with a synthetic or cloned voice", "an upload whose rights attestation is refused"],
});

/**
 * @param {string} squad
 * @param {string[]} ids
 */
const from = (squad, ids) => ids.map((id) => squad + "-" + id);

/**
 * Plan a run for one input.
 * @param {{ contentType: ContentType, islamic?: boolean, needsAiVisuals?: boolean, source?: VoiceSource | "none", versions?: readonly string[], durationSeconds?: number }} input
 */
export function planRun({ contentType, islamic, needsAiVisuals = false, source = "none", versions = VERSION_IDS, durationSeconds }) {
  for (const id of versions) if (!getVersion(id)) throw new Error("Unknown version \"" + id + "\".");
  if (versions.length === 0) throw new Error("Choose at least one version.");
  const quran = contentType === "quran_recitation";
  const story = contentType === "story";
  const isIslamic = islamic ?? (quran || contentType === "islamic");
  if (quran && source === "elevenlabs") throw new Error("Quran recitation is never synthesised or voice-cloned.");
  if (quran && needsAiVisuals) throw new Error("Recitation videos never use AI-generated imagery.");

  /** @type {Stage[]} */
  const stages = [];
  /**
   * @param {string} id
   * @param {string} title
   * @param {string[]} agents
   * @param {{ perVersion?: boolean, gates?: string[] }} [options]
   */
  const add = (id, title, agents, options = {}) => stages.push({ id, title, agents, perVersion: options.perVersion ?? false, gates: options.gates ?? [] });

  const audio = source === "own-recording" || quran;
  add("intake", "Understand the input", [
    ...(audio ? ["intake-transcriber", "intake-rights-intake"] : []),
    ...(quran || isIslamic ? ["intake-recitation-identifier"] : []),
    ...from("intake", ["language-detector", "content-classifier", "intent-interpreter", "fact-fiction-judge", "version-planner", "duration-planner", "brief-writer"]),
  ]);

  if (quran) {
    add("sources", "Identify the ayat and their meaning", from("quran", ["ayah-aligner", "reference-checker", "meaning-researcher", "translation-curator"]), { gates: ["quran-reference"] });
    add("structure", "Plan the film around the recitation", ["quran-recitation-editor", "audience-first-minute", "editing-chapter-transitions"]);
  } else if (story) {
    add("sources", "Build the story world", from("screenplay", ["premise-architect", "era-researcher", "character-designer"]));
    add("structure", "Plot, twists and hooks", [...from("screenplay", ["plot-architect", "hook-doctor", "money-path-auditor"]), "story-open-loops", "story-emotional-arc", "audience-retention"]);
  } else {
    add("sources", "Research every claim", [
      ...from("research", ["primary-source", "fact-ledger", "date-check", "statistics", "peer-review", "counterevidence", "geography", "people-orgs", "source-diversity", "freshness"]),
      ...(isIslamic ? from("quran", ["meaning-researcher", "reference-checker"]) : []),
    ]);
    add("structure", "Chapters, hook and open loops", [...from("story", ["chapter-arc", "opening-hook", "open-loops", "emotional-arc", "ending"]), "audience-retention"]);
  }

  /** Writers and reviewers for each version, resolved per version at run time. */
  const versionWriters = ["versions-{lang}-writer", "versions-{lang}-reviewer", "versions-separation-guard"];
  if (quran) {
    add("script", "Captions and translation for each version", [...from("quran", ["text-guardian", "arabic-typographer"]), "versions-subtitle-builder", "versions-separation-guard"], { perVersion: true, gates: ["quran-text", "version-purity"] });
  } else if (story) {
    add("script", "Write each version", [...from("screenplay", ["scene-writer", "narration-writer", "realism-auditor"]), ...versionWriters, "story-script-coverage"], { perVersion: true, gates: ["version-purity", "fiction-label"] });
  } else {
    add("script", "Write each version", [...from("story", ["narration", "continuity", "exposition", "script-coverage"]), ...versionWriters, "quality-claim-language"], { perVersion: true, gates: ["version-purity", ...(isIslamic ? ["quran-text"] : [])] });
  }

  const voiceAgents = source === "elevenlabs"
    ? from("voice", ["elevenlabs-operator", "pronunciation", "pacing-editor", "loudness-engineer"])
    : from("voice", ["recording-analyst", "voice-guardian", "repair-engineer", "tone-dynamics", "loudness-engineer", ...(quran ? [] : ["pronunciation", "pacing-editor"])]);
  // One recitation serves every version; narration is recorded or read per version.
  add("voice", quran ? "Clean and level the recitation" : "Record or read each version", voiceAgents, { perVersion: !quran, gates: ["voice-preservation"] });

  add("visuals", "Find and shape the pictures", [
    ...from("cinematography", ["visual-director", "composition", "shot-variety", "accessibility"]),
    ...from("footage", ["asset-strategist", "exact-match", "provider-coverage", "license", "attribution", "duplicate-assets", "scene-fit", "release-risk", "rights-gate"]),
    ...(quran ? ["animation-kinetic-type"] : from("animation", ["motion-director", "map-motion", "data-graphics", "kinetic-type"])),
    ...(quran || isIslamic ? from("quran", ["visual-matcher", "visual-adab-guard"]) : []),
    ...(story && needsAiVisuals ? ["screenplay-ai-scene-director"] : []),
  ], { gates: ["rights", ...(quran || isIslamic ? ["visual-adab"] : []), ...(needsAiVisuals ? ["ai-disclosure"] : [])] });

  const music = Object.fromEntries(versions.map((v) => [v, musicPlanFor({ contentType, versionId: v })]));
  const anyMusic = Object.values(music).some((plan) => plan.policy !== "none");
  add("edit", "Edit, grade, music and mix", [
    ...from("editing", ["pace", "cut-logic", "timeline-integrity", "b-roll-balance", "edit-qc"]),
    ...from("color", ["color-match", "look-dev", "subtitle-style", "encode", "final-master"]),
    ...(anyMusic ? ["voice-music-supervisor", "audio-music-arc"] : []),
    "voice-mix-engineer",
    "audio-audio-qc",
  ], { perVersion: true, gates: ["music-policy", "loudness"] });

  add("checks", "Automatic checks", [
    ...from("quality", ["hallucination", "defamation", "sensitive-context", "artifact-qc", "subtitle-text", "timeline-qc", "license-qc", "accessibility-qc", "release-gate"]),
    ...(quran || isIslamic ? ["quran-islamic-reviewer"] : []),
    ...(story ? ["screenplay-fiction-label-guard"] : []),
  ], { perVersion: true, gates: ["technical", "rights", "version-purity", ...(story ? ["fiction-label"] : []), ...(quran || isIslamic ? ["quran-text", "music-policy", "visual-adab"] : [])] });

  add("package", "Titles, thumbnails and descriptions", [...from("audience", ["title", "thumbnail", "metadata", "platform-specs"]), "versions-packaging-localizer"], { perVersion: true });

  for (const stage of stages) {
    for (const id of stage.agents) {
      if (!id.includes("{lang}") && !getAgent(id)) throw new Error("The plan names an agent that does not exist: " + id);
    }
  }
  const resolved = new Set();
  for (const stage of stages) {
    for (const id of stage.agents) {
      if (!id.includes("{lang}")) resolved.add(id);
      else for (const v of versions) resolved.add(id.replace("{lang}", v === "ar" ? "arabic" : v === "en-US" ? "english" : "bangla"));
    }
  }
  for (const id of resolved) if (!getAgent(id)) throw new Error("The plan names an agent that does not exist: " + id);
  return {
    contentType,
    islamic: isIslamic,
    versions: [...versions],
    durationSeconds: durationSeconds ?? null,
    stages,
    gates: [...new Set(stages.flatMap((s) => s.gates))].map((id) => ({ id, rule: GATES[/** @type {keyof typeof GATES} */ (id)] })),
    music,
    agentsUsed: resolved.size,
    humanApprovalSteps: 0,
    failurePolicy: FAILURE_POLICY,
    publishing: "Never automatic: the finished versions are delivered and the owner publishes them.",
  };
}
