# Next tasks (27 Nov 2026), in order

Written by the Boss for any engineer (human or agent, e.g. "freebuff") and for the next Boss.
Rules: read `CLAUDE.md` first. One task = one branch + one PR, CI green, Cloudflare preview checked,
then merge (owner's written permission, CLAUDE.md). Never force-push, reset or delete branches.
Zero money: free tiers only, no Claude API inside the product. Niche is fixed: Engineering Disasters &
Megaprojects, English (USA). Never promise views. Say what is unverified.

Goal of this list: the first film good enough for the owner's channel (target: the owner opens the
channel only when one film passes T1-T4 below; 1 Dec 2026 if ready, later if not).

## State on 27 Nov (facts, with proof)
- Merged: W7 topic ranking (PR #60, `docs/research/TOPIC_RANKING.md`; top: Katrina levees, Camp
  Century, Hanford), auto picker (PR #66), name respelling (PR #67), daily-film schedule (PR #61-63).
- Open: PR #68 (archive keys reach the film pipeline; Europeana key in header; NARA never cached).
  Its `platform` CI job hung twice at 15 min; every test file passes locally (longest 62 s). Re-run queued.
- Live keys (Cloudflare Worker secrets): EUROPEANA_API_KEY (verified: `/api/media/search?sources=europeana`
  returns results), SMITHSONIAN_API_KEY (enabled), DVIDS_API_KEY (set, NOT yet used by code).
  NARA_API_KEY requested by email to Catalog_API@nara.gov (waiting). GitHub repo secrets: EUROPEANA_API_KEY,
  DVIDS_API_KEY set by the owner.
- No finished film yet. Daily film 41b3b491 (Tacoma Narrows, 41.7 min voice) stopped at the shot-plan gate
  "design-gap" (`engine/src/shot-plan.mjs:625`): voice-film.yml has no brain (Groq key lives only in the Worker).
- Auto-picked 3-min slice (PR #66, `docs/missions/proof/auto-film/contact-sheet-auto.jpg`): 7 of 37 shots
  wrong (target <= 3). Groq vision daily quota (200k tokens) ran out in debugging.

## T1. Daily film runs end to end (highest priority)
Owner of the area: `.github/workflows/voice-film.yml`, `daily-film.yml`, `worker/voice-api.mjs`.
- Give voice-film a free brain through the Worker route `/api/voice/:id/brain` (Groq). Never Claude.
- Make the design-gap gate pass with REAL designed moments (maps, diagrams, title cards built from facts),
  never by lowering the gate.
- Retry film 41b3b491; get render + critic + craftIndex + contact sheet.
- Measure Groq free usage for one 40-min film (tokens, requests). If the free day cannot finish 40 min,
  switch the daily film to 12-15 min and write the measured numbers in the PR.
Done when: a contact sheet exists for a full daily film, and the numbers are in the PR.

## T2. Picture quality: <= 3 wrong shots of 37
Area: `local/voice-film.mjs` picker, `engine/src/voice-visuals.mjs`, `render/asset-rank/`.
- Re-run the 3-min slice (993f09ea 0:00-3:00) once the Groq vision quota has reset; one debug run per day,
  so the final run keeps the quota.
- Verify the stranger-face fix (`strangerAsSubject`) and name respelling (PR #67) on that run.
- Keep the A-E class per shot. Fail the run if more than 3 of 37 shots are wrong.
Done when: a new contact sheet with <= 3 wrong shots is committed under `docs/missions/proof/auto-film/`.

## T3. DVIDS archive (after PR #68 merges)
Area: `engine/src/open-archives-lib.mjs` (add a `dvids` source like `nara`), tests.
- Search: `GET https://api.dvidshub.net/search?q=...&type[]=image&type[]=video&max_results=50&api_key=KEY`.
- The search returns only `thumbnail`; get full-resolution files from the Asset API
  (`https://api.dvidshub.net/docs/asset_api`, read it first). Credit = `credit` field; page = `url`.
- Licence: "public domain unless other copyright status is indicated" (docs/copyright): skip items marked otherwise.
- The key may be tied to an origin; test from the Worker first. If 403, add the Worker domain in the
  DVIDS app "Domains" tab (tell the owner exactly what to type).
- Also: drop iNaturalist from engineering film searches (off-niche noise).
Done when: production `/api/media/search?q=levee&sources=dvids` returns full-size public-domain results.

## T4. Film quality gate before the owner sees anything
- A film reaches the owner only if: contact sheet <= 3 wrong shots per 37, critic passes, loudness in range,
  no name/spelling errors on cards, every picture has licence + source page.
- The Boss looks at the contact sheet before sending the film, with an honest verdict.

## T5. Daily health report (so the system runs without a paid assistant)
- One scheduled GitHub Action (free) that checks every key and archive (`/api/media/sources`), the Groq
  quota left, and yesterday's daily-film result, and opens or updates ONE GitHub issue in plain words
  (English + Bangla line) when something is broken.
Done when: the issue appears on a test failure and closes itself when fixed.

## T6. Landing page (keep the current design: owner's decision 16 Nov; improve, do not replace)
Area: `public/index.html`, `public/app.js` (and `page.tsx` if used). Seen at 390 px on 27 Nov:
- The page still speaks of nature: default "Idea system" = Nature, preview "Where the Glaciers Sing",
  search examples "Snow leopard / Rainforest canopy / Wildebeest". Change all to the engineering niche
  (e.g. "Why the Tacoma Narrows Bridge fell", examples "Hoover Dam", "Katrina levees", "Panama Canal").
- Duration: replace the "- 0h 08m +" stepper with preset chips (3, 8, 15, 30, 40 min) plus "custom".
- One clear call to action at the top; a short "How it works" in 3 steps (idea -> research + script ->
  film with sources).
- "Made with Zupona": show real finished films only (none yet; leave the section hidden until T1/T2 pass).
- Ideas may be taken from other sites (e.g. a cinematic dark hero, a gallery of real outputs); do not copy
  another company's text, images or layout.
- The archive list says 27 archives and "Coming soon: NYPL, US National Archives": update when NARA/DVIDS go live.

## T7. Own-voice and Quran items (lower priority)
- Light studio is Wikimedia stills only: make it video-first or retire it.
- Own-voice film (M5) blocked: no voice take from the owner.
- Quran Ad-Duha: reviewer tap pending.

## YouTube facts for planning (owner asked; check YouTube's own help page before relying on them)
- Partner Program (ads): 1,000 subscribers + 4,000 public watch hours in the last 12 months
  (or 10M Shorts views in 90 days). There is no February deadline in YouTube's rules.
- Long films (15-40 min) earn watch hours faster than short ones, if people keep watching.
- Mass-produced, repetitive videos can be refused monetization: the owner watches every film before upload.
