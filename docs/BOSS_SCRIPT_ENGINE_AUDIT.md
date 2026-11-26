# Boss Script Engine audit (12 Nov 2026)

Audit of the documentary script engine on branch `ccr-2867bb13-8ohb4z`, read
from the code, not from the docs. Nothing was changed in the code. Nothing
was merged or deployed.

**Short answer.** The engine is a real, well-guarded *pipeline*: about 15
model stages with strong code checks for structure, timing, sources and
rights. It is **not** a multi-agent system: the 151 roles are labels, and no
Boss Agent chooses or calls agents. Creative quality (story, suspense,
emotion, retention) is asked for in the prompts but is checked almost only by
the same model that wrote it, and weak storytelling **never blocks** a
release. **No script has ever been made by this engine with a real model**,
and none could be made in this session (section 5).

---

## 1. The 151 roles: what they really are

Source: `engine/src/agent-roster.mjs` (`SQUADS`, `AGENTS`, `ROLE_STATUS`).
The full list of all 151, with each role's intended job, its status and what
in the code really does it, is in the **Appendix** (generated from the code).

| Status (ROLE_STATUS) | Count | Meaning |
|---|---|---|
| code | 63 | deterministic code does the job (checks, renderer, licences, timing) |
| model | 46 | one sentence or section in a stage prompt asks the model to do it |
| built | 6 | tested code exists but no run calls it (voice mode, Quran) |
| planned | 36 | nothing does it |

Facts from the code that matter more than the counts:

- **A role is not a program.** No role has its own prompt, model, memory,
  input or output. A "model" role means: a line in the 73 KB manual
  (`prompts/1-zupona-master-engine-full.txt`) or in a stage instruction in
  `film-run.mjs`. Example: Counter-Evidence Hunter = the phrase "record
  conflicts between sources instead of resolving them" inside the research
  prompt.
- **Only 54 of 151 roles are even attached to a stage** in the production
  graph (`bossism.mjs` `IDEA_STAGES`); 97 are attached to nothing. The
  attachment is a label for the decision record; it changes nothing that runs.
- **For the script itself** (research + story + audience + screenplay
  squads, 41 roles): 1 code check for sources, 2 code checks for story
  (open loops paid, words per second), 3 code checks in screenplay, and the
  rest are prompt lines. Planned and missing: Academic Literature Scout,
  Geography Verifier, Source Freshness Monitor, Exposition/Clarity editor.
- `prompts/4-zupona-squad-brains.txt` (57 KB of per-squad instructions) is
  **loaded by no code**. Only prompt 1 is used (`worker/index.mjs:48`,
  `local/run-film.mjs:86`).
- `engine/src/pipeline.mjs` `planRun` (which squads work, in which order) is
  used only by the studio page to *show* a plan (`studio.mjs:12`); it does
  not drive the run.

## 2. The "Boss Agent": how orchestration really works

There is no agent discovery, selection or assignment. The flow is fixed code:

1. `supervise.mjs` `superviseFilm` runs `film-run.mjs` `runFilm` once.
2. `runFilm` executes a **hard-coded sequence** of stages (below). Each stage
   is one call, or a few, to the single brain the run was given
   (`worker/brain.mjs`: `claude`, `gemini` or `local`). Every stage uses the
   same model and the same system prompt (manual + brief); only the viewer
   panel gets its own short system prompt, and the research desk gets the brief only.
3. `bossism.mjs` `reviewRun` reads the saved files and scores **seven gates**.
4. `revisionPlan` picks the stages named by failed findings, `applyRevision`
   forgets them and their dependents, and the run is repeated with the notes
   appended to those stages' prompts. **At most one revision round**
   (`LIMITS.maxRevisions = 1`).
5. `releaseDecision` blocks release only for `block` findings, or for
   `revise` findings on a critical gate (research, claims, script, rights,
   master).

What exists and is real: the dependency graph, `preflight` (refuses a run
whose brain or tools cannot do it, e.g. no search and no research desk),
resume after a crash, budget stop, the decision record, owner override with a
reason. What is missing: any choice of *which* specialist to use for a topic,
any second model, any parallel execution, any debate or critique between
roles.

## 3. The script pipeline, topic to final script

All in `engine/src/film-run.mjs` `runFilm` unless named. "Model" = one call
to the run's brain. Repairs default to 2 (`maxRepairs`).

| # | Stage (key) | What happens | Model calls | Code checks that really run |
|---|---|---|---|---|
| 0 | studio intake | spelling fix, language, true vs invented, format, duration plan | none | `content-intel.mjs`, `studio.mjs` |
| 1 | `market` (optional) | top YouTube videos on the topic that beat their channel | none (YouTube API, needs `YOUTUBE_API_KEY`) | outlier ratio |
| 2 | `s01` | S0 intake/risk + S1 angle, central question, topic score (incl. "emotional engine"), 10 titles, 3 thumbnail briefs, title contract | 1 | none |
| 3 | `research` | **Search brain** (Claude web_search ≤30 uses, Gemini google_search): writes facts JSON itself. **Non-search brain**: `research-plan` call writes queries → `research-desk.mjs` opens Wikipedia, pages Wikipedia cites, optional SearXNG → second call writes facts from that corpus | 1 or 2 | facts without URL dropped; desk mode: facts citing pages not opened dropped (`bindToCorpus`); fewer than 8 sourced facts (5 for stories) stops the run |
| 4 | `sources` (optional) | code opens every cited page | none | `source-check.mjs`: dead pages dropped; each number searched on its pages → verified / opened / unconfirmed / unreachable; sites per fact counted |
| 5 | `s2` | claim ledger: ID, claim, status FACT/CONTESTED/ESTIMATE/UNKNOWN, value, sources, conflicts, wording rule | 1 | none at this stage (ledger IDs read later by the claims gate) |
| 6 | `s3` | story architecture: arc, chapters, retention map, interrupt plan, open-loop ledger, emotion curve, music arc + chapter JSON | 1 + up to 2 repairs | `validateChapterPlan`: chapters tile the runtime |
| 7 | `s4` | production bibles: narrator, look, sound, music cues, pronunciation | 1 | none |
| 8 | `s5:Cn` per chapter | the script: one scene line per scene (NARR, claim IDs, shots, FX, music...); gets the previous chapter's last 2 lines | 1 per chapter + up to 2 repairs | `checkChapter`: clock, scene IDs, required fields, words per second ±10%, banned phrases, forbidden sources, language purity; `lintNarration` (machine-sounding, repeated openers, stated moral, uniform sentences) **only for story and motivational formats, and only as a listed gap** |
| 9 | `qa` | QA desk, three passes: A facts vs ledger, B language/rights, C craft (hook, resets, interrupts, midpoint, cliffhanger, loops, hand-offs); returns find/replace fixes | 1 (or 1 per chapter if the window is small) | `checkFilm` (whole-film clock, loops paid), `hookFindings` (generic opener, no number/name in first 30 s, first sentence >25 words), text-card share >40%; a fix that breaks a code check is reverted |
| 10 | `viewer` | "five target viewers" read **only the first 120 seconds**, give stayScore and fixes | 1 (same model, short system prompt) | fixes applied only if no code check or hook check gets worse |
| 11 | `edit:Cn` | Edit Director: transitions, punch-ins, sound hits | 1 per chapter | `validateEditPlan`, long-hold check |
| 12 | `media:Cn` | stock/archive search per shot; footage desk judges thumbnails only if the brain can see | 0–1 per chapter | licence, no repeat within 10 min, GAP for missing shots |
| 13 | `s6` | whole-film QA report G1–G17 from code counts | 1 | told never to invent numbers |
| 14 | `s7` | publishing pack: final title, thumbnails, description, chapters, Shorts | 1 | `titleProblems`, too close to a proven title, credits present |
| 15 | `originality` | fingerprint vs channel's earlier films | none | `originality.mjs` |
| 16 | Bossism review → maybe 1 revision → release decision | | redone stages only | 7 gates (section 4) |

Per requirement asked:

| Requirement | Where | Real mechanism | Honest rating |
|---|---|---|---|
| Topic understanding, planning | S0/S1 prompt | model prose; no code check | prompt only |
| Deep research, sources | research stage | model web search or Wikipedia-based desk; ≥8 facts | **shallow by design**: one research pass, minimum 8 facts, no iterative "dig deeper" loop, no academic, news-archive or primary-record search in desk mode |
| Fact verification | `source-check.mjs`, QA pass A | code opens pages and finds numbers; model compares script to ledger | **strongest part** for numbers and URLs; non-numeric claims only "opened", not verified |
| Contradictions | research prompt, gate 1 | model told to record conflicts; code flags same claim with different values when no conflict is noted | heuristic text match (`claimKey`); misses re-worded claims |
| Synthesis | S2 ledger | model prose table | prompt only |
| Structure, narrative | S3 | model prose + chapter JSON | code checks only timing and tiling |
| Suspense, curiosity | S3 loop ledger, interrupt plan | model; code checks every opened loop is paid | only "loop paid" is checked, not whether it creates curiosity |
| Emotional progression | S3 emotion curve | model prose | **no check at all** |
| Audience psychology, retention | S1 audience, S3 retention map, viewer panel | model; panel = same model role-playing, first 2 minutes only; YouTube retention lessons only after a film is published | no measure for minutes 2 to the end |
| Script, chapters | S5 per chapter | model; heavy code checks for format and timing | **format excellent, craft unchecked** |
| Self-review, revision | QA, viewer, Bossism | same model, one round | see section 4 |
| Final approval | `releaseDecision`, owner override | code gates | story is not a critical gate |

## 4. Bossism: do the seven gates judge creative quality?

Mostly **no**. They check evidence and structure well; creative quality is
checked only through the same model's opinion, and a failing story does not
stop release.

| Gate | What it really checks (`reviewRun`) | Creative? | Critical? |
|---|---|---|---|
| 1 research | ≥8 facts, sources opened, ≥4 sites (block <2), unconfirmed numbers ≤30%, same claim with different values | no (evidence) | yes |
| 2 claims | every claim ID a scene cites exists in the S2 ledger | no: it does **not** check that the sentence says what the claim says, or that uncited factual sentences exist | yes |
| 3 script | `checkFilm` again: all chapters, clock, IDs, words, fields, banned phrases | no (format) | yes |
| 4 story | viewer stayScore ≥6, code hook findings, long-held pictures | partly: stayScore is the same model's opinion of the first 2 minutes | **no** |
| 5 visual | share of shots without a fitting picture | no | no |
| 6 rights | licence records, credits in description | no | yes |
| 7 packaging | title rules, originality vs own channel | slightly | no |

Can revision really fix the listed problems?

| Problem | Detected by | Sent back? | Verdict |
|---|---|---|---|
| Weak storytelling (middle chapters) | nothing | no | **cannot** |
| Unsupported claims | QA pass A (model); gate 2 only for unknown IDs | gate 2 → `s5:Cn` | partly; a wrong sentence with a valid ID passes |
| Repetitive writing | `lintNarration` only for 2 formats; result is a gap, not a gate finding | no | **cannot** for documentaries |
| Weak opening | hook code checks + viewer panel | yes, `s5:C1`, once | **yes, the one real loop** |
| Poor transitions between chapters | QA pass C (model) only | no | **cannot** |
| Low-retention sections | none before publishing | no | **cannot** |

Other real limits: one revision round; the reviewer is the writer's own
model; a revision appends notes to the same prompt (no fresh critic
rewrite); `state.gaps` (writing lint, viewer score, hook) feed the S6 report
but `reviewRun` does not read them.

**Found during this audit (bug-class):** unresolved number placeholders in
narration (e.g. `[C12 low]`, `$[C40 high]`) are only noted by
`timeline.mjs:549`; **no gate blocks them**. The saved production
`productions/ramesh-babu/USA` passes every code check and the hook check
while its scene lines still hold 37 distinct placeholders, 10 of them in
the spoken narration (5 scenes), which a narrator would read aloud.

## 5. Implemented vs tested vs verified

| Capability | In code | Automated tests | Verified with a real model / API |
|---|---|---|---|
| Whole run S0→S7, resume, budget | yes | yes, with a **fake model** (`engine/test/film-run.test.mjs`) | **never** |
| Claude brain | yes (`worker/anthropic.mjs`) | yes, fake fetch | never in a film run |
| Gemini brain (google_search) | yes (`worker/gemini.mjs`) | yes, fake fetch | never; its grounding metadata is not read, URLs come from the model's JSON (risk of redirect or invented URLs, then dropped by source-check) |
| Local brain (Ollama etc.) | yes | yes, fake | never |
| Research desk (Wikipedia, SearXNG) | yes | yes, fake pages | never against live Wikipedia |
| Source check (opens pages, finds numbers) | yes | yes | not on a real run |
| Code checks (scene lines, hook, loops, timing) | yes | yes | run on the hand-made Ramesh Babu production in this audit: all pass (that is the placeholder problem above) |
| Bossism gates, revision, release | yes | yes (fake runs) | never on a real script |
| Viewer panel, QA desk, Edit Director | yes | yes, fake replies | never |
| Academic search, freshness, geography, clarity pass, emotion check, retention model, independent critic | **no** | — | — |

Test state in this session: `npm test` = 173 engine + 73 platform, **all
pass**, after `npm ci` at the root (a fresh container has no root
`node_modules`; without it 6 platform test files fail on a missing
`@anthropic-ai/sdk`).

The only real model output in the repository is
`productions/ramesh-babu/` (45 min). Its README shows it was written by
earlier Claude Code sessions following the prompts by hand
(`productions/ramesh-babu/prompts/`), **not by `runFilm`**. It shows what the
manual can produce with a strong model; it is not evidence that the engine
works. First lines of its USA script (C1), for the record: "Bengaluru, India.
Twenty eleven, by most accounts. A Rolls-Royce Ghost joins a rental fleet.
Its buyer cuts hair." A concrete, curious hook; a full quality review of it
was not done.

## 6. End-to-end test: blocked, with exact requirements

No test topics were run and **no results are reported**, because:

1. No model access: no `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` in this
   environment, and no local model server.
2. No machine for a local model: 4 CPUs, 15 GB RAM, no GPU; a 30B-class
   model (what `docs/ENGINEERING_STATE.md` step 1 asks for) cannot run here.
   A 1–3B model would run but would not show the engine's real quality.
3. Network here blocks `en.wikipedia.org` and `huggingface.co` (no reply),
   so the research desk and model downloads cannot work in this container.
   `generativelanguage.googleapis.com` (Gemini) is reachable.
4. Using this coding session's own model as the "brain" is not a valid test
   of the engine and would spend the owner's tokens.

What is needed (pick one; no paid service required for A or B):

- **A. Gemini free tier (fastest).** The owner creates a free Gemini API key
  and saves it as a secret on this cloud environment (never in chat). Then,
  per topic: `BRAIN=gemini node local/run-film.mjs --topic "<topic>" --minutes 5`
  (with `GEMINI_API_KEY` set from the secret). Search is Gemini's own,
  so Wikipedia access is not needed. Free-tier daily limits may stop a long run;
  the run resumes.
- **B. Owner's machine, free local model.** A computer with ≥32 GB RAM or a
  24 GB GPU, Ollama with a 30B-class model, normal internet (Wikipedia).
  `BRAIN=local BRAIN_URL=<server> BRAIN_MODEL=<model> node local/run-film.mjs --topic ... --minutes 5`.
- **C. Claude API key** (paid; owner's decision only).

Proposed test topics (chosen to stress different parts):

| Topic | What it tests |
|---|---|
| The 1970 Bhola cyclone | contested death tolls (contradiction handling), politics, emotion |
| How CRISPR was discovered, and the patent war | science explanation, many named people, dates, clarity |
| The 1977 Tenerife airport disaster | minute-by-minute suspense, chronology, sensitive context |

Scoring per script (1–5, two readers, with evidence lines quoted):
factual accuracy (each claim checked against its page), research depth
(facts, sites, primary sources), narrative, opening hook, suspense and open
loops, emotional arc, originality, pacing, predicted retention; plus code
counts: gaps, unconfirmed numbers, placeholders left, revision used.

## 7. Critical weaknesses and missing parts

1. **Never run for real.** Every claim of quality is untested. Largest risk.
2. **No independent critic.** Writer, QA, viewer panel and Bossism's only
   creative signal are the same model.
3. **Story is not a critical gate**, and nothing measures chapters after the
   opening: weak middles, sagging pace, missing emotional turns pass.
4. **Research is single-pass and thin**: minimum 8 facts, no iterative gap
   filling, no academic/news-archive/primary-record providers in desk mode,
   no freshness or geography check.
5. **Claims gate checks IDs, not meaning**: a sentence can misstate its
   ledger claim and pass.
6. **Placeholders in narration are not blocked** (section 4).
7. **Repetition/robotic-writing lint is off for documentaries** and never
   reaches a gate.
8. **One revision round**, notes appended to the same prompt; no targeted
   rewrite of a weak scene by a separate editor.
9. **Roles are labels**: 97 roles unattached, the squad-brains prompt unused;
   the "151 agents" figure overstates what runs.
10. **Gemini search citations not taken from grounding metadata**: likely
    many dropped or wrong URLs (unverified).

## 8. Roadmap for the Boss Script Engine (priority order, not started)

| P | Work | Why it matters | Exit |
|---|---|---|---|
| 0 | **First real runs** on the three topics with Gemini free or a local 30B model; fix what breaks (JSON, repairs, windows) | nothing else can be judged before this | 3 scripts of 5–10 min, scored with the rubric above, saved |
| 1 | **Block placeholders and unresolved numbers** in the script gate | a narrator would read "C12 low" aloud | gate test + Ramesh Babu production fails until fixed |
| 2 | **Independent critic** (second brain or second model) for QA and story, disagreement recorded | the writer cannot grade itself | critic verdicts in `qa.json` and the story gate |
| 3 | **Whole-film story and retention review per chapter**: hook, stakes, curiosity gap, emotional beat, reset every 60–90 s, chapter cliffhanger, scored by the critic with quoted lines; make story a critical gate with an owner override | covers weak middles, transitions, low-retention sections | a deliberately flat test script is blocked and revised |
| 4 | **Claim-meaning check**: each narrated factual sentence vs its ledger row (critic + code for numbers/names/dates); flag factual sentences with no claim ID | unsupported claims today pass if the ID exists | seeded wrong sentence is caught |
| 5 | **Deeper research loop**: plan → search → gap list → second search; more desk providers (open academic APIs, government/news archives) behind `canSearch`; freshness for changing facts; Gemini grounding URLs | research depth sets the ceiling of the film | ≥25 facts, ≥8 sites, primary source for each key claim on the test topics |
| 6 | **Scene-level revision**: rewrite only the failing scenes with the critic's notes; up to 2 rounds with a stop when scores stop rising | today one blunt round | measured score gain between rounds on test scripts |
| 7 | **Writing lint for all formats** (repetition, uniform sentences, robotic phrases) feeding the story gate | repetitive writing is not caught for documentaries | lint findings appear as gate findings |
| 8 | **Make roles honest**: attach the script roles to real checks or prompt sections (use `prompts/4` sections per stage, measured), or mark them planned; report counts that match what runs | the owner needs true numbers | roster test that each "model" role names a prompt section that exists |

Not in scope and untouched: voice, image, video and music systems.

---

## Appendix: all 151 roles (generated from `agent-roster.mjs` and `bossism.mjs`)

"Graph stage label" = the stage in `IDEA_STAGES` that names this role; "—"
means no stage names it.

| # | Squad | Role id | Name | Intended job (roster) | Status | What actually does it (ROLE_STATUS, checked) | Graph stage label |
|---|---|---|---|---|---|---|---|
| 1 | research | `research-primary-source` | Primary Source Scout | Find direct records, original research, official documents, first-party datasets, and exact URLs for the central claims. | **model** | research stage: the brain's own web search (Claude, Gemini) or, for a brain that cannot search, the code research desk (research-desk.mjs: Wikipedia, the pages its articles cite and the owner's SearXNG; facts may cite only pages it opened); code drops every fact without a source URL, then opens every cited page (source-check.mjs) and drops facts whose pages are gone | research |
| 2 | research | `research-fact-ledger` | Claim Ledger Analyst | Turn factual statements into individually testable claims with a source and a confidence/status. | **model** | S2 claim ledger | s2 |
| 3 | research | `research-date-check` | Chronology & Date Auditor | Check dates, time periods, event order, and whether a source is contemporary or retrospective. | **model** | S2 ledger and the QA facts pass | s2 |
| 4 | research | `research-statistics` | Statistics Verifier | Check quantities, units, denominators, geography, sample sizes, and whether statistics are comparable. | **model** | S2 ledger: values, units and conversions | s2 |
| 5 | research | `research-peer-review` | Academic Literature Scout | Identify relevant peer-reviewed papers, methods, sample limitations, and conflicting scholarly results. | **planned** | no search of academic literature yet | — |
| 6 | research | `research-counterevidence` | Counter-Evidence Hunter | Search for credible disconfirming evidence, alternative explanations, and material caveats. | **model** | research stage records conflicts between sources | research |
| 7 | research | `research-geography` | Geography & Place Verifier | Verify place names, borders, maps, distances, geographic context, and territorial uncertainty. | **planned** | places are not verified separately yet | — |
| 8 | research | `research-people-orgs` | People & Organization Verifier | Check names, roles, organizational affiliations, quotations, and identity ambiguity. | **model** | research stage (people not to confuse) and the named-subject rules | research |
| 9 | research | `research-source-diversity` | Source Independence Auditor | Detect circular citations, copied reports, one-source dependence, and apparent but not genuine corroboration. | **code** | source-check.mjs counts sites per fact and per film; numbers resting on one site are named in S2, under 4 sites is a gap | sources |
| 10 | research | `research-freshness` | Source Freshness Monitor | Check whether important facts, laws, figures, office-holders, or technical claims may have changed. | **planned** | no re-check of facts that change over time yet | — |
| 11 | story | `story-transcript-integrity` | Transcript Integrity Auditor | Compare the supplied narration and proposed scenes without silently adding, removing, or reordering factual wording. | **built** | voice-scenes.mjs: checkVoiceChapter finds every changed, added or missing word against the recording's transcript and restoreVoiceFields puts the transcript's words and times back; no film run calls it yet (voice mode is not wired) | — |
| 12 | story | `story-chapter-arc` | Chapter Arc Architect | Test the chapter progression, stakes, causality, and whether each chapter changes the viewer's understanding. | **model** | S3; code checks that the chapters tile the film | s3 |
| 13 | story | `story-opening-hook` | Opening Hook Specialist | Evaluate the first 30–60 seconds for specificity, clarity, curiosity, and evidence-backed promises. | **model** | S3 and S5 (30-second hook rule); code reads the hook (no announcing opener, one concrete number, name or place, a first sentence that lands) and what QA leaves wrong is a gap | — |
| 14 | story | `story-open-loops` | Open-Loop Editor | Track questions raised, answered, delayed, and abandoned across the runtime. | **code** | S3 loop ledger; code checks every opened loop is paid | s3 |
| 15 | story | `story-exposition` | Complexity-to-Clarity Editor | Find dense passages, unexplained concepts, missing definitions, and jumps in causal reasoning. | **planned** | no separate clarity pass yet | — |
| 16 | story | `story-narration` | Spoken-Language Editor | Check whether the narration sounds natural aloud in its version's language, with reasonable sentence length and clear referents. | **model** | S5; code checks words per scene and banned phrases | — |
| 17 | story | `story-continuity` | Narrative Continuity Editor | Check names, terms, dates, causal links, chapter recaps, pronouns, and repeated facts. | **model** | S4 continuity rules and the QA passes | — |
| 18 | story | `story-emotional-arc` | Emotional Arc Analyst | Map tension, empathy, relief, wonder, and reflection so emotion follows the evidence rather than manipulating it. | **model** | S3 emotion curve and the 'written to be felt' rule | s3 |
| 19 | story | `story-ending` | Ending & Payoff Editor | Check whether the ending pays off the central question, handles unresolved facts, and avoids a false conclusion. | **model** | S3 and S5 (payoff, last image and line) | s3 |
| 20 | story | `story-script-coverage` | Narration Coverage Auditor | Estimate whether each planned scene has enough spoken words for its intended duration without padding. | **code** | scene-lines.mjs: words against seconds for every scene | — |
| 21 | cinematography | `cinematography-visual-director` | Visual Director | Define visual intent for each beat and distinguish illustration from literal evidence. | **model** | S5 shots: evidence or illustration rung per shot | — |
| 22 | cinematography | `cinematography-composition` | Composition Specialist | Review focal hierarchy, framing, negative space, foreground/background relationships, and visual readability. | **planned** | picks are not judged for composition yet | — |
| 23 | cinematography | `cinematography-lens-language` | Lens & Perspective Specialist | Recommend shot scale, perspective, lens feel, depth of field, and when a graphic is clearer than footage. | **model** | S4 look: lens kit | s4 |
| 24 | cinematography | `cinematography-camera-motion` | Camera Motion Designer | Plan restrained pans, tilts, push-ins, reveals, and locked shots without pointless motion. | **code** | renderer: push-ins and slow motion from the MOTION field; the Edit Director's punch-ins and camera shakes | — |
| 25 | cinematography | `cinematography-lighting` | Lighting Continuity Specialist | Check light direction, contrast, time-of-day plausibility, and continuity across adjacent shots. | **planned** | no lighting continuity check yet | — |
| 26 | cinematography | `cinematography-environment` | Location & Environment Scout | Specify believable locations, weather, season, and environmental details supported by sources. | **model** | S4 locations | s4 |
| 27 | cinematography | `cinematography-archive-language` | Archival Visual Specialist | Differentiate genuine archival material, contemporary illustrative footage, reenactment risks, and contextual labels. | **model** | S5 rungs; renderer archive look | — |
| 28 | cinematography | `cinematography-visual-metaphor` | Visual Metaphor Specialist | Use visual metaphors only when they clarify a concept and cannot be mistaken for literal evidence. | **planned** | not built yet | — |
| 29 | cinematography | `cinematography-shot-variety` | Shot Variety Analyst | Detect repetitive shot sizes, repetitive stock imagery, visual fatigue, and under-covered transitions. | **code** | media step: no clip twice within 10 minutes | — |
| 30 | cinematography | `cinematography-accessibility` | Visual Accessibility Reviewer | Review contrast, safe text area, flashing, motion intensity, subtitle legibility, and color-only communication. | **planned** | no contrast or flashing check yet | — |
| 31 | animation | `animation-motion-director` | Motion Design Director | Set the overall motion grammar, pacing, easing, and restrained use of animation across the film. | **model** | S4 motion-graphics style | s4 |
| 32 | animation | `animation-map-motion` | Map Animation Specialist | Plan accurate map pans, zooms, route lines, labels, projection choices, and uncertainty annotations. | **code** | maps.mjs: animated maps from public-domain Natural Earth shapes (country lit, pin, name, push-in) and route lines that draw themselves between two places, for FX-MAP shots with coordinates | render |
| 33 | animation | `animation-data-graphics` | Data Visualization Specialist | Choose chart forms that honestly encode the data and avoid misleading axes, scale, or comparisons. | **code** | renderer: counter cards and animated bar charts (FX-CHART, eased bars from the shot's own numbers) | — |
| 34 | animation | `animation-kinetic-type` | Kinetic Typography Specialist | Plan readable animated words, emphasis, timing, and hierarchy without turning narration into visual clutter. | **code** | renderer: FX-KINETIC kinetic type, line by line; highlighter sweeps on documents and underlines (FX-HIGHLIGHT), measured to the words | render |
| 35 | animation | `animation-diagram-builder` | Diagram & Explainer Specialist | Convert complex processes into accurate diagrams with explicit relationships and labels. | **planned** | not built yet | — |
| 36 | animation | `animation-2d-animation` | 2D Animation Specialist | Identify where shape animation, paths, masks, and layered cutouts clarify a physical or conceptual process. | **planned** | not built yet | — |
| 37 | animation | `animation-3d-visualization` | 3D Visualization Specialist | Specify when a 3D model or spatial visualization is worth building, while avoiding fake evidence. | **planned** | not built yet | — |
| 38 | animation | `animation-parallax` | Parallax & Depth Specialist | Identify safe uses of depth/parallax on licensed stills without fabricating detail or movement. | **code** | renderer: 2.5D parallax on portrait and square archive photos; prints in a white border with a shadow and focus zooms toward one part, chosen by the Edit Director | — |
| 39 | animation | `animation-transition-logic` | Transition Logic Designer | Select transitions motivated by time, place, evidence, or concept rather than arbitrary effects. | **code** | renderer: whip pans, slides, zoom-throughs, flashes, glitches (torn colour and noise), light leaks, dips to black and chapter dips from the TRANS field and the Edit Director | — |
| 40 | animation | `animation-fx-qc` | Effects Quality Controller | Check for visual artifacts, jitter, clipping, inconsistent easing, overuse of effects, and unearned drama. | **planned** | not built yet | — |
| 41 | footage | `footage-asset-strategist` | Asset Search Strategist | Translate each scene into precise search queries and identify the best source families. | **model** | S5: search queries per shot | — |
| 42 | footage | `footage-exact-match` | Exact Asset Finder | Rank actual item-page candidates by relevance, shot content, length, and visible metadata. | **model** | footage desk: the brain looks at the thumbnails of each shot's candidates; when the brain cannot see pictures the desk is skipped, the first search result is kept and it is listed as a gap | — |
| 43 | footage | `footage-provider-coverage` | Provider Coverage Auditor | Identify when configured providers fail and route the gap to additional lawful sources or a written permission request to the creator. | **code** | media step: Pexels, Pixabay and the archives (Wikimedia Commons, NASA, Library of Congress, Smithsonian, the Met, Art Institute of Chicago, Openverse) searched per shot; archive (R2) shots look there first | — |
| 44 | footage | `footage-metadata` | Media Metadata Auditor | Check duration, dimensions, frame rate when known, creator, date, location, and provenance fields. | **code** | media step: source page, creator and licence kept per clip | — |
| 45 | footage | `footage-license` | License Term Reviewer | Flag editorial-only, non-commercial, attribution, share-alike, standalone redistribution, and model/property-release conditions. | **code** | media step: a clip is kept only when its item-level licence is Pexels, Pixabay, CC0, public domain, US-government public domain or CC BY (FREE_LICENCES); share-alike and non-commercial files are never kept | — |
| 46 | footage | `footage-attribution` | Attribution Writer | Create accurate attribution records from provider/item data and mark missing fields. | **code** | renderer licence report; S7 credits block | s7 |
| 47 | footage | `footage-duplicate-assets` | Duplicate & Reuse Detector | Detect repeated assets and repeated compositions across the runtime. | **code** | media step: no clip twice within 10 minutes | — |
| 48 | footage | `footage-scene-fit` | Scene-to-Footage Matchmaker | Score the semantic and visual fit between footage candidates and a scene's exact intent. | **model** | footage desk (only when the brain can see pictures) | — |
| 49 | footage | `footage-release-risk` | Release & Property Risk Reviewer | Flag recognizable people, private property, trademarks, minors, sensitive contexts, and missing release evidence. | **model** | footage desk rejects faces, brands, plates and watermarks where the shot avoids them (only when the brain can see pictures) | — |
| 50 | footage | `footage-rights-gate` | Rights Gatekeeper | Block unresolved assets from export-ready status and verify required manifest fields are present. | **code** | nothing without a licence record is rendered | review |
| 51 | editing | `editing-runtime` | Runtime Controller | Check chapter/scene durations against the target runtime, stage dependencies, feasible schedule, and budget assumptions; never invent provider prices. | **code** | scene-lines.mjs clock and the frame-exact timeline | — |
| 52 | editing | `editing-pace` | Pacing Analyst | Detect stretches with too little visual or narrative change and sections that move too quickly. | **model** | S3 retention map; code checks words per scene; the Edit Director places punch-ins, shakes and sound hits, capped and spaced in code | — |
| 53 | editing | `editing-coverage` | Coverage Editor | Check whether footage/graphics cover the narration without irrelevant filler or repeated stock shots. | **code** | media step lists every shot with no fitting clip as a GAP | — |
| 54 | editing | `editing-cut-logic` | Cut Logic Specialist | Check whether cuts follow meaning, geography, action, evidence, or emotional beats. | **model** | S5 transitions; the Edit Director stage (edit-C1.json per chapter) re-chooses each scene's transition, checked in code (known words, never two named in a row) | — |
| 55 | editing | `editing-timeline-integrity` | Timeline Integrity Auditor | Find overlaps, gaps, invalid timestamps, duration mismatches, ordering errors, and invalid stage/timeline state transitions. | **code** | timeline.mjs: frame-exact edit list | render |
| 56 | editing | `editing-continuity-match` | Visual Match Editor | Review visual continuity of direction, location, season, costumes, and recurring elements. | **planned** | not built yet | — |
| 57 | editing | `editing-b-roll-balance` | B-roll Balance Editor | Detect overuse of generic B-roll and ensure key claims receive appropriately specific visuals. | **code** | QA is given each chapter's share of planned text cards; over 40% it must swap cards for real pictures | qa |
| 58 | editing | `editing-chapter-transitions` | Chapter Transition Editor | Create clear narrative handoffs between chapters without redundant recap. | **code** | renderer: chapter dips and chapter titles | render |
| 59 | editing | `editing-intro-outro` | Intro & Outro Editor | Audit title cards, cold open, end slate, and end pacing against the documentary's promise. | **planned** | not built yet | — |
| 60 | editing | `editing-edit-qc` | Edit Decision Quality Reviewer | Review a proposed cut for distracting edits, dead air, jumpy tempo, unresolved notes, cancellation recovery, and duplicate-work risks. | **code** | renderer checks the finished master for black stretches | master |
| 61 | audio | `audio-voice-sync` | Voiceover Sync Analyst | Compare narration text with word/segment timestamps and flag scenes whose timing does not match speech. | **code** | captions on the voice's word timings; voice placed per scene | — |
| 62 | audio | `audio-noise` | Noise & Room-Tone Reviewer | Detect likely noise, abrupt noise-floor changes, clipped tails, and missing room tone from available measurements. | **code** | studio voice check: noise floor and SNR | — |
| 63 | audio | `audio-dialogue-level` | Dialogue Level Controller | Recommend consistent dialogue loudness and identify clipping or weak passages when measurements exist. | **code** | renderer mix: voice over music and effects | — |
| 64 | audio | `audio-ducking` | Music Ducking Specialist | Set music-under-voice behavior, fade points, and when music should disappear for clarity. | **code** | renderer: music ducks under the voice | render |
| 65 | audio | `audio-sound-effects` | SFX Editor | Recommend only motivated sound effects and flag manipulative or misleading sound cues. | **code** | sound-kit.mjs: CC0 effects from Freesound per scene | — |
| 66 | audio | `audio-music-arc` | Music Arc Composer | Plan music energy across chapters, transitions, silence, and emotional turns. | **code** | S3 music arc and S4 cues; music-kit.mjs composes one track per cue | s4 |
| 67 | audio | `audio-loudness` | Loudness & Peak Auditor | Check integrated loudness, true peak, codec headroom, and delivery targets when measurable. | **code** | renderer: loudness normalised to -14 LUFS and measured on the master | render |
| 68 | audio | `audio-silence` | Silence & Pause Editor | Protect meaningful pauses while detecting accidental long silence or broken audio. | **model** | rule: silence before the moving scene of each chapter | — |
| 69 | audio | `audio-pronunciation` | Pronunciation & Names Reviewer | Check difficult names, place names, acronyms, and Arabic, English and Bangla pronunciation notes against trusted references. | **code** | S4 writes the pronunciation lexicon; render/voice.mjs sends the names as it spells them to the voice and the captions keep them as written (ElevenLabs path) | s4 |
| 70 | audio | `audio-audio-qc` | Audio Mix Quality Controller | Check sync, phase/mono concerns, abrupt edits, music clashes, and audio export integrity. | **code** | renderer measures the master's loudness and true peak | master |
| 71 | color | `color-color-match` | Shot Matching Colorist | Match adjacent shots for exposure, contrast, white balance, and overall continuity. | **code** | renderer: one master grade per look | render |
| 72 | color | `color-exposure` | Exposure Auditor | Detect clipped highlights, crushed shadows, insufficient detail, and inconsistent exposure when frame samples exist. | **planned** | not built yet | — |
| 73 | color | `color-white-balance` | White Balance Specialist | Find inconsistent color temperature/tint and recommend neutral-reference checks. | **planned** | not built yet | — |
| 74 | color | `color-skin-tone` | Skin Tone Fidelity Reviewer | Protect realistic skin tones and avoid stylized grades that misrepresent people or archival imagery. | **planned** | not built yet | — |
| 75 | color | `color-look-dev` | Look Development Artist | Propose a restrained film look that supports the story while preserving source authenticity. | **code** | S4 look; renderer looks: documentary, cinematic, archive | s4 |
| 76 | color | `color-archive-grade` | Archival Grade Specialist | Keep archival treatment readable and labeled without manufacturing age or authenticity. | **code** | renderer archive look | — |
| 77 | color | `color-artifact-check` | Image Artifact Reviewer | Look for banding, blocking, oversharpening, denoise artifacts, halos, flicker, and damaged frames. | **planned** | not built yet | — |
| 78 | color | `color-subtitle-style` | Subtitle Styling Specialist | Check typography, line breaks, placement, contrast, and mobile safe areas for burned-in captions. | **code** | renderer captions; word-highlight captions in Shorts | — |
| 79 | color | `color-encode` | Encoding & Bitrate Auditor | Check output resolution, frame rate, codec compatibility, file size, and expected quality constraints. | **code** | renderer: H.264 with a bitrate cap | render |
| 80 | color | `color-final-master` | Mastering QC Reviewer | Review visual and audio finishing requirements before the final master is accepted. | **code** | renderer: MP4 master, SRT and licence report | master |
| 81 | quality | `quality-hallucination` | Hallucination & Unsupported-Claim Auditor | Find claims presented as facts without adequate support or where evidence does not match the wording. | **model** | QA facts pass against the S2 ledger; code first looks for every number on its cited pages (verified / unconfirmed) | sources, qa |
| 82 | quality | `quality-defamation` | Defamation & Allegation Reviewer | Flag potentially harmful allegations about identifiable people/organizations and require robust support and careful language. | **model** | named-subject rules and the QA rights pass | qa |
| 83 | quality | `quality-sensitive-context` | Sensitive-Context Reviewer | Review violence, tragedy, medical, political, or vulnerable-person context for respectful and necessary depiction. | **model** | sensitive-subject rules and the QA passes | qa |
| 84 | quality | `quality-artifact-qc` | Visual Artifact QC Agent | Inspect provided frames/metadata for obvious generative artifacts, malformed maps, impossible objects, or inconsistent details. | **planned** | not built yet | — |
| 85 | quality | `quality-subtitle-text` | Subtitle Text Auditor | Check subtitle spellings, punctuation, timing collisions, overflow, and text/narration mismatch. | **code** | captions are made from the narration itself | — |
| 86 | quality | `quality-timeline-qc` | Timeline Technical Auditor | Validate scene order, start/end times, frame boundaries, duplicate IDs, and audio duration alignment. | **code** | scene-lines.mjs checks the whole film | qa |
| 87 | quality | `quality-license-qc` | License Manifest Auditor | Block assets missing source page, creator, license evidence, and required attribution fields. | **code** | licence record per clip; renderer licence report | review |
| 88 | quality | `quality-claim-language` | Certainty & Attribution Auditor | Reduce overstatement, distinguish fact/opinion/allegation/estimate, and ensure causal claims are justified. | **model** | QA facts pass; code bans listed phrases | qa |
| 89 | quality | `quality-accessibility-qc` | Accessibility QA Agent | Check subtitle readability, flashing/motion risk, contrast, and whether key info depends only on color. | **planned** | not built yet | — |
| 90 | quality | `quality-release-gate` | Pre-Export Release Gate | Synthesize prior findings, privacy/secret risks, budget limits, failed-stage recovery, and release readiness; block export recommendations when a critical issue remains unresolved. | **code** | a film is done only with no GAP; every GAP is listed | s6, review |
| 91 | audience | `audience-retention` | Retention Curve Analyst | Estimate where attention may drop based on pace, repetition, exposition density, and unanswered questions. | **model** | S3 retention map and the retention rule; code ties each published film's YouTube retention curve to its scenes (retention.mjs) and S3, S5 and the Edit Director read the channel's lessons | s3 |
| 92 | audience | `audience-audience-fit` | Audience Fit Researcher | Check audience assumptions, language register, cultural references, and accessibility for the intended market. | **model** | S1 angle and audience, against the videos that already won on the topic (market.json) | market, s01 |
| 93 | audience | `audience-title` | Title & Promise Auditor | Create specific truthful titles whose promise is fulfilled by the actual documentary. | **model** | S1 titles and S7, given the topic's proven YouTube outliers (market stage, with YOUTUBE_API_KEY); code flags an invented story whose title claims truth and a title too close to an existing video | market, s01, s7 |
| 94 | audience | `audience-thumbnail` | Thumbnail Composition Reviewer | Plan a readable thumbnail focal point, contrast, and authentic evidence while avoiding fabricated visual claims. | **code** | S1/S7 briefs; thumbnails.mjs makes three for Test & Compare | s01, s7 |
| 95 | audience | `audience-first-minute` | First Minute Reviewer | Evaluate the opening minute for immediate context, visual change, and a clear reason to continue. | **model** | S3 and S5 hook | viewer |
| 96 | audience | `audience-midpoint` | Midpoint Re-Engagement Reviewer | Check whether the midpoint advances the argument or merely repeats the premise. | **model** | S3 midpoint turn | s3 |
| 97 | audience | `audience-cta` | Call-to-Action Editor | Recommend a restrained ending CTA only where natural and appropriate. | **model** | S7 call to action | — |
| 98 | audience | `audience-platform-specs` | Delivery Specs Auditor | Check platform aspect ratio, frame rate, subtitle formats, audio requirements, and safe areas against current requirements supplied in context. | **code** | cuts.mjs: 9:16 Shorts and the 4:5 Facebook cut | s7 |
| 99 | audience | `audience-metadata` | Metadata & Search Relevance Editor | Improve description, chapters, tags, and metadata using accurate topic-specific language. | **model** | S7 description, chapters and tags | s7 |
| 100 | audience | `audience-panel-review` | Audience Panel Synthesizer | Synthesize clarity, emotion, novelty, evidence, pacing, and trust risks into a review report. | **model** | the manual's silent expert panel before each stage; after QA a separate viewer panel (five target viewers, no manual, no plan) cold-reads the first two minutes, says where it would leave, and its fixes are kept only if every code check passes | viewer |
| 101 | intake | `intake-transcriber` | Speech-to-Text Transcriber | Transcribe uploaded audio with word times, using a Quran-tuned model when the audio is Arabic recitation. | **planned** | no speech-to-text yet | — |
| 102 | intake | `intake-language-detector` | Language & Script Detector | Detect the language, script and dialect of every input and flag mixed inputs. | **code** | studio: content-intel.mjs | — |
| 103 | intake | `intake-recitation-identifier` | Recitation Identifier | Match the transcript against the Tanzil text and return surah, ayah range, per-ayah times, confidence and ambiguity; never guess an ambiguous reference. | **built** | quran.mjs: matchRecitation finds the surah, the ayat and each ayah's times in a transcript against the shipped Tanzil text; there is no speech-to-text yet, so no run calls it | — |
| 104 | intake | `intake-content-classifier` | Content Classifier | Decide recitation, Islamic content, documentary, story or the owner's own script, with reasons. | **code** | studio: content-intel.mjs | — |
| 105 | intake | `intake-intent-interpreter` | Intent Interpreter | Read rough, misspelled or mixed-language ideas and restate them precisely. | **code** | studio: spelling fixes and mode | — |
| 106 | intake | `intake-fact-fiction-judge` | Fact or Fiction Judge | Decide whether the film tells a true story (researched) or an invented one (labelled fiction); stories of prophets and Companions are always sourced, never fiction. | **code** | studio: true story or invented story | — |
| 107 | intake | `intake-rights-intake` | Rights Intake Officer | Record who made each uploaded recording and what it may be used for; reject other reciters' or other people's voices. | **planned** | not built yet | — |
| 108 | intake | `intake-version-planner` | Version Planner | Plan the Arabic, English (USA) and Bangla versions as separate films that share only research and premise. | **code** | studio plan (only the English version can be made today) | — |
| 109 | intake | `intake-duration-planner` | Duration & Scale Planner | Turn the requested length into media needs, retention structure and a render plan. | **code** | studio plan and the cost estimate | s01 |
| 110 | intake | `intake-brief-writer` | Production Brief Writer | Write the single brief every other squad works from. | **code** | film-run.mjs: the production brief | — |
| 111 | voice | `voice-recording-analyst` | Recording Analyst | Measure loudness, true peak, noise floor, clipping and speaking pace of every voice track. | **code** | studio voice check (loudness, peak, SNR, clipping) | — |
| 112 | voice | `voice-voice-guardian` | Voice Preservation Guard | Block any processing that changes pitch, formants, timing or identity, and keep the untouched original. | **code** | the owner's takes are used exactly as recorded | — |
| 113 | voice | `voice-repair-engineer` | Repair Engineer | Remove DC offset, restore clipped peaks and apply only the noise reduction the measurements call for. | **planned** | no noise repair yet | — |
| 114 | voice | `voice-tone-dynamics` | Tone & Dynamics Engineer | Set the high-pass, gentle compression and de-essing for the voice. | **planned** | not built yet | — |
| 115 | voice | `voice-loudness-engineer` | Loudness Engineer | Level the whole stitched track to -14 LUFS with true peak at or below -1 dBTP. | **code** | gain to target in the studio; loudness in the renderer | — |
| 116 | voice | `voice-elevenlabs-operator` | ElevenLabs Voice Operator | Read each version with the right model (Multilingual v2 for English and Arabic, v3 for Bangla) using only the owner's own cloned voice; chunk at paragraphs and regenerate outliers. | **code** | voice.mjs: one take per scene with word timings | — |
| 117 | voice | `voice-pronunciation` | Pronunciation Lexicon Keeper | Keep the pronunciation of names and terms in Arabic, English and Bangla. | **code** | render/voice.mjs applies S4's pronunciation lexicon to the text sent to the voice (ElevenLabs path) | — |
| 118 | voice | `voice-pacing-editor` | Pacing & Pause Editor | Fit narration to scenes by trimming or extending pauses, never by changing speed. | **code** | words per scene; a capped speed-up when a take runs long | — |
| 119 | voice | `voice-music-supervisor` | Music Supervisor | Apply the music policy per content and version: licensed, Content-ID-safe tracks only, vocal-only where instruments are not allowed, silence under the Quran. | **code** | music-kit.mjs and the mix | — |
| 120 | voice | `voice-mix-engineer` | Mix Engineer | Set the bed level and ducking automation and check the final mix. | **code** | renderer mix | — |
| 121 | quran | `quran-ayah-aligner` | Ayah Timing Aligner | Align every ayah to the recording for cuts and captions. | **built** | quran.mjs matchRecitation and quran-film.mjs planQuranFilm: one scene per ayah from the transcript's word times; not wired to a run or a render yet | — |
| 122 | quran | `quran-text-guardian` | Quran Text Guardian | Render only verbatim Tanzil text looked up by reference, never recognised or generated text, and verify every character. | **built** | quran-film.mjs: the on-screen text is Tanzil's, verbatim by surah:ayah, and checkQuranFilm refuses a plan with changed text; not wired yet | — |
| 123 | quran | `quran-reference-checker` | Reference Checker | Check surah names and ayah numbers, and withhold numbers for passages that occur in more than one place. | **built** | quran.mjs: a passage found in several places lists every place and goes to review instead of being guessed; not wired yet | — |
| 124 | quran | `quran-translation-curator` | Translation Curator | Choose a translation each version may legally show (public-domain Pickthall for English; other translations only with written permission) and credit it. | **planned** | Quran films are not made yet | — |
| 125 | quran | `quran-meaning-researcher` | Meaning & Context Researcher | Summarise what each ayah is about from recognised tafsir, only to guide visual choices. | **planned** | Quran films are not made yet | — |
| 126 | quran | `quran-visual-matcher` | Ayah Visual Matcher | Choose nature and cosmos footage that matches each ayah's theme. | **planned** | Quran films are not made yet | — |
| 127 | quran | `quran-visual-adab-guard` | Visual Adab Guard | Block depictions of prophets, Companions, angels or Allah, people and women in recitation videos, AI-generated people or animals, and Paradise or Hell imagery. | **planned** | quran-film.mjs lists the rules (no depiction, no faces), but no picture is chosen for a Quran film yet, so nothing checks one; the owner's questions on imagery are open (docs/STUDIO_STATUS.md section 6) | — |
| 128 | quran | `quran-recitation-editor` | Recitation Editor | Cut only at ayah ends or permitted stops; never speed up, slow, loop or reorder. | **built** | quran-film.mjs: cuts only in the quiet between ayat and checkQuranFilm refuses any cut inside an ayah or any sound under the recitation; not wired yet | — |
| 129 | quran | `quran-arabic-typographer` | Arabic Typographer | Lay out ayat in Amiri Quran with ayah markers and correct right-to-left shaping. | **planned** | Quran films are not made yet | — |
| 130 | quran | `quran-islamic-reviewer` | Islamic Audience Reviewer | Check the finished film against every Islamic rule automatically. | **planned** | Quran films are not made yet | — |
| 131 | screenplay | `screenplay-premise-architect` | Premise Architect | Find the strongest version of the idea: the want, the wound and the stakes. | **model** | S1 and the S2 story bible (story mode) | — |
| 132 | screenplay | `screenplay-era-researcher` | Era & World Researcher | Build the era bible: wages, prices, cars, phones, slang and real business economics. | **model** | research stage: real-world details of the time and place | research |
| 133 | screenplay | `screenplay-character-designer` | Character Designer | Create characters with wants and flaws and antagonists with understandable motives; ordinary names, no real private people. | **model** | S2 story bible and the S4 LOOK line per character | s4 |
| 134 | screenplay | `screenplay-plot-architect` | Plot & Twist Architect | Build "but/therefore" beats with a twist near a quarter, a reversal at the midpoint and a low point near three quarters. | **model** | S3 story architecture: plot, turns and chapters | s3 |
| 135 | screenplay | `screenplay-hook-doctor` | Hook Doctor | Write 3-second and 30-second hooks that the title and thumbnail promise and the film pays off. | **model** | S3 and S5 hook | — |
| 136 | screenplay | `screenplay-money-path-auditor` | Money Path Auditor | Make every financial step add up; flag any jump without its own scenes. | **model** | S2 money path | s2 |
| 137 | screenplay | `screenplay-scene-writer` | Scene Writer | Write scenes with exact, specific details and subtext. | **model** | S5 scene lines, every scene in order | — |
| 138 | screenplay | `screenplay-narration-writer` | Narration Writer | Write spoken, human narration in each version's language. | **code** | S5; code flags machine-sounding or preachy writing | — |
| 139 | screenplay | `screenplay-realism-auditor` | Realism & Anti-Robotic Auditor | Catch stock phrases, uniform sentences, "and then" chains and stated morals, and rewrite them. | **model** | S2 realism ledger from the research | s2 |
| 140 | screenplay | `screenplay-ai-scene-director` | AI Scene Director | Generate only the shots stock footage cannot supply (a dragon, a lost city) from one character bible and the same reference images, through whichever video model is available, and mark every one for disclosure. | **code** | ai-scenes.mjs: one cast, a real person is never made | — |
| 141 | screenplay | `screenplay-fiction-label-guard` | Fiction Label & Ethics Guard | Keep the film free of on-screen labels while never calling an invented story true: a one-line note in the description, real-person stories told from sources, photoreal AI scenes disclosed in YouTube Studio. | **code** | the description note is added in code; a title claiming truth is flagged | — |
| 142 | versions | `versions-arabic-writer` | Arabic Transcreator | Write the Arabic version in Modern Standard Arabic from the shared research or premise. | **planned** | only the English version can be made today | — |
| 143 | versions | `versions-english-writer` | English (USA) Transcreator | Write the English version for American viewers. | **model** | S5 in English (USA) | — |
| 144 | versions | `versions-bangla-writer` | Bangla Transcreator | Write the Bangla version in Bangladeshi Bangla (pani, not jol). | **planned** | only the English version can be made today | — |
| 145 | versions | `versions-arabic-reviewer` | Arabic Audience Reviewer | Check fit for Arabic-speaking viewers with an Islamic outlook: no instruments, respectful content. | **planned** | only the English version can be made today | — |
| 146 | versions | `versions-english-reviewer` | US Audience Reviewer | Check American references, units and dollars. | **model** | QA language pass | qa |
| 147 | versions | `versions-bangla-reviewer` | Bangladesh Audience Reviewer | Check Bangladeshi references, Taka and religious sensitivities. | **planned** | only the English version can be made today | — |
| 148 | versions | `versions-numerals-typography` | Numerals & Typography Checker | Check Arabic-Indic and Bengali digits, fonts and complex-script rendering. | **planned** | only the English version can be made today | — |
| 149 | versions | `versions-separation-guard` | Version Separation Guard | Make sure no line, voice or caption leaks between versions. | **code** | scene-lines.mjs: narration language check | — |
| 150 | versions | `versions-subtitle-builder` | Subtitle Builder | Build timed subtitles per version from the final narration, or Arabic plus translation for a recitation. | **code** | SRT from the narration and the voice timings | — |
| 151 | versions | `versions-packaging-localizer` | Title & Thumbnail Localizer | Write titles, descriptions and thumbnails per version, never translated. | **planned** | only the English version can be made today | — |
