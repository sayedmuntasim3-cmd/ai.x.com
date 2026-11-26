# Initial platform audit (W1, 26 Nov 2026)

Method: read code and workflows on `origin/main` (`ed38c41`), grep for call sites, compare against `docs/ROADMAP.md`,
`docs/missions/M1-M6` and `ROLE_STATUS`. PR text was not used as proof. **I did not re-run the test suites**; "tests exist" means a test file exists and CI ran it on merge (see CI). Anything I did not run is marked "not verified".

## 1. Complete vs claimed (M1-M6, ledger, light studio)

| Item | Claimed | What I verified in code | What is missing or unverified |
|---|---|---|---|
| M1 reference study | done (PR #40, #43, #56) | `GET /api/videos` route merged (mission log); `tools/research/` analysers; 46 owner links measured (`docs/research/OWNER_LINKS_ANALYSIS`); 12-niche doc (PR #56) | craft numbers are public-source measures, marked "sourced" or "my reading" (PR #56); no trained taste model; the roadmap's USA engineering niche is not yet in the numbers |
| M2 director + shot plan | done (PR #41) | `engine/src/shot-plan.mjs` `planShots` (:406) and `directEdit` (:658) are called at `local/voice-film.mjs:438` and `:455`; shot types feed `render/graphics/from-shot.mjs` (called at `render/render-film.mjs:542`) | quality of the plan is a free-brain output (Groq, Gemini pool), unmeasured; the 3-min test shows the plan could not choose pictures (postmortem) |
| M3 asset engine ("eyes") | done (PR #37, #39) | `render/asset-rank/rank.py` + `rerank.mjs` run only from `.github/workflows/voice-film.yml:164` (CPU OpenCLIP on a runner), written as "never stops the film"; archives and relay in `film-media.mjs` | nothing in `local/` calls it, so a local run has **no ranking**; the 3-min test film got 0 automatic picks; the aesthetic head is a CLIP prompt (mission log: "Not done: a trained aesthetic head, Internet Archive video") |
| M4 graphics and depth | done | `render/graphics/` with `graphics.test.mjs` in `package.json` test; `graphicFor` called at `render/render-film.mjs:542`; maps, counters, splits appear in the test film (shots 5, 6, 14, 18, 36) | the quote card needed a test-only `graphic` patch (test-film SHOTLIST); depth shots in the test film: 0 (`report.stats.depthShots`) |
| M5 sound design | done | `engine/src/score-plan.mjs` + `render/score-synth.mjs` (with test); run from `.github/workflows/voice-film.yml:202` and `render-film.yml:135` | the test film was built locally, played 0 music cues, 2 sound effects, mono audio; no music loudness or ducking measurement is reported |
| M6 critic and QC | done | `render/critic.mjs` (+ test) called at `render/render-film.mjs:1183`; release gate in `render/release-gate.mjs` | the critic measures black frames, loudness, duplicates, placeholders; it does not judge picture-to-sentence fit, era, place or a stranger as the subject (see postmortem 13 of 55 shots fail) |
| Craft Ledger | live (PR #57 "learn on the voiceover path") | `engine/src/craft-memory.mjs` (`calibratedDoctrine`, `rhythmFrom`, `craftIndex`) imported by `local/voice-film.mjs:47`; `render-film.mjs:1342` records each film via `local/craft-memory.mjs` | it learns only from the films that were run (a handful); a ledger of few films is not a taste; not verified that calibrated rhythm changes a plan (no before/after run) |
| Light studio | ten free films a day (`docs/LIGHT_STUDIO.md`) | `local/light-studio.mjs` exists; fills every shot from **Wikimedia Commons stills only** (:10, :39 `wikimediaProvider`) | no video clip, no archive footage, no NARA/LOC/NASA/HAER; so it can make illustrated slideshows, not documentary footage; not run by me |
| Voiceover to video | works on production (film 993f09ea, 39:46, 1080p, release gate passed) | workflow `.github/workflows/voice-film.yml` exists | that film passed the gate; the gate does not check picture fit. The 3-min proof shows what fitting looks like when picking is by hand |
| Idea to video | parked | worker brain, Gemini free limit 20 requests per day per model (CLAUDE.md, measured) | cannot finish a film on the free key |

## 2. CI history

- `main` was **red from 24 to 26 Nov** because the platform tests needed Playwright Chromium and CI did not install it. Fixed by PR #54
  (commit `6954292`, "CI: install Playwright Chromium for the platform tests (red since 24 Nov)"). Merges #56 and #57 followed on the same day.
- I did not query workflow runs for the exact failing runs; the red window is from the commit message. Not verified further.
- PRs merged in the last days: #53, #54, #56, #57.

## 3. Open pull requests and unmerged branches

Open PRs (GitHub, 26 Nov):

| PR | Title | Status |
|---|---|---|
| #55 | Docs: the owner's film standard (OWNER_BRIEF.md) and the Boss's authority | open, docs only; branch `claude/zupona-boss` |
| #6 | Documentary scripts with a Cloudflare Worker (Gemini, Groq fallback) | open on purpose (CLAUDE.md: sets a different Worker entry); never delete |
| #4 | Search 30 open image archives from one Visual library | open on purpose (a different Worker entry); never delete |

Unmerged remote branches (kept; none is deleted or touched): `ccr-00e313f2-4u4e00` (landing page), `ccr-2867bb13-8ohb4z`, `ccr-3f6f211f-agtnzh` (PR #6),
`ccr-48feac19-2ao1hq`, `ccr-5d51ed58-vk6gaw`, `ccr-c21902ce-p7sii2` (PR #4), `ccr-c97a0fe4-29t1l0`, `ccr-cb190ece-ukm6vg`, `ccr-cd4452ea-fvd6po`, `ccr-d2a6b2aa-chfb81`,
`claude/footage-first`, `claude/m2-director`, `claude/m2-free-brain`, `claude/m2-shot-plan`, `claude/m2-slice`, `claude/m3-eyes`, `claude/m4-depth`, `claude/m4-graphics-depth`,
`claude/stock-relay-owner`, `claude/studio-first-screen-y4tp15`, `claude/test-film-3min` (the proof folder; **not merged**, its `render-film.mjs` loudness fix may or may not be on main: not checked),
`claude/zupona-product-business`, `claude/zupona-studio-audit-stabilization-wrtgn1`, `claude/zupona-voiceover-system`, `freebuff/6053529be14d5bcfbe3d4819`, `m1-12-niches`, `m1-reference-study`, `m1-videos-route`.
Several of these are probably merged already (M1 to M4 PRs merged); I did not check each against main.

## 4. Agent table (151 roles, from `engine/src/agent-roster.mjs` `ROLE_STATUS`, line 312)

Counts: **code 68, model 42, planned 35, built 6 = 151.**
- `planned` (35): no code, no prompt. They are cinematography (4), animation (4), color (4), quality (2), versions (6), quran (6), research (3), intake (2), voice (1), editing (2), story (1).
- `built` (6): code exists and has tests but **no run calls it** (the roster note says so for the Quran roles; `story-transcript-integrity` lives in `voice-scenes.mjs`).
- `model` (42): a prompt stage; the output is whatever the free brain writes. No code verifier unless the note names one.
- `code` (68): a code module; a call site exists in the repo (import or workflow), which does not prove it ran on every film.

**Column rules.** Invocation = first file:line where the module the roster note names is imported or called (an import line proves the code is reachable, not that it ran; "model prompt" = the stage in `film-run.mjs` or `local/voice-film.mjs`). Input = roster mission, Output = roster deliverable (trimmed). Verification = what I could confirm. Defect = what is wrong or missing. I filled Invocation by script from the roster notes; I did not trace each execution.

| Role | Status | Invocation | Input | Output | Verification | Defect |
|---|---|---|---|---|---|---|
| research-primary-source | model | model prompt (stage in engine/src/film-run.mjs:25) | Find direct records, original research, official documents, first-part | A short list of direct sources, the claims each can support, and missi | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| research-fact-ledger | model | model prompt (stage in prompts/*.txt) | Turn factual statements into individually testable claims with a sourc | A numbered claim ledger marking supported, disputed, dated, inferred,  | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| research-date-check | model | model prompt (stage in prompts/*.txt) | Check dates, time periods, event order, and whether a source is contem | A timeline of date risks and corrections to investigate. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| research-statistics | model | model prompt (stage in prompts/*.txt) | Check quantities, units, denominators, geography, sample sizes, and wh | A numeric-claim audit with units, context, and missing metadata. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| research-peer-review | planned | none | Identify relevant peer-reviewed papers, methods, sample limitations, a | A source map of studies, methods, limitations, and disagreements. | none | Not built |
| research-counterevidence | model | model prompt (stage in prompts/*.txt) | Search for credible disconfirming evidence, alternative explanations,  | The strongest counter-evidence and how it changes the narrative. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| research-geography | planned | none | Verify place names, borders, maps, distances, geographic context, and  | A place/map verification checklist. | none | Not built |
| research-people-orgs | model | model prompt (stage in prompts/*.txt) | Check names, roles, organizational affiliations, quotations, and ident | An identity and attribution audit; flag unverified allegations. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| research-source-diversity | code | engine/src/film-run.mjs:26 | Detect circular citations, copied reports, one-source dependence, and  | A source-independence matrix and weakly corroborated claims. | unit tests (not re-run per role) |  |
| research-freshness | planned | none | Check whether important facts, laws, figures, office-holders, or techn | A freshness table with last-checked dates and recheck-needed items. | none | Not built |
| story-transcript-integrity | built | engine/src/shot-plan.mjs:15 | Compare the supplied narration and proposed scenes without silently ad | A list of omitted, reordered, repeated, or unsupported narration spans | unit test only; no run calls it | Not wired into any run |
| story-chapter-arc | model | model prompt (stage in prompts/*.txt) | Test the chapter progression, stakes, causality, and whether each chap | A chapter-by-chapter arc with structural gaps. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| story-opening-hook | model | model prompt (stage in prompts/*.txt) | Evaluate the first 30–60 seconds for specificity, clarity, curiosity,  | A hook scorecard and revised options that do not overpromise. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| story-open-loops | code | studio UI / renderer (no single call site named) | Track questions raised, answered, delayed, and abandoned across the ru | An open-loop ledger with payoff timestamps/chapters. | unit tests (not re-run per role) |  |
| story-exposition | planned | none | Find dense passages, unexplained concepts, missing definitions, and ju | A plain-language clarity pass with exact locations. | none | Not built |
| story-narration | model | model prompt (stage in prompts/*.txt) | Check whether the narration sounds natural aloud in its version's lang | Spoken-language edits that preserve meaning and claim boundaries. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| story-continuity | model | model prompt (stage in prompts/*.txt) | Check names, terms, dates, causal links, chapter recaps, pronouns, and | A continuity issue list ordered by severity. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| story-emotional-arc | model | model prompt (stage in prompts/*.txt) | Map tension, empathy, relief, wonder, and reflection so emotion follow | An emotion/pacing curve and sections that feel flat or forced. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| story-ending | model | model prompt (stage in prompts/*.txt) | Check whether the ending pays off the central question, handles unreso | Ending strengths, unresolved questions, and payoff recommendations. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| story-script-coverage | code | engine/src/bossism.mjs:26 | Estimate whether each planned scene has enough spoken words for its in | Scene-level narration coverage and likely timing mismatches. | unit tests (not re-run per role) |  |
| cinematography-visual-director | model | model prompt (stage in local/voice-film.mjs:46) | Define visual intent for each beat and distinguish illustration from l | A scene-level visual intent pass and missing visual beats. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| cinematography-composition | planned | none | Review focal hierarchy, framing, negative space, foreground/background | Composition notes for each scene or visual family. | none | Not built |
| cinematography-lens-language | model | model prompt (stage in prompts/*.txt) | Recommend shot scale, perspective, lens feel, depth of field, and when | A camera/lens vocabulary plan with reasons. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| cinematography-camera-motion | code | engine/src/film-run.mjs:21 | Plan restrained pans, tilts, push-ins, reveals, and locked shots witho | A motion plan and shots that should remain still. | unit tests (not re-run per role) |  |
| cinematography-lighting | planned | none | Check light direction, contrast, time-of-day plausibility, and continu | Lighting continuity notes and correction priorities. | none | Not built |
| cinematography-environment | model | model prompt (stage in prompts/*.txt) | Specify believable locations, weather, season, and environmental detai | A scene-to-environment brief and uncertain details. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| cinematography-archive-language | model | model prompt (stage in prompts/*.txt) | Differentiate genuine archival material, contemporary illustrative foo | Archival authenticity labels and safe substitute suggestions. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| cinematography-visual-metaphor | planned | none | Use visual metaphors only when they clarify a concept and cannot be mi | Metaphor opportunities plus misinterpretation warnings. | none | Not built |
| cinematography-shot-variety | code | studio UI / renderer (no single call site named) | Detect repetitive shot sizes, repetitive stock imagery, visual fatigue | A visual variety matrix across chapters. | unit tests (not re-run per role) |  |
| cinematography-accessibility | planned | none | Review contrast, safe text area, flashing, motion intensity, subtitle  | Accessibility issues and minimum fixes. | none | Not built |
| animation-motion-director | code | engine/src/film-run.mjs:21 | Set the overall motion grammar, pacing, easing, and restrained use of  | A consistent motion-design brief. | unit tests (not re-run per role) |  |
| animation-map-motion | code | render/render-film.mjs:17 | Plan accurate map pans, zooms, route lines, labels, projection choices | Map shot plans and geographic-data requirements. | unit tests (not re-run per role) |  |
| animation-data-graphics | code | studio UI / renderer (no single call site named) | Choose chart forms that honestly encode the data and avoid misleading  | Chart specifications with source and axis rules. | unit tests (not re-run per role) |  |
| animation-kinetic-type | code | studio UI / renderer (no single call site named) | Plan readable animated words, emphasis, timing, and hierarchy without  | Typography beats and timing notes. | unit tests (not re-run per role) |  |
| animation-diagram-builder | planned | none | Convert complex processes into accurate diagrams with explicit relatio | Diagram blueprints and source-backed relationships. | none | Not built |
| animation-2d-animation | planned | none | Identify where shape animation, paths, masks, and layered cutouts clar | 2D shot recommendations and build notes. | none | Not built |
| animation-3d-visualization | planned | none | Specify when a 3D model or spatial visualization is worth building, wh | 3D shot options, model requirements, and authenticity labels. | none | Not built |
| animation-parallax | code | studio UI / renderer (no single call site named) | Identify safe uses of depth/parallax on licensed stills without fabric | Still-image animation notes and artifact risk. | unit tests (not re-run per role) |  |
| animation-transition-logic | code | engine/src/film-run.mjs:21 | Select transitions motivated by time, place, evidence, or concept rath | Transition pairs with motivation and duration ranges. | unit tests (not re-run per role) |  |
| animation-fx-qc | planned | none | Check for visual artifacts, jitter, clipping, inconsistent easing, ove | Effects QA checklist and failure severity. | none | Not built |
| footage-asset-strategist | model | model prompt (stage in local/voice-film.mjs:46) | Translate each scene into precise search queries and identify the best | Per-scene query packs and likely providers. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| footage-exact-match | code | studio UI / renderer (no single call site named) | Rank actual item-page candidates by relevance, shot content, length, a | A ranked candidate shortlist with exact item URLs only. | unit tests (not re-run per role) |  |
| footage-provider-coverage | code | studio UI / renderer (no single call site named) | Identify when configured providers fail and route the gap to additiona | Provider gaps and next search routes. | unit tests (not re-run per role) |  |
| footage-metadata | code | studio UI / renderer (no single call site named) | Check duration, dimensions, frame rate when known, creator, date, loca | A metadata completeness table. | unit tests (not re-run per role) |  |
| footage-license | code | studio UI / renderer (no single call site named) | Flag editorial-only, non-commercial, attribution, share-alike, standal | Item-level rights flags; never claim legal clearance. | unit tests (not re-run per role) |  |
| footage-attribution | code | studio UI / renderer (no single call site named) | Create accurate attribution records from provider/item data and mark m | A credits/attribution manifest with unknowns left explicit. | unit tests (not re-run per role) |  |
| footage-duplicate-assets | code | studio UI / renderer (no single call site named) | Detect repeated assets and repeated compositions across the runtime. | Duplicate asset groups and substitution suggestions. | unit tests (not re-run per role) |  |
| footage-scene-fit | code | studio UI / renderer (no single call site named) | Score the semantic and visual fit between footage candidates and a sce | A scene-to-candidate match score with explanation. | unit tests (not re-run per role) |  |
| footage-release-risk | code | studio UI / renderer (no single call site named) | Flag recognizable people, private property, trademarks, minors, sensit | A release-risk list; anything unresolved blocks that shot automaticall | unit tests (not re-run per role) |  |
| footage-rights-gate | code | studio UI / renderer (no single call site named) | Block unresolved assets from export-ready status and verify required m | Pass/review/block decisions and reasons. | unit tests (not re-run per role) |  |
| editing-runtime | code | engine/src/bossism.mjs:26 | Check chapter/scene durations against the target runtime, stage depend | A runtime budget, critical-path risks, cost assumptions, and timing de | unit tests (not re-run per role) |  |
| editing-pace | model | model prompt (stage in local/voice-film.mjs:46) | Detect stretches with too little visual or narrative change and sectio | Pacing alerts tied to timecodes and suggested fixes. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| editing-coverage | code | studio UI / renderer (no single call site named) | Check whether footage/graphics cover the narration without irrelevant  | Coverage gaps and suggested insert types. | unit tests (not re-run per role) |  |
| editing-cut-logic | model | model prompt (stage in local/quran-locate.mjs:30) | Check whether cuts follow meaning, geography, action, evidence, or emo | Cut/transition recommendations with rationale. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| editing-timeline-integrity | code | engine/src/film-run.mjs:18 | Find overlaps, gaps, invalid timestamps, duration mismatches, ordering | A timeline and state validation report with exact scene IDs and recove | unit tests (not re-run per role) |  |
| editing-continuity-match | planned | none | Review visual continuity of direction, location, season, costumes, and | Visual continuity breaks and safer cut alternatives. | none | Not built |
| editing-b-roll-balance | code | studio UI / renderer (no single call site named) | Detect overuse of generic B-roll and ensure key claims receive appropr | A B-roll-to-claim coverage matrix. | unit tests (not re-run per role) |  |
| editing-chapter-transitions | code | studio UI / renderer (no single call site named) | Create clear narrative handoffs between chapters without redundant rec | Transition lines/beats and repeated-summary warnings. | unit tests (not re-run per role) |  |
| editing-intro-outro | planned | none | Audit title cards, cold open, end slate, and end pacing against the do | Intro/outro recommendations and timing. | none | Not built |
| editing-edit-qc | code | studio UI / renderer (no single call site named) | Review a proposed cut for distracting edits, dead air, jumpy tempo, un | Severity-ranked edit notes, recovery steps, and idempotency risks. | unit tests (not re-run per role) |  |
| audio-voice-sync | code | studio UI / renderer (no single call site named) | Compare narration text with word/segment timestamps and flag scenes wh | Word-timing coverage and sync-risk list. | unit tests (not re-run per role) |  |
| audio-noise | code | studio UI / renderer (no single call site named) | Detect likely noise, abrupt noise-floor changes, clipped tails, and mi | Audio cleanup tasks; state when measurements are unavailable. | unit tests (not re-run per role) |  |
| audio-dialogue-level | code | studio UI / renderer (no single call site named) | Recommend consistent dialogue loudness and identify clipping or weak p | Dialogue level targets and measured/unknown indicators. | unit tests (not re-run per role) |  |
| audio-ducking | code | studio UI / renderer (no single call site named) | Set music-under-voice behavior, fade points, and when music should dis | Ducking/fade automation plan. | unit tests (not re-run per role) |  |
| audio-sound-effects | code | .github/workflows/render-film.yml:117 | Recommend only motivated sound effects and flag manipulative or mislea | SFX placement and credibility warnings. | unit tests (not re-run per role) |  |
| audio-music-arc | code | render/score-synth.mjs:298 | Plan music energy across chapters, transitions, silence, and emotional | A music cue sheet with usage/licensing fields. | unit tests (not re-run per role) |  |
| audio-loudness | code | studio UI / renderer (no single call site named) | Check integrated loudness, true peak, codec headroom, and delivery tar | Measured values or a clear not-measured warning. | unit tests (not re-run per role) |  |
| audio-silence | model | model prompt (stage in prompts/*.txt) | Protect meaningful pauses while detecting accidental long silence or b | Pause annotations and fix-needed intervals. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audio-pronunciation | code | render/narrate.mjs:118 | Check difficult names, place names, acronyms, and Arabic, English and  | Pronunciation guide with sources and unresolved names. | unit tests (not re-run per role) |  |
| audio-audio-qc | code | studio UI / renderer (no single call site named) | Check sync, phase/mono concerns, abrupt edits, music clashes, and audi | Audio QA report and blocking defects. | unit tests (not re-run per role) |  |
| color-color-match | code | studio UI / renderer (no single call site named) | Match adjacent shots for exposure, contrast, white balance, and overal | Shot-match notes and order of correction. | unit tests (not re-run per role) |  |
| color-exposure | planned | none | Detect clipped highlights, crushed shadows, insufficient detail, and i | Exposure issues with scene references. | none | Not built |
| color-white-balance | planned | none | Find inconsistent color temperature/tint and recommend neutral-referen | White-balance match notes. | none | Not built |
| color-skin-tone | planned | none | Protect realistic skin tones and avoid stylized grades that misreprese | Skin-tone consistency review. | none | Not built |
| color-look-dev | code | studio UI / renderer (no single call site named) | Propose a restrained film look that supports the story while preservin | A look bible with shot-family variations. | unit tests (not re-run per role) |  |
| color-archive-grade | code | studio UI / renderer (no single call site named) | Keep archival treatment readable and labeled without manufacturing age | Archive treatment rules and authenticity warnings. | unit tests (not re-run per role) |  |
| color-artifact-check | planned | none | Look for banding, blocking, oversharpening, denoise artifacts, halos,  | Artifact log and correction priorities. | none | Not built |
| color-subtitle-style | code | studio UI / renderer (no single call site named) | Check typography, line breaks, placement, contrast, and mobile safe ar | Subtitle style rules and problematic subtitle IDs. | unit tests (not re-run per role) |  |
| color-encode | code | studio UI / renderer (no single call site named) | Check output resolution, frame rate, codec compatibility, file size, a | An export preset and validation checklist. | unit tests (not re-run per role) |  |
| color-final-master | code | studio UI / renderer (no single call site named) | Review visual and audio finishing requirements before the final master | A master-delivery checklist with explicit pass/block status. | unit tests (not re-run per role) |  |
| quality-hallucination | model | model prompt (stage in prompts/*.txt) | Find claims presented as facts without adequate support or where evide | A blocking unsupported-claim list. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| quality-defamation | model | model prompt (stage in prompts/*.txt) | Flag potentially harmful allegations about identifiable people/organiz | Legal-risk flags; unresolved items block export automatically. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| quality-sensitive-context | model | model prompt (stage in prompts/*.txt) | Review violence, tragedy, medical, political, or vulnerable-person con | Contextual safety notes and suggested safeguards. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| quality-artifact-qc | planned | none | Inspect provided frames/metadata for obvious generative artifacts, mal | Artifact reports; state when frames were not supplied. | none | Not built |
| quality-subtitle-text | code | studio UI / renderer (no single call site named) | Check subtitle spellings, punctuation, timing collisions, overflow, an | Subtitle error list and corrected text suggestions. | unit tests (not re-run per role) |  |
| quality-timeline-qc | code | engine/src/bossism.mjs:26 | Validate scene order, start/end times, frame boundaries, duplicate IDs | Technical timeline pass/review/block report. | unit tests (not re-run per role) |  |
| quality-license-qc | code | studio UI / renderer (no single call site named) | Block assets missing source page, creator, license evidence, and requi | Rights-manifest completeness report. | unit tests (not re-run per role) |  |
| quality-claim-language | model | model prompt (stage in prompts/*.txt) | Reduce overstatement, distinguish fact/opinion/allegation/estimate, an | Claim phrasing corrections and uncertainty labels. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| quality-accessibility-qc | planned | none | Check subtitle readability, flashing/motion risk, contrast, and whethe | Accessibility pass/review/block report. | none | Not built |
| quality-release-gate | code | studio UI / renderer (no single call site named) | Synthesize prior findings, privacy/secret risks, budget limits, failed | A final pass/review/block checklist with outstanding tests; never auto | unit tests (not re-run per role) |  |
| audience-retention | model | model prompt (stage in local/craft-memory.mjs:20) | Estimate where attention may drop based on pace, repetition, expositio | Likely drop-off points and specific fixes; do not claim actual analyti | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-audience-fit | model | model prompt (stage in prompts/*.txt) | Check audience assumptions, language register, cultural references, an | Audience-fit risks and validation questions. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-title | model | model prompt (stage in prompts/*.txt) | Create specific truthful titles whose promise is fulfilled by the actu | Title options and a promise-to-content check. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-thumbnail | code | render/render-film.mjs:40 | Plan a readable thumbnail focal point, contrast, and authentic evidenc | Thumbnail brief and misleading-visual warnings. | unit tests (not re-run per role) |  |
| audience-first-minute | model | model prompt (stage in prompts/*.txt) | Evaluate the opening minute for immediate context, visual change, and  | First-minute beat map. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-midpoint | model | model prompt (stage in prompts/*.txt) | Check whether the midpoint advances the argument or merely repeats the | Midpoint reset and new-information suggestions. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-cta | model | model prompt (stage in prompts/*.txt) | Recommend a restrained ending CTA only where natural and appropriate. | CTA wording options and placement. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-platform-specs | code | render/render-film.mjs:39 | Check platform aspect ratio, frame rate, subtitle formats, audio requi | A platform delivery checklist and unknowns. | unit tests (not re-run per role) |  |
| audience-metadata | model | model prompt (stage in prompts/*.txt) | Improve description, chapters, tags, and metadata using accurate topic | Metadata suggestions and unsupported-term warnings. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| audience-panel-review | model | model prompt (stage in prompts/*.txt) | Synthesize clarity, emotion, novelty, evidence, pacing, and trust risk | A weighted scorecard with reasons and non-guaranteed outcomes. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| intake-transcriber | planned | none | Transcribe uploaded audio with word times, using a Quran-tuned model w | A transcript with word timings and confidence; low-confidence words ma | none | Not built |
| intake-language-detector | code | engine/src/studio.mjs:8 | Detect the language, script and dialect of every input and flag mixed  | A language report per input. | unit tests (not re-run per role) |  |
| intake-recitation-identifier | built | engine/src/content-intel.mjs:14 | Match the transcript against the Tanzil text and return surah, ayah ra | A recitation map; ambiguous passages listed with every place they occu | unit test only; no run calls it | Not wired into any run |
| intake-content-classifier | code | engine/src/studio.mjs:8 | Decide recitation, Islamic content, documentary, story or the owner's  | A content type and the rules that follow from it. | unit tests (not re-run per role) |  |
| intake-intent-interpreter | code | studio UI / renderer (no single call site named) | Read rough, misspelled or mixed-language ideas and restate them precis | A one-paragraph premise the other squads work from. | unit tests (not re-run per role) |  |
| intake-fact-fiction-judge | code | studio UI / renderer (no single call site named) | Decide whether the film tells a true story (researched) or an invented | A mode decision with evidence. | unit tests (not re-run per role) |  |
| intake-rights-intake | planned | none | Record who made each uploaded recording and what it may be used for; r | A rights attestation stored with the project. | none | Not built |
| intake-version-planner | code | studio UI / renderer (no single call site named) | Plan the Arabic, English (USA) and Bangla versions as separate films t | A brief per version. | unit tests (not re-run per role) |  |
| intake-duration-planner | code | studio UI / renderer (no single call site named) | Turn the requested length into media needs, retention structure and a  | A film plan from the engine core. | unit tests (not re-run per role) |  |
| intake-brief-writer | code | engine/src/bossism.mjs:24 | Write the single brief every other squad works from. | The production brief. | unit tests (not re-run per role) |  |
| voice-recording-analyst | code | studio UI / renderer (no single call site named) | Measure loudness, true peak, noise floor, clipping and speaking pace o | A recording report with plain-language problems. | unit tests (not re-run per role) |  |
| voice-voice-guardian | code | studio UI / renderer (no single call site named) | Block any processing that changes pitch, formants, timing or identity, | Pass or block for every processing step. | unit tests (not re-run per role) |  |
| voice-repair-engineer | planned | none | Remove DC offset, restore clipped peaks and apply only the noise reduc | Repair settings with reasons. | none | Not built |
| voice-tone-dynamics | code | render/narrate.mjs:20 | Set the high-pass, gentle compression and de-essing for the voice. | Chain settings. | unit tests (not re-run per role) |  |
| voice-loudness-engineer | code | studio UI / renderer (no single call site named) | Level the whole stitched track to -14 LUFS with true peak at or below  | Master levels, measured. | unit tests (not re-run per role) |  |
| voice-elevenlabs-operator | code | render/narrate.mjs:118 | Read each version with the right model (Multilingual v2 for English an | Narration audio per version. | unit tests (not re-run per role) |  |
| voice-pronunciation | code | render/narrate.mjs:118; render/narrate.mjs:20 | Keep the pronunciation of names and terms in Arabic, English and Bangl | A pronunciation lexicon. | unit tests (not re-run per role) |  |
| voice-pacing-editor | code | engine/src/film-run.mjs:18; local/voice-film.mjs:55 | Fit narration to scenes by trimming or extending pauses, never by chan | Timing edits. | unit tests (not re-run per role) |  |
| voice-music-supervisor | code | render/score-synth.mjs:298; render/score-synth.mjs:19 | Apply the music policy per content and version: licensed, Content-ID-s | A cue sheet with licences. | unit tests (not re-run per role) |  |
| voice-mix-engineer | code | studio UI / renderer (no single call site named) | Set the bed level and ducking automation and check the final mix. | The final mix report. | unit tests (not re-run per role) |  |
| quran-ayah-aligner | built | engine/src/content-intel.mjs:14; engine/src/quran-director.mjs:128 | Align every ayah to the recording for cuts and captions. | An ayah timeline. | unit test only; no run calls it | Not wired into any run |
| quran-text-guardian | built | engine/src/quran-director.mjs:128 | Render only verbatim Tanzil text looked up by reference, never recogni | Verified on-screen text. | unit test only; no run calls it | Not wired into any run |
| quran-reference-checker | built | engine/src/content-intel.mjs:14 | Check surah names and ayah numbers, and withhold numbers for passages  | A reference list. | unit test only; no run calls it | Not wired into any run |
| quran-translation-curator | planned | none | Choose a translation each version may legally show (public-domain Pick | Translation source and credit per version. | none | Not built |
| quran-meaning-researcher | planned | none | Summarise what each ayah is about from recognised tafsir, only to guid | Per-ayah theme notes with sources. | none | Not built |
| quran-visual-matcher | planned | none | Choose nature and cosmos footage that matches each ayah's theme. | A shot list per ayah. | none | Not built |
| quran-visual-adab-guard | planned | none | Block depictions of prophets, Companions, angels or Allah, people and  | Pass or block for every shot. | none | Not built |
| quran-recitation-editor | built | engine/src/quran-director.mjs:128 | Cut only at ayah ends or permitted stops; never speed up, slow, loop o | An edit decision list. | unit test only; no run calls it | Not wired into any run |
| quran-arabic-typographer | planned | none | Lay out ayat in Amiri Quran with ayah markers and correct right-to-lef | Type specifications and a render check. | none | Not built |
| quran-islamic-reviewer | planned | none | Check the finished film against every Islamic rule automatically. | A pass or block report. | none | Not built |
| screenplay-premise-architect | model | model prompt (stage in prompts/*.txt) | Find the strongest version of the idea: the want, the wound and the st | A premise sheet. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-era-researcher | model | model prompt (stage in prompts/*.txt) | Build the era bible: wages, prices, cars, phones, slang and real busin | An era bible with sources. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-character-designer | model | model prompt (stage in prompts/*.txt) | Create characters with wants and flaws and antagonists with understand | A character bible. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-plot-architect | model | model prompt (stage in prompts/*.txt) | Build "but/therefore" beats with a twist near a quarter, a reversal at | A beat sheet. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-hook-doctor | model | model prompt (stage in prompts/*.txt) | Write 3-second and 30-second hooks that the title and thumbnail promis | Hook options. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-money-path-auditor | model | model prompt (stage in prompts/*.txt) | Make every financial step add up; flag any jump without its own scenes | A money path check. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-scene-writer | model | model prompt (stage in prompts/*.txt) | Write scenes with exact, specific details and subtext. | Scene drafts. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-narration-writer | code | studio UI / renderer (no single call site named) | Write spoken, human narration in each version's language. | Narration per version. | unit tests (not re-run per role) |  |
| screenplay-realism-auditor | model | model prompt (stage in prompts/*.txt) | Catch stock phrases, uniform sentences, "and then" chains and stated m | A lint report and rewrites. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| screenplay-ai-scene-director | code | render/render-film.mjs:1290 | Generate only the shots stock footage cannot supply (a dragon, a lost  | Generated shots with their prompts, references and disclosure flags. | unit tests (not re-run per role) |  |
| screenplay-fiction-label-guard | code | studio UI / renderer (no single call site named) | Keep the film free of on-screen labels while never calling an invented | A label checklist. | unit tests (not re-run per role) |  |
| versions-arabic-writer | planned | none | Write the Arabic version in Modern Standard Arabic from the shared res | The Arabic script. | none | Not built |
| versions-english-writer | model | model prompt (stage in prompts/*.txt) | Write the English version for American viewers. | The English script. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| versions-bangla-writer | planned | none | Write the Bangla version in Bangladeshi Bangla (pani, not jol). | The Bangla script. | none | Not built |
| versions-arabic-reviewer | planned | none | Check fit for Arabic-speaking viewers with an Islamic outlook: no inst | A review. | none | Not built |
| versions-english-reviewer | model | model prompt (stage in prompts/*.txt) | Check American references, units and dollars. | A review. | none by code unless the note names a code check | Output only as good as the free brain; unmeasured |
| versions-bangla-reviewer | planned | none | Check Bangladeshi references, Taka and religious sensitivities. | A review. | none | Not built |
| versions-numerals-typography | planned | none | Check Arabic-Indic and Bengali digits, fonts and complex-script render | A render check. | none | Not built |
| versions-separation-guard | code | engine/src/bossism.mjs:26 | Make sure no line, voice or caption leaks between versions. | A purity report per version. | unit tests (not re-run per role) |  |
| versions-subtitle-builder | code | studio UI / renderer (no single call site named) | Build timed subtitles per version from the final narration, or Arabic  | Subtitle files per version. | unit tests (not re-run per role) |  |
| versions-packaging-localizer | planned | none | Write titles, descriptions and thumbnails per version, never translate | A publishing pack per version. | none | Not built |

### 15 important roles that are not operational on the voiceover path

(status: not run by `local/voice-film.mjs` or `voice-film.yml`, either planned, built-not-wired, or without a code check)

1. `cinematography-composition` (planned): no one judges framing; the postmortem's wrong-subject shots pass.
2. `cinematography-visual-metaphor` (planned): filler clocks and bulbs (shots 19, 32, 48) are the result.
3. `animation-diagram-builder` (planned): the engineering niche needs real diagrams; none are built.
4. `animation-3d-visualization` (planned): same; the only 3D is stock CGI.
5. `animation-2d-animation` (planned): no animated maps or cross-sections.
6. `research-geography` (planned): places are not verified; Brigade Road, Kolkata for Bengaluru slipped through.
7. `research-freshness` (planned): no re-check of facts that change.
8. `research-peer-review` (planned): no academic search; for engineering disasters this is the main source.
9. `editing-continuity-match` (planned): no check that adjacent shots agree on time of day, place, era.
10. `editing-intro-outro` (planned): no structured open or close.
11. `story-exposition` (planned): no clarity pass for ordinary viewers (W8).
12. `quality-artifact-qc` (planned): no check for compression and scaling artefacts (the 720p/850 kb/s file went through).
13. `quality-accessibility-qc` (planned): no contrast or flashing check.
14. `intake-transcriber` (planned): the roster says there is no speech-to-text, but the voiceover path uses faster-whisper (`local/voice-film.mjs:4`, `:284`); the roster line is out of date (not verified further).
15. `intake-rights-intake` (planned): no check that the owner has the rights to the recording or the story.

Not on the voiceover path but "built" and unconnected: `intake-recitation-identifier`, `quran-ayah-aligner`, `quran-text-guardian`, `quran-reference-checker`, `quran-recitation-editor` (Quran films: no speech-to-text feeds them).

The picture-fit judgement roles are marked "code" (`footage-exact-match`, `footage-scene-fit`, `footage-release-risk`) but their only call is a workflow step that skips on failure; locally and in the 3-min test they produced nothing. That is the most important gap for W5/W9.

## 5. Findings for the Boss (my opinion, not measured)

1. The engine's quality gates are about files (black frames, loudness, licences), not about whether the picture says what the sentence says. This is the gap.
2. The picture ranker runs only in CI. Make it callable from `local/` and make "zero candidates" a failure, not a silent hand-pick.
3. Update `ROLE_STATUS` for `intake-transcriber`, and add a class A-E field per shot to the report.
