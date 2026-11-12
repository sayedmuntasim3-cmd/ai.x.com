/**
 * The job queue's versioned store in a folder (engine/src/jobs.mjs JobStore),
 * for several worker processes on one computer, or several computers sharing
 * a folder. A write takes an exclusive lock file, compares the version, writes
 * a temporary file and renames it into place, so a reader never sees half a
 * file and two writers never both win. A version is a hash of the content.
 *
 * A lock left behind by a writer that crashed is taken over after staleMs.
 * Network folders need exclusive create to be atomic (local disks, SMB and
 * NFS v3+ provide it); a sync service that copies files later (Dropbox,
 * Google Drive) does not, so do not share a queue through one.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";

/** @param {string} text */
const hash = (text) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * @param {string} dir
 * @param {{ staleMs?: number, waitMs?: number }} [o]
 */
export function folderJobStore(dir, o = {}) {
  const staleMs = o.staleMs ?? 10_000;
  const waitMs = o.waitMs ?? 15_000;
  /** @param {string} key */
  const file = (key) => {
    if (!/^[\w.-]+(\/[\w.-]+)*$/.test(key) || key.includes("..")) throw new Error(`Bad key "${key}".`);
    return join(dir, key);
  };

  /** @param {string} lock */
  async function acquire(lock) {
    const started = Date.now();
    for (let attempt = 0; ; attempt += 1) {
      try {
        const h = await open(lock, "wx");
        await h.writeFile(`${process.pid} ${new Date().toISOString()}`);
        await h.close();
        return;
      } catch (error) {
        if (/** @type {any} */ (error).code !== "EEXIST") throw error;
        // A writer that died while holding the lock: its lock is old.
        const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (age > staleMs) { await unlink(lock).catch(() => {}); continue; }
        if (Date.now() - started > waitMs) throw new Error(`The queue file is locked (${lock}); is another worker stuck?`);
        await new Promise((r) => setTimeout(r, Math.min(200, 5 * 2 ** attempt)));
      }
    }
  }

  /** @param {string} key */
  async function read(key) {
    try {
      const text = await readFile(file(key), "utf8");
      return { text, version: hash(text) };
    } catch (error) {
      if (/** @type {any} */ (error).code === "ENOENT") return null;
      throw error;
    }
  }

  return {
    read,
    /** @param {string} key @param {string} text @param {string | null} [ifVersion] */
    async write(key, text, ifVersion) {
      const f = file(key);
      await mkdir(dirname(f), { recursive: true });
      const lock = `${f}.lock`;
      await acquire(lock);
      try {
        const cur = await read(key);
        if (ifVersion === null && cur) return null;
        if (typeof ifVersion === "string" && cur?.version !== ifVersion) return null;
        const tmp = `${f}.${process.pid}.${randomUUID()}.tmp`;
        await writeFile(tmp, text);
        await rename(tmp, f);
        return hash(text);
      } finally {
        await unlink(lock).catch(() => {});
      }
    },
    /** @param {string} prefix */
    async list(prefix) {
      const base = file(prefix.replace(/\/$/, ""));
      const entries = await readdir(base, { recursive: true }).catch(() => /** @type {string[]} */ ([]));
      return entries.filter((e) => /\.json$/.test(String(e))).map((e) => relative(dir, join(base, String(e))).split(sep).join("/")).sort();
    },
  };
}
