# Business plan (20 Nov 2026)

A plan, not a forecast: nothing here promises customers or revenue. Market facts are in `docs/MARKET.md`.
Today no real film has reached an MP4 (`docs/ENGINEERING_STATE.md` §0). Until one exists and is good,
there is nothing to sell, so every step below that involves selling waits for that film.

## 1. First paying segment: faceless **history** documentary channels (English)

Why history first:
- **The footage exists and is free to use.** Public-domain archives (the Library of Congress, the Met, NASA,
  Wikimedia) are the sources the engine already searches (`engine/src/film-media.mjs`). Nature or motivation
  footage would need paid stock.
- **Facts matter, and they are Zupona's strength.** A wrong date costs a history channel its comments section.
  Zupona's research, source and evidence stages and its licence report address exactly that.
- **Long videos are normal** in history (20–60 min). Kutly stops at 30 min. Zupona is built for up to 60.
- **YouTube's inauthentic-content policy** (July 2025) hits template history channels hardest. A traceable,
  researched film is the defence.

Considered and set aside for now:
- **Islamic education:** Zupona's most unique asset is Quran recitation, but it is blocked on a scholar's sign-off
  and written recording rights (§0b). It is the second segment once those are cleared.
- **Motivation:** low price tolerance, the content is mostly stock, and research is no advantage.
- **Generic faceless documentaries:** too broad for ten customers.

## 2. What these creators pay today and what hurts

| Way they make videos | What they pay | Source |
|---|---|---|
| A freelance editor | $100–300 a video (Kutly's figure), $50–150 (VidRush's figure) | kutly.io, vidrush.ai/pricing |
| Kutly | $0.48 a minute ($29 for 60 min) | kutly.io/pricing |
| VidRush | $1.56–2.18 a minute (from $99/mo) | vidrush.ai/pricing |
| Subscribr | $1.20–1.50 a minute (from $99/mo) | subscribr.ai/pricing |
| Fliki and stock tools | about $0.18 a minute, 15-min cap | toolradar |

Their problems, as the category reviews describe them:
- demonetization risk for mass-produced videos
- factual errors
- the same stock clips again and again
- credit costs they cannot predict
- paying again for every re-render
- length caps
- robotic voices

## 3. Credits and pricing, from real cost

**The unit is 1 credit = 1 finished minute, rounded up.** It covers the film at 1080p, narration, music, the
subtitle file, 3 thumbnails and the Shorts cut. It replaces the invented 1.25 credits a minute (`src/data.ts`
`estimateCredits`). The landing page shows this now, with "no charge during the private beta".

Real cost of one finished minute today:

| Part | Cost | Evidence |
|---|---|---|
| Writing and research (free Gemini pool) | $0 | free key. **But capacity is the limit:** 20 requests a day per model, so a few short films a day for the whole platform (§0) |
| Render at 1080p | **about 0.6 runner minutes per film minute** | measured 20 Nov: chapter 1 of the USA film (510 s) rendered in 309 s at 1920×1080, 30 fps, on 2 CPU cores (the size of GitHub's standard runner), with local test clips. Downloading the real clips is not included |
| Narration (Kokoro, free) | runner minutes; **not measured** | Kokoro is not installed in this container |
| GitHub Actions (private repo) | $0 within the account's free minutes | GitHub Free gives 2,000 Linux minutes a month for private repos (CI uses part). That is roughly 1,000–1,500 film minutes a month for everyone together. Beyond it GitHub charges per minute, which is never allowed without the owner |
| Storage | $0 | GitHub releases and the owner's R2 free allowance |

So at zero cost Zupona can give away a small number of films. It cannot sell volume until the owner chooses a
brain that can finish films (Gemini billing, a Claude key, or his own computer). That choice sets the real price:

- **Rule:** price a credit at no less than 3 times the measured brain cost per minute, and below Kutly's $0.48.
- **Proposal, for the owner to decide once the brain cost is measured:**

  | Plan | Price | Credits | Per minute |
  |---|---|---|---|
  | Free | $0 | 10 once (one 8–10 min film) | none |
  | Starter | $19/mo | 60 | $0.32 |
  | Creator | $59/mo | 200 | $0.30 |

  Unused credits roll over, and a failed film costs nothing (the category's two main complaints). Re-rendering
  only the changed scenes is free, because the render cache already redoes only those
  (`.github/workflows/render-film.yml`, "only changed scenes are redone").
- Taking money needs accounts, a payment provider and terms of sale. That is a legal and money step for the owner.
  It is not built.

## 4. How to win the first 10 paying customers

1. **The proof film.** One 15–20 min history film, made end to end, that the owner is proud of, with its source and
   licence page public. Without it, stop here.
2. **50 hand-picked channels.** English history channels with 1k–50k subscribers that post faceless long videos.
   Found by hand on YouTube search (no paid tools).
3. **A free film on their own next topic.** Offer each one a free 10-minute film with the source ledger. A free film
   costs Zupona $0 in money but uses scarce free-brain capacity, so at most 3 or 4 a week.
4. **Founder-led follow-up.** The owner talks to every creator who replies. Ask what they would change and what they
   would pay. Write it down in `docs/CUSTOMERS.md`.
5. **The ask.** After their second film: the Starter plan at a founding price, held for a year.
   10 paying customers out of 50 is a hope, not a target I can promise.

## 5. Retention (why they stay)

- **A channel memory:** the run already loads and saves a channel's past films (`channel` in `engine/src/film-run.mjs`),
  so the next film avoids repeating topics and footage.
- **Series:** plan the next 4 films of a channel at once.
- **Analytics back into the brief:** `worker/youtube-analytics.mjs` exists. Show which film held viewers and why.
- **Files that stay** (Kutly deletes after 30 days), plus credits that roll over.
- **The source ledger as a habit:** every film comes with a page they can link in the description.

## 6. 30-day plan (only steps that cost $0)

| Days | Work | Done when |
|---|---|---|
| 1–7 | Workstream A gets one real film to an MP4. This workstream checks its frames, type on phones and audio | an MP4 exists and the owner has watched it |
| 8–10 | Make the 15–20 min history proof film. Publish its source page | the owner approves it |
| 8–14 | Measure the real cost of one film: requests per stage, runner minutes, narration time | numbers written in §3 |
| 11–14 | List 50 channels and write one short outreach message (owner's voice) | the list is in `docs/CUSTOMERS.md` |
| 15–30 | 3–4 free films a week for channels that answer. Collect what they would pay | 10 conversations written down |
| 15–30 | Owner's decisions: the brain for paid films, the payment provider, terms of sale | decisions recorded in CLAUDE.md |
| 30 | Review: go on, change the segment, or change the price | a short note to the owner |

Not in this plan: paid ads, paid tools, extra Google accounts (against Google's terms), or any promise of income.
