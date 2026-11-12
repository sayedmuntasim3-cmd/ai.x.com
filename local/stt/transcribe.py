#!/usr/bin/env python3
"""Speech to text with a time for every word, for the Zupona voice system.

  python local/stt/transcribe.py <audio.wav> [--engine faster-whisper|pocketsphinx]
         [--model small.en] [--language en] [--out words.json]

Prints (or writes) one JSON object:
  {"engine", "model", "modelVersion", "language", "durationSeconds",
   "words": [{"text", "start", "end", "confidence"}]}

faster-whisper (pip install faster-whisper) is the real engine: it downloads
the model from Hugging Face on first use, then works offline. pocketsphinx
(pip install pocketsphinx) is a weak fallback whose English model ships in the
pip package, for machines that cannot download models. Input: any WAV; a
16 kHz mono 16-bit WAV (what local/voice-film.mjs makes) is read directly.
"""
import argparse
import json
import sys
import wave
from importlib import metadata


def version(pkg):
    try:
        return metadata.version(pkg)
    except metadata.PackageNotFoundError:
        return None


def read_16k(path):
    """The 16 kHz mono 16-bit WAV as float samples, read without PyAV (whose
    versions break faster-whisper's own decoder)."""
    import numpy as np

    with wave.open(path, "rb") as f:
        if f.getframerate() != 16000 or f.getnchannels() != 1 or f.getsampwidth() != 2:
            raise SystemExit("A 16 kHz mono 16-bit WAV is needed (voice-16k.wav from local/voice-film.mjs).")
        return np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def whisper(path, model_name, language):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device="auto", compute_type="int8")
    segments, info = model.transcribe(read_16k(path), language=language, word_timestamps=True, beam_size=5, vad_filter=False)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "confidence": round(w.probability, 3)})
    return {
        "engine": "faster-whisper",
        "model": model_name,
        "modelVersion": f"faster-whisper {version('faster-whisper')}, ctranslate2 {version('ctranslate2')}",
        "language": info.language,
        "languageProbability": round(info.language_probability, 3),
        "durationSeconds": round(info.duration, 3),
        "words": [w for w in words if w["text"]],
    }


def sphinx(path, language):
    from pocketsphinx import Decoder, Segmenter

    if language not in (None, "en"):
        raise SystemExit("pocketsphinx here has an English model only.")
    with wave.open(path, "rb") as f:
        if f.getframerate() != 16000 or f.getnchannels() != 1 or f.getsampwidth() != 2:
            raise SystemExit("pocketsphinx needs a 16 kHz mono 16-bit WAV (voice-16k.wav from local/voice-film.mjs).")
        pcm = f.readframes(f.getnframes())
        seconds = f.getnframes() / 16000
    decoder = Decoder(samprate=16000)
    frame = 1 / 100  # pocketsphinx counts 100 frames per second
    words = []
    import io

    for speech in Segmenter(sample_rate=16000).segment(io.BytesIO(pcm)):
        decoder.start_utt()
        decoder.process_raw(speech.pcm, full_utt=True)
        decoder.end_utt()
        for s in decoder.seg():
            if s.word.startswith(("<", "[")) or s.word in ("(NULL)",):
                continue
            text = s.word.split("(")[0]  # "read(2)" is the second pronunciation of "read"
            # pocketsphinx gives no usable per-word confidence here (posteriors are not computed), so none is claimed.
            words.append({"text": text, "start": round(speech.start_time + s.start_frame * frame, 3), "end": round(speech.start_time + (s.end_frame + 1) * frame, 3), "confidence": None})
    return {
        "engine": "pocketsphinx",
        "model": "en-us (bundled)",
        "modelVersion": f"pocketsphinx {version('pocketsphinx')}",
        "language": "en",
        "durationSeconds": round(seconds, 3),
        "words": words,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("--engine", default="faster-whisper", choices=["faster-whisper", "pocketsphinx"])
    p.add_argument("--model", default="small.en")
    p.add_argument("--language", default=None)
    p.add_argument("--out", default=None)
    a = p.parse_args()
    result = whisper(a.audio, a.model, a.language) if a.engine == "faster-whisper" else sphinx(a.audio, a.language)
    text = json.dumps(result, ensure_ascii=False, indent=1)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
