import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fetchSoundKit, soundBible } from "./sound-kit.mjs";

test("the S4 sound bible is read, and only CC0 sounds are fetched, with their licence records", async () => {
  const entries = soundBible(readFileSync(new URL("../productions/ramesh-babu/USA/s4.md", import.meta.url), "utf8"));
  assert.equal(entries.length, 20);
  assert.deepEqual(entries[0], { token: "SND-AMB-01", name: "Small shop room tone", phrases: ["room tone small room", "quiet shop ambience"] });

  const dir = mkdtempSync(join(tmpdir(), "zupona-sfx-"));
  try {
    writeFileSync(join(dir, "SND-FX-01.wav"), "the owner's own choice");
    /** @type {string[]} */
    const urls = [];
    const fake = /** @type {typeof fetch} */ (async (url) => {
      const u = String(url);
      urls.push(u);
      if (u.startsWith("https://cdn.freesound.org/")) return new Response("ID3 sound");
      const q = new URL(u).searchParams.get("query");
      if (q === "room tone small room") return Response.json({ results: [{ id: 1, name: "BY tone", license: "http://creativecommons.org/licenses/by/4.0/", duration: 30, username: "a", url: "https://freesound.org/s/1/", previews: { "preview-hq-mp3": "https://cdn.freesound.org/previews/1.mp3" } }] });
      if (q === "quiet shop ambience") return Response.json({ results: [{ id: 2, name: "Shop tone", license: "http://creativecommons.org/publicdomain/zero/1.0/", duration: 42, username: "b", url: "https://freesound.org/s/2/", previews: { "preview-hq-mp3": "https://cdn.freesound.org/previews/2.mp3" } }] });
      return Response.json({ results: [] });
    });
    const r = await fetchSoundKit({ entries: entries.slice(0, 1).concat({ token: "SND-FX-01", name: "Pen", phrases: ["pen"] }, { token: "SND-FX-02", name: "Paper", phrases: ["paper rustle"] }), apiKey: "K", outDir: dir, fetch: fake, sleep: async () => {} });
    assert.deepEqual(r, { fetched: 1, kept: 1, notFound: ["SND-FX-02"] });
    const search = new URL(urls[0]);
    assert.equal(search.searchParams.get("filter"), 'license:"Creative Commons 0" duration:[8 TO 180]', "CC0 only; ambience long enough to loop");
    assert.equal(search.searchParams.get("token"), "K");
    assert.equal(readFileSync(join(dir, "SND-AMB-01.mp3"), "utf8"), "ID3 sound");
    const records = JSON.parse(readFileSync(join(dir, "sound-kit.json"), "utf8"));
    assert.deepEqual(records.map((/** @type {any} */ x) => [x.token, x.id, x.license]), [["SND-AMB-01", 2, "http://creativecommons.org/publicdomain/zero/1.0/"]], "the CC-BY result was skipped even though it came first");
    assert.equal(readFileSync(join(dir, "SND-FX-01.wav"), "utf8"), "the owner's own choice");
    assert.ok(!urls.some((u) => u.includes("query=pen")), "an existing file is not searched for");
    assert.ok(!existsSync(join(dir, "SND-FX-02.mp3")));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
