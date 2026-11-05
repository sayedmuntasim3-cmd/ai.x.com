/**
 * The owner's own pictures: a photo or clip the owner chooses, committed as
 * pictures/<film id>/SC0012-1.jpg (named after the shot; SC0012.jpg means the
 * scene's first shot), replaces that shot in the render. Photos move like
 * archive stills (framed over their own blur, pushed, panned or floated in
 * parallax); clips play from their start. The licence report says "provided
 * by the owner": the choice of picture and its rights are the owner's
 * (decided 5 Nov 2026). Nothing here fetches anything.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
    if (f.startsWith(".")) continue;
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
    const { split: _split, counter: _counter, map: _map, speed: _speed, ...rest } = v;
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
