/**
 * Bossism supervising a film run: run it, review the evidence, send what
 * failed back to the stage that made it (a bounded number of times), and
 * decide whether the film may be rendered and released.
 *
 * Runtime-agnostic, like film-run.mjs: the Cloudflare Workflow passes its
 * durable step.do, the local runner passes fn(). Every review, revision and
 * release decision is a named step and is recorded in decisions.json, so a
 * restart replays them instead of deciding twice.
 */
import { applyRevision, LIMITS, productionGraph, recordDecision, reviewRun, revisionPlan, understand, verdicts } from "./bossism.mjs";
import { msg } from "./messages.mjs";

/** @typedef {import("./film-run.mjs").Film} Film */
/** @typedef {import("./film-run.mjs").Store} Store */
/** @typedef {import("./bossism.mjs").Review} Review */

/**
 * @param {{
 *   film: Film, store: Store,
 *   runOnce: (round: number) => Promise<any>,
 *   step?: <T>(name: string, fn: () => Promise<T>) => Promise<T>,
 *   maxRevisions?: number, log?: (line: string) => void,
 * }} o
 * @returns {Promise<{ state: any, review: Review, rounds: number }>}
 */
export async function superviseFilm(o) {
  const step = o.step ?? (async (_name, fn) => fn());
  const log = o.log ?? (() => {});
  const max = o.maxRevisions ?? LIMITS.maxRevisions;
  let state = await o.runOnce(0);
  for (let round = 1; ; round += 1) {
    const review = await step(`review-${round}`, async () => {
      const r = await reviewRun({ store: o.store, film: o.film });
      await o.store.put("review.json", JSON.stringify(r, null, 1));
      await recordDecision(o.store, { actor: "bossism", action: r.release.allowed ? "release-allowed" : "release-blocked", message: r.release.message, gates: verdicts(r.gates), round });
      return r;
    });
    log(`review ${round}: ${review.gates.map((g) => `${g.id} ${g.verdict}`).join(", ")}`);
    const chapters = JSON.parse((await o.store.get("s3-chapters.json")) ?? "[]").map((/** @type {any} */ c) => String(c.id));
    const graph = productionGraph(understand({ film: o.film }), chapters);
    const plan = revisionPlan(review, graph, { round, maxRevisions: max });
    if (!plan) {
      const revisable = revisionPlan(review, graph, { round: 1, maxRevisions: 1 });
      if (revisable && round > max) await step(`revise-limit-${round}`, () => recordDecision(o.store, { actor: "bossism", action: "revise-limit", message: msg("revise.limit", { max }), gates: verdicts(review.gates), round }));
      return { state, review, rounds: round - 1 };
    }
    await step(`revise-${round}`, async () => {
      const run = JSON.parse((await o.store.get("run.json")) ?? "null");
      if (!run) throw new Error("There is no run state to revise.");
      applyRevision(run, plan);
      await o.store.put("run.json", JSON.stringify(run, null, 1));
      await recordDecision(o.store, { actor: "bossism", action: "revise", message: msg("revise.sent", { round, max, stages: plan.targets.join(", ") }), gates: verdicts(review.gates), round });
      return { stages: plan.stages };
    });
    log(`revision ${round}: ${plan.targets.join(", ")} sent back (${plan.stages.length} stages redone)`);
    state = await o.runOnce(round);
  }
}
