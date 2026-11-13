# Quran recitation documentary: direction, rules, plan

Source of truth for this phase (System B, Quran path). The owner's full text is in
`docs/QURAN_DIRECTION_OWNER.md` (read it once). What already exists: `docs/VOICE_SYSTEM.md`.

## What the owner wants (13 Nov 2026)

- Upload a recitation recorded anywhere; the system finds the surah and ayat, understands their
  verified meaning, plans pictures that follow that meaning, and renders a complete cinematic film
  locked to the recitation. Not a slideshow.
- **No translation on screen by default** (owner, 13 Nov: the recitation plays over documentary
  pictures; Bangla or English meaning is not needed). Translation subtitles stay an option.
- Audience: Muslim-majority countries first. Judge each default by what serves a YouTube viewer there.
- The voice must come out far better than it went in (the mastering engine, built), with words,
  tajweed and timing untouched.
- Studio page with two tabs, like the reference he showed (a product called Editron on kutly.io; seen
  in his screenshots only, the site could not be opened from the cloud box): **Idea** (prompt, script,
  film: System A) and **Voiceover** (drop an audio file, film built on it: System B). The reference's
  Voiceover tab: a drop zone ("Drop your narration here, or choose a file", MP3 / M4A / WAV, 8 to 31 min,
  max 100 MB), length "Based on your audio", a look picker, a music picker (None), toggles for
  thumbnails and subtitles, saved presets, the cost shown before starting. Its result page: player,
  length, script, title and description with copy buttons, "Download MP4", recent projects.
- This phase is Quran only. The US English documentary is not touched.
- Quality is shown by measurement and by the owner's eye and ear. Nothing is called "number one";
  nothing untested is called done.

## Rules (religious accuracy before cinema, meaning before beauty)

1. Never guess: no invented ayah identification, translation, interpretation or history. Low
   confidence means the user is asked for the surah and ayah range; nothing is filled in.
2. Arabic on screen is verbatim from the verified text (Tanzil, licence header kept), typeset by code
   with a font whose licence is recorded; never drawn by an image model.
3. Never shown: Allah, any prophet or messenger, Companions, angels, the unseen. Paradise, Hell and
   the Hereafter only as symbol (real earthly nature, flagged `symbolic`), never as a literal scene.
   No fabricated historical event.
4. The recitation is the only sound: no music, effects or ambience; no pitch, speed, voice conversion
   or synthetic recitation. Mastering is the tested engine with its proofs. The picture follows the
   audio; the audio is never cut for the picture.
5. Meaning comes only from the Arabic text itself and from a translation and tafsir whose edition and
   licence are recorded. A model may choose among pictures those sources allow; it never writes
   meaning. No licensed source: the gap is reported and pictures fall back to neutral reverent motifs.
6. Every asset has its licence in the manifest; no other creator's video; generated footage is
   labelled and quality-checked.
7. A named human reviewer signs off religious accuracy before a film is marked ready to publish.

### Decisions that are the owner's (defaults used until he says otherwise)

| Question | Default now | Why |
|---|---|---|
| People and animals on screen | `strict`: no living beings (the rule already in code). Levels to offer: `strict`, `nature` (animals and birds, no people), `people-distant` (no faces: backs, silhouettes, crowds from afar) | His direction allows respectful human imagery; acceptance across Muslim audiences is widest without faces. He chooses per channel. |
| AI-generated footage | Off | It needs a paid API (no spending), and many viewers reject AI pictures over the Quran. Real licensed footage first. |
| Arabic ayah text on screen | On, small and elegant, can be switched off | It is the Quran itself, verified, and helps those who follow along. Translation: off. |
| Translations for other countries | Not burned in; later as separate YouTube caption files, only from translations whose licence allows it | Clean picture; each viewer picks a language. |

## What exists and what is missing (audit, 13 Nov 2026)

| Part | Exists | Missing |
|---|---|---|
| Audio | Mastering engine with proofs (quran profile: clean / mosque-hall / grand-hall), `voice-film --master` | Stereo in the renderer (it mixes mono); files over about 30 min in chunks |
| Recognition | `matchRecitation` on a transcript against Tanzil (ayat, times), `planQuranFilm`, `checkQuranFilm`, `quranSrt`; STT runner (`local/stt`: faster-whisper, pocketsphinx; default model `small.en`) | A recognizer that works on recitation (never run on a real one); user-given surah and ayat; alignment of the known text to the audio; a confidence gate; measured accuracy |
| Text | `engine/data/quran/tanzil-quran-simple-1.0.2.json`, `surah-names.json`, licence files | Uthmani text for display; an Arabic Quran font with an open licence (none in `render/assets`); Arabic text in the renderer (it uses `drawtext`; this ffmpeg has libass, HarfBuzz, FriBidi and `text_shaping`) |
| Meaning | The rule and guard that refuse unlicensed meanings | A translation and tafsir with edition and licence recorded; a map from ayah words to visible things; themes |
| Visual plan | `planVoiceVisuals` (general), `quranVisualAdabGuard` (titles and tags: no living beings, no AI pictures), `RECITATION_VISUALS` | A Quran director: shots from meaning, pacing on pauses, motif arc, continuity, no repeats, a reason stored per shot |
| Media | Keyless providers with licences (Wikimedia, NASA, LoC, Met, AIC, Openverse); Pexels and Pixabay adapters (free keys, none set); use history | Video clips as first choice; technical quality checks; a face / person detector as a second net; credits text |
| Render | `render/render-film.mjs` (1080p, three looks, `zoompan` moves, fades, one `xfade`, one-track voice, captions from word times, libx264) | Slow dissolves between scenes, smooth moves for long shots, Arabic ayah text, title and end cards, tail hold, 4K and 9:16 |
| Review, UX | CLI, release gate, job queue; studio page (`public/studio/`) without a voice tab | Scene review / replace / approve; the Voiceover tab; upload route |
| QA | Unit tests; CI on real audio for mastering (`voice-master.yml`) | Recognition and timing accuracy on real recitations; sync and render checks; a human evaluation sheet |

## Design

**Recognition is retrieval plus alignment, not dictation.** The Quran is a closed text. (1) Hear
roughly: any Arabic recognizer; a Quran-tuned Whisper if its model card's licence allows (candidates
to check: Tarteel's fine-tunes on Hugging Face), run on the GitHub runner or the owner's PC, model and
version recorded. (2) Retrieve the passage with `matchRecitation`; score coverage and ambiguity.
(3) Align the *verified* text of that passage to the audio for ayah and word times. (4) Gate: under
the thresholds, ask for surah and ayat. With user-given surah and ayat step 1 is not needed:
**pause-anchored alignment** places ayah ends on the measured pauses (`analyzeVoice().pauses`) by
dynamic programming, with expected lengths from letter counts (long vowels weighted); the result is
marked `estimated` until a recognizer confirms it. Fixed non-ayah phrases (isti'adha, "sadaqa Allahu
al-'azim", takbir) come from a short list and are labelled, never matched as ayat. A phrase the
reciter repeats is allowed in the alignment and reported.

**Meaning in three layers, in order of authority.** (a) A *literal lexicon*, authored in the repo and
reviewed: Arabic word forms that name visible things and places in the text (sky, earth, mountains,
sea, rain, clouds, wind, night, day, dawn, sun, moon, stars, trees, fruits, gardens, rivers, bees,
ships, iron, light, darkness; the fig, the olive, Mount Sinai, Makkah, the House, Safa and Marwa,
al-Hijr, Saba, Egypt). (b) A *licensed translation and tafsir* give the theme of an ayah without
visible things (mercy, guidance, patience, gratitude, prayer, warning, a past nation, law, the
Hereafter); a theme selects a mood and a family of neutral motifs (dawn light, rain on leaves, still
water, mountains, an empty prayer hall, stone ruins for "travel through the land"), never a literal
claim. (c) A *model* only ranks candidates inside what (a) and (b) allow and writes search words; the
guard re-checks everything. **Every shot stores `because`: the ayah, the words or theme it comes
from, and the source.** A reviewer sees why each picture is there; a shot without a reason is refused.

**Direction for a recitation: calm, reverent, coherent.** Cuts only at ayah ends and measured pauses,
never inside a word. Shot length follows the recitation (about 5 to 12 s; a long ayah gets several
shots at its pauses; a held note is never cut). Slow dissolves centred on the pause; no flashy
transitions, no rhythm cuts. Slow eased moves (push, drift, aerial glide, time-lapse); direction and
brightness continuity between neighbours; one grade for the whole film. A repeated ayah (the refrain
of Ar-Rahman) returns to its own motif. No asset twice. Open from black with the first breath; surah
title card (verified Arabic, transliteration, reciter); the last shot holds through the reverb tail
and fades slowly; end card with credits (text source, asset licences).

**Media.** Real video first, then photographs with a gentle move; generated footage only if the owner
turns it on. Before use: resolution (at least 1920 wide), sharpness, exposure, duplicates, duration;
titles and tags through the adab guard; sampled frames through a face / person detector where the
runner has one (a second net, its miss rate stated). The manifest lists origin, author, licence and
where used; credits are written for the video description.

**Packaging for YouTube from templates, not from a model.** Title (surah in Arabic and Latin, ayah
range, reciter), description, chapters from ayah times, credits, tags; localized titles for the main
Muslim-majority languages from fixed surah-name lists; thumbnail from a film frame plus the typeset
surah name. Shorts (9:16) of single passages come from the same plan.

## Stages (one = one commit + push, tests each, in this order)

| # | Build | Exit (measured) |
|---|---|---|
| Q1 | Recognition that works: `--surah` / `--ayat`, pause-anchored alignment (pure JS; tested on synthetic signals and on audio built by joining single-ayah recordings, where the true boundaries are known), fixed phrases, confidence gate; a Quran-tuned recognizer in `local/stt` run on the GitHub runner | On a real recitation: correct surah and ayat; ayah-boundary error (median, worst) stated; a wrong or unclear recording is answered with a question, not a guess |
| Q2 | Verified text and meaning: Uthmani text (licence kept), an open-licence Quran font, a translation and tafsir source (edition, licence, where it may be shown), the literal lexicon, themes | Every ayah of the test surahs has its text, its literal things and its theme with a source; gaps are listed, not filled |
| Q3 | Quran director: shots from meaning with `because`, pacing on pauses, motif arc, refrain motifs, continuity, adab levels, symbolic flag | A shot list for the test surahs that a person can read and check; the guard passes; no shot without a reason; no cut inside a word |
| Q4 | Media: video first, quality checks, detector net, manifest, credits | Each scene of a test film has a licensed asset or a stated gap; a rejected asset says why |
| Q5 | Render: dissolves, smooth long moves, Arabic text (shaped, verified), title and end cards, stereo mastered voice, tail hold; 1080p, then 4K and 9:16 | A full film from a real recitation on the runner; cuts sit on ayah ends within the stated error; the audio is the mastered file; no black or frozen frames; -14 LUFS |
| Q6 | Review and UX: scene list with replace / approve, reviewer sign-off in the release gate, the Voiceover tab in the studio (two tabs: Idea, Voiceover), packaging | One scene is replaced and the film re-rendered without redoing the rest; a film cannot be marked ready without a reviewer's name |
| Q7 | QA on several recordings (quiet room, phone, mosque, long): accuracy and timing table, sync, consistency; a human sheet for religious and visual review, kept apart from automated tests | The table in this file, with what failed |

## Testing on real audio

The cloud box cannot download archive.org files or reach model hosts; the GitHub runner can. Use a
workflow like `.github/workflows/voice-master.yml`: the runner downloads, runs the CLI, prints a
compact summary and uploads the files; read results with the GitHub tools (job logs with a small
tail; artifacts through the artifact tool's link). Test recitations so far: archive.org items their
uploaders marked CC0 (`jawad-farogi/Az-Zuha.mp3`, `001AlFaatihah_201305/001AlFaatihah.mp3`; the mark
is the uploader's statement; the second also carries a spoken translation; test only, never
committed). The owner will send his own recitation; that is the real test.

## State

13 Nov 2026: direction recorded, audit done.

**Q1 (recognition) built**, measured in the cloud box (CPU) on recordings with known ayah times made
by joining single-ayah files (`node local/quran-locate.mjs --join`), and on one real recitation.
- Code: `engine/src/quran-locate.mjs` (`locateRecitation`: user-given passage `parsePassage` /
  `findSurah`, the gate `judgeMatch`, pause-anchored alignment `alignByPauses` / `alignPassage`,
  recognised times moved onto the pauses `snapToPauses`, repeats, fixed phrases, `boundaryErrors`),
  `voiceSpans` in `voice-analyze.mjs`, CLI `local/quran-locate.mjs`, wired into `local/voice-film.mjs`
  (`--surah`, `--ayat`, `--passage`, `--opening`, `--closing`; a question exits with code 3).
  Tests: `engine/test/quran-locate.test.mjs` (16), `local/quran-locate.test.mjs` (1).
- Recognizer: `tarteel-ai/whisper-base-ar-quran` (Apache-2.0 on its Hugging Face page, revision
  5c3c53fd), converted to CTranslate2 by `local/stt/transcribe.py`, which reads and records each
  model's licence and refuses one not on the open list. It listens to pause-cut clips (`--clips`).
- Length model: `UNIT_WEIGHTS`, fitted on 184 single ayat of one reciter, checked on 44 of another:
  ayah length predicted to about 11-12% (letters alone: 14-15%).
- Test audio (never committed): archive.org items with a public-domain mark from the uploader:
  `surah_1`, `quran-audio-verse-by-verse-by-sadaqat-ali-surah-012` and `-008` (Syed Sadaqat Ali),
  `006099` (al-Husary, surah 10); CC0: `jawad-farogi/Az-Zuha.mp3`.

| Recording | Mode | Result | Ayah-boundary error: median / 90% / worst | Ends within 0.2 s | Cuts in the true gap |
|---|---|---|---|---|---|
| Al-Fatiha joined (48 s) | recognizer | found 1:1-7 | 0.003 / 0.23 / 0.24 s | 10 / 12 | 5 / 6 |
| Al-Fatiha joined | given only | 1:1-7 | 0.003 / 0.007 / 0.01 s | 12 / 12 | 6 / 6 |
| Yusuf 1-40 joined (13 min) | recognizer | found 12:1-40 | 0.004 / 0.014 / 0.31 s | 76 / 78 | 38 / 39 |
| Yusuf 1-40 joined | given only | 12:1-40 | 0.004 / 0.014 / 0.31 s | 76 / 78 | 38 / 39 |
| Al-Anfal 1-75 joined (28 min) | recognizer | found 8:1-75 | 0.005 / 0.13 / 3.6 s | 139 / 148 | 71 / 74 |
| Al-Anfal 1-75 joined | given only | 8:1-75 | 0.007 / 16.8 / 25 s | 107 / 148 | 55 / 74 |
| each of the three, wrong surah given | recognizer + given | asked: "you gave 93, it sounds like ..." | | | |
| Ad-Duha, Jawad Farogi (real, 146 s, slow melodic) | recognizer | asked for surah and ayat (the model heard no Quran text) | no truth | | |
| Ad-Duha, same | given 93 | 11 ayat placed, estimated; 4 of 10 ends on a pause, 6 in one breath and marked unsure | no truth | | |

- Given only, an end is marked `sure` only when it sits on a pause and the next best place costs
  much more. On Al-Anfal 26 of 74 ends were called sure, and all 26 were on the right pause (within
  0.2-0.4 s of the true end); every badly wrong end (the first ten ayat, shifted by a wrongly guessed
  opening) was marked unsure. Saying `--opening basmala` fixed it in a parameter sweep (127 / 148).
  Unsure ends are listed for review and `ayahEndsOf` does not use them for the mastering.
- Not verified: a real continuous recitation with known times (the joined files have clean gaps);
  phone and mosque recordings; Ar-Rahman's refrain on real audio; the runner workflow
  `.github/workflows/quran-recognize.yml` (first run after this commit). The Tarteel base model fails
  on slow melodic recitation (Ad-Duha above): the gate then asks, as designed. A larger Quran model is
  the next thing to try on the runner.
- On the GitHub runner (run 43454062608, the same code, sets built there): recognizer path, cuts in the
  true gap: Fatiha 6/6, Yusuf 1-40 39/39, Anfal 1-40 38/39, al-Husary Yunus 1-30 28/29; every wrong
  surah was answered with a question; the CC0 Ad-Duha was asked about (the model heard no Quran); the
  CC0 Al-Fatiha with a spoken translation was asked about too ("sounds like 1:2-7", half the speech is
  not Quran). The two misses were one long ayah heard in two pieces and taken as a repeat; fixed after
  the run (re-located from the runner's own transcripts: Yunus 29/29, worst 0.11 s; Anfal 39/39).
- A second reciter (al-Husary, Yunus 1-45, given only): 15 of 44 cuts in the true gap; the 11 ends
  called sure were all right. Over all six known-truth sets the given-only path called 400 ends sure
  and all 400 were within 0.5 s of the truth. A wrong `--opening` makes every end unsure (Fatiha: 0 of
  6), and the closing words are never placed inside the last ayah's breath.

**Q2 (verified text and meaning) built** and tested (`engine/test/quran-meaning.test.mjs`, 9 tests).
- Text on screen: Tanzil Uthmani 1.1, verbatim with its notice (`engine/data/quran/tanzil-quran-uthmani-1.1.txt`,
  CC BY 3.0, verbatim only; sha256 pinned in the test). Checked against the Simple text: 6,155 of 6,236
  ayat have the same letter skeleton, the other 81 are known Uthmani spellings.
- Font: Amiri Quran (Google Fonts, SIL OFL 1.1) in `render/assets/fonts/`, recorded in its README.
  Not yet drawn by the renderer (Q5).
- Translation: Pickthall 1930 from Project Gutenberg #16955 (public domain), `scripts/extract-pickthall.mjs`;
  6,168 of 6,236 ayat identical to Tanzil's copy. Tanzil's translations are non-commercial only, so not used.
- Tafsir: none. No tafsir with a recorded edition and a licence for this use was found; this is a gap.
- `engine/src/quran-meaning.mjs`: the literal lexicon (52 things, from the Arabic; animals marked
  `living`, gardens and fire `symbolic`), the unseen from the Arabic (angels, jinn, the Spirit, Throne,
  Paradise, Hell, the Hereafter; al-jannah / al-jinnah flagged either way), 19 themes from fixed
  keyword rules on the translation, each with `because` and its source. `node local/quran-meaning.mjs
  --passage "95"` prints the table for a person to check; `voice-film` writes `meaning.md` and passes the
  licensed meaning to the adab guard.
- Test surahs 1, 55, 93-95, 97, 112-114 (132 ayat): every ayah has its text and translation; 29 name a
  visible thing, 65 have a theme, 12 touch the unseen, 43 are listed as gaps (neutral motifs only).
- Not verified: the lexicon and theme rules have not been reviewed by a scholar (they must be, before
  publishing); a run of Paradise ayat without the word (55:70-76) is not flagged unseen by itself: the
  director (Q3) must carry the flag through a passage.

**Q3 (Quran director) built** and tested (`engine/test/quran-director.test.mjs`, 7 tests):
`engine/src/quran-director.mjs` `directQuranFilm({ plan, meaning, spans, adab })` gives the shot list;
`voice-film` writes `shots.md` (for a person to check) and `shots.json`; `--adab strict|nature|people-distant`.
- Cuts only at ayah ends and in measured pauses (checked: no cut inside a voiced stretch); long ayat
  split at pauses into 5-12 s shots; a stretch with no pause is held, never cut.
- An unsure ayah end is never a cut; the shot at each pause follows the ayah estimated at that time and
  says so in its reason.
- Picture order of authority: a thing the Arabic names, then the theme, then neutral motifs; every shot
  has `because` (ayah, word or theme, source). The refrain of Ar-Rahman (31 times) returns to one picture.
  The Hereafter is a symbol only, and the flag carries through a description (55:35-76) until another
  subject comes. Bees (16:68) are named but not shown at `strict`; shown at `nature`. No picture twice in a row.
- Fade from black, dissolves centred on the pauses, the last shot held through the tail with a 3 s fade.
- Run on real audio: the CC0 Ad-Duha (all ends unsure: 6 shots, the longest 41 s because the reciter's
  breaths are 20-37 s long) and the joined Yusuf 1-40 (67 shots).
- Not verified: how the shot lists look to a person (the owner or a reviewer should read one `shots.md`);
  the motif families are written by hand and not yet reviewed.

**Q4 (media) built** and tested (`engine/test/quran-media.test.mjs`, 4 tests): `engine/src/quran-media.mjs`
`findQuranMedia`, `rejectWhy`, `mediaManifest`, `creditsText`; `node local/quran-media.mjs --run <folder>
[--detect python]` writes media.md, media.json, manifest.json, credits.txt.
- Providers for a recitation: Pexels and Pixabay (only with their free keys, none set), Wikimedia Commons,
  NASA, Openverse; the art and history archives are not searched (people and depictions). Video first.
- Each refusal says why: licence (share-alike, non-commercial, no-derivatives, unconfirmed item page),
  adab (people, animals by level, paintings, statues, icons, music, generated pictures, book scans),
  relevance (the title must name what the shot asks for), quality (under 1920 px wide, video too short),
  used before (no asset twice), detector.
- Detector net: `local/media/detect.py`, OpenCV 4.10 Haar face cascades and HOG people detector
  (Apache 2.0). Measured here on 8 NASA astronaut portraits and 8 NASA Earth photographs: all 8 portraits
  flagged, 1 of 8 Earth photos falsely flagged (a false flag only drops a picture). A small sample; the
  runner measures 12 + 12 (`.github/workflows/quran-media.yml`).
- Run here on the real Ad-Duha shot list (Commons and NASA only, no keys): before the relevance rule 4 of 6
  shots had an asset, but three were wrong (a Mars rover, a 1912 book scan, a snow video); with it, 3 of 6
  (morning light over a town, a mountain valley, and a coffee cup "in soft morning light", which is why
  indoor and object words are now refused too), the rest stated gaps.
- Not verified: relevance is judged from titles only; a person must look at every picture (Q6 review).
  Without Pexels / Pixabay keys most shots will be gaps or photographs; the owner can add free keys.

**Q5 (render) built** and tested (`render/quran-render.test.mjs`, 5 tests): `node render/quran-render.mjs
--run <folder> --audio <mastered voice> [--format 1080p|4k|9:16] [--reciter name]`.
- One clip per shot (the asset or a slowly moving dark card; one grade for the film; slow eased push,
  pull or drift that grows with the shot's length, so a long shot never freezes), joined by dissolves
  centred on the cut; fade from black, last shot held through the tail, 3 s fade out.
- Arabic: Tanzil Uthmani verbatim, typeset in Amiri Quran by libass (HarfBuzz, FriBidi; base direction
  automatic, which was needed for the ayah number ﴿٤﴾ to sit right). The basmala Tanzil writes before
  ayah 1 is not shown as part of the ayah. Surah name in Arabic and Latin and the reciter at the start;
  "Quran text: Tanzil.net" at the end. The recitation is the only sound (AAC 320k, stereo, as mastered).
- Measured after every render: length against the voice, loudness, true peak, black and frozen
  stretches, and every cut against the measured voice. The CC0 Ad-Duha (146 s, mastered mosque-hall):
  length matches (146.67 s against 146.65 s), -14 LUFS, true peak -4 dBTP, no black, no frozen frame,
  5 cuts, all in pauses (1 at an ayah end, 4 at pauses inside the estimated ayat), none in the voice.
  Rendered in 3 min 20 s on this box. Al-Fatiha joined (48 s): -14 LUFS, -1.5 dBTP, 3 cuts all at ayah ends.
- After the media fixes the same film has 4 of 6 shots on licensed Commons pictures (3 photos, 1 video)
  and 2 cards. Looking at the frames: one Commons video is stored sideways by its uploader (no rotation
  flag in the file), and "tree shelters" are plastic tubes in a forest. No automatic check catches these;
  the per-scene review (Q6) must, before a film is marked ready.
- Found and fixed while measuring: the first move filter (zoompan) stepped by whole pixels and long
  shots read as frozen; the detector passed an unreadable video as clean (now refused); Commons refuses
  thumbnail sizes it does not list, so the detector now looks at the file that will be used.
- Not verified: 4K (written, not rendered yet); how it looks to the owner; the runner film
  (`.github/workflows/quran-film.yml`, first run after this commit). Most shots are still cards: the
  keyless archives give few relevant, licence-clean, face-free pictures; Pexels and Pixabay are used
  when their keys are set as repository secrets.
- Q6 and Q7: not built.
