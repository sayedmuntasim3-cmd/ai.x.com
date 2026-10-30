/**
 * Autonomous media fetching for one shot: cached provider searches, a
 * per-provider rate limiter, single-flight for identical searches, a
 * fail-closed licence filter and the layer fallbacks (graphics, variants,
 * labelled AI reconstruction) that keep a run from ever stopping for a
 * shortage. Pure ES module with injected dependencies, so it runs in the
 * Worker and in Node regression tests alike.
 */

/**
 * @typedef {"image" | "video"} MediaKind
 * @typedef {1 | 2 | 3 | 4 | 5} MediaLayer
 * @typedef {{ id: string, source: string, mediaType: MediaKind, title: string, previewUrl: string | null, mediaUrl: string | null, sourcePageUrl: string, creator: string | null, license: string | null, licenseUrl: string | null, durationSeconds: number | null, width: number | null, height: number | null, attributionRequired: boolean }} MediaResult
 * @typedef {"CC0-1.0" | "PDM-1.0" | "PUBLIC-DOMAIN" | "CC-BY" | "FREE-WITH-CREDIT" | "US-GOV-PD" | "PEXELS" | "PIXABAY" | "MUSEUM-OPEN-ACCESS" | "ZUPONA-PROCEDURAL" | "ZUPONA-GENERATED" | "UNKNOWN"} LicenseId
 * @typedef {{ licenseId: LicenseId, allowed: boolean, needsPageCheck: boolean, reason: string }} LicenseDecision
 * @typedef {MediaResult & { layer: MediaLayer, rights: LicenseDecision }} MediaCandidate
 */

/**
 * Map a provider result to a licence decision from its search metadata.
 * Share-alike, non-commercial, no-derivatives and anything unrecognised are
 * blocked. Licences that are reusable but whose item page can still carry
 * restrictions (third-party credits, trademarks, personality rights) are
 * allowed with needsPageCheck: true; fetchShotMedia drops those unless an
 * item-level verifier clears them.
 * @param {Pick<MediaResult, "source" | "license" | "licenseUrl">} result
 * @returns {LicenseDecision}
 */
export function classifyLicense(result) {
  const raw = (result.license ?? "").trim();
  const text = (raw + " " + (result.licenseUrl ?? "")).toLowerCase();
  /**
   * @param {LicenseId} licenseId
   * @param {boolean} allowed
   * @param {boolean} needsPageCheck
   * @param {string} reason
   * @returns {LicenseDecision}
   */
  const decide = (licenseId, allowed, needsPageCheck, reason) => ({ licenseId, allowed, needsPageCheck, reason });

  if (result.source === "pexels") return decide("PEXELS", true, false, "Pexels License");
  if (result.source === "pixabay") return decide("PIXABAY", true, false, "Pixabay Content License");
  if (/-sa\b|by-sa|sharealike|share-alike/.test(text)) return decide("UNKNOWN", false, false, "Share-alike licences would put conditions on the whole film.");
  if (/-nc\b|noncommercial|non-commercial/.test(text)) return decide("UNKNOWN", false, false, "Non-commercial licences do not allow a monetised film.");
  if (/-nd\b|noderiv|no-deriv/.test(text)) return decide("UNKNOWN", false, false, "No-derivatives licences do not allow grading, cropping or editing.");
  if (result.source === "nasa") {
    if (/©|\(c\)|copyright|courtesy|\besa\b|jaxa|roscosmos|spacex|getty|reuters|\bap\b|associated press/.test(text)) {
      return decide("UNKNOWN", false, false, "NASA item credits a third party; NASA's own rule does not cover it.");
    }
    return decide("US-GOV-PD", true, true, "NASA media: the item page must confirm a NASA credit and no logos.");
  }
  if (/\bcc0\b|publicdomain\/zero/.test(text)) return decide("CC0-1.0", true, result.source !== "smithsonian", "CC0");
  if (/public domain mark|publicdomain\/mark|\bpdm\b/.test(text)) return decide("PDM-1.0", true, true, "Public Domain Mark");
  if (/publicdomain\/1\.0|creativecommons\.org\/licenses\/publicdomain/.test(text)) return decide("PUBLIC-DOMAIN", true, true, "Creative Commons public domain dedication");
  if (/\bcc[ -]by\b|licenses\/by\/|^by \d|\bby \d\.\d|creative commons attribution(?! -?share| -?non| -?no)/.test(text)) return decide("CC-BY", true, true, "Attribution licence: credit required.");
  if (result.source === "wikimedia" && /^public domain$/i.test(raw)) return decide("PUBLIC-DOMAIN", true, true, "Commons public-domain file: the file page must show no restrictions.");
  if (result.source === "wikimedia" && /^(no restrictions|copyrighted free use|attribution)$/i.test(raw)) return decide("FREE-WITH-CREDIT", true, true, "Commons free-use file: credit the author; the file page must show no restrictions.");
  if (result.source === "met" && /public domain|open access/.test(text)) return decide("MUSEUM-OPEN-ACCESS", true, true, "Met Open Access (public domain object)");
  if (result.source === "artic" && /public domain/.test(text)) return decide("PUBLIC-DOMAIN", true, true, "Art Institute public-domain artwork");
  return decide("UNKNOWN", false, true, "Rights could not be confirmed from the search result.");
}

/** @param {string} text */
export function normalizeShotQuery(text) {
  return String(text ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
}

/**
 * @param {string} providerId
 * @param {MediaKind} kind
 * @param {string} normalizedQuery
 * @returns {Promise<string>}
 */
export async function mediaCacheKey(providerId, kind, normalizedQuery) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([providerId, kind, normalizedQuery])));
  return "media:v2:" + providerId + ":" + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class ProviderError extends Error {
  /**
   * @param {"rate_limited" | "auth_error" | "timeout" | "unavailable"} status
   * @param {number} [retryAfterMs]
   */
  constructor(status, retryAfterMs = 0) {
    super(status);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Rate limiter per provider using the generic cell rate algorithm: `capacity`
 * requests per `windowSeconds`, bursting up to `capacity`. A request that
 * would wait longer than the caller allows is refused WITHOUT using a slot,
 * so skipped shots never build up debt. After a 429 the provider is closed
 * for everyone until Retry-After passes, then reopens one request per slot
 * (no thundering herd). One instance is shared by every shot of a run; a
 * Durable Object can replace it for a platform-wide limit.
 * @param {{ now?: () => number }} [options]
 */
export function createRateLimiter(options = {}) {
  const now = options.now ?? (() => Date.now());
  /** @type {Map<string, { tat: number, blockedUntil: number }>} */
  const state = new Map();
  /** @param {string} id */
  const get = (id) => {
    const existing = state.get(id);
    if (existing) return existing;
    const created = { tat: 0, blockedUntil: 0 };
    state.set(id, created);
    return created;
  };
  return {
    /**
     * Reserve a request slot.
     * @param {string} providerId
     * @param {number} capacity requests per window
     * @param {number} windowSeconds
     * @param {number} [maxWaitMs] longest wait the caller accepts
     * @returns {{ granted: boolean, waitMs: number }} granted=false means no slot was used
     */
    acquire(providerId, capacity, windowSeconds, maxWaitMs = Number.POSITIVE_INFINITY) {
      if (!(capacity > 0 && windowSeconds > 0)) return { granted: true, waitMs: 0 };
      const t = now();
      const s = get(providerId);
      const interval = (windowSeconds * 1000) / capacity;
      const tolerance = (capacity - 1) * interval;
      const allowAt = Math.max(s.tat - tolerance, t, s.blockedUntil);
      const waitMs = Math.max(0, Math.ceil(allowAt - t));
      if (waitMs > maxWaitMs) return { granted: false, waitMs };
      s.tat = Math.max(s.tat, allowAt) + interval;
      return { granted: true, waitMs };
    },
    /**
     * Milliseconds the provider stays closed after a 429 (0 when open).
     * @param {string} providerId
     */
    blockedFor(providerId) {
      return Math.max(0, (state.get(providerId)?.blockedUntil ?? 0) - now());
    },
    /**
     * Close the provider for everyone until Retry-After passes; afterwards it
     * restarts with no burst, one request per interval.
     * @param {string} providerId
     * @param {number} retryAfterMs
     * @param {number} [capacity]
     * @param {number} [windowSeconds]
     */
    penalize(providerId, retryAfterMs, capacity = 1, windowSeconds = 60) {
      const s = get(providerId);
      const until = now() + Math.max(0, retryAfterMs);
      s.blockedUntil = Math.max(s.blockedUntil, until);
      // Restart with an empty burst: the first slot opens at blockedUntil, the next one interval later.
      const tolerance = capacity > 0 && windowSeconds > 0 ? ((capacity - 1) * windowSeconds * 1000) / capacity : 0;
      s.tat = Math.max(s.tat, s.blockedUntil + tolerance);
    },
  };
}

/**
 * @typedef {{ id: string, layer: 1 | 2, kinds: MediaKind[], cacheTtlSeconds: number, rate: { capacity: number, windowSeconds: number }, search(query: string, kind: MediaKind, signal: AbortSignal): Promise<MediaResult[]> }} MediaProvider
 * @typedef {{ get(key: string, type: "text"): Promise<string | null>, put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> }} TextCache
 * @typedef {ReturnType<typeof createRateLimiter>} Limiter
 * @typedef {{ shotId: string, query: string, kind: MediaKind, minWidth?: number }} ShotRequest
 * @typedef {{ layer: 3 | 4 | 5, run(shot: ShotRequest): Promise<MediaCandidate[]> }} LayerFallback
 * @typedef {(candidate: MediaCandidate) => Promise<boolean>} ItemVerifier
 * @typedef {{ providers: MediaProvider[], cache?: TextCache | null, limiter: Limiter, used?: { has(candidateId: string): boolean }, fallbacks?: LayerFallback[], verifyItem?: ItemVerifier, minCandidates?: number, maxWaitMs?: number, timeoutMs?: number, sleep?: (ms: number) => Promise<void> }} FetchShotDeps
 * @typedef {"ok" | "cached" | "empty" | "skipped_busy" | "rate_limited" | "auth_error" | "timeout" | "unavailable"} ProviderOutcome
 * @typedef {{ shotId: string, candidates: MediaCandidate[], layerUsed: MediaLayer | null, trace: { provider: string, outcome: ProviderOutcome, returned: number, allowed: number }[] }} FetchShotResult
 */

/** @type {Map<string, Promise<{ outcome: ProviderOutcome, results: MediaResult[] }>>} */
const inFlight = new Map();

/**
 * One provider search for one query, deduplicated: identical searches that
 * overlap in this isolate share a single cache read and upstream call.
 * @param {MediaProvider} provider
 * @param {string} query
 * @param {MediaKind} kind
 * @param {FetchShotDeps} deps
 * @returns {Promise<{ outcome: ProviderOutcome, results: MediaResult[] }>}
 */
async function searchProvider(provider, query, kind, deps) {
  const key = await mediaCacheKey(provider.id, kind, query);
  const pending = inFlight.get(key);
  if (pending) {
    const shared = await pending;
    return { outcome: shared.outcome === "ok" ? "cached" : shared.outcome, results: shared.results };
  }
  const run = loadProvider(provider, query, kind, key, deps);
  inFlight.set(key, run);
  try {
    return await run;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * @param {MediaProvider} provider
 * @param {string} query
 * @param {MediaKind} kind
 * @param {string} key
 * @param {FetchShotDeps} deps
 * @returns {Promise<{ outcome: ProviderOutcome, results: MediaResult[] }>}
 */
async function loadProvider(provider, query, kind, key, deps) {
  if (deps.cache) {
    try {
      const hit = await deps.cache.get(key, "text");
      const parsed = hit ? JSON.parse(hit) : null;
      if (Array.isArray(parsed)) return { outcome: "cached", results: parsed };
    } catch {
      // A cache error must not stop the search; the provider is asked instead.
    }
  }
  const maxWaitMs = deps.maxWaitMs ?? 15_000;
  const slot = deps.limiter.acquire(provider.id, provider.rate.capacity, provider.rate.windowSeconds, maxWaitMs);
  if (!slot.granted) return { outcome: "skipped_busy", results: [] };
  if (slot.waitMs > 0) await (deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))))(slot.waitMs);
  // A 429 seen by another search while this one waited closes the provider for it too.
  if (deps.limiter.blockedFor(provider.id) > 0) return { outcome: "rate_limited", results: [] };
  try {
    const found = await provider.search(query, kind, AbortSignal.timeout(deps.timeoutMs ?? 9_000));
    const results = Array.isArray(found) ? found : [];
    if (deps.cache) {
      try {
        await deps.cache.put(key, JSON.stringify(results), { expirationTtl: provider.cacheTtlSeconds });
      } catch {
        // Results are still returned; only the next search pays for the miss.
      }
    }
    return { outcome: results.length > 0 ? "ok" : "empty", results };
  } catch (error) {
    if (error instanceof ProviderError) {
      if (error.status === "rate_limited") deps.limiter.penalize(provider.id, error.retryAfterMs || 60_000, provider.rate.capacity, provider.rate.windowSeconds);
      return { outcome: error.status, results: [] };
    }
    if (error instanceof Error && error.name === "TimeoutError") return { outcome: "timeout", results: [] };
    return { outcome: "unavailable", results: [] };
  }
}

/**
 * @param {MediaCandidate} candidate
 * @param {FetchShotDeps} deps
 */
async function passesItemCheck(candidate, deps) {
  if (!candidate.rights.needsPageCheck) return true;
  if (!deps.verifyItem) return false;
  try {
    return (await deps.verifyItem(candidate)) === true;
  } catch {
    return false;
  }
}

/**
 * Find media for one shot. Layer 1 archives, then Layer 2 stock, stopping at
 * the first layer that yields enough licence-cleared, unused candidates;
 * then the fallbacks in order. A busy provider is skipped, not waited for,
 * so the run keeps its time budget. Candidates whose licence needs an
 * item-page check are dropped unless deps.verifyItem clears them.
 * Images narrower than min(shot.minWidth ?? 1920, 1280) px are skipped;
 * items with no width reported are kept.
 * @param {ShotRequest} shot
 * @param {FetchShotDeps} deps
 * @returns {Promise<FetchShotResult>}
 */
export async function fetchShotMedia(shot, deps) {
  const query = normalizeShotQuery(shot.query);
  /** @type {FetchShotResult} */
  const result = { shotId: shot.shotId, candidates: [], layerUsed: null, trace: [] };
  const minCandidates = deps.minCandidates ?? 3;
  const minWidth = Math.min(shot.minWidth ?? 1920, 1280);
  const seen = new Set();

  if (query.length >= 2) {
    for (const layer of /** @type {const} */ ([1, 2])) {
      const providers = deps.providers.filter((p) => p.layer === layer && p.kinds.includes(shot.kind));
      const settled = await Promise.all(providers.map((p) => searchProvider(p, query, shot.kind, deps)));
      for (let index = 0; index < settled.length; index += 1) {
        const { outcome, results } = settled[index];
        let allowed = 0;
        for (const item of results) {
          const rights = classifyLicense(item);
          const usable =
            rights.allowed &&
            item.mediaType === shot.kind &&
            Boolean(item.mediaUrl) &&
            (item.width === null || item.width >= minWidth) &&
            !seen.has(item.id) &&
            !(deps.used?.has(item.id) ?? false);
          if (!usable) continue;
          /** @type {MediaCandidate} */
          const candidate = { ...item, layer, rights };
          if (!(await passesItemCheck(candidate, deps))) continue;
          seen.add(item.id);
          result.candidates.push(candidate);
          allowed += 1;
        }
        result.trace.push({ provider: providers[index].id, outcome, returned: results.length, allowed });
      }
      if (result.candidates.length >= minCandidates) {
        result.layerUsed = layer;
        return result;
      }
    }
    if (result.candidates.length > 0) {
      result.layerUsed = result.candidates[0].layer;
      return result;
    }
  }

  for (const fallback of deps.fallbacks ?? []) {
    let produced;
    try {
      produced = (await fallback.run(shot)).filter((c) => c.rights.allowed);
    } catch {
      result.trace.push({ provider: "layer-" + fallback.layer, outcome: "unavailable", returned: 0, allowed: 0 });
      continue;
    }
    result.trace.push({ provider: "layer-" + fallback.layer, outcome: produced.length > 0 ? "ok" : "empty", returned: produced.length, allowed: produced.length });
    if (produced.length > 0) {
      result.candidates = produced;
      result.layerUsed = fallback.layer;
      return result;
    }
  }
  return result;
}
