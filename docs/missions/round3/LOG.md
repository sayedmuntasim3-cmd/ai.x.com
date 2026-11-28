
## King's 39: Gemini watches winning films (28 Nov 2026)
- PRs #130, #132, #133, #136 merged, CI green; production `/`, `/studio/`, `/api/health` = 200. Route `POST/GET /api/youtube-watch` is live (models `gemini-3.8-flash`, `gemini-3.5-flash-lite`; `gemini-2.5-flash` is retired).
- Gemini watched **12 films** today (4 answers failed the code check and were not stored; one 524, one 503; no 429). Ids and table: `docs/research/YOUTUBE_WATCH_MEASURED.md`.
- Medians [measured, model estimates]: length 28.7 min; 6.7 s per shot (4.4-7.9); first number 13 s; first stake 33 s; maps/diagrams/animation 49% (34-58%); chapter-turn gap 284 s; reveal gap 411 s; first/last reveal at 29%/72% of length.
- wpm NOT trustworthy: 11 of 12 films said 140-147 (model default). It stays an estimate; ranges narrower than 10% are skipped in code.
- Daily job `.github/workflows/youtube-watch.yml` (09:17 UTC, OIDC, no secret) is merged but has NOT run yet. Today's Gemini stop marker is set, so the first real run is tomorrow.
- Not verified: the job's direct push to `main` (fails if `main` is protected); the 20-film switch of PRACTICE_TARGETS (now 12 of 20) end to end; the off-niche filter is title keywords only.
