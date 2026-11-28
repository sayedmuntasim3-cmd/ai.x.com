# First video plan (28 Nov 2026)

For the channel opening around 5 Dec 2026. Niche fixed: Engineering Disasters & Megaprojects, USA audience. **No view count is promised. Nobody can promise 1M views on a first video.** This plan only raises the odds, with evidence. Extends `VIRAL_STUDY.md`, `TOP200_WHY.md`, `REFERENCE_SCORECARD.md`, `SCORECARD_VERIFY_CHECKLIST.md`, `TOPIC_RANKING.md`; nothing is redone.

Tags: **[S]** sourced (number from the YouTube Data API through the Worker `GET /api/ideas` or `/api/videos`, 28 Nov 2026; raw rows in `data/first-video-search-2026-11-28.json`, or from the cited link) · **[E]** my estimate or opinion.

## 0. What was done, and what was not
- 50 radar searches (36-month window, each returns at most 20 videos): 30 niche queries and 20 topic queries. **467 unique videos** in the niche and its neighbours. YouTube then answered **429 (search quota)**, so 15 planned topic checks (Piper Alpha, Vajont, Apollo 1, Silver Bridge, Citicorp and others) were NOT searched; for them only the older `data/engineering-reference-videos.json` (2,734 videos) was grepped. [S]
- "Outlier" = views / the channel's average views per video (the radar's own definition, `engine/src/topic-radar.mjs`). It is not the channel median used in `ENGINEERING_MARKET_STUDY.md`; for small channels it is inflated. [S]
- The radar sorts by views, so it shows winners; losers are invisible. 183 of the 467 have 1M+ views. [S]
- **Not seen:** the first 30 s of any film, retention, CTR, subscriber counts (the route returns none; `channelAverage` stands in for channel size). Thumbnails were not re-read in this pass; thumbnail advice relies on `data/top200-thumbnail-tags.json` and `TOP200_WHY.md` §4. [E]
- Gaps: the radar returns many non-English and news-clip videos. Topic tables below keep English and US-relevant rows.

## 1. Can a brand-new channel hit 1M on video 1? What the data says
**Honest answer: it happens rarely and mostly by luck of the topic, not by craft.** Channels I could trace (uploads read with `GET /api/videos?handle=`):

| Channel | Uploads read | Best | Pattern [S] |
|---|---|---|---|
| Unthinkable Build (`@unthinkablebuild`) | 300 since 2025-04-15 | 3.71M "The $100B Plan to Bypass the Strait of Hormuz" (8 min, Mar 2026); day-2 upload got 0.53M | Mass upload (about one a day, many 0-view Shorts). 2 of 300 passed 1M, median long video 11.5k. A lottery with a fast first hit, not a repeatable first-video win. |
| Super Transports (`@SuperTransports`) | 127 since 2026-05-01 | 1.28M "World's Largest Oil Rig Battles Deadly North Sea Storms" (45 min) | 1 of 127 passed 1M, median 354 views. AI-style 45-minute "Inside…" series; one hit. |
| Dams explorer (`@damsexplorer`) | 300 since 2024-11 | 9.07M (13 min, Jul 2025); an earlier same-title upload got 0.07M | 2 of 300 passed 1M. Spectacle clip (water release), no narration story. |
| Built To Rot (radar row) | n/a | 138k at channel average 3.8k (36x) | Texas skyscraper "sank 16 inches… then they blew it up": a physical, visual, quantified oddity. |

Reading [E]:
1. In 4 of 4 traced cases the "first-video viral" is a **single outlier among many uploads**, never a clean first-upload 1M. I found **no verified case** of a brand-new faceless AI documentary channel whose first upload passed 1M (a web search returned only marketing pages; the one credible item is [404 Media on an AI true-crime series](https://www.404media.co/a-true-crime-documentary-series-has-millions-of-views-the-murders-are-all-ai-generated/), which is invented content and not a model for us). The owner's two examples were not named, so they could not be checked: **send the two links and this table gets two rows**.
2. What the hits share [S titles, E reading]: a **concrete physical stake** (a number: $100B, 140-foot, 16 inches, 27 deaths), a **current peg** (Hormuz, Lake Mead, a restart), one-line titles, 8-14 min for the small-channel hits, bold geography or machine in the thumbnail.
3. What does **not** transfer to us: mass-upload volume (hundreds of uploads), invented/AI footage presented as real, clip-reupload, news footage we cannot license. What transfers: the single-promise title, a number, a visible object, an 8-18 min length.
4. A new channel has no subscribers: the first-48-hour push comes from **search and suggested traffic on the topic**, so the topic must already have search demand. This is why §2 ranks demand before craft.

## 2. Topic demand vs. supply (last 36 months, radar rows) [S]
Views in M. Gap = whether a strong, recent, English **engineering** documentary exists. "PD pictures" = what open-licence archives hold (my knowledge of the archives, **not yet checked item by item: run the W10 archive check before the film starts**) [E].

| Topic | Best comparable videos | Gap [E] | Open-licence pictures [E] |
|---|---|---|---|
| Deepwater Horizon / Macondo | Only film-scene clips: Clip Empire 2.09M (8 min), 1.18M, 1.13M (Dec 2025, outlier 6-11x); best real documentary in `engineering-reference-videos.json`: ColdFusion 0.28M (20 min, Jul 2025, 0.3x) | **Large**: story proven by 4 movie clips at 1-2M, no real engineering film above 0.3M found | Strong: US Coast Guard / DVIDS fire and response photos, NOAA, NASA satellite oil images, Chemical Safety Board and Presidential Commission reports (US government, public domain) |
| Francis Scott Key Bridge (Dali, Mar 2024) | News clips 3.88M, 3.37M, 2.40M, 2.02M (Mar 2024); documentary Plainly Difficult 0.14M (0.4x, Mar 2026) | **Medium**: demand is news-driven; NTSB final report (board vote 18 Nov 2025, a mislabelled signal wire and no bridge risk assessment: [CBS](https://www.cbsnews.com/baltimore/news/ntsb-baltimore-francis-scott-key-bridge-report-maryland), [NTSB press release](https://www-s.ntsb.gov/news/press-releases/Pages/nr-20251110.aspx)) gives a fresh engineering story | Strong: NTSB report figures and photos, Coast Guard, Army Corps salvage (DVIDS) |
| Challenger | Plainly Difficult 0.63M (28 min, Sep 2023, 1.9x); Columbia: Documentary Overload 1.11M (54 min); 2025-26 Challenger videos 0.36-0.49M | **Medium**: huge brand, no modern film above 0.7M; 40+ years of competition | Strongest of all: NASA video and stills, Rogers Commission report (public domain) |
| SL-1 reactor accident (Idaho, 1961) | Storified 3.38M (13 min, Jan 2026, 2.5x, "America's Deadliest Nuclear Accident") | **Medium**: one proven video, others small | Good: DOE / Idaho National Lab photos, Wikimedia |
| Boston Big Dig ceiling collapse (2006) | Industrial Empire 0.88M (17 min, Sep 2026, 43x its channel); everything else under 0.1M | **Large** but demand proven by one spike only | Good: NTSB report figures, Wikimedia, state records |
| Texas freeze / grid failure 2021 | Dark Records 2.55M (16 min, Jun 2024); Grid Atlas 1.73M (Oct 2026); Dark Horizon 0.49M | **Medium**: no top engineering channel film in the sample | Medium: FERC/NERC report figures, NASA night lights, NOAA; few street photos free |
| Three Mile Island (and the 2027 restart) | WSJ restart 1.19M (6 min, 12.9x); Good Enough 1.32M (nuclear list, 14 min) | **Medium**: restart is a live peg | Good: NRC, DOE, Library of Congress |
| St. Francis Dam (1928) | 0.73M (Spanish), 0.45M (English, 30 min), PBS SoCal 0.11M; Practical Engineering's LA Aqueduct 4.31x [existing study] | **Large** in English | Medium: LoC, Wikimedia, LA archives |
| Hurricane Katrina levees | Extreme Earth 3.01M (63 min), Practical Engineering 2.05M (24 min, Jul 2026), Dark Horizon 1.82M | **Small**: recent top-tier film exists | Good: NOAA, USACE, FEMA |
| Hanford | Peter Santenello 1.39M (68 min, Nov 2026), PBS Terra 0.76M | **Medium** | Good: DOE, Hanford archive |
| Not recommended: Hyatt Regency (4 videos at 1.1-1.5M in 2024-26: saturated), Camp Century (B1M 2.05M, Real Engineering 1.0M, 4 more at 0.6-1.2M: saturated), Teton Dam (Practical Engineering 1.24M, Hydraulic Record 1.12M), I-35W (best 0.22M: **demand weak**, not a gap), Tacoma Narrows (best 0.12M on topic: weak), Quebec Bridge (under 0.2M). |

## 3. Top 10 candidates, ranked [E ranking, S evidence above]
Ranking weights: proven demand, the gap, open pictures, a one-line stake, a US viewer. This overrides `TOPIC_RANKING.md` (which put Katrina, Camp Century, Hanford first on "medium" evidence; fresh data shows Katrina and Camp Century are now well covered).
1. **Deepwater Horizon: the pressure test they misread**
2. **Key Bridge: one wire label** (NTSB final, Nov 2025)
3. **Challenger: the night before** (the Thiokol teleconference)
4. SL-1 (Idaho 1961): the reactor that killed its three operators
5. Boston Big Dig: the ceiling bolts held by glue (2006)
6. Texas freeze 2021: how close the grid came to a months-long blackout
7. Three Mile Island and the 2027 restart
8. St. Francis Dam (1928)
9. Katrina levees (only with a new angle: the design decisions, not the storm)
10. Hanford

## 4. The pick for video 1
**#1 Deepwater Horizon.** Reasons: (a) proven appetite, four film-scene clips at 1.1-2.1M in the last year [S]; (b) no real engineering documentary above 0.3M in the data [S, within the limits of §0]; (c) the engineering core is a **single, explainable decision** (the negative-pressure test read as a pass), which suits a 15-minute film with graphics we can draw ourselves; (d) the richest US-government picture set after NASA (USCG, NOAA, CSB, commission report); (e) 11 named human lives give emotional stakes with no invented footage. Risk [E]: dark subject, so some ads may be limited; and the BP/Transocean legal facts must be sourced to the commission and CSB reports only.
**Pick 2: Key Bridge**: freshest peg and a pure engineering twist, but news owns the footage and the one documentary I found under-performed (0.4x), so demand for a documentary treatment is unproven.
**Pick 3: Challenger**: safest visuals, largest brand; weaker gap.

## 5. Video 1 package: Deepwater Horizon
### 5 title options [E] (single promise, one number, no clickbait the film cannot keep)
1. The Test That Said "Safe": 11 Men Died Hours Later (Deepwater Horizon)
2. Deepwater Horizon: The Pressure Test They Misread
3. How One Misread Test Sank the Deepwater Horizon
4. 3 Warnings, 1 Wrong Answer: What Really Blew Up Deepwater Horizon
5. The Last 10 Hours of the Deepwater Horizon

Pick for the test: option 2 vs 1 (A/B in the first 24 h via YouTube Test & Compare, if the channel has it).

### 3 thumbnail concepts [E] (1280x720; real pictures only, no fabricated imagery)
- **A: The rig on fire.** Left 60%: the USCG night photo of the burning rig, cropped tight, high contrast. Right: a red circle around the derrick. Text (3 words): "THE TEST LIED". White heavy sans, black outline, bottom-right. Colours: black, orange fire, one red.
- **B: The gauge.** A clean drawn pressure gauge needle (our own graphic) in the red on a dark navy background, a small real photo of the rig as an inset in the top-right. Text (2 words): "IT PASSED". Yellow on navy.
- **C: Before/after.** Split frame: left, the rig at sunset, calm (Wikimedia/NOAA); right, the same rig burning. A white arrow across the middle. Text (4 words): "10 HOURS LATER. 11 DEAD." Keep text on the right, under the flame.
Rules from `TOP200_WHY.md` §4: 1-4 words, adds to the title, no channel logo, no accusing words. Fit at 168x94 phone size: the check before upload.

### First 30 seconds: beats [E]
- 0-3 s: black, a single low rumble; real photo of the rig at night. Narrator: "April 20th, 2010. A pressure test said the well was safe."
- 3-9 s: cut to the control-room drawing of the test, the number highlighted. "It was not. The men on that rig read the numbers two different ways, and they chose the wrong one."
- 9-18 s: hard cut to the rig on fire (USCG), the name line "11 men did not come home" with source chip.
- 18-27 s: map (Gulf, 41 miles off Louisiana), then a one-line promise: "In the next 15 minutes you will see the one decision that turned a routine job into America's worst oil spill."
- 27-30 s: title card, cut to the start of the story. Nothing generic, no "welcome to the channel".
(Rules 1-4 of `REFERENCE_SCORECARD.md` §5: a cut every 6 s, a map before 1:30, the promise before 0:30, a sourced stake in the first 3 min.)

### Chapter structure [E] (one per 2-3 min, each a step of the case)
0:00 The test said safe · 0:35 A well three weeks late · 2:30 The cement nobody tested · 5:00 The pressure test that did not add up · 7:30 The last 10 minutes · 10:00 Why the blowout preventer did not save them · 12:30 What changed, and what did not · 14:00 Sources and what we could not confirm.

### Target length [E / S]
**14-16 minutes.** In the radar set the 1M+ videos have a median length of 21 min [S] and the small-channel hits are 8-14 min [S]; the existing study found length does not separate winners from losers (`ENGINEERING_MARKET_STUDY.md` §1). For a first film with no audience, shorter is safer for average view duration.

### Best upload day and time (US) [E, not sourced]
Tuesday or Wednesday, **2-3 pm US Eastern** (11 am-noon Pacific): gets the after-school/after-work and evening Eastern viewers inside the first 4 hours. This is general creator practice, **not measured here**; the channel's own Analytics "When your viewers are on YouTube" replaces it after 2-3 films. Opening date around 5 Dec 2026 is a Saturday, so first film Tuesday 8 Dec is my suggestion; do not publish into a holiday week.

### 48-hour targets [E: YouTube gives no public benchmark for a new channel; adjust after the first week]
| Metric | Floor | Good | Where to read it |
|---|---|---|---|
| Impressions CTR (first 48 h) | 4% | 6-8% | Studio > Reach |
| Average % viewed | 40% | 50%+ | Studio > Engagement |
| Retention at 0:30 | 75% | 85% | retention curve |
| Retention at 3:00 | 55% | 65% | retention curve |
| Returning-view/likes per 100 views | 3 | 5 | Studio |
A low CTR with good retention means fix the thumbnail/title (one swap, once); good CTR with a 30 s cliff means fix the hook. Do not change both at the same time.

## 6. Practice-film scorecard (the Boss judges every film; 0-2 each, pass 22 of 30) [E, built on `REFERENCE_SCORECARD.md` §5 and the verify checklist]
2 = meets the number, 1 = close, 0 = misses.
| # | Measure | 2 points when |
|---|---|---|
| 1 | Hook promise | The title's promise is spoken or shown before 0:30, and a sourced number/date/count is in the first 30 s |
| 2 | Cold open | The first frame is a real picture of the event, no logo, no "welcome" |
| 3 | Cut rate | A cut at least every 6 s in the first minute; no shot over 6 s in the first 3 min |
| 4 | Picture relevance | Every scene shows what the narration says; zero unrelated pictures in a spot check of 20 random shots |
| 5 | Picture variety | No picture repeats; archive/own graphics at least 50% of the first 3 min; no stock filler |
| 6 | Graphics | A map or diagram by 1:30 and at least one per chapter; each explains, none decorates |
| 7 | Motion | Zoom/pan directions vary; no two neighbouring shots use the same move |
| 8 | Pacing | A new fact, question or image every 15-20 s; no stretch of 30 s with nothing new |
| 9 | Narration | Natural pace, no filler words, no silence over 0.8 s, pronunciation of names checked |
| 10 | Sound | Music under speech at least 12 dB lower; -14 LUFS ±1; a sound effect on each key beat |
| 11 | Captions/source chips | Every archive shot carries a source chip; captions readable at phone size and never cover the subject |
| 12 | Story shape | A question in the first 3 min, a reveal at about 60% of the length, no repeated sentence |
| 13 | Ending | The last 30 s answers the title's question in one sentence and names at least 3 sources; no sponsorship, no "like and subscribe" in the first 10 min |
| 14 | Accuracy | Every claim traces to the ledger; no fabricated image presented as real |
| 15 | Packaging | Title, thumbnail (readable at 168x94) and chapters written by us match what the film delivers |
Any 0 on 1, 4, 14 fails the film whatever the total.

## 7. Next steps for the Boss [E]
1. Run the W10 archive check for Deepwater Horizon (USCG/DVIDS, NOAA, CSB, commission figures, Wikimedia) and for Key Bridge (NTSB, DVIDS) before choosing.
2. Ask the owner for the two AI-film channel links; add them to §1 and re-test the claims there.
3. After the YouTube search quota resets, run the 15 skipped topic checks (§0) and re-rank.
4. Make one practice film on pick 1 at 14-16 min and score it with §6 before the real upload.
