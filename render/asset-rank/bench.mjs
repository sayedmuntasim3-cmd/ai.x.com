#!/usr/bin/env node
/**
 * What the picture pass costs a long film, before and after the speed work (mission S1): a calculator over
 * the two measured runs, so the arithmetic in the PR is one command and not a claim.
 *
 *   node render/asset-rank/bench.mjs [--shots 600] [--candidates 225] [--secondsPerImage 0.054]
 *                                    [--cap 40] [--decisive 0.03] [--minutes 40]
 *
 * The decisive share defaults to 0.03 because that is what the 40-shot fixture measures (1 of 40 shots has
 * one clip carrying all three searches with nothing close behind); it is a bonus, not the main saving.
 *
 * Where the numbers come from (no estimate is invented here):
 *   - 199-253 candidates per shot: run 46093217850 (the 38 s Apollo film), 2193 over 12 shots.
 *   - 121 minutes for the picture stage of a 40-minute film: run 45931770358 (Tacoma Narrows),
 *     pictures 03:19 to render 05:20.
 *   - 18 minutes to render the same film in 8 parts: render 05:20, final check 05:38.
 * The per-image cost is therefore 7260 s / (600 shots x 225 candidates) = 0.054 s, which is what the long
 * film's own clock says; the 38 s film's 270 s / 2193 = 0.123 s is higher because 12 shots pay the model
 * load whole. Both are printed, so the reader can judge.
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    shots: { type: "string", default: "600" },
    candidates: { type: "string", default: "225" },
    secondsPerImage: { type: "string", default: "0.054" },
    cap: { type: "string", default: "40" },
    decisive: { type: "string", default: "0.03" },
    minutes: { type: "string", default: "40" },
    partsBefore: { type: "string", default: "8" },
    partsAfter: { type: "string", default: "16" },
  },
});

const shots = Number(values.shots);
const candidates = Number(values.candidates);
const perImage = Number(values.secondsPerImage);
const cap = Number(values.cap);
const decisive = Number(values.decisive);
const minutes = Number(values.minutes);
const partsBefore = Number(values.partsBefore);
const partsAfter = Number(values.partsAfter);

const mmss = (/** @type {number} */ s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const row = (/** @type {string} */ stage, /** @type {number} */ before, /** @type {number} */ after) =>
  `${stage.padEnd(34)} ${mmss(before).padStart(7)} ${mmss(after).padStart(8)} ${(before > 0 ? `${Math.round((after / before) * 100)}%` : "-").padStart(6)}`;

const imagesBefore = shots * candidates;
const imagesAfter = Math.round(shots * (1 - decisive) * Math.min(candidates, cap));
const seeBefore = imagesBefore * perImage;
const seeAfter = imagesAfter * perImage;

// The render was 18 minutes in 8 parts for the 40-minute film; the picture part scales with the parts,
// and the join does not (it copies the parts together and mixes the sound once).
const RENDER_8 = 18 * 60;
const pictureShare = 0.85;
const render = (/** @type {number} */ parts) => RENDER_8 * (pictureShare / (parts / 8) + (1 - pictureShare));

const totalBefore = seeBefore + render(partsBefore);
const totalAfter = seeAfter + render(partsAfter);

console.log(`A ${minutes}-minute voice film, ${shots} shots, ${candidates} candidates a shot (measured 199-253), ${perImage} s an image.\n`);
console.log(`${"stage".padEnd(34)} ${"before".padStart(7)} ${"after".padStart(8)} ${"after/before".padStart(6)}`);
console.log("-".repeat(58));
console.log(row(`pictures: download + embed`, seeBefore, seeAfter));
console.log(row(`render: ${partsBefore} -> ${partsAfter} parts`, render(partsBefore), render(partsAfter)));
console.log("-".repeat(58));
console.log(`${row("pictures + render", totalBefore, totalAfter)}\n`);
console.log(`Images downloaded and embedded: ${imagesBefore.toLocaleString("en-US")} -> ${imagesAfter.toLocaleString("en-US")} (${Math.round((imagesAfter / imagesBefore) * 100)}%).`);
console.log(`Shots the eyes look at: ${shots} -> ${Math.round(shots * (1 - decisive))}.`);
console.log(`Shots settled by their own words, never downloaded: ${Math.round(shots * decisive)} of ${shots} (assumed share; it is printed per film as "textDecided" in rank-C1.json).`);
console.log(`The 38 s film's own rate (0.123 s an image) would make the before column ${mmss(imagesBefore * 0.123)}; the long film's clock is the one used.`);
console.log(`Search and listen/plan are not modelled here: their real numbers are printed by each run (rank-C1.json seconds.search, run/film-timing.json).`);
