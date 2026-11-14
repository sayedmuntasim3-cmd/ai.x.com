// Zupona media search: one query across 30 openly licensed image archives.
//
//   import { searchMedia } from "./media";
//   const { results, sources } = await searchMedia({ query: "snow leopard", topic: "nature" }, env);
//
// Works anywhere `fetch` exists (Cloudflare Workers, Next.js route handlers, Node 18+).

export { SOURCES, SOURCE_GROUPS, type SourceInfo } from "./catalog";
export { attributionFor, allowed, parseLicense } from "./licenses";
export { mergeResults } from "./rank";
export { RIGHTS, TOPICS, normaliseOptions, searchMedia, sourceStates, streamMedia, type SourceBatch, type SourceState, type StreamEvent } from "./search";
export type * from "./types";
