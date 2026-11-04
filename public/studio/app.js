// Zupona AI Studio, first screen. Everything runs in the browser with the
// engine modules in ./engine/ (an exact copy of /engine/src): no server, no
// API keys, nothing uploaded anywhere.
import { analyzeRecording } from "./engine/loudness.mjs";
import { planIdea, planRecording } from "./engine/studio.mjs";
import { isWav, decodeWav } from "./engine/wav.mjs";

const T = {
  bn: {
    studio: "স্টুডিও",
    lead: "একটা আইডিয়া লিখুন, অথবা আপনার ভয়েস রেকর্ডিং দিন। সব কাজ আপনার ব্রাউজারেই হয়: কোনো সার্ভার নেই, কোনো API key নেই, কিছুই আপলোড হয় না।",
    ideaTitle: "আইডিয়া বা বিষয়",
    ideaPlaceholder: "যেকোনো ভাষায় লিখুন, বানান ভুল থাকলেও চলবে। যেমন: একটা গরিব ছেলে ৫০ টাকা দিয়ে শুরু করে রোলস রয়েস কিনল",
    tryExample: "উদাহরণ:",
    modeLabel: "ছবির ধরন",
    modeAuto: "নিজে বুঝে নাও",
    modeReal: "সত্য ঘটনা (ডকুমেন্টারি)",
    modeStory: "বানানো গল্প",
    lengthLabel: "দৈর্ঘ্য",
    lengthAuto: "ফরম্যাট অনুযায়ী",
    lengthShort: "Short (১ মিনিট)",
    planButton: "প্ল্যান বানাও",
    voiceTitle: "ভয়েস রেকর্ডিং",
    dropMain: "রেকর্ডিং বেছে নিন বা এখানে টেনে আনুন",
    dropHint: "WAV সবচেয়ে নিখুঁত; MP3, M4A, OGG, FLAC, WebM-ও চলবে",
    voiceLang: "রেকর্ডিংয়ের ভাষা",
    contentLabel: "কী ধরনের",
    ctDoc: "ন্যারেশন (ডকুমেন্টারি)",
    ctStory: "গল্পের ন্যারেশন",
    ctIslamic: "ইসলামিক আলোচনা",
    ctQuran: "কুরআন তিলাওয়াত",
    footer: "এই পাতা শুধু প্ল্যান বানায় ও রেকর্ডিং মাপে। স্ক্রিপ্ট লেখা, ট্রান্সক্রিপশন আর রেন্ডার Cloudflare যুক্ত হলে চালু হবে।",
    emptyIdea: "আগে একটা আইডিয়া বা বিষয় লিখুন।",
    tooBig: "ফাইলটা খুব বড় (৩০০ MB-এর বেশি)। ছোট অংশ দিন।",
    decodeFail: "এই ফাইলটা পড়া গেল না। WAV বা MP3 হিসেবে export করে আবার দিন।",
    reading: "ফাইল পড়া হচ্ছে…",
    decoding: "অডিও খোলা হচ্ছে…",
    measuring: "লাউডনেস আর নয়েজ মাপা হচ্ছে…",
    measured: "মাপা শেষ",
    understood: "আমি যা বুঝলাম",
    fixedSpelling: "বানান ঠিক করেছি:",
    noFix: "বানান ঠিক আছে।",
    language: "ভাষা",
    langNames: { en: "English", bn: "বাংলা", ar: "আরবি", "bn-latin": "বাংলা (ইংরেজি অক্ষরে)", mixed: "মিশ্র", unknown: "অজানা" },
    filmType: "ছবির ধরন",
    modeDocumentary: "ডকুমেন্টারি (সত্য, সোর্সসহ)",
    "modeOwn-script": "আপনার নিজের স্ক্রিপ্ট",
    modeStoryLabel: "বানানো গল্প (মুভির মতো)",
    islamic: "ইসলামিক",
    aiVisuals: "AI দৃশ্য লাগবে (জানিয়ে)",
    research: "গবেষণা লাগবে",
    confidence: "নিশ্চয়তা",
    conf: { high: "উচ্চ", medium: "মাঝারি", low: "কম" },
    why: "কেন (ইঞ্জিনের যুক্তি)",
    format: "ফরম্যাট",
    length: "দৈর্ঘ্য",
    hook: "হুক",
    visuals: "দৃশ্য",
    music: "মিউজিক",
    closestStyle: "সবচেয়ে কাছের স্টাইল",
    beats: "স্টোরি বিট",
    reHooks: (n) => `প্রতি ৩ মিনিটে নতুন প্রশ্ন (re-hook): ${n} বার`,
    versionsTitle: "তিনটি ভার্সনের প্ল্যান",
    versionsLead: "প্রতিটি ভার্সন নিজ ভাষায় আলাদা করে লেখা হবে, অনুবাদ নয়।",
    audience: "দর্শক",
    register: "ভাষার ধরন",
    words: "ন্যারেশন",
    wordsValue: (w, wpm) => `প্রায় ${w} শব্দ (${wpm} শব্দ/মিনিট)`,
    voice: "ভয়েস",
    voiceValue: (m) => `আপনার রেকর্ডিং (শুধু পরিষ্কার করা), নয়তো আপনার ElevenLabs ভয়েস: ${m}`,
    musicPolicy: { none: "কিছুই না", "no-instruments": "বাদ্যযন্ত্র ছাড়া (sound design / ভোকাল নাশিদ)", score: "লাইসেন্সড স্কোর, কণ্ঠের অনেক নিচে" },
    fonts: "ফন্ট",
    descNote: "ডেসক্রিপশনের এক লাইন (স্ক্রিনে কোনো লেবেল নয়):",
    runTitle: "স্বয়ংক্রিয় রান",
    agentsUsed: (n) => `${n} জন এজেন্ট`,
    approvals: "রানের ভেতরে human approval: ০টি। শেষে আপনি নিজে পাবলিশ করবেন।",
    perVersion: "প্রতি ভার্সনে",
    gates: "স্বয়ংক্রিয় চেক",
    rulesTitle: "যে নিয়ম মানা হবে",
    download: "প্ল্যান JSON ডাউনলোড",
    copy: "কপি",
    copied: "কপি হয়েছে",
    rules: {
      "legal-footage-only": "ফুটেজ শুধু বৈধ ফ্রি সোর্স (stock সাইট, Commons, NASA) বা ক্রিয়েটরের লিখিত অনুমতিতে। Facebook, X, YouTube, TikTok থেকে কোনো ডাউনলোড নয়।",
      "versions-native": "আরবি (ইসলামিক দৃষ্টিভঙ্গি), ইংরেজি (USA), বাংলা: তিনটিই আলাদা করে নিজ ভাষায় লেখা।",
      "no-approval-step": "রানের ভেতরে কোনো human approval নেই; আপনি নিজে পাবলিশ করবেন।",
      "no-label-on-screen": "স্ক্রিনে \"fictional story\" লেবেল নেই; শুধু ডেসক্রিপশনে এক লাইনের নোট।",
      "never-real-person": "বানানো গল্পকে কখনো সত্য বলা হবে না, কোনো বাস্তব মানুষের সাথেও জোড়া হবে না।",
      "every-claim-sourced": "প্রতিটি তথ্য সোর্সসহ যাচাই করা হবে।",
      "quran-verbatim": "কুরআন: শুধু Tanzil-এর হুবহু টেক্সট, কাটা শুধু আয়াতের শেষে, কুরআন কখনো synthesise করা হবে না।",
      "nothing-under-quran": "তিলাওয়াতের নিচে কিছুই নয়: মিউজিক, নাশিদ বা প্রকৃতির শব্দ নয়।",
      "no-depiction": "নবী, সাহাবি, ফেরেশতা বা আল্লাহকে কখনো দেখানো হবে না।",
      "ai-visuals-disclosed": "AI দৃশ্য শুধু যেখানে stock দিয়ে সম্ভব নয়, আর তা জানিয়ে দেওয়া হবে।",
    },
    notices: {
      "names-in-story": (names) => `গল্পে নাম আছে: ${names}। এটি বাস্তব মানুষ হলে "সত্য ঘটনা" বেছে নিন; তখন সোর্স থেকে ডকুমেন্টারি হবে।`,
      "prophet-never-fiction": () => "নবী বা সাহাবির কাহিনি কখনো বানানো গল্প হয় না; এটি সোর্স থেকে ডকুমেন্টারি হিসেবেই থাকবে।",
      "factual-topic": () => "এটি বাস্তব বিষয়, তাই ডকুমেন্টারি হিসেবে গবেষণা হবে। বানানো গল্প চাইলে \"বানানো গল্প\" বেছে নিন।",
    },
    verdict: { ready: "রেকর্ডিং তৈরি", usable: "চলবে, কিছু জিনিস ঠিক করা হবে", "fix-first": "আগে ঠিক করা ভালো" },
    reportTitle: "লাউডনেস ও নয়েজ রিপোর্ট",
    engineNotes: "ইঞ্জিনের নোট",
    planTitle: "ভয়েস প্ল্যান",
    ownVoice: "আপনার কণ্ঠ কখনো বদলানো হবে না। মূল ফাইল রাখা হবে।",
    neverTitle: "যা কখনো করা হবে না",
    editingTitle: "এডিটিং",
    gain: (g, t) => `চূড়ান্ত লেভেল ${t} LUFS করতে ${g > 0 ? "+" : ""}${g} dB`,
    limiter: "পিক -1 dBTP-তে ধরে রাখতে limiter লাগবে",
    otherVersions: "অন্য দুই ভার্সনের ভয়েস",
    sameRecitation: "একই তিলাওয়াত সব ভার্সনে; শুধু অনুবাদের সাবটাইটেল আলাদা।",
    viaElevenLabs: (m) => `আপনার ElevenLabs ভয়েস, মডেল ${m}`,
    nativeRate: (r, b) => `ফাইলের নিজের ${r / 1000} kHz${b ? ", " + b + "-bit" : ""}-এ মাপা হয়েছে।`,
    resampled: (r) => `ব্রাউজার অডিওটা ${r / 1000} kHz-এ খুলেছে; আসল sample rate দেখতে WAV দিন।`,
    quranLang: "কুরআন তিলাওয়াত সবসময় আরবি; ভাষা আরবি করা হলো।",
    items: {
      duration: "দৈর্ঘ্য",
      loudness: "লাউডনেস (integrated)",
      "true-peak": "ট্রু পিক",
      snr: "কণ্ঠ বনাম নয়েজ (SNR)",
      "noise-floor": "নয়েজ ফ্লোর",
      clipping: "ক্লিপিং",
      "dc-offset": "DC offset",
      "sample-rate": "Sample rate",
      pauses: "চুপ থাকার অংশ",
    },
    explain: {
      duration: { good: "", bad: "এক সেকেন্ডের কম" },
      loudness: { good: "লক্ষ্যের কাছেই", ok: "মিক্সে লেভেল ঠিক করা হবে", bad: "প্রায় নীরব বা খুব আস্তে; আওয়াজও বাড়বে" },
      "true-peak": { good: "নিরাপদ", ok: "সীমার কাছে; limiter সামলাবে", bad: "-1 dBTP পেরিয়েছে; limiter লাগবে" },
      snr: { good: "পরিষ্কার", ok: "কিছুটা আওয়াজ; হালকা noise reduction", bad: "আওয়াজ বেশি; শান্ত ঘরে আবার রেকর্ড করলে ভালো", info: "" },
      "noise-floor": { info: "চুপ থাকার সময় পেছনের আওয়াজ" },
      clipping: { good: "কোথাও ফাটেনি", bad: "কিছু জায়গায় ফেটে গেছে; মাইক থেকে একটু দূরে বা কম gain-এ রেকর্ড করুন" },
      "dc-offset": { good: "", ok: "সামান্য; সরানো হবে", bad: "সরানো হবে" },
      "sample-rate": { good: "", ok: "চলবে", bad: "৩২ kHz-এর কম; কণ্ঠ ভোঁতা শোনাবে", info: "" },
      pauses: { info: "" },
    },
    steps: {
      "dc-removal": () => "DC offset সরানো",
      "de-clip": () => "ফেটে যাওয়া পিক মেরামত",
      "noise-reduction": (s) => `noise reduction: ${s.strength === "light" ? "হালকা" : "মাঝারি"} (সর্বোচ্চ ${s.maxReductionDb} dB)`,
      "high-pass": (s) => `${s.hz} Hz-এর নিচের গুমগুম কাটা`,
      compressor: (s) => `হালকা compressor (${s.ratio}:1)`,
      "de-ess": () => "স/শ-এর তীক্ষ্ণতা একটু কমানো",
      reverb: () => "স্বাভাবিক ঘরের সামান্য reverb",
      loudness: (s) => `পুরো ট্র্যাক একসাথে ${s.targetLufs} LUFS-এ${s.gainDb === null ? "" : ` (${s.gainDb > 0 ? "+" : ""}${s.gainDb} dB)`}`,
      "true-peak-limiter": (s) => `true-peak limiter, সর্বোচ্চ ${s.ceilingDbtp} dBTP`,
      "elevenlabs-tts": (s) => `ElevenLabs ${s.modelId}`,
    },
  },
  en: {
    studio: "Studio",
    lead: "Type an idea, or give your voice recording. Everything runs in your browser: no server, no API keys, nothing is uploaded.",
    ideaTitle: "Idea or topic",
    ideaPlaceholder: "Any language, spelling mistakes are fine. For example: a poor boy starts with $50 and buys a Rolls-Royce",
    tryExample: "Examples:",
    modeLabel: "Kind of film",
    modeAuto: "Decide for me",
    modeReal: "True story (documentary)",
    modeStory: "Invented story",
    lengthLabel: "Length",
    lengthAuto: "From the format",
    lengthShort: "Short (1 min)",
    planButton: "Make the plan",
    voiceTitle: "Voice recording",
    dropMain: "Choose a recording or drop it here",
    dropHint: "WAV is the most exact; MP3, M4A, OGG, FLAC and WebM work too",
    voiceLang: "Language of the recording",
    contentLabel: "What it is",
    ctDoc: "Narration (documentary)",
    ctStory: "Story narration",
    ctIslamic: "Islamic talk",
    ctQuran: "Quran recitation",
    footer: "This page plans films and measures recordings. Script writing, transcription and rendering switch on once Cloudflare is connected.",
    emptyIdea: "Type an idea or a topic first.",
    tooBig: "The file is too large (over 300 MB). Use a shorter part.",
    decodeFail: "This file could not be read. Export it as WAV or MP3 and try again.",
    reading: "Reading the file…",
    decoding: "Opening the audio…",
    measuring: "Measuring loudness and noise…",
    measured: "Measured",
    understood: "What I understood",
    fixedSpelling: "Spelling fixed:",
    noFix: "No spelling fixes needed.",
    language: "Language",
    langNames: { en: "English", bn: "Bangla", ar: "Arabic", "bn-latin": "Bangla in English letters", mixed: "Mixed", unknown: "Unknown" },
    filmType: "Kind of film",
    modeDocumentary: "Documentary (true, sourced)",
    "modeOwn-script": "Your own script",
    modeStoryLabel: "Invented story (movie-like)",
    islamic: "Islamic",
    aiVisuals: "Needs AI visuals (disclosed)",
    research: "Research needed",
    confidence: "Confidence",
    conf: { high: "high", medium: "medium", low: "low" },
    why: "Why (engine's reasons)",
    format: "Format",
    length: "Length",
    hook: "Hook",
    visuals: "Visuals",
    music: "Music",
    closestStyle: "Closest style",
    beats: "Story beats",
    reHooks: (n) => `A new question every 3 minutes (re-hook): ${n} times`,
    versionsTitle: "Plan for the three versions",
    versionsLead: "Each version is written natively in its own language, never translated.",
    audience: "Audience",
    register: "Register",
    words: "Narration",
    wordsValue: (w, wpm) => `about ${w} words (${wpm} words/min)`,
    voice: "Voice",
    voiceValue: (m) => `your recording (cleaned only), or your ElevenLabs voice: ${m}`,
    musicPolicy: { none: "nothing", "no-instruments": "no instruments (sound design / vocal nasheed)", score: "licensed score, well under the voice" },
    fonts: "Fonts",
    descNote: "Description line (no label on screen):",
    runTitle: "Automatic run",
    agentsUsed: (n) => `${n} agents`,
    approvals: "Human approval steps inside the run: 0. You publish at the end.",
    perVersion: "per version",
    gates: "Automatic checks",
    rulesTitle: "Rules that apply",
    download: "Download plan JSON",
    copy: "Copy",
    copied: "Copied",
    rules: {
      "legal-footage-only": "Footage only from legal free sources (stock sites, Commons, NASA) or with the creator's written permission. Nothing downloaded from Facebook, X, YouTube or TikTok.",
      "versions-native": "Arabic (Islamic outlook), English (USA) and Bangla, each written natively.",
      "no-approval-step": "No human approval step inside the run; you publish.",
      "no-label-on-screen": "No \"fictional story\" label on screen; a one-line note in the description only.",
      "never-real-person": "An invented story is never called true and never tied to a real person.",
      "every-claim-sourced": "Every claim is checked against sources.",
      "quran-verbatim": "Quran: verbatim Tanzil text only, cut only at ayah ends, never synthesised.",
      "nothing-under-quran": "Nothing under recitation: no music, nasheed or nature sounds.",
      "no-depiction": "Prophets, Companions, angels and Allah are never depicted.",
      "ai-visuals-disclosed": "AI visuals only where stock cannot show it, and always disclosed.",
    },
    notices: {
      "names-in-story": (names) => `The story names ${names}. If this is a real person, choose "True story" so it is made from sources.`,
      "prophet-never-fiction": () => "The story of a prophet or a Companion is never fiction; it stays a sourced documentary.",
      "factual-topic": () => "This is a real topic, so it is researched as a documentary. Choose \"Invented story\" for fiction.",
    },
    verdict: { ready: "Recording is ready", usable: "Usable; a few things will be fixed", "fix-first": "Better to fix first" },
    reportTitle: "Loudness and noise report",
    engineNotes: "Engine notes",
    planTitle: "Voice plan",
    ownVoice: "Your voice is never altered. The original file is kept.",
    neverTitle: "Never done",
    editingTitle: "Editing",
    gain: (g, t) => `${g > 0 ? "+" : ""}${g} dB to reach ${t} LUFS`,
    limiter: "a limiter holds the peak at -1 dBTP",
    otherVersions: "Voice for the other two versions",
    sameRecitation: "The same recitation serves every version; only the translation subtitles differ.",
    viaElevenLabs: (m) => `your ElevenLabs voice, model ${m}`,
    nativeRate: (r, b) => `Measured at the file's own ${r / 1000} kHz${b ? ", " + b + "-bit" : ""}.`,
    resampled: (r) => `The browser opened the audio at ${r / 1000} kHz; upload WAV to check the original sample rate.`,
    quranLang: "Quran recitation is always Arabic; the language is set to Arabic.",
    items: {
      duration: "Length",
      loudness: "Loudness (integrated)",
      "true-peak": "True peak",
      snr: "Voice vs noise (SNR)",
      "noise-floor": "Noise floor",
      clipping: "Clipping",
      "dc-offset": "DC offset",
      "sample-rate": "Sample rate",
      pauses: "Pauses",
    },
    explain: {
      duration: { good: "", bad: "under one second" },
      loudness: { good: "close to the target", ok: "the level is set in the mix", bad: "nearly silent or very quiet; noise rises too" },
      "true-peak": { good: "safe", ok: "near the ceiling; the limiter handles it", bad: "over -1 dBTP; a limiter is needed" },
      snr: { good: "clean", ok: "some noise; light noise reduction", bad: "noisy; a quieter room would be better", info: "" },
      "noise-floor": { info: "background sound in the pauses" },
      clipping: { good: "no clipping", bad: "clips in places; record further from the mic or with lower gain" },
      "dc-offset": { good: "", ok: "small; removed", bad: "removed" },
      "sample-rate": { good: "", ok: "fine", bad: "under 32 kHz; the voice will sound dull", info: "" },
      pauses: { info: "" },
    },
    steps: {
      "dc-removal": () => "remove DC offset",
      "de-clip": () => "repair clipped peaks",
      "noise-reduction": (s) => `noise reduction: ${s.strength} (at most ${s.maxReductionDb} dB)`,
      "high-pass": (s) => `cut rumble below ${s.hz} Hz`,
      compressor: (s) => `gentle compressor (${s.ratio}:1)`,
      "de-ess": () => "soften harsh s sounds",
      reverb: () => "a touch of natural room",
      loudness: (s) => `whole track to ${s.targetLufs} LUFS at once${s.gainDb === null ? "" : ` (${s.gainDb > 0 ? "+" : ""}${s.gainDb} dB)`}`,
      "true-peak-limiter": (s) => `true-peak limiter at ${s.ceilingDbtp} dBTP`,
      "elevenlabs-tts": (s) => `ElevenLabs ${s.modelId}`,
    },
  },
};

const VERSION_LANG = { ar: "ar", "en-US": "en", "bn-BD": "bn" };
const MODEL_NAMES = { eleven_multilingual_v2: "Multilingual v2", eleven_v3: "v3" };
const $ = (sel) => document.querySelector(sel);
const state = { lang: "bn", idea: null, analysis: null, nativeRate: true, bits: null };

function storedLang() {
  try { return localStorage.getItem("studio-lang"); } catch { return null; }
}
function t(key) {
  return T[state.lang][key];
}

/** Build an element; strings become text nodes, so typed text is never parsed as HTML. */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return hh ? `${hh}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}
function minutesLabel(seconds) {
  return seconds < 60 ? `${seconds} s` : `${Math.round((seconds / 60) * 10) / 10} min`;
}
const prettyId = (id) => id.replace(/-/g, " ");

function applyLang(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  try { localStorage.setItem("studio-lang", lang); } catch { /* private mode */ }
  for (const b of document.querySelectorAll("[data-lang]")) b.setAttribute("aria-pressed", String(b.dataset.lang === lang));
  for (const el of document.querySelectorAll("[data-t]")) el.textContent = t(el.dataset.t);
  for (const el of document.querySelectorAll("[data-ph]")) el.placeholder = t(el.dataset.ph);
  if (state.idea) renderIdea();
  if (state.analysis) renderVoice();
}

// ---------- Idea ----------

function runIdea() {
  const text = $("#idea").value;
  const error = $("#idea-error");
  error.hidden = true;
  if (!text.trim()) {
    error.textContent = t("emptyIdea");
    error.hidden = false;
    state.idea = null;
    $("#idea-out").replaceChildren();
    return;
  }
  const mode = document.querySelector("input[name=mode]:checked").value;
  const minutes = Number($("#minutes").value) || null;
  try {
    state.idea = planIdea({ text, mode, minutes });
    renderIdea();
    $("#idea-out").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
  }
}

function renderIdea() {
  const p = state.idea;
  const L = T[state.lang];
  const r = p.reading;
  const modeText = p.filmMode === "story" ? L.modeStoryLabel : p.filmMode === "own-script" ? L["modeOwn-script"] : L.modeDocumentary;

  const understood = h("div", { class: "panel" },
    h("h3", null, L.understood),
    h("p", { dir: "auto" }, r.fixed),
    r.corrections.length
      ? h("p", { class: "fix" }, L.fixedSpelling, " ", r.corrections.map((c, i) => [i ? ", " : "", h("s", { dir: "auto" }, c.from), " → ", h("b", { dir: "auto" }, c.to)]))
      : h("p", { class: "fix" }, L.noFix),
    h("p", { class: "small muted" }, `${L.language}: ${L.langNames[r.language] || r.language}`),
  );

  const kind = h("div", { class: "panel" },
    h("h3", null, L.filmType),
    h("div", { class: "badges" },
      h("span", { class: "badge main" }, modeText),
      p.islamic && h("span", { class: "badge ok" }, L.islamic),
      p.needsAiVisuals && h("span", { class: "badge warn" }, L.aiVisuals),
      p.needsResearch && h("span", { class: "badge" }, L.research),
      h("span", { class: "badge" }, `${L.confidence}: ${L.conf[p.confidence]}`),
    ),
    p.notices.map((n) => h("p", { class: "notice" }, L.notices[n](p.names.join(", ")))),
    h("details", null, h("summary", null, L.why), h("ul", { lang: "en" }, p.reasons.map((x) => h("li", null, x)))),
  );

  const f = p.format;
  const format = h("div", { class: "panel" },
    h("h3", null, `${L.format}: `, h("span", { lang: "en" }, f.name)),
    h("dl", { class: "kv" },
      h("dt", null, L.length), h("dd", null, minutesLabel(p.durationSeconds)),
      p.closestStyle && [h("dt", null, L.closestStyle), h("dd", { lang: "en" }, p.closestStyle.name)],
      h("dt", null, L.hook), h("dd", { lang: "en" }, f.hook),
      h("dt", null, L.visuals), h("dd", { lang: "en" }, f.visuals),
      h("dt", null, L.music), h("dd", { lang: "en" }, f.music),
    ),
  );

  const beats = h("div", { class: "panel" },
    h("h3", null, L.beats),
    h("ol", { class: "beats", lang: "en" }, p.beats.map((b) => h("li", null, h("span", { class: "time" }, clock(b.atSeconds)), h("span", null, h("span", { class: "beat-id" }, prettyId(b.id)), " — ", b.purpose)))),
    p.reHooks.length ? h("p", { class: "small muted" }, L.reHooks(p.reHooks.length)) : null,
  );

  const versions = h("div", { class: "panel" },
    h("h3", null, L.versionsTitle),
    h("p", { class: "small muted" }, L.versionsLead),
    h("div", { class: "versions" }, p.versions.map((v) => h("article", { class: "version" },
      h("h4", null, h("span", { lang: VERSION_LANG[v.id], dir: v.direction }, v.nativeName), " · ", v.name),
      h("dl", { class: "kv" },
        h("dt", null, L.audience), h("dd", { lang: "en" }, v.audience),
        h("dt", null, L.register), h("dd", { lang: "en" }, v.register),
        h("dt", null, L.words), h("dd", null, L.wordsValue(v.narrationWords, v.wordsPerMinute)),
        h("dt", null, L.voice), h("dd", null, L.voiceValue(MODEL_NAMES[v.voice.elevenlabs] || v.voice.elevenlabs)),
        h("dt", null, L.music), h("dd", null, L.musicPolicy[v.music.policy]),
        h("dt", null, L.fonts), h("dd", { lang: "en" }, `${v.fonts.display}, ${v.fonts.text}`),
      ),
      v.descriptionNote && h("div", { class: "note" }, h("div", { class: "small muted" }, L.descNote), h("div", { lang: VERSION_LANG[v.id], dir: v.direction }, v.descriptionNote)),
    ))),
  );

  const run = h("div", { class: "panel" },
    h("h3", null, `${L.runTitle} · ${L.agentsUsed(p.run.agentsUsed)}`),
    h("p", { class: "small" }, L.approvals),
    h("ol", { class: "stages", lang: "en" }, p.run.stages.map((s) => h("li", null, h("span", null, s.title), h("span", { class: "muted small" }, `${s.agents}${s.perVersion ? " · " + L.perVersion : ""}`)))),
    h("details", null, h("summary", null, `${L.gates} (${p.run.gates.length})`), h("ul", { lang: "en" }, p.run.gates.map((g) => h("li", null, h("b", null, g.id), ": ", g.rule)))),
  );

  const rules = h("div", { class: "panel" },
    h("h3", null, L.rulesTitle),
    h("ul", null, p.rules.map((id) => h("li", null, L.rules[id]))),
    h("div", { class: "actions" },
      h("button", { type: "button", class: "ghost", onclick: () => downloadJson(p, "zupona-plan.json") }, L.download),
    ),
  );

  $("#idea-out").replaceChildren(understood, kind, format, beats, versions, run, rules);
}

function downloadJson(data, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Voice ----------

let worker = null;
function measureInWorker(message, transfer) {
  try {
    worker = worker || new Worker(new URL("./audio-worker.js", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  return new Promise((resolve, reject) => {
    worker.onmessage = (e) => (e.data.error ? reject(new Error(e.data.error)) : resolve(e.data));
    worker.onerror = (e) => { e.preventDefault(); worker = null; reject(new Error("worker")); };
    worker.postMessage(message, transfer);
  });
}

async function decodeInBrowser(buffer) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const audio = await new Promise((resolve, reject) => ctx.decodeAudioData(buffer, resolve, reject));
    const channels = [];
    for (let c = 0; c < Math.min(2, audio.numberOfChannels); c += 1) channels.push(audio.getChannelData(c).slice());
    return { channels, sampleRate: audio.sampleRate };
  } finally {
    if (ctx.close) ctx.close().catch(() => {});
  }
}

async function handleFile(file) {
  const status = $("#voice-status");
  const error = $("#voice-error");
  error.hidden = true;
  state.analysis = null;
  $("#voice-out").replaceChildren();
  $("#file-name").textContent = file.name;
  const player = $("#player");
  if (player.src) URL.revokeObjectURL(player.src);
  player.src = URL.createObjectURL(file);
  player.hidden = false;
  if (file.size > 300 * 1024 * 1024) {
    error.textContent = t("tooBig");
    error.hidden = false;
    return;
  }
  try {
    status.textContent = t("reading");
    const buffer = await file.arrayBuffer();
    let result = null;
    if (isWav(buffer)) {
      status.textContent = t("measuring");
      const copy = buffer.slice(0);
      result = await measureInWorker({ kind: "wav", buffer: copy }, [copy])?.catch(() => null);
      if (!result) {
        try {
          const d = decodeWav(buffer, { maxChannels: 2 });
          result = { analysis: analyzeRecording(d.channels, d.sampleRate), nativeRate: true, bits: d.bitsPerSample };
        } catch { result = null; }
      }
    }
    if (!result) {
      status.textContent = t("decoding");
      const d = await decodeInBrowser(buffer);
      status.textContent = t("measuring");
      const sent = d.channels.map((c) => c.slice());
      result = await measureInWorker({ kind: "pcm", channels: sent, sampleRate: d.sampleRate }, sent.map((c) => c.buffer))?.catch(() => null);
      if (!result) result = { analysis: analyzeRecording(d.channels, d.sampleRate) };
      result.nativeRate = false;
      result.bits = null;
    }
    state.analysis = result.analysis;
    state.nativeRate = result.nativeRate;
    state.bits = result.bits;
    status.textContent = `${t("measured")} ✓`;
    renderVoice();
    $("#voice-out").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    status.textContent = "";
    error.textContent = t("decodeFail");
    error.hidden = false;
    console.error(e);
  }
}

function formatValue(item, a) {
  const v = item.value;
  if (v === null || v === undefined) return "—";
  switch (item.id) {
    case "duration": return clock(v);
    case "loudness": return `${v.toFixed(1)} LUFS`;
    case "true-peak": return `${v.toFixed(1)} dBTP`;
    case "snr": return `${v.toFixed(0)} dB`;
    case "noise-floor": return `${v.toFixed(0)} dBFS`;
    case "clipping": return String(v);
    case "dc-offset": return v.toFixed(4);
    case "sample-rate": return `${v / 1000} kHz · ${a.channels === 1 ? "mono" : "stereo"}`;
    case "pauses": return `${Math.round(v * 100)}%`;
    default: return String(v);
  }
}

function renderVoice() {
  const L = T[state.lang];
  const a = state.analysis;
  const ctype = $("#ctype").value;
  const versionId = document.querySelector("input[name=vlang]:checked").value;
  const plan = planRecording({ analysis: a, versionId, contentType: ctype, nativeRate: state.nativeRate });
  const report = h("div", { class: "panel" },
    h("div", { class: `verdict ${plan.report.verdict}` }, L.verdict[plan.report.verdict]),
    h("h3", null, L.reportTitle),
    h("table", { class: "report" }, h("tbody", null, plan.report.items.map((item) => {
      const why = (L.explain[item.id] || {})[item.level] || "";
      return h("tr", null,
        h("td", null, h("span", { class: `dot ${item.level}`, title: item.level })),
        h("td", null, L.items[item.id], why && h("div", { class: "small muted" }, why)),
        h("td", { class: "val" }, formatValue(item, a)),
      );
    }))),
    h("p", { class: "small muted" }, state.nativeRate ? L.nativeRate(a.sampleRate, state.bits) : L.resampled(a.sampleRate)),
    a.problems.length ? h("details", { open: true }, h("summary", null, L.engineNotes), h("ul", { lang: "en" }, a.problems.map((x) => h("li", null, x)))) : null,
  );

  const own = plan.own;
  const steps = own.chain.map((s) => h("li", null, (L.steps[s.step] || (() => s.step))(s)));
  const voice = h("div", { class: "panel" },
    h("h3", null, L.planTitle),
    h("p", null, h("b", null, L.ownVoice)),
    h("ol", { class: "chain" }, steps),
    h("p", { class: "small" }, L.gain(plan.gain.gainDb, plan.targetLufs), plan.gain.needsLimiter ? `; ${L.limiter}` : ""),
    h("h4", null, L.music), h("p", null, L.musicPolicy[own.music.policy], h("div", { class: "small muted", lang: "en" }, own.music.reason)),
    h("h4", null, L.editingTitle), h("p", { class: "small", lang: "en" }, `${own.editing.cutAt}; ${own.editing.timing}.`),
    h("details", null, h("summary", null, L.neverTitle), h("ul", { lang: "en" }, own.never.map((x) => h("li", null, x)))),
    own.warnings.length ? h("ul", { lang: "en", class: "small" }, own.warnings.filter((w) => !a.problems.includes(w)).map((w) => h("li", null, w))) : null,
    h("h4", null, L.otherVersions),
    h("ul", null, plan.others.map((o) => h("li", null,
      h("b", { lang: VERSION_LANG[o.versionId] }, o.versionId === "ar" ? "العربية" : o.versionId === "en-US" ? "English" : "বাংলা"), ": ",
      o.kind === "same-recitation" ? L.sameRecitation : L.viaElevenLabs(MODEL_NAMES[o.modelId] || o.modelId),
    ))),
  );
  $("#voice-out").replaceChildren(report, voice);
}

// ---------- Wiring ----------

function init() {
  for (const b of document.querySelectorAll("[data-lang]")) b.addEventListener("click", () => applyLang(b.dataset.lang));
  $("#idea-form").addEventListener("submit", (e) => { e.preventDefault(); runIdea(); });
  for (const c of document.querySelectorAll("[data-example]")) c.addEventListener("click", () => { $("#idea").value = c.dataset.example; runIdea(); });
  for (const r of document.querySelectorAll("input[name=mode]")) r.addEventListener("change", () => state.idea && runIdea());
  $("#minutes").addEventListener("change", () => state.idea && runIdea());

  const file = $("#file");
  file.addEventListener("change", () => file.files[0] && handleFile(file.files[0]));
  const drop = $("#drop");
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); });
  for (const ev of ["dragleave", "drop"]) drop.addEventListener(ev, () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
  $("#voice-form").addEventListener("submit", (e) => e.preventDefault());
  $("#ctype").addEventListener("change", () => {
    if ($("#ctype").value === "quran_recitation") {
      document.querySelector("input[name=vlang][value=ar]").checked = true;
      $("#voice-status").textContent = t("quranLang");
    }
    if (state.analysis) renderVoice();
  });
  for (const r of document.querySelectorAll("input[name=vlang]")) r.addEventListener("change", () => {
    if ($("#ctype").value === "quran_recitation" && r.value !== "ar") $("#ctype").value = "documentary";
    if (state.analysis) renderVoice();
  });

  const saved = storedLang();
  applyLang(saved === "en" || saved === "bn" ? saved : "bn");
}

init();
