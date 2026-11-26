#!/usr/bin/env node
/**
 * The light studio: an idea card in, a finished 3-minute film out, with no
 * account, no key and no brain to pay for.
 *
 * What it does, in order, for each card:
 *   1. writes a real run folder (film.json, s3-chapters.json, s5-C1.md) from
 *      the card's scenes, with the clock derived from the words at the
 *      channel's own speaking rate, so the chapter passes the engine's checks;
 *   2. fills every shot from Wikimedia Commons (free, keyless, licence checked
 *      here: public domain, CC0 and plain CC BY only, never share-alike,
 *      non-commercial or GFDL), one picture per shot, no repeats inside the
 *      film's repeat window;
 *   3. narrates every scene with the free Zupona narrator (Kokoro-82M);
 *   4. renders the MP4 with the one renderer the studio already has
 *      (render/render-film.mjs), and keeps the credits beside it.
 *
 * Cards are cheap and plain: a title, a hook, a list of scenes (each with its
 * spoken line and the pictures to look for). One card is one film.
 *
 *   node local/light-studio.mjs --card cards/antikythera.json
 *   node local/light-studio.mjs --queue cards/queue.json --limit 10
 *   node local/light-studio.mjs --card <card> --skip-render   (run folder only)
 *
 * The daily cap is ten rendered films per UTC day (LIGHT_LIMITS.dailyFilms):
 * the ledger films/light-ledger.json remembers what was made, so a queue of
 * fifty ideas makes ten today and the rest tomorrow. --force ignores the cap
 * for a re-render of a film that already exists.
 *
 * Free is a rule here, not a preference: an unfree picture is skipped rather
 * than used, and a shot with no free picture becomes a text card, which the
 * renderer draws itself.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { shotParts, wikimediaProvider } from "../engine/src/film-media.mjs";
import { say } from "../engine/src/messages.mjs";
import { checkChapter, parseSceneLines } from "../engine/src/scene-lines.mjs";
import { getVersion } from "../engine/src/versions.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** What a light film may be, and how many of them a day may hold. */
export const LIGHT_LIMITS = Object.freeze({ minMinutes: 1, maxMinutes: 15, dailyFilms: 10, maxScenes: 120, maxBeats: 24 });

/** How long a designed card stays up: long enough to read, short enough not to stall. */
export const BEAT_SECONDS = 3;

/**
 * The mean brightness (0-255) below which a picture is a hole in the film, not
 * a night scene. A free deep-space photograph or a broken file measures under
 * ten; a genuinely dark room still measures in the twenties.
 */
export const MIN_PICTURE_LUMA = 22;

/** Words a minute the channel speaks: the clock a card is laid on. */
export const LIGHT_WPM = getVersion("en-US")?.narrationWpm?.target ?? 150;

/**
 * A licence that lets a documentary be published and sold without asking:
 * public domain, CC0, or plain CC BY (credit given). Share-alike would force
 * the film's own licence, non-commercial forbids the platform, and GFDL is
 * not usable for video; those are refused, never "kept for later".
 * @param {string | null | undefined} text
 * @returns {{ id: string, name: string } | null}
 */
export function freeLicence(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return null;
  const t = raw.toLowerCase().replace(/\s+/g, " ");
  if (/\b(nc|non-?commercial)\b|nd\b|no-?deriv/.test(t) && !/^cc0/.test(t)) return null;
  if (/gfdl|free art|fal|fair use|copyright|all rights reserved/.test(t) && !/public domain|copyrighted free use/.test(t)) return null;
  if (/\bsa\b|share-?alike/.test(t)) return null;
  if (/^cc0|^cc-zero|creative commons zero/.test(t)) return { id: "CC0-1.0", name: "CC0 1.0" };
  if (/public domain|^pd\b|pd-/.test(t)) return { id: "PUBLIC-DOMAIN", name: raw.slice(0, 60) };
  if (/^cc[- ]?by\b|creative commons attribution/.test(t) && !/share|non-?commercial/.test(t)) return { id: "CC-BY", name: raw.slice(0, 60) };
  if (/no restrictions|copyrighted free use/.test(t)) return { id: "FREE-WITH-CREDIT", name: raw.slice(0, 60) };
  return null;
}

/**
 * A picture's own brightness (mean luma, 0-255) from the file itself. A free
 * deep-space photograph, a night shot and a broken download all look alike in a
 * search result, and only the file says which one the viewer will see.
 * @param {string} url @param {{ fetch?: typeof fetch, ffmpeg?: string }} [o]
 * @returns {Promise<number | null>} null when the picture cannot be read
 */
export async function pictureLuma(url, o = {}) {
  const fetch_ = o.fetch ?? fetch;
  const ffmpeg = o.ffmpeg ?? "ffmpeg";
  let bytes;
  try {
    const res = await fetch_(url);
    if (!res.ok) return null;
    bytes = Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
  if (!bytes.length) return null;
  return new Promise((ok) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-nostats", "-i", "pipe:0", "-frames:v", "1", "-vf", "signalstats,metadata=print:file=-", "-f", "null", "-"], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", () => ok(null));
    child.on("close", () => {
      const found = /YAVG=([\d.]+)/.exec(out);
      ok(found ? Number(found[1]) : null);
    });
    child.stdin.end(bytes);
  });
}

/** @param {number} s */
export function clockOf(s) {  const tenths = Math.round(Math.max(0, s) * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor(tenths / 600) % 60;
  const rest = (tenths % 600) / 10;
  return `${h}:${String(m).padStart(2, "0")}:${String(rest.toFixed(1)).padStart(4, "0")}`;
}

/** @param {string} t */
export function secondsOf(t) {
  const [h, m, s] = String(t).split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * One card's scenes, checked before anything is written: a card that cannot
 * make a film is refused with its reason, never half-made.
 * @param {any} card
 */
export function checkCard(card) {
  /** @type {string[]} */
  const errors = [];
  if (!card || typeof card !== "object") return { ok: false, errors: ["The card is not an object."] };
  if (typeof card.title !== "string" || card.title.trim().length < 3) errors.push("The card has no title.");
  const minutes = Number(card.minutes ?? 3);
  if (!(minutes >= LIGHT_LIMITS.minMinutes && minutes <= LIGHT_LIMITS.maxMinutes)) errors.push(`minutes must be between ${LIGHT_LIMITS.minMinutes} and ${LIGHT_LIMITS.maxMinutes}.`);
  const scenes = Array.isArray(card.scenes) ? card.scenes : [];
  if (!scenes.length) errors.push("The card has no scenes.");
  if (scenes.length > LIGHT_LIMITS.maxScenes) errors.push(`A card holds at most ${LIGHT_LIMITS.maxScenes} scenes.`);
  scenes.forEach((/** @type {any} */ s, /** @type {number} */ i) => {
    if (typeof s?.narration !== "string" || !s.narration.trim()) errors.push(`Scene ${i + 1} has no narration.`);
    if (s?.shots !== undefined && !Array.isArray(s.shots)) errors.push(`Scene ${i + 1}: shots must be a list of search phrases.`);
  });
  const beats = Array.isArray(card.beats) ? card.beats : [];
  if (beats.length > LIGHT_LIMITS.maxBeats) errors.push(`A card holds at most ${LIGHT_LIMITS.maxBeats} designed beats.`);
  beats.forEach((/** @type {any} */ b, /** @type {number} */ i) => {
    const kind = String(b?.kind ?? "kinetic");
    if (!["counter", "kinetic", "quote"].includes(kind)) errors.push(`Beat ${i + 1}: kind must be counter, kinetic or quote.`);
    if (typeof b?.text !== "string" || !b.text.trim()) errors.push(`Beat ${i + 1} has no text.`);
    if (!(Number(b?.after) >= 1 && Number(b?.after) <= scenes.length)) errors.push(`Beat ${i + 1}: "after" must name one of the card's scenes (1-${scenes.length}).`);
    if (kind === "counter" && !/\d/.test(String(b?.text ?? ""))) errors.push(`Beat ${i + 1}: a counter card needs a number to count up to.`);
  });
  return { ok: errors.length === 0, errors };
}

/**
 * Scene times from the words themselves: each scene gets the share of the film
 * its narration needs at the channel's rate, so the chapter's word budget and
 * clock agree (engine/src/scene-lines.mjs checks exactly this). The last scene
 * absorbs the rounding, so the film ends on its stated length.
 * @param {any[]} scenes @param {number} seconds @param {number} [wpm]
 */
export function sceneTiming(scenes, seconds, wpm = LIGHT_WPM) {
  const words = scenes.map((s) => String(s.narration ?? "").trim().split(/\s+/).filter(Boolean).length);
  const total = words.reduce((a, b) => a + b, 0) || 1;
  // Boundaries sit where the words put them, rounded to a tenth: no drift builds up across scenes.
  const round1 = (/** @type {number} */ n) => Math.round(n * 10) / 10;
  /** @type {{ words: number, start: number, end: number, seconds: number }[]} */
  const out = [];
  let seen = 0;
  let at = 0;
  for (let i = 0; i < scenes.length; i += 1) {
    seen += words[i];
    const end = i === scenes.length - 1 ? seconds : Math.max(round1(at + 0.1), round1((seen / total) * seconds));
    out.push({ words: words[i], start: at, end, seconds: round1(end - at) });
    at = end;
  }
  return out;
}

/**
 * The film as it plays: a title card, the scenes in order, a designed card
 * after any scene the card names, then an optional closing line. These cards
 * are why a light film is an edit and not a slideshow: the critic counts a
 * number that runs up, a line that rises in and a chapter title as designed
 * moments, and a film needs about one a minute.
 * @param {any} card
 * @returns {{ kind: "title" | "closing" | "scene" | "beat", text?: string, seconds?: number, scene?: any, index?: number, beat?: any }[]}
 */
export function programOf(card) {
  /** @type {{ kind: "title" | "closing" | "scene" | "beat", text?: string, seconds?: number, scene?: any, index?: number, beat?: any }[]} */
  const items = [];
  if (card?.title && card.titleCard !== false) items.push({ kind: "title", text: String(card.title), seconds: Number(card.titleSeconds ?? BEAT_SECONDS) });
  const scenes = Array.isArray(card?.scenes) ? card.scenes : [];
  scenes.forEach((scene, i) => {
    items.push({ kind: "scene", scene, index: i });
    for (const beat of (Array.isArray(card?.beats) ? card.beats : []).filter((/** @type {any} */ b) => Number(b?.after) === i + 1)) items.push({ kind: "beat", beat });
  });
  if (card?.closing) items.push({ kind: "closing", text: String(card.closing), seconds: Number(card.closingSeconds ?? BEAT_SECONDS) });
  return items;
}

/**
 * The clock of a whole program: the narration keeps the share the words give
 * it at the channel's rate, and every designed card takes its fixed seconds.
 * @param {{ kind: string, scene?: any, text?: string, seconds?: number }[]} program
 * @param {number} [wpm]
 */
export function programTiming(program, wpm = LIGHT_WPM) {
  const round1 = (/** @type {number} */ n) => Math.round(n * 10) / 10;
  const words = program.map((it) => (it.kind === "scene" ? String(it.scene?.narration ?? "").trim().split(/\s+/).filter(Boolean).length : 0));
  const total = words.reduce((a, b) => a + b, 0) || 1;
  const spoken = round1((total / wpm) * 60);
  let at = 0;
  const timing = program.map((it, i) => {
    const seconds = it.kind === "scene" ? Math.max(0.1, round1((words[i] / total) * spoken)) : Math.max(0.5, round1(Number(it.seconds ?? BEAT_SECONDS)));
    const end = round1(at + seconds);
    const item = { words: words[i], start: at, end, seconds: round1(end - at) };
    at = end;
    return item;
  });
  return { timing, seconds: at, words: total };
}

/**
 * The chapter as the engine writes it: one line per scene, fields separated by
 * " | ", shots as "(1) ...; (2) ...". A shot's phrase is what Commons is asked
 * for, so it is written as a search, not as a sentence. `substitute` rewrites a
 * shot after the search (a shot with no free picture becomes a labelled card).
 * A designed card is wordless and names its effect, so the renderer draws it
 * instead of looking for a photograph that does not exist.
 * @param {any} card @param {{ kind: string, scene?: any, text?: string, seconds?: number, beat?: any }[]} program
 * @param {{ words: number, start: number, end: number }[]} timing
 * @param {(scene: string, shot: number, query: string) => string | null} [substitute]
 */
export function chapterMarkdown(card, program, timing, substitute) {
  const chapter = card.chapter ?? "C1";
  return program.map((item, i) => {
    const t = timing[i];
    const sc = "SC" + String(i + 1).padStart(4, "0");
    if (item.kind !== "scene") {
      const text = String(item.kind === "title" || item.kind === "closing" ? item.text : item.beat?.text ?? "").replace(/["“”]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
      const kind = item.kind === "title" ? "title card" : item.kind === "closing" ? "closing card" : String(item.beat?.kind ?? "kinetic");
      const counter = kind === "counter";
      const fields = [
        `NARR: (wordless)`,
        `W 0/0`,
        `ANCHOR: ${text}`,
        `SHOTS: (1) R1 ${counter ? "counter" : "kinetic"} card "${text}"`,
        `FX: ${counter ? "FX-COUNTER" : "FX-KINETIC"}`,
        `OST: "${text}"`,
        `LOOK: ${card.look ?? "ARCHIVE stills, slow push"}`,
      ];
      return `**${sc}** | ${clockOf(t.start)}-${clockOf(t.end)} | ${chapter} | ${kind} | ${i + 1} | - | ${fields.join(" | ")}`;
    }
    const s = item.scene;
    const anchor = `"${String(s.anchor ?? card.title).replace(/["”]/g, "")}"`;
    // A shot the substitute drops (no free picture) leaves the scene; if none are left, the
    // scene is one labelled card, so no shot is ever blank and no number is skipped.
    const kept = (s.shots ?? [])
      .map((/** @type {string} */ q, /** @type {number} */ k) => (substitute ? substitute(sc, k + 1, q) : q))
      .filter((/** @type {string | null} */ text) => text !== null && text !== "");
    const written = kept.length ? kept : [anchor];
    const shots = written.map((/** @type {string} */ text, /** @type {number} */ k) => `(${k + 1}) ${text}`).join("; ");
    const fields = [
      `NARR: ${String(s.narration).trim()}`,
      `W ${t.words}/${t.words}`,
      `ANCHOR: ${s.anchor ?? card.title}`,
      `SHOTS: ${shots}`,
      `LOOK: ${s.look ?? card.look ?? "ARCHIVE stills, slow push"}`,
    ];
    return `**${sc}** | ${clockOf(t.start)}-${clockOf(t.end)} | ${chapter} | ${s.beat ?? "beat"} | ${i + 1} | - | ${fields.join(" | ")}`;
  }).join("\n");
}

/**
 * The film as a run folder the renderer already reads: film.json,
 * s3-chapters.json and s5-C1.md.
 * @param {any} card @param {{ dir: string, minutes?: number, force?: boolean, log?: (l: string) => void }} o
 */
export function writeRun(card, o) {
  const card_ = checkCard(card);
  if (!card_.ok) throw new Error(card_.errors.join(" "));
  const minutes = Number(card.minutes ?? o.minutes ?? 3);
  // The film is as long as its words are at the channel's rate, plus the seconds its designed cards
  // hold the screen: a clock the words cannot fill is a hole in the film, and the engine's own
  // chapter check refuses it. So the words decide, and the cards take their fixed beats.
  const program = programOf(card);
  const { timing, seconds, words } = programTiming(program, LIGHT_WPM);
  const markdown = chapterMarkdown(card, program, timing);
  mkdirSync(o.dir, { recursive: true });
  const film = {
    id: card.id ?? dirname(o.dir).split("/").pop(),
    topic: card.title,
    durationSeconds: seconds,
    formatId: card.formatId ?? "history",
    contentType: card.contentType ?? "documentary",
    versionId: "en-US",
    voicePreset: card.voicePreset ?? "historical",
    look: card.look,
    light: true,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(join(o.dir, "film.json"), JSON.stringify(film, null, 1));
  writeFileSync(join(o.dir, "s3-chapters.json"), JSON.stringify([{ id: "C1", title: card.chapterTitle ?? card.title, startSeconds: 0, endSeconds: seconds, firstScene: 1, lastScene: program.length }], null, 1));
  writeFileSync(join(o.dir, "s5-C1.md"), markdown + "\n");
  const check = checkChapter(markdown, { startSeconds: 0, endSeconds: seconds, firstScene: 1, lastScene: program.length });
  const scenes = parseSceneLines(markdown);
  // A card that asks for three minutes and writes one is said out loud, never padded or cut.
  const short = seconds < minutes * 60 - 1;
  const designed = program.filter((it) => it.kind !== "scene").length;
  return { dir: o.dir, film, seconds, requestedSeconds: minutes * 60, words, short, timing, program, designed, markdown, scenes, check };
}

/**
 * The best free picture for one shot: the query's words in the title, a wide
 * frame over a tall one, and pixels over thumbnails. Only pictures whose own
 * licence is publishable are considered.
 * @param {any[]} results @param {string} query
 */
/**
 * The query's own words that a picture's title or categories carry. A picture
 * that answers none of them is a different subject, however free it is.
 * @param {any} picture @param {string[]} words
 */
export function matchedWords(picture, words) {
  const text = `${picture?.title ?? ""} ${(picture?.tags ?? []).join(" ")}`.toLowerCase();
  return words.filter((w) => text.includes(w)).length;
}

/**
 * Words worth matching in a query: the small joining words ("the", "with",
 * "ancient") say nothing about the subject a picture shows.
 * @param {string} query
 */
export function queryWords(query) {
  return String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w));
}

/**
 * A word as a title would carry it: lower case, no accents, and c and k read
 * as the same letter (Commons writes "Anticythère" for Antikythera).
 * @param {string} text
 */
export function foldText(text) {
  return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/c/g, "k").replace(/[^a-z0-9]/g, "");
}

/**
 * The word a query stands on: its first real noun ("Antikythera mechanism
 * dial" is an Antikythera picture, whatever else the title says). Six letters
 * are enough to tell one subject from another and few enough to survive a
 * spelling.
 * @param {string} query
 */
export function subjectStem(query) {
  const word = queryWords(query)[0] ?? String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
  const folded = foldText(word);
  return folded.length > 6 ? folded.slice(0, 6) : folded;
}

/** @param {any} picture @param {string} stem */
export function isSubject(picture, stem) {
  if (!stem) return true;
  return foldText(`${picture?.title ?? ""} ${(picture?.tags ?? []).join(" ")}`).includes(stem);
}

/**
 * A picture a documentary can hold: a wide frame (never a banner, never a tall
 * crop the film would have to cut in half) and no page furniture (a paper's
 * figure, a web banner, a diagram with its own labels).
 * @param {any} picture
 */
export function usablePicture(picture) {
  const w = Number(picture?.width) || 0;
  const h = Number(picture?.height) || 0;
  if (!w || !h) return false;
  const aspect = w / h;
  if (aspect < 1.05 || aspect > 2.4) return false;
  const title = String(picture?.title ?? "");
  if (/\bfig(?:ure)?\s*\d|\.html\b|\bbanner\b|\blogo\b|\bschematic\b|\bdiagram\b|\bchart\b|\bclipart\b|\bicon\b/i.test(title)) return false;
  return true;
}

/** Words that appear in half the archive and so prove nothing on their own. */
const STOP = new Set(["with", "from", "that", "this", "their", "there", "ancient", "photo", "photograph", "image", "museum", "library"]);

export function rankPictures(results, query) {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  return results
    .filter((r) => r?.mediaUrl && (r.mediaType ?? "image") === "image")
    .map((r) => {
      const title = String(r.title ?? "").toLowerCase();
      const hits = words.filter((w) => title.includes(w)).length / Math.max(1, words.length);
      const wide = (Number(r.width) || 0) >= (Number(r.height) || 0) ? 1 : 0;
      const pixels = Math.min(1, (Number(r.width) || 0) / 1600);
      return { r, score: hits * 3 + wide + pixels };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.r);
}

/**
 * Every shot's picture, from Commons, in film order. A picture is never used
 * twice inside the repeat window; a shot with nothing free is left to the
 * renderer's text card.
 * @param {{ scenes: any[], seconds: number, program?: any[] }} run @param {any} card
 * @param {{ provider?: any, luma?: (url: string) => Promise<number | null>, log?: (l: string) => void }} [o]
 */
export async function pickMedia(run, card, o = {}) {
  const provider = o.provider ?? wikimediaProvider();
  const luma = o.luma ?? pictureLuma;
  const log = o.log ?? (() => {});
  const used = new Map();
  const windowSeconds = 75;
  /** @type {any[]} */
  const picks = [];
  const credits = [];
  for (const [i, scene] of run.scenes.entries()) {
    // A designed card is drawn by the renderer, not searched for on Commons.
    if (run.program?.[i] && run.program[i].kind !== "scene") continue;
    const queries = shotParts(scene.fields.SHOTS ?? "").length ? shotParts(scene.fields.SHOTS ?? "") : ["archival photograph"];
    for (const [k, query] of queries.entries()) {
      const before = picks.length;
      // A two-word question often finds nothing on Commons, which matches every word; the
      // subject alone finds its family ("Antikythera" for "Antikythera back").
      const subject = String(query).split(/\s+/)[0];
      const attempts = [query, ...(subject && subject !== query ? [subject] : [`${query} photograph`])];
      for (const [attempt, asked] of attempts.entries()) {
        if (picks.length !== before) break;
        let results = [];
        try {
          results = await provider.search(asked, "image");
        } catch (error) {
          log(`  ${scene.sc} shot ${k + 1}: Commons did not answer (${error instanceof Error ? error.message.slice(0, 80) : error})`);
          continue;
        }
        const stem = subjectStem(query);
        for (const picture of rankPictures(results, query)) {
          const licence = freeLicence(picture.license);
          if (!licence) continue;
          // A big enough frame, no page furniture, and a picture of the subject the query names.
          if ((Number(picture.width) || 0) < 1000) continue;
          if (!usablePicture(picture)) continue;
          if (!isSubject(picture, stem)) continue;
          // A black picture is a hole in the film however free it is: a deep-space photo measured 8/255 and
          // held the screen for five seconds in the first real film. Brightness is read from the file.
          const brightness = await luma(picture.mediaUrl);
          if (brightness !== null && brightness < MIN_PICTURE_LUMA) {
            log(`  ${scene.sc} shot ${k + 1}: "${picture.title}" is too dark (${Math.round(brightness)}/255); the next one is tried.`);
            continue;
          }
          const last = used.get(picture.id);
          if (last !== undefined && Math.abs(run.scenes[i].start - last) < windowSeconds) continue;
          used.set(picture.id, run.scenes[i].start);
          picks.push({ scene: scene.sc, shot: k + 1, pick: { id: picture.id, kind: "image", mediaUrl: picture.mediaUrl, sourcePageUrl: picture.sourcePageUrl, title: picture.title, creator: picture.creator, licence, durationSeconds: null, width: picture.width, height: picture.height } });
          credits.push({ scene: scene.sc, shot: k + 1, title: picture.title, creator: picture.creator ?? "unknown", page: picture.sourcePageUrl, licence: licence.name });
          break;
        }
      }
      if (picks.length === before) log(`  ${scene.sc} shot ${k + 1}: no free picture for "${query}"; a text card stands in.`);
    }
  }
  return { media: { chapter: "C1", providers: ["wikimedia"], repeatWindowSeconds: windowSeconds, shots: picks, stats: { shots: picks.length, found: picks.length, missing: 0 } }, credits };
}

/** The credits page beside the film: who made each picture, and under what licence. */
export function creditsMarkdown(card, credits) {
  const lines = [`# ${card.title} — picture credits`, "", "Every picture below is free to publish and sell: public domain, CC0 or plain CC-BY. Share-alike, non-commercial and GFDL files are refused by the light studio, never used.", ""];
  for (const c of credits) lines.push(`- **${c.scene} shot ${c.shot}** — ${c.title} · ${c.creator} · ${c.licence} · ${c.page}`);
  lines.push("", "Narration: Zupona Narrator (Kokoro-82M, Apache-2.0). Score and sound design: synthesised by the Zupona renderer.");
  return lines.join("\n") + "\n";
}

/**
 * The films made today (UTC), from the ledger: the daily cap counts what was
 * really rendered, never what was queued.
 * @param {{ at: string, status?: string }[]} ledger @param {Date} [now]
 */
export function madeToday(ledger, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  return ledger.filter((e) => String(e.at ?? "").slice(0, 10) === day && (e.status ?? "rendered") === "rendered");
}

/**
 * The ledger of light films: one line per film, appended, never rewritten.
 * @param {string} file
 */
export function readLedger(file) {
  if (!existsSync(file)) return [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** @param {string} file @param {any} entry */
export function addLedger(file, entry) {
  const ledger = readLedger(file);
  ledger.push(entry);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(ledger, null, 1));
  return ledger;
}

/**
 * One command, waited for, with its output passed through.
 * @param {string} command @param {string[]} argv
 */
export function runCommand(command, argv) {
  return new Promise((ok, fail) => {
    const child = spawn(command, argv, { cwd: ROOT, stdio: ["ignore", "inherit", "inherit"] });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok(undefined) : fail(new Error(`${command} failed (${code}): ${argv.join(" ")}`))));
  });
}

/**
 * One card to one film: run folder, pictures, voice, MP4, credits.
 * @param {any} card
 * @param {{ out?: string, render?: boolean, python?: string, models?: string, width?: number, height?: number, fps?: number, font?: string, graphics?: boolean, log?: (l: string) => void, exec?: (c: string, a: string[]) => Promise<void>, provider?: any, luma?: (url: string) => Promise<number | null> }} [o]
 */
export async function makeFilm(card, o = {}) {
  const log = o.log ?? (() => {});
  const exec = o.exec ?? runCommand;
  const slug = String(card.id ?? card.title).toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "film";
  const dir = resolve(o.out ?? join(ROOT, "films", slug));
  const run = writeRun({ ...card, id: card.id ?? slug }, { dir, log });
  log(`run folder: ${dir} (${run.scenes.length} scenes, ${run.words} words, ${run.seconds} s, ${run.designed} designed cards)`);
  if (run.short) log(`  ${say({ code: "light.short", params: { seconds: run.seconds, wanted: Math.round(run.requestedSeconds) } })}`);
  for (const e of run.check.errors) log(`  script check: ${e.scene ?? ""} ${e.code}: ${e.detail}`);
  writeFileSync(join(dir, "script-check.json"), JSON.stringify(run.check, null, 1));

  const { media, credits } = await pickMedia(run, card, { provider: o.provider, luma: o.luma, log });
  writeFileSync(join(dir, "media-C1.json"), JSON.stringify(media, null, 1));
  // A shot with no free picture is a labelled card, not a blank frame: the scene's own anchor is
  // what the viewer sees, in quotes, so the renderer draws a card with words on it.
  const have = new Set(media.shots.map((s) => `${s.scene}#${s.shot}`));
  const substitute = chapterMarkdown(card, run.program, run.timing, (scene, shot, query) => (have.has(`${scene}#${shot}`) ? query : null));
  if (substitute !== run.markdown) writeFileSync(join(dir, "s5-C1.md"), substitute + "\n");
  writeFileSync(join(dir, "CREDITS.md"), creditsMarkdown(card, credits));
  log(`pictures: ${media.shots.length} of ${run.scenes.reduce((n, s) => n + shotParts(s.fields.SHOTS ?? "").length, 0)} shots from Commons`);
  if (o.render === false) return { dir, media, credits, rendered: false, seconds: run.seconds };

  const voiceDir = join(dir, "voice");
  await exec(process.execPath, [join(ROOT, "render/narrate.mjs"), "--run", dir, "--out", voiceDir, "--preset", card.voicePreset ?? "historical", "--python", o.python ?? "python3", ...(o.models ? ["--models", o.models] : [])]);
  const out = join(dir, "film.mp4");
  await exec(process.execPath, [join(ROOT, "render/render-film.mjs"), "--run", dir, "--voice", voiceDir, "--out", out, "--width", String(o.width ?? 1280), "--height", String(o.height ?? 720), "--fps", String(o.fps ?? 30), ...(o.font ? ["--font", o.font] : []), ...(o.graphics === false ? ["--no-graphics"] : [])]);
  return { dir, out, media, credits, rendered: true, seconds: run.seconds };
}

/**
 * A queue of cards, under the daily cap: what is left of today's ten, in the
 * order the queue gives them.
 * @param {any[]} cards @param {{ dir?: string, limit?: number, force?: boolean, log?: (l: string) => void, exec?: (c: string, a: string[]) => Promise<void>, provider?: any, luma?: (url: string) => Promise<number | null>, now?: Date, python?: string, models?: string, width?: number, height?: number, fps?: number, font?: string, graphics?: boolean, render?: boolean }} [o]
 */
export async function makeQueue(cards, o = {}) {
  const log = o.log ?? (() => {});
  const filmsDir = resolve(o.dir ?? join(ROOT, "films"));
  const ledgerFile = join(filmsDir, "light-ledger.json");
  const made = madeToday(readLedger(ledgerFile), o.now ?? new Date());
  const left = o.force ? Infinity : Math.max(0, LIGHT_LIMITS.dailyFilms - made.length);
  const limit = Math.min(Number(o.limit ?? LIGHT_LIMITS.dailyFilms), left);
  const done = [];
  if (!limit) {
    log(say({ code: "light.capReached", params: { made: made.length, cap: LIGHT_LIMITS.dailyFilms } }));
    return { done, left: 0 };
  }
  for (const card of cards.slice(0, limit)) {
    log(say({ code: "light.filmStarted", params: { title: card.title } }));
    try {
      const made_ = await makeFilm(card, { ...o, log: (l) => log(`  ${l}`) });
      addLedger(ledgerFile, { at: new Date().toISOString(), id: card.id ?? card.title, out: made_.out ?? made_.dir, seconds: made_.seconds ?? Number(card.minutes ?? 3) * 60, status: made_.rendered ? "rendered" : "run-folder", pictures: made_.media.shots.length });
      done.push({ card: card.title, ...made_ });
      log(say({ code: "light.filmDone", params: { title: card.title, pictures: made_.media.shots.length } }));
    } catch (error) {
      addLedger(ledgerFile, { at: new Date().toISOString(), id: card.id ?? card.title, status: "failed", error: String(error instanceof Error ? error.message : error).slice(0, 400) });
      log(say({ code: "light.filmFailed", params: { title: card.title, error: String(error instanceof Error ? error.message : error).slice(0, 300) } }));
    }
  }
  return { done, left: Math.max(0, limit - done.length) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      card: { type: "string" }, queue: { type: "string" }, out: { type: "string" }, limit: { type: "string" },
      width: { type: "string" }, height: { type: "string" }, fps: { type: "string" }, font: { type: "string" },
      python: { type: "string" }, models: { type: "string" }, "skip-render": { type: "boolean" }, "no-graphics": { type: "boolean" }, force: { type: "boolean" },
    },
  });
  const log = (/** @type {string} */ line) => console.log(line);
  const shared = { python: values.python, models: values.models, width: Number(values.width ?? 1280), height: Number(values.height ?? 720), fps: Number(values.fps ?? 30), font: values.font, graphics: values["no-graphics"] !== true, render: values["skip-render"] !== true, force: values.force === true, log };
  if (values.card) {
    const card = JSON.parse(readFileSync(resolve(values.card), "utf8"));
    const made = await makeFilm(card, { ...shared, out: values.out ? resolve(values.out) : undefined });
    console.log(made.rendered ? `film: ${made.out}` : `run folder: ${made.dir}`);
  } else if (values.queue) {
    const data = JSON.parse(readFileSync(resolve(values.queue), "utf8"));
    // A queue holds cards, or the paths of card files, so ten ideas are ten small files.
    const cards = (Array.isArray(data) ? data : data.films ?? []).map((/** @type {any} */ c) => (typeof c === "string" ? JSON.parse(readFileSync(resolve(c), "utf8")) : c));
    const result = await makeQueue(cards, { ...shared, limit: Number(values.limit ?? LIGHT_LIMITS.dailyFilms) });
    console.log(`made ${result.done.length} today; the day's cap allows ${LIGHT_LIMITS.dailyFilms}.`);
  } else {
    console.error("Usage: node local/light-studio.mjs (--card <card.json> | --queue <queue.json>) [--out <folder>] [--limit 10] [--width 1280 --height 720] [--skip-render] [--no-graphics] [--force]");
    process.exit(2);
  }
}
