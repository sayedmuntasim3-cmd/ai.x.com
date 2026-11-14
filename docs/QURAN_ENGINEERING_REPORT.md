# Quran recitation films: engineering report (14 Nov 2026)

Status words: **PASS** built and verified by running it; **FAIL** tested and failed; **PARTIAL** partly
built or partly verified; **NOT TESTED**. An automated pass is never a religious approval. No film is ready
to publish: none has had a qualified reviewer's sign-off. Details and numbers: `docs/QURAN_DOCUMENTARY.md`.

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
| A building (the Louvre), small hikers and plastic tree shelters reached runner films | looking at frames | image-text scores for walking figures, buildings, man-made things; title words | PARTIAL: hikers 3 of 3, buildings 1 of 2, man-made 2 of 3 caught; 0 of 22 clean landscapes refused (33 pictures) |
| No check of the rendered sound | directive | audio audit: length, sync offset, added silence, R128, true peak, clipping, balance | PASS (finds a cut-in silence at the right second) |

## 3. Still incomplete

| Item | Status |
|---|---|
| Jawad Farogi Ad-Duha (very slow, melodic, 20-37 s breaths) | FAIL: Tarteel base, Whisper large-v3-turbo and the CTC alignment all fail; the system asks instead of guessing |
| Real phone and mosque recordings | NOT TESTED (only code-made copies) |
| The owner's own recitation | NOT TESTED (not received) |
| Film from the website (upload → render) | NOT TESTED (needs a deploy: the owner's decision) |
| Pexels / Pixabay footage | NOT TESTED (no keys set; keyless archives only) |
| Retention and views | NOT MEASURABLE from outside; see `docs/QURAN_AUDIENCE_RESEARCH.md` |
| Religious review by a qualified person | NOT DONE for any film |

## 4. Remaining risks

- Picture choice from free archives is thin and judged from titles plus a small image-text model; a person
  must look at every scene (the review sheet says what the checks miss).
- Reused-content rules: films built on recordings other channels also post may not be monetised; the
  owner's own recitation is the safe base.
- The CLIP, orientation and people/building thresholds were set on small labelled sets (19, 18 and 33 pictures).

## 5. Next steps, in order

1. A qualified reviewer reads `docs/QURAN_REVIEW_SHEET.md` against one test film.
2. The owner's own recitation through the whole chain (it is the real test).
3. More labelled pictures for the visual checks (paintings, sideways, irrelevant), thresholds re-measured.
4. A Quran-specific aligner or recognizer for slow melodic recitation (the Ad-Duha case).
