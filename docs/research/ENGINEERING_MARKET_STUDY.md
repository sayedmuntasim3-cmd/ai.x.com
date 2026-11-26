# Engineering Disasters & Megaprojects: market study (W3 + W4, 26 Nov 2026)

Niche (fixed): Engineering Disasters & Megaprojects, for an ordinary US audience. Directive: `docs/missions/ENGINEERING_DOCUMENTARY_MASTER_ROADMAP.md` (W3, W4). Extends `VIRAL_STUDY.md` and `tools/research/` (no second copy). No video was downloaded. No private analytics were used or invented. **No view count is promised by anything here.**

## 0. What was done, and what was not
- **29 channels, 138 long videos (8+ min)**, all checked on 2026-11-26. Each channel's last 25 uploads were read with `GET /api/videos?handle=` (cheap; no search quota). Raw data: `data/engineering-uploads.json` (563 long uploads of the 29 channels) and `data/engineering-videos.json` (the 138 listed, with my notes). Tools: `tools/research/engineering-handles.mjs` (collect), `tools/research/engineering-table.mjs` (renders section 3).
- **Outlier score** = the video's views ÷ the median views of the same channel's long uploads (8+ min) in that 25-upload window that are older than 21 days. Class: **exceptional** ≥ 2.0×, **above** 1.25–2.0×, **typical** 0.7–1.25×, **under** < 0.7×. Class is relative to the channel, not to raw views.
- **Thumbnails**: all 138 were fetched (320 px, `i.ytimg.com`) and looked at in contact sheets. Thumbnail notes are my reading.
- **Facts** (from the API): views, likes, comments, date, length, chapters. **My reading** (marked as such): thumbnail notes, angle, "why people click", and every "under-performer" explanation. Hypotheses are never facts.

### Known biases and gaps (read before using any number)
1. **Search-selection bias.** I chose channels from my own memory and guessed handles; 30+ guesses failed (404/502) and were dropped. Result: mostly large, surviving, English-language channels. Small/rising channels are thin (Mega Projects Explained, City Beautiful, RMTransit, Engineering with Rosie, Brendon Peterson). I may have missed rising disaster/megaproject channels.
2. **Video-selection bias.** Inside each channel I listed the top, bottom and some middle videos by outlier score, so extremes are over-represented (35 exceptional, 42 under of 138). Counts by class say *which angles appear at each extreme*, not how often an angle wins.
3. **The baseline is the channel's whole last-25 window**, which often mixes topics (Wendover: business and logistics; Technology Connections: appliances). "Comparable uploads" means "same channel, same length class", not same topic.
4. **Views are not age-adjusted in the score.** A video from 2023 has had years to collect views against a baseline of newer ones (Disaster Breakdown, LEMMiNO, Mustard). Views/day is shown too, but it is inflated for videos under ~3 weeks old. Rows with age < 21 days, a channel median < 5,000 views, or < 10 comparable uploads are marked **low** confidence; age < 60 days, < 18 comparable uploads or age > 1,500 days: **medium**.
5. **Not available from the route:** subscriber counts (the route returns none), description text, impressions, click-through rate, retention. The "Subs" the directive asks for is replaced by a **size tier by median views** (my label). Adding `statistics.subscriberCount` to `worker/youtube.mjs` (`channels.list` already called) would fix this; not done here (outside this milestone's files).
6. **Mega Projects Explained** has a median of 707 views, so a 126× outlier is about 90k views. Ratios on tiny channels are noise; they are listed as an example of a small channel, with low confidence.
7. Off-niche rows (marked `off-niche` in the angle column) are kept on purpose as format references (host-led science, politics, transit advocacy); they are excluded from the angle counts.
8. The first 30 seconds, pacing, music and what the narrator actually says were **not seen**. "Why people click" is about title + thumbnail promise only.

## 1. Headline findings (facts from this sample; reading is marked)
1. **Class is not about niche size.** The same format produces exceptional and under videos on the same channel, so the topic and packaging matter more than the channel's format alone. Example: Practical Engineering ranges from 4.7× ("Stopping the Unstoppable") to 0.49× ("Bridge Demolition is Complicated").
2. **Failure stories are the most reliable middle, not the top.** Of the 37 failure-angle rows, 8 are exceptional, 9 above, 11 typical, 9 under (section 3 counts). Failure videos on disaster channels cluster near 1×, rarely collapsing to 0.2×. Hidden-system and mystery angles reach the top more often relative to their number: mystery 3 exceptional + 1 above of 4; hidden-system 7 exceptional of 19.
3. **10–25 minutes is the working length.** Median length by class is 17–19 min for every class; length does not separate winners from losers. Very long videos (40–110 min) appear in both classes (Disaster Breakdown 5.2× at 44 min and 0.46× at 57 min).
4. **Chapters are not the difference.** 23% of exceptional and 24% of under rows have chapters.
5. **A question mark is not a recipe.** 5 of 35 exceptional titles and 8 of 42 under titles contain "?".
6. **A superlative without stakes did not carry a video.** Practical Engineering "Fixing the Most Dangerous Dam in the World" (thumbnail: "WORLD'S MOST DANGEROUS DAM") is 0.58× on its own channel.
7. **Hard numbers and named human cost recur in the top rows (my reading):** "27/31 DESTROYED" (Real Engineering 2.47×), "Every Corner Cut Led to 27 Lives Lost" (Plainly Difficult 2.37×; the 65-lives sibling 2.16× in 18 days), "15 YEARS LATER" (The B1M Fukushima 2.58×), the ISS "DAY 1 vs DAY 4,745" before/after (Real Engineering 2.18×).
8. **An object the viewer already lives with recurs among Practical Engineering's best:** roads (washboards 2.83×), water (LA Aqueduct 4.31×), neighbourhood flood control (retention ponds 2.11×), the power grid (transmission towers: 1.57M views in 8 days, 1.31× and rising), gas meters (pressure regulators 1.68×).
9. **Plain low-budget illustration wins on disaster channels.** Disaster Breakdown and Plainly Difficult use CGI illustrations, news footage and one-line titles; they are 0.25–5.2× and 0.26–2.4×. Production gloss is not what separates their winners from their losers.
10. **Mentour Pilot (44–51 min), the B1M and Practical Engineering are already at 1M+ median.** An unknown channel has no such audience: an equal topic will not give equal views. The study measures relative performance only.

## 2. How to read the tables
Outlier ×: 1.0 = the channel's own median for long uploads. Ages and views are as of 2026-11-26. "Fit": core = engineering/disasters/megaprojects/infrastructure channel; adjacent = covers the niche sometimes (aviation disasters, transit, nuclear, history); reference = format reference only. Rows tagged `off-niche` in the angle column are not about the niche.

## 3. The data: channels and videos

### Channels (29)

| Channel | Niche fit | Size tier (by median views of long uploads) | Long uploads in window | Median views | Videos listed |
|---|---|---|---|---|---|
| Practical Engineering | core | large | 24 | 1.2M | 12 |
| The B1M | core | large | 13 | 1.2M | 10 |
| Real Engineering | core | medium | 14 | 745k | 8 |
| Wendover Productions | adjacent | large | 25 | 1.1M | 7 |
| Mentour Pilot | adjacent | large | 10 | 1.1M | 6 |
| Disaster Breakdown | adjacent | medium | 23 | 283k | 8 |
| Plainly Difficult | core | medium | 23 | 265k | 10 |
| Stewart Hicks | core | medium | 25 | 636k | 8 |
| Mega Projects Explained | core | very small | 25 | 707 | 9 |
| Fascinating Horror | adjacent | medium | 25 | 504k | 5 |
| Half as Interesting | adjacent | medium | 13 | 632k | 4 |
| Kyle Hill | adjacent | medium | 14 | 479k | 5 |
| Mustard | adjacent | large | 19 | 7.1M | 5 |
| SmarterEveryDay | adjacent | large | 25 | 1.9M | 5 |
| Adam Something | adjacent | medium | 23 | 596k | 4 |
| Technology Connections | adjacent | large | 25 | 2.1M | 4 |
| City Beautiful | adjacent | small | 22 | 98k | 3 |
| RMTransit | adjacent | small | 19 | 29k | 3 |
| Not Just Bikes | adjacent | large | 5 | 1.0M | 2 |
| Thunderf00t | adjacent | medium | 23 | 265k | 3 |
| LEMMiNO | reference | large | 21 | 8.6M | 1 |
| Veritasium | adjacent | large | 6 | 22.2M | 1 |
| Mark Felton Productions | adjacent | medium | 20 | 396k | 3 |
| Engineering with Rosie | core | small | 4 | 158k | 2 |
| ColdFusion | adjacent | large | 20 | 1.1M | 2 |
| RealLifeLore | adjacent | large | 25 | 1.3M | 2 |
| Brendon Peterson | adjacent | small | 12 | 11k | 3 |
| Kurzgesagt – In a Nutshell | reference | large | 6 | 12.8M | 1 |
| Economics Explained | adjacent | medium | 25 | 768k | 2 |

### Videos

Columns: published; views; minutes; views/day (views ÷ age in days); outlier = views ÷ the channel's median of its own long uploads older than 21 days; class; likes/comments; chapters parsed from the description; title structure (automatic tags); thumbnail (my reading); angle; confidence. Checked date for every row: 2026-11-26.

#### Practical Engineering (median 1.2M, 23 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Stopping the Unstoppable](https://youtu.be/-17mPnFxi30) `-17mPnFxi30` | 2026-09-01 | 5.6M | 16 | 66k | 4.7× | exceptional | 62k/3.0k | – | plain statement | train + yellow device, no text, bright photo | hidden-system | high |
| [The Los Angeles Aqueduct is Wild](https://youtu.be/PhW2BjFQCZM) `PhW2BjFQCZM` | 2026-03-17 | 5.2M | 23 | 20k | 4.31× | exceptional | 84k/4.5k | – | plain statement | aerial concrete aqueduct chute, no text | megaproject | high |
| [Why Roads Get Washboards](https://youtu.be/3YvwqMDDb3k) `3YvwqMDDb3k` | 2026-06-02 | 3.4M | 18 | 19k | 2.83× | exceptional | 82k/4.7k | – | how/why/what | split: dirt road photo + mechanism, no text | everyday-curiosity | high |
| [Do Retention Ponds Actually Work?](https://youtu.be/xPksDeGoh4E) `xPksDeGoh4E` | 2026-02-03 | 2.5M | 18 | 8.6k | 2.11× | exceptional | 64k/2.0k | – | question, how/why/what | cutaway pond diagram on photo, no text | hidden-system | high |
| [Recreating an Ancient Pump (with no moving parts)](https://youtu.be/7OHCOFFUamQ) `7OHCOFFUamQ` | 2026-01-06 | 2.4M | 13 | 7.5k | 2.03× | exceptional | 76k/2.5k | – | plain statement | real water-filled glass model, no text | everyday-curiosity | high |
| [The Hidden Engineering of Pressure Regulators](https://youtu.be/5_B1Mq02wcI) `5_B1Mq02wcI` | 2026-10-06 | 2.0M | 17 | 40k | 1.68× | above | 30k/882 | – | plain statement | red regulator + gas meter, arrow, WHAT IS THAT? | hidden-system | medium |
| [The Wild Story of the Teton Dam Failure](https://youtu.be/J7ieKmP96Hc) `J7ieKmP96Hc` | 2026-04-21 | 1.2M | 19 | 5.7k | 1.03× | typical | 35k/1.2k | – | plain statement | aerial failure photo, TETON DAM FAILURE | failure | high |
| [The Physics Behind the Thumb Trick](https://youtu.be/fKuIJ_z2Y6A) `fKuIJ_z2Y6A` | 2026-05-05 | 1.1M | 18 | 5.2k | 0.89× | typical | 31k/1.7k | – | plain statement | hose + pressure gauge, MORE FLOW? | everyday-curiosity | high |
| [So You Want to Build a Tunnel...](https://youtu.be/Ssw5bdx1HKw) `Ssw5bdx1HKw` | 2026-02-17 | 889k | 21 | 3.2k | 0.74× | typical | 35k/2.0k | – | plain statement | brick tunnel, host face in the light, no text | megaproject | high |
| [This Spillway Failed On Purpose](https://youtu.be/UF63eFJmbrQ) `UF63eFJmbrQ` | 2026-04-07 | 808k | 19 | 3.5k | 0.67× | under | 29k/853 | – | plain statement | aerial dam, red circle on the damage, no text | failure | high |
| [Fixing the Most Dangerous Dam in the World](https://youtu.be/DWLcmq_DiaA) `DWLcmq_DiaA` | 2026-05-19 | 692k | 22 | 3.6k | 0.58× | under | 27k/1.1k | – | plain statement | soldiers at dam, 4 words WORLD'S MOST DANGEROUS DAM | failure | high |
| [Bridge Demolition is Complicated](https://youtu.be/7oi4yMr8Rjk) `7oi4yMr8Rjk` | 2026-06-16 | 593k | 18 | 3.6k | 0.49× | under | 26k/1.0k | – | plain statement | demolition rig over river, 2 words | hidden-system | high |

#### The B1M (median 1.2M, 8 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The Race to Demolish Fukushima](https://youtu.be/aBKNGIvw4XM) `aBKNGIvw4XM` | 2026-10-21 | 3.1M | 20 | 89k | 2.58× | exceptional | 24k/1.6k | 9 | plain statement | reactor before/after, 15 YEARS LATER | failure | low |
| [The Skyscraper That's Dividing Europe](https://youtu.be/h8wpG_A3_6g) `h8wpG_A3_6g` | 2026-10-14 | 1.6M | 17 | 37k | 1.28× | above | 16k/1.5k | 13 | plain statement | tower render + green balconies, no text | build-politics | low |
| [This Will Be The World’s Largest Urban Park](https://youtu.be/VpuWi9a3MrE) `VpuWi9a3MrE` | 2026-11-09 | 1.4M | 16 | 82k | 1.11× | typical | 18k/1.5k | 8 | plain statement | night aerial park, 16KM² number | megaproject | low |
| [London's New Supertall Skyscraper is Coming](https://youtu.be/Pybe5h1DB5w) `Pybe5h1DB5w` | 2026-11-03 | 1.3M | 19 | 59k | 1.09× | typical | 13k/980 | 8 | plain statement | two towers, big ONE LONDON | megaproject | low |
| [Turkey's $25BN Nuclear Megaproject Built By Russia](https://youtu.be/Ws-YNxTdZJQ) `Ws-YNxTdZJQ` | 2026-10-26 | 1.2M | 14 | 40k | 1× | typical | 10k/1.5k | 12 | number/money | nuclear dome under construction, flags, no text | megaproject | low |
| [Los Angeles has a $1.8BN Olympic Headache](https://youtu.be/fqKYSxqJoN8) `fqKYSxqJoN8` | 2026-11-18 | 1.1M | 17 | 155k | 0.94× | typical | 11k/684 | 9 | number/money | graffiti tower, one word ABANDONED. | failure | low |
| [Inside the World's Longest-Running Construction Project](https://youtu.be/gVlrhYh8vU4) `gVlrhYh8vU4` | 2026-10-22 | 1.0M | 28 | 29k | 0.82× | typical | 16k/933 | 13 | plain statement | spires, 144 YEARS IN THE MAKING. | megaproject | low |
| [Hong Kong Is Building an $8BN Groundscraper](https://youtu.be/cYhGqtQELd0) `cYhGqtQELd0` | 2026-10-30 | 841k | 11 | 32k | 0.69× | under | 10k/470 | 5 | number/money | groundscraper render, no text | megaproject | low |
| [Russia’s Desperate Fight to Stay in the Space Race](https://youtu.be/lcv-M6qBsdA) `lcv-M6qBsdA` | 2026-11-16 | 644k | 14 | 69k | 0.53× | under | 10.0k/710 | 8 | plain statement | rocket on pad, dark, no text | megaproject | low |
| [Why This $13BN Desert Railway Will Transform Abu Dhabi](https://youtu.be/nUwrjuozT5E) `nUwrjuozT5E` | 2026-11-11 | 469k | 14 | 33k | 0.39× | under | 8.1k/546 | 7 | how/why/what, number/money | map, 900KM number | megaproject | low |

#### Real Engineering (median 745k, 13 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The Plane That's 38% Nose](https://youtu.be/6B96xetwrqI) `6B96xetwrqI` | 2026-09-26 | 2.7M | 20 | 44k | 3.57× | exceptional | 29k/1.3k | – | number/money | jet render, SKUNK WORKS' NEWEST CREATION | design-tech | medium |
| [Why America’s Tank Failed in Ukraine](https://youtu.be/n7Q1vubN4w8) `n7Q1vubN4w8` | 2026-02-21 | 1.8M | 23 | 6.6k | 2.47× | exceptional | 46k/5.7k | – | how/why/what | burning tank, 27/31 DESTROYED | failure | medium |
| [How We Built The ISS](https://youtu.be/j0ZZfIz9R1I) `j0ZZfIz9R1I` | 2025-12-06 | 1.6M | 36 | 4.6k | 2.18× | exceptional | 32k/1.2k | – | how/why/what | ISS day 1 vs day 4,745 | megaproject | medium |
| [How NASA Discovered a Military Base under Greenland](https://youtu.be/wKP6tYA6ds4) `wKP6tYA6ds4` | 2026-03-21 | 996k | 22 | 4.0k | 1.34× | above | 24k/1.1k | – | how/why/what | jet + ice base, 60 YEARS UNDER THE GREENLAND ICE | mystery | medium |
| [Reading StarCloud’s Whitepaper So You Don’t Have To](https://youtu.be/_qpdUNMt2yg) `_qpdUNMt2yg` | 2026-06-27 | 746k | 21 | 4.9k | 1× | typical | 33k/3.8k | – | plain statement | window detail, This Is DUMB, yellow circle | design-tech | medium |
| [The Kurzgesagt Situation is Insane](https://youtu.be/OX1yHmeLPy8) `OX1yHmeLPy8` | 2026-08-01 | 664k | 12 | 5.7k | 0.89× | typical | 50k/4.8k | – | plain statement | channel-drama collage, text | off-niche | medium |
| [The Dark Side of the World’s Lightest Structural Metal](https://youtu.be/ZewlcJsfbn8) `ZewlcJsfbn8` | 2026-06-06 | 582k | 15 | 3.4k | 0.78× | typical | 19k/542 | – | plain statement | rod + burning cathedral, HISTORY'S DEADLIEST METAL? | failure | medium |
| [Sagrada Familia - Full Documentary](https://youtu.be/UiPJbxryrkU) `UiPJbxryrkU` | 2026-08-02 | 465k | 24 | 4.0k | 0.62× | under | 21k/1.0k | – | subtitle | red Sagrada, 'Finally, after 144 years.....' | megaproject | medium |

#### Wendover Productions (median 1.1M, 23 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [How the Channel Tunnel Works](https://youtu.be/gLkbK8h_9fc) `gLkbK8h_9fc` | 2026-09-04 | 2.4M | 23 | 29k | 2.23× | exceptional | 24k/1.6k | – | how/why/what | map + tunnel cutaway, THE TUNNEL'S BROKEN PROMISE | megaproject | high |
| [How Red Bull Built Its Empire](https://youtu.be/gokC5fXEM00) `gokC5fXEM00` | 2026-02-24 | 1.8M | 17 | 6.5k | 1.68× | above | 36k/1.4k | – | how/why/what | Red Bull collage, no text | off-niche | high |
| [How the Iran War Spiked Oil Prices](https://youtu.be/5qjvluMnyAw) `5qjvluMnyAw` | 2026-04-17 | 1.5M | 17 | 6.9k | 1.45× | above | 22k/1.2k | – | how/why/what | oil map, THE LOGISTICS OF OIL | hidden-system | high |
| [How Car Dealerships Scam America](https://youtu.be/GREaEG_0Xcw) `GREaEG_0Xcw` | 2026-05-05 | 1.2M | 18 | 5.9k | 1.14× | typical | 30k/2.9k | – | how/why/what | dealership, 100% CHANCE OF RIPPING YOU OFF | off-niche | high |
| [What Went Wrong With California High Speed Rail](https://youtu.be/2NK0wBBZZ24) `2NK0wBBZZ24` | 2026-05-20 | 971k | 21 | 5.1k | 0.92× | typical | 25k/5.2k | – | how/why/what | concrete viaduct, WHAT WENT WRONG? | build-politics | high |
| [California's Water Problem](https://youtu.be/GeYvNkaLAqA) `GeYvNkaLAqA` | 2026-03-10 | 885k | 20 | 3.4k | 0.84× | typical | 20k/1.5k | – | plain statement | LA concrete channel, CALIFORNIA'S BROKEN WATER SYSTEM | hidden-system | high |
| [Why American Houses Are So Flimsy](https://youtu.be/VuliaG_-uao) `VuliaG_-uao` | 2026-07-15 | 766k | 14 | 5.7k | 0.72× | typical | 21k/2.6k | – | how/why/what | timber vs brick house, text labels | build-politics | high |

#### Mentour Pilot (median 1.1M, 7 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [How Was This Even LEGAL?! / The Tragic Story of MK Airlines Flight 160](https://youtu.be/C5QpS0sZVf0) `C5QpS0sZVf0` | 2026-09-12 | 1.5M | 44 | 20k | 1.36× | above | 24k/1.4k | – | question, how/why/what, number/money, subtitle, CAPS word | 747 CGI, HE WARNED THEM! | failure | low |
| [This Should NEVER Have Happened!! / The Insane Story Of Air Niugini Fl](https://youtu.be/Q_SQC-hzI70) `Q_SQC-hzI70` | 2026-10-10 | 1.2M | 51 | 26k | 1.08× | typical | 21k/1.1k | – | number/money, subtitle, CAPS word | 737 in sea CGI, THEY FILMED IT?! | failure | low |
| [There’s NOTHING The Pilots Could Have Done… / The Final Minutes Of El ](https://youtu.be/LT2F4PUlDnI) `LT2F4PUlDnI` | 2026-10-31 | 1.1M | 44 | 44k | 1× | typical | 19k/1.5k | – | number/money, subtitle, CAPS word | 747 night CGI, PASSED INSPECTION? | failure | low |
| [“I Can’t FLY ANYMORE…” / The Nightmare of Swissair 551](https://youtu.be/fI_xj5sXuc0) `fI_xj5sXuc0` | 2026-10-24 | 817k | 35 | 25k | 0.73× | typical | 18k/1.1k | – | number/money, subtitle, CAPS word | host face + pilot, TOXIC COCKPIT | failure | low |
| [Why Did He LIE On The Paperwork? / The Shocking Story Of Bering Air 44](https://youtu.be/5axb7MVMyrI) `5axb7MVMyrI` | 2026-11-07 | 690k | 35 | 38k | 0.62× | under | 17k/949 | – | question, how/why/what, number/money, subtitle | wreck on ice CGI, AGAINST REGULATION | failure | low |
| [Miami Amazon Crash UPDATE! / Pilots React Live](https://youtu.be/Fa6w_q_5zRA) `Fa6w_q_5zRA` | 2026-09-09 | 467k | 48 | 6.0k | 0.42× | under | 8.4k/1.2k | – | subtitle, CAPS word | livestream crash CGI, MIAMI CRASH | failure | low |

#### Disaster Breakdown (median 283k, 22 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Did This Small Mistake Kill Everyone? - The Heartbreaking Story of Air](https://youtu.be/wSmtnuFoAv0) `wSmtnuFoAv0` | 2024-05-17 | 1.5M | 44 | 1.6k | 5.22× | exceptional | 32k/3.1k | 11 | question, number/money, subtitle | burning airliner illustration, quote "I'm Sorry" | failure | high |
| [Cruel False Hope ☂️ The Awful Story of the New York Mid-air Collision ](https://youtu.be/Jl29NPpEkT8) `Jl29NPpEkT8` | 2023-12-19 | 1.3M | 67 | 1.2k | 4.71× | exceptional | 24k/2.1k | 12 | subtitle, CAPS word | airliner illustration, Who was Wrong? | failure | high |
| [A Desperate Crew and Their Awful Decisions - The Extraordinary Tale of](https://youtu.be/rPQZbbgr4w8) `rPQZbbgr4w8` | 2025-02-10 | 736k | 61 | 1.1k | 2.61× | exceptional | 16k/1.5k | 7 | number/money, subtitle | liner over waves, quote, channel logo | failure | high |
| [The Toilet was Leaking??  What The Heck Happened to Monarch Airlines F](https://youtu.be/46ozekMtejw) `46ozekMtejw` | 2024-04-13 | 436k | 29 | 456 | 1.54× | above | 13k/910 | 6 | question, number/money, subtitle, CAPS word | plain airliner, no text | failure | high |
| [Blowing on the Winds of Death 🌬️ USAir 1016 (and Malév 731)](https://youtu.be/98DZU41cgYQ) `98DZU41cgYQ` | 2026-02-09 | 202k | 53 | 697 | 0.71× | typical | 7.6k/763 | 10 | number/money | airliner + cat meme, It's Heckin Wimdy | failure | high |
| [A Little Rain Hurt Nobody, Right? The Weird Case of British Airtours F](https://youtu.be/wCB921utTwU) `wCB921utTwU` | 2026-05-23 | 130k | 57 | 697 | 0.46× | under | 6.4k/661 | – | question, number/money | airliner + fire, text fragments | failure | high |
| [Andes Miracle - Why The Plane Crashed (A Deep Dive into Uruguayan Air ](https://youtu.be/Xj7HBWjFl4U) `Xj7HBWjFl4U` | 2026-03-23 | 93k | 36 | 378 | 0.33× | under | 5.2k/475 | – | number/money, subtitle | plane in snow, Uncovering The Mystery | failure | high |
| [737 Down Over ABQ - Wayfarer Flight 515](https://youtu.be/sFNhVrv6L6o) `sFNhVrv6L6o` | 2026-04-01 | 69k | 22 | 290 | 0.25× | under | 4.5k/1.1k | – | number/money, subtitle | airliner + fire, They Blamed One Guy | failure | high |

#### Plainly Difficult (median 265k, 20 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Every Corner Cut Led to 27 Lives Lost / Plainly Difficult](https://youtu.be/plYQ-StbrOE) `plYQ-StbrOE` | 2026-09-05 | 629k | 10 | 7.7k | 2.37× | exceptional | 11k/655 | – | number/money, subtitle | collapsed structure, THEY CUT EVERY CORNER | failure | high |
| [Every Corner Cut led to 65 Lives Lost / Plainly Difficult](https://youtu.be/zjSuCwk8f1A) `zjSuCwk8f1A` | 2026-11-07 | 574k | 10 | 31k | 2.16× | exceptional | 8.6k/441 | – | number/money, subtitle | collapsed roof, BARELY LASTED A FEW YEARS | failure | low |
| [The tracks Just Disappeared / The Birtley Train Derailment / Plainly D](https://youtu.be/2l3_547XTdY) `2l3_547XTdY` | 2026-10-17 | 517k | 12 | 13k | 1.95× | above | 8.3k/445 | – | subtitle | derailed train aerial, THE TRACKS JUST DISAPPEARED | failure | medium |
| [Caught on CCTV / The Clairton Coke Works Disaster / Plainly Difficult](https://youtu.be/w38by55TSM4) `w38by55TSM4` | 2026-10-10 | 450k | 13 | 9.7k | 1.7× | above | 9.1k/508 | – | subtitle, CAPS word | burnt plant, INEFFECTIVE SAFETY MANAGEMENT | failure | medium |
| [Bridge Collapsed Under Construction / Plainly Difficult](https://youtu.be/GL0Lq8i-2nc) `GL0Lq8i-2nc` | 2026-10-03 | 403k | 10 | 7.5k | 1.52× | above | 7.7k/330 | – | subtitle | collapsed walkway, DEADLY DESIGN ERROR | failure | medium |
| [The Deadliest Industrial Disaster In US History / Plainly Difficult](https://youtu.be/5fXDLUo5H9k) `5fXDLUo5H9k` | 2026-09-12 | 265k | 10 | 3.6k | 1× | typical | 7.7k/653 | – | subtitle | rubble + tunnel, NEARLY 1,000 LIVES LOST | failure | high |
| [The Story of The Cabin Creek Explosion / Plainly Difficult](https://youtu.be/qSRbORkeD2s) `qSRbORkeD2s` | 2026-08-01 | 194k | 15 | 1.7k | 0.73× | typical | 8.5k/682 | – | subtitle | mine plant, ONLY 45 MINUTES OF AIR | failure | high |
| [Deadly Design Kills 54: The Zolitūde Tragedy 2013 / Plainly Difficult](https://youtu.be/X9wgR_u6aB4) `X9wgR_u6aB4` | 2026-07-25 | 130k | 10 | 1.1k | 0.49× | under | 7.6k/473 | – | number/money, subtitle | rubble of building, DEADLY BUILDING DESIGN KILLED 54 | failure | high |
| [Year 9 Of Plainly Difficult Documentaries](https://youtu.be/AePs4QOHnGU) `AePs4QOHnGU` | 2026-09-02 | 84k | 684 | 1.0k | 0.32× | under | 1.2k/166 | – | number/money | cartoon cast, YEAR 9 (11 HOURS!!) | off-niche | high |
| [The Birth of Diversity Equality and Inclusion Training: The Blue Eyes/](https://youtu.be/P442G78mVrw) `P442G78mVrw` | 2026-06-30 | 68k | 20 | 461 | 0.26× | under | 3.9k/795 | – | subtitle | children in classroom, BLUE EYES BROWN EYES | off-niche | high |

#### Stewart Hicks (median 636k, 24 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [How Fake Buildings Keep Cities Alive](https://youtu.be/5rgcxHl3hg8) `5rgcxHl3hg8` | 2025-08-21 | 1.8M | 12 | 3.9k | 2.84× | exceptional | 40k/1.0k | – | how/why/what | white 3D building + red boiler, no text | hidden-system | high |
| [What Makes THIS the Safest House in Los Angeles?](https://youtu.be/cbl_1qfsFXk) `cbl_1qfsFXk` | 2025-05-08 | 1.8M | 14 | 3.1k | 2.78× | exceptional | 30k/2.1k | – | question, how/why/what, CAPS word | house after wildfire, SURVIVED WILDFIRE | design-tech | high |
| [How a Bombproof Building Works](https://youtu.be/Mr8ivmyEmxU) `Mr8ivmyEmxU` | 2025-07-31 | 1.6M | 13 | 3.3k | 2.49× | exceptional | 35k/748 | – | how/why/what | red bomb truck on white model, SECRET TRAP | design-tech | high |
| [Inside the Hyatt Regency Skywalk Collapse](https://youtu.be/uekCFs-vNug) `uekCFs-vNug` | 2025-04-17 | 1.2M | 13 | 2.0k | 1.89× | above | 24k/993 | – | plain statement | red crowd on skywalk model, DESIGNED TO FAIL | failure | high |
| [Why Futuristic Buildings Age So Badly](https://youtu.be/tnoQTtOY5IE) `tnoQTtOY5IE` | 2025-06-19 | 545k | 13 | 1.0k | 0.86× | typical | 14k/963 | – | how/why/what | red building in grey city model, no text | build-politics | high |
| [The Gross Reason Suburban Yards Had to Be This Big](https://youtu.be/jHIkiGJ1PxM) `jHIkiGJ1PxM` | 2026-06-18 | 345k | 13 | 2.2k | 0.54× | under | 8.5k/654 | 6 | plain statement | two house models, MANDATED BY LAW | build-politics | high |
| [Why O’Hare Will Never Be Finished](https://youtu.be/W1Krc5JUsu0) `W1Krc5JUsu0` | 2025-12-11 | 171k | 15 | 488 | 0.27× | under | 4.9k/276 | – | how/why/what | airport diagram + arrows, IT WON'T STOP | build-politics | high |
| [The Corporate Design Ideology Behind Severance in Reality](https://youtu.be/TucmzYwK8IM) `TucmzYwK8IM` | 2025-03-06 | 118k | 15 | 187 | 0.19× | under | 4.7k/147 | – | plain statement | office model, THE CRUEL SCIENCE | off-niche | high |

#### Mega Projects Explained (median 707, 24 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The 1,000 km Outback Road Australia Can’t Keep Open](https://youtu.be/Qo3teec30NY) `Qo3teec30NY` | 2026-11-15 | 89k | 11 | 8.5k | 126.53× | exceptional | 355/21 | 8 | number/money | aerial highway cut, THEY REMOVED THE HILL | megaproject | low |
| [Australia Is Still Building the $45 Billion Railway It Half Abandoned](https://youtu.be/8b-x9GwoJww) `8b-x9GwoJww` | 2026-10-24 | 27k | 12 | 840 | 38.76× | exceptional | 305/60 | 8 | number/money | freight train + map, NO TRAIN TO BRISBANE | build-politics | low |
| [Australia's Plan to Flood Its Own Desert](https://youtu.be/19QzD5bvSZM) `19QzD5bvSZM` | 2026-09-11 | 8.6k | 12 | 113 | 12.11× | exceptional | 30/7 | 8 | plain statement | coast aerial, JUST ADD OCEAN | megaproject | low |
| [Sydney Built an Airport With No Control Tower](https://youtu.be/22RDZveFtHo) `22RDZveFtHo` | 2026-09-28 | 3.4k | 16 | 57 | 4.74× | exceptional | 20/0 | 12 | plain statement | airport apron, WHO'S IN CONTROL? | hidden-system | low |
| [The 250 Metres That Stopped Sydney’s $3.1 Billion Tunnel](https://youtu.be/wstLA0Lp0jU) `wstLA0Lp0jU` | 2026-09-13 | 1.1k | 9 | 15 | 1.51× | above | 1/0 | 7 | number/money | sinkhole under building, SINKHOLES STOPPED IT | failure | low |
| [The UAE Built a 404km Escape Route Around Hormuz—It Still Isn’t Enough](https://youtu.be/r5WhEoNbR_A) `r5WhEoNbR_A` | 2026-09-02 | 287 | 14 | 3 | 0.41× | under | 2/0 | 8 | number/money | tankers + strait, 20M BARRELS ONE STRAIT | hidden-system | low |
| [The $10 Billion Gamble That Could Transform Afghanistan](https://youtu.be/zGBqxWeK2yw) `zGBqxWeK2yw` | 2026-07-28 | 89 | 14 | 1 | 0.13× | under | 1/2 | 6 | number/money | freight rail + canal, 4 MEGA PROJECTS ONE FUTURE? | megaproject | low |
| [Australia Wants to Hide Nuclear Reactors in the Ocean](https://youtu.be/6G8fmN8LHHo) `6G8fmN8LHHo` | 2026-10-20 | 38 | 10 | 1 | 0.05× | under | 0/0 | 9 | plain statement | submarine rolling in surf, BANNED ON LAND | design-tech | low |
| [Why China Built the World’s Longest Bridge Over Farmland](https://youtu.be/6bi2CWiddmY) `6bi2CWiddmY` | 2026-08-04 | 16 | 14 | 0 | 0.02× | under | 0/0 | 8 | how/why/what | rail bridge sunset, CHINA'S LONGEST BRIDGE 165 KM OF RAILWAY | megaproject | low |

#### Fascinating Horror (median 504k, 22 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The Tower Of Power Accident / Fascinating Horror](https://youtu.be/BSnFmj5Pv20) `BSnFmj5Pv20` | 2026-09-29 | 971k | 11 | 17k | 1.93× | above | 16k/1.5k | – | subtitle | red drop-tower ride, title text | failure | medium |
| [They Left The Tourist Trail: Kris Kremers and Lisanne Froon / Fascinat](https://youtu.be/xR2jwvKZ3XU) `xR2jwvKZ3XU` | 2026-09-15 | 806k | 10 | 11k | 1.6× | above | 15k/2.1k | – | subtitle | two hikers' photo, title text | off-niche | high |
| [The Training Exercise That Killed 700 Troops / Fascinating Horror](https://youtu.be/XKW4g86stXQ) `XKW4g86stXQ` | 2026-06-30 | 535k | 12 | 3.6k | 1.06× | typical | 19k/1.4k | – | number/money, subtitle | beach landing painting, title text | failure | high |
| [What Happened On The Jetline Coaster? / Fascinating Horror](https://youtu.be/0X_9qxogVcs) `0X_9qxogVcs` | 2026-08-11 | 424k | 12 | 4.0k | 0.84× | typical | 16k/1.1k | – | question, how/why/what, subtitle | coaster wreck illustration, title text | failure | high |
| [32 Killed By A Single Cigarette: The L'Isle-Verte Fire / Fascinating H](https://youtu.be/XNTyEyUx8Hw) `XNTyEyUx8Hw` | 2026-09-22 | 307k | 10 | 4.8k | 0.61× | under | 10k/782 | – | number/money, subtitle | burning building + firefighters, title text | failure | high |

#### Half as Interesting (median 632k, 11 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [What’s the World’s Smallest City with a Subway System?](https://youtu.be/ZIPOnTFQT7g) `ZIPOnTFQT7g` | 2026-11-12 | 1.3M | 8 | 100k | 2.08× | exceptional | 15k/1.2k | – | question, how/why/what | metro map + population, no face | hidden-system | low |
| [This Is The Shortest Train in the United States](https://youtu.be/3VlnvsZ6kJE) `3VlnvsZ6kJE` | 2026-09-11 | 792k | 8 | 11k | 1.25× | above | 10k/516 | – | plain statement | map line, WHY DOES THIS EXIST? | hidden-system | medium |
| [United and American’s Bitter Feud Over Chicago’s Airport](https://youtu.be/aIozGy0v4RQ) `aIozGy0v4RQ` | 2026-08-11 | 632k | 9 | 6.0k | 1× | typical | 13k/614 | – | plain statement | airport gate diagram, THE CRAZY BATTLE FOR ORD GATES | build-politics | medium |
| [Why They Built The World’s Longest Rail Tunnel](https://youtu.be/iJqXFUDB66k) `iJqXFUDB66k` | 2026-05-28 | 288k | 9 | 1.6k | 0.46× | under | 11k/481 | – | how/why/what | Swiss station + flag, THIS TOOK 17 YEARS | megaproject | medium |

#### Kyle Hill (median 479k, 12 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Chernobyl at War: The Zone Right Now](https://youtu.be/p21LjkEvoBE) `p21LjkEvoBE` | 2026-09-07 | 1.4M | 32 | 18k | 2.93× | exceptional | 34k/2.1k | – | subtitle | host in gas mask, MY HARDEST TRIP EVER | failure | medium |
| [We Accidentally Built Roko’s Basilisk.](https://youtu.be/3o1WulVLOOY) `3o1WulVLOOY` | 2026-10-04 | 1.0M | 17 | 20k | 2.14× | exceptional | 31k/6.0k | – | plain statement | AI snake illustration | off-niche | medium |
| [Finland Solves Nuclear Waste THIS YEAR](https://youtu.be/NDkXOp4jV3c) `NDkXOp4jV3c` | 2026-08-11 | 297k | 19 | 2.8k | 0.62× | under | 19k/1.8k | – | CAPS word | host + Finland map, 100,000 YEAR STORAGE | megaproject | medium |
| [Inside America’s Unprecedented Nuclear Plan](https://youtu.be/dBK35Sbz8vM) `dBK35Sbz8vM` | 2026-07-30 | 222k | 23 | 1.9k | 0.46× | under | 13k/2.2k | – | plain statement | host + company logos, 300% MORE NUCLEAR BY 2050 | hidden-system | medium |
| [Did SpaceX Solve Orbital Data Centers?](https://youtu.be/4mx9Rp-SMNk) `4mx9Rp-SMNk` | 2026-06-18 | 52k | 90 | 325 | 0.11× | under | 2.0k/1.4k | – | question | satellite, 1,000,000 AI SATELLITES | off-niche | medium |

#### Mustard (median 7.1M, 19 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [What Happened To The Nautilus?](https://youtu.be/8AbtCE-sePc) `8AbtCE-sePc` | 2024-04-12 | 20.8M | 17 | 22k | 2.93× | exceptional | 298k/5.5k | – | question, how/why/what | cutaway submarine, UNDER THE NORTH POLE | mystery | high |
| [This Jet Terrified the West: The MiG-25 Foxbat](https://youtu.be/W1L1sU0uI0o) `W1L1sU0uI0o` | 2021-11-19 | 14.0M | 13 | 7.6k | 1.97× | above | 237k/10k | – | number/money, subtitle | jet, one word FOXBAT | design-tech | medium |
| [Why French Trains Are The Fastest](https://youtu.be/bEgAgJc8Heg) `bEgAgJc8Heg` | 2023-07-02 | 6.0M | 16 | 4.8k | 0.85× | typical | 102k/4.9k | – | how/why/what | TGV + plane, WORLD RECORD | design-tech | high |
| [Why Was This Ship Banned From Ports?](https://youtu.be/cYj4F_cyiJI) `cYj4F_cyiJI` | 2022-01-21 | 4.8M | 14 | 2.7k | 0.68× | under | 110k/8.7k | – | question, how/why/what | ship at sea, DANGEROUS? | design-tech | medium |
| [This Jet Changed Everything](https://youtu.be/YCD1j4L7j3s) `YCD1j4L7j3s` | 2026-06-05 | 3.0M | 15 | 17k | 0.42× | under | 56k/2.0k | – | plain statement | flying-wing render, DON'T DO THIS | design-tech | high |

#### SmarterEveryDay (median 1.9M, 24 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Refueling a NUCLEAR REACTOR - Smarter Every Day 311](https://youtu.be/v0afQ6w3Bjw) `v0afQ6w3Bjw` | 2025-11-03 | 7.5M | 106 | 19k | 3.89× | exceptional | 152k/12k | – | number/money, subtitle, CAPS word | host in cleanroom suit at reactor pool, no text | hidden-system | high |
| [I Explored the World's First Nuclear Power Plant (and How It Works) - ](https://youtu.be/JVROsxtjoCw) `JVROsxtjoCw` | 2025-01-31 | 3.8M | 43 | 5.8k | 1.99× | above | 101k/6.7k | – | number/money, subtitle | host + big text, IF YOU WATCH THIS VIDEO YOU WILL UNDERSTAND NUCLEAR POWER | hidden-system | high |
| [INSIDE a Nuclear Reactor Core - Smarter Every Day 317](https://youtu.be/pXypQ6d_iDg) `pXypQ6d_iDg` | 2026-09-26 | 2.1M | 44 | 35k | 1.08× | typical | 33k/2.5k | – | number/money, subtitle, CAPS word | host + glowing reactor, no text | hidden-system | high |
| [Touring the Vulcan Rocket on the Launch Pad - Smarter Every Day 297](https://youtu.be/Bh7Xf3Ox7K8) `Bh7Xf3Ox7K8` | 2024-04-28 | 1.3M | 37 | 1.4k | 0.67× | under | 48k/2.7k | – | number/money, subtitle | rocket on pad, VULCAN TOUR | off-niche | high |
| [I Called the Space Station - Smarter Every Day 303](https://youtu.be/JJofuF2zcTE) `JJofuF2zcTE` | 2024-10-27 | 572k | 34 | 754 | 0.3× | under | 24k/1.4k | – | number/money, subtitle | host + ISS, I CALLED THEM | off-niche | high |

#### Adam Something (median 596k, 23 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Why Trump's Tariffs Are Doomed To Fail](https://youtu.be/Zognn5hwQdk) `Zognn5hwQdk` | 2025-04-23 | 724k | 16 | 1.2k | 1.22× | typical | 44k/3.8k | – | how/why/what | politician caricatures, markets red | off-niche | high |
| [German Rail is Horrible Beyond Reason](https://youtu.be/lY1UAnzv0UU) `lY1UAnzv0UU` | 2026-07-03 | 655k | 17 | 4.5k | 1.1× | typical | 31k/4.0k | – | plain statement | meme cartoon + burning logos | off-niche | high |
| [Why Dictatorships Look the Same](https://youtu.be/3PKXBwXYCog) `3PKXBwXYCog` | 2026-03-26 | 482k | 13 | 2.0k | 0.81× | typical | 35k/3.4k | – | how/why/what | three flags + traffic | off-niche | high |
| [The Disaster of the Last Ditch Lesbian Bar](https://youtu.be/_2r_JnfaOSg) `_2r_JnfaOSg` | 2026-10-30 | 248k | 16 | 9.4k | 0.42× | under | 8.4k/1.9k | – | plain statement | CIA seal + host | off-niche | medium |

#### Technology Connections (median 2.1M, 24 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Video projectors used to be ridiculously cool](https://youtu.be/ms8uu0zeU88) `ms8uu0zeU88` | 2025-10-08 | 2.7M | 35 | 6.4k | 1.26× | above | 91k/6.4k | – | plain statement | projector + lenses, Three of them. | off-niche | high |
| [Power is not energy: why the difference matters](https://youtu.be/OOK5xkFijPc) `OOK5xkFijPc` | 2025-03-29 | 2.4M | 52 | 3.9k | 1.12× | typical | 69k/9.2k | 11 | subtitle | power meter, Watts Aren't Energy | everyday-curiosity | high |
| [My water heater is cooler than yours](https://youtu.be/F_7B2shTPPU) `F_7B2shTPPU` | 2026-08-21 | 2.0M | 59 | 21k | 0.95× | typical | 46k/8.3k | 10 | plain statement | water heater + host, It's a heat pump! | everyday-curiosity | high |
| [This cassette player is built into an 8-track cartridge](https://youtu.be/8I4Jc-WLsrs) `8I4Jc-WLsrs` | 2025-11-20 | 864k | 27 | 2.3k | 0.41× | under | 38k/4.2k | – | number/money | cassette adapter, long text | off-niche | high |

#### City Beautiful (median 98k, 22 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Why U.S. Cities Don't Build Metro Systems](https://youtu.be/aMbG6RwYy-Q) `aMbG6RwYy-Q` | 2025-06-20 | 458k | 13 | 876 | 4.65× | exceptional | 11k/2.1k | – | how/why/what | US map with X marks, no face | build-politics | high |
| [How NYC Is Banning Cars on Broadway](https://youtu.be/PzlO6kmF4u8) `PzlO6kmF4u8` | 2025-09-30 | 220k | 12 | 522 | 2.23× | exceptional | 6.4k/281 | – | how/why/what | Times Square, NO CARS | build-politics | high |
| [I Rode the Longest Waterfront Path in the World](https://youtu.be/sM7B8JmKGpI) `sM7B8JmKGpI` | 2025-08-27 | 102k | 22 | 224 | 1.03× | typical | 3.6k/519 | – | plain statement | waterfront path, BEST BIKE PATH | off-niche | high |

#### RMTransit (median 29k, 18 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [America's BIGGEST Transit Expansion! (w/ @nandert )](https://youtu.be/OimL8T4b4hg) `OimL8T4b4hg` | 2025-08-15 | 94k | 11 | 202 | 3.2× | exceptional | 5.2k/325 | – | CAPS word | LA skyline, AMERICA'S BIGGEST Transit Expansion | build-politics | high |
| [Exploring Tokyo's UNIQUE Rail Stations (w/ Tanner's videos)](https://youtu.be/zQcjFLzcYrg) `zQcjFLzcYrg` | 2025-07-11 | 82k | 19 | 163 | 2.77× | exceptional | 3.2k/194 | – | CAPS word | rail station, TOKYO'S Fortress Station | hidden-system | high |
| [Should We Ban Cars? / TAKT with RMTransit](https://youtu.be/KpH39_Ky1vg) `KpH39_Ky1vg` | 2025-06-27 | 5.7k | 66 | 11 | 0.19× | under | 204/85 | – | question, subtitle, CAPS word | tram street, Banning Cars? | off-niche | high |

#### Not Just Bikes (median 1.0M, 5 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [They Finally Built Good Transit!?](https://youtu.be/QJ9aiT-kXVU) `QJ9aiT-kXVU` | 2026-09-06 | 2.0M | 29 | 25k | 1.9× | above | 27k/1.4k | 14 | question | new metro platform, IT'S ACTUALLY GOOD?! | build-politics | low |
| [They Build a "Car-Lite" Town that's Full of Cars](https://youtu.be/NdGheCcLj-E) `NdGheCcLj-E` | 2026-11-04 | 480k | 26 | 23k | 0.46× | under | 9.6k/700 | 11 | plain statement | suburb street, THIS IS CAR-LITE!? | off-niche | low |

#### Thunderf00t (median 265k, 23 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Tesla Flying Roadster BUSTED!!!!](https://youtu.be/YdZ9MxtPBRY) `YdZ9MxtPBRY` | 2026-10-23 | 839k | 39 | 25k | 3.17× | exceptional | 27k/7.3k | – | CAPS word | Titan sub + sportscar, LITERAL TITAN of sportscars! | off-niche | medium |
| [Starship's Mars Dream CRASHES: Why Musk's 2026 Plan Is Pure Sci-Fi!](https://youtu.be/WJbizr-37a8) `WJbizr-37a8` | 2025-06-22 | 243k | 30 | 466 | 0.92× | typical | 15k/3.6k | – | number/money, subtitle, CAPS word | Cybertruck fire + rocket explosion, STARSHIP | off-niche | high |
| [Starship Insanity... the TENTH attempt (V3) to NOT go to orbit! WITH C](https://youtu.be/x6z1MdCEeOU) `x6z1MdCEeOU` | 2025-08-27 | 56k | 134 | 122 | 0.21× | under | 2.8k/2.2k | – | number/money, CAPS word | rocket launch, FLIGHT 10 to NOT ORBIT! | off-niche | high |

#### LEMMiNO (median 8.6M, 21 comparable uploads, fit: reference)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The Vanishing of Flight 370](https://youtu.be/kd2KEHvK-q8) `kd2KEHvK-q8` | 2019-04-14 | 30.3M | 25 | 11k | 3.54× | exceptional | 671k/53k | – | number/money | plain plane icon on blue, no text | mystery | medium |

#### Veritasium (median 22.2M, 4 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The Insane Real Engineering of the Nazi Enigma Machine](https://youtu.be/JsBZOcqZerk) `JsBZOcqZerk` | 2026-09-21 | 22.4M | 48 | 344k | 1.01× | typical | 155k/7.6k | 10 | plain statement | Enigma machine, We cracked it | design-tech | low |

#### Mark Felton Productions (median 396k, 17 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [The Eagle's Nest Fire - Erasing History at Obersalzberg](https://youtu.be/JOAt-PHuiis) `JOAt-PHuiis` | 2026-10-25 | 1.9M | 15 | 59k | 4.68× | exceptional | 36k/8.6k | – | subtitle | mountain top on fire, no text | mystery | medium |
| [Skorzeny's Last Battle - The Oder Bridgehead 1945 (OMNIBUS EDITION)](https://youtu.be/jS3ETRZV1HI) `jS3ETRZV1HI` | 2026-10-22 | 580k | 26 | 17k | 1.46× | above | 10k/561 | – | number/money, subtitle, CAPS word | soldier photos, no text | off-niche | medium |
| [The Rudolf Hess Uniform Mystery - Missing Luftwaffe Disguise from 1941](https://youtu.be/8A4WQ-uR7Ac) `8A4WQ-uR7Ac` | 2026-10-04 | 212k | 8 | 4.1k | 0.54× | under | 7.2k/561 | – | number/money, subtitle | Hess photos + uniform, no text | off-niche | medium |

#### Engineering with Rosie (median 158k, 2 comparable uploads, fit: core)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Australians Were Promised Free Electricity. So Where Is It?](https://youtu.be/xGJP4LLGWU8) `xGJP4LLGWU8` | 2026-10-22 | 158k | 11 | 4.6k | 1× | typical | 3.4k/966 | 4 | question | Australia map + shocked host, FREE ELECTRICITY?! | hidden-system | low |
| [Will AI Data Centres Break the Grid?](https://youtu.be/3hMSYNNqR_E) `3hMSYNNqR_E` | 2026-11-11 | 34k | 17 | 2.3k | 0.21× | under | 1.1k/135 | 6 | question | pylon + data centre + host, GRID vs AI | hidden-system | low |

#### ColdFusion (median 1.1M, 16 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Why Building AI Data Centres Isn’t Working Anymore](https://youtu.be/eXXwN_TDdLU) `eXXwN_TDdLU` | 2026-06-08 | 1.6M | 27 | 9.6k | 1.5× | above | 59k/6.7k | – | how/why/what | red falling chart + CEO, IT'S OVER | off-niche | medium |
| [SpaceX Went Public - A Disaster Waiting to Happen](https://youtu.be/FPIGu0anfAE) `FPIGu0anfAE` | 2026-06-12 | 1.1M | 18 | 6.5k | 1× | typical | 46k/5.9k | – | subtitle | SpaceX stage + Nasdaq | off-niche | medium |

#### RealLifeLore (median 1.3M, 23 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Why The Nepal Flood Was WAY Scarier Than You Think](https://youtu.be/WiRLNEl-4bk) `WiRLNEl-4bk` | 2026-09-19 | 2.4M | 30 | 35k | 1.83× | above | 24k/2.1k | – | how/why/what | satellite terrain + water, 1,500-FT TSUNAMI | failure | high |
| [The Incredible Logistics Behind the World's Longest Flight](https://youtu.be/V14RCK_QiG0) `V14RCK_QiG0` | 2026-06-19 | 711k | 27 | 4.5k | 0.55× | under | 16k/1.2k | – | plain statement | globe route, THE IMPOSSIBLE FLIGHT | hidden-system | high |

#### Brendon Peterson (median 11k, 12 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Remote Jungle Medivac flight - 10 hours of hiking in just 8 minutes.](https://youtu.be/ht6q1P2bGtg) `ht6q1P2bGtg` | 2024-10-11 | 33k | 19 | 43 | 3× | exceptional | 1.0k/73 | – | number/money, subtitle | helicopter cockpit, MEDIVAC 8HR → 10 MIN | off-niche | medium |
| [Medivac flight from Bayog / (I Almost Lost My Camera Forever!)](https://youtu.be/kGiSk_VD068) `kGiSk_VD068` | 2024-11-08 | 13k | 34 | 18 | 1.2× | typical | 485/23 | 14 | subtitle | helicopter + kids, R66 Medivac | off-niche | medium |
| [Flight VLOG#06 / Could you ride this trail without crashing?](https://youtu.be/-ofC-GQroaM) `-ofC-GQroaM` | 2024-10-15 | 1.7k | 44 | 2 | 0.16× | under | 84/4 | – | question, number/money, subtitle, CAPS word | host + motorbike, EPIC TRAIL RIDE | off-niche | medium |

#### Kurzgesagt – In a Nutshell (median 12.8M, 5 comparable uploads, fit: reference)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [AI Just Crossed the Terrifying Line - Now What?](https://youtu.be/ujkD4SxPKOI) `ujkD4SxPKOI` | 2026-10-05 | 24.4M | 22 | 475k | 1.91× | above | 529k/41k | – | question, subtitle | red eye, WE LOST CONTROL | off-niche | low |

#### Economics Explained (median 768k, 20 comparable uploads, fit: adjacent)

| Video | Pub | Views | Min | /day | Outlier | Class | Likes/Comm | Ch | Title structure | Thumbnail (my reading) | Angle | Conf |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Where Has Venezuela's Oil Gone?](https://youtu.be/PRJra_9RLf0) `PRJra_9RLf0` | 2026-07-26 | 260k | 16 | 2.1k | 0.34× | under | 6.6k/321 | – | question, how/why/what | raid photo, DID IT WORK? | off-niche | high |
| [Cuba Was Barely Holding On… And Then The Oil Ran Out](https://youtu.be/72pGczK3j7s) `72pGczK3j7s` | 2026-07-14 | 238k | 21 | 1.8k | 0.31× | under | 6.4k/1.1k | – | plain statement | old cars in Havana, CAN IT RECOVER? | off-niche | high |

### Counts by class and by angle (my selection over-samples the extremes: read these as which angles appear at each extreme, not as rates)

| Angle | exceptional | above | typical | under |
|---|---|---|---|---|
| hidden-system | 7 | 4 | 3 | 5 |
| megaproject | 5 | 0 | 5 | 8 |
| everyday-curiosity | 2 | 0 | 3 | 0 |
| failure | 8 | 9 | 11 | 9 |
| build-politics | 4 | 2 | 4 | 2 |
| design-tech | 3 | 1 | 3 | 3 |
| mystery | 3 | 1 | 0 | 0 |

Videos by class (all 138): exceptional 35, above 23, typical 38, under 42.

Median length by class (minutes): exceptional 17, above 17, typical 18, under 19.

Share with chapters: exceptional 23%, under 24%.

Titles with a question mark: exceptional 5/35, above 4/23, typical 2/38, under 8/42.


## 4. Why an ordinary American clicks: the exceptional videos (my reading of title + thumbnail; confidence in brackets)
Facts first: views, outlier and views/day are in section 3. Everything below is *my reading*, not measured click data.

| Video (outlier) | The stated stake or promise | Why it should land with a US viewer (reading) |
|---|---|---|
| Practical Engineering, *Stopping the Unstoppable* (4.7×, 66k/day) | thumbnail: a fast train and a yellow device (what the video is about I did not see) | physics puzzle with a safety stake; one clear object on the thumbnail [low–medium] |
| Practical Engineering, *The Los Angeles Aqueduct is Wild* (4.3×) | how a city of millions gets water | scale + money + a known city + history of a still-used system; "is Wild" is a plain-spoken promise [medium] |
| Practical Engineering, *Why Roads Get Washboards* (2.8×) | an everyday annoyance nobody can explain | the viewer has felt it; no jargon; the "why" is unanswered [medium] |
| The B1M, *The Race to Demolish Fukushima* (2.6×) | a nuclear site and a deadline | danger + scale + a place Americans know; "15 YEARS LATER" gives time stakes [medium] |
| Real Engineering, *The Plane That's 38% Nose* (3.6×, 44k/day) | a strange aircraft with a precise number | one odd fact, one image, military-secret flavour [medium] |
| Real Engineering, *Why America's Tank Failed in Ukraine* (2.5×) | "27/31 DESTROYED" | US-made, current war, a hard number [medium; off-niche topic] |
| Real Engineering, *How We Built The ISS* (2.2×) | the biggest build in history, as "DAY 1 vs DAY 4,745" | megaproject scale shown as before/after [medium] |
| Wendover, *How the Channel Tunnel Works* (2.2×) | "THE TUNNEL'S BROKEN PROMISE" | promise vs reality of a megaproject, with a map [medium] |
| Plainly Difficult, *Every Corner Cut Led to 27 / 65 Lives Lost* (2.4× / 2.2×) | a death count and a cause (cost-cutting) | blame and a number in 10 minutes; thumbnail shows the collapsed structure [medium; blame framing must stay inside the official findings] |
| Plainly Difficult, *The Tracks Just Disappeared* (1.95×) | an unbelievable mechanical failure | one sentence, one image [medium] |
| Disaster Breakdown, three 44–67 min air-disaster videos (4.7–5.2×, 2.6×; 2.5–3 years old) | "Did this small mistake kill everyone?" | a small cause with a huge result; strong age bias (see bias 4) [low] |
| Stewart Hicks, *How Fake Buildings Keep Cities Alive* / *Bombproof Building* / *Safest House in LA* (2.8× / 2.5× / 2.8×) | a hidden mechanism inside a familiar building | red-highlighted 3D model, 2–3 word promise ("SECRET TRAP", "SURVIVED WILDFIRE"); LA wildfire is a current US worry [medium] |
| Smarter Every Day, *Refuel a Nuclear Reactor* (3.9×, 106 min) / Kyle Hill, *Chernobyl at War* (2.9×) | inside access to a hazard | "I was there" + radiation stakes [medium; adjacent topic] |
| Mustard, *What Happened To The Nautilus?* (2.9×, 957 days old) | an unsolved question | a mystery with an object and an unknown [low; age bias] |
| City Beautiful, *Why U.S. Cities Don't Build Metro Systems* (4.65×, 523 days) | an American problem put as "why not us?" | national comparison, US map with X marks, no jargon [medium; transit advocacy, adjacent] |
| Mega Projects Explained, *1,000 km Outback Road Australia Can't Keep Open* (126×) | an infrastructure paradox | looks strong but the channel median is 707 views: **noise** [low] |
| Half as Interesting, *Smallest City With a Subway* (2.1×, 100k/day in 13 days) | a superlative curiosity | tiny, specific, instantly graspable [low; provisional age] |

Other recurring top rows (not shown): Thunderf00t (Tesla, off-niche), LEMMiNO *Flight 370* (3.5×, 2,782 days old, mystery reference), Mark Felton *Eagle's Nest Fire* (4.7×, history, off-niche).

## 5. Under-performers: hypotheses only (none tested)
Labelled **hypothesis**; confidence is about the hypothesis, not the number.

| Video (outlier) | Hypothesis | Conf. |
|---|---|---|
| PE, *Fixing the Most Dangerous Dam in the World* (0.58×) | the thumbnail's superlative is about repairing, not about a disaster; the dam is in Iraq with no US stake | low–med |
| PE, *This Spillway Failed On Purpose* (0.67×); *Bridge Demolition is Complicated* (0.49×) | process explainers with no human cost, no question, no US link | low |
| The B1M, *Hong Kong $8BN Groundscraper* (0.69×); *$13BN Desert Railway Will Transform Abu Dhabi* (0.39×) | foreign promotional megaprojects (the "will transform" framing) with only a price tag as stake | low–med |
| The B1M, *Russia's Desperate Fight to Stay in the Space Race* (0.53×) | geopolitics, not engineering; a different audience | low |
| Real Engineering, *Sagrada Familia Full Documentary* (0.62×, 24 min) | a long, widely covered subject; "full documentary" promises length, not a question | low |
| Mentour Pilot, *Miami Amazon Crash UPDATE! Pilots React Live* (0.42×) | a live reaction format, not a story | med |
| Disaster Breakdown, *737 Down Over ABQ* (0.25×), *Andes Miracle* (0.33×) | obscure incident or an over-covered one; no hook in title | low |
| Plainly Difficult, *Zolitūde Tragedy 2013* (0.49×) | a Latvian disaster, no US link, "Deadly Design Kills 54" is generic | low |
| Stewart Hicks, *Why O'Hare Will Never Be Finished* (0.27×), *Severance in Reality* (0.19×) | niche or pop-culture angle, not a disaster or a mystery | low |
| Half as Interesting, *Why They Built The World's Longest Rail Tunnel* (0.46×, 9 min) | a foreign tunnel in an 8–9 min format with no tension; compare Wendover's Channel Tunnel at 2.2× with "broken promise" | low–med |
| TAKT panel (0.19×, 66 min), Thunderf00t Starship V3 (0.21×, 134 min), Kyle Hill live (0.11×, 90 min) | live/panel formats are not comparable to edited films | med |
| Engineering with Rosie, *Will AI Data Centres Break the Grid?* (0.21×, 15 days) | provisional age: too early to judge | low |

What the under-performers share (my reading, medium): **foreign, no US link, no named human cost, promotional or process framing, or a non-documentary format.** Foreign is not fatal: the Channel Tunnel (2.2×) and Fukushima (2.6×) work with "broken promise" and "race" framing.

## 6. W4: what YouTube's own help pages say (read 26 Nov 2026)
Pages: 16559650 (*Understand your content performance for YouTube's recommendation system*), 141805 (*YouTube performance FAQ & Troubleshooting*), 9314415 (*Measure key moments for audience retention*), 7628154 (*Impressions & click-through-rate FAQs*), 16391400 (*A/B test titles & thumbnails*). Quoted lines are short; the rest is a paraphrase.

- **Three signal buckets (16559650):** *Appeal* ("did people choose to watch the content or did they ignore or click 'not interested'?"), *Engagement* ("once viewers start watching, do they stick around?"), *Satisfaction* ("did viewers enjoy the video?"). The goal is to "determine if viewers would be interested in the video and feel satisfied after watching it".
- **Packaging (16559650):** title and thumbnail "are vital for communicating value, sparking intrigue, and setting clear expectations". The page's example reframes an expert title around a universal problem ("Why Is Your Coffee So Expensive?"). Tags are "not essential for discovery".
- **Hooks (16559650):** the intro should deliver "on the promise made by your thumbnail and title" and "get straight to providing that value". The page gives **no number of seconds**.
- **The 30 s number (9314415):** in *Key moments for audience retention*, "Intro tells you what percentage of your audience still watched your video after the first 30 seconds". It is **a measure of how many remain, not a prescribed hook length**. A high value "could mean" the first 30 s matched the title/thumbnail expectation or kept interest; to improve it, change the thumbnail/title to reflect the content, or change the first 30 s. Other moments the report flags: spikes, dips, gradual declines ("Videos on YouTube generally taper off").
- **Watch time (141805):** the discovery system "uses absolute and relative watch time as signals"; "relative watch time is more important for short videos and absolute watch time is more important for longer videos". Likes and dislikes are "some of the hundreds of signals". Monetisation status does not affect discovery.
- **CTR (7628154):** "Half of all channels and videos on YouTube have an impressions CTR that can range between 2% and 10%". Do not judge CTR early, do not chase small changes, do not test several thumbnails sequentially on one video. A high CTR with low average view duration marks clickbait, "less likely to get recommended".
- **Test & Compare (16391400):** up to 3 titles/thumbnails; the winner is the one with the **highest watch time share**, not the highest CTR ("we optimize tests for overall watch time over other metrics, like click-through-rate"); results can be "no clear winner". Third-party tools often optimise CTR only.

**What this means for Zupona (reading):** (1) the release board should judge *promise kept*, not a hook length: does the first 30 s confirm what the title and thumbnail promised? (2) 30 s retention is something to read after release, not a target to engineer; (3) packaging must create appeal without bait: no title/thumbnail promise the film cannot keep, which also fits the rule "never present a reconstruction as authentic evidence"; (4) when packaging variants are tested, the winner is chosen by watch time, so a test must wait for enough data; (5) no source here gives a target retention or CTR for a new channel.

## 7. Transferable principles for Zupona (no copying of titles or thumbnails)
Each principle names its evidence; "reading" means my interpretation. None is a promise of views.

1. **Lead with a stake the viewer can feel: a count of lives, a number, a time span, or a bill** (Plainly Difficult 2.4×, Real Engineering 2.5×, The B1M 2.6×). Do not invent or inflate; use the official count.
2. **Start from an object an American already lives with** (road, water, grid, gas meter, house, bridge they drive over). Practical Engineering's top five are of this kind (reading).
3. **Promise one mechanism the viewer has never seen**: one hidden thing, one question ("why does this happen"). Stewart Hicks' red-highlighted model shows it can be done without footage.
4. **Failure films: name the human decision, within the findings** ("every corner cut", "designed to fail"). The investigation record is the safe ground; blame beyond it is not (rule: no fabricated facts).
5. **Megaproject films: frame as promise vs reality** (Channel Tunnel 2.2×, abandoned tower, unfinished or cancelled projects) rather than as admiration or a ribbon-cutting ("will transform" under-performed).
6. **Have a US link or say why it matters here.** Foreign-only, price-tag-only subjects were weakest (section 5).
7. **Thumbnail: one subject, at most four words, real or modelled evidence, one highlighted element.** This is the pattern across the winners I saw (red circle, red figure, a single number). Rows with a face are mostly host-led channels, not documentaries.
8. **Do not tune length to a number.** Class does not depend on length in this sample (section 3); length follows the story. Chapters did not separate winners from losers.
9. **Authentic visuals decide the production plan, not the topic score alone.** Winners used a mix of CGI illustration, news footage and 3D models. The roadmap's A–E shot classes already cover this: a diagram or marked evidence gap is an acceptable fallback.
10. **Avoid:** superlative-only packaging, process-only explainers with no stake, live/panel formats, and any claim the film cannot support in its first 30 s.
11. **Timeliness helps but is not required:** the newest Practical Engineering film (transmission towers) reached 1.57M views in 8 days; evergreen failures (Teton 1.03×) sit at the channel's normal level. Use news pegs as a bonus.

## 8. First 15 candidate topics (evidence behind each)
Evidence = rows in this study. "Inference" means the topic itself was not in the sample; the evidence is a sibling video's performance. Each topic still needs W7 scoring and a source check (W10) before any film starts; no topic has been researched for facts here.

| # | Topic | Pillar | Evidence from the sample | Risk / open question |
|---|---|---|---|---|
| 1 | St. Francis Dam failure (1928) and the LA Aqueduct | A + B | LA Aqueduct 4.31× (PE); dam failures Teton 1.03×, a PD brand-new-dam film 1.13×; promise-vs-reality frame | archive footage for 1928; confirm sources (W10) |
| 2 | Hyatt Regency walkway collapse (1981) | A | Stewart Hicks skywalk collapse 1.89×; PD bridge-collapse film 1.52×; "DESIGNED TO FAIL" thumbnail on the Hyatt video | graphic subject: advertiser fit; keep to the investigation record |
| 3 | Tacoma Narrows Bridge (1940) | A | **no direct evidence in the sample either way**; PD bridge-collapse film 1.52×; PE bridge demolition 0.49× warns against process-only framing | extremely well covered: needs a distinct angle; W11 test-slice subject |
| 4 | Boston Big Dig (and Seattle's stuck tunnel machine) | B | Channel Tunnel 2.23× (promise vs reality); US metro film 4.65×; CA high-speed rail 0.92×; abandoned-tower B1M video at 155k/day (7 days old) | inference; politics: stay on engineering facts |
| 5 | New Orleans levee failures in Katrina | A + C | PE *flaw that flooded New Orleans* 1.71× | sensitive loss of life; use official reports |
| 6 | Oroville spillway crisis (2017) / Teton Dam | A | PE Teton 1.03×; spillway-failed-on-purpose 0.67× (weak) | mixed evidence; medium-low |
| 7 | I-35W Minneapolis bridge collapse (2007) and the MacArthur Maze fire | A | PD MacArthur Maze 1.31× (11 days, provisional); PD bridge-collapse film 1.52× | the I-35W is inference; footage rights |
| 8 | Hanford: cleaning up the biggest US nuclear waste site | C + D | Fukushima 2.58× (B1M), Chernobyl at War 2.93× (Kyle Hill), reactor refuelling 3.9× (SED); US stake | inference; very technical; heavy on research reliability |
| 9 | Camp Century, the US base under the Greenland ice | D | Real Engineering *military base under Greenland* 1.34×; Mustard Nautilus 2.93× shows "what happened" mysteries do well | strong authentic archival (US Army); verify claims |
| 10 | Oceanwide Plaza, the abandoned Los Angeles skyscraper (and other unfinished US builds) | B + D | B1M *LA $1.8BN Olympic Headache*, thumbnail "ABANDONED." on a graffiti tower (the tower's identity is my reading): 154k views/day at 7 days (provisional); Mega Projects Explained "can't keep open" (noisy) | news-peg topic; fast to date |
| 11 | The US power grid: why there are so many transmission-tower designs / the 2003 blackout | C | PE transmission towers 1.57M views in 8 days; outlets 1.33×; Rosie *grid vs AI* too new (0.21×, 15 days) | the blackout is inference; diagrams, not footage |
| 12 | The 2018 Merrimack Valley gas explosions (and what a pressure regulator does) | A + C | PE pressure regulators 1.68× (40k/day); *What is that?* thumbnail | inference; very recent, legal sensitivity |
| 13 | Hoover Dam: how it was poured and why it still works | B | Real Engineering ISS 2.18×; B1M typical ~1×; the **only** weak evidence; strong archival footage exists | inference; heavily covered; confidence low |
| 14 | Why American subways cost so much (Second Avenue Subway) | B | City Beautiful 4.65×; RMTransit 3.2× (small channel); Wendover Channel Tunnel 2.23× | topic is policy-adjacent; keep it engineering |
| 15 | Chicago's Deep Tunnel: the flood-control system under the city | C | PE retention ponds 2.11×, *What's under your feet in NYC* 0.72×, *tunnel* film 0.74× (mixed) | mixed evidence: medium-low |

Topics 3, 6, 13 and 15 have the weakest evidence; W7 should score them below 1, 2, 5, 9 and 10 unless new data says otherwise.

## 9. Next steps (not done here)
- Add `statistics.subscriberCount` to the `/api/videos` response (one field of the `channels.list` call already made) so the next study has real subscriber counts.
- Re-run `engineering-handles.mjs` in 30 days; compare the same videos' growth (the outlier score is a snapshot).
- Find more small/rising channels (found by search once quota resets; handles are the cheap path).
- W7 can read `data/engineering-videos.json` (`angle`, `class`, `confidence`) as its evidence table.
