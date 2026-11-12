# Phase 0 readiness report

Date: 12 Nov 2026. **Status: NOT READY for a live run.** The code side is
ready and tested; the run is blocked because Google's official model, limit,
pricing and terms pages could not be read (§4), and on the owner decisions in
§9. No key requested, no live call made, no billing touched.

Plan: `PHASE0_EXPERIMENT_PLAN.md`. This report adds the preparation tasks
of 12 Nov (minimal context, request-path limit, originality, Google terms).

## 1. Model selection

**Not finalised: no official source could be read.**

- Candidate: `gemini-2.5-flash`, the adapter's default and the only Gemini
  model in `PRICES` at $0. Reason: Phase 0 should test today's code.
- Unverified: whether it is still current, still free, and what its limits
  are. A note in Master Plan §21.1 says earlier excerpts did not list it and
  mentioned a newer Flash preview; also unverified.
- Rule: the model is chosen only after (a) the official pages are read and
  (b) `models.list` with the key (no generation) shows it. Both arms then use
  that one model id (`GEMINI_MODEL`), recorded with the `modelVersion` Google
  returns on every call. A model not in `PRICES` is priced at the most
  expensive one and refused without `--budget` (existing safeguard), so it
  must be added at $0 only once its free tier is confirmed.

## 2. What is sent to Google

`prompts/phase0-context.txt`, **56,493 bytes** (the manual is 73,288),
SHA-256 `e6e08870e029dffac88fe875f324243538e5d9051ec4bc7fd63d99993d7ea889`,
built by `local/experiment-context.mjs` from the manual by selecting
sections; nothing rewritten except four phrases (listed in the file header).

- Kept: non-negotiables; role; language rules 1.1, 1.3, 1.4; the S0–S7
  list; quality loop; S0–S4 (intake, angle, claim ledger with named-subject
  and sensitive-subject rules, story architecture, bibles); media ladder and
  sync rules; S5 scene format; checklists; S6 QA; S7 items 1–6 and 8;
  good-vs-bad examples (English); banned list.
- Removed: platform address and chat copy instructions; the description of
  Zupona's internal agent squads; the chat protocol (STATE block, commands,
  long-film batching; the code's PIPELINE MODE already overrides it); Bangla
  defaults, the Bangla standard and Bangla examples; localisation, the
  channel measurement plan and the Facebook pack; the growth strategy (§17);
  the chat start (§18).
- Remaining: 8 lines hold Bangla words inside multilingual rules (for example
  the list of banned words in every language); no keys, passwords, hosts,
  personal data or architecture.
- Why not smaller: every kept section is referred to by a stage instruction
  in `film-run.mjs` (sections 4–8, 11–14, 16). Removing more would change
  the engine under test, not just what is sent.
- Also sent per call: the film brief (topic, notes, en-US VERSION LOCK),
  earlier stage outputs and, in arm B, the research corpus. The viewer panel
  and the research desk's two calls get no manual at all (existing code).
- Enforced: `--manual prompts/phase0-context.txt`; the film folder pins the
  context (`context.json`, SHA-256) and refuses a resume with any other
  context; `calls.jsonl` records per call `contextSha256` and
  `fullManualIncluded` (must be `false` in every Phase 0 call).

## 3. Research sources in arm B

`GEMINI_SEARCH=off` and `RESEARCH_SOURCES=crossref,europepmc,pubmed,archive,loc`:

| Source | Host | Role |
|---|---|---|
| Wikipedia (always on in the research desk) | en.wikipedia.org | overview, and the references its articles cite (opened by code) |
| Crossref | api.crossref.org | confirms that cited papers exist; rarely has abstracts |
| Europe PMC | www.ebi.ac.uk | papers on what the accident changed (crew resource management) |
| PubMed | eutils.ncbi.nlm.nih.gov | same, abstracts |
| Internet Archive (text items) | archive.org | reports and documents |
| Library of Congress | www.loc.gov | catalogued items, period records |

All replied live on 12 Nov (State §4g, §4h). The source desk then opens every
cited page through the guarded fetch; only this environment's allowed hosts
answer. Arm A uses Gemini's own Google Search instead.

## 4. Google free tier: verified and unverified

Tried on 12 Nov 2026, from this container (curl) and through the web fetch
tool: every page (`ai.google.dev/gemini-api/docs/pricing`, `rate-limits`,
`models`, `terms`, `billing`) answers **301 to `aistudio.google.com/docs/...`**,
and that host is refused here (container) or does not resolve (fetch tool).

| Item | State |
|---|---|
| Current model ids, input/output limits, grounding support | **unverified** |
| Free tier per model; RPM, TPM, RPD; grounding requests per day | **unverified** |
| Whether a project with no billing account is always on the free tier and gets errors, not charges, past the limits | **unverified** (our safety rests on it) |
| Whether free-tier prompts and replies are used to improve Google's products, read by human reviewers; region limits on unpaid use | **unverified** (my understanding: yes to use and review; not relied on) |
| Endpoint `generativelanguage.googleapis.com` reachable from here | verified (answers 404 at the root; no key sent) |

Nothing here is assumed. To verify: allow `aistudio.google.com` (read-only)
in this environment, or the owner reads the five pages and records the
answers with the page date.

## 5. Execution sequence (after approval only)

1. `node local/experiment-context.mjs --check` (context unchanged).
2. Gold fact sheet for Tenerife, cited, marked AI-drafted, committed
   **before** any run.
3. Key through the secure form (proxy injects it); `models.list`; model
   chosen and recorded (§1).
4. **Arm B:**
   ```
   BRAIN=gemini GEMINI_API_KEY=injected-by-proxy GEMINI_MODEL=<chosen> GEMINI_SEARCH=off \
   RESEARCH_SOURCES=crossref,europepmc,pubmed,archive,loc \
   node local/run-film.mjs --topic "The 1977 Tenerife airport disaster" --minutes 10 \
     --format disaster-minute-by-minute --script-only --no-edit --max-revisions 1 \
     --max-calls 40 --manual prompts/phase0-context.txt --notes "<positioning>" \
     --out films/phase0-tenerife-B
   node local/copy-check.mjs --run films/phase0-tenerife-B
   ```
5. Record B (setup, calls.jsonl summary, tokens, sources, gates, copy check);
   commit the complete script.
6. **Arm A:** the same command and environment without `GEMINI_SEARCH`,
   `--out films/phase0-tenerife-A`; then the copy check. Only if quota allows;
   otherwise "not run" with the reason.
7. Evaluation: Claude as the AI critic (labelled, scored before seeing gates);
   Reader 1 the owner; Reader 2 **pending**; blind A/B pairwise.

Only `local/run-film.mjs` is used. **`local/jobs.mjs` (the job worker)
does not enforce the request cap or the context pin** (it calls
`produceFilm` without a ledger); it must not be used for Phase 0.

## 6. Request and token limits

| Limit | Value | Enforced by |
|---|---|---|
| Requests to Gemini per film folder | 40, retries included, across resumes | `callLedger` (fetch refuses the 41st; the run pauses first) |
| Output per call | 4k–64k tokens by stage (code) | the request's `maxOutputTokens` |
| Input per call | context ≈ 18k tokens + brief + earlier stages (estimate) | not capped separately |
| Expected per arm | 12–25 requests; roughly 0.3–0.8 M input tokens (**estimate**) | measured per call in `calls.jsonl` |
| Hard ceiling | 40 calls; output ≤ 2.56 M tokens in the worst case | cap × largest output |
| Cost | $0: the key must belong to a project with **no billing account** | Google (unverified, §4) |
| Emergency stop | `STOP` file or `ZUPONA_STOP=1`, before every call | `halt` |

## 7. Privacy and security safeguards

- Key only through the secure form; never in chat, repo, logs or env files;
  the run sees the dummy `injected-by-proxy`.
- Minimal context only (§2); no personal data; public topic.
- Research hosts fixed per source, redirects off-host and private addresses
  refused; pages opened only on public addresses.
- Every call logged with hashes, so any claim about the run can be checked.
- Production unchanged: the Worker never sets `GEMINI_SEARCH`, never passes
  `--manual`, and has no ledger; defaults are as before.

## 8. Originality checks

`local/copy-check.mjs`, code only:
1. **Exact match**: runs of 12+ identical words vs every opened page.
2. **Close paraphrase**: sentences of 8+ words with half or more of their
   word trigrams in one page.
3. **Source-order dependence**: flagged when 40%+ of sentences lean on one
   page and 80%+ of those follow its order.

**It cannot detect** paraphrase with different words, translation, ideas or
structure taken from other creators' videos (no transcripts, by rule) or
sources the research never opened. The AI critic and the readers judge those
(rubric: structure, hook, originality notes).

## 9. Remaining risks, limits and owner decisions

1. **Google pages unread** (§4): model, limits, billing behaviour, data use.
   Decision: allow `aistudio.google.com` here, or read them yourself.
2. **Arm A's sources may be off the allowlist**: Gemini's search can cite any
   site; the source desk can open only allowed hosts, so A may show more
   "unreachable" than B for reasons of this environment, not quality. The
   record will split "blocked by allowlist" from "site error" and compare
   facts on the gold sheet, not on reachability alone.
3. Free-tier daily limits may stop a run midway; it resumes the next day.
4. One topic, one model, 10 minutes; AI critic is not a human; Reader 2
   pending; the gold sheet is AI-drafted until the owner checks it.
5. Copy check limits (§8).
6. The data-use terms must be accepted by the owner once read.

## 10. Test results (12 Nov 2026)

Engine 217/217, platform 88/88 (82 at the last report + 3 experiment context,
2 copy check, 1 runner `--manual`); type check clean; build check (dry run) clean;
`experiment-context.mjs --check` clean.
All mock or replay: **no evidence of script quality**.
