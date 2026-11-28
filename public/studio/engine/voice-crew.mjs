/**
 * The crew on a voiceover film (the owner's order of 28 Nov 2026: the team works on EVERY film, in both products).
 * Runs the roles that used to wait for a script film on the recording's own words, free of any paid API:
 *   research-freshness, research-geography, research-peer-review, story-exposition   (script-agents.mjs)
 *   cinematography-visual-metaphor                                                      (render/film-agents.mjs storyPlace, on the shot plan)
 *   audience-title, audience-metadata                                                   (packaging below: title, description, chapters, tags)
 *   audience-panel-review                                                               (the viewer panel, on the free brain when there is one)
 * It returns one report ({ agents, shotFindings, packaging, panel }): which agents ran and what each found. The renderer
 * adds the picture agents (render/film-agents.mjs) on the finished master and the critic reads both.
 */
import { VIEWER_SYSTEM } from "./film-run.mjs";
import { runScriptAgents, sentencesOf } from "./script-agents.mjs";

/** Words a title never uses: promises a documentary cannot keep. */
export const BANNED_TITLE = /\b(shocking|you won'?t believe|insane|unbelievable|gone wrong|destroyed|exposed|secret they|100% true|must watch)\b/i;

/** @param {number} t */
export function stamp(t) {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(x).padStart(2, "0")}` : `${m}:${String(x).padStart(2, "0")}`;
}

/** @param {string} s @param {number} n */
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);

/**
 * Title, description, chapters and tags for the upload, from the film's own words and structure.
 * Chapters follow YouTube's rules: the first at 0:00, at least three, each at least 10 seconds long.
 * @param {{ topic?: string, scenes: { sc: string, start: number, end: number, narration: string }[], structure?: any, durationSeconds?: number }} o
 */
export function packagingPack(o) {
  const sections = (o.structure?.sections ?? []).filter((/** @type {any} */ s) => Number.isFinite(s.start));
  const first = o.scenes[0]?.narration ?? "";
  const hookLine = sentencesOf(first)[0] ?? "";
  const entities = (o.structure?.entities ?? []).map((/** @type {any} */ e) => String(e.name));
  const topic = (o.topic ?? "").trim() || entities[0] || clip(hookLine, 60);
  const titles = [...new Set([topic, `${topic}: The Full Story`, `The Story of ${topic}`])].map((t) => clip(t, 70)).filter((t) => !BANNED_TITLE.test(t));
  /** @type {{ at: number, stamp: string, title: string }[]} */
  const chapters = [];
  for (const s of sections) {
    const at = chapters.length === 0 ? 0 : Number(s.start);
    if (chapters.length && at - chapters[chapters.length - 1].at < 10) continue;
    const label = (s.opening || (s.keywords ?? []).join(" ")).replace(/[.!?…]+$/, "");
    chapters.push({ at, stamp: stamp(at), title: clip(label.charAt(0).toUpperCase() + label.slice(1), 50) });
  }
  const total = o.durationSeconds ?? (o.scenes.length ? o.scenes[o.scenes.length - 1].end : 0);
  if (chapters.length && total - chapters[chapters.length - 1].at < 10) chapters.pop();
  const usable = chapters.length >= 3;
  // Tags are the names the film says (people, places, projects) and its topic; never loose words like "before" or "began".
  const tags = [...new Set([...(o.topic ? [o.topic] : []), ...entities.slice(0, 10)].map((t) => String(t).toLowerCase().trim()).filter((t) => t.length >= 3))].slice(0, 12);
  const description = [
    clip(sentencesOf(o.scenes.slice(0, 2).map((s) => s.narration).join(" ")).slice(0, 2).join(" "), 280),
    ...(usable ? ["", "Chapters", ...chapters.map((c) => `${c.stamp} ${c.title}`)] : []),
    "",
    "Pictures: free-licence archives, each credited in the film's report.",
  ].join("\n");
  const checks = [
    { code: "title-length", ok: titles.every((t) => t.length <= 70) },
    { code: "title-no-bait", ok: titles.length > 0 },
    { code: "chapters-youtube-rules", ok: usable && chapters[0].at === 0, detail: usable ? "" : `only ${chapters.length} chapter(s): YouTube needs 3` },
  ];
  return { title: titles[0] ?? clip(topic, 70), titles, description, chapters: usable ? chapters : [], tags, checks };
}

/**
 * The viewer panel on a voiceover film: five cold viewers read the opening (what is said, what is on screen) and say where
 * they would leave. Words are the recording, so nothing is rewritten; the answer is the report. Never stops the film.
 * @param {{ brain?: any, scenes: { sc: string, start: number, narration: string }[], shots: any[], topic?: string, seconds?: number }} o
 */
export async function voicePanel(o) {
  if (!o.brain) return { ran: false, why: "no free brain on this run" };
  const limit = o.seconds ?? 120;
  const seen = (/** @type {any} */ sc) => o.shots.filter((s) => s.scene === sc).map((s) => `${s.type}: ${s.subject ?? ""}`.slice(0, 70)).join("; ");
  const lines = o.scenes.filter((s) => s.start < limit).map((s) => `${s.sc} ${stamp(s.start)} | SAID: ${s.narration} | SEEN: ${seen(s.sc)}`);
  const ask = `This is the opening of a documentary you just clicked on ("${o.topic ?? ""}"). Read it as you would watch it.\n\n${lines.join("\n")}\n\nAnswer as the panel: where would each of you leave, and why? Output ONE fenced \`\`\`json block: {"stayScore": 0-10, "why": "one sentence", "leaves": [{"viewer": "the 19-year-old", "scene": "SC0003", "reason": "..."}], "kept": ["what worked"]}`;
  try {
    const reply = await o.brain.call({ stage: "V7", system: [{ text: VIEWER_SYSTEM, cache: true }], messages: [{ role: "user", content: [{ text: ask }] }], maxTokens: 1200, effort: "medium" });
    const blocks = [...String(reply.text ?? "").matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/g)];
    const raw = blocks.length ? blocks[blocks.length - 1][1] : String(reply.text ?? "");
    const p = JSON.parse(raw);
    const stay = Number(p.stayScore);
    return { ran: true, stayScore: Number.isFinite(stay) ? stay : null, why: String(p.why ?? "").slice(0, 200), leaves: (Array.isArray(p.leaves) ? p.leaves : []).slice(0, 6), kept: (Array.isArray(p.kept) ? p.kept : []).slice(0, 4) };
  } catch (e) {
    if (/** @type {any} */ (e)?.daily) throw e;
    return { ran: false, why: `the free brain did not answer (${String(/** @type {any} */ (e)?.message ?? e).slice(0, 120)})` };
  }
}

/**
 * Everything the crew does on a voiceover film's words and plan, as one report.
 * @param {{ scenes: any[], structure: any, shots: any[], topic?: string, brain?: any, storyPlace?: (shots: any[], lines: any[]) => any, durationSeconds?: number, now?: Date }} o
 */
export async function runVoiceCrew(o) {
  const script = runScriptAgents(o.scenes, { now: o.now });
  const place = o.storyPlace ? o.storyPlace(o.shots, o.scenes) : null;
  const pack = packagingPack({ topic: o.topic, scenes: o.scenes, structure: o.structure, durationSeconds: o.durationSeconds });
  const panel = await voicePanel({ brain: o.brain, scenes: o.scenes, shots: o.shots, topic: o.topic });
  const total = o.durationSeconds ?? (o.scenes.length ? o.scenes[o.scenes.length - 1].end : 0);
  const short = total < 180;
  const agents = [
    ...script.results.map((r) => ({ role: r.role, ran: true, file: r.file, pass: r.pass, found: r.findings.length, ...(r.note ? { note: r.note } : {}), findings: r.findings })),
    ...(place ? [{ role: place.role, ran: true, file: place.file, pass: place.pass, found: place.findings.length, checked: place.checked, findings: place.findings }] : []),
    { role: "audience-title", ran: true, file: "engine/src/voice-crew.mjs", pass: pack.checks.every((c) => c.ok || c.code === "chapters-youtube-rules"), found: 0, note: `title: ${pack.title}`, findings: [] },
    { role: "audience-metadata", ran: true, file: "engine/src/voice-crew.mjs", pass: pack.chapters.length >= 3 || short, found: pack.chapters.length >= 3 || short ? 0 : 1, note: `${pack.chapters.length} chapters, ${pack.tags.length} tags${short ? " (a film under 3 minutes needs no chapters)" : ""}`, findings: pack.chapters.length >= 3 || short ? [] : [{ role: "audience-metadata", scene: "-", code: "few-chapters", severity: "warn", detail: pack.checks[2].detail, fix: "Add a pause between parts so each gets a chapter." }] },
    { role: "audience-panel-review", ran: panel.ran, file: "engine/src/voice-crew.mjs", pass: panel.ran ? (panel.stayScore ?? 10) >= 6 : null, found: panel.ran ? (panel.leaves?.length ?? 0) : 0, note: panel.ran ? `stay score ${panel.stayScore}/10: ${panel.why}` : panel.why, findings: [] },
  ];
  return { agents, shotFindings: place?.findings ?? [], packaging: pack, panel, unverifiedPlaces: script.unverifiedPlaces };
}

/** The agent report as text a person reads: which agents ran, what each found. @param {{ agents: any[] }} r */
export function crewMarkdown(r) {
  const lines = ["# Crew report", "", "| Agent | Ran | Result | Found |", "|---|---|---|---|"];
  for (const a of r.agents) lines.push(`| ${a.role} | ${a.ran ? "yes" : "no"} | ${a.pass === null || a.pass === undefined ? "-" : a.pass ? "pass" : "FAIL"} | ${a.found ?? 0}${a.note ? ` (${String(a.note).replace(/\|/g, "/").slice(0, 110)})` : ""} |`);
  for (const a of r.agents) for (const f of (a.findings ?? []).slice(0, 8)) lines.push("", `- **${a.role}** ${f.scene ?? f.shot}: ${f.detail ?? f.reason}${f.fix ? ` — ${f.fix}` : ""}`);
  return lines.join("\n") + "\n";
}
