"""The eyes of the asset engine: OpenCLIP on the CPU, cached between runs.

  python rank.py score <request.json> <answer.json>
      request: {"texts": [str], "images": [{"id": str, "url": str}], "cache": dir}
      answer:  {"model", "seconds", "images": {id: {"ok", "phash"}}, "sim": {id: [cos per text]}}
  python rank.py sheet <sheet.json> <out.jpg>
      sheet: {"title": str, "cache": dir, "tiles": [{"url", "label", "mark"}]}  (a contact sheet for a person)

Only the seeing happens here; every rule (what is on topic, what is off, what is chosen) lives in
rerank.mjs, where it is tested. Thumbnails and their embeddings are cached under the cache folder
(keyed by the URL and the model), so a second run of the same film downloads and computes nothing.
"""
import hashlib
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor

# The same LAION model local/media/detect.py uses (one download in ~/.cache/huggingface serves both).
MODEL = "hf-hub:laion/CLIP-ViT-B-32-laion2B-s34B-b79K"
UA = "ZuponaStudio/1.0 (documentary asset ranking; https://github.com/sayedmuntasim3-cmd/ai.x.com)"


def key(url):
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def fetch(url, folder):
    path = os.path.join(folder, key(url) + ".img")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    # Three tries: a cold run asks a CDN for ~2000 thumbnails and some answer late (film 993f09ea: 1536 of 2098 at one try).
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read(8_000_000)
            with open(path + ".part", "wb") as f:
                f.write(data)
            os.replace(path + ".part", path)
            return path
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404, 410):
                return None
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    return None


def phash(img):
    """64-bit DCT perceptual hash (same idea as imagehash.phash), as 16 hex digits."""
    import numpy as np
    small = np.asarray(img.convert("L").resize((32, 32)), dtype=np.float32)
    n = 32
    k = np.arange(n)
    dct = np.cos(np.pi * (2 * k[None, :] + 1) * k[:, None] / (2 * n))
    low = (dct @ small @ dct.T)[:8, :8]
    bits = (low > np.median(low)).flatten()
    return "%016x" % int("".join("1" if b else "0" for b in bits), 2)


def colour(img):
    """The picture's average hue (degrees), chroma and lightness: the cut's colour continuity."""
    small = img.convert("RGB").resize((24, 24))
    px = list(small.getdata())
    x = y = chroma = light = 0.0
    for r, g, b in px:
        r, g, b = r / 255.0, g / 255.0, b / 255.0
        mx, mn = max(r, g, b), min(r, g, b)
        light += (mx + mn) / 2
        ch = mx - mn
        chroma += ch
        if ch == 0:
            continue
        if mx == r:
            h = ((g - b) / ch) % 6
        elif mx == g:
            h = (b - r) / ch + 2
        else:
            h = (r - g) / ch + 4
        rad = math.radians(h * 60)
        x += ch * math.cos(rad)
        y += ch * math.sin(rad)
    n = float(len(px))
    hue = math.degrees(math.atan2(y, x)) % 360 if abs(x) + abs(y) > 1e-6 else 0.0
    return [round(hue, 1), round(chroma / n, 3), round(light / n, 3)]


def score(req_path, out_path):
    import numpy as np
    import open_clip
    import torch
    from PIL import Image

    t0 = time.time()
    req = json.load(open(req_path))
    cache = req.get("cache") or os.path.expanduser("~/.cache/zupona/asset-rank")
    thumbs = os.path.join(cache, "thumbs")
    embs = os.path.join(cache, "emb")
    os.makedirs(thumbs, exist_ok=True)
    os.makedirs(embs, exist_ok=True)
    torch.set_num_threads(max(1, os.cpu_count() or 1))
    model, _, preprocess = open_clip.create_model_and_transforms(MODEL)
    tokenizer = open_clip.get_tokenizer(MODEL)
    model.eval()
    tag = key(MODEL)[:8]

    with torch.no_grad():
        t = model.encode_text(tokenizer(req["texts"]))
        t = (t / t.norm(dim=-1, keepdim=True)).numpy()

    images = req["images"]
    urls = sorted({im["url"] for im in images if im.get("url")})
    with ThreadPoolExecutor(max_workers=12) as pool:
        files = dict(zip(urls, pool.map(lambda u: fetch(u, thumbs), urls)))

    vec = {}
    info = {}
    todo = []
    for u in urls:
        f = files.get(u)
        if not f:
            continue
        cached = os.path.join(embs, key(u) + "-" + tag + ".npy")
        meta = cached[:-4] + ".json"
        if os.path.exists(cached) and os.path.exists(meta):
            vec[u] = np.load(cached)
            info[u] = json.load(open(meta))
            continue
        try:
            img = Image.open(f).convert("RGB")
        except Exception:
            continue
        info[u] = {"phash": phash(img), "w": img.width, "h": img.height, "col": colour(img)}
        todo.append((u, img, cached, meta))
    for i in range(0, len(todo), 64):
        batch = todo[i:i + 64]
        with torch.no_grad():
            e = model.encode_image(torch.stack([preprocess(b[1]) for b in batch]))
            e = (e / e.norm(dim=-1, keepdim=True)).numpy()
        for (u, _, cached, meta), v in zip(batch, e):
            vec[u] = v
            np.save(cached, v)
            json.dump(info[u], open(meta, "w"))

    out = {"model": MODEL, "texts": len(req["texts"]), "images": {}, "sim": {}, "computed": len(todo), "cached": len(vec) - len(todo), "unseen": len(urls) - len(vec)}
    for im in images:
        u = im.get("url")
        if u in vec:
            out["images"][im["id"]] = {"ok": True, "phash": info[u]["phash"], "col": info[u].get("col")}
            out["sim"][im["id"]] = [round(float(x), 4) for x in (t @ vec[u])]
        else:
            out["images"][im["id"]] = {"ok": False}
    out["seconds"] = round(time.time() - t0, 1)
    json.dump(out, open(out_path, "w"))


def sheet(req_path, out_path):
    from PIL import Image, ImageDraw, ImageFont

    req = json.load(open(req_path))
    cache = os.path.join(req.get("cache") or os.path.expanduser("~/.cache/zupona/asset-rank"), "thumbs")
    os.makedirs(cache, exist_ok=True)
    tiles = req["tiles"]
    tw, th, cols, pad, label = 320, 180, 6, 6, 34
    rows = (len(tiles) + cols - 1) // cols
    W = cols * (tw + pad) + pad
    H = 44 + rows * (th + label + pad) + pad
    canvas = Image.new("RGB", (W, H), (18, 18, 18))
    d = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 13)
        big = ImageFont.truetype("DejaVuSans-Bold.ttf", 20)
    except Exception:
        font = big = ImageFont.load_default()
    d.text((pad, 10), req.get("title", ""), fill=(240, 240, 240), font=big)
    with ThreadPoolExecutor(max_workers=16) as pool:
        files = list(pool.map(lambda x: fetch(x["url"], cache) if x.get("url") else None, tiles))
    for i, (tile, f) in enumerate(zip(tiles, files)):
        x = pad + (i % cols) * (tw + pad)
        y = 44 + (i // cols) * (th + label + pad)
        try:
            img = Image.open(f).convert("RGB")
            s = max(tw / img.width, th / img.height)
            img = img.resize((max(tw, int(img.width * s)), max(th, int(img.height * s))))
            l, t = (img.width - tw) // 2, (img.height - th) // 2
            canvas.paste(img.crop((l, t, l + tw, t + th)), (x, y))
        except Exception:
            d.rectangle((x, y, x + tw, y + th), fill=(60, 20, 20))
            d.text((x + 8, y + 8), "no picture", fill=(255, 200, 200), font=font)
        if tile.get("mark"):
            d.rectangle((x, y, x + tw - 1, y + th - 1), outline=(230, 40, 40), width=5)
        for n, line in enumerate(str(tile.get("label", "")).split("\n")[:2]):
            d.text((x + 2, y + th + 2 + n * 16), line[:46], fill=(220, 220, 220), font=font)
    canvas.save(out_path, quality=82)


if __name__ == "__main__":
    if len(sys.argv) != 4 or sys.argv[1] not in ("score", "sheet"):
        print(__doc__)
        sys.exit(2)
    (score if sys.argv[1] == "score" else sheet)(sys.argv[2], sys.argv[3])
