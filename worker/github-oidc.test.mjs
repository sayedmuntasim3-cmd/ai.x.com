import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGithubOidc, GITHUB_ISSUER } from "./github-oidc.mjs";

const enc = (/** @type {any} */ o) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("a GitHub OIDC token is accepted only when signed by GitHub and for this repo, workflow and branch", async () => {
  const pair = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pub = /** @type {any} */ (await crypto.subtle.exportKey("jwk", pair.publicKey));
  const jwks = async () => new Response(JSON.stringify({ keys: [{ ...pub, kid: "k1" }] }));
  const now = Date.parse("2026-11-27T10:23:00Z");
  const t = Math.floor(now / 1000);
  const good = { iss: GITHUB_ISSUER, aud: "zupona-daily", repository: "o/r", ref: "refs/heads/main", workflow_ref: "o/r/.github/workflows/daily-film.yml@refs/heads/main", exp: t + 300, nbf: t - 10 };
  const sign = async (/** @type {any} */ claims, kid = "k1", key = pair.privateKey) => {
    const head = `${enc({ alg: "RS256", kid })}.${enc(claims)}`;
    return `${head}.${Buffer.from(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head))).toString("base64url")}`;
  };
  const o = { repo: "o/r", workflow: "daily-film.yml", audience: "zupona-daily", now, fetch: /** @type {any} */ (jwks) };
  assert.equal((await checkGithubOidc(await sign(good), o))?.repository, "o/r");
  assert.equal(await checkGithubOidc(await sign({ ...good, repository: "x/r" }), o), null);
  assert.equal(await checkGithubOidc(await sign({ ...good, workflow_ref: "o/r/.github/workflows/other.yml@refs/heads/main" }), o), null);
  assert.equal(await checkGithubOidc(await sign({ ...good, ref: "refs/heads/dev", workflow_ref: "o/r/.github/workflows/daily-film.yml@refs/heads/dev" }), o), null);
  assert.equal(await checkGithubOidc(await sign({ ...good, exp: t - 1 }), o), null);
  assert.equal(await checkGithubOidc(await sign({ ...good, aud: "other" }), o), null);
  const other = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  assert.equal(await checkGithubOidc(await sign(good, "k1", other.privateKey), o), null);
  assert.equal(await checkGithubOidc("not.a.jwt", o), null);
});
