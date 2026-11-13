#!/usr/bin/env python3
"""A second net for pictures under the Quran: faces and people in sampled frames.

  python local/media/detect.py <file-or-url> [...] [--frames 5] [--out detect.json]
         [--clip] [--query "olive grove"]

For a video, ffmpeg takes --frames frames spread over its length; a photo is
one frame. Each frame is searched with OpenCV's frontal and profile face
cascades and its HOG person detector (opencv-python-headless, Apache 2.0;
the cascades are Intel's, BSD licence, shipped with OpenCV). Prints one JSON
object: {"detector", "items": [{"source", "frames", "faces", "people", "flag"}]}.
With --clip, each frame is also looked at by an image-text model,
laion/CLIP-ViT-B-32-laion2B-s34B-b79K (MIT licence; its card asks that it be
used only with a fixed set of labels and tested on the task: here it only
refuses pictures, never approves one, never identifies a person, and its rates
are measured in .github/workflows/quran-media.yml). It answers three fixed
questions: is this a photograph or a painting, drawing or rendering; is the
picture upright (the same frame turned a quarter left or right reads as a
better photograph when it is stored sideways); and does it show what was
searched for (--query) rather than a room, people, text or a vehicle. A 64-bit
difference hash of each frame is returned, for near-duplicates.
This is a net, not a proof: the titles and tags were checked first, and its
own miss rate is measured on a labelled set (see .github/workflows/quran-media.yml).
A photo's URL is downloaded to a temporary folder first; a video is read by
ffmpeg from its URL, so only the sampled frames are fetched.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
import urllib.request


def frames_of(path, count, folder):
    """Sampled frames of a video or the photo itself, as image paths."""
    ua = ["-user_agent", "ZuponaStudio/1.0 (media check)"] if path.startswith(("http://", "https://")) else []
    probe = subprocess.run(["ffprobe", "-v", "error", *ua, "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, timeout=120)
    try:
        seconds = float(probe.stdout.strip())
    except ValueError:
        seconds = 0.0
    if seconds <= 0.5:
        return [path]
    out = []
    for i in range(count):
        at = seconds * (i + 0.5) / count
        frame = os.path.join(folder, f"f{i}.jpg")
        subprocess.run(["ffmpeg", "-v", "error", "-y", *ua, "-ss", f"{at:.2f}", "-i", path, "-frames:v", "1", "-vf", "scale=960:-2", frame], check=False, timeout=180)
        if os.path.exists(frame):
            out.append(frame)
    return out


def detect(images):
    import cv2

    front = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    side = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    faces = people = read = 0
    for path in images:
        img = cv2.imread(path) if os.path.exists(path) else None
        if img is None:
            continue
        read += 1
        h, w = img.shape[:2]
        if w > 960:
            img = cv2.resize(img, (960, int(h * 960 / w)))
        grey = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
        found = list(front.detectMultiScale(grey, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40)))
        found += list(side.detectMultiScale(grey, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40)))
        faces += len(found)
        rects, weights = hog.detectMultiScale(img, winStride=(8, 8), padding=(8, 8), scale=1.05)
        people += sum(1 for wgt in weights if float(wgt) > 0.8)
    return faces, people, read


CLIP_MODEL = "laion/CLIP-ViT-B-32-laion2B-s34B-b79K"
KINDS = ["a photograph", "a painting", "a drawing or an illustration", "a computer rendering or a video game"]
OTHER = ["the inside of a building or a room", "a city, a street or buildings", "people", "text, a document or a map", "a vehicle or a road", "an animal", "a man-made object"]
_clip = None


def clip():
    global _clip
    if _clip is None:
        from transformers import CLIPModel, CLIPProcessor

        _clip = (CLIPModel.from_pretrained(CLIP_MODEL), CLIPProcessor.from_pretrained(CLIP_MODEL))
    return _clip


def probs(image, labels):
    import torch

    model, proc = clip()
    with torch.no_grad():
        out = model(**proc(text=labels, images=image, return_tensors="pt", padding=True))
    return out.logits_per_image.softmax(dim=-1)[0].tolist()


def look(images, query):
    """Kind, orientation and relevance, averaged over the frames."""
    from PIL import Image

    kind = [0.0] * len(KINDS)
    turned = upright = rel = 0.0
    n = 0
    for path in images:
        try:
            img = Image.open(path).convert("RGB")
        except Exception:
            continue
        n += 1
        for i, p in enumerate(probs(img, KINDS)):
            kind[i] += p
        # Orientation: "a photograph" against the same frame turned a quarter each way.
        model, proc = clip()
        import torch

        with torch.no_grad():
            frames = [img, img.rotate(90, expand=True), img.rotate(-90, expand=True)]
            t = proc(text=["a photograph"], images=frames, return_tensors="pt", padding=True)
            sims = model(**t).logits_per_text[0].softmax(dim=-1).tolist()
        upright += sims[0]
        turned += max(sims[1], sims[2])
        if query:
            rel += probs(img, [f"a photograph of {query}"] + OTHER)[0]
    if not n:
        return None
    return {"photograph": round(kind[0] / n, 3), "painting": round(kind[1] / n, 3), "drawing": round(kind[2] / n, 3), "rendering": round(kind[3] / n, 3),
            "upright": round(upright / n, 3), "turned": round(turned / n, 3), "relevance": round(rel / n, 3) if query else None}


def bands(path):
    """Brightness and blueness of the top, bottom, left and right quarters of a frame (0-255)."""
    import cv2

    img = cv2.imread(path)
    if img is None:
        return None
    img = cv2.resize(img, (240, int(240 * img.shape[0] / img.shape[1])))
    h, w = img.shape[:2]
    lum = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(float)
    blue = img[:, :, 0].astype(float) - img[:, :, 2].astype(float)
    q = lambda a: {"top": a[: h // 4].mean(), "bottom": a[-h // 4 :].mean(), "left": a[:, : w // 4].mean(), "right": a[:, -w // 4 :].mean()}
    return {"lum": q(lum), "blue": q(blue)}


def sideways(paths):
    """A landscape stored on its side: its sky (the brightest, bluest band) is at the left or right, not at the top."""
    votes = 0
    n = 0
    for p in paths:
        b = bands(p)
        if not b:
            continue
        n += 1
        L, B = b["lum"], b["blue"]
        vertical = (L["top"] - L["bottom"]) + 0.5 * (B["top"] - B["bottom"])
        horizontal = abs((L["left"] - L["right"]) + 0.5 * (B["left"] - B["right"]))
        if horizontal > 30 and horizontal > 2.5 * max(vertical, 5):
            votes += 1
    return n > 0 and votes * 2 > n


def exposure(paths):
    """Mean brightness (0-255) and normalised luma entropy (0-1) of the frames: a dark, plain picture reads as an empty screen."""
    import cv2
    import numpy as np

    vals = []
    for p in paths:
        img = cv2.imread(p, cv2.IMREAD_GRAYSCALE)
        if img is None:
            continue
        img = cv2.resize(img, (320, max(1, int(320 * img.shape[0] / img.shape[1]))))
        hist = np.bincount(img.flatten(), minlength=256).astype(float)
        prob = hist[hist > 0] / hist.sum()
        vals.append((float(img.mean()), float(-(prob * np.log2(prob)).sum() / 8)))
    if not vals:
        return None
    return {"brightness": round(sum(v[0] for v in vals) / len(vals), 1), "entropy": round(sum(v[1] for v in vals) / len(vals), 3)}


def dhash(path):
    import cv2

    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    small = cv2.resize(img, (9, 8), interpolation=cv2.INTER_AREA)
    bits = (small[:, 1:] > small[:, :-1]).flatten()
    return "%016x" % int("".join("1" if b else "0" for b in bits), 2)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("inputs", nargs="+")
    p.add_argument("--frames", type=int, default=5)
    p.add_argument("--out", default=None)
    p.add_argument("--clip", action="store_true")
    p.add_argument("--query", default=None)
    a = p.parse_args()
    import cv2

    items = []
    for source in a.inputs:
        with tempfile.TemporaryDirectory() as folder:
            path = source
            video_url = source.startswith(("http://", "https://")) and source.lower().split("?")[0].endswith((".webm", ".mp4", ".ogv", ".mov", ".m4v"))
            # A video is read by ffmpeg straight from its address (only the sampled frames are fetched); a photo is downloaded.
            if source.startswith(("http://", "https://")) and not video_url:
                path = os.path.join(folder, "input")
                try:
                    req = urllib.request.Request(source, headers={"User-Agent": "ZuponaStudio/1.0 (media check)"})
                    with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                        f.write(r.read())
                except Exception as e:
                    sys.stderr.write(f"{source}: {e}\n")
            seen, hashes, turned, light = None, [], False, None
            try:
                images = frames_of(path, a.frames, folder)
                faces, people, read = detect(images)
                hashes = [h for h in (dhash(i) for i in images if os.path.exists(i)) if h]
                turned = sideways([i for i in images if os.path.exists(i)])
                light = exposure([i for i in images if os.path.exists(i)])
                if a.clip and read:
                    seen = look([i for i in images if os.path.exists(i)], a.query)
            except Exception as e:  # one unreadable item is reported, not fatal
                faces, people, read = 0, 0, 0
                sys.stderr.write(f"{source}: {e}\n")
            # Nothing that could not be looked at is passed as clean.
            items.append({"source": source, "frames": read, "faces": faces, "people": people, "flag": faces > 0 or people > 0 or read == 0, "look": seen, "dhash": hashes, "sideways": turned, "exposure": light})
    result = {"detector": f"OpenCV {cv2.__version__}: Haar frontal and profile face cascades, HOG person detector" + (f"; {CLIP_MODEL}" if a.clip else ""), "items": items}
    text = json.dumps(result, indent=1)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
    sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
