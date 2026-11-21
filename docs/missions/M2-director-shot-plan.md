# M2: Director pass and shot plan for voiceover films (connect the 151-role roster)
Goal: every voiceover film is planned as a film. There is a beat sheet, then a code-checked shot plan, and
the roster's Visual Director, Asset Search Strategist, Pacing and Edit Director roles finally run.
Owns: engine/src/voice-visuals.mjs, engine/src/shot-plan.mjs (new), the planning part of
local/voice-film.mjs, engine/src/messages.mjs (en+bn), and engine/src/agent-roster.mjs ROLE_STATUS lines
for roles you make live.
Must not touch: render/, .github/workflows/ (M3, M4, M5 and King's 5 own them).

## Checklist
- [x] Add a `--slice a-b` option to local/voice-film.mjs (for example 0:00-3:00). The whole pipeline runs on
      that slice only; it is the test bench for all missions.
- [x] Pass the free brain into planVoiceVisuals: Groq first, then the Gemini pool, one batch per chapter,
      within quota. Use canSee/canSearch; never assume Claude.
- [x] Director pass: a beat sheet per chapter (the viewer goal, the emotion, the reveals, the genre's visual
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
- Node's fetch ignores HTTPS_PROXY: in a cloud container Groq/Gemini answer 401 unless NODE_USE_ENV_PROXY=1 (not needed on the owner's machine or a plain runner).

## Log
- 2026-11-21: `--slice a-b` in local/voice-film.mjs (cutSlice → slice.wav + slice.json; a --transcript is cut and moved to 0; refused with --script). Proof: 3 new tests in local/voice-film.test.mjs; a 20 s file sliced 0:05-0:15 ran intake→words→understanding→pictures (20 of 40 words, 0-9.9 s). Full checks green.
- 2026-11-21: PR #41 merged (CI green, preview / and /studio/ 200, production /api/health ok). Free brain: local/voice-film.mjs voiceBrain (Groq, then the Gemini pool; BRAIN=claude refused), planVoiceVisuals brainBatches (whole sections per batch, ≤14k chars; a 429 day-over stops calls, rest from words). Proof: real Groq run on the Gettysburg fixture, 1/1 batch planned, words intact; 3 new tests; full checks green.
- 2026-11-21: Director pass (engine/src/shot-plan.mjs planBeats → beats.json in local/voice-film.mjs): the world from the voice (country, city, era, money, people), genre and visual language, beats with goal, emotion, reveal, rung, visual, place, era and people; free brain in section batches (stops at 429), else from the words; code tiles the scenes, keeps the voice's words and times, and repairs generic, foreign-place, dollar and unplaced-people beats; the world goes into the picture brief (Boss's judgement). Proof: 5 tests in engine/test/shot-plan.test.mjs (a Bengaluru/rupee story: India, Bengaluru, rupees, Indian, 1970s–1990s; a bad brain's Amazon/abstract/$ beats found and repaired to 0). Roles: Visual Director, Emotional Arc. Not yet run on the real 993f09ea slice.
