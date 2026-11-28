import assert from "node:assert/strict";
import { test } from "node:test";
import { fitAdjust, namedPeople, planFit, storyStages } from "../src/shot-fit.mjs";

// The Apollo 11 voice film (e0b87efb), as heard: the launch lines, then the Moon.
const LINES = [
  "On the morning of July 16th, 1969, three men sat strapped into a capsule on top of a Saturn V rocket.",
  "Armstrong was at the instruments, Aldrin watched the clock, and Collins thought of his family.",
  "Four hundred thousand people had worked on this machine to get them off the ground.",
  "Now it came down to a single question.",
  "Would the machine hold together?",
  "Four days later the Eagle came down on the surface of the Moon.",
  "Armstrong stepped out onto the lunar dust.",
];

test("launch sentences are in the launch stage; the Moon only when the words reach the Moon", () => {
  const stages = storyStages(LINES);
  assert.deepEqual(stages.slice(0, 5), ["launch", "launch", "launch", "launch", "launch"], "a plain sentence stays in the stage before it");
  assert.equal(stages[5], "moon");
  assert.equal(stages[6], "moon");
});

test("the launch sentences do not get moon pictures, and do get launch, crew and capsule pictures", () => {
  const shots = LINES.map((sentence, i) => ({ start: i * 6, sentence }));
  const fit = planFit(shots);
  const moon = "Apollo 11 lunar surface panorama, Tranquility Base";
  const capsule = "Apollo 11 crew in the command module capsule before launch";
  const saturn = "Saturn V rocket on the launch pad, Cape Kennedy";
  for (const s of shots.slice(0, 5)) {
    const f = /** @type {any} */ (fit.get(s));
    assert.ok(fitAdjust(f, moon) < 0, `moon picture is refused for: ${s.sentence}`);
    assert.ok(fitAdjust(f, capsule) > fitAdjust(f, moon) + 4);
    assert.ok(fitAdjust(f, saturn) > 0);
  }
  const landing = /** @type {any} */ (fit.get(shots[5]));
  assert.ok(fitAdjust(landing, moon) > 0, "the landing line gets the Moon");
  assert.ok(fitAdjust(landing, saturn) < 0, "and not the launch pad");
});

test("a sentence that names a person shows that person when a picture names them", () => {
  assert.deepEqual(namedPeople(LINES[1]), ["armstrong", "aldrin", "collins"]);
  const f = { stage: "launch", people: namedPeople(LINES[1]) };
  assert.ok(fitAdjust(f, "Neil Armstrong at the instruments, Apollo 11 command module") > fitAdjust(f, "Apollo 11 command module"));
});

test("a picture with no stage word of its own is not punished", () => {
  assert.equal(fitAdjust({ stage: "launch", people: [] }, "Apollo 11 mission patch"), 0);
});
