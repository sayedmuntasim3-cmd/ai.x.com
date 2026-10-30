# Zupona AI Studio: system v5

Written 30 October 2026, after the owner's request of 29 October. It covers:

- the owner's own voice, uploaded directly or through ElevenLabs;
- Quran recitation and Islamic films;
- three language versions (Arabic, English for the USA, Bangla);
- an "idea mode" that turns one line into a movie-like story;
- a larger agent roster.

The engine modules this describes are in [`engine/`](../engine/README.md) and are tested.

## 1. What the owner asked for

1. **Uploaded voice.** Upload your own recording (narration, or Quran recitation) and get it back perfect: correct volume, correct music, never robotic, never damaged. The same applies to a voice made in ElevenLabs.
2. **Quran recitation.** Recognise which surah and ayat were recited (Al-Fatiha, Al-Falaq, Al-Baqarah and so on). Match the footage to the meaning of each ayah. Study how the best recitation videos are made, including what music, if any, belongs with recitation.
3. **Three versions.** Arabic for viewers with an Islamic outlook, English for the USA, and Bangla.
4. **Idea mode.** One line, even misspelled and in Bangla, becomes a full story. Examples: "started with $50 and bought a Rolls-Royce", "a poor father, a son who struggled, built a bus business and became a billionaire", "a man raised a baby dragon". The story has a strong hook, twists like a film, and realistic US detail.
5. **More agents.** Use as many as give the best result, and analyse everything first: the repository, the whole chat, YouTube and the web.

## 2. Where the code lives

`ai.x.com` (this repository) is the home of the AI studio:

- `public/` holds the landing page served by the `ai-x-com` Worker.
- `engine/` holds the modules below.

The studio app itself (the documentary page, the composer, the browser renderer and the API routes) was built on about 70 branches of the `zupona` repository. None of them were merged, and ai.zupona.com was taken off the shop's Worker on 21 October 2026. The next step (§11) is to move that app here, as its own Worker, and wire it to these modules.

## 3. Inputs the studio accepts

| Input | What the system does | Module |
|---|---|---|
| A recording of the owner reading narration | Measures it and cleans it with a light chain chosen from those measurements; never changes the voice | `loudness.mjs`, `voice-plan.mjs` |
| A recording of the owner reciting the Quran | Identifies the surah, the ayat and each ayah's timing, then builds an ayah-by-ayah film with nothing laid under the recitation | `quran.mjs`, `voice-plan.mjs` |
| The owner's ElevenLabs voice | Reads each version with the model that speaks its language, then levels it | `voice-plan.mjs` |
| A one-line idea | Writes an original story, labelled as fiction, with hooks, twists and payoff | `content-intel.mjs`, `story-mode.mjs` |
| A true-story topic ("documentary", "true story", "জীবনী") | Researches every claim and writes from sources | `content-intel.mjs`, research squad |
| A finished script (150 words or more) | Keeps the words and checks the claims | `content-intel.mjs` |

Two cases are fixed by rule:

- A story about a prophet or a Companion is told from the Quran, hadith and sira, with sources. It is never labelled fiction, and no one in it is shown. Bangla "নবীদের গল্প" means "stories of the prophets", not fiction.
- A request for Quran recitation in a synthetic or cloned voice stops the run.

## 4. How a run works

`pipeline.mjs` plans every run. The stages are: understand the input → sources and meaning → structure → script per version → voice → visuals → edit, music and mix → automatic checks → titles and thumbnails per version.

- **No one is asked anything during a run.** There are no human approval steps.
- **A failed check goes back to the squad that owns it, up to twice.** If it still fails, the element is replaced by a safe fallback and the reason is recorded. Fallbacks include dropping the shot, withholding the ayah number and muting the music.
- **Only two things stop a run:** Quran recitation requested in a synthetic voice, or an upload whose rights are refused.
- **Publishing is never automatic.** The finished versions are delivered, and the owner publishes them.

Automatic checks (`GATES`):

| Check | Rule |
|---|---|
| Rights | Every asset has a licence record; anything without one is replaced |
| Quran text | Every ayah on screen equals the Tanzil text for its reference, character for character |
| Quran reference | No surah:ayah number for a passage that occurs in more than one place, unless the recording settles it |
| Music policy | Nothing under Quran recitation or quotations; no instruments where the policy says so |
| Visual adab | No depiction of prophets, Companions, angels or Allah; in recitation videos also no people, AI-made people or animals, or Paradise and Hell imagery |
| Version purity | Each version's narration, captions and titles in its own language and script only |
| Fiction label | An invented story carries the label from 0:00, in the description and in every Short |
| AI disclosure | Every photoreal AI scene is listed for YouTube's disclosure |
| Voice preservation | The owner's voice is never pitch-shifted, sped up, re-synthesised or echoed; the original is kept |
| Loudness | Master at −14 LUFS (±1), true peak at or below −1 dBTP |
| Technical | No black frames, duplicate shots, audio drift or subtitle timing errors |

## 5. The three versions

Each version is written for its own audience from the same research or premise. Versions are never translated line by line, and never share a script, a voice or on-screen text (`versions.mjs`).

| | Arabic | English (USA) | Bangla |
|---|---|---|---|
| Audience | Arabic speakers with an Islamic outlook | Viewers in the USA | Viewers in Bangladesh |
| Language | Modern Standard Arabic, so one version reaches the whole Arab world | American English | Bangladeshi Bangla ("pani", not "jol") |
| Writing | Right to left, Arabic-Indic digits (١٬٢٣٤) | Left to right, 1,234 | Bengali digits with lakh grouping (১২,৩৪,৫৬৭) |
| Currency | US dollars, written out (٥٠ دولار أمريكي) | $ | ৳ |
| Default music | No instruments | A licensed score | A licensed score; no instruments for Islamic content |
| Fonts | Amiri, Noto Naskh Arabic; Amiri Quran for ayat | Archivo, IBM Plex Sans | Hind Siliguri, Noto Sans Bengali |

Arabic and Bangla need complex-script shaping. Burned-in subtitles must go through a shaping renderer (the browser canvas, or libass with HarfBuzz), because a plain text overlay breaks joined Arabic letters and Bangla conjuncts.

Narration pace is a planning value only (120, 150 and 125 words a minute). The narrator's measured pace replaces it (`narratorPace`).

## 6. Quran recitation and Islamic films

**Recognition (`quran.mjs`).**

1. A recogniser tuned for the Quran transcribes the recording with word times. One candidate is tarteel-ai/whisper-base-ar-quran (Apache-2.0, a reported 5.75% word error rate on trained reciters).
2. `matchRecitation` aligns those words against the Tanzil text and returns:
   - the surah and ayah range;
   - each ayah's start and end time;
   - a confidence score;
   - markers for the isti'adha, a basmala between surahs, and "sadaqa Allahu al-azim";
   - for a passage that occurs in several places, every place it occurs.
3. It tolerates recognition slips: a dropped word, one wrong letter, spelling variants. Tests cover Al-Fatiha, Al-Falaq, two surahs in one recording, part of Ayat al-Kursi, Ar-Rahman's refrain (31 places) and all 286 ayat of Al-Baqarah (about 2 seconds).
4. A test showed why every place is listed. "ويل يومئذ للمكذبين" occurs ten times in Al-Mursalat and again at 83:10. Showing one ayah number for it would be a guess.
5. Precise word-level forced alignment is the next step on the server.

**Text on screen.**

- Only the Tanzil text, looked up by reference and set in Amiri Quran (SIL Open Font License).
- Recognised text is never shown.
- The KFGQPC fonts are not used until their commercial terms are confirmed in writing.

**Audio.** Recognised bodies agree that nothing is laid under recitation:

- Dar al-Ifta al-Misriyyah prohibits "musical recitations". Al-Azhar condemned AI "Quranic songs". Jordan's Iftaa calls mixing the Quran with music a grave sin.
- IslamQA (229732, 271405) says water, wind or nasheed sounds should not be used behind recitation either.
- Echo that repeats letters is ruled impermissible (IslamQA 391117, citing Ibn Uthaymin). So is auto-tune.

So for a recitation the music policy is "none", with no option to change it. The chain is gentle: light noise reduction at most, 80 Hz high-pass, 1.5:1 compression, light de-essing. An optional natural-room reverb is off by default and can never produce distinct echoes.

**Editing.** Cuts fall only at the end of an ayah or a permitted stop (waqf); a wrong stop can reverse the meaning, as with 4:43. The recitation is never sped up, slowed, looped or reordered.

**Pictures.**

- Recitation over nature footage that matches the ayah is acceptable (IslamQA 175174), on three conditions: no music, no women, and no attempt to depict the unseen. That rules out earthly gardens or fires for verses about Paradise and Hell.
- Prophets, Companions (Al-Azhar's resolutions), angels and Allah are never depicted.
- AI-generated people and animals are not used.
- Animals appear only when the ayah names them.

**Translations.**

- English: the Pickthall translation (1930) is reported to be public domain in the US from 1 January 2026. Use a Project Gutenberg-based copy.
- Sahih International needs written permission.
- The Bangla translations Tanzil carries are for non-commercial use only. QuranEnc allows republishing with credit, but its rules on advertising make monetised video unclear, so ask in writing first.
- Quran.com's Quran Foundation API counts a social video as end-user use, provided the video carries its credit line.

**Rights.** The owner's own recitation avoids the Content ID claims that famous reciters' recordings attract. Every upload carries a rights attestation.

## 7. Voice

**The owner's recording (`planVoice`).**

1. The recording is measured first (`analyzeRecording`): loudness, true peak, noise floor, signal-to-noise ratio, clipping and DC offset.
2. The repair chain then runs, but only the parts the measurements call for:
   - DC removal and de-clipping;
   - noise reduction: none at 35 dB or more of SNR, light down to 25 dB, medium below that, and never heavy, because heavy noise reduction is what sounds robotic or underwater;
   - 80 Hz high-pass, 3:1 compression and at most 4 dB of de-essing.
3. The whole stitched track is levelled to −15 LUFS under music (−14 without), with a true-peak limiter at −1 dBTP.

The voice is never pitch- or formant-shifted, auto-tuned, sped up, re-synthesised or echoed. Re-synthesis includes speech-to-speech, dubbing and generative enhancers. The untouched original is always kept. The ElevenLabs Voice Isolator is opt-in only, with a before/after comparison, and never used on recitation.

**The owner's ElevenLabs voice.** The language lists ElevenLabs published in October 2026 decide the model:

| Version | Model | Why |
|---|---|---|
| English, Arabic | Multilingual v2 | Most stable for long narration; up to 10,000 characters per request; supports request stitching |
| Bangla | v3 | The only model listing Bengali; about 3,000 characters per request; no stitching, so chunks are joined at pauses and outliers regenerated |

- v4, released in October 2026, lists 90+ languages, but Bengali was not confirmed.
- A Professional clone can only be of your own voice and needs a verification recording.
- Request WAV at 48 kHz.

**Loudness.** Measured to ITU-R BS.1770-4 / EBU R128 (`loudness.mjs`). The tests reproduce the standard's K-weighting coefficients, pass EBU Tech 3341 cases 1 to 5 within 0.1 LU, and find a true peak between samples. YouTube turns uploads louder than about −14 LUFS down, and −1 dBTP leaves room for its encoder.

**In the browser.**

- `decodeAudioData` decodes a whole file into memory, about 1.4 GB for an hour of 48 kHz stereo. Long files therefore have to be streamed in chunks (AudioWorklet or WebAssembly) or processed in a Cloudflare Container.
- A Worker isolate has 128 MB of memory.

## 8. Music

| Policy | When | Under the voice |
|---|---|---|
| None | Quran recitation | Nothing at all, not even nature sounds |
| No instruments | The Arabic version and Islamic content | Sound design or vocal-only nasheed, 22 LU under the voice, silent under any Quran quotation |
| Score | Other films | A licensed, Content-ID-safe track, 20 LU under the voice (adjustable from 14 to 30) |

Ducking uses offline gain automation from voice detection, not a side-chain compressor, which would pump on every breath:

- 8 dB deep;
- starting 150 ms before a phrase;
- holding across gaps shorter than 1 second;
- releasing over 650 ms.

## 9. Idea mode (stories)

**Beat plan (`planStory`).**

- **Shorts** open on the impossible image with one question inside 3 seconds. They end on a line that loops back to the first frame.
- **Long stories** run in this order:
  1. a cold open on the turning point;
  2. stakes by 0:15, and the title's promise by 0:30;
  3. a twist near a quarter;
  4. a reversal at the midpoint;
  5. the low point near three quarters;
  6. a cliffhanger at 80%;
  7. a payoff that closes the opening loop.

  There is a re-hook (a new question before the last one closes) every 3 minutes.
- YouTube's "Intro" metric is the share of viewers still watching at 0:30. A widely used benchmark is at least 60%.

**Rules (`STORY_RULES`), from the research:**

- Beats connect with "but" or "therefore", never "and then".
- The hero fails at least once through his own fault, and the win costs him something.
- Antagonists have motives a viewer can understand.
- Use exact figures ("$47") and three to five very specific details.
- Money must add up: wealth comes from scale, property or a sale. `checkMoneyPath` flags any jump over 10× that has no scenes of its own.
- Never state the moral.
- No real private people, no real town as a crime scene, no real company as a villain.

The US era bible starts with the federal minimum wage by date and median household income.

**Robotic writing (`lintNarration`).** This check flags:

- stock phrases ("stands as a testament", "rich tapestry");
- sentences all the same length;
- three sentences in a row with the same opening word;
- "and then" chains;
- vague money;
- stated morals;
- any other language mixed into the version.

A study of more than 50,000 AI stories found that the bigger giveaways are explained themes, tidy single-track plots and flat escalation. So the plot rules above matter more than the phrase list.

**YouTube rules this is built for:**

- **Inauthentic content.** In July 2025 YouTube renamed "repetitious content" to "inauthentic content". It names channels that upload narrative stories with only superficial differences between them. Every story must therefore differ in premise, structure, characters and visuals.
- **Disclosure.** Realistic synthetic scenes must be disclosed, and since May 2026 YouTube also labels photoreal AI automatically.
- **Enforcement.** A channel that told AI-invented crimes as fact was removed. Fake-trailer channels were terminated once they dropped their "fan-made" labels.
- **The fiction label.** Hence the fiction label (`FICTION_LABELS`, written natively in all three languages), shown from 0:00, in the description and in every Short.

**Fantasy (a dragon).**

- Free stock footage has no dragons, so these scenes need AI video. Veo 3.1 is the main option and Kling 3.0 the backup. OpenAI removed the Sora 2 API in September 2026, so the studio keeps a provider layer that can switch models.
- One character bible and the same reference images go into every shot.
- Only the shots stock cannot supply are generated.
- Every generated shot is disclosed.
- At about four takes per usable shot, a finished minute of dragon footage was estimated at about $29 on Veo 3.1 Fast and $96 on Standard (research arithmetic, September 2026 prices).

## 10. Footage: legal sources only

**The answer to "can we cut a few images or clips from Facebook, X, YouTube or TikTok" is no, at any number.**

- The US Copyright Office: "There is no specific number of words, lines, or notes that may safely be taken without permission."
- YouTube: even a few seconds of unlicensed use can bring a claim.
- Using someone's own photos to illustrate the event they show was held not to be fair use (*McGucken v. Pub Ocean*, 2022; see also *Warhol v. Goldsmith*, 2023).
- The YouTube, X, Meta and TikTok terms forbid downloading or automated collection.
- Three copyright strikes in 90 days end a channel.
- The owner's own master prompt said the same: "NO Facebook/Instagram/Twitter scraping. NO direct copying of YouTube videos."

**What the system does instead, in this order:**

1. Pexels, Pixabay, Videvo (free licence only), Coverr and Mixkit.
2. Wikimedia Commons: CC0, public domain and CC BY are accepted automatically; CC BY-SA is not used without review.
3. NASA and NOAA.
4. Public-domain items from the Internet Archive.
5. Europeana open items.
6. Graphics the system builds itself.
7. For a fantasy story only: labelled AI scenes.

For something that exists only on social media, a permission request goes out instead:

- the template message asks "Did you film this?";
- the creator accepts a written licence (non-exclusive, worldwide, all media, monetised, with a credit line and no Content ID claim) on a hosted page;
- only then is the creator's original file used.

YouTube's Creative Commons filter is used only to find creators to ask, because YouTube's terms forbid downloading. When a news clip is essential, the paid agencies are Newsflare (from $230 per clip) and Jukin.

Islamic footage comes from Pexels and Pixabay, plus CC0, public-domain or CC BY files on Commons. Close-ups of identifiable worshippers are avoided. Verses are typeset in open-licence fonts rather than copied from modern calligraphy artworks.

## 11. The agents

The 151 roles are grouped in 15 squads (`agent-roster.mjs`):

- **The original ten squads:** research, story, cinematography, animation, footage, editing, audio, color, quality and audience.
- **Five new squads:**
  - **Intake & Understanding** (10): reads any input, including rough or misspelled ideas, and writes the brief.
  - **Voice Studio** (10): keeps the owner's voice theirs and handles ElevenLabs.
  - **Quran & Islamic Content** (10): verbatim text, references, timing, translations, ayah-matched pictures, adab checks.
  - **Story & Screenplay** (11): premise, era, characters, plot and twists, hooks, money path, scenes, narration, anti-robotic check, AI scenes, fiction label.
  - **Language Versions** (10): one writer and one reviewer per language, numerals and typography, separation guard, subtitles, packaging.

A role is a precise job with an input, an output and a check, and it runs only when the film needs it. A recitation film uses 69 roles, a story with AI scenes 78, a documentary 84 and an Islamic documentary 95.

Adding roles without distinct checks would add cost, not quality. That is why the roster grew where the new work is and not to a round number.

## 12. Honest limits

- **No system can promise zero mistakes or a minimum of 50 to 60 million views.** Views depend on the topic, packaging, the channel and timing. This system controls what can be controlled (hook, retention structure, quality, packaging, legal safety) and checks it automatically.
- **Recognition is only as good as the transcript.** That is why low-confidence and repeated passages are marked rather than guessed.
- **Some values are planning numbers until measured:** Arabic and Bangla narration pace, the Arabic version's currency, and the reverb settings for recitation.
- **Not built yet:**
  - the upload screens;
  - server-side transcription for Quran audio;
  - forced alignment;
  - the Uthmani display text (tanzil.net was unreachable from this environment);
  - licensed translations;
  - the AI video provider layer;
  - the render pool;
  - moving the studio app into this repository.

## 12a. What runs today

`cd engine && npm test` runs 49 tests:

- Quran recognition (16);
- loudness (8);
- versions, voice and intake (13);
- story, roster and run plans (10);
- the ported engine core and media fetching (2 files with 24 and 18 cases).

The strict JSDoc type check passes on all 12 source files.

## 13. Next steps

1. Move the studio app from the `zupona` AI branches into this repository as its own Worker, and wire these modules into it.
2. Build the upload flow: recording → `analyzeRecording` → `planVoice` → (for Arabic audio) transcription → `matchRecitation` → a film planned ayah by ayah.
3. Build idea mode: premise → intake squad → `planStory` → screenplay squad → `lintNarration` and `checkMoneyPath` → the three versions.
4. Download the Tanzil Uthmani text and Amiri Quran, and get the translation permissions in writing.
5. Add the AI video provider layer (Veo 3.1, with Kling 3.0 as backup) for fantasy stories only.

## Research sources

**Quran and Islamic media**
- https://www.dar-alifta.org/en/article/details/498/dar-al-ifta-reciting-the-quran-accompanied-with-musical-instruments-is-prohibit
- https://iqna.ir/en/news/3489989/egypt%E2%80%99s-al-azhar-dar-al-ifta-issue-warning-against-quran-recitations-with-music
- https://www.egyptindependent.com/al-azhar-issues-statement-forbidding-ai-generated-quranic-songs/
- https://aliftaa.jo/article-en/5821/AddQuestionEn.aspx
- https://islamqa.info/en/answers/229732, /271405, /391117, /175174, /300101
- https://www.islamweb.net/en/fatwa/406348/listening-to-natural-sounds-when-reciting-quran
- https://tanzil.net/docs/text_license, https://tanzil.net/download/
- https://api-docs.quran.foundation/legal/developer-terms/
- https://fontsource.org/fonts/amiri-quran/about
- https://huggingface.co/tarteel-ai/whisper-base-ar-quran
- https://github.com/cpfair/quran-align
- https://quranenc.com/en/browse/bengali_zakaria

**Voice and loudness**
- https://elevenlabs.io/docs/overview/models
- https://elevenlabs.io/docs/eleven-api/concepts/voice-cloning
- https://elevenlabs.io/docs/overview/capabilities/voice-isolator
- https://github.com/openitu/STL (BS.1770 reference code)
- https://tech.ebu.ch/docs/tech/tech3341.pdf
- https://www.izotope.com/en/learn/order-of-audio-repair-operations.html
- https://developers.cloudflare.com/workers/platform/limits

**Story, policy and AI video**
- https://support.google.com/youtube/answer/9314415 (Intro metric)
- https://www.socialmediatoday.com/news/youtube-clarifies-monetization-update-inauthentic-repeated-content/752892/
- https://support.google.com/youtube/answer/14328491 (disclosure)
- https://techcrunch.com/2026/05/27/youtube-will-now-automatically-label-ai-videos/
- https://www.tubefilter.com/2025/02/14/youtube-true-crime-case-files-ai-crime-channel-terminated/
- https://www.404media.co/ai-fiction-is-easy-to-detect-because-its-stupid-and-bad-research-finds/
- https://www.dol.gov/agencies/whd/minimum-wage/history/chart
- https://fred.stlouisfed.org/data/MEHOINUSA646N
- https://developers.googleblog.com/introducing-veo-3-1-and-new-creative-capabilities-in-the-gemini-api/
- https://techjacksolutions.com/ai-brief/openai-videos-api-sora-2-deprecated-september-2026/

**Footage and rights**
- https://support.google.com/youtube/answer/2797449
- https://fairuse.stanford.edu/case/elliot-mcgucken-v-pub-ocean-limited
- https://www.law.cornell.edu/supremecourt/text/21-869
- https://www.youtube.com/terms
- https://developers.google.com/youtube/v3/docs/search/list
- https://commons.wikimedia.org/wiki/Commons:Licensing
- https://www.newsflare.com/pricing

Most findings were read from search-result summaries because this environment could not open the pages directly. Every licence term should be confirmed on the live page before launch.
