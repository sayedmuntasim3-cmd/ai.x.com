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
      plus a side-by-side with a reference recording (M1). Iterate until the owner's verdict is "pass", then
      render the full 40 minutes.

## Gate
The owner's verdict on the 3-minute slice is "pass", and every measurable gate holds. Then the full film
passes the same gates.

## Found for others

## Log
