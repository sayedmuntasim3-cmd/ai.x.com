// Shot list: two or three short visual searches per chapter ("Shah Jahan portrait", "Taj Mahal
// dawn"). Short, concrete phrases find far better pictures in archives than a whole sentence does.
//
// Who writes it, first available wins:
//   1. Your own agent: set SHOT_PLANNER_URL (and SHOT_PLANNER_TOKEN) to any endpoint that takes the
//      same JSON body and returns { scenes: [{ chapter, queries }] }.
//   2. An open-source model on your own Cloudflare account (Workers AI, the "AI" binding in
//      wrangler.jsonc). Free daily allowance, no outside AI company to pay.
//   3. Claude, only if ANTHROPIC_API_KEY is set.
//   4. The archives themselves: names that recur in search results for the subject (free).
//   5. Keywords from the idea.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MediaEnv } from "../src/media";
import { archivePlan, keywordPlan, type ShotPlan, type ShotPlanRequest } from "../src/media/plan";

export type { ShotPlan, ShotPlanRequest };

/** The Workers AI binding (wrangler.jsonc "ai"). */
export type WorkersAI = { run(model: string, input: Record<string, unknown>): Promise<unknown> };

/** Open-source model with JSON output on Workers AI; change with WORKERS_AI_MODEL. */
const OPEN_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CLAUDE_MODEL = "claude-opus-5-5";

const SYSTEM = `You plan the pictures for documentary films. For each chapter of a film you write two or three short image search phrases that a picture researcher would type into open archives: Wikimedia Commons, NASA, ESA/Hubble, the Met, the Rijksmuseum, the Library of Congress, iNaturalist and similar.

Good phrases are 2 to 5 words of concrete, photographable things: named people, places, buildings, artworks, species, objects, events and eras ("Shah Jahan portrait", "Taj Mahal sunrise", "Mughal miniature battle", "humpback whale breaching"). Archives index titles and captions, so use the words a caption would use, in English.

Avoid abstract or emotional words (journey, mystery, hope, beauty), generic filler (people, things, story), and anything an archive cannot photograph. Vary the phrases across chapters so the film does not repeat the same pictures, and follow the chapter's role: an opening wants an establishing image, a closing chapter a reflective one. Return exactly one entry per chapter, in order, with the chapter title copied unchanged.`;

const SCENES_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: { chapter: { type: "string" }, queries: { type: "array", items: { type: "string" } } },
        required: ["chapter", "queries"],
      },
    },
  },
  required: ["scenes"],
} as const;

const ShotList = z.object({
  scenes: z.array(
    z.object({
      chapter: z.string().describe("The chapter title, exactly as given"),
      queries: z.array(z.string()).describe("2 or 3 image search phrases, 2 to 5 words each"),
    }),
  ),
});

function clean(req: ShotPlanRequest): ShotPlanRequest {
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const chapters = Array.isArray(req.chapters) ? req.chapters : [];
  return {
    idea: text(req.idea, 600),
    topic: text(req.topic, 40) || undefined,
    style: text(req.style, 40) || undefined,
    audience: text(req.audience, 40) || undefined,
    chapters: chapters
      .slice(0, 12)
      .map((c) => ({ title: text(c?.title, 80), start: Number(c?.start) || 0, end: Number(c?.end) || 0 }))
      .filter((c) => c.title),
  };
}

export function parsePlanRequest(body: unknown): ShotPlanRequest | null {
  if (!body || typeof body !== "object") return null;
  const req = clean(body as ShotPlanRequest);
  return req.idea.length >= 3 && req.chapters.length ? req : null;
}

function brief(req: ShotPlanRequest) {
  const outline = req.chapters.map((c, i) => `${i + 1}. ${c.title} (${Math.round(c.start)}s to ${Math.round(c.end)}s)`).join("\n");
  const facts = [`Film idea: ${req.idea}`, req.topic && `Category: ${req.topic}`, req.style && `Visual style: ${req.style}`, req.audience && `Audience: ${req.audience}`].filter(Boolean);
  return `${facts.join("\n")}\n\nChapters:\n${outline}\n\nAnswer with JSON only: {"scenes":[{"chapter":"<title>","queries":["...","..."]}]}`;
}

/** Accepts any model's answer, keeps the chapter order, and fills gaps so every chapter has searches. */
export function tidy(raw: unknown, req: ShotPlanRequest): ShotPlan["scenes"] | null {
  let value = raw;
  if (typeof value === "string") {
    const json = value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
    try {
      value = JSON.parse(json);
    } catch {
      return null;
    }
  }
  const scenes = (value as { scenes?: unknown })?.scenes;
  if (!Array.isArray(scenes) || !scenes.length) return null;
  const list = (scenes as { chapter?: unknown; queries?: unknown }[]).map((s) => ({
    chapter: typeof s?.chapter === "string" ? s.chapter.trim() : "",
    queries: Array.isArray(s?.queries) ? s.queries.filter((q: unknown): q is string => typeof q === "string") : ([] as string[]),
  }));
  const byTitle = new Map(list.map((s) => [s.chapter.toLowerCase(), s.queries]));
  const fallback = keywordPlan(req).scenes;
  let usable = 0;
  const out = req.chapters.map((c, i) => {
    const queries = [...new Set((byTitle.get(c.title.toLowerCase()) ?? list[i]?.queries ?? []).map((q) => q.replace(/\s+/g, " ").trim().slice(0, 80)).filter((q) => q.length >= 2))].slice(0, 3);
    if (queries.length) usable += 1;
    return { chapter: c.title, queries: queries.length ? queries : fallback[i].queries };
  });
  return usable >= Math.ceil(req.chapters.length / 2) ? out : null;
}

async function ownAgent(req: ShotPlanRequest, env: MediaEnv) {
  const res = await fetch(env.SHOT_PLANNER_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(env.SHOT_PLANNER_TOKEN ? { Authorization: `Bearer ${env.SHOT_PLANNER_TOKEN}` } : {}) },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`own agent answered ${res.status}`);
  return tidy(await res.json(), req);
}

async function openModel(req: ShotPlanRequest, env: MediaEnv, ai: WorkersAI) {
  const out = (await ai.run(env.WORKERS_AI_MODEL || OPEN_MODEL, {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: brief(req) },
    ],
    response_format: { type: "json_schema", json_schema: SCENES_SCHEMA },
    max_tokens: 1500,
  })) as { response?: unknown };
  return tidy(out?.response, req);
}

async function claude(req: ShotPlanRequest, env: MediaEnv) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });
  const message = await client.beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 4000,
    // If Claude Opus 5.5 declines, the API retries the same request on a fallback model it picks.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ShotList) },
    system: SYSTEM,
    messages: [{ role: "user", content: brief(req) }],
  });
  if (message.stop_reason === "refusal" || !message.parsed_output) return null;
  return tidy(message.parsed_output, req);
}

export async function planShots(input: ShotPlanRequest, env: MediaEnv, bindings: { ai?: WorkersAI } = {}): Promise<ShotPlan> {
  const req = clean(input);
  const attempts: [ShotPlan["source"], () => Promise<ShotPlan["scenes"] | null>][] = [];
  if (env.SHOT_PLANNER_URL) attempts.push(["agent", () => ownAgent(req, env)]);
  if (bindings.ai && env.SHOT_PLANNER_OPEN_MODEL !== "off") attempts.push(["open-model", () => openModel(req, env, bindings.ai!)]);
  if (env.ANTHROPIC_API_KEY) attempts.push(["claude", () => claude(req, env)]);
  for (const [source, run] of attempts) {
    try {
      const scenes = await run();
      if (scenes) return { source, scenes };
    } catch (err) {
      if (err instanceof Anthropic.APIError) console.error(`shot list: Claude API error ${err.status}`);
      else console.error(`shot list: ${source} failed`, err instanceof Error ? err.message : err);
    }
  }
  return archivePlan(req, env);
}
