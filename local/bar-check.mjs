#!/usr/bin/env node
/**
 * The daily scorecard, advisory: judge a finished film's report against the reference bar
 * (engine/src/reference-bar.mjs). Never blocks, never changes a gate.
 *   node local/bar-check.mjs --report out/<film>.report.json [--json]
 * Rules whose measure the report does not carry read "unknown": watch the film and fill them by hand
 * (docs/AUTOPILOT.md, "Raise the bar").
 */
import { readFileSync } from "node:fs";
import { barMeasuresFromReport, barSummary, checkBar } from "../engine/src/reference-bar.mjs";

const args = process.argv.slice(2);
const at = args.indexOf("--report");
if (at < 0 || !args[at + 1]) { console.error("Usage: node local/bar-check.mjs --report out/<film>.report.json [--json]"); process.exit(2); }
const rows = checkBar(barMeasuresFromReport(JSON.parse(readFileSync(args[at + 1], "utf8"))));
if (args.includes("--json")) console.log(JSON.stringify({ summary: barSummary(rows), rows }, null, 1));
else {
  for (const r of rows) console.log(`${r.result.toUpperCase().padEnd(7)} rule ${String(r.rule).padStart(2)}  ${r.label}${r.value === null ? "" : ` (got ${r.value} ${r.unit}, limit ${r.limit})`}`);
  const s = barSummary(rows);
  console.log(`\n${s.pass} pass, ${s.fail} fail, ${s.unknown} unknown of ${s.total}. Unknown = not in the report: watch the film.`);
}
