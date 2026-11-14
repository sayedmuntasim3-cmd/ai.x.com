# Script Intelligence Platform: assessment and blueprint

Date: 12 Nov 2026. Status: **plan only, no code changed.** Answers the
partner engineer's brief ("evolve Zupona into a world-class AI Script
Intelligence and Generation Platform"). It does not replace
`BOSS_SCRIPT_ENGINE_MASTER_PLAN.md` (v3); it maps the brief onto that plan,
names what the plan misses, and corrects the brief where the code or the
environment says otherwise. Phase numbers below refer to Master Plan §20.

## 1. Verdict

- About 80% of the brief is already designed in the Master Plan (research
  R1–R9, claims C1–C5, story S1–S9, genre profiles §9, critic and revision
  V1–V5, gates §14, trend intelligence §22, cost control §23). Building it
  again under new names would duplicate work, which the brief itself forbids.
- **The largest gap is not a missing module: no script has ever been made
  by a real model.** Every script-path test uses a fake model (Master Plan
  §1). Until Phase 0 runs, no one, including us, knows the quality of any
  script, so "world-class" and "publication-ready" are goals, not facts.
- Real gaps the plan does not cover: Bangla as a quality-reviewed script
  language (§4 G1), a native Shorts script profile (G2), technology /
  business / education / entertainment profiles (G3), and a research
  provider layer for the hosts that actually work from the cloud (G4).

## 2. Brief vs what exists

| Brief requirement | Exists today (code) | Designed, not built | Gap |
|---|---|---|---|
| 1 Research engine | `research-desk.mjs` (corpus binding), `source-check.mjs` (opens every cited page, finds each number), claims ledger + sentence tags (State 4c) | Dossier D1, R1–R9 iterative research, span verification, G1–G3 | provider layer for free hosts (G4) |
| 1 Analyse high-performing YouTube | `topic-radar.mjs` outliers, `worker/youtube.mjs`, market desk, `titleTooClose`, `retention.mjs` (own channel analytics) | T1–T8 (§22) | none in design; YouTube API host and key not configured (§3) |
| 1 Verified vs assumption | claim tags, 4 gate statuses, `[C12 low]` placeholder gate (State 4c) | C4 entailment critic, C5 hook honesty | none |
| 2 Topic intelligence | `content-intel.mjs` (`classifyInput`, `detectLanguage`, `extractPremise`), 25 presets in `formats.mjs`, factuality modes designed | 8 genre profiles + modes F0–F3 (§9) | categories tech, business, education, entertainment (G3); research depth per topic is set only by runtime |
| 3 Script generation | 15-stage `film-run.mjs`, scene-line format with code checks, story mode (fiction) | S1–S9 modular prompts, long-form (§12) | Shorts script profile (G2) |
| 3 English + Bangla | `versions.mjs` has `en-US`, `bn-BD`, `ar` with purity checks; UI messages en + bn | L1 en-US, L2 Arabic | Bangla script quality: no Bangla rubric, reader or qualified brain (G1) |
| 4 Quality evaluation | gates, viewer panel (same model as writer) | independent critic, calibration, targeted revision up to 3 rounds | none in design |
| 4 No guaranteed predictions | rule already in §22.3 and S8 | calibration with audience data (Phase 12) | none |
| 5 Keys, budget, security | budget reservation, price registry, provider flags, kill switch (State 4e); security fixes (4d); architecture tests (4f) | E5–E7 | none |

## 3. Corrections to the brief (evidence-based)

1. **"Research high-performing YouTube content."** Only public metadata is
   allowed (titles, descriptions, chapter lists, counts) through the YouTube
   Data API, as Master Plan §22.3 already rules. Downloading other creators'
   videos or transcripts breaks YouTube's terms and invites copying, which
   works against originality. Today the API host (`www.googleapis.com`) is
   **not** on this environment's allowlist and no key is set, so this part
   cannot run here yet. Storytelling technique comes from our craft manual,
   the critic rubric and, later, our own retention data, not from
   transcripts of others.
2. **"Retention potential."** Nothing can measure it before our films have
   real audience data. A retention score may be shown only as an
   uncalibrated heuristic with that label, until Phase 12 reports its
   correlation with real retention.
3. **Research sources are weaker than the plan assumed.** Measured today
   (State §4g): from the cloud, only Crossref, Europe PMC, NCBI, archive.org
   and LOC return data. Wikipedia, Wikidata (429, shared-IP rate limit) and
   OpenAlex (needs a free key) refuse; Britannica and aviation-safety.net
   block scripts. The plan's live corpus depends on Wikipedia, so Phase 0
   and Phase 3 must either run research from the owner's machine
   (unverified) or send a Wikimedia-compliant user agent with a project
   contact address (owner's decision; no personal data without approval).
4. **Bangla.** The Master Plan made en-US primary and Arabic the second
   profile. The brief asks for Bangla scripts too. `bn-BD` exists for
   language purity only. Bangla quality needs a brain that writes good Bangla
   (to be measured, not assumed) and a native Bangla reader. Proposed below
   as profile L3; owner decides its priority versus Arabic.

## 4. Gaps added to the plan

| ID | What | Reuse | New | Acceptance (measurable) | Placed after |
|---|---|---|---|---|---|
| G1 | Bangla language profile L3: register (pramito cholito), number and date style, pronunciation lexicon for voice, banned translationese | `versions.mjs` bn-BD, purity checks, `voice-plan.mjs` lexicon | rubric + calibration set in Bangla | native reader ≥4/5 fluency on 3 topics; en-US goldens unchanged | Phase 8, or earlier for Shorts if the owner chooses |
| G2 | Shorts script profile (15–60 s, hook in the first 2 s, one idea, loop-friendly ending) written for the format, not only cut from a long film | `formats.mjs`, scene-line checks, renderer's Shorts output | profile + clock and word-rate limits | code checks pass; blind pairwise vs cut-down Shorts ≥60% preferred | Phase 6 |
| G3 | Profiles for technology (fast-changing facts carry an "as of" date), business (figures only from filings or official reports), education (learning objectives, checks of understanding), entertainment (mode F3 rules) | §9 profiles, factuality modes, claim ledger | 4 profiles | each profile's gates pass on one topic | Phase 6 / 10 |
| G4 | Research provider layer: one adapter per working host (Crossref, Europe PMC, NCBI eutils, archive.org, LOC), each with timeout, retry, polite rate limit, cache, and record/replay fixtures | `net-guard.mjs`, `source-check.mjs`, Store | `engine/src/research-providers/` (pure, browser + Node) | replay tests pass offline; live check reproduces §4g; no personal data in requests | Phase 2/3 |
| G5 | Topic depth: research depth and number of claims per minute chosen from the profile and the evidence found, not only from runtime | §12 claims-per-minute rule, T6 feasibility | small pure function in the profile | thin evidence narrows runtime or refuses, with a stated reason | Phase 3 |

## 5. Target architecture (layers, with today's modules)

```
Intake ─ content-intel.mjs ─► Topic profile (formats.mjs → §9 profile + G3, mode F0–F3, depth G5)
   │
   ├─► Market signals (topic-radar, youtube.mjs → T1–T8)        metadata only, labeled uncalibrated
   ├─► Research (G4 providers → research-desk → source-check)   Dossier D1 (schemas, versioned)
   │        └─► Claims ledger C1–C5 (verified / disputed / unverified, with spans)
   ├─► Story (S1–S9; long-form §12; Shorts G2)                  scene-line format + code checks
   ├─► Language profile (versions.mjs: en-US L1, Arabic L2, Bangla L3)
   ├─► Independent critic V1–V3 ─► targeted revision V4 (≤3 rounds) ─► re-verify V5
   └─► Gates §14 (PASS / FAIL / BLOCKED / N/A) ─► release; every decision in decisions.jsonl
Orchestration: Bossism (bossism.mjs, supervise.mjs → B1–B7), jobs queue, budget E1–E8.
Brains: worker/brain.mjs (local | gemini | claude), chosen by capability, never assumed.
```

Later layers (voice, pictures, effects, animation, render) already exist in
`render/` and the media modules; their quality plan comes after the script
is proven, because every one of them depends on the script.

## 6. Implementation order (one module per step; tests after each)

| Step | Module | Needs owner? | Exit |
|---|---|---|---|
| 1 | **G4 research providers** for the 5 working hosts + recorded fixtures from real responses | no (free, no key) | replay tests green; one live call per host recorded |
| 2 | Phase 2: Dossier D1 schemas + registry + executor running the legacy graph unchanged | no | golden test: legacy run identical |
| 3 | **Phase 0 real baseline** (3 topics × 10 min) | **yes: free Gemini key from a Google project without billing** | 3 baseline records, real failure list |
| 4 | Phase 3 research v2 using G4 + G5 | Wikimedia access decision (§3.3) | span verification 100%, key-fact recall ≥80% |
| 5 | Phases 4–7 (claims v2, critic, story v2 with G2/G3, revision) | AI critic choice | as in Master Plan §20 |
| 6 | Phase 8 long-form; then G1 Bangla, Arabic, TI, audience calibration | Bangla reader; YouTube API key | as listed |

Steps 1–2 can run now. Step 3 is the most important and is blocked only by
the key. Recommended first module: **Step 1 (G4)**, because research
quality is the brief's first priority, it needs no key or money, and its
fixtures make Phase 0 and Phase 3 testable offline.

## 7. Limitations and unverified items

- No script quality is known; all quality numbers above are targets.
- Whether a new `engine/src/research-providers/` folder is copied by
  `npm run sync` and passes the architecture test: unverified; checked when
  Step 1 starts.
- Gemini free-tier quota and terms: to be re-checked at Phase 0 (§21.1).
- Research from the owner's machine (Wikipedia without 429): unverified.
- YouTube Data API quota and unit costs: to be re-checked before T1.
