/**
 * The Quran director: the shot list of a recitation film, from the meaning
 * of each ayah and the measured pauses of the recording. Calm, reverent and
 * coherent (docs/QURAN_DOCUMENTARY.md, "Direction for a recitation"):
 *  - cuts only at ayah ends and at measured pauses, never inside a voiced
 *    stretch (so never inside a word or a held note); an ayah end that is
 *    not sure is not cut at: the picture holds across it;
 *  - shots of about 5 to 12 s; a long ayah gets several shots, at its pauses;
 *  - slow dissolves centred on the pause; slow eased moves; one grade;
 *    neighbouring shots keep the direction of movement and the brightness;
 *  - the picture follows the meaning: a thing the Arabic names first, then
 *    the theme from the translation, then neutral reverent motifs; every
 *    shot stores `because` (the ayah, the word or theme, and the source);
 *  - a repeated ayah (the refrain of Ar-Rahman) returns to its own motif;
 *  - the unseen (the Hereafter, angels, Paradise, Hell) is shown only as a
 *    symbol in real earthly nature (`symbolic`), and the flag carries
 *    through the ayat that go on describing it;
 *  - the adab level decides whether animals may be shown (people never in
 *    `strict` and `nature`; in `people-distant` only from afar, no faces).
 * Opening from black on the title card; the last shot holds through the
 * tail and fades out. Nothing here searches for media (Q4) or renders (Q5).
 */
import { normalizeArabic } from "./arabic.mjs";
import { msg } from "./messages.mjs";
import { THEMES } from "./quran-meaning.mjs";

/** @typedef {"strict" | "nature" | "people-distant"} AdabLevel */
/**
 * @typedef {{ id: string, scene: string, kind: "title" | "ayah" | "end", surah: number, ayah: number | null, part: number, parts: number,
 *   start: number, end: number, look: string[], motif: string, move: string, mood: string, brightness: "dark" | "dim" | "mid" | "bright",
 *   symbolic: boolean, refrain: string | null, transitionIn: { type: "fade-from-black" | "dissolve" | "hold", seconds: number },
 *   because: { ayah: string, from: "arabic-word" | "theme" | "neutral" | "title" | "end", detail: string, source: string }, notes: string[] }} Shot
 */

export const DIRECTION = Object.freeze({
  minShot: 5,
  maxShot: 12,
  /** A pause must be at least this long to cut in it. */
  cutPause: 0.3,
  /** A dissolve is at most this long, and never longer than the pause it sits on plus a second. */
  dissolve: 1.6,
  openingFade: 2,
  closingFade: 3,
  /** The unseen flag carries through at most this many following ayat that name nothing earthly of their own. */
  unseenCarry: 12,
});

/** Slow moves; a still subject is never given a fast one. */
export const MOVES = Object.freeze(["slow push in", "slow drift left", "slow drift right", "aerial glide", "slow pull out", "time-lapse", "locked-off hold"]);

const MOOD_LIGHT = Object.freeze({ solemn: "dim", reverent: "mid", majestic: "mid", warm: "bright", hopeful: "bright", calm: "mid", reflective: "dim" });

/** Neutral reverent motifs, used when an ayah names nothing and has no theme. */
export const NEUTRAL_MOTIFS = Object.freeze(["calm sea at dawn", "mountains in mist", "desert dunes at first light", "clouds drifting over hills", "still lake at dusk", "light through clouds"]);

/** Earthly symbols for the unseen: never a literal scene of Paradise, Hell or angels. */
export const SYMBOLIC_MOTIFS = Object.freeze(["vast sky at dawn", "light breaking through clouds", "endless horizon", "still water reflecting the sky", "garden with a stream (symbol)", "storm over the sea (symbol)"]);

const HEREAFTER_UNSEEN = new Set(["the Hereafter", "Paradise", "Hell", "the Day of Resurrection", "the Hour", "Paradise or the jinn"]);
/** Themes that do not end a description of the Hereafter (the refrain's gratitude, the Hereafter itself). */
const CARRY_THEMES = new Set(["the Hereafter", "gratitude for His favours"]);

/** Search words that would bring living beings, by level. */
const PEOPLE = /\b(people|person|man|men|woman|women|child|children|crowd|worshipp?ers?|pilgrims?|family|face|faces|portrait)\b/i;
const ANIMALS = /\b(bees?|cattle|camels?|birds?|horses?|sheep|goats?|fish|animals?|wildlife|honeycomb)\b/i;

/**
 * May this search phrase be used at this adab level? People are never
 * searched for in `strict` or `nature`; in `people-distant` only with
 * "from afar"/"silhouette" and never with faces.
 * @param {string} look @param {AdabLevel} level
 */
export function allowedAt(look, level) {
  if (/\b(face|faces|portrait|close-?up)\b/i.test(look)) return false;
  if (PEOPLE.test(look)) return level === "people-distant" && /\b(from afar|silhouette|distant|from behind)\b/i.test(look);
  if (ANIMALS.test(look)) return level !== "strict";
  return true;
}

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Where a shot may be cut inside an ayah: the middle of each measured pause
 * long enough, never inside a voiced stretch.
 * @param {{ start: number, end: number }[]} spans @param {number} from @param {number} to @param {number[]} [near]
 */
function innerPauses(spans, from, to, near = /** @type {number[]} */ ([])) {
  /** @type {{ at: number, length: number }[]} */
  const out = [];
  for (let j = 1; j < spans.length; j += 1) {
    const a = spans[j - 1].end, b = spans[j].start;
    // A pause next to an estimated ayah end counts as a longer one, so the cut tends to fall between ayat.
    const bonus = near.some((t) => Math.abs(t - (a + b) / 2) < 1.5) ? 1.5 : 0;
    if (b - a >= DIRECTION.cutPause && a > from + 0.05 && b < to - 0.05) out.push({ at: r3((a + b) / 2), length: r3(b - a + bonus) });
  }
  return out;
}

/**
 * Split [from, to) into parts of about minShot..maxShot seconds at pauses.
 * Greedy from the start: the next cut is the pause closest to the target
 * length that keeps both sides at least minShot long.
 * @param {number} from @param {number} to @param {{ at: number, length: number }[]} pauses
 */
export function splitAtPauses(from, to, pauses) {
  /** @type {number[]} */
  const cuts = [];
  let at = from;
  const target = (DIRECTION.minShot + DIRECTION.maxShot) / 2;
  while (to - at > DIRECTION.maxShot) {
    const options = pauses.filter((p) => p.at - at >= DIRECTION.minShot && to - p.at >= DIRECTION.minShot);
    if (!options.length) break;
    // Prefer a cut near the target length, and a longer pause.
    options.sort((x, y) => Math.abs(x.at - at - target) - 2 * x.length - (Math.abs(y.at - at - target) - 2 * y.length));
    const next = options.find((p) => p.at - at <= DIRECTION.maxShot) ?? options[0];
    cuts.push(next.at);
    at = next.at;
  }
  return cuts;
}

/** The ayah's own Arabic, as one key: repeated ayat (refrains) share it. @param {string} simple */
const refrainKey = (simple) => normalizeArabic(simple);

/**
 * The shot list.
 * @param {{ plan: import("./quran-film.mjs").QuranFilmPlan, meaning: { ayat: import("./quran-meaning.mjs").AyahMeaning[] },
 *   spans?: { start: number, end: number }[], adab?: AdabLevel, seed?: number }} o
 */
export function directQuranFilm(o) {
  const level = o.adab ?? "strict";
  const spans = o.spans ?? [];
  const byAyah = new Map(o.meaning.ayat.map((m) => [m.surah + ":" + m.ayah, m]));
  /** @type {Shot[]} */
  const shots = [];
  /** @type {string[]} */
  const notes = [];
  /** @type {Map<string, string>} */
  const refrainMotif = new Map();
  /** @type {Map<string, number>} */
  const keyCount = new Map();
  for (const m of o.meaning.ayat) { const k = refrainKey(m.simple); keyCount.set(k, (keyCount.get(k) ?? 0) + 1); }
  /** @type {string[]} */
  const recent = [];
  let unseenLeft = 0;
  let moveIndex = Math.abs(o.seed ?? 0) % 3;

  // Scenes whose start sits on an unsure ayah end are joined to the scene before: no cut there.
  /** @type {{ scenes: import("./quran-film.mjs").QuranScene[], start: number, end: number }[]} */
  const groups = [];
  for (const s of o.plan.scenes) {
    const last = groups[groups.length - 1];
    const prev = last?.scenes[last.scenes.length - 1];
    if (last && prev && prev.kind === "ayah" && s.kind === "ayah" && prev.endSure === false) {
      last.scenes.push(s); last.end = s.end;
      notes.push(`${prev.surah}:${prev.ayah}: its end is not sure, so the picture holds into ${s.surah}:${s.ayah} (no cut).`);
    } else groups.push({ scenes: [s], start: s.start, end: s.end });
  }

  /**
   * Choose the motif of one ayah.
   * @param {import("./quran-meaning.mjs").AyahMeaning | undefined} m
   * @returns {{ look: string[], motif: string, mood: string, symbolic: boolean, refrain: string | null, because: Shot["because"] }}
   */
  const choose = (m) => {
    const ref = m ? `${m.surah}:${m.ayah}` : "";
    if (!m) return { look: [NEUTRAL_MOTIFS[0]], motif: NEUTRAL_MOTIFS[0], mood: "calm", symbolic: false, refrain: null, because: { ayah: ref, from: "neutral", detail: "no meaning on record", source: "neutral motifs" } };
    const key = refrainKey(m.simple);
    const repeated = (keyCount.get(key) ?? 0) > 1;
    // The Hereafter (and Paradise and Hell) is often described over many ayat that do not name it again,
    // so its flag carries until another subject comes; angels or jinn named once make only that ayah a symbol.
    const hereafter = m.themes.some((t) => t.theme === "the Hereafter") || m.unseen.some((u) => HEREAFTER_UNSEEN.has(u)) || m.things.some((t) => t.symbolic);
    const otherUnseen = m.unseen.length > 0;
    if (repeated) { /* a refrain keeps the flag as it is */ }
    else if (hereafter) unseenLeft = DIRECTION.unseenCarry;
    else if (m.themes.some((t) => !CARRY_THEMES.has(t.theme))) unseenLeft = 0;
    else if (unseenLeft > 0) unseenLeft -= 1;
    const symbolic = hereafter || otherUnseen || unseenLeft > 0;
    if (repeated && refrainMotif.has(key)) {
      const motif = /** @type {string} */ (refrainMotif.get(key));
      return { look: [motif], motif, mood: "reverent", symbolic, refrain: key.slice(0, 40), because: { ayah: ref, from: "theme", detail: "the same words as before: the refrain returns to its own picture", source: "the Arabic text (repeated ayah)" } };
    }
    /** @type {{ look: string[], motif: string, mood: string, because: Shot["because"] } | null} */
    let pick = null;
    for (const t of m.things) {
      if (symbolic && !t.symbolic && /night|dark|fire/.test(t.thing)) continue;
      const looks = t.look.filter((l) => allowedAt(l, level));
      if (!looks.length) { notes.push(`${ref}: "${t.thing}" is not shown at adab level ${level}.`); continue; }
      const fresh = looks.find((l) => !recent.includes(l)) ?? looks[0];
      pick = { look: looks, motif: fresh, mood: m.themes[0] ? moodOf(m.themes[0].theme) : "majestic", because: { ayah: ref, from: "arabic-word", detail: `${t.thing} (${t.word})`, source: "Tanzil text, literal lexicon" } };
      break;
    }
    if (!pick && m.themes.length) {
      const t = m.themes[0];
      const family = symbolic ? SYMBOLIC_MOTIFS : motifsOf(t.theme);
      const fresh = family.find((l) => !recent.includes(l)) ?? family[0];
      pick = { look: [...family], motif: fresh, mood: moodOf(t.theme), because: { ayah: ref, from: "theme", detail: `${t.theme} ("${t.because}")`, source: "Pickthall 1930, theme rules" } };
    }
    if (!pick) {
      const family = symbolic ? SYMBOLIC_MOTIFS : NEUTRAL_MOTIFS;
      const fresh = family.find((l) => !recent.includes(l)) ?? family[0];
      pick = { look: [...family], motif: fresh, mood: symbolic ? "solemn" : "calm", because: { ayah: ref, from: "neutral", detail: symbolic ? "continues the description of the unseen: a symbol only" : "no visible thing and no theme on record", source: "neutral reverent motifs" } };
    }
    if (symbolic && pick.because.from === "arabic-word") pick.because.detail += ", shown as an earthly symbol";
    if (repeated) refrainMotif.set(key, pick.motif);
    return { ...pick, symbolic, refrain: repeated ? key.slice(0, 40) : null };
  };

  let previousLight = "mid";
  for (const g of groups) {
    const first = g.scenes[0];
    if (first.kind === "title") {
      shots.push(shot({ scene: first.id, kind: "title", surah: first.surah, ayah: null, start: g.start, end: g.end, look: ["sky at dawn", "clouds over mountains", "calm sea at dawn"], motif: "sky at dawn", move: "slow push in", mood: "reverent", brightness: "dim", symbolic: false, refrain: null, because: { ayah: `${first.surah}`, from: "title", detail: first.label, source: "surah names (quran-meta), Tanzil text" } }));
      previousLight = "dark";
      continue;
    }
    // Each ayah of the group gets its picture, in order (refrains and the unseen flag stay in step).
    const choices = g.scenes.map((s) => ({ scene: s, c: choose(byAyah.get(s.surah + ":" + s.ayah)) }));
    const cuts = splitAtPauses(g.start, g.end, innerPauses(spans, g.start, g.end, g.scenes.length > 1 ? g.scenes.slice(0, -1).map((s) => s.end) : []));
    const edges = [g.start, ...cuts, g.end];
    /** @type {Map<string, number>} */
    const partsOf = new Map();
    const owner = (/** @type {number} */ p) => { const mid = (edges[p] + edges[p + 1]) / 2; return choices.find((x) => mid >= x.scene.start && mid < x.scene.end) ?? choices[choices.length - 1]; };
    for (let p = 0; p + 1 < edges.length; p += 1) { const id = owner(p).scene.id; partsOf.set(id, (partsOf.get(id) ?? 0) + 1); }
    /** @type {Map<string, number>} */
    const seen = new Map();
    for (let p = 0; p + 1 < edges.length; p += 1) {
      const { scene, c } = owner(p);
      const part = (seen.get(scene.id) ?? 0) + 1;
      seen.set(scene.id, part);
      // The second and later shots of one ayah stay in its family but change the picture.
      let look = c.look.length > 1 ? c.look[(c.look.indexOf(c.motif) + part - 1) % c.look.length] : c.motif;
      // No picture twice in a row, unless it is the refrain's own picture.
      if (!c.refrain && recent.length && recent[recent.length - 1] === look) look = c.look.find((l) => !recent.includes(l)) ?? NEUTRAL_MOTIFS.find((l) => !recent.includes(l)) ?? look;
      // Keep the direction for the shots of one ayah; change it gently between ayat.
      const move = part === 1 ? MOVES[(moveIndex += 1) % 5] : shots[shots.length - 1].move;
      const light = /** @type {Shot["brightness"]} */ (c.symbolic ? "dim" : /** @type {Record<string, string>} */ (MOOD_LIGHT)[c.mood] ?? "mid");
      // Continuity: no jump from dark to bright in one cut.
      const brightness = previousLight === "dark" && light === "bright" ? "mid" : light;
      previousLight = brightness;
      const estimated = g.scenes.length > 1;
      shots.push(shot({ scene: scene.id, kind: "ayah", surah: scene.surah, ayah: scene.ayah, part, parts: partsOf.get(scene.id) ?? 1, start: edges[p], end: edges[p + 1], look: [look], motif: look, move, mood: c.mood, brightness, symbolic: c.symbolic, refrain: c.refrain,
        because: { ...c.because, detail: c.because.detail + (estimated ? " (the ayah is estimated from its time: its ends are not sure)" : "") } }));
      recent.push(look);
      if (recent.length > 6) recent.shift();
    }
  }
  // Transitions: fade from black at the start, dissolves on the pauses, a held tail and a slow fade at the end.
  shots.forEach((s, k) => {
    if (k === 0) { s.transitionIn = { type: "fade-from-black", seconds: DIRECTION.openingFade }; return; }
    const pause = pauseAround(spans, s.start);
    s.transitionIn = { type: "dissolve", seconds: r3(Math.min(DIRECTION.dissolve, Math.max(0.6, pause + 0.8))) };
  });
  shots.forEach((s, k) => { s.id = "S" + String(k + 1).padStart(3, "0"); });
  const last = shots[shots.length - 1];
  const end = last ? { fadeOut: DIRECTION.closingFade, holdFrom: last.start, to: o.plan.totalSeconds } : null;
  const problems = checkDirection(shots, spans, level);
  /** @type {any[]} */
  const messages = [msg("quran.directed", { shots: shots.length, symbolic: shots.filter((s) => s.symbolic).length, level })];
  if (problems.length) messages.push(msg("quran.directionProblems", { count: problems.length }));
  return { ok: problems.length === 0, adab: level, shots, end, notes, problems, messages };
}

/** @param {Omit<Shot, "id" | "part" | "parts" | "transitionIn" | "notes"> & { part?: number, parts?: number }} s @returns {Shot} */
function shot(s) {
  return { id: "", part: 1, parts: 1, ...s, start: r3(s.start), end: r3(s.end), transitionIn: { type: "hold", seconds: 0 }, notes: [] };
}

/** @param {{ start: number, end: number }[]} spans @param {number} t */
function pauseAround(spans, t) {
  for (let j = 1; j < spans.length; j += 1) if (spans[j - 1].end <= t + 1e-6 && spans[j].start >= t - 1e-6) return spans[j].start - spans[j - 1].end;
  return 0;
}

/** @param {string} theme */
function moodOf(theme) {
  return THEME_MOOD.get(theme) ?? "calm";
}
/** @param {string} theme */
function motifsOf(theme) {
  return THEME_MOTIFS.get(theme) ?? [...NEUTRAL_MOTIFS];
}
const THEME_MOOD = new Map(THEMES.map((t) => [t.theme, t.mood]));
const THEME_MOTIFS = new Map(THEMES.map((t) => [t.theme, [...t.motifs]]));

/**
 * The rules, checked: every shot has a reason; no cut inside a voiced
 * stretch; shots in order and touching; nothing the adab level forbids;
 * the unseen only as a symbol.
 * @param {Shot[]} shots @param {{ start: number, end: number }[]} spans @param {AdabLevel} level
 */
export function checkDirection(shots, spans, level) {
  /** @type {string[]} */
  const problems = [];
  shots.forEach((s, k) => {
    if (!s.because || !s.because.detail || !s.because.source) problems.push(`${s.id}: no reason for this picture.`);
    if (s.end <= s.start) problems.push(`${s.id}: ends before it starts.`);
    if (k > 0 && Math.abs(s.start - shots[k - 1].end) > 0.002) problems.push(`${s.id}: does not start where ${shots[k - 1].id} ends.`);
    if (k > 0) for (const sp of spans) if (s.start > sp.start + 0.02 && s.start < sp.end - 0.02) { problems.push(`${s.id}: cut at ${s.start} s is inside the voice (${r3(sp.start)}-${r3(sp.end)} s).`); break; }
    for (const l of s.look) if (!allowedAt(l, level)) problems.push(`${s.id}: "${l}" is not allowed at adab level ${level}.`);
    if (s.symbolic && /\b(paradise|hell|angel|heaven(ly)? scene|jannah|jahannam)\b/i.test(s.look.join(" "))) problems.push(`${s.id}: the unseen is shown literally.`);
  });
  return problems;
}

/** The shot list as a table a person can read and check. @param {ReturnType<typeof directQuranFilm>} d */
export function shotTable(d) {
  const lines = [`Adab level: ${d.adab}. ${d.shots.length} shots.`, "", "| Shot | Time (s) | Ayah | Picture | Move | Mood / light | Why (source) | In |", "|---|---|---|---|---|---|---|---|"];
  for (const s of d.shots) {
    lines.push(`| ${s.id} | ${s.start.toFixed(1)}-${s.end.toFixed(1)} | ${s.ayah === null ? "title" : `${s.surah}:${s.ayah}${s.parts > 1 ? ` (${s.part}/${s.parts})` : ""}`} | ${s.motif}${s.symbolic ? " (symbol)" : ""}${s.refrain ? " (refrain)" : ""} | ${s.move} | ${s.mood} / ${s.brightness} | ${s.because.detail} (${s.because.source}) | ${s.transitionIn.type} ${s.transitionIn.seconds}s |`);
  }
  if (d.end) lines.push("", `The last shot holds to ${d.end.to.toFixed(1)} s and fades out over ${d.end.fadeOut} s.`);
  if (d.notes.length) lines.push("", ...d.notes.map((n) => "- " + n));
  if (d.problems.length) lines.push("", "Problems:", ...d.problems.map((p) => "- " + p));
  return lines.join("\n");
}
