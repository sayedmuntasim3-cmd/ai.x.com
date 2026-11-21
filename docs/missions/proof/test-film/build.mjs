// Build the test run (s3-chapters.json, s5-C1.md, media-C1.json) from the hand-checked shot list.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
const [dir, out] = process.argv.slice(2);
const shots = JSON.parse(readFileSync(`${dir}/shots.json`, "utf8"));
const cands = JSON.parse(readFileSync(`${dir}/cands.json`, "utf8"));
const picks = JSON.parse(readFileSync(`${dir}/picks.json`, "utf8"));
const hms = (t) => { t = Number(t); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = (t % 60).toFixed(3); return `${h}:${String(m).padStart(2, "0")}:${s.padStart(6, "0")}`; };
const lines = [], media = [], plan = [];
let n = 0;
for (const [i, s] of shots.entries()) {
  const [a, b, sentence, kind, q] = s;
  if (kind === "skip") continue;
  n += 1;
  const sc = `SC${String(n).padStart(4, "0")}`;
  let SHOTS, FX = "";
  if (kind === "card") {
    if (/FX-KINETIC/.test(q)) FX = "FX-KINETIC";
    if (/FX-COUNTER/.test(q)) FX = "FX-COUNTER";
    SHOTS = `(1) R1 ${q.replace(/FX-KINETIC |FX-COUNTER /, "")}`;
    plan.push({ i, sc, a, b, sentence, card: q });
  } else {
    const [ci, ck] = picks[i].split(".");
    const h = cands[ci][ck];
    SHOTS = `(1) R3 stock video: ${h.tags}`;
    media.push({ scene: sc, shot: 1, start: Number(a), end: Number(b), rung: "R3", description: h.tags, queries: [h.q], status: "found", query: h.q, pick: { kind: "video", mediaUrl: h.url, sourcePageUrl: h.page, durationSeconds: h.dur, width: h.w, height: h.h, provider: "pixabay", title: h.tags, licence: { name: "Pixabay Content License" } }, alternates: [], trace: [] });
    plan.push({ i, sc, a, b, sentence, pick: picks[i], id: h.id, tags: h.tags, page: h.page, thumb: h.thumb });
  }
  lines.push(`**${sc}** | ${hms(a)}-${hms(b)} | C1 | BEAT | SLOT | CLAIMS | NARR: ${sentence} | SHOTS: ${SHOTS}${FX ? ` | FX: ${FX}` : ""}`);
}
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/s3-chapters.json`, JSON.stringify([{ id: "C1", title: "" }]));
writeFileSync(`${out}/s5-C1.md`, lines.join("\n") + "\n");
writeFileSync(`${out}/media-C1.json`, JSON.stringify({ chapter: "C1", providers: ["pixabay"], repeatWindowSeconds: 600, shots: media }, null, 1));
writeFileSync(`${dir}/plan.json`, JSON.stringify(plan, null, 1));
console.log(lines.length, "scenes,", media.length, "video");
