// Generated from sayedmuntasim3-cmd/ai.x.com src/media (branch ccr-c21902ce-p7sii2) with esbuild. Do not edit by hand.

// ../ai.x.com/src/media/catalog.ts
var SOURCES = [
  // Encyclopedic
  {
    id: "wikimedia-commons",
    name: "Wikimedia Commons",
    homepage: "https://commons.wikimedia.org",
    group: "Encyclopedic",
    holds: "The free media library behind Wikipedia: photos, maps, scans, featured pictures",
    scale: "100M+ files",
    topics: ["nature", "ocean", "space", "history", "science", "culture"],
    quality: 0.8
  },
  {
    id: "wikipedia",
    name: "Wikipedia lead images",
    homepage: "https://en.wikipedia.org",
    group: "Encyclopedic",
    holds: "The image editors chose to lead each matching article",
    scale: "6M+ articles",
    topics: ["history", "culture", "science", "nature", "space", "ocean"],
    quality: 0.82
  },
  {
    id: "openverse",
    name: "Openverse collections",
    homepage: "https://openverse.org",
    group: "Encyclopedic",
    holds: "40+ open collections in one index: Rawpixel, StockSnap, Geograph, Brooklyn Museum, Science Museum, Smithsonian, SpaceX and more",
    scale: "25M+ images",
    topics: ["culture", "history", "science", "nature", "space", "ocean"],
    quality: 0.66,
    optionalKeys: ["OPENVERSE_CLIENT_ID", "OPENVERSE_CLIENT_SECRET"],
    signup: "https://api.openverse.org/v1/#tag/auth/operation/register",
    slow: true
  },
  // Space
  {
    id: "nasa",
    name: "NASA Image and Video Library",
    homepage: "https://images.nasa.gov",
    group: "Space",
    holds: "Missions, astronauts, Earth from orbit, telescopes",
    scale: "140,000+ images",
    topics: ["space", "science", "ocean"],
    quality: 0.86
  },
  {
    id: "nasa-svs",
    name: "NASA Scientific Visualization Studio",
    homepage: "https://svs.gsfc.nasa.gov",
    group: "Space",
    holds: "Data visualisations of Earth, climate, the Sun and planets",
    scale: "10,000+ visualisations",
    topics: ["space", "science", "ocean"],
    quality: 0.78
  },
  {
    id: "esa-hubble",
    name: "ESA/Hubble",
    homepage: "https://esahubble.org/images/",
    group: "Space",
    holds: "Hubble Space Telescope releases in full resolution",
    scale: "Full Hubble archive",
    topics: ["space", "science"],
    quality: 0.95,
    slow: true
  },
  {
    id: "esa-webb",
    name: "ESA/Webb",
    homepage: "https://esawebb.org/images/",
    group: "Space",
    holds: "James Webb Space Telescope releases in full resolution",
    scale: "Full Webb archive",
    topics: ["space", "science"],
    quality: 0.95,
    slow: true
  },
  {
    id: "eso",
    name: "European Southern Observatory",
    homepage: "https://www.eso.org/public/images/",
    group: "Space",
    holds: "VLT and ALMA images, observatory landscapes under the Chilean night sky",
    scale: "Full ESO archive",
    topics: ["space", "science"],
    quality: 0.93,
    slow: true
  },
  {
    id: "noirlab",
    name: "NOIRLab",
    homepage: "https://noirlab.edu/public/images/",
    group: "Space",
    holds: "Gemini, Kitt Peak, Cerro Tololo and Rubin Observatory images",
    scale: "Full NOIRLab archive",
    topics: ["space", "science"],
    quality: 0.9,
    slow: true
  },
  // Museums
  {
    id: "met",
    name: "The Metropolitan Museum of Art",
    homepage: "https://www.metmuseum.org/art/collection",
    group: "Museums",
    holds: "5,000 years of art and artefacts from every culture",
    scale: "490,000+ CC0 images",
    topics: ["history", "culture"],
    quality: 0.88
  },
  {
    id: "artic",
    name: "Art Institute of Chicago",
    homepage: "https://www.artic.edu/collection",
    group: "Museums",
    holds: "Paintings, prints, photographs and design",
    scale: "60,000+ CC0 works",
    topics: ["history", "culture"],
    quality: 0.86
  },
  {
    id: "cleveland",
    name: "Cleveland Museum of Art",
    homepage: "https://www.clevelandart.org/art/collection/search",
    group: "Museums",
    holds: "World art from antiquity to today, print-resolution files",
    scale: "60,000+ CC0 works",
    topics: ["history", "culture"],
    quality: 0.86
  },
  {
    id: "rijksmuseum",
    name: "Rijksmuseum",
    homepage: "https://www.rijksmuseum.nl/en/collection",
    group: "Museums",
    holds: "Dutch Golden Age, maritime history, early photography",
    scale: "700,000+ public domain images",
    topics: ["history", "culture", "ocean"],
    quality: 0.9
  },
  {
    id: "smk",
    name: "SMK \u2013 National Gallery of Denmark",
    homepage: "https://open.smk.dk",
    group: "Museums",
    holds: "European paintings, drawings and prints in very high resolution",
    scale: "50,000+ public domain works",
    topics: ["history", "culture"],
    quality: 0.86
  },
  {
    id: "mia",
    name: "Minneapolis Institute of Art",
    homepage: "https://collections.artsmia.org",
    group: "Museums",
    holds: "Asian, African and European art, photography",
    scale: "Public domain collection",
    topics: ["history", "culture"],
    quality: 0.82
  },
  // Libraries & archives
  {
    id: "loc",
    name: "Library of Congress",
    homepage: "https://www.loc.gov/photos/",
    group: "Libraries & archives",
    holds: "Historic photographs, prints, posters and drawings marked free to use",
    scale: "1M+ online images",
    topics: ["history", "culture"],
    quality: 0.74
  },
  {
    id: "internet-archive",
    name: "Internet Archive",
    homepage: "https://archive.org/details/image",
    group: "Libraries & archives",
    holds: "Community uploads and digitised collections (public domain and CC only)",
    scale: "Millions of items",
    topics: ["history", "culture", "science"],
    quality: 0.46
  },
  {
    id: "wellcome",
    name: "Wellcome Collection",
    homepage: "https://wellcomecollection.org/images",
    group: "Libraries & archives",
    holds: "Medicine, anatomy, the body and the history of science",
    scale: "100,000+ images",
    topics: ["science", "history"],
    quality: 0.78
  },
  {
    id: "digitalnz",
    name: "DigitalNZ",
    homepage: "https://digitalnz.org",
    group: "Libraries & archives",
    holds: "New Zealand libraries, museums and Te Papa",
    scale: "30M+ records",
    topics: ["history", "culture", "nature", "ocean"],
    quality: 0.52,
    optionalKeys: ["DIGITALNZ_API_KEY"],
    signup: "https://digitalnz.org/developers"
  },
  {
    id: "ksamsok",
    name: "Swedish Open Cultural Heritage",
    homepage: "https://www.raa.se/in-english/digital-services/about-k-samsok/",
    group: "Libraries & archives",
    holds: "Swedish museums and archives, Viking to industrial age",
    scale: "Millions of records",
    topics: ["history", "culture"],
    quality: 0.55
  },
  {
    id: "digital-commonwealth",
    name: "Digital Commonwealth",
    homepage: "https://www.digitalcommonwealth.org",
    group: "Libraries & archives",
    holds: "Massachusetts libraries and archives: photos, maps, postcards",
    scale: "Hundreds of thousands of items",
    topics: ["history", "culture"],
    quality: 0.62
  },
  {
    id: "europeana",
    name: "Europeana",
    homepage: "https://www.europeana.eu",
    group: "Libraries & archives",
    holds: "Europe's museums, libraries and archives in one place",
    scale: "13M+ open images",
    topics: ["history", "culture", "science"],
    quality: 0.7,
    keys: ["EUROPEANA_API_KEY"],
    signup: "https://pro.europeana.eu/page/get-api"
  },
  {
    id: "smithsonian",
    name: "Smithsonian Open Access",
    homepage: "https://www.si.edu/openaccess",
    group: "Libraries & archives",
    holds: "21 Smithsonian museums: air and space, natural history, American history",
    scale: "5M+ CC0 images",
    topics: ["history", "science", "space", "nature", "culture"],
    quality: 0.8,
    keys: ["SMITHSONIAN_API_KEY"],
    signup: "https://api.data.gov/signup/"
  },
  {
    id: "nypl",
    name: "New York Public Library",
    homepage: "https://digitalcollections.nypl.org",
    group: "Libraries & archives",
    holds: "Maps, photographs, menus, prints and manuscripts",
    scale: "180,000+ public domain items",
    topics: ["history", "culture"],
    quality: 0.72,
    keys: ["NYPL_API_TOKEN"],
    signup: "https://api.repo.nypl.org/sign_up"
  },
  {
    id: "nara",
    name: "US National Archives",
    homepage: "https://catalog.archives.gov",
    group: "Libraries & archives",
    holds: "Federal photographs: wars, presidents, the space race, the land",
    scale: "Millions of digitised records",
    topics: ["history", "space", "nature"],
    quality: 0.72,
    keys: ["NARA_API_KEY"],
    signup: "https://www.archives.gov/research/catalog/help/api"
  },
  {
    id: "dvids",
    name: "DVIDS (US military media)",
    homepage: "https://www.dvidshub.net",
    group: "Libraries & archives",
    holds: "US military photos and video stills: bridges, dams, ports, construction, disaster relief",
    scale: "Millions of public domain assets",
    topics: ["history", "science"],
    quality: 0.7,
    keys: ["DVIDS_API_KEY"],
    signup: "https://api.dvidshub.net/docs/authentication"
  },
  // Nature
  {
    id: "inaturalist",
    name: "iNaturalist",
    homepage: "https://www.inaturalist.org",
    group: "Nature",
    holds: "Research-grade wildlife and plant photos from naturalists worldwide",
    scale: "260M+ photos",
    topics: ["nature", "ocean"],
    quality: 0.68
  },
  // Photography
  {
    id: "flickr",
    name: "Flickr (Creative Commons)",
    homepage: "https://www.flickr.com/creativecommons/",
    group: "Photography",
    holds: "Photographers worldwide sharing under CC BY, CC0 and public domain",
    scale: "500M+ CC photos",
    topics: ["nature", "ocean", "culture", "history", "science", "space"],
    quality: 0.66,
    optionalKeys: ["FLICKR_API_KEY"],
    signup: "https://www.flickr.com/services/apps/create/",
    // Slow only without a key, when it goes through Openverse.
    slow: true
  },
  {
    id: "wordpress-photos",
    name: "WordPress Photo Directory",
    homepage: "https://wordpress.org/photos/",
    group: "Photography",
    holds: "Reviewed CC0 photos, full camera resolution",
    scale: "40,000+ photos",
    topics: ["nature", "culture", "ocean"],
    quality: 0.7
  },
  {
    id: "unsplash",
    name: "Unsplash",
    homepage: "https://unsplash.com",
    group: "Photography",
    holds: "Professional photography, landscapes, cities and people",
    scale: "5M+ photos",
    topics: ["nature", "ocean", "culture", "space"],
    quality: 0.88,
    keys: ["UNSPLASH_ACCESS_KEY"],
    signup: "https://unsplash.com/oauth/applications"
  },
  {
    id: "pixabay",
    name: "Pixabay",
    homepage: "https://pixabay.com",
    group: "Photography",
    holds: "Stock photos and illustrations",
    scale: "5M+ images",
    topics: ["nature", "ocean", "culture", "science"],
    quality: 0.72,
    keys: ["PIXABAY_API_KEY"],
    signup: "https://pixabay.com/api/docs/"
  }
];
var SOURCE_GROUPS = ["Space", "Museums", "Libraries & archives", "Encyclopedic", "Nature", "Photography"];

// ../ai.x.com/src/media/licenses.ts
var BASE = {
  cc0: { code: "cc0", label: "CC0", attribution: false, shareAlike: false },
  pdm: { code: "pdm", label: "Public domain", attribution: false, shareAlike: false },
  "public-domain": { code: "public-domain", label: "Public domain", attribution: false, shareAlike: false },
  "us-government": { code: "us-government", label: "Public domain (US government work)", attribution: false, shareAlike: false },
  "no-known-restrictions": { code: "no-known-restrictions", label: "No known restrictions", attribution: false, shareAlike: false },
  "cc-by": { code: "cc-by", label: "CC BY", attribution: true, shareAlike: false },
  "cc-by-sa": { code: "cc-by-sa", label: "CC BY-SA", attribution: true, shareAlike: true },
  unsplash: { code: "unsplash", label: "Unsplash License", attribution: false, shareAlike: false },
  pixabay: { code: "pixabay", label: "Pixabay Content License", attribution: false, shareAlike: false }
};
var URLS = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
  pdm: "https://creativecommons.org/publicdomain/mark/1.0/",
  unsplash: "https://unsplash.com/license",
  pixabay: "https://pixabay.com/service/license-summary/"
};
function license(code, options = {}) {
  const base = BASE[code];
  const version = options.version && /^\d(\.\d)?$/.test(options.version) ? options.version : void 0;
  const label = options.label ?? (version && (code === "cc-by" || code === "cc-by-sa") ? `${base.label} ${version}` : base.label);
  let url = options.url ?? URLS[code];
  if (!url && version && (code === "cc-by" || code === "cc-by-sa")) {
    url = `https://creativecommons.org/licenses/${code === "cc-by" ? "by" : "by-sa"}/${version}/`;
  }
  return { ...base, label, url };
}
function parseLicense(input, extra = {}) {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/_/g, "-");
  const url = extra.url ?? (/^https?:\/\//.test(raw) ? raw.replace(/^http:/, "https:").replace(/legalcode.*$/, "") : void 0);
  if (/(^|[^a-z])nc([^a-z]|$)|non-?commercial|noncommercial/.test(text)) return null;
  if (/(^|[^a-z])nd([^a-z]|$)|no-?deriv|noderiv/.test(text)) return null;
  if (/all rights reserved|copyrighted|in copyright|incopyright|\/inc\/|inc-|copyright not evaluated|cne\//.test(text)) return null;
  if (/rightsstatements\.org\/vocab\/noc-us|noc-us/.test(text)) return license("public-domain", { label: "No copyright (United States)" });
  if (/rightsstatements\.org\/vocab\/nkc|no known copyright|no known restrictions/.test(text)) return license("no-known-restrictions");
  if (/publicdomain\/zero|(^|[^a-z])cc-?0([^a-z0-9]|$)|cc-zero|^zero$|license#cc0/.test(text)) return license("cc0");
  if (/publicdomain\/mark|public-?domain-?mark|(^|[^a-z])pdm([^a-z]|$)|license#pdmark|^pdmark$/.test(text)) return license("pdm");
  if (/^public ?domain|^pd$|^pd-|public domain|^public-domain$/.test(text)) return license("public-domain");
  if (/us government|u\.s\. government|united states government|us-gov/.test(text)) return license("us-government");
  const version = text.match(/(?:by(?:-sa)?)[\s/-]*(\d(?:\.\d)?)/)?.[1];
  if (/(^|[^a-z])by-sa([^a-z]|$)|licenses\/by-sa|attribution-share ?alike|attribution-sharealike/.test(text)) {
    return license("cc-by-sa", { version, url });
  }
  if (/(^|[^a-z])by([^a-z]|$)|licenses\/by\/|^attribution( \d|$)|creative commons attribution(?! non)/.test(text)) {
    return license("cc-by", { version, url });
  }
  return null;
}
function allowed(lic, level) {
  if (level === "share-alike") return true;
  if (lic.shareAlike) return false;
  if (level === "attribution") return true;
  return !lic.attribution;
}
function attributionFor(item) {
  const where = item.collection && item.collection !== item.sourceName ? `${item.collection} via ${item.sourceName}` : item.sourceName;
  if (item.license.code === "unsplash") return `Photo by ${item.creator || "an Unsplash photographer"} on Unsplash`;
  if (item.license.code === "pixabay") return `Image by ${item.creator || "a Pixabay contributor"} from Pixabay`;
  if (item.credit) return `${item.credit} \xB7 ${item.license.label} \xB7 ${where}`;
  const title = item.title ? `\u201C${item.title}\u201D` : "Untitled";
  const by = item.creator ? ` by ${item.creator}` : "";
  return `${title}${by} \xB7 ${item.license.label} \xB7 ${where}`;
}

// ../ai.x.com/src/media/rank.ts
var STOP_WORDS = new Set(
  "a an and are as at be by for from how in into is it its of on or the their this to was were what when where which who why with within over under about after before between through during without the de la le les el los las der die das".split(
    " "
  )
);
function terms(query) {
  return [
    ...new Set(
      query.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    )
  ];
}
function stem(term) {
  return term.length > 4 ? term.replace(/(ies|es|s|ing|ed)$/, "") : term;
}
function termMatch(candidate, words) {
  if (!words.length) return 0.5;
  const haystack = [candidate.title, candidate.description, candidate.creator, candidate.collection, ...candidate.tags ?? []].filter(Boolean).join(" ").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  let hits = 0;
  for (const word of words) if (haystack.includes(stem(word))) hits += 1;
  return hits / words.length;
}
function qualityLabel(c) {
  if (c.width && c.height) {
    const edge = Math.max(c.width, c.height);
    return edge >= 3840 ? "4K" : edge >= 1920 ? "HD" : "SD";
  }
  if (!c.sizeHint) return "?";
  return c.sizeHint >= 1920 ? "HD" : "SD";
}
function ratio(c) {
  if (c.width && c.height) return c.width / c.height;
  return c.aspect;
}
function frameFit(c, orientation) {
  const r = ratio(c);
  if (!r || !Number.isFinite(r)) return 0.5;
  const target = orientation === "portrait" ? 9 / 16 : 16 / 9;
  const fit2 = Math.exp(-Math.abs(Math.log(r / target)) * 1.4);
  return orientation === "any" ? 0.4 + 0.6 * fit2 : fit2;
}
function resolution(c) {
  const exact = c.width && c.height ? Math.max(c.width, c.height) : 0;
  const edge = exact || c.sizeHint || 0;
  if (!edge) return 0.3;
  const score = Math.min(1, Math.max(0, Math.log2(edge / 640) / Math.log2(6e3 / 640)));
  return exact ? score : score * 0.85;
}
function scoreCandidate(c, info) {
  const match = termMatch(c, info.terms);
  const rank = 1 - info.position / Math.max(info.count, 1);
  const relevance = 0.6 * match + 0.4 * rank;
  const meta = (c.creator ? 0.4 : 0) + (c.date ? 0.3 : 0) + (c.description ? 0.3 : 0);
  const score = 0.28 * resolution(c) + 0.27 * relevance + 0.17 * info.quality + 0.12 * frameFit(c, info.orientation) + 0.08 * (c.curated ? 1 : 0) + 0.04 * meta + 0.04 * (info.topicMatch ? 1 : 0);
  return match === 0 && info.terms.length > 0 ? score * 0.72 : score;
}
function normaliseUrl(url) {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${decodeURIComponent(u.pathname).replace(/\/(\d+px-)?/g, "/").toLowerCase()}`;
  } catch {
    return url.toLowerCase();
  }
}
function imageKeys(c) {
  const keys = [`p:${normaliseUrl(c.pageUrl)}`, `f:${normaliseUrl(c.fullUrl)}`];
  const title = c.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (title.length >= 12 && c.creator) keys.push(`t:${title}|${c.creator.toLowerCase().trim()}`);
  return keys;
}
function family(r) {
  return `${r.source}|${r.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()}`;
}
function dedupe(items, keysOf) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of [...items].sort((a, b) => b.score - a.score)) {
    const keys = keysOf(item);
    if (keys.some((k) => seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    out.push(item);
  }
  return out;
}
function diversify(items, limit, options = {}) {
  const { penalty = 0.035, familyOf, familyPenalty = 0.07 } = options;
  const pool = [...items].sort((a, b) => b.score - a.score);
  const bySource = /* @__PURE__ */ new Map();
  const byFamily = /* @__PURE__ */ new Map();
  const out = [];
  while (out.length < limit && pool.length) {
    let best = 0;
    let bestValue = -Infinity;
    for (let i = 0; i < pool.length; i += 1) {
      const item = pool[i];
      const repeats = familyOf ? byFamily.get(familyOf(item)) ?? 0 : 0;
      const value = item.score - penalty * (bySource.get(item.source) ?? 0) - familyPenalty * repeats;
      if (value > bestValue) {
        bestValue = value;
        best = i;
      }
    }
    const [pick] = pool.splice(best, 1);
    bySource.set(pick.source, (bySource.get(pick.source) ?? 0) + 1);
    if (familyOf) byFamily.set(familyOf(pick), (byFamily.get(familyOf(pick)) ?? 0) + 1);
    out.push(pick);
  }
  return out;
}
function mergeResults(results, limit) {
  return diversify(dedupe(results, imageKeys), limit, { familyOf: family });
}

// ../ai.x.com/src/media/http.ts
var DEFAULT_USER_AGENT = "ZuponaAI-MediaSearch/1.0 (https://ai.zupona.com; documentary image research)";
var HttpError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
};
function createHttp(options) {
  const doFetch = options.fetchImpl ?? fetch;
  const ua = options.userAgent || DEFAULT_USER_AGENT;
  async function request(url, init = {}, accept) {
    try {
      return await attempt(url, init, accept);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : void 0;
      if ((init.method ?? "GET") !== "GET" || !status || status < 502 || status > 504) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return attempt(url, init, accept);
    }
  }
  async function attempt(url, init, accept) {
    if (options.budget.left <= 0) throw new HttpError("request budget used up");
    options.budget.left -= 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const requestInit = {
        method: init.method ?? "GET",
        headers: { "User-Agent": ua, "Api-User-Agent": ua, Accept: accept, ...init.headers },
        body: init.body,
        signal: controller.signal,
        redirect: "follow"
      };
      if ((init.method ?? "GET") === "GET") requestInit.cf = { cacheTtl: init.cacheTtl ?? 3600, cacheEverything: true };
      const res = await doFetch(url, requestInit);
      if (!res.ok) {
        const hint = res.status === 429 ? "rate limited" : res.status === 401 || res.status === 403 ? "not authorised" : `HTTP ${res.status}`;
        throw new HttpError(hint, res.status);
      }
      return res;
    } catch (err) {
      if (err instanceof HttpError) throw err;
      if (controller.signal.aborted) throw new HttpError("timed out");
      throw new HttpError(err instanceof Error ? err.message : "network error");
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    async json(url, init) {
      const res = await request(url, init, "application/json, application/ld+json;q=0.9, */*;q=0.1");
      const body = await res.text();
      try {
        return JSON.parse(body);
      } catch {
        throw new HttpError("response was not JSON");
      }
    },
    async text(url, init) {
      const res = await request(url, init, "text/html, */*;q=0.5");
      return res.text();
    }
  };
}
function qs(params) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === void 0 || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, String(v)));
    else out.append(key, String(value));
  }
  return out.toString();
}
function plain(html, max = 400) {
  if (!html) return "";
  const text = String(html).replace(/<br\s*\/?>/gi, " ").replace(/<\/(p|li|div)>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trim()}\u2026`;
}
function first(value) {
  if (Array.isArray(value)) return value[0];
  return value ?? void 0;
}
function https(url) {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url.replace(/^http:\/\//, "https://");
}

// ../ai.x.com/src/media/providers/encyclopedic.ts
var COMMONS_API = "https://commons.wikimedia.org/w/api.php";
var COMMONS_META = "LicenseShortName|LicenseUrl|License|Artist|Credit|ImageDescription|Assessments|ObjectName|DateTimeOriginal|AttributionRequired";
var IMAGE_MIME = /^image\/(jpeg|png|webp|tiff)$/;
function commonsThumb(thumburl, original, width, originalWidth = Infinity) {
  if (width >= originalWidth) return original;
  const sized = /\/((?:lossy-)?page\d+-)?\d+px-/;
  if (thumburl && sized.test(thumburl)) return thumburl.replace(sized, (_, page = "") => `/${page}${width}px-`);
  const match = original.match(/^(https:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+)\/([0-9a-f]\/[0-9a-f]{2}\/([^/?]+))/);
  if (!match) return original;
  const [, root, path, name] = match;
  return `${root}/thumb/${path}/${width}px-${name}`;
}
function commonsTitle(page, meta) {
  const name = plain(meta.ObjectName?.value, 140);
  if (name) return name;
  return page.title.replace(/^File:/, "").replace(/\.[a-z0-9]{3,4}$/i, "").replace(/_/g, " ");
}
function commonsCandidates(pages, extra = {}) {
  const out = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info || page.missing) continue;
    if (info.mime && !IMAGE_MIME.test(info.mime)) continue;
    const meta = info.extmetadata ?? {};
    const lic = parseLicense(meta.LicenseShortName?.value, { url: meta.LicenseUrl?.value }) ?? parseLicense(meta.License?.value, { url: meta.LicenseUrl?.value }) ?? parseLicense(meta.LicenseUrl?.value);
    if (!lic) continue;
    const longEdge = Math.max(info.width, info.height);
    const useOriginal = longEdge <= 6e3 && info.mime !== "image/tiff";
    const fullWidth = useOriginal ? info.width : Math.min(3840, info.width - 1);
    const fullUrl = useOriginal ? info.url : commonsThumb(info.thumburl, info.url, fullWidth, info.width);
    const scale = fullWidth / info.width;
    const assessments = meta.Assessments?.value ?? "";
    out.push({
      nativeId: page.title,
      title: commonsTitle(page, meta),
      description: plain(meta.ImageDescription?.value, 300) || void 0,
      creator: plain(meta.Artist?.value, 120) || void 0,
      date: plain(meta.DateTimeOriginal?.value, 40) || void 0,
      pageUrl: https(info.descriptionurl),
      thumbnailUrl: commonsThumb(info.thumburl, info.url, 500, info.width),
      previewUrl: commonsThumb(info.thumburl, info.url, 1280, info.width),
      fullUrl,
      width: Math.round(info.width * scale),
      height: Math.round(info.height * scale),
      license: lic,
      curated: extra.curated || /featured|quality|valued|potd|poty/.test(assessments),
      tags: extra.tags
    });
  }
  return out;
}
function commonsParams(extra) {
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
    ...extra
  });
}
var COMMONS_FREE = ["P275=Q6938433", "P6216=Q19652"];
var COMMONS_BY = ["P275=Q20007257", "P275=Q14947546", "P275=Q19125117", "P275=Q18810333", "P275=Q30942811"];
var commons = async (ctx) => {
  const size = ctx.minSize >= 1e3 ? ` filew:>${Math.min(ctx.minSize, 3e3) - 1}` : "";
  const licences = ctx.rights === "share-alike" ? "" : ` haswbstatement:${(ctx.rights === "attribution" ? [...COMMONS_FREE, ...COMMONS_BY] : COMMONS_FREE).join("|")}`;
  const data = await ctx.http.json(
    `${COMMONS_API}?${commonsParams({
      generator: "search",
      gsrsearch: `${ctx.query} filetype:bitmap${size}${licences}`,
      gsrnamespace: 6,
      gsrlimit: Math.min(50, ctx.perSource + 4)
    })}`
  );
  const pages = [...data.query?.pages ?? []].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return commonsCandidates(pages);
};
var wikipedia = async (ctx) => {
  const search = await ctx.http.json(
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
      pilicense: "free"
    })}`
  );
  const articles = [...search.query?.pages ?? []].filter((p) => p.pageimage).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (!articles.length) return [];
  const files = [...new Set(articles.map((a) => `File:${a.pageimage}`))];
  const info = await ctx.http.json(
    `${COMMONS_API}?${commonsParams({ titles: files.join("|") })}`
  );
  const byTitle = /* @__PURE__ */ new Map();
  for (const page of info.query?.pages ?? []) byTitle.set(page.title.replace(/_/g, " "), page);
  const out = [];
  for (const article of articles) {
    const page = byTitle.get(`File:${article.pageimage}`.replace(/_/g, " "));
    if (!page) continue;
    const [item] = commonsCandidates([page], { curated: true, tags: [article.title, article.description ?? ""] });
    if (!item) continue;
    out.push({
      ...item,
      nativeId: `${article.title}|${page.title}`,
      title: `${article.title}${item.title && !article.title.includes(item.title) ? ` \u2014 ${item.title}` : ""}`.slice(0, 160),
      description: article.description ? `${article.description}. ${item.description ?? ""}`.trim() : item.description
    });
  }
  return out;
};
var OPENVERSE_EXCLUDED = [
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
  "sketchfab"
];
var COLLECTION_NAMES = {
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
  bib_gulbenkian: "Gulbenkian Art Library"
};
function collectionName(source) {
  if (COLLECTION_NAMES[source]) return COLLECTION_NAMES[source];
  if (source.startsWith("smithsonian")) {
    const unit = source.replace(/^smithsonian_?/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    return unit ? `Smithsonian ${unit}` : "Smithsonian";
  }
  return source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
var openverseToken = null;
async function openverseAuth(ctx, env) {
  const id = env.OPENVERSE_CLIENT_ID;
  const secret = env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret) return {};
  if (!openverseToken || openverseToken.expires < Date.now() + 6e4) {
    const token = await ctx.http.json("https://api.openverse.org/v1/auth_tokens/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: qs({ client_id: id, client_secret: secret, grant_type: "client_credentials" })
    });
    openverseToken = { value: token.access_token, expires: Date.now() + token.expires_in * 1e3 };
  }
  return { Authorization: `Bearer ${openverseToken.value}` };
}
function deliveredSize(url, width, height) {
  if (!width || !height) return { width, height };
  const long = Math.max(width, height);
  const flickr2 = url.match(/staticflickr\.com\/.+_([mnwzcbhk])\.(?:jpe?g|png)$/i)?.[1];
  const flickrEdge = { m: 240, n: 320, w: 400, z: 640, c: 800, b: 1024, h: 1600, k: 2048 };
  let edge = flickr2 ? flickrEdge[flickr2.toLowerCase()] : void 0;
  const widthToken = url.match(/\/(\d{3,4})w\//)?.[1] ?? url.match(/\/(?:image|editor)_(?:png_|jpeg_)?(\d{3,4})\//)?.[1];
  if (!edge && widthToken) edge = Math.round(Number(widthToken) / width * long);
  if (!edge || edge >= long) return { width, height };
  const scale = edge / long;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
async function openverseSearch(ctx, scope) {
  const licenses = ["cc0", "pdm"];
  if (ctx.rights !== "no-attribution") licenses.push("by");
  if (ctx.rights === "share-alike") licenses.push("by-sa");
  const headers = await openverseAuth(ctx, ctx.env);
  const data = await ctx.http.json(
    `https://api.openverse.org/v1/images/?${qs({
      q: ctx.query,
      page_size: Math.min(headers.Authorization ? 50 : 20, ctx.perSource + 4),
      license: licenses.join(","),
      // Openverse stores most Flickr photos at 1024 px ("medium"), so "large" alone would hide them.
      size: ctx.minSize >= 1600 ? "large" : "medium,large",
      aspect_ratio: ctx.orientation === "landscape" ? "wide" : ctx.orientation === "portrait" ? "tall" : void 0,
      mature: false,
      source: scope.source,
      excluded_source: scope.exclude?.join(",")
    })}`,
    { headers }
  );
  const out = [];
  for (const r of data.results ?? []) {
    if (r.mature) continue;
    const lic = parseLicense(r.license_url || `cc-${r.license}`) ?? parseLicense(r.license);
    if (!lic) continue;
    const versioned = lic.code === "cc-by" || lic.code === "cc-by-sa" ? license(lic.code, { version: r.license_version, url: r.license_url }) : lic;
    out.push({
      nativeId: r.id,
      title: plain(r.title, 160) || "Untitled",
      creator: plain(r.creator, 120) || void 0,
      pageUrl: https(r.foreign_landing_url) || `https://openverse.org/image/${r.id}`,
      thumbnailUrl: r.thumbnail || `https://api.openverse.org/v1/images/${r.id}/thumb/`,
      previewUrl: https(r.url),
      fullUrl: https(r.url),
      ...deliveredSize(r.url, r.width || void 0, r.height || void 0),
      license: versioned,
      collection: collectionName(r.source),
      tags: r.tags?.map((t) => t.name).slice(0, 12)
    });
  }
  return out;
}
var openverse = (ctx) => openverseSearch(ctx, { exclude: OPENVERSE_EXCLUDED });
var encyclopedic = { "wikimedia-commons": commons, wikipedia, openverse };

// ../ai.x.com/src/media/providers/libraries.ts
var iiif = (base, box) => `${base.replace(/\/$/, "")}/full/!${box},${box}/0/default.jpg`;
var loc = async (ctx) => {
  const data = await ctx.http.json(
    `https://www.loc.gov/photos/?${qs({ q: ctx.query, fo: "json", c: Math.min(100, ctx.perSource * 2), at: "results" })}`
  );
  const out = [];
  for (const r of data.results ?? []) {
    if (r.access_restricted || !r.image_url?.length) continue;
    if (r.online_format && !r.online_format.includes("image")) continue;
    const rights = [r.item?.rights_advisory, r.item?.rights_information, r.rights_information].flat().filter(Boolean).join(" ");
    if (!/^\s*no known restrictions/i.test(rights)) continue;
    const sized = r.image_url.map((u) => {
      const m = u.match(/#h=(\d+)&w=(\d+)/);
      return { url: u.replace(/#.*$/, ""), height: m ? Number(m[1]) : 0, width: m ? Number(m[2]) : 0 };
    }).filter((s) => /\.(jpe?g|png)$/i.test(s.url)).sort((a, b) => b.width * b.height - a.width * a.height);
    const full = sized[0];
    if (!full) continue;
    const thumb = sized.find((s) => s.width && s.width <= 700) ?? full;
    out.push({
      nativeId: r.id,
      title: plain(r.title, 160) || "Untitled",
      description: plain(first(r.description), 300) || void 0,
      creator: plain(r.item?.creators?.[0]?.title || first(r.contributor), 120) || void 0,
      date: r.date?.slice(0, 4),
      pageUrl: https(r.url || r.id),
      thumbnailUrl: https(thumb.url),
      previewUrl: https(full.url),
      fullUrl: https(full.url),
      width: full.width || void 0,
      height: full.height || void 0,
      license: license("no-known-restrictions", { label: "No known restrictions (LoC)" })
    });
  }
  return out;
};
var internetArchive = async (ctx) => {
  const licences = ["*publicdomain*"];
  if (ctx.rights !== "no-attribution") licences.push("*licenses\\/by\\/*");
  if (ctx.rights === "share-alike") licences.push("*licenses\\/by-sa\\/*");
  const words = ctx.query.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ");
  const q = `(${words}) AND mediatype:image AND licenseurl:(${licences.join(" OR ")}) AND -identifier:clevelandart*`;
  const data = await ctx.http.json(
    `https://archive.org/advancedsearch.php?${qs({
      q,
      "fl[]": ["identifier", "title", "licenseurl", "creator", "date", "description"],
      rows: Math.min(50, ctx.perSource + 4),
      output: "json"
    })}`
  );
  const out = [];
  for (const d of data.response?.docs ?? []) {
    const lic = parseLicense(d.licenseurl);
    if (!lic) continue;
    const base = `https://iiif.archive.org/iiif/${encodeURIComponent(d.identifier)}`;
    out.push({
      nativeId: d.identifier,
      title: plain(first(d.title), 160) || d.identifier,
      description: plain(first(d.description), 300) || void 0,
      creator: plain(first(d.creator), 120) || void 0,
      date: d.date?.slice(0, 10),
      pageUrl: `https://archive.org/details/${encodeURIComponent(d.identifier)}`,
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 4e3),
      sizeHint: 1600,
      license: lic
    });
  }
  return out;
};
var WELLCOME_LICENCES = {
  "cc-0": () => license("cc0"),
  pdm: () => license("pdm"),
  "cc-by": () => license("cc-by", { version: "4.0" }),
  "cc-by-sa": () => license("cc-by-sa", { version: "4.0" })
};
var wellcome = async (ctx) => {
  const allowedIds = ["cc-0", "pdm"];
  if (ctx.rights !== "no-attribution") allowedIds.push("cc-by");
  if (ctx.rights === "share-alike") allowedIds.push("cc-by-sa");
  const data = await ctx.http.json(
    `https://api.wellcomecollection.org/catalogue/v2/images?${qs({
      query: ctx.query,
      pageSize: Math.min(100, ctx.perSource + 4),
      "locations.license": allowedIds.join(","),
      include: "source.contributors"
    })}`
  );
  const out = [];
  for (const img of data.results ?? []) {
    const loc2 = img.locations?.[0];
    const make = loc2?.license && WELLCOME_LICENCES[loc2.license.id];
    if (!loc2 || !make) continue;
    const base = loc2.url.replace(/\/info\.json$/, "");
    out.push({
      nativeId: img.id,
      title: plain(img.source?.title, 160) || "Untitled",
      creator: plain(img.source?.contributors?.[0]?.agent?.label, 120) || void 0,
      pageUrl: img.source ? `https://wellcomecollection.org/works/${img.source.id}/images?id=${img.id}` : "https://wellcomecollection.org/images",
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 3840),
      aspect: img.aspectRatio,
      sizeHint: 3e3,
      license: make()
    });
  }
  return out;
};
var digitalnz = async (ctx) => {
  const key = ctx.env.DIGITALNZ_API_KEY;
  const data = await ctx.http.json(
    `https://api.digitalnz.org/records.json?${qs({
      text: ctx.query,
      per_page: Math.min(100, ctx.perSource + 4),
      "and[category][]": "Images",
      "and[usage][]": ["Use commercially", "Modify"],
      api_key: key
    })}`
  );
  const out = [];
  for (const r of data.search?.results ?? []) {
    const image = r.object_url || r.large_thumbnail_url;
    if (!image || !r.landing_url) continue;
    const rights = r.rights ?? "";
    const statement = [rights, ...r.copyright ?? []].join(" ");
    const lic = /creative ?commons|cc[ -]|cc0|public domain|no known/i.test(statement) ? parseLicense(rights) ?? parseLicense(statement) : null;
    if (!lic) continue;
    out.push({
      nativeId: String(r.id),
      title: plain(r.title, 160) || "Untitled",
      description: plain(r.description, 300) || void 0,
      creator: plain(first(r.creator), 120) || void 0,
      date: first(r.date)?.slice(0, 4),
      pageUrl: https(r.landing_url),
      thumbnailUrl: https(r.thumbnail_url || image),
      previewUrl: https(image),
      fullUrl: https(image),
      sizeHint: r.object_url ? 1600 : 900,
      license: lic,
      collection: r.display_content_partner
    });
  }
  return out;
};
var ksamsok = async (ctx) => {
  const phrase = ctx.query.replace(/["\\]/g, " ").trim();
  const data = await ctx.http.json(
    `https://kulturarvsdata.se/ksamsok/api?${qs({
      method: "search",
      version: "1.1",
      hitsPerPage: Math.min(50, ctx.perSource + 6),
      query: `text="${phrase}" AND thumbnailExists=j`
    })}`
  );
  const records = [data.result?.records ?? []].flat();
  const out = [];
  for (const rec of records) {
    const graph = [rec?.record?.["@graph"] ?? []].flat();
    const entity = graph.find((n) => n["@type"] === "ns1:Entity");
    const image = graph.find((n) => n["@type"] === "ns1:Image" && n["ns1:highresSource"]);
    if (!entity || !image) continue;
    const licUrl = image["ns1:mediaLicenseUrl"]?.["@id"];
    const licCode = image["ns1:mediaLicense"]?.["@id"];
    const lic = parseLicense(licUrl) ?? parseLicense(licCode);
    if (!lic) continue;
    const high = String(image["ns1:highresSource"]);
    const label = plain(String(entity["ns1:itemLabel"] ?? ""), 160);
    const keywords = [entity["ns1:itemKeyWord"]].flat().filter((k) => typeof k === "string");
    out.push({
      nativeId: String(entity["@id"] ?? high),
      title: label || "Untitled",
      pageUrl: https(String(entity["ns1:url"] ?? entity["@id"] ?? "")),
      thumbnailUrl: https(String(image["ns1:lowresSource"] ?? high)),
      previewUrl: https(high),
      fullUrl: https(high.replace(/dimension=\d+x\d+/, "dimension=2400x2400")),
      sizeHint: 1600,
      license: lic,
      tags: keywords.slice(0, 12)
    });
  }
  return out;
};
var digitalCommonwealth = async (ctx) => {
  const data = await ctx.http.json(
    `https://www.digitalcommonwealth.org/search.json?${qs({
      q: ctx.query,
      per_page: Math.min(50, ctx.perSource + 4),
      "f[reuse_allowed_ssi][]": "no restrictions"
    })}`
  );
  const out = [];
  for (const r of data.data ?? []) {
    const a = r.attributes;
    if (!a.exemplary_image_ssi) continue;
    const lic = parseLicense(a.license_ss) ?? license("no-known-restrictions");
    const base = `https://iiif.digitalcommonwealth.org/iiif/2/${encodeURIComponent(a.exemplary_image_ssi)}`;
    out.push({
      nativeId: r.id,
      title: plain(a.title_info_primary_tsi, 160) || "Untitled",
      description: plain(a.abstract_tsi, 300) || void 0,
      creator: plain(first(a.name_tsim), 120) || void 0,
      date: first(a.date_tsim),
      pageUrl: https(a.identifier_uri_ss) || `https://www.digitalcommonwealth.org/search/${r.id}`,
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 3e3),
      sizeHint: 2500,
      license: lic,
      collection: a.institution_name_ssi,
      tags: a.subject_topic_tsim?.slice(0, 12)
    });
  }
  return out;
};
var europeana = async (ctx) => {
  const data = await ctx.http.json(
    `https://api.europeana.eu/record/v2/search.json?${qs({
      query: ctx.query,
      media: true,
      thumbnail: true,
      reusability: "open",
      qf: "TYPE:IMAGE",
      rows: Math.min(100, ctx.perSource + 4),
      profile: "rich"
    })}`,
    // The key goes in a header, never the URL: Europeana deprecated wskey because URLs leak when shared.
    { headers: { "x-api-key": ctx.env.EUROPEANA_API_KEY ?? "" } }
  );
  const out = [];
  for (const item of data.items ?? []) {
    const full = first(item.edmIsShownBy);
    const lic = parseLicense(first(item.rights));
    if (!full || !lic) continue;
    out.push({
      nativeId: item.id,
      title: plain(first(item.title), 160) || "Untitled",
      description: plain(first(item.dcDescription), 300) || void 0,
      creator: plain(first(item.dcCreator), 120) || void 0,
      date: first(item.year),
      pageUrl: (item.guid ?? `https://www.europeana.eu/item${item.id}`).replace(/\?.*$/, ""),
      thumbnailUrl: https(first(item.edmPreview) ?? full),
      previewUrl: https(full),
      fullUrl: https(full),
      sizeHint: 2e3,
      license: lic,
      collection: first(item.dataProvider)
    });
  }
  return out;
};
var smithsonian = async (ctx) => {
  const data = await ctx.http.json(
    `https://api.si.edu/openaccess/api/v1.0/search?${qs({
      q: `${ctx.query} AND online_media_type:"Images" AND media_usage:"CC0"`,
      rows: Math.min(100, ctx.perSource + 4),
      api_key: ctx.env.SMITHSONIAN_API_KEY
    })}`
  );
  const out = [];
  for (const row of data.response?.rows ?? []) {
    const d = row.content?.descriptiveNonRepeating;
    const media = d?.online_media?.media?.find((m) => m.type === "Images" && m.usage?.access === "CC0" && (m.idsId || m.content));
    if (!media) continue;
    const ids = media.idsId ? (max) => `https://ids.si.edu/ids/deliveryService?id=${encodeURIComponent(media.idsId)}&max=${max}` : null;
    const hi = media.resources?.find((r) => /high-resolution jpeg/i.test(r.label ?? "") && r.url);
    out.push({
      nativeId: row.id,
      title: plain(row.title || d?.title?.content, 160) || "Untitled",
      description: plain(row.content?.freetext?.notes?.[0]?.content, 300) || void 0,
      creator: plain(row.content?.freetext?.name?.[0]?.content, 120) || void 0,
      date: row.content?.freetext?.date?.[0]?.content,
      pageUrl: https(d?.record_link) || `https://collections.si.edu/search/detail/${row.id}`,
      thumbnailUrl: ids ? ids(600) : https(media.thumbnail || media.content),
      previewUrl: ids ? ids(1600) : https(media.content),
      fullUrl: hi?.url ? https(hi.url) : ids ? ids(4e3) : https(media.content),
      width: hi?.width,
      height: hi?.height,
      sizeHint: 3e3,
      license: license("cc0"),
      collection: d?.data_source
    });
  }
  return out;
};
var nypl = async (ctx) => {
  const data = await ctx.http.json(
    `https://api.repo.nypl.org/api/v2/items/search?${qs({ q: ctx.query, publicDomainOnly: true, per_page: Math.min(50, ctx.perSource + 4) })}`,
    { headers: { Authorization: `Token token="${ctx.env.NYPL_API_TOKEN}"` } }
  );
  const out = [];
  for (const item of [data.nyplAPI?.response?.result ?? []].flat()) {
    if (!item.imageID) continue;
    const base = `https://iiif.nypl.org/iiif/2/${encodeURIComponent(item.imageID)}`;
    out.push({
      nativeId: item.uuid,
      title: plain(item.title, 160) || "Untitled",
      pageUrl: https(item.itemLink) || `https://digitalcollections.nypl.org/items/${item.uuid}`,
      thumbnailUrl: iiif(base, 600),
      previewUrl: iiif(base, 1600),
      fullUrl: iiif(base, 4e3),
      sizeHint: 2500,
      license: license("public-domain"),
      collection: "New York Public Library"
    });
  }
  return out;
};
var nara = async (ctx) => {
  const data = await ctx.http.json(
    `https://catalog.archives.gov/api/v2/records/search?${qs({
      q: ctx.query,
      availableOnline: true,
      typeOfMaterials: "Photographs and other Graphic Materials",
      limit: Math.min(50, ctx.perSource + 4)
    })}`,
    { headers: { "x-api-key": ctx.env.NARA_API_KEY ?? "" } }
  );
  const out = [];
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
      description: plain(r.scopeAndContentNote, 300) || void 0,
      creator: plain(r.creators?.[0]?.heading, 120) || void 0,
      date: r.productionDates?.[0]?.logicalDate?.slice(0, 10),
      pageUrl: `https://catalog.archives.gov/id/${r.naId}`,
      thumbnailUrl: https(image.objectUrl),
      previewUrl: https(image.objectUrl),
      fullUrl: https(image.objectUrl),
      sizeHint: 2500,
      license: license("us-government", { label: "Public domain (US National Archives)" }),
      collection: "US National Archives"
    });
  }
  return out;
};
// DVIDS: all media is produced by the US DoD or a federal agency and is public domain "unless other
// copyright status is indicated" (api.dvidshub.net/docs/copyright). The search returns only a small
// thumbnail, so the top hits go through the Asset API for the full-resolution file. A video contributes
// its full-resolution frame capture (a still), not the clip.
var DVIDS_NOT_FREE = /©|\bcopyright(ed)?\b|all rights reserved|used with permission|reprinted|\bcourtesy\b|licensed|shutterstock|getty/i;
var dvids = async (ctx) => {
  const key = ctx.env.DVIDS_API_KEY ?? "";
  const search = await ctx.http.json(
    `https://api.dvidshub.net/search?${qs({ q: ctx.query, "type[]": ["image", "video"], max_results: Math.min(50, ctx.perSource * 2 + 4), sort: "relevance", api_key: key })}`
  );
  const hits = (search.results ?? []).filter((h) => h?.id && /^(image|video):/.test(h.id)).slice(0, ctx.perSource + 2);
  const assets = await Promise.all(
    hits.map((h) => ctx.http.json(`https://api.dvidshub.net/asset?${qs({ id: h.id, api_key: key })}`).then((d) => d.results, () => null))
  );
  const out = [];
  hits.forEach((h, i) => {
    const a = assets[i];
    if (!a?.image) return;
    const creditText = Array.isArray(a.credit) ? a.credit.map((c) => [c.rank, c.name].filter(Boolean).join(" ")).filter(Boolean).join(", ") : String(a.credit ?? h.credit ?? "");
    if (DVIDS_NOT_FREE.test([a.title, a.description, a.keywords, creditText].filter(Boolean).join(" "))) return;
    const isVideo = h.id.startsWith("video:");
    const width = Number(a.dimensions?.width ?? h.width) || void 0;
    const height = Number(a.dimensions?.height ?? h.height) || void 0;
    out.push({
      nativeId: h.id,
      title: plain(a.title ?? h.title, 160) || "Untitled",
      description: plain(a.description ?? h.short_description, 300) || void 0,
      creator: plain([creditText, a.unit_name].filter(Boolean).join(", "), 120) || void 0,
      date: String(a.date ?? h.date ?? "").slice(0, 10) || void 0,
      pageUrl: https(a.url ?? h.url),
      thumbnailUrl: https(a.thumbnail ?? h.thumbnail ?? a.image),
      previewUrl: https(a.image),
      fullUrl: https(a.image),
      width,
      height,
      sizeHint: isVideo ? 2000 : void 0,
      license: license("us-government", { label: "Public domain (US DoD / DVIDS)", url: "https://api.dvidshub.net/docs/copyright" }),
      collection: isVideo ? "DVIDS (video frame)" : "DVIDS"
    });
  });
  return out;
};
var libraries = {
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
  dvids
};

// ../ai.x.com/src/media/providers/museums.ts
var iiif2 = (base, box) => `${base.replace(/\/$/, "")}/full/${box === "max" ? "max" : `!${box},${box}`}/0/default.jpg`;
function fit(width, height, box) {
  if (!width || !height) return { width: void 0, height: void 0 };
  const scale = Math.min(1, box / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
var met = async (ctx) => {
  const search = await ctx.http.json(
    `https://collectionapi.metmuseum.org/public/collection/v1.1/search?${qs({ q: ctx.query, hasImages: true, isPublicDomain: true, limit: 8, offset: 0 })}`
  );
  const ids = (search.objectIDs ?? []).slice(0, 5);
  const objects = await Promise.allSettled(
    ids.map((id) => ctx.http.json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`))
  );
  const out = [];
  for (const settled of objects) {
    if (settled.status !== "fulfilled") continue;
    const o = settled.value;
    if (!o.isPublicDomain || !o.primaryImage) continue;
    out.push({
      nativeId: String(o.objectID),
      title: plain(o.title, 160) || "Untitled",
      description: [o.culture, o.medium, o.department].filter(Boolean).join(" \xB7 ") || void 0,
      creator: plain(o.artistDisplayName, 120) || void 0,
      date: o.objectDate || void 0,
      pageUrl: o.objectURL || `https://www.metmuseum.org/art/collection/search/${o.objectID}`,
      thumbnailUrl: https(o.primaryImageSmall || o.primaryImage),
      previewUrl: https(o.primaryImageSmall || o.primaryImage),
      fullUrl: https(o.primaryImage),
      sizeHint: 3500,
      license: license("cc0"),
      curated: o.isHighlight,
      tags: o.tags?.map((t) => t.term).slice(0, 12)
    });
  }
  return out;
};
var artic = async (ctx) => {
  const data = await ctx.http.json(
    `https://api.artic.edu/api/v1/artworks/search?${qs({
      q: ctx.query,
      limit: Math.min(50, ctx.perSource + 4),
      fields: "id,title,image_id,artist_display,artist_title,date_display,place_of_origin,medium_display,is_public_domain,is_boosted,thumbnail",
      "query[term][is_public_domain]": "true"
    })}`,
    // The Art Institute asks API users to identify themselves with this header.
    { headers: { "AIC-User-Agent": ctx.env.MEDIA_USER_AGENT || "ZuponaAI-MediaSearch (https://ai.zupona.com)" } }
  );
  const base = data.config?.iiif_url || "https://www.artic.edu/iiif/2";
  const out = [];
  for (const a of data.data ?? []) {
    if (!a.image_id || !a.is_public_domain) continue;
    const src = `${base}/${a.image_id}`;
    const originalWidth = a.thumbnail?.width ?? 3e3;
    const width = (w) => `${src}/full/${Math.min(w, originalWidth)},/0/default.jpg`;
    const fullWidth = Math.min(3e3, originalWidth);
    const size = a.thumbnail?.width && a.thumbnail?.height ? { width: fullWidth, height: Math.round(a.thumbnail.height * fullWidth / a.thumbnail.width) } : { width: void 0, height: void 0 };
    out.push({
      nativeId: String(a.id),
      title: plain(a.title, 160) || "Untitled",
      description: plain(a.thumbnail?.alt_text, 300) || [a.place_of_origin, a.medium_display].filter(Boolean).join(" \xB7 ") || void 0,
      creator: plain(a.artist_title || a.artist_display, 120) || void 0,
      date: a.date_display,
      pageUrl: `https://www.artic.edu/artworks/${a.id}`,
      thumbnailUrl: width(600),
      previewUrl: width(1686),
      fullUrl: width(fullWidth),
      ...size,
      license: license("cc0"),
      curated: a.is_boosted
    });
  }
  return out;
};
var cleveland = async (ctx) => {
  const data = await ctx.http.json(
    `https://openaccess-api.clevelandart.org/api/artworks/?${qs({ q: ctx.query, cc0: 1, has_image: 1, limit: Math.min(50, ctx.perSource + 4) })}`
  );
  const out = [];
  for (const a of data.data ?? []) {
    const web = a.images?.web;
    const print = a.images?.print ?? web;
    if (!print || a.share_license_status !== "CC0") continue;
    out.push({
      nativeId: String(a.id),
      title: plain(a.title, 160) || "Untitled",
      description: plain(a.digital_description || a.wall_description, 300) || [first(a.culture), a.technique].filter(Boolean).join(" \xB7 ") || void 0,
      creator: plain(a.creators?.[0]?.description, 120) || void 0,
      date: a.creation_date,
      pageUrl: a.url || `https://www.clevelandart.org/art/${a.id}`,
      thumbnailUrl: https((web ?? print).url),
      previewUrl: https(print.url),
      fullUrl: https(print.url),
      width: Number(print.width) || void 0,
      height: Number(print.height) || void 0,
      license: license("cc0")
    });
  }
  return out;
};
var ENGLISH = "http://vocab.getty.edu/aat/300388277";
function nodes(value) {
  if (Array.isArray(value)) return value.filter((v) => !!v && typeof v === "object");
  return value && typeof value === "object" ? [value] : [];
}
function isEnglish(node) {
  return nodes(node.language).some((l) => l.id === ENGLISH);
}
function notation(node) {
  const values = nodes(node.notation);
  return (values.find((v) => v["@language"] === "en") ?? values[0])?.["@value"] ?? node._label;
}
function rijksRecord(record) {
  const names = nodes(record.identified_by);
  const titles = names.filter((n) => n.type === "Name" && typeof n.content === "string");
  const title = (titles.find(isEnglish) ?? titles[0])?.content ?? "Untitled";
  const objectNumber = names.find((n) => n.type === "Identifier" && typeof n.content === "string")?.content;
  let image;
  let rights;
  for (const subject of nodes(record.subject_of)) {
    for (const carrier of nodes(subject.digitally_carried_by)) {
      const point = nodes(carrier.access_point).map((p) => p.id).find((id) => typeof id === "string" && /iiif/.test(id));
      if (point && !image) {
        image = point;
        rights = nodes(carrier.referred_to_by).map((r) => r.content).find((c) => typeof c === "string" && /creativecommons|rightsstatements/.test(c));
      }
    }
  }
  if (!image) return null;
  const lic = rights && parseLicense(rights) || license("pdm");
  const production = nodes(record.produced_by)[0];
  const makers = [production, ...nodes(production?.part)].filter(Boolean).flatMap((p) => nodes(p.carried_out_by)).map(notation).filter((n) => !!n);
  const timespan = nodes(production?.timespan)[0];
  const date = nodes(timespan?.identified_by).map((n) => n.content).find((c) => typeof c === "string");
  const base = image.replace(/\/full\/.*$/, "");
  return {
    nativeId: String(record.id),
    title: plain(title, 160),
    creator: makers[0],
    date,
    pageUrl: objectNumber ? `https://www.rijksmuseum.nl/en/collection/${encodeURIComponent(objectNumber)}` : String(record.id),
    thumbnailUrl: iiif2(base, 600),
    previewUrl: iiif2(base, 1600),
    fullUrl: iiif2(base, 4e3),
    sizeHint: 4e3,
    license: lic
  };
}
var rijksmuseum = async (ctx) => {
  const find = (field) => ctx.http.json(`https://data.rijksmuseum.nl/search/collection?${qs({ [field]: ctx.query, imageAvailable: true })}`);
  let hits = (await find("title")).orderedItems ?? [];
  if (hits.length < 2) hits = [...hits, ...(await find("description")).orderedItems ?? []];
  const ids = [...new Set(hits.map((h) => h.id))].slice(0, 4);
  const records = await Promise.allSettled(ids.map((id) => ctx.http.json(id, { headers: { Accept: "application/ld+json" } })));
  return records.flatMap((r) => r.status === "fulfilled" ? [rijksRecord(r.value)] : []).filter((c) => !!c);
};
var smk = async (ctx) => {
  const data = await ctx.http.json(
    `https://api.smk.dk/api/v1/art/search/?${qs({
      keys: ctx.query,
      filters: "[public_domain:true],[has_image:true]",
      offset: 0,
      rows: Math.min(50, ctx.perSource + 4),
      lang: "en"
    })}`
  );
  const out = [];
  for (const item of data.items ?? []) {
    if (!item.public_domain || !item.image_iiif_id) continue;
    const titles = item.titles ?? [];
    const title = (titles.find((t) => /engelsk|english|en/i.test(t.language ?? "")) ?? titles[0])?.title;
    out.push({
      nativeId: item.id,
      title: plain(title, 160) || "Untitled",
      description: [item.object_names?.[0]?.name, item.techniques?.[0]].filter(Boolean).join(" \xB7 ") || void 0,
      creator: item.production?.[0]?.creator,
      date: item.production_date?.[0]?.period,
      pageUrl: item.frontend_url || `https://open.smk.dk/artwork/image/${item.object_number}`,
      thumbnailUrl: item.image_thumbnail || iiif2(item.image_iiif_id, 600),
      previewUrl: iiif2(item.image_iiif_id, 1600),
      fullUrl: iiif2(item.image_iiif_id, 3840),
      ...fit(item.image_width, item.image_height, 3840),
      license: item.rights && parseLicense(item.rights) || license("pdm")
    });
  }
  return out;
};
var mia = async (ctx) => {
  const query = `${encodeURIComponent(ctx.query)}%20image:valid%20rights_type:%22Public%20Domain%22`;
  const data = await ctx.http.json(`https://search.artsmia.org/${query}?size=${Math.min(40, ctx.perSource + 4)}`);
  const out = [];
  for (const hit of data.hits?.hits ?? []) {
    const s = hit._source;
    const id = s.id ?? Number(hit._id);
    if (!id || s.image !== "valid" || s.rights_type !== "Public Domain") continue;
    out.push({
      nativeId: String(id),
      title: plain(s.title, 160) || "Untitled",
      description: plain(s.description, 300) || [s.culture || s.country, s.medium].filter(Boolean).join(" \xB7 ") || void 0,
      creator: plain(s.artist, 120) || void 0,
      date: s.dated,
      pageUrl: `https://collections.artsmia.org/art/${id}`,
      thumbnailUrl: `https://4.api.artsmia.org/800/${id}.jpg`,
      previewUrl: `https://4.api.artsmia.org/800/${id}.jpg`,
      fullUrl: `https://4.api.artsmia.org/full/${id}.jpg`,
      width: s.image_width,
      height: s.image_height,
      license: license("public-domain")
    });
  }
  return out;
};
var museums = { met, artic, cleveland, rijksmuseum, smk, mia };

// ../ai.x.com/src/media/providers/photography.ts
var INAT_FIELDS = "(id:!t,uri:!t,species_guess:!t,place_guess:!t,observed_on:!t,faves_count:!t,user:(login:!t,name:!t),taxon:(name:!t,preferred_common_name:!t),photos:(id:!t,url:!t,license_code:!t,attribution:!t,original_dimensions:(width:!t,height:!t)))";
var inaturalist = async (ctx) => {
  const licences = ["cc0"];
  if (ctx.rights !== "no-attribution") licences.push("cc-by");
  if (ctx.rights === "share-alike") licences.push("cc-by-sa");
  const data = await ctx.http.json(
    `https://api.inaturalist.org/v2/observations?${qs({
      q: ctx.query,
      photo_license: licences.join(","),
      quality_grade: "research",
      photos: true,
      per_page: Math.min(50, ctx.perSource + 4),
      order_by: "votes",
      fields: INAT_FIELDS
    })}`
  );
  const out = [];
  for (const o of data.results ?? []) {
    const photo = o.photos?.find((p) => p.url && p.license_code && licences.includes(p.license_code));
    if (!photo?.url) continue;
    const lic = parseLicense(photo.license_code);
    if (!lic) continue;
    const size = (s) => https(photo.url.replace(/\/square\./, `/${s}.`));
    const common = o.taxon?.preferred_common_name;
    const scientific = o.taxon?.name;
    const name = common && scientific ? `${common[0].toUpperCase()}${common.slice(1)} (${scientific})` : common || scientific || o.species_guess || "Wildlife";
    out.push({
      nativeId: String(o.id),
      title: plain(name, 160),
      description: [o.place_guess, o.observed_on].filter(Boolean).join(" \xB7 ") || void 0,
      creator: plain(o.user?.name || o.user?.login, 120) || void 0,
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
      tags: [common, scientific, o.species_guess].filter((t) => !!t)
    });
  }
  return out;
};
var FLICKR_LICENCES = {
  "4": () => license("cc-by", { version: "2.0" }),
  "5": () => license("cc-by-sa", { version: "2.0" }),
  "7": () => license("no-known-restrictions", { label: "No known copyright restrictions" }),
  "8": () => license("us-government"),
  "9": () => license("cc0"),
  "10": () => license("pdm")
};
var flickr = async (ctx) => {
  const key = ctx.env.FLICKR_API_KEY;
  if (!key) return openverseSearch(ctx, { source: "flickr" });
  const ids = ["7", "8", "9", "10"];
  if (ctx.rights !== "no-attribution") ids.push("4");
  if (ctx.rights === "share-alike") ids.push("5");
  const data = await ctx.http.json(
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
      nojsoncallback: 1
    })}`
  );
  if (data.stat === "fail") throw new Error(data.message || "Flickr error");
  const out = [];
  for (const p of data.photos?.photo ?? []) {
    const make = FLICKR_LICENCES[String(p.license)];
    if (!make) continue;
    const sizes = ["o", "k", "h", "l", "z"].map((s) => ({ url: p[`url_${s}`], width: Number(p[`width_${s}`]) || 0, height: Number(p[`height_${s}`]) || 0 })).filter((s) => s.url);
    const full = sizes.find((s) => Math.max(s.width, s.height) <= 6e3) ?? sizes[0];
    if (!full?.url) continue;
    const thumb = sizes.find((s) => Math.max(s.width, s.height) <= 700) ?? full;
    const preview = sizes.find((s) => Math.max(s.width, s.height) <= 1700) ?? full;
    out.push({
      nativeId: p.id,
      title: plain(p.title, 160) || "Untitled",
      description: plain(p.description?._content, 300) || void 0,
      creator: plain(p.ownername, 120) || void 0,
      date: p.datetaken?.slice(0, 10),
      pageUrl: `https://www.flickr.com/photos/${p.owner}/${p.id}`,
      thumbnailUrl: https(thumb.url),
      previewUrl: https(preview.url),
      fullUrl: https(full.url),
      width: full.width || void 0,
      height: full.height || void 0,
      license: make(),
      collection: "Flickr",
      tags: p.tags?.split(" ").slice(0, 12)
    });
  }
  return out;
};
var wordpressPhotos = async (ctx) => {
  const photos = await ctx.http.json(
    `https://wordpress.org/photos/wp-json/wp/v2/photos?${qs({
      search: ctx.query,
      per_page: Math.min(50, ctx.perSource + 4),
      _embed: "wp:featuredmedia",
      _fields: "id,link,content,_links,_embedded"
    })}`
  );
  const out = [];
  for (const p of Array.isArray(photos) ? photos : []) {
    const media = p._embedded?.["wp:featuredmedia"]?.[0];
    if (!media?.source_url) continue;
    const sizes = media.media_details?.sizes ?? {};
    const text = plain(p.content?.rendered, 300) || plain(media.alt_text, 300);
    out.push({
      nativeId: String(p.id),
      title: plain(text, 90) || "Photo",
      description: text || void 0,
      pageUrl: p.link,
      thumbnailUrl: (sizes.medium_large ?? sizes.medium ?? sizes.large)?.source_url ?? media.source_url,
      previewUrl: (sizes["1536x1536"] ?? sizes.large)?.source_url ?? media.source_url,
      fullUrl: media.source_url,
      width: media.media_details?.width,
      height: media.media_details?.height,
      license: license("cc0")
    });
  }
  return out;
};
var unsplash = async (ctx) => {
  const data = await ctx.http.json(
    `https://api.unsplash.com/search/photos?${qs({
      query: ctx.query,
      per_page: Math.min(30, ctx.perSource + 4),
      orientation: ctx.orientation === "any" ? void 0 : ctx.orientation === "portrait" ? "portrait" : "landscape",
      content_filter: "high"
    })}`,
    { headers: { Authorization: `Client-ID ${ctx.env.UNSPLASH_ACCESS_KEY}`, "Accept-Version": "v1" } }
  );
  const utm = `utm_source=${encodeURIComponent(ctx.env.UNSPLASH_APP_NAME || "zupona_ai")}&utm_medium=referral`;
  const out = [];
  for (const p of data.results ?? []) {
    const scale = Math.min(1, 3840 / Math.max(p.width, p.height));
    const text = plain(p.description || p.alt_description, 300);
    out.push({
      nativeId: p.id,
      title: plain(text, 90) || "Photo",
      description: text || void 0,
      creator: plain(p.user?.name, 120) || void 0,
      date: p.created_at?.slice(0, 10),
      pageUrl: `${p.links.html}?${utm}`,
      thumbnailUrl: p.urls.small,
      previewUrl: p.urls.regular,
      fullUrl: `${p.urls.raw}&w=${Math.round(p.width * scale)}&fit=max&q=85&fm=jpg`,
      width: Math.round(p.width * scale),
      height: Math.round(p.height * scale),
      license: license("unsplash"),
      tags: p.tags?.map((t) => t.title ?? "").filter(Boolean),
      downloadTrackingUrl: p.links.download_location
    });
  }
  return out;
};
var pixabay = async (ctx) => {
  const data = await ctx.http.json(
    `https://pixabay.com/api/?${qs({
      key: ctx.env.PIXABAY_API_KEY,
      q: ctx.query.slice(0, 100),
      image_type: "photo",
      safesearch: true,
      order: "popular",
      orientation: ctx.orientation === "landscape" ? "horizontal" : ctx.orientation === "portrait" ? "vertical" : "all",
      per_page: Math.max(3, Math.min(200, ctx.perSource + 4))
    })}`
  );
  const out = [];
  for (const h of data.hits ?? []) {
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
      curated: (h.likes ?? 0) > 200
    });
  }
  return out;
};
var photography = { inaturalist, flickr, "wordpress-photos": wordpressPhotos, unsplash, pixabay };

// ../ai.x.com/src/media/providers/space.ts
var nasa = async (ctx) => {
  const data = await ctx.http.json(
    `https://images-api.nasa.gov/search?${qs({ q: ctx.query, media_type: "image", page_size: Math.min(100, ctx.perSource + 4) })}`
  );
  const out = [];
  for (const item of data.collection?.items ?? []) {
    const d = item.data?.[0];
    const links = item.links ?? [];
    if (!d) continue;
    const orig = links.find((l) => l.rel === "canonical" && /\.(jpe?g|png)$/i.test(l.href));
    const largest = links.filter((l) => l.rel === "alternate" && /\.(jpe?g|png)$/i.test(l.href)).sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    const thumb = links.find((l) => l.rel === "preview") ?? links.find((l) => /~small\./.test(l.href));
    const full = orig ?? largest;
    if (!full) continue;
    const medium = links.find((l) => /~medium\./.test(l.href)) ?? largest ?? full;
    const who = plain(d.secondary_creator || d.photographer || (d.center ? `NASA ${d.center}` : "NASA"), 120);
    out.push({
      nativeId: d.nasa_id,
      title: plain(d.title, 160) || d.nasa_id,
      description: plain(d.description, 300) || void 0,
      creator: who,
      date: d.date_created?.slice(0, 10),
      pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      thumbnailUrl: https(thumb?.href ?? medium.href),
      previewUrl: https(medium.href),
      fullUrl: https(full.href),
      width: full.width,
      height: full.height,
      license: license("us-government", { label: "Public domain (NASA)" }),
      credit: `Credit: ${who}`,
      tags: d.keywords?.slice(0, 12)
    });
  }
  return out;
};
var nasaSvs = async (ctx) => {
  const search = await ctx.http.json(
    `https://svs.gsfc.nasa.gov/api/search/?${qs({ search: ctx.query, limit: 6 })}`
  );
  const ids = (search.results ?? []).filter((r) => r.id).slice(0, 3).map((r) => r.id);
  const pages = await Promise.allSettled(ids.map((id) => ctx.http.json(`https://svs.gsfc.nasa.gov/api/${id}/`)));
  const out = [];
  for (const settled of pages) {
    if (settled.status !== "fulfilled") continue;
    const page = settled.value;
    const images = [page.main_image, ...(page.media_groups ?? []).flatMap((g) => (g.items ?? []).map((i) => i.instance))].filter(
      (i) => !!i && i.media_type === "Image" && /\.(jpe?g|png)$/i.test(i.url)
    );
    if (!images.length) continue;
    const full = [...images].filter((i) => (i.width ?? 0) <= 8192).sort((a, b) => (b.pixels ?? 0) - (a.pixels ?? 0))[0] ?? images[0];
    const preview = page.main_image && /\.(jpe?g|png)$/i.test(page.main_image.url) ? page.main_image : full;
    out.push({
      nativeId: String(page.id),
      title: plain(page.title, 160),
      description: plain(page.description, 300) || void 0,
      creator: "NASA's Scientific Visualization Studio",
      date: page.release_date?.slice(0, 10),
      pageUrl: https(page.url),
      thumbnailUrl: https(preview.url),
      previewUrl: https(preview.url),
      fullUrl: https(full.url),
      width: full.width,
      height: full.height,
      license: license("us-government", { label: "Public domain (NASA)" }),
      credit: "NASA's Scientific Visualization Studio"
    });
  }
  return out;
};
var OBSERVATORIES = {
  "esa-hubble": { search: "https://esahubble.org/images/", site: "https://esahubble.org", credit: "ESA/Hubble & NASA", holder: "ESA/Hubble" },
  "esa-webb": { search: "https://esawebb.org/images/", site: "https://esawebb.org", credit: "ESA/Webb, NASA & CSA", holder: "ESA/Webb" },
  eso: { search: "https://www.eso.org/public/images/", site: "https://www.eso.org", credit: "ESO", holder: "ESO" },
  noirlab: { search: "https://noirlab.edu/public/images/", site: "https://noirlab.edu", credit: "NOIRLab/NSF/AURA", holder: "NOIRLab" }
};
var ENTRY = /\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*width:\s*(\d+),\s*height:\s*(\d+),\s*src:\s*'([^']+)',\s*url:\s*'([^']+)'/g;
function unescapeJs(text) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, seq) => {
    if (seq[0] === "u" || seq[0] === "x") return String.fromCharCode(parseInt(seq.slice(1), 16));
    return seq;
  });
}
function observatory(id) {
  const o = OBSERVATORIES[id];
  return async (ctx) => {
    const html = await ctx.http.text(`${o.search}?${qs({ search: ctx.query })}`);
    const start = html.indexOf("var images");
    if (start < 0) return [];
    const block = html.slice(start, html.indexOf("];", start) + 2);
    const out = [];
    for (const m of block.matchAll(ENTRY)) {
      const [, imageId, rawTitle, w, h, src, path] = m;
      const width = Number(w);
      const height = Number(h);
      const size = (folder) => https(src.replace("/thumb300y/", `/${folder}/`));
      const huge = width * height > 25e6;
      const scale = huge ? 4e3 / Math.max(width, height) : 1;
      out.push({
        nativeId: imageId,
        title: plain(unescapeJs(rawTitle), 160),
        creator: o.holder,
        pageUrl: `${o.site}${path}`,
        thumbnailUrl: size("thumb700x"),
        previewUrl: size("screen"),
        fullUrl: size(huge ? "publicationjpg" : "large"),
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        license: license("cc-by", { version: "4.0" }),
        credit: o.credit,
        curated: true
      });
      if (out.length >= ctx.perSource) break;
    }
    return out;
  };
}
var space = {
  nasa,
  "nasa-svs": nasaSvs,
  "esa-hubble": observatory("esa-hubble"),
  "esa-webb": observatory("esa-webb"),
  eso: observatory("eso"),
  noirlab: observatory("noirlab")
};

// ../ai.x.com/src/media/providers/index.ts
var SEARCHERS = {
  ...encyclopedic,
  ...space,
  ...museums,
  ...libraries,
  ...photography
};

// ../ai.x.com/src/media/search.ts
var RIGHTS = ["no-attribution", "attribution", "share-alike"];
var TOPICS = ["nature", "ocean", "space", "history", "science", "culture"];
var DEFAULT_BUDGET = 45;
var SLOW_DEADLINE = 16e3;
function disabledList(env) {
  return new Set((env.MEDIA_DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}
function sourceStates(env = {}) {
  const disabled = disabledList(env);
  return SOURCES.map((s) => {
    const missingKeys = (s.keys ?? []).filter((k) => !env[k]);
    return { ...s, missingKeys, enabled: !missingKeys.length && !disabled.has(s.id) && !!SEARCHERS[s.id] };
  });
}
function normaliseOptions(opts) {
  const clamp = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  const orientation = opts.orientation === "landscape" || opts.orientation === "portrait" ? opts.orientation : "any";
  return {
    query: (opts.query ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    topic: opts.topic && TOPICS.includes(opts.topic) ? opts.topic : void 0,
    rights: opts.rights && RIGHTS.includes(opts.rights) ? opts.rights : "share-alike",
    orientation,
    minSize: clamp(opts.minSize, 0, 8e3, 1e3),
    sources: opts.sources?.length ? opts.sources : void 0,
    perSource: clamp(opts.perSource, 3, 30, 12),
    limit: clamp(opts.limit, 1, 300, 80),
    timeoutMs: clamp(opts.timeoutMs, 1500, 2e4, 6500)
  };
}
async function run(opts, env, deps, onStart, onBatch) {
  const words = terms(opts.query);
  const budget = { left: Number(env.MEDIA_SUBREQUEST_BUDGET) || DEFAULT_BUDGET };
  const wanted = opts.sources ? new Set(opts.sources) : null;
  const states = sourceStates(env).filter((s) => !wanted || wanted.has(s.id));
  const names = new Map(SOURCES.map((s) => [s.id, s.name]));
  onStart(
    states.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.enabled ? "pending" : s.missingKeys.length ? "needs-key" : "skipped",
      count: 0,
      found: 0,
      ms: 0
    }))
  );
  let candidates = 0;
  await Promise.all(
    states.filter((s) => s.enabled).map(async (source) => {
      const slow = source.slow && !(source.id === "flickr" && env.FLICKR_API_KEY);
      const deadline = slow ? SLOW_DEADLINE : opts.timeoutMs + 2500;
      const http = createHttp({ userAgent: env.MEDIA_USER_AGENT, timeoutMs: slow ? SLOW_DEADLINE - 500 : opts.timeoutMs, budget, fetchImpl: deps.fetch });
      const ctx = { query: opts.query, terms: words, perSource: opts.perSource, rights: opts.rights, orientation: opts.orientation, minSize: opts.minSize, env, http };
      const report = { id: source.id, name: source.name, status: "ok", count: 0, found: 0, ms: 0 };
      const t0 = Date.now();
      let timer;
      let results = [];
      try {
        const found = await Promise.race([
          SEARCHERS[source.id](ctx),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("timed out")), deadline);
          })
        ]);
        report.found = found.length;
        candidates += found.length;
        const kept = found.filter((c) => {
          if (!c.fullUrl || !c.thumbnailUrl || !allowed(c.license, opts.rights)) return false;
          const known = c.width && c.height ? Math.max(c.width, c.height) : 0;
          return !known || known >= opts.minSize;
        });
        const sourceName = names.get(source.id) ?? source.id;
        results = kept.map((c, position) => {
          const { nativeId, ...rest } = c;
          const score = scoreCandidate(c, {
            position,
            count: kept.length,
            quality: source.quality,
            topicMatch: !!opts.topic && source.topics.includes(opts.topic),
            terms: words,
            orientation: opts.orientation
          });
          return {
            ...rest,
            id: `${source.id}:${nativeId}`,
            source: source.id,
            sourceName,
            attribution: attributionFor({ ...c, sourceName }),
            quality: qualityLabel(c),
            score: Math.round(score * 1e3) / 1e3
          };
        }).sort((a, b) => b.score - a.score).slice(0, opts.perSource);
        report.count = results.length;
        if (!results.length) report.status = "empty";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        report.status = /timed out/.test(message) ? "timeout" : "error";
        report.error = message;
      } finally {
        clearTimeout(timer);
        report.ms = Date.now() - t0;
      }
      onBatch({ report, results });
    })
  );
  return candidates;
}
async function searchMedia(options, env = {}, deps = {}) {
  const started = Date.now();
  const opts = normaliseOptions(options);
  if (!opts.query) return { query: "", rights: opts.rights, minSize: opts.minSize, results: [], sources: [], candidates: 0, tookMs: 0 };
  const reports = /* @__PURE__ */ new Map();
  const all = [];
  const candidates = await run(
    opts,
    env,
    deps,
    (initial) => initial.forEach((r) => reports.set(r.id, r)),
    ({ report, results: results2 }) => {
      reports.set(report.id, report);
      all.push(...results2);
    }
  );
  const results = mergeResults(all, opts.limit);
  const counts = /* @__PURE__ */ new Map();
  for (const r of results) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  const sources = [...reports.values()].map((r) => {
    const count = counts.get(r.id) ?? 0;
    return { ...r, count, status: r.status === "ok" && !count ? "empty" : r.status };
  });
  sources.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { query: opts.query, rights: opts.rights, minSize: opts.minSize, results, sources, candidates, tookMs: Date.now() - started };
}
function streamMedia(options, env = {}, deps = {}) {
  const opts = normaliseOptions(options);
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}
`));
      const started = Date.now();
      try {
        if (!opts.query) {
          send({ type: "start", query: "", rights: opts.rights, minSize: opts.minSize, sources: [] });
        } else {
          const candidates = await run(
            opts,
            env,
            deps,
            (sources) => send({ type: "start", query: opts.query, rights: opts.rights, minSize: opts.minSize, sources }),
            ({ report, results }) => send({ type: "source", report, results })
          );
          send({ type: "done", candidates, tookMs: Date.now() - started });
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    }
  });
}
export {
  RIGHTS,
  terms,
  SOURCES,
  SOURCE_GROUPS,
  TOPICS,
  allowed,
  attributionFor,
  mergeResults,
  normaliseOptions,
  parseLicense,
  searchMedia,
  sourceStates,
  streamMedia
};
