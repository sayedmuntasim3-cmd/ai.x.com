import { test } from "node:test";
import assert from "node:assert/strict";
import { MOTION_PROFILES, decideMove, easeExpr, governTransitions, moveFilter, profileFor, sceneIntent, writtenMove } from "../src/motion.mjs";
import { buildTimeline } from "../src/timeline.mjs";

const scene = (/** @type {Partial<{ start: number, narration: string, fields: Record<string, string> }>} */ o = {}) => ({ start: 120, narration: "The town grew.", fields: {}, ...o });

test("the script's MOTION field is a lock: static, pans, tilts, pulls and pushes are kept, slow motion is not a move", () => {
  assert.equal(writtenMove("static, locked-off")?.kind, "hold");
  assert.deepEqual([writtenMove("slow pan left")?.kind, writtenMove("slow pan left")?.dir], ["pan", -1]);
  assert.equal(writtenMove("tilt up the tower")?.dir, -1);
  assert.equal(writtenMove("pull out to reveal the valley")?.kind, "pull");
  assert.equal(writtenMove("1.05x push")?.kind, "push");
  assert.equal(writtenMove("0.5x slow motion"), null);
  assert.ok(writtenMove("pan right")?.locked);
});

test("a scene's purpose is read from the script: hook, tension, reflection, a document, a wide place, a question", () => {
  assert.equal(sceneIntent(scene({ start: 0 })), "hook");
  assert.equal(sceneIntent(scene({ start: 8 })), "plain", "only the opening picture is the hook");
  assert.equal(sceneIntent(scene({ narration: "The bomber was shot down over the sea." })), "tension");
  assert.equal(sceneIntent(scene({ fields: { DELIVERY: "soft, reflective" } })), "reflect");
  assert.equal(sceneIntent(scene(), { shotText: "R2 archive newspaper headline, 1941" }), "read");
  assert.equal(sceneIntent(scene(), { shotText: "R3 aerial wide of the valley" }), "establish");
  assert.equal(sceneIntent(scene({ narration: "So why did nobody stop it?" })), "question");
  assert.equal(sceneIntent(scene(), { chapterOpen: true }), "open");
});

test("each genre has its own motion language: nature pans a wide place calmly, a war film pushes into danger", () => {
  const nature = decideMove({ intent: "establish", seconds: 6, profile: MOTION_PROFILES.nature, level: "calm", previous: [], index: 0 });
  assert.equal(nature.kind, "pan");
  assert.ok(nature.amount <= 0.06);
  const war = decideMove({ intent: "tension", seconds: 6, profile: MOTION_PROFILES.war, level: "dynamic", previous: [], index: 0 });
  assert.equal(war.kind, "push");
  assert.ok(war.amount > nature.amount);
  assert.equal(profileFor({ formatId: "war-battle" }).id, "war");
  assert.equal(profileFor({ formatId: "nope", topic: "The great wildebeest migration" }).id, "nature");
  assert.equal(profileFor({}).id, "documentary");
  // No format: the film's own words decide, so a voiceover gets its genre's motion.
  assert.equal(profileFor({ topic: "Stop Wasting Your Teenage Years: 7 Hard Truths Every Teen Needs to Hear" }).id, "motivation");
  assert.equal(profileFor({ topic: "Wake Island: The Last Stand That Stunned Japan" , text: "The Marines dug in. Japanese bombers came at noon; the pilots of four Wildcats climbed to meet them." }).id, "war");
  assert.equal(profileFor({ text: "Why do cells divide? Step by step, the DNA is copied, and the cell splits in two. Scientists explained it in 1882." }).id, "science");
  assert.equal(profileFor({ text: "It was a quiet morning." }).id, "documentary", "too few cues: the general documentary");
});

test("speed is capped per second, short shots hold, nothing repeats three times, pans alternate, reduced motion holds", () => {
  const p = MOTION_PROFILES.history;
  const short = decideMove({ intent: "plain", seconds: 2, profile: p, level: "balanced", previous: [], index: 0 });
  const long = decideMove({ intent: "plain", seconds: 9, profile: p, level: "balanced", previous: [], index: 0 });
  assert.ok(short.amount < long.amount, "a 2 s shot moves less far than a 9 s one");
  assert.equal(decideMove({ intent: "plain", seconds: 1, profile: p, level: "balanced", previous: [], index: 0 }).kind, "hold");
  const pushes = [{ kind: /** @type {const} */ ("push"), amount: 0.09, dir: /** @type {const} */ (1), ease: /** @type {const} */ ("inOut"), why: "" }];
  const third = decideMove({ intent: "detail", seconds: 6, profile: p, level: "balanced", previous: [pushes[0], pushes[0]], index: 2 });
  assert.notEqual(third.kind, "push");
  const pan1 = decideMove({ intent: "establish", seconds: 6, profile: p, level: "balanced", previous: [], index: 0 });
  const pan2 = decideMove({ intent: "establish", seconds: 6, profile: p, level: "balanced", previous: [pan1], index: 1 });
  assert.equal(pan2.dir, -pan1.dir);
  assert.equal(decideMove({ intent: "tension", seconds: 6, profile: p, level: "reduced", previous: [], index: 0 }).kind, "hold");
  const locked = decideMove({ intent: "tension", seconds: 6, written: writtenMove("static"), profile: MOTION_PROFILES.war, level: "dynamic", previous: [], index: 0 });
  assert.equal(locked.kind, "hold");
  assert.ok(locked.why.includes("script"));
});

test("flashes are rationed, genres that never flash or shake get none, reduced motion removes punch-ins", () => {
  const video = [{ start: 0, transition: "flash" }, { start: 5, transition: "flash" }, { start: 30, transition: "flash", shakes: [1] }, { start: 40, transition: "whip", punchIns: [1] }];
  const war = governTransitions(structuredClone(video), MOTION_PROFILES.war, "dynamic");
  assert.equal(war.flash, 1, "the flash 5 s after another goes");
  const nature = structuredClone(video);
  const n = governTransitions(nature, MOTION_PROFILES.nature, "calm");
  assert.equal(n.flash, 3);
  assert.equal(n.shakes, 1);
  assert.equal(nature[3].transition, "slide", "a calm film slides instead of whipping");
  const reduced = structuredClone(video);
  governTransitions(reduced, MOTION_PROFILES.war, "reduced");
  assert.equal(reduced[3].punchIns, undefined);
});

test("moves are eased and drawn on the plate: push, pull, pans both ways, hold", () => {
  assert.equal(easeExpr("linear", 11), "min(1,on/10)");
  assert.match(easeExpr("inOut", 11), /3-2\*/);
  assert.match(moveFilter({ kind: "push", amount: 0.08, dir: 1, ease: "inOut", why: "" }, 100), /^zoompan=z='1\+0\.08\*\(/);
  assert.match(moveFilter({ kind: "pull", amount: 0.08, dir: 1, ease: "out", why: "" }, 100), /z='1\+0\.08-0\.08\*/);
  assert.match(moveFilter({ kind: "pan", amount: 0.06, dir: -1, ease: "inOut", why: "" }, 100), /x='\(iw-iw\/zoom\)\*\(1-/);
  assert.equal(moveFilter({ kind: "hold", amount: 0, dir: 1, ease: "linear", why: "" }, 100), "zoompan=z='1':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'");
});

test("the timeline gives every still a reasoned move and reports the film's motion", () => {
  const md = [
    `**SC0001** | 0:00:00-0:00:06 | C1 | b | E | C01 | NARR: In 1941 the war came. | W 5/5 | ANCHOR: x | SHOTS: (1) R2 archive photo of the harbour | LOOK: L`,
    `**SC0002** | 0:00:40-0:00:46 | C1 | b | E | C01 | NARR: The ship sank in minutes. | W 5/5 | ANCHOR: x | SHOTS: (1) R2 archive photo of the ship | MOTION: static | LOOK: L`,
  ].join("\n");
  const pick = (/** @type {string} */ sc) => ({ scene: sc, shot: 1, start: 0, end: 6, rung: "R2", description: "", queries: [], status: "found", query: "", alternates: [], trace: [], pick: { id: sc, source: "wikimedia", kind: "image", mediaUrl: `https://x/${sc}.jpg`, previewUrl: null, sourcePageUrl: "https://x", creator: null, durationSeconds: 0, width: 1600, height: 1000, licence: { licenseId: "CC0", name: "CC0", licenseUrl: null, attributionRequired: false, creator: null, sourcePageUrl: "https://x" } } });
  const media = /** @type {any} */ ({ chapter: "C1", providers: [], repeatWindowSeconds: 600, stats: {}, shots: [pick("SC0001"), pick("SC0002")] });
  const t = buildTimeline({ chapters: [{ id: "C1", markdown: md, media }], motionProfile: MOTION_PROFILES.war });
  const [a, b] = t.video.filter((v) => v.still);
  assert.equal(a.move?.kind, "push", "the hook pushes in");
  assert.equal(b.move?.kind, "hold", "the script's static is kept");
  assert.equal(t.motion?.profile, "war");
  assert.equal(t.motion?.locked, 1);
});

test("a film keeps the owner's picture motion; an unknown level is refused", async () => {
  const { newFilm } = await import("../src/film-run.mjs");
  const ok = newFilm({ topic: "Apollo 11", minutes: 3, motionLevel: "reduced" }, "id1");
  assert.equal(ok.ok && ok.film.motionLevel, "reduced");
  const auto = newFilm({ topic: "Apollo 11", minutes: 3 }, "id2");
  assert.equal(auto.ok && "motionLevel" in auto.film, false);
  assert.equal(newFilm({ topic: "Apollo 11", minutes: 3, motionLevel: "wild" }, "id3").ok, false);
});
