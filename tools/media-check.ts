// Live check of every image source: runs a real query against each one, then downloads the first
// result's thumbnail and full file to confirm the URLs work and the pixel size is what the source
// claims. Usage (from tools/):
//
//   npm run check:media                      every source with its sample query
//   npm run check:media -- nasa eso          only these sources
//   npm run check:media -- --all "coral reef" one query across all sources, ranked
//
// Keys are read from the environment (PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY, ...).
// Behind an HTTP proxy, run Node with NODE_USE_ENV_PROXY=1.

import { SOURCES, searchMedia, type MediaResult } from "../src/media";

declare const process: { argv: string[]; env: Record<string, string | undefined>; exitCode?: number };

const SAMPLE_QUERIES: Record<string, string> = {
  "wikimedia-commons": "snow leopard",
  wikipedia: "Mughal Empire",
  openverse: "tiger",
  nasa: "Saturn",
  "nasa-svs": "hurricane",
  "esa-hubble": "nebula",
  "esa-webb": "nebula",
  eso: "nebula",
  noirlab: "nebula",
  met: "samurai",
  artic: "Monet",
  cleveland: "river",
  rijksmuseum: "windmill",
  smk: "landscape",
  mia: "horse",
  loc: "railroad",
  "internet-archive": "map",
  wellcome: "anatomy",
  digitalnz: "kiwi",
  ksamsok: "viking",
  "digital-commonwealth": "boston harbor",
  europeana: "castle",
  smithsonian: "dinosaur",
  nypl: "brooklyn bridge",
  nara: "apollo",
  inaturalist: "snow leopard",
  flickr: "lighthouse",
  "wordpress-photos": "forest",
  unsplash: "mountain",
  pixabay: "forest",
};

/** Reads width and height from the first bytes of a JPEG, PNG or WebP file. */
function sniffSize(buf: Uint8Array): { width: number; height: number; type: string } | null {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf[0] === 0x89 && buf[1] === 0x50) return { type: "png", width: view.getUint32(16), height: view.getUint32(20) };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[8] === 0x57) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunk === "VP8X") return { type: "webp", width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)) };
    if (chunk === "VP8 ") return { type: "webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === "VP8L") {
      const b = view.getUint32(21, true);
      return { type: "webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      const length = view.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: "jpeg", height: view.getUint16(i + 5), width: view.getUint16(i + 7) };
      }
      i += 2 + length;
    }
  }
  return null;
}

async function probe(url: string) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-262143", "User-Agent": "ZuponaAI-MediaSearch/1.0 (https://ai.zupona.com; documentary image research)" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader && size < 262144) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
    }
    await reader?.cancel().catch(() => {});
    const buf = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      buf.set(c, offset);
      offset += c.length;
    }
    const dims = sniffSize(buf);
    return { ok: res.ok, status: res.status, type: res.headers.get("content-type") ?? "", dims, ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, status: 0, type: "", dims: null, ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}

function line(r: MediaResult) {
  const size = r.width && r.height ? `${r.width}x${r.height}` : "size ?";
  return `${r.quality.padEnd(2)} ${size.padEnd(11)} ${r.license.label.padEnd(26)} ${r.title.slice(0, 60)}`;
}

async function checkSource(id: string) {
  const query = SAMPLE_QUERIES[id] ?? "river";
  const res = await searchMedia({ query, sources: [id], perSource: 8, limit: 8, minSize: 0, rights: "share-alike" }, process.env);
  const report = res.sources[0];
  const status = report?.status ?? "missing";
  const head = `${id.padEnd(22)} ${status.padEnd(9)} found ${String(report?.found ?? 0).padStart(2)}  kept ${String(res.results.length).padStart(2)}  ${String(report?.ms ?? 0).padStart(5)} ms  "${query}"`;
  if (!res.results.length) return { id, status, ok: status === "needs-key", text: `${head}${report?.error ? `  (${report.error})` : ""}` };
  const top = res.results[0];
  const [thumb, full] = await Promise.all([probe(top.thumbnailUrl), probe(top.fullUrl)]);
  const fullDims = full.dims ? `${full.dims.width}x${full.dims.height} ${full.dims.type}` : full.type || "no image";
  const claimed = top.width && top.height ? `${top.width}x${top.height}` : "unknown";
  const ok = thumb.ok && full.ok && !!full.dims;
  return {
    id,
    status,
    ok,
    text: [
      head,
      `    top:   ${line(top)}`,
      `    thumb: ${thumb.ok ? "ok" : `FAILED ${thumb.status}`} ${thumb.dims ? `${thumb.dims.width}x${thumb.dims.height}` : ""}   full: ${full.ok ? "ok" : `FAILED ${full.status}`} ${fullDims} (claimed ${claimed}) ${full.ms} ms`,
      `    page:  ${top.pageUrl}`,
      `    credit: ${top.attribution.slice(0, 140)}`,
    ].join("\n"),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--all") {
    const query = args.slice(1).join(" ") || "snow leopard";
    const res = await searchMedia({ query, limit: 40 }, process.env);
    console.log(`"${res.query}": ${res.results.length} results from ${res.candidates} candidates in ${res.tookMs} ms\n`);
    for (const s of res.sources) console.log(`  ${s.name.padEnd(40)} ${s.status.padEnd(9)} ${String(s.count).padStart(2)}/${String(s.found).padEnd(3)} ${s.ms} ms ${s.error ?? ""}`);
    console.log("");
    for (const r of res.results) console.log(`  ${r.score.toFixed(3)} ${r.sourceName.slice(0, 24).padEnd(24)} ${line(r)}`);
    return;
  }
  const ids = args.length ? args : SOURCES.map((s) => s.id);
  let failures = 0;
  // A few at a time, to stay polite to the archives.
  for (let i = 0; i < ids.length; i += 4) {
    const batch = await Promise.all(ids.slice(i, i + 4).map(checkSource));
    for (const r of batch) {
      console.log(r.text);
      if (!r.ok) failures += 1;
    }
  }
  console.log(`\n${ids.length - failures}/${ids.length} sources passed (sources waiting for a key count as passed).`);
  if (failures) process.exitCode = 1;
}

main();
