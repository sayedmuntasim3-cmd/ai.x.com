// Zupona depth camera: a still photo becomes a 2.5D shot. Depth Anything V2 small (Apache-2.0, ONNX, CPU)
// estimates depth once (depth.py); ffmpeg then moves a virtual camera through it: a dolly (near things grow
// faster than far ones), an orbit (near and far slide past each other) or a rack focus (the sharp plane travels
// from near to far). This replaces the blurred-copy frame; when the picture is flat (a document, a painting
// seen straight on) or the depth step cannot run, depthPlan returns null and the old still move stays.
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, renameSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODEL_URL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model_quantized.onnx";
export const OVERSCAN = 1.12;

/** @param {string} bin @param {string[]} args @returns {Promise<string>} */
function run(bin, args) {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (b) => { out += b; });
    p.stderr.on("data", (b) => { err += b; });
    p.on("error", rej);
    p.on("close", (c) => (c === 0 ? res(out) : rej(new Error(`${bin} failed (${c}): ${err.slice(-400)}`))));
  });
}

/** The model file, fetched once into the user's cache (27 MB, free). */
export async function ensureModel(o = {}) {
  const file = /** @type {any} */ (o).model ?? process.env.ZUPONA_DEPTH_MODEL ?? join(homedir(), ".cache", "zupona", "depth", "depth-anything-v2-small-q.onnx");
  if (existsSync(file)) return file;
  mkdirSync(dirname(file), { recursive: true });
  const r = await fetch(MODEL_URL);
  if (!r.ok || !r.body) throw new Error(`depth model download failed: ${r.status}`);
  const tmp = `${file}.part`;
  const w = createWriteStream(tmp);
  for await (const chunk of /** @type {any} */ (r.body)) w.write(chunk);
  await new Promise((res) => w.end(res));
  renameSync(tmp, file);
  return file;
}

/**
 * Depth maps for one still (cached in dir). Null when the photo is flat or the step fails.
 * @param {{ src: string, dir: string, width: number, height: number, python?: string, model?: string }} o
 * @returns {Promise<null | { dir: string, plate: [number, number], spread: number, edge: number, amount: number, flat: boolean }>}
 */
export async function depthMaps(o) {
  mkdirSync(o.dir, { recursive: true });
  const meta = join(o.dir, "depth.json");
  if (!existsSync(meta)) {
    const model = await ensureModel(o);
    const out = await run(o.python ?? "python3", ["-I", join(here, "depth.py"), model, o.src, o.dir, String(o.width), String(o.height), String(OVERSCAN)]);
    writeFileSync(meta, out.trim().split("\n").pop() ?? "{}");
  }
  const m = JSON.parse(readFileSync(meta, "utf8"));
  return m.flat ? null : { dir: o.dir, ...m };
}

/** @typedef {"dolly" | "orbit" | "rack"} DepthMove */

/**
 * The camera move for a shot, from the Edit Director's still move (engine/src/motion.mjs) when there is one.
 * @param {{ kind?: string, dir?: number, amount?: number } | undefined} move @param {number} i shot index
 * @returns {{ kind: DepthMove, dir: 1 | -1, strength: number }}
 */
export function depthMoveFor(move, i) {
  const dir = /** @type {1 | -1} */ ((move?.dir ?? (i % 2 ? -1 : 1)) < 0 ? -1 : 1);
  const strength = move ? (move.kind === "hold" ? 0.35 : Math.min(1.4, Math.max(0.5, (move.amount ?? 0.09) / 0.09))) : 1;
  if (move?.kind === "pan" || move?.kind === "drift") return { kind: "orbit", dir, strength };
  if (move?.kind === "hold") return { kind: "rack", dir, strength };
  return { kind: [/** @type {const} */ ("dolly"), "orbit", "rack"][i % 3], dir, strength };
}

/**
 * The ffmpeg inputs and filter graph that draw the move. Pure: tested without ffmpeg.
 * Edge rule: the largest displacement plus the counter-pan never reaches past the overscan margin,
 * so no pixel is ever taken from outside the photo (no smeared border).
 * @param {{ dir: string, plate: [number, number], amount: number }} maps
 * @param {{ kind: DepthMove, dir: 1 | -1, strength: number }} mv
 * @param {{ width: number, height: number, fps: number, frames: number }} f
 */
export function depthGraph(maps, mv, f) {
  const [PW, PH] = maps.plate;
  const W = f.width, H = f.height;
  const T = Math.max(1, f.frames - 1) / f.fps;
  const margin = Math.min(PW - W, PH - H) / 2;
  const S = `(min(1,t/${T.toFixed(3)})*min(1,t/${T.toFixed(3)})*(3-2*min(1,t/${T.toFixed(3)})))`; // smoothstep: the in-out ease
  const amp = Math.min(maps.amount * mv.strength, margin * 0.6);
  const pan = Math.min(margin - amp - 2, margin * 0.35) * (mv.kind === "orbit" ? 1 : 0);
  const k = (amp / 127).toFixed(4);
  const loop = (/** @type {string} */ file) => ["-loop", "1", "-framerate", String(f.fps), "-i", join(maps.dir, file)];
  const grey = ["-f", "lavfi", "-i", `color=c=0x808080:s=${PW}x${PH}:r=${f.fps},format=gray`];
  const crop = (/** @type {string} */ x) => `crop=${W}:${H}:'${x}':'(ih-oh)/2'`;
  /** @type {string[]} */ let input;
  /** @type {string} */ let graph;
  if (mv.kind === "orbit") {
    input = [...loop("plate.png"), ...loop("par.png"), ...grey];
    graph = `[1]format=gray,eq=contrast='${mv.dir}*${k}*(2*${S}-1)':eval=frame[xm];[2]format=gray[ym];[0][xm][ym]displace=edge=smear,${crop(`(iw-ow)/2-${mv.dir}*${pan.toFixed(1)}*(2*${S}-1)`)}`;
  } else if (mv.kind === "dolly") {
    // Push in: radial parallax grows with the ease while the whole frame scales up a little.
    const push = 0.05 * mv.strength;
    input = [...loop("plate.png"), ...loop("radx.png"), ...loop("rady.png")];
    graph = `[1]format=gray,eq=contrast='${mv.dir}*${k}*${S}':eval=frame[xm];[2]format=gray,eq=contrast='${mv.dir}*${k}*${S}':eval=frame[ym];[0][xm][ym]displace=edge=smear,scale=w='trunc(${PW}*(1+${push.toFixed(3)}*(${mv.dir > 0 ? S : `1-${S}`}))/2)*2':h=-2:eval=frame:flags=bicubic,${crop("(iw-ow)/2")}`;
  } else {
    // Rack focus: near sharp / far soft, then the other way round, crossfaded through the middle of the shot,
    // over a slow push so the frame never sits still.
    const sigma = Math.max(2, Math.round(H / 140));
    input = [...loop("plate.png"), ...loop("near.png")];
    // One merge: blurred + (sharp - blurred) * m, with m = 0.5 + (near - 0.5) * (1 - 2S) (the near mask through a
    // time-varying contrast): near sharp at the start, far sharp at the end (dir -1: the other way).
    graph = `[0]format=gbrp,split=2[s][b0];[b0]gblur=sigma=${sigma}[bl];[1]format=gray,eq=contrast='${mv.dir}*(1-2*${S})':eval=frame,format=gbrp[m];` +
      `[bl][s][m]maskedmerge,scale=w='trunc(${PW}*(1+${(0.035 * mv.strength).toFixed(3)}*${S})/2)*2':h=-2:eval=frame:flags=bicubic,${crop("(iw-ow)/2")}`;
  }
  return { input, graph: `${graph},setsar=1`, amp, pan, margin, safe: amp + pan < margin };
}

/**
 * Render one depth shot to an MP4 (no grade: the caller adds the film's look).
 * @param {{ maps: { dir: string, plate: [number, number], amount: number }, move: { kind: DepthMove, dir: 1 | -1, strength: number },
 *   width: number, height: number, fps: number, frames: number, out: string, ffmpeg?: string, look?: string }} o
 */
export async function renderDepthShot(o) {
  const g = depthGraph(o.maps, o.move, o);
  if (!g.safe) throw new Error("depth move would reach past the photo's edge");
  await run(o.ffmpeg ?? "ffmpeg", ["-v", "error", "-y", ...g.input, "-filter_complex", `${g.graph}${o.look ? `,${o.look}` : ""},format=yuv420p[v]`, "-map", "[v]", "-frames:v", String(o.frames), "-r", String(o.fps), "-c:v", "libx264", "-preset", "medium", "-crf", "17", o.out]);
  return { out: o.out, ...g };
}

// CLI: node render/depth/depth.mjs photo.jpg out.mp4 [dolly|orbit|rack] [seconds]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , src, out, kind = "dolly", secs = "5"] = process.argv;
  const fps = 30, frames = Math.round(Number(secs) * fps);
  const maps = await depthMaps({ src, dir: `${out}.depth`, width: 1920, height: 1080 });
  if (!maps) { console.log(JSON.stringify({ flat: true })); process.exit(0); }
  const r = await renderDepthShot({ maps, move: { kind: /** @type {DepthMove} */ (kind), dir: 1, strength: 1 }, width: 1920, height: 1080, fps, frames, out });
  console.log(JSON.stringify({ ...maps, amp: r.amp, pan: r.pan, margin: r.margin }));
}
