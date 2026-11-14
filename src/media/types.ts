// Shared types for Zupona's federated documentary image search.
// The library has no dependencies and only uses `fetch`, so it runs in Cloudflare Workers,
// Next.js route handlers and Node 18+ alike.

/** How much the licence may ask of us. Every level allows commercial use and editing (crop, pan, zoom, grade). */
export type RightsLevel =
  /** Public domain, CC0 and "free to use" stock licences: no credit legally required. */
  | "no-attribution"
  /** Adds CC BY: free to use with a credit line. */
  | "attribution"
  /** Adds CC BY-SA: credit, and an edited version must carry the same licence. */
  | "share-alike";

export type LicenseCode =
  | "cc0"
  | "pdm"
  | "public-domain"
  | "us-government"
  | "no-known-restrictions"
  | "cc-by"
  | "cc-by-sa"
  | "unsplash"
  | "pixabay";

export type License = {
  code: LicenseCode;
  /** Human label such as "CC BY 4.0" or "Public domain". */
  label: string;
  url?: string;
  /** A credit line is a condition of the licence. */
  attribution: boolean;
  /** Edited versions must be shared under the same licence. */
  shareAlike: boolean;
};

export type Orientation = "any" | "landscape" | "portrait";

export type SourceGroup = "Encyclopedic" | "Space" | "Museums" | "Libraries & archives" | "Nature" | "Photography";

/** Documentary categories used on the site; providers say which ones they are strongest in. */
export type Topic = "nature" | "ocean" | "space" | "history" | "science" | "culture";

/** One image as a provider returns it, before ranking. */
export type Candidate = {
  /** Provider-native id; made globally unique by the search layer. */
  nativeId: string;
  title: string;
  description?: string;
  creator?: string;
  date?: string;
  /** Page people can open to see the original record (also the attribution link). */
  pageUrl: string;
  /** Small image for grids, roughly 300 to 700 px. */
  thumbnailUrl: string;
  /** Screen-sized image, roughly 1000 to 1600 px. */
  previewUrl: string;
  /** Largest practical file for rendering a film. */
  fullUrl: string;
  /** Pixel size of `fullUrl` when known. */
  width?: number;
  height?: number;
  /** Width / height when the exact size is unknown. */
  aspect?: number;
  /** Typical long edge of `fullUrl` for this source when the exact size is unknown. */
  sizeHint?: number;
  license: License;
  /** Name of the collection inside an aggregator, e.g. "StockSnap" for an Openverse result. */
  collection?: string;
  tags?: string[];
  /** Editor-picked: a Wikimedia featured picture, a Wikipedia lead image, a museum highlight. */
  curated?: boolean;
  /** Ready-made credit line if the source supplies one. */
  credit?: string;
  /** Unsplash asks for this URL to be called when a photo is actually used. */
  downloadTrackingUrl?: string;
};

export type MediaResult = Omit<Candidate, "nativeId"> & {
  id: string;
  source: string;
  sourceName: string;
  /** Credit line ready for end titles. */
  attribution: string;
  /** "4K", "HD" or "SD" from the long edge of the full file, or "?" when unknown. */
  quality: "4K" | "HD" | "SD" | "?";
  score: number;
};

export type SourceStatus = "pending" | "ok" | "empty" | "error" | "timeout" | "needs-key" | "skipped";

export type SourceReport = {
  id: string;
  name: string;
  status: SourceStatus;
  /** Results this source contributed after filtering and de-duplication. */
  count: number;
  /** Raw results before filtering. */
  found: number;
  ms: number;
  error?: string;
};

export type SearchOptions = {
  query: string;
  /** Documentary category; sources that are strong in it get a small boost. */
  topic?: Topic;
  rights?: RightsLevel;
  orientation?: Orientation;
  /** Smallest acceptable long edge in pixels for images whose size is known. */
  minSize?: number;
  /** Limit the search to these source ids. */
  sources?: string[];
  /** Results requested from each source. */
  perSource?: number;
  /** Results returned in total. */
  limit?: number;
  /** Time each source gets before it is reported as a timeout. */
  timeoutMs?: number;
};

export type SearchResponse = {
  query: string;
  rights: RightsLevel;
  minSize: number;
  results: MediaResult[];
  sources: SourceReport[];
  /** Results found before filtering, ranking and de-duplication. */
  candidates: number;
  tookMs: number;
};

/** Environment values the providers read (Cloudflare secrets, process.env, ...). */
export type MediaEnv = Record<string, string | undefined>;

export type Http = {
  json<T = unknown>(url: string, init?: HttpInit): Promise<T>;
  text(url: string, init?: HttpInit): Promise<string>;
};

export type HttpInit = {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Seconds the edge may cache the upstream response (Cloudflare only). */
  cacheTtl?: number;
};

export type ProviderContext = {
  query: string;
  /** Lower-cased search terms without stop words. */
  terms: string[];
  perSource: number;
  rights: RightsLevel;
  orientation: Orientation;
  minSize: number;
  env: MediaEnv;
  http: Http;
};

/** Calls one source and maps its records to candidates. Throws on failure; the search layer reports it. */
export type Searcher = (ctx: ProviderContext) => Promise<Candidate[]>;
