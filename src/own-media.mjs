/** Pure helpers for the creator's own photos and clips. */
export const OWN_MEDIA_ACCEPT = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov"];
export const OWN_MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "mp4", "mov"];
export const OWN_MEDIA_MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime",
};
export const MAX_OWN_MEDIA_FILES = 50;
export const MAX_OWN_MEDIA_BYTES = 200 * 1024 * 1024;
export const MAX_OWN_MEDIA_FILE_BYTES = 200 * 1024 * 1024;

/** @param {any} file */
export function ownMediaExt(file) {
  const name = String(file?.name ?? file?.fileName ?? "").toLowerCase();
  const m = /\.([a-z0-9]{2,5})$/.exec(name);
  return m ? m[1] : "";
}

/** @param {any} file */
export function validateOwnMediaFile(file) {
  const name = String(file?.name ?? file?.fileName ?? "").trim();
  if (!name) return { ok: false, error: "A file needs a name." };
  const ext = ownMediaExt(file);
  if (!OWN_MEDIA_EXTENSIONS.includes(ext)) return { ok: false, error: `Only ${OWN_MEDIA_EXTENSIONS.join(", ")} files.` };
  const size = Number(file?.size ?? file?.bytes ?? 0);
  if (!Number.isFinite(size) || size < 1) return { ok: false, error: "The file is empty." };
  if (size > MAX_OWN_MEDIA_FILE_BYTES) return { ok: false, error: "A file may be at most 200 MB." };
  return { ok: true, ext, size };
}

/** @param {any[]} files */
export function validateOwnMediaFiles(files) {
  const list = Array.isArray(files) ? files : [];
  if (list.length > MAX_OWN_MEDIA_FILES) return { ok: false, error: "At most 50 of your own files." };
  let total = 0;
  for (const f of list) {
    const r = validateOwnMediaFile(f);
    if (!r.ok) return r;
    total += r.size;
  }
  if (total > MAX_OWN_MEDIA_BYTES) return { ok: false, error: "Your own files may total 200 MB." };
  return { ok: true, count: list.length, bytes: total };
}
