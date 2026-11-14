# Zupona AI Studio: working rules (read first, every session)

Owner writes in Bangla: reply in Bangla, short and plain. Work continues on the
branch you are on; never merge to `main`, deploy, spend money or add a paid API.

## Save tokens (the owner pays for every token)
- Do NOT explore the repo or re-audit it. The state is in two files; read only
  the section you need: `docs/ENGINEERING_STATE.md` (state, next work in order),
  `docs/ARCHITECTURE.md` (devices, jobs, Bossism, failure handling).
- Never open whole: `prompts/*.txt` (73 KB+), `productions/` (15k lines),
  `engine/data/`, `render/assets/`, `public/studio/engine/` (a copy of
  `engine/src/`), `package-lock.json`. Use `grep -n` and `sed -n 'a,bp'` on the
  lines you need; open a file whole only when you will edit most of it.
- Do not spawn subagents unless the owner asks. No web searches unless needed.
- While working, run only the test file you touched
  (`node --test engine/test/x.test.mjs`); run the full checks once before each commit.
- Batch small edits; do not re-read a file you just edited.
- One milestone = one commit + push. Summaries short; no long reports.

## Map
- `engine/src/` pure modules (browser + Node): `film-run.mjs` (the film run,
  15 model stages), `bossism.mjs` + `supervise.mjs` (graph, preflight, gates,
  revision, release), `jobs.mjs` + `job-runner.mjs` (durable queue),
  `messages.mjs` (every message in en + bn), `agent-roster.mjs` (151 roles, ROLE_STATUS).
- `worker/` Cloudflare Worker: `index.mjs` routes, `brain.mjs` (local|claude|gemini),
  `local-brain.mjs`, `jobs-api.mjs` (queue over HTTP, R2 compare-and-swap).
- `local/` owner's machines: `run-film.mjs`, `jobs.mjs` (add/work/status), `folder-store.mjs`.
- `render/` ffmpeg renderer, `release-gate.mjs`. `public/studio/` the studio page.

## Checks before a commit
`npm test` · `cd engine && npm run typecheck` · `npm run check` ·
after editing `engine/src/`: `cd engine && npm run sync` (the studio serves a copy).

## Rules that must hold
- No stage may assume Claude: use `canSearch(model)` / `canSee(model)`.
- Every new user-facing message goes in `engine/src/messages.mjs` (en + bn).
- Never claim something works without running it; say what is unverified.
