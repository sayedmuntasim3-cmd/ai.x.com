# Phase 0 readiness report

Date: 12 Nov 2026. **Status: READY FOR APPROVAL, not run.** Code, tests and
official-terms check are done. A live run still needs the owner's approval,
the key, and the model and quota check of §5 step 3. Nothing was deployed. No key requested, no live call made, no billing touched.

Plan: `PHASE0_EXPERIMENT_PLAN.md`. This report adds the preparation tasks
of 12 Nov (minimal context, request-path limit, originality, Google terms).

## 1. Model selection

**Recommended: `gemini-3.8-flash`, arm B only.** (Official pages read
12 Nov 2026; §4.)

- `gemini-2.5-flash` (today's adapter default) is **deprecated**, "no longer
  available to select in Google AI Studio (API access to the 2.5 models is
  limited to existing users)", and from **1 Dec 2026** its requests route to
  `gemini-3.5-flash-lite`. A new free project should not expect access.
- Free text models a new project can use: `gemini-3.8-flash` (newest Flash,
  Sept 2026), `gemini-3.6-flash`, `gemini-3.5-flash-lite`,
  `gemini-3.1-flash-lite`, `gemini-3-flash-preview`. Paid only:
  `gemini-4-carbon`, `gemini-4-argon`, `gemini-3.1-pro-preview`.
- Why 3.8 Flash: the most capable free model ("our most intelligent Flash
  model"), 1,048,576 input and 65,536 output tokens (our adapter's cap is
  also 65,536), structured output and thinking supported. The test is of
  writing quality, so the strongest free writer is the fair choice.
- **The two arms (owner decision, 12 Nov):** both on `gemini-3.8-flash`,
  Google Search off (`GEMINI_SEARCH=off`), same context, settings, cap and
  evaluation. **A = model knowledge only** (`RESEARCH_MODE=knowledge`: no
  search, no research desk, every fact unsourced and labelled "model
  knowledge (unverified)"). **B = our research engine** (research desk with
  the 6 sources of §3, then the source desk). The difference measures what
  our research adds. Google Search grounding is not used: it is "Not
  available" on the free tier for every 3.x model.
- Done: `gemini-3.8-flash` added to `PRICES` at $0 (valid only with no billing
  account); the run selects it with `GEMINI_MODEL=gemini-3.8-flash`. The
  Worker default is unchanged.
- Finding outside Phase 0: the Worker's Gemini default is the deprecated
  `gemini-2.5-flash`; not changed (production).

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

## 4. Google free tier: verified on 12 Nov 2026

Read-only, after the owner allowed `aistudio.google.com` in this environment
(the `ai.google.dev` docs redirect there). Pages show no "last updated" date
except the terms; the date below is the date read.

| Question | Official answer (quoted or exact) | Source |
|---|---|---|
| Free models | per pricing page: 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Flash-Lite, 3 Flash Preview, 2.5 Pro/Flash/Flash-Lite: input and output "Free of charge"; 4 Carbon, 4 Argon, 3.1 Pro Preview "Not available" on the free tier | aistudio.google.com/docs/pricing |
| 2.5 models | `gemini-2.5-flash` "is deprecated ... API access to the 2.5 models is limited to existing users. Effective December 1, 2026, all API requests to `gemini-2.5-flash` will automatically route to `gemini-3.5-flash-lite`" | aistudio.google.com/docs/models |
| 3.8 Flash limits | input 1,048,576 tokens; output 65,536; latest update September 2026 | aistudio.google.com/docs/models/gemini-3.8-flash |
| Free grounding | Google Search: "500 RPD free (limit shared for Flash and Flash-Lite)" on 2.5 only; 3.x free tier: "Not available" | pricing page |
| Free RPM / TPM / RPD | **not published** for these models: "Rate limits depend on a variety of factors (such as your usage tier) and can be viewed in Google AI Studio" (aistudio.google.com/rate-limit, signed in); "applied per project, not per API key"; RPD "reset at midnight Pacific time"; "not guaranteed" | aistudio.google.com/docs/rate-limits |
| Who is on the free tier | Free: "Active project or free trial; some projects need verification"; Tier 1: "Set up and link an active billing account" | rate-limits page |
| Charges | paid tier requires "linking a billing account and prepaying ... a minimum of $5"; free tier spend limit "N/A"; "You can unlink a project from its billing account to return to the free tier" | aistudio.google.com/docs/billing |
| Data use (free) | "Google uses the content you submit to the Services and any generated responses to provide, improve, and develop Google products ..."; "human reviewers may read, annotate, and process your API input and output"; "**Do not submit sensitive, confidential, or personal information to the Unpaid Services.**" | aistudio.google.com/docs/terms, effective March 23, 2026 |
| Data use (paid) | "Content **not** used to improve our products" | pricing page |
| Region | Bangladesh is on the available-regions list; the EEA/UK/Switzerland paid-only rule applies to apps offered to users there | aistudio.google.com/docs/available-regions; terms |
| Use | "for developers building with Google AI models for professional or business purposes, not for consumer use" | terms |

**Billing risk:** by these pages, a project with no linked billing account
stays on the free tier and cannot be charged; charges need a linked billing
account and prepaid credit. The risk is a human one: linking billing to the
same project later. Rule: a dedicated project, never linked to billing.

**Still unverified:** the actual free RPM, TPM and RPD for `gemini-3.8-flash`
(visible only in AI Studio for the owner's project, or after the key, by
watching 429s); whether a new project needs verification.

## 5. Execution sequence (after approval only)

1. `node local/experiment-context.mjs --check` (context unchanged).
2. Gold fact sheet for Tenerife, cited, marked AI-drafted, committed
   **before** any run.
3. Key through the secure form (proxy injects it), from a project with no
   billing account. Then `node local/gemini-check.mjs` (models.get only,
   generates nothing): model available, limits recorded. The owner reads the
   project's free limits at aistudio.google.com/rate-limit and records them.
4. Common settings for both arms:
   ```
   BRAIN=gemini GEMINI_API_KEY=injected-by-proxy GEMINI_MODEL=gemini-3.8-flash GEMINI_SEARCH=off
   node local/run-film.mjs --topic "The 1977 Tenerife airport disaster" --minutes 10 \
     --format disaster-minute-by-minute --script-only --no-edit --max-revisions 1 \
     --max-calls 40 --manual prompts/phase0-context.txt --notes "<positioning>" --out <folder>
   ```
5. **Arm B** first: add `RESEARCH_SOURCES=crossref,europepmc,pubmed,archive,loc`,
   `--out films/phase0-tenerife-B`; then `node local/copy-check.mjs --run films/phase0-tenerife-B`.
6. **Arm A**: add `RESEARCH_MODE=knowledge`, `--out films/phase0-tenerife-A`;
   then the copy check (only the cited-page part is empty by design).
7. Records for both (setup, `calls.jsonl` summary, tokens, gates, copy check);
   both complete scripts committed.
8. Evaluation: facts against the gold sheet; Claude as the labelled AI critic,
   blind to arm and gates; Reader 1 the owner; Reader 2 **pending**; blind
   pairwise A vs B.

Each film folder pins its context and arm (`context.json`): a resume with
another model, search, research mode, sources or context is refused.

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
| Daily free quota used up | a 429 whose `quotaId` says PerDay stops the run at once, no retries spent | `callLedger` |

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

1. **Free-tier rate limits not published** (§4): known only in AI Studio for
   the owner's project. Arm A cannot run free (§1).
2. Arm A has no sources by design, so its gates fail on sourcing; the
   comparison is on facts against the gold sheet and on the blind reading,
   not on gate counts.
3. Free-tier daily limits may stop a run midway; it resumes the next day.
4. One topic, one model, 10 minutes; AI critic is not a human; Reader 2
   pending; the gold sheet is AI-drafted until the owner checks it.
5. Copy check limits (§8).
6. Data use: Google may use and humans may read what is sent (terms, §4).
   The owner must accept this; the context holds nothing confidential
   (§2), but the owner decides whether the manual extract counts as such.

## 10. Verification without the key (12 Nov 2026)

| Item | How verified | Result |
|---|---|---|
| Model availability | official models page; `gemini-check.mjs` built (models.get) | listed and free; live check needs the key |
| Quota | official rate-limits page | not published per model; per project in AI Studio (owner) |
| Request limit 40 | tests | refuses the 41st request; retries counted; kept across resumes |
| Daily-quota 429 | test with Google's error shape (`QuotaFailure`, `...PerDay...-FreeTier`) | stops after 1 request instead of 7 |
| Other errors | tests: 400 (bad key), 403 (denied), 404 (model not found) | not retried; message keeps Google's text |
| Token usage | test: `promptTokenCount`, `candidatesTokenCount` + `thoughtsTokenCount` | thinking counted as output |
| Arm A | test | no search asked, no page fetched, invented URLs removed, facts labelled |
| Arm pin | test | resume with other settings refused |

Error shapes and field names come from Google's API as recorded in the
adapter and tests; their exact form for 3.8 Flash is confirmed only by the
first live call (logged in `calls.jsonl`).

Tests: engine 217/217, platform 94/94; type check clean; build check (dry
run) clean; `experiment-context.mjs --check` clean. All mock or replay:
**no evidence of script quality.**

## 11. Cost report

| | Value | Source |
|---|---|---|
| Cost of the experiment | **$0**: free tier, project with no billing account | pricing and billing pages |
| How a charge could happen | only if a billing account is linked to the project and credit prepaid (minimum $5) | billing page |
| Hypothetical paid price of 3.8 Flash (not our case) | input $0.75 / 1M tokens, output incl. thinking $3.75 / 1M, through 31 Dec 2026; doubles from 1 Jan 2027 | pricing page |
| Hypothetical per arm at those prices | about $0.40–1.20 (estimate from 12–25 calls) | our estimate, unverified |
| Hypothetical ceiling at the 40-call cap | about $12.60 (4 M input, 2.56 M output tokens) | our arithmetic |
| Engine budget stop | priced at $0, so it cannot catch charges: the no-billing project is the real guard | code |
