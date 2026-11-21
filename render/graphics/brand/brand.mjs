// Zupona house look (docs/TRANSFORMATION.md section 5): one set of tokens every graphic and the
// depth camera read, so a title card, a lower third and a map all look like one studio made them.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

/** Two free fonts (SIL OFL 1.1, licences beside them): a display face and a text face. */
export const FONTS = {
  display: { family: "Zupona Display", source: "Fraunces", weights: [400, 700, 800], file: (/** @type {number} */ w) => join(here, "fonts", `fraunces-latin-${w}-normal.woff2`) },
  text: { family: "Zupona Text", source: "Inter", weights: [400, 700, 800], file: (/** @type {number} */ w) => join(here, "fonts", `inter-latin-${w}-normal.woff2`) },
};

/** One accent colour on a warm night and a paper ground. */
export const COLOR = {
  accent: "#F2A93B", // saffron: the one colour that is ours
  accentDeep: "#B8731C",
  night: "#0C1113", // dark ground (graphics over black)
  ink: "#EEF0EA", // text on night
  muted: "#9AA39C",
  paper: "#F1EADB", // paper ground (documents, quote cards)
  paperInk: "#1D1A16",
  rule: "rgba(238,240,234,0.22)",
};

/**
 * A single easing family: one curve, a strong ease-out (things arrive fast and settle) and its in-out twin
 * for camera moves. Same numbers in CSS and in JS, so the depth camera and the graphics move alike.
 */
export const EASE = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
  css: (/** @type {"out"|"inOut"} */ k) => `cubic-bezier(${EASE[k].join(",")})`,
};

/** Cubic-bezier ease as a function of progress p in [0,1] (Newton's method on x, as browsers do). */
export function ease(/** @type {"out"|"inOut"} */ kind, /** @type {number} */ p) {
  const [x1, y1, x2, y2] = EASE[kind];
  const t0 = Math.min(1, Math.max(0, p));
  const bez = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ t) => 3 * a * (1 - t) ** 2 * t + 3 * b * (1 - t) * t * t + t ** 3;
  let t = t0;
  for (let i = 0; i < 8; i += 1) {
    const x = bez(x1, x2, t) - t0;
    const d = 3 * x1 * (1 - t) ** 2 + 6 * (x2 - x1) * (1 - t) * t + 3 * (1 - x2) * t * t;
    if (Math.abs(x) < 1e-6 || d === 0) break;
    t = Math.min(1, Math.max(0, t - x / d));
  }
  return bez(y1, y2, t);
}

/**
 * The grade pair: a warm look for the past and people, a cool one for places, maps and data.
 * Each is an ffmpeg filter chain applied after a graphic or a depth shot is drawn.
 */
export const GRADE = {
  warm: "colorbalance=rs=0.04:gs=0.01:bs=-0.05:rh=0.05:bh=-0.04,eq=contrast=1.05:saturation=0.92",
  cool: "colorbalance=rs=-0.04:bs=0.05:rh=-0.02:bh=0.03,eq=contrast=1.06:saturation=0.88",
};

/** @font-face rules with the fonts inlined, so a page renders with no network and no files beside it. */
export function fontFaceCss() {
  return Object.values(FONTS)
    .flatMap((f) => f.weights.map((w) => `@font-face{font-family:"${f.family}";font-weight:${w};font-style:normal;src:url(data:font/woff2;base64,${readFileSync(f.file(w)).toString("base64")}) format("woff2");}`))
    .join("\n");
}

/** The tokens as CSS custom properties, for every template's <style>. */
export function brandCss() {
  return `${fontFaceCss()}
:root{--accent:${COLOR.accent};--accent-deep:${COLOR.accentDeep};--night:${COLOR.night};--ink:${COLOR.ink};--muted:${COLOR.muted};--paper:${COLOR.paper};--paper-ink:${COLOR.paperInk};--rule:${COLOR.rule};--display:"${FONTS.display.family}",Georgia,serif;--text:"${FONTS.text.family}",Helvetica,Arial,sans-serif;--ease-out:${EASE.css("out")};--ease-in-out:${EASE.css("inOut")};}`;
}
