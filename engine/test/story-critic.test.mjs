import assert from "node:assert/strict";
import test from "node:test";
import { brainPrompt, critiqueScript, numbersIn, parseBrainRead, rewriteNotes, spokenValue } from "../src/story-critic.mjs";
import { MESSAGES } from "../src/messages.mjs";

const SOURCE = `The Riverton Dam was a concrete gravity dam on the Sable River. Construction began in 1921 and the dam was finished in 1924. Engineer Martha Kell designed it to hold back 40,000 acre-feet of water for the town of Riverton.
To save money, the county cut the spillway to half its planned width. In March 1925 heavy rain filled the reservoir in three days. Water rose over the crest because the narrow spillway could not pass the flood. The dam failed on March 12, 1925, and 27 people died downstream.
An inquiry led by Samuel Ortiz found that the spillway was too small. As a result, the state passed a law in 1927 that required every dam spillway to be checked by a state engineer.`;

const GOOD = [
  { id: "C1", text: "On March 12, 1925, the Riverton Dam failed because water rose over its crest, and a wall of water ran down the Sable River. As a result, twenty-seven people died downstream. How could a new concrete dam fail only a year after it was finished? The answer begins with money." },
  { id: "C2", text: "Construction began in nineteen twenty-one. Engineer Martha Kell designed the dam to hold back forty thousand acre-feet of water for the town of Riverton. To save money, the county cut the spillway to half its planned width. That choice meant the dam had a smaller door for floodwater than its designer wanted." },
  { id: "C3", text: "In March nineteen twenty-five heavy rain filled the reservoir in three days. Water rose over the crest because the narrow spillway could not pass the flood. The dam failed, and as a result the valley below was lost." },
  { id: "C4", text: "An inquiry led by Samuel Ortiz found the reason. The new concrete dam failed because the county cut its spillway, so the flood had nowhere to go. As a result, the state passed a law in nineteen twenty-seven that required every dam spillway to be checked by a state engineer." },
];
const QUESTION = "How could a new concrete dam fail only a year after it was finished?";
const run = (acts, o = {}) => critiqueScript({ acts, sources: [SOURCE], question: QUESTION, title: "The Riverton Dam", ...o });
const codes = (r) => r.findings.map((f) => f.code);

test("spoken numbers are read as values: years, measures and decades", () => {
  assert.equal(spokenValue(["nineteen", "forty"]), 1940);
  assert.equal(spokenValue(["nineteen", "thirty", "eight"]), 1938);
  assert.equal(spokenValue(["two", "thousand", "eight", "hundred"]), 2800);
  assert.equal(spokenValue(["forty", "two"]), 42);
  assert.equal(spokenValue(["four", "point", "five"]), 4.5);
  assert.deepEqual(numbersIn("about forty-two miles, 1,250 feet, on the thirty-first").map((n) => n.value), [1250, 42, 31]);
});

test("a good script passes: causal chain, central question answered, every fact sourced, no padding", () => {
  const r = run(GOOD);
  assert.deepEqual(r.findings.map((f) => `${f.code} ${f.chapter} ${f.items.join("; ")}`), []);
  assert.equal(r.ok, true);
  assert.equal(r.stats.question, QUESTION);
});

test("an invented quote is a hard fail", () => {
  const acts = GOOD.map((a) => (a.id === "C3" ? { ...a, text: `${a.text} Kell later said, "I warned them the spillway would never hold."` } : a));
  const r = run(acts);
  const f = r.findings.find((x) => x.code === "critique.inventedQuote");
  assert.ok(f, codes(r).join(","));
  assert.equal(f.severity, "block");
  assert.equal(f.chapter, "C3");
  assert.match(f.items[0], /never hold/);
  // A quote the source has word for word is allowed.
  const real = GOOD.map((a) => (a.id === "C4" ? { ...a, text: `${a.text} The report said the "spillway was too small" for the river.` } : a));
  assert.ok(!codes(run(real)).includes("critique.inventedQuote"));
});

test("an invented number or name is a hard fail; a hedged rounding of a source number is not", () => {
  const acts = GOOD.map((a) => (a.id === "C1" ? { ...a, text: a.text.replace("twenty-seven people died", "thirty-five people died, among them farmer John Tulley,") } : a));
  const r = run(acts);
  assert.ok(codes(r).includes("critique.inventedNumber"));
  assert.match(r.findings.find((x) => x.code === "critique.inventedNumber").items[0], /thirty five/);
  assert.deepEqual(r.findings.find((x) => x.code === "critique.unsourcedName").items, ["John", "Tulley"]);
  const hedged = GOOD.map((a) => (a.id === "C1" ? { ...a, text: a.text.replace("twenty-seven people", "about twenty-five people") } : a));
  assert.ok(!codes(run(hedged)).includes("critique.inventedNumber"));
});

test("common geography outside the sources is a soft finding; a person or firm stays a hard block", () => {
  const acts = GOOD.map((a) => (a.id === "C2" ? { ...a, text: `${a.text} Rain clouds came in from the Pacific Northwest, and the dam had been planned by Hartwell Engineering for engineer Joe Brandt.` } : a));
  const r = run(acts);
  const place = r.findings.find((x) => x.code === "critique.unsourcedPlace");
  assert.equal(place?.severity, "revise");
  assert.deepEqual(place?.items, ["Pacific", "Northwest"]);
  const name = r.findings.find((x) => x.code === "critique.unsourcedName");
  assert.equal(name?.severity, "block");
  assert.deepEqual(name?.items, ["Hartwell", "Engineering", "Joe", "Brandt"]);
});

test("an act with no why fails with critique.noWhy, and goes back to that act", () => {
  const acts = GOOD.map((a) => (a.id === "C3" ? { ...a, text: "In March nineteen twenty-five heavy rain filled the reservoir in three days. Water rose over the crest. The dam failed, and as a result the valley below was lost." } : a));
  const r = run(acts);
  const f = r.findings.find((x) => x.code === "critique.noWhy");
  assert.equal(f?.chapter, "C3");
  assert.equal(r.ok, false);
  assert.deepEqual([...rewriteNotes(r.findings, acts).keys()], ["C3"]);
  // A brain that copies a real sentence holding the cause rescues the act; one that invents a sentence does not.
  const why = "Water rose over the crest.";
  assert.ok(!codes(run(acts, { brain: { chapters: [{ chapter: "C3", why }] } })).includes("critique.noWhy"));
  assert.ok(codes(run(acts, { brain: { chapters: [{ chapter: "C3", why: "The engineers ignored every warning they were given." }] } })).includes("critique.noWhy"));
});

test("a question that is never answered fails with critique.unanswered on the last act", () => {
  const acts = GOOD.map((a) => (a.id === "C4" ? { ...a, text: "Today the valley is quiet. Fishermen cast their lines below the old crest, and children swim in the river every summer, as a result of the long calm." } : a));
  const r = run(acts);
  const f = r.findings.find((x) => x.code === "critique.unanswered");
  assert.ok(f, codes(r).join(","));
  assert.equal(f.chapter, "C4");
  assert.match(f.message.en, /never answers/);
  // No question at all is its own finding.
  const none = GOOD.map((a) => (a.id === "C1" ? { ...a, text: a.text.replace(QUESTION, "It was a new concrete dam, finished a year before.") } : a));
  assert.ok(codes(run(none)).includes("critique.noQuestion"));
});

test("padded repetition fails with critique.repetition", () => {
  const pad = "Water rose over the crest because the narrow spillway could not pass the flood.";
  const acts = GOOD.map((a) => (a.id === "C4" ? { ...a, text: `${a.text} ${pad} Once again, the water rose over the crest because the narrow spillway simply could not pass the flood.` } : a));
  const r = run(acts);
  const f = r.findings.find((x) => x.code === "critique.repetition");
  assert.ok(f, codes(r).join(","));
  assert.match(f.items.join(" "), /spillway could not pass the flood/);
});

test("cliches and hedges fail as filler", () => {
  const acts = GOOD.map((a) => (a.id === "C2" ? { ...a, text: `${a.text} It stands as a testament to ambition. Little did they know what was coming.` } : a));
  const f = run(acts).findings.find((x) => x.code === "critique.filler");
  assert.ok(f);
  assert.deepEqual(f.items, ["C2: little did they know", "C2: stands as a testament", "C2: a testament to"]);
});

test("an invented story is not fact-checked (no sources) but still needs its logic", () => {
  const acts = GOOD.map((a) => (a.id === "C1" ? { ...a, text: `${a.text} Farmer John Tulley said, "Run for the hills."` } : a));
  const r = critiqueScript({ acts, sources: null, question: QUESTION });
  assert.equal(r.ok, true, codes(r).join(","));
});

test("the brain pass: a prompt that asks for exact sentences, a lenient parser, gaps only on real sentences", () => {
  const p = brainPrompt(GOOD.slice(0, 1), QUESTION);
  assert.match(p.prompt, /exact sentence/);
  assert.match(p.prompt, /ACT C1/);
  const read = parseBrainRead('Sure.\n{"chapters":[{"chapter":"C2","why":null,"what":null,"consequence":null,"gaps":[{"sentence":"That choice meant the dam had a smaller door for floodwater than its designer wanted.","problem":"the designer is not shown objecting"},{"sentence":"Invented.","problem":"x"}]}],"answer":null}');
  assert.ok(read);
  const r = run(GOOD, { brain: read });
  assert.deepEqual(codes(r), ["critique.logic"]);
  assert.equal(parseBrainRead("no json here"), null);
});

test("every critic finding has an English and a Bangla message", () => {
  for (const code of ["noWhy", "noEvent", "noConsequence", "logic", "noQuestion", "unanswered", "inventedQuote", "inventedNumber", "unsourcedName", "unsourcedPlace", "repetition", "filler", "passed", "rewrite", "stopped"]) {
    const m = MESSAGES[`critique.${code}`];
    assert.ok(m, code);
    assert.ok(m.en({ chapter: "C1", count: 1, list: "x", question: "q", round: 1, max: 2, codes: "a" }).length > 5);
    assert.ok(/[ঀ-৿]/.test(m.bn({ chapter: "C1", count: 1, list: "x", question: "q", round: 1, max: 2, codes: "a" })), code);
  }
});

import { clockTime, inventedNumbersIn, numbersIn as numbersInX, repairScript as repairX, repeatedPassages as repeatsX } from "../src/story-critic.mjs";

test("a clock time said in words matches the digits the source gives", () => {
  assert.deepEqual(clockTime(["one", "thirty"]), { hour: 1, minute: 30 });
  assert.deepEqual(clockTime(["eleven", "forty", "five"], " p.m."), { hour: 11, minute: 45 });
  assert.equal(clockTime(["twelve", "fifty"], " and the bridge"), null, "twelve fifty could be a year");
  assert.equal(clockTime(["nineteen", "forty"]), null);
  const said = numbersInX("The call came at one thirty in the morning.").map((n) => n.value);
  assert.deepEqual(said, [1, 30]);
  const known = numbersInX("The call came at 1:30 a.m.").map((n) => n.value);
  assert.equal(inventedNumbersIn("The call came at one thirty in the morning.", { known, knownSet: new Set(known) }).length, 0);
});

test("an official name said twice is not a repeat; ordinary words said twice are", () => {
  const name = "The Board of Water and Power Commissioners of the city met.";
  const acts = [{ id: "C1", text: `${name} Later, the Board of Water and Power Commissioners of the city met again.` }];
  assert.equal(repeatsX(acts).length, 0);
  const twice = [{ id: "C1", text: "The engineers checked every rivet along the lower chord of the span that night. Then the engineers checked every rivet along the lower chord of the span again." }];
  assert.ok(repeatsX(twice).length > 0);
});

test("the repair drops the invented-number sentence and the second copy, and refuses a script it would gut", () => {
  const sources = ["The dam failed at 11:57 p.m. in 1928. It held 12,000 acre feet."];
  const adj = ["tall", "grim", "quiet", "wet", "old", "proud", "tired", "stern", "pale", "brisk", "calm", "weary", "bold", "lean", "stout", "keen", "dim", "warm", "cold", "dry", "slow", "swift", "grey", "bright", "dull"];
  const noun = ["bolt", "gate", "pier", "ramp", "beam", "shaft", "valve", "spill", "chute", "wall", "dock", "tower", "yard", "mill", "road", "bank", "weir", "lock", "mast", "kiln", "forge", "loft", "barn", "shed", "cart"];
  const filler = adj.map((a, i) => `The ${a} crew inspected the ${noun[i]} beside the ${noun[(i + 7) % 25]} and wrote it down.`).join(" ");
  const acts = [{ id: "C1", text: `${filler} The dam failed in 1928 near midnight. The keeper walked the crest at 4821 paces every night before it failed. The engineers checked every rivet along the lower chord of the span that night.\n\nThe engineers checked every rivet along the lower chord of the span that night again. The dam held many acre feet.` }];
  const fx = repairX(acts, { sources });
  assert.ok(fx.ok, `share ${fx.share}`);
  assert.deepEqual(fx.removed.map((r) => r.why).sort(), ["number", "repeat"]);
  assert.ok(!/4821/.test(fx.acts[0].text) && fx.acts[0].text.includes("The dam failed in 1928"));
  const gutted = repairX([{ id: "C1", text: "The keeper counted 4821 paces. The keeper counted 9137 paces. A short line." }], { sources });
  assert.equal(gutted.ok, false);
});

test("the repair also drops the sentence the story editor named as a logic gap, and a cliche sentence", () => {
  const adj = ["tall", "grim", "quiet", "wet", "old", "proud", "tired", "stern", "pale", "brisk", "calm", "weary", "bold", "lean", "stout", "keen", "dim", "warm", "cold", "dry", "slow", "swift", "grey", "bright", "dull"];
  const noun = ["bolt", "gate", "pier", "ramp", "beam", "shaft", "valve", "spill", "chute", "wall", "dock", "tower", "yard", "mill", "road", "bank", "weir", "lock", "mast", "kiln", "forge", "loft", "barn", "shed", "cart"];
  const filler = adj.map((a, i) => `The ${a} crew inspected the ${noun[i]} beside the ${noun[(i + 7) % 25]} and wrote it down.`).join(" ");
  const gap = "When the reservoir filled, it began to push against the wall.";
  const acts = [{ id: "C1", text: `${filler} ${gap} The dam stands as a testament to the people who built it. The crew went home.` }];
  const brain = { chapters: [{ chapter: "C1", gaps: [{ sentence: gap, problem: "no cause for the collapse" }] }], answer: null };
  const fx = repairX(acts, { sources: ["The dam failed."], brain });
  assert.ok(fx.ok);
  assert.deepEqual(fx.removed.map((r) => r.why).sort(), ["filler", "logic"]);
  assert.ok(!fx.acts[0].text.includes("push against") && fx.acts[0].text.includes("The crew went home."));
});

test("the repair drops a sentence with a name or place no source has", () => {
  const adj = ["tall", "grim", "quiet", "wet", "old", "proud", "tired", "stern", "pale", "brisk", "calm", "weary", "bold", "lean", "stout", "keen", "dim", "warm", "cold", "dry", "slow", "swift", "grey", "bright", "dull"];
  const noun = ["bolt", "gate", "pier", "ramp", "beam", "shaft", "valve", "spill", "chute", "wall", "dock", "tower", "yard", "mill", "road", "bank", "weir", "lock", "mast", "kiln", "forge", "loft", "barn", "shed", "cart"];
  const filler = adj.map((a, i) => `The ${a} crew inspected the ${noun[i]} beside the ${noun[(i + 7) % 25]} and wrote it down.`).join(" ");
  const acts = [{ id: "C1", text: `${filler} The foreman wrote to Edison about the plan. The crew went home.` }];
  const fx = repairX(acts, { sources: ["The foreman Mulholland built the dam."], title: "The Dam" });
  assert.ok(fx.ok);
  assert.deepEqual(fx.removed.map((r) => r.why), ["name"]);
  assert.ok(!fx.acts[0].text.includes("Edison"));
});
