/**
 * Speech-to-text results in one shape, whatever made them:
 *   { language, engine, model, modelVersion, source, estimated, words: [{ text, start, end, confidence }] }
 * Read from: our own transcribe.py (faster-whisper or pocketsphinx), Whisper
 * JSON (openai-whisper / faster-whisper with word timestamps), ElevenLabs
 * speech-to-text (words) or text-to-speech alignment (characters), SRT and
 * WebVTT. Subtitle files have times per line only: word times inside a line
 * are spread by length and the transcript is marked estimated.
 * Nothing here changes a word: text is trimmed, never corrected.
 */
import { msg } from "./messages.mjs";

/** @typedef {{ text: string, start: number, end: number, confidence: number | null }} Word */
/** @typedef {{ language: string | null, engine: string, model: string | null, modelVersion: string | null, source: string, estimated: boolean, words: Word[] }} Transcript */

/** @param {number} n */
const r3 = (n) => Math.round(n * 1000) / 1000;
/** @param {unknown} x */
const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : Number.NaN);

/**
 * @param {string | object} raw file contents (text) or parsed JSON
 * @param {{ format?: "auto" | "zupona" | "whisper" | "elevenlabs" | "srt" | "vtt", name?: string }} [o]
 * @returns {Transcript}
 */
export function normalizeTranscript(raw, o = {}) {
  let format = o.format ?? "auto";
  /** @type {any} */
  let data = raw;
  if (typeof raw === "string") {
    const text = raw.replace(/^﻿/, "");
    if (/^\s*[{[]/.test(text)) data = JSON.parse(text);
    else {
      if (format === "auto") format = /^\s*WEBVTT/.test(text) || /\.vtt$/i.test(o.name ?? "") ? "vtt" : "srt";
      return fromCues(parseCues(text), format);
    }
  }
  if (format === "auto") format = detectJson(data);
  if (format === "zupona") return fromZupona(data);
  if (format === "whisper") return fromWhisper(data);
  if (format === "elevenlabs") return fromElevenLabs(data);
  throw new Error("This transcript format is not known: give Whisper JSON, ElevenLabs JSON, SRT or VTT.");
}

/** @param {any} d */
function detectJson(d) {
  if (d && Array.isArray(d.words) && typeof d.engine === "string") return "zupona";
  if (d && Array.isArray(d.segments)) return "whisper";
  if (d && (d.alignment || d.normalized_alignment || (Array.isArray(d.words) && "language_code" in d))) return "elevenlabs";
  if (d && Array.isArray(d.words)) return "elevenlabs";
  throw new Error("This transcript format is not known: give Whisper JSON, ElevenLabs JSON, SRT or VTT.");
}

/** @param {any} w @returns {Word | null} */
function word(w, text = w.text ?? w.word, confidence = w.confidence ?? w.probability ?? null) {
  const t = String(text ?? "").trim();
  const start = num(w.start);
  const end = num(w.end);
  if (!t || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  return { text: t, start: r3(start), end: r3(Math.max(start, end)), confidence: typeof confidence === "number" ? Math.round(confidence * 1000) / 1000 : null };
}

/** Our own transcribe.py output. @param {any} d @returns {Transcript} */
function fromZupona(d) {
  return {
    language: d.language ?? null,
    engine: d.engine,
    model: d.model ?? null,
    modelVersion: d.modelVersion ?? null,
    source: "transcribe.py",
    estimated: false,
    words: d.words.map((/** @type {any} */ w) => word(w)).filter(Boolean),
  };
}

/** Whisper JSON with word timestamps. @param {any} d @returns {Transcript} */
function fromWhisper(d) {
  /** @type {Word[]} */
  const words = [];
  let estimated = false;
  for (const s of d.segments) {
    if (Array.isArray(s.words) && s.words.length) for (const w of s.words) { const x = word(w); if (x) words.push(x); }
    else { estimated = true; words.push(...spread(String(s.text ?? ""), num(s.start), num(s.end))); }
  }
  return { language: d.language ?? null, engine: "whisper", model: d.model ?? null, modelVersion: d.modelVersion ?? null, source: "whisper-json", estimated, words };
}

/**
 * ElevenLabs: speech-to-text gives words (and "spacing" / "audio_event"
 * items, which are left out); text-to-speech with timestamps gives one time
 * per character, which is grouped into words at spaces.
 * @param {any} d @returns {Transcript}
 */
function fromElevenLabs(d) {
  const base = { language: d.language_code ?? null, engine: "elevenlabs", model: d.model_id ?? null, modelVersion: null, estimated: false };
  if (Array.isArray(d.words)) {
    const words = d.words
      .filter((/** @type {any} */ w) => (w.type ?? "word") === "word")
      .map((/** @type {any} */ w) => word(w, w.text, typeof w.logprob === "number" ? Math.exp(w.logprob) : null))
      .filter(Boolean);
    return { ...base, source: "elevenlabs-stt", words: /** @type {Word[]} */ (words) };
  }
  const a = d.alignment ?? d.normalized_alignment;
  const chars = a?.characters ?? [];
  const starts = a?.character_start_times_seconds ?? [];
  const ends = a?.character_end_times_seconds ?? [];
  /** @type {Word[]} */
  const words = [];
  /** @type {{ text: string, start: number, end: number } | null} */
  let cur = null;
  for (let i = 0; i < chars.length; i += 1) {
    if (/\s/.test(chars[i])) { if (cur) words.push(/** @type {Word} */ (word(cur, cur.text, null))); cur = null; continue; }
    if (!cur) cur = { text: "", start: num(starts[i]), end: num(ends[i]) };
    cur.text += chars[i];
    cur.end = num(ends[i]);
  }
  if (cur) words.push(/** @type {Word} */ (word(cur, cur.text, null)));
  return { ...base, source: "elevenlabs-alignment", words: words.filter(Boolean) };
}

/** @param {string} t "00:01:02,345" or "01:02.345" */
function clockSeconds(t) {
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(t.trim());
  if (!m) return Number.NaN;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

/** SRT or VTT cues. @param {string} text */
export function parseCues(text) {
  /** @type {{ start: number, end: number, text: string }[]} */
  const cues = [];
  for (const block of text.replace(/\r/g, "").split(/\n\s*\n/)) {
    const lines = block.split("\n").filter((l) => l.trim());
    const at = lines.findIndex((l) => l.includes("-->"));
    if (at < 0) continue;
    const [a, b] = lines[at].split("-->");
    const start = clockSeconds(a);
    const end = clockSeconds(b.trim().split(/\s+/)[0]);
    const body = lines.slice(at + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\{\\[^}]*\}/g, "").trim();
    if (Number.isFinite(start) && Number.isFinite(end) && body) cues.push({ start, end, text: body });
  }
  return cues;
}

/** Spread a line's words over its time by length. @param {string} text @param {number} start @param {number} end */
function spread(text, start, end) {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  let at = start;
  return parts.map((p) => {
    const d = ((p.length + 1) / total) * (end - start);
    const w = { text: p, start: r3(at), end: r3(at + d * 0.9), confidence: null };
    at += d;
    return w;
  });
}

/** @param {{ start: number, end: number, text: string }[]} cues @param {string} format @returns {Transcript} */
function fromCues(cues, format) {
  return { language: null, engine: format, model: null, modelVersion: null, source: format, estimated: true, words: cues.flatMap((c) => spread(c.text, c.start, c.end)) };
}

/**
 * Check a transcript against the recording. Words are never changed or
 * dropped for being odd; only times are held inside the recording.
 * @param {Transcript} t @param {number} totalSeconds
 */
export function checkTranscript(t, totalSeconds) {
  const messages = [];
  /** @type {string[]} */
  const problems = [];
  let bad = 0;
  let last = 0;
  const words = t.words.map((w) => {
    let { start, end } = w;
    if (start < last - 0.05 || end > totalSeconds + 0.25) bad += 1;
    start = Math.min(Math.max(start, 0), totalSeconds);
    end = Math.min(Math.max(end, start), totalSeconds);
    last = Math.max(last, end);
    return { ...w, start: r3(start), end: r3(end) };
  });
  if (!words.length) { messages.push(msg("voice.noWords")); problems.push("no-words"); }
  else messages.push(msg("voice.words", { count: words.length, language: t.language ?? "?", engine: t.engine, model: t.model ?? "" }));
  if (bad) { messages.push(msg("voice.badTimes", { count: bad })); problems.push("bad-times"); }
  const al = /** @type {any} */ (t).alignment;
  if (al) messages.push(msg("voice.wordsAligned", { share: Math.round(al.matchShare * 100) }));
  else if (t.estimated) messages.push(msg("voice.wordsEstimated"));
  const scored = words.filter((w) => w.confidence !== null);
  const low = scored.filter((w) => /** @type {number} */ (w.confidence) < 0.5).length;
  const share = scored.length ? Math.round((low / scored.length) * 100) : 0;
  if (share >= 15) messages.push(msg("voice.lowConfidence", { share }));
  return { ok: words.length > 0 && bad <= Math.max(2, words.length * 0.02), words, messages, problems, lowConfidenceShare: share / 100 };
}

/** Words compared without case or punctuation. @param {string} s */
const key = (s) => s.toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

/** Levenshtein similarity 0..1. @param {string} a @param {string} b */
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    for (let j = 1; j <= b.length; j += 1) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

/**
 * The owner's own script, timed by what speech-to-text heard. The words come
 * from the script, exactly as written; only the times come from the
 * recogniser, so a weak recogniser can still time a film correctly. A
 * banded alignment pairs script words with heard words (same word, or a
 * near spelling); a script word with no heard partner gets its time by
 * length between the nearest timed neighbours and is marked so.
 * @param {string} script @param {Transcript} heard
 */
export function alignScript(script, heard) {
  const words = String(script).normalize("NFC").split(/\s+/).filter((w) => key(w));
  const hw = heard.words;
  const n = words.length;
  const m = hw.length;
  const base = { language: heard.language, engine: heard.engine, model: heard.model, modelVersion: heard.modelVersion, source: "script+" + heard.source };
  if (!n || !m) return { ...base, estimated: true, words: [], alignment: { heard: 0, near: 0, placed: n, matchShare: 0 } };
  const a = words.map(key);
  const b = hw.map((w) => key(w.text));
  const band = Math.max(60, Math.abs(n - m) + 40);
  const W = 2 * band + 1;
  const NEG = -1e9;
  // score[i][j] over a band around the diagonal; move: 1 pair, 2 skip script word, 3 skip heard word.
  const score = new Float64Array((n + 1) * W).fill(NEG);
  const move = new Uint8Array((n + 1) * W);
  const centre = (/** @type {number} */ i) => Math.round((i * m) / n);
  const at = (/** @type {number} */ i, /** @type {number} */ j) => { const d = j - centre(i) + band; return d >= 0 && d < W ? i * W + d : -1; };
  /** @type {Map<number, number>} */
  const simCache = new Map();
  const sim = (/** @type {number} */ i, /** @type {number} */ j) => {
    const k = i * (m + 1) + j;
    let s = simCache.get(k);
    // A near spelling counts only for words of 3+ letters: "a" and "ah" are not the same word.
    if (s === undefined) { s = a[i] === b[j] ? 1 : Math.min(a[i].length, b[j].length) >= 3 && similarity(a[i], b[j]) >= 0.6 ? 0.6 : 0; simCache.set(k, s); }
    return s;
  };
  for (let i = 0; i <= n; i += 1) {
    const c = centre(i);
    for (let j = Math.max(0, c - band); j <= Math.min(m, c + band); j += 1) {
      const here = at(i, j);
      if (i === 0 && j === 0) { score[here] = 0; continue; }
      let best = NEG;
      let mv = 0;
      if (i > 0 && j > 0) {
        const p = at(i - 1, j - 1);
        if (p >= 0 && score[p] > NEG) { const s = sim(i - 1, j - 1); const v = score[p] + (s === 1 ? (a[i - 1].length >= 3 ? 2 : 0.6) : s > 0 ? 0.8 : -1); if (v > best) { best = v; mv = 1; } }
      }
      if (i > 0) { const p = at(i - 1, j); if (p >= 0 && score[p] > NEG && score[p] - 1 > best) { best = score[p] - 1; mv = 2; } }
      if (j > 0) { const p = at(i, j - 1); if (p >= 0 && score[p] > NEG && score[p] - 1 > best) { best = score[p] - 1; mv = 3; } }
      score[here] = best;
      move[here] = mv;
    }
  }
  /** @type {(null | { start: number, end: number, kind: "heard" | "near", j: number })[]} */
  const times = new Array(n).fill(null);
  let i = n;
  let j = m;
  if (at(n, m) < 0 || score[at(n, m)] <= NEG) j = Math.min(m, centre(n) + band);
  while (i > 0 && j >= 0) {
    const here = at(i, j);
    const mv = here >= 0 ? move[here] : 2;
    if (mv === 1) {
      const s = sim(i - 1, j - 1);
      if (s >= 0.5) times[i - 1] = { start: hw[j - 1].start, end: hw[j - 1].end, kind: s === 1 ? "heard" : "near", j: j - 1 };
      i -= 1; j -= 1;
    } else if (mv === 3) j -= 1;
    else i -= 1;
  }
  // A short word ("a", "or", "we") matched alone is as likely chance as truth:
  // it is a time anchor only when a neighbour matched the neighbouring heard word.
  const lone = times.map((t, k) => !!t && a[k].length < 3 && !(times[k - 1]?.j === t.j - 1 || times[k + 1]?.j === t.j + 1));
  lone.forEach((x, k) => { if (x) times[k] = null; });
  // Script words with no heard partner are spread by length over the speech
  // heard between their timed neighbours (the recogniser's other words), so
  // they land where someone was speaking, not in a pause; with nothing heard
  // there, over the time between the neighbours.
  /** @type {(Word & { timing: string })[]} */
  const out = [];
  let lastJ = -1;
  for (let k = 0; k < n; ) {
    const tk = times[k];
    if (tk) { out.push({ text: words[k], start: tk.start, end: tk.end, confidence: null, timing: tk.kind }); lastJ = tk.j; k += 1; continue; }
    let e = k;
    while (e < n && !times[e]) e += 1;
    const next = e < n ? times[e] : null;
    const from = k > 0 ? out[k - 1].end : 0;
    const to = next ? next.start : Math.max(from, hw[m - 1].end);
    /** @type {[number, number][]} */
    let spans = [];
    for (let q = lastJ + 1; q < (next ? next.j : m); q += 1) {
      const s0 = Math.max(from, hw[q].start);
      const s1 = Math.min(to, hw[q].end);
      if (s1 > s0) spans.push([s0, s1]);
    }
    if (!spans.length) spans = [[from, Math.max(from, to)]];
    // The silences just after the previous anchor and just before the next one count as pauses too.
    else spans = [[from, from], ...spans, [to, to]];
    for (const t of placeRun(words.slice(k, e), spans)) out.push({ text: words[out.length], ...t, confidence: null, timing: "placed" });
    k = e;
  }
  const heardCount = out.filter((w) => w.timing === "heard").length;
  const near = out.filter((w) => w.timing === "near").length;
  const matchShare = Math.round(((heardCount + near) / n) * 1000) / 1000;
  return { ...base, estimated: matchShare < 0.6, words: out, alignment: { heard: heardCount, near, placed: n - heardCount - near, matchShare } };
}

/**
 * Times for script words with no heard partner. A sentence end inside the
 * run goes to a pause in the heard speech (the pause nearest to where its
 * length puts it); between those points the words are spread by length over
 * the time someone was speaking.
 * @param {string[]} run @param {[number, number][]} spans speech heard, in order
 * @returns {{ start: number, end: number }[]}
 */
function placeRun(run, spans) {
  const lens = run.map((w) => w.length + 1);
  const total = lens.reduce((t, x) => t + x, 0);
  /** @type {[number, number][]} pauses between heard speech */
  const pauses = [];
  for (let q = 1; q < spans.length; q += 1) if (spans[q][0] - spans[q - 1][1] >= 0.25) pauses.push([spans[q - 1][1], spans[q][0]]);
  const t0 = spans[0][0];
  const t1 = spans[spans.length - 1][1];
  /** @type {{ at: number, pause: [number, number] | null }[]} cut after word index `at` */
  const cuts = [];
  let cum = 0;
  let used = -1;
  for (let q = 0; q < run.length - 1; q += 1) {
    cum += lens[q];
    if (!/[.!?…؟]["”')\]]*$/.test(run[q])) continue;
    const want = t0 + (cum / total) * (t1 - t0);
    let best = -1;
    // Sentence breaks are the long pauses: a longer pause wins over a nearer one, within reason.
    const worth = (/** @type {[number, number]} */ x) => x[1] - x[0] - 0.15 * Math.abs((x[0] + x[1]) / 2 - want);
    for (let p = used + 1; p < pauses.length; p += 1) if (best < 0 || worth(pauses[p]) > worth(pauses[best])) best = p;
    if (best >= 0) { cuts.push({ at: q, pause: pauses[best] }); used = best; }
  }
  /** @type {{ start: number, end: number }[]} */
  const out = [];
  let from = 0;
  let begin = t0;
  for (const c of [...cuts, { at: run.length - 1, pause: null }]) {
    const end = c.pause ? c.pause[0] : t1;
    const part = spans.map(([x, y]) => /** @type {[number, number]} */ ([Math.max(x, begin), Math.min(y, end)])).filter(([x, y]) => y > x);
    // Nothing heard in this part: the words take the time from its start, about 0.3 s each, never past its end.
    const use = part.length ? part : [/** @type {[number, number]} */ ([begin, Math.max(begin, Math.min(Math.max(end, begin + 0.3 * (c.at + 1 - from)), t1))])];
    const speech = use.reduce((t, [x, y]) => t + y - x, 0);
    const len = lens.slice(from, c.at + 1).reduce((t, x) => t + x, 0);
    const clockAt = (/** @type {number} */ pos) => { for (const [x, y] of use) { if (pos <= y - x + 1e-9) return x + pos; pos -= y - x; } return use[use.length - 1][1]; };
    let pos = 0;
    for (let q = from; q <= c.at; q += 1) { const d = (lens[q] / len) * speech; out.push({ start: r3(clockAt(pos)), end: r3(clockAt(pos + d)) }); pos += d; }
    from = c.at + 1;
    begin = c.pause ? c.pause[1] : end;
  }
  return out;
}
