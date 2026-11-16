/**
 * Writing-system helpers shared by the version and intake modules: which
 * scripts a text is written in, and digits in each version's numeral system.
 */

const SCRIPTS = /** @type {const} */ ({
  arabic: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/u,
  bengali: /[ঀ-৿]/u,
  latin: /[A-Za-zÀ-ɏ]/u,
});

/** @typedef {{ arabic: number, bengali: number, latin: number, other: number, letters: number }} ScriptShares */

/**
 * Share of letters in each script (digits, punctuation and spaces ignored).
 * @param {string} text
 * @returns {ScriptShares}
 */
export function scriptShares(text) {
  const counts = { arabic: 0, bengali: 0, latin: 0, other: 0 };
  for (const ch of String(text ?? "")) {
    if (!/\p{L}|\p{M}/u.test(ch)) continue;
    if (SCRIPTS.arabic.test(ch)) counts.arabic += 1;
    else if (SCRIPTS.bengali.test(ch)) counts.bengali += 1;
    else if (SCRIPTS.latin.test(ch)) counts.latin += 1;
    else counts.other += 1;
  }
  const letters = counts.arabic + counts.bengali + counts.latin + counts.other;
  /** @param {number} n */
  const share = (n) => (letters ? Math.round((n / letters) * 1000) / 1000 : 0);
  return { arabic: share(counts.arabic), bengali: share(counts.bengali), latin: share(counts.latin), other: share(counts.other), letters };
}

const DIGITS = {
  latn: "0123456789",
  arab: "٠١٢٣٤٥٦٧٨٩",
  beng: "০১২৩৪৫৬৭৮৯",
};

/** @typedef {keyof typeof DIGITS} NumberingSystem */

/**
 * Turn Arabic-Indic, Extended Arabic-Indic (Persian/Urdu) and Bengali digits
 * into 0-9, so "৫০ ডলার" and "٥٠ دولار" read as 50.
 * @param {string} text
 */
export function toAsciiDigits(text) {
  return String(text ?? "").replace(/[٠-٩۰-۹০-৯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
    return String(code - 0x09e6);
  });
}

/**
 * Write the 0-9 digits of a text in another numeral system.
 * @param {string} text
 * @param {NumberingSystem} system
 */
export function toLocalDigits(text, system) {
  const digits = DIGITS[system] ?? DIGITS.latn;
  return String(text ?? "").replace(/[0-9]/g, (d) => digits[Number(d)]);
}
