// M1b: builds the per-niche table of docs/research/VIRAL_STUDY.md from the data files + hand-made thumbnail notes (my reading).
// Run: node tools/research/viral-table.mjs  (prints markdown)
import { readFileSync } from "node:fs";
const D = (f) => JSON.parse(readFileSync(new URL(`../../docs/research/data/${f}`, import.meta.url), "utf8"));
const all = new Map();
for (const f of ["owner-links.json", "reference-videos.json", "channel-uploads.json", "viral-handles.json", "viral-candidates.json"]) for (const v of D(f)) all.set(v.id, { ...(all.get(v.id) ?? {}), ...v });
// niche | id | thumbnail note (face / text / colour), my reading from the image
const SEL = `history|_uk_6vfqwTA|cartoon faces, 2 words, red+blue map
history|I79TpDe3t2g|cartoon faces, 3 words, map colours
history|zqllxbPWKNI|cartoon rider, 3 words
history|8qRZcXIODNU|cartoon faces, 3 words
history|Zd88lzCWjpA|no face, no text, dark jet CGI
history|WevXTsed_oc|no face, no text, jet CGI
history|fFEqwaRmDZI|no face, no text, ship CGI
history|VKXQnBlzqzs|real face, 2 words "WORSE THAN HITLER?", red glow on black
history|0UJYYkK4d8s|no face, no text, D-Day photo look; 100 min film
bio|SsGNUn-WI5c|real face (Hitler photo), no text; 91 min film
science|MiUHjLxm3V0|no face, 4 words "This shouldn't exist.", white on black, red underline
science|JsBZOcqZerk|no face, 2 words "We cracked it", red figure for scale
science|NIk_0AW5hFU|no face, 2 words "see ya!", red+blue light beams
science|ujkD4SxPKOI|no face, 3 words "WE LOST CONTROL", red eye, high contrast
science|_y9JuojAIg0|no face, 2 words "LOST FOREVER", clay faces, purple
science|XfGEMCb6BQU|real face (woman, shocked), text "THEY FOUND IT?", cutaway map
space|KqaGdcQh5jA|real face with oxygen mask, number "16,700 ft", clouds+town
space|U9WOMerccoM|no face, "63 Billion LY" tiny, black dot sphere
space|pSHVbLPWA28|no face, 4 words "HOW BIG is the Universe?", black+white
space|Cyl3X88KEgg|no face, "IT'S IMPOSSIBLE*", blue+orange rocket
nature|87Jor5G_NBs|real face, place name "Sơn Đoòng", cave+forest, orange jacket
nature|mJYxSed0D_I|real face, 4 distance numbers + place names, map
nature|wkQuOrsgVGY|no face, no text, Saturn rings
crime|I2O7blSSzpI|no face, title text, cicada, black+red
crime|kd2KEHvK-q8|no face, no text, white plane on pale blue
crime|CbUjuwhQPKs|no face, no text, red falling figure on dark blue
crime|V0folj9X9nQ|distorted face, series name text, red/black
crime|lADBHDg-JtA|no face, no text, knife on top hat, rose, dark
geo|H42zWaD4A4s|real face + rows of tattooed prisoners, no text
geo|l6UtZ-u9CyM|real face + crowd of Hasidic men, no text
geo|pSwucL9cRXQ|real face in press vest, flag, fire, running man, no text
geo|PkU8FTafNQU|real face, grabbing door of temple, red lifejacket
geo|cwczifilQJY|real face, cage-flat grid, no text
geo|D9p6GnDe4aI|real face, 4 words "LIVES LOST ONE AFTER ANOTHER", giant wave
business|tS_fJJxMjn4|real face (Xi), 5 words "THE RISE AND FALL BYD", red on black
motivation|3kuNW8hRc2U|two real faces, 5 words "It Looks Like World War 3", red label`.split("\n").map((l) => l.split("|"));
const dm = (s) => `${Math.round(s / 60)}`;
const rows = {};
for (const [n, id, th] of SEL) {
  const v = all.get(id); if (!v) { console.error("missing", id); continue; }
  const ch = v.chapters ?? [];
  const first = ch[0] ? `${ch.length} ch; 1st "${String(ch[0].title).slice(0, 24)}" ${ch[1] ? "(" + ch[1].at + "s long)" : ""}` : "none";
  (rows[n] ??= []).push(`| [${v.title.replace(/\|/g, "/").slice(0, 58)}](https://youtu.be/${id}) | ${v.channelTitle.slice(0, 18)} | ${(v.views / 1e6).toFixed(1)}M | ${dm(v.durationSeconds)} | ${v.publishedAt.slice(0, 7)} | ${v.title.split(/\s+/).length} | ${/\d/.test(v.title) ? "Y" : ""}${/\?/.test(v.title) ? "?" : ""}${/:/.test(v.title) ? ":" : ""} | ${first} | ${th} |`);
}
for (const [n, r] of Object.entries(rows)) console.log(`\n### ${n}\n| Video | Channel | Views | Min | Date | Title words | Num/?/: | Chapters | Thumbnail (my reading) |\n|---|---|---|---|---|---|---|---|---|\n${r.join("\n")}`);
const sel = SEL.map(([, id]) => all.get(id)).filter(Boolean);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor((s.length - 1) * p)]; };
const mins = sel.map((v) => v.durationSeconds / 60), words = sel.map((v) => v.title.split(/\s+/).length), chars = sel.map((v) => v.title.length);
console.log(`\nN=${sel.length}; views min ${(Math.min(...sel.map((v) => v.views)) / 1e6).toFixed(1)}M, median ${(med(sel.map((v) => v.views)) / 1e6).toFixed(1)}M`);
console.log(`minutes q25/med/q75 ${q(mins, .25).toFixed(0)}/${q(mins, .5).toFixed(0)}/${q(mins, .75).toFixed(0)}; under 20 min ${mins.filter((m) => m < 20).length}; over 40 ${mins.filter((m) => m > 40).length}`);
console.log(`title words q25/med/q75 ${q(words, .25)}/${q(words, .5)}/${q(words, .75)}; chars med ${med(chars)}; with digit ${sel.filter((v) => /\d/.test(v.title)).length}; question ${sel.filter((v) => /\?/.test(v.title)).length}; colon ${sel.filter((v) => /:/.test(v.title)).length}; superlative ${sel.filter((v) => /\b(most|worst|largest|biggest|highest|only|smallest|world'?s|never|deadliest)\b/i.test(v.title)).length}; with chapters ${sel.filter((v) => (v.chapters ?? []).length).length}`);
const t = SEL.map((r) => r[2]);
console.log(`thumb: real face ${t.filter((x) => /real face|faces/.test(x) && !/cartoon/.test(x)).length}; cartoon ${t.filter((x) => /cartoon/.test(x)).length}; no text ${t.filter((x) => /no text|no face, no text/.test(x)).length}; <=5 words text rest`);
