# The light studio: ten free films a day

`local/light-studio.mjs` makes a finished documentary from an idea card with no
account, no API key and no brain to pay for. It is the small, everyday path:
the full engine (`local/run-film.mjs`, 15 model stages) makes the films that
need research, a claim ledger and a critic; the light studio makes the day's
ten, and uses the same renderer, so both produce the same kind of MP4.

## One card, one film

A card is plain JSON. A scene carries its spoken line and the pictures to look
for; the pictures are search phrases for Wikimedia Commons, not file names.

```json
{
  "id": "antikythera-mechanism",
  "title": "The Machine That Predicted the Sky",
  "minutes": 3,
  "formatId": "history",
  "voicePreset": "historical",
  "scenes": [
    {
      "narration": "In nineteen oh one, a boat of sponge divers sheltered from a storm beside a small Greek island and found a wreck forty-five metres down.",
      "shots": ["Antikythera shipwreck", "sponge diving"],
      "anchor": "Antikythera, 1901"
    }
  ]
}
```

- **minutes is a wish, not a clock.** The film is as long as its narration at
  the channel's own rate (150 words a minute, `engine/src/versions.mjs`), so a
  three-minute film needs about 450 words. A card that asks for three minutes
  and writes one is told so, never padded or cut.
- **`anchor`** is the label a shot falls back to: when no free picture exists
  for a shot, the viewer sees a card with those words, never a blank frame.
- **`voicePreset`** is one of the narrator's presets (`historical`,
  `cinematic`, `science`, `nature`, `investigative`).
- **`beats`** are the designed moments — the difference between an edit and a
  slideshow. Each one is a wordless card with its own sound: `counter` (a number
  that runs up to the value written, e.g. `"30 bronze gears"`), `kinetic` (a line
  that rises in) or `quote` (a quotation that lands). `after` names the scene it
  follows.
- **`closing`** is the last line of the film, a card over black-free picture.
  `titleCard: false` drops the opening title card; `titleSeconds` /
  `closingSeconds` / a beat's `seconds` change how long a card holds.

## What it does for each card

1. **Run folder** — `film.json`, `s3-chapters.json`, `s5-C1.md` in the shape
   the engine already reads, with the clock derived from the words plus the
   seconds the designed cards hold, so the chapter passes
   `engine/src/scene-lines.mjs` on the first try (`script-check.json` holds that
   check). A title card opens the film and each scene can be followed by a
   designed beat, which is what makes the opening move and the critic count the
   film as edited.
2. **Pictures** — Wikimedia Commons, keyless. A picture is kept only when its
   own licence is public domain, CC0, plain CC BY or "no known restrictions";
   share-alike, non-commercial, no-derivatives and GFDL files are refused, and
   so are small frames, banners and page furniture (a paper's figure, a logo, a
   schematic). It must also be of the subject the phrase names, and it is
   measured for brightness before it is kept: a picture under 22/255 of mean
   luma (`MIN_PICTURE_LUMA`) is a hole in the film, not a night scene — a free
   deep-space photograph once held the screen as black for five seconds. No
   picture is used twice inside the film's repeat window. `CREDITS.md` lists
   every picture, its author, its licence and its file page.
3. **Voice** — the free Zupona Narrator (Kokoro-82M through kokoro-onnx), one
   take per scene, with word-level timings for the captions.
4. **Render** — `render/render-film.mjs`, the one renderer: stills move, sound
   design and the mix are synthesised, captions and the licence report come out
   beside the MP4.

## The day's ten

```bash
node local/light-studio.mjs --queue cards/queue.json --limit 10
```

The ledger `films/light-ledger.json` records every film that was really
rendered, so a queue of fifty ideas makes ten today and the rest tomorrow
(UTC). `--force` re-renders a film that already exists without touching the
cap. A failed film is written down as failed with its reason, and the queue
carries on.

## Setup (once, on the machine that renders)

```bash
# ffmpeg: any recent build
python3 -m venv ~/.venvs/kokoro && ~/.venvs/kokoro/bin/pip install kokoro-onnx soundfile
# the two model files (release model-files-v1.0 of kokoro-onnx) into ~/.cache/zupona/kokoro/
node local/light-studio.mjs --card cards/antikythera.json \
  --python ~/.venvs/kokoro/bin/python --models ~/.cache/zupona/kokoro
```

`render/narrate.mjs` checks both model files against their SHA-256 before use.

## What it does not do (honest gaps)

- **It does not write the words.** A card's narration is written by the owner
  or by a brain. With a free local brain (`BRAIN_URL`, `worker/brain.mjs`)
  cards can be produced in bulk; without one, ten cards are ten texts.
- **No claim ledger, no research, no critic-driven revision.** Those are the
  full engine's job. A light film states what its card says; nothing checks it.
- **No music.** Score and cues need the engine's music path; the light film has
  its synthesised sound design and its narration.
- **Pictures are stills, not footage.** Commons video is rare and often not
  free; a light film is built from photographs that move.
