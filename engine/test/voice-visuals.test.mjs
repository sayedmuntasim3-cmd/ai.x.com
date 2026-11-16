import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { tokenizeArabic } from "../src/arabic.mjs";
import { wikimediaProvider } from "../src/film-media.mjs";
import { ayahText, buildQuranIndex, matchRecitation } from "../src/quran.mjs";
import { planQuranFilm } from "../src/quran-film.mjs";
import { alignScript, normalizeTranscript } from "../src/transcript.mjs";
import { understandVoice } from "../src/voice-understand.mjs";
import { planVoiceVisuals, quranVisualAdabGuard, wordsPlan } from "../src/voice-visuals.mjs";

const fixture = (/** @type {string} */ name) => readFileSync(new URL("./fixtures/voice/" + name, import.meta.url), "utf8");
const truth = JSON.parse(fixture("gettysburg-truth.json"));
const aligned = alignScript(truth.sentences.join(" "), normalizeTranscript(fixture("gettysburg-pocketsphinx.json")));
const u = understandVoice({ transcript: aligned, totalSeconds: truth.totalSeconds });
const scenes = /** @type {NonNullable<typeof u.scenes>} */ (u.scenes);
const spoken = truth.sentences.join(" ").split(" ");

/** A Commons search that answers every query with one public-domain and one share-alike file. */
const commonsFetch = async (/** @type {string} */ url) => {
  const q = new URL(url).searchParams.get("gsrsearch") ?? "";
  const page = (/** @type {number} */ id, /** @type {string} */ licence, /** @type {number} */ index) => ({ pageid: id, ns: 6, index, title: `File:${q.replace(/ filetype:.*/, "")} ${id}.jpg`, imageinfo: [{ width: 3000, height: 2000, thumburl: `https://upload.wikimedia.org/x/1920px-${id}.jpg`, url: `https://upload.wikimedia.org/${id}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`, mime: "image/jpeg", extmetadata: { LicenseShortName: { value: licence }, Artist: { value: "Archive" }, Restrictions: { value: "" } } }] });
  const id = 1000 + (q.length % 97) * 3;
  const body = /filetype:bitmap/.test(q) ? { query: { pages: [page(id, "CC BY-SA 4.0", 1), page(id + 1, "Public domain", 2)] } } : { query: { pages: [] } };
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
};

/** A fake brain that plans every scene but also "improves" the words and times of two. */
const meddlingBrain = {
  name: "fake-local", capabilities: { vision: false, webSearch: false },
  /** @param {any} r */
  async call(r) {
    const lines = r.messages[0].content[0].text.split("\n").filter((/** @type {string} */ l) => l.startsWith("**SC"));
    const text = lines.map((/** @type {string} */ l, /** @type {number} */ i) => {
      let x = l.replace("ANCHOR: TODO", "ANCHOR: the field").replace("SHOTS: TODO", "SHOTS: (1) R3 battlefield at dawn").replace("SRC: TODO", 'SRC: Q1 "gettysburg battlefield"').replace("LOOK: TODO", "LOOK: cold morning");
      if (i === 0) x = x.replace("Four score and seven years ago", "Eighty-seven years ago");
      if (i === 1) x = x.replace(/\| 0:00:\d\d(\.\d+)?-/, "| 0:00:12-");
      return x;
    });
    return { text: text.join("\n"), stopReason: "end_turn", usage: {} };
  },
};

test("a brain that changes words or times is reported and repaired in code; words end unchanged", async () => {
  const r = await planVoiceVisuals({ scenes, structure: u.structure, brain: meddlingBrain });
  assert.equal(r.brainUsed, true);
  assert.deepEqual(r.changedByBrain, ["SC0001", "SC0002"]);
  assert.ok(r.messages.some((m) => m.code === "voice.wordsChanged"));
  assert.deepEqual(r.findings, []);
  assert.deepEqual(r.plan.flatMap((p) => p.narration.split(" ")), spoken, "every spoken word, in order");
  assert.ok(r.plan.every((p) => /battlefield at dawn/.test(p.shots)));
});

test("no brain: every scene still gets a plan from its own words, and the words hold", async () => {
  const r = await planVoiceVisuals({ scenes, structure: u.structure });
  assert.equal(r.brainUsed, false);
  assert.ok(r.messages.some((m) => m.code === "voice.noBrain"));
  assert.deepEqual(r.findings, []);
  assert.equal(r.plan.length, scenes.length);
  assert.ok(r.plan.every((p) => /^\(1\) R[23] \S/.test(p.shots)));
  assert.match(r.plan[0].shots, /^\(1\) R2/, "a date said in the scene makes it an evidence shot");
  assert.deepEqual(r.plan.flatMap((p) => p.narration.split(" ")), spoken);
});

test("a brain that fails or answers nonsense does not stop the plan", async () => {
  const broken = { name: "x", capabilities: { vision: false }, call: async () => { throw new Error("401 key invalid"); } };
  const nonsense = { name: "y", capabilities: { vision: false }, call: async () => ({ text: "I cannot help with that.", stopReason: "end_turn", usage: {} }) };
  for (const brain of [broken, nonsense]) {
    const r = await planVoiceVisuals({ scenes, structure: u.structure, brain });
    assert.deepEqual(r.findings, []);
    assert.deepEqual(r.plan.flatMap((p) => p.narration.split(" ")), spoken);
  }
});

test("media from a keyless archive: licence recorded per asset, share-alike refused", async () => {
  const r = await planVoiceVisuals({ scenes: scenes.slice(0, 3), structure: u.structure, providers: [wikimediaProvider({ fetch: commonsFetch })] });
  const assets = r.plan.flatMap((p) => p.assets);
  assert.ok(assets.length >= 3, JSON.stringify(r.media));
  for (const a of assets) {
    assert.equal(a.source, "wikimedia");
    assert.equal(a.licence.licenseId, "PUBLIC-DOMAIN");
    assert.match(a.page, /^https:\/\/commons\.wikimedia\.org\//);
  }
});

test("words plan: names and dates make evidence shots", () => {
  const p = wordsPlan(scenes[0], u.structure ?? null);
  assert.match(p.SHOTS, /^\(1\) R2 /);
  assert.match(p.SRC, /^Q1 "/);
});

const index = buildQuranIndex(JSON.parse(readFileSync(new URL("../data/quran/tanzil-quran-simple-1.0.2.json", import.meta.url), "utf8")));
function ikhlas() {
  const words = [];
  let t = 2;
  for (let ayah = 1; ayah <= 4; ayah += 1) {
    let tokens = tokenizeArabic(ayahText(index, 112, ayah));
    if (ayah === 1) tokens = tokens.slice(4);
    for (const text of tokens) { words.push({ text, start: t, end: t + 1.3 }); t += 1.4; }
    t += 2;
  }
  return planQuranFilm({ match: matchRecitation(words, index), index, totalSeconds: t + 1 });
}

test("quran-visual-adab-guard: nature and patterns pass; living beings, AI, music and unlicensed meanings do not", () => {
  const plan = ikhlas();
  const ayat = plan.scenes.filter((s) => s.kind === "ayah");
  const pd = { licenseId: "PUBLIC-DOMAIN" };
  const ok = quranVisualAdabGuard({ plan, index, assets: [{ scene: ayat[0].id, source: "wikimedia", title: "Desert dunes at dusk", licence: pd }, { scene: ayat[1].id, source: "met", title: "Geometric tile panel", licence: pd }] });
  assert.equal(ok.ok, true, ok.problems.join("; "));
  assert.ok(ok.gaps.some((g) => /licensed translation/.test(g)), "the missing meaning is a reported gap");
  assert.ok(ok.messages.some((m) => m.code === "voice.meaningGap"));

  const bad = quranVisualAdabGuard({
    plan: { ...plan, audio: { ...plan.audio, music: true } }, index,
    assets: [{ scene: ayat[0].id, source: "wikimedia", title: "Camels crossing the desert", licence: pd }, { scene: ayat[1].id, source: "fal", title: "Golden sky", licence: pd }, { scene: ayat[2].id, source: "openverse", title: "Mountains", licence: { licenseId: "CC-BY-SA" } }],
    meanings: { [ayat[0].id]: { text: "Say: He is God, the One.", source: "some site", licence: "", allowsUse: false } },
  });
  assert.equal(bad.ok, false);
  for (const re of [/music/, /camels/i, /AI pictures/, /no free licence/, /without a licence/]) assert.ok(bad.problems.some((p) => re.test(p)), String(re));
});

test("quran-visual-adab-guard: a changed ayah text is refused", () => {
  const plan = ikhlas();
  const s = plan.scenes.find((x) => x.kind === "ayah");
  if (s) s.text = s.text + " ";
  assert.ok(quranVisualAdabGuard({ plan, index }).problems.some((p) => /verbatim/.test(p)));
});
