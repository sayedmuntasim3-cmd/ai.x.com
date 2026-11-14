/**
 * The network guard for pages the engine opens because a model or a web page
 * pointed at them (research, sources): only public http(s) addresses, every
 * redirect checked, and an optional host check (a DNS lookup on the owner's
 * machine). The local runner must never be steered into the owner's own
 * network (SSRF). Runtime-agnostic: the caller injects fetch.
 */

/** @typedef {(url: string, init?: RequestInit) => Promise<Response>} FetchLike */

/** Host names that point into a private network (the local runner must never reach the owner's own network). */
const PRIVATE_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|home\.arpa|localdomain)$/i;

/**
 * True for an IP address that is not on the public internet: loopback,
 * private, carrier-grade NAT, link-local (cloud metadata), benchmarking,
 * multicast, reserved; for IPv6 anything outside global unicast (2000::/3),
 * which also covers IPv4-mapped forms such as ::ffff:127.0.0.1.
 * @param {string} ip an IPv4 dotted quad or an IPv6 address (brackets allowed)
 */
export function privateAddress(ip) {
  const a = String(ip).replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a);
  if (v4) {
    const [p, q, r] = v4.slice(1, 4).map(Number);
    return p === 0 || p === 10 || p === 127 || p >= 224
      || (p === 100 && q >= 64 && q <= 127) || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31)
      || (p === 192 && q === 168) || (p === 192 && q === 0 && (r === 0 || r === 2)) || (p === 198 && (q === 18 || q === 19))
      || (p === 198 && q === 51 && r === 100) || (p === 203 && q === 0 && r === 113);
  }
  if (a.includes(":")) {
    const first = parseInt(a.split(":")[0] || "0", 16);
    // Global unicast is 2000::/3; documentation 2001:db8::/32 is not public either.
    return !(first >= 0x2000 && first <= 0x3fff) || a.startsWith("2001:db8:");
  }
  return false;
}

/**
 * True for a public http(s) URL that is safe to open: no credentials in it,
 * a host with a dot that is not a private name, and no private IP literal
 * (the URL parser turns forms like 2130706433 or 0x7f.1 into 127.0.0.1 first).
 * @param {string} url
 */
export function publicUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (u.username || u.password) return false;
    const host = u.hostname.replace(/\.$/, "").toLowerCase();
    if (!host || PRIVATE_NAME.test(host)) return false;
    if (host.startsWith("[")) return !privateAddress(host);
    if (/^[\d.]+$/.test(host)) return !privateAddress(host);
    return host.includes(".");
  } catch {
    return false;
  }
}

/**
 * Fetch a public page, following redirects by hand so that every hop is
 * checked: a public page that redirects into a private network is refused.
 * Each hop goes through get, so a get that checks hosts itself (the DNS guard
 * of local/run-film.mjs) checks every hop. Throws when a hop is refused.
 * @param {FetchLike} get @param {string} url @param {RequestInit} [init]
 * @param {{ maxRedirects?: number }} [o]
 * @returns {Promise<Response>}
 */
export async function safeFetch(get, url, init = {}, o = {}) {
  let current = url;
  for (let hop = 0; ; hop += 1) {
    if (!publicUrl(current)) throw new Error(`Refused a non-public address: ${current.slice(0, 120)}`);
    const res = await get(current, { ...init, redirect: "manual" });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    await res.body?.cancel().catch(() => {});
    if (hop >= (o.maxRedirects ?? 5)) throw new Error(`Too many redirects from ${url.slice(0, 120)}`);
    current = new URL(location, current).toString();
  }
}
