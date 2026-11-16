import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { MESSAGES } from "../src/messages.mjs";

const SRC = new URL("../src/", import.meta.url);
const ROOT = new URL("../../", import.meta.url);
const modules = readdirSync(SRC).filter((f) => f.endsWith(".mjs"));
const source = (/** @type {string} */ f) => readFileSync(new URL(f, SRC), "utf8");
/** The modules a file imports or re-exports at run time (JSDoc type imports do not count). @param {string} f */
const importsOf = (f) => [...source(f).matchAll(/^(?:import|export)\b[^;]*?\bfrom\s+"([^"]+)"/gm)].map((m) => m[1]);

test("the engine runs in a browser and in Node: it imports only its own modules", () => {
  for (const f of modules) for (const spec of importsOf(f)) assert.match(spec, /^\.\/[a-z0-9-]+\.mjs$/, `${f} imports ${spec}: engine/src may import only engine/src (the studio serves a copy)`);
});

test("the engine's modules import each other without a cycle", () => {
  /** @type {Map<string, string[]>} */
  const deps = new Map(modules.map((f) => [f, importsOf(f).map((s) => s.slice(2))]));
  /** @type {Map<string, "open" | "done">} */
  const mark = new Map();
  /** @param {string} f @param {string[]} path */
  const visit = (f, path) => {
    if (mark.get(f) === "done") return;
    assert.notEqual(mark.get(f), "open", `import cycle: ${[...path, f].join(" -> ")}`);
    mark.set(f, "open");
    for (const d of deps.get(f) ?? []) visit(d, [...path, f]);
    mark.set(f, "done");
  };
  for (const f of modules) visit(f, []);
});

test("every message code the code uses exists in English and Bengali", () => {
  /** @type {Map<string, string>} */
  const used = new Map();
  for (const dir of ["engine/src", "worker", "local", "render", "public/studio"]) {
    for (const f of readdirSync(new URL(`${dir}/`, ROOT))) {
      if (!/\.m?js$/.test(f) || /test/.test(f)) continue;
      const text = readFileSync(new URL(`${dir}/${f}`, ROOT), "utf8");
      for (const m of text.matchAll(/\bmsg\(\s*"([a-zA-Z.]+)"|\bcode:\s*"([a-z]+\.[a-zA-Z.]+)"/g)) used.set(m[1] ?? m[2], `${dir}/${f}`);
    }
  }
  assert.ok(used.size > 50, `found ${used.size} message codes`);
  for (const [code, where] of used) assert.ok(code in MESSAGES, `${where} uses the message ${code}, which messages.mjs does not have`);
});
