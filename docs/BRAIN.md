# The free brain: making films without a paid AI API

Written 12 November 2026. The studio's writer (the "brain") is swappable. It
can be an open-weight model on your own computer, Google Gemini's free tier,
or Claude. **No paid API is required.** This page explains how to set up the
free brain, what it costs in practice, and where it is weaker than Claude.

## 1. The three brains

| Brain | Settings | Money per film | Quality for long scripts |
|---|---|---|---|
| **Local** (your own model) | `BRAIN_URL`, `BRAIN_MODEL`, `BRAIN_CONTEXT` | none per token (your electricity and hardware) | depends on the model; below Claude (see 5) |
| **Gemini** free tier | secret `GEMINI_API_KEY` | none within Google's daily limits | good; cannot judge footage (see 4) |
| **Claude** | secret `ANTHROPIC_API_KEY` | about $7–15 for 45 minutes (studio estimate) | best tested so far |

Which one runs: `BRAIN=local|gemini|claude` chooses. Without `BRAIN`, the
first one that is set up runs, in the order local → Claude → Gemini. Claude
and Gemini are never used unless their keys are set.

## 2. Quick start on your own computer (recommended)

The simplest free setup runs everything on one machine: the model and the
film run. No Cloudflare account and no API key are needed.

1. Install [Ollama](https://ollama.com) and pull a model with a long
   context window (see 3):

   ```sh
   ollama pull qwen3:32b
   ```

2. From this repository:

   ```sh
   npm ci
   BRAIN_URL=http://localhost:11434 BRAIN_MODEL=qwen3:32b BRAIN_CONTEXT=65536 \
     node local/run-film.mjs --topic "The rise and fall of Lamborghini" --minutes 10
   ```

   The film's files go to `films/<topic>/` (ignored by git, so they are never
   published by accident from this public repository). Stopping and running
   the same command with `--out films/<topic>` resumes; finished stages are
   kept.

3. Optional free keys: `PEXELS_API_KEY` and `PIXABAY_API_KEY` (stock
   footage). Without them the media step is skipped.

4. Render (needs ffmpeg): the runner prints the command, for example

   ```sh
   node render/render-film.mjs --run films/the-rise-and-fall-of-lamborghini --out film.mp4
   ```

Other servers work too: llama.cpp (`llama-server`), vLLM, LM Studio or any
OpenAI-compatible server. Point `BRAIN_URL` at its `/v1` address, for example
`BRAIN_URL=http://localhost:8080/v1`.

## 3. Choosing a model: the context window matters most

Every stage is sent the production manual (about 73 KB, roughly 20,000
tokens), the brief and the stage's own material; QA reads the whole film. So:

- **Use a window of at least 64k tokens** (`BRAIN_CONTEXT=65536`), and 128k
  for films over about 30 minutes. Check that your model supports it.
- With Ollama the studio sets the window on every request (`num_ctx`), so
  you do not need to change Ollama's settings. A larger window needs more
  memory.
- A stage that does not fit is **refused with a clear message**, never cut.
  (Ollama's OpenAI-compatible endpoint silently drops the start of a prompt
  that is too long, which is why the studio uses Ollama's native API.)

Examples of open-weight models with long windows, all usable through Ollama:
Qwen3 (32B, or the 30B-A3B mixture-of-experts, which is faster), Gemma 3
27B, Llama 3.3 70B, gpt-oss 20B and 120B, Mistral Small. Check each model's
licence before commercial use; most of these allow it, with conditions.

**Rough hardware guide (estimates, not measurements):**

| Model size (4-bit) | Memory for the weights | Plus a 64k window | Speed |
|---|---|---|---|
| 7–9B | about 5–6 GB | a few GB more | fast, but long scripts are noticeably weaker |
| 27–32B | about 17–20 GB | several GB more | the practical minimum for long-form writing |
| 70B | about 40 GB | several GB more | needs a large GPU or a high-memory Mac |

Time: a 45-minute film writes roughly 250,000 tokens. On a capable GPU (tens
of tokens a second) that is a few hours; on a CPU alone it can be a day or
more. Shorter films first (5–10 minutes) are the honest test.

The owner's computer (RAM, graphics card) decides which of these is
possible; that question is still open (docs/VISION.md, item 9).

## 4. What a local brain cannot do, and what the studio does instead

| Missing | What happens |
|---|---|
| No web search of its own | The **code research desk** (`engine/src/research-desk.mjs`): the brain lists searches; code searches Wikipedia and opens the pages its articles cite (plus your own [SearXNG](https://docs.searxng.org) when `SEARXNG_URL` is set); the brain writes facts only from those pages; facts citing anything else are dropped. All opened pages are kept in `research-corpus.json` for you to check. |
| Cannot see pictures (most text models) | The footage desk is skipped: the first licensed search result is used, and each chapter lists this as a gap. A vision model (for example Gemma 3, Qwen2.5-VL, Llama 3.2 Vision) with `BRAIN_VISION=true` restores the desk. Gemini is treated as unable to see because the adapter does not send images. |
| No half-price batch mode | Not needed; there is no per-token price. |

Research limits, honestly: without SearXNG the corpus is Wikipedia and the
pages its articles cite. That suits history, companies, people and places,
and is thin for very recent or niche topics. The source desk afterwards
opens every cited page again and checks the numbers, as for Claude.

## 5. Quality, honestly

- Open models on home hardware are **not** as strong as Claude at holding a
  45-minute story together. The code checks (scene timing, word counts,
  banned phrases, sources, hook, holds) catch format and evidence problems;
  they do not turn weak storytelling into strong storytelling.
- Expect more repairs per chapter and more gaps. Start with 5–10 minute films
  and compare with a Claude or Gemini run of the same topic before relying on
  a model for long films.
- Nothing in this repository has yet been run against a real local model:
  this cloud sandbox cannot download model weights. The adapter is tested
  against fakes that follow Ollama's and the OpenAI-compatible API's
  documented formats. The first real run will show what needs fixing.

## 6. Using the free brain from the Cloudflare studio

The Cloudflare Worker can use a local brain only if it can reach it over the
internet. That means exposing your machine, for example with a free
Cloudflare Tunnel, and protecting it: Ollama has no login of its own, so put
it behind something that checks a token and set the same token as the
`BRAIN_KEY` secret. A Workflow step may run at most one hour, so a slow
machine can time out on a long chapter. **For a home machine, the local
runner (section 2) is the better path.**

## 7. All settings

| Name | Where | Meaning |
|---|---|---|
| `BRAIN` | var / env | `local`, `gemini` or `claude`; unset = first one set up |
| `BRAIN_URL` | var / env | the model server, e.g. `http://localhost:11434` (Ollama) or `http://localhost:8080/v1` |
| `BRAIN_MODEL` | var / env | the model name on that server, e.g. `qwen3:32b` |
| `BRAIN_CONTEXT` | var / env | window in tokens (default 32768; 65536 or more recommended) |
| `BRAIN_MAX_OUTPUT` | var / env | the longest single reply (default 8192; the run continues longer ones) |
| `BRAIN_VISION` | var / env | `true` when the model can see pictures |
| `BRAIN_API` | var / env | `ollama` or `openai`; guessed from the URL |
| `BRAIN_KEY` | secret / env | a bearer token, if your server needs one |
| `BRAIN_PRICE_INPUT`, `BRAIN_PRICE_OUTPUT` | var / env | US dollars per million tokens, **only** for a paid OpenAI-compatible service, so the budget stop can count; default 0 |
| `SEARXNG_URL` | var / env | your own SearXNG, with the JSON format enabled |

## 8. What is not free, even with the free brain

- Your computer, its electricity and its memory or graphics card.
- Narration: your own recording is free and supported. ElevenLabs audio
  made on its free plan has no commercial licence. An open-source voice
  (for example Kokoro or Piper) is **not wired in yet**.
- Cloudflare and GitHub have free tiers with limits (R2 storage, Workflow
  runs, Actions minutes); the local runner needs neither.
