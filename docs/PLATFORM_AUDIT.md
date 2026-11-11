# Zupona: repository audit and documentary-platform strategy

Audit date: 11 November 2026. Scope: every branch of `sayedmuntasim3-cmd/ai.x.com`.
Status: **proposal, awaiting the owner's approval.** No application code was changed for this audit.

---

## 1. Executive summary

1. **`main` is a single static landing page**, not an application. It is 127 lines of
   React (`page.tsx`) rendered to `public/index.html` and served by Cloudflare Workers
   static assets. It has no accounts, catalog, video, database or API.
2. **It markets the opposite of the new vision.** The title is "Zupona AI — Turn Ideas
   Into Videos" and the copy says "a new creative space for cinematic AI video".
3. **About 52,000 lines of real work sit on unmerged branches**, and all of it is an
   **AI documentary *production* pipeline**: topic in, Claude/Gemini script, stock
   footage, ffmpeg render, YouTube out. It is well tested (189 passing tests) but it
   has never run against real provider APIs, and it is built for one owner with one
   shared password token.
4. **Measured against the new vision, almost every core feature is missing**: no catalog, no
   player, no HLS/DASH, no user accounts, no database, no CMS, no watch progress, no
   search, no payments. The Zupona documentary platform is effectively a fresh build.
5. **A few parts are worth reusing**: the Cloudflare deployment and R2 setup, the
   licence/rights-evidence discipline, EBU R128 loudness measurement (useful as ingest QC),
   the Worker's security habits, the test and CI culture, and the design-token system on
   the landing-redesign branch.
6. **Recommendation:** build the platform as a new Next.js + Postgres application on
   Cloudflare, in phases, with a managed video service for adaptive streaming. Keep
   the AI-studio branches as an archive (never delete them, never merge them into the
   platform) until the owner decides their future (decision D1 below).

---

## 2. What is in the repository

### 2.1 `main` (15 files, deployed)

| Path | What it is | State |
|---|---|---|
| `page.tsx` | Next.js-style page component: header, hero, three "creative process" cards, CTA, footer | Works; AI-video positioning |
| `public/index.html`, `public/styles.css` | Static render of `page.tsx` + compiled Tailwind | Generated; committed |
| `tools/` | `render.tsx` (React SSR to HTML), Tailwind 3.4 config, `package.json` | Works; rebuild reproduces `public/` byte-for-byte (verified) |
| `wrangler.jsonc` | Worker `ai-x-com`, static assets from `./public` | Works (merged PR #1) |
| `README.md` | One line: `# ai.x.com` | Empty |
| `README.txt` | Describes folders `ai-platform-foundation/`, `latest-task-06-durable-project-storage/` and a `zupona-ai-all-branches.bundle` | **Wrong: none of these were ever committed** (checked across all history) |
| `branches.txt` | ~70 branch names from a *different* repository (`zupona`), not this one | Reference only; those branches are not reachable from this session |

### 2.2 Unmerged branches (fetched and inspected for this audit)

| Branch | Date | Contents | Relationship |
|---|---|---|---|
| `claude/studio-first-screen-y4tp15` | 3 Nov | Engine modules, `/studio/` first screen, Ramesh Babu production, master prompts | Contained in `ccr-cd4452ea…` |
| `ccr-cd4452ea-fvd6po` | 5 Nov | Full studio stack: Worker API + Workflow + R2, renderer, voice, music, maps, YouTube analytics | Contained in `ccr-d2a6b2aa…` |
| **`ccr-d2a6b2aa-chfb81`** | 6 Nov | **Most complete superset** (223 files changed vs `main`, +52k lines): adds Quran-recitation planner and the owner's "master list" | Latest AI-studio state |
| `ccr-48feac19-2ao1hq` | 5 Nov | Independent landing redesign ("Type an idea. Get a finished video."), `BRAND.md` design tokens (Bangla) | **Diverges** from the studio branch, which has its *own* new landing page; two competing landing pages exist |

### 2.3 What the AI-studio branch contains (`ccr-d2a6b2aa-chfb81`)

| Area | Size | What it does |
|---|---|---|
| `engine/src/` (29 modules) | ~8k lines | Pure JS planning: 25 "viral documentary" formats, 151-role agent roster, script/scene linting, timeline/edit list, licence-checked stock media (Pexels, Pixabay, Wikimedia, NASA, Smithsonian…), originality guard, retention heuristics, EBU R128 loudness, Quran recognition |
| `worker/` | ~0.8k lines | Cloudflare Worker: film API, durable Workflow running stages S0–S7 via Claude (or Gemini), YouTube Data/Analytics, GitHub render dispatch |
| `render/` | ~2.4k lines | ffmpeg renderer (Node), ElevenLabs narration/music, Freesound SFX, fal.ai AI scenes, maps, thumbnails |
| `public/studio/` | ~1.5k lines + a 29-file copy of `engine/src` | Owner-only studio UI (English/Bangla) |
| `.github/workflows/` | 2 workflows | CI (tests, typecheck, Cloudflare dry-run) and "Render a film" (MP4 published as a GitHub release) |
| `productions/`, `prompts/`, `docs/` | ~18k lines | One film's research and script (Ramesh Babu), prompt manuals, handoff docs |

Its own `ROLE_STATUS` says, of 151 roles: **61 done in code, 47 done by a model stage, 43 not built.**
Its own docs say real API runs "still wait for the owner's keys", so the end-to-end pipeline
has only run against fakes.

---

## 3. Verified state (commands run for this audit)

| Check | Result |
|---|---|
| `main`: `cd tools && npm ci && npm run build` | Builds; output identical to committed `public/` |
| `main`: `npm audit` in `tools/` | **1 high (postcss ≤ 8.5.22), 1 moderate (esbuild ≤ 0.24.2)**: dev/build-time only, fix available |
| Studio branch: `cd engine && npm test` | 141/141 pass |
| Studio branch: root `npm test` (worker + renderer, real ffmpeg) | 48/48 pass |
| Studio branch: `wrangler deploy --dry-run` | Passes (bindings: R2 `FILMS`, Workflow `FILM_RUN`, assets) |
| Studio branch: `npm audit` | 0 vulnerabilities |
| Secret scan of **all history on all branches** (Anthropic, Google, GitHub, Slack, AWS, private keys, fal) | **No credentials committed**; no `.env`/`.dev.vars` files ever committed |
| Client XSS sinks (`innerHTML`, `eval`, `document.write`) in studio UI | None found |

---

## 4. Evaluation by area

### 4.1 Architecture

- **`main`**: a static site with no runtime. That is fine for a landing page and
  can't grow into a streaming product: no server rendering per title, no data
  layer, no auth.
- **Studio branch**: a clean, well-separated design for its purpose (pure engine,
  injected providers, durable Workflow, R2 as a file store, resumable stages, cost
  budget). Weaknesses that matter for any product built on it:
  - **R2 used as a database.** JSON files per film; listing scans prefixes. No
    relational integrity, no queries, no transactions. Fine for one owner, not for
    millions of users, watch events, subscriptions.
  - **Duplicated code**: `engine/src/` is copied into `public/studio/engine/` by a sync
    script (a test enforces the copy). A bundler would remove this.
  - **GitHub Actions as a render farm and GitHub Releases as video hosting.** Not a CDN,
    2 GB per-file cap, public when the repo is public, and not what GitHub's service is
    meant for.
  - Plain JS + JSDoc types (strict typecheck exists, which is good), no TypeScript build.

### 4.2 UI/UX

`main` landing page:
- Visually polished, dark and cinematic, mobile-responsive. But it has **no real
  actions**: both buttons scroll to an on-page section; the only outbound link is
  zupona.com.
- **Contrast**: small text at `text-white/40` (≈3.7:1) and `text-white/45` (≈4.4:1) on
  `#080b0a` falls below WCAG AA (4.5:1) for small text.
- Decorative `✳` glyphs are read aloud by screen readers (only the arrows are
  `aria-hidden`). No skip link.
- Footer year is fixed at build time (`© 2026`) and goes stale unless rebuilt.
- No favicon, no `og:image`, no Twitter card, no `robots.txt`/`sitemap.xml`, no custom 404.

Landing redesign branch (`ccr-48feac19…`): a much richer page with a proper token
system (Night/Ink/Surface palette, "Volt" accent, Geist + Instrument Serif). The
token approach can be reused; the content (AI prompt box, "Start creating") cannot.

Studio UI: functional owner tool, bilingual, honest status messages. Not a viewer
experience.

**For the documentary platform, none of the viewer UX exists yet**: homepage rails,
details pages, player, browse, search, profiles.

### 4.3 Video infrastructure

| Requirement | Exists today? |
|---|---|
| Adaptive streaming (HLS/DASH) | **No.** The renderer outputs one H.264 MP4 (CRF 21, AAC 192k, `+faststart`) |
| Video storage + CDN delivery | **No.** GitHub Releases (public, 2 GB cap) |
| Upload/ingest of finished documentaries | **No.** Only the pipeline's own renders |
| Subtitles | Partial: SRT generated from the script; players need WebVTT |
| Chapters | No viewer-facing chapters (the pipeline has internal chapters C1–C6) |
| Quality selection, speed, PiP, resume | **No player at all** |
| Signed/expiring playback, geo-restriction, DRM | **No** |
| Loudness QC | **Yes**: `engine/src/loudness.mjs` (BS.1770-4 / EBU R128, tested against EBU Tech 3341). Reusable at ingest |

### 4.4 Database and authentication

- **Database: none.** R2 JSON files only.
- **Authentication: one shared bearer token** (`STUDIO_TOKEN`), entered by hand and
  kept in `localStorage`. There are no users, sessions, roles, password resets, OAuth or 2FA.
- Implemented well within that scope: constant-time token comparison, HMAC-signed
  OAuth `state` with expiry, strict ID/filename regexes.

### 4.5 Security findings (studio branch, if it were deployed)

| # | Finding | Severity for a public platform |
|---|---|---|
| S1 | **Read routes need no auth** (`GET /api/films/:id`, `/files/:name`, `/page`, `/script`). Access relies on the UUID staying secret, but film IDs appear in GitHub Actions run inputs and release titles **on a public repository** | High |
| S2 | **Rendered films are published as public GitHub pre-releases** while the repo is public (the branch's own docs say so) | High (content leakage) |
| S3 | Single shared token, no rate limiting, no lockout, no audit log | High for multi-user; acceptable for a solo tool |
| S4 | The "source desk" fetches arbitrary URLs cited by model output (`redirect: "follow"`), and owner picture links are downloaded by the renderer. On Workers/Actions the SSRF impact is limited, but there is no host allowlist or private-range check | Medium |
| S5 | YouTube OAuth refresh token stored as plain JSON in R2 | Medium |
| S6 | Owner-supplied picture links are "the owner's responsibility" for rights. A platform needs recorded rights attestations | Medium (legal) |
| S7 | `main` build-time deps: postcss (high) and esbuild (moderate) advisories | Low (build-time only) |

Positive: no committed secrets anywhere; secrets documented as Wrangler secrets;
strict CSP + `nosniff` + `no-referrer` on generated HTML pages; HTML escaping helper.

### 4.6 Performance and SEO

- `main`: tiny and fast (~7.6 KB HTML + ~17 KB CSS, no JS). SEO basics only: title,
  description, canonical. **The canonical points to `ai.zupona.com`, which the
  studio branch's own handoff says was taken down on 21 Oct 2026.**
- No structured data, sitemaps, OG images, `hreflang`, or per-title pages (the main
  SEO asset of a documentary catalog).

---

## 5. Salvage map: what to keep, reuse, or archive

| Item | Decision | Why |
|---|---|---|
| Cloudflare account, Worker deploy, R2 | **Reuse** | Already set up; fits the target architecture |
| `engine/src/loudness.mjs`, `wav.mjs` | **Reuse** in ingest QC | Tested, standards-based, zero dependencies |
| Licence/rights checks in `film-media.mjs` (refuse NC/ND/SA, record credits) | **Reuse the approach** for CMS rights records | Same discipline the platform needs |
| Worker security patterns, CSP, escaping, test + CI setup | **Reuse** | Good habits |
| `BRAND.md` token system (landing redesign) | **Reuse the structure**, re-skin for documentaries | Proper single-source tokens |
| Bangla/English UI strings approach | **Reuse** for i18n | Owner's audiences |
| AI pipeline (script writing, agent roster, viral formats, AI scenes, topic radar, YouTube analytics, Quran recognition) | **Archive** (keep branches, tag them, do not merge) pending D1 | Out of scope: "NOT an AI video generation website" |
| `productions/ramesh-babu` | Archive with the studio | Not platform code |
| Current `main` landing page | Keep live until the new homepage replaces it | "Do not delete existing working functionality" |

---

## 6. Target architecture (recommendation)

```
 Viewers (mobile web first, desktop, later TV/native)
        │
 Cloudflare edge: CDN, WAF, rate limiting, Turnstile (bot protection)
        │
 Next.js (App Router, TypeScript, RSC) on Cloudflare Workers via the OpenNext adapter
   ├─ viewer site: home, browse, title/series/episode pages, search, profiles
   ├─ /studio-admin: CMS for editors, publishers, moderators (role-based)
   └─ route handlers: playback tokens, progress sync, webhooks
        │
   ┌────┴──────────────┬────────────────────────┬──────────────────────┐
 Postgres            Managed video service      R2                     Payments provider
 (Neon + Hyperdrive, (HLS + DASH ladders,       (artwork, subtitles,   (subscriptions, PPV;
  Drizzle ORM +       signed playback tokens,    rights documents)      webhooks → entitlements)
  migrations)         thumbnails, direct
                      resumable uploads)
        │
 Cloudflare Queues + Cron: scheduled publishing, webhook processing, ingest QC, emails
```

Why these choices:
- **Next.js on Cloudflare**: `page.tsx` is already Next.js-shaped, the Zupona marketplace
  is Next.js, and the account already deploys to Cloudflare. Server rendering gives
  every documentary an indexable page.
- **Postgres** (not R2/D1) for relational integrity across users, entitlements,
  subscriptions, rights windows and reviews. Drizzle gives typed schema + reviewed SQL
  migrations.
- **Managed video, behind a `VideoProvider` interface.** Default: **Cloudflare Stream**
  (same vendor, HLS/DASH, signed URLs, direct uploads; default upload cap 30 GB per
  video). Its DRM support could not be confirmed for this audit; **if licensors
  require Widevine/FairPlay DRM, confirm DRM support before signing content deals**
  and swap to a provider that offers it (e.g. Mux) behind the same interface.
  Self-hosted transcoding is not recommended at this stage.
- **Auth: Better Auth on our own Postgres**: email + verification, Google/Apple
  OAuth, passkeys, 2FA for staff, sessions in our DB, no per-user pricing, no lock-in.
- **Player: hls.js + Media Chrome** (web components, fully skinnable for a
  distinctive look; native HLS on Safari/iOS). Covers ABR + manual quality, speed
  0.5–2×, WebVTT subtitles per language, WebVTT chapters with timeline markers,
  PiP, fullscreen, keyboard shortcuts, resume, error recovery, QoE beacons.
- **Search v1: Postgres full-text + trigram**; move to Meilisearch/Typesense only when needed.
- **Recommendations v1: honest rules** (editorial collections; trending by
  completion-weighted views; "because you watched" via shared categories/people).
  Do not present this as machine learning until it is.

### 6.1 Core data model (first cut)

- **Identity**: `users`, `profiles` (several per account), `sessions`/`accounts` (auth library), `roles` (viewer, creator, editor, moderator, admin)
- **Publishers**: `organizations` (creator/publisher), `organization_members`, public profile fields
- **Catalog**: `titles` (kind: film | series; slug; status: draft | scheduled | published | archived; `publish_at`; access level: free | registered | premium | ppv), `seasons`, `episodes`, `video_assets` (provider id, state, duration, renditions), `text_tracks` (lang, kind: subtitles | captions | chapters, file), `chapters`, `artwork` (poster | backdrop | thumbnail | logo, lang), `categories`, `tags`, `collections` + items, `people` + `credits` (director, narrator, producer)
- **Rights**: `licences` (rights holder, territories, window start/end, exclusivity, document in R2), enforced when a playback token is issued; `ai_disclosure` field per title (see §8)
- **Engagement**: `watch_progress` (profile, episode/title, position, duration, completed, client_updated_at), `watch_history`, `watchlist`, `favorites`, `ratings`, `reviews` (moderation status)
- **Business**: `plans`, `subscriptions` (mirrored from provider webhooks), `purchases`, `entitlements`, `creator_earnings` ledger
- **Trust & ops**: `reports`, `moderation_actions`, `audit_log`, `playback_events` (QoE)

### 6.2 Key flows

- **Playback**: page → `POST /api/playback/:episodeId` → server checks entitlement +
  territory + publish window → returns a short-lived signed token → player loads HLS.
  Access is never enforced by hiding UI alone.
- **Progress sync**: heartbeat every ~15 s, plus `pagehide`/`visibilitychange` via
  `sendBeacon`; idempotent upsert per (profile, episode); completed at ~95% or at the
  credits marker; "Continue Watching" = started, not completed, newest first.
- **Ingest**: editor creates draft → resumable direct upload to the video provider →
  webhook marks it ready → QC (duration, resolution, loudness) → subtitles/chapters/artwork
  → rights record → schedule or publish. Moderation queue for publisher submissions.

---

## 7. Roadmap

Sizes are rough estimates for one engineer working with owner reviews. Each phase
ships behind a staging environment and ends with explicit exit criteria.

### Phase 0: decisions and foundations (~1 week)
- Owner answers D1–D8 (§9).
- Correct `README.md`/`README.txt` (README.txt describes files that are not in the repo).
- Tag the AI-studio branches (e.g. `archive/ai-studio-2026-11-06`); delete nothing.
- Scaffold `apps/web` (Next.js) and `packages/{db,video,ui}` **next to** the current
  static site; the live deploy stays unchanged until cutover.
- CI on `main`: build, typecheck, lint, tests, `npm audit`; bump postcss/esbuild.
- Staging and production environments; secrets only as Wrangler/host secrets.

### Phase 1: "Watchable" (~3–4 weeks)
- Postgres schema v1 + migrations + seed of a small set of **rights-verified** titles.
- Video provider integration; admin-only upload script.
- Homepage: hero, Featured, Trending, New, Continue Watching (placeholder until Phase 2), category and collection rails.
- Browse/category pages, title details (film and series → seasons → episodes), people pages.
- Player with every §3 feature from the brief (quality, speed, subtitles, fullscreen,
  resume, chapters, PiP, buffering/error handling).
- Search v1 with filters (category, length, year, language).
- SEO: JSON-LD (`Movie`/`TVSeries`/`TVEpisode`/`VideoObject`), video sitemap, OG images, canonical/hreflang.
- **Exit**: on a phone and a desktop, a visitor finds a documentary, watches it with
  subtitles and chapters, and the page passes WCAG 2.2 AA checks and Core Web Vitals
  targets (LCP < 2.5 s p75).

### Phase 2: "Personal" (~2–3 weeks)
- Accounts (email, Google, Apple, passkeys), profiles, account settings, data export/delete.
- Watch-progress sync across devices, Continue Watching, history, watchlist, favorites.
- Ratings and reviews with moderation; recommendations v1.
- **Exit**: stop on a phone, resume on desktop at the same second.

### Phase 3: "Publish" (~3–4 weeks)
- Roles and permissions; creator/publisher organizations and public profiles.
- CMS: titles/series/seasons/episodes, resumable uploads, artwork, subtitle upload
  (SRT → WebVTT validation), chapter editor, tags/categories/collections,
  draft → scheduled → published → archived with cron publishing.
- Rights and licences (territories, windows, documents) enforced at playback.
- Moderation queue (reports, reviews, submissions), audit log, ingest QC (reusing `loudness.mjs`).
- **Exit**: a publisher uploads, an editor approves, the title goes live on schedule, all recorded in the audit log.

### Phase 4: "Business" (~3–4 weeks, after D3)
- Plans (Free / Premium), checkout in the provider's **test mode first**, webhooks →
  entitlements, customer portal, pay-per-view titles.
- Creator earnings ledger and statements (payouts manual at first).
- Ads only on the free tier and only later (VAST pre-roll); never in Premium.
- **Exit**: real test-mode subscription lifecycle (start, renew, fail, cancel) correctly changes access.
  **No simulated payments will be built.**

### Phase 5: scale and polish (ongoing)
- Bangla and Arabic (RTL) interfaces and subtitles; recommendations v2.
- QoE dashboards and alerts (startup time, rebuffer ratio, error rate), load tests, caching.
- DRM and offline downloads if licensors require; TV and native apps.

---

## 8. Product and policy recommendations

- **Launch as a curated platform** (vetted publishers and licensed titles), not open
  uploads. That is how Nebula and CuriosityStream protect quality, and it makes
  copyright and moderation manageable. Open creator uploads can come later.
- **Every published title needs a rights record** (holder, territories, window,
  document). No title is published without one.
- **Disclose AI-generated imagery** in a title's metadata and credits. A documentary
  platform's main asset is viewer trust. This deliberately differs from the AI
  studio's "nothing written on screen" rule, so it needs the owner's decision.
- **Distinctive design direction**: editorial and cinematic rather than a Netflix clone.
  Large documentary key art, chapter-first details pages (see the story's structure
  before watching), the "length" and "depth" of a film as first-class filters, and
  publisher/credits prominence.

---

## 9. Decisions needed from the owner (blocking)

| # | Question | Recommendation |
|---|---|---|
| **D1** | What happens to the AI-studio work (~52k lines on unmerged branches)? | Archive it (tag, keep branches, do not merge); harvest only loudness QC and the licence-check approach |
| **D2** | Where do launch documentaries come from: own originals, licensed from distributors, invited creators, public domain? | Curated mix: invited publishers + licensed titles, seeded with rights-verified public-domain films |
| **D3** | In which country is (or will be) the business registered? | Decides the payment provider. Stripe does not appear to accept Bangladesh-registered businesses (secondary sources; confirm on Stripe's own list). Options: a supported-country entity + Stripe, or a merchant-of-record provider; local gateways (e.g. SSLCOMMERZ, bKash) for Bangladeshi viewers |
| **D4** | Domain and brand? `ai.zupona.com` says "AI"; `zupona.com` is the marketplace | A documentary-specific domain or subdomain; rename the repo later |
| **D5** | Launch markets and interface languages? | English first (US/EU), Bangla and Arabic in Phase 5 |
| **D6** | Monthly infrastructure budget? Video delivery cost grows with minutes watched | Set a ceiling; alerts on spend |
| **D7** | Keep the repository public? | Code can stay public; nothing that publishes content may run from a public repo |
| **D8** | Should accounts be shared with the zupona.com marketplace? | Separate at first; single sign-on later if useful |

---

## 10. What will not be done without approval

- No merge of the AI-studio branches into `main`; no deletion of any branch.
- No change to the live deploy until the new homepage is ready for cutover.
- No fake payments, no placeholder features presented as done, no credentials in the repo.
- No major architectural change before D1–D4 are answered.

---

## Sources (external facts used above)

- Cloudflare Stream FAQ (default 30 GB upload limit): https://developers.cloudflare.com/stream/faq
- Stripe availability for Bangladesh-registered businesses (secondary sources):
  - https://www.worldfirst.com/sasia/blog/business-banking-insights/stripe-guide-south-asia/
  - https://www.globalsolo.global/blog/us-bank-account-bangladeshi-founder-getting-paid-2026
