# Next session brief (first written 3 November 2026; section 0 updated 4 November 2026)

Read this file only (and `docs/CONNECT.md` when connecting Cloudflare). Do not re-analyse old chats, the repository history or the web. The "Next steps" in `docs/HANDOFF.md` are superseded by section 0 below.

## 0. Start here

**Latest (5 Nov 2026, end of the long session; the owner started a new session to save credits):**
- Read `docs/VISION.md` (the owner's vision, condensed) instead of asking for it again.
- Built and pushed today: audit and honest agent status; fail-fast and resume; exact costs; saving mode (Batch API, half price); free archives (Wikimedia Commons, NASA) with credits; animated photos (Ken Burns, parallax); 25 formats; new landing page (English and Bangla); transitions (whip, slide, zoom, flash); line-by-line kinetic type; animated maps and route lines; modern thumbnails; synthesised sound design under the edit (whoosh, impact, boom, riser, click, glitch). Tests: 108 engine + 36 platform, all passing.
- **Next, in order:**
  1. Edit Director agent: a Claude stage after QA that writes `edit-C1.json` per chapter (per scene: transition, punch-in times, shake times, extra sound hits), validated in code and merged by the timeline; add `edit-*` files to the studio list; update `ROLE_STATUS`.
  2. Renderer: punch-in zoom at given times, camera shake on impacts, a glitch transition (rgbashift and noise; `transitionFor` already maps the word to nothing yet).
  3. Owner's own pictures: `pictures/<film id>/SC0012-1.jpg` (or .png/.mp4) replaces that shot in the render (CLI flag and GitHub workflow step, like `voice/` and `music/`); licence report says "provided by the owner".
  4. More legal sources: Openverse (CC images), Smithsonian, the Met, Art Institute of Chicago, Library of Congress (no known restrictions).
  5. When the owner connects Cloudflare and the keys: a 2-5 minute test film in saving mode, then fix what breaks.
- Work rules: small steps, `npm test` and `cd engine && npm run typecheck` before every push, commit and push after every step, branch `ccr-cb190ece-ukm6vg` only, replies to the owner in Bangla, short.


- **Branch:** `ccr-cb190ece-ukm6vg` holds everything (it already merged `claude/studio-first-screen-y4tp15`). A new session first runs `git fetch origin && git merge origin/ccr-cb190ece-ukm6vg`. Never push to `main`.
- **Done:**
  - USA Ramesh Babu film: C1–C6, QA (14 fixes), S6, S7 and the page `productions/ramesh-babu/ramesh-babu-usa.html`.
  - Platform, English (USA) path in code: `engine/src/film-run.mjs` (S0–S7 from one topic, resumable, budget stop), `engine/src/scene-lines.mjs` (every S5 chapter checked in code), `worker/` (Cloudflare Worker + Workflow + Claude API, token-protected) and section 3 of `/studio/` (cost estimate, start, progress, files).
  - Media step (task 2 below, done 4 Nov 2026): `engine/src/film-media.mjs` + stage `media:C1` ... in `film-run.mjs` after QA; Pexels/Pixabay keys via `PEXELS_API_KEY`, `PIXABAY_API_KEY` (`docs/CONNECT.md`). Tested with fakes only; never run against the real APIs.
  - Film page (task 3, done 4 Nov 2026): `engine/src/film-page.mjs`, served at `/api/films/:id/page` with a no-script CSP; checked in the local Workers runtime (`wrangler dev --local`). The studio links to it. Landing page links to `/studio/` (task 4, done).
  - Competitor scan, 4 Nov 2026: `docs/COMPETITORS.md` (what to build next and why).
  - Built the same day from that scan (all tested with fakes; nothing has called a real API yet):
    - render: `engine/src/timeline.mjs` (frame-exact edit list and captions) and `render/render-film.mjs` (ffmpeg MP4, SRT and a licence report; resumable; runs on any machine with ffmpeg). The full 45-minute USA film rendered in 81 s at 320×180.
    - voice: `render/voice.mjs` (ElevenLabs per scene; placeholders are never read; the owner's own takes are kept).
    - footage desk: Claude judges 320 px thumbnails, six shots per call (`createFootageJudge` in `film-run.mjs`); it is included in the estimate.
    - re-make one scene: `engine/src/scene-remake.mjs`, `POST /api/films/:id/scenes/:sc`, and a form in the studio.
    - channel originality guard: `engine/src/originality.mjs`, the `originality` stage, fingerprints in R2 `channel/fingerprints.json`.
    - music bed (cues from MUS, looped, faded, ducked under the voice); on-screen titles, source chips, master grade, grain; counter cards; clips from their steady middle.
    - thumbnails (`render/thumbnails.mjs`, the three S7 briefs) and Shorts/Facebook cuts (`render/cuts.mjs`, 9:16 and 4:5 with hook and burned-in captions).
    - sound design: scene ambience and effects from the SFX field (`--sfx`), fetched automatically from Freesound, CC0 only (`render/sound-kit.mjs`, needs `FREESOUND_API_KEY`).
    - split cards (FX-SPLIT: conflicting versions side by side, read from the shot description; all five in the USA film are correct).
    - own voice: `/api/films/:id/script` (recording script per scene); the GitHub render uses `voice/<film id>/SC0001.*` first, and ElevenLabs only fills gaps.
    - end-to-end test with fakes (`render/pipeline.test.mjs`): topic in, MP4, thumbnail and Short out.
    - kinetic type (FX-KINETIC) and paper cards (FX-PAPER); no synthetic grain (it made a 45-minute film 1.59 GB at 360p; now 41 MB at 720p for the card-only USA film).
    - studio: "My films" (`GET /api/films`); the film page shows the render status.
    - GitHub render: `.github/workflows/render-film.yml` (works from the phone once merged into `main`; it publishes the film as a private release and reuses earlier shots from the Actions cache); the Worker starts it after a run when `GITHUB_TOKEN`, `GITHUB_REPO` and `SITE_URL` are set (`worker/github.mjs`); the studio has a "Render the video" button. CI now runs the render tests with ffmpeg on GitHub.
  - Checks: `npm test` (95 engine + 14 worker/render, CI green on GitHub), `npm run check` (wrangler dry-run) and `cd engine && npm run typecheck` pass.
- **4 Nov 2026, second round (owner's instructions):** no label on screen anywhere (master prompt fixed); formats in the film run (15 presets + auto, story mode for invented stories); a look per format (cinematic bars and grade, archive, documentary), chapter dips and titles, slow motion; captions on the voice's word timings and word-by-word highlighted captions in Shorts. The full assessment and the plan to the top: `docs/ROADMAP_TO_TOP.md`. The owner's 39 example links are saved in `docs/YOUTUBE_BENCHMARKS.md` (not analysed: YouTube blocked in the cloud session).
- **4 Nov 2026, third round (owner's permission for AI scenes, v3 narration and AI music; all three built):** `render/ai-scenes.mjs` (fal.ai, one reference per character, a real person is never made, budget cap), v3 delivery tags in `render/voice.mjs`, `render/music-kit.mjs` (ElevenLabs Music per S4 cue). **5 Nov 2026:** topic radar: `engine/src/topic-radar.mjs` (outlier score), `worker/youtube.mjs` (YouTube Data API, one-day R2 cache), `GET /api/ideas` and the studio's "Find proven topics" panel; needs `YOUTUBE_API_KEY` (`docs/CONNECT.md`). Tested with fakes and in Chromium with a mocked API; never run against the real API.
- **5 Nov 2026, audit (owner asked: do all agents work, where did we fail, fix everything):**
  - Agents: the 151-role roster is a list of jobs, not 151 programs. `ROLE_STATUS` in `engine/src/agent-roster.mjs` now records for every role where its job is really done: 57 in code, 47 by a Claude stage, 47 not built yet (all Quran roles, Arabic and Bangla versions, maps, 2D/3D animation, colour correction, noise repair, transcription). The studio's plan shows these real numbers instead of an agent count, and says only English (USA) can be made today. `prompts/4-zupona-squad-brains.txt` (10 squad briefs) was never loaded by any code; its packaging rules now go into S7, with code checks of the final title (length, all-caps, defamatory words).
  - First run in the real Cloudflare runtime (`wrangler dev --local` with a fake Claude server): all 11 stages and the Workflow completed; routes, film page, script page, list and studio sections 1-3 work in Chromium.
  - Fixed from that run: a wrong API key kept a film 'running' for about 4.5 minutes of pointless retries and then showed a raw error, and a failed film could never be continued. Now permanent API errors stop at once with a plain reason (`permanentError`, `NonRetryableError`), every failed attempt is shown on the card while retrying (`run.json` `lastError`), and `POST /api/films/:id/resume` plus a studio button continue from the last finished stage, with an optional higher budget.
  - Fixed: web searches ($0.01 each) were not counted in the cost, and a call answered by a fallback model counted as $0; costs now include both. The renderer now measures its own master (EBU R128 loudness and true peak, black stretches the script does not ask for) and reports them. The studio lists only files that exist.
  - Optional `ANTHROPIC_BASE_URL` var (Cloudflare AI Gateway logs).
- **5 Nov 2026, second round (owner: world-class pictures for free, spend as little as possible):**
  - Free archives: `wikimediaProvider` and `nasaProvider` in `engine/src/film-media.mjs` (no keys; rights read from each file's own metadata; share-alike, NC, ND, restricted and third-party items refused; `verifyArchiveItem`). R2 evidence shots search archive photos first. Production rule 2 now allows R2 archive pictures. `pictureCredits` writes the credit lines into S7 (appended in code if missing). Tested with fixtures shaped like the real APIs; the APIs themselves are blocked from the build sandbox, so the first real run must confirm the response shapes.
  - Renderer: still photos (`still: true` segments) are framed over a blurred copy and moved (push, pull, pan); checked by eye and by test.
  - Saving mode: `anthropicBatchModel` + `savingModel` in `worker/anthropic.mjs` (Message Batches API, 50% of every token; idempotent batch ids in the film's R2 folder; expired batches re-bought, rejected requests stop). Per film (`saving: true`), studio box on by default; estimate shows both prices. Ran end to end in the local Workflow runtime against a fake Batches API.
- **5 Nov 2026, third round (owner: beat Kutly and every documentary tool; best landing page; motion, zoom and effects at the top level, free; all documentary types):**
  - Competitors: `docs/COMPETITORS.md` section "Documentary specialists" (Kutly, ViCut, VidRush ...): what they sell, prices, weak points, where we lead, what is still needed. kutly.io itself is outside the session's network; facts come from search summaries.
  - Formats: 25 (ten new: biography, company rise and fall, true crime from court records, survival, battle, geography, space mission, disaster, ancient civilisation, sports legend); Bangla names live in `formats.mjs` (`bn`).
  - Landing page: `page.tsx` rebuilt for documentaries (English and Bangla, switch remembered; real script excerpt; honest comparison; formats; motion tiles; prices from `estimateRun`; FAQ). Build: `cd tools && npm run build`. Checked in Chromium on desktop and phone.
  - Renderer: parallax for portrait photos; kinetic type line by line; transitions from TRANS (whip pan with motion blur, slide, zoom-through, white flash; dissolves stay dips); animated maps (`render/maps.mjs`, Natural Earth vendored in `render/assets`, country lit, pin, name) and route lines that draw themselves; thumbnails in today's style (and the photo-thumbnail bug fixed). The brief tells S5 the exact words for each effect, and that FX-MAP needs coordinates.
  - Not done: a highlighter sweep on document cards; Bangla and Arabic films; a hosted self-serve product (accounts, billing).
- **Not done:** the film API has never run against the real Claude API. It needs the owner's Cloudflare connection and API key (`docs/CONNECT.md`).
- **Next, in order:**
  1. If the owner says Cloudflare is connected: run one 2–10 minute English test film from `/studio/`, read `run.json` and the files, fix what breaks (prompts, timeouts, parsing), and report the real cost.
  2. ~~Media step~~ (done) (buildable without keys, fakes in tests): for each S5 shot, search Pexels and Pixabay with its queries through `engine/src/documentary-media-fetch.mjs`, keep only free-licence items with their licence record, never repeat a clip within 10 minutes, and write `media-C1.json` ... per chapter.
  3. ~~A readable page per run~~ (done) (like `productions/ramesh-babu/build.mjs`), served from `/api/films/:id/page`.
  4. ~~Link from the landing page~~ (done) (`public/index.html`) to `/studio/`.
  5. ~~Render, footage desk, scene re-make, originality guard, music, titles and chips, thumbnails, Shorts, GitHub render~~ (built, see above).
  6. The owner merges `ccr-cb190ece-ukm6vg` into `main` (their decision, by a pull request), so the Render button appears in GitHub Actions.
  7. After the first real run, check: Workflow step timeouts for long S5 chapters (30 min each today), real footage-desk quality and cost, ElevenLabs pronunciation of names (the S4 lexicon is not applied yet), and the real render time on GitHub.
  8. Still plain: maps (FX-MAP, about 10 per film) and three-panel clip recaps. The script asks for street-level OpenStreetMap fly-ins; OSM's public tile servers forbid this use at product scale, so maps need a tile and geocoding provider with a key (MapTiler has a free tier): the owner's decision.
- **Save credits:** no extra agents, no web research, long outputs written to files in parts, commit and push after every step, replies of 2–3 lines in Bangla.

## 1. The owner's mission and standard

The goal is to build the world's best AI documentary video platform, Zupona AI Studio, and to compete for the top spot against InVideo, Runway, Pictory, Higgsfield, Descript and others. The owner's standing directive:

- Think like a world-class CTO, AI researcher and documentary producer.
- Choose the strongest practical solution, and never an average one when a better practical one exists.
- About 150 specialised agents, each with a meaningful job, an output and a check. The number means nothing without coordination and results.
- Excellence in every stage: research, fact-checking, storytelling, retention, footage discovery, scene matching, cinematic motion, natural narration, editing and sync, long films, render speed and final quality.
- Quality before appearances: no fake functionality and no placeholders claimed as done. Test, validate, handle errors, measure.
- Never destroy existing progress. Continue, don't restart, don't rewrite working code.
- Build for today's stage with the long-term vision in mind. Every task should create real user value.
- Be honest: no view count or "number one" can be guaranteed. Earn it with engineering and quality.

Every film must feel human-made and Hollywood or Bollywood level. Films can be any length, from 1 minute to 5 hours or more, and must never be "short of pictures".

**The owner's budget is very small.** Spend credits carefully:

- one agent at a time;
- long outputs written to files in parts;
- short replies in Bangla.

## 2. Two separate tracks: do not mix them up

| Track | What it is | Where |
|---|---|---|
| A. The platform | The website and engine clients will use | `engine/` (formats, versions, voice, Quran, story mode, 151-role roster, run plans; tests); the studio page `/studio/` and the film API in `worker/` |
| B. The Ramesh Babu film | A sample 45-minute documentary script made with the engine prompts, in two fully separate versions. It shows the quality the platform must reach | `productions/ramesh-babu/` |

The owner's current priority (3 Nov 2026):

1. Finish the **USA version** of the Ramesh Babu film. **Done (3 Nov 2026).**
2. Then put the effort into the platform for the **US market** (English first). **In progress: see section 0.**

**The Bangladesh version of the film is postponed to save credits; do not start it.** Arabic and Bangla stay in the platform's design, but they are built after the English path works end to end.

A link from the landing page (the site's home page, `public/index.html`) to `/studio/` is a small Track A task for later.

## 3. Track B: exactly what is left

The topic is "Ramesh Babu: From Barber to Rolls-Royce", 45:00. Each version has six chapters (S5). A chapter is a timed list of scene lines carrying the narration, the shots, the stock search queries, the motion, the sound and the grade.

**USA** (American English, dollars):

| Ch | Title | Time | Scenes | Status |
|---|---|---|---|---|
| C1 | The Shop | 0:00-8:30 | SC0001-SC0054 | done |
| C2 | The Chair | 8:30-15:30 | SC0055-SC0095 | done |
| C3 | One Used Van | 15:30-22:30 | SC0096-SC0136 | done (use as the format example) |
| C4 | The Luxury Bet | 22:30-30:00 | SC0137-SC0181 | done |
| C5 | The Ghost and the Bill | 30:00-38:00 | SC0182-SC0228 | done |
| C6 | Still at the Chair | 38:00-45:00 | SC0229-SC0270 | done |

**Bangladesh** (Bangla, Taka). S0 to S4 are done; every chapter is still to write:

| Ch | Title | Time | Scenes |
|---|---|---|---|
| C1 | কাঁচি | 0:00-7:00 | SC0001-SC0045 |
| C2 | কিস্তি | 7:00-14:30 | SC0046-SC0090 |
| C3 | চাবি | 14:30-22:30 | SC0091-SC0138 |
| C4 | ঘোস্ট | 22:30-30:00 | SC0139-SC0183 |
| C5 | কর | 30:00-36:00 | SC0184-SC0219 |
| C6 | আয়না | 36:00-45:00 | SC0220-SC0270 |

**USA status (3 Nov 2026): finished.** C1–C6, `USA/qa.json` (14 fixes, all applied, `fix-log.json`), `USA/s6.md` (0 FAIL, 8 GAPs), `USA/s7.md`, and the page `ramesh-babu-usa.html` are on branch `ccr-cb190ece-ukm6vg`. Before render: fill the 24 `$[C##]` dollar placeholders (FRED AEXINUS + BLS CPI-U) and close the other S6 GAPs.

**Order of work.** One agent at a time; each step writes to files.

1. USA: finish C1, then write C5 (`productions/ramesh-babu/prompts/s5-USA-C1.txt`, `s5-USA-C5.txt`).
2. USA: QA (`qa-USA.txt` → `USA/qa.json`), then fixes (`fix-USA.txt`, which edits in place and keeps `.draft.md` copies), then the S6 report (`s6-USA.txt`) and the S7 publishing pack (`s7-USA.txt`).
3. Build the USA page: `cd productions/ramesh-babu && python3 assemble.py && npm install marked && node build.mjs result.json`.
4. Bangladesh: **postponed by the owner.** When it is resumed: C1 to C6, then QA, fixes, S6, S7 and the page, in the same way.

**Saving credits on the chapter agents.** Each agent reads:

- the version's `brief.md`;
- its own entry in `s3-chapters.json`;
- `s2.md` (the facts);
- `s4.md` (style, look, sound);
- one finished chapter as the format example (`USA/s5-C3.md`).

It does not read the whole engine manual. When the prompt names the manual, only sections 11 (compact scene-line format) and 16 (banned list) are needed. The prompt paths are relative to the repository root.

**Fixed rules for this film:**

- Facts only from `research_bio.json`. Where sources conflict, say "reports differ"; quotes are paraphrased with attribution.
- Footage only from Pexels, Pixabay, Videvo (free licence), Coverr and Mixkit, plus graphics. No AI imagery or audio.
- Never a stock face presented as Ramesh Babu or his family.
- The USA version is English only; the Bangladesh version is Bangla only. Never mix them.

## 3b. Platform status (4 Nov 2026)

The English (USA) path now runs end to end in code: `engine/src/film-run.mjs` (S0–S7, resumable, budget-capped), `engine/src/scene-lines.mjs` (every S5 chapter checked in code: clock, IDs, words, fields, banned phrases, language, sources, loops), `worker/` (Cloudflare Worker + Workflow + Claude API) and section 3 of `/studio/`. Tests: `npm test` (66 + 1). `npm run check` (wrangler dry-run) passes. It needs the owner's Cloudflare and API key: `docs/CONNECT.md`. Next: first real test run (2–10 min), then stock download, voice and render.

## 4. Benchmarks

The owner sent 39 example videos. `docs/YOUTUBE_BENCHMARKS.md` is meant to hold all the links with what to learn from each one. **It is not in the repository yet** (not on `main`, this branch or the studio branch); only the 7 links sent on 3 Nov are saved there so far. The main lessons are already built into `engine/src/formats.mjs` (15 formats) and `docs/SYSTEM_V5.md`:

- a superlative or impossible title with a concrete noun;
- the hook stated within 30 seconds;
- a new section every 1 to 3 minutes;
- one real named person with an exact date (the Yarnhub pattern);
- the end state shown first, then how it happened.

## 5. Decisions that must not change

1. No human approval step inside a run. The owner publishes.
2. Three native versions: Arabic (Islamic outlook), English (USA), Bangla.
3. Nothing is written on the video or thumbnail to mark fiction, AI or illustration. Invented stories get only a one-line note in the description; never call them true or attach them to a real person. Real people's stories are told from sources.
4. Quran:
   - verbatim Tanzil text only;
   - nothing laid under a recitation;
   - cut only at ayah ends;
   - never synthesised;
   - prophets, Companions, angels and Allah never depicted;
   - stories of prophets never told as fiction.
5. The owner's own voice is never altered. ElevenLabs: Multilingual v2 for English and Arabic documentaries, v3 for Bangla. **Updated 4 Nov 2026 (owner's permission):** v3 with per-scene delivery tags for stories and motivation in English, for emotional delivery.
6. Footage only from legal free sources or with the creator's written permission. No downloading from Facebook, X, YouTube or TikTok.
7. Never push to zupona's `main`. No PR unless the owner asks. Run `cd engine && npm test` before every push.
8. Cloudflare will be connected later by the owner. The code only has to be ready, and `npx wrangler deploy --dry-run` passes.
9. **AI scenes (owner's permission, 4 Nov 2026):** invented stories may use AI scenes with one consistent cast (CHR tokens from the S4 bible). Never the likeness of a real person, never a child as the focus, never a real brand. Disclosed in YouTube Studio's altered-or-synthetic setting; nothing on screen. Documentaries about real people stay on real footage.
10. **AI music (owner's permission, 4 Nov 2026):** scores can be generated per cue with ElevenLabs Music (instrumental, commercial use on a paid plan), with a record of each prompt. Hand-picked library tracks remain possible and win when present.
