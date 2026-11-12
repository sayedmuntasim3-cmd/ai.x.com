#!/usr/bin/env node
/**
 * Bossism's release gate for the renderer. Exits 0 when the film may go on,
 * 1 when it must stop, printing why in English and Bengali.
 *
 *   Before rendering (nothing is spent on a film that may not be released):
 *     node render/release-gate.mjs --api https://ai.zupona.com --id <film id>
 *     node render/release-gate.mjs --run films/<folder>
 *   After rendering, before publishing (the master itself is measured):
 *     node render/release-gate.mjs --report out/<id>.report.json --file out/<id>.mp4
 *
 * A film is cleared when its latest review allows release, or the owner
 * approved it with a written reason after that review (decisions.json).
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { cleared, masterGate } from "../engine/src/bossism.mjs";
import { say } from "../engine/src/messages.mjs";

/** @param {string} file @returns {Promise<number | null>} seconds, from the file itself */
export function probeSeconds(file, ffprobe = "ffprobe") {
  return new Promise((ok) => {
    const p = spawn(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.on("error", () => ok(null));
    p.on("close", (code) => { const n = Number(out.trim()); ok(code === 0 && Number.isFinite(n) ? n : null); });
  });
}

/** @param {{ code: string, params?: any }} m */
const both = (m) => `${say(m, "en")}\n${say(m, "bn")}`;

/**
 * @param {string[]} argv
 * @param {{ fetch?: typeof fetch, print?: (line: string) => void, probe?: (file: string) => Promise<number | null> }} [deps]
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, deps = {}) {
  const print = deps.print ?? ((/** @type {string} */ l) => console.log(l));
  const { values } = parseArgs({ args: argv, options: { api: { type: "string" }, id: { type: "string" }, run: { type: "string" }, report: { type: "string" }, file: { type: "string" } } });

  if (values.report) {
    const report = existsSync(values.report) ? JSON.parse(readFileSync(values.report, "utf8")) : null;
    const measuredSeconds = values.file && existsSync(values.file) ? await (deps.probe ?? probeSeconds)(values.file) : null;
    const g = masterGate(report, { measuredSeconds });
    writeFileSync(values.report.replace(/\.report\.json$/, "") + ".master-gate.json", JSON.stringify({ ...g, measuredSeconds, at: new Date().toISOString() }, null, 1));
    for (const f of g.findings) print(`${f.severity.toUpperCase()}: ${both(f.message)}`);
    print(both({ code: `gate.${g.verdict}`, params: { gate: "master" } }));
    return g.verdict === "block" ? 1 : 0;
  }

  /** @param {string} name @returns {Promise<any>} */
  let read;
  if (values.run) {
    const dir = resolve(values.run);
    read = async (name) => { const f = join(dir, name); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null; };
  } else if (values.api && values.id) {
    if (!/^[0-9a-f-]{36}$/.test(values.id)) { print("Bad film ID."); return 1; }
    const get = deps.fetch ?? fetch;
    read = async (name) => {
      const res = await get(`${values.api}/api/films/${values.id}/files/${name}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`The studio answered ${res.status} for ${name}.`);
      return res.json();
    };
  } else {
    print("Give --api and --id, --run <folder>, or --report <report.json>.");
    return 1;
  }
  const review = await read("review.json");
  if (!review) {
    print("This film has no review yet, so it is not cleared for release. Start a render from the studio, which reviews it first.\nএই ফিল্মের এখনো কোনো রিভিউ হয়নি, তাই প্রকাশের অনুমতি নেই। স্টুডিও থেকে রেন্ডার শুরু করুন; সেটি আগে রিভিউ করবে।");
    return 1;
  }
  const decision = cleared(review, (await read("decisions.json")) ?? []);
  for (const g of review.gates ?? []) print(both({ code: `gate.${g.verdict}`, params: { gate: g.id } }));
  if (decision.ok) {
    print(decision.by === "owner" ? "Cleared by the owner's approval.\nমালিকের অনুমতিতে ছাড়পত্র দেওয়া হয়েছে।" : both(review.release.message));
    return 0;
  }
  print(both(review.release.message));
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
