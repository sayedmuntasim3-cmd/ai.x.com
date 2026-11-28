/**
 * The three YouTube Shorts of a finished film: 30 to 55 s each, 1080×1920,
 * cut from the film's strongest moments and ready to upload.
 *
 *   node render/shorts.mjs --run <folder> --film out/film.mp4 [--kind narration|quran]
 *        [--count 3] [--out shorts] [--font <bold .ttf>]
 *
 * Which moments is decided in code (engine/src/shorts-pick.mjs) from the film's
 * own words: a sentence with a number, a name, a question or a surprise to open
 * on, a full stop to close on, no two Shorts over the same seconds, and three
 * different parts of the film. A recitation is cut from whole ayat only.
 *
 * The picture is turned upright: the full frame centred over a blurred fill
 * (a card's words are spread across the frame) or a centre crop (a filmed
 * subject is normally centred). The captions are burned in, 2 to 4 words at a
 * time, white and bold with a dark outline, the word being said lit up, in the
 * lower-middle safe area; for a recitation the Arabic ayah and its Pickthall
 * line take their place (the film's own recitation, no music). The opening two
 * seconds carry the hook line, the last two say "Full film on the channel".
 *
 * Sound is set to the platform's loudness (-14 LUFS, true peak at most -1 dB)
 * and measured, with the film renderer's own correction when one loudnorm pass
 * lands off target.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { toAss } from "./cuts.mjs";
import { loudnessFix, measureMaster, mediaDuration, run } from "./render-film.mjs";
import { msg } from "../engine/src/messages.mjs";
import { ayahOffset, parseTanzilText } from "../engine/src/quran-meaning.mjs";
import { captionChunks, pickQuranShorts, pickVoiceShorts, reframeMode, wordsOf, SHORT_LIMITS } from "../engine/src/shorts-pick.mjs";

/** The shape of a Short, and the two lines every one of them carries. */
export const SHORTS = Object.freeze({
  width: 1080,
  height: 1920,
  min: SHORT_LIMITS.min,
  max: SHORT_LIMITS.max,
  hookSeconds: 2,
  outroSeconds: 2,
  outro: "Full film on the channel",
});

/** Bold faces to try, in order; the render machine installs fonts-dejavu-core. */
export const FONT_CANDIDATES = Object.freeze([
  new URL("./assets/fonts/Inter-Bold.ttf", import.meta.url).pathname,
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/Library/Fonts/Arial Bold.ttf",
]);

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;

/** The first bold font on this machine, or null. @param {string} [given] */
export function findFont(given) {
  if (given && existsSync(given)) return given;
  return FONT_CANDIDATES.find((f) => existsSync(f)) ?? null;
}

/** A path as ffmpeg's filter options want it (colons and quotes escaped). @param {string} p */
const esc = (p) => p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");

/**
 * The filter for one Short: the stretch of the film (already trimmed by -ss/-t),
 * turned upright, its captions burned in, the hook on for the first two
 * seconds and the closing line on for the last two.
 * @param {{ mode: "blurred" | "crop", hook?: string, hookFile?: string, fontFile?: string | null, ass?: string | null, fontDir?: string, seconds: number, width?: number, height?: number }} o
 */
export function shortFilter(o) {
  const W = o.width ?? SHORTS.width;
  const H = o.height ?? SHORTS.height;
  const bg = o.mode === "crop"
    ? `[0:v]split[a][b];[b]crop='trunc(min(ih*9/16,iw)/2)*2:ih',scale=${W}:${H}:flags=lanczos[fg]`
    : `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},gblur=sigma=28,eq=brightness=-0.2:saturation=0.85[bg];[b]scale=${W}:-2:flags=lanczos[fg]`;
  const joinUp = o.mode === "crop"
    ? "[fg]setsar=1"
    : "[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1";
  /** @type {string[]} */
  const drawn = [];
  if (o.fontFile) {
    const font = `fontfile='${esc(o.fontFile)}'`;
    const stroke = Math.max(3, Math.round(W * 0.006));
    if (o.hookFile) {
      drawn.push(`drawtext=${font}:textfile='${esc(o.hookFile)}':expansion=none:text_align=C:fontcolor=white:fontsize=${Math.round(W * 0.088)}:line_spacing=${Math.round(W * 0.022)}:borderw=${stroke}:bordercolor=black:box=1:boxcolor=black@0.35:boxborderw=${Math.round(W * 0.025)}:x=(w-text_w)/2:y=h*0.1:enable='lt(t,${SHORTS.hookSeconds})'`);
    }
    // The closing line sits in the middle of the frame, clear of the caption band and of the platform's own buttons.
    drawn.push(`drawtext=${font}:text='${SHORTS.outro.replace(/'/g, "\\'")}':expansion=none:fontcolor=white:fontsize=${Math.round(W * 0.058)}:borderw=${Math.max(2, stroke - 1)}:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=${Math.round(W * 0.02)}:x=(w-text_w)/2:y=h*0.42:enable='gte(t,${r3(Math.max(0, o.seconds - SHORTS.outroSeconds))})'`);
  }
  const subs = o.ass ? `,subtitles='${esc(o.ass)}'${o.fontDir ? `:fontsdir='${esc(o.fontDir)}'` : ""}` : "";
  const tail = `${drawn.length ? "," + drawn.join(",") : ""}${subs},format=yuv420p[v]`;
  return `${bg};${joinUp}${tail}`;
}

/**
 * ffmpeg arguments for one Short. The picture comes from the film itself, so no
 * frame is invented; the sound keeps the film's own mix, set to platform level.
 * @param {{ film: string, start: number, end: number, out: string, filter: string, ffmpeg?: string }} o
 */
export function shortArgs(o) {
  const seconds = r3(o.end - o.start);
  return [
    "-v", "error", "-y",
    "-ss", o.start.toFixed(3), "-t", seconds.toFixed(3), "-i", o.film,
    "-filter_complex", o.filter,
    "-map", "[v]", "-map", "0:a?",
    "-af", "loudnorm=I=-14:TP=-1:LRA=15",
    "-t", seconds.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-maxrate", "9000k", "-bufsize", "18000k",
    "-pix_fmt", "yuv420p", "-r", "30",
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-movflags", "+faststart", o.out,
  ];
}

/** @typedef {{ start: number, end: number, text: string, words: { text: string, start: number, end: number }[] }} Caption */

/**
 * The caption file of a spoken Short: the chunks of 2 to 4 words in the film's
 * own words, moved to start at zero, the word being said highlighted.
 * @param {{ text: string, start: number, end: number }[]} words words of the film inside the Short
 * @param {{ start: number, width?: number, height?: number, font?: string }} o
 */
export function captionsAss(words, o) {
  const W = o.width ?? SHORTS.width;
  const H = o.height ?? SHORTS.height;
  const shifted = words.map((w) => ({ text: w.text, start: r3(Math.max(0, w.start - o.start)), end: r3(Math.max(0, w.end - o.start)) }));
  const chunks = captionChunks(shifted);
  return toAss(chunks, { width: W, height: H, font: o.font ?? "Inter", size: Math.round(W * 0.072), marginV: Math.round(H * 0.26) });
}

/** @param {number} n */
const arabicNumber = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

/** @param {number} t */
const assTime = (t) => {
  const cs = Math.max(0, Math.round(t * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
};

/** @param {string} s */
const assText = (s) => String(s).replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");

/**
 * The text of a recitation Short: the Arabic ayah (Tanzil Uthmani, verbatim,
 * never retyped) while it is recited, and Pickthall's English line under it —
 * never word captions, because the words of the Quran are not chopped up.
 * @param {{ surah: number, ayah: number, start: number, end: number, arabic: string, english: string }[]} scenes times relative to the Short
 * @param {{ width?: number, height?: number }} [o]
 */
export function quranAss(scenes, o = {}) {
  const W = o.width ?? SHORTS.width;
  const H = o.height ?? SHORTS.height;
  const arabicSize = Math.round(W * 0.078);
  const englishSize = Math.round(W * 0.04);
  const lines = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Ayah,Amiri Quran,${arabicSize},&H00F0ECE4,&H00F0ECE4,&H30000000,&H60000000,0,0,0,0,100,100,0,0,1,${(arabicSize / 30).toFixed(1)},${(arabicSize / 24).toFixed(1)},2,${Math.round(W * 0.07)},${Math.round(W * 0.07)},${Math.round(H * 0.34)},-1`,
    `Style: Meaning,Inter,${englishSize},&H00EDE7DB,&H00EDE7DB,&H40000000,&H50000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(englishSize / 14))},1,2,${Math.round(W * 0.08)},${Math.round(W * 0.08)},${Math.round(H * 0.23)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const s of scenes) {
    if (!(s.end > s.start)) continue;
    // The Arabic is the Tanzil text as shipped, with the ayah's own number in ornate brackets.
    lines.push(`Dialogue: 0,${assTime(s.start)},${assTime(s.end)},Ayah,,0,0,0,,{\\fad(260,260)}${assText(`${s.arabic} \uFD3F${arabicNumber(s.ayah)}\uFD3E`)}`);
    if (s.english) lines.push(`Dialogue: 0,${assTime(s.start + 0.12)},${assTime(Math.max(s.start + 0.4, s.end - 0.05))},Meaning,,0,0,0,,{\\fad(260,260)}${assText(s.english)}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Render one Short from an explicit stretch of the film (the picker hands the
 * times in; a test can hand any stretch, so a 10 s one is renderable).
 * @param {{
 *   film: string, start: number, end: number, out: string, id?: string,
 *   hook?: string, mode?: "blurred" | "crop", ass?: string | null, workDir?: string,
 *   fontFile?: string | null, fontDir?: string, ffmpeg?: string, log?: (l: string) => void,
 * }} o
 */
export async function renderShort(o) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const id = o.id ?? "short-1";
  const seconds = r3(o.end - o.start);
  const workDir = o.workDir ?? dirname(o.out);
  mkdirSync(workDir, { recursive: true });
  mkdirSync(dirname(o.out), { recursive: true });
  const hookFile = join(workDir, `${id}.hook.txt`);
  if (o.hook && o.fontFile) writeFileSync(hookFile, wrap(o.hook, 18).join("\n"));
  const filter = shortFilter({
    mode: o.mode ?? "crop",
    hook: o.hook,
    hookFile: o.hook && o.fontFile ? hookFile : undefined,
    fontFile: o.fontFile ?? null,
    ass: o.ass ?? null,
    fontDir: o.fontDir,
    seconds,
  });
  /** @type {string[]} */
  const warnings = [];
  try {
    await run(ffmpeg, shortArgs({ film: o.film, start: o.start, end: o.end, out: o.out + ".part.mp4", filter, ffmpeg }));
  } catch (error) {
    // An ffmpeg built without libfreetype cannot draw text: the Short still goes out with its burned-in captions and
    // says so, rather than being lost. (A build without libass loses the captions too, and the Short is reported failed.)
    if (!/drawtext/i.test(String(error))) throw error;
    warnings.push("this ffmpeg cannot draw text: the hook line and the closing line are missing");
    o.log?.(msg("shorts.noFont").en);
    const plain = shortFilter({ mode: o.mode ?? "crop", ass: o.ass ?? null, fontDir: o.fontDir, seconds });
    await run(ffmpeg, shortArgs({ film: o.film, start: o.start, end: o.end, out: o.out + ".part.mp4", filter: plain, ffmpeg }));
  }
  renameSync(o.out + ".part.mp4", o.out);
  // Measured, not assumed: one loudnorm pass can land off target, so the same exact gain step the film renderer
  // uses is applied (picture copied), and the Short is measured again.
  /** @type {Awaited<ReturnType<typeof measureMaster>> | null} */
  let master = null;
  try {
    master = await measureMaster(o.out, ffmpeg);
    for (let pass = 1; pass <= 3; pass += 1) {
      const fix = loudnessFix(master);
      if (!fix) break;
      await run(ffmpeg, ["-v", "error", "-y", "-i", o.out, "-map", "0", "-c:v", "copy", "-af", fix.af, "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", o.out + ".gain.mp4"]);
      renameSync(o.out + ".gain.mp4", o.out);
      master = await measureMaster(o.out, ffmpeg);
      o.log?.(`${id}: loudness pass ${pass} moved ${fix.gain > 0 ? "+" : ""}${fix.gain} dB to ${master.integratedLufs} LUFS (target -14)`);
    }
  } catch (error) {
    o.log?.(msg("shorts.unmeasured", { id, why: error instanceof Error ? error.message.split("\n")[0] : String(error) }).en);
  }
  const measured = r3(await mediaDuration(o.out).catch(() => seconds));
  return {
    id,
    file: o.out,
    start: r3(o.start),
    end: r3(o.end),
    seconds: measured,
    width: SHORTS.width,
    height: SHORTS.height,
    lufs: master?.integratedLufs ?? null,
    peak: master?.truePeakDbtp ?? null,
    hook: o.hook ?? "",
    mode: o.mode ?? "crop",
    warnings,
  };
}

/** @param {string} text @param {number} n */
function wrap(text, n) {
  /** @type {string[]} */
  const lines = [];
  let line = "";
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (line && (line + " " + w).length > n) { lines.push(line); line = w; } else line = line ? line + " " + w : w;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/** @param {string} file */
async function readJson(file) {
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

/**
 * The whole pass over one run folder: pick the Shorts, render each, write
 * shorts.json. A Short that fails is reported and skipped; the film is never
 * touched, and the other Shorts still render.
 * @param {{ run: string, film: string, out?: string, kind?: "narration" | "quran", count?: number, font?: string,
 *          ffmpeg?: string, log?: (l: string) => void, shorts?: { start: number, end: number, id: string, hook?: string, mode?: "blurred" | "crop" }[] }} o
 */
export async function shortsFromRun(o) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const log = o.log ?? (() => {});
  const runDir = resolve(o.run);
  const film = resolve(o.film);
  const outDir = resolve(o.out ?? "shorts");
  const fontFile = findFont(o.font);
  if (!fontFile) log(msg("shorts.noFont").en);
  const fontDir = fontFile ? dirname(fontFile) : undefined;
  const fontName = fontFile && /Inter/i.test(fontFile) ? "Inter" : "DejaVu Sans";
  const understanding = await readJson(join(runDir, "understanding.json"));
  const kind = o.kind ?? (understanding?.quranPlan ? "quran" : "narration");
  const total = r3(await mediaDuration(film).catch(() => 0));
  const shots = (await readJson(join(runDir, "shots.json")))?.shots ?? [];

  /** @type {{ id: string, start: number, end: number, hook?: string, surah?: number, fromAyah?: number, toAyah?: number }[]} */
  let picks = [];
  /** @type {any[]} */
  let quranScenes = [];
  /** @type {any[]} */
  let filmWords = [];
  if (o.shorts?.length) picks = o.shorts.map((s) => ({ ...s }));
  else if (kind === "quran") {
    const scenes = (understanding?.quranPlan?.scenes ?? []).filter((/** @type {any} */ s) => s.kind === "ayah");
    const location = {
      ayat: scenes.map((/** @type {any} */ s) => ({
        surah: Number(s.surah), ayah: Number(s.ayah),
        start: Number(s.spokenStart ?? s.start), end: Number(s.spokenEnd ?? s.end),
        sure: s.endSure !== false,
      })).filter((/** @type {any} */ a) => Number.isFinite(a.start) && Number.isFinite(a.end) && a.end > a.start),
    };
    picks = pickQuranShorts(location, total || (location.ayat.at(-1)?.end ?? 0), { count: o.count });
    quranScenes = scenes;
  } else {
    filmWords = wordsOf((await readJson(join(runDir, "words.json"))) ?? []);
    picks = pickVoiceShorts(filmWords, { count: o.count, duration: total });
  }
  if (!picks.length) {
    log(msg("shorts.none", { min: SHORTS.min, max: SHORTS.max }).en);
    return { film, kind, shorts: [], out: outDir };
  }
  log(msg("shorts.picked", { count: picks.length, list: picks.map((p) => `${p.id} ${p.start.toFixed(1)}–${p.end.toFixed(1)} s`).join(", ") }).en);

  // The Quran's own text, verbatim, straight from the shipped files.
  /** @type {string[] | null} */ let arabic = null;
  /** @type {string[] | null} */ let english = null;
  if (kind === "quran") {
    const data = new URL("../engine/data/quran/", import.meta.url);
    arabic = parseTanzilText(readFileSync(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8")).ayat;
    /** @type {{ ayat: string[] }} */
    const pickthall = JSON.parse(readFileSync(new URL("pickthall-1930.json", data), "utf8"));
    english = pickthall.ayat;
  }

  /** @type {any[]} */
  const made = [];
  for (const p of picks) {
    const id = p.id;
    const start = r3(p.start);
    const end = r3(p.end);
    const seconds = r3(end - start);
    const covered = shots.filter((/** @type {any} */ s) => s.end > start && s.start < end);
    const mode = p.mode ?? reframeMode(covered);
    const hook = p.hook ?? "";
    try {
      let ass = null;
      if (kind === "quran") {
        const inside = quranScenes
          .map((/** @type {any} */ s) => ({
            surah: Number(s.surah), ayah: Number(s.ayah),
            start: Math.max(0, Number(s.spokenStart ?? s.start) - start),
            end: Math.min(seconds, Number(s.spokenEnd ?? s.end) - start),
          }))
          .filter((/** @type {any} */ s) => s.end > s.start)
          .map((/** @type {any} */ s) => {
            // Read from the shipped text by surah and ayah: the sacred words are never retyped.
            const k = ayahOffset(s.surah, s.ayah);
            return { ...s, arabic: k >= 0 ? String(arabic?.[k] ?? "") : "", english: k >= 0 ? String(english?.[k] ?? "") : "" };
          })
          .filter((/** @type {any} */ s) => s.arabic);
        ass = join(outDir, `${id}.ass`);
        mkdirSync(outDir, { recursive: true });
        writeFileSync(ass, quranAss(inside, { width: SHORTS.width, height: SHORTS.height }));
      } else {
        ass = join(outDir, `${id}.ass`);
        mkdirSync(outDir, { recursive: true });
        const inside = filmWords.filter((w) => w.end > start && w.start < end);
        writeFileSync(ass, captionsAss(inside, { start, width: SHORTS.width, height: SHORTS.height, font: fontName }));
      }
      const r = await renderShort({
        film, start, end, out: join(outDir, `${id}.mp4`), id, hook, mode, ass,
        workDir: outDir, fontFile, fontDir, ffmpeg, log,
      });
      made.push({
        ...r,
        hook,
        reframe: mode,
        ...(kind === "quran" ? { surah: p.surah, fromAyah: p.fromAyah, toAyah: p.toAyah } : {}),
      });
      log(msg("shorts.rendered", { id, seconds: r.seconds, width: r.width, height: r.height, lufs: r.lufs ?? "?", peak: r.peak ?? "?" }).en);
      if (r.lufs !== null && Math.abs(r.lufs + 14) > 1) log(`${id}: ${r.lufs} LUFS, the target is -14 LUFS within 1 LU.`);
      if (r.peak !== null && r.peak > -1) log(`${id}: true peak ${r.peak} dBTP, the limit is -1 dBTP.`);
    } catch (error) {
      const why = error instanceof Error ? error.message.split("\n")[0] : String(error);
      log(msg("shorts.failed", { id, why }).en);
      made.push({ id, start, end, seconds, failed: why });
    }
  }
  const report = {
    film,
    kind,
    at: new Date().toISOString(),
    width: SHORTS.width,
    height: SHORTS.height,
    limits: { min: SHORTS.min, max: SHORTS.max },
    count: made.filter((s) => !s.failed).length,
    shorts: made,
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "shorts.json"), JSON.stringify(report, null, 1));
  return report;
}

/** @param {string[]} argv */
function parseArgs(argv) {
  /** @type {Record<string, string | boolean>} */
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) { out[key] = next; i += 1; } else out[key] = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (typeof args.run !== "string" || typeof args.film !== "string") {
    console.error("Usage: node render/shorts.mjs --run <folder> --film <film.mp4> [--kind narration|quran] [--count 3] [--out shorts] [--font <bold .ttf>]");
    process.exit(2);
  }
  const kind = args.kind === "quran" || args.kind === "narration" ? args.kind : undefined;
  const r = await shortsFromRun({
    run: resolve(args.run), film: resolve(args.film),
    out: typeof args.out === "string" ? resolve(args.out) : undefined,
    kind,
    count: Number.isInteger(Number(args.count)) && Number(args.count) > 0 ? Number(args.count) : undefined,
    font: typeof args.font === "string" ? args.font : undefined,
    log: (l) => console.error("  " + l),
  });
  console.log("SHORTS " + JSON.stringify({ count: r.count, shorts: r.shorts.map((/** @type {any} */ s) => ({ id: s.id, seconds: s.seconds, lufs: s.lufs, peak: s.peak, failed: s.failed })) }));
  // Nothing to cut is not a failure of the film: the caller decides what to do with an empty set.
  if (r.shorts.some((/** @type {any} */ s) => s.failed) && r.count === 0) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
