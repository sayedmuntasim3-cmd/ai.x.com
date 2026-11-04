# Connecting the studio (owner steps)

The film API is built and tested, but it only runs once Cloudflare and the Claude API are connected. Until then, `/studio/` still works in the browser (sections 1 and 2) and section 3 shows "not connected yet".

## What it does once connected

`/studio/` → section 3 → topic + minutes → **Start the film**. The engine then runs, with no human step:

S0–S1 titles and plan → web research (sources only) → S2 claim ledger → S3 chapter plan (checked to tile the film) → S4 bibles → S5 chapter by chapter (each checked in code and repaired until it passes) → QA with fixes (a fix that breaks a check is undone) → S6 report → S7 publishing pack.

Every file appears under the run in the studio as it is written (`s5-C1.md`, `qa.json`, `s6.md`, ...). A run that stops can be resumed; a finished stage is never paid for twice.

## Cost

The studio shows an estimate before you start (Claude Opus 5.5): about **$4–8 for a 10-minute film** and **$6–13 for 45 minutes**. The real spend is counted from every API call and shown live. `BUDGET_USD` (default **60**) stops a run before the next stage once it is reached.

## Steps (one time, on your computer, in this repository)

1. `npm install`
2. `npx wrangler login`
3. `npx wrangler r2 bucket create zupona-films`
4. `npx wrangler secret put ANTHROPIC_API_KEY` (paste your key from console.anthropic.com)
5. `npx wrangler secret put STUDIO_TOKEN` (any long random password: only someone with it can start a paid run)
6. `npm test` and `npm run check` (both must pass), then `npm run deploy`
7. Open `https://<your site>/studio/`, section 3, enter the studio token, and start a short test film first (2–10 minutes).

Optional: change `MODEL` or `BUDGET_USD` in `wrangler.jsonc` (`vars`). `GET /api/health` shows what is connected, without showing any secret.

## Not built yet (next steps)

- Turning the blueprint into video: stock search and download through the Pexels and Pixabay APIs (`engine/src/documentary-media-fetch.mjs` is ready), voice, edit and render.
- Arabic and Bangla runs (English first, by the owner's decision).
- A login system for clients (today one studio token protects the paid API).
