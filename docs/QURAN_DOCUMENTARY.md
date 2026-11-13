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

13 Nov 2026: direction recorded, audit done. Q1 to Q7: not built.
