# Voice system (System B): any voice file to a film

The owner gives a voice file (own recording, ElevenLabs, anything ffmpeg reads).
The system first understands it, then plans pictures scene by scene and makes
the film. **The spoken words are never changed**: code puts them back and
checks them; no model is trusted with them.

## Pipeline

| Step | What happens | Where |
|---|---|---|
| 1 Intake | ffmpeg makes a 16 kHz mono WAV *copy* for listening machines; the original file is kept untouched for the film. Voice report: duration, loudness (LUFS), true peak, clipping, silence share, SNR, problems | `local/voice-film.mjs` (`--audio`), reuses `engine/src/wav.mjs`, `engine/src/loudness.mjs` |
| 2 Words | `transcribe` gives `{language, engine, model, modelVersion, words:[{text,start,end,confidence}]}`. Engines: faster-whisper (word timestamps, best), pocketsphinx (weak, but its model ships inside the pip wheel, so it runs where model hosts are blocked), or the transcript that came with the voice (ElevenLabs alignment, SRT, VTT, Whisper JSON) | `local/stt/transcribe.py`, `engine/src/transcript.mjs` |
| 3 Understand | language (`detectLanguage`), kind: Quran recitation (`matchRecitation` against Tanzil: exact ayat, per-ayah times) or narration (`classifyInput`); narration is cut into scenes on word times (`splitVoiceScenes`); structure summary: topic words, sections, named people, places, dates | `engine/src/voice-understand.mjs` |
| 4 Pictures | the brain fills only ANCHOR, SHOTS, LOOK of a skeleton whose times and NARR are fixed; `restoreVoiceFields` then `checkVoiceChapter` must find no changed word. No brain: a plan from the scene's own nouns. Media from keyless free providers first; a licence is recorded per asset. Quran: `quran-visual-adab-guard` | `engine/src/voice-visuals.mjs` |
| 5 Render | the voice is the only narration track; captions from the recording's own word times | `render/` (one-track path) |

## Interfaces (all pure, browser + Node, except step 1-2 runners)

- `normalizeTranscript(raw, {format})` → transcript; `checkTranscript(t, seconds)` → problems.
- `understandVoice({transcript, totalSeconds, kind, quranIndex, surahNames})` →
  `{kind, language, classification, scenes | quranPlan, structure, problems}`.
- `planVoiceVisuals({understanding, brain?, providers?})` → per scene `{sc, start, end, narration, shots, assets[{url, licence, source}]}` + `findings`.
- `quranVisualAdabGuard({plan, assets, meanings})` → problems + gaps.

## Reused, not rewritten

`voice-scenes.mjs`, `voice-plan.mjs` (chain, NEVER_DONE_TO_A_VOICE), `content-intel.mjs`,
`quran.mjs`, `quran-film.mjs`, `film-media.mjs` providers, `loudness.mjs`, `wav.mjs`,
`canSee`/`canSearch` (no stage assumes Claude), `messages.mjs` (every new message en + bn).

## Rules held in code

1. Words: scene NARR equals the transcript's words (case and punctuation aside), in order, none added or dropped.
2. Time: scenes run 0 → end of recording, no gap, no overlap; times come from words, never from a model.
3. The voice is never sped up, slowed, re-ordered or re-synthesised; Quran is never synthesised.
4. Quran: no music, SFX or ambience; no living beings, faces or AI pictures; on-screen text is verbatim Tanzil; a meaning line only from a translation whose licence is recorded and allows it, otherwise the gap is reported, never filled.
5. Every asset carries its licence; an asset without a free licence is refused.

## Exit criteria

- A public-domain English recording runs steps 1-4 from the command line; the words-unchanged check passes in code and a test.
- Transcript adapters tested with recorded fixtures (Whisper JSON, ElevenLabs alignment, SRT, VTT).
- Live speech-to-text reported only where it really ran, with engine, model and version.

## Open risks

- This cloud box cannot reach model hosts (Hugging Face) or archive.org's file servers, so faster-whisper cannot run here; it runs on the owner's PC or a GitHub runner.
- pocketsphinx is much weaker than Whisper: good enough to prove the path, not for a film.
- General STT is weak on Quran recitation; a Quran-tuned model is still needed (matching tolerates slips, but not a bad transcript).
- No licensed Quran translation is bundled yet; meanings stay a reported gap.
- Picture choice without a seeing brain uses titles and tags only (`canSee` false): it cannot judge a picture.

## State (12 Nov 2026, verified by running it)

Run: `node local/voice-film.mjs --audio a.mp3 --stt faster-whisper [--script text.txt] [--topic "..."] [--media]`,
then `node render/render-film.mjs --run voice-runs/a --out film.mp4 --one-track a.mp3 --words voice-runs/a/words.json`.

- Real faster-whisper (small.en) on the LibriVox Gettysburg Address: GitHub Actions run 43270503417 (`voice-stt.yml`, runs on push of STT code); 268 words, first word heard "IV" for "Four". Output kept as `engine/test/fixtures/voice/gettysburg-librivox-whisper.json`; `engine/test/voice-exit.test.mjs` runs steps 2-4 on it.
- pocketsphinx ran here on an espeak-ng reading: 23% of words right, but with the script, 9 of 10 sentence starts land within 0.13 s of the truth (all within 0.54 s).
- Live Commons search (`--media`) returned public-domain Gettysburg pictures with licences; files could not be downloaded here (upload.wikimedia.org blocked), so the test render used text cards.
- One-track render: narration.wav is sample-identical to the recording (resampled to 48 kHz); the film can end up to one frame before the recording's last sample.
- Not built: upload route, studio switch, brain in the CLI (Gemini key invalid; any `Model` works in `planVoiceVisuals`), picture judging, Quran STT, Uthmani text, licensed meanings.

## Voice mastering engine (V0 design, 13 Nov 2026)

Takes an ordinary recording and masters it. Priority 1 Quran recitation, 2 US English
narration. All DSP is pure JS in `engine/src/` (deterministic, same result on the owner's
PC, a GitHub runner and in tests; no model download). ffmpeg only decodes the input to
48 kHz mono float and encodes AAC. The voice is treated as mono; the reverb is stereo.

**Rule update (owner, 13 Nov 2026).** A recitation may get a beautiful, smooth hall /
mosque style *reverb* (what the owner calls "echo"). Discrete echoes or delays that repeat
syllables stay forbidden, as does everything else in `NEVER_DONE_TO_A_VOICE` (no pitch,
formant, speed, auto-tune, re-synthesis, generative enhancer). Nothing is laid under a
recitation. English documentary narration stays close, warm and nearly dry: that is what
top documentaries use, so the narration profile adds a touch of room at most.

| Stage | What it does (every setting comes from the measurement) | Module |
|---|---|---|
| Analyze | noise floor, SNR, hum 50/60 Hz, DC, clipping, plosives, sibilance, tonal balance vs a target voice curve, existing room reverb, LRA, crest, LUFS, true peak, pauses, sustained notes, f0 track; coded en+bn messages | `voice-analyze.mjs` |
| Clean | DC, high-pass placed under the lowest sung pitch, hum notches only on measured harmonics, spectral denoise with depth scaled to SNR (never deep), de-click, clipped peaks rounded | `voice-chain.mjs` |
| Tone | corrective EQ toward the profile's target curve (bounded, half-strength), de-esser only as deep as measured | `voice-chain.mjs` |
| Dynamics | slow leveller + soft-knee compressor; thresholds from the level histogram; recitation keeps more range than narration | `voice-chain.mjs` |
| Space | impulse responses synthesised in code (seeded noise, per-frequency decay, pre-delay, early reflections, high-cut), FFT convolution, send automation from pauses / phrase ends / sustained notes (ayah ends when known), ducking under the voice | `voice-reverb.mjs` |
| Master | gain to -14 LUFS, look-ahead limiter, true peak <= -1 dBTP, measured again and corrected (two-pass); WAV 48 kHz 24-bit + AAC | `voice-master.mjs` |
| Proof | same sample count (plus a reverb tail at the very end only), alignment lag by cross-correlation at start/middle/end, f0 contour correlation, before/after numbers, measured decay of the applied reverb, echo-free check of the impulse | `voice-proof.mjs` |

Profiles and presets: `quran` = `clean` (no added space), `mosque-hall`, `grand-hall`;
`narration` = `dry`, `warm-room`. Presets set only the *space target* (decay, pre-delay,
level); cleanup, tone and dynamics are always derived from the file. The reverb level is
lowered when the recording already carries a room, and the decay is shortened when the
reciter's pauses are short.

Limits said plainly in the report: heavy room echo already in a recording cannot be
removed; clipped peaks are rounded, not recovered; denoise is capped (6 dB recitation,
10 dB narration) because deeper reduction smears letters; meaning-aware ("feeling") send
variation exists only as a bounded hook (+-1.5 dB), OFF for the Quran until the owner
approves it by ear. Quality is shown by measurements and a listening pack; nothing here
claims to be the best in the world.

CLI: `node local/voice-master.mjs --audio <file> --profile quran|narration [--preset ...]`.
