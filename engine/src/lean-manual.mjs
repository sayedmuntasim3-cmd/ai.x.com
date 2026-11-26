/**
 * Lean manual: each film stage gets only the sections of the engine manual it uses, not all 73 KB.
 * A brain with a small token budget per minute (Groq's free tier: 8,000 tokens a minute) cannot take
 * the whole manual (about 23,000 tokens) on every call; with this, most stages fit. Pure: browser + Node.
 *
 * The manual is split on its own banner lines ("=====" / "N. TITLE" / "====="). Section keys are the
 * leading number ("0" ... "18"), "NN" for the non-negotiables and "head" for the text before them.
 */

/** Sections every stage gets: who the engine is, the rules that win every conflict, language, banned list. */
const ALWAYS = ["head", "NN", "0", "1", "16"];

/**
 * What each stage reads, by the stage's first name part ("s5:C1" -> "s5"). A stage not listed gets
 * the whole manual, so a new stage is never starved by mistake.
 */
export const STAGE_SECTIONS = Object.freeze({
  market: ["4", "5", "17"],
  s01: ["2", "4", "5", "12", "17"],
  "research-plan": ["6"],
  research: ["6"],
  s2: ["6", "12"],
  s3: ["3", "7", "12", "15", "17"],
  s4: ["8", "9", "12"],
  s5: ["3", "9", "10", "11", "12", "15"],
  repair: ["10", "11", "12"],
  qa: ["12", "13"],
  edit: ["9", "10", "11"],
  s6: ["12", "13"],
  s7: ["14", "15"],
  originality: ["5", "15"],
});

const BANNER = /^={20,}\s*$/;

/**
 * Split the manual into its banner sections.
 * @param {string} manual
 * @returns {Map<string, string>}
 */
export function manualSections(manual) {
  const lines = manual.split("\n");
  /** @type {Map<string, string[]>} */
  const out = new Map([["head", []]]);
  let key = "head";
  for (let i = 0; i < lines.length; i += 1) {
    // A banner, a title line, a banner: a new section starts with the title.
    if (BANNER.test(lines[i]) && i + 2 < lines.length && BANNER.test(lines[i + 2])) {
      const title = lines[i + 1];
      key = /^NON-NEGOTIABLES/.test(title) ? "NN" : (/^(\d+)\.\s/.exec(title)?.[1] ?? title.slice(0, 40));
      out.set(key, [lines[i], title, lines[i + 2]]);
      i += 2;
      continue;
    }
    /** @type {string[]} */ (out.get(key)).push(lines[i]);
  }
  return new Map([...out].map(([k, v]) => [k, v.join("\n")]));
}

/**
 * The manual text one stage needs, in the manual's own order.
 * @param {string} manual @param {string} stage
 */
export function leanManual(manual, stage) {
  const wanted = STAGE_SECTIONS[/** @type {keyof typeof STAGE_SECTIONS} */ (stage.split(":")[0])];
  if (!wanted) return manual;
  const keep = new Set([...ALWAYS, ...wanted]);
  const sections = manualSections(manual);
  // A manual without the expected banners is sent whole rather than cut wrong.
  if (sections.size < 10) return manual;
  return [...sections].filter(([k]) => keep.has(k)).map(([, text]) => text).join("\n").trim() + "\n\n(Only the manual sections this stage needs are included.)\n";
}
