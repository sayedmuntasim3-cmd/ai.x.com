#!/usr/bin/env node
/**
 * The studio's job queue on your own computers: queue films and renders,
 * and run workers that take whatever their machine can do. Several workers
 * (on one machine, or on machines sharing the queue folder) share the work;
 * a worker that dies loses its job after its lease and another continues
 * from the last checkpoint. Ctrl+C hands the current job back cleanly.
 *
 *   node local/jobs.mjs add film --topic "The rise and fall of Lamborghini" --minutes 10
 *   node local/jobs.mjs add render --run films/<slug> [--resolution 1920x1080]
 *   node local/jobs.mjs add selftest [--steps 20] [--step-ms 500]    (checks a worker end to end)
 *   node local/jobs.mjs work [--name "Home PC"] [--kinds film,render,selftest] [--concurrency N]
 *   node local/jobs.mjs status | health [--lang bn]
 *   node local/jobs.mjs cancel <id> | retry <id>
 *   common: --queue <folder> (default films/queue)
 *
 * The brain and keys come from the environment (docs/BRAIN.md), per worker:
 * each machine uses its own brain.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { windowNeeds } from "../engine/src/bossism.mjs";
import { renderNeed } from "../engine/src/device-profile.mjs";
import { PermanentError, runWorker } from "../engine/src/job-runner.mjs";
import { createQueue } from "../engine/src/jobs.mjs";
import { say } from "../engine/src/messages.mjs";
import { main as releaseGate } from "../render/release-gate.mjs";
import { probeDevice } from "./device.mjs";
import { folderJobStore } from "./folder-store.mjs";
import { main as runFilmMain, slug } from "./run-film.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** @param {number} ms @param {AbortSignal} signal */
const pause = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); signal.addEventListener("abort", () => { clearTimeout(t); r(undefined); }, { once: true }); });

/**
 * What each kind of job does on this machine.
 * @param {Record<string, string | undefined>} env @param {(line: string) => void} print
 * @returns {Record<string, import("../engine/src/job-runner.mjs").Handler>}
 */
export function handlers(env, print) {
  return {
    // Counts to `steps`, saving a checkpoint after each: a reclaimed self-test continues where the last worker stopped.
    async selftest(job, ctx) {
      const steps = Number(job.input.steps ?? 20);
      const from = Number(job.checkpoint?.done ?? 0);
      for (let i = from; i < steps; i += 1) {
        await pause(Number(job.input.stepMs ?? 500), ctx.signal);
        if (ctx.signal.aborted) throw new Error("stopped");
        await ctx.checkpoint({ done: i + 1 });
        ctx.progress("selftest", i + 1, steps);
      }
      return { steps, resumedFrom: from };
    },
    // The whole supervised film run (local/run-film.mjs); its stages in the film folder are the checkpoints.
    async film(job, ctx) {
      const out = String(job.input.out);
      const args = ["--out", out];
      if (!existsSync(join(out, "film.json"))) args.push("--topic", String(job.input.topic), "--minutes", String(job.input.minutes ?? 10), ...(job.input.format ? ["--format", String(job.input.format)] : []), ...(job.input.notes ? ["--notes", String(job.input.notes)] : []));
      const state = await runFilmMain(args, env, {
        signal: ctx.signal,
        log: (line) => {
          print(`[${job.id.slice(0, 8)}] ${line}`);
          const m = /\] (\S+): done$/.exec(line);
          if (m) ctx.checkpoint({ stage: m[1] }, m[1]).catch(() => {});
        },
      });
      return { status: state?.status ?? null, gaps: state?.gaps?.length ?? 0, out };
    },
    // Render a cleared film: the release gate first (nothing is spent on a blocked film), the master gate after.
    async render(job, ctx) {
      const run = String(job.input.run);
      const lines = /** @type {string[]} */ ([]);
      if ((await releaseGate(["--run", run], { print: (l) => lines.push(l) })) !== 0) throw new PermanentError(`Not cleared for release:\n${lines.join("\n")}`);
      const [width, height] = String(job.input.resolution ?? "1920x1080").split("x");
      const file = join(run, `${basename(run)}.mp4`);
      await new Promise((ok, fail) => {
        const p = spawn(process.execPath, [join(ROOT, "render/render-film.mjs"), "--run", run, "--out", file, "--width", width, "--height", height, "--work", join(run, ".render"), ...(existsSync(join(run, "narration")) ? ["--voice", join(run, "narration")] : [])], { stdio: ["ignore", "pipe", "pipe"], signal: ctx.signal });
        p.stdout.on("data", (d) => print(`[${job.id.slice(0, 8)}] ${String(d).trimEnd()}`));
        p.stderr.on("data", (d) => print(`[${job.id.slice(0, 8)}] ${String(d).trimEnd()}`));
        p.on("error", fail);
        p.on("close", (code) => (code === 0 ? ok(undefined) : fail(new Error(`The renderer exited with ${code}.`))));
      });
      const check = /** @type {string[]} */ ([]);
      if ((await releaseGate(["--report", file.replace(/\.mp4$/, ".report.json"), "--file", file], { print: (l) => check.push(l) })) !== 0) throw new PermanentError(`The rendered film failed its final check:\n${check.join("\n")}`);
      return { file };
    },
  };
}

/** @param {string[]} argv @param {Record<string, string | undefined>} env @param {{ print?: (line: string) => void, shutdown?: AbortSignal }} [deps] */
export async function main(argv, env, deps = {}) {
  const print = deps.print ?? ((/** @type {string} */ l) => console.log(l));
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: {
      queue: { type: "string" }, lang: { type: "string" }, topic: { type: "string" }, minutes: { type: "string" }, format: { type: "string" }, notes: { type: "string" },
      out: { type: "string" }, run: { type: "string" }, resolution: { type: "string" }, steps: { type: "string" }, "step-ms": { type: "string" },
      name: { type: "string" }, kinds: { type: "string" }, concurrency: { type: "string" }, "lease-ms": { type: "string" }, "poll-ms": { type: "string" }, once: { type: "boolean" },
    },
  });
  const lang = values.lang === "bn" ? "bn" : "en";
  const dir = resolve(values.queue ?? join("films", "queue"));
  const leaseMs = Number(values["lease-ms"] ?? 120_000);
  const queue = createQueue({ store: folderJobStore(dir), defaults: { leaseMs } });
  const [command, what] = positionals;

  if (command === "add") {
    if (what === "film") {
      if (!values.topic) throw new Error('Give a topic: add film --topic "..."');
      const minutes = Number(values.minutes ?? 10);
      const out = resolve(values.out ?? join("films", slug(values.topic)));
      const job = await queue.enqueue({ kind: "film", title: values.topic, input: { topic: values.topic, minutes, format: values.format, notes: values.notes, out }, requires: { capabilities: ["brain"], minContextTokens: windowNeeds(minutes).perChapter }, timeoutMs: 24 * 3_600_000 });
      print(`${job.id} film "${values.topic}" queued (${out})`);
      return job;
    }
    if (what === "render") {
      if (!values.run) throw new Error("Give the film folder: add render --run films/<slug>");
      const resolution = values.resolution ?? "1920x1080";
      const job = await queue.enqueue({ kind: "render", title: basename(values.run), input: { run: resolve(values.run), resolution }, requires: { capabilities: ["ffmpeg", renderNeed(resolution)] }, timeoutMs: 8 * 3_600_000 });
      print(`${job.id} render ${resolution} queued (${job.input.run})`);
      return job;
    }
    if (what === "selftest") {
      const job = await queue.enqueue({ kind: "selftest", title: "self-test", input: { steps: Number(values.steps ?? 20), stepMs: Number(values["step-ms"] ?? 500) } });
      print(`${job.id} self-test queued`);
      return job;
    }
    throw new Error("add film | render | selftest");
  }

  if (command === "status") {
    const jobs = await queue.list();
    for (const j of jobs) {
      const last = j.history.at(-1);
      const p = j.progress ? ` ${j.progress.stage} ${j.progress.done}/${j.progress.total}` : "";
      print(`${j.id.slice(0, 8)}  ${j.state.padEnd(9)} ${j.kind.padEnd(8)} ${String(j.title ?? "").slice(0, 40).padEnd(40)} try ${j.attempts}, failed ${j.failures}${p}  ${last ? say(last.message, lang) : ""}`);
    }
    if (!jobs.length) print(lang === "bn" ? "কিউতে কোনো কাজ নেই।" : "The queue is empty.");
    return jobs;
  }

  if (command === "health") {
    const h = await queue.health();
    for (const w of h.workers) print(`${w.alive ? "●" : "○"} ${w.name ?? w.id}  ${w.capabilities.join(", ")}  (${w.kinds.join(", ")})`);
    print(Object.entries(h.counts).map(([k, v]) => `${k} ${v}`).join(" · "));
    for (const w of h.waiting) print(`  ${w.id.slice(0, 8)}: ${say(w.message, lang)}`);
    return h;
  }

  if (command === "cancel" || command === "retry") {
    const jobs = await queue.list();
    const job = jobs.find((j) => j.id === what || j.id.startsWith(String(what)));
    if (!job) throw new Error(`No job ${what}.`);
    const done = command === "cancel" ? await queue.cancel(job.id) : await queue.retry(job.id);
    print(done ? `${job.id}: ${say(/** @type {any} */ (done.history.at(-1)).message, lang)}` : `${job.id}: nothing to ${command} (${job.state}).`);
    return done;
  }

  if (command === "work") {
    const { profile, host, platform } = probeDevice(env);
    const kinds = (values.kinds ?? "film,render,selftest").split(",").map((k) => k.trim()).filter(Boolean);
    const name = values.name ?? host;
    const concurrency = Math.max(1, Math.min(8, Number(values.concurrency ?? profile.concurrency)));
    print(`${name} (${platform}): ${profile.tier} machine, ${profile.capabilities.join(", ")}; ${concurrency} at a time; jobs: ${kinds.join(", ")}`);
    const shutdown = new AbortController();
    const stop = () => { if (shutdown.signal.aborted) process.exit(130); print("Stopping: the current jobs are handed back for another worker…"); shutdown.abort(); };
    if (!deps.shutdown) { process.on("SIGINT", stop); process.on("SIGTERM", stop); }
    deps.shutdown?.addEventListener("abort", () => shutdown.abort(), { once: true });
    const all = handlers(env, print);
    const outcomes = await Promise.all(Array.from({ length: concurrency }, (_, i) => runWorker({
      queue,
      worker: { id: `${name}-${process.pid}-${i + 1}`, name: concurrency > 1 ? `${name} #${i + 1}` : name, kinds, capabilities: profile.capabilities, resources: profile.resources },
      handlers: all,
      shutdown: shutdown.signal,
      pollMs: Number(values["poll-ms"] ?? 5000),
      once: values.once,
      log: print,
    })));
    return outcomes.flat();
  }

  throw new Error("Commands: add film|render|selftest, work, status, health, cancel <id>, retry <id>. See the top of local/jobs.mjs.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2), process.env).then(() => {}, (error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
