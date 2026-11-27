// Picture-supply audit of a finished film: node local/picture-audit.mjs <film.timeline.json> <film.report.json>
// Prints numbers only: which shots became text cards, where the pictures came from, how many queries were a bare word.
import { readFileSync } from "node:fs";

const [timelinePath, reportPath] = process.argv.slice(2);
if (!timelinePath) { console.error("usage: node local/picture-audit.mjs film.timeline.json [film.report.json]"); process.exit(2); }
const shots = JSON.parse(readFileSync(timelinePath, "utf8")).video;
const report = reportPath ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const pct = (n, d) => `${n} (${d ? Math.round((100 * n) / d) : 0}%)`;
const rung = (s) => /^R\d/.exec(s.brief)?.[0] ?? "-";
const sourceOf = (s) => (/pixabay/.test(s.url ?? "") || /Pixabay/i.test(s.licence ?? "") ? "pixabay" : /pexels/.test(s.url ?? "") ? "pexels" : /wikimedia/.test(s.url ?? "") ? "wikimedia" : /nasa/.test(s.url ?? "") ? "nasa" : /metmuseum/.test(s.url ?? "") ? "met" : /loc\.gov/.test(s.url ?? "") ? "loc" : /archive\.org/.test(s.url ?? "") ? "internet-archive" : s.url ? new URL(s.url).hostname : "none");
const designed = (s) => ["kinetic-type", "title", "quote", "timeline", "stat"].includes(s.shotType);
const needPicture = shots.filter((s) => !designed(s));
const clips = shots.filter((s) => s.type === "clip");
const noClip = needPicture.filter((s) => s.type === "card");
console.log(`shots ${shots.length}; designed text/graphics ${shots.filter(designed).length}; shots that need a picture ${needPicture.length}`);
console.log(`picture found ${pct(clips.length, needPicture.length)}; NO picture (text card stands in) ${pct(noClip.length, needPicture.length)}`);
for (const r of ["R2", "R3"]) {
  const all = needPicture.filter((s) => rung(s) === r);
  console.log(`  ${r}: ${all.length} shots, no picture ${pct(all.filter((s) => s.type === "card").length, all.length)}`);
}
const bare = needPicture.filter((s) => /^R\d\s+[\p{L}'-]+(,\s*\d{4}s?)?$/u.test(s.brief.trim()));
console.log(`shots whose whole brief is one bare word (+ era): ${pct(bare.length, needPicture.length)}; of them without a picture ${pct(bare.filter((s) => s.type === "card").length, bare.length)}`);
const src = {};
for (const s of clips) src[sourceOf(s)] = (src[sourceOf(s)] ?? 0) + 1;
console.log("picture source of the clips:", Object.entries(src).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, clips.length)}`).join(", "));
const history = needPicture.filter((s) => rung(s) === "R2");
console.log(`real-history shots (R2) answered by stock footage: ${pct(history.filter((s) => sourceOf(s) === "pixabay" || sourceOf(s) === "pexels").length, history.length)}`);
if (report) console.log(`renderer warnings: ${report.warnings?.length ?? 0}; critic: ${report.critic?.verdict}; clipsFailed ${report.stats?.clipsFailed}, black ${report.stats?.black}`);
