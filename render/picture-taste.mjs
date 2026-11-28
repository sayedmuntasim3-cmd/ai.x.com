/**
 * Picture taste (owner's note on the Apollo 11 voice film e0b87efb, 28 Nov 2026): a film passed the gate with its
 * pictures small inside black, in tilted white "polaroid" borders, the same moon mosaic six times in a row, a TV
 * logo in the corner and white text on an empty black card. The gate was blind to all of it.
 *
 * Pure measuring on small gray pictures (Uint8Array, one byte per pixel), plus two thin ffmpeg readers:
 *   - contentBox       the real picture inside black / white borders and the jagged black of a stitched mosaic
 *   - framePlan        how a picture of that shape fills a 16:9 frame (cover, pan across, pan down, blur-fill)
 *   - dHash / hamming  a perceptual hash, to find the same picture twice
 *   - cornerLogo       a static high-contrast patch in a corner across the frames of a clip
 *   - logoSource       a broadcaster named in a record's own metadata
 *   - measureTaste     the finished master, shot by shot: filled share, hash, logo, text on black
 */
import { spawn } from "node:child_process";

/** A pixel this dark (or this light) at the picture's edge is border, not picture. */
export const VOID_BLACK = 14;
export const VOID_WHITE = 245;
/** A shot must fill at least this share of the frame with picture (the gate blocks below it). */
export const MIN_FILLED = 0.85;
/** Two shots whose perceptual hashes are this close (of 64 bits) show the same picture. */
export const SAME_PICTURE_BITS = 10;
/** The cut chooser refuses a picture this close to one it already used (looser than the gate: it must also catch crops). */
export const NEAR_COPY_BITS = 14;

/**
 * The pixels that are border: dark or white, and joined to the picture's edge through other such pixels.
 * @param {Uint8Array} gray @param {number} w @param {number} h
 */
export function voidMask(gray, w, h) {
  const mask = new Uint8Array(w * h);
  const is = (/** @type {number} */ i) => gray[i] <= VOID_BLACK || gray[i] >= VOID_WHITE;
  /** @type {number[]} */
  const stack = [];
  const push = (/** @type {number} */ i) => { if (!mask[i] && is(i)) { mask[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x += 1) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = /** @type {number} */ (stack.pop());
    const x = i % w, y = (i - x) / w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
  }
  return mask;
}

/** Share of border pixels in a picture (0 = all picture). @param {Uint8Array} gray @param {number} w @param {number} h */
export function voidShare(gray, w, h) {
  const m = voidMask(gray, w, h);
  let n = 0;
  for (let i = 0; i < m.length; i += 1) n += m[i];
  return n / m.length;
}

/**
 * The real picture inside its borders, as the largest box with (almost) no border in it, in fractions of the whole
 * picture: starts at the bounding box of the non-border pixels and sheds the edge strip with the most border until
 * the box is clean. A picture with no border keeps the whole frame. When the box would shrink under a third of the
 * picture (a night scene, a blown-out sky) the picture is not trimmed at all: that dark or light is its content.
 * @param {Uint8Array} gray @param {number} w @param {number} h @param {{ clean?: number, floor?: number }} [o]
 * @returns {{ x: number, y: number, w: number, h: number, trimmed: boolean, void: number }}
 */
export function contentBox(gray, w, h, o = {}) {
  const clean = o.clean ?? 0.004;
  const floor = o.floor ?? 0.15;
  const mask = voidMask(gray, w, h);
  let total = 0;
  for (let i = 0; i < mask.length; i += 1) total += mask[i];
  const whole = { x: 0, y: 0, w: 1, h: 1, trimmed: false, void: total / (w * h) };
  if (total / (w * h) < 0.01) return whole;
  // Summed-area table of the border mask, to count border inside any box in O(1).
  const sat = new Int32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let row = 0;
    for (let x = 0; x < w; x += 1) { row += mask[y * w + x]; sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row; }
  }
  const count = (/** @type {number} */ x0, /** @type {number} */ y0, /** @type {number} */ x1, /** @type {number} */ y1) => (x1 <= x0 || y1 <= y0 ? 0 : sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0]);
  let x0 = 0, y0 = 0, x1 = w, y1 = h;
  // The bounding box of the non-border pixels first.
  while (y0 < y1 && count(0, y0, w, y0 + 1) === w) y0 += 1;
  while (y1 > y0 && count(0, y1 - 1, w, y1) === w) y1 -= 1;
  while (x0 < x1 && count(x0, 0, x0 + 1, h) === h) x0 += 1;
  while (x1 > x0 && count(x1 - 1, 0, x1, h) === h) x1 -= 1;
  const area = () => (x1 - x0) * (y1 - y0);
  while (area() > 0 && count(x0, y0, x1, y1) / area() > clean && area() / (w * h) > floor) {
    const bw = x1 - x0, bh = y1 - y0;
    const density = [count(x0, y0, x0 + 1, y1) / bh, count(x1 - 1, y0, x1, y1) / bh, count(x0, y0, x1, y0 + 1) / bw, count(x0, y1 - 1, x1, y1) / bw];
    const worst = density.indexOf(Math.max(...density));
    if (worst === 0) x0 += 1; else if (worst === 1) x1 -= 1; else if (worst === 2) y0 += 1; else y1 -= 1;
  }
  if (area() / (w * h) <= floor) return whole;
  const box = { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h, trimmed: x0 > 0 || y0 > 0 || x1 < w || y1 < h, void: total / (w * h) };
  return box;
}

/**
 * How a picture of this shape fills the frame, with no black and no border:
 *   cover      its shape is near the frame's: scale up and crop (a camera's crop), toward the subject
 *   pan-across a very wide panorama: full height, a slow pan across its width
 *   pan-down   a tall portrait: full width, a slow pan down its height
 *   blur-fill  the content is too small to fill the frame sharply: the last resort, over a blurred copy of itself
 * @param {{ width: number, height: number }} content the content box in pixels @param {number} frameAspect @param {{ minWidth?: number }} [o]
 * @returns {{ mode: "cover" | "pan-across" | "pan-down" | "blur-fill", ratio: number }}
 */
export function framePlan(content, frameAspect, o = {}) {
  const ratio = content.width / content.height / frameAspect;
  if (content.width < (o.minWidth ?? 320) || content.height < 180) return { mode: "blur-fill", ratio };
  if (ratio > 1.7) return { mode: "pan-across", ratio };
  if (ratio < 0.6) return { mode: "pan-down", ratio };
  return { mode: "cover", ratio };
}

/**
 * Where the subject is, as the centre of the picture's detail (gradient energy) inside the box, in fractions of the
 * box (0..1), so a crop keeps faces and machines rather than sky. Pulled halfway to the middle: a crop should not hug an edge.
 * @param {Uint8Array} gray @param {number} w @param {number} h @param {{ x: number, y: number, w: number, h: number }} box
 */
export function subjectCentre(gray, w, h, box) {
  const x0 = Math.floor(box.x * w), y0 = Math.floor(box.y * h), x1 = Math.ceil((box.x + box.w) * w), y1 = Math.ceil((box.y + box.h) * h);
  let sx = 0, sy = 0, sum = 0;
  for (let y = y0 + 1; y < y1 - 1; y += 1) for (let x = x0 + 1; x < x1 - 1; x += 1) {
    const i = y * w + x;
    const g = Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + w] - gray[i - w]);
    sx += g * (x - x0); sy += g * (y - y0); sum += g;
  }
  if (!sum) return { x: 0.5, y: 0.5 };
  const cx = sx / sum / (x1 - x0), cy = sy / sum / (y1 - y0);
  return { x: 0.5 + (cx - 0.5) / 2, y: 0.5 + (cy - 0.5) / 2 };
}

/**
 * A 64-bit difference hash of a gray picture (area-averaged to 9x8), as 16 hex digits. Robust to scale, grade and light noise.
 * @param {Uint8Array} gray @param {number} w @param {number} h
 */
export function dHash(gray, w, h) {
  const gw = 9, gh = 8;
  const cell = new Float64Array(gw * gh);
  for (let cy = 0; cy < gh; cy += 1) for (let cx = 0; cx < gw; cx += 1) {
    const xa = Math.floor((cx * w) / gw), xb = Math.max(xa + 1, Math.floor(((cx + 1) * w) / gw));
    const ya = Math.floor((cy * h) / gh), yb = Math.max(ya + 1, Math.floor(((cy + 1) * h) / gh));
    let s = 0, n = 0;
    for (let y = ya; y < yb; y += 1) for (let x = xa; x < xb; x += 1) { s += gray[y * w + x]; n += 1; }
    cell[cy * gw + cx] = s / n;
  }
  let bits = 0n;
  for (let y = 0; y < gh; y += 1) for (let x = 0; x < gw - 1; x += 1) bits = (bits << 1n) | (cell[y * gw + x] < cell[y * gw + x + 1] ? 1n : 0n);
  return bits.toString(16).padStart(16, "0");
}

/** Hamming distance of two 16-digit hashes. @param {string} a @param {string} b */
export function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`), n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/**
 * Pictures that appear twice: every pair of items whose hashes are within `bits`. An item with a `held` flag (a shot that
 * deliberately holds the nearest strong pick) and one with no hash are not compared.
 * @template {{ id: string, hash?: string | null, held?: boolean }} T
 * @param {T[]} items in film order @param {number} [bits]
 * @returns {{ a: string, b: string, bits: number, consecutive: boolean }[]}
 */
export function repeatedPictures(items, bits = SAME_PICTURE_BITS) {
  /** @type {{ a: string, b: string, bits: number, consecutive: boolean }[]} */
  const out = [];
  for (let i = 0; i < items.length; i += 1) {
    const a = items[i];
    if (!a.hash || a.held) continue;
    for (let j = i + 1; j < items.length; j += 1) {
      const b = items[j];
      if (!b.hash || b.held) continue;
      const d = hamming(a.hash, b.hash);
      if (d <= bits) out.push({ a: a.id, b: b.id, bits: d, consecutive: j === i + 1 });
    }
  }
  return out;
}

/**
 * A burned-in corner logo across the frames of one clip: a corner patch whose strong edges stay put in every frame while
 * the rest of the picture moves. A still picture (nothing moves) never counts: a logo is only told from the picture by the picture moving.
 * @param {{ gray: Uint8Array, w: number, h: number }[]} frames at least 3, spread over the clip
 * @param {{ corner?: number, edge?: number, share?: number, motion?: number }} [o]
 * @returns {{ found: boolean, corner: string, share: number, motion: number }}
 */
export function cornerLogo(frames, o = {}) {
  const none = { found: false, corner: "", share: 0, motion: 0 };
  if (frames.length < 3) return none;
  const { w, h } = frames[0];
  const pw = Math.max(4, Math.round(w * (o.corner ?? 0.24))), ph = Math.max(4, Math.round(h * (o.corner ?? 0.24)));
  const edge = o.edge ?? 36;
  const corners = /** @type {[string, number, number][]} */ ([["top-left", 0, 0], ["top-right", w - pw, 0], ["bottom-left", 0, h - ph], ["bottom-right", w - pw, h - ph]]);
  // How much the picture outside the corners moves between frames (mean absolute difference, 0-255).
  let motion = 0, m = 0;
  for (let k = 1; k < frames.length; k += 1) for (let y = ph; y < h - ph; y += 1) for (let x = pw; x < w - pw; x += 1) { motion += Math.abs(frames[k].gray[y * w + x] - frames[k - 1].gray[y * w + x]); m += 1; }
  motion = m ? motion / m : 0;
  if (motion < (o.motion ?? 6)) return { ...none, motion: Math.round(motion * 10) / 10 };
  let best = { corner: "", share: 0 };
  for (const [name, cx, cy] of corners) {
    let strong = 0;
    for (let y = cy + 1; y < cy + ph - 1; y += 1) for (let x = cx + 1; x < cx + pw - 1; x += 1) {
      let every = true, lo = 255, hi = 0;
      for (const f of frames) {
        const i = y * w + x;
        const g = Math.abs(f.gray[i + 1] - f.gray[i - 1]) + Math.abs(f.gray[i + w] - f.gray[i - w]);
        if (g < edge) { every = false; break; }
        lo = Math.min(lo, f.gray[i]); hi = Math.max(hi, f.gray[i]);
      }
      if (every && hi - lo < 28) strong += 1;
    }
    const share = strong / (pw * ph);
    if (share > best.share) best = { corner: name, share };
  }
  return { found: best.share >= (o.share ?? 0.03), corner: best.corner, share: Math.round(best.share * 1000) / 1000, motion: Math.round(motion * 10) / 10 };
}

/** Broadcasters and TV collections whose footage carries the station's logo in a corner. */
const BROADCASTERS = /\b(?:cnn|bbc(?:\s*(?:news|world))?|abc\s*news|cbs(?:\s*news)?|nbc(?:\s*news)?|fox\s*news|msnbc|c-?span|pbs\s*newshour|sky\s*news|al\s*jazeera|rt\s*news|euronews|tv\s*news(?:\s*archive)?|tvnews|news\s*at\s*(?:six|ten|nine)|evening\s*news|nightly\s*news|kqed|kgo|kpix|ktvu|wnbc|wabc|wcbs|ntv|tbs|tnt|espn)\b/i;
/** Internet Archive identifiers of the TV News Archive: call letters, an 8-digit date, a show. */
const TV_IDENTIFIER = /(?:^|[\/_\s-])[A-Z]{3,5}_\d{8}_\d{6}_/;

/**
 * A record whose own metadata says a broadcaster made it (its title, collection, creator, tags or identifier): its footage carries a station logo.
 * @param {{ title?: string | null, id?: string, url?: string | null, previewUrl?: string | null, collection?: string | string[] | null, creator?: string | null, tags?: string[] | string | null, source?: string | null }} c
 */
export function logoSource(c) {
  const bag = [c.title, c.id, c.url, c.previewUrl, Array.isArray(c.collection) ? c.collection.join(" ") : c.collection, c.creator, Array.isArray(c.tags) ? c.tags.join(" ") : c.tags].filter(Boolean).join(" ");
  const m = BROADCASTERS.exec(bag);
  if (m) return `a broadcaster (${m[0]})`;
  if (TV_IDENTIFIER.test(bag)) return "a TV News Archive recording";
  if (/\b(?:tvnews|tv-news|television news)\b/i.test(bag)) return "a TV news collection";
  return "";
}

/**
 * A card that is white text on an empty black screen (filler): a plain card (no designed graphic, no paper look, no map or chart)
 * whose frame is almost all black.
 * @param {any} v the shot @param {number} darkShare share of pixels at or under luma 30
 */
export function textOnBlack(v, darkShare) {
  return plainCard(v) && darkShare >= 0.9;
}

/** A card with no designed graphic, paper look, map, chart or counter: plain text on the card's own ground. @param {any} v */
export function plainCard(v) {
  return String(v.type) === "card" && !v.graphic && v.style !== "paper" && !v.map && !v.chart && !v.counter && !v.chapterTitle && !v.moment;
}

/** A shot the edit made on purpose to be small, dark or empty. @param {any} v */
function deliberate(v) {
  return Boolean(v.chart || v.map || v.counter || v.kinetic || v.chapterTitle || v.graphic || v.style === "paper" || String(v.type) === "card" || String(v.type) === "black");
}

/** @param {string} bin @param {string[]} args @returns {Promise<Buffer>} */
function bytes(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "ignore"] });
    /** @type {Buffer[]} */
    const out = [];
    p.stdout.on("data", (d) => out.push(d));
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(`${bin} exited ${code}`))));
  });
}

/**
 * One picture as a small gray image (the same size whatever its shape: fractions are what matter).
 * @param {string} file @param {{ ffmpeg?: string, w?: number, h?: number }} [o]
 * @returns {Promise<{ gray: Uint8Array, w: number, h: number }>}
 */
export async function grayOf(file, o = {}) {
  const w = o.w ?? 256, h = o.h ?? 144;
  const buf = await bytes(o.ffmpeg ?? "ffmpeg", ["-v", "error", "-i", file, "-frames:v", "1", "-vf", `scale=${w}:${h}:flags=area,format=gray`, "-f", "rawvideo", "-"]);
  return { gray: new Uint8Array(buf.buffer, buf.byteOffset, w * h), w, h };
}

/**
 * The finished master, measured shot by shot at 4 frames a second (128x72 gray): how much of each picture shot is
 * picture (not black or white border), its perceptual hash, a burned-in logo in clips, and text on an empty black card.
 * @param {string} file @param {any} timeline @param {{ ffmpeg?: string, fps?: number }} [o]
 */
export async function measureTaste(file, timeline, o = {}) {
  const fps = o.fps ?? 4, w = 128, h = 72;
  const buf = await bytes(o.ffmpeg ?? "ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${fps},scale=${w}:${h}:flags=area,format=gray`, "-f", "rawvideo", "-"]);
  const size = w * h;
  const count = Math.floor(buf.length / size);
  const frame = (/** @type {number} */ i) => ({ gray: new Uint8Array(buf.buffer, buf.byteOffset + i * size, size), w, h });
  return tasteOfFrames(timeline?.video ?? [], count, frame, fps);
}

/**
 * The measuring itself, on frames already read (so a test needs no ffmpeg).
 * @param {any[]} video the shots @param {number} count frames @param {(i: number) => { gray: Uint8Array, w: number, h: number }} frame @param {number} fps
 */
export function tasteOfFrames(video, count, frame, fps) {
  /** @type {{ id: string, filled: number }[]} */
  const unfilled = [];
  /** @type {{ id: string, corner: string, share: number }[]} */
  const logos = [];
  /** @type {{ id: string, at: number }[]} */
  const cards = [];
  /** @type {{ id: string, hash: string | null, held: boolean }[]} */
  const hashes = [];
  let measured = 0;
  for (const v of video) {
    const a = Math.max(0, Math.ceil((Number(v.start) + 0.15) * fps)), b = Math.min(count - 1, Math.floor((Number(v.end) - 0.15) * fps));
    if (b < a) continue;
    const idx = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    const id = String(v.id);
    if (plainCard(v)) {
      const f = frame(idx[Math.floor(idx.length / 2)]);
      let dark = 0;
      for (let i = 0; i < f.gray.length; i += 1) if (f.gray[i] <= 30) dark += 1;
      if (textOnBlack(v, dark / f.gray.length)) cards.push({ id, at: Number(v.start) });
    }
    if (deliberate(v) || String(v.type) !== "clip") continue;
    measured += 1;
    const shares = idx.map((i) => { const f = frame(i); return voidShare(f.gray, f.w, f.h); }).sort((x, y) => x - y);
    const mid = shares[Math.floor(shares.length / 2)];
    if (1 - mid < MIN_FILLED) unfilled.push({ id, filled: Math.round((1 - mid) * 1000) / 1000 });
    const f = frame(idx[Math.floor(idx.length / 2)]);
    // A frame with almost no detail (a dark fade, a flat sky) hashes like every other one: it never counts as a repeat.
    let sum = 0, sq = 0;
    for (let i = 0; i < f.gray.length; i += 1) { sum += f.gray[i]; sq += f.gray[i] * f.gray[i]; }
    const mean = sum / f.gray.length, sd = Math.sqrt(Math.max(0, sq / f.gray.length - mean * mean));
    hashes.push({ id, hash: sd >= 14 ? dHash(f.gray, f.w, f.h) : null, held: Boolean(v.held || v.reused) });
    if (!v.still && idx.length >= 3) {
      const picks = [idx[0], idx[Math.floor(idx.length / 2)], idx[idx.length - 1]].map(frame);
      const logo = cornerLogo(picks);
      if (logo.found) logos.push({ id, corner: logo.corner, share: logo.share });
    }
  }
  return { unfilled, logos, cards, repeats: repeatedPictures(hashes), measured };
}

/** @param {string} bin @param {string[]} args @returns {Promise<void>} */
function runQuiet(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${bin} exited ${code}: ${err.slice(-200)}`))));
  });
}

/**
 * A still picture made ready to fill a W x H frame: its real content box is measured and cut out (no black, no white
 * border, no jagged mosaic edge), then framed by its shape (framePlan). `cover` and `blur-fill` come back as one plate for the
 * renderer's zoom-and-pan; the two pans come back as a plate and the crop filter that moves across it.
 * @param {{ src: string, dir: string, key: string, width: number, height: number, frames: number, index: number, ffmpeg?: string }} o
 * @returns {Promise<{ mode: "cover" | "pan-across" | "pan-down" | "blur-fill", plate: string, filter: string | null, content: { width: number, height: number }, trimmed: boolean }>}
 */
export async function prepareStill(o) {
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  const { existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const img = await grayOf(o.src, { ffmpeg });
  const box = contentBox(img.gray, img.w, img.h);
  const [pw, ph] = (await bytes("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", o.src])).toString().trim().split("x").map(Number);
  const even = (/** @type {number} */ n) => Math.max(2, Math.round(n / 2) * 2);
  const cw = even(box.w * pw), ch = even(box.h * ph), cx = Math.min(pw - cw, even(box.x * pw)), cy = Math.min(ph - ch, even(box.y * ph));
  const crop = box.trimmed ? `crop=${cw}:${ch}:${Math.max(0, cx)}:${Math.max(0, cy)},` : "";
  const content = { width: box.trimmed ? cw : pw, height: box.trimmed ? ch : ph };
  const plan = framePlan(content, o.width / o.height);
  const subject = subjectCentre(img.gray, img.w, img.h, box);
  const W = o.width, H = o.height, N = Math.max(1, o.frames);
  const base = join(o.dir, `${o.key}-${plan.mode}${box.trimmed ? "-t" : ""}.png`);
  const p = `min(1\\,n/${N})`;
  const smooth = `(3*${p}*${p}-2*${p}*${p}*${p})`;
  const forward = o.index % 2 === 0;
  if (plan.mode === "cover") {
    const W2 = W * 2, H2 = H * 2;
    if (!existsSync(base)) await runQuiet(ffmpeg, ["-v", "error", "-y", "-i", o.src, "-frames:v", "1", "-vf", `${crop}scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W2}:${H2}:x='max(0,min(iw-${W2},${subject.x.toFixed(3)}*iw-${W2 / 2}))':y='max(0,min(ih-${H2},${subject.y.toFixed(3)}*ih-${H2 / 2}))',setsar=1`, base]);
    return { mode: "cover", plate: base, filter: null, content, trimmed: box.trimmed };
  }
  if (plan.mode === "pan-across") {
    if (!existsSync(base)) await runQuiet(ffmpeg, ["-v", "error", "-y", "-i", o.src, "-frames:v", "1", "-vf", `${crop}scale='min(16000,trunc(iw*${H}/ih/2)*2)':${H}:flags=lanczos,setsar=1`, base]);
    return { mode: "pan-across", plate: base, filter: `crop=${W}:${H}:x='(iw-${W})*${forward ? smooth : `(1-${smooth})`}':y=0`, content, trimmed: box.trimmed };
  }
  if (plan.mode === "pan-down") {
    if (!existsSync(base)) await runQuiet(ffmpeg, ["-v", "error", "-y", "-i", o.src, "-frames:v", "1", "-vf", `${crop}scale=${W}:'min(16000,trunc(ih*${W}/iw/2)*2)':flags=lanczos,setsar=1`, base]);
    return { mode: "pan-down", plate: base, filter: `crop=${W}:${H}:x=0:y='(ih-${H})*${smooth}'`, content, trimmed: box.trimmed };
  }
  // Last resort: the content is too small to fill the frame sharply; it sits over a blurred copy of itself.
  const W2 = W * 2, H2 = H * 2;
  if (!existsSync(base)) await runQuiet(ffmpeg, ["-v", "error", "-y", "-i", o.src, "-frames:v", "1", "-filter_complex", `[0]${crop}split=2[bg][fg];[bg]scale=${W2}:${H2}:force_original_aspect_ratio=increase,crop=${W2}:${H2},boxblur=30:2,eq=brightness=-0.07:saturation=0.8[bgb];[fg]scale=${W2}:${H2}:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`, base]);
  return { mode: "blur-fill", plate: base, filter: null, content, trimmed: box.trimmed };
}
