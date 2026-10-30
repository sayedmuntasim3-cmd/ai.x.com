import assert from "node:assert/strict";
import { test } from "node:test";
import { checkVersionPurity, formatMoney, formatNumber, getVersion, localDigits, narrationWordBudget, VERSION_IDS } from "../src/versions.mjs";
import { ELEVENLABS_MODELS, musicPlanFor, narratorPace, NEVER_DONE_TO_A_VOICE, planVoice } from "../src/voice-plan.mjs";
import { classifyInput, detectLanguage, extractPremise } from "../src/content-intel.mjs";
import { scriptShares, toAsciiDigits } from "../src/text-scripts.mjs";

test("there are exactly three versions: Arabic, English (USA) and Bangla", () => {
  assert.deepEqual([...VERSION_IDS], ["ar", "en-US", "bn-BD"]);
  assert.equal(getVersion("ar").direction, "rtl");
  assert.equal(getVersion("ar").defaultMusic, "no-instruments");
  assert.equal(getVersion("fr"), null);
  assert.throws(() => formatNumber(1, "fr"), /Unknown version/);
});

test("numbers and money are written the way each audience writes them", () => {
  assert.equal(formatNumber(1234567, "en-US"), "1,234,567");
  assert.equal(formatNumber(1234567, "bn-BD"), "১২,৩৪,৫৬৭");
  assert.equal(formatNumber(1234567, "ar"), "١٬٢٣٤٬٥٦٧");
  assert.equal(formatMoney(4500000, "en-US"), "$4,500,000");
  assert.equal(formatMoney(4500000, "bn-BD"), "৪৫,০০,০০০৳");
  assert.match(formatMoney(50, "ar"), /^٥٠ دولار/);
  assert.equal(localDigits("Episode 12", "bn-BD"), "Episode ১২");
  assert.equal(toAsciiDigits("৫০ ডলার, ٥٠ دولار, ۵۰"), "50 ডলার, 50 دولار, 50");
});

test("narration budgets follow the measured voice when it is known", () => {
  assert.equal(narrationWordBudget(60, "en-US"), 150);
  assert.equal(narrationWordBudget(60, "bn-BD"), 125);
  assert.equal(narrationWordBudget(60, "en-US", 138), 138);
  assert.equal(narratorPace({ words: 300, durationSeconds: 120 }), 150);
  assert.equal(narratorPace({ words: 0, durationSeconds: 120 }), null);
});

test("version purity keeps each language's narration in its own script", () => {
  assert.equal(checkVersionPurity("He started with fifty dollars.", "en-US").ok, true);
  const leak = checkVersionPurity("He started with fifty dollars. তিনি শুরু করেছিলেন।", "en-US");
  assert.equal(leak.ok, false);
  assert.ok(leak.problems.some((p) => /Bangla letters/.test(p)));
  assert.equal(checkVersionPurity("তিনি মাত্র পঞ্চাশ ডলার নিয়ে শুরু করেছিলেন।", "bn-BD").ok, true);
  assert.equal(checkVersionPurity("بدأ بخمسين دولارًا فقط.", "ar").ok, true);
  const quote = "The verse reads: قُلْ هُوَ اللَّهُ أَحَدٌ and it is short.";
  assert.equal(checkVersionPurity(quote, "en-US").ok, false);
  assert.equal(checkVersionPurity(quote, "en-US", { allowArabicQuotes: true }).ok, true);
  assert.equal(scriptShares("abc ১২৩").latin, 1);
});

test("nothing is ever laid under Quran recitation, and Islamic content has no instruments", () => {
  for (const versionId of VERSION_IDS) {
    const quran = musicPlanFor({ contentType: "quran_recitation", versionId });
    assert.equal(quran.policy, "none");
    assert.equal(quran.natureSounds, false);
    assert.equal(quran.bedBelowVoiceLu, null);
    assert.equal(musicPlanFor({ contentType: "islamic", versionId }).policy, "no-instruments");
  }
  assert.equal(musicPlanFor({ contentType: "story", versionId: "ar" }).policy, "no-instruments");
  const score = musicPlanFor({ contentType: "documentary", versionId: "en-US" });
  assert.equal(score.policy, "score");
  assert.equal(score.bedBelowVoiceLu, 20);
  assert.equal(score.ducking.method, "offline gain automation from voice activity");
});

test("the Quran is never synthesised, and a recitation is cut only at ayah ends", () => {
  const blocked = planVoice({ source: "elevenlabs", contentType: "quran_recitation", versionId: "ar" });
  assert.match(blocked.blocked, /never synthesised/);
  const analysis = { dcOffset: 0, clippedRuns: 0, snrDb: 18, integrated: -26, problems: [] };
  const plan = planVoice({ source: "own-recording", contentType: "quran_recitation", versionId: "ar", analysis });
  assert.equal(plan.blocked, null);
  assert.equal(plan.keepOriginal, true);
  assert.equal(plan.voiceIsolator, "never");
  assert.equal(plan.chain.find((s) => s.step === "noise-reduction").strength, "light");
  assert.equal(plan.chain.find((s) => s.step === "compressor").ratio, 1.5);
  assert.equal(plan.chain.some((s) => s.step === "reverb"), false);
  assert.match(plan.editing.cutAt, /end of an ayah/);
  assert.equal(plan.chain.find((s) => s.step === "loudness").gainDb, 12);
  assert.ok(NEVER_DONE_TO_A_VOICE.some((rule) => /speed change/.test(rule)));
});

test("an own narration gets a light chain chosen from its measurements", () => {
  const clean = planVoice({ source: "own-recording", contentType: "documentary", versionId: "en-US", analysis: { dcOffset: 0, clippedRuns: 0, snrDb: 48, integrated: -20, problems: [] } });
  assert.equal(clean.chain.some((s) => s.step === "noise-reduction"), false);
  assert.deepEqual(clean.chain.map((s) => s.step), ["high-pass", "compressor", "de-ess", "loudness", "true-peak-limiter"]);
  assert.equal(clean.chain.find((s) => s.step === "loudness").targetLufs, -15);
  const rough = planVoice({ source: "own-recording", contentType: "story", versionId: "bn-BD", analysis: { dcOffset: 0.02, clippedRuns: 2, snrDb: 22, integrated: -45, problems: ["x"] } });
  assert.deepEqual(rough.chain.slice(0, 3).map((s) => s.step), ["dc-removal", "de-clip", "noise-reduction"]);
  assert.equal(rough.chain.find((s) => s.step === "noise-reduction").strength, "medium");
  assert.ok(rough.warnings.some((w) => /more than 24 dB/.test(w)));
});

test("a cloned voice uses the model that speaks the version's language", () => {
  assert.equal(ELEVENLABS_MODELS["bn-BD"].modelId, "eleven_v3");
  assert.equal(ELEVENLABS_MODELS["en-US"].stitching, true);
  const plan = planVoice({ source: "elevenlabs", contentType: "story", versionId: "bn-BD" });
  const tts = plan.chain.find((s) => s.step === "elevenlabs-tts");
  assert.equal(tts.modelId, "eleven_v3");
  assert.match(tts.chunking, /regenerate/);
  assert.equal(plan.chain.some((s) => s.step === "noise-reduction"), false);
});

test("the input's language is read from its letters", () => {
  assert.equal(detectLanguage("বাবার আয় খুব কম ছিল").language, "bn");
  assert.equal(detectLanguage("بدأ من الصفر").language, "ar");
  assert.equal(detectLanguage("started with $50").language, "en");
  assert.equal(detectLanguage("12345").language, "unknown");
});

test("a short idea becomes a labelled story, a true-story request becomes a documentary", () => {
  const idea = classifyInput({ text: "$50 দিয়ে শুরু করে রোলস রয়েস কিনলো" });
  assert.equal(idea.mode, "story");
  assert.equal(idea.fictionLabel, true);
  assert.equal(idea.needsResearch, false);
  const dragon = classifyInput({ text: "a man raised a baby dragon, make it like a movie" });
  assert.equal(dragon.mode, "story");
  assert.equal(dragon.needsAiVisuals, true);
  const real = classifyInput({ text: "Documentary: Ramesh Babu, the barber who bought a Rolls-Royce (true story)" });
  assert.equal(real.mode, "documentary");
  assert.equal(real.needsResearch, true);
});

test("a story of a prophet is told from sources, never labelled as fiction", () => {
  const yusuf = classifyInput({ text: "নবী ইউসুফের ঘটনা থেকে আল্লাহর ওপর ভরসার শিক্ষা নিয়ে একটি গল্প" });
  assert.equal(yusuf.islamic, true);
  assert.equal(yusuf.mode, "documentary");
  assert.equal(yusuf.fictionLabel, false);
  assert.equal(yusuf.needsResearch, true);
  assert.equal(yusuf.contentType, "islamic");
  const moral = classifyInput({ text: "এক গরিব মুসলিম ছেলের সততার গল্প, যে আল্লাহর ওপর ভরসা রেখে ব্যবসা শুরু করে" });
  assert.equal(moral.mode, "story");
  assert.equal(moral.islamic, true);
  assert.equal(moral.fictionLabel, true);
});

test("a matched recitation decides the content type before anything else", () => {
  const recitation = { isQuran: true, coverage: 0.97, words: 30, segments: [], markers: [] };
  const result = classifyInput({ text: "", recitation });
  assert.equal(result.mode, "recitation");
  assert.equal(result.contentType, "quran_recitation");
});

test("money figures and goals are found in any of the three languages", () => {
  const english = extractPremise("He started with $50 and bought a Rolls-Royce worth $350k");
  assert.deepEqual(english.amounts.map((a) => [a.value, a.currency]), [[50, "USD"], [350000, "USD"]]);
  assert.deepEqual(english.goals, ["rolls-royce"]);
  const bangla = extractPremise("৫০ ডলার দিয়ে শুরু, পরে বাসের ব্যবসা করে ২ কোটি টাকায় বাড়ি কিনলো, আজ বিলিয়নিয়ার");
  assert.deepEqual(bangla.amounts.map((a) => [a.value, a.currency]), [[50, "USD"], [20000000, "BDT"]]);
  assert.deepEqual(bangla.goals.sort(), ["billionaire", "bus company"]);
  const arabic = extractPremise("بدأ بـ ٥٠ دولار واشترى رولز رويس");
  assert.deepEqual(arabic.amounts.map((a) => [a.value, a.currency]), [[50, "USD"]]);
  assert.deepEqual(arabic.goals, ["rolls-royce"]);
});
