// The Met, Art Institute of Chicago, Cleveland Museum of Art, Rijksmuseum, SMK and Mia.
// Only public domain / CC0 works are requested, so every result is free for commercial films.

import { first, https, plain, qs } from "../http";
import { license, parseLicense } from "../licenses";
import type { Candidate, Searcher } from "../types";

/** IIIF Image API URL that fits the image inside a square of `box` pixels (never upscales). */
const iiif = (base: string, box: number | "max") => `${base.replace(/\/$/, "")}/full/${box === "max" ? "max" : `!${box},${box}`}/0/default.jpg`;

/** Size of an image of w x h after fitting it inside a box. */
function fit(width: number | undefined, height: number | undefined, box: number) {
  if (!width || !height) return { width: undefined, height: undefined };
  const scale = Math.min(1, box / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/* ------------------------------------------------------------------ */
/* The Met                                                             */
/* ------------------------------------------------------------------ */

type MetObject = {
  objectID: number;
  isPublicDomain?: boolean;
  isHighlight?: boolean;
  primaryImage?: string;
  primaryImageSmall?: string;
  title?: string;
  artistDisplayName?: string;
  objectDate?: string;
  objectURL?: string;
  culture?: string;
  medium?: string;
  department?: string;
  tags?: { term: string }[] | null;
};

const met: Searcher = async (ctx) => {
  const search = await ctx.http.json<{ objectIDs?: number[] | null }>(
    `https://collectionapi.metmuseum.org/public/collection/v1.1/search?${qs({ q: ctx.query, hasImages: true, isPublicDomain: true, limit: 8, offset: 0 })}`,
  );
  // One request per object, so the Met gets a small share of the request budget.
  const ids = (search.objectIDs ?? []).slice(0, 5);
  const objects = await Promise.allSettled(
    ids.map((id) => ctx.http.json<MetObject>(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`)),
  );
  const out: Candidate[] = [];
  for (const settled of objects) {
    if (settled.status !== "fulfilled") continue;
    const o = settled.value;
    if (!o.isPublicDomain || !o.primaryImage) continue;
    out.push({
      nativeId: String(o.objectID),
      title: plain(o.title, 160) || "Untitled",
      description: [o.culture, o.medium, o.department].filter(Boolean).join(" · ") || undefined,
      creator: plain(o.artistDisplayName, 120) || undefined,
      date: o.objectDate || undefined,
      pageUrl: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
      thumbnailUrl: https(o.primaryImageSmall || o.primaryImage),
      previewUrl: https(o.primaryImageSmall || o.primaryImage),
      fullUrl: https(o.primaryImage),
      sizeHint: 3500,
      license: license("cc0"),
      curated: o.isHighlight,
      tags: o.tags?.map((t) => t.term).slice(0, 12),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Art Institute of Chicago                                            */
/* ------------------------------------------------------------------ */

type AicArtwork = {
  id: number;
  title?: string;
  image_id?: string | null;
  artist_display?: string;
  artist_title?: string;
  date_display?: string;
  place_of_origin?: string;
  medium_display?: string;
  is_public_domain?: boolean;
  is_boosted?: boolean;
  thumbnail?: { width?: number; height?: number; alt_text?: string } | null;
};

const artic: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ data?: AicArtwork[]; config?: { iiif_url?: string } }>(
    `https://api.artic.edu/api/v1/artworks/search?${qs({
      q: ctx.query,
      limit: Math.min(50, ctx.perSource + 4),
      fields: "id,title,image_id,artist_display,artist_title,date_display,place_of_origin,medium_display,is_public_domain,is_boosted,thumbnail",
      "query[term][is_public_domain]": "true",
    })}`,
    // The Art Institute asks API users to identify themselves with this header.
    { headers: { "AIC-User-Agent": ctx.env.MEDIA_USER_AGENT || "ZuponaAI-MediaSearch (https://ai.zupona.com)" } },
  );
  const base = data.config?.iiif_url || "https://www.artic.edu/iiif/2";
  const out: Candidate[] = [];
  for (const a of data.data ?? []) {
    if (!a.image_id || !a.is_public_domain) continue;
    const src = `${base}/${a.image_id}`;
    // The Art Institute's IIIF server only accepts width-based sizes ("843,") up to the original width.
    const originalWidth = a.thumbnail?.width ?? 3000;
    const width = (w: number) => `${src}/full/${Math.min(w, originalWidth)},/0/default.jpg`;
    const fullWidth = Math.min(3000, originalWidth);
    const size =
      a.thumbnail?.width && a.thumbnail?.height
        ? { width: fullWidth, height: Math.round((a.thumbnail.height * fullWidth) / a.thumbnail.width) }
        : { width: undefined, height: undefined };
    out.push({
      nativeId: String(a.id),
      title: plain(a.title, 160) || "Untitled",
      description: plain(a.thumbnail?.alt_text, 300) || [a.place_of_origin, a.medium_display].filter(Boolean).join(" · ") || undefined,
      creator: plain(a.artist_title || a.artist_display, 120) || undefined,
      date: a.date_display,
      pageUrl: `https://www.artic.edu/artworks/${a.id}`,
      thumbnailUrl: width(600),
      previewUrl: width(1686),
      fullUrl: width(fullWidth),
      ...size,
      license: license("cc0"),
      curated: a.is_boosted,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Cleveland Museum of Art                                             */
/* ------------------------------------------------------------------ */

type ClevelandImage = { url: string; width?: string; height?: string };
type ClevelandArtwork = {
  id: number;
  title?: string;
  creation_date?: string;
  url?: string;
  culture?: string[];
  technique?: string;
  type?: string;
  share_license_status?: string;
  creators?: { description?: string }[];
  images?: { web?: ClevelandImage | null; print?: ClevelandImage | null } | null;
  wall_description?: string | null;
  digital_description?: string | null;
};

const cleveland: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ data?: ClevelandArtwork[] }>(
    `https://openaccess-api.clevelandart.org/api/artworks/?${qs({ q: ctx.query, cc0: 1, has_image: 1, limit: Math.min(50, ctx.perSource + 4) })}`,
  );
  const out: Candidate[] = [];
  for (const a of data.data ?? []) {
    const web = a.images?.web;
    const print = a.images?.print ?? web;
    if (!print || a.share_license_status !== "CC0") continue;
    out.push({
      nativeId: String(a.id),
      title: plain(a.title, 160) || "Untitled",
      description: plain(a.digital_description || a.wall_description, 300) || [first(a.culture), a.technique].filter(Boolean).join(" · ") || undefined,
      creator: plain(a.creators?.[0]?.description, 120) || undefined,
      date: a.creation_date,
      pageUrl: a.url || `https://www.clevelandart.org/art/${a.id}`,
      thumbnailUrl: https((web ?? print).url),
      previewUrl: https(print.url),
      fullUrl: https(print.url),
      width: Number(print.width) || undefined,
      height: Number(print.height) || undefined,
      license: license("cc0"),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Rijksmuseum (Linked Art data services)                              */
/* ------------------------------------------------------------------ */

type LinkedNode = Record<string, unknown>;
const ENGLISH = "http://vocab.getty.edu/aat/300388277";

function nodes(value: unknown): LinkedNode[] {
  if (Array.isArray(value)) return value.filter((v): v is LinkedNode => !!v && typeof v === "object");
  return value && typeof value === "object" ? [value as LinkedNode] : [];
}

function isEnglish(node: LinkedNode) {
  return nodes(node.language).some((l) => l.id === ENGLISH);
}

function notation(node: LinkedNode) {
  const values = nodes(node.notation) as { "@language"?: string; "@value"?: string }[];
  return (values.find((v) => v["@language"] === "en") ?? values[0])?.["@value"] ?? (node._label as string | undefined);
}

function rijksRecord(record: LinkedNode): Candidate | null {
  const names = nodes(record.identified_by);
  const titles = names.filter((n) => n.type === "Name" && typeof n.content === "string");
  const title = ((titles.find(isEnglish) ?? titles[0])?.content as string | undefined) ?? "Untitled";
  const objectNumber = names.find((n) => n.type === "Identifier" && typeof n.content === "string")?.content as string | undefined;

  let image: string | undefined;
  let rights: string | undefined;
  for (const subject of nodes(record.subject_of)) {
    for (const carrier of nodes(subject.digitally_carried_by)) {
      const point = nodes(carrier.access_point).map((p) => p.id as string).find((id) => typeof id === "string" && /iiif/.test(id));
      if (point && !image) {
        image = point;
        rights = nodes(carrier.referred_to_by).map((r) => r.content as string).find((c) => typeof c === "string" && /creativecommons|rightsstatements/.test(c));
      }
    }
  }
  if (!image) return null;
  const lic = (rights && parseLicense(rights)) || license("pdm");
  const production = nodes(record.produced_by)[0];
  const makers = [production, ...nodes(production?.part)]
    .filter(Boolean)
    .flatMap((p) => nodes((p as LinkedNode).carried_out_by))
    .map(notation)
    .filter((n): n is string => !!n);
  const timespan = nodes(production?.timespan)[0];
  const date = nodes(timespan?.identified_by).map((n) => n.content as string).find((c) => typeof c === "string");
  const base = image.replace(/\/full\/.*$/, "");
  return {
    nativeId: String(record.id),
    title: plain(title, 160),
    creator: makers[0],
    date,
    pageUrl: objectNumber ? `https://www.rijksmuseum.nl/en/collection/${encodeURIComponent(objectNumber)}` : String(record.id),
    thumbnailUrl: iiif(base, 600),
    previewUrl: iiif(base, 1600),
    fullUrl: iiif(base, 4000),
    sizeHint: 4000,
    license: lic,
  };
}

const rijksmuseum: Searcher = async (ctx) => {
  const find = (field: "title" | "description") =>
    ctx.http.json<{ orderedItems?: { id: string }[] }>(`https://data.rijksmuseum.nl/search/collection?${qs({ [field]: ctx.query, imageAvailable: true })}`);
  let hits = (await find("title")).orderedItems ?? [];
  if (hits.length < 2) hits = [...hits, ...((await find("description")).orderedItems ?? [])];
  const ids = [...new Set(hits.map((h) => h.id))].slice(0, 4);
  const records = await Promise.allSettled(ids.map((id) => ctx.http.json<LinkedNode>(id, { headers: { Accept: "application/ld+json" } })));
  return records.flatMap((r) => (r.status === "fulfilled" ? [rijksRecord(r.value)] : [])).filter((c): c is Candidate => !!c);
};

/* ------------------------------------------------------------------ */
/* SMK – National Gallery of Denmark                                   */
/* ------------------------------------------------------------------ */

type SmkItem = {
  id: string;
  object_number?: string;
  titles?: { title?: string; language?: string }[];
  production?: { creator?: string }[];
  production_date?: { period?: string }[];
  frontend_url?: string;
  image_thumbnail?: string;
  image_iiif_id?: string;
  image_width?: number;
  image_height?: number;
  public_domain?: boolean;
  rights?: string;
  has_image?: boolean;
  object_names?: { name?: string }[];
  techniques?: string[];
};

const smk: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ items?: SmkItem[] }>(
    `https://api.smk.dk/api/v1/art/search/?${qs({
      keys: ctx.query,
      filters: "[public_domain:true],[has_image:true]",
      offset: 0,
      rows: Math.min(50, ctx.perSource + 4),
      lang: "en",
    })}`,
  );
  const out: Candidate[] = [];
  for (const item of data.items ?? []) {
    if (!item.public_domain || !item.image_iiif_id) continue;
    const titles = item.titles ?? [];
    const title = (titles.find((t) => /engelsk|english|en/i.test(t.language ?? "")) ?? titles[0])?.title;
    out.push({
      nativeId: item.id,
      title: plain(title, 160) || "Untitled",
      description: [item.object_names?.[0]?.name, item.techniques?.[0]].filter(Boolean).join(" · ") || undefined,
      creator: item.production?.[0]?.creator,
      date: item.production_date?.[0]?.period,
      pageUrl: item.frontend_url || `https://open.smk.dk/artwork/image/${item.object_number}`,
      thumbnailUrl: item.image_thumbnail || iiif(item.image_iiif_id, 600),
      previewUrl: iiif(item.image_iiif_id, 1600),
      fullUrl: iiif(item.image_iiif_id, 3840),
      ...fit(item.image_width, item.image_height, 3840),
      license: (item.rights && parseLicense(item.rights)) || license("pdm"),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Minneapolis Institute of Art                                        */
/* ------------------------------------------------------------------ */

type MiaHit = {
  _id: string;
  _source: {
    id?: number;
    title?: string;
    artist?: string;
    dated?: string;
    medium?: string;
    culture?: string;
    country?: string;
    description?: string;
    image?: string;
    image_width?: number;
    image_height?: number;
    rights_type?: string;
  };
};

const mia: Searcher = async (ctx) => {
  const query = `${encodeURIComponent(ctx.query)}%20image:valid%20rights_type:%22Public%20Domain%22`;
  const data = await ctx.http.json<{ hits?: { hits?: MiaHit[] } }>(`https://search.artsmia.org/${query}?size=${Math.min(40, ctx.perSource + 4)}`);
  const out: Candidate[] = [];
  for (const hit of data.hits?.hits ?? []) {
    const s = hit._source;
    const id = s.id ?? Number(hit._id);
    if (!id || s.image !== "valid" || s.rights_type !== "Public Domain") continue;
    out.push({
      nativeId: String(id),
      title: plain(s.title, 160) || "Untitled",
      description: plain(s.description, 300) || [s.culture || s.country, s.medium].filter(Boolean).join(" · ") || undefined,
      creator: plain(s.artist, 120) || undefined,
      date: s.dated,
      pageUrl: `https://collections.artsmia.org/art/${id}`,
      thumbnailUrl: `https://4.api.artsmia.org/800/${id}.jpg`,
      previewUrl: `https://4.api.artsmia.org/800/${id}.jpg`,
      fullUrl: `https://4.api.artsmia.org/full/${id}.jpg`,
      width: s.image_width,
      height: s.image_height,
      license: license("public-domain"),
    });
  }
  return out;
};

export const museums = { met, artic, cleveland, rijksmuseum, smk, mia };
