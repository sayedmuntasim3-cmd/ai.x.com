// Zupona AI Studio: make the full film (English, USA) through the film API.
// The price is shown before anything starts; the run is protected by the
// owner's studio token, which stays in this browser only.
import { estimateRun } from "./engine/film-run.mjs";
import { FORMATS } from "./engine/formats.mjs";

/** Format names in Bangla (the English names come from formats.mjs). */
const FORMAT_BN = {
  "true-story-reenactment": "সত্য ঘটনার পুনর্নির্মাণ",
  "rags-to-riches": "শূন্য থেকে শীর্ষে, শীর্ষ থেকে পতন",
  "motivational-life-story": "অনুপ্রেরণার সত্যিকারের জীবনকাহিনি",
  "place-nobody-can-visit": "যেখানে কেউ যেতে পারে না",
  "deadliest-journey": "সবচেয়ে বিপজ্জনক যাত্রা",
  "history-epic": "ইতিহাসের মহাকাব্য",
  "history-in-minutes": "কয়েক মিনিটে পুরো ইতিহাস",
  "other-side": "বিখ্যাত ঘটনার অন্য দিক",
  "inner-circle": "ভেতরের মানুষদের উত্থান, বিশ্বাসঘাতকতা ও পতন",
  "dark-business-expose": "ব্যবসার অন্ধকার দিক",
  "money-explainer": "টাকা আসলে কীভাবে কাজ করে",
  "big-question-science": "বিজ্ঞানের বড় প্রশ্ন",
  "mystery-investigation": "রহস্যের অনুসন্ধান",
  "numbered-compilation": "নম্বর দেওয়া সংকলন",
  "dramatized-story": "আইডিয়া থেকে নিজস্ব গল্প",
};

const T = {
  bn: {
    title: "পুরো ফিল্ম বানাও (English, USA)",
    lead: "বিষয় দিলে ইঞ্জিন নিজে রিসার্চ, তথ্য যাচাই, স্ক্রিপ্ট, শট লিস্ট, QA আর পাবলিশিং প্যাক বানাবে। প্রতিটি চ্যাপ্টার কোড দিয়ে যাচাই হয়।",
    topic: "বিষয় (ইংরেজিতে বা বাংলায়)",
    minutes: "দৈর্ঘ্য (মিনিট)",
    format: "ভিডিওর ধরন",
    formatAuto: "বিষয় দেখে নিজে বেছে নাও",
    formatPlain: "সাধারণ ডকুমেন্টারি",
    ai: "গল্পের চরিত্র AI দৃশ্যে দেখাও (একই চেহারা সব দৃশ্যে; আসল কোনো মানুষ নয়; YouTube Studio-তে ঘোষণা, স্ক্রিনে কিছু লেখা নয়)",
    token: "স্টুডিও টোকেন",
    tokenHint: "Cloudflare-এ যে STUDIO_TOKEN দিয়েছেন। শুধু এই ব্রাউজারে থাকে।",
    estimate: "আনুমানিক খরচ",
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
    footage: "ফুটেজ",
    gaps: "বাকি কাজ (GAP)",
    stages: { s01: "S0–S1 টাইটেল ও প্ল্যান", research: "ওয়েব রিসার্চ", s2: "S2 তথ্যের খাতা", s3: "S3 গল্পের কাঠামো", s4: "S4 বাইবেল", qa: "QA ও সংশোধন", s6: "S6 রিপোর্ট", s7: "S7 পাবলিশিং প্যাক" },
  },
  en: {
    title: "Make the full film (English, USA)",
    lead: "Give a topic and the engine researches, fact-checks and writes the script, shot list, QA and publishing pack. Every chapter is checked in code.",
    topic: "Topic",
    minutes: "Length (minutes)",
    format: "Kind of film",
    formatAuto: "Choose from the topic",
    formatPlain: "General documentary",
    ai: "Show the story's characters in AI scenes (the same look in every scene; never a real person; disclosed in YouTube Studio, nothing on screen)",
    token: "Studio token",
    tokenHint: "The STUDIO_TOKEN you set in Cloudflare. It stays in this browser only.",
    estimate: "Estimated cost",
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
    footage: "Footage",
    gaps: "Open items (GAPs)",
    stages: { s01: "S0–S1 titles and plan", research: "Web research", s2: "S2 claim ledger", s3: "S3 story architecture", s4: "S4 bibles", qa: "QA and fixes", s6: "S6 report", s7: "S7 publishing pack" },
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
  select.replaceChildren(option("auto", l.formatAuto), option("", l.formatPlain), ...FORMATS.map((f) => option(f.id, lang() === "bn" ? FORMAT_BN[/** @type {keyof typeof FORMAT_BN} */ (f.id)] ?? f.name : f.name)));
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

function showEstimate() {
  const minutes = Number(/** @type {HTMLInputElement} */ ($("film-minutes")).value);
  if (!(minutes >= 1 && minutes <= 300)) { $("film-estimate").textContent = ""; return; }
  const e = estimateRun(Math.round(minutes * 60));
  $("film-estimate").textContent = `${L().estimate}: $${e.usdLow}–$${e.usdHigh} (${e.chapters} ch, ${e.model})`;
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
    const res = await fetch("/api/films", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ topic, minutes, versionId: "en-US", formatId, allowAi }) });
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
async function poll(/** @type {string} */ id) {
  clearTimeout(timer);
  try {
    const res = await fetch(`/api/films/${id}`);
    if (!res.ok) return;
    const { run } = await res.json();
    showRun(id, run);
    if (run.status === "running" || !run.status) timer = window.setTimeout(() => poll(id), 15000);
  } catch { /* offline: try again on the next visit */ }
}

function showRun(/** @type {string} */ id, /** @type {any} */ run) {
  const l = L();
  const out = $("film-out");
  out.replaceChildren();
  const h = (/** @type {string} */ tag, /** @type {string} */ text) => { const e = document.createElement(tag); e.textContent = text; return e; };
  out.append(h("h3", `${run.film?.topic ?? ""} · ${l.status}: ${run.status ?? "queued"}`));
  out.append(h("p", `${l.spent}: $${run.costUsd ?? 0}`));
  const list = document.createElement("ul");
  for (const [stage, info] of Object.entries(run.stages ?? {})) {
    const label = stage.startsWith("s5:") ? `S5 ${stage.slice(3)}` : stage.startsWith("media:") ? `${l.footage} ${stage.slice(6)}` : l.stages[stage] ?? stage;
    list.append(h("li", `✓ ${label}${info.result && info.result.ok === false ? " (GAP)" : ""}`));
  }
  out.append(list);
  if (run.gaps?.length) {
    out.append(h("h4", l.gaps));
    const g = document.createElement("ul");
    for (const x of run.gaps.slice(0, 20)) g.append(h("li", x));
    out.append(g);
  }
  const stages = Object.keys(run.stages ?? {});
  const files = ["s01.md", "research.json", "s2.md", "s3.md", "s4.md", ...stages.filter((s) => s.startsWith("s5:")).map((s) => `s5-${s.slice(3)}.md`), "qa.json", ...stages.filter((s) => s.startsWith("media:")).map((s) => `media-${s.slice(6)}.json`), "s6.md", "s7.md"];
  const page = document.createElement("a");
  page.href = `/api/films/${id}/page`;
  page.textContent = l.page;
  page.target = "_blank";
  page.rel = "noopener";
  page.className = "go";
  out.append(page);
  if (run.status === "done" || run.status === "done-with-gaps") out.append(renderButton(id), remakeForm(id));
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
  go.addEventListener("click", async () => {
    const token = /** @type {HTMLInputElement} */ ($("film-token")).value.trim();
    if (!token) { result.textContent = ` ${l.remakeFailed} ${l.token}`; return; }
    go.disabled = true;
    result.textContent = " …";
    try {
      const res = await fetch(`/api/films/${id}/render`, { method: "POST", headers: { authorization: `Bearer ${token}` } });
      const r = await res.json().catch(() => ({ error: l.notConnected }));
      result.replaceChildren();
      if (r.ok) {
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
    }
  });
  wrap.append(go, result);
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

document.addEventListener("DOMContentLoaded", () => {
  /** @type {HTMLInputElement} */ ($("film-token")).value = store.get("studio-token") ?? "";
  $("film-form").addEventListener("submit", start);
  $("film-minutes").addEventListener("input", showEstimate);
  $("film-list-btn").addEventListener("click", showFilms);
  // AI scenes are on by default for invented stories only; the owner can change it for any film.
  const syncAi = () => { /** @type {HTMLInputElement} */ ($("film-ai")).checked = /** @type {HTMLSelectElement} */ ($("film-format")).value === "dramatized-story"; };
  $("film-format").addEventListener("change", syncAi);
  syncAi();
  for (const b of document.querySelectorAll("[data-lang]")) b.addEventListener("click", () => setTimeout(render, 0));
  render();
});
