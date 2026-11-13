#!/usr/bin/env python3
"""Forced alignment of a known Quran passage to a recitation (CTC, Viterbi).

  python local/stt/align.py <voice-16k.wav> --text words.json [--model jonatasgrosman/wav2vec2-large-xlsr-53-arabic] [--out aligned.json]

words.json: [{"surah": 93, "ayah": 1, "words": ["والضحي"]}, ...], the passage's words as the
recognizer-normalised Simple text (engine/src/arabic.mjs), in recited order.
When the surah and ayat are known, the text does not have to be recognised, only placed: each letter
is laid on the audio by the model's letter probabilities (CTC forced alignment), so ayah ends are
found inside a long breath too. The model is Apache-2.0 (its page is read and its licence written
into the result, as in transcribe.py). Each word gets a start, an end and a score (the mean
probability of its letters on the frames it was given); a low score means the letters did not fit
the sound there, and the caller does not trust that end.
Prints (or writes) {"model", "modelRevision", "modelLicense", "frameSeconds", "ayat": [{"surah", "ayah", "start", "end", "score", "words": [...]}]}.
"""
import argparse
import json
import sys
import wave

OPEN = {"apache-2.0", "mit", "bsd-3-clause", "cc0-1.0", "cc-by-4.0"}


def read_16k(path):
    import numpy as np

    with wave.open(path, "rb") as f:
        if f.getframerate() != 16000 or f.getnchannels() != 1 or f.getsampwidth() != 2:
            raise SystemExit("A 16 kHz mono 16-bit WAV is needed.")
        return np.frombuffer(f.readframes(f.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0


def log_probs(x, model_name, chunk_seconds=15.0):
    """Letter log-probabilities for every 20 ms frame, computed in chunks (attention grows with the square of the length)."""
    import numpy as np
    import torch
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor

    proc = Wav2Vec2Processor.from_pretrained(model_name)
    model = Wav2Vec2ForCTC.from_pretrained(model_name).eval()
    step = int(16000 * chunk_seconds)
    parts, times = [], []
    with torch.no_grad():
        for i in range(0, len(x), step):
            seg = x[i : i + step]
            if len(seg) < 400:
                break
            inp = proc(seg, sampling_rate=16000, return_tensors="pt", padding=True)
            lp = torch.log_softmax(model(inp.input_values).logits[0], dim=-1).numpy()
            parts.append(lp)
            # Each frame's time from its own chunk's start: the model gives one frame fewer per chunk than
            # length / 20 ms, so counting frames across chunks would drift (about 20 ms a chunk).
            times.append(i / 16000 + np.arange(lp.shape[0]) * len(seg) / 16000 / lp.shape[0])
    return np.concatenate(parts, axis=0), np.concatenate(times), proc.tokenizer.get_vocab()


def align(lp, tokens, blank):
    """CTC Viterbi forced alignment: the frame span of every token of the sequence."""
    import numpy as np

    T = lp.shape[0]
    ext = [blank]
    for t in tokens:
        ext += [t, blank]
    S = len(ext)
    NEG = -1e30
    dp = np.full((T, S), NEG, dtype=np.float64)
    back = np.zeros((T, S), dtype=np.int8)
    dp[0, 0] = lp[0, ext[0]]
    if S > 1:
        dp[0, 1] = lp[0, ext[1]]
    ext_arr = np.array(ext)
    can_skip = np.zeros(S, dtype=bool)
    for s in range(2, S):
        can_skip[s] = ext[s] != blank and ext[s] != ext[s - 2]
    for t in range(1, T):
        prev = dp[t - 1]
        stay = prev
        move = np.concatenate([[NEG], prev[:-1]])
        skip = np.where(can_skip, np.concatenate([[NEG, NEG], prev[:-2]]), NEG)
        best = np.maximum(np.maximum(stay, move), skip)
        back[t] = np.where(best == stay, 0, np.where(best == move, 1, 2))
        dp[t] = best + lp[t, ext_arr]
    s = S - 1 if dp[T - 1, S - 1] >= dp[T - 1, S - 2] else S - 2
    path = [0] * T
    for t in range(T - 1, -1, -1):
        path[t] = s
        s -= int(back[t, s])
    spans = {}
    for t, s in enumerate(path):
        if s % 2 == 1:
            k = (s - 1) // 2
            a, b = spans.get(k, (t, t))
            spans[k] = (min(a, t), max(b, t))
    return spans


def main():
    p = argparse.ArgumentParser()
    p.add_argument("audio")
    p.add_argument("--text", required=True)
    p.add_argument("--model", default="jonatasgrosman/wav2vec2-large-xlsr-53-arabic")
    p.add_argument("--out", default=None)
    a = p.parse_args()
    import numpy as np
    from huggingface_hub import HfApi

    info = HfApi().model_info(a.model)
    licence = (info.card_data or {}).get("license") if info.card_data else None
    if licence not in OPEN:
        raise SystemExit(f"The licence of {a.model} is {licence!r}, not on the open list.")
    passage = json.load(open(a.text, encoding="utf-8"))
    lp, ftime, vocab = log_probs(read_16k(a.audio), a.model)
    blank = vocab.get("<pad>", 0)
    sep = vocab.get("|")
    # Letters of the passage in the model's alphabet; a letter it does not have is left out (and counted).
    tokens, owner, missing = [], [], 0
    for ai, ay in enumerate(passage):
        for wi, word in enumerate(ay["words"]):
            if tokens and sep is not None:
                tokens.append(sep)
                owner.append(None)
            for ch in word:
                if ch in vocab:
                    tokens.append(vocab[ch])
                    owner.append((ai, wi))
                else:
                    missing += 1
    spans = align(lp, tokens, blank)
    frame = 0.02
    words = {}
    for k, own in enumerate(owner):
        if own is None or k not in spans:
            continue
        a0, b0 = spans[k]
        w = words.setdefault(own, {"start": a0, "end": b0, "probs": []})
        w["start"], w["end"] = min(w["start"], a0), max(w["end"], b0)
        w["probs"].append(float(np.exp(lp[a0 : b0 + 1, tokens[k]].max())))
    out = []
    for ai, ay in enumerate(passage):
        ws = [words.get((ai, wi)) for wi in range(len(ay["words"]))]
        ws = [w for w in ws if w]
        if not ws:
            out.append({"surah": ay["surah"], "ayah": ay["ayah"], "start": None, "end": None, "score": 0, "words": []})
            continue
        word_out = [{"start": round(float(ftime[w["start"]]), 3), "end": round(float(ftime[w["end"]]) + frame, 3), "score": round(sum(w["probs"]) / len(w["probs"]), 3)} for w in ws]
        out.append({"surah": ay["surah"], "ayah": ay["ayah"], "start": word_out[0]["start"], "end": word_out[-1]["end"], "score": round(sum(w["score"] for w in word_out) / len(word_out), 3), "lastWordScore": word_out[-1]["score"], "words": word_out})
    result = {"model": a.model, "modelRevision": info.sha, "modelLicense": licence, "frameSeconds": frame, "lettersNotInModel": missing, "ayat": out}
    text = json.dumps(result, ensure_ascii=False)
    if a.out:
        open(a.out, "w", encoding="utf-8").write(text)
    else:
        sys.stdout.write(text + "\n")


if __name__ == "__main__":
    main()
