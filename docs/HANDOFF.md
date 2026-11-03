# Handoff: start here in a new session

Read this file instead of re-analysing everything. It is the short state of the project as of 3 November 2026.

## Where things are

| Place | What | Rule |
|---|---|---|
| `sayedmuntasim3-cmd/ai.x.com`, branch `ccr-cb190ece-ukm6vg` | All new work: `engine/` (51 tests, CI "Engine checks" green), `docs/SYSTEM_V5.md` (design and research with sources), `productions/ramesh-babu/`, `prompts/` | Write here. Open a PR only when the owner asks. |
| `ai.x.com` `main` | The landing page in `public/`, deployed by Cloudflare Workers Builds as Worker `ai-x-com` | `engine/` and `productions/` do not affect the deploy (`npx wrangler deploy --dry-run` passes). |
| `sajid1234sajid/zupona` | The marketplace (main auto-deploys the shop: never push there) and the old AI studio app on about 70 unmerged branches; `feat/documentary-engine-core` holds the Film plan panel | Read only, except that branch. ai.zupona.com was taken down on 21 Oct 2026. |

## What the owner wants (keep these decisions)

1. The best AI documentary video platform in the world. Any topic, any length, every viral documentary format (see `engine/src/formats.mjs`), Hollywood quality.
2. Agents work on their own: no human approval step during a run. The owner publishes.
3. Three versions per film, each written natively, never translated or mixed:
   - Arabic, for viewers with an Islamic outlook;
   - English for the USA;
   - Bangla.
4. Voice input:
   - The owner's own recording is cleaned, never altered (no pitch, speed or re-synthesis changes).
   - The owner's ElevenLabs voice is read with Multilingual v2 for English and Arabic, and v3 for Bangla.
5. Quran recitation:
   - Recognise the surah and ayat (`engine/src/quran.mjs`).
   - Show only the verbatim Tanzil text.
   - Nothing under the recitation: no music, nasheed or nature sounds. Cut only at ayah ends.
   - Never synthesise the Quran.
6. Islamic films: never depict prophets, Companions, angels or Allah. Stories of prophets are told from sources, never as fiction.
7. Idea mode: a one-line idea becomes a movie-like story.
   - **No "fictional story" label on screen** (owner's decision): only a one-line dramatization note in the description.
   - Never call an invented story true, and never tie it to a real person.
   - A real person's story is told in documentary mode, from sources.
8. Footage comes from legal sources only (stock sites, Commons, NASA and others) or with written permission from the creator. **No cutting or downloading from Facebook, X, YouTube or TikTok.** The owner's own master prompt said the same.
9. Honesty: no fake functionality, no guaranteed view counts. Test everything.

## Next steps, in order

1. **Studio app.** Move it from the zupona AI branches into ai.x.com as its own Worker and wire the engine modules in. When Cloudflare is connected it will need:
   - an R2 bucket and a KV namespace;
   - secrets: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (Whisper), `ELEVENLABS_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`.
2. **Upload flow.** Recording → `analyzeRecording` → `planVoice` → transcription (Quran-tuned for Arabic) → `matchRecitation` → a film planned ayah by ayah.
3. **Idea mode screen.** `classifyInput` → `suggestFormat` → `planStory` → screenplay agents → `lintNarration` and `checkMoneyPath` → three versions.
4. **Quran text and translations.** Download the Tanzil Uthmani text and the Amiri Quran font (tanzil.net was blocked here), and get the translation permissions in writing.
5. **AI video for fantasy scenes only.** Veo 3.1 as the main provider, Kling 3.0 as backup, behind a provider layer.
6. **Ramesh Babu film.** See `productions/ramesh-babu/README.md`.

## Working cheaply

- Do not repeat the research: `docs/SYSTEM_V5.md` has the findings and the sources.
- Check the code with `cd engine && npm test` (about 10 seconds) and `npm run typecheck`.
- The owner's plan has 5-hour and weekly usage limits. Run at most two agents at a time, and write long outputs to files in parts.
- This environment blocks most websites, including tanzil.net, workers.dev and Wikimedia. The npm registry and raw.githubusercontent.com work.
- Commit trailer used so far:
  - `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
  - `Claude-Session: <session link>`
