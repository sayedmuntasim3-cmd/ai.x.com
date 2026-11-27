/**
 * The open archives the studio's own providers do not cover yet: ESA/Hubble, ESA/Webb, ESO,
 * NOIRLab, NASA's visualisation studio, Cleveland, Rijksmuseum, SMK, Mia, Wellcome, Internet
 * Archive, DigitalNZ, Swedish heritage, Digital Commonwealth, iNaturalist, Flickr Creative Commons,
 * WordPress photos and Wikipedia lead images (plus Europeana, NYPL, the National Archives and
 * Unsplash once their free keys are set). One provider, one search across all of them, ranked for
 * resolution, relevance and 16:9 fit. Built from ai.x.com's src/media (open-archives-lib.mjs).
 *
 * Only CC0, public domain and CC BY results come back: the same rule the studio applies to every
 * source (share-alike, non-commercial and no-derivatives are refused).
 */
import { SOURCES, searchMedia } from "./open-archives-lib.mjs";

/** Sources the studio already searches with its own providers (film-media.mjs). */
const COVERED = new Set(["wikimedia-commons", "nasa", "loc", "smithsonian", "met", "artic", "openverse", "pixabay"]);

/** @param {string} code @param {string} label @param {string | undefined} url */
function licenceText(code, label, url) {
  if (code === "cc0") return { license: "CC0", licenseUrl: url ?? "https://creativecommons.org/publicdomain/zero/1.0/" };
  if (code === "cc-by") return { license: label, licenseUrl: url ?? "https://creativecommons.org/licenses/by/4.0/" };
  if (code === "pdm") return { license: "Public Domain Mark", licenseUrl: url ?? "https://creativecommons.org/publicdomain/mark/1.0/" };
  if (code === "unsplash") return { license: "Unsplash License", licenseUrl: "https://unsplash.com/license" };
  // public-domain, us-government, no-known-restrictions: the archive's own statement.
  return { license: label, licenseUrl: url ?? null };
}

/** Sources whose terms forbid caching their results (NARA: "Please do not cache or store any content returned by the API"). */
export const NO_STORE_SOURCES = Object.freeze(new Set(["nara"]));

/**
 * The archive keys a run may pass to the open archives: only names the archives
 * themselves ask for (EUROPEANA_API_KEY, NARA_API_KEY, ...), never the whole environment.
 * @param {Record<string, string | undefined>} env
 * @returns {Record<string, string>}
 */
export function archiveKeys(env = {}) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const s of SOURCES) for (const k of /** @type {any} */ (s).keys ?? []) if (typeof env[k] === "string" && env[k]) out[k] = /** @type {string} */ (env[k]);
  return out;
}

/**
 * @param {{ env?: Record<string, string | undefined>, fetch?: import("./film-media.mjs").FetchLike, perSource?: number, limit?: number }} [o]
 * @returns {import("./documentary-media-fetch.mjs").MediaProvider}
 */
export function openArchivesProvider(o = {}) {
  const env = o.env ?? {};
  return {
    id: "open-archives", layer: 1, kinds: ["image"], cacheTtlSeconds: 86_400, rate: { capacity: 30, windowSeconds: 60 },
    async search(query, kind) {
      if (kind !== "image") return [];
      const sources = SOURCES.map((s) => s.id).filter((id) => !COVERED.has(id));
      const res = await searchMedia({ query, sources, rights: "attribution", minSize: 1280, orientation: "landscape", perSource: o.perSource ?? 6, limit: o.limit ?? 24, timeoutMs: 6000 }, env, { fetch: o.fetch });
      return res.results.map((r) => ({
        id: `open-archives:${r.id}`,
        source: "open-archives",
        mediaType: "image",
        title: r.title,
        previewUrl: r.thumbnailUrl,
        mediaUrl: r.fullUrl,
        sourcePageUrl: r.pageUrl,
        creator: r.creator ?? r.collection ?? r.sourceName ?? null,
        ...licenceText(r.license.code, r.license.label, r.license.url),
        durationSeconds: null,
        width: r.width ?? null,
        height: r.height ?? null,
        attributionRequired: r.license.attribution,
        restrictions: null,
        ...(NO_STORE_SOURCES.has(String(/** @type {any} */ (r).source)) ? { noStore: true } : {}),
      }));
    },
  };
}
