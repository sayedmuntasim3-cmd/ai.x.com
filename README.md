# ai.x.com

Home of Zupona AI Studio, the AI documentary and story video platform.

| Folder | What it holds |
|---|---|
| `public/` | The landing page, served by the `ai-x-com` Cloudflare Worker (`wrangler.jsonc`). Regenerate it from `page.tsx` with the scripts in `tools/`. |
| `engine/` | The studio's planning and media modules: three language versions, voice and loudness, Quran recitation recognition, story mode, the 151-role agent roster and the autonomous run plans. `cd engine && npm test`. |
| `docs/SYSTEM_V5.md` | How the system works and why, with the research behind it. |

The studio app itself (pages and API routes) is still on the `zupona` repository's AI branches; `branches.txt` lists them. Moving it here is the next step in `docs/SYSTEM_V5.md`.
