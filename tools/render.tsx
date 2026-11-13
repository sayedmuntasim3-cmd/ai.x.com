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
const themeScript = `(function(){try{var t=localStorage.getItem("zupona:theme");if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t;var c=t==="dark"?"#262624":"#FAF9F5";document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})}}catch(e){}})();`;

const fonts =
  "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300..700;1,9..40,400..500&family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..600&display=swap";

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M3 3.2 12 10.2h8l9-7-1.6 13.4L16 28.6 4.6 16.6z" fill="#D97757"/><path d="M3 3.2 12 10.2 8.2 13z M29 3.2 20 10.2 23.8 13z" fill="#B85532"/><path d="M8.6 17.4 16 21.2l7.4-3.8L16 28.6z" fill="#FAF9F5"/><path d="M10.4 14.6l2.6 1.1-2.4.9zM21.6 14.6 19 15.7l2.4.9z" fill="#141413"/></svg>`;

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
<meta name="theme-color" content="#FAF9F5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#262624" media="(prefers-color-scheme: dark)">
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
