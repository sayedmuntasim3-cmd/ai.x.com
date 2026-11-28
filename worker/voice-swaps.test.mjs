import { test } from "node:test";
import assert from "node:assert/strict";
import { handleVoice, makeTicket } from "./voice-api.mjs";
import { buildEditPack } from "../engine/src/edit-pack.mjs";

const ID = "11111111-2222-3333-4444-555555555555";
const OWNER = { authorization: "Bearer owner-token" };

/** An R2 bucket with get/put/list/delete and multipart uploads, enough for the swap routes. */
function fakeBucket(seed = {}) {
  /** @type {Map<string, Uint8Array>} */
  const files = new Map(Object.entries(seed).map(([k, v]) => [k, new TextEncoder().encode(v)]));
  const obj = (/** @type {Uint8Array} */ b) => ({ size: b.byteLength, body: new Blob([b]).stream(), text: async () => new TextDecoder().decode(b) });
  return {
    files,
    async get(/** @type {string} */ k) { const b = files.get(k); return b ? obj(b) : null; },
    async put(/** @type {string} */ k, /** @type {string} */ v) { files.set(k, typeof v === "string" ? new TextEncoder().encode(v) : v); },
    async delete(/** @type {string[]} */ keys) { for (const k of [keys].flat()) files.delete(k); },
    async list(/** @type {string} */ prefix) { return { objects: [], delimitedPrefixes: [...files.keys()].filter((k) => k.startsWith(prefix)) }; },
    async createMultipartUpload(/** @type {string} */ key) { return { key, uploadId: "u1" }; },
    resumeMultipartUpload(/** @type {string} */ key) { return { uploadPart: async () => ({ partNumber: 1, etag: "e1" }), complete: async () => ({ size: 1 }), abort: async () => {} }; },
  };
}

/** @param {any} env @param {string} method @param {string} path @param {{ headers?: Record<string, string>, body?: any, fetch?: any, now?: () => number }} [o] */
async function call(env, method, path, o = {}) {
  const url = new URL(`https://ai.example.com${path}`);
  const body = o.body === undefined ? undefined : o.body instanceof Uint8Array ? o.body : typeof o.body === "string" ? o.body : JSON.stringify(o.body);
  const res = await handleVoice(new Request(url, { method, headers: o.headers, body }), env, url, { uuid: () => ID, fetch: o.fetch, now: o.now });
  assert.ok(res, `no response for ${method} ${path}`);
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, headers: res.headers, data: type.startsWith("application/json") ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
}

/** The pack the runner writes when a film finishes. */
function pack() {
  const pick = (/** @type {string} */ id, /** @type {string} */ licence) => ({
    id,
    source: id.split(":")[0],
    kind: "video",
    mediaUrl: `https://videos.test/${id.replace(/[^a-z0-9]/gi, "")}.mp4`,
    previewUrl: `https://images.test/${id.replace(/[^a-z0-9]/gi, "")}.jpg`,
    sourcePageUrl: `https://www.test/${id}`,
    licence: { licenseId: licence, name: licence, licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: `https://www.test/${id}` },
  });
  const media = {
    chapter: "C1",
    shots: [
      { scene: "SC0001", shot: 1, start: 0, end: 10, status: "found", query: "mine", pick: pick("pexels:video:1", "PEXELS"), alternates: [], trace: [] },
      { scene: "SC0001", shot: 2, start: 10, end: 20, status: "found", query: "truck", pick: pick("pexels:video:2", "PEXELS"), alternates: [], trace: [] },
    ],
  };
  return buildEditPack({
    filmId: ID,
    parts: 2,
    chapters: [{ id: "C1", title: "The pit", markdown: "SC0001 0:00-0:20 A mine.\nSHOTS: R3 the headframe; R3 the truck\n" }],
    media,
    rank: { shots: [] },
  });
}

/** A finished film record, as the runner leaves it after delivery. */
function record(extra = {}) {
  return {
    id: ID,
    kind: "narration",
    ext: "mp3",
    fileName: "mine.mp3",
    bytes: 2000,
    uploaded: true,
    audioKey: `voice/${ID}/audio.mp3`,
    createdAt: "2026-11-27T10:00:00.000Z",
    film: { key: `voice/${ID}/film.mp4`, bytes: 9000, seconds: 20 },
    progress: [{ at: "2026-11-27T20:00:00.000Z", stage: "done", ok: true, message: { en: "Film ready: 20 min.", bn: "ok" } }],
    ...extra,
  };
}

const env = (/** @type {any} */ seed = {}) => ({
  FILMS: fakeBucket({ [`voice/${ID}/voice.json`]: JSON.stringify(record(seed.rec)), ...(seed.pack === false ? {} : { [`voice/${ID}/edit.json`]: JSON.stringify(pack()) }) }),
  STUDIO_TOKEN: "owner-token",
  SITE_URL: "https://ai.example.com",
  GITHUB_TOKEN: "gh",
  GITHUB_REPO: "o/r",
});

/** GitHub's answer to a workflow dispatch, remembering what was sent. */
function dispatcher() {
  /** @type {{ url: string, body: any }[]} */
  const sent = [];
  const fetch = async (/** @type {string} */ url, /** @type {any} */ init) => {
    sent.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(null, { status: 204 });
  };
  return { sent, fetch };
}

test("the runner saves the edit pack; the owner reads it; a broken pack is refused", async () => {
  const e = env({ pack: false });
  const ticket = await makeTicket("owner-token", ID, "runner", 600);
  assert.equal((await call(e, "GET", `/api/voice/${ID}/edit`, { headers: OWNER })).status, 404, "no pack before the film finishes");
  assert.equal((await call(e, "POST", `/api/voice/${ID}/edit?ticket=${ticket}`, { body: "not json" })).status, 400);
  assert.equal((await call(e, "POST", `/api/voice/${ID}/edit?ticket=${ticket}`, { body: { version: 1, shots: [] } })).status, 400);
  assert.equal((await call(e, "POST", `/api/voice/${ID}`, { headers: OWNER })).status, 404, "no other verb writes to the film itself");
  const saved = await call(e, "POST", `/api/voice/${ID}/edit?ticket=${ticket}`, { body: pack() });
  assert.equal(saved.status, 201);
  assert.equal(saved.data.shots, 2);
  // No ticket, no studio key: nothing is written.
  assert.equal((await call(e, "POST", `/api/voice/${ID}/edit`, { body: pack() })).status, 401);
  const read = await call(e, "GET", `/api/voice/${ID}/edit`, { headers: OWNER });
  assert.equal(read.status, 200);
  assert.equal(read.data.shots[0].id, "SC0001-1");
  assert.equal(read.data.parts.length, 2);
  assert.equal((await call(e, "GET", `/api/voice/${ID}/edit?ticket=${ticket}`)).status, 200, "the re-make's runner reads the pack with its ticket");
});

test("swaps: the studio key is needed, and only this film's own shots can change", async () => {
  const e = env();
  const candidate = { id: "pixabay:image:9", source: "pixabay", licence: "PIXABAY", mediaUrl: "https://cdn.pixabay.com/9.jpg", previewUrl: "https://cdn.pixabay.com/9.jpg" };
  assert.equal((await call(e, "POST", `/api/voice/${ID}/swaps`, { body: { swaps: [{ shotId: "SC0001-1", candidate }] } })).status, 401);
  const ticket = await makeTicket("owner-token", ID, "runner", 600);
  assert.equal((await call(e, "POST", `/api/voice/${ID}/swaps?ticket=${ticket}`, { body: { swaps: [{ shotId: "SC0001-1", candidate }] } })).status, 401, "the runner never swaps pictures");
  const unknown = await call(e, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0009-4", candidate }] } });
  assert.equal(unknown.status, 400);
  assert.match(unknown.data.error, /Unknown shot/);
  assert.equal((await call(e, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [] } })).status, 400);
  const paid = await call(e, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-1", candidate: { ...candidate, licence: "CC-BY-NC" } }] } });
  assert.equal(paid.status, 400);
  assert.match(paid.data.error, /free-licence/);
  const byId = await call(e, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-1", candidateId: "pexels:video:2" }] } });
  assert.equal(byId.status, 400, "a neighbour shot's picture is not this shot's alternative");
});

test("a swap re-makes the film: the film goes, the pack keeps the new picture, the machine starts with the swaps", async () => {
  const e = env();
  const gh = dispatcher();
  const candidate = { id: "pixabay:image:9", source: "pixabay", licence: "PIXABAY", mediaUrl: "https://cdn.pixabay.com/9.jpg", previewUrl: "https://cdn.pixabay.com/9.jpg" };
  const res = await call(e, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-2", candidate }] }, fetch: gh.fetch });
  assert.equal(res.status, 202);
  assert.equal(res.data.swaps, 1);
  assert.equal(res.data.status, "queued");
  assert.ok(res.data.film, "the old film stays downloadable and is the re-make's untouched parts");
  assert.equal(res.data.progress.at(-2).stage, "swaps");
  assert.match(res.data.progress.at(-2).message.en, /1 new picture/);
  assert.match(res.data.progress.at(-2).message.bn, /নতুন ছবি/, "the message is in Bangla too");
  // The workflow was started with the swaps, so the runner renders only the parts holding them.
  assert.equal(gh.sent.length, 1);
  assert.equal(gh.sent[0].url, "https://api.github.com/repos/o/r/actions/workflows/voice-film.yml/dispatches");
  const sent = JSON.parse(gh.sent[0].body.inputs.swaps);
  assert.equal(sent.swaps.length, 1);
  assert.equal(sent.swaps[0].shotId, "SC0001-2");
  assert.equal(sent.swaps[0].pick.id, "pixabay:image:9");
  // The studio's pack now shows the new picture first, and the old one is still offered.
  const packNow = JSON.parse(await (await e.FILMS.get(`voice/${ID}/edit.json`)).text());
  const shot = packNow.shots.find((/** @type {any} */ s) => s.id === "SC0001-2");
  assert.equal(shot.pick.id, "pixabay:image:9");
  assert.ok(shot.candidates.some((/** @type {any} */ c) => c.id === "pexels:video:2"));
});

test("a film that has not finished, or has no pack, cannot be swapped", async () => {
  const fresh = env({ rec: { film: undefined, progress: [{ at: "2026-11-27T10:00:00.000Z", stage: "render", ok: true, message: { en: "Making the film.", bn: "ok" } }] } });
  const candidate = { id: "pixabay:image:9", licence: "PIXABAY", mediaUrl: "https://cdn.pixabay.com/9.jpg" };
  const early = await call(fresh, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-1", candidate }] } });
  assert.equal(early.status, 409);
  const noPack = await call(env({ pack: false }), "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-1", candidate }] } });
  assert.equal(noPack.status, 404);
  // Quran: the adab rule is the scholar's, not the page's.
  const quran = env({ rec: { kind: "quran", surah: 93 } });
  const denied = await call(quran, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-1", candidate }] } });
  assert.equal(denied.status, 409);
  assert.match(denied.data.error, /adab/);
  // A reused id with another recording's shot id is refused before anything is started.
  const other = env({ rec: {} });
  assert.equal((await call(other, "POST", `/api/voice/${ID}/swaps`, { headers: OWNER, body: { swaps: [{ shotId: "SC0001-1", candidateId: "nope:1" }] } })).status, 400);
});
