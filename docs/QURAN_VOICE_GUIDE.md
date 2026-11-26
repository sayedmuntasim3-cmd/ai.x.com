# Recitation sound and film editing: how to reach a professional standard (14 Nov 2026)

The owner's goal: the recitation should sound as good as the best Quran channels, and the films should be
edited to a top documentary standard. This page says what makes that sound, what the studio already does,
what it must not do, and what the reciter must do when recording. Nothing here is a measured view count.
"Professional" below means common practice in studio voice work, not a claim about any one channel.

## 1. Where the sound of the best recitation videos comes from

In order of how much each matters:

1. **The recording itself (most of the result).** A close microphone in a quiet room. The voice's full
   range is present, up to about 16-20 kHz, with no room echo and no noise. Nothing done later can put back
   what the microphone never caught.
2. **A beautiful hall reverb.** This is the smooth tail people call "echo": decay of about 1.5-3 s, mixed
   well under the voice. It is a space, not a repeat.
3. **Gentle tone and dynamics.** Low rumble cut, boxiness reduced, clarity lifted a little, harsh "s"
   sounds softened. The voice is evened out without squashing the sustained notes.
4. **The right loudness:** about -14 LUFS, true peak under -1 dBTP, the same from the first ayah to the last.

The studio's mastering engine (`docs/VOICE_SYSTEM.md`) already does 2-4, measured on every file:
- shallow denoise, so no letter is smeared;
- EQ toward a target voice curve, and a de-esser;
- three gentle dynamics stages;
- synthesised mosque-hall and grand-hall reverbs that follow the pauses;
- loudness set to -14 LUFS;
- proofs that pitch and timing did not change (median pitch difference 0.21 cents on the friend's sample).

These are what video editors do by hand in CapCut and similar editors. Here they are automatic and
measured.

## 2. What the friend's samples showed (14 Nov, phone, AAC)

| Measured | Value | What it means |
|---|---|---|
| Noise under the voice | 33 dB (al-Mulk 67:1-7) | acceptable; reduced by up to 6 dB |
| Highs against the target | 7.2 dB too dull | the engine lifts them gently (+1.6 dB at 6.5 kHz) |
| Voice energy | ends near 5 kHz; 5-9 kHz is 35-40 dB down | the main limit: the clarity and "air" of studio recitation live there |
| Room already in the file | about 0.66 s decay | the added hall is lowered 2.2 dB so it does not pile up |
| The adhan file | digital silence between phrases | a processed or second-hand source |

The listening pack (original, clean, mosque-hall, grand-hall) from this sample is in the session's files.
All three masters measure -14 LUFS and -1.4 dBTP, with pitch and timing kept. They sound cleaner and
fuller than the original, but they cannot sound like a studio recitation. The missing high frequencies
are not in the file.

## 3. What is never done to a recitation (owner rule, 13 Nov 2026)

These are in `NEVER_DONE_TO_A_VOICE`, held in code:
- no change of pitch, formant or speed;
- no auto-tune and no re-synthesis;
- no generative "AI enhancer" that invents missing sound;
- no discrete echo or delay that repeats syllables;
- nothing laid under the recitation: no music, drone or effects.

An enhancer that invents the missing 5-20 kHz would make these files brighter. But it creates sound the
reciter did not make, and it can smear tajweed details. It stays off unless the owner and a scholar
decide otherwise after listening.

## 4. How the reciter should record (the step that matters most)

- **Room:** quiet and soft: carpets, curtains, a wardrobe of clothes, or a corner hung with blankets. Fans
  and AC off, phone on airplane mode, at a quiet hour. Not a bathroom or an empty tiled room: their echo
  cannot be removed later.
- **Distance:** 15-30 cm from the mouth, a little to the side of the line of breath (fewer pops). Keep the
  same distance for the whole recitation.
- **Microphone, best to good:**
  - a large-diaphragm condenser in a treated room;
  - a dynamic broadcast microphone in an ordinary room (it hears less of the room);
  - a lavalier clipped 15-20 cm below the chin;
  - the phone itself, close, never a speaker playing another recording.
  Check current prices before buying; any of these is far better than a phone held at arm's length.
- **Settings:** WAV, 48 kHz, 24-bit if the recorder allows it, otherwise the highest-quality setting. Turn
  off the phone's noise suppression and automatic gain if the app allows it (a "raw" or "unprocessed" mode).
- **Level:** the loudest notes should peak around -10 to -6 dBFS. Never let the meter reach the top: a
  clipped peak cannot be repaired.
- **Takes:** one passage per take; leave 3 s of silence at the start (the engine measures the room noise
  there). Repeat an ayah from its beginning if a mistake happens; the editor removes the wrong take, never
  part of a word.
- **Rights:** for each recording write down the reciter's name, where and when it was recorded, and the
  written permission to publish, commercial use included:
  `node local/quran-review.mjs --run <folder> --rights --by "Name" --reciter "..." --source "..." --permission "..."`.

## 5. Editing the picture for recitation films

What suits a recitation film, and what the renderer already does:

| Element | Use | Avoid |
|---|---|---|
| Pictures | real nature that serves the ayah's meaning (sky, sea, mountains, rain, earth); the Hereafter only as a symbol | buildings, crowds, faces, paintings, beautiful-but-unrelated pictures |
| Motion | slow push-in or drift, a few percent over a shot | fast zooms, shakes, spins, 3D flips |
| Cuts | only at ayah ends or measured pauses, slow dissolves (1-1.5 s) | cuts inside a word or a held note, flashy transitions |
| Text | the exact Uthmani Arabic (Tanzil), large enough for a phone, shown only while that ayah is surely recited; the ayah number ﴿n﴾ | text that runs ahead of the voice, guessed ayah ends |
| Colour | one calm grade for the whole film | heavy filters, colour flashes |
| Sound | the recitation only | music, whooshes, risers, effects |
| Animation | none in recitation films; a gentle fade for the title | animated particles, light leaks, glitch effects |

Documentary films (with narration) may later add the following, each with a recorded source. None is
built yet; they are P2.
- verified maps with a slow line drawn on them;
- manuscripts and calligraphy;
- simple explanatory graphics.

## 6. English narration for documentaries (the US audience)

The narration profile is close, warm and nearly dry. That is what top documentaries use.
- A US-English narrator recorded the same way as section 4, with a dynamic or condenser microphone.
- Calm pace, about 140-160 words a minute.
- No reverb beyond a touch of room.
- Paid voice services (ElevenLabs and others) are not used without the owner's decision.

## 7. Next steps for the sound

1. The friend records one passage following section 4. Then the same chain is run and measured against
   this phone sample (noise, highs against the target, voice band, room).
2. The owner listens to the listening pack and chooses the space: clean, mosque-hall or grand-hall.
   Until then the default for an own recording stays mosque-hall.
3. Only if the owner and a scholar ask for it: try a bandwidth-extension model as an opt-in, with the
   pitch and timing proofs. Off by default.
