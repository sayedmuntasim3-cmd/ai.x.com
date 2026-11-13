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
import { clamp, db, fromDb, powerDb, round } from "./voice-dsp.mjs";
import { analyzeVoice } from "./voice-analyze.mjs";
import { planChain, runChain } from "./voice-chain.mjs";
import { PROFILE_SPACES, applyReverb, planSpace } from "./voice-reverb.mjs";
import { proveMaster } from "./voice-proof.mjs";
import { measureLoudness } from "./loudness.mjs";
import { MASTER } from "./voice-plan.mjs";
import { msg } from "./messages.mjs";

/** @typedef {import("./voice-analyze.mjs").VoiceProfile} VoiceProfile */

/** The most the final limiter may take off a peak before loudness gives way instead. */
export const LIMITER_MAX_DB = Object.freeze({ quran: 4, narration: 5 });

/**
 * How far the loudest peak may stand above the voice's own level (dB) before
 * the peak stage acts. A recitation keeps taller peaks than a narration.
 */
export const PEAK_OVER_VOICE_DB = Object.freeze({ quran: 16, narration: 14 });

/**
 * Look-ahead peak limiter, in place, all channels moved together. The gain
 * is the smallest needed over the next few ms, released smoothly and averaged
 * over the same time, so it is already down when a peak arrives and no
 * sample passes the ceiling. Nothing is delayed. With a `ratio` it is a
 * gentle peak compressor instead: what passes the line is turned down by
 * that ratio, with a soft knee, rather than stopped.
 * @param {Float32Array[]} channels @param {number} sampleRate @param {number} ceilingDb
 * @param {{ lookaheadMs?: number, releaseMs?: number, ratio?: number, kneeDb?: number }} [o]
 */
export function limit(channels, sampleRate, ceilingDb, o = {}) {
  const n = channels[0].length, ceiling = fromDb(ceilingDb);
  const ahead = Math.max(1, Math.round(((o.lookaheadMs ?? 5) / 1000) * sampleRate));
  const soft = o.ratio !== undefined && Number.isFinite(o.ratio), slope = soft ? 1 - 1 / /** @type {number} */ (o.ratio) : 1;
  const knee = soft ? (o.kneeDb ?? 6) : 0, start = soft ? fromDb(ceilingDb - knee / 2) : ceiling;
  const need = new Float32Array(n);
  let touched = false;
  for (let i = 0; i < n; i += 1) {
    let peak = 0;
    for (const c of channels) { const a = Math.abs(c[i]); if (a > peak) peak = a; }
    if (peak <= start) { need[i] = 1; continue; }
    touched = true;
    if (!soft) { need[i] = ceiling / peak; continue; }
    const over = db(peak) - ceilingDb;
    need[i] = fromDb(-(over >= knee / 2 ? over * slope : (slope * (over + knee / 2) * (over + knee / 2)) / (2 * knee)));
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
 * The peak stage between the compressor and the limiter: when the loudest
 * peaks stand further above the voice than the profile allows (hard
 * consonants, pops), what towers over the voice is turned down with a soft
 * knee, 1 ms ahead, so the final limiter is left with little to do. The line
 * and the ratio come from this recording's own level and peak; a voice whose
 * peaks are already modest is not touched.
 * @param {Float32Array} x @param {number} sampleRate @param {number} allowedDb
 */
export function tamePeaks(x, sampleRate, allowedDb) {
  const hop = Math.round(sampleRate * 0.01);
  let peak = 0, top = -200, sum = 0, count = 0;
  for (let i = 0; i < x.length; i += 1) { const a = Math.abs(x[i]); if (a > peak) peak = a; }
  /** @type {number[]} */
  const powers = [];
  for (let s = 0; s + hop <= x.length; s += hop) { let p = 0; for (let i = s; i < s + hop; i += 1) p += x[i] * x[i]; powers.push(p / hop); top = Math.max(top, powerDb(p / hop)); }
  for (const p of powers) if (powerDb(p) > top - 30) { sum += p; count += 1; }
  if (!count || peak <= 0) return { crestBeforeDb: 0, crestAfterDb: 0, lineDb: 0, maxReductionDb: 0 };
  const voice = powerDb(sum / count), crest = db(peak) - voice;
  if (crest <= allowedDb + 0.5) return { crestBeforeDb: round(crest, 1), crestAfterDb: round(crest, 1), lineDb: 0, maxReductionDb: 0 };
  // The line sits 2 dB under the allowed height, well above the vowels' own peaks, so only what towers over the
  // voice is touched; the ratio is the one that brings the tallest peak down to the allowed height.
  const line = voice + allowedDb - 2, ratio = clamp((crest - allowedDb + 2) / 2, 2, 10);
  const did = limit([x], sampleRate, line, { ratio, kneeDb: 3, lookaheadMs: 1, releaseMs: 50 });
  let after = 0;
  for (let i = 0; i < x.length; i += 1) { const a = Math.abs(x[i]); if (a > after) after = a; }
  return { crestBeforeDb: round(crest, 1), crestAfterDb: round(db(after) - voice, 1), lineDb: round(line, 1), maxReductionDb: did.maxReductionDb };
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
 *   source?: "own-recording" | "elevenlabs", targetLufs?: number,
 *   ayahEnds?: number[], meaningAware?: boolean, feeling?: { start: number, end: number, amount: number }[],
 * }} input
 */
export function masterVoice(input) {
  const { samples, sampleRate } = input;
  const profile = input.profile ?? "quran";
  const preset = input.preset ?? PROFILE_SPACES[profile][0];
  const before = analyzeVoice(samples, sampleRate, { profile });
  const plan = planChain(before, profile, { source: input.source });
  const space = planSpace(before, preset);
  const messages = [...before.messages];
  if (before.seconds < 1 || before.loudness.integrated === null) return { ok: false, profile, preset, channels: /** @type {Float32Array[]} */ ([]), sampleRate, before, after: null, chain: null, space: null, master: null, proof: null, messages };

  const chain = runChain(samples, sampleRate, before, plan);
  const peaks = tamePeaks(chain.samples, sampleRate, PEAK_OVER_VOICE_DB[profile]);
  messages.push(...chain.messages);
  if (peaks.maxReductionDb > 0) messages.push(msg("vm.did.peaks", { before: peaks.crestBeforeDb, after: peaks.crestAfterDb, max: peaks.maxReductionDb }));
  messages.push(...space.messages);
  // The cleaned voice before space and gain, measured the same way as the input, for a fair before/after.
  const dry = analyzeVoice(chain.samples, sampleRate, { profile });
  if (profile === "narration") messages.push(msg("vm.space.narration"));
  // Feeling-aware variation is never on for a recitation unless it is asked for by name.
  const meaningAware = input.meaningAware === true;
  const wet = space.space ? applyReverb(chain.samples, sampleRate, before, space.space, { ayahEnds: input.ayahEnds, meaningAware, feeling: input.feeling }) : null;
  let channels = wet ? [wet.left, wet.right] : [chain.samples];
  const targetLufs = input.targetLufs ?? MASTER.targetLufs;
  const master = masterLoudness(channels, sampleRate, { targetLufs, maxLimitDb: LIMITER_MAX_DB[profile] });
  messages.push(msg("vm.master.done", { lufs: round(master.lufs ?? 0, 1), peak: round(master.truePeakDb, 1), limit: master.limiterMaxDb }));
  if (master.shortDb > 0.5) messages.push(msg("vm.master.short", { lufs: round(master.lufs ?? 0, 1), target: targetLufs, limit: LIMITER_MAX_DB[profile] }));

  // The tail is kept until it has faded to silence, then the file ends.
  const n = samples.length, quiet = fromDb(-75);
  let end = channels[0].length;
  while (end > n && channels.every((c) => Math.abs(c[end - 1]) < quiet)) end -= 1;
  channels = channels.map((c) => c.subarray(0, end));

  const proof = proveMaster(samples, channels, sampleRate, { tailAllowedSeconds: wet ? wet.info.tailSeconds : 0, phrases: before.phrases, voice: wet ? chain.samples : undefined });
  messages.push(...proof.messages);
  if (wet) messages.push(msg("vm.proof.echoFree", { rt: wet.info.rt60At500 ?? 0, slice: wet.info.strongestSliceDb, rise: wet.info.worstRiseDb }));
  const after = {
    lufs: master.lufs, truePeakDb: master.truePeakDb, seconds: round(end / sampleRate, 3),
    dryNoiseFloorDb: dry.level.noiseFloorDb, drySnrDb: dry.level.snrDb, dryLra: dry.loudness.lra, dryCrestDb: dry.level.crestDb,
    dryTone: dry.tone.bands, dryHum: dry.hum.hz, drySibilanceDb: dry.sibilance.db,
  };
  return { ok: master.ok && proof.ok, profile, preset, channels, sampleRate, before, after, chain: { plan: chain.plan, did: { ...chain.did, peaks } }, space: wet ? { ...space.space, ...wet.info, loweredDb: space.loweredDb, shortened: space.shortened } : null, master, proof, messages };
}

/**
 * Where each recognised ayah ends in the recording (seconds), from the
 * understanding layer's Quran plan; estimated times are left out, so only
 * heard boundaries steer the reverb.
 * @param {{ scenes?: { kind: string, spokenEnd: number | null, estimated: boolean }[] } | null | undefined} quranPlan
 */
export function ayahEndsOf(quranPlan) {
  /** @type {number[]} */
  const ends = [];
  for (const s of quranPlan?.scenes ?? []) if (s.kind === "ayah" && typeof s.spokenEnd === "number" && !s.estimated) ends.push(s.spokenEnd);
  return ends;
}

/**
 * The report without the audio: what a file on disk and the studio page keep.
 * @param {ReturnType<typeof masterVoice>} r
 */
export function masterReport(r) {
  const b = r.before;
  return {
    ok: r.ok, profile: r.profile, preset: r.preset, sampleRate: r.sampleRate, channels: r.channels.length,
    before: { seconds: b.seconds, lufs: b.loudness.integrated, truePeakDb: b.loudness.truePeakDb, lra: b.loudness.lra, noiseFloorDb: b.level.noiseFloorDb, snrDb: b.level.snrDb, crestDb: b.level.crestDb, hum: b.hum, clippedRuns: b.clipping.runs, plosives: b.plosives.count, sibilanceDb: b.sibilance.db, roomRt60: b.room.rt60, pauses: b.pauses.count, medianPauseSeconds: b.pauses.medianSeconds, sustainedNotes: b.sustained.count, pitch: b.pitch, tone: b.tone.bands },
    after: r.after, chain: r.chain, space: r.space, master: r.master,
    proof: r.proof ? { ok: r.proof.ok, duration: r.proof.duration, alignment: r.proof.alignment, pitch: r.proof.pitch } : null,
    messages: r.messages,
  };
}
