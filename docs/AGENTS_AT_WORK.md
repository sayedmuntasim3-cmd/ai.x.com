# Agents at work (28 Nov 2026)

The owner paid for a team of 151 roles (`engine/src/agent-roster.mjs`, `ROLE_STATUS`). The rule since 28 Nov: the team works on
**every film, in both products**. This page says who runs where. `rosterStatus()` is the count; each role's note names its file.

**Roster before → after:** code 75 → 88, model 42 → 42, planned 34 → 21 (13 roles built; none lowered, no paid API).

## Who runs in which film

| Squad of checks | Idea → video (`film-run.mjs`, `bossism.mjs`) | Voiceover → video (`local/voice-film.mjs`, `render/voice-runner.mjs`) |
|---|---|---|
| Research, facts, sources (model stages, `source-check.mjs`) | yes (S1, S2, research, sources) | no: the words are the owner's recording |
| Story arc, hook, loops, narration (model stages) | yes (S3, S5) | hook scored in code (`shot-plan.mjs`), arc not rewritten |
| Freshness, geography, named sources, clarity (**new**, `engine/src/script-agents.mjs`) | yes, in the QA stage → `crew.json` | yes → `agents.json`, `agents.md` |
| Picture plan, picks, rights (footage squad, OpenCLIP `render/asset-rank`) | yes (media stage) | yes (`pictures()`, then the eyes) |
| Picture in the story's place (**new**, `film-agents.mjs` `storyPlace`) | not yet (needs the shot plan's subjects) | yes → `agents-plan.json` |
| Viewer panel (`audience-panel-review`) | yes (viewer stage, model) | yes (**new**, `voice-crew.mjs` `voicePanel`, free brain, reported not applied) |
| Title, description, chapters, tags (`audience-title`, `audience-metadata`) | yes (S7, model) | yes (**new**, `voice-crew.mjs` `packagingPack` → `packaging.json`) |
| Picture and edit agents on the master (**new**, `render/film-agents.mjs`) | yes (`render-film.mjs` runs them on any film it renders) | yes (same renderer) |
| Taste: full frame, logos, repeats, black text cards (`picture-taste.mjs`, #123/#126) | yes | yes |
| Critic and release gate, auto-fix re-pick (`critic.mjs`, `release-gate.mjs`, `autofix.mjs`) | yes | yes |

## The thirteen roles built on 28 Nov (all free code; ffmpeg frames and text rules)

| Role | File and check | Fault of the Apollo film it catches | Result |
|---|---|---|---|
| cinematography-composition | `film-agents.mjs` `tiltOf` (a framed picture's edge is a straight slanted line) | tilted polaroid stills | block `critic.tilted`, re-picked |
| cinematography-visual-metaphor | `storyPlace` (subject words said only far from the shot) | Moon pictures over the launch lines | block `critic.pictureOutOfPlace`, re-picked |
| editing-continuity-match | one still or one url held over 9 s; brightness jump at a cut | the same Moon picture about 14 s; no common grade | block `critic.hold`; warn `critic.gradeJump` |
| color-white-balance | cast against the film's own median cast | no unifying grade | warn, block over 0.6 `critic.cast` |
| color-exposure | pure-white share, hazy flat picture | — | block `critic.exposure` (burnt) |
| color-artifact-check | neon saturation, banding | — | `critic.artifact` |
| quality-artifact-qc | one-frame jump inside a shot (frame difference) | — | block `critic.glitch` |
| editing-intro-outro | opening on black; bright end with no fade-out | — | block `critic.openBlack`; warn `critic.closing` |
| animation-diagram-builder | a designed card with nothing drawn, or drawing cut at the edge | text on black | `critic.diagram` |
| research-freshness | "currently / the latest / still the largest" with no year | — | warn (report) |
| research-geography | a place said inside a state it is not in; unknown places listed | — | warn (report) |
| research-peer-review | "a study found" with no named institution, journal or year | — | warn (report) |
| story-exposition | sentence over 38 words, 5+ numbers, unexplained acronym | — | warn (report) |

Already merged and untouched (#123, #126): `unfilled` (more than half the frame black), `logo` (TV logo), `samePicture`, `textOnBlack`.
New in this change: the auto-fix loop re-picks those four too (they were blocks no re-pick could answer before).

## How a failing shot is fixed before a film is blocked
`render-film.mjs` runs `measureAgents` on the finished master → `report.agents`; `critic.mjs` turns each finding into a critic finding
with the shot numbers; `autofix.mjs` `failingShots` reads `report.agents` and `report.taste` and re-picks only those shots from the
candidates already found (never below the relevance floor); only a block that is not a single-shot picture fault stops the film.

## Still planned (21)
Left: cinematography-lighting, cinematography-accessibility, animation-2d-animation, animation-3d-visualization,
animation-fx-qc, color-skin-tone, quality-accessibility-qc, intake-rights-intake, voice-repair-engineer, six Quran roles
(translation, meaning, visual-matcher, adab-guard, typographer, reviewer) and six version roles (Arabic, Bangla writers and reviewers,
numerals, packaging localizer).
