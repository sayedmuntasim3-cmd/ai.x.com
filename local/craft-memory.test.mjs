import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { recordFilm } from "./craft-memory.mjs";
import { calibratedDoctrine, parseLedger } from "../engine/src/craft-memory.mjs";

test("two films in a row: the second reads the first's record from the ledger file", () => {
  const dir = mkdtempSync(join(tmpdir(), "craft-"));
  try {
    const file = join(dir, "out", "craft-ledger.json");
    const report = (/** @type {number} */ avg) => ({ critic: { verdict: "pass", measures: { seconds: 180, movingShare: 0.7, designedPerMinute: 2, avgShot: avg, narrationCoverage: 1, cutsIn30: 8, longestShot: 7, cueCoverage: 0.9, subtitles: { maxGap: 2 } } } });
    const first = recordFilm({ file, filmId: "slice-1", report: report(4), genre: "biography", at: "2026-11-26T10:00:00Z" });
    assert.match(first.join("\n"), /The ledger now holds 1 film/);
    const read = parseLedger(readFileSync(file, "utf8")).ledger;
    assert.equal(calibratedDoctrine(read, "biography").films, 1, "the next film sees the first");
    const second = recordFilm({ file, filmId: "slice-2", report: report(4.2), genre: "biography", at: "2026-11-26T11:00:00Z" });
    assert.match(second.join("\n"), /holds 2 film/);
    assert.match(second.join("\n"), /লেজারে এখন/);
    // A broken path never throws: the film is fine, the line says why.
    const bad = recordFilm({ file: join(file, "nested", "x.json"), filmId: "slice-3", report: report(4), genre: "biography" });
    assert.match(bad.join("\n"), /could not be written to the craft ledger/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
