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

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ""}<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="theme-color" content="#080b0a">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="bg-[#080b0a] antialiased">
${renderToStaticMarkup(<Page />)}
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);
console.log(`Wrote ${resolve(outDir, "index.html")}`);
