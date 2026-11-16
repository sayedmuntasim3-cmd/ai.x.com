#!/usr/bin/env node
/**
 * The minimal context for the Phase 0 experiment: only the parts of the
 * production manual that the script stages (S0-S7, script only) use, built
 * deterministically from the manual so nothing is rewritten by hand and the
 * craft being tested stays the manual's own.
 *
 * Left out, with the reason: the header (platform address, chat copy
 * instructions); the description of Zupona's internal agent squads in 0
 * (internal architecture; replaced by "an automated production pipeline");
 * the Bangla defaults in 0 and 1.1; 1.2 Bangla standard and 1.5 chat switching (the brief's
 * VERSION LOCK sets en-US); section 2 except the stage list (chat protocol;
 * PIPELINE MODE in film-run.mjs already overrides it); the Bangla default in
 * 4.1; S7 items 7, 9 and 10 (localisation, channel measurement plan,
 * Facebook pack: operations, not script); the Bangla examples in 15 and
 * the Bangla banned-phrase line in 16 (the other banned lists stay);
 * section 17 (channel growth strategy) and 18 (chat start).
 *
 *   node local/experiment-context.mjs            writes prompts/phase0-context.txt
 *   node local/experiment-context.mjs --check    fails if the file is out of date
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const MANUAL_FILE = join(ROOT, "prompts/1-zupona-master-engine-full.txt");
export const CONTEXT_FILE = join(ROOT, "prompts/phase0-context.txt");

const BENGALI = /[\u0980-\u09FF]/;

/** Sections kept whole or filtered (by manual section number); everything else is left out. */
const KEEP = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14", "15", "16"]);

/**
 * @param {string} manual the production manual
 * @returns {{ text: string, kept: string[], dropped: string[] }}
 */
export function buildExperimentContext(manual) {
  const lines = manual.replace(/\r\n/g, "\n").split("\n");
  const rule = (/** @type {string | undefined} */ l) => /^={20,}$/.test(String(l ?? ""));
  /** @type {{ id: string, title: string, body: string[] }[]} */
  const sections = [{ id: "header", title: "header", body: [] }];
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^(\d{1,2})\. (.+)$/.exec(lines[i]);
    if (m && rule(lines[i - 1]) && rule(lines[i + 1])) { sections.push({ id: m[1], title: lines[i], body: [] }); i += 1; continue; }
    if (/^NON-NEGOTIABLES\b/.test(lines[i]) && rule(lines[i - 1])) { sections.push({ id: "rules", title: lines[i], body: [] }); i += 1; continue; }
    if (!rule(lines[i])) sections[sections.length - 1].body.push(lines[i]);
  }
  /** @type {string[]} */
  const kept = [];
  /** @type {string[]} */
  const dropped = [];
  /** @type {string[]} */
  const out = ["ZUPONA DOCUMENTARY ENGINE: SCRIPT CONTEXT (Phase 0 experiment; selected sections of the production manual)", ""];
  for (const s of sections) {
    if (s.id !== "rules" && !KEEP.has(s.id)) { dropped.push(s.title); continue; }
    let body = s.body;
    if (s.id === "0") body = body.map((l) => l.replace(" (Bangla by default)", "").replace(/Zupona's autonomous pipeline \([^)]*\)/, "an automated production pipeline"));
    if (s.id === "1") body = dropBlock(dropBlock(body, /^1\.2 /), /^1\.5 /).map((l) => l.replace(" (default Bangla)", "").replace(/ Mark defaults as "[^"]*" in Bangla runs\./, ""));
    if (s.id === "2") body = body.filter((l) => /^S\d\s/.test(l));
    if (s.id === "4") body = body.filter((l) => !/^- Language: Bangla/.test(l));
    if (s.id === "14") body = dropBlock(dropBlock(dropBlock(body, /^7\. Localisation/), /^9\. Measurement plan/), /^10\. Facebook pack/);
    if (s.id === "15") body = dropBangla(body).filter((l) => !BENGALI.test(l));
    if (s.id === "16") body = body.filter((l) => !/^Bangla narration and titles:/.test(l));
    kept.push(s.title);
    out.push("=".repeat(66), s.title, "=".repeat(66), ...body);
  }
  return { text: out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n", kept, dropped };
}

/** Remove the item starting at a line that matches, up to the next numbered item or blank line. @param {string[]} body @param {RegExp} start */
function dropBlock(body, start) {
  /** @type {string[]} */
  const out = [];
  let skipping = false;
  for (const l of body) {
    if (start.test(l)) { skipping = true; continue; }
    if (skipping && (/^\d{1,2}(\.\d+)? /.test(l) || !l.trim())) skipping = false;
    if (!skipping) out.push(l);
  }
  return out;
}

/** Remove Bangla example pairs: a "(bn)" line, its "Why it fails" and TTS notes. @param {string[]} body */
function dropBangla(body) {
  /** @type {string[]} */
  const out = [];
  let skipping = false;
  for (const l of body) {
    if (/\((bn)\)/.test(l)) { skipping = true; continue; }
    if (skipping && /^\s+(Why|\()/.test(l)) continue;
    skipping = false;
    out.push(l);
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manual = readFileSync(MANUAL_FILE, "utf8");
  const { text, kept, dropped } = buildExperimentContext(manual);
  const sha = createHash("sha256").update(text).digest("hex");
  if (process.argv.includes("--check")) {
    const now = readFileSync(CONTEXT_FILE, "utf8");
    if (now !== text) { console.error("prompts/phase0-context.txt is out of date: run node local/experiment-context.mjs"); process.exit(1); }
  } else writeFileSync(CONTEXT_FILE, text);
  console.log(`${Buffer.byteLength(text)} bytes (manual ${Buffer.byteLength(manual)}), sha256 ${sha}`);
  console.log(`kept: ${kept.join(" | ")}`);
  console.log(`dropped: ${dropped.join(" | ")}`);
}
