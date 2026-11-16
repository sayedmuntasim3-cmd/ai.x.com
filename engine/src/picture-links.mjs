/**
 * The owner's picture links: for any shot, the owner may paste the link of a
 * picture or clip he has chosen; the render downloads that one file and puts
 * it in the shot (render/own-pictures.mjs). The choice and its rights are the
 * owner's (decided 5 Nov 2026). Nothing searches or collects pictures by
 * itself: only links the owner gives are fetched. Kept in R2 as pictures.json.
 */

/** @typedef {Record<string, { url: string, at: string }>} PictureLinks */

export const MAX_PICTURE_LINKS = 3000;

/**
 * A shot id as the film page shows it (SC0012-1); "SC0012" means shot 1.
 * @param {unknown} shot
 * @returns {string | null}
 */
export function shotId(shot) {
  const m = /^\s*(SC\d{4,5})(?:-(\d{1,2}))?\s*$/i.exec(String(shot ?? ""));
  return m ? `${m[1].toUpperCase()}-${Number(m[2] ?? 1)}` : null;
}

/**
 * Set or remove one shot's link. An empty link removes it.
 * @param {PictureLinks | null} current
 * @param {{ shot?: unknown, url?: unknown }} input
 * @param {string} [now]
 * @returns {{ ok: true, links: PictureLinks, shot: string, removed: boolean } | { ok: false, error: string }}
 */
export function updatePictureLinks(current, input, now = new Date().toISOString()) {
  const id = shotId(input.shot);
  if (!id) return { ok: false, error: "Give the shot id as the film page shows it, like SC0012-1." };
  const links = { ...(current ?? {}) };
  const raw = typeof input.url === "string" ? input.url.trim() : "";
  if (!raw) {
    delete links[id];
    return { ok: true, links, shot: id, removed: true };
  }
  /** @type {URL} */
  let url;
  try { url = new URL(raw); } catch { return { ok: false, error: "That is not a web link." }; }
  if (!/^https?:$/.test(url.protocol) || raw.length > 2000 || url.username || url.password) return { ok: false, error: "Only plain http(s) links of up to 2000 characters." };
  if (!links[id] && Object.keys(links).length >= MAX_PICTURE_LINKS) return { ok: false, error: `At most ${MAX_PICTURE_LINKS} picture links per film.` };
  links[id] = { url: url.href, at: now };
  return { ok: true, links, shot: id, removed: false };
}

/**
 * Links written one per line in a committed pictures/<film id>/links.txt:
 * "SC0012-1 https://...". Blank lines and lines starting with # are skipped.
 * @param {string} text
 * @returns {{ links: PictureLinks, bad: string[] }}
 */
export function parseLinksFile(text) {
  /** @type {PictureLinks} */
  let links = {};
  /** @type {string[]} */
  const bad = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const [shot, url] = l.split(/\s+/, 2);
    const r = updatePictureLinks(links, { shot, url: url ?? "" }, "links.txt");
    if (r.ok && !r.removed) links = r.links;
    else bad.push(l.slice(0, 120));
  }
  return { links, bad };
}
