// Bundles ../src/client.tsx into ../public/app.js, the script that makes the page interactive.
import { build } from "esbuild";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [resolve(here, "../src/client.tsx")],
  outfile: resolve(here, "../public/app.js"),
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  // ../src has no node_modules of its own; resolve React from this tools folder.
  nodePaths: [resolve(here, "node_modules")],
  define: { "process.env.NODE_ENV": '"production"' },
  legalComments: "none",
  logLevel: "info",
});
