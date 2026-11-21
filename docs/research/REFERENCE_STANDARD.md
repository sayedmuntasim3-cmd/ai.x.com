# Reference standard (DRAFT, 21 Nov 2026)

Status: **draft.** Everything below is measured from YouTube metadata unless marked "my reading". The shot-length, motion-versus-stills, text-moment and transition numbers are **not measured yet**: the owner is not asked for recordings (mission rule), so they will come from public sources (creators' talks, behind-the-scenes posts, chapter timings, published analyses), each marked sourced or "my reading". The Gate in `docs/missions/M1-reference-study.md` is therefore not met yet.

## Sources (all metadata only, no video downloaded)
| What | Where | Count |
|---|---|---|
| Strongest videos of 28 channels, last 12 months | `data/reference-videos.json`, `CHANNEL_COMPARISON.md` | 166 |
| The owner's own links | `data/owner-links.json`, `OWNER_LINKS_ANALYSIS.md`, `docs/YOUTUBE_BENCHMARKS.md` | 46 |
| Latest 25 uploads of LEMMiNO, MagnatesMedia, Business Casual, DW Documentary | `data/channel-uploads.json` | 100 |
| Distinct videos in total | | 307 |

Tools: `tools/research/*.mjs`, through the Worker routes `GET /api/ideas` and `GET /api/videos` (YouTube Data API). Date checked: 2026-11-21. Every video has link, publish date, views, length, chapters (owner and channel sets only) and the check date in the data files. Chapters and the thumbnail URL come only from `/api/videos`; the 166-video set has no chapters. Thumbnail *style* is not measured (only a URL is returned).

**Bias to keep in mind:** the search lists the most-viewed videos, so view numbers of the 166 are "strong videos", not channel averages. The channel average is the `ch.avg` column in `CHANNEL_COMPARISON.md`.

## Per-genre numbers (videos of 4 min or longer; genre assigned by channel, my reading)
| Genre | Videos | Length: quartiles (min) | Median views | Share with chapters (owner and channel sets only) |
|---|---|---|---|---|
| History (Yarnhub, Mark Felton, Historia Civilis, Best Documentary, Fall of Civilizations, ...) | 67 | 12.9 / 20.1 / 73.2 | 1.5M | 77% of 22 |
| Biography or motivation (Relentless, Knowspire, Champions Mentality, Fraser Allan Best) | 8 | 6.0 / 8.7 / 10.8 | 1.8M | 12% of 8 |
| Science or explainer (Veritasium, Kurzgesagt, Cleo Abram, Wendover, Fern, Johnny Harris, LEMMiNO, Ruhi Çenet, ...) | 127 | 17.9 / 23.4 / 40.0 | 6.7M | 48% of 31 |

Small samples: motivation has only 8 videos (all from the owner's list). Treat its numbers as a hint. Long compilations ("Best Documentary", 90-150 min) pull the history upper quartile up; the typical single history film is 13-20 min.

Other measured facts:
- The owner's 46 links: median **18 min**; 17 are under 15 min, 13 are 15-30 min, 16 are over 30 min; 52% have chapters.
- Strongest vs average inside one channel: length does **not** explain it. Cleo Abram (18 vs 39 min), Yarnhub (19 vs 79) and Fern (21 vs 31) are strongest when shorter; Veritasium (55 vs 35), Johnny Harris (60 vs 50) and Ruhi Çenet (29 vs 17) when longer (`CHANNEL_COMPARISON.md`).
- Top videos name a person, place or secret ("The Only Nazi Hitler Feared", "What's Hidden Under Antarctica?", "30 Days on a Death Ship"); weaker ones in the same channel are round-ups, series or news (my reading from the same table).
- Ruhi Çenet English: the owner's "Bollywood level" is that channel's top end: best 202.6M (CECOT, owner list), top three of the 12-month set median 55.1M.
- LEMMiNO's best of its latest 25 is 5.5x its median; Business Casual 13.6x; DW 32.6x; MagnatesMedia 29.4x (the last two include Shorts). A few outliers carry a channel, so one film is not a verdict.

## YouTube's own guidance on retention (cited)
Source: YouTube Help, "Audience retention", https://support.google.com/youtube/answer/9314415 (read 2026-11-21).
- **Intro** = share of the audience still watching after the first **30 seconds**. YouTube says a high figure means the opening matched the title and thumbnail promise and kept interest; to improve it, change the title/thumbnail to reflect the content and test different styles in the first 30 s.
- **Top moments**: where almost no one drops off. If they fall late in the video, "introduce the compelling content earlier", because audiences usually shrink over the length of a video.
- **Spikes**: parts rewatched or shared (or parts that were unclear). **Dips**: parts skipped or abandoned; review them to see why interest was lost.
- Available only for videos of at least 60 s and 100 views.

## What to learn
1. **Promise a specific thing in the title, then deliver it in the first 30 seconds** (YouTube's own intro metric; title patterns above).
2. **Length is a choice per topic, not a target.** The typical strong history film is 13-20 min; science explainers 18-40 min; deep dives (Johnny Harris, Veritasium) 50-60 min. (measured ranges; my reading on the choice)
3. **Chapters are normal in the strong history and explainer sets** (77% and 48% in the sets that carry the field) and are rare in motivation (12%). Chapters double as the re-hook rhythm YouTube describes. (measured shares; the link to re-hooks is my reading)
4. **Evidence of a few outliers**: plan each film as one strong idea, not a series filler.

## What NOT to copy
- No downloaded video, no re-used footage, no thumbnails or titles copied: the owner's rule and YouTube's terms. Metadata and structure only.
- No misleading title that the first 30 s cannot pay off (YouTube's own advice above).
- No Claude or paid API inside the product; no synthesized Quran recitation (mission rules).
- Do not copy the compilation format (90-150 min "Best Documentary" re-uploads) just because it has views: it is not the original-film standard the owner asked for (my reading).

## Proposed Zupona identity (my opinion, not measured)
- American-English documentaries and Arabic Quran recitation only (owner decision 19 Nov).
- One film = one named person, place or secret, 13-25 min, chapters in the description, the promise paid inside 30 s.
- Calm, sourced, no hype; the landing-page design is the product's face (owner decision 16 Nov).

## Craft numbers still to source (needed for the Gate)
Median shot length, moving-footage versus stills share, text and graphic moments per minute, transitions, and when the title lands. Not measured yet; do not quote any such number until each has a public source or is marked "my reading". The only timing measured so far is chapter spacing (chapters exist in 24 of the owner's 46 links), still to be computed from `data/owner-links.json`.
