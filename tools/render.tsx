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
const siteName = escape(String((metadata.openGraph as { siteName?: string } | undefined)?.siteName ?? ""));

const structuredData = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: (metadata.openGraph as { siteName?: string } | undefined)?.siteName,
  url: metadata.alternates?.canonical,
  description: metadata.description,
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web",
}).replace(/</g, "\\u003c");

const fonts =
  "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ""}<meta property="og:type" content="website">
${canonical ? `<meta property="og:url" content="${canonical}">\n` : ""}${siteName ? `<meta property="og:site_name" content="${siteName}">\n` : ""}<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="theme-color" content="#07070B">
<meta name="color-scheme" content="dark">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fonts}">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${structuredData}</script>
</head>
<body>
${renderToStaticMarkup(<Page />)}
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, "index.html"), html);
console.log(`Wrote ${resolve(outDir, "index.html")}`);
