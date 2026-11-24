# M3: Asset engine (video first, eyes, chosen as a sequence)
Goal: the right picture for each shot, chosen from many by a free model that sees it, and video where video
tells it better.
Owns: engine/src/film-media.mjs, engine/src/open-archives*.mjs, engine/src/documentary-media-fetch.mjs,
render/asset-rank/ (new; Python, OpenCLIP plus an aesthetic scorer, run on the runner), and the
media/ranking step of .github/workflows/voice-film.yml. Start that file only after King's 5's PR merges;
pull first.
Must not touch: the planning in voice-visuals.mjs (M2) and the composition in render-film.mjs (M4).

## Checklist
- [x] Video-first providers: Pixabay video (key via the Worker relay), Pexels video (only if a key is ever set;
      never ask the owner), NASA, Internet Archive and Wikimedia video. Archives only when the shot's era is
      historical.
- [x] Queries from the shot plan's subject, era and place (M2's fields), never bare keywords. Gather 50–200
      candidates per shot.
- [x] Hard filters: licence, video ≥1080p, stills ≥1600 px wide, aspect, watermark and duplicate detection.
- [x] OpenCLIP relevance to the shot text, plus the aesthetic score, plus era/place agreement. Cache the
      models between runs, CPU only, and measure the time.
- [x] Sequence choice per beat: continuity of colour and era, variety of scale, no repeats within 10 min.
- [x] For each pick, write why it was chosen (scores, provider, licence) for the critic and the studio.

## Gate
On the 3-minute slice: 0 off-era or off-place picks (checked by eye on the contact sheet), ≥ 70 % of shots
are video, every shot is native ≥1080p, and the time taken is reported.

## Found for others
- M2/M4: on a Bengaluru film the eyes still pick India-but-not-Bengaluru clips (Tirupati, Delhi, Odisha, Vrindavan) and never
  show the Rolls-Royce: Pixabay has little Bengaluru video. A city check needs a city-level source (my opinion).
- M2 (voice-visuals.mjs:209): a name alone, or any year ("Rolls-Royce", "in 2011"), makes a shot R2, so it searches the
  archive first. Only a historic date should do that (year < 2000, "century", "N years ago"). Tested code for this was in
  PR #39's first commit (`isHistoricDate`) and was taken back out: it is M2's file.
- M2: with no brain, the words-only queries are bare single words ("bill" gave an owl, "India" a Himalaya clip, "detail"
  an abstract ink clip). M3 needs subject, era and place fields from M2.
- M4 (render-film.mjs:495-560): every landscape still sits small over a blurred copy of itself. Fill the frame instead
  (cover crop + slow move); keep the blur only for a print or a portrait photo. A `--slice <s>` test option is also
  missing. Both were tested in PR #39's first commit (`stillFraming`, `sliceTimeline`) and then taken back out.

## Log
- 24 Nov 2026, items 1, 4 and 5 (ticked): `internetArchiveProvider` (film-media.mjs) is the first footage archive
  that answers with real film: video only, public-domain collections or a public-domain licence URL only (an
  in-copyright upload is never even opened, so no request is spent on it), and it reads the item's file list for a
  16:9 mp4, preferring the 1080p copy over the 640 px one. It is classified `PUBLIC-DOMAIN` (page check) and then
  checked item by item like the other archives. `rerank.mjs` now searches archives for **video** too, for a shot
  whose era is historical or that sits on the R2 evidence rung, and the eyes read scale (wide / medium / close,
  three CLIP prompts, one argmax) and colour (mean hue, chroma and lightness of every thumbnail, rank.py) beside
  relevance. `chooseSequence` then decides near-ties the way an editor does: a picture close in colour to the one
  before it gains up to 0.35, two wide frames in a row lose 0.18, a modern colour picture inside a historical
  scene loses 0.6 — all small against relevance (10x the clip similarity), and a repeat inside 10 minutes is still
  impossible. `rank-C1.json` now reports `sequence: { colourDistanceMean, scaleVariety, eraMismatch }`, so the cut's
  continuity is measured, not asserted. Tests: 3 new in rerank.test.mjs (colour continuity, scale reading, era),
  1 new in film-media.test.mjs (the archive end to end, on a fake). Measured on a real film: not yet — it needs the
  Pixabay key (or the Worker relay) and the ~600 MB OpenCLIP model, which this session does not have; the numbers
  above are the rule, and the gate still waits for a slice render.
- 21 Nov 2026, item 1 + 3 (partial; not ticked): `shotSearchPlan` (film-media.mjs). Stock video first; archives only for
  R2 history (until M2's era field exists), or when no stock is set. Video ≥1920 px, stills ≥1600 px (documentary-media-fetch.mjs).
  Test: film-media.test.mjs "footage first". Film 993f09ea, first 180 s, re-picked through the Worker relay (PR #37 lets
  the owner's key use the relay). Video shots: 15/29 in the old film; 16/29 with this PR alone, because 14 shots are still
  R2 from names (M2, above); 28/29 with M2's historic-date rule added. Picking took 13-69 s. The slice rendered in 170 s
  in the cloud container (not the GitHub runner: the runner has no owner key for the audio), and the release gate passed.
  Sheets (t = 10/40/70/100/130/160 s): proof/M3/993f09ea-before.jpg, proof/M3/993f09ea-after.jpg.
  Still open: Internet Archive video, aspect/watermark/duplicate filters, 50-200 candidates, OpenCLIP. Gate not met:
  off-place picks (Amazon river for India; dollars for rupees).
- 21 Nov 2026, the eyes (items 2, 3, 6 ticked; 4 partial): render/asset-rank/ (rerank.mjs + rank.py), a step in voice-film.yml
  after the picture plan. Per shot: the shot's words + the film's country, plus a world pool (city, streets, topic words in
  that country), Pixabay video and stills (Commons for R2), 412-531 candidates per shot on 993f09ea. Refused: licence, video
  <1920 px, stills <1600 px, unknown size, not landscape (w/h <1.3), watermark (CLIP), tags naming another country,
  near copies (perceptual hash). OpenCLIP ViT-B-32 (LAION) scores fit to the shot in its place and to the words heard,
  place (India vs other regions), era and quality, and pushes down off-world prompts (other money, a blonde European,
  the Amazon, abstract, film strip). Every pick has `why` (scores, provider, licence, counts) in media-C1.json; rank-C1.json.
  Proof, 993f09ea 0:00-3:00 (M2's beats.json, no brain, same queries both sides): proof/M3/993f09ea-eyes-before.jpg and
  -after.jpg (every shot's pick). Before: 19 of 29 off-topic by eye (Jupiter, waterfall, NASA, Pakistani notes, film strip,
  abstract ink, a New Zealand fire brigade, a jungle river, beach chair...), 8 blank (Commons previews failed: fixed, 330 px).
  After: 0 off-country, 0 dollars, 0 abstract or film strip, 0 Amazon, 0 blonde; 6 are India but not Bengaluru (above).
  Video 13/29 (45 %) -> 25/29 (86 %); every pick >=1080p video or >=1600 px still by the provider's own size.
  Time on 4 CPUs, pinned torch 2.7.1 + open_clip 2.29.0, cold cache: 205 s (1983 thumbnails, 7 unfetched; search 11 s,
  seeing 193 s, with the test suite running beside it); 22 s with a warm cache. A first cold run without download retries
  lost ~500 thumbnails and fell to 14/29 video: retries (3 tries) and a firmer video edge (0.5) fixed it. Model ~600 MB, cached.
  Not done: a trained aesthetic head (GitHub raw is blocked here; a CLIP quality prompt stands in), Internet Archive video
  (its public-domain films measured 640 px wide, 6 of 6 Prelinger items: they fail the 1080p gate), sequence continuity
  (item 5). Unverified: the workflow step on a GitHub runner (run here in the cloud container).
