// Which Zupona template (if any) draws a timeline shot, read from the FX fields the film already carries
// (engine/src/timeline.mjs VideoSegment). Null means "keep the ffmpeg drawing", so every shot has a fallback.
import { TEMPLATES } from "./templates.mjs";

/** @typedef {{ template: import("./templates.mjs").TemplateName, data: any, alpha: boolean }} Graphic */

const QUOTE = /^\s*[“"](.{8,220}?)[”"]\s*[—–-]{1,2}\s*(.{2,60})$/s;

/**
 * @param {any} v a VideoSegment, plus an optional M2 field `graphic: { template, data }` when the shot plan asks for one by name
 * @param {{ counterParts?: (text: string) => { before: string, value: number, after: string } | null }} [helpers]
 * @returns {Graphic | null}
 */
export function graphicFor(v, helpers = {}) {
  if (!v || v.type === "black") return null;
  const g = v.graphic;
  if (g && typeof g.template === "string" && g.template in TEMPLATES && g.data && typeof g.data === "object") {
    return { template: /** @type {any} */ (g.template), data: g.data, alpha: g.template === "lowerThird" || (v.type === "clip" && g.template !== "document") };
  }
  const text = String(v.text ?? "").trim();
  // "Chapter 2 · The Long Winter" -> kicker and title (the form timeline.mjs writes).
  const chapter = (/** @type {string} */ c) => { const [a, ...b] = c.split(" · "); return b.length ? { kicker: a, title: b.join(" · ") } : { title: a }; };
  // The shot plan's TYPE (docs/TRANSFORMATION.md section 3, M2), when present, names the template outright.
  const st = v.shotType;
  if (v.type === "card" && st === "title" && (v.chapterTitle || text)) return { template: "chapter", data: chapter(v.chapterTitle || text), alpha: false };
  if (v.type === "card" && st === "kinetic-type" && text) return { template: "kinetic", data: { text }, alpha: false };
  if (v.type === "card" && st === "document" && text) return { template: "document", data: { kind: v.style === "paper" ? "document" : "newspaper", text, highlight: v.highlight ?? "", masthead: v.chip ?? "" }, alpha: false };
  if (v.type === "card" && st === "quote" && text) {
    const q = QUOTE.exec(text);
    return { template: "quote", data: q ? { quote: q[1].trim(), by: q[2].trim() } : { quote: text.replace(/^[“"]|[”"]$/g, "") }, alpha: false };
  }
  // A lower third on its own (a person the voice names, engine/src/voice-moments.mjs): the house lower-third
  // template over the brand ground. No role is written: the voice's words are the only words on it.
  if (v.type === "card" && st === "lowerThird" && text) return { template: "lowerThird", data: { name: text }, alpha: false };
  if (v.type === "card") {
    // Only a card that says nothing but the chapter becomes the chapter card; a card with its own words keeps them.
    if (v.chapterTitle && (!text || text === v.chapterTitle)) return { template: "chapter", data: chapter(v.chapterTitle), alpha: false };
    if (!text || v.chart || v.map || v.split?.length) return null; // charts, maps and splits keep their own drawing
    if (v.counter && helpers.counterParts) {
      const c = helpers.counterParts(text);
      // counterParts escapes for drawtext; the page needs the plain words back.
      const plain = (/** @type {string} */ s) => s.replace(/\\(.)/g, "$1").trim();
      if (c) return { template: "counter", data: { before: plain(c.before), value: c.value, after: plain(c.after) }, alpha: false };
    }
    if (v.style === "paper") return null; // FX-PAPER keeps its tested ffmpeg highlighter; TYPE "document" asks for the reveal
    const q = QUOTE.exec(text);
    if (q) return { template: "quote", data: { quote: q[1].trim(), by: q[2].trim() }, alpha: false };
    if (v.kinetic) return { template: "kinetic", data: { text }, alpha: false };
    return null;
  }
  if (v.type === "clip") {
    if (v.chapterTitle) return { template: "chapter", data: chapter(v.chapterTitle), alpha: true };
    if (v.title && String(v.title).length <= 60) return { template: "lowerThird", data: { name: String(v.title) }, alpha: true };
  }
  return null;
}
