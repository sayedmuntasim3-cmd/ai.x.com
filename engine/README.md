# Zupona AI engine

Pure JavaScript modules, with no dependencies, that decide how a Zupona AI
film is made. They run unchanged in the browser, in a Cloudflare Worker and
in Node. The studio app calls them; they never call a provider themselves.

```bash
cd engine
npm test           # node --test: every module's tests
npm run typecheck  # strict JSDoc type check (downloads TypeScript 5.9.3 once)
```

| Module | What it decides |
|---|---|
| `src/versions.mjs` | The three versions: Arabic (Islamic outlook), English for the USA and Bangla. Language, script, digits, currency, pace, fonts, default music; `checkVersionPurity` keeps each version in its own script. |
| `src/content-intel.mjs` | What the owner gave: Quran recitation, Islamic content, a true-story documentary, a story idea or a finished script, and in which language; money figures and goals in an idea, in any of the three languages. Stories of prophets and Companions are always sourced, never fiction. |
| `src/arabic.mjs`, `src/quran.mjs` | Which surah and ayat a recording recites, from its transcript: ayah range, per-ayah start and end times, confidence, the isti'adha and basmala as markers, and every place a repeated passage occurs. Uses the Tanzil text in `data/quran/`. |
| `src/loudness.mjs` | Loudness (ITU-R BS.1770-4 / EBU R128), true peak, noise floor, signal-to-noise ratio, clipping and DC offset of a recording, in plain words. Checked against EBU Tech 3341 cases 1 to 5. |
| `src/voice-plan.mjs` | What happens to a voice: a light chain chosen from measurements for the owner's own recording, the right ElevenLabs model per language for a cloned voice, and the music policy. Nothing under Quran recitation; the Quran is never synthesised. |
| `src/story-mode.mjs` | Idea mode: hooks, twists and payoff for Shorts and long stories, the fiction label per language, the realism rules, a US era bible, a robotic-writing check and a money-path check. |
| `src/agent-roster.mjs` | The 151 specialist roles in 15 squads. |
| `src/pipeline.mjs` | The autonomous run plan for each kind of input: stages, agents and automatic checks, with no human approval step. |
| `src/documentary-engine-core.mjs`, `src/documentary-media-fetch.mjs` | Media needs, retention structure, render chunks and run-time estimates for any length; licence-checked media fetching with caching and rate limits. Ported from the zupona repository's `feat/documentary-engine-core` branch. |

The design behind these modules, with the research and sources, is in
[../docs/SYSTEM_V5.md](../docs/SYSTEM_V5.md).
