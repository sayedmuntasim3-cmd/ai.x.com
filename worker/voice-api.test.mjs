import { test } from "node:test";
import assert from "node:assert/strict";
import { checkTicket, checkVoiceRequest, handleVoice, makeTicket, PART_SIZE, partsFor } from "./voice-api.mjs";

/** An R2 bucket with get/put/list and multipart uploads, enough for the voice routes. */
function fakeBucket() {
  /** @type {Map<string, Uint8Array>} */
  const files = new Map();
  /** @type {Map<string, { key: string, parts: Map<number, Uint8Array> }>} */
  const uploads = new Map();
  const obj = (/** @type {Uint8Array} */ b) => ({ size: b.byteLength, body: new Blob([b]).stream(), text: async () => new TextDecoder().decode(b) });
  return {
    files,
    async get(/** @type {string} */ k) { const b = files.get(k); return b ? obj(b) : null; },
    async put(/** @type {string} */ k, /** @type {string} */ v) { files.set(k, typeof v === "string" ? new TextEncoder().encode(v) : v); },
    async delete(/** @type {string[]} */ keys) { for (const k of [keys].flat()) files.delete(k); },
    async list(/** @type {any} */ o) {
      const set = new Set();
      for (const k of files.keys()) if (k.startsWith(o.prefix)) { const rest = k.slice(o.prefix.length); const i = rest.indexOf("/"); if (i >= 0) set.add(o.prefix + rest.slice(0, i + 1)); }
      return { objects: [], delimitedPrefixes: [...set] };
    },
    async createMultipartUpload(/** @type {string} */ key) { const uploadId = `u${uploads.size + 1}`; uploads.set(uploadId, { key, parts: new Map() }); return { key, uploadId }; },
    resumeMultipartUpload(/** @type {string} */ key, /** @type {string} */ uploadId) {
      const u = uploads.get(uploadId);
      if (!u || u.key !== key) throw new Error("no such upload");
      return {
        async uploadPart(/** @type {number} */ n, /** @type {Uint8Array} */ body) { u.parts.set(n, body); return { partNumber: n, etag: `e${n}` }; },
        async complete(/** @type {any[]} */ list) {
          const chunks = list.map((p) => { const b = u.parts.get(p.partNumber); if (!b || p.etag !== `e${p.partNumber}`) throw new Error("bad part"); return b; });
          const all = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
          let at = 0;
          for (const c of chunks) { all.set(c, at); at += c.byteLength; }
          files.set(key, all);
          uploads.delete(uploadId);
          return { size: all.byteLength };
        },
        async abort() { uploads.delete(uploadId); },
      };
    },
  };
}

const ID = "11111111-2222-3333-4444-555555555555";
const OWNER = { authorization: "Bearer owner-token" };

/** @param {any} env @param {string} method @param {string} path @param {{ headers?: Record<string, string>, body?: any, fetch?: any, now?: () => number }} [o] */
async function call(env, method, path, o = {}) {
  const url = new URL(`https://ai.example.com${path}`);
  const body = o.body === undefined ? undefined : o.body instanceof Uint8Array ? o.body : JSON.stringify(o.body);
  const res = await handleVoice(new Request(url, { method, headers: o.headers, body }), env, url, { uuid: () => ID, fetch: o.fetch, now: o.now });
  assert.ok(res, `no response for ${method} ${path}`);
  const type = res.headers.get("content-type") ?? "";
  return { status: res.status, headers: res.headers, data: type.startsWith("application/json") ? await res.json() : new Uint8Array(await res.arrayBuffer()) };
}

test("requests are checked: audio only, a surah for Quran, sizes", () => {
  assert.equal(checkVoiceRequest({ fileName: "story.mp3", bytes: 5e6 }).ok, true);
  assert.match(/** @type {any} */ (checkVoiceRequest({ fileName: "story.exe", bytes: 5e6 })).error, /audio file/);
  assert.match(/** @type {any} */ (checkVoiceRequest({ fileName: "a.wav", bytes: 3e9 })).error, /2 GB/);
  assert.match(/** @type {any} */ (checkVoiceRequest({ fileName: "a.wav", bytes: 5e6, kind: "quran" })).error, /surah/);
  const q = /** @type {any} */ (checkVoiceRequest({ fileName: "duha.m4a", bytes: 5e6, kind: "quran", surah: 93, ayat: "1-11", reciter: "Qari <b>X</b>" }));
  assert.equal(q.ok, true);
  assert.equal(q.value.reciter, "Qari bXb");
  assert.equal(partsFor(PART_SIZE), 1);
  assert.equal(partsFor(PART_SIZE + 1), 2);
});

test("tickets are bound to one recording, one purpose, and expire", async () => {
  const T0 = Date.UTC(2026, 10, 20);
  const t = await makeTicket("secret", ID, "runner", 60, T0);
  assert.equal(await checkTicket("secret", ID, t, ["runner"], T0 + 1000), true);
  assert.equal(await checkTicket("secret", ID, t, ["download"], T0 + 1000), false);
  assert.equal(await checkTicket("secret", "99999999-2222-3333-4444-555555555555", t, ["runner"], T0 + 1000), false);
  assert.equal(await checkTicket("other", ID, t, ["runner"], T0 + 1000), false);
  assert.equal(await checkTicket("secret", ID, t, ["runner"], T0 + 61_000), false);
  assert.equal(await checkTicket("secret", ID, "runner.1.abc", ["runner"], 0), false);
});

test("upload in pieces, the film starts on GitHub, the runner reports and sends the film back", async () => {
  const env = { FILMS: fakeBucket(), STUDIO_TOKEN: "owner-token", GITHUB_TOKEN: "gh", GITHUB_REPO: "o/r" };
  // Nobody without the studio key.
  assert.equal((await call(env, "POST", "/api/voice", { body: { fileName: "a.mp3", bytes: 2000 } })).status, 401);

  const audio = new Uint8Array(PART_SIZE + 1234).map((_, i) => i % 251);
  const created = await call(env, "POST", "/api/voice", { headers: OWNER, body: { fileName: "From $40 to a Lamborghini.mp3", bytes: audio.byteLength, topic: "From $40 to a Lamborghini" } });
  assert.equal(created.status, 201);
  assert.deepEqual(created.data, { id: ID, partSize: PART_SIZE, parts: 2 });

  // A wrong-sized piece is refused.
  assert.equal((await call(env, "PUT", `/api/voice/${ID}/parts/1`, { headers: OWNER, body: audio.slice(0, 10) })).status, 400);
  const p1 = await call(env, "PUT", `/api/voice/${ID}/parts/1`, { headers: OWNER, body: audio.slice(0, PART_SIZE) });
  const p2 = await call(env, "PUT", `/api/voice/${ID}/parts/2`, { headers: OWNER, body: audio.slice(PART_SIZE) });
  assert.equal(p2.data.etag, "e2");

  /** @type {any[]} */
  const dispatched = [];
  const gh = async (/** @type {string} */ u, /** @type {any} */ init) => { dispatched.push({ u, body: JSON.parse(init.body) }); return new Response(null, { status: 204 }); };
  const done = await call(env, "POST", `/api/voice/${ID}/complete`, { headers: OWNER, body: { parts: [p1.data, p2.data] }, fetch: gh });
  assert.equal(done.status, 202);
  assert.equal(done.data.status, "queued");
  assert.equal(dispatched.length, 1);
  assert.match(dispatched[0].u, /actions\/workflows\/voice-film\.yml\/dispatches$/);
  const inputs = dispatched[0].body.inputs;
  assert.equal(inputs.voice_id, ID);
  assert.equal(inputs.kind, "narration");
  assert.equal(inputs.ext, "mp3");
  assert.equal(inputs.site, "https://ai.example.com");
  assert.equal(Object.keys(inputs).length <= 10, true, "GitHub allows at most 10 inputs");
  assert.equal(String(done.data.progress[0].message.bn).length > 0, true);

  // The upload is closed: no more pieces.
  assert.equal((await call(env, "PUT", `/api/voice/${ID}/parts/1`, { headers: OWNER, body: audio.slice(0, PART_SIZE) })).status, 409);

  // The runner reads the recording with its ticket, byte for byte.
  const ticket = inputs.ticket;
  assert.equal((await call(env, "GET", `/api/voice/${ID}/audio`)).status, 401);
  const got = await call(env, "GET", `/api/voice/${ID}/audio?ticket=${ticket}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.data, audio);

  // Progress, then the film comes back in pieces.
  assert.equal((await call(env, "POST", `/api/voice/${ID}/progress`, { body: { stage: "words", params: { count: 6127 } } })).status, 401);
  assert.equal((await call(env, "POST", `/api/voice/${ID}/progress?ticket=${ticket}`, { body: { stage: "nope" } })).status, 400);
  const w = await call(env, "POST", `/api/voice/${ID}/progress?ticket=${ticket}`, { body: { stage: "words", params: { count: 6127 }, runUrl: "https://github.com/o/r/actions/runs/42" } });
  assert.equal(w.data.status, "running");
  const film = new Uint8Array(4096).fill(7);
  const open = await call(env, "POST", `/api/voice/${ID}/film?ticket=${ticket}`, { body: { bytes: film.byteLength } });
  assert.equal(open.data.parts, 1);
  const fp = await call(env, "PUT", `/api/voice/${ID}/film/parts/1?ticket=${ticket}`, { body: film });
  assert.equal((await call(env, "POST", `/api/voice/${ID}/film/complete?ticket=${ticket}`, { body: { parts: [fp.data], seconds: 2400 } })).status, 200);
  await call(env, "POST", `/api/voice/${ID}/progress?ticket=${ticket}`, { body: { stage: "done", params: { minutes: 40 } } });

  // The creator sees it done, with a download link that works without the key and only for this film.
  const view = await call(env, "GET", `/api/voice/${ID}`, { headers: OWNER });
  assert.equal(view.data.status, "done");
  assert.equal(view.data.run.runUrl, "https://github.com/o/r/actions/runs/42");
  assert.equal(view.data.film.seconds, 2400);
  assert.equal(view.data.progress.at(-1).message.en, "Film ready: 40 min. Download it below.");
  assert.equal("uploadId" in view.data || "audioKey" in view.data, false);
  const dl = await call(env, "GET", view.data.download);
  assert.equal(dl.status, 200);
  assert.deepEqual(dl.data, film);
  assert.match(String(dl.headers.get("content-disposition")), /From 40 to a Lamborghini\.mp4/);
  // A download ticket cannot read the recording or report progress.
  const dlTicket = new URL(view.data.download, "https://x").searchParams.get("ticket");
  assert.equal((await call(env, "GET", `/api/voice/${ID}/audio?ticket=${dlTicket}`)).status, 401);
  assert.equal((await call(env, "POST", `/api/voice/${ID}/progress?ticket=${dlTicket}`, { body: { stage: "done" } })).status, 401);

  const list = await call(env, "GET", "/api/voice", { headers: OWNER });
  assert.equal(list.data.films.length, 1);
  assert.equal(list.data.films[0].id, ID);
});

test("without GitHub the recording is kept and the reason is said; Quran waits for a scholar", async () => {
  const env = { FILMS: fakeBucket(), STUDIO_TOKEN: "owner-token" };
  const audio = new Uint8Array(5000).fill(1);
  await call(env, "POST", "/api/voice", { headers: OWNER, body: { fileName: "duha.mp3", bytes: audio.byteLength, kind: "quran", surah: 93 } });
  const p = await call(env, "PUT", `/api/voice/${ID}/parts/1`, { headers: OWNER, body: audio });
  const done = await call(env, "POST", `/api/voice/${ID}/complete`, { headers: OWNER, body: { parts: [p.data] } });
  assert.equal(done.data.status, "failed");
  assert.match(done.data.progress.at(-1).message.en, /GitHub is not connected/);
  assert.match(done.data.progress.at(-1).message.bn, /থেমে গেছে/);
  // A Quran film that finished is "awaiting review", never plain "done".
  const t = await makeTicket("owner-token", ID, "runner", 60);
  await call(env, "POST", `/api/voice/${ID}/progress?ticket=${t}`, { body: { stage: "done", params: { minutes: 3, review: 1 } } });
  const view = await call(env, "GET", `/api/voice/${ID}`, { headers: OWNER });
  assert.equal(view.data.status, "awaiting-review");
  assert.match(view.data.progress.at(-1).message.en, /scholar/);
});

test("other paths are not handled here", async () => {
  const url = new URL("https://x/api/films");
  assert.equal(await handleVoice(new Request(url), { FILMS: fakeBucket(), STUDIO_TOKEN: "t" }, url), null);
});

test("no topic typed: the file name is the topic, unless it is a generic name", () => {
  assert.equal(/** @type {any} */ (checkVoiceRequest({ fileName: "Ramesh Babu - From Barber to Rolls-Royce.mp3", bytes: 5e6 })).value.topic, "Ramesh Babu - From Barber to Rolls-Royce");
  assert.equal(/** @type {any} */ (checkVoiceRequest({ fileName: "My narration.webm", bytes: 5e6 })).value.topic, "");
  assert.equal(/** @type {any} */ (checkVoiceRequest({ fileName: "20261120_0012.m4a", bytes: 5e6 })).value.topic, "");
  assert.equal(/** @type {any} */ (checkVoiceRequest({ fileName: "a.mp3", bytes: 5e6, topic: "Gold rush" })).value.topic, "Gold rush");
});

test("a stopped film starts again from the saved recording; a film can be deleted", async () => {
  const env = { FILMS: fakeBucket(), STUDIO_TOKEN: "owner-token", GITHUB_TOKEN: "gh", GITHUB_REPO: "o/r" };
  const audio = new Uint8Array(5000).fill(3);
  await call(env, "POST", "/api/voice", { headers: OWNER, body: { fileName: "story.mp3", bytes: audio.byteLength } });
  const p = await call(env, "PUT", `/api/voice/${ID}/parts/1`, { headers: OWNER, body: audio });
  /** @type {any[]} */
  const sent = [];
  const gh = async (/** @type {string} */ _u, /** @type {any} */ init) => { sent.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); };
  await call(env, "POST", `/api/voice/${ID}/complete`, { headers: OWNER, body: { parts: [p.data] }, fetch: gh });
  // Running: no retry.
  assert.equal((await call(env, "POST", `/api/voice/${ID}/retry`, { headers: OWNER, fetch: gh })).status, 409);
  const t = sent[0].inputs.ticket;
  await call(env, "POST", `/api/voice/${ID}/progress?ticket=${t}`, { body: { stage: "check", error: "200 pictures could not be downloaded" } });
  assert.equal((await call(env, "POST", `/api/voice/${ID}/retry`, { fetch: gh })).status, 401);
  const again = await call(env, "POST", `/api/voice/${ID}/retry`, { headers: OWNER, fetch: gh });
  assert.equal(again.status, 202);
  assert.equal(again.data.status, "queued");
  assert.equal(sent.length, 2, "dispatched again with a fresh ticket");
  // Delete removes the recording and the record.
  assert.equal((await call(env, "DELETE", `/api/voice/${ID}`)).status, 401);
  assert.equal((await call(env, "DELETE", `/api/voice/${ID}`, { headers: OWNER })).status, 200);
  assert.equal(env.FILMS.files.size, 0);
  assert.equal((await call(env, "GET", `/api/voice/${ID}`, { headers: OWNER })).status, 404);
});

test("the runner searches Pixabay through the Worker; the key stays on the Worker", async () => {
  const env = { FILMS: fakeBucket(), STUDIO_TOKEN: "owner-token", PIXABAY_API_KEY: "pk-secret" };
  await call(env, "POST", "/api/voice", { headers: OWNER, body: { fileName: "story.mp3", bytes: 5000 } });
  /** @type {string[]} */
  const asked = [];
  const pixabay = async (/** @type {string} */ u) => { asked.push(u); return new Response(JSON.stringify({ hits: [{ id: 1, tags: "barber, salon" }] }), { headers: { "content-type": "application/json" } }); };
  const t = await makeTicket("owner-token", ID, "runner", 60);
  assert.equal((await call(env, "GET", `/api/voice/${ID}/stock?q=barber`, { fetch: pixabay })).status, 401);
  const r = await call(env, "GET", `/api/voice/${ID}/stock?ticket=${t}&kind=video&q=barber%20shop&per_page=20&safesearch=true&evil=1`, { fetch: pixabay });
  assert.equal(r.status, 200);
  assert.equal(r.data.hits[0].tags, "barber, salon");
  const up = new URL(asked[0]);
  assert.equal(up.origin + up.pathname, "https://pixabay.com/api/videos/");
  assert.equal(up.searchParams.get("key"), "pk-secret");
  assert.equal(up.searchParams.get("q"), "barber shop");
  assert.equal(up.searchParams.get("evil"), null, "only Pixabay's own options pass");
  assert.ok(!JSON.stringify(r.data).includes("pk-secret"));
  // The owner (studio key) may search too; a download ticket may not.
  assert.equal((await call(env, "GET", `/api/voice/${ID}/stock?kind=image&q=barber`, { headers: OWNER, fetch: pixabay })).status, 200);
  const dl = await makeTicket("owner-token", ID, "download", 60);
  assert.equal((await call(env, "GET", `/api/voice/${ID}/stock?ticket=${dl}&q=barber`, { fetch: pixabay })).status, 401);
});

test("Quran: the reviewer listens, taps each ayah end, and the film is made again with those times", async () => {
  const env = { FILMS: fakeBucket(), STUDIO_TOKEN: "owner-token", GITHUB_TOKEN: "gh", GITHUB_REPO: "o/r" };
  const audio = new Uint8Array(5000).fill(2);
  await call(env, "POST", "/api/voice", { headers: OWNER, body: { fileName: "duha.mp3", bytes: audio.byteLength, kind: "quran", surah: 93 } });
  const p = await call(env, "PUT", `/api/voice/${ID}/parts/1`, { headers: OWNER, body: audio });
  /** @type {any[]} */
  const sent = [];
  const gh = async (/** @type {string} */ _u, /** @type {any} */ init) => { sent.push(JSON.parse(init.body)); return new Response(null, { status: 204 }); };
  await call(env, "POST", `/api/voice/${ID}/complete`, { headers: OWNER, body: { parts: [p.data] }, fetch: gh });
  const t = sent[0].inputs.ticket;
  // Not ready yet: no marks.
  assert.equal((await call(env, "POST", `/api/voice/${ID}/marks`, { headers: OWNER, body: { start: 1, ends: [2], by: "A" }, fetch: gh })).status, 409);
  await call(env, "POST", `/api/voice/${ID}/progress?ticket=${t}`, { body: { stage: "done", params: { minutes: 3, review: 1 }, report: { ayat: [{ ref: "93:1" }, { ref: "93:2" }, { ref: "93:3" }] } } });
  const view = await call(env, "GET", `/api/voice/${ID}`, { headers: OWNER });
  assert.match(view.data.listen, /\/audio\?ticket=listen\./);
  const heard = await call(env, "GET", view.data.listen);
  assert.deepEqual(heard.data, audio, "the reviewer's player gets the uploaded recitation");
  assert.equal((await call(env, "POST", `/api/voice/${ID}/marks`, { headers: OWNER, body: { start: 1, ends: [4, 8], by: "Hafiz A" }, fetch: gh })).status, 400, "3 ayat need 3 ends");
  const ok = await call(env, "POST", `/api/voice/${ID}/marks`, { headers: OWNER, body: { start: 1, ends: [4, 8, 12.5], by: "Hafiz A" }, fetch: gh });
  assert.equal(ok.status, 202);
  assert.equal(ok.data.status, "queued");
  assert.match(ok.data.progress.at(-2).message.bn, /রিভিউয়ার/);
  const quran = JSON.parse(sent.at(-1).inputs.quran);
  assert.deepEqual(quran.marks, { start: 1, ends: [4, 8, 12.5], by: "Hafiz A" });
});

test("the Craft Ledger: the runner reads it and records the film; the audience hook adds retention", async () => {
  const { LEDGER_KEY, ledgerAudience } = await import("./voice-api.mjs");
  const bucket = fakeBucket();
  const env = { FILMS: bucket, STUDIO_TOKEN: "owner-token" };
  await bucket.put(`voice/${ID}/voice.json`, JSON.stringify({ id: ID, kind: "narration", ext: "mp3", progress: [] }));
  const ticket = await makeTicket("owner-token", ID, "runner", 3600, Date.now());
  assert.equal((await call(env, "GET", `/api/voice/${ID}/ledger`)).status, 401);
  const empty = await call(env, "GET", `/api/voice/${ID}/ledger?ticket=${ticket}`);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.films, []);
  const report = { critic: { verdict: "pass", measures: { seconds: 180, movingShare: 0.7, designedPerMinute: 2, avgShot: 4, narrationCoverage: 1, cutsIn30: 8, longestShot: 7, cueCoverage: 0.9, subtitles: { maxGap: 2 } } } };
  const put = await call(env, "POST", `/api/voice/${ID}/ledger?ticket=${ticket}`, { body: { report, genre: "biography" } });
  assert.equal(put.status, 200);
  assert.equal(put.data.films, 1);
  assert.equal(put.data.note.code, "craft.added");
  // The second film reads the first's record.
  const read = await call(env, "GET", `/api/voice/${ID}/ledger`, { headers: OWNER });
  assert.equal(read.data.films.length, 1);
  assert.equal(read.data.films[0].filmId, ID);
  assert.equal(read.data.films[0].genre, "biography");
  assert.equal(read.data.films[0].measures.subtitleGap, 2);
  // A report without measures teaches nothing and says so.
  assert.equal((await call(env, "POST", `/api/voice/${ID}/ledger?ticket=${ticket}`, { body: { report: {} } })).status, 400);
  // The audience hook: a retention report for a film in the ledger lands on its record; an unknown film is a note.
  const curve = Array.from({ length: 100 }, (_, i) => ({ at: i / 100, watching: 0.9 - i * 0.006 }));
  const note = await ledgerAudience(bucket, ID, { filmId: ID, videoId: "abc", at30: 70, half: 50, end: 35, curve, drops: [], holds: [] }, "2026-11-26T00:00:00Z");
  assert.equal(note?.code, "craft.audience");
  const after = JSON.parse(new TextDecoder().decode(bucket.files.get(LEDGER_KEY)));
  assert.equal(after.films[0].audience.at30, 70);
  const unknown = await ledgerAudience(bucket, "99999999-2222-3333-4444-555555555555", { at30: 70, end: 35, curve }, "2026-11-26T00:00:00Z");
  assert.equal(unknown?.code, "craft.noFilm");
});
