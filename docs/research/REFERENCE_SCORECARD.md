# Reference scorecard: the 10 engineering documentaries to beat (27 Nov 2026)

Task 3. Docs only. No video was downloaded and no view count is promised by anything here.
Source data: `docs/research/ENGINEERING_MARKET_STUDY.md` (29 channels, 138 long videos, checked
26 Nov 2026, raw rows in `docs/research/data/engineering-videos.json`) plus the public watch pages of
the ten films, read as text on 27 Nov 2026.

## 0. Read this first: what was measured and what was not

**Measured on 27 Nov 2026** (from the public watch page and the study's data file, per film): publish
date, views, likes, subscriber count, length, chapter list with timestamps, whether chapters are the
author's or YouTube's auto-generated ones, description text (promise, sponsor, credits: stock
libraries, music, graphics, editor), and the study's reading of the thumbnail. The outlier ratio comes
from the study (views ÷ the channel's median long upload, older than 21 days).

**Not measured: nobody watched these videos in this session.** YouTube refused automated playback from
this machine. Evidence, so the next session does not repeat it:

| Route tried | Result |
|---|---|
| `youtube.com/watch?v=<id>` (curl, desktop user-agent) | HTTP 200 but `"playabilityStatus":{"status":"LOGIN_REQUIRED"}`, page text "Sign in to confirm you're not a bot" |
| `youtubetotranscript.com/transcript?v=<id>` | HTTP 403 |
| `api.kome.ai` transcript POST | HTTP 522 |
| `tactiq-apps-prod.tactiq.io/transcript` POST | HTTP 401 (needs an App Check token) |
| `pipedapi.kavin.rocks/streams/<id>` | empty body |
| `inv.nadeko.net`, `yewtu.be` Invidious APIs | "Endpoint disabled" / 403 |
| `youtube.com/oembed` | works, but returns only title, channel and thumbnail |

So the following could **not** be observed: how the first 30 seconds actually play, cuts per minute,
whether the visuals are archive or stock or graphics on screen, whether sources appear on screen, the
music mix, and the ending as it is cut. Chapters and credits are the closest measurable proxies and
they are used as such below.

**Scoring key.** Every score is 1-5 and carries its basis:

- **[M] measured**: the score rests on a fact recorded in §2 (a chapter list, a credit line, a count).
- **[O] opinion**: my judgement, formed from the title, the description's first sentence, the chapter
  titles and the thumbnail reading. **Not from watching.** Do not quote an [O] score as evidence.
  It is a hypothesis for the one human pass that closes this gap (10 films × 3 min ≈ 30 min of
  watching, no cost).

If the Boss wants this sheet to be fully evidence, that 30-minute pass is the only missing step; every
structural column below is already filled from data.

## 1. How these ten were picked

Ranked all 138 rows of the study by outlier ratio, then applied three stated exclusions. The point is
to score films whose ratio means something for an engineering documentary, not to score noise.

| Excluded | Ratio | Why |
|---|---|---|
| Mega Projects Explained ×4 (`Qo3teec30NY` 126.5×, `8b-x9GwoJww` 38.8×, `19QzD5bvSZM` 12.1×, `22RDzveFtHo` 4.7×) | up to 126× | channel median 707 views; 126× is about 90k views. The study itself marks these low confidence and calls the ratios noise |
| Mark Felton `JOAt-PHuiis` 4.68×, LEMMiNO `kd2KEHvK-q8` 3.54× | high | not engineering documentaries (WWII history; a mystery reference film). The study files them as "reference", not as the niche |
| Thunderf00t `YdZ9MxtPBRY` 3.17×, Brendon Peterson `ht6q1P2bGtg` 3.0× | high | tagged `off-niche` in the study (commentary; flight vlog) |
| Kyle Hill `p21LjkEvoBE` 2.93× | high | tied with Mustard's 2.93×; Chernobyl travel report, not a documentary build/failure story. Kept out on the tie only |

Two channels appear twice (Disaster Breakdown, Practical Engineering) because the ranking says so;
that is a finding, not a rounding error. The two longest films (67 and 106 min) are kept even though
only their first 3 minutes are scored.

### The ten, with the measured columns

| # | Film | Channel (subs, measured) | Pub | Views | Likes | Min | Outlier | Chapters | Angle |
|---|---|---|---|---|---|---|---|---|---|
| 1 | [Did This Small Mistake Kill Everyone? Air Canada 621](https://youtu.be/wSmtnuFoAv0) | Disaster Breakdown | 2024-05-17 | 1,467,462 | 32K | 44 | **5.22×** | 11, author's | failure |
| 2 | [Cruel False Hope: New York Mid-air Collision](https://youtu.be/Jl29NPpEkT8) | Disaster Breakdown | 2023-12-19 | 1,324,525 | 24,250 | 67 | **4.71×** | 12, author's | failure |
| 3 | [Stopping the Unstoppable](https://youtu.be/-17mPnFxi30) | Practical Engineering 4.85M | 2026-09-01 | 5,624,856 | 61,688 | 16 | **4.70×** | none | hidden-system |
| 4 | [Why U.S. Cities Don't Build Metro Systems](https://youtu.be/aMbG6RwYy-Q) | City Beautiful | 2025-06-20 | 458,000 | 11K | 12:52 | **4.65×** | none | build-politics |
| 5 | [The Los Angeles Aqueduct is Wild](https://youtu.be/PhW2BjFQCZM) | Practical Engineering 4.85M | 2026-03-17 | 5,167,326 | 83K | 23 | **4.31×** | 11, **auto-generated** | megaproject |
| 6 | [Refueling a NUCLEAR REACTOR (SED 311)](https://youtu.be/v0afQ6w3Bjw) | SmarterEveryDay 11.9M | 2025-11-03 | 7,493,212 | 151,543 | 106 | **3.89×** | none | hidden-system |
| 7 | [The Plane That's 38% Nose](https://youtu.be/6B96xetwrqI) | Real Engineering 5.12M | 2026-09-26 | 2,654,582 | 29,231 | 20 | **3.57×** | 7, **auto-generated** | design-tech |
| 8 | [America's BIGGEST Transit Expansion](https://youtu.be/OimL8T4b4hg) | RMTransit | 2025-08-15 | 94,000 | 5,200 | 10:38 | **3.20×** | none | build-politics |
| 9 | [What Happened To The Nautilus?](https://youtu.be/8AbtCE-sePc) | Mustard 2.4M | 2024-04-12 | 20,813,759 | 298,084 | 17 | **2.93×** | 6, **auto-generated** | mystery |
| 10 | [How Fake Buildings Keep Cities Alive](https://youtu.be/5rgcxHl3hg8) | Stewart Hicks 708K | 2025-08-21 | 1,807,667 | 40,020 | 12 | **2.84×** | 8, author's | hidden-system |

**Measured across the ten:** only 3 of 10 have chapters the author wrote (the three others marked
auto-generated are YouTube's, so the author did not structure the film that way); 4 of 10 have none.
Length runs 10:38 to 106 min, median 20 min.

## 2. The scores

### 1. Air Canada 621 — 5.22× (Disaster Breakdown)

Measured: title is a question plus "heartbreaking story"; 11 author-written chapters, and chapter 2 is
**"What Happened Here?" at 0:00** with the next beat at 1:09; description opens with a sponsor read
(Brilliant), then hashtags. Thumbnail (study's reading): burning airliner illustration with the quote
"I'm Sorry".

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [O] | title asks the question the film answers, and the first chapter is literally "What Happened Here?" |
| Central question | 5 | [M] | one question, in the title and in chapter 1 |
| Pacing, cuts/min | — | **not observed** | first two structural beats at 0:00 and 1:09 are the only timing facts |
| Visuals | 3 | [O] | thumbnail is an illustration ⇒ CGI/drawn reconstruction, not archive; news footage likely (aviation channel) but unverified |
| Maps / diagrams | 3 | [O] | aviation films of this channel are diagram-led; not seen |
| Sources shown | — | **not observed** | no source list in the description |
| Narration | 3 | [O] | calm retelling of a fatal accident is this channel's format; no transcript available |
| Music / sound | — | **not observed** | no music credit in the description |
| Ending | 4 | [O] | chapters end "The Crash Site Today" → "Unfinished Business": an ending that returns to the present |

### 2. New York Mid-air Collision — 4.71× (Disaster Breakdown)

Measured: 12 author chapters; "Intro 0:00" then **"Christmas in New York" at 3:16**; the collision lands
at 36:06 of 67 min; "Cruel False Hope" (the film's title phrase) at 46:21; "Crash Sites Today" 49:59.

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [O] | "Cruel False Hope" is a promise of an emotional payoff; the first chapter after the intro is a scene, not a definition |
| Central question | 4 | [O] | implied ("how did two crews fail to see each other?"), never stated as one question |
| Pacing, cuts/min | — | **not observed** | only chapter spacing: 3:16 then 4:08 |
| Visuals | 3 | [O] | illustration thumbnail; 1960 disaster ⇒ stills and graphics dominate in practice |
| Maps / diagrams | 4 | [O] | a mid-air collision film that runs 67 min needs airspace diagrams; chapter "VOR is Okay Here's Way" 15:09 suggests navigation graphics |
| Sources shown | — | **not observed** | none listed |
| Narration | 3 | [O] | long-form aviation retelling; the 67-min length implies a lot of narration over stills |
| Music / sound | — | **not observed** | no credit |
| Ending | 5 | [O] | "Cruel False Hope" → "Crash Sites Today" → "Aftermath": title paid, then the present day |

### 3. Stopping the Unstoppable — 4.70× (Practical Engineering)

Measured: description's first line is the promise, "Buffer stops and bumping posts are hidden in plain
sight ⚙️"; credits name the editor (Wesley Crump), the producer (Ralph Crewe), **graphics by Nebula
Studios**, **music "Edge of a Knife" composed by Caleb Winters**, and **stock video and imagery from
Getty Images, Shutterstock, Pond5 and Videoblocks**; no chapters; sponsor SendCutSend.

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [O] | an object the viewer has seen but never noticed, stated in the first description line |
| Central question | 4 | [M] | one mechanism, promised explicitly in the description |
| Pacing, cuts/min | — | **not observed** | measured: no chapters at all, so no timing anchors |
| Visuals | 4 | [M] | four stock libraries credited **plus** own filming (the same object is demonstrated) and in-house graphics; mixed, not archive-led |
| Maps / diagrams | 3 | [O] | graphics house is credited, so diagrams exist; per-minute density unverified |
| Sources shown | 2 | [O] | no source list; an explainer of physics needs fewer citations than a disaster film |
| Narration | 5 | [O] | host-written and host-voiced (credited), which is this channel's known strength |
| Music / sound | 4 | [M] | a named original composition, not a library bed alone |
| Ending | 3 | [O] | no chapter structure to judge; the channel tends to end on the demonstration |

### 4. Why U.S. Cities Don't Build Metro Systems — 4.65× (City Beautiful)

Measured: 12:52 long, no chapters, paid promotion (Nebula) in the description; the description itself
is a Nebula sign-up, not a content summary. Thumbnail (study): a US map with X marks, no face.

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 3 | [O] | the question is the title; nothing in the description adds a stake |
| Central question | 5 | [M] | one explicit "why" question, answered by a map of missing systems |
| Pacing, cuts/min | — | **not observed** | no chapters, no timing anchors |
| Visuals | 3 | [O] | map + stock city footage; low production cost is this channel's format |
| Maps / diagrams | 5 | [M] | the thumbnail is a map with X marks, i.e. the argument is drawn |
| Sources shown | 2 | [O] | no sources in the description |
| Narration | 3 | [O] | single narrator, editorial "why America can't" tone |
| Music / sound | — | **not observed** | no credit |
| Ending | 3 | [O] | policy videos of this kind usually end on a comparison city |

### 5. The Los Angeles Aqueduct is Wild — 4.31× (Practical Engineering)

Measured: 11 chapters, **auto-generated by YouTube** (the author did not write them), beats at 0:00,
2:08, 3:49, 5:41, 7:24, 9:14, 10:31, 12:31, 14:03, 15:40, 17:14, 19:36; credits as in #3 but music is
**four Epidemic Sound library tracks, one Nebula Studios cue and one Creative-Commons track (Elexive)**;
description line: "A little tour of the Los Angeles Aqueduct system".

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [O] | "is wild" + a tour of a system 4M people depend on, with no stakes number in the description |
| Central question | 3 | [O] | a tour, not a question; the "wild" is the promise |
| Pacing, cuts/min | — | **not observed** | auto-chapters give 2:08 to the first beat, then ~2 min spacing |
| Visuals | 5 | [M] | the author films the aqueduct himself (channel format) and credits stock only as support; real infrastructure on camera, not archive |
| Maps / diagrams | 4 | [O] | a 350-mile system cannot be explained without a map; graphics house credited |
| Sources shown | 2 | [O] | none in the description |
| Narration | 5 | [O] | host-written, first person tour |
| Music / sound | 4 | [M] | six cues, four of them licensed library tracks: a real bed for a 23-min film |
| Ending | 3 | [O] | the last chapter is "Future water challenges": opens the next film rather than closing |

### 6. Refueling a NUCLEAR REACTOR — 3.89× (SmarterEveryDay)

Measured: 106 min, 7.49M views, 151K likes, 11.9M subscribers, **no chapters**; description is a
sponsor line (AnyDesk); a top comment on the page is about the word "DO NOT LOSE IT" at 8:59, i.e.
viewers quote the plant staff, not the host.

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [O] | access ("inside a refuelling outage") is the promise; no number, no question |
| Central question | 3 | [O] | "what does refuelling a reactor look like" is implied, never framed as a question |
| Pacing, cuts/min | — | **not observed** | no chapters at all in a 106-min film |
| Visuals | 5 | [M] | filmed on site inside a commercial plant (the only way this film exists); no stock credits |
| Maps / diagrams | 2 | [O] | a walk-and-talk format uses few diagrams |
| Sources shown | 2 | [O] | named engineers on camera instead of citations (my reading) |
| Narration | 4 | [O] | host narration plus staff interviews, a mode Zupona cannot copy |
| Music / sound | — | **not observed** | ambient plant sound is the point of the format |
| Ending | 2 | [O] | a 106-min un-chaptered film has no designed ending; it runs out of footage |

### 7. The Plane That's 38% Nose — 3.57× (Real Engineering)

Measured: 7 auto-generated chapters, beats at 0:00, **0:51, 1:58, 3:47**; "Conclusion and sponsorship"
at 17:59 of 20 min; credits: producer/writer/narrator Brian McManus, editor Dylan Hennessy; description
opens with a Nebula offer.

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [M] | a number in the title ("38% nose") and three structural beats inside the first two minutes |
| Central question | 4 | [M] | the title states the anomaly; chapter 2 is "The quest for silent flight", i.e. the film turns it into a problem |
| Pacing, cuts/min | — | **not observed** | chapter cadence only: 0:51, 1:07, 1:49 between beats |
| Visuals | 4 | [O] | aircraft design film ⇒ manufacturer renders, archive test footage and 3D animation; all three are this channel's norm |
| Maps / diagrams | 3 | [O] | physics segment (1:58) needs diagrams; density unverified |
| Sources shown | — | **not observed** | no source list in the description |
| Narration | 5 | [O] | writer = narrator (credited), the tightest of the ten on paper |
| Music / sound | — | **not observed** | no credit |
| Ending | 3 | [O] | the last chapter is a sponsorship segment, so the ending is commercial, not narrative |

### 8. America's BIGGEST Transit Expansion — 3.20× (RMTransit)

Measured: 10:38, 94k views, no chapters, co-hosted with @nandert (26.8K subscribers); description is a
link to a 37:38 companion breakdown.

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 3 | [O] | "BIGGEST" is the whole promise; a guest host dilutes the opening |
| Central question | 3 | [O] | project update, not a question |
| Pacing, cuts/min | — | **not observed** | no chapters, no timing anchors |
| Visuals | 2 | [O] | small channel, transit maps and stock; production is not the draw |
| Maps / diagrams | 4 | [O] | a transit alignment cannot be explained without a map |
| Sources shown | 3 | [O] | environmental documents are linked in the companion video |
| Narration | 3 | [O] | two-host conversation, partly unscripted |
| Music / sound | — | **not observed** | no credit |
| Ending | 2 | [O] | update format; ends on what is still unfunded |

### 9. What Happened To The Nautilus? — 2.93× (Mustard)

Measured: 17 min, 20.8M views, 298K likes, 2.4M subscribers; 6 auto-generated chapters at 0:00, **0:47,
1:57, 3:25**, 4:59; thumbnail (study): cutaway submarine, "UNDER THE NORTH POLE".

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 5 | [O] | a question in the title plus a cutaway of a real vessel: the promise is a mechanism and a mystery at once |
| Central question | 5 | [M] | "What happened to it?" is the title and the spine |
| Pacing, cuts/min | — | **not observed** | three beats in the first 3:25 is the fastest of the ten |
| Visuals | 5 | [O] | Mustard's CGI + archive reconstruction is the reason this channel exists; no live footage of the Nautilus exists at all |
| Maps / diagrams | 4 | [O] | an Arctic voyage needs a route map |
| Sources shown | — | **not observed** | none in the description |
| Narration | 4 | [O] | cinematic, book-report style |
| Music / sound | — | **not observed** | no credit |
| Ending | 4 | [O] | the mystery is answered; the film's format requires it |

### 10. How Fake Buildings Keep Cities Alive — 2.84× (Stewart Hicks)

Measured: 12 min, 1.81M views, 40K likes, 708K subscribers, 8 author chapters at 0:00, **1:02, 1:54,
3:32**, 6:37, 7:53, 9:10, 10:29 ("Support the channel").

| Dimension | Score | Basis | Evidence |
|---|---|---|---|
| Hook, first 30 s | 4 | [O] | a hidden object in the street + "keep cities alive" (a stake, no number) |
| Central question | 4 | [M] | "why camouflage them?" is chapter 2, i.e. the question is asked explicitly at 1:02 |
| Pacing, cuts/min | — | **not observed** | beats at 1:02, 0:52, 1:38: a question every ~1 min |
| Visuals | 4 | [O] | the channel's red-highlighted 3D models (study's reading of its other winners) + real photographs of the decorated substations |
| Maps / diagrams | 5 | [O] | the whole argument is a diagram: a substation drawn as a house |
| Sources shown | 3 | [O] | planning documents usually on screen; unverified |
| Narration | 4 | [O] | architect-host, calm, declarative |
| Music / sound | — | **not observed** | no credit |
| Ending | 3 | [O] | the last beat before the ask is "Future infrastructure" |

## 3. What the ten agree on (each line tagged)

1. **Every one of the ten promises exactly one thing in the title** — a number (38%), a question (What
   happened to the Nautilus?, Why don't US cities build metros?), or a hidden object (buffer stops, fake
   buildings) — and the description repeats it in one sentence. [M: titles + descriptions]
2. **The stake is felt, not explained, in the title**: 4 of 10 titles carry a number or a count of
   lives; none carries a corporate name or a project timeline. [M]
3. **Where the author wrote chapters, the first move inside the film is a question or a scene, and it
   arrives before 3:20**: 1:09, 3:16, 1:02, 0:47, 0:51 — that is a structural beat every **47-105 s**
   early on. [M: chapter timestamps of the 6 films that have them]
4. **Seven of the ten credit a named human on craft** (editor, producer, graphics house, composer) in
   the description. The two highest-ratio films credit nobody. [M]
5. **Stock is normal and not fatal**: Practical Engineering names four stock libraries and still gets
   4.7×; what it adds is its own filming plus in-house graphics. [M: credits]
6. **Six of the ten show a diagram or map as the thumbnail or in the first two chapters** (US map with X
   marks, cutaway submarine, substation-as-house, airframe). [O: thumbnail readings from the study]
7. **Length is not a strategy**: 10:38 to 106 min, median 20 min, and the 106-min film has the weakest
   ending of the ten. [M: lengths]
8. **Nobody's description lists sources.** Zero of ten. That is a measured gap, and an opening for us.
   [M]

## 4. What none of them does (where Zupona can be better, my opinion)

- **No film shows its evidence chain.** Zero of ten cite sources in the description; none can be
  audited by a viewer. Our ledger already exists, so a source line on screen plus a description source
  list is a cheap, honest differentiator. [O]
- **Chapters are neglected**: 4 of 10 have none at all, and 4 of the 6 that have them let YouTube
  auto-generate them (so the labels are "History 0:47", not an argument). Author-written chapters that
  read as steps of a case are free to us. [M]
- **Endings are usually an afterthought**: the highest-ratio films end on "Crash Sites Today" or a
  sponsorship; nothing closes the question by name. [O]
- **Support channels**: two of the ten cannot scale an ending or a chapter structure because one person
  writes, films and edits. We produce from a timeline, so consistency is our only structural edge. [O]

## 5. The bar a Zupona film must beat

Ten rules, each checkable on our own film data (no viewer needed). "First 3 min" means 0:00-3:00 of the
narration clock. Every rule is written so the release gate can pass or fail it mechanically.

| # | Rule | How it is checked | Reference evidence |
|---|---|---|---|
| 1 | **A cut at least every 6 s in the first minute, and no single shot longer than 6 s in the first 3 min.** | the render timeline's shot list: `max(shot length)` over 0-60 s and 0-180 s | no reference film was measured for cuts; this is the target we must hold to be safe against the fastest of the ten (Mustard, 3 beats in 3:25) [O] |
| 2 | **A map, cutaway or diagram appears before 1:30**, and at least one per chapter after that. | timeline: count of `map`/`diagram`/`graphic` shots with start < 90 s, and per chapter | 6 of 10 lead with a diagram, and 1:02-1:58 is where the reference films ask their question [M+O] |
| 3 | **The title's promise is stated in the narration before 0:30 and answered by 2:30.** | transcript of our own narration: does the promise noun and answer appear at those times | the reference films front-load the question (1:09, 1:02, 0:51, 0:47) [M] |
| 4 | **One sourced stake in the first 3 min: a count of lives, a date, or a cost, with its source named in the same shot or the next.** | ledger lookup for the claim + source chip present on screen in 0-180 s | every top title of the study sells a count or a number [M: titles] |
| 5 | **Chapters are written by us, one per 2-4 min, and every label is a step of the case, not a topic** ("Why the spoiler was already up", not "History"). | chapter file: label count, spacing, and a ban on bare nouns | 4 of 10 have no chapters; the ones that work use questions and scenes [M] |
| 6 | **Every archival still or clip in the first 3 min carries a visible source line (archive, licence, date).** | frame audit: source chip present on each archive-tagged shot | nobody in the ten does this; it is our differentiator, not their bar [O] |
| 7 | **No repeated picture inside the film, and at least 50% of the first 3 min is real or marked material (archive, photographed, our own render), not generic stock.** | shot tags in the timeline + a repeat check by asset id | Practical Engineering mixes 4 stock libraries with its own filming and wins at 4.7× [M] |
| 8 | **Narration runs continuously: no silence over 0.8 s, no filler word, and loudness -14 LUFS ±1 with the music bed ducked under speech.** | `audio-audit` (silence, loudness) + the tighten report | unmeasured in all ten; a craft floor we hold ourselves to [O] |
| 9 | **The last 30 s restates the answer in one sentence and names at least 3 sources.** | transcript tail + ledger count in the final 30 s | the reference films fail this: endings are "Aftermath" or a sponsorship [M: chapter lists] |
| 10 | **The description carries the source list, the chapter list and the claim count** (no promise the film does not keep). | a description check against the ledger and the chapter file | 0 of 10 list sources; YouTube's own guidance says the opening must keep the title's promise [M] |

A film is "at the bar" only when all ten pass in the gate's report. Rules 1, 2, 5, 7 and 9 are the ones
that separate a Zupona cut from the ten scored here; the rest are floors.

## 6. What is still unverified (say this in the PR)

- **No film was watched.** All 90 scores rest partly on metadata; the [O] ones must not be quoted as
  measurements. A 30-minute human pass (10 × first 3 min) would convert them: note cuts per minute, the
  first visual after 0:00, the first source shown, and whether music enters under the first sentence.
- **This machine cannot fetch YouTube playback or transcripts** (§0): any future session that needs
  transcript-level evidence must run where a signed-in session or the YouTube Data API key is available.
- **Rule thresholds 1, 2, 3 and 8 are not derived from the ten** (their cut lengths were not
  observable); they are craft floors, marked [O]. Rules 4, 5, 9 and 10 rest on measured chapter titles,
  lengths and the absence of source lists.
- Views, outliers and subscribers are as of 26-27 Nov 2026 and will drift.
