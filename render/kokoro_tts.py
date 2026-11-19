#!/usr/bin/env python3
"""The Zupona narrator's voice worker: Kokoro-82M v1.0 (Apache-2.0) through kokoro-onnx, on a CPU.

Driven by render/narrate.mjs. The model loads once; then one JSON job per stdin line:
  {"out": "SC0001.wav", "voice": [["am_michael", 0.6], ...], "speed": 0.9, "lang": "en-us",
   "sentences": [{"text": "said text", "pauseAfter": 0.55}, ...]}
Each sentence is spoken on its own, its leading and trailing silence trimmed to 40 ms, and the
pause the delivery preset asks for is put after it, so the rhythm is the preset's, not chance.
Writes a 24 kHz mono 16-bit WAV and prints one JSON line per job:
  {"out", "seconds", "peak", "sentences": [{"start", "end"}]}   or   {"out", "error"}

Setup (once): pip install kokoro-onnx soundfile; the model files from
github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 (checked by narrate.mjs).
This worker never speaks Arabic or Quran text: narrate.mjs refuses those lines before they get here.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

RATE = 24000
EDGE = int(0.04 * RATE)  # silence kept at each edge of a sentence
FLOOR = 10 ** (-50 / 20)  # -50 dBFS: quieter than this counts as silence
GAIN = 0.75  # one fixed gain for every take, so scenes keep the same loudness (blends can peak above 1.0)
CEILING = 0.97  # a take that still peaks above this is turned down to it, never clipped


def trim(a):
    loud = np.flatnonzero(np.abs(a) > FLOOR)
    if loud.size == 0:
        return a[:0]
    return a[max(0, loud[0] - EDGE): min(a.size, loud[-1] + EDGE)]


def main():
    model, voices = sys.argv[1], sys.argv[2]
    kokoro = Kokoro(model, voices)
    styles = {}

    def voice(parts):
        key = json.dumps(parts)
        if key not in styles:
            total = sum(w for _, w in parts)
            styles[key] = sum((w / total) * kokoro.get_voice_style(v) for v, w in parts)
        return styles[key]

    for raw in sys.stdin:
        if not raw.strip():
            continue
        job = json.loads(raw)
        try:
            style = voice(job["voice"])
            pieces, marks, at = [], [], 0
            for s in job["sentences"]:
                audio, rate = kokoro.create(s["text"], voice=style, speed=float(job["speed"]), lang=job.get("lang", "en-us"))
                if rate != RATE:
                    raise ValueError(f"unexpected sample rate {rate}")
                audio = trim(np.asarray(audio, dtype=np.float32))
                if audio.size == 0:
                    raise ValueError(f"no sound for: {s['text'][:60]}")
                marks.append({"start": round(at / RATE, 3), "end": round((at + audio.size) / RATE, 3)})
                gap = np.zeros(int(round(float(s.get("pauseAfter", 0)) * RATE)), dtype=np.float32)
                pieces += [audio, gap]
                at += audio.size + gap.size
            whole = np.concatenate(pieces) * GAIN
            top = float(np.max(np.abs(whole)))
            if top > CEILING:
                whole *= CEILING / top
            sf.write(job["out"] + ".part.wav", whole, RATE, subtype="PCM_16")
            os.replace(job["out"] + ".part.wav", job["out"])
            print(json.dumps({"out": job["out"], "seconds": round(whole.size / RATE, 3), "peak": round(float(np.max(np.abs(whole))), 4), "sentences": marks}), flush=True)
        except Exception as error:  # one bad line never stops the others
            print(json.dumps({"out": job.get("out"), "error": str(error)[:300]}), flush=True)


if __name__ == "__main__":
    main()
