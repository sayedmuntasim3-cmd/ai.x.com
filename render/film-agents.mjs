/**
 * The picture and edit agents of the crew, as free code checks on the finished master (ffmpeg only, no paid API),
 * one result per role: { role, file, pass, findings: [{ shot, code, severity, reason, value }] }. The critic reads them
 * (render/critic.mjs), the release gate blocks on them, and a failing shot is re-picked by render/autofix.mjs.
 *
 *   cinematography-composition      tilted or jammed-in pictures (a polaroid on black, a subject hugging the edge)
 *   color-exposure                  burnt-out or hazy shots
 *   color-white-balance             a shot with a colour cast the rest of the film does not have
 *   color-artifact-check            neon over-saturation, posterised (banded) pictures
 *   quality-artifact-qc             a one-frame glitch inside a shot (frame difference)
 *   editing-continuity-match        a harsh grade jump at a cut; one picture held far too long
 *   editing-intro-outro             the opening held on black; a hard stop with no fade-out
 *   animation-diagram-builder       a designed card with nothing drawn on it, or text cut at the edge
 *   cinematography-visual-metaphor  a picture that belongs to another part of the story (render/film-agents.mjs, storyPlace)
 *
 * What is measured beyond this (full frame, logos, repeats, empty black cards) stays in render/picture-taste.mjs;
 * nothing there is loosened. All the numbers below are new checks, none replaces a threshold of the critic.
 */
import { spawn } from "node:child_process";
import { voidMask } from "./picture-taste.mjs";

export const AGENT_LIMITS = Object.freeze({
  /** A framed picture whose edge runs at least this steep (rise over run) is tilted (3 degrees). */
  tiltSlope: 0.05,
  /** The tilted edge must be a straight line: r squared of the fit. */
  tiltFit: 0.95,
  /** Share of pixels at or above 245 luma that makes a shot burnt out. */
  burntShare: 0.35,
  /** p95 - p5 luma under this is a flat, hazy picture (on a picture that is not near black). */
  hazySpread: 26,
  /** Distance (ln ratio of R/G and B/G) a shot's cast may sit from the film's own median cast. */
  castFromFilm: 0.35,
  /** ...and the distance at which it is a block, not a warning. */
  castBlock: 0.6,
  /** Share of strongly saturated pixels that makes neon, and distinct luma levels under which a textured picture is banded. */
  neonShare: 0.3,
  posterLevels: 22,
  /** A frame-to-frame jump this many times the shot's own median, and at least this large (mean abs luma), is a glitch. */
  glitchTimes: 8,
  glitchMin: 40,
  /** A cut where the average luma jumps by this much between two plain pictures is a harsh grade jump. */
  gradeLumaJump: 85,
  /** The same picture held this many seconds (one still, or the same url over several shots). */
  holdSeconds: 9,
  /** The opening must show picture: average luma over the first seconds. */
  openingLuma: 22,
  openingSeconds: 3,
  /** Share of a designed card's pixels that must be drawn (ink) and the most of its border band ink may take. */
  inkMin: 0.004,
  edgeInk: 0.18,
});

/** A shot the edit made on purpose to be a card or a graphic. @param {any} v */
export function isDesigned(v) {
  return Boolean(v.chart || v.map || v.counter || v.kinetic || v.chapterTitle || v.graphic || v.style === "paper" || v.moment) || String(v.type) === "card" || ["title", "kinetic-type", "quote", "document", "timeline"].includes(String(v.type));
}

/** @param {any} v */
const isBlack = (v) => String(v.type) === "black";

/** @param {Uint8Array} rgb @returns {Uint8Array} */
export function grayOfRgb(rgb) {
  const g = new Uint8Array(rgb.length / 3);
  for (let i = 0, j = 0; i < g.length; i += 1, j += 3) g[i] = (rgb[j] * 77 + rgb[j + 1] * 150 + rgb[j + 2] * 29) >> 8;
  return g;
}

/** @param {number[]} xs */
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r2 = (/** @type {number} */ n) => Math.round(n * 100) / 100;

/**
 * Straight-line fit of y on x. @param {number[]} xs @param {number[]} ys
 * @returns {{ slope: number, r2: number }}
 */
function fit(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (!sxx) return { slope: 0, r2: 0 };
  return { slope: sxy / sxx, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 };
}

/**
 * A picture framed on a flat ground at an angle (a tilted polaroid, a rotated card): the border's inner edge is a
 * straight line that is not vertical or horizontal. Measured on the left, right, top and bottom edges of the border.
 * @param {Uint8Array} gray @param {number} w @param {number} h
 * @returns {{ tilted: boolean, slope: number, side: string }}
 */
export function tiltOf(gray, w, h) {
  const mask = voidMask(gray, w, h);
  /** @type {{ side: string, pos: number[], run: number[] }[]} */
  const edges = [
    { side: "left", pos: [], run: [] }, { side: "right", pos: [], run: [] }, { side: "top", pos: [], run: [] }, { side: "bottom", pos: [], run: [] },
  ];
  for (let y = Math.floor(h * 0.2); y < Math.ceil(h * 0.8); y += 1) {
    let l = 0; while (l < w && mask[y * w + l]) l += 1;
    let r = 0; while (r < w && mask[y * w + w - 1 - r]) r += 1;
    if (l > 0 && l < w * 0.45) { edges[0].pos.push(y); edges[0].run.push(l); }
    if (r > 0 && r < w * 0.45) { edges[1].pos.push(y); edges[1].run.push(r); }
  }
  for (let x = Math.floor(w * 0.2); x < Math.ceil(w * 0.8); x += 1) {
    let t = 0; while (t < h && mask[t * w + x]) t += 1;
    let b = 0; while (b < h && mask[(h - 1 - b) * w + x]) b += 1;
    if (t > 0 && t < h * 0.45) { edges[2].pos.push(x); edges[2].run.push(t); }
    if (b > 0 && b < h * 0.45) { edges[3].pos.push(x); edges[3].run.push(b); }
  }
  for (const e of edges) {
    const span = e.side === "left" || e.side === "right" ? h * 0.6 : w * 0.6;
    if (e.pos.length < span * 0.7) continue;
    // A rotated picture's edge is a straight slanted line, or two of them meeting at a corner: test the whole edge and each half.
    const n = e.pos.length, halves = [[0, n], [0, n >> 1], [n >> 1, n]];
    for (const [a, b] of halves) {
      const pos = e.pos.slice(a, b), run = e.run.slice(a, b);
      if (pos.length < 8 || Math.max(...run) - Math.min(...run) < 3) continue;
      const f = fit(pos, run);
      if (Math.abs(f.slope) >= AGENT_LIMITS.tiltSlope && Math.abs(f.slope) <= 1.5 && f.r2 >= AGENT_LIMITS.tiltFit) return { tilted: true, slope: r2(f.slope), side: e.side };
    }
  }
  return { tilted: false, slope: 0, side: "" };
}

/** @param {Uint8Array} rgb @returns {{ mean: number, p5: number, p50: number, p95: number, burnt: number, levels: number, sd: number }} */
export function lumaStats(rgb) {
  const g = grayOfRgb(rgb);
  const hist = new Uint32Array(256);
  let sum = 0, sq = 0;
  for (let i = 0; i < g.length; i += 1) { hist[g[i]] += 1; sum += g[i]; sq += g[i] * g[i]; }
  const at = (/** @type {number} */ q) => { let c = 0; for (let v = 0; v < 256; v += 1) { c += hist[v]; if (c >= q * g.length) return v; } return 255; };
  let levels = 0, burnt = 0;
  for (let v = 0; v < 256; v += 1) { if (hist[v] > g.length * 0.002) levels += 1; if (v >= 245) burnt += hist[v]; }
  const mean = sum / g.length;
  return { mean, p5: at(0.05), p50: at(0.5), p95: at(0.95), burnt: burnt / g.length, levels, sd: Math.sqrt(Math.max(0, sq / g.length - mean * mean)) };
}

/**
 * The colour cast of a picture: ln(R/G) and ln(B/G) of the average of its mid-tone pixels (near-black, near-white and
 * grey-less pixels do not vote).
 * @param {Uint8Array} rgb @returns {{ rg: number, bg: number } | null}
 */
export function castOf(rgb) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const y = (rgb[i] * 77 + rgb[i + 1] * 150 + rgb[i + 2] * 29) >> 8;
    if (y < 30 || y > 225) continue;
    r += rgb[i]; g += rgb[i + 1]; b += rgb[i + 2]; n += 1;
  }
  if (n < rgb.length / 3 * 0.1 || !g) return null;
  return { rg: Math.log((r || 1) / g), bg: Math.log((b || 1) / g) };
}

/** Share of strongly saturated pixels (max - min channel above 200). @param {Uint8Array} rgb */
export function neonShare(rgb) {
  let n = 0;
  for (let i = 0; i < rgb.length; i += 3) { const mx = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]), mn = Math.min(rgb[i], rgb[i + 1], rgb[i + 2]); if (mx - mn > 200) n += 1; }
  return n / (rgb.length / 3);
}

/** Mean absolute luma difference between two frames. @param {Uint8Array} a @param {Uint8Array} b */
export function frameDiff(a, b) {
  const ga = grayOfRgb(a), gb = grayOfRgb(b);
  let s = 0;
  for (let i = 0; i < ga.length; i += 1) s += Math.abs(ga[i] - gb[i]);
  return s / ga.length;
}

/**
 * How much of a designed card is drawn: the share of pixels that differ from the card's own ground (its most common
 * luma) by 40 or more, and the share of the outer border band they take.
 * @param {Uint8Array} rgb @param {number} w @param {number} h
 */
export function inkOf(rgb, w, h) {
  const g = grayOfRgb(rgb);
  const bins = new Uint32Array(64);
  for (let i = 0; i < g.length; i += 1) bins[g[i] >> 2] += 1;
  let top = 0; for (let k = 1; k < 64; k += 1) if (bins[k] > bins[top]) top = k;
  const ground = top * 4 + 2;
  let ink = 0, band = 0, bandInk = 0;
  const bx = Math.max(1, Math.round(w * 0.03)), by = Math.max(1, Math.round(h * 0.03));
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const on = Math.abs(g[y * w + x] - ground) >= 40;
    const edge = x < bx || x >= w - bx || y < by || y >= h - by;
    if (on) ink += 1;
    if (edge) { band += 1; if (on) bandInk += 1; }
  }
  return { ink: ink / g.length, edge: band ? bandInk / band : 0 };
}

/**
 * A "frame(i)" is { rgb, w, h } read at `fps` frames a second. Every check below works on those frames only, so a test
 * needs no ffmpeg. Returns one result per role, and the film's own grade numbers.
 * @param {any[]} video the timeline's shots @param {number} count frames read @param {(i: number) => { rgb: Uint8Array, w: number, h: number }} frame @param {number} fps
 * @param {{ seconds?: number }} [o]
 */
export function agentsOfFrames(video, count, frame, fps, o = {}) {
  /** @typedef {{ shot: string, code: string, severity: "warn" | "block", reason: string, value?: number }} F */
  /** @type {Record<string, F[]>} */
  const found = {};
  const add = (/** @type {string} */ role, /** @type {F} */ f) => { (found[role] ??= []).push(f); };
  const roles = ["cinematography-composition", "color-exposure", "color-white-balance", "color-artifact-check", "quality-artifact-qc", "editing-continuity-match", "editing-intro-outro", "animation-diagram-builder"];
  for (const r of roles) found[r] = [];

  /** @type {{ v: any, id: string, idx: number[], first: number, last: number, mid: number }[]} */
  const shots = [];
  for (const v of video) {
    if (isBlack(v)) continue;
    const a = Math.max(0, Math.ceil((Number(v.start) + 0.15) * fps)), b = Math.min(count - 1, Math.floor((Number(v.end) - 0.15) * fps));
    if (b < a) continue;
    const idx = Array.from({ length: b - a + 1 }, (_, k) => a + k);
    shots.push({ v, id: String(v.id), idx, first: idx[0], last: idx[idx.length - 1], mid: idx[Math.floor(idx.length / 2)] });
  }

  // The film's own colour: the median cast over its picture shots, so only an outlier is called a cast.
  /** @type {Map<string, { rg: number, bg: number } | null>} */
  const casts = new Map();
  /** @type {Map<string, ReturnType<typeof lumaStats>>} */
  const lumas = new Map();
  for (const s of shots) {
    const f = frame(s.mid);
    lumas.set(s.id, lumaStats(f.rgb));
    casts.set(s.id, isDesigned(s.v) ? null : castOf(f.rgb));
  }
  const known = [...casts.values()].filter((c) => c !== null);
  const film = { rg: median(known.map((c) => c.rg)), bg: median(known.map((c) => c.bg)) };

  for (const s of shots) {
    const v = s.v;
    const designed = isDesigned(v);
    const f = frame(s.mid);
    const st = /** @type {ReturnType<typeof lumaStats>} */ (lumas.get(s.id));
    if (designed) {
      // animation-diagram-builder: a card must carry something drawn, inside the frame.
      const graphic = Boolean(v.chart || v.map || v.counter || v.kinetic || v.chapterTitle || v.graphic || v.moment) || ["kinetic-type", "timeline", "document", "title"].includes(String(v.type));
      if (graphic) {
        const k = inkOf(f.rgb, f.w, f.h);
        if (k.ink < AGENT_LIMITS.inkMin) add("animation-diagram-builder", { shot: s.id, code: "critic.diagram", severity: "block", reason: `nothing is drawn on the card (${r2(k.ink * 100)}% of it differs from its ground)`, value: k.ink });
        else if (k.ink < 0.25 && k.edge > AGENT_LIMITS.edgeInk) add("animation-diagram-builder", { shot: s.id, code: "critic.diagram", severity: "warn", reason: `drawing runs into the frame's edge (${r2(k.edge * 100)}% of the border band), text may be cut`, value: k.edge });
      }
      continue;
    }
    // --- cinematography-composition
    const gray = grayOfRgb(f.rgb);
    const tilt = tiltOf(gray, f.w, f.h);
    if (tilt.tilted) add("cinematography-composition", { shot: s.id, code: "critic.tilted", severity: "block", reason: `the picture sits tilted in its frame (${tilt.side} edge slopes ${tilt.slope}), like a polaroid dropped on black`, value: tilt.slope });
    // --- color-exposure
    if (st.burnt > AGENT_LIMITS.burntShare && st.mean > 140) add("color-exposure", { shot: s.id, code: "critic.exposure", severity: "block", reason: `burnt out: ${Math.round(st.burnt * 100)}% of the frame is pure white`, value: st.burnt });
    else if (st.p95 - st.p5 < AGENT_LIMITS.hazySpread && st.mean > 40) add("color-exposure", { shot: s.id, code: "critic.exposure", severity: "warn", reason: `hazy and flat: only ${st.p95 - st.p5} levels between its shadows and its highlights`, value: st.p95 - st.p5 });
    // --- color-white-balance (against the film's own grade)
    const c = casts.get(s.id);
    if (c && known.length >= 4) {
      const away = Math.hypot(c.rg - film.rg, c.bg - film.bg);
      if (away > AGENT_LIMITS.castFromFilm) add("color-white-balance", { shot: s.id, code: "critic.cast", severity: away > AGENT_LIMITS.castBlock ? "block" : "warn", reason: `its colour cast sits ${r2(away)} away from the film's own grade (${c.rg > film.rg ? "warmer/redder" : "cooler/greener"} than the rest)`, value: away });
    }
    // --- color-artifact-check
    const neon = neonShare(f.rgb);
    if (neon > AGENT_LIMITS.neonShare) add("color-artifact-check", { shot: s.id, code: "critic.artifact", severity: "block", reason: `neon over-saturation: ${Math.round(neon * 100)}% of the pixels are fully saturated`, value: neon });
    if (st.sd > 25 && st.levels < AGENT_LIMITS.posterLevels && !isBlack(v)) add("color-artifact-check", { shot: s.id, code: "critic.artifact", severity: "warn", reason: `posterised: only ${st.levels} brightness levels in a picture with real contrast`, value: st.levels });
    // --- quality-artifact-qc: a frame jump inside the shot
    if (s.idx.length >= 4) {
      const diffs = [];
      for (let k = 1; k < s.idx.length; k += 1) diffs.push({ k, d: frameDiff(frame(s.idx[k - 1]).rgb, frame(s.idx[k]).rgb) });
      const med = median(diffs.map((x) => x.d));
      for (const x of diffs) {
        // Sample frames next to a cut (the shot's first and last frame) can belong to the neighbour: they are not measured.
        if (x.k <= 1 || x.k >= s.idx.length - 1) continue;
        if (x.d >= AGENT_LIMITS.glitchMin && x.d >= med * AGENT_LIMITS.glitchTimes) { add("quality-artifact-qc", { shot: s.id, code: "critic.glitch", severity: "block", reason: `a one-frame jump of ${r2(x.d)} levels at ${r2((s.idx[x.k]) / fps)} s inside the shot (its own movement is ${r2(med)})`, value: x.d }); break; }
      }
    }
    // --- editing-continuity-match: one still or one picture held too long
    if (v.still && Number(v.end) - Number(v.start) > AGENT_LIMITS.holdSeconds) add("editing-continuity-match", { shot: s.id, code: "critic.hold", severity: "block", reason: `one still picture is held for ${r2(Number(v.end) - Number(v.start))} s (limit ${AGENT_LIMITS.holdSeconds} s)`, value: Number(v.end) - Number(v.start) });
  }

  // editing-continuity-match: the same url over consecutive shots, and the grade jump at each cut between two pictures.
  for (let i = 0; i < shots.length; i += 1) {
    if (shots[i].v.url && !shots[i].v.still) {
      let j = i, total = 0;
      while (j < shots.length && shots[j].v.url === shots[i].v.url) { total += Number(shots[j].v.end) - Number(shots[j].v.start); j += 1; }
      if (j - i >= 2 && total > AGENT_LIMITS.holdSeconds) add("editing-continuity-match", { shot: shots[j - 1].id, code: "critic.hold", severity: "block", reason: `the same picture runs through ${j - i} shots for ${r2(total)} s (limit ${AGENT_LIMITS.holdSeconds} s)`, value: total });
      i = Math.max(i, j - 1);
    }
  }
  for (let i = 1; i < shots.length; i += 1) {
    const a = shots[i - 1], b = shots[i];
    if (isDesigned(a.v) || isDesigned(b.v)) continue;
    const ya = lumaStats(frame(a.last).rgb).mean, yb = lumaStats(frame(b.first).rgb).mean;
    if (Math.abs(ya - yb) >= AGENT_LIMITS.gradeLumaJump) add("editing-continuity-match", { shot: b.id, code: "critic.gradeJump", severity: "warn", reason: `the cut from ${a.id} to ${b.id} jumps ${Math.round(Math.abs(ya - yb))} levels of brightness: no common grade`, value: Math.abs(ya - yb) });
  }

  // editing-intro-outro
  if (shots.length) {
    const open = shots.filter((s) => Number(s.v.start) < AGENT_LIMITS.openingSeconds);
    const ys = open.flatMap((s) => s.idx.filter((k) => k / fps < AGENT_LIMITS.openingSeconds)).map((k) => lumaStats(frame(k).rgb).mean);
    if (ys.length >= 2 && Math.max(...ys) < AGENT_LIMITS.openingLuma) add("editing-intro-outro", { shot: shots[0].id, code: "critic.openBlack", severity: "block", reason: `the first ${AGENT_LIMITS.openingSeconds} s are black (brightest sample ${Math.round(Math.max(...ys))} of 255): the film must open on a picture`, value: Math.max(...ys) });
    const last = shots[shots.length - 1];
    const yEnd = lumaStats(frame(last.last).rgb).mean, yMid = lumaStats(frame(last.mid).rgb).mean;
    if (yMid > 60 && yEnd > 0.8 * yMid && !isDesigned(last.v)) add("editing-intro-outro", { shot: last.id, code: "critic.closing", severity: "warn", reason: "the film ends on a bright picture with no fade-out", value: yEnd });
  }

  const results = roles.map((role) => ({ role, file: "render/film-agents.mjs", pass: !(found[role] ?? []).some((f) => f.severity === "block"), checked: shots.length, findings: found[role] ?? [] }));
  return { results, grade: { rg: r2(film.rg), bg: r2(film.bg), shots: shots.length }, measured: shots.length };
}

/** @param {string} bin @param {string[]} args @returns {Promise<Buffer>} */
function bytes(bin, args) {
  return new Promise((ok, fail) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    /** @type {Buffer[]} */
    const out = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", fail);
    p.on("close", (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(err.slice(-200) || `ffmpeg exited ${code}`))));
  });
}

/**
 * Read the finished master at 2 frames a second (96x54 colour) and run every picture agent.
 * @param {string} file @param {any} timeline @param {{ ffmpeg?: string, fps?: number }} [o]
 */
export async function measureAgents(file, timeline, o = {}) {
  const fps = o.fps ?? 2, w = 96, h = 54;
  const buf = await bytes(o.ffmpeg ?? "ffmpeg", ["-v", "error", "-i", file, "-an", "-vf", `fps=${fps},scale=${w}:${h}:flags=area,format=rgb24`, "-f", "rawvideo", "-"]);
  const size = w * h * 3;
  const count = Math.floor(buf.length / size);
  const frame = (/** @type {number} */ i) => ({ rgb: new Uint8Array(buf.buffer, buf.byteOffset + i * size, size), w, h });
  return agentsOfFrames(timeline?.video ?? [], count, frame, fps);
}

// ---------------------------------------------------------------------------------------------------------------
// cinematography-visual-metaphor: a picture that belongs to another part of the story

const STOP = new Set("the a an and or but of to in on at for with from by as is are was were be been it its this that these those he she they we you i his her their our your not no so if then than when while after before into over under up down out off about again very more most just also only still even once there here what which who whom how all any each some such can could would should will may might must do does did has have had been being".split(" "));
/** @param {string} t */
const stem = (t) => t.toLowerCase().replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w)).map((w) => w.replace(/(?:ing|ed|es|s)$/, ""));

/**
 * A picture of the Moon on the lines about the launch: the shot's subject words appear in no sentence near it, but are
 * said somewhere far away in the film (more than `far` seconds). That picture belongs to another part of the story.
 * @param {{ id: string, start: number, end: number, subject?: string, type?: string, rung?: string }[]} shots
 * @param {{ start: number, end: number, narration: string }[]} lines
 * @param {{ far?: number, near?: number }} [o]
 */
export function storyPlace(shots, lines, o = {}) {
  const far = o.far ?? 60, near = o.near ?? 20;
  /** @type {{ shot: string, code: string, severity: "warn" | "block", reason: string }[]} */
  const findings = [];
  const spoken = lines.map((l) => ({ start: Number(l.start), end: Number(l.end), words: new Set(stem(l.narration)) }));
  let checked = 0;
  for (const s of shots) {
    if (!s.subject || ["title", "card", "black", "kinetic-type", "quote", "timeline", "document"].includes(String(s.type)) || s.rung === "R1") continue;
    const mine = new Set(stem(String(s.subject)));
    if (!mine.size) continue;
    checked += 1;
    const here = spoken.filter((l) => l.end > s.start - near && l.start < s.end + near);
    const hereWords = new Set(here.flatMap((l) => [...l.words]));
    if ([...mine].some((w) => hereWords.has(w))) continue;
    // The subject's distinctive words, said only far from this shot.
    const away = [...mine].filter((w) => !hereWords.has(w) && spoken.some((l) => l.words.has(w) && (l.end < s.start - far || l.start > s.end + far)));
    const everywhere = [...mine].filter((w) => spoken.filter((l) => l.words.has(w)).length > Math.max(6, spoken.length * 0.2));
    if (away.length && !away.some((w) => everywhere.includes(w))) findings.push({ shot: String(s.id), code: "critic.pictureOutOfPlace", severity: "block", reason: `shows "${String(s.subject).slice(0, 60)}" but the lines around it say nothing of ${away.slice(0, 2).join(" or ")}; that is said much later or earlier in the film` });
  }
  return { role: "cinematography-visual-metaphor", file: "render/film-agents.mjs", pass: !findings.some((f) => f.severity === "block"), checked, findings };
}
