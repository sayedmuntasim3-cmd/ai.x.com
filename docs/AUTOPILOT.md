# AUTOPILOT: the Boss in a box (28 Nov 2026)

**Who reads this:** a coding agent with no memory of us (freebuff or any free agent), once a day, while the paid
assistant may be gone. **Goal (the owner's words, translated):** "If Claude is gone after 5-10 Dec and I have no money
to buy it, my engine must not go quiet. It must keep making world-class films, in both Voiceover → video and
Idea → video, from everything the research has learned." Free parts only: GitHub Actions, the Cloudflare Worker,
free Groq / Gemini brains, the Kokoro narrator, open archives.

Daily loop: read the health report → pick the ONE most important problem → fix it in one PR with tests → stop.
The prompt to paste is `docs/AUTOPILOT_PROMPT.txt`.

## 1. How the platform works (one page)

Two equal products. Both end in the same gate and the same render.

- **Voiceover → video.** A voice (the owner's upload, or the daily Kokoro narration) goes up →
  `.github/workflows/voice-film.yml`: speech-to-text (faster-whisper) → understand → shot plan (free brain) →
  pictures (archives first, stock after, OpenCLIP checks relevance) → critic → `render-chunked.yml` (parallel
  ffmpeg parts) → `render/release-gate.mjs` → Craft Ledger records the film.
- **Idea → video.** A topic/idea → the Worker's film run (`engine/src/film-run.mjs`, 15 model stages: research,
  script, shots, media) → render → gate. The daily film (`daily-film.yml`, 10:23 and 14:23 UTC) writes a script
  (`render/daily-script.mjs`, Wikipedia as the only fact source), narrates it with Kokoro, then runs the voiceover path.
- **Brains (all free).** Groq first (`worker/groq.mjs`: 1,000 requests a day per model, 8,000 tokens a minute),
  Gemini second (the owner's free key: only 20 requests a day per model, so never the one a film waits on),
  a local brain if one is set. Claude runs only when `BRAIN=claude` is set by hand; never automatic.
- **Memory.** The Craft Ledger (R2 `channel/craft-ledger.json`) holds what each finished film measured; the next
  film's shot plan and critic take their targets from it (`engine/src/craft-memory.mjs`, `docs/CRAFT_MEMORY.md`).

### File map

| Where | What |
|---|---|
| `engine/src/` | pure modules (browser + Node): `film-run.mjs`, `shot-plan.mjs`, `voice-visuals.mjs`, `story-critic.mjs`, `craft-memory.mjs`, `role-craft.mjs`, `reference-prior.mjs`, `reference-bar.mjs`, `health-digest.mjs`, `messages.mjs` |
| `engine/data/` | `reference-prior.json` (outside-market packaging prior, refreshed weekly by `reference-prior.yml`) |
| `worker/` | the Cloudflare Worker: `index.mjs` routes, `brain.mjs`, `groq.mjs`, `voice-api.mjs`, `health-api.mjs`, `youtube-analytics.mjs` |
| `render/` | ffmpeg renderer, `release-gate.mjs`, `daily-script.mjs`, `voice-runner.mjs` |
| `local/` | scripts the workflows run: `voice-film.mjs`, `health-digest.mjs`, `bar-check.mjs`, `craft-memory.mjs` |
| `.github/workflows/` | `daily-film`, `voice-film`, `render-chunked`, `health-digest` (daily report), `health-report` (site/archive issue), `reference-prior` |
| `public/studio/` | the studio page (`/studio/`); `public/studio/engine/` is a COPY of `engine/src/` (run `cd engine && npm run sync`) |
| `docs/` | `ROADMAP.md`, `ENGINEERING_STATE.md`, `OWNER_BRIEF.md`, `missions/ENGINEERING_DOCUMENTARY_MASTER_ROADMAP.md`, `research/` |

## 2. Reading the health report

Produced once a day by `.github/workflows/health-digest.yml` (19:41 UTC, after both daily-film slots and a film's
usual two hours). Where to read it:

1. The run's **summary page** in GitHub Actions (Actions → Health digest → newest run), and the `health-digest` artifact (`out/health-digest.json`).
2. The studio: `/studio/` → "My films" shows "Last 24 hours" and the three "Fix first" lines (needs the studio key).
3. The Worker: `GET /api/health/report` with `Authorization: Bearer <studio key>`.

What each part means:

- **Films**: counts of voiceover runs, daily-script runs and Idea films in the last 24 h (passed / failed / running).
  Zero films is itself the first problem (the quiet way this platform dies).
- **The 3 things to fix first**: ranked by rule in `engine/src/health-digest.mjs` `topFixes`: nothing made → a known
  stop cause → the gate's top block → the slowest stage → a failing archive. Take number 1.
- **Gate blocks (top)**: the `BLOCK:` lines of `render/release-gate.mjs`, counted.
- **Why films stopped**: causes recognised in the logs (table in section 3).
- **Minutes per stage**: job times. A 40-minute film should take about two hours in total.
- **Free brain**: requests seen in logs against Groq's 1,000 a day per model. Tokens are not logged; the report says so.
- **Archive failures**: log lines naming a provider next to 429/403/challenge/failed. A heuristic, not a full count.

Also: the `Zupona health report` GitHub issue (`health-report.yml`, 06:17 UTC) is open only while the site, an
archive or a film workflow is broken.

## 3. Diagnosing a stopped film

Where to look, in order: (1) the film's run in Actions (`Voiceover film <id>` or `Daily film <topic>`), the failing step's log; (2) the run's
artifact `voice-<id>` (`run/*.json`, `voice-film.log`, `out/*.json`; kept 14 days); (3) the studio film page; (4) `run/film-timing.json`
and `brain-calls.json` for stage minutes and brain use.

| Cause | How it shows in the log | Fix |
|---|---|---|
| **Groq daily limit** | `day used up`, `tokens per day`, `RPD`/`TPD` (`worker/groq.mjs` marks the model spent) | It resets at midnight UTC: re-run from the last finished stage. Never add a paid key. If it repeats daily, cut the brain calls (batch prompts, fewer retries) and measure with `brain-calls.json`. |
| **Gemini quota** | `GenerateRequestsPerDay`, `RESOURCE_EXHAUSTED` | Expected: 20 requests a day. Keep Gemini behind Groq. |
| **Library of Congress challenge** | `loc.gov` with `challenge`/`429`/`403` (`isChallenge` in `engine/src/archive-guard.mjs`) | Slow LoC down, let other archives answer first; never loop retries. |
| **Picture relevance** | `off-topic`, `not relevant`, scenes with no picture | Improve the shot's search words: named things first, real archives before stock (`engine/src/film-media.mjs`). Never loosen the relevance check or accept an off-topic fallback. |
| **Gate blocks** | `BLOCK: ...` lines | Fix what each line names in the film's own stage (black frames, repeated pictures, loudness, silence...). Never lower a threshold. |
| **Request too large** | `Request too large`, `over its 7,200-token limit` | Split the prompt (`askParts`, `engine/src/film-run.mjs`). |
| **Job timeout** | `exceeded the maximum execution time` | Find the slow stage in the minutes table; split or speed it. |

A film that never started: check `daily-film.yml` runs (GitHub may drop a schedule: that is why there are two), then the Worker's answer (409 = today's film is already under way; 5xx = read `/api/health`).

## 4. The checks (run all before every PR)

```
npm test
cd engine && npm test && npm run typecheck && npm run sync && cd ..
npm run check
```

While working, run only the test file you touched (`node --test engine/test/x.test.mjs`). After editing `engine/src/`, run `cd engine && npm run sync` and commit the synced copy.

## 5. Merge rules

- Work on a branch, one PR per problem, tests with the fix. Never force-push, reset or delete branches. On a real conflict with someone else's work, stop and leave a note in the PR.
- The owner's written permission (20 Nov 2026): "মার্জের অনুমতি আমি দিছি, লিখিত অনুমতি দিয়ে দিয়েছি". It holds only through a PR with **CI green** and the **Cloudflare preview answering 200** (open it in a browser or `curl -sI`), then verify production after the merge.
- Merge only when the pasted daily prompt says `MERGE: yes`. Without it, open the PR and stop: the owner merges.
- Never merge a PR that changes the landing page look, lowers a gate or critic threshold, or adds a paid service.

## 6. The owner's fixed decisions (copied from CLAUDE.md; never undo without him)

- 28 Nov 2026: the platform has TWO equal products: Voiceover → video and Idea → video. Never let one sit while working on the other. Target: by 2 Dec the owner uploads a voice himself and gets a world-class film automatically, for his YouTube channel (no view counts are ever promised). Nobody changes the landing page look (colours, fonts, layout, the "Idea | Voiceover" switch) without asking him first.
- 26 Nov 2026: every film follows `docs/OWNER_BRIEF.md`. Main target: English documentaries for a USA audience. The niche is FIXED: Engineering Disasters & Megaprojects (disasters, megaproject histories, hidden infrastructure, engineering mysteries). The master directive is `docs/missions/ENGINEERING_DOCUMENTARY_MASTER_ROADMAP.md`. No view counts are ever promised.
- 20 Nov 2026: written permission to merge and deploy (see section 5). Zero cost, no Claude API: free brains only.
- 19 Nov 2026: content languages are American English documentaries and Arabic Quran recitation only (Bangla/Hindi off: `ACTIVE_VERSION_IDS`). No branch deletion, force push or reset.
- 16 Nov 2026: the landing page design at `/` IS the product's face; future studio screens use it. PR #4 and PR #6 stay unmerged on purpose, never deleted.
- 19 Nov 2026 (measured): the free Gemini key allows 20 requests per day per model; no film can finish on it. Groq is the working brain.
- Hard rules: no stage may assume Claude (`canSearch(model)` / `canSee(model)`); every user-facing message goes in `engine/src/messages.mjs` (en + bn); never claim something works without running it; say what is unverified.
- The owner writes in Bangla: reply to him in short plain Bangla.

## 7. Keeping the platform world-class ("Raise the bar")

On a day with nothing broken: take the newest finished film, run `node local/bar-check.mjs --report out/<film>.report.json`
(the reference bar of `docs/research/REFERENCE_SCORECARD.md` §5, as data in `engine/src/reference-bar.mjs`). Rules the report
cannot measure read `unknown`: watch the film frame by frame, note the weakest scene, fix its cause in the engine (not by hand
in one film). Advisory only: never lower a gate to make a number pass.

### Where the research lives in the machine (checked by `engine/test/autopilot-wiring.test.mjs`)

| Finding | Read at film time by |
|---|---|
| Squad prompts (`prompts/4`) | `engine/src/role-craft.mjs` → `film-run.mjs`, `shot-plan.mjs`, `voice-visuals.mjs` |
| Outside market's titles, length, thumbnails | `engine/data/reference-prior.json` → `reference-prior.mjs` → `film-run.mjs` (S01 brief), Worker topic ranking |
| House craft numbers (shot length, moving share...) | `DOCTRINE` in `engine/src/craft-memory.mjs`, tightened by the ledger → shot plan and critic |
| The ten-rule bar (cuts, map before 1:30, promise before 0:30...) | `engine/src/reference-bar.mjs` → `local/bar-check.mjs` (advisory) |
| Real audience retention | Craft Ledger `audience` (section 8) |

**Known gaps (honest):** (a) the reference bar is advisory data: it is NOT yet in the script/shot prompts (`barBrief()` is ready;
the prompt files belong to the idea-path and picture workers) and NOT in the release gate. (b) Shot-rhythm and graphic-density
numbers are "my reading", not measured (`docs/research/REFERENCE_STANDARD.md`); they must stay unenforced until a human-watched sample exists.

**TODO, wire the practice-film scorecard.** `docs/research/FIRST_VIDEO_PLAN.md` §6 holds a 14-measure scorecard (0-2 each, pass 22 of 30).
The hook is `PRACTICE_SCORECARD` in `engine/src/reference-bar.mjs` (null today; its test `reference-bar.test.mjs` pins that, change both together).
When the scorecard lands as final: (1) put its measures there as data, (2) read them in `local/bar-check.mjs` to print the 0-30 total,
(3) add a line to the daily report. Do not invent scores: only measures a program can read are filled; the rest stay `unknown` for a human.

## 8. The learning loop (real YouTube results → the craft ledger)

- **Wired today:** `worker/youtube-analytics.mjs` reads the audience-retention curve of a published film (owner's own Google sign-in,
  read-only scope `yt-analytics.readonly`; needs the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` Worker secrets, `docs/CONNECT.md`;
  free). `POST /api/films/<id>/retention` with `{ "video": "<link or 11-character id>" }` (studio key) saves `retention.json`,
  adds lessons to `channel/lessons.json`, and files the audience numbers (at30, at60, half, end) on the film's Craft Ledger record
  (`addAudience`, `engine/src/craft-memory.mjs`). A film whose audience holds can move `review` → `pass`, which makes its measures count as a target for later films.
- **Not wired:** click-through rate and average view duration. Average view duration (`averageViewDuration`, `averageViewPercentage`) is in the
  Analytics API; **CTR is not confirmed available in the API and is UNVERIFIED**: do not build on it. Until the channel exists nothing can be tested.
  When it does: add the metrics to the report call in `retentionData` (`worker/youtube-analytics.mjs`), carry them through `audienceFromRetention`,
  add the fields to the ledger's `Audience` type with a test, and show them in the health report. Only the owner's own OAuth is needed; no paid service.
- **Daily routine after the channel exists:** for each film published in the last 7 days that has no `audience` yet, call the retention route (owner's studio key), then read the ledger lesson.

## 9. No-Claude audit (28 Nov 2026)

Searched `worker/`, `engine/src/`, `render/`, `local/`, `.github/workflows/` for anything that needs Claude or a paid key to make a film.
- **Clean:** the default brain is never Claude (`worker/brain.mjs`; test `worker/brain.test.mjs`); `local/voice-film.mjs` refuses `BRAIN=claude`; `daily-film.yml` needs no Anthropic secret; research and picture-judging stages are guarded by `canSearch`/`canSee`, and a brain that cannot see falls back to the code relevance check (`engine/src/film-media.mjs`).
- **Harmless leftovers:** `worker/brain.mjs` imports `@anthropic-ai/sdk` but never calls it; `wrangler.jsonc` sets `MODEL: claude-opus-5-5`, used only when `BRAIN=claude`.
- **Real limits (not Claude, but free-tier):** Groq's daily request/token limits and the Gemini 20 requests a day. These are the first thing that will stop films; the health report counts brain requests for exactly this reason.
- **Unverified:** a full Idea → video film on Groq alone has not been run end to end in this audit (real films were not started: the free brain's daily budget is shared).
