// iNaturalist, Flickr, WordPress Photo Directory, Unsplash and Pixabay.

import { https, plain, qs } from "../http";
import { license, parseLicense } from "../licenses";
import type { Candidate, License, Searcher } from "../types";
import { openverseSearch } from "./encyclopedic";

/* ------------------------------------------------------------------ */
/* iNaturalist                                                         */
/* ------------------------------------------------------------------ */

type InatObservation = {
  id: number;
  uri?: string;
  species_guess?: string;
  place_guess?: string;
  observed_on?: string;
  faves_count?: number;
  user?: { login?: string; name?: string };
  taxon?: { name?: string; preferred_common_name?: string };
  photos?: { id: number; url?: string; license_code?: string | null; attribution?: string; original_dimensions?: { width?: number; height?: number } }[];
};

const INAT_FIELDS =
  "(id:!t,uri:!t,species_guess:!t,place_guess:!t,observed_on:!t,faves_count:!t,user:(login:!t,name:!t),taxon:(name:!t,preferred_common_name:!t),photos:(id:!t,url:!t,license_code:!t,attribution:!t,original_dimensions:(width:!t,height:!t)))";

const inaturalist: Searcher = async (ctx) => {
  const licences = ["cc0"];
  if (ctx.rights !== "no-attribution") licences.push("cc-by");
  if (ctx.rights === "share-alike") licences.push("cc-by-sa");
  const data = await ctx.http.json<{ results?: InatObservation[] }>(
    `https://api.inaturalist.org/v2/observations?${qs({
      q: ctx.query,
      photo_license: licences.join(","),
      quality_grade: "research",
      photos: true,
      per_page: Math.min(50, ctx.perSource + 4),
      order_by: "votes",
      fields: INAT_FIELDS,
    })}`,
  );
  const out: Candidate[] = [];
  for (const o of data.results ?? []) {
    // The first photo is the observer's pick; later ones are usually near-duplicates.
    const photo = o.photos?.find((p) => p.url && p.license_code && licences.includes(p.license_code));
    if (!photo?.url) continue;
    const lic = parseLicense(photo.license_code);
    if (!lic) continue;
    const size = (s: string) => https(photo.url!.replace(/\/square\./, `/${s}.`));
    const common = o.taxon?.preferred_common_name;
    const scientific = o.taxon?.name;
    const name = common && scientific ? `${common[0].toUpperCase()}${common.slice(1)} (${scientific})` : common || scientific || o.species_guess || "Wildlife";
    out.push({
      nativeId: String(o.id),
      title: plain(name, 160),
      description: [o.place_guess, o.observed_on].filter(Boolean).join(" · ") || undefined,
      creator: plain(o.user?.name || o.user?.login, 120) || undefined,
      date: o.observed_on,
      pageUrl: https(o.uri) || `https://www.inaturalist.org/observations/${o.id}`,
      thumbnailUrl: size("medium"),
      previewUrl: size("large"),
      fullUrl: size("original"),
      width: photo.original_dimensions?.width,
      height: photo.original_dimensions?.height,
      license: lic,
      credit: photo.attribution,
      curated: (o.faves_count ?? 0) >= 5,
      tags: [common, scientific, o.species_guess].filter((t): t is string => !!t),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Flickr                                                              */
/* ------------------------------------------------------------------ */

// Flickr licence ids: 4 CC BY 2.0, 5 CC BY-SA 2.0, 7 no known copyright restrictions (Flickr Commons),
// 8 United States government work, 9 CC0, 10 Public Domain Mark.
const FLICKR_LICENCES: Record<string, () => License> = {
  "4": () => license("cc-by", { version: "2.0" }),
  "5": () => license("cc-by-sa", { version: "2.0" }),
  "7": () => license("no-known-restrictions", { label: "No known copyright restrictions" }),
  "8": () => license("us-government"),
  "9": () => license("cc0"),
  "10": () => license("pdm"),
};

type FlickrPhoto = Record<string, string | number | undefined> & {
  id: string;
  owner: string;
  title?: string;
  ownername?: string;
  license: string;
  datetaken?: string;
  tags?: string;
  description?: { _content?: string };
};

const flickr: Searcher = async (ctx) => {
  const key = ctx.env.FLICKR_API_KEY;
  // Without a key, Flickr's openly licensed photos still come through Openverse's index.
  if (!key) return openverseSearch(ctx, { source: "flickr" });

  const ids = ["7", "8", "9", "10"];
  if (ctx.rights !== "no-attribution") ids.push("4");
  if (ctx.rights === "share-alike") ids.push("5");
  const data = await ctx.http.json<{ stat?: string; message?: string; photos?: { photo?: FlickrPhoto[] } }>(
    `https://api.flickr.com/services/rest/?${qs({
      method: "flickr.photos.search",
      api_key: key,
      text: ctx.query,
      license: ids.join(","),
      content_type: 1,
      media: "photos",
      safe_search: 1,
      sort: "relevance",
      per_page: Math.min(100, ctx.perSource + 4),
      extras: "license,owner_name,date_taken,tags,description,url_z,url_l,url_h,url_k,url_o",
      format: "json",
      nojsoncallback: 1,
    })}`,
  );
  if (data.stat === "fail") throw new Error(data.message || "Flickr error");
  const out: Candidate[] = [];
  for (const p of data.photos?.photo ?? []) {
    const make = FLICKR_LICENCES[String(p.license)];
    if (!make) continue;
    const sizes = (["o", "k", "h", "l", "z"] as const)
      .map((s) => ({ url: p[`url_${s}`] as string | undefined, width: Number(p[`width_${s}`]) || 0, height: Number(p[`height_${s}`]) || 0 }))
      .filter((s) => s.url);
    const full = sizes.find((s) => Math.max(s.width, s.height) <= 6000) ?? sizes[0];
    if (!full?.url) continue;
    const thumb = sizes.find((s) => Math.max(s.width, s.height) <= 700) ?? full;
    const preview = sizes.find((s) => Math.max(s.width, s.height) <= 1700) ?? full;
    out.push({
      nativeId: p.id,
      title: plain(p.title, 160) || "Untitled",
      description: plain(p.description?._content, 300) || undefined,
      creator: plain(p.ownername, 120) || undefined,
      date: p.datetaken?.slice(0, 10),
      pageUrl: `https://www.flickr.com/photos/${p.owner}/${p.id}`,
      thumbnailUrl: https(thumb.url),
      previewUrl: https(preview.url),
      fullUrl: https(full.url),
      width: full.width || undefined,
      height: full.height || undefined,
      license: make(),
      collection: "Flickr",
      tags: p.tags?.split(" ").slice(0, 12),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* WordPress Photo Directory (CC0)                                     */
/* ------------------------------------------------------------------ */

type WpSize = { source_url: string; width: number; height: number };
type WpPhoto = {
  id: number;
  link: string;
  content?: { rendered?: string };
  _embedded?: { "wp:featuredmedia"?: { source_url?: string; alt_text?: string; media_details?: { width?: number; height?: number; sizes?: Record<string, WpSize> } }[] };
};

const wordpressPhotos: Searcher = async (ctx) => {
  const photos = await ctx.http.json<WpPhoto[]>(
    `https://wordpress.org/photos/wp-json/wp/v2/photos?${qs({
      search: ctx.query,
      per_page: Math.min(50, ctx.perSource + 4),
      _embed: "wp:featuredmedia",
      _fields: "id,link,content,_links,_embedded",
    })}`,
  );
  const out: Candidate[] = [];
  for (const p of Array.isArray(photos) ? photos : []) {
    const media = p._embedded?.["wp:featuredmedia"]?.[0];
    if (!media?.source_url) continue;
    const sizes = media.media_details?.sizes ?? {};
    const text = plain(p.content?.rendered, 300) || plain(media.alt_text, 300);
    out.push({
      nativeId: String(p.id),
      title: plain(text, 90) || "Photo",
      description: text || undefined,
      pageUrl: p.link,
      thumbnailUrl: (sizes.medium_large ?? sizes.medium ?? sizes.large)?.source_url ?? media.source_url,
      previewUrl: (sizes["1536x1536"] ?? sizes.large)?.source_url ?? media.source_url,
      fullUrl: media.source_url,
      width: media.media_details?.width,
      height: media.media_details?.height,
      license: license("cc0"),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Unsplash (free key)                                                 */
/* ------------------------------------------------------------------ */

type UnsplashPhoto = {
  id: string;
  width: number;
  height: number;
  description?: string | null;
  alt_description?: string | null;
  created_at?: string;
  urls: { raw: string; full: string; regular: string; small: string };
  links: { html: string; download_location: string };
  user?: { name?: string; links?: { html?: string } };
  tags?: { title?: string }[];
};

const unsplash: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ results?: UnsplashPhoto[] }>(
    `https://api.unsplash.com/search/photos?${qs({
      query: ctx.query,
      per_page: Math.min(30, ctx.perSource + 4),
      orientation: ctx.orientation === "any" ? undefined : ctx.orientation === "portrait" ? "portrait" : "landscape",
      content_filter: "high",
    })}`,
    { headers: { Authorization: `Client-ID ${ctx.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } },
  );
  // Unsplash's API guidelines ask for this referral tag on every link back to them.
  const utm = `utm_source=${encodeURIComponent(ctx.env.UNSPLASH_APP_NAME || "zupona_ai")}&utm_medium=referral`;
  const out: Candidate[] = [];
  for (const p of data.results ?? []) {
    const scale = Math.min(1, 3840 / Math.max(p.width, p.height));
    const text = plain(p.description || p.alt_description, 300);
    out.push({
      nativeId: p.id,
      title: plain(text, 90) || "Photo",
      description: text || undefined,
      creator: plain(p.user?.name, 120) || undefined,
      date: p.created_at?.slice(0, 10),
      pageUrl: `${p.links.html}?${utm}`,
      thumbnailUrl: p.urls.small,
      previewUrl: p.urls.regular,
      fullUrl: `${p.urls.raw}&w=${Math.round(p.width * scale)}&fit=max&q=85&fm=jpg`,
      width: Math.round(p.width * scale),
      height: Math.round(p.height * scale),
      license: license("unsplash"),
      tags: p.tags?.map((t) => t.title ?? "").filter(Boolean),
      downloadTrackingUrl: p.links.download_location,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Pixabay (free key)                                                  */
/* ------------------------------------------------------------------ */

type PixabayHit = {
  id: number;
  pageURL: string;
  tags?: string;
  webformatURL: string;
  largeImageURL: string;
  fullHDURL?: string;
  imageURL?: string;
  imageWidth: number;
  imageHeight: number;
  user?: string;
  likes?: number;
};

const pixabay: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ hits?: PixabayHit[] }>(
    `https://pixabay.com/api/?${qs({
      key: ctx.env.PIXABAY_API_KEY,
      q: ctx.query.slice(0, 100),
      image_type: "photo",
      safesearch: true,
      order: "popular",
      orientation: ctx.orientation === "landscape" ? "horizontal" : ctx.orientation === "portrait" ? "vertical" : "all",
      per_page: Math.max(3, Math.min(200, ctx.perSource + 4)),
    })}`,
  );
  const out: Candidate[] = [];
  for (const h of data.hits ?? []) {
    // Standard keys get files up to 1280 px; accounts with full API access also get 1920 px.
    const box = h.fullHDURL ? 1920 : 1280;
    const scale = Math.min(1, box / Math.max(h.imageWidth, h.imageHeight));
    const tags = h.tags?.split(",").map((t) => t.trim()).filter(Boolean);
    out.push({
      nativeId: String(h.id),
      title: tags?.length ? tags.slice(0, 4).join(", ") : "Photo",
      creator: h.user,
      pageUrl: h.pageURL,
      thumbnailUrl: h.webformatURL,
      previewUrl: h.largeImageURL,
      fullUrl: h.fullHDURL || h.largeImageURL,
      width: Math.round(h.imageWidth * scale),
      height: Math.round(h.imageHeight * scale),
      license: license("pixabay"),
      tags,
      curated: (h.likes ?? 0) > 200,
    });
  }
  return out;
};

export const photography = { inaturalist, flickr, "wordpress-photos": wordpressPhotos, unsplash, pixabay };
