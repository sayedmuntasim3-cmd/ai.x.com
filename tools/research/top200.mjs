// Top-200 fastest risers of OUR niche from the reference prior's video rows, with a "why it rose" pattern per video.
// Usage: node tools/research/top200.mjs [--thumbs <dir>]   -> docs/research/data/top200-rise.json (+ prints the pattern table)
// Needs docs/research/data/engineering-reference-videos.json (build-prior.mjs). Metadata only; --thumbs downloads the images (not videos).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { topRisers, risePatterns } from "../../engine/src/reference-prior.mjs";
const rows = JSON.parse(readFileSync(new URL("../../docs/research/data/engineering-reference-videos.json", import.meta.url), "utf8"));
const top = topRisers(rows, 200);
const tagsFile = new URL("../../docs/research/data/top200-thumbnail-tags.json", import.meta.url);
const tags = existsSync(tagsFile) ? JSON.parse(readFileSync(tagsFile, "utf8")) : {};
const out = top.map((r) => ({ ...r, thumbnailTags: tags[r.id] ?? [] }));
writeFileSync(new URL("../../docs/research/data/top200-rise.json", import.meta.url), JSON.stringify(out, null, 0));
const i = process.argv.indexOf("--thumbs");
if (i > 0) {
  const dir = process.argv[i + 1]; mkdirSync(dir, { recursive: true });
  for (const r of top) { const f = `${dir}/${String(top.indexOf(r) + 1).padStart(3, "0")}_${r.id}.jpg`; if (existsSync(f)) continue; const x = await fetch(`https://i.ytimg.com/vi/${r.id}/hqdefault.jpg`).catch(() => null); if (x?.ok) writeFileSync(f, Buffer.from(await x.arrayBuffer())); }
  console.log("thumbnails in", dir);
}
console.log(JSON.stringify(risePatterns(out).map((p) => ({ id: p.id, n: p.n })), null, 0));
