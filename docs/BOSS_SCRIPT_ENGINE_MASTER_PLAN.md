# Boss Script Engine: master development plan

Version 1, 12 Nov 2026. Branch `ccr-2867bb13-8ohb4z`. **Planning only: no
application code was changed for this document.** Built on the two audits
(`docs/BOSS_SCRIPT_ENGINE_AUDIT.md`, `docs/SCRIPT_ENGINE_AUDIT.md`) and
checked again against the code (Appendix A lists every finding and how it was
verified, plus where the two audits disagree).

Scope: the **script** engine only, from topic to production-ready script.
Voice, Quran, image, video and music systems are out of scope and stay as
they are. The S4 bibles, Edit Director, media, render and S7 packaging keep
running after the script as today; this plan only changes what they receive.

How to read this plan. Every component has an ID (B = Bossism, D = dossier,
R = research, C = claims, S = story, L = language, V = review, G = gates,
M = models, T = tests). Each component lists purpose, inputs, outputs,
dependencies, what is reused, modified or new, its test, and a measurable
acceptance criterion. Section 20 orders them by dependency.

Ground rules this plan keeps:

1. Evidence, not promises: a capability counts as working only after a
   real-model test (section 18) shows it.
2. No paid service is required. Claude and Gemini stay optional adapters.
3. en-US is the default production language and the US YouTube audience the
   default audience. Arabic is a separate profile. Bangla stays an optional
   profile, not the default.
4. A gate that did not run is a failed gate, never a pass.
5. Nothing is presented as fact without a checked source, and the engine
   says what it could not check.

---

## 1. Executive assessment of the current system

**What is genuinely strong (keep it):**

- A durable, resumable run (`film-run.mjs`) with a budget stop, a decision
  record and a job queue that survives machine loss (`jobs.mjs`,
  `job-runner.mjs`, `worker/jobs-api.mjs`).
- Model-agnostic brain adapters with honest capability flags (`worker/brain.mjs`:
  local | claude | gemini; `canSearch`, `canSee`).
- Evidence discipline in code: facts without a URL are dropped; code opens
  every cited page and looks for each number on it (`source-check.mjs`); the
  research desk lets a non-search model cite only pages code opened
  (`research-desk.mjs` `bindToCorpus`).
- A strict, parseable script format (compact scene lines) with exact checks of
  the clock, scene IDs, words per second, required fields, banned phrases and
  language purity (`scene-lines.mjs`).
- Preflight that refuses impossible runs and names lowered quality
  (`bossism.mjs` `preflight`).

**What is weak or missing (the reason for this plan):**

- **Never validated with a real model.** Every script-path test uses a fake
  model. Nothing is known about real script quality.
- **No real orchestration.** One fixed sequence; the 151 roles are labels (only
  54 are even attached to a stage); one model does everything.
- **No independent review.** Writer, QA, viewer panel and the only creative
  signal in the gates are the same model.
- **Creative quality has no gate.** The story gate is not critical, looks only
  at the first two minutes, and the one revision round is a blunt re-prompt.
- **Research is one pass**, with a minimum of 8 facts, no iteration, no
  question coverage, no primary-source requirement, no quote verification.
- **Claims gate checks IDs, not meaning**, and unresolved placeholders such as
  `[C12 low]` pass every gate.
- **Long-form does not scale.** Each S5 chapter call carries the whole S2
  ledger, S4 bibles and the 73 KB manual: about 49k tokens for a 5-minute
  film and 245k for a 300-minute film (`windowNeeds`). The local brain's
  default window is 32,768 tokens, so with default settings preflight
  refuses even a 5-minute film.

**Verdict.** The foundation (store, jobs, adapters, scene-line format, source
checks) is reusable. The orchestration (`runFilm` as one fixed 500-line
function), the single-prompt manual, the review loop and the long-form
context strategy should be **redesigned, not patched**.

## 2. Verified current architecture

```
studio / local CLI
  -> newFilm (film-run.mjs)          topic, minutes, versionId, formatId (25 presets in formats.mjs)
  -> preflight (bossism.mjs)         brain? research path? window big enough?
  -> superviseFilm (supervise.mjs)   run once, review, at most 1 revision, release decision
       -> runFilm (film-run.mjs)     fixed order, one brain, system = manual (73 KB) + brief
            market -> s01 -> research(+desk) -> sources -> s2 -> s3(+repair) -> s4
            -> s5:Cn (+repair) -> qa -> viewer -> edit:Cn -> media:Cn -> s6 -> s7 -> originality
       -> reviewRun (bossism.mjs)    7 gates read the saved files
       -> revisionPlan/applyRevision redo targeted stages + dependents, notes appended to prompt
  -> store (R2 or folder)            every stage output is a file; run.json holds state
```

| Area | Files | State |
|---|---|---|
| Run | `engine/src/film-run.mjs` | implemented; mock-tested only |
| Supervisor | `engine/src/bossism.mjs`, `supervise.mjs` | implemented; mock-tested only |
| Roles | `engine/src/agent-roster.mjs` | labels and a hand-written status table |
| Plan shown in studio | `engine/src/pipeline.mjs` `planRun` | display only, does not drive the run |
| Formats (genres) | `engine/src/formats.mjs` | 25 presets: name, hook, beats, visuals, music; injected as one line in the brief |
| Language versions | `engine/src/versions.mjs` | en-US, ar, bn-BD profiles; `RUN_VERSIONS = ["en-US"]` |
| Research | `research-desk.mjs` (Wikipedia, cited pages, SearXNG), `source-check.mjs` | implemented; never run live |
| Script checks | `scene-lines.mjs`, `story-mode.mjs` (`lintNarration`) | implemented, unit-tested |
| Audience data | `retention.mjs`, `worker/youtube*.mjs` | implemented; needs published films |
| Brains | `worker/brain.mjs`, `anthropic.mjs`, `gemini.mjs`, `local-brain.mjs` | implemented; never used in a real film run |
| Jobs | `engine/src/jobs.mjs`, `job-runner.mjs`, `worker/jobs-api.mjs`, `local/jobs.mjs` | implemented; tested with real processes locally |
| Prompts | `prompts/1-...full.txt` (used by every stage); `prompts/4-...squad-brains.txt` | prompt 4 is loaded by no code |

## 3. Capability and agent matrix

### 3.1 The current 151 roles, honestly classified

Full per-role table: Appendix of `docs/BOSS_SCRIPT_ENGINE_AUDIT.md`
(generated from the code). Summary for the script path (research, story,
audience and screenplay squads plus the script-relevant quality roles):

| Class | Definition | Script-path roles today |
|---|---|---|
| Executable code capability | deterministic code with tests | source independence count, open loops paid, words vs seconds, chapter tiling, hook regex, banned phrases, language purity, fiction label, title rules, originality |
| Prompt-only role | a sentence or section of the manual or a stage instruction | fact ledger, dates, statistics, counter-evidence, people, chapter arc, emotional arc, ending, narration, continuity, retention, first minute, midpoint, panel review, plot, hook doctor, scene writer |
| Built, unwired | code exists, no run calls it | transcript integrity (voice mode) |
| Planned | nothing | academic literature, geography, freshness, exposition/clarity |
| Not a role at all but needed | | independent critic, claim-meaning check, quote verification, timeline builder, story memory, retention segment analysis, targeted revision |

### 3.2 Target: capabilities, not names

The roster becomes a **capability registry** (component B2). A capability
is listed as executable only when it has an implementation, a schema'd
output, a checker and a test. The roster's 151 names stay for the studio
display, each mapped to zero or more capabilities; its status is
**computed** from the registry, never hand-written.

Target script capabilities (the agents the supervisor can actually assign):

| ID | Capability | Kind | Needs from a brain | Checker |
|---|---|---|---|---|
| R1 | research questions | model | JSON, reasoning | schema + coverage of genre question set |
| R2 | source discovery | tools (+model for queries) | none / search | URLs public, fetched |
| R3 | source reliability | code + model | JSON | tier rules |
| R4 | evidence extraction | model | long context | span is a substring of the fetched text |
| R5 | claim extraction | model | JSON | each claim cites ≥1 verified span |
| R6 | cross-verification and conflicts | code + model | reasoning | independence groups; conflict schema |
| R7 | timeline and entities | model + code | JSON | dates parse; order consistent |
| R8 | gap detection and expansion | code + model | reasoning | bounded rounds |
| R9 | research completion | code | none | thresholds (section 14) |
| S1 | audience and intent | model | reasoning | schema |
| S3 | story discovery (spines) | model | reasoning, writing | spine bound to claims |
| S4 | outline and beat sheet | model | reasoning | code: clock, beats → claims, ledgers |
| S6 | chapter writing | model | en-US writing, 16k+ output | `checkChapter` + mapper |
| S7 | transitions | model | writing | critic + code bridge check |
| S8 | retention segment analysis | code + critic | critic | metrics |
| C2–C4 | claim mapping, deterministic fact check, entailment | code + critic | reasoning | seeded-defect recall |
| L1 | en-US language check | code + critic | en-US judgement | word lists, readability |
| V1 | critic review | model (different brain preferred) | reasoning, long context | rubric schema, calibration set |
| V4 | targeted revision | model | writing | re-check |

## 4. Target architecture

```
                 ┌──────────── Bossism supervisor (B1–B7) ────────────┐
 request ──► B3 planner ──► task graph ──► B1 executor ──► B4 assigner ──► brains / tools
                 ▲                │                 │                       (writer, critic,
                 │                ▼                 ▼                        research tools)
           B5 review router ◄── B7 gates ◄── task outputs ──► D1 dossier (single source of truth)
                 │                                              brief · sources · evidence ·
                 └── revision tasks (span-level) ───────────────claims · timeline · entities ·
                                                                 outline · story memory · script ·
                                                                 findings · decisions
```

Flow of one documentary:

1. **Intake and brief** (S1, L1): topic, audience, language profile, genre
   profile, runtime, factuality mode (section 9).
2. **Research** (R1–R9) in bounded rounds until the completion gate passes,
   or the scope or runtime is cut with a recorded decision.
3. **Claim ledger** (C1) built from verified evidence spans.
4. **Story discovery** (S3): 3–5 truthful candidate spines, each bound to
   claims; the critic ranks them and Bossism records the choice.
5. **Outline** (S4): acts → chapters → beats, with the reveal, loop, emotion
   and claim ledgers per beat; checked in code.
6. **Chapter writing** (S6) from small **context packs** (section 16), each
   chapter followed by code checks and an update of the story memory (S9).
7. **Review** (V1–V3): code checks, claim mapping and fact checks, then the
   critic per chapter and across the film; findings point at exact spans.
8. **Targeted revision** (V4) of the failing spans, re-checked, at most 3
   rounds, stopping when scores stop rising.
9. **Release gates** (G1–G16): all must run; any critical defect blocks.
10. Hand-off to the existing S4 bibles, edit, media and S7 stages.

## 5. Bossism orchestration design

Design choice: **bounded intelligent planning.** A free-form LLM planner is
unreliable and hard to test. Bossism uses deterministic **plan templates**
(per genre, runtime and factuality mode) that a model may *expand inside a
schema* (more research questions, more chapters, extra verification tasks).
Code validates every expansion against the budget, the schema and the graph
rules. All planning decisions are recorded.

### B1 Task graph executor

| | |
|---|---|
| Purpose | Run typed tasks in dependency order, in parallel where safe, with retries, checkpoints and resume |
| Inputs | task graph (nodes: task type, inputs as dossier refs, required capability, budget); dossier |
| Outputs | task results written to the dossier; task log |
| Depends | D1, B2, B4 |
| Reuse | `stage()` once-only and resume logic, budget stop, `RunStopped` (film-run.mjs); `productionGraph`, `dependents` (bossism.mjs); job queue for long tasks (jobs.mjs) |
| Modify | `runFilm` becomes a thin wrapper that builds the legacy graph, so today's path keeps working |
| New | `engine/src/boss/executor.mjs`: topological scheduling, concurrency limit per brain, task-level retry with fallback |
| Test | mock tasks with injected failures, kills and resumes; same final dossier hash as a serial run |
| Accept | the legacy film run produces identical outputs through the executor (golden test); 100% resume after a kill at any task; independent tasks (research fetches, per-chapter reviews) run concurrently |

### B2 Capability registry

| | |
|---|---|
| Purpose | One truthful list of what can actually run, with requirements |
| Inputs | capability modules (each exports id, kind, requires, input/output schema, run, check) |
| Outputs | registry; computed role status for the studio |
| Reuse | `AGENTS` names, `ROLE_STATUS` evidence text as the first mapping |
| Modify | `ROLE_STATUS` becomes generated; `rosterStatus` reads the registry |
| New | `engine/src/boss/registry.mjs`; one module per capability |
| Test | every registry entry has a schema, a checker and a test file; a roster role marked "model" must point at an existing prompt module |
| Accept | the studio's role counts equal the registry's; no role shows as working without an executable capability |

### B3 Planner

| | |
|---|---|
| Purpose | Turn the brief into a task graph |
| Inputs | brief (genre, runtime, mode, language), registry, available brains |
| Outputs | task graph + plan decision record (which template, which expansions, why) |
| Reuse | `understand`, `productionGraph`, `preflight`, `windowNeeds` |
| New | plan templates per genre profile (section 9); model-proposed expansions validated by schema and budget |
| Test | snapshot tests per genre × runtime; refusal tests (runtime beyond capability, missing research path) |
| Accept | every graph is acyclic and within budget; a 300-minute request on a 32k-window brain is refused or planned chapter-wise with the limitation named, never silently shortened |

### B4 Assigner (capability matching, fallback, reassignment)

| | |
|---|---|
| Purpose | Choose the brain or tool for each task; reassign on failure |
| Inputs | task requirements (search, vision, window, JSON reliability, language, *independence from writer*); brain profiles from the qualification suite (M2) |
| Outputs | assignment with reason; fallback chain |
| Reuse | `canSearch`, `canSee`, job eligibility by capability and memory (`jobs.mjs` `eligible`, `missingFor`) |
| New | brain profiles (measured, not declared); policy: critic ≠ writer when possible; after N failures move to the next eligible brain, else degrade with a recorded decision, else block |
| Test | simulated brains with capability gaps and failures |
| Accept | no task is assigned to a brain lacking a required capability; every reassignment and degradation appears in the decision record |

### B5 Review router and revision controller

| | |
|---|---|
| Purpose | Turn findings into targeted revision tasks; stop when revision stops helping |
| Inputs | findings (V3 schema: span, category, severity, evidence, suggested fix) |
| Outputs | revision tasks (scene, transition, chapter or outline scope); round records |
| Reuse | `revisionPlan`, `applyRevision`, `dependents`, `LIMITS` |
| Modify | targets become spans, not whole stages; up to 3 rounds (configurable); escalation rules (below) |
| Escalation | more than 40% of a chapter's scenes flagged → chapter rewrite; a structural finding (wrong order, missing turn, broken promise) → outline task; a missing fact → research task |
| Accept | on the seeded-defect set, ≥80% of fixable defects are fixed within 3 rounds with no new critical defect; rounds stop when the critic score gain is <0.2 |

### B6 Decision and evidence record

Reuse `recordDecision`, `ownerOverride`, `cleared`. Add: per-task trace
(task id, capability, brain and model id, prompt module version, input
dossier hashes, tokens, time, result hash), gate evidence, revision diffs.
Accept: any line of the final script can be traced to its task, prompt
version, claims and sources.

### B7 Gate engine

Reuse `reviewRun` structure (gates with findings and evidence) and
`releaseDecision`. Modify: every gate declares `mandatory`, `critical`,
metric, threshold; a gate whose inputs are missing returns `not-run`, which
blocks. Full gate list in section 14.

## 6. Research architecture

### D1 Dossier (shared by every section below)

| | |
|---|---|
| Purpose | The single source of truth for one documentary |
| Files | `brief.json`, `research/questions.json`, `research/sources.json`, `research/evidence.json`, `claims.json`, `timeline.json`, `entities.json`, `story/spines.json`, `story/outline.json`, `story/memory/Cn.json`, `script/s5-Cn.md` (existing format), `review/findings.json`, `review/scores.json`, `decisions.jsonl` |
| Reuse | the Store interface (R2, folder store), run.json |
| New | JSON schemas with validators in `engine/src/dossier/` |
| Accept | every task reads and writes only through validated schemas; schema migrations versioned |

### Research stages

| ID | Stage | Purpose | Output | Reuse / new |
|---|---|---|---|---|
| R1 | Topic decomposition | split the topic into must-answer and nice-to-have questions using the genre's question set (who, what, when, where, why, how, consequences, disputes, context: historical, scientific, social, cultural, human) | `questions.json` (id, question, priority, genre slot) | new; prompt module |
| R2 | Source discovery | find candidate sources per question | `sources.json` (url, title, publisher, type, language, date, provider) | reuse providers in `research-desk.mjs`; add free providers behind one interface (below) |
| R3 | Reliability and independence | tier each source; group sources that copy each other | tier 1 primary/official/peer-reviewed; tier 2 reputable secondary (major outlets, academic books); tier 3 tertiary (encyclopedias incl. Wikipedia); tier 4 user-generated (excluded as evidence) | reuse site counting in `source-check.mjs`; new tier rules + publisher groups |
| R4 | Evidence extraction | quote the exact passages that answer questions | `evidence.json` (id, source, verbatim span, location, question ids) | new; **code verifies every span is a substring of the fetched text** (normalised whitespace and quotes); failing spans are discarded |
| R5 | Claim extraction | turn evidence into atomic claims | `claims.json` rows (section 7) | new; replaces free-written S2 table |
| R6 | Cross-verification, conflicts | count independent support; record disagreements | per claim: support groups, conflicting claims, conflict summary ("reports differ: A says x, B says y") | reuse `claimKey` grouping; new conflict schema; the model explains, code counts |
| R7 | Timeline and entities | ordered events; canonical names, spellings, roles, pronunciations | `timeline.json`, `entities.json` | new; code checks date parsing and order against claims |
| R8 | Gap detection, expansion | find unanswered must-answer questions, single-source key claims, missing primaries, stale facts | next-round query list | new; rounds bounded |
| R9 | Completion assessment | decide: done, expand, narrow the scope, or block | completion record | new; thresholds in section 14 (G1) |

**Free source providers** (no paid service; each optional, each behind the
same provider interface; all must pass `publicUrl`): Wikipedia and its cited
references (existing), the owner's SearXNG (existing), Wikidata (entities,
dates), OpenAlex and Crossref (scholarly metadata), Europe PMC / PubMed
(biomedicine), arXiv, Internet Archive and its full texts, Library of
Congress and Chronicling America (US newspapers), national archives and
official accident or inquiry reports when found by search, PatentsView or
patent office pages (patent disputes). Search-capable brains (Claude web
search, Gemini grounding) act as **discovery only**: code still fetches
every page and verifies every span. For Gemini, URLs come from its grounding
metadata, not from the model's text (today's adapter does not read it).

**Stopping rule** (deterministic): stop when the completion gate passes; or
after 3 rounds; or when a round adds fewer than 10% new verified claims
twice in a row; or at the budget. If must-answer questions remain open, the
engine does not pad: it proposes a narrower scope or a shorter runtime, and
the owner sees the decision.

**Prompt injection.** Fetched pages are untrusted data. They are passed in
delimited blocks with an instruction that they contain no instructions;
extracted spans are verified in code; a page whose text tries to instruct the
model is flagged and its evidence is reviewed by the critic.

**Acceptance (research, measured on the test topics, section 18):**
100% of evidence spans verified as substrings; 0 cited URLs that do not
open; every must-answer question answered or explicitly marked unanswerable;
≥70% of key claims supported by a tier-1 source or two independent tier-2
groups; every known dispute in the human gold sheet recorded as a conflict.

## 7. Claim verification architecture

### C1 Claim ledger v2

Each claim: `id`, `text` (atomic), `type` (event, date, number, quote,
attribution, causal, interpretation), `status`, `value` (+unit, +date of
value), `evidence` (span ids), `support` (independent groups, best tier),
`conflicts`, `wording` (how narration may say it), `freshness` (as-of date;
recheck if the topic changes over time), `uses` (scene ids, filled by C2).

Status vocabulary (required by the owner):

| Status | Rule | Narration may say |
|---|---|---|
| verified | ≥1 tier-1 span or ≥2 independent tier-2 spans state it | as fact |
| supported interpretation | sources support it as analysis | attributed ("historians argue", naming who) |
| disputed | credible sources conflict | "accounts differ", both sides with sources |
| uncertain | one weak source or partial support | hedged and attributed, or cut |
| missing | needed but no evidence found | not said; reported as a gap |

Reuse: S2's ledger idea, status words and wording rules, `CHECKED_FACTS`
statuses from `source-check.mjs`. New: JSON ledger generated from evidence
(R5), S2 markdown becomes a human-readable view of it.

### C2 Script-to-claim mapper

Purpose: link every narrated **factual sentence** to claims. Scene lines
already carry claim IDs per scene; v2 adds sentence-level tags
(`NARR` sentences may end with `{C12}`; the renderer and voice strip tags).
Code detects factual sentences (numbers, dates, proper names, quotation marks,
causal verbs) and flags those with no claim.
Accept: ≥98% of detected factual sentences mapped; 100% of numbers, dates
and quotations mapped.

### C3 Deterministic fact check (code)

Numbers, units, dates, names and spellings in narration are compared with the
mapped claim's value and the entity sheet (number words handled; "twenty
eleven" = 2011). Quotation marks in factual modes are allowed only around a
verified evidence span. **Placeholders and unresolved markers** (`[C12 low]`,
`$[C40 high]`, `TBD`, `<!-- CONTINUE -->`, empty fields) are critical defects.
Reuse: `PLACEHOLDER` pattern (`timeline.mjs`, `scene-lines.mjs`), number words
in `hookFindings`. Accept: 100% recall on seeded wrong numbers, dates, names
and placeholders; false positives under 5% on clean scripts.

### C4 Entailment review (critic)

The critic reads each factual sentence with its claim and evidence spans and
answers supported / overstated / unsupported / contradicts, with a reason.
Accept: ≥90% recall on seeded overstatements and unsupported sentences in
the calibration set, measured per brain.

### C5 Hook honesty

The opening's promises (and the title contract from S1/S7) must map to
verified or attributed claims, and must be paid in the film. Reuse the S3
loop ledger and `loop-unpaid` check. Accept: no hook sentence maps to an
uncertain or missing claim.

## 8. Storytelling and narrative architecture

Principle: craft is designed as **explicit, checkable structure** plus
**critic judgement on exact passages**. Neither alone is enough.

| ID | Component | Purpose | Output | Check |
|---|---|---|---|---|
| S1 | Audience and intent | who watches, what they already know, what they want, what would make them leave; for en-US, which context a US viewer lacks (e.g. East Pakistan in 1970) | `brief.audience` | critic sanity check |
| S2 | Genre profile | structure, techniques, pacing, review weights per genre (section 9) | profile id in brief | schema |
| S3 | Story discovery | 3–5 candidate spines: central question, point of view, stakes, real turning points (claims), reveal order, ending; ranked by the critic for truth, clarity, tension, emotion, originality | `spines.json` + decision | every spine element maps to verified or attributed claims |
| S4 | Outline and beat sheet | acts → chapters → beats; each beat: purpose (inform, raise a question, reveal, turn, release), claims needed, emotion target, open/pay loops, transition intent | `outline.json` | code: runtime tiling, every loop paid, every key claim placed, reveals after their setup, chronology vs timeline, no chapter without a turn |
| S5 | Ledgers | loops (question, opened, paid), reveals (setup → payoff), promises (title, hook), emotion curve (planned level per chapter) | inside outline | code consistency checks |
| S6 | Chapter writer | writes one chapter from its context pack in the existing scene-line format | `s5-Cn.md` | `checkChapter` + C2/C3 |
| S7 | Transitions | the last beat of one chapter and the first of the next are written and reviewed as a pair | transition findings | critic + code: each chapter ends on an open question or a turn and the next one answers or advances it |
| S8 | Retention segment analysis | 60–90-second windows scored in code and by the critic | per-window metrics + risk | thresholds in G11 |
| S9 | Narrative memory | after each chapter: facts revealed, loops open and paid, names introduced, terminology, emotional level, promises outstanding | `memory/Cn.json` | code diff against the outline |

**S8 metrics per window (code):** new claims per minute (information
density); repetition (shingle similarity to all earlier windows; ≥0.6 is a
finding unless the passage is marked as a deliberate callback); open
questions alive; seconds since the last turn or reveal; sentence-length
variation; share of abstract vs concrete sentences (names, numbers, places,
actions). **Critic per window:** "Would a US viewer who chose this topic keep
watching? Why not?" with the exact sentence. Metrics are **uncalibrated**
until real retention curves exist (`retention.mjs` can compare later); they
are used to find weak passages, not to promise retention.

Craft rules the critic enforces (reusing the brief's rules 6 and 7 but no
longer as fixed quotas): an opening that is concrete, honest and poses the
central question within 30 seconds; stakes stated in human terms where
sources support them; tension from real uncertainty, not from loud words;
no cliffhanger that the next chapter does not honour; emotional scenes
earned by setup; endings that answer the central question or honestly say it
remains open.

Accept (story): on the human panel (section 18), the new engine beats the
current engine's script on the same topic in ≥70% of blind pairwise
judgements; no chapter scored below 3/5 by the critic at release; seeded
flat chapters and repeated passages found at ≥80% recall.

## 9. Genre-specific workflows

`formats.mjs` already has 25 presets (hook, beats, visuals, music). They
become **genre profiles** with research rules, structure templates and
review weights. 24 documentary presets map onto eight core profiles;
`dramatized-story` stays the fiction path (mode F3, existing story mode).
Today `true-story-reenactment` runs in documentary mode with no
reenactment label, and some preset hooks ("never seen", "in colour") are
promises the evidence must support: both go through C5 and G15.

| Profile | Presets mapped | Research rules | Structure template | Review emphasis |
|---|---|---|---|---|
| History / event | history-epic, history-in-minutes, war-battle, ancient-civilization, disaster-minute-by-minute, other-side | primary records, contemporary vs retrospective sources, death tolls and numbers as ranges | context → build-up → event → consequences; or countdown for disasters | chronology, context for US viewers, respect for victims |
| Biography | biography, rags-to-riches, sports-legend, motivational-life-story | the person's own words only as verified quotes; dates of life events; separate myth from record | origin → defining choice → rise/fall → legacy | no invented thoughts; balance |
| Science / discovery | big-question-science, space-mission | peer-reviewed papers, dates of publication, who did what | problem → failed attempts → insight → proof → consequences → dispute | clarity of explanation, accuracy of mechanism |
| Investigation | dark-business-expose, true-crime-case, company-rise-fall, inner-circle | court records, filings, official findings; defamation rules (existing named-subject rules) | question → evidence → competing explanations → what is known | allegation language, fairness |
| Human interest | survival-story, deadliest-journey, true-story-reenactment (must run in mode F2) | first-hand accounts, corroboration | person → ordeal → turning point → resolution | earned emotion, no manipulation |
| Mystery | mystery-investigation, other-side | hypotheses with evidence for and against | question → hypotheses → evidence weighed → honest verdict or open question | no false resolution |
| Explainer | money-explainer, geography-why, numbered-compilation, place-nobody-can-visit | definitions, numbers with sources | question → building blocks → answer → implications | clarity, density |
| Sleep story | (new preset) | factual sleep stories follow factual rules | gentle chronological flow; no cliffhangers, no alarming detail, slower narration (lower wpm) | calm continuity instead of hooks |

**Factuality modes** (set in the brief; checked in code per scene):

| Mode | Allowed | Never allowed |
|---|---|---|
| F0 factual | sourced narration | reconstruction of scenes, dialogue, thoughts |
| F1 documented reconstruction | scenes rebuilt from records, attributed ("the cockpit recording shows") | invented dialogue or thoughts |
| F2 dramatized factual | labeled reenactment of documented events; dialogue only from records | invented events, invented quotes presented as real |
| F3 fiction / story | invented story (existing story mode, `STORY_RULES`, fiction labels) | presenting it as true; real private people |

Accept: code refuses quotation marks in F0/F1 narration unless they match an
evidence span; S7 titles are checked against the mode (existing check for
story films extended to F2).

## 10. American English language architecture (L1)

| | |
|---|---|
| Purpose | Natural, professional US narration and packaging |
| Reuse | `versions.mjs` en-US profile (150 wpm, USD, register), `version-purity` check, `lintNarration` rules, banned phrases, pronunciation lexicon in S4 |
| Modify | `lintNarration` runs for **every** format, and its findings go to gates (today: story and motivational formats only, and only as gaps) |
| New | US spelling and vocabulary check (word list: colour→color, programme→program, lorry→truck ...); dates as "March 27, 1977"; numbers and units for US viewers (miles first where natural, metric where the field uses it); currency in today's dollars with basis in the ledger (existing rule); readability per window (sentence length, syllables); speakability (numbers written as spoken, no tongue-twisters, no parentheses); US-context gaps flagged by the critic |
| Prompt | an en-US style module (narrator voice, register, examples written for this project) used by S6 and V4 |
| Test | word-list unit tests; a seeded British-spelling and stiff-prose set |
| Accept | 0 British spellings at release; critic "natural American English" ≥4/5 per chapter; median sentence length 12–20 words with variation; no language other than en-US in narration unless quoted and marked |

**Language lock.** The selected profile is stored in the brief and checked
by code at every stage; research may use any language, but evidence
translations are marked as translations and narration stays in the profile's
language. A language change requires a new brief.

## 11. Arabic language-profile architecture (L2)

Separate workflow, never mixed into en-US runs.

| | |
|---|---|
| Purpose | Arabic documentaries for Arabic-speaking audiences when explicitly requested |
| Reuse | `versions.mjs` `ar` profile (120 wpm), `arabic.mjs` (normalisation, tokens), `text-scripts.mjs` (script shares, digits), `version-purity` |
| New | Arabic prompt modules written natively (not translated from English); MSA register rules; numerals policy (Arabic-Indic or Western, chosen per channel); RTL-safe scene-line parsing; Arabic word-count rules; an Arabic-capable critic brain (qualification M2 must pass in Arabic); Arabic audience profile (S1) |
| Depends | the whole en-US pipeline proven first; a brain that writes good Arabic |
| Test | parsing and purity tests with Arabic text; native-speaker human review |
| Accept | native reviewers rate fluency ≥4/5; 0 mixed-language narration; the en-US golden runs are unchanged |

Bangla (`bn-BD`) remains an optional profile on the same pattern, not the
default.

## 12. Long-form documentary architecture

Runtime targets and word budgets at en-US 150 wpm (minus about 7%
wordless time): 30 min ≈ 4,200 words, 40 ≈ 5,600, 50 ≈ 7,000, 60 ≈ 8,400,
120 ≈ 16,700, 300 ≈ 41,900.

Design:

1. **Hierarchical plan:** film → acts (3–7) → chapters (5–10 minutes each)
   → beats → scenes. The S4 outline is produced act by act for long films so
   no single call has to write the whole plan (today S3 writes it in one
   call with 32k output tokens).
2. **Research scales with runtime, words do not.** The completion gate
   requires a minimum of verified claims per minute (initial threshold
   1.0/min for history and science, 0.6/min for human interest, tuned in
   Phase 0). A runtime the research cannot support is reported, with a
   recommended runtime, instead of padding.
3. **Context packs** (section 16) keep each chapter call around 15–30k tokens
   whatever the film length.
4. **Narrative memory** (S9) carries continuity: names, terms, revealed
   facts, open loops, promises, emotional level.
5. **Cross-chapter checks** in code: no fact revealed twice as new; names and
   numbers consistent with the entity sheet and ledger; chronology matches the
   timeline; every loop paid; repetition across the whole film (S8).
6. **Act-level critic passes** plus a final whole-film pass on summaries and
   the ledgers when the full text does not fit the critic's window; the
   report says which passes saw the full text.
7. **Capability check:** preflight computes the per-task window need from the
   context packs, not from the whole ledger; if a brain still cannot hold a
   chapter pack plus its reply, the run is refused with the reason.

Accept: a 60-minute test film with 0 cross-chapter consistency defects
after revision, repetition below threshold, and human raters not judging any
chapter as padding; a 120-minute run completes on a 64k-window brain.

## 13. Independent review and revision architecture

### V1 Critic service and independence levels

| Level | Setup | How it is labelled |
|---|---|---|
| 0 | same model in the same conversation | not a review; never used |
| 1 | same model, fresh context, critic prompt, no writer reasoning | "self-review (same model)"; never called independent |
| 2 | a different model (another family, or another vendor) | "independent model review" |
| 3 | a human reviewer | "human review" |

Policy: the assigner (B4) picks a level-2 critic when one is available
(e.g. a local writer with Gemini free tier as critic, or two different local
models run one after the other); otherwise level 1, and the release record
and the studio say so. Bossism never writes "independent" for level 1.

### V2 Rubrics and calibration

Rubric dimensions with anchored 1–5 descriptions: research depth, factual
accuracy, unsupported claims, logic, opening, coherence, emotion, suspense
and curiosity, repetition, pacing, chapter quality, transitions, retention
risk, ending, American English. Each score must quote the passage that
justifies it. Calibration set: scripts with **seeded defects** (wrong date,
overstated claim, repeated paragraph, flat chapter, unpaid loop, weak
transition, British spelling, placeholder, invented quote) plus clean
controls. Critic recall and false-positive rate are measured per brain and
stored in its profile. Pairwise comparison (A vs B) is preferred over absolute
scores where possible, because it is more stable.

### V3 Findings schema

`{ id, scope: scene | sentence | transition | chapter | outline | research, location (scene ids, sentence index), category, severity (critical | major | minor), evidence (quoted text, claim ids), why, fix_hint, source: code | critic | human }`.

### V4 Targeted revision

The reviser receives only the flagged span, its neighbours, the chapter's
context pack, the findings and the claims; it returns replacement scene
lines. Code splices them in (reuse `applyFixes`), re-runs `checkChapter`, C2,
C3, and the critic re-reviews the revised span and its neighbours. A
revision that adds a critical defect is rejected (existing rule, extended).

### V5 Re-verification

Every round re-runs all affected gates, not just the one that failed.
Accept: after revision, 0 critical findings; critic scores on revised spans
improve or the span is escalated.

## 14. Quality gates and release criteria

All gates are mandatory. A gate that cannot run (missing input, failed
critic) is **not-run** and blocks. "Critical" = any finding blocks release
unless the owner records an override with a reason (existing `ownerOverride`);
overrides are shown on the film.

| Gate | Metric and threshold (initial; tuned in Phase 0) | Critical |
|---|---|---|
| G1 Research completeness | every must-answer question answered or marked unanswerable; ≥ claims-per-minute minimum; ≥4 independent source groups | yes |
| G2 Source reliability | ≥70% of key claims tier-1 or two tier-2 groups; 0 tier-4 evidence; 0 dead URLs | yes |
| G3 Claim-to-source consistency | 100% evidence spans verified; 0 claims without evidence | yes |
| G4 Unsupported / disputed | 0 unsupported sentences (C4); every disputed claim narrated with attribution | yes |
| G5 Timeline and logic | 0 chronology conflicts vs timeline; 0 causal claims without support | yes |
| G6 Script completeness | all chapters, clock exact, `checkFilm` clean (existing) | yes |
| G7 Narration readiness | 0 placeholders or unresolved markers in narration or on-screen text; numbers written as spoken | yes |
| G8 Internal references | every claim id, entity id and loop id resolves | yes |
| G9 Story quality | critic overall ≥3.5/5, opening ≥4/5, no dimension below 3 | yes |
| G10 Chapter quality | every chapter ≥3/5; every chapter has a turn or reveal | yes |
| G11 Retention potential | no window flagged high risk and unresolved; repetition <0.6 outside marked callbacks | yes |
| G12 Language | L1 checks clean; critic en-US ≥4/5 | yes |
| G13 Continuity | entity, name, number and term consistency 100% | yes |
| G14 Ending and payoff | central question answered or honestly open; all loops and title promises paid | yes |
| G15 Factuality mode | no quote outside evidence spans in F0/F1; labels for F2/F3 | yes |
| G16 Review independence (disclosure) | records the critic level; level 1 is allowed but disclosed | no (disclosure) |

Existing gates (visual, rights, packaging, master) stay as they are for the
later production stages.

**Release rule:** 100% of mandatory gates ran, 0 unresolved critical
findings, every remaining minor finding listed. The report states the
residual uncertainty (disputed claims, unanswerable questions, critic
level). The engine never claims a script is perfectly accurate or will go
viral.

## 15. Model and infrastructure strategy

### M1 Brain interface

Reuse `worker/brain.mjs` adapters and the `Model` interface
(`call(request)`, `capabilities`). Add a JSON mode where the backend supports
it, schema-repair retries, and role assignment (writer, critic, extractor).

### M2 Brain qualification suite

Before a brain is used for a role, it runs a fixed, cheap test set: JSON
validity over 50 calls; instruction following; extraction of verbatim spans;
entailment on the calibration set; a 1,000-word en-US narration sample
scored by humans once and by the critic; long-context recall (needle tests
at the window it claims). Results are stored as the brain's profile; the
assigner uses measured values, not declared ones.

### Realistic options

| Option | Cost | Hardware | Expected fit (to be measured by M2) |
|---|---|---|---|
| Local 7–9B class | free per token | 16 GB RAM or 8 GB GPU | extraction and classification; too weak to be trusted for long narration |
| Local 30–32B class | free per token | 24 GB GPU, or 32–64 GB Apple unified memory; CPU-only works but is very slow | the target writer for free runs; needs a 64k window (extra memory for the cache) |
| Local 70B class | free per token | 48 GB+ GPU memory or 64–128 GB unified memory | better writer or critic |
| Gemini free tier | free within daily limits; limits and data terms change and must be read by the owner | none | search-grounded research and a level-2 critic |
| Claude API | paid per token (optional, owner's decision) | none | optional writer or critic |
| Cloudflare Worker + R2 | free tier for current use | none | already used for the studio and the queue |

Execution time (estimate, to be measured in Phase 0): a 60-minute script
needs on the order of 100–200k generated tokens across research extraction,
outline, chapters, critic and revision, plus several million prompt tokens.
At 20–40 tokens/s on a 24 GB GPU this is hours, not minutes; on CPU only it
can take a day. The plan does not depend on speed, only on correctness; the
queue and resume already handle long runs.

What is **not possible** with current constraints: a five-hour script in one
context on any model; a level-2 critic with only one model available; live
research inside this cloud container (Wikipedia and Hugging Face do not
answer here); any real-model validation until the owner provides a brain
(section 18).

## 16. Memory and context-management strategy

1. **Split the manual.** The 73 KB manual is sent to every stage today
   (~23k tokens per call). It becomes prompt modules per capability (intake,
   research, ledger, outline, chapter writing, critic, revision, en-US style,
   genre profiles), versioned and tested. The sections of
   `prompts/4-zupona-squad-brains.txt` are reviewed and reused as modules
   only where a test shows they help.
2. **Context pack per chapter:** brief (short), genre and style modules, the
   chapter's outline beats, only the claims those beats need (with wording
   rules), the entity sheet for names in this chapter, the narrative memory
   so far (compact), the previous chapter's last scenes and the next
   chapter's first beat. Target 15–30k tokens for any film length.
3. **Retrieval is deterministic first:** by claim ids, entity ids and beat
   ids from the outline. Embedding search is optional later and only for
   research evidence.
4. **Memory is a file, not a conversation:** every task starts fresh from
   the dossier, so resume, reassignment and a different critic brain all see
   the same state.

Accept: per-call input stays under 30k tokens for a 300-minute plan
(computed by an updated `windowNeeds`); continuity gate G13 passes on the
60-minute test.

## 17. Reliability, recovery, logging and security

- **Recovery:** task-level checkpoints (reuse `stage()` and jobs leases);
  schema-repair retries (reuse the S3/S5 repair pattern); fallback brain
  (B4); deterministic content hashes so a redone task with the same inputs
  is skipped.
- **Logging:** per-task trace (B6); costs per brain (reuse `record`,
  `costOf`); structured messages in `messages.mjs` (en + bn) for every new
  user-facing message.
- **Prompt versions:** every prompt module has a version recorded with each
  output; a changed prompt invalidates only the tasks that used it.
- **Security:** secrets only in environment or Worker secrets, never in the
  dossier, logs or prompts; fetched pages are untrusted (section 6);
  `publicUrl` blocks private hosts (residual risk: a public name resolving
  to a private address on the owner's machine; add a resolved-address check
  in the local fetcher); no auto-publishing (existing rule).
- **Honest status:** the studio shows not-run gates, critic level and
  degraded capabilities, as preflight already does for missing tools.

## 18. Testing and evaluation strategy

Four separate layers. A passing lower layer proves nothing about a higher one.

| Layer | What | Runs where | Proves |
|---|---|---|---|
| T1 Automated unit and contract tests | schemas, code checks (C3, L1, S8 metrics, gates), executor, assigner | CI, every commit | the code does what it says |
| T2 Mock-model pipeline tests | the full graph with scripted fake brains, including failures and bad JSON; **record/replay** of real outputs once they exist | CI | orchestration, recovery, gates wiring |
| T3 Real-model tests | qualification suite (M2), seeded-defect recall, the topic runs below | owner's machine or a free-tier brain | what real brains actually produce |
| T4 Human evaluation | blind rubric scoring and pairwise comparison by at least 2 readers (3 preferred), plus a gold fact sheet per topic | people | quality |

### Topic test plan

For each topic a **gold fact sheet** is prepared by a person from primary
sources *before* the run (20–40 key facts, known disputes, the current state
of changing facts). The engine's output is scored against it: factual
precision (share of narrated claims that are correct), recall of key facts,
disputes recorded, fabricated sources (must be 0).

| Topic | Genre / mode | Specific checks |
|---|---|---|
| The 1970 Bhola cyclone | history / disaster, F0 | death-toll estimates differ widely between sources: must be a disputed claim with ranges and attribution; political consequences (the 1970 election, the 1971 war) as supported interpretation; US-audience context (what East Pakistan was); respect for victims |
| CRISPR discovery and the patent dispute | science + investigation, F0 | who published what and when (2012 Science paper, 2013 work at the Broad Institute), the 2020 Nobel Prize; the patent dispute's **current** status must be checked live (freshness test); clarity of the mechanism for a lay US viewer |
| The 1977 Tenerife airport disaster | disaster minute by minute, F1 | 27 March 1977, Los Rodeos, KLM and Pan Am, 583 deaths: from official reports; radio exchanges only as recorded; chronology exactness; differing findings of the national investigations recorded as such; suspense from the real timeline, no invented dialogue |
| Roanoke colony (added) | historical mystery, F0 | competing hypotheses with evidence for and against; no false resolution |
| A biography (added; the owner picks the person) | biography, F0 | no invented thoughts; myth vs record |
| A calm factual sleep story (added) | sleep story, F0 | no cliffhangers, slower pace, low-arousal language |

Runtimes: 10 minutes first (cheap smoke run), then 30, then 60 for the first
three topics; one 120-minute run for long-form.

**Scoring per run** (1–5 anchored, quoted evidence required): research
quality, source reliability, factual accuracy (from the gold sheet), narrative
quality, hook strength, emotional development, suspense, pacing, transitions,
American English, retention potential; plus the code metrics: gates, claims
per minute, repetition, placeholders, revision rounds, critic level, tokens
and time.

**Baselines:** the current engine (`runFilm`, today's code) is run first on
the same topics and the same brain. Every later phase must beat that baseline
in blind pairwise human judgement (target ≥70% wins) without lowering factual
precision.

**Inter-rater check:** if raters disagree by more than 1 point on a dimension,
a third reader decides; agreement is reported.

**Post-publication (later):** `retention.mjs` compares real YouTube retention
with the S8 risk windows to calibrate them. Until then retention predictions
are labelled uncalibrated.

**No result is reported without a run.** Results go to
`docs/evals/<date>-<topic>.md` with the brain, model id, prompt versions and
dossier hash.

## 19. Risks and technical limitations

| Risk | Effect | Mitigation |
|---|---|---|
| Free local models write weaker long-form English than frontier models | lower story scores | measure in Phase 0; use the best model the owner's hardware runs; an optional paid adapter remains the owner's choice |
| Same-model critic is blind to its own faults | false passes | level-2 critic where possible; seeded-defect recall measured; disclosure |
| Critic scores are noisy | gates flip | anchored rubrics, quoted evidence, pairwise comparison, several samples for borderline cases |
| Research providers rate-limit or change | thin research | multiple providers, caching, backoff; completion gate reports the shortfall |
| Wikipedia-heavy research | tertiary sources dominate | tier rules; G2 requires tier-1 support for key claims |
| Prompt injection from web pages | manipulated output | untrusted blocks, span verification, critic check |
| Long runs take hours on local hardware | slow iteration | 10-minute smoke runs; record/replay for development |
| Over-engineering | features that do not raise quality | every phase must beat the baseline on the eval before the next starts |
| Retention cannot be predicted without data | false confidence | labelled uncalibrated; calibration later |
| This cloud container cannot reach research sites or run local models | no validation here | runs on the owner's machine or with a free-tier key; or the owner adds research hosts to the environment |

## 20. Prioritized implementation roadmap

Each phase ends with tests passing, the type check, the build check, one
commit and a push, and (from Phase 0 on) a measured eval report. No phase
starts before the previous phase's exit criterion is met, except where marked
parallel.

| Phase | Work | Depends | Exit (measurable) |
|---|---|---|---|
| **0 Real baseline** (blocking) | owner provides a brain (Gemini free key as an environment secret, or a local 30B-class model with a ≥64k window and normal internet); brain qualification M2 (first version); run the **current** engine on the 3 topics at 10 minutes; human scoring; record/replay fixtures saved | owner decision | 3 baseline eval reports; known failure list; thresholds in section 14 tuned |
| **1 Truth fixes in the current engine** | G7 placeholder and unresolved-marker gate; not-run = fail; `lintNarration` for all formats feeding gates; story gate critical with owner override; Gemini grounding URLs | 0 (can start in parallel) | Ramesh Babu production blocked until its 37 placeholders (10 in narration) are resolved; seeded tests pass; mock suite green |
| **2 Dossier + registry + executor** | D1 schemas; B2 registry with computed role status; B1 executor running the legacy graph unchanged | 1 | golden test: legacy run identical through the executor; studio role counts equal the registry |
| **3 Research v2** | R1–R9, free providers, span verification, completion gate G1–G3 | 2 | on the 3 topics: 100% spans verified, 0 dead URLs, gold-sheet key-fact recall ≥80%, disputes recorded |
| **4 Claim verification v2** | C1–C5, sentence tags, G4, G5, G8, G15 | 3 | seeded defects: 100% numbers/dates/placeholders, ≥90% overstatements |
| **5 Critic and calibration** | V1–V3, rubrics, calibration set, independence levels, G9, G16 | 2 (parallel with 3–4) | critic recall measured per brain; level-2 critic working with at least one free pairing |
| **6 Story v2** | S1–S5, S7, S9, genre profiles, factuality modes, en-US module L1, modular prompts | 4, 5 | beats baseline in ≥70% of blind pairwise judgements on the 3 topics at 30 minutes; G10–G14 pass |
| **7 Targeted revision** | V4, V5, B5 escalation, up to 3 rounds | 5, 6 | ≥80% of seeded fixable defects fixed with no new critical defect |
| **8 Long-form** | hierarchical outline, context packs, cross-chapter checks, act-level critic, updated `windowNeeds` | 6, 7 | 60-minute runs on the 3 topics pass all gates; one 120-minute run on a 64k brain |
| **9 Supervisor v2** | B3 model-assisted expansions, B4 reassignment and fallback, parallel scheduling | 2, 5 | failure-injection tests pass; parallel chapter reviews cut wall time measurably with identical outputs |
| **10 More genres** | Roanoke, biography and sleep-story runs; profile tuning | 8 | each genre's gates pass; human scores ≥ the 3 core topics |
| **11 Arabic profile** | L2 | 8 and an Arabic-qualified brain | native review ≥4/5 fluency; en-US goldens unchanged |
| **12 Calibration with audience data** | S8 vs real retention | published films | correlation reported; thresholds updated |

**First owner decisions needed (Phase 0):**

1. Which brain for the first real runs: Gemini free tier (key saved as an
   environment secret, never in chat) or a local model (which computer: RAM,
   GPU).
2. Whether this cloud environment may reach research hosts (Wikipedia and the
   providers in section 6), or the runs happen on the owner's machine.
3. Who scores the human evaluation (at least two readers).

---

## Appendix A: audit reconciliation (verified against the code, 12 Nov 2026)

| Finding | Source | Verified | Evidence |
|---|---|---|---|
| 151 roles: 63 code, 46 model, 6 built, 36 planned | both audits | yes | `ROLE_STATUS` counted by script |
| Only 54 of 151 roles attached to any stage | BOSS audit | yes | `productionGraph(understand(...))` role union |
| No runtime agent selection; fixed stage list | both | yes | `IDEA_STAGES` and `runFilm` order |
| `pipeline.mjs` `planRun` is display only | BOSS audit (SCRIPT audit: not inspected) | yes | only import is `studio.mjs:12` |
| `prompts/4-zupona-squad-brains.txt` used by no code | BOSS audit | yes | only prompt 1 is imported (`worker/index.mjs:48`, `local/run-film.mjs:86`) |
| Same model for every stage; no independent critic | both | yes | one `model` in `runFilm` |
| Story gate not critical; looks at the opening only | both | yes | `CRITICAL_GATES`; `reviewRun` story block |
| Claims gate checks IDs, not meaning | both | yes | `reviewRun` claims block |
| One revision round | both | yes | `LIMITS.maxRevisions = 1` |
| `state.gaps` (lint, viewer score) not read by gates | BOSS audit | yes | `reviewRun` reads only stage files |
| Placeholders pass every gate | BOSS audit | yes | only `timeline.mjs:549` notes them; Ramesh Babu USA: 37 distinct in scene lines, 10 in narration (5 scenes) |
| Writing lint only for story and motivational formats | BOSS audit | yes | `film-run.mjs` S5 stage condition |
| No real-model run of the engine | both | yes | tests use fake models; the saved production was hand-run from prompts |
| Tests: 173 + 73 pass | BOSS audit ran them; SCRIPT audit did not | yes, after root `npm ci` | 6 platform files fail without root `node_modules` |
| **New:** local brain default window 32,768; a 5-minute film needs ~49k | this plan | yes | `LOCAL_DEFAULTS.contextTokens`; `windowNeeds(5)` |
| **New:** a 300-minute film needs ~245k tokens per S5 chapter call | this plan | yes | `windowNeeds(300)` |
| **New:** S3 writes the whole plan in one call (32k output tokens) | this plan | yes | `stage("s3")` maxTokens |
| **New:** genres exist as 25 presets but only shape one brief line | this plan | yes | `filmBrief` FORMAT line |
| **New:** `docs/BRAIN.md` calls Claude "best tested so far", but no real run is recorded | this plan | yes | no eval output in the repository |

Where the two audits differ:

- Wikipedia access from this container: the SCRIPT audit reports a 403 from
  the proxy; the BOSS audit saw no reply. Both mean it is blocked here.
- The SCRIPT audit lists a Gemini key as costing money; the adapter and
  `docs/BRAIN.md` use the **free tier** (daily limits). A paid Gemini plan
  is not required.
- The SCRIPT audit's last roadmap item (Bangla writer) is superseded by the
  owner's direction: en-US first, Arabic as a separate profile, Bangla
  optional.

## Appendix B: component → files

| Component | Reuse | New (proposed paths) |
|---|---|---|
| B1–B7 | `bossism.mjs`, `supervise.mjs`, `film-run.mjs` (`stage`, `ask`, budget), `jobs.mjs` | `engine/src/boss/{executor,registry,planner,assigner,review-router,gates}.mjs` |
| D1 | Store, `folder-store.mjs`, R2 | `engine/src/dossier/{schemas,store}.mjs` |
| R1–R9 | `research-desk.mjs`, `source-check.mjs` | `engine/src/research/{questions,providers,tiers,evidence,claims,conflicts,timeline,gaps,completion}.mjs` |
| C1–C5 | `scene-lines.mjs` (`parseSceneLines`, PLACEHOLDER), loop ledger | `engine/src/claims/{ledger,mapper,factcheck,entailment,hook-honesty}.mjs` |
| S1–S9 | `formats.mjs`, `story-mode.mjs`, `hookFindings`, `retention.mjs` | `engine/src/story/{audience,genres,spines,outline,ledgers,writer,transitions,segments,memory}.mjs` |
| L1, L2 | `versions.mjs`, `arabic.mjs`, `text-scripts.mjs`, `lintNarration` | `engine/src/language/{en-us,ar}.mjs` |
| V1–V5 | `applyFixes`, viewer panel pattern | `engine/src/review/{critic,rubrics,findings,revise}.mjs`, `engine/test/fixtures/seeded/` |
| M1, M2 | `worker/brain.mjs` and adapters | `engine/src/models/qualify.mjs`, `docs/evals/` |
| Prompts | `prompts/1-...full.txt`, `prompts/4-...squad-brains.txt` | `prompts/modules/*.txt` (versioned) |

Every new user-facing message goes into `engine/src/messages.mjs` (en + bn),
and after editing `engine/src/` the studio copy is synced (`npm run sync`),
as the working rules require.
