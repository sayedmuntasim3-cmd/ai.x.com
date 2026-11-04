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

## Media step (optional, free)

After QA the run searches free stock footage for every S5 stock shot, with the scene's own queries, and writes `media-C1.json` ... per chapter: one pick per shot with its licence record (licence, source page, creator), up to three alternates, and the search trace. Only Pexels License and Pixabay Content License items are kept, and no clip is used twice within 10 minutes of film time. Shots with no free clip are listed as GAPs.

1. Pexels: create a free key at https://www.pexels.com/api/ and run `npx wrangler secret put PEXELS_API_KEY` (limit 200 searches per hour).
2. Pixabay: log in, copy your key from https://pixabay.com/api/docs/ and run `npx wrangler secret put PIXABAY_API_KEY` (limit 100 searches per minute).

One key is enough; both give more choice. Without either the step is skipped (`run.json` says so) and runs when the film is resumed with a key. `GET /api/health` shows `pexels` and `pixabay` as true once set.

## Not built yet (next steps)

- Turning the blueprint into video: downloading the picked clips, voice, edit and render (the stock search is built: the media step above).
- Arabic and Bangla runs (English first, by the owner's decision).
- A login system for clients (today one studio token protects the paid API).
