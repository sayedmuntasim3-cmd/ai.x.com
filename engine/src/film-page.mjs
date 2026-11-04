/**
 * The readable page of one film run, served at /api/films/:id/page.
 *
 * It answers what a creator asks of an AI video tool and rarely gets:
 * what did this cost, where does every fact come from, which clip goes in
 * every shot and under what licence, and what is still missing. Everything
 * is read from the run's own files; nothing is estimated here.
 *
 * Model output is untrusted text. Every string is escaped, links are only
 * http(s), and the page carries no script at all (PAGE_CSP forbids one),
 * because it is served from the same origin as the studio and its token.
 */
import { shotParts } from "./film-media.mjs";
import { parseSceneLines, toClock } from "./scene-lines.mjs";

/** Content-Security-Policy for the page: no scripts, images over https, Google Fonts. */
export const PAGE_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; base-uri 'none'; form-action 'none'; frame-ancestors 'self'";

const CSS = `
:root {
  --bg: #f4f6f3; --surface: #ffffff; --ink: #132019; --muted: #55645b; --line: #d6dfd8;
  --accent: #0c6b4c; --accent-soft: #e2f0e8; --warn: #8a5300; --warn-soft: #fbefd9; --bad: #a3261b; --bad-soft: #fbe3df;
  --code-bg: #0f1713; --code-fg: #dbe7df;
  --font-display: "Archivo", "Arial Narrow", system-ui, sans-serif;
  --font-body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { --bg: #0b110e; --surface: #121a16; --ink: #e4ede7; --muted: #9bada2; --line: #25332c; --accent: #8fd9a8; --accent-soft: #15271d; --warn: #f0c27a; --warn-soft: #2d2212; --bad: #f19a8f; --bad-soft: #2e1714; --code-bg: #070b09; --code-fg: #d6e4da; color-scheme: dark; }
}
:root[data-theme="dark"] { --bg: #0b110e; --surface: #121a16; --ink: #e4ede7; --muted: #9bada2; --line: #25332c; --accent: #8fd9a8; --accent-soft: #15271d; --warn: #f0c27a; --warn-soft: #2d2212; --bad: #f19a8f; --bad-soft: #2e1714; --code-bg: #070b09; --code-fg: #d6e4da; color-scheme: dark; }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.65 var(--font-body); padding-inline: max(16px, env(safe-area-inset-left, 0px)) max(16px, env(safe-area-inset-right, 0px)); overflow-wrap: anywhere; }
.wrap { max-width: 1080px; margin: 0 auto; padding-block: 40px 96px; display: grid; gap: 48px; }
h1, h2, h3, h4, h5, h6 { font-family: var(--font-display); font-stretch: 85%; line-height: 1.2; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(2rem, 6vw, 3.2rem); font-weight: 800; }
h2 { font-size: clamp(1.4rem, 3.4vw, 2rem); font-weight: 800; }
h3 { font-size: 1.25rem; font-weight: 700; } h4, h5, h6 { font-size: 1.05rem; font-weight: 700; }
p { margin: 0; }
a { color: var(--accent); }
section { display: grid; gap: 16px; min-width: 0; }
.head { display: grid; gap: 14px; }
.eyebrow { font: 500 0.75rem/1.4 var(--font-mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.lede { font-size: 1.08rem; color: var(--muted); max-width: 70ch; }
.small { font-size: 0.88rem; color: var(--muted); }
.toc { display: flex; flex-wrap: wrap; gap: 8px; }
.toc a { font: 500 0.86rem/1.2 var(--font-body); text-decoration: none; padding: 9px 11px; border: 1px solid var(--line); border-radius: 6px; color: var(--ink); background: var(--surface); }
.toc a:hover { border-color: var(--accent); color: var(--accent); }
.section-head { border-top: 2px solid var(--ink); padding-top: 14px; display: grid; gap: 6px; }
.card { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 20px; min-width: 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.tile { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); padding: 14px 16px; display: grid; gap: 2px; align-content: start; }
.tile b { font: 700 1.6rem/1.15 var(--font-display); font-stretch: 85%; font-variant-numeric: tabular-nums; }
.tile span { font-size: 0.85rem; color: var(--muted); }
.tile.ok b { color: var(--accent); } .tile.warn b { color: var(--warn); } .tile.bad b { color: var(--bad); }
.chip { display: inline-block; font: 500 0.76rem/1.3 var(--font-mono); padding: 3px 8px; border-radius: 999px; border: 1px solid var(--line); color: var(--muted); background: var(--surface); white-space: nowrap; }
.chip.ok { color: var(--accent); background: var(--accent-soft); border-color: transparent; }
.chip.warn { color: var(--warn); background: var(--warn-soft); border-color: transparent; }
.chip.bad { color: var(--bad); background: var(--bad-soft); border-color: transparent; }
.stages { display: flex; flex-wrap: wrap; gap: 6px; padding: 0; margin: 0; list-style: none; }
.gaps { margin: 0; padding-left: 20px; display: grid; gap: 4px; }
details.block { border: 1px solid var(--line); border-radius: 8px; background: var(--surface); min-width: 0; }
details.block > summary { cursor: pointer; padding: 14px 18px; font: 700 1.05rem/1.3 var(--font-display); font-stretch: 85%; }
details.block > .md, details.block > .scenes { padding: 0 18px 18px; }
.md { display: grid; gap: 12px; min-width: 0; }
.md ul, .md ol { margin: 0; padding-left: 22px; display: grid; gap: 4px; }
.md blockquote { margin: 0; padding: 4px 14px; border-left: 3px solid var(--line); color: var(--muted); }
.md hr { border: 0; border-top: 1px solid var(--line); margin: 4px 0; width: 100%; }
code { font: 0.86em/1.5 var(--font-mono); background: var(--accent-soft); padding: 1px 4px; border-radius: 4px; }
pre { margin: 0; background: var(--code-bg); color: var(--code-fg); padding: 14px; border-radius: 6px; overflow-x: auto; font: 0.84rem/1.55 var(--font-mono); }
pre code { background: none; padding: 0; color: inherit; }
.table-frame { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; max-width: 100%; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); min-width: 90px; }
th { background: var(--accent-soft); font-weight: 600; }
tr:last-child td { border-bottom: 0; }
.scenes { display: grid; gap: 12px; }
.scene { border: 1px solid var(--line); border-radius: 8px; padding: 14px 16px; display: grid; gap: 10px; background: var(--bg); min-width: 0; }
.scene-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font: 500 0.8rem/1.3 var(--font-mono); color: var(--muted); }
.scene-meta .sc { color: var(--ink); font-weight: 600; }
.narr { font-size: 1.04rem; max-width: 72ch; }
.narr.wordless { color: var(--muted); font-style: italic; }
.shots { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.shot { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; align-items: start; border-top: 1px dashed var(--line); padding-top: 8px; }
.shot-text { font-size: 0.9rem; }
.shot-media { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; grid-column: 1 / -1; font-size: 0.85rem; }
.thumb { width: 128px; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 4px; border: 1px solid var(--line); background: var(--line); display: block; }
@media (max-width: 560px) { .shot { grid-template-columns: 1fr; } .thumb { width: 100%; max-width: 320px; } }
details.notes > summary { cursor: pointer; font-size: 0.85rem; color: var(--muted); }
dl.fields { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 8px 0 0; font-size: 0.86rem; }
dl.fields dt { font: 600 0.78rem/1.6 var(--font-mono); color: var(--muted); }
dl.fields dd { margin: 0; min-width: 0; }
@media (max-width: 560px) { dl.fields { grid-template-columns: 1fr; } dl.fields dd { margin-bottom: 6px; } }
.facts td:first-child { min-width: 54px; font-family: var(--font-mono); font-size: 0.82rem; }
`;

/** @param {unknown} s */
export function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** An http(s) URL that is safe in an attribute, or null. @param {unknown} url */
export function safeUrl(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

/** @param {string} href @param {string} label */
const link = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>`;

/**
 * Inline markdown on escaped text: `code`, **bold**, *italic*, [label](url) and bare URLs.
 * @param {unknown} text
 */
export function inline(text) {
  return String(text ?? "").split(/(`[^`\n]+`)/).map((part, i) => {
    if (i % 2) return `<code>${esc(part.slice(1, -1))}</code>`;
    /** @type {string[]} */
    const links = [];
    // Links first, from the raw text, so a URL is never mangled by emphasis.
    const keep = (/** @type {string} */ html) => { links.push(html); return `\u0000${links.length - 1}\u0000`; };
    let s = part
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, label, url) => { const u = safeUrl(url); return u ? keep(link(u, esc(label))) : m; })
      .replace(/https?:\/\/[^\s<>"'`)\]]+/g, (m) => {
        const trail = /[.,;:!?]+$/.exec(m)?.[0] ?? "";
        const u = safeUrl(m.slice(0, m.length - trail.length));
        return u ? keep(link(u, esc(m.slice(0, m.length - trail.length)))) + trail : m;
      });
    s = esc(s)
      .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^\w*])\*([^*\s][^*\n]*?)\*(?![\w*])/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (_, n) => links[Number(n)]);
  }).join("");
}

const BLOCK_START = /^\s*(```|#{1,6}\s|>|\||([-*+]|\d+[.)])\s+|(-{3,}|\*{3,}|_{3,})\s*$)/;

/**
 * A small, safe markdown renderer for the run's stage files: headings
 * (shifted below the page's own), paragraphs, lists, tables, quotes, rules
 * and fenced code. Raw HTML is shown as text, never rendered.
 * @param {unknown} source
 */
export function markdown(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  /** @type {string[]} */
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (/^\s*```/.test(line)) {
      const body = [];
      for (i += 1; i < lines.length && !/^\s*```/.test(lines[i]); i += 1) body.push(lines[i]);
      i += 1;
      out.push(`<pre><code>${esc(body.join("\n"))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const level = Math.min(6, h[1].length + 2);
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push("<hr>"); i += 1; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      for (; i < lines.length && /^\s*\|/.test(lines[i]); i += 1) rows.push(lines[i]);
      out.push(table(rows));
      continue;
    }
    if (/^\s*>/.test(line)) {
      const body = [];
      for (; i < lines.length && /^\s*>/.test(lines[i]); i += 1) body.push(lines[i].replace(/^\s*>\s?/, ""));
      out.push(`<blockquote>${markdown(body.join("\n"))}</blockquote>`);
      continue;
    }
    const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
    if (item.test(line)) {
      const ordered = /^\s*\d/.test(line);
      /** @type {string[]} */
      const items = [];
      for (; i < lines.length; i += 1) {
        const m = item.exec(lines[i]);
        if (m) items.push(m[2]);
        else if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += " " + lines[i].trim();
        else break;
      }
      const tag = ordered ? "ol" : "ul";
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }
    const para = [];
    for (; i < lines.length && lines[i].trim() && (para.length === 0 || !BLOCK_START.test(lines[i])); i += 1) para.push(lines[i].trim());
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("\n");
}

/** @param {string[]} rows */
function table(rows) {
  const cells = (/** @type {string} */ r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const parsed = rows.map(cells);
  const sep = parsed.findIndex((r) => r.length > 0 && r.every((c) => /^:?-{2,}:?$/.test(c)));
  const head = sep === 1 ? parsed[0] : null;
  const body = parsed.filter((_, k) => k !== sep && !(head && k === 0));
  const tr = (/** @type {string[]} */ r, /** @type {string} */ tag) => `<tr>${r.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("")}</tr>`;
  return `<div class="table-frame"><table>${head ? `<thead>${tr(head, "th")}</thead>` : ""}<tbody>${body.map((r) => tr(r, "td")).join("")}</tbody></table></div>`;
}

/**
 * @typedef {import("./film-media.mjs").ChapterMedia} ChapterMedia
 * @typedef {import("./film-media.mjs").ShotMedia} ShotMedia
 * @typedef {{ id: string, title: string, start: string, end: string, firstScene?: string, lastScene?: string }} PlanChapter
 * @typedef {{ run: any, chapters: PlanChapter[], s5: Record<string, string>, media: Record<string, ChapterMedia>, research: any, filmCheck: any, qa: any, fixLog: any[] | null, docs: Record<string, string | null>, originality?: any, render?: any }} PageData
 */

const STAGE_LABEL = /** @type {Record<string, string>} */ ({ originality: "Originality", s01: "S0–S1 plan", research: "Research", s2: "S2 claim ledger", s3: "S3 structure", s4: "S4 bibles", qa: "QA", s6: "S6 report", s7: "S7 publishing" });
const STATUS_TONE = /** @type {Record<string, string>} */ ({ done: "ok", "done-with-gaps": "warn", failed: "bad", "stopped-budget": "warn" });
const STATUS_LABEL = /** @type {Record<string, string>} */ ({ done: "Done", "done-with-gaps": "Done*", failed: "Failed", "stopped-budget": "Paused", running: "Running", queued: "Queued" });

/**
 * Read everything the page shows from a run's store. Returns null when the
 * run does not exist.
 * @param {{ get(key: string): Promise<string | null> }} store
 * @returns {Promise<PageData | null>}
 */
export async function loadFilmPage(store) {
  const json = async (/** @type {string} */ key) => {
    const text = await store.get(key);
    if (text === null) return null;
    try { return JSON.parse(text); } catch { return null; }
  };
  const film = await json("film.json");
  const run = (await json("run.json")) ?? (film ? { film, stages: {}, status: "queued", costUsd: 0, gaps: [] } : null);
  if (!run) return null;
  const plan = await json("s3-chapters.json");
  const chapters = Array.isArray(plan) ? plan.filter((c) => c && typeof c.id === "string" && /^C\d{1,3}$/.test(c.id)) : [];
  /** @type {Record<string, string>} */
  const s5 = {};
  /** @type {Record<string, ChapterMedia>} */
  const media = {};
  await Promise.all(chapters.map(async (c) => {
    const text = await store.get(`s5-${c.id}.md`);
    if (text !== null) s5[c.id] = text;
    const m = await json(`media-${c.id}.json`);
    if (m && Array.isArray(m.shots)) media[c.id] = m;
  }));
  /** @type {Record<string, string | null>} */
  const docs = {};
  await Promise.all(["s01", "s2", "s3", "s4", "s6", "s7"].map(async (k) => { docs[k] = await store.get(`${k}.md`); }));
  const [research, filmCheck, qa, fixLog, originality, render] = await Promise.all([json("research.json"), json("film-check.json"), json("qa.json"), json("fix-log.json"), json("originality.json"), json("render.json")]);
  return { run, chapters, s5, media, research, filmCheck, qa, fixLog: Array.isArray(fixLog) ? fixLog : null, docs, originality, render };
}

/** @param {number} n */
const money = (n) => `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
/** @param {string} url */
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
/** @param {string} tone @param {string} text */
const chip = (tone, text) => `<span class="chip${tone ? " " + tone : ""}">${esc(text)}</span>`;
/** @param {string} value @param {string} label @param {string} [tone] */
const tile = (value, label, tone = "") => `<div class="tile${tone ? " " + tone : ""}"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

/**
 * One shot's footage: the pick with its licence, or why there is none.
 * @param {string} text @param {ShotMedia | undefined} row @param {boolean} searched
 */
function shotHtml(text, row, searched) {
  const rung = /^(?:\d+:\d{2}:\d{2}(?:\.\d+)?\s*[-–]\s*\d+:\d{2}:\d{2}(?:\.\d+)?\s*)?(R\d)\b/.exec(text)?.[1] ?? null;
  let media = "";
  if (rung === "R1") media = chip("", "graphic, built in the edit");
  else if (row?.status === "found" && row.pick) {
    const p = row.pick;
    const page = safeUrl(p.sourcePageUrl);
    const thumb = safeUrl(p.previewUrl);
    const img = thumb ? `<img class="thumb" src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" width="128" height="72">` : "";
    media = [
      img && page ? link(page, img) : img,
      chip("ok", p.licence.name || p.licence.licenseId),
      row.review === "fit" ? chip("ok", "checked by eye") : row.review === "unreviewed" ? chip("warn", "not checked by eye") : "",
      p.creator ? `<span>by ${esc(p.creator)}</span>` : "",
      page ? link(page, `on ${esc(host(page))}`) : "",
      row.query ? `<span class="small">query “${esc(row.query)}”</span>` : "",
      row.alternates.length ? chip("", `${row.alternates.length} alternate${row.alternates.length > 1 ? "s" : ""}`) : "",
    ].filter(Boolean).join(" ");
  } else if (row?.status === "missing" && row.review === "none-fit") {
    media = `${chip("warn", "no candidate fit the shot")} <span class="small">checked by eye after searching ${row.queries.map((q) => `“${esc(q)}”`).join(", ")}</span>`;
  } else if (row?.status === "missing") {
    media = `${chip("warn", "no free clip yet")} <span class="small">searched ${row.queries.map((q) => `“${esc(q)}”`).join(", ")}</span>`;
  } else if (row?.status === "no-query") {
    media = chip("warn", "no search query in SRC");
  } else if (searched) {
    media = chip("", "not searched");
  }
  return `<li class="shot"><div class="shot-text">${inline(text)}</div>${media ? `<div class="shot-media">${media}</div>` : ""}</li>`;
}

/**
 * A chapter as scene cards; lines that are not scenes stay markdown.
 * @param {string} text @param {ChapterMedia | undefined} media
 */
function chapterHtml(text, media) {
  /** @type {Map<string, ShotMedia>} */
  const byShot = new Map((media?.shots ?? []).map((s) => [`${s.scene}#${s.shot}`, s]));
  /** @type {string[]} */
  const out = [];
  /** @type {string[]} */
  let buffer = [];
  const flush = () => { if (buffer.some((l) => l.trim())) out.push(`<div class="md">${markdown(buffer.join("\n"))}</div>`); buffer = []; };
  for (const line of text.split(/\r?\n/)) {
    const [s] = parseSceneLines(line);
    if (!s) { buffer.push(line); continue; }
    flush();
    const shots = shotParts(s.fields.SHOTS ?? "").map((t, k) => shotHtml(t, byShot.get(`${s.sc}#${k + 1}`), Boolean(media))).join("");
    const meta = [
      `<span class="sc">${esc(s.sc)}</span>`,
      `<span>${esc(toClock(s.start))}–${esc(toClock(s.end))}</span>`,
      s.positional[1] ? `<span>${esc(s.positional[1])}</span>` : "",
      s.positional[3] ? `<span>claims ${esc(s.positional[3])}</span>` : "",
      s.positional.find((p) => /^W\s+\d/.test(p)) ? `<span>${esc(s.positional.find((p) => /^W\s+\d/.test(p)))}</span>` : "",
    ].filter(Boolean).join("");
    const notes = Object.entries(s.fields).filter(([k]) => k !== "NARR" && k !== "SHOTS").map(([k, v]) => `<dt>${esc(k)}</dt><dd>${inline(v)}</dd>`).join("");
    out.push(`<article class="scene" id="${esc(s.sc)}"><div class="scene-meta">${meta}</div>${s.wordless ? `<p class="narr wordless">No narration</p>` : `<p class="narr">${inline(s.narration)}</p>`}${shots ? `<ol class="shots">${shots}</ol>` : ""}${notes ? `<details class="notes"><summary>Edit notes</summary><dl class="fields">${notes}</dl></details>` : ""}</article>`);
  }
  flush();
  return out.join("\n");
}

/** @param {PageData} d */
function stageChips(d) {
  const ids = d.chapters.map((c) => c.id);
  const mediaUsed = Object.keys(d.run.stages ?? {}).some((k) => k.startsWith("media:")) || Object.keys(d.media).length > 0;
  const expected = ["s01", "research", "s2", "s3", "s4", ...ids.map((c) => `s5:${c}`), "qa", ...(mediaUsed ? ids.map((c) => `media:${c}`) : []), "s6", "s7", ...(d.run.stages?.originality ? ["originality"] : [])];
  const label = (/** @type {string} */ k) => STAGE_LABEL[k] ?? (k.startsWith("s5:") ? `S5 ${k.slice(3)}` : k.startsWith("media:") ? `Footage ${k.slice(6)}` : k);
  const items = expected.map((k) => (d.run.stages?.[k]?.status === "done" ? chip("ok", `✓ ${label(k)}`) : chip("", label(k))));
  if (!mediaUsed && typeof d.run.media === "string") items.push(chip("warn", `Footage ${d.run.media}`));
  return `<ul class="stages">${items.map((c) => `<li>${c}</li>`).join("")}</ul>`;
}

/** @param {PageData} d */
function sourcesHtml(d) {
  const facts = Array.isArray(d.research?.facts) ? d.research.facts : [];
  if (!facts.length) return `<p class="small">This run has no research file yet.</p>`;
  const tone = (/** @type {string} */ c) => (c === "high" ? "ok" : c === "low" ? "bad" : "warn");
  const rows = facts.map((/** @type {any} */ f) => {
    const links = (Array.isArray(f.sources) ? f.sources : []).map((/** @type {unknown} */ u) => safeUrl(u)).filter(Boolean).map((/** @type {any} */ u) => link(u, esc(host(u)))).join("<br>");
    return `<tr><td>${esc(f.id)}</td><td>${inline(f.claim)}${f.conflict ? `<br><span class="small">Sources differ: ${inline(f.conflict)}</span>` : ""}</td><td>${inline(f.value)}</td><td>${chip(tone(String(f.confidence)), String(f.confidence ?? "?"))}</td><td>${links}</td></tr>`;
  }).join("");
  const unknowns = Array.isArray(d.research?.unknowns) && d.research.unknowns.length ? `<h3>Unknown</h3><ul class="gaps">${d.research.unknowns.map((/** @type {unknown} */ u) => `<li>${inline(u)}</li>`).join("")}</ul>` : "";
  return `<div class="table-frame facts"><table><thead><tr><th>ID</th><th>Claim</th><th>Value</th><th>Confidence</th><th>Sources</th></tr></thead><tbody>${rows}</tbody></table></div>${unknowns}`;
}

/** Credits for the description: every picked clip, by site and creator. @param {PageData} d */
function creditsHtml(d) {
  /** @type {Map<string, any>} */
  const picks = new Map();
  for (const m of Object.values(d.media)) for (const s of m.shots) if (s.pick) picks.set(s.pick.id, s.pick);
  if (!picks.size) return "";
  /** @type {Map<string, any[]>} */
  const bySource = new Map();
  for (const p of picks.values()) bySource.set(p.source, [...(bySource.get(p.source) ?? []), p]);
  const groups = [...bySource].map(([source, list]) => {
    const name = list[0].licence?.name ?? source;
    const items = list.map((p) => { const u = safeUrl(p.sourcePageUrl); return `<li>${u ? link(u, esc(host(u) + new URL(u).pathname)) : esc(p.id)}${p.creator ? ` · ${esc(p.creator)}` : ""}</li>`; }).join("");
    return `<details class="block"><summary>${esc(source[0].toUpperCase() + source.slice(1))} · ${list.length} clip${list.length > 1 ? "s" : ""} · ${esc(name)}</summary><div class="md"><ul>${items}</ul></div></details>`;
  }).join("");
  return `<section id="credits"><div class="section-head"><h2>Footage credits</h2><p class="small">Every clip the run picked, with its licence page. Credit is not required by these licences; listing creators in the description is good practice.</p></div>${groups}</section>`;
}

/**
 * The whole page.
 * @param {PageData} d
 */
export function renderFilmPage(d) {
  const film = d.run.film ?? {};
  const status = String(d.run.status ?? "queued");
  const allMedia = Object.values(d.media);
  const shots = allMedia.reduce((n, m) => n + m.stats.shots, 0);
  const found = allMedia.reduce((n, m) => n + m.stats.found, 0);
  const scenes = Object.values(d.s5).reduce((n, t) => n + parseSceneLines(t).length, 0);
  const facts = Array.isArray(d.research?.facts) ? d.research.facts : [];
  const domains = new Set(facts.flatMap((/** @type {any} */ f) => (Array.isArray(f.sources) ? f.sources : []).map((/** @type {any} */ u) => host(String(u)))));
  const gaps = Array.isArray(d.run.gaps) ? d.run.gaps : [];
  const applied = d.fixLog ? d.fixLog.filter((f) => f.status === "applied").length : null;
  const tiles = [
    tile(STATUS_LABEL[status] ?? status, status === "done-with-gaps" ? "status: done, with open items" : status === "stopped-budget" ? "status: stopped at the budget, can resume" : "status", STATUS_TONE[status] ?? ""),
    tile(money(d.run.costUsd), "spent on the Claude API, counted per call"),
    tile(String(facts.length), facts.length ? `facts with sources, from ${domains.size} sites` : "facts (research not done yet)"),
    tile(d.filmCheck ? (d.filmCheck.ok ? "pass" : `${d.filmCheck.errors?.length ?? 0} errors`) : "—", "code check: clock, IDs, words, sources", d.filmCheck ? (d.filmCheck.ok ? "ok" : "bad") : ""),
    tile(applied === null ? "—" : `${applied}/${d.qa?.mustFix?.length ?? applied}`, "QA fixes applied"),
    tile(allMedia.length ? `${found}/${shots}` : "—", allMedia.length ? "stock shots with a free clip, none repeated within 10 min" : "footage not searched yet", allMedia.length ? (found === shots ? "ok" : "warn") : ""),
    tile(d.originality ? String(d.originality.verdict) : "—", d.originality ? `channel originality, against ${d.originality.compared} earlier films` : "channel originality (not checked yet)", d.originality ? ({ pass: "ok", review: "warn", fail: "bad" })[/** @type {"pass" | "review" | "fail"} */ (d.originality.verdict)] ?? "" : ""),
    tile(String(gaps.length), "open items", gaps.length ? "warn" : "ok"),
  ].join("");
  const runtime = Number.isFinite(film.durationSeconds) ? toClock(film.durationSeconds) : "";
  const chaptersHtml = d.chapters.filter((c) => d.s5[c.id] !== undefined).map((c, k) => {
    const m = d.media[c.id];
    const n = parseSceneLines(d.s5[c.id]).length;
    const summary = [`${c.id} · ${c.title}`, `${c.start}–${c.end}`, `${n} scenes`, m ? `footage ${m.stats.found}/${m.stats.shots}` : ""].filter(Boolean).map(esc).join(" · ");
    return `<details class="block"${k === 0 ? " open" : ""}><summary>${summary}</summary><div class="scenes">${chapterHtml(d.s5[c.id], m)}</div></details>`;
  }).join("\n");
  const doc = (/** @type {string} */ key, /** @type {string} */ title, open = false) => (d.docs[key] ? `<details class="block"${open ? " open" : ""}><summary>${esc(title)}</summary><div class="md">${markdown(d.docs[key])}</div></details>` : "");
  const nav = [["overview", "Overview"], ["script", "Script and shots"], ["sources", "Sources"], ...(found ? [["credits", "Footage credits"]] : []), ["qa", "QA report"], ["publish", "Publishing pack"], ["plan", "Plan and bibles"]];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex">
<title>${esc(film.topic ? `${film.topic} · Film run` : "Film run")}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@75..100,600..800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap">
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="head" id="overview">
  <p class="eyebrow">Zupona AI Studio · Film run · ${esc(film.versionId ?? "")}${runtime ? ` · ${esc(runtime)}` : ""}</p>
  <h1>${esc(film.topic ?? "Untitled film")}</h1>
  <p class="lede">${esc([runtime && `Runtime ${runtime}`, d.chapters.length && `${d.chapters.length} chapters`, scenes && `${scenes} scenes`].filter(Boolean).join(" · ") || "The run has not written a chapter yet.")}. Every fact links to its sources, every stock shot to its clip and licence, and every cent spent is counted.</p>
  <nav class="toc">${nav.map(([id, label]) => `<a href="#${id}">${esc(label)}</a>`).join("")}</nav>
  <div class="tiles">${tiles}</div>
  ${stageChips(d)}
  ${gaps.length ? `<details class="block"><summary>Open items (${gaps.length})</summary><div class="md"><ul class="gaps">${gaps.slice(0, 200).map((/** @type {unknown} */ g) => `<li>${inline(g)}</li>`).join("")}</ul></div></details>` : ""}
  ${d.run.error ? `<p class="small">Stopped: ${esc(d.run.error)}</p>` : ""}
  ${d.render ? `<p class="small">Video render: ${d.render.ok && safeUrl(d.render.actionsUrl) ? `started on GitHub${d.render.at ? ` (${esc(String(d.render.at).slice(0, 16).replace("T", " "))} UTC)` : ""}, ${link(/** @type {string} */ (safeUrl(d.render.actionsUrl)), "follow it and download the MP4, Shorts and thumbnails")}` : `not started: ${esc(d.render.error ?? "unknown error")}`}</p>` : ""}
</header>
<section id="script"><div class="section-head"><h2>Script and shots</h2><p class="small">Narration as the voice will read it, then each shot with the clip found for it.</p></div>${chaptersHtml || `<p class="small">No chapter written yet.</p>`}</section>
<section id="sources"><div class="section-head"><h2>Sources</h2><p class="small">The research file every chapter was written from. Conflicting sources are shown, never resolved silently.</p></div>${sourcesHtml(d)}</section>
${creditsHtml(d)}
<section id="qa"><div class="section-head"><h2>QA report</h2></div>${doc("s6", "S6 whole-film QA", true) || `<p class="small">Not written yet.</p>`}</section>
<section id="publish"><div class="section-head"><h2>Publishing pack</h2></div>${doc("s7", "S7 titles, description, chapters, Shorts", true) || `<p class="small">Not written yet.</p>`}</section>
<section id="plan"><div class="section-head"><h2>Plan and bibles</h2></div>${[doc("s01", "S0–S1 intake, angle and titles"), doc("s2", "S2 claim ledger"), doc("s3", "S3 story architecture"), doc("s4", "S4 production bibles")].join("") || `<p class="small">Not written yet.</p>`}</section>
<p class="small">Rebuilt from the run's files each time this page opens.</p>
</div>
</body>
</html>`;
}
