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
- [ ] Do not ask the owner for anything. Measure craft from public sources: the creators' own talks and
      behind-the-scenes posts, chapter timings, and published analyses. Mark each number as sourced or
      "my reading".
- [ ] Use YouTube's own Audience Retention guidance (cite the help pages): first 30 s, dips, re-hooks.
- [ ] Write docs/research/REFERENCE_STANDARD.md:
  - per-genre numbers (history, biography or motivation, science or explainer);
  - what to learn;
  - what NOT to copy;
  - the proposed Zupona identity.

  Every number has a source or is marked "my reading".

## Gate
REFERENCE_STANDARD.md exists with at least 15 sourced videos and measured numbers, and the Boss has updated TRANSFORMATION.md section 4 targets from it.

## Found for others

## Log
