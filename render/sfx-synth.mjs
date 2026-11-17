/**
 * Sound design made from nothing: the whooshes, impacts, booms, risers,
 * clicks and glitches that YouTube documentaries put under their edits,
 * synthesised by ffmpeg from noise and tones. Free, unlimited, nobody's
 * copyright, so they can sit under every transition and reveal.
 *
 * The timeline asks for them with AUTO-* tokens (engine/src/timeline.mjs);
 * the renderer makes each kind once and caches it.
 */
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { run } from "./render-film.mjs";

/** Each kind: length in seconds, an aevalsrc expression and a finishing chain. */
export const SYNTH = Object.freeze({
  // Air rushing past: band-limited noise that swells and falls.
  "AUTO-WHOOSH": { seconds: 0.55, expr: "(random(0)*2-1)*pow(sin(PI*t/0.55),2)", chain: "highpass=f=350,lowpass=f=4200,volume=0.9" },
  // A hit: a falling low tone with a short crack of noise.
  "AUTO-IMPACT": { seconds: 1.1, expr: "0.95*sin(2*PI*(46+70*exp(-t*18))*t)*exp(-t*5.5)+0.35*(random(0)*2-1)*exp(-t*38)", chain: "lowpass=f=5000" },
  // A bigger hit for reveals, with a tail.
  "AUTO-BOOM": { seconds: 2.4, expr: "0.95*sin(2*PI*(38+55*exp(-t*12))*t)*exp(-t*2.4)+0.25*(random(0)*2-1)*exp(-t*20)", chain: "lowpass=f=3200,aecho=0.8:0.6:120:0.3" },
  // Tension rising into a turn: a climbing tone under swelling noise.
  "AUTO-RISER": { seconds: 1.6, expr: "0.45*sin(2*PI*(180+420*t*t)*t)*pow(t/1.6,2)+0.28*(random(0)*2-1)*pow(t/1.6,3)", chain: "highpass=f=120,lowpass=f=6000" },
  // A camera-like click for a photograph.
  "AUTO-CLICK": { seconds: 0.18, expr: "(random(0)*2-1)*exp(-t*90)+0.4*sin(2*PI*2400*t)*exp(-t*160)", chain: "highpass=f=900" },
  // A digital stutter.
  "AUTO-GLITCH": { seconds: 0.4, expr: "(random(0)*2-1)*gt(sin(2*PI*28*t),0.2)*exp(-t*5)", chain: "acrusher=bits=6:mode=lin:samples=6,highpass=f=500" },
});

/** @typedef {keyof typeof SYNTH} SynthToken */

/**
 * Make (or reuse) every synthesised sound, as 48 kHz mono WAV files.
 * @param {string} dir @param {string} [ffmpeg]
 * @returns {Promise<Record<string, string>>} token -> file
 */
export async function synthSounds(dir, ffmpeg = "ffmpeg") {
  mkdirSync(dir, { recursive: true });
  /** @type {Record<string, string>} */
  const out = {};
  for (const [token, s] of Object.entries(SYNTH)) {
    const file = join(dir, `${token.toLowerCase()}-v1.wav`);
    if (!existsSync(file)) {
      await run(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${s.expr}':s=48000:d=${s.seconds}`, "-af", `${s.chain},afade=t=out:st=${(s.seconds * 0.8).toFixed(3)}:d=${(s.seconds * 0.2).toFixed(3)},alimiter=limit=0.9`, "-ac", "1", "-c:a", "pcm_s16le", file + ".part.wav"]);
      renameSync(file + ".part.wav", file);
    }
    out[token] = file;
  }
  return out;
}
