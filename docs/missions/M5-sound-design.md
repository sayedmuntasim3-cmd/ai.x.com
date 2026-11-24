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
- [x] Ducking at least 8 dB under the voice, final -14 ±1 LUFS, true peak ≤ -1 dBTP. Test the one-pass
      exact gain fix already on main for the own-voice case (-15.3 LUFS before).
- [ ] Pass the own-voice test film through the release gate.

## Gate
On the 3-minute slice, every designed moment has a cue, the loudness targets are met, and the owner hears
no clash. The own-voice film passes.

## Found for others
- The owner's film (24 Nov 2026): the master is mono 48 kHz, -14.4 LUFS, true peak -1.4 dBTP, LRA 1.9 LU — on
  the loudness target but completely flat, so no reveal has a silence or a lift under it. The cause of the mono
  is here: render-film.mjs pans every bed and one-shot to mono (`pan=mono|c0=c0`), the scene pieces are written
  `-ac 1`, the silent fillers are `anullsrc=...:cl=mono`, and the mix ends without a channel layout. A stereo
  mix means changing that whole path once, not one filter.

## Log
- 2026-11-24: the sound path is stereo and planned, not one flat lane. The whole chain now keeps two channels: music
  pieces are written stereo, ambience and effects are placed between the speakers (whoosh left, click right, glitch
  far right, impact and boom centred), and the master is encoded `-ac 2`. The music is planned by `render/mix.mjs`:
  it ducks 10.5 dB under every spoken piece (a ramp, 0.12 s down, 0.28 s back) and leaves completely for the breath
  before a chapter's riser and a flash's boom ("curtains"), so a reveal lands in a hole instead of on a wall. The
  report now carries `mix: { stereo, channels, duckDb, curtains }`. Measured on a rendered 24 s test (6 scenes, music,
  chapter turn): 2 channels at 48 kHz, duck -10.5 dB, 1 curtain, the music gone 1.5 s before the cut (-42.8 dB mean
  against -21.6 dB under the riser), no clipping. The loudness range on that synthetic take is 2.5 LU: the score there
  is one held tone, so it proves the path, not the dynamics; the critic now stops a real film below 2.0 LU.
