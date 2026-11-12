# Phase 0 experiment plan: first real AI script, one topic

Date: 12 Nov 2026. Status: **plan only; nothing run; no key requested.**
Builds on Master Plan §21 (baseline protocol), §18 (rubric) and State §4e
(cost control), §4h (research sources). Narrowed to **one topic**, as asked.

Purpose: get the first measured evidence of how well this engine writes an
American English documentary script with a real model. A test passing with a
fake model says nothing about script quality; this experiment does.

## 0. Why the sample script is not written now

The sample must come from the engine with a real model. If I (Claude, the
coding assistant) wrote it now, it would measure my writing, not Zupona's,
and it would bias the readers and the gold fact sheet. So the complete
English script is the **output** of run B below and is committed as
`docs/evals/2026-11-<dd>-tenerife-B.md` once the run is done.

## 1. Topic

**The 1977 Tenerife airport disaster** (two Boeing 747s, KLM and Pan Am,
collided on the runway at Los Rodeos). Format `disaster-minute-by-minute`,
10 minutes, en-US. Every fact in this paragraph is a hypothesis the run and
the gold sheet must confirm.

Why this topic:
- Best documented of the three Master Plan topics: official investigation
  reports (Spain, the Netherlands) and the US pilots' union (ALPA) review;
  the research hosts that work here (Wikipedia, LOC, Archive, FAA,
  SKYbrary) cover it, and Europe PMC / PubMed hold papers on what it changed
  (cockpit teamwork training, CRM).
- Clear US angle: an American airline; the changes to cockpit teamwork
  and radio phrasing used on US flights today.
- Hard for facts: many numbers (times, counts, distances), contested
  details (who said what on the radio), and victims to treat with respect.
- **Hard for originality**: heavily covered on YouTube. If the engine only
  reproduces the familiar telling, the readers will see it.

## 2. Two arms, same model, same settings

| | Arm B (main): our research engine | Arm A (control): engine as it is today |
|---|---|---|
| Research | Gemini **without** Google Search; the research desk gives it a numbered corpus: Wikipedia + the 5 sources of §4h; every fact must cite a corpus document, others are dropped (`bindToCorpus`) | Gemini searches Google itself (grounding), up to 30 searches |
| Then | source desk opens every cited page and looks for each number (`checkSources`); the rest of the 15 stages unchanged | same |
| Answers | does **our** evidence pipeline give a better-sourced script? | what does today's code produce (the Master Plan baseline)? |

Arm B runs first. Arm A runs only if the free quota allows on the same day
or the next; otherwise it is recorded as "not run" with the reason.

Settings for both: `--minutes 10 --format disaster-minute-by-minute
--script-only --no-edit --max-revisions 1 --lang en-US`, the same notes
(three lines of US-audience positioning, stated as questions to verify),
same commit, same model id.

## 3. How the script is generated (existing code, unchanged)

`film-run.mjs` stages: brief and angle (s01) → research → claims ledger (s2)
→ structure (s3) → bibles (s4) → script in scene lines with code checks for
the clock, words per second, required fields, banned phrases and language
purity (s5) → QA → viewer panel → s6, s7 (titles, description) → gates.
Originality inside the run: no other creator's script or transcript is ever
given to the model; titles are checked against proven titles
(`titleTooClose`). The model writes from research only.

## 4. How quality is measured

### 4.1 Facts (code + gold sheet)

1. **Gold fact sheet**, drafted **before** the run from primary and official
   sources, every line cited, marked "AI-drafted" until the owner checks it.
   Written before the script exists, so the script cannot shape it.
2. Every factual sentence of the narration is listed and marked: correct /
   minor error / wrong / not in the gold sheet (then checked against its
   cited source) / unsupported.
3. Metrics: **factual precision** = correct ÷ checkable claims; wrong-claim
   count; unsupported-claim rate; placeholders left; source-check summary
   (verified, opened, unconfirmed, unreachable, dropped); share of claims
   from primary or official sources.

### 4.2 Originality (code, new small script)

- Copy check: the longest run of identical words between the narration and
  every page the research opened; any run of 12+ words is flagged and
  quoted. This catches the real risk: copying sentences from sources.
- What it cannot check: copying from YouTube videos (we have no transcripts
  and will not download them). Readers judge structural freshness instead;
  this limit is written in the record.

### 4.3 Writing and story (people, blind, rubric of Master Plan §18)

13 dimensions scored 1–5 with a quoted line as evidence: research, factual
accuracy, opening hook, structure, emotion, suspense, pacing, transitions,
repetition, **American English**, chapter coherence, retention potential
(reader's judgement, not a prediction), ending.

- **Reader 1**: the owner. **Reader 2**: an independent US-English reader;
  if none is named, their scores stay **pending**, never filled in.
- **AI critic** (labelled, never counted toward a threshold): recommended
  this Claude Code session, a different model family from Gemini, scoring
  before seeing gate results or human scores.
- Blind: readers get the script only (no gates, no other scores); scores are
  revealed together; a gap above 1 point is kept and discussed, not averaged.
- Arms compared pairwise and blind (A/B order hidden) when both exist.
- Phase 0 only **measures**. The release thresholds (every dimension ≥3,
  research and accuracy ≥4, mean ≥3.5) are reported beside the scores,
  not used to call the engine good or bad.

## 5. Cost and usage control

| Control | How | State |
|---|---|---|
| No charges possible | the key comes from a Google Cloud project with **no billing account linked**; beyond the free limits Google refuses (429), it does not bill | owner creates it and confirms on the project's Billing page; I cannot verify billing myself, the record says so |
| Key never exposed | saved through the secure credential form (host `generativelanguage.googleapis.com`, header `x-goog-api-key`); the proxy injects it; the run uses the dummy value `injected-by-proxy`; never in chat, repo, logs or files | not requested yet |
| Free model chosen from official limits | read the official pricing / limits / terms pages, then call `models.list` (no generation, costs nothing) and record the limits the API reports | **blocked:** `ai.google.dev` docs now redirect to `aistudio.google.com`, not on the allowlist; needs that host added (read-only) or the owner reads the page |
| Price table | the chosen model added to `PRICES` at $0 only after its free tier is confirmed; an unlisted model is priced at the most expensive one and needs `--budget` (existing safeguard) | code exists |
| Hard request cap (new) | `--max-calls 40` per run: the run stops and saves before call 41 | to build (C2) |
| Expected usage per arm | 12–25 requests (§21.2), Arm A 1–2 grounded; input roughly 0.5–1.5 M tokens (each call carries the 73 KB manual), **estimate, unverified**; measured per stage from `run.json` | measured in the run |
| Emergency stop | `STOP` file in the film folder or `ZUPONA_STOP=1`, checked before every call | code exists (§4e) |
| Data use | free-tier terms may let Google use prompts and replies (the manual, the research) to improve its products; no personal data is sent | **owner must accept** |

## 6. Real vs simulated: how they are kept apart

- Every experiment record is headed **LIVE RUN** with: commit hash, model
  name **as returned by the API** (`modelVersion`), response id per call,
  date and time, token usage per stage, allowed hosts.
- Raw replies are kept in `films/phase0-*` (not in git) and their SHA-256
  hashes are in the record, so any number can be traced to a reply.
- Recorded replies become replay fixtures for CI, labelled "recorded live
  <date>"; replay tests prove the code still handles them, nothing more.
- Mock and replay tests are never quoted as evidence of script quality.
  Every quality number in the record comes from the live run and the
  readers, with its source named.

## 7. Small code changes needed first (with mock tests, before any key)

| ID | Change | Why |
|---|---|---|
| C1 | `GEMINI_SEARCH=off`: Gemini reports `webSearch: false`, so the run uses the research desk | makes Arm B possible |
| C2 | `--max-calls N`: hard stop on model calls per run | a ceiling that does not depend on price |
| C3 | record `modelVersion`, response id and usage per call in `run.json` | proof of a live run |
| C4 | `local/copy-check.mjs`: longest shared word run between script and opened pages | originality check 4.2 |

## 8. Order of work after approval

1. Build C1–C4 with tests; full checks; commit.
2. Draft the gold fact sheet (cited, marked AI-drafted); commit.
3. Owner: create the key in a no-billing project, confirm no billing, accept
   data use; add `aistudio.google.com` or read the limits page; then I ask
   for the key through the secure form.
4. `models.list`; choose the model; record limits; add it to `PRICES` at $0.
5. Run Arm B; write the record and commit the complete script.
6. Run Arm A if quota allows; record.
7. Readers score blind; AI critic scores; record completed; Phase 0 review
   with the owner and the engineer. No Phase 2 work before that review.

## 9. What this experiment will not show

One topic, one genre, 10 minutes, one model: it does not show quality at
30–60 minutes, in other genres, with other models, or with real audiences.
Retention potential is a reader's judgement; no views are predicted.
