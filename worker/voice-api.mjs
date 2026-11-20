/**
 * Voiceover films (System B, docs/VOICE_SYSTEM.md): a creator uploads a finished
 * voiceover (ElevenLabs, their own voice, or a Quran recitation) and gets a film
 * back. The words of the recording are the script; the pictures follow them.
 *
 * Routes (all under /api/voice):
 *   POST /api/voice                      { fileName, bytes, kind, topic?, surah?, ayat?, reciter? } -> { id, partSize, parts }   (Bearer STUDIO_TOKEN)
 *   PUT  /api/voice/:id/parts/:n         one piece of the file (raw bytes) -> { partNumber, etag }   (Bearer STUDIO_TOKEN)
 *   POST /api/voice/:id/complete         { parts: [{ partNumber, etag }] } -> the film is started on GitHub   (Bearer STUDIO_TOKEN)
 *   GET  /api/voice                      my voiceover films, newest first   (Bearer STUDIO_TOKEN)
 *   GET  /api/voice/:id                  state and progress (+ a short-lived download link when the film is ready)   (Bearer STUDIO_TOKEN)
 *   GET  /api/voice/:id/audio            the uploaded recording   (Bearer STUDIO_TOKEN, or ?ticket= for the GitHub runner)
 *   POST /api/voice/:id/progress         { stage, ok?, params?, error? } from the GitHub runner   (ticket)
 *   POST /api/voice/:id/film             { bytes } -> start the upload of the finished MP4 from the runner   (ticket)
 *   PUT  /api/voice/:id/film/parts/:n    one piece of the MP4   (ticket)
 *   POST /api/voice/:id/film/complete    { parts }   (ticket)
 *   POST /api/voice/:id/retry            start a failed film again from the saved recording   (Bearer STUDIO_TOKEN)
 *   DELETE /api/voice/:id                remove the recording, the film and the record   (Bearer STUDIO_TOKEN)
 *   GET  /api/voice/:id/stock?kind=&q=   Pixabay search relayed for the runner with the Worker's own key (free; the key never leaves Cloudflare)   (ticket)
 *   GET  /api/voice/:id/film             the finished MP4   (?ticket= from GET /api/voice/:id, or Bearer STUDIO_TOKEN)
 *
 * The recording stays private in R2 (bucket FILMS, voice/<id>/...). Files go up in
 * pieces (R2 multipart), so a 40-minute WAV fits under Cloudflare's 100 MB request
 * limit. The runner never holds the studio key: it gets a ticket, an HMAC of the
 * studio key over (voice id, purpose, expiry), good for one recording only.
 */
import { msg } from "../engine/src/messages.mjs";

/** Every piece except the last must be this size (R2 asks for at least 5 MiB, equal sizes). */
export const PART_SIZE = 16 * 1024 * 1024;
/** Largest recording accepted (a 3-hour 48 kHz stereo WAV is about 2 GB). */
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024;
/** Largest finished film accepted back from the runner. */
export const MAX_FILM_BYTES = 4 * 1024 * 1024 * 1024;
/** How long the runner's ticket is good for (the workflow's own limit is 6 hours). */
export const RUNNER_TICKET_SECONDS = 7 * 3600;
/** How long a download link shown to the creator is good for. */
export const DOWNLOAD_TICKET_SECONDS = 2 * 3600;

const AUDIO_TYPES = /** @type {const} */ ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/opus", webm: "audio/webm" });
const ID = /^[0-9a-f-]{36}$/;
/** The stages the runner reports, in order (each has a message voice.stage.<stage>). */
export const VOICE_STAGES = /** @type {const} */ (["uploaded", "queued", "started", "intake", "words", "understand", "master", "pictures", "render", "check", "deliver", "done"]);

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body, null, 1), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

/** @param {string} a @param {string} b */
function same(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** @param {string} key @param {string} text */
async function hmacHex(key, text) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * A ticket for one recording and one purpose ("runner" may read the audio and
 * report; "download" may only fetch the finished film).
 * @param {string} secret @param {string} id @param {"runner" | "download"} purpose @param {number} seconds @param {number} [now]
 */
export async function makeTicket(secret, id, purpose, seconds, now = Date.now()) {
  const exp = Math.floor(now / 1000) + seconds;
  return `${purpose}.${exp}.${await hmacHex(secret, `voice:${id}:${purpose}:${exp}`)}`;
}

/**
 * @param {string} secret @param {string} id @param {string | null} ticket @param {Array<"runner" | "download">} purposes @param {number} [now]
 * @returns {Promise<boolean>}
 */
export async function checkTicket(secret, id, ticket, purposes, now = Date.now()) {
  const m = /^(runner|download)\.(\d{9,11})\.([0-9a-f]{64})$/.exec(ticket ?? "");
  if (!m || !purposes.includes(/** @type {any} */ (m[1]))) return false;
  if (Number(m[2]) * 1000 < now) return false;
  return same(m[3], await hmacHex(secret, `voice:${id}:${m[1]}:${m[2]}`));
}

/**
 * What the creator asked for, checked. Quran recitation needs the surah: the
 * engine never guesses which passage a recitation is.
 * @param {any} body
 * @returns {{ ok: true, value: { fileName: string, ext: keyof typeof AUDIO_TYPES, bytes: number, kind: "narration" | "quran", topic: string, surah: number | null, ayat: string, reciter: string } } | { ok: false, error: string }}
 */
export function checkVoiceRequest(body) {
  const fileName = String(body?.fileName ?? "").trim().slice(0, 160);
  const ext = /** @type {keyof typeof AUDIO_TYPES} */ ((/\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1] ?? "").toLowerCase());
  if (!fileName || !(ext in AUDIO_TYPES)) return { ok: false, error: `Upload an audio file: ${Object.keys(AUDIO_TYPES).join(", ")}.` };
  const bytes = Number(body?.bytes);
  if (!Number.isInteger(bytes) || bytes < 1024) return { ok: false, error: "The file is empty or too small to be a recording." };
  if (bytes > MAX_AUDIO_BYTES) return { ok: false, error: "The file is larger than 2 GB. Export it as MP3 or M4A (a 40-minute MP3 is about 40 MB)." };
  const kind = body?.kind === "quran" ? "quran" : body?.kind === "narration" || body?.kind === undefined ? "narration" : null;
  if (!kind) return { ok: false, error: "kind must be narration or quran." };
  // No topic typed: the file's own name says what the film is about ("Ramesh Babu - From Barber to Rolls-Royce.mp3").
  const typed = String(body?.topic ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300);
  const fromName = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  const topic = typed || (/^(my narration|recording|voice|audio|untitled|new recording)\b/i.test(fromName) || !/\p{L}{3}/u.test(fromName) ? "" : fromName.slice(0, 300));
  let surah = null;
  let ayat = "";
  let reciter = "";
  if (kind === "quran") {
    surah = Number(body?.surah);
    if (!Number.isInteger(surah) || surah < 1 || surah > 114) return { ok: false, error: "Say which surah is recited (1-114): a recitation is never guessed." };
    ayat = String(body?.ayat ?? "").trim();
    if (ayat && !/^\d{1,3}(-\d{1,3})?$/.test(ayat)) return { ok: false, error: "Ayat must look like 1-11 (or leave it empty for the whole surah)." };
    reciter = String(body?.reciter ?? "").replace(/[^\p{L}\p{M} .'-]/gu, "").trim().slice(0, 80);
  }
  return { ok: true, value: { fileName, ext, bytes, kind, topic, surah, ayat, reciter } };
}

/** @param {number} bytes */
export const partsFor = (bytes) => Math.max(1, Math.ceil(bytes / PART_SIZE));

/**
 * One progress entry, with its message in English and Bengali.
 * @param {string} stage @param {Record<string, string | number>} [params] @param {string} [error]
 */
export function progressEntry(stage, params = {}, error) {
  const code = error ? "voice.stage.failed" : `voice.stage.${stage}`;
  const m = msg(code, error ? { stage, error: error.slice(0, 400) } : params);
  return { at: new Date().toISOString(), stage, ok: !error, message: { en: m.en, bn: m.bn } };
}

/** The status the creator sees, from the last progress entry. @param {any} rec */
function statusOf(rec) {
  const last = rec.progress?.at(-1);
  if (!last) return "uploading";
  if (!last.ok) return "failed";
  if (last.stage === "done") return rec.kind === "quran" ? "awaiting-review" : "done";
  if (last.stage === "uploaded") return "uploaded";
  if (last.stage === "queued") return "queued";
  return "running";
}

/** @param {string} id */
const recordKey = (id) => `voice/${id}/voice.json`;

/** @param {any} bucket @param {string} id */
async function load(bucket, id) {
  const o = await bucket.get(recordKey(id));
  return o ? JSON.parse(await o.text()) : null;
}

/** @param {any} bucket @param {any} rec */
async function save(bucket, rec) {
  await bucket.put(recordKey(rec.id), JSON.stringify(rec, null, 1), { httpMetadata: { contentType: "application/json" } });
}

/** A record as the creator sees it (no upload ids, no keys). @param {any} rec */
function publicView(rec) {
  return { id: rec.id, kind: rec.kind, topic: rec.topic, fileName: rec.fileName, bytes: rec.bytes, surah: rec.surah, ayat: rec.ayat, reciter: rec.reciter, createdAt: rec.createdAt, status: statusOf(rec), progress: rec.progress ?? [], run: rec.run ?? null, film: rec.film ? { bytes: rec.film.bytes, seconds: rec.film.seconds ?? null } : null, release: rec.release ?? null, report: rec.report ?? null };
}

/**
 * Start the "Voiceover film" GitHub workflow for an uploaded recording.
 * @param {{ token: string, repo: string, rec: any, site: string, ticket: string, ref?: string, fetch?: typeof fetch }} o
 * @returns {Promise<{ ok: true, actionsUrl: string } | { ok: false, error: string }>}
 */
export async function dispatchVoiceFilm(o) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repo)) return { ok: false, error: "GITHUB_REPO must look like owner/name." };
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(o.site)) return { ok: false, error: "Bad site address." };
  const inputs = { voice_id: o.rec.id, site: o.site, ticket: o.ticket, kind: o.rec.kind, ext: o.rec.ext, topic: o.rec.topic || "", quran: o.rec.kind === "quran" ? JSON.stringify({ surah: o.rec.surah, ayat: o.rec.ayat || "", reciter: o.rec.reciter || "" }) : "" };
  const get = o.fetch ?? fetch;
  const res = await get(`https://api.github.com/repos/${o.repo}/actions/workflows/voice-film.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${o.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "zupona-studio", "content-type": "application/json" },
    body: JSON.stringify({ ref: o.ref ?? "main", inputs }),
  });
  if (res.status === 204 || res.status === 200) return { ok: true, actionsUrl: `https://github.com/${o.repo}/actions/workflows/voice-film.yml` };
  const detail = (await res.text()).slice(0, 300);
  const why = res.status === 401 ? "the GitHub token is wrong or expired" : res.status === 403 ? "the GitHub token lacks Actions write permission" : res.status === 404 ? "the workflow is not on that branch yet (merge it into main) or the repository name is wrong" : `GitHub answered ${res.status}`;
  return { ok: false, error: `Film not started: ${why}. ${detail}`.trim() };
}

/**
 * Handle /api/voice routes; null for any other path.
 * @param {Request} request @param {any} env @param {URL} url @param {{ fetch?: typeof fetch, now?: () => number, uuid?: () => string }} [deps]
 * @returns {Promise<Response | null>}
 */
export async function handleVoice(request, env, url, deps = {}) {
  if (url.pathname !== "/api/voice" && !url.pathname.startsWith("/api/voice/")) return null;
  if (!env.FILMS) return json({ error: "Storage is not connected yet (R2 bucket FILMS)." }, 503);
  if (!env.STUDIO_TOKEN) return json({ error: "Set the STUDIO_TOKEN secret first, so nobody else can use your storage." }, 503);
  const bucket = env.FILMS;
  const now = deps.now ?? Date.now;
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const owner = same(bearer, env.STUDIO_TOKEN);
  const ticket = url.searchParams.get("ticket") ?? request.headers.get("x-voice-ticket");
  const parts = url.pathname.split("/").slice(3); // ["", "api", "voice", ...]
  const method = request.method;

  if (parts.length === 0) {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    if (method === "GET") {
      const listed = await bucket.list({ prefix: "voice/", delimiter: "/" });
      const ids = (listed.delimitedPrefixes ?? []).map((/** @type {string} */ p) => p.split("/")[1]).filter((/** @type {string} */ id) => ID.test(id));
      const recs = (await Promise.all(ids.slice(0, 100).map((/** @type {string} */ id) => load(bucket, id)))).filter(Boolean);
      recs.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return json({ films: recs.map(publicView) });
    }
    if (method === "POST") {
      const checked = checkVoiceRequest(await request.json().catch(() => null));
      if (!checked.ok) return json({ error: checked.error }, 400);
      const v = checked.value;
      const id = (deps.uuid ?? (() => crypto.randomUUID()))();
      const audioKey = `voice/${id}/audio.${v.ext}`;
      const upload = await bucket.createMultipartUpload(audioKey, { httpMetadata: { contentType: AUDIO_TYPES[v.ext] } });
      const rec = { id, ...v, audioKey, uploadId: upload.uploadId, createdAt: new Date(now()).toISOString(), progress: [] };
      await save(bucket, rec);
      return json({ id, partSize: PART_SIZE, parts: partsFor(v.bytes) }, 201);
    }
    return json({ error: "Not found." }, 404);
  }

  const id = parts[0];
  if (!ID.test(id)) return json({ error: "Not found." }, 404);
  const rec = await load(bucket, id);
  if (!rec) return json({ error: "Not found." }, 404);
  const runner = !owner && (await checkTicket(env.STUDIO_TOKEN, id, ticket, ["runner"], now()));
  /** Start (or start again) the film machine for this recording. @param {any} r */
  const start = async (r) => {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
      r.progress.push(progressEntry("queued", {}, "GitHub is not connected (GITHUB_TOKEN secret, GITHUB_REPO var), so the film cannot be made yet. The recording is saved."));
      await save(bucket, r);
      return json(publicView(r), 202);
    }
    const site = env.SITE_URL || url.origin;
    const started = await dispatchVoiceFilm({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, rec: r, site, ticket: await makeTicket(env.STUDIO_TOKEN, id, "runner", RUNNER_TICKET_SECONDS, now()), ref: env.GITHUB_REF || "main", fetch: deps.fetch });
    if (started.ok) {
      r.run = { actionsUrl: started.actionsUrl };
      r.progress.push(progressEntry("queued"));
    } else r.progress.push(progressEntry("queued", {}, started.error));
    await save(bucket, r);
    return json(publicView(r), started.ok ? 202 : 502);
  };
  const sub = parts.slice(1).join("/");

  // The creator's own upload of the recording.
  const part = /^(film\/)?parts\/(\d{1,5})$/.exec(sub);
  if (part && method === "PUT") {
    const forFilm = Boolean(part[1]);
    if (forFilm ? !runner : !owner) return json({ error: forFilm ? "Wrong ticket." : "Wrong studio token." }, 401);
    const target = forFilm ? rec.filmUpload : rec.uploadId && !rec.uploaded ? { key: rec.audioKey, uploadId: rec.uploadId, bytes: rec.bytes } : null;
    if (!target) return json({ error: "No upload is open for this file." }, 409);
    const n = Number(part[2]);
    const count = partsFor(target.bytes);
    if (n < 1 || n > count) return json({ error: `Piece ${n} is out of range (1-${count}).` }, 400);
    const body = new Uint8Array(await request.arrayBuffer());
    const expected = n < count ? PART_SIZE : target.bytes - PART_SIZE * (count - 1);
    if (body.byteLength !== expected) return json({ error: `Piece ${n} should be ${expected} bytes, not ${body.byteLength}.` }, 400);
    const uploaded = await bucket.resumeMultipartUpload(target.key, target.uploadId).uploadPart(n, body);
    return json({ partNumber: uploaded.partNumber, etag: uploaded.etag });
  }

  if ((sub === "complete" || sub === "film/complete") && method === "POST") {
    const forFilm = sub === "film/complete";
    if (forFilm ? !runner : !owner) return json({ error: forFilm ? "Wrong ticket." : "Wrong studio token." }, 401);
    const target = forFilm ? rec.filmUpload : rec.uploadId && !rec.uploaded ? { key: rec.audioKey, uploadId: rec.uploadId, bytes: rec.bytes } : null;
    if (!target) return json({ error: "No upload is open for this file." }, 409);
    const body = /** @type {any} */ (await request.json().catch(() => null));
    const list = Array.isArray(body?.parts) ? body.parts.map((/** @type {any} */ p) => ({ partNumber: Number(p?.partNumber), etag: String(p?.etag ?? "") })) : [];
    const count = partsFor(target.bytes);
    if (list.length !== count || list.some((/** @type {any} */ p, /** @type {number} */ i) => p.partNumber !== i + 1 || !p.etag)) return json({ error: `Send all ${count} pieces, numbered 1-${count}, each with its etag.` }, 400);
    const done = await bucket.resumeMultipartUpload(target.key, target.uploadId).complete(list);
    if (forFilm) {
      rec.film = { key: target.key, bytes: done.size ?? target.bytes, seconds: Number(body?.seconds) || null };
      delete rec.filmUpload;
      await save(bucket, rec);
      return json({ ok: true });
    }
    rec.uploaded = true;
    delete rec.uploadId;
    rec.progress.push(progressEntry("uploaded", { mb: Math.round(rec.bytes / 1048576) }));
    return start(rec);
  }

  if (sub === "retry" && method === "POST") {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    if (!rec.uploaded) return json({ error: "The recording is not fully uploaded yet." }, 409);
    if (statusOf(rec) !== "failed") return json({ error: "Only a stopped film can be started again." }, 409);
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: "GitHub is not connected (GITHUB_TOKEN secret, GITHUB_REPO var)." }, 503);
    rec.retries = (rec.retries ?? 0) + 1;
    delete rec.film;
    delete rec.report;
    return start(rec);
  }

  if (sub === "" && method === "DELETE") {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    if (rec.uploadId) await bucket.resumeMultipartUpload(rec.audioKey, rec.uploadId).abort().catch(() => {});
    if (rec.filmUpload) await bucket.resumeMultipartUpload(rec.filmUpload.key, rec.filmUpload.uploadId).abort().catch(() => {});
    await bucket.delete([rec.audioKey, `voice/${id}/film.mp4`, recordKey(id)]);
    return json({ ok: true, deleted: id });
  }

  if (sub === "" && method === "GET") {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    const view = /** @type {any} */ (publicView(rec));
    if (rec.film) view.download = `/api/voice/${id}/film?ticket=${await makeTicket(env.STUDIO_TOKEN, id, "download", DOWNLOAD_TICKET_SECONDS, now())}`;
    return json(view);
  }

  if (sub === "audio" && method === "GET") {
    if (!owner && !runner) return json({ error: "Wrong studio token." }, 401);
    if (!rec.uploaded) return json({ error: "The recording is not fully uploaded yet." }, 409);
    const o = await bucket.get(rec.audioKey);
    if (!o) return json({ error: "Not found." }, 404);
    return new Response(o.body, { headers: { "content-type": AUDIO_TYPES[/** @type {keyof typeof AUDIO_TYPES} */ (rec.ext)] ?? "application/octet-stream", "content-length": String(o.size), "cache-control": "no-store", "content-disposition": "attachment" } });
  }

  if (sub === "progress" && method === "POST") {
    if (!runner) return json({ error: "Wrong ticket." }, 401);
    const body = /** @type {any} */ (await request.json().catch(() => null));
    const stage = String(body?.stage ?? "");
    if (!VOICE_STAGES.includes(/** @type {any} */ (stage))) return json({ error: `stage must be one of ${VOICE_STAGES.join(", ")}.` }, 400);
    /** @type {Record<string, string | number>} */
    const params = {};
    for (const [k, v] of Object.entries(body?.params ?? {})) if (/^[a-z]{1,20}$/i.test(k) && (typeof v === "number" || typeof v === "string")) params[k] = typeof v === "string" ? v.slice(0, 200) : v;
    rec.progress = [...(rec.progress ?? []), progressEntry(stage, params, body?.error ? String(body.error) : undefined)].slice(-200);
    if (typeof body?.runUrl === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(body.runUrl)) rec.run = { ...(rec.run ?? {}), runUrl: body.runUrl };
    if (typeof body?.release === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/tag\/[\w.-]+$/.test(body.release)) rec.release = body.release;
    if (body?.report && typeof body.report === "object" && JSON.stringify(body.report).length <= 20000) rec.report = body.report;
    await save(bucket, rec);
    return json({ ok: true, status: statusOf(rec) });
  }

  if (sub === "stock" && method === "GET") {
    if (!runner) return json({ error: "Wrong ticket." }, 401);
    if (!env.PIXABAY_API_KEY) return json({ error: "No PIXABAY_API_KEY secret on the Worker." }, 503);
    const kind = url.searchParams.get("kind") === "video" ? "video" : "image";
    const q = String(url.searchParams.get("q") ?? "").slice(0, 100);
    if (!q.trim()) return json({ error: "q is empty." }, 400);
    const up = new URL(kind === "video" ? "https://pixabay.com/api/videos/" : "https://pixabay.com/api/");
    up.searchParams.set("key", env.PIXABAY_API_KEY);
    up.searchParams.set("q", q);
    // Only Pixabay's own search options pass through.
    for (const k of ["per_page", "safesearch", "video_type", "image_type", "orientation", "min_width", "min_height", "order", "page"]) {
      const v = url.searchParams.get(k);
      if (v && /^[\w-]{1,20}$/.test(v)) up.searchParams.set(k, v);
    }
    const res = await (deps.fetch ?? fetch)(up.toString(), { headers: { "user-agent": "zupona-studio" } });
    return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  }

  if (sub === "film" && method === "POST") {
    if (!runner) return json({ error: "Wrong ticket." }, 401);
    const bytes = Number((/** @type {any} */ (await request.json().catch(() => null)))?.bytes);
    if (!Number.isInteger(bytes) || bytes < 1024 || bytes > MAX_FILM_BYTES) return json({ error: "Bad film size." }, 400);
    if (rec.filmUpload) await bucket.resumeMultipartUpload(rec.filmUpload.key, rec.filmUpload.uploadId).abort().catch(() => {});
    const key = `voice/${id}/film.mp4`;
    const upload = await bucket.createMultipartUpload(key, { httpMetadata: { contentType: "video/mp4" } });
    rec.filmUpload = { key, uploadId: upload.uploadId, bytes };
    await save(bucket, rec);
    return json({ partSize: PART_SIZE, parts: partsFor(bytes) }, 201);
  }

  if (sub === "film" && method === "GET") {
    const allowed = owner || (await checkTicket(env.STUDIO_TOKEN, id, ticket, ["download", "runner"], now()));
    if (!allowed) return json({ error: "This download link has expired. Open the film again in the studio for a new one." }, 401);
    if (!rec.film) return json({ error: "The film is not ready yet." }, 404);
    const o = await bucket.get(rec.film.key);
    if (!o) return json({ error: "Not found." }, 404);
    const name = `${(rec.topic || rec.fileName.replace(/\.[^.]+$/, "")).replace(/[^\w -]+/g, "").trim().slice(0, 60) || "film"}.mp4`;
    return new Response(o.body, { headers: { "content-type": "video/mp4", "content-length": String(o.size), "cache-control": "no-store", "content-disposition": `attachment; filename="${name}"` } });
  }

  return json({ error: "Not found." }, 404);
}
