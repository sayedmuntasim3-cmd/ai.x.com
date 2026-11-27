#!/usr/bin/env node
/**
 * Daily health report for Zupona: one GitHub issue that says, in plain words, what is broken and
 * what is fine — archives that are off or still need a key, the latest daily-film and voice-film
 * runs, and whether the site answers. The issue is created or updated when something is wrong and
 * closed again by itself once everything is fine.
 *
 *   node local/health-report.mjs            check, then create/update/close the issue
 *   node local/health-report.mjs --print    check and print the report only (no issue, no token)
 *
 * Needs (only for the issue step): GITHUB_TOKEN, GITHUB_REPOSITORY. The token is never printed.
 * The text builder below is pure and tested in local/health-report.test.mjs (no network).
 */

export const ISSUE_TITLE = "Zupona health report";
export const DEFAULT_SITE = "https://ai-x-com.sayedmuntasim3.workers.dev";

/** @typedef {{ id: string, name: string, enabled?: boolean, needsKey?: boolean, signup?: string }} ArchiveRow */
/** @typedef {{ file: string, label: string, status?: string | null, conclusion?: string | null, url?: string, createdAt?: string }} RunRow */
/** @typedef {{ url: string, status?: number, ok: boolean, error?: string }} SiteRow */
/** @typedef {{ ok: boolean, rows: ArchiveRow[], error?: string }} SourcesResult */

/** Bengali digits, so the owner's one-line summary reads in his own script. @param {number} n */
const bnNumber = (n) => String(n).replace(/\d/g, (d) => "০১২৩৪৫৬৭৮৯"[Number(d)]);

/** @param {string | Date | undefined} at */
function stamp(at) {
  const d = at instanceof Date ? at : at ? new Date(at) : new Date();
  const safe = Number.isFinite(d.getTime()) ? d : new Date();
  return `${safe.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

/**
 * The archives that hold nothing back: off ones, and ones switched on but still missing their key.
 * @param {SourcesResult} sources
 */
export function sourceProblems(sources) {
  if (!sources?.ok) return [{ kind: /** @type {const} */ ("list"), text: `The archive list did not answer: ${sources?.error ?? "unknown reason"}.` }];
  const rows = sources.rows ?? [];
  /** @type {{ kind: "off" | "key", text: string }[]} */
  const out = [];
  for (const row of rows) {
    const name = row.name || row.id;
    if (row.enabled === false) out.push({ kind: "off", text: `**${name}** is switched off.` });
    else if (row.needsKey) out.push({ kind: "key", text: `**${name}** is on but needs its key${row.signup ? ` (ask for one at ${row.signup})` : ""}.` });
  }
  return out;
}

/**
 * One line about a workflow's latest run. A run still going is not a failure; a run that never
 * happened is, because a daily film that never starts is the quiet way this platform dies.
 * @param {RunRow | null} run
 */
export function runLine(run) {
  if (!run || (!run.status && !run.conclusion && !run.createdAt)) return { ok: false, text: "has never run." };
  const when = run.createdAt ? ` (${stamp(run.createdAt)})` : "";
  const link = run.url ? ` — ${run.url}` : "";
  const status = String(run.status ?? "");
  const conclusion = String(run.conclusion ?? "");
  if (status && status !== "completed") return { ok: true, text: `is still ${status}${when}${link}.` };
  if (conclusion === "success") return { ok: true, text: `last finished successfully${when}${link}.` };
  return { ok: false, text: `last finished **${conclusion || "unknown"}**${when}${link}.` };
}

/** @param {SiteRow | null} row @param {string} label */
export function siteLine(row, label) {
  if (!row) return { ok: false, text: `**${label}** was not checked.` };
  if (row.ok) return { ok: true, text: `**${label}** answers 200.` };
  const why = row.status ? `**${label}** answers ${row.status}` : `**${label}** does not answer`;
  return { ok: false, text: `${why}${row.error ? ` (${row.error})` : ""}.` };
}

/**
 * The issue's whole text: what is broken first, then what is fine, then one Bangla line.
 * @param {{ sources: SourcesResult, runs: RunRow[], sites: SiteRow[], now?: Date }} input
 * @returns {{ ok: boolean, title: string, body: string, summaryBn: string, problems: string[] }}
 */
export function buildReport({ sources, runs, sites, now = new Date() }) {
  const archiveProblems = sourceProblems(sources);
  const runProblems = runs.map((r) => ({ run: r, ...runLine(r) })).filter((r) => !r.ok);
  const siteProblems = sites.filter((s) => !siteLine(s, s.url).ok);

  /** @type {string[]} */
  const problems = [
    ...archiveProblems.map((p) => p.text),
    ...runProblems.map((r) => `**${r.run.label}** ${r.text}`),
    ...siteProblems.map((s) => siteLine(s, s.url).text),
  ];

  const archivesOn = (sources?.rows ?? []).filter((r) => r.enabled !== false && !r.needsKey).length;
  const archivesTotal = (sources?.rows ?? []).length;
  const ok = problems.length === 0;

  const summaryBn = ok
    ? `সব ঠিক আছে: ${bnNumber(archivesOn)}টি আর্কাইভ প্রস্তুত, দুটি ফিল্ম-ওয়ার্কফ্লো আর সাইট ঠিকঠাক উত্তর দিচ্ছে।`
    : `${bnNumber(problems.length)}টি সমস্যা আছে: ${sources.ok ? `${bnNumber(archivesTotal - archivesOn)}টি আর্কাইভ ব্যবহারযোগ্য নয়` : "আর্কাইভ-তালিকা উত্তর দিচ্ছে না"}, ${bnNumber(runProblems.length)}টি ফিল্ম-রান খারাপ, ${bnNumber(siteProblems.length)}টি সাইট-ঠিকানা সমস্যা।`;

  const body = [
    `Checked ${stamp(now)} by \`.github/workflows/health-report.yml\`.`,
    "",
    ok ? "## Everything is fine" : "## What is broken",
    ...(ok ? ["- Nothing to fix: every archive, both film workflows and the site are fine."] : problems.map((p) => `- ${p}`)),
    "",
    "## Details",
    "",
    "**Archives**",
    sources.ok
      ? `- ${archivesOn} of ${archivesTotal} archives ready to search, ${archivesTotal - archivesOn} not usable yet.`
      : `- The archive list did not answer${sources.error ? `: ${sources.error}` : ""}.`,
    "",
    "**Film workflows**",
    ...runs.map((r) => `- **${r.label}** ${runLine(r).text}`),
    "",
    "**Site**",
    ...sites.map((s) => `- ${siteLine(s, s.url).text}`),
    "",
    "---",
    `**বাংলায়:** ${summaryBn}`,
  ].join("\n");

  return { ok, title: ISSUE_TITLE, body, summaryBn, problems };
}

/**
 * What to do with the one issue: create it, update it, close it, or leave it alone.
 * @param {{ exists: boolean, ok: boolean }} state
 * @returns {"create" | "update" | "close" | "none"}
 */
export function issuePlan({ exists, ok }) {
  if (ok) return exists ? "close" : "none";
  return exists ? "update" : "create";
}

// --- the live checks --------------------------------------------------------------

/** GET the archive list. @param {{ site: string, fetch: typeof fetch }} io @returns {Promise<SourcesResult>} */
export async function readSources({ site, fetch }) {
  try {
    const res = await fetch(`${site}/api/media/sources`, { headers: { accept: "application/json" } });
    if (!res.ok) return { ok: false, rows: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const rows = Array.isArray(data?.sources) ? data.sources : Array.isArray(data) ? data : [];
    if (!rows.length) return { ok: false, rows: [], error: "the answer held no archives" };
    return { ok: true, rows };
  } catch (error) {
    return { ok: false, rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The latest run of one workflow file, or null when it never ran.
 * @param {{ repo: string, file: string, fetch: typeof fetch, token?: string }} io
 */
export async function readRun({ repo, file, fetch, token }) {
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${file}/runs?per_page=1`;
  /** @type {Record<string, string>} */
  const headers = { accept: "application/vnd.github+json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) return null;
  const data = await res.json();
  const run = Array.isArray(data?.workflow_runs) ? data.workflow_runs[0] : null;
  if (!run) return null;
  return { file, status: run.status ?? null, conclusion: run.conclusion ?? null, url: run.html_url, createdAt: run.created_at };
}

/** GET one address and say whether it answers 200. @param {{ url: string, fetch: typeof fetch }} io */
export async function readSite({ url, fetch }) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    return { url, status: res.status, ok: res.status === 200 };
  } catch (error) {
    return { url, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// --- the issue --------------------------------------------------------------------

/** @param {{ repo: string, token: string, fetch: typeof fetch }} io */
async function github({ repo, token, fetch }, path, init = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} for ${path}`);
  return res.status === 204 ? null : res.json();
}

/**
 * The report issues among an issue list, oldest first, so a second copy made by a race is visible
 * and can be closed instead of drifting into two reports.
 * @param {any[]} list
 */
export function uniqueIssues(list) {
  return (Array.isArray(list) ? list : [])
    .filter((i) => i && i.title === ISSUE_TITLE && !i.pull_request)
    .sort((a, b) => Number(a.number) - Number(b.number));
}

/** Every open report issue, oldest first. @param {{ repo: string, token: string, fetch: typeof fetch }} io */
export async function findIssues(io) {
  return uniqueIssues(await github(io, "/issues?state=open&per_page=100"));
}

/** The one open report issue, or null. @param {{ repo: string, token: string, fetch: typeof fetch }} io */
export const findIssue = async (io) => (await findIssues(io))[0] ?? null;

/**
 * Make GitHub show the report: one issue, updated while broken, closed when fixed.
 * @param {{ repo: string, token: string, fetch: typeof fetch }} io
 * @param {ReturnType<typeof buildReport>} report
 */
export async function publishIssue(io, report) {
  const open = await findIssues(io);
  const existing = open[0] ?? null;
  const plan = issuePlan({ exists: Boolean(existing), ok: report.ok });
  /** @type {string | null} */
  let url = null;
  if (plan === "create") {
    const created = await github(io, "/issues", { method: "POST", body: JSON.stringify({ title: report.title, body: report.body }) });
    url = created?.html_url ?? null;
  } else if (plan === "update" && existing) {
    const updated = await github(io, `/issues/${existing.number}`, { method: "PATCH", body: JSON.stringify({ body: report.body }) });
    url = updated?.html_url ?? existing.html_url ?? null;
  } else if (plan === "close" && existing) {
    const closed = await github(io, `/issues/${existing.number}`, {
      method: "PATCH",
      body: JSON.stringify({ state: "closed", body: `${report.body}\n\n---\n${report.summaryBn}` }),
    });
    url = closed?.html_url ?? existing.html_url ?? null;
  }
  // A duplicate made by two runs at once is closed rather than left as a second report.
  for (const extra of existing ? open.slice(1) : []) {
    await github(io, `/issues/${extra.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed", body: `Duplicate of #${existing.number}.\n\n${report.summaryBn}` }) });
  }
  return { plan, url, closedDuplicates: existing ? open.slice(1).map((i) => i.number) : [] };
}

// --- the run ----------------------------------------------------------------------

async function main() {
  const print = process.argv.includes("--print");
  const site = process.env.SITE || DEFAULT_SITE;
  const repo = process.env.GITHUB_REPOSITORY || "";
  const token = process.env.GITHUB_TOKEN || "";

  const [sources, daily, voice, home, studio] = await Promise.all([
    readSources({ site, fetch }),
    readRun({ repo, file: "daily-film.yml", fetch, token }),
    readRun({ repo, file: "voice-film.yml", fetch, token }),
    readSite({ url: `${site}/`, fetch }),
    readSite({ url: `${site}/studio/`, fetch }),
  ]);

  const report = buildReport({
    sources,
    runs: [
      { file: "daily-film.yml", label: "Daily film", ...(daily ?? {}) },
      { file: "voice-film.yml", label: "Voice film", ...(voice ?? {}) },
    ].map((r) => /** @type {RunRow} */ (r)),
    sites: [home, { ...studio, url: `${site}/studio/` }],
  });

  const text = `${report.ok ? "OK" : "PROBLEMS"} — ${report.summaryBn}\n\n${report.body}`;
  console.log(print ? text : text.split("\n").slice(0, 12).join("\n"));
  if (print) return;

  if (!repo || !token) {
    console.error("GITHUB_REPOSITORY and GITHUB_TOKEN are required to write the issue (use --print to only look).");
    process.exitCode = 1;
    return;
  }
  const { plan, url } = await publishIssue({ repo, token, fetch }, report);
  console.log(`issue: ${plan}${url ? ` ${url}` : ""}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import("node:fs");
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n\nIssue: ${plan}${url ? ` ${url}` : ""}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
