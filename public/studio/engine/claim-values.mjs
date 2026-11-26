/**
 * Dollar values for a script's rupee claims: the film's own method (S2 C10),
 * done in code so no number is ever typed by hand.
 *
 *   then-USD  = rupees / AEXINUS(year)          annual average, rupees per US dollar
 *   today-USD = then-USD × CPI(latest month) / CPI(year's annual average)
 *
 * Every value carries the series it came from, the year and the retrieval
 * date, so the script's own source chip can be checked against it. A claim the
 * ledger does not price (no rupee amount, no year) is never guessed: it is
 * returned as unresolved and stays a placeholder for the writer.
 *
 * Plain ES module, no I/O: local/claims.mjs fetches the series and writes the
 * files; render/critic.mjs blocks a film that still shows a placeholder.
 */

/**
 * @typedef {{ inr: number, year: number, suffix?: string }} Rupee
 * @typedef {{ year: number, inrPerUsd: number }} Rate
 * @typedef {{ annual: Record<string, number>, latest: { year: number, month: number, value: number } }} Cpi
 * @typedef {{ low: Rupee, high?: Rupee, points?: Rupee[] }} ClaimRupees
 * @typedef {{ low: number, high: number, thenLow: number, thenHigh: number, todayLow: number, todayHigh: number, range: boolean }} Usd
 */

/** The C10 rounding rule: under $1 to the cent, else three significant figures. @param {number} n */
export function roundUsd(n) {
  if (!Number.isFinite(n)) return NaN;
  const v = Math.abs(n);
  if (v < 1) return Math.round(n * 100) / 100;
  // Three significant figures, in both directions: $1.1533 is $1.15, $64,405 is $64,400.
  const digits = Math.floor(Math.log10(v)) + 1;
  const step = 10 ** (digits - 3);
  // Trimmed to six places so a rounded cent is exactly 1.15, not 1.1500000000000001.
  return Number((Math.round(n / step) * step).toFixed(6));
}

/**
 * Rupees to dollars by C10, for a point value or a range.
 * @param {ClaimRupees} rupees @param {Map<number, number> | Record<number, number>} rates @param {Cpi} cpi
 * @returns {Usd | null} null when a year's rate or index is unknown
 */
export function usdFromRupees(rupees, rates, cpi) {
  const rate = (/** @type {number} */ y) => (rates instanceof Map ? rates.get(y) : /** @type {any} */ (rates)[y]);
  const price = (/** @type {Rupee} */ r) => {
    const per = Number(rate(r.year));
    if (!Number.isFinite(per) || per <= 0) return null;
    const then = r.inr / per;
    const yearCpi = Number(cpi.annual[String(r.year)]);
    if (!Number.isFinite(yearCpi) || yearCpi <= 0 || !(cpi.latest?.value > 0)) return null;
    return { then, today: (then * cpi.latest.value) / yearCpi };
  };
  const low = price(rupees.low);
  if (!low) return null;
  const high = rupees.high ? price(rupees.high) : null;
  if (rupees.high && !high) return null;
  // A range is shown smallest first ("about 31–61 cents"), whatever order the years came in.
  const thenA = low.then;
  const thenB = high ? high.then : low.then;
  const todayA = low.today;
  const todayB = high ? high.today : low.today;
  return {
    low: roundUsd(Math.min(thenA, thenB)),
    high: roundUsd(Math.max(thenA, thenB)),
    thenLow: roundUsd(Math.min(thenA, thenB)),
    thenHigh: roundUsd(Math.max(thenA, thenB)),
    todayLow: roundUsd(Math.min(todayA, todayB)),
    todayHigh: roundUsd(Math.max(todayA, todayB)),
    range: Boolean(rupees.high),
  };
}

/** Whole dollars with thousands separators, cents under a dollar. @param {number} n */
export function formatUsd(n) {
  if (!Number.isFinite(n)) return "";
  // A fractional dollar keeps its cents on screen ($1.15); whole dollars never show them.
  if (!Number.isInteger(n) || Math.abs(n) < 1) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0–999 in words. @param {number} n */
function under1000(n) {
  const out = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h) out.push(`${ONES[h]} hundred`);
  if (r) {
    if (r < 20) out.push(ONES[r]);
    else out.push(TENS[Math.floor(r / 10)] + (r % 10 ? `-${ONES[r % 10]}` : ""));
  }
  return out.join(" ");
}

/** Digits after a decimal point are spoken one by one (1.2 -> "one point two"). @param {string} digits */
const sayDigits = (digits) => digits.split("").map((d) => (d === "." ? "point" : ONES[Number(d)])).join(" ");

/**
 * A whole number in words, up to billions. @param {number} n @returns {string}
 */
function wholeWords(n) {
  if (n >= 1e9) {
    const b = Math.floor(n / 1e9);
    const rest = n - b * 1e9;
    return `${wholeWords(b)} billion${rest ? ` ${wholeWords(rest)}` : ""}`;
  }
  // A round fraction of a million is spoken the way a narrator says it ("one point two million").
  if (n >= 1e6 && n < 1e9 && n % 1e5 === 0 && n % 1e6 !== 0) return `${sayDigits(String(n / 1e6))} million`;
  if (n >= 1e6) {
    const m = Math.floor(n / 1e6);
    const rest = n - m * 1e6;
    return `${under1000(m)} million${rest ? ` ${wholeWords(rest)}` : ""}`;
  }
  if (n >= 1000) {
    const k = Math.floor(n / 1000);
    const rest = n - k * 1000;
    return `${under1000(k)} thousand${rest ? ` ${under1000(rest)}` : ""}`;
  }
  return under1000(n);
}

/**
 * A number as spoken words, so the narrator never reads a symbol. Values the
 * script rounds (C10: three significant figures) come out as round numbers:
 * 34000 -> "thirty-four thousand", 1200000 -> "one point two million".
 * @param {number} n @returns {string}
 */
export function numberWords(n) {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return `minus ${numberWords(-n)}`;
  const whole = Math.floor(Math.abs(n) + 1e-9);
  const decimals = (Math.abs(n) - whole).toFixed(2).slice(2).replace(/0+$/, "");
  const words = whole ? wholeWords(whole) : "zero";
  return decimals ? `${words} point ${sayDigits(decimals)}` : words;
}

/**
 * Dollars as spoken words: "thirty-three dollars", "one dollar and fifteen
 * cents", "sixty-one cents". Never a symbol, never a bare number. @param {number} n
 */
export function spokenUsd(n) {
  if (!Number.isFinite(n)) return "";
  const total = Math.round(Math.abs(n) * 100);
  const dollars = Math.floor(total / 100);
  const cents = total % 100;
  if (!dollars) return `${under1000(cents)} cent${cents === 1 ? "" : "s"}`;
  const d = `${wholeWords(dollars)} dollar${dollars === 1 ? "" : "s"}`;
  return cents ? `${d} and ${under1000(cents)} cent${cents === 1 ? "" : "s"}` : d;
}

/**
 * A claim's placeholders, resolved. Tokens are `$[C05]`, `[C12 low]`,
 * `$[C40 today]`, `$[C40-high]` and so on; a token whose claim has no priced
 * value, or whose variant is unknown, is left exactly as written and reported.
 * @param {string} text
 * @param {Record<string, { usd?: Usd, note?: string, rupees?: ClaimRupees, rates?: Record<number, number>, cpi?: Cpi }>} claims claim id -> value
 * @param {{ spoken?: boolean }} [o] spoken: for a NARR field (words, not symbols)
 * @returns {{ text: string, resolved: { token: string, value: string }[], unresolved: string[] }}
 */
export function resolvePlaceholders(text, claims, o = {}) {
  /** @type {{ token: string, value: string }[]} */
  const resolved = [];
  /** @type {string[]} */
  const unresolved = [];
  const source = String(text ?? "");
  const out = source.replace(/\$?\[C\d{2,3}[^\]]*\]/g, (token, offset) => {
    // "[C12 low] cents" is a number of cents, not a dollar sign; anything else is money.
    // "[C12 low]–[C12 high] cents" is one phrase: the word after the pair governs both ends.
    const after = source.slice(offset + token.length);
    const cents = /^(?:\s*[–—-]\s*)?(?:\$?\[C\d{2,3}[^\]]*\])?\s*(?:cents?\b|¢)/i.test(after);
    const money = token.startsWith("$") || !cents;
    const body = token.replace(/^\$?\[/, "").replace(/\]$/, "");
    const idMatch = /^(C\d{2,3})/.exec(body);
    if (!idMatch) { unresolved.push(token); return token; }
    const id = idMatch[1];
    const variant = body.slice(id.length).trim().toLowerCase().replace(/^[-\s]+/, "");
    // Only the variants the script writes (a range end, today's money, a chart's year); anything
    // else is a writer's note, not a value, and is never turned into a number.
    if (!["", "low", "high", "today"].includes(variant) && !/^\d{4}[a-z]?$/.test(variant)) { unresolved.push(token); return token; }
    const claim = claims[id];
    if (!claim?.usd) { unresolved.push(token); return token; }
    const u = claim.usd;
    // A chart point: "$[C60-2011]" is that year's own point, and "2017b" the second 2017 point.
    const point = /^(\d{4})([a-z])?$/.exec(variant);
    if (point && claim.rupees?.points) {
      const p = claim.rupees.points.find((/** @type {Rupee} */ x) => x.year === Number(point[1]) && (x.suffix ?? "") === (point[2] ?? ""));
      if (!p) { unresolved.push(token); return token; }
      const v = claim.rates && claim.cpi ? usdFromRupees({ low: p }, claim.rates, claim.cpi) : null;
      if (!v) { unresolved.push(token); return token; }
      const formatted = o.spoken ? spokenUsd(v.thenLow) : formatUsd(v.thenLow);
      resolved.push({ token, value: formatted });
      return formatted;
    }
    const pick = (/** @type {number} */ low, /** @type {number} */ high) => (variant.includes("high") ? high : variant.includes("low") ? low : low);
    const today = variant.includes("today");
    const value = today ? pick(u.todayLow, u.todayHigh) : pick(u.thenLow, u.thenHigh);
    // A bare token on a range claim is the range's low end only when the script says "low"; otherwise it is the pair.
    if (u.range && (variant === "" || variant === "today") && !/^(today)$/.test(variant)) {
      const a = today ? u.todayLow : u.thenLow;
      const b = today ? u.todayHigh : u.thenHigh;
      const pair = o.spoken ? `${spokenUsd(a)} to ${spokenUsd(b)}` : `${formatUsd(a)}–${formatUsd(b)}`;
      resolved.push({ token, value: pair });
      return pair;
    }
    // "… cents": the value is that many cents, so $0.31 is written 31.
    const bare = cents ? Math.round(value * 100) : value;
    const formatted = o.spoken
      ? money ? spokenUsd(value) : numberWords(bare)
      : money ? formatUsd(value) : String(bare);
    resolved.push({ token, value: formatted });
    return formatted;
  });
  // The words often already carry the unit ("about [C42] dollars"): a spoken value that ends with
  // the same word is not said twice (\$15,000 -> "fifteen thousand dollars", not "dollars dollars").
  const final = o.spoken ? out.replace(/\b(dollars?|cents?)\s+\1\b/gi, "$1") : out;
  return { text: final, resolved, unresolved };
}

/**
 * The rupee amount(s) and year(s) written in one S2 ledger row's value cell:
 * "₹100 · year 2025", "₹30,000,000–₹33,000,000 · year 2011", "₹40–50 · year: 1979–1989".
 * @param {string} cell
 * @returns {ClaimRupees | null} null when the row prices no rupee amount or names no year
 */
export function rupeesFromLedgerCell(cell) {
  const text = String(cell ?? "");
  const amounts = [...text.matchAll(/₹\s*([\d,]+(?:\.\d+)?)(?:\s*(k|lakh|crore|million))?/gi)]
    .map((m) => {
      const base = Number(m[1].replace(/,/g, ""));
      const unit = (m[2] ?? "").toLowerCase();
      const mult = unit === "k" ? 1e3 : unit === "lakh" ? 1e5 : unit === "crore" ? 1e7 : unit === "million" ? 1e6 : 1;
      return base * mult;
    })
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!amounts.length) return null;
  // Years: "year 2025", "year 2011", "year: 1979–1989", "1979–1989", "· 2024".
  // Dated points of one chart ("₹100 @2011, ₹75 @2017 (Mar), ₹100 @2017 (Sep)"): the key is the year,
  // and a second point in the same year takes the letter b (a, b) in the order the chart lists it.
  const dated = [...text.matchAll(/₹\s*([\d,]+)\s*@\s*(19\d{2}|20\d{2})/g)].map((m) => ({ inr: Number(m[1].replace(/,/g, "")), year: Number(m[2]) }));
  if (dated.length >= 2) {
    /** @type {Rupee[]} */
    const points = [];
    // Two points in one year are "2017a" and "2017b" in the chart's own order; a single point has no letter.
    const perYear = new Map();
    for (const d of dated) perYear.set(d.year, (perYear.get(d.year) ?? 0) + 1);
    /** @type {Map<number, number>} */
    const seen = new Map();
    for (const d of dated) {
      const i = seen.get(d.year) ?? 0;
      seen.set(d.year, i + 1);
      points.push({ ...d, suffix: (perYear.get(d.year) ?? 0) > 1 ? String.fromCharCode(97 + i) : "" });
    }
    return { low: { inr: Math.min(...dated.map((d) => d.inr)), year: dated[0].year }, points };
  }
  const years = [...text.matchAll(/\b(19\d{2}|20\d{2})\b/g)].map((m) => Number(m[1]));
  if (!years.length) return null;
  const lowYear = Math.min(...years);
  const highYear = Math.max(...years);
  const lowInr = amounts[0];
  // A single amount over a year span is priced at both ends (the range the ledger asks for).
  if (amounts.length >= 2) {
    return { low: { inr: lowInr, year: lowYear }, high: { inr: amounts[1], year: highYear } };
  }
  if (highYear !== lowYear) {
    return { low: { inr: lowInr, year: lowYear }, high: { inr: lowInr, year: highYear } };
  }
  return { low: { inr: lowInr, year: lowYear } };
}

/** Every priced claim of an S2 ledger: the id and its rupee cell. @param {string} s2 */
export function ledgerClaims(s2) {
  /** @type {Record<string, { id: string, cell: string, rupees: ClaimRupees | null }>} */
  const out = {};
  for (const line of String(s2 ?? "").split("\n")) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const id = /^\*{0,2}(C\d{2,3})\*{0,2}$/.exec(cells[0] ?? "")?.[1];
    if (!id || out[id]) continue;
    // The value cell is the one that holds ₹ (the ledger's fourth column in this script).
    // The value cell is the priced one; a claim's own name can hold a rupee
    // amount too ("A ₹100 haircut (2024–25)"), so a cell that says "year" wins.
    const priced = cells.filter((c) => c.includes("₹"));
    const cell = priced.find((c) => /\byear\b/i.test(c)) ?? priced[priced.length - 1] ?? "";
    out[id] = { id, cell, rupees: rupeesFromLedgerCell(cell) };
  }
  return out;
}

/** Annual averages of a monthly series, from FRED's CSV rows. @param {{ date: string, value: number }[]} rows */
export function annualAverages(rows) {
  /** @type {Map<number, { sum: number, n: number }>} */
  const acc = new Map();
  for (const r of rows) {
    const year = Number(String(r.date).slice(0, 4));
    if (!Number.isFinite(year) || !Number.isFinite(r.value)) continue;
    const a = acc.get(year) ?? { sum: 0, n: 0 };
    a.sum += r.value;
    a.n += 1;
    acc.set(year, a);
  }
  /** @type {Record<string, number>} */
  const out = {};
  for (const [year, a] of acc) if (a.n) out[String(year)] = Math.round((a.sum / a.n) * 10000) / 10000;
  return out;
}

/**
 * FRED's CSV in rows. Its annual series (AEXINUS) carries one row a year, a
 * monthly one (CPIAUCSL) one a month, and a missing observation is an empty
 * value: those are skipped, never read as zero.
 * @param {string} csv
 * @returns {{ date: string, value: number }[]}
 */
export function parseFredCsv(csv) {
  /** @type {{ date: string, value: number }[]} */
  const out = [];
  for (const line of String(csv ?? "").split("\n").slice(1)) {
    const [date, raw] = line.split(",");
    if (!date || !raw || raw.trim() === ".") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out.push({ date: date.trim(), value });
  }
  return out;
}

/**
 * The priced claims of a claim-values.json (written by local/claims.mjs), in
 * the shape resolvePlaceholders reads. The files pin the values and the lock
 * month, so a narrator or a critic can fill a number months later without
 * touching the network; the series travel with each claim, so a chart's own
 * dated point is priced on its own year.
 * @param {any} json
 * @returns {Record<string, any>}
 */
export function pricedClaims(json) {
  const rates = json?.rates ?? {};
  const cpi = json?.cpi ?? { annual: {}, latest: null };
  /** @type {Record<string, any>} */
  const out = {};
  for (const [id, p] of Object.entries(json?.priced ?? json?.claims ?? {})) {
    if (!p || typeof p !== "object") continue;
    const claim = /** @type {any} */ (p);
    out[id] = {
      ...claim,
      rates,
      cpi,
      usd: claim.usd ?? {
        thenLow: claim.thenLow,
        thenHigh: claim.thenHigh,
        todayLow: claim.todayLow,
        todayHigh: claim.todayHigh,
        range: Number(claim.thenHigh) > Number(claim.thenLow),
      },
    };
  }
  return out;
}

/**
 * The number placeholders a text still holds ("[C12 low]", "$[C40 today]"),
 * in order. The speaker and the critic use it: a placeholder is never read
 * aloud and never shown on screen.
 * @param {string} text
 * @returns {string[]}
 */
export function placeholderTokens(text) {
  return [...String(text ?? "").matchAll(/\$?\[C\d{2,3}[^\]]*\]/g)].map((m) => m[0]);
}
