/**
 * The owner's films, newest first, for the studio's "My films" list: one
 * line each with topic, status, length and money spent, read from R2.
 */

/**
 * @typedef {{ id: string, topic: string, minutes: number | null, status: string, costUsd: number, createdAt: string | null }} FilmSummary
 */

/**
 * @param {{ list(o: { prefix: string, delimiter: string, cursor?: string, limit?: number }): Promise<{ delimitedPrefixes: string[], truncated: boolean, cursor?: string }>, get(key: string): Promise<{ text(): Promise<string> } | null> }} bucket
 * @param {number} [max]
 * @returns {Promise<FilmSummary[]>}
 */
export async function listFilms(bucket, max = 100) {
  /** @type {string[]} */
  const ids = [];
  let cursor;
  do {
    const page = await bucket.list({ prefix: "films/", delimiter: "/", cursor, limit: 1000 });
    for (const p of page.delimitedPrefixes) { const m = /^films\/([0-9a-f-]{36})\/$/.exec(p); if (m) ids.push(m[1]); }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor && ids.length < 5000);
  const read = async (/** @type {string} */ key) => { try { const o = await bucket.get(key); return o ? JSON.parse(await o.text()) : null; } catch { return null; } };
  const films = await Promise.all(ids.map(async (id) => {
    const [film, run] = await Promise.all([read(`films/${id}/film.json`), read(`films/${id}/run.json`)]);
    const f = run?.film ?? film ?? {};
    return {
      id,
      topic: String(f.topic ?? ""),
      minutes: Number.isFinite(f.durationSeconds) ? Math.round(f.durationSeconds / 60) : null,
      status: String(run?.status ?? "queued"),
      costUsd: Number(run?.costUsd ?? 0),
      createdAt: typeof film?.createdAt === "string" ? film.createdAt : null,
    };
  }));
  return films.sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))).slice(0, max);
}
