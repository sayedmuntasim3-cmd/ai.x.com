# Road to #1: the plan the Boss session follows (21 Nov 2026)

The owner's target: the best long-form documentary tool in the world, polished down to the last detail,
the way the GTA team polished their games. Every step must end in something measured, not something claimed.

## Where we stand (verified 21 Nov 2026)
- The voiceover → video path works on production. Film 993f09ea ("Ramesh Babu - From Barber to
  Rolls-Royce", 39:46, 1080p) passed the release gate: 389 clips, 0 text cards, 0 black frames, no
  warnings. It took about 1h55m in total on one runner, of which the render was 1h07m.
- Merged speed work:
  - PR #34: transcription about 7x faster (batched base.en) and picture search about 3x faster.
  - PR #33: chunked parallel render (`render-chunked.yml`, `--part i/N`, `--join`, frame-exact).
- Quran: the reviewer taps each ayah end (PR #30). The Ad-Duha film d9302e8f is waiting for that tap.
- The idea → video path is parked. Film 70577b9b is waiting on the Gemini free quota, and its daily check
  is disabled.
- Visual library (PR #32) is live.

## The work, in order (voiceover first; one step = one fresh worker chat)
1. **Speed.** Wire `render-chunked.yml` into `voice-film.yml` (King's 5 is on this), then rerun 993f09ea.
   - Goal: a 40-minute voiceover becomes a film in 30 minutes or less, with real minutes reported per stage.
   - Then a 60-minute and an 80-minute file.
2. **Own voice and loudness.** The own-voice test was blocked at -15.3 LUFS. A one-time exact gain fix is
   on `claude/zupona-voiceover-system`, not yet tested; test it, then pass the own-voice film.
3. **Viral benchmark.** Use the YouTube Data API (key already on the Worker) for metadata only. Do not
   download anyone's videos.
   - Take the most-viewed long documentaries in our niches (history, biography, motivation, science; 10M+ views).
   - Record duration, title pattern, chapters, upload cadence and thumbnail style.
   - Turn the results into a written quality bar in `docs/VIRAL_BAR.md`: hook in the first 30 s, a visual
     change every 3–6 s, chapter rhythm, text on screen.
   - Turn the bar into checks the release gate measures.
4. **Picture meaning.** Rerank candidate pictures with a free open image-text model (CLIP class) on the
   GitHub runner, so each picture matches its sentence, not just a keyword.
   - Add free video clips (Pixabay video, NASA, Internet Archive), so the film is not stills only.
   - Never repeat a picture inside 10 minutes.
5. **Motion and effects.** Film 993f09ea had 0 transitions and 0 punch-ins. Add tasteful, genre-aware
   moments: transitions on chapter turns, parallax, maps, counters for numbers, lower thirds, and quote
   cards. Every one is checked frame by frame.
6. **YouTube package.** From the transcript, produce the title options, the description, chapters, tags,
   SRT captions, a thumbnail from the best frame with text, and 3 Shorts cut from the strongest moments.
7. **Creator control.**
   - A 720p draft in a few minutes before the full render.
   - Replace any scene's picture from the Library in one click, then re-render only that part.
   - A clear time-left estimate.
8. **Quran mode finished.** The reviewer tap flow end to end, a better free aligner measured on Ad-Duha, and
   the scholar's sign-off (the owner arranges the scholar).
9. Later: accounts and payment (1 credit = 1 finished minute), then idea → video again.

## How the Boss works (tokens are the owner's money)
- **One worker chat at a time** (two only when they touch different files). Each one is fresh and has a
  brief of 25 lines or fewer.
- **What every brief names:**
  - the files to touch,
  - the test that proves the step,
  - the stop condition,
  - "report to the Boss in 5 Bangla lines or fewer".
- **Ending a worker:** a worker stops after its one milestone. A new step gets a new chat, never an old
  long one: every turn of a long chat re-reads the whole chat.
- **Choosing the model:**
  - Mechanical work (wiring, tests, docs) can run on a cheaper model.
  - Hard judgement (motion design, quality bar) stays on the strongest model.
- **No polling.** Use one `send_later` check at the expected finish time. The Boss reads only workers'
  reports, never their full logs.
- **Merging and safety:**
  - Merge only through a PR, with CI green, the preview opened, and production checked after the merge.
  - Never force-push, reset or delete a branch.
  - Ask the owner on a real conflict.
- **GitHub minutes:** the repo is private, so the free Actions minutes are limited. A parallel render saves
  time, not minutes. Watch the monthly total.
- **Old chats:** King's 2, 3 and 4 are idle and their work is all on main or on
  `claude/zupona-voiceover-system`. Do not wake them.
