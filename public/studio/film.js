// Zupona AI Studio: make the full film (English, USA) through the film API.
// The price is shown before anything starts; the run is protected by the
// owner's studio token, which stays in this browser only.
import { estimateRun } from "./engine/film-run.mjs";
import { FORMATS } from "./engine/formats.mjs";

const T = {
  bn: {
    title: "পুরো ফিল্ম বানাও (English, USA)",
    lead: "বিষয় দিলে ইঞ্জিন নিজে রিসার্চ, তথ্য যাচাই, স্ক্রিপ্ট, শট লিস্ট, QA আর পাবলিশিং প্যাক বানাবে। প্রতিটি চ্যাপ্টার কোড দিয়ে যাচাই হয়।",
    topic: "বিষয় (ইংরেজিতে বা বাংলায়)",
    ideas: "প্রমাণিত বিষয় খুঁজে দাও (YouTube টপিক রাডার)",
    ideasHint: "একটা ধরন লিখুন। গত ১২ মাসের লম্বা ভিডিওর মধ্যে যেগুলো নিজের চ্যানেলের গড় ভিউয়ের অনেক গুণ বেশি পেয়েছে, সেগুলো দেখাবে: মানে দর্শক এই বিষয়টা চায়। এটা শুধু বিষয়ের ধারণা; আমাদের ফিল্ম নতুন নাম, নতুন দৃষ্টিভঙ্গি আর নিজের স্ক্রিপ্টে বানানো হবে, কারও ভিডিও কপি নয়।",
    ideasNiche: "ধরন (যেমন motivation life story)",
    ideasGo: "খুঁজো",
    ideasUse: "এই বিষয়ে ফিল্ম",
    ideasNone: "কিছু পাওয়া যায়নি। অন্য শব্দে খুঁজুন।",
    ideasTimes: "× চ্যানেলের গড়",
    ideasViews: "ভিউ",
    ideasPerDay: "ভিউ/দিন",
    ideasCached: "আজকের আগের খোঁজ থেকে (কোটা খরচ হয়নি)",
    ideasPicked: "বিষয় বসানো হয়েছে। ইঞ্জিনকে বলা হবে: নিজের নতুন ফিল্ম, ওই ভিডিওর কপি নয়।",
    minutes: "দৈর্ঘ্য (মিনিট)",
    format: "ভিডিওর ধরন",
    formatAuto: "বিষয় দেখে নিজে বেছে নাও",
    formatPlain: "সাধারণ ডকুমেন্টারি",
    saving: "সাশ্রয়ী মোড: Claude-এর খরচ অর্ধেক (Anthropic Batch), মান একই; তবে ধীরে, পুরো ফিল্মে কয়েক ঘণ্টা লাগতে পারে",
    onWorker: "আমার নিজের কম্পিউটারে বানাও (তার নিজের ব্রেইন দিয়ে; কম্পিউটারে node local/jobs.mjs work --api চালু থাকতে হবে)",
    renderHere: "আমার কম্পিউটারে রেন্ডার করো (কিছু প্রকাশ হবে না)",
    queue: "কিউ",
    savingPrice: "সাশ্রয়ী মোডে",
    ai: "গল্পের চরিত্র AI দৃশ্যে দেখাও (একই চেহারা সব দৃশ্যে; আসল কোনো মানুষ নয়; YouTube Studio-তে ঘোষণা, স্ক্রিনে কিছু লেখা নয়)",
    token: "স্টুডিও টোকেন",
    tokenHint: "Cloudflare-এ যে STUDIO_TOKEN দিয়েছেন। শুধু এই ব্রাউজারে থাকে।",
    estimate: "আনুমানিক খরচ",
    review: "Bossism-এর রিভিউ (প্রমাণ দেখে কোডের যাচাই)",
    lowered: "চালুর আগেই জানানো: যেখানে মান কম হবে",
    overrideReason: "তবুও প্রকাশ করতে চাইলে কারণ লিখুন (রেকর্ডে থাকবে)",
    overrideGo: "কারণসহ তবুও প্রকাশ করো",
    gates: { research: "রিসার্চ", claims: "দাবি", script: "স্ক্রিপ্ট", story: "গল্প", visual: "ছবি", rights: "অধিকার", packaging: "প্যাকেজিং" },
    freeBrain: (/** @type {string} */ m) => `খরচ নেই: আপনার নিজের মডেল (${m}) লিখবে`,
    start: "ফিল্ম শুরু করো",
    starting: "শুরু হচ্ছে…",
    notConnected: "সার্ভার এখনও কানেক্ট হয়নি। Cloudflare আর Claude API key কানেক্ট হলে এখান থেকে ফিল্ম চলবে।",
    status: "অবস্থা",
    spent: "এখন পর্যন্ত খরচ",
    files: "ফাইল",
    page: "পুরো ফিল্মের পেজ খোলো (স্ক্রিপ্ট, শট, ক্লিপ, সোর্স, খরচ)",
    myFilms: "আমার ফিল্মগুলো",
    noFilms: "এখনও কোনো ফিল্ম নেই।",
    open: "খোলো",
    render: "ভিডিও রেন্ডার করো (MP4, Shorts, থাম্বনেইল)",
    renderStarted: "রেন্ডার শুরু হয়েছে। GitHub-এ দেখুন:",
    remake: "একটা দৃশ্য আবার বানাও",
    remakeHint: "শুধু ওই দৃশ্যটা নতুন করে লেখা হবে, কোডে যাচাই হবে, নতুন ফুটেজ পাবে। বাকি ফিল্ম যেমন আছে তেমন থাকবে।",
    remakeScene: "দৃশ্যের ID (যেমন SC0012)",
    remakeWhat: "কী বদলাতে চান",
    remakeGo: "দৃশ্যটা আবার বানাও",
    remakeDone: "হয়ে গেছে। খরচ",
    remakeFailed: "হয়নি:",
    learn: "পাবলিশ হওয়া ভিডিও থেকে শেখো",
    learnHint: "ইউটিউবে ফিল্মটা পাবলিশ হওয়ার এক-দুই দিন পর এর লিংক দিন। দর্শক কোন দৃশ্যে চলে গেছে আর কোথায় থেকেছে, সেটা পরের ফিল্মের লেখক আর এডিটর শিখবে। প্রথমবার \"YouTube কানেক্ট\" চাপুন (শুধু দেখার অনুমতি)।",
    learnVideo: "ইউটিউব ভিডিওর লিংক",
    learnGo: "শেখো",
    learnConnect: "YouTube কানেক্ট",
    learnDone: "শেখা হয়েছে। ০:৩০-এ দেখছিল",
    picture: "একটা শটে নিজের ছবি",
    pictureHint: "ফিল্ম পেজে প্রতিটা শটের আইডি আছে (যেমন SC0012-1)। আপনার বাছাই করা ছবি বা ক্লিপের সরাসরি লিংক দিন; রেন্ডারের সময় সেটা নামিয়ে ওই শটে বসানো হবে। লিংক খালি রাখলে আগেরটা মুছে যাবে। ছবির অধিকার আপনার দায়িত্ব।",
    pictureShot: "শটের আইডি (যেমন SC0012-1)",
    pictureUrl: "ছবি বা ক্লিপের লিংক",
    pictureGo: "সেভ করো",
    pictureDone: "সেভ হয়েছে। পরের রেন্ডারে এই শটে বসবে। মোট লিংক:",
    pictureRemoved: "লিংক মুছে গেছে।",
    lastError: "শেষ চেষ্টায় সমস্যা (আবার চেষ্টা হচ্ছে)",
    failedWhy: "থেমে গেছে, কারণ",
    resume: "যেখানে থেমেছে সেখান থেকে চালাও",
    resumeHint: "শেষ হওয়া ধাপগুলোর টাকা আবার লাগবে না।",
    resumeBudget: "এই ফিল্মের নতুন বাজেট (ডলার, খালি রাখলে আগেরটা)",
    resumed: "আবার চালু হয়েছে।",
    footage: "ফুটেজ",
    edit: "এডিট",
    gaps: "বাকি কাজ (GAP)",
    stages: { market: "ইউটিউবে যা চলছে", s01: "S0–S1 টাইটেল ও প্ল্যান", research: "ওয়েব রিসার্চ", sources: "সোর্স যাচাই", s2: "S2 তথ্যের খাতা", s3: "S3 গল্পের কাঠামো", s4: "S4 বাইবেল", qa: "QA ও সংশোধন", viewer: "দর্শক প্যানেল", s6: "S6 রিপোর্ট", s7: "S7 পাবলিশিং প্যাক" },
  },
  en: {
    title: "Make the full film (English, USA)",
    lead: "Give a topic and the engine researches, fact-checks and writes the script, shot list, QA and publishing pack. Every chapter is checked in code.",
    topic: "Topic",
    ideas: "Find proven topics (YouTube topic radar)",
    ideasHint: "Type a niche. It shows long videos from the last 12 months that earned many times their own channel's average views: proof the audience wants the topic. It is only the topic; our film gets a new title, a new angle and its own script, never a copy of anyone's video.",
    ideasNiche: "Niche (e.g. motivation life story)",
    ideasGo: "Search",
    ideasUse: "Film this topic",
    ideasNone: "Nothing found. Try other words.",
    ideasTimes: "× channel average",
    ideasViews: "views",
    ideasPerDay: "views/day",
    ideasCached: "from an earlier search today (no quota spent)",
    ideasPicked: "Topic filled in. The engine is told: our own new film, never a copy of that video.",
    minutes: "Length (minutes)",
    format: "Kind of film",
    formatAuto: "Choose from the topic",
    formatPlain: "General documentary",
    saving: "Saving mode: half the Claude cost (Anthropic Batch API), same quality; slower, a full film can take a few hours",
    onWorker: "Make it on my own computer (with its own brain; the computer runs node local/jobs.mjs work --api)",
    renderHere: "Render on my computer (nothing is published)",
    queue: "Queue",
    savingPrice: "in saving mode",
    ai: "Show the story's characters in AI scenes (the same look in every scene; never a real person; disclosed in YouTube Studio, nothing on screen)",
    token: "Studio token",
    tokenHint: "The STUDIO_TOKEN you set in Cloudflare. It stays in this browser only.",
    estimate: "Estimated cost",
    review: "Bossism's review (code checking the evidence)",
    lowered: "Said before the run: where quality is lower",
    overrideReason: "To release it anyway, write your reason (it is kept on record)",
    overrideGo: "Release anyway, with my reason",
    gates: { research: "Research", claims: "Claims", script: "Script", story: "Story", visual: "Pictures", rights: "Rights", packaging: "Packaging" },
    freeBrain: (/** @type {string} */ m) => `No cost: your own model (${m}) writes it`,
    start: "Start the film",
    starting: "Starting…",
    notConnected: "The server is not connected yet. Once Cloudflare and the Claude API key are connected, films run from here.",
    status: "Status",
    spent: "Spent so far",
    files: "Files",
    page: "Open the film page (script, shots, clips, sources, cost)",
    myFilms: "My films",
    noFilms: "No films yet.",
    open: "Open",
    render: "Render the video (MP4, Shorts, thumbnails)",
    renderStarted: "Render started. Follow it on GitHub:",
    remake: "Re-make one scene",
    remakeHint: "Only that scene is rewritten, checked in code and given fresh footage. The rest of the film stays as it is.",
    remakeScene: "Scene ID (e.g. SC0012)",
    remakeWhat: "What to change",
    remakeGo: "Re-make the scene",
    remakeDone: "Done. Cost",
    remakeFailed: "Not done:",
    learn: "Learn from the published video",
    learnHint: "A day or two after the film is on YouTube, give its link. Where viewers left and where they stayed goes to the writers and the editor of the next films. The first time, press \"Connect YouTube\" (read-only access).",
    learnVideo: "YouTube video link",
    learnGo: "Learn",
    learnConnect: "Connect YouTube",
    learnDone: "Learned. Watching at 0:30:",
    picture: "Your own picture for a shot",
    pictureHint: "Every shot has an id on the film page (e.g. SC0012-1). Paste the direct link of a picture or clip you chose; the render downloads it and puts it in that shot. An empty link removes the earlier one. Its rights are your responsibility.",
    pictureShot: "Shot id (e.g. SC0012-1)",
    pictureUrl: "Link to the picture or clip",
    pictureGo: "Save",
    pictureDone: "Saved. The next render puts it in this shot. Links:",
    pictureRemoved: "Link removed.",
    lastError: "Last attempt failed (retrying)",
    failedWhy: "Stopped because",
    resume: "Resume where it stopped",
    resumeHint: "Finished stages are not paid for again.",
    resumeBudget: "New budget for this film (USD, empty keeps the old one)",
    resumed: "Resumed.",
    footage: "Footage",
    edit: "Edit",
    gaps: "Open items (GAPs)",
    stages: { market: "What works on YouTube", s01: "S0–S1 titles and plan", research: "Web research", sources: "Sources checked", s2: "S2 claim ledger", s3: "S3 story architecture", s4: "S4 bibles", qa: "QA and fixes", viewer: "Viewer panel", s6: "S6 report", s7: "S7 publishing pack" },
  },
};

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const lang = () => (document.documentElement.lang === "en" ? "en" : "bn");
const L = () => T[lang()];
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

/** Fill the format choice in the page's language, keeping the current pick. */
function formatOptions() {
  const l = L();
  const select = /** @type {HTMLSelectElement} */ ($("film-format"));
  const keep = select.value || "auto";
  const option = (/** @type {string} */ value, /** @type {string} */ label) => { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; };
  select.replaceChildren(option("auto", l.formatAuto), option("", l.formatPlain), ...FORMATS.map((f) => option(f.id, lang() === "bn" ? f.bn : f.name)));
  select.value = keep;
}

function render() {
  const l = L();
  for (const el of document.querySelectorAll("[data-f]")) el.textContent = l[/** @type {HTMLElement} */ (el).dataset.f];
  formatOptions();
  showEstimate();
  const id = store.get("studio-film-id");
  if (id) poll(id);
}

let estimateSeq = 0;
/**
 * The price before a run. The server knows which brain is connected (a free
 * local model, Gemini or Claude); without a server the Claude estimate is shown.
 */
async function showEstimate() {
  const minutes = Number(/** @type {HTMLInputElement} */ ($("film-minutes")).value);
  if (!(minutes >= 1 && minutes <= 300)) { $("film-estimate").textContent = ""; return; }
  const seq = (estimateSeq += 1);
  /** @type {any} */
  let e = null;
  try {
    const res = await fetch(`/api/estimate?minutes=${minutes}`);
    if (res.ok) e = await res.json();
  } catch { /* no server: the static studio */ }
  if (seq !== estimateSeq) return;
  e ??= estimateRun(Math.round(minutes * 60));
  $("film-estimate").textContent = e.usdHigh === 0
    ? `${L().freeBrain(e.model)} · ${e.chapters} ch`
    : `${L().estimate}: $${e.usdLow}–$${e.usdHigh} · ${L().savingPrice} $${e.savingUsdLow}–$${e.savingUsdHigh} (${e.chapters} ch, ${e.model})`;
}

/** @param {string} msg */
function error(msg) {
  const el = $("film-error");
  el.textContent = msg;
  el.hidden = !msg;
}

async function start(/** @type {SubmitEvent} */ ev) {
  ev.preventDefault();
  error("");
  const topic = /** @type {HTMLInputElement} */ ($("film-topic")).value.trim();
  const minutes = Number(/** @type {HTMLInputElement} */ ($("film-minutes")).value);
  const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
  if (token) store.set("studio-token", token);
  const button = /** @type {HTMLButtonElement} */ ($("film-start"));
  button.disabled = true;
  button.textContent = L().starting;
  try {
    const formatId = /** @type {HTMLSelectElement} */ ($("film-format")).value;
    const allowAi = /** @type {HTMLInputElement} */ ($("film-ai")).checked;
    const saving = /** @type {HTMLInputElement} */ ($("film-saving")).checked;
    const runOn = /** @type {HTMLInputElement} */ ($("film-worker")).checked ? "worker" : undefined;
    const notes = idea && idea.topic === topic ? idea.note : undefined;
    const res = await fetch("/api/films", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ topic, minutes, versionId: "en-US", formatId, allowAi, notes, saving, runOn }) });
    const body = await res.json().catch(() => ({}));
    const isApi = (res.headers.get("content-type") ?? "").includes("json");
    if (!isApi || [404, 405, 501].includes(res.status)) { error(L().notConnected); return; }
    if (!res.ok) { error(body.error ?? L().notConnected); return; }
    store.set("studio-film-id", body.id);
    poll(body.id);
  } catch {
    error(L().notConnected);
  } finally {
    button.disabled = false;
    button.textContent = L().start;
  }
}

/** @type {number | undefined} */
let timer;
/** The film being watched, and how long to wait after a failed check. */
let watching = "";
let backoffMs = 15000;
/**
 * Watch a film while its Workflow works: every 15 s, longer after network
 * errors (up to 2 min, so a phone on a weak signal keeps trying without
 * draining the battery), and not at all while the tab is hidden.
 */
async function poll(/** @type {string} */ id) {
  clearTimeout(timer);
  watching = id;
  if (document.visibilityState === "hidden") return;
  try {
    const res = await fetch(`/api/films/${id}`);
    if (res.status === 404) return;
    if (!res.ok) throw new Error(String(res.status));
    const body = await res.json();
    backoffMs = 15000;
    showRun(id, body.run, body);
    const working = ["queued", "running", "waiting", "paused", "waitingForPause"].includes(body.workflow?.status) || body.run.status === "running" || body.run.status === "revising" || !body.run.status;
    if (working) timer = window.setTimeout(() => poll(id), backoffMs);
  } catch {
    backoffMs = Math.min(120000, backoffMs * 2);
    timer = window.setTimeout(() => poll(id), backoffMs);
  }
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && watching) poll(watching); });

/**
 * Bossism's verdicts for the film: each gate, what it found, and the release decision, in the page's language.
 * @param {any} review @param {any[]} degradations
 */
function reviewPanel(review, degradations) {
  const l = L();
  const bn = lang() === "bn";
  const text = (/** @type {any} */ m) => (m ? (bn ? m.bn : m.en) ?? m.en ?? "" : "");
  const panel = document.createElement("div");
  const h = (/** @type {string} */ tag, /** @type {string} */ s) => { const e = document.createElement(tag); e.textContent = s; return e; };
  if (degradations?.length) {
    panel.append(h("h4", l.lowered));
    const ul = document.createElement("ul");
    for (const d of degradations) ul.append(h("li", text(d)));
    panel.append(ul);
  }
  if (!review) return panel;
  panel.append(h("h4", l.review));
  const mark = { pass: "✓", revise: "↻", block: "✗" };
  const ul = document.createElement("ul");
  for (const g of review.gates) {
    const li = h("li", `${mark[/** @type {keyof typeof mark} */ (g.verdict)] ?? "?"} ${l.gates[g.id] ?? g.id}`);
    const findings = (g.findings ?? []).filter((/** @type {any} */ f) => f.severity !== "note" || g.verdict === "pass");
    if (findings.length) {
      const inner = document.createElement("ul");
      for (const f of findings.slice(0, 6)) inner.append(h("li", text(f.message)));
      li.append(inner);
    }
    ul.append(li);
  }
  panel.append(ul, h("p", text(review.release?.message)));
  return panel;
}

function showRun(/** @type {string} */ id, /** @type {any} */ run, /** @type {any} */ extra = {}) {
  const l = L();
  const out = $("film-out");
  out.replaceChildren();
  const h = (/** @type {string} */ tag, /** @type {string} */ text) => { const e = document.createElement(tag); e.textContent = text; return e; };
  out.append(h("h3", `${run.film?.topic ?? ""} · ${l.status}: ${run.status ?? "queued"}`));
  out.append(h("p", `${l.spent}: $${run.costUsd ?? 0}`));
  if (run.status === "running" && run.lastError) out.append(h("p", `⚠ ${l.lastError} (${run.lastError.stage}): ${run.lastError.message}`));
  if ((run.status === "failed" || run.status === "stopped-budget") && run.error) out.append(h("p", `✗ ${l.failedWhy}: ${run.error}`));
  if (run.status === "failed" || run.status === "stopped-budget") out.append(resumeForm(id));
  const list = document.createElement("ul");
  for (const [stage, info] of Object.entries(run.stages ?? {})) {
    const label = stage.startsWith("s5:") ? `S5 ${stage.slice(3)}` : stage.startsWith("media:") ? `${l.footage} ${stage.slice(6)}` : stage.startsWith("edit:") ? `${l.edit} ${stage.slice(5)}` : l.stages[stage] ?? stage;
    list.append(h("li", `✓ ${label}${info.result && info.result.ok === false ? " (GAP)" : ""}`));
  }
  out.append(list);
  out.append(reviewPanel(extra.review ?? null, extra.degradations ?? []));
  // The film's jobs on the owner's machines: what each is doing, in the page's language.
  if (extra.jobs?.length) {
    out.append(h("h4", l.queue));
    const q = document.createElement("ul");
    for (const j of extra.jobs) q.append(h("li", `${j.kind} · ${j.state}${j.progress ? ` · ${j.progress.stage} ${j.progress.done}/${j.progress.total}` : ""}${j.message ? ` · ${lang() === "bn" ? j.message.bn ?? "" : j.message.en ?? ""}` : ""}`));
    out.append(q);
  }
  if (run.gaps?.length) {
    out.append(h("h4", l.gaps));
    const g = document.createElement("ul");
    for (const x of run.gaps.slice(0, 20)) g.append(h("li", x));
    out.append(g);
  }
  const stages = Object.keys(run.stages ?? {});
  // Only files whose stage has finished exist; the rest would be dead links.
  /** @type {Record<string, string[]>} */
  const made = { market: ["market.json"], s01: ["s01.md"], research: ["research.json"], sources: ["sources-check.json"], s2: ["s2.md"], s3: ["s3.md"], s4: ["s4.md"], qa: ["qa.json", "fix-log.json"], viewer: ["viewer.json"], s6: ["film-check.json", "s6.md"], s7: ["s7.md"], originality: ["originality.json"] };
  const files = stages.flatMap((s) => (s.startsWith("s5:") ? [`s5-${s.slice(3)}.md`] : s.startsWith("media:") ? [`media-${s.slice(6)}.json`] : s.startsWith("edit:") ? [`edit-${s.slice(5)}.json`] : made[s] ?? []));
  const page = document.createElement("a");
  page.href = `/api/films/${id}/page`;
  page.textContent = l.page;
  page.target = "_blank";
  page.rel = "noopener";
  page.className = "go";
  out.append(page);
  if (run.status === "done" || run.status === "done-with-gaps") out.append(renderButton(id), remakeForm(id), pictureForm(id), learnForm(id));
  out.append(h("h4", l.files));
  const p = document.createElement("p");
  for (const f of files) {
    const a = document.createElement("a");
    a.href = `/api/films/${id}/files/${f}`;
    a.textContent = f;
    a.target = "_blank";
    a.rel = "noopener";
    p.append(a, " ");
  }
  out.append(p);
}

/**
 * The topic picked from the radar, with the note the engine gets: the proven
 * demand and the rule that our film is its own (dropped if the topic is edited).
 * @type {{ topic: string, note: string } | null}
 */
let idea = null;

/** Search the topic radar and list the outliers; "Film this topic" fills the topic. */
async function findIdeas() {
  const l = L();
  const list = $("ideas-list");
  const note = $("ideas-note");
  const q = /** @type {HTMLInputElement} */ ($("ideas-q")).value.trim();
  const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
  list.replaceChildren();
  note.textContent = "";
  if (q.length < 2) { note.textContent = `${l.remakeFailed} ${l.ideasNiche}`; return; }
  if (!token) { note.textContent = `${l.remakeFailed} ${l.token}`; return; }
  store.set("studio-token", token);
  const go = /** @type {HTMLButtonElement} */ ($("ideas-go"));
  go.disabled = true;
  note.textContent = "…";
  try {
    const res = await fetch(`/api/ideas?${new URLSearchParams({ q, months: "12" })}`, { headers: { authorization: `Bearer ${token}` } });
    const r = await res.json().catch(() => ({ error: l.notConnected }));
    if (!res.ok) { note.textContent = `${l.remakeFailed} ${r.error ?? res.status}`; return; }
    note.textContent = r.picks.length ? (r.cached ? l.ideasCached : "") : l.ideasNone;
    const n = new Intl.NumberFormat(lang() === "bn" ? "bn-BD" : "en-US", { notation: "compact", maximumFractionDigits: 1 });
    for (const p of r.picks) {
      const li = document.createElement("li");
      const use = document.createElement("button");
      use.type = "button";
      use.className = "chip";
      use.textContent = l.ideasUse;
      use.addEventListener("click", () => {
        const topic = String(p.title).trim().slice(0, 500);
        /** @type {HTMLInputElement} */ ($("film-topic")).value = topic;
        idea = { topic, note: `PROVEN DEMAND (topic radar): the video "${p.title}" by ${p.channelTitle} earned ${p.outlier}x its channel's average views (${p.views} views, about ${p.perDay} a day). The audience wants this topic. Make our own, better film on it: a new title, a new angle, our own research, script and structure. Never copy that video's title, script, structure or thumbnail.` };
        note.textContent = l.ideasPicked;
        $("film-topic").focus();
      });
      const link = document.createElement("a");
      link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(p.id)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = p.title;
      const minutes = Math.round(p.durationSeconds / 60);
      li.append(use, link, ` · ${p.outlier}${l.ideasTimes} · ${n.format(p.views)} ${l.ideasViews} · ${n.format(p.perDay)} ${l.ideasPerDay} · ${minutes} min · ${p.channelTitle}`);
      list.append(li);
    }
  } catch (error) {
    note.textContent = `${l.remakeFailed} ${error instanceof Error ? error.message : error}`;
  } finally {
    go.disabled = false;
  }
}

/** The owner's films, newest first; choosing one shows it below. */
async function showFilms() {
  const l = L();
  const list = $("film-list");
  const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
  list.replaceChildren();
  const say = (/** @type {string} */ text) => { const li = document.createElement("li"); li.textContent = text; list.append(li); };
  if (!token) { say(`${l.remakeFailed} ${l.token}`); return; }
  try {
    const res = await fetch("/api/films", { headers: { authorization: `Bearer ${token}` } });
    const r = await res.json().catch(() => ({ error: l.notConnected }));
    if (!res.ok) { say(`${l.remakeFailed} ${r.error ?? res.status}`); return; }
    if (!r.films.length) { say(l.noFilms); return; }
    for (const f of r.films) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = l.open;
      b.addEventListener("click", () => { store.set("studio-film-id", f.id); poll(f.id); $("film-out").scrollIntoView({ behavior: "smooth" }); });
      li.append(b, ` ${f.topic} · ${f.minutes ?? "?"} min · ${f.status} · $${f.costUsd}${f.createdAt ? ` · ${String(f.createdAt).slice(0, 10)}` : ""}`);
      list.append(li);
    }
  } catch (error) {
    say(`${l.remakeFailed} ${error instanceof Error ? error.message : error}`);
  }
}

/** Resume a failed or budget-stopped film from its last finished stage. @param {string} id */
function resumeForm(id) {
  const l = L();
  const wrap = document.createElement("p");
  const budget = document.createElement("input");
  budget.type = "number";
  budget.min = "1";
  budget.max = "500";
  budget.inputMode = "decimal";
  budget.placeholder = "60";
  const label = document.createElement("label");
  label.append(l.resumeBudget, budget);
  const go = document.createElement("button");
  go.type = "button";
  go.className = "go";
  go.textContent = l.resume;
  const result = document.createElement("span");
  result.setAttribute("aria-live", "polite");
  go.addEventListener("click", async () => {
    const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
    if (!token) { result.textContent = ` ${l.remakeFailed} ${l.token}`; return; }
    go.disabled = true;
    result.textContent = " …";
    try {
      const body = budget.value ? { budgetUsd: Number(budget.value) } : {};
      const res = await fetch(`/api/films/${id}/resume`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({ error: l.notConnected }));
      result.textContent = r.ok ? ` ${l.resumed}` : ` ${l.remakeFailed} ${r.error ?? res.status}`;
      if (r.ok) setTimeout(() => poll(id), 3000);
    } catch (error) {
      result.textContent = ` ${l.remakeFailed} ${error instanceof Error ? error.message : error}`;
    } finally {
      go.disabled = false;
    }
  });
  const hint = document.createElement("span");
  hint.className = "muted small";
  hint.textContent = ` ${l.resumeHint}`;
  wrap.append(label, go, result, hint);
  return wrap;
}

/** Start the GitHub render of a finished film. @param {string} id */
function renderButton(id) {
  const l = L();
  const wrap = document.createElement("p");
  const go = document.createElement("button");
  go.type = "button";
  go.className = "go";
  go.textContent = l.render;
  const result = document.createElement("span");
  result.setAttribute("aria-live", "polite");
  // A film Bossism blocked is released only with the owner's written reason, which goes on the record.
  const reason = document.createElement("textarea");
  reason.rows = 2;
  reason.placeholder = l.overrideReason;
  reason.hidden = true;
  const anyway = document.createElement("button");
  anyway.type = "button";
  anyway.className = "ghost";
  anyway.textContent = l.overrideGo;
  anyway.hidden = true;
  const send = async (/** @type {any} */ body) => {
    const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
    if (!token) { result.textContent = ` ${l.remakeFailed} ${l.token}`; return; }
    go.disabled = true;
    anyway.disabled = true;
    result.textContent = " …";
    try {
      const res = await fetch(`/api/films/${id}/render`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      const r = await res.json().catch(() => ({ error: l.notConnected }));
      result.replaceChildren();
      if (res.status === 409 && r.message) {
        result.textContent = ` ${lang() === "bn" ? r.message.bn : r.message.en}`;
        reason.hidden = false;
        anyway.hidden = false;
        return;
      }
      if (r.ok && r.on === "worker") {
        reason.hidden = true;
        anyway.hidden = true;
        result.textContent = ` ${l.queue}: ${r.job?.kind ?? "render"} · ${lang() === "bn" ? r.job?.message?.bn ?? "" : r.job?.message?.en ?? ""}`;
      } else if (r.ok) {
        reason.hidden = true;
        anyway.hidden = true;
        const a = document.createElement("a");
        a.href = r.actionsUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = r.actionsUrl;
        result.append(` ${l.renderStarted} `, a);
      } else {
        result.textContent = ` ${l.remakeFailed} ${r.error ?? res.status}`;
      }
    } catch (error) {
      result.textContent = ` ${l.remakeFailed} ${error instanceof Error ? error.message : error}`;
    } finally {
      go.disabled = false;
      anyway.disabled = false;
    }
  };
  go.addEventListener("click", () => send({}));
  anyway.addEventListener("click", () => send({ override: true, reason: reason.value.trim() }));
  // Or on the owner's own computer: the film stays there, nothing is published.
  const here = document.createElement("button");
  here.type = "button";
  here.className = "ghost";
  here.textContent = l.renderHere;
  here.addEventListener("click", () => send({ on: "worker" }));
  wrap.append(go, here, result, reason, anyway);
  return wrap;
}

/** The owner's re-make of one scene, through the token-protected API. @param {string} id */
function remakeForm(id) {
  const l = L();
  const form = document.createElement("form");
  form.className = "card";
  form.noValidate = true;
  const title = document.createElement("h4");
  title.textContent = l.remake;
  const hint = document.createElement("p");
  hint.className = "small";
  hint.textContent = l.remakeHint;
  const field = (/** @type {string} */ label, /** @type {HTMLInputElement | HTMLTextAreaElement} */ input) => { const w = document.createElement("label"); w.append(label, input); return w; };
  const scene = document.createElement("input");
  scene.required = true;
  scene.pattern = "[Ss][Cc][0-9]{4,5}";
  scene.placeholder = "SC0012";
  scene.autocomplete = "off";
  const what = document.createElement("textarea");
  what.required = true;
  what.maxLength = 2000;
  what.rows = 3;
  what.dir = "auto";
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "go";
  go.textContent = l.remakeGo;
  const result = document.createElement("p");
  result.setAttribute("aria-live", "polite");
  form.append(title, hint, field(l.remakeScene, scene), field(l.remakeWhat, what), go, result);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
    if (!/^sc\d{4,5}$/i.test(scene.value.trim()) || what.value.trim().length < 3 || !token) { result.textContent = `${l.remakeFailed} ${l.remakeScene} / ${l.remakeWhat} / ${l.token}`; return; }
    go.disabled = true;
    result.textContent = "…";
    try {
      const res = await fetch(`/api/films/${id}/scenes/${scene.value.trim().toUpperCase()}`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ instruction: what.value.trim() }) });
      const r = await res.json().catch(() => ({ error: l.notConnected }));
      result.textContent = r.ok ? `${l.remakeDone} $${r.costUsd}. ${r.after}` : `${l.remakeFailed} ${r.error ?? res.status}`;
    } catch (error) {
      result.textContent = `${l.remakeFailed} ${error instanceof Error ? error.message : error}`;
    } finally {
      go.disabled = false;
    }
  });
  return form;
}

/**
 * Learn from the published film: its YouTube retention, tied to its scenes.
 * @param {string} id
 */
function learnForm(id) {
  const l = L();
  const form = document.createElement("form");
  form.className = "card";
  form.noValidate = true;
  const title = document.createElement("h4");
  title.textContent = l.learn;
  const hint = document.createElement("p");
  hint.className = "small";
  hint.textContent = l.learnHint;
  const video = document.createElement("input");
  video.type = "url";
  video.placeholder = "https://youtu.be/...";
  const label = document.createElement("label");
  label.append(l.learnVideo, video);
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "go";
  go.textContent = l.learnGo;
  const connect = document.createElement("button");
  connect.type = "button";
  connect.textContent = l.learnConnect;
  const result = document.createElement("p");
  result.setAttribute("aria-live", "polite");
  const token = () => /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
  connect.addEventListener("click", async () => {
    if (!token()) { result.textContent = `${l.remakeFailed} ${l.token}`; return; }
    const res = await fetch("/api/youtube/connect", { headers: { authorization: `Bearer ${token()}` } }).catch(() => null);
    const r = res ? await res.json().catch(() => ({})) : { error: l.notConnected };
    if (r.url && /^https:\/\/accounts\.google\.com\//.test(r.url)) window.open(r.url, "_blank", "noopener");
    else result.textContent = `${l.remakeFailed} ${r.error ?? l.notConnected}`;
  });
  form.append(title, hint, label, go, connect, result);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (!video.value.trim() || !token()) { result.textContent = `${l.remakeFailed} ${l.learnVideo} / ${l.token}`; return; }
    go.disabled = true;
    result.textContent = "…";
    try {
      const res = await fetch(`/api/films/${id}/retention`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token()}` }, body: JSON.stringify({ video: video.value.trim() }) });
      const r = await res.json().catch(() => ({ error: l.notConnected }));
      result.textContent = r.ok ? `${l.learnDone} ${r.report.at30 ?? "?"}%, 1:00 ${r.report.at60 ?? "?"}%, ${r.report.drops} drops, ${r.report.holds} holds.` : `${l.remakeFailed} ${r.error ?? res.status}`;
    } catch (error) {
      result.textContent = `${l.remakeFailed} ${error instanceof Error ? error.message : error}`;
    } finally {
      go.disabled = false;
    }
  });
  return form;
}

/**
 * The owner's own picture for one shot: a link he chose, downloaded by the render.
 * @param {string} id
 */
function pictureForm(id) {
  const l = L();
  const form = document.createElement("form");
  form.className = "card";
  form.noValidate = true;
  const title = document.createElement("h4");
  title.textContent = l.picture;
  const hint = document.createElement("p");
  hint.className = "small";
  hint.textContent = l.pictureHint;
  const field = (/** @type {string} */ label, /** @type {HTMLInputElement} */ input) => { const w = document.createElement("label"); w.append(label, input); return w; };
  const shot = document.createElement("input");
  shot.placeholder = "SC0012-1";
  shot.autocomplete = "off";
  const link = document.createElement("input");
  link.type = "url";
  link.placeholder = "https://";
  link.maxLength = 2000;
  const go = document.createElement("button");
  go.type = "submit";
  go.className = "go";
  go.textContent = l.pictureGo;
  const result = document.createElement("p");
  result.setAttribute("aria-live", "polite");
  form.append(title, hint, field(l.pictureShot, shot), field(l.pictureUrl, link), go, result);
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
    if (!/^sc\d{4,5}(-\d{1,2})?$/i.test(shot.value.trim()) || !token) { result.textContent = `${l.remakeFailed} ${l.pictureShot} / ${l.token}`; return; }
    go.disabled = true;
    result.textContent = "…";
    try {
      const res = await fetch(`/api/films/${id}/pictures`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ shot: shot.value.trim(), url: link.value.trim() }) });
      const r = await res.json().catch(() => ({ error: l.notConnected }));
      result.textContent = r.ok ? (r.removed ? l.pictureRemoved : `${l.pictureDone} ${r.count}`) : `${l.remakeFailed} ${r.error ?? res.status}`;
    } catch (error) {
      result.textContent = `${l.remakeFailed} ${error instanceof Error ? error.message : error}`;
    } finally {
      go.disabled = false;
    }
  });
  return form;
}

document.addEventListener("DOMContentLoaded", () => {
  /** @type {HTMLInputElement} */ ($("film-token")).value = store.get("studio-token") ?? "";
  $("film-form").addEventListener("submit", start);
  $("film-minutes").addEventListener("input", showEstimate);
  $("film-list-btn").addEventListener("click", showFilms);
  $("ideas-go").addEventListener("click", findIdeas);
  // Enter in the niche box searches; it must not start a film.
  $("ideas-q").addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); findIdeas(); } });
  $("film-topic").addEventListener("input", () => { if (idea && idea.topic !== /** @type {HTMLInputElement} */ ($("film-topic")).value.trim()) idea = null; });
  // AI scenes are on by default for invented stories only; the owner can change it for any film.
  const syncAi = () => { /** @type {HTMLInputElement} */ ($("film-ai")).checked = /** @type {HTMLSelectElement} */ ($("film-format")).value === "dramatized-story"; };
  $("film-format").addEventListener("change", syncAi);
  syncAi();
  for (const b of document.querySelectorAll("[data-lang]")) b.addEventListener("click", () => setTimeout(render, 0));
  render();
});
