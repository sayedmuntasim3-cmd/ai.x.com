/**
 * The owner's own pictures: a photo or clip the owner chooses, committed as
 * pictures/<film id>/SC0012-1.jpg (named after the shot; SC0012.jpg means the
 * scene's first shot), replaces that shot in the render. Photos move like
 * archive stills (framed over their own blur, pushed, panned or floated in
 * parallax); clips play from their start. The licence report says "provided
 * by the owner": the choice of picture and its rights are the owner's
 * (decided 5 Nov 2026). Pictures come either as files the owner commits or
 * as links the owner pastes for a shot (downloadPictureLinks); nothing here
 * searches for pictures by itself.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OWNER_LICENCE = "provided by the owner (the owner's choice and responsibility)";

const IMAGE = /^(jpe?g|png|webp)$/i;
const VIDEO = /^(mp4|mov|m4v|webm|mkv)$/i;

/**
 * The owner's pictures in a folder, by shot id (SC0012-1). Files that are not
 * named after a shot are listed in `ignored`.
 * @param {string | undefined} dir
 * @returns {{ shots: Record<string, { file: string, kind: "image" | "video" }>, ignored: string[] }}
 */
export function ownPictureFolder(dir) {
  /** @type {Record<string, { file: string, kind: "image" | "video" }>} */
  const shots = {};
  /** @type {string[]} */
  const ignored = [];
  if (!dir || !existsSync(dir)) return { shots, ignored };
  for (const f of readdirSync(dir).sort()) {
    if (f.startsWith(".") || f === "links.txt" || f.endsWith(".part")) continue;
    const m = /^(SC\d{4,5})(?:-(\d{1,2}))?\.([a-z0-9]+)$/i.exec(f);
    const kind = m && IMAGE.test(m[3]) ? "image" : m && VIDEO.test(m[3]) ? "video" : null;
    if (!m || !kind) { ignored.push(f); continue; }
    const id = `${m[1].toUpperCase()}-${Number(m[2] ?? 1)}`;
    if (shots[id]) { ignored.push(f); continue; } // one file per shot; the first in name order wins
    shots[id] = { file: join(dir, f), kind };
  }
  return { shots, ignored };
}

/**
 * Put the owner's pictures into the timeline in place of the shots they are
 * named after. The shot keeps its time, transition, fades, chip, chapter title
 * and the Edit Director's moves; its card text, map or split is replaced.
 * @param {import("../engine/src/timeline.mjs").Timeline} timeline
 * @param {ReturnType<typeof ownPictureFolder>} folder
 * @returns {{ applied: string[], unknown: string[], ignored: string[] }}
 */
export function applyOwnPictures(timeline, folder) {
  /** @type {string[]} */
  const applied = [];
  const ids = new Set(timeline.video.map((v) => v.id));
  timeline.video = timeline.video.map((v) => {
    const own = folder.shots[v.id];
    if (!own) return v;
    applied.push(v.id);
    const { split: _split, counter: _counter, map: _map, speed: _speed, chart: _chart, highlight: _highlight, ...rest } = v;
    // The file's content is part of the shot, so a replaced picture under the same name is rendered again.
    const fileHash = createHash("sha256").update(readFileSync(own.file)).digest("hex").slice(0, 12);
    return { ...rest, type: "clip", url: own.file, sourcePageUrl: null, licence: OWNER_LICENCE, motion: own.kind === "image" ? "push" : "none", text: "", sourceIn: 0, still: own.kind === "image", fileHash };
  });
  const unknown = Object.keys(folder.shots).filter((id) => !ids.has(id));
  if (applied.length) timeline.notes.push(`${applied.length} shot${applied.length > 1 ? "s use pictures" : " uses a picture"} provided by the owner (${applied.join(", ")}); their rights are the owner's responsibility.`);
  for (const id of unknown) timeline.notes.push(`pictures: ${id} is not a shot of this film; ${folder.shots[id].file} was not used.`);
  for (const f of folder.ignored) timeline.notes.push(`pictures: ${f} is not named after a shot (SC0012-1.jpg) or is a second file for one shot; not used.`);
  timeline.stats.clips = timeline.video.filter((v) => v.type === "clip").length;
  timeline.stats.cards = timeline.video.filter((v) => v.type === "card").length;
  timeline.stats.black = timeline.video.filter((v) => v.type === "black").length;
  return { applied, unknown, ignored: folder.ignored };
}

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" };
/** The most one linked file may weigh. */
export const MAX_LINK_BYTES = 400 * 1024 * 1024;

/**
 * Download the pictures the owner linked, one file per shot, into the
 * folder, named after the shot (SC0012-1.jpg). A file the owner committed for
 * a shot wins over a link. A link already downloaded is not fetched again;
 * a changed link replaces its old file. Failures are reported, never fatal.
 * @param {import("../engine/src/picture-links.mjs").PictureLinks} links
 * @param {string} dir
 * @param {{ fetch?: (url: string, init?: RequestInit) => Promise<Response>, maxBytes?: number }} [o]
 * @returns {Promise<{ saved: string[], kept: string[], skipped: string[], failed: { shot: string, why: string }[] }>}
 */
export async function downloadPictureLinks(links, dir, o = {}) {
  const get = o.fetch ?? ((url, init) => fetch(url, init));
  const max = o.maxBytes ?? MAX_LINK_BYTES;
  mkdirSync(dir, { recursive: true });
  const recordFile = join(dir, ".links.json");
  /** @type {Record<string, { url: string, file: string }>} */
  const record = existsSync(recordFile) ? JSON.parse(readFileSync(recordFile, "utf8")) : {};
  const out = { saved: /** @type {string[]} */ ([]), kept: /** @type {string[]} */ ([]), skipped: /** @type {string[]} */ ([]), failed: /** @type {{ shot: string, why: string }[]} */ ([]) };
  for (const [shot, { url }] of Object.entries(links)) {
    const done = record[shot];
    if (done && done.url === url && existsSync(join(dir, done.file))) { out.kept.push(shot); continue; }
    // A file the owner committed for this shot (not one this function downloaded) wins.
    const names = shot.endsWith("-1") ? [shot + ".", shot.slice(0, -2) + "."] : [shot + "."];
    const committed = readdirSync(dir).some((f) => names.some((n) => f.toUpperCase().startsWith(n)) && f !== done?.file && !f.endsWith(".part"));
    if (committed) { out.skipped.push(shot); continue; }
    try {
      const res = await get(url, { redirect: "follow", headers: { "user-agent": "ZuponaStudio/1.0 (owner-chosen picture)" }, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = String(res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
      const fromUrl = /\.(jpe?g|png|webp|mp4|mov|webm|m4v)(?:$|[?#])/i.exec(new URL(url).pathname)?.[1]?.toLowerCase().replace("jpeg", "jpg");
      const ext = TYPES[/** @type {keyof typeof TYPES} */ (type)] ?? (type === "" || type === "application/octet-stream" || type === "binary/octet-stream" ? fromUrl : undefined);
      if (!ext) throw new Error(`not a picture or a clip (${type || "no type"}); link the file itself, not the page it is on`);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > max) throw new Error(`larger than ${Math.round(max / 1048576)} MB`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > max) throw new Error(`larger than ${Math.round(max / 1048576)} MB`);
      if (body.length < 100) throw new Error("the file is empty");
      const file = `${shot}.${ext}`;
      writeFileSync(join(dir, file + ".part"), body);
      if (done?.file && done.file !== file) rmSync(join(dir, done.file), { force: true });
      renameSync(join(dir, file + ".part"), join(dir, file));
      record[shot] = { url, file };
      out.saved.push(shot);
    } catch (error) {
      out.failed.push({ shot, why: error instanceof Error ? error.message : String(error) });
    }
  }
  // A link the owner removed takes its downloaded file with it.
  for (const [shot, done] of Object.entries(record)) {
    if (links[shot]) continue;
    rmSync(join(dir, done.file), { force: true });
    delete record[shot];
  }
  writeFileSync(recordFile, JSON.stringify(record, null, 1));
  return out;
}
