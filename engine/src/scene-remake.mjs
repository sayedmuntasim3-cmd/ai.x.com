/**
 * Re-make one scene of a finished film: the owner says what to change, the
 * model rewrites that one scene line, code checks it against the chapter
 * (clock, IDs, word budget, fields, banned phrases, sources), and only then
 * is it saved. The scene's shots get fresh footage, and the render redoes
 * only that scene's segments (they are cached by content). The rest of the
 * film, and the money already spent on it, are untouched.
 *
 * Runtime-agnostic like film-run.mjs: model, store and providers are injected.
 */
import { chapterMedia, createUseHistory } from "./film-media.mjs";
import { chapterSpec, costOf, createFootageJudge, filmBrief } from "./film-run.mjs";
import { checkChapter, parseSceneLines } from "./scene-lines.mjs";

/**
 * @typedef {import("./film-run.mjs").Model} Model
 * @typedef {import("./film-run.mjs").Store} Store
 * @typedef {import("./film-run.mjs").Block} Block
 * @typedef {{ ok: true, scene: string, chapter: string, before: string, after: string, costUsd: number, media: { found: number, shots: number } | null } | { ok: false, scene: string, error: string, findings?: { code: string, scene?: string, detail: string }[], costUsd: number }} RemakeResult
 */

/** Scene IDs as written in the film: SC0001 ... */
export const SCENE_ID = /^SC\d{4,5}$/;

/**
 * @param {{ store: Store, model: Model, manual: string, scene: string, instruction: string, providers?: import("./film-media.mjs").MediaProvider[], review?: boolean, maxRepairs?: number }} o
 * @returns {Promise<RemakeResult>}
 */
export async function remakeScene(o) {
  const scene = String(o.scene).toUpperCase();
  const instruction = String(o.instruction ?? "").trim().slice(0, 2000);
  let spent = 0;
  const fail = (/** @type {string} */ error, /** @type {any} */ findings = undefined) => /** @type {RemakeResult} */ ({ ok: false, scene, error, findings, costUsd: round2(spent) });
  if (!SCENE_ID.test(scene)) return fail("Give a scene ID such as SC0012.");
  if (instruction.length < 3) return fail("Say what to change in the scene.");

  const run = JSON.parse((await o.store.get("run.json")) ?? "null");
  if (!run?.film) return fail("This film has no run yet.");
  if (run.status === "running") return fail("The film is still being made; re-make a scene once it has finished.");
  const plan = JSON.parse((await o.store.get("s3-chapters.json")) ?? "[]");
  const n = Number(scene.slice(2));
  const ch = plan.find((/** @type {any} */ c) => Number(String(c.firstScene).slice(2)) <= n && n <= Number(String(c.lastScene).slice(2)));
  if (!ch) return fail(`${scene} is not in this film.`);
  const key = `s5-${ch.id}.md`;
  const chapter = await o.store.get(key);
  if (chapter === null) return fail(`Chapter ${ch.id} has not been written yet.`);
  const lines = chapter.split("\n");
  const at = lines.findIndex((l) => parseSceneLines(l)[0]?.sc === scene);
  if (at < 0) return fail(`${scene} was not found in ${ch.id}.`);
  const before = lines[at];
  const spec = chapterSpec(ch, run.film.versionId);
  const baseline = checkChapter(chapter, spec);
  const neighbours = (/** @type {number} */ step) => { for (let i = at + step; i >= 0 && i < lines.length; i += step) if (parseSceneLines(lines[i])[0]) return lines[i]; return ""; };

  const system = [{ text: o.manual, cache: true }, { text: filmBrief(run.film), cache: true }];
  /** @param {string} stage @param {Block[]} content @param {number} maxTokens @param {{ effort?: string }} [extra] */
  const ask = async (stage, content, maxTokens, extra = {}) => {
    const reply = await o.model.call({ stage, system, messages: [{ role: "user", content }], maxTokens, effort: extra.effort ?? "medium" });
    const cost = costOf(reply.usage ?? {}, reply.model ?? o.model.name);
    spent += cost;
    const u = (run.usage[stage] ??= { calls: 0, input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });
    u.calls += 1;
    for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) u[k] += /** @type {any} */ (reply.usage ?? {})[k] ?? 0;
    run.costUsd = round2((run.costUsd ?? 0) + cost);
    if (reply.stopReason === "refusal") throw new Error("The model declined to re-make this scene.");
    return reply.text;
  };
  run.usage ??= {};

  const ledger = (await o.store.get("s2.md")) ?? "";
  /** @param {string} extra */
  const request = (extra) => [
    { text: `<S2>\n${ledger}\n</S2>`, cache: true },
    { text: [
      `Re-make scene ${scene} of chapter ${ch.id} only. The owner asks: "${instruction}"`,
      "Keep the scene ID, its start and end times, its chapter and its line format. Facts only from the S2 ledger. Narration words stay within ±10% of the W target for the scene's length, and the W field states the new count. Keep every field (NARR, ANCHOR, SHOTS, LOOK, SRC with Q1/Q2 queries for stock shots).",
      `<SCENE_BEFORE>\n${neighbours(-1)}\n</SCENE_BEFORE>\n<SCENE_NOW>\n${before}\n</SCENE_NOW>\n<SCENE_AFTER>\n${neighbours(1)}\n</SCENE_AFTER>`,
      extra,
      "Output the one new scene line inside a fenced ```text block and nothing else.",
    ].filter(Boolean).join("\n\n") },
  ];

  /** @type {string | null} */
  let after = null;
  let check = baseline;
  let note = "";
  for (let attempt = 0; attempt <= (o.maxRepairs ?? 1); attempt += 1) {
    let text;
    try { text = await ask(`remake:${scene}`, request(note), 4000); } catch (error) { await save(); return fail(error instanceof Error ? error.message : String(error)); }
    const candidate = (/```(?:text)?\s*\n([\s\S]*?)\n```/.exec(text)?.[1] ?? text).split("\n").find((l) => parseSceneLines(l)[0]?.sc === scene) ?? null;
    if (!candidate) { note = `Your last answer had no line for ${scene}. Return exactly one scene line.`; continue; }
    const next = [...lines.slice(0, at), candidate.trim(), ...lines.slice(at + 1)].join("\n");
    check = checkChapter(next, spec);
    const own = check.errors.filter((e) => e.scene === scene || !e.scene);
    const worse = check.errors.length > baseline.errors.length || own.some((e) => !baseline.errors.some((b) => b.code === e.code && b.scene === e.scene));
    if (!worse) { after = candidate.trim(); break; }
    note = "Your last version failed these checks; fix them:\n- " + own.map((e) => `${e.code}: ${e.detail}`).join("\n- ");
  }
  if (!after) { await save(); return fail("The new version did not pass the code checks, so the scene was left as it was.", check.errors.filter((e) => e.scene === scene)); }

  const history = JSON.parse((await o.store.get("remakes.json")) ?? "[]");
  history.push({ scene, chapter: ch.id, instruction, before, after, costUsd: round2(spent) });
  await o.store.put("remakes.json", JSON.stringify(history, null, 1));
  lines[at] = after;
  await o.store.put(key, lines.join("\n"));

  // Fresh footage for this scene's shots only, keeping the 10-minute rule against every other pick.
  let media = null;
  const mediaKey = `media-${ch.id}.json`;
  const existing = JSON.parse((await o.store.get(mediaKey)) ?? "null");
  if (o.providers?.length && existing) {
    const history = createUseHistory();
    for (const c of plan) {
      const m = c.id === ch.id ? existing : JSON.parse((await o.store.get(`media-${c.id}.json`)) ?? "null");
      if (m) history.load({ ...m, shots: m.shots.filter((/** @type {any} */ s) => s.scene !== scene) });
    }
    const fresh = await chapterMedia({ chapter: ch.id, markdown: after, providers: o.providers, history, judge: o.review === false ? undefined : createFootageJudge(ask) });
    const shots = [...existing.shots.filter((/** @type {any} */ s) => s.scene !== scene), ...fresh.shots].sort((a, b) => a.scene.localeCompare(b.scene) || a.shot - b.shot);
    const stats = { shots: shots.length, found: shots.filter((s) => s.status === "found").length, missing: shots.filter((s) => s.status === "missing").length, noQuery: shots.filter((s) => s.status === "no-query").length };
    await o.store.put(mediaKey, JSON.stringify({ ...existing, shots, stats }, null, 1));
    media = { found: fresh.stats.found, shots: fresh.stats.shots };
  }
  await save();
  return { ok: true, scene, chapter: ch.id, before, after, costUsd: round2(spent), media };

  async function save() { await o.store.put("run.json", JSON.stringify(run, null, 1)); }
}

/** @param {number} n */
function round2(n) { return Math.round(n * 100) / 100; }


