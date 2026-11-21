# M1: Reference study (what the best long documentaries actually do)
Goal: a measured, sourced reference standard that M2–M6 build against. Verified facts are kept apart from opinion.
Owns: docs/research/ (new), docs/YOUTUBE_BENCHMARKS.md. No code outside tools/research/ (new). One exception (Boss, 21 Nov): the new read-only route GET /api/videos in worker/youtube.mjs + worker/index.mjs + its test, in its own PR (branch m1-videos-route).
Must not touch: engine/, render/, worker/ (ask the Boss if an API route is missing).

## Checklist
- [x] Find how the Worker reaches the YouTube Data API (`git grep -n -i youtube worker`). Use it, or a
      small script through it, for metadata only. Never download videos.
- [x] Collect at least 15 reference videos, preferring the last 3–6 months: Ruhi Çenet, DW Documentary,
      Johnny Harris, LEMMiNO, Fern, MagnatesMedia, National Geographic, plus strong finds in history,
      biography and motivation. For each, record the link, publish date, views, duration, chapters, title
      pattern, thumbnail style, and the date checked.
- [x] Analyse the owner's 50+ links in docs/YOUTUBE_BENCHMARKS.md ("not analysed yet") the same way.
- [x] Compare the strongest and the average videos of the same channel: what differs (topic, title, length,
      chapter rhythm)?
- [ ] Ask the Boss to request 3–5 phone screen recordings (1–2 min each, including the opening) of the
      references the owner loves. With ffmpeg scene detection, measure the median shot length, the share of
      moving footage versus stills, text and graphic moments per minute, transitions, and when the title lands.
- [x] Use YouTube's own Audience Retention guidance (cite the help pages): first 30 s, dips, re-hooks.
- [ ] Write docs/research/REFERENCE_STANDARD.md:
  - per-genre numbers (history, biography or motivation, science or explainer);
  - what to learn;
  - what NOT to copy;
  - the proposed Zupona identity.

  Every number has a source or is marked "my reading".

## Gate
REFERENCE_STANDARD.md exists with at least 15 sourced videos and measured numbers from at least 3 owner
recordings, and the Boss has updated TRANSFORMATION.md section 4 targets from it.

## Found for others
- (Solved 21 Nov by PR #40, GET /api/videos.) Worker had no videos-by-id route (chapters, thumbnails, tags, the owner's 50+ links by id). `/api/ideas` is search only. Needs a small route in worker/ (Boss to decide). Watch pages return LOGIN_REQUIRED; oEmbed gives title and author only.
- The owner's lists hold 46 distinct links, not 50+.
- Thumbnails: the route returns the thumbnail URL only; style judging needs eyes (my reading, not measured).

## Log
- 2026-11-21: Worker route = `GET /api/ideas?q=&months=` (worker/index.mjs:269, worker/youtube.mjs, YOUTUBE_API_KEY set: /api/health youtube:true). `tools/research/collect.mjs` (needs NODE_USE_ENV_PROXY=1) -> 166 videos, 28 channels, data/reference-videos.json. Strongest-vs-average: docs/research/CHANNEL_COMPARISON.md. YouTube retention help cited: https://support.google.com/youtube/answer/9314415 (intro = % still watching after 30 s; spikes; dips; top moments).
- 2026-11-21: PR #40 merged (a44811a), production GET /api/videos?handle=@lemmino returned 200 with chapters. `tools/research/by-id.mjs` + `analyse.mjs`: all 46 owner links measured (docs/research/OWNER_LINKS_ANALYSIS.md, data/*.json), YOUTUBE_BENCHMARKS.md tables filled; LEMMiNO, MagnatesMedia, Business Casual, DW added from their latest 25 uploads. Waiting on: 3-5 owner screen recordings (asked the Boss), then REFERENCE_STANDARD.md.
