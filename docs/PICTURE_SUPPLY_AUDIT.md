# Picture supply audit (27 Nov 2026)

Film audited: **ccd86532** (the Tacoma Narrows film, 2,499 s, 556 shots; the contact-sheet film). Data: the
`voice-ccd86532-…-film` artifact of run 45931770358 (`film.timeline.json`, `film.report.json`). Film 41b3b491's own shot plan
is not available (only its script artifact), so numbers are for ccd86532. Re-run on any film:
`node local/picture-audit.mjs film.timeline.json film.report.json`.

## The numbers (before)
| | shots | share |
|---|---|---|
| designed text/graphics (no picture needed) | 93 | |
| shots that need a picture | 463 | |
| picture found | 249 | 54% |
| **no picture, a text card stands in** | **214** | **46%** (R2 history 65%, R3 illustration 37%) |
| brief is one bare word ("thin", "sang", "era") | 254 | 55% of picture shots |
| clips by source | Pixabay 199 (80%), Wikimedia 42, Met 4, NASA 3, other 1 | LoC, Europeana, DVIDS, NARA, Smithsonian: 0 |
| real-history (R2) shots answered by stock footage | 2 | 1% |
| clips used more than once | 55 of 249 | 194 distinct files |
| critic | block: only 47% of the film moves (needs 55%) | 222 renderer warnings (214 "no clip picked") |

Examples of picks that look right to a search engine and are wrong: "R2 Scanlan" -> Teresa Scanlan at a convention (a beauty
queen, not the bridge engineer), "R2 morning, 1940s" -> a foggy Finnish river, "R2 fiberglass" -> a Moscow lamppost.

## Cause
The shot plan sends **bare keywords with no film subject** as queries. Archives answer a bare word with unrelated items
("era" -> "This Is a New Era for the Department of …", "apart" -> a black hole); Pixabay answers with generic footage; the whole-word
filter then empties the rest, and a text card stands in. The subject ("Tacoma Narrows Bridge") appears in no query.

## Per role (roster ROLE_STATUS)
Evidence available here is the report and timeline only; OpenCLIP scores and `beats.json` are in the 1.7 GB `prep-` artifact, which
I did not open. "Unproven" means exactly that, not "did not run".

| Role | Verdict | Evidence |
|---|---|---|
| footage-asset-strategist | **ran, weak: fix** | 55% of picture briefs are one bare word; the era is the only context. Fix: query ladder (this PR). |
| footage-provider-coverage | **weak: fix** | 80% Pixabay stock, 0 from LoC/Europeana/DVIDS/NARA/Smithsonian (keys were missing at the time; LoC is blocked from GitHub addresses, see PR #88). 65% of history shots had no picture. |
| footage-exact-match / footage-scene-fit (OpenCLIP) | **unproven** | The wrong picks above (a Finnish river for a 1940s morning) say that nothing off-subject was rejected; scores and the shots under the floor are in the prep artifact. Next step: add the per-shot score to `film.report.json`. |
| footage-release-risk | ran | all 249 clips carry a licence record and page URL; faces/brands/plates are not checked (roster says so). |
| footage-duplicate-assets | ran, weak | 55 clips reused (22%); critic: 5 repeats inside the 10-minute window. |
| cinematography-visual-director | ran | 197 designed moments (4.7 per minute), 89 kinetic-type cards; no fallback when a shot had nothing: it became a card. Fix: held strong pick (this PR). |
| cinematography-shot-variety | **weak** | critic blocks: 47% of the film moves, 55% needed. |

## Fix in this PR
1. **Query ladder** (`engine/src/picture-ladder.mjs`, footage-asset-strategist): bare keyword anchored to the film's subject
   ("Tacoma Narrows Bridge thin"), then the subject, subject + era, engineering category ("suspension bridge", "bridge collapse"),
   era + category, and the bare word last. `chapterMedia` takes `topic`; voiceover and script films pass the film's topic.
2. **Held strong pick** (`holdWeak`, cinematography-visual-director): a shot still without a picture takes the nearest strong
   picture of its chapter; the row says `reused` and its trace says `held`, so the run log shows it. No black or random card.
3. Audit script `local/picture-audit.mjs`.

## After (simulation, same 24 shots, free no-key providers only)
24 of the 214 no-picture shots (every 9th), searched live with Wikimedia, NASA, Internet Archive, Met, ARTIC, Openverse, whole-word on,
no Pixabay/LoC/DVIDS (not reachable from here):

| | picture found | relevant to the bridge* |
|---|---|---|
| before (bare keywords) | 14/24 | **4/24** (the rest: "Supermassive black hole rips star apart" …) |
| after (ladder) | 24/24 | **17/24** |

*heuristic: the picture's title or the winning query names the bridge or one of its parts. The remaining 7 are generic bridge
pictures from the category rung. Not a full-film re-run; the next real film gives the honest number.

## Sources not added, and why
- **DPLA**: needs a free key (`DPLA_API_KEY`); its API gives a thumbnail and a landing page, not a full-size file, so items fall
  under the 1280 px floor. Not built until someone confirms full-size access.
- **Flickr Commons**: needs `FLICKR_API_KEY` (the archive search already reads it). **USGS / NOAA / FEMA / NTSB**: no image API;
  their public-domain photos are reached through Wikimedia Commons, LoC and NARA, already searched. **US Army Corps of Engineers**:
  published on DVIDS (added). **HABS/HAER**: in the LoC photo search (LoC blocks GitHub addresses; the gate reports it).
  **Prelinger films**: the Internet Archive provider already searches them.
