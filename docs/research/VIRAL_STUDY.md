# Viral long documentaries: what repeats (M1, 21 Nov 2026)

Owner's order: study 30+ of the most viral long documentaries across every niche. **Done: 36 videos, all 10M+ views, 10+ min.** Metadata only, no video downloaded. Extends `REFERENCE_STANDARD.md` (no second copy). Date checked: 2026-11-21.

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

## Found for others
- `/api/videos` returns no description (first lines and links not measurable). One field `description` (first 400 chars) would close it; belongs to the worker/ owner (Boss decides).
- The YouTube search quota (`/api/ideas`, 100 units per call, 10,000/day) is spent by a few dozen searches; the radar and this study share it.
- Follow-up in `viral.mjs`: after 08:00 UTC re-run to fill space/nature/business/true-crime at 10M+; then update the tables.

## Per-video rows are in `data/viral-handles.json`, `data/viral-candidates.json`, `data/owner-links.json` (id, views, length, chapters, thumbnail URL, check date).
