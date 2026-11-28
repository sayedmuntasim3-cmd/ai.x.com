import assert from "node:assert/strict";
import { test } from "node:test";
import { MIN_FILLED, contentBox, cornerLogo, dHash, framePlan, hamming, logoSource, repeatedPictures, subjectCentre, tasteOfFrames, textOnBlack, voidShare } from "./picture-taste.mjs";

const W = 128, H = 72;
/** A busy picture (a deterministic texture) the size of the frame. */
function texture(seed = 1, w = W, h = H) {
  const g = new Uint8Array(w * h);
  let s = seed * 9301 + 49297;
  for (let i = 0; i < g.length; i += 1) { s = (s * 1103515245 + 12345) & 0x7fffffff; g[i] = 40 + (s % 160); }
  return g;
}
/** A picture inside black: the texture occupies the box, the rest is 0. */
function inBlack(box, seed = 1) {
  const g = new Uint8Array(W * H);
  const t = texture(seed);
  for (let y = box.y; y < box.y + box.h; y += 1) for (let x = box.x; x < box.x + box.w; x += 1) g[y * W + x] = t[y * W + x];
  return g;
}

test("a plain picture keeps the whole frame", () => {
  const b = contentBox(texture(), W, H);
  assert.equal(b.trimmed, false);
  assert.deepEqual([b.x, b.y, b.w, b.h], [0, 0, 1, 1]);
});

test("black bars are trimmed to the picture", () => {
  const b = contentBox(inBlack({ x: 0, y: 12, w: W, h: 48 }), W, H);
  assert.equal(b.trimmed, true);
  assert.ok(b.y >= 11 / H && b.y <= 14 / H, `top ${b.y}`);
  assert.ok(b.h <= 49 / H && b.h >= 44 / H, `height ${b.h}`);
  assert.ok(b.w > 0.97);
});

test("a stitched mosaic with jagged black edges is trimmed to a clean box", () => {
  const g = texture(2);
  // Black wedges eat the corners and a notch the right edge: the shape of a stitched panorama.
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const cut = x < 6 + 2 * (Math.floor(y / 4) % 3) || x > W - 5 - 2 * (Math.floor(y / 3) % 4) || y < 4 + 2 * (Math.floor(x / 6) % 2) || y > H - 4 - 2 * (Math.floor(x / 5) % 3);
    if (cut) g[y * W + x] = 0;
  }
  const b = contentBox(g, W, H);
  assert.equal(b.trimmed, true);
  // Inside the box there is no black left.
  const x0 = Math.round(b.x * W), y0 = Math.round(b.y * H), x1 = Math.round((b.x + b.w) * W), y1 = Math.round((b.y + b.h) * H);
  let black = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) if (g[y * W + x] <= 14) black += 1;
  assert.ok(black / ((x1 - x0) * (y1 - y0)) < 0.01, `black left in the box: ${black}`);
  assert.ok(b.w * b.h > 0.5, "the box keeps most of the picture");
});

test("a white print border is trimmed too, and a dark night picture is not", () => {
  const g = new Uint8Array(W * H).fill(250);
  const t = texture(3);
  for (let y = 8; y < H - 8; y += 1) for (let x = 10; x < W - 10; x += 1) g[y * W + x] = t[y * W + x];
  const b = contentBox(g, W, H);
  assert.ok(b.trimmed && b.x > 0.05 && b.y > 0.08);
  const night = new Uint8Array(W * H).fill(8);
  for (let y = 0; y < 20; y += 1) for (let x = 0; x < 20; x += 1) night[y * W + x] = 120;
  assert.equal(contentBox(night, W, H).trimmed, false, "a night picture is its own content");
});

test("the crop or pan is chosen by the picture's shape", () => {
  const f = 16 / 9;
  assert.equal(framePlan({ width: 1600, height: 1200 }, f).mode, "cover");
  assert.equal(framePlan({ width: 1920, height: 1080 }, f).mode, "cover");
  assert.equal(framePlan({ width: 6000, height: 900 }, f).mode, "pan-across");
  assert.equal(framePlan({ width: 900, height: 1600 }, f).mode, "pan-down");
  assert.equal(framePlan({ width: 200, height: 150 }, f).mode, "blur-fill");
});

test("the subject centre follows the detail, and stays near the middle", () => {
  const g = new Uint8Array(W * H).fill(100);
  const t = texture(4);
  for (let y = 20; y < 50; y += 1) for (let x = 90; x < 120; x += 1) g[y * W + x] = t[y * W + x];
  const c = subjectCentre(g, W, H, { x: 0, y: 0, w: 1, h: 1 });
  assert.ok(c.x > 0.6 && c.x < 0.85, `x ${c.x}`);
});

test("a hash finds the same picture, a regraded copy, and not another picture", () => {
  const a = texture(5), b = texture(6);
  const brighter = a.map((v) => Math.min(255, v + 15));
  assert.ok(hamming(dHash(a, W, H), dHash(brighter, W, H)) <= 3);
  assert.ok(hamming(dHash(a, W, H), dHash(b, W, H)) > 10);
});

test("a picture used twice in a film is a repeat; a held shot is not", () => {
  const h1 = dHash(texture(7), W, H), h2 = dHash(texture(8), W, H);
  const rows = [{ id: "a", hash: h1 }, { id: "b", hash: h2 }, { id: "c", hash: h1 }, { id: "d", hash: h1, held: true }, { id: "e", hash: null }];
  const r = repeatedPictures(rows);
  assert.deepEqual(r.map((x) => [x.a, x.b, x.consecutive]), [["a", "c", false]]);
  assert.equal(repeatedPictures([{ id: "a", hash: h1 }, { id: "b", hash: h1 }])[0].consecutive, true);
});

/** Frames of a moving picture with a static high-contrast logo in one corner. */
function clip(logoAt) {
  return [1, 2, 3, 4].map((seed) => {
    const g = texture(seed * 11);
    if (logoAt) {
      // "TN": a bright box with dark bars, 14 x 8 px, at the corner.
      const x0 = logoAt === "top-left" ? 6 : W - 22, y0 = 5;
      for (let y = 0; y < 8; y += 1) for (let x = 0; x < 14; x += 1) g[(y0 + y) * W + x0 + x] = (x % 4 < 2) ? 235 : 20;
    }
    return { gray: g, w: W, h: H };
  });
}

test("a static corner logo in a moving clip is found; a clip without one is not", () => {
  const found = cornerLogo(clip("top-left"));
  assert.equal(found.found, true);
  assert.equal(found.corner, "top-left");
  assert.equal(cornerLogo(clip(null)).found, false);
});

test("a still picture (nothing moves) never counts as a logo", () => {
  const one = clip("top-right")[0];
  assert.equal(cornerLogo([one, one, one]).found, false);
});

test("a broadcaster in the record's own metadata is a logo risk", () => {
  assert.match(logoSource({ title: "CNN Special Report: Apollo 11" }), /broadcaster/);
  assert.match(logoSource({ id: "KQED_20190720_030000_Apollo", title: "Moon landing anniversary" }), /TV News Archive/);
  assert.equal(logoSource({ title: "Apollo 11 Saturn V launch, NASA" }), "");
});

test("text on an empty black card is told from a designed card", () => {
  assert.equal(textOnBlack({ type: "card", text: "Now it came down to a single question." }, 0.97), true);
  assert.equal(textOnBlack({ type: "card", style: "paper" }, 0.97), false);
  assert.equal(textOnBlack({ type: "card", graphic: { template: "x" } }, 0.97), false);
  assert.equal(textOnBlack({ type: "card", text: "x" }, 0.4), false);
});

test("the measure of a master: small pictures in black, a repeat, text on black are found", () => {
  const full = texture(20), other = texture(21), black = new Uint8Array(W * H);
  const small = inBlack({ x: 30, y: 15, w: 60, h: 40 }, 22);
  // 4 fps; shots: 0-2 s full, 2-4 s small in black, 4-6 s full again (repeat of 0), 6-8 s a black card, 8-10 s another picture.
  const frames = [];
  for (let i = 0; i < 40; i += 1) frames.push(i < 8 ? full : i < 16 ? small : i < 24 ? full : i < 32 ? black : other);
  const video = [
    { id: "s1", type: "clip", still: true, start: 0, end: 2 }, { id: "s2", type: "clip", still: true, start: 2, end: 4 },
    { id: "s3", type: "clip", still: true, start: 4, end: 6 }, { id: "s4", type: "card", text: "Now it came down to a single question.", start: 6, end: 8 },
    { id: "s5", type: "clip", still: true, start: 8, end: 10 },
  ];
  const r = tasteOfFrames(video, frames.length, (i) => ({ gray: frames[i], w: W, h: H }), 4);
  assert.deepEqual(r.unfilled.map((x) => x.id), ["s2"]);
  assert.ok(r.unfilled[0].filled < MIN_FILLED);
  assert.deepEqual(r.repeats.map((x) => [x.a, x.b]), [["s1", "s3"]]);
  assert.deepEqual(r.cards.map((x) => x.id), ["s4"]);
  assert.equal(r.logos.length, 0);
});

test("voidShare is zero for a full picture", () => {
  assert.equal(voidShare(texture(30), W, H), 0);
});

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareStill } from "./picture-taste.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
/** A picture file: a noisy test pattern, optionally inside black. */
function picture(dir, name, size, inside) {
  const out = join(dir, name);
  const base = ["-v", "error", "-y", "-f", "lavfi", "-i", `testsrc2=s=${inside ? `${inside[0]}x${inside[1]}` : size}`, "-frames:v", "1"];
  const vf = inside ? ["-vf", `pad=${size.split("x")[0]}:${size.split("x")[1]}:${inside[2]}:${inside[3]}:black`] : [];
  assert.equal(spawnSync("ffmpeg", [...base, ...vf, out]).status, 0);
  return out;
}

test("prepareStill: a picture small inside black is cut out and fills the frame; shapes choose the move", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-taste-"));
  try {
    const o = { dir, width: 640, height: 360, frames: 30, index: 0 };
    const polaroid = await prepareStill({ ...o, src: picture(dir, "a.png", "1600x1200", [1100, 800, 250, 200]), key: "a" });
    assert.equal(polaroid.trimmed, true);
    assert.ok(polaroid.content.width < 1250 && polaroid.content.height < 900, `content ${polaroid.content.width}x${polaroid.content.height}`);
    const wide = await prepareStill({ ...o, src: picture(dir, "b.png", "3600x500"), key: "b" });
    assert.equal(wide.mode, "pan-across");
    assert.match(String(wide.filter), /^crop=640:360:x=/);
    const tall = await prepareStill({ ...o, src: picture(dir, "c.png", "900x1600"), key: "c" });
    assert.equal(tall.mode, "pan-down");
    const normal = await prepareStill({ ...o, src: picture(dir, "d.png", "1600x1200"), key: "d" });
    assert.equal(normal.mode, "cover");
    assert.equal(normal.filter, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

import { holdOverCards } from "./picture-taste.mjs";

test("a plain text card holds the nearest picture; a designed card is left alone", () => {
  const video = [
    { id: "a", type: "clip", url: "https://x/a.jpg", still: true },
    { id: "b", type: "card", text: "Now it came down to a single question." },
    { id: "c", type: "card", text: "12%", counter: true },
    { id: "d", type: "clip", url: "https://x/d.jpg", still: true },
  ];
  assert.deepEqual(holdOverCards(video), ["b"]);
  assert.equal(video[1].type, "clip");
  assert.equal(video[1].url, "https://x/a.jpg");
  assert.equal(video[1].held, true);
  assert.equal(video[2].type, "card");
});

test("dark noisy footage is not border; a flat letterbox bar is", () => {
  const dark = new Uint8Array(W * H);
  let s = 3;
  for (let i = 0; i < dark.length; i += 1) { s = (s * 1103515245 + 12345) & 0x7fffffff; dark[i] = 4 + (s % 14); }
  assert.ok(voidShare(dark, W, H) < 0.2, "noisy dark footage stays picture");
  const barred = texture(9);
  for (let y = 0; y < 10; y += 1) for (let x = 0; x < W; x += 1) barred[y * W + x] = 16;
  assert.ok(voidShare(barred, W, H) > 0.1, "flat video-black bars are border");
});
