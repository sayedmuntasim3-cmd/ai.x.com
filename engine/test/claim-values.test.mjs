import assert from "node:assert/strict";
import { test } from "node:test";
import { annualAverages, formatUsd, ledgerClaims, numberWords, parseFredCsv, placeholderTokens, pricedClaims, resolvePlaceholders, roundUsd, rupeesFromLedgerCell, spokenUsd, usdFromRupees } from "../src/claim-values.mjs";

/** The real annual averages fetched on 26 Nov 2026 (FRED AEXINUS / CPIAUCSL). */
const RATES = { 1979: 8.1564, 1989: 16.2131, 2011: 46.5782, 2017: 65.0659, 2024: 83.6566, 2025: 87.1468 };
const CPI = { annual: { 1979: 72.58, 1989: 123.94, 2011: 224.92, 2017: 245.12, 2024: 313.7, 2025: 321.87 }, latest: { year: 2026, month: 10, value: 337.476 } };

test("C10: rupees become dollars at the year's rate, and today's money at the index", () => {
  const v = usdFromRupees({ low: { inr: 100, year: 2025 } }, RATES, CPI);
  assert.ok(v, "a priced claim resolves");
  assert.equal(v.thenLow, 1.15, "100 rupees at 87.1468 is $1.15");
  assert.equal(v.todayLow, 1.2, "the index moves it to $1.20");
  assert.equal(v.range, false);
});

test("C10: a range keeps both ends and both years", () => {
  // Five rupees, 1979 through 1989: the ledger asks for both rates, not one guess.
  const v = usdFromRupees({ low: { inr: 5, year: 1979 }, high: { inr: 5, year: 1989 } }, RATES, CPI);
  assert.ok(v);
  // A displayed range is smallest first: 1979 gives the larger dollar figure.
  assert.equal(v.thenLow, 0.31, "$0.31 at the 1989 rate");
  assert.equal(v.thenHigh, 0.61, "$0.61 at the 1979 rate");
  assert.equal(v.range, true);
  assert.equal(formatUsd(v.thenHigh), "$0.61", "under a dollar is shown to the cent");
});

test("C10: a big amount keeps the ledger's range and is rounded to three figures", () => {
  const v = usdFromRupees({ low: { inr: 30_000_000, year: 2011 }, high: { inr: 33_000_000, year: 2011 } }, RATES, CPI);
  assert.ok(v);
  assert.equal(v.thenLow, 644000, "₹3 crore in 2011 dollars");
  assert.equal(v.thenHigh, 708000);
  assert.ok(v.todayLow > v.thenLow, "2011 money is worth more today");
});

test("nothing is guessed: a missing year or index gives no value, not a zero", () => {
  assert.equal(usdFromRupees({ low: { inr: 100, year: 1999 } }, RATES, CPI), null, "no rate for 1999");
  assert.equal(usdFromRupees({ low: { inr: 100, year: 2025 } }, RATES, { annual: {}, latest: CPI.latest }), null, "no index");
  assert.equal(usdFromRupees({ low: { inr: 100, year: 2025 } }, RATES, { annual: CPI.annual, latest: { year: 2026, month: 10, value: 0 } }), null, "no lock month");
});

test("rounding: under a dollar to the cent, above it to three significant figures", () => {
  assert.equal(roundUsd(0.61477), 0.61);
  assert.equal(roundUsd(64405.7), 64400);
  assert.equal(roundUsd(87019.9), 87000);
  assert.equal(roundUsd(1.1533), 1.15);
});

test("what the narrator says has no symbols in it", () => {
  assert.equal(spokenUsd(33), "thirty-three dollars");
  assert.equal(spokenUsd(0.61), "sixty-one cents");
  assert.equal(spokenUsd(644000), "six hundred forty-four thousand dollars");
  assert.equal(numberWords(1200000), "one point two million");
  assert.equal(numberWords(34), "thirty-four");
  assert.ok(!/\d|\$/.test(spokenUsd(87000)), "no digits or symbols reach the voice");
});

test("the ledger is read by id, with its rupee cell and years", () => {
  const s2 = [
    "| ID | Claim | Status | Value |",
    "| **C05** | A ₹100 haircut (2024–25) in dollars | ESTIMATE | ₹100 · year 2025 · rate: verify |",
    "| **C40** | The Ghost's price in dollars | ESTIMATE | ₹30,000,000–₹33,000,000 · year 2011 |",
    "| **C12** | Five rupees in dollars | ESTIMATE | ₹5 · year: 1979–1989 (the arrangement's start) |",
    "| **C66** | No rupees at all | FACT | 2011 alone |",
  ].join("\n");
  const claims = ledgerClaims(s2);
  assert.deepEqual(Object.keys(claims).sort(), ["C05", "C12", "C40", "C66"]);
  assert.deepEqual(claims.C05.rupees, { low: { inr: 100, year: 2025 } });
  assert.deepEqual(claims.C40.rupees, { low: { inr: 30_000_000, year: 2011 }, high: { inr: 33_000_000, year: 2011 } });
  assert.deepEqual(claims.C12.rupees, { low: { inr: 5, year: 1979 }, high: { inr: 5, year: 1989 } });
  assert.equal(claims.C66.rupees, null, "a row that prices no rupees is not a dollar claim");
});

test("placeholders: every variant the script uses is resolved, and an unpriced one is left alone", () => {
  const usd = /** @type {any} */ ({ range: true, thenLow: 644000, thenHigh: 708000, todayLow: 880000, todayHigh: 967000 });
  const claims = { C40: { usd }, C05: { usd: /** @type {any} */ ({ range: false, thenLow: 1.15, thenHigh: 1.15, todayLow: 1.2, todayHigh: 1.2 }) } };
  const screen = resolvePlaceholders("about $[C40 low]–$[C40 high], today $[C40 today]; a cut $[C05]", claims);
  assert.equal(screen.text, "about $644,000–$708,000, today $880,000; a cut $1.15");
  assert.deepEqual(screen.unresolved, []);
  const spoken = resolvePlaceholders("for about $[C05] a cut", claims, { spoken: true });
  assert.equal(spoken.text, "for about one dollar and fifteen cents a cut");
  const bare = resolvePlaceholders("about [C12 low]–[C12 high] cents", { C12: { usd: /** @type {any} */ ({ range: true, thenLow: 0.31, thenHigh: 0.61, todayLow: 1.2, todayHigh: 2.85 }) } });
  assert.equal(bare.text, "about 31–61 cents", "a phrase ending in \"cents\" is a bare number of cents at both ends");
  assert.equal(resolvePlaceholders("more than [C44 low] in tax", { C44: { usd: /** @type {any} */ ({ range: false, thenLow: 644000, thenHigh: 644000, todayLow: 880000, todayHigh: 880000 }) } }).text, "more than $644,000 in tax", "without \"cents\" it is money even without a dollar sign");
  const unknown = resolvePlaceholders("a $[C99] and a $[C40 midway]", claims);
  assert.equal(unknown.text, "a $[C99] and a $[C40 midway]", "an unknown claim or variant is never invented");
  assert.deepEqual(unknown.unresolved, ["$[C99]", "$[C40 midway]"]);
});

test("a chart's dated points resolve by year, the second point in a year by letter", () => {
  const rates = { 2011: 46.5782, 2017: 65.0659 };
  const cpi = { annual: { 2011: 224.92, 2017: 245.12 }, latest: { year: 2026, month: 10, value: 337.476 } };
  const claims = { C60: { rates, cpi, rupees: { low: { inr: 75, year: 2017 }, points: [{ inr: 100, year: 2011, suffix: "" }, { inr: 75, year: 2017, suffix: "a" }, { inr: 100, year: 2017, suffix: "b" }] }, usd: /** @type {any} */ ({ range: true, thenLow: 1.15, thenHigh: 2.15, todayLow: 1.7, todayHigh: 3.2 }) } };
  const r = resolvePlaceholders("2011 · $[C60-2011]; 2017 Mar $[C60-2017a]; Sep $[C60-2017b]", claims);
  assert.equal(r.text, "2011 · $2.15; 2017 Mar $1.15; Sep $1.54");
  assert.deepEqual(r.unresolved, []);
  assert.deepEqual(resolvePlaceholders("$[C60-2019]", claims).unresolved, ["$[C60-2019]"], "a year the chart does not have is not invented");
});

test("a range is shown smallest first, whatever order the years came in", () => {
  const v = usdFromRupees({ low: { inr: 5, year: 1979 }, high: { inr: 5, year: 1989 } }, { 1979: 8.1564, 1989: 16.2131 }, { annual: { 1979: 72.58, 1989: 123.94 }, latest: { year: 2026, month: 10, value: 337.476 } });
  assert.ok(v);
  assert.equal(v.thenLow, 0.31, "31 cents (1989) comes before 61 cents (1979)");
  assert.equal(v.thenHigh, 0.61);
});

test("a bare placeholder on a range claim becomes the pair, not a hidden single value", () => {
  const usd = /** @type {any} */ ({ range: true, thenLow: 644000, thenHigh: 708000, todayLow: 880000, todayHigh: 967000 });
  assert.equal(resolvePlaceholders("worth $[C40]", { C40: { usd } }).text, "worth $644,000–$708,000");
});

test("FRED's CSV: annual series, monthly averages, and an empty observation skipped", () => {
  const annual = parseFredCsv("observation_date,AEXINUS\n2024-01-01,83.6566\n2025-01-01,87.1468\n");
  assert.deepEqual(annual, [{ date: "2024-01-01", value: 83.6566 }, { date: "2025-01-01", value: 87.1468 }]);
  const monthly = parseFredCsv("observation_date,CPIAUCSL\n2025-09-01,324.245\n2025-10-01,\n2025-11-01,325.063\n");
  assert.equal(monthly.length, 2, "the empty month is skipped, not read as zero");
  assert.deepEqual(annualAverages(monthly), { 2025: 324.654 });
});

test("the priced claims saved in claim-values.json resolve a placeholder months later, without the network", () => {
  const claims = pricedClaims({
    rates: RATES,
    cpi: CPI,
    priced: { C12: { rupees: { low: { inr: 100, year: 2025 } }, thenLow: 1.15, thenHigh: 1.15, todayLow: 1.2, todayHigh: 1.2 } },
  });
  const r = resolvePlaceholders("It cost [C12 low].", claims);
  assert.deepEqual(r.unresolved, [], "a priced claim fills its place");
  assert.equal(r.text, "It cost $1.15.");
  // A claim the file does not carry stays a placeholder and is named, never guessed.
  const missing = resolvePlaceholders("It cost [C99 low].", claims);
  assert.deepEqual(missing.unresolved, ["[C99 low]"]);
  assert.deepEqual(placeholderTokens("about [C12 low] and $[C40 today]"), ["[C12 low]", "$[C40 today]"]);
});

test("a spoken value never says its unit twice (the script's own \"dollars\" is kept once)", () => {
  const claims = { C42: { usd: { low: 15000, high: 15000, thenLow: 15000, thenHigh: 15000, todayLow: 18000, todayHigh: 18000, range: false } } };
  const r = resolvePlaceholders("payments of about [C42] dollars a month", claims, { spoken: true });
  assert.deepEqual(r.unresolved, []);
  assert.equal(r.text, "payments of about fifteen thousand dollars a month");
  // The written form keeps its symbol: on-screen text is never reworded.
  assert.equal(resolvePlaceholders("about $[C42] dollars", claims).text, "about $15,000 dollars");
});
