# M2: Director pass and shot plan for voiceover films (connect the 151-role roster)
Goal: every voiceover film is planned as a film. There is a beat sheet, then a code-checked shot plan, and
the roster's Visual Director, Asset Search Strategist, Pacing and Edit Director roles finally run.
Owns: engine/src/voice-visuals.mjs, engine/src/shot-plan.mjs (new), the planning part of
local/voice-film.mjs, engine/src/messages.mjs (en+bn), and engine/src/agent-roster.mjs ROLE_STATUS lines
for roles you make live.
Must not touch: render/, .github/workflows/ (M3, M4, M5 and King's 5 own them).

## Checklist
- [ ] Add a `--slice a-b` option to local/voice-film.mjs (for example 0:00-3:00). The whole pipeline runs on
      that slice only; it is the test bench for all missions.
- [ ] Pass the free brain into planVoiceVisuals: Groq first, then the Gemini pool, one batch per chapter,
      within quota. Use canSee/canSearch; never assume Claude.
- [ ] Director pass: a beat sheet per chapter (the viewer goal, the emotion, the reveals, the genre's visual
      language), stored as beats.json.
- [ ] Shot plan, with TYPE from TRANSFORMATION.md §3.3. Its fields are subject, era, place, move, duration
      and sound cue, plus the existing FX-/TRANS fields the renderer reads (check render-film.mjs with grep).
      Code checks the vocabulary and the genre rhythm and restores the voice's words and times.
- [ ] Run the existing Edit Director stage on voiceover chapters.
- [ ] A hook score for the first 30 s, shown to the creator, in messages.mjs.
- [ ] Update ROLE_STATUS honestly for each role that now runs on voiceover.

## Gate
On the 0:00-3:00 slice of 993f09ea, the plan has at least 6 visual beats in the first 30 s, at least 4
designed moments, every shot typed, and 0 code-check failures. Unit tests are added, and the full checks
are green.

## Found for others

## Log
