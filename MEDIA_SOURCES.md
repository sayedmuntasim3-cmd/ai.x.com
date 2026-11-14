# Media sources

One search reaches 30 openly licensed image archives at once. 24 work with no key; 6 more switch on as soon as their free key is added. Every result is cleared for use in a commercial, edited film and comes with the image's pixel size, its licence and a credit line ready for the end titles.

Code: `src/media/` (search library, no dependencies), `worker/index.ts` (the `/api/media/*` endpoints), `src/library.tsx` (the Visual library section on the page).

## Connected sources

Tested live on 14 Nov 2026 with `npm run check:media` (see below): each source answered a real query, and the first result's thumbnail and full file were downloaded and their pixel size measured.

| Source | Key | Holds | Typical full file |
| --- | --- | --- | --- |
| Wikimedia Commons | none | 100M+ files; featured pictures ranked up | original, often 3000 to 6000 px |
| Wikipedia lead images | none | the image editors chose for each matching article | original |
| Openverse collections | none (optional) | 40+ collections in one index: Rawpixel, StockSnap, Geograph, Brooklyn Museum, Science Museum, Smithsonian, SpaceX, Finnish Heritage Agency, Museums Victoria and more | 1000 px to original |
| NASA Image and Video Library | none | missions, astronauts, Earth from orbit | 1000 to 5000 px |
| NASA Scientific Visualization Studio | none | data visualisations of Earth, climate, planets | up to 4096 px |
| ESA/Hubble | none | every Hubble release | 4000 px |
| ESA/Webb | none | every Webb release | 4000 px or original |
| European Southern Observatory | none | VLT/ALMA images, observatory landscapes | 3000 to 4000 px |
| NOIRLab | none | Gemini, Kitt Peak, Rubin | 4000 px |
| The Met | none | 490,000+ CC0 artworks | 3000 to 4000 px |
| Art Institute of Chicago | none | 60,000+ CC0 works | 3000 px |
| Cleveland Museum of Art | none | 60,000+ CC0 works | 3400 px |
| Rijksmuseum | none | Dutch Golden Age, maritime history | 4000 px |
| SMK – National Gallery of Denmark | none | European art in very high resolution | 3840 px |
| Minneapolis Institute of Art | none | public domain collection | up to ~10,000 px |
| Library of Congress | none | photos marked "no known restrictions" | 1024 px |
| Internet Archive | none | public domain and CC uploads | varies, up to 4000 px |
| Wellcome Collection | none | medicine, anatomy, history of science | 3840 px |
| DigitalNZ | none (optional) | NZ libraries, museums, Te Papa | ~1000 px |
| Swedish Open Cultural Heritage (K-samsök) | none | Swedish museums and archives | 2400 px |
| Digital Commonwealth | none | Massachusetts libraries and archives | 3000 px |
| iNaturalist | none | research-grade wildlife photos | 800 to 2048 px |
| Flickr (Creative Commons) | optional | CC BY, CC0, public domain photos | 1024 px through Openverse; up to original with a key |
| WordPress Photo Directory | none | reviewed CC0 photos | full camera resolution |
| Europeana | `EUROPEANA_API_KEY` | Europe's museums and archives, 13M+ open images | varies |
| Smithsonian Open Access | `SMITHSONIAN_API_KEY` | 5M+ CC0 images from 21 museums | varies |
| New York Public Library | `NYPL_API_TOKEN` | 180,000+ public domain items | up to 4000 px |
| US National Archives | `NARA_API_KEY` | federal photographs | original |
| Unsplash | `UNSPLASH_ACCESS_KEY` | professional photography | 3840 px |
| Pixabay | `PIXABAY_API_KEY` | stock photos | 1280 px (1920 px with full API access) |

The six keyed sources are written against each API's documentation but have not run with a real key yet. Run `npm run check:media -- europeana smithsonian nypl nara unsplash pixabay` once the keys are in place.

## Adding keys

All keys are free. Add each one as a Worker secret (never in `wrangler.jsonc`):

```sh
npx wrangler secret put PIXABAY_API_KEY        # https://pixabay.com/api/docs/
npx wrangler secret put UNSPLASH_ACCESS_KEY    # https://unsplash.com/oauth/applications
npx wrangler secret put SMITHSONIAN_API_KEY    # https://api.data.gov/signup/
npx wrangler secret put EUROPEANA_API_KEY      # https://pro.europeana.eu/page/get-api
npx wrangler secret put NYPL_API_TOKEN         # https://api.repo.nypl.org/sign_up
npx wrangler secret put NARA_API_KEY           # https://www.archives.gov/research/catalog/help/api
```

Optional, for higher limits or a richer API:

| Secret | Effect |
| --- | --- |
| `FLICKR_API_KEY` | Searches Flickr directly instead of through Openverse: fresher results and files up to the original size. Commercial use of the Flickr API needs Flickr's approval. |
| `OPENVERSE_CLIENT_ID`, `OPENVERSE_CLIENT_SECRET` | Registered Openverse app: far higher rate limits than anonymous use. Register at https://api.openverse.org/v1/#tag/auth/operation/register |
| `DIGITALNZ_API_KEY` | Higher DigitalNZ rate limit. |

Other settings (plain vars in `wrangler.jsonc`, or secrets):

| Name | Default | Meaning |
| --- | --- | --- |
| `MEDIA_DEFAULT_RIGHTS` | `attribution` | Licence level when a request does not say: `no-attribution`, `attribution` or `share-alike` |
| `MEDIA_DISABLED_SOURCES` | – | Comma-separated source ids to switch off |
| `MEDIA_ALLOWED_ORIGINS` | – | Comma-separated origins (e.g. `https://zupona.com`) allowed to call the API from a browser on another domain |
| `MEDIA_SUBREQUEST_BUDGET` | `45` | Upstream requests one search may make. The Workers free plan allows 50; raise it on Workers Paid |
| `MEDIA_USER_AGENT` | `ZuponaAI-MediaSearch/1.0 (https://ai.zupona.com; …)` | Sent to every archive. Wikimedia requires a descriptive one with contact details |

## Licences

A documentary is a commercial work that crops, pans, zooms and grades its images, so every source is asked only for images that allow both. Anything non-commercial (NC), no-derivatives (ND), "all rights reserved" or unknown is dropped.

| Level | Includes | Obligation |
| --- | --- | --- |
| `no-attribution` | CC0, public domain, US government works, "no known restrictions", Unsplash and Pixabay licences | none (a credit is still good practice) |
| `attribution` (default) | adds CC BY | credit line in the end titles |
| `share-alike` | adds CC BY-SA | credit, and an edited version of the image must be shared under CC BY-SA |

Most Wikimedia Commons photos are CC BY-SA. They are left out by default, because an edited image inside a film may count as an adaptation that has to carry the same licence. The visitor can include them with the licence menu, or the default can change with `MEDIA_DEFAULT_RIGHTS=share-alike`.

Every result carries `attribution`, a credit line written the way its licence asks (for example `Photo by X on Unsplash`, or `“Title” by Creator · CC BY 4.0 · Source`). When the studio renders a film, collect the `attribution` of every image used and put them in the end credits. When an Unsplash photo is used, POST its `downloadTrackingUrl` to `/api/media/track` as Unsplash's API terms require. Pixabay's terms ask that files are downloaded and stored rather than hotlinked long term, so the renderer should copy the files it uses to its own storage.

## Ranking

Each result gets a score from:

- resolution of the full file (a 1080p film needs 1920 px, 4K needs 3840 px; a size that is only a typical value for the source counts for less than a measured one)
- relevance (how many search words appear in the title, description and tags, and the source's own ordering)
- the source's typical quality
- how well the image fills a 16:9 frame
- editor picks: Wikimedia featured and quality images, Wikipedia lead images, museum highlights, observatory releases
- complete metadata (creator, date, description)
- a small boost for sources that are strong in the film's category (space, history, ...)

Then duplicates reached through two sources (for example a Commons file that Openverse also indexes) are removed, and the list is interleaved so one archive cannot fill the page and many pages of one book do not crowd out other works.

Openverse reports the original's size even when its URL is a smaller file (Flickr `_b` is 1024 px, StockSnap 960 px, Rawpixel `editor_1024`). The real file size is worked out from the URL, so such an image is never labelled HD or 4K.

## API

```
GET /api/media/search?q=snow+leopard&topic=nature
```

| Parameter | Values |
| --- | --- |
| `q` | the search, 2 to 200 characters |
| `topic` | `nature`, `ocean`, `space`, `history`, `science`, `culture` |
| `rights` | `no-attribution`, `attribution`, `share-alike` |
| `orientation` | `any`, `landscape`, `portrait` |
| `min` | smallest long edge in pixels for images whose size is known (default 1000; 1920 for HD) |
| `sources` | comma-separated source ids, e.g. `nasa,esa-hubble,esa-webb` |
| `per`, `limit` | results per source (default 12) and in total (default 80) |
| `stream=1` | newline-delimited JSON: one `start` event, one `source` event per archive as it answers, one `done` event |

The JSON response holds `results` (ranked) and `sources` (per archive: status `ok`, `empty`, `error`, `timeout` or `needs-key`, results found and kept, time taken). Responses are cached at the edge for 30 minutes. `GET /api/media/sources` lists every source and whether it is switched on.

Most archives answer within a second or two. Openverse and the observatory sites can take 5 to 15 seconds on a query they have not seen before, so they get a longer deadline; with `stream=1` the other results are already on screen while they finish.

### From the Zupona studio (Next.js)

`src/media` has no dependencies and only uses `fetch`, so it can be copied into the studio project and called from a route handler or a server action:

```ts
import { searchMedia } from "@/lib/media";

const { results } = await searchMedia(
  { query: scene.visualQuery, topic: "history", rights: "attribution", minSize: 1920, orientation: "landscape", limit: 20 },
  process.env,
);
```

For the best footage, have the script writer produce two or three short visual search phrases per scene ("Shah Jahan portrait", "Taj Mahal dawn") rather than searching with whole sentences, and run them per chapter.

## Checking the sources

```sh
cd tools
npm ci
NODE_USE_ENV_PROXY=1 npm run check:media          # every source with a sample query
npm run check:media -- nasa eso                    # only some sources
npm run check:media -- --all "coral reef"          # one query across everything, ranked
npm run typecheck                                  # types for src/media, worker and the check
```

`NODE_USE_ENV_PROXY=1` is only needed behind an HTTP proxy.

## Sources looked at and left out

| Source | Why it is not connected |
| --- | --- |
| Pexels | Not offering API keys to us at the moment. Easy to add later as a keyed source. |
| VidMate and other downloaders | Not an image library: they copy videos and pictures from YouTube, Instagram and similar sites, whose owners have not licensed them. Using that material in a film would be infringement. |
| Freepik, Vecteezy, Shutterstock, Getty Images, Adobe Stock | Paid APIs, or free files need per-file attribution terms that do not suit an API. Possible later as paid add-ons. |
| Victoria and Albert Museum, Harvard Art Museums | Image terms allow non-commercial use only. |
| Gallica (BnF) | Commercial reuse of its public domain scans needs a paid licence from the BnF. |
| DPLA | Returns small thumbnails only; the full images live on hundreds of partner sites. |
| GBIF, Atlas of Living Australia | Mostly the same photos as iNaturalist, without reliable sizes. |
| Finna (Finland), Museums Victoria, Science Museum Group, StockSnap direct | Their APIs block automated requests from cloud servers; their open images still arrive through Openverse. |
| Burst, Kaboompics, Reshot, Life of Pix, ISO Republic, Picjumbo, Gratisography, Nappy direct | No API. Scraping their sites is against most of their terms. Nappy and StockSnap are covered through Openverse. |
| Japan Search, Polona, Trove, Te Papa direct | Results are mostly books and documents or carry mixed rights; Te Papa's open images come through DigitalNZ. |
