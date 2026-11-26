# Three-minute test film: postmortem (W2, 26 Nov 2026)

Film: `993f09ea`, 0:00-3:00 slice, branch `claude/test-film-3min`, folder `docs/missions/proof/test-film/`.
Method: ffmpeg frame at the middle of every shot from the MP4, looked at one by one, plus `contact-sheet.jpg`;
LUFS and true peak measured with `ffmpeg -af ebur128=peak=true`. No code was changed.
Picture judgements are my reading of the frames. Where I know a fact from outside the repo I say so.

## 0. Headline facts

- The directive says 56 shots; the film has **55** (`SHOTLIST.md`, `film.report.json` scenes 55: 46 clips + 9 designed cards). The 56 is a miscount.
- **Class A (authentic historical): 0 of 55.** Class B (authentic present-day stock): 42. Class D: 13 (9 designed cards + 4 stock CGI: shots 3, 16, 22, 38). C and E: 0.
  A film about a man's childhood has no archive picture, no reconstruction and no honest "no picture exists" treatment.
- **Not one shot was chosen by the platform.** `SHOTLIST.md` "How it was made": the picture queries were archive-only (R2), found nothing,
  so the 55 shots were hand-picked from Pixabay, one per sentence (`picks.json`, `shots.json`). This film proves the picker returned 0, not that it works.
- SHOTLIST claims "every line was checked by looking at the frame". I find 13 shots that fail that check (below). The claim is not reliable.
- Whole film is a Pixabay-only film of a non-engineering topic: it cannot show the engineering standard of the new niche.

## 1. Audio (measured, `ffmpeg ebur128`, true-peak mode)

| Measure | Value | Reading |
|---|---|---|
| Integrated loudness | **-14.4 LUFS** | on the -14 target |
| True peak | **-1.4 dBTP** | passes the -1.0 limit (the first render was -0.8 and was blocked) |
| Loudness range | 1.9 LU | very flat: voice only, no music dynamics |
| Streams | AAC 48 kHz **mono**, 189 kb/s | mono; a stereo mix is not delivered |
| Music | none (`musicCues scripted 0 played 0`) | no score at all; 2 sound effects on designed cards |

## 2. Why 720p

- Measured: `h264 1280x720 30 fps 850 kb/s`, audio AAC mono.
- `docs/missions/proof/test-film/render.mjs:7` calls `buildTimeline({... width: 1280, height: 720 ...})`. The real renderer defaults to 1920x1080
  (`render/render-film.mjs:1280`: `args.width ?? 1920`). So 720p was a **hard-coded test-driver choice**, not a product preset.
- I found **no "export preset" in the film path** (`git grep` for 720/1280 in `render/render-film.mjs`, `local/voice-film.mjs`: none). The only 720p profile is
  `engine/src/device-profile.mjs:18` (`render:720p`, for a device with 2 GB RAM and 2 CPUs); that is the nearest candidate for the origin of the idea, but this run did not use it.
- The final file was then re-encoded two-pass at 850 kb/s (SHOTLIST). The renderer's own ceiling for 720p30 is
  `6000 x (1280x720)/(1920x1080) = 2667 kb/s` (`render/render-film.mjs:458`), so 850 kb/s is 3x under the product's own ceiling. Both choices were for file size.
- Verdict: the 720p output is acceptable for a test but **must never ship as a proof of quality**. W11 requires 1920x1080 30 fps.

## 3. Shot table

Class: A authentic historical, B authentic present-day, C reconstruction, D CGI / designed card, E AI.
Match = subject / place / era. Purpose = what the shot does for the sentence. Stage = root cause: query, ranking, critic, plan, render.
Priority: P0 breaks truth or trust, P1 visibly weak, P2 minor. Because the whole run was hand-picked, "ranking" is the shared root of every stock shot (the picker returned 0 candidates); the stage named is the stage that should have caught this particular defect.

| # | Time | Narration | Picture (what the frame shows) | Class | Match (subject/place/era) | Purpose | Verdict | Stage | Pri |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0:00.0 | Bengaluru, India. | Vidhana Soudha with traffic | B | yes / yes / present, not 2011 | names the place | keep | - | P2 |
| 2 | 0:01.9 | 2011, by most accounts. | aerial of dense city and interchange | B | place unproven / era no (clip dated 2026) | scale | weak: modern aerial for 2011 | ranking | P2 |
| 3 | 0:04.5 | A Rolls-Royce Ghost joins a rental fleet. | 3D model of a black Rolls-Royce on a wet floor | D | model is a Phantom-style, not a Ghost | shows the car | fail: fake car for a real-world claim | critic | P1 |
| 4 | 0:07.7 | Its buyer cuts hair, | clipper in hair, extreme close | B | subject yes | literal | ok | - | P2 |
| 5 | 0:10.9 | in 2025 he still does. | card "2025: still cutting hair" | D | n/a | restates the line | keep | - | P2 |
| 6 | 0:13.8 | A fleet owner behind a barber's chair, | split card Fleet owner / Barber | D | n/a | contrast | keep | - | P2 |
| 7 | 0:16.3 | but the car was only the first bill. | falling pink rupee notes | B | currency yes | decorative "bill" | weak: money-rain cliche | plan | P2 |
| 8 | 0:18.9 | The tax after it, he has said, nearly broke him. | bald European-looking man, hand on chin | B | wrong person, wrong place; reads as "him" | emotion | **fail**: a stranger presented as the subject | critic | P0 |
| 9 | 0:22.1 | So how does one used van become a Rolls-Royce? | white van on a lakeside road | B | place unproven | "used van" | weak | ranking | P2 |
| 10 | 0:25.0 | Scissors still in hand. | gloved hands cutting hair | B | subject yes | literal | ok (repeat of 4's idea) | plan | P2 |
| 11 | 0:27.4 | Follow the tax bill and what he put up. | pile of 2000-rupee notes | B | the Rs 2000 note exists only from Nov 2016 (outside fact) | money | fail on era if the film is about 2010-2011 | critic | P1 |
| 12 | 0:30.1 | His name is Ramesh Babu. | name card | D | n/a | names him | keep | - | P2 |
| 13 | 0:32.7 | He founded Ramesh Tours and Travels, | street with parked cars, grey | B | "fleet" not visible | fleet | weak | ranking | P2 |
| 14 | 0:35.9 | a car rental company in Bengaluru, | map of India with a Bengaluru pin | D | yes | place | keep, but a city map would say more | plan | P2 |
| 15 | 0:38.8 | a city once called Bangalore, one note before the numbers. | title card | D | n/a | title | keep; the title arrives under a sentence about something else | plan | P2 |
| 16 | 0:42.9 | Dollar figures here are rupees at that year's exchange rate... | 3D red rupee symbol, held 6 s | D | n/a | disclaimer | weak: one still idea held 6 s | plan | P2 |
| 17 | 0:48.8 | First the car, a Rolls-Royce Ghost, | neon-lit magenta car front | B | a Rolls-Royce shape, model unproven | the car | weak: stylised, not the named model | critic | P2 |
| 18 | 0:52.4 | bought in 2011 by most accounts. One report says 2010, | split card 2011 / 2010 | D | n/a | the conflict | keep (best use of a card) | - | P2 |
| 19 | 0:58.0 | Then the chair. In 2025, he was still cutting hair... | vintage alarm clock beside books | B | no link | "years passing" | **fail**: filler for "the chair" | plan | P1 |
| 20 | 1:03.2 | Headlines call him the billionaire barber. | quote card | D | n/a | the headline | keep (needed a test-only `graphic` patch, see section 6) | render | P2 |
| 21 | 1:06.0 | No filing we could find backs that up. | hands flipping through crates | B | looks like vinyl records, not filed documents | "filing" | **fail**: wrong object | critic | P1 |
| 22 | 1:09.0 | So we follow the money to understand the car, | 3D coin stacks on a tablet | D | n/a | "money" | weak: stock CGI | plan | P2 |
| 23 | 1:12.0 | start with a road. | Indian crossroads, auto-rickshaws | B | India yes, Bengaluru unproven | road | ok | - | P2 |
| 24 | 1:13.7 | Brigade Road in the heart of Bengaluru | busy street with a temple | B | "Brigade Road" unproven (SHOTLIST admits) | names the road | weak: unverifiable place claim | ranking | P1 |
| 25 | 1:17.0 | back when most people still called the city Bangalore. | temple street, trucks, modern | B | era no | old name | weak: modern for the past | ranking | P1 |
| 26 | 1:20.5 | His father was a barber there. | a black electric clipper | B | era no: the frame shows a modern clipper, SHOTLIST says "old manual" | father's trade | fail on era | critic | P1 |
| 27 | 1:22.8 | ...the family had a small shop on Brigade Road. | shop street with rickshaw, motorbikes | B | place plausible, era no | the shop | weak | ranking | P2 |
| 28 | 1:27.5 | Reports give his father's name as Paul, | photographs by candle light | B | no link | "records" | weak filler, but harmless | plan | P2 |
| 29 | 1:31.5 | a chair, a mirror, | cabin window onto pine forest, candles | B | no chair, no mirror, not India (SHOTLIST: "an old chair by a window") | the tools | **fail** | critic | P1 |
| 30 | 1:33.6 | a strop, a razor, a pair of scissors. | foam shave, razor | B | razor only, no strop, no scissors | the tools | ok for razor | - | P2 |
| 31 | 1:37.0 | A barber shop is a trade done with the hands, | hands with scissors and comb | B | yes | trade | ok | - | P2 |
| 32 | 1:39.8 | one customer at a time all day. | analog clock face | B | no link | "all day" | weak filler (second clock, see 19) | plan | P2 |
| 33 | 1:42.1 | Most of what we know ... comes from interviews | studio microphone and mixing desk | B | generic | "interviews" | weak: the known "generic mic" | query | P1 |
| 34 | 1:46.0 | to YourStory, The Better India and others. | Western man with a laptop in an office | B | wrong place and people | "news sites" | **fail**: generic office man | query | P1 |
| 35 | 1:51.4 | On the basics, they mostly agree... | handwritten pages | B | generic | "the record" | ok | - | P2 |
| 36 | 1:55.8 | When Ramesh was seven years old, his father died. | counter card to "7 years old" | D | n/a | the key beat | keep (strong) | - | P2 |
| 37 | 1:59.6 | Almost every account agrees on that age. | boy in a yellow shirt on a ledge | B | a real child present-day, shown as the subject at 7 | "that age" | **fail**: a stranger child as the subject | critic | P0 |
| 38 | 2:02.2 | They do not agree on the year and none of them gives a cause. | 3D "20" digits | D | n/a | "year" | weak: unfinished-looking | plan | P2 |
| 39 | 2:06.3 | So this film gives neither. Seven is the age every telling keeps. | kinetic text card | D | n/a | the line | keep | - | P2 |
| 40 | 2:11.0 | What a seven year old understood about money is not on record. | a worn coin on a wet floor | B | a European-looking coin (the owner flagged this on shot 16) | "money" | **fail**: the same defect already rejected once | critic | P1 |
| 41 | 2:15.5 | What is on record is what happened next to the shop and to the family. | young woman at a window | B | a stranger, reads as the mother | "family" | weak, near P0 | critic | P1 |
| 42 | 2:20.1 | A barber shop does not close by itself. | shop behind red grille gate at night | B | place unproven | shop closing | ok | - | P2 |
| 43 | 2:23.0 | The chair, the mirror and the tools were still there on Brigade Road. | modern upscale salon | B | era no, class no (luxury salon for a small 1980s shop) | the shop | **fail** | critic | P1 |
| 44 | 2:27.5 | The man who used them was gone. | abandoned chair in dust and light | B | mood yes | absence | good | - | P2 |
| 45 | 2:29.6 | His mother was left with the household | woman at a wood fire | B | stranger, reads as the mother | household | weak, near P0 | critic | P1 |
| 46 | 2:32.3 | and with a shop that someone now had to run. | Western woman at a sewing machine | B | wrong place | "run" | **fail** (SHOTLIST admits it) | critic | P1 |
| 47 | 2:35.2 | Who that was and on what terms depends on the account. | top view hands writing | B | generic | "account" | ok filler | - | P2 |
| 48 | 2:38.8 | For now, hold on to one image. | glowing bulb | B | generic | image | ok | - | P2 |
| 49 | 2:41.2 | A shop on a busy road, | street, woman in sari, shops | B | India yes | the image | good | - | P2 |
| 50 | 2:43.0 | a chair under a light and a family that needed that door to stay open. | door opening to light | B | metaphor | the image | ok | - | P2 |
| 51 | 2:47.4 | Around them, the city kept moving. | aerial busy road with a bus | B | India yes | city | ok | - | P2 |
| 52 | 2:49.8 | Buses, bicycles, | yellow taxis and buses in Kolkata | B | wrong city (SHOTLIST says Kolkata) | buses | fail on place | critic | P1 |
| 53 | 2:51.6 | hand carts, | cycle-rickshaw cart in a market | B | India yes | carts | ok | - | P2 |
| 54 | 2:52.9 | the steady noise of traffic... | auto-rickshaw jam | B | India yes | traffic | good | - | P2 |
| 55 | 2:56.5 | and the shop stayed open. | hanging warm bulbs | B | generic | closing image | ok | - | P2 |

Counts: 13 fail (3, 8, 11, 19, 21, 26, 29, 34, 37, 40, 43, 46, 52); P0 are 8 and 37; the rest are weak or ok. Cards (9) are the strongest shots.

## 4. Pattern of the defects

1. **Stranger-as-subject (P0).** Shots 8, 37, 41, 45 put real people, one of them a child, on screen where the sentence is about the named man or his family.
   There is no rule in the picker or critic against a recognisable stranger standing in for a real, named person. The shotlist even notes it removed five barber shots for this
   (owner's question, 21 Nov) and then added 8 and 37.
2. **Modern footage for the father's era.** Shots 2, 11, 25, 26, 27, 43 (SHOTLIST admits "Father-era shots use modern footage"). No era filter, no "no archive exists" fallback to a designed card or a still.
3. **Generic stock for abstract words.** Mic (33), office man (34), clocks (19, 32), coin (40), 3D coins (22). The query was the noun in the sentence, not what the viewer should see.
4. **Wrong place passed because only the country was checked.** Kolkata (52), Western sewing (46), forest cabin (29). Region tags are matched at country level.
5. **Same defect twice.** Owner rejected European-looking coins on shot 16; shot 40 is a European-looking coin. The fix was a hand edit, not a rule.
6. **Pace.** 55 shots in 180 s is one cut per 3.3 s, steady, with no pattern of long holds and bursts; shot 16 holds one 3D symbol for 6 s, shots 51-54 are four near-identical traffic shots.
7. **The SHOTLIST audit trail over-claims** (checked "every line"); a shotlist must be generated from the final render, not written by hand.

## 5. Root cause by stage

| Stage | What went wrong | Evidence |
|---|---|---|
| query | the Director's picture queries were archive-only and found nothing; nouns, not scenes | SHOTLIST "How it was made" |
| ranking | the automatic picker returned **0**; no ranking ran on any shot | same; `.github/workflows/voice-film.yml:164` runs `render/asset-rank/rerank.mjs`, but never saw a candidate |
| critic | nothing rejects a stranger as the subject, a wrong era, a wrong city, a wrong object | shots 8, 11, 21, 26, 29, 34, 37, 40, 43, 46, 52 |
| plan | the shot type was not chosen to fit "no picture exists": filler clocks and bulbs instead of a designed card or text | 19, 22, 32, 38 |
| render | 720p was hard-coded; the quote card needed a test-only patch; mono audio; no music | `render.mjs:7`; SHOTLIST |

## 6. Regression tests that should exist (for King's 15 and 16)

Names are proposals; each assertion is concrete and runs without network.

| Test name | File | Asserts |
|---|---|---|
| `picker returns at least one candidate when the archive is empty` | `engine/test/film-media.test.mjs` | with an empty archive result the pipeline falls back to the stock provider (or a designed card); the shot count with no picture is reported, never silently dropped |
| `no stranger stands in for a named person` | `engine/test/shot-plan.test.mjs` | a sentence naming a real person or "his father / mother / he was seven" gets class B/D "no-face" or a designed card, never a clip tagged with a visible face |
| `era guard: pre-2000 narration refuses present-day footage` | `engine/test/shot-plan.test.mjs` | narration dated before the footage year picks A, C or a card; a clip dated within 5 years of today is rejected |
| `place guard: city-level tags` | `render/asset-rank/rerank.test.mjs` | a clip tagged Kolkata fails a Bengaluru shot; a clip with no place tag fails a "named place" shot |
| `generic-object blacklist` | `render/asset-rank/rerank.test.mjs` | microphone, office laptop, clock face and coin on a surface cannot be picked for a sentence that does not name them |
| `a rejected pick never returns` | `engine/test/film-media.test.mjs` | a pick the owner rejected is stored in the ledger and excluded from the next run (the coin case) |
| `shot class is recorded and A-share is reported` | `engine/test/critic.test.mjs` | every shot has a class A-E; the report states the share of A; a history film with 0% A is a warning |
| `no near-duplicate runs` | `render/asset-rank/rerank.test.mjs` | four consecutive shots with the same scene label (traffic) are refused |
| `shot hold limit` | `engine/test/timeline.test.mjs` | no single still idea holds longer than 4.5 s unless the shot type is `hold` |
| `export resolution is 1920x1080 by default` | `render/render.test.mjs` | `renderFilm` with no size writes 1920x1080; a 720p export sets `report.proof = false` and the release gate refuses it as "proof" |
| `bitrate floor` | `render/render.test.mjs` | video bitrate at 1080p30 is at least 5 Mb/s unless a size cap is named in the report |
| `loudness in true-peak mode` | `render/render.test.mjs` | `ebur128 peak=true` reads -14 LUFS (+-1) and a true peak at or under -1.0 dBTP; sample peak is not accepted as true peak |
| `stereo master` | `render/render.test.mjs` | the final audio has 2 channels |
| `music present` | `render/render.test.mjs` | a film report with `musicCues.played = 0` fails the gate for a documentary, with the reason named |
| `quote card without a test patch` | `render/graphics/graphics.test.mjs` | a timeline card with text and `by` renders the QUOTE template from the card alone |
| `shotlist is generated from the render` | `local/voice-film.test.mjs` | SHOTLIST.md is produced from `shots.json` and the final file's frame times, never edited by hand; every row has a class and a verdict |
| `transcript names` | `engine/test/voice-scenes.test.mjs` | proper nouns from the script ("Ramesh", "Bhechbu") replace the speech-to-text spelling in the captions |

## 7. What to do first (priority order)

1. P0: a stranger must never stand in for a named person. Replace 8, 37, 41, 45 with designed cards or no-face footage.
2. P0: when no honest picture exists, the plan chooses a card, a map or a document, not filler (the "Bulb" and "Clock" rule).
3. P1: era and place guards in the ranking stage (shots 2, 11, 24, 25, 26, 27, 43, 52).
4. P1: export 1920x1080 with the product's bitrate, stereo, with music.
5. P1: a class A-E field on every shot, and a report of the A share. For the engineering niche the target is mostly A.
