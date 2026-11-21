# M3: Asset engine (video first, eyes, chosen as a sequence)
Goal: the right picture for each shot, chosen from many by a free model that sees it, and video where video
tells it better.
Owns: engine/src/film-media.mjs, engine/src/open-archives*.mjs, engine/src/documentary-media-fetch.mjs,
render/asset-rank/ (new; Python, OpenCLIP plus an aesthetic scorer, run on the runner), and the
media/ranking step of .github/workflows/voice-film.yml. Start that file only after King's 5's PR merges;
pull first.
Must not touch: the planning in voice-visuals.mjs (M2) and the composition in render-film.mjs (M4).

## Checklist
- [ ] Video-first providers: Pixabay video (key via the Worker relay), Pexels video (only if a key is ever set;
      never ask the owner), NASA, Internet Archive and Wikimedia video. Archives only when the shot's era is
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
- M2 (voice-visuals.mjs:209): a name alone, or any year ("Rolls-Royce", "in 2011"), makes a shot R2, so it searches the
  archive first. Only a historic date should do that (year < 2000, "century", "N years ago"). Tested code for this was in
  PR #39's first commit (`isHistoricDate`) and was taken back out: it is M2's file.
- M2: with no brain, the words-only queries are bare single words ("bill" gave an owl, "India" a Himalaya clip, "detail"
  an abstract ink clip). M3 needs subject, era and place fields from M2.
- M4 (render-film.mjs:495-560): every landscape still sits small over a blurred copy of itself. Fill the frame instead
  (cover crop + slow move); keep the blur only for a print or a portrait photo. A `--slice <s>` test option is also
  missing. Both were tested in PR #39's first commit (`stillFraming`, `sliceTimeline`) and then taken back out.

## Log
- 21 Nov 2026, item 1 + 3 (partial; not ticked): `shotSearchPlan` (film-media.mjs). Stock video first; archives only for
  R2 history (until M2's era field exists), or when no stock is set. Video ≥1920 px, stills ≥1600 px (documentary-media-fetch.mjs).
  Test: film-media.test.mjs "footage first". Film 993f09ea, first 180 s, re-picked through the Worker relay (PR #37 lets
  the owner's key use the relay). Video shots: 15/29 in the old film; 16/29 with this PR alone, because 14 shots are still
  R2 from names (M2, above); 28/29 with M2's historic-date rule added. Picking took 13-69 s. The slice rendered in 170 s
  in the cloud container (not the GitHub runner: the runner has no owner key for the audio), and the release gate passed.
  Sheets (t = 10/40/70/100/130/160 s): proof/M3/993f09ea-before.jpg, proof/M3/993f09ea-after.jpg.
  Still open: Internet Archive video, aspect/watermark/duplicate filters, 50-200 candidates, OpenCLIP. Gate not met:
  off-place picks (Amazon river for India; dollars for rupees).
