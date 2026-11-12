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
 *   resume:  node local/run-film.mjs --out films/<slug>   (finished stages are kept)
 *   approve: node local/run-film.mjs --out films/<slug> --approve "why it may be released"
 *
 * Bossism checks first (preflight: refused with reasons if it cannot work,
 * every lowered quality named), reviews the finished run, sends failed work
 * back once, and prints the render command only for a film it cleared.
 *
 * The brain and the optional keys come from the environment, with the same
 * names as the studio (worker/brain.mjs, docs/BRAIN.md): BRAIN_URL,
 * BRAIN_MODEL, BRAIN_CONTEXT, BRAIN_VISION, SEARXNG_URL; PEXELS_API_KEY and
 * PIXABAY_API_KEY (free) for stock footage; GEMINI_API_KEY or
 * ANTHROPIC_API_KEY only if you choose those brains.
 *
 * When it finishes it prints the render command (render/render-film.mjs).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { mediaProviders } from "../engine/src/film-media.mjs";
import { estimateRun, newFilm, runFilm } from "../engine/src/film-run.mjs";
import { researchProviders } from "../engine/src/research-desk.mjs";
import { cleared, ownerOverride, preflight, productionGraph, understand } from "../engine/src/bossism.mjs";
import { say } from "../engine/src/messages.mjs";
import { superviseFilm } from "../engine/src/supervise.mjs";
import { brainFromEnv } from "../worker/brain.mjs";

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

/** @param {string} topic */
export function slug(topic) {
  return topic.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "film";
}

/**
 * @param {string[]} argv @param {Record<string, string | undefined>} env
 * @param {{ model?: import("../engine/src/film-run.mjs").Model, fetch?: typeof fetch, log?: (line: string) => void, signal?: AbortSignal }} [deps] tests, and the job worker (signal stops the run between stages)
 */
export async function main(argv, env, deps = {}) {
  const print = deps.log ?? ((/** @type {string} */ line) => console.log(line));
  const { values } = parseArgs({
    args: argv,
    options: {
      topic: { type: "string" }, minutes: { type: "string" }, format: { type: "string" }, notes: { type: "string" },
      out: { type: "string" }, budget: { type: "string" }, "no-edit": { type: "boolean" }, "no-viewers": { type: "boolean" },
      lang: { type: "string" }, "max-revisions": { type: "string" }, approve: { type: "string" },
    },
  });
  const lang = values.lang === "bn" ? "bn" : "en";
  const tell = (/** @type {{ code: string, params?: any }} */ m) => say(m, lang);
  const chosen = deps.model ? { ok: /** @type {const} */ (true), kind: "test", model: deps.model } : brainFromEnv(env);
  if (!chosen.ok) throw new Error(chosen.error);
  const brain = chosen;

  const out = resolve(values.out ?? join("films", slug(values.topic ?? "")));
  const store = folderStore(out);
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
    const made = newFilm({ topic: values.topic, minutes: values.minutes ?? "10", formatId: values.format, notes: values.notes }, slug(values.topic));
    if (!made.ok) throw new Error(made.error);
    film = made.film;
    await store.put("film.json", JSON.stringify({ ...film, createdAt: new Date().toISOString() }, null, 1));
  }

  const caps = brain.model.capabilities ?? {};
  const estimate = estimateRun(film.durationSeconds, brain.model.name, brain.model);
  print(`Brain: ${brain.kind} ${brain.model.name}${caps.contextTokens ? `, window ${caps.contextTokens} tokens` : ""}${caps.vision === false ? ", cannot see pictures" : ""}${caps.webSearch === false ? ", research through the code desk" : ""}.`);
  print(estimate.usdHigh === 0 ? `Cost: none (${estimate.chapters} chapter${estimate.chapters === 1 ? "" : "s"} on your own machine).` : `Estimated cost: $${estimate.usdLow}-$${estimate.usdHigh}.`);

  // Bossism's preflight: refuse what cannot work before anything runs, and name every lowered quality.
  const media = mediaProviders({ pexelsKey: env.PEXELS_API_KEY, pixabayKey: env.PIXABAY_API_KEY, smithsonianKey: env.SMITHSONIAN_API_KEY });
  const manual = readFileSync(join(ROOT, "prompts/1-zupona-master-engine-full.txt"), "utf8");
  const plan = preflight(productionGraph(understand({ film })), {
    brain: { connected: true, kind: brain.kind, model: brain.model.name, seesPictures: caps.vision !== false, searchesWeb: caps.webSearch !== false, contextTokens: caps.contextTokens, maxOutputTokens: caps.maxOutputTokens },
    researchDesk: true, mediaProviders: media.length, youtube: false, autoRender: false, minutes: film.durationSeconds / 60, manualChars: manual.length,
  });
  await store.put("preflight.json", JSON.stringify(plan, null, 1));
  if (!plan.ok) throw new Error(plan.blockers.map((b) => tell(b)).join(" "));
  for (const d of plan.degradations) print(`  NOTE ${tell(d)}`);

  const get = deps.fetch ?? fetch;
  const web = (/** @type {string} */ url, /** @type {RequestInit | undefined} */ init) => get(url, init);
  const budget = Number(values.budget);
  const channelDir = join(dirname(out), "channel");
  const options = {
    film,
    manual,
    model: brain.model,
    store,
    budgetUsd: Number.isFinite(budget) && budget > 0 ? budget : undefined,
    edit: !values["no-edit"],
    viewers: !values["no-viewers"],
    media: { providers: media },
    sources: { fetch: web },
    research: { providers: researchProviders({ fetch: web, searxngUrl: env.SEARXNG_URL || undefined }), fetch: web },
    channel: {
      load: async () => { const f = join(channelDir, "fingerprints.json"); return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : []; },
      save: async (list) => { mkdirSync(channelDir, { recursive: true }); writeFileSync(join(channelDir, "fingerprints.json"), JSON.stringify(list)); },
    },
    log: (/** @type {string} */ line) => print(`[${new Date().toISOString().slice(11, 19)}] ${line}`),
    signal: deps.signal,
  };
  const maxRevisions = Number(values["max-revisions"] ?? 1);
  const { state, review } = await superviseFilm({
    film, store,
    runOnce: () => runFilm(options),
    maxRevisions: Number.isFinite(maxRevisions) ? Math.max(0, Math.min(3, maxRevisions)) : 1,
    log: options.log,
  });
  print(`\n${state.status}${state.costUsd ? `, $${state.costUsd} spent` : ""}. Files in ${out}`);
  for (const gap of state.gaps) print(`  GAP ${gap}`);
  for (const g of review.gates) {
    print(`  ${tell({ code: `gate.${g.verdict}`, params: { gate: g.id } })}`);
    for (const f of g.findings) print(`    ${f.severity}: ${tell(f.message)}`);
  }
  print(`\n${tell(review.release.message)}`);
  if (cleared(review, JSON.parse((await store.get("decisions.json")) ?? "[]")).ok) print(`\nRender it:\n  node render/render-film.mjs --run ${out} --out ${join(out, "film.mp4")}`);
  else print(`\nTo release it anyway, with your reason on record:\n  node local/run-film.mjs --out ${out} --approve "why"`);
  return state;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
