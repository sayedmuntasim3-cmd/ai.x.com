# Record the voice and render a film to MP4

## 1. Voice (ElevenLabs)

```sh
ELEVENLABS_API_KEY=... node render/voice.mjs --run productions/ramesh-babu/USA --voice-id <voice id> --out voice/
```

- It writes one file per narrated scene (`SC0001.mp3`, plus `SC0001.alignment.json` with character timings), using Multilingual v2 for English.
- The neighbouring scenes' text is sent as context, so the read flows across cuts.
- A scene that still holds an unresolved number such as `[C12 low]` is skipped and listed, so the voice never reads a placeholder.
- Files that already exist are kept. A stopped recording resumes, and the owner's own takes, saved by hand under the same names (`SC0004.wav`), are never overwritten. The owner's voice is never processed.

## 2. Music

Each scene's `MUS` field names a cue (`M01` ...), and S4's music plan gives each cue its mood, instruments and tempo.

- **Automatic (owner's decision, 4 Nov 2026):** `ELEVENLABS_API_KEY=... node render/music-kit.mjs --run <folder> --out music/` composes one instrumental track per cue with ElevenLabs Music, written from the cue's own brief. Each track is as long as the cue's longest stretch in the film (10 s to 5 min; longer stretches loop). Every prompt is recorded in `music/music-kit.json`. ElevenLabs allows commercial use on its paid plans.
- **By hand:** download a track per cue (Pixabay Music, Mixkit), name it after its cue (`M01.mp3` …) and put it in the same folder. A track that exists always wins; the composer skips it.

Pass the folder with `--music music/`.

The renderer plays each cue across its scenes, honours "in at", "hard stop at" and "drops out", and loops a short track to fill its segment, with fades in and out. The music sits low and ducks further whenever the narrator speaks. A cue with no file plays as silence and is listed in the report.

## 3. Sound effects (optional)

S4's sound bible names every sound with a token and search phrases: `SND-AMB-01` (ambience), `SND-FX-05` (effects), `SND-DES-03` (designed hits). Download free ones (Pixabay, Mixkit), name each after its token (`SND-FX-05.mp3` ...) and pass the folder with `--sfx sfx/`.

- Ambience is looped quietly under its whole scene.
- An effect lands on the cut it names ("on cut 2") or the word it names ("on \"put up\"", estimated from the narration), and otherwise at the scene's start.
- Tokens with no file are listed in the report.

To fetch them automatically, run `FREESOUND_API_KEY=... node render/sound-kit.mjs --run <folder> --out sfx/` (the free key is at freesound.org/apiv2/apply). It searches Freesound with each token's own S4 phrases and takes **CC0 sounds only**: the licence is filtered in the search and checked again on every result. Ambience must last 8 s or more; effects 8 s or less. Each pick is recorded in `sfx/sound-kit.json` (sound page, creator, licence). Files already in the folder are kept, so your own choices win.

## 4. AI scenes for invented stories (optional)

`FAL_KEY=... node render/ai-scenes.mjs --run <folder> --out ai/ [--budget 15]` makes the shots that need the story's people. It covers every R9 shot, plus stock shots that found no clip:
- one reference portrait per invented character, from S4's `CHR-01 LOOK:` line;
- a keyframe per shot made from that reference, so the same face, hair and clothes appear in every scene;
- a short clip animated from the keyframe.

It runs only when the film allows AI (`allowAi`, on by default for invented stories). A character whose type is a real person, company or brand is never generated. Prompts forbid text, logos, real likenesses and children as the focus. A budget cap stops generation, and the shots left keep their cards. Made shots are cached in `ai/ai-scenes.json`, so they are never paid for twice. Pass `--ai ai/` to the renderer, and set "Altered or synthetic content" to Yes in YouTube Studio when uploading.

## 5. Render

`render-film.mjs` turns a film run into a video file with ffmpeg. It runs anywhere ffmpeg 6 or newer and Node 22 are installed: the owner's own computer (free), a small VM, or a container. It cannot run inside the Cloudflare Worker.

```sh
# From the run's files on the deployed site:
node render/render-film.mjs --api https://ai.zupona.com --id <film id> --voice voice/ --music music/ --sfx sfx/ --ai ai/ --out film.mp4
# From a folder of run files (s3-chapters.json, s5-C1.md ..., media-C1.json ...):
node render/render-film.mjs --run productions/ramesh-babu/USA --out usa.mp4 --width 1280 --height 720
```

What it makes:

- `film.mp4`: picture from the timeline (`engine/src/timeline.mjs`).
  - Stock clips are downloaded once, scaled and cropped to the frame, and looped when they are shorter than their shot.
  - Graphics shots become text cards. Their style comes from the scene's FX field: FX-PAPER is a cream paper ground with serif ink, FX-KINETIC makes the text rise as it fades in, and FX-COUNTER runs numbers up. Maps and split screens are not drawn yet.
  - A written cut to black stays black.
  - Narration from `--voice` (files named `SC0001.mp3` ...) sits in its own scene. It is sped up by at most 15% to fit, otherwise it is cut and a warning is written.
  - Loudness is -14 LUFS.
- `film.srt`: captions for the YouTube upload.
- `film.report.json`: counts, every clip with its licence page, the master's measured loudness, true peak and black stretches (`master`), and every warning (missing clips, voice too long, unresolved numbers, loudness off target, black picture the script does not ask for).
- `film.SH-01.mp4` … and `film.FB-01.mp4`: the Shorts (9:16) and the Facebook cut (4:5) from S7, cut at their exact source times. Each has the full frame centred over a blurred fill and its own hook on screen for the first 3.5 s. The captions are burned in word by word: the line stays up while it is spoken and the current word lights up, so the cut works with the sound off. Each cut also gets its own `.srt`.
- Captions follow the voice's own timings when the take has them (`SC0001.alignment.json`, written by `voice.mjs`), sped up exactly as the voice is. Otherwise they are estimated from the text.
- `film.TH-A.jpg`, `film.TH-B.jpg`, `film.TH-C.jpg`: the three S7 thumbnail briefs, for YouTube's Test & Compare. Each is 1280×720 and under 2 MB. The frame comes from the film's own footage (the scene the brief names, otherwise a different clip for each), graded, with the brief's words in large type.

Encoding is quality-led with a ceiling of about 6 Mbit/s at 1080p30 (scaled by frame size), so a 45-minute film stays near 2 GB at worst. The look is one gentle grade, with no synthetic grain: grain cannot be compressed and YouTube's encoder removes it anyway.

Every shot and audio piece is cached in `--work` (default `.render/`) under a hash of what makes it, so a stopped render resumes and a changed scene re-renders only its own shots. `npm test` renders a 10-second film to check the whole path, and skips that check when ffmpeg is missing.
