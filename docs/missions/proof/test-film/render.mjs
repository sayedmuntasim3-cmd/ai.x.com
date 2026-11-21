// Test driver: main's buildTimeline + renderFilm; the one quote card gets graphicFor's documented `graphic` field.
import { readFileSync } from "node:fs";
import { buildTimeline, captionsFromWords } from "/home/user/ai.x.com/engine/src/timeline.mjs";
import { renderFilm, loadRunFiles } from "/home/user/ai.x.com/render/render-film.mjs";
const [run, voice, words, outFile, work] = process.argv.slice(2);
const chapters = await loadRunFiles({ dir: run });
const timeline = buildTimeline({ chapters, voice: {}, look: "documentary", width: 1280, height: 720, fps: 30, fitVoice: true });
timeline.captions = captionsFromWords(JSON.parse(readFileSync(words, "utf8")).words);
for (const v of timeline.video) if (v.type === "card" && /billionaire barber/i.test(v.text)) v.graphic = { template: "quote", data: { quote: "The billionaire barber", by: "the headlines" } };
console.log(timeline.video.map((v) => `${v.id} ${v.start.toFixed(2)}-${v.end.toFixed(2)} ${v.type}${v.kinetic ? " kinetic" : ""}${v.counter ? " counter" : ""}${v.map ? " map" : ""}${v.split ? " split" : ""} ${v.text || ""}`).join("\n"));
console.log(timeline.notes.join("\n"));
const report = await renderFilm({ timeline, oneTrack: { file: voice }, voice: {}, music: {}, sfx: {}, workDir: work, outFile, log: (l) => console.log(l) });
console.log(JSON.stringify({ ...report, licences: report.licences.length }, null, 1));
