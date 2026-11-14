import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { composeMusicKit, musicPlan, musicPrompt } from "./music-kit.mjs";

const cues = musicPlan(readFileSync(new URL("../productions/ramesh-babu/USA/s4.md", import.meta.url), "utf8"));

test("the S4 music plan is read cue by cue, and each prompt is instrumental and made to sit under a voice", () => {
  assert.equal(cues.length, 17);
  assert.deepEqual(cues[0], { cue: "M01", brief: "Tense pulse, low string ostinato, sub hits", bpm: 120 });
  assert.equal(cues[1].bpm, null, "a cue with no tempo has none");
  assert.match(musicPrompt(cues[0], "cinematic"), /^Instrumental film score cue for a cinematic story: Tense pulse, low string ostinato, sub hits\. 120 BPM\. No vocals/);
});

test("each cue is composed as long as its longest stretch (10 s to 5 min), existing tracks win, and every prompt is recorded", async () => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-music-"));
  try {
    writeFileSync(join(dir, "M02.mp3"), "the owner's library track");
    /** @type {any[]} */
    const calls = [];
    let busy = true;
    const fake = /** @type {typeof fetch} */ (async (url, init) => {
      calls.push({ url: String(url), headers: /** @type {any} */ (init?.headers), body: JSON.parse(String(init?.body)) });
      if (busy) { busy = false; return new Response("busy", { status: 429 }); }
      return new Response("ID3 score");
    });
    /** @type {number[]} */
    const waits = [];
    const r = await composeMusicKit({ cues: cues.slice(0, 5), lengths: { M01: 29, M02: 45, M03: 600, M04: 4 }, apiKey: "K", outDir: dir, look: "documentary", fetch: fake, sleep: async (ms) => { waits.push(ms); } });
    assert.deepEqual(r, { composed: 3, kept: 1, unused: ["M05"], failed: [] }, "M02 is kept; M05 never plays");
    assert.deepEqual(waits, [3000], "a 429 waits and tries again");
    assert.deepEqual(calls.slice(1).map((c) => [c.body.music_length_ms, c.body.force_instrumental, c.body.model_id]), [[29000, true, "music_v1"], [300000, true, "music_v1"], [10000, true, "music_v1"]]);
    assert.equal(calls[0].headers["xi-api-key"], "K");
    assert.ok(calls[0].url.startsWith("https://api.elevenlabs.io/v1/music"));
    assert.equal(readFileSync(join(dir, "M02.mp3"), "utf8"), "the owner's library track", "a track that exists is never replaced");
    assert.ok(existsSync(join(dir, "M01.mp3")));
    const record = JSON.parse(readFileSync(join(dir, "music-kit.json"), "utf8"));
    assert.deepEqual(record.map((/** @type {any} */ x) => x.cue), ["M01", "M03", "M04"]);
    assert.match(record[0].prompt, /No vocals/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
