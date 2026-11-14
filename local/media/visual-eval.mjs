/**
 * Precision and recall of the films' visual checks on a labelled set:
 *   node local/media/visual-eval.mjs --items pool/items.json --labels local/media/validation/labels.json [--md]
 * items.json comes from local/media/eval_pool.py (the check's scores);
 * labels.json says what was seen in each picture, keyed by its Commons file
 * title: { "File:X.jpg": ["people", "building", "manmade", "art"] } (an empty
 * list is a clean landscape photo).
 * For each category: the refusal rule (VISUAL_RULES) and the review band
 * (DOUBT_RULES), counted as true and false positives and negatives.
 */
import { readFile } from "node:fs/promises";
import { DOUBT_RULES, VISUAL_RULES, frameDoubts, frameVerdict } from "../quran-media.mjs";

/** The score each category is judged on, from one item's look. @type {Record<string, (l: any, it: any) => number>} */
export const SCORE = {
  // The rule of frameVerdict: the OpenCV detectors refuse only with the image-text model's agreement (>= the review
  // band); alone they send the picture to review.
  people: (l, it) => { const w = l.walkers ?? 0; return it.faces || it.people ? (w >= DOUBT_RULES.walkers ? 1 : DOUBT_RULES.walkers) : w; },
  building: (l) => l.building ?? 0,
  manmade: (l) => l.manmade ?? 0,
  art: (l) => (l.painting ?? 0) + (l.drawing ?? 0) + (l.rendering ?? 0),
};
/** @type {Record<string, [number, number]>} refusal threshold, review threshold */
export const LIMITS = {
  people: [VISUAL_RULES.walkers, DOUBT_RULES.walkers],
  building: [VISUAL_RULES.building, DOUBT_RULES.building],
  manmade: [VISUAL_RULES.manmade, DOUBT_RULES.manmade],
  art: [VISUAL_RULES.notPhotograph, DOUBT_RULES.art],
};

/**
 * @param {{ n: number, title?: string, look: any, faces?: number, people?: number }[]} items @param {Record<string, string[]>} labels keyed by title (or by n)
 */
export function evaluate(items, labels) {
  const key = (/** @type {{ n: number, title?: string }} */ it) => (it.title && labels[it.title] ? it.title : String(it.n));
  const labelled = items.filter((it) => it.look && labels[key(it)]);
  /** @type {Record<string, any>} */
  const out = { pictures: labelled.length };
  for (const cat of Object.keys(SCORE)) {
    const [refuse, review] = LIMITS[cat];
    const rows = labelled.map((it) => ({ n: it.n, truth: labels[key(it)].includes(cat), score: SCORE[cat](it.look, it) }));
    /** @param {number} at */
    const at = (at) => {
      const tp = rows.filter((r) => r.truth && r.score >= at), fp = rows.filter((r) => !r.truth && r.score >= at);
      const fn = rows.filter((r) => r.truth && r.score < at), tn = rows.filter((r) => !r.truth && r.score < at);
      return { threshold: at, tp: tp.length, fp: fp.length, fn: fn.length, tn: tn.length,
        precision: tp.length + fp.length ? round(tp.length / (tp.length + fp.length)) : null, recall: tp.length + fn.length ? round(tp.length / (tp.length + fn.length)) : null,
        falsePositives: fp.map((r) => r.n), falseNegatives: fn.map((r) => r.n) };
    };
    out[cat] = { positives: rows.filter((r) => r.truth).length, refused: at(refuse), refusedOrReviewed: at(review) };
  }
  // What the films' check would do with each picture (relevance aside: it depends on the search).
  /** @type {Record<string, { refused: number, review: number, passed: number, passedIds: number[] }>} */
  const decision = { clean: { refused: 0, review: 0, passed: 0, passedIds: [] }, problem: { refused: 0, review: 0, passed: 0, passedIds: [] } };
  for (const it of labelled) {
    const d = decision[labels[key(it)].length ? "problem" : "clean"];
    const item = /** @type {any} */ ({ frames: 1, faces: it.faces ?? 0, people: it.people ?? 0, look: { ...it.look, relevance: null }, sideways: /** @type {any} */ (it).sideways, exposure: /** @type {any} */ (it).exposure, dhash: [] });
    if (frameVerdict(item)) d.refused += 1;
    else if (frameDoubts(item).length) d.review += 1;
    else { d.passed += 1; d.passedIds.push(it.n); }
  }
  out.decision = decision;
  return out;
}

/** @param {number} x */
const round = (x) => Math.round(x * 1000) / 1000;

/** @param {any} r */
export function evalTable(r) {
  const lines = [`${r.pictures} labelled pictures.`, "", "| Check | Positives | Refused: precision / recall (FP, FN) | Refused or sent to review: precision / recall (FP, FN) |", "|---|---|---|---|"];
  for (const cat of Object.keys(SCORE)) {
    const c = r[cat];
    const f = (/** @type {any} */ x) => `${x.precision ?? "-"} / ${x.recall ?? "-"} (${x.fp}, ${x.fn}) at ${x.threshold}`;
    lines.push(`| ${cat} | ${c.positives} | ${f(c.refused)} | ${f(c.refusedOrReviewed)} |`);
  }
  const d = r.decision;
  lines.push("", "| The films' check, whole | Refused | Sent to a person | Passed silently |", "|---|---|---|---|");
  lines.push(`| Clean landscape photos (${d.clean.refused + d.clean.review + d.clean.passed}) | ${d.clean.refused} | ${d.clean.review} | ${d.clean.passed} |`);
  lines.push(`| Pictures with people, buildings, man-made things or art (${d.problem.refused + d.problem.review + d.problem.passed}) | ${d.problem.refused} | ${d.problem.review} | ${d.problem.passed} (${d.problem.passedIds.join(", ")}) |`);
  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const get = (/** @type {string} */ k) => args[args.indexOf(k) + 1];
  const items = JSON.parse(await readFile(get("--items"), "utf8")).items;
  const labels = JSON.parse(await readFile(get("--labels"), "utf8")).labels;
  const r = evaluate(items, labels);
  console.log(args.includes("--md") ? evalTable(r) : JSON.stringify(r, null, 1));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
