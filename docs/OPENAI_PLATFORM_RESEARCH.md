# OpenAI Platform for the Bossism Documentary Engine: research study

Research date: 12 Nov 2026. **Version 2** (same day): corrected labels, deprecation scope,
retention controls, Bangladesh evidence, cost model rebuilt per stage, script vs
video costs separated, and Part B (review against the long-term vision). Research only: no code, settings, keys,
environments or the Master Plan were changed; no API call to OpenAI was made.

## 0. How the evidence was gathered (read this first)

- The OpenAI hosts (`developers.openai.com`, `platform.openai.com`,
  `openai.com`, `api.openai.com`) and `ai.google.dev` **do not answer from this
  cloud environment** (checked with curl). The pages could not be opened
  directly.
- Evidence therefore comes from a web search restricted to official OpenAI
  and Google domains, which returns excerpts of the official pages. Excerpts
  can be cached or out of date; several came with age warnings.
- Labels used here (corrected in v2):
  - **VERIFIED**: the official page itself was opened and read. **No claim
    in this report reaches this level**, because no page could be opened.
  - **PARTIALLY VERIFIED**: an excerpt of an official page, returned by the
    search engine, supports it. The page itself was not inspected; the
    excerpt may be cached, old, or conflict with another excerpt (noted where
    it does).
  - **UNVERIFIED**: no official evidence found, or only community posts.
- v1 of this report labelled excerpt-supported claims "VERIFIED". That was
  wrong, and v2 corrects every one of them.
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
5. **Data handling is better than a free tier, but not private.** API data
   is not used for training by default.
   - It is kept up to 30 days in abuse-monitoring logs.
   - Responses are stored by default; `store=false` stops that, but **does
     not** remove the abuse logs.
   - Zero Data Retention needs OpenAI's approval (B4).
6. **Cost is moderate but real.** It depends mostly on the model:
   - **Script generation only**, 60 minutes, medium usage, including
     repairs, one revision round and a critic (section 4): about **$1.90 on
     `gpt-5.6-luna`**, **$5.30 on `gpt-6.1-terra`**, **$45 on
     `gpt-6-astra`**.
   - Mixed routing about **$8.50**.
   - These are text costs, not the cost of a finished video (4.4).
   - A spend limit set in OpenAI's dashboard is not enough on its own; our
     own code must enforce the cap before each request.
7. **Model churn is high.** Specific older snapshots are retired on
   announced dates; for example `gpt-5`, `gpt-5-mini`, `gpt-5-nano`,
   `gpt-5-pro`, `o3` and `o3-pro` on 11 Dec 2026, each with a named
   replacement (B3). Newer GPT-5.x models are not in that notice. The adapter
   must treat model ids as configuration, checked at startup.
8. **Bangladesh** appears in the excerpt of the developer-docs
   supported-countries page (not inspected). API access is one question;
   whether a Bangladeshi card can pay is a separate, untested one.

**Recommendation in one line:** do not adopt OpenAI now. First run the
Gemini free-tier baseline. Then run one small, capped test with an OpenAI
model as the **critic only** (section 9), on the same three scripts, and
compare it with the human readers.

## 2. OpenAI API: capabilities and limitations

| Area | Finding | Label | Source |
|---|---|---|---|
| Current models | GPT-6 Astra ("most capable"), GPT-6.1 Terra, GPT-6.1 Sol, GPT-6 Luna, the GPT-5.6 family (Sol, Terra, Luna), GPT-5.5, GPT-5.4 and Pro, `chat-latest` | PARTIALLY VERIFIED (model pages) | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Models](https://developers.openai.com/api/docs/models) |
| Context and output | `gpt-5.6-luna`: 922,000 max input inside a 1,050,000 window (v2); 1,050,000 context and 128,000 max output for GPT-6 Astra, GPT-6.1 Terra, the GPT-5.6 family and GPT-5.4; `chat-latest` 400,000 / 128,000 | PARTIALLY VERIFIED | model pages above, [GPT-5.6 Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [chat-latest](https://developers.openai.com/api/docs/models/chat-latest) |
| Knowledge cutoffs | GPT-6 Astra 30 Apr 2026, GPT-6.1 Terra 1 Jun 2026, GPT-5.6 family 16 Feb 2026 | PARTIALLY VERIFIED | model pages |
| Long-prompt pricing | prompts over 272k input tokens are charged 2x input and cache rates and 1.5x output for the whole request | PARTIALLY VERIFIED | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-5.5](https://developers.openai.com/api/docs/models/gpt-5.5) |
| Reasoning tokens | invisible, use context space, **billed as output tokens**, counted inside `max_output_tokens`; when the cap is reached the reply is incomplete and may contain no visible text but is still billed; OpenAI suggests reserving at least 25,000 tokens at first; counts reported in `output_tokens_details` | PARTIALLY VERIFIED | [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) |
| Responses API | the main interface; tools, background mode, conversation compaction | PARTIALLY VERIFIED (that they exist) | [Responses overview](https://developers.openai.com/api/reference/responses/overview), [Background mode](https://developers.openai.com/api/docs/guides/background), [Compact](https://developers.openai.com/api/reference/resources/responses/methods/compact) |
| Responses, Chat Completions, Batch: priced the same per token | yes | PARTIALLY VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Structured outputs (JSON Schema) | a JSON Schema response format exists; how strict it is was not confirmed | PARTIALLY VERIFIED | [Create a response](https://developers.openai.com/api/reference/resources/responses/methods/create) |
| Web search tool | $10 per 1,000 calls plus the retrieved "search content tokens" billed at model rates; a preview variant for non-reasoning models costs $25 per 1,000 calls with free content tokens | PARTIALLY VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Citations | `url_citation` annotations: url, title, start and end positions in the reply text | PARTIALLY VERIFIED (the guide excerpt was about 600 days old; the API reference agrees) | [Web search guide](https://developers.openai.com/api/docs/guides/tools-web-search), [Create a response](https://developers.openai.com/api/reference/resources/responses/methods/create) |
| Domain filters for web search (e.g. only official sites) | not found in this research | UNVERIFIED | — |
| File search (vector stores) | $0.10 per GB per day after the first free GB; $2.50 per 1,000 tool calls (Responses API); `file_citation` annotations | PARTIALLY VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing), [Retrieval](https://developers.openai.com/api/docs/guides/retrieval), [File search](https://developers.openai.com/api/docs/guides/tools-file-search.md) |
| Batch and Flex | 50% of Standard prices; "Fast" mode at 2x | PARTIALLY VERIFIED (model pages) | [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) |
| Batch completion window | not confirmed in this research | UNVERIFIED | — |
| Cached input | about 5–10% of the input price, depending on the model | PARTIALLY VERIFIED (per-model prices) | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Data-residency endpoints | 10% uplift for models released on or after 5 Mar 2026 | PARTIALLY VERIFIED | [Pricing](https://developers.openai.com/api/docs/pricing) |
| Lifecycle | Assistants API shut down 26 Aug 2026; o1, o4-mini, gpt-4-turbo shut down 23 Oct 2026; specific older snapshots (`gpt-5`, `gpt-5-2025-08-07`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `o3`, `o3-pro`) shut down 11 Dec 2026, each mapped to a named `gpt-5.6-*` replacement (B3); `v1/prompts` shuts down 30 Nov 2026 | PARTIALLY VERIFIED (deprecations page; some excerpts carry stale dates) | [Deprecations](https://developers.openai.com/api/docs/deprecations) |
| Rate limits | per organization and per project, rising with usage tier; reaching a tier does not unlock every model | PARTIALLY VERIFIED | [Rate limits](https://developers.openai.com/api/docs/guides/rate-limits) |
| Writing quality for US documentary narration | not established by any official source; marketing claims are not evidence | UNVERIFIED | needs our own test (section 9) |
| Long-document consistency across 1M tokens | not established for our task | UNVERIFIED | needs our own test |

Weaknesses that matter to us:

- Reasoning tokens make cost and output size unpredictable unless the code
  caps `max_output_tokens` and reserves room for them.
- A reply can be cut off with no visible text and still be billed.
- Model ids change quickly: many specific snapshots and some APIs are retired on announced dates.
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
| GPT-6 Astra | 10.00 | 1.00 | 50.00 | PARTIALLY VERIFIED |
| GPT-6.1 Sol | 2.00 | 0.10 | 10.00 | PARTIALLY VERIFIED (a "cache writes $2.50" figure in one excerpt is unclear: PARTIALLY) |
| GPT-6.1 Terra | 1.00 | 0.05 | 5.00 | PARTIALLY VERIFIED |
| GPT-5.6 Terra | 2.00 | — | 12.00 | PARTIALLY VERIFIED |
| GPT-5.6 Luna | 0.20 | 0.02 | 1.20 | PARTIALLY VERIFIED |
| GPT-6 Luna | 0.10 | 0.01 | 0.50 | PARTIALLY VERIFIED |
| GPT-5.5 | 5.00 | 0.50 | 30.00 | PARTIALLY VERIFIED |

Tools: web search $10 per 1,000 calls plus content tokens; file search
$2.50 per 1,000 calls plus storage. Reasoning tokens are billed as output.
Sources: [Pricing](https://developers.openai.com/api/docs/pricing) and the
model pages linked in section 2.

### 3.2 Is there a free API?

| Claim | Finding | Label |
|---|---|---|
| A "Free" usage tier exists | the rate-limit guide lists Free ($100 a month usage limit, allowed geography only), Build ($5 purchased), Launch ($100), Grow ($500) | PARTIALLY VERIFIED ([Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)) |
| The Free tier gives free usage | whether it includes any free credits or only caps spending is **not established** | UNVERIFIED |
| ChatGPT subscription = API access | **no**. Only ChatGPT Pro and eligible Business plans include API credits, up to $500 a month, expiring each billing cycle, same email for both accounts; Plus and trials do not qualify | PARTIALLY VERIFIED ([API credits for ChatGPT subscribers](https://developers.openai.com/api/docs/guides/chatgpt-api-credits), [help article](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)) |
| Free tokens for sharing data | no official evidence found | UNVERIFIED |

Conclusion: plan for paid prepaid credits (minimum $5 purchase). Credits
expire after one year and are not refundable ([prepaid billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing)).
PARTIALLY VERIFIED.

### 3.3 Spend control: what the provider gives, and what we must build

| Control | What it does | Is it a hard cap? |
|---|---|---|
| Prepaid balance, auto-recharge off | when credit runs out, requests fail with 429 `credit_balance_exhausted` | the closest thing to a hard cap. A small overrun beyond the balance is UNVERIFIED |
| Project hard spend limit | affected requests return 429 | PARTIALLY VERIFIED as described ([Rate limits](https://developers.openai.com/api/docs/guides/rate-limits)); how quickly it reacts is UNVERIFIED |
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

## 4. Documentary cost model (estimates, not measurements; revised in v2)

**Scope: script generation only.** These are the text-model costs of
producing the research, the script and its reviews. They are **not** the cost
of a finished documentary video; production costs are listed separately in
4.4.

### 4.1 Assumptions, stage by stage (current engine design)

The token sizes come from the only real production in the repository
(`productions/ramesh-babu/USA`, 45 minutes, written by a strong model by
hand from the manual): its stage files total about 569 KB. At 4 characters
per token that is:

| Stage file | Size (45 min) | Output used in the model |
|---|---|---|
| s01 | 34 KB | about 8.5k tokens, fixed |
| s2 | 49 KB | 270 tokens per minute, at least 4k |
| s3 | 56 KB | 310 tokens per minute, at least 4k |
| s4 | 51 KB | 280 tokens per minute, at least 4k |
| s5 | 358 KB | 2,000 tokens per minute |
| qa.json | 6 KB | 1.6k plus 30 tokens per minute |

Input per request follows `film-run.mjs`:
- **Every call except the viewer panel** sends the 73 KB manual plus the
  brief (about 20k tokens). This part is cached after the first call.
- **Each S5 chapter call** also sends S2 and S4 (cached after the first
  chapter).
- **QA** reads S2 plus the whole script.
- **Research** includes the search content: number of searches × tokens per
  search.
- **Chapters:** `round(minutes / 7.5)`, as the engine plans them.

Scenario parameters (assumed; Phase 0 must measure them):

| Parameter | Low | Medium | High |
|---|---|---|---|
| Web searches | 20 + 0.5 per minute | 30 + 1 per minute | 50 + 2 per minute |
| Search content per search | 2k tokens | 3k tokens | 5k tokens |
| Output size vs the reference production | 0.8x | 1.0x | 1.3x |
| Reasoning tokens (billed as output) | 0.5x visible output | 1x | 2x |
| Repairs and retries (S3 and S5 repeated) | 10% | 25% | 60% |
| Bossism revision rounds | 0 | 1 (one chapter + QA + viewer) | 2 (30% of chapters + QA + viewer each) |
| Separate critic passes (Master Plan design) | 0 | 1 per chapter | 2 per chapter |

Rates (Standard tier, USD per 1M tokens, from official excerpts):
- `gpt-5.6-luna`: 0.20 input / 0.02 cached / 1.20 output
- `gpt-6.1-terra`: 1.00 / 0.05 / 5.00
- `gpt-6-astra`: 10.00 / 1.00 / 50.00
- web search $10 per 1,000 calls, with its content tokens billed as input.

A request with more than 272k input tokens is charged 2x input and 1.5x
output; the model applies it per request. Batch and Flex (half price) are
not assumed.

### 4.2 Results (USD per script, one model doing every stage)

| Minutes | Scenario | Requests (before continuations) | Input tokens | Output incl. reasoning | Searches (cost) | Requests over 272k | `gpt-5.6-luna` | `gpt-6.1-terra` | `gpt-6-astra` |
|---|---|---|---|---|---|---|---|---|---|
| 10 | low | 12 | 0.33M | 0.08M | 25 ($0.25) | 0 | $0.39 | $0.85 | $6.29 |
| 10 | medium | 16 | 0.54M | 0.20M | 40 ($0.40) | 0 | $0.71 | $1.72 | $13.71 |
| 10 | high | 20 | 0.92M | 0.39M | 70 ($0.70) | 1 | $1.42 | $3.88 | $32.68 |
| 30 | low | 18 | 0.53M | 0.16M | 35 ($0.35) | 0 | $0.60 | $1.41 | $11.09 |
| 30 | medium | 28 | 0.96M | 0.34M | 60 ($0.60) | 0 | $1.13 | $2.90 | $23.78 |
| 30 | high | 38 | 1.84M | 0.86M | 110 ($1.10) | 1 | $2.57 | $7.51 | $65.43 |
| 60 | low | 26 | 0.91M | 0.28M | 50 ($0.50) | 0 | $0.92 | $2.30 | $18.75 |
| 60 | medium | 44 | 1.77M | 0.58M | 90 ($0.90) | 1 | $1.90 | $5.26 | $44.91 |
| 60 | high | 62 | 3.66M | 1.59M | 170 ($1.70) | 1 | $4.34 | $13.19 | $117.27 |
| 300 | low | 90 | 8.17M | 1.22M | 170 ($1.70) | 2 | $3.83 | $10.74 | $95.45 |
| 300 | medium | 172 | 16.52M | 2.49M | 330 ($3.30) | 3 | $8.44 | $25.97 | $234.84 |
| 300 | high | 254 | 37.88M | 7.37M | 650 ($6.50) | 4 | $20.59 | $68.35 | $635.40 |

Worked example, 60 minutes, medium, `gpt-6.1-terra` ($5.26):

| Part | Input | Of which cached | Output incl. reasoning | Cost |
|---|---|---|---|---|
| s01 | 22k | 0 | 17k | $0.11 |
| research (90 searches inside) | 300k | 20k | 48k | $0.92 (over 272k: surcharged) |
| s2 / s3 / s4 | 52k / 45k / 55k | 20k each | 32k / 37k / 34k | $0.61 |
| s5, 8 chapters | 448k | 391k | 240k | $1.28 |
| qa / viewer / s6 / s7 | 158k / 4k / 28k / 32k | — | 7k / 4k / 4k / 5k | $0.26 |
| repairs (25%) | 123k | 103k | 69k | $0.37 |
| one revision round | 218k | 69k | 41k | $0.36 |
| critic, 1 pass per chapter | 282k | 28k | 40k | $0.46 |
| web search calls | 90 calls | | | $0.90 |

Findings from the corrected model:

- **The v1 figures were too low**, by about 1.5x for the medium 60-minute
  case: they left out repairs, the revision round, the critic and the
  surcharge.
- **Reasoning tokens are the largest unknown.** Going from 1x to 2x changes
  output cost by about half.
- **Two design flaws show up in the numbers:**
  - The current engine sends the whole film to QA in one request when the
    window allows it. With 1M-token windows a 300-minute QA request is about
    700k tokens and is surcharged.
  - A search-heavy research request crosses 272k at 60 minutes.

  Both disappear with the Master Plan's chapter packs and split research.
- **Mixed routing**, 60 minutes, medium, computed stage by stage: research
  and s2 on `gpt-5.6-luna`, critic passes on `gpt-6-astra`, everything else
  on `gpt-6.1-terra`: **$8.50**. The v1 figure of $7.80 left out repairs,
  the revision round and the surcharge.

Not included: continuation calls after `MAX_TOKENS`, replies cut off and
billed with no visible text, failed requests, Batch or Flex discounts,
vector-store storage, and the 10% data-residency uplift.

### 4.3 Costs that the provider price does not show

- Rate limits on low usage tiers can stretch a long run over hours or days.
- Prepaid credit expires after one year.
- Currency conversion and card fees for a Bangladeshi card (UNVERIFIED).

### 4.4 Full documentary production costs (separate from the script)

No figures are given here, because none have been measured. The categories
an honest budget must cover:

| Item | Today in this project | Paid? |
|---|---|---|
| Narration | ElevenLabs (paid for commercial use), or the owner's own recording; open-source TTS planned | depends on choice |
| Stock footage and archives | Pexels, Pixabay (free keys), public archives | free, limited by quotas and licences |
| Music and effects | composed by `music-kit.mjs`; CC0 effects | free |
| Rendering | ffmpeg on the owner's machine or a CI runner | compute time; free tiers have limits (UNVERIFIED) |
| Storage and hosting | Cloudflare Worker, R2 | free tiers have limits (UNVERIFIED) |
| YouTube data | YouTube Data API key | free, quota-limited |
| Human review | Reader 2 | the reader's time |

A complex production platform cannot be promised to run completely free in
all circumstances. Computing, storage and the owner's time are real costs
even when no AI provider is paid.

## 5. Privacy, security and regional access

| Topic | Finding | Label | Source |
|---|---|---|---|
| Training | API data is not used to train or improve models unless the organization opts in | PARTIALLY VERIFIED | [Data controls](https://developers.openai.com/api/docs/guides/your-data) |
| Abuse-monitoring logs | kept up to 30 days by default, longer if the law requires or to prevent harm | PARTIALLY VERIFIED | same |
| Responses API stored state | 30 days by default, or when `store=true`; background responses kept only if `store=true` | PARTIALLY VERIFIED (two cached versions of the page differ) | same, [Background mode](https://developers.openai.com/api/docs/guides/background) |
| Zero Data Retention | not self-serve: requires OpenAI's approval and extra terms; `store` is then always treated as false; files, vector stores, conversations and fine-tuning are not ZDR-eligible | PARTIALLY VERIFIED | [Data controls](https://developers.openai.com/api/docs/guides/your-data), [Enterprise privacy](https://openai.com/enterprise-privacy/) |
| Supported countries | Bangladesh is on the API supported list; using the API from an unsupported location can lead to suspension | PARTIALLY VERIFIED (v2: the developer-docs page excerpt lists Bangladesh; the page was not inspected) | [Supported countries](https://developers.openai.com/api/docs/supported-countries), [help article](https://help.openai.com/en/articles/5347006-openai-api-supported-countries-and-territories) |
| Payment from Bangladesh | whether a Bangladeshi card is accepted for prepaid credits | UNVERIFIED | owner must test |
| Where requests come from | the studio runs on Cloudflare and our cloud sessions run elsewhere; the terms tie use to supported locations, and how they apply to server locations was not confirmed | UNVERIFIED | [Business terms](https://openai.com/policies/may-2025-business-terms/) |

**Sending our material:**
- Research records and draft scripts on public topics carry low sensitivity.
- The 73 KB production manual is the owner's own work. Under the default API
  terms it is not used for training, but it sits in abuse logs for up to 30
  days.
- Proposed, if OpenAI is ever used: requests with `store=false` (no stored
  response object), and no file search or vector stores for the manual.
  `store=false` **does not** stop the up-to-30-day abuse-monitoring logs, and
  it is not ZDR (B4).

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
  (url, title, positions) that can be stored per sentence. PARTIALLY VERIFIED.
- File search can query documents we upload, with file citations. PARTIALLY VERIFIED.

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
| Long-context reliability | 1.05M window, 128k output (PARTIALLY VERIFIED limits; reliability Not established) | Gemini 4 Argon: 1,048,576 window shared by input, thinking and output, 65,536 default output; Gemini 3.x: 1M and 64k (PARTIALLY VERIFIED limits); reliability Not established | limited by hardware: 32k–128k typical; depends on memory |
| Research and evidence | web search with URL citations; file search (PARTIALLY VERIFIED) | Google Search grounding (PARTIALLY VERIFIED that it exists; our adapter ignores its metadata) | none built in; our research desk |
| Reasoning and fact-check support | reasoning models; reasoning tokens billed as output (PARTIALLY VERIFIED) | thinking models; thinking shares the window (PARTIALLY VERIFIED for Gemini 4 Argon) | varies by model; Not established |
| Creative storytelling and retention | Not established | Not established | Not established |
| Cost | paid; Luna to Astra spans about 50x (PARTIALLY VERIFIED prices) | free tier for some models (e.g. Gemini 3 Flash preview), with limits; paid examples: Gemini 3.8 Flash $0.75/$3.75 introductory, Gemini 4 Argon $2/$10 until 30 Nov 2026 then $4/$20, not on the free tier (PARTIALLY VERIFIED excerpts; free-tier details conflict between pages: PARTIALLY) | no per-token cost; hardware and electricity |
| Privacy and control | no training by default; 30-day abuse logs; ZDR by approval (PARTIALLY VERIFIED) | free-tier data use not yet verified (UNVERIFIED) | full control |
| Reliability and scale | tiered rate limits; frequent deprecations (PARTIALLY VERIFIED) | free-tier quotas low and changing (PARTIALLY); models also churn (Gemini 3 Pro preview shut down) | as reliable as the owner's machine; slow |
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

The v2 review revises the conditions for this test: see B12.

---

# Part B: post-research review against the long-term vision (v2, 12 Nov 2026)

## B1. Access limitation for this review

The nine official pages the owner listed were requested again with the
page fetcher. **None opened**: `developers.openai.com` does not resolve from
this environment (`getaddrinfo ENOTFOUND`), and curl gets no answer. No page
was directly inspected.

Every OpenAI fact in this report comes from **excerpts of official pages
returned by a domain-restricted web search**. That is why v2 no longer
labels any of them VERIFIED (see section 0). To reach VERIFIED, the pages
must be read with `developers.openai.com` reachable, which is an environment
change the owner has not authorised.

## B2. Critical assessment of v1

| # | Weakness in v1 | Effect | Fixed in v2 |
|---|---|---|---|
| 1 | Search excerpts were labelled PARTIALLY VERIFIED | overstated certainty | all excerpt-based claims are now PARTIALLY VERIFIED; the definitions in section 0 changed |
| 2 | Cost model per film minute, no stage structure; repairs, revision rounds, critic passes and the 272k surcharge left out | about 1.5x too low for 60 minutes, medium | section 4 rebuilt stage by stage from the engine's real stages |
| 3 | Script cost not clearly separated from video production cost | could be read as the cost of a film | section 4.4 added |
| 4 | "GPT-5 and o3 family shuts down", "three model families shut down" | overstated | the excerpt names specific snapshots and their replacements (B3) |
| 5 | `store=false` mentioned as if it limited retention | misleading | retention table in B4 |
| 6 | Bangladesh rested on a help article about 700 days old | weak evidence | the developer-docs excerpt now lists Bangladesh; payment is a separate question (B3) |
| 7 | Maximum input below the context window not reported | wrong token budgets | `gpt-5.6-luna`: 922,000 max input inside the 1,050,000 window (B3) |
| 8 | Evaluated OpenAI only against today's script engine | missed the platform vision | B6–B10 added |

## B3. Factual corrections (old → new)

| Topic | v1 said | v2 says | Label | Source |
|---|---|---|---|---|
| Deprecation scope | the GPT-5 and o3 family shuts down on 11 Dec 2026 | **specific older snapshots** shut down on 11 Dec 2026. Each maps to a named replacement: `gpt-5` and `gpt-5-2025-08-07` → `gpt-5.6-sol`; `gpt-5-mini` → `gpt-5.6-terra`; `gpt-5-nano` → `gpt-5.6-luna`; `gpt-5-pro` and `o3-pro` → `gpt-5.6-sol` with pro reasoning; `o3` snapshots → `gpt-5.6-sol`. Developers were notified on 11 Jun 2026. Newer GPT-5.x models (5.4, 5.5, 5.6) are not in this notice. Some model pages recommend `gpt-6-astra` instead, so the mapping is inconsistent across pages | PARTIALLY VERIFIED | [Deprecations](https://developers.openai.com/api/docs/deprecations), [GPT-5](https://developers.openai.com/api/docs/models/gpt-5) |
| Churn | "three model families shut down in 2026" | many specific snapshots and some APIs (Assistants, `v1/prompts`) are retired on announced dates; families continue through newer snapshots | PARTIALLY VERIFIED | same |
| `gpt-5.6-luna` limits | 1.05M context, 128k output | the only listed snapshot is `gpt-5.6-luna`; 1,050,000 context, **922,000 max input**, 128,000 max output; text and image in, text out; cutoff 16 Feb 2026. The changelog says its price fell 80% from 30 Jul; Batch prices 0.10 / 0.01 / 0.60 | PARTIALLY VERIFIED | [GPT-5.6 Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [Pricing](https://developers.openai.com/api/docs/pricing) |
| Bangladesh | on the list, help article about 700 days old | the developer-docs "Supported countries and territories" page excerpt lists Bangladesh; no date shown on the list. Access from outside listed locations may lead to blocking. **This is API access only; whether a Bangladeshi card can buy prepaid credit is a separate, untested question** | PARTIALLY VERIFIED (access); UNVERIFIED (payment) | [Supported countries](https://developers.openai.com/api/docs/supported-countries) |
| Responses retention | 30-day application state | responses are stored by default and `store=false` turns that off; conversation objects are **not** subject to a 30-day TTL. The 30-day figure for stored responses was not confirmed by any excerpt in this review | PARTIALLY VERIFIED | [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state), [Data controls](https://developers.openai.com/api/docs/guides/your-data) |
| Script cost, 60 min, medium | Luna $1.51 / Terra $3.51 / Astra $27.36 | Luna $1.90 / Terra $5.26 / Astra $44.91; mixed routing $8.50 | estimate | section 4 |

Model ids used in this report, all from official excerpts and not
inspected: `gpt-6-astra`, `gpt-6.1-terra`, `gpt-6.1-sol`, `gpt-6-luna`,
`gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4`,
`chat-latest`. Whether each has dated snapshots beyond the alias was
confirmed only for `gpt-5.6-luna` (none).

## B4. Data handling: what each control does and does not do

| Mechanism | What it covers | What it does **not** do | Label |
|---|---|---|---|
| Training policy | API data is not used to train or improve models unless the organization opts in | does not stop retention or abuse review | PARTIALLY VERIFIED |
| Abuse-monitoring logs | generated for API use and kept up to 30 days by default, longer if law or safety requires | not switched off by `store=false` | PARTIALLY VERIFIED |
| Application state (stored responses, conversations) | stored by default so `previous_response_id` and retrieval work; conversation objects have no 30-day TTL | the exact retention of stored responses is not confirmed | PARTIALLY VERIFIED |
| `store=false` | the response object is not stored; history must be resent by us (reasoning returned encrypted to pass back) | **does not remove abuse-monitoring logs and does not enable ZDR** | PARTIALLY VERIFIED |
| Zero Data Retention | by OpenAI's approval only; excludes content from abuse logs; forces `store=false` | not self-serve; files, vector stores, conversations and fine-tuning are not ZDR-eligible | PARTIALLY VERIFIED |
| Files and vector stores | kept until we delete them | not covered by ZDR; storage is billed | PARTIALLY VERIFIED |

Consequence: with `store=false` our manual and scripts still exist in
OpenAI's abuse logs for up to 30 days. Only approved ZDR changes that. If
the owner is not comfortable with that, OpenAI should receive only public
research and finished scripts for critique, never the manual.

## B5. Subscriptions, credits, tiers and free access are four different things

| Thing | What it is | Gives free API use? | Label |
|---|---|---|---|
| ChatGPT subscription (Free, Plus, Pro, Business) | the chat product | no, except the credit benefit below | PARTIALLY VERIFIED |
| API credits benefit | ChatGPT Pro and eligible Business plans receive up to $500 a month of API credits; same email as the API organization; expire each cycle; **Plus and trials do not qualify** | yes, within the credit, only for those plans | PARTIALLY VERIFIED |
| API usage tiers (Free, Build, Launch, Grow) | spending and rate-limit levels that rise with purchased credit; Free has a $100 a month usage limit in allowed locations | **not established**: the tier name "Free" does not prove free tokens | PARTIALLY VERIFIED (tiers); UNVERIFIED (free usage) |
| Prepaid API credit | bought credit, minimum $5, expires after a year, non-refundable | no, it is paid | PARTIALLY VERIFIED |

For this project: **OpenAI API use is paid** unless the owner holds an
eligible Pro or Business plan.

## B6. What the long-term vision requires of Bossism

The ambition ("world number one") is a direction, not a claim. Translated
into requirements that can be measured:

| Requirement | Measurable form |
|---|---|
| Topic + duration + preferences is enough | before any quota or paid call, every run shows a plan: feasibility for the runtime, research risk, chosen capabilities and why, cost estimate and cap; 100% of runs |
| Real supervision, not a fixed pipeline | decisions (plan expansions, routing, revisions, refusals) are recorded with their reasons; failure-injection tests show reassignment and refusal working |
| No padding | claims-per-minute and novelty gates (Master Plan G1, G11) pass at every runtime; human readers flag no chapter as padding |
| Evidence trail for every claim | 100% of factual sentences mapped to verified evidence spans or marked attributed or uncertain (G3, G4) |
| Exceptional storytelling | blind human scores at or above the thresholds (Master Plan section 18), and pairwise wins against the previous engine version |
| Trend intelligence with originality | topic proposals carry demand evidence, an evergreen/spike estimate with uncertainty, a saturation count and an original-angle statement; no title or structure too close to an existing video (B9) |
| Provider independence | each capability has at least two eligible providers, or a free local one, in the registry; switching a provider needs no change outside its adapter |
| Zero mandatory paid AI | a full run completes on free options (local or free tier); paid adapters are off unless the owner enables them per project; **no automatic paid fallback** |
| Adapts for a decade | model ids in configuration with lifecycle checks; prompts versioned; a benchmark run on every release (B10) |
| Transparent cost and performance | per-run ledger of tokens, money, time and failures per provider |

**A benchmark program** turns the ambition into evidence:
- A fixed suite (the "Doc Bench") of topics across genres and runtimes, each
  with a gold fact sheet.
- The rubric and blind human scoring by two readers.
- AI critic scores, labelled as AI evaluation.
- Cost and time per run.
- Run on every engine release; results kept in `docs/evals/`.

Claims about competitors are made only after comparing against them on that
suite, never before.

## B7. What must belong to Bossism, and what can be delegated

| Bossism owns (our code; never delegated) | Delegated to replaceable providers |
|---|---|
| understanding the objective, planning, feasibility, refusal | drafting text: outlines, chapters, rewrites |
| capability registry, measured profiles, routing, fallback rules | extraction from pages (claims, quotes) |
| budgets, reservations, kill switch, price table with dates | critique opinions (always labelled AI evaluation) |
| the dossier: sources, evidence, claims, timeline, story memory | search discovery (web search, grounding) |
| fetching pages, verifying quotes and numbers | embeddings, if ever needed |
| gates, release decision, revision control, decision record | speech, images, video (outside script scope) |
| genre profiles, language profiles, prompt modules as versioned assets | |
| trend signals, scoring, originality checks | summarising audience signals |
| the benchmark, the evaluation harness, regression tests | |

Rule: **a provider produces candidates; Bossism decides.** No provider's
output is accepted without our checks, and no provider's citation is
treated as verification.

## B8. OpenAI, Gemini and local models inside this architecture

Quality for our task is **Not established** for all three. Roles each
could fill, to be confirmed by tests:

| Role | OpenAI (optional, paid) | Gemini (free tier, limited) | Local / open-source (free per token) |
|---|---|---|---|
| Baseline writer | possible; paid | **the approved baseline** | after hardware is chosen; 30B class or larger |
| Cross-vendor critic of a Gemini or local script | **the most plausible OpenAI role**: different vendor and model family | the critic for a local writer; not independent of a Gemini writer | a second model family when two are available; quality Not established |
| Search discovery | web search with URL citations ($10 per 1,000 calls plus content) | Google Search grounding (free quota limited; our adapter ignores the citation metadata) | none; our research desk |
| Extraction and bulk work | cheap models (`gpt-6-luna`, `gpt-5.6-luna`), Batch at half price | free within quota | best fit for zero cost when hardware allows |
| Privacy-sensitive material (the manual) | abuse logs up to 30 days | free-tier terms not verified | stays on the owner's machine |
| Very long runs | large windows, but the 272k surcharge argues for chapter packs anyway | 1M windows on some models; free quotas low | slow but unmetered |

## B9. Trend intelligence: what exists and what to engineer

What already exists in code, all mock-tested only:
- **Topic radar** (`engine/src/topic-radar.mjs`, `worker/youtube.mjs`
  `radarSearch`, `/api/ideas`): videos that earn many times their channel's
  usual views on a niche ("outliers"), via the YouTube Data API.
- **Market desk:** proven titles feed S1 and S7. `titleTooClose` stops
  copying a title, and `originality.mjs` compares against the channel's own
  earlier films.
- **Channel lessons** (`retention.mjs`, `worker/youtube-analytics.mjs`):
  where the owner's own viewers left or stayed.

What must be built (Bossism-owned signals, with a provider only summarising):

| Component | Purpose | Measurable output |
|---|---|---|
| Demand signals | outlier ratio, views per day, recency, number of distinct channels with outliers | a demand record per topic with its data date |
| Evergreen vs spike | do outliers keep earning long after upload (evergreen) or cluster in recent weeks (spike)? | a class with a probability, never a promise |
| Saturation | how many recent uploads already cover the topic and angle | count and trend |
| Angle map and gaps | cluster the angles of the leading videos from public titles, descriptions and chapters; find evidence-supported angles nobody covered | a list of original angles, each with the claims that support it |
| Why audiences care | the emotional engine and question behind demand (the manual's S1 topic score, made explicit) | a stated reason, reviewed by the critic |
| Documentary potential | research depth available, visual provability, sensitivity | a feasibility note before the topic is chosen |
| Originality guard | no copied title, structure or sequence of beats | existing checks extended to structure |
| Backtesting | snapshot the signals at a past date and check what happened 90 days later | calibration of the evergreen/spike probabilities |

Optional external signals, availability **UNVERIFIED** in this study:
Wikipedia pageview statistics, search-interest data. YouTube Data API
quotas also limit how much can be scanned per day.

Rules:
- Forecasts are probabilities, with the data date and the error measured in
  backtests.
- No view counts are promised.
- A trending topic still has to pass the research and story gates.

## B10. Prioritised roadmap

**Immediate** (no paid service; within what is approved or proposed):
1. Gemini free-tier baseline: Master Plan Phase 0 and section 21, as
   approved; waiting on the Appendix C setup approval.
2. Truth fixes (Master Plan Phase 1): placeholder gate, the four gate
   statuses, lint for all formats.
3. **Budget ledger design** (this report, section 3.3),
   required **before** any paid adapter: reserve before each request, dated
   price table, unknown model means refuse, kill switch, run/day/month caps.
4. Doc Bench v0: the three baseline topics with gold sheets and the rubric.

**Later development:**
- Research v2, claim verification, critic calibration (where an optional
  OpenAI critic test belongs), story v2, targeted revision, long-form packs,
  supervisor v2: Master Plan phases 3–9.
- **Trend intelligence v1** on the existing radar, with evergreen/spike,
  saturation, angle gaps and a backtest.
- Model lifecycle guard.

**Long-term research** (unproven ideas):
- Retention prediction calibrated on the channel's own analytics.
- Routing learned from benchmark history.
- Critic ensembles where disagreement flags defects.
- Automatic improvement of prompts and strategies under regression gates.
- Narrative memory methods for multi-hour films.

## B11. Unresolved questions and the experiments that answer them

| Question | Experiment | Metric | Needs |
|---|---|---|---|
| Does any free option write good US documentary narration? | Phase 0 baseline, three topics | blind human scores | Gemini key, research access, readers |
| Is an OpenAI critic better than a Gemini or local critic on our scripts? | each critic on the baseline scripts and a hand-made seeded-defect set | recall, false positives, unique true findings, agreement with humans | paid test (B12) |
| How much do providers share blind spots? | compare which seeded and human-found defects each critic misses | overlap of misses | the same runs |
| Real tokens per film minute, including reasoning | usage records from real runs | tokens per stage | any real run |
| Do provider citations survive our own fetch and quote check? | run source-check on citations from Gemini grounding and OpenAI web search | share verified, share primary | research access, paid test for OpenAI |
| Do the dashboard hard limit and an empty prepaid balance stop requests exactly? | $5 prepaid, $1 project limit, a loop of small calls | overrun in dollars | paid test |
| Can a Bangladeshi card buy API credit? | owner tries the minimum purchase | yes or no | owner |
| Do trend signals predict anything? | backtest on 6–12 months of radar data | calibration error | YouTube API quota |

## B12. Recommendation on an OpenAI adoption test

**A test is worthwhile only as an optional cross-vendor critic, and only
after these conditions hold:**

1. The Gemini baseline has produced its three scripts, and Reader 1 has
   scored them, with Reader 2 scored or pending. Without human scores a
   critic cannot be judged.
2. A seeded-defect set exists. It is made by hand from the baseline scripts
   by inserting known errors; it is documentation work, not code.
3. Spend is capped outside our code: prepaid $5, auto-recharge off, a $5
   project hard limit. If the budget ledger is not built yet, the test runs
   only through a short manual script with a fixed number of calls. **No
   automatic paid fallback**, ever.
4. The owner accepts the data handling in B4: no manual sent, `store=false`,
   abuse logs up to 30 days.
5. The key is a proxy-injected secret, and the Bangladesh payment works.

**Test:**
- `gpt-6.1-terra` (or `gpt-5.6-luna` for cost) critiques the three
  baseline scripts and the seeded set.
- Estimated cost well under $2 by section 4's rates: about 30k input and 5k
  output per 10-minute script critique, a few cents each.
- If local hardware exists, the same test runs with a local critic as the
  free comparison.

**Decision rule, agreed before the test:** keep OpenAI as an optional
critic only if it finds clearly more true defects than the free critic
(seeded and human-confirmed), with no more false positives, at a cost per
script the owner accepts. Otherwise drop it.

**Not recommended:** OpenAI as default writer, supervisor or required
provider.

## B13. Proposal: where the vision should live (not done; needs approval)

`docs/VISION.md` holds the owner's condensed original vision (33 lines).
Proposed:

1. **New canonical document `docs/BOSSISM_VISION.md`:**
   1. The ambition and how it is measured (Doc Bench, release metrics).
   2. The user experience contract (B6).
   3. Quality standards and what is never claimed.
   4. Genres and factuality modes.
   5. Trend intelligence principles (B9).
   6. Provider independence and the zero-mandatory-paid-AI policy (no
      automatic paid fallback, budgets, kill switch).
   7. Language and audience (en-US first, Arabic separate, Bangla optional).
   8. Ten-year adaptability principles.
   9. How the document changes: by owner decision only, with a date.

   `docs/VISION.md` would gain one line linking to it.
2. **Master Plan additions** (a version 3, after approval):
   - §22 Trend intelligence architecture (the components in B9, with
     acceptance criteria).
   - §23 Cost and dependency policy (budget ledger, provider enable flags,
     no paid fallback).
   - §24 Benchmark program (Doc Bench).
   - A user-experience contract in §5.
   - An optional critic-test step in Appendix C, if approved.

Nothing in B13 has been written.

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
- [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)
- [GPT-5 (deprecated snapshot page)](https://developers.openai.com/api/docs/models/gpt-5)
- [Changelog](https://developers.openai.com/api/docs/changelog)

Google:
- [Gemini 4 Argon](https://ai.google.dev/gemini-api/docs/models/gemini-4-argon)
- [Latest model](https://ai.google.dev/gemini-api/docs/latest-model)
- [Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/whats-new-gemini-3.8)
- [Gemini 3 guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Models](https://ai.google.dev/gemini-api/docs/models)
- [Tokens](https://ai.google.dev/gemini-api/docs/tokens)
- [Pricing](https://ai.google.dev/gemini-api/docs/pricing)
