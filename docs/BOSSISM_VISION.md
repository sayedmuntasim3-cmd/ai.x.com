# Bossism: long-term vision (canonical)

Version 1, 12 Nov 2026. Owner-approved as the canonical vision for the
documentary platform. It changes only by the owner's decision, with a date.

How this relates to other documents:
- **This file:** what we are building and how success is measured.
- **`docs/BOSS_SCRIPT_ENGINE_MASTER_PLAN.md`:** how it is built (components,
  gates, roadmap).
- **`docs/OPENAI_PLATFORM_RESEARCH.md`:** provider evidence.
- **`docs/VISION.md`:** the owner's earlier condensed vision (4–6 Nov 2026).
  It is kept as history. **Where they differ, this file wins** (see §11).

Nothing here claims that a capability exists. §9 lists what the code and
its tests show today.

## 1. Ambition, and how it is measured

The ambition is to build one of the most capable documentary production
intelligence platforms in the world, able to compete with the best. That is
a direction, not a fact. It counts as achieved only through measured
evidence:

| Measure | Where it is defined |
|---|---|
| Doc Bench: fixed topics across genres and runtimes, gold fact sheets, blind human scoring, labelled AI evaluation, cost and time | Master Plan §24 |
| Release gates: 100% of mandatory gates reported, 0 FAIL, 0 BLOCKED | Master Plan §14 |
| Human quality thresholds: every dimension ≥3 from each reader, research and accuracy ≥4, mean ≥3.5 | Master Plan §18 |
| Improvement over time: each engine version beats the previous one in blind pairwise judgement without losing factual precision | Master Plan §18, §24.4 |
| Real audience results: retention against the channel's own baseline, once films are published | Master Plan §8 (S8), §22 |

No statement that Bossism is better than a named competitor is made without
a comparison on Doc Bench (Master Plan §24.4).

## 2. What the user experiences (the contract)

The user gives a topic, a duration (for example 30, 40 or 60 minutes, or
several hours) and optional preferences or restrictions. Then:

| Promise | Measurable form | Master Plan |
|---|---|---|
| Bossism understands the request and says what it will do **before** spending quota or money | every run shows a plan: feasibility for the runtime, research risk, chosen capabilities and why, cost estimate and cap | §5 (B3), §23 |
| The user never chooses providers, models or agents | routing by measured capability profiles; the choice and its reason are recorded | §5 (B4), §15 (M2) |
| A runtime the evidence cannot support is not padded | the run proposes a shorter runtime or narrower scope instead | §6, §12 |
| Every factual claim has an evidence trail | 100% of factual sentences mapped to verified evidence or marked attributed or uncertain | §7, G3–G4 |
| The script is reviewed, revised and gated before it is called finished | critic findings on exact passages; targeted revision; release gates | §13, §14 |
| The user sees what is uncertain | unanswerable questions, disputed claims, critic independence level and any owner override are listed with the script | §14 |

## 3. Quality standards, and what is never claimed

Standards:
- deep research
- an original narrative structure fitted to the genre
- factual accuracy
- an honest, strong hook
- emotional depth that is earned
- real suspense and curiosity
- controlled pacing
- chapter continuity
- meaningful transitions
- a satisfying ending

Each standard has a rubric dimension and a gate (Master Plan §8, §14, §18).

Never claimed:
- that a script is perfectly accurate
- that a film will go viral or reach a number of views
- that a forecast is certain
- that an AI evaluation is human or audience feedback
- that a capability works before a real test shows it

Never done:
- inventing events, dialogue, private thoughts, quotes or evidence and
  presenting them as fact
- presenting unverified claims as confirmed

## 4. Genres and factuality

Genres needing their own research rules, structures and review weights:
- history and major events
- biography
- science and discovery
- investigation
- human interest
- mystery
- explainer
- sleep stories

Today's 25 presets in `engine/src/formats.mjs` map onto these. The
factuality modes keep factual, documented reconstruction, dramatized and
fictional work apart (Master Plan §9).

## 5. Trend intelligence: understanding, not copying

Bossism studies what audiences want: popular and rising topics, demand,
formats that work, retention patterns, competition and underserved angles,
and evergreen subjects versus spikes. It uses that to choose a topic and an
**original** angle it can support with evidence.

- Forecasts are probabilities with a data date and a measured error; views
  are never promised.
- Trend signals never lower a research or story threshold.
- Other creators' work is studied through public metadata only and never
  copied.

Components and acceptance criteria: Master Plan §22.

## 6. Provider independence and cost

- **Zero mandatory paid AI.** Every run can complete on free options, a
  local model or a free tier within its limits.
- OpenAI, Gemini, Claude and local models are interchangeable, optional
  adapters. Bossism selects among those the owner has enabled, by measured
  quality, reliability, privacy, availability and cost.
- **No paid call without the owner's explicit enablement and cap.**
- **No automatic paid fallback**, no silent spending, no hidden subscription.
- Budgets are enforced by our own code before each request (reservation,
  caps per run, day and month, kill switch), not only by provider
  dashboards.
- Honest costs: compute, storage, hosting, rendering, narration and human
  review cost something even when no AI provider is paid.

Components: Master Plan §23. Provider evidence: the OpenAI research report.

## 7. Language and audience

- **Primary:** natural American English (en-US) for US YouTube viewers.
- **Arabic:** a separate, selectable profile with its own prompts and
  reviewers, never mixed into en-US.
- **Bengali:** an optional profile, not the default.
- Research may use sources in any language; the output follows the
  selected profile, and the profile is never changed silently.

See Master Plan §10–11.

## 8. Built to adapt for a decade

No architecture guarantees superiority for ten years. These rules keep
Bossism able to adopt what comes next without being rebuilt:

| Rule | Engineering form |
|---|---|
| Providers are adapters | one interface (`worker/brain.mjs` `Model`); measured profiles; model ids in configuration with lifecycle checks (Master Plan §23 E6) |
| Capabilities, not names | a registry of executable capabilities with schemas, checkers and tests; role status computed from it (Master Plan §5 B2) |
| Memory is data | the dossier holds research, claims, story memory and decisions; any brain can resume from it (Master Plan §6 D1, §16) |
| Prompts are versioned assets | prompt modules with versions recorded on every output (Master Plan §16, §17) |
| Quality is measured continuously | Doc Bench on every engine release; regression rules (Master Plan §24) |
| Long jobs survive failure | durable queue, checkpoints, resume (exists: `jobs.mjs`, `job-runner.mjs`) |
| Cost and performance are visible | per-run usage and cost report (Master Plan §23 E5) |

## 9. Current state (12 Nov 2026), from the code

| Capability | State |
|---|---|
| Film run from topic to script (S0–S7), resume, budget stop between stages | code + mock tests; never run with a real model |
| Brain adapters: local, Gemini, Claude | code + mock tests; never used in a real film run |
| Source check (opens cited pages, finds numbers) and research desk (Wikipedia, cited pages, SearXNG) | code + mock tests; never run live |
| Scene-line checks, hook rules, open loops, originality, title closeness | code + unit tests |
| Bossism preflight, seven gates, one revision round, release decision, decision record | code + mock tests |
| Durable job queue and remote workers | code + tests, including real local processes |
| Topic radar, market desk, channel retention lessons | code + mock tests; never run live |
| Independent critic, claim-meaning check, multi-round research, story memory, trend forecasting, budget reservation, benchmark | **not built** |

Tests: 173 engine + 73 platform pass (after `npm ci` at the root). **No
documentary script has been produced by the engine with a real model.**

## 10. Priorities

In order, with details in Master Plan §20:
1. The real baseline (Phase 0, Doc Bench v0), with free options only.
2. Truth fixes (Phase 1).
3. Cost controls before any paid adapter (Phase 1b).
4. Dossier, registry and executor (Phase 2).
5. Research v2 (Phase 3).
6. Claims (Phase 4).
7. The critic (Phase 5).
8. Story (Phase 6).
9. Revision (Phase 7).
10. Long-form (Phase 8).
11. Trend intelligence v1 (after Phase 3).
12. Supervisor v2 (Phase 9).
13. More genres (Phase 10).
14. Arabic (Phase 11).
15. Audience calibration (Phase 12).

Every step must keep existing working code passing its tests.

## 11. Differences from `docs/VISION.md`, resolved

| `docs/VISION.md` | Resolution here |
|---|---|
| "mainly for USA and European audiences" | primary audience: the US; other English-speaking audiences later |
| "later Bangla and Arabic written natively" | Arabic is a separate profile; Bengali is optional, not the default |
| "beat Runway, InVideo, Pictory ..." | a direction; claims only after a Doc Bench comparison (§1) |
| "could reach tens of millions of views (a target, never a promise)" | kept: a target, never a promise |
| "about 150 specialist roles" | roles count only as executable capabilities (§8); the roster is a display |
| "Customers pay for the Claude tier" | a paid tier for customers is a business option; the engine itself never requires a paid provider (§6) |

Items in `docs/VISION.md` outside the script engine (signature narrator,
Quran films, website, repository privacy, pictures policy) remain as stated
there. This document does not change them.
