/**
 * The job queue's versioned store on R2 (engine/src/jobs.mjs JobStore).
 * R2's conditional writes make each change a compare-and-swap: a put with
 * onlyIf.etagMatches lands only when the object is unchanged, and
 * etagDoesNotMatch "*" only when it does not exist yet; R2 returns null
 * when the condition fails. The version is the object's ETag.
 * @param {any} bucket an R2 bucket binding
 * @param {string} [prefix]
 */
export function r2JobStore(bucket, prefix = "queue/") {
  return {
    /** @param {string} key */
    async read(key) {
      const obj = await bucket.get(prefix + key);
      return obj ? { text: await obj.text(), version: String(obj.etag) } : null;
    },
    /** @param {string} key @param {string} text @param {string | null} [ifVersion] */
    async write(key, text, ifVersion) {
      const onlyIf = ifVersion === null ? { etagDoesNotMatch: "*" } : typeof ifVersion === "string" ? { etagMatches: ifVersion } : undefined;
      const obj = await bucket.put(prefix + key, text, onlyIf ? { onlyIf, httpMetadata: { contentType: "application/json" } } : { httpMetadata: { contentType: "application/json" } });
      return obj ? String(obj.etag) : null;
    },
    /** @param {string} p */
    async list(p) {
      /** @type {string[]} */
      const keys = [];
      let cursor;
      do {
        const page = await bucket.list({ prefix: prefix + p, cursor, limit: 1000 });
        for (const o of page.objects) keys.push(String(o.key).slice(prefix.length));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys.sort();
    },
  };
}
