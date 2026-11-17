/**
 * Start the "Render a film" GitHub Actions workflow for a finished run, so the
 * MP4, Shorts and thumbnails are made without anyone opening GitHub.
 * Needs a fine-grained GitHub token with "Actions: read and write" on the
 * repository (secret GITHUB_TOKEN) and the repository name (var GITHUB_REPO,
 * "owner/name"). The workflow must be on the branch given (default main).
 */

/**
 * @param {{ token: string, repo: string, filmId: string, site: string, ref?: string, resolution?: string, fetch?: typeof fetch }} o
 * @returns {Promise<{ ok: true, actionsUrl: string } | { ok: false, error: string }>}
 */
export async function dispatchRender(o) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repo)) return { ok: false, error: "GITHUB_REPO must look like owner/name." };
  if (!/^[0-9a-f-]{36}$/.test(o.filmId)) return { ok: false, error: "Bad film ID." };
  if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(o.site)) return { ok: false, error: "Bad site address." };
  const get = o.fetch ?? fetch;
  const res = await get(`https://api.github.com/repos/${o.repo}/actions/workflows/render-film.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${o.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "zupona-studio", "content-type": "application/json" },
    body: JSON.stringify({ ref: o.ref ?? "main", inputs: { film_id: o.filmId, site: o.site, resolution: o.resolution ?? "1920x1080" } }),
  });
  if (res.status === 204 || res.status === 200) return { ok: true, actionsUrl: `https://github.com/${o.repo}/actions/workflows/render-film.yml` };
  const detail = (await res.text()).slice(0, 300);
  const why = res.status === 401 ? "the GitHub token is wrong or expired" : res.status === 403 ? "the GitHub token lacks Actions write permission" : res.status === 404 ? "the workflow is not on that branch yet (merge it into main) or the repository name is wrong" : `GitHub answered ${res.status}`;
  return { ok: false, error: `Render not started: ${why}. ${detail}`.trim() };
}
