/**
 * Prompt budget and stage splitting: a free brain limits how large one request's prompt may be
 * (Groq's free tier: 8,000 tokens a minute, and a single prompt over that is refused at once), and a
 * film stage is far larger than that. Instead of handing the stage to another brain, the run splits it
 * into parts (per chapter, per scene group, per fact group), each part under the limit, and this module
 * merges the parts back into the stage's one output. Pure: browser + Node.
 *
 * The estimate errs on the large side: 3.8 characters a token (the Worker measured 4.27), plus a small
 * constant for the message envelope, so a part that fits here fits Groq.
 */
import { toClock } from "./scene-lines.mjs";

/** Characters per token, rounded down from the measured 4.27 so the estimate errs on the large side. */
export const CHARS_PER_TOKEN = 3.8;
/** Prompt tokens one Groq request may carry (8,000 a minute, less a margin for the estimate). */
export const GROQ_PROMPT_LIMIT = 7200;
/** Never more than this many parts for one stage: a runaway split is a bug, not a plan. */
export const MAX_PARTS = 24;

/** Estimated tokens of one text. @param {string} text */
export function textTokens(text) {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Estimated tokens of a request's text blocks (pictures are not counted as text). @param {{ text?: string, image?: string }[]} blocks */
export function promptTokens(blocks) {
  return blocks.filter((b) => !b.image).reduce((n, b) => n + textTokens(b.text ?? "") + 2, 0);
}

/**
 * Split text into chunks of at most maxChars, at line boundaries (a line longer than the budget is
 * cut at a space). Blank lines are kept inside a chunk, and a chunk never starts mid-line.
 * @param {string} text @param {number} maxChars
 * @returns {string[]}
 */
export function chunkLines(text, maxChars) {
  /** @type {string[]} */
  const out = [];
  let current = "";
  const push = () => {
    if (current.trim()) out.push(current.trimEnd());
    current = "";
  };
  for (const raw of text.split("\n")) {
    let line = raw;
    while (line.length > maxChars) {
      const cut = line.lastIndexOf(" ", maxChars);
      const at = cut > maxChars / 2 ? cut : maxChars;
      push();
      out.push(line.slice(0, at));
      line = line.slice(at).trimStart();
    }
    if (current.length + line.length + 1 > maxChars) push();
    current += (current ? "\n" : "") + line;
  }
  push();
  return out;
}

/**
 * Scene ranges for one chapter, each at most maxScenes long, contiguous and complete.
 * @param {number} first the chapter's first scene number (1 for SC0001)
 * @param {number} last the chapter's last scene number, inclusive
 * @param {number} maxScenes
 */
export function sceneGroups(first, last, maxScenes) {
  const size = Math.max(1, Math.floor(maxScenes));
  /** @type {{ first: number, last: number }[]} */
  const out = [];
  for (let n = first; n <= last; n += size) out.push({ first: n, last: Math.min(last, n + size - 1) });
  return out.length ? out : [{ first, last }];
}

/**
 * The clock of scene `number` in a chapter that starts at `startSeconds` and lasts `endSeconds`.
 * Scenes of a chapter share its time evenly, which is the budget the brief gave them.
 * @param {number} startSeconds @param {number} endSeconds @param {number} first @param {number} last @param {number} number
 */
export function sceneClock(startSeconds, endSeconds, first, last, number) {
  const count = Math.max(1, last - first + 1);
  const each = (endSeconds - startSeconds) / count;
  const begin = startSeconds + (number - first) * each;
  return `${toClock(begin)}-${toClock(begin + each)}`;
}

/**
 * Group the research file's facts so each group's JSON fits maxChars; nothing is dropped and a fact is
 * never cut in half. A file that is not the expected JSON becomes one group of plain text.
 * @param {string} researchText @param {number} maxChars
 * @returns {{ facts: any[], text: string }[]}
 */
export function factGroups(researchText, maxChars) {
  /** @type {any} */
  let data = null;
  try {
    data = JSON.parse(researchText);
  } catch {
    data = null;
  }
  const facts = Array.isArray(data?.facts) ? data.facts : null;
  if (!facts || !facts.length) {
    const text = researchText.slice(0, maxChars);
    return [{ facts: [], text }];
  }
  /** @type {{ facts: any[], text: string }[]} */
  const out = [];
  /** @type {any[]} */
  let group = [];
  for (const fact of facts) {
    const candidate = [...group, fact];
    const text = JSON.stringify({ ...data, facts: candidate });
    if (group.length && text.length > maxChars) {
      out.push({ facts: group, text: JSON.stringify({ ...data, facts: group }) });
      group = [fact];
    } else group = candidate;
  }
  if (group.length) out.push({ facts: group, text: JSON.stringify({ ...data, facts: group }) });
  return out;
}

/**
 * The ledger rows a chapter writer needs, without the columns it never acts on (sources, confidence,
 * conflicts): the same rows, word for word, so no claim is changed, only the evidence columns are left
 * for the QA desk. A table that cannot be read is chunked instead (never dropped).
 * @param {string} markdown the S2 ledger @param {number} maxChars
 */
export function claimDigest(markdown, maxChars) {
  const lines = markdown.split("\n");
  const rows = lines.filter((l) => /^\s*\|/.test(l));
  if (rows.length < 4) return chunkLines(markdown, maxChars);
  const cells = (/** @type {string} */ l) => l.replace(/^\s*\||\|\s*$/g, "").split("|").map((c) => c.trim());
  const header = cells(rows[0]);
  const keep = header.map((h, i) => (/^(id|claim|status|value|chip|wording|chapter|use|note)/i.test(h) ? i : -1)).filter((i) => i >= 0);
  if (keep.length < 2) return chunkLines(markdown, maxChars);
  const row = (/** @type {string} */ l) => `| ${keep.map((i) => cells(l)[i] ?? "").join(" | ")} |`;
  const text = [row(rows[0]), "| --- | --- |", ...rows.slice(1).map(row)].join("\n");
  return chunkLines(text, maxChars);
}

/**
 * One named block of a stage's output (a heading containing `name`, to the next heading of the same or
 * a higher level). Empty when the block is not there, so a caller can fall back to the whole text.
 * @param {string} markdown @param {RegExp} name
 */
export function sectionFrom(markdown, name) {
  const lines = markdown.split("\n");
  const at = lines.findIndex((l) => /^#{1,6}\s/.test(l) && name.test(l));
  if (at < 0) return "";
  const level = (/^#+/.exec(lines[at])?.[0] ?? "#").length;
  let end = lines.length;
  for (let i = at + 1; i < lines.length; i += 1) {
    const h = /^#{1,6}\s/.exec(lines[i]);
    if (h && h[0].trim().length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(at, end).join("\n").trim();
}

/**
 * Merge a stage's parts back into its one output: markdown parts in order, separated by a blank line.
 * Empty parts are dropped, and a part that repeats the previous part's last line is not duplicated.
 * @param {string[]} parts
 */
export function mergeParts(parts) {
  /** @type {string[]} */
  const kept = [];
  for (const raw of parts) {
    const part = String(raw ?? "").trim();
    if (!part) continue;
    if (kept.length) {
      const before = kept[kept.length - 1].split("\n").slice(-1)[0];
      const lines = part.split("\n");
      if (lines[0] === before) kept.push(lines.slice(1).join("\n").trim());
      else kept.push(part);
    } else kept.push(part);
  }
  return kept.filter(Boolean).join("\n\n");
}

/**
 * Merge parts of a stage that answers with fenced JSON: the arrays (or objects) are joined in order.
 * A part that is not JSON is kept as text under `_unparsed` so nothing the brain wrote is lost.
 * @param {any[]} answers
 * @param {"array" | "object"} shape
 * @returns {any[] | Record<string, any>}
 */
export function mergeJson(answers, shape) {
  if (shape === "array") {
    /** @type {any[]} */
    const out = [];
    for (const a of answers) {
      if (Array.isArray(a)) out.push(...a);
      else if (a && typeof a === "object") out.push(...Object.values(a).filter((v) => v != null));
    }
    return out;
  }
  /** @type {Record<string, any>} */
  const out = {};
  for (const a of answers) {
    if (!a || typeof a !== "object" || Array.isArray(a)) continue;
    for (const [k, v] of Object.entries(a)) {
      const had = out[k];
      if (Array.isArray(had) && Array.isArray(v)) had.push(...v);
      else if (had === undefined) out[k] = v;
    }
  }
  return out;
}
