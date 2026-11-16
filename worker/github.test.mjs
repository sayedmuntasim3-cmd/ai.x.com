import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchRender } from "./github.mjs";

const id = "11111111-2222-3333-4444-555555555555";

test("a finished film starts the GitHub render with its ID; failures say why", async () => {
  /** @type {any[]} */
  const calls = [];
  const ok = /** @type {typeof fetch} */ (async (url, init) => { calls.push({ url: String(url), init }); return new Response(null, { status: 204 }); });
  const r = await dispatchRender({ token: "T", repo: "owner/repo", filmId: id, site: "https://ai.zupona.com", fetch: ok });
  assert.deepEqual(r, { ok: true, actionsUrl: "https://github.com/owner/repo/actions/workflows/render-film.yml" });
  assert.equal(calls[0].url, "https://api.github.com/repos/owner/repo/actions/workflows/render-film.yml/dispatches");
  assert.equal(calls[0].init.headers.authorization, "Bearer T");
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: "main", inputs: { film_id: id, site: "https://ai.zupona.com", resolution: "1920x1080" } });

  const missing = await dispatchRender({ token: "T", repo: "owner/repo", filmId: id, site: "https://ai.zupona.com", fetch: /** @type {typeof fetch} */ (async () => new Response("Not Found", { status: 404 })) });
  assert.equal(missing.ok, false);
  assert.match(missing.ok ? "" : missing.error, /merge it into main/);
  for (const bad of [{ repo: "nope" }, { filmId: "x" }, { site: "http://evil" }]) {
    const r2 = await dispatchRender({ token: "T", repo: "owner/repo", filmId: id, site: "https://ai.zupona.com", ...bad, fetch: ok });
    assert.equal(r2.ok, false);
  }
  assert.equal(calls.length, 1, "bad input never reaches GitHub");
});
