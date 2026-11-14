// Fans one query out to every enabled source in parallel, then filters, ranks, de-duplicates and
// interleaves the results. A slow or failing source never blocks the others: it is reported in
// `sources` and the rest of the results still come back.
//
// Two ways to call it:
//   searchMedia()  waits for every source and returns one ranked page (for the studio backend);
//   streamMedia()  yields each source's results the moment it answers (for the page, so fast
//                  archives show within a second while slower ones keep arriving).

import { SOURCES, type SourceInfo } from "./catalog";
import { createHttp, type Budget } from "./http";
import { allowed, attributionFor } from "./licenses";
import { SEARCHERS } from "./providers";
import { mergeResults, qualityLabel, scoreCandidate, terms } from "./rank";
import type { MediaEnv, MediaResult, Orientation, RightsLevel, SearchOptions, SearchResponse, SourceReport, Topic } from "./types";

export const RIGHTS: RightsLevel[] = ["no-attribution", "attribution", "share-alike"];
export const TOPICS: Topic[] = ["nature", "ocean", "space", "history", "science", "culture"];

/** Cloudflare's free plan allows 50 upstream requests per invocation; leave room for the cache. */
const DEFAULT_BUDGET = 45;
/** Openverse can take 10 to 15 s on a query it has not seen before. */
const SLOW_DEADLINE = 16000;

export type SourceState = SourceInfo & { enabled: boolean; missingKeys: string[] };

/** One source's contribution, in the order sources answer. */
export type SourceBatch = { report: SourceReport; results: MediaResult[] };

export type StreamEvent =
  | { type: "start"; query: string; rights: RightsLevel; minSize: number; sources: SourceReport[] }
  | { type: "source"; report: SourceReport; results: MediaResult[] }
  | { type: "done"; candidates: number; tookMs: number };

function disabledList(env: MediaEnv) {
  return new Set((env.MEDIA_DISABLED_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean));
}

/** Every source with whether it can run in this environment (keys present, not disabled). */
export function sourceStates(env: MediaEnv = {}): SourceState[] {
  const disabled = disabledList(env);
  return SOURCES.map((s) => {
    const missingKeys = (s.keys ?? []).filter((k) => !env[k]);
    return { ...s, missingKeys, enabled: !missingKeys.length && !disabled.has(s.id) && !!SEARCHERS[s.id] };
  });
}

export function normaliseOptions(opts: SearchOptions) {
  const clamp = (value: number | undefined, min: number, max: number, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
  const orientation: Orientation = opts.orientation === "landscape" || opts.orientation === "portrait" ? opts.orientation : "any";
  return {
    query: (opts.query ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    topic: opts.topic && TOPICS.includes(opts.topic) ? opts.topic : undefined,
    rights: opts.rights && RIGHTS.includes(opts.rights) ? opts.rights : ("attribution" as RightsLevel),
    orientation,
    minSize: clamp(opts.minSize, 0, 8000, 1000),
    sources: opts.sources?.length ? opts.sources : undefined,
    perSource: clamp(opts.perSource, 3, 30, 12),
    limit: clamp(opts.limit, 1, 300, 80),
    timeoutMs: clamp(opts.timeoutMs, 1500, 20000, 6500),
  };
}

type Normalised = ReturnType<typeof normaliseOptions>;

/** Runs every selected source and hands each one's filtered, scored results to `onBatch` as it finishes. */
async function run(opts: Normalised, env: MediaEnv, deps: { fetch?: typeof fetch }, onStart: (reports: SourceReport[]) => void, onBatch: (batch: SourceBatch) => void) {
  const words = terms(opts.query);
  const budget: Budget = { left: Number(env.MEDIA_SUBREQUEST_BUDGET) || DEFAULT_BUDGET };
  const wanted = opts.sources ? new Set(opts.sources) : null;
  const states = sourceStates(env).filter((s) => !wanted || wanted.has(s.id));
  const names = new Map(SOURCES.map((s) => [s.id, s.name]));

  onStart(
    states.map((s) => ({
      id: s.id,
      name: s.name,
      status: s.enabled ? "pending" : s.missingKeys.length ? "needs-key" : "skipped",
      count: 0,
      found: 0,
      ms: 0,
    })),
  );

  let candidates = 0;
  await Promise.all(
    states
      .filter((s) => s.enabled)
      .map(async (source) => {
        const slow = source.slow && !(source.id === "flickr" && env.FLICKR_API_KEY);
        // Multi-step sources (a search, then a request per record) get a little longer than one request.
        const deadline = slow ? SLOW_DEADLINE : opts.timeoutMs + 2500;
        const http = createHttp({ userAgent: env.MEDIA_USER_AGENT, timeoutMs: slow ? SLOW_DEADLINE - 500 : opts.timeoutMs, budget, fetchImpl: deps.fetch });
        const ctx = { query: opts.query, terms: words, perSource: opts.perSource, rights: opts.rights, orientation: opts.orientation, minSize: opts.minSize, env, http };
        const report: SourceReport = { id: source.id, name: source.name, status: "ok", count: 0, found: 0, ms: 0 };
        const t0 = Date.now();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let results: MediaResult[] = [];
        try {
          const found = await Promise.race([
            SEARCHERS[source.id](ctx),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("timed out")), deadline);
            }),
          ]);
          report.found = found.length;
          candidates += found.length;
          const kept = found.filter((c) => {
            if (!c.fullUrl || !c.thumbnailUrl || !allowed(c.license, opts.rights)) return false;
            const known = c.width && c.height ? Math.max(c.width, c.height) : 0;
            return !known || known >= opts.minSize;
          });
          const sourceName = names.get(source.id) ?? source.id;
          results = kept
            .map((c, position) => {
              const { nativeId, ...rest } = c;
              const score = scoreCandidate(c, {
                position,
                count: kept.length,
                quality: source.quality,
                topicMatch: !!opts.topic && source.topics.includes(opts.topic),
                terms: words,
                orientation: opts.orientation,
              });
              return {
                ...rest,
                id: `${source.id}:${nativeId}`,
                source: source.id,
                sourceName,
                attribution: attributionFor({ ...c, sourceName }),
                quality: qualityLabel(c),
                score: Math.round(score * 1000) / 1000,
              };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, opts.perSource);
          report.count = results.length;
          if (!results.length) report.status = "empty";
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          report.status = /timed out/.test(message) ? "timeout" : "error";
          report.error = message;
        } finally {
          clearTimeout(timer);
          report.ms = Date.now() - t0;
        }
        onBatch({ report, results });
      }),
  );
  return candidates;
}

/** Waits for every source and returns one ranked, de-duplicated page. */
export async function searchMedia(options: SearchOptions, env: MediaEnv = {}, deps: { fetch?: typeof fetch } = {}): Promise<SearchResponse> {
  const started = Date.now();
  const opts = normaliseOptions(options);
  if (!opts.query) return { query: "", rights: opts.rights, minSize: opts.minSize, results: [], sources: [], candidates: 0, tookMs: 0 };

  const reports = new Map<string, SourceReport>();
  const all: MediaResult[] = [];
  const candidates = await run(
    opts,
    env,
    deps,
    (initial) => initial.forEach((r) => reports.set(r.id, r)),
    ({ report, results }) => {
      reports.set(report.id, report);
      all.push(...results);
    },
  );

  const results = mergeResults(all, opts.limit);
  const counts = new Map<string, number>();
  for (const r of results) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  const sources = [...reports.values()].map((r) => {
    const count = counts.get(r.id) ?? 0;
    return { ...r, count, status: r.status === "ok" && !count ? ("empty" as const) : r.status };
  });
  sources.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { query: opts.query, rights: opts.rights, minSize: opts.minSize, results, sources, candidates, tookMs: Date.now() - started };
}

/** Streams results as newline-delimited JSON events: one "start", one "source" per source, one "done". */
export function streamMedia(options: SearchOptions, env: MediaEnv = {}, deps: { fetch?: typeof fetch } = {}): ReadableStream<Uint8Array> {
  const opts = normaliseOptions(options);
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      const started = Date.now();
      try {
        if (!opts.query) {
          send({ type: "start", query: "", rights: opts.rights, minSize: opts.minSize, sources: [] });
        } else {
          const candidates = await run(
            opts,
            env,
            deps,
            (sources) => send({ type: "start", query: opts.query, rights: opts.rights, minSize: opts.minSize, sources }),
            ({ report, results }) => send({ type: "source", report, results }),
          );
          send({ type: "done", candidates, tookMs: Date.now() - started });
        }
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });
}
