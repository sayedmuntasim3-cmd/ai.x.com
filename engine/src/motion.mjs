/**
 * Adaptive motion: how each picture moves, decided scene by scene, not by turns.
 *
 * Before this module a still photo moved by rota (push, pull, pan, push ...) at a fixed 9 %
 * whatever the shot's length, linearly, and the MOTION field was read only for "push" and slow
 * motion. Now one decision per still, in this order:
 *   1. what the script locks (MOTION: "static", "pan left", "tilt up", "pull out" ...): kept;
 *   2. the Edit Director's focus (the renderer pushes toward it): kept, nothing decided here;
 *   3. the film's motion level (reduced, calm, balanced, dynamic) and its genre's motion language;
 *   4. the scene's purpose read from the script (hook, opening a chapter, tension, reveal,
 *      reflection, a document to read, a wide place to establish, a face);
 *   5. the shot itself (a 1-second shot barely moves; the move's speed is capped per second);
 *   6. a budget: never the same move three times running, pans alternate, flashes are rationed.
 * Moving footage gets no added movement unless the script asks: it already moves.
 * Every decision carries its reason. Pure module (browser + Node).
 */

/**
 * @typedef {"reduced" | "calm" | "balanced" | "dynamic"} MotionLevel
 * @typedef {"hold" | "push" | "pull" | "pan" | "tilt" | "drift"} MoveKind
 * @typedef {"inOut" | "out" | "linear"} Ease
 * @typedef {{ kind: MoveKind, amount: number, dir: 1 | -1, ease: Ease, why: string, locked?: boolean }} Move
 *   amount: zoom gained (push, pull, drift) or zoom used to travel (pan, tilt), as a share; dir: pan right / tilt down = 1
 * @typedef {"hook" | "open" | "tension" | "reveal" | "reflect" | "read" | "establish" | "detail" | "question" | "plain"} Intent
 * @typedef {{ id: string, name: string, level: MotionLevel, rotation: MoveKind[], intents: Partial<Record<Intent, MoveKind>>, flashGap: number, allow: { flash: boolean, glitch: boolean, shake: boolean } }} MotionProfile
 */

/** Motion levels: how far a still moves at most, and how fast (share of zoom per second). */
export const MOTION_LEVELS = Object.freeze({
  reduced: { amount: 0.02, perSecond: 0.004, min: 0 },
  calm: { amount: 0.06, perSecond: 0.008, min: 0.02 },
  balanced: { amount: 0.09, perSecond: 0.013, min: 0.025 },
  dynamic: { amount: 0.13, perSecond: 0.022, min: 0.03 },
});

/**
 * Motion languages by genre. The rotation is used only when nothing in the scene asks for more;
 * intents override it. A History film can still hold on a document; a Nature film never shakes.
 * @type {Readonly<Record<string, MotionProfile>>}
 */
export const MOTION_PROFILES = Object.freeze({
  documentary: { id: "documentary", name: "General documentary", level: "balanced", rotation: ["push", "pan", "pull", "drift"], intents: { establish: "pan", detail: "push", reflect: "pull", read: "drift", tension: "push" }, flashGap: 10, allow: { flash: true, glitch: true, shake: true } },
  motivation: { id: "motivation", name: "Motivation and personal growth", level: "dynamic", rotation: ["push", "drift", "push", "pull"], intents: { hook: "push", reveal: "push", reflect: "pull", tension: "push" }, flashGap: 20, allow: { flash: true, glitch: false, shake: true } },
  biography: { id: "biography", name: "Biography and success stories", level: "balanced", rotation: ["push", "pan", "pull", "drift"], intents: { open: "pull", detail: "push", reflect: "pull", read: "drift" }, flashGap: 40, allow: { flash: true, glitch: false, shake: false } },
  education: { id: "education", name: "Education and explainers", level: "calm", rotation: ["drift", "push", "pan", "hold"], intents: { read: "hold", question: "push", establish: "pan" }, flashGap: 60, allow: { flash: false, glitch: false, shake: false } },
  history: { id: "history", name: "History and civilisation", level: "balanced", rotation: ["push", "pan", "pull", "drift"], intents: { read: "drift", establish: "pan", detail: "push", reflect: "pull", open: "pull" }, flashGap: 45, allow: { flash: true, glitch: false, shake: false } },
  war: { id: "war", name: "War and battles", level: "dynamic", rotation: ["push", "pan", "push", "pull"], intents: { tension: "push", establish: "pan", read: "drift", reflect: "pull" }, flashGap: 15, allow: { flash: true, glitch: false, shake: true } },
  nature: { id: "nature", name: "Nature and wildlife", level: "calm", rotation: ["pan", "drift", "pull", "push"], intents: { establish: "pan", detail: "push", reflect: "pull" }, flashGap: 0, allow: { flash: false, glitch: false, shake: false } },
  science: { id: "science", name: "Science and space", level: "balanced", rotation: ["push", "drift", "pull", "pan"], intents: { question: "push", establish: "pull", read: "hold", reveal: "push" }, flashGap: 60, allow: { flash: false, glitch: false, shake: false } },
  technology: { id: "technology", name: "Technology and innovation", level: "balanced", rotation: ["push", "pan", "drift", "hold"], intents: { read: "hold", detail: "push" }, flashGap: 40, allow: { flash: true, glitch: true, shake: false } },
  business: { id: "business", name: "Business, finance and economics", level: "balanced", rotation: ["push", "pan", "hold", "pull"], intents: { read: "hold", reveal: "push", tension: "push" }, flashGap: 40, allow: { flash: true, glitch: false, shake: false } },
  investigative: { id: "investigative", name: "Investigation, mystery and crime", level: "balanced", rotation: ["push", "drift", "push", "pan"], intents: { tension: "push", question: "push", read: "drift", reveal: "push" }, flashGap: 30, allow: { flash: true, glitch: true, shake: false } },
  geography: { id: "geography", name: "Geography, travel and culture", level: "calm", rotation: ["pan", "pull", "drift", "push"], intents: { establish: "pan", detail: "push", reflect: "pull" }, flashGap: 60, allow: { flash: false, glitch: false, shake: false } },
  story: { id: "story", name: "Dramatised stories", level: "dynamic", rotation: ["push", "drift", "pan", "pull"], intents: { tension: "push", reveal: "push", reflect: "pull", establish: "pan" }, flashGap: 20, allow: { flash: true, glitch: false, shake: true } },
});

/** The studio's 25 formats (formats.mjs) and their motion language. Unknown formats: general documentary. */
const FORMAT_PROFILE = Object.freeze({
  "true-story-reenactment": "war", "rags-to-riches": "motivation", "motivational-life-story": "motivation", "place-nobody-can-visit": "geography",
  "deadliest-journey": "geography", "history-epic": "history", "history-in-minutes": "history", "other-side": "history", "inner-circle": "biography",
  "dark-business-expose": "investigative", "money-explainer": "business", "big-question-science": "science", "mystery-investigation": "investigative",
  "numbered-compilation": "education", biography: "biography", "company-rise-fall": "business", "true-crime-case": "investigative",
  "survival-story": "story", "war-battle": "war", "geography-why": "geography", "space-mission": "science", "disaster-minute-by-minute": "investigative",
  "ancient-civilization": "history", "sports-legend": "motivation", "dramatized-story": "story",
});

/** Words that mark each motion language, for a film with no format (a voiceover, a free idea). */
const GENRE_CUES = /** @type {[string, RegExp][]} */ ([
  ["nature", /\b(wildlife|animals?|forests?|oceans?|reefs?|species|migration|birds?|jungles?|predators?|habitat|lions?|whales?)\b/g],
  ["science", /\b(space|planets?|galax(y|ies)|universe|physics|quantum|black holes?|stars?|mars|atoms?|cells?|dna|experiment|scientists?|nasa|orbit)\b/g],
  ["technology", /\b(ai|software|computers?|internet|chips?|robots?|technology|algorithm|app|startup|code)\b/g],
  ["war", /\b(war|battles?|army|soldiers?|aircraft|tanks?|navy|bombers?|pilots?|troops|invasion|front line|squadron|marines?|last stand|siege|enemy|fighters?|battleships?|garrison|surrender)\b/g],
  ["history", /\b(empires?|ancient|centur(y|ies)|kings?|queens?|dynast(y|ies)|history|historians?|medieval|pharaohs?|civili[sz]ations?|revolution)\b/g],
  ["motivation", /\b(success|dreams?|discipline|mindset|habits?|motivat\w*|hard truths?|life lessons?|goals?|confidence|failure|grind|self[- ]improvement|teen(s|agers?)?)\b/g],
  ["business", /\b(compan(y|ies)|markets?|money|econom(y|ics)|billions?|millions?|profit|stocks?|investors?|revenue|brand|ceo)\b/g],
  ["investigative", /\b(myster(y|ies)|crimes?|murders?|disappear\w*|unsolved|secrets?|investigat\w*|evidence|detectives?|suspects?|cover[- ]up)\b/g],
  ["biography", /\b(born|childhood|life of|career|his life|her life|grew up|legend|biography)\b/g],
  ["geography", /\b(countr(y|ies)|borders?|maps?|islands?|rivers?|mountains?|population|climate|cities|capital|desert)\b/g],
  ["education", /\b(how (does|do|to)|why (does|do|is|are)|explained|learn|lesson|step by step|tutorial|guide)\b/g],
]);

/**
 * The motion language of a film: its format's when it has one; otherwise the genre its own
 * words point to most clearly (the topic counts three times, the narration or voiceover once),
 * so an education film is not cut like a history epic. Too few cues: general documentary.
 * @param {{ formatId?: string | null, contentType?: string, topic?: string, text?: string }} film
 */
export function profileFor(film) {
  const byFormat = film.formatId ? FORMAT_PROFILE[/** @type {keyof typeof FORMAT_PROFILE} */ (film.formatId)] : undefined;
  if (byFormat) return MOTION_PROFILES[byFormat];
  if (film.contentType === "story") return MOTION_PROFILES.story;
  const topic = String(film.topic ?? "").toLowerCase();
  const text = String(film.text ?? "").toLowerCase().slice(0, 40000);
  let best = "documentary";
  let most = 0;
  for (const [id, re] of GENRE_CUES) {
    const score = 3 * (topic.match(re) ?? []).length + (text.match(re) ?? []).length;
    if (score > most) { best = id; most = score; }
  }
  return most >= 3 ? MOTION_PROFILES[/** @type {keyof typeof MOTION_PROFILES} */ (best)] : MOTION_PROFILES.documentary;
}

/** @param {string | null | undefined} level */
export function motionLevel(level, profile = MOTION_PROFILES.documentary) {
  return level && Object.hasOwn(MOTION_LEVELS, level) ? /** @type {MotionLevel} */ (level) : profile.level;
}

/**
 * A move the script writes in its MOTION field, locked: the decision never overrides it.
 * Slow motion and speed ramps are not camera moves (timeline.mjs reads those).
 * @param {string} motion
 * @returns {Move | null}
 */
export function writtenMove(motion) {
  const m = String(motion ?? "").toLowerCase();
  if (!m.trim()) return null;
  const lock = (/** @type {MoveKind} */ kind, /** @type {1 | -1} */ dir = 1, /** @type {Ease} */ ease = "inOut") => ({ kind, amount: 0, dir, ease, why: `the script asks for "${motion.trim().slice(0, 40)}"`, locked: true });
  if (/\b(static|locked[- ]?off|lock[- ]?off|hold|no (camera )?move(ment)?|still frame)\b/.test(m)) return lock("hold");
  if (/\b(pull[- ]?(out|back)|zoom[- ]?out|dolly[- ]?out|reveal wide)\b/.test(m)) return lock("pull");
  if (/\b(pan|track|truck|slide)[- ]?(to the )?left\b/.test(m)) return lock("pan", -1);
  if (/\b(pan|track|truck|slide)[- ]?(to the )?right\b|\bpan\b/.test(m)) return lock("pan", 1);
  if (/\btilt[- ]?up\b|\bpedestal up\b/.test(m)) return lock("tilt", -1);
  if (/\btilt[- ]?down\b|\btilt\b|\bpedestal down\b/.test(m)) return lock("tilt", 1);
  if (/\b(drift|float|parallax|breath(e|ing))\b/.test(m)) return lock("drift");
  if (/\bslam|crash[- ]?zoom|snap[- ]?zoom\b/.test(m)) return lock("push", 1, "out");
  if (/\b(push|zoom[- ]?in|dolly[- ]?in|creep)\b/.test(m)) return lock("push");
  return null;
}

/**
 * What a scene is for, read from the script itself (position, delivery, words, shot brief).
 * @param {{ start: number, narration: string, fields: Record<string, string> }} scene
 * @param {{ shotText?: string, chapterOpen?: boolean, chapterClose?: boolean }} [at]
 * @returns {Intent}
 */
export function sceneIntent(scene, at = {}) {
  const delivery = String(scene.fields.DELIVERY ?? "").toLowerCase();
  const text = String(scene.narration ?? "");
  const brief = String(at.shotText ?? "").toLowerCase();
  if (/\b(document|letter|newspaper|headline|ledger|page|manuscript|report|contract|map)\b/.test(brief)) return "read";
  if (scene.start < 0.5) return "hook"; // only the opening picture: pushing every early shot is the constant-zoom habit
  // The written delivery is a direction and wins over the words: a soft line about the dead is a reflection.
  if (/\b(tense|urgent|ominous|dark|grave|menac|dread|alarm)/.test(delivery)) return "tension";
  if (/\b(soft|quiet|gentle|warm|reflect|tender|calm|wistful|hushed|somber|sombre)/.test(delivery) || at.chapterClose) return "reflect";
  if (/\b(killed|died|dead|crash(ed)?|explo(de|ded|sion)|attack(ed)?|bomb(ed|s)?|fire|shot down|sank|collapse|ignit(ed|ion)|roar(ed)?|blast|shook|thunder(ed)?|struck)\b/i.test(text)) return "tension";
  if (/\b(wide|aerial|drone|landscape|establishing|skyline|panorama|horizon|valley|coast)\b/.test(brief)) return "establish";
  if (at.chapterOpen) return "open";
  if (/\b(face|portrait|eyes|close[- ]?up|hands)\b/.test(brief)) return "detail";
  if (/\?\s*$/.test(text.trim())) return "question";
  if (/\b(never|only|first|secret|truth|until|but then|nobody knew|turned out)\b/i.test(text)) return "reveal";
  return "plain";
}

/** What a scene's purpose asks for when its genre has no word of its own on it. */
const DEFAULT_INTENTS = /** @type {Record<Intent, MoveKind | null>} */ ({ hook: "push", tension: "push", reveal: "push", reflect: "pull", read: "drift", establish: "pan", detail: "push", question: "push", open: "pull", plain: null });

const EASE_FOR = /** @type {Record<Intent, Ease>} */ ({ hook: "out", reveal: "out", tension: "inOut", reflect: "inOut", read: "linear", establish: "inOut", open: "inOut", detail: "inOut", question: "inOut", plain: "inOut" });

/**
 * The move for one still, with its reason. `previous` is the moves already decided in this film.
 * @param {{ intent: Intent, seconds: number, written?: Move | null, profile: MotionProfile, level: MotionLevel, previous: Move[], index: number }} o
 * @returns {Move}
 */
export function decideMove(o) {
  const lv = MOTION_LEVELS[o.level];
  const cap = Math.max(lv.min, Math.min(lv.amount, lv.perSecond * o.seconds));
  if (o.written) return { ...o.written, amount: o.written.kind === "hold" ? 0 : Math.max(cap, lv.min || 0.02) };
  if (o.level === "reduced") return { kind: "hold", amount: 0, dir: 1, ease: "linear", why: "reduced motion is on" };
  if (o.seconds < 1.2) return { kind: "hold", amount: 0, dir: 1, ease: "linear", why: "a shot this short reads better still" };
  const last = o.previous.slice(-2);
  const asked = o.profile.intents[o.intent] ?? DEFAULT_INTENTS[o.intent];
  let kind = asked ?? o.profile.rotation[o.index % o.profile.rotation.length];
  let why = asked ? `${o.intent} scene in a ${o.profile.name.toLowerCase()} film` : `${o.profile.name.toLowerCase()} rotation`;
  // Never the same move three times running: the eye stops seeing it.
  if (kind !== "hold" && last.length === 2 && last.every((m) => m.kind === kind)) {
    const other = o.profile.rotation.find((k) => k !== kind && k !== "hold") ?? "drift";
    why += `; ${kind} twice already, so ${other}`;
    kind = other;
  }
  const prevPan = [...o.previous].reverse().find((m) => m.kind === kind && (kind === "pan" || kind === "tilt"));
  /** @type {1 | -1} */
  const dir = prevPan ? /** @type {1 | -1} */ (-prevPan.dir) : 1;
  const strength = o.intent === "tension" || o.intent === "reveal" || o.intent === "hook" ? 1 : o.intent === "read" || o.intent === "reflect" ? 0.6 : 0.8;
  const amount = kind === "hold" ? 0 : Math.round(Math.max(lv.min, cap * strength) * 1000) / 1000;
  return { kind, amount, dir, ease: kind === "drift" ? "linear" : EASE_FOR[o.intent], why };
}

/**
 * Transitions under the film's motion language and level: reduced motion and genres that never
 * flash get dips or cuts instead; flashes and glitches are rationed so no two land close together
 * (photosensitivity: a single flash, never a sequence). Returns what it changed.
 * @param {{ start: number, transition?: string, shakes?: number[], punchIns?: number[] }[]} video
 * @param {MotionProfile} profile @param {MotionLevel} level
 */
export function governTransitions(video, profile, level) {
  const changed = { flash: 0, glitch: 0, whip: 0, shakes: 0, punchIns: 0 };
  let lastFlash = -Infinity;
  for (const v of video) {
    const t = v.transition;
    if (t === "flash" || t === "glitch") {
      const allowed = level !== "reduced" && profile.allow[t] && v.start - lastFlash >= Math.max(10, profile.flashGap);
      if (allowed) lastFlash = v.start;
      else { delete v.transition; changed[t] += 1; }
    } else if (t === "whip" && (level === "reduced" || level === "calm")) { v.transition = "slide"; changed.whip += 1; }
    if (v.shakes?.length && (level === "reduced" || !profile.allow.shake)) { changed.shakes += v.shakes.length; delete v.shakes; }
    if (v.punchIns?.length && level === "reduced") { changed.punchIns += v.punchIns.length; delete v.punchIns; }
  }
  return changed;
}

/**
 * The ffmpeg expression for eased progress 0 -> 1 over n frames (zoompan's frame counter `on`).
 * @param {Ease} ease @param {number} n
 */
export function easeExpr(ease, n) {
  const p = `min(1,on/${Math.max(1, n - 1)})`;
  if (ease === "linear") return p;
  if (ease === "out") return `(1-(1-${p})*(1-${p}))`;
  return `(${p}*${p}*(3-2*${p}))`;
}

/**
 * A still's move as a zoompan filter on a plate twice the frame size (sub-pixel smooth),
 * without d/s/fps (the renderer adds them).
 * @param {Move} m @param {number} n frames
 */
export function moveFilter(m, n) {
  const e = easeExpr(m.ease, n);
  const a = Math.max(0, m.amount);
  const cx = "iw/2-(iw/zoom/2)";
  const cy = "ih/2-(ih/zoom/2)";
  if (m.kind === "hold" || a === 0) return `zoompan=z='1':x='${cx}':y='${cy}'`;
  if (m.kind === "push") return `zoompan=z='1+${a}*${e}':x='${cx}':y='${cy}'`;
  if (m.kind === "pull") return `zoompan=z='1+${a}-${a}*${e}':x='${cx}':y='${cy}'`;
  // A pan or tilt travels across the room a small zoom leaves; drift adds a little zoom to a slow sideways float.
  const z = Math.max(0.04, a);
  const travel = m.dir === 1 ? `(${e})` : `(1-${e})`;
  if (m.kind === "pan") return `zoompan=z='${1 + z}':x='(iw-iw/zoom)*${travel}':y='${cy}'`;
  if (m.kind === "tilt") return `zoompan=z='${1 + z}':x='${cx}':y='(ih-ih/zoom)*${travel}'`;
  return `zoompan=z='1.03+${Math.round(a * 500) / 1000}*${e}':x='(iw-iw/zoom)*(0.5+${m.dir * 0.35}*(${e}-0.5))':y='${cy}'`;
}

/**
 * The motion report of a film: how often each move was used, what the script locked,
 * and what the governor changed. Shown in the render report.
 * @param {(Move | undefined)[]} moves @param {ReturnType<typeof governTransitions>} governed
 */
export function motionReport(moves, governed, profile = MOTION_PROFILES.documentary, level = /** @type {MotionLevel} */ ("balanced")) {
  /** @type {Record<string, number>} */
  const byKind = {};
  let locked = 0;
  let longestRepeat = 0;
  let run = 0;
  let prev = "";
  for (const m of moves) {
    if (!m) continue;
    byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
    if (m.locked) locked += 1;
    run = m.kind === prev ? run + 1 : 1;
    prev = m.kind;
    longestRepeat = Math.max(longestRepeat, run);
  }
  return { profile: profile.id, level, stills: moves.filter(Boolean).length, byKind, locked, longestRepeat, governed };
}
