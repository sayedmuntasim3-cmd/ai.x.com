// Renders a short sample of every template and a contact sheet of frames from each, for checking by eye:
// node render/graphics/samples.mjs <out dir>
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { renderGraphic, loadPlaywright } from "./render-graphic.mjs";

export const SAMPLES = /** @type {const} */ ([
  ["kinetic", { text: "The river that built an empire also buried it" }],
  ["counter", { before: "By 1850, the city held", value: 2300000, after: "people", label: "London census" }],
  ["lowerThird", { name: "Isambard Kingdom Brunel", role: "Engineer, Great Western Railway" }],
  ["quote", { quote: "I have not failed. I've just found ten thousand ways that won't work.", by: "Thomas Edison" }],
  ["chapter", { number: 2, title: "The Long Winter" }],
  ["timeline", { title: "The race to the Pole", items: [{ year: 1897, label: "Belgica sails south" }, { year: 1901, label: "Discovery expedition" }, { year: 1907, label: "Nimrod reaches 88°S" }, { year: 1911, label: "Amundsen at the Pole" }], active: 3 }],
  ["document", { masthead: "The Evening Record", date: "Tuesday, 15 April 1912", headline: "Liner Sinks After Striking Iceberg", text: "The ship went down at 2.20 a.m. Of the 2,224 people on board, more than 1,500 were lost in the freezing water of the North Atlantic.", highlight: "more than 1,500 were lost" }],
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? "graphics-samples";
  mkdirSync(dir, { recursive: true });
  const browser = await loadPlaywright().chromium.launch();
  for (const [name, data] of SAMPLES) {
    const t0 = Date.now();
    const out = join(dir, `${name}.${name === "lowerThird" ? "mov" : "mp4"}`);
    const r = await renderGraphic({ template: name, data, out, browser });
    // Frames at 15 %, 45 % and 85 % of the sample, side by side (alpha laid on a grey checker so it shows).
    const sheet = join(dir, `${name}-frames.jpg`);
    const pick = [0.15, 0.45, 0.85].map((f) => Math.round(f * r.frames));
    const bg = name === "lowerThird" ? "[0]format=yuva444p10le[a];color=0x556070:s=1920x1080[g];[g][a]overlay=shortest=1," : "[0]";
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", out, "-filter_complex", `${bg}select='${pick.map((n) => `eq(n\\,${n})`).join("+")}',scale=640:-2,tile=3x1`, "-frames:v", "1", "-vsync", "vfr", sheet]);
    console.log(`${name}: ${r.frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)} s -> ${out}`);
  }
  await browser.close();
}
