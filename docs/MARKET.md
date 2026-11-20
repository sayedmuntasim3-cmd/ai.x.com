# Market: Kutly and its nearest competitors vs Zupona (20 Nov 2026)

Read on 20 Nov 2026 from the vendors' own pages (fetched as plain HTML; quotes are theirs). Zupona's column is
from the code on `main` at 9ae14fd, with file and line. "Unverified" means nobody has seen it work on a real film.

Sources: kutly.io, kutly.io/pricing, docs.kutly.io (first-render, idea, voiceover, length-and-credits, voice,
visual-style, subtitles, thumbnails, music), vidrush.ai/pricing, vidrush.ai/vs/vidrush-vs-kutly,
subscribr.ai/pricing, invideo.io/pricing, fliki.ai/pricing, toolradar.com/guides/best-ai-video-generators-for-faceless-youtube.

## 1. Kutly, as its own docs describe it

- **What:** "One prompt in, a 30-minute documentary out." Faceless long-form YouTube only. One screen, two modes.
- **Idea mode:** a topic of 10 to 2,000 characters, "plain English". The docs teach an *angle* (a claim, a question
  or a number), not a bare subject. A topic that is only instructions is refused, the credits are returned and
  the reason is shown. The writer sees only the topic and the length. The home page shows a 6-step crew: Script
  Writer, Fact Checker, Voiceover, Video Editor, Motion Designer, Thumbnail Creator.
- **Voiceover mode:** upload MP3/M4A/WAV, 8 to 31 minutes, up to 100 MB. The file is both the length and the voice.
  The price is final ("Charged now").
- **Voices:** 39, all English (American, British, Australian), with search, gender and accent filters, favourites
  and a preview clip. There is no speed control and no other language.
- **Lengths:** four bands: 8–10, 14–16, 20–22 and 29–32 min. The target is in the middle and the top of the band is
  *held* in credits. A render is priced again when it finishes, and that price can only go down. A failed render
  returns everything.
- **Style packs:** six. The free ones are Noir (the default), CRT Red and Crumpled Paper (photo-driven: cut-outs,
  framed photos, polaroids, quotes, title scenes). Type Red, Archival and Velvet are "Premium motion design"
  (charts, key figures, timelines, process diagrams) and cost about **+1 credit a minute**.
- **Subtitles:** burned in, free, with 10 looks (Clean, Marker, Boxed, Lift, Word, Pop, TikTok, Rolling, Hype,
  Chunk) and 7 fonts. **No subtitle file** comes with the video.
- **Music:** None, 7 scored packs (an intro "hook" followed by a loop), or your own bed (MP3/WAV/AAC/FLAC, 50 MB,
  looped). Music is free.
- **Thumbnails:** a flat extra charge. You get three covers (Auto, one look three times, or up to three looks),
  previewed as YouTube's phone and desktop cards with the duration badge.
- **Output:** one MP4 at 1920×1080, 30 fps, 16:9 only (**no vertical/Shorts cut**), plus a title, a script file,
  and on the home page an SEO description and tags. A render takes "40–50 min" for 20–22 min of video. **Files are
  deleted after 30 days.**
- **Prices** (kutly.io/pricing): 10 credits for a minute of full production, 8 for a minute of editing only.

  | Plan | Monthly | Yearly (per month) | Credits | Full-production minutes | $ per minute |
  |---|---|---|---|---|---|
  | Starter | $29 | $24 | 600 | 60 | $0.48 |
  | Creator | $99 to $666 | $83 to $555 | 2,000 to 16,000 | 200 to 1,600 | $0.50 to $0.42 |
  | Studio | $1,199 to $4,166 | $999+ | 24,000 to 100,000 | 2,400+ | about $0.50 |

  Unused credits roll over (a monthly plan holds up to twice its monthly credits). Concurrent renders: 1, 2 or 5. A
  "Free" plan exists, since cancelling drops you to it and one render runs at a time, but no free credits are
  published. Their claim: "$3–15 a video".
- **What users say:** I found **no independent reviews** of Kutly: no Reddit threads, no Trustpilot page, and
  VidRush's comparison page shows Kutly with "0 · 0 reviews". Everything public is Kutly's own copy or a
  competitor's. Praise and complaint below are therefore about the category, not about Kutly.

## 2. Nearest competitors (long-form, faceless)

| | VidRush | Subscribr | InVideo AI | Fliki |
|---|---|---|---|---|
| Entry plan | $99/mo, 2,000 credits, 45 min | $0 start; $99/mo, 66 min | $20/mo (400 credits) | Free 5 min/mo; Standard $28 |
| $ per finished minute | $2.18 down to $1.56 | $1.50 down to $1.20 | depends on the model ("hard to predict") | about $0.18 (10 min for about $1.79, per toolradar) |
| Length | 6 to 60 min, English | long-form | long-form | 15 min cap on Standard; 40 min needs $88 |
| Footage | licensed Storyblocks, public-domain archives, open web; no AI footage | edits your footage | stock plus generative models | stock (uses no credits) |
| Stand-out | Quote Statement before charging; timeline editor and chat edits; Brand Profile per channel; 15 renders at once | idea + script + thumbnail studio (150 a month) | timeline editor, frontier models | cheapest; 0.5 credit to auto-publish |
| Known weak spots (toolradar, vendors) | price | price | credits do not roll over; unpredictable cost | re-editing a scene charges the voice again; the free plan has a watermark, 720p and no commercial use |

What the category is praised for: speed, one bill instead of many tools, licensed footage, a preview of the price.
What it is criticised for: unpredictable credits, credits that do not roll over, being charged again for
re-renders, robotic voices, length caps, watermarks and no commercial rights on free plans. Most important,
**YouTube's "inauthentic content" policy (renamed July 2025)** names "AI-generated videos made with generic
templates that give the impression of mass production"; a channel can lose monetization on every video
(toolradar). Every one of these tools sells *volume*. Volume is exactly what that policy punishes.

## 3. Feature by feature: Kutly vs Zupona today

| Feature | Kutly | Zupona today (code) |
|---|---|---|
| A finished film from a prompt | yes, 40–50 min | **Not yet.** No real film has reached an MP4: test film 70577b9b stopped at s2 ("Too many subrequests"), `docs/ENGINEERING_STATE.md` §0 |
| Speed | under an hour | days: the free Gemini key allows 20 requests a day per model; the pool rotates models (`worker/gemini-pool.mjs`) |
| Sign-up, accounts, payment | yes (Stripe) | **none.** A shared studio key only (`src/landing.tsx` around line 1581: `authorization: Bearer <key>`) |
| Idea input | topic + angle coaching | topic + category + audience + style + music (`src/data.ts:22-101`). Style and music are sent only as a text note to the writer (`notes: "Style: … Music: …"`), not as a visual pack |
| Research and fact check | "Fact Checker" (claimed) | real stages: market, research, sources ("checking every source"), evidence, originality check, first-viewer test, final review (stage names in `public/app.js`, `engine/src/film-run.mjs`). Research rested on 2 sites in both test films (a gap) |
| Voiceover upload | web, 8 to 31 min | CLI only (`local/voice-film.mjs`). The landing says "coming next" |
| Voices | 39 English | one free narrator (Kokoro, voice A); ElevenLabs if a key is set (paid, not used) |
| Languages | English | American English documentaries + Arabic Quran recitation (`ACTIVE_VERSION_IDS`, `engine/src/versions.mjs`) |
| Lengths | 4 bands, 8–32 min | presets 3/5/8/15/30/60 and 1–120 min on the landing (`src/data.ts:104-137`). 1080p never verified beyond 45 min |
| Style packs | 6 (3 premium) | 6 style names with no distinct render pack; the renderer has one look, plus graphics: route map, bar chart, counter, kinetic type, paper card, split card (`render/render-film.mjs`) |
| Captions | 10 burned-in looks, no file | an SRT file (`render/render-film.mjs:917`); burned-in captions on the vertical cuts only (`:1050`). No look picker |
| Vertical / Shorts | no | yes: Shorts and a Facebook cut with hooks (`render/render-film.mjs:1050`), unverified on a real film |
| Music | 7 packs or your own, free | an original synthesised score (`render/score-synth.mjs`), free; ElevenLabs Music only with a paid key |
| Thumbnails | 3, a paid extra, YouTube-card preview | 3 (TH-A/B/C) from the S7 brief (`render/thumbnails.mjs`); no YouTube-card preview |
| Title, description, tags | yes | yes, stage s7 ("Titles, thumbnails and description") |
| Licence and source report | not stated | yes: a licence for every clip, with its source page (`render/render-film.mjs:918-921`) and a readable film page with sources (`/api/films/:id/page`) |
| Price shown before spending | receipt, held and returned | "~N credits", an invented 1.25 a minute (`src/data.ts:198`) |
| File keeping | deleted after 30 days | films kept in the owner's R2 and GitHub releases |

## 4. Gaps that stop Zupona from beating them (most important first)

1. **No finished film.** Until one real film reaches an MP4 that looks good, nothing else matters (workstream A).
2. **Speed and capacity.** On a free brain a film takes days. Kutly takes under an hour. A paying customer needs a brain
   that can finish a 15-minute film in hours. That is the owner's decision (Gemini billing, a Claude key, or his
   own computer), and its cost sets the price.
3. **No accounts or payment.** There is no sign-up, no balance, no checkout. Today only the owner can make a film.
4. **Voiceover upload on the web.** Kutly, VidRush and Subscribr all take your own narration. Zupona has it only as
   a CLI (workstream B).
5. **A price shown before the click.** The category's main complaint is unpredictable credits. Kutly holds the top
   of the band and returns the difference. Zupona needs the same kind of honest receipt (round 2 of this work).
6. **Visual variety.** Kutly sells 6 packs and VidRush licensed Storyblocks footage. Zupona's six style names do
   not change the picture yet, and research and media rest on a few free sources.
7. **Captions with a look.** Burned-in captions in 16:9 with 3 or 4 looks (Kutly ships 10).
8. **Voices.** One English narrator against 39.

## 5. Zupona's one clear differentiator

**Evidence-led documentaries that are safe to monetize.** Every film comes with its sources, a licence for
every shot, an originality check and a first-viewer test before release (the Bossism release gate,
`render/release-gate.mjs`). The others sell volume, and YouTube's inauthentic-content policy punishes volume.
Zupona can sell the opposite: each film is researched and traceable, with a long length (up to 60 min) and
Shorts cut from it, at a free-brain cost base that can undercut Kutly's $0.48 a minute. This is a promise only
once gap 1 is closed. Until a real film proves it, it is a plan, not a fact.
