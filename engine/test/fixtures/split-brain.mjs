/**
 * A film-sized run without an API key: a 12-minute film on a brain that limits one request's prompt
 * the way Groq's free tier does, answering every stage (and every split part) as a real one would.
 * Used by engine/test/film-split-run.test.mjs and local/prompt-sizes.mjs (the prompt table).
 */
import { readFileSync } from "node:fs";
import { checkChapter, parseSceneLines, toSeconds } from "../../src/scene-lines.mjs";
import { promptTokens } from "../../src/film-split.mjs";
import { newFilm } from "../../src/film-run.mjs";

export const LIMIT = 7200;
export const MANUAL = readFileSync(new URL("../../../prompts/1-zupona-master-engine-full.txt", import.meta.url), "utf8");
export const CHAPTERS = [
  { id: "C1", title: "The span", start: "0:00:00", end: "0:06:00", firstScene: "SC0001", lastScene: "SC0036", brief: "opens L01, uses C01 and C02" },
  { id: "C2", title: "The fall", start: "0:06:00", end: "0:12:00", firstScene: "SC0037", lastScene: "SC0072", brief: "pays L01, uses C02" },
];
const clock = (/** @type {number} */ s) => `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const SAID = "the bridge began to twist along its length while the wind pushed sideways through the narrow valley and the deck rolled from side to side".split(" ");

/** One compact scene line whose narration fills its own time at 150 words a minute. @param {number} n @param {number} start @param {number} end */
export function line(n, start, end) {
  const words = Math.round((end - start) * 2.5);
  const said = Array.from({ length: words }, (_, i) => SAID[i % SAID.length]).join(" ").replace(/[,.]$/, "");
  return `**SC${String(n).padStart(4, "0")}** | ${clock(start)}-${clock(end)} | ${n <= 36 ? "C1" : "C2"} | beat | E | C01 | NARR: ${said} {C01} | W ${words}/${words} | ANCHOR: "bridge" -> the span | SHOTS: (1) R3 bridge | EV: R1 0 / R3 1 | RUNG: R3/L2 -> R1/L4 | FX: FX-KINETIC | SRC: Pexels · Q1 "bridge" | MOTION: 1.08x push | TRANS: hard cut on the beat | OST: text | SFX: SND-FX-01 | MUS: M01 | LOOK: LOOK-M`;
}

/** A brain with Groq's per-request limit that records every prompt it is sent. */
export function limitedBrain(limit = LIMIT) {
  /** @type {{ stage: string, tokens: number }[]} */
  const sent = [];
  return {
    name: "groq-limited",
    sent,
    capabilities: { vision: false, webSearch: false, promptLimitTokens: limit },
    /** @param {import("../../src/film-run.mjs").ModelRequest} r */
    async call(r) {
      const tokens = promptTokens([...r.system, ...r.messages.flatMap((m) => m.content)]);
      sent.push({ stage: r.stage, tokens });
      if (tokens > limit) throw new Error(`${r.stage} sent ${tokens} prompt tokens, over the brain's ${limit}`);
      const text = r.messages[0].content.map((b) => b.text ?? "").join("\n");
      /** @param {string} out */
      const reply = (out) => ({ text: out, stopReason: "end_turn", usage: {} });
      switch (r.stage) {
        case "s01":
          return reply("## S0\nmedia math\n## S1\nangle, 10 titles, title contract");
        case "s01:2":
          return reply("## S1\nbeat the best, 10 titles scored");
        case "research-plan":
          return reply("```json\n{\"queries\": [\"Tacoma Narrows Bridge collapse\"]}\n```");
        case "research": {
          // A research file the size of a real one, so the ledger really is too large for one call.
          const facts = Array.from({ length: 12 }, (_, i) => ({ id: `F${String(i).padStart(2, "0")}`, claim: `the bridge's detail ${i} in 1940`, value: `${1940 + i} ${"detail ".repeat(220)}`, sources: ["D1"], confidence: "high", conflict: null }));
          return reply("```json\n" + JSON.stringify({ subject: "Tacoma Narrows", facts, unknowns: [], doNotConfuse: [] }) + "\n```");
        }
        case "s2":
        case "s2:2":
        case "s2:3":
          return reply("| ID | Claim | Status | Value | Sources | Confidence | Chapter use |\n| --- | --- | --- | --- | --- | --- | --- |\n| C01 | The span twisted | FACT | 1940 | https://e.org/a | high | C1 |\n| C02 | Winds near 42 mph | FACT | 42 | https://e.org/b | high | C2 |");
        case "s3":
          return reply("```json\n" + JSON.stringify(CHAPTERS) + "\n```");
        case "s3:2":
          return reply("## S3\narc, retention map, emotion curve");
        case "s4":
          return reply("## Narrator\nwarm, low, unhurried\n## Characters\nengineers\n## Locations\nTacoma Narrows\n## Objects\nthe deck");
        case "s4:2":
          return reply("## Master look\ncold steel, grey water");
        case "s4:3":
          return reply("## Sound bible\nSND-FX-01 wind gust\n## Pronunciation lexicon\n| Term | Narrator says | Note |\n| --- | --- | --- |\n| Tacoma | tuh-KOH-muh | not ta-KO-ma |\n## WRITER PACK\nnarrator warm and low; look LOOK-M cold steel; sources R2 archive, R3 stock, R1 graphics; sound SND-FX-01; music M01; continuity the deck twists; pronunciation tuh-KOH-muh");
        case "s6":
          return reply("## S6\ngates");
        case "s7":
          return reply("## S7\n**Final title: Eight Hundred Feet of Twisting Steel**");
        case "viewer":
          return reply("```json\n{\"stayScore\": 7, \"why\": \"the twisting deck grabs you\", \"leaves\": [], \"kept\": [\"the bridge\"], \"fixes\": []}\n```");
        default:
          break;
      }
      // S5 and the edit, in parts: the part says which scenes and which stretch of the clock it owns.
      const head = r.stage.split(":")[0];
      if (head === "s5") {
        const range = /scenes (SC\d{4})(?:-(SC\d{4}))? ONLY, ([\d:]+) to ([\d:]+):/.exec(text);
        if (!range) throw new Error(`the part names its scenes and clock: ${r.stage}`);
        const first = Number(/** @type {string} */ (range[1]).slice(2));
        const last = Number((range[2] ?? range[1]).slice(2));
        const from = toSeconds(String(range[3]));
        const to = toSeconds(String(range[4]));
        const each = (to - from) / (last - first + 1);
        const lines = Array.from({ length: last - first + 1 }, (_, i) => line(first + i, from + i * each, from + (i + 1) * each));
        return reply((r.stage === "s5:C1" ? "# BATCH C1\n" : "") + lines.join("\n"));
      }
      if (head === "edit") return reply("```json\n{\"scenes\": [{\"scene\": \"SC0001\", \"transition\": \"cut\"}]}\n```");
      if (head === "qa") return reply("```json\n{\"mustFix\": [], \"passed\": [\"clock and tags\"], \"notChecked\": []}\n```");
      throw new Error(`unexpected stage ${r.stage}`);
    },
  };
}

export function memoryStore() {
  const m = new Map();
  return { m, get: async (/** @type {string} */ k) => m.get(k) ?? null, put: async (/** @type {string} */ k, /** @type {string} */ v) => { m.set(k, v); } };
}

/** A free research desk (the code opens Wikipedia; nothing here touches the network). */
export function desk() {
  return /** @type {import("../../src/research-desk.mjs").ResearchProvider} */ ({
    id: "wikipedia",
    async search(/** @type {string} */ q) { return [{ title: q, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(q).replace(/ /g, "_"))}` }]; },
    async read(/** @type {{ title: string }} */ hit) { return { title: hit.title, text: `${hit.title}: the bridge opened in 1940 and fell the same year when the deck twisted in a 42 mph wind.`, references: [] }; },
  });
}

/** The film and the args runFilm needs for it. */
export function splitFilmRun() {
  const made = newFilm({ topic: "Why the Tacoma Narrows Bridge fell", minutes: 12 }, "split1");
  if (!made.ok) throw new Error(made.error);
  const model = limitedBrain();
  const store = memoryStore();
  return { film: made.film, model, store, manual: MANUAL, research: { providers: [desk()], fetch: /** @type {any} */ (async () => new Response("", { status: 404 })) } };
}

