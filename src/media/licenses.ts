// Licence handling. Everything a provider reports is mapped to one of a few codes, and anything
// that forbids commercial use or edits (NC, ND, "all rights reserved", unknown) maps to null and
// is dropped. A documentary is a commercial, edited work, so only these licences are safe.

import type { License, LicenseCode, RightsLevel } from "./types";

const BASE: Record<LicenseCode, Omit<License, "url" | "label"> & { label: string }> = {
  cc0: { code: "cc0", label: "CC0", attribution: false, shareAlike: false },
  pdm: { code: "pdm", label: "Public domain", attribution: false, shareAlike: false },
  "public-domain": { code: "public-domain", label: "Public domain", attribution: false, shareAlike: false },
  "us-government": { code: "us-government", label: "Public domain (US government work)", attribution: false, shareAlike: false },
  "no-known-restrictions": { code: "no-known-restrictions", label: "No known restrictions", attribution: false, shareAlike: false },
  "cc-by": { code: "cc-by", label: "CC BY", attribution: true, shareAlike: false },
  "cc-by-sa": { code: "cc-by-sa", label: "CC BY-SA", attribution: true, shareAlike: true },
  unsplash: { code: "unsplash", label: "Unsplash License", attribution: false, shareAlike: false },
  pixabay: { code: "pixabay", label: "Pixabay Content License", attribution: false, shareAlike: false },
};

const URLS: Partial<Record<LicenseCode, string>> = {
  cc0: "https://creativecommons.org/publicdomain/zero/1.0/",
  pdm: "https://creativecommons.org/publicdomain/mark/1.0/",
  unsplash: "https://unsplash.com/license",
  pixabay: "https://pixabay.com/service/license-summary/",
};

export function license(code: LicenseCode, options: { version?: string; url?: string; label?: string } = {}): License {
  const base = BASE[code];
  const version = options.version && /^\d(\.\d)?$/.test(options.version) ? options.version : undefined;
  const label = options.label ?? (version && (code === "cc-by" || code === "cc-by-sa") ? `${base.label} ${version}` : base.label);
  let url = options.url ?? URLS[code];
  if (!url && version && (code === "cc-by" || code === "cc-by-sa")) {
    url = `https://creativecommons.org/licenses/${code === "cc-by" ? "by" : "by-sa"}/${version}/`;
  }
  return { ...base, label, url };
}

/**
 * Reads licence names, codes and URLs as the different sources write them, for example
 * "CC BY-SA 4.0", "cc-by-sa-2.0", "by-sa", "https://creativecommons.org/licenses/by/3.0/",
 * "http://creativecommons.org/publicdomain/zero/1.0/legalcode", "Public Domain Mark",
 * "License#pdmark" (Swedish K-samsök) or rightsstatements.org URLs. Returns null for anything
 * that is not safe for a commercial, edited film.
 */
export function parseLicense(input: string | null | undefined, extra: { url?: string } = {}): License | null {
  if (!input) return null;
  const raw = String(input).trim();
  if (!raw) return null;
  const text = raw.toLowerCase().replace(/_/g, "-");
  const url = extra.url ?? (/^https?:\/\//.test(raw) ? raw.replace(/^http:/, "https:").replace(/legalcode.*$/, "") : undefined);

  // Restrictions first: any non-commercial or no-derivatives term rules the image out.
  if (/(^|[^a-z])nc([^a-z]|$)|non-?commercial|noncommercial/.test(text)) return null;
  if (/(^|[^a-z])nd([^a-z]|$)|no-?deriv|noderiv/.test(text)) return null;
  if (/all rights reserved|copyrighted|in copyright|incopyright|\/inc\/|inc-|copyright not evaluated|cne\//.test(text)) return null;

  if (/rightsstatements\.org\/vocab\/noc-us|noc-us/.test(text)) return license("public-domain", { label: "No copyright (United States)" });
  if (/rightsstatements\.org\/vocab\/nkc|no known copyright|no known restrictions/.test(text)) return license("no-known-restrictions");
  if (/publicdomain\/zero|(^|[^a-z])cc-?0([^a-z0-9]|$)|cc-zero|^zero$|license#cc0/.test(text)) return license("cc0");
  if (/publicdomain\/mark|public-?domain-?mark|(^|[^a-z])pdm([^a-z]|$)|license#pdmark|^pdmark$/.test(text)) return license("pdm");
  if (/^public ?domain|^pd$|^pd-|public domain|^public-domain$/.test(text)) return license("public-domain");
  if (/us government|u\.s\. government|united states government|us-gov/.test(text)) return license("us-government");

  const version = text.match(/(?:by(?:-sa)?)[\s/-]*(\d(?:\.\d)?)/)?.[1];
  if (/(^|[^a-z])by-sa([^a-z]|$)|licenses\/by-sa|attribution-share ?alike|attribution-sharealike/.test(text)) {
    return license("cc-by-sa", { version, url });
  }
  if (/(^|[^a-z])by([^a-z]|$)|licenses\/by\/|^attribution( \d|$)|creative commons attribution(?! non)/.test(text)) {
    return license("cc-by", { version, url });
  }
  return null;
}

/** Whether a licence is allowed at the chosen rights level. */
export function allowed(lic: License, level: RightsLevel) {
  if (level === "share-alike") return true;
  if (lic.shareAlike) return false;
  if (level === "attribution") return true;
  return !lic.attribution;
}

/** Credit line for the end titles, written the way each licence expects. */
export function attributionFor(item: {
  title: string;
  creator?: string;
  license: License;
  sourceName: string;
  collection?: string;
  credit?: string;
}) {
  const where = item.collection && item.collection !== item.sourceName ? `${item.collection} via ${item.sourceName}` : item.sourceName;
  if (item.license.code === "unsplash") return `Photo by ${item.creator || "an Unsplash photographer"} on Unsplash`;
  if (item.license.code === "pixabay") return `Image by ${item.creator || "a Pixabay contributor"} from Pixabay`;
  if (item.credit) return `${item.credit} · ${item.license.label} · ${where}`;
  const title = item.title ? `“${item.title}”` : "Untitled";
  const by = item.creator ? ` by ${item.creator}` : "";
  return `${title}${by} · ${item.license.label} · ${where}`;
}
