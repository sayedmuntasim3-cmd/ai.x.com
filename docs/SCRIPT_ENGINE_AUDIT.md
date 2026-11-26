# Script Engine audit (12 Nov 2026)

Read-only audit of the actual code. Stopped early at the owner's request to save
usage. What I did not inspect is marked **not inspected**. Nothing was implemented.

## 1. The 151 roles: what they really are

Counts from `ROLE_STATUS` (`engine/src/agent-roster.mjs:312`): **63 code, 46 model,
6 built but not wired, 36 planned.** The full table (id, status, what does the job)
is at the end of this file, generated from the code.

- A role is **not an agent or a program**. It is a label plus one line saying which
  stage or module does its job. No role has its own prompt, model call or process.
- "model" roles (46) are paragraphs inside one long manual
  (`prompts/1-zupona-master-engine-full.txt`, 73 KB) that is sent as the system
  prompt to every stage. A stage like S3 "is" 7 roles at once, in one model call.
- "code" roles (63) are real code, but most are render, audio, footage and
  licence work. For the **script** itself the code roles are checks only:
  `story-open-loops` (every opened loop paid), `story-script-coverage` (words vs
  seconds), `research-source-diversity` (sites per fact), `versions-separation-guard`.
- Planned with no code, relevant to script quality: `research-peer-review`,
  `research-geography`, `research-freshness`, `story-exposition`,
  `cinematography-visual-metaphor`; all Bangla/Arabic writers and reviewers.

## 2. How Bossism coordinates (the real mechanism)

- **No discovery, selection or assignment at run time.** The stages are a fixed
  list, `IDEA_STAGES` (`engine/src/bossism.mjs:64`), each with a static list of
  role names. `productionGraph()` expands it per chapter; the roles are metadata.
- `understand()` (`bossism.mjs:93`): only the "idea" system is wired; voice and
  Quran are refused.
- `preflight()` (`bossism.mjs:185`): blocks a run with no brain, no research path,
  or a window too small; lists lowered quality.
- The run itself is `runFilm()` in `engine/src/film-run.mjs:299`, strictly
  sequential. The graph is used for preflight, for checking order, and for
  deciding what to redo after a review, not for scheduling. Parallel stages: not built.
- `pipeline.mjs` `planRun()` (picks roles by content type): **not inspected**.
- One model does every stage (writer, QA, viewer panel, footage judge). There is
  no independent critic model.

## 3. The pipeline, topic to script (film-run.mjs)

All model calls go through `ask()` (`film-run.mjs:320`) → `model.call()`; the brain is
Claude, Gemini or a local model (`worker/brain.mjs`, `worker/local-brain.mjs`, not
re-inspected). `canSearch()`/`canSee()` (`film-run.mjs:922-930`) switch paths.

| Step | Where | What really happens |
|---|---|---|
| Market | `stage("market")` ~l.433 | optional YouTube outliers for the topic (needs `YOUTUBE_API_KEY`) |
| Topic understanding, angle, titles | S0/S1 ~l.450 | one model call under the manual |
| Research | ~l.482 | brain that can search: **one** call with up to 30 web searches, returns JSON facts. Otherwise the research desk (`research-desk.mjs`): model writes queries → code gathers Wikipedia, pages they cite, owner's SearXNG → model writes facts only from opened pages (`bindToCorpus`). Fewer than 8 sourced facts (5 for a story) stops the run. |
| Source check | `sources` ~l.503, `source-check.mjs` | code opens every cited URL, drops dead pages, marks numbers not found on the page, counts sites |
| Fact verification / contradictions | S2 ~l.512 | model writes the claim ledger (FACT/CONTESTED/ESTIMATE...) from research.json only. Contradictions: the model is asked to record them; code only catches the same normalised claim with two values (`bossism.mjs` research gate) |
| Synthesis + structure | S3 ~l.523 | one model call: arc, chapters, retention map, open-loop ledger, emotion curve. Code validates only the chapter plan's clock (`validateChapterPlan`), repairs up to 2 times |
| Bibles | S4 ~l.543 | look, music, pronunciation (not script quality) |
| Chapter writing | S5 per chapter ~l.558 | one call per chapter with S2+S4 and the last 2 lines of the previous chapter. Code checks clock, IDs, words per scene, banned phrases (`scene-lines.mjs checkChapter`); find/replace repairs up to 2 times. Machine-sounding/preachy lint only for story films |
| QA | ~l.605 | code checks the whole film + hook rules + text-card share; then the **same model** returns mustFix find/replace edits; an edit that breaks a code check is reverted. Long films: chapter by chapter, no cross-chapter comparison |
| Viewer panel | ~l.679 | same model, different system prompt, reads only the **first ~2 minutes**, gives a stay score and fixes |
| Edit Director, media, S6, S7, originality | ~l.716-800 | edit and pictures; S7 packaging; originality vs the channel's earlier films |

## 4. Bossism's seven gates: creative quality or structure?

Gates are in `reviewRun()` (`bossism.mjs:253`). **They are almost entirely
structural and evidential, not creative.**

- Research: fact count, sites (≥4), share of unconfirmed numbers, exact-match contradictions.
- Claims: every claim ID a scene cites exists in S2. It does **not** check that the
  narration says what the claim says.
- Script: chapters exist and pass the code checks.
- Story (not critical): the same model's stay score for the opening, regex hook
  rules, pictures held too long. Nothing about the middle or the end of the film.
- Pictures, Rights, Packaging: coverage, licences, credits, title rules, originality.

Revision (`revisionPlan`/`applyRevision`, `bossism.mjs:449-495`): **one round**
(`LIMITS.maxRevisions = 1`), notes sent back to the stage that made the defect.

| Problem | Can it be found? | Can it be fixed? |
|---|---|---|
| Weak opening | partly (hook regex, same-model stay score) | yes, C1 rewrite with notes, once |
| Unsupported claims | only an unknown claim ID; uncited or misquoted sentences pass | partly |
| Repetitive writing | **no check** | no |
| Poor transitions | **no check** (only 2 lines of the previous chapter are given) | no |
| Low-retention middle sections | **no check** (the retention map is written but never measured) | no |
| Weak storytelling overall | only via same-model QA, not a gate | no gate forces it |

## 5. Implemented vs verified

- **Implemented in code:** everything in section 3; the gates and one-round revision.
- **Automated tests:** per `docs/ENGINEERING_STATE.md` 246 tests pass, all with fake
  models. I did not re-run them in this audit.
- **Verified with real models/APIs:** **nothing in the script path.** No real Claude,
  Gemini or local-model run, no live Wikipedia run has ever happened (same doc, §6).
- **Not implemented:** independent critic, repetition/transition/mid-film retention
  checks, academic search, freshness, geography, Bangla/Arabic scripts, parallel stages.

## 6. End-to-end test: not run (blocked)

Not run, nothing fabricated. In this sandbox: no `ANTHROPIC_API_KEY` or Gemini key
for the studio, no local model, and the proxy blocks `en.wikipedia.org` (403).
To run 3 topics, one of:
1. A Claude or Gemini API key for the studio (costs money: the owner's decision), or
2. The owner's machine with a 30B-class local model (Ollama) and internet for
   Wikipedia, then `node local/run-film.mjs` for a 5-minute film per topic.
Suggested topics: a science story, a historical event, a business/person story.
Judge each by the S2 ledger vs real sources, S5 chapters, viewer.json and the gates.

## 7. Critical weaknesses

1. Never run with a real model: nothing about script quality is known.
2. The same model writes, checks and judges itself.
3. Gates measure structure; creative quality has no gate past the opening.
4. Research depth is one search call (or Wikipedia-only for local brains).
5. Claims gate checks IDs, not meaning.
6. One revision round, find/replace fixes only.

## 8. Roadmap (priority order, not started)

1. **First real run, 3 topics, 5 minutes** (local model or a key the owner approves).
   Why: every other decision depends on seeing real output.
2. **Independent critic** (second model) for QA and the story gate. Why: self-review misses its own faults.
3. **Script-quality checks in code + critic:** repetition, transitions between
   chapters, retention map vs actual scenes, emotion curve vs scenes. Why: these are the gaps in section 4.
4. **Claim-meaning check:** each cited sentence compared with its ledger row. Why: stops unsupported claims.
5. **Deeper research:** multi-round search, counter-evidence round, freshness for changing facts. Why: research depth limits everything after it.
6. **Revision that rewrites, not patches**, more than one round with a budget. Why: weak structure cannot be fixed by find/replace.
7. Bangla script writer and reviewer. Why: the owner's audience.

## Appendix: all 151 roles (generated from `ROLE_STATUS`)

Format: role id | name | status | what does the job.


## research (Research & Evidence)
- research-primary-source|Primary Source Scout|model|research stage: the brain's own web search (Claude, Gemini) or, for a brain that cannot search, the code research desk (research-desk.mjs: Wikipedia, the pages its articles cite and the owner's SearXNG; facts may cite only pages it opened); code drops every fact without a source URL, then opens every cited page (source-check.mjs) and drops facts whose pages are gone
- research-fact-ledger|Claim Ledger Analyst|model|S2 claim ledger
- research-date-check|Chronology & Date Auditor|model|S2 ledger and the QA facts pass
- research-statistics|Statistics Verifier|model|S2 ledger: values, units and conversions
- research-peer-review|Academic Literature Scout|planned|no search of academic literature yet
- research-counterevidence|Counter-Evidence Hunter|model|research stage records conflicts between sources
- research-geography|Geography & Place Verifier|planned|places are not verified separately yet
- research-people-orgs|People & Organization Verifier|model|research stage (people not to confuse) and the named-subject rules
- research-source-diversity|Source Independence Auditor|code|source-check.mjs counts sites per fact and per film; numbers resting on one site are named in S2, under 4 sites is a gap
- research-freshness|Source Freshness Monitor|planned|no re-check of facts that change over time yet

## story (Transcript & Story)
- story-transcript-integrity|Transcript Integrity Auditor|built|voice-scenes.mjs: checkVoiceChapter finds every changed, added or missing word against the recording's transcript and restoreVoiceFields puts the transcript's words and times back; no film run calls it yet (voice mode is not wired)
- story-chapter-arc|Chapter Arc Architect|model|S3; code checks that the chapters tile the film
- story-opening-hook|Opening Hook Specialist|model|S3 and S5 (30-second hook rule); code reads the hook (no announcing opener, one concrete number, name or place, a first sentence that lands) and what QA leaves wrong is a gap
- story-open-loops|Open-Loop Editor|code|S3 loop ledger; code checks every opened loop is paid
- story-exposition|Complexity-to-Clarity Editor|planned|no separate clarity pass yet
- story-narration|Spoken-Language Editor|model|S5; code checks words per scene and banned phrases
- story-continuity|Narrative Continuity Editor|model|S4 continuity rules and the QA passes
- story-emotional-arc|Emotional Arc Analyst|model|S3 emotion curve and the 'written to be felt' rule
- story-ending|Ending & Payoff Editor|model|S3 and S5 (payoff, last image and line)
- story-script-coverage|Narration Coverage Auditor|code|scene-lines.mjs: words against seconds for every scene

## cinematography (Cinematography & Visual Direction)
- cinematography-visual-director|Visual Director|model|S5 shots: evidence or illustration rung per shot
- cinematography-composition|Composition Specialist|planned|picks are not judged for composition yet
- cinematography-lens-language|Lens & Perspective Specialist|model|S4 look: lens kit
- cinematography-camera-motion|Camera Motion Designer|code|renderer: push-ins and slow motion from the MOTION field; the Edit Director's punch-ins and camera shakes
- cinematography-lighting|Lighting Continuity Specialist|planned|no lighting continuity check yet
- cinematography-environment|Location & Environment Scout|model|S4 locations
- cinematography-archive-language|Archival Visual Specialist|model|S5 rungs; renderer archive look
- cinematography-visual-metaphor|Visual Metaphor Specialist|planned|not built yet
- cinematography-shot-variety|Shot Variety Analyst|code|media step: no clip twice within 10 minutes
- cinematography-accessibility|Visual Accessibility Reviewer|planned|no contrast or flashing check yet

## animation (Animation & Motion Graphics)
- animation-motion-director|Motion Design Director|model|S4 motion-graphics style
- animation-map-motion|Map Animation Specialist|code|maps.mjs: animated maps from public-domain Natural Earth shapes (country lit, pin, name, push-in) and route lines that draw themselves between two places, for FX-MAP shots with coordinates
- animation-data-graphics|Data Visualization Specialist|code|renderer: counter cards and animated bar charts (FX-CHART, eased bars from the shot's own numbers)
- animation-kinetic-type|Kinetic Typography Specialist|code|renderer: FX-KINETIC kinetic type, line by line; highlighter sweeps on documents and underlines (FX-HIGHLIGHT), measured to the words
- animation-diagram-builder|Diagram & Explainer Specialist|planned|not built yet
- animation-2d-animation|2D Animation Specialist|planned|not built yet
- animation-3d-visualization|3D Visualization Specialist|planned|not built yet
- animation-parallax|Parallax & Depth Specialist|code|renderer: 2.5D parallax on portrait and square archive photos; prints in a white border with a shadow and focus zooms toward one part, chosen by the Edit Director
- animation-transition-logic|Transition Logic Designer|code|renderer: whip pans, slides, zoom-throughs, flashes, glitches (torn colour and noise), light leaks, dips to black and chapter dips from the TRANS field and the Edit Director
- animation-fx-qc|Effects Quality Controller|planned|not built yet

## footage (Footage Discovery & Rights)
- footage-asset-strategist|Asset Search Strategist|model|S5: search queries per shot
- footage-exact-match|Exact Asset Finder|model|footage desk: the brain looks at the thumbnails of each shot's candidates; when the brain cannot see pictures the desk is skipped, the first search result is kept and it is listed as a gap
- footage-provider-coverage|Provider Coverage Auditor|code|media step: Pexels, Pixabay and the archives (Wikimedia Commons, NASA, Library of Congress, Smithsonian, the Met, Art Institute of Chicago, Openverse) searched per shot; archive (R2) shots look there first
- footage-metadata|Media Metadata Auditor|code|media step: source page, creator and licence kept per clip
- footage-license|License Term Reviewer|code|media step: a clip is kept only when its item-level licence is Pexels, Pixabay, CC0, public domain, US-government public domain or CC BY (FREE_LICENCES); share-alike and non-commercial files are never kept
- footage-attribution|Attribution Writer|code|renderer licence report; S7 credits block
- footage-duplicate-assets|Duplicate & Reuse Detector|code|media step: no clip twice within 10 minutes
- footage-scene-fit|Scene-to-Footage Matchmaker|model|footage desk (only when the brain can see pictures)
- footage-release-risk|Release & Property Risk Reviewer|model|footage desk rejects faces, brands, plates and watermarks where the shot avoids them (only when the brain can see pictures)
- footage-rights-gate|Rights Gatekeeper|code|nothing without a licence record is rendered

## editing (Editorial & Timeline)
- editing-runtime|Runtime Controller|code|scene-lines.mjs clock and the frame-exact timeline
- editing-pace|Pacing Analyst|model|S3 retention map; code checks words per scene; the Edit Director places punch-ins, shakes and sound hits, capped and spaced in code
- editing-coverage|Coverage Editor|code|media step lists every shot with no fitting clip as a GAP
- editing-cut-logic|Cut Logic Specialist|model|S5 transitions; the Edit Director stage (edit-C1.json per chapter) re-chooses each scene's transition, checked in code (known words, never two named in a row)
- editing-timeline-integrity|Timeline Integrity Auditor|code|timeline.mjs: frame-exact edit list
- editing-continuity-match|Visual Match Editor|planned|not built yet
- editing-b-roll-balance|B-roll Balance Editor|code|QA is given each chapter's share of planned text cards; over 40% it must swap cards for real pictures
- editing-chapter-transitions|Chapter Transition Editor|code|renderer: chapter dips and chapter titles
- editing-intro-outro|Intro & Outro Editor|planned|not built yet
- editing-edit-qc|Edit Decision Quality Reviewer|code|renderer checks the finished master for black stretches

## audio (Voice, Sound & Music)
- audio-voice-sync|Voiceover Sync Analyst|code|captions on the voice's word timings; voice placed per scene
- audio-noise|Noise & Room-Tone Reviewer|code|studio voice check: noise floor and SNR
- audio-dialogue-level|Dialogue Level Controller|code|renderer mix: voice over music and effects
- audio-ducking|Music Ducking Specialist|code|renderer: music ducks under the voice
- audio-sound-effects|SFX Editor|code|sound-kit.mjs: CC0 effects from Freesound per scene
- audio-music-arc|Music Arc Composer|code|S3 music arc and S4 cues; music-kit.mjs composes one track per cue
- audio-loudness|Loudness & Peak Auditor|code|renderer: loudness normalised to -14 LUFS and measured on the master
- audio-silence|Silence & Pause Editor|model|rule: silence before the moving scene of each chapter
- audio-pronunciation|Pronunciation & Names Reviewer|code|S4 writes the pronunciation lexicon; render/voice.mjs sends the names as it spells them to the voice and the captions keep them as written (ElevenLabs path)
- audio-audio-qc|Audio Mix Quality Controller|code|renderer measures the master's loudness and true peak

## color (Color, Finishing & Encoding)
- color-color-match|Shot Matching Colorist|code|renderer: one master grade per look
- color-exposure|Exposure Auditor|planned|not built yet
- color-white-balance|White Balance Specialist|planned|not built yet
- color-skin-tone|Skin Tone Fidelity Reviewer|planned|not built yet
- color-look-dev|Look Development Artist|code|S4 look; renderer looks: documentary, cinematic, archive
- color-archive-grade|Archival Grade Specialist|code|renderer archive look
- color-artifact-check|Image Artifact Reviewer|planned|not built yet
- color-subtitle-style|Subtitle Styling Specialist|code|renderer captions; word-highlight captions in Shorts
- color-encode|Encoding & Bitrate Auditor|code|renderer: H.264 with a bitrate cap
- color-final-master|Mastering QC Reviewer|code|renderer: MP4 master, SRT and licence report

## quality (Fact, Safety & Technical QA)
- quality-hallucination|Hallucination & Unsupported-Claim Auditor|model|QA facts pass against the S2 ledger; code first looks for every number on its cited pages (verified / unconfirmed)
- quality-defamation|Defamation & Allegation Reviewer|model|named-subject rules and the QA rights pass
- quality-sensitive-context|Sensitive-Context Reviewer|model|sensitive-subject rules and the QA passes
- quality-artifact-qc|Visual Artifact QC Agent|planned|not built yet
- quality-subtitle-text|Subtitle Text Auditor|code|captions are made from the narration itself
- quality-timeline-qc|Timeline Technical Auditor|code|scene-lines.mjs checks the whole film
- quality-license-qc|License Manifest Auditor|code|licence record per clip; renderer licence report
- quality-claim-language|Certainty & Attribution Auditor|model|QA facts pass; code bans listed phrases
- quality-accessibility-qc|Accessibility QA Agent|planned|not built yet
- quality-release-gate|Pre-Export Release Gate|code|a film is done only with no GAP; every GAP is listed

## audience (Audience, Retention & Distribution)
- audience-retention|Retention Curve Analyst|model|S3 retention map and the retention rule; code ties each published film's YouTube retention curve to its scenes (retention.mjs) and S3, S5 and the Edit Director read the channel's lessons
- audience-audience-fit|Audience Fit Researcher|model|S1 angle and audience, against the videos that already won on the topic (market.json)
- audience-title|Title & Promise Auditor|model|S1 titles and S7, given the topic's proven YouTube outliers (market stage, with YOUTUBE_API_KEY); code flags an invented story whose title claims truth and a title too close to an existing video
- audience-thumbnail|Thumbnail Composition Reviewer|code|S1/S7 briefs; thumbnails.mjs makes three for Test & Compare
- audience-first-minute|First Minute Reviewer|model|S3 and S5 hook
- audience-midpoint|Midpoint Re-Engagement Reviewer|model|S3 midpoint turn
- audience-cta|Call-to-Action Editor|model|S7 call to action
- audience-platform-specs|Delivery Specs Auditor|code|cuts.mjs: 9:16 Shorts and the 4:5 Facebook cut
- audience-metadata|Metadata & Search Relevance Editor|model|S7 description, chapters and tags
- audience-panel-review|Audience Panel Synthesizer|model|the manual's silent expert panel before each stage; after QA a separate viewer panel (five target viewers, no manual, no plan) cold-reads the first two minutes, says where it would leave, and its fixes are kept only if every code check passes

## intake (Intake & Understanding)
- intake-transcriber|Speech-to-Text Transcriber|planned|no speech-to-text yet
- intake-language-detector|Language & Script Detector|code|studio: content-intel.mjs
- intake-recitation-identifier|Recitation Identifier|built|quran.mjs: matchRecitation finds the surah, the ayat and each ayah's times in a transcript against the shipped Tanzil text; there is no speech-to-text yet, so no run calls it
- intake-content-classifier|Content Classifier|code|studio: content-intel.mjs
- intake-intent-interpreter|Intent Interpreter|code|studio: spelling fixes and mode
- intake-fact-fiction-judge|Fact or Fiction Judge|code|studio: true story or invented story
- intake-rights-intake|Rights Intake Officer|planned|not built yet
- intake-version-planner|Version Planner|code|studio plan (only the English version can be made today)
- intake-duration-planner|Duration & Scale Planner|code|studio plan and the cost estimate
- intake-brief-writer|Production Brief Writer|code|film-run.mjs: the production brief

## voice (Voice Studio)
- voice-recording-analyst|Recording Analyst|code|studio voice check (loudness, peak, SNR, clipping)
- voice-voice-guardian|Voice Preservation Guard|code|the owner's takes are used exactly as recorded
- voice-repair-engineer|Repair Engineer|planned|no noise repair yet
- voice-tone-dynamics|Tone & Dynamics Engineer|planned|not built yet
- voice-loudness-engineer|Loudness Engineer|code|gain to target in the studio; loudness in the renderer
- voice-elevenlabs-operator|ElevenLabs Voice Operator|code|voice.mjs: one take per scene with word timings
- voice-pronunciation|Pronunciation Lexicon Keeper|code|render/voice.mjs applies S4's pronunciation lexicon to the text sent to the voice (ElevenLabs path)
- voice-pacing-editor|Pacing & Pause Editor|code|words per scene; a capped speed-up when a take runs long
- voice-music-supervisor|Music Supervisor|code|music-kit.mjs and the mix
- voice-mix-engineer|Mix Engineer|code|renderer mix

## quran (Quran & Islamic Content)
- quran-ayah-aligner|Ayah Timing Aligner|built|quran.mjs matchRecitation and quran-film.mjs planQuranFilm: one scene per ayah from the transcript's word times; not wired to a run or a render yet
- quran-text-guardian|Quran Text Guardian|built|quran-film.mjs: the on-screen text is Tanzil's, verbatim by surah:ayah, and checkQuranFilm refuses a plan with changed text; not wired yet
- quran-reference-checker|Reference Checker|built|quran.mjs: a passage found in several places lists every place and goes to review instead of being guessed; not wired yet
- quran-translation-curator|Translation Curator|planned|Quran films are not made yet
- quran-meaning-researcher|Meaning & Context Researcher|planned|Quran films are not made yet
- quran-visual-matcher|Ayah Visual Matcher|planned|Quran films are not made yet
- quran-visual-adab-guard|Visual Adab Guard|planned|quran-film.mjs lists the rules (no depiction, no faces), but no picture is chosen for a Quran film yet, so nothing checks one; the owner's questions on imagery are open (docs/STUDIO_STATUS.md section 6)
- quran-recitation-editor|Recitation Editor|built|quran-film.mjs: cuts only in the quiet between ayat and checkQuranFilm refuses any cut inside an ayah or any sound under the recitation; not wired yet
- quran-arabic-typographer|Arabic Typographer|planned|Quran films are not made yet
- quran-islamic-reviewer|Islamic Audience Reviewer|planned|Quran films are not made yet

## screenplay (Story & Screenplay)
- screenplay-premise-architect|Premise Architect|model|S1 and the S2 story bible (story mode)
- screenplay-era-researcher|Era & World Researcher|model|research stage: real-world details of the time and place
- screenplay-character-designer|Character Designer|model|S2 story bible and the S4 LOOK line per character
- screenplay-plot-architect|Plot & Twist Architect|model|S3 story architecture: plot, turns and chapters
- screenplay-hook-doctor|Hook Doctor|model|S3 and S5 hook
- screenplay-money-path-auditor|Money Path Auditor|model|S2 money path
- screenplay-scene-writer|Scene Writer|model|S5 scene lines, every scene in order
- screenplay-narration-writer|Narration Writer|code|S5; code flags machine-sounding or preachy writing
- screenplay-realism-auditor|Realism & Anti-Robotic Auditor|model|S2 realism ledger from the research
- screenplay-ai-scene-director|AI Scene Director|code|ai-scenes.mjs: one cast, a real person is never made
- screenplay-fiction-label-guard|Fiction Label & Ethics Guard|code|the description note is added in code; a title claiming truth is flagged

## versions (Language Versions)
- versions-arabic-writer|Arabic Transcreator|planned|only the English version can be made today
- versions-english-writer|English (USA) Transcreator|model|S5 in English (USA)
- versions-bangla-writer|Bangla Transcreator|planned|only the English version can be made today
- versions-arabic-reviewer|Arabic Audience Reviewer|planned|only the English version can be made today
- versions-english-reviewer|US Audience Reviewer|model|QA language pass
- versions-bangla-reviewer|Bangladesh Audience Reviewer|planned|only the English version can be made today
- versions-numerals-typography|Numerals & Typography Checker|planned|only the English version can be made today
- versions-separation-guard|Version Separation Guard|code|scene-lines.mjs: narration language check
- versions-subtitle-builder|Subtitle Builder|code|SRT from the narration and the voice timings
- versions-packaging-localizer|Title & Thumbnail Localizer|planned|only the English version can be made today
