# Zupona AI Studio: honest state and the road to the top (4 November 2026)

The owner asked: where are the problems, what must improve, what is not done, and what it takes to become the biggest AI video platform with films that can reach tens of millions of views. Below is the answer, written so that a new session can act on it.

## 1. The most important truth

**Nothing has run for real yet.** Every part is built and tested, but only with fakes:
- 107 automated tests pass, CI on GitHub is green, and a real MP4 renders end to end.
- The Claude API, Pexels, Pixabay, ElevenLabs, Freesound, Cloudflare and the GitHub render have never been called.
- No real film has been made by the platform, so cost, quality and timing are estimates.

The first real runs will break things: prompts, parsing, timeouts and cost. Until that happens, every quality claim is a plan, not a result.

## 2. Problems in what exists

| Area | Problem | Effect |
|---|---|---|
| Visuals | Free stock (Pexels, Pixabay) cannot show the same person across a story, and stock faces may not stand in for real people. | Stories and motivation lean on hands, backs, objects and text cards: far from "Bollywood level". |
| Graphics | Cards are typographic only: plain, paper, kinetic, counter, split. There are no maps, animated charts, timelines or designed templates, and dissolves are dips through black. | It looks good, but not like a top channel. |
| Voice | Multilingual v2 is stable but flat for drama. There is no per-scene emotion direction, the pronunciation lexicon is not applied, and every character has the same voice. | Emotional scenes do not land as hard as they could. |
| Music | The owner must pick a track per cue by hand. Some free library tracks are claimed in Content ID by third parties. | It is slow, and there is a risk of claims. |
| Footage check | The footage desk judges one thumbnail per clip. | A clip can change after its first frame (text, logos, a face). |
| Captions | Caption timing is estimated from text length. The ElevenLabs character timings are saved but not used yet. | Captions can drift a little. Word-by-word captions for Shorts are not possible yet. |
| Platform | There is one owner token, with no accounts, billing, quotas or editor. Film files are public to anyone with the ID. | It cannot serve customers yet. |
| Render hosting | The render uses GitHub Actions (free, but for one owner). | It does not scale to many users. |
| Originality guard | It compares scripts only, not visuals or music. | A channel could still repeat its look too much. |
| Benchmarks | The owner's 39 links (4 Nov) cannot be opened from the cloud session: YouTube is blocked, and vidIQ had 4 credits. | The examples were not analysed this time. The 15 formats come from the first chat's analysis. |

## 3. Fixed or added on 4 November 2026

- **No label on screen, anywhere.** The master prompt still told the model to burn "Reconstruction (AI)" into AI shots, tag cards "illustrative" and mark thumbnails "AI". All of that is gone. Honesty now comes from YouTube Studio's disclosure setting, a one-line description note for invented stories, and never attaching an invented act to a real person.
- **Formats in the film run.** The film run accepts any of the 15 formats or "auto": motivational life story, invented story, history epic, rags to riches and the rest. Story mode has its own research, ledger and rules. The description note is added in code, and a title that claims truth is flagged.
- **Written to be felt.** Each chapter has one scene built to move the viewer, with silence before it and a swell after. Machine-sounding or preachy writing is flagged.
- **A look per format.** Stories and motivation get a cinematic grade with 2.39:1 bars, history gets an archive grade. Chapter breaks dip through black and show the chapter title. Slow motion follows the script.
- The 39 links are saved in `docs/YOUTUBE_BENCHMARKS.md`.

## 4. Not done

1. Real runs, with tuning from them (blocked on Cloudflare and the keys).
2. Maps. These need a tile and geocoding provider with a key, such as MapTiler; OSM's public servers forbid product use.
3. A motion-graphics engine for designed templates: maps, charts, timelines, lower thirds, quote cards, document highlights, true dissolves.
4. Consistent-character visuals for stories: AI scenes with one cast, disclosed in Studio, never real people. This is **the owner's decision**, because the current rule is no AI imagery.
5. Expressive narration: ElevenLabs v3 with delivery tags per scene, and character voices. Also **the owner's decision**, because the current rule is v2 for English.
6. Automatic licensed music: ElevenLabs Music (cleared for commercial use) or a paid library. **The owner's decision** (AI audio).
7. YouTube upload and scheduling through the API, plus YouTube Analytics (retention per scene, CTR).
8. Bangla and Arabic runs (postponed by the owner), and more languages written natively.
9. Accounts, billing, quotas, a scene-timeline editor with preview, and a hosted render farm.
10. A topic radar that finds topics with proven demand (outlier videos in the niche) before writing.

## 5. What it takes to reach the top

Views at the scale of tens of millions cannot be promised by any tool. They come from four things that compound: **the right topic**, **packaging** (title and thumbnail that earn the click), **retention** (people stay to the end) and **consistency**. The platform's job is to raise the odds on every film and to learn from every upload.

**Phase 1: prove it (next).** Connect Cloudflare and the keys, then make three real films: a 10-minute motivational story, a 15-minute rags-to-riches film and a 45-minute documentary. Fix what breaks, measure real cost and time, and publish on a test channel.

**Phase 2: look like a top channel.**
- A motion-graphics engine: HTML and CSS templates rendered to frames in headless Chromium, which this project already has. It covers maps (MapTiler), charts, timelines, lower thirds, quote cards, document highlights and true cross-dissolves.
- Expressive voice: v3 delivery tags written by S5 per scene.
- Licensed music generated to each cue's exact length and mood.
- Captions aligned to the recorded voice, with word-by-word animated captions for Shorts.

**Phase 3: visual storytelling for stories.** Consistent-character scenes for invented stories and reconstructions, from a cast bible with reference images and a cost cap per film. They are disclosed in YouTube Studio, with nothing on screen. This needs the owner's decision.

**Phase 4: learn from every upload (the moat).**
- Upload and schedule automatically, then read retention curves back per scene.
- The engine learns which beats, hooks and lengths keep viewers, and which titles and thumbnails win YouTube's Test & Compare.
- No competitor closes this loop from script to retention.

**Phase 5: the platform for the world.** Accounts, billing, an editor, templates by genre, many languages written natively (not translated), a render farm and an API.

**Why creators would choose Zupona over InVideo, Pictory or Runway:**
- Trust: sources for every fact, a licence for every clip, and the originality guard against channel-level demonetisation.
- Story quality: scripts checked in code.
- Price before a run, with no charge for failures.
- Scene-level re-make.
- From Phase 4, a platform that learns what keeps each channel's audience watching.

## 6. On stories and real people (the owner's instruction)

- Nothing is ever written on the video to say a story is invented. This is now true everywhere in the code and prompts.
- The strongest way to "match a real person's story" is to **tell real people's stories from sources** (the motivational real-life story format). Such a film needs no note at all.
- An invented story must never be attached to a real, named person. That is defamation and misinformation, and YouTube removes it. Characters can be composites of common real experiences, with invented names, and the film is never called true. The description carries one quiet line; viewers never see a label.
