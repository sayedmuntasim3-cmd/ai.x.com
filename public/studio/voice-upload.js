// Voiceover tab: send the chosen recording to the studio's film machines (worker/voice-api.mjs)
// and follow the film. The recording stays private; its words are the script, unchanged.
const $ = (s) => document.querySelector(s);
const T = {
  en: { make: "Make the film on the studio's machines", key: "Studio key", up: (p) => `Uploading… ${p}%`, start: "Starting…", noFile: "Choose a recording first.", noKey: "Enter your studio key.", badKey: "That studio key is not right.", surah: "The surah is a number from 1 to 114, or leave it empty and the recording is read for you.", dl: "Download the film", review: "A Quran film is never published before a qualified scholar has reviewed it.", stopped: "Stopped", net: "No connection. Try again." },
  bn: { make: "স্টুডিওর মেশিনে ফিল্ম বানান", key: "স্টুডিও কী", up: (p) => `আপলোড হচ্ছে… ${p}%`, start: "শুরু হচ্ছে…", noFile: "আগে একটি রেকর্ডিং বেছে নিন।", noKey: "স্টুডিও কী দিন।", badKey: "স্টুডিও কী ঠিক নয়।", surah: "সূরা ১ থেকে ১১৪-এর মধ্যে একটি সংখ্যা, অথবা খালি রাখুন—রেকর্ডিং পড়ে সূরাগুলো খুঁজে নেওয়া হবে।", dl: "ফিল্ম ডাউনলোড করুন", review: "কুরআনের ফিল্ম একজন যোগ্য আলেমের রিভিউ ছাড়া কখনো প্রকাশ হয় না।", stopped: "থেমে গেছে", net: "সংযোগ নেই। আবার চেষ্টা করুন।" },
};
const lang = () => (document.documentElement.lang === "bn" ? "bn" : "en");
const t = (k, ...a) => { const v = T[lang()][k]; return typeof v === "function" ? v(...a) : v; };
const read = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

function init() {
  const form = $("#voice-form");
  if (!form) return;
  const box = document.createElement("div");
  box.className = "voice-make";
  box.innerHTML = `<label class="row"><span class="vk-label"></span><input id="vk-key" type="password" autocomplete="current-password"></label><button type="button" class="go" id="vk-go"></button><div id="vk-out" aria-live="polite"></div>`;
  form.appendChild(box);
  const key = $("#vk-key"), go = $("#vk-go"), out = $("#vk-out");
  key.value = read("zupona:studio-key") || read("studio-token");
  const label = () => { box.querySelector(".vk-label").textContent = t("key"); if (!go.disabled) go.textContent = t("make"); };
  new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  label();
  const say = (text, error) => { out.textContent = ""; const p = document.createElement("p"); p.className = error ? "error" : "status"; p.textContent = text; out.appendChild(p); };

  const follow = async (id) => {
    const res = await fetch(`/api/voice/${id}`, { headers: { authorization: `Bearer ${key.value.trim()}` }, cache: "no-store" }).catch(() => null);
    if (!res?.ok) return setTimeout(() => follow(id), 15000);
    const v = await res.json();
    out.textContent = "";
    const ol = document.createElement("ol");
    for (const p of v.progress) { const li = document.createElement("li"); li.textContent = p.message[lang()]; if (!p.ok) li.className = "error"; ol.appendChild(li); }
    out.appendChild(ol);
    if (v.status === "awaiting-review") { const p = document.createElement("p"); p.className = "muted small"; p.textContent = t("review"); out.appendChild(p); }
    if (v.download) { const a = document.createElement("a"); a.href = v.download; a.className = "go"; a.textContent = t("dl"); out.appendChild(a); }
    if (!["done", "awaiting-review", "failed"].includes(v.status)) setTimeout(() => follow(id), 10000);
  };
  const last = read("studio-voice-id");
  if (last && key.value) follow(last);

  go.addEventListener("click", async () => {
    const file = $("#file").files[0];
    if (!file) return say(t("noFile"), true);
    const studioKey = key.value.trim();
    if (!studioKey) return say(t("noKey"), true);
    const quran = $("#ctype").value === "quran_recitation";
    // A surah may be left empty: the film machine then reads the recording and finds
    // every surah and ayah itself, across surah boundaries, asking rather than guessing.
    const asked = $("#q-surah").value.trim();
    const surah = Number((asked.match(/^\s*(\d{1,3})\s*$/) || [])[1]);
    if (quran && asked && !(surah >= 1 && surah <= 114)) return say(t("surah"), true);
    go.disabled = true; go.textContent = t("start");
    try {
      const auth = { authorization: `Bearer ${studioKey}` };
      const res = await fetch("/api/voice", { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, bytes: file.size, kind: quran ? "quran" : "narration", ...(quran ? { ...(asked ? { surah } : {}), ayat: $("#q-ayat").value.trim(), reciter: $("#q-reciter").value.trim() } : {}) }) });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) return say(t("badKey"), true);
      if (!res.ok) return say(data.error || res.status, true);
      write("zupona:studio-key", studioKey);
      const parts = [];
      for (let n = 1; n <= data.parts; n += 1) {
        let done = null;
        for (let attempt = 1; attempt <= 4 && !done; attempt += 1) {
          const r = await fetch(`/api/voice/${data.id}/parts/${n}`, { method: "PUT", headers: auth, body: file.slice((n - 1) * data.partSize, n * data.partSize) }).catch(() => null);
          if (r?.ok) done = await r.json(); else await new Promise((w) => setTimeout(w, 1500 * attempt));
        }
        if (!done) throw new Error(t("net"));
        parts.push(done);
        go.textContent = t("up", Math.round((n / data.parts) * 100));
      }
      await fetch(`/api/voice/${data.id}/complete`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ parts }) });
      write("studio-voice-id", data.id);
      follow(data.id);
    } catch (e) {
      say(e?.message || t("net"), true);
    } finally {
      go.disabled = false; label();
    }
  });
}
init();
