#!/usr/bin/env python3
"""A second net for pictures under the Quran: faces and people in sampled frames.

  python local/media/detect.py <file-or-url> [...] [--frames 5] [--out detect.json]

For a video, ffmpeg takes --frames frames spread over its length; a photo is
one frame. Each frame is searched with OpenCV's frontal and profile face
cascades and its HOG person detector (opencv-python-headless, Apache 2.0;
the cascades are Intel's, BSD licence, shipped with OpenCV). Prints one JSON
object: {"detector", "items": [{"source", "frames", "faces", "people", "flag"}]}.
This is a net, not a proof: the titles and tags were checked first, and its
own miss rate is measured on a labelled set (see .github/workflows/quran-media.yml).
A URL is downloaded to a temporary folder first.
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
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
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
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{at:.2f}", "-i", path, "-frames:v", "1", "-vf", "scale=960:-2", frame], check=False)
        if os.path.exists(frame):
            out.append(frame)
    return out


def detect(images):
    import cv2

    front = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    side = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
    hog = cv2.HOGDescriptor()
    hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
    faces = people = 0
    for path in images:
        img = cv2.imread(path)
        if img is None:
            continue
        h, w = img.shape[:2]
        if w > 960:
            img = cv2.resize(img, (960, int(h * 960 / w)))
        grey = cv2.equalizeHist(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
        found = list(front.detectMultiScale(grey, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40)))
        found += list(side.detectMultiScale(grey, scaleFactor=1.1, minNeighbors=6, minSize=(40, 40)))
        faces += len(found)
        rects, weights = hog.detectMultiScale(img, winStride=(8, 8), padding=(8, 8), scale=1.05)
        people += sum(1 for wgt in weights if float(wgt) > 0.8)
    return faces, people


def main():
    p = argparse.ArgumentParser()
    p.add_argument("inputs", nargs="+")
    p.add_argument("--frames", type=int, default=5)
    p.add_argument("--out", default=None)
    a = p.parse_args()
    import cv2

    items = []
    for source in a.inputs:
        with tempfile.TemporaryDirectory() as folder:
            path = source
            if source.startswith(("http://", "https://")):
                path = os.path.join(folder, "input")
                req = urllib.request.Request(source, headers={"User-Agent": "ZuponaStudio/1.0 (media check)"})
                with urllib.request.urlopen(req, timeout=120) as r, open(path, "wb") as f:
                    f.write(r.read())
            images = frames_of(path, a.frames, folder)
            faces, people = detect(images)
            items.append({"source": source, "frames": len(images), "faces": faces, "people": people, "flag": faces > 0 or people > 0})
    result = {"detector": f"OpenCV {cv2.__version__}: Haar frontal and profile face cascades, HOG person detector", "items": items}
    text = json.dumps(result, indent=1)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
    sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
