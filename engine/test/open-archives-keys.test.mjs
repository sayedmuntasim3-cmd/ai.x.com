import test from "node:test";
import assert from "node:assert/strict";
import { archiveKeys, openArchivesProvider, NO_STORE_SOURCES } from "../src/open-archives.mjs";
import { mediaProviders } from "../src/film-media.mjs";

test("archiveKeys passes only the archives' own key names, never the whole environment", () => {
  const k = archiveKeys({ EUROPEANA_API_KEY: "e", NARA_API_KEY: "n", GROQ_API_KEY: "secret", PATH: "/bin", NYPL_API_KEY: "" });
  assert.deepEqual(Object.keys(k).sort(), ["EUROPEANA_API_KEY", "NARA_API_KEY"]);
  assert.ok(NO_STORE_SOURCES.has("nara"));
});

test("a film's open-archives search sends the Europeana key in the x-api-key header, not the URL", async () => {
  /** @type {{ url: string, headers: Record<string, string> }[]} */
  const seen = [];
  const fetch = async (/** @type {any} */ url, /** @type {any} */ init = {}) => {
    const u = String(url);
    seen.push({ url: u, headers: Object.fromEntries(new Headers(init.headers ?? {})) });
    return new Response(JSON.stringify({ items: [] }), { headers: { "content-type": "application/json" } });
  };
  const p = mediaProviders({ archives: true, fetch, archiveEnv: archiveKeys({ EUROPEANA_API_KEY: "k123" }) }).find((x) => x.id === "open-archives");
  assert.ok(p);
  await p.search("dam construction", "image", AbortSignal.timeout(5000));
  const eu = seen.find((s) => s.url.includes("api.europeana.eu"));
  assert.ok(eu, "Europeana was asked once the key is set");
  assert.ok(!eu.url.includes("k123") && !eu.url.includes("wskey"), eu.url);
  assert.equal(eu.headers["x-api-key"], "k123");
  // Without the key the archive is not asked at all.
  seen.length = 0;
  await openArchivesProvider({ fetch }).search("dam construction", "image", AbortSignal.timeout(5000));
  assert.ok(!seen.some((s) => s.url.includes("api.europeana.eu")));
});
