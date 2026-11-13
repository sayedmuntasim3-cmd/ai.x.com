/**
 * The voice mastering engine, end to end: measure, clean, tone, dynamics,
 * space, loudness, proof. One mono recording in; a mastered mono (no added
 * space) or stereo (voice in the centre, reverb around it) track out, with a
 * report of what was measured, what was done and what could not be fixed.
 *
 * Loudness is set in two passes: the first finds how much the limiter costs,
 * the second lands on the target, then the result is measured again and
 * trimmed, so the file is at -14 LUFS with true peak at or under -1 dBTP by
 * measurement, not by assumption.
 */
import { clamp, db, fromDb, round } from "./voice-dsp.mjs";
import { analyzeVoice } from "./voice-analyze.mjs";
import { planChain, runChain } from "./voice-chain.mjs";
import { PROFILE_SPACES, applyReverb, planSpace } from "./voice-reverb.mjs";
import { proveMaster } from "./voice-proof.mjs";
import { measureLoudness } from "./loudness.mjs";
import { MASTER } from "./voice-plan.mjs";
import { msg } from "./messages.mjs";

/** @typedef {import("./voice-analyze.mjs").VoiceProfile} VoiceProfile */

/** The most a limiter may take off a peak before loudness gives way instead. */
export const LIMITER_MAX_DB = Object.freeze({ quran: 6, narration: 8 });

/**
 * Look-ahead peak limiter, in place, all channels moved together. The gain
 * is the smallest needed over the next 5 ms, released smoothly and averaged
 * over the same 5 ms, so it is already down when a peak arrives and no
 * sample passes the ceiling. Nothing is delayed.
 * @param {Float32Array[]} channels @param {number} sampleRate @param {number} ceilingDb
 * @param {{ lookaheadMs?: number, releaseMs?: number }} [o]
 */
export function limit(channels, sampleRate, ceilingDb, o = {}) {
  const n = channels[0].length, ceiling = fromDb(ceilingDb);
  const ahead = Math.max(1, Math.round(((o.lookaheadMs ?? 5) / 1000) * sampleRate));
  const need = new Float32Array(n);
  let touched = false;
  for (let i = 0; i < n; i += 1) {
    let peak = 0;
    for (const c of channels) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
    need[i] = peak > ceiling ? ceiling / peak : 1;
    if (peak > ceiling) touched = true;
  }
  if (!touched) return { maxReductionDb: 0, limitedShare: 0 };
  // Smallest needed gain over [i, i + ahead], by a monotonic queue.
  const low = new Float32Array(n), queue = new Int32Array(ahead + 2);
  let head = 0, size = 0, next = 0;
  for (let i = 0; i < n; i += 1) {
    for (; next < n && next <= i + ahead; next += 1) {
      while (size > 0 && need[queue[(head + size - 1) % queue.length]] >= need[next]) size -= 1;
      queue[(head + size) % queue.length] = next; size += 1;
    }
    while (queue[head] < i) { head = (head + 1) % queue.length; size -= 1; }
    low[i] = need[queue[head]];
  }
  const release = 1 - Math.exp(-1 / (((o.releaseMs ?? 120) / 1000) * sampleRate));
  let g = 1;
  // The release snaps to exactly one at the end, so untouched audio stays bit for bit the same.
  for (let i = 0; i < n; i += 1) { g = Math.min(low[i], g + (1 - g) * release); if (g > 0.9999) g = 1; low[i] = g; }
  let sum = 0, deepest = 1, limited = 0;
  for (let i = 0; i < n; i += 1) {
    sum += low[i];
    if (i > ahead) sum -= low[i - ahead - 1];
    const gain = Math.min(1, sum / Math.min(i + 1, ahead + 1));
    if (gain < deepest) deepest = gain;
    if (gain < 0.999) limited += 1;
    for (const c of channels) c[i] *= gain;
  }
  return { maxReductionDb: round(-db(deepest), 2), limitedShare: round(limited / n, 4) };
}

/**
 * Bring a mix to the loudness target under the true-peak ceiling, in place.
 * @param {Float32Array[]} channels @param {number} sampleRate
 * @param {{ targetLufs?: number, ceilingDbtp?: number, maxLimitDb?: number }} [o]
 */
export function masterLoudness(channels, sampleRate, o = {}) {
  const target = o.targetLufs ?? MASTER.targetLufs, ceiling = o.ceilingDbtp ?? MASTER.ceilingDbtp, maxLimit = o.maxLimitDb ?? 6;
  const before = measureLoudness(channels, sampleRate);
  if (before.integrated === null) return { ok: false, beforeLufs: null, lufs: null, truePeakDb: before.truePeakDb, gainDb: 0, limiterMaxDb: 0, limitedShare: 0, shortDb: 0 };
  /** @param {Float32Array[]} x @param {number} gainDb */
  const scale = (x, gainDb) => { const g = fromDb(gainDb); for (const c of x) for (let i = 0; i < c.length; i += 1) c[i] *= g; };
  let gain = target - before.integrated;
  // Pass 1, on a copy: what the limiter takes away at this gain.
  const trial = channels.map((c) => Float32Array.from(c));
  scale(trial, gain);
  const first = limit(trial, sampleRate, ceiling - 0.3);
  const cost = target - /** @type {number} */ (measureLoudness(trial, sampleRate).integrated);
  // Loudness never buys itself with a crushed voice: past the limit, the gain gives way.
  const held = Math.max(0, first.maxReductionDb - maxLimit);
  gain += clamp(cost, 0, 3) + 0.2 - held;
  // Pass 2, for real, then measured again and trimmed down onto the target and under the ceiling.
  scale(channels, gain);
  const second = limit(channels, sampleRate, ceiling - 0.3);
  const now = measureLoudness(channels, sampleRate);
  const trim = Math.min(0, target - /** @type {number} */ (now.integrated), ceiling - 0.05 - now.truePeakDb);
  scale(channels, trim);
  const after = measureLoudness(channels, sampleRate);
  const lufs = /** @type {number} */ (after.integrated);
  return { ok: after.truePeakDb <= ceiling + 0.01 && Math.abs(lufs - target) <= 0.5, beforeLufs: before.integrated, lufs, truePeakDb: after.truePeakDb, gainDb: round(gain + trim, 2), limiterMaxDb: second.maxReductionDb, limitedShare: second.limitedShare, shortDb: round(Math.max(0, target - lufs), 2) };
}

/**
 * Master one recording.
 * @param {{
 *   samples: Float32Array, sampleRate: number, profile?: VoiceProfile, preset?: string,
 *   ayahEnds?: number[], meaningAware?: boolean, feeling?: { start: number, end: number, amount: number }[],
 * }} input
 */
export function masterVoice(input) {
  const { samples, sampleRate } = input;
  const profile = input.profile ?? "quran";
  const preset = input.preset ?? PROFILE_SPACES[profile][0];
  const before = analyzeVoice(samples, sampleRate, { profile });
  const plan = planChain(before, profile);
  const space = planSpace(before, preset);
  const messages = [...before.messages];
  if (before.seconds < 1 || before.loudness.integrated === null) return { ok: false, profile, preset, channels: /** @type {Float32Array[]} */ ([]), sampleRate, before, after: null, chain: null, space: null, master: null, proof: null, messages };

  const chain = runChain(samples, sampleRate, before, plan);
  messages.push(...chain.messages, ...space.messages);
  // Feeling-aware variation is never on for a recitation unless it is asked for by name.
  const meaningAware = input.meaningAware === true;
  const wet = space.space ? applyReverb(chain.samples, sampleRate, before, space.space, { ayahEnds: input.ayahEnds, meaningAware, feeling: input.feeling }) : null;
  let channels = wet ? [wet.left, wet.right] : [chain.samples];
  const master = masterLoudness(channels, sampleRate, { maxLimitDb: LIMITER_MAX_DB[profile] });
  messages.push(msg("vm.master.done", { lufs: round(master.lufs ?? 0, 1), peak: round(master.truePeakDb, 1), limit: master.limiterMaxDb }));
  if (master.shortDb > 0.5) messages.push(msg("vm.master.short", { lufs: round(master.lufs ?? 0, 1), target: MASTER.targetLufs, limit: LIMITER_MAX_DB[profile] }));

  // The tail is kept until it has faded to silence, then the file ends.
  const n = samples.length, quiet = fromDb(-75);
  let end = channels[0].length;
  while (end > n && channels.every((c) => Math.abs(c[end - 1]) < quiet)) end -= 1;
  channels = channels.map((c) => c.subarray(0, end));

  const proof = proveMaster(samples, channels, sampleRate, { tailAllowedSeconds: wet ? wet.info.tailSeconds : 0, phrases: before.phrases });
  messages.push(...proof.messages);
  if (wet) messages.push(msg("vm.proof.echoFree", { rt: wet.info.rt60At500 ?? 0, slice: wet.info.strongestSliceDb, rise: wet.info.worstRiseDb }));
  // The cleaned voice before space and gain, measured the same way as the input, for a fair before/after.
  const dry = analyzeVoice(chain.samples, sampleRate, { profile });
  const after = {
    lufs: master.lufs, truePeakDb: master.truePeakDb, seconds: round(end / sampleRate, 3),
    dryNoiseFloorDb: dry.level.noiseFloorDb, drySnrDb: dry.level.snrDb, dryLra: dry.loudness.lra, dryCrestDb: dry.level.crestDb,
    dryTone: dry.tone.bands, dryHum: dry.hum.hz, drySibilanceDb: dry.sibilance.db,
  };
  return { ok: master.ok && proof.ok, profile, preset, channels, sampleRate, before, after, chain: { plan: chain.plan, did: chain.did }, space: wet ? { ...space.space, ...wet.info, loweredDb: space.loweredDb, shortened: space.shortened } : null, master, proof, messages };
}
