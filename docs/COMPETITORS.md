# Competitors: where they fail, and where we must win (4 November 2026)

This scan was quick (five web searches). It updates the October list in `docs/SYSTEM_V5.md` section 9. Most sources are reviews and vendor blogs, so read every point as a signal rather than a proven fact.

## What the market shows

| Finding | Signal | Source |
|---|---|---|
| InVideo's v4 agent is reported to make up to about 30 minutes of video from one prompt (script, stock, voice, captions), edited by chat and a timeline. | It is the closest rival for long-form work. | [cut-the-saas](https://cut-the-saas.com/ai/invideo-ai-review-2026-is-it-actually-worth-it), [creatify review](https://creatify.ai/review/invideo-ai) |
| InVideo users complain that credits are spent on failed or wrong renders, with no refunds once a credit is used. Trustpilot shows about 3.2/5 from roughly 840 reviews. | Paying for failures is the main source of anger. | [Trustpilot](https://www.trustpilot.com/review/ai.invideo.io?page=10), [Capterra 1-star](https://www.capterra.com/p/180680/InVideo/reviews/?rating=1) |
| Users say stock-footage tools become repetitive fast. They were built for 60–90-second marketing clips, so documentary topics get generic footage. | Repetition and footage that does not match the scene. | [DEV](https://dev.to/contentify_video/i-watched-200-faceless-youtube-videos-here-is-the-dirty-secret-nobody-talks-about-27h7), [Pictory blog](https://pictory.ai/blog/faceless-youtube-channel-ai) |
| YouTube's "inauthentic content" rule (renamed in July 2025) is now enforced per channel. In January 2026, 16 channels with about 35M subscribers were terminated. Faceless and AI-assisted channels are allowed; templated, mass-produced ones are not. | Originality across a whole channel decides monetisation. | [AIR timeline](https://air.io/en/monetization/youtube-monetization-policy-changes-2026-a-complete-dated-timeline), [The Next Web](https://thenextweb.com/news/youtube-ai-slop-crackdown-faceless-creators-collateral-damage), [HackerNoon](https://hackernoon.com/youtubes-ai-slop-crackdown-cant-tell-a-directed-ai-film-from-a-bot-farm) |
| Runway stopped selling its Unlimited plan (June 2026), and legacy users move to metered credits after 30 November 2026. Higgsfield has changed its plans several times this year. | Generative-video pricing is unstable and opaque. | [creatify Higgsfield vs Runway](https://creatify.ai/blog/higgsfield-vs-runway-(2026)-quality-cost-per-second-and-which-to-use-for-ads) |

## Our position, honestly

- **Ahead:** the price is shown before a run. A finished stage is never paid for twice (resumable runs). There is a budget stop. Every chapter is checked in code. Every fact has a source. Every stock shot gets a free-licence clip that is not repeated within 10 minutes. The run's page shows all of this in one place.
- **Behind (closing):** InVideo delivers a finished video file. We now render an MP4 with narration, captions and a licence report (`render/`), but our graphics shots are plain text cards and there is no music bed yet.
- **Unproven:** nothing has run against the real Claude, Pexels or Pixabay APIs yet.

## What to build, in order of value

Status, 4 Nov 2026: items 1–4 are built and tested with fakes (render runs on any machine with ffmpeg; a hosted render machine is still the owner's choice). Item 5 needs client billing, which does not exist yet.

1. **Render (closes the largest gap):** download the picked clips, record the voice (ElevenLabs), build a timeline from the scene lines, then render with ffmpeg. A Cloudflare Worker cannot run ffmpeg, so this needs a render machine: Cloudflare Containers, or a small VM. The owner chooses, because it has a running cost.
2. **Footage relevance check:** show Claude the top three thumbnails per shot and keep the one that really matches the shot. This answers "wrong footage", the second-largest complaint.
3. **Re-make one scene only:** let the owner regenerate a single scene or shot from the page, charged only for that scene. Competitors make users re-render whole videos.
4. **Channel originality guard:** compare each new film with the channel's earlier films (structure, hooks, title patterns, phrases) and flag templated sameness before upload. This protects against channel-level "inauthentic content" action, and no rival offers it.
5. **No charge for failure:** a failed stage costs the client nothing. Our own cost is logged, and the client is billed only for delivered stages. Today the run already never pays twice.
