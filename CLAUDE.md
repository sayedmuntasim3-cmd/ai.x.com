# Zupona AI Studio: working rules (read first, every session)

Owner writes in Bangla: reply in Bangla, short and plain. Work continues on the
branch you are on; never merge to `main`, deploy, spend money or add a paid API.

## Owner's decisions (newest first; never undo without him)
- 19 Nov 2026: PR #5 is production. Content languages: American English documentaries and Arabic Quran
  recitation only (Bangla/Hindi off: `ACTIVE_VERSION_IDS`). No merge, deploy, branch deletion, force push
  or reset without his written OK; on any conflict, ask him first.
- 16 Nov 2026: the landing page design at `/` IS the product's face; future studio screens use it.
  Unmerged on purpose, never deleted: PR #4 and PR #6 (each sets a different Worker entry).

## Start of every session (cheap)
1. `git fetch origin -q && git log --oneline -5 origin/main`; read `docs/ENGINEERING_STATE.md` section 0 and 6 only.
2. Before building: `git grep -n -i "<feature word>" origin/main -- worker engine/src render public/studio`.
   If it exists, extend it; never build a second copy (a session built a second script Worker on 16-17 Nov).
3. Quote file and line for claims, or say "my opinion". Never assume a free tier works (Gemini's does not on his account).

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

## Owner's decision (16 Nov 2026): the landing page design IS the product
- The site's face is the landing page at `/` (PR #3: page.tsx, public/index.html, public/app.js).
  Every future studio screen must use this design. Do not replace it with another look.
- Since PR #7 (19 Nov) its brief sheet starts real films through `/api/films` (studio key asked once,
  progress followed). `/studio/` stays the full engine UI. Two sessions work in parallel (the landing
  work came from branch `ccr-00e313f2-4u4e00`): fetch `main` first and extend, never rebuild.
- Next work: one short real test film (3 minutes) and fix what breaks.
- Live state on 16 Nov: Worker `ai-x-com` on the owner's Cloudflare account; secrets set:
  GEMINI_API_KEY, PIXABAY_API_KEY, STUDIO_TOKEN (GROQ_API_KEY set but unused by the code).
  YOUTUBE_API_KEY not seen by the Worker yet (name to re-check). No film has run yet.
- Not merged on purpose: PR #4 and branch ccr-3f6f211f-agtnzh (each sets a different Worker entry
  in wrangler.jsonc). Nothing on them is deleted.
