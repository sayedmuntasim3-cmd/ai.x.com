# Viral long documentaries: what repeats (M1, 21 Nov 2026)

Owner's order (extended 26 Nov to the 12 niches, see the section near the end): study 30+ of the most viral long documentaries across every niche. **Done: 36 videos, all 10M+ views, 10+ min.** Metadata only, no video downloaded. Extends `REFERENCE_STANDARD.md` (no second copy). Date checked: 2026-11-21.

## Sources and what was NOT seen
- Numbers (views, length, date, title, chapters): YouTube Data API through the Worker `GET /api/videos` (`data/*.json`; tools `tools/research/viral*.mjs`). Source for every number below. "My reading" = my judgement.
- Thumbnails: each image fetched (`i.ytimg.com`, 320 px) and **looked at** in contact sheets; the notes are my reading.
- **Not seen:** the spoken first 30 s, shot rhythm, music, retention curves (private to the channel owner). The "hook" below is only what title + thumbnail + first chapter promise.
- **Not returned by the route:** description text (first 2 lines, links). Only chapters parsed from it. `/api/videos` has no description field (route is outside my files; asked via "Found for others" below).
- **Gaps (plain):** YouTube search quota hit 429 on 21 Nov, so niche search for space, nature, business, motivation and true-crime stopped after one query. Those niches are thin at 10M+: space 4, nature 3, business 1, motivation 1 (a talk show, not a documentary). Only 6 of 36 are above 50M; there is no 40-50M+ nature, business or motivation film in my set. A re-run of `viral.mjs` after the quota reset (08:00 UTC) will fill them; tables must not be read as "these niches do not go viral".
- Bias: a few channels supply many rows (OverSimplified 4, Ruhi Çenet 8, LEMMiNO 4, Veritasium 3, Yarnhub 3). Patterns are of these channels.
- 4 History rows are long compilations/cartoon explainers; two (Best Documentary, 91-100 min) are re-upload style, not an original-film model (see REFERENCE_STANDARD "what not to copy").

## Per-niche tables (columns: views, minutes, title words; Num/?/: = digit, question mark, colon in the title)
### history
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [WW2 - OverSimplified (Part 1)](https://youtu.be/_uk_6vfqwTA) | OverSimplified | 106.0M | 14 | 2018-03 | 5 | Y | none | cartoon faces, 2 words, red+blue map |
| [The Cold War - OverSimplified (Part 1)](https://youtu.be/I79TpDe3t2g) | OverSimplified | 75.7M | 16 | 2019-01 | 7 | Y | none | cartoon faces, 3 words, map colours |
| [The Napoleonic Wars  - OverSimplified (Part 1)](https://youtu.be/zqllxbPWKNI) | OverSimplified | 69.7M | 30 | 2021-05 | 7 | Y | none | cartoon rider, 3 words |
| [The French Revolution - OverSimplified (Part 1)](https://youtu.be/8qRZcXIODNU) | OverSimplified | 51.9M | 18 | 2019-06 | 7 | Y | none | cartoon faces, 3 words |
| [How a Nighthawk Was Shot Down](https://youtu.be/Zd88lzCWjpA) | Yarnhub | 34.2M | 12 | 2024-10 | 6 |  | 8 ch; 1st "F-117 Nighthawk crosses " (74s long) | no face, no text, dark jet CGI |
| [When F-16 Falcons Ate Hawks for Breakfast](https://youtu.be/WevXTsed_oc) | Yarnhub | 33.1M | 12 | 2025-01 | 7 | Y | 8 ch; 1st "J-21 Jastrebs are on a b" (128s long) | no face, no text, jet CGI |
| [Midway From The Japanese Perspective](https://youtu.be/fFEqwaRmDZI) | Yarnhub | 19.1M | 18 | 2024-03 | 5 |  | 14 ch; 1st "Kidō Butai is on its way" (69s long) | no face, no text, ship CGI |
| [The Only Nazi Hitler Feared](https://youtu.be/VKXQnBlzqzs) | fern | 12.3M | 19 | 2026-02 | 5 |  | none | real face, 2 words "WORSE THAN HITLER?", red glow on black |
| [How 130,000 Soldiers Stormed Normandy in One Day](https://youtu.be/0UJYYkK4d8s) | Best Documentary | 60.6M | 100 | 2022-02 | 8 | Y | 11 ch; 1st "The June 6, 1944" (187s long) | no face, no text, D-Day photo look; 100 min film |

### bio
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [Hitler and the Lords of Evil: The Rise, Betrayal, and Down](https://youtu.be/SsGNUn-WI5c) | Best Documentary | 24.4M | 91 | 2022-09 | 15 | : | 9 ch; 1st "🇩🇪 Hitler's image as a" (636s long) | real face (Hitler photo), no text; 91 min film |

### science
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [The Closest Thing We Have to Alien Technology](https://youtu.be/MiUHjLxm3V0) | Veritasium | 66.9M | 55 | 2025-12 | 8 |  | none | no face, 4 words "This shouldn't exist.", white on black, red underline |
| [The Insane Real Engineering of the Nazi Enigma Machine](https://youtu.be/JsBZOcqZerk) | Veritasium | 22.3M | 48 | 2026-09 | 9 |  | none | no face, 2 words "We cracked it", red figure for scale |
| [There Is Something Faster Than Light](https://youtu.be/NIk_0AW5hFU) | Veritasium | 17.7M | 44 | 2025-12 | 6 |  | none | no face, 2 words "see ya!", red+blue light beams |
| [AI Just Crossed the Terrifying Line - Now What?](https://youtu.be/ujkD4SxPKOI) | Kurzgesagt – In a  | 24.2M | 22 | 2026-10 | 9 | ? | none | no face, 3 words "WE LOST CONTROL", red eye, high contrast |
| [We Finally Know More About Humanity’s First Civilization](https://youtu.be/_y9JuojAIg0) | Kurzgesagt – In a  | 12.5M | 18 | 2026-10 | 8 |  | none | no face, 2 words "LOST FOREVER", clay faces, purple |
| [What's Hidden Under Antarctica?](https://youtu.be/XfGEMCb6BQU) | Cleo Abram | 10.9M | 19 | 2026-05 | 4 | ? | 13 ch; 1st "What’s hiding under Anta" (110s long) | real face (woman, shocked), text "THEY FOUND IT?", cutaway map |

### space
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [Visiting the Closest Town to Space (Life with 50% less oxy](https://youtu.be/KqaGdcQh5jA) | Ruhi Cenet Documen | 67.9M | 13 | 2023-12 | 11 | Y | none | real face with oxygen mask, number "16,700 ft", clouds+town |
| [Journey to the edge of the Observable Universe](https://youtu.be/U9WOMerccoM) | Spacetime | 19.1M | 10 | 2024-02 | 8 |  | 8 ch; 1st "Earth" (120s long) | no face, "63 Billion LY" tiny, black dot sphere |
| [How Big is The Universe?](https://youtu.be/pSHVbLPWA28) | Science Time | 15.7M | 11 | 2024-02 | 5 | ? | none | no face, 4 words "HOW BIG is the Universe?", black+white |
| [Why Humanity Will Never Leave The Solar System](https://youtu.be/Cyl3X88KEgg) | Kurzgesagt – In a  | 11.2M | 13 | 2026-08 | 8 |  | none | no face, "IT'S IMPOSSIBLE*", blue+orange rocket |

### nature
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [The World's Largest Cave: It Has a Forest, a River, and Cl](https://youtu.be/87Jor5G_NBs) | Ruhi Cenet Documen | 83.5M | 16 | 2025-03 | 13 | : | none | real face, place name "Sơn Đoòng", cave+forest, orange jacket |
| [Exploring the Most Remote Island on Earth (15 Days Just to](https://youtu.be/mJYxSed0D_I) | Ruhi Cenet Documen | 34.9M | 20 | 2026-10 | 13 | Y | none | real face, 4 distance numbers + place names, map |
| [Eight Wonders Of Our Solar System / The Planets / BBC Eart](https://youtu.be/wkQuOrsgVGY) | BBC Earth Science | 10.6M | 66 | 2023-02 | 13 |  | 11 ch; 1st "Introduction" (10s long) | no face, no text, Saturn rings |

### crime
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [Cicada 3301: An Internet Mystery](https://youtu.be/I2O7blSSzpI) | LEMMiNO | 43.2M | 18 | 2018-05 | 5 | Y: | 4 ch; 1st "The First Puzzle" (319s long) | no face, title text, cicada, black+red |
| [The Vanishing of Flight 370](https://youtu.be/kd2KEHvK-q8) | LEMMiNO | 30.3M | 25 | 2019-04 | 5 | Y | none | no face, no text, white plane on pale blue |
| [The Search For D. B. Cooper](https://youtu.be/CbUjuwhQPKs) | LEMMiNO | 24.6M | 29 | 2020-04 | 6 |  | 7 ch; 1st "Intro" (50s long) | no face, no text, red falling figure on dark blue |
| [smartschoolboy9: An Internet Rabbit Hole](https://youtu.be/V0folj9X9nQ) | Nick Crowley | 13.8M | 27 | 2024-08 | 5 | Y: | 6 ch; 1st "INTRO" (183s long) | distorted face, series name text, red/black |
| [The Enduring Mystery of Jack the Ripper](https://youtu.be/lADBHDg-JtA) | LEMMiNO | 16.4M | 69 | 2021-09 | 7 |  | 13 ch; 1st "Intro" (78s long) | no face, no text, knife on top hat, rose, dark |

### geo
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [The World's Highest Security Prison: CECOT (The most evil ](https://youtu.be/H42zWaD4A4s) | Ruhi Cenet Documen | 202.6M | 21 | 2025-02 | 12 | : | none | real face + rows of tattooed prisoners, no text |
| [America’s Most Secretive Jewish Community: Hasidic Jews (4](https://youtu.be/l6UtZ-u9CyM) | Ruhi Cenet Documen | 92.3M | 40 | 2026-08 | 10 | Y: | none | real face + crowd of Hasidic men, no text |
| [INSIDE the World’s Most Dangerous City 🇭🇹 (INSANE)](https://youtu.be/pSwucL9cRXQ) | Joe HaTTab | 27.9M | 19 | 2025-11 | 8 |  | none | real face in press vest, flag, fire, running man, no text |
| [Sneaking into Epstein's Temple](https://youtu.be/PkU8FTafNQU) | SideQuest Drew | 28.0M | 33 | 2026-04 | 4 |  | 10 ch; 1st "Preparing for the Missio" (184s long) | real face, grabbing door of temple, red lifejacket |
| [The World’s Smallest Apartments: 16 ft² Coffin Homes in Ho](https://youtu.be/cwczifilQJY) | Ruhi Cenet Documen | 45.8M | 16 | 2026-01 | 11 | Y: | none | real face, cage-flat grid, no text |
| [30 Days on a Death Ship (A Mysterious Virus Broke Out, We ](https://youtu.be/D9p6GnDe4aI) | Ruhi Cenet Documen | 55.1M | 29 | 2026-10 | 14 | Y | none | real face, 4 words "LIVES LOST ONE AFTER ANOTHER", giant wave |

### business
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [🚗 BYD : The biggest SCAM of the car industry ?](https://youtu.be/tS_fJJxMjn4) | Statrys | 10.1M | 15 | 2026-04 | 11 | ?: | 6 ch; 1st "Intro" (96s long) | real face (Xi), 5 words "THE RISE AND FALL BYD", red on black |

### motivation
| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |
|---|---|---|---|---|---|---|---|---|
| [WW3 Threat Expert: The Warning We Are Ignoring, The Only W](https://youtu.be/3kuNW8hRc2U) | The Diary Of A CEO | 10.8M | 102 | 2026-10 | 18 | Y: | 31 ch; 1st "Intro" (121s long) | two real faces, 5 words "It Looks Like World War 3", red label |


## Summary numbers (computed from the 36 rows by `tools/research/viral-table.mjs`)
- Views: min 10.1M, median 28.0M.
- Length (min), quartiles 16 / 19 / 33; 19 of 36 are under 20 min; 8 are over 40 min.
- Title: median 8 words, 46 characters (quartiles 5 / 8 / 11); 15 carry a digit (includes "WW2", "370"); 4 a question mark; 9 a colon; 10 a superlative (most, largest, only, world's, never).
- Chapters present in 15 of 36; of those, the first real chapter starts a median ~120 s in (range 10-636 s), average chapter spacing median 3.2 min (range 1.3-10.5 min; n=15).
- Thumbnail (my reading): real human face in 15, cartoon characters in 4, **no text at all in 13**, the rest 2-5 words.

## Patterns that repeat (measured counts; the reading of why is "my reading")
1. **Title = a superlative, a named place/person/secret, or a number.** "The World's Highest Security Prison: CECOT", "The Only Nazi Hitler Feared", "30 Days on a Death Ship", "Cicada 3301", "The Vanishing of Flight 370". Plain topic titles are rare. The title opens a curiosity gap (who/what/why) the film must close.
2. **Series-style cartoon history wins on volume** (OverSimplified 52-106M) and 12-20 min jets/ships CGI wins at 19-34M (Yarnhub, 8 chapters, 1.3-1.6 min each), but these formats need animation/CGI Zupona cannot buy.
3. **Two thumbnail families** (my reading): (a) a real human face in a dangerous/odd place with one big object or crowd (Ruhi Çenet, Joe HaTTab, SideQuest: face + oxygen mask/prisoners/wave/press vest), often with a number or place name; (b) a **single object, no face, 2-4 words** in high contrast: black background, red accent, white serif/sans ("This shouldn't exist.", "We cracked it", "WE LOST CONTROL"). Mid-grey, busy, many-element thumbnails: none in the set. Colours repeat: black + red 10 of 36, blue/orange 4, white/pale 3 (my count by eye).
4. **Length is not the lever** (REFERENCE_STANDARD): 19 of 36 are under 20 min; 8 over 40 min are science/mystery deep dives or compilations.
5. **Chapters:** common in history, mystery, explainer (Yarnhub, LEMMiNO, Cleo Abram); absent in the 68-203M Ruhi Çenet films. Chapter 1 is usually "Intro" (5 of 15) or the hook scene itself (the title's promise: "F-117 Nighthawk crosses...", "What's hiding under Antarctica?").
6. **Hook promise (as far as metadata shows):** the title/thumbnail promise a risky place, a hidden thing or an impossible claim, and chapter 1 starts at 0:00 inside the scene, not with a channel intro (my reading from chapter names; the spoken 30 s unseen).

## What Zupona must do in each film (proposal; my opinion built on the counts above)
- **Title:** 5-9 words, one named subject, one of: superlative ("The Only..."), a number/day count, a "Why/How" question, or a place + secret. Make 3 options per film and pick one; never promise what the first chapter cannot show. Examples for the owner's niches: "The Only Man Who Refused Hitler (and Lived)", "What Is Hidden Under Antarctica?", "How the Enigma Code Was Broken in 1 Night" (placeholders, must be fact-checked first).
- **Thumbnail:** one subject, no clutter, 0-4 words, black/dark base + one red (or orange) accent, high contrast; a face only if licensed/free (no copied faces, no stills). Make 2 versions per film (object-only and face-style) for the owner to pick; export 1280x720 (zero cost: made by the render pipeline).
- **First 30 s:** start inside the most striking scene or claim, pay the title's promise within 30 s (YouTube's intro metric, see REFERENCE_STANDARD), no logo, no "welcome", no long context before the first reveal. Add a re-hook every 1.5-3 min (the median chapter gap measured).
- **Chapters:** write them into the description: chapter 1 at 0:00 named as the hook scene (not "Intro"); one chapter per 1.5-3 min for 15-25 min films (mystery/history rhythm: 1.3-4.7 min in the sample), 5-10 min only for 60+ min compilations (not our target).
- **Length:** 13-25 min for the first films (19 min is the median here), longer only when the topic carries it.
- **Quran recitation films:** none of the 36 are a model (Arabic recitation is outside this set); do not copy these patterns onto them without a separate study.

## The owner's 12 niches: top 3 long videos and free real footage (26 Nov 2026)
Rule: long (10+ min), English, USA-style audience, ranked by views from the YouTube Data API (`data/niche-candidates*.json`, `data/niche-handles.json`; tools `niches.mjs`, `niche-handles.mjs`, `niche-table.mjs`). Date checked: 2026-11-26. Views are the API values on that day; the table above (21 Nov) may differ for the same video.

**Gaps (plain):** the YouTube search quota hit 429 again on 26 Nov, so 12 of 24 second-round queries (cars, WWII, tech, nature, geography) ran only through channel uploads (`/api/videos?handle=`, last 50 uploads per channel). A niche's "top 3" is therefore the top 3 *found*, not proven to be the top 3 on YouTube. Niches thin at 10M+ in what I found: Business (rank 2-3 near 10M), Automotive (9.4M, 9.0M), Engineering, Geography (no map-explainer film at 10M+). Re-run `niches.mjs 2` after the quota resets (08:00 UTC) to fill them. Search also returns off-topic hits; I picked by title by hand (my reading), and the notes name what I left out and why.

**Column "Free real footage (my reading)":** a rating of what Zupona can legally get for free as *real* footage (NASA, NARA/US government public domain, Internet Archive, Pixabay video). The rating is my reading from what those sources hold; the "IA items" number is a measured count from the Internet Archive search API (`tools/research/footage.mjs`, `data/niche-footage.json`). \*It counts movie items in collections `nasa`, `prelinger` or creator "National Archives" that match a few niche keywords with OR. Crude: it shows relative size, not quality, not usable length, and not rights per item (check each item's rights before use). Pixabay was not counted (no route to its API from here; Pixabay's own licence page decides use).

| Niche | # | Video | Channel | Views | Min | Date | Free real footage (my reading) | IA items* |
|---|---|---|---|---|---|---|---|---|
| **History & Civilizations** | 1 | [What Did Ancient Humans Actually Do All Day?](https://youtu.be/49_Ph2q6uIM) | Ink Explainer | 19.4M | 11 | 2026-08 | Medium | 2439 |
|  | 2 | [The Complete History Of The Roman Empire In 4 Hours / Empire…](https://youtu.be/P3IIRiSTc3g) | Odyssey - Ancient Hist | 14.1M | 233 | 2023-04 |  |  |
|  | 3 | [The Rise of Man - Homo Sapiens Invents Civilizations](https://youtu.be/4p51Jj2kyh0) | Best Documentary | 13.0M | 93 | 2023-11 |  |  |
| **Disasters & Mysteries** | 1 | [Cicada 3301: An Internet Mystery](https://youtu.be/I2O7blSSzpI) | LEMMiNO | 43.2M | 18 | 2018-05 | Medium-High | 2502 |
|  | 2 | [The Vanishing of Flight 370](https://youtu.be/kd2KEHvK-q8) | LEMMiNO | 30.3M | 25 | 2019-04 |  |  |
|  | 3 | [The Search For D. B. Cooper](https://youtu.be/CbUjuwhQPKs) | LEMMiNO | 24.6M | 29 | 2020-04 |  |  |
| **Science** | 1 | [The Closest Thing We Have to Alien Technology](https://youtu.be/MiUHjLxm3V0) | Veritasium | 66.9M | 55 | 2025-12 | High | 4228 |
|  | 2 | [AI Just Crossed the Terrifying Line - Now What?](https://youtu.be/ujkD4SxPKOI) | Kurzgesagt – In a Nuts | 24.2M | 22 | 2026-10 |  |  |
|  | 3 | [I finally saw quantum physics with my own eyes... (It's spoo…](https://youtu.be/KfODG5REyss) | Veritasium | 21.0M | 66 | 2026-11 |  |  |
| **Engineering & Megaprojects** | 1 | [CHINESE MEGASTRUCTURES / Wonders of Engineering](https://youtu.be/7wLhJ7q7By4) | Lifeder | 18.2M | 137 | 2026-10 | Medium | 2557 |
|  | 2 | [The Insane Scale of Europe’s New Mega-Tunnel](https://youtu.be/QiYvXKQksgI) | The B1M | 15.4M | 28 | 2022-11 |  |  |
|  | 3 | [Why the World’s Largest Megaproject Collapsed / WSJ](https://youtu.be/GbB3vFfiaVU) | The Wall Street Journa | 13.5M | 11 | 2026-08 |  |  |
| **Economics & Financial History** | 1 | [Principles for Dealing with the Changing World Order by Ray …](https://youtu.be/xguam0TKMw8) | Principles by Ray Dali | 245.7M | 44 | 2022-03 | Medium | 2569 |
|  | 2 | [Tune Out the Noise / Documentary Film](https://youtu.be/T98825bzcKw) | Dimensional Fund Advis | 32.1M | 88 | 2025-03 |  |  |
|  | 3 | [Age of Easy Money (full documentary) / FRONTLINE](https://youtu.be/EpMLAQbSYAw) | FRONTLINE PBS | Offici | 23.8M | 113 | 2023-03 |  |  |
| **Business & Company History** | 1 | [How America's Largest Buffet Survived The Death Of All-You-C…](https://youtu.be/TXg1mYN2tbw) | Business Insider | 10.6M | 18 | 2024-06 | Low-Medium | 4672 |
|  | 2 | [🚗 BYD : The biggest SCAM of the car industry ?](https://youtu.be/tS_fJJxMjn4) | Statrys | 10.1M | 15 | 2026-04 |  |  |
|  | 3 | [Rockefeller: The World’s First Billionaire](https://youtu.be/fNh_GyRbJDA) | MagnatesMedia | 7.8M | 50 | 2023-11 |  |  |
| **Automotive & Transport** | 1 | [Skoda Octavia Production Line: Inside the Complete Car Facto…](https://youtu.be/Tr1B18XJ8Z8) | GommeBlog - Car & Perf | 34.1M | 24 | 2022-01 | Medium | 6116 |
|  | 2 | [TITANIC of the Skies! - The Air France 447 Accident Explaine…](https://youtu.be/e5AGHEUxLME) | Mentour Pilot | 9.4M | 56 | 2022-12 |  |  |
|  | 3 | [ULTRA RARE Cars in Suspended Animation for Future Generation…](https://youtu.be/y0ygn8QKbGA) | Hagerty | 9.0M | 46 | 2024-03 |  |  |
| **WWII & Military** | 1 | [How 130,000 Soldiers Stormed Normandy in One Day](https://youtu.be/0UJYYkK4d8s) | Best Documentary | 60.6M | 100 | 2022-02 | Very high | 4874 |
|  | 2 | [World War II Every Day with Army Sizes](https://youtu.be/1CqGeAmVu1I) | Christopher | 47.0M | 13 | 2022-03 |  |  |
|  | 3 | [How a Nighthawk Was Shot Down](https://youtu.be/Zd88lzCWjpA) | Yarnhub | 34.2M | 12 | 2024-10 |  |  |
| **Space & Astronomy** | 1 | [Journey to the edge of the Observable Universe](https://youtu.be/U9WOMerccoM) | Spacetime | 19.1M | 10 | 2024-02 | Very high | 10572 |
|  | 2 | [How Big is The Universe?](https://youtu.be/pSHVbLPWA28) | Science Time | 15.7M | 11 | 2024-02 |  |  |
|  | 3 | [Shocking Discoveries Voyager Made at the Edge of the Solar S…](https://youtu.be/fSbm5LCJspk) | Destiny | 11.0M | 46 | 2025-01 |  |  |
| **Technology & Inventions** | 1 | [The Thinking Game / Full documentary / Tribeca Film Festival…](https://youtu.be/d95J8yzvjbQ) | Google DeepMind | 443.1M | 84 | 2025-11 | Medium | 2481 |
|  | 2 | [The Insane Real Engineering of the Nazi Enigma Machine](https://youtu.be/JsBZOcqZerk) | Veritasium | 22.3M | 48 | 2026-09 |  |  |
|  | 3 | [Fiber Optics are so much cooler than I thought](https://youtu.be/NiCgcUTL9_Q) | Veritasium | 16.7M | 35 | 2026-10 |  |  |
| **Nature & Ocean** | 1 | [The World's Largest Cave: It Has a Forest, a River, and Clou…](https://youtu.be/87Jor5G_NBs) | Ruhi Cenet Documentari | 83.5M | 16 | 2025-03 | High | 2417 |
|  | 2 | [Animals of Amazon 4K - Animals That Call The Jungle Home / A…](https://youtu.be/s7DbVTkaXn0) | Scenic Scenes | 42.0M | 28 | 2022-12 |  |  |
|  | 3 | [Travel to the Depths of Our Mysterious Oceans / 4K UHD / Blu…](https://youtu.be/EF8C4v7JIbA) | BBC Earth | 31.5M | 67 | 2023-09 |  |  |
| **Geography & Maps** | 1 | [The World's Highest Security Prison: CECOT (The most evil ar…](https://youtu.be/H42zWaD4A4s) | Ruhi Cenet Documentari | 202.6M | 21 | 2025-02 | High | 7356 |
|  | 2 | [America’s Most Secretive Jewish Community: Hasidic Jews (48 …](https://youtu.be/l6UtZ-u9CyM) | Ruhi Cenet Documentari | 92.3M | 40 | 2026-08 |  |  |
|  | 3 | [Dictator's Dilemma (Full Episode) / North Korea: Inside the …](https://youtu.be/9qRxNYuR2c4) | National Geographic | 40.7M | 44 | 2022-04 |  |  |

### Footage notes and picks (niche: what exists; note on picks)
- **History & Civilizations** (Medium): NARA/LoC photos and film for modern history; Internet Archive; museum open-access images for ancient (little real video of antiquity). Greek-mythology 210-min compilation (26.1M) left out: not history.
- **Disasters & Mysteries** (Medium-High): NARA, NOAA, USGS, FEMA, NTSB reports, old newsreels on Internet Archive; no footage of most modern mysteries (MH370, Cicada). Hindi/French disaster films (Dhruv Rathee 36.6M, Investigation 34.3M) skipped: not a USA audience.
- **Science** (High): NASA, NIH, NOAA, USGS video and images; Pixabay science/nature clips. Animation (Kurzgesagt) and lab shoots (Veritasium) are not free-footage films.
- **Engineering & Megaprojects** (Medium): US Army Corps, Bureau of Reclamation, NARA and Prelinger construction film for 1900-1970 projects; modern megaprojects (China, Saudi) have none free. First pick is a 137-min compilation. Only 3 films at 10M+ found.
- **Economics & Financial History** (Medium): NARA/LoC Depression photos and film, FRED/gov charts, Prelinger; modern markets none. Dalio film is animation. Folding Ideas NFTs (19.1M, 138 min) is 4th.
- **Business & Company History** (Low-Medium): Company footage is copyrighted; free only pre-1929, gov films, Prelinger ads. Thin at 10M+: third pick is 7.8M (MagnatesMedia). Search quota gap.
- **Automotive & Transport** (Medium): Prelinger (cars, rail, highways), NASA/NARA aviation, Smithsonian; modern car footage is copyrighted; Pixabay vehicle clips. Last two are under 10M (9.4M, 9.0M); a Disney Cars cartoon (50.8M) is not a documentary. Search quota gap.
- **WWII & Military** (Very high): NARA and US Army/Navy/Air Force film, Internet Archive, LoC; best free supply of any niche. Rank 1 is a 100-min re-upload style film; rank 2 is a map animation; rank 3 is CGI (Yarnhub).
- **Space & Astronomy** (Very high): NASA (images, video, audio are generally public domain), ESA/Hubble not all free. NASA Artemis II live broadcasts (28.0M, 19.3M, 234-383 min) left out: broadcasts, not films.
- **Technology & Inventions** (Medium): NASA, NARA, Prelinger, AT&T-era films on Internet Archive for pre-1990; modern tech/AI needs original screen capture. Rank 1 (443M) is a Google DeepMind film release, not a normal channel result.
- **Nature & Ocean** (High): NOAA Ocean Explorer, NPS, USGS, NASA Earth, Pixabay nature/ocean video. Rank 2 is 4K ambient footage (28 min, no story); rank 1 is a travel film (host on camera).
- **Geography & Maps** (High): LoC maps (public domain), NASA Earth Observatory, USGS, Pixabay aerials. Pure map-explainer channels (Wendover, RealLifeLore) had no 10M+ film in their latest 50; the three are place-journalism, not map films.

**Rank by free real footage (my reading; ties by IA count):** 1 Space (10.6k), 2 WWII & Military (4.9k), 3 Geography & Maps (7.4k) and Nature & Ocean, 5 Science (4.2k), then Disasters & Mysteries, Automotive & Transport (6.1k), Engineering, History, Technology (about 2.4-6k, mostly old film), last Economics and Business (company and market footage is mostly copyrighted). Do not rank on IA counts alone: Automotive and Business have many Prelinger ads and promotional films that are public domain but dated.

## Found for others
- `/api/videos` returns no description (first lines and links not measurable). One field `description` (first 400 chars) would close it; belongs to the worker/ owner (Boss decides).
- The YouTube search quota (`/api/ideas`, 100 units per call, 10,000/day) is spent by a few dozen searches; the radar and this study share it.
- Follow-up in `viral.mjs`: after 08:00 UTC re-run to fill space/nature/business/true-crime at 10M+; then update the tables.

## Per-video rows are in `data/viral-handles.json`, `data/viral-candidates.json`, `data/owner-links.json` (id, views, length, chapters, thumbnail URL, check date).
