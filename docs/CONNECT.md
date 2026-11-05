# Connecting the studio (owner steps)

The film API is built and tested, but it only runs once Cloudflare and the Claude API are connected. Until then, `/studio/` still works in the browser (sections 1 and 2) and section 3 shows "not connected yet".

## What it does once connected

`/studio/` → section 3 → topic + minutes → **Start the film**. The engine then runs, with no human step:

S0–S1 titles and plan → web research (sources only) → S2 claim ledger → S3 chapter plan (checked to tile the film) → S4 bibles → S5 chapter by chapter (each checked in code and repaired until it passes) → QA with fixes (a fix that breaks a check is undone) → S6 report → S7 publishing pack.

Every file appears under the run in the studio as it is written (`s5-C1.md`, `qa.json`, `s6.md`, ...). A run that stops can be resumed; a finished stage is never paid for twice.

## Cost

The studio shows an estimate before you start (Claude Opus 5.5): about **$4–9 for a 10-minute film** and **$7–15 for 45 minutes** (including the footage desk that checks clips by eye). The real spend is counted from every API call and shown live. `BUDGET_USD` (default **60**) stops a run before the next stage once it is reached.

## Steps (one time, on your computer, in this repository)

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler r2 bucket create zupona-films`
4. `npx wrangler secret put ANTHROPIC_API_KEY` (paste your key from console.anthropic.com)
5. `npx wrangler secret put STUDIO_TOKEN` (any long random password: only someone with it can start a paid run)
6. `npm test` and `npm run check` (both must pass), then `npm run deploy`
7. Open `https://<your site>/studio/`, section 3, enter the studio token, and start a short test film first (2–10 minutes).

Optional: change `MODEL` or `BUDGET_USD` in `wrangler.jsonc` (`vars`). `GET /api/health` shows what is connected, without showing any secret.

Optional: to see every Claude call (time, tokens, errors) in Cloudflare's dashboard, create an AI Gateway and set the var `ANTHROPIC_BASE_URL` to `https://gateway.ai.cloudflare.com/v1/<account id>/<gateway name>/anthropic`. The API key still goes to Anthropic.

**If a film stops.** A wrong or revoked API key, or a request the API refuses, stops the film at once with the reason on the film's card in the studio (it is no longer retried for minutes). Outages and overload are retried automatically, and while that happens the card shows the last error. Fix the cause, then press **Resume where it stopped** on the card (or `POST /api/films/<id>/resume`): finished stages are kept and not paid for again. A film stopped by its budget resumes the same way, optionally with a higher budget for that film only.

## Media step (optional, free)

After QA the run searches free stock footage for every S5 stock shot, with the scene's own queries, and writes `media-C1.json` ... per chapter: one pick per shot with its licence record (licence, source page, creator), up to three alternates, and the search trace. Only Pexels License and Pixabay Content License items are kept, and no clip is used twice within 10 minutes of film time. Shots with no free clip are listed as GAPs.

1. Pexels: create a free key at https://www.pexels.com/api/ and run `npx wrangler secret put PEXELS_API_KEY` (limit 200 searches per hour).
2. Pixabay: log in, copy your key from https://pixabay.com/api/docs/ and run `npx wrangler secret put PIXABAY_API_KEY` (limit 100 searches per minute).

One key is enough; both give more choice. Without either the step is skipped (`run.json` says so) and runs when the film is resumed with a key. `GET /api/health` shows `pexels` and `pixabay` as true once set.

## Topic radar (optional, free)

Before writing, the studio can show which topics in a niche have proven demand: long videos (over 4 minutes) from the last 12 months that earned many times their own channel's average views. The score weighs that ratio, dampens tiny channels whose average is noise, and favours demand that is still fresh. "Film this topic" fills the topic and tells the engine to make its own, better film on it: a new title, a new angle and its own script, never a copy of that video.

1. In Google Cloud Console, create a project, enable **YouTube Data API v3** and create an API key (APIs & Services > Credentials). Restrict the key to that API.
2. `npx wrangler secret put YOUTUBE_API_KEY` (paste the key).

The free quota is 10,000 units a day; one radar search costs about 102, so about 90 searches a day. The same search is answered from R2 for a day without spending quota. `GET /api/health` shows `youtube: true` once set. The search is protected by the studio token.

## Render the video (from the phone, free)

When a film run is done, GitHub renders the MP4 on its own machines. The free plan includes 2,000 minutes a month for a private repository, and a 45-minute film takes roughly 30–90 minutes.

1. One time only: in GitHub, open Settings > Secrets and variables > Actions and add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` (the voice to narrate with). Without them, the film renders without narration. Optionally add `FREESOUND_API_KEY` (free at freesound.org/apiv2/apply): the sound effects are then fetched automatically, CC0 only, with a licence record.
2. Optional **your own voice** (recommended: a real human voice is the strongest sign of an authentic channel): open the film's narration script at `/api/films/<id>/script` (also linked from the film page), record each line on your phone as its own file named after its scene (`SC0001.m4a` …), and commit them as `voice/<film id>/SC0001.m4a` … They are used exactly as recorded; ElevenLabs voices only the scenes you leave out.
3. Music is composed automatically per cue with ElevenLabs Music, using the same `ELEVENLABS_API_KEY` (a paid plan allows commercial use). To use your own track for a cue instead, commit it as `music/<film id>/M01.mp3` … and it wins. To switch the composer off, add the repository variable `MUSIC_AUTO` = `off`.
4. **AI scenes for invented stories** (owner's decision, 4 Nov 2026): create a key at fal.ai and add the secret `FAL_KEY`. For each invented story (the "dramatized story" format, with the studio's AI box ticked), the render then makes one reference portrait per character and the character's scenes from it, so the same person appears in every scene. A character marked as a real person is never made. The repository variable `AI_BUDGET_USD` caps the spend per film (default 15). The variables `AI_IMAGE_MODEL`, `AI_EDIT_MODEL` and `AI_VIDEO_MODEL` switch models without code. The release notes remind you to set "Altered or synthetic content" to Yes in YouTube Studio; nothing is written on the video.
5. GitHub shows the **Run workflow** button only for workflows on the default branch. So the work on `ccr-cb190ece-ukm6vg` has to be merged into `main` once, by you (a pull request you open and merge).
6. Open the GitHub app or website and go to Actions > **Render a film** > Run workflow. Enter the film ID (the long ID in the film page's address), the site address and the picture size.
7. When it finishes, open the repository's **Releases** (private, like the repository) and download the release `film-<first 8 characters of the id>-<run number>`. It holds `<id>.mp4`, `<id>.srt` (captions for the YouTube upload), `<id>.TH-A.jpg` / `TH-B` / `TH-C` (three thumbnails for YouTube's Test & Compare), `<id>.SH-01.mp4` … (vertical Shorts with hook and burned-in captions), `<id>.FB-01.mp4` (the Facebook cut) and `<id>.report.json` (every clip with its licence page, and every warning).

**Automatic render (optional):** to have every finished film start this render by itself, and to enable the studio's "Render the video" button:

1. In GitHub, create a fine-grained token (Settings > Developer settings > Fine-grained tokens) for this repository only, with **Actions: Read and write**.
2. `npx wrangler secret put GITHUB_TOKEN` (paste the token).
3. In `wrangler.jsonc` under `vars`, add `"GITHUB_REPO": "sayedmuntasim3-cmd/ai.x.com"` and `"SITE_URL": "https://<your site>"`, then deploy.

`/api/health` then shows `github: true`. Each film's `render.json` records whether its render started.

The same render also runs on any computer with Node 22 and ffmpeg: see `render/README.md`.

## Not built yet (next steps)

- Designed motion graphics (maps, counters, timelines). Graphics shots are text cards today.
- Arabic and Bangla runs (English first, by the owner's decision).
- A login system for clients (today one studio token protects the paid API).
