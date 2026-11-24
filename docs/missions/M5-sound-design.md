# M5: Sound design as part of the cut
Goal: reveals feel powerful through the sound as well, with a deliberate rhythm, music that follows the
story, and clean voice.
Owns: render/score-synth.mjs, render/sfx-synth.mjs, engine/src/score-plan.mjs, engine/src/voice-plan.mjs
(ducking), and the audio mix functions in render/render-film.mjs (audio only).
Must not touch: the visual composition (M4), and the chunk and join logic (King's 5: audio is mixed once
over the whole film; keep it that way).

## Checklist
- [x] Music cues follow M2's beats and emotions. Use the free score, plus free CC0/Pixabay music where it
      is better; licence recorded.
- [x] Sound cues on transitions and designed moments (whoosh, hit, riser, paper, map pin), from free CC0
      sources or synthesised, and never on top of a spoken word's peak.
- [x] Ambience by location and scene type. Use silence on purpose before big reveals.
- [x] Ducking at least 8 dB under the voice, final -14 ±1 LUFS, true peak ≤ -1 dBTP. Test the one-pass
      exact gain fix already on main for the own-voice case (-15.3 LUFS before).
- [ ] Pass the own-voice test film through the release gate. (Blocked: no take and no speech engine here — see the log, 24 Nov.)

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
- 2026-11-24: the sound now knows where the words are. Every one-shot is checked against the captions' own word
  times (`keepOffSpeech` in engine/src/timeline.mjs): a hit whose attack starts on a vowel moves into the release
  after that word (or, for a whoosh or a glitch, a beat earlier into its cut), and is left out when neither place is
  free — a masked word is worse than no sound. A riser is exempt: its climax is the cut. The timeline returns
  `sound: { moved, dropped }` and notes each move, so the report says what happened instead of hiding it. Measured in
  the tests: a hit at 1.6 s inside "kept" moves to 1.73 s, a boom inside "shop" to 2.83 s, a second hit with no
  release left is dropped. Two existing expectations changed with it (a glitch now leads its cut by 0.15 s, the
  counter's impact can sit up to 1 s off its card) because the old ones asked for the very overlap this fixes.
- 2026-11-24: ambience by location, and a held breath before a reveal. A scene whose SFX field names no bed takes
  one from its own shots (engine/src/timeline.mjs `ambienceFor`: hall for a courtroom, crowd for a festival,
  street for a road or a harbour, wind for open water or a hill, room for an interior), synthesised by
  render/sfx-synth.mjs as `AUTO-AMB-*` loops; a bed the script wrote always wins, and a picture that names no
  place gets nothing. Before a flash's boom the ambience empties for 0.9 s (`breathWindows`, applied in
  render/render-film.mjs through `quietExpression`), so the reveal arrives out of silence rather than on a wall.
- 2026-11-24: the score is measured against the cut. `scoreReport` (render/mix.mjs) counts the cues, the share of
  the film they cover and, for each chapter turn, whether it is marked by a new cue or by a riser landing on it;
  the report carries `score` and warns for every turn the music ignores. The free score's licence is recorded in
  `score-kit.json` per run: "original — synthesised by render/score-synth.mjs from the cue's own brief", so nothing
  third-party is used and nothing is left to credit. A film whose score never changes across chapters is now visible
  in the report instead of being a matter of taste.
- 2026-11-24: the own-voice film is still not gated. There is no take to render it from (no recording in the
  workspace, and no speech engine: espeak/piper are not installed here), and the owner's 3-minute film cannot stand
  in — it was mastered mono at 1.9 LU of loudness range, which the M6 critic blocks by design, and it has no
  timeline to measure its shots against. What is proven instead: the one-track voice path renders sample for
  sample (render/render.test.mjs), and the gate refuses a flat, mono master (render/release-gate.test.mjs). The
  item stays open until an owner take exists.
- 2026-11-24: a cut of the film could come out longer than its brief (a 20 s Short measured 25 s: the video stream
  kept encoding past the read window while the audio stopped). render/cuts.mjs now sets the length on the output
  side too; the pipeline test that catches it passes again.
