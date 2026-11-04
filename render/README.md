# Record the voice and render a film to MP4

## 1. Voice (ElevenLabs)

```sh
ELEVENLABS_API_KEY=... node render/voice.mjs --run productions/ramesh-babu/USA --voice-id <voice id> --out voice/
```

- It writes one file per narrated scene (`SC0001.mp3`, plus `SC0001.alignment.json` with character timings), using Multilingual v2 for English.
- The neighbouring scenes' text is sent as context, so the read flows across cuts.
- A scene that still holds an unresolved number such as `[C12 low]` is skipped and listed, so the voice never reads a placeholder.
- Files that already exist are kept. A stopped recording resumes, and the owner's own takes, saved by hand under the same names (`SC0004.wav`), are never overwritten. The owner's voice is never processed.

## 2. Music (optional)

Each scene's `MUS` field names a cue (`M01` ...), and S4's music plan gives each cue a search brief. Download one track per cue from Pixabay Music or Mixkit (free licence), name it after its cue (`M01.mp3` ...) and pass the folder with `--music music/`.

The renderer plays each cue across its scenes, honours "in at", "hard stop at" and "drops out", and loops a short track to fill its segment, with fades in and out. The music sits low and ducks further whenever the narrator speaks. A cue with no file plays as silence and is listed in the report.

## 3. Render

`render-film.mjs` turns a film run into a video file with ffmpeg. It runs anywhere ffmpeg 6 or newer and Node 22 are installed: the owner's own computer (free), a small VM, or a container. It cannot run inside the Cloudflare Worker.

```sh
# From the run's files on the deployed site:
node render/render-film.mjs --api https://ai.zupona.com --id <film id> --voice voice/ --music music/ --out film.mp4
# From a folder of run files (s3-chapters.json, s5-C1.md ..., media-C1.json ...):
node render/render-film.mjs --run productions/ramesh-babu/USA --out usa.mp4 --width 1280 --height 720
```

What it makes:

- `film.mp4`: picture from the timeline (`engine/src/timeline.mjs`).
  - Stock clips are downloaded once, scaled and cropped to the frame, and looped when they are shorter than their shot.
  - Graphics shots become simple text cards. Designed motion graphics come later.
  - A written cut to black stays black.
  - Narration from `--voice` (files named `SC0001.mp3` ...) sits in its own scene. It is sped up by at most 15% to fit, otherwise it is cut and a warning is written.
  - Loudness is -14 LUFS.
- `film.srt`: captions for the YouTube upload.
- `film.report.json`: counts, every clip with its licence page, and every warning (missing clips, voice too long, unresolved numbers).
- `film.TH-A.jpg`, `film.TH-B.jpg`, `film.TH-C.jpg`: the three S7 thumbnail briefs, for YouTube's Test & Compare. Each is 1280×720 and under 2 MB. The frame comes from the film's own footage (the scene the brief names, otherwise a different clip for each), graded, with the brief's words in large type.

Every shot and audio piece is cached in `--work` (default `.render/`) under a hash of what makes it, so a stopped render resumes and a changed scene re-renders only its own shots. `npm test` renders a 10-second film to check the whole path, and skips that check when ffmpeg is missing.
