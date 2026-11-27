import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clearStoredUpload,
  estimateLeftSeconds,
  isSettled,
  leftText,
  missingParts,
  PART_RETRIES,
  partList,
  planParts,
  putPart,
  readStoredUpload,
  saveStoredUpload,
  stagePercent,
  statusText,
  uploadPercent,
  UPLOAD_STORE,
  VOICE_STAGES,
} from "./voice-upload.mjs";
import { VOICE_STAGES as WORKER_STAGES } from "../worker/voice-api.mjs";

const PART = 16 * 1024 * 1024;

/* ------------------------------ parts ------------------------------ */

test("planParts: every piece but the last is a full part", () => {
  const parts = planParts(PART * 2 + 1234, PART);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts[0], { partNumber: 1, start: 0, end: PART });
  assert.deepEqual(parts[1], { partNumber: 2, start: PART, end: PART * 2 });
  assert.deepEqual(parts[2], { partNumber: 3, start: PART * 2, end: PART * 2 + 1234 });
});

test("planParts: an exact multiple sends no empty piece", () => {
  assert.equal(planParts(PART * 2, PART).length, 2);
  assert.equal(planParts(PART, PART).length, 1);
});

test("planParts: a tiny file is still one piece, and zero is one piece (the server refuses it)", () => {
  assert.deepEqual(planParts(5, PART), [{ partNumber: 1, start: 0, end: 5 }]);
  assert.deepEqual(planParts(0, PART), [{ partNumber: 1, start: 0, end: 0 }]);
});

test("planParts: a bad part size is refused, not silently guessed", () => {
  assert.throws(() => planParts(10, 0), /partSize/);
  assert.throws(() => planParts(-1, PART), /bytes/);
});

test("planParts: the pieces cover exactly the file", () => {
  const bytes = 40 * 1024 * 1024 + 7;
  const parts = planParts(bytes, PART);
  assert.equal(parts.at(-1).end, bytes);
  let seen = 0;
  for (const p of parts) {
    assert.equal(p.start, seen);
    seen = p.end;
  }
});

/* ---------------------------- progress ----------------------------- */

test("uploadPercent: whole percent, clamped", () => {
  assert.equal(uploadPercent({ bytes: 1000, sentBytes: 0 }), 0);
  assert.equal(uploadPercent({ bytes: 1000, sentBytes: 500 }), 50);
  assert.equal(uploadPercent({ bytes: 1000, sentBytes: 1000 }), 100);
  assert.equal(uploadPercent({ bytes: 1000, sentBytes: 5000 }), 100);
  assert.equal(uploadPercent({ bytes: 1000, sentBytes: -5 }), 0);
  assert.equal(uploadPercent({ bytes: 0, sentBytes: 10 }), 0);
});

test("stagePercent: follows the studio's stage order, unknown stages count as the start", () => {
  assert.equal(stagePercent("script"), 0);
  assert.equal(stagePercent("done"), 100);
  assert.equal(stagePercent("nonsense"), 0);
  let last = -1;
  for (const stage of VOICE_STAGES) {
    const pct = stagePercent(stage);
    assert.ok(pct >= last, `${stage} moved backwards`);
    last = pct;
  }
});

test("the page's stage list is the studio's list, in the same order", () => {
  assert.deepEqual([...VOICE_STAGES], [...WORKER_STAGES]);
});

test("estimateLeftSeconds: the pace so far carries on", () => {
  assert.equal(estimateLeftSeconds({ percent: 50, elapsedSeconds: 600 }), 600);
  assert.equal(estimateLeftSeconds({ percent: 25, elapsedSeconds: 300 }), 900);
  assert.equal(estimateLeftSeconds({ percent: 100, elapsedSeconds: 600 }), 0);
  // Nothing done yet, or no clock: no estimate rather than a made-up one.
  assert.equal(estimateLeftSeconds({ percent: 0, elapsedSeconds: 600 }), null);
  assert.equal(estimateLeftSeconds({ percent: 40, elapsedSeconds: Number.NaN }), null);
});

test("leftText: both languages, plain words", () => {
  const hours = leftText(3 * 3600);
  assert.match(hours.en, /About 3 hr left/);
  assert.match(hours.bn, /প্রায়/);
  assert.match(hours.bn, /ঘণ্টা/);
  assert.match(leftText(600).en, /10 min/);
  assert.match(leftText(20).en, /Less than a minute/);
  assert.equal(leftText(null), null);
});

test("statusText: every status the studio reports has English and Bangla", () => {
  for (const status of ["uploading", "uploaded", "queued", "running", "done", "awaiting-review", "failed"]) {
    const t = statusText(status);
    assert.ok(t.en.length > 0, status);
    assert.ok(t.bn.length > 0, status);
    assert.notEqual(t.en, status);
    assert.match(t.bn, /[\u0980-\u09FF]/, `${status} is not Bangla`);
  }
  assert.equal(statusText("weird").en, statusText("running").en);
  assert.equal(statusText("done").en, "Your film is ready");
});

test("isSettled: done, failed and awaiting review stop the 20 s polling", () => {
  assert.equal(isSettled("done"), true);
  assert.equal(isSettled("failed"), true);
  assert.equal(isSettled("awaiting-review"), true);
  assert.equal(isSettled("running"), false);
  assert.equal(isSettled("queued"), false);
});

/* ------------------------------ retry ------------------------------ */

function fakeFetch(answers) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const a = answers.shift() ?? { status: 500, body: { error: "no answer left" } };
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.body };
  };
  return { f, calls };
}

const noSleep = async () => {};

test("putPart: one clean send makes one request", async () => {
  const { f, calls } = fakeFetch([{ status: 200, body: { partNumber: 1, etag: "e1" } }]);
  const out = await putPart({ url: "/p", key: "k", body: new Blob(["x"]), fetchImpl: f, sleep: noSleep });
  assert.deepEqual(out, { partNumber: 1, etag: "e1" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.method, "PUT");
  assert.equal(calls[0].init.headers.authorization, "Bearer k");
});

test("putPart: a dropped connection is retried and the retries are reported", async () => {
  const retries = [];
  let first = true;
  const f = async () => {
    if (first) {
      first = false;
      throw new Error("NetworkError");
    }
    return { ok: true, status: 200, json: async () => ({ partNumber: 2, etag: "e2" }) };
  };
  const out = await putPart({ url: "/p", key: "k", body: new Blob(["x"]), fetchImpl: f, sleep: noSleep, onRetry: (r) => retries.push(r) });
  assert.deepEqual(out, { partNumber: 2, etag: "e2" });
  assert.deepEqual(retries, [{ attempt: 1, tries: PART_RETRIES, error: "NetworkError" }]);
});

test("putPart: three retries, then it stops and says why", async () => {
  const { f, calls } = fakeFetch([
    { status: 500, body: { error: "boom" } },
    { status: 502, body: { error: "boom" } },
    { status: 503, body: { error: "boom" } },
    { status: 500, body: { error: "still down" } },
  ]);
  await assert.rejects(
    () => putPart({ url: "/p", key: "k", body: new Blob(["x"]), fetchImpl: f, sleep: noSleep }),
    (error) => {
      assert.equal(error.name, "UploadPartError");
      assert.equal(error.retryable, true);
      assert.equal(error.message, "still down");
      return true;
    },
  );
  assert.equal(calls.length, PART_RETRIES + 1);
});

test("putPart: a refusal the server will repeat is not retried (wrong key, wrong size)", async () => {
  const { f, calls } = fakeFetch([{ status: 400, body: { error: "Piece 2 should be 16 bytes, not 3." } }]);
  await assert.rejects(
    () => putPart({ url: "/p", key: "k", body: new Blob(["x"]), fetchImpl: f, sleep: noSleep }),
    (error) => {
      assert.equal(error.retryable, false);
      assert.match(error.message, /should be 16 bytes/);
      return true;
    },
  );
  assert.equal(calls.length, 1);
});

test("putPart: a 401 (studio key) stops at once", async () => {
  const { f, calls } = fakeFetch([{ status: 401, body: { error: "Wrong studio token." } }]);
  await assert.rejects(() => putPart({ url: "/p", key: "k", body: new Blob(["x"]), fetchImpl: f, sleep: noSleep }), /Wrong studio token/);
  assert.equal(calls.length, 1);
});

/* ----------------------------- resume ------------------------------ */

/** A storage that behaves like the phone's, including a full one. */
function fakeStorage({ fail = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem: (k) => (map.has(k) ? String(map.get(k)) : null),
    setItem: (k, v) => {
      if (fail) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: (k) => {
      if (fail) throw new Error("SecurityError");
      map.delete(k);
    },
  };
}

const state = (over = {}) => ({
  id: "6f1c0d2e-4a3b-4c5d-8e9f-0a1b2c3d4e5f",
  fileName: "talk.mp3",
  bytes: PART * 3,
  partSize: PART,
  parts: 3,
  etags: { 1: "e1" },
  kind: "narration",
  surah: null,
  reciter: "",
  topic: "My father's shop",
  createdAt: 1700000000000,
  ...over,
});

test("a half-sent upload is remembered and read back, with its pieces", () => {
  const storage = fakeStorage();
  assert.equal(saveStoredUpload(storage, state()), true);
  assert.equal(storage.map.has(UPLOAD_STORE), true);
  const back = readStoredUpload(storage);
  assert.equal(back.id, state().id);
  assert.deepEqual(back.etags, { 1: "e1" });
  assert.equal(back.parts, 3);
  assert.equal(back.topic, "My father's shop");
});

test("a locked screen: only the pieces that never arrived are sent again", () => {
  const storage = fakeStorage();
  saveStoredUpload(storage, state({ etags: { 1: "e1", 3: "e3" } }));
  const back = readStoredUpload(storage);
  assert.deepEqual(missingParts(back), [2]);
  assert.deepEqual(partList(back), [
    { partNumber: 1, etag: "e1" },
    { partNumber: 3, etag: "e3" },
  ]);
});

test("storage that is closed (private window) never breaks the page", () => {
  const storage = fakeStorage({ fail: true });
  assert.equal(saveStoredUpload(storage, state()), false);
  assert.equal(readStoredUpload(storage), null);
  clearStoredUpload(storage); // must not throw
  assert.equal(readStoredUpload(null), null);
  assert.equal(saveStoredUpload(null, state()), false);
});

test("a damaged or foreign value in storage is ignored, never trusted", () => {
  const storage = fakeStorage();
  storage.setItem(UPLOAD_STORE, "not json");
  assert.equal(readStoredUpload(storage), null);
  storage.setItem(UPLOAD_STORE, JSON.stringify({ id: "made-up", parts: 2 }));
  assert.equal(readStoredUpload(storage), null);
  storage.setItem(UPLOAD_STORE, JSON.stringify({ ...state(), etags: { 1: "", 2: 5, x: "e" }, parts: 2 }));
  const back = readStoredUpload(storage);
  assert.deepEqual(back.etags, {});
  assert.deepEqual(missingParts(back), [1, 2]);
});

test("clearStoredUpload removes the remembered upload", () => {
  const storage = fakeStorage();
  saveStoredUpload(storage, state());
  clearStoredUpload(storage);
  assert.equal(readStoredUpload(storage), null);
});
