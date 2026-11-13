/**
 * The recitation film, rendered:
 *   node render/quran-render.mjs --run <voice-film folder> --audio <mastered or original voice>
 *        [--format 1080p|4k|9:16] [--reciter "name"] [--no-text] [--out film.mp4]
 * Reads shots.json (the director), media.json (the assets; a shot without
 * one becomes a slow dark card), understanding.json (the plan: ayah times)
 * and the verified texts. Every shot is rendered as its own clip (the asset
 * graded once for the whole film, a slow eased move), the clips are joined
 * with dissolves centred on the pauses, the Arabic of each ayah is typeset
 * in Amiri Quran from the Tanzil Uthmani text while it is recited (libass:
 * HarfBuzz shaping, FriBidi order), the title card opens from black and the
 * last shot holds through the tail and fades out. The recitation is the
 * only sound, as given (no music, no effects, no change of pitch or time).
 * Then the film is measured, not assumed: length against the voice,
 * loudness, true peak, black and frozen stretches, and where every cut is.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { measureMaster, mediaDuration, run } from "./render-film.mjs";

const FONTS = new URL("./assets/fonts/", import.meta.url).pathname;

/** @typedef {{ width: number, height: number, fps: number, fontSize: number, titleSize: number, margin: number }} Format */
/** @type {Record<string, Format>} */
export const FORMATS = Object.freeze({
  "1080p": { width: 1920, height: 1080, fps: 30, fontSize: 70, titleSize: 150, margin: 70 },
  "4k": { width: 3840, height: 2160, fps: 30, fontSize: 140, titleSize: 300, margin: 140 },
  "9:16": { width: 1080, height: 1920, fps: 30, fontSize: 62, titleSize: 130, margin: 300 },
});

/** One grade for the whole film: a little less colour, a little more depth, a soft vignette. */
export const GRADE = "eq=contrast=1.04:saturation=0.9:gamma=0.98,vignette=angle=PI/5";
const CARD = { c0: "0x10151c", c1: "0x232d3a" };

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * The clips and how they join: shot k is shown from its start to its end;
 * its clip runs half a dissolve longer on each side that has a neighbour,
 * and the dissolve into shot k+1 starts half its length before the cut, so
 * every dissolve is centred on the cut, which sits in a pause.
 * @param {{ start: number, end: number, transitionIn: { type: string, seconds: number } }[]} shots @param {number} total
 */
export function joinPlan(shots, total) {
  const n = shots.length;
  const ends = shots.map((s, k) => (k === n - 1 ? Math.max(s.end, total) : s.end));
  // A dissolve never takes more than a third of either shot it joins.
  const d = shots.map((s, k) => (k === 0 ? 0 : r3(Math.min(s.transitionIn.seconds, (ends[k - 1] - shots[k - 1].start) / 3, (ends[k] - s.start) / 3))));
  return shots.map((s, k) => {
    const lead = k === 0 ? 0 : d[k] / 2, tail = k === n - 1 ? 0 : d[k + 1] / 2;
    return { index: k, start: s.start, end: ends[k], from: r3(s.start - lead), length: r3(ends[k] - s.start + lead + tail), dissolveIn: d[k], offset: k === 0 ? 0 : r3(s.start - d[k] / 2) };
  });
}

/**
 * The move of a shot: the picture is scaled a little every frame (bicubic,
 * from the full-size source, so the move is smooth) and cropped to the
 * frame; a push, a pull or a sideways drift, eased in and out (smoothstep).
 * The amount grows with the shot's length (5% for a short shot, at most 14%),
 * so a long held shot still moves visibly and never looks frozen.
 * @param {string} move @param {number} seconds @param {Format} f
 */
export function moveFilter(move, seconds, f) {
  const amount = r3(Math.min(0.14, 0.05 + 0.0025 * seconds));
  const L = Math.max(0.1, seconds);
  const p = `(3*pow(min(t/${L},1),2)-2*pow(min(t/${L},1),3))`;
  const z = /push/.test(move) ? `(1+${amount}*${p})` : /pull/.test(move) ? `(1+${amount}-${amount}*${p})` : /locked/.test(move) ? "1" : `(1+${amount})`;
  const W = f.width, H = f.height;
  const scale = `scale=w='trunc(${W}*${z}/2)*2':h='trunc(${H}*${z}/2)*2':eval=frame:flags=bicubic`;
  const free = `(in_w-${W})`;
  const x = /drift left/.test(move) ? `${free}*(1-${p})` : /drift right|glide/.test(move) ? `${free}*${p}` : `${free}/2`;
  return `${scale},crop=${W}:${H}:x='${x}':y='(in_h-${H})/2'`;
}

/**
 * ffmpeg arguments for one clip.
 * @param {{ length: number }} seg @param {{ move: string }} shot @param {{ kind: "video" | "image", url: string, seconds: number | null } | null} asset
 * @param {Format} f @param {string} out
 */
export function clipArgs(seg, shot, asset, f, out) {
  const frames = Math.max(1, Math.round(seg.length * f.fps));
  const cover = `scale=${f.width}:${f.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${f.width}:${f.height},setsar=1`;
  /** @type {string[]} */
  let input;
  let slow = 1;
  if (!asset) input = ["-f", "lavfi", "-i", `gradients=s=${f.width}x${f.height}:c0=${CARD.c0}:c1=${CARD.c1}:speed=0.01:rate=${f.fps}:duration=${seg.length + 1}`];
  else if (asset.kind === "image") input = ["-loop", "1", "-framerate", String(f.fps), "-t", String(seg.length + 1), "-i", asset.url];
  else {
    // Skip a video's first tenth (titles, a shaky start), but keep enough to cover the shot.
    const start = asset.seconds && asset.seconds > seg.length + 2 ? Math.min(asset.seconds * 0.1, asset.seconds - seg.length - 1) : 0;
    const available = asset.seconds ? asset.seconds - start : seg.length;
    // A video a little shorter than its shot is slowed (at most to two thirds of its speed), never held on a frame.
    slow = available < seg.length ? Math.min(1.5, (seg.length + 0.1) / available) : 1;
    input = ["-ss", String(r3(start)), "-t", String(r3(seg.length / slow + 1)), "-i", asset.url];
  }
  const filter = `[0:v]${slow > 1 ? `setpts=${r3(slow)}*PTS,` : ""}fps=${f.fps},${cover},${moveFilter(shot.move, seg.length, f)},${GRADE},format=yuv420p,trim=end_frame=${frames},setpts=PTS-STARTPTS[v]`;
  return ["-hide_banner", "-loglevel", "error", "-y", ...input, "-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-r", String(f.fps), out];
}

/** The ayah as recited: the basmala Tanzil writes before ayah 1 of a surah is not part of it. @param {string} text @param {number} surah @param {number} ayah */
export function ayahOnScreen(text, surah, ayah) {
  if (ayah !== 1 || surah === 1 || surah === 9) return text;
  const words = text.split(/\s+/);
  const bare = words.slice(0, 4).join(" ").replace(/[ً-ٰٟۖ-ۭ]/g, "").replace(/ٱ/g, "ا");
  return bare === "بسم الله الرحمن الرحيم" ? words.slice(4).join(" ") : text;
}

/** @param {number} t */
const assTime = (t) => { const cs = Math.max(0, Math.round(t * 100)); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100); return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`; };
/** @param {string} s */
const assText = (s) => s.replace(/[{}]/g, "").replace(/\n/g, "\\N");

/**
 * The text of the film as an ASS file: the Arabic of each ayah while it is
 * recited (Tanzil Uthmani, verbatim), the title card (surah name in Arabic
 * and Latin letters, the reciter), and the closing credit line.
 * @param {{ scenes: { kind: string, surah: number, ayah: number | null, start: number, end: number, spokenStart: number | null, spokenEnd: number | null, endSure?: boolean }[] }} plan
 * @param {string[]} uthmani @param {{ number?: number, arabic?: string, transliteration?: string }[]} surahNames
 * @param {{ format: Format, total: number, reciter?: string, showAyat?: boolean }} o
 */
export function filmText(plan, uthmani, surahNames, o) {
  const f = o.format;
  const lines = ["[Script Info]", "ScriptType: v4.00+", `PlayResX: ${f.width}`, `PlayResY: ${f.height}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "", "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Ayah,Amiri Quran,${f.fontSize},&H00F0ECE4,&H00F0ECE4,&H20000000,&H60000000,0,0,0,0,100,100,0,0,1,${(f.fontSize / 28).toFixed(1)},${(f.fontSize / 22).toFixed(1)},2,${Math.round(f.width * 0.08)},${Math.round(f.width * 0.08)},${f.margin},-1`,
    `Style: Title,Amiri Quran,${f.titleSize},&H00F0ECE4,&H00F0ECE4,&H50000000,&H00000000,0,0,0,0,100,100,0,0,1,2,3,5,40,40,0,-1`,
    `Style: Small,Amiri Quran,${Math.round(f.fontSize * 0.5)},&H00D8D2C8,&H00D8D2C8,&H50000000,&H00000000,0,0,0,0,100,100,0,0,1,1,2,2,40,40,${Math.round(f.margin * 0.6)},1`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"];
  const offsetOf = (/** @type {number} */ surah) => { let k = 0; for (let s = 1; s < surah; s += 1) k += AYAT[s - 1]; return k; };
  // A recording that starts at once has no title scene: the surah's name is shown over the first seconds.
  const first = plan.scenes[0];
  /** @type {any[]} */
  const scenes = first && first.kind !== "title" ? [{ kind: "title", surah: first.surah, ayah: null, start: 0, end: Math.min(7, Math.max(4, (first.spokenEnd ?? 7) - 0.2)), spokenStart: null, spokenEnd: null, overlay: true }, ...plan.scenes] : plan.scenes;
  let hidden = 0;
  for (const s of scenes) {
    if (s.kind === "title") {
      const n = surahNames.find((x) => x.number === s.surah) ?? surahNames[s.surah - 1] ?? {};
      lines.push(`Dialogue: 0,${assTime(s.start + 0.8)},${assTime(s.end - 0.4)},Title,,0,0,${s.overlay ? Math.round(f.height * 0.12) : 0},,{\\fad(900,700)}${assText(`سورة ${n.arabic ?? ""}`)}`);
      const sub = [n.transliteration ? `Surah ${n.transliteration}` : "", o.reciter ? `Recited by ${o.reciter}` : ""].filter(Boolean).join("  ·  ");
      if (sub) lines.push(`Dialogue: 0,${assTime(s.start + 1.4)},${assTime(s.end - 0.4)},Small,,0,0,${Math.round(f.height * (s.overlay ? 0.36 : 0.3))},,{\\fad(900,700)\\fnDejaVu Sans}${assText(sub)}`);
      continue;
    }
    if (o.showAyat === false || s.ayah === null || s.spokenStart === null || s.spokenEnd === null) continue;
    // The Arabic is shown only while that ayah is surely being recited: both of its ends confirmed.
    const k = plan.scenes.indexOf(s), before = plan.scenes.slice(0, k).reverse().find((x) => x.kind === "ayah");
    if (s.endSure === false || before?.endSure === false) { hidden += 1; continue; }
    const text = ayahOnScreen(uthmani[offsetOf(s.surah) + s.ayah - 1] ?? "", s.surah, s.ayah);
    // A long ayah is shown whole: libass wraps it on word boundaries.
    lines.push(`Dialogue: 0,${assTime(s.spokenStart)},${assTime(s.spokenEnd + 0.4)},Ayah,,0,0,0,,{\\fad(500,500)\\blur0.6}${assText(text)} \uFD3F${arabicNumber(s.ayah)}\uFD3E`);
  }
  if (hidden) lines.push(`; ${hidden} ayah text(s) not shown: their timing is not confirmed by two methods`);
  lines.push(`Dialogue: 0,${assTime(Math.max(0, o.total - 6))},${assTime(o.total - 0.5)},Small,,0,0,0,,{\\fad(800,1200)\\fnDejaVu Sans}Quran text: Tanzil.net`);
  return lines.join("\n") + "\n";
}

/** @param {number} n */
const arabicNumber = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

const AYAT = [7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13, 14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6];

/**
 * The final pass: the clips joined by dissolves, fade from black, the text,
 * the slow fade out, and the recitation as the only sound.
 * @param {ReturnType<typeof joinPlan>} segs @param {string[]} clips @param {{ audio: string, ass: string | null, total: number, out: string, format: Format }} o
 */
export function finalArgs(segs, clips, o) {
  const inputs = clips.flatMap((c) => ["-i", c]);
  /** @type {string[]} */
  const parts = [];
  let last = "[0:v]";
  for (let k = 1; k < segs.length; k += 1) {
    const label = `[x${k}]`;
    parts.push(`${last}[${k}:v]xfade=transition=fade:duration=${segs[k].dissolveIn}:offset=${segs[k].offset}${label}`);
    last = label;
  }
  const fadeOut = 3;
  const text = o.ass ? `,ass='${o.ass.replace(/'/g, "\\'")}':fontsdir='${FONTS}'` : "";
  parts.push(`${last}fade=t=in:st=0:d=2,fade=t=out:st=${r3(Math.max(0, o.total - fadeOut))}:d=${fadeOut}${text},format=yuv420p[v]`);
  const audioIndex = clips.length;
  return ["-hide_banner", "-loglevel", "error", "-y", ...inputs, "-i", o.audio, "-filter_complex", parts.join(";"), "-map", "[v]", "-map", `${audioIndex}:a:0`,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", String(o.format.fps), "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-t", String(r3(o.total)), "-movflags", "+faststart", o.out];
}

/** Frozen stretches of 3 s or more (a still card would show here). @param {string} file */
async function frozen(file) {
  const log = await new Promise((ok) => {
    import("node:child_process").then(({ spawn }) => {
      const p = spawn("ffmpeg", ["-nostats", "-hide_banner", "-i", file, "-vf", "scale=320:-2,freezedetect=n=-60dB:d=3", "-an", "-f", "null", "-"], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => { err += d; });
      p.on("close", () => ok(err));
    });
  });
  return [...String(log).matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_end: ([\d.]+)/g)].map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));
}

/**
 * Render and measure.
 * @param {{ run: string, audio: string, format?: keyof typeof FORMATS, reciter?: string, showAyat?: boolean, out?: string, log?: (l: string) => void }} o
 */
export async function renderQuranFilm(o) {
  const f = FORMATS[o.format ?? "1080p"];
  const dir = resolve(o.run);
  const log = o.log ?? (() => {});
  const direction = JSON.parse(await readFile(join(dir, "shots.json"), "utf8"));
  const understanding = JSON.parse(await readFile(join(dir, "understanding.json"), "utf8"));
  /** @type {Map<string, any>} */
  const assets = new Map();
  try { for (const s of JSON.parse(await readFile(join(dir, "media.json"), "utf8")).shots) if (s.asset) assets.set(s.shot, s.asset); } catch { /* no media: every shot is a card */ }
  const data = new URL("../engine/data/quran/", import.meta.url);
  const { parseTanzilText } = await import("../engine/src/quran-meaning.mjs");
  const uthmani = parseTanzilText(await readFile(new URL("tanzil-quran-uthmani-1.1.txt", data), "utf8")).ayat;
  const surahNames = JSON.parse(await readFile(new URL("surah-names.json", data), "utf8"));
  const total = await mediaDuration(o.audio);
  const segs = joinPlan(direction.shots, total);
  const work = join(dir, "render-" + (o.format ?? "1080p").replace(":", "x"));
  await mkdir(work, { recursive: true });
  /** @type {string[]} */
  const clips = [];
  let reused = 0;
  for (const seg of segs) {
    const shot = direction.shots[seg.index];
    const clip = join(work, `${shot.id}.mp4`);
    const asset = assets.get(shot.id) ?? null;
    // A clip whose shot, asset and move are unchanged is kept: replacing one scene re-renders that scene only.
    const key = JSON.stringify({ from: seg.from, length: seg.length, move: shot.move, asset: asset?.url ?? null, format: o.format ?? "1080p", grade: GRADE });
    if (await readFile(clip + ".key", "utf8").then((k) => k === key, () => false)) { clips.push(clip); reused += 1; continue; }
    try { await run("ffmpeg", clipArgs(seg, shot, asset, f, clip)); await writeFile(clip + ".key", key); }
    catch (e) {
      // An asset that cannot be read becomes a card, and the report says so.
      log(`${shot.id}: ${asset ? "the asset could not be read, a card is used" : "card failed"}: ${/** @type {Error} */ (e).message.split("\n")[0]}`);
      if (!asset) throw e;
      assets.delete(shot.id);
      await run("ffmpeg", clipArgs(seg, shot, null, f, clip));
      await writeFile(clip + ".key", "card");
    }
    clips.push(clip);
    log(`${shot.id} ${seg.length.toFixed(2)} s ${asset ? asset.kind : "card"}`);
  }
  const assFile = join(work, "text.ass");
  await writeFile(assFile, filmText(understanding.quranPlan, uthmani, surahNames, { format: f, total, reciter: o.reciter, showAyat: o.showAyat }));
  const out = resolve(o.out ?? join(dir, `film-${(o.format ?? "1080p").replace(":", "x")}.mp4`));
  await mkdir(dirname(out), { recursive: true });
  await run("ffmpeg", finalArgs(segs, clips, { audio: o.audio, ass: assFile, total, out, format: f }));
  // Measured, not assumed.
  const seconds = await mediaDuration(out);
  const master = await measureMaster(out);
  const frozenStretches = await frozen(out);
  // Each cut against the voice: the distance from the cut to the nearest ayah end, and whether it is inside a recited stretch.
  const scenes = understanding.quranPlan.scenes.filter((/** @type {any} */ s) => s.kind === "ayah");
  const cuts = direction.shots.slice(1).map((/** @type {any} */ s) => s.start);
  // Where the voice is (the measured stretches of the 16 kHz copy): no cut may fall inside one.
  /** @type {{ start: number, end: number }[]} */
  let spans = [];
  try { const { readSpans } = await import("../local/voice-film.mjs"); spans = (await readSpans(join(dir, "voice-16k.wav"))).spans; } catch { spans = []; }
  const inVoice = cuts.filter((/** @type {number} */ c) => spans.some((sp) => c > sp.start + 0.02 && c < sp.end - 0.02));
  const ayahEnds = scenes.slice(0, -1).map((/** @type {any} */ s) => s.end);
  const atAyahEnd = cuts.filter((/** @type {number} */ c) => ayahEnds.some((/** @type {number} */ e) => Math.abs(e - c) < 0.05)).length;
  // The picture itself, measured: empty (dark, plain) and frozen stretches, with their times.
  const { auditFilm } = await import("./visual-audit.mjs");
  const visual = await auditFilm(out);
  // The sound itself, against the voice: length, sync, added silence, loudness, peaks, balance.
  const { auditAudio } = await import("./audio-audit.mjs");
  const audio = await auditAudio(out, o.audio);
  const cards = direction.shots.filter((/** @type {any} */ s) => !assets.has(s.id) && s.kind !== "title").map((/** @type {any} */ s) => ({ shot: s.id, start: s.start, end: s.end }));
  const report = {
    file: out, format: o.format ?? "1080p", width: f.width, height: f.height, seconds: r3(seconds), voiceSeconds: r3(total), lengthMatches: Math.abs(seconds - total) < 0.1,
    shots: segs.length, clipsRendered: segs.length - reused, clipsReused: reused, withAsset: direction.shots.filter((/** @type {any} */ s) => assets.has(s.id)).length, cards: direction.shots.filter((/** @type {any} */ s) => !assets.has(s.id)).length,
    integratedLufs: master.integratedLufs, truePeakDbtp: master.truePeakDbtp, black: master.black.filter((b) => b.start > 2.5 && b.end < total - 3.5), frozen: frozenStretches,
    cards, visual: { ok: visual.ok, coverage: visual.coverage, empty: visual.empty, frozen: visual.frozen },
    audio,
    cuts: cuts.length, cutsAtAyahEnds: atAyahEnd, cutsAtInnerPauses: cuts.length - atAyahEnd - inVoice.length, cutsInsideTheVoice: inVoice.length, voiceChecked: spans.length > 0,
  };
  await writeFile(join(dir, `render-report-${(o.format ?? "1080p").replace(":", "x")}.json`), JSON.stringify(report, null, 1));
  return report;
}

async function main() {
  const { parseArgs } = await import("../local/voice-film.mjs");
  const args = /** @type {Record<string, any>} */ (parseArgs(process.argv.slice(2)));
  if (typeof args.run !== "string" || typeof args.audio !== "string") { console.error("Usage: node render/quran-render.mjs --run <folder> --audio <voice> [--format 1080p|4k|9:16] [--reciter name]"); process.exit(2); }
  const format = ["1080p", "4k", "9:16"].includes(String(args.format)) ? args.format : "1080p";
  const r = await renderQuranFilm({ run: args.run, audio: resolve(args.audio), format, reciter: typeof args.reciter === "string" ? args.reciter : undefined, showAyat: args["no-text"] !== true, out: typeof args.out === "string" ? args.out : undefined, log: (l) => console.error("  " + l) });
  console.log("QURAN-RENDER " + JSON.stringify(r));
  // A film with a placeholder card or an empty stretch is never passed: it is a preview at most (--preview).
  const ok = r.lengthMatches && !r.black.length && !r.frozen.length && r.cutsInsideTheVoice === 0 && r.voiceChecked && r.visual.ok && r.audio.ok && (r.cards.length === 0 || args.preview === true);
  if (r.cards.length) console.error(`${r.cards.length} shot(s) have no licensed picture (${r.cards.map((/** @type {any} */ c) => `${c.shot} ${c.start.toFixed(1)}-${c.end.toFixed(1)} s`).join(", ")}): not a finished film.`);
  if (!ok) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
