import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildTimeline } from "../engine/src/timeline.mjs";
import { applyAiScenes, castFromS4, cleanBrief, falRun, firstUrl, generateAiScenes, selectAiShots } from "./ai-scenes.mjs";
import { mediaDuration, renderFilm, run } from "./render-film.mjs";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;

const S4 = [
  "| Token | Who | Type | Depiction policy | Never |",
  "|---|---|---|---|---|",
  "| **CHR-01** | Arjun, the barber's son | Invented | CAST | real names |",
  "| **CHR-02** | A famous film star he admires | Real, living | NEVER | any likeness |",
  "| **CHR-03** | The bank | Organization | TYPE-ONLY | logo |",
  "CHR-01 LOOK: man of 24, lean, dark wavy hair, thin moustache, faded blue shirt, Mumbai 1998",
].join("\n");
const clock = (/** @type {number} */ s) => `0:00:${String(s).padStart(2, "0")}`;
const line = (/** @type {number} */ n, /** @type {string} */ shots) => `**SC000${n}** | ${clock((n - 1) * 2)}-${clock(n * 2)} | C1 | b | E | C01 | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: ${shots} | LOOK: L`;
const MD = [
  line(1, "(1) R9 CHR-01 Arjun counts coins at a cracked window at dawn"),
  line(2, "(1) R3 LOC-02 a crowded Mumbai street at noon"),
  line(3, "(1) R9 CHR-02 the star waves from a balcony"),
  line(4, "(1) R1 card \"1998\""),
].join("\n");

/** A fake fal.ai: jobs complete after one poll; images and videos have predictable URLs. */
function fakeFal(/** @type {Buffer} */ videoBytes) {
  /** @type {{ method: string, url: string, body?: any }[]} */
  const calls = [];
  let n = 0;
  /** @type {Map<string, any>} */
  const outputs = new Map();
  /** @type {Set<string>} */
  const polled = new Set();
  const f = /** @type {typeof fetch} */ (async (url, init) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ method, url: u, ...(init?.body ? { body: JSON.parse(String(init.body)) } : {}) });
    if (method === "POST" && u.startsWith("https://queue.fal.run/")) {
      n += 1;
      const id = `r${n}`;
      const model = u.slice("https://queue.fal.run/".length);
      outputs.set(id, /video/.test(model) ? { video: { url: `https://fal.media/v${n}.mp4` } } : { images: [{ url: `https://fal.media/i${n}.jpg` }] });
      return Response.json({ request_id: id, status_url: `https://queue.fal.run/x/requests/${id}/status`, response_url: `https://queue.fal.run/x/requests/${id}` });
    }
    const status = /requests\/(r\d+)\/status$/.exec(u);
    if (status) {
      if (!polled.has(status[1])) { polled.add(status[1]); return Response.json({ status: "IN_PROGRESS" }); }
      return Response.json({ status: "COMPLETED" });
    }
    const result = /requests\/(r\d+)$/.exec(u);
    if (result) return Response.json(outputs.get(result[1]));
    if (u.startsWith("https://fal.media/")) return new Response(videoBytes);
    return new Response("not found", { status: 404 });
  });
  return { f, calls };
}

test("the cast comes from S4; real people and real companies are never generated", () => {
  const cast = castFromS4(S4);
  assert.deepEqual([...cast.values()].map((c) => [c.token, c.real]), [["CHR-01", false], ["CHR-02", true], ["CHR-03", true]]);
  assert.equal(cast.get("CHR-01")?.look, "man of 24, lean, dark wavy hair, thin moustache, faded blue shirt, Mumbai 1998", "the LOOK line is the character's description");
  const usa = castFromS4(readFileSync(new URL("../productions/ramesh-babu/USA/s4.md", import.meta.url), "utf8"));
  assert.ok(["CHR-01", "CHR-02", "CHR-05", "CHR-06", "CHR-09"].every((t) => usa.get(t)?.real), "the real family and the real company of the USA film are refused");
  assert.equal(cleanBrief("R3 STK-C1-02 night road lane lines, LOC-05, MC-01 match cut (use 1/2)"), "night road lane lines, match cut");
  assert.equal(firstUrl({ images: [{ url: "javascript:x" }] }), null, "only https media is used");
});

test("R9 shots and stock shots that found no clip are made; a real person's shot is refused", () => {
  const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: MD }] });
  const { shots, refused } = selectAiShots(timeline, castFromS4(S4));
  assert.deepEqual(shots.map((s) => [s.id, s.reason, s.tokens]), [["SC0001-1", "R9", ["CHR-01"]], ["SC0002-1", "no-stock", []]]);
  assert.deepEqual(refused, [{ id: "SC0003-1", why: "CHR-02 is a real person" }]);
});

test("one reference per character, keyframes from it, clips from the keyframes, inside the budget; a second run makes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-ai-"));
  try {
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: MD + "\n" + line(5, "(1) R9 CHR-01 Arjun runs for the last bus") }] });
    const cast = castFromS4(S4);
    const { shots } = selectAiShots(timeline, cast);
    assert.equal(shots.length, 3);
    const fal = fakeFal(Buffer.from("MP4"));
    /** @type {number[]} */
    const waits = [];
    const r = await generateAiScenes({ shots, cast, key: "FK", outDir: dir, look: "cinematic", budgetUsd: 0.8, fetch: fal.f, sleep: async (ms) => { waits.push(ms); }, concurrency: 1 });
    const posts = fal.calls.filter((c) => c.method === "POST");
    assert.deepEqual(posts.map((c) => c.url.replace("https://queue.fal.run/", "")), [
      "fal-ai/flux-pro/v1.1-ultra", "fal-ai/flux-pro/kontext", "fal-ai/kling-video/v2.1/standard/image-to-video",
      "fal-ai/flux-pro/v1.1-ultra", "fal-ai/kling-video/v2.1/standard/image-to-video",
    ], "reference (once), edit + video for the character shot, image + video for the street; the third shot is over budget");
    assert.match(posts[0].body.prompt, /^man of 24, lean, dark wavy hair.*Character reference/);
    assert.equal(posts[1].body.image_url, "https://fal.media/i1.jpg", "the keyframe is made from the character's reference");
    assert.match(posts[1].body.prompt, /same face, hair, build and clothes.*Arjun counts coins at a cracked window at dawn/);
    assert.match(posts[1].body.prompt, /no logos or brand names, not a likeness of any real or famous person/);
    assert.equal(posts[2].body.image_url, "https://fal.media/i2.jpg");
    assert.ok(fal.calls.every((c) => !c.url.startsWith("https://queue.fal.run/") || c.method === "GET" || c.body), "every job is posted with its input");
    assert.ok(waits.length > 0, "jobs are polled until they complete");
    assert.equal(r.made, 2);
    assert.deepEqual(r.skipped, [{ id: "SC0005-1", why: "budget of $0.8 reached" }]);
    assert.ok(existsSync(join(dir, "SC0001-1.mp4")) && existsSync(join(dir, "SC0002-1.mp4")));
    const record = JSON.parse(readFileSync(join(dir, "ai-scenes.json"), "utf8"));
    assert.equal(record.cast["CHR-01"].url, "https://fal.media/i1.jpg");
    assert.ok(record.costUsd > 0 && record.costUsd <= 0.8);

    const again = fakeFal(Buffer.from("MP4"));
    await generateAiScenes({ shots: shots.slice(0, 2), cast, key: "FK", outDir: dir, budgetUsd: 5, fetch: again.f, sleep: async () => {} });
    assert.equal(again.calls.length, 0, "made shots and references are reused, never paid for twice");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a fal job that fails is reported, not retried forever", async () => {
  const f = /** @type {typeof fetch} */ (async (url, init) => {
    if ((init?.method ?? "GET") === "POST") return Response.json({ request_id: "r1" });
    return Response.json({ status: "FAILED", error: "content policy" });
  });
  await assert.rejects(falRun("fal-ai/flux-pro/kontext", { prompt: "x" }, { key: "K", fetch: f, sleep: async () => {} }), /failed: .*content policy/);
});

test("made shots replace their cards in the film and render from their local files", { skip: !hasFfmpeg && "ffmpeg is not installed" }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-ai-render-"));
  try {
    const clip = join(dir, "made.mp4");
    await run("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc=s=320x180:r=10:d=5", "-pix_fmt", "yuv420p", clip]);
    const timeline = buildTimeline({ chapters: [{ id: "C1", markdown: MD }], width: 160, height: 90, fps: 10, look: "cinematic" });
    const fal = fakeFal(readFileSync(clip));
    const cast = castFromS4(S4);
    await generateAiScenes({ shots: selectAiShots(timeline, cast).shots, cast, key: "FK", outDir: join(dir, "ai"), fetch: fal.f, sleep: async () => {} });
    assert.equal(applyAiScenes(timeline, join(dir, "ai")), 2);
    assert.deepEqual(timeline.video.map((v) => v.type), ["clip", "clip", "card", "card"], "SC0003 (a real person) stays a card");
    assert.equal(timeline.video[0].licence, "AI-generated scene (disclosed in YouTube Studio)");
    const out = join(dir, "film.mp4");
    const report = await renderFilm({ timeline, workDir: join(dir, "w"), outFile: out });
    assert.ok(Math.abs((await mediaDuration(out)) - 8) < 0.2);
    assert.equal(report.stats.clipsFailed, 0, "local AI clips need no download");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
