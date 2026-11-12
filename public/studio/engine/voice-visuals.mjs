/**
 * Pictures for a voice, scene by scene. The scenes' times and words are
 * fixed by the voice; a brain (any model: nothing here assumes Claude) may
 * write only ANCHOR, SHOTS, SRC (search queries) and LOOK. Whatever it
 * returns, the voice's own times and words are put back in code
 * (restoreVoiceFields) and checked (checkVoiceChapter); a scene it skipped
 * or left unfinished gets a plan from the scene's own words. Media comes from
 * the keyless free archives first (chapterMedia, licence recorded per
 * asset); only a brain that can see (canSee) judges thumbnails.
 * Quran recitation has its own rules: quranVisualAdabGuard.
 */
import { canSee } from "./film-run.mjs";
import { chapterMedia, FREE_LICENCES } from "./film-media.mjs";
import { msg } from "./messages.mjs";
import { parseSceneLines } from "./scene-lines.mjs";
import { checkQuranFilm, RECITATION_AUDIO } from "./quran-film.mjs";
import { checkVoiceChapter, restoreVoiceFields, voiceSkeleton } from "./voice-scenes.mjs";

/** @typedef {import("./voice-scenes.mjs").VoiceScene} VoiceScene */
/** @typedef {import("./film-run.mjs").Model} Model */
/** @typedef {ReturnType<typeof import("./voice-understand.mjs").voiceStructure>} Structure */

const key = (/** @type {string} */ s) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");
const STOP = new Set("a an the and or but of to in on at by for from with that this these those it its is are was were be been we us our you your he she they them their his her not no can will shall have has had who which what when where how all any so as than then there here what do did does".split(" "));

/** The brain's instructions. Short on purpose: the rules that matter are enforced in code. */
export const VOICE_VISUALS_SYSTEM = [
  "You plan the pictures of a documentary whose voiceover is already recorded.",
  "You get one line per scene. Times and NARR are the recording's: copy them exactly, never change, add, drop or reorder a word.",
  "Replace only the TODO fields:",
  "- ANCHOR: the one thing the viewer must see in this scene.",
  "- SHOTS: (1) ...; (2) ... each shot starts with R2 (real archival evidence: a named person, place, document or date) or R3 (illustrative footage), then what is seen.",
  "- SRC: one group per shot, separated by ';', each with search queries for free archives: Q1 \"...\" Q2 \"...\" (short, concrete, in English).",
  "- LOOK: colour and movement in a few words.",
  "Never invent facts the voice does not say. Never show a person's face as if it were someone named unless the archive item is that person.",
  "Answer with the scene lines only, one per line, nothing else.",
].join("\n");

/**
 * A plan from the scene's own words, for a scene the brain did not plan.
 * Names and dates said in the scene make it an evidence shot (R2).
 * topic: what the whole film is about, from the owner ("Gettysburg Address
 * 1863"), put in front of the first query so the archive search stays on it.
 * @param {VoiceScene} s @param {Structure | null} structure @param {string} [topic]
 */
export function wordsPlan(s, structure, topic = "") {
  const names = (structure?.entities ?? []).filter((e) => e.scenes.includes(s.sc)).map((e) => e.name);
  const dated = (structure?.dates ?? []).some((d) => d.scene === s.sc);
  /** @type {Map<string, number>} */
  const n = new Map();
  for (const w of s.words) { const k = key(w.text); if (k.length >= 4 && !STOP.has(k)) n.set(k, (n.get(k) ?? 0) + 1); }
  const top = [...n.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 3).map(([k]) => k);
  const subject = names[0] ?? top[0] ?? "landscape";
  const rung = names.length || dated ? "R2" : "R3";
  const q1 = [topic.trim(), ...[subject, ...top.filter((t) => key(t) !== key(subject))].slice(0, topic.trim() ? 2 : 3)].filter(Boolean).join(" ");
  // With a topic, the fallback query is the topic itself: a broad but on-subject picture beats a wrong one.
  const q2 = topic.trim() || top.slice(0, 2).join(" ") || subject;
  return {
    ANCHOR: subject,
    SHOTS: `(1) ${rung} ${q1}`,
    SRC: `Q1 "${q1}" Q2 "${q2}"`,
    LOOK: rung === "R2" ? "archival, slow push-in" : "natural light, slow drift",
  };
}

/** @param {string} line @param {Record<string, string>} f */
function fillLine(line, f) {
  let out = line;
  for (const [k, v] of Object.entries(f)) {
    const re = new RegExp(`(\\|\\s${k}:\\s?)[^|]*?(?=\\s\\|\\s|$)`);
    out = re.test(out) ? out.replace(re, `$1${v}`) : out + ` | ${k}: ${v}`;
  }
  return out;
}

/**
 * @param {{ scenes: VoiceScene[], structure?: Structure | null, topic?: string, brain?: Model | null, providers?: import("./film-media.mjs").MediaProvider[], chapter?: string, judge?: import("./film-media.mjs").MediaJudge }} o
 */
export async function planVoiceVisuals(o) {
  const chapter = o.chapter ?? "C1";
  const scenes = o.scenes;
  const structure = o.structure ?? null;
  const messages = [];
  const skeleton = voiceSkeleton(scenes, chapter).split("\n").map((l) => l.replace("| SHOTS: TODO", "| SHOTS: TODO | SRC: TODO")).join("\n");
  let written = "";
  let brainUsed = false;
  if (o.brain) {
    const brief = (o.topic ? `The film is about: ${o.topic}. ` : "") + (structure ? `Topic words: ${structure.topicWords.map((t) => t.word).join(", ")}. Names: ${structure.entities.map((e) => e.name).join(", ") || "none"}. Dates: ${structure.dates.map((d) => d.text).join("; ") || "none"}.` : "");
    try {
      const reply = await o.brain.call({ stage: "V4", system: [{ text: VOICE_VISUALS_SYSTEM, cache: true }], messages: [{ role: "user", content: [{ text: `${brief}\n\n${skeleton}` }] }], maxTokens: Math.min(32000, 400 + scenes.length * 260), effort: "medium" });
      written = reply.text ?? "";
      brainUsed = true;
    } catch { written = ""; }
  }
  if (!brainUsed) messages.push(msg("voice.noBrain"));

  // What the brain changed of the voice is reported, then repaired in code.
  const before = written ? checkVoiceChapter(written, scenes) : [];
  const changed = before.filter((f) => f.code === "words-changed" || f.code === "time-changed").map((f) => f.scene);
  if (changed.length) messages.push(msg("voice.wordsChanged", { scenes: [...new Set(changed)].join(", ") }));
  const restored = written ? restoreVoiceFields(written, scenes) : "";
  const byId = new Map(parseSceneLines(restored).map((l) => [l.sc, l]));
  const skeletonLines = new Map(skeleton.split("\n").map((l) => [/SC\d{4,5}/.exec(l)?.[0] ?? "", l]));
  const lines = scenes.map((s) => {
    const w = byId.get(s.sc);
    const usable = w && !/TODO/.test(w.raw) && w.fields.SHOTS && w.fields.SRC;
    return usable ? w.raw : fillLine(/** @type {string} */ (skeletonLines.get(s.sc)), wordsPlan(s, structure, o.topic));
  });
  const markdown = lines.join("\n");
  const findings = checkVoiceChapter(markdown, scenes);
  if (findings.some((f) => f.code === "words-changed" || f.code === "time-changed")) throw new Error("Bug: the voice's words or times are not intact after restoring them.");
  if (!findings.length) messages.push(msg("voice.wordsKept"));

  /** @type {Awaited<ReturnType<typeof chapterMedia>> | null} */
  let media = null;
  /** @type {{ sc: string, start: number, end: number, narration: string, shots: string, assets: any[] }[]} */
  const plan = parseSceneLines(markdown).map((l) => {
    const s = /** @type {VoiceScene} */ (scenes.find((x) => x.sc === l.sc));
    return { sc: l.sc, start: s.start, end: s.end, narration: s.narration, shots: l.fields.SHOTS ?? "", assets: [] };
  });
  if (o.providers?.length) {
    const judge = o.brain && canSee(o.brain) ? o.judge : undefined;
    media = await chapterMedia({ chapter, markdown, providers: o.providers, judge });
    for (const shot of media.shots) {
      const p = plan.find((x) => x.sc === shot.scene);
      if (!p) continue;
      if (shot.pick && !FREE_LICENCES.includes(shot.pick.licence.licenseId)) { messages.push(msg("voice.assetRefused", { source: shot.pick.source, reason: `licence ${shot.pick.licence.licenseId} is not free for commercial use` })); continue; }
      if (shot.pick) p.assets.push({ shot: shot.shot, url: shot.pick.mediaUrl, page: shot.pick.sourcePageUrl, source: shot.pick.source, title: shot.pick.title, licence: shot.pick.licence, review: shot.review ?? "unreviewed" });
    }
    for (const p of plan) if (!p.assets.length) messages.push(msg("voice.noAsset", { scene: p.sc }));
  }
  return { markdown, plan, findings, messages, brainUsed, changedByBrain: [...new Set(changed)], media: media ? media.stats : null };
}

/** Living beings, faces and things the documented Quran rules keep off screen (titles and tags are all a non-seeing check has). */
const LIVING = /\b(?:people|person|persons|man|men|woman|women|child|children|kid|kids|boy|girl|baby|face|faces|portrait|selfie|crowd|worshipp?ers?|family|human|humans|animal|animals|bird|birds|camel|camels|horse|horses|cattle|cow|cows|sheep|goat|dog|cat|fish|insect|bee|bees|lion|wildlife|prophet|angel|statue|idol|music|musician|guitar|concert|dance|dancing)\b/i;
const AI_SOURCES = new Set(["ai", "fal", "generated", "midjourney", "dalle", "stable-diffusion"]);

/**
 * quran-visual-adab-guard: the documented picture rules for a recitation
 * film, checked in code. Problems block the render; gaps are what is
 * missing and must be shown to the owner, never filled by guessing.
 * meanings: per ayah id, { text, source, licence, allowsUse } or nothing.
 * @param {{ plan: import("./quran-film.mjs").QuranFilmPlan, index: import("./quran.mjs").QuranIndex, assets?: { scene: string, source: string, title?: string, tags?: string[], licence?: { licenseId: string } | null }[], meanings?: Record<string, { text: string, source: string, licence: string, allowsUse: boolean }> }} o
 */
export function quranVisualAdabGuard(o) {
  /** @type {string[]} */
  const problems = [...checkQuranFilm(o.plan, o.index)];
  /** @type {string[]} */
  const gaps = [];
  const messages = [];
  const audio = o.plan.audio ?? RECITATION_AUDIO;
  if (audio.music) problems.push("music is planned under the recitation");
  if (audio.soundEffects) problems.push("sound effects are planned under the recitation");
  if (audio.ambience) problems.push("ambience is planned under the recitation");
  for (const a of o.assets ?? []) {
    const words = [a.title ?? "", ...(a.tags ?? [])].join(" ");
    const hit = LIVING.exec(words);
    if (hit) problems.push(`${a.scene}: "${(a.title ?? "").slice(0, 60)}" shows ${hit[0]} (no living beings, faces or music under the Quran).`);
    if (AI_SOURCES.has(String(a.source).toLowerCase())) problems.push(`${a.scene}: AI pictures are never used with the Quran.`);
    if (!a.licence || !FREE_LICENCES.includes(a.licence.licenseId)) problems.push(`${a.scene}: the picture has no free licence on record.`);
  }
  const ayat = o.plan.scenes.filter((s) => s.kind === "ayah");
  let meaningGap = false;
  for (const s of ayat) {
    const m = o.meanings?.[s.id];
    if (!m) { meaningGap = true; continue; }
    if (!m.allowsUse || !m.licence || !m.source) { problems.push(`${s.id}: a meaning is shown from ${m.source || "an unknown source"} without a licence that allows it.`); }
  }
  if (meaningGap) { gaps.push("meaning: no licensed translation for some or all ayat; meanings are not shown and pictures cannot follow the meaning yet"); messages.push(msg("voice.meaningGap")); }
  gaps.push("pictures: titles and tags are checked, not the pictures themselves; a seeing check or the owner must look before release");
  return { ok: problems.length === 0, problems, gaps, messages };
}
