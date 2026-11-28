#!/usr/bin/env node
/**
 * The daily health digest collector (free: GitHub's own API and the Worker, no key of the platform).
 *
 *   node local/health-digest.mjs --print          collect and print the markdown (no upload)
 *   node local/health-digest.mjs                  collect, write out/health-digest.json, add it to the
 *                                                 workflow summary, and POST it to the Worker (OIDC) when asked
 *
 * Needs: GITHUB_TOKEN + GITHUB_REPOSITORY (read the runs, jobs and logs). To upload: SITE and the workflow's
 * ACTIONS_ID_TOKEN_REQUEST_URL / ACTIONS_ID_TOKEN_REQUEST_TOKEN (permissions: id-token: write). The digest
 * logic is pure: engine/src/health-digest.mjs (tested). Nothing here prints a token.
 */
import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { buildDigest, classifyLog, digestMarkdown } from "../engine/src/health-digest.mjs";

/** The film workflows and the product each one is. */
export const WORKFLOWS = Object.freeze([
  { file: "voice-film.yml", product: /** @type {const} */ ("voiceover") },
  { file: "daily-film.yml", product: /** @type {const} */ ("daily-script") },
]);

/** The OIDC audience the Worker checks for this workflow. */
export const AUDIENCE = "zupona-health";

/** Minutes between two ISO times, or null. @param {string | null | undefined} a @param {string | null | undefined} b */
export function minutesBetween(a, b) {
  const x = Date.parse(a ?? ""), y = Date.parse(b ?? "");
  return Number.isFinite(x) && Number.isFinite(y) && y >= x ? Math.round((y - x) / 6000) / 10 : null;
}

/**
 * One run and its jobs and log text as the digest's record.
 * @param {{ file: string, product: "voiceover" | "daily-script" }} wf @param {any} run @param {any[]} jobs @param {string} logText
 */
export function toRecord(wf, run, jobs, logText) {
  const id = /Voiceover film ([0-9a-f-]{8,36})/i.exec(String(run.display_title ?? run.name ?? ""))?.[1] ?? String(run.id);
  return {
    workflow: wf.file,
    product: wf.product,
    id,
    status: run.status ?? null,
    conclusion: run.conclusion ?? null,
    createdAt: run.created_at,
    url: run.html_url,
    jobs: jobs.map((j) => ({ name: String(j.name ?? "job"), minutes: minutesBetween(j.started_at, j.completed_at), conclusion: j.conclusion ?? null })),
    log: classifyLog(logText),
  };
}

/** @param {{ repo: string, token: string, fetch: typeof fetch }} io @param {string} path @param {boolean} [text] */
async function gh({ repo, token, fetch }, path, text = false) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` }, redirect: "follow" });
  if (!res.ok) return null;
  return text ? res.text() : res.json();
}

/**
 * Collect the last window's runs.
 * @param {{ repo: string, token: string, fetch: typeof fetch, now?: Date, hours?: number }} io
 */
export async function collectRuns(io) {
  const since = new Date((io.now ?? new Date()).getTime() - (io.hours ?? 24) * 3600 * 1000).toISOString();
  /** @type {any[]} */
  const out = [];
  for (const wf of WORKFLOWS) {
    const list = await gh(io, `/actions/workflows/${wf.file}/runs?per_page=30&created=%3E%3D${encodeURIComponent(since)}`);
    for (const run of list?.workflow_runs ?? []) {
      const jobs = (await gh(io, `/actions/runs/${run.id}/jobs?per_page=50`))?.jobs ?? [];
      let log = "";
      for (const j of jobs.slice(0, 12)) log += `\n${String((await gh(io, `/actions/jobs/${j.id}/logs`, true)) ?? "").slice(-400000)}`;
      out.push(toRecord(wf, run, jobs, log));
    }
  }
  return out;
}

/** The OIDC token for the Worker, or "". @param {typeof fetch} fetch */
async function oidcToken(fetch) {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL, bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !bearer) return "";
  const res = await fetch(`${url}&audience=${AUDIENCE}`, { headers: { authorization: `Bearer ${bearer}` } });
  return res.ok ? String((await res.json())?.value ?? "") : "";
}

async function main() {
  const print = process.argv.includes("--print");
  const repo = process.env.GITHUB_REPOSITORY || "", token = process.env.GITHUB_TOKEN || "";
  const site = process.env.SITE || "https://ai-x-com.sayedmuntasim3.workers.dev";
  if (!repo) { console.error("GITHUB_REPOSITORY is required."); process.exit(1); }
  const runs = await collectRuns({ repo, token, fetch });
  const digest = buildDigest({ runs });
  const md = digestMarkdown(digest);
  console.log(md);
  if (print) return;
  mkdirSync("out", { recursive: true });
  writeFileSync("out/health-digest.json", JSON.stringify(digest, null, 1));
  writeFileSync("out/health-digest.md", md);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  const jwt = await oidcToken(fetch);
  if (!jwt) { console.log("(no identity token: the digest was written but not sent to the Worker)"); return; }
  const res = await fetch(`${site}/api/health/report`, { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify(digest) });
  console.log(`Worker answered ${res.status}`);
  if (!res.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
