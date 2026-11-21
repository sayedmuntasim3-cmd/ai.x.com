# M3: Asset engine (video first, eyes, chosen as a sequence)
Goal: the right picture for each shot, chosen from many by a free model that sees it, and video where video
tells it better.
Owns: engine/src/film-media.mjs, engine/src/open-archives*.mjs, engine/src/documentary-media-fetch.mjs,
render/asset-rank/ (new; Python, OpenCLIP plus an aesthetic scorer, run on the runner), and the
media/ranking step of .github/workflows/voice-film.yml. Start that file only after King's 5's PR merges;
pull first.
Must not touch: the planning in voice-visuals.mjs (M2) and the composition in render-film.mjs (M4).

## Checklist
- [ ] Video-first providers: Pixabay video (key via the Worker relay), Pexels video (when the owner sets
      PEXELS_API_KEY), NASA, Internet Archive and Wikimedia video. Archives only when the shot's era is
      historical.
- [ ] Queries from the shot plan's subject, era and place (M2's fields), never bare keywords. Gather 50–200
      candidates per shot.
- [ ] Hard filters: licence, video ≥1080p, stills ≥1600 px wide, aspect, watermark and duplicate detection.
- [ ] OpenCLIP relevance to the shot text, plus the aesthetic score, plus era/place agreement. Cache the
      models between runs, CPU only, and measure the time.
- [ ] Sequence choice per beat: continuity of colour and era, variety of scale, no repeats within 10 min.
- [ ] For each pick, write why it was chosen (scores, provider, licence) for the critic and the studio.

## Gate
On the 3-minute slice: 0 off-era or off-place picks (checked by eye on the contact sheet), ≥ 70 % of shots
are video, every shot is native ≥1080p, and the time taken is reported.

## Found for others

## Log
