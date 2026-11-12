/**
 * The source desk, in code: every source the research stage cites is opened.
 * A model can write a plausible URL that does not exist, or a number its
 * source never says; nothing upstream caught either. Here each page is
 * fetched, a source that is gone (404/410) is struck, and every number in a
 * fact's value is looked for on its pages. Each fact gets a check:
 *   verified     a source page opened and shows the fact's numbers
 *   opened       a source page opened; the value has no number to look for (or the page is a PDF)
 *   unconfirmed  the pages opened but none shows the number (it may be spelled out, or wrong)
 *   unreachable  no page could be read (blocked, timed out); nothing is known either way
 * Facts whose every source is gone are dropped. Sources are also counted by
 * site, so a film that rests on one or two sites is flagged.
 *
 * Runtime-agnostic: the caller injects fetch (the Worker's, or a fake in tests).
 */

/** @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike */
/** @typedef {"verified" | "opened" | "unconfirmed" | "unreachable"} FactCheck */

export const SOURCE_LIMITS = Object.freeze({ pages: 80, bytes: 3_000_000, timeoutMs: 12_000, concurrency: 6, minSites: 4 });

const UA = "ZuponaStudio/1.0 (documentary source check; https://github.com/sayedmuntasim3-cmd/ai.x.com)";

/**
 * The readable text of a page, lowercased, for looking numbers up.
 * @param {string} html
 */
export function pageText(html) {
  return String(html ?? "")
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&#8217;/g, "'")
    .replace(/\s+/g, " ").toLowerCase();
}

/**
 * The numbers a fact's value states ("$3.2 billion in 2014" -> ["3.2", "2014"]).
 * @param {string} value
 */
export function valueNumbers(value) {
  return [...String(value ?? "").matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/[,.]$/, "")).filter((n) => /\d/.test(n));
}

/**
 * Does the page show this number, written with or without thousands commas?
 * A number is matched whole ("15" is not found inside "1500").
 * @param {string} text lowercased page text @param {string} n
 */
export function pageHasNumber(text, n) {
  const plain = n.replace(/,/g, "");
  const grouped = plain.includes(".") ? plain : plain.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [plain, grouped].some((form) => new RegExp(`(?<![\\d.,])${esc(form)}(?![\\d]|[.,]\\d)`).test(text));
}

/** The site a URL belongs to (www. dropped). @param {string} url */
export function siteOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

/**
 * Open one page. Returns its status and text (empty for PDFs and failures).
 * @param {FetchLike} get @param {string} url @param {number} timeoutMs @param {number} maxBytes
 * @returns {Promise<{ status: number, text: string, kind: "html" | "pdf" | "other" | "error" }>}
 */
async function openPage(get, url, timeoutMs, maxBytes) {
  try {
    const res = await get(url, { redirect: "follow", headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.5" }, signal: AbortSignal.timeout(timeoutMs) });
    const type = String(res.headers.get("content-type") ?? "").toLowerCase();
    if (!res.ok) { await res.body?.cancel().catch(() => {}); return { status: res.status, text: "", kind: "error" }; }
    if (type.includes("pdf")) { await res.body?.cancel().catch(() => {}); return { status: res.status, text: "", kind: "pdf" }; }
    if (!/html|text|xml|json/.test(type) && type) { await res.body?.cancel().catch(() => {}); return { status: res.status, text: "", kind: "other" }; }
    const body = (await res.text()).slice(0, maxBytes);
    return { status: res.status, text: pageText(body), kind: "html" };
  } catch {
    return { status: 0, text: "", kind: "error" };
  }
}

/**
 * Check every fact of a research file against its own sources.
 * @param {{ facts?: any[] }} research
 * @param {{ fetch: FetchLike, limits?: Partial<typeof SOURCE_LIMITS> }} o
 */
export async function checkSources(research, o) {
  const limits = { ...SOURCE_LIMITS, ...(o.limits ?? {}) };
  /** @type {any[]} */
  const facts = Array.isArray(research?.facts) ? research.facts : [];
  /** @param {any} f @returns {string[]} */
  const cited = (f) => (Array.isArray(f.sources) ? f.sources : []).filter((/** @type {unknown} */ u) => typeof u === "string" && /^https?:\/\//.test(u));
  const urls = [...new Set(facts.flatMap(cited))].slice(0, limits.pages);
  /** @type {Map<string, { status: number, text: string, kind: string }>} */
  const pages = new Map();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limits.concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next];
      next += 1;
      pages.set(url, await openPage(o.fetch, url, limits.timeoutMs, limits.bytes));
    }
  }));
  const gone = (/** @type {number} */ s) => s === 404 || s === 410;
  /** @type {any[]} */
  const kept = [];
  /** @type {{ id: string, claim: string }[]} */
  const dropped = [];
  for (const f of facts) {
    const sources = cited(f);
    const numbers = valueNumbers(`${f.value ?? ""}`);
    const rows = sources.map((url) => {
      const p = pages.get(url);
      if (!p) return { url, status: null, found: null }; // over the page cap: not opened
      const found = p.kind === "html" && numbers.length ? numbers.every((n) => pageHasNumber(p.text, n)) : null;
      return { url, status: p.status, kind: p.kind, found };
    });
    const live = rows.filter((r) => r.status !== null && r.status >= 200 && r.status < 300);
    if (sources.length && rows.every((r) => r.status !== null && gone(r.status))) { dropped.push({ id: String(f.id ?? ""), claim: String(f.claim ?? "").slice(0, 120) }); continue; }
    /** @type {FactCheck} */
    const status = !live.length ? "unreachable" : !numbers.length || live.every((r) => r.kind !== "html") ? "opened" : live.some((r) => r.found) ? "verified" : "unconfirmed";
    const sites = [...new Set(sources.map(siteOf).filter(Boolean))];
    kept.push({ ...f, sources: sources.filter((u) => !(pages.get(u) && gone(/** @type {any} */ (pages.get(u)).status))), check: { status, sites: sites.length, pages: rows } });
  }
  const sites = [...new Set(kept.flatMap((f) => f.sources.map(siteOf)).filter(Boolean))];
  const count = (/** @type {FactCheck} */ s) => kept.filter((f) => f.check.status === s).length;
  const summary = {
    pagesOpened: [...pages.values()].filter((p) => p.status >= 200 && p.status < 300).length,
    pagesGone: [...pages.values()].filter((p) => gone(p.status)).length,
    pagesUnreadable: [...pages.values()].filter((p) => !(p.status >= 200 && p.status < 300) && !gone(p.status)).length,
    pagesNotOpened: Math.max(0, new Set(facts.flatMap(cited)).size - pages.size),
    facts: { kept: kept.length, dropped: dropped.length, verified: count("verified"), opened: count("opened"), unconfirmed: count("unconfirmed"), unreachable: count("unreachable") },
    singleSiteNumbers: kept.filter((f) => f.check.sites < 2 && valueNumbers(`${f.value ?? ""}`).length).map((f) => String(f.id ?? "")),
    sites: sites.length,
  };
  return { research: { ...research, facts: kept }, dropped, summary };
}

/** What the run reports as gaps from a source check. @param {Awaited<ReturnType<typeof checkSources>>} r */
export function sourceGaps(r) {
  /** @type {string[]} */
  const out = [];
  if (r.dropped.length) out.push(`sources: ${r.dropped.length} fact${r.dropped.length > 1 ? "s were" : " was"} dropped because every cited page is gone (404): ${r.dropped.slice(0, 6).map((d) => d.id).join(", ")}.`);
  if (r.summary.sites < SOURCE_LIMITS.minSites) out.push(`sources: the facts rest on ${r.summary.sites} site${r.summary.sites === 1 ? "" : "s"}; at least ${SOURCE_LIMITS.minSites} independent sites are expected.`);
  return out;
}
