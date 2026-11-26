"""Zupona depth plate: one still -> a depth map and the displacement maps a camera move needs.

Depth Anything V2 small (Apache-2.0), ONNX, CPU only. Uses numpy, Pillow and onnxruntime; nothing else.
Writes into OUT_DIR:
  plate.png   the photo cropped to fill the frame, with overscan (so displaced edges are never empty)
  depth.png   smoothed depth, near = white; foreground edges grown so stretching lands in the background
  par.png     horizontal parallax map for an orbit (128 = still; brighter = moves more)
  radx.png / rady.png  radial maps for a dolly (near things grow faster than far ones)
  near.png    mask of the near layer (for rack focus)
and prints one JSON line: the depth spread, the edge-stretch check and the safe amount (pixels).

usage: python3 depth.py MODEL.onnx IN.jpg OUT_DIR WIDTH HEIGHT [OVERSCAN]
"""
import json
import sys

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter


def estimate(model, img):
    w, h = img.size
    s = 518 / max(w, h)
    iw, ih = max(14, round(w * s / 14) * 14), max(14, round(h * s / 14) * 14)
    x = np.asarray(img.convert("RGB").resize((iw, ih), Image.BICUBIC), dtype=np.float32) / 255.0
    x = (x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
    x = x.transpose(2, 0, 1)[None].astype(np.float32)
    opts = ort.SessionOptions()
    opts.intra_op_num_threads = 4
    sess = ort.InferenceSession(model, opts, providers=["CPUExecutionProvider"])
    d = sess.run(None, {sess.get_inputs()[0].name: x})[0]
    d = np.squeeze(d).astype(np.float32)  # relative inverse depth: bigger = nearer
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
    return Image.fromarray((d * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)


def fill(img, w, h):
    s = max(w / img.width, h / img.height)
    r = img.resize((max(w, round(img.width * s)), max(h, round(img.height * s))), Image.LANCZOS)
    left = (r.width - w) // 2
    top = max(0, min(r.height - h, round((r.height - h) * 0.4)))  # a little above centre: faces and horizons
    return r.crop((left, top, left + w, top + h))


def main():
    model, src, out, W, H = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5])
    over = float(sys.argv[6]) if len(sys.argv) > 6 else 1.12
    PW, PH = round(W * over / 2) * 2, round(H * over / 2) * 2
    img = Image.open(src).convert("RGB")
    plate = fill(img, PW, PH)
    plate.save(f"{out}/plate.png")
    raw = estimate(model, plate)
    # Grow the foreground a little and soften: the stretch at a depth edge then falls on the background.
    k = max(3, (PH // 90) | 1)
    dep = raw.filter(ImageFilter.MaxFilter(k)).filter(ImageFilter.GaussianBlur(PH / 160))
    dep.save(f"{out}/depth.png")
    D = np.asarray(dep, dtype=np.float32) / 255.0

    spread = float(np.percentile(D, 90) - np.percentile(D, 10))
    # Edge check: how much the displacement changes per pixel (1.0 = a pixel smeared over two).
    # The 99.9th percentile, not the single worst pixel: a lone pixel smeared is invisible, an edge is not.
    gx = np.percentile(np.abs(np.diff(D, axis=1)), 99.9)
    gy = np.percentile(np.abs(np.diff(D, axis=0)), 99.9)
    grad = float(max(gx, gy, 1e-6))
    # Safe amount (pixels at full depth difference): a stretch of at most 0.5 at the hard edges,
    # never more than the overscan margin, never more than 127 (an 8-bit map), and ~2.2 % of the width.
    margin = min(PW - W, PH - H) / 2
    amount = min(0.5 / grad, margin * 0.9, 127, W * 0.022)
    flat = spread < 0.18

    C = D - np.median(D)  # the subject plane stays put; nearer moves one way, farther the other
    par = np.clip(128 + C * 127, 0, 255)
    Image.fromarray(par.astype(np.uint8)).save(f"{out}/par.png")
    yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)
    nx, ny = (xx - PW / 2) / (PW / 2), (yy - PH / 2) / (PH / 2)
    Image.fromarray(np.clip(128 - nx * D * 127, 0, 255).astype(np.uint8)).save(f"{out}/radx.png")
    Image.fromarray(np.clip(128 - ny * D * 127, 0, 255).astype(np.uint8)).save(f"{out}/rady.png")
    near = np.clip((D - np.percentile(D, 55)) / max(1e-6, np.percentile(D, 85) - np.percentile(D, 55)), 0, 1)
    Image.fromarray((near * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(PH / 200)).save(f"{out}/near.png")
    print(json.dumps({"plate": [PW, PH], "spread": round(spread, 3), "edge": round(grad, 4), "amount": round(float(amount), 1), "flat": bool(flat)}))


if __name__ == "__main__":
    main()
