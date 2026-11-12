# OpenAI Platform for the Bossism Documentary Engine: research study

Research date: 12 Nov 2026. Research only: no code, settings, keys,
environments or the Master Plan were changed; no API call to OpenAI was made.

## 0. How the evidence was gathered (read this first)

- The OpenAI hosts (`developers.openai.com`, `platform.openai.com`,
  `openai.com`, `api.openai.com`) and `ai.google.dev` **do not answer from this
  cloud environment** (checked with curl). The pages could not be opened
  directly.
- Evidence therefore comes from a web search restricted to official OpenAI
  and Google domains, which returns excerpts of the official pages. Excerpts
  can be cached or out of date; several came with age warnings.
- Labels used here:
  - **VERIFIED**: an excerpt of a current official page states it directly,
    with no conflicting official excerpt. Still to be re-read on the live
    page before money is spent.
  - **PARTIALLY VERIFIED**: official evidence exists but is old, conflicting,
    incomplete, or the detail that matters is missing.
  - **UNVERIFIED**: no official evidence found, or only community posts.
- Nothing here is a test result. No model was run.

## 1. Executive findings

1. **OpenAI offers no genuine free API for our use.** The API has a "Free"
   usage tier, but what it includes is not established. A ChatGPT
   subscription is not API access; only ChatGPT Pro and eligible Business
   plans include monthly API credits. Plus does not. Any real use should be
   budgeted as paid.
2. **The models are technically suitable for chapter-based long-form work.**
   Current models report about 1.05M-token context windows and 128k maximum
   output tokens, reasoning, structured output and tool use. Prompts over
   272k input tokens cost more, and our design never needs them.
3. **The most valuable use is a cross-vendor AI critic**, not a replacement
   writer. With Gemini or a local model writing, an OpenAI model gives the
   "different model family" review the Master Plan calls independence level
   2. It is still AI evaluation, not human or audience feedback.
4. **Web search helps discovery, not verification.** It returns URL
   citations with positions in the text, but our own code must still open
   every page and check every quoted passage and number, as it does today.
5. **Data handling is better than a free tier, but not private.** API data is
   not used for training by default. It is kept up to 30 days in abuse logs,
   and the Responses API stores state for 30 days unless storage is turned
   off. Zero Data Retention needs OpenAI's approval.
6. **Cost is moderate but real.** It depends mostly on the model:
   - 60-minute script, medium usage (assumptions in section 4): about
     **$1.50 on the cheapest current model**, **$3.50 on the balanced model**,
     **$27 on the top model**.
   - A mixed setup (cheap research, balanced writer, top-model critic): about
     **$8**.
   - A spend limit set in OpenAI's dashboard is not enough on its own; our
     own code must enforce the cap before each request.
7. **Model churn is high.** Several model families shut down in 2026, and the
   GPT-5 and o3 family shuts down on 11 Dec 2026. The adapter must treat model
   ids as configuration, checked at startup.
8. **Bangladesh** appears on OpenAI's supported-countries list, but the
   excerpt is about two years old. The live list must be checked, and so must
   whether a Bangladeshi card can pay.

**Recommendation in one line:** do not adopt OpenAI now. First run the
Gemini free-tier baseline. Then run one small, capped test with an OpenAI
model as the **critic only** (section 9), on the same three scripts, and
compare it with the human readers.

## 2. OpenAI API: capabilities and limitations

| Area | Finding | Label | Source |
|---|---|---|---|
| Current models | GPT-6 Astra ("most capable"), GPT-6.1 Terra, GPT-6.1 Sol, GPT-6 Luna, the GPT-5.6 family (Sol, Terra, Luna), GPT-5.5, GPT-5.4 and Pro, `chat-latest` | VERIFIED (model pages) | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Models](https://developers.openai.com/api/docs/models) |
| Context and output | 1,050,000 context and 128,000 max output for GPT-6 Astra, GPT-6.1 Terra, the GPT-5.6 family and GPT-5.4; `chat-latest` 400,000 / 128,000 | VERIFIED | model pages above, [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [chat-latest](https://developers.openai.com/api/docs/models/chat-latest) |
| Knowledge cutoffs | GPT-6 Astra 30 Apr 2026, GPT-6.1 Terra 1 Jun 2026, GPT-5.6 family 16 Feb 2026 | VERIFIED | model pages |
| Long-prompt pricing | prompts over 272k input tokens are charged 2x input and cache rates and 1.5x output for the whole request | VERIFIED | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5) |
| Reasoning tokens | invisible, use context space, **billed as output tokens**, counted inside `max_output_tokens`; when the cap is reached the reply is incomplete and may contain no visible text but is still billed; OpenAI suggests reserving at least 25,000 tokens at first; counts reported in `output_tokens_details` | VERIFIED | [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) |
| Responses API | the main interface; tools, background mode, conversation compaction | VERIFIED (that they exist) | [Responses overview](https://developers.openai.com/api/reference/responses/overview), [Background mode](https://developers.openai.com/api/docs/guides/background), [Compact](https://developers.openai.com/api/reference/resources/responses/methods/compact) |
| Responses, Chat Completions, Batch: priced the same per token | yes | VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Structured outputs (JSON Schema) | a JSON Schema response format exists; how strict it is was not confirmed | PARTIALLY VERIFIED | [Create a response](https://developers.openai.com/api/reference/resources/responses/methods/create) |
| Web search tool | $10 per 1,000 calls plus the retrieved "search content tokens" billed at model rates; a preview variant for non-reasoning models costs $25 per 1,000 calls with free content tokens | VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Citations | `url_citation` annotations: url, title, start and end positions in the reply text | VERIFIED (the guide excerpt was about 600 days old; the API reference agrees) | [Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search), [Create a response](https://developers.openai.com/api/reference/resources/responses/methods/create) |
| Domain filters for web search (e.g. only official sites) | not found in this research | UNVERIFIED | — |
| File search (vector stores) | $0.10 per GB per day after the first free GB; $2.50 per 1,000 tool calls (Responses API); `file_citation` annotations | VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing), [Retrieval](https://developers.openai.com/api/docs/guides/retrieval), [File search](https://developers.openai.com/api/docs/guides/tools-file-search.md) |
| Batch and Flex | 50% of Standard prices; "Fast" mode at 2x | VERIFIED (model pages) | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| Batch completion window | not confirmed in this research | UNVERIFIED | — |
| Cached input | about 5–10% of the input price, depending on the model | VERIFIED (per-model prices) | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Data-residency endpoints | 10% uplift for models released on or after 5 Mar 2026 | VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Lifecycle | Assistants API shut down 26 Aug 2026; o1, o4-mini, gpt-4-turbo shut down 23 Oct 2026; GPT-5 and o3 family (gpt-5, -mini, -nano, -pro, o3, o3-pro) shut down 11 Dec 2026, replacements the gpt-5.6 models; `v1/prompts` shuts down 30 Nov 2026 | VERIFIED (deprecations page; some excerpts carry stale dates) | [Deprecations](https://developers.openai.com/api/docs/deprecations) |
| Rate limits | per organization and per project, rising with usage tier; reaching a tier does not unlock every model | VERIFIED | [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits) |
| Writing quality for US documentary narration | not established by any official source; marketing claims are not evidence | UNVERIFIED | needs our own test (section 9) |
| Long-document consistency across 1M tokens | not established for our task | UNVERIFIED | needs our own test |

Weaknesses that matter to us:

- Reasoning tokens make cost and output size unpredictable unless the code
  caps `max_output_tokens` and reserves room for them.
- A reply can be cut off with no visible text and still be billed.
- Model ids change quickly: three model families shut down in 2026.
- Web-search citations are the model's choice of pages, not proof.

**Existing code path (UNVERIFIED, not run):** `worker/local-brain.mjs`
already speaks the OpenAI-compatible Chat Completions format with a bearer
key (`BRAIN_KEY`), so `BRAIN=local BRAIN_URL=https://api.openai.com/v1` might
work without new code. If it does, it runs without web search (so through
the research desk), without structured outputs, and without reasoning-token
accounting, and it is priced only through `BRAIN_PRICE_INPUT` and
`BRAIN_PRICE_OUTPUT`. It is not a proper OpenAI adapter. Do not rely on it
before a test.

## 3. Pricing and the free-tier question

### 3.1 Official prices (Standard tier, USD per 1M tokens)

| Model | Input | Cached input | Output | Label |
|---|---|---|---|---|
| GPT-6 Astra | 10.00 | 1.00 | 50.00 | VERIFIED |
| GPT-6.1 Sol | 2.00 | 0.10 | 10.00 | VERIFIED (a "cache writes $2.50" figure in one excerpt is unclear: PARTIALLY) |
| GPT-6.1 Terra | 1.00 | 0.05 | 5.00 | VERIFIED |
| GPT-5.6 Terra | 2.00 | — | 12.00 | VERIFIED |
| GPT-5.6 Luna | 0.20 | 0.02 | 1.20 | VERIFIED |
| GPT-6 Luna | 0.10 | 0.01 | 0.50 | VERIFIED |
| GPT-5.5 | 5.00 | 0.50 | 30.00 | VERIFIED |

Tools: web search $10 per 1,000 calls plus content tokens; file search
$2.50 per 1,000 calls plus storage. Reasoning tokens are billed as output.
Sources: [Pricing](https://developers.openai.com/api/docs/pricing) and the
model pages linked in section 2.

### 3.2 Is there a free API?

| Claim | Finding | Label |
|---|---|---|
| A "Free" usage tier exists | the rate-limit guide lists Free ($100 a month usage limit, allowed geography only), Build ($5 purchased), Launch ($100), Grow ($500) | VERIFIED ([Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)) |
| The Free tier gives free usage | whether it includes any free credits or only caps spending is **not established** | UNVERIFIED |
| ChatGPT subscription = API access | **no**. Only ChatGPT Pro and eligible Business plans include API credits, up to $500 a month, expiring each billing cycle, same email for both accounts; Plus and trials do not qualify | VERIFIED ([API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), [help article](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)) |
| Free tokens for sharing data | no official evidence found | UNVERIFIED |

Conclusion: plan for paid prepaid credits (minimum $5 purchase). Credits
expire after one year and are not refundable ([prepaid billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing)).
VERIFIED.

### 3.3 Spend control: what the provider gives, and what we must build

| Control | What it does | Is it a hard cap? |
|---|---|---|
| Prepaid balance, auto-recharge off | when credit runs out, requests fail with 429 `credit_balance_exhausted` | the closest thing to a hard cap. A small overrun beyond the balance is UNVERIFIED |
| Project hard spend limit | affected requests return 429 | VERIFIED as described ([Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)); how quickly it reacts is UNVERIFIED |
| Spend alert | notification only; traffic continues | no |
| Monthly recharge limit | caps automatic purchases, not spending of existing credit | no |

What our own application must enforce, because the provider's limits may lag
or be configured wrongly:

1. **Reserve before every request.** Count the input with the provider's
   counter. The worst-case cost is input × price plus `max_output_tokens` ×
   output price (reasoning included) plus tool calls. The request is refused
   if that worst case exceeds the remaining run, day or month budget.
   Today's `budgetUsd` checks only between stages and can overrun by one
   stage (`film-run.mjs`).
2. **Settle after every reply** with the reported usage, and record it in
   the decision record.
3. **Versioned price table.** Every price has its date and source URL. An
   unknown model id refuses to run instead of being priced at $0 (today
   Gemini is priced at $0 in `PRICES`).
4. **Emergency stop.** A kill switch the worker checks before every request
   (an environment flag, plus a studio button that writes it), and an
   automatic stop on repeated 429 or billing errors.
5. **Caps at three levels:** per run, per day, per month. All three are
   checked in code, independent of the dashboard.

## 4. Documentary cost model (estimates, not measurements)

### 4.1 Assumptions

- **Output size** is calibrated on the only real production in the
  repository (`productions/ramesh-babu/USA`, 45 minutes, written by a strong
  model following the manual). Its stage files total about 569 KB, about
  12.6 KB of output per film minute, or about 3,200 tokens per minute at
  4 characters per token. This is the "medium" output.
- **Input** for the current design: each chapter call re-sends the 73 KB
  manual plus the ledger and bibles, QA reads the film, and research reads
  search results. Estimated at about 22k input tokens per film minute,
  half of it cacheable. The Master Plan's context packs would reduce this.
- **Reasoning tokens:** an assumed multiple of visible output, 0.5x, 1x or
  2x. Not measured.
- **Web search:** a fixed number of calls plus calls per minute of film, at
  $0.01 each. Search content tokens are assumed to be inside the input
  figure.
- No prompt goes over 272k tokens: the chapter design avoids the surcharge.
- Standard tier. Batch or Flex would halve the token costs of the stages
  that can wait.

| Scenario | Input tokens per minute | Cached share | Visible output per minute | Reasoning | Searches |
|---|---|---|---|---|---|
| Low | 12k | 60% | 2.5k | 0.5x | 20 + 0.5/min |
| Medium | 22k | 50% | 3.2k | 1x | 30 + 1/min |
| High (more revisions, multi-critic) | 40k | 30% | 4.5k | 2x | 50 + 2/min |

### 4.2 Results (USD per documentary script)

| Runtime | Scenario | Input / output tokens | GPT-5.6 Luna | GPT-6.1 Terra | GPT-6 Astra |
|---|---|---|---|---|---|
| 10 min | low / medium / high | 0.12–0.40M / 0.04–0.14M | 0.31 / 0.50 / 0.92 | 0.49 / 0.84 / 1.66 | 2.68 / 4.81 / 10.37 |
| 30 min | low / medium / high | 0.36–1.2M / 0.11–0.41M | 0.52 / 0.90 / 1.76 | 1.07 / 1.91 / 3.98 | 7.63 / 13.83 / 30.11 |
| 60 min | low / medium / high | 0.72–2.4M / 0.23–0.81M | 0.84 / 1.51 / 3.02 | 1.93 / 3.51 / 7.47 | 15.06 / 27.36 / 59.72 |
| 300 min | low / medium / high | 3.6–12M / 1.1–4.1M | 3.38 / 6.33 / 13.11 | 8.87 / 16.36 / 35.33 | 74.51 / 135.60 / 296.60 |

Calculation: input × (1 − cached share) × input price, plus input × cached
share × cached price, plus output × (1 + reasoning multiple) × output price,
plus searches × $0.01.

Mixed routing example, 60 minutes, medium:
- research extraction on Luna: 40% of input, 20% of output
- writing on Terra: 40% of input, 60% of output
- critic on Astra: 20% of input, 20% of output
- searches: 90

Total about **$7.80**.

Hidden or indirect costs and limits not in the table:
- retries and repairs after invalid JSON
- replies cut off at `max_output_tokens`, billed with no usable text
- the 2x/1.5x surcharge if a request ever exceeds 272k input
- vector-store storage left undeleted
- 10% for data-residency endpoints
- rate limits on low usage tiers slowing long runs
- the one-year expiry of prepaid credit
- currency conversion and card fees for a Bangladeshi card (UNVERIFIED)

## 5. Privacy, security and regional access

| Topic | Finding | Label | Source |
|---|---|---|---|
| Training | API data is not used to train or improve models unless the organization opts in | VERIFIED | [Data controls](https://developers.openai.com/api/docs/guides/your-data) |
| Abuse-monitoring logs | kept up to 30 days by default, longer if the law requires or to prevent harm | VERIFIED | same |
| Responses API stored state | 30 days by default, or when `store=true`; background responses kept only if `store=true` | PARTIALLY VERIFIED (two cached versions of the page differ) | same, [Background mode](https://developers.openai.com/api/docs/guides/background) |
| Zero Data Retention | not self-serve: requires OpenAI's approval and extra terms; `store` is then always treated as false; files, vector stores, conversations and fine-tuning are not ZDR-eligible | VERIFIED | [Data controls](https://developers.openai.com/api/docs/guides/your-data), [Enterprise privacy](https://openai.com/enterprise-privacy/) |
| Supported countries | Bangladesh is on the API supported list; using the API from an unsupported location can lead to suspension | PARTIALLY VERIFIED (the excerpt is about 700 days old; the developer-docs page excerpt was cut before "B") | [Supported countries](https://developers.openai.com/api/docs/supported-countries), [help article](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories) |
| Payment from Bangladesh | whether a Bangladeshi card is accepted for prepaid credits | UNVERIFIED | owner must test |
| Where requests come from | the studio runs on Cloudflare and our cloud sessions run elsewhere; the terms tie use to supported locations, and how they apply to server locations was not confirmed | UNVERIFIED | [Business terms](https://openai.com/policies/may-2025-business-terms/) |

**Sending our material:**
- Research records and draft scripts on public topics carry low sensitivity.
- The 73 KB production manual is the owner's own work. Under the default API
  terms it is not used for training, but it sits in abuse logs for up to 30
  days.
- Requests are sent with `store=false`, and file search and vector stores
  are not used for the manual.

Whether this is acceptable is the owner's decision. The same question
applies, with weaker protection still to be verified, to the Gemini free
tier.

**Key management (when, and only if, approved):**
- One OpenAI project for this engine, with its own key, a hard spend limit
  and prepaid credit with auto-recharge off.
- The key is a network secret injected by the proxy (the same method as
  Appendix C of the Master Plan, header `Authorization: Bearer`), never in
  the repository, chat or logs.
- Rotate the key after experiments.

## 6. Research and factual verification with OpenAI tools

What the tools can do:
- Web search finds candidate sources and returns `url_citation` annotations
  (url, title, positions) that can be stored per sentence. VERIFIED.
- File search can query documents we upload, with file citations. VERIFIED.

What they cannot prove:
- That a cited page says what the reply claims.
- That the page is a primary source.
- That a number is current.
- That a quote is verbatim.

A citation is the model's choice of evidence, not a check. Search content
tokens also cost money.

How our system must verify (provider-independent; extends what
`source-check.mjs` already does):
1. Treat every model citation as a lead.
2. Fetch the page ourselves.
3. Store the readable text with its hash and the date.
4. Require each evidence quote to be an exact substring of that text.
5. Check numbers, dates and names in code.
6. Have a critic from another vendor judge whether each script sentence is
   supported by its evidence (entailment).
7. Mark anything we could not fetch as unverified, never as verified.

## 7. Independent evaluation: OpenAI as critic of a Gemini or local writer

What it provides:
- A different model family and vendor, with different training and
  different blind spots, so the writer's own errors are less likely to be
  repeated.
- This meets the Master Plan's independence level 2.

What it does not provide:
- Human judgement or audience evidence.
- Independence from biases the providers share. Large models are trained on
  overlapping web text and often prefer similar styles; agreement between
  two models is not truth.

Safeguards:
1. Always label it "AI evaluation (vendor, model id)".
2. Never average it with human scores.
3. Measure each critic on the seeded-defect set (recall and false-positive
   rate) before trusting it.
4. Require quoted passages for every score.
5. Prefer pairwise comparison.
6. Track agreement with the two human readers over time.
7. Rotate critics, and do not let one vendor both write and judge the
   release.

## 8. Provider comparison

Evidence for writing quality, storytelling and retention: **none of the
three is established for our task.** Public benchmarks do not measure US
documentary narration. Our three-topic evaluation is the only test that
will.

| Criterion | OpenAI API | Gemini API | Local / open-source |
|---|---|---|---|
| Documentary writing quality | Not established | Not established | Not established; expected weaker below the 30B class (to be measured) |
| Long-context reliability | 1.05M window, 128k output (VERIFIED limits; reliability Not established) | Gemini 4 Argon: 1,048,576 window shared by input, thinking and output, 65,536 default output; Gemini 3.x: 1M and 64k (VERIFIED limits); reliability Not established | limited by hardware: 32k–128k typical; depends on memory |
| Research and evidence | web search with URL citations; file search (VERIFIED) | Google Search grounding (VERIFIED that it exists; our adapter ignores its metadata) | none built in; our research desk |
| Reasoning and fact-check support | reasoning models; reasoning tokens billed as output (VERIFIED) | thinking models; thinking shares the window (VERIFIED for Gemini 4 Argon) | varies by model; Not established |
| Creative storytelling and retention | Not established | Not established | Not established |
| Cost | paid; Luna to Astra spans about 50x (VERIFIED prices) | free tier for some models (e.g. Gemini 3 Flash preview), with limits; paid examples: Gemini 3.8 Flash $0.75/$3.75 introductory, Gemini 4 Argon $2/$10 until 30 Nov 2026 then $4/$20, not on the free tier (VERIFIED excerpts; free-tier details conflict between pages: PARTIALLY) | no per-token cost; hardware and electricity |
| Privacy and control | no training by default; 30-day abuse logs; ZDR by approval (VERIFIED) | free-tier data use not yet verified (UNVERIFIED) | full control |
| Reliability and scale | tiered rate limits; frequent deprecations (VERIFIED) | free-tier quotas low and changing (PARTIALLY); models also churn (Gemini 3 Pro preview shut down) | as reliable as the owner's machine; slow |
| Vendor lock-in | low if used only through our adapter | the same | none |
| 10 min to multi-hour | feasible chapter by chapter; Not established in practice | the same | 10–60 min plausible on 24 GB+ hardware; multi-hour slow; Not established |

Gemini sources: [Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon), [What's new in Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/latest-model), [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8), [Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3), [Models](https://ai.google.dev/gemini-api/docs/models), [Tokens](https://ai.google.dev/gemini-api/docs/tokens), [Pricing](https://ai.google.dev/gemini-api/docs/pricing).

**Consequence for the Gemini baseline:** our adapter's default
`gemini-2.5-flash` was not visible on the current models page excerpts.
Phase 0 model selection must confirm it still exists on the free tier, or
choose a current free model (for example Gemini 3 Flash preview, if it is
still free). PARTIALLY VERIFIED.

## 9. Recommended provider-independent architecture

The Master Plan's design already fits. OpenAI adds requirements, not a new
centre.

1. **One adapter per provider behind the `Model` interface**
   (`worker/brain.mjs`). Each adapter reports measured limits, token
   counting, usage including reasoning, cost per request, citation output,
   and its own errors mapped to retry or stop.
2. **Capability routing (B4).** Tasks ask for capabilities, not vendors:
   search, JSON reliability, en-US writing score, critic recall, window,
   price ceiling. Routing uses the measured brain profiles (M2).
3. **Cross-vendor critic rule.** The release review uses a brain from a
   different vendor than the writer when one is configured; otherwise the
   review is disclosed as self-review.
4. **Budget ledger in our code** (section 3.3), shared by all paid adapters.
5. **Provider citations are leads**; verification stays in our code
   (section 6).
6. **Lifecycle guard.** Model ids live in configuration with their
   deprecation dates. Startup checks the provider's model list. A shut-down
   model fails preflight, not mid-run.

## 10. Opportunities that could differentiate Bossism

| Opportunity | Exists in APIs today | We must build | Promising, unproven |
|---|---|---|---|
| Evidence-linked writing: every sentence tied to a fetched, hashed, verified quote | citations (OpenAI, Gemini) | span verification, sentence tags, gates (Master Plan C1–C5) | — |
| Cross-vendor review with measured critic accuracy | models from several vendors | seeded-defect calibration, independence labels | whether disagreement between critics predicts real defects |
| Capability-based routing by measured profiles | model lists, usage reporting | qualification suite, assigner | — |
| Hard, transparent cost control per run | usage reporting, prepaid, project limits | pre-request reservation, kill switch, price table | — |
| Adaptive research depth (stop when questions are answered) | search tools | question coverage, completion gate | the right stopping thresholds per genre |
| Chapter memory for multi-hour films | large windows, compaction | dossier and story memory, context packs | whether compaction helps over our explicit memory |
| Cheap bulk work in the background | Batch and Flex at 50% | job routing of non-urgent stages | — |
| Measurable creative quality | — | rubric, blind human scoring, pairwise | whether AI critic scores track human scores and later YouTube retention |

Not recommended now: fine-tuning, vector stores for the manual, or
agent-framework products. Each adds cost, retention or lock-in before the
basics are measured.

## 11. Unresolved questions that need real tests

1. US documentary writing quality of each candidate (Gemini free model,
   GPT-6.1 Terra or 5.6 Luna, a local 30B-class model), on the three
   baseline topics, scored blind by the two readers.
2. Critic accuracy of an OpenAI model on our seeded-defect set: recall and
   false positives, compared with a Gemini critic and with the humans.
3. Real token use per film minute, including reasoning tokens. This replaces
   the assumptions in section 4.
4. Whether a cut-off reasoning reply occurs with our chapter sizes, and the
   `max_output_tokens` reserve needed.
5. Whether web-search citations survive our page fetch and quote check, and
   what share are primary sources.
6. How quickly a project hard spend limit and an exhausted prepaid balance
   stop requests, measured with a $5 balance.
7. Whether a Bangladeshi card can buy credit, and whether the live
   supported-countries page still lists Bangladesh.
8. The live official pages for every figure here, re-read with the OpenAI
   and Google docs hosts reachable.
9. Whether the existing OpenAI-compatible path in `local-brain.mjs` works
   against the OpenAI API (a free check of `models` only, no generation).

## 12. Recommendation and what to test before any adoption decision

Do **not** adopt OpenAI yet, and never as a required dependency. Order:

1. Finish the approved Gemini free-tier baseline (Master Plan section 21).
2. If the owner approves a small paid test: one OpenAI project, prepaid $5,
   auto-recharge off, a project hard limit of $5, the key as a proxy-injected
   secret, our own per-run cap of $1.
   - Test A: the OpenAI model as **critic only** on the three baseline
     scripts and the seeded-defect set. Expected cost under $1 on Terra or
     Luna (estimate).
   - Test B: only if A is useful, one 10-minute script written by an OpenAI
     model on one topic, scored blind against the Gemini script.
3. Decide from measured results: critic recall, human scores, real cost per
   minute, failures. Not from this desk study.

Stopped here; waiting for the owner's approval.

---

## Sources

OpenAI:
- [Models](https://developers.openai.com/api/docs/models)
- [Compare models](https://developers.openai.com/api/docs/models/compare)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra)
- [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna)
- [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol)
- [GPT-5.6 Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra)
- [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna)
- [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5)
- [GPT-5.4](https://developers.openai.com/api/docs/models/gpt-5.4)
- [chat-latest](https://developers.openai.com/api/docs/models/chat-latest)
- [Pricing](https://developers.openai.com/api/docs/pricing)
- [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
- [Web search](https://developers.openai.com/api/docs/guides/tools-web-search)
- [File search](https://developers.openai.com/api/docs/guides/tools-file-search.md)
- [Retrieval](https://developers.openai.com/api/docs/guides/retrieval)
- [Responses overview](https://developers.openai.com/api/reference/responses/overview)
- [Create a response](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Compact](https://developers.openai.com/api/reference/resources/responses/methods/compact)
- [Background mode](https://developers.openai.com/api/docs/guides/background)
- [Deprecations](https://developers.openai.com/api/docs/deprecations)
- [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)
- [Data controls](https://developers.openai.com/api/docs/guides/your-data)
- [Enterprise privacy](https://openai.com/enterprise-privacy/)
- [Supported countries](https://developers.openai.com/api/docs/supported-countries)
- [Supported countries (help)](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories)
- [Business terms](https://openai.com/policies/may-2025-business-terms/)
- [API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
- [API credits (help)](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)
- [Prepaid billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing)

Google:
- [Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon)
- [Latest model](https://ai.google.dev/gemini-api/docs/latest-model)
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8)
- [Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Models](https://ai.google.dev/gemini-api/docs/models)
- [Tokens](https://ai.google.dev/gemini-api/docs/tokens)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
