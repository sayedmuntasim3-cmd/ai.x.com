// Libraries and archives: Library of Congress, Internet Archive, Wellcome Collection, DigitalNZ,
// Swedish Open Cultural Heritage (K-samsök), Digital Commonwealth, and the keyed APIs of
// Europeana, Smithsonian Open Access, the New York Public Library and the US National Archives.

import { first, https, plain, qs } from "../http";
import { license, parseLicense } from "../licenses";
import type { Candidate, License, Searcher } from "../types";

const iiif = (base: string, box: number) => `${base.replace(/\/$/, "")}/full/!${box},${box}/0/default.jpg`;

/* ------------------------------------------------------------------ */
/* Library of Congress                                                 */
/* ------------------------------------------------------------------ */

type LocResult = {
  id: string;
  url?: string;
  title?: string;
  date?: string;
  description?: string[];
  image_url?: string[];
  contributor?: string[];
  online_format?: string[];
  access_restricted?: boolean;
  item?: { rights_advisory?: string | string[]; rights_information?: string | string[]; creators?: { title?: string }[] };
  rights_information?: string | string[];
};

const loc: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ results?: LocResult[] }>(
    `https://www.loc.gov/photos/?${qs({ q: ctx.query, fo: "json", c: Math.min(100, ctx.perSource * 2), at: "results" })}`,
  );
  const out: Candidate[] = [];
  for (const r of data.results ?? []) {
    if (r.access_restricted || !r.image_url?.length) continue;
    if (r.online_format && !r.online_format.includes("image")) continue;
    // Only items the Library itself marks as having no known restrictions on publication.
    const rights = [r.item?.rights_advisory, r.item?.rights_information, r.rights_information].flat().filter(Boolean).join(" ");
    if (!/^\s*no known restrictions/i.test(rights)) continue;
    const sized = r.image_url
      .map((u) => {
        const m = u.match(/#h=(\d+)&w=(\d+)/);
        return { url: u.replace(/#.*$/, ""), height: m ? Number(m[1]) : 0, width: m ? Number(m[2]) : 0 };
      })
      .filter((s) => /\.(jpe?g|png)$/i.test(s.url))
      .sort((a, b) => b.width * b.height - a.width * a.height);
    const full = sized[0];
    if (!full) continue;
    const thumb = sized.find((s) => s.width && s.width <= 700) ?? full;
    out.push({
      nativeId: r.id,
      title: plain(r.title, 160) || "Untitled",
      description: plain(first(r.description), 300) || undefined,
      creator: plain(r.item?.creators?.[0]?.title || first(r.contributor), 120) || undefined,
      date: r.date?.slice(0, 4),
      pageUrl: https(r.url || r.id),
      thumbnailUrl: https(thumb.url),
      previewUrl: https(full.url),
      fullUrl: https(full.url),
      width: full.width || undefined,
      height: full.height || undefined,
      license: license("no-known-restrictions", { label: "No known restrictions (LoC)" }),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Internet Archive                                                    */
/* ------------------------------------------------------------------ */

type ArchiveDoc = { identifier: string; title?: string | string[]; licenseurl?: string; creator?: string | string[]; date?: string; description?: string | string[] };

const internetArchive: Searcher = async (ctx) => {
  const licences = ["*publicdomain*"];
  if (ctx.rights !== "no-attribution") licences.push("*licenses\\/by\\/*");
  if (ctx.rights === "share-alike") licences.push("*licenses\\/by-sa\\/*");
  // Escape Lucene syntax in the visitor's words; Cleveland's uploads are skipped (searched directly).
  const words = ctx.query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ");
  const q = `(${words}) AND mediatype:image AND licenseurl:(${licences.join(" OR ")}) AND -identifier:clevelandart*`;
  const data = await ctx.http.json<{ response?: { docs?: ArchiveDoc[] } }>(
    `https://archive.org/advancedsearch.php?${qs({
      q,
      "fl[]": ["identifier", "title", "licenseurl", "creator", "date", "description"],
      rows: Math.min(50, ctx.perSource + 4),
      output: "json",
    })}`,
  );
  const out: Candidate[] = [];
  for (const d of data.response?.docs ?? []) {
    const lic = parseLicense(d.licenseurl);
    if (!lic) continue;
    const base = `https://iiif.archive.org/iiif/${encodeURIComponent(d.identifier)}`;
    out.push({
      nativeId: d.identifier,
      title: plain(first(d.title), 160) || d.identifier,
      description: plain(first(d.description), 300) || undefined,
      creator: plain(first(d.creator), 120) || undefined,
      date: d.date?.slice(0, 10),
      pageUrl: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 4000),
      sizeHint: 1600,
      license: lic,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Wellcome Collection                                                 */
/* ------------------------------------------------------------------ */

type WellcomeImage = {
  id: string;
  aspectRatio?: number;
  locations?: { url: string; license?: { id: string; label?: string; url?: string }; credit?: string }[];
  source?: { id: string; title?: string; contributors?: { agent?: { label?: string } }[] };
};

const WELLCOME_LICENCES: Record<string, () => License> = {
  "cc-0": () => license("cc0"),
  pdm: () => license("pdm"),
  "cc-by": () => license("cc-by", { version: "4.0" }),
  "cc-by-sa": () => license("cc-by-sa", { version: "4.0" }),
};

const wellcome: Searcher = async (ctx) => {
  const allowedIds = ["cc-0", "pdm"];
  if (ctx.rights !== "no-attribution") allowedIds.push("cc-by");
  if (ctx.rights === "share-alike") allowedIds.push("cc-by-sa");
  const data = await ctx.http.json<{ results?: WellcomeImage[] }>(
    `https://api.wellcomecollection.org/catalogue/v2/images?${qs({
      query: ctx.query,
      pageSize: Math.min(100, ctx.perSource + 4),
      "locations.license": allowedIds.join(","),
      include: "source.contributors",
    })}`,
  );
  const out: Candidate[] = [];
  for (const img of data.results ?? []) {
    const loc = img.locations?.[0];
    const make = loc?.license && WELLCOME_LICENCES[loc.license.id];
    if (!loc || !make) continue;
    const base = loc.url.replace(/\/info\.json$/, "");
    out.push({
      nativeId: img.id,
      title: plain(img.source?.title, 160) || "Untitled",
      creator: plain(img.source?.contributors?.[0]?.agent?.label, 120) || undefined,
      pageUrl: img.source ? `https://wellcomecollection.org/works/${img.source.id}/images?id=${img.id}` : "https://wellcomecollection.org/images",
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 3840),
      aspect: img.aspectRatio,
      sizeHint: 3000,
      license: make(),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* DigitalNZ                                                           */
/* ------------------------------------------------------------------ */

type DnzRecord = {
  id: number;
  title?: string;
  description?: string;
  creator?: string[];
  rights?: string;
  copyright?: string[];
  usage?: string[];
  thumbnail_url?: string;
  large_thumbnail_url?: string;
  object_url?: string | null;
  landing_url?: string;
  display_content_partner?: string;
  date?: string[];
};

const digitalnz: Searcher = async (ctx) => {
  const key = ctx.env.DIGITALNZ_API_KEY;
  const data = await ctx.http.json<{ search?: { results?: DnzRecord[] } }>(
    `https://api.digitalnz.org/records.json?${qs({
      text: ctx.query,
      per_page: Math.min(100, ctx.perSource + 4),
      "and[category][]": "Images",
      "and[usage][]": ["Use commercially", "Modify"],
      api_key: key,
    })}`,
  );
  const out: Candidate[] = [];
  for (const r of data.search?.results ?? []) {
    const image = r.object_url || r.large_thumbnail_url;
    if (!image || !r.landing_url) continue;
    const rights = r.rights ?? "";
    const statement = [rights, ...(r.copyright ?? [])].join(" ");
    // Only licence statements we can read with confidence; free text is skipped.
    const lic = /creative ?commons|cc[ -]|cc0|public domain|no known/i.test(statement) ? parseLicense(rights) ?? parseLicense(statement) : null;
    if (!lic) continue;
    out.push({
      nativeId: String(r.id),
      title: plain(r.title, 160) || "Untitled",
      description: plain(r.description, 300) || undefined,
      creator: plain(first(r.creator), 120) || undefined,
      date: first(r.date)?.slice(0, 4),
      pageUrl: https(r.landing_url),
      thumbnailUrl: https(r.thumbnail_url || image),
      previewUrl: https(image),
      fullUrl: https(image),
      sizeHint: r.object_url ? 1600 : 900,
      license: lic,
      collection: r.display_content_partner,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Swedish Open Cultural Heritage (K-samsök)                           */
/* ------------------------------------------------------------------ */

type KNode = Record<string, unknown> & { "@type"?: string; "@id"?: string };

const ksamsok: Searcher = async (ctx) => {
  const phrase = ctx.query.replace(/["\\]/g, " ").trim();
  const data = await ctx.http.json<{ result?: { records?: { record?: { "@graph"?: KNode[] | KNode } }[] | { record?: { "@graph"?: KNode[] } } } }>(
    `https://kulturarvsdata.se/ksamsok/api?${qs({
      method: "search",
      version: "1.1",
      hitsPerPage: Math.min(50, ctx.perSource + 6),
      query: `text="${phrase}" AND thumbnailExists=j`,
    })}`,
  );
  const records = [data.result?.records ?? []].flat();
  const out: Candidate[] = [];
  for (const rec of records) {
    const graph = [rec?.record?.["@graph"] ?? []].flat() as KNode[];
    const entity = graph.find((n) => n["@type"] === "ns1:Entity");
    const image = graph.find((n) => n["@type"] === "ns1:Image" && n["ns1:highresSource"]);
    if (!entity || !image) continue;
    const licUrl = (image["ns1:mediaLicenseUrl"] as { "@id"?: string } | undefined)?.["@id"];
    const licCode = (image["ns1:mediaLicense"] as { "@id"?: string } | undefined)?.["@id"];
    const lic = parseLicense(licUrl) ?? parseLicense(licCode);
    if (!lic) continue;
    const high = String(image["ns1:highresSource"]);
    const label = plain(String(entity["ns1:itemLabel"] ?? ""), 160);
    const keywords = [entity["ns1:itemKeyWord"]].flat().filter((k): k is string => typeof k === "string");
    out.push({
      nativeId: String(entity["@id"] ?? high),
      title: label || "Untitled",
      pageUrl: https(String(entity["ns1:url"] ?? entity["@id"] ?? "")),
      thumbnailUrl: https(String(image["ns1:lowresSource"] ?? high)),
      previewUrl: https(high),
      fullUrl: https(high.replace(/dimension=\d+x\d+/, "dimension=2400x2400")),
      sizeHint: 1600,
      license: lic,
      tags: keywords.slice(0, 12),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Digital Commonwealth (Massachusetts)                                */
/* ------------------------------------------------------------------ */

type DcRecord = {
  id: string;
  attributes: {
    title_info_primary_tsi?: string;
    date_tsim?: string[];
    name_tsim?: string[];
    abstract_tsi?: string;
    subject_topic_tsim?: string[];
    exemplary_image_ssi?: string;
    identifier_uri_ss?: string;
    institution_name_ssi?: string;
    license_ss?: string;
    rights_ss?: string;
  };
};

const digitalCommonwealth: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ data?: DcRecord[] }>(
    `https://www.digitalcommonwealth.org/search.json?${qs({
      q: ctx.query,
      per_page: Math.min(50, ctx.perSource + 4),
      "f[reuse_allowed_ssi][]": "no restrictions",
    })}`,
  );
  const out: Candidate[] = [];
  for (const r of data.data ?? []) {
    const a = r.attributes;
    if (!a.exemplary_image_ssi) continue;
    const lic = parseLicense(a.license_ss) ?? license("no-known-restrictions");
    const base = `https://iiif.digitalcommonwealth.org/iiif/2/${encodeURIComponent(a.exemplary_image_ssi)}`;
    out.push({
      nativeId: r.id,
      title: plain(a.title_info_primary_tsi, 160) || "Untitled",
      description: plain(a.abstract_tsi, 300) || undefined,
      creator: plain(first(a.name_tsim), 120) || undefined,
      date: first(a.date_tsim),
      pageUrl: https(a.identifier_uri_ss) || `https://www.digitalcommonwealth.org/search/${r.id}`,
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 3000),
      sizeHint: 2500,
      license: lic,
      collection: a.institution_name_ssi,
      tags: a.subject_topic_tsim?.slice(0, 12),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Europeana (free key)                                                */
/* ------------------------------------------------------------------ */

type EuropeanaItem = {
  id: string;
  title?: string[];
  dcCreator?: string[];
  dcDescription?: string[];
  rights?: string[];
  edmIsShownBy?: string[];
  edmPreview?: string[];
  guid?: string;
  dataProvider?: string[];
  year?: string[];
};

const europeana: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ items?: EuropeanaItem[] }>(
    `https://api.europeana.eu/record/v2/search.json?${qs({
      wskey: ctx.env.EUROPEANA_API_KEY,
      query: ctx.query,
      media: true,
      thumbnail: true,
      reusability: "open",
      qf: "TYPE:IMAGE",
      rows: Math.min(100, ctx.perSource + 4),
      profile: "rich",
    })}`,
  );
  const out: Candidate[] = [];
  for (const item of data.items ?? []) {
    const full = first(item.edmIsShownBy);
    const lic = parseLicense(first(item.rights));
    if (!full || !lic) continue;
    out.push({
      nativeId: item.id,
      title: plain(first(item.title), 160) || "Untitled",
      description: plain(first(item.dcDescription), 300) || undefined,
      creator: plain(first(item.dcCreator), 120) || undefined,
      date: first(item.year),
      pageUrl: (item.guid ?? `https://www.europeana.eu/item${item.id}`).replace(/\?.*$/, ""),
      thumbnailUrl: https(first(item.edmPreview) ?? full),
      previewUrl: https(full),
      fullUrl: https(full),
      sizeHint: 2000,
      license: lic,
      collection: first(item.dataProvider),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* Smithsonian Open Access (free api.data.gov key)                     */
/* ------------------------------------------------------------------ */

type SiMedia = { type?: string; idsId?: string; content?: string; thumbnail?: string; usage?: { access?: string }; resources?: { label?: string; url?: string; width?: number; height?: number }[] };
type SiRow = {
  id: string;
  title?: string;
  unitCode?: string;
  content?: {
    descriptiveNonRepeating?: { record_link?: string; data_source?: string; title?: { content?: string }; online_media?: { media?: SiMedia[] } };
    freetext?: { name?: { content?: string }[]; date?: { content?: string }[]; notes?: { content?: string }[] };
  };
};

const smithsonian: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ response?: { rows?: SiRow[] } }>(
    `https://api.si.edu/openaccess/api/v1.0/search?${qs({
      q: `${ctx.query} AND online_media_type:"Images" AND media_usage:"CC0"`,
      rows: Math.min(100, ctx.perSource + 4),
      api_key: ctx.env.SMITHSONIAN_API_KEY,
    })}`,
  );
  const out: Candidate[] = [];
  for (const row of data.response?.rows ?? []) {
    const d = row.content?.descriptiveNonRepeating;
    const media = d?.online_media?.media?.find((m) => m.type === "Images" && m.usage?.access === "CC0" && (m.idsId || m.content));
    if (!media) continue;
    const ids = media.idsId ? (max: number) => `https://ids.si.edu/ids/deliveryService?id=${encodeURIComponent(media.idsId!)}&max=${max}` : null;
    const hi = media.resources?.find((r) => /high-resolution jpeg/i.test(r.label ?? "") && r.url);
    out.push({
      nativeId: row.id,
      title: plain(row.title || d?.title?.content, 160) || "Untitled",
      description: plain(row.content?.freetext?.notes?.[0]?.content, 300) || undefined,
      creator: plain(row.content?.freetext?.name?.[0]?.content, 120) || undefined,
      date: row.content?.freetext?.date?.[0]?.content,
      pageUrl: https(d?.record_link) || `https://collections.si.edu/search/detail/${row.id}`,
      thumbnailUrl: ids ? ids(600) : https(media.thumbnail || media.content),
      previewUrl: ids ? ids(1600) : https(media.content),
      fullUrl: hi?.url ? https(hi.url) : ids ? ids(4000) : https(media.content),
      width: hi?.width,
      height: hi?.height,
      sizeHint: 3000,
      license: license("cc0"),
      collection: d?.data_source,
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* New York Public Library (free token)                                */
/* ------------------------------------------------------------------ */

type NyplItem = { uuid: string; title?: string; imageID?: string; itemLink?: string; typeOfResource?: string; dateDigitized?: string };

const nypl: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ nyplAPI?: { response?: { result?: NyplItem[] | NyplItem } } }>(
    `https://api.repo.nypl.org/api/v2/items/search?${qs({ q: ctx.query, publicDomainOnly: true, per_page: Math.min(50, ctx.perSource + 4) })}`,
    { headers: { Authorization: `Token token="${ctx.env.NYPL_API_TOKEN}"` } },
  );
  const out: Candidate[] = [];
  for (const item of [data.nyplAPI?.response?.result ?? []].flat()) {
    if (!item.imageID) continue;
    const base = `https://iiif.nypl.org/iiif/2/${encodeURIComponent(item.imageID)}`;
    out.push({
      nativeId: item.uuid,
      title: plain(item.title, 160) || "Untitled",
      pageUrl: https(item.itemLink) || `https://digitalcollections.nypl.org/items/${item.uuid}`,
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 4000),
      sizeHint: 2500,
      license: license("public-domain"),
      collection: "New York Public Library",
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* US National Archives catalog v2 (free key)                          */
/* ------------------------------------------------------------------ */

type NaraRecord = {
  naId?: number | string;
  title?: string;
  scopeAndContentNote?: string;
  productionDates?: { logicalDate?: string }[];
  creators?: { heading?: string }[];
  useRestriction?: { status?: string };
  digitalObjects?: { objectUrl?: string; objectType?: string; objectFilename?: string }[];
};

const nara: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ body?: { hits?: { hits?: { _source?: { record?: NaraRecord } }[] } } }>(
    `https://catalog.archives.gov/api/v2/records/search?${qs({
      q: ctx.query,
      availableOnline: true,
      typeOfMaterials: "Photographs and other Graphic Materials",
      limit: Math.min(50, ctx.perSource + 4),
    })}`,
    { headers: { "x-api-key": ctx.env.NARA_API_KEY ?? "" } },
  );
  const out: Candidate[] = [];
  for (const hit of data.body?.hits?.hits ?? []) {
    const r = hit._source?.record;
    if (!r?.naId) continue;
    const status = r.useRestriction?.status;
    if (status && !/^unrestricted$/i.test(status)) continue;
    const image = r.digitalObjects?.find((o) => /image|jpe?g/i.test(`${o.objectType} ${o.objectFilename}`) && o.objectUrl);
    if (!image?.objectUrl) continue;
    out.push({
      nativeId: String(r.naId),
      title: plain(r.title, 160) || "Untitled",
      description: plain(r.scopeAndContentNote, 300) || undefined,
      creator: plain(r.creators?.[0]?.heading, 120) || undefined,
      date: r.productionDates?.[0]?.logicalDate?.slice(0, 10),
      pageUrl: `https://catalog.archives.gov/id/${r.naId}`,
      thumbnailUrl: https(image.objectUrl),
      previewUrl: https(image.objectUrl),
      fullUrl: https(image.objectUrl),
      sizeHint: 2500,
      license: license("us-government", { label: "Public domain (US National Archives)" }),
      collection: "US National Archives",
    });
  }
  return out;
};

export const libraries = {
  loc,
  "internet-archive": internetArchive,
  wellcome,
  digitalnz,
  ksamsok,
  "digital-commonwealth": digitalCommonwealth,
  europeana,
  smithsonian,
  nypl,
  nara,
};
