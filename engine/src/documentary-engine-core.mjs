/**
 * Documentary engine core: media budget, retention skeleton, five-layer media
 * allocation, render chunking and run-time budget for a film of any length.
 * Pure functions with no browser or Worker dependency, so every rule can be
 * regression-tested in Node. All budget arithmetic is integer-based, so the
 * same duration always produces the same plan (45 minutes gives exactly 243
 * media, never 244 from a floating-point remainder).
 */

/** YouTube's upload limit; a typo such as "4000 minutes" cannot start a runaway job. */
export const MAX_DURATION_SECONDS = 12 * 60 * 60;

/** Render frame rate used by the documentary renderer. */
export const FPS = 24;

/**
 * @typedef {{ hours?: number, minutes?: number, seconds?: number }} DurationInput
 * @typedef {{ ok: true, durationSeconds: number, baseShots: number, bufferShots: number, totalUniqueMedia: number, averageShotSeconds: number } | { ok: false, error: string }} MediaNeedsResult
 */

/**
 * @param {number} numerator
 * @param {number} denominator
 */
function ceilDiv(numerator, denominator) {
  return Math.floor((numerator + denominator - 1) / denominator);
}

/**
 * Media needed for a film: 4.5 shot slots per minute (about 13.3 s per shot)
 * plus a 20% buffer for rights rejects, QA failures and the faster-cut hook.
 * A bare number means minutes, matching Total = ceil(minutes x 4.5 x 1.2).
 * @param {number | string | DurationInput} duration
 * @returns {MediaNeedsResult}
 */
export function calculateMediaNeeds(duration) {
  const raw =
    typeof duration === "number" || typeof duration === "string"
      ? (/^\s*\d+(\.\d+)?\s*$/.test(String(duration)) ? Number(duration) * 60 : Number.NaN)
      : (Number(duration?.hours) || 0) * 3600 + (Number(duration?.minutes) || 0) * 60 + (Number(duration?.seconds) || 0);
  if (!Number.isFinite(raw) || raw < 1) return { ok: false, error: "Choose a duration of at least 1 second." };
  const durationSeconds = Math.round(raw);
  if (durationSeconds > MAX_DURATION_SECONDS) {
    return { ok: false, error: "Choose a duration of " + MAX_DURATION_SECONDS / 3600 + " hours or less." };
  }
  // 4.5 shots/min = 3 shots per 40 s. 4.5 x 1.2 = 5.4 media/min = 9 media per 100 s.
  const baseShots = ceilDiv(durationSeconds * 3, 40);
  const totalUniqueMedia = ceilDiv(durationSeconds * 9, 100);
  return {
    ok: true,
    durationSeconds,
    baseShots,
    bufferShots: totalUniqueMedia - baseShots,
    totalUniqueMedia,
    averageShotSeconds: Math.round((durationSeconds / baseShots) * 100) / 100,
  };
}

/**
 * @typedef {"hook" | "promise" | "segment-reset" | "part-break" | "midpoint-turn" | "cliffhanger" | "payoff" | "credits"} BeatKind
 * @typedef {{ atSeconds: number, kind: BeatKind }} RetentionBeat
 * @typedef {{ index: number, startSeconds: number, endSeconds: number }} RetentionPart
 * @typedef {{ hookEndsAt: number, parts: RetentionPart[], segmentCount: number, patternInterruptEverySeconds: number, patternInterruptCount: number, midpointAt: number, cliffhangerAt: number, payoffStartsAt: number, creditsSeconds: number, beats: RetentionBeat[] }} RetentionPlan
 * @typedef {{ segmentSeconds?: number, patternInterruptEverySeconds?: number, partTargetSeconds?: number, creditsSeconds?: number }} RetentionOptions
 */

/**
 * Retention skeleton: a hook of up to 30 s, a new segment every 3 minutes,
 * a pattern interrupt every 25 s, parts of about 20 minutes for long films
 * (each part break lands on a segment boundary), a midpoint turn, a cliffhanger
 * at 80% and a payoff before the credits.
 * @param {number} durationSeconds
 * @param {RetentionOptions} [options]
 * @returns {RetentionPlan}
 */
export function planRetention(durationSeconds, options = {}) {
  const segmentSeconds = options.segmentSeconds ?? 180;
  const interruptEvery = options.patternInterruptEverySeconds ?? 25;
  const partTarget = options.partTargetSeconds ?? 20 * 60;
  const d = durationSeconds;
  // Credits and the hook never take more than a tenth and a half of a very short film.
  const creditsSeconds = Math.min(options.creditsSeconds ?? Math.min(60, Math.max(10, Math.round(d * 0.005))), Math.floor(d * 0.1));
  const hookEndsAt = Math.min(30, Math.max(5, Math.round(d * 0.15)), Math.floor(d * 0.5));
  /** @type {number[]} */
  const resets = [];
  for (let s = segmentSeconds; s < d - creditsSeconds; s += segmentSeconds) resets.push(s);
  const segmentCount = 1 + resets.length;
  const partCount = durationSeconds <= 30 * 60 ? 1 : Math.max(2, Math.round(durationSeconds / partTarget));

  /** @type {RetentionPart[]} */
  const parts = [];
  let partStart = 0;
  for (let index = 1; index <= partCount; index += 1) {
    const ideal = Math.round((durationSeconds * index) / partCount);
    const end = index === partCount ? durationSeconds : Math.round(ideal / segmentSeconds) * segmentSeconds;
    parts.push({ index, startSeconds: partStart, endSeconds: end });
    partStart = end;
  }

  const creditsAt = d - creditsSeconds;
  const midpointAt = Math.round(d * 0.5);
  const cliffhangerAt = Math.min(Math.round(d * 0.8), creditsAt);
  const payoffWindow = Math.min(Math.max(60, Math.round(d * 0.05)), Math.round(d * 0.1));
  const payoffStartsAt = Math.min(creditsAt, Math.max(cliffhangerAt, creditsAt - payoffWindow));

  /** @type {RetentionBeat[]} */
  const beats = [
    { atSeconds: 0, kind: "hook" },
    { atSeconds: hookEndsAt, kind: "promise" },
  ];
  for (const s of resets) beats.push({ atSeconds: s, kind: "segment-reset" });
  for (const part of parts.slice(0, -1)) beats.push({ atSeconds: part.endSeconds, kind: "part-break" });
  beats.push(
    { atSeconds: midpointAt, kind: "midpoint-turn" },
    { atSeconds: cliffhangerAt, kind: "cliffhanger" },
    { atSeconds: payoffStartsAt, kind: "payoff" },
    { atSeconds: creditsAt, kind: "credits" },
  );
  beats.sort((a, b) => a.atSeconds - b.atSeconds);

  return {
    hookEndsAt,
    parts,
    segmentCount,
    patternInterruptEverySeconds: interruptEvery,
    patternInterruptCount: Math.floor(durationSeconds / interruptEvery),
    midpointAt,
    cliffhangerAt,
    payoffStartsAt,
    creditsSeconds,
    beats,
  };
}

/**
 * @typedef {{ l1Usable: number, l2Usable: number, l4Planned: number }} LayerYieldEstimate
 * @typedef {{ variantMaxShare: number }} LayerPolicy
 * @typedef {{ l1: number, l2: number, l3: number, l4: number, l5: number }} LayerAllocation
 */

/** @type {LayerPolicy} */
export const DEFAULT_LAYER_POLICY = { variantMaxShare: 0.1 };

/**
 * Five-layer plan that always closes, with AI strictly last: archives (L1),
 * stock (L2) and graphics (L4) first, then distinct-region variants of real
 * media (L5) up to their cap, and only then labelled AI reconstruction (L3)
 * for whatever is still missing, so a film never runs short and the run never
 * stops to ask. L3 has no upper cap: a topic with almost no real media is
 * mostly labelled reconstruction. Estimates are rounded to whole media and
 * missing or non-numeric estimates count as 0.
 * @param {{ totalUniqueMedia: number }} needs
 * @param {Partial<LayerYieldEstimate>} estimate
 * @param {Partial<LayerPolicy>} [policy]
 * @returns {LayerAllocation}
 */
export function allocateLayers(needs, estimate, policy = DEFAULT_LAYER_POLICY) {
  const p = { ...DEFAULT_LAYER_POLICY, ...policy };
  let remaining = Number.isFinite(needs.totalUniqueMedia) ? Math.max(0, Math.floor(needs.totalUniqueMedia)) : 0;
  const total = remaining;
  /** @param {number | undefined} available */
  const take = (available) => {
    const n = Number(available);
    const used = Math.max(0, Math.min(remaining, Number.isFinite(n) ? Math.round(n) : 0));
    remaining -= used;
    return used;
  };
  const l1 = take(estimate.l1Usable);
  const l2 = take(estimate.l2Usable);
  const l4 = take(estimate.l4Planned);
  const l5 = take(Math.floor(total * p.variantMaxShare));
  return { l1, l2, l3: take(remaining), l4, l5 };
}

/**
 * @typedef {{ id: string, startFrame: number, endFrame: number, transitionOutFrames: number }} TimelineScene
 * @typedef {{ index: number, startFrame: number, endFrame: number, sceneIds: string[] }} RenderChunk
 * @typedef {{ chunkThresholdSeconds?: number, targetChunkSeconds?: number, minChunkSeconds?: number }} ChunkPlanOptions
 */

/**
 * Chunk length that keeps every render machine busy: 40 min on 8 machines
 * gives 5-min chunks; 207 min on 20 machines gives two full waves of about
 * 5.2-min chunks. Never shorter than 2 min (per-chunk overhead) or longer
 * than 10 min (retry cost).
 * @param {number} durationSeconds
 * @param {number} machines
 */
export function chooseChunkSeconds(durationSeconds, machines) {
  const m = Number.isFinite(machines) && machines >= 1 ? Math.floor(machines) : 1;
  const d = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  // When one wave of 10-minute chunks is not enough, use whole waves so no machine idles in the last one.
  const waves = Math.max(1, Math.ceil(d / (m * 600)));
  return Math.min(600, Math.max(120, Math.ceil(d / (m * waves))));
}

/**
 * planChunks options that keep every machine busy: split as soon as the film
 * is longer than one chunk of chooseChunkSeconds(duration, machines).
 * @param {number} durationSeconds
 * @param {number} machines
 * @returns {Required<Pick<ChunkPlanOptions, "chunkThresholdSeconds" | "targetChunkSeconds">>}
 */
export function chunkOptionsFor(durationSeconds, machines) {
  const chunk = chooseChunkSeconds(durationSeconds, machines);
  return { chunkThresholdSeconds: chunk, targetChunkSeconds: chunk };
}

/**
 * Longest machine load when chunks are handed out longest first, each to the
 * machine that frees up first.
 * @param {number[]} chunkSeconds
 * @param {number} machines
 */
export function renderMakespanSeconds(chunkSeconds, machines) {
  const loads = new Array(Math.max(1, Math.floor(machines) || 1)).fill(0);
  for (const length of [...chunkSeconds].sort((a, b) => b - a)) {
    let least = 0;
    for (let i = 1; i < loads.length; i += 1) if (loads[i] < loads[least]) least = i;
    loads[least] += length;
  }
  return Math.max(...loads);
}

/**
 * How many chunks a film of this length is split into: one chunk up to the
 * threshold, otherwise about duration / target, but never so many that a
 * chunk would fall below the minimum once its boundary snaps to a hard cut
 * (up to one shot away). planChunks and estimateRun share this so the
 * estimate matches the plan.
 * @param {number} durationSeconds
 * @param {number} targetSeconds
 * @param {number} thresholdSeconds
 * @param {number} minimumSeconds
 * @param {number} shotSeconds average scene length
 */
export function chunkCountFor(durationSeconds, targetSeconds, thresholdSeconds, minimumSeconds, shotSeconds) {
  if (!(durationSeconds > thresholdSeconds)) return 1;
  const fit = Math.floor(durationSeconds / (minimumSeconds + shotSeconds));
  return Math.max(1, Math.min(Math.round(durationSeconds / targetSeconds), fit));
}

/**
 * Split a frame-exact timeline into nearly equal render chunks for parallel
 * rendering. The chunk count comes from chunkCountFor; each boundary is the
 * hard cut nearest its ideal position, never a point inside a transition, so
 * chunks encoded with identical settings join by stream copy without a
 * visible seam. Chunks shorter than the minimum merge into their shorter
 * neighbour. Pass chunkOptionsFor(duration, machines) to keep every machine busy.
 * @param {TimelineScene[]} scenes
 * @param {ChunkPlanOptions} [options]
 * @returns {{ ok: true, chunks: RenderChunk[], warnings: string[] } | { ok: false, error: string }}
 */
export function planChunks(scenes, options = {}) {
  if (!Array.isArray(scenes) || scenes.length === 0) return { ok: false, error: "The timeline has no scenes to render." };
  for (let i = 0; i < scenes.length; i += 1) {
    const scene = scenes[i];
    if (!scene || typeof scene !== "object") return { ok: false, error: "Scene " + (i + 1) + " is missing." };
    if (!Number.isInteger(scene.startFrame) || !Number.isInteger(scene.endFrame)) {
      return { ok: false, error: "Scene " + scene.id + " needs whole-number start and end frames." };
    }
    if (scene.endFrame <= scene.startFrame) {
      return { ok: false, error: "Scene " + scene.id + " has no frames. Every scene needs an end frame after its start frame." };
    }
    if (!Number.isInteger(scene.transitionOutFrames) || scene.transitionOutFrames < 0) {
      return { ok: false, error: "Scene " + scene.id + " needs transitionOutFrames as a whole number of frames (0 for a hard cut)." };
    }
    if (i > 0 && scene.startFrame !== scenes[i - 1].endFrame) {
      return { ok: false, error: "There is a gap or overlap before scene " + scene.id + ". Each scene must start on the previous scene's end frame." };
    }
  }
  const seconds = [options.chunkThresholdSeconds ?? 600, options.targetChunkSeconds ?? 600, options.minChunkSeconds ?? 120];
  if (!seconds.every((n) => Number.isFinite(n) && n > 0)) return { ok: false, error: "Chunk lengths must be positive numbers of seconds." };
  const [thresholdSeconds, targetSeconds, minimumSeconds] = seconds;

  const first = scenes[0].startFrame;
  const totalFrames = scenes[scenes.length - 1].endFrame - first;
  const count = chunkCountFor(totalFrames / FPS, targetSeconds, thresholdSeconds, minimumSeconds, totalFrames / FPS / scenes.length);

  // Candidate split points: the end of every scene that leaves on a hard cut (not the last scene).
  /** @type {number[]} */
  const cuts = [];
  for (let i = 0; i < scenes.length - 1; i += 1) if (scenes[i].transitionOutFrames === 0) cuts.push(i);

  /** @type {number[]} index of the last scene in each chunk */
  const ends = [];
  let from = 0;
  for (let j = 1; j < count; j += 1) {
    const ideal = first + (totalFrames * j) / count;
    let best = -1;
    for (const i of cuts) {
      if (i < from || ends.includes(i)) continue;
      if (best === -1 || Math.abs(scenes[i].endFrame - ideal) < Math.abs(scenes[best].endFrame - ideal)) best = i;
    }
    if (best === -1) break;
    ends.push(best);
    from = best + 1;
  }
  ends.push(scenes.length - 1);

  /** @type {RenderChunk[]} */
  let chunks = [];
  let startIndex = 0;
  for (const endIndex of ends) {
    const list = scenes.slice(startIndex, endIndex + 1);
    chunks.push({ index: chunks.length, startFrame: list[0].startFrame, endFrame: list[list.length - 1].endFrame, sceneIds: list.map((s) => s.id) });
    startIndex = endIndex + 1;
  }

  // Merge any chunk below the minimum into its shorter neighbour.
  const minimum = minimumSeconds * FPS;
  for (let i = 0; chunks.length > 1 && i < chunks.length; ) {
    const length = chunks[i].endFrame - chunks[i].startFrame;
    if (length >= minimum) { i += 1; continue; }
    const prev = chunks[i - 1];
    const next = chunks[i + 1];
    const intoPrev = !next || (prev && prev.endFrame - prev.startFrame <= next.endFrame - next.startFrame);
    const a = intoPrev ? prev : chunks[i];
    const b = intoPrev ? chunks[i] : next;
    const merged = { index: 0, startFrame: a.startFrame, endFrame: b.endFrame, sceneIds: [...a.sceneIds, ...b.sceneIds] };
    chunks.splice(intoPrev ? i - 1 : i, 2, merged);
    i = Math.max(0, i - 1);
  }
  chunks = chunks.map((chunk, index) => ({ ...chunk, index }));

  const warnings = [];
  if (chunks.length < count) warnings.push("Only " + chunks.length + " of " + count + " planned chunks: too few hard cuts or very long scenes, so some machines stay idle.");
  for (const chunk of chunks) {
    if (chunk.endFrame - chunk.startFrame > 2 * targetSeconds * FPS) {
      warnings.push("Chunk " + chunk.index + " runs " + Math.round((chunk.endFrame - chunk.startFrame) / FPS) + " s, more than twice the target, because no hard cut came sooner.");
    }
  }
  return { ok: true, chunks, warnings };
}

/** Average shot at 4.5 shots per minute; a chunk overruns its target by about this much to reach a hard cut. */
const AVERAGE_SHOT_SECONDS = 40 / 3;

export const RUN_ASSUMPTIONS = {
  researchMinutes: 3,
  scriptMinutes: 3,
  voiceMinutes: 2,
  mediaMinutes: 4,
  renderFpsPerMachine: 15,
  finalizeMinutes: 3,
  uploadGbps: 1,
  videoMbps: 40,
};

/**
 * @typedef {{ stage: string, minutes: number, scales: boolean }} RunStage  scales=false marks a fixed per-run guess
 * @typedef {{ machines: number, chunkSeconds: number, chunks: number, stages: RunStage[], totalMinutes: number }} RunEstimate
 */

/**
 * Wall-clock budget for an autonomous run with no human step: research,
 * parallel script writing, voice and media in parallel, the 4K render spread
 * over the given machines, then concat, QA and upload. The render uses the
 * same chunk count as planChunks with chunkOptionsFor(duration, machines),
 * nearly equal chunks (each up to half an average shot longer where a
 * boundary snaps to a hard cut), scheduled longest first. With a real
 * timeline, pass planChunks' chunk lengths to renderMakespanSeconds instead.
 * @param {number} durationSeconds
 * @param {number} machines
 * @param {Partial<typeof RUN_ASSUMPTIONS>} [assumptions]
 * @returns {RunEstimate}
 */
export function estimateRun(durationSeconds, machines, assumptions = RUN_ASSUMPTIONS) {
  const a = { ...RUN_ASSUMPTIONS, ...assumptions };
  const m = Number.isFinite(machines) && machines >= 1 ? Math.floor(machines) : 1;
  const d = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const options = chunkOptionsFor(d, m);
  const chunks = chunkCountFor(d, options.targetChunkSeconds, options.chunkThresholdSeconds, 120, AVERAGE_SHOT_SECONDS);
  const chunkSeconds = d / chunks;
  // Boundaries snap to the nearest hard cut, so a chunk can run up to about half a shot long.
  const lengths = new Array(chunks).fill(chunks > 1 ? chunkSeconds + AVERAGE_SHOT_SECONDS / 2 : d);
  const renderMinutes = (renderMakespanSeconds(lengths, m) * FPS) / a.renderFpsPerMachine / 60;
  const uploadMinutes = (d * a.videoMbps) / (a.uploadGbps * 1000) / 60;
  /** @param {number} n */
  const round = (n) => Math.round(n * 10) / 10;
  const stages = [
    { stage: "Research and outline", minutes: a.researchMinutes, scales: false },
    { stage: "Script, all segments in parallel", minutes: a.scriptMinutes, scales: false },
    { stage: "Voice and media in parallel", minutes: Math.max(a.voiceMinutes, a.mediaMinutes), scales: false },
    { stage: "4K render: " + chunks + (chunks === 1 ? " chunk" : " chunks") + " on " + Math.min(m, chunks) + (Math.min(m, chunks) === 1 ? " machine" : " machines"), minutes: round(renderMinutes), scales: true },
    { stage: "Concat, mux and QA", minutes: a.finalizeMinutes, scales: false },
    { stage: "Upload master file to storage", minutes: round(uploadMinutes), scales: true },
  ];
  return { machines: m, chunkSeconds: Math.round(chunkSeconds), chunks, stages, totalMinutes: round(stages.reduce((sum, s) => sum + s.minutes, 0)) };
}
