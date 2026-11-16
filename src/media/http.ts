// A small fetch wrapper for providers: descriptive User-Agent (Wikimedia and others require one),
// a per-call timeout, a shared budget of upstream requests (Cloudflare Workers cap them per
// request) and edge caching of upstream responses when running on Cloudflare.

import type { Http, HttpInit } from "./types";

export const DEFAULT_USER_AGENT = "ZuponaAI-MediaSearch/1.0 (https://ai.zupona.com; documentary image research)";

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export type Budget = { left: number };

export function createHttp(options: {
  userAgent?: string;
  timeoutMs: number;
  budget: Budget;
  fetchImpl?: typeof fetch;
}): Http {
  const doFetch = options.fetchImpl ?? fetch;
  const ua = options.userAgent || DEFAULT_USER_AGENT;

  async function request(url: string, init: HttpInit = {}, accept: string): Promise<Response> {
    try {
      return await attempt(url, init, accept);
    } catch (err) {
      // One retry for a gateway hiccup on a GET (Openverse and others return the odd 502/504).
      const status = err instanceof HttpError ? err.status : undefined;
      if ((init.method ?? "GET") !== "GET" || !status || status < 502 || status > 504) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return attempt(url, init, accept);
    }
  }

  async function attempt(url: string, init: HttpInit, accept: string) {
    if (options.budget.left <= 0) throw new HttpError("request budget used up");
    options.budget.left -= 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const requestInit: RequestInit & { cf?: Record<string, unknown> } = {
        method: init.method ?? "GET",
        headers: { "User-Agent": ua, "Api-User-Agent": ua, Accept: accept, ...init.headers },
        body: init.body,
        signal: controller.signal,
        redirect: "follow",
      };
      // Cloudflare edge cache for upstream GETs; ignored everywhere else.
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
    async json<T>(url: string, init?: HttpInit) {
      const res = await request(url, init, "application/json, application/ld+json;q=0.9, */*;q=0.1");
      const body = await res.text();
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new HttpError("response was not JSON");
      }
    },
    async text(url: string, init?: HttpInit) {
      const res = await request(url, init, "text/html, */*;q=0.5");
      return res.text();
    },
  };
}

/** Builds a query string, skipping empty values and repeating keys given as arrays. */
export function qs(params: Record<string, string | number | boolean | undefined | null | (string | number)[]>) {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => out.append(key, String(v)));
    else out.append(key, String(value));
  }
  return out.toString();
}

/** Removes tags and entities from the HTML some sources put in titles and descriptions. */
export function plain(html: string | null | undefined, max = 400) {
  if (!html) return "";
  const text = String(html)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|li|div)>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trim()}…`;
}

export function first<T>(value: T | T[] | null | undefined): T | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

export function https(url: string | undefined | null) {
  if (!url) return "";
  return url.startsWith("//") ? `https:${url}` : url.replace(/^http:\/\//, "https://");
}
