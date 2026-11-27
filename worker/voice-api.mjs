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
 *   POST /api/voice/:id/marks            { start, ends[], by } the reviewer's ayah times (Quran): the film is made again with them   (Bearer STUDIO_TOKEN)
 *   POST /api/voice/:id/retry            start a failed film again from the saved recording   (Bearer STUDIO_TOKEN)
 *   DELETE /api/voice/:id                remove the recording, the film and the record   (Bearer STUDIO_TOKEN)
 *   GET  /api/voice/:id/stock?kind=&q=   Pixabay search relayed with the Worker's own key (free; the key never leaves Cloudflare)   (ticket, or Bearer STUDIO_TOKEN)
 *   GET  /api/voice/:id/film             the finished MP4   (?ticket= from GET /api/voice/:id, or Bearer STUDIO_TOKEN)
 *   POST /api/voice/daily                start today's daily film (the next unused topic)   (Bearer STUDIO_TOKEN, or GitHub's OIDC token of daily-film.yml's schedule)
 *   POST /api/voice/:id/brain            { req: { stage, system, messages, maxTokens } } (or { system, prompt }) one free-brain call (Groq, then Gemini)   (ticket, narration)
 *   POST /api/voice/:id/voice            { bytes } -> open the upload of the daily film's narration; then parts/:n and complete   (ticket, daily film only)
 *   GET  /api/voice/:id/ledger           the channel's Craft Ledger (R2 channel/craft-ledger.json), for the next film's targets   (ticket, or Bearer STUDIO_TOKEN)
 *   POST /api/voice/:id/ledger           { report, genre? } the finished film's critic measures, recorded under this id   (ticket, or Bearer STUDIO_TOKEN)
 *
 * The recording stays private in R2 (bucket FILMS, voice/<id>/...). Files go up in
 * pieces (R2 multipart), so a 40-minute WAV fits under Cloudflare's 100 MB request
 * limit. The runner never holds the studio key: it gets a ticket, an HMAC of the
 * studio key over (voice id, purpose, expiry), good for one recording only.
 */
import { msg } from "../engine/src/messages.mjs";
import { checkMarks } from "../engine/src/quran-marks.mjs";
import { addAudience, addRecord, emptyLedger, ledgerJson, parseLedger, recordFromReport } from "../engine/src/craft-memory.mjs";
import { GROQ_MODELS, GROQ_PROMPT_LIMIT, groqMessages, groqModel, promptTokens } from "./groq.mjs";
import { nextDailyTopic } from "./daily-film.mjs";
import { checkGithubOidc } from "./github-oidc.mjs";

/** The Craft Ledger's one home: next to channel/lessons.json, one ledger for every film of the channel. */
export const LEDGER_KEY = "channel/craft-ledger.json";

/**
 * The Craft Ledger in R2: read it, or change it with a compare-and-swap (a film finishing on two runners at
 * once never loses the other's record). `change` returns the next ledger and a note, or null to leave it.
 * @param {any} bucket
 */
export function r2Ledger(bucket) {
  const read = async () => {
    const obj = await bucket.get(LEDGER_KEY);
    if (!obj) return { ledger: emptyLedger(), notes: [], etag: null };
    return { ...parseLedger(await obj.text()), etag: obj.etag ?? null };
  };
  /** @param {(l: import("../engine/src/craft-memory.mjs").Ledger) => { ledger: any, note: { code: string, params?: any } } | null} change */
  const update = async (change) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const cur = await read();
      const next = change(cur.ledger);
      if (!next) return null;
      const put = await bucket.put(LEDGER_KEY, ledgerJson(next.ledger), { httpMetadata: { contentType: "application/json" }, onlyIf: cur.etag ? { etagMatches: cur.etag } : { etagDoesNotMatch: "*" } });
      if (put !== null) return next;
    }
    throw new Error("the craft ledger kept changing under this write");
  };
  return { read, update };
}

/**
 * Hook for the audience signal: a published film's retention report into the ledger, when that film has a
 * record there (it is a no-op note otherwise). The retention route calls it after it learns a curve.
 * @param {any} bucket @param {string} filmId @param {any} retention @param {string} at
 */
export async function ledgerAudience(bucket, filmId, retention, at) {
  let note = null;
  await r2Ledger(bucket).update((ledger) => {
    const made = addAudience(ledger, { filmId, retention, at });
    note = made.note;
    return made.ok ? { ledger: made.ledger, note: made.note } : null;
  });
  return note;
}

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
export const VOICE_STAGES = /** @type {const} */ (["script", "narrate", "uploaded", "marked", "queued", "started", "intake", "words", "understand", "master", "pictures", "render", "check", "deliver", "done"]);

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
 * @param {string} secret @param {string} id @param {"runner" | "download" | "listen"} purpose @param {number} seconds @param {number} [now]
 */
export async function makeTicket(secret, id, purpose, seconds, now = Date.now()) {
  const exp = Math.floor(now / 1000) + seconds;
  return `${purpose}.${exp}.${await hmacHex(secret, `voice:${id}:${purpose}:${exp}`)}`;
}

/**
 * @param {string} secret @param {string} id @param {string | null} ticket @param {Array<"runner" | "download" | "listen">} purposes @param {number} [now]
 * @returns {Promise<boolean>}
 */
export async function checkTicket(secret, id, ticket, purposes, now = Date.now()) {
  const m = /^(runner|download|listen)\.(\d{9,11})\.([0-9a-f]{64})$/.exec(ticket ?? "");
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

/**
 * A runner that dies (shut down, out of memory) never sends its failure, so the film would stay
 * "running" forever. GitHub knows: the film's own run is finished. @param {any} rec @param {any} env @param {typeof fetch} [f]
 */
async function runEnded(rec, env, f = fetch) {
  const m = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)$/.exec(rec.run?.runUrl ?? "");
  if (!m || m[1] !== env.GITHUB_REPO) return false;
  const res = await f(`https://api.github.com/repos/${m[1]}/actions/runs/${m[2]}`, {
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "zupona-studio" },
  }).catch(() => null);
  if (!res?.ok) return false;
  const run = await res.json().catch(() => ({}));
  return run.status === "completed";
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
 * @param {{ token: string, repo: string, rec: any, site: string, ticket: string, ref?: string, workflow?: "voice-film.yml" | "daily-film.yml", fetch?: typeof fetch }} o
 * @returns {Promise<{ ok: true, actionsUrl: string } | { ok: false, error: string }>}
 */
export async function dispatchVoiceFilm(o) {
  const inputs = o.workflow === "daily-film.yml"
    ? { voice_id: o.rec.id, site: o.site, ticket: o.ticket, topic_id: o.rec.daily?.topicId ?? "" }
    : { voice_id: o.rec.id, site: o.site, ticket: o.ticket, kind: o.rec.kind, ext: o.rec.ext, topic: o.rec.topic || "", quran: o.rec.kind === "quran" ? JSON.stringify({ surah: o.rec.surah, ayat: o.rec.ayat || "", reciter: o.rec.reciter || "", ...(o.rec.marks ? { marks: o.rec.marks } : {}) }) : "" };
  return dispatchWorkflow(o, o.workflow ?? "voice-film.yml", inputs);
}

/**
 * Start one GitHub workflow of this repository with its inputs.
 * @param {{ token: string, repo: string, site: string, ref?: string, fetch?: typeof fetch }} o @param {string} workflow @param {Record<string, string>} inputs
 * @returns {Promise<{ ok: true, actionsUrl: string } | { ok: false, error: string }>}
 */
async function dispatchWorkflow(o, workflow, inputs) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(o.repo)) return { ok: false, error: "GITHUB_REPO must look like owner/name." };
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(o.site)) return { ok: false, error: "Bad site address." };
  const get = o.fetch ?? fetch;
  const res = await get(`https://api.github.com/repos/${o.repo}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${o.token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "zupona-studio", "content-type": "application/json" },
    body: JSON.stringify({ ref: o.ref ?? "main", inputs }),
  });
  if (res.status === 204 || res.status === 200) return { ok: true, actionsUrl: `https://github.com/${o.repo}/actions/workflows/${workflow}` };
  const detail = (await res.text()).slice(0, 300);
  const why = res.status === 401 ? "the GitHub token is wrong or expired" : res.status === 403 ? "the GitHub token lacks Actions write permission" : res.status === 404 ? "the workflow is not on that branch yet (merge it into main) or the repository name is wrong" : `GitHub answered ${res.status}`;
  return { ok: false, error: `Film not started: ${why}. ${detail}`.trim() };
}

/** One daily film per 12 hours: the cron's next day is never skipped by a film started by hand in the afternoon. */
export const DAILY_RETRY_MS = 12 * 3600 * 1000;

/**
 * Start today's daily film: the next topic no earlier daily film has voiced, a record for it, and the
 * daily-film workflow (script, narration, then the voiceover pipeline). A film started in the last
 * 12 hours that has not failed is left alone (so the cron's next day still runs). Used by POST /api/voice/daily (daily-film.yml's schedule, or the studio).
 * @param {any} env @param {{ fetch?: typeof fetch, now?: () => number, uuid?: () => string, site?: string }} [deps]
 * @returns {Promise<{ ok: true, id: string, topic: string, actionsUrl: string } | { ok: false, skipped?: boolean, error: string }>}
 */
export async function startDailyFilm(env, deps = {}) {
  if (!env.FILMS || !env.STUDIO_TOKEN) return { ok: false, error: "The daily film needs the FILMS bucket and the STUDIO_TOKEN secret." };
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return { ok: false, error: "GitHub is not connected (GITHUB_TOKEN secret, GITHUB_REPO var), so the daily film cannot start." };
  const now = deps.now ?? Date.now;
  const listed = await env.FILMS.list({ prefix: "voice/", delimiter: "/" });
  const ids = (listed.delimitedPrefixes ?? []).map((/** @type {string} */ p) => p.split("/")[1]).filter((/** @type {string} */ id) => ID.test(id));
  const daily = (await Promise.all(ids.map((/** @type {string} */ id) => load(env.FILMS, id)))).filter((r) => r?.daily?.topicId);
  const recent = daily.find((r) => now() - Date.parse(r.createdAt) < DAILY_RETRY_MS && statusOf(r) !== "failed");
  if (recent) return { ok: false, skipped: true, error: `Today's daily film is already under way (${recent.id}, ${recent.daily.topicId}).` };
  const topic = nextDailyTopic(daily.filter((r) => r.uploaded).map((r) => r.daily.topicId));
  if (!topic) return { ok: false, error: "Every topic in the daily queue (worker/daily-film.mjs) has a film; add more topics." };
  const id = (deps.uuid ?? (() => crypto.randomUUID()))();
  const rec = { id, kind: "narration", ext: "mp3", fileName: `${topic.id}.mp3`, bytes: 0, topic: topic.title, surah: null, ayat: "", reciter: "", audioKey: `voice/${id}/audio.mp3`, daily: { topicId: topic.id }, createdAt: new Date(now()).toISOString(), progress: [] };
  const site = deps.site || env.SITE_URL;
  const started = await dispatchVoiceFilm({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO, rec, site, ticket: await makeTicket(env.STUDIO_TOKEN, id, "runner", RUNNER_TICKET_SECONDS, now()), ref: env.GITHUB_REF || "main", workflow: "daily-film.yml", fetch: deps.fetch });
  rec.progress.push(progressEntry("queued", {}, started.ok ? undefined : started.error));
  if (started.ok) rec.run = { actionsUrl: started.actionsUrl };
  await save(env.FILMS, rec);
  return started.ok ? { ok: true, id, topic: topic.id, actionsUrl: started.actionsUrl } : { ok: false, error: started.error };
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

  if (parts[0] === "daily" && parts.length === 1 && method === "POST") {
    // The studio key, or the daily schedule itself: GitHub's identity token for daily-film.yml on main (no stored secret).
    const scheduled = !owner && bearer.split(".").length === 3 && env.GITHUB_REPO && (await checkGithubOidc(bearer, { repo: env.GITHUB_REPO, workflow: "daily-film.yml", audience: "zupona-daily", now: now(), fetch: deps.fetch }));
    if (!owner && !scheduled) return json({ error: "Wrong studio token." }, 401);
    const r = await startDailyFilm(env, { fetch: deps.fetch, now, uuid: deps.uuid, site: env.SITE_URL || url.origin });
    return json(r, r.ok ? 202 : r.skipped ? 409 : 502);
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
  /** The daily film's runner writes and voices the film itself, so it may also send the recording. */
  const dailyRunner = Boolean(runner && rec.daily);

  // One call to the free brain (Groq first, then the Gemini pool) with the Worker's own keys: the daily film's
  // script, and a voiceover film's director, writer and editor (local/voice-film.mjs). Never the paid brain.
  // Text only and no web search: the runner's model says so (canSee/canSearch), so stages pick their own path.
  if (sub === "brain" && method === "POST") {
    if (!runner || rec.kind !== "narration") return json({ error: "Wrong ticket." }, 401);
    const body = /** @type {any} */ (await request.json().catch(() => null));
    const text = (/** @type {any} */ v, /** @type {number} */ max) => String(v ?? "").slice(0, max);
    const blocks = (/** @type {any} */ list, /** @type {number} */ max) => (Array.isArray(list) ? list : []).filter((b) => b && typeof b.text === "string" && !b.image).map((b) => ({ text: text(b.text, max) }));
    const req = body?.req
      ? { stage: text(body.req.stage, 60) || "voice", system: blocks(body.req.system, 60000), messages: (Array.isArray(body.req.messages) ? body.req.messages : []).slice(0, 40).map((/** @type {any} */ m) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: blocks(m?.content, 120000) })), maxTokens: Number(body.req.maxTokens) }
      : { stage: "daily-script", system: [{ text: text(body?.system, 20000) }], messages: [{ role: "user", content: [{ text: text(body?.prompt, 60000) }] }], maxTokens: Number(body?.maxTokens) };
    if (!req.messages.some((m) => m.content.some((c) => c.text))) return json({ error: "Send the prompt." }, 400);
    req.maxTokens = Math.min(Math.max(req.maxTokens || 2000, 256), 16000);
    // Groq only: Gemini's 20 requests a day are gone long before a 40-minute film is planned, and a call sent there
    // after Groq's busy minute came back as "daily limit used up" and stopped the film's brain (film ccd86532).
    if (!env.GROQ_API_KEY || String(env.GROQ ?? "").toLowerCase() === "off") return json({ error: "The free brain (Groq, the GROQ_API_KEY secret) is not set." }, 503);
    let groqModels = String(env.GROQ_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
    // The runner may name one model (each has its own minute, so it spreads its calls over all three): only that model is asked.
    const named = String(body?.model ?? "");
    if (named && (groqModels.length ? groqModels : [...GROQ_MODELS]).includes(named)) groqModels = [named];
    const groq = groqModel({ apiKey: env.GROQ_API_KEY, ...(groqModels.length ? { models: groqModels } : {}), ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    const tokens = promptTokens(groqMessages(req));
    // Too big for Groq's minute: the runner splits its batch and asks again (413, never another brain).
    if (tokens > GROQ_PROMPT_LIMIT) return json({ error: `The prompt is about ${tokens} tokens; the free brain takes ${GROQ_PROMPT_LIMIT}. Split it.`, tooLarge: true, tokens, limit: GROQ_PROMPT_LIMIT }, 413);
    try {
      const r = await groq.call({ ...req, webSearch: false });
      return json({ text: r.text, model: r.model ?? groq.name, stopReason: r.stopReason, usage: r.usage ?? null, tokens });
    } catch (error) {
      const e = /** @type {any} */ (error);
      if (e?.tooLarge) return json({ error: String(e.message).slice(0, 600), tooLarge: true, tokens, limit: GROQ_PROMPT_LIMIT }, 413);
      // A busy minute or a used-up day, in Groq's own words, as 429 so the runner itself decides to wait or stop.
      return json({ error: e instanceof Error ? e.message.slice(0, 600) : String(e), tokens }, 429);
    }
  }

  // The daily film's narration, made on the runner, goes up like an uploaded voice; complete starts voice-film.yml.
  if (sub === "voice" && method === "POST") {
    if (!dailyRunner) return json({ error: "Wrong ticket." }, 401);
    if (rec.uploaded) return json({ error: "This daily film already has its voice." }, 409);
    const bytes = Number((/** @type {any} */ (await request.json().catch(() => null)))?.bytes);
    if (!Number.isInteger(bytes) || bytes < 1024 || bytes > MAX_AUDIO_BYTES) return json({ error: "bytes must be the narration's size." }, 400);
    if (rec.uploadId) await bucket.resumeMultipartUpload(rec.audioKey, rec.uploadId).abort().catch(() => {});
    const upload = await bucket.createMultipartUpload(rec.audioKey, { httpMetadata: { contentType: AUDIO_TYPES.mp3 } });
    rec.bytes = bytes;
    rec.uploadId = upload.uploadId;
    await save(bucket, rec);
    return json({ partSize: PART_SIZE, parts: partsFor(bytes) }, 201);
  }

  // The creator's own upload of the recording.
  const part = /^(film\/)?parts\/(\d{1,5})$/.exec(sub);
  if (part && method === "PUT") {
    const forFilm = Boolean(part[1]);
    if (forFilm ? !runner : !(owner || dailyRunner)) return json({ error: forFilm ? "Wrong ticket." : "Wrong studio token." }, 401);
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
    if (forFilm ? !runner : !(owner || dailyRunner)) return json({ error: forFilm ? "Wrong ticket." : "Wrong studio token." }, 401);
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

  // The Craft Ledger: the runner reads the channel's targets before the shot plan, and records the film after the gate.
  if (sub === "ledger" && (method === "GET" || method === "POST")) {
    if (!owner && !runner) return json({ error: "Wrong ticket." }, 401);
    const store = r2Ledger(bucket);
    if (method === "GET") {
      const { ledger, notes } = await store.read();
      return json({ ...ledger, notes });
    }
    const body = /** @type {any} */ (await request.json().catch(() => null));
    const made = recordFromReport({ filmId: id, report: body?.report, genre: typeof body?.genre === "string" ? body.genre : undefined, at: new Date(now()).toISOString() });
    if (!made.ok) return json({ error: msg(made.notes[0].code, made.notes[0].params ?? {}).en, notes: made.notes }, 400);
    const done = await store.update((ledger) => {
      const next = addRecord(ledger, made.record);
      return { ledger: next.ledger, note: { code: "craft.added", params: { filmId: id, genre: made.record.genre, verdict: made.record.verdict, seconds: made.record.seconds, films: next.ledger.films.length } } };
    });
    return json({ ok: true, films: done?.ledger.films.length ?? 0, note: done?.note ?? null, notes: made.notes });
  }

  if (sub === "marks" && method === "POST") {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    if (rec.kind !== "quran") return json({ error: "Ayah marks are for a Quran recitation." }, 400);
    const st = statusOf(rec);
    if (st !== "awaiting-review" && st !== "failed") return json({ error: "Mark the ayat when the film is ready for review." }, 409);
    const expected = Array.isArray(rec.report?.ayat) ? rec.report.ayat.length : null;
    // The upload can be longer than the film (its pauses were shortened): the runner checks against the real length.
    const checked = checkMarks(await request.json().catch(() => null), expected ?? 0, 36000);
    if (!expected) return json({ error: "This film has no ayah list yet; start it again first." }, 409);
    if (!checked.ok) return json({ error: checked.error }, 400);
    rec.marks = checked.marks;
    rec.retries = (rec.retries ?? 0) + 1;
    delete rec.film;
    rec.progress.push(progressEntry("marked", { count: checked.marks.ends.length, by: checked.marks.by }));
    return start(rec);
  }

  if (sub === "retry" && method === "POST") {
    if (!owner) return json({ error: "Wrong studio token." }, 401);
    if (!rec.uploaded) return json({ error: "The recording is not fully uploaded yet." }, 409);
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) return json({ error: "GitHub is not connected (GITHUB_TOKEN secret, GITHUB_REPO var)." }, 503);
    if (statusOf(rec) === "running" && (await runEnded(rec, env, deps.fetch))) {
      rec.progress.push(progressEntry(rec.progress.at(-1)?.stage ?? "started", {}, "the film machine stopped without reporting (its runner was shut down)."));
    }
    if (statusOf(rec) !== "failed") return json({ error: "Only a stopped film can be started again." }, 409);
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
    const dl = await makeTicket(env.STUDIO_TOKEN, id, "download", DOWNLOAD_TICKET_SECONDS, now());
    if (rec.film) view.download = `/api/voice/${id}/film?ticket=${dl}`;
    // Quran: the reviewer listens to the uploaded recording and taps each ayah end (POST /marks).
    if (rec.kind === "quran" && rec.uploaded) view.listen = `/api/voice/${id}/audio?ticket=${await makeTicket(env.STUDIO_TOKEN, id, "listen", DOWNLOAD_TICKET_SECONDS, now())}`;
    return json(view);
  }

  if (sub === "audio" && method === "GET") {
    if (!owner && !runner && !(rec.kind === "quran" && (await checkTicket(env.STUDIO_TOKEN, id, ticket, ["listen"], now())))) return json({ error: "Wrong studio token." }, 401);
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
    // The owner may search too (a picture test of an earlier film, made outside a runner).
    if (!runner && !owner) return json({ error: "Wrong ticket." }, 401);
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
