// Copy the engine modules to the studio page, which loads them in the browser
// as they are (Cloudflare serves public/ as static files). The engine test
// "the studio page serves an exact copy of the engine" fails when they differ.
import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";

const src = new URL("../src/", import.meta.url);
const out = new URL("../../public/studio/engine/", import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith(".mjs"));
for (const file of files) copyFileSync(new URL(file, src), new URL(file, out));
console.log("Copied " + files.length + " engine modules to public/studio/engine/");
