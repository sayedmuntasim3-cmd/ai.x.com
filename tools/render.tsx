// Renders ../page.tsx to a static ../public/index.html for Cloudflare Workers static assets.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import Page, { metadata } from "../page";

const outDir = resolve(__dirname, "../public");

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const title = escape(String(metadata.title));
const description = escape(String(metadata.description));
const canonical = escape(String(metadata.alternates?.canonical ?? ""));

// The page carries English and Bangla; one is shown. The choice is remembered on this device only.
const langHead = `<script>(function(){try{var l=localStorage.getItem("zupona-lang");if(l!=="en"&&l!=="bn"){l=/^bn/i.test(navigator.language||"")?"bn":"en"}var d=document.documentElement;d.setAttribute("data-lang",l);d.lang=l}catch(e){}})()</script>`;
const langBody = `<script>(function(){var d=document.documentElement;function sync(){var l=d.getAttribute("data-lang")||"en";document.querySelectorAll("[data-set-lang]").forEach(function(b){b.setAttribute("aria-pressed",String(b.getAttribute("data-set-lang")===l))})}document.querySelectorAll("[data-set-lang]").forEach(function(b){b.addEventListener("click",function(){var l=b.getAttribute("data-set-lang");d.setAttribute("data-lang",l);d.lang=l;try{localStorage.setItem("zupona-lang",l)}catch(e){}sync()})});sync()})()</script>`;

const html = `<!doctype html>
<html lang="en" data-lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ""}<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#080b0a">
${langHead}
<link rel="stylesheet" href="/styles.css">
</head>
<body class="bg-[#080b0a] antialiased">
${renderToStaticMarkup(<Page />)}
${langBody}
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);
console.log(`Wrote ${resolve(outDir, "index.html")}`);
