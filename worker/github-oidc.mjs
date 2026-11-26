/**
 * GitHub Actions' own identity token (OIDC), checked on the Worker: a scheduled workflow of this
 * repository proves who it is without any stored secret (permissions: id-token: write).
 * RS256, keys from GitHub's published JWKS, the claims pinned to one repository, workflow and branch.
 */
export const GITHUB_ISSUER = "https://token.actions.githubusercontent.com";

/** @param {string} s */
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));

/**
 * The token's claims when it is genuine and for this workflow; null otherwise.
 * @param {string} jwt
 * @param {{ repo: string, workflow: string, audience: string, ref?: string, now?: number, fetch?: typeof fetch }} o
 * @returns {Promise<Record<string, any> | null>}
 */
export async function checkGithubOidc(jwt, o) {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  } catch { return null; }
  if (header.alg !== "RS256" || !header.kid) return null;
  const now = Math.floor((o.now ?? Date.now()) / 1000);
  const ref = o.ref ?? "refs/heads/main";
  if (claims.iss !== GITHUB_ISSUER || claims.aud !== o.audience || claims.repository !== o.repo) return null;
  if (!(claims.exp > now && claims.nbf <= now + 60)) return null;
  if (claims.ref !== ref || claims.workflow_ref !== `${o.repo}/.github/workflows/${o.workflow}@${ref}`) return null;
  const res = await (o.fetch ?? fetch)(`${GITHUB_ISSUER}/.well-known/jwks`);
  if (!res.ok) return null;
  const jwk = (/** @type {any} */ (await res.json())).keys?.find((/** @type {any} */ k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return ok ? claims : null;
}
