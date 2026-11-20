# Engineering state (read this first)

Last updated: 12 November 2026 (second session the same day), branch `ccr-2867bb13-8ohb4z`.
How the system is built to survive failures and spread work across devices,
and how Bossism decides: `docs/ARCHITECTURE.md`.
Every number here was produced by running code in that session, not copied
from earlier documents. Where something was not verified, it says so.

The owner's master list (`docs/VISION.md`, top) and the engineering directive
of 12 Nov 2026 (two production systems, a central orchestrator "Bossism", no
mandatory paid API) are the goals. This file is the honest gap between those
goals and the code.

## 0. Live facts (keep short; newest first)

**HANDOFF, 20 Nov 2026 (start here; the long chat was closed to save the owner's tokens):**
- Everything is merged and live up to PR #19; branch `claude/zupona-studio-audit-stabilization-wrtgn1` = `main`.
  The owner gave written permission to merge and deploy (open a PR, wait for CI and the Cloudflare preview,
  merge, verify production with a browser). Another session works in parallel on `ccr-00e313f2-4u4e00`.
- Running test film `70577b9b-d321-4a9f-aedd-446cedb2403d` (Panama Canal, 3 min, started 04:41 UTC): format
  guess now none (PR #18 works), stages written by `gemini-3.6-flash` (pool works). Read it with
  `GET /api/films/<id>` (the studio key is saved as this environment's network secret for the site host).
  Watch for: "Too many subrequests" again (PR #19 should stop it; if not, add `step.sleep` between heavy stages
  so each runs in a fresh invocation), the daily limit of every model, then the GitHub render and the MP4.
- **PR #19 did NOT fix "Too many subrequests":** film 70577b9b failed at s2 the same way (04:45 UTC), with
  the pool's 30-request budget in place. So neither the pool's retries nor (likely) the earlier stages are the
  whole cause. Find it with evidence: log the number of fetches per step (wrap `fetch` in the Workflow and
  print counts), check whether R2 operations count toward Cloudflare's per-invocation limit on this plan, and
  try `step.sleep` between stages so each stage runs in a fresh invocation. Never answer it with a paid plan.
- Next, in order: (1) see that film to a rendered MP4 and inspect its frames and audio; (2) research rests on
  only 2 sites (engine marks a gap): improve the research desk's source spread; (3) owner's opinion pending on
  larger on-screen type for phones (now about 4-5 % of frame height).
- Owner's own tasks: Quran (written recording rights, a scholar's review); listen to the 40-minute narrator
  sample if wanted. Done by the owner on 20 Nov: GITHUB_TOKEN runtime secret, repository made private.

20 Nov 2026, workstream C (product, pricing, business):
- `docs/MARKET.md` (Kutly and 4 competitors, read from their pages; feature table against the code; gaps ranked)
  and `docs/BUSINESS.md` (first segment: English history channels; credits from real cost; 30-day plan).
- Measured: a 1080p render takes about 0.6 runner minutes per film minute (USA chapter 1, 510 s in 309 s on
  2 cores, local test clips). Kokoro narration time not measured. The landing now shows 1 credit = 1 finished
  minute, rounded up, "no charge during the private beta" (`src/data.ts` `estimateCredits`, `CREDIT_NOTE`).
- On-screen type for phones, decided with frames viewed at 390 px wide: source line 2.6 -> 3.4 %, chapter label
  2.4 -> 3.2 %, chapter title 5 -> 6 %, clip title 5.2 -> 5.8 % and anchored from the bottom (a 3-line title ran
  into the source line before), bar labels 3.5 -> 4.4 %, bar values 4.2 -> 5 %, map labels 4/4.5 -> 4.8/5.2 %,
  split panels 4.5/5.5 -> 5.4/6 %. Shot cache v9 -> v10.
- Seen on the old USA production (for workstream A): an editing note on screen ("(card, hold 8 s ≥ ...)"), a stray
  backslash ("billionaire barber\"), and source chips used as card text ("C14 · rtt.co.in"). Not checked on a new film.

20 Nov 2026, film 70577b9b hit "Too many subrequests" again (PR #19 was not enough):
- Measured: research (~30 fetches) + sources (10) + s2 add up past 50 in one engine lifetime; s2's two retries
  failed the same way (a 1-2 minute retry wait did not give a fresh count). A resume (new instance) ran s2-s4 at once.
- Fixed (`worker/quota-step.mjs`): that error is not retried in the same run; the Workflow sleeps 3, then 15,
  then 60 minutes and runs the stage again in a fresh lifetime. The global fetch is watched, so a stage whose
  desk swallowed the error (pages "unreadable", fewer documents) is run again instead of passing on thin evidence.
  Unverified live until the next film: that a 3-minute sleep hibernates (Cloudflare promises it only for a "long sleep").

20 Nov 2026, first live test of the pool (film 94b951c2, Panama Canal, 3 min):
- The pool works: 3.8-flash's day was used up, the research stage was written by `gemini-3.6-flash` (`servedBy`).
- Then stage s2 failed with Cloudflare's "Too many subrequests" (50 per invocation on the free plan): each
  model in the pool could retry six times on a busy 429, so one call went past 50 requests. Fixed: a call has a
  budget of 30 requests, a model that answers busy twice hands over, and the error names what each model said.
- Also seen: research rested on 2 sites (the engine marks it as a gap); the format guess was wrong (fixed, PR #18).

20 Nov 2026, Gemini model pool (`worker/gemini-pool.mjs`, on by default; `GEMINI_POOL=off` keeps one model):
- The free key allows 20 requests a day **per model**; films stopped after one model's day. The brain now asks
  Google which models this key may use (models.list), ranks the writers (flash, then flash-lite, newest first,
  stable before preview; never image, audio, embedding, pro), and when a model's day is used up (or it has no
  free quota) sends the same request to the next one. Only when all are spent does the film wait for
  midnight Pacific (PR #15's wait). Same key and project: no extra accounts (Google's terms forbid that; the
  owner proposed 4-5 Gmail keys and was advised against it). `GEMINI_MODELS="a,b"` names the models instead.
- Tested with fakes only (the Gemini key cannot be stored here): which models the owner's key really lists, and
  how much each adds, is unverified until the next film runs. Lighter models may write less well.
- Groq measured on the owner's key: 1,000 requests a day but 8,000 tokens a minute; one stage sends the 73 KB
  manual (~23,000 tokens), so Groq cannot run the film as built.

20 Nov 2026, graphics check and auto-render:
- Auto-render connected: the owner set `GITHUB_TOKEN` (runtime secret, after first putting it in the Build
  variables, where the running Worker cannot see it); PR #14 added `GITHUB_REPO` and `SITE_URL`; `/api/health`
  shows `github: true`. The repository was made private by the owner afterwards; fetch and push still work.
- Every graphic rendered at 1080p and checked frame by frame: route map (arc animates Bengaluru -> London),
  bar chart (bars rise, values on top), counter (333 -> 400), kinetic type, paper card with highlighter,
  split card. Found and fixed: card text left one lonely word on its last line ("his mother leased / it")
  and cut text past four lines silently; `wrap` now balances lines and never drops a word. Found and fixed:
  the shot cache key did not change when drawing changed, so old renders kept the old look (bumped v8 -> v9).
- Not changed (my opinion, unmeasured): on-screen text is about 4-5 % of the frame height; top channels often
  use larger type for phones.

20 Nov 2026, dead air and genre (owner: "no second wasted, motion by the kind of video"):
- `engine/src/voice-tighten.mjs` + `local/voice-film.mjs` (on by default, `--tighten off`): long stops in a
  voiceover are shortened only inside measured silence, crossfaded; narration: pauses over 1.2 s -> 0.7 s;
  Quran and unknown kind: only stops over 3.5 s -> 1.8 s, every natural pause kept, every cut listed in
  tighten.json for the reviewer; a given transcript is moved onto the new clock; the original file is never
  changed. Tested: a 42.8 s take with a 4 s pause and a 7 s stop -> 32.6 s, Whisper heard 73 words before
  and after; a 2-minute LibriVox human reading: no cut in either mode. Not done: filler words ("um") and
  false starts (need word times; never automatic for recitation).
- Idea films after `fitToVoice`: no voiced scene holds more than 2.5 s after its take (chapter 1 measured),
  so no extra trimming was added.
- Genre: `profileFor` scores the topic (x3) and the narration or voiceover words against 11 motion
  languages when a film has no format (Knowspire's title -> motivation, a Wake Island text -> war); the
  renderer passes the narration. The saved Ramesh Babu chapter reads as business.

20 Nov 2026, free score: the owner chose voice A (Kokoro, the Zupona narrator) after listening.
- Without ElevenLabs every music cue played nothing: on chapter 1 of `ramesh-babu/USA` 6 gaps of 6-12 s of
  dead silence. `engine/src/score-plan.mjs` reads each S4 cue's brief (mood, mode, tempo, instruments named
  first) and `render/score-synth.mjs` plays an original track (pads, low strings, ostinato pulse,
  Karplus-Strong guitar or pizzicato, felt piano, marimba, soft percussion, sub hits, a small hall reverb)
  in 1-4 s of CPU per 40 s; it enters gently and ends on the tonic. Refused where the music policy is not
  "score" (Quran, Islamic content, the Arabic version). Ambience the script asks for without a recording
  (SND-AMB-*) now plays as synthesised room tone. Re-render: all 5 cues played, 0 silences of 2.5 s or more
  at -50 dB (was 6); the script's own "music out" moment is room tone at about -35 dB. Musical quality is
  not measured by any metric here: the owner listens.
- Render workflow: committed tracks, then ElevenLabs Music when its key is set, then the free score.

20 Nov 2026, deploy: with the owner's written permission, PR #9 (this branch, after merging main's PR #7 and
#8; this branch's own "Start the film" dropped as a duplicate of PR #7) was merged and Cloudflare Workers
Builds deployed it in ~100 s. Production checked in Chromium: landing steps, Apollo -> Space, PR #7's key
field and "Make my film", `/studio/` motion choice and English/Arabic only, `/api/health` all connected
(Gemini 3.8 Flash, storage, workflow, token), no page errors. PR previews deploy to
`<branch>-ai-x-com.sayedmuntasim3.workers.dev` (no R2, workflow or secrets there: health shows false).

20 Nov 2026 (live site checked: https://ai-x-com.sayedmuntasim3.workers.dev, reachable from cloud sessions):
- `/api/health`: brain Gemini 2.5 Flash connected, storage, workflow, studio token, Pixabay and YouTube set;
  GitHub not connected (no automatic render), Pexels not set. Whether Gemini's free tier answers is unverified.
- Live landing: Create sent nothing (only a "Brief ready" sheet); an Apollo idea stayed "Nature".
  On this branch (not deployed): the idea system follows the idea's words until picked by hand; with the
  studio key on the device (the key `/studio/` saves), the brief sheet has "Start the film", which POSTs
  `/api/films` (topic, length, formatId auto, notes with audience, idea system, style and music; calm motion
  for observational, minimal, storybook or kids) and links the film page. Without a key: the old note.
  Voiceover mode still has no upload route. Checked in Chromium with the API answered by a stand-in.
- "~N credits" on the landing is a made-up number (1.25 a minute), not a cost.

19 Nov 2026, second session (motion and timing; checked by rendering real MP4s):
- **Timing bug found and fixed.** Scene slots came from the script's word count; a longer take was sped up
  (max 15 %) and then **cut**: on chapter 1 of `ramesh-babu/USA` 14 of 48 scenes, 3 lost words (the hook
  included). `fitToVoice` (timeline.mjs) now fits scene times to the real takes: a long take borrows the
  chapter's spare time, else the chapter grows; timed shots and the Edit Director's moves follow the new
  clock. Re-render: 0 cut, 0 sped up, 510 s -> 514 s. `--timing script` keeps the old rule.
- **Motion audit:** already working: transitions (whip, slide, zoom, flash, glitch, leak, dips), punch-ins
  and shakes (Edit Director), maps with routes, charts, counters, kinetic type, highlights, split cards,
  print frames, focus zooms, 2.5D parallax for portrait photos. Weak: a still's move came by rota (push,
  pull, pan), linear, a fixed 9 % whatever the shot length; MOTION was read only for "push" and slow motion.
- **Adaptive motion** (`engine/src/motion.mjs`): 13 motion languages (25 formats mapped), levels
  reduced/calm/balanced/dynamic, scene purpose from the script, MOTION locks, speed capped per second,
  no move three times running, pans alternate, eased moves, flashes rationed by genre (photosensitivity),
  shakes only where the genre shakes. Owner/creator choice "Picture motion" in `/studio/` -> `film.motionLevel`.
  Measured on a 6-photo render: eased shots start and end 3-10x slower than their middle (old: constant
  speed into every cut); a document is held still to be read.
- **Landing page** (design unchanged; only `public/app.js` rebuilt): duration steps 1/5/10 minutes (8 -> 60
  was 52 taps, now 12); a recording over 2 h is refused with its real length (was silently shown as 2 h);
  the chapter preview of a short recording spans its real length (a 40 s take was drawn as 60 s).
  Checked in Chromium at phone width. Still true: its Create button sends nothing to the engine.
- Reference videos the owner sent (19 Nov): Yarnhub (military history: 3D reenactment, maps), Isaac
  (creator education), Knowspire (motivation). Titles read; the videos themselves were not watched
  (no video access here). 3D reenactment is out of reach without a GPU; maps, routes, archive
  treatment and type are in the engine.
- Owner, 19 Nov: Kokoro samples are "not extreme level"; zero cost, no Claude. Brain test later (Groq).

19 Nov 2026 (branch `claude/zupona-studio-audit-stabilization-wrtgn1`, from `main` at PR #5; checked with git and by running code):
- **Owner decisions:** PR #5 is production. Content languages now: **American English documentaries and
  Arabic Quran recitation films only**; Bangla and Hindi are not offered (Bangla code, rules and tests are
  kept, switched off by `ACTIVE_VERSION_IDS` in `engine/src/versions.mjs`; the studio's own UI stays in
  Bangla for the owner). No merge, deploy, branch deletion, force push or reset without his written OK;
  on any conflict, ask him.
- **Branches:** `main` already holds every commit of PR #2 (the 151 roles, Bossism; merged through PR #5)
  and of every `ccr-*` branch except four. Unmerged, kept, not touched: PR #4 `ccr-c21902ce-p7sii2`
  (4 commits, 197 behind: TypeScript `src/media/` = the source of `engine/src/open-archives-lib.mjs`,
  which `main` already bundles; a second Worker entry `worker/index.ts` that conflicts with
  `worker/index.mjs`; a `library.tsx` page; shot lists), PR #6 `ccr-3f6f211f-agtnzh` (its Worker was
  reverted; only notes left, copied into CLAUDE.md and here), `ccr-00e313f2-4u4e00` (one CLAUDE.md note,
  copied), `ccr-48feac19-2ao1hq` (an old landing redesign, 200 behind).
- **Tests:** 334 engine + 127 platform pass; type check and `npm run check` pass.
- **Landing page:** its Create/Studio section sends no request (`src/*.tsx` has no `fetch`); the working
  engine UI is `/studio/`.
- **Brain:** Gemini free tier is unavailable on the owner's Google account (17 Nov). `GROQ_API_KEY` is set on
  Cloudflare but **no code reads it**. Groq works today without code through the OpenAI-compatible local
  brain: `BRAIN_URL=https://api.groq.com/openai/v1`, `BRAIN_API=openai`, `BRAIN_MODEL=<model>`, secret
  `BRAIN_KEY`. Untested: Groq's free tier allows only a few thousand tokens a minute, likely less than one
  stage's prompt (the manual is ~73 KB).
- **Voice:** new free **Zupona narrator** (Kokoro-82M, Apache-2.0; `docs/VOICE_SYSTEM.md`, last section).
  Proven here: chapter 1 of `productions/ramesh-babu/USA` narrated (48 scenes, 7 min 21 s, 2 min of CPU)
  and rendered to a real MP4 (510 s, 640x360, h264 + aac; -15.9 LUFS, peak -1.2 dBFS, no black or frozen
  frames). Found: wordless scenes are 6-12 s of dead silence without paid music (free music is missing).
- **Costs:** `wrangler.jsonc` still has `BUDGET_USD "60"` and `MODEL claude-opus-5-5` (used only when
  `BRAIN=claude` is set). The owner's whole cash budget is BDT 2,000 (~16 USD): lower it before Claude is
  ever switched on.
- Not one film has run against a real brain yet.

17 Nov 2026 (from PR #6's notes): Cloudflare secrets seen: `GEMINI_API_KEY`, `PIXABAY_API_KEY`,
`STUDIO_TOKEN`, `GROQ_API_KEY`; `YOUTUBE_API_KEY` not seen by the Worker. `ai.zupona.com` cannot be
reached from cloud sessions (proxy 502): ask the owner to paste `/api/health`.

## 0b. Open items ledger (20 Nov 2026, from the whole long session; nothing below is done unless marked)

Master mission (ChatGPT's brief, 19 Nov) and the owner's own asks, item by item:
- **First real film end to end: NOT done.** Blocked at s2 by "Too many subrequests" (see handoff). Then:
  render through GitHub (connected, never yet triggered by a real film), inspect the MP4 frames and audio.
- **151 roles, report A-E** (defined / scheduled / invoked / doing real work / redundant): only ROLE_STATUS
  counts were reported; no per-role check from real run logs. Do it after the first real film exists.
- **Business plan (Part K): drafted 20 Nov** (`docs/BUSINESS.md`, `docs/MARKET.md`); selling waits for a real film. Was: - market for long-form documentary tools, first paying segment, pricing
  from real per-film cost, first customers. Kutly was never studied. 7-day plan never written as such.
- **Cost:** `BUDGET_USD` is still "60" (owner never answered the question to lower it; with free brains it does
  nothing, with Claude it would allow $60 a film). Landing page "~N credits" is invented (1.25 a minute), not a
  real cost: needs a pricing decision. Cost ledger never checked against a real run.
- **Media sources (Part G): NOT audited** live (relevance, licence tiering, rate limits). Wikimedia answers 429 to
  this container; NASA works. Research rests on 2 sites in both test films (engine marks a gap).
- **Brain, zero cost:** Gemini free = 20 requests a day per model; the pool rotates models (works live).
  Groq free = 1,000 a day but 8,000 tokens a minute; every stage sends the 73 KB manual (~23,000 tokens), so Groq
  cannot run until a lean-manual mode sends only the sections a stage needs (also cuts Gemini usage). Not built.
  Cloudflare Workers AI free allocation and the owner's own computer (local brain) not tried.
- **Voice:** Zupona narrator (Kokoro, voice A, owner's choice) live; 40-minute test passed. Not done: NeuTTS
  Air / VoxCPM benchmark, a consented own-voice clone option, Arabic narration voice (recitation is never
  synthesized), filler-word and false-start removal in voiceovers.
- **Voiceover mode from the landing page / studio: no upload route** (the CLI `local/voice-film.mjs` works).
- **Quran:** nothing advanced beyond the Quran-safe pause tightening; blockers remain (scholar sign-off,
  written rights with the friend's name, Ad-Duha timing FAIL).
- **Film quality not yet evaluated on a real film:** picture relevance to narration, repeated images, map
  accuracy, 9:16 Shorts, subtitles, thumbnails; the 12-point evaluation framework of the motion brief was never
  built. On-screen type size for phones (4-5 % of frame height) awaits the owner's opinion.
- **Timeline edits by the user persist / not overwritten by regeneration** (motion brief Part 7): not checked.
- **PR #4's unique parts never brought in:** the `library.tsx` media library page and the free shot-list planner
  (`worker/plan.ts`); its `worker/index.ts` must stay out (second Worker entry). The owner first said leave
  PR #4/#6 alone, later said keep everything valuable: ask him before porting.
- **Reference videos** (Yarnhub, Isaac, Knowspire): only titles read; never watched (no video access).
Mistakes made in the session (so they are not repeated): said "starting" work several times before doing it;
guessed a merge SHA (409, then corrected); claimed PR #19 would fix the subrequest error before a live run proved
it (it did not); wrote the voiceover narration duration confusingly once.

## 1. Where the code is

| Place | What it holds |
|---|---|
| `sayedmuntasim3-cmd/ai.x.com`, branch `main` | since PR #5 (16 Nov 2026): the landing page and the whole studio (`engine/`, `worker/`, `render/`, `public/studio/`). This is what is live. |
| branch `ccr-5d51ed58-vk6gaw` (and this branch, which continues it) | the whole AI documentary studio: `engine/`, `worker/`, `render/`, `public/studio/`, `prompts/`, `docs/`, one saved production |
| `ccr-d2a6b2aa-chfb81`, `ccr-cb190ece-ukm6vg`, `ccr-cd4452ea-fvd6po`, `claude/studio-first-screen-y4tp15` | earlier stages of the same work; all merged into `ccr-5d51ed58-vk6gaw` |
| `ccr-48feac19-2ao1hq` | a landing-page redesign, not merged anywhere |
| `sajid1234sajid/zupona` and the ~70 branches in `branches.txt` | **not reachable from these sessions.** `README.txt` describes folders and a git bundle that are not in this repository. |

The studio is deployed from `main` (PR #5). Merging into `main` and deploying are the
owner's decisions.

## 2. Verified numbers (12 Nov 2026)

- Tests (third session, 12 Nov 2026): **206 engine + 75 platform = 281, all passing** after `npm ci` at the
  root (a fresh container has no root `node_modules`). Earlier: 173 + 73 = 246; strict
  JSDoc type check passes (`cd engine && npm run typecheck`); Cloudflare build
  check passes (`npm run check`). Before this session: 141 + 48 = 189.
- Size: about 54,600 tracked lines, of which about **16,500 are application
  code** (engine 7.9k, worker 1.2k plus this session's additions, render 3.5k,
  studio UI 1.3k). The rest is one saved production (15.4k lines), prompts,
  docs and data. The "52,000 lines" figure counted all of it.
- Roles: 151 rows in 15 squads (`engine/src/agent-roster.mjs`). By evidence
  (`ROLE_STATUS`, corrected this session): **63 code, 46 model, 6 built but
  not wired, 36 planned.** Earlier: 61 / 47 / 43; eleven entries had become
  untrue after later commits (see 5).
- How roles really run: they are not separate programs. One film run
  (`engine/src/film-run.mjs`) is about 15 model stages (market, S0/S1,
  research, sources, S2, S3, S4, S5 per chapter, repairs, QA, viewer panel,
  Edit Director per chapter, media per chapter, S6, S7, originality) with code
  checks between them. Each role names the stage or module that does its job.

## 3. The directive, part by part

| Part | State | Where |
|---|---|---|
| **System A: idea to documentary** | Built end to end in code for English (USA); tested only with fakes; **never run against real APIs or deployed** | `engine/src/film-run.mjs`, `worker/`, `render/` |
| **System B: voiceover to documentary** | **Built and run end to end from the command line** (`local/voice-film.mjs`): any audio via ffmpeg, voice report, speech-to-text (faster-whisper: real run on a LibriVox recording in GitHub Actions; pocketsphinx: real run here), transcripts from ElevenLabs/SRT/VTT/Whisper, the owner's script timed by what was heard, scenes with words proven unchanged, structure, picture plan (brain optional), keyless licensed media, one-track render (voice sample-identical). Missing: upload route, studio switch, a real writer brain in the CLI, picture judging | `docs/VOICE_SYSTEM.md`, `engine/src/transcript.mjs`, `voice-understand.mjs`, `voice-visuals.mjs`, `render/render-film.mjs --one-track` |
| Quran recitation films | Recognition from a transcript, ayah-by-ayah plan with verbatim Tanzil text, wired into the voice CLI (`--kind quran|auto`); `quranVisualAdabGuard` (no music, no living beings or AI pictures, verbatim text, meanings only with a licence: else a reported gap). Missing: Quran speech recognition (general Whisper is weak on recitation; untested on a real recitation), Uthmani text and font, a licensed translation, picture choice by meaning, render of the ayah cards | `engine/src/quran.mjs`, `engine/src/quran-film.mjs`, `engine/src/voice-visuals.mjs` |
| **Bossism (central supervisor)** | **Built, first version:** production graph of the real run with roster roles; preflight that refuses what cannot work and names every lowered quality; seven evidence gates; bounded revision with notes; release gate and master gate; decision record; owner approval with a reason. Not yet: an independent critic model, parallel stage execution | `engine/src/bossism.mjs`, `engine/src/supervise.mjs`, `render/release-gate.mjs` |
| **Distributed work** | **Built:** durable job queue (leases, checkpoints, bounded retries, time limits, eligibility by capability), workers on the owner's machines pulling from the cloud studio, device tiers | `engine/src/jobs.mjs`, `engine/src/job-runner.mjs`, `worker/jobs-api.mjs`, `local/jobs.mjs` |
| **Phones** | Voice check in constant memory (WAV exact, MP3 in parts, others refused when they do not fit); polling that survives weak signal | `engine/src/loudness.mjs`, `engine/src/wav.mjs`, `public/studio/` |
| Script intelligence | Model stages S1–S5 under a long manual, with code checks per scene line, a cold-read viewer panel, originality guard, hook check; same-model QA | `prompts/1-...full.txt`, `scene-lines.mjs`, `film-run.mjs` |
| YouTube packaging | S7 (titles, 3 thumbnail briefs, description, chapters, tags, Shorts, Facebook cut); code checks titles; thumbnails rendered; market desk with `YOUTUBE_API_KEY` | `film-run.mjs` S7, `render/thumbnails.mjs`, `worker/youtube.mjs` |
| Visual intelligence | Per-shot queries, 9 licensed sources with item-level licence records, no repeat within 10 minutes, footage desk judging thumbnails (only for a brain that can see), owner's own pictures | `engine/src/film-media.mjs`, `film-run.mjs` |
| Voice | ElevenLabs per scene (paid for commercial use); the owner's own takes used first; studio recording check. **No open-source TTS yet** | `render/voice.mjs`, `engine/src/loudness.mjs` |
| Production blueprint | Yes: S5 compact scene lines (narration, shots, FX, transition, motion, SFX, music, look per scene), turned into a frame-exact timeline | `scene-lines.mjs`, `timeline.mjs` |
| Long-form | Runs accept 1–300 minutes; the run resumes; render segments are cached by content hash. Reported earlier: a 45-minute film rendered at 320×180. **Not verified at 1080p or beyond 45 minutes** | `film-run.mjs`, `render/render-film.mjs` |
| Quality gates | Bossism's seven gates and the master gate decide release (section 5 of `docs/ARCHITECTURE.md`); a film that fails a critical gate is neither rendered nor published without the owner's recorded approval | `engine/src/bossism.mjs` |
| **Zero mandatory paid API** | **Done this session for the writer**: free local brain, research without paid search, local runner. Voice still needs ElevenLabs or the owner's recording | `worker/local-brain.mjs`, `worker/brain.mjs`, `engine/src/research-desk.mjs`, `local/run-film.mjs`, `docs/BRAIN.md` |

## 4. What this session changed (12 Nov 2026)

1. **Free brain plug.** `worker/local-brain.mjs` talks to Ollama (native API,
   window set per request) or any OpenAI-compatible server; it declares what
   it can do, removes reasoning blocks, waits for a busy machine, and refuses
   a request that does not fit its window instead of letting it be truncated.
   `worker/brain.mjs` chooses the brain (`BRAIN`, free first).
2. **Research desk in code** (`engine/src/research-desk.mjs`) for a brain
   without web search: the brain lists searches, code opens Wikipedia, the
   pages the articles cite and the owner's SearXNG, and facts may cite only
   opened pages. The corpus is saved for audit.
3. **Local runner** (`local/run-film.mjs`, `npm run film`): the whole film
   run on the owner's computer with a folder store; prints the render
   command.
4. **Bug fixed:** Gemini was asked to judge thumbnails it never received
   (its adapter drops images), and the blind verdict chose the clips. Brains
   now declare `capabilities.vision`; a blind brain skips the desk and the
   gap says why.
5. **Bug fixed:** cost estimates assumed Claude's prices whatever the brain,
   in the Worker and on the studio page. Estimates and run costs now use the
   connected brain; an unknown model is still never estimated as free.
6. **Role status corrected** against the code, with a new `built` state for
   tested code that no run calls yet.
7. `films/` is ignored by git, so a local film is not published by accident
   from this public repository.

Not verified this session: no real local model (model downloads are blocked
here) and no live Wikipedia call (blocked by this environment's network
policy). Both are tested against fixtures that follow the documented formats.

## 4b. What the second session changed (12 Nov 2026)

1. **Publication safety fixed:** a film that finished with gaps used to be
   rendered and published as a public GitHub release automatically. Now only
   a film Bossism cleared, or the owner approved with a reason, is rendered;
   the render workflow checks before spending anything and measures the
   master before publishing.
2. **Bossism, first version** (see `docs/ARCHITECTURE.md` section 5).
3. **Durable job queue and remote workers** (sections 3 and 4 there): a
   machine killed mid-job is replaced and the job continues from its
   checkpoint, verified with real processes and in the local Workers runtime.
4. **Phones:** the voice check no longer loads whole recordings (measured:
   a 10-minute WAV +463 MB before, +99 MB now).
5. **film-run.mjs:** each stage's gaps and spending travel in its step
   result (no loss on a replayed step, no duplicate gaps on a retry); a stop
   signal pauses between stages; QA reads chapter by chapter when the brain's
   window cannot hold the whole film.
6. **Bilingual messages:** every job, plan, gate and decision message in
   English and Bengali, checked by a test.

## 4c. What the third session changed (12 Nov 2026)

Plans: `docs/BOSSISM_VISION.md` (canonical vision), `docs/BOSS_SCRIPT_ENGINE_MASTER_PLAN.md` (v3),
`docs/OPENAI_PLATFORM_RESEARCH.md` (v2; desk research only), two audits. Code (all mock-tested, never run
with a real model):

- **Claims gate** (`bossism.mjs`): unresolved markers (`[C12 low]`, `[TBD]` ...) block; a marker replaced
  by a number while the ledger has no value blocks; cited claims need evidence the research kept, a FACT
  needs a confirmed page, a bare FACT rated low blocks. The Ramesh Babu film is now blocked by it (43 markers).
- **C2, sentence claim tags** (`scene-lines.mjs`): every NARR sentence of a true-story film ends with
  `{C01}` or `{N}`; tags are never spoken. S5 is told; `checkChapter` reports missing tags so repairs fix
  them and QA/viewer fixes that drop one are reverted; the gate also blocks `{N}` sentences with numbers,
  dates or new names, UNKNOWN claims stating values, and on-screen numbers with no claim. A ledger row that
  names research fact IDs uses exactly those facts; a shared page is "ambiguous" for a FACT.
- **Gate statuses**: every gate reports PASS, FAIL, BLOCKED or NOT APPLICABLE; a gate that could not run
  (no research check, no ledger, no viewer panel, no pictures ...) blocks. **Script-only films**
  (`newFilm({ scriptOnly: true })`, `local/run-film.mjs --script-only`) skip the edit and pictures; their
  visual and rights gates are NOT APPLICABLE with the reason; their review never clears a film for release.
- Reviews carry `GATES_VERSION` (now 4): a review by older gates clears nothing and is redone.

Deliberately not done: making the story gate critical (its signals today are the writer's own model and a
regex; that waits for an independent critic), and gating on `lintNarration` (on the Ramesh Babu script it
only flags three sentences starting with "a"/"the": too weak to block on).

Phase 0 is blocked: the owner declined the research-access environment on 12 Nov 2026; no Gemini key is set.

## 4d. Security audit (12 Nov 2026)

Checked in code: routes and tokens (`worker/index.mjs`, `worker/jobs-api.mjs`), file names, the render
workflow, pages the engine opens, secrets in logs, dependencies (`npm audit`: 0 known vulnerabilities).

Fixed:
- **SSRF on the owner's machine.** The source desk opened every URL a model cited, with no address check,
  and both desks followed redirects blindly; `publicUrl` missed forms such as `[::ffff:127.0.0.1]`,
  `fe80::`, single-label names (`router`), `.lan`, credentials in the URL. Now `engine/src/net-guard.mjs`:
  `publicUrl` (private, reserved, link-local and metadata addresses refused in every notation),
  `safeFetch` (redirects followed by hand, each hop checked, at most 5), used by the research and source
  desks; `local/run-film.mjs` `guardedFetch` also refuses hosts whose DNS answers include a private
  address. The search providers' own APIs (Wikipedia, the owner's SearXNG) are not guarded.
- **Prompt injection.** The research instructions now say web pages are data, never instructions.

Already sound: constant-time token comparison; owner routes need `STUDIO_TOKEN`, workers a separate
`WORKER_TOKEN` with job leases; file names cannot leave a film's folder; the render workflow validates its
inputs through environment variables; the film page has a strict CSP and no script.

Open (needs an owner decision or a production change):
- Film files, pages and scripts are readable by anyone who has the film's UUID (no token); renders publish
  films as public pre-releases while the repository is public.
- The studio page (`public/studio/`) is served without security headers (CSP) and keeps the studio token in
  localStorage; a `public/_headers` file would add them (a production configuration change).
- DNS rebinding between the check and the connection is not fully excluded on the owner's machine.
- Pictures the owner adds by URL and provider clips are downloaded by the renderer without this guard.

## 4e. Cost control (12 Nov 2026; Master Plan Phase 1b, first part)

Found in code: the budget was checked only between stages, so a run could overrun it by a whole stage;
with both keys set and no `BRAIN`, the paid brain (Claude) was chosen before the free one (Gemini); the
local runner ran a paid brain with no budget at all; there was no emergency stop.

Now:
- **Hard cap per call** (`film-run.mjs` `worstCost`): before every model call its worst case (all input at
  the highest input price, the whole output allowance, every search it may make) is reserved; a call that
  could cross `budgetUsd` is never made. A model with no known price is priced at the highest listed one.
  A brain that is free per token (local, Gemini's free tier) reserves nothing, searches included.
- **No automatic paid brain** (`worker/brain.mjs`): without `BRAIN`, only a free brain is chosen (local,
  then Gemini); Claude runs only with `BRAIN=claude`. A Claude key alone connects nothing.
- **No paid run without a cap** (`local/run-film.mjs`): a brain whose estimate is above $0 needs `--budget`.
  The studio already applies `BUDGET_USD` (default $60).
- **Emergency stop**, asked before every model call: a `STOP` file in the film's folder or `ZUPONA_STOP=1`
  on the owner's machine; the key `control/stop` in the films bucket in the studio. The run is saved as
  paused and resumes when the stop is lifted.

Not yet (Master Plan §23): a dated price registry (E2; the price table is still inline and Gemini is listed
at $0, which is right only for a project without billing), per-project provider flags (E3), day and month
caps, a studio stop button. A Gemini model missing from `PRICES` is priced like the most expensive model
(safe, but its cost is then over-reported and it needs `--budget`).

## 4f. Architecture validation (12 Nov 2026)

Checked, and now kept by tests (`engine/test/architecture.test.mjs`): `engine/src` imports only its own
modules (it runs in the browser studio and in Node), its modules have no import cycle, and every message
code used in the engine, worker, local runner, renderer and studio exists in `messages.mjs`. Existing tests
already keep the studio's copy identical to `engine/src` and the production graph equal to the stages the
run executes.

Fixed: a script-only film's production graph listed the edit, pictures, render and master stages it never
runs; they are now left out of its graph (`SCRIPT_ONLY_SKIPS`).

Known structural debt, unchanged on purpose (Master Plan §5, §20 Phase 2): `film-run.mjs` runs every stage
in one long function; `ROLE_STATUS` is still written by hand; every stage receives the whole 73 KB manual.

## 4g. Research source test (12 Nov 2026; step 4)

Environment ai.x.com (19-host allowlist). `curl -sS -o /dev/null -m 15
-w '%{http_code} %{time_total}'`, generic user agent `research-source-check/1.0`,
no personal data. Root `https://<host>/`, no redirect follow unless stated.

| Host | Root status, time (s) | Real read request | Result |
|---|---|---|---|
| ai.google.dev | 301 0.32 (to ai.google, not allowed: proxy 403) | `/gemini-api/docs` → 301 | reachable; docs page redirects, not followed |
| en.wikipedia.org | 301 0.07; followed 200 | api.php search "Tenerife" | **FAIL: 429** "too many requests" (twice) |
| www.wikidata.org | 301 0.45; followed 200 | wbsearchentities "Tenerife" | **FAIL: 429** (twice) |
| api.openalex.org | 200 0.06 | /works?search=CRISPR&per-page=1 | **FAIL: 429** "no API key, shared daily budget used up" |
| api.crossref.org | 302 0.22; followed 200 | /works?query=CRISPR&rows=1 | OK: 51112 hits, DOI 10.1089/crispr.2020.29108.kda |
| www.ebi.ac.uk | 200 7.07 | Europe PMC search CRISPR | OK: 241933 hits |
| eutils.ncbi.nlm.nih.gov | 301 0.30 (to www.ncbi, not allowed) | esearch pubmed CRISPR | OK: 72606 hits, first id 43014682 |
| pmc.ncbi.nlm.nih.gov | 200 0.20 | – | reachable |
| www.nobelprize.org | 200 2.00 | – | reachable |
| www.uspto.gov | 200 0.45 | – | reachable |
| www.cafc.uscourts.gov | 200 1.19 | – | reachable |
| archive.org | 200 0.32 | advancedsearch "Tenerife" | OK: 3238 hits |
| www.loc.gov | 200 0.09 | /search/?q=Tenerife&fo=json | first try **timeout 15 s**; retry (30 s) OK: 6363 hits |
| wmo.int | 200 2.01 | – | reachable |
| reliefweb.int | 200 0.29 | api.reliefweb.int | **FAIL: api.reliefweb.int is not on the allowlist** (proxy 403) |
| www.britannica.com | **403** 0.33 | – | **FAIL: Cloudflare bot challenge** (`cf-mitigated: challenge`) |
| www.faa.gov | 200 0.21 | – | reachable |
| aviation-safety.net | **403** 0.25 | – | **FAIL: Cloudflare bot challenge** |
| skybrary.aero | 302 0.30; followed 200 | – | reachable |
| example.com (not listed) | `CONNECT tunnel failed, response 403` 000 | – | refused, as expected: the allowlist holds |

Meaning: 19/19 hosts pass the proxy. Data came back from Crossref, Europe PMC,
NCBI, archive.org, LOC. Wikipedia/Wikidata/OpenAlex refuse by rate limit on
the shared cloud IP (Wikimedia wants a contact UA; OpenAlex wants a free key);
from the owner's own machine they may work, unverified. Britannica and
aviation-safety.net block scripts; ReliefWeb needs host api.reliefweb.int
added. Next: Phase 0 needs a free Gemini key (Google project without billing),
only with the owner's approval.

**Correction (same day, later test).** With the project's own user agent
(`ZuponaStudio/1.0 (...; https://github.com/sayedmuntasim3-cmd/ai.x.com)`, the
one `research-desk.mjs` already sends), Wikipedia search returned **200 with
data** (10961 hits for "Tenerife"). The 429 above came from my generic test
agent with no contact link. Wikidata and OpenAlex still returned 429 with the
project agent (OpenAlex: "no API key, shared daily budget used up").

## 4h. Research sources module (12 Nov 2026; Blueprint step 1 / G4)

New `engine/src/research-sources.mjs`: Crossref, Europe PMC, PubMed
(E-utilities), Internet Archive, Library of Congress, each a `ResearchProvider`
of the existing research desk (no second research path). Off by default:
`researchProviders({ sources })`, and `RESEARCH_SOURCES=crossref,europepmc,pubmed,archive,loc`
for `local/run-film.mjs`. The Worker is **not** changed (no production change).

- Evidence: each document's `url` is the record URL whose response holds the
  exact text kept (Crossref work, Europe PMC core record, PubMed efetch
  abstract, Archive metadata, LOC item JSON), so the source desk can reopen it;
  `meta.canonical` is the human page (doi.org, europepmc.org, pubmed, archive
  details, LOC item), `meta.kind` labels it (preprint "not peer reviewed",
  "bibliographic record", catalogued item); the brain sees both lines.
- Safety: one https host per source; other hosts, http, ports, credentials,
  redirects off the host and private addresses refused (`safeFetch` on every
  hop). Per-source minimum gap, one request at a time, timeouts (LOC 45 s:
  its search measured 13-27 s), 2 MB cap, 2 retries on 429/5xx/network with
  backoff, Retry-After capped at 10 s; error codes (`http-404`, `timeout`,
  `host-refused`, `bad-json`). No key, no email; NCBI gets `tool=zupona-studio`.
- English first: Europe PMC adds `LANG:eng`; Archive searches text items only.
- Tests (simulated, replay of real responses recorded today, trimmed):
  `engine/test/research-sources.test.mjs`, 11 tests, fixtures in
  `engine/test/fixtures/research-sources/`.
- **Live check** (real requests, `node local/research-sources-check.mjs`,
  12 Nov 2026 08:19 UTC): all 5 searched and read OK. Crossref 3 hits
  (2.7 s), Europe PMC 3 (0.5 s), PubMed 3 (0.7 s), Archive 3 (0.7 s),
  LOC 1 item (12.7 s).
- **Quality limits found live:** Crossref ranked an unrelated Tenerife
  airport-terminal record first and has no abstracts for most works: use it to
  confirm that a cited paper exists, not as a fact source. Archive's first hit
  was a Reddit podcast until text items only were searched (now a CIA reading
  room document). LOC is slow. No source ranking or reliability scoring
  exists yet: that is Master Plan Phase 3 (R-stages), not built here.

## 4i. Phase 0 preparation (12 Nov 2026)

Everything for the first real-model experiment is built and tested; nothing
has run live. See `docs/evals/PHASE0_READINESS.md` (model `gemini-3.8-flash`,
free tier verified on Google's official pages; arms A = model knowledge,
B = research desk; 40-request cap; minimal context; copy check; gold sheet
v1 from official sources; fairness rule). Blocked only on the Gemini key.

## 4j. Voice mastering engine (13 Nov 2026)

Map and state: `docs/VOICE_SYSTEM.md` (section "Voice mastering engine"). Pure JS in `engine/src/`:
`voice-dsp.mjs` (filters, FFT, STFT), `voice-analyze.mjs`, `voice-chain.mjs` (cleanup, tone, dynamics),
`voice-reverb.mjs` (impulse responses made in code, echo-free proof, send automation), `voice-master.mjs`
(orchestration, peak stage, limiter, two-pass loudness), `voice-proof.mjs`, `voice-test-signal.mjs`.
CLI `local/voice-master.mjs`; `local/voice-film.mjs --master` runs it through `planVoice`.
Owner decision recorded in `voice-plan.mjs`: smooth hall reverb allowed for recitation, repeating echo never.
Verified on the GitHub runner (run 43374825142) on three real recordings: -14 LUFS, true peak <= -1 dBTP,
timing and pitch proofs passed. **Not verified by ear**; the owner's own recording is the real test.
Next: tune by ear with the owner's recording; stereo in the renderer; chunked processing over 30 minutes;
real ayah times into the send automation; studio page and upload.

## 4k. Quran recitation documentary: direction and plan (13 Nov 2026)

The owner's direction for the next phase is recorded in `docs/QURAN_DOCUMENTARY.md` (rules, audit of
what exists and what is missing, design, stages Q1 to Q7 with measured exits); his full text is in
`docs/QURAN_DIRECTION_OWNER.md`. This phase is Quran only.

## 4l. Quran films built and verified (13-14 Nov 2026), handoff for the next session

Q1-Q7 are built: locate, meaning, director, media, render (16:9, 4K, 9:16), Shorts, review and sign-off.
Then came the production-standard pass and the owner's platform brief. Read these, in this order:
- `docs/QURAN_ENGINEERING_REPORT.md`: assessment, PASS / FAIL table, release decision, next steps.
- `docs/QURAN_DOCUMENTARY.md`, State section: every measured number and runner run.
- `docs/QURAN_VOICE_GUIDE.md`: sound, recording and editing standard.
- `docs/QURAN_REVIEW_SHEET.md`: for the scholar and the editor.

State at the end:
- Four runner films (run 43562077892) pass their own checks. Their frames were inspected.
- No film is publishable: no qualified reviewer has signed, no recording's rights are written down, and
  the Ad-Duha verse timing is unverified (FAIL).
- The recordings belong to the owner's friend, who gave permission for a documentary YouTube business.
  The rights still have to be written down with the friend's name (`--rights`).
- Visual validation: 186 labelled pictures, labelled by the assistant (`local/media/validation/`).

Next work, in order:
1. The friend's direct recording (voice guide, section 4), through the whole chain.
2. A scholar reviews one film with `review.html`.
3. A person checks the 186 labels; a fresh picture set confirms the thresholds.
4. A third-method rule for recognized recordings: recognizer, pauses and aligner (al-Mulk 67:6).
5. A Quran-specific aligner for slow melodic recitation (Ad-Duha).
6. P2: maps, manuscripts and thumbnails for the documentary films; the owner's Pexels / Pixabay free keys
   for more video.

## 5. Role entries corrected

`research-primary-source` (now also the code desk), `story-transcript-integrity`
(built), `footage-exact-match`, `footage-scene-fit`, `footage-release-risk`
(only when the brain can see), `footage-provider-coverage` and
`footage-license` (9 sources and the real licence list, not just Pexels and
Pixabay), `audio-pronunciation` and `voice-pronunciation` (the lexicon *is*
sent to the voice, in `render/voice.mjs`), `intake-recitation-identifier` and
four Quran roles (built, not wired). `quran-visual-adab-guard` stays planned:
no picture is chosen for a Quran film yet, so nothing checks one.

## 6. Next work, in order

**Updated 19 Nov 2026, second session (this order wins):**
1. **A better free narrator** (owner: Kokoro is not good enough). Benchmark CPU-runnable open voices with
   commercial licences (Chatterbox MIT, NeuTTS Air Apache-2.0, VoxCPM Apache-2.0; Kyutai TTS CC-BY) against
   Kokoro with a predicted-MOS model (UTMOS) and Whisper word error, same passage; send the owner samples.
   Never XTTS, F5, Fish/OpenAudio, Spark (non-commercial weights).
2. Free music or room tone under wordless scenes (6-12 s of dead silence today).
3. Footage motion: measure each clip's own movement before adding any (today footage gets none unless written).
4. Then the list below.

**Updated 19 Nov 2026, first session:**
1. **First real film with a real brain**, 2-3 minutes, through `/studio/` or `local/run-film.mjs`: the
   brain is the open question (Groq's free tier is probably too small per minute; a local 30B model on the
   owner's machine; or a paid key only with the owner's written OK and a cost estimate first). Fix what breaks.
2. **No dead silence:** free music or room tone under wordless scenes (licensed CC0 tracks or a generated
   bed), measured with silencedetect on a render.
3. The owner listens to the narrator samples; then a 40-minute narration test (stability over length).
4. Connect the landing page's Studio section to `/api/films`, keeping its design (owner, 16 Nov).
5. Quran films: section 4l's list (needs the friend's recording and a scholar's review).
6. Cost ledger checked against a real run; lower `BUDGET_USD` before any paid brain.

**First (owner, 13-14 Nov 2026): the Quran recitation documentary.** Q1 to Q7 are built; continue with
the list in section 4l. The list below waits until he says otherwise.

Each step ends with tests passing, the type check, the build check, a commit
and a push.

**Owner decision, 12 Nov 2026:** the live Phase 0 Gemini experiment (Tenerife,
arms A/B) is **skipped for now**. The Gemini key was rejected (HTTP 400 "API key
not valid") in this session. Nothing ran live; no A-vs-B result exists, so the
research engine's value over model knowledge stays **unmeasured**. All
Phase 0 code, gold sheet and readiness docs stay as built; the run can be
resumed any time with a valid free-tier key. Work continues on the Boss agent.

0. **Owner decisions first** (section 7): deploying, the brain machine,
   `WORKER_TOKEN`, repository privacy.
1. **First real free run.** On a machine that can download a model: run
   `local/run-film.mjs` for a 5-minute film with a 30B-class model, fix what
   breaks (likely: JSON formatting from smaller models, repair loops,
   window sizes), then 10 and 20 minutes. Exit: a 10-minute blueprint with no
   GAP from code checks, and the research corpus from the live Wikipedia API.
2. **Voice system (System B)**, the owner's "NEXT BIG TASK": upload route,
   free speech-to-text with word times (Whisper through whisper.cpp or
   faster-whisper on the owner's machine or the GitHub runner), a
   `voice-scenes` stage in place of S5 using `voice-scenes.mjs`, one-track
   render, studio switch. Exit: an uploaded voiceover becomes a film whose
   words are unchanged, checked in code.
3. **Bossism, next:** an independent critic (a second brain or model) for
   QA and the story gate; graphs for the voice and Quran systems once they are
   wired; parallel execution of the stages the graph marks parallel-safe (the
   Edit Director's chapters). Exit: a film reviewed by a model other than its
   writer, with the disagreement recorded.
3b. **Phones, next:** WebCodecs decoding so long M4A recordings are read in
   parts; a real Android device check. **Workers, next:** a render job on a
   worker end to end with a real film; uploading the finished file to private
   storage; a Durable Object queue for many users.
4. **Free narration:** an open-source TTS (Kokoro or Piper; check each voice's
   licence) as a renderer option, measured against the owner's own
   recording. Exit: a free narrated 5-minute film.
5. **Quran films:** speech recognition suited to recitation, Uthmani text and
   font, meanings from a licensed translation, picture rules the owner
   approves, render. Exit: a real recitation becomes a film with exact ayat.
6. Then: Arabic version, user accounts and private storage, the 36 planned
   roles by impact.

## 7. Decisions only the owner can make

- Merge this branch into `main` and deploy (production changes need the
  owner's approval).
- Create the `WORKER_TOKEN` secret and start a worker on the brain machine,
  if films should run on the owner's own computer from the studio.
- The computer that will run the free brain (RAM, graphics card) decides
  the model size.
- Quran imagery rules (`docs/STUDIO_STATUS.md` section 6).
- Repository privacy: renders publish films as public pre-releases while
  the repository is public (`docs/VISION.md` item 8).
- Commercial narration: a paid ElevenLabs plan, the owner's own voice, or a
  free open-source voice once wired.

## 8. Rules for the next session

- Read this file, then `docs/VISION.md` (master list) before changing
  anything; keep every master-list item in view.
- Keep the brain plug: no stage may assume Claude. A new stage that needs
  search or vision checks `canSearch(model)` / `canSee(model)`.
- Never introduce a mandatory paid API; never spend credits, sign up or
  upgrade anything; never deploy or merge to `main` without the owner.
- Verify claims by running code; mark anything unverified as unverified.
- After editing `engine/src/`, run `cd engine && npm run sync` (the studio
  page serves a copy) and the full checks.
