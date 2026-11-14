/**
 * Map shots (FX-MAP): a crisp vector map for one place, drawn per shot and
 * rasterised by ffmpeg, so a map never needs a tile service, a key or a fee.
 * Country shapes are Natural Earth 1:50m (public domain; assets/README.md).
 * The renderer animates the map (slow push-in), pins the place at the
 * centre with a pulse and labels it.
 *
 * Projection: equirectangular around the place, with longitude scaled by
 * cos(latitude) so countries keep their proportions near the centre.
 */
import { readFileSync } from "node:fs";
export { mapPlace } from "../engine/src/timeline.mjs";

/** @typedef {{ name: string, rings: number[][][], bbox: [number, number, number, number] }} Country */

/** @type {Country[] | null} */
let world = null;

/**
 * Decode a TopoJSON object into rings of [lon, lat] (quantised arcs are
 * delta-encoded; a negative arc index means that arc reversed).
 * @param {any} topo @param {string} name
 * @returns {Country[]}
 */
export function decodeTopology(topo, name) {
  const scale = topo.transform?.scale ?? [1, 1];
  const translate = topo.transform?.translate ?? [0, 0];
  const quantised = Boolean(topo.transform);
  /** @type {number[][][]} */
  const arcs = topo.arcs.map((/** @type {number[][]} */ arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([a, b]) => {
      if (quantised) { x += a; y += b; } else { x = a; y = b; }
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const arcAt = (/** @type {number} */ i) => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
  const ring = (/** @type {number[]} */ ids) => ids.flatMap((i, k) => (k ? arcAt(i).slice(1) : arcAt(i)));
  return (topo.objects[name]?.geometries ?? []).map((/** @type {any} */ g) => {
    const polygons = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
    const rings = polygons.flatMap((/** @type {number[][]} */ p) => p.map(ring));
    const xs = rings.flat().map((p) => p[0]);
    const ys = rings.flat().map((p) => p[1]);
    return { name: String(g.properties?.name ?? g.id ?? ""), rings, bbox: /** @type {[number, number, number, number]} */ ([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]) };
  }).filter((/** @type {Country} */ c) => c.rings.length);
}

/** The world's countries, loaded once. */
export function countries() {
  world ??= decodeTopology(JSON.parse(readFileSync(new URL("./assets/countries-50m.json", import.meta.url), "utf8")), "countries");
  return world;
}

/**
 * The country a point falls in (ray casting over its rings), or null at sea.
 * @param {number} lon @param {number} lat
 */
export function countryAt(lon, lat) {
  for (const c of countries()) {
    const [x0, y0, x1, y1] = c.bbox;
    if (lon < x0 || lon > x1 || lat < y0 || lat > y1) continue;
    let inside = false;
    for (const r of c.rings) {
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
      }
    }
    if (inside) return c;
  }
  return null;
}

/**
 * The country of a place, allowing for coastal cities that fall just offshore
 * at 1:50m (New York, Mumbai): the nearest country within about 0.6 degrees.
 * @param {number} lon @param {number} lat
 */
export function countryNear(lon, lat) {
  const exact = countryAt(lon, lat);
  if (exact) return exact;
  for (const r of [0.2, 0.4, 0.6]) {
    for (let k = 0; k < 8; k += 1) {
      const a = (k * Math.PI) / 4;
      const c = countryAt(lon + r * Math.cos(a), lat + r * Math.sin(a));
      if (c) return c;
    }
  }
  return null;
}

/**
 * An SVG map centred on a place.
 * @param {{ lat: number, lon: number, width: number, height: number, spanDeg?: number }} o
 */
export function mapSvg(o) {
  const span = o.spanDeg ?? 34;
  const lat0 = Math.max(-75, Math.min(75, o.lat));
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const k = o.width / (span * cos);
  const vSpan = o.height / k;
  const px = (/** @type {number[]} */ [lon, lat]) => `${((lon - o.lon) * cos * k + o.width / 2).toFixed(1)},${((lat0 - lat) * k + o.height / 2).toFixed(1)}`;
  const view = [o.lon - span / 2 - 5, lat0 - vSpan / 2 - 5, o.lon + span / 2 + 5, lat0 + vSpan / 2 + 5];
  const near = (/** @type {Country} */ c) => !(c.bbox[2] < view[0] || c.bbox[0] > view[2] || c.bbox[3] < view[1] || c.bbox[1] > view[3]);
  const home = countryNear(o.lon, o.lat);
  const path = (/** @type {Country} */ c) => c.rings.map((r) => `M${r.map(px).join("L")}Z`).join("");
  const stroke = Math.max(1, o.width / 1400);
  const lines = [];
  for (let g = Math.ceil(view[0] / 10) * 10; g <= view[2]; g += 10) lines.push(`M${px([g, view[1]])}L${px([g, view[3]])}`);
  for (let g = Math.ceil(view[1] / 10) * 10; g <= view[3]; g += 10) lines.push(`M${px([view[0], g])}L${px([view[2], g])}`);
  const land = countries().filter(near).filter((c) => c !== home).map(path).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">`
    + `<defs><radialGradient id="sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#11252a"/><stop offset="1" stop-color="#070f11"/></radialGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#sea)"/>`
    + `<path d="${lines.join("")}" stroke="#ffffff" stroke-opacity="0.06" stroke-width="${stroke}" fill="none"/>`
    + `<path d="${land}" fill="#1a2a23" stroke="#3b5a4a" stroke-width="${stroke}" stroke-linejoin="round" fill-rule="evenodd"/>`
    + (home ? `<path d="${path(home)}" fill="#26402f" stroke="#bef264" stroke-width="${stroke * 2.4}" stroke-linejoin="round" fill-rule="evenodd"/>` : "")
    + `<g transform="translate(${o.width / 2},${o.height / 2})"><circle r="${o.height * 0.085}" fill="none" stroke="#bef264" stroke-opacity="0.22" stroke-width="${stroke * 2}"/><circle r="${o.height * 0.05}" fill="#bef264" fill-opacity="0.12" stroke="#bef264" stroke-opacity="0.45" stroke-width="${stroke * 2}"/><circle r="${o.height * 0.016}" fill="#bef264" stroke="#ffffff" stroke-width="${stroke * 2.5}"/></g>`
    + `</svg>`;
}

/**
 * A route map between two places: the base map (both countries lit, a pin
 * at each end) and, separately on a transparent layer, the curved line the
 * renderer reveals from the first place to the second.
 * @param {{ from: { lat: number, lon: number }, to: { lat: number, lon: number }, width: number, height: number }} o
 * @returns {{ base: string, line: string, a: number[], b: number[] }}
 */
export function routeSvgs(o) {
  const lon0 = (o.from.lon + o.to.lon) / 2;
  const lat0 = Math.max(-75, Math.min(75, (o.from.lat + o.to.lat) / 2));
  const cos = Math.cos((lat0 * Math.PI) / 180);
  const span = Math.max(14, Math.abs(o.from.lon - o.to.lon) * 1.45, (Math.abs(o.from.lat - o.to.lat) * 1.45 * o.width) / (o.height * cos));
  const k = o.width / (span * cos);
  const vSpan = o.height / k;
  const xy = (/** @type {number[]} */ [lon, lat]) => [(lon - lon0) * cos * k + o.width / 2, (lat0 - lat) * k + o.height / 2];
  const pt = (/** @type {number[]} */ q) => xy(q).map((n) => n.toFixed(1)).join(",");
  const view = [lon0 - span / 2 - 5, lat0 - vSpan / 2 - 5, lon0 + span / 2 + 5, lat0 + vSpan / 2 + 5];
  const near = (/** @type {Country} */ c) => !(c.bbox[2] < view[0] || c.bbox[0] > view[2] || c.bbox[3] < view[1] || c.bbox[1] > view[3]);
  const lit = [countryNear(o.from.lon, o.from.lat), countryNear(o.to.lon, o.to.lat)].filter((c) => c !== null);
  const path = (/** @type {Country} */ c) => c.rings.map((r) => `M${r.map(pt).join("L")}Z`).join("");
  const stroke = Math.max(1, o.width / 1400);
  const a = xy([o.from.lon, o.from.lat]);
  const b = xy([o.to.lon, o.to.lat]);
  // The line arcs upward like a flight path: the control point sits off the midpoint, on the side toward the top.
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  let nx = b[1] - a[1];
  let ny = -(b[0] - a[0]);
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
  const cx = mx + nx * 0.22;
  const cy = my + ny * 0.22 - Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.06;
  const pin = (/** @type {number[]} */ q) => `<g transform="translate(${q[0].toFixed(1)},${q[1].toFixed(1)})"><circle r="${o.height * 0.04}" fill="#bef264" fill-opacity="0.12" stroke="#bef264" stroke-opacity="0.45" stroke-width="${stroke * 2}"/><circle r="${o.height * 0.014}" fill="#bef264" stroke="#ffffff" stroke-width="${stroke * 2.5}"/></g>`;
  const base = `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">`
    + `<defs><radialGradient id="sea" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#11252a"/><stop offset="1" stop-color="#070f11"/></radialGradient></defs>`
    + `<rect width="100%" height="100%" fill="url(#sea)"/>`
    + `<path d="${countries().filter(near).filter((c) => !lit.includes(c)).map(path).join("")}" fill="#1a2a23" stroke="#3b5a4a" stroke-width="${stroke}" stroke-linejoin="round" fill-rule="evenodd"/>`
    + lit.map((c) => `<path d="${path(c)}" fill="#26402f" stroke="#bef264" stroke-opacity="0.7" stroke-width="${stroke * 1.8}" stroke-linejoin="round" fill-rule="evenodd"/>`).join("")
    + pin(a) + pin(b) + `</svg>`;
  const d = `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
  const line = `<svg xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${o.height}" viewBox="0 0 ${o.width} ${o.height}">`
    + `<path d="${d}" fill="none" stroke="#bef264" stroke-opacity="0.25" stroke-width="${stroke * 9}" stroke-linecap="round"/>`
    + `<path d="${d}" fill="none" stroke="#e8ffc2" stroke-width="${stroke * 3.2}" stroke-linecap="round"/>`
    + `</svg>`;
  return { base, line, a, b };
}
