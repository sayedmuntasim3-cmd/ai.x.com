/**
 * The Edit Director: after QA, one Claude call per chapter decides the edit
 * a top documentary editor would cut on top of the script: which scenes get a
 * named transition (or a plain cut instead of the one written), where the
 * picture punches in, where the camera shakes on an impact, and which extra
 * sound hits land on a word or a reveal. The reply is checked here in code
 * (scenes exist, times sit inside their scene, spacing and density caps, known
 * words only); whatever fails is dropped and listed, never guessed. The
 * timeline (timeline.mjs) merges the result; the renderer draws it.
 *
 * Saved as edit-C1.json ... per chapter. No edit file means the edit follows
 * the script alone, exactly as before.
 */
import { shotParts } from "./film-media.mjs";
import { parseSceneLines, toSeconds } from "./scene-lines.mjs";

/** Transitions the director may choose; "cut" removes the one the script wrote. */
export const EDIT_TRANSITIONS = Object.freeze(["cut", "whip", "slide", "zoom", "flash", "glitch", "leak"]);

/** How an archive photo may be shown: as a print, and pushed toward one part of it. */
export const EDIT_FOCUS = Object.freeze(["left", "right", "top", "bottom", "center"]);

/** Sound hits the director may add, and the synthesised token each one plays (render/sfx-synth.mjs). */
export const EDIT_SOUNDS = Object.freeze({ impact: "AUTO-IMPACT", whoosh: "AUTO-WHOOSH", boom: "AUTO-BOOM", riser: "AUTO-RISER", click: "AUTO-CLICK", glitch: "AUTO-GLITCH" });

/** The caps code enforces, so the edit breathes and never turns into noise. */
export const EDIT_LIMITS = Object.freeze({
  edgeSeconds: 0.3, // nothing in the first or last 0.3 s of a scene (that is where the cut is)
  punchPerScene: 2, punchGap: 2.5, punchPerSeconds: 6, // at most one punch-in per 6 s of chapter on average
  shakePerScene: 2, shakeGap: 2, shakePerSeconds: 20,
  hitsPerScene: 3, hitGap: 1.5,
});

/**
 * @typedef {"cut" | "whip" | "slide" | "zoom" | "flash" | "glitch" | "leak"} EditTransition
 * @typedef {"left" | "right" | "top" | "bottom" | "center"} EditFocus
 * @typedef {keyof typeof EDIT_SOUNDS} EditSound
 * @typedef {{ scene: string, transition?: EditTransition, punchIns: number[], shakes: number[], hits: { at: number, sound: EditSound }[], photo?: { frame?: "print", focus?: EditFocus }, why?: string }} SceneEdit
 *   times are film-clock seconds (the same clock as the scene lines)
 * @typedef {{ chapter: string, by: "edit-director", scenes: SceneEdit[], problems: string[] }} EditPlan
 */

/**
 * The chapter as the director needs to see it, one short line per scene
 * (much smaller than the S5 chapter, so the call stays cheap).
 * @param {string} markdown
 */
export function editSheet(markdown) {
  return parseSceneLines(markdown).map((s) => {
    const f = (/** @type {string} */ k, n = 120) => (s.fields[k] ? ` | ${k}: ${s.fields[k].replace(/\s+/g, " ").slice(0, n)}` : "");
    const shots = shotParts(s.fields.SHOTS ?? "").map((p, i) => `(${i + 1}) ${p.replace(/\s+/g, " ").slice(0, 90)}`).join("; ");
    const narr = s.wordless ? "(wordless)" : s.narration.replace(/\s+/g, " ").slice(0, 320);
    return `${s.sc} ${clock(s.start)}-${clock(s.end)} (${round1(s.end - s.start)} s) | NARR: ${narr}${f("FX")}${f("TRANS", 80)}${f("MOTION", 80)}${f("SFX", 100)}${f("MUS", 60)} | SHOTS: ${shots}`;
  }).join("\n");
}

/**
 * How the best-performing documentary editors for US and European audiences
 * cut (retention editing): the craft the director applies, per kind of film.
 */
export const EDIT_CRAFT = [
  "CRAFT (what top documentary editors with tens of millions of views do):",
  "- The picture changes at least every 3 to 6 seconds in the first minute and every 6 to 10 seconds after; a still or a card never sits unmoved. Where the script holds one shot longer, a punch-in or a focus zoom is the change.",
  "- Every number, name, date and claim lands on screen as it is spoken: punch in on it, hit it with an impact, or let the card's highlighter sweep it.",
  "- Rhythm: build, then release. Before a reveal, hold back (no hits, a slow focus zoom, a riser ending on the reveal); on the reveal, one strong move (flash, glitch, shake or a punch-in with an impact). Never two big moves within a few seconds.",
  "- Emotional scenes stay clean: no glitch, no shake, no whooshes; a slow focus zoom on a face or an object, a light leak at most.",
  "- Style per kind of film: money and business (punch-ins on figures, whips between eras, impacts on totals); history and archive (print frames for old photos, focus zooms on the detail that matters, slides, flashes for jumps in time); mystery, crime and conspiracy (slow focus zooms, glitch on a lie or a twist, risers into reveals, rare shakes); motivation and success (light leaks into warm moments, punch-ins on the turning words, a riser into the comeback); science and space (zooms into detail, clean slides, few hits).",
].join("\n");

/**
 * The instruction for one chapter's Edit Director call.
 * @param {string} chapterId @param {string} sheet @param {string} [style] the film's format and look, so the edit fits the kind of film
 */
export function editInstruction(chapterId, sheet, style = "") {
  return [
    `You are the Edit Director for chapter ${chapterId}: the editor of a documentary channel whose films reach tens of millions of viewers in the US and Europe.${style ? ` This film: ${style}.` : ""} The script below is final and checked; do not change words, shots or times. Decide the edit on top of it, scene by scene, where it serves the story:`,
    EDIT_CRAFT,
    `- transition into the scene: "whip" (energy, a jump forward), "slide" (a calm move between related scenes), "zoom" (into a detail or a place), "flash" (a reveal or a jump in time), "glitch" (a twist, a lie exposed, a system breaking, a time jump in a modern story), "leak" (a warm light leak into a hopeful or nostalgic moment), or "cut" to replace a named transition the script wrote with a plain cut. Leave it out to keep the script's. Never two named transitions in a row; most scenes stay hard cuts on the beat.`,
    `- punchIns: moments the picture punches in (a quick 1.0 to 1.15 scale) on a key word, a number or a reveal; at most ${EDIT_LIMITS.punchPerScene} per scene, ${EDIT_LIMITS.punchGap} s apart, about one per ${EDIT_LIMITS.punchPerSeconds} s of chapter at most.`,
    `- shakes: a short camera shake on an impact (a crash, a slam, a verdict, a shocking number); rare, at most one per ${EDIT_LIMITS.shakePerSeconds} s of chapter.`,
    `- photo (for scenes with archive photographs, R2): {"frame": "print"} shows the photo as a print in a white border with a shadow (old photos, family pictures, evidence); {"focus": "left" | "right" | "top" | "bottom" | "center"} pushes in toward the part of the picture that matters. Either or both.`,
    `- hits: extra sound hits ${Object.keys(EDIT_SOUNDS).map((k) => `"${k}"`).join(", ")} at the moment they land (a riser ends at its time); at most ${EDIT_LIMITS.hitsPerScene} per scene, ${EDIT_LIMITS.hitGap} s apart. The edit already adds a whoosh into each whip, slide, zoom or leak, a boom under a flash, a riser into each chapter and an impact on counters, so do not repeat those.`,
    `Times are film-clock "h:mm:ss.s", inside the scene, not in its first or last ${EDIT_LIMITS.edgeSeconds} s. Time a word by its place in the narration (the narrator reads at an even pace across the scene). A wordless scene with no reason to move stays untouched. Restraint wins: an edit that never rests tires the viewer.`,
    "Output ONE fenced ```json block and nothing after it: {\"scenes\": [{\"scene\": \"SC0001\", \"transition\": \"whip\", \"punchIns\": [\"0:00:03.2\"], \"shakes\": [], \"photo\": {\"frame\": \"print\", \"focus\": \"left\"}, \"hits\": [{\"at\": \"0:00:03.2\", \"sound\": \"impact\"}], \"why\": \"a short reason\"}]}. List only scenes you change.",
    `<CHAPTER_${chapterId}>\n${sheet}\n</CHAPTER_${chapterId}>`,
  ].join("\n\n");
}

/**
 * Check a director's reply against the chapter and keep only what is valid.
 * @param {unknown} raw the parsed JSON reply ({ scenes: [...] } or the array itself)
 * @param {string} markdown the chapter's S5 scene lines
 * @param {string} chapterId
 * @returns {EditPlan}
 */
export function validateEditPlan(raw, markdown, chapterId) {
  /** @type {string[]} */
  const problems = [];
  const lines = parseSceneLines(markdown);
  const byId = new Map(lines.map((s, i) => [s.sc, { s, i }]));
  /** @type {any[] | null} */
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray(/** @type {any} */ (raw).scenes) ? /** @type {any} */ (raw).scenes : null;
  if (!list) return { chapter: chapterId, by: "edit-director", scenes: [], problems: ["The reply had no scenes list; the edit follows the script."] };
  const chapterSeconds = lines.length ? lines[lines.length - 1].end - lines[0].start : 0;
  const caps = { punch: Math.max(1, Math.ceil(chapterSeconds / EDIT_LIMITS.punchPerSeconds)), shake: Math.max(1, Math.ceil(chapterSeconds / EDIT_LIMITS.shakePerSeconds)) };
  const used = { punch: 0, shake: 0 };
  /** @type {Map<string, SceneEdit>} */
  const out = new Map();
  // The transitions in effect, so two named ones never follow each other.
  const named = lines.map((s) => scriptTransition(s.fields.TRANS ?? ""));

  const sorted = list.filter((e) => e && typeof e === "object").map((e) => /** @type {any} */ (e)).sort((a, b) => (byId.get(String(a.scene))?.i ?? 1e9) - (byId.get(String(b.scene))?.i ?? 1e9));
  for (const e of sorted) {
    const id = String(e.scene ?? "");
    const found = byId.get(id);
    if (!found) { problems.push(`${id || "(no scene)"}: not a scene of ${chapterId}; ignored.`); continue; }
    if (out.has(id)) { problems.push(`${id}: listed twice; the second entry is ignored.`); continue; }
    const { s, i } = found;
    const lo = s.start + EDIT_LIMITS.edgeSeconds;
    const hi = s.end - EDIT_LIMITS.edgeSeconds;
    /** @type {SceneEdit} */
    const edit = { scene: id, punchIns: [], shakes: [], hits: [] };

    if (e.transition !== undefined && e.transition !== null && e.transition !== "") {
      const t = String(e.transition).toLowerCase();
      if (!EDIT_TRANSITIONS.includes(t)) problems.push(`${id}: unknown transition "${t}"; ignored.`);
      else if (t === "cut") { edit.transition = "cut"; named[i] = null; }
      else if (i === 0) problems.push(`${id}: a chapter opens on its own dip or the film's first frame; "${t}" ignored.`);
      else if (named[i] === "dip") problems.push(`${id}: the script writes a dissolve, dip or fade here (a dip through black); "${t}" ignored.`);
      else if (named[i - 1] && named[i - 1] !== "dip") problems.push(`${id}: "${t}" right after another named transition; kept as the script wrote it.`);
      else { edit.transition = /** @type {EditTransition} */ (t); named[i] = t; }
    }

    /** @param {unknown} v @param {string} what */
    const timeOf = (v, what) => {
      const t = typeof v === "number" ? v : typeof v === "string" ? toSeconds(v.trim()) : NaN;
      if (!Number.isFinite(t)) { problems.push(`${id}: ${what} time ${JSON.stringify(v)} is not a time; ignored.`); return null; }
      if (t < lo || t > hi) { problems.push(`${id}: ${what} at ${clock(t)} is outside the scene (${clock(lo)}-${clock(hi)}); ignored.`); return null; }
      return round3(t);
    };
    /** @param {unknown} arr @param {string} what @param {number} perScene @param {number} gap @param {"punch" | "shake"} cap */
    const times = (arr, what, perScene, gap, cap) => {
      /** @type {number[]} */
      const kept = [];
      for (const v of (Array.isArray(arr) ? arr : []).map((x) => timeOf(x, what)).filter((x) => x !== null).sort((a, b) => /** @type {number} */ (a) - /** @type {number} */ (b))) {
        const t = /** @type {number} */ (v);
        if (kept.length >= perScene) { problems.push(`${id}: more than ${perScene} ${what}s in one scene; ${clock(t)} dropped.`); continue; }
        if (kept.length && t - kept[kept.length - 1] < gap) { problems.push(`${id}: ${what} at ${clock(t)} is under ${gap} s after the last; dropped.`); continue; }
        if (used[cap] >= caps[cap]) { problems.push(`${id}: the chapter already has ${caps[cap]} ${what}s (the cap for its length); ${clock(t)} dropped.`); continue; }
        used[cap] += 1;
        kept.push(t);
      }
      return kept;
    };
    edit.punchIns = times(e.punchIns, "punch-in", EDIT_LIMITS.punchPerScene, EDIT_LIMITS.punchGap, "punch");
    edit.shakes = times(e.shakes, "shake", EDIT_LIMITS.shakePerScene, EDIT_LIMITS.shakeGap, "shake");

    for (const h of (Array.isArray(e.hits) ? /** @type {any[]} */ (e.hits) : []).filter((x) => x && typeof x === "object")) {
      const sound = String(h.sound ?? "").toLowerCase();
      if (!(sound in EDIT_SOUNDS)) { problems.push(`${id}: unknown sound "${sound}"; ignored.`); continue; }
      const at = timeOf(h.at, sound);
      if (at === null) continue;
      if (edit.hits.length >= EDIT_LIMITS.hitsPerScene) { problems.push(`${id}: more than ${EDIT_LIMITS.hitsPerScene} hits in one scene; ${sound} at ${clock(at)} dropped.`); continue; }
      if (edit.hits.some((x) => Math.abs(x.at - at) < EDIT_LIMITS.hitGap)) { problems.push(`${id}: ${sound} at ${clock(at)} is under ${EDIT_LIMITS.hitGap} s from another hit; dropped.`); continue; }
      edit.hits.push({ at, sound: /** @type {EditSound} */ (sound) });
    }
    edit.hits.sort((a, b) => a.at - b.at);
    if (e.photo && typeof e.photo === "object") {
      /** @type {{ frame?: "print", focus?: EditFocus }} */
      const photo = {};
      if (e.photo.frame === "print") photo.frame = "print";
      else if (e.photo.frame !== undefined && e.photo.frame !== null && e.photo.frame !== "plain") problems.push(`${id}: unknown photo frame "${e.photo.frame}"; ignored.`);
      const focus = String(e.photo.focus ?? "").toLowerCase();
      if (EDIT_FOCUS.includes(focus)) photo.focus = /** @type {EditFocus} */ (focus);
      else if (focus) problems.push(`${id}: unknown photo focus "${focus}"; ignored.`);
      if (photo.frame || photo.focus) edit.photo = photo;
    }
    if (typeof e.why === "string" && e.why.trim()) edit.why = e.why.trim().slice(0, 160);
    if (edit.transition || edit.punchIns.length || edit.shakes.length || edit.hits.length || edit.photo) out.set(id, edit);
  }
  return { chapter: chapterId, by: "edit-director", scenes: [...out.values()], problems };
}

/**
 * What the script's TRANS field already does into a scene: a named move, a
 * dip through black, or nothing (a cut). Mirrors timeline.mjs.
 * @param {string} trans
 * @returns {string | null}
 */
function scriptTransition(trans) {
  const t = trans.toLowerCase();
  if (/\b(cross[- ]?)?dissolve\b|\bdip\b|\bfade (to|from|in|out)\b/.test(t)) return "dip";
  if (/\b(whip|swish)\b|\bzoom[- ]?(through|transition|cut|in transition)\b|\bslide\b|\b(slide|push) (transition|left|right|across)\b|\bflash\b|\bglitch\b|\blight[- ]?leak\b|\bfilm burn\b/.test(t)) return "named";
  return null;
}

/** Counts for the run state and the studio. @param {EditPlan} plan */
export function editStats(plan) {
  return {
    scenes: plan.scenes.length,
    transitions: plan.scenes.filter((s) => s.transition && s.transition !== "cut").length,
    photos: plan.scenes.filter((s) => s.photo).length,
    punchIns: plan.scenes.reduce((n, s) => n + s.punchIns.length, 0),
    shakes: plan.scenes.reduce((n, s) => n + s.shakes.length, 0),
    hits: plan.scenes.reduce((n, s) => n + s.hits.length, 0),
    dropped: plan.problems.length,
  };
}

/** h:mm:ss.s @param {number} s */
function clock(s) {
  const t = Math.max(0, Math.round(s * 10) / 10);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = (t % 60).toFixed(1).padStart(4, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
}
/** @param {number} n */
function round1(n) { return Math.round(n * 10) / 10; }
/** @param {number} n */
function round3(n) { return Math.round(n * 1000) / 1000; }
