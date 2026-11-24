#!/usr/bin/env node
/**
 * The free score: one original instrumental track per music cue, synthesised here from the cue's
 * brief (engine/src/score-plan.mjs) when no paid music service is set, so wordless scenes are
 * never dead silence. Pads, a low string bed, an ostinato pulse, plucked or struck notes (guitar
 * and pizzicato by Karplus-Strong, felt piano, marimba), soft percussion and sub hits, through a
 * small hall reverb; chord cycles in the cue's mode and tempo; it enters gently and ends on the
 * tonic. Made from nothing, owned by nobody else: no licence, nothing for content ID to match.
 *
 *   node render/score-synth.mjs (--run <folder> | --api <site> --id <film id>) --out music/
 *   node render/score-synth.mjs --brief "Tense pulse, low strings; 120" --seconds 40 --out sample.wav
 *
 * Tracks that already exist (hand-picked or composed) are kept. Films whose music policy is not
 * "score" (Quran recitation, Islamic content, the Arabic version) get nothing.
 */
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scoreAllowed, scorePlan, seedOf } from "../engine/src/score-plan.mjs";
import { encodeWav16 } from "../engine/src/wav.mjs";

const SR = 48000;
const mtof = (/** @type {number} */ m) => 440 * 2 ** ((m - 69) / 12);

/** @param {number} seed */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A band-limited wave table: `harmonics` partials falling off as 1/n^power. */
function table(harmonics, power) {
  const n = 4096;
  const t = new Float32Array(n + 1);
  for (let i = 0; i <= n; i += 1) for (let k = 1; k <= harmonics; k += 1) t[i] += Math.sin((2 * Math.PI * k * i) / n) / k ** power;
  let peak = 0;
  for (const v of t) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i <= n; i += 1) t[i] /= peak;
  return t;
}
const SAW = table(12, 1);
const SOFT = table(6, 1.8);

/**
 * One sustained or short note from a wave table into the stereo mix, with its own low-pass.
 * @param {Float32Array[]} out [L, R] @param {{ at: number, len: number, freq: number, amp: number, attack: number, release: number, wave: Float32Array, pan: number, cutoff: number, detune?: number }} n
 */
function tone(out, n) {
  const [L, R] = out;
  const start = Math.max(0, Math.round(n.at * SR));
  const end = Math.min(L.length, Math.round((n.at + n.len + n.release) * SR));
  const inc = (n.freq * 2 ** ((n.detune ?? 0) / 1200) * 4096) / SR;
  const a = Math.exp((-2 * Math.PI * n.cutoff) / SR);
  const gl = n.amp * Math.cos(((n.pan + 1) * Math.PI) / 4);
  const gr = n.amp * Math.sin(((n.pan + 1) * Math.PI) / 4);
  const att = Math.max(1, n.attack * SR);
  const hold = Math.round((n.at + n.len) * SR);
  const rel = Math.max(1, n.release * SR);
  let phase = (seedOf(String(n.freq)) % 4096) | 0;
  let y = 0;
  for (let i = start; i < end; i += 1) {
    const k = phase | 0;
    const s = n.wave[k] + (n.wave[k + 1] - n.wave[k]) * (phase - k);
    phase += inc;
    if (phase >= 4096) phase -= 4096;
    y = (1 - a) * s + a * y;
    const t = i - start;
    const env = t < att ? t / att : i < hold ? 1 : Math.exp((-5 * (i - hold)) / rel);
    L[i] += y * env * gl;
    R[i] += y * env * gr;
  }
}

/**
 * A plucked string (Karplus-Strong): guitar when damping is light, pizzicato when heavy.
 * @param {Float32Array[]} out @param {{ at: number, freq: number, amp: number, pan: number, seconds: number, damping: number }} n @param {() => number} rnd
 */
function pluck(out, n, rnd) {
  const [L, R] = out;
  const period = Math.max(2, Math.round(SR / n.freq));
  const buf = new Float32Array(period);
  let prev = 0;
  for (let i = 0; i < period; i += 1) { const w = rnd() * 2 - 1; prev = 0.5 * (w + prev); buf[i] = prev; }
  const start = Math.round(n.at * SR);
  const end = Math.min(L.length, start + Math.round(n.seconds * SR));
  const gl = n.amp * Math.cos(((n.pan + 1) * Math.PI) / 4);
  const gr = n.amp * Math.sin(((n.pan + 1) * Math.PI) / 4);
  let j = 0;
  for (let i = start; i < end; i += 1) {
    const next = (j + 1) % period;
    const v = buf[j];
    buf[j] = n.damping * 0.5 * (buf[j] + buf[next]);
    j = next;
    const fade = i > end - 2400 ? (end - i) / 2400 : 1;
    L[i] += v * gl * fade;
    R[i] += v * gr * fade;
  }
}

/**
 * Struck notes from decaying partials: a felt piano (slightly stretched partials) or a marimba.
 * @param {Float32Array[]} out @param {{ at: number, freq: number, amp: number, pan: number, kind: "piano" | "marimba" }} n
 */
function struck(out, n) {
  const [L, R] = out;
  const partials = n.kind === "marimba" ? [[1, 1, 1.6], [3.93, 0.25, 7], [9.2, 0.05, 20]] : [[1, 1, 0.9], [2.003, 0.45, 1.4], [3.008, 0.22, 2.2], [4.016, 0.12, 3.1], [5.03, 0.06, 4.4]];
  const seconds = n.kind === "marimba" ? 1.6 : 4;
  const start = Math.round(n.at * SR);
  const end = Math.min(L.length, start + Math.round(seconds * SR));
  const gl = n.amp * Math.cos(((n.pan + 1) * Math.PI) / 4);
  const gr = n.amp * Math.sin(((n.pan + 1) * Math.PI) / 4);
  for (let i = start; i < end; i += 1) {
    const t = (i - start) / SR;
    let s = 0;
    for (const [mult, amp, decay] of partials) s += amp * Math.sin(2 * Math.PI * n.freq * mult * t) * Math.exp(-decay * t);
    const onset = Math.min(1, t / 0.004); // felt: no click
    L[i] += s * onset * gl;
    R[i] += s * onset * gr;
  }
}

/** A soft low thump, a short hat, or a deep sub hit. @param {Float32Array[]} out @param {{ at: number, kind: "kick" | "hat" | "sub", amp: number }} n @param {() => number} rnd */
function drum(out, n, rnd) {
  const [L, R] = out;
  const seconds = n.kind === "sub" ? 2.2 : n.kind === "kick" ? 0.35 : 0.05;
  const start = Math.round(n.at * SR);
  const end = Math.min(L.length, start + Math.round(seconds * SR));
  let ph = 0;
  let last = 0;
  for (let i = start; i < end; i += 1) {
    const t = (i - start) / SR;
    let s;
    if (n.kind === "hat") { const w = rnd() * 2 - 1; s = (w - last) * Math.exp(-t * 90); last = w; }
    else {
      const f = n.kind === "sub" ? 30 + 30 * Math.exp(-t * 6) : 48 + 70 * Math.exp(-t * 30);
      ph += (2 * Math.PI * f) / SR;
      s = Math.sin(ph) * Math.exp(-t * (n.kind === "sub" ? 1.6 : 11));
    }
    L[i] += s * n.amp;
    R[i] += s * n.amp;
  }
}

/** A small hall: four damped combs and two all-passes per side (Schroeder), in place on `send`, added to `out`. */
function reverb(/** @type {Float32Array[]} */ send, /** @type {Float32Array[]} */ out, wet = 0.3) {
  const sets = [[1429, 1781, 1973, 2099], [1465, 1743, 1963, 2153]];
  send.forEach((x, ch) => {
    const combs = sets[ch].map((d) => ({ buf: new Float32Array(d), i: 0, lp: 0 }));
    const aps = [241, 83].map((d) => ({ buf: new Float32Array(d), i: 0 }));
    for (let n = 0; n < x.length; n += 1) {
      let y = 0;
      for (const c of combs) {
        const o = c.buf[c.i];
        c.lp = o * 0.7 + c.lp * 0.3;
        c.buf[c.i] = x[n] + c.lp * 0.8;
        c.i = (c.i + 1) % c.buf.length;
        y += o;
      }
      y *= 0.25;
      for (const a of aps) {
        const b = a.buf[a.i];
        const v = y + b * 0.7;
        a.buf[a.i] = v;
        a.i = (a.i + 1) % a.buf.length;
        y = b - v * 0.7;
      }
      out[ch][n] += y * wet;
    }
  });
}

/**
 * Play one cue's plan for `seconds`: stereo Float32 channels at 48 kHz, mastered to sit as a bed.
 * @param {import("../engine/src/score-plan.mjs").ScorePlan} plan @param {number} seconds
 */
export function synthCue(plan, seconds) {
  const frames = Math.ceil((seconds + 0.5) * SR);
  const dry = [new Float32Array(frames), new Float32Array(frames)];
  const send = [new Float32Array(frames), new Float32Array(frames)];
  const rnd = random(seedOf(plan.cue));
  const beat = 60 / plan.bpm;
  const bar = 4 * beat;
  const chordLen = 2 * bar;
  const cycle = chordLen * plan.chords.length;
  const total = seconds;
  const step = plan.layers.sparse ? 2 * beat : plan.mood === "warm" || plan.mood === "neutral" ? beat : beat / 2;
  for (let at = 0, k = 0; at < total; at += chordLen, k += 1) {
    const last = at + chordLen >= total - 0.01;
    const [offset, quality] = last ? [0, plan.chords[0][1]] : plan.chords[k % plan.chords.length];
    const root = plan.root + offset;
    const third = quality === "m" ? 3 : 4;
    const len = Math.min(chordLen, total - at);
    const lift = 1 + 0.12 * Math.sin(k * 1.7); // phrases breathe a little
    // Pad: chord tones in the middle register, two detuned voices each, through the hall.
    for (const [i, iv] of [0, third, 7, 12].entries()) {
      let m = root + 12 + iv;
      while (m > 67) m -= 12;
      for (const det of [-7, 7]) tone(send, { at, len, freq: mtof(m), amp: 0.045 * lift, attack: Math.min(1.6, len / 2), release: 2.2, wave: SOFT, pan: (i - 1.5) * 0.25 + det / 40, cutoff: 1100 + 500 * Math.sin(k * 0.9), detune: det });
    }
    if (plan.layers.low) tone(dry, { at, len, freq: mtof(root - (root > 45 ? 12 : 0)), amp: 0.11 * lift, attack: 1.8, release: 2, wave: SAW, pan: 0, cutoff: 260 });
    const busy = at >= Math.min(cycle, 10); // the first cycle (or 10 s) is pad alone: the cue enters gently
    if (!busy) continue;
    for (let t = at, j = 0; t < at + len - 0.01; t += beat / 2, j += 1) {
      if (plan.layers.pulse) tone(dry, { at: t, len: beat * 0.22, freq: mtof(root + (plan.mood === "driving" && j % 4 === 2 ? 7 : 0) - (root > 45 ? 12 : 0)), amp: (j % 8 === 0 ? 0.085 : 0.06) * plan.intensity, attack: 0.006, release: beat * 0.35, wave: SAW, pan: 0.15, cutoff: 650 });
      if (plan.layers.perc && j % 2 === 1) drum(dry, { at: t, kind: "hat", amp: 0.022 * plan.intensity }, rnd);
      if (plan.layers.perc && j % 8 === 0) drum(dry, { at: t, kind: "kick", amp: 0.2 * plan.intensity }, rnd);
    }
    if (plan.layers.pluck) {
      const tones = [0, third, 7, 12, 7 + 12, third + 12];
      for (let t = at, j = 0; t < at + len - 0.01; t += step, j += 1) {
        if (plan.layers.sparse && rnd() < 0.35) continue; // a sparse part leaves gaps
        let m = root + 24 + tones[(j * 2 + (k % 2)) % tones.length];
        while (m > 79) m -= 12;
        const pan = (rnd() - 0.5) * 0.6;
        if (plan.layers.pluck === "guitar" || plan.layers.pluck === "pizzicato") pluck(send, { at: t, freq: mtof(m), amp: 0.16, pan, seconds: plan.layers.pluck === "guitar" ? 2.4 : 0.5, damping: plan.layers.pluck === "guitar" ? 0.997 : 0.982 }, rnd);
        else struck(send, { at: t, freq: mtof(m), amp: plan.layers.pluck === "marimba" ? 0.1 : 0.075, pan, kind: plan.layers.pluck });
      }
    }
    if (plan.layers.hits && k % plan.chords.length === 0) drum(dry, { at, kind: "sub", amp: 0.32 }, rnd);
  }
  reverb(send, dry, 0.32);
  for (let ch = 0; ch < 2; ch += 1) for (let i = 0; i < frames; i += 1) dry[ch][i] += send[ch][i] * 0.75;
  return master(dry, seconds);
}

/** Rumble cut, a bed loudness of about -17 dBFS RMS, a gentle fade in and out, never a clipped peak. */
function master(/** @type {Float32Array[]} */ ch, /** @type {number} */ seconds) {
  let sum = 0;
  for (const x of ch) {
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < x.length; i += 1) { const y = 0.996 * (prevOut + x[i] - prevIn); prevIn = x[i]; prevOut = y; x[i] = y; sum += y * y; }
  }
  const rms = Math.sqrt(sum / (ch[0].length * 2)) || 1;
  const gain = 0.14 / rms;
  const fadeIn = 2 * SR;
  const fadeOut = Math.min(4, seconds / 4) * SR;
  const end = Math.round(seconds * SR);
  let peak = 0;
  for (const x of ch) for (let i = 0; i < x.length; i += 1) {
    const env = Math.min(1, i / fadeIn, Math.max(0, (end - i) / fadeOut));
    const v = Math.tanh(x[i] * gain * env * 1.1) / 1.1;
    x[i] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  if (peak > 0.95) for (const x of ch) for (let i = 0; i < x.length; i += 1) x[i] *= 0.95 / peak;
  return ch.map((x) => x.subarray(0, end));
}

/**
 * Score every cue that has no track yet. Returns what it made, kept and why.
 * @param {{ cues: import("../engine/src/score-plan.mjs").MusicCue[], lengths: Record<string, number>, outDir: string, policy: { policy: string }, log?: (l: string) => void }} o
 */
export function scoreKit(o) {
  const result = {
    // The licence record the mission asks for: every track this makes is our own composition, so there is
    // no third-party recording to credit and nothing for a content-ID system to match.
    licence: "original: synthesised by render/score-synth.mjs from the cue's own brief (no third-party recording)",
    made: /** @type {{ cue: string, seconds: number, why: string }[]} */ ([]), kept: 0, refused: /** @type {string | null} */ (null),
  };
  if (!scoreAllowed(o.policy)) { result.refused = `music policy is "${o.policy.policy}": no instruments for this film`; return result; }
  mkdirSync(o.outDir, { recursive: true });
  for (const c of o.cues) {
    const seconds = o.lengths[c.cue];
    if (!seconds) continue;
    if (["mp3", "wav", "m4a", "aac", "ogg", "flac"].some((e) => existsSync(join(o.outDir, `${c.cue}.${e}`)))) { result.kept += 1; continue; }
    const plan = scorePlan(c);
    const file = join(o.outDir, `${c.cue}.wav`);
    writeFileSync(file + ".part", Buffer.from(encodeWav16(synthCue(plan, Math.max(10, Math.ceil(seconds + 1))), SR)));
    renameSync(file + ".part", file);
    result.made.push({ cue: c.cue, seconds: Math.ceil(seconds + 1), why: plan.why });
    o.log?.(`score: ${c.cue} ${plan.why}`);
  }
  writeFileSync(join(o.outDir, "score-kit.json"), JSON.stringify(result, null, 1));
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 2) args[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
  if (args.brief && args.out) {
    const plan = scorePlan({ cue: args.cue ?? "M01", brief: args.brief.replace(/;\s*\d{2,3}\s*$/, ""), bpm: Number(/;\s*(\d{2,3})\s*$/.exec(args.brief)?.[1]) || null });
    writeFileSync(args.out, Buffer.from(encodeWav16(synthCue(plan, Number(args.seconds ?? 30)), SR)));
    console.log(plan.why);
    process.exit(0);
  }
  if (!args.out || !(args.run || (args.api && args.id))) {
    console.error("Usage: node render/score-synth.mjs (--run <folder> | --api <site> --id <film id>) --out music/   |   --brief \"Tense pulse; 120\" --seconds 30 --out sample.wav");
    process.exit(2);
  }
  const { loadRunFiles, loadRunText } = await import("./render-film.mjs");
  const { musicPlan } = await import("./music-kit.mjs");
  const { buildTimeline } = await import("../engine/src/timeline.mjs");
  const { musicPlanFor } = await import("../engine/src/voice-plan.mjs");
  const from = args.run ? { dir: args.run } : { api: args.api.replace(/\/$/, ""), id: args.id };
  const s4 = await loadRunText(from, "s4.md");
  if (!s4) { console.error("No s4.md in this run."); process.exit(1); }
  const raw = JSON.parse((await loadRunText(from, "film.json")) ?? (await loadRunText(from, "run.json")) ?? "{}");
  const film = raw.film ?? raw;
  const timeline = buildTimeline({ chapters: await loadRunFiles(from) });
  /** @type {Record<string, number>} */
  const lengths = {};
  for (const m of timeline.music) lengths[m.cue] = Math.max(lengths[m.cue] ?? 0, m.end - m.start);
  const r = scoreKit({ cues: musicPlan(s4), lengths, outDir: args.out, policy: musicPlanFor({ contentType: film.contentType ?? "documentary", versionId: film.versionId ?? "en-US" }), log: (l) => console.log(l) });
  console.log(JSON.stringify({ made: r.made.length, kept: r.kept, refused: r.refused }, null, 1));
}
