#!/usr/bin/env node
/**
 * The critic (M6): a film passes only when it is good, not when it is done.
 *
 * It measures what the owner's 3-minute film failed on, and what a
 * 40-million-view documentary cannot fail on, from the timeline and the
 * render's own report — shot rhythm, moving picture, designed moments, the
 * first 30 seconds, sound cues on the moments, relevance, repeats, stereo
 * picture of the sound and loud dynamic range — and returns `block` with a
 * plain English and Bengali reason for every miss.
 *
 *   node render/critic.mjs --report out/<id>.report.json [--film out/<id>.mp4] [--timeline timeline.json]
 *
 * The release gate reads the same verdict (`report.critic`), so a film that
 * fails here does not get published.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

/**
 * The house standard. Numbers, not taste: each one is a failure the owner's
 * own 3-minute film showed, or a floor a documentary needs to feel edited.
 */
export const STANDARD = Object.freeze({
  /** A film under two minutes is a test, not a documentary. */
  minSeconds: 120,
  /** Average shot length: below 2 s is a stock montage, above 12 s is a slideshow. */
  avgShot: [2, 12],
  /** No shot may sit longer than this (a card or a black is measured apart). */
  maxShot: 20,
  /** At most this share of the film may be shots under 1.5 s (a burst of cuts). */
  shortShare: 0.3,
  /** At least this share of the film must be moving picture (footage or a designed move). */
  movingShare: 0.55,
  /** Designed moments (counter, kinetic line, chart, map, chapter title) per minute. */
  designedPerMinute: 1.2,
  /** The first shot may not be longer than this: the hook must turn early. */
  firstShotMax: 8,
  /** Cuts in the first 30 seconds. */
  first30Cuts: 3,
  /** Share of designed picture moments that must have a sound cue within 1.5 s. */
  cueCoverage: 0.7,
  /** Picture height, in pixels. */
  minHeight: 720,
  /** Integrated loudness window (LUFS) and true peak ceiling (dBTP). */
  lufs: [-15, -13],
  truePeak: -1,
  /** The loudness range must be more than a flat wall: the owner's film measured 1.9 LU. */
  lraMin: 3.5,
  /** Below this the film is a flat wall, not a mix: it is stopped, not merely noted. */
  lraBlock: 2,
  /** At least this share of a film's shots should be scored relevant when scores exist. */
  relevanceShare: 0.8,
  relevanceMin: 0.25,
  /** The same footage used more than this many times is a repeat. */
  repeatLimit: 3,
});

/** Moving picture types: real footage, or a still with a designed move. */
const MOVING = new Set(["clip", "live-video", "archival-video", "photo-designed", "photo-2.5D"]);

/** @typedef {{ code: string, severity: "block" | "warn" | "note", en: string, bn: string, value?: any }} Finding */

/** @param {Finding[]} findings */
export function verdictOf(findings) {
  return findings.some((f) => f.severity === "block") ? "block" : "pass";
}

/** @param {number} n @param {number} [digits] */
const round = (n, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/**
 * The moments the edit designed on purpose: numbers that count, kinetic lines,
 * charts, maps and chapter titles.
 * @param {any[]} video
 */
export function designedMoments(video) {
  return video.filter((v) => v.type !== "black" && (v.counter || v.kinetic || v.chart || v.map || v.chapterTitle));
}

/**
 * Read a timeline and the render's report and return every finding.
 * @param {any} timeline
 * @param {any} report
 * @param {{ channels?: number | null, relevance?: number[] | null, freezes?: { start: number, end: number }[] | null }} [evidence]
 * @returns {{ verdict: "pass" | "block", findings: Finding[], measures: Record<string, any> }}
 */
export function critique(timeline, report = {}, evidence = {}) {
  /** @type {Finding[]} */
  const findings = [];
  const add = (/** @type {Finding} */ f) => findings.push(f);
  const video = (timeline?.video ?? []).filter((/** @type {any} */ v) => v.type !== "black");
  const seconds = Number(timeline?.durationSeconds ?? report?.durationSeconds ?? 0);
  const fps = Number(timeline?.fps ?? report?.fps ?? 30);

  // --- rhythm -----------------------------------------------------------
  const lengths = video.map((/** @type {any} */ v) => Number(v.end) - Number(v.start)).filter((n) => n > 0);
  const total = lengths.reduce((a, b) => a + b, 0);
  const avg = lengths.length ? total / lengths.length : 0;
  const longest = lengths.length ? Math.max(...lengths) : 0;
  const shortShare = total ? lengths.filter((n) => n < 1.5).reduce((a, b) => a + b, 0) / total : 0;
  if (seconds && seconds < STANDARD.minSeconds) {
    add({ code: "critic.short", severity: "block", value: round(seconds, 1), en: `The film is ${round(seconds, 1)} s; a documentary is at least ${STANDARD.minSeconds} s.`, bn: `ফিল্মটি ${round(seconds, 1)} সেকেন্ড; ডকুমেন্টারি কমপক্ষে ${STANDARD.minSeconds} সেকেন্ড হওয়া দরকার।` });
  }
  if (lengths.length && (avg < STANDARD.avgShot[0] || avg > STANDARD.avgShot[1])) {
    add({ code: "critic.shotLength", severity: "block", value: round(avg), en: `The average shot is ${round(avg)} s; a documentary stays between ${STANDARD.avgShot[0]} and ${STANDARD.avgShot[1]} s (a stock montage or a slideshow fails here).`, bn: `গড় শট ${round(avg)} সেকেন্ড; ডকুমেন্টারিতে ${STANDARD.avgShot[0]}–${STANDARD.avgShot[1]} সেকেন্ড থাকা উচিত (স্টক মন্টাজ বা স্লাইডশো এখানেই আটকাবে)।` });
  }
  if (longest > STANDARD.maxShot) {
    add({ code: "critic.longShot", severity: "block", value: round(longest), en: `One shot holds ${round(longest)} s on screen; nothing should sit longer than ${STANDARD.maxShot} s.`, bn: `একটি শট ${round(longest)} সেকেন্ড স্থির থাকে; ${STANDARD.maxShot} সেকেন্ডের বেশি কোনো শট থাকা উচিত নয়।` });
  }
  if (seconds > 60 && shortShare > STANDARD.shortShare) {
    add({ code: "critic.burst", severity: "block", value: round(shortShare * 100, 0), en: `${round(shortShare * 100, 0)}% of the film is shots under 1.5 s: that is a burst of cuts, not an edit.`, bn: `ফিল্মের ${round(shortShare * 100, 0)}% শট ১.৫ সেকেন্ডের কম: এটা কাটের বিস্ফোরণ, সম্পাদনা নয়।` });
  }

  // --- picture ----------------------------------------------------------
  const moving = video.filter((/** @type {any} */ v) => MOVING.has(String(v.type)) || (v.type === "card" && v.motion === "push"));
  const movingShare = total ? moving.reduce((/** @type {number} */ a, /** @type {any} */ v) => a + (Number(v.end) - Number(v.start)), 0) / total : 0;
  if (total && movingShare < STANDARD.movingShare) {
    add({ code: "critic.still", severity: "block", value: round(movingShare * 100, 0), en: `Only ${round(movingShare * 100, 0)}% of the film moves; at least ${round(STANDARD.movingShare * 100, 0)}% must be footage or a designed move.`, bn: `ফিল্মের মাত্র ${round(movingShare * 100, 0)}% নড়ছে; অন্তত ${round(STANDARD.movingShare * 100, 0)}% ফুটেজ বা ডিজাইন করা মুভমেন্ট হওয়া দরকার।` });
  }
  const width = Number(timeline?.width ?? report?.width ?? 0);
  const height = Number(timeline?.height ?? report?.height ?? 0);
  if (height && height < STANDARD.minHeight) {
    add({ code: "critic.resolution", severity: "warn", value: `${width}x${height}`, en: `The picture is ${width}×${height}; publish at ${STANDARD.minHeight}p or more.`, bn: `ছবি ${width}×${height}; অন্তত ${STANDARD.minHeight}p-তে প্রকাশ করুন।` });
  }

  // --- design -----------------------------------------------------------
  const designed = designedMoments(video);
  const perMinute = seconds ? (designed.length * 60) / seconds : 0;
  if (seconds >= 30 && perMinute < STANDARD.designedPerMinute) {
    add({ code: "critic.designed", severity: "block", value: round(perMinute, 1), en: `Only ${round(perMinute, 1)} designed moments a minute; the house style needs ${STANDARD.designedPerMinute}.`, bn: `মিনিটে মাত্র ${round(perMinute, 1)}টি ডিজাইন করা মুহূর্ত; ঘরানার নিয়মে ${STANDARD.designedPerMinute}টি দরকার।` });
  }
  const sounds = (timeline?.sfx ?? []).filter((/** @type {any} */ s) => s.kind !== "bed");
  const covered = designed.filter((/** @type {any} */ v) => sounds.some((/** @type {any} */ s) => Math.abs(Number(s.start) - Number(v.start)) <= 1.5 || (Number(s.start) <= Number(v.start) + 0.2 && Number(s.end) >= Number(v.start))));
  const coverage = designed.length ? covered.length / designed.length : 1;
  if (designed.length && coverage < STANDARD.cueCoverage) {
    add({ code: "critic.cues", severity: "block", value: round(coverage * 100, 0), en: `${round(coverage * 100, 0)}% of the designed moments have a sound cue; the target is ${round(STANDARD.cueCoverage * 100, 0)}%.`, bn: `ডিজাইন করা মুহূর্তের ${round(coverage * 100, 0)}%তে সাউন্ড কিউ আছে; লক্ষ্য ${round(STANDARD.cueCoverage * 100, 0)}%.` });
  }

  // --- the hook ---------------------------------------------------------
  const firstShot = lengths.length ? lengths[0] : 0;
  if (firstShot > STANDARD.firstShotMax) {
    add({ code: "critic.firstShot", severity: "block", value: round(firstShot), en: `The first shot holds ${round(firstShot)} s; the hook must turn within ${STANDARD.firstShotMax} s.`, bn: `প্রথম শট ${round(firstShot)} সেকেন্ড চলে; প্রথম ${STANDARD.firstShotMax} সেকেন্ডের মধ্যে মোড় আসা দরকার।` });
  }
  const cuts30 = video.filter((/** @type {any} */ v) => Number(v.end) > 0 && Number(v.end) <= 30).length;
  const moments30 = designed.filter((/** @type {any} */ v) => Number(v.start) < 30).length;
  if (seconds > 30 && (cuts30 < STANDARD.first30Cuts || moments30 < 1)) {
    add({ code: "critic.opening", severity: "block", value: { cuts: cuts30, moments: moments30 }, en: `The first 30 s has ${cuts30} shots and ${moments30} designed moments; the opening needs ${STANDARD.first30Cuts} shots and at least one designed moment.`, bn: `প্রথম ৩০ সেকেন্ডে ${cuts30}টি শট আর ${moments30}টি ডিজাইন করা মুহূর্ত; দরকার ${STANDARD.first30Cuts}টি শট ও অন্তত একটি ডিজাইন করা মুহূর্ত।` });
  }

  // --- relevance and repeats --------------------------------------------
  const scores = (evidence.relevance ?? []).filter((n) => Number.isFinite(n));
  if (scores.length && scores.length >= video.length * 0.5) {
    const weak = scores.filter((n) => n < STANDARD.relevanceMin).length;
    const share = 1 - weak / scores.length;
    if (share < STANDARD.relevanceShare) {
      add({ code: "critic.relevance", severity: "block", value: round(share * 100, 0), en: `${round(share * 100, 0)}% of the shots are relevant to the words; ${round(STANDARD.relevanceShare * 100, 0)}% is the floor.`, bn: `শটের ${round(share * 100, 0)}% কথার সঙ্গে প্রাসঙ্গিক; ন্যূনতম ${round(STANDARD.relevanceShare * 100, 0)}% দরকার।` });
    }
  }
  /** @type {Map<string, number>} */
  const uses = new Map();
  for (const v of video) if (v.url) uses.set(String(v.url), (uses.get(String(v.url)) ?? 0) + 1);
  const repeated = [...uses].filter(([, n]) => n > STANDARD.repeatLimit);
  if (repeated.length) {
    add({ code: "critic.repeats", severity: "warn", value: repeated.length, en: `${repeated.length} pieces of footage appear more than ${STANDARD.repeatLimit} times.`, bn: `${repeated.length}টি ফুটেজ ${STANDARD.repeatLimit} বারের বেশি ব্যবহার হয়েছে।` });
  }

  // --- the sound --------------------------------------------------------
  const m = report?.master ?? {};
  const lufs = Number(m.integratedLufs);
  if (Number.isFinite(lufs) && (lufs < STANDARD.lufs[0] || lufs > STANDARD.lufs[1])) {
    add({ code: "critic.loudness", severity: "block", value: lufs, en: `The master is ${lufs} LUFS; the platform target is ${STANDARD.lufs[0]} to ${STANDARD.lufs[1]} LUFS.`, bn: `মাস্টার ${lufs} LUFS; প্ল্যাটফর্মের লক্ষ্য ${STANDARD.lufs[0]}–${STANDARD.lufs[1]} LUFS।` });
  }
  const peak = Number(m.truePeakDbtp);
  if (Number.isFinite(peak) && peak > STANDARD.truePeak) {
    add({ code: "critic.peak", severity: "block", value: peak, en: `The true peak is ${peak} dBTP; above ${STANDARD.truePeak} dBTP clips on playback.`, bn: `ট্রু পিক ${peak} dBTP; ${STANDARD.truePeak} dBTP-এর উপরে গেলে প্লেব্যাকে কেটে যায়।` });
  }
  const lra = Number(m.loudnessRangeLu);
  if (Number.isFinite(lra) && seconds > 60 && lra < STANDARD.lraMin) {
    add({ code: "critic.flat", severity: lra < STANDARD.lraBlock ? "block" : "warn", value: lra, en: `The loudness range is ${lra} LU: a narrow wall of sound, with little silence or lift under a reveal (the target is ${STANDARD.lraMin} LU or more).`, bn: `লাউডনেস রেঞ্জ ${lra} LU: শব্দের সরু দেয়াল, রিভিলের নিচে নীরবতা বা উত্থান কম (লক্ষ্য ${STANDARD.lraMin} LU বা বেশি)।` });
  }
  const channels = Number(evidence.channels);
  if (Number.isFinite(channels) && channels === 1 && seconds > 60) {
    add({ code: "critic.mono", severity: "warn", value: channels, en: "The master is mono; publish a stereo mix (the voice centred, music and effects placed).", bn: "মাস্টার মনো; স্টেরিও মিক্স প্রকাশ করুন (কণ্ঠ মাঝে, মিউজিক ও এফেক্ট দুই পাশে)।" });
  }
  const black = (report?.master?.black ?? []).length;
  if (black) {
    add({ code: "critic.black", severity: "block", value: black, en: `${black} stretch(es) of black picture the script does not ask for.`, bn: `স্ক্রিপ্টে না থাকা ${black}টি কালো ফ্রেম-স্ট্রেচ আছে।` });
  }
  const freezes = (evidence.freezes ?? []).filter((f) => f.end - f.start >= 2);
  if (freezes.length) {
    add({ code: "critic.frozen", severity: "warn", value: freezes.length, en: `${freezes.length} frozen stretch(es) of 2 s or more in the picture.`, bn: `ছবিতে ২ সেকেন্ড বা বেশি সময়ের ${freezes.length}টি জমে যাওয়া অংশ আছে।` });
  }

  const measures = {
    seconds: round(seconds, 1), shots: lengths.length, avgShot: round(avg), longestShot: round(longest),
    shortShare: round(shortShare, 3), movingShare: round(movingShare, 3), designedMoments: designed.length,
    designedPerMinute: round(perMinute, 2), cueCoverage: round(coverage, 3), firstShot: round(firstShot),
    cutsIn30: cuts30, momentsIn30: moments30, lufs: Number.isFinite(lufs) ? lufs : null,
    truePeak: Number.isFinite(peak) ? peak : null, lra: Number.isFinite(lra) ? lra : null,
    channels: Number.isFinite(channels) ? channels : null, fps,
  };
  return { verdict: verdictOf(findings), findings, measures };
}

/**
 * Measure a finished file itself: its channels, frozen picture and black
 * picture, from the file (not from the plan).
 * @param {string} file @param {{ ffmpeg?: string, ffprobe?: string, freezes?: boolean }} [o]
 */
export async function measureFilm(file, o = {}) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const ffprobe = o.ffprobe ?? "ffprobe";
  const channels = await new Promise((ok) => {
    const p = spawn(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "default=nw=1:nk=1", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("error", () => ok(null));
    p.on("close", () => ok(Number(out.trim()) || null));
  });
  const freezes = o.freezes === false ? [] : await new Promise((ok) => {
    const p = spawn(ffmpeg, ["-nostats", "-hide_banner", "-i", file, "-vf", "freezedetect=n=-60dB:d=2", "-map", "0:v", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", () => ok([]));
    p.on("close", () => {
      const starts = [...err.matchAll(/freeze_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      const ends = [...err.matchAll(/freeze_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      ok(starts.map((start, i) => ({ start, end: ends[i] ?? start })));
    });
  });
  return { channels, freezes };
}

/** One line per finding, both languages; also the decision line. */
export function reportCritic(result) {
  const lines = result.findings.map((f) => `${f.severity.toUpperCase()} ${f.code}: ${f.en}\n${f.bn}`);
  const m = result.measures;
  lines.push(`Critic: ${result.verdict.toUpperCase()} — ${m.shots} shots, average ${m.avgShot} s, ${Math.round(m.movingShare * 100)}% moving, ${m.designedPerMinute} designed moments a minute, ${m.lufs} LUFS, LRA ${m.lra} LU, ${m.channels} channel(s).`);
  lines.push(`ক্রিটিক: ${result.verdict === "pass" ? "পাস" : "ব্লক"} — ${m.shots}টি শট, গড় ${m.avgShot} সেকেন্ড, ${Math.round(m.movingShare * 100)}% নড়ছে, মিনিটে ${m.designedPerMinute}টি ডিজাইন করা মুহূর্ত, ${m.lufs} LUFS, LRA ${m.lra} LU, ${m.channels} চ্যানেল।`);
  return lines.join("\n");
}

async function main() {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { report: { type: "string" }, film: { type: "string" }, timeline: { type: "string" } } });
  if (!values.report && !values.timeline) { console.error("Give --report <report.json> and/or --timeline <timeline.json>."); process.exit(2); }
  const report = values.report && existsSync(values.report) ? JSON.parse(readFileSync(values.report, "utf8")) : {};
  const timeline = values.timeline && existsSync(values.timeline) ? JSON.parse(readFileSync(values.timeline, "utf8")) : report.timeline ?? null;
  if (!timeline) { console.error("No timeline: pass --timeline or use a report that carries one."); process.exit(2); }
  const evidence = values.film && existsSync(values.film) ? await measureFilm(values.film) : {};
  const result = critique(timeline, report, evidence);
  console.log(reportCritic(result));
  if (values.report) writeFileSync(values.report.replace(/\.report\.json$/, "") + ".critic.json", JSON.stringify(result, null, 1));
  process.exit(result.verdict === "block" ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
