// Shot list: Claude reads the film idea and its chapter plan and writes two or three short visual
// searches per chapter ("Shah Jahan portrait", "Taj Mahal dawn"). Short, concrete phrases find far
// better pictures in museum and space archives than a whole sentence does.
//
// Needs the ANTHROPIC_API_KEY secret. Without it (or if Claude cannot answer) the plan falls back to
// keywords pulled from the idea, so the page keeps working.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { MediaEnv } from "../src/media";
import { contentWords, visualQuery } from "../src/media/query";
import { terms } from "../src/media/rank";

export type PlanChapter = { title: string; start: number; end: number };
export type PlanRequest = { idea: string; topic?: string; style?: string; audience?: string; chapters: PlanChapter[] };
export type PlanScene = { chapter: string; queries: string[] };
export type PlanResponse = { scenes: PlanScene[]; source: "claude" | "keywords" };

const MODEL = "claude-opus-5-5";

const ShotList = z.object({
  scenes: z.array(
    z.object({
      chapter: z.string().describe("The chapter title, exactly as given"),
      queries: z.array(z.string()).describe("2 or 3 image search phrases, 2 to 5 words each"),
    }),
  ),
});

const SYSTEM = `You plan the pictures for documentary films. For each chapter of a film you write two or three short image search phrases that a picture researcher would type into open archives: Wikimedia Commons, NASA, ESA/Hubble, the Met, the Rijksmuseum, the Library of Congress, iNaturalist and similar.

Good phrases are 2 to 5 words of concrete, photographable things: named people, places, buildings, artworks, species, objects, events and eras ("Shah Jahan portrait", "Taj Mahal sunrise", "Mughal miniature battle", "humpback whale breaching"). Archives index titles and captions, so use the words a caption would use, in English.

Avoid abstract or emotional words (journey, mystery, hope, beauty), generic filler (people, things, story), and anything an archive cannot photograph. Vary the phrases across chapters so the film does not repeat the same pictures, and follow the chapter's role: an opening wants an establishing image, a closing chapter a reflective one. Return exactly one entry per chapter, in order, with the chapter title copied unchanged.`;

/** Plan without Claude: the idea's keywords for every chapter. */
export function keywordPlan(req: PlanRequest): PlanResponse {
  const base = visualQuery(req.idea) || req.topic || "documentary";
  const used = new Set(terms(base));
  const alt = contentWords(req.idea).filter((w) => !used.has(w)).slice(0, 3).join(" ");
  return { source: "keywords", scenes: req.chapters.map((c) => ({ chapter: c.title, queries: alt ? [base, alt] : [base] })) };
}

function clean(req: PlanRequest): PlanRequest {
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

export function parsePlanRequest(body: unknown): PlanRequest | null {
  if (!body || typeof body !== "object") return null;
  const req = clean(body as PlanRequest);
  return req.idea.length >= 3 && req.chapters.length ? req : null;
}

export async function planShots(input: PlanRequest, env: MediaEnv): Promise<PlanResponse> {
  const req = clean(input);
  if (!env.ANTHROPIC_API_KEY) return keywordPlan(req);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });
  const outline = req.chapters.map((c, i) => `${i + 1}. ${c.title} (${Math.round(c.start)}s to ${Math.round(c.end)}s)`).join("\n");
  const facts = [
    `Film idea: ${req.idea}`,
    req.topic && `Category: ${req.topic}`,
    req.style && `Visual style: ${req.style}`,
    req.audience && `Audience: ${req.audience}`,
  ].filter(Boolean);
  const brief = `${facts.join("\n")}\n\nChapters:\n${outline}`;

  try {
    const message = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      // If Claude Opus 5.5 declines, the API retries the same request on a fallback model it picks.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(ShotList) },
      system: SYSTEM,
      messages: [{ role: "user", content: brief }],
    });
    if (message.stop_reason === "refusal" || !message.parsed_output) return keywordPlan(req);

    // Keep Claude's order but make sure every chapter has a usable entry.
    const byTitle = new Map(message.parsed_output.scenes.map((s) => [s.chapter.trim().toLowerCase(), s.queries]));
    const fallback = keywordPlan(req).scenes;
    const scenes = req.chapters.map((c, i) => {
      const raw = byTitle.get(c.title.toLowerCase()) ?? message.parsed_output!.scenes[i]?.queries ?? [];
      const queries = [...new Set(raw.map((q) => q.replace(/\s+/g, " ").trim().slice(0, 80)).filter((q) => q.length >= 2))].slice(0, 3);
      return { chapter: c.title, queries: queries.length ? queries : fallback[i].queries };
    });
    return { source: "claude", scenes };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) console.warn("shot list: Claude rate limited");
    else if (err instanceof Anthropic.AuthenticationError) console.error("shot list: ANTHROPIC_API_KEY was rejected");
    else if (err instanceof Anthropic.APIError) console.error(`shot list: Claude API error ${err.status}`);
    else console.error("shot list: request failed", err);
    return keywordPlan(req);
  }
}
