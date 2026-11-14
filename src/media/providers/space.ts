// NASA, NASA SVS, and the four djangoplicity observatory archives (ESA/Hubble, ESA/Webb, ESO, NOIRLab).

import { https, plain, qs } from "../http";
import { license } from "../licenses";
import type { Candidate, Searcher } from "../types";

/* ------------------------------------------------------------------ */
/* NASA Image and Video Library                                        */
/* ------------------------------------------------------------------ */

type NasaItem = {
  data?: {
    nasa_id: string;
    title?: string;
    description?: string;
    date_created?: string;
    center?: string;
    photographer?: string;
    secondary_creator?: string;
    keywords?: string[];
  }[];
  links?: { href: string; rel: string; width?: number; height?: number }[];
};

const nasa: Searcher = async (ctx) => {
  const data = await ctx.http.json<{ collection?: { items?: NasaItem[] } }>(
    `https://images-api.nasa.gov/search?${qs({ q: ctx.query, media_type: "image", page_size: Math.min(100, ctx.perSource + 4) })}`,
  );
  const out: Candidate[] = [];
  for (const item of data.collection?.items ?? []) {
    const d = item.data?.[0];
    const links = item.links ?? [];
    if (!d) continue;
    const orig = links.find((l) => l.rel === "canonical" && /\.(jpe?g|png)$/i.test(l.href));
    const largest = links
      .filter((l) => l.rel === "alternate" && /\.(jpe?g|png)$/i.test(l.href))
      .sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
    const thumb = links.find((l) => l.rel === "preview") ?? links.find((l) => /~small\./.test(l.href));
    const full = orig ?? largest;
    if (!full) continue;
    const medium = links.find((l) => /~medium\./.test(l.href)) ?? largest ?? full;
    const who = plain(d.secondary_creator || d.photographer || (d.center ? `NASA ${d.center}` : "NASA"), 120);
    out.push({
      nativeId: d.nasa_id,
      title: plain(d.title, 160) || d.nasa_id,
      description: plain(d.description, 300) || undefined,
      creator: who,
      date: d.date_created?.slice(0, 10),
      pageUrl: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id)}`,
      thumbnailUrl: https(thumb?.href ?? medium.href),
      previewUrl: https(medium.href),
      fullUrl: https(full.href),
      width: full.width,
      height: full.height,
      license: license("us-government", { label: "Public domain (NASA)" }),
      credit: `Credit: ${who}`,
      tags: d.keywords?.slice(0, 12),
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* NASA Scientific Visualization Studio                                */
/* ------------------------------------------------------------------ */

type SvsImage = { url: string; filename?: string; media_type?: string; alt_text?: string; width?: number; height?: number; pixels?: number };
type SvsPage = {
  id: number;
  url: string;
  title: string;
  description?: string;
  release_date?: string;
  main_image?: SvsImage | null;
  media_groups?: { items?: { instance?: SvsImage | null }[] }[];
  keywords?: string[] | { title?: string }[];
};

const nasaSvs: Searcher = async (ctx) => {
  const search = await ctx.http.json<{ results?: { id: number; result_type?: string }[] }>(
    `https://svs.gsfc.nasa.gov/api/search/?${qs({ search: ctx.query, limit: 6 })}`,
  );
  const ids = (search.results ?? []).filter((r) => r.id).slice(0, 3).map((r) => r.id);
  const pages = await Promise.allSettled(ids.map((id) => ctx.http.json<SvsPage>(`https://svs.gsfc.nasa.gov/api/${id}/`)));
  const out: Candidate[] = [];
  for (const settled of pages) {
    if (settled.status !== "fulfilled") continue;
    const page = settled.value;
    const images: SvsImage[] = [page.main_image, ...(page.media_groups ?? []).flatMap((g) => (g.items ?? []).map((i) => i.instance))].filter(
      (i): i is SvsImage => !!i && i.media_type === "Image" && /\.(jpe?g|png)$/i.test(i.url),
    );
    if (!images.length) continue;
    const full = [...images].filter((i) => (i.width ?? 0) <= 8192).sort((a, b) => (b.pixels ?? 0) - (a.pixels ?? 0))[0] ?? images[0];
    const preview = page.main_image && /\.(jpe?g|png)$/i.test(page.main_image.url) ? page.main_image : full;
    out.push({
      nativeId: String(page.id),
      title: plain(page.title, 160),
      description: plain(page.description, 300) || undefined,
      creator: "NASA's Scientific Visualization Studio",
      date: page.release_date?.slice(0, 10),
      pageUrl: https(page.url),
      thumbnailUrl: https(preview.url),
      previewUrl: https(preview.url),
      fullUrl: https(full.url),
      width: full.width,
      height: full.height,
      license: license("us-government", { label: "Public domain (NASA)" }),
      credit: "NASA's Scientific Visualization Studio",
    });
  }
  return out;
};

/* ------------------------------------------------------------------ */
/* djangoplicity archives                                              */
/* ------------------------------------------------------------------ */

// ESA/Hubble, ESA/Webb, ESO and NOIRLab all run the djangoplicity archive software. Their search
// pages embed the result list as a JavaScript array (`var images = [{ id, title, width, height,
// src, url }]`), which is far more stable than scraping markup. Everything they publish is CC BY 4.0.

type Observatory = {
  search: string;
  site: string;
  /** Derivative folder base; "thumb300y" in `src` is swapped for the size wanted. */
  credit: string;
  holder: string;
};

const OBSERVATORIES: Record<string, Observatory> = {
  "esa-hubble": { search: "https://esahubble.org/images/", site: "https://esahubble.org", credit: "ESA/Hubble & NASA", holder: "ESA/Hubble" },
  "esa-webb": { search: "https://esawebb.org/images/", site: "https://esawebb.org", credit: "ESA/Webb, NASA & CSA", holder: "ESA/Webb" },
  eso: { search: "https://www.eso.org/public/images/", site: "https://www.eso.org", credit: "ESO", holder: "ESO" },
  noirlab: { search: "https://noirlab.edu/public/images/", site: "https://noirlab.edu", credit: "NOIRLab/NSF/AURA", holder: "NOIRLab" },
};

const ENTRY = /\{\s*id:\s*'([^']+)',\s*title:\s*'((?:[^'\\]|\\.)*)',\s*width:\s*(\d+),\s*height:\s*(\d+),\s*src:\s*'([^']+)',\s*url:\s*'([^']+)'/g;

function unescapeJs(text: string) {
  return text.replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (_, seq: string) => {
    if (seq[0] === "u" || seq[0] === "x") return String.fromCharCode(parseInt(seq.slice(1), 16));
    return seq;
  });
}

function observatory(id: keyof typeof OBSERVATORIES): Searcher {
  const o = OBSERVATORIES[id];
  return async (ctx) => {
    const html = await ctx.http.text(`${o.search}?${qs({ search: ctx.query })}`);
    const start = html.indexOf("var images");
    if (start < 0) return [];
    const block = html.slice(start, html.indexOf("];", start) + 2);
    const out: Candidate[] = [];
    for (const m of block.matchAll(ENTRY)) {
      const [, imageId, rawTitle, w, h, src, path] = m;
      const width = Number(w);
      const height = Number(h);
      const size = (folder: string) => https(src.replace("/thumb300y/", `/${folder}/`));
      // "large" is the full-size JPEG; above ~25 megapixels it can pass 100 MB, so use the
      // ~4000 px publication JPEG instead.
      const huge = width * height > 25_000_000;
      // The publication JPEG is scaled to a 4000 px long edge.
      const scale = huge ? 4000 / Math.max(width, height) : 1;
      out.push({
        nativeId: imageId,
        title: plain(unescapeJs(rawTitle), 160),
        creator: o.holder,
        pageUrl: `${o.site}${path}`,
        thumbnailUrl: size("thumb700x"),
        previewUrl: size("screen"),
        fullUrl: size(huge ? "publicationjpg" : "large"),
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        license: license("cc-by", { version: "4.0" }),
        credit: o.credit,
        curated: true,
      });
      if (out.length >= ctx.perSource) break;
    }
    return out;
  };
}

export const space = {
  nasa,
  "nasa-svs": nasaSvs,
  "esa-hubble": observatory("esa-hubble"),
  "esa-webb": observatory("esa-webb"),
  eso: observatory("eso"),
  noirlab: observatory("noirlab"),
};
