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

## 1. Where the code is

| Place | What it holds |
|---|---|
| `sayedmuntasim3-cmd/ai.x.com`, branch `main` | only the landing page (`page.tsx` rendered to `public/`). This is what is live. |
| branch `ccr-5d51ed58-vk6gaw` (and this branch, which continues it) | the whole AI documentary studio: `engine/`, `worker/`, `render/`, `public/studio/`, `prompts/`, `docs/`, one saved production |
| `ccr-d2a6b2aa-chfb81`, `ccr-cb190ece-ukm6vg`, `ccr-cd4452ea-fvd6po`, `claude/studio-first-screen-y4tp15` | earlier stages of the same work; all merged into `ccr-5d51ed58-vk6gaw` |
| `ccr-48feac19-2ao1hq` | a landing-page redesign, not merged anywhere |
| `sajid1234sajid/zupona` and the ~70 branches in `branches.txt` | **not reachable from these sessions.** `README.txt` describes folders and a git bundle that are not in this repository. |

Nothing of the studio is deployed. Merging into `main` and deploying are the
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
