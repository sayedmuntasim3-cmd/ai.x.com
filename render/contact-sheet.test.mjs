import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, existsSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { chaptersOf, HOUSE, labelOf, planReturn, planSheets, renderSheets, scoreMap, weakShots } from "./contact-sheet.mjs";

/** A two-chapter timeline as the renderer builds one (only the fields the sheets read). */
function timeline() {
  const shots = [
    { id: "SC0001-1", scene: "SC0001", shot: 1, start: 0, end: 6, type: "clip", url: "https://stock/a.mp4" },
    { id: "SC0001-2", scene: "SC0001", shot: 2, start: 6, end: 12, type: "clip", url: "https://stock/b.mp4", shotType: "wide" },
    { id: "SC0001-3", scene: "SC0001", shot: 3, start: 12, end: 12.6, type: "clip", url: "https://stock/c.mp4" },
    { id: "SC0002-1", scene: "SC0002", shot: 1, start: 12.6, end: 18, type: "card", text: "", chapterTitle: "Chapter 2 · The deal" },
    { id: "SC0002-2", scene: "SC0002", shot: 2, start: 18, end: 24, type: "clip", url: "https://stock/d.mp4" },
  ];
  return { width: 1920, height: 1080, fps: 30, durationSeconds: 24, video: shots };
}

/** Media files as the eyes write them: a relevance number in `why`, and an off-world prompt on one shot. */
function media() {
  return [{
    chapter: "C1",
    shots: [
      { scene: "SC0001", shot: 1, status: "found", pick: { kind: "video", source: "pexels" }, why: { relevance: 0.31, total: 4.1 } },
      { scene: "SC0001", shot: 2, status: "found", pick: { kind: "video", source: "pixabay" }, why: { relevance: 0.18, total: 2.2, offWhy: "another country (Mexico)" } },
      { scene: "SC0001", shot: 3, status: "found", pick: { kind: "video", source: "pexels" }, why: { relevance: 0.4, total: 4.6 } },
      { scene: "SC0002", shot: 2, status: "found", pick: { kind: "video", source: "internet-archive" }, why: { relevance: 0.33, total: 4.0 } },
    ],
  }];
}

test("a chapter opens on its chapter title, and black is not a shot on a sheet", () => {
  const t = timeline();
  t.video.splice(2, 0, { id: "SC0001-4", scene: "SC0001", shot: 4, start: 12, end: 12, type: "black" });
  const chapters = chaptersOf(t.video);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].id, "C1");
  assert.equal(chapters[1].id, "C2");
  assert.equal(chapters[1].title, "The deal");
  assert.equal(chapters[0].shots.length, 3);
  assert.ok(!chapters[0].shots.some((s) => s.type === "black"));
});

test("a weak shot is named with its reason and the mission it goes back to", () => {
  const plan = planSheets(timeline(), scoreMap(media()));
  const weak = weakShots(plan);
  const byShot = new Map(weak.map((w) => [w.id, w]));

  const lowScore = byShot.get("SC0001-2");
  assert.ok(lowScore, "a shot at 0.18 relevance is weak");
  assert.equal(lowScore.to, "M3");
  const codes = lowScore.reasons.map((r) => r.code);
  assert.ok(codes.includes("sheet.relevance"));
  assert.ok(codes.includes("sheet.offWorld"), "an off-world prompt that won is its own reason");

  const short = byShot.get("SC0001-3");
  assert.equal(short.to, "M4");
  assert.equal(short.reasons[0].code, "sheet.short");

  assert.ok(!byShot.has("SC0002-1"), "a chapter title card is a designed moment, not an empty card");
  assert.ok(!byShot.has("SC0001-1"), "a relevant shot with a picture is not weak");
  assert.ok(!byShot.has("SC0002-2"));
});

test("a card standing in for footage goes back to M3, an empty card to M4", () => {
  const t = timeline();
  t.video.push({ id: "SC0003-1", scene: "SC0003", shot: 1, start: 24, end: 30, type: "card", text: "" });
  const scores = scoreMap([{ shots: [{ scene: "SC0003", shot: 1, status: "missing", pick: null }] }]);
  const withFootage = weakShots(planSheets(t, scores));
  assert.equal(withFootage.find((w) => w.id === "SC0003-1")?.reasons[0].code, "sheet.missing");
  assert.equal(withFootage.find((w) => w.id === "SC0003-1")?.to, "M3");
  const noMedia = weakShots(planSheets(t));
  assert.equal(noMedia.find((w) => w.id === "SC0003-1")?.reasons[0].code, "sheet.card");
  assert.equal(noMedia.find((w) => w.id === "SC0003-1")?.to, "M4");
});

test("a sheet carries the shot type and the score on every tile", () => {
  const plan = planSheets(timeline(), scoreMap(media()));
  const c1 = plan.chapters[0];
  assert.equal(c1.shots.length, 3);
  assert.equal(c1.shots[1].label, "SC0001-2 · wide · 0.18");
  assert.equal(c1.shots[0].label, "SC0001-1 · clip · 0.31");
  assert.equal(c1.shots[2].at, 12.3, "the frame is taken at the shot's midpoint");
  assert.equal(labelOf({ id: "SC0009-1", type: "card", shotType: null, score: null }), "SC0009-1 · card · —");
});

test("a chapter that is mostly stills is sent back as a whole", () => {
  const t = timeline();
  for (const v of t.video) if (v.type === "clip") v.type = "card";
  const plan = planSheets(t);
  const chapter = plan.chapters.find((c) => c.id === "C1");
  assert.ok(chapter.reasons.some((r) => r.code === "sheet.still" && r.to === "M3"));
});

test("a weak shot is bounced at most twice, then it is the Boss's decision", () => {
  const weak = weakShots(planSheets(timeline(), scoreMap(media())));
  const once = planReturn([], weak);
  assert.equal(once.round, 1);
  assert.equal(once.send.length, weak.length);
  assert.equal(once.escalate.length, 0);
  const twice = planReturn([{ ids: once.send.map((w) => w.id) }], weak);
  assert.equal(twice.round, 2);
  assert.equal(twice.escalate.length, 0);
  const thrice = planReturn([{ ids: once.send.map((w) => w.id) }, { ids: once.send.map((w) => w.id) }], weak);
  assert.equal(thrice.escalate.length, weak.length);
  assert.equal(thrice.send.length, 0);
});

test("the sheets are drawn from the film: a grid per chapter with every shot on it", async () => {
  const probe = spawnSync("ffprobe", ["-version"]);
  if (probe.error || probe.status !== 0) return; // no ffmpeg on this machine: the plan tests above still run
  const dir = mkdtempSync(join(tmpdir(), "sheets-"));
  try {
    const film = join(dir, "film.mp4");
    const made = spawnSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=30:duration=4", "-pix_fmt", "yuv420p", film]);
    assert.equal(made.status, 0, String(made.stderr));
    const t = { width: 320, height: 180, fps: 30, durationSeconds: 4, video: [
      { id: "SC0001-1", scene: "SC0001", shot: 1, start: 0, end: 2, type: "clip", url: "https://stock/a.mp4" },
      { id: "SC0001-2", scene: "SC0001", shot: 2, start: 2, end: 4, type: "clip", url: "https://stock/b.mp4", chapterTitle: "Chapter 2 · Turn" },
    ] };
    const plan = planSheets(t);
    const sheets = await renderSheets({ film, plan, outBase: join(dir, "out"), cols: 2, tile: [160, 90] });
    assert.equal(sheets.length, 2);
    for (const s of sheets) {
      assert.ok(existsSync(s.file), `${s.chapter} sheet exists`);
      assert.ok(statSync(s.file).size > 1000, `${s.chapter} sheet has a picture`);
    }
    const info = spawnSync("ffprobe", ["-v", "error", "-show_entries", "stream=width,height", "-of", "csv=p=0", sheets[0].file]);
    const [width, height] = String(info.stdout).trim().split(",").map(Number);
    // Two 160x90 tiles with their caption bars, one padding gap and the outer margin: nothing is cropped out.
    assert.equal(width, 2 * 160 + HOUSE.padding + 2 * HOUSE.margin);
    assert.equal(height, 90 + HOUSE.bar + 2 * HOUSE.margin);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
