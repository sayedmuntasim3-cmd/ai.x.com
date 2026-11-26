#!/usr/bin/env node
/**
 * The Craft Ledger in the terminal.
 *
 *   node local/craft-memory.mjs --report out/<film>.report.json --id <filmId> [--genre history] [--at ISO]
 *   node local/craft-memory.mjs --brief [--genre history]
 *   node local/craft-memory.mjs --show
 *
 * `--report` adds or updates one finished film. `--brief` prints the targets
 * the next film of that genre is judged against, and says whether each one is
 * learned from the channel's own films or still the house standard. The ledger
 * file is JSON and meant to be kept (out/craft-ledger.json by default; pass
 * --ledger <path> to keep it in the repository instead).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { msg } from "../engine/src/messages.mjs";
import { lessonsText } from "../engine/src/retention.mjs";
import {
  METRICS,
  MIN_FILMS,
  addAudience,
  addRecord,
  calibratedDoctrine,
  craftIndex,
  emptyLedger,
  ledgerJson,
  measuresFromReport,
  parseLedger,
  recordFromReport,
} from "../engine/src/craft-memory.mjs";

/**
 * One message in both languages. @param {string} code @param {Record<string, string | number>} [params]
 */
function say(code, params = {}) {
  const m = msg(code, params);
  console.log(`${m.en}\n${m.bn}`);
}

/**
 * A bare number or band, for quoting the house standard. @param {any} v
 */
function plain(v) {
  return Array.isArray(v) ? `${v[0]}–${v[1]}` : String(v);
}

/**
 * A target as a person reads it. @param {any} target
 */
function shown(target) {
  const v = target.value;
  if (Array.isArray(v)) return `${v[0]}–${v[1]}`;
  return target.kind === "min" ? `at least ${v}` : target.kind === "max" ? `at most ${v}` : String(v);
}

/** @param {string} file */
function readLedger(file) {
  if (!existsSync(file)) return emptyLedger();
  const { ledger, notes } = parseLedger(readFileSync(file, "utf8"));
  for (const note of notes) say(note.code, note.params ?? {});
  return ledger;
}

function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      report: { type: "string" },
      retention: { type: "string" },
      timeline: { type: "string" },
      id: { type: "string" },
      genre: { type: "string", default: "default" },
      at: { type: "string" },
      ledger: { type: "string", default: "out/craft-ledger.json" },
      brief: { type: "boolean", default: false },
      show: { type: "boolean", default: false },
    },
  });
  const path = resolve(String(values.ledger));
  const ledger = readLedger(path);

  if (values.show) {
    if (!ledger.films.length) say("craft.empty", { needed: MIN_FILMS });
    for (const film of ledger.films) {
      const targets = calibratedDoctrine(ledger, film.genre);
      console.log(`${film.at.slice(0, 10)}  ${film.filmId.padEnd(24)} ${film.genre.padEnd(10)} ${film.verdict.padEnd(7)} craft ${craftIndex(film.measures, targets)}`);
    }
    return 0;
  }

  if (values.retention) {
    if (!existsSync(String(values.retention))) {
      console.error(`No retention report at ${values.retention}`);
      return 2;
    }
    const retention = JSON.parse(readFileSync(String(values.retention), "utf8"));
    const made = addAudience(ledger, { filmId: String(values.id ?? retention.filmId ?? ""), retention, at: values.at ?? new Date().toISOString() });
    say(made.note.code, made.note.params ?? {});
    if (!made.ok) return 1;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, ledgerJson(made.ledger));
    // Where viewers left and stayed, for the next film's writers: the only notes the audience writes.
    const lessons = lessonsText([retention], 1);
    if (lessons) console.log(lessons);
    return 0;
  }

  if (values.report) {
    if (!existsSync(String(values.report))) {
      console.error(`No report at ${values.report}`);
      return 2;
    }
    const report = JSON.parse(readFileSync(String(values.report), "utf8"));
    const made = recordFromReport({
      filmId: String(values.id ?? ""),
      report,
      genre: String(values.genre),
      at: values.at ?? new Date().toISOString(),
    });
    for (const note of made.notes) say(note.code, note.params ?? {});
    if (!made.ok) return 1;
    const { ledger: next, added, dropped } = addRecord(ledger, made.record);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, ledgerJson(next));
    say("craft.added", {
      filmId: made.record.filmId,
      genre: made.record.genre,
      verdict: made.record.verdict,
      seconds: made.record.seconds,
      films: next.films.length,
    });
    for (const gone of dropped) console.log(`dropped the oldest film: ${gone}`);
    console.log(added === "replaced" ? "(the earlier reading of this film was replaced)" : "");
    return 0;
  }

  // --brief, or nothing: print where the next film stands.
  const doctrine = calibratedDoctrine(ledger, String(values.genre));
  const measured = values.report && existsSync(String(values.report)) ? measuresFromReport(JSON.parse(readFileSync(String(values.report), "utf8"))).measures : null;
  if (!doctrine.films) say("craft.empty", { needed: MIN_FILMS });
  for (const [key, spec] of Object.entries(METRICS)) {
    const target = doctrine.targets[/** @type {any} */ (key)];
    const value = shown(target);
    const params = {
      genre: doctrine.genre,
      metric: spec.en,
      films: target.films,
      needed: Math.max(0, MIN_FILMS - target.films),
      value,
      house: plain(target.house),
    };
    const line = msg(target.source === "learned" ? "craft.learned" : "craft.doctrine", params);
    console.log(`${line.en}\n  ${line.bn}`);
  }
  if (measured) {
    const index = craftIndex(measured, doctrine);
    say("craft.index", { index, filmId: String(values.id ?? "this film"), genre: doctrine.genre });
  }
  return 0;
}

process.exitCode = main();
