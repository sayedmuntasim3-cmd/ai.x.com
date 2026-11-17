/**
 * Free, documented research APIs that answer from the cloud (State §4g):
 * Crossref, Europe PMC, NCBI PubMed (E-utilities), the Internet Archive and
 * the Library of Congress. Each is a ResearchProvider for the research desk
 * (`research-desk.mjs` `gatherCorpus`), so it adds sources without a second
 * research path.
 *
 * Evidence rule: every hit's `url` is the public record URL whose response
 * holds the exact text the corpus keeps (a Crossref work, a Europe PMC core
 * record, a PubMed abstract, an Archive metadata record, a LOC item in JSON).
 * The source desk can open that URL again and find the same numbers. The
 * human-facing page (doi.org, europepmc.org, pubmed, archive.org/details,
 * the LOC item page) travels as `meta.canonical`.
 *
 * Safety: one fixed https host per source; any other host, a redirect to
 * another host or a private address is refused (SSRF). Every request has a
 * timeout, a size cap, a polite minimum gap between requests to the same
 * source, and a bounded retry with backoff on 429, 5xx and network errors
 * (Retry-After honoured up to a cap). No key, no account, no personal data:
 * requests carry only the project's user agent and, for NCBI, a tool name.
 *
 * Runtime-agnostic (browser and Node): the caller injects fetch; tests also
 * inject sleep and the clock.
 */
import { publicUrl, safeFetch } from "./net-guard.mjs";

/** @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike */
/** @typedef {{ source: string, canonical: string, kind: string, date?: string, doi?: string, pmid?: string }} HitMeta */
/** @typedef {{ title: string, url: string, snippet?: string, meta?: HitMeta }} SourceHit */
/** @typedef {{ id: string, search(query: string, limit: number): Promise<SourceHit[]>, read(hit: SourceHit): Promise<{ title: string, text: string, references: string[] } | null> }} SourceProvider */
/** @typedef {{ fetch: FetchLike, sleep?: (ms: number) => Promise<void>, now?: () => number, language?: string }} SourceOptions */

const UA = "ZuponaStudio/1.0 (documentary research desk; https://github.com/sayedmuntasim3-cmd/ai.x.com)";

/** The five sources: fixed host, gap between requests, timeout (LOC search measured at 20-27 s). */
export const RESEARCH_SOURCES = Object.freeze({
  crossref: Object.freeze({ host: "api.crossref.org", name: "Crossref", minGapMs: 1000, timeoutMs: 20_000 }),
  europepmc: Object.freeze({ host: "www.ebi.ac.uk", name: "Europe PMC", minGapMs: 500, timeoutMs: 20_000 }),
  // NCBI allows 3 requests a second without a key.
  pubmed: Object.freeze({ host: "eutils.ncbi.nlm.nih.gov", name: "PubMed", minGapMs: 400, timeoutMs: 20_000 }),
  archive: Object.freeze({ host: "archive.org", name: "Internet Archive", minGapMs: 1000, timeoutMs: 20_000 }),
  loc: Object.freeze({ host: "www.loc.gov", name: "Library of Congress", minGapMs: 2000, timeoutMs: 45_000 }),
});

export const SOURCE_REQUEST = Object.freeze({ retries: 2, backoffMs: 1000, maxRetryAfterMs: 10_000, bytes: 2_000_000 });

const RETRY = new Set([429, 500, 502, 503, 504]);

/** An error with a short code the trace can show (http-404, timeout, host-refused, bad-json, too-large). */
export class SourceError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * A client bound to one source: host check on every hop, serialized requests
 * with a minimum gap, timeout, size cap and bounded retries.
 * @param {keyof typeof RESEARCH_SOURCES} id @param {SourceOptions} o
 */
export function sourceClient(id, o) {
  const policy = RESEARCH_SOURCES[id];
  const sleep = o.sleep ?? ((/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now ?? (() => Date.now());
  let last = -Infinity;
  /** @type {Promise<unknown>} */
  let queue = Promise.resolve();
  const onHost = (/** @type {string} */ url) => {
    try { const u = new URL(url); return u.protocol === "https:" && u.hostname === policy.host && !u.port && publicUrl(url); } catch { return false; }
  };
  // Every hop of a redirect goes through this, so a redirect off the source's own host is refused.
  const hop = (/** @type {string} */ url, /** @type {RequestInit | undefined} */ init) => {
    if (!onHost(url)) throw new SourceError("host-refused", `${policy.name}: refused ${url.slice(0, 120)}`);
    return o.fetch(url, init);
  };
  /** @param {string} url @param {string} accept */
  const once = async (url, accept) => {
    const wait = last + policy.minGapMs - now();
    if (wait > 0) await sleep(wait);
    last = now();
    try {
      return await safeFetch(hop, url, { headers: { "user-agent": UA, accept }, signal: AbortSignal.timeout(policy.timeoutMs) });
    } catch (error) {
      if (error instanceof SourceError) throw error;
      const name = /** @type {any} */ (error)?.name;
      throw new SourceError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", `${policy.name}: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`);
    }
  };
  /** @param {string} url @param {"json" | "text"} as */
  const request = async (url, as) => {
    if (!onHost(url)) throw new SourceError("host-refused", `${policy.name}: refused ${url.slice(0, 120)}`);
    const accept = as === "json" ? "application/json" : "text/plain";
    for (let attempt = 0; ; attempt += 1) {
      /** @type {Response | null} */
      let res = null;
      /** @type {SourceError | null} */
      let failure = null;
      try { res = await once(url, accept); } catch (error) { failure = /** @type {SourceError} */ (error); }
      if (failure && failure.code === "host-refused") throw failure;
      const retryable = failure ? true : RETRY.has(/** @type {Response} */ (res).status);
      if (!retryable && res) {
        if (!res.ok) { await res.body?.cancel().catch(() => {}); throw new SourceError(`http-${res.status}`, `${policy.name}: HTTP ${res.status}`); }
        const body = await res.text();
        if (body.length > SOURCE_REQUEST.bytes) throw new SourceError("too-large", `${policy.name}: response over ${SOURCE_REQUEST.bytes} bytes`);
        if (as === "text") return body;
        try { return JSON.parse(body); } catch { throw new SourceError("bad-json", `${policy.name}: the response is not JSON`); }
      }
      if (attempt >= SOURCE_REQUEST.retries) {
        if (failure) throw failure;
        throw new SourceError(`http-${/** @type {Response} */ (res).status}`, `${policy.name}: HTTP ${/** @type {Response} */ (res).status} after ${attempt + 1} tries`);
      }
      const after = Number(res?.headers.get("retry-after"));
      await res?.body?.cancel().catch(() => {});
      await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, SOURCE_REQUEST.maxRetryAfterMs) : SOURCE_REQUEST.backoffMs * 3 ** attempt);
    }
  };
  return {
    policy,
    /** One request at a time per source. @param {string} url @param {"json" | "text"} [as] @returns {Promise<any>} */
    get(url, as = "json") {
      const run = queue.then(() => request(url, as));
      queue = run.catch(() => {});
      return run;
    },
  };
}

/** Plain text from an HTML or JATS fragment. @param {unknown} s */
export function plainText(s) {
  const text = Array.isArray(s) ? s.map(String).join(" ") : String(s ?? "");
  return text.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}

/** Labelled lines, skipping empty values. @param {[string, unknown][]} rows */
function record(rows) {
  return rows.map(([k, v]) => [k, plainText(v)]).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}

/** A Crossref date ({ "date-parts": [[2007, 4]] }) as 2007-04. @param {any} d */
function crossrefDate(d) {
  const p = d?.["date-parts"]?.[0];
  return Array.isArray(p) && p[0] ? p.filter((/** @type {unknown} */ x) => x != null).map((/** @type {unknown} */ x, /** @type {number} */ i) => (i ? String(x).padStart(2, "0") : String(x))).join("-") : "";
}

const DOI = /^10\.\d{4,9}\/\S+$/;

/** Crossref: scholarly metadata (title, journal, date, authors; abstract when the publisher deposits one). @param {SourceOptions} o @returns {SourceProvider} */
export function crossrefProvider(o) {
  const c = sourceClient("crossref", o);
  const workUrl = (/** @type {string} */ doi) => `https://api.crossref.org/works/${doi.split("/").map(encodeURIComponent).join("/")}`;
  return {
    id: "crossref",
    async search(query, limit) {
      const data = await c.get(`https://api.crossref.org/works?${new URLSearchParams({ query, rows: String(limit), select: "DOI,title,container-title,issued,type" })}`);
      return (data?.message?.items ?? []).filter((/** @type {any} */ w) => DOI.test(String(w.DOI ?? "")) && w.title?.[0]).map((/** @type {any} */ w) => ({
        title: plainText(w.title[0]),
        url: workUrl(String(w.DOI)),
        snippet: plainText(w["container-title"]?.[0] ?? ""),
        meta: { source: "crossref", canonical: `https://doi.org/${w.DOI}`, kind: "bibliographic record", doi: String(w.DOI), date: crossrefDate(w.issued) },
      }));
    },
    async read(hit) {
      const w = (await c.get(hit.url))?.message;
      if (!w?.title?.[0]) return null;
      const authors = (w.author ?? []).slice(0, 8).map((/** @type {any} */ a) => [a.given, a.family].filter(Boolean).join(" ") || a.name).filter(Boolean).join("; ");
      const text = record([["Source", "Crossref bibliographic record"], ["Title", w.title[0]], ["Journal", w["container-title"]?.[0]], ["Publisher", w.publisher], ["Published", crossrefDate(w.issued)], ["Authors", authors], ["Type", w.type], ["DOI", w.DOI], ["Abstract", w.abstract ?? "(no abstract deposited)"]]);
      return { title: plainText(w.title[0]), text, references: [] };
    },
  };
}

/** Europe PMC: life-science papers and preprints with abstracts (core records). @param {SourceOptions} o @returns {SourceProvider} */
export function europePmcProvider(o) {
  const c = sourceClient("europepmc", o);
  const base = "https://www.ebi.ac.uk/europepmc/webservices/rest/search";
  const english = (o.language ?? "en") === "en";
  return {
    id: "europepmc",
    async search(query, limit) {
      const data = await c.get(`${base}?${new URLSearchParams({ query: english ? `(${query}) AND LANG:eng` : query, format: "json", resultType: "lite", pageSize: String(limit) })}`);
      return (data?.resultList?.result ?? []).filter((/** @type {any} */ r) => /^[A-Z]{3}$/.test(String(r.source)) && /^[A-Z0-9]+$/i.test(String(r.id)) && r.title).map((/** @type {any} */ r) => ({
        title: plainText(r.title),
        url: `${base}?${new URLSearchParams({ query: `EXT_ID:${r.id} AND SRC:${r.source}`, format: "json", resultType: "core", pageSize: "1" })}`,
        snippet: plainText(r.journalTitle ?? r.authorString ?? ""),
        meta: { source: "europepmc", canonical: `https://europepmc.org/article/${r.source}/${r.id}`, kind: r.source === "PPR" ? "preprint (not peer reviewed)" : "paper", date: String(r.firstPublicationDate ?? r.pubYear ?? ""), ...(r.doi ? { doi: String(r.doi) } : {}), ...(r.pmid ? { pmid: String(r.pmid) } : {}) },
      }));
    },
    async read(hit) {
      const r = (await c.get(hit.url))?.resultList?.result?.[0];
      if (!r?.title) return null;
      const text = record([["Source", r.source === "PPR" ? "Europe PMC preprint record (not peer reviewed)" : "Europe PMC record"], ["Title", r.title], ["Journal", r.journalInfo?.journal?.title ?? r.bookOrReportDetails?.publisher], ["Published", r.firstPublicationDate ?? r.pubYear], ["Authors", r.authorString], ["DOI", r.doi], ["PMID", r.pmid], ["Abstract", r.abstractText ?? "(no abstract)"]]);
      return { title: plainText(r.title), text, references: [] };
    },
  };
}

/** NCBI PubMed through E-utilities: esearch (relevance) and esummary for titles, efetch for the abstract. @param {SourceOptions} o @returns {SourceProvider} */
export function pubmedProvider(o) {
  const c = sourceClient("pubmed", o);
  const base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
  const tool = { tool: "zupona-studio" };
  return {
    id: "pubmed",
    async search(query, limit) {
      const found = await c.get(`${base}/esearch.fcgi?${new URLSearchParams({ db: "pubmed", term: query, retmode: "json", retmax: String(limit), sort: "relevance", ...tool })}`);
      const ids = (found?.esearchresult?.idlist ?? []).map(String).filter((/** @type {string} */ id) => /^\d{1,10}$/.test(id));
      if (!ids.length) return [];
      const sum = (await c.get(`${base}/esummary.fcgi?${new URLSearchParams({ db: "pubmed", id: ids.join(","), retmode: "json", ...tool })}`))?.result ?? {};
      return ids.filter((/** @type {string} */ id) => sum[id]?.title).map((/** @type {string} */ id) => ({
        title: plainText(sum[id].title),
        url: `${base}/efetch.fcgi?${new URLSearchParams({ db: "pubmed", id, rettype: "abstract", retmode: "text", ...tool })}`,
        snippet: plainText(sum[id].source ?? ""),
        meta: { source: "pubmed", canonical: `https://pubmed.ncbi.nlm.nih.gov/${id}/`, kind: "paper", pmid: id, date: String(sum[id].pubdate ?? "") },
      }));
    },
    async read(hit) {
      const body = String(await c.get(hit.url, "text")).trim();
      if (body.length < 80) return null;
      return { title: hit.title, text: `Source: PubMed abstract (PMID ${hit.meta?.pmid ?? ""})\n${body}`, references: [] };
    },
  };
}

const ARCHIVE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

/** Internet Archive: text items only (books, reports, documents; not audio, video or uploads of other kinds): item metadata (title, creator, date, description) from the advanced search and metadata APIs. @param {SourceOptions} o @returns {SourceProvider} */
export function archiveProvider(o) {
  const c = sourceClient("archive", o);
  return {
    id: "archive",
    async search(query, limit) {
      const params = new URLSearchParams({ q: `(${query}) AND mediatype:texts`, rows: String(limit), output: "json" });
      for (const f of ["identifier", "title", "date", "mediatype"]) params.append("fl[]", f);
      const data = await c.get(`https://archive.org/advancedsearch.php?${params}`);
      return (data?.response?.docs ?? []).filter((/** @type {any} */ d) => ARCHIVE_ID.test(String(d.identifier ?? "")) && d.title).map((/** @type {any} */ d) => ({
        title: plainText(d.title),
        url: `https://archive.org/metadata/${d.identifier}`,
        snippet: plainText(d.mediatype ?? ""),
        meta: { source: "archive", canonical: `https://archive.org/details/${d.identifier}`, kind: `archive item (${plainText(d.mediatype ?? "unknown")})`, date: String(d.date ?? "") },
      }));
    },
    async read(hit) {
      const m = (await c.get(hit.url))?.metadata;
      if (!m?.title) return null;
      const text = record([["Source", "Internet Archive item metadata"], ["Title", m.title], ["Creator", m.creator], ["Date", m.date], ["Publisher", m.publisher], ["Subject", m.subject], ["Description", m.description]]);
      return { title: plainText(m.title), text, references: [] };
    },
  };
}

const LOC_ITEM = /^https:\/\/www\.loc\.gov\/item\/[A-Za-z0-9._-]+\/$/;

/** Library of Congress: catalogued items (photos, manuscripts, maps, books) from the loc.gov JSON API. @param {SourceOptions} o @returns {SourceProvider} */
export function locProvider(o) {
  const c = sourceClient("loc", o);
  return {
    id: "loc",
    async search(query, limit) {
      // Results mix collections and items; ask for more and keep catalogued items.
      const data = await c.get(`https://www.loc.gov/search/?${new URLSearchParams({ q: query, fo: "json", c: String(Math.min(50, limit * 3)) })}`);
      return (data?.results ?? []).map((/** @type {any} */ r) => ({ r, url: String(r.url ?? "").replace(/^http:/, "https:") })).filter((/** @type {any} */ x) => LOC_ITEM.test(x.url) && x.r.title).slice(0, limit).map((/** @type {any} */ x) => ({
        title: plainText(x.r.title),
        url: `${x.url}?fo=json`,
        snippet: plainText(x.r.description?.[0] ?? ""),
        meta: { source: "loc", canonical: x.url, kind: `catalogued item (${plainText(x.r.original_format ?? "unknown")})`, date: String(x.r.date ?? "") },
      }));
    },
    async read(hit) {
      const it = (await c.get(hit.url))?.item;
      if (!it?.title) return null;
      const text = record([["Source", "Library of Congress catalogue record"], ["Title", it.title], ["Date", it.date], ["Created or published", it.created_published], ["Contributors", (it.contributor_names ?? []).slice(0, 8)], ["Summary", it.summary ?? it.description], ["Notes", (it.notes ?? []).slice(0, 4)], ["Subjects", (it.subject_headings ?? []).slice(0, 8)]]);
      return { title: plainText(it.title), text, references: [] };
    },
  };
}

const FACTORIES = Object.freeze({ crossref: crossrefProvider, europepmc: europePmcProvider, pubmed: pubmedProvider, archive: archiveProvider, loc: locProvider });

/**
 * The providers named in a list such as "crossref,pubmed,loc" (unknown names
 * are reported, never guessed).
 * @param {string | string[] | undefined} names @param {SourceOptions} o
 */
export function sourceProviders(names, o) {
  const list = (Array.isArray(names) ? names : String(names ?? "").split(",")).map((n) => n.trim().toLowerCase()).filter(Boolean);
  const unknown = list.filter((n) => !(n in FACTORIES));
  const providers = [...new Set(list.filter((n) => n in FACTORIES))].map((n) => FACTORIES[/** @type {keyof typeof FACTORIES} */ (n)](o));
  return { providers, unknown };
}
