import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { GATES_VERSION } from "../engine/src/bossism.mjs";
import { main, probeSeconds } from "./release-gate.mjs";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const blocked = { at: "2026-01-01T00:00:00.000Z", gatesVersion: GATES_VERSION, gates: [{ id: "research", verdict: "block" }, { id: "visual", verdict: "pass" }], release: { allowed: false, blockedBy: ["research"], message: { code: "release.blocked", params: { gates: "research" } } } };

/** @param {Record<string, unknown>} files */
function fakeStudio(files) {
  /** @type {string[]} */
  const asked = [];
  const fetch = /** @type {typeof globalThis.fetch} */ (async (url) => {
    asked.push(String(url));
    const name = String(url).split("/files/")[1];
    return name in files ? Response.json(files[name]) : new Response("Not found", { status: 404 });
  });
  return { fetch, asked };
}

test("before rendering: a blocked film stops the render, in both languages; an owner approval clears it", async () => {
  /** @type {string[]} */
  const out = [];
  const studio = fakeStudio({ "review.json": blocked });
  assert.equal(await main(["--api", "https://ai.zupona.com", "--id", ID], { fetch: studio.fetch, print: (l) => out.push(l) }), 1);
  assert.equal(studio.asked[0], `https://ai.zupona.com/api/films/${ID}/files/review.json`);
  assert.match(out.join("\n"), /Research: blocked\.\nরিসার্চ: আটকে দেওয়া হয়েছে।/);
  assert.match(out.join("\n"), /Release blocked by: Research/);

  out.length = 0;
  const approved = fakeStudio({ "review.json": blocked, "decisions.json": [{ actor: "owner", action: "release-override", at: "2026-02-01T00:00:00.000Z" }] });
  assert.equal(await main(["--api", "https://ai.zupona.com", "--id", ID], { fetch: approved.fetch, print: (l) => out.push(l) }), 0);
  assert.match(out.join("\n"), /Cleared by the owner's approval/);

  out.length = 0;
  const old = { ...blocked, gatesVersion: undefined, release: { allowed: true, blockedBy: [], message: { code: "release.allowed" } } };
  assert.equal(await main(["--api", "https://ai.zupona.com", "--id", ID], { fetch: fakeStudio({ "review.json": old }).fetch, print: (l) => out.push(l) }), 1, "a review by older gates clears nothing");
  assert.match(out.join("\n"), /older version of the checks/);

  out.length = 0;
  assert.equal(await main(["--api", "https://ai.zupona.com", "--id", ID], { fetch: fakeStudio({}).fetch, print: (l) => out.push(l) }), 1, "no review is no clearance");
  assert.equal(await main(["--api", "https://ai.zupona.com", "--id", "../etc"], { print: () => {} }), 1);
});

test("before publishing: the master is measured with ffprobe and compared with the film it should be", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "zupona-gate-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const mp4 = join(dir, `${ID}.mp4`);
  execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:d=2", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "2", "-shortest", "-c:v", "libx264", "-c:a", "aac", mp4]);
  const seconds = await probeSeconds(mp4);
  assert.ok(seconds !== null && Math.abs(seconds - 2) < 0.2, `measured ${seconds}`);
  const report = join(dir, `${ID}.report.json`);
  const good = { durationSeconds: 2, narratedScenes: 0, voicedScenes: 0, master: { integratedLufs: null, truePeakDbtp: -3, black: [] }, warnings: [] };
  writeFileSync(report, JSON.stringify(good));
  assert.equal(await main(["--report", report, "--file", mp4], { print: () => {} }), 0);
  const written = JSON.parse(readFileSync(join(dir, `${ID}.master-gate.json`), "utf8"));
  assert.equal(written.verdict, "pass");
  assert.ok(Math.abs(written.measuredSeconds - 2) < 0.2, "the gate records what it measured");

  writeFileSync(report, JSON.stringify({ ...good, durationSeconds: 600 }));
  /** @type {string[]} */
  const out = [];
  assert.equal(await main(["--report", report, "--file", mp4], { print: (l) => out.push(l) }), 1, "a 2-second file is not a 10-minute film, whatever the report says");
  assert.match(out.join("\n"), /The master runs 2 s; the film should run 600 s\./);
  assert.equal(await main(["--report", join(dir, "missing.report.json")], { print: () => {} }), 1, "no report, no release");
});
