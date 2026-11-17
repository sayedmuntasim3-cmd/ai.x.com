/**
 * What a machine can take on, from what it reports, so no device becomes the
 * bottleneck: a phone only watches and decides; a small laptop takes the
 * light jobs; a strong computer renders and runs the brain, several jobs at
 * once. A worker claims only the jobs its capabilities cover, at the quality
 * the job asks for, so quality is never lowered to fit a weak machine; a job
 * that nothing connected can do is reported as waiting, with what it needs.
 *
 * Render tiers are conservative estimates for the ffmpeg renderer
 * (render/render-film.mjs: one segment at a time, filters, H.264): memory
 * and cores below a tier mean a long render may swap or crawl.
 */

/** Render capabilities, highest first. */
export const RENDER_TIERS = Object.freeze([
  { id: "render:2160p", height: 2160, minMemoryMb: 16_384, minCpus: 8 },
  { id: "render:1080p", height: 1080, minMemoryMb: 4_096, minCpus: 4 },
  { id: "render:720p", height: 720, minMemoryMb: 2_048, minCpus: 2 },
]);

/**
 * @param {{ memoryMb: number, freeMemoryMb?: number, cpus: number, ffmpeg?: boolean, gpu?: boolean,
 *   brain?: { kind: string, contextTokens?: number } | null }} r
 */
export function deviceProfile(r) {
  const memory = Math.max(0, r.memoryMb);
  const cpus = Math.max(1, Math.floor(r.cpus));
  /** @type {string[]} */
  const capabilities = ["web"];
  if (r.ffmpeg) {
    capabilities.push("ffmpeg");
    for (const t of RENDER_TIERS) if (memory >= t.minMemoryMb && cpus >= t.minCpus) capabilities.push(t.id);
  }
  if (r.gpu) capabilities.push("gpu");
  if (r.brain) capabilities.push("brain", `brain:${r.brain.kind}`);
  const tier = memory >= 16_384 && cpus >= 8 ? "high" : memory >= 4_096 && cpus >= 4 ? "standard" : memory >= 2_048 ? "low" : "minimal";
  // One job per two cores and 4 GB, at least one, at most four; a renderer already uses several cores itself.
  const concurrency = Math.max(1, Math.min(4, Math.floor(Math.min(cpus / 2, memory / 4_096))));
  const best = RENDER_TIERS.find((t) => capabilities.includes(t.id)) ?? null;
  return {
    tier,
    capabilities,
    concurrency,
    maxRenderHeight: best?.height ?? 0,
    resources: { memoryMb: Math.round(memory), cpus, ...(r.brain?.contextTokens ? { contextTokens: r.brain.contextTokens } : {}) },
  };
}

/** The render capability a resolution needs ("1920x1080" -> "render:1080p"). @param {string} resolution */
export function renderNeed(resolution) {
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(resolution);
  if (!m) throw new Error(`Bad resolution "${resolution}".`);
  const height = Number(m[2]);
  const tier = [...RENDER_TIERS].reverse().find((t) => t.height >= height);
  if (!tier) throw new Error(`No render tier covers ${resolution}.`);
  return tier.id;
}
