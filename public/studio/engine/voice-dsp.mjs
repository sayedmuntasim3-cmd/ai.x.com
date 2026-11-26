/**
 * The small DSP kit under the voice mastering engine: biquad filters (RBJ
 * cookbook), a radix-2 FFT, an overlap-add STFT, frame levels, percentiles
 * and a seeded random source. Pure functions over Float32Array, so the same
 * code runs in Node, a Worker and the browser, and every result is
 * repeatable bit for bit (nothing here reads a clock or Math.random).
 */

/** @typedef {{ b0: number, b1: number, b2: number, a1: number, a2: number }} Coefs */
/** @typedef {"lowpass" | "highpass" | "bandpass" | "notch" | "peak" | "lowshelf" | "highshelf"} FilterType */

/** @param {number} linear */
export const db = (linear) => (linear > 1e-10 ? 20 * Math.log10(linear) : -200);
/** @param {number} power */
export const powerDb = (power) => (power > 1e-20 ? 10 * Math.log10(power) : -200);
/** @param {number} d */
export const fromDb = (d) => Math.pow(10, d / 20);
/** @param {number} x @param {number} lo @param {number} hi */
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
/** @param {number} n @param {number} [places] */
export const round = (n, places = 2) => { const m = Math.pow(10, places); return Math.round(n * m) / m; };

/**
 * One second-order filter section (Audio EQ Cookbook, R. Bristow-Johnson).
 * @param {FilterType} type @param {number} hz @param {number} sampleRate
 * @param {number} [q] @param {number} [gainDb] only for peak and shelves
 * @returns {Coefs}
 */
export function biquad(type, hz, sampleRate, q = Math.SQRT1_2, gainDb = 0) {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.49)) / sampleRate;
  const cos = Math.cos(w);
  const sin = Math.sin(w);
  const A = Math.pow(10, gainDb / 40);
  const alpha = sin / (2 * q);
  const k = 2 * Math.sqrt(A) * alpha;
  let b0 = 1, b1 = 0, b2 = 0, a0 = 1, a1 = 0, a2 = 0;
  if (type === "lowpass") { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === "highpass") { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === "bandpass") { b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === "notch") { b0 = 1; b1 = -2 * cos; b2 = 1; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; }
  else if (type === "peak") { b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; }
  else if (type === "lowshelf") {
    b0 = A * (A + 1 - (A - 1) * cos + k); b1 = 2 * A * (A - 1 - (A + 1) * cos); b2 = A * (A + 1 - (A - 1) * cos - k);
    a0 = A + 1 + (A - 1) * cos + k; a1 = -2 * (A - 1 + (A + 1) * cos); a2 = A + 1 + (A - 1) * cos - k;
  } else {
    b0 = A * (A + 1 + (A - 1) * cos + k); b1 = -2 * A * (A - 1 + (A + 1) * cos); b2 = A * (A + 1 + (A - 1) * cos - k);
    a0 = A + 1 - (A - 1) * cos + k; a1 = 2 * (A - 1 - (A + 1) * cos); a2 = A + 1 - (A - 1) * cos - k;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/**
 * Run one section or a cascade over a signal. Zero latency (minimum phase).
 * @param {ArrayLike<number>} x @param {Coefs | Coefs[]} coefs @param {Float32Array} [out]
 */
export function filter(x, coefs, out = new Float32Array(x.length)) {
  const list = Array.isArray(coefs) ? coefs : [coefs];
  const n = x.length;
  /** @type {ArrayLike<number>} */
  let src = x;
  for (const c of list) {
    let z1 = 0, z2 = 0;
    const { b0, b1, b2, a1, a2 } = c;
    for (let i = 0; i < n; i += 1) {
      const v = src[i];
      const y = b0 * v + z1;
      z1 = b1 * v - a1 * y + z2;
      z2 = b2 * v - a2 * y;
      out[i] = y;
    }
    src = out;
  }
  if (list.length === 0 && out !== x) for (let i = 0; i < n; i += 1) out[i] = x[i];
  return out;
}

/**
 * Gain in dB of a cascade at one frequency.
 * @param {Coefs | Coefs[]} coefs @param {number} hz @param {number} sampleRate
 */
export function responseDb(coefs, hz, sampleRate) {
  const w = (2 * Math.PI * hz) / sampleRate;
  const c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
  let total = 0;
  for (const c of Array.isArray(coefs) ? coefs : [coefs]) {
    const nr = c.b0 + c.b1 * c1 + c.b2 * c2, ni = -(c.b1 * s1 + c.b2 * s2);
    const dr = 1 + c.a1 * c1 + c.a2 * c2, di = -(c.a1 * s1 + c.a2 * s2);
    total += 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
  }
  return total;
}

/** @type {Map<number, { cos: Float64Array, sin: Float64Array, rev: Uint32Array }>} */
const TABLES = new Map();

/** @param {number} n */
function table(n) {
  let t = TABLES.get(n);
  if (t) return t;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error("FFT size must be a power of two.");
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n);
  for (let i = 0; i < n / 2; i += 1) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const bits = Math.round(Math.log2(n));
  for (let i = 0; i < n; i += 1) { let r = 0; for (let b = 0; b < bits; b += 1) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[i] = r >>> 0; }
  t = { cos, sin, rev };
  // Only the small, often used sizes are kept; a reverb-sized table is rebuilt when needed.
  if (n <= 65536) TABLES.set(n, t);
  return t;
}

/** A reusable FFT of one size (keeps its tables, whatever the size). @param {number} n */
export function makeFft(n) {
  const t = table(n);
  /** @param {Float64Array} re @param {Float64Array} im @param {boolean} [inverse] */
  return (re, im, inverse = false) => transform(re, im, inverse, t);
}

/**
 * In-place complex FFT; the inverse divides by n.
 * @param {Float64Array} re @param {Float64Array} im @param {boolean} [inverse]
 */
export function fft(re, im, inverse = false) {
  transform(re, im, inverse, table(re.length));
}

/** @param {Float64Array} re @param {Float64Array} im @param {boolean} inverse @param {{ cos: Float64Array, sin: Float64Array, rev: Uint32Array }} t */
function transform(re, im, inverse, t) {
  const n = re.length;
  const { cos, sin, rev } = t;
  for (let i = 0; i < n; i += 1) {
    const j = rev[i];
    if (j > i) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) {
      for (let j = 0, k = 0; j < half; j += 1, k += step) {
        const wr = cos[k], wi = inverse ? sin[k] : -sin[k];
        const a = i + j, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
  if (inverse) { const s = 1 / n; for (let i = 0; i < n; i += 1) { re[i] *= s; im[i] *= s; } }
}

/** Periodic Hann window. @param {number} size */
export function hann(size) {
  const w = new Float64Array(size);
  for (let i = 0; i < size; i += 1) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  return w;
}

/**
 * Change a signal in the frequency domain and put it back sample-aligned and
 * at the same length: square-root Hann on the way in and out, overlap-add.
 * `fn` edits one frame's spectrum in place. With a do-nothing `fn` the output
 * equals the input (to float rounding), which a test checks.
 * @param {ArrayLike<number>} x @param {number} size @param {number} hop size / 2 or size / 4
 * @param {(re: Float64Array, im: Float64Array, frame: number) => void} fn
 */
export function stftProcess(x, size, hop, fn) {
  const n = x.length;
  const out = new Float32Array(n);
  const win = hann(size).map(Math.sqrt);
  const scale = (2 * hop) / size;
  const re = new Float64Array(size), im = new Float64Array(size);
  const run = makeFft(size);
  let frame = 0;
  for (let s = hop - size; s < n; s += hop, frame += 1) {
    for (let i = 0; i < size; i += 1) { const at = s + i; re[i] = at >= 0 && at < n ? x[at] * win[i] : 0; im[i] = 0; }
    run(re, im);
    fn(re, im, frame);
    run(re, im, true);
    const from = Math.max(0, -s), to = Math.min(size, n - s);
    for (let i = from; i < to; i += 1) out[s + i] += re[i] * win[i] * scale;
  }
  return out;
}

/**
 * Power spectra of Hann-windowed frames (analysis only). `fn` gets the power
 * of bins 0..size/2 and the frame's first sample.
 * @param {ArrayLike<number>} x @param {number} size @param {number} hop
 * @param {(power: Float64Array, start: number, frame: number) => void} fn
 */
export function spectra(x, size, hop, fn) {
  const n = x.length;
  const win = hann(size);
  const re = new Float64Array(size), im = new Float64Array(size), power = new Float64Array(size / 2 + 1);
  const run = makeFft(size);
  let frame = 0;
  for (let s = 0; s + size <= n || (frame === 0 && n > 0); s += hop, frame += 1) {
    for (let i = 0; i < size; i += 1) { re[i] = s + i < n ? x[s + i] * win[i] : 0; im[i] = 0; }
    run(re, im);
    for (let k = 0; k <= size / 2; k += 1) power[k] = re[k] * re[k] + im[k] * im[k];
    fn(power, s, frame);
  }
  return frame;
}

/**
 * RMS level in dB of frames `frame` long, every `hop` samples (floor -120).
 * @param {ArrayLike<number>} x @param {number} frame @param {number} hop
 */
export function frameDb(x, frame, hop) {
  const count = Math.max(0, Math.floor((x.length - frame) / hop) + 1);
  const out = new Float32Array(count);
  for (let f = 0; f < count; f += 1) {
    let sum = 0;
    const s = f * hop;
    for (let i = 0; i < frame; i += 1) sum += x[s + i] * x[s + i];
    out[f] = Math.max(-120, powerDb(sum / frame));
  }
  return out;
}

/** @param {ArrayLike<number>} values @param {number} p 0..1 */
export function percentile(values, p) {
  if (values.length === 0) return NaN;
  const sorted = Float64Array.from(values).sort();
  const at = clamp(p, 0, 1) * (sorted.length - 1);
  const lo = Math.floor(at), hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

/** @param {ArrayLike<number>} values */
export const median = (values) => percentile(values, 0.5);

/**
 * A seeded random source (mulberry32): the same seed gives the same reverb
 * on every machine. `gauss` is a unit normal (Box-Muller).
 * @param {number} seed
 */
export function rng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, gauss: () => Math.sqrt(-2 * Math.log(next() + 1e-12)) * Math.cos(2 * Math.PI * next()) };
}

/**
 * One-pole smoothing of a control signal with separate rise and fall times.
 * @param {Float32Array} x @param {number} riseSamples @param {number} fallSamples @param {Float32Array} [out]
 */
export function smooth(x, riseSamples, fallSamples, out = new Float32Array(x.length)) {
  const up = riseSamples > 0 ? 1 - Math.exp(-1 / riseSamples) : 1;
  const down = fallSamples > 0 ? 1 - Math.exp(-1 / fallSamples) : 1;
  let y = x.length ? x[0] : 0;
  for (let i = 0; i < x.length; i += 1) { const v = x[i]; y += (v - y) * (v > y ? up : down); out[i] = y; }
  return out;
}
