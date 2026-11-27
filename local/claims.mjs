#!/usr/bin/env node
/**
 * Fill a script's dollar placeholders from the official series, never by hand.
 *
 *   node local/claims.mjs --run productions/ramesh-babu/USA --preview
 *   node local/claims.mjs --run productions/ramesh-babu/USA --apply
 *
 * It reads the rupee amounts and years from S2's ledger, fetches
 * FRED AEXINUS (annual average, rupees per US dollar) and FRED CPIAUCSL
 * (BLS CPI-U, monthly), computes each value by the film's own C10 method,
 * records the provenance in claim-values.json, then rewrites the NARR field
 * (as spoken words) and the OST field (as on-screen figures) of the S5
 * chapters. Every other field is left exactly as written, and a chapter is
 * backed up before it is touched. A placeholder with no priced value is
 * reported and left alone.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { annualAverages, ledgerClaims, parseFredCsv, resolvePlaceholders, usdFromRupees } from "../engine/src/claim-values.mjs";

const UA = "ZuponaStudio/1.0 (https://github.com/sayedmuntasim3-cmd/ai.x.com)";

/** @param {string} url */
async function get(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(45_000) });
      if (res.ok) return await res.text();
      if (res.status < 500 && res.status !== 429) throw new Error(`${url} answered ${res.status}`);
    } catch (error) {
      if (attempt === 2) throw error;
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw new Error(`${url} did not answer`);
}

/** The series, with the values the film's method needs. */
export async function fetchSeries() {
  const [aex, cpi] = await Promise.all([
    get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=AEXINUS"),
    get("https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL"),
  ]);
  /** @type {Record<string, number>} */
  const rates = {};
  for (const row of parseFredCsv(aex)) rates[String(Number(row.date.slice(0, 4)))] = row.value;
  const monthly = parseFredCsv(cpi);
  const annual = annualAverages(monthly);
  const last = monthly[monthly.length - 1];
  const [year, month] = last.date.split("-").map(Number);
  return {
    fetchedAt: new Date().toISOString().slice(0, 10),
    series: { rate: "FRED AEXINUS (India / U.S. Foreign Exchange Rate, annual average, INR per USD)", index: "FRED CPIAUCSL (BLS CPI-U, all urban consumers, monthly)" },
    rates,
    cpi: { annual, latest: { year, month, value: last.value } },
    sources: { rate: "https://fred.stlouisfed.org/series/AEXINUS", index: "https://fred.stlouisfed.org/series/CPIAUCSL" },
  };
}

/**
 * Every priced claim of the ledger, with its value.
 * @param {string} s2 @param {Awaited<ReturnType<typeof fetchSeries>>} series
 */
export function priceClaims(s2, series) {
  /** @type {Record<string, any>} */
  const claims = {};
  /** @type {{ id: string, why: string }[]} */
  const unpriced = [];
  for (const claim of Object.values(ledgerClaims(s2))) {
    if (!claim.rupees) { unpriced.push({ id: claim.id, why: "the ledger prices no rupee amount for it" }); continue; }
    const usd = usdFromRupees(claim.rupees, series.rates, series.cpi);
    if (!usd) { unpriced.push({ id: claim.id, why: "no rate or index for its year" }); continue; }
    // The series travel with the claim, so a chart's dated point can be priced on its own.
    claims[claim.id] = { rupees: claim.rupees, usd, cell: claim.cell, rates: series.rates, cpi: series.cpi };
  }
  return { claims, unpriced };
}

/** Fields a placeholder may be filled in: the narration and the on-screen text. */
const FIELD = /(^|\|\s*)(NARR|OST):\s/;

/**
 * Rewrite one chapter's NARR and OST fields. Other fields keep their text
 * (an ANCHOR or a QA note is an audit trail, not something the film shows).
 * @param {string} markdown @param {Record<string, any>} claims
 * @returns {{ text: string, changed: number, unresolved: string[], resolved: { token: string, value: string }[] }}
 */
export function fillChapter(markdown, claims) {
  /** @type {string[]} */
  const unresolved = [];
  /** @type {{ token: string, value: string }[]} */
  const resolved = [];
  let changed = 0;
  const lines = String(markdown).split("\n").map((line) => {
    if (!/\[C\d{2,3}/.test(line) || !/^\*\*SC\d/.test(line)) return line;
    // A scene line is "field | field | ..."; transform only the two fields the film uses.
    const parts = line.split(" | ");
    const out = parts.map((part) => {
      const m = FIELD.exec(part);
      if (!m) return part;
      const field = m[2];
      const body = part.slice(m[0].length);
      const r = resolvePlaceholders(body, claims, { spoken: field === "NARR" });
      if (r.resolved.length) changed += r.resolved.length;
      resolved.push(...r.resolved);
      unresolved.push(...r.unresolved);
      return `${m[1]}${field}: ${r.text}`;
    });
    return out.join(" | ");
  });
  return { text: lines.join("\n"), changed, unresolved, resolved };
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.url.replace("file://", "")) {
  const args = /** @type {Record<string, string>} */ ({});
  for (let i = 2; i < process.argv.length; i += 1) {
    const k = process.argv[i];
    if (k.startsWith("--") && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) { args[k.slice(2)] = process.argv[i + 1]; i += 1; }
    else if (k.startsWith("--")) args[k.slice(2)] = "true";
  }
  const run = args.run;
  if (!run) { console.error("Usage: node local/claims.mjs --run <folder> [--preview | --apply]"); process.exit(2); }
  const s2 = readFileSync(join(run, "s2.md"), "utf8");
  const series = existsSync(join(run, "claim-values.json")) && !args.refresh ? JSON.parse(readFileSync(join(run, "claim-values.json"), "utf8")) : await fetchSeries();
  writeFileSync(join(run, "claim-values.json"), JSON.stringify(series, null, 1));
  // Every priced claim carries the series' own yearly figures, so the ledger can be audited.
  const { claims, unpriced } = priceClaims(s2, series);
  /** @type {Record<string, any>} */
  const prices = {};
  for (const [id, c] of Object.entries(claims)) {
    prices[id] = {
      rupees: c.rupees,
      thenLow: c.usd.thenLow, thenHigh: c.usd.thenHigh,
      todayLow: c.usd.todayLow, todayHigh: c.usd.todayHigh,
      rateYear: c.rupees.low.year, rate: series.rates[String(c.rupees.low.year)],
      indexYear: series.cpi.annual[String(c.rupees.low.year)],
      lockMonth: `${series.cpi.latest.year}-${String(series.cpi.latest.month).padStart(2, "0")}`,
      indexLock: series.cpi.latest.value,
    };
  }
  const out = { fetchedAt: series.fetchedAt, series: series.series, sources: series.sources, claims: prices, unpriced, lockMonth: prices[Object.keys(prices)[0]]?.lockMonth };
  writeFileSync(join(run, "claim-values.json"), JSON.stringify({ ...series, priced: prices, unpriced }, null, 1));

  const chapters = ["s5-C1.md", "s5-C2.md", "s5-C3.md", "s5-C4.md", "s5-C5.md", "s5-C6.md"].filter((f) => existsSync(join(run, f)));
  let total = 0;
  /** @type {string[]} */
  const left = [];
  for (const chapter of chapters) {
    const file = join(run, chapter);
    const before = readFileSync(file, "utf8");
    const r = fillChapter(before, claims);
    total += r.changed;
    left.push(...r.unresolved.map((t) => `${chapter} ${t}`));
    if (args.apply && r.text !== before) {
      const backup = file.replace(/\.md$/, ".before-claims.md");
      if (!existsSync(backup)) copyFileSync(file, backup);
      writeFileSync(file, r.text);
    }
    if (args.preview || !args.apply) {
      for (const x of r.resolved.slice(0, 6)) console.log(`${chapter}: ${x.token} -> ${x.value}`);
    }
    console.log(`${chapter}: ${r.changed} value(s), ${r.unresolved.length} left`);
  }
  console.log(JSON.stringify({ mode: args.apply ? "applied" : "preview", values: total, unresolved: left, unpriced: unpriced.length, lockMonth: out.lockMonth }, null, 1));
  if (args.apply) writeFileSync(join(run, "claim-fill.json"), JSON.stringify({ at: new Date().toISOString(), values: total, unresolved: left, priced: prices, unpriced }, null, 1));
  if (left.length && args.apply) process.exit(1);
}
