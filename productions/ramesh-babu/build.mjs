// Builds one self-contained page and one markdown file per version, never mixing the two.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
// Needs the "marked" package: run `npm install marked` in this folder first.
const require = createRequire(import.meta.url);
const { marked } = require("marked");

const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const md = (s) => marked.parse(s ?? "", { gfm: true }).replace(/<table>/g, '<div class="table-frame"><table>').replace(/<\/table>/g, "</table></div>");

const UI = {
  USA: {
    file: "ramesh-babu-usa",
    lang: "en",
    title: "Barber to Rolls-Royce (USA)",
    eyebrow: "Zupona AI Studio · Production package · Version 1 · USA · American English",
    h1: "Ramesh Babu: From Barber to Rolls-Royce",
    lede: "Complete S0–S7 production package for a 45-minute documentary built only from free stock footage (Pexels, Pixabay, Videvo, Coverr, Mixkit), graded and sound-designed to a broadcast finish.",
    nav: ["S0–S1 Plan & packaging", "S2 Claim ledger", "S3 Structure", "S4 Bibles", "S5 Script & scenes", "S6 QA report", "S7 Publishing"],
    copy: "Copy", copied: "Copied ✓", selected: "Selected, press copy",
    s5: "Chapter",
    download: "The full package is also attached as a Markdown file.",
  },
  Bangladesh: {
    file: "ramesh-babu-bangladesh",
    lang: "bn",
    title: "নাপিত থেকে রোলস-রয়েস (বাংলাদেশ)",
    eyebrow: "Zupona AI Studio · প্রোডাকশন প্যাকেজ · সংস্করণ ২ · বাংলাদেশ · বাংলা",
    h1: "রমেশ বাবু: নাপিত থেকে রোলস-রয়েস",
    lede: "শুধু ফ্রি স্টক ফুটেজ (Pexels, Pixabay, Videvo, Coverr, Mixkit) দিয়ে বানানো ৪৫ মিনিটের ডকুমেন্টারির পূর্ণ S0–S7 প্রোডাকশন প্যাকেজ, ব্রডকাস্ট মানের কালার গ্রেড আর সাউন্ড ডিজাইনসহ।",
    nav: ["S0–S1 পরিকল্পনা ও প্যাকেজিং", "S2 তথ্যের খাতা", "S3 কাঠামো", "S4 বাইবেল", "S5 স্ক্রিপ্ট ও দৃশ্য", "S6 QA রিপোর্ট", "S7 প্রকাশ"],
    copy: "কপি করুন", copied: "কপি হয়েছে ✓", selected: "সিলেক্ট হয়েছে, কপি চাপুন",
    s5: "অধ্যায়",
    download: "পুরো প্যাকেজটা একটা Markdown ফাইল হিসেবেও দেওয়া হয়েছে।",
  },
};

const css = readFileSync(new URL("./page.css", import.meta.url), "utf8");
mkdirSync("out", { recursive: true });

for (const v of result.versions) {
  const ui = UI[v.version];
  const ids = ["s01", "s2", "s3", "s4", "s5", "s6", "s7"];
  const sections = [v.s01, v.s2, v.s3, v.s4, null, v.s6, v.s7];
  const chapterBlocks = v.s5.map((c, i) => `<details class="chapter"${i === 0 ? " open" : ""}><summary><span>${esc(c.id)} · ${esc(c.title)}</span><button type="button" class="copy" data-copy="ch${i}">${ui.copy}</button></summary><div class="md" id="ch${i}">${md(c.markdown)}</div></details>`).join("\n");
  const body = ids.map((id, i) => `<section id="${id}"><div class="section-head"><h2>${esc(ui.nav[i])}</h2></div>${id === "s5" ? `<div class="stack">${chapterBlocks}</div>` : `<div class="md card">${md(sections[i])}</div>`}</section>`).join("\n");
  const html = `<title>${esc(ui.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,600..800&family=Hind+Siliguri:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>${css}</style>
<div class="wrap" lang="${ui.lang}">
<header class="head">
  <p class="eyebrow">${esc(ui.eyebrow)}</p>
  <h1>${esc(ui.h1)}</h1>
  <p class="lede">${esc(ui.lede)}</p>
  <nav class="toc">${ids.map((id, i) => `<a href="#${id}">${esc(ui.nav[i])}</a>`).join("")}</nav>
  <p class="small">${esc(ui.download)}</p>
</header>
${body}
</div>
<script>
document.querySelectorAll('button.copy').forEach(function (b) {
  b.addEventListener('click', function (e) {
    e.preventDefault(); e.stopPropagation();
    var t = document.getElementById(b.getAttribute('data-copy'));
    var done = function () { b.textContent = ${JSON.stringify(ui.copied)}; setTimeout(function () { b.textContent = ${JSON.stringify(ui.copy)}; }, 1800); };
    var fb = function () { var d = b.closest('details'); if (d) d.open = true; var r = document.createRange(); r.selectNodeContents(t); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = ${JSON.stringify(ui.selected)}; };
    try { navigator.clipboard.writeText(t.innerText).then(done, fb); } catch (err) { fb(); }
  });
});
</script>`;
  writeFileSync(`${ui.file}.html`, html);
  const mdFile = [v.s01, v.s2, v.s3, v.s4, ...v.s5.map((c) => c.markdown), v.s6, v.s7].join("\n\n---\n\n");
  writeFileSync(`out/${ui.file}.md`, mdFile);
  console.log(v.version, Math.round(html.length / 1024) + " KB html", Math.round(mdFile.length / 1024) + " KB md", "chapters", v.s5.length, "qa fixes", v.qa?.mustFix);
}
