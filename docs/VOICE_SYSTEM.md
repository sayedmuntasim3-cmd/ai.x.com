# Voice system (System B): any voice file to a film

Next phase (owner, 13 Nov 2026): the Quran recitation documentary, `docs/QURAN_DOCUMENTARY.md`.

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

## Voice mastering engine (design and state, 13 Nov 2026)

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
| Dynamics | three gentle stages: slow leveller, soft-knee compressor (threshold from the level histogram), a peak stage that eases only what towers over the voice; recitation keeps more range than narration | `voice-chain.mjs`, `voice-master.mjs` |
| Space | impulse responses synthesised in code (seeded noise, per-frequency decay, pre-delay, early reflections, high-cut), FFT convolution, send automation from pauses / phrase ends / sustained notes (ayah ends when known), ducking under the voice | `voice-reverb.mjs` |
| Master | gain to -14 LUFS, look-ahead limiter, true peak <= -1 dBTP, measured again and corrected (two-pass); WAV 48 kHz 24-bit + AAC | `voice-master.mjs` |
| Proof | same sample count (plus a reverb tail at the very end only), alignment lag by cross-correlation in the 1-3 kHz band at start/middle/end, f0 contour of the mastered voice against the original (and of the finished mix), before/after numbers, measured decay of the applied reverb, echo-free check of the impulse | `voice-proof.mjs` |

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

CLI: `node local/voice-master.mjs --audio <file> --profile quran|narration [--preset <name>|all] [--from s --to s] [--source elevenlabs] [--lufs -14] [--understanding understanding.json] [--lang bn]`
gives `<preset>.wav` (48 kHz 24-bit), `.m4a` (AAC 256k) and `.report.json`; `--preset all` adds the untouched original (the listening pack).
In the film path: `node local/voice-film.mjs --audio a.mp3 --kind quran --master [space]` asks `planVoice` for profile and space, runs the engine, and names `master/<space>.wav` for `--one-track`.

### Mastering state (13 Nov 2026, verified by running it)

- Built and tested (V0-V6): analyzer, cleanup, tone, three-stage dynamics, synthesised reverb with automation,
  two-pass loudness, proofs, CLI, `voice-film --master`, narration profile. 36 tests on synthetic signals
  (`engine/test/voice-{analyze,chain,reverb,master}.test.mjs`, `local/voice-master.test.mjs`).
- Real recordings, GitHub Actions run 43374825142 (`voice-master.yml`, runs on a push of the mastering code): 60 s
  each of two archive.org recitations their uploaders marked CC0 (`jawad-farogi/Az-Zuha.mp3`,
  `001AlFaatihah_201305`; used for the test only, never committed) and the public-domain LibriVox Gettysburg
  reading. All 8 masters passed their own proofs: -14.0 LUFS; true peak -1.38 to -4.29 dBTP (AAC decoded again:
  -1.39 to -4.30); voice within 0.021 ms of the original, no drift; voice pitch median difference 0.62-1.24
  cents, contour correlation 0.9996-1.0; applied reverb measured 1.47-2.26 s at 500 Hz (shortened from 2.4 / 3.8 s
  because those reciters pause for about 0.4-0.6 s), echo-free check passed.
- What the numbers say honestly: both recitations were already loud, processed files (-7 and -9.5 LUFS, one
  with true peak +4.7 dBTP), so the engine turned them *down* and they are not the "ordinary raw recording"
  this is for. Noise fell 2.4 dB and 8 dB (floor), the narration's 5.1 dB with its pauses dipped; the
  narration's tallest peaks stood 21.5 dB above the voice and were eased to 14 dB, leaving the limiter 0.25 dB.
- Speed and memory (this box): 60 s in about 6 s; 10 minutes in 53 s with 1.1 GB. About ten float buffers are
  held at once, so an hour needs roughly 7 GB: recordings over about 30 minutes need chunked processing (not built).
- Not verified: how it sounds. No one has listened yet; targets (tone offsets, reverb level -14 / -12.5 dB,
  thresholds) are engineering starting points to tune with the owner by ear. No test yet on a raw phone
  recording, on ElevenLabs audio, or with real ayah times from the understanding layer (the hook is tested with
  given times only).
- Not built: stereo in the film renderer (it mixes mono, so a film gets the reverb in mono; the standalone
  WAV / AAC are stereo), chunked processing for long files, de-reverb (a heavy room cannot be removed), breath
  control, a feeling model (only the bounded hook exists, off), studio page and upload route.

## Free narrator: the Zupona narrator (19 Nov 2026, verified by running it)

Why: without an ElevenLabs key every film rendered **without a voice**. The studio now has its own
narrator for American English, at no cost, on any CPU (the owner's machine, the GitHub runner).

| Item | Value |
|---|---|
| Engine | Kokoro-82M v1.0 through kokoro-onnx 0.6.1; weights and voice styles Apache-2.0, kokoro-onnx MIT, onnxruntime MIT: commercial use allowed, no account, no per-character fee |
| Identity | `zupona-narrator-1`: a fixed blend of three stock styles (am_michael 0.6, am_fenrir 0.25, bm_george 0.15), American phonemes. Sounds like no single stock voice; imitates no real person or company voice |
| Files | `engine/src/narrator.mjs` (identity, 6 delivery presets, sentence plan, refusals, caption timings, checks), `render/narrate.mjs` (CLI, resumable, checksums), `render/kokoro_tts.py` (the worker), workflow step in `render-film.yml` |
| Presets | cinematic (default), historical, science, nature, investigative, islamic-calm (English only). Each sets speed and the pause after a sentence and after a question |
| Never | Quran recitation, Arabic, a line with Arabic text (refused with the reason, before any sound). The owner's own recording always wins over it |
| Captions | sentence edges measured exactly; words spread evenly inside a sentence |

Benchmark (same 76-word passage, this container, 4 CPUs, Whisper small.en hearing it back):
- 6 stock voices and a first blend compared (int8 model, one speed): every word heard in every take;
  errors only on "Sanlúcar de Barrameda" (all) and "cloves" heard as "clothes" (am_fenrir, am_onyx,
  bm_fable). 0.28-0.31 s of CPU per second of speech; the full model used by the narrator: 0.27.
- The narrator in all 6 presets: word error 4.1-5.5 %, all of it the Spanish place name; 140-153
  words a minute; no clipping (fixed gain 0.75, ceiling 0.97).
- With a lexicon respelling ("San Lookar day Barra-mayda"): **0 % word error**. The S4 pronunciation
  lexicon is applied to every line, so hard names are fixed per film.
- Real chapter (saved production `ramesh-babu/USA`, chapter 1): 48 scenes, 1,163 words, 7 min 21 s of
  narration in 2 min 2 s; pace 158 words a minute (the check refused 161 at a faster setting, which was then lowered).

Not measured (a person must listen): warmth, emotion, how "human" it sounds next to ElevenLabs over 40
minutes. Bangla and Arabic narration: no free voice was tested; Arabic recitation is never synthesized.
Candidates not adopted now: IndicF5 and Indic Parler-TTS (Bangla; Bangla is switched off), MOSS-TTS and
other large models (need a GPU; hosting is not free).

### Free voice benchmark, second round (20 Nov 2026; owner: Kokoro "not extreme level")

Same two passages (Magellan 76 words, Apollo 85 words), this container (4 CPUs, no GPU). Scores:
torchaudio SQUIM subjective MOS against a clean LibriVox human reference, Whisper small.en word error.

| Voice | Licence | MOS (human ref 4.50) | Word error | Pace (wpm) | CPU s per s of speech |
|---|---|---|---|---|---|
| A Kokoro, Zupona narrator | Apache-2.0 | 4.41-4.42 | 1.1-3.9 % | 143-144 | 0.27 |
| B Chatterbox 0.1.7, Zupona identity (reference = the narrator's own synthetic take) | MIT, Perth watermark kept | 4.41 | 5.3-6.4 % | 137-141 | 5.2 |
| C Chatterbox, its own voice | MIT | 4.42-4.44 | 6.6-8.5 % | 186-191 | 4.5 |

Result: the MOS model cannot tell them apart (all within 0.03); Chatterbox mishears more words and is
15-20x slower (a 40-minute film: about 3.5 CPU hours, possible on GitHub runners split by chapter).
No objective evidence that Chatterbox is better; the owner listens to A/B/C and decides. Not yet tried:
NeuTTS Air (Apache-2.0), VoxCPM-0.5B (Apache-2.0); GPU-only models (Orpheus, Higgs Audio, VibeVoice)
cost money to host. UTMOS could not be run here (torch.hub blocked; the PyPI package needs fairseq,
which fails on Python 3.11).

### 40-minute stability test of the Zupona narrator (20 Nov 2026)

The whole saved film `productions/ramesh-babu/USA` (6 chapters, 243 scenes, 6,127 words), voiced by `render/narrate.mjs`
in one run: **39 min 46 s of speech, 0 failed scenes, 10 min 46 s of CPU (0.27 s per second of speech)**.
- Level: speech level -22.21 / -22.21 / -22.19 dB in the first, middle and last third; the 243 takes differ by sd 0.34 dB. No drift.
- Pace: 157.6 / 157.6 / 153.7 words a minute (whole film 154.1, inside the 140-160 band); no clipping (peak 0.94).
- Words heard back by Whisper small.en, 14 takes from each third (about 360 words each): word error 6.3 / 8.6 / 6.8 %. The same in all
  thirds, so no degradation over length. Higher than the 1-5 % of the short passages: this film is full of names, money amounts and
  numerals, which a speech-to-text model also writes differently from the script, so part of it is the checker's. Not separated yet.
- Not measured: whether it stays pleasant to listen to for 40 minutes (a person must listen to a stretch from the end).

## Voiceover films from the studio (20 Nov 2026, workstream B)

A creator uploads a finished voiceover and gets a film back; the recording's words are the script.

| Piece | Where |
|---|---|
| Upload, private R2 storage, progress, download | `worker/voice-api.mjs` (routes `/api/voice...`, listed at the top of the file) |
| Film machine (free GitHub runner) | `.github/workflows/voice-film.yml`: fetch, `voice-film.mjs` (faster-whisper small.en, tighten, master dry, keyless media), `render-film.mjs --one-track`, release gate, film back to R2 |
| Runner helper (ticket, progress, film upload in pieces) | `render/voice-runner.mjs` |
| Landing page Voiceover mode | `src/voice-film.tsx` (only the brief sheet's voice part; the landing design is unchanged) |
| Studio Voiceover tab | `public/studio/voice-upload.js` |
| Progress messages en + bn | `voice.stage.*` in `engine/src/messages.mjs` |

How it is safe: the file goes up in 16 MiB pieces (R2 multipart, so a 2 GB WAV fits under Cloudflare's 100 MB
request limit), stays under `voice/<id>/` in the private bucket, and every route needs the studio key. The runner
never gets the studio key: the Worker gives it a ticket (HMAC of the key over the voice id, purpose and expiry, 7 h)
good for this one recording only; the creator's download link carries a separate 2-hour download-only ticket.
Quran: the surah must be given (never guessed), the recitation is aligned to the Tanzil text, mastered in a
mosque hall without music, pictures pass the adab guard, and the finished film is marked "awaiting review": it is
delivered privately and never published before a scholar's review.

Verified (20 Nov 2026, this container, the real routes over a local R2 stand-in, the workflow's steps run by hand):
a 1 min 42 s Zupona-narrator recording went up, was fetched by ticket byte for byte, 251 words heard by
faster-whisper small.en, 13 scenes, mastered (-15 LUFS, timing within 0 ms), 13 licensed pictures, rendered
1280x720, passed the final check, came back in pieces and downloaded identical (7.9 MB). Bug found and fixed: the
final check blocked every one-recording film ("1 of 13 scenes have a voice"); the report now counts the one track
as voicing every scene. Not verified yet: the workflow on GitHub itself (it runs only after merge to main), the
Cloudflare R2 multipart calls live, the Quran path end to end.

Seen in the frames, to fix next: without a brain and without Pexels/Pixabay keys on GitHub, pictures come from the
keyless museum archives (old etchings and portraits) and do not match a modern story. No music under a narration
voiceover yet.

### First live 40-minute run (20 Nov 2026, production, film d7843edb)

A 39 min 46 s Zupona-narrator reading of `productions/ramesh-babu/USA` (barber to Rolls-Royce, 38 MB MP3) was
uploaded through the production landing page in a real browser, exactly as a creator does.

| Stage | Time |
|---|---|
| Upload (3 pieces of 16 MiB, R2 multipart) and start | 12 s |
| Waiting for the GitHub machine, installing | 10 s + 30 s |
| Speech-to-text (faster-whisper small.en, 6,108 words) | 13 min |
| Pause tightening + mastering (-15 LUFS, timing within 0 ms) | 2 min |
| Understanding + pictures (323 scenes, keyless archives) | 31 min |
| Render 1920x1080 | 1 h 55 min |
| Total until the final check | 2 h 43 min |

The MP4 itself measured 39 min 46 s, -14.8 LUFS, true peak -1.1 dBTP, 0 black frames, every scene voiced. The final
check **blocked** it, correctly: 200 of 322 pictures could not be downloaded (Wikimedia answered HTTP 429) and
became text cards. Also seen: every search was word salad ("little everything record", "particular described
something"), the film had no topic (the creator typed none), and the stop message quoted the wrong log.

Fixed after it (round 2):
- Downloads: a User-Agent that names the tool, one download at a time for throttling archives (Wikimedia, LOC,
  Smithsonian, Art Institute, archive.org), Retry-After honoured, up to 7 attempts (`render/render-film.mjs`).
- Searches (`wordsPlan`): things named after a determiner ("a pen", "the bundle") and place or firm names
  ("Brigade Road"); no adverbs, adjectives, reporting words, months or private persons' names; misheard names put
  back from the topic ("Rolls Rice" -> "Rolls-Royce"); the topic's subject is the fallback, never glued on; a shot
  about every 6 s. On the live transcript the most searched words became company, business, salon, shop, chair,
  cars, Rolls-Royce, money, mirror (before: three-word strings that no archive matches).
- A picture must name what was searched, as a whole word (`titleHasWords`; "car" no longer finds the Carina
  Nebula). On for voiceover films only, so the idea system is unchanged until it is tried there.
- Modern stock: the Worker relays Pixabay searches for the runner with its own key (`/api/voice/:id/stock`, ticket
  only); the key never leaves Cloudflare. Unverified live until the next run.
- Topic from the file name when none is typed; the stop message quotes the failing step (BLOCK lines first);
  `POST /api/voice/:id/retry` starts a stopped film again without a new upload (the landing's "Try again" uses it);
  `DELETE /api/voice/:id`.

Still weak, honestly: the keyless archives are museum and space collections, so plain words still find old or
off-topic pictures where Pixabay has nothing; no music under a narration voiceover; render takes about 2.9x the
film's length on a free runner.

### Round 3 (20 Nov 2026)

- Music under a narration voiceover: `voiceScore` writes a cue plan (opening, a steady cue about every 4 minutes,
  a closing cue) and a `MUS` field per scene; the free score (`render/score-synth.mjs`) composes it and the renderer
  lays it under the voice. Short real run: 2 of 2 cues played, film -14.9 LUFS, true peak -1.3 dBTP. Never for the
  Quran (no plan is written, and `musicPlanFor` refuses it too).
- A picture is chosen only if its file can really be fetched (`reachable`, a ranged GET with the tool's
  User-Agent; image or video answers only), else the next candidate. Found live: NASA's `~large` file answers 403
  for some items while `~orig` exists, and an archive.org IIIF link answered 403; each became a text card.
- The 40-minute re-run and a Quran-mode run (Ad-Duha, Qari Jawad Farogi, archive.org, uploader-marked CC0, test
  only, kept private) were started on production through the landing page; results follow.

### Live results of the round-2 code (20 Nov 2026, production)

- 40-minute re-run (film 993f09ea, uploaded through the landing page; topic taken from the file name): 6,094 words,
  312 scenes, **389 shots, 23 pictures failed (was 200 of 322)**; render 2 h 08 min. Still blocked by the gate,
  mostly NASA `~large` 403s, which round 3's fetchability check removes.
- Quran mode (film e1484358, Ad-Duha, Qari Jawad Farogi, 2 min 27 s): the whole path worked in 12 minutes; delivered
  privately, "awaiting review"; 1920x1080, -14.0 LUFS, peak -4.0 dBFS, 0 black frames, 6 nature shots, no living
  beings, no music, length equal to the voice. **The ayah text was not shown**: alignment to the Tanzil text placed
  0 of 10 ayah ends with certainty (8 not at all), so the engine kept every unsure time off the screen, as the rule
  says. Still open: a recitation aligner that works on this recording, or a person marking the ayah ends.
- Fixed: the progress showed "0 scenes" and "0 pictures" for a recitation (it read narration fields).

### Quran ayah times marked by the reviewer (20 Nov 2026)

Owner's choice (via the parent session): (c) a person marks the ayah ends first; (b) a Quran-tuned aligner is measured
on Ad-Duha next; (a) published timings (cpfair/quran-align, quranlab, CC BY 4.0, credit kept) only when the upload is
a known EveryAyah recording.
- In the landing's voice sheet, a recitation awaiting review shows the uploaded recording (a `listen` ticket, Quran
  only) and one button: tap when the first ayah begins, then at the end of each ayah (undo allowed), then the
  reviewer's name. `POST /api/voice/:id/marks` checks the count against the ayat the run located and restarts the film.
- `engine/src/quran-marks.mjs`: `checkMarks` (count, order, inside the recording, a name) and `applyMarks` (every
  ayah gets the marked start and end and becomes sure; an opening phrase ends where ayah 1 begins).
  `voice-film.mjs --marks` applies them right after locating, so cuts, scenes and the on-screen verbatim text follow
  the person's times; the run keeps every pause (`--tighten off`) so the taps on the uploaded file stay exact.
- Not verified live yet: a real reviewer pass on Ad-Duha (film e1484358 needs one retry first, so its delivery
  carries the ayah list).

### Speed, step 1 (20 Nov 2026; owner's target: a 40-minute voiceover to video in 10-20 minutes)

Measured before: speech-to-text 13 min, pictures 31 min, render 1 h 55 min (2 h 43 min in all).
- Speech-to-text: batched greedy decoding (`transcribe.py --batch`, faster-whisper `BatchedInferencePipeline`) with
  base.en. Same 5 minutes of the real narration: small.en beam 5 75.2 s, word error 12.6 %; small.en batched 31.7 s,
  12.6 %; **base.en batched 10.9 s, 12.9 %** (the error rate counts names and numbers written differently in the script,
  the same for all). The film machine sets `ZUPONA_STT_BATCH=8` and base.en.
- Pictures: shots are searched six at a time (`chapterMedia` `concurrency`, `runPool`), each provider's rate limiter
  still paces its host. Same 17 shots of the 1:42 run, live archives: 123.6 s one at a time, **41.1 s** six at a time,
  17 of 17 found both ways. Pictures cannot start before the words (the searches come from them).
- Render: the chunked parallel render (matrix jobs) is being built by another session; wired in when it lands.
