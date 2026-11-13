#!/usr/bin/env python3
"""Speech to text with a time for every word, for the Zupona voice system.

  python local/stt/transcribe.py <audio.wav> [--engine faster-whisper|pocketsphinx]
         [--model small.en] [--language en] [--clips "s,e,s,e"] [--out words.json]

Prints (or writes) one JSON object:
  {"engine", "model", "modelVersion", "modelSource", "modelRevision",
   "modelLicense", "language", "durationSeconds",
   "words": [{"text", "start", "end", "confidence"}]}

--model takes a faster-whisper size (small, small.en, ...), a folder, or a
Hugging Face repository. A repository in transformers format (a fine-tuned
Whisper, for example tarteel-ai/whisper-base-ar-quran for Quran recitation)
is converted once to CTranslate2 (pip install transformers torch) and kept in
~/.cache/zupona-stt. The model's licence is read from its own page and
written into the result; a model whose licence is not on the open list
below is refused unless --allow-licence names it.

--clips gives the stretches to listen to (seconds: start,end,start,end),
cut on the recording's own pauses, so no word is split at a 30 s window.

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


OPEN_LICENCES = {"apache-2.0", "mit", "bsd-2-clause", "bsd-3-clause", "cc0-1.0", "cc-by-4.0", "unlicense"}
SIZES = {"tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3", "large", "large-v3-turbo", "turbo", "distil-large-v3"}


def resolve_model(name, allow=()):
    """Where the model comes from, its revision and licence (read from its
    own Hugging Face page), and a path or name faster-whisper can load."""
    import os

    if os.path.isdir(name):
        return name, {"modelSource": "folder", "modelRevision": None, "modelLicense": None}
    from huggingface_hub import HfApi

    size = name[:-3] if name.endswith(".en") else name
    repo = f"Systran/faster-whisper-{name}" if size in SIZES and "/" not in name else name
    if "/" not in repo:
        raise SystemExit(f"Unknown model: {name}. Give a faster-whisper size, a folder or a Hugging Face repository.")
    info = HfApi().model_info(repo)
    licence = (info.card_data or {}).get("license") if info.card_data else None
    if isinstance(licence, list):
        licence = licence[0] if licence else None
    if licence not in OPEN_LICENCES and licence not in allow:
        raise SystemExit(f"The licence of {repo} is {licence!r}, which is not on the open list. Read its page; pass --allow-licence {licence} only if its terms allow this use.")
    about = {"modelSource": f"https://huggingface.co/{repo}", "modelRevision": info.sha, "modelLicense": licence}
    files = {s.rfilename for s in info.siblings or []}
    if "model.bin" in files:
        return (name if repo != name else repo), about
    # A transformers checkpoint: convert it once.
    target = os.path.join(os.path.expanduser("~/.cache/zupona-stt"), repo.replace("/", "__") + "-" + (info.sha or "x")[:12] + "-int8")
    if not os.path.exists(os.path.join(target, "model.bin")):
        from ctranslate2.converters import TransformersConverter

        copy = [f for f in ("tokenizer.json", "preprocessor_config.json") if f in files]
        TransformersConverter(repo, copy_files=copy, revision=info.sha).convert(target, quantization="int8", force=True)
    return target, about


def whisper(path, model_name, language, clips=None, allow=()):
    from faster_whisper import WhisperModel

    model_path, about = resolve_model(model_name, allow)
    model = WhisperModel(model_path, device="auto", compute_type="int8")
    more = {"clip_timestamps": clips, "condition_on_previous_text": False} if clips else {}
    segments, info = model.transcribe(read_16k(path), language=language, word_timestamps=True, beam_size=5, vad_filter=False, **more)
    words = []
    for seg in segments:
        for w in seg.words or []:
            words.append({"text": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "confidence": round(w.probability, 3)})
    return {
        "engine": "faster-whisper",
        "model": model_name,
        "modelVersion": f"faster-whisper {version('faster-whisper')}, ctranslate2 {version('ctranslate2')}",
        **about,
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
    p.add_argument("--clips", default=None, help="seconds: start,end,start,end")
    p.add_argument("--allow-licence", action="append", default=[])
    a = p.parse_args()
    clips = [float(x) for x in a.clips.split(",")] if a.clips else None
    result = whisper(a.audio, a.model, a.language, clips, a.allow_licence) if a.engine == "faster-whisper" else sphinx(a.audio, a.language)
    text = json.dumps(result, ensure_ascii=False, indent=1)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(text)
    else:
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
