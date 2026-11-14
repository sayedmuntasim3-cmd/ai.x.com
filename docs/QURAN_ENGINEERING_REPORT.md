# Quran recitation films: engineering report (14 Nov 2026)

Status words: **PASS** built and verified by running it; **FAIL** tested and failed; **PARTIAL** partly
built or partly verified; **NOT TESTED**. An automated pass is never a religious approval. No film is ready
to publish: none has had a qualified reviewer's sign-off. Details and numbers: `docs/QURAN_DOCUMENTARY.md`.

## 0. Architecture assessment (after the owner's platform brief, 14 Nov)

The pipeline already runs as separate stages: locate the recitation (Tanzil +
recognizer + CTC alignment), master the voice, meaning, shot list (director),
media search with checks, render (16:9, 4K, 9:16), automatic audits, review
and sign-off. These stages stay; the weaknesses were in how decisions were made
and what blocked a release. Ranked by severity:

| # | Weakness | Severity | Done in this pass |
|---|---|---|---|
| 1 | Picture choice was yes/no on two weak signals (title words, a small image-text model); nothing went to a person, so three wrong pictures reached films | critical | Three answers (refuse / doubtful / clean); a doubtful picture is used only when no clean one exists and its scene is WARNING; a title word alone no longer refuses; frame scores for people, buildings, man-made things |
| 2 | The visual thresholds rested on 33 pictures | critical | Runner job builds a larger scored pool; labels and precision/recall per category (see section 2) |
| 3 | A finished render with passing audits could look "done" | critical | `readyToPublish` returns PASS / WARNING / FAIL; every format judged; verse timing with fewer than half the ends confirmed is FAIL (Ad-Duha) |
| 4 | The recording's reciter and permission were never recorded | critical | Publishing needs reciter, source and permission written down |
| 5 | Slow melodic recitation (Ad-Duha) cannot be timed | high | Unchanged: still asks; now blocks release instead of only hiding the Arabic |
| 6 | Review only through a command line and JSON | high | `review.html`: real frames, ayah, picture, source, licence, checks, refusals, commands (en / bn) |
| 7 | The adhan was answered with a generic question | medium | Recognised as not Quran; its own message |
| 8 | Model loading per picture (~16 s each) made media search slow | medium | One detector process per film |
| 9 | Only keyless archives (mostly Commons photos, few videos): films look like slideshows | high | Not changed: Pexels / Pixabay need the owner's free keys; a verified archival-footage source is still to be found |
| 10 | No maps, manuscripts, calligraphy or explanatory graphics; no thumbnails | medium | Not started (P2) |
| 11 | The narration-documentary pipeline (`film-run.mjs`) and the Quran pipeline share little (timeline, QA, review) | medium | Not changed; the review status and page are written so the narration side can use them |

## 1. What already worked before this pass

| Part | Status | Evidence |
|---|---|---|
| Surah and ayah recognition (Tarteel base, Apache-2.0) on clean recitations | PASS | runner QA: Yusuf 1-40, Yunus 1-30 (al-Husary), Yusuf 1-111 (37 min): 97-100% of ayah ends within 0.2 s |
| A wrong or unclear recording ends in a question | PASS | every wrong surah questioned; the CC0 Ad-Duha and a translated Fatiha asked about |
| Phone and mosque copies (made in code) | PASS | 39/39 cuts in the true gap, 98-100% words heard; the same result twice |
| Verified Uthmani text, Amiri Quran font, credits | PASS | sha256 pinned; libass shaping checked by eye |
| Mastering (voice system) | PASS | -14 LUFS, pitch and timing proofs (earlier work) |

## 2. Problems found in this pass, and fixes

| Problem | How found | Fix | Status now |
|---|---|---|---|
| Dark cards in the films (runner Ad-Duha 67 of 141 s; Yusuf 9:16 111 of 177 s) | new pixel audit, timestamps | search ladder, Commons Quality images, no silent card, title over a real picture, dark/plain pictures refused | PASS on the runner (run 43530247405): Ad-Duha 1080p, 4K and Yusuf 9:16 all 100% coverage, no card, no empty or frozen stretch |
| A short video held on its last frame | frame table | a video must cover its shot (slowed at most to 2/3) | PASS (unit test; local film) |
| A misheard isti'adha became ayah 16:98 | runner QA | fuzzy isti'adha; cut-off fragments never taken as ayat | PASS (re-located from the runner's transcript) |
| Pause timing called 4 wrong ends "sure" on a recitation without gaps | new continuous test set | sure only when two methods agree; CTC alignment of the given text; alignment-first when pauses disagree; Arabic shown only where sure | PASS: 0 wrong sure ends; continuous Yusuf 0/39 → 34/39 cuts in the gap |
| An oil painting with figures reached a film | looking at frames | Commons categories; CLIP painting check (MIT) | PARTIAL: 9 of 10 paintings refused, 0 of 9 photos |
| A sideways video reached a film | looking at frames | sky-side check | PARTIAL: 5 of 9 turned landscapes caught, 0 of 9 upright refused, the real case caught |
| Irrelevant pictures (a city, fog, plastic tubes) | looking at frames | CLIP relevance against rooms, cities, people, text, vehicles, objects | PARTIAL: 3 of 3 bad caught, 0 of 7 good refused (small set); plastic tubes not caught |
| A building (the Louvre), small hikers and plastic tree shelters reached runner films | looking at frames | image-text scores for walking figures, buildings, man-made things; title words | PARTIAL: on 186 labelled pictures, problem pictures passing silently 39 → 13, clean photos refused 6 → 3 (held-out half: buildings 0.83, man-made 0.81, people 0.86 recall, 0 of 31 clean flagged); labels not yet checked by a person |
| No check of the rendered sound | directive | audio audit: length, sync offset, added silence, R128, true peak, clipping, balance | PASS (finds a cut-in silence at the right second) |

## 3. Still incomplete

| Item | Status |
|---|---|
| Jawad Farogi Ad-Duha (very slow, melodic, 20-37 s breaths) | FAIL: no ayah end confirmed; the publish decision is now FAIL for it (verse timing not verified), never a guess |
| Recognized recordings are not cross-checked by the aligner (al-Mulk 67:6: one end unconfirmed, its Arabic hidden) | NOT DONE: needs a third-method rule measured on the known-time sets |
| The owner's samples | PARTIAL: four recitations recognized (al-Mulk 67:1-7, 67:4-9, Ayat al-Kursi twice), the adhan refused as not Quran; the sound shows a second-hand source; reciter and permission unknown |
| Real phone and mosque recordings (direct) | NOT TESTED |
| Film from the website (upload → render) | NOT TESTED (needs a deploy: the owner's decision) |
| Pexels / Pixabay footage | NOT TESTED (no keys set; free keys are the owner's decision) |
| Visual labels checked by a person | NOT DONE (186 pictures labelled by the assistant) |
| Small litter, distant huts and villages | PARTIAL: still pass silently on the validation set |
| Maps, manuscripts, calligraphy, thumbnails | NOT STARTED (P2) |
| Religious review by a qualified person | NOT DONE for any film |

## 4. Remaining risks

- Free archives are thin: picture choice repeats familiar landscapes, and videos are few. A person must
  look at every scene (`review.html`).
- Reused-content rules: films built on recordings other channels also post may not be monetised; the
  owner's own, permitted recording is the safe base.
- The visual thresholds were fitted on one labelled set of 186 pictures (half held out); the labels are the
  assistant's. A fresh set and a person's labels should confirm them.

## 5. Release-readiness decision

**Not ready to publish. No film is.** Every test film is WARNING or FAIL by the system's own decision:
no qualified reviewer has signed, no recording has its reciter, source and permission recorded, and the
Ad-Duha timing is unverified (FAIL). What is verified: the technical chain (coverage, sound, sync,
loudness, formats 16:9 / 4K / 9:16) on the runner and on the owner's sample, and that the pictures found
wrong by eye no longer reach the films (runner run 43562077892, frames inspected).

## 6. Next steps, in order

1. A qualified reviewer reads `review.html` and `docs/QURAN_REVIEW_SHEET.md` for one test film.
2. The owner's own recitation, recorded directly (not through a speaker), with the reciter's written
   permission, through the whole chain.
3. A person checks the 186 labels; a fresh picture set confirms the thresholds.
4. A third-method rule for recognized recordings (recognizer, pauses, aligner), measured on known times.
5. A Quran-specific aligner or recognizer for slow melodic recitation (the Ad-Duha case).
