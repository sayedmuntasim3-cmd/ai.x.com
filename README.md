# ai.x.com

Home of Zupona AI Studio, the AI documentary and story video platform.

| Folder | What it holds |
|---|---|
| `public/` | The landing page, served by the `ai-x-com` Cloudflare Worker (`wrangler.jsonc`). Regenerate it from `page.tsx` with the scripts in `tools/`. |
| `worker/` | The Cloudflare Worker: the film API and its durable Workflow, calling the Claude API. |
| `engine/` | The studio's planning and media modules: three language versions, voice and loudness, Quran recitation recognition, story mode, the 151-role agent roster and the autonomous run plans. `cd engine && npm test`. |
| `docs/SYSTEM_V5.md` | How the system works and why, with the research behind it. |
| `docs/HANDOFF.md` | **Start here in a new session**: where everything is, the owner's decisions and the next steps. |
| `productions/` | Films made with the engine prompts (Ramesh Babu, two versions), kept so no work is lost. |
| `prompts/` | The master engine prompts the productions use. |

The studio page is `public/studio/`; the film API is the Cloudflare Worker in `worker/` (`wrangler.jsonc`), which runs a topic through S0–S7 with `engine/src/film-run.mjs`. To connect it, follow `docs/CONNECT.md`.
