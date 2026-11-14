// Wikimedia Commons, Wikipedia lead images and Openverse.

import { https, plain, qs } from "../http";
import { license, parseLicense } from "../licenses";
import type { Candidate, MediaEnv, ProviderContext, Searcher } from "../types";

/* ------------------------------------------------------------------ */
/* Wikimedia Commons                                                   */
/* ------------------------------------------------------------------ */

type Meta = Record<string, { value?: string } | undefined>;
type CommonsPage = {
  title: string;
  index?: number;
  missing?: boolean;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    width: number;
    height: number;
    mime?: string;
    extmetadata?: Meta;
  }[];
};

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_META = "LicenseShortName|LicenseUrl|License|Artist|Credit|ImageDescription|Assessments|ObjectName|DateTimeOriginal|AttributionRequired";
const IMAGE_MIME = /^image\/(jpeg|png|webp|tiff)$/;

/**
 * Commons serves a thumbnail at any width below the original's. A thumb URL is the original's path
 * under /thumb/ plus "/<width>px-<name>" (TIFFs and PDFs add "lossy-page1-" and end in .jpg).
 */
function commonsThumb(thumburl: string | undefined, original: string, width: number, originalWidth = Infinity) {
  if (width >= originalWidth) return original;
  const sized = /\/((?:lossy-)?page\d+-)?\d+px-/;
  if (thumburl && sized.test(thumburl)) return thumburl.replace(sized, (_, page = "") => `/${page}${width}px-`);
  const match = original.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/([0-9a-f]\/[0-9a-f]{2}\/([^/?]+))/);
  if (!match) return original;
  const [, root, path, name] = match;
  return `${root}/thumb/${path}/${width}px-${name}`;
}

function commonsTitle(page: CommonsPage, meta: Meta) {
  const name = plain(meta.ObjectName?.value, 140);
  if (name) return name;
  return page.title.replace(/^File:/, "").replace(/\.[a-z0-9]{3,4}$/i, "").replace(/_/g, " ");
}

export function commonsCandidates(pages: CommonsPage[], extra: { curated?: boolean; tags?: string[] } = {}): Candidate[] {
  const out: Candidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || page.missing) continue;
    if (info.mime && !IMAGE_MIME.test(info.mime)) continue;
    const meta = info.extmetadata ?? {};
    const lic =
      parseLicense(meta.LicenseShortName?.value, { url: meta.LicenseUrl?.value }) ??
      parseLicense(meta.License?.value, { url: meta.LicenseUrl?.value }) ??
      parseLicense(meta.LicenseUrl?.value);
    if (!lic) continue;
    const longEdge = Math.max(info.width, info.height);
    // Very large originals and TIFFs are swapped for a 3840 px JPEG rendition.
    const useOriginal = longEdge <= 6000 && info.mime !== "image/tiff";
    const fullWidth = useOriginal ? info.width : Math.min(3840, info.width - 1);
    const fullUrl = useOriginal ? info.url : commonsThumb(info.thumburl, info.url, fullWidth, info.width);
    const scale = fullWidth / info.width;
    const assessments = meta.Assessments?.value ?? "";
    out.push({
      nativeId: page.title,
      title: commonsTitle(page, meta),
      description: plain(meta.ImageDescription?.value, 300) || undefined,
      creator: plain(meta.Artist?.value, 120) || undefined,
      date: plain(meta.DateTimeOriginal?.value, 40) || undefined,
      pageUrl: https(info.descriptionurl),
      thumbnailUrl: commonsThumb(info.thumburl, info.url, 500, info.width),
      previewUrl: commonsThumb(info.thumburl, info.url, 1280, info.width),
      fullUrl,
      width: Math.round(info.width * scale),
      height: Math.round(info.height * scale),
      license: lic,
      curated: extra.curated || /featured|quality|valued|potd|poty/.test(assessments),
      tags: extra.tags,
    });
  }
  return out;
}

function commonsParams(extra: Record<string, string | number>) {
  return qs({
    action: "query",
    format: "json",
    formatversion: 2,
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: 1920,
    iiextmetadatafilter: COMMONS_META,
    iiextmetadatalanguage: "en",
    ...extra,
  });
}

// Most Commons photos are CC BY-SA. Below the share-alike level, ask the search index for files whose
// structured data already carries an allowed licence (P275) or a public domain status (P6216), so
// the result slots are not spent on files that would be filtered out afterwards.
const COMMONS_FREE = ["P275=Q6938433", "P6216=Q19652"]; // CC0, public domain
const COMMONS_BY = ["P275=Q20007257", "P275=Q14947546", "P275=Q19125117", "P275=Q18810333", "P275=Q30942811"]; // CC BY 4.0, 3.0, 2.0, 2.5, 1.0

const commons: Searcher = async (ctx) => {
  const size = ctx.minSize >= 1000 ? ` filew:>${Math.min(ctx.minSize, 3000) - 1}` : "";
  const licences =
    ctx.rights === "share-alike" ? "" : ` haswbstatement:${(ctx.rights === "attribution" ? [...COMMONS_FREE, ...COMMONS_BY] : COMMONS_FREE).join("|")}`;
  const data = await ctx.http.json<{ query?: { pages?: CommonsPage[] } }>(
    `${COMMONS_API}?${commonsParams({
      generator: "search",
      gsrsearch: `${ctx.query} filetype:bitmap${size}${licences}`,
      gsrnamespace: 6,
      gsrlimit: Math.min(50, ctx.perSource + 4),
    })}`,
  );
  const pages = [...(data.query?.pages ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return commonsCandidates(pages);
};

/* ------------------------------------------------------------------ */
/* Wikipedia lead images                                               */
/* ------------------------------------------------------------------ */

const wikipedia: Searcher = async (ctx) => {
  const search = await ctx.http.json<{
    query?: { pages?: { title: string; index?: number; pageimage?: string; description?: string }[] };
  }>(
    `https://en.wikipedia.org/w/api.php?${qs({
      action: "query",
      format: "json",
      formatversion: 2,
      origin: "*",
      generator: "search",
      gsrsearch: ctx.query,
      gsrlimit: Math.min(20, ctx.perSource),
      prop: "pageimages|description",
      piprop: "name",
      pilicense: "free",
    })}`,
  );
  const articles = [...(search.query?.pages ?? [])]
    .filter((p) => p.pageimage)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (!articles.length) return [];

  const files = [...new Set(articles.map((a) => `File:${a.pageimage}`))];
  const info = await ctx.http.json<{ query?: { pages?: CommonsPage[]; normalized?: { from: string; to: string }[] } }>(
    `${COMMONS_API}?${commonsParams({ titles: files.join("|") })}`,
  );
  const byTitle = new Map<string, CommonsPage>();
  for (const page of info.query?.pages ?? []) byTitle.set(page.title.replace(/_/g, " "), page);

  const out: Candidate[] = [];
  for (const article of articles) {
    const page = byTitle.get(`File:${article.pageimage}`.replace(/_/g, " "));
    if (!page) continue;
    const [item] = commonsCandidates([page], { curated: true, tags: [article.title, article.description ?? ""] });
    if (!item) continue;
    out.push({
      ...item,
      nativeId: `${article.title}|${page.title}`,
      title: `${article.title}${item.title && !article.title.includes(item.title) ? ` — ${item.title}` : ""}`.slice(0, 160),
      description: article.description ? `${article.description}. ${item.description ?? ""}`.trim() : item.description,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Openverse                                                           */
/* ------------------------------------------------------------------ */

type OpenverseImage = {
  id: string;
  title?: string;
  url: string;
  thumbnail?: string;
  creator?: string;
  license: string;
  license_version?: string;
  license_url?: string;
  foreign_landing_url?: string;
  source: string;
  provider?: string;
  width?: number;
  height?: number;
  tags?: { name: string }[];
  mature?: boolean;
};

/** Collections Zupona already searches directly, plus 3D models and silhouettes that are no use in a film. */
const OPENVERSE_EXCLUDED = [
  "flickr",
  "wikimedia",
  "inaturalist",
  "met",
  "smk",
  "clevelandmuseum",
  "wordpress",
  "nasa",
  "rijksmuseum",
  "wellcome_collection",
  "svgsilh",
  "phylopic",
  "thingiverse",
  "sketchfab",
];

const COLLECTION_NAMES: Record<string, string> = {
  flickr: "Flickr",
  rawpixel: "Rawpixel",
  stocksnap: "StockSnap",
  geographorguk: "Geograph Britain and Ireland",
  europeana: "Europeana",
  brooklynmuseum: "Brooklyn Museum",
  sciencemuseum: "Science Museum Group",
  museumsvictoria: "Museums Victoria",
  finnish_heritage_agency: "Finnish Heritage Agency",
  finnish_satakunnan_museum: "Satakunta Museum",
  digitaltmuseum: "DigitaltMuseum",
  nappy: "Nappy",
  spacex: "SpaceX",
  nypl: "New York Public Library",
  katmai_nps: "Katmai National Park",
  bio_diversity: "Biodiversity Heritage Library",
  animaldiversity: "Animal Diversity Web",
  WoRMS: "World Register of Marine Species",
  bib_gulbenkian: "Gulbenkian Art Library",
};

function collectionName(source: string) {
  if (COLLECTION_NAMES[source]) return COLLECTION_NAMES[source];
  if (source.startsWith("smithsonian")) {
    const unit = source.replace(/^smithsonian_?/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return unit ? `Smithsonian ${unit}` : "Smithsonian";
  }
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

let openverseToken: { value: string; expires: number } | null = null;

async function openverseAuth(ctx: ProviderContext, env: MediaEnv): Promise<Record<string, string>> {
  const id = env.OPENVERSE_CLIENT_ID;
  const secret = env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return {};
  if (!openverseToken || openverseToken.expires < Date.now() + 60_000) {
    const token = await ctx.http.json<{ access_token: string; expires_in: number }>("https://api.openverse.org/v1/auth_tokens/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: qs({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
    });
    openverseToken = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
  }
  return { Authorization: `Bearer ${openverseToken.value}` };
}

/**
 * Openverse reports the original's size, but for some collections its `url` is a smaller rendition:
 * Flickr "_b" files are 1024 px, StockSnap's are 960 px wide, Rawpixel's "editor_1024" are 1024 px.
 * Returns the size of the file the URL actually serves, so a 960 px file is never labelled 4K.
 */
export function deliveredSize(url: string, width?: number, height?: number) {
  if (!width || !height) return { width, height };
  const long = Math.max(width, height);
  const flickr = url.match(/staticflickr\.com\/.+_([mnwzcbhk])\.(?:jpe?g|png)$/i)?.[1];
  const flickrEdge: Record<string, number> = { m: 240, n: 320, w: 400, z: 640, c: 800, b: 1024, h: 1600, k: 2048 };
  let edge = flickr ? flickrEdge[flickr.toLowerCase()] : undefined;
  const widthToken = url.match(/\/(\d{3,4})w\//)?.[1] ?? url.match(/\/(?:image|editor)_(?:png_|jpeg_)?(\d{3,4})\//)?.[1];
  if (!edge && widthToken) edge = Math.round((Number(widthToken) / width) * long);
  if (!edge || edge >= long) return { width, height };
  const scale = edge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function openverseSearch(ctx: ProviderContext, scope: { source?: string; exclude?: string[] }): Promise<Candidate[]> {
  const licenses = ["cc0", "pdm"];
  if (ctx.rights !== "no-attribution") licenses.push("by");
  if (ctx.rights === "share-alike") licenses.push("by-sa");
  const headers = await openverseAuth(ctx, ctx.env);
  const data = await ctx.http.json<{ results?: OpenverseImage[] }>(
    `https://api.openverse.org/v1/images/?${qs({
      q: ctx.query,
      page_size: Math.min(headers.Authorization ? 50 : 20, ctx.perSource + 4),
      license: licenses.join(","),
      // Openverse stores most Flickr photos at 1024 px ("medium"), so "large" alone would hide them.
      size: ctx.minSize >= 1600 ? "large" : "medium,large",
      aspect_ratio: ctx.orientation === "landscape" ? "wide" : ctx.orientation === "portrait" ? "tall" : undefined,
      mature: false,
      source: scope.source,
      excluded_source: scope.exclude?.join(","),
    })}`,
    { headers },
  );
  const out: Candidate[] = [];
  for (const r of data.results ?? []) {
    if (r.mature) continue;
    const lic = parseLicense(r.license_url || `cc-${r.license}`) ?? parseLicense(r.license);
    if (!lic) continue;
    const versioned = lic.code === "cc-by" || lic.code === "cc-by-sa" ? license(lic.code, { version: r.license_version, url: r.license_url }) : lic;
    out.push({
      nativeId: r.id,
      title: plain(r.title, 160) || "Untitled",
      creator: plain(r.creator, 120) || undefined,
      pageUrl: https(r.foreign_landing_url) || `https://openverse.org/image/${r.id}`,
      thumbnailUrl: r.thumbnail || `https://api.openverse.org/v1/images/${r.id}/thumb/`,
      previewUrl: https(r.url),
      fullUrl: https(r.url),
      ...deliveredSize(r.url, r.width || undefined, r.height || undefined),
      license: versioned,
      collection: collectionName(r.source),
      tags: r.tags?.map((t) => t.name).slice(0, 12),
    });
  }
  return out;
}

const openverse: Searcher = (ctx) => openverseSearch(ctx, { exclude: OPENVERSE_EXCLUDED });

export const encyclopedic = { "wikimedia-commons": commons, wikipedia, openverse };
