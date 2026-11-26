#!/usr/bin/env node
/**
 * Make a film on your own computer with your own free brain: the same film
 * run as the Cloudflare studio (engine/src/film-run.mjs), with a folder in
 * place of R2 and no Workflow, Cloudflare account or paid API.
 *
 *   BRAIN_URL=http://localhost:11434 BRAIN_MODEL=qwen3:32b BRAIN_CONTEXT=65536 \
 *     node local/run-film.mjs --topic "The rise and fall of Lamborghini" --minutes 10
 *
 *   options: --topic <text> --minutes <1-300> --format <id | auto> --notes <text>
 *            --out <folder> (default films/<topic slug>) --budget <USD, for a paid brain>
 *            --no-edit --no-viewers --lang bn (messages in Bengali) --max-revisions <0-3>
 *            --script-only (research, script, QA and packaging; no pictures, never cleared for release)
 *            --max-calls <N> (hard cap on requests to the brain for this film folder, retries included;
 *            40 by default for Gemini; every call is logged in calls.jsonl with Google's response id)
 *            --manual <file> (the context sent as the system prompt; default the production manual;
 *            Phase 0 uses prompts/phase0-context.txt, built by local/experiment-context.mjs)
 *   resume:  node local/run-film.mjs --out films/<slug>   (finished stages are kept)
 *   stop:    create a file named STOP in the film's folder (or set ZUPONA_STOP=1): the run stops
 *            before its next model call; delete it and resume. A paid brain needs --budget.
 *   approve: node local/run-film.mjs --out films/<slug> --approve "why it may be released"
 *
 * Bossism checks first (preflight: refused with reasons if it cannot work,
 * every lowered quality named), reviews the finished run, sends failed work
 * back once, and prints the render command only for a film it cleared.
 *
 * The brain and the optional keys come from the environment, with the same
 * names as the studio (worker/brain.mjs, docs/BRAIN.md): BRAIN_URL,
 * BRAIN_MODEL, BRAIN_CONTEXT, BRAIN_VISION, SEARXNG_URL, RESEARCH_SOURCES, RESEARCH_MODE (knowledge); PEXELS_API_KEY and
 * PIXABAY_API_KEY (free) for stock footage; GEMINI_API_KEY or
 * ANTHROPIC_API_KEY only if you choose those brains.
 *
 * When it finishes it prints the render command (render/render-film.mjs).
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isIP } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { mediaProviders } from "../engine/src/film-media.mjs";
import { estimateRun, newFilm, runFilm } from "../engine/src/film-run.mjs";
import { privateAddress, publicUrl } from "../engine/src/net-guard.mjs";
import { researchProviders } from "../engine/src/research-desk.mjs";
import { cleared, gateMessage, ownerOverride, preflight, productionGraph, understand } from "../engine/src/bossism.mjs";
import { say } from "../engine/src/messages.mjs";
import { superviseFilm } from "../engine/src/supervise.mjs";
import { brainFromEnv, chooseBrain } from "../worker/brain.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * A film's files in a folder: the same keys the studio keeps in R2.
 * @param {string} dir
 */
export function folderStore(dir) {
  const path = (/** @type {string} */ key) => {
    if (key.includes("..") || key.startsWith("/")) throw new Error(`Bad file key "${key}".`);
    return join(dir, key);
  };
  return {
    /** @param {string} key */
    async get(key) {
      const f = path(key);
      return existsSync(f) ? readFileSync(f, "utf8") : null;
    },
    /** @param {string} key @param {string} text */
    async put(key, text) {
      const f = path(key);
      mkdirSync(dirname(f), { recursive: true });
      writeFileSync(f, text);
    },
  };
}

/** Requests to Gemini are capped by default (Phase 0: no surprise usage on the free tier). */
export const GEMINI_MAX_CALLS = 40;

const sha256 = (/** @type {string} */ s) => createHash("sha256").update(s).digest("hex");

/**
 * The request cap and evidence log of one film folder (calls.jsonl): every
 * request to the brain is counted, retries included, across resumes; every
 * model call is written down with what was sent (size, hash, whether the
 * production manual was in it), what came back (hash, stop reason, usage)
 * and the responseId and modelVersion the provider returned. The fetch it
 * gives the brain refuses a request beyond the cap; halt() stops the run
 * cleanly before the next call once the cap is reached.
 * @param {import("../engine/src/film-run.mjs").Store} store @param {number | undefined} maxCalls
 * @param {string} [manual] the full production manual, to record whether each request carried it
 * @param {string} [context] the context actually given as the manual (its hash is logged per call)
 */
export async function callLedger(store, maxCalls, manual = "", context = "") {
  const lines = String((await store.get("calls.jsonl")) ?? "").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  let requests = lines.reduce((n, l) => n + (Number(l.requests) || 0), 0);
  let inCall = 0;
  const probe = manual.slice(0, 400);
  const contextSha256 = context ? sha256(context) : null;
  const cap = Number.isFinite(maxCalls) && /** @type {number} */ (maxCalls) > 0 ? Math.floor(/** @type {number} */ (maxCalls)) : undefined;
  const reached = () => cap !== undefined && requests >= cap;
  /** Set when the provider says its daily free quota is used up: no request is made after that. */
  let dailyQuota = "";
  return {
    get requests() { return requests; },
    cap,
    /** @returns {string | null} */
    halt: () => (dailyQuota ? `the provider's daily free quota is used up (${dailyQuota}); resume after it resets` : reached() ? `the request cap of ${cap} is reached (${requests} requests made; see calls.jsonl)` : null),
    /** @param {typeof fetch} get @returns {typeof fetch} */
    fetch: (get) => /** @type {typeof fetch} */ (async (input, init) => {
      if (dailyQuota) throw Object.assign(new Error(`Refused: the daily free quota is used up (${dailyQuota}).`), { permanent: "The daily free quota is used up." });
      if (reached()) throw Object.assign(new Error(`Refused: the request cap of ${cap} is reached.`), { permanent: `The request cap of ${cap} is reached.` });
      requests += 1;
      inCall += 1;
      const res = await get(input, init);
      // A 429 for a per-day quota will not pass with waiting: stop at once instead of spending retries.
      if (res.status === 429) {
        const body = await res.clone().text().catch(() => "");
        const day = /"quotaId":\s*"([^"]*PerDay[^"]*)"/i.exec(body);
        if (day) {
          dailyQuota = day[1];
          await res.body?.cancel().catch(() => {});
          throw Object.assign(new Error(`The daily free quota is used up (${dailyQuota}). The run stops; resume after it resets (midnight Pacific time).`), { permanent: "The daily free quota is used up." });
        }
      }
      return res;
    }),
    /** @param {import("../engine/src/film-run.mjs").Model} model @returns {import("../engine/src/film-run.mjs").Model} */
    wrap: (model) => ({
      ...model,
      async call(req) {
        if (reached()) throw Object.assign(new Error(`Refused: the request cap of ${cap} is reached.`), { permanent: `The request cap of ${cap} is reached.` });
        inCall = 0;
        const sent = JSON.stringify({ system: req.system, messages: req.messages });
        const entry = /** @type {Record<string, any>} */ ({ n: lines.length + 1, at: new Date().toISOString(), stage: req.stage, model: model.name, webSearch: Boolean(req.webSearch && model.capabilities?.webSearch !== false), sentChars: sent.length, sentSha256: sha256(sent), contextSha256, fullManualIncluded: probe.length > 0 && sent.includes(JSON.stringify(probe).slice(1, -1)) });
        try {
          const reply = await model.call(req);
          Object.assign(entry, { stopReason: reply.stopReason, responseId: reply.responseId ?? null, modelVersion: reply.modelVersion ?? null, usage: reply.usage, replyChars: reply.text.length, replySha256: sha256(reply.text) });
          return reply;
        } catch (error) {
          entry.error = error instanceof Error ? error.message.slice(0, 300) : String(error);
          throw error;
        } finally {
          // A brain that does not use this fetch (a test model) still counts one request per call.
          if (inCall === 0) requests += 1;
          entry.requests = Math.max(1, inCall);
          lines.push(entry);
          await store.put("calls.jsonl", lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
        }
      },
    }),
  };
}

/**
 * One film from its first stage to Bossism's release decision, on whatever
 * store holds it (a folder here, the studio's storage for a cloud job):
 * preflight with this machine's brain, the supervised run, the review.
 * @param {{ film: import("../engine/src/film-run.mjs").Film, store: import("../engine/src/film-run.mjs").Store,
 *   brain: { kind: string, model: import("../engine/src/film-run.mjs").Model }, env: Record<string, string | undefined>,
 *   fetch?: typeof fetch, lookup?: (host: string, o: { all: true }) => Promise<{ address: string }[]>, signal?: AbortSignal, print: (line: string) => void, lang: "en" | "bn",
 *   budgetUsd?: number, edit?: boolean, viewers?: boolean, maxRevisions?: number, ledger?: Awaited<ReturnType<typeof callLedger>>, manual?: string,
 *   channel?: { load(): Promise<any[]>, save(list: any[]): Promise<void> } }} o
 */
export async function produceFilm(o) {
  const { film, store, brain, env, print } = o;
  const tell = (/** @type {{ code: string, params?: any }} */ m) => say(m, o.lang);
  const caps = brain.model.capabilities ?? {};
  const estimate = estimateRun(film.durationSeconds, brain.model.name, brain.model);
  print(`Brain: ${brain.kind} ${brain.model.name}${caps.contextTokens ? `, window ${caps.contextTokens} tokens` : ""}${caps.vision === false ? ", cannot see pictures" : ""}${caps.webSearch === false ? ", research through the code desk" : ""}.`);
  print(estimate.usdHigh === 0 ? `Cost: none (${estimate.chapters} chapter${estimate.chapters === 1 ? "" : "s"} on your own machine).` : `Estimated cost: $${estimate.usdLow}-$${estimate.usdHigh}.`);

  // Bossism's preflight: refuse what cannot work before anything runs, and name every lowered quality.
  const media = mediaProviders({ pexelsKey: env.PEXELS_API_KEY, pixabayKey: env.PIXABAY_API_KEY, smithsonianKey: env.SMITHSONIAN_API_KEY });
  const manual = o.manual ?? readFileSync(join(ROOT, "prompts/1-zupona-master-engine-full.txt"), "utf8");
  const plan = preflight(productionGraph(understand({ film })), {
    brain: { connected: true, kind: brain.kind, model: brain.model.name, seesPictures: caps.vision !== false, searchesWeb: caps.webSearch !== false, contextTokens: caps.contextTokens, maxOutputTokens: caps.maxOutputTokens },
    researchDesk: true, mediaProviders: media.length, youtube: false, autoRender: false, minutes: film.durationSeconds / 60, manualChars: manual.length,
  });
  await store.put("preflight.json", JSON.stringify(plan, null, 1));
  // A brain that costs money never runs without a hard cap.
  if (estimate.usdHigh > 0 && o.budgetUsd === undefined) {
    const why = `The brain ${brain.model.name} costs money (estimate $${estimate.usdLow}-$${estimate.usdHigh}). Give a hard cap with --budget <USD>; nothing is spent without one.`;
    throw Object.assign(new Error(why), { permanent: why });
  }
  if (!plan.ok) throw Object.assign(new Error(plan.blockers.map((b) => tell(b)).join(" ")), { permanent: plan.blockers.map((b) => b.en).join(" ") });
  for (const d of plan.degradations) print(`  NOTE ${tell(d)}`);

  const get = o.fetch ?? fetch;
  const web = (/** @type {string} */ url, /** @type {RequestInit | undefined} */ init) => get(url, init);
  // Pages a model or a web page pointed at are opened only on hosts that resolve to public addresses (no SSRF into this network).
  const pages = guardedFetch(web, o.lookup);
  const options = {
    film,
    manual,
    model: o.ledger ? o.ledger.wrap(brain.model) : brain.model,
    store,
    budgetUsd: o.budgetUsd,
    edit: o.edit ?? true,
    viewers: o.viewers ?? true,
    media: { providers: media },
    sources: { fetch: pages },
    // Phase 0 arm A: RESEARCH_MODE=knowledge (no search, no research desk; model knowledge only).
    ...(env.RESEARCH_MODE === "knowledge" ? { researchMode: /** @type {const} */ ("knowledge") } : {}),
    // Phase 0 fairness rule: RESEARCH_STRICT=1 (bounded Wikipedia retries; stop rather than write from a partial corpus).
    ...(env.RESEARCH_STRICT === "1" ? { researchStrict: true } : {}),
    // The search providers' own APIs (Wikipedia, the owner's SearXNG, which may be on this network) use the plain fetch.
    research: { providers: researchProviders({ fetch: web, searxngUrl: env.SEARXNG_URL || undefined, sources: env.RESEARCH_SOURCES || undefined, strict: env.RESEARCH_STRICT === "1" }), fetch: pages },
    channel: o.channel,
    log: (/** @type {string} */ line) => print(`[${new Date().toISOString().slice(11, 19)}] ${line}`),
    signal: o.signal,
    // The emergency stop, asked before every model call: a file named STOP in the film's folder, or ZUPONA_STOP=1.
    // The request cap (--max-calls) stops it the same way.
    halt: async () => (env.ZUPONA_STOP === "1" ? "ZUPONA_STOP=1 is set" : (await store.get("STOP")) !== null ? "a STOP file is in the film's folder" : o.ledger?.halt() ?? null),
  };
  const max = Number.isFinite(o.maxRevisions) ? Math.max(0, Math.min(3, Number(o.maxRevisions))) : 1;
  const { state, review } = await superviseFilm({ film, store, runOnce: () => runFilm(options), maxRevisions: max, log: options.log });
  return { state, review, plan };
}

/**
 * A fetch that opens a URL only when its host resolves to public addresses
 * only, checked on every call (safeFetch calls it once per redirect hop).
 * The check and the connection are separate lookups, so a host that changes
 * its answer in between (DNS rebinding) is not fully excluded.
 * @param {(url: string, init?: RequestInit) => Promise<Response>} get
 * @param {(host: string, o: { all: true }) => Promise<{ address: string }[]>} [resolve]
 */
export function guardedFetch(get, resolve = /** @type {any} */ (lookup)) {
  return async (/** @type {string} */ url, /** @type {RequestInit | undefined} */ init) => {
    if (!publicUrl(url)) throw new Error(`Refused a non-public address: ${url.slice(0, 120)}`);
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    if (!isIP(host)) {
      const answers = await resolve(host, { all: true });
      const bad = answers.find((a) => privateAddress(a.address));
      if (!answers.length || bad) throw new Error(`Refused ${host}: it resolves to ${bad ? bad.address : "nothing"}, not a public address.`);
    }
    return get(url, init);
  };
}

/** @param {string} topic */
export function slug(topic) {
  return topic.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "film";
}

/**
 * @param {string[]} argv @param {Record<string, string | undefined>} env
 * @param {{ model?: import("../engine/src/film-run.mjs").Model, brainFetch?: typeof fetch, fetch?: typeof fetch, lookup?: (host: string, o: { all: true }) => Promise<{ address: string }[]>, log?: (line: string) => void, signal?: AbortSignal }} [deps] tests, and the job worker (signal stops the run between stages)
 */
export async function main(argv, env, deps = {}) {
  const print = deps.log ?? ((/** @type {string} */ line) => console.log(line));
  const { values } = parseArgs({
    args: argv,
    options: {
      topic: { type: "string" }, minutes: { type: "string" }, format: { type: "string" }, notes: { type: "string" },
      out: { type: "string" }, budget: { type: "string" }, "no-edit": { type: "boolean" }, "no-viewers": { type: "boolean" },
      lang: { type: "string" }, "max-revisions": { type: "string" }, approve: { type: "string" }, "script-only": { type: "boolean" },
      "max-calls": { type: "string" }, manual: { type: "string" },
    },
  });
  const lang = values.lang === "bn" ? "bn" : "en";
  const tell = (/** @type {{ code: string, params?: any }} */ m) => say(m, lang);
  const out = resolve(values.out ?? join("films", slug(values.topic ?? "")));
  const store = folderStore(out);
  const askedCap = values["max-calls"] === undefined ? undefined : Number(values["max-calls"]);
  if (askedCap !== undefined && !(Number.isInteger(askedCap) && askedCap > 0)) throw new Error("--max-calls must be a whole number above 0.");
  const kind = deps.model ? "test" : chooseBrain(env).ok ? /** @type {any} */ (chooseBrain(env)).kind : "";
  const fullManual = readFileSync(join(ROOT, "prompts/1-zupona-master-engine-full.txt"), "utf8");
  const manual = values.manual ? readFileSync(resolve(values.manual), "utf8") : undefined;
  if (manual !== undefined && manual.trim().length < 1000) throw new Error(`--manual ${values.manual} is too short to be a context file.`);
  // A film keeps the context it started with: a resume can never switch to another one (for example back to the full manual).
  const pinned = JSON.parse((await store.get("context.json")) ?? "null");
  const usedSha = sha256(manual ?? fullManual);
  if (pinned && pinned.sha256 !== usedSha) throw new Error(`This film was started with the context ${pinned.file} (sha256 ${String(pinned.sha256).slice(0, 12)}); give the same --manual to resume it.`);
  // The experiment arm is pinned too: a resume cannot change the model, search, research mode or sources.
  const arm = { model: env.GEMINI_MODEL ?? null, geminiSearch: env.GEMINI_SEARCH ?? null, researchMode: env.RESEARCH_MODE ?? null, researchSources: env.RESEARCH_SOURCES ?? null, researchStrict: env.RESEARCH_STRICT ?? null };
  if (pinned?.arm && JSON.stringify(pinned.arm) !== JSON.stringify(arm)) throw new Error(`This film was started with other settings (${JSON.stringify(pinned.arm)}); resume it with the same GEMINI_MODEL, GEMINI_SEARCH, RESEARCH_MODE and RESEARCH_SOURCES.`);
  if (!pinned && values.approve === undefined) await store.put("context.json", JSON.stringify({ file: values.manual ?? "prompts/1-zupona-master-engine-full.txt", sha256: usedSha, bytes: Buffer.byteLength(manual ?? fullManual), arm }, null, 1));
  const ledger = await callLedger(store, askedCap ?? (kind === "gemini" ? GEMINI_MAX_CALLS : undefined), fullManual, manual ?? fullManual);
  const chosen = deps.model ? { ok: /** @type {const} */ (true), kind: "test", model: deps.model } : brainFromEnv(env, { fetch: ledger.fetch(deps.brainFetch ?? fetch) });
  if (!chosen.ok) throw new Error(chosen.error);
  const brain = chosen;
  if (manual !== undefined) print(`Context: ${values.manual} (${Buffer.byteLength(manual)} bytes) in place of the production manual.`);
  if (ledger.cap !== undefined) print(`Request cap: ${ledger.cap} requests to the brain for this film (${ledger.requests} made so far; log in calls.jsonl).`);
  if (values.approve !== undefined) {
    const review = JSON.parse((await store.get("review.json")) ?? "null");
    if (!review) throw new Error("This film has no review to approve yet; run it first.");
    const done = await ownerOverride(store, review, values.approve);
    if (!done.ok) throw new Error(done.error);
    print(tell(done.entry.message));
    print(`\nRender it:\n  node render/render-film.mjs --run ${out} --out ${join(out, "film.mp4")}`);
    return null;
  }
  const saved = await store.get("film.json");
  /** @type {import("../engine/src/film-run.mjs").Film} */
  let film;
  if (saved) {
    film = JSON.parse(saved);
    print(`Resuming "${film.topic}" in ${out}`);
  } else {
    if (!values.topic) throw new Error('Give a topic: --topic "..." (or --out <folder> to resume a film).');
    const made = newFilm({ topic: values.topic, minutes: values.minutes ?? "10", formatId: values.format, notes: values.notes, scriptOnly: values["script-only"] === true }, slug(values.topic));
    if (!made.ok) throw new Error(made.error);
    film = made.film;
    await store.put("film.json", JSON.stringify({ ...film, createdAt: new Date().toISOString() }, null, 1));
  }

  const channelDir = join(dirname(out), "channel");
  const budget = Number(values.budget);
  const { state, review } = await produceFilm({
    film, store, brain, env, fetch: deps.fetch, lookup: deps.lookup, signal: deps.signal, print, lang, ledger, manual,
    budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : undefined,
    edit: !values["no-edit"], viewers: !values["no-viewers"],
    maxRevisions: Number(values["max-revisions"] ?? 1),
    channel: {
      load: async () => { const f = join(channelDir, "fingerprints.json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : []; },
      save: async (list) => { mkdirSync(channelDir, { recursive: true }); writeFileSync(join(channelDir, "fingerprints.json"), JSON.stringify(list)); },
    },
  });
  print(`\n${state.status}${state.costUsd ? `, $${state.costUsd} spent` : ""}. Files in ${out}`);
  for (const gap of state.gaps) print(`  GAP ${gap}`);
  for (const g of review.gates) {
    print(`  ${tell(gateMessage(g))}`);
    for (const f of g.findings) print(`    ${f.severity}: ${tell(f.message)}`);
  }
  print(`\n${tell(review.release.message)}`);
  if (cleared(review, JSON.parse((await store.get("decisions.json")) ?? "[]")).ok) print(`\nRender it:\n  node render/render-film.mjs --run ${out} --out ${join(out, "film.mp4")}`);
  else if (review.scope !== "script") print(`\nTo release it anyway, with your reason on record:\n  node local/run-film.mjs --out ${out} --approve "why"`);
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
