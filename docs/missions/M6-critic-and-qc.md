# M6: Critic and quality gates (a film passes only when it is good, not just complete)
Goal: measure every gate in TRANSFORMATION.md §4, send weak shots back, and run the test-slice loop until
the owner says "pass".
Owns: render/release-gate.mjs, render/critic.mjs (new), contact sheets, and docs/research/TEST_SLICE_LOG.md (new).
Must not touch: other missions' files. Send weak-shot reports back through the Boss.

## Checklist
- [ ] Automatic measures: moving share, still share, blurred-copy count, shot lengths, designed moments per
      minute, OpenCLIP relevance per shot (M3's scores), repeats, resolution, first-30 s beats, sound cues
      on moments, loudness and true peak, and black, frozen or flickering frames.
- [ ] A contact sheet per chapter (1 frame per shot, with the shot TYPE and score).
- [ ] Weak shots are returned to M3 (re-pick) or M4 (re-make), at most twice, and the reason is logged.
- [ ] The release gate fails a film that misses the gates, with a clear en+bn reason.
- [ ] The test-slice loop: render 0:00-3:00 of 993f09ea, measure it, and send the owner before/after frames
      plus the measured comparison with M1's reference standard. Iterate internally until the Boss judges it
      world-class; the owner sees it only then. Then render the full 40 minutes.

## Gate
The Boss's written verdict on the 3-minute slice is "pass" (hook, rhythm, visuals, sound against the
reference standard), and every measurable gate holds. Then the full film
passes the same gates.

## Found for others
- The gate in item 1 would have caught the owner's 3-minute film on four counts at once (measured below). Nothing
  in this mission is built yet, so that film was cleared by the release gate alone, which measures length, black
  picture and loudness, not relevance, rhythm or design.
- M3: the footage is off-place and off-subject for a whole film (Vidhana Soudha, a Mexican beach van, a London
  street, salon chairs, a Spanish handwritten letter, candles) for a Bengaluru story; the eyes' relevance score
  needs to reach the render as a gate, not only as a `why` field.
- M4: two cards in the film were cut off and one frame was black except for thin colour slivers; that is a card
  drawn with no usable face, not a design decision.
- M5: mono 48 kHz, integrated -14.4 LUFS but LRA 1.9 LU: on target and completely flat, so no reveal has a
  silence or a lift under it.

## Log
- 2026-11-24: measured the owner's own 3-minute film (files/test-film-3min-720p.mp4) with ffmpeg, not by eye:
  1280x720, 30 fps, 3:00; cuts at 0, 1.9, 4.5, 7.7, 10.9, 13.8, 16.3, 18.9, 22.1, 25 s (2.5-2.9 s a shot, a
  stock montage rhythm), then a burst of cuts at 27-28 s; no black or frozen stretch over the thresholds; audio
  mono, -14.4 LUFS, -1.4 dBTP, LRA 1.9 LU. Sixteen frames across the film were read: the story is Bengaluru and
  the pictures are Bengaluru's Vidhana Soudha, a beach van, a London street, a temple street with traffic, salon
  chairs, hands on notebooks, a matchstick, candles, a Spanish letter; the cards read "2025: ..." cut off, a
  bare "2010 / 2011" list, and a clipped "20". The two mechanical causes (no browser for the designed graphics, no
  font on the render machine) are fixed under M4; the measured gate itself is still to be built.
