# Top 200 risers of our niche: why they rose (27 Nov 2026)

## মালিকের জন্য সারাংশ (বাংলা)
1. আমাদের niche (ইঞ্জিনিয়ারিং দুর্ঘটনা, মেগাপ্রজেক্ট, লুকানো অবকাঠামো) থেকে ২ মাস–৩ বছরের মধ্যে সবচেয়ে দ্রুত বেড়ে ওঠা ২০০টি ভিডিও বেছেছি (দৈনিক ভিউ × চ্যানেলের নিজের গড়ের তুলনায় ভিউ)। ইতিহাস, গাড়ি, কয়েন, গেমের চ্যানেল বাদ দিয়েছি।
2. ২০০টি থাম্বনেইলই নিজে ছবি হিসেবে দেখেছি (contact sheet: `docs/research/data/top200-contact-sheet.png`)।
3. ১২টি "বেড়ে ওঠার প্যাটার্ন" পেয়েছি। সবচেয়ে বড় দুটো: বিমান-দুর্ঘটনা তদন্ত (৪৫টি, প্রায় ৩৮ মিনিট) আর টাটকা খবরের সূত্র (৪৫টি, ৫ মাসের মধ্যে)।
4. "লুকানো ব্যবস্থা কীভাবে কাজ করে", "এটা ভাঙা" মতামত আর রহস্য প্যাটার্নে চ্যানেলের স্বাভাবিকের ৩ গুণের বেশি ভিউ; "বিলিয়ন ডলারের প্রজেক্ট" সবচেয়ে কম (১.৩ গুণ)।
5. থাম্বনেইলে ১৪২টিতে অল্প লেখা (১–৪ শব্দ), ছবি আসল ক্ষতি, আকাশ থেকে তোলা বা রেন্ডার। চ্যানেলের লোগো বড় বা দোষারোপের শব্দ থাকলে গড়ের চেয়ে খারাপ ফল (ছোট নমুনা)।
6. কোড এখন এই prior ব্যবহার করে: টপিক র‍্যাঙ্কিং-এ শিরোনামের ঝোঁকের জন্য সর্বোচ্চ ±৩ পয়েন্ট, আর S1/S7 প্যাকেজিং ধাপে সংক্ষিপ্ত নির্দেশিকা। এটা ঝোঁক, ভিউয়ের প্রতিশ্রুতি নয়।
7. যা দেখা যায় না: ভিডিওর প্রথম ৩০ সেকেন্ডের কথা (hook) আর দর্শক কোথায় ছেড়ে যায় (retention)। এই প্যাটার্নগুলো "কী ক্লিক পেয়েছে" বলে, "কেন শেষ পর্যন্ত দেখেছে" বলে না।
8. সীমা: ১৫টি চ্যানেল (B1M ৪২, Mentour Pilot ২৮টি) এবং আমার তালিকা; "কারণ" মানে দৃশ্যমান সংকেত থেকে অনুমান, প্রমাণিত কারণ নয়।
9. কোনো ভিউ সংখ্যার প্রতিশ্রুতি নেই।
10. ডেটা: `docs/research/data/top200-rise.json`; সাপ্তাহিক রিফ্রেশে (reference-prior workflow) আবার তৈরি হয়।

## 1. Method (facts)
- **Source.** `docs/research/data/engineering-reference-videos.json`, built by `tools/research/build-prior.mjs` from a 4-page-per-channel crawl through the Worker (`/api/videos`, 41 channels, 6,938 videos read on 2026-11-27, production route with `pageToken` and `descriptionOpening` checked first). 2,734 long niche videos pass the prior's filter.
- **Ranking.** `tools/research/top200.mjs` (`topRisers` in `engine/src/reference-prior.mjs`): core and adjacent channels only; a pillar keyword in the title or a core channel; published 60 days to 3 years ago; sorted by **views/day × outlier** (outlier = views ÷ the channel's own median of long uploads). Dropped as off-niche: toldinstone (Roman history), Mark Felton, Historia Civilis, Kurzgesagt, Veritasium, LEMMiNO, Vox, Tom Scott, PolyMatter, Infographics Show, New Mind, ColdFusion, Economics Explained, Technology Connections, Alec Steele, RealLifeLore, SmarterEveryDay, Thunderf00t, Mustard and Engineering Explained (car and EV reviews); plus single videos about games, brands, internet culture, biology and car models (Fallout 4, Red Bull, Dead Internet Theory, Mirror Life, Tesla/Lucid/Porsche/Jeep/Bugatti/Maverick). My first ranking let 20 of those in; I re-ranked and looked at the replacements too, so all 200 final thumbnails were seen.
- **Thumbnails.** All 200 images (hqdefault, images only, no video) were looked at by me in labelled contact sheets of 20; the single sheet of all 200 is `docs/research/data/top200-contact-sheet.png`. Tags per video are my reading (`top200-thumbnail-tags.json`), not machine output.
- **Patterns.** 12 named patterns, assigned by fixed rules on visible signals only (`RISE_PATTERNS`): the first rule that matches names the video. Rules are keyword- and channel-based, so some videos sit in a pattern that a person would argue with; read each pattern as a hypothesis about why.

## 2. What the 200 look like (facts)
- Channels: The B1M 42, Mentour Pilot 28, Practical Engineering 24, Fascinating Horror 18, Stewart Hicks 17, Real Engineering 15, blancolirio 15, Kyle Hill 10, Half as Interesting 8, Adam Something 6, Plainly Difficult 5, Not Just Bikes 4, Engineering with Rosie 3, Wendover 3, Disaster Breakdown 2. **Fifteen channels, and five of them hold 129 of the 200 rows.**
- Age: 58 under 6 months, 44 from 6 to 12 months, 98 from 1 to 3 years. Median length 17.1 min (middle half 13.5–26.3); median title 7 words (5–13); 28 titles are questions; 65 carry a number or money amount; 61 have 3+ description chapters; 199 of 200 have a description opening, and 73 of them put a sponsor or support line in the first 160 characters (the opening is rarely the story).

## 3. The rise patterns

Medians are per pattern. Outlier = views ÷ the channel's median video, so 1.0 is the channel's normal. Views/day and the rank score are absolute, so they mostly rank big channels higher; compare the outlier column across patterns, not views.

| # | Pattern | Videos | Median min | Median outlier | Median age (days) | Most common thumbnail devices |
|---|---|---|---|---|---|---|
| 1 | **Fresh news peg** | 45 | 15.7 | 1.509x | 81 | short-text 71%, disaster-image 31%, aircraft 27%, aerial-or-render 24% |
| 2 | **Named catastrophe explained** | 2 | 21.8 | 2.87x | 429 | short-text 100%, disaster-image 100%, aerial-or-render 50%, accusing-or-emotion-word 50% |
| 3 | **Accident investigation** | 45 | 38.1 | 2.075x | 475 | short-text 93%, aircraft 62%, disaster-image 44%, vintage-serif-black 31% |
| 4 | **Why it failed / collapsed** | 7 | 17.5 | 2.079x | 368 | short-text 57%, aerial-or-render 43%, disaster-image 29%, number-or-money 29% |
| 5 | **Billion-dollar project** | 10 | 16.7 | 1.339x | 268 | short-text 70%, aerial-or-render 60%, number-or-money 40%, map 40% |
| 6 | **Biggest / longest / impossible** | 13 | 17.5 | 1.775x | 423 | aerial-or-render 54%, short-text 46%, no-text 38%, diagram-annotated 31% |
| 7 | **How the hidden system works** | 10 | 17.4 | 3.004x | 673 | diagram-annotated 60%, short-text 50%, red-figure-model 40%, hands-on-demo 30% |
| 8 | **Mystery / unsolved / abandoned** | 4 | 17.6 | 3.821x | 832 | short-text 75%, disaster-image 25%, arrow-or-circle 25%, accusing-or-emotion-word 25% |
| 9 | **Contrarian 'it is broken' take** | 15 | 14.2 | 3.167x | 799 | short-text 80%, aerial-or-render 53%, accusing-or-emotion-word 40%, arrow-or-circle 40% |
| 10 | **Long-form event (30+ min)** | 4 | 46.9 | 2.137x | 713 | short-text 75%, aerial-or-render 75%, question-or-doubt 50%, no-text 25% |
| 11 | **Everyday-object curiosity** | 34 | 17.7 | 1.643x | 416 | short-text 50%, aerial-or-render 47%, no-text 41%, diagram-annotated 12% |
| 12 | **No visible single cause** | 11 | 17.9 | 1.809x | 538 | short-text 82%, aerial-or-render 64%, disaster-image 36%, question-or-doubt 27% |


#### 1. Fresh news peg (45 videos)

What the visible signals say: published in the last 5 months and already running 3x or more above its channel's normal views/day: a live event or trend (the peg itself is not in the data; check the date).

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [The World's Biggest Airport is About to Land](https://youtu.be/ZnBIsRFtbsA) | The B1M | 2026-09-02 | 4.7M | 54k | 3.597x | 1.3M | 16.6 | 8 | short-text, number-or-money, aerial-or-render |
| [Stopping the Unstoppable](https://youtu.be/-17mPnFxi30) | Practical Engineering | 2026-09-01 | 5.6M | 65k | 2.788x | 2.0M | 15.8 | – | no-text, aerial-or-render |
| [This Led To The Sterile Cockpit Rule: Eastern Airlines 212 / Fas](https://youtu.be/_blF6L04Dfk) | Fascinating Horror | 2026-09-08 | 2.4M | 30k | 4.835x | 501k | 11.6 | – | vintage-serif-black, disaster-image |

#### 2. Named catastrophe explained (2 videos)

What the visible signals say: a famous failure by name (a dam, a rocket, a plane) with a 'why' or 'what really happened' promise.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Chernobyl’s Breach is Worse Than Anyone Thought](https://youtu.be/Q6UX1eE1am4) | Kyle Hill | 2026-04-26 | 1.5M | 7k | 2.87x | 507k | 15.2 | 4 | aerial-or-render, short-text, accusing-or-emotion-word, disaster-image |
| [The Chernobyl Shield Is Broken – Here’s What That Means](https://youtu.be/zz_hlKSwXUw) | The B1M | 2025-09-24 | 2.6M | 6k | 2.033x | 1.3M | 21.8 | 7 | short-text, disaster-image, date-stamp |

#### 3. Accident investigation (45 videos)

What the visible signals say: an aviation or industrial accident walked through step by step; long, serial, loyal audience.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [A NEW Trace! The FULL MH370 Story, so Far..](https://youtu.be/Y5K9HBiJpuk) | Mentour Pilot | 2024-03-16 | 7.6M | 8k | 4.712x | 1.6M | 56.1 | – | short-text, aircraft, map |
| [Dead on Arrival: The Soyuz 11 Disaster / A Short Documentary / F](https://youtu.be/Z4oiYtvavTY) | Fascinating Horror | 2024-10-01 | 3.4M | 4k | 6.796x | 501k | 13 | – | vintage-serif-black, short-text, no-text |
| [Joints Stuffed With Newspaper: The Ronan Point Disaster / A Shor](https://youtu.be/BtJUbTa8q0M) | Fascinating Horror | 2024-07-30 | 2.8M | 3k | 5.678x | 501k | 13.2 | – | vintage-serif-black, short-text, disaster-image |

#### 4. Why it failed / collapsed (7 videos)

What the visible signals say: the title is a question about a failure: the viewer wants the cause.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Why Are Beach Holes So Deadly?](https://youtu.be/0kQXOTcEB_E) | Practical Engineering | 2025-04-01 | 7.2M | 12k | 3.573x | 2.0M | 16.2 | – | no-text |
| [How the World’s Most Remote Megaproject Went Wrong](https://youtu.be/00BHXAzYRTA) | The B1M | 2026-03-25 | 2.7M | 11k | 2.079x | 1.3M | 15.1 | 8 | short-text, arrow-or-circle, map |
| [When You Don’t “Drop and Run” - Cobalt-60 Accidents](https://youtu.be/axfHOu5n72E) | Kyle Hill | 2025-12-06 | 1.7M | 5k | 3.314x | 507k | 18.1 | 5 | short-text, accusing-or-emotion-word, disaster-image, vintage-serif-black |

#### 5. Billion-dollar project (10 videos)

What the visible signals say: a project sold by its price tag or scale number, often with a 'no one uses it' or 'will it work' edge.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [The $29BN Megaproject in the Heart of a Mountain](https://youtu.be/NFrr-L_BcC4) | The B1M | 2025-12-10 | 3.0M | 8k | 2.292x | 1.3M | 28.7 | 13 | number-or-money, short-text, aerial-or-render |
| [Why the US Drops 14.7 Million Worms On Panama Every Week](https://youtu.be/Olj8arvfYj4) | Half as Interesting | 2024-06-06 | 3.5M | 4k | 4.88x | 708k | 8.3 | – | map, diagram-annotated, short-text, aircraft |
| [The $12.5BN Airport That Will Overhaul World Travel](https://youtu.be/GPh5xtXWwT8) | The B1M | 2026-07-08 | 1.6M | 11k | 1.246x | 1.3M | 16 | 7 | aerial-or-render, no-text |

#### 6. Biggest / longest / impossible (13 videos)

What the visible signals say: a record or an extreme the viewer can picture in one word.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Norway is Building The World's Deepest Mega-Tunnel](https://youtu.be/Ho2luOd8JH4) | The B1M | 2026-06-03 | 2.7M | 15k | 2.068x | 1.3M | 29.5 | 11 | aerial-or-render, no-text |
| [Brooklyn’s Only Interstate Is Doomed](https://youtu.be/hfsoz_K-J8A) | Half as Interesting | 2025-02-21 | 2.9M | 4k | 4.077x | 708k | 8.1 | – | diagram-annotated, arrow-or-circle, short-text |
| [The Biggest Train Station in the World is Now Open](https://youtu.be/D-Oa2vEr8Rs) | The B1M | 2026-04-22 | 1.9M | 9k | 1.503x | 1.3M | 19.6 | 6 | aerial-or-render, no-text |

#### 7. How the hidden system works (10 videos)

What the visible signals say: an everyday system (grid, sewer, road, dam) the viewer uses but never saw explained.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Why Are Cooling Towers Shaped Like That?](https://youtu.be/tmbZVmXyOXM) | Practical Engineering | 2024-11-05 | 9.5M | 13k | 4.712x | 2.0M | 19.8 | – | face, hands-on-demo |
| [How Reality TV Houses Are Built to Break People](https://youtu.be/HVsSppFuzv0) | Stewart Hicks | 2024-10-24 | 4.0M | 5k | 7.525x | 527k | 17.4 | – | diagram-annotated, red-figure-model, short-text |
| [Why Roads Get Washboards](https://youtu.be/3YvwqMDDb3k) | Practical Engineering | 2026-06-02 | 3.4M | 19k | 1.683x | 2.0M | 17.9 | – | no-text, hands-on-demo |

#### 8. Mystery / unsolved / abandoned (4 videos)

What the visible signals say: a puzzle or lost thing: an open question in the title.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Abandoned Concrete and Steel Tower Full of Squatters Collapses I](https://youtu.be/DT6KJIARP9U) | Plainly Difficult | 2024-08-17 | 1.6M | 2k | 4.84x | 325k | 12.2 | – | short-text, disaster-image |
| [The Windowless Skyscraper Conspiracy](https://youtu.be/4GY77EZzjyo) | Stewart Hicks | 2023-11-30 | 2.0M | 2k | 3.821x | 527k | 13.8 | – | short-text, arrow-or-circle, accusing-or-emotion-word |
| [When Abandoned Mines Collapse](https://youtu.be/RZg1zOKm5wk) | Practical Engineering | 2025-05-06 | 2.8M | 5k | 1.389x | 2.0M | 17.6 | – | diagram-annotated, no-text |

#### 9. Contrarian 'it is broken' take (15 videos)

What the visible signals say: an opinionated, often urban or transit angle on why something built is bad; author-led, thumbnail-led.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [The Invention that Accidentally Made McMansions](https://youtu.be/3oIeLGkSCMA) | Stewart Hicks | 2024-12-12 | 3.1M | 4k | 5.848x | 527k | 14.2 | – | diagram-annotated, short-text, question-or-doubt |
| [Pangeos Terayacht: An $8 Billion Engineering Disaster](https://youtu.be/6E_FwOz_RtM) | Adam Something | 2024-02-23 | 3.4M | 3k | 4.616x | 742k | 12.7 | – | face, short-text, accusing-or-emotion-word, aerial-or-render |
| [How Upside-Down Models Revolutionized Architecture](https://youtu.be/iRv_syz2DAc) | Stewart Hicks | 2024-09-19 | 2.4M | 3k | 4.51x | 527k | 14.8 | – | short-text, aerial-or-render |

#### 10. Long-form event (30+ min) (4 videos)

What the visible signals say: a feature-length film; the length itself is the promise.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Is The Line Really Dead?](https://youtu.be/zFVYgZMEOFg) | The B1M | 2025-12-18 | 4.3M | 13k | 3.33x | 1.3M | 30.7 | 9 | short-text, question-or-doubt, aerial-or-render |
| [How The Space Shuttle Worked / Full Documentary](https://youtu.be/w4FCkbPykdQ) | Real Engineering | 2024-12-14 | 4.9M | 7k | 2.137x | 2.3M | 77.8 | – | aerial-or-render, no-text |
| [Could This Be The Next Air Force One? - Hermeus](https://youtu.be/UyKtxsdI0z8) | Real Engineering | 2024-02-29 | 4.6M | 5k | 2.012x | 2.3M | 46.9 | – | short-text, aerial-or-render, question-or-doubt |

#### 11. Everyday-object curiosity (34 videos)

What the visible signals say: a plain, short title about a familiar thing with a hidden catch.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [The Hidden Engineering of Landfills](https://youtu.be/HRx_dZawN44) | Practical Engineering | 2024-09-03 | 12.0M | 15k | 5.933x | 2.0M | 17.1 | – | face, hands-on-demo |
| [The Wild Story of the Taum Sauk Dam Failure](https://youtu.be/zRM2AnwNY20) | Practical Engineering | 2024-10-15 | 11.5M | 15k | 5.698x | 2.0M | 20.2 | – | aerial-or-render, no-text, disaster-image |
| [The Los Angeles Aqueduct is Wild](https://youtu.be/PhW2BjFQCZM) | Practical Engineering | 2026-03-17 | 5.2M | 20k | 2.559x | 2.0M | 23 | – | no-text |

#### 12. No visible single cause (11 videos)

What the visible signals say: none of the visible signals above is decisive.

| Video | Channel | Published | Views | /day | Outlier | Channel median | Min | Ch | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|---|
| [Why China Split a Mountain in Half to Build a Bridge](https://youtu.be/79xontgRjyU) | The B1M | 2025-12-01 | 2.6M | 7k | 2.029x | 1.3M | 15.5 | 7 | no-text, aerial-or-render |
| [The Kramatorsk Radiation Accident - Nuclear Apartment](https://youtu.be/KAmxl9Nc50g) | Kyle Hill | 2025-03-27 | 2.1M | 3k | 4.109x | 507k | 17.9 | 6 | short-text, disaster-image, vintage-serif-black |
| [Why Railroads Don't Need Expansion Joints](https://youtu.be/zqmOSMAtadc) | Practical Engineering | 2023-12-05 | 5.3M | 5k | 2.631x | 2.0M | 15.9 | – | no-text, disaster-image |


## 4. Reading (my opinion, from visible signals)
1. **Accident investigation (45) is the volume engine of the niche**, not the outlier engine: long (38 min median), made by four channels (Mentour Pilot, Fascinating Horror, Disaster Breakdown, blancolirio), outlier about 2x. It rises on a named flight or event, a one-line stake ("They lied", "Stolen", "Not again?") and a plane or wreck in the thumbnail. A film in this style is a series business.
2. **The highest outliers come from the smallest patterns:** how a hidden system works (3.0x), the contrarian "it is broken" take (3.2x) and mysteries (3.8x, 4 videos, weak evidence). The viewer meets an ordinary object or place and a hidden catch; the thumbnail is a diagram, a red-figure model or a clean aerial with 1–4 words.
3. **News pegs lift fast but regress.** The 45 fresh-peg videos are under 150 days old and run 3x or more above their channel's usual views/day, but their outlier is only 1.5x: part of the speed is the news itself. The date on the thumbnail (blancolirio: "9 September, 2026") or a live event names the peg; for the others the data cannot say what the peg was.
4. **Money megaprojects are the weakest riser (1.3x).** A price tag in the title and thumbnail ($35BN, £102BN, $2BN) is common (40% of the pattern's thumbnails) but did not separate this group from others.
5. **Thumbnails.** Most winners use 1–4 words that add to the title (142 of 200 have short text); the 40 with no text at all had a higher median rise score (views/day × outlier) than the rest, but that mixes in channel size; maps and numbers lead the megaproject ones; thumbnails dominated by a channel logo or an accusing word ("FAKE", "ILLEGAL", "GROSS") did worse than average in this sample. Treat these as leads: the sample is small and the channels differ in size.
6. **Packaging for us.** Titles run 5–13 words with a how/why opener or a plain statement; 17 minutes is the usual length; a 38-minute accident investigation is a different product.

## 5. What this cannot tell us
- **The spoken first 30 seconds and audience retention are not visible from outside.** No pattern says how these videos open, what they promise out loud, or where viewers leave; the thumbnail and title explain the click, not the watch.
- The news peg is only visible when the thumbnail carries a date; otherwise "fresh" means published recently and running fast.
- Five channels hold 65% of the rows; their audiences and release habits shape the patterns. Small rising channels are under-represented because the crawl starts from a list I chose.
- Views/day is lifetime views over age. Channel medians use at most the last 200 uploads. Pillars and patterns are keyword and channel rules, and tags are my reading of images.
- **No view count is promised.** Nothing here predicts a film's views.

## 6. How the code uses it
- `engine/src/topic-score.mjs`: `scoreTopic`/`rankTopics` take `{ prior }`; the title's lean toward what winners of its pillar use moves the total by at most 3 points (`priorLean` on each result; `local/topic-ranking.mjs` now passes the prior and regenerates `TOPIC_RANKING.md`). Test: `engine/test/reference-prior.test.mjs`.
- `engine/src/film-run.mjs`: with `referencePrior`, S1 and S7 receive `packagingBrief` (title length and formulas that winners over-use, thumbnail devices, length) for the topic's pillar. The packaging rules still win. Wired in `worker/index.mjs` and `local/run-film.mjs`. Test: `engine/test/film-run.test.mjs`.
- `.github/workflows/reference-prior.yml` refreshes the prior weekly.
