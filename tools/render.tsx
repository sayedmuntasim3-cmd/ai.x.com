// Renders ../page.tsx to a static ../public/index.html for Cloudflare Workers static assets.
// The markup is hydrated in the browser by ../public/app.js (built from ../src/client.tsx).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToString } from "react-dom/server";
import Page, { metadata } from "../page";

const outDir = resolve(__dirname, "../public");

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const title = escape(String(metadata.title));
const description = escape(String(metadata.description));
const canonical = escape(String(metadata.alternates?.canonical ?? ""));

// Runs before first paint so a saved light/dark choice never flashes the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem("zupona:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var c=t==="dark"?"#0C0C12":"#FAF8F3";document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})}}catch(e){}})();`;

const fonts =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,400..500&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&display=swap";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B63F6"/><stop offset=".42" stop-color="#7A3BEE"/><stop offset=".72" stop-color="#EA3A8C"/><stop offset="1" stop-color="#FF7A1E"/></linearGradient></defs><path d="M7 4l16 17 9-2 9 2L57 4l-3 24 7 7-12 9-17 16-17-16L3 35l7-7z" fill="url(#g)"/><path d="M16 35l11 3.5-1 3-9-3.5zM48 35l-11 3.5 1 3 9-3.5zM27 46h10l-5 6z" fill="#0C0C12"/></svg>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="Zupona AI">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
${canonical ? `<meta property="og:url" content="${canonical}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#FAF8F3" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0C0C12" media="(prefers-color-scheme: dark)">
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<script>${themeScript}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<link rel="stylesheet" href="/styles.css">
<script type="module" src="/app.js"></script>
</head>
<body>
<div id="root">${renderToString(<Page />)}</div>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);
writeFileSync(resolve(outDir, "favicon.svg"), favicon);
console.log(`Wrote ${resolve(outDir, "index.html")}`);
