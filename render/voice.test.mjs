import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { recordVoice, voiceLines } from "./voice.mjs";

const md = [
  `**SC0001** | 0:00:00-0:00:04 | C1 | b | E | C01 | NARR: The mill opens at dawn. | W 5/5 | ANCHOR: x | SHOTS: (1) R3 mill | LOOK: L`,
  `**SC0002** | 0:00:04-0:00:06 | C1 | b | E | — | NARR: (wordless) | W 0/0 | ANCHOR: x | SHOTS: (1) R1 black | LOOK: L`,
  `**SC0003** | 0:00:06-0:00:10 | C1 | b | E | C02 | NARR: It cost about [C12 low] dollars. | W 5/5 | ANCHOR: x | SHOTS: (1) R3 coins | LOOK: L`,
  `**SC0004** | 0:00:10-0:00:14 | C1 | b | E | C03 | NARR: By noon the wheel had stopped. | W 6/6 | ANCHOR: x | SHOTS: (1) R3 wheel | LOOK: L`,
].join("\n");

test("narrated scenes are recorded with their neighbours as context; placeholders and existing takes are left alone", async () => {
  const { lines, skipped } = voiceLines([{ markdown: md }]);
  assert.deepEqual(lines.map((l) => l.scene), ["SC0001", "SC0004"]);
  assert.deepEqual(skipped, [{ scene: "SC0003", reason: "unresolved number [C12 low]" }]);
  assert.equal(lines[1].previous, "It cost about [C12 low] dollars.", "context is the film as written, even when a scene is skipped");

  const dir = mkdtempSync(join(tmpdir(), "zupona-voice-"));
  try {
    writeFileSync(join(dir, "SC0004.wav"), "the owner's own take");
    /** @type {any[]} */
    const calls = [];
    let first = true;
    const fake = /** @type {typeof fetch} */ (async (url, init) => {
      calls.push({ url: String(url), headers: /** @type {any} */ (init?.headers), body: JSON.parse(String(init?.body)) });
      if (first) { first = false; return new Response("busy", { status: 429, headers: { "retry-after": "1" } }); }
      return Response.json({ audio_base64: Buffer.from("ID3 fake mp3").toString("base64"), alignment: { characters: ["T"], character_start_times_seconds: [0], character_end_times_seconds: [0.1] } });
    });
    /** @type {number[]} */
    const waits = [];
    const r = await recordVoice({ apiKey: "KEY", voiceId: "voice 1", outDir: dir, lines, fetch: fake, sleep: async (ms) => { waits.push(ms); } });
    assert.deepEqual({ recorded: r.recorded, kept: r.kept, failed: r.failed.length }, { recorded: 1, kept: 1, failed: 0 });
    assert.deepEqual(waits, [1000], "a 429 waits for Retry-After and tries again");
    assert.equal(calls.length, 2);
    assert.ok(calls[1].url.startsWith("https://api.elevenlabs.io/v1/text-to-speech/voice%201/with-timestamps"));
    assert.equal(calls[1].headers["xi-api-key"], "KEY");
    assert.deepEqual([calls[1].body.model_id, calls[1].body.text, calls[1].body.next_text], ["eleven_multilingual_v2", "The mill opens at dawn.", "It cost about [C12 low] dollars."]);
    assert.equal(readFileSync(join(dir, "SC0001.mp3"), "utf8"), "ID3 fake mp3");
    assert.ok(existsSync(join(dir, "SC0001.alignment.json")));
    assert.equal(readFileSync(join(dir, "SC0004.wav"), "utf8"), "the owner's own take", "a take that exists is never overwritten");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
