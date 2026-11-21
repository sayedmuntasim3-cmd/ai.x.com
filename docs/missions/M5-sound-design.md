# M5: Sound design as part of the cut
Goal: reveals feel powerful through the sound as well, with a deliberate rhythm, music that follows the
story, and clean voice.
Owns: render/score-synth.mjs, render/sfx-synth.mjs, engine/src/score-plan.mjs, engine/src/voice-plan.mjs
(ducking), and the audio mix functions in render/render-film.mjs (audio only).
Must not touch: the visual composition (M4), and the chunk and join logic (King's 5: audio is mixed once
over the whole film; keep it that way).

## Checklist
- [ ] Music cues follow M2's beats and emotions. Use the free score, plus free CC0/Pixabay music where it
      is better; licence recorded.
- [ ] Sound cues on transitions and designed moments (whoosh, hit, riser, paper, map pin), from free CC0
      sources or synthesised, and never on top of a spoken word's peak.
- [ ] Ambience by location and scene type. Use silence on purpose before big reveals.
- [ ] Ducking at least 8 dB under the voice, final -14 ±1 LUFS, true peak ≤ -1 dBTP. Test the one-pass
      exact gain fix already on main for the own-voice case (-15.3 LUFS before).
- [ ] Pass the own-voice test film through the release gate.

## Gate
On the 3-minute slice, every designed moment has a cue, the loudness targets are met, and the owner hears
no clash. The own-voice film passes.

## Found for others

## Log
