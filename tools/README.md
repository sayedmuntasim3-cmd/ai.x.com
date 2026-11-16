# Site build tools

`../public/` is the static site that Cloudflare deploys (`npx wrangler deploy`,
configured by `../wrangler.jsonc`). It is generated from `../page.tsx` and the
components in `../src/`. The Worker in `../worker/index.ts` adds the media search
API (`/api/media/*`); Wrangler bundles it on deploy, so it needs no build step here.

After editing `page.tsx` or anything in `src/`, regenerate and commit `public/`:

```sh
cd tools
npm ci
npm run build
```

The build does three things:

1. `render.tsx` renders the page to `public/index.html` (and writes `public/favicon.svg`),
   so the full page is visible before any JavaScript loads.
2. `build-client.mjs` bundles `src/client.tsx` into `public/app.js`, which hydrates the
   page so the studio (tabs, menus, voiceover upload/recording, preview, brief) works.
3. Tailwind compiles the classes used in `page.tsx` and `src/` into `public/styles.css`.

Cloudflare needs no build step for the site.

Other scripts:

```sh
npm run typecheck      # types for src/media, worker/ and media-check.ts
npm run check:media    # live test of every image source (see ../MEDIA_SOURCES.md)
```

## Where things live

| File | What it holds |
| --- | --- |
| `src/landing.tsx` | Page layout and all interactive behaviour |
| `src/data.ts` | Every option and piece of sample copy (categories, ages, styles, music, ideas) |
| `src/art.tsx` | Logo and the illustrated poster scenes (pure SVG, no image files) |
| `src/select.tsx` | Accessible dropdown used by every picker |
| `src/library.tsx` | Visual library section: search across all image archives, results, image details |
| `src/media/` | Image search library: sources (`catalog.ts`, `providers/`), licences, ranking, search |
| `worker/index.ts` | Cloudflare Worker: `/api/media/search`, `/api/media/sources`, `/api/media/track`, `/api/media/plan` |
| `worker/plan.ts` | Shot list: short visual searches per chapter (own agent, Workers AI, Claude, or the archives) |
| `src/media/plan.ts` | Free shot list mined from archive search results |
| `../package.json` | Worker runtime dependencies (Anthropic SDK, zod); run `npm ci` in the repo root before `wrangler deploy` |
| `src/icons.tsx` | Icon set |
| `tools/input.css` | Colour tokens for the light and dark themes |
| `tools/tailwind.config.cjs` | Fonts, shadows and animations |

The **Create documentary** button currently validates the input and shows a brief
(summary, chapter plan, estimated credits) because Zupona Studio rendering is not live
on this site yet. Connect it to the studio API in `create()` inside `src/landing.tsx`.
