/**
 * The audio audit of a rendered film, against the voice it was made from:
 * the recitation must come out whole, in time and clean.
 *  - length: the film's sound is as long as the voice;
 *  - sync: the film's sound starts exactly with the voice (the offset of
 *    the best match of their loudness envelopes, to 10 ms);
 *  - silence: no silence in the film that the voice does not have (an
 *    accidental gap from an edit), compared stretch by stretch;
 *  - loudness, true peak, loudness range (EBU R128), sample peak and
 *    clipped samples, and the balance of the two channels.
 * The loudness target is a reference, not a goal to force: the report says
 * how far the film is from -14 LUFS and the voice's own range is kept.
 *   node render/audio-audit.mjs <film.mp4> <voice.wav>
 */
import { spawn } from "node:child_process";

/** @param {string[]} args @returns {Promise<{ out: Buffer, err: string }>} */
function ff(args) {
  return new Promise((ok, fail) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-nostats", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const chunks = [];
    let err = "";
    p.stdout.on("data", (d) => chunks.push(d));
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", fail);
    p.on("close", () => ok({ out: Buffer.concat(chunks), err }));
  });
}

/** The loudness envelope (dB, every 10 ms) of a file's sound, mixed to mono at 16 kHz. @param {string} file */
export async function envelope(file) {
  const { out } = await ff(["-i", file, "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"]);
  const x = new Float32Array(out.buffer, out.byteOffset, Math.floor(out.length / 4));
  const hop = 160, env = new Float32Array(Math.floor(x.length / hop));
  for (let k = 0; k < env.length; k += 1) {
    let s = 0;
    for (let i = k * hop; i < (k + 1) * hop; i += 1) s += x[i] * x[i];
    env[k] = 10 * Math.log10(s / hop + 1e-12);
  }
  return env;
}

/**
 * The lag (in 10 ms steps) at which two envelopes match best, within ±maxLag.
 * @param {Float32Array} a @param {Float32Array} b @param {number} [maxLag]
 */
export function bestLag(a, b, maxLag = 100) {
  const n = Math.min(a.length, b.length, 30000);
  const mean = (/** @type {Float32Array} */ v) => { let s = 0; for (let i = 0; i < n; i += 1) s += Math.max(-80, v[i]); return s / n; };
  const ma = mean(a), mb = mean(b);
  let best = 0, bestScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    let s = 0;
    for (let i = Math.max(0, -lag); i < Math.min(n, n - lag); i += 1) s += (Math.max(-80, a[i]) - ma) * (Math.max(-80, b[i + lag]) - mb);
    if (s > bestScore) { bestScore = s; best = lag; }
  }
  return best;
}

/**
 * Silent stretches (under -50 dB for at least 0.3 s) of an envelope, in seconds.
 * @param {Float32Array} env @param {number} [floorDb]
 */
export function silences(env, floorDb = -50) {
  /** @type {{ start: number, end: number }[]} */
  const out = [];
  for (let i = 0; i < env.length;) {
    if (env[i] >= floorDb) { i += 1; continue; }
    let j = i;
    while (j < env.length && env[j] < floorDb) j += 1;
    if (j - i >= 30) out.push({ start: i / 100, end: j / 100 });
    i = j;
  }
  return out;
}

/**
 * Silences in the film that the voice does not have: a film silence that is
 * not covered (within 0.15 s at each end) by one of the voice's own.
 * @param {{ start: number, end: number }[]} film @param {{ start: number, end: number }[]} voice
 */
export function addedSilences(film, voice) {
  return film.filter((s) => !voice.some((v) => v.start <= s.start + 0.15 && v.end >= s.end - 0.15));
}

/** @param {string} err @param {RegExp} re */
const last = (err, re) => { const m = [...err.matchAll(re)]; return m.length ? Number(m[m.length - 1][1]) : null; };

/**
 * Audit the sound of a film against its voice.
 * @param {string} film @param {string} voice
 */
export async function auditAudio(film, voice) {
  const [fe, ve] = [await envelope(film), await envelope(voice)];
  const lag = bestLag(ve, fe);
  const { err } = await ff(["-i", film, "-vn", "-filter_complex", "[0:a]ebur128=peak=true:framelog=quiet,astats=measure_perchannel=RMS_level+Peak_level+Peak_count:measure_overall=none", "-f", "null", "-"]);
  const rms = [...err.matchAll(/RMS level dB: (-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
  const peaks = [...err.matchAll(/Peak level dB: (-?[\d.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
  // Clipping: samples at full scale. A channel whose peak stays under -0.05 dBFS cannot have any.
  const peakCounts = [...err.matchAll(/Peak count: (\d+)/g)].map((m) => Number(m[1]));
  const clipped = peaks.map((p, i) => (p >= -0.05 ? peakCounts[i] ?? 1 : 0));
  const added = addedSilences(silences(fe), silences(ve)).map((s) => ({ start: s.start, end: s.end }));
  const r = {
    seconds: fe.length / 100, voiceSeconds: ve.length / 100,
    lengthMatches: Math.abs(fe.length - ve.length) <= 10,
    offsetSeconds: lag / 100,
    integratedLufs: last(err, /\bI:\s+(-?[\d.]+) LUFS/g), loudnessRangeLu: last(err, /\bLRA:\s+(-?[\d.]+) LU/g), truePeakDbtp: last(err, /Peak:\s+(-?[\d.]+) dBFS/g),
    samplePeakDb: peaks.length ? Math.max(...peaks) : null, clippedSamples: clipped.reduce((a, b) => a + b, 0),
    channels: rms.length, balanceDb: rms.length >= 2 ? Math.round(Math.abs(rms[0] - rms[1]) * 10) / 10 : 0,
    addedSilences: added,
  };
  return { ...r, ok: r.lengthMatches && Math.abs(r.offsetSeconds) <= 0.02 && r.clippedSamples === 0 && (r.truePeakDbtp ?? 0) <= -1 && r.balanceDb <= 1 && added.length === 0 };
}

async function main() {
  const [film, voice] = process.argv.slice(2);
  if (!film || !voice) { console.error("Usage: node render/audio-audit.mjs <film.mp4> <voice.wav>"); process.exit(2); }
  const r = await auditAudio(film, voice);
  console.log("AUDIO-AUDIT " + JSON.stringify(r));
  if (!r.ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
