# M1: Reference study (what the best long documentaries actually do)
Goal: a measured, sourced reference standard that M2–M6 build against. Verified facts are kept apart from opinion.
Owns: docs/research/ (new), docs/YOUTUBE_BENCHMARKS.md. No code outside tools/research/ (new).
Must not touch: engine/, render/, worker/ (ask the Boss if an API route is missing).

## Checklist
- [ ] Find how the Worker reaches the YouTube Data API (`git grep -n -i youtube worker`). Use it, or a
      small script through it, for metadata only. Never download videos.
- [ ] Collect at least 15 reference videos, preferring the last 3–6 months: Ruhi Çenet, DW Documentary,
      Johnny Harris, LEMMiNO, Fern, MagnatesMedia, National Geographic, plus strong finds in history,
      biography and motivation. For each, record the link, publish date, views, duration, chapters, title
      pattern, thumbnail style, and the date checked.
- [ ] Analyse the owner's 50+ links in docs/YOUTUBE_BENCHMARKS.md ("not analysed yet") the same way.
- [ ] Compare the strongest and the average videos of the same channel: what differs (topic, title, length,
      chapter rhythm)?
- [ ] Ask the Boss to request 3–5 phone screen recordings (1–2 min each, including the opening) of the
      references the owner loves. With ffmpeg scene detection, measure the median shot length, the share of
      moving footage versus stills, text and graphic moments per minute, transitions, and when the title lands.
- [ ] Use YouTube's own Audience Retention guidance (cite the help pages): first 30 s, dips, re-hooks.
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

## Log
