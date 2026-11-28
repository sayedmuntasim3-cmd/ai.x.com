/**
 * The daily health digest: one plain JSON the owner (and a free coding agent with no memory) reads to see
 * what the platform made in the last 24 hours and what to fix first. Pure and tested; the collector that
 * talks to GitHub is local/health-digest.mjs, the Worker stores and serves the result
 * (GET /api/health/report), the studio shows it under "My films", docs/AUTOPILOT.md says how to read it.
 *
 * Honest limits (said in the digest itself): free-brain use is counted in REQUESTS read from the runs' logs
 * (the Groq free tier is limited per day in requests and tokens; tokens are not logged), and provider
 * failures are counted from log lines, so a provider that failed silently is not seen here.
 */

/** Groq's free tier, per model, per day (worker/groq.mjs header). */
export const GROQ_DAILY_REQUESTS = 1000;

/**
 * Why a film stops, in log words, and what to do about it. Every matching cause is reported.
 * @type {ReadonlyArray<{ code: string, pattern: RegExp, text: string, fix: string }>}
 */
export const FAILURE_CAUSES = Object.freeze([
  { code: "groq-daily", pattern: /(day used up|tokens per day|requests per day|\bTPD\b|\bRPD\b)/i, text: "the free brain's daily limit is used up", fix: "Wait for the reset (midnight UTC) and re-run the film from its last finished stage; never add a paid key. If it repeats, make the film use fewer brain calls (docs/AUTOPILOT.md, 'Groq daily limit')." },
  { code: "gemini-quota", pattern: /(GenerateRequestsPerDay|RESOURCE_EXHAUSTED|quota exceeded)/i, text: "the free Gemini key's daily quota is used up", fix: "Gemini's free key allows 20 requests a day: it must stay the second choice behind Groq, never the one a film waits on." },
  { code: "loc-challenge", pattern: /(loc\.gov|library of congress)[^\n]{0,160}(challenge|captcha|403|429|blocked)|challenge[^\n]{0,80}(loc\.gov|library of congress)/i, text: "the Library of Congress turned the runner away (a challenge page, not pictures)", fix: "Slow the LoC search down and let the other archives answer first (archive-guard.mjs isChallenge); do not retry in a tight loop." },
  { code: "picture-relevance", pattern: /(off-topic|not relevant|relevance[^\n]{0,40}(fail|below|too low)|no picture (found|passed))/i, text: "pictures did not match their sentences", fix: "Improve the shot's search words (named things first, real archives before stock). Never loosen the relevance check." },
  { code: "gate-block", pattern: /^\s*BLOCK:/m, text: "the release gate blocked the film", fix: "Read the BLOCK lines, fix what they name in the film's own stage. Never lower a gate threshold." },
  { code: "brain-too-large", pattern: /(request too large|over its \d[\d,]*-token limit)/i, text: "a brain request was too large for the free model", fix: "Split the prompt into parts (askParts in engine/src/film-run.mjs); keep every call under the free model's limit." },
  { code: "runner-timeout", pattern: /(exceeded the maximum execution time|timed? ?out after|The operation was canceled)/i, text: "a job ran out of time", fix: "Find the slow stage in the minutes-per-stage table and speed up or split that stage (the render already runs in chunks)." },
]);

/** Provider names seen in log lines next to a failure word (a heuristic, said so in the digest). */
const PROVIDERS = ["Library of Congress", "loc.gov", "Europeana", "NARA", "Smithsonian", "DVIDS", "Pexels", "Pixabay", "Wikimedia", "Internet Archive", "NASA"];
const FAIL_WORD = /(429|403|503|challenge|failed|refused|timed out|error)/i;

/**
 * What a run's log says: the cause codes, the gate's BLOCK lines, the free-brain request count, provider failures.
 * @param {string} text
 */
export function classifyLog(text) {
  const log = String(text ?? "");
  const causes = FAILURE_CAUSES.filter((c) => c.pattern.test(log)).map((c) => c.code);
  const blocks = [...log.matchAll(/^\s*BLOCK:\s*(.+)$/gm)].map((m) => m[1].trim().slice(0, 160));
  const calls = /Free brain calls:\s*(\d+)/i.exec(log);
  /** @type {Record<string, number>} */
  const providerFailures = {};
  for (const line of log.split("\n")) {
    if (!FAIL_WORD.test(line)) continue;
    const name = PROVIDERS.find((p) => line.toLowerCase().includes(p.toLowerCase()));
    if (name) { const key = name === "loc.gov" ? "Library of Congress" : name; providerFailures[key] = (providerFailures[key] ?? 0) + 1; }
  }
  return { causes, blocks, brainCalls: calls ? Number(calls[1]) : null, providerFailures };
}

/**
 * @typedef {{ workflow: string, product: "voiceover" | "daily-script", id: string, status: string | null, conclusion: string | null, createdAt: string, url?: string,
 *   jobs: { name: string, minutes: number | null, conclusion?: string | null }[], log?: ReturnType<typeof classifyLog> }} RunRecord
 * @typedef {{ id?: string, topic?: string, status?: string, createdAt?: string | null, minutes?: number | null }} IdeaFilm
 */

const round1 = (/** @type {number} */ n) => Math.round(n * 10) / 10;

/** A run's outcome in one word. @param {RunRecord} r @returns {"running" | "passed" | "skipped" | "failed"} */
export const outcome = (r) => (r.status && r.status !== "completed" ? "running" : r.conclusion === "success" ? "passed" : r.conclusion === "skipped" || r.conclusion === "cancelled" ? "skipped" : "failed");

/**
 * Count items, most frequent first.
 * @param {string[]} items @param {number} [max]
 */
function tally(items, max = 5) {
  /** @type {Map<string, number>} */
  const m = new Map();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, max).map(([reason, count]) => ({ reason, count }));
}

/**
 * The digest of the last window.
 * @param {{ runs: RunRecord[], ideaFilms?: IdeaFilm[], now?: Date, windowHours?: number }} o
 */
export function buildDigest({ runs, ideaFilms = [], now = new Date(), windowHours = 24 }) {
  const since = now.getTime() - windowHours * 3600 * 1000;
  const inWindow = runs.filter((r) => Date.parse(r.createdAt) >= since);
  const product = (/** @type {RunRecord["product"]} */ p) => {
    const rs = inWindow.filter((r) => r.product === p);
    const by = { passed: 0, failed: 0, running: 0, skipped: 0 };
    for (const r of rs) by[outcome(r)] += 1;
    return { total: rs.length, ...by, runs: rs.map((r) => ({ id: r.id, outcome: outcome(r), url: r.url ?? null, createdAt: r.createdAt })) };
  };
  const idea = (() => {
    const fs = ideaFilms.filter((f) => f.createdAt && Date.parse(f.createdAt) >= since);
    const done = fs.filter((f) => /^(done|complete|completed|finished|released)$/i.test(String(f.status))).length;
    const failed = fs.filter((f) => /(fail|stop|error|block)/i.test(String(f.status))).length;
    return { total: fs.length, done, failed, running: fs.length - done - failed, films: fs.slice(0, 10).map((f) => ({ id: f.id ?? "", topic: f.topic ?? "", status: f.status ?? "" })) };
  })();

  const logs = /** @type {NonNullable<RunRecord["log"]>[]} */ (inWindow.map((r) => r.log).filter(Boolean));
  const causes = tally(logs.flatMap((l) => l.causes), 6).map(({ reason, count }) => {
    const c = FAILURE_CAUSES.find((x) => x.code === reason);
    return { code: reason, count, text: c?.text ?? reason, fix: c?.fix ?? "" };
  });
  const blockReasons = tally(logs.flatMap((l) => l.blocks), 5);

  /** @type {Record<string, number[]>} */
  const perJob = {};
  for (const r of inWindow) for (const j of r.jobs) if (j.minutes != null) (perJob[`${r.product}: ${j.name}`] ??= []).push(j.minutes);
  const stageMinutes = Object.fromEntries(Object.entries(perJob).map(([k, v]) => [k, { n: v.length, average: round1(v.reduce((a, b) => a + b, 0) / v.length), longest: round1(Math.max(...v)) }]));

  const calls = logs.reduce((n, l) => n + (l.brainCalls ?? 0), 0);
  /** @type {Record<string, number>} */
  const failures = {};
  for (const l of logs) for (const [p, n] of Object.entries(l.providerFailures)) failures[p] = (failures[p] ?? 0) + n;
  const archiveFailures = Object.entries(failures).sort((a, b) => b[1] - a[1]).map(([provider, count]) => ({ provider, count }));

  const digest = {
    generatedAt: now.toISOString(),
    windowHours,
    films: { voiceover: product("voiceover"), dailyScript: product("daily-script"), idea },
    blockReasons,
    causes,
    stageMinutes,
    brain: { requestsSeen: calls, groqDailyRequestsPerModel: GROQ_DAILY_REQUESTS, note: "Requests read from the runs' logs; Groq's free limits also count tokens, which the logs do not show." },
    archiveFailures,
    topFixes: /** @type {string[]} */ ([]),
    limits: "Counted from run logs and job times; a provider that failed silently is not seen. Voiceover = voice-film.yml runs (a daily film's narration also runs there).",
  };
  digest.topFixes = topFixes(digest);
  return digest;
}

/**
 * The three most important things to fix, most important first. Rules, not opinion: a platform that made
 * nothing is worse than one that made a film the gate blocked, which is worse than a slow stage.
 * @param {Omit<ReturnType<typeof buildDigest>, "topFixes"> & { topFixes?: string[] }} d
 * @returns {string[]}
 */
export function topFixes(d) {
  /** @type {string[]} */
  const out = [];
  const f = d.films;
  const finished = f.voiceover.passed + f.voiceover.failed + f.idea.done + f.idea.failed;
  if (f.voiceover.total + f.dailyScript.total + f.idea.total === 0) out.push("No film started in the last 24 hours (the quiet way this platform dies). Check .github/workflows/daily-film.yml: did the 10:23 and 14:23 UTC schedules run, and did the Worker answer 409 or 5xx?");
  else if (f.dailyScript.failed > 0 && f.voiceover.total === 0) out.push(`The daily script run failed ${f.dailyScript.failed} time(s) and no film started: read that run's log first.`);
  for (const c of d.causes) { if (out.length >= 3) break; out.push(`${c.count}x ${c.text}. ${c.fix}`); }
  if (d.blockReasons[0] && out.length < 3 && !d.causes.some((c) => c.code === "gate-block")) out.push(`The gate's top block (${d.blockReasons[0].count}x): "${d.blockReasons[0].reason}". Fix the film stage that causes it; never lower the gate.`);
  const slow = Object.entries(d.stageMinutes).sort((a, b) => b[1].longest - a[1].longest)[0];
  if (out.length < 3 && slow && slow[1].longest >= 60) out.push(`Slowest stage: ${slow[0]} took up to ${slow[1].longest} min. A 40-minute film should finish in about two hours in total.`);
  if (out.length < 3 && d.archiveFailures[0]) out.push(`${d.archiveFailures[0].provider} failed ${d.archiveFailures[0].count}x in the logs: check whether pictures still came from other archives.`);
  if (out.length === 0 && finished > 0) out.push("Nothing broke. Use the day to raise craft: watch one finished film frame by frame and fix the weakest scene (docs/AUTOPILOT.md, 'Raise the bar').");
  return out.slice(0, 3);
}

/**
 * The digest as plain markdown, for the workflow summary.
 * @param {ReturnType<typeof buildDigest>} d
 */
export function digestMarkdown(d) {
  const f = d.films;
  const line = (/** @type {string} */ name, /** @type {{ total: number, passed?: number, failed?: number, running?: number, done?: number }} */ p) =>
    `- **${name}:** ${p.total} in the last ${d.windowHours} h` + (p.total ? ` (${p.passed ?? p.done ?? 0} passed, ${p.failed ?? 0} failed, ${p.running ?? 0} running)` : "");
  return [
    `# Zupona daily health report (${d.generatedAt.slice(0, 16).replace("T", " ")} UTC)`,
    "",
    "## Films",
    line("Voiceover → video", f.voiceover),
    line("Daily script runs", f.dailyScript),
    line("Idea → video", f.idea),
    "",
    "## The 3 things to fix first",
    ...d.topFixes.map((t, i) => `${i + 1}. ${t}`),
    "",
    "## Gate blocks (top)",
    ...(d.blockReasons.length ? d.blockReasons.map((b) => `- ${b.count}x ${b.reason}`) : ["- none seen"]),
    "",
    "## Why films stopped",
    ...(d.causes.length ? d.causes.map((c) => `- ${c.count}x ${c.text}`) : ["- nothing recognised"]),
    "",
    "## Minutes per stage",
    ...(Object.keys(d.stageMinutes).length ? Object.entries(d.stageMinutes).map(([k, v]) => `- ${k}: average ${v.average} min, longest ${v.longest} min (${v.n} run${v.n === 1 ? "" : "s"})`) : ["- no finished job seen"]),
    "",
    "## Free brain and archives",
    `- Brain requests seen in logs: ${d.brain.requestsSeen} (Groq allows ${d.brain.groqDailyRequestsPerModel} a day per model; tokens are not logged).`,
    ...(d.archiveFailures.length ? d.archiveFailures.map((a) => `- ${a.provider}: ${a.count} failure line(s)`) : ["- no archive failure lines seen"]),
    "",
    `_${d.limits}_`,
  ].join("\n");
}
