# YouTube watch study (28 Nov 2026)

Tags: **[M]** measured by code from public metadata in this repo (chapter timestamps, lengths) · **[R]** read from a cited file · **[E]** estimate or opinion.

## 0. What was done, and what was NOT (read first)

- **0 films were looked inside.** The job was to watch 40 winning films (shot length, words per minute, first 30 s, graphics share, ending). That was **blocked**:
  - `youtube.com/watch` answers this container with HTTP 429 and a Google CAPTCHA redirect (automated access is refused).
  - Storyboard sprites (`i.ytimg.com/sb/...`): HTTP 403. The URL needs a signature that only the blocked player response carries.
  - Captions (`/api/timedtext`): HTTP 200 with an empty body.
  - `oembed`: works, but only gives title and channel (no new information).
  - Third-party mirrors and the app player API were NOT tried: they would get around YouTube's refusal, and the session's auto-mode declined the attempt. Raw log: `data/youtube-watch-2026-11-28.json`.
- So **no wpm, shot-length, hook-word, graphics-share or ending number below comes from inside a winning film.** Those targets are `plan` or `estimate` and are tagged so in `engine/src/reference-bar.mjs` (`PRACTICE_TARGETS`).
- What I could measure honestly: chapter timestamps and lengths that the 2,734-video reference file already carries (section 1).
- To finish the watch job someone needs a route YouTube allows: the owner's own computer or browser (he can export captions and storyboards from there), or the official YouTube Data API `captions` route with his key (owner choice; it costs quota, not money).

## 1. Measured from public metadata [M]

Source: `data/engineering-reference-videos.json`, English-looking titles with 1M+ views; chapter numbers use the 172 of them that list 3+ chapters.

| What | Number |
|---|---|
| 1M+ English films, length (10th / 25th / **median** / 75th / 90th percentile) | 10.8 / 13.1 / **17.8** / 26.7 / 42.9 min (891 films) |
| Same, radar set `first-video-search-2026-11-28.json` | median **21.1** min (162 films) |
| Chapters per film (median, 25th-75th) | **9** (7-13) |
| Minutes per chapter (median, 25th-75th) | **2.6** (1.6-4.1) |
| Gap between chapter turns (median, 25th-75th) | **101 s** (60-193 s) |
| Second chapter starts at (median, 25th-75th) | **69 s** (49-110 s) |
| Description opens with a sponsor or promo code | 33% of the 1M+ films |
| Practical Engineering 1M+ films, median length | 15.7 min |
| Real Engineering | 19.7 min · ColdFusion 22.4 min · Plainly Difficult 24.9 min (4 films) |

Reading: winners turn the chapter about every 2.6 minutes, and the first turn comes inside the first 70 s. The earlier bar said "at least every 4 minutes"; that is the loose end (75th percentile), not the typical film. Storified, Documentary Overload and Super Transports are not in the reference file with 1M+ rows.

## 2. Rules now in code

`PRACTICE_TARGETS` and `PRACTICE_SCORECARD` in `engine/src/reference-bar.mjs`:

| Target | Number | Source |
|---|---|---|
| Length (first film) | 14-16 min | plan §5; winners' IQR is 13-27 min [M] |
| Narration | 140-165 words a minute | estimate |
| Title promise + first sourced number | before 0:30 | bar rule 3, plan point 1 |
| First question | by 3:00 | plan point 12 |
| Seconds per shot | 3-7 average, none over 6 s in the first 3 min | estimate; bar rule 1 |
| New fact, number or question | every 20 s at most (30 s fails) | plan point 8 |
| First map or diagram | by 1:30; one per chapter | bar rule 2, plan point 6 |
| Graphics share of shots | 10-30% | estimate |
| Reveal | at 50-70% of the length | plan point 12 |
| First chapter turn / typical chapter | by 70 s / 2.6 min (never over 4) | **measured** |
| Ending | last 30 s answers the title, names 3 sources | bar rule 9 |

Wired (all through `barBrief()`, advisory, no gate lowered):
- Idea → video script and every stage: `filmBrief()` in `engine/src/film-run.mjs` (non-story films).
- Voice film script: `systemPrompt()` in `render/daily-script.mjs` (the daily script writer; `render/daily-voice.mjs` only reads it aloud and has no prompt).
- Voice film shots: `VOICE_VISUALS_SYSTEM` in `engine/src/voice-visuals.mjs`, and `DIRECTOR_SYSTEM` in `engine/src/shot-plan.mjs`.
- Critic: `critique()` in `render/critic.mjs` returns `advisory` notes (never in `findings`, never in the verdict) and `reportCritic()` prints them; measures come from `practiceMeasures()`, checks from `practiceCheck()`.

## 3. Gap list: our newest done voice film vs the bar

Film: `e0b87efb-2b5d-4ed0-ae34-a318efce5bb5` (`GET /api/voice`, created 28 Nov 00:50 UTC). It is a **37.8 s sample** (`voice-A-kokoro-narrator.mp3`, no topic), the only finished film with a report; the newer Apollo 11 runs are failed or still running. Numbers are from its `report`: 12 shots (10 clips, 2 cards), 6 scenes, 0 transitions, 0 designed shots, 0 depth shots. The report carries no timeline or narration text, so wpm, hook words, first number, ending and description are **unknown**, not passed.

| # | Gap | Evidence | File that must change |
|---|---|---|---|
| 1 | No full-length film exists: the newest done film is 0.6 min against a 14-16 min target | `film.seconds 37.8`; Apollo 11 runs `failed` / `running` | the voice job path: `render/voice-runner.mjs`, `worker/voice-api.mjs` (find why full runs fail) |
| 2 | Designed graphics render as plain text cards: "Playwright is not installed" | report `warnings[1]` | `.github/workflows/render-film.yml` (install Chromium for the render job) |
| 3 | No map or diagram at all (first graphic: none; target by 1:30) | `designedShots 0`, `depthShots 0` | `engine/src/voice-visuals.mjs`, `engine/src/voice-moments.mjs` |
| 4 | The report does not carry the timeline or narration, so the new advisory checks read "unknown" for wpm, first number, first question | report keys | `render/voice-runner.mjs` (write the timeline into `report`) |
| 5 | Flat edit: 0 transitions, 2 punch-ins, no turn markers | `stats.transitions 0`, `edit.punchIns 2` | `engine/src/edit-director.mjs`, `engine/src/shot-plan.mjs` |
| 6 | Sound: 2 hits moved off a spoken word; ambience is synthesised room tone | `warnings[0]`, `warnings[2]` | `render/sound-kit.mjs`, `render/mix.mjs` |
| 7 | No topic on the upload, so there is no title promise to check against the first 30 s | `topic ""` | `worker/voice-api.mjs` (require a topic), `public/app.js` upload sheet (look unchanged) |
| 8 | No chapters: 6 scenes, no turn by 70 s, none every 2.6 min | `stats.scenes 6` | `engine/src/voice-visuals.mjs` (chapter plan), `render/critic.mjs` |
| 9 | No release evidence stored (`release: null`) and no sources line for the ending or description | `release null` | `render/release-gate.mjs`, `worker/voice-api.mjs` |
| 10 | No measured numbers inside winning films yet: wpm, shot length and hook targets stay estimates | section 0 | owner's computer or the official captions route, then update `PRACTICE_TARGETS` |

Average shot 37.8 / 12 = 3.15 s (inside the 3-7 s target) and graphics share 2/12 = 17% (inside 10-30%), but the two graphics are plain text cards (gap 2), so they do not count as passes in spirit.
